import { version } from 'vitest/node';
import type { Test, Suite, File } from '@vitest/runner/types';
import semver from 'semver';
import { Colors } from 'tinyrainbow';

import { AssemblyScriptCoveragePayload, AssemblyScriptTestOptions } from '../types/types.js';
import { getInitialSuiteTaskMeta, getInitialTaskMode, getInitialTestTaskMeta } from './vitest-tasks.js';

export const VITEST_VERSION: string = version;
export const IS_VITEST_V4: boolean = semver.satisfies(version, '^4.0.0');
export const IS_VITEST_V3: boolean = semver.satisfies(version, '^3.2.0');

// @ts-ignore
const { highlight } = IS_VITEST_V3
  ? await import('@vitest/utils')
  : await import('@vitest/utils/highlight');

const { createTaskName } = IS_VITEST_V3
  ? { createTaskName: () => '' as const }
  : await import('@vitest/runner/utils');

export function createAfterSuiteRunMeta(
  coverage: AssemblyScriptCoveragePayload,
  testFiles: string[],
  projectName?: string
): any {
  const base = { coverage, testFiles, projectName };

  if (IS_VITEST_V3) {
    return { ...base, transformMode: 'ssr' as const };
  } else {
    return { ...base, environment: 'node' as const };
  }
}

// same performance guard used in vitest `printError`
const MAX_CODE_HIGHLIGHT_LENGTH = 100_000 as const;

export function highlightCode(code: string, options?: { jsx?: boolean, colors?: Colors }): string {
  return code.length < MAX_CODE_HIGHLIGHT_LENGTH ? highlight(code, options) as string : code;
}

export function createTestTask(
  name: string,
  fnIndex: number,
  file: File,
  parent: Suite,
  mergedOptions: AssemblyScriptTestOptions,
): Test {
  const test: Test = {
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
    meta: {},
    mode: getInitialTaskMode(mergedOptions),
    timeout: mergedOptions.timeout,
    retry: mergedOptions.retry,
    fails: mergedOptions.fails,
  };

  if (IS_VITEST_V3) {
    // @ts-ignore
    delete test.fullName;
    // @ts-ignore
    delete test.fullTestName;
    // @ts-ignore
    delete test.artifacts;
  }

  parent.tasks.push(test);

  // use custom TaskMeta to capture fnIndex, parent task index, etc
  test.meta = getInitialTestTaskMeta(fnIndex, parent);

  return test;
}

export function createSuiteTask(
  name: string,
  file: File,
  parent: Suite,
  mergedOptions: AssemblyScriptTestOptions,
): Suite {
  // const suiteIsFile = parent.file.id === parent.id;
  // const prefix = suiteIsFile ? parent.name : `${file.filepath}_${parent.name}`;
  const suite: Suite = {
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

  if (IS_VITEST_V3) {
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
