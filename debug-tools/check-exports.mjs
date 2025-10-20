#!/usr/bin/env node
/**
 * Debug script to check what functions are exported from compiled test WASM
 */

import asc from 'assemblyscript/dist/asc.js';
import { readFile } from 'fs/promises';

const testFile = process.argv[2] || 'tests/math.as.test.ts';

console.log('Compiling:', testFile);

const source = await readFile(testFile, 'utf-8');
let binary = null;

const result = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--exportStart', '_start',
], {
  stdout: { write: () => {} },
  stderr: { write: (msg) => console.error('STDERR:', msg) },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
});

if (result.error) {
  console.error('Compilation error:', result.error.message);
  process.exit(1);
}

console.log('Binary size:', binary.length, 'bytes\n');

const module = await WebAssembly.compile(binary);
const exports = WebAssembly.Module.exports(module);
const imports = WebAssembly.Module.imports(module);

console.log('Exports:');
exports.forEach(exp => console.log('  ', exp.name, ':', exp.kind));

console.log('\nImports:');
imports.forEach(imp => console.log('  ', imp.module, '::', imp.name, ':', imp.kind));
