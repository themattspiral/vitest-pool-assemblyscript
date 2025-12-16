/**
 * AST Parser for AssemblyScript Source Files
 *
 * Parses AS source files to extract function metadata for coverage.
 * Used by generateCoverage to build empty coverage map from all source files.
 *
 * Source AST is the source of truth for what SHOULD be covered.
 * Binary instrumentation tells us what we CAN measure (hit counts).
 *
 * Functions are grouped by start line for efficient containment matching.
 *
 * Architecture:
 * - Uses shared ASTVisitor for complete NodeKind coverage
 * - Overrides hooks to extract function information during traversal
 */

import { readFile } from 'node:fs/promises';
import { parse as parsePath } from 'node:path';
import {
  Parser as AssemblyScriptParser,
  Source,
  BlockStatement,
  Node,
  FunctionDeclaration,
  MethodDeclaration,
  ClassDeclaration,
  VariableDeclaration,
  FunctionExpression,
} from 'assemblyscript';

import type { ParsedSourceFunctionInfo, SourceRange } from '../types.js';
import { ASCommonFlags, ASNodeKind } from '../types.js';
import { ASTVisitor } from '../util/ast-visitor.js';

/**
 * Visitor that extracts function information from AST nodes
 */
class FunctionExtractorVisitor extends ASTVisitor {
  /** Source file being parsed */
  private source: Source;
  /** Module path for building qualified names */
  private modulePath: string;
  /** Absolute file path */
  private filePath: string;
  /** Accumulated function records, keyed by start line */
  readonly functions: Record<number, ParsedSourceFunctionInfo[]> = {};
  /** Current class name (when inside a class) */
  private currentClassName: string | null = null;

  constructor(source: Source, modulePath: string, filePath: string) {
    super();
    this.source = source;
    this.modulePath = modulePath;
    this.filePath = filePath;
  }

  /**
   * Track class context when entering a class
   */
  protected onClassEnter(node: ClassDeclaration): void {
    this.currentClassName = node.name?.text ?? 'Anonymous';
  }

  /**
   * Restore class context when exiting a class
   */
  protected onClassExit(_node: ClassDeclaration): void {
    this.currentClassName = null;
  }

  /**
   * Extract function info from function declarations
   */
  protected onFunctionDeclaration(node: FunctionDeclaration): boolean {
    if (node.body && this.hasBodyStatements(node.body)) {
      const shortName = node.name?.text ?? '~anonymous';
      const qualifiedName = `${this.modulePath}/${shortName}`;
      const range = this.buildRange(node, node.name ?? null);
      this.addFunction(qualifiedName, shortName, range);
    }
    return true; // Continue recursion into body
  }

  /**
   * Extract function info from method declarations
   */
  protected onMethodDeclaration(node: MethodDeclaration): boolean {
    if (node.body && this.hasBodyStatements(node.body)) {
      const methodName = node.name?.text ?? 'constructor';
      const className = this.currentClassName ?? 'Unknown';
      const flags = node.flags;

      // Determine method type from flags
      const isStatic = (flags & ASCommonFlags.Static) !== 0;
      const isGetter = (flags & ASCommonFlags.Get) !== 0;
      const isSetter = (flags & ASCommonFlags.Set) !== 0;

      // Build short name to match binary naming convention:
      // - Static: ClassName.methodName
      // - Getter: ClassName#get:propertyName
      // - Setter: ClassName#set:propertyName
      // - Instance: ClassName#methodName
      let shortName: string;
      if (isStatic) {
        shortName = `${className}.${methodName}`;
      } else if (isGetter) {
        shortName = `${className}#get:${methodName}`;
      } else if (isSetter) {
        shortName = `${className}#set:${methodName}`;
      } else {
        shortName = `${className}#${methodName}`;
      }

      const qualifiedName = `${this.modulePath}/${shortName}`;
      const range = this.buildRange(node, node.name ?? null);
      this.addFunction(qualifiedName, shortName, range);
    }
    return true; // Continue recursion into body
  }

  /**
   * Extract function info from variable declarations (arrow functions)
   */
  protected onVariableDeclaration(node: VariableDeclaration): boolean {
    if (node.initializer && node.initializer.kind === ASNodeKind.Function) {
      const funcExpr = node.initializer as FunctionExpression;
      const funcDecl = funcExpr.declaration;

      if (funcDecl.body && this.hasBodyStatements(funcDecl.body)) {
        // Use variable name for the function
        const shortName = node.name.text;
        const qualifiedName = `${this.modulePath}/${shortName}`;

        // Use the variable declaration's range
        const range: SourceRange = {
          filePath: this.filePath,
          startLine: this.source.lineAt(node.range.start),
          startColumn: this.source.columnAt(),
          endLine: this.source.lineAt(node.range.end),
          endColumn: this.source.columnAt(),
        };

        this.addFunction(qualifiedName, shortName, range);
      }

      // Visit the function body manually since we're handling this specially
      if (funcDecl.body) {
        this.visitNode(funcDecl.body);
      }
      return false; // Don't recurse again - we handled it
    }
    return true; // Continue recursion for non-function initializers
  }

  /**
   * Check if a function body has statements (non-empty body)
   */
  private hasBodyStatements(body: Node): boolean {
    if (body.kind === ASNodeKind.Block) {
      const blockBody = body as BlockStatement;
      return blockBody.statements.length > 0;
    }
    // Expression body (braceless arrow) - always has the expression
    return true;
  }

  /**
   * Add a function to the functions record, keyed by start line
   */
  private addFunction(qualifiedName: string, shortName: string, range: SourceRange): void {
    const startLine = range.startLine;
    if (!this.functions[startLine]) {
      this.functions[startLine] = [];
    }
    this.functions[startLine].push({ qualifiedName, shortName, range });
  }

  /**
   * Build a SourceRange for a node, using name.range.start to skip decorators
   */
  private buildRange(node: Node, nameNode: Node | null): SourceRange {
    const startNode = nameNode ?? node;
    return {
      filePath: this.filePath,
      startLine: this.source.lineAt(startNode.range.start),
      startColumn: this.source.columnAt(),
      endLine: this.source.lineAt(node.range.end),
      endColumn: this.source.columnAt(),
    };
  }
}

/**
 * Parse functions from a single AS source file
 *
 * @param absoluteSourceFilePath - Absolute path to AS source file
 * @param relativeSourceFilePath - Relative path to AS source file (derived once in caller and used several places)
 * @returns Record of start line to array of ParsedSourceFunctionInfo (multiple functions can start on same line)
 */
export async function parseFunctionsFromFile(
  absoluteSourceFilePath: string,
  relativeSourceFilePath: string,
): Promise<Record<number, ParsedSourceFunctionInfo[]>> {
  const sourceCode = await readFile(absoluteSourceFilePath, 'utf8');

  // Build the module path (strip any extension, use forward slashes)
  const parsed = parsePath(relativeSourceFilePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const asParser = new AssemblyScriptParser();
  asParser.parseFile(sourceCode, relativeSourceFilePath, true);

  const source = asParser.currentSource;
  if (!source) {
    return {};
  }

  // Create visitor and traverse
  const visitor = new FunctionExtractorVisitor(source, modulePath, absoluteSourceFilePath);
  visitor.visitSource(source);

  return visitor.functions || {};
}
