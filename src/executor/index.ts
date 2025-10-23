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
import type { TestResult, ExecutionResults, CoverageData, DiscoveredTest, DiscoveryResult, TestExecutionCallbacks } from '../types.js';
import { debug, debugError } from '../utils/debug.mjs';
import type { RawSourceMap } from 'source-map';
import {
  createDiscoveryImports,
  createTestExecutionImports,
  createCoverageCollectionImports,
} from './imports.js';
import { enhanceErrorWithSourceMap } from './errors.js';

// ============================================================================
// Local Types
// ============================================================================

/**
 * Cache for lazy-compiled coverage module
 * Used to compile the coverage binary only once (on first test) and reuse for all subsequent tests
 */
interface CompiledModuleCache {
  module: WebAssembly.Module | null;
}

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
 * The coverage module is pre-compiled once before all tests, then reused for each test.
 * Coverage passes run in parallel with source map processing for better performance.
 *
 * @param coverageBinary - Instrumented WASM binary (unused, kept for signature compatibility)
 * @param fnIndex - Function index of the test to execute
 * @param compiledModuleCache - Pre-compiled coverage module (compiled once, reused for all tests)
 * @returns Coverage data for this test
 */
async function executeCoveragePass(
  _coverageBinary: Uint8Array,
  fnIndex: number,
  compiledModuleCache: CompiledModuleCache
): Promise<CoverageData> {
  // Module is pre-compiled in executeTestsAndCollectCoverage()
  if (!compiledModuleCache.module) {
    throw new Error('Coverage module not pre-compiled (bug in executor)');
  }

  const coverageModule = compiledModuleCache.module;
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
 * @returns Discovery result with tests and compiled module (for reuse in execution)
 */
export async function discoverTests(
  binary: Uint8Array,
  _filename: string
): Promise<DiscoveryResult> {
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
  return { tests, module };
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
 * @param preCompiledModule - Optional pre-compiled module (avoids re-compilation if provided)
 * @returns Execution results with all test outcomes
 */
export async function executeTestsAndCollectCoverage(
  binary: Uint8Array,
  sourceMap: string | null,
  coverageBinary: Uint8Array | null | undefined,
  discoveredTests: DiscoveredTest[],
  filename: string,
  callbacks?: TestExecutionCallbacks,
  preCompiledModule?: WebAssembly.Module
): Promise<ExecutionResults> {
  const results: TestResult[] = [];

  // Use pre-compiled module if provided, otherwise compile the binary
  const module = preCompiledModule ?? await WebAssembly.compile(binary as BufferSource);
  if (preCompiledModule) {
    debug('[Executor] Using pre-compiled module (skipping re-compilation)');
  }

  // Parse source map once (used for all errors in this file)
  const sourceMapJson: RawSourceMap | null = sourceMap ? JSON.parse(sourceMap) : null;
  if (sourceMapJson) {
    debug('[Executor] Source map available for error location mapping');
  }

  debug('[Executor] Executing', discoveredTests.length, 'tests with per-test isolation');

  // Note: In dual mode, we compile coverage binary upfront and run coverage passes in parallel
  // with test execution for better performance on multi-core systems
  const coverageModuleCache: CompiledModuleCache = { module: null };

  // Pre-compile coverage binary if in dual mode (allows parallel execution)
  if (coverageBinary) {
    debug('[Executor] Dual mode: Pre-compiling coverage binary for parallel execution');
    coverageModuleCache.module = await WebAssembly.compile(coverageBinary as BufferSource);
  }

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

    // Finalize test result: Run source mapping and coverage in parallel when possible
    let finalResult: TestResult;
    if (currentTestRef.value) {
      const testResult = currentTestRef.value;

      // Start both operations in parallel
      const sourceMappingPromise = sourceMapJson && testResult.rawCallStack
        ? enhanceErrorWithSourceMap(testResult, sourceMapJson, filename)
        : Promise.resolve();

      const coveragePromise = coverageBinary
        ? executeCoveragePass(coverageBinary, fnIndex, coverageModuleCache)
        : Promise.resolve(singleModeCoverage);

      // Wait for both to complete
      const [, coverage] = await Promise.all([sourceMappingPromise, coveragePromise]);
      testResult.coverage = coverage;
      finalResult = testResult;
    } else {
      finalResult = createInitializationCrashResult(testName, singleModeCoverage);
    }

    // Call onTestFinished callback after finalization
    if (callbacks?.onTestFinished) {
      await callbacks.onTestFinished(testName, i, finalResult);
    }

    results.push(finalResult);
  }

  return { tests: results };
}
