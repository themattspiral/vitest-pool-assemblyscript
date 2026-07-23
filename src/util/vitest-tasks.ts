import type { RunnerTestFile, RunMode, RunnerTestSuite, RunnerTask, RunnerTestCase } from 'vitest';

import type {
  AssemblyScriptCoveragePayload,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  AssemblyScriptTestTaskMeta,
  ExecutionPhase,
  FailedAssertion,
  HookChainLevel,
  TestHookChains,
  VitestVersion,
  WASMExecutorPerfTimings
} from '../types/types.js';
import { TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from './debug.js';
import { createTestExpectedToFailError, createTimeoutError } from './pool-errors.js';
import { retryCompat } from './resolve-config.js';

// ============================================================================
// Util
// ============================================================================

function positiveSum<T>(items: T[], getSummableValue: (_next: T) => number | undefined): number {
  return items.reduce((total, next) => {
    return total + Math.max(getSummableValue(next) || 0, 0)
  }, 0);
}

function hasNonFileParentSuite(suite: RunnerTestSuite): boolean {
  return !!suite.suite?.id && suite.suite.id !== suite.file.id;
}

function getSuiteHierarchyName(suite: RunnerTestSuite): string {
  let name = suite.name;
  let currentSuite = suite;
  
  while (hasNonFileParentSuite(currentSuite)) {
    name = `${currentSuite.suite!.name} > ${name}`;
    currentSuite = currentSuite.suite!;
  }
  
  return name;
}

export function isSuiteOwnFile(suite: RunnerTestSuite): boolean {
  return suite.file.id === suite.id;
}

export function getTaskLogLabel(base: string, task: RunnerTask): string {
  if (task.type === 'suite') {
    return isSuiteOwnFile(task) ?
      `${base}`
      : `${base} - "${getSuiteHierarchyName(task)}"`;
  } else {
    return `${base} - "${getSuiteHierarchyName(task.suite!)} > ${task.name}"`;
  }
}

export function getTaskLogPrefix(logModule: string, base: string, task: RunnerTask): string {
  return `[${logModule}] ${getTaskLogLabel(base, task)}`;
}

export function createAfterSuiteRunMeta(
  coverage: AssemblyScriptCoveragePayload,
  testFiles: string[],
  projectName: string = '',
  vitestVersion: VitestVersion = 'v4',
): any {
  const base = { coverage, testFiles, projectName };

  if (vitestVersion === 'v3') {
    return { ...base, transformMode: 'ssr' as const };
  } else {
    return { ...base, environment: 'node' as const };
  }
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
  parentAfterAddingTask: RunnerTestSuite,
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
  parentAfterAddingTask: RunnerTestSuite,
  mergedOptions: AssemblyScriptTestOptions,
): AssemblyScriptSuiteTaskMeta {
  return {
    idxInParentTasks: parentAfterAddingTask.tasks.length - 1,
    defaultTestOptions: mergedOptions,
    suitePreparedSent: false,
    resultFinal: false,
    hooks: { beforeEach: [], afterEach: [] },
  };
}


function createTaskName(names: readonly (string | undefined)[], separator: string = ' > '): string {
  return names.filter(name => name !== undefined).join(separator);
}

export function createTestTask(
  name: string,
  fnIndex: number,
  file: RunnerTestFile,
  parent: RunnerTestSuite,
  mergedOptions: AssemblyScriptTestOptions,
  vitestVersion: VitestVersion = 'v4',
): RunnerTestCase {
  const test: RunnerTestCase = {
    type: 'test',
    name,
    fullName: createTaskName([
      parent?.fullName ?? file?.fullName,
      name,
    ]),
    fullTestName: createTaskName([parent?.fullTestName, name]),
    id: '',
    file,
    suite: parent,
    context: {} as any,
    annotations: [],
    artifacts: [],
    benchmarks: [],
    meta: {},
    mode: getInitialTaskMode(mergedOptions),
    timeout: mergedOptions.timeout,
    retry: mergedOptions.retry,
    fails: mergedOptions.fails,
  };

  if (vitestVersion === 'v3') {
    // @ts-ignore
    delete test.fullName;
    // @ts-ignore
    delete test.fullTestName;
    // @ts-ignore
    delete test.artifacts;
    // @ts-ignore
    delete test.benchmarks;
  }
  // else if (vitestVersion === 'v4') {
  //   // @ts-ignore
  //   delete test.benchmarks;
  // }

  parent.tasks.push(test);

  // use custom TaskMeta to capture fnIndex, parent task index, etc
  test.meta = getInitialTestTaskMeta(fnIndex, parent);

  return test;
}

export function createSuiteTask(
  name: string,
  file: RunnerTestFile,
  parent: RunnerTestSuite,
  mergedOptions: AssemblyScriptTestOptions,
  vitestVersion: VitestVersion = 'v4',
): RunnerTestSuite {
  // const suiteIsFile = parent.file.id === parent.id;
  // const prefix = suiteIsFile ? parent.name : `${file.filepath}_${parent.name}`;
  const suite: RunnerTestSuite = {
    type: 'suite',
    name,
    fullName: createTaskName([
      parent?.fullName ?? file?.fullName,
      name,
    ]),
    fullTestName: createTaskName([parent?.fullTestName, name]),
    id: '',
    file,
    suite: parent,
    meta: {},
    tasks: [],
    mode: getInitialTaskMode(mergedOptions),
  };

  if (vitestVersion === 'v3') {
    // @ts-ignore
    delete suite.fullName;
    // @ts-ignore
    delete suite.fullTestName;
  }

  parent.tasks.push(suite);

  // use custom TaskMeta to capture parent task index and default options
  suite.meta = getInitialSuiteTaskMeta(parent, mergedOptions);

  return suite;
}


// ============================================================================
// Dispatch Helpers
// ============================================================================

export function getRunnableTasks(suite: RunnerTestSuite): RunnerTask[] {
  return suite.tasks.filter(t => t.mode === 'queued' || t.mode === 'run');
}


// ============================================================================
// Lifecycle Hook Chains
// ============================================================================

/**
 * Resolve a test's lifecycle hook chains from its suite ancestry, mirroring
 * vitest's `callSuiteHook` recursion with the default `sequence.hooks: 'stack'`
 * ordering:
 * - `beforeEach`: outermost suite (file) first; within a suite, registration order
 * - `afterEach`: innermost suite first; within a suite, REVERSED registration order
 *
 * Levels without hooks are omitted — vitest only surfaces hook state/events for
 * suite levels that actually have hooks of that type.
 */
export function collectHookChainLevels(test: RunnerTestCase): TestHookChains {
  // suite lineage from outermost (file) to innermost (test's parent)
  const lineage: RunnerTestSuite[] = [];
  let suite: RunnerTestSuite | undefined = test.suite ?? test.file;

  while (suite) {
    lineage.unshift(suite);
    suite = isSuiteOwnFile(suite) ? undefined : (suite.suite ?? suite.file);
  }

  const beforeEach: HookChainLevel[] = lineage
    .map(s => ({
      suiteName: s.name,
      registrations: [...(s.meta as AssemblyScriptSuiteTaskMeta).hooks.beforeEach],
    }))
    .filter(level => level.registrations.length > 0);

  const afterEach: HookChainLevel[] = [...lineage].reverse()
    .map(s => ({
      suiteName: s.name,
      registrations: [...(s.meta as AssemblyScriptSuiteTaskMeta).hooks.afterEach].reverse(),
    }))
    .filter(level => level.registrations.length > 0);

  return { beforeEach, afterEach };
}


// ============================================================================
// Result Handling Helpers
// ============================================================================

export function shouldRetryTask(task: RunnerTask): boolean {
  const retry = retryCompat(task.retry);
  return task.result?.state === 'fail'
    && task.retry !== undefined
    && retry > 0
    && (
     task.result.retryCount === undefined
      || task.result.retryCount === 0
      || (task.result.retryCount < retry)
    );
}

/**
 * Invert result if test configured as 'fails'.
 */
export function checkFailsAndInvertResult(test: RunnerTestCase, logPrefix: string): void {
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

export function setTestResultForTestPrepare(test: RunnerTestCase, startTime: number): void {
  test.result = {
    state: 'run',
    startTime,
    retryCount: 0
  };
};

export function updateTestResultAfterRun(test: RunnerTestCase, testTimings?: WASMExecutorPerfTimings): void {
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

export function flagTestTerminated(test: RunnerTestCase): void {
  (test.meta as AssemblyScriptTestTaskMeta).lastTimeoutTerminationTime = Date.now();
}

export function flagTestFinalized(test: RunnerTestCase): void {
  (test.meta as AssemblyScriptTestTaskMeta).resultFinal = true;
}

function failTest(
  test: RunnerTestCase,
  testError: AssemblyScriptTestError,
): void {
  if (test.result) {
    test.result.state = 'fail';
  } else {
    test.result = { state: 'fail' };
  }

  if (test.result.errors) {
    test.result.errors.push(testError);
  } else {
    test.result.errors = [testError];
  }
}

export function failTestRuntimeError(
  test: RunnerTestCase,
  errorMessagePrefix: string,
  errorMessage: string,
): AssemblyScriptTestError {
  const prefixStr = errorMessagePrefix ? `${errorMessagePrefix}: ` : '';
  const testError: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.WASMRuntimeError,
    message: `${prefixStr}${errorMessage}`
  };

  failTest(test, testError);
  
  return testError;
}

export function failTestAssertionError(
  test: RunnerTestCase,
  assertion: FailedAssertion
): AssemblyScriptTestError {
  (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push(assertion);

  const testError: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.AssertionError,
    message: assertion.message
  };
     
  if (assertion?.valuesProvided) {
    testError.expected = assertion.expected !== undefined ? String(assertion.expected) : undefined;
    testError.actual = assertion.actual !== undefined ? String(assertion.actual) : undefined;
  }

  failTest(test, testError);
  
  return testError;
}

export function failTestWithTimeoutError (
  test: RunnerTestCase,
  startTime: number,
  duration: number,
  phase: ExecutionPhase,
  effectiveTimeout: number,
): void {
  const timeoutErr = createTimeoutError(test, phase, effectiveTimeout);

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

export function setSuitePrepareResult(suite: RunnerTestSuite): void {
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

export function updateSuiteFinishedResult(suite: RunnerTestSuite, logPrefix: string): void {
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

export function finalizeSuiteResult(suite: RunnerTestSuite): void {
  (suite.meta as AssemblyScriptSuiteTaskMeta).resultFinal = true;
}

/**
 * Reset a test's result state between retry attempts.
 *
 * `result.errors` is deliberately NOT cleared, matching vitest: its own retry
 * reset only sets `state`/`retryCount`, and its `failTask` appends rather than
 * replaces, so a test that fails early attempts and then passes ends up in the
 * `pass` state while still carrying the earlier attempts' errors. Vitest's JSON
 * reporter maps `result.errors` into `failureMessages` without checking state,
 * so those errors surface there (the default terminal reporter shows only the
 * passing state). Clearing them here would make our reported output diverge
 * from vitest for the same test — revisit only if vitest changes upstream.
 */
export function resetTestForRetry(test: RunnerTestCase, startTime: number): void {
  if (test.result) {
    test.result!.state = 'run';
    test.result!.startTime = startTime;
  }

  const meta = test.meta as AssemblyScriptTestTaskMeta;

  // clear runner metadata associated with the immediate last test run
  meta.assertionsPassedCount = 0;
  meta.assertionsFailed = [];
}
