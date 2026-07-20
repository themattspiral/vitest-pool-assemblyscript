import { AssemblyScriptTestOptions } from '../types/types.js';
import { TestOptionValue } from '../../assembly/portable/constants.js';

export function mergeAssemblyScriptTestOptions(
  baseOptions: AssemblyScriptTestOptions,
  timeout: number,
  retry: number,
  skip: TestOptionValue,
  only: TestOptionValue,
  fails: TestOptionValue,
): AssemblyScriptTestOptions {
  const options: AssemblyScriptTestOptions = { ...baseOptions };
  
  // numerical options
  if (timeout >= 0) {
    options.timeout = timeout;
  }
  if (retry >= 0) {
    options.retry = retry;
  }

  // boolean options
  if (skip !== TestOptionValue.OptionUndefined) {
    options.skip = skip === TestOptionValue.OptionTrue ? true : false;
  }
  if (only !== TestOptionValue.OptionUndefined) {
    options.only = only === TestOptionValue.OptionTrue ? true : false;
  }
  if (fails !== TestOptionValue.OptionUndefined) {
    options.fails = fails === TestOptionValue.OptionTrue ? true : false;
  }

  return options;
}
