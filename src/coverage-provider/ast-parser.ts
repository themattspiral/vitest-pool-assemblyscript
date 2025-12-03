/**
 * AST Parser for AssemblyScript Source Files
 *
 * Parses AS source files to extract function metadata for coverage.
 * Used by generateCoverage to build empty coverage map from all source files.
 *
 * Source AST is the source of truth for what SHOULD be covered.
 * Binary instrumentation tells us what we CAN measure (hit counts).
 *
 * Functions are keyed by first-expression position (line:column of first statement
 * in the function body), which matches BinaryDebugInfo's representativeLocation
 * for direct position-based lookup.
 */

import { readFileSync } from 'fs';
import { relative, parse as parsePath } from 'node:path';
import { Parser, Source, BlockStatement } from 'assemblyscript';
import type { ParsedSourceInfo, ParsedSourceFunctionInfo, SourceRange } from '../types.js';

// NodeKind enum values (from AS compiler)
// Defined locally to avoid isolatedModules const enum access issues
const NodeKind = {
  // Binary expression (includes assignments): a = b
  BinaryExpression: 8,
  // Function expression (arrow functions): const foo = () => {}
  Function: 14,
  // Property access expression: this.property
  PropertyAccessExpression: 21,
  // Expression statement: expr;
  ExpressionStatement: 38,
  // Variable statement containing declarations: const a = 1, b = () => {}
  Variable: 47,
  // Class declaration to recurse and find methods
  ClassDeclaration: 51,
  // Top-level function: export function add() {}
  FunctionDeclaration: 55,
  // Class method (also covers constructors, getters, setters)
  MethodDeclaration: 58,
  // Namespace to recurse: namespace Math { export function abs() {} }
  NamespaceDeclaration: 59,
  // Individual variable declaration within a Variable statement: const a = 1, b = () => {}
  VariableDeclaration: 61,
} as const;

// CommonFlags bit flags (from AS compiler)
// Defined locally to avoid isolatedModules const enum access issues
const CommonFlags = {
  // Has a `static` modifier
  Static: 32,
  // Has a `get` modifier
  Get: 2048,
  // Has a `set` modifier
  Set: 4096,
} as const;

/**
 * Parse functions from AS source files
 *
 * Used in generateCoverage to build empty coverage map from coverage.include.
 * Returns ParsedSourceInfo with functions keyed by first-expression position.
 *
 * @param filePaths - Absolute paths to AS source files
 * @param projectRoot - Project root for building relative paths
 * @returns ParsedSourceInfo with function metadata keyed by position
 */
export function parseFunctionsFromFiles(
  filePaths: string[],
  projectRoot: string
): ParsedSourceInfo {
  const functionsByFileAndPosition: Record<string, Record<string, ParsedSourceFunctionInfo>> = {};

  for (const filePath of filePaths) {
    const functions = parseFunctionsFromFile(filePath, projectRoot);

    if (Object.keys(functions).length > 0) {
      functionsByFileAndPosition[filePath] = functions;
    }
  }

  return {
    functionsByFileAndPosition,
    // v2 only - not implemented yet
    statementsByFileAndPosition: {},
    branchesByFileAndPosition: {}
  };
}

/**
 * Parse functions from a single AS source file
 *
 * @param filePath - Absolute path to AS source file
 * @param projectRoot - Project root for building relative paths
 * @returns Record of position key to ParsedSourceFunctionInfo
 */
function parseFunctionsFromFile(
  filePath: string,
  projectRoot: string
): Record<string, ParsedSourceFunctionInfo> {
  const source = readFileSync(filePath, 'utf8');
  const functions: Record<string, ParsedSourceFunctionInfo> = {};

  // Build the module path (strip any extension, use forward slashes)
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
  const parsed = parsePath(relativePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const parser = new Parser();
  parser.parseFile(source, relativePath, true);

  const src = parser.currentSource;
  if (!src) {
    return functions;
  }

  // Visit all top-level statements
  for (const stmt of src.statements) {
    visitNode(stmt, src, modulePath, filePath, functions);
  }

  return functions;
}

/**
 * Get the position of the first statement in a function body
 *
 * This position is used as the key for position-based matching with
 * BinaryDebugInfo's representativeLocation.
 */
function getFirstExpressionPosition(
  body: BlockStatement | null,
  src: Source
): { line: number; column: number } | undefined {
  if (!body || body.statements.length === 0) {
    return undefined;
  }

  const firstStmt = body.statements[0];
  if (!firstStmt) {
    return undefined;
  }

  return {
    line: src.lineAt(firstStmt.range.start),
    column: src.columnAt()
  };
}

/**
 * Add a function to the functions record, keyed by first-expression position
 */
function addFunction(
  functions: Record<string, ParsedSourceFunctionInfo>,
  qualifiedName: string,
  shortName: string,
  range: SourceRange,
  firstExprPos: { line: number; column: number }
): void {
  const positionKey = `${firstExprPos.line}:${firstExprPos.column}`;
  functions[positionKey] = {
    qualifiedName,
    shortName,
    range
  };
}

/**
 * Visit AST node and extract function declarations
 */
function visitNode(
  node: any,
  src: any,
  modulePath: string,
  filePath: string,
  functions: Record<string, ParsedSourceFunctionInfo>
): void {
  // Handle function declarations
  if (node.kind === NodeKind.FunctionDeclaration) {
    // Skip functions without names (shouldn't happen for declarations)
    if (!node.name || !node.name.text) {
      return;
    }

    const shortName = node.name.text;
    const qualifiedName = `${modulePath}/${shortName}`;

    // Get first expression position for keying
    const firstExprPos = getFirstExpressionPosition(node.body, src);
    if (!firstExprPos) {
      // Skip functions with empty bodies (no statements)
      return;
    }

    // Build range for the function (using name.range.start to skip decorators)
    const range: SourceRange = {
      filePath,
      startLine: src.lineAt(node.name.range.start),
      startColumn: src.columnAt(node.name.range.start),
      endLine: src.lineAt(node.range.end),
      endColumn: src.columnAt(node.range.end)
    };

    addFunction(functions, qualifiedName, shortName, range, firstExprPos);
  }

  // Handle variable statements (may contain arrow functions)
  if (node.kind === NodeKind.Variable && node.declarations) {
    for (const decl of node.declarations) {
      // Check if this declaration has a function expression initializer
      if (decl.initializer && decl.initializer.kind === NodeKind.Function) {
        const shortName = decl.name.text;
        const qualifiedName = `${modulePath}/${shortName}`;

        // Get first expression position for keying
        const firstExprPos = getFirstExpressionPosition(decl.initializer.body, src);
        if (!firstExprPos) {
          // Skip functions with empty bodies
          continue;
        }

        // Use the declaration's range for the function
        const range: SourceRange = {
          filePath,
          startLine: src.lineAt(decl.range.start),
          startColumn: src.columnAt(decl.range.start),
          endLine: src.lineAt(decl.range.end),
          endColumn: src.columnAt(decl.range.end)
        };

        addFunction(functions, qualifiedName, shortName, range, firstExprPos);
      }
    }
  }

  // Recurse into class members
  if (node.kind === NodeKind.ClassDeclaration && node.members) {
    const className = node.name?.text || 'Anonymous';

    for (const member of node.members) {
      // Handle methods (also covers constructors, getters, setters)
      if (member.kind === NodeKind.MethodDeclaration && member.name && member.name.text) {
        const methodName = member.name.text;
        const flags = member.flags || 0;

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

        const qualifiedName = `${modulePath}/${shortName}`;

        // Get first expression position for keying
        const firstExprPos = getFirstExpressionPosition(member.body, src);
        if (!firstExprPos) {
          // Skip methods with empty bodies
          continue;
        }

        // Use name.range.start for start position to skip decorators
        const range: SourceRange = {
          filePath,
          startLine: src.lineAt(member.name.range.start),
          startColumn: src.columnAt(member.name.range.start),
          endLine: src.lineAt(member.range.end),
          endColumn: src.columnAt(member.range.end)
        };

        addFunction(functions, qualifiedName, shortName, range, firstExprPos);

        // Look for arrow function assignments inside the method body: this.prop = () => {}
        // This pattern is used when AS doesn't support property initializer syntax
        if (member.body && member.body.statements) {
          for (const bodyStmt of member.body.statements) {
            // Check for expression statement containing assignment
            if (bodyStmt.kind === NodeKind.ExpressionStatement && bodyStmt.expression) {
              const expr = bodyStmt.expression;

              // Check for binary expression (assignment) with property access on left and function on right
              if (expr.kind === NodeKind.BinaryExpression &&
                  expr.left?.kind === NodeKind.PropertyAccessExpression &&
                  expr.right?.kind === NodeKind.Function) {

                const propertyName = expr.left.property?.text;
                if (propertyName) {
                  // Build name: ClassName#propertyName (same as instance method)
                  const arrowShortName = `${className}#${propertyName}`;
                  const arrowQualifiedName = `${modulePath}/${arrowShortName}`;

                  // Get first expression position for keying
                  const arrowFirstExprPos = getFirstExpressionPosition(expr.right.body, src);
                  if (!arrowFirstExprPos) {
                    continue;
                  }

                  // Use the function expression's range for position
                  const arrowRange: SourceRange = {
                    filePath,
                    startLine: src.lineAt(expr.right.range.start),
                    startColumn: src.columnAt(expr.right.range.start),
                    endLine: src.lineAt(expr.right.range.end),
                    endColumn: src.columnAt(expr.right.range.end)
                  };

                  addFunction(functions, arrowQualifiedName, arrowShortName, arrowRange, arrowFirstExprPos);
                }
              }
            }
          }
        }
      }
    }
  }

  // Recurse into namespace members
  if (node.kind === NodeKind.NamespaceDeclaration && node.members) {
    for (const member of node.members) {
      visitNode(member, src, modulePath, filePath, functions);
    }
  }
}
