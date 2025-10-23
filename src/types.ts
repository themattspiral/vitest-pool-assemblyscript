/**
 * Shared TypeScript types and interfaces
 *
 * This file contains all type definitions used across the vitest-pool-assemblyscript codebase.
 * Types are organized into logical sections for better maintainability.
 */

import type { MessagePort } from 'node:worker_threads';

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
   * Coverage mode:
   * - false: No coverage (fast, accurate errors)
   * - true: Coverage only (fast, broken errors when tests fail)
   * - 'dual': Both coverage AND accurate errors (slower, 2x compile/execute)
   */
  coverage?: boolean | 'dual';
  /**
   * Strip @inline decorators during compilation
   * Only applies when coverage is enabled
   */
  stripInline?: boolean;
}

// ============================================================================
// Compilation & Results
// ============================================================================

/**
 * Result of compiling AssemblyScript source (success case)
 */
export interface CompilationResult {
  /** Compiled WASM binary (if successful) */
  binary: Uint8Array;
  /** Source map JSON (if successful and --sourceMap enabled) */
  sourceMap: string | null;
  /** Debug info for coverage reporting (if coverage enabled) */
  debugInfo: DebugInfo | null;
  /** Instrumented coverage binary (only when coverage: 'dual') */
  coverageBinary?: Uint8Array;
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
 */
export interface CachedCompilation {
  binary: Uint8Array;
  sourceMap: string | null;
  coverageBinary?: Uint8Array;
  debugInfo: DebugInfo | null;
  discoveredTests: DiscoveredTest[];
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
 * Results from executing all tests in a file
 */
export interface ExecutionResults {
  /** Array of test results */
  tests: TestResult[];
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
// Worker Communication & RPC
// ============================================================================


/**
 * Task data sent from pool to worker via Tinypool
 * This is our custom data structure
 */
export interface PoolToWorkerData {
  /** Path to test file */
  testFile: string;
  /** Pool options (coverage, debug, etc.) */
  options: PoolOptions;
  /** Current generation number for this file */
  generation: number;
  /** Cached compilation data (null if cache miss) */
  cachedData: CachedCompilation | null;
  /** MessagePort for RPC communication */
  port: MessagePort;
  /** Project root directory */
  projectRoot: string;
  /** Project name */
  projectName: string;
  /** Test timeout from config */
  testTimeout: number;
}

// Re-export TaskResultPack type for convenience
export type { TaskResultPack } from '@vitest/runner';
