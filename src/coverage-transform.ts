/**
 * Coverage Instrumentation Transform for AssemblyScript
 *
 * This transform:
 * 1. Visits all function declarations in user code
 * 2. Injects __coverage_trace(funcIdx, blockIdx) calls at function entry
 * 3. Builds debug info mapping: funcIdx -> {name, startLine, endLine}
 *
 * Based on research from assemblyscript-unittest-framework but simplified
 * to use AS-level instrumentation instead of WASM post-processing.
 */

import {
  Parser,
  FunctionDeclaration,
  SourceKind,
  CallExpression,
  IdentifierExpression,
  IntegerLiteralExpression,
  Statement,
  ExpressionStatement,
  Source,
  Range,
  Node,
} from 'assemblyscript/dist/assemblyscript.js';

import { Transform } from 'assemblyscript/dist/transform.js';

// i64_new is a global function provided by AssemblyScript runtime
// It converts JS numbers to i64 values for AST nodes
declare function i64_new(lo: number, hi?: number): any;

/**
 * Debug info structure that maps function indices to source locations
 */
export interface DebugInfo {
  files: string[]; // File paths indexed by fileIdx
  functions: FunctionInfo[]; // Function info indexed by funcIdx
}

export interface FunctionInfo {
  name: string;
  fileIdx: number;
  startLine: number;
  endLine: number;
}

/**
 * Coverage instrumentation transform
 *
 * Usage:
 *   import { CoverageTransform } from './coverage-transform';
 *   const transform = new CoverageTransform();
 *   // Pass to asc.main via --transform option
 *   // After compilation, get debug info via transform.getDebugInfo()
 */
export class CoverageTransform extends Transform {
  private functionIndex = 0;
  private functionInfos: FunctionInfo[] = [];
  private fileMap = new Map<string, number>();
  private files: string[] = [];

  /**
   * Called after the program is fully initialized
   * This is where we visit all user source files and inject coverage calls
   */
  afterInitialize(parser: Parser): void {
    console.log('[CoverageTransform] afterInitialize - visiting sources');

    // Visit all user source files (not stdlib)
    for (const source of parser.sources) {
      // Skip stdlib files
      if (source.sourceKind !== SourceKind.User && source.sourceKind !== SourceKind.UserEntry) {
        continue;
      }

      // Skip files that start with ~lib/ (stdlib)
      if (source.normalizedPath.startsWith('~lib/')) {
        continue;
      }

      console.log('[CoverageTransform] Visiting source:', source.normalizedPath);

      // Register this file
      const fileIdx = this.getOrCreateFileIndex(source.normalizedPath);

      // Visit all statements in this source
      this.visitSource(source, fileIdx);
    }

    console.log('[CoverageTransform] Instrumentation complete:', {
      totalFunctions: this.functionInfos.length,
      totalFiles: this.files.length,
    });
  }

  /**
   * Visit a source file and instrument all functions
   */
  private visitSource(source: Source, fileIdx: number): void {
    // Visit all top-level statements
    for (const statement of source.statements) {
      this.visitStatement(statement, fileIdx);
    }
  }

  /**
   * Visit a statement (could be function declaration, class, etc.)
   */
  private visitStatement(statement: Statement, fileIdx: number): void {
    // Check if this is a function declaration
    if (statement instanceof FunctionDeclaration) {
      this.visitFunctionDeclaration(statement, fileIdx);
    }

    // TODO: Handle class methods, nested functions, etc.
    // For now, just handle top-level functions
  }

  /**
   * Visit a function declaration and inject coverage trace
   */
  private visitFunctionDeclaration(node: FunctionDeclaration, fileIdx: number): void {
    // Skip if no body (abstract, ambient, etc.)
    if (!node.body || node.body.statements.length === 0) {
      console.log('[CoverageTransform] Skipping function (no body):', node.name.text);
      return;
    }

    // Skip constructors
    if (node.isConstructor) {
      console.log('[CoverageTransform] Skipping constructor');
      return;
    }

    // Get function name
    const functionName = node.name.text;

    // Assign function index
    const funcIdx = this.functionIndex++;

    // Get line range from the range
    const startLine = node.range.source.lineAt(node.range.start);
    const endLine = node.range.source.lineAt(node.range.end);

    // Store function info for debug mapping
    this.functionInfos.push({
      name: functionName,
      fileIdx,
      startLine,
      endLine,
    });

    console.log(`[CoverageTransform] Instrumenting function: ${functionName} (idx=${funcIdx}, lines ${startLine}-${endLine})`);

    // Inject coverage trace call at function entry
    // We'll inject: __coverage_trace(funcIdx, 0);
    // where 0 is the basic block index (for now, just function entry)
    this.injectTraceCall(node, funcIdx, 0);
  }

  /**
   * Inject a coverage trace call at the start of a function
   */
  private injectTraceCall(node: FunctionDeclaration, funcIdx: number, blockIdx: number): void {
    // Create the trace call: __coverage_trace(funcIdx, blockIdx);
    // Reuse the function's range for the injected statement
    const traceCall = this.createTraceCallStatement(funcIdx, blockIdx, node.range);

    // Insert at the beginning of the function body
    node.body!.statements.unshift(traceCall);

    console.log(`[CoverageTransform] Injected trace call: __coverage_trace(${funcIdx}, ${blockIdx})`);
  }

  /**
   * Create an ExpressionStatement for: __coverage_trace(funcIdx, blockIdx);
   */
  private createTraceCallStatement(funcIdx: number, blockIdx: number, sourceRange: Range): ExpressionStatement {
    // Reuse the source range from the function being instrumented
    // This ensures the injected nodes have proper source context

    // Create identifier for __coverage_trace
    const traceIdentifier = new IdentifierExpression(
      '__coverage_trace',
      false, // isQuoted
      sourceRange
    );

    // Create integer literals for arguments
    // IMPORTANT: Must convert JS numbers to i64 values using i64_new()
    // Otherwise all literals will have the same value at runtime
    const funcIdxValue = i64_new(funcIdx);
    const blockIdxValue = i64_new(blockIdx);

    const funcIdxLiteral = Node.createIntegerLiteralExpression(funcIdxValue, sourceRange);
    const blockIdxLiteral = Node.createIntegerLiteralExpression(blockIdxValue, sourceRange);

    // Create call expression: __coverage_trace(funcIdx, blockIdx)
    const callExpression = new CallExpression(
      traceIdentifier,
      null, // no type arguments
      [funcIdxLiteral, blockIdxLiteral],
      sourceRange
    );

    // Wrap in expression statement
    const statement = new ExpressionStatement(callExpression);

    return statement;
  }

  /**
   * Get or create a file index for the given path
   */
  private getOrCreateFileIndex(path: string): number {
    if (this.fileMap.has(path)) {
      return this.fileMap.get(path)!;
    }

    const idx = this.files.length;
    this.files.push(path);
    this.fileMap.set(path, idx);
    return idx;
  }

  /**
   * Get the debug info mapping after compilation
   */
  getDebugInfo(): DebugInfo {
    return {
      files: this.files,
      functions: this.functionInfos,
    };
  }
}

/**
 * Export a factory function for the transform
 * This is what gets passed to asc.main via --transform
 */
export default function createCoverageTransform(): Transform {
  return new CoverageTransform();
}
