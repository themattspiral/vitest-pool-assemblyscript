/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import type { TestResult } from '../types.js';
import { debug } from '../utils/debug.mjs';
import { createWebAssemblyCallSite } from '../utils/source-maps.js';
import type { RawSourceMap } from 'source-map';

/**
 * Enhance error with source map locations
 *
 * Maps V8 WAT positions to AssemblyScript source locations using source maps.
 * Updates error message and stack trace with accurate file:line:column information.
 *
 * @param currentTest - Test result with raw call stack
 * @param sourceMapJson - Parsed source map
 * @param testFileName - Name of the test file being executed (used to find primary error location)
 */
export async function enhanceErrorWithSourceMap(
  currentTest: TestResult,
  sourceMapJson: RawSourceMap,
  testFileName: string
): Promise<void> {
  if (!currentTest.rawCallStack || currentTest.rawCallStack.length === 0) {
    return;
  }

  debug('[Executor] Mapping', currentTest.rawCallStack.length, 'call sites to source locations');

  const mappedStack = await Promise.all(
    currentTest.rawCallStack.map(callSite =>
      createWebAssemblyCallSite(callSite, sourceMapJson)
    )
  );

  // Filter out null results (non-WASM call sites)
  currentTest.sourceStack = mappedStack.filter((cs): cs is NonNullable<typeof cs> => cs !== null);

  debug('[Executor] Mapped to', currentTest.sourceStack.length, 'source locations');

  // Format error with source location
  if (currentTest.error && currentTest.sourceStack.length > 0) {
    const originalMessage = currentTest.error.message;

    // Extract basename from test file path for matching
    // testFileName is absolute like /path/to/file.as.test.ts
    // frame.fileName from source maps is relative like output/tests/assembly/file.as.test.ts
    const testFileBasename = testFileName.split('/').pop() || testFileName;

    // Find the first frame from the test file being executed
    // This is the actual user code location, not framework/runtime code
    const primaryFrame = currentTest.sourceStack.find(frame => {
      const frameBasename = frame.fileName.split('/').pop();
      return frameBasename === testFileBasename;
    }) || currentTest.sourceStack[0]!; // Fallback to first frame if no match

    // Extract short function name from AS's namespace format
    // "assembly/index/assert" -> "assert"
    // "tests/assembly/file.as.test/myFunction" -> "myFunction"
    const getShortFunctionName = (fullName: string): string => {
      const parts = fullName.split('/');
      return parts[parts.length - 1] || fullName;
    };

    const primaryFunctionName = getShortFunctionName(primaryFrame.functionName);

    // Create a new error with enhanced message including function name and source location
    const enhancedError = new Error(`${originalMessage}\n → ${primaryFunctionName} (${primaryFrame.fileName}:${primaryFrame.lineNumber}:${primaryFrame.columnNumber})\n`);

    // Build a clean stack trace with source locations and short function names
    // Format: "Error: message\n    at functionName (file:line:column)\n    at ..."
    // This matches standard Node.js stack trace format
    let stackTrace = `Error: ${originalMessage}\n`;
    for (const frame of currentTest.sourceStack) {
      const shortName = getShortFunctionName(frame.functionName);
      stackTrace += `    at ${shortName} (${frame.fileName}:${frame.lineNumber}:${frame.columnNumber})\n`;
    }
    enhancedError.stack = stackTrace;

    currentTest.error = enhancedError;

    debug('[Executor] Enhanced error with source location');
  }
}
