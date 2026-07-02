import { TestOptions, DEFAULT_TEST_OPTIONS } from './options';

/* 
 * @external functions are imported to the
 * WASM execution environment from pool executor
 */

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__register_test")
declare function __register_test(
  name: string,
  fnIndex: u32,
  timeout: i32,
  retry: i32,
  skip: i32,
  only: i32,
  fails: i32
): void;

/**
 * A test body callback.
 *
 * Optionally receives the current `retryCount`: `0` on the first (initial)
 * attempt, incrementing by `1` for each retry — so with `TestOptions.retry(n)`
 * the final attempt receives `n`. Each attempt runs in a fresh WASM instance
 * with fresh memory (module-level and global state is re-initialized every
 * attempt), so `retryCount` is the reliable way to vary behavior across attempts
 * (e.g. to pass only after a given number of retries). Tests that don't need it
 * can use a plain `() => {}` callback.
 */
export type TestCallback = (retryCount?: i32) => void;

/**
 * Register a test (called during top-level code execution in _start())
 *
 * Notifies the Pool via __register_test callback with the test name and function index.
 *
 * The test body callback optionally receives the current retry count — see {@link TestCallback}.
 */
export function test<T = TestCallback, U = TestOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
  fnOrOptions: U = DEFAULT_TEST_OPTIONS  // defaults all undefined here, merged with config & suite in JS
): void {
  let fn: TestCallback;
  let options: TestOptions;

  // The callback's actual arity may differ from TestCallback: a plain
  // `() => void` test omits the parameter, while a retry-aware test declares
  // `(retryCount: i32) => void`. isFunction() guarantees a function reference
  // (a table index); changetype reinterprets it to TestCallback. This is safe
  // because the pool executor invokes it from JS, where a 0-arg callback
  // tolerates being passed retryCount (extra args ignored) and a 1-arg callback
  // receives it — neither traps. (It would only mismatch if invoked via AS
  // call_indirect against TestCallback's signature, which never happens.)
  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = changetype<TestCallback>(optionsOrFn);
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = changetype<TestCallback>(fnOrOptions);
    options = optionsOrFn;
  } else {
    throw new Error("Invalid test() arguments");
  }

  __register_test(
    name,
    fn.index,
    options._valueOfTimeout,
    options._valueOfRetry,
    options._valueOfSkip,
    options._valueOfOnly,
    options._valueOfFails
  );
}

function testWithMergedOption<T = TestCallback, U = TestOptions>(
  name: string,
  optionToMerge: TestOptions,
  optionsOrFn: T,
  // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  let fn: TestCallback;
  let options: TestOptions;

  // changetype reinterprets the function ref to TestCallback — see test() for why this is safe.
  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = changetype<TestCallback>(optionsOrFn);
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = changetype<TestCallback>(fnOrOptions);
    options = optionsOrFn;
  } else {
    throw new Error("Invalid test() arguments");
  }

  const merged = options.__merge(optionToMerge);

  return test(name, merged, fn);
}

export namespace test {
  export function skip<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.only(), optionsOrFn, fnOrOptions);
  }

  export function fails<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.fails(), optionsOrFn, fnOrOptions);
  }
}

export function it<T = TestCallback, U = TestOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  return test(name, optionsOrFn, fnOrOptions);
}

export namespace it {
  export function skip<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.only(), optionsOrFn, fnOrOptions);
  }

  export function fails<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.fails(), optionsOrFn, fnOrOptions);
  }
}
