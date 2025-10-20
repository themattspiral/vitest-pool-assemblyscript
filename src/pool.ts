import type { ProcessPool, Vitest } from 'vitest/node';
import { createFileTask } from '@vitest/runner/utils';
import type { RunnerTestCase } from 'vitest';
import { readFile } from 'fs/promises';

import { compileAssemblyScript } from './compiler.js';
import { discoverTests, executeTests } from './executor.js';
import type { PoolOptions } from './types.js';
import { setDebug, debug } from './utils/debug.mjs';

/**
 * AssemblyScript Pool for Vitest
 *
 * Per-Test Crash Isolation Architecture:
 * 1. collectTests(): Compile → Discover tests via callbacks → Cache binary
 * 2. runTests(): Reuse cached binary → Execute each test in fresh WASM instance
 * 3. Invalidation: Clear cache for changed files
 *
 * Key features:
 * - Per-test isolation: Each test runs in fresh WASM instance (~0.43ms overhead)
 * - Crash safe: One test aborting doesn't kill subsequent tests
 * - Import-based discovery: Tests register via __register_test callback during _start
 * - No double compilation: Binary cached between collect → run phases
 * - Supports whatever test patterns AS supports (limited by lack of closures)
 *
 * Instrumentation:
 * - Binaryen post-processing injects __execute_function() for test execution
 * - Binaryen post-processing injects __coverage_trace() for coverage (when enabled)
 */

// Cache compiled WASM binaries and source maps between collectTests() and runTests()
interface CachedCompilation {
  binary: Uint8Array;
  sourceMap: string | null;
}
const compilationCache = new Map<string, CachedCompilation>();

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Read pool options and initialize debug mode
  const options = (ctx.config.poolOptions?.assemblyScript as PoolOptions) ?? {};
  setDebug(options.debug ?? false);

  debug('[Pool] Initializing AssemblyScript pool');

  return {
    name: 'vitest-pool-assemblyscript',

    /**
     * Discover tests by compiling and executing WASM
     * Called for `vitest list` and before `runTests`
     */
    async collectTests(specs) {
      debug('[Pool] collectTests called for', specs.length, 'specs');

      for (const [project, testFile] of specs) {
        debug('[Pool] Collecting tests from:', testFile);

        try {
          // 1. Read source
          const source = await readFile(testFile, 'utf-8');

          // 2. Compile AS → WASM
          const { binary, sourceMap, error } = await compileAssemblyScript(source, testFile);

          if (error) {
            debug('[Pool] Compilation failed:', error.message);
            // TODO: Report compilation error to Vitest
            continue;
          }

          // 3. Cache binary and source map for runTests
          compilationCache.set(testFile, { binary, sourceMap });
          debug('[Pool] Cached compilation for:', testFile);

          // 4. Execute WASM to discover test names
          const discoveredTests = await discoverTests(binary, testFile);
          debug('[Pool] Discovered', discoveredTests.length, 'tests:', discoveredTests);

          // 5. Create file task structure
          const fileTask = createFileTask(
            testFile,
            project.config.root,
            project.getName(),
            'assemblyscript'
          );

          fileTask.mode = 'run';

          // 6. Add test tasks
          for (const testName of discoveredTests) {
            const testTask: RunnerTestCase = {
              type: 'test',
              name: testName,
              id: `${fileTask.id}_${testName}`,
              context: {} as any,
              suite: fileTask,
              mode: 'run',
              meta: {},
              file: fileTask,
              timeout: project.config.testTimeout,
              annotations: [],
            };
            fileTask.tasks.push(testTask);
          }

          // 7. Report to Vitest
          ctx.state.collectFiles(project, [fileTask]);
          debug('[Pool] Reported file task for:', testFile);

        } catch (error) {
          debug('[Pool] Error collecting tests from', testFile, ':', error);
        }
      }

      debug('[Pool] collectTests completed');
    },

    /**
     * Run tests using cached binaries
     * Executes with full imports for real-time reporting
     */
    async runTests(specs, invalidates) {
      debug('[Pool] runTests called for', specs.length, 'specs');
      debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

      // Clear cache for invalidated files
      if (invalidates) {
        for (const file of invalidates) {
          if (compilationCache.has(file)) {
            compilationCache.delete(file);
            debug('[Pool] Cleared cache for:', file);
          }
        }
      }

      // Process each test file
      for (const [project, testFile] of specs) {
        debug('[Pool] Running tests in:', testFile);

        try {
          // 1. Get cached compilation or compile
          let compilation = compilationCache.get(testFile);

          if (!compilation) {
            debug('[Pool] Compilation not cached, compiling:', testFile);
            const source = await readFile(testFile, 'utf-8');
            const result = await compileAssemblyScript(source, testFile);

            if (result.error) {
              debug('[Pool] Compilation failed:', result.error.message);
              continue;
            }

            compilation = { binary: result.binary, sourceMap: result.sourceMap };
            compilationCache.set(testFile, compilation);
          } else {
            debug('[Pool] Using cached compilation for:', testFile);
          }

          // 2. Execute tests with full reporting
          const results = await executeTests(compilation.binary, compilation.sourceMap, testFile);

          debug('[Pool] Test execution results:', {
            file: testFile,
            tests: results.tests.length,
            passed: results.tests.filter(t => t.passed).length,
            failed: results.tests.filter(t => !t.passed).length,
          });

          // 3. Create file task with results
          const fileTask = createFileTask(
            testFile,
            project.config.root,
            project.getName(),
            'assemblyscript'
          );

          fileTask.mode = 'run';
          fileTask.result = {
            state: results.tests.every(t => t.passed) ? 'pass' : 'fail',
          };

          // 4. Add test results
          for (const testResult of results.tests) {
            const testTask: RunnerTestCase = {
              type: 'test',
              name: testResult.name,
              id: `${fileTask.id}_${testResult.name}`,
              context: {} as any,
              suite: fileTask,
              mode: 'run',
              meta: {},
              file: fileTask,
              timeout: project.config.testTimeout,
              annotations: [],
              result: {
                state: testResult.passed ? 'pass' : 'fail',
                errors: testResult.error ? [testResult.error] : undefined,
              },
            };
            fileTask.tasks.push(testTask);
          }

          // 5. Report to Vitest
          ctx.state.collectFiles(project, [fileTask]);

          // Update individual task results (TaskResultPack format: [id, result, meta])
          const taskPacks = fileTask.tasks.map((task): [string, typeof task.result, typeof task.meta] => [
            task.id,
            task.result,
            task.meta
          ]);
          ctx.state.updateTasks(taskPacks);

          debug('[Pool] Reported test results for:', testFile);

        } catch (error) {
          debug('[Pool] Error running tests in', testFile, ':', error);
        }
      }

      debug('[Pool] runTests completed');
    },

    /**
     * Cleanup when shutting down
     */
    async close() {
      debug('[Pool] Closing pool, clearing cache');
      compilationCache.clear();
    },
  };
}


