import type { PoolOptions, PoolRunnerInitializer } from 'vitest/node';

import type {
  AssemblyScriptPoolOptions,
  ResolvedHybridProviderOptions
} from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_NAME } from '../types/constants.js';
import { resolvePoolOptions } from '../util/resolve-config.js';
import { AssemblyScriptPoolWorker } from './pool-worker.js';

export function createAssemblyScriptPool(userPoolOptions?: AssemblyScriptPoolOptions): PoolRunnerInitializer {
  const resolvedUserPoolOptions = resolvePoolOptions(userPoolOptions);

  return {
    name: ASSEMBLYSCRIPT_POOL_NAME,
    createPoolWorker: (opts: PoolOptions) => {
      const resolvedCoverageOptions = opts.project.config.coverage as ResolvedHybridProviderOptions;
      return new AssemblyScriptPoolWorker(opts, resolvedUserPoolOptions, resolvedCoverageOptions);
    },
  };
}
