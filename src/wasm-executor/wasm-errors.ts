/**
 * Error Enhancement and Source Mapping
 *
 * This module handles mapping WASM errors to AssemblyScript source locations
 * using source maps. It enhances error messages and stack traces with accurate
 * file:line:column information for better developer experience.
 */

import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ParsedStack } from '@vitest/utils';
import { diff, type SerializedDiffOptions } from '@vitest/utils/diff';
import type { Test, Suite } from '@vitest/runner/types';
import { type RawSourceMap, SourceMapConsumer } from 'source-map';

import type { AssemblyScriptTestError, WebAssemblyCallSite } from '../types/types.js';
import { POOL_INTERNAL_PATHS, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createWebAssemblyCallSite } from './source-maps.js';
import { getShortFunctionName } from './wasm-names.js';
import {
  getSourceCodeFrameString,
  toPlaintextStackFrameString,
  toVitestLikeStackFrameString,
} from '../util/test-error-formatting.js';
import { toForwardSlash } from '../util/path-utils.js';

const POOL_INTERNAL_PATHS_SET = new Set(POOL_INTERNAL_PATHS);

function passthroughCallSite(callSite: NodeJS.CallSite): ParsedStack {
  const fileName = callSite.getFileName();
  const watLine = callSite.getLineNumber();
  const watColumn = callSite.getColumnNumber();
  const functionName = callSite.getFunctionName() || 'wasm-function[unknown]';

  return {
    method: functionName,
    file: fileName ?? 'unknown-file',
    line: watLine || -1,
    column: watColumn || -1
  };
}

async function sourceMapRawCallStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: RawSourceMap | undefined,
  loggingPrefix: string,
  allowJS: boolean,
): Promise<WebAssemblyCallSite[]> {
  const mappedStack: WebAssemblyCallSite[] = [];

  if (!rawCallStack || rawCallStack.length === 0) {
    return mappedStack;
  }

  if (sourceMap) {
    const sourceMapConsumer = await new SourceMapConsumer(sourceMap);
    
    // map stack call sites from raw WASM locations to source locations  
    rawCallStack.forEach(callSite => {
      const mappedCallSite = createWebAssemblyCallSite(callSite, sourceMapConsumer, loggingPrefix, allowJS);
      if (mappedCallSite) {
        mappedStack.push(mappedCallSite);
      }
    });
    
    sourceMapConsumer.destroy();
  }

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
      column: frame.location.filePath.startsWith('file')
        ? frame.location.column      // unmapped file needs no change 
        : frame.location.column + 1, // Convert from raw source-map's 0-indexed to 1-indexed for display
    }));
}

export async function processWASMErrorStack(
  rawCallStack: NodeJS.CallSite[],
  sourceMap: RawSourceMap | undefined,
  loggingPrefix: string,
  allowJS: bool,
): Promise<ParsedStack[]> {
  // map stack call sites from WASM locations to source code locations  
  const sourceMappedStack = await sourceMapRawCallStack(rawCallStack, sourceMap, loggingPrefix, allowJS);
  debug(`${loggingPrefix} - Mapped ${rawCallStack.length} call sites to ${sourceMappedStack.length} source locations`);

  const parsedStack = parseMappedStack(sourceMappedStack);

  if (parsedStack.length === 0) {
    rawCallStack.forEach(callSite => {
      parsedStack.push(passthroughCallSite(callSite));
    });
  }

  return parsedStack;
}

/**
 * Enhance reportable test error on the provided test result with source mapped stack locations
 * and a formatted diff based on the error type
 */
export async function enhanceTestError(
  testError: AssemblyScriptTestError,
  task: Test | Suite,
  sourceMap: RawSourceMap | undefined,
  logPrefix: string,
  allowJS: boolean,
  projectRoot: string,
  applyStackToTestErrorCause: boolean,
  rawCallStack?: NodeJS.CallSite[],
  diffOptions?: SerializedDiffOptions
): Promise<void> {
  let expectedVsActualDiffString: string | undefined;
  const isAssertionFailure = testError.name === TEST_ERROR_NAMES.AssertionError;
  const valuesProvided = testError.expected !== undefined && testError.actual !== undefined;

  if (isAssertionFailure && valuesProvided) {
    // remain undefined if there were no expected/actual values provided with the assertion failure
    expectedVsActualDiffString = diff(testError.expected, testError.actual, diffOptions) ?? '';
  }

  // if there's no stack to map, set the expected vs actual diff (if any) and return
  if (!rawCallStack || rawCallStack.length === 0) {
    testError.diff = expectedVsActualDiffString;

    // stack is used by vitest for error deduplication, so make sure it is set
    testError.stack = `${task.name} - ${testError.message}`;

    return;
  }

  const testErrorToUpdate: AssemblyScriptTestError = applyStackToTestErrorCause && testError.cause
    ? testError.cause as AssemblyScriptTestError : testError;

  // map stack call sites from WASM locations to source locations
  const parsedStack = await processWASMErrorStack(rawCallStack, sourceMap, logPrefix, allowJS);
  
  // build additional strings to add to test error's `diff` field based on parsed stack contents
  let primaryStackFrameString: string | undefined;
  let highlightedSourceCodeFrameString: string | undefined;
  
  if (parsedStack.length > 0) {
    // normalize all paths
    parsedStack.forEach((frame) => {
			if (frame.file.startsWith("file://")) {
				frame.file = toForwardSlash(relative(projectRoot, fileURLToPath(frame.file)));
        testErrorToUpdate.stack += toPlaintextStackFrameString(frame) + '\n';
			}
		});

    const primaryStackFrame = parsedStack[0]!;
    
    // Test error is set to rest of the stack without the first frame.
    // Vitest will report the ParsedStack[] on TestError.stacks below the diff we set.
    testErrorToUpdate.stacks = parsedStack.slice(1);

    // stack is used by vitest for error deduplication, so make sure it is set also
    testErrorToUpdate.stack = parsedStack.map(toPlaintextStackFrameString).join('\n');

    try {
      highlightedSourceCodeFrameString = await getSourceCodeFrameString(sourceMap, primaryStackFrame);
    } catch (err) {
      debug(`${logPrefix} - Error reading source for primary stack frame file "${primaryStackFrame.file}":`, err);
    }

    primaryStackFrameString = toVitestLikeStackFrameString(primaryStackFrame);

    debug(`${logPrefix} - Enhanced ${testError.name} error with parsed source stack`);
  } else {
    testErrorToUpdate.stack = `${task.name} - ${testError.message}`;
  }

  // Use the diff field as our way to show all output (other than result.error.stacks)
  testErrorToUpdate.diff = [
    expectedVsActualDiffString,
    expectedVsActualDiffString ? '\n\n' : '',
    primaryStackFrameString ?? '',
    highlightedSourceCodeFrameString ? '\n' : '',
    highlightedSourceCodeFrameString ?? ''
  ].join('');

  debug(`[${logPrefix} - Enhanced error with diffs`);

  return;
}
