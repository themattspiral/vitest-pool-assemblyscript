/**
 * WASM Test Executor
 *
 * Handles execution of compiled WASM test binaries:
 * - Test discovery (query test registry)
 * - Test execution (per-test crash isolation)
 * - WASM import object creation
 * - Error source location mapping (V8 stack traces + source maps)
 */

import { createMemory, decodeString, decodeAbortInfo } from './utils/wasm-memory.js';
import type { TestResult, ExecutionResults, CoverageData, DiscoveredTest } from './types.js';
import { debug, debugError } from './utils/debug.mjs';
import { extractCallStack, createWebAssemblyCallSite } from './utils/source-maps.js';
import type { RawSourceMap } from 'source-map';

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Track coverage for a function and block
 * Shared implementation used by both test execution and coverage collection imports
 *
 * @param coverage - Coverage data collector
 * @param funcIdx - Function index
 * @param blockIdx - Block index within function
 */
function trackCoverage(coverage: CoverageData, funcIdx: number, blockIdx: number): void {
  // Track function-level coverage
  const funcCount = coverage.functions.get(funcIdx) || 0;
  coverage.functions.set(funcIdx, funcCount + 1);

  // Track block-level coverage
  const blockKey = `${funcIdx}:${blockIdx}`;
  const blockCount = coverage.blocks.get(blockKey) || 0;
  coverage.blocks.set(blockKey, blockCount + 1);
}

/**
 * Decode and log abort information
 * Shared helper for abort handlers across different import objects
 *
 * @param memory - WebAssembly memory instance
 * @param msgPtr - Pointer to abort message
 * @param filePtr - Pointer to file name
 * @param line - Line number
 * @param column - Column number
 * @param context - Context string for log message (e.g., "during discovery", "during execution")
 * @returns Decoded abort info
 */
function logAbort(
  memory: WebAssembly.Memory,
  msgPtr: number,
  filePtr: number,
  line: number,
  column: number,
  context: string
): { message: string; location: string | null } {
  const abortInfo = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
  debugError(`[Executor] Abort ${context}: ${abortInfo.message}${abortInfo.location ? ` at ${abortInfo.location}` : ''}`);
  return abortInfo;
}

// ============================================================================
// Import Object Creators
// ============================================================================

/**
 * Create import object for test discovery
 *
 * Used during test discovery phase to register test names and function indices.
 * Minimal imports - only registration callback and stubs.
 *
 * @param memory - WebAssembly memory instance
 * @param tests - Array to collect registered tests (mutated by __register_test callback)
 * @returns WebAssembly import object
 */
function createDiscoveryImports(
  memory: WebAssembly.Memory,
  tests: DiscoveredTest[]
): WebAssembly.Imports {
  return {
    env: {
      memory,
      __register_test(namePtr: number, nameLen: number, fnIndex: number) {
        const testName = decodeString(memory, namePtr, nameLen);
        tests.push({ name: testName, fnIndex });
        debug('[Executor] Registered test:', testName, 'at function index', fnIndex);
      },
      __coverage_trace() {}, // No-op during discovery
      __assertion_pass() {},
      __assertion_fail() {},
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = logAbort(memory, msgPtr, filePtr, line, column, 'during discovery');
        const errorMsg = `AssemblyScript abort during test discovery: ${message}${location ? `\n  at ${location}` : ''}`;
        throw new Error(errorMsg);
      },
    },
  };
}

/**
 * Create import object for test execution
 *
 * Used during test execution on clean binary. Captures test results, coverage data,
 * and error information. The abort handler throws to halt execution on failure.
 *
 * @param memory - WebAssembly memory instance
 * @param currentTest - Mutable reference to current test result (updated by imports)
 * @param coverage - Coverage data collector
 * @returns WebAssembly import object
 */
function createTestExecutionImports(
  memory: WebAssembly.Memory,
  currentTest: { value: TestResult | null },
  coverage: CoverageData
): WebAssembly.Imports {
  return {
    env: {
      memory,

      // Test registration callback (no-op during execution)
      __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},

      // Coverage tracking callback
      __coverage_trace(funcIdx: number, blockIdx: number) {
        trackCoverage(coverage, funcIdx, blockIdx);
      },

      // Assertion tracking
      __assertion_pass() {
        if (currentTest.value) {
          currentTest.value.assertionsPassed++;
        }
      },

      __assertion_fail(msgPtr: number, msgLen: number) {
        if (currentTest.value) {
          currentTest.value.assertionsFailed++;
          const errorMsg = decodeString(memory, msgPtr, msgLen);
          debug('[Executor] Assertion failed:', errorMsg);
        }
      },

      // AS runtime imports
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message } = logAbort(memory, msgPtr, filePtr, line, column, 'during test execution');

        if (currentTest.value) {
          currentTest.value.passed = false;

          // Create error to capture V8 stack trace
          const error = new Error(message);

          // Extract V8 call stack BEFORE throwing
          // This gives us WAT line:column positions that can be mapped to AS source
          currentTest.value.rawCallStack = extractCallStack(error);
          currentTest.value.error = error;

          debug('[Executor] Captured V8 call stack with', currentTest.value.rawCallStack.length, 'frames');
        }
        // CRITICAL: Must throw to halt WASM execution
        // Without throwing, execution would continue and incorrectly mark failed tests as passed.
        // Per-test isolation ensures the next test still runs (in a fresh instance).
        throw new Error('AssemblyScript abort');
      },
    },
  };
}

/**
 * Create import object for coverage collection
 *
 * Used during coverage collection pass in dual mode. Executes test on instrumented binary
 * to collect coverage data. Test failures are ignored - we only care about coverage data
 * collected up to the point of failure.
 *
 * @param memory - WebAssembly memory instance
 * @param coverage - Coverage data collector
 * @returns WebAssembly import object
 */
function createCoverageCollectionImports(
  memory: WebAssembly.Memory,
  coverage: CoverageData
): WebAssembly.Imports {
  return {
    env: {
      memory,
      __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},
      __coverage_trace(funcIdx: number, blockIdx: number) {
        trackCoverage(coverage, funcIdx, blockIdx);
      },
      __assertion_pass() {},
      __assertion_fail(_msgPtr: number, _msgLen: number) {},
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        // Log abort but don't capture error details - we only care about coverage
        logAbort(memory, msgPtr, filePtr, line, column, 'during coverage collection');

        // Throw to halt WASM execution (caught and ignored by executeCoveragePass)
        // Coverage collected up to this point is still valid and useful
        throw new Error('Test aborted during coverage collection');
      },
    },
  };
}

// ============================================================================
// Execution Helpers
// ============================================================================

/**
 * Enhance error with source map locations
 *
 * Maps V8 WAT positions to AssemblyScript source locations using source maps.
 * Updates error message and stack trace with accurate file:line:column information.
 *
 * @param currentTest - Test result with raw call stack
 * @param sourceMapJson - Parsed source map
 */
async function enhanceErrorWithSourceMap(
  currentTest: TestResult,
  sourceMapJson: RawSourceMap
): Promise<void> {
  if (!currentTest.rawCallStack || currentTest.rawCallStack.length === 0) {
    return;
  }

  debug('[Executor] Mapping', currentTest.rawCallStack.length, 'call sites to source locations');

  const mappedStack = await Promise.all(
    currentTest.rawCallStack.map(callSite =>
      createWebAssemblyCallSite(callSite, sourceMapJson)
    )
  );

  // Filter out null results (non-WASM call sites)
  currentTest.sourceStack = mappedStack.filter((cs): cs is NonNullable<typeof cs> => cs !== null);

  debug('[Executor] Mapped to', currentTest.sourceStack.length, 'source locations');

  // Format error with source location
  if (currentTest.error && currentTest.sourceStack.length > 0) {
    const topFrame = currentTest.sourceStack[0]!; // Safe: length > 0
    const originalMessage = currentTest.error.message;

    // Create a new error with enhanced message including source location
    const enhancedError = new Error(`${originalMessage}\n  → ${topFrame.fileName}:${topFrame.lineNumber}:${topFrame.columnNumber}`);

    // Build a clean stack trace with source locations
    let stackTrace = `${originalMessage}\n`;
    for (const frame of currentTest.sourceStack) {
      stackTrace += `  at ${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}\n`;
    }
    enhancedError.stack = stackTrace;

    currentTest.error = enhancedError;

    debug('[Executor] Enhanced error with source location');
  }
}

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
    functions: new Map<number, number>(),
    blocks: new Map<string, number>(),
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
 * - Collects coverage in dual mode (re-runs test on instrumented binary)
 * - Assigns coverage data to test result
 *
 * @param testResult - Test result to finalize
 * @param singleModeCoverage - Coverage collected during test execution (single mode)
 * @param sourceMapJson - Parsed source map (null if not available)
 * @param coverageModule - Instrumented WASM module (null if not in dual mode)
 * @param fnIndex - Function index of the test
 * @returns Finalized test result
 */
async function finalizeTestResult(
  testResult: TestResult,
  singleModeCoverage: CoverageData,
  sourceMapJson: RawSourceMap | null,
  coverageModule: WebAssembly.Module | null,
  fnIndex: number
): Promise<TestResult> {
  // Map call stack to source locations if available
  if (sourceMapJson && testResult.rawCallStack) {
    await enhanceErrorWithSourceMap(testResult, sourceMapJson);
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
 * @returns Execution results with all test outcomes
 */
export async function executeTestsAndCollectCoverage(
  binary: Uint8Array,
  sourceMap: string | null,
  coverageBinary: Uint8Array | null | undefined,
  discoveredTests: DiscoveredTest[],
  _filename: string
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
  for (const { name: testName, fnIndex } of discoveredTests) {
    // Create fresh memory for this test instance
    const memory = createMemory();

    // Create coverage tracking for this test (used in single-binary mode)
    const singleModeCoverage: CoverageData = {
      functions: new Map<number, number>(),
      blocks: new Map<string, number>(),
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
      // Create test result object
      currentTestRef.value = {
        name: testName,
        passed: true,
        assertionsPassed: 0,
        assertionsFailed: 0,
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

      // If we reach here, test passed (no abort occurred)

    } catch (error) {
      debugError('[Executor] Error during test execution:', error);
      // Error should be captured in currentTestRef.value via abort handler
      if (currentTestRef.value !== null) {
        if (currentTestRef.value.passed) {
          // If not already marked as failed, mark it now
          currentTestRef.value.passed = false;
          currentTestRef.value.error = error as Error;
        }
      }
    }

    // Finalize test result: source maps + coverage
    const finalResult = currentTestRef.value
      ? await finalizeTestResult(currentTestRef.value, singleModeCoverage, sourceMapJson, coverageModule, fnIndex)
      : createInitializationCrashResult(testName, singleModeCoverage);

    results.push(finalResult);
  }

  return { tests: results };
}
