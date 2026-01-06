import { RunMode, File, Suite, Task, Test } from '@vitest/runner/types';
import { createFileTask, interpretTaskModes, someTasksAreOnly } from '@vitest/runner/utils';

import {
  AssemblyScriptSuiteOptions,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  AssemblyScriptTestTaskMeta,
  FailedAssertion,
  WASMExecutorPerfTimings
} from '../types/types.js';
import { debug } from './debug.js';
import { createTestExpectedToFailError, createTestTimeoutError } from './pool-errors.js';
import { ASSEMBLYSCRIPT_POOL_NAME, TEST_ERROR_NAMES } from '../types/constants.js';
import { extractCallStack } from '../wasm-executor/source-maps.js';

// ============================================================================
// Util
// ============================================================================

function positiveSum<T>(items: T[], getSummableValue: (_next: T) => number | undefined): number {
  return items.reduce((total, next) => {
    return total + Math.max(getSummableValue(next) || 0, 0)
  }, 0);
}

export function getSuiteLogLabel(suite: Suite): string {
  return suite.file.id === suite.id ? '' : `Suite: "${suite.name}" - `;
}

// ============================================================================
// Task Creation
// ============================================================================

export function getInitialTaskMode(
  options: AssemblyScriptTestOptions | AssemblyScriptSuiteOptions,
  parent: Suite,
): RunMode {
  if (options.skip || parent.mode === 'skip') {
    return 'skip';
  } else if (options.only) {
    return 'only';
  } else {
    return 'run';
  }
}

function getInitialTestTaskMeta(
  fnIndex: number,
  parent: Suite,
): AssemblyScriptTestTaskMeta {
  return {
    fnIndex,
    idxInParentTasks: parent.tasks.length - 1,
    assertionsPassedCount: 0,
    assertionsFailed: [],
    timedOut: false,
    resultInverted: false,
  };
}

function getInitialSuiteTaskMeta(
  parent: Suite,
): AssemblyScriptSuiteTaskMeta {
  return {
    idxInParentTasks: parent.tasks.length - 1,
  };
}

export function createTestTask(
  name: string,
  fnIndex: number,
  file: File,
  parent: Suite,
  options: AssemblyScriptTestOptions,
): Test {
  const test: Test = {
    type: 'test',
    name,
    id: `${parent.name}_${name}_${fnIndex}`,
    file,
    suite: parent,
    context: {} as any,
    annotations: [],
    meta: {},
    mode: getInitialTaskMode(options, parent),
    timeout: options.timeout,
    retry: options.retry,
    fails: options.fails,
  };

  parent.tasks.push(test);

  // use custom TaskMeta to capture fnIndex, parent task index, etc
  test.meta = getInitialTestTaskMeta(fnIndex, parent);

  return test;
}

export function createSuiteTask(
  name: string,
  file: File,
  parent: Suite,
  options: AssemblyScriptSuiteOptions,
): Suite {
  const suiteIsFile = parent.file.filepath === parent.name;
  const prefix = suiteIsFile ? parent.name : `${file.filepath}_${parent.name}`;
  const suite: Suite = {
    type: 'suite',
    name,
    id: `${prefix}_${name}`,
    file,
    suite: parent,
    meta: {},
    tasks: [],
    mode: getInitialTaskMode(options, parent)
  };

  parent.tasks.push(suite);

  // use custom TaskMeta to capture parent task index
  suite.meta = getInitialSuiteTaskMeta(parent);

  return suite;
}

export function createInitialFileTask(
  testFile: string,
  projectRoot: string,
  projectName: string
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

  return file;
}


// ============================================================================
// Dispatch Helpers
// ============================================================================

export function getRunnableTasks(suite: Suite): Task[] {
  return suite.tasks.filter(t => t.mode === 'queued' || t.mode === 'run');
}

export function getTimedOutTests(tasks: Task[]): Test[] {
  return tasks.filter(task => {
      return task.type === 'test' && (task.meta as AssemblyScriptTestTaskMeta).timedOut;
    }) as Test[];
}

// ============================================================================
// Discovery Helpers
// ============================================================================

export function prepareFileTaskForCollection(
  file: File,
  testNamePattern?: RegExp,
  allowOnly?: boolean,
): void {
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
 * Mark test as failed if it completed as passed, but its duration still execeeds the timeout threshold.
 */
export function checkAndUpdateSoftTimeout(test: Test, base: string, context: string): void {
  if (test.result?.state === 'pass' && (test.result.duration || 0) > test.timeout) {
    debug(`[${context}] ${base} - "${test.name}": Soft Timeout (completed over threshold): ${test.result?.duration?.toFixed(2)}ms`);
    
    (test.meta as AssemblyScriptTestTaskMeta).timedOut = true;
    test.result.state = 'fail';
    const timeoutErr = createTestTimeoutError(test);
    if (test.result.errors) {
      test.result.errors.push(timeoutErr)
    } else {
      test.result.errors = [timeoutErr];
    }
  }
}

/**
 * Invert result if test configured as 'fails'.
 * 
 * Check `resultInverted` flag on meta to make sure we don't invert the result multiple times.
 * This is intentionally checked in the worker, prior to reporting, for an accurate result,
 * as well as in the main pool in case it failed without worker completion (e.g. timeout abort).
 */
export function checkFailsAndInvertResult(test: Test, base: string, context: string): void {
  const meta = test.meta as AssemblyScriptTestTaskMeta;

  if (test.fails && meta.resultInverted === false) {
    if (test.result?.state === 'pass') {
      test.result.state = 'fail';
      meta.resultInverted = true;

      debug(`[${context}] ${base} - "${test.name}" has 'fails' option set - inverted "pass" to "fail"`);

      const err = createTestExpectedToFailError();
      if (test.result.errors) {
        test.result.errors.push(err);
      } else {
        test.result.errors = [err];
      }
    } else if (test.result?.state === 'fail') {
      test.result.state = 'pass';
      meta.resultInverted = true;

      debug(`[${context}] ${base} - "${test.name}" has 'fails' option set - inverted "fail" to "pass"`);
      
      test.result.errors = [];
    }
  }
}

export function setTestPrepareResult(test: Test, startTime: number): void {
  test.result = {
    state: 'run',
    startTime,
    retryCount: 0
  };
};

export function updateTestFinishedResult(test: Test, timings: WASMExecutorPerfTimings): void {
  // while failed tests are actively set to failed, a passed test
  // will still be in the prepared result state (run), so set it to pass
  if (test.result?.state === 'run') {
    test.result.state = 'pass';
  }

  if (test.result) {
    test.result.duration = timings.execEnd - timings.execStart;
  }
}

export function failTest(
  test: Test,
  errorMessage: string,
  capturedError: Error,
  context: string,
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

  debug(`[${context}] Captured raw V8 call stack with ${meta.lastErrorRawCallStack.length} frames`);
}

export function failTestWithTimeoutError (test: Test, startTime: number, duration: number): void {
  (test.meta as AssemblyScriptTestTaskMeta).timedOut = true;
  const timeoutErr = createTestTimeoutError(test);

  if (test.result) {
    test.result.state = 'fail';
    test.result.startTime = startTime;
    test.result.duration = duration;
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
};

export function updateSuiteFinalResult(suite: Suite, base: string, context: string): void {
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
      
      debug(`[${context}] ${base} - ${getSuiteLogLabel(suite)}Set result: "${suite.result.state}" (hasFailures: ${hasFailures})`);
    }
  }
}

export function resetTaskMeta(task: Task): void {
  if (task.type === 'test') {
    const meta = task.meta as AssemblyScriptTestTaskMeta;

    // clear any custom metadata associated with the immediate last run
    meta.assertionsPassedCount = 0;
    meta.assertionsFailed = [];
    meta.timedOut = false;
    meta.resultInverted = false;
    delete meta.lastError;
    delete meta.lastErrorValuesProvided;
    delete meta.lastErrorRawCallStack;
    delete meta.coverageData;
  }
}

export function resetTestResult(test: Test, startTime: number): void {
  test.result!.state = 'run';
  test.result!.startTime = startTime;
}
