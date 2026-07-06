/**
 * Hybrid Coverage Provider
 *
 * This provider handles both AssemblyScript and JavaScript coverage
 * - Converts AS coverage to Istanbul format
 * - Delegates JS coverage to a built-in vitest provider (v8 or istanbul),
 *   fixed per instance by the entry point that constructed it
 *   (`/coverage-v8` or `/coverage-istanbul`)
 * - Merges both into a unified coverage report
 */

import { basename, relative } from 'node:path';
import type {
  CoverageProvider,
  CoverageProviderModule,
  Vitest,
  ReportContext,
  ResolvedCoverageOptions,
} from 'vitest/node';

import type { AfterSuiteRunMeta } from 'vitest';
import type { CoverageMap } from 'istanbul-lib-coverage';
import istanbulCoverage from 'istanbul-lib-coverage';
const { createCoverageMap } = istanbulCoverage;

import { convertToIstanbulFormat } from './istanbul-converter.js';
import { parseFunctionsFromFile } from './ast-parser.js';
import { globFiles } from './glob-utils.js';
import { mergeCoverageBundle, emptyCoverageBundle } from './coverage-merge.js';
import { debug } from '../util/debug.js';
import { createPoolError } from '../util/pool-errors.js';
import { loadDelegateCoverageModule } from './delegate-loader.js';
import type {
  AssemblyScriptCoveragePayload,
  CoverageBundle,
  GlobResult,
  JsCoverageProvider,
  ResolvedHybridProviderOptions,
} from '../types/types.js';
import {
  JS_COVERAGE_PROVIDERS,
  POOL_ERROR_NAMES,
  COVERAGE_PAYLOAD_FORMATS
} from '../types/constants.js';
import { warnIfASCoverageNotSupportedByNode, warnIfNativeBuildFailed } from '../util/feature-check.js';

const HYBRID_PROVIDER_NAME = 'coverage-assemblyscript' as const;

/** npm package that supplies each delegated JS coverage provider */
const JS_PROVIDER_PACKAGES: Record<JsCoverageProvider, string> = {
  [JS_COVERAGE_PROVIDERS.V8]: '@vitest/coverage-v8',
  [JS_COVERAGE_PROVIDERS.Istanbul]: '@vitest/coverage-istanbul',
};

/**
 * Optional CoverageProvider hooks forwarded to the delegated provider.
 *
 * Attached dynamically in `initialize()` (rather than declared as class
 * methods) so that hook EXISTENCE on the hybrid provider mirrors the selected
 * delegate exactly: vitest existence-checks these hooks at their call sites
 * (e.g. `onFileTransform` gates both the coverage transform plugin and
 * module-cache invalidation), so a hook must not exist here when the delegate
 * doesn't implement it.
 *
 * `mergeReports` is deliberately NOT forwarded: with this provider, blob-mode
 * coverage payloads can include AssemblyScript-format entries the delegates
 * can't parse, so `--merge-reports` coverage remains unsupported rather than
 * failing mid-merge.
 */
const DELEGATED_OPTIONAL_HOOKS = [
  'onFileTransform',
  'onEnabled',
  'requiresTransform',
  'onTestRunStart',
  'onTestFailure',
] as const;

type DelegatedOptionalHook = typeof DELEGATED_OPTIONAL_HOOKS[number];

export class HybridCoverageProvider implements CoverageProvider {
  name: string = HYBRID_PROVIDER_NAME;

  private delegatedProvider: CoverageProvider | undefined;
  private accumulatedCoverage: CoverageBundle = emptyCoverageBundle();
  private projectRoot: string = '';
  private definedCoverageOptions: ResolvedCoverageOptions = {} as ResolvedCoverageOptions;
  private resolvedProviderOptions: ResolvedHybridProviderOptions = {} as ResolvedHybridProviderOptions;

  // Optional CoverageProvider hooks — attached in initialize() when the
  // selected delegate implements them (see DELEGATED_OPTIONAL_HOOKS)
  onFileTransform?: CoverageProvider['onFileTransform'];
  onEnabled?: CoverageProvider['onEnabled'];
  requiresTransform?: CoverageProvider['requiresTransform'];
  onTestRunStart?: CoverageProvider['onTestRunStart'];
  onTestFailure?: CoverageProvider['onTestFailure'];

  /**
   * @param jsProvider Which built-in vitest provider handles JS/TS coverage.
   *   Fixed by the entry point that constructed this instance (`/coverage-v8`
   *   or `/coverage-istanbul`) — not read from user config.
   */
  constructor(private readonly jsProvider: JsCoverageProvider) {}

  /**
   * Initialize the provider and the delegated JS coverage provider it wraps
   */
  async initialize(ctx: Vitest): Promise<void> {
    this.projectRoot = ctx.config.root;
    this.definedCoverageOptions = ctx.config.coverage;

    debug(`[HybridCoverageProvider] Initializing Provider (jsProvider: ${this.jsProvider})`);

    const delegatePackage = JS_PROVIDER_PACKAGES[this.jsProvider];

    // Preflight the selected delegate package: prompt to install it when
    // missing (interactive TTY), honoring VITEST_SKIP_INSTALL_CHECKS. Vitest's
    // own coverage preflight skips `provider: 'custom'` configs entirely, so
    // this DX is on us. Mirrors vitest by passing its version so the installed
    // delegate matches the running vitest major.
    const delegateInstalled = await ctx.packageInstaller.ensureInstalled(delegatePackage, ctx.config.root, ctx.version);
    if (!delegateInstalled) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        `JS coverage delegation requires the '${delegatePackage}' package for the '${this.jsProvider}' provider.`
          + ` Install it with: npm i -D ${delegatePackage}`,
      );
    }

    // Load the selected delegate's coverage module dynamically — both delegate
    // packages are optional peer dependencies, so only the selected one loads.
    const delegateModule: CoverageProviderModule = await loadDelegateCoverageModule(this.jsProvider);

    const delegatedProvider = await delegateModule.getProvider();

    if (!delegatedProvider) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        `initialize failed to get delegated ${this.jsProvider} provider`,
      );
    }

    await delegatedProvider.initialize(ctx);
    delegatedProvider.name = `${HYBRID_PROVIDER_NAME} (delegated ${this.jsProvider} reporter)`;
    this.delegatedProvider = delegatedProvider;

    for (const hook of DELEGATED_OPTIONAL_HOOKS) {
      this.attachDelegatedHook(delegatedProvider, hook);
    }

    debug(`[HybridCoverageProvider] Initialized with delegated ${this.jsProvider} provider`);

    warnIfASCoverageNotSupportedByNode();
    await warnIfNativeBuildFailed();
  }

  /**
   * Attach one optional delegated hook when the delegate implements it, bound
   * to the delegate so its internal state is preserved.
   */
  private attachDelegatedHook<H extends DelegatedOptionalHook>(delegate: CoverageProvider, hook: H): void {
    const delegateHook = delegate[hook];
    if (typeof delegateHook === 'function') {
      this[hook] = delegateHook.bind(delegate) as this[H];
    }
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
      suiteLogLabel = payload.suiteLogLabel;

      debug(() => {
        const fileCount = Object.keys(payload.functionHits.hitCountsByFileAndPosition).length;
        const positionCount = Object.values(payload.functionHits.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Suite payload: ${positionCount} unique positions over ${fileCount} source files`;
      });

      // Merge the incoming payload into the accumulated bundle. The payload extends
      // CoverageBundle, and each field applies its own strategy (SUM the count maps,
      // branch-merge, UNION decisionPositions + loaded files).
      mergeCoverageBundle(this.accumulatedCoverage, payload);

      debug(() => {
        const positionCount = Object.values(this.accumulatedCoverage.expressionHits.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Accumulated statement hits: ${positionCount} unique positions`;
      });

      debug(() => {
        const byFile = this.accumulatedCoverage.branchHits.hitsByFileAndDecision;
        const decisionCount = Object.values(byFile)
          .reduce((sum, decisions) => sum + Object.keys(decisions).length, 0);
        const fileCount = Object.keys(byFile).length;
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Accumulated branch coverage: ${decisionCount} decisions across ${fileCount} files`;
      });

      debug(() => {
        const fileCount = Object.keys(this.accumulatedCoverage.functionHits.hitCountsByFileAndPosition).length;
        const positionCount = Object.values(this.accumulatedCoverage.functionHits.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
        return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun - Accumulated coverage: ${positionCount} unique positions over ${fileCount} source files`;
      });
    } else {
      // Delegate all other formats (JS, etc.) to the selected JS provider
      if (!this.delegatedProvider) {
        throw createPoolError(
          POOL_ERROR_NAMES.HybridCoverageProviderError,
          'onAfterSuiteRun failed to delegate - delegated provider not initialized',
        );
      }

      debug(`[HybridCoverageProvider] ${suiteLogLabel} - Delegating to ${this.jsProvider} provider`);
      await this.delegatedProvider.onAfterSuiteRun(meta);
    }

    debug(() => {
      const files = meta.testFiles.map(tf => relative(this.projectRoot, tf)).join(',');
      return `[HybridCoverageProvider] ${suiteLogLabel} - onAfterSuiteRun complete - TIMING ${(performance.now() - start).toFixed(2)} ms | testFiles: "${files}"`;
    });
  }

  /**
   * Generate unified coverage map (merging JS and AS coverage)
   *
   * Flow:
   * 1. Parse included AS source files to get sourceDebugInfo (source of truth for line numbers)
   * 2. Build merged CoverageData (all source functions + accumulated hit counts)
   * 3. Convert merged CoverageData to Istanbul format
   * 4. Get JS coverage from the delegated provider
   * 5. Merge AS coverage into JS coverage
   */
  async generateCoverage(context: ReportContext): Promise<unknown> {
    const start = performance.now();

    debug('[HybridCoverageProvider] Generating coverage for test run');

    if (!this.delegatedProvider) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        'generateCoverage failed to delegate - delegated provider not initialized',
      );
    }

    // Build AS coverage map
    let asCoverageMap = createCoverageMap();

    if (this.resolvedProviderOptions.globbedAssemblyScriptInclude.length > 0) {
      debug(`[HybridCoverageProvider] Building AS coverage map with ${this.resolvedProviderOptions.globbedAssemblyScriptInclude.length} source files `);
      debug(() => {
        const accumulatedPositionCount = Object.values(this.accumulatedCoverage.functionHits.hitCountsByFileAndPosition)
          .reduce((sum, positions) => sum + Object.keys(positions)?.length, 0);
        const files = Object.keys(this.accumulatedCoverage.functionHits.hitCountsByFileAndPosition).length;
        return `[HybridCoverageProvider] Accumulated coverage data has ${accumulatedPositionCount} unique positions hit across ${files} debug source files`;
      });
      debug(`[HybridCoverageProvider] Accumulated loaded source files: ${this.accumulatedCoverage.loadedSourceFiles.length}`);

      // Set for per-file "was this file loaded?" lookups
      const loadedFilesSet = new Set(this.accumulatedCoverage.loadedSourceFiles);

      // parse source files with AST parser, then match to hits and convert to istanbul format
      const fileProcessingPromises = this.resolvedProviderOptions.globbedAssemblyScriptInclude.map(async (include: GlobResult) => {
        debug(`[HybridCoverageProvider] Parsing AS source for expected coverage: "${include.absolute}"`);

        // Parse AS Source with AST parser
        const parsedFunctions = await parseFunctionsFromFile(include.absolute, include.projectRootRelative) || {};
        debug(`[HybridCoverageProvider] Parsed ${Object.keys(parsedFunctions.uniqueFunctions).length} AS source lines with functions in "${include.absolute}"`);

        // Whether this file was compiled into a binary that executed — used to credit
        // module-level declarations that produce no runtime counter (see the converter).
        const fileLoaded = loadedFilesSet.has(include.absolute);

        debug(() => {
          const cov = this.accumulatedCoverage;
          const fnCount = Object.keys(cov.functionHits.hitCountsByFileAndPosition[include.absolute] ?? {}).length;
          const stmtCount = Object.keys(cov.expressionHits.hitCountsByFileAndPosition[include.absolute] ?? {}).length;
          const branchCount = Object.keys(cov.branchHits.hitsByFileAndDecision[include.absolute] ?? {}).length;
          return `[HybridCoverageProvider] Accumulated AS coverage has ${fnCount} function + ${stmtCount} statement positions + ${branchCount} branch decisions for "${include.absolute}"`;
        });

        // The converter slices the per-file view out of the bundle. Containment matching
        // (binary hit position → source) is performed during istanbul conversion.
        return convertToIstanbulFormat(parsedFunctions, this.accumulatedCoverage, fileLoaded, include.absolute, this.resolvedProviderOptions.debugIstanbul);
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

    // Get JS coverage from the delegated provider
    debug(`[HybridCoverageProvider] Getting JS coverage from ${this.jsProvider} provider`);
    const jsCoverage = await this.delegatedProvider.generateCoverage(context) as CoverageMap;
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
   * Report coverage - delegate to the selected JS provider's reporters
   */
  async reportCoverage(coverageMap: unknown, context: ReportContext): Promise<void> {
    if (!this.delegatedProvider) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        'reportCoverage failed to delegate - delegated provider not initialized',
      );
    }

    debug(`[HybridCoverageProvider] Reporting coverage (allTestsRun=${context.allTestsRun})`);
    await this.delegatedProvider.reportCoverage(coverageMap, context);
  }

  /**
   * Resolve options
   */
  resolveOptions(): ResolvedHybridProviderOptions {
    if (!this.delegatedProvider) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        'resolveOptions failed to delegate - delegated provider not initialized',
      );
    }

    debug(`[HybridCoverageProvider] Resolving Coverage Options`);

    const resolvedDelegatedOptions = this.delegatedProvider.resolveOptions() as ResolvedCoverageOptions;

    // The delegated provider builds its `excludes` values to include a null byte.
    // Remove null bytes for logging purposes so tools like grep won't complain about binary content.
    const sanitizedDelegatedOptions: ResolvedCoverageOptions = {
      ...resolvedDelegatedOptions,
      include: resolvedDelegatedOptions.include?.map(i => i.replace(/\0/g, '')) || undefined,
      exclude: resolvedDelegatedOptions.exclude?.map(i => i.replace(/\0/g, '')) || undefined
    };

    debug(`[HybridCoverageProvider] AS include: ${(this.definedCoverageOptions.assemblyScriptInclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] AS exclude: ${(this.definedCoverageOptions.assemblyScriptExclude || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] JS include: ${(sanitizedDelegatedOptions.include || []).join(', ') || '(none)'}`);
    debug(`[HybridCoverageProvider] JS exclude: ${(sanitizedDelegatedOptions.exclude || []).join(', ') || '(none)'}`);

    debug(`[HybridCoverageProvider] Globbing AS source files to include for coverage map basis`);
    const globbedAssemblyScriptInclude = globFiles(
      this.definedCoverageOptions.assemblyScriptInclude || [],
      this.definedCoverageOptions.assemblyScriptExclude || [],
      this.projectRoot
    );
    debug(`[HybridCoverageProvider] Including ${globbedAssemblyScriptInclude.length} AS files in coverage map`);

    const globbedAssemblyScriptExcludeOnly = globFiles(
      this.definedCoverageOptions.assemblyScriptExclude || [],
      [],
      this.projectRoot
    );
    debug(`[HybridCoverageProvider] Excluding ${globbedAssemblyScriptExcludeOnly.length} AS files from coverage map & instrumentation`);

    // Pass the user-configured coverage entry module straight through. Under
    // entry-point selection the module the user points `customProviderModule` at
    // IS the JS-provider selection (`/coverage-v8` — also the `/coverage` alias —
    // or `/coverage-istanbul`). Vitest already pre-resolved it to an absolute
    // path, and every worker (root and child projects, all vitest majors) loads
    // that same module natively — so there is no redirection and no config
    // mutation to reach workers.
    const userCoverageModule = this.definedCoverageOptions.customProviderModule;
    if (!userCoverageModule) {
      throw createPoolError(
        POOL_ERROR_NAMES.HybridCoverageProviderError,
        'resolveOptions: coverage.customProviderModule is unexpectedly unset for the hybrid provider',
      );
    }

    const resolved: ResolvedHybridProviderOptions = {
      ...resolvedDelegatedOptions,
      provider: 'custom',
      customProviderModule: userCoverageModule,
      debugIstanbul: this.definedCoverageOptions.debugIstanbul ?? false,
      assemblyScriptInclude: this.definedCoverageOptions.assemblyScriptInclude ?? [],
      assemblyScriptExclude: this.definedCoverageOptions.assemblyScriptExclude ?? [],
      globbedAssemblyScriptInclude,
      globbedAssemblyScriptProjectRelativeExcludeOnly : globbedAssemblyScriptExcludeOnly.map(gr => gr.projectRootRelative),
      isResolved: true
    };

    this.resolvedProviderOptions = resolved;
    return resolved;
  }

  async clean(clean: boolean = true): Promise<void> {
    debug('[HybridCoverageProvider] Clean coverage data - clean:', clean);
    if (clean) {
      this.accumulatedCoverage = emptyCoverageBundle();
      debug('[HybridCoverageProvider] Cleaned all internal coverage data');
    }

    if (this.delegatedProvider) {
      await this.delegatedProvider.clean(clean);
      debug(`[HybridCoverageProvider] Delegated ${this.jsProvider} provider finished clean(${clean})`);
    }
  }
}
