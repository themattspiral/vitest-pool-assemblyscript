/**
 * Typed Constants
 * 
 * Constants which require importing ./types
 */

import { AssemblyScriptSuiteOptions, AssemblyScriptTestOptions } from './types.js';

export const DEFAULT_ASSEMBLYSCRIPT_SUITE_OPTIONS: AssemblyScriptSuiteOptions = {
  skip: false,
  only: false,
};

// hard-coded defaults only - timeout and retry defaults come from vitest config
export const DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS: Pick<AssemblyScriptTestOptions, 'fails' | 'skip' | 'only'> = {
  fails: false,
  skip: false,
  only: false
};
