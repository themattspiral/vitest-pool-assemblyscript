/**
 * AST Parser for AssemblyScript Source Files
 *
 * Parses AS source files to extract function metadata for coverage.
 * Used by generateCoverage to build empty coverage map from all source files.
 *
 * Source AST is the source of truth for what SHOULD be covered.
 * Binary instrumentation tells us what we CAN measure (hit counts).
 *
 * Functions are grouped by start line for containment matching:
 * - Binary gives us a point (representativeLocation) somewhere in the function
 * - Source gives us function ranges (start/end line/column)
 * - We find which source function range contains the binary point
 * - "Tightest fit" handles nested functions (innermost wins)
 *
 * Architecture:
 * - Uses visitor pattern with complete NodeKind coverage (following auf's listFunctions.mts)
 * - Recursively visits ALL node types to find nested functions in any context
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
  NamespaceDeclaration,
  VariableStatement,
  VariableDeclaration,
  FunctionExpression,
  ExpressionStatement,
  BinaryExpression,
  PropertyAccessExpression,
  IfStatement,
  WhileStatement,
  DoStatement,
  ForStatement,
  ForOfStatement,
  SwitchStatement,
  SwitchCase,
  TryStatement,
  ThrowStatement,
  ReturnStatement,
  CallExpression,
  NewExpression,
  ParenthesizedExpression,
  TernaryExpression,
  CommaExpression,
  AssertionExpression,
  InstanceOfExpression,
  ElementAccessExpression,
  UnaryPostfixExpression,
  UnaryPrefixExpression,
  ClassExpression,
  ParameterNode,
  EnumDeclaration,
  EnumValueDeclaration,
  FieldDeclaration,
  InterfaceDeclaration,
  VoidStatement,
} from 'assemblyscript';
import type { ParsedSourceFunctionInfo, SourceRange } from '../types.js';

// NodeKind enum values (from AS compiler)
// Defined locally to avoid isolatedModules const enum access issues
// Reference: assemblyscript.generated.d.ts NodeKind enum
const NodeKind = {
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

// CommonFlags bit flags (from AS compiler)
// Defined locally to avoid isolatedModules const enum access issues
const CommonFlags = {
  Static: 32,
  Get: 2048,
  Set: 4096,
} as const;

/** Context passed during AST traversal */
interface VisitorContext {
  /** Source file being parsed */
  source: Source;
  /** Module path for building qualified names */
  modulePath: string;
  /** Absolute file path */
  filePath: string;
  /**
   * Accumulated function records, keyed by start line.
   * Multiple functions can start on the same line (e.g., nested arrow functions).
   */
  functions: Record<number, ParsedSourceFunctionInfo[]>;
  /** Current class name (when inside a class) */
  currentClassName: string | null;
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
  const functions: Record<number, ParsedSourceFunctionInfo[]> = {};

  // Build the module path (strip any extension, use forward slashes)
  const parsed = parsePath(relativeSourceFilePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const asParser = new AssemblyScriptParser();
  asParser.parseFile(sourceCode, relativeSourceFilePath, true);

  const source = asParser.currentSource;
  if (!source) {
    return functions;
  }

  // Create visitor context
  const context: VisitorContext = {
    source,
    modulePath,
    filePath: absoluteSourceFilePath,
    functions,
    currentClassName: null,
  };

  // Visit all top-level statements
  for (const stmt of source.statements) {
    visitNode(stmt, context);
  }

  return functions;
}

/**
 * Check if a function body has statements (non-empty body)
 *
 * Used to skip functions with empty bodies when building the function list.
 *
 * Handles two cases:
 * 1. Block body (braces): Has statements if the block has at least one statement
 * 2. Expression body (braceless arrow): Always has the expression
 */
function hasBodyStatements(body: Node, _source: Source): boolean {
  if (body.kind === NodeKind.Block) {
    const blockBody = body as BlockStatement;
    return blockBody.statements.length > 0;
  }
  // Expression body (braceless arrow) - always has the expression
  return true;
}

/**
 * Add a function to the context's functions record, keyed by start line.
 * Multiple functions can start on the same line (pushed to array).
 */
function addFunction(
  context: VisitorContext,
  qualifiedName: string,
  shortName: string,
  range: SourceRange
): void {
  const startLine = range.startLine;
  if (!context.functions[startLine]) {
    context.functions[startLine] = [];
  }
  context.functions[startLine].push({
    qualifiedName,
    shortName,
    range
  });
}

/**
 * Build a SourceRange for a node, using name.range.start to skip decorators
 */
function buildRange(
  node: Node,
  nameNode: Node | null,
  context: VisitorContext
): SourceRange {
  const startNode = nameNode ?? node;
  return {
    filePath: context.filePath,
    startLine: context.source.lineAt(startNode.range.start),
    startColumn: context.source.columnAt(),
    endLine: context.source.lineAt(node.range.end),
    endColumn: context.source.columnAt(),
  };
}

// ============================================================================
// Visitor Pattern Implementation
// ============================================================================

/**
 * Main visitor dispatch - routes to specific handler based on node kind
 *
 * This visitor covers ALL NodeKind values to ensure we find functions
 * nested in any context (call arguments, ternary expressions, etc.)
 */
function visitNode(node: Node, context: VisitorContext): void {
  switch (node.kind) {
    // Source file (entry point)
    case NodeKind.Source:
      visitSource(node as Source, context);
      break;

    // Type nodes - no functions can be nested here
    case NodeKind.NamedType:
    case NodeKind.FunctionType:
    case NodeKind.TypeName:
    case NodeKind.TypeParameter:
      break;

    // Parameter - may have default value with function
    case NodeKind.Parameter:
      visitParameterNode(node as ParameterNode, context);
      break;

    // Simple expressions - no children
    case NodeKind.Identifier:
    case NodeKind.False:
    case NodeKind.Literal:
    case NodeKind.Null:
    case NodeKind.Omitted:
    case NodeKind.Super:
    case NodeKind.This:
    case NodeKind.True:
    case NodeKind.Constructor:
    case NodeKind.Compiled:
      break;

    // Expressions with children
    case NodeKind.Assertion:
      visitAssertionExpression(node as AssertionExpression, context);
      break;
    case NodeKind.Binary:
      visitBinaryExpression(node as BinaryExpression, context);
      break;
    case NodeKind.Call:
      visitCallExpression(node as CallExpression, context);
      break;
    case NodeKind.Class:
      visitClassExpression(node as ClassExpression, context);
      break;
    case NodeKind.Comma:
      visitCommaExpression(node as CommaExpression, context);
      break;
    case NodeKind.ElementAccess:
      visitElementAccessExpression(node as ElementAccessExpression, context);
      break;
    case NodeKind.Function:
      visitFunctionExpression(node as FunctionExpression, context);
      break;
    case NodeKind.InstanceOf:
      visitInstanceOfExpression(node as InstanceOfExpression, context);
      break;
    case NodeKind.New:
      visitNewExpression(node as NewExpression, context);
      break;
    case NodeKind.Parenthesized:
      visitParenthesizedExpression(node as ParenthesizedExpression, context);
      break;
    case NodeKind.PropertyAccess:
      visitPropertyAccessExpression(node as PropertyAccessExpression, context);
      break;
    case NodeKind.Ternary:
      visitTernaryExpression(node as TernaryExpression, context);
      break;
    case NodeKind.UnaryPostfix:
      visitUnaryPostfixExpression(node as UnaryPostfixExpression, context);
      break;
    case NodeKind.UnaryPrefix:
      visitUnaryPrefixExpression(node as UnaryPrefixExpression, context);
      break;

    // Statements with no interesting children for function discovery
    case NodeKind.Break:
    case NodeKind.Continue:
    case NodeKind.Empty:
    case NodeKind.Export:
    case NodeKind.ExportDefault:
    case NodeKind.ExportImport:
    case NodeKind.Import:
    case NodeKind.Module:
      break;

    // Statements with children
    case NodeKind.Block:
      visitBlockStatement(node as BlockStatement, context);
      break;
    case NodeKind.Do:
      visitDoStatement(node as DoStatement, context);
      break;
    case NodeKind.Expression:
      visitExpressionStatement(node as ExpressionStatement, context);
      break;
    case NodeKind.For:
      visitForStatement(node as ForStatement, context);
      break;
    case NodeKind.ForOf:
      visitForOfStatement(node as ForOfStatement, context);
      break;
    case NodeKind.If:
      visitIfStatement(node as IfStatement, context);
      break;
    case NodeKind.Return:
      visitReturnStatement(node as ReturnStatement, context);
      break;
    case NodeKind.Switch:
      visitSwitchStatement(node as SwitchStatement, context);
      break;
    case NodeKind.Throw:
      visitThrowStatement(node as ThrowStatement, context);
      break;
    case NodeKind.Try:
      visitTryStatement(node as TryStatement, context);
      break;
    case NodeKind.Variable:
      visitVariableStatement(node as VariableStatement, context);
      break;
    case NodeKind.Void:
      visitVoidStatement(node as VoidStatement, context);
      break;
    case NodeKind.While:
      visitWhileStatement(node as WhileStatement, context);
      break;

    // Declaration statements
    case NodeKind.ImportDeclaration:
    case NodeKind.TypeDeclaration:
      break;
    case NodeKind.ClassDeclaration:
      visitClassDeclaration(node as ClassDeclaration, context);
      break;
    case NodeKind.EnumDeclaration:
      visitEnumDeclaration(node as EnumDeclaration, context);
      break;
    case NodeKind.EnumValueDeclaration:
      visitEnumValueDeclaration(node as EnumValueDeclaration, context);
      break;
    case NodeKind.FieldDeclaration:
      visitFieldDeclaration(node as FieldDeclaration, context);
      break;
    case NodeKind.FunctionDeclaration:
      visitFunctionDeclaration(node as FunctionDeclaration, context);
      break;
    case NodeKind.InterfaceDeclaration:
      visitInterfaceDeclaration(node as InterfaceDeclaration, context);
      break;
    case NodeKind.MethodDeclaration:
      visitMethodDeclaration(node as MethodDeclaration, context);
      break;
    case NodeKind.NamespaceDeclaration:
      visitNamespaceDeclaration(node as NamespaceDeclaration, context);
      break;
    case NodeKind.VariableDeclaration:
      visitVariableDeclaration(node as VariableDeclaration, context);
      break;

    // Special nodes
    case NodeKind.ExportMember:
    case NodeKind.IndexSignature:
    case NodeKind.Comment:
    case NodeKind.Decorator:
      break;
    case NodeKind.SwitchCase:
      visitSwitchCase(node as SwitchCase, context);
      break;
  }
}

// ============================================================================
// Source and Parameter Visitors
// ============================================================================

function visitSource(node: Source, context: VisitorContext): void {
  for (const statement of node.statements) {
    visitNode(statement, context);
  }
}

function visitParameterNode(node: ParameterNode, context: VisitorContext): void {
  // Default parameter values may contain functions
  if (node.initializer) {
    visitNode(node.initializer, context);
  }
}

// ============================================================================
// Expression Visitors
// ============================================================================

function visitAssertionExpression(node: AssertionExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitBinaryExpression(node: BinaryExpression, context: VisitorContext): void {
  visitNode(node.left, context);
  visitNode(node.right, context);
}

function visitCallExpression(node: CallExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
  for (const arg of node.args) {
    visitNode(arg, context);
  }
}

function visitClassExpression(node: ClassExpression, context: VisitorContext): void {
  visitClassDeclaration(node.declaration, context);
}

function visitCommaExpression(node: CommaExpression, context: VisitorContext): void {
  for (const expr of node.expressions) {
    visitNode(expr, context);
  }
}

function visitElementAccessExpression(node: ElementAccessExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
  visitNode(node.elementExpression, context);
}

function visitFunctionExpression(node: FunctionExpression, context: VisitorContext): void {
  // A function expression wraps a function declaration - visit it
  visitFunctionDeclaration(node.declaration, context);
}

function visitInstanceOfExpression(node: InstanceOfExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitNewExpression(node: NewExpression, context: VisitorContext): void {
  for (const arg of node.args) {
    visitNode(arg, context);
  }
}

function visitParenthesizedExpression(node: ParenthesizedExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitPropertyAccessExpression(node: PropertyAccessExpression, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitTernaryExpression(node: TernaryExpression, context: VisitorContext): void {
  visitNode(node.condition, context);
  visitNode(node.ifThen, context);
  visitNode(node.ifElse, context);
}

function visitUnaryPostfixExpression(node: UnaryPostfixExpression, context: VisitorContext): void {
  visitNode(node.operand, context);
}

function visitUnaryPrefixExpression(node: UnaryPrefixExpression, context: VisitorContext): void {
  visitNode(node.operand, context);
}

// ============================================================================
// Statement Visitors
// ============================================================================

function visitBlockStatement(node: BlockStatement, context: VisitorContext): void {
  for (const statement of node.statements) {
    visitNode(statement, context);
  }
}

function visitDoStatement(node: DoStatement, context: VisitorContext): void {
  visitNode(node.body, context);
  visitNode(node.condition, context);
}

function visitExpressionStatement(node: ExpressionStatement, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitForStatement(node: ForStatement, context: VisitorContext): void {
  if (node.initializer) {
    visitNode(node.initializer, context);
  }
  if (node.condition) {
    visitNode(node.condition, context);
  }
  if (node.incrementor) {
    visitNode(node.incrementor, context);
  }
  visitNode(node.body, context);
}

function visitForOfStatement(node: ForOfStatement, context: VisitorContext): void {
  visitNode(node.variable, context);
  visitNode(node.iterable, context);
  visitNode(node.body, context);
}

function visitIfStatement(node: IfStatement, context: VisitorContext): void {
  visitNode(node.condition, context);
  visitNode(node.ifTrue, context);
  if (node.ifFalse) {
    visitNode(node.ifFalse, context);
  }
}

function visitReturnStatement(node: ReturnStatement, context: VisitorContext): void {
  if (node.value) {
    visitNode(node.value, context);
  }
}

function visitSwitchStatement(node: SwitchStatement, context: VisitorContext): void {
  visitNode(node.condition, context);
  for (const switchCase of node.cases) {
    visitSwitchCase(switchCase, context);
  }
}

function visitThrowStatement(node: ThrowStatement, context: VisitorContext): void {
  visitNode(node.value, context);
}

function visitTryStatement(node: TryStatement, context: VisitorContext): void {
  for (const stmt of node.bodyStatements) {
    visitNode(stmt, context);
  }
  if (node.catchStatements) {
    for (const stmt of node.catchStatements) {
      visitNode(stmt, context);
    }
  }
  if (node.finallyStatements) {
    for (const stmt of node.finallyStatements) {
      visitNode(stmt, context);
    }
  }
}

function visitVariableStatement(node: VariableStatement, context: VisitorContext): void {
  for (const declaration of node.declarations) {
    visitVariableDeclaration(declaration, context);
  }
}

function visitVoidStatement(node: VoidStatement, context: VisitorContext): void {
  visitNode(node.expression, context);
}

function visitWhileStatement(node: WhileStatement, context: VisitorContext): void {
  visitNode(node.condition, context);
  visitNode(node.body, context);
}

function visitSwitchCase(node: SwitchCase, context: VisitorContext): void {
  if (node.label) {
    visitNode(node.label, context);
  }
  for (const stmt of node.statements) {
    visitNode(stmt, context);
  }
}

// ============================================================================
// Declaration Visitors - These extract function information
// ============================================================================

function visitClassDeclaration(node: ClassDeclaration, context: VisitorContext): void {
  const className = node.name?.text ?? 'Anonymous';
  const savedClassName = context.currentClassName;
  context.currentClassName = className;

  for (const member of node.members) {
    visitNode(member, context);
  }

  context.currentClassName = savedClassName;
}

function visitEnumDeclaration(node: EnumDeclaration, context: VisitorContext): void {
  for (const value of node.values) {
    visitEnumValueDeclaration(value, context);
  }
}

function visitEnumValueDeclaration(node: EnumValueDeclaration, context: VisitorContext): void {
  if (node.initializer) {
    visitNode(node.initializer, context);
  }
}

function visitFieldDeclaration(node: FieldDeclaration, context: VisitorContext): void {
  // Field initializers may contain functions
  if (node.initializer) {
    visitNode(node.initializer, context);
  }
}

/**
 * Visit a function declaration and extract function info
 *
 * Handles:
 * - Top-level functions: export function add() {}
 * - Nested functions inside other functions
 * - Arrow functions via FunctionExpression -> FunctionDeclaration
 */
function visitFunctionDeclaration(node: FunctionDeclaration, context: VisitorContext): void {
  // Extract function info if it has a body (not just a declaration)
  if (node.body) {
    const hasStatements = hasBodyStatements(node.body, context.source);

    // Only add functions with statements (skip empty bodies)
    if (hasStatements) {
      const shortName = node.name?.text ?? '~anonymous';
      const qualifiedName = `${context.modulePath}/${shortName}`;

      // Use name.range.start to skip decorators
      const nameNode = node.name ?? null;
      const range = buildRange(node, nameNode, context);

      addFunction(context, qualifiedName, shortName, range);
    }

    // Recurse into the body to find nested functions
    visitNode(node.body, context);
  }
}

function visitInterfaceDeclaration(node: InterfaceDeclaration, context: VisitorContext): void {
  // Interfaces can extend ClassDeclaration, visit like a class
  visitClassDeclaration(node as unknown as ClassDeclaration, context);
}

/**
 * Visit a method declaration and extract function info
 *
 * Handles:
 * - Instance methods: class Foo { bar() {} }
 * - Static methods: class Foo { static bar() {} }
 * - Getters: class Foo { get prop() {} }
 * - Setters: class Foo { set prop(v) {} }
 * - Constructors: class Foo { constructor() {} }
 */
function visitMethodDeclaration(node: MethodDeclaration, context: VisitorContext): void {
  if (node.body) {
    const hasStatements = hasBodyStatements(node.body, context.source);

    // Only add methods with statements (skip empty bodies)
    if (hasStatements) {
      const methodName = node.name?.text ?? 'constructor';
      const className = context.currentClassName ?? 'Unknown';
      const flags = node.flags;

      // Determine method type from flags
      const isStatic = (flags & CommonFlags.Static) !== 0;
      const isGetter = (flags & CommonFlags.Get) !== 0;
      const isSetter = (flags & CommonFlags.Set) !== 0;

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

      const qualifiedName = `${context.modulePath}/${shortName}`;

      // Use name.range.start to skip decorators
      const nameNode = node.name ?? null;
      const range = buildRange(node, nameNode, context);

      addFunction(context, qualifiedName, shortName, range);
    }

    // Recurse into the body to find nested functions
    visitNode(node.body, context);
  }
}

function visitNamespaceDeclaration(node: NamespaceDeclaration, context: VisitorContext): void {
  for (const member of node.members) {
    visitNode(member, context);
  }
}

/**
 * Visit a variable declaration and extract function info if initializer is a function
 *
 * Handles:
 * - Arrow functions: const add = (a, b) => a + b
 * - Function expressions: const add = function(a, b) { return a + b; }
 */
function visitVariableDeclaration(node: VariableDeclaration, context: VisitorContext): void {
  if (node.initializer) {
    // Check if this is a function expression (arrow function or function expression)
    if (node.initializer.kind === NodeKind.Function) {
      const funcExpr = node.initializer as FunctionExpression;
      const funcDecl = funcExpr.declaration;

      if (funcDecl.body) {
        const hasStatements = hasBodyStatements(funcDecl.body, context.source);

        if (hasStatements) {
          // Use variable name for the function
          const shortName = node.name.text;
          const qualifiedName = `${context.modulePath}/${shortName}`;

          // Use the declaration's range for the function
          const range: SourceRange = {
            filePath: context.filePath,
            startLine: context.source.lineAt(node.range.start),
            startColumn: context.source.columnAt(),
            endLine: context.source.lineAt(node.range.end),
            endColumn: context.source.columnAt(),
          };

          addFunction(context, qualifiedName, shortName, range);
        }

        // Recurse into the function body to find nested functions
        visitNode(funcDecl.body, context);
      }
    } else {
      // Not a function expression, but might contain nested functions
      visitNode(node.initializer, context);
    }
  }
}
