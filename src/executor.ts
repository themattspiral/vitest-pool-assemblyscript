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
import type { TestResult, ExecutionResults, CoverageData } from './types.js';
import { debug, debugError } from './utils/debug.mjs';
import { extractCallStack, createWebAssemblyCallSite } from './utils/source-maps.js';
import type { RawSourceMap } from 'source-map';

/**
 * Discover tests via registration callbacks
 *
 * Process:
 * 1. Instantiate WASM with import callbacks
 * 2. Call _start() to run top-level code
 * 3. test() calls invoke __register_test callback with name and function index
 * 4. Return array of test names
 *
 * @param binary - Compiled WASM binary
 * @param filename - Source filename (for error messages)
 * @returns Array of test names
 */
export async function discoverTests(
  binary: Uint8Array,
  _filename: string
): Promise<string[]> {
  const tests: Array<{name: string, fnIndex: number}> = [];

  // Compile module
  const module = await WebAssembly.compile(binary as BufferSource);

  // Create memory and import object
  const memory = createMemory();
  const importObject = {
    env: {
      memory: memory,

      // Test registration callback
      __register_test(namePtr: number, nameLen: number, fnIndex: number) {
        const testName = decodeString(memory, namePtr, nameLen);
        tests.push({ name: testName, fnIndex });
        debug('[Executor] Registered test:', testName, 'at function index', fnIndex);
      },

      // Stub out other imports (not used during discovery)
      __coverage_trace() {}, // No-op during test discovery
      __assertion_pass() {},
      __assertion_fail(_msgPtr: number, _msgLen: number) {},

      // AS runtime imports
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        debugError(`[Executor] Abort during discovery: ${message}${location ? ` at ${location}` : ''}`);
        const errorMsg = `AssemblyScript abort during test discovery: ${message}${location ? `\n  at ${location}` : ''}`;
        throw new Error(errorMsg);
      },
    },
  };

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as any;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    exports._start();
  }

  debug('[Executor] Discovered', tests.length, 'tests');
  return tests.map(t => t.name);
}

/**
 * Execute tests with per-test crash isolation
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
 * @param filename - Source filename (for error messages)
 * @returns Execution results with all test outcomes
 */
export async function executeTests(
  binary: Uint8Array,
  sourceMap: string | null,
  coverageBinary: Uint8Array | null | undefined,
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

  // First, discover all tests and their function indices
  const registeredTests = await getRegisteredTests(module);
  debug('[Executor] Executing', registeredTests.length, 'tests with per-test isolation');

  // Execute each test in a fresh WASM instance
  for (const { name: testName, fnIndex } of registeredTests) {
    let currentTest: TestResult | null = null;

    // Create fresh memory for this test instance
    const memory = createMemory();

    // Create coverage tracking for this test
    const coverage: CoverageData = {
      functions: new Map<number, number>(),
      blocks: new Map<string, number>(),
    };

    // Create import object that captures currentTest via closure
    const importObject = {
      env: {
        memory: memory,

        // Test registration callback (no-op during execution)
        __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},

        // Coverage tracking callback
        __coverage_trace(funcIdx: number, blockIdx: number) {
          // Track function-level coverage
          const funcCount = coverage.functions.get(funcIdx) || 0;
          coverage.functions.set(funcIdx, funcCount + 1);

          // Track block-level coverage
          const blockKey = `${funcIdx}:${blockIdx}`;
          const blockCount = coverage.blocks.get(blockKey) || 0;
          coverage.blocks.set(blockKey, blockCount + 1);
        },

        // Assertion tracking
        __assertion_pass() {
          if (currentTest) {
            currentTest.assertionsPassed++;
          }
        },

        __assertion_fail(msgPtr: number, msgLen: number) {
          if (currentTest) {
            currentTest.assertionsFailed++;
            const errorMsg = decodeString(memory, msgPtr, msgLen);
            debug('[Executor] Assertion failed:', errorMsg);
          }
        },

        // AS runtime imports
        abort(msgPtr: number, filePtr: number, line: number, column: number) {
          const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
          debugError(`[Executor] Abort: ${message}${location ? ` at ${location}` : ''}`);

          if (currentTest) {
            currentTest.passed = false;

            // Create error to capture V8 stack trace
            const error = new Error(message);

            // Extract V8 call stack BEFORE throwing
            // This gives us WAT line:column positions that can be mapped to AS source
            currentTest.rawCallStack = extractCallStack(error);
            currentTest.error = error;

            debug('[Executor] Captured V8 call stack with', currentTest.rawCallStack.length, 'frames');
          }
          // CRITICAL: Must throw to halt WASM execution
          // Without throwing, execution would continue and __test_pass() would be called,
          // incorrectly marking failed tests as passed.
          // Per-test isolation ensures the next test still runs (in a fresh instance).
          throw new Error('AssemblyScript abort');
        },
      },
    };

    // Instantiate fresh WASM instance for this test
    const instance = new WebAssembly.Instance(module, importObject);
    const exports = instance.exports as any;

    // Call _start to run top-level code (registers tests)
    if (typeof exports._start === 'function') {
      exports._start();
    }

    // Execute only this specific test
    try {
      // Create test result object
      currentTest = {
        name: testName,
        passed: true,
        assertionsPassed: 0,
        assertionsFailed: 0,
      };

      // Execute test function via function table
      // Uses --exportTable flag instead of Binaryen __execute_function injection
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
      // Error should be captured in currentTest via abort handler
      if (currentTest !== null) {
        // TypeScript loses type narrowing on variables mutated in closures - use type assertion
        if ((currentTest as TestResult).passed) {
          // If not already marked as failed, mark it now
          (currentTest as TestResult).passed = false;
          (currentTest as TestResult).error = error as Error;
        }
      }
    }

    // Map call stack to source locations (async operation)
    if (currentTest && currentTest.rawCallStack && sourceMapJson) {
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

    // Collect coverage from instrumented binary if in dual mode
    if (coverageModule) {
      debug('[Executor] Dual mode: Collecting coverage from instrumented binary for test:', testName);
      const coverageData = await collectCoverageForTest(coverageModule, fnIndex);

      // Merge coverage data into current test (prioritize dual-mode coverage)
      if (currentTest) {
        currentTest.coverage = coverageData;
      }
    } else {
      // Single binary mode: use coverage from main execution
      if (currentTest) {
        currentTest.coverage = coverage;
      }
    }

    // Add test result (even if it crashed)
    if (currentTest) {
      results.push(currentTest);
    } else {
      // Test crashed before __test_start was called
      results.push({
        name: testName,
        passed: false,
        error: new Error('Test crashed during initialization'),
        assertionsPassed: 0,
        assertionsFailed: 0,
        coverage: coverageModule ? await collectCoverageForTest(coverageModule, fnIndex) : coverage,
      });
    }
  }

  return { tests: results };
}

/**
 * Collect coverage for a single test from instrumented binary
 *
 * Executes a single test on the instrumented binary to collect coverage data.
 * Used in dual mode to get accurate coverage while keeping errors accurate.
 *
 * @param coverageModule - Compiled instrumented WASM module
 * @param fnIndex - Function index of the test to execute
 * @returns Coverage data for this test
 */
async function collectCoverageForTest(
  coverageModule: WebAssembly.Module,
  fnIndex: number
): Promise<CoverageData> {
  const coverage: CoverageData = {
    functions: new Map<number, number>(),
    blocks: new Map<string, number>(),
  };

  const memory = createMemory();

  const importObject = {
    env: {
      memory,
      __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},
      __coverage_trace(funcIdx: number, blockIdx: number) {
        // Track function-level coverage
        const funcCount = coverage.functions.get(funcIdx) || 0;
        coverage.functions.set(funcIdx, funcCount + 1);

        // Track block-level coverage
        const blockKey = `${funcIdx}:${blockIdx}`;
        const blockCount = coverage.blocks.get(blockKey) || 0;
        coverage.blocks.set(blockKey, blockCount + 1);
      },
      __assertion_pass() {},
      __assertion_fail(_msgPtr: number, _msgLen: number) {},
      abort(_msgPtr: number, _filePtr: number, _line: number, _column: number) {
        // Silently ignore aborts during coverage collection
        // We only care about coverage, not test results
        throw new Error('Coverage collection abort (expected)');
      },
    },
  };

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
 * Get registered tests from WASM module
 *
 * Helper function used by executeTests to collect test names and function indices.
 *
 * @param module - Compiled WASM module
 * @returns Array of registered tests with names and function indices
 */
async function getRegisteredTests(module: WebAssembly.Module): Promise<Array<{name: string, fnIndex: number}>> {
  const tests: Array<{name: string, fnIndex: number}> = [];
  const memory = createMemory();

  const importObject = {
    env: {
      memory,
      __register_test(namePtr: number, nameLen: number, fnIndex: number) {
        const testName = decodeString(memory, namePtr, nameLen);
        tests.push({ name: testName, fnIndex });
      },
      __coverage_trace() {}, // No-op during test discovery
      __test_start() {},
      __test_pass() {},
      __test_fail() {},
      __assertion_pass() {},
      __assertion_fail() {},
      abort() {},
    },
  };

  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as any;

  // Call _start to run top-level code and register tests
  if (typeof exports._start === 'function') {
    exports._start();
  }

  return tests;
}

