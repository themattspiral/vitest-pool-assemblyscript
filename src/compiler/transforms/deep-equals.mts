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
 *    - Threads a `budget` parameter through the generated body for short-form truncation
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
  COMPARE_EQUALS_GLOBAL_ALIAS,
  DEEP_EQUALS_INJECTED_METHOD_NAME,
  EQUALITY_RESULT_ENUM_NAME,
  COMPARE_EQUALS_PATH_POP_GLOBAL_ALIAS,
  COMPARE_EQUALS_PATH_PUSH_GLOBAL_ALIAS,
  ESCAPE_TO_DIFF_STRING_GLOBAL_ALIAS,
  STRINGIFY_EXCEEDS_BUDGET_GLOBAL_ALIAS,
  STRINGIFY_INDENT_GLOBAL_ALIAS,
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
 * Returns "fieldName: value" entries for all stored instance fields, regardless of
 * operator==/equals() — stringify shows full object state, not equality-relevant
 * fields only. See generateStringifyBody for how budget is threaded through fields.
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
      `${COMPARE_EQUALS_PATH_PUSH_GLOBAL_ALIAS}(".${fieldName}"); `
      + `__result = ${COMPARE_EQUALS_GLOBAL_ALIAS}(this.${fieldName}, other.${fieldName}); `
      + `if (__result != ${EQ}.Equal) return __result; `
      + `${COMPARE_EQUALS_PATH_POP_GLOBAL_ALIAS}();`
    );
  }

  return comparisons.join(' ') + ` return ${EQ}.Equal;`;
}

/**
 * Generate the stringify body for a class — produces "fieldName: value" entries
 * (and an atomic super piece, if any) via the global stringify bridge, with each
 * piece guarded by a shared `truncated` flag so the budget is respected.
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
  // Field/super lines sit at depth+1; short-form stays single-line so prefix is empty
  parts.push(`const linePrefix: string = formatForDiff ? ${STRINGIFY_INDENT_GLOBAL_ALIAS}(depth + 1) : "";`);
  parts.push(`let s = "";`);
  parts.push(`let used: i32 = 0;`);
  parts.push(`let truncated: bool = false;`);

  // Super is an atomic single piece — keeps at most one truncation marker per nesting level
  if (hasSuper) {
    const totalIncludingSuper = fields.length + 1;
    const superTrailingSepLen = fields.length > 0 ? 'sep.length' : '0';
    parts.push(`if (!truncated) {`);
    parts.push(`  if (isDefined(super.${STRINGIFY_INJECTED_METHOD_NAME})) {`);
    // Pass all three args explicitly: AS routes default-arg fills through a @varargs
    // trampoline that virtually dispatches on `this`, so a partial super call resolves
    // back to the subclass override and infinitely recurses
    parts.push(`    const superStr: string = super.${STRINGIFY_INJECTED_METHOD_NAME}(formatForDiff, depth, -1);`);
    parts.push(`    if (superStr != "") {`);
    parts.push(`      const truncMarker: string = budget >= 0 ? "…(${totalIncludingSuper})" : "";`);
    parts.push(`      const trailingSepLen: i32 = ${superTrailingSepLen};`);
    parts.push(`      if (${STRINGIFY_EXCEEDS_BUDGET_GLOBAL_ALIAS}(used, superStr.length, trailingSepLen, truncMarker.length, budget)) {`);
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

  // Each field is guarded by `truncated`; values sit one level deeper (depth + 1)
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
    parts.push(`  if (${STRINGIFY_EXCEEDS_BUDGET_GLOBAL_ALIAS}(used, piece.length, fieldSepLen, truncMarker.length, budget)) {`);
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
