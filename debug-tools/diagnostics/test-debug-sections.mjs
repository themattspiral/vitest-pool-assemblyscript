#!/usr/bin/env node
/**
 * TEST: What debug sections are in the binary?
 *
 * Check what --debug actually adds to the binary
 */

import asc from 'assemblyscript/dist/asc.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  TEST: What debug sections are in the WASM binary?           ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Compile with --debug
console.log('[Step 1] Compiling WITH --debug...');
let binaryWithDebug = null;

await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--exportStart', '_start',
  '--exportTable',
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) binaryWithDebug = contents;
  },
});

// Parse WASM sections manually
function parseWasmSections(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Check magic number
  const magic = view.getUint32(0, true);
  if (magic !== 0x6d736100) { // \0asm
    throw new Error('Invalid WASM magic number');
  }

  // Check version
  const version = view.getUint32(4, true);
  console.log(`  WASM version: ${version}`);

  let offset = 8;
  const sections = [];

  while (offset < buffer.length) {
    const sectionId = view.getUint8(offset);
    offset += 1;

    // Read LEB128 encoded size
    let size = 0;
    let shift = 0;
    let byte;
    do {
      byte = view.getUint8(offset++);
      size |= (byte & 0x7F) << shift;
      shift += 7;
    } while (byte & 0x80);

    const sectionNames = {
      0: 'Custom',
      1: 'Type',
      2: 'Import',
      3: 'Function',
      4: 'Table',
      5: 'Memory',
      6: 'Global',
      7: 'Export',
      8: 'Start',
      9: 'Element',
      10: 'Code',
      11: 'Data',
      12: 'DataCount',
    };

    const sectionName = sectionNames[sectionId] || `Unknown(${sectionId})`;

    // For custom sections, read the name
    let customName = '';
    if (sectionId === 0) {
      const nameStart = offset;
      let nameLen = 0;
      let nameShift = 0;
      let nameByte;
      do {
        nameByte = view.getUint8(offset++);
        nameLen |= (nameByte & 0x7F) << nameShift;
        nameShift += 7;
      } while (nameByte & 0x80);

      const nameBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, nameLen);
      customName = new TextDecoder().decode(nameBytes);
      offset = nameStart; // Reset offset
    }

    sections.push({
      id: sectionId,
      name: sectionName,
      customName,
      size,
      offset,
    });

    offset += size;
  }

  return sections;
}

const sections = parseWasmSections(binaryWithDebug);
console.log(`\n  Found ${sections.length} sections:\n`);

sections.forEach(section => {
  const nameStr = section.customName ? ` ("${section.customName}")` : '';
  console.log(`  [${section.id}] ${section.name}${nameStr}`);
  console.log(`      Size: ${section.size} bytes, Offset: ${section.offset}`);
});

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  Custom sections (these contain debug info):                 ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const customSections = sections.filter(s => s.id === 0);
customSections.forEach(section => {
  console.log(`  "${section.customName}" - ${section.size} bytes`);
});

if (customSections.length === 0) {
  console.log('  (none found)');
}

console.log('\n');
