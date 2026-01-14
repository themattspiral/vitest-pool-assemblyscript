import { MessageChannel } from 'node:worker_threads';
import { createBirpc } from 'birpc';
import type { RuntimeRPC } from 'vitest';
import { type TestProject, createMethodsRPC } from 'vitest/node';
import type { File, TaskEventPack, TaskResultPack } from '@vitest/runner/types';

import type { WorkerChannel } from '../../types/types.js';
import { debug } from '../../util/debug.js';

const DEBUG_POOLSIDE_RPC = false;

function rpcPoolsideDebug(...args: any[]): void {
  if (DEBUG_POOLSIDE_RPC) {
    debug(...args);
  }
};

/**
 * Create a MessageChannel with RPC for worker thread communication
 */
export function createWorkerChannel(project: TestProject, collect: boolean): WorkerChannel {
  const channel = new MessageChannel();
  const workerPort = channel.port1;
  const poolPort = channel.port2;

  rpcPoolsideDebug('[Pool] Creating Worker RPC Message Channel - collectTests:', collect);

  // Wrap the methods to add logging
  const methods = createMethodsRPC(project, { collect });
  const wrappedMethods = {
    ...methods,
    onCollected: async (files: File[]) => {
      rpcPoolsideDebug('[Pool] RPC received onCollected with', files.length, 'files, collect:', collect);
      rpcPoolsideDebug('[Pool] First file - id:', files[0]?.id, 'filepath:', files[0]?.filepath, 'tasks:', files[0]?.tasks?.length);
      return methods.onCollected(files);
    },
    onTaskUpdate: async (packs: TaskResultPack[], events: TaskEventPack[]) => {
      rpcPoolsideDebug('[Pool] RPC received onTaskUpdate with', packs.length, 'packs');
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
