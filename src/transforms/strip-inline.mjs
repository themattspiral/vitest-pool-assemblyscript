/**
 * AssemblyScript Transform to strip @inline decorators
 *
 * This transform removes @inline decorators from the AST during test compilation,
 * allowing coverage instrumentation to properly track function calls.
 *
 * Production code uses @inline decorators for performance. When functions are inlined,
 * coverage instrumentation can't track their execution.
 *
 * How this transform works:
 * - Hooks into the AssemblyScript compiler's `afterParse` lifecycle
 * - Walks through all parsed source files before compilation begins
 * - Processes any statement that has decorators (kind-agnostic)
 * - Filters out DecoratorNode entries where decoratorKind === DecoratorKind.Inline
 * - Sets decorators to null if no decorators remain after filtering
 *
 * USAGE:
 * Add to AssemblyScript compiler flags:
 *   --transform ./src/transforms/strip-inline.mjs
 *
 * @see https://www.assemblyscript.org/compiler.html#transforms
 * @see https://github.com/AssemblyScript/assemblyscript/blob/main/src/ast.ts
 */

import { DecoratorKind, SourceKind, Statement, NodeKind } from "assemblyscript";
import { Transform } from "assemblyscript/transform";

class StripInlineTransform extends Transform {
  /**
   * Called after parsing is complete, before the program is initialized.
   * This is the ideal time to modify the AST.
   */
  afterParse(parser) {
    // Walk through all source files in the program
    const sources = this.program.sources;

    // Filter to user source files only (exclude ASC stdlib, etc)
    const userSources = sources.filter(source =>
      ( source.sourceKind === SourceKind.User || source.sourceKind === SourceKind.UserEntry )
      && !source.normalizedPath.startsWith('~lib/')
    );

    userSources.forEach(source => {
      this.visitStatements(source.statements);
    });
  }

  /**
   * Visit all top-level statements in a source file and strip @inline decorators.
   *
   * @param {Statement[]} statements - Array of top-level AST statement nodes
   */
  visitStatements(statements) {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Process any statement that has decorators
      if (stmt.decorators) {
        const beforeCount = stmt.decorators.length;

        // Filter out @inline decorators, keeping others
        const filteredDecorators = stmt.decorators.filter(
          decorator => decorator.decoratorKind !== DecoratorKind.Inline
        );

        // Update the statement's decorators
        stmt.decorators = filteredDecorators.length > 0 ? filteredDecorators : null;

        // const afterCount = filteredDecorators.length;
        // if (beforeCount !== afterCount) {
        //   // Get statement details for debugging
        //   const stmtName = stmt.name?.text || stmt.symbol?.name || '<anonymous>';
        //   // const stmtKind = stmt.constructor.name;
        //   const stmtKind = Object.keys(NodeKind).find(key => NodeKind[key] === stmt.kind) || String(stmt.kind);
        //   const stmtRange = stmt.range ? `${stmt.range.source.normalizedPath} chars: ${stmt.range.start}-${stmt.range.end}` : 'unknown';
          
        //   console.log('[StripInline] Removed @inline from', stmtKind, stmtName, 'at', stmtRange);
        // }
      }
    }
  }
}

export default StripInlineTransform;
