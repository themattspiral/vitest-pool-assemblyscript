/*
 * Shared TypeScript types and interfaces
 */

import type { MessagePort } from 'node:worker_threads';
import type { BirpcReturn } from 'birpc';
import type { RunnerRPC, RuntimeRPC, SerializedConfig } from 'vitest';
import type { TestError } from '@vitest/utils';
import type { ResolvedCoverageOptions } from 'vitest/node';
import type { File, Test, TaskMeta, TestOptions } from '@vitest/runner/types';
import type { RawSourceMap } from 'source-map';

import {
  AS_POOL_WORKER_MSG_FLAG,
  COVERAGE_PAYLOAD_FORMATS,
  POOL_ERROR_NAMES,
  TEST_ERROR_NAMES,
  AS_POOL_ERROR_FLAG,
} from './constants.js';

// ============================================================================
// Errors
// ============================================================================

/** Error name type derived from TEST_ERROR_NAMES values */
export type TestErrorName = typeof TEST_ERROR_NAMES[keyof typeof TEST_ERROR_NAMES];

/** Error name type derived from POOL_ERROR_NAMES values */
export type PoolErrorName = typeof POOL_ERROR_NAMES[keyof typeof POOL_ERROR_NAMES];

export interface AssemblyScriptPoolError {
  readonly [AS_POOL_ERROR_FLAG]: true;
  name: PoolErrorName;
  message?: string;
  originalErrorRawStack: NodeJS.CallSite[];
  originalErrorMayContainJS: boolean;
  applyStackToTestErrorCause: boolean;
  testError: AssemblyScriptTestError;
}

/**
 * Extended vitest TestError with required, strictly-typed name field.
 * This is an explicitly serializable error format constructred to report
 * Test/Suite failures to vitest.
 */
export interface AssemblyScriptTestError extends TestError {
  // reported error can originate as a test error (assertion/runtime),
  // or as a pool failnure (harness error due to OOM, other unexpected paths)
  name: TestErrorName | PoolErrorName
}

/**
 * Native build error marker file content.
 * Written by install script when native addon compilation fails.
 * Read at runtime to display detailed error information to users.
 */
export interface NativeBuildError {
  stage: 'binaryen-download' | 'native-compile';
  error: string;
  platform: string;
  timestamp: string;
}

// ============================================================================
// User Configuration
// ============================================================================

/**
 * AssemblyScript pool configuration options
 */
export interface AssemblyScriptPoolOptions {
  /** Enable verbose debug logging */
  debug?: boolean;
  debugNative?: boolean;
  debugCoverageExtract?: boolean;

  /** enable to collect coverage instrumentation on the pool's assembly/* files */
  _instrumentPoolInternals?: boolean;

  /**
   * Strip `@inline` decorators during compilation to improve error message and coverage accuracy
   *
   * - When true (default): `@inline` decorators removed, functions become visible in coverage
   *                        and source mapped errors point to the correct lines
   * - When false: `@inline` functions are inlined by compiler, missing from coverage, and 
   *               error line numbers don't match the non-inlined source
   * @default true
   */
  stripInline?: boolean;

  /**
   * Maximum number of worker threads to spawn with vitest 3.x.
   * Defaults to os.availableParallelism() - 1
   *
   * vitest 3.x only, and only read from the TOP-LEVEL config's
   * `poolOptions.assemblyScript` — the pool's shared thread pool is sized once
   * at creation from the root config, so per-project values are ignored.
   *
   * Use project config `test.maxWorkers` with vitest 5.x and 4.x to control
   * the number of concurrently executing tests.
   */
  maxThreadsV3?: number;

  testMemoryPagesInitial?: number;
  testMemoryPagesMax?: number;

  extraCompilerFlags?: string[];

  wasmImportsFactory?: string;
}

/**
 * AssemblyScript-specific coverage fields contributed by the hybrid coverage
 * provider on top of vitest's standard coverage options.
 *
 * Single source of truth for these field declarations: extended by the
 * vitest module augmentation files in `src/config/` so users get autocomplete
 * on these fields in their `vitest.config.ts` coverage block, and consumed
 * internally via `Required<HybridProviderOptions>` in
 * `ResolvedHybridProviderOptions`.
 */
export interface HybridProviderOptions {
  debugIstanbul?: boolean;

  /**
   * Glob patterns for AssemblyScript source files to include in coverage.
   * Used to build the complete AS coverage map.
   *
   * The standard `include` patterns are used by the v8 provider for JS/TS files.
   *
   * @example ['assembly/**\/*.as.ts']
   */
  assemblyScriptInclude?: string[];

  /**
   * Glob patterns for AssemblyScript files to exclude from coverage.
   *
   * @example ['**\/*.as.test.ts']
   */
  assemblyScriptExclude?: string[];
}

export interface WasmImportsFactoryInfo {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  utils: {
    liftString: (stringPtr: number) => string | undefined;
  }
}

export type WasmImportsFactory = (moduleInfo: WasmImportsFactoryInfo) => WebAssembly.Imports;

// define these constants here so they make sense in context
export const AS_POOL_FIELDS_WITH_DEFAULTS = [
  'debug',
  'debugNative',
  'debugCoverageExtract',
  '_instrumentPoolInternals',
  'stripInline',
  'maxThreadsV3',
  'extraCompilerFlags'
] as const;

export const AS_POOL_OPTIONAL_FIELDS = [
  'testMemoryPagesInitial',
  'testMemoryPagesMax',
  'wasmImportsFactory'
] as const;

/** Fields that have default values. Internally these will always be defined. */
export type ASPoolOptionsFieldsWithDefaultValues = typeof AS_POOL_FIELDS_WITH_DEFAULTS[number];

/** Fields with optional values and NO defaults */
export type ASPoolOptionsOptionalFields = typeof AS_POOL_OPTIONAL_FIELDS[number];
// compatibility type for internal consumption - configs from all versions
// of Vitest are converted to this format for internal consumption
export type SerializedConfigCompat = SerializedConfig & {
  retry: number;
};

  /**
 * Pool options resolved so that all fields are filled with user values preferentially, 
 * with required fields being guaranteed to be populated with defaults otherwise.
 */
export type ResolvedAssemblyScriptPoolOptions =
  Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>>
  & Partial<Pick<AssemblyScriptPoolOptions, ASPoolOptionsOptionalFields>>
  & { readonly isResolved: true };

export type ResolvedHybridProviderOptions =
  Required<HybridProviderOptions>
  & Omit<ResolvedCoverageOptions, 'provider'>
  & {
    provider: 'custom';
    customProviderModule: string;
    globbedAssemblyScriptInclude: GlobResult[];
    globbedAssemblyScriptProjectRelativeExcludeOnly: string[];
  }
  & { readonly isResolved: true };

// vitest TestOptions fields that are supported by AssemblyScript tests in this pool
export type AssemblyScriptTestOptions = Required<Pick<TestOptions, 'timeout' | 'retry' | 'skip' | 'only' | 'fails'>>;

// ============================================================================
// Utility Types
// ============================================================================

export type VitestVersion = 'v3' | 'v4';

export interface ThreadImports {
  createUserWasmImports?: WasmImportsFactory;
}

export interface GlobResult {
  absolute: string;
  projectRootRelative: string;
}

// ============================================================================
// Compilation & Results
// ============================================================================

export interface WASMCompilation {
  filePath: string;
  sourceMap: RawSourceMap;
  debugInfo?: BinaryDebugInfo;
  compiledModule: WebAssembly.Module;
  requiredMemory: WASMModuleMemoryRequirements;
  isInstrumented: boolean;
  compileTiming: number;
}

export interface WASMImportMemoryRequirements {
  initialPages: number;
  maximumPages?: number;
};

export interface WASMModuleMemoryRequirements {
  testMemory: WASMImportMemoryRequirements;
  coverageMemory: WASMImportMemoryRequirements;
}

export interface AssemblyScriptCompilerOptions {
  shouldInstrument: boolean;
  projectRoot: string;
  instrumentationOptions?: InstrumentationOptions;
  stripInline?: boolean;
  extraFlags?: string[];
}

export interface InstrumentationOptions {
  /** Project root for resolving source map paths to absolute paths */
  projectRoot: string;
  /** List of relative file paths to exclude from instrumentation */
  relativeExcludedFiles: string[];
  excludedLibraryFilePrefix: string;
  excludedLibraryFileOverridePrefix?: string;
  excludedInternalFunctionSubstring: string;
  debug?: boolean;
  coverageMemoryModule: string;
  coverageMemoryName: string;
}

/**
 * Result of instrumenting a WASM binary for coverage
 */
export interface InstrumentationResult {
  /** Instrumented WASM binary with coverage counter increments */
  instrumentedWasm: Buffer;
  /** Regenerated source map (offsets adjusted for instrumentation) */
  sourceMap: string;
  /** Debug info with coverageMemoryIndex assigned to each function */
  debugInfo: BinaryDebugInfo;
}

// ============================================================================
// Error Source Mapping
// ============================================================================

/**
 * Source location in original AssemblyScript code (a point, not a range)
 *
 * All values are 1-based for internal consistency.
 * Conversion to 0-based columns happens at Istanbul output boundary.
 */
export interface SourceLocation {
  /** Absolute file path (normalized from source map during debug info extraction) */
  filePath: string;
  line: number;
  column: number;
}

/**
 * WebAssembly call site with mapped source location
 */
export interface WebAssemblyCallSite {
  functionName: string;
  location: SourceLocation;
}

// ============================================================================
// Coverage Data (Runtime Hit Counts)
// ============================================================================

/**
 * Coverage data collected during test execution
 *
 * Simple hit count storage using position-based keys for stable merging.
 * Note: Function source metadata (names, ranges) comes from ParsedSourceInfo.
 *
 * Outer Record: keyed by absolute file path
 * Inner Record: keyed by position ("line:column") → hit count
 */
export interface CoverageData {
  hitCountsByFileAndPosition: Record<string, Record<string, number>>;
}

/**
 * Coverage payload sent via RPC from worker to hybrid coverage provider
 *
 * The __format marker distinguishes AS coverage from JS coverage in onAfterSuiteRun.
 */
export interface AssemblyScriptCoveragePayload {
  readonly __format: typeof COVERAGE_PAYLOAD_FORMATS.AssemblyScript;
  coverageData: CoverageData;
  suiteLogLabel: string;
}


// ============================================================================
// Binary Debug Info (returned from native instrumentation addon)
// ============================================================================
//
// These types represent debug information extracted from compiled WASM binaries
// via the native addon. Binary debug info only has POINTS (from source map),
// not ranges. Ranges come from source parsing (ParsedSource* types below).
//
// Naming convention: *DebugInfo suffix indicates binary-extracted data.

/**
 * Source range in original AssemblyScript code (start and end points)
 *
 * All values are 1-based for internal consistency.
 * Conversion to 0-based columns happens at Istanbul output boundary.
 */
export interface SourceRange {
  /** Relative file path */
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Branch edge in control flow graph
 */
export interface BranchEdgeDebugInfo {
  /** Target basic block index */
  targetBlockIndex: number;
  /** Index of the expression that creates this branch (e.g., if condition) */
  sourceExpressionIndex?: number;
}

/**
 * Expression debug info extracted from WASM binary
 *
 * Expressions are the smallest unit of execution in WASM.
 * In v2, each expression can be mapped to a source statement for line-level coverage.
 */
export interface ExpressionDebugInfo {
  /** WASM expression type (e.g., "call", "if", "block") */
  type: string;
  /** Source location (POINT, not range) from source map */
  location?: SourceLocation;
  /** Whether this expression is a branch point (if, switch, select) */
  isBranch: boolean;
  /** Number of branch paths (for branch coverage) */
  branchPaths?: number;
  /**
   * Index into coverage memory counters
   * v2 only: Propagated from containing BasicBlockDebugInfo by TS wrapper
   */
  coverageMemoryIndex?: number;
}

/**
 * Basic block debug info from CFG analysis
 *
 * Basic blocks are sequences of expressions with single entry/exit points.
 * In v2, counters are placed at basic block boundaries for efficient coverage.
 */
export interface BasicBlockDebugInfo {
  /** Block index within the function */
  index: number;
  /**
   * Whether this block is a branch decision (CFG out-degree >= 2).
   * Single source of truth for both branch identification and counter allocation.
   */
  isDecision: boolean;
  /** Indices of expressions contained in this block */
  expressionIndices: number[];
  /** Outgoing branch edges */
  branches: BranchEdgeDebugInfo[];
  /**
   * Index into coverage memory counters.
   * Source of truth for block-level coverage; absent when the block is not instrumented.
   */
  coverageMemoryIndex?: number;
}

/**
 * Function debug info extracted from WASM binary via native addon
 */
export interface FunctionDebugInfo {
  /** WASM function index */
  wasmIndex: number;
  /** Function name from WASM (informational) */
  name: string;
  /**
   * Representative source location (a point within the function).
   * Used for containment matching to find the parsedsource function.
   */
  representativeLocation: SourceLocation;
  /** Index into coverage memory counters */
  coverageMemoryIndex: number;
  /** All expressions in this function */
  expressions: ExpressionDebugInfo[];
  /** Basic blocks from CFG analysis */
  basicBlocks: BasicBlockDebugInfo[];
}

/**
 * Binary debug info extracted from WASM + source map via native addon
 *
 * This is the processed output after TS wrapper transforms NativeDebugInfoOutput.
 * Functions are grouped by file and keyed by position for stable identity.
 */
export interface BinaryDebugInfo {
  /** All source files represented in extracted debug info (directly or inlined) */
  debugSourceFiles: string[];
  /**
   * Functions grouped by file path, then keyed by position ("line:column").
   * Position key enables stable identity across compilations.
   * Array value accommodates generic monomorphizations that share a source position.
   */
  functionsByFileAndPosition: Record<string, Record<string, FunctionDebugInfo[]>>;

  instrumentedFunctionCount: number;
  /**
   * Total coverage counter slots in coverage memory: function-entry counters
   * (region 1, indices [0, instrumentedFunctionCount)) plus block counters
   * (region 2). The executor reads this many counters once block counters are consumed.
   */
  totalInstrumentationCounters: number;
}

/**
 * Raw output from native addon's instrumentForCoverage() C++ function
 */
export interface NativeInstrumentationResult {
  instrumentedWasm: Buffer;
  sourceMap: string;
  debugInfo: NativeDebugInfoOutput;
  errors?: string[];
}

export interface NativeDebugInfoOutput {
  /** All source files represented in extracted debug info (directly or inlined) */
  debugSourceFiles: string[];
  /** Flat list of all functions with their debug info */
  functions: NativeFunctionDebugInfo[];
  /** Total coverage counter slots (function-entry + block counters) */
  totalInstrumentationCounters: number;
}

export interface NativeFunctionDebugInfo extends Omit<FunctionDebugInfo, 'expressions' | 'representativeLocation'> {
  representativeLocation: NativeSourceLocation;
  expressions: NativeExpressionDebugInfo[];
}

export interface NativeExpressionDebugInfo extends Omit<ExpressionDebugInfo, 'location'> {
  location?: NativeSourceLocation;
}

export interface NativeSourceLocation extends Omit<SourceLocation, 'filePath'> {
  /** Index into NativeDebugInfoOutput.debugSourceFiles */
  fileIndex: number;
}

export interface NativeInstrumentationOptions extends Omit<InstrumentationOptions, 'relativeExcludedFiles' | 'projectRoot'> {
  excludedFiles?: string[];
  logPrefix?: string;
}

export type InstrumentForCoverageFunc = (
  wasmBuffer: Buffer,
  sourceMapBuffer: Buffer,
  instrumentationOptions: InstrumentationOptions,
  logModule: string,
  logLabel: string,
) => InstrumentationResult;

export interface NativeAddonInterface {
  instrumentForCoverage: InstrumentForCoverageFunc;
}

/**
 * Typed interface for the native addon's exported methods.
 * The addon is loaded via node-gyp-build at runtime (CJS .node binary).
 */
export interface NativeAddon {
  instrumentForCoverage(
    wasmBuffer: Buffer,
    sourceMapBuffer: Buffer,
    options: NativeInstrumentationOptions,
  ): NativeInstrumentationResult;
}

// ============================================================================
// Parsed Source Info (from AST Parser)
// ============================================================================
//
// These types represent information parsed from source files via AST.
// Parsed source info has *ranges* (start and end positions) for containment matching.

export interface ParsedSourceFunctions {
  functionsByLineSpan: Record<number, ParsedSourceFunctionInfo[]>;
  uniqueFunctions: Record<string, ParsedSourceFunctionInfo>;
}

/**
 * Function info parsed from AssemblyScript source via AST
 */
export interface ParsedSourceFunctionInfo {
  /** Fully "qualified" (WASM debug) name */
  qualifiedName: string;
  /** Short name for display */
  shortName: string;
  /** Source range for containment matching */
  range: SourceRange;
  /** Unique function ID "startLine:startColumn" */
  id: string;
}

/**
 * Statement info parsed from AssemblyScript source via AST
 *
 * v2 only: Used for line-level statement coverage.
 * Binary expression points are matched to source statement ranges.
 */
export interface ParsedSourceStatementInfo {
  /** Source range for containment matching */
  range: SourceRange;
  /** Statement type (e.g., "variable", "expression", "return") */
  statementType?: string;
}

/**
 * Branch info parsed from AssemblyScript source via AST
 *
 * v2 only: Used for branch coverage.
 * Binary branch expressions are matched to source branch ranges.
 */
export interface ParsedSourceBranchInfo {
  /** Source range for containment matching */
  range: SourceRange;
  /** Type of branch construct */
  branchType: 'if' | 'ternary' | 'switch' | 'logical';
}

/**
 * Complete parsed source info from AST parser
 *
 * Generated by coverage provider when processing coverage (not during compilation).
 * Provides the "what SHOULD be covered" view from source code.
 */
export interface ParsedSourceInfo {
  /**
   * Functions grouped by file path, then by start line for containment matching.
   * Multiple functions can start on the same line, but limiting matching to checking
   * only the functions grouped on the input position's line is very performant.
   */
  functionsByFileAndStartLine: Record<string, Record<number, ParsedSourceFunctionInfo[]>>;
  /**
   * Statements grouped by file path, then keyed by position ("line:column")
   * v2 only: For line-level statement coverage
   */
  statementsByFileAndPosition: Record<string, Record<string, ParsedSourceStatementInfo>>;
  /**
   * Branches grouped by file path, then keyed by position ("line:column")
   * v2 only: For branch coverage
   */
  branchesByFileAndPosition: Record<string, Record<string, ParsedSourceBranchInfo>>;
}

// ============================================================================
// Worker Communication & RPC
// ============================================================================

export interface AssemblyScriptConsoleLog {
  msg: string;
  time: number;
  isError: boolean;
}

export type AssemblyScriptConsoleLogHandler = (msg: string, isError?: boolean) => void;

export interface FailedAssertion {
  expected?: string;
  actual?: string;
  valuesProvided: boolean;
  actualTypeName: string;
  expectedTypeName: string;
  message: string;
}

export interface AssemblyScriptSuiteTaskMeta extends TaskMeta {
  idxInParentTasks: number;
  defaultTestOptions: AssemblyScriptTestOptions;
  suitePreparedSent: boolean;
  resultFinal: boolean;
  coverageData?: CoverageData;
  /**
   * Statement/expression-level coverage: block counters attributed to source
   * positions (per-instance MAX across a function instance's same-position
   * blocks, then SUM across monomorphizations — D5). Same shape as coverageData,
   * so it merges up the suite tree via mergeCoverageData and survives the
   * timeout-resume thread boundary as a plain object.
   */
  expressionHits?: CoverageData;
}

export interface AssemblyScriptTestTaskMeta extends TaskMeta {
  idxInParentTasks: number;
  fnIndex: number;
  assertionsPassedCount: number;
  assertionsFailed: FailedAssertion[];
  resultFinal: boolean;
  coverageData?: CoverageData;
  /**
   * Statement/expression-level coverage (block counters attributed to source
   * positions). Same shape as coverageData. See AssemblyScriptSuiteTaskMeta.
   */
  expressionHits?: CoverageData;
  lastError?: AssemblyScriptTestError;
  lastErrorValuesProvided?: boolean;
  lastErrorRawCallStack?: NodeJS.CallSite[];
  lastErrorCallStackRef?: Error;
  lastErrorUnexpected?: boolean;
  lastTimeoutTerminationTime?: number;
};

export interface WASMExecutorPerfTimings {
  /** function start */
  fnInit: number;
  /** test start: execStart - fnInit = env init time */
  execStart: number;
  /** test end: execEnd - execStart = test duration */
  execEnd: number;
  /** function end: fnFinal - execEnd = error prep and/or coverage extraction time */
  fnfinal: number;
}

export type WorkerRPC = BirpcReturn<RuntimeRPC, RunnerRPC>;

/**
 * Worker channel with RPC for suite-level communication
 */
export interface WorkerChannel {
  /** Port to send to worker for RPC communication */
  workerPort: MessagePort;
  /** Pool-side port for cleanup */
  poolPort: MessagePort;
  /** RPC client for calling Vitest methods (only remote functions matter for our usage) */
  rpc: WorkerRPC;
}

export interface WorkerThreadInitData {
  asCoverageOptions: ResolvedHybridProviderOptions;
}

export interface AssemblyScriptPoolWorkerMessageBase {
  readonly [AS_POOL_WORKER_MSG_FLAG]: true;
  readonly type: string;
}

export interface TestFileCompiled extends AssemblyScriptPoolWorkerMessageBase {
  readonly type: 'file-compiled';
  compilation: WASMCompilation;
}


export interface TestExecutionStart extends AssemblyScriptPoolWorkerMessageBase {
  readonly type: 'execution-start';
  executionStart: number;
  test: Test;
}

export interface TestExecutionEnd extends AssemblyScriptPoolWorkerMessageBase {
  readonly type: 'execution-end';
  executionEnd: number;
  testTaskId: string;
}

export type AssemblyScriptPoolWorkerMessage = TestExecutionStart | TestExecutionEnd | TestFileCompiled;

export interface TestRunRecord {
  test: Test;
  executionStart: number;
  timeoutId: NodeJS.Timeout;
}

export interface ThreadSpec {
  file: File;
  compilation?: WASMCompilation;
}

export interface RunCompileAndDiscoverTask {
  dispatchStart: number;
  workerId: number;
  port: MessagePort;
  file: File;
  config: SerializedConfigCompat;
  asPoolOptions: ResolvedAssemblyScriptPoolOptions;
  isCollectTestsMode: boolean;
}

export interface RunTestsTask {
  dispatchStart: number;
  workerId: number;
  port: MessagePort;
  file: File;
  compilation: WASMCompilation;
  config: SerializedConfigCompat;
  asPoolOptions: ResolvedAssemblyScriptPoolOptions;
  isCollectTestsMode: boolean;
  timedOutTest?: Test;
}

export interface ProcessPoolRunFileTask {
  dispatchStart: number;
  port: MessagePort;
  file: File;
  config: SerializedConfigCompat;
  asPoolOptions: ResolvedAssemblyScriptPoolOptions;
  isCollectTestsMode: boolean;
  timedOutTest?: Test;
  timedOutCompilation?: WASMCompilation;
}
