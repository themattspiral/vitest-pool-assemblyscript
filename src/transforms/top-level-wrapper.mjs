/**
 * AssemblyScript Transform to wrap top-level test calls
 *
 * This transform automatically wraps top-level `test()` and `describe()` calls
 * in an exported `__register_tests()` function, solving AssemblyScript's tree-shaking
 * and top-level code initialization issues.
 *
 * PROBLEM:
 * AssemblyScript's aggressive tree-shaking and compiler limitations:
 * - Dead code elimination removes framework functions (__get_test_count, etc.) as "unused"
 * - Const-folding can fail for complex expressions like `1 + 1 == 2` at top-level
 * - Top-level initialization order is unreliable
 *
 * SOLUTION:
 * Transform top-level code via AST manipulation:
 * 1. Wrap test() calls in exported __register_tests() function
 * 2. Re-export framework query functions to prevent tree-shaking
 *
 * INPUT (what developers write):
 * ```typescript
 * test("my test", () => {
 *   assert(1 + 1 == 2);
 * });
 * ```
 *
 * OUTPUT (what gets compiled):
 * ```typescript
 * export function __register_tests(): void {
 *   test("my test", () => {
 *     assert(1 + 1 == 2);
 *   });
 * }
 * ```
 *
 * NOTE: __register_tests() calls test(), which REGISTERS tests (adds to registry).
 * It does NOT execute the test bodies - that happens later via __run_test(index).
 *
 * KNOWN ISSUE - Compiler Crashes:
 * ⚠️ Wrapping code in functions can trigger AS compiler bugs with certain variable
 * reassignment patterns. Example: loop variable reassignment causes "assertion failed"
 * crash in compileStatement(). This is an upstream AS bug (not fixed in 0.28.9).
 *
 * How this transform works:
 * - Hooks into `afterParse` lifecycle
 * - Only processes test files (*.as.test.ts, *.as.spec.ts)
 * - Manipulates the AST to wrap non-import statements in `export function __register_tests(): void { ... }`
 * - Re-exports framework functions to prevent tree-shaking
 * - Preserves exact source ranges for perfect source maps
 *
 * USAGE:
 * Add to AssemblyScript compiler flags:
 *   --transform ./src/transforms/top-level-wrapper.mjs
 *
 * @see https://www.assemblyscript.org/compiler.html#transforms
 */

import { Transform } from "assemblyscript/transform";
import { Node, NodeKind, CommonFlags, ArrowKind } from "assemblyscript/dist/assemblyscript.js";
import { debug, isDebugEnabled } from "../utils/debug.mjs";

class TopLevelWrapperTransform extends Transform {
  /**
   * Called after parsing is complete.
   * We manipulate the AST to wrap top-level code in a function.
   */
  afterParse(parser) {
    // Walk through all source files
    const sources = this.program.sources;
    sources.forEach(source => {
      // Only process test files (*.as.test.ts or *.as.spec.ts)
      if (this.isTestFile(source)) {
        this.wrapInRegisterTestsFunction(source);
      }
    });
  }

  /**
   * Check if a source file is a test file
   */
  isTestFile(source) {
    const path = source.normalizedPath;
    return (
      (path.endsWith('.as.test.ts') || path.endsWith('.as.spec.ts')) &&
      !path.startsWith('~lib/') // Don't process library files
    );
  }

  /**
   * Wrap the source code in an exported __register_tests() function
   * Uses AST manipulation for precise transformation with correct source maps
   *
   * CRITICAL FIX: Also inject re-exports for framework query functions to prevent tree-shaking
   */
  wrapInRegisterTestsFunction(source) {
    const statements = source.statements;

    // Debug logging
    debug('[ASC TopLevelWrapper] Processing source:', source.normalizedPath);
    debug('[ASC TopLevelWrapper] Statement count:', statements.length);

    // Separate import/export statements from code statements
    const topLevelStatements = [];
    const codeStatements = [];
    let frameworkImportSource = null;

    for (const stmt of statements) {
      const hasExportFlag = stmt.flags !== undefined && (stmt.flags & CommonFlags.Export) !== 0;
      const hasDeclareFlag = stmt.flags !== undefined && (stmt.flags & CommonFlags.Declare) !== 0;

      debug('[ASC TopLevelWrapper] Statement kind:', stmt.kind, this.getKindName(stmt.kind),
            'export?', hasExportFlag, 'declare?', hasDeclareFlag);

      // Track framework imports to find the source module path
      if (stmt.kind === NodeKind.Import) {
        // ImportStatement has 'declarations' array and 'path' property
        // Check if this is importing from the framework
        if (stmt.path && stmt.path.value) {
          const importPath = stmt.path.value;
          // Look for framework import (includes 'framework' or 'assembly')
          if (importPath.includes('framework') || importPath.includes('assembly')) {
            frameworkImportSource = importPath;
            debug('[ASC TopLevelWrapper] Found framework import:', importPath);
          }
        }
      }

      // Keep imports, exports, and declares at the top level
      // This includes:
      // - Import statements (NodeKind.Import)
      // - Export statements (NodeKind.Export, NodeKind.ExportImport, NodeKind.ExportDefault)
      // - Declarations with Export flag (e.g., export function, export class)
      // - Declarations with Declare flag (e.g., declare function for @external)
      if (stmt.kind === NodeKind.Import ||
          stmt.kind === NodeKind.Export ||
          stmt.kind === NodeKind.ExportImport ||
          stmt.kind === NodeKind.ExportDefault ||
          hasExportFlag ||
          hasDeclareFlag) {
        topLevelStatements.push(stmt);
      } else {
        codeStatements.push(stmt);
      }
    }

    debug('[ASC TopLevelWrapper] Top-level statements:', topLevelStatements.length);
    debug('[ASC TopLevelWrapper] Code statements:', codeStatements.length);
    debug('[ASC TopLevelWrapper] Framework import source:', frameworkImportSource);

    // If there's no code to wrap, nothing to do
    if (codeStatements.length === 0) {
      debug('[ASC TopLevelWrapper] No code to wrap, skipping');
      return;
    }

    // Get a range for the wrapper function (use the first code statement's range)
    const range = codeStatements[0].range;

    // Create the function signature: () => void
    const voidType = Node.createNamedType(
      Node.createSimpleTypeName('void', range),
      null,  // no type arguments
      false, // not nullable
      range
    );

    const signature = Node.createFunctionType(
      [],        // no parameters
      voidType,  // return type
      null,      // no explicit this type
      false,     // not nullable
      range
    );

    // Create the function body (block containing all code statements)
    const body = Node.createBlockStatement(codeStatements, range);

    // Create the function declaration: export function __register_tests(): void { ... }
    const wrapperFunction = Node.createFunctionDeclaration(
      Node.createIdentifierExpression('__register_tests', range),
      null,                   // no decorators
      CommonFlags.Export,     // export modifier
      null,                   // no type parameters
      signature,              // function signature
      body,                   // function body
      ArrowKind.None,         // regular function (not arrow)
      range
    );

    debug('[ASC TopLevelWrapper] Created wrapper function');

    // TREE-SHAKING FIX: Re-export framework query functions
    // This prevents the compiler from tree-shaking them away
    const reExportStatements = [];
    if (frameworkImportSource) {
      const queryFunctions = [
        '__get_test_count',
        '__get_test_name',
        '__run_test',
        '__run_all_tests',
      ];

      for (const fnName of queryFunctions) {
        // Create export member: __get_test_count (local and exported names are the same)
        const exportMember = Node.createExportMember(
          Node.createIdentifierExpression(fnName, range),  // local name
          null,  // exported name (null means same as local name)
          range
        );

        // Create: export { __get_test_count } from '../src/framework';
        const reExport = Node.createExportStatement(
          [exportMember],  // export members array
          Node.createStringLiteralExpression(frameworkImportSource, range),  // from path
          false,  // isDeclare (not a declare export)
          range
        );
        reExportStatements.push(reExport);
        debug('[ASC TopLevelWrapper] Added re-export for:', fnName);
      }
    } else {
      debug('[ASC TopLevelWrapper] WARNING: No framework import found, skipping re-exports');
    }

    // Replace source statements with:
    // 1. Original top-level imports/exports
    // 2. Re-export statements for query functions (prevents tree-shaking)
    // 3. Wrapper function
    source.statements = [
      ...topLevelStatements,
      ...reExportStatements,
      wrapperFunction
    ];

    debug('[ASC TopLevelWrapper] Replaced statements, new count:', source.statements.length);
  }

  /**
   * Helper to get readable NodeKind name for debugging
   */
  getKindName(kind) {
    const kindNames = {
      [NodeKind.Source]: 'Source',
      [NodeKind.Import]: 'Import',
      [NodeKind.Export]: 'Export',
      [NodeKind.ExportDefault]: 'ExportDefault',
      [NodeKind.ExportImport]: 'ExportImport',
      [NodeKind.Expression]: 'Expression',
      [NodeKind.Block]: 'Block',
      [NodeKind.Variable]: 'Variable',
      [NodeKind.FunctionDeclaration]: 'FunctionDeclaration',
      [NodeKind.ClassDeclaration]: 'ClassDeclaration',
    };
    return kindNames[kind] || `Unknown(${kind})`;
  }
}

export default TopLevelWrapperTransform;
