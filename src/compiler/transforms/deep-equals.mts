/**
 * AssemblyScript Compiler Transform: Deep Equality for User-Defined Objects
 *
 * Injects a deep equality comparison method into user-defined classes in `afterParse`,
 * enabling `toEqual()` to perform deep value comparison on user objects.
 *
 * Behavior per class:
 * - If the class defines `@operator("==")`: deep equality method delegates to `this == other`
 * - If the class defines `.equals()`: deep equality method delegates to `this.equals(other)`
 * - Otherwise: deep equality method compares all stored instance fields via the pool's `equals()`
 *   comparison function, which handles primitives, strings, Arrays, Maps, Sets, ArrayBuffers, 
 *   nullables, and recursively dispatches to the deep equality method for nested user types
 *
 * Scoping:
 * - Only user source files (not node_modules, not AS stdlib)
 * - Blanket injection into all user classes (always enabled)
 *
 * Cross-module function availability:
 * - Structural bodies reference the `equals()` function from assembly/compare.ts ,
 *   which is exported under a wrapper alias and declared with `@global` making it available 
 *   in all source files without import
 * - Loaded transitively: user test → vitest-pool-assemblyscript/assembly → compare.ts
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
  INTERNAL_PATH_LIB_PREFIX,
  ASCommonFlags,
  ASDecoratorKind,
  ASNodeKind,
  ASSourceKind,
} from '../../types/constants.js';

/**
 * Visitor that finds class declarations and injects deep equality comparison method.
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
 * AssemblyScript compiler transform that injects deep equality comparison method into user-defined classes
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
 * Process a class declaration: determine the appropriate deep equality comparison method body and inject it.
 */
function processClass(parser: Parser, classDecl: ClassDeclaration, barrelPath: string): void {
  const className = classDecl.name.text;

  // Skip if the class somehow already has a method with the same name (e.g. user-defined very specific name conflict)
  if (hasMethod(classDecl, DEEP_EQUALS_INJECTED_METHOD_NAME)) {
    return;
  }

  // Build the type suffix for generic classes (e.g. "Pair" → "Pair<T>" or "Pair<K, V>")
  const typeSuffix = getTypeParameterSuffix(classDecl);

  // Determine the method body based on user-defined equality semantics.
  // Each body starts with a changetype cast from the raw usize parameter to the
  // typed class reference, so all field/method access uses the properly-typed `other`.
  const typedCast = `const other = changetype<${className}${typeSuffix}>(__other);`;
  const EQ = EQUALITY_RESULT_ENUM_NAME;
  let methodBody: string;

  if (hasOperatorEquals(classDecl)) {
    // Delegate to user's @operator("==") overload
    methodBody = `${typedCast} return (this == other) ? ${EQ}.Equal : ${EQ}.NotEqual;`;
  } else if (hasMethod(classDecl, 'equals')) {
    // Delegate to user's .equals() method
    methodBody = `${typedCast} return this.equals(other) ? ${EQ}.Equal : ${EQ}.NotEqual;`;
  } else {
    // field-by-field comparison
    methodBody = `${typedCast} ${generateStructuralBody(classDecl)}`;
  }

  // All deep equality comparison methods use a usize parameter instead of the class type.
  // This is required for inheritance: AS treats child methods with the same name as
  // overrides of the parent, and requires compatible parameter types. Using the class's
  // own type (e.g. Circle vs Shape) causes TS2394 "overload signature not compatible".
  // A uniform usize signature avoids this at any inheritance depth. Each method body
  // casts the pointer to its own type via changetype.
  const methodSource =
    `${DEEP_EQUALS_INJECTED_METHOD_NAME}(__other: usize): ${EQ} { ${methodBody} }`;

  // Use the barrel path if available, otherwise fall back to the class's own source path
  const sourcePath = barrelPath || classDecl.range.source.normalizedPath;
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
