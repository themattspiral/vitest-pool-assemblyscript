import { LifecycleHookKind, TestOptionValue } from './portable/constants';

/*
 * @external functions are imported to the
 * WASM execution environment from pool executor
 */

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__register_hook")
declare function __register_hook(kind: LifecycleHookKind, fnIndex: u32, timeout: i32): void;

/**
 * A lifecycle hook callback.
 *
 * AssemblyScript does not support JS-style closures: a hook callback cannot
 * capture local variables. Module-level state is the sharing mechanism —
 * hooks run inside the *same* fresh WASM instance as the test they wrap, so
 * state a `beforeEach` writes to module-level variables is visible to the
 * test, and to `afterEach`.
 */
export type HookCallback = () => void;

/**
 * Register a callback to run before each test in the current suite scope
 * (called during top-level code execution in _start()).
 *
 * Follows vitest `beforeEach` semantics:
 * - Applies to every test in the enclosing `describe` (or the whole file when
 *   registered at the top level), including tests in nested suites.
 * - Suite-scoped and position-independent: a hook registered after `test()`
 *   calls in the same suite still applies to them.
 * - Chains run outermost-suite-first; multiple hooks in one suite run in
 *   registration order.
 * - Runs before every attempt of a test, including each retry. Each attempt
 *   is a fresh WASM instance, so module-level state is re-initialized before
 *   the hook runs.
 * - A failing `beforeEach` (failed `expect()` or runtime error) fails the
 *   test: remaining `beforeEach` hooks and the test body are skipped, while
 *   the `afterEach` chain still runs.
 * - `expect()` assertions work inside hooks and count toward the test.
 * - Each hook runs in its own timeout window (vitest semantics): the optional
 *   `timeout` argument (ms) sets this hook's window, defaulting to the
 *   configured global `hookTimeout`. A hook that exceeds its window fails
 *   the test with a hook-timeout error.
 *
 * Because each test executes in its own isolated WASM instance, hooks run
 * per-instance: there is no cross-test state to set up, and expensive setup
 * in a hook re-runs for every test.
 */
export function beforeEach(fn: HookCallback, timeout: i32 = TestOptionValue.OptionUndefined): void {
  __register_hook(LifecycleHookKind.BeforeEach, fn.index, timeout);
}

/**
 * Register a callback to run after each test in the current suite scope
 * (called during top-level code execution in _start()).
 *
 * Follows vitest `afterEach` semantics:
 * - Applies to every test in the enclosing `describe` (or the whole file when
 *   registered at the top level), including tests in nested suites.
 * - Suite-scoped and position-independent: a hook registered after `test()`
 *   calls in the same suite still applies to them.
 * - Chains run innermost-suite-first; multiple hooks in one suite run in
 *   *reverse* registration order (vitest's default `sequence.hooks: 'stack'`).
 * - Runs after every attempt of a test, including each retry — and it still
 *   runs when the `beforeEach` chain or the test body failed. The exception is
 *   a timeout, which terminates the worker thread: no `afterEach` runs for a
 *   timed-out attempt.
 * - A failing `afterEach` (failed `expect()` or runtime error) fails the
 *   test — even one that passed — and stops the remaining `afterEach` chain.
 * - `expect()` assertions work inside hooks and count toward the test.
 * - Each hook runs in its own timeout window (vitest semantics): the optional
 *   `timeout` argument (ms) sets this hook's window, defaulting to the
 *   configured global `hookTimeout`. A hook that exceeds its window fails
 *   the test with a hook-timeout error.
 *
 * Runs inside the same WASM instance as the test, so module-level state
 * written by `beforeEach` and the test body is visible. The instance is
 * discarded afterwards — `afterEach` is for host-visible teardown (e.g.
 * user-provided WASM imports) and assertions, not for freeing WASM memory.
 */
export function afterEach(fn: HookCallback, timeout: i32 = TestOptionValue.OptionUndefined): void {
  __register_hook(LifecycleHookKind.AfterEach, fn.index, timeout);
}
