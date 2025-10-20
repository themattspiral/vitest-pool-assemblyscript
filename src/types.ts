/**
 * Shared TypeScript types and interfaces
 */

/**
 * Pool configuration options
 */
export interface PoolOptions {
  /** Enable verbose debug logging */
  debug?: boolean;
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
}

/**
 * Results from executing all tests in a file
 */
export interface ExecutionResults {
  /** Array of test results */
  tests: TestResult[];
}

/**
 * Result of compiling AssemblyScript source
 */
export interface CompilationResult {
  /** Compiled WASM binary (if successful) */
  binary: Uint8Array;
  /** Source map JSON (if successful and --sourceMap enabled) */
  sourceMap: string | null;
  /** Error (if compilation failed) */
  error: null;
}

export interface CompilationError {
  /** No binary on error */
  binary: null;
  /** No source map on error */
  sourceMap: null;
  /** Compilation error */
  error: Error;
}

/**
 * Union type for compilation results
 */
export type CompileResult = CompilationResult | CompilationError;
