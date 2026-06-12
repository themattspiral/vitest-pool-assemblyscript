import { availableParallelism } from 'node:os';
import type { SerializedConfig } from 'vitest';
import type { Retry, SerializableRetry } from '@vitest/runner';
import type { Vitest } from 'vitest/node';

import type {
  AssemblyScriptPoolOptions,
  ASPoolOptionsFieldsWithDefaultValues,
  ResolvedAssemblyScriptPoolOptions,
  ResolvedHybridProviderOptions,
  SerializedConfigCompat,
  AssemblyScriptTestError,
} from '../types/types.js';
import { AS_POOL_FIELDS_WITH_DEFAULTS } from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_NAME, POOL_ERROR_NAMES } from '../types/constants.js';

const DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS: Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>> = {
  debug: false,
  debugNative: false,
  debugCoverageExtract: false,
  _instrumentPoolInternals: false,
  stripInline: true,
  maxThreadsV3: availableParallelism() - 1,
  extraCompilerFlags: [],
} as const;

function createPoolConfigError(message: string): AssemblyScriptTestError {
  return {
    name: POOL_ERROR_NAMES.PoolConfigError,
    message
  };
}

// v4: used in runner init to parse user-provided param directly
export function resolvePoolOptions(userPoolOptions?: any): ResolvedAssemblyScriptPoolOptions {
  const poolOptions: AssemblyScriptPoolOptions = userPoolOptions ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;

  // resolve fields with defaults if user hasn't provided them
  for (const configKey of AS_POOL_FIELDS_WITH_DEFAULTS) {
    if (poolOptions[configKey] === undefined) {
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey] as any;
    }
  }

  const resolved = { ...poolOptions, isResolved: true } as ResolvedAssemblyScriptPoolOptions;

  if (
    (resolved.testMemoryPagesInitial !== undefined && resolved.testMemoryPagesInitial < 1)
    || (resolved.testMemoryPagesMax !== undefined && resolved.testMemoryPagesMax < 1)
  ) {
    throw createPoolConfigError(
      `AssemblyScript WASM test memory page size options must be positive if defined - testMemoryPagesMin: ${resolved.testMemoryPagesInitial}`
        + ` | testMemoryPagesMax: ${resolved.testMemoryPagesMax}`,
    );
  }

  if (
    (resolved.coverageMemoryPagesInitial !== undefined && resolved.coverageMemoryPagesInitial < 1)
    || (resolved.coverageMemoryPagesMax !== undefined && resolved.coverageMemoryPagesMax < 1)
  ) {
    throw createPoolConfigError(
      `AssemblyScript WASM coverage memory page size options must be positive if defined - coverageMemoryPagesMin: ${resolved.coverageMemoryPagesInitial}`
        + ` | coverageMemoryPagesMax: ${resolved.coverageMemoryPagesMax}`,
    );
  }

  return resolved;
}

export function retryCompat(retry?: SerializableRetry | Retry): number {
  return typeof retry === 'number' ? retry : retry?.count ?? 0;
}

export function getCompatConfig(config: SerializedConfig): SerializedConfigCompat {
  return {
    ...config,
    retry: retryCompat(config.retry)
  };
}

function getProjectConfigs(ctx: Vitest): {
  [key: string]: {
    config: SerializedConfigCompat,
    v3PoolOptions?: ResolvedAssemblyScriptPoolOptions
  }
} {
  const configs = {} as {
    [key: string]: {
      config: SerializedConfigCompat,
      v3PoolOptions?: ResolvedAssemblyScriptPoolOptions
    }
  };

  ctx.projects
    // project.config.pool resolves to the *path of the dist file*
    .filter(p => p.config.pool.includes(ASSEMBLYSCRIPT_POOL_NAME))
    
    .forEach(project => {
      configs[project.name] = {
        config: getCompatConfig(project.serializedConfig),
      };

      // @ts-ignore - we build with v4, but this is correct for v3 (has config.poolOptions)
      const maybeOptions: any = project.config?.poolOptions?.assemblyScript;
      if (maybeOptions) {
        configs[project.name]!.v3PoolOptions = resolvePoolOptions(maybeOptions);
      }
    });
  
  return configs;
}

export function getConfigs(ctx: Vitest): {
  coverage: ResolvedHybridProviderOptions;
  projects: {
    [key: string]: {
      config: SerializedConfigCompat,
      v3PoolOptions?: ResolvedAssemblyScriptPoolOptions
    }
  };
  fallbackPoolOptions: ResolvedAssemblyScriptPoolOptions;
} {
  const coverage = ctx.config.coverage as unknown as ResolvedHybridProviderOptions;
  const projects = getProjectConfigs(ctx);

  // @ts-ignore - we build with v4, but this is correct for v3 (has config.poolOptions)
  let fallbackPoolOptions: ResolvedAssemblyScriptPoolOptions = resolvePoolOptions(ctx.config.poolOptions?.assemblyScript);

  const configs = Object.values(projects);
  if (configs.length > 0) {
    for (const config of configs) {
      // if debug is true on any AS project, it becomes true in the fallback
      if (config.v3PoolOptions?.debug) {
        fallbackPoolOptions.debug = true;
      }
    }
  }

  return {
    coverage,
    projects,
    fallbackPoolOptions
  };
}
