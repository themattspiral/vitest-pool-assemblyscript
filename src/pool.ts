import type { ProcessPool, Vitest } from 'vitest/node';
import { createFileTask } from '@vitest/runner/utils';
import type { RunnerTestCase } from 'vitest';
import { readFile } from 'fs/promises';

import { compileAssemblyScript } from './compiler.js';
import { discoverTests, executeTests } from './executor.js';
import type { PoolOptions, CachedCompilation, FileCoverageData } from './types.js';
import { setDebug, debug } from './utils/debug.mjs';
import { aggregateCoverage, generateMultiFileLCOV } from './coverage/lcov-reporter.js';
import { writeFile, mkdir } from 'fs/promises';

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
 * Coverage modes:
 * - false: No coverage - Fast, accurate errors
 * - true: Coverage only - Fast, broken errors on failure
 * - 'dual': Both coverage AND accurate errors - Slower (2x)
 *
 * Instrumentation:
 * - Test execution via --exportTable (function table export)
 * - Coverage via Binaryen __coverage_trace() injection (when enabled)
 */

// Cache compiled WASM binaries and source maps between collectTests() and runTests()
const compilationCache = new Map<string, CachedCompilation>();

// Accumulate coverage data across all test files for single LCOV report
const coverageMap = new Map<string, FileCoverageData>();

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

          // 2. Compile AS → WASM (with coverage if enabled)
          const result = await compileAssemblyScript(source, testFile, {
            coverage: options.coverage ?? 'dual',
          });

          if (result.error) {
            debug('[Pool] Compilation failed:', result.error.message);
            // TODO: Report compilation error to Vitest
            continue;
          }

          const { binary, sourceMap, coverageBinary, debugInfo } = result;

          // 3. Cache binary, source map, coverage binary, and debug info for runTests
          compilationCache.set(testFile, { binary, sourceMap, coverageBinary, debugInfo });
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
            const result = await compileAssemblyScript(source, testFile, {
              coverage: options.coverage ?? 'dual',
            });

            if (result.error) {
              debug('[Pool] Compilation failed:', result.error.message);
              continue;
            }

            compilation = { binary: result.binary, sourceMap: result.sourceMap, coverageBinary: result.coverageBinary, debugInfo: result.debugInfo };
            compilationCache.set(testFile, compilation);
          } else {
            debug('[Pool] Using cached compilation for:', testFile);
          }

          // 2. Execute tests with full reporting (pass coverageBinary for dual mode)
          const results = await executeTests(
            compilation.binary,
            compilation.sourceMap,
            compilation.coverageBinary ?? null,
            testFile
          );

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

          // 6. Accumulate coverage data for this file (will write single LCOV at end)
          if (options.coverage && compilation.debugInfo) {
            const coverageDataList = results.tests
              .map(t => t.coverage)
              .filter((c): c is NonNullable<typeof c> => c !== undefined);

            if (coverageDataList.length > 0) {
              debug('[Pool] Accumulating coverage for:', testFile);

              const aggregated = aggregateCoverage(coverageDataList);
              coverageMap.set(testFile, {
                coverage: aggregated,
                debugInfo: compilation.debugInfo,
              });
            }
          }

        } catch (error) {
          debug('[Pool] Error running tests in', testFile, ':', error);
        }
      }

      // 7. Write single LCOV file with all coverage data
      if (options.coverage && coverageMap.size > 0) {
        debug('[Pool] Writing combined LCOV report for', coverageMap.size, 'files');

        const lcov = generateMultiFileLCOV(coverageMap);

        // Write to standard coverage directory
        const coverageDir = 'coverage';
        const lcovPath = `${coverageDir}/lcov.info`;

        await mkdir(coverageDir, { recursive: true });
        await writeFile(lcovPath, lcov, 'utf-8');

        debug('[Pool] LCOV report written to:', lcovPath);
      }

      debug('[Pool] runTests completed');
    },

    /**
     * Cleanup when shutting down
     */
    async close() {
      debug('[Pool] Closing pool, clearing cache');
      compilationCache.clear();
      coverageMap.clear();
    },
  };
}


