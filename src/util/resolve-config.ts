import type { TestProject, Vitest } from 'vitest/node';
import { availableParallelism } from 'node:os';

import type {
  AssemblyScriptPoolOptions,
  ASPoolOptionsFieldsWithDefaultValues,
  ResolvedAssemblyScriptPoolOptions,
  ResolvedHybridProviderOptions,
  AssemblyScriptProjectConfig,
} from '../types/types.js';
import { AS_POOL_FIELDS_WITH_DEFAULTS } from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_NAME, POOL_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';

const DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS: Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>> = {
  debug: false,
  stripInline: true,
  maxThreadsV3: availableParallelism() - 1,
  coverageMemoryPagesInitial: 1,
  coverageMemoryPagesMax: 4,
  testMemoryPagesInitial: 1,
  extraCompilerFlags: [],
} as const;

// v4: used in runner init to parse user-provided param
export function resolvePoolOptions(userPoolOptions?: any): ResolvedAssemblyScriptPoolOptions {
  const poolOptions: AssemblyScriptPoolOptions = userPoolOptions ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;

  // resolve fields with defaults if user hasn't provided them
  for (const configKey of AS_POOL_FIELDS_WITH_DEFAULTS) {
    if (poolOptions[configKey] === undefined) {
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey] as any;
    }
  }

  const resolved = { ...poolOptions, isResolved: true } as ResolvedAssemblyScriptPoolOptions;

  if (resolved.coverageMemoryPagesInitial < 1 || resolved.coverageMemoryPagesMax < 1) {
    throw createPoolError(
      `Coverage memory page size options must be positive - coverageMemoryPagesMin: ${resolved.coverageMemoryPagesInitial}`
      + ` | coverageMemoryPagesMax: ${resolved.coverageMemoryPagesMax}`,
      POOL_ERROR_NAMES.PoolConfigError
    );
  }
  
  if (resolved.testMemoryPagesInitial < 1 || (resolved.testMemoryPagesMax !== undefined && resolved.testMemoryPagesMax < 1)) {
    throw createPoolError(
      `Test memory page size options must be positive - testMemoryPagesMin: ${resolved.testMemoryPagesInitial}`
      + ` | testMemoryPagesMax: ${resolved.testMemoryPagesMax}`,
      POOL_ERROR_NAMES.PoolConfigError
    );
  }

  return resolved;
}

// v3 & hybrid coverage provider: used to get project config & poolOptions, with global coverage on project config
export function getProjectSerializedOrGlobalConfig(ctx: Vitest): {
  config: AssemblyScriptProjectConfig;
  foundProjectSerializedConfig: boolean;
} {
  let testProject: TestProject | undefined;
  let foundProjectSerializedConfig: boolean = false;

  // In multi-project mode, ctx.config is the global config, not the project-specific config
  // We need to find our project in ctx.projects to get project-specific config at the "pool level" in v3,
  // and in the hybrid coverage provider regardless of version (specifically the project root)
  if (ctx.projects && ctx.projects.length > 0) {
    // Multi-project mode: find the first project using this pool
    // Use string.includes because project.config.pool resolves to the *path* of the dist file
    const project = ctx.projects.find(p => p.config.pool.includes(ASSEMBLYSCRIPT_POOL_NAME));

    if (project) {
      testProject = project;
      foundProjectSerializedConfig = true;
    }
  }

  const config = !!testProject ? {
    ...testProject.serializedConfig,
    coverage: {
      ...testProject.serializedConfig.coverage,
      ...(ctx.config.coverage as ResolvedHybridProviderOptions)
    }
  } : {
    ...ctx.config,
    coverage: ctx.config.coverage as ResolvedHybridProviderOptions
  };

  return {
    config,
    foundProjectSerializedConfig
  };
}