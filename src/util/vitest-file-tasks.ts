import { relative } from 'node:path';
import type {
  RunnerTestFile,
  RunnerTestSuite,
  RunnerTask,
  RunnerTaskBase,
} from 'vitest';
import { processError } from '@vitest/utils/error';

import { ASSEMBLYSCRIPT_POOL_NAME } from '../types/constants.js';
import { DEFAULT_ASSEMBLYSCRIPT_TEST_OPTIONS } from '../types/typed-constants.js';
import type {
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  VitestVersion,
} from '../types/types.js';
import { finalizeSuiteResult } from './vitest-tasks.js';

/**
 * Maps vitest's `version` string (from `vitest/node`) to our `VitestVersion`.
 * Used to select the file-id hash seed, which vitest changed between majors —
 * see generateFileHash. Callers on the v3 pool already know they are `'v3'` and
 * don't need this; it exists for the v4/v5 pool, which shares one entry point.
 */
export function parseVitestVersion(version: string): VitestVersion {
  const major = parseInt(version, 10);
  if (major >= 5) {
    // v5 and any newer major (we assume the v5 file-id seed until proven otherwise)
    return 'v5';
  } else if (major === 4) {
    return 'v4';
  } else {
    return 'v3';
  }
}

export function createInitialFileTask(
  testFile: string,
  projectName: string,
  projectRoot: string,
  configTestTimeout: number,
  configRetry: number,
  vitestVersion: VitestVersion,
): RunnerTestFile {
  const file: RunnerTestFile = createFileTask(
    testFile,
    projectRoot,
    projectName,
    ASSEMBLYSCRIPT_POOL_NAME,
    vitestVersion
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

export function prepareFileTaskForCollection(
  file: RunnerTestFile,
  testNamePattern?: RegExp,
  allowOnly?: boolean,
): void {
  assignPositionalTaskIds(file);

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
  file: RunnerTestFile,
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

export function getFullTaskHierarchy(file: RunnerTestFile): string {
  function spacesForLevel(level: number): string {
    return new Array(level + 1).fill('  ').join('');
  }

  function taskStr(task: RunnerTask, level: number): string {
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
// Vitest task utilities — recreated
// ============================================================================
//
// These helpers were previously imported from `@vitest/runner/utils` (and, for
// interpretTaskModes, adapted from `@vitest/runner/src/utils/collect`). Vitest
// inlined the `@vitest/runner` package into `vitest` and stopped publishing it
// (vitest 5), and none of these utilities are exposed from a public `vitest`
// entry point, so we recreate them here.
//
// interpretTaskModes is additionally kept local because its signature changed
// between vitest 4.0.x and 4.1.x — owning it avoids a version-compat conflict.
//
// @see https://github.com/vitest-dev/vitest/blob/main/packages/vitest/src/utils/tasks.ts
// @see https://github.com/vitest-dev/vitest/blob/v4.1.0/packages/runner/src/utils/collect.ts
//
// Vitest is released under the MIT license, included in this project's root.
// Copyright (c) 2021-Present Vitest Team

/**
 * Builds the file-level `File` task for a spec. Recreated from vitest's
 * `createFileTask`, trimmed to the arguments we use (we never pass task meta or a
 * vite environment) and with the worker-runtime global lookup dropped — that
 * global (`__vitest_worker__`) only exists inside vitest's own worker runtime, so
 * in our threads it was always absent and `concurrencyId`/`workerId` always
 * resolved to 0 anyway.
 *
 * The file `id` must equal what the running vitest's own `generateFileHash`
 * produces for the same spec: vitest core computes that id independently
 * (`TestSpecification.taskId`) and correlates our reported results and errors
 * through its `idMap` by it, so a mismatch silently drops them. It also recomputes
 * the id on the cancel path (`state.cancelFiles`). vitest changed the hash seed in
 * v5, so the seed is version-selected — see generateFileHash.
 */
function createFileTask(
  filepath: string,
  root: string,
  projectName: string | undefined,
  pool: string,
  vitestVersion: VitestVersion,
): RunnerTestFile {
  // vitest hashes and names the file by its root-relative path in UNIX
  // (forward-slash) form — it uses pathe, which normalizes separators. Node's
  // `relative` yields backslashes on Windows, so normalize to keep ids and names
  // identical across platforms (and matching vitest's).
  const relativePath = relative(root, filepath).replaceAll('\\', '/');

  const file: RunnerTestFile = {
    id: generateFileHash(relativePath, projectName, vitestVersion),
    name: relativePath,
    fullName: relativePath,
    type: 'suite',
    mode: 'queued',
    filepath,
    tasks: [],
    meta: Object.create(null),
    projectName,
    pool,
    concurrencyId: 0,
    workerId: 0,
    // A file task is the root of its own tree, so `file` points back at itself.
    // It can't reference itself during construction, so it's assigned just below;
    // the assertion keeps every other field type-checked (vitest does the same).
    file: undefined!,
  };
  file.file = file;

  return file;
}

/**
 * Deterministic file `id` derived from the root-relative path and project name.
 * Recreated from vitest's `generateFileHash`, whose seed differs by major: v3 and
 * v4 concatenate path and project name directly, while v5 null-separates them and
 * appends two empty slots (vitest's `__typecheck__` and `__vitest_label__` meta,
 * which AS files never set). We select the seed by version so the id stays
 * byte-identical to the running vitest's — see createFileTask for why that matters.
 */
function generateFileHash(
  relativePath: string,
  projectName: string | undefined,
  vitestVersion: VitestVersion,
): string {
  const seed = vitestVersion === 'v5'
    ? [relativePath, projectName || '', '', ''].join('\0')
    : `${relativePath}${projectName || ''}`;
  return generateHash(seed);
}

/** 32-bit string hash. Recreated verbatim from vitest's `generateHash`. */
function generateHash(str: string): string {
  let hash = 0;
  if (str.length === 0) {
    return `${hash}`;
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `${hash}`;
}

/**
 * Assigns every task in the tree a positional, hierarchical id derived from its
 * parent's id and its index among siblings (`${parent.id}_${index}`), recursing
 * into nested suites. These ids are the stable keys vitest uses to correlate later
 * result updates and console logs back to each test/suite, so they must be
 * assigned before the collected tree is reported.
 *
 * Recreated from vitest's `calculateSuiteHash` (whose name is a misnomer — it
 * assigns positional ids, it does not compute a hash).
 */
function assignPositionalTaskIds(parent: RunnerTestSuite): void {
  parent.tasks.forEach((task, idx) => {
    task.id = `${parent.id}_${idx}`;
    if (task.type === 'suite') {
      assignPositionalTaskIds(task);
    }
  });
}

/** True if any task in the tree uses `.only`. Recreated from vitest's `someTasksAreOnly`. */
function someTasksAreOnly(suite: RunnerTestSuite): boolean {
  return suite.tasks.some(
    task => task.mode === 'only' || (task.type === 'suite' && someTasksAreOnly(task)),
  );
}

/**
 * If any tasks have been marked as `only`, mark all other tasks as `skip`.
 *
 * The function interface changed between vitest 4.0.x and 4.1.x, so we handle this
 * functionality ourselves to prevent version compat conflicts.
 */
function interpretTaskModes(
  file: RunnerTestSuite,
  namePattern?: string | RegExp,
  testLocations?: number[] | undefined,
  testIds?: string[] | undefined,
  testTagsFilter?: ((testTags: string[]) => boolean) | undefined,
  onlyMode?: boolean,
  parentIsOnly?: boolean,
  allowOnly?: boolean,
): void {
  const matchedLocations: number[] = [];

  const traverseSuite = (suite: RunnerTestSuite, parentIsOnly?: boolean, parentMatchedWithLocation?: boolean) => {
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

function getTaskFullName(task: RunnerTaskBase): string {
  return `${task.suite ? `${getTaskFullName(task.suite)} ` : ''}${task.name}`;
}

function skipAllTasks(suite: RunnerTestSuite) {
  suite.tasks.forEach((t) => {
    if (t.mode === 'run' || t.mode === 'queued') {
      t.mode = 'skip';
      if (t.type === 'suite') {
        skipAllTasks(t);
      }
    }
  });
}

function todoAllTasks(suite: RunnerTestSuite) {
  suite.tasks.forEach((t) => {
    if (t.mode === 'run' || t.mode === 'queued') {
      t.mode = 'todo';
      if (t.type === 'suite') {
        todoAllTasks(t);
      }
    }
  });
}

function checkAllowOnly(task: RunnerTaskBase, allowOnly?: boolean) {
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
