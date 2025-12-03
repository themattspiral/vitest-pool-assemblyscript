/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import type { TestResult, AssemblyScriptTestError } from '../types.js';
import { ERROR_NAMES } from '../types.js';
import { debug } from '../utils/debug.mjs';
import { createWebAssemblyCallSite } from '../utils/source-maps.js';
import type { RawSourceMap } from 'source-map';
import type { ParsedStack } from '@vitest/utils';
import { basename } from 'node:path';

/**
 * Enhance error with source map locations
 *
 * Maps V8 WAT positions to AssemblyScript source locations using source maps.
 * Updates error message and stack trace with accurate file:line:column information.
 *
 * @param currentTest - Test result with raw call stack
 * @param sourceMapJson - Parsed source map
 */
export async function enhanceErrorWithSourceMap(
  currentTest: TestResult,
  sourceMapJson: RawSourceMap
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

    // Determine error type based on whether assertions failed
    // assertionsFailed > 0 means this was an assert() failure
    // assertionsFailed === 0 means this was a runtime crash (bounds, null, etc.)
    const isAssertionFailure = currentTest.assertionsFailed > 0;

    // Extract short function name from AS's namespace format
    // "assembly/index/assert" -> "assert"
    // "tests/assembly/file.as.test/myFunction" -> "myFunction"
    // Also strip filename prefix from anonymous functions:
    // "sourcemap-accuracy-test.as.test~anonymous|1" -> "anonymous|1"
    const getShortFunctionName = (fullName: string, fileName: string): string => {
      const parts = fullName.split('/');
      let shortName = parts[parts.length - 1] || fullName;

      // Strip filename prefix if present (e.g., "basename~anonymous|1" -> "anonymous|1")
      // Remove any extension from the filename
      const fileBasename = basename(fileName).replace(/\.[^.]+$/, '');
      if (shortName.startsWith(`${fileBasename}~`)) {
        shortName = shortName.substring(fileBasename.length + 1);
      }

      return shortName;
    };

    // Format error message (for now we don't do any other formatting)
    // TODO - maybe make this nicer, because we don't get the primary frame
    // highlighting in the stack trace for AS errors
    const enhancedMessage = originalMessage;

    // Build parsed stack array for Vitest (it checks error.stacks first before parsing error.stack)
    // Vitest's printError will format these with colors and ❯ symbols
    // Note: source-map library returns line (1-indexed, already correct) and column (0-indexed, needs +1 for display)
    const parsedStacks: ParsedStack[] = currentTest.sourceStack
      .filter(frame => {
        // Filter out internal assertion framework frames (like Vitest filters /vitest/dist/)
        // For assertion errors, skip our internal assert() implementation
        if (isAssertionFailure && frame.location.filePath.includes('/vitest-pool-assemblyscript/assembly/')) {
          return false;
        }
        return true;
      })
      .map(frame => ({
        method: getShortFunctionName(frame.functionName, frame.location.filePath),
        file: frame.location.filePath,
        line: frame.location.line,
        column: frame.location.column + 1, // Convert to 1-indexed for display
      }));

    // Create enhanced error as plain object implementing AssemblyScriptTestError interface
    // This ensures all properties are enumerable and survive RPC serialization
    const enhancedError: AssemblyScriptTestError = {
      name: isAssertionFailure ? ERROR_NAMES.AssertionError : ERROR_NAMES.RuntimeError,
      message: enhancedMessage,
      stacks: parsedStacks,
    };

    currentTest.error = enhancedError;

    debug(`[Executor] Enhanced error with source location (type: ${enhancedError.name})`);
  }
}
