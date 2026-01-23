/**
 * Shared TypeScript types and interfaces
 *
 * This file contains all type definitions used across the vitest-pool-assemblyscript codebase.
 * Types are organized into logical sections for better maintainability.
 */

import type { MessagePort } from 'node:worker_threads';
import type { BirpcReturn } from 'birpc';
import type { RunnerRPC, RuntimeRPC, SerializedConfig } from 'vitest';
import type { TestError } from '@vitest/utils';
import type { ResolvedCoverageOptions, ResolvedConfig } from 'vitest/node';
import type { SerializedDiffOptions } from '@vitest/utils/diff';
import type { File, Test, TaskMeta, TestOptions, FileSpecification } from '@vitest/runner/types';
import type { Colors } from 'tinyrainbow';

import {
  AS_POOL_WORKER_MSG_FLAG,
  AS_POOL_ERROR_TYPE_FLAG,
  COVERAGE_PAYLOAD_FORMATS,
  POOL_ERROR_NAMES,
  TEST_ERROR_NAMES,
} from './constants.js';

// ============================================================================
// Errors
// ============================================================================

/** Error name type derived from TEST_ERROR_NAMES values */
export type TestErrorName = typeof TEST_ERROR_NAMES[keyof typeof TEST_ERROR_NAMES];

/** Error name type derived from POOL_ERROR_NAMES values */
export type PoolErrorName = typeof POOL_ERROR_NAMES[keyof typeof POOL_ERROR_NAMES];

/**
 * Conforms to Error interface but with required, strictly-typed name field.
 * Thrown internally for all pool errors.
 * 
 * Must be thrown as a POJO (not using the Error() constructor!) to be properly
 * serialized across worker-pool boundery.
 */
export interface AssemblyScriptPoolError extends Error {
  readonly [AS_POOL_ERROR_TYPE_FLAG]: true;
  name: PoolErrorName;
  rawCallStack?: NodeJS.CallSite[];
  causeIsEnhancedError?: boolean;
}

/**
 * Extended vitest TestError with required, strictly-typed name field.
 * This is an explicitly serializable error format constructred to report
 * Test/Suite failures to vitest.
 */
export type AssemblyScriptTestError = TestError & { name: TestErrorName | PoolErrorName };

// ============================================================================
// User Configuration
// ============================================================================

/**
 * AssemblyScript pool configuration options
 */
export interface AssemblyScriptPoolOptions {
  /** Enable verbose debug logging */
  debug?: boolean;
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
   * Maximum number of worker threads
   *
   * Defaults to os.availableParallelism() - 1
   */
  maxThreads?: number;

  coverageMemoryPagesMin?: number;
  coverageMemoryPagesMax?: number;
}

/**
 * HybridCoverageProvider configurations options, applied to config's coverage section
 * with module augmentation. 
 */
export interface HybridProviderOptions {
  provider: 'custom',
  customProviderModule: string;

  /**
   * Glob patterns for AssemblyScript source files to include in coverage.
   * Used by pool's hybrid coverage provider to build the complete AS coverage map.
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

// define these constants here so they make sense in context
export const AS_POOL_FIELDS_WITH_DEFAULTS = ['debug', 'stripInline', 'coverageMemoryPagesMin', 'coverageMemoryPagesMax'] as const;
export const AS_POOL_OPTIONAL_FIELDS = ['maxThreads'] as const;

/** Fields that have default values. Internally these will always be defined. */
export type ASPoolOptionsFieldsWithDefaultValues = typeof AS_POOL_FIELDS_WITH_DEFAULTS[number];

/** Fields with optional values and NO defaults */
export type ASPoolOptionsOptionalFields = typeof AS_POOL_OPTIONAL_FIELDS[number];

export type AssemblyScriptResolvedConfig = ResolvedConfig & { poolOptions: { assemblyScript: ResolvedAssemblyScriptPoolOptions } };

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
  & Omit<ResolvedCoverageOptions<'v8'>, 'provider'>
  & {
    globbedAssemblyScriptInclude: GlobResult[],
    globbedAssemblyScriptProjectRelativeExcludeOnly: string[],
  };

// vitest TestOptions fields that are supported by AssemblyScript tests in this pool
export type AssemblyScriptTestOptions = Required<Pick<TestOptions, 'timeout' | 'retry' | 'skip' | 'only' | 'fails'>>;

// ============================================================================
// Utility Types
// ============================================================================

export type VitestVersion = 'v3' | 'v4';

export type HighlightFunc = (code: string, options: { colors: Colors }) => string;

export interface GlobResult {
  absolute: string;
  projectRootRelative: string;
}

// ============================================================================
// Compilation & Results
// ============================================================================

/**
 * Compilation options
 */
export interface AssemblyScriptCompilerOptions {
  /**
   * Enable coverage instrumentation by generating a second binary
   * - false: Clean binary only
   * - true: Instrumented binary along with clean binary
   */
  shouldInstrument: boolean;
  /** Options for instrumentation. */
  instrumentationOptions?: InstrumentationOptions;
  /**
   * Strip @inline decorators during compilation
   * Only applies when coverage is enabled
   */
  stripInline?: boolean;
  /**
   * Path to vitest user project root. Used to resolve relative file paths
   * for native instrumentation exclusions.
   *  */
  projectRoot: string;
}

/**
 * Result of successfully compiling AssemblyScript source
 */
export interface AssemblyScriptCompilerResult {
  /** WASM binary */
  binary: Uint8Array;
  /** Source map JSON */
  sourceMap: string;
  /** Debug info for coverage reporting (if coverage enabled) */
  debugInfo?: BinaryDebugInfo;
  /** True if binary has been instrumented */
  isInstrumented: boolean;
  /** Compilation internal phase timing */
  compileTiming: number;
}

export interface InstrumentationOptions {
  /** List of relative file paths to exclude from instrumentation */
  relativeExcludedFiles: string[];
  excludedLibraryFilePrefix: string;
  coverageMemoryPagesMin: number;
  coverageMemoryPagesMax: number;
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
  /** Relative file path */
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
 * Function metadata (names, ranges) comes from ParsedSourceInfo, not here.
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
// Binary Debug Info (from Native Addon) - v1/v2 Coverage Architecture
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
  /** Indices of expressions contained in this block */
  expressionIndices: number[];
  /** Outgoing branch edges */
  branches: BranchEdgeDebugInfo[];
  /**
   * Index into coverage memory counters
   * v2 only: Source of truth for block-level coverage
   */
  coverageMemoryIndex?: number;
}

/**
 * Function debug info extracted from WASM binary via native addon
 *
 * Contains all debug information for a single WASM function including
 * expressions and basic blocks for v2 coverage support.
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
   * Functions grouped by file path, then keyed by position ("line:column")
   * Position key enables stable identity across compilations
   */
  functionsByFileAndPosition: Record<string, Record<string, FunctionDebugInfo>>;

  instrumentedFunctionCount: number;
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

export interface NativeInstrumentationOptions extends Omit<InstrumentationOptions, 'relativeExcludedFiles'> {
  excludedFiles?: string[];
  debug?: boolean;
  logPrefix?: string;
}

// ============================================================================
// Parsed Source Info (from AST Parser) - Coverage Provider
// ============================================================================
//
// These types represent information parsed from source files via AST.
// Parsed source info has RANGES (start and end positions) for containment matching.
//
// Naming convention: ParsedSource* prefix indicates AST-parsed data.

/**
 * Function info parsed from AssemblyScript source via AST
 *
 * Used for containment matching: binary function points are matched
 * to source function ranges to establish identity.
 */
export interface ParsedSourceFunctionInfo {
  /** Fully qualified name (e.g., "ClassName#methodName" or "moduleName/funcName") */
  qualifiedName: string;
  /** Short name for display */
  shortName: string;
  /** Source range for containment matching */
  range: SourceRange;
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
  expected?: any;
  actual?: any;
  valuesProvided?: boolean;
  typeName?: string;
  message?: string;
}

export interface AssemblyScriptSuiteTaskMeta extends TaskMeta {
  idxInParentTasks: number;
  defaultTestOptions: AssemblyScriptTestOptions;
  suitePreparedSent: boolean;
  resultFinal: boolean;
  coverageData?: CoverageData;
}

export interface AssemblyScriptTestTaskMeta extends TaskMeta {
  idxInParentTasks: number;
  fnIndex: number;
  assertionsPassedCount: number;
  assertionsFailed: FailedAssertion[];
  resultFinal: boolean;
  coverageData?: CoverageData;
  lastError?: AssemblyScriptTestError;
  lastErrorValuesProvided?: boolean;
  lastErrorRawCallStack?: NodeJS.CallSite[];
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
  asPoolOptions: ResolvedAssemblyScriptPoolOptions;
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

export interface WASMCompilation {
  filePath: string;
  binary: Uint8Array;
  sourceMap: string;
  debugInfo?: BinaryDebugInfo;
}

export interface TestRunRecord {
  test: Test;
  executionStart: number;
  timeoutId: NodeJS.Timeout;
}

export interface ThreadSpec {
  file: File;
  compilation?: WASMCompilation;
}

export interface StartWorkerThreadTask {
  dispatchStart: number;
}

export interface RunFileTask {
  dispatchStart: number;
  workerId: number;
  port: MessagePort;
  fileSpecs: FileSpecification[];
  config: SerializedConfig;
  isCollectTestsMode: boolean;
  timedOutTest?: Test;
  timedOutCompilation?: WASMCompilation;
}

export interface RunCompileAndDiscoverTask {
  dispatchStart: number;
  workerId: number;
  port: MessagePort;
  file: File;
  config: SerializedConfig;
  isCollectTestsMode: boolean;
}

export interface RunTestsTask {
  dispatchStart: number;
  workerId: number;
  port: MessagePort;
  file: File;
  compilation: WASMCompilation;
  config: SerializedConfig;
  isCollectTestsMode: boolean;
  timedOutTest?: Test;
}

export interface ProcessPoolRunFileTask {
  /** vitest File task */
  file: File;

  timedOutTest?: Test;
  timedOutCompilation?: WASMCompilation;

  /** true when running a `collectTests()` operation only, false for `runTests()` */
  isCollectTestsMode: boolean;  
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Project root directory */
  projectRoot: string;
  /** User-defined diff options, if any */
  diffOptions?: SerializedDiffOptions;
  
  /** True if coverage should be collected during this test run */
  collectCoverage: boolean;
  /** User-configured coverage exclusions */
  relativeUserCoverageExclusions: string[];
  
  /** Test name pattern for filtering (from -t flag) */
  testNamePattern?: RegExp;
  /** Allow .only modifier */
  allowOnly?: boolean;
  
  /** Bail config (halt run after this many failures) */
  bail?: number;
}
