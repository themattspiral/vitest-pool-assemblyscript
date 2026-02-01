/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import { type ParsedStack } from '@vitest/utils';
import { diff, type SerializedDiffOptions } from '@vitest/utils/diff';
import type { Test, Suite } from '@vitest/runner/types';
import { type RawSourceMap, SourceMapConsumer } from 'source-map';

import type { AssemblyScriptTestError, HighlightFunc, WebAssemblyCallSite } from '../types/types.js';
import { debug } from '../util/debug.js';
import { POOL_INTERNAL_PATHS, TEST_ERROR_NAMES } from '../types/constants.js';
import { createWebAssemblyCallSite, parseSourceMap } from './source-maps.js';
import { getShortFunctionName } from './wasm-names.js';
import {
  getSourceCodeFrameString,
  toPlaintextStackFrameString,
  toVitestLikeStackFrameString,
} from '../util/test-error-formatting.js';

const POOL_INTERNAL_PATHS_SET = new Set(POOL_INTERNAL_PATHS);

async function sourceMapRawCallStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: RawSourceMap,
  loggingPrefix: string,
): Promise<WebAssemblyCallSite[]> {
  const mappedStack: WebAssemblyCallSite[] = [];

  if (!rawCallStack || rawCallStack.length === 0) {
    return mappedStack;
  }

  const sourceMapConsumer = await new SourceMapConsumer(sourceMap);
  
  // map stack call sites from raw WASM locations to source locations  
  rawCallStack.forEach(callSite => {
    const mappedCallSite = createWebAssemblyCallSite(callSite, sourceMapConsumer, loggingPrefix);
    if (mappedCallSite) {
      mappedStack.push(mappedCallSite);
    }
  }); 
  
  sourceMapConsumer.destroy();

  return mappedStack;
}

// Parse source-mapped stack array to Vitest TestError reporting format
function parseMappedStack(mappedStack: WebAssemblyCallSite[]): ParsedStack[] {
  return mappedStack
    // filter out frames for internal assertion framework calls
    // (e.g. assert(), assertEqual(), etc) by known location, for more concise/meaningful error stack report
    .filter(frame => !(POOL_INTERNAL_PATHS_SET.has(frame.location.filePath)))
    
    // map to format that vitest reporter can display
    .map(frame => ({
      method: getShortFunctionName(frame.functionName),
      file: frame.location.filePath,
      line: frame.location.line,
      column: frame.location.column + 1, // Convert from raw 0-indexed to 1-indexed for display
    }));
}

export async function processWASMErrorStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: string,
  loggingPrefix: string,
): Promise<{ parsedStack: ParsedStack[], parsedSourceMap: RawSourceMap }> {
  const sourceMapObj = parseSourceMap(sourceMap);

  // map stack call sites from WASM locations to source code locations  
  const sourceMappedStack = await sourceMapRawCallStack(rawCallStack, sourceMapObj, loggingPrefix);

  debug(`${loggingPrefix} - Mapped ${rawCallStack.length} call sites to ${sourceMappedStack.length} source locations`);

  return {
    parsedStack: parseMappedStack(sourceMappedStack),
    parsedSourceMap: sourceMapObj,
  };
}

/**
 * Enhance reportable test error on the provided test result with source mapped stack locations
 * and a formatted diff based on the error type
 */
export async function enhanceTestError(
  error: AssemblyScriptTestError,
  task: Test | Suite,
  sourceMap: string,
  valuesProvided: boolean,
  logPrefix: string,
  highlight: HighlightFunc,
  rawCallStack?: NodeJS.CallSite[],
  diffOptions?: SerializedDiffOptions
): Promise<AssemblyScriptTestError> {
  const isAssertionFailure = error.name === TEST_ERROR_NAMES.AssertionError;
  let expectedVsActualDiffString: string = '';

  if (isAssertionFailure && valuesProvided) {
    // remain undefined if there were no expected/actual values provided with the assertion failure
    expectedVsActualDiffString = diff(error.expected, error.actual, diffOptions) ?? '';
  }

  // if there's no stack to map, set the expected vs actual diff (if any) and return
  if (!rawCallStack || rawCallStack.length === 0) {
    error.diff = expectedVsActualDiffString;

    // stack is used by vitest for error deduplication, so make sure it is set
    error.stack = `${task.name} - ${error.message}`;

    return error;
  }

  // map stack call sites from WASM locations to source locations
  const { parsedStack, parsedSourceMap } = await processWASMErrorStack(rawCallStack, sourceMap, logPrefix);
  
  // build additional strings to add to test error's `diff` field based on parsed stack contents
  let primaryStackFrameString: string | undefined;
  let highlightedSourceCodeFrameString: string | undefined;
  
  if (parsedStack.length > 0) {
    const primaryStackFrame = parsedStack[0]!;
    
    primaryStackFrameString = toVitestLikeStackFrameString(primaryStackFrame);
    
    // Test error is set to rest of the stack without the first frame.
    // Vitest will report the ParsedError[] on TestError.stacks below the diff we set.
    error.stacks = parsedStack.slice(1);

    // get source code diff from source map source content
    highlightedSourceCodeFrameString = getSourceCodeFrameString(parsedSourceMap, primaryStackFrame, highlight);

    debug(`${logPrefix} - Enhanced ${error.name} error with parsed source stack`);
  }

  // Use the diff field as our way to show all output (other than result.error.stacks)
  if (isAssertionFailure) {
    error.diff = [
      `${expectedVsActualDiffString}${expectedVsActualDiffString ? '\n\n' : ''}`,
      `${primaryStackFrameString}\n`,
      `${highlightedSourceCodeFrameString}`,
    ].join('');
  } else {
    error.diff = [
      `${primaryStackFrameString}\n`,
      `${highlightedSourceCodeFrameString}`,
    ].join('');
  }

  // stack is used by vitest for error deduplication, so make sure it is set
  error.stack = parsedStack.map(toPlaintextStackFrameString).join('\n');
  
  debug(`[${logPrefix} - Enhanced ${error.name} error with diffs`);

  return error;
}
