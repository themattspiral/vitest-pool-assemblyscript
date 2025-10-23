/**
 * WASM Test Executor
 *
 * Handles execution of compiled WASM test binaries:
 * - Test discovery (query test registry)
 * - Test execution (per-test crash isolation)
 * - WASM import object creation
 * - Error source location mapping (V8 stack traces + source maps)
 */

import { createMemory } from '../utils/wasm-memory.js';
import type { TestResult, ExecutionResults, CoverageData, DiscoveredTest, TestExecutionCallbacks } from '../types.js';
import { debug, debugError } from '../utils/debug.mjs';
import type { RawSourceMap } from 'source-map';
import {
  createDiscoveryImports,
  createTestExecutionImports,
  createCoverageCollectionImports,
} from './imports.js';
import { enhanceErrorWithSourceMap } from './errors.js';

// ============================================================================
// Execution Helpers
// ============================================================================

/**
 * Execute coverage-only collection pass (used when in dual coverage mode)
 *
 * Re-runs a single test on instrumented binary to collect accurate coverage data.
 * Only used in dual mode - single mode collects coverage during normal execution.
 * Ignores test failures - we only care about coverage.
 *
 * @param coverageModule - Compiled instrumented WASM module
 * @param fnIndex - Function index of the test to execute
 * @returns Coverage data for this test
 */
async function executeCoveragePass(
  coverageModule: WebAssembly.Module,
  fnIndex: number
): Promise<CoverageData> {
  const coverage: CoverageData = {
    functions: {},
    blocks: {},
  };

  const memory = createMemory();
  const importObject = createCoverageCollectionImports(memory, coverage);

  try {
    const instance = new WebAssembly.Instance(coverageModule, importObject);
    const exports = instance.exports as any;

    // Call _start to register tests
    if (typeof exports._start === 'function') {
      exports._start();
    }

    // Execute test via function table
    if (exports.table && typeof exports.table.get === 'function') {
      const testFn = exports.table.get(fnIndex);
      if (testFn) {
        testFn();
      }
    }
  } catch (error) {
    // Ignore errors during coverage collection (test may fail, we just want coverage)
  }

  return coverage;
}

/**
 * Finalize test result with source maps and coverage
 *
 * Handles the normal test completion path:
 * - Enhances errors with source map locations
 * - Collects coverage when in dual mode (re-runs test on instrumented binary)
 * - Assigns coverage data to test result
 *
 * @param testResult - Test result to finalize
 * @param singleModeCoverage - Coverage collected during test execution (single mode)
 * @param sourceMapJson - Parsed source map (null if not available)
 * @param coverageModule - Instrumented WASM module (null if not in dual mode)
 * @param fnIndex - Function index of the test
 * @param testFileName - Name of the test file being executed (for error location filtering)
 * @returns Finalized test result
 */
async function finalizeTestResult(
  testResult: TestResult,
  singleModeCoverage: CoverageData,
  sourceMapJson: RawSourceMap | null,
  coverageModule: WebAssembly.Module | null,
  fnIndex: number,
  testFileName: string
): Promise<TestResult> {
  // Map call stack to source locations if available
  if (sourceMapJson && testResult.rawCallStack) {
    await enhanceErrorWithSourceMap(testResult, sourceMapJson, testFileName);
  }

  // Collect coverage: dual mode re-runs test on instrumented binary, single mode uses existing data
  if (coverageModule) {
    debug('[Executor] Dual mode: Collecting coverage from instrumented binary');
    testResult.coverage = await executeCoveragePass(coverageModule, fnIndex);
  } else {
    testResult.coverage = singleModeCoverage;
  }

  return testResult;
}

/**
 * Create test result for initialization crash
 *
 * Handles crashes that occur before test execution (during _start() or table.get()).
 * Does NOT attempt coverage collection - initialization likely failed on instrumented binary too.
 *
 * @param testName - Name of the test that crashed
 * @param singleModeCoverage - Coverage collected before crash (likely empty)
 * @returns Failed test result
 */
function createInitializationCrashResult(
  testName: string,
  singleModeCoverage: CoverageData
): TestResult {
  return {
    name: testName,
    passed: false,
    error: new Error('Test crashed during initialization'),
    assertionsPassed: 0,
    assertionsFailed: 0,
    coverage: singleModeCoverage,
  };
}

// ============================================================================
// Public Exports
// ============================================================================

/**
 * Discover tests via registration callbacks
 *
 * Process:
 * 1. Instantiate WASM with import callbacks
 * 2. Call _start() to run top-level code
 * 3. test() calls invoke __register_test callback with name and function index
 * 4. Return array of test objects with names and function indices
 *
 * @param binary - Compiled WASM binary
 * @param filename - Source filename (for error messages)
 * @returns Array of discovered tests with names and function indices
 */
export async function discoverTests(
  binary: Uint8Array,
  _filename: string
): Promise<DiscoveredTest[]> {
  const tests: DiscoveredTest[] = [];
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();
  const importObject = createDiscoveryImports(memory, tests);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as any;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    exports._start();
  }

  debug('[Executor] Discovered', tests.length, 'tests');
  return tests;
}

/**
 * Execute tests and collect coverage with per-test crash isolation
 *
 * Each test runs in a fresh WASM instance for maximum safety:
 * - Crashes don't affect subsequent tests
 * - Clean state for each test
 * - <1ms overhead per test (negligible)
 *
 * Supports dual-binary mode for accurate errors + coverage:
 * - Execute tests on clean binary (accurate error locations)
 * - Collect coverage from instrumented binary (if provided)
 *
 * @param binary - Compiled WASM binary (clean or instrumented)
 * @param sourceMap - Source map JSON string (null if not available)
 * @param coverageBinary - Optional instrumented binary for coverage collection (dual mode)
 * @param discoveredTests - Pre-discovered tests from collectTests phase
 * @param filename - Source filename (for error messages)
 * @param callbacks - Optional callbacks for per-test lifecycle reporting (onTestStart, onTestFinished)
 * @returns Execution results with all test outcomes
 */
export async function executeTestsAndCollectCoverage(
  binary: Uint8Array,
  sourceMap: string | null,
  coverageBinary: Uint8Array | null | undefined,
  discoveredTests: DiscoveredTest[],
  filename: string,
  callbacks?: TestExecutionCallbacks
): Promise<ExecutionResults> {
  const results: TestResult[] = [];

  // Compile main binary module once (reused for all test instances)
  const module = await WebAssembly.compile(binary as BufferSource);

  // Compile coverage binary module if provided (dual mode)
  const coverageModule = coverageBinary ? await WebAssembly.compile(coverageBinary as BufferSource) : null;
  if (coverageModule) {
    debug('[Executor] Dual mode: Using clean binary for execution, coverage binary for coverage collection');
  }

  // Parse source map once (used for all errors in this file)
  const sourceMapJson: RawSourceMap | null = sourceMap ? JSON.parse(sourceMap) : null;
  if (sourceMapJson) {
    debug('[Executor] Source map available for error location mapping');
  }

  debug('[Executor] Executing', discoveredTests.length, 'tests with per-test isolation');

  // Execute each test in a fresh WASM instance
  for (let i = 0; i < discoveredTests.length; i++) {
    const { name: testName, fnIndex } = discoveredTests[i]!;
    // Create fresh memory for this test instance
    const memory = createMemory();

    // Create coverage tracking for this test (used in single-binary mode)
    const singleModeCoverage: CoverageData = {
      functions: {},
      blocks: {},
    };

    // Mutable reference for import callbacks to update
    const currentTestRef: { value: TestResult | null } = { value: null };

    // Create import object with appropriate callbacks
    const importObject = createTestExecutionImports(memory, currentTestRef, singleModeCoverage);

    // Instantiate fresh WASM instance for this test
    const instance = new WebAssembly.Instance(module, importObject);
    const exports = instance.exports as any;

    // Call _start to run top-level code (registers tests)
    if (typeof exports._start === 'function') {
      exports._start();
    }

    // Execute this specific test
    try {
      // Create test result object with timing
      const startTime = Date.now();

      // Call onTestStart callback before execution
      if (callbacks?.onTestStart) {
        await callbacks.onTestStart(testName, i);
      }

      currentTestRef.value = {
        name: testName,
        passed: true,
        assertionsPassed: 0,
        assertionsFailed: 0,
        startTime,
      };

      // Execute test function via function table (AS compiler --exportTable flag)
      if (exports.table && typeof exports.table.get === 'function') {
        const testFn = exports.table.get(fnIndex);
        if (!testFn) {
          throw new Error(`Test function at index ${fnIndex} not found in function table`);
        }
        testFn();
      } else {
        throw new Error('Function table not found in WASM exports (missing --exportTable flag?)');
      }

      // Calculate duration
      const endTime = Date.now();
      currentTestRef.value.duration = endTime - startTime;

      // If we reach here, test passed (no abort occurred)

    } catch (error) {
      debugError('[Executor] Error during test execution:', error);
      // Error should be captured in currentTestRef.value via abort handler
      if (currentTestRef.value !== null) {
        // Calculate duration even on error
        if (currentTestRef.value.startTime && !currentTestRef.value.duration) {
          currentTestRef.value.duration = Date.now() - currentTestRef.value.startTime;
        }

        if (currentTestRef.value.passed) {
          // If not already marked as failed, mark it now
          currentTestRef.value.passed = false;
          currentTestRef.value.error = error as Error;
        }
      }
    }

    // Finalize test result: source maps + coverage
    const finalResult = currentTestRef.value
      ? await finalizeTestResult(currentTestRef.value, singleModeCoverage, sourceMapJson, coverageModule, fnIndex, filename)
      : createInitializationCrashResult(testName, singleModeCoverage);

    // Call onTestFinished callback after finalization
    if (callbacks?.onTestFinished) {
      await callbacks.onTestFinished(testName, i, finalResult);
    }

    results.push(finalResult);
  }

  return { tests: results };
}
