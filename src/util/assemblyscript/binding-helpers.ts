const STRING_EXTRACT_CHUNK_SIZE = 1024 as const;

/**
 * Decode an AssemblyScript string from WASM memory, using the length stored at
 * the beginning of the string.
 *
 * This approach is borrowed from AssemblyScript with changes for clarity.
 * AssemblyScript is released under the Apache 2.0 license, included here.
 * 
 * When a string argument crosses the boundary to JS, we get a pointer to the
 * string data in WASM memory. WASM strings store their length in the 4 bytes
 * before the string data pointer so we know how much to read from memory.
 *
 * @param memory - WebAssembly memory instance
 * @param pointer - Pointer to the start of the string
 * @returns Decoded string
 */
export function liftString(
  memory: WebAssembly.Memory,
  pointer: number,
): string | undefined {
  if (!pointer) return undefined;

  const unsigned = pointer >>> 0;
  
  const lengthPtr = unsigned - 4;

  // convert byte-based lengthPtr to uint32-based index for Uint32Array
  // with: bytes / 4 (=== bytes >>> 2) and read length
  const uint32LengthPtr = lengthPtr >>> 2;
  const byteOffsetLength = new Uint32Array(memory.buffer)[uint32LengthPtr];

  if (byteOffsetLength === 0) return '';
  
  // calculate end pointer, and convert byte-based start and end pointers
  // to uint16-based indexes for Uint16Array with: bytes / 2 (=== bytes >>> 1) 
  const uint16EndPtr = (unsigned + byteOffsetLength!) >>> 1;
  let uint16StartPtr = unsigned >>> 1;

  const memoryU16 = new Uint16Array(memory.buffer);
  let string = '';

  // extract in 1024-character chunks to avoid hitting spread operator limit
  while (uint16EndPtr - uint16StartPtr > STRING_EXTRACT_CHUNK_SIZE) {
    string += String.fromCharCode(
      ...memoryU16.subarray(uint16StartPtr, uint16StartPtr += STRING_EXTRACT_CHUNK_SIZE)
    );
  }

  return string + String.fromCharCode(...memoryU16.subarray(uint16StartPtr, uint16EndPtr));
}
