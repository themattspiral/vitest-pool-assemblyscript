// Exposes limited access to pool internals for internal testing
export type { WASMCompilation, AssemblyScriptPoolOptions } from './types/types.js';
export { compileAssemblyScript } from './compiler/index.js';
export {
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_FUNCTION_NAME_SUBSTRING,
  POOL_INTERNAL_PATHS,
} from './types/constants.js';
