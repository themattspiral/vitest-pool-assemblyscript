import type { File, Task } from '@vitest/runner/types';
import {
  calculateSuiteHash,
  createFileTask,
  interpretTaskModes,
  someTasksAreOnly
} from '@vitest/runner/utils';

import { ASSEMBLYSCRIPT_POOL_NAME } from '../types/constants.js';
import { DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS } from '../types/typed-constants.js';
import type {
  AssemblyScriptResolvedConfig,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
} from '../types/types.js';

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
