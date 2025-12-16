/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import { SourceMapConsumer, type RawSourceMap } from 'source-map';
import type { ParsedStack } from '@vitest/utils';
import { basename } from 'node:path';

import { createWebAssemblyCallSite } from './source-maps.js';
import type { ExecuteTestResult, AssemblyScriptTestError } from '../types/types.js';
import { POOL_INTERNAL_PATHS } from '../types/constants.js';
import { debug } from '../util/debug.js';

// Extract short function name from AS's namespace format
//   "assembly/index/assert" → "assert"
//   "tests/assembly/file.as.test/myFunction" → "myFunction"
//   "tests/assembly/file.as.test/myClass#myMethod" → "myClass#myMethod"
// Also strip filename prefix from anonymous functions:
//   "sourcemap-accuracy-test.as.test~anonymous|1" → "anonymous|1"
function getShortFunctionName(fullName: string, fileName: string): string {
  const parts = fullName.split('/');
  let shortName = parts[parts.length - 1] || fullName;

  // Strip filename prefix if present (e.g., "basename~anonymous|1" → "anonymous|1")
  // Remove any extension from the filename
  const fileBasename = basename(fileName).replace(/\.[^.]+$/, '');
  if (shortName.startsWith(`${fileBasename}~`)) {
    shortName = shortName.substring(fileBasename.length + 1);
  }

  return shortName;
};

/**
 * Enhance error with source mapped locations
 *
 * Maps V8 WAT positions to AssemblyScript source locations using source maps.
 * Updates error message and stack trace with accurate file:line:column information.
 *
 * @param result - Test result with raw call stack
 * @param sourceMapJson - Parsed source map
 */
export async function enhanceErrorWithSourceMap(
  result: ExecuteTestResult,
  sourceMap: string
): Promise<void> {
  if (!result.rawCallStack || result.rawCallStack.length === 0) {
    return;
  }

  debug('[Executor] Mapping', result.rawCallStack.length, 'call sites to source locations');

  // Remove sourceRoot if present to prevent source-map library from prepending it to paths
  //   AS compiler sets sourceRoot: "./output" which would make paths like "output/tests/..."
  //   instead of "tests/..." - these paths don't exist and won't be found by Vitest
  const sourceMapObj: RawSourceMap = JSON.parse(sourceMap);
  delete sourceMapObj.sourceRoot;
  const sourceMapConsumer = await new SourceMapConsumer(sourceMapObj);
  const mappedStack = result.rawCallStack.map(callSite => createWebAssemblyCallSite(callSite, sourceMapConsumer));
  sourceMapConsumer.destroy();

  // Filter out null results (non-WASM call sites) and set stack on result
  result.sourceStack = mappedStack.filter((cs): cs is NonNullable<typeof cs> => cs !== null);

  debug('[Executor] Mapped to', result.sourceStack.length, 'source locations');

  // Format error with source location
  if (result.error && result.sourceStack.length > 0) {
    const originalMessage = result.error.message;

    // Determine error type based on whether assertions failed
    //   assertionsFailed > 0 means this was an assert() failure
    //   assertionsFailed === 0 means this was a runtime crash (bounds, null, etc.)
    const isAssertionFailure = result.assertionsFailed > 0;

    // Format error message (for now we don't do any other formatting)
    // TODO - maybe make this nicer, because we don't get the primary frame
    // highlighting in the stack trace for AS errors
    const enhancedMessage = originalMessage;

    // Build parsed stack array for Vitest TestError reporting (it checks error.stacks first
    // before parsing error.stack). Vitest's printError will format these with colors and ❯ symbols
    // Note: source-map library returns line (1-indexed, already correct) and column (0-indexed, needs +1 for display)
    const parsedStacks: ParsedStack[] = result.sourceStack
    // Filter out internal assertion framework frames
      .filter(frame => {
        if (isAssertionFailure && POOL_INTERNAL_PATHS.has(frame.location.filePath)) {
          return false;
        }
        return true;
      })
      .map(frame => ({
        method: getShortFunctionName(frame.functionName, frame.location.filePath),
        file: frame.location.filePath,
        line: frame.location.line,
        column: frame.location.column + 1, // Convert from raw 0-indexed to 1-indexed for display
      }));

    // Create enhanced error as plain object implementing AssemblyScriptTestError interface
    // This ensures all properties are enumerable and survive RPC serialization
    const enhancedError: AssemblyScriptTestError = {
      name: result.error.name,
      message: enhancedMessage,
      stacks: parsedStacks,
    };
    result.error = enhancedError;

    debug(`[Executor] Enhanced ${result.error.name} error with source locations`);
  }
}
