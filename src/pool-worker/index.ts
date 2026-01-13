/**
 * Worker entry point - Tinypool
 */
import { workerId } from 'tinypool';

import type { RunFileTask } from '../types/types.js';
import { createRpcClient } from './rpc-reporter.js';
import { runFileGeneric } from './runner.js';

export async function runFile(taskData: RunFileTask): Promise<void> {
  const {
    file, poolOptions, port, isCollectTestsMode, projectRoot, collectCoverage, bail,
    relativeUserCoverageExclusions, diffOptions, testNamePattern, allowOnly, timedOutTest, timedOutCompilation
  } = taskData;

  const rpc = createRpcClient(port);
  
  return runFileGeneric(
    file,
    `WorkerThread ${workerId}`,
    rpc,
    port,
    isCollectTestsMode,
    poolOptions,
    projectRoot,
    collectCoverage,
    relativeUserCoverageExclusions,
    bail,
    diffOptions,
    testNamePattern,
    allowOnly,
    timedOutTest,
    timedOutCompilation,
  );
}
