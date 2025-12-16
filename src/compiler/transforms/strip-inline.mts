/**
 * AssemblyScript Transform to strip @inline decorators
 *
 * Production code uses @inline decorators for performance. When functions are inlined,
 * coverage instrumentation can't track their execution. This transform removes @inline
 * decorators from the AST during test compilation, allowing coverage instrumentation
 * to properly track function calls.
 * 
 * - Hooks into the AssemblyScript compiler's `afterParse` lifecycle
 * - Walks through all parsed source files before compilation begins
 * - Uses shared ASTVisitor to recurse into ALL node types
 * - Strips @inline decorators from any node that has them in user code
 *
 * @see https://www.assemblyscript.org/compiler.html#transforms
 * @see https://github.com/AssemblyScript/assemblyscript/blob/main/src/ast.ts
 */

import { Node, Parser, Source, DecoratorNode } from 'assemblyscript';
import { Transform } from 'assemblyscript/transform';

import { ASTVisitor } from '../../util/ast-visitor.js';
import { ASSEMBLYSCRIPT_LIB_PREFIX, ASDecoratorKind, ASSourceKind } from '../../types/types.js';

/**
 * Visitor that strips @inline decorators from nodes
 */
class StripInlineVisitor extends ASTVisitor {
  /**
   * Strip @inline decorator from a node if present
   */
  protected beforeVisit(node: Node): void {
    if ('decorators' in node && node.decorators) {
      const filtered = (node.decorators as DecoratorNode[]).filter(
        (decorator: DecoratorNode) => decorator.decoratorKind !== ASDecoratorKind.Inline
      );
      node.decorators = filtered.length > 0 ? filtered : null;
    }
  }
}

/**
 * AssemblyScript compiler transform that strips @inline decorators
 */
class StripInlineTransform extends Transform {
  private visitor = new StripInlineVisitor();

  /**
   * Called after parsing is complete, before the program is initialized.
   * This is the ideal time to modify the AST.
   */
  afterParse(_parser: Parser): void {
    const sources = (this as Transform).program.sources;

    // Filter to user source files only
    const userSources = sources.filter((source: Source) =>
      (source.sourceKind === ASSourceKind.User || source.sourceKind === ASSourceKind.UserEntry)
      && !source.normalizedPath.startsWith(ASSEMBLYSCRIPT_LIB_PREFIX)
    );

    for (const source of userSources) {
      this.visitor.visitSource(source);
    }
  }
}

export default StripInlineTransform;
