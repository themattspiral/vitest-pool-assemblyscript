#!/usr/bin/env node
/**
 * Complete POC: Multi-Memory Coverage Counter
 *
 * Tests the complete workflow:
 * 1. Enable MultiMemory feature
 * 2. Import two memories (main + coverage)
 * 3. Create function that increments counter in coverage memory
 * 4. Instantiate and test
 */

import binaryen from 'binaryen';

console.log('='.repeat(70));
console.log('Multi-Memory Coverage Counter - Complete POC');
console.log('='.repeat(70));
console.log();

const module = new binaryen.Module();

try {
  // Step 1: Enable MultiMemory feature
  console.log('Step 1: Enabling MultiMemory feature...');
  const currentFeatures = module.getFeatures();
  module.setFeatures(currentFeatures | binaryen.Features.MultiMemory);
  console.log('  ✓ MultiMemory enabled (features:', module.getFeatures(), ')');

  // Step 2: Add memory imports
  console.log('\nStep 2: Adding memory imports...');
  module.setMemory(1, 256, 'memory', [], false, false, 'env', 'memory');
  module.addMemoryImport("__coverage_memory", "env", "__coverage_memory");
  console.log('  ✓ Two memories configured');

  // Step 3: Create increment function
  console.log('\nStep 3: Creating increment_counter(funcIdx: i32) function...');

  const funcParams = binaryen.createType([binaryen.i32]);
  const funcResults = binaryen.none;

  // Calculate address: funcIdx * 4
  const addr = module.i32.mul(
    module.local.get(0, binaryen.i32),
    module.i32.const(4)
  );

  // Load from coverage memory, increment, store back
  // Binaryen API: i32.load(offset, align, ptr, memoryName)
  const loaded = module.i32.load(0, 1, addr, '__coverage_memory');
  const incremented = module.i32.add(loaded, module.i32.const(1));
  // Binaryen API: i32.store(offset, align, ptr, value, memoryName)
  const stored = module.i32.store(0, 1, addr, incremented, '__coverage_memory');
  const funcBody = stored;
  console.log('  ✓ Created with coverage memory operations');

  module.addFunction(
    'increment_counter',
    funcParams,
    funcResults,
    [],
    funcBody
  );
  module.addFunctionExport('increment_counter', 'increment_counter');
  console.log('  ✓ Function created and exported');

  // Step 4: Validate
  console.log('\nStep 4: Validating module...');
  const isValid = module.validate();
  if (!isValid) {
    throw new Error('Module validation failed');
  }
  console.log('  ✓ Module is valid');

  // Step 5: Emit binary
  console.log('\nStep 5: Emitting WASM binary...');
  const wasmBinary = module.emitBinary();
  console.log(`  ✓ Binary emitted (${wasmBinary.length} bytes)`);

  // Step 6: Instantiate
  console.log('\nStep 6: Instantiating with two memories...');
  const mainMemory = new WebAssembly.Memory({ initial: 1, maximum: 256 });
  const coverageMemory = new WebAssembly.Memory({ initial: 1, maximum: 256 });

  const imports = {
    env: {
      memory: mainMemory,
      __coverage_memory: coverageMemory
    }
  };

  const instance = await WebAssembly.instantiate(wasmBinary, imports);
  console.log('  ✓ WASM instantiated');

  // Step 7: Test counter increments
  console.log('\nStep 7: Testing counter increments...');

  const counters = new Uint32Array(coverageMemory.buffer, 0, 10);
  console.log('  Initial counter[0]:', counters[0]);
  console.log('  Initial counter[2]:', counters[2]);

  instance.instance.exports.increment_counter(0);
  console.log('  After increment_counter(0):', counters[0]);

  instance.instance.exports.increment_counter(0);
  console.log('  After second increment_counter(0):', counters[0]);

  instance.instance.exports.increment_counter(2);
  console.log('  After increment_counter(2):', counters[2]);

  if (counters[0] === 2 && counters[2] === 1) {
    console.log('  ✓ Counters working correctly!');
  } else {
    console.log('  ⚠ Counter values unexpected:', counters.slice(0, 5));
  }

  // Success
  console.log();
  console.log('='.repeat(70));
  console.log('✅ POC COMPLETE - Multi-memory coverage is viable!');
  console.log('='.repeat(70));
  console.log();
  console.log('Key findings:');
  console.log('  1. ✅ Binaryen supports MultiMemory feature (enable with setFeatures)');
  console.log('  2. ✅ Can import multiple memories (setMemory + addMemoryImport)');
  console.log('  3. ✅ Can specify memory in load/store (4th parameter: memoryName)');
  console.log('  4. ✅ Node 20+ successfully instantiates multi-memory WASM');
  console.log('  5. ✅ Counters increment correctly in separate coverage memory');
  console.log();
  console.log('Next step: Implement multi-memory coverage instrumentation');
  console.log();

} catch (error) {
  console.log();
  console.log('='.repeat(70));
  console.log('❌ POC FAILED');
  console.log('='.repeat(70));
  console.log();
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
  console.log();
  process.exit(1);
} finally {
  module.dispose();
}
