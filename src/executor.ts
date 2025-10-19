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
 * Discover tests by querying the test registry
 *
 * Process:
 * 1. Instantiate WASM with minimal imports
 * 2. Call __register_tests() to populate registry
 * 3. Query __get_test_count() and __get_test_name(index)
 * 4. Return array of test names
 *
 * @param binary - Compiled WASM binary
 * @param filename - Source filename (for error messages)
 * @returns Array of test names
 */
export async function discoverTests(
  binary: Uint8Array,
  filename: string
): Promise<string[]> {
  const discoveredTests: string[] = [];

  // Compile module
  const module = await WebAssembly.compile(binary);

  // Create memory and import object
  const memory = createMemory();
  const importObject = {
    env: {
      memory: memory,

      // Test framework imports (not called during discovery, but required by WASM module)
      __test_start(namePtr: number, nameLen: number) {},
      __test_pass() {},
      __test_fail(msgPtr: number, msgLen: number) {},
      __assertion_pass() {},
      __assertion_fail(msgPtr: number, msgLen: number) {},

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

  // Call __register_tests to populate the test registry
  if (typeof exports.__register_tests === 'function') {
    exports.__register_tests();
  }

  // Query test count from registry
  const testCount = exports.__get_test_count ? exports.__get_test_count() : 0;
  debug('[Executor] Test registry contains', testCount, 'tests');

  // Get test names from registry
  for (let i = 0; i < testCount; i++) {
    const namePtr = exports.__get_test_name(i);
    if (namePtr) {
      // Read null-terminated string from WASM memory
      const testName = decodeStringNullTerminated(memory, namePtr);
      discoveredTests.push(testName);
      debug('[Executor] Discovered test:', testName);
    }
  }

  return discoveredTests;
}

/**
 * Execute tests with per-test crash isolation
 *
 * Each test runs in a fresh WASM instance for maximum safety:
 * - Crashes don't affect subsequent tests
 * - Clean state for each test
 * - ~0.43ms overhead per test (negligible)
 *
 * @param binary - Compiled WASM binary
 * @param filename - Source filename (for error messages)
 * @returns Execution results with all test outcomes
 */
export async function executeTests(
  binary: Uint8Array,
  filename: string
): Promise<ExecutionResults> {
  const tests: TestResult[] = [];

  // Compile module once (reused for all test instances)
  const module = await WebAssembly.compile(binary);

  // First, discover how many tests we have
  const testCount = await getTestCount(module);
  debug('[Executor] Executing', testCount, 'tests with per-test isolation');

  // Execute each test in a fresh WASM instance
  for (let testIndex = 0; testIndex < testCount; testIndex++) {
    let currentTest: TestResult | null = null;

    // Create fresh memory for this test instance
    const memory = createMemory();

    // Create import object that captures currentTest via closure
    const importObject = {
      env: {
        memory: memory,

        // Test framework imports (full reporting mode)
        __test_start(namePtr: number, nameLen: number) {
          const testName = decodeString(memory, namePtr, nameLen);
          debug('[Executor] Test started:', testName);

          currentTest = {
            name: testName,
            passed: true, // Assume passed unless __test_fail is called
            assertionsPassed: 0,
            assertionsFailed: 0,
          };
        },

        __test_pass() {
          if (currentTest) {
            currentTest.passed = true;
            debug('[Executor] Test passed:', currentTest.name);
          }
        },

        __test_fail(msgPtr: number, msgLen: number) {
          if (currentTest) {
            const errorMsg = decodeString(memory, msgPtr, msgLen);
            currentTest.passed = false;
            currentTest.error = new Error(errorMsg);
            debug('[Executor] Test failed:', currentTest.name, errorMsg);
          }
        },

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

    // Call __register_tests to populate the test registry
    if (typeof exports.__register_tests === 'function') {
      exports.__register_tests();
    }

    // Execute only this specific test
    try {
      if (typeof exports.__run_test === 'function') {
        exports.__run_test(testIndex);
      } else {
        throw new Error('__run_test function not found in WASM exports');
      }
    } catch (error) {
      debugError('[Executor] Error during test execution:', error);
      // Error should be captured in currentTest via abort handler
      if (currentTest && currentTest.passed) {
        // If not already marked as failed, mark it now
        currentTest.passed = false;
        currentTest.error = error as Error;
      }
    }

    // Add test result (even if it crashed)
    if (currentTest) {
      tests.push(currentTest);
    } else {
      // Test crashed before __test_start was called
      tests.push({
        name: `Test ${testIndex}`,
        passed: false,
        error: new Error('Test crashed during initialization'),
        assertionsPassed: 0,
        assertionsFailed: 0,
      });
    }
  }

  return { tests };
}

/**
 * Get test count from WASM module
 *
 * Helper function used by executeTests to determine how many tests to run.
 *
 * @param module - Compiled WASM module
 * @returns Number of tests in the registry
 */
async function getTestCount(module: WebAssembly.Module): Promise<number> {
  const memory = createMemory();
  const importObject = {
    env: {
      memory,
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

  // Register tests
  if (typeof exports.__register_tests === 'function') {
    exports.__register_tests();
  }

  // Get count
  return exports.__get_test_count ? exports.__get_test_count() : 0;
}

