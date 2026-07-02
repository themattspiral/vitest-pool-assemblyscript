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
  NamespaceDeclaration,
  VariableDeclaration,
  VariableStatement,
  FunctionExpression,
  IfStatement,
  TernaryExpression,
  BinaryExpression,
  SwitchStatement,
  Statement,
} from 'assemblyscript';

import type { ParsedSourceFunctionInfo, ParsedSourceFunctions, ParsedSourceStatementInfo, ParsedSourceBranchInfo, SourceRange } from '../types/types.js';
import { ASCommonFlags, ASNodeKind, ASToken } from '../types/constants.js';
import { ASTVisitor } from '../util/ast-visitor.js';

/**
 * Whether a switch case's statement list unconditionally transfers control out of
 * the case — so control does NOT fall through into the next clause. True when the
 * last statement is a break/return/throw/continue, looking through a single trailing
 * block (`case X: { …; break; }`).
 *
 * A CONDITIONAL break (`if (cond) break;`) is intentionally NOT recognized as
 * terminating: control may still reach the next clause, so the case is treated as
 * fall-through. This is a documented best-effort residual — for the few entries that
 * conditionally break out, the implicit-default derivation is off by that runtime
 * count (see computeBranchPathHits).
 */
function caseUnconditionallyTerminates(statements: Statement[]): boolean {
  if (statements.length === 0) {
    return false;
  }
  const last = statements[statements.length - 1]!;
  switch (last.kind) {
    case ASNodeKind.Break:
    case ASNodeKind.Return:
    case ASNodeKind.Throw:
    case ASNodeKind.Continue:
      return true;
    case ASNodeKind.Block:
      return caseUnconditionallyTerminates((last as BlockStatement).statements);
    default:
      return false;
  }
}

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

  /** Accumulated function records, keyed by all lines the function spans for fast lookup */
  readonly functionsByLineSpan: Record<number, ParsedSourceFunctionInfo[]> = {};
  /** Accumulated unique function records, keyed by the function id */
  readonly uniqueFunctions: Record<string, ParsedSourceFunctionInfo> = {};
  /** Accumulated coverable statements, in source order */
  readonly statements: ParsedSourceStatementInfo[] = [];
  /** Accumulated branch constructs, in source order */
  readonly branches: ParsedSourceBranchInfo[] = [];
  
  /** Namespace context stack (supports nested namespaces) */
  private namespaceStack: string[] = [];
  /** Current class name (when inside a class) */
  private currentClassName: string | null = null;

  constructor(source: Source, modulePath: string, filePath: string) {
    super();
    this.source = source;
    this.modulePath = modulePath;
    this.filePath = filePath;
  }

  /**
   * Track namespace context when entering a namespace.
   * Supports nesting — push onto the stack.
   */
  protected onNamespaceEnter(node: NamespaceDeclaration): void {
    this.namespaceStack.push(node.name?.text ?? 'Anonymous');
  }

  /**
   * Restore namespace context when exiting a namespace.
   */
  protected onNamespaceExit(_node: NamespaceDeclaration): void {
    this.namespaceStack.pop();
  }

  /**
   * Track class context when entering a class.
   * Includes namespace prefix when inside a namespace, matching binary naming convention
   * (e.g. "NS_A.Item" for class Item inside namespace NS_A).
   */
  protected onClassEnter(node: ClassDeclaration): void {
    const className = node.name?.text ?? 'Anonymous';
    if (this.namespaceStack.length > 0) {
      this.currentClassName = `${this.namespaceStack.join('.')}.${className}`;
    } else {
      this.currentClassName = className;
    }
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
      const funcName = node.name?.text ?? '~anonymous';
      const shortName = this.namespaceStack.length > 0
        ? `${this.namespaceStack.join('.')}.${funcName}`
        : funcName;
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
        const range = this.buildRange(node, null);

        this.addFunction(qualifiedName, shortName, range);
      }

      // Visit the body through visitFunctionBody so function-nesting depth stays
      // accurate (its statements are inside a function, not module scope).
      if (funcDecl.body) {
        this.visitFunctionBody(funcDecl.body);
      }
      return false; // Don't recurse again - we handled it
    }
    return true; // Continue recursion for non-function initializers
  }

  /**
   * Extract coverable statements (Istanbul statement granularity). Variable
   * statements are recorded per declarator that has an initializer; every other
   * statement kind is recorded by its full range. The entry-position (the spot a
   * statement's hit count is read at) is determined later during matching,
   * where it can be pinned against the real instrumented hit positions.
   */
  protected onStatement(node: Node): void {
    if (node.kind === ASNodeKind.Variable) {
      // A module-scope variable declaration that runs UNCONDITIONALLY at module
      // instantiation — not inside any function (functionDepth) and not inside any
      // block (blockDepth), so it is a direct statement of the module or a namespace
      // body. (A const/let placed conditionally is always wrapped in a block, so it
      // is excluded.) Flag it so the provider can credit its coverage when the file
      // loaded but the declaration folded to a WASM global with no runtime counter
      // (see the hybrid provider's synthesis).
      const isModuleLevelDeclaration = this.functionDepth === 0 && this.blockDepth === 0;
      const varStmt = node as VariableStatement;
      for (const decl of varStmt.declarations) {
        if (decl.initializer) {
          this.statements.push({ range: this.buildRange(decl, null), isModuleLevelDeclaration });
        }
      }
      return;
    }

    this.statements.push({ range: this.buildRange(node, null) });
  }

  /**
   * Extract branch constructs (Istanbul branch granularity). For each construct:
   * the whole-construct range (Istanbul branch location), the condition range
   * (the decision-matching target), and per-arm ranges. An `if` without `else`
   * gets an implicit second arm (Istanbul convention: the construct range).
   * Logical &&/|| are binary-expr branches whose two arms are the operands.
   * Switch arms are the case clauses (+ an implicit default when none is present).
   */
  protected onBranch(node: Node): void {
    if (node.kind === ASNodeKind.If) {
      const ifNode = node as IfStatement;
      const range = this.buildRange(ifNode, null);
      const paths: SourceRange[] = [this.buildRange(ifNode.ifTrue, null)];
      const implicitPathIndices: number[] = [];

      if (ifNode.ifFalse) {
        paths.push(this.buildRange(ifNode.ifFalse, null));
      } else {
        paths.push(range); // implicit else — Istanbul uses the construct range
        implicitPathIndices.push(1);
      }

      this.branches.push({
        range,
        branchType: 'if',
        conditionRange: this.buildRange(ifNode.condition, null),
        paths,
        implicitPathIndices,
        emptyCasePathIndices: [],
        fallThroughCasePathIndices: [],
      });
    } else if (node.kind === ASNodeKind.Ternary) {
      const ternary = node as TernaryExpression;
      this.branches.push({
        range: this.buildRange(ternary, null),
        branchType: 'cond-expr',
        conditionRange: this.buildRange(ternary.condition, null),
        paths: [this.buildRange(ternary.ifThen, null), this.buildRange(ternary.ifElse, null)],
        implicitPathIndices: [],
        emptyCasePathIndices: [],
        fallThroughCasePathIndices: [],
      });
    } else if (node.kind === ASNodeKind.Binary) {
      // Only logical operators (&& / ||) are branches (binary-expr); arithmetic
      // and comparison binaries are not. The two operands are the two arms; the
      // short-circuit decision happens on the left operand.
      const binary = node as BinaryExpression;
      if (binary.operator === ASToken.Ampersand_Ampersand || binary.operator === ASToken.Bar_Bar) {
        this.branches.push({
          range: this.buildRange(binary, null),
          branchType: 'binary-expr',
          conditionRange: this.buildRange(binary.left, null),
          paths: [this.buildRange(binary.left, null), this.buildRange(binary.right, null)],
          implicitPathIndices: [],
          emptyCasePathIndices: [],
          fallThroughCasePathIndices: [],
        });
      }
    } else if (node.kind === ASNodeKind.Switch) {
      const sw = node as SwitchStatement;
      const range = this.buildRange(sw, null);
      const paths: SourceRange[] = [];
      const implicitPathIndices: number[] = [];
      const emptyCasePathIndices: number[] = [];
      const fallThroughCasePathIndices: number[] = [];
      let hasDefault = false;

      // Each case/default clause is an arm. Switch lowers to a comparison chain.
      // A BODY-bearing case (incl. the explicit default) carries its entered count
      // on its body block, read later via statement-entry over the case's BODY
      // span — so its path range starts at the first statement, excluding the
      // `case X:` label whose position otherwise holds the comparison block's
      // (wrong) count. An EMPTY fall-through case (zero statements) has no body;
      // its entered count lives on a post-anchored block surfaced in emptyCaseHits
      // (keyed by the case-label position), so its path range is the clause range
      // (the `case X:` span) and its index is recorded in emptyCasePathIndices for
      // the matcher to read from emptyCaseHits instead of statement-entry.
      //
      // A case that falls through into a FOLLOWING clause (an empty case, or a body
      // case with no terminating break/return/throw/continue) is recorded in
      // fallThroughCasePathIndices: its matches are already folded into the entered
      // count of the terminal case it flows into, so it is excluded from the
      // "distinct matches" total used to derive a default-less switch's implicit
      // default arm (see computeBranchPathHits).
      for (let caseIndex = 0; caseIndex < sw.cases.length; caseIndex++) {
        const switchCase = sw.cases[caseIndex]!;
        const statements = switchCase.statements;
        if (statements.length > 0) {
          paths.push(this.buildRange(statements[statements.length - 1]!, statements[0]!));
        } else {
          paths.push(this.buildRange(switchCase, null));
          emptyCasePathIndices.push(paths.length - 1);
        }
        if (!switchCase.label) {
          hasDefault = true; // the default clause has no case label
        }
        const hasFollowingClause = caseIndex < sw.cases.length - 1;
        if (hasFollowingClause && !caseUnconditionallyTerminates(statements)) {
          fallThroughCasePathIndices.push(paths.length - 1);
        }
      }
      if (!hasDefault) {
        paths.push(range); // implicit default — Istanbul uses the construct range
        implicitPathIndices.push(paths.length - 1);
      }

      this.branches.push({
        range,
        branchType: 'switch',
        conditionRange: this.buildRange(sw.condition, null),
        paths,
        implicitPathIndices,
        emptyCasePathIndices,
        fallThroughCasePathIndices,
      });
    }
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
   * Add a function to the functions record
   */
  private addFunction(qualifiedName: string, shortName: string, range: SourceRange): void {
    const func: ParsedSourceFunctionInfo = {
      qualifiedName,
      shortName,
      range,
      id: `${range.startLine}:${range.startColumn}`
    };
    
    // the function record is duplicated across all lines that
    // it spans for fast lookup in hit position containment matching
    for (let line = range.startLine; line <= range.endLine; line++) {
      if (!this.functionsByLineSpan[line]) {
        this.functionsByLineSpan[line] = [];
      }

      this.functionsByLineSpan[line]!.push(func);
    }

    // also track uniquely to be used as source of truth in coverage generation
    this.uniqueFunctions[func.id] = func;
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
): Promise<ParsedSourceFunctions> {
  const sourceCode = await readFile(absoluteSourceFilePath, 'utf8');
  return parseSource(sourceCode, relativeSourceFilePath, absoluteSourceFilePath);
}

/**
 * Parse coverage info from AS source code (string). Separated from file I/O so it
 * can be unit-tested directly without touching the filesystem.
 *
 * @param sourceCode - AS source text
 * @param relativeSourceFilePath - Relative path (used for the module path + parser)
 * @param absoluteSourceFilePath - Absolute path (stored on each range's filePath)
 */
export function parseSource(
  sourceCode: string,
  relativeSourceFilePath: string,
  absoluteSourceFilePath: string,
): ParsedSourceFunctions {
  // Build the module path (strip any extension, use forward slashes)
  const parsed = parsePath(relativeSourceFilePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const asParser = new AssemblyScriptParser();
  asParser.parseFile(sourceCode, relativeSourceFilePath, true);

  const source = asParser.currentSource;
  if (!source) {
    return { functionsByLineSpan: {}, uniqueFunctions: {}, statements: [], branches: [] };
  }

  // Create visitor and traverse
  const visitor = new FunctionExtractorVisitor(source, modulePath, absoluteSourceFilePath);
  visitor.visitSource(source);

  return {
    functionsByLineSpan: visitor.functionsByLineSpan,
    uniqueFunctions: visitor.uniqueFunctions,
    statements: visitor.statements,
    branches: visitor.branches,
  };
}
