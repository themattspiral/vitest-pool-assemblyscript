/**
 * Test Source Map Parsing
 *
 * Validates source map generation and parsing for exact error location mapping.
 */

import { compileFile } from '../src/compiler.ts';
import { SourceMapConsumer } from 'source-map';
import { join } from 'path';

async function main() {
  // Test file path
  const TEST_FILE = join(process.cwd(), 'tests/assembly/crash-isolation.as.test.ts');

  console.log('=== Source Map Parsing Test ===\n');
  console.log('Test file:', TEST_FILE);

  // 1. Compile with source maps
  console.log('\n[1] Compiling with source maps...');
  const result = await compileFile(TEST_FILE);
  console.log('✓ Compilation successful');
  console.log('  Binary size:', result.binary.length, 'bytes');
  console.log('  Source map size:', result.sourceMap?.length || 0, 'bytes');

  if (!result.sourceMap) {
    console.error('✗ No source map generated!');
    process.exit(1);
  }

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
  console.log('\n[4] Testing position mappings (WAT line:column → AS source)...');

  const testPositions = [
    { line: 1, column: 0 },
    { line: 10, column: 0 },
    { line: 50, column: 0 },
    { line: 100, column: 0 },
    { line: 200, column: 0 },
  ];

  for (const pos of testPositions) {
    const original = consumer.originalPositionFor(pos);
    if (original.source) {
      console.log(`  WAT ${pos.line}:${pos.column} → AS ${original.source}:${original.line}:${original.column} (${original.name || 'no name'})`);
    }
  }

  // 5. Get all mappings to understand the data
  console.log('\n[5] Analyzing all mappings...');
  const allMappings: any[] = [];
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

  console.log('  Total mappings:', allMappings.length);
  if (allMappings.length > 0) {
    console.log('  First mapping:', JSON.stringify(allMappings[0], null, 2));
    console.log('  Last mapping:', JSON.stringify(allMappings[allMappings.length - 1], null, 2));

    // Find a mapping with actual source info
    const realMapping = allMappings.find(m => m.original.source && m.original.line > 0);
    if (realMapping) {
      console.log('  Sample real mapping:', JSON.stringify(realMapping, null, 2));
    }
  }

  consumer.destroy();

  console.log('\n=== Key Finding ===');
  console.log('The source map maps WAT text positions (line:column) to AS source (file:line:column).');
  console.log('\nThe Problem:');
  console.log('  WASM error stacks give: function index + byte offset');
  console.log('  Source maps expect: WAT line:column');
  console.log('  → Need to bridge: function index + offset → WAT line:column');
  console.log('\nSolutions:');
  console.log('  1. assemblyscript-unittest-framework: Uses Binaryen to extract debug locations directly');
  console.log('  2. DWARF debug info: Parse DWARF sections if present');
  console.log('  3. Node.js stack API: Use Error.prepareStackTrace to get line:column from V8');
}

main().catch(console.error);
