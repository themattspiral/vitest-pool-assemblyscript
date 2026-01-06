import { TestOptions } from './options';

// @external functions are imported to the WASM execution environment from pool code

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__register_test")
declare function __register_test(
  name: string,
  fnIndex: u32,
  timeout: i32,
  retry: i32,
  skip: i32,
  only: i32,
  fails: i32
): void;

export type TestCallback = () => void;

const DEFAULT_TEST_OPTIONS = new TestOptions();

/**
 * Register a test (called during top-level code execution in _start())
 *
 * Notifies the Pool via __register_test callback with the test name and function index.
 */
export function test<T = TestCallback, U = TestOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  let fn: TestCallback;
  let options: TestOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
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
  // @ts-ignore
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  let fn: TestCallback;
  let options: TestOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof TestOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof TestOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
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
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.only(), optionsOrFn, fnOrOptions);
  }

  export function fails<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.fails(), optionsOrFn, fnOrOptions);
  }
}

export function it<T = TestCallback, U = TestOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore
  fnOrOptions: U = DEFAULT_TEST_OPTIONS
): void {
  return test(name, optionsOrFn, fnOrOptions);
}

export namespace it {
  export function skip<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.only(), optionsOrFn, fnOrOptions);
  }

  export function fails<T = TestCallback, U = TestOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_TEST_OPTIONS
  ): void {
    return testWithMergedOption(name, TestOptions.fails(), optionsOrFn, fnOrOptions);
  }
}
