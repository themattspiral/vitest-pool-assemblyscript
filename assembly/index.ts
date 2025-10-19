/**
 * Test framework with per-test crash isolation support
 *
 * Execution flow:
 * 1. Registration: Top-level code runs (via __register_tests()), calls test() to populate registry
 * 2. Discovery: Pool queries __get_test_count() and __get_test_name(index)
 * 3. Execution: Pool instantiates fresh WASM per test and calls __run_test(index)
 *
 * Key design decisions:
 * - Per-test isolation: Each test runs in a fresh WASM instance (~0.43ms overhead)
 * - Registry-based: Tests register themselves, then execute on demand by index
 * - Crash safe: One test aborting doesn't kill subsequent tests (they run in new instances)
 *
 * Tree-shaking prevention:
 * - The __get_* and __run_* functions are re-exported by the transform (top-level-wrapper.mjs)
 * - This prevents AssemblyScript from tree-shaking them during compilation
 * - Without re-exports, these would be removed even though Pool needs to call them
 */

// WASM imports that Pool provides (callbacks for test reporting)
@external("env", "__test_start")
declare function __test_start(namePtr: usize, nameLen: i32): void;

@external("env", "__test_pass")
declare function __test_pass(): void;

@external("env", "__test_fail")
declare function __test_fail(msgPtr: usize, msgLen: i32): void;

@external("env", "__assertion_pass")
declare function __assertion_pass(): void;

@external("env", "__assertion_fail")
declare function __assertion_fail(msgPtr: usize, msgLen: i32): void;

/**
 * Test registry - stores test names and functions
 * Note: AS doesn't support closures, so we use a class to hold test data
 */
class TestEntry {
  constructor(
    public name: string,
    public fn: () => void
  ) {}
}

const testRegistry: TestEntry[] = [];

/**
 * Register a test (called during top-level code execution)
 * Tests are registered but not executed immediately
 */
export function test(name: string, fn: () => void): void {
  testRegistry.push(new TestEntry(name, fn));
}

/**
 * Get total number of registered tests
 *
 * Called by Pool during discovery phase to determine how many tests exist.
 * Note: This function is re-exported by the transform to prevent tree-shaking.
 */
export function __get_test_count(): i32 {
  return testRegistry.length;
}

/**
 * Get test name by index
 *
 * Called by Pool during discovery phase to collect test names.
 * Note: This function is re-exported by the transform to prevent tree-shaking.
 */
export function __get_test_name(index: i32): string {
  if (index < 0 || index >= testRegistry.length) {
    return "";
  }
  return testRegistry[index].name;
}

/**
 * Run a single test by index (per-test isolation mode - DEFAULT)
 *
 * This is called by Pool with a fresh WASM instance for each test.
 * Benefits:
 * - Crash isolation: If this test aborts, subsequent tests still run (in new instances)
 * - State isolation: Each test has clean global state
 * - Overhead: ~0.43ms per test (negligible)
 *
 * Control flow:
 * 1. Notify Pool test started (__test_start)
 * 2. Execute test body (fn())
 * 3. If fn() completes without aborting, call __test_pass()
 * 4. If fn() aborts (via failed assert), Pool's abort handler catches it
 *
 * CRITICAL: The abort handler MUST throw to prevent __test_pass() from being called.
 * Otherwise, failed tests would be incorrectly reported as passed.
 *
 * Note: This function is re-exported by the transform to prevent tree-shaking.
 */
export function __run_test(index: i32): void {
  if (index < 0 || index >= testRegistry.length) {
    const msg = "Invalid test index";
    __test_fail(changetype<usize>(msg), msg.length);
    abort();
    return;
  }

  const entry = testRegistry[index];

  // Notify pool that test started
  __test_start(changetype<usize>(entry.name), entry.name.length);

  // Execute test body
  // If it aborts (failed assertion), Pool's abort handler throws to halt execution
  entry.fn();

  // If we get here, test passed (no abort occurred)
  __test_pass();
}

/**
 * Run all tests sequentially (shared instance mode - NOT CURRENTLY USED)
 *
 * Runs all tests in a single WASM instance. Faster but less safe:
 * - One test crash kills all remaining tests
 * - Tests share global state (not truly isolated)
 *
 * This exists for potential future config option: isolation: 'shared'
 * Default mode uses per-test instances via __run_test(index).
 *
 * Note: This function is re-exported by the transform to prevent tree-shaking.
 */
export function __run_all_tests(): void {
  for (let i = 0; i < testRegistry.length; i++) {
    __run_test(i);
  }
}

/**
 * Minimal assertion helper
 *
 * IMPORTANT - AssemblyScript compiler bug workaround:
 * The AS compiler's const-folding fails for literal expressions passed directly to functions.
 *
 * This FAILS to compile correctly:
 *   assert(1 + 1 == 2, "math works");
 *
 * This WORKS:
 *   const sum: i32 = 1 + 1;
 *   assert(sum == 2, "math works");
 *
 * Always assign expressions to typed variables before passing to assert().
 * See: src/transforms/top-level-wrapper.mjs comments for more details.
 */
export function assert(condition: bool, message: string = "Assertion failed"): void {
  if (condition) {
    __assertion_pass();
  } else {
    __assertion_fail(changetype<usize>(message), message.length);
    // Abort on failure - terminates WASM execution
    // Pool's abort handler will catch this and mark the test as failed
    abort();
  }
}
