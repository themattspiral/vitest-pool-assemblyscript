/**
 * Shared TypeScript types and interfaces
 *
 * This file contains all type definitions used across the vitest-pool-assemblyscript codebase.
 * Types are organized into logical sections for better maintainability.
 */

import type { MessagePort } from 'node:worker_threads';
import type { RuntimeRPC } from 'vitest';
import type { RunnerTestFile, RunnerTestCase } from 'vitest/node';
import type { BirpcReturn } from 'birpc';
import type { TestError } from '@vitest/utils';

// ============================================================================
// Constants
// ============================================================================

export const ASSEMBLYSCRIPT_POOL_NAME = 'vitest-pool-assemblyscript';

export const COVERAGE_MEMORY_PAGES_MIN = 1;
export const COVERAGE_MEMORY_PAGES_MAX = 4;


// ============================================================================
// AssemblyScript Compiler Enums
//   - defined locally to avoid isolatedModules const enum access issues
//   - reference assemblyscript.generated.d.ts
// ============================================================================

export const ASCommonFlags = {
  Static: 32,
  Get: 2048,
  Set: 4096,
} as const;

export const ASNodeKind = {
  Source: 0,
  NamedType: 1,
  FunctionType: 2,
  TypeName: 3,
  TypeParameter: 4,
  Parameter: 5,
  Identifier: 6,
  Assertion: 7,
  Binary: 8,
  Call: 9,
  Class: 10,
  Comma: 11,
  ElementAccess: 12,
  False: 13,
  Function: 14,
  InstanceOf: 15,
  Literal: 16,
  New: 17,
  Null: 18,
  Omitted: 19,
  Parenthesized: 20,
  PropertyAccess: 21,
  Ternary: 22,
  Super: 23,
  This: 24,
  True: 25,
  Constructor: 26,
  UnaryPostfix: 27,
  UnaryPrefix: 28,
  Compiled: 29,
  Block: 30,
  Break: 31,
  Continue: 32,
  Do: 33,
  Empty: 34,
  Export: 35,
  ExportDefault: 36,
  ExportImport: 37,
  Expression: 38,
  For: 39,
  ForOf: 40,
  If: 41,
  Import: 42,
  Return: 43,
  Switch: 44,
  Throw: 45,
  Try: 46,
  Variable: 47,
  Void: 48,
  While: 49,
  Module: 50,
  ClassDeclaration: 51,
  EnumDeclaration: 52,
  EnumValueDeclaration: 53,
  FieldDeclaration: 54,
  FunctionDeclaration: 55,
  ImportDeclaration: 56,
  InterfaceDeclaration: 57,
  MethodDeclaration: 58,
  NamespaceDeclaration: 59,
  TypeDeclaration: 60,
  VariableDeclaration: 61,
  Decorator: 62,
  ExportMember: 63,
  SwitchCase: 64,
  IndexSignature: 65,
  Comment: 66,
} as const;

export const ASDecoratorKind = {
  Custom: 0,
  Global: 1,
  Operator: 2,
  OperatorBinary: 3,
  OperatorPrefix: 4,
  OperatorPostfix: 5,
  Unmanaged: 6,
  Final: 7,
  Inline: 8,
  External: 9,
  ExternalJs: 10,
  Builtin: 11,
  Lazy: 12,
  Unsafe: 13
} as const;

export const ASSourceKind = {
  User: 0,
  UserEntry: 1,
  Library: 2,
  LibraryEntry: 3
} as const;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error names for AssemblyScript test failures
 */
export const ERROR_NAMES = {
  AssertionError: 'AssertionError',
  RuntimeError: 'RuntimeError',
} as const;

/**
 * Error name type derived from ERROR_NAMES values
 */
export type ErrorName = typeof ERROR_NAMES[keyof typeof ERROR_NAMES];

/**
 * Extended TestError with required, strictly-typed name field
 */
export type AssemblyScriptTestError = TestError & { name: ErrorName };

// ============================================================================
// Configuration & Options
// ============================================================================

/**
 * Coverage mode options
 */
export const COVERAGE_MODES = {
  Failsafe: 'failsafe',
  Integrated: 'integrated',
} as const;

/**
 * Coverage mode type derived from COVERAGE_MODES values
 */
export type CoverageMode = typeof COVERAGE_MODES[keyof typeof COVERAGE_MODES];

/**
 * Coverage mode flags for easy consumption in conditional logic
 */
export interface CoverageModeFlags {
  /** True if coverage is enabled (from Vitest's coverage.enabled config) */
  isCoverageEnabled: boolean;
  /** The actual coverage mode */
  mode: CoverageMode;
  /** True if mode is 'integrated' */
  isIntegratedMode: boolean;
  /** True if mode is 'failsafe' */
  isFailsafeMode: boolean;
}

/**
 * AssemblyScript pool configuration options
 */
export interface AssemblyScriptPoolOptions {
  /** Enable verbose debug logging */
  debug?: boolean;

  /**
   * Coverage collection mode (only applies when test.coverage.enabled is true):
   * - 'failsafe': Smart re-run - Run instrumented first, re-run only failures on clean (default, optimal)
   * - 'integrated': Single run - Instrumented only (fast, broken error locations on failure)
   *
   * @default 'failsafe'
   */
  coverageMode?: CoverageMode;
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
   * Defaults to Math.max(cpus - 1, 1)
   */
  maxThreads?: number;
}

export const AS_POOL_FIELDS_WITH_DEFAULTS = ['debug', 'coverageMode', 'stripInline'] as const;
export const AS_POOL_OPTIONAL_FIELDS = ['maxThreads'] as const;

/** Fields that have default values. Internally these will always be defined. */
export type ASPoolOptionsFieldsWithDefaultValues = typeof AS_POOL_FIELDS_WITH_DEFAULTS[number];

/** Fields with optional values and NO defaults */
export type ASPoolOptionsOptionalFields = typeof AS_POOL_OPTIONAL_FIELDS[number];

/** Pool options resolved so that all fields are filled with user values preferentially,
 *  with required fields being guaranteed to be populated with defaults otherwise. */
export type ResolvedAssemblyScriptPoolOptions =
  Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>>
  & Partial<Pick<AssemblyScriptPoolOptions, ASPoolOptionsOptionalFields>>;

/**
 * Compilation options
 */
export interface AssemblyScriptCompilerOptions {
  /**
   * Enable coverage instrumentation by generating a second binary
   * - false: Clean binary only
   * - true: Instrumented binary along with clean binary
   */
  instrument: boolean;
  /**
   * Strip @inline decorators during compilation
   * Only applies when coverage is enabled
   */
  stripInline?: boolean;
}

/**
 * Phase timings for a single worker phase
 */
export interface PhaseTimings {
  /** Phase start time */
  phaseStart: number;
  /** Phase end time */
  phaseEnd: number;
}

// ============================================================================
// Compilation & Results
// ============================================================================

/**
 * Result of compiling AssemblyScript source
 *
 * Throws on compilation error.
 */
export interface CompileResult {
  /** Clean WASM binary (always returned) */
  clean: Uint8Array;
  /** Instrumented WASM binary (only when coverage enabled) */
  instrumented?: Uint8Array;
  /** Source map JSON (if successful and --sourceMap enabled) */
  sourceMap?: string;
  /** Debug info for coverage reporting (if coverage enabled) */
  debugInfo?: BinaryDebugInfo;
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

/**
 * Cached compilation data (shared between collectTests and runTests)
 *
 * NOTE: WebAssembly.Module is NOT included because it cannot be serialized across
 * worker boundaries (would throw DataCloneError). Workers must re-compile the binary
 * when using cached data, but this is fast (binary is already parsed/validated).
 *
 * Within a single worker task, the module CAN be passed from discovery to execution
 * to avoid re-compilation within that task.
 */
export interface CachedCompilation {
  clean: Uint8Array;
  instrumented?: Uint8Array;
  sourceMap?: string;
  debugInfo?: BinaryDebugInfo;
  discoveredTests: DiscoveredTests;
  compileTimings: PhaseTimings;
  discoverTimings?: PhaseTimings;
  generation: number;
}

// ============================================================================
// Test Execution & Results
// ============================================================================

/**
 * Discovered test metadata (from registration phase)
 */
export interface DiscoveredTest {
  /** Test name (user-defined) */
  name: string;
  /** Function table index for this test */
  fnIndex: number;
  /** Unique internal id assigned to identify this test. Matches RunnerTestCase.id value */
  id: string;
}

/**
 * Discovered tests indexed by unique id
 */
export type DiscoveredTests = Record<string, DiscoveredTest>;

/**
 * Result of a single test execution
 */
export interface TestResult {
  /** Test name */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Error if the test failed */
  error?: AssemblyScriptTestError;
  /** Number of assertions that passed */
  assertionsPassed: number;
  /** Number of assertions that failed */
  assertionsFailed: number;
  /** Mapped source stack trace (for error reporting) */
  sourceStack?: WebAssemblyCallSite[];
  /** Raw V8 call stack (internal, for async source mapping) */
  rawCallStack?: NodeJS.CallSite[];
  /** Coverage data collected during this test */
  coverage?: CoverageData;
  /** Test start time in milliseconds */
  startTime?: number;
  /** Test duration in milliseconds */
  duration?: number;
}

/**
 * Pool-internal test result pairing testTask with result
 *
 * Used within the pool to track test execution results along with their
 * associated Vitest task objects. Unlike ExecuteTestResult (worker communication),
 * this includes the full RunnerTestCase which cannot cross worker boundaries.
 */
export interface PoolTestResult {
  /** Vitest test task object */
  testTask: RunnerTestCase;
  /** Test execution result */
  result: TestResult;
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
  readonly __format: 'assemblyscript';
  coverageData: CoverageData;
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
 * WASM function signature (parameter and result types)
 */
export interface FunctionSignature {
  params: string[];
  results: string[];
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
  /** Whether this function has debug info (source map entries) */
  hasDebugInfo: boolean;
  /** Function signature (params and results) */
  signature: FunctionSignature;

  /**
   * Representative source location (POINT, not range)
   * Derived from first expression with a source location.
   * Used for containment matching to find the source function.
   */
  representativeLocation?: SourceLocation;
  /**
   * Index into coverage memory counters
   * v1 only: Function-level counter
   */
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
  totalFunctionCount: number;
}

/**
 * Raw output from native addon's instrumentForCoverage() C++ function
 */
export interface NativeInstrumentationResult {
  instrumentedWasm: Buffer;
  sourceMap: string;
  debugInfo: NativeDebugInfoOutput;
}

export interface NativeDebugInfoOutput {
  /** All source files represented in extracted debug info (directly or inlined) */
  debugSourceFiles: string[];
  /** Flat list of all functions with their debug info */
  functions: NativeFunctionDebugInfo[];
}

export interface NativeFunctionDebugInfo extends Omit<FunctionDebugInfo, 'expressions' | 'representativeLocation'> {
  representativeLocation?: NativeSourceLocation;
  expressions: NativeExpressionDebugInfo[];
}

export interface NativeExpressionDebugInfo extends Omit<ExpressionDebugInfo, 'location'> {
  location?: NativeSourceLocation;
}

export interface NativeSourceLocation extends Omit<SourceLocation, 'filePath'> {
  /** Index into NativeDebugInfoOutput.debugSourceFiles */
  fileIndex: number;
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
// Worker Communication & RPC - Per-Test Parallelism
// ============================================================================

/**
 * Task data for discoverTests worker function
 */
export interface DiscoverTestsTask {
  /** Compiled binary to discover tests from */
  binary: Uint8Array;
  /** Path to test file (for logging) */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Project information for file task creation */
  projectInfo: ProjectInfo;
  /** Compilation phase timings from compile worker */
  compileTimings: PhaseTimings;
  /** Debug info from coverage instrumentation (if binary is instrumented) */
  debugInfo?: BinaryDebugInfo;
  /** Test name pattern for filtering (from -t flag) */
  testNamePattern?: RegExp;
  /** Allow .only modifier */
  allowOnly?: boolean;
}

/**
 * Result from discoverTests worker function
 */
export interface DiscoverTestsResult {
  /** File task with filtered tests (after applying testNamePattern) */
  fileTask: RunnerTestFile;
  /** Discovered tests with names, function indices, and unique ids */
  tests: DiscoveredTests;
  /** Discovery phase timings */
  timings: PhaseTimings;
}

/**
 * Task data for executeTest worker function
 *
 * Executes test and reports results via RPC. Does not collect coverage.
 */
export interface ExecuteTestTask {
  /** Compiled WASM binary */
  binary: Uint8Array;
  /** Source map JSON (for error location mapping) */
  sourceMap?: string;
  /** Test to execute */
  test: DiscoveredTest;
  /** Path to test file */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Test task ID (for RPC reporting) */
  testTaskId: string;
  /** Test task name (for RPC reporting) */
  testTaskName: string;
  /** Suppress reporting of test-prepare event */
  suppressPrepareReporting?: boolean;
}

/**
 * Task data for executeTestWithCoverage worker function
 *
 * Executes test, collects coverage, and reports results via RPC.
 */
export interface ExecuteTestWithCoverageTask {
  /** Compiled instrumented WASM binary */
  binary: Uint8Array;
  /** Source map JSON (for error location mapping) */
  sourceMap?: string;
  /** Debug info from coverage instrumentation */
  debugInfo: BinaryDebugInfo;
  /** Test to execute */
  test: DiscoveredTest;
  /** Path to test file */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Test task ID (for RPC reporting) */
  testTaskId: string;
  /** Test task name (for RPC reporting) */
  testTaskName: string;
  /** Suppress reporting of test failures via RPC */
  suppressFailureReporting: boolean;
}

/**
 * Result from executeTest worker function
 */
export interface ExecuteTestResult {
  /** Test execution result */
  result: TestResult;
}


/**
 * Task data for reportFileSummary worker function
 *
 * Reports suite-finished and final flush after all tests complete
 */
export interface ReportFileSummaryTask {
  /** Path to test file */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Complete file task with all test results */
  fileTask: RunnerTestFile;
  /** Coverage data for this test suite file (optional, only when coverage enabled) */
  coverageData?: CoverageData;
}

// ============================================================================
// Hook Execution Task Types (Not Yet Implemented)
// ============================================================================

/**
 * Task data for executeBeforeAllHooks worker function
 * Not yet implemented - placeholder for future hook support
 */
export interface ExecuteBeforeAllHooksTask {
  /** Path to test file */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Hooks to execute */
  hooks: unknown[]; // Hook type to be defined when implementing hooks
  /** File task for hook context */
  fileTask: RunnerTestFile;
}

/**
 * Task data for executeAfterAllHooks worker function
 * Not yet implemented - placeholder for future hook support
 */
export interface ExecuteAfterAllHooksTask {
  /** Path to test file */
  testFile: string;
  /** Pool options */
  poolOptions: ResolvedAssemblyScriptPoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Hooks to execute */
  hooks: unknown[]; // Hook type to be defined when implementing hooks
  /** File task for hook context */
  fileTask: RunnerTestFile;
}

// ============================================================================
// Pool-Level Data Structures
// ============================================================================

/**
 * Project information needed for file task creation
 */
export interface ProjectInfo {
  /** Project root directory */
  projectRoot: string;
  /** Project name */
  projectName: string;
  /** Test timeout from config */
  testTimeout: number;
}

/**
 * Worker channel with RPC for suite-level communication
 */
export interface WorkerChannel {
  /** Port to send to worker for RPC communication */
  workerPort: MessagePort;
  /** Pool-side port for cleanup */
  poolPort: MessagePort;
  /** RPC client for calling Vitest methods (only remote functions matter for our usage) */
  rpc: BirpcReturn<RuntimeRPC, object>;
}
