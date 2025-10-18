/**
 * AssemblyScript Transform to wrap top-level test calls
 *
 * This transform automatically wraps top-level `test()` and `describe()` calls
 * in an exported `__run_tests()` function, solving AssemblyScript's compiler bugs
 * with top-level code initialization while maintaining clean developer experience.
 *
 * PROBLEM:
 * AssemblyScript has compiler bugs when using top-level code:
 * - Const-folding fails for complex expressions like `1 + 1 == 2`
 * - Dead code elimination removes globals that aren't directly used by exports
 * - Top-level initialization order is unreliable
 *
 * SOLUTION:
 * Transform top-level code via AST manipulation to create a wrapper function.
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
 * export function __run_tests(): void {
 *   test("my test", () => {
 *     assert(1 + 1 == 2);
 *   });
 * }
 * ```
 *
 * How this transform works:
 * - Hooks into `afterParse` lifecycle
 * - Only processes test files (*.as.test.ts, *.as.spec.ts)
 * - Manipulates the AST to wrap non-import statements in `export function __run_tests(): void { ... }`
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

// Debug flag - set to true to enable verbose logging
const DEBUG = false;

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
        this.wrapInRunTestsFunction(source);
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
   * Wrap the source code in an exported __run_tests() function
   * Uses AST manipulation for precise transformation with correct source maps
   */
  wrapInRunTestsFunction(source) {
    const statements = source.statements;

    // Debug logging
    if (DEBUG) {
      this.log('[Transform] Processing source:', source.normalizedPath);
      this.log('[Transform] Statement count:', statements.length);
    }

    // Separate import/export statements from code statements
    const topLevelStatements = [];
    const codeStatements = [];

    for (const stmt of statements) {
      const hasExportFlag = stmt.flags !== undefined && (stmt.flags & CommonFlags.Export) !== 0;
      const hasDeclareFlag = stmt.flags !== undefined && (stmt.flags & CommonFlags.Declare) !== 0;

      if (DEBUG) {
        this.log('[Transform] Statement kind:', stmt.kind, this.getKindName(stmt.kind),
                 'export?', hasExportFlag, 'declare?', hasDeclareFlag);
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

    if (DEBUG) {
      this.log('[Transform] Top-level statements:', topLevelStatements.length);
      this.log('[Transform] Code statements:', codeStatements.length);
    }

    // If there's no code to wrap, nothing to do
    if (codeStatements.length === 0) {
      if (DEBUG) this.log('[Transform] No code to wrap, skipping');
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

    // Create the function declaration: export function __run_tests(): void { ... }
    const wrapperFunction = Node.createFunctionDeclaration(
      Node.createIdentifierExpression('__run_tests', range),
      null,                   // no decorators
      CommonFlags.Export,     // export modifier
      null,                   // no type parameters
      signature,              // function signature
      body,                   // function body
      ArrowKind.None,         // regular function (not arrow)
      range
    );

    if (DEBUG) this.log('[Transform] Created wrapper function');

    // Replace source statements with top-level declarations followed by wrapper function
    source.statements = [
      ...topLevelStatements,
      wrapperFunction
    ];

    if (DEBUG) this.log('[Transform] Replaced statements, new count:', source.statements.length);
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
