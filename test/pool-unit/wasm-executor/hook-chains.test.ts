import { describe, test, expect, vi } from 'vitest';
import type { RunnerTestCase, RunnerTestFile, RunnerTestSuite } from 'vitest';

import { collectHookChainLevels } from '../../../src/util/vitest-tasks.js';
import { reportTestHookState } from '../../../src/pool-thread/rpc-reporter.js';
import type { SuiteHookRegistration, SuiteHookRegistrations, WorkerRPC } from '../../../src/types/types.js';

// ── Minimal task-tree builders (only the fields the helpers read) ──

function fileTask(hooks: SuiteHookRegistrations): RunnerTestFile {
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

function suiteTask(name: string, parent: RunnerTestSuite, hooks: SuiteHookRegistrations): RunnerTestSuite {
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

// registration builder — a distinctive default keeps timeout assertions honest
// (it matches neither the config hookTimeout default nor any per-hook value under test)
const reg = (fnIndex: number, timeout: number = 5555): SuiteHookRegistration => ({ fnIndex, timeout });

const noHooks = (): SuiteHookRegistrations => ({ beforeEach: [], afterEach: [] });

describe('collectHookChainLevels', () => {
  test('resolves beforeEach outermost-first and afterEach innermost-first', () => {
    const file = fileTask({ beforeEach: [reg(1)], afterEach: [reg(2)] });
    const outer = suiteTask('outer', file, { beforeEach: [reg(3)], afterEach: [reg(4)] });
    const inner = suiteTask('inner', outer, { beforeEach: [reg(5)], afterEach: [reg(6)] });
    const chains = collectHookChainLevels(testTask(inner));

    expect(chains.beforeEach.map(l => l.registrations.map(r => r.fnIndex))).toEqual([[1], [3], [5]]);
    expect(chains.beforeEach.map(l => l.suiteName)).toEqual(['file.as.test.ts', 'outer', 'inner']);
    expect(chains.afterEach.map(l => l.registrations.map(r => r.fnIndex))).toEqual([[6], [4], [2]]);
    expect(chains.afterEach.map(l => l.suiteName)).toEqual(['inner', 'outer', 'file.as.test.ts']);
  });

  test("within a suite: beforeEach keeps registration order, afterEach reverses it (vitest 'stack' default)", () => {
    const file = fileTask({
      beforeEach: [reg(10), reg(11), reg(12)],
      afterEach: [reg(20), reg(21), reg(22)],
    });
    const chains = collectHookChainLevels(testTask(file));

    expect(chains.beforeEach).toEqual([{ suiteName: 'file.as.test.ts', registrations: [reg(10), reg(11), reg(12)] }]);
    expect(chains.afterEach).toEqual([{ suiteName: 'file.as.test.ts', registrations: [reg(22), reg(21), reg(20)] }]);
  });

  test('per-hook effective timeouts ride along the chains, staying paired through reversal', () => {
    const file = fileTask({
      beforeEach: [reg(1, 100), reg(2, 200)],
      afterEach: [reg(3, 300), reg(4, 400)],
    });
    const chains = collectHookChainLevels(testTask(file));

    expect(chains.beforeEach[0]!.registrations).toEqual([{ fnIndex: 1, timeout: 100 }, { fnIndex: 2, timeout: 200 }]);
    expect(chains.afterEach[0]!.registrations).toEqual([{ fnIndex: 4, timeout: 400 }, { fnIndex: 3, timeout: 300 }]);
  });

  test('suite levels without hooks are omitted from the chains', () => {
    const file = fileTask(noHooks());
    const outer = suiteTask('outer', file, { beforeEach: [reg(1)], afterEach: [] });
    const inner = suiteTask('inner', outer, noHooks());
    const chains = collectHookChainLevels(testTask(inner));

    expect(chains.beforeEach).toEqual([{ suiteName: 'outer', registrations: [reg(1)] }]);
    expect(chains.afterEach).toEqual([]);
  });

  test('a top-level test resolves file-level hooks only', () => {
    const file = fileTask({ beforeEach: [reg(7)], afterEach: [reg(8)] });
    const chains = collectHookChainLevels(testTask(file));

    expect(chains.beforeEach).toEqual([{ suiteName: 'file.as.test.ts', registrations: [reg(7)] }]);
    expect(chains.afterEach).toEqual([{ suiteName: 'file.as.test.ts', registrations: [reg(8)] }]);
  });

  test('does not mutate the stored hook registrations', () => {
    const hooks: SuiteHookRegistrations = { beforeEach: [reg(1), reg(2)], afterEach: [reg(3), reg(4)] };
    const file = fileTask(hooks);
    collectHookChainLevels(testTask(file));

    expect(hooks.beforeEach).toEqual([reg(1), reg(2)]);
    expect(hooks.afterEach).toEqual([reg(3), reg(4)]); // reversal happens on a copy
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
