import { AssemblyScriptSuiteOptions, AssemblyScriptTestOptions } from '../types/types.js';

export function mergeAssemblyScriptSuiteOptions(
  defaultSuiteOptions: AssemblyScriptSuiteOptions,
  skip: number,
  only: number,
): AssemblyScriptSuiteOptions {
  const options: AssemblyScriptSuiteOptions = { ...defaultSuiteOptions };
  
  if (skip >= 0) {
    options.skip = skip === 1 ? true : false;
  }
  if (only >= 0) {
    options.only = only === 1 ? true : false;
  }

  return options;
}

export function mergeAssemblyScriptTestOptions(
  defaultTestOptions: AssemblyScriptTestOptions,
  timeout: number,
  retry: number,
  skip: number,
  only: number,
  fails: number,
): AssemblyScriptTestOptions {
  const options: AssemblyScriptTestOptions = { ...defaultTestOptions };
  
  if (timeout >= 0) {
    options.timeout = timeout;
  }
  if (retry >= 0) {
    options.retry = retry;
  }
  if (skip >= 0) {
    options.skip = skip === 1 ? true : false;
  }
  if (only >= 0) {
    options.only = only === 1 ? true : false;
  }
  if (fails >= 0) {
    options.fails = fails === 1 ? true : false;
  }

  return options;
}
