/**
 * Hybrid Coverage Provider POC
 *
 * This provider handles BOTH JavaScript and AssemblyScript coverage in a single provider.
 * - Delegates JS coverage to Vitest's v8 provider
 * - Converts AS coverage to Istanbul format
 * - Merges both into a unified coverage report
 */

import type { CoverageProvider, Vitest, AfterSuiteRunMeta, ReportContext, ResolvedCoverageOptions } from 'vitest/node';
import type { CoverageMap } from 'istanbul-lib-coverage';
import libCoverage from 'istanbul-lib-coverage';
import v8CoverageModule from '@vitest/coverage-v8';

/**
 * AS coverage data structure (from our pool)
 */
interface ASCoverageData {
  coverage: {
    functions: Record<number, number>; // funcIdx -> hitCount
  };
  debugInfo: {
    functions: Array<{
      name: string;
      startLine: number;
      endLine: number;
      fileIdx: number;
    }>;
    files: string[];
  };
}

export class HybridCoverageProvider implements CoverageProvider {
  name = 'hybrid-assemblyscript-v8' as const;

  private v8Provider!: CoverageProvider;
  private asCoverageData = new Map<string, ASCoverageData>();

  /**
   * Initialize the provider and get reference to v8 provider
   */
  async initialize(ctx: Vitest): Promise<void> {
    console.log('[HybridCoverageProvider] Initializing...');

    // Get v8 provider from the coverage module
    this.v8Provider = await v8CoverageModule.getProvider();
    await this.v8Provider.initialize(ctx);

    console.log('[HybridCoverageProvider] Initialized with v8 provider');
  }

  /**
   * Handle suite completion - delegate based on coverage format marker
   */
  async onAfterSuiteRun(meta: AfterSuiteRunMeta): Promise<void> {
    const coverage = meta.coverage as any;

    console.log(`[HybridCoverageProvider] onAfterSuiteRun - files: ${meta.testFiles.join(', ')}, format: ${coverage?.__format || 'unknown'}`);

    // Check for AssemblyScript format marker
    if (coverage?.__format === 'assemblyscript') {
      // Store AS coverage data for later conversion
      const { coverage: aggregatedCoverage, debugInfo } = coverage;

      console.log(`[HybridCoverageProvider] Storing AS coverage for files: ${debugInfo.files.join(', ')}`);

      // Store by file path from debugInfo
      for (const filePath of debugInfo.files) {
        this.asCoverageData.set(filePath, {
          coverage: aggregatedCoverage,
          debugInfo
        });
      }
    } else {
      // Delegate to v8 provider for all other formats (JS, etc.)
      console.log('[HybridCoverageProvider] Delegating to v8 provider');
      await this.v8Provider.onAfterSuiteRun(meta);
    }
  }

  /**
   * Convert AS coverage data to Istanbul format
   */
  private convertASToIstanbul(asCoverageData: Map<string, ASCoverageData>): CoverageMap {
    const map = libCoverage.createCoverageMap();

    for (const [filePath, data] of asCoverageData) {
      console.log(`[HybridCoverageProvider] Converting AS coverage for ${filePath}`);

      const { coverage, debugInfo } = data;
      console.log(`[HybridCoverageProvider] debugInfo.files:`, debugInfo.files);
      console.log(`[HybridCoverageProvider] debugInfo.functions count: ${debugInfo.functions.length}`);
      console.log(`[HybridCoverageProvider] debugInfo.functions:`, JSON.stringify(debugInfo.functions, null, 2));

      // Build Istanbul format structures
      const fnMap: Record<string, any> = {};
      const f: Record<string, number> = {};

      debugInfo.functions.forEach((funcInfo, idx) => {
        // Skip functions without metadata
        if (funcInfo.startLine === 0) {
          return;
        }

        const hitCount = coverage.functions[idx] || 0;

        // Add function mapping
        fnMap[idx] = {
          name: funcInfo.name,
          decl: {
            start: { line: funcInfo.startLine, column: 0 },
            end: { line: funcInfo.endLine, column: 0 }
          },
          loc: {
            start: { line: funcInfo.startLine, column: 0 },
            end: { line: funcInfo.endLine, column: 0 }
          },
          line: funcInfo.startLine
        };
        f[idx] = hitCount;

        console.log(`[HybridCoverageProvider]   Function ${funcInfo.name} at line ${funcInfo.startLine}: ${hitCount} hits`);
      });

      // Add file coverage to map
      // Note: We only track function-level coverage for AssemblyScript files currently.
      // statementMap/s and branchMap/b are empty - statement/branch coverage not yet implemented.
      // The coverage report will show N/A or 0% for statements/branches.
      map.addFileCoverage({
        path: filePath,
        fnMap,
        f,
        statementMap: {},
        s: {},
        branchMap: {},
        b: {}
      });
    }

    return map;
  }

  /**
   * Generate unified coverage map (merging JS and AS coverage)
   */
  async generateCoverage(context: ReportContext): Promise<CoverageMap> {
    console.log('[HybridCoverageProvider] Generating coverage...');

    // Get JS coverage from v8 provider (already in Istanbul format)
    console.log('[HybridCoverageProvider] Getting JS coverage from v8 provider');
    const jsCoverage = await this.v8Provider.generateCoverage(context);
    console.log(`[HybridCoverageProvider] JS coverage has ${Object.keys(jsCoverage.data).length} files`);

    // Convert AS coverage to Istanbul format
    console.log('[HybridCoverageProvider] Converting AS coverage');
    const asCoverage = this.convertASToIstanbul(this.asCoverageData);
    console.log(`[HybridCoverageProvider] AS coverage has ${Object.keys(asCoverage.data).length} files`);

    // Merge both coverage maps
    console.log('[HybridCoverageProvider] Merging coverage maps');
    jsCoverage.merge(asCoverage);
    console.log(`[HybridCoverageProvider] Merged coverage has ${Object.keys(jsCoverage.data).length} files`);

    return jsCoverage;
  }

  /**
   * Report coverage - delegate to v8 provider
   */
  async reportCoverage(coverageMap: CoverageMap, context: ReportContext): Promise<void> {
    console.log('[HybridCoverageProvider] Reporting coverage...');
    await this.v8Provider.reportCoverage(coverageMap, context);
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
    console.log('[HybridCoverageProvider] Cleaning coverage data');
    this.asCoverageData.clear();
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
