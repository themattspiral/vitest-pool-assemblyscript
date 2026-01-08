import { AssemblyScriptTestOptions } from '../types/types.js';

const TEST_OPTION_UNDEFINED: number = -1;
const TEST_OPTION_TRUE: number = 1;

export function mergeAssemblyScriptTestOptions(
  baseOptions: AssemblyScriptTestOptions,
  timeout: number,
  retry: number,
  skip: number,
  only: number,
  fails: number,
): AssemblyScriptTestOptions {
  const options: AssemblyScriptTestOptions = { ...baseOptions };
  
  // numerical options
  if (timeout > TEST_OPTION_UNDEFINED) {
    options.timeout = timeout;
  }
  if (retry > TEST_OPTION_UNDEFINED) {
    options.retry = retry;
  }

  // boolean options
  if (skip > TEST_OPTION_UNDEFINED) {
    options.skip = skip === TEST_OPTION_TRUE ? true : false;
  }
  if (only > TEST_OPTION_UNDEFINED) {
    options.only = only === TEST_OPTION_TRUE ? true : false;
  }
  if (fails > TEST_OPTION_UNDEFINED) {
    options.fails = fails === TEST_OPTION_TRUE ? true : false;
  }

  return options;
}
