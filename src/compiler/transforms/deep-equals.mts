/**
 * AssemblyScript Compiler Transform: Deep Equality & Stringification for User-Defined Objects
 *
 * Injects three methods into user-defined classes at `afterParse`:
 *
 * 1. `__vitest_assemblyscript_deep_equals` — deep equality comparison for `toEqual()`
 *    - If the class defines `@operator("==")`: delegates to `this == other`
 *    - If the class defines `.equals()`: delegates to `this.equals(other)`
 *    - Otherwise: compares all stored instance fields via the pool's `equals()` function
 *
 * 2. `__vitest_assemblyscript_typename` — returns the runtime class name via `nameof<ClassName>()`
 *    - Virtual dispatch ensures correct runtime name even for base-typed variables
 *    - Used by stringifyValue() for user-facing output and by RTM type name tracking
 *
 * 3. `__vitest_assemblyscript_stringify` — returns comma-separated field entries for stringification
 *    - Always stringifies all stored instance fields regardless of operator==/equals()
 *    - Follows super chain via isDefined guard, same pattern as deep equality
 *    - Uses @global bridge __vitest_assemblyscript_stringify_value to call stringifyValue()
 *    - Threads a `budget` parameter (default -1 = unlimited / diff mode) through the
 *      generated body. When non-negative, fields are emitted as a sequence of guarded
 *      `if (!truncated) { ... }` blocks sharing a single `truncated` flag — once a
 *      piece would push past the budget, the block appends a `…(N)` marker and sets
 *      the flag, so subsequent guarded blocks become no-ops. Super (when present) is
 *      treated as an atomic single piece: called with budget=-1 (full output) and
 *      then accepted-whole or rejected-whole at this level, keeping at most one
 *      truncation marker per nesting level.
 *
 * Scoping:
 * - Only user source files (not node_modules, not AS stdlib)
 * - Blanket injection into all user classes (always enabled)
 *
 * Cross-module function availability:
 * - Structural bodies reference @global functions from assembly/compare.ts and assembly/utils.ts
 *   which are available in all source files without import
 * - Loaded transitively: user test → vitest-pool-assemblyscript/assembly → compare.ts → utils.ts
 *
 * AST injection:
 * - Method source is generated as a string, then parsed into an AST node using
 *   `Parser.parseClassMember()` via a temporary `Source` + `Tokenizer`
 *
 * @see https://www.assemblyscript.org/compiler.html#transforms
 * @see https://github.com/AssemblyScript/assemblyscript/blob/main/src/ast.ts
 */

import {
  ClassDeclaration,
  DeclarationStatement,
  DecoratorNode,
  FieldDeclaration,
  MethodDeclaration,
  Parser,
  Source,
  Tokenizer,
} from 'assemblyscript';
import { Transform } from 'assemblyscript/transform';

import { ASTVisitor } from '../../util/ast-visitor.js';
import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  COMPARE_EQUALS_EXPORT_ALIAS,
  DEEP_EQUALS_INJECTED_METHOD_NAME,
  EQUALITY_RESULT_ENUM_NAME,
  EQUALS_PATH_POP_GLOBAL_ALIAS,
  EQUALS_PATH_PUSH_GLOBAL_ALIAS,
  ESCAPE_TO_DIFF_STRING_GLOBAL_ALIAS,
  EXCEEDS_BUDGET_GLOBAL_ALIAS,
  INDENT_GLOBAL_ALIAS,
  INTERNAL_PATH_LIB_PREFIX,
  STRINGIFY_INJECTED_METHOD_NAME,
  STRINGIFY_VALUE_GLOBAL_ALIAS,
  TYPENAME_INJECTED_METHOD_NAME,
  ASCommonFlags,
  ASDecoratorKind,
  ASNodeKind,
  ASSourceKind,
} from '../../types/constants.js';

/**
 * Visitor that finds class declarations and injects deep equality, typename, and stringify methods.
 * Uses ASTVisitor for full recursive traversal (finds classes inside namespaces, etc).
 */
class DeepEqualsVisitor extends ASTVisitor {
  constructor(
    private parser: Parser,
    private barrelPath: string,
  ) {
    super();
  }

  protected onClassEnter(node: ClassDeclaration): void {
    processClass(this.parser, node, this.barrelPath);
  }
}

/**
 * AssemblyScript compiler transform that injects deep equality, typename, and stringify methods
 * into user-defined classes
 */
class DeepEqualsTransform extends Transform {
  afterParse(parser: Parser): void {
    const sources = (this as Transform).program.sources;

    // Find the pool's assembly barrel file — used as the normalizedPath for injected
    // methods so the source map attributes them to pool internals, not user code.
    // The AS compiler requires a real source in the compilation for identifier resolution.
    const barrelPath = `${INTERNAL_PATH_LIB_PREFIX}index.ts`;
    const barrelSource = sources.find((s: Source) => s.normalizedPath === barrelPath);
    if (!barrelSource) {
      // This should never happen — the barrel is always loaded transitively via user imports.
      // If it does, fall back to the class's own source path (incorrect attribution but functional).
      console.warn(`[deep-equals transform] WARNING: Could not find barrel source "${barrelPath}" in compilation`);
    }

    const resolvedBarrelPath = barrelSource ? barrelPath : '';
    const visitor = new DeepEqualsVisitor(parser, resolvedBarrelPath);

    // Filter to user source files only (same scoping as strip-inline transform)
    const userSources = sources.filter((source: Source) =>
      (source.sourceKind === ASSourceKind.User || source.sourceKind === ASSourceKind.UserEntry)
      && !source.normalizedPath.startsWith(ASSEMBLYSCRIPT_LIB_PREFIX)
    );

    for (const source of userSources) {
      visitor.visitSource(source);
    }
  }
}

/**
 * Process a class declaration: inject deep equality, typename, and stringify methods.
 */
function processClass(parser: Parser, classDecl: ClassDeclaration, barrelPath: string): void {
  const className = classDecl.name.text;

  // Use the barrel path if available, otherwise fall back to the class's own source path
  const sourcePath = barrelPath || classDecl.range.source.normalizedPath;

  // Build the type suffix for generic classes (e.g. "Pair" → "Pair<T>" or "Pair<K, V>")
  const typeSuffix = getTypeParameterSuffix(classDecl);

  injectDeepEquals(parser, classDecl, className, typeSuffix, sourcePath);
  injectTypename(parser, classDecl, className, typeSuffix, sourcePath);
  injectStringify(parser, classDecl, sourcePath);
}

/**
 * Inject the deep equality comparison method into a class.
 *
 * Behavior depends on user-defined equality semantics:
 * - @operator("==") present: delegates to `this == other`
 * - .equals() present: delegates to `this.equals(other)`
 * - Neither: field-by-field structural comparison
 *
 * All methods use a usize parameter for inheritance compatibility — AS treats child methods
 * with the same name as overrides, requiring compatible parameter types. Each body casts
 * the pointer to its own type via changetype.
 */
function injectDeepEquals(
  parser: Parser, classDecl: ClassDeclaration,
  className: string, typeSuffix: string, sourcePath: string,
): void {
  if (hasMethod(classDecl, DEEP_EQUALS_INJECTED_METHOD_NAME)) return;

  const typedCast = `const other = changetype<${className}${typeSuffix}>(__other);`;
  const EQ = EQUALITY_RESULT_ENUM_NAME;
  let methodBody: string;

  if (hasOperatorEquals(classDecl)) {
    methodBody = `${typedCast} return (this == other) ? ${EQ}.Equal : ${EQ}.NotEqual;`;
  } else if (hasMethod(classDecl, 'equals')) {
    methodBody = `${typedCast} return this.equals(other) ? ${EQ}.Equal : ${EQ}.NotEqual;`;
  } else {
    methodBody = `${typedCast} ${generateStructuralBody(classDecl)}`;
  }

  const methodSource =
    `${DEEP_EQUALS_INJECTED_METHOD_NAME}(__other: usize): ${EQ} { ${methodBody} }`;

  injectClassMember(parser, classDecl, methodSource, sourcePath);
}

/**
 * Inject the typename method into a class.
 *
 * Returns the class's own name via nameof<ClassName>(). No super chain — each class returns
 * its own name. Virtual dispatch ensures the correct runtime class name is returned even
 * when the variable is typed as a base class.
 */
function injectTypename(
  parser: Parser, classDecl: ClassDeclaration,
  className: string, typeSuffix: string, sourcePath: string,
): void {
  if (hasMethod(classDecl, TYPENAME_INJECTED_METHOD_NAME)) return;

  const methodSource =
    `${TYPENAME_INJECTED_METHOD_NAME}(): string { return nameof<${className}${typeSuffix}>(); }`;

  injectClassMember(parser, classDecl, methodSource, sourcePath);
}

/**
 * Inject the stringify method into a class.
 *
 * Returns comma-separated "fieldName: value" entries for all stored instance fields.
 * Always stringifies all fields regardless of operator==/equals() — stringify shows
 * full object state, not equality-relevant fields only.
 *
 * The `budget` parameter (default -1 = unlimited / diff mode) carries the short-form
 * character budget for this object's content. When non-negative, fields are emitted
 * as a sequence of guarded `if (!truncated) { ... }` blocks sharing a single
 * `truncated` flag — once a field's render would push past the budget, the block
 * appends a `…(N)` marker and sets the flag, so subsequent blocks become no-ops.
 *
 * Follows the super chain via isDefined guard, same pattern as deep equality. Super
 * is treated as an atomic single piece: called with budget=-1 (full output) and
 * then accepted-whole or rejected-whole at this level. This keeps at most one
 * truncation marker per nesting level (in exchange for a slightly imprecise `N` when
 * super gets rejected — it counts only this level's pieces, not chain-wide fields).
 *
 * Uses @global bridges __vitest_assemblyscript_stringify_value and
 * __vitest_assemblyscript_exceeds_budget to call into utils.ts without imports.
 */
function injectStringify(
  parser: Parser, classDecl: ClassDeclaration,
  sourcePath: string,
): void {
  if (hasMethod(classDecl, STRINGIFY_INJECTED_METHOD_NAME)) return;

  const methodBody = generateStringifyBody(classDecl);
  const methodSource =
    `${STRINGIFY_INJECTED_METHOD_NAME}(formatForDiff: bool = true, depth: i32 = 0, budget: i32 = -1): string { ${methodBody} }`;

  injectClassMember(parser, classDecl, methodSource, sourcePath);
}

// =============================================================================
// Detection helpers
// =============================================================================

/**
 * Check if a class has a specific instance method by name
 */
function hasMethod(classDecl: ClassDeclaration, methodName: string): boolean {
  return classDecl.members.some(member =>
    member.kind === ASNodeKind.MethodDeclaration
    && (member as MethodDeclaration).name.text === methodName
    && member.is(ASCommonFlags.Instance)
  );
}

/**
 * Check if a class has an @operator("==") decorator on any method.
 * The AS compiler uses DecoratorKind.Operator (2) for @operator and
 * DecoratorKind.OperatorBinary (3) for @operator.binary — check both.
 */
function hasOperatorEquals(classDecl: ClassDeclaration): boolean {
  for (const member of classDecl.members) {
    if (member.kind !== ASNodeKind.MethodDeclaration) continue;

    const decorators = member.decorators;
    if (!decorators) continue;

    for (const decorator of decorators) {
      const kind = (decorator as DecoratorNode).decoratorKind;
      if (kind !== ASDecoratorKind.Operator && kind !== ASDecoratorKind.OperatorBinary) continue;

      // Check if the decorator argument is "=="
      const args = (decorator as DecoratorNode).args;
      if (!args || args.length === 0) continue;

      // The first argument is a string literal with the operator name.
      // At the AST level, LiteralExpression has a .value property for string literals.
      // The AS type declarations expose it as Expression, but the runtime type is
      // StringLiteralExpression with a .value: string property.
      const firstArg = args[0] as any;
      if (firstArg.value === '==') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the type parameter suffix for a class declaration.
 * Returns empty string for non-generic classes, "<T>" for single param,
 * "<K, V>" for multiple params, etc.
 */
function getTypeParameterSuffix(classDecl: ClassDeclaration): string {
  const typeParams = classDecl.typeParameters;
  if (!typeParams || typeParams.length === 0) {
    return '';
  }

  const paramNames = typeParams.map(param => param.name.text);
  return `<${paramNames.join(', ')}>`;
}

// =============================================================================
// Structural body generation
// =============================================================================

/**
 * Collect stored instance fields from a class declaration.
 * Includes public, private, protected fields.
 * Excludes: static fields, getters, setters, constructors, methods.
 */
function getStoredInstanceFields(classDecl: ClassDeclaration): FieldDeclaration[] {
  return classDecl.members.filter(member => {
    if (member.kind !== ASNodeKind.FieldDeclaration) return false;

    // Exclude static fields
    if (member.is(ASCommonFlags.Static)) return false;

    // Exclude getters and setters (these are MethodDeclarations in AS,
    // but guard against FieldDeclarations with these flags just in case)
    if (member.is(ASCommonFlags.Get) || member.is(ASCommonFlags.Set)) return false;

    return true;
  }) as FieldDeclaration[];
}

/**
 * Generate the structural comparison body for a class.
 * Delegates all field comparisons to the pool's equals function, which handles
 * primitives, strings, containers, nullables, and nested user types recursively.
 *
 * Uses a shared `__result` variable to capture and propagate EqualityResult from
 * each comparison, so type mismatch information from nested comparisons is preserved.
 */
function generateStructuralBody(classDecl: ClassDeclaration): string {
  const fields = getStoredInstanceFields(classDecl);
  const EQ = EQUALITY_RESULT_ENUM_NAME;

  // No fields: always equal (two instances of an empty class are structurally identical)
  if (fields.length === 0) {
    return `return ${EQ}.Equal;`;
  }

  // Check if class extends another class — if so, include super comparison
  const hasSuper = classDecl.extendsType !== null;

  const comparisons: string[] = [];

  // Declare a shared result variable for capturing and propagating EqualityResult
  comparisons.push(`let __result: ${EQ};`);

  // Super class comparison: delegate to superclass's deep equality comparison method if it exists.
  // Passes __other (raw usize) since the parent's method also takes usize.
  if (hasSuper) {
    comparisons.push(
      `if (isDefined(super.${DEEP_EQUALS_INJECTED_METHOD_NAME})) { `
      + `__result = super.${DEEP_EQUALS_INJECTED_METHOD_NAME}(__other); `
      + `if (__result != ${EQ}.Equal) return __result; `
      + `}`
    );
  }

  for (const field of fields) {
    const fieldName = field.name.text;
    comparisons.push(
      `${EQUALS_PATH_PUSH_GLOBAL_ALIAS}(".${fieldName}"); `
      + `__result = ${COMPARE_EQUALS_EXPORT_ALIAS}(this.${fieldName}, other.${fieldName}); `
      + `if (__result != ${EQ}.Equal) return __result; `
      + `${EQUALS_PATH_POP_GLOBAL_ALIAS}();`
    );
  }

  return comparisons.join(' ') + ` return ${EQ}.Equal;`;
}

/**
 * Generate the stringify body for a class.
 *
 * Produces "fieldName: value" entries, threading the `budget` parameter through to
 * each field via the @global stringify bridge. When `budget >= 0` (short form), the
 * body emits each field as a guarded `if (!truncated) { ... }` block sharing a
 * single `truncated` flag — a field whose addition would overflow the budget appends
 * a `…(N)` marker and sets the flag (subsequent blocks become no-ops). When
 * `budget < 0` (diff mode), the marker strings are empty and the exceedsBudget check
 * never fires, so the body emits every piece unconditionally.
 *
 * Super chain: super is treated as an atomic single piece. We call
 * `super.__vitest_assemblyscript_stringify(formatForDiff, depth, -1)` so super
 * produces its full output, then measure as one piece and accept-whole or reject-
 * whole against our budget. If rejected, our marker `…(1 + fields.length)` absorbs
 * both super and our remaining fields. The `-1` is passed explicitly rather than
 * relying on the default, because AS routes default-arg fill through an `@varargs`
 * trampoline that does virtual dispatch on `this` — for a subclass super call that
 * dispatches back to the subclass override, causing infinite recursion.
 *
 * Uses template literal style for piece construction: multi-piece `${a}${b}${c}`
 * lowers to a single `StaticArray<string>#join("")` allocation in AS, while a `+`
 * chain allocates one intermediate string per operator.
 */
function generateStringifyBody(classDecl: ClassDeclaration): string {
  const fields = getStoredInstanceFields(classDecl);
  const hasSuper = classDecl.extendsType !== null;

  // No fields and no super: return empty string
  if (fields.length === 0 && !hasSuper) {
    return `return "";`;
  }

  const parts: string[] = [];
  parts.push(`const sep: string = formatForDiff ? ",\\n" : ", ";`);
  // Per-line indent prefix for diff output. Each field/super line sits at depth+1.
  // Short-form output stays single-line, so the prefix is empty there.
  parts.push(`const linePrefix: string = formatForDiff ? ${INDENT_GLOBAL_ALIAS}(depth + 1) : "";`);
  parts.push(`let s = "";`);
  parts.push(`let used: i32 = 0;`);
  parts.push(`let truncated: bool = false;`);

  // Super chain: atomic single piece. Called with explicit budget=-1 (full output);
  // either accept-whole or reject-whole at this level — keeps at most one truncation
  // marker per nesting level.
  if (hasSuper) {
    const totalIncludingSuper = fields.length + 1;
    const superTrailingSepLen = fields.length > 0 ? 'sep.length' : '0';
    parts.push(`if (!truncated) {`);
    parts.push(`  if (isDefined(super.${STRINGIFY_INJECTED_METHOD_NAME})) {`);
    // Pass `-1` (the budget-unlimited sentinel) explicitly rather than relying on
    // the default parameter. AS generates a @varargs trampoline when a caller doesn't
    // supply all args of a method with defaults, and that trampoline does VIRTUAL
    // dispatch on `this` — for a subclass instance calling super via the trampoline,
    // dispatch resolves back to the subclass override and causes infinite recursion.
    // Passing all three args here keeps the call a direct super dispatch.
    parts.push(`    const superStr: string = super.${STRINGIFY_INJECTED_METHOD_NAME}(formatForDiff, depth, -1);`);
    parts.push(`    if (superStr != "") {`);
    parts.push(`      const truncMarker: string = budget >= 0 ? "…(${totalIncludingSuper})" : "";`);
    parts.push(`      const trailingSepLen: i32 = ${superTrailingSepLen};`);
    parts.push(`      if (${EXCEEDS_BUDGET_GLOBAL_ALIAS}(used, superStr.length, trailingSepLen, truncMarker.length, budget)) {`);
    parts.push(`        s += truncMarker;`);
    parts.push(`        truncated = true;`);
    parts.push(`      } else {`);
    parts.push(`        s += superStr;`);
    parts.push(`        used += superStr.length;`);
    if (fields.length > 0) {
      parts.push(`        s += sep;`);
      parts.push(`        used += sep.length;`);
    }
    parts.push(`      }`);
    parts.push(`    }`);
    parts.push(`  }`);
    parts.push(`}`);
  }

  // Each field as a guarded `if (!truncated) { ... }` block. Compute marker +
  // childBudget, render the piece, then either append (piece + sep) or set truncated
  // and append the marker. Field values sit one nesting level deeper — pass depth + 1
  // so nested content/braces land at the right indent.
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const fieldName = field?.name?.text;
    const isLast = i === fields.length - 1;
    const remainingPieces = fields.length - i; // includes the current field
    parts.push(`if (!truncated) {`);
    parts.push(`  const fieldName: string = formatForDiff ? ${ESCAPE_TO_DIFF_STRING_GLOBAL_ALIAS}("${fieldName}") : "${fieldName}";`);
    parts.push(`  const truncMarker: string = budget >= 0 ? "…(${remainingPieces})" : "";`);
    parts.push(`  const fieldSepLen: i32 = ${isLast ? '0' : 'sep.length'};`);
    parts.push(`  const childBudget: i32 = budget < 0 ? -1 : max(0, budget - used - fieldSepLen - truncMarker.length);`);
    parts.push(`  const piece: string = \`\${linePrefix}\${fieldName}: \${${STRINGIFY_VALUE_GLOBAL_ALIAS}(this.${fieldName}, formatForDiff, depth + 1, childBudget)}\`;`);
    parts.push(`  if (${EXCEEDS_BUDGET_GLOBAL_ALIAS}(used, piece.length, fieldSepLen, truncMarker.length, budget)) {`);
    parts.push(`    s += truncMarker;`);
    parts.push(`    truncated = true;`);
    parts.push(`  } else {`);
    parts.push(`    s += piece;`);
    parts.push(`    used += piece.length;`);
    if (!isLast) {
      parts.push(`    s += sep;`);
      parts.push(`    used += sep.length;`);
    }
    parts.push(`  }`);
    parts.push(`}`);
  }

  parts.push(`return s;`);
  return parts.join(' ');
}

// =============================================================================
// AST injection
// =============================================================================

/**
 * Parse a method source string and inject it as a member of the given class.
 *
 * Creates a temporary Source and Tokenizer, uses the parser's parseClassMember()
 * to produce a proper AST node, then appends it to the class's members array.
 *
 * The temporary source uses the pool's assembly barrel file (assembly/index.ts) as its
 * normalizedPath instead of the user's source file. This prevents the source map from
 * incorrectly attributing generated code to user source lines. The AS compiler requires
 * the normalizedPath to be a real source in the compilation for identifier resolution
 * (synthetic paths cause assertion failures in maybeCompileEnclosingSource).
 */
function injectClassMember(
  parser: Parser,
  classDecl: ClassDeclaration,
  memberSource: string,
  barrelPath: string,
): void {
  const tempSource = new Source(
    ASSourceKind.User,
    barrelPath,
    memberSource,
  );

  const tokenizer = new Tokenizer(tempSource);

  // Advance past the initial token so the parser is positioned correctly
  tokenizer.next();

  const member = parser.parseClassMember(tokenizer, classDecl);
  if (member) {
    classDecl.members.push(member as DeclarationStatement);
  }
}

export default DeepEqualsTransform;
