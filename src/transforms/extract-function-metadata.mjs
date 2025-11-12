/**
 * AssemblyScript Transform: Extract Function Metadata
 *
 * This transform is based on assemblyscript-unittest-framework's listFunctions.mjs transform.
 * It extracts function source line numbers from the AS AST during compilation.
 * The metadata is stored in globalThis.__functionMetadata for Binaryen to use later.
 *
 * Key differences from their implementation:
 * - Uses __functionMetadata instead of __functionInfos (our global name)
 * - Stores { name, range: [startLine, endLine] } format (same as theirs)
 * - Otherwise identical implementation
 */

import { Transform } from 'assemblyscript/transform';

// Initialize global metadata Map once at module load to prevent race conditions
if (!globalThis.__functionMetadata) {
  globalThis.__functionMetadata = new Map();
}

// NodeKind enum values (from AS compiler internals)
const NodeKind = {
  Source: 0,
  // types
  NamedType: 1,
  FunctionType: 2,
  TypeName: 3,
  TypeParameter: 4,
  // Expressions
  Parameter: 5,
  Identifier: 6,
  Assertion: 7,
  Binary: 8,
  Call: 9,
  Class: 10,
  Comma: 11,
  ElementAccess: 12,
  False: 13,
  Function: 14,
  InstanceOf: 15,
  Literal: 16,
  New: 17,
  Null: 18,
  Omitted: 19,
  Parenthesized: 20,
  PropertyAccess: 21,
  Ternary: 22,
  Super: 23,
  This: 24,
  True: 25,
  Constructor: 26,
  UnaryPostfix: 27,
  UnaryPrefix: 28,
  Compiled: 29,
  // statements
  Block: 30,
  Break: 31,
  Continue: 32,
  Do: 33,
  Empty: 34,
  Export: 35,
  ExportDefault: 36,
  ExportImport: 37,
  Expression: 38,
  For: 39,
  ForOf: 40,
  If: 41,
  Import: 42,
  Return: 43,
  Switch: 44,
  Throw: 45,
  Try: 46,
  Variable: 47,
  Void: 48,
  While: 49,
  Module: 50,
  // declaration statements
  ClassDeclaration: 51,
  EnumDeclaration: 52,
  EnumValueDeclaration: 53,
  FieldDeclaration: 54,
  FunctionDeclaration: 55,
  ImportDeclaration: 56,
  InterfaceDeclaration: 57,
  MethodDeclaration: 58,
  NamespaceDeclaration: 59,
  TypeDeclaration: 60,
  VariableDeclaration: 61,
  // special
  Decorator: 62,
  ExportMember: 63,
  SwitchCase: 64,
  IndexSignature: 65,
  Comment: 66,
};

// SourceKind enum values
const SourceKind = {
  User: 0,
  UserEntry: 1,
  Library: 2,
  LibraryEntry: 3,
};

// CommonFlags enum values
const CommonFlags = {
  Ambient: 32768,
  Abstract: 128,
  Constructor: 524288,
};

/**
 * Transform to extract function metadata from AS source files
 * Implementation copied from assemblyscript-unittest-framework
 */
export default class FunctionMetadataExtractor extends Transform {
  constructor() {
    super();
    this.functionInfos = [];
    this.elementsByDeclaration = new Map();
  }

  afterInitialize(program) {
    this.elementsByDeclaration = program.elementsByDeclaration;

    // Debug: see what's actually in elementsByDeclaration
    // console.log(`[Transform] elementsByDeclaration has ${this.elementsByDeclaration.size} entries`);
    // console.log('[Transform] ALL elements with internalName (potential functions):');
    for (const [node, element] of this.elementsByDeclaration.entries()) {

      if (node.range.source.sourceKind !== SourceKind.User && node.range.source.sourceKind !== SourceKind.UserEntry) {
        // console.log('skip because kind', typeof node.range.source.sourceKind, node.range.source.sourceKind);
        // continue;
      }

      // if (element.internalName && !element.internalName.startsWith('~lib')) {
      //   console.log(`[Transform]   kind=${element.kind} internalName="${element.internalName}" sourceKind="${node.range.source.sourceKind}"`);
      // } else if (node.name?.text && !node.name.text.startsWith('~lib') ) {
      //   console.log(`[Transform]   kind=${element.kind} name="${node.name.text}" sourceKind="${node.range.source.sourceKind}"`);
      // } else {
      //   console.log(`[Transform]   kind=${element.kind} name="<unknown>" sourceKind="${node.range.source.sourceKind}"`);
      // }
    }

    // Filter to user sources (both entry files and imported user files)
    // UserEntry = entry point (test file), User = imported source files
    this.program.sources
      .filter(
        (source) =>
          (source.sourceKind === SourceKind.User || source.sourceKind === SourceKind.UserEntry) &&
          !source.normalizedPath.startsWith('~lib/')
      )
      .forEach((source) => {
        // console.log(`[Transform] Visiting source: ${source.normalizedPath}`);
        this.functionInfos = [];
        this.visitNode(source);
        // console.log(`[Transform] Collected ${this.functionInfos.length} functions from ${source.normalizedPath}:`, JSON.stringify(this.functionInfos, null, 2));
        const functionInfos = globalThis.__functionMetadata || new Map();
        functionInfos.set(source.normalizedPath, this.functionInfos);
        globalThis.__functionMetadata = functionInfos;
      });

    // Debug: log all metadata
    // console.log(`[Transform] Total metadata entries: ${globalThis.__functionMetadata.size}`);
    // for (const [path, funcs] of globalThis.__functionMetadata.entries()) {
    //   console.log(`[Transform]   ${path}: ${funcs.length} functions`);
    // }
  }

  visitNode(node) {
    switch (node.kind) {
      case NodeKind.Source: {
        this.visitSource(node);
        break;
      }
      // types
      case NodeKind.NamedType:
      case NodeKind.FunctionType:
      case NodeKind.TypeName:
      case NodeKind.TypeParameter: {
        break;
      }
      case NodeKind.Parameter: {
        this.visitParameterNode(node);
        break;
      }
      // Expressions
      case NodeKind.Identifier:
      case NodeKind.False:
      case NodeKind.Literal:
      case NodeKind.Null:
      case NodeKind.Omitted:
      case NodeKind.Super:
      case NodeKind.This:
      case NodeKind.True:
      case NodeKind.Constructor:
      case NodeKind.Compiled: {
        break;
      }
      case NodeKind.Assertion: {
        this.visitAssertionExpression(node);
        break;
      }
      case NodeKind.Binary: {
        this.visitBinaryExpression(node);
        break;
      }
      case NodeKind.Call: {
        this.visitCallExpression(node);
        break;
      }
      case NodeKind.Class: {
        this.visitClassExpression(node);
        break;
      }
      case NodeKind.Comma: {
        this.visitCommaExpression(node);
        break;
      }
      case NodeKind.ElementAccess: {
        this.visitElementAccessExpression(node);
        break;
      }
      case NodeKind.Function: {
        this.visitFunctionExpression(node);
        break;
      }
      case NodeKind.InstanceOf: {
        this.visitInstanceOfExpression(node);
        break;
      }
      case NodeKind.New: {
        this.visitNewExpression(node);
        break;
      }
      case NodeKind.Parenthesized: {
        this.visitParenthesizedExpression(node);
        break;
      }
      case NodeKind.PropertyAccess: {
        this.visitPropertyAccessExpression(node);
        break;
      }
      case NodeKind.Ternary: {
        this.visitTernaryExpression(node);
        break;
      }
      case NodeKind.UnaryPostfix: {
        this.visitUnaryPostfixExpression(node);
        break;
      }
      case NodeKind.UnaryPrefix: {
        this.visitUnaryPrefixExpression(node);
        break;
      }
      // statements
      case NodeKind.Break:
      case NodeKind.Empty:
      case NodeKind.Export:
      case NodeKind.ExportDefault:
      case NodeKind.ExportImport:
      case NodeKind.Continue:
      case NodeKind.Import:
      case NodeKind.Module: {
        break;
      }
      case NodeKind.Block: {
        this.visitBlockStatement(node);
        break;
      }
      case NodeKind.Do: {
        this.visitDoStatement(node);
        break;
      }
      case NodeKind.Expression: {
        this.visitExpressionStatement(node);
        break;
      }
      case NodeKind.For: {
        this.visitForStatement(node);
        break;
      }
      case NodeKind.ForOf: {
        this.visitForOfStatement(node);
        break;
      }
      case NodeKind.If: {
        this.visitIfStatement(node);
        break;
      }
      case NodeKind.Return: {
        this.visitReturnStatement(node);
        break;
      }
      case NodeKind.Switch: {
        this.visitSwitchStatement(node);
        break;
      }
      case NodeKind.Throw: {
        this.visitThrowStatement(node);
        break;
      }
      case NodeKind.Try: {
        this.visitTryStatement(node);
        break;
      }
      case NodeKind.Variable: {
        this.visitVariableStatement(node);
        break;
      }
      case NodeKind.Void: {
        this.visitVoidStatement(node);
        break;
      }
      case NodeKind.While: {
        this.visitWhileStatement(node);
        break;
      }
      // declaration statements
      case NodeKind.ImportDeclaration:
      case NodeKind.TypeDeclaration: {
        break;
      }
      case NodeKind.ClassDeclaration: {
        this.visitClassDeclaration(node);
        break;
      }
      case NodeKind.EnumDeclaration: {
        this.visitEnumDeclaration(node);
        break;
      }
      case NodeKind.EnumValueDeclaration: {
        this.visitEnumValueDeclaration(node);
        break;
      }
      case NodeKind.FieldDeclaration: {
        this.visitFieldDeclaration(node);
        break;
      }
      case NodeKind.FunctionDeclaration: {
        this.visitFunctionDeclaration(node);
        break;
      }
      case NodeKind.InterfaceDeclaration: {
        this.visitInterfaceDeclaration(node);
        break;
      }
      case NodeKind.MethodDeclaration: {
        this.visitMethodDeclaration(node);
        break;
      }
      case NodeKind.NamespaceDeclaration: {
        this.visitNamespaceDeclaration(node);
        break;
      }
      case NodeKind.VariableDeclaration: {
        this.visitVariableDeclaration(node);
        break;
      }
      // special
      case NodeKind.ExportMember:
      case NodeKind.IndexSignature:
      case NodeKind.Comment:
      case NodeKind.Decorator: {
        break;
      }
      case NodeKind.SwitchCase: {
        this.visitSwitchCase(node);
        break;
      }
    }
  }

  visitSource(node) {
    for (const statement of node.statements) {
      this.visitNode(statement);
    }
  }

  visitParameterNode(node) {
    if (node.initializer) {
      this.visitNode(node.initializer);
    }
  }

  visitAssertionExpression(node) {
    this.visitNode(node.expression);
  }

  visitBinaryExpression(node) {
    this.visitNode(node.left);
    this.visitNode(node.right);
  }

  visitCallExpression(node) {
    this.visitNode(node.expression);
    for (const arg of node.args) {
      this.visitNode(arg);
    }
  }

  visitClassExpression(node) {
    this.visitClassDeclaration(node.declaration);
  }

  visitCommaExpression(node) {
    for (const expr of node.expressions) {
      this.visitNode(expr);
    }
  }

  visitElementAccessExpression(node) {
    this.visitNode(node.expression);
    this.visitNode(node.elementExpression);
  }

  visitFunctionExpression(node) {
    this.visitFunctionDeclaration(node.declaration);
  }

  visitInstanceOfExpression(node) {
    this.visitNode(node.expression);
  }

  visitNewExpression(node) {
    for (const arg of node.args) {
      this.visitNode(arg);
    }
  }

  visitParenthesizedExpression(node) {
    this.visitNode(node.expression);
  }

  visitPropertyAccessExpression(node) {
    this.visitNode(node.expression);
  }

  visitTernaryExpression(node) {
    this.visitNode(node.condition);
    this.visitNode(node.ifThen);
    this.visitNode(node.ifElse);
  }

  visitUnaryPostfixExpression(node) {
    this.visitNode(node.operand);
  }

  visitUnaryPrefixExpression(node) {
    this.visitNode(node.operand);
  }

  visitBlockStatement(node) {
    for (const statement of node.statements) {
      this.visitNode(statement);
    }
  }

  visitDoStatement(node) {
    this.visitNode(node.body);
    this.visitNode(node.condition);
  }

  visitExpressionStatement(node) {
    this.visitNode(node.expression);
  }

  visitForStatement(node) {
    if (node.initializer) {
      this.visitNode(node.initializer);
    }
    if (node.condition) {
      this.visitNode(node.condition);
    }
    if (node.incrementor) {
      this.visitNode(node.incrementor);
    }
    this.visitNode(node.body);
  }

  visitForOfStatement(node) {
    this.visitNode(node.variable);
    this.visitNode(node.iterable);
    this.visitNode(node.body);
  }

  visitIfStatement(node) {
    this.visitNode(node.condition);
    this.visitNode(node.ifTrue);
    if (node.ifFalse) {
      this.visitNode(node.ifFalse);
    }
  }

  visitReturnStatement(node) {
    if (node.value) {
      this.visitNode(node.value);
    }
  }

  visitSwitchStatement(node) {
    this.visitNode(node.condition);
    for (const switchCase of node.cases) {
      this.visitSwitchCase(switchCase);
    }
  }

  visitThrowStatement(node) {
    this.visitNode(node.value);
  }

  visitTryStatement(node) {
    for (const stat of node.bodyStatements) {
      this.visitNode(stat);
    }
    if (node.catchStatements) {
      for (const stat of node.catchStatements) {
        this.visitNode(stat);
      }
    }
    if (node.finallyStatements) {
      for (const stat of node.finallyStatements) {
        this.visitNode(stat);
      }
    }
  }

  visitVariableStatement(node) {
    for (const declaration of node.declarations) {
      this.visitVariableDeclaration(declaration);
    }
  }

  visitVoidStatement(node) {
    this.visitNode(node.expression);
  }

  visitWhileStatement(node) {
    this.visitNode(node.condition);
    this.visitNode(node.body);
  }

  visitClassDeclaration(node) {
    for (const member of node.members) {
      this.visitNode(member);
    }
  }

  visitEnumDeclaration(node) {
    for (const value of node.values) {
      this.visitEnumValueDeclaration(value);
    }
  }

  visitEnumValueDeclaration(node) {
    if (node.initializer) {
      this.visitNode(node.initializer);
    }
  }

  visitFieldDeclaration(node) {
    if (node.initializer) {
      this.visitNode(node.initializer);
    }
  }

  visitFunctionDeclaration(node) {
    if (!(node.flags & (CommonFlags.Ambient | CommonFlags.Abstract))) {
      let startLine, endLine;
      // startLine is the first Line of Function.body, same as endLine
      if (node.body) {
        if (
          node.body.kind === NodeKind.Block &&
          node.body.statements.length > 0
        ) {
          const bodyStatement = node.body.statements;
          const startStat = bodyStatement[0];
          startLine = startStat.range.source.lineAt(startStat.range.start);
          const endStat = bodyStatement.at(-1);
          endLine = endStat.range.source.lineAt(endStat.range.end);
        } else {
          if (node.flags & CommonFlags.Constructor) {
            // do not count constructor without any statements
            return;
          }
          const LineRange = node.body.range;
          startLine = LineRange.source.lineAt(LineRange.start);
          endLine = LineRange.source.lineAt(LineRange.end);
        }
        const element = this.elementsByDeclaration.get(node);
        const funcName = element?.internalName ?? node.name.text;
        const sourceFile = node.range.source.normalizedPath;

        if (!funcName.startsWith('~lib')) {
          // console.log(`[Transform]   Found function ${funcName} at lines ${startLine}-${endLine} in source: ${sourceFile}`);
          // console.log(`[Transform]     - element exists: ${!!element}, internalName: "${element?.internalName}", node.name.text: "${node.name.text}"`);
          this.functionInfos.push({
            name: funcName,
            range: [startLine, endLine],
            sourcePath: sourceFile,
          });
        }
      }
    }
    if (node.body) {
      this.visitNode(node.body);
    }
  }

  visitInterfaceDeclaration(node) {
    this.visitClassDeclaration(node);
  }

  visitMethodDeclaration(node) {
    this.visitFunctionDeclaration(node);
  }

  visitNamespaceDeclaration(node) {
    for (const member of node.members) {
      this.visitNode(member);
    }
  }

  visitVariableDeclaration(node) {
    if (node.initializer) {
      this.visitNode(node.initializer);
    }
  }

  visitSwitchCase(node) {
    if (node.label) {
      this.visitNode(node.label);
    }
    for (const stat of node.statements) {
      this.visitNode(stat);
    }
  }
}
