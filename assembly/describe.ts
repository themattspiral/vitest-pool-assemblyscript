import { TestOptions, DEFAULT_TEST_OPTIONS } from './options';

/* 
 * @external functions are imported to the
 * WASM execution environment from pool executor
 */

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__begin_register_suite")
declare function __begin_register_suite(
  name: string,
  timeout: i32,
  retry: i32,
  skip: i32,
  only: i32,
  fails: i32
): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__end_register_suite")
declare function __end_register_suite(name: string): void;

export type SuiteCallback = () => void;

/**
 * Register a test suite (a collection of tests and suites).
 */
export function describe<T = SuiteCallback, U = TestOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
  fnOrOptions: U = DEFAULT_TEST_OPTIONS  // defaults all undefined here, merged with config in JS
): void {
  let fn: SuiteCallback;
  let options: TestOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
    options = optionsOrFn;
  } else {
    throw new Error("Invalid describe() arguments");
  }

  __begin_register_suite(
    name,
    options._valueOfTimeout,
    options._valueOfRetry,
    options._valueOfSkip,
    options._valueOfOnly,
    options._valueOfFails
  );

  fn();

  __end_register_suite(name);
}

function describeWithMergedOption<T = SuiteCallback, U = TestOptions>(
  name: string,
  optionToMerge: TestOptions,
  optionsOrFn: T,
  // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  let fn: SuiteCallback;
  let options: TestOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
    options = optionsOrFn;
  } else {
    throw new Error("Invalid describe() arguments");
  }

  const merged = options.__merge(optionToMerge);

  return describe(name, merged, fn);
}

export namespace describe {
  export function skip<T = SuiteCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return describeWithMergedOption(name, TestOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = SuiteCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore: TS2322 ('U' could be instantiated with an arbitrary type) doesn't apply to AS
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return describeWithMergedOption(name, TestOptions.only(), optionsOrFn, fnOrOptions);
  }
}
