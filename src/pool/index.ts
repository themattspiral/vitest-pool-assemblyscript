export { createAssemblyScriptPool } from './pool-runner-init.js';

// default export for v3 pool config
import { createAssemblyScriptProcessPool  } from './v3/process-pool.js';
export default createAssemblyScriptProcessPool;
