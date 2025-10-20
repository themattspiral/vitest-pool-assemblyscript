/**
 * WASM Test Executor
 *
 * Handles execution of compiled WASM test binaries:
 * - Test discovery (query test registry)
 * - Test execution (per-test crash isolation)
 * - WASM import object creation
 */

import { createMemory, decodeString, decodeStringNullTerminated, decodeAbortInfo } from './utils/wasm-memory.js';
import type { TestResult, ExecutionResults } from './types.js';
import { debug, debugError } from './utils/debug.mjs';

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
 * @param binary - Compiled WASM binary
 * @param filename - Source filename (for error messages)
 * @returns Execution results with all test outcomes
 */
export async function executeTests(
  binary: Uint8Array,
  _filename: string
): Promise<ExecutionResults> {
  const results: TestResult[] = [];

  // Compile module once (reused for all test instances)
  const module = await WebAssembly.compile(binary as BufferSource);

  // First, discover all tests and their function indices
  const registeredTests = await getRegisteredTests(module);
  debug('[Executor] Executing', registeredTests.length, 'tests with per-test isolation');

  // Execute each test in a fresh WASM instance
  for (const { name: testName, fnIndex } of registeredTests) {
    let currentTest: TestResult | null = null;

    // Create fresh memory for this test instance
    const memory = createMemory();

    // Create import object that captures currentTest via closure
    const importObject = {
      env: {
        memory: memory,

        // Test registration callback (no-op during execution)
        __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},

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
            // Create a clean error with just the assertion message
            // Stack trace is not useful for WASM errors since it shows executor internals
            const error = new Error(message);
            error.stack = message; // Replace stack with just the message
            currentTest.error = error;
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

      // Execute test function
      if (typeof exports.__execute_function === 'function') {
        exports.__execute_function(fnIndex);
      } else {
        throw new Error('__execute_function not found in WASM exports');
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
      });
    }
  }

  return { tests: results };
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

