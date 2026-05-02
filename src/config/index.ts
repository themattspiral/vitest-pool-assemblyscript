// module augmentation for hybrid coverage provider options (vitest 4.1.1+)
import './coverage-options.js';

export { createAssemblyScriptPool } from '../pool/pool-runner-init.js';
export type {
  AssemblyScriptPoolOptions,
  WasmImportsFactory,
  WasmImportsFactoryInfo,
} from '../types/types.js';
