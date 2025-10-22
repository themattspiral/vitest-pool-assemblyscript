#!/usr/bin/env node
/**
 * Analyze how decorator removal affects AST node positions
 *
 * This script creates a custom transform that logs AST node positions
 * BEFORE and AFTER removing @inline decorators to understand if line
 * numbers are affected.
 */

import { Transform } from "assemblyscript/transform";
import { DecoratorKind } from "assemblyscript";
import asc from 'assemblyscript/dist/asc.js';

class AnalyzeDecoratorPositions extends Transform {
  afterParse(parser) {
    console.log('\n=== Analyzing Decorator Positions ===\n');

    const sources = this.program.sources;
    sources.forEach(source => {
      const filename = source.internalPath;

      // Only analyze our test file
      if (!filename.includes('inline-error-test')) {
        return;
      }

      console.log(`File: ${filename}\n`);
      this.visitStatements(source.statements, filename);
    });
  }

  visitStatements(statements, filename) {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Look for function declarations with decorators
      if (stmt.decorators && stmt.decorators.length > 0) {
        console.log(`Statement ${i}:`);
        console.log(`  Kind: ${stmt.kind}`);
        console.log(`  Range: ${stmt.range.start} - ${stmt.range.end}`);

        // Get the actual line/column from the range
        const start = stmt.range.start;
        const startLine = this.program.sources[0].lineAt(start);
        const startCol = this.program.sources[0].columnAt();

        console.log(`  Decorators (${stmt.decorators.length}):`);
        stmt.decorators.forEach((decorator, idx) => {
          const isInline = decorator.decoratorKind === DecoratorKind.Inline;
          console.log(`    [${idx}] ${isInline ? '@inline' : decorator.decoratorKind}`);
          console.log(`        Range: ${decorator.range.start} - ${decorator.range.end}`);
        });

        // Get function name if available
        if (stmt.name) {
          console.log(`  Name: ${stmt.name.text}`);
          console.log(`  Name Range: ${stmt.name.range.start} - ${stmt.name.range.end}`);
        }

        // Filter out @inline decorators
        const beforeCount = stmt.decorators.length;
        const filteredDecorators = stmt.decorators.filter(
          decorator => decorator.decoratorKind !== DecoratorKind.Inline
        );
        const afterCount = filteredDecorators.length;

        stmt.decorators = filteredDecorators.length > 0 ? filteredDecorators : null;

        console.log(`  Decorators removed: ${beforeCount - afterCount}`);

        // Check if statement range changed after decorator removal
        console.log(`  Statement range AFTER filtering: ${stmt.range.start} - ${stmt.range.end}`);

        // Check if function body start changed
        if (stmt.body) {
          console.log(`  Body range: ${stmt.body.range.start} - ${stmt.body.range.end}`);
        }

        console.log('');
      }
    }
  }
}

async function main() {
  const testFile = 'tests/assembly/inline-error-test.as.test.ts';

  console.log('=== Compiling with decorator position analysis ===\n');

  let binary = null;

  const compilerFlags = [
    testFile,
    '--outFile', 'output.wasm',
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--importMemory',
    '--debug',
    '--sourceMap',
    '--exportStart', '_start',
    '--exportTable',
    '--transform', './debug-tools/analyze-ast-decorator-positions.mjs'
  ];

  const stderr = {
    write: (text) => {
      // Suppress normal compiler output during analysis
      return true;
    }
  };

  const result = await asc.main(compilerFlags, {
    stderr,
    writeFile: (name, contents, _baseDir) => {
      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
      }
    },
  });

  if (result.error) {
    console.error('Compilation failed:', result.error.message);
    process.exit(1);
  }

  console.log('\n=== Analysis Complete ===');
  console.log(`Binary size: ${binary.length} bytes`);
  console.log('\nKey Findings:');
  console.log('- Check if statement.range changes after decorator removal');
  console.log('- Check if function name.range is affected');
  console.log('- Check if body.range is affected');
}

// Export the transform as default for AS compiler
export default AnalyzeDecoratorPositions;

// Run analysis if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
