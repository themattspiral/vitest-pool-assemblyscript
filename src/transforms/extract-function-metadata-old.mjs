/**
 * AssemblyScript Transform: Extract Function Metadata
 *
 * This transform extracts function source line numbers from the AS AST during compilation.
 * The metadata is stored in globalThis.__functionMetadata for Binaryen to use later.
 *
 * Architecture:
 * - This transform is READ-ONLY - it doesn't modify code, just extracts info
 * - Runs during AS compilation (has AST access)
 * - Binaryen instrumentation uses the metadata to map function indices to source lines
 *
 */

import { DeclarationStatement } from 'assemblyscript';
import { Transform } from 'assemblyscript/transform';
import util from 'node:util';

// NodeKind enum values (from AS compiler internals)
const NodeKind = {
  Block: 30,
  FunctionDeclaration: 55,
  ClassDeclaration: 51,
  NamespaceDeclaration: 59,
};

// CommonFlags enum values (from AS compiler internals)
const CommonFlags = {
  Ambient: 32768,
  Abstract: 128,
  Constructor: 524288,
};

/**
 * Transform to extract function metadata from AS source files
 *
 * Visits all function declarations and extracts:
 * - Function name (including internal names for generics)
 * - Start line (first statement in body)
 * - End line (last statement in body)
 */
export default class FunctionMetadataExtractor extends Transform {
  constructor() {
    super();
    this.functionInfos = [];
  }
  // console.log(' ********** TABLE********** \n\n ', util.inspect(module.table, { showHidden: true, depth: null }));

  printMapKeys(name, map) {
    console.log(`[OLD Transform] Map Keys for ${name}:`);
    
    if (map) {
      [...map.keys()]
        .forEach(k => {
          if (k instanceof DeclarationStatement) {
            const name = map.get(k)?.internalName ?? k.name?.text
            console.log(`[OLD Transform]    [${k.name.text}] (DeclarationStatement.name)`);
          } else {
            const key = String(k);

            if (!key.startsWith('~lib')) {
              console.log(`[OLD Transform]    [${String(k)}] (string)`);
            }
          }
        });
    } else {
        console.log(`[OLD Transform] ${name}:`, String(map));
    }
  }

  /**
   * Hook called after AS compiler parses source files
   *
   * Visits all user source files (excluding stdlib) and extracts function metadata
   */
  // afterParse(parser) {
  // afterCompile(module) {
  afterInitialize(program) {
    console.log('[OLD Transform] afterInitialize')
    // this.printMapKeys('program.elementsByName', program.elementsByName);
    // this.printMapKeys('program.instancesByName', program.instancesByName);
    this.printMapKeys('program.elementsByDeclaration', program.elementsByDeclaration);

    // Access sources from this.program (not parameter)
    // const sources = this.program.sources;
    const sources = this.program.sources;

    // Filter to user entry files only (exclude stdlib)
    const userSources = sources.filter(
      (source) =>
        (source.sourceKind === 1 /* SourceKind.UserEntry */ || source.sourceKind === 0 )
        && !source.normalizedPath.startsWith('~lib/')
    );

    // Extract function metadata from each source file
    for (const source of userSources) {
      this.functionInfos = [];
      this.visitSource(source);


      // Store metadata globally for Binaryen to access
      // Use Map keyed by normalized path
      const metadata = globalThis.__functionMetadata || new Map();
      metadata.set(source.normalizedPath, [...this.functionInfos]);
      globalThis.__functionMetadata = metadata;
    }
  }

  /**
   * Visit a source file and extract all function declarations
   * We recursively walk expression statements to find arrow functions in test() calls
   */
  visitSource(source) {
    for (const statement of source.statements) {
      // Recursively visit all nodes in statement to find functions
      this.visitStatement(statement);
    }
  }

  /**
   * Visit a statement node - handles all statement types
   */
  visitStatement(node) {
    switch (node.kind) {
      case 38: // NodeKind.Expression
        // console.log(`[OLD Transform] visitStatement got Expression kind=${node.kind} name="${node.name?.text}"`);
        // console.log(`[OLD Transform]   node.internalName: ${node.internalName || 'undefined'}`);
        // console.log(`[OLD Transform]   node.arrowKind: ${node.arrowKind}`);

        // Expression statements might contain test() calls with arrow functions
        if (node.expression) {
          this.visitExpression(node.expression);
        }
        break;
      case 51: // NodeKind.ClassDeclaration
        for (const member of node.members) {
          if (member.kind === 55 || member.kind === 58) { // FunctionDeclaration or MethodDeclaration
            this.visitFunctionDeclaration(member);
          }
        }
        break;
      case 55: // NodeKind.FunctionDeclaration
        this.visitFunctionDeclaration(node);
        break;
      case 59: // NodeKind.NamespaceDeclaration
        for (const member of node.members) {
          this.visitStatement(member);
        }
        break;
    }
  }

  /**
   * Visit an expression node - looks for arrow functions
   */
  visitExpression(node) {    
    if (node.kind === 9) { // NodeKind.Call
      // console.log(`[OLD Transform] visitExpression got Call kind=${node.kind} name="${node.name?.text}"`);
      // console.log(`[OLD Transform]   node.internalName: ${node.internalName || 'undefined'}`);
      // console.log(`[OLD Transform]   node.arrowKind: ${node.arrowKind}`);

      // Visit all arguments to the call (might contain arrow functions)
      if (node.args) {
        for (const arg of node.args) {
          if (arg.kind === 14) { // NodeKind.Function (arrow function expression)
            // console.log(`[OLD Transform]   visitExpression found arrow function expression arg kind=${node.kind} name="${node.name?.text}"`);
            // console.log(`[OLD Transform]     node.internalName: ${node.internalName || 'undefined'}`);
            // console.log(`[OLD Transform]     node.arrowKind: ${node.arrowKind}`);
            // console.log(util.inspect(node, { showHidden: true, depth: null }));

            // Arrow function expressions have a declaration property
            if (arg.declaration) {
              this.visitFunctionDeclaration(arg.declaration);
            }
          }
        }
      }
    }
  }

  /**
   * Visit a function declaration and extract metadata
   */
  visitFunctionDeclaration(node) {
    // Skip ambient and abstract functions (no implementation)
    if (node.flags & (CommonFlags.Ambient | CommonFlags.Abstract)) {
      // console.log(`[OLD Transform] skipping ambient/abstract function kind=${node.kind} name="${node.name.text}"`);
      return;
    }

    // Skip if no body
    if (!node.body) {
      // console.log(`[OLD Transform] skipping no body function kind=${node.kind} name="${node.name.text}"`);
      return;
    }

    // Extract line numbers from function declaration itself (not body)
    // startLine should be the line where the function is declared
    // endLine should be the last line of the function body
    const startLine = node.range.source.lineAt(node.range.start);

    let endLine;
    if (node.body.kind === NodeKind.Block && node.body.statements.length > 0) {
      // Block with statements - use last statement end position
      const bodyStatements = node.body.statements;
      const endStat = bodyStatements[bodyStatements.length - 1];
      endLine = endStat.range.source.lineAt(endStat.range.end);
    } else {
      // Empty constructor or expression body - use body range end
      if (node.flags & CommonFlags.Constructor) {
        // Don't count constructors without any statements
        return;
      }
      endLine = node.body.range.source.lineAt(node.body.range.end);
    }

    // Extract function name (use simple name for now)
    // TODO: Consider using internalName for generics if needed
    const functionName = node.name.text;

    // console.log(`[OLD Transform] Found function kind=${node.kind} name="${functionName}" at lines ${startLine}-${endLine}`);
    // console.log(`[OLD Transform]   node keys: ${Object.keys(node).join(', ')}`);
    // console.log(`[OLD Transform]   node.name keys: ${node.name ? Object.keys(node.name).join(', ') : 'null'}`);
    // console.log(`[OLD Transform]   node.symbol: ${node.symbol ? node.symbol.name : 'null'}`);
    // console.log(`[OLD Transform]   node.internalName: ${node.internalName || 'undefined'}`);

    this.functionInfos.push({
      name: functionName,
      startLine,
      endLine,
    });
  }
}
