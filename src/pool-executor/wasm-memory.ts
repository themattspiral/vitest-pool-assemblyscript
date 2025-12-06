/**
 * WASM Memory Utilities
 *
 * Utilities for working with WebAssembly memory, particularly for
 * decoding AssemblyScript strings (UTF-16LE encoded).
 */

// Reusable TextDecoder for UTF-16LE strings
const utf16leDecoder = new TextDecoder('utf-16le');

/**
 * Create a WebAssembly memory instance
 * Used for imported memory pattern (matches --importMemory flag)
 */
export function createMemory(initialPages = 1): WebAssembly.Memory {
  return new WebAssembly.Memory({ initial: initialPages });
}

/**
 * Decode an AssemblyScript string from WASM memory
 *
 * AssemblyScript stores strings as UTF-16LE in linear memory.
 * This function reads the string from memory given a pointer and length.
 *
 * @param memory - WebAssembly memory instance
 * @param ptr - Pointer to the start of the string
 * @param length - Length of the string in characters (not bytes)
 * @returns Decoded string
 */
export function decodeString(
  memory: WebAssembly.Memory,
  ptr: number,
  length: number
): string {
  // Each character is 2 bytes (UTF-16LE)
  const bytes = new Uint8Array(memory.buffer).slice(ptr, ptr + length * 2);
  return utf16leDecoder.decode(bytes);
}

/**
 * Decode an AssemblyScript string from WASM memory (null-terminated)
 *
 * When the length is unknown (e.g., reading from __get_test_name),
 * we need to find the null terminator to determine the actual length.
 *
 * @param memory - WebAssembly memory instance
 * @param ptr - Pointer to the start of the string
 * @param maxLength - Maximum length to search for null terminator (safety limit)
 * @returns Decoded string
 */
export function decodeStringNullTerminated(
  memory: WebAssembly.Memory,
  ptr: number,
  maxLength = 1000
): string {
  // Read up to maxLength characters to find null terminator
  const bytes = new Uint8Array(memory.buffer).slice(ptr, ptr + maxLength * 2);

  // Find null terminator (two zero bytes for UTF-16LE)
  let actualLength = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) {
      break;
    }
    actualLength = i + 2;
  }

  // Decode only up to the null terminator
  return utf16leDecoder.decode(bytes.slice(0, actualLength));
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
  const errorMsg = msgPtr ? decodeStringNullTerminated(memory, msgPtr) : 'Unknown error';
  const filePath = filePtr ? decodeStringNullTerminated(memory, filePtr) : null;

  // Only include location if we have meaningful file info (not null/empty and not at 0:0)
  const hasLocation = filePath && filePath !== 'unknown' && (line !== 0 || column !== 0);
  const location = hasLocation ? `${filePath}:${line}:${column}` : null;

  return {
    message: errorMsg,
    location: location,
  };
}
