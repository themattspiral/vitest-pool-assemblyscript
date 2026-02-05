/**
 * Hybrid Coverage Provider
 *
 * This provider handles both AssemblyScript and JavaScript and coverage
 * - Converts AS coverage to Istanbul format
 * - Delegates JS coverage to Vitest's v8 provider
 * - Merges both into a unified coverage report
 */

import { basename, relative } from 'node:path';
import type {
  CoverageProvider,
  Vitest,
  ReportContext,
  ResolvedCoverageOptions,
  CustomProviderOptions,
  ResolvedConfig,
} from 'vitest/node';
import type { AfterSuiteRunMeta, SerializedConfig } from 'vitest';
import v8CoverageModule from '@vitest/coverage-v8';
import type { CoverageMap } from 'istanbul-lib-coverage';
import istanbulCoverage from 'istanbul-lib-coverage';
const { createCoverageMap } = istanbulCoverage;

// pick up CustomProviderOptions module augmentation
import '../config/custom-provider-options.js';

import { convertToIstanbulFormat } from './istanbul-converter.js';
import { parseFunctionsFromFile } from './ast-parser.js';
import { globFiles } from './glob-utils.js';
import { getProjectSerializedOrGlobalConfig } from '../util/resolve-config.js';
import { mergeCoverageData } from './coverage-merge.js';
import { debug } from '../util/debug.js';
import { createPoolError } from '../util/pool-errors.js';
import type {
  AssemblyScriptCoveragePayload,
  CoverageData,
  GlobResult,
  ResolvedHybridProviderOptions,
} from '../types/types.js';
import {
  POOL_ERROR_NAMES,
  COVERAGE_PAYLOAD_FORMATS
} from '../types/constants.js';
import { warnIfASCoverageNotSupported } from '../util/node-check.js';

export class HybridCoverageProvider implements CoverageProvider {
  name = 'hybrid-assemblyscript-v8' as const;

  private v8Provider: CoverageProvider | undefined;
  private accumulatedCoverageData: CoverageData = { hitCountsByFileAndPosition: {} };
  private projectConfig: SerializedConfig | ResolvedConfig = {} as SerializedConfig;
  private coverageOptions: ResolvedHybridProviderOptions = {} as ResolvedHybridProviderOptions;

  /**
   * Initialize the provider and get reference to v8 provider
   */
  async initialize(ctx: Vitest): Promise<void> {
    this.projectConfig = getProjectSerializedOrGlobalConfig(ctx).config;

    debug('[HybridCoverageProvider] Initializing Provider');

    // Get v8 provider from the coverage module
    this.v8Provider = await v8CoverageModule.getProvider();

    if (!this.v8Provider) {
      throw createPoolError(
        'HybridCoverageProvider - initialize failed to get delegated v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }

    await this.v8Provider.initialize(ctx);
    this.v8Provider.name = 'hybrid-assemblyscript-v8 (delegated v8 reporter)' as const;
    debug('[HybridCoverageProvider] Initialized with delegated v8 provider');

    warnIfASCoverageNotSupported();
  }

  /**
   * Handle suite completion - delegate based on coverage format marker
   */
  async onAfterSuiteRun(meta: AfterSuiteRunMeta): Promise<void> {
    const start = performance.now();
    const format: string | undefined = (meta?.coverage as any)?.__format;
    let suiteLogLabel = meta.testFiles.length > 0 ? basename(meta.testFiles[0]!) : '';

    // Check for AssemblyScript format marker
    if (format === COVERAGE_PAYLOAD_FORMATS.AssemblyScript) {
      const payload = meta.coverage as AssemblyScriptCoveragePayload;
      const { coverageData, suiteLogLabel: label } = payload;
      suiteLogLabel = label;

      debug(() => {
        const fileCount = Object.keys(coverageData.hitCountsByFileAndPosition).length;
        const positionCount = Object.values(coverageData.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Suite payload: ${positionCount} unique positions over ${fileCount} source files`;
      });

      // Merge incoming coverage data into accumulated (by position, summing hit counts)
      mergeCoverageData(this.accumulatedCoverageData, coverageData);

      debug(() => {
        const fileCount = Object.keys(this.accumulatedCoverageData.hitCountsByFileAndPosition).length;
        const positionCount = Object.values(this.accumulatedCoverageData.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Accumulated coverage: ${positionCount} unique positions over ${fileCount} source files`;
      });
    } else {
      // Delegate to v8 provider for all other formats (JS, etc.)
      if (!this.v8Provider) {
        throw createPoolError(
          'HybridCoverageProvider - onAfterSuiteRun failed to delegate to v8 provider',
          POOL_ERROR_NAMES.HybridCoverageProviderError
        );
      }

      debug(`[HybridCoverageProvider] ${suiteLogLabel} - Delegating to v8 provider`);
      await this.v8Provider.onAfterSuiteRun(meta);
    }

    debug(() => {
      const files = meta.testFiles.map(tf => relative(this.projectConfig.root, tf)).join(',');
      return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun complete - TIMING ${(performance.now() - start).toFixed(2)} ms | testFiles: "${files}"`;
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
      throw createPoolError(
        'HybridCoverageProvider - generateCoverage failed to delegate to v8 provider',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }

    // Build AS coverage map
    let asCoverageMap = createCoverageMap();

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
        debug(`[HybridCoverageProvider] Parsing AS source for expected coverage: "${include.absolute}"`);
        
        const functionsByStartLine = await parseFunctionsFromFile(include.absolute, include.projectRootRelative) || {};
        debug(`[HybridCoverageProvider] Parsed ${Object.keys(functionsByStartLine).length} AS source functions in "${include.absolute}"`);

        const fileHitCountsByPosition = this.accumulatedCoverageData.hitCountsByFileAndPosition[include.absolute] ?? {};
        debug(`[HybridCoverageProvider] Accumulated AS coverage has ${Object.keys(fileHitCountsByPosition).length} positions for "${include.absolute}"`);

        // Containment matching (binary hit position → source) is performed during istanbul conversion
        return convertToIstanbulFormat(functionsByStartLine, fileHitCountsByPosition, include.absolute, this.coverageOptions.debugIstanbul);
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
    debug(`[HybridCoverageProvider] TIMING AS generateCoverage: ${(asGenerateEnd - start).toFixed(2)} ms`);

    // Get JS coverage from v8 provider
    debug('[HybridCoverageProvider] Getting JS coverage from v8 provider');
    const jsCoverage = await this.v8Provider.generateCoverage(context) as CoverageMap;
    debug(`[HybridCoverageProvider] JS coverage has ${Object.keys(jsCoverage.data).length} files`);
    debug(`[HybridCoverageProvider] TIMING JS generateCoverage: ${(performance.now() - asGenerateEnd).toFixed(2)} ms`);

    // Merge AS coverage into JS coverage.
    // Use toJSON() to pass plain data instead of the CoverageMap instance. This avoids
    // instanceof failures when istanbul-lib-coverage is loaded from different module paths
    // (e.g. the pool workers resolve one copy while the coverage provider resolves another).
    if (asCoverageMap.files().length) {
      debug('[HybridCoverageProvider] Merging AS coverage into JS coverage');
      jsCoverage.merge(asCoverageMap.toJSON());
    } else {
      debug('[HybridCoverageProvider] AS coverage map empty, not merging into JS coverage');
    }
    debug(`[HybridCoverageProvider] Final merged coverage has ${Object.keys(jsCoverage.data).length} files`);

    debug(`[HybridCoverageProvider] TIMING Total generateCoverage: ${(performance.now() - start).toFixed(2)} ms`);

    return jsCoverage;
  }

  /**
   * Report coverage - delegate to v8 provider
   */
  async reportCoverage(coverageMap: unknown, context: ReportContext): Promise<void> {
    if (!this.v8Provider) {
      throw createPoolError(
        'HybridCoverageProvider - reportCoverage failed to delegate to v8 provider',
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
      throw createPoolError(
        'HybridCoverageProvider - resolveOptions failed to delegate to v8 provider',
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

    debug(`[HybridCoverageProvider] AS include: ${(definedCoverageOptions.assemblyScriptInclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] AS exclude: ${(definedCoverageOptions.assemblyScriptExclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] JS include: ${(sanitizedV8Options.include || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] JS exclude: ${(sanitizedV8Options.exclude || []).join(', ') || '(none)'}`);

    debug(`[HybridCoverageProvider] Globbing AS source files to include for coverage map basis`);
    const globbedAssemblyScriptInclude = globFiles(
      definedCoverageOptions.assemblyScriptInclude || [],
      definedCoverageOptions.assemblyScriptExclude || [],
      this.projectConfig.root
    );
    debug(`[HybridCoverageProvider] Including ${globbedAssemblyScriptInclude.length} AS files in coverage map`);
    
    const globbedAssemblyScriptExcludeOnly = globFiles(
      definedCoverageOptions.assemblyScriptExclude || [],
      [],
      this.projectConfig.root
    );
    debug(`[HybridCoverageProvider] Excluding ${globbedAssemblyScriptExcludeOnly.length} AS files from coverage map & instrumentation`);
    
    const resolvedCoverageOptions: ResolvedHybridProviderOptions = {
      ...resolvedV8Options,
      provider: 'custom',
      customProviderModule: definedCoverageOptions.customProviderModule,
      debugIstanbul: definedCoverageOptions.debugIstanbul ?? false,
      assemblyScriptInclude: definedCoverageOptions.assemblyScriptInclude ?? [],
      assemblyScriptExclude: definedCoverageOptions.assemblyScriptExclude ?? [],
      globbedAssemblyScriptInclude,
      globbedAssemblyScriptProjectRelativeExcludeOnly : globbedAssemblyScriptExcludeOnly.map(gr => gr.projectRootRelative)
    }; 

    this.coverageOptions = resolvedCoverageOptions;
    return resolvedCoverageOptions;
  }

  async clean(clean: boolean = true): Promise<void> {
    debug('[HybridCoverageProvider] Clean coverage data - clean:', clean);
    if (clean) {
      this.accumulatedCoverageData = { hitCountsByFileAndPosition: {} };
      debug('[HybridCoverageProvider] Cleaned all internal coverage data');
    }

    if (this.v8Provider) {
      await this.v8Provider.clean(clean);
      debug(`[HybridCoverageProvider] V8 provider finished clean(${clean})`);
    }
  }
}
