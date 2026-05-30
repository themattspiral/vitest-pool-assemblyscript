import {
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME
} from '../types/constants.js';
import type { WASMModuleMemoryRequirements } from '../types/types.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';

const DEFAULT_MEMORY_REQS: WASMModuleMemoryRequirements = {
  testMemory: { initialPages: 1 },
  coverageMemory: { initialPages: 1 }
} as const;
const TEST_MEM_KEY = 'env.memory' as const;
const COVERAGE_MEM_KEY = `${AS_POOL_WASM_IMPORTS_MODULE_NAME}.${AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME}`;

/**
 * Create a WebAssembly memory instance
 * Used for imported memory pattern (matches --importMemory flag)
 */
export function createMemory(initialPages: number, maximumPages?: number): WebAssembly.Memory {
  return new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages });
}

/**
 * Decode AssemblyScript abort information
 *
 * Helper for handling abort() calls from AssemblyScript runtime.
 * Decodes the error message and file path from WASM memory.
 *
 * @param memory - WebAssembly memory instance
 * @param msgPtr - Pointer to error message string (or 0 if none)
 * @param filePtr - Pointer to file path string (or 0 if none)
 * @param line - Line number where abort occurred
 * @param column - Column number where abort occurred
 * @returns Decoded message and location (null if no meaningful location info)
 */
export function decodeAbortInfo(
  memory: WebAssembly.Memory,
  msgPtr: number,
  filePtr: number,
  line: number,
  column: number
): { message: string; location: string | null } {
  const errorMsg = liftString(memory, msgPtr) ?? 'Unknown error';  
  const filePath = liftString(memory, filePtr);

  // Only include location if we have meaningful file info (not null/empty and not at 0:0)
  const hasLocation = filePath && filePath !== 'unknown' && (line !== 0 || column !== 0);
  const location = hasLocation ? `${filePath}:${line}:${column}` : null;

  return {
    message: errorMsg,
    location: location,
  };
}

export function getWasmMemoryRequirements(u8: Uint8Array): WASMModuleMemoryRequirements {
  if (u8[0] !== 0x00 || u8[1] !== 0x61 || u8[2] !== 0x73 || u8[3] !== 0x6d) {
    throw new Error("Not a valid WebAssembly binary");
  }

  const reqs: WASMModuleMemoryRequirements = {
    testMemory: { ...DEFAULT_MEMORY_REQS.testMemory },
    coverageMemory: { ...DEFAULT_MEMORY_REQS.coverageMemory }
  };

  let offset = 8;
  const decoder = new TextDecoder('utf-8');

  function readVarUint() {
    let result = 0;
    let shift = 0;
    while (true) {
      const byte = u8[offset++]!;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  while (offset < u8.length) {
    const sectionId = u8[offset++];
    const sectionLength = readVarUint();
    const nextSectionOffset = offset + sectionLength;

    if (sectionId === 2) { // 2 = Import Section
      const numImports = readVarUint();

      for (let i = 0; i < numImports; i++) {
        // Extract and decode Module Name
        const modLen = readVarUint();
        const modName = decoder.decode(u8.subarray(offset, offset + modLen));
        offset += modLen;

        // Extract and decode Field/Memory Name
        const fieldLen = readVarUint();
        const fieldName = decoder.decode(u8.subarray(offset, offset + fieldLen));
        offset += fieldLen;

        const kind = u8[offset++];
        
        if (kind === 0x02) { // Memory Import
          const flags = u8[offset++];
          const initialPages = readVarUint();
          
          const hasMaximum = (flags! & 0x01) === 0x01;
          const maximumPages = hasMaximum ? readVarUint() : undefined;
          
          const key = `${modName}.${fieldName}`;
          if (key === TEST_MEM_KEY) {
            reqs.testMemory = { initialPages, maximumPages };
          } else if (key === COVERAGE_MEM_KEY) {
            reqs.coverageMemory = { initialPages, maximumPages }
          }
        } else if (kind === 0x00) { // Function
          readVarUint();
        } else if (kind === 0x01) { // Table
          offset++;
          const flags = u8[offset++];
          readVarUint();
          if (flags! & 1) readVarUint();
        } else if (kind === 0x03) { // Global
          offset += 2;
        }
      }
      // We can stop processing once the import section is completely parsed
      return reqs;
    }
    offset = nextSectionOffset;
  }
  return reqs; 
}
