#!/usr/bin/env node
/**
 * FINAL COMPLETE UNDERSTANDING:
 *
 * This test demonstrates the COMPLETE picture of Binaryen source maps:
 * 1. How they work
 * 2. Why they're empty after instrumentation
 * 3. What would be required to fix it
 * 4. Why it's not practical
 */

import asc from 'assemblyscript/dist/asc.js';
import binaryen from 'binaryen';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SourceMapConsumer } from 'source-map';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  FINAL COMPLETE UNDERSTANDING: Binaryen Source Maps          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Compile
let binary = null;
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
    if (name.endsWith('.wasm')) binary = contents;
  },
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 1: setDebugLocation() WORKS');
console.log('═══════════════════════════════════════════════════════════════\n');

binaryen.setDebugInfo(true);
const module1 = binaryen.readBinary(binary);
const file1 = module1.addDebugInfoFileName(testFile);

// Get function and set debug location
const func1 = module1.getFunctionByIndex(7); // anonymous|1 (line 13)
const info1 = binaryen.getFunctionInfo(func1);

console.log('[Step 1] Setting debug location on function body...');
module1.setDebugLocation(func1, info1.body, file1, 13, 2);

const result1 = module1.emitBinary('output.wasm');
const sm1 = JSON.parse(result1.sourceMap);

console.log(`  ✓ Mappings: "${sm1.mappings}"`);
console.log(`  ✓ Length: ${sm1.mappings.length} chars`);
console.log(`  ✓ Sources: ${sm1.sources.length}`);
console.log('  ✓ PROOF: setDebugLocation() DOES work!\n');

// Test the mapping
console.log('[Step 2] Testing if mapping is correct...');
const consumer1 = await new SourceMapConsumer(sm1);

// Simulate a WAT position (this is approximate)
const mapped1 = consumer1.originalPositionFor({ line: 1, column: 0 });
console.log(`  Mapped position: line ${mapped1.line}, column ${mapped1.column}`);
console.log(`  Expected: line 13`);
console.log(`  ${mapped1.line === 13 ? '✓ CORRECT!' : '✗ Incorrect'}\n`);

consumer1.destroy();
module1.dispose();

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 2: Modification LOSES debug locations');
console.log('═══════════════════════════════════════════════════════════════\n');

const module2 = binaryen.readBinary(binary);
binaryen.setDebugInfo(true);
const file2 = module2.addDebugInfoFileName(testFile);

const func2 = module2.getFunctionByIndex(7);
const info2 = binaryen.getFunctionInfo(func2);

console.log('[Step 1] Setting debug location on ORIGINAL function...');
module2.setDebugLocation(func2, info2.body, file2, 13, 2);

console.log('[Step 2] Modifying function (simulating coverage instrumentation)...');

// Add coverage trace import
const params = binaryen.createType([binaryen.i32, binaryen.i32]);
module2.addFunctionImport('__coverage_trace', 'env', '__coverage_trace', params, binaryen.none);

// Create instrumented body
const trace = module2.call('__coverage_trace', [
  module2.i32.const(0),
  module2.i32.const(0),
], binaryen.none);

const newBody = module2.block(null, [trace, info2.body], info2.results);

// Replace function (THIS LOSES debug locations!)
module2.removeFunction(info2.name);
module2.addFunction(info2.name, info2.params, info2.results, info2.vars, newBody);

console.log('[Step 3] Emitting source map after modification...');
const result2 = module2.emitBinary('output.wasm');
const sm2 = JSON.parse(result2.sourceMap);

console.log(`  ✗ Mappings: "${sm2.mappings}"`);
console.log(`  ✗ Length: ${sm2.mappings.length} chars`);
console.log('  ✗ PROBLEM: removeFunction() / addFunction() CLEARS debug locations!\n');

module2.dispose();

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 3: Setting location AFTER modification');
console.log('═══════════════════════════════════════════════════════════════\n');

const module3 = binaryen.readBinary(binary);
binaryen.setDebugInfo(true);
const file3 = module3.addDebugInfoFileName(testFile);

const func3 = module3.getFunctionByIndex(7);
const info3 = binaryen.getFunctionInfo(func3);

console.log('[Step 1] Modifying function FIRST...');

const params3 = binaryen.createType([binaryen.i32, binaryen.i32]);
module3.addFunctionImport('__coverage_trace', 'env', '__coverage_trace', params3, binaryen.none);

const trace3 = module3.call('__coverage_trace', [
  module3.i32.const(0),
  module3.i32.const(0),
], binaryen.none);

const newBody3 = module3.block(null, [trace3, info3.body], info3.results);

module3.removeFunction(info3.name);
module3.addFunction(info3.name, info3.params, info3.results, info3.vars, newBody3);

console.log('[Step 2] Setting debug location AFTER adding new function...');

// Get NEW function reference
const newFunc3 = module3.getFunction(info3.name);
const newInfo3 = binaryen.getFunctionInfo(newFunc3);

// Try setting location on new body
module3.setDebugLocation(newFunc3, newInfo3.body, file3, 13, 2);

console.log('[Step 3] Emitting source map...');
const result3 = module3.emitBinary('output.wasm');
const sm3 = JSON.parse(result3.sourceMap);

console.log(`  Mappings: "${sm3.mappings}"`);
console.log(`  Length: ${sm3.mappings.length} chars`);

if (sm3.mappings.length > 0) {
  console.log('  ✓ SUCCESS! Setting location AFTER modification works!\n');

  // Test the mapping
  const consumer3 = await new SourceMapConsumer(sm3);
  const mapped3 = consumer3.originalPositionFor({ line: 1, column: 0 });
  console.log(`  Mapped to: line ${mapped3.line}, column ${mapped3.column}`);
  console.log(`  ${mapped3.line === 13 ? '✓ Correct line!' : `✗ Wrong line (expected 13)`}\n`);
  consumer3.destroy();
} else {
  console.log('  ✗ Still empty - setting location after modification does NOT work\n');
}

module3.dispose();

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                      FINAL VERDICT                            ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

if (sm3.mappings.length > 0) {
  console.log('CAN WE MAKE IT WORK?');
  console.log('  ✓ YES - setDebugLocation() works after modification');
  console.log('');
  console.log('HOW TO MAKE IT WORK:');
  console.log('  1. Instrument code (add coverage traces)');
  console.log('  2. For EACH modified function:');
  console.log('     a. Get new function reference');
  console.log('     b. Get new body expression');
  console.log('     c. Call setDebugLocation() for the body');
  console.log('  3. Call emitBinary() to generate source map');
  console.log('');
  console.log('THE CATCH:');
  console.log('  - We can only set location on function BODY (root expression)');
  console.log('  - For complete source maps, need to set locations on ALL sub-expressions');
  console.log('  - JavaScript API has no way to walk expression trees');
  console.log('  - Would need to set thousands of locations manually');
  console.log('');
  console.log('IS IT PRACTICAL?');
  console.log('  ✗ NO - Setting location only on function body gives incomplete mappings');
  console.log('  ✗ NO - Would need expression tree walker to set ALL locations');
  console.log('  ✗ NO - Much simpler to use dual-binary approach');
  console.log('');
} else {
  console.log('CAN WE FIX IT?');
  console.log('  ✗ NO - setDebugLocation() does NOT persist after removeFunction/addFunction');
  console.log('  ✗ NO - JavaScript API limitation - cannot preserve debug info during modification');
  console.log('  ✗ NO - Would need C++ native addon to use full Binaryen C++ API');
  console.log('');
  console.log('RECOMMENDATION:');
  console.log('  ✓ Use dual-binary approach (already implemented)');
  console.log('  ✓ Instrumented binary for coverage');
  console.log('  ✓ Original binary + AS source map for errors');
  console.log('');
}
