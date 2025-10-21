import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestCase, RunnerTestFile } from 'vitest/node';
import type { TaskResultPack } from '@vitest/runner';
import { createFileTask } from '@vitest/runner/utils';

import type { PoolOptions, CachedCompilation, FileCoverageData, TestResult } from './types.js';
import { compileAssemblyScript } from './compiler.js';
import { discoverTests, executeTestsAndCollectCoverage } from './executor.js';
import { setDebug, debug } from './utils/debug.mjs';
import { aggregateCoverage, writeCoverageReport } from './coverage/lcov-reporter.js';

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

// Pool name used for Vitest file tasks
const POOL_NAME = 'assemblyscript';

// Cache compiled WASM binaries and source maps between collectTests() and runTests()
const compilationCache = new Map<string, CachedCompilation>();

// Accumulate coverage data across all test files for single LCOV report
const coverageMap = new Map<string, FileCoverageData>();

/**
 * Create a Vitest test case for a single test
 *
 * @param testName - Name of the test
 * @param fileTask - Parent file task
 * @param project - Vitest project
 * @param testResult - Optional test result (for runTests phase)
 * @returns Configured test case
 */
function createTestCase(
  testName: string,
  fileTask: RunnerTestFile,
  project: TestProject,
  testResult?: TestResult
): RunnerTestCase {
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

  // Add result if provided (runTests phase)
  if (testResult) {
    testTask.result = {
      state: testResult.passed ? 'pass' : 'fail',
      errors: testResult.error ? [testResult.error] : undefined,
    };
  }

  return testTask;
}

/**
 * Get cached compilation or compile if not cached
 *
 * @param testFile - Path to test file
 * @param options - Pool options (for coverage mode)
 * @returns Compilation result or error (union type for consistency with compileAssemblyScript)
 */
async function getOrCompileCachedModule(
  testFile: string,
  options: PoolOptions
): Promise<{ compilation: CachedCompilation } | { error: Error }> {
  const cached = compilationCache.get(testFile);

  if (cached) {
    debug('[Pool] Using cached compilation for:', testFile);
    return { compilation: cached };
  }

  debug('[Pool] Compilation not cached, compiling:', testFile);
  const result = await compileAssemblyScript(testFile, {
    coverage: options.coverage ?? 'dual',
  });

  if (result.error) {
    debug('[Pool] Compilation failed:', result.error.message);
    return { error: result.error };
  }

  const compilation: CachedCompilation = {
    binary: result.binary,
    sourceMap: result.sourceMap,
    coverageBinary: result.coverageBinary,
    debugInfo: result.debugInfo,
    discoveredTests: []
  };

  compilationCache.set(testFile, compilation);
  return { compilation };
}

/**
 * Clear compilation cache for invalidated files
 *
 * @param invalidates - List of invalidated file paths
 */
function handleCacheInvalidations(invalidates: string[] | undefined): void {
  if (!invalidates) return;

  for (const file of invalidates) {
    if (compilationCache.has(file)) {
      compilationCache.delete(file);
      debug('[Pool] Cleared cache for:', file);
    }
  }
}

/**
 * Accumulate coverage data for a single file
 *
 * @param results - Test execution results
 * @param compilation - Cached compilation with debug info
 * @param testFile - Path to test file
 * @param options - Pool options
 */
function accumulateFileCoverage(
  results: { tests: TestResult[] },
  compilation: CachedCompilation,
  testFile: string,
  options: PoolOptions
): void {
  if (!options.coverage || !compilation.debugInfo) return;

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

/**
 * Report test results to Vitest
 *
 * @param fileTask - File task with test results
 * @param project - Vitest project
 * @param ctx - Vitest context
 */
function reportTestResults(fileTask: RunnerTestFile, project: TestProject, ctx: Vitest): void {
  ctx.state.collectFiles(project, [fileTask]);

  // Update individual task results (TaskResultPack format: [id, result, meta])
  const taskPacks: TaskResultPack[] = fileTask.tasks.map(task => {
    return [task.id, task.result, task.meta];
  });
  ctx.state.updateTasks(taskPacks);

  debug('[Pool] Reported test results for:', fileTask.filepath);
}

/**
 * Collect tests from a single file
 *
 * Compiles AssemblyScript, discovers tests, creates Vitest file task structure,
 * and reports to Vitest for the collect phase.
 *
 * @param project - Vitest project
 * @param testFile - Path to test file
 * @param options - Pool options
 * @param ctx - Vitest context
 */
async function collectTestsFromFile(
  project: TestProject,
  testFile: string,
  options: PoolOptions,
  ctx: Vitest
): Promise<void> {
  // 1. Compile AS → WASM (with coverage if enabled)
  // cache is empty during collect phase, so will always compile
  const compilationResult = await getOrCompileCachedModule(testFile, options);
  if ('error' in compilationResult) {
    debug('[Pool] Skipping file due to compilation error:', testFile);
    // TODO: Report compilation error to Vitest
    return;
  }

  const compilation = compilationResult.compilation;

  // 2. Execute WASM to discover test names (and cache for runTests phase)
  const discoveredTests = await discoverTests(compilation.binary, testFile);
  compilation.discoveredTests = discoveredTests; // Cache for runTests phase
  debug('[Pool] Discovered', discoveredTests.length, 'tests:', discoveredTests.map(t => t.name));

  // 3. Create Vitest file task structure (container for test cases)
  const fileTask = createFileTask(
    testFile,
    project.config.root,
    project.name,
    POOL_NAME
  );

  fileTask.mode = 'run';

  // 4. Add test tasks
  for (const test of discoveredTests) {
    const testTask = createTestCase(test.name, fileTask, project);
    fileTask.tasks.push(testTask);
  }

  // 5. Report to Vitest
  ctx.state.collectFiles(project, [fileTask]);
  debug('[Pool] Reported file task for:', testFile);
}

/**
 * Run tests in a single file
 *
 * Gets cached compilation, executes tests, creates file task with results,
 * and reports to Vitest for the run phase. Accumulates coverage if enabled.
 *
 * @param project - Vitest project
 * @param testFile - Path to test file
 * @param options - Pool options
 * @param ctx - Vitest context
 */
async function runTestsInFile(
  project: TestProject,
  testFile: string,
  options: PoolOptions,
  ctx: Vitest
): Promise<void> {
  // 1. Compile (or get cached) AS → WASM (with coverage if enabled)
  const compilationResult = await getOrCompileCachedModule(testFile, options);
  if ('error' in compilationResult) {
    debug('[Pool] Skipping file due to compilation error:', testFile);
    // TODO: Report compilation error to Vitest
    return;
  }

  const compilation = compilationResult.compilation;

  // 2. Discover tests (cached from collectTests if available, otherwise discover now)
  // Both collectTests and runTests must discover - collectTests reports without executing,
  // runTests discovers and executes. Cache optimizes when both phases run (watch mode).
  if (compilation.discoveredTests.length === 0) {
    compilation.discoveredTests = await discoverTests(compilation.binary, testFile);
    debug('[Pool] Discovered', compilation.discoveredTests.length, 'tests');
  }

  // 3. Execute tests with full reporting
  const results = await executeTestsAndCollectCoverage(
    compilation.binary,
    compilation.sourceMap,
    compilation.coverageBinary ?? null,
    compilation.discoveredTests,
    testFile
  );

  debug('[Pool] Test execution results:', {
    file: testFile,
    tests: results.tests.length,
    passed: results.tests.filter((t: TestResult) => t.passed).length,
    failed: results.tests.filter((t: TestResult) => !t.passed).length,
  });

  // 4. Create Vitest file task structure (container for test cases)
  const fileTask = createFileTask(
    testFile,
    project.config.root,
    project.name,
    POOL_NAME
  );

  fileTask.mode = 'run';
  fileTask.result = {
    state: results.tests.every((t: TestResult) => t.passed) ? 'pass' : 'fail',
  };

  // 5. Add test results
  for (const testResult of results.tests) {
    const testTask = createTestCase(testResult.name, fileTask, project, testResult);
    fileTask.tasks.push(testTask);
  }

  // 6. Report to Vitest
  reportTestResults(fileTask, project, ctx);

  // 7. Accumulate coverage data for this file (will write single LCOV at end)
  accumulateFileCoverage(results, compilation, testFile, options);
}

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Read pool options and initialize debug mode
  const options = (ctx.config.poolOptions?.assemblyScript as PoolOptions) ?? {};
  setDebug(options.debug ?? false);

  debug('[Pool] Initializing AssemblyScript pool');

  return {
    name: 'vitest-pool-assemblyscript',

    /**
     * Discover tests by compiling and executing WASM
     * Called for `vitest list` command and in watch mode
     */
    async collectTests(specs: TestSpecification[]) {
      debug('[Pool] collectTests called for', specs.length, 'specs');

      for (const [project, testFile] of specs) {
        debug('[Pool] Collecting tests from:', testFile);

        try {
          await collectTestsFromFile(project, testFile, options, ctx);
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
    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      debug('[Pool] runTests called for', specs.length, 'specs');
      debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

      // Clear cache for invalidated files
      handleCacheInvalidations(invalidates);

      // Process each test file
      for (const [project, testFile] of specs) {
        debug('[Pool] Running tests in:', testFile);

        try {
          await runTestsInFile(project, testFile, options, ctx);
        } catch (error) {
          debug('[Pool] Error running tests in', testFile, ':', error);
        }
      }

      // Write single LCOV file with all coverage data
      if (options.coverage && coverageMap.size > 0) {
        await writeCoverageReport(coverageMap, 'coverage/lcov.info');
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


