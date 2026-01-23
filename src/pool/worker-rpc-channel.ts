import { MessageChannel } from 'node:worker_threads';
import { createBirpc } from 'birpc';
import type { RunnerRPC, RuntimeRPC } from 'vitest';
import { type TestProject, createMethodsRPC } from 'vitest/node';

import type { WorkerChannel } from '../types/types.js';

/**
 * Create a MessageChannel with RPC for worker thread communication
 */
export function createWorkerRPCChannel(project: TestProject, collect: boolean): WorkerChannel {
  const channel = new MessageChannel();
  const workerPort = channel.port1;
  const poolPort = channel.port2;

  const methods = createMethodsRPC(project, { collect });

  // Create RPC in pool
  const rpc = createBirpc<RuntimeRPC, RunnerRPC>(
    methods,
    {
      post: (v) => poolPort.postMessage(v),
      on: (fn) => poolPort.on('message', fn),
    }
  );

  return { workerPort, poolPort, rpc };
}
