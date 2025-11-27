/**
 * Hybrid Coverage Provider
 *
 * This provider handles BOTH JavaScript and AssemblyScript coverage in a single provider.
 * - Delegates JS coverage to Vitest's v8 provider
 * - Converts AS coverage to Istanbul format
 * - Merges both into a unified coverage report
 */

import type { CoverageProvider, Vitest, ReportContext, ResolvedCoverageOptions } from 'vitest/node';
import type { AfterSuiteRunMeta } from 'vitest';
import type { CoverageMap } from 'istanbul-lib-coverage';
import libCoverage from 'istanbul-lib-coverage';
import v8CoverageModule from '@vitest/coverage-v8';
import { convertToIstanbulFormat } from './istanbul-converter.js';
import { parseFunctionsFromFiles } from './ast-parser.js';
import { globAsFiles } from './glob-utils.js';
import { mergeCoverageData, buildMergedCoverageData } from './coverage-merge.js';
import type { AssemblyScriptCoveragePayload, CoverageData } from '../types.js';
import { debug, setDebugMode } from '../utils/debug.mjs';
import { getPoolOptions } from '../pool/options.js';

export class HybridCoverageProvider implements CoverageProvider {
  name = 'hybrid-assemblyscript-v8' as const;

  private v8Provider: CoverageProvider | undefined;
  private projectRoot: string | undefined;
  private accumulatedCoverageData: CoverageData = { positionCoverageByAbsoluteFilePath: {} };
  private assemblyScriptInclude: string[] = [];
  private assemblyScriptExclude: string[] = [];

  /**
   * Initialize the provider and get reference to v8 provider
   */
  async initialize(ctx: Vitest): Promise<void> {
    let projectConfig = ctx.config;

    // TODO - extract the multi-project config logic, it's repeated here
    if (ctx.projects && ctx.projects.length > 0) {
      // Multi-project mode: find the first project using this pool
      const project = ctx.projects.find(p => {
        return typeof p.config.pool === 'string' && !!p.config.poolOptions?.assemblyScript;
      });

      if (project) {
        projectConfig = project.config;
      }
    }

    const poolOptions = getPoolOptions(projectConfig);
    setDebugMode(poolOptions.debug);
    debug('[HybridCoverageProvider] Initializing...');

    // Store project root for later use in generateCoverage
    this.projectRoot = ctx.config.root;

    // Get v8 provider from the coverage module
    this.v8Provider = await v8CoverageModule.getProvider();

    // Validate required fields are set
    if (!this.projectRoot || !this.v8Provider) {
      throw new Error(
        '[HybridCoverageProvider] Failed to initialize: ' +
        `projectRoot=${this.projectRoot ? this.projectRoot : 'undefined'}, ` +
        `v8Provider=${this.v8Provider ? 'set' : 'undefined'}`
      );
    }

    await this.v8Provider.initialize(ctx);
    this.v8Provider.name = 'hybrid-assemblyscript-v8 (delegated reporter)';

    // Store AS-specific coverage patterns from config
    // These are set via CustomProviderOptions augmentation
    const coverageConfig = ctx.config.coverage as {
      assemblyScriptInclude?: string[];
      assemblyScriptExclude?: string[];
    };
    this.assemblyScriptInclude = coverageConfig.assemblyScriptInclude ?? [];
    this.assemblyScriptExclude = coverageConfig.assemblyScriptExclude ?? [];

    debug('[HybridCoverageProvider] Initialized with v8 provider');
    debug(`[HybridCoverageProvider] AS include patterns: ${this.assemblyScriptInclude.join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] AS exclude patterns: ${this.assemblyScriptExclude.join(', ') || '(none)'}`);
  }

  /**
   * Handle suite completion - delegate based on coverage format marker
   */
  async onAfterSuiteRun(meta: AfterSuiteRunMeta): Promise<void> {
    const coverage = meta.coverage as AssemblyScriptCoveragePayload | unknown;

    const format = (coverage as AssemblyScriptCoveragePayload)?.__format;
    debug(`[HybridCoverageProvider] onAfterSuiteRun - testFiles: ${meta.testFiles.join(', ')}, format: ${format || 'unknown'}`);

    // Check for AssemblyScript format marker
    if (format === 'assemblyscript') {
      const payload = coverage as AssemblyScriptCoveragePayload;
      const { coverageData } = payload;

      const fileCount = Object.keys(coverageData.positionCoverageByAbsoluteFilePath).length;
      const funcCount = Object.values(coverageData.positionCoverageByAbsoluteFilePath)
        .reduce((sum, funcs) => sum + Object.keys(funcs).length, 0);
      debug(`[HybridCoverageProvider] AS coverage payload: ${fileCount} files, ${funcCount} functions`);

      // Merge incoming coverage data into accumulated (by position, summing hit counts)
      mergeCoverageData(this.accumulatedCoverageData, coverageData);

      const accumulatedFileCount = Object.keys(this.accumulatedCoverageData.positionCoverageByAbsoluteFilePath).length;
      debug(`[HybridCoverageProvider] Accumulated coverage now has ${accumulatedFileCount} files`);
    } else {
      // Delegate to v8 provider for all other formats (JS, etc.)
      if (!this.v8Provider) {
        throw new Error('[HybridCoverageProvider] Not initialized. Call initialize() first.');
      }
      debug('[HybridCoverageProvider] Delegating to v8 provider');
      await this.v8Provider.onAfterSuiteRun(meta);
    }
  }

  /**
   * Generate unified coverage map (merging JS and AS coverage)
   *
   * Flow:
   * 1. Glob ALL AS files from assemblyScriptInclude patterns
   * 2. Parse them to get sourceDebugInfo (source of truth for line numbers)
   * 3. Build merged CoverageData (all source functions + accumulated hit counts)
   * 4. Convert merged CoverageData to Istanbul format
   * 5. Get JS coverage from v8 provider
   * 6. Merge AS coverage into JS coverage
   */
  async generateCoverage(context: ReportContext): Promise<unknown> {
    debug('[HybridCoverageProvider] Generating coverage...');

    // Validate initialization
    if (!this.v8Provider || !this.projectRoot) {
      throw new Error('[HybridCoverageProvider] Not initialized. Call initialize() first.');
    }

    // Build AS coverage map
    let asCoverageMap = libCoverage.createCoverageMap();

    if (this.assemblyScriptInclude.length > 0) {
      // Step 1: Glob AS files matching include/exclude patterns
      debug(`[HybridCoverageProvider] Globbing AS files with patterns: ${this.assemblyScriptInclude.join(', ')}`);
      const asFiles = await globAsFiles(
        this.assemblyScriptInclude,
        this.assemblyScriptExclude,
        this.projectRoot
      );
      debug(`[HybridCoverageProvider] Found ${asFiles.length} AS source files`);

      if (asFiles.length > 0) {
        // Step 2: Parse ALL AS files to get complete function list
        debug('[HybridCoverageProvider] Parsing AS files for function metadata...');
        const sourceDebugInfo = parseFunctionsFromFiles(asFiles, this.projectRoot);
        const fileCount = Object.keys(sourceDebugInfo.qualifiedFunctionsByAbsoluteFilePath).length;
        const funcCount = Object.values(sourceDebugInfo.qualifiedFunctionsByAbsoluteFilePath)
          .reduce((sum, funcs) => sum + Object.keys(funcs).length, 0);
        debug(`[HybridCoverageProvider] Parsed ${funcCount} functions from ${fileCount} files`);

        const accumulatedFuncCount = Object.values(this.accumulatedCoverageData.positionCoverageByAbsoluteFilePath)
          .reduce((sum, funcs) => sum + Object.keys(funcs).length, 0);
        debug(`[HybridCoverageProvider] Accumulated coverage has ${accumulatedFuncCount} functions`);
        
        // Step 3: Build merged CoverageData that:
        //  - contains all source functions from sourceDebugInfo
        //  - maps accumulated hit counts onto these functions
        const mergedCoverageData = buildMergedCoverageData(sourceDebugInfo, this.accumulatedCoverageData);

        // Step 4: Convert merged CoverageData to Istanbul format
        for (const filePath of Object.keys(mergedCoverageData.positionCoverageByAbsoluteFilePath)) {
          const istanbulData = convertToIstanbulFormat(mergedCoverageData, filePath);
          asCoverageMap.addFileCoverage(istanbulData);
        }
        debug(`[HybridCoverageProvider] Built AS coverage map with ${Object.keys(asCoverageMap.data).length} files`);
      }
    } else {
      debug('[HybridCoverageProvider] No assemblyScriptInclude patterns configured, skipping AS source globbing');
    }

    // Step 5: Get JS coverage from v8 provider
    debug('[HybridCoverageProvider] Getting JS coverage from v8 provider');
    const jsCoverage = await this.v8Provider.generateCoverage(context) as CoverageMap;
    debug(`[HybridCoverageProvider] JS coverage has ${Object.keys(jsCoverage.data).length} files`);

    // Step 6: Merge AS coverage into JS coverage
    debug('[HybridCoverageProvider] Merging AS coverage into JS coverage');
    jsCoverage.merge(asCoverageMap);
    debug(`[HybridCoverageProvider] Final merged coverage has ${Object.keys(jsCoverage.data).length} files`);

    return jsCoverage;
  }

  /**
   * Report coverage - delegate to v8 provider
   */
  async reportCoverage(coverageMap: unknown, context: ReportContext): Promise<void> {
    if (!this.v8Provider) {
      throw new Error('[HybridCoverageProvider] No v8 Provider available for reporting. Call initialize() first.');
    }
    debug(`[HybridCoverageProvider] Reporting coverage (allTestsRun=${context.allTestsRun})`);
    await this.v8Provider.reportCoverage(coverageMap, context);
  }

  /**
   * Resolve options - delegate to v8 provider
   */
  resolveOptions(): ResolvedCoverageOptions {
    if (!this.v8Provider) {
      throw new Error('[HybridCoverageProvider] No v8 Provider available for resolveOptions. Call initialize() first.');
    }
    return this.v8Provider.resolveOptions();
  }

  /**
   * Clean coverage data
   */
  async clean(clean?: boolean): Promise<void> {
    debug('[HybridCoverageProvider] Cleaning coverage data');
    this.accumulatedCoverageData = { positionCoverageByAbsoluteFilePath: {} };
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
    debug('[HybridCoverageProvider] takeCoverage called');
    return await (v8CoverageModule.takeCoverage as any)(...args);
  },
  startCoverage: async (...args: any[]) => {
    debug('[HybridCoverageProvider] startCoverage called');
    return await (v8CoverageModule.startCoverage as any)(...args);
  },
  stopCoverage: async (...args: any[]) => {
    debug('[HybridCoverageProvider] stopCoverage called');
    return await (v8CoverageModule.stopCoverage as any)(...args);
  },
};
