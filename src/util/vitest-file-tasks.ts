import type { SerializedConfig } from 'vitest';
import type { File, Suite, Task, TaskBase } from '@vitest/runner/types';
import {
  calculateSuiteHash,
  createFileTask,
  someTasksAreOnly
} from '@vitest/runner/utils';
import { processError } from '@vitest/utils/error';

import { ASSEMBLYSCRIPT_POOL_NAME } from '../types/constants.js';
import { DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS } from '../types/typed-constants.js';
import type {
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
} from '../types/types.js';
import { finalizeSuiteResult } from './vitest-tasks.js';

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
  config: SerializedConfig,
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
    undefined,
    undefined,
    hasOnly,    // onlyMode - true if only is used anywhere
    false,      // parentIsOnly - always false for the file task
    allowOnly
  );

  // update from queued (onQueued report) to run (onCollected report)
  if (file.mode === 'queued') {
    file.mode = 'run';
  }
}

export function failFile(
  file: File,
  testError: AssemblyScriptTestError,
  runStartPerf: number,
): AssemblyScriptTestError {
  file.mode = 'run';
  if (file.result) {
    file.result.state = 'fail';
    file.result.errors = file.result.errors ? file.result.errors.concat(testError) : [testError];
  } else {
    file.result = {
      state: 'fail',
      errors: [testError]
    };
  }
  file.environmentLoad = file.environmentLoad ?? 0;
  file.setupDuration = performance.now() - runStartPerf;
  file.collectDuration = file.collectDuration ?? 0;

  // we can always finalize on failing the file, no other work to do
  finalizeSuiteResult(file);

  return testError;
}

export function getFullTaskHierarchy(file: File): string {
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

  return taskStr(file, 0);
}


// ============================================================================
// interpretTaskModes function borrowed from Vitest
// ============================================================================

/**
 * Function interface changes from vitest 4.0.x -> 4.1.x, so now were' just handling this
 * functionality ourselves to prevent version compat conflicts.
 * 
 * @see https://github.com/vitest-dev/vitest/blob/v4.1.0/packages/runner/src/utils/collect.ts#L10
 * 
 * Vitest is released under the MIT license, included in this project's root.
 * Copyright (c) 2021-Present Vitest Team
 */

function interpretTaskModes(
  file: Suite,
  namePattern?: string | RegExp,
  testLocations?: number[] | undefined,
  testIds?: string[] | undefined,
  testTagsFilter?: ((testTags: string[]) => boolean) | undefined,
  onlyMode?: boolean,
  parentIsOnly?: boolean,
  allowOnly?: boolean,
): void {
  const matchedLocations: number[] = [];

  const traverseSuite = (suite: Suite, parentIsOnly?: boolean, parentMatchedWithLocation?: boolean) => {
    const suiteIsOnly = parentIsOnly || suite.mode === 'only';

    // Check if any tasks in this suite have `.only` - if so, only those should run
    const hasSomeTasksOnly = onlyMode && suite.tasks.some(
      t => t.mode === 'only' || (t.type === 'suite' && someTasksAreOnly(t)),
    );

    suite.tasks.forEach((t) => {
      // Check if either the parent suite or the task itself are marked as included
      // If there are tasks with `.only` in this suite, only include those (not all tasks from describe.only)
      const includeTask = hasSomeTasksOnly
        ? (t.mode === 'only' || (t.type === 'suite' && someTasksAreOnly(t)))
        : (suiteIsOnly || t.mode === 'only');
      if (onlyMode) {
        if (t.type === 'suite' && (includeTask || someTasksAreOnly(t))) {
          // Don't skip this suite
          if (t.mode === 'only') {
            checkAllowOnly(t, allowOnly);
            t.mode = 'run';
          }
        }
        else if (t.mode === 'run' && !includeTask) {
          t.mode = 'skip';
        }
        else if (t.mode === 'only') {
          checkAllowOnly(t, allowOnly);
          t.mode = 'run';
        }
      }

      let hasLocationMatch = parentMatchedWithLocation
      // Match test location against provided locations, only run if present
      // in `testLocations`. Note: if `includeTaskLocation` is not enabled,
      // all test will be skipped.
      if (testLocations !== undefined && testLocations.length !== 0) {
        if (t.location && testLocations?.includes(t.location.line)) {
          t.mode = 'run';
          matchedLocations.push(t.location.line);
          hasLocationMatch = true;
        }
        else if (parentMatchedWithLocation) {
          t.mode = 'run';
        }
        else if (t.type === 'test') {
          t.mode = 'skip';
        }
      }

      if (t.type === 'test') {
        if (namePattern && !getTaskFullName(t).match(namePattern)) {
          t.mode = 'skip';
        }
        if (testIds && !testIds.includes(t.id)) {
          t.mode = 'skip';
        }
        if (testTagsFilter && !testTagsFilter(t.tags || [])) {
          t.mode = 'skip';
        }
      }
      else if (t.type === 'suite') {
        if (t.mode === 'skip') {
          skipAllTasks(t);
        }
        else if (t.mode === 'todo') {
          todoAllTasks(t);
        }
        else {
          traverseSuite(t, includeTask, hasLocationMatch);
        }
      }
    })

    // if all subtasks are skipped, mark as skip
    if (suite.mode === 'run' || suite.mode === 'queued') {
      if (suite.tasks.length && suite.tasks.every(i => i.mode !== 'run' && i.mode !== 'queued')) {
        suite.mode = 'skip';
      }
    }
  }

  traverseSuite(file, parentIsOnly, false);

  const nonMatching = testLocations?.filter(loc => !matchedLocations.includes(loc))
  if (nonMatching && nonMatching.length !== 0) {
    const message = nonMatching.length === 1
      ? `line ${nonMatching[0]}`
      : `lines ${nonMatching.join(', ')}`;

    if (file.result === undefined) {
      file.result = {
        state: 'fail',
        errors: [],
      };
    }
    if (file.result.errors === undefined) {
      file.result.errors = [];
    }

    file.result.errors.push(
      processError(new Error(`No test found in ${file.name} in ${message}`)),
    );
  }
}

function getTaskFullName(task: TaskBase): string {
  return `${task.suite ? `${getTaskFullName(task.suite)} ` : ''}${task.name}`;
}

function skipAllTasks(suite: Suite) {
  suite.tasks.forEach((t) => {
    if (t.mode === 'run' || t.mode === 'queued') {
      t.mode = 'skip';
      if (t.type === 'suite') {
        skipAllTasks(t);
      }
    }
  });
}

function todoAllTasks(suite: Suite) {
  suite.tasks.forEach((t) => {
    if (t.mode === 'run' || t.mode === 'queued') {
      t.mode = 'todo';
      if (t.type === 'suite') {
        todoAllTasks(t);
      }
    }
  });
}

function checkAllowOnly(task: TaskBase, allowOnly?: boolean) {
  if (allowOnly) {
    return;
  }
  const error = processError(
    new Error(
      '[Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error',
    ),
  );
  task.result = {
    state: 'fail',
    errors: [error],
  };
}
