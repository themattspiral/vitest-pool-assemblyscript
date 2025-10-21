/**
 * Debug script to inspect AS compiler source map output
 */

import asc from 'assemblyscript/dist/asc.js';
import { SourceMapConsumer } from 'source-map';

const testFile = process.argv[2] || 'tests/assembly/crash-isolation.as.test.ts';

console.log('Compiling:', testFile);

let sourceMapJson = null;

const result = await asc.main([
  testFile,
  '--outFile', 'temp.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',
  '--exportStart', '_start',
], {
  stdout: { write: () => true },
  stderr: { write: () => true },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm.map') && typeof contents === 'string') {
      sourceMapJson = contents;
    }
  },
});

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

if (!sourceMapJson) {
  console.error('No source map generated');
  process.exit(1);
}

console.log('\n=== SOURCE MAP JSON ===');
const sourceMapData = JSON.parse(sourceMapJson);
console.log('Version:', sourceMapData.version);
console.log('Sources:', sourceMapData.sources);
console.log('Names:', sourceMapData.names?.slice(0, 20), '... (showing first 20)');
console.log('Mappings length:', sourceMapData.mappings?.length);
console.log('\n=== SAMPLE MAPPINGS ===');

const consumer = await new SourceMapConsumer(sourceMapData);

console.log('\nAll mappings:');
let count = 0;
consumer.eachMapping((mapping) => {
  if (count < 30) {  // Show first 30 mappings
    console.log({
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: mapping.source ? {
        source: mapping.source,
        line: mapping.originalLine,
        column: mapping.originalColumn,
        name: mapping.name
      } : null
    });
  }
  count++;
});

console.log(`\n... total ${count} mappings`);

console.log('\n=== TEST: Look up specific generated positions ===');
// Try a few different positions
for (let line = 1; line <= 10; line++) {
  const pos = consumer.originalPositionFor({ line, column: 0 });
  if (pos.source) {
    console.log(`Generated ${line}:0 -> ${pos.source}:${pos.line}:${pos.column}`);
  }
}

console.log('\n=== TEST: Search for test file mappings ===');
// Find all mappings that point to our test file
count = 0;
consumer.eachMapping((mapping) => {
  if (mapping.source && mapping.source.includes('crash-isolation')) {
    console.log({
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: {
        source: mapping.source,
        line: mapping.originalLine,
        column: mapping.originalColumn,
      }
    });
    count++;
  }
});
console.log(`Found ${count} mappings for crash-isolation test file`);

consumer.destroy();
