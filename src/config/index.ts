// module augmentation for hybrid coverage provider options
import './custom-provider-options.js';

export { createAssemblyScriptPool } from '../pool/pool-runner-init.js';
export type {
  AssemblyScriptPoolOptions,
  WasmImportsFactory,
  WasmImportsFactoryInfo,
} from '../types/types.js';
