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

export const COVERAGE_MEMORY_PAGES_MAX = 4;

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
  debugInfo?: DebugInfo;
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
  debugInfo?: DebugInfo;
  discoveredTests: DiscoveredTest[];
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
  /** Test name */
  name: string;
  /** Function table index for this test */
  fnIndex: number;
}


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
 * Source location in original AssemblyScript code
 */
export interface SourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * WebAssembly call site with mapped source location
 */
export interface WebAssemblyCallSite {
  functionName: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

// ============================================================================
// Debug Info, Function Metadata, & Coverage Reporting
// ============================================================================

/**
 * Function information for coverage and debugging
 *
 * All line and column values are 1-based for internal consistency.
 * Conversion to 0-based columns happens at Istanbul output boundary.
 */
export interface FunctionInfo {
  /** Fully qualified name: relativePath/functionName (matches native addon format) */
  qualifiedName: string;
  /** Short function name for display purposes */
  shortName: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Start column (1-based, required for v2 containment matching) */
  startColumn: number;
  /** End column (1-based, required for v2 containment matching) */
  endColumn: number;
  /** Index into coverage memory counters (assigned during instrumentation) */
  coverageMemoryIndex?: number;
}

/**
 * Combined coverage and metadata for a single function
 */
export interface FunctionCoverageInfo {
  info: FunctionInfo;
  hitCount: number;
}

/**
 * Debug info structure that maps files to their functions
 *
 * Provides two access patterns:
 * - qualifiedFunctionsByAbsoluteFilePath: for per-file iteration (coverage reporting)
 * - absoluteFilePathByQualifiedFunctionName: for O(1) lookup of which file contains a function (instrumentation)
 *
 * All lookups use qualified function names (relativePath/functionName) to prevent
 * collisions when multiple files contain functions with the same short name.
 */
export interface DebugInfo {
  /** Outer Record: keyed by absolute file path, Inner Record: keyed by qualified function name */
  qualifiedFunctionsByAbsoluteFilePath: Record<string, Record<string, FunctionInfo>>;
  /** Reverse lookup: qualified function name -> absolute file path (for instrumentation) */
  absoluteFilePathByQualifiedFunctionName: Record<string, string>;
}

/**
 * Coverage data collected during test execution
 *
 * Uses position-based keys for stable merging across test files.
 * Outer Record: keyed by absolute file path
 * Inner Record: keyed by position ("line:column") -> coverage info with hit count
 */
export interface CoverageData {
  positionCoverageByAbsoluteFilePath: Record<string, Record<string, FunctionCoverageInfo>>;
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

/**
 * Global metadata storage (populated by AS transform during compilation)
 *
 * The AS transform (src/transforms/extract-function-metadata.mjs) populates this
 * global variable with function metadata during compilation. The Binaryen coverage
 * instrumenter then reads this data to build coverage instrumentation.
 */
declare global {
  var __functionMetadata: DebugInfo | undefined;
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
  debugInfo?: DebugInfo;
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
  /** Discovered tests with names and function indices */
  tests: DiscoveredTest[];
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
  debugInfo: DebugInfo;
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
