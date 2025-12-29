/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import { basename } from 'node:path';
import { type ParsedStack } from '@vitest/utils';
import { diff, type SerializedDiffOptions } from '@vitest/utils/diff';
import { type RawSourceMap, SourceMapConsumer } from 'source-map';

import { debug } from '../util/debug.js';
import { POOL_INTERNAL_PATHS, TEST_ERROR_NAMES } from '../types/constants.js';
import type { ExecuteTestResult, WebAssemblyCallSite } from '../types/types.js';
import { createWebAssemblyCallSite, parseSourceMap } from './source-maps.js';
import { getSourceCodeFrameString, getVitestLikeStackFrameString } from '../util/test-error-formatting.js';

const POOL_INTERNAL_PATHS_SET = new Set(POOL_INTERNAL_PATHS);

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

async function sourceMapRawCallStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: RawSourceMap,
): Promise<WebAssemblyCallSite[]> {
  const mappedStack: WebAssemblyCallSite[] = [];

  if (!rawCallStack || rawCallStack.length === 0) {
    return mappedStack;
  }

  const sourceMapConsumer = await new SourceMapConsumer(sourceMap);
  
  // map stack call sites from raw WASM locations to source locations  
  rawCallStack.forEach(callSite => {
    const mappedCallSite = createWebAssemblyCallSite(callSite, sourceMapConsumer);
    if (mappedCallSite) {
      mappedStack.push(mappedCallSite);
    }
  }); 
  
  sourceMapConsumer.destroy();

  return mappedStack;
}

// Parse stack array for Vitest TestError reporting
function parseMappedStack(mappedStack: WebAssemblyCallSite[], isAssertionFailure: boolean): ParsedStack[] {
  return mappedStack
    // if this is an assertion failure, filter out frames for internal assertion framework calls
    // (e.g. assert(), assertEqual(), etc) by known location, for more concise/meaningful error stack report
    .filter(frame => !(isAssertionFailure && POOL_INTERNAL_PATHS_SET.has(frame.location.filePath)))
    
    // map to format that vitest reporter can display
    .map(frame => ({
      method: getShortFunctionName(frame.functionName, frame.location.filePath),
      file: frame.location.filePath,
      line: frame.location.line,
      column: frame.location.column + 1, // Convert from raw 0-indexed to 1-indexed for display
    }));
}

export async function sourceMapAndParseWASMStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: RawSourceMap,
  isAssertionFailure: boolean,
): Promise<ParsedStack[]> {
  // map stack call sites from WASM locations to source locations  
  const sourceMappedStack = await sourceMapRawCallStack(rawCallStack, sourceMap);

  debug(`[Executor] Mapped ${rawCallStack.length} call sites to ${sourceMappedStack.length} source locations`);

  return parseMappedStack(sourceMappedStack, isAssertionFailure);
}

/**
 * Enhance reportable test error on the provided test result with source mapped stack locations
 * and a formatted diff based on the error type
 *
 * @param mutableTestResult - Test result with raw call stack
 * @param sourceMapJson - Parsed source map
 */
export async function enhanceTestErrorOnResult(
  mutableTestResult: ExecuteTestResult,
  sourceMap: string,
  diffOptions?: SerializedDiffOptions
): Promise<void> {
  if (!mutableTestResult.error) {
    return;
  }

  const isAssertionFailure = mutableTestResult.error.name === TEST_ERROR_NAMES.AssertionError;
  let expectedVsActualDiffString: string = '';

  if (isAssertionFailure && mutableTestResult.valuesProvided) {
    // remain undefined if there were no expected/actual values provided with the assertion failure
    expectedVsActualDiffString = diff(mutableTestResult.error.expected, mutableTestResult.error.actual, diffOptions) ?? '';
  }

  // if there's no stack to map, set the expected vs actual diff (if any) and return
  if (!mutableTestResult.rawCallStack || mutableTestResult.rawCallStack.length === 0) {
    debug('[Executor] No rawCallStack captured on test result');
    mutableTestResult.error.diff = expectedVsActualDiffString;
    return;
  }

  const sourceMapObj = parseSourceMap(sourceMap);

  // map stack call sites from WASM locations to source locations
  const parsedStacks: ParsedStack[] = await sourceMapAndParseWASMStack(mutableTestResult.rawCallStack, sourceMapObj, isAssertionFailure);
  
  // build additional strings to add to test error's `diff` field based on parsed stack contents
  let primaryStackFrameString: string | undefined;
  let highlightedSourceCodeFrameString: string | undefined;
  
  if (parsedStacks.length > 0) {
    const primaryStackFrame = parsedStacks[0]!;
    
    primaryStackFrameString = getVitestLikeStackFrameString(primaryStackFrame);
    
    // Test error is set to rest of the stack without the first frame.
    // Vitest will report the ParsedError[] on TestError.stacks below the diff we set.
    mutableTestResult.error.stacks = parsedStacks.slice(1);

    // get source code diff from source map source content
    highlightedSourceCodeFrameString = getSourceCodeFrameString(sourceMapObj, primaryStackFrame);

    debug(`[Executor] Enhanced ${mutableTestResult.error.name} error with parsed source stack`);
  }

  // Use the diff field as our way to show all output (other than result.error.stacks)
  if (isAssertionFailure) {
    mutableTestResult.error.diff = [
      `${expectedVsActualDiffString}${expectedVsActualDiffString ? '\n\n' : ''}`,
      `${primaryStackFrameString}\n`,
      `${highlightedSourceCodeFrameString}`,
    ].join('');
  } else {
    mutableTestResult.error.diff = [
      `${primaryStackFrameString}\n`,
      `${highlightedSourceCodeFrameString}`,
    ].join('');
  }

  // stack is used by vitest for error deduplication, so make sure it is set
  mutableTestResult.error.stack = mutableTestResult.error.diff;
  
  debug(`[Executor] Enhanced ${mutableTestResult.error?.name} error with diffs`);
}
