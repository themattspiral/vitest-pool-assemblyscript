/**
 * Hybrid Coverage Provider
 *
 * This provider handles BOTH JavaScript and AssemblyScript coverage in a single provider.
 * - Delegates JS coverage to Vitest's v8 provider
 * - Converts AS coverage to Istanbul format
 * - Merges both into a unified coverage report
 */

import type {
  CoverageProvider,
  Vitest,
  ReportContext,
  ResolvedCoverageOptions,
  ResolvedConfig,
  CustomProviderOptions
} from 'vitest/node';
import { basename, relative } from 'node:path';
import type { AfterSuiteRunMeta } from 'vitest';
import type { CoverageMap } from 'istanbul-lib-coverage';
import libCoverage from 'istanbul-lib-coverage';
import v8CoverageModule from '@vitest/coverage-v8';
import { convertToIstanbulFormat } from './istanbul-converter.js';
import { parseFunctionsFromFile } from './ast-parser.js';
import { globFiles } from './glob-utils.js';
import { mergeCoverageData } from './coverage-merge.js';
import { debug, setDebugMode } from '../util/debug.js';
import { getPoolOptions } from '../pool/options.js';
import {
  ASSEMBLYSCRIPT_POOL_NAME,
  AssemblyScriptPoolError,
  COVERAGE_PAYLOAD_FORMAT,
  POOL_ERROR_NAMES,
  type AssemblyScriptCoveragePayload,
  type CoverageData,
  type GlobResult,
  type ResolvedAssemblyScriptPoolOptions,
  type ResolvedHybridProviderOptions
} from '../types/types.js';

// pick up CustomProviderOptions module augmentation
import '../config/index.js';

export class HybridCoverageProvider implements CoverageProvider {
  name = 'hybrid-assemblyscript-v8' as const;

  private v8Provider: CoverageProvider | undefined;
  private accumulatedCoverageData: CoverageData = { hitCountsByFileAndPosition: {} };
  private projectConfig: ResolvedConfig = {} as ResolvedConfig;
  private poolOptions: ResolvedAssemblyScriptPoolOptions = getPoolOptions();
  private coverageOptions: ResolvedHybridProviderOptions = {} as ResolvedHybridProviderOptions;

  /**
   * Initialize the provider and get reference to v8 provider
   */
  async initialize(ctx: Vitest): Promise<void> {
    this.projectConfig = ctx.config;

    // TODO - extract the multi-project config logic to helper, it's repeated here and pool
    // although to be honest perhaps we shouldn't do this here at all - coverage config should 
    // only be global. Add separate debug config for custom coverage options.
    if (ctx.projects && ctx.projects.length > 0) {
      // Multi-project mode: find the first project using this pool
      const project = ctx.projects.find(p => p.config.pool === ASSEMBLYSCRIPT_POOL_NAME);

      if (project) {
        this.projectConfig = project.config;
      }
    }

    this.poolOptions = getPoolOptions(this.projectConfig);
    setDebugMode(this.poolOptions.debug);

    debug('[HybridCoverageProvider] Initializing Provider');

    // Get v8 provider from the coverage module
    this.v8Provider = await v8CoverageModule.getProvider();

    if (!this.v8Provider) {
      throw new AssemblyScriptPoolError(
        'HybridCoverageProvider - initialize failed to get delegated v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }

    await this.v8Provider.initialize(ctx);
    this.v8Provider.name = 'hybrid-assemblyscript-v8 (delegated v8 reporter)' as const;
    debug('[HybridCoverageProvider] Initialized with delegated v8 provider');
  }

  /**
   * Handle suite completion - delegate based on coverage format marker
   */
  async onAfterSuiteRun(meta: AfterSuiteRunMeta): Promise<void> {
    const start = performance.now();

    const format: string | undefined = (meta?.coverage as any)?.__format;

    debug(() => {
      const files = meta.testFiles.map(tf => relative(this.projectConfig.root, tf)).join(', ');
      return `[HybridCoverageProvider] onAfterSuiteRun - format: ${format ?? '<unknown>'} | testFiles: ${files}`;
    });

    // Check for AssemblyScript format marker
    if (format === COVERAGE_PAYLOAD_FORMAT.AssemblyScript) {
      const payload = meta.coverage as AssemblyScriptCoveragePayload;
      const { coverageData } = payload;

      const fileCount = Object.keys(coverageData.hitCountsByFileAndPosition).length;
      const positionCount = Object.values(coverageData.hitCountsByFileAndPosition)
        .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
      debug(`[HybridCoverageProvider] AS coverage payload: ${positionCount} unique positions hit across ${fileCount} source files`);

      // Merge incoming coverage data into accumulated (by position, summing hit counts)
      mergeCoverageData(this.accumulatedCoverageData, coverageData);

      const accumulatedFileCount = Object.keys(this.accumulatedCoverageData.hitCountsByFileAndPosition).length;
      debug(`[HybridCoverageProvider] Accumulated coverage now has ${accumulatedFileCount} source files`);
    } else {
      // Delegate to v8 provider for all other formats (JS, etc.)
      if (!this.v8Provider) {
        throw new AssemblyScriptPoolError(
          'HybridCoverageProvider - onAfterSuiteRun failed to delegate to internal v8 provider',
          POOL_ERROR_NAMES.HybridCoverageProviderError
        );
      }
      debug('[HybridCoverageProvider] Delegating to v8 provider');
      await this.v8Provider.onAfterSuiteRun(meta);
    }

    debug(() => {
      const files = meta.testFiles.map(tf => relative(this.projectConfig.root, tf)).join(', ');
      const baseFiles = meta.testFiles.map(tf => basename(this.projectConfig.root, tf)).join(', ');
      return `[HybridCoverageProvider] onAfterSuiteRun complete - testFiles: ${files}\n`
           + `[TIMING] ${baseFiles} - onAfterSuiteRun: ${(performance.now() - start).toFixed(2)}ms`;
    });
  }

  /**
   * Generate unified coverage map (merging JS and AS coverage)
   *
   * Flow:
   * 1. Parse included AS source files to get sourceDebugInfo (source of truth for line numbers)
   * 1. Build merged CoverageData (all source functions + accumulated hit counts)
   * 4. Convert merged CoverageData to Istanbul format
   * 5. Get JS coverage from v8 provider
   * 6. Merge AS coverage into JS coverage
   */
  async generateCoverage(context: ReportContext): Promise<unknown> {
    const start = performance.now();

    debug('[HybridCoverageProvider] Generating coverage for test run');

    if (!this.v8Provider) {
      throw new AssemblyScriptPoolError(
        'HybridCoverageProvider - generateCoverage failed to delegate to internal v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }

    // Build AS coverage map
    let asCoverageMap = libCoverage.createCoverageMap();

    if (this.coverageOptions.globbedAssemblyScriptInclude?.length > 0) {
      debug(`[HybridCoverageProvider] Building AS coverage map with ${this.coverageOptions.globbedAssemblyScriptInclude.length} source files `);
      debug(() => {
        const accumulatedPositionCount = Object.values(this.accumulatedCoverageData.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions)?.length, 0);
        const files = Object.keys(this.accumulatedCoverageData.hitCountsByFileAndPosition).length;
        return `[HybridCoverageProvider] Accumulated coverage data has ${accumulatedPositionCount} unique positions hit across ${files} debug source files`;
      });

      // parse source files with AST parser, then match to hits and convert to istanbul format
      const fileProcessingPromises = this.coverageOptions.globbedAssemblyScriptInclude.map(async (include: GlobResult) => {
        debug(`[HybridCoverageProvider] Parsing AS source for expected coverage: "${include.absolute}" (file key: "${include.projectRootRelative}")`);
        
        const functionsByStartLine = await parseFunctionsFromFile(include.absolute, include.projectRootRelative) || {};
        debug(`[HybridCoverageProvider] Parsed ${Object.keys(functionsByStartLine).length} AS source functions in "${include.projectRootRelative}"`);

        const fileHitCountsByPosition = this.accumulatedCoverageData.hitCountsByFileAndPosition[include.projectRootRelative] ?? {};
        debug(`[HybridCoverageProvider] Accumulated AS coverage has ${Object.keys(fileHitCountsByPosition).length} positions for "${include.projectRootRelative}"`);

        // Containment matching (binary hit position → source) is performed during istanbul conversion
        return convertToIstanbulFormat(functionsByStartLine, fileHitCountsByPosition, include.absolute);
      });

      // Wait for all files to complete
      const istanbulResults = await Promise.all(fileProcessingPromises);

      // Add all results to coverage map
      for (const istanbulData of istanbulResults) {
        asCoverageMap.addFileCoverage(istanbulData);
      }

      debug(`[HybridCoverageProvider] Built AS coverage map with ${Object.keys(asCoverageMap.data).length} files`);
    } else {
      debug('[HybridCoverageProvider] WARNING: No assemblyScriptInclude patterns yieldled files - Coverage Map will be empty!');
    }

    const asGenerateEnd = performance.now();
    debug(`[TIMING] AS generateCoverage: ${(asGenerateEnd - start).toFixed(2)}ms`);

    // Get JS coverage from v8 provider
    debug('[HybridCoverageProvider] Getting JS coverage from v8 provider');
    const jsCoverage = await this.v8Provider.generateCoverage(context) as CoverageMap;
    debug(`[HybridCoverageProvider] JS coverage has ${Object.keys(jsCoverage.data).length} files`);
    debug(`[TIMING] JS generateCoverage: ${(performance.now() - asGenerateEnd).toFixed(2)}ms`);

    // Merge AS coverage into JS coverage
    debug('[HybridCoverageProvider] Merging AS coverage into JS coverage');
    jsCoverage.merge(asCoverageMap);
    debug(`[HybridCoverageProvider] Final merged coverage has ${Object.keys(jsCoverage.data).length} files`);

    debug(`[TIMING] Total generateCoverage: ${(performance.now() - start).toFixed(2)}ms`);

    return jsCoverage;
  }

  /**
   * Report coverage - delegate to v8 provider
   */
  async reportCoverage(coverageMap: unknown, context: ReportContext): Promise<void> {
    if (!this.v8Provider) {
      throw new AssemblyScriptPoolError(
        'HybridCoverageProvider - reportCoverage failed to delegate to internal v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }

    debug(`[HybridCoverageProvider] Reporting coverage (allTestsRun=${context.allTestsRun})`);
    await this.v8Provider.reportCoverage(coverageMap, context);
  }

  /**
   * Resolve options
   */
  resolveOptions(): ResolvedHybridProviderOptions {
    if (!this.v8Provider) {
      throw new AssemblyScriptPoolError(
        'HybridCoverageProvider - resolveOptions failed to delegate to internal v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }
    
    debug(`[HybridCoverageProvider] Resolving Coverage Options`);
  
    const definedCoverageOptions = this.projectConfig.coverage as CustomProviderOptions;
    const resolvedV8Options = this.v8Provider.resolveOptions() as ResolvedCoverageOptions<'v8'>;

    // For some reason the v8 provider builds its `excludes` values to include a null byte.
    // Remove null bytes for logging purposes so tools like grep won't complain about binary content.
    const sanitizedV8Options: ResolvedCoverageOptions<'v8'> = {
      ...resolvedV8Options,
      include: resolvedV8Options.include?.map(i => i.replace(/\0/g, '')) || undefined,
      exclude: resolvedV8Options.exclude?.map(i => i.replace(/\0/g, '')) || undefined
    };

    debug(`[HybridCoverageProvider]   AS include: ${(definedCoverageOptions.assemblyScriptInclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider]   AS exclude: ${(definedCoverageOptions.assemblyScriptExclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider]   JS include: ${(sanitizedV8Options.include || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider]   JS exclude: ${(sanitizedV8Options.exclude || []).join(', ') || '(none)'}`);

    debug(`[HybridCoverageProvider] Globbing AS source files to include for coverage map basis`);
    const globbedAssemblyScriptInclude = globFiles(
      definedCoverageOptions.assemblyScriptInclude || [],
      definedCoverageOptions.assemblyScriptExclude || [],
      this.projectConfig.root
    );
    debug(`[HybridCoverageProvider]   Including ${globbedAssemblyScriptInclude.length} AS files in coverage map`);
    
    const globbedAssemblyScriptExcludeOnly = globFiles(
      definedCoverageOptions.assemblyScriptExclude || [],
      [],
      this.projectConfig.root
    );
    debug(`[HybridCoverageProvider]   Excluding ${globbedAssemblyScriptExcludeOnly.length} AS files from coverage map & instrumentation`);
    
    const resolvedCoverageOptions: ResolvedHybridProviderOptions = {
      ...resolvedV8Options,
      provider: 'custom',
      customProviderModule: definedCoverageOptions.customProviderModule,
      assemblyScriptInclude: definedCoverageOptions.assemblyScriptInclude ?? [],
      assemblyScriptExclude: definedCoverageOptions.assemblyScriptExclude ?? [],
      globbedAssemblyScriptInclude,
      globbedAssemblyScriptProjectRelativeExcludeOnly : globbedAssemblyScriptExcludeOnly.map(gr => gr.projectRootRelative)
    }; 

    this.coverageOptions = resolvedCoverageOptions;
    return resolvedCoverageOptions;
  }

  /**
   * Clean coverage data
   */
  async clean(clean?: boolean): Promise<void> {
    debug('[HybridCoverageProvider] Clean coverage data - clean:', clean);
    if (clean) {
      this.accumulatedCoverageData = { hitCountsByFileAndPosition: {} };
      debug('[HybridCoverageProvider] Cleaning coverage data');
    }
    if (this.v8Provider) {
      await this.v8Provider.clean(clean);
    }
  }
}

/**
 * Export provider module for Vitest
 */
export default {
  getProvider: () => new HybridCoverageProvider(),
  takeCoverage: async (...args: any[]) => {
    debug('[HybridCoverageProvider] takeCoverage called - delegating to v8');
    return await (v8CoverageModule.takeCoverage as any)(...args);
  },
  startCoverage: async (...args: any[]) => {
    debug('[HybridCoverageProvider] startCoverage called - delegating to v8');
    return await (v8CoverageModule.startCoverage as any)(...args);
  },
  stopCoverage: async (...args: any[]) => {
    debug('[HybridCoverageProvider] stopCoverage called - delegating to v8');
    return await (v8CoverageModule.stopCoverage as any)(...args);
  },
};
