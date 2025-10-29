import type { TestProject } from 'vitest/node';
import { createMethodsRPC } from 'vitest/node';
import type { RuntimeRPC } from 'vitest';
import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import type { RunnerTestFile } from 'vitest/node';
import { createBirpc } from 'birpc';
import { MessageChannel } from 'node:worker_threads';
import type { WorkerChannel } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Create a MessageChannel with RPC for worker communication
 *
 * This is used for suite-level events (onQueued, onCollected, suite-prepare, suite-finished).
 * Test-level events are reported directly by workers via their own MessagePorts.
 *
 * @param project - Vitest project with full TestProject object
 * @param collect - Whether this is for collection (true) or execution (false)
 * @returns Object with workerPort (to send to worker) and poolPort (for cleanup) and rpc client
 */
export function createWorkerChannel(project: TestProject, collect: boolean): WorkerChannel {
  const channel = new MessageChannel();
  const workerPort = channel.port1;
  const poolPort = channel.port2;

  debug('[Pool] Creating RPC with collect:', collect);

  // Wrap the methods to add logging
  const methods = createMethodsRPC(project, { collect });
  const wrappedMethods = {
    ...methods,
    onCollected: async (files: RunnerTestFile[]) => {
      debug('[Pool] RPC received onCollected with', files.length, 'files, collect:', collect);
      debug('[Pool] First file - id:', files[0]?.id, 'filepath:', files[0]?.filepath, 'tasks:', files[0]?.tasks?.length);
      return methods.onCollected(files);
    },
    onTaskUpdate: async (packs: TaskResultPack[], events: TaskEventPack[]) => {
      debug('[Pool] RPC received onTaskUpdate with', packs.length, 'packs');
      return methods.onTaskUpdate(packs, events);
    },
  };

  // Create RPC in pool (has access to full TestProject)
  const rpc = createBirpc<RuntimeRPC, typeof wrappedMethods>(
    wrappedMethods,
    {
      post: (v) => poolPort.postMessage(v),
      on: (fn) => poolPort.on('message', fn),
    }
  );

  return { workerPort, poolPort, rpc };
}
