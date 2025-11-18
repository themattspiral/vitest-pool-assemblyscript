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
import type { AssemblyScriptCoveragePayload } from '../types.js';
import { debug, setDebugMode } from '../utils/debug.mjs';
import { getPoolOptions } from '../pool/options.js';

export class HybridCoverageProvider implements CoverageProvider {
  name = 'hybrid-assemblyscript-v8' as const;

  private v8Provider!: CoverageProvider; // TODO - WHY ARE WE DOING NON-NULL ASSERTIONS INSTEAD OF ERROR HANDLING
  private asCoverageMap = libCoverage.createCoverageMap();

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

    // Get v8 provider from the coverage module
    this.v8Provider = await v8CoverageModule.getProvider();
    await this.v8Provider.initialize(ctx);

    debug('[HybridCoverageProvider] Initialized with v8 provider');
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

      const fileCount = Object.keys(coverageData.functionsByFilePath).length;
      const funcCount = Object.values(coverageData.functionsByFilePath)
        .reduce((sum, funcs) => sum + Object.keys(funcs).length, 0);
      debug(`[HybridCoverageProvider] AS coverage payload: ${fileCount} files, ${funcCount} functions`);

      // Convert each file to Istanbul format and merge into accumulated map
      for (const filePath of Object.keys(coverageData.functionsByFilePath)) {
        debug(`[HybridCoverageProvider] Converting and merging coverage for file: ${filePath}`);

        const istanbulData = convertToIstanbulFormat(coverageData, filePath);
        const fileMap = libCoverage.createCoverageMap();
        fileMap.addFileCoverage(istanbulData);
        this.asCoverageMap.merge(fileMap);

        debug(`[HybridCoverageProvider] Merged ${Object.keys(istanbulData.f).length} functions for ${filePath}`);
      }

      debug(`[HybridCoverageProvider] AS coverage map now has ${Object.keys(this.asCoverageMap.data).length} files`);
    } else {
      // Delegate to v8 provider for all other formats (JS, etc.)
      debug('[HybridCoverageProvider] Delegating to v8 provider');
      await this.v8Provider.onAfterSuiteRun(meta);
    }
  }

  /**
   * Generate unified coverage map (merging JS and AS coverage)
   */
  async generateCoverage(context: ReportContext): Promise<unknown> {
    debug('[HybridCoverageProvider] Generating coverage...');

    // Get JS coverage from v8 provider (already in Istanbul format)
    debug('[HybridCoverageProvider] Getting JS coverage from v8 provider');
    const jsCoverage = await this.v8Provider.generateCoverage(context) as CoverageMap;
    debug(`[HybridCoverageProvider] JS coverage has ${Object.keys(jsCoverage.data).length} files`);
    debug(`[HybridCoverageProvider] JS coverage file paths:`, Object.keys(jsCoverage.data));

    // AS coverage already accumulated in Istanbul format
    debug(`[HybridCoverageProvider] AS coverage has ${Object.keys(this.asCoverageMap.data).length} files`);
    debug(`[HybridCoverageProvider] AS coverage file paths:`, Object.keys(this.asCoverageMap.data));

    // Merge both coverage maps
    debug('[HybridCoverageProvider] Merging coverage maps');
    jsCoverage.merge(this.asCoverageMap);
    debug(`[HybridCoverageProvider] Merged coverage has ${Object.keys(jsCoverage.data).length} files`);
    debug(`[HybridCoverageProvider] Merged coverage file paths:`, Object.keys(jsCoverage.data));

    return jsCoverage;
  }

  /**
   * Report coverage - delegate to v8 provider
   */
  async reportCoverage(coverage: unknown, context: ReportContext): Promise<void> {
    debug('[HybridCoverageProvider] Reporting coverage...');
    await this.v8Provider.reportCoverage(coverage, context);
  }

  /**
   * Resolve options - delegate to v8 provider
   */
  resolveOptions(): ResolvedCoverageOptions {
    return this.v8Provider.resolveOptions();
  }

  /**
   * Clean coverage data
   */
  async clean(clean?: boolean): Promise<void> {
    debug('[HybridCoverageProvider] Cleaning coverage data');
    this.asCoverageMap = libCoverage.createCoverageMap();
    await this.v8Provider.clean(clean);
  }
}

/**
 * Export provider module for Vitest
 */
export default {
  getProvider: () => new HybridCoverageProvider(),
  takeCoverage: () => {
    // Not used - v8 provider handles this for JS, we handle AS in pool
  },
  startCoverage: () => {
    // Not used - v8 provider handles this for JS, we instrument AS at compile time
  }
};
