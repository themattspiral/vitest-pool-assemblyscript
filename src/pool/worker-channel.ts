import { MessageChannel } from 'node:worker_threads';
import { createBirpc } from 'birpc';
import type { RuntimeRPC } from 'vitest';
import { type TestProject, createMethodsRPC } from 'vitest/node';
import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import type { File } from '@vitest/runner/types';

import type { WorkerChannel } from '../types/types.js';
import { debug } from '../util/debug.js';

const DEBUG_RPC = false;

function rpcDebug(...args: any[]): void {
  if (DEBUG_RPC) {
    debug(...args);
  }
};

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

  rpcDebug('[Pool] Creating Worker RPC Message Channel - collectTests:', collect);

  // Wrap the methods to add logging
  const methods = createMethodsRPC(project, { collect });
  const wrappedMethods = {
    ...methods,
    onCollected: async (files: File[]) => {
      rpcDebug('[Pool] RPC received onCollected with', files.length, 'files, collect:', collect);
      rpcDebug('[Pool] First file - id:', files[0]?.id, 'filepath:', files[0]?.filepath, 'tasks:', files[0]?.tasks?.length);
      return methods.onCollected(files);
    },
    onTaskUpdate: async (packs: TaskResultPack[], events: TaskEventPack[]) => {
      rpcDebug('[Pool] RPC received onTaskUpdate with', packs.length, 'packs');
      return methods.onTaskUpdate(packs, events);
    },
  };

  // Create RPC in pool
  const rpc = createBirpc<RuntimeRPC, typeof wrappedMethods>(
    wrappedMethods,
    {
      post: (v) => poolPort.postMessage(v),
      on: (fn) => poolPort.on('message', fn),
    }
  );

  return { workerPort, poolPort, rpc };
}
