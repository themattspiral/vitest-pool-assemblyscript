import { describe, test, expect, vi } from 'vitest';
import type { RunnerTestCase, RunnerTestFile, RunnerTestSuite } from 'vitest';

import { collectHookChainLevels } from '../../../src/util/vitest-tasks.js';
import { reportTestHookState } from '../../../src/pool-thread/rpc-reporter.js';
import type { SuiteHookFnIndexes, WorkerRPC } from '../../../src/types/types.js';

// ── Minimal task-tree builders (only the fields the helpers read) ──

function fileTask(hooks: SuiteHookFnIndexes): RunnerTestFile {
  const file = {
    type: 'suite',
    id: 'file-id',
    name: 'file.as.test.ts',
    tasks: [],
    meta: { hooks },
  } as unknown as RunnerTestFile;
  file.file = file;
  return file;
}

function suiteTask(name: string, parent: RunnerTestSuite, hooks: SuiteHookFnIndexes): RunnerTestSuite {
  return {
    type: 'suite',
    id: `${parent.id}_${name}`,
    name,
    file: parent.file,
    suite: parent,
    tasks: [],
    meta: { hooks },
  } as unknown as RunnerTestSuite;
}

function testTask(parent: RunnerTestSuite): RunnerTestCase {
  return {
    type: 'test',
    id: `${parent.id}_test`,
    name: 'a test',
    file: parent.file,
    suite: parent,
    meta: {},
    result: { state: 'run' },
  } as unknown as RunnerTestCase;
}

const noHooks = (): SuiteHookFnIndexes => ({ beforeEach: [], afterEach: [] });

describe('collectHookChainLevels', () => {
  test('resolves beforeEach outermost-first and afterEach innermost-first', () => {
    const file = fileTask({ beforeEach: [1], afterEach: [2] });
    const outer = suiteTask('outer', file, { beforeEach: [3], afterEach: [4] });
    const inner = suiteTask('inner', outer, { beforeEach: [5], afterEach: [6] });
    const chains = collectHookChainLevels(testTask(inner));

    expect(chains.beforeEach.map(l => l.fnIndexes)).toEqual([[1], [3], [5]]);
    expect(chains.beforeEach.map(l => l.suiteName)).toEqual(['file.as.test.ts', 'outer', 'inner']);
    expect(chains.afterEach.map(l => l.fnIndexes)).toEqual([[6], [4], [2]]);
    expect(chains.afterEach.map(l => l.suiteName)).toEqual(['inner', 'outer', 'file.as.test.ts']);
  });

  test("within a suite: beforeEach keeps registration order, afterEach reverses it (vitest 'stack' default)", () => {
    const file = fileTask({ beforeEach: [10, 11, 12], afterEach: [20, 21, 22] });
    const chains = collectHookChainLevels(testTask(file));

    expect(chains.beforeEach).toEqual([{ suiteName: 'file.as.test.ts', fnIndexes: [10, 11, 12] }]);
    expect(chains.afterEach).toEqual([{ suiteName: 'file.as.test.ts', fnIndexes: [22, 21, 20] }]);
  });

  test('suite levels without hooks are omitted from the chains', () => {
    const file = fileTask(noHooks());
    const outer = suiteTask('outer', file, { beforeEach: [1], afterEach: [] });
    const inner = suiteTask('inner', outer, noHooks());
    const chains = collectHookChainLevels(testTask(inner));

    expect(chains.beforeEach).toEqual([{ suiteName: 'outer', fnIndexes: [1] }]);
    expect(chains.afterEach).toEqual([]);
  });

  test('a top-level test resolves file-level hooks only', () => {
    const file = fileTask({ beforeEach: [7], afterEach: [8] });
    const chains = collectHookChainLevels(testTask(file));

    expect(chains.beforeEach).toEqual([{ suiteName: 'file.as.test.ts', fnIndexes: [7] }]);
    expect(chains.afterEach).toEqual([{ suiteName: 'file.as.test.ts', fnIndexes: [8] }]);
  });

  test('does not mutate the stored hook registrations', () => {
    const hooks: SuiteHookFnIndexes = { beforeEach: [1, 2], afterEach: [3, 4] };
    const file = fileTask(hooks);
    collectHookChainLevels(testTask(file));

    expect(hooks.beforeEach).toEqual([1, 2]);
    expect(hooks.afterEach).toEqual([3, 4]); // reversal happens on a copy
  });
});

describe('reportTestHookState', () => {
  function mockRpc(): { rpc: WorkerRPC; onTaskUpdate: ReturnType<typeof vi.fn> } {
    const onTaskUpdate = vi.fn(async () => {});
    return { rpc: { onTaskUpdate } as unknown as WorkerRPC, onTaskUpdate };
  }

  test.each([
    ['beforeEach', 'run', 'before-hook-start'],
    ['beforeEach', 'pass', 'before-hook-end'],
    ['afterEach', 'run', 'after-hook-start'],
    ['afterEach', 'pass', 'after-hook-end'],
  ] as const)('%s + %s emits %s', async (hookKey, state, expectedEvent) => {
    const { rpc, onTaskUpdate } = mockRpc();
    const file = fileTask(noHooks());
    const task = testTask(file);
    task.result!.hooks = {};
    task.result!.hooks[hookKey] = state;

    await reportTestHookState(rpc, task, hookKey, state, 'Test', 'file.as.test.ts');

    expect(onTaskUpdate).toHaveBeenCalledExactlyOnceWith(
      [[task.id, task.result, {}]],
      [[task.id, expectedEvent, undefined]],
    );
  });

  // vitest's runner never emits a hook event after a hook throws — an end
  // event would read as success to a consumer of the stream. The recorded
  // 'fail' state travels inside the result on subsequent task packs instead.
  test.each([
    ['beforeEach'],
    ['afterEach'],
  ] as const)('%s + fail emits no event', async (hookKey) => {
    const { rpc, onTaskUpdate } = mockRpc();
    const file = fileTask(noHooks());
    const task = testTask(file);
    task.result!.hooks = {};
    task.result!.hooks[hookKey] = 'fail';

    await reportTestHookState(rpc, task, hookKey, 'fail', 'Test', 'file.as.test.ts');

    expect(onTaskUpdate).not.toHaveBeenCalled();
  });
});
