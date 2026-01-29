import { liftString } from '../util/assemblyscript/binding-helpers.js';

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
