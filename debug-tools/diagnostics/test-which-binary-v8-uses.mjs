#!/usr/bin/env node
/**
 * Critical test: Which binary does V8 report positions from?
 *
 * When we execute the Binaryen-MODIFIED binary, does V8 report:
 * A) Positions in the modified binary (would break source maps)
 * B) Positions in the original binary (source maps would work)
 */

import asc from 'assemblyscript/dist/asc.js';
import binaryen from 'binaryen';
import { SourceMapConsumer } from 'source-map';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('=== COMPILING ===\n');

let originalBinary = null;
let sourceMap = null;

const result = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',
  '--exportStart', '_start',
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
      originalBinary = contents;
    } else if (name.endsWith('.wasm.map')) {
      sourceMap = contents;
    }
  },
});

if (result.error) {
  console.error('Compilation failed');
  process.exit(1);
}

console.log('Original binary size:', originalBinary.length, 'bytes');

// Process with Binaryen
const module = binaryen.readBinary(originalBinary);
const currentFeatures = module.getFeatures();
module.setFeatures(currentFeatures | binaryen.Features.BulkMemoryOpt);

const paramTypes = binaryen.createType([binaryen.i32]);
const testFuncType = binaryen.createType([]);
const body = module.call_indirect(
  '0',
  module.local.get(0, binaryen.i32),
  [],
  testFuncType,
  binaryen.none
);

module.addFunction('__execute_function', paramTypes, binaryen.none, [], body);
module.addFunctionExport('__execute_function', '__execute_function');
module.validate();

const modifiedBinary = module.emitBinary();
console.log('Modified binary size:', modifiedBinary.length, 'bytes');
console.log('Size difference:', modifiedBinary.length - originalBinary.length, 'bytes\n');

// Now instantiate BOTH binaries and trigger the same error
// Compare what V8 reports for each

const memory = new WebAssembly.Memory({ initial: 1 });

function decodeString(ptr, len) {
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}

function createImports(label) {
  return {
    env: {
      memory,
      __register_test(namePtr, nameLen, fnIndex) {
        // No-op
      },
      __assertion_pass() {},
      __assertion_fail(msgPtr, msgLen) {},
      abort(msgPtr, filePtr, line, column) {
        const msg = decodeString(msgPtr, 100);
        const error = new Error(msg);

        let callStack = [];
        const original = Error.prepareStackTrace;
        Error.prepareStackTrace = (err, stack) => {
          callStack = stack;
          return '';
        };
        error.stack;
        Error.prepareStackTrace = original;

        console.log(`=== ${label} ===`);
        const wasmFrames = callStack.filter(site =>
          site.getFileName()?.startsWith('wasm')
        );

        if (wasmFrames.length > 0) {
          const frame = wasmFrames[0];
          const line = frame.getLineNumber();
          const col = frame.getColumnNumber();
          console.log(`V8 reports: (line ${line}, column ${col})`);

          // Try mapping with source map
          const map = JSON.parse(sourceMap);
          const consumer = new SourceMapConsumer(map);
          const mapped = consumer.originalPositionFor({ line, column: col });
          consumer.destroy();

          if (mapped.source) {
            console.log(`Source map maps to: line ${mapped.line}, column ${mapped.column}`);
            console.log(`File: ${mapped.source}`);
          } else {
            console.log(`Source map lookup FAILED (no mapping found)`);
          }
        }
        console.log('');

        throw new Error('abort');
      }
    }
  };
}

console.log('=== TEST 1: Execute ORIGINAL binary ===\n');

try {
  const mod1 = await WebAssembly.compile(originalBinary);
  const inst1 = new WebAssembly.Instance(mod1, createImports('ORIGINAL BINARY'));
  inst1.exports._start();
} catch (e) {
  // Expected
}

console.log('=== TEST 2: Execute MODIFIED binary ===\n');

try {
  const mod2 = await WebAssembly.compile(modifiedBinary);
  const inst2 = new WebAssembly.Instance(mod2, createImports('MODIFIED BINARY'));
  inst2.exports._start();
} catch (e) {
  // Expected
}

console.log('=== CONCLUSION ===\n');
console.log('If V8 reports DIFFERENT positions for original vs modified binary:');
console.log('  → V8 reports positions in the binary being executed');
console.log('  → Source map from original binary won\'t work with modified binary');
console.log('  → WE NEED TO FIX THIS');
console.log('');
console.log('If V8 reports SAME positions for both:');
console.log('  → Something else is wrong with our approach');
