#!/usr/bin/env node
/**
 * Test what happens with --sourceMap in in-memory compilation
 *
 * Checks if source maps are accessible via writeFile callback
 * when compiling in-memory.
 */

import asc from 'assemblyscript/dist/asc.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/math.as.test.ts');

console.log('Testing --sourceMap with In-Memory Compilation\n');
console.log('='.repeat(80));

let wasmBinary = null;
let sourceMapData = null;
const allWrites = [];

console.log('Compiling with --sourceMap flag...\n');

const result = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',  // ADD SOURCE MAP
  '--exportStart', '_start',
], {
  stdout: { write: () => true },
  stderr: { write: () => true },
  writeFile: (name, contents, baseDir) => {
    console.log(`writeFile called:`);
    console.log(`  name: ${name}`);
    console.log(`  baseDir: ${baseDir || '(not provided)'}`);
    console.log(`  contents type: ${contents instanceof Uint8Array ? 'Uint8Array' : typeof contents}`);
    console.log(`  contents size: ${contents.length} ${contents instanceof Uint8Array ? 'bytes' : 'chars'}`);
    console.log();

    allWrites.push({ name, contents, baseDir });

    if (name.endsWith('.wasm')) {
      wasmBinary = contents;
    } else if (name.endsWith('.wasm.map') || name.endsWith('.map')) {
      sourceMapData = contents;
    }
  },
});

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log('='.repeat(80));
console.log('RESULTS:');
console.log('--------');
console.log(`Total writeFile calls: ${allWrites.length}`);
console.log();

allWrites.forEach((write, idx) => {
  console.log(`${idx + 1}. ${write.name}`);
  console.log(`   Type: ${write.contents instanceof Uint8Array ? 'Binary' : 'Text'}`);
  console.log(`   Size: ${write.contents.length} ${write.contents instanceof Uint8Array ? 'bytes' : 'chars'}`);
});

console.log();
console.log('WASM Binary:', wasmBinary ? `✓ Captured (${wasmBinary.length} bytes)` : '✗ Not captured');
console.log('Source Map:', sourceMapData ? `✓ Captured (${sourceMapData.length} chars)` : '✗ Not captured');

if (sourceMapData) {
  console.log();
  console.log('Source Map Format Analysis:');
  console.log('-'.repeat(80));

  try {
    const parsed = JSON.parse(sourceMapData);
    console.log('✓ Valid JSON - Source Map v' + parsed.version);
    console.log();
    console.log('Structure:');
    console.log('  version:', parsed.version);
    console.log('  sources:', parsed.sources.length, 'files');
    console.log('    Sample:', parsed.sources.slice(0, 3).join(', '));
    console.log('  names:', parsed.names.length, 'identifiers');
    console.log('  mappings:', parsed.mappings.length, 'chars (VLQ-encoded)');
    console.log();
    console.log('Format: Standard Source Map v3 specification');
    console.log('  - JSON parseable ✓');
    console.log('  - Uses VLQ (Variable Length Quantity) encoding for mappings');
    console.log('  - Parseable with "source-map" npm package');
  } catch (e) {
    console.log('✗ Not valid JSON:', e.message);
  }
  console.log('-'.repeat(80));
}

console.log();
console.log('='.repeat(80));
console.log('CONCLUSION:');
if (sourceMapData) {
  console.log('✅ Source maps ARE accessible via writeFile callback!');
  console.log('   We can capture both WASM binary and source map in memory.');
} else {
  console.log('❌ Source maps NOT captured - may need different approach');
}
console.log('='.repeat(80));
