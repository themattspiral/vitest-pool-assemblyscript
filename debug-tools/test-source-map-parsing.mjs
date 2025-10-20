#!/usr/bin/env node
/**
 * Test Source Map Parsing
 *
 * This script validates that we can:
 * 1. Generate source maps from AS compiler
 * 2. Parse WASM binary to extract source map URL
 * 3. Use source-map library to map WASM positions to AS source
 * 4. Extract exact file:line:column from errors
 */

import { SourceMapConsumer } from 'source-map';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import asc from 'assemblyscript/dist/asc.js';

// Test file path
const TEST_FILE = join(process.cwd(), 'tests/assembly/crash-isolation.as.test.ts');

console.log('=== Source Map Parsing Test ===\n');
console.log('Test file:', TEST_FILE);

// 1. Compile with source maps
console.log('\n[1] Compiling with source maps...');

let binary = null;
let sourceMap = null;

const ascResult = await asc.main([
  TEST_FILE,
  '--outFile', '/dev/null',
  '--sourceMap',
  '--debug',
  '-O0',
  '--exportStart', '_start',
  '--importMemory'
], {
  writeFile: (filename, contents) => {
    if (filename.endsWith('.wasm')) {
      binary = Buffer.from(contents);
    } else if (filename.endsWith('.wasm.map')) {
      sourceMap = contents.toString('utf-8');
    }
  },
  readFile: (filename) => {
    try {
      return readFileSync(filename);
    } catch (err) {
      if (err.code === 'ENOENT' && filename === 'asconfig.json') {
        return null; // No config file needed
      }
      throw err;
    }
  },
  listFiles: () => []
});

if (ascResult.error) {
  console.error('✗ Compilation failed:', ascResult.error);
  process.exit(1);
}

console.log('✓ Compilation successful');
console.log('  Binary size:', binary?.length || 0, 'bytes');
console.log('  Source map size:', sourceMap?.length || 0, 'bytes');

if (!sourceMap) {
  console.error('✗ No source map generated!');
  process.exit(1);
}

const result = { binary, sourceMap };

// 2. Parse source map
console.log('\n[2] Parsing source map...');
const sourceMapJson = JSON.parse(result.sourceMap);
console.log('✓ Source map parsed');
console.log('  Sources:', sourceMapJson.sources);
console.log('  Version:', sourceMapJson.version);
console.log('  Mappings length:', sourceMapJson.mappings?.length || 0);

// 3. Create SourceMapConsumer
console.log('\n[3] Creating SourceMapConsumer...');
const consumer = await new SourceMapConsumer(sourceMapJson);
console.log('✓ SourceMapConsumer created');

// 4. Test mapping some positions
console.log('\n[4] Testing position mappings...');

// Try a few different line/column positions
const testPositions = [
  { line: 1, column: 0 },
  { line: 10, column: 0 },
  { line: 50, column: 0 },
  { line: 100, column: 0 },
];

for (const pos of testPositions) {
  const original = consumer.originalPositionFor(pos);
  if (original.source) {
    console.log(`  WAT ${pos.line}:${pos.column} → AS ${original.source}:${original.line}:${original.column} (${original.name || 'no name'})`);
  }
}

// 5. Test parsing WASM binary for source map URL
console.log('\n[5] Parsing WASM binary for source map URL...');

// Look for sourceMappingURL section in WASM binary
function parseSourceMapUrl(wasmBinary) {
  // WASM custom section format:
  // - Section type: 0 (custom)
  // - Section size: varuint32
  // - Name length: varuint32
  // - Name: "sourceMappingURL"
  // - URL: rest of section

  const view = new DataView(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength);
  let offset = 8; // Skip magic + version

  while (offset < wasmBinary.length) {
    const sectionType = view.getUint8(offset++);
    const { value: sectionSize, bytesRead } = readVarUint32(wasmBinary, offset);
    offset += bytesRead;

    if (sectionType === 0) {
      // Custom section - check if it's sourceMappingURL
      const nameStart = offset;
      const { value: nameLen, bytesRead: nameLenBytes } = readVarUint32(wasmBinary, offset);
      offset += nameLenBytes;

      const name = new TextDecoder().decode(wasmBinary.slice(offset, offset + nameLen));
      offset += nameLen;

      if (name === 'sourceMappingURL') {
        const urlSize = sectionSize - nameLenBytes - nameLen;
        const url = new TextDecoder().decode(wasmBinary.slice(offset, offset + urlSize));
        return url;
      }

      // Skip rest of custom section
      offset = nameStart + sectionSize;
    } else {
      // Skip other sections
      offset += sectionSize;
    }
  }

  return null;
}

function readVarUint32(buffer, offset) {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    const byte = buffer[offset + bytesRead];
    bytesRead++;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return { value: result, bytesRead };
}

const sourceMapUrl = parseSourceMapUrl(result.binary);
if (sourceMapUrl) {
  console.log('✓ Found sourceMappingURL in WASM binary:', sourceMapUrl);
} else {
  console.log('  No sourceMappingURL found in WASM binary');
}

// 6. Simulate error stack trace parsing
console.log('\n[6] Simulating error stack trace parsing...');

// Example stack trace line from WASM:
// "at wasm://wasm/9041d4ea:wasm-function[6]:0x120"
//
// The format is: wasm-function[functionIndex]:offset
// But we need to map this to source locations.
//
// Problem: Stack traces give us function index + byte offset,
// but source maps expect line:column in the WAT text.
//
// Solution: We need to either:
// A) Use DWARF debug info (if available)
// B) Parse source map's "names" array which maps function indices
// C) Use Binaryen to get debug locations from function bodies

console.log('  Stack trace format: wasm-function[index]:offset');
console.log('  Source map format: line:column in WAT text');
console.log('  → Gap: Need to map function index + offset to WAT line:column');

// 7. Check what debug info is available
console.log('\n[7] Inspecting available debug info...');
console.log('  Source map has names:', Array.isArray(sourceMapJson.names) && sourceMapJson.names.length > 0);
if (sourceMapJson.names) {
  console.log('  Names:', sourceMapJson.names.slice(0, 10));
}

// Try to get all mapped positions
const allMappings = [];
consumer.eachMapping(mapping => {
  allMappings.push({
    generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
    original: {
      source: mapping.source,
      line: mapping.originalLine,
      column: mapping.originalColumn,
      name: mapping.name
    }
  });
});

console.log('\n  Total mappings:', allMappings.length);
if (allMappings.length > 0) {
  console.log('  First mapping:', JSON.stringify(allMappings[0], null, 2));
  console.log('  Last mapping:', JSON.stringify(allMappings[allMappings.length - 1], null, 2));
}

// 8. Check for DWARF sections
console.log('\n[8] Checking for DWARF debug sections...');
const dwarfSections = [];
let offset = 8; // Skip magic + version
const view = new DataView(result.binary.buffer, result.binary.byteOffset, result.binary.byteLength);

while (offset < result.binary.length) {
  const sectionType = view.getUint8(offset++);
  const { value: sectionSize, bytesRead } = readVarUint32(result.binary, offset);
  offset += bytesRead;

  if (sectionType === 0) {
    const nameStart = offset;
    const { value: nameLen, bytesRead: nameLenBytes } = readVarUint32(result.binary, offset);
    offset += nameLenBytes;

    const name = new TextDecoder().decode(result.binary.slice(offset, offset + nameLen));

    if (name.startsWith('.debug_')) {
      dwarfSections.push(name);
    }

    offset = nameStart + sectionSize;
  } else {
    offset += sectionSize;
  }
}

if (dwarfSections.length > 0) {
  console.log('✓ Found DWARF sections:', dwarfSections);
} else {
  console.log('  No DWARF sections found');
}

consumer.destroy();

console.log('\n=== Summary ===');
console.log('✓ Source maps are generated correctly');
console.log('✓ Source maps can be parsed with source-map library');
console.log('✓ Mappings exist between WAT and AS source');
console.log('✗ Gap: Stack traces give function index + offset, not WAT line:column');
console.log('  → Need to bridge this gap to get exact source locations');
console.log('\nNext steps:');
console.log('1. Research how to map WASM function index + offset → WAT position');
console.log('2. Check if AS compiler embeds DWARF or other debug info');
console.log('3. Consider using Binaryen to extract debug locations');
