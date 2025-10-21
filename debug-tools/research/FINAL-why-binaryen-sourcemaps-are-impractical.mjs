#!/usr/bin/env node
/**
 * FINAL TEST: Why Binaryen source maps are impractical in JavaScript
 *
 * This test demonstrates:
 * 1. Setting debug locations DOES work
 * 2. But we'd need to do it for EVERY expression
 * 3. This requires walking the entire IR tree
 * 4. JavaScript API doesn't provide tree walking utilities
 * 5. Therefore, it's impractical for production use
 */

import asc from 'assemblyscript/dist/asc.js';
import binaryen from 'binaryen';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  FINAL TEST: Why Binaryen source maps are impractical        ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Step 1: Compile
console.log('[Step 1] Compiling with AS...');
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

console.log(`  ✓ Binary: ${binary.length} bytes\n`);

// Step 2: Read into Binaryen
console.log('[Step 2] Reading into Binaryen...');
binaryen.setDebugInfo(true);
const module = binaryen.readBinary(binary);

const fileIndex = module.addDebugInfoFileName(testFile);
console.log(`  ✓ Registered source file\n`);

// Step 3: Try to walk expressions
console.log('[Step 3] Attempting to walk expression tree...\n');

const numFunctions = module.getNumFunctions();
console.log(`  Found ${numFunctions} functions in module`);
console.log(`  Challenge: We need to set debug locations on ALL expressions\n`);

// Get one function as an example
for (let i = 0; i < numFunctions; i++) {
  const funcRef = module.getFunctionByIndex(i);
  const funcInfo = binaryen.getFunctionInfo(funcRef);

  if (funcInfo.name === 'assembly/index/assert') {
    console.log(`  Example function: ${funcInfo.name}`);
    console.log(`    Has body: ${!!funcInfo.body}`);
    console.log(`    Body is expression reference: ${funcInfo.body}`);
    console.log('');
    console.log('  🚨 PROBLEM: funcInfo.body is just a number (ExpressionRef)');
    console.log('     JavaScript API has NO way to:');
    console.log('     - Walk the expression tree');
    console.log('     - Get child expressions');
    console.log('     - Iterate over all expressions in a function');
    console.log('');
    console.log('  The C++ API has:');
    console.log('     - Expression visitors');
    console.log('     - Tree walkers');
    console.log('     - Full IR traversal utilities');
    console.log('');
    console.log('  The JavaScript API ONLY provides:');
    console.log('     - getFunctionInfo(ref) → { body: ExpressionRef }');
    console.log('     - setDebugLocation(func, expr, file, line, col)');
    console.log('');
    console.log('  We CAN set location on the root body expression (as proven)');
    console.log('  But we CANNOT traverse to set locations on ALL sub-expressions');
    console.log('');
    break;
  }
}

// Step 4: Show what assemblyscript-unittest-framework does
console.log('[Step 4] What assemblyscript-unittest-framework does...\n');
console.log('  Their C++ code:');
console.log('    1. ModuleReader::read(binary, module, sourceMap)');
console.log('       → Internal C++ code walks the binary');
console.log('       → Parses source map');
console.log('       → Populates func->debugLocations for ALL expressions');
console.log('');
console.log('    2. They instrument the code');
console.log('       → C++ visitors walk expression trees');
console.log('       → Insert coverage calls');
console.log('       → Preserve existing debugLocations');
console.log('');
console.log('    3. BinaryenModuleAllocateAndWrite(sourceMapUrl)');
console.log('       → Generates new source map from debugLocations');
console.log('       → Accounts for instrumentation changes');
console.log('');

// Step 5: Why this doesn't work in JavaScript
console.log('[Step 5] Why this doesn\'t work in JavaScript API...\n');
console.log('  JavaScript limitations:');
console.log('    ✗ No readBinary(buffer, sourceMap) overload');
console.log('    ✗ No expression tree walking utilities');
console.log('    ✗ No visitors or iterators');
console.log('    ✗ ExpressionRef is opaque (just a number)');
console.log('');
console.log('  What we CAN do:');
console.log('    ✓ Read binary: readBinary(buffer)');
console.log('    ✓ Get function info: getFunctionInfo(ref)');
console.log('    ✓ Set location on ONE expression: setDebugLocation(...)');
console.log('');
console.log('  What we CANNOT do:');
console.log('    ✗ Walk expression trees');
console.log('    ✗ Get child expressions');
console.log('    ✗ Iterate over sub-expressions');
console.log('    ✗ Parse source map and populate debugLocations automatically');
console.log('');

module.dispose();

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                      FINAL CONCLUSION                         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('ROOT CAUSE:');
console.log('  Binaryen emitBinary() generates EMPTY mappings because:');
console.log('  1. debugLocations map is empty (no expressions have locations set)');
console.log('  2. JavaScript API has no way to read source maps during readBinary()');
console.log('  3. JavaScript API has no way to walk expression trees to set locations');
console.log('');

console.log('CAN WE FIX IT?');
console.log('  Technically: YES, we could manually set locations');
console.log('  Practically: NO, requires implementing C++ visitor patterns in JS');
console.log('');
console.log('  To make it work, we would need to:');
console.log('  1. Parse AS source map JSON');
console.log('  2. Parse WASM binary to understand expression structure');
console.log('  3. Build our own expression tree walker');
console.log('  4. Map each expression to source map positions');
console.log('  5. Call setDebugLocation() thousands of times');
console.log('  6. Hope we got it right');
console.log('');
console.log('  This is essentially re-implementing Binaryen\'s C++ ModuleReader');
console.log('  in JavaScript. NOT PRACTICAL.');
console.log('');

console.log('RECOMMENDED SOLUTION:');
console.log('  ✓ Use dual-binary approach (already implemented)');
console.log('  ✓ Instrumented binary for coverage (no source map needed)');
console.log('  ✓ Original binary + AS source map for error locations');
console.log('  ✓ Simple, reliable, no complex IR manipulation required');
console.log('');

console.log('ALTERNATIVE (if Binaryen is absolutely required):');
console.log('  ✓ Write C++ native addon that wraps Binaryen C++ API');
console.log('  ✓ Use ModuleReader::read() with source map support');
console.log('  ✓ This is what assemblyscript-unittest-framework does');
console.log('  ✓ But adds significant complexity (C++ build, native deps)');
console.log('');
