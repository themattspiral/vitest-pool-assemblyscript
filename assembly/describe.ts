import { TestCallback } from './test';
import { SuiteOptions } from './options';

// @external functions are imported to the WASM execution environment from pool code

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__begin_register_suite")
declare function __begin_register_suite(name: string, skip: i32, only: i32): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__end_register_suite")
declare function __end_register_suite(name: string): void;


const DEFAULT_SUITE_OPTIONS = new SuiteOptions();

/**
 * Register a test suite (a collection of tests and suites).
 */
export function describe<T = TestCallback, U = SuiteOptions>(
  name: string,
  optionsOrFn: T,
  // @ts-ignore
  fnOrOptions: U = DEFAULT_SUITE_OPTIONS
): void {
  let fn: TestCallback;
  let options: SuiteOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof SuiteOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof SuiteOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
    options = optionsOrFn;
  } else {
    throw new Error("Invalid describe() arguments");
  }

  __begin_register_suite(name, options._valueOfSkip, options._valueOfOnly);

  fn();

  __end_register_suite(name);
}


function describeWithMergedOption<T = TestCallback, U = SuiteOptions>(
  name: string,
  optionToMerge: SuiteOptions,
  optionsOrFn: T,
  // @ts-ignore
  fnOrOptions: U = DEFAULT_SUITE_OPTIONS
): void {
  let fn: TestCallback;
  let options: SuiteOptions;

  if (isFunction(optionsOrFn) && fnOrOptions instanceof SuiteOptions) {
    fn = optionsOrFn;
    options = fnOrOptions;
  } else if (optionsOrFn instanceof SuiteOptions && isFunction(fnOrOptions)) {
    fn = fnOrOptions;
    options = optionsOrFn;
  } else {
    throw new Error("Invalid describe() arguments");
  }

  const merged = options.__mergeSuiteOptions(optionToMerge);

  return describe(name, merged, fn);
}

export namespace describe {
  export function skip<T = TestCallback, U = SuiteOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_SUITE_OPTIONS
  ): void {
    return describeWithMergedOption(name, SuiteOptions.skip(), optionsOrFn, fnOrOptions);
  }

  export function only<T = TestCallback, U = SuiteOptions>(
    name: string,
    optionsOrFn: T,
    // @ts-ignore
    fnOrOptions: U = DEFAULT_SUITE_OPTIONS
  ): void {
    return describeWithMergedOption(name, SuiteOptions.only(), optionsOrFn, fnOrOptions);
  }
}
