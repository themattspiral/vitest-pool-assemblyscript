/**
 * Shared TypeScript types and interfaces
 *
 * This file contains all type definitions used across the vitest-pool-assemblyscript codebase.
 * Types are organized into logical sections for better maintainability.
 */

import type { MessagePort } from 'node:worker_threads';
import type { RuntimeRPC } from 'vitest';
import type { RunnerTestFile } from 'vitest/node';
import type { BirpcReturn } from 'birpc';

// ============================================================================
// Constants
// ============================================================================

/**
 * Pool name used for Vitest file task creation
 */
export const POOL_NAME = 'assemblyscript';

// ============================================================================
// Configuration & Options
// ============================================================================

/**
 * Pool configuration options
 */
export interface PoolOptions {
  /** Enable verbose debug logging */
  debug?: boolean;
  /**
   * Coverage mode:
   * - false: No coverage - Fast, accurate errors
   * - true: Coverage only - Fast, broken errors when tests fail
   * - 'dual': Both coverage AND accurate errors - Slower (2x compile/execute) (default)
   */
  coverage?: boolean | 'dual';
  /**
   * Strip @inline decorators during compilation to improve coverage accuracy
   *
   * - When true (default): @inline decorators removed, functions become visible in coverage
   * - When false: @inline functions are inlined by compiler, missing from coverage
   *
   * Trade-offs:
   * - Coverage: Complete function-level coverage including @inline functions
   * - Source maps: Remain 100% accurate (decorators are metadata, not structural)
   * - Performance: Slightly slower execution (functions not inlined)
   *
   * Only applies when coverage is enabled. Ignored when coverage is false.
   *
   * @default true
   */
  stripInline?: boolean;
  /**
   * Isolate workers (create fresh worker per test file)
   *
   * - When true (default): Fresh worker created/destroyed per test file
   * - When false: Workers reused across test files (up to maxThreads limit)
   *
   * @default true
   */
  isolate?: boolean;
  /**
   * Maximum number of worker threads
   *
   * Defaults to Math.max(cpus - 1, 1)
   */
  maxThreads?: number;
}

/**
 * Compilation options
 */
export interface CompilerOptions {
  /**
   * Enable coverage instrumentation
   * - false: Clean binary
   * - true: Instrumented binary
   */
  coverage: boolean;
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
 * Result of compiling AssemblyScript source (success case)
 */
export interface CompilationResult {
  /** Compiled WASM binary (clean or instrumented, depending on coverage mode) */
  binary: Uint8Array;
  /** Source map JSON (if successful and --sourceMap enabled) */
  sourceMap: string | null;
  /** Debug info for coverage reporting (if coverage enabled) */
  debugInfo: DebugInfo | null;
  /** Error (null on success) */
  error: null;
}

/**
 * Result of compiling AssemblyScript source (error case)
 */
export interface CompilationError {
  /** No binary on error */
  binary: null;
  /** No source map on error */
  sourceMap: null;
  /** No debug info on error */
  debugInfo: null;
  /** Compilation error */
  error: Error;
}

/**
 * Union type for compilation results
 */
export type CompileResult = CompilationResult | CompilationError;

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
  binary: Uint8Array;
  sourceMap: string | null;
  coverageBinary?: Uint8Array;
  debugInfo: DebugInfo | null;
  discoveredTests: DiscoveredTest[];
  compileTimings: PhaseTimings;
  discoverTimings?: PhaseTimings;
}

/**
 * Worker-returned compilation data with generation for cache validation
 *
 * Workers return this when they compile a file (cache miss). The main process
 * validates the generation matches the current value before caching to prevent
 * stale compilations from late-returning workers.
 */
export interface WorkerCachedCompilation extends CachedCompilation {
  /** Generation number at time of compilation (for cache validation) */
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
  error?: Error;
  /** Type of error: 'assertion' for assert() failures, 'runtime' for crashes (bounds, null, etc.) */
  errorType?: 'assertion' | 'runtime';
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


// ============================================================================
// Source Mapping & Error Locations
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
// Coverage Data & Reporting
// ============================================================================

/**
 * Coverage data collected during test execution
 *
 * Uses POJOs instead of Maps for serialization compatibility (worker communication).
 * Keys are stringified numbers for functions, and "funcIdx:blockIdx" strings for blocks.
 */
export interface CoverageData {
  /** Record of funcIdx (as string) to number of times executed */
  functions: Record<string, number>;
  /** Record of "funcIdx:blockIdx" to number of times executed */
  blocks: Record<string, number>;
}

/**
 * Aggregated coverage data across multiple tests
 *
 * Uses POJOs instead of Maps for serialization compatibility (worker communication).
 * Keys are stringified numbers for functions, and "funcIdx:blockIdx" strings for blocks.
 */
export interface AggregatedCoverage {
  /** Record of funcIdx (as string) to total hit count across all tests */
  functions: Record<string, number>;
  /** Record of blockKey ("funcIdx:blockIdx") to total hit count */
  blocks: Record<string, number>;
}

/**
 * Coverage data for a single file (used in pool aggregation)
 */
export interface FileCoverageData {
  coverage: AggregatedCoverage;
  debugInfo: DebugInfo;
}

// ============================================================================
// Debug Info & Function Metadata
// ============================================================================

/**
 * Debug info structure that maps function indices to source locations
 */
export interface DebugInfo {
  /** File paths indexed by fileIdx */
  files: string[];
  /** Function info indexed by funcIdx */
  functions: FunctionInfo[];
}

/**
 * Function information for coverage and debugging
 */
export interface FunctionInfo {
  name: string;
  fileIdx: number;
  startLine: number;
  endLine: number;
}

/**
 * Function metadata extracted by AS transform
 */
export interface FunctionMetadata {
  name: string;
  startLine: number;
  endLine: number;
}

/**
 * Global metadata storage (populated by AS transform during compilation)
 *
 * The AS transform (src/transforms/extract-function-metadata.mjs) populates this
 * global variable with function metadata during compilation. The Binaryen coverage
 * instrumenter then reads this data to map function indices to source locations.
 */
declare global {
  var __functionMetadata: Map<string, FunctionMetadata[]> | undefined;
}

// ============================================================================
// Worker Communication & RPC - Per-Test Parallelism
// ============================================================================

/**
 * Task data for compileFile worker function
 *
 * Phase 1: File compilation (runs once per file)
 */
export interface CompileFileTask {
  /** Path to test file */
  testFile: string;
  /** Pool options */
  options: PoolOptions;
  /** Cache generation number */
  generation: number;
}

/**
 * Result from compileFile worker function
 */
export interface CompileFileResult {
  /** Compiled clean binary */
  binary: Uint8Array;
  /** Source map JSON (if available) */
  sourceMap: string | null;
  /** Compiled coverage binary (if coverage enabled) */
  coverageBinary?: Uint8Array;
  /** Debug info for coverage reporting */
  debugInfo: DebugInfo | null;
  /** Cache generation number */
  generation: number;
  /** Compilation phase timings */
  timings: PhaseTimings;
}

/**
 * Task data for discoverTests worker function
 *
 * Phase 2: Test discovery (runs once per file)
 */
export interface DiscoverTestsTask {
  /** Compiled binary to discover tests from */
  binary: Uint8Array;
  /** Path to test file (for logging) */
  testFile: string;
  /** Pool options */
  options: PoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Project information for file task creation */
  projectInfo: ProjectInfo;
  /** Compilation phase timings from compile worker */
  compileTimings: PhaseTimings;
}

/**
 * Result from discoverTests worker function
 */
export interface DiscoverTestsResult {
  /** Discovered tests with names and function indices */
  tests: DiscoveredTest[];
  /** Discovery phase timings */
  timings: PhaseTimings;
}

/**
 * Task data for executeTest worker function
 *
 * Phase 3: Single test execution (runs once per test)
 */
export interface ExecuteTestTask {
  /** Compiled clean binary */
  binary: Uint8Array;
  /** Source map JSON (for error location mapping) */
  sourceMap: string | null;
  /** Coverage binary (for single-mode coverage) */
  coverageBinary?: Uint8Array;
  /** Test to execute */
  test: DiscoveredTest;
  /** Test index in file (for ordering) */
  testIndex: number;
  /** Path to test file */
  testFile: string;
  /** Pool options */
  options: PoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Test task ID (for RPC reporting) */
  testTaskId: string;
  /** Test task name (for RPC reporting) */
  testTaskName: string;
}

/**
 * Result from executeTest worker function
 */
export interface ExecuteTestResult {
  /** Test execution result */
  result: TestResult;
  /** Test index (for ordering) */
  testIndex: number;
}

/**
 * Task data for compileCoverageBinary worker function
 *
 * Phase 4: Coverage binary compilation (lazy, runs once per file if needed)
 */
export interface CompileCoverageBinaryTask {
  /** Path to test file */
  testFile: string;
  /** Pool options */
  options: PoolOptions;
}

/**
 * Result from compileCoverageBinary worker function
 */
export interface CompileCoverageBinaryResult {
  /** Compiled coverage binary */
  coverageBinary: Uint8Array;
  /** Debug info for coverage reporting */
  debugInfo: DebugInfo | null;
}

/**
 * Task data for executeCoveragePass worker function
 *
 * Phase 5: Coverage collection for single test (runs once per test in dual mode)
 */
export interface ExecuteCoveragePassTask {
  /** Compiled coverage binary */
  coverageBinary: Uint8Array;
  /** Test to execute for coverage */
  test: DiscoveredTest;
  /** Path to test file (for logging) */
  testFile: string;
  /** Pool options */
  options: PoolOptions;
}

/**
 * Result from executeCoveragePass worker function
 */
export interface ExecuteCoveragePassResult {
  /** Coverage data collected for this test */
  coverage: CoverageData;
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
  options: PoolOptions;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Complete file task with all test results */
  fileTask: RunnerTestFile;
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
  options: PoolOptions;
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
  options: PoolOptions;
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

