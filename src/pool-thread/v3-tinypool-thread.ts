/**
 * Worker entry point - Tinypool (vitest v3)
 */
import { workerId } from 'tinypool';
// @ts-ignore - we build with v4, but this is correct for v3 runtime
import { highlight } from '@vitest/utils';

import type { ProcessPoolRunFileTask } from '../types/types.js';
import { createRpcClient } from './rpc-reporter.js';
import { runFile } from './runner.js';

export async function runTestFile(taskData: ProcessPoolRunFileTask): Promise<void> {
  const {
    file, poolOptions, port, isCollectTestsMode, projectRoot, collectCoverage, bail,
    relativeUserCoverageExclusions, diffOptions, testNamePattern, allowOnly,
    timedOutTest, timedOutCompilation
  } = taskData;

  const rpc = createRpcClient(port);
  
  return runFile(
    file,
    `WorkerThread ${workerId}`,
    rpc,
    port,
    isCollectTestsMode,
    poolOptions,
    projectRoot,
    collectCoverage,
    relativeUserCoverageExclusions,
    highlight,
    bail,
    diffOptions,
    testNamePattern,
    allowOnly,
    timedOutTest,
    timedOutCompilation,
  );
}
