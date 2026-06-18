/**
 * Base AST Visitor for AssemblyScript
 *
 * Provides reusable walking logic for traversing AS AST nodes.
 * Subclasses override hook methods to perform specific tasks.
 *
 * Used by:
 * - ast-parser.ts: Extract function metadata for coverage
 * - strip-inline.mts: Strip @inline decorators
 */

import {
  Node,
  Source,
  BlockStatement,
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

import { ASNodeKind } from '../types/constants.js';

/**
 * Node kinds that represent coverable statements (Istanbul statement granularity).
 * Excludes Block / Empty / ForOf and bare declarations. Variable statements fire
 * here too; the consumer extracts per-declarator-with-initializer.
 */
const STATEMENT_NODE_KINDS: ReadonlySet<number> = new Set<number>([
  ASNodeKind.Expression,
  ASNodeKind.Variable,
  ASNodeKind.Return,
  ASNodeKind.If,
  ASNodeKind.While,
  ASNodeKind.Do,
  ASNodeKind.For,
  ASNodeKind.Switch,
  ASNodeKind.Throw,
  ASNodeKind.Break,
  ASNodeKind.Continue,
  ASNodeKind.Try,
  ASNodeKind.Void,
]);

/**
 * Abstract base class for AST visitors.
 *
 * Subclasses override hook methods to perform tasks during traversal:
 * - beforeVisit: Called before visiting each node (e.g., strip decorators)
 * - onFunctionDeclaration: Called when visiting a function declaration
 * - onMethodDeclaration: Called when visiting a method declaration
 * - onVariableDeclaration: Called when visiting a variable declaration
 * - onClassEnter/onClassExit: Called when entering/exiting a class
 * - onNamespaceEnter/onNamespaceExit: Called when entering/exiting a namespace
 */
export abstract class ASTVisitor {
  /**
   * Visit all statements in a source file
   */
  visitSource(source: Source): void {
    for (const stmt of source.statements) {
      this.visitNode(stmt);
    }
  }

  /**
   * Hook called before visiting each node.
   * Override to perform pre-visit tasks (e.g., stripping decorators).
   */
  protected beforeVisit(_node: Node): void {}

  /**
   * Hook called when visiting a coverable statement node (see STATEMENT_NODE_KINDS).
   * Override to extract statement info. Fires before recursing into children, so
   * nested statements each fire their own call.
   */
  protected onStatement(_node: Node): void {}

  /**
   * Hook called when entering a namespace declaration.
   * Override to track namespace context.
   */
  protected onNamespaceEnter(_node: NamespaceDeclaration): void {}

  /**
   * Hook called when exiting a namespace declaration.
   * Override to restore namespace context.
   */
  protected onNamespaceExit(_node: NamespaceDeclaration): void {}

  /**
   * Hook called when entering a class declaration.
   * Override to track class context.
   */
  protected onClassEnter(_node: ClassDeclaration): void {}

  /**
   * Hook called when exiting a class declaration.
   * Override to restore class context.
   */
  protected onClassExit(_node: ClassDeclaration): void {}

  /**
   * Hook called when visiting a function declaration.
   * Override to extract function info or perform other tasks.
   * Return false to skip recursing into the function body.
   */
  protected onFunctionDeclaration(_node: FunctionDeclaration): boolean {
    return true; // Continue recursion by default
  }

  /**
   * Hook called when visiting a method declaration.
   * Override to extract method info or perform other tasks.
   * Return false to skip recursing into the method body.
   */
  protected onMethodDeclaration(_node: MethodDeclaration): boolean {
    return true; // Continue recursion by default
  }

  /**
   * Hook called when visiting a variable declaration.
   * Override to handle variable declarations (e.g., arrow functions).
   * Return false to skip recursing into the initializer.
   */
  protected onVariableDeclaration(_node: VariableDeclaration): boolean {
    return true; // Continue recursion by default
  }

  /**
   * Main visitor dispatch - routes to specific handler based on node kind
   */
  visitNode(node: Node): void {
    // Call pre-visit hook
    this.beforeVisit(node);

    // Statement extraction hook — fires for coverable statement kinds, before
    // recursing, so nested statements each fire their own call.
    if (STATEMENT_NODE_KINDS.has(node.kind)) {
      this.onStatement(node);
    }

    // Recurse into children based on node kind
    switch (node.kind) {
      // Type nodes - no children to visit
      case ASNodeKind.NamedType:
      case ASNodeKind.FunctionType:
      case ASNodeKind.TypeName:
      case ASNodeKind.TypeParameter:
        break;

      // Parameter - may have default value
      case ASNodeKind.Parameter: {
        const param = node as ParameterNode;
        if (param.initializer) this.visitNode(param.initializer);
        break;
      }

      // Simple expressions - no children
      case ASNodeKind.Identifier:
      case ASNodeKind.False:
      case ASNodeKind.Literal:
      case ASNodeKind.Null:
      case ASNodeKind.Omitted:
      case ASNodeKind.Super:
      case ASNodeKind.This:
      case ASNodeKind.True:
      case ASNodeKind.Constructor:
      case ASNodeKind.Compiled:
        break;

      // Expressions with children
      case ASNodeKind.Assertion: {
        const expr = node as AssertionExpression;
        this.visitNode(expr.expression);
        break;
      }
      case ASNodeKind.Binary: {
        const expr = node as BinaryExpression;
        this.visitNode(expr.left);
        this.visitNode(expr.right);
        break;
      }
      case ASNodeKind.Call: {
        const expr = node as CallExpression;
        this.visitNode(expr.expression);
        for (const arg of expr.args) this.visitNode(arg);
        break;
      }
      case ASNodeKind.Class: {
        const expr = node as ClassExpression;
        this.visitNode(expr.declaration);
        break;
      }
      case ASNodeKind.Comma: {
        const expr = node as CommaExpression;
        for (const e of expr.expressions) this.visitNode(e);
        break;
      }
      case ASNodeKind.ElementAccess: {
        const expr = node as ElementAccessExpression;
        this.visitNode(expr.expression);
        this.visitNode(expr.elementExpression);
        break;
      }
      case ASNodeKind.Function: {
        const expr = node as FunctionExpression;
        this.visitNode(expr.declaration);
        break;
      }
      case ASNodeKind.InstanceOf: {
        const expr = node as InstanceOfExpression;
        this.visitNode(expr.expression);
        break;
      }
      case ASNodeKind.New: {
        const expr = node as NewExpression;
        for (const arg of expr.args) this.visitNode(arg);
        break;
      }
      case ASNodeKind.Parenthesized: {
        const expr = node as ParenthesizedExpression;
        this.visitNode(expr.expression);
        break;
      }
      case ASNodeKind.PropertyAccess: {
        const expr = node as PropertyAccessExpression;
        this.visitNode(expr.expression);
        break;
      }
      case ASNodeKind.Ternary: {
        const expr = node as TernaryExpression;
        this.visitNode(expr.condition);
        this.visitNode(expr.ifThen);
        this.visitNode(expr.ifElse);
        break;
      }
      case ASNodeKind.UnaryPostfix: {
        const expr = node as UnaryPostfixExpression;
        this.visitNode(expr.operand);
        break;
      }
      case ASNodeKind.UnaryPrefix: {
        const expr = node as UnaryPrefixExpression;
        this.visitNode(expr.operand);
        break;
      }

      // Statements with no interesting children
      case ASNodeKind.Break:
      case ASNodeKind.Continue:
      case ASNodeKind.Empty:
      case ASNodeKind.Export:
      case ASNodeKind.ExportDefault:
      case ASNodeKind.ExportImport:
      case ASNodeKind.Import:
      case ASNodeKind.Module:
        break;

      // Statements with children
      case ASNodeKind.Block: {
        const stmt = node as BlockStatement;
        for (const s of stmt.statements) this.visitNode(s);
        break;
      }
      case ASNodeKind.Do: {
        const stmt = node as DoStatement;
        this.visitNode(stmt.body);
        this.visitNode(stmt.condition);
        break;
      }
      case ASNodeKind.Expression: {
        const stmt = node as ExpressionStatement;
        this.visitNode(stmt.expression);
        break;
      }
      case ASNodeKind.For: {
        const stmt = node as ForStatement;
        if (stmt.initializer) this.visitNode(stmt.initializer);
        if (stmt.condition) this.visitNode(stmt.condition);
        if (stmt.incrementor) this.visitNode(stmt.incrementor);
        this.visitNode(stmt.body);
        break;
      }
      case ASNodeKind.ForOf: {
        const stmt = node as ForOfStatement;
        this.visitNode(stmt.variable);
        this.visitNode(stmt.iterable);
        this.visitNode(stmt.body);
        break;
      }
      case ASNodeKind.If: {
        const stmt = node as IfStatement;
        this.visitNode(stmt.condition);
        this.visitNode(stmt.ifTrue);
        if (stmt.ifFalse) this.visitNode(stmt.ifFalse);
        break;
      }
      case ASNodeKind.Return: {
        const stmt = node as ReturnStatement;
        if (stmt.value) this.visitNode(stmt.value);
        break;
      }
      case ASNodeKind.Switch: {
        const stmt = node as SwitchStatement;
        this.visitNode(stmt.condition);
        for (const switchCase of stmt.cases) this.visitNode(switchCase);
        break;
      }
      case ASNodeKind.Throw: {
        const stmt = node as ThrowStatement;
        this.visitNode(stmt.value);
        break;
      }
      case ASNodeKind.Try: {
        const stmt = node as TryStatement;
        for (const s of stmt.bodyStatements) this.visitNode(s);
        if (stmt.catchStatements) {
          for (const s of stmt.catchStatements) this.visitNode(s);
        }
        if (stmt.finallyStatements) {
          for (const s of stmt.finallyStatements) this.visitNode(s);
        }
        break;
      }
      case ASNodeKind.Variable: {
        const stmt = node as VariableStatement;
        for (const decl of stmt.declarations) this.visitNode(decl);
        break;
      }
      case ASNodeKind.Void: {
        const stmt = node as VoidStatement;
        this.visitNode(stmt.expression);
        break;
      }
      case ASNodeKind.While: {
        const stmt = node as WhileStatement;
        this.visitNode(stmt.condition);
        this.visitNode(stmt.body);
        break;
      }
      case ASNodeKind.SwitchCase: {
        const stmt = node as SwitchCase;
        if (stmt.label) this.visitNode(stmt.label);
        for (const s of stmt.statements) this.visitNode(s);
        break;
      }

      // Declaration statements
      case ASNodeKind.ImportDeclaration:
      case ASNodeKind.TypeDeclaration:
        break;

      case ASNodeKind.ClassDeclaration: {
        const decl = node as ClassDeclaration;
        this.onClassEnter(decl);
        for (const member of decl.members) this.visitNode(member);
        this.onClassExit(decl);
        break;
      }
      case ASNodeKind.EnumDeclaration: {
        const decl = node as EnumDeclaration;
        for (const value of decl.values) this.visitNode(value);
        break;
      }
      case ASNodeKind.EnumValueDeclaration: {
        const decl = node as EnumValueDeclaration;
        if (decl.initializer) this.visitNode(decl.initializer);
        break;
      }
      case ASNodeKind.FieldDeclaration: {
        const decl = node as FieldDeclaration;
        if (decl.initializer) this.visitNode(decl.initializer);
        break;
      }
      case ASNodeKind.FunctionDeclaration: {
        const decl = node as FunctionDeclaration;
        const shouldRecurse = this.onFunctionDeclaration(decl);
        if (shouldRecurse && decl.body) this.visitNode(decl.body);
        break;
      }
      case ASNodeKind.InterfaceDeclaration: {
        const decl = node as InterfaceDeclaration;
        for (const member of decl.members) this.visitNode(member);
        break;
      }
      case ASNodeKind.MethodDeclaration: {
        const decl = node as MethodDeclaration;
        const shouldRecurse = this.onMethodDeclaration(decl);
        if (shouldRecurse && decl.body) this.visitNode(decl.body);
        break;
      }
      case ASNodeKind.NamespaceDeclaration: {
        const decl = node as NamespaceDeclaration;
        this.onNamespaceEnter(decl);
        for (const member of decl.members) this.visitNode(member);
        this.onNamespaceExit(decl);
        break;
      }
      case ASNodeKind.VariableDeclaration: {
        const decl = node as VariableDeclaration;
        const shouldRecurse = this.onVariableDeclaration(decl);
        if (shouldRecurse && decl.initializer) this.visitNode(decl.initializer);
        break;
      }

      // Special nodes - no action needed
      case ASNodeKind.ExportMember:
      case ASNodeKind.IndexSignature:
      case ASNodeKind.Comment:
      case ASNodeKind.Decorator:
        break;
    }
  }
}
