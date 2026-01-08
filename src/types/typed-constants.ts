/**
 * Typed Constants
 * 
 * Constants which require importing ./types
 */

import { AssemblyScriptTestOptions } from './types.js';

// hard-coded defaults only - timeout and retry defaults always come from vitest config
export const DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS: Pick<AssemblyScriptTestOptions, 'fails' | 'skip' | 'only'> = {
  fails: false,
  skip: false,
  only: false
};
