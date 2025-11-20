/**
 * AST Parser for AssemblyScript Source Files
 *
 * Parses AS source files to extract function metadata for coverage.
 * Used by generateCoverage to build empty coverage map from all source files.
 *
 * Source AST is the source of truth for what SHOULD be covered.
 * Binary instrumentation tells us what we CAN measure (hit counts).
 */

import { readFileSync } from 'fs';
import { relative, parse as parsePath } from 'path';
import { Parser } from 'assemblyscript';
import type { RawSourceMap } from 'source-map';
import type { DebugInfo, FunctionInfo } from '../types.js';

// NodeKind enum values (from AS compiler)
// Defined locally to avoid isolatedModules const enum access issues
const NodeKind = {
  // Function expression (arrow functions): const foo = () => {}
  Function: 14,
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
 * Returns DebugInfo with all functions at count=0 (not executed yet).
 *
 * @param filePaths - Absolute paths to AS source files
 * @param projectRoot - Project root for building relative paths
 * @returns DebugInfo with function metadata
 */
export function parseFunctionsFromFiles(
  filePaths: string[],
  projectRoot: string
): DebugInfo {
  const qualifiedFunctionsByAbsoluteFilePath: Record<string, Record<string, FunctionInfo>> = {};
  const absoluteFilePathByQualifiedFunctionName: Record<string, string> = {};

  for (const filePath of filePaths) {
    const functions = parseFunctionsFromFile(filePath, projectRoot);

    if (Object.keys(functions).length > 0) {
      qualifiedFunctionsByAbsoluteFilePath[filePath] = functions;

      // Build reverse lookup
      for (const qualifiedName of Object.keys(functions)) {
        absoluteFilePathByQualifiedFunctionName[qualifiedName] = filePath;
      }
    }
  }

  return {
    qualifiedFunctionsByAbsoluteFilePath,
    absoluteFilePathByQualifiedFunctionName
  };
}

/**
 * Parse functions from a single AS source file
 *
 * @param filePath - Absolute path to AS source file
 * @param projectRoot - Project root for building relative paths
 * @returns Record of qualified name to FunctionInfo
 */
function parseFunctionsFromFile(
  filePath: string,
  projectRoot: string
): Record<string, FunctionInfo> {
  const source = readFileSync(filePath, 'utf8');
  const functions: Record<string, FunctionInfo> = {};

  // Build the module path (strip any extension, use forward slashes)
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
  const parsed = parsePath(relativePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const parser = new Parser();
  parser.parseFile(source, filePath, true);

  const src = parser.currentSource;
  if (!src) {
    return functions;
  }

  // Visit all top-level statements
  for (const stmt of src.statements) {
    visitNode(stmt, src, modulePath, functions);
  }

  return functions;
}

/**
 * Visit AST node and extract function declarations
 */
function visitNode(
  node: any,
  src: any,
  modulePath: string,
  functions: Record<string, FunctionInfo>
): void {
  // Handle function declarations
  if (node.kind === NodeKind.FunctionDeclaration) {
    // Skip functions without names (shouldn't happen for declarations)
    // v1 only, probably
    if (!node.name || !node.name.text) {
      return;
    }

    const shortName = node.name.text;
    const qualifiedName = `${modulePath}/${shortName}`;

    // Get position information (1-based for internal consistency)
    // Use name.range.start for start position to skip decorators
    // (node.range.start includes decorators, but name is on the actual function line)
    const startLine = src.lineAt(node.name.range.start);
    const startColumn = src.columnAt(node.name.range.start);
    const endLine = src.lineAt(node.range.end);
    const endColumn = src.columnAt(node.range.end);

    functions[qualifiedName] = {
      qualifiedName,
      shortName,
      startLine,
      endLine,
      startColumn,
      endColumn
    };
  }

  // Handle variable statements (may contain arrow functions)
  if (node.kind === NodeKind.Variable && node.declarations) {
    for (const decl of node.declarations) {
      // Check if this declaration has a function expression initializer
      if (decl.initializer && decl.initializer.kind === NodeKind.Function) {
        const shortName = decl.name.text;
        const qualifiedName = `${modulePath}/${shortName}`;

        // Use the declaration's range for the function
        const startLine = src.lineAt(decl.range.start);
        const startColumn = src.columnAt(decl.range.start);
        const endLine = src.lineAt(decl.range.end);
        const endColumn = src.columnAt(decl.range.end);

        functions[qualifiedName] = {
          qualifiedName,
          shortName,
          startLine,
          endLine,
          startColumn,
          endColumn
        };
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

        // Use name.range.start for start position to skip decorators
        // (member.range.start includes decorators, but name is on the actual method line)
        const startLine = src.lineAt(member.name.range.start);
        const startColumn = src.columnAt(member.name.range.start);
        const endLine = src.lineAt(member.range.end);
        const endColumn = src.columnAt(member.range.end);

        functions[qualifiedName] = {
          qualifiedName,
          shortName,
          startLine,
          endLine,
          startColumn,
          endColumn
        };
      }
    }
  }

  // Recurse into namespace members
  if (node.kind === NodeKind.NamespaceDeclaration && node.members) {
    for (const member of node.members) {
      visitNode(member, src, modulePath, functions);
    }
  }
}

/**
 * Parse functions from source map's embedded content
 *
 * Used in v2 onAfterSuiteRun for containment matching when we need
 * to parse sources that are embedded in the source map.
 *
 * @param sourceMap - Raw source map with sourcesContent
 * @param projectRoot - Project root for building relative paths
 * @returns DebugInfo with function metadata
 */
export function parseFunctionsFromSourceMap(
  sourceMap: RawSourceMap,
  projectRoot: string
): DebugInfo {
  const qualifiedFunctionsByAbsoluteFilePath: Record<string, Record<string, FunctionInfo>> = {};
  const absoluteFilePathByQualifiedFunctionName: Record<string, string> = {};

  if (!sourceMap.sourcesContent) {
    return {
      qualifiedFunctionsByAbsoluteFilePath,
      absoluteFilePathByQualifiedFunctionName
    };
  }

  for (let i = 0; i < sourceMap.sources.length; i++) {
    const sourcePath = sourceMap.sources[i];
    const content = sourceMap.sourcesContent[i];

    // Skip sources without content, undefined paths, or ~lib/ sources (runtime)
    if (!content || !sourcePath || sourcePath.startsWith('~lib/')) {
      continue;
    }

    const functions = parseFunctionsFromContent(content, sourcePath, projectRoot);

    if (Object.keys(functions).length > 0) {
      qualifiedFunctionsByAbsoluteFilePath[sourcePath] = functions;

      for (const qualifiedName of Object.keys(functions)) {
        absoluteFilePathByQualifiedFunctionName[qualifiedName] = sourcePath;
      }
    }
  }

  return {
    qualifiedFunctionsByAbsoluteFilePath,
    absoluteFilePathByQualifiedFunctionName
  };
}

/**
 * Parse functions from source content string
 *
 * @param content - Source file content
 * @param sourcePath - Path to use for qualified names
 * @param projectRoot - Project root for building relative paths
 * @returns Record of qualified name to FunctionInfo
 */
function parseFunctionsFromContent(
  content: string,
  sourcePath: string,
  projectRoot: string
): Record<string, FunctionInfo> {
  const functions: Record<string, FunctionInfo> = {};

  // Build the module path (strip any extension, use forward slashes)
  const relativePath = relative(projectRoot, sourcePath).replace(/\\/g, '/');
  const parsed = parsePath(relativePath);
  const modulePath = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Parse with AssemblyScript parser
  const parser = new Parser();
  parser.parseFile(content, sourcePath, true);

  const src = parser.currentSource;
  if (!src) {
    return functions;
  }

  // Visit all top-level statements
  for (const stmt of src.statements) {
    visitNode(stmt, src, modulePath, functions);
  }

  return functions;
}
