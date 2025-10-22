/**
 * Test if Binaryen can detect @inline functions
 */
import binaryen from 'binaryen';
import asc from 'assemblyscript/dist/asc.js';

const testCode = `
@inline
function addInlined(a: i32, b: i32): i32 {
  return a + b;
}

function addNormal(a: i32, b: i32): i32 {
  return a + b;
}

export function test(): i32 {
  return addInlined(1, 2) + addNormal(3, 4);
}
`;

let binary = null;

await asc.main([
  'test.ts',
  '--runtime', 'stub',
  '--optimizeLevel', '0',
  '--outFile', 'test.wasm',
], {
  readFile: (name) => {
    if (name === 'test.ts') return testCode;
    return null;
  },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  stdout: { write: () => {} },
  stderr: { write: (text) => console.error(text) },
});

if (!binary) {
  console.log('Failed to compile test code');
  process.exit(1);
}

console.log('Compiled WASM binary:', binary.length, 'bytes');

// Load into Binaryen
const module = binaryen.readBinary(binary);

console.log('\n=== Functions in module ===');
const numFunctions = module.getNumFunctions();
for (let i = 0; i < numFunctions; i++) {
  const funcRef = module.getFunctionByIndex(i);
  const funcInfo = binaryen.getFunctionInfo(funcRef);

  console.log(`Function ${i}: ${funcInfo.name}`);
  console.log('  - Has body:', !!funcInfo.body);
  console.log('  - Module:', funcInfo.module);
  console.log('  - Base:', funcInfo.base);
}

console.log('\n=== Analysis ===');
console.log('Binaryen operates on WASM bytecode, not AST.');
console.log('At this level, @inline decorators have already been processed by AS compiler.');
console.log('We CANNOT detect or strip @inline at Binaryen level.');
console.log('\n✅ Conclusion: Must use AS Transform for @inline stripping');
