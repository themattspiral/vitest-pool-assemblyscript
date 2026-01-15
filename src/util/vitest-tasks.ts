import type { RunMode, File, Suite, Task, Test } from '@vitest/runner/types';
import {
  calculateSuiteHash,
  createFileTask,
  interpretTaskModes,
  someTasksAreOnly
} from '@vitest/runner/utils';

import {
  AssemblyScriptResolvedConfig,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  AssemblyScriptTestTaskMeta,
  FailedAssertion,
  WASMExecutorPerfTimings
} from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_NAME, TEST_ERROR_NAMES } from '../types/constants.js';
import { DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS } from '../types/typed-constants.js';
import { debug } from './debug.js';
import { createTestExpectedToFailError, createTestTimeoutError } from './pool-errors.js';
import { extractCallStack } from '../wasm-executor/source-maps.js';

// ============================================================================
// Util
// ============================================================================

function positiveSum<T>(items: T[], getSummableValue: (_next: T) => number | undefined): number {
  return items.reduce((total, next) => {
    return total + Math.max(getSummableValue(next) || 0, 0)
  }, 0);
}

function hasNonFileParentSuite(suite: Suite): boolean {
  return !!suite.suite?.id && suite.suite.id !== suite.file.id;
}

function getSuiteHierarchyName(suite: Suite): string {
  let name = suite.name;
  let currentSuite = suite;
  
  while (hasNonFileParentSuite(currentSuite)) {
    name = `${currentSuite.suite!.name} > ${name}`;
    currentSuite = currentSuite.suite!;
  }
  
  return name;
}

export function isSuiteOwnFile(suite: Suite): boolean {
  return suite.file.id === suite.id;
}

export function getTaskLogLabel(base: string, task: Task): string {
  if (task.type === 'suite') {
    return isSuiteOwnFile(task) ?
      `${base}`
      : `${base} - "${getSuiteHierarchyName(task)}"`;
  } else {
    return `${base} - "${getSuiteHierarchyName(task.suite!)} > ${task.name}"`;
  }
}

export function getTaskLogPrefix(logModule: string, base: string, task: Task): string {
  return `[${logModule}] ${getTaskLogLabel(base, task)}`;
}


function spacesForLevel(level: number): string {
  return new Array(level + 1).fill('  ').join('');
}

function taskStr(task: Task, level: number): string {
  if (task.type === 'test') {
    return `${spacesForLevel(level)}ID: ${task.id} Mode: "${task.mode}" Test: "${task.name}"`;
  } else {
    const suiteStr = `${spacesForLevel(level)}ID: ${task.id} Mode: "${task.mode}" Suite: "${task.name}"\n`;
    return suiteStr + task.tasks.map(t => taskStr(t, level + 1)).join('\n');
  }
};

export function getFullTaskHierarchy(file: File): string {
  return taskStr(file, 0);
}

// ============================================================================
// Task Creation
// ============================================================================

export function getInitialTaskMode(options: AssemblyScriptTestOptions): RunMode {
  if (options.skip) {
    return 'skip';
  } else if (options.only) {
    return 'only';
  } else {
    return 'run';
  }
}

export function getInitialTestTaskMeta(
  fnIndex: number,
  parentAfterAddingTask: Suite,
): AssemblyScriptTestTaskMeta {
  return {
    fnIndex,
    idxInParentTasks: parentAfterAddingTask.tasks.length - 1,
    assertionsPassedCount: 0,
    assertionsFailed: [],
    resultFinal: false,
  };
}

export function getInitialSuiteTaskMeta(
  parentAfterAddingTask: Suite,
  mergedOptions: AssemblyScriptTestOptions,
): AssemblyScriptSuiteTaskMeta {
  return {
    idxInParentTasks: parentAfterAddingTask.tasks.length - 1,
    defaultTestOptions: mergedOptions,
    suitePreparedSent: false,
    resultFinal: false,
  };
}

export function createInitialFileTask(
  testFile: string,
  projectName: string,
  projectRoot: string,
  configTestTimeout: number,
  configRetry: number,
): File {
  const file: File = createFileTask(
    testFile,
    projectRoot,
    projectName,
    ASSEMBLYSCRIPT_POOL_NAME
  );

  file.mode = 'queued';
  file.environmentLoad = 0;  // AS pool has no environment setup
  file.setupDuration = 0;    // AS pool has no setup files

  const defaultTestOptions: AssemblyScriptTestOptions = {
    ...DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS,
    timeout: configTestTimeout,
    retry: configRetry,
  };

  const meta: AssemblyScriptSuiteTaskMeta = {
    idxInParentTasks: -1,  // file task has no parent, should never be used anyway
    defaultTestOptions,
    suitePreparedSent: false,
    resultFinal: false,
  }
  file.meta = meta;

  return file;
}

export function createFailedFileTask(
  testFile: string,
  projectName: string,
  config: AssemblyScriptResolvedConfig,
  error: AssemblyScriptTestError,
): File {
  const file: File = createFileTask(
    testFile,
    config.root,
    projectName,
    ASSEMBLYSCRIPT_POOL_NAME
  );
  file.mode = 'run';
  file.result = {
    state: 'fail',
    errors: [error]
  };
  file.environmentLoad = 0;
  file.setupDuration = 0;
  file.collectDuration = 0;

  return file;
}


// ============================================================================
// Dispatch Helpers
// ============================================================================

export function getRunnableTasks(suite: Suite): Task[] {
  return suite.tasks.filter(t => t.mode === 'queued' || t.mode === 'run');
}


// ============================================================================
// Discovery Helpers
// ============================================================================

export function prepareFileTaskForCollection(
  file: File,
  testNamePattern?: RegExp,
  allowOnly?: boolean,
): void {
  calculateSuiteHash(file);

  // Interpret task modes does the following:
  // 1. If only mode enabled on any test, flip all non-only test.mode to skip
  // 2. Apply test name pattern filtering (from -t flag) to skip if needed
  // 3. If all test modes are skip, set file task mode to skip
  const hasOnly = someTasksAreOnly(file);
  interpretTaskModes(
    file,
    testNamePattern,  // user regexp
    undefined,  // testLocations
    hasOnly,    // onlyMode - true if only is used anywhere
    false,      // parentIsOnly - always false for the file task
    allowOnly
  );

  // update from queued (onQueued report) to run (onCollected report)
  if (file.mode === 'queued') {
    file.mode = 'run';
  }
}

// ============================================================================
// Result Handling Helpers
// ============================================================================

export function shouldRetryTask(task: Task): boolean {
  return task.result?.state === 'fail'
    && task.retry !== undefined
    && task.retry > 0
    && (
     task.result.retryCount === undefined
      || task.result.retryCount === 0
      || (task.result.retryCount < task.retry)
    );
}

/**
 * Invert result if test configured as 'fails'.
 */
export function checkFailsAndInvertResult(test: Test, logPrefix: string): void {
  if (test.fails) {
    if (test.result?.state === 'pass') {
      test.result.state = 'fail';

      debug(`${logPrefix} - Has 'fails' option set - inverted "pass" to "fail"`);

      const err = createTestExpectedToFailError(test);
      if (test.result.errors) {
        test.result.errors.push(err);
      } else {
        test.result.errors = [err];
      }
    } else if (test.result?.state === 'fail') {
      test.result.state = 'pass';
      test.result.errors = [];

      debug(`${logPrefix} - Has 'fails' option set - inverted "fail" to "pass"`);
    }
  }
}

export function setResultForTestPrepare(test: Test, startTime: number): void {
  test.result = {
    state: 'run',
    startTime,
    retryCount: 0
  };
};

export function updateResultAfterTestRun(test: Test, testTimings?: WASMExecutorPerfTimings): void {
  // while failed tests are actively set to failed, a passed test
  // will still be in the prepared result state (run), so set it to pass
  if (test.result?.state === 'run') {
    test.result.state = 'pass';
  }
  
  if (test.result && testTimings) {
    // accumulate duration for any retries that may be done
    test.result.duration = (test.result.duration ?? 0) + (testTimings.execEnd - testTimings.execStart);
  }
}

export function prepareForTermination(test: Test): void {
  (test.meta as AssemblyScriptTestTaskMeta).lastTimeoutTerminationTime = Date.now();
}

export function finalizeTestResult(test: Test): void {
  (test.meta as AssemblyScriptTestTaskMeta).resultFinal = true;
}

export function failTest(
  test: Test,
  errorMessage: string,
  capturedError: Error,
  logPrefix: string,
): void {
  if (test.result) {
    test.result.state = 'fail';
  } else {
    test.result = { state: 'fail' };
  }

  const testError: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.WASMRuntimeError,
    message: errorMessage
  };

  const meta = test.meta as AssemblyScriptTestTaskMeta;
          
  // determine if this was an assertion failure
  if (meta.assertionsFailed?.length > 0) {
    testError.name = TEST_ERROR_NAMES.AssertionError;

    const assertion: FailedAssertion = meta.assertionsFailed[meta.assertionsFailed.length - 1]!;

    // set actual and expected values as strings, if provided
    if (assertion.valuesProvided) {
      meta.lastErrorValuesProvided = true;
      testError.expected = assertion.expected !== undefined ? String(assertion.expected) : undefined;
      testError.actual = assertion.actual !== undefined ? String(assertion.actual) : undefined;
    }
  }
  
  // Set error to report to vitest on the test meta.
  // Stack gets updated when executor enhances/source-maps the error, post-abort
  meta.lastError = testError;

  // Create error to capture V8 stack trace and extract V8 call stack before throwing.
  // This gives us WAT line:column positions that can be mapped to AS source
  meta.lastErrorRawCallStack = extractCallStack(capturedError);

  debug(`${logPrefix} - Captured raw V8 call stack with ${meta.lastErrorRawCallStack.length} frames`);
}

export function failTestWithTimeoutError (test: Test, startTime: number, duration: number): void {
  const timeoutErr = createTestTimeoutError(test);

  if (test.result) {
    test.result.state = 'fail';
    test.result.startTime = startTime;
    
    // accumulate duration for any retries that may be done
    test.result.duration = (test.result.duration ?? 0) + duration;

    if (test.result.errors) {
      test.result.errors.push(timeoutErr)
    } else {
      test.result.errors = [timeoutErr];
    }
  } else {
    test.result = {
      state: 'fail',
      startTime,
      duration,
      errors: [timeoutErr],
      retryCount: 0,
    };
  }
}

export function setSuitePrepareResult(suite: Suite): void {
  if (suite.mode === 'skip') {
    suite.result = {
      state: 'skip',
      duration: 0,
    };
  } else {
    suite.result = {
      state: 'run',
      startTime: Date.now(),
    };
  }
}

export function updateSuiteFinishedResult(suite: Suite, logPrefix: string): void {
  if (suite.mode === 'skip') {
    suite.result = {
      state: 'skip',
      duration: 0,
    };
  } else {
    // update suite final result based on sub-task results
    const hasFailures = suite.tasks.some(({ result }) => result?.state === 'fail' );
    
    if (suite.result) {
      suite.result.duration = positiveSum(suite.tasks, t => t.result?.duration);
      suite.result.state = hasFailures ? 'fail' : 'pass';
      
      debug(`${logPrefix} - Set suite result: "${suite.result.state}" (hasFailures: ${hasFailures})`);
    }
  }
}

export function finalizeSuiteResult(suite: Suite): void {
  (suite.meta as AssemblyScriptSuiteTaskMeta).resultFinal = true;
}

export function resetTestForRetry(test: Test, startTime: number): void {
  if (test.result) {
    test.result!.state = 'run';
    test.result!.startTime = startTime;
  }

  const meta = test.meta as AssemblyScriptTestTaskMeta;

  // clear any custom metadata associated with the immediate last run
  meta.assertionsPassedCount = 0;
  meta.assertionsFailed = [];
  delete meta.lastError;
  delete meta.lastErrorValuesProvided;
  delete meta.lastErrorRawCallStack;
  delete meta.lastTimeoutTerminationTime;
  delete meta.coverageData;
}

export function failFile(
  file: File,
  error: AssemblyScriptTestError,
  runStartPerf: number,
): File {
  file.mode = 'run';

  if (file.result) {
    file.result.state = 'fail';
    file.result.errors = file.result.errors ? file.result.errors.concat(error) : [error];
  } else {
    file.result = {
      state: 'fail',
      errors: [error]
    };
  }
  file.environmentLoad = file.environmentLoad ?? 0;
  file.setupDuration = performance.now() - runStartPerf;
  file.collectDuration = file.collectDuration ?? 0;

  return file;
}

