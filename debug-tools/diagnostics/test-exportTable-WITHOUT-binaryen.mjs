#!/usr/bin/env node
/**
 * CRITICAL TEST: Does --exportTable work WITHOUT Binaryen?
 *
 * This proves whether the source map bug is caused by:
 * A) Binaryen modification (what we suspected)
 * B) Something else in AS compiler (the real cause?)
 */

import asc from 'assemblyscript/dist/asc.js';
import { SourceMapConsumer } from 'source-map';
import { writeFileSync } from 'fs';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  CRITICAL TEST: --exportTable WITHOUT Binaryen                     ║');
console.log('║  Testing if source maps work when NO Binaryen modification applied ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Create test files
writeFileSync('/tmp/test-no-binaryen.as.ts', `
// Line 2
import { assert } from './test-no-binaryen-stub';

// Line 5: function that will fail
export function testFunction(): void {
  const x: i32 = 5;
  // Line 8: This assertion will fail
  assert(false, "deliberate failure on line 8");
}
`);

writeFileSync('/tmp/test-no-binaryen-stub.ts', `
export function assert(condition: bool, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
`);

console.log('=== STEP 1: Compile with --exportTable (NO Binaryen at all) ===\n');

let binary = null;
let sourceMap = null;

const result = await asc.main([
  '/tmp/test-no-binaryen.as.ts',
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',
  '--exportTable',  // Export table for testing
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
      binary = contents;
    } else if (name.endsWith('.wasm.map')) {
      sourceMap = contents;
    }
  },
  stdout: { write: () => true },
  stderr: { write: (text) => { console.log('[STDERR]', text); return true; } },
});

if (result.error || !binary || !sourceMap) {
  console.error('❌ Compilation failed');
  process.exit(1);
}

console.log('✅ AS compilation successful');
console.log(`   Binary size: ${binary.length} bytes`);
console.log(`   Source map size: ${sourceMap.length} bytes`);
console.log('   --exportTable included');
console.log('   NO Binaryen modification applied!\n');

console.log('=== STEP 2: Execute and Test Source Map ===\n');

const memory = new WebAssembly.Memory({ initial: 1 });

const imports = {
  env: {
    memory,
    abort(msgPtr, filePtr, line, column) {
      const msgBytes = new Uint8Array(memory.buffer, msgPtr, 100);
      let msgLen = 0;
      while (msgLen < 100 && msgBytes[msgLen] !== 0) msgLen++;
      const message = new TextDecoder().decode(msgBytes.subarray(0, msgLen));

      // Capture V8 stack
      const error = new Error(`Abort: ${message}`);
      let callStack = [];
      const original = Error.prepareStackTrace;
      Error.prepareStackTrace = (err, stack) => {
        callStack = stack;
        return '';
      };
      error.stack;
      Error.prepareStackTrace = original;

      // Find WASM frame
      const wasmFrame = callStack.find(site => site.getFileName()?.startsWith('wasm'));

      if (wasmFrame) {
        const watLine = wasmFrame.getLineNumber();
        const watCol = wasmFrame.getColumnNumber();

        console.log('V8 reported WAT position:', `(${watLine}, ${watCol})`);

        // Map with source map
        (async () => {
          const map = JSON.parse(sourceMap);
          const consumer = await new SourceMapConsumer(map);
          const mapped = consumer.originalPositionFor({
            line: watLine,
            column: watCol
          });
          consumer.destroy();

          console.log('Source map mapped to:', mapped);

          const expectedLine = 8; // Where assert(false) is

          if (mapped.source && mapped.line === expectedLine) {
            console.log(`\n✅✅✅ SOURCE MAP WORKS! Correctly mapped to line ${expectedLine}!`);
            console.log('\nCONCLUSION: The bug is NOT caused by --exportTable');
            console.log('The bug is NOT in Binaryen modification');
            console.log('The bug must be elsewhere in the AS compiler or our test setup\n');
          } else if (mapped.source && mapped.line) {
            console.log(`\n❌ SOURCE MAP BUG! Expected line ${expectedLine}, got line ${mapped.line}`);
            console.log('\nCONCLUSION: The bug exists even WITHOUT Binaryen!');
            console.log('This proves Binaryen is NOT the cause of the source map bug');
            console.log('The bug is in AS compiler source map generation or our test setup\n');
          } else {
            console.log('\n❌ SOURCE MAP FAILED! No mapping returned');
            console.log('\nCONCLUSION: Source maps are broken even without Binaryen');
            console.log('Need to investigate AS compiler source map generation\n');
          }
        })();
      }

      throw error;
    }
  }
};

try {
  const module = await WebAssembly.compile(binary);
  const instance = new WebAssembly.Instance(module, imports);

  console.log('✅ WASM instantiation successful');
  console.log('✅ Table is exported:', 'table' in instance.exports);
  console.log('   Calling testFunction() which will fail on line 8...\n');

  // Call the exported function directly (no table needed for this test)
  instance.exports.testFunction();

  console.error('❌ Test should have thrown!');
} catch (e) {
  console.log('\n✅ Test threw as expected\n');

  // Give abort handler time to run
  await new Promise(resolve => setTimeout(resolve, 100));
}
