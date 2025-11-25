/**
 * Type definitions for wasm-binaryen-debug
 *
 * These types match the output format defined in debug-info-format-ref.md
 */

/**
 * Source location in a debug file
 */
export interface DebugLocation {
  /** Index into debugFiles array */
  fileIndex: number;
  /** Line number (1-based) */
  line: number;
  /** Column number (0-based) */
  column: number;
}

/**
 * Information about a single expression in the WASM AST
 */
export interface ExpressionInfo {
  /** Binaryen expression type name (e.g., "If", "LocalGet", "Const") */
  type: string;
  /** Source location if available */
  location?: DebugLocation;
  /** Whether this expression represents a branch point */
  isBranch: boolean;
  /** Number of possible execution paths from this branch (only present if isBranch is true) */
  branchPaths?: number;
}

/**
 * A branch edge from one basic block to another
 */
export interface Branch {
  /** Index of the target basic block */
  toBlock: number;
  /** Optional: index of the expression that causes this branch */
  expressionIndex?: number;
}

/**
 * A basic block - maximal sequence of instructions with single entry/exit
 */
export interface BasicBlockInfo {
  /** Index of this basic block within the function */
  index: number;
  /** Indices into the function's expressions array */
  expressionIndices: number[];
  /** Outgoing branch edges to other basic blocks */
  branches: Branch[];
}

/**
 * Function signature with parameter and result types
 */
export interface FunctionSignature {
  /** Parameter types (e.g., ["i32", "i32"]) */
  params: string[];
  /** Result types (e.g., ["i32"] or ["i32", "i32"] for multi-value) */
  results: string[];
}

/**
 * Debug information for a single function
 */
export interface FunctionDebugInfo {
  /** Function index in the WASM module */
  index: number;
  /** Whether this function has debug information (func->debugLocations was not empty) */
  hasDebugInfo: boolean;
  /** Function signature with parameter and result types */
  signature: FunctionSignature;
  /**
   * Optional: Name of the global variable that points to this function
   * For arrow functions like `const myArrow = () => ...`, this will be "path/myArrow"
   * while the function name itself will be "path~anonymous|N"
   */
  globalName?: string;
  /** All expressions in this function (in AST walk order) */
  expressions: ExpressionInfo[];
  /** Basic block groupings with branch edges */
  basicBlocks: BasicBlockInfo[];
}

/**
 * Complete debug information extracted from a WASM binary
 */
export interface DebugInfo {
  /** Array of source file paths from the source map */
  debugFiles: string[];
  /** Debug info for each function, keyed by function name */
  functions: Record<string, FunctionDebugInfo>;
}

/**
 * Options for instrumentation (not yet implemented)
 */
export interface InstrumentOptions {
  /** Import module name for coverage memory (default: "env") */
  memoryImportModule?: string;
  /** Import field name for coverage memory (default: "__coverage_memory") */
  memoryImportName?: string;
}

/**
 * Memory layout information for coverage tracking (not yet implemented)
 */
export interface MemoryInfo {
  /** Total number of basic blocks across all functions */
  totalBlocks: number;
  /** Byte offset for each function's coverage data */
  functionOffsets: number[];
  /** Number of basic blocks per function */
  functionBlockCounts: number[];
}

/**
 * Result from instrumentation (not yet implemented)
 */
export interface InstrumentResult {
  /** Instrumented WASM binary */
  instrumentedWasm: Buffer;
  /** Regenerated source map (as JSON string) */
  sourceMap: string;
  /** Debug information extracted during instrumentation */
  debugInfo: DebugInfo;
  /** Memory layout information for coverage tracking */
  memoryInfo: MemoryInfo;
}
