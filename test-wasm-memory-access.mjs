// Test to understand when WASM import callbacks can access instance exports

// Test 1: Simple callback - no memory access needed
console.log('\n=== Test 1: Callback without memory access ===');
{
  const binary = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // WASM magic
    0x01, 0x00, 0x00, 0x00, // version
  ]);

  const module = await WebAssembly.compile(binary);
  console.log('✓ Module compiled');

  let instance = null;
  const imports = {
    env: {
      callback() {
        console.log('Callback called, instance is:', instance ? 'set' : 'null');
      }
    }
  };

  instance = new WebAssembly.Instance(module, imports);
  console.log('✓ Instance created');
}

// Test 2: Memory import pattern - pass memory from JS to WASM
console.log('\n=== Test 2: Import memory from JavaScript ===');
{
  // WASM that imports memory
  const binary = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
    0x02, 0x0c, 0x01,                               // import section
    0x03, 0x65, 0x6e, 0x76,                         // "env"
    0x03, 0x6d, 0x65, 0x6d,                         // "mem"
    0x02, 0x00, 0x01,                               // memory, min 1 page
  ]);

  const module = await WebAssembly.compile(binary);
  const memory = new WebAssembly.Memory({ initial: 1 });

  console.log('Memory created, buffer:', memory.buffer.byteLength, 'bytes');

  let instance = null;
  const imports = {
    env: {
      mem: memory,
      callback() {
        // Can access memory directly - it's the same object we passed in
        console.log('Callback can access memory.buffer:', memory.buffer.byteLength, 'bytes');
      }
    }
  };

  instance = new WebAssembly.Instance(module, imports);
  console.log('✓ Instance created with imported memory');
}

// Test 3: Export memory pattern - memory created by WASM
console.log('\n=== Test 3: Export memory from WASM ===');
{
  // WASM that exports memory and has a start function that calls an import
  const binary = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
    // Import section: import function "callback" from "env"
    0x02, 0x0f, 0x01,                               // import section
    0x03, 0x65, 0x6e, 0x76,                         // "env"
    0x08, 0x63, 0x61, 0x6c, 0x6c, 0x62, 0x61, 0x63, 0x6b, // "callback"
    0x00, 0x00,                                     // function, type 0
    // Type section
    0x01, 0x04, 0x01,                               // type section
    0x60, 0x00, 0x00,                               // func type: () -> ()
    // Function section: declare function 1 (internal function)
    0x03, 0x02, 0x01, 0x00,                         // function section
    // Memory section: export 1 page
    0x05, 0x03, 0x01, 0x00, 0x01,                   // memory section
    // Export section: export memory as "memory"
    0x07, 0x0a, 0x01,                               // export section
    0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79,       // "memory"
    0x02, 0x00,                                     // memory 0
    // Start section: run function 1
    0x08, 0x01, 0x01,                               // start section: function 1
    // Code section
    0x0a, 0x06, 0x01,                               // code section
    0x04, 0x00,                                     // function body
    0x10, 0x00,                                     // call function 0 (imported callback)
    0x0b,                                           // end
  ]);

  const module = await WebAssembly.compile(binary);
  console.log('✓ Module compiled with start function');

  let instance = null;
  let callbackExecuted = false;

  const imports = {
    env: {
      callback() {
        callbackExecuted = true;
        console.log('Callback called during instantiation');
        console.log('  instance variable:', instance ? 'SET' : 'NULL');

        // Try to access memory through instance
        if (instance && instance.exports.memory) {
          const mem = instance.exports.memory;
          console.log('  ✓ Can access instance.exports.memory:', mem.buffer.byteLength, 'bytes');
        } else {
          console.log('  ✗ Cannot access instance.exports.memory yet');
        }
      }
    }
  };

  console.log('Creating instance (this will call start function)...');
  instance = new WebAssembly.Instance(module, imports);

  console.log('After instantiation:');
  console.log('  Callback executed:', callbackExecuted);
  console.log('  instance.exports.memory:', instance.exports.memory.buffer.byteLength, 'bytes');
}

console.log('\n=== All tests complete ===\n');
