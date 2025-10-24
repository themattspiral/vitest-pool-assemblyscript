/**
 * Worker entry point for Tinypool-based per-test parallelism
 *
 * This worker provides granular phase-specific functions:
 * - compileFile: Compile AssemblyScript to WASM (Phase 1 - once per file)
 * - discoverTests: Discover tests from compiled binary (Phase 2 - once per file)
 * - executeTest: Execute a single test with RPC reporting (Phase 3 - once per test)
 * - compileCoverageBinary: Compile coverage binary lazily (Phase 4 - once per file if needed)
 * - executeCoveragePass: Execute coverage collection for single test (Phase 5 - once per test in dual mode)
 *
 * The pool orchestrates these phases to enable pipeline parallelism with maximum CPU utilization.
 */

import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import type {
  CompileFileTask,
  CompileFileResult,
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestResult,
  CompileCoverageBinaryTask,
  CompileCoverageBinaryResult,
  ExecuteCoveragePassTask,
  ExecuteCoveragePassResult,
  ReportFileSummaryTask,
  ExecuteBeforeAllHooksTask,
  ExecuteAfterAllHooksTask,
} from '../types.js';
import { compileAssemblyScript } from '../compiler.js';
import {
  discoverTests as discoverTestsFromExecutor,
  executeSingleTest,
  collectCoverageForTest,
} from '../executor/index.js';
import { setDebug, debug, debugTiming } from '../utils/debug.mjs';
import {
  createRpcClient,
  createInitialFileTask,
  createFileTaskWithTests,
  createPhaseTimings,
  reportFileQueued,
  reportFileCollected,
  reportSuitePrepare,
} from './rpc-reporter.js';

// ============================================================================
// Worker Functions - Phase 1: Compilation
// ============================================================================

/**
 * Compile AssemblyScript file to WASM
 *
 * Compiles the test file with optional coverage instrumentation.
 * Returns both clean binary (for execution) and optionally coverage binary.
 *
 * Called via: pool.run(taskData, { name: 'compileFile' })
 *
 * @param taskData - Compilation task data
 * @returns Compiled binaries and metadata
 */
export async function compileFile(taskData: CompileFileTask): Promise<CompileFileResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] compileFile started for:', taskData.testFile);

  const timings = createPhaseTimings();
  const result = await compileAssemblyScript(taskData.testFile, {
    coverage: taskData.options.coverage ?? 'dual',
    stripInline: taskData.options.stripInline ?? true,
  });
  timings.phaseEnd = performance.now();
  debugTiming(`[TIMING] ${taskData.testFile} - compile: ${timings.phaseEnd - timings.phaseStart}ms`);

  if (result.error) {
    throw result.error;
  }

  debug('[Worker] compileFile complete for:', taskData.testFile);

  return {
    binary: result.binary,
    sourceMap: result.sourceMap,
    coverageBinary: result.coverageBinary,
    debugInfo: result.debugInfo,
    generation: taskData.generation,
    timings,
  };
}

// ============================================================================
// Worker Functions - Phase 2: Discovery
// ============================================================================

/**
 * Discover tests from compiled binary
 *
 * Instantiates the WASM binary and executes _start to register tests.
 * Returns the list of discovered tests with names and function indices.
 * Reports RPC events: onQueued, onCollected, suite-prepare.
 *
 * Called via: pool.run(taskData, { name: 'discoverTests', transferList: [port] })
 *
 * @param taskData - Discovery task data
 * @returns Discovered tests and discovery timings
 */
export async function discoverTests(taskData: DiscoverTestsTask): Promise<DiscoverTestsResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] discoverTests started for:', taskData.testFile);

  // Create RPC client
  const rpc = createRpcClient(taskData.port);

  // Create phase timings tracker for discovery
  const timings = createPhaseTimings();

  // Report onQueued
  const queuedFileTask = createInitialFileTask(taskData.testFile, taskData.projectInfo);
  await reportFileQueued(rpc, queuedFileTask);

  // Discover tests from binary
  const { tests } = await discoverTestsFromExecutor(taskData.binary, taskData.testFile);
  timings.phaseEnd = performance.now();

  debugTiming(`[TIMING] ${taskData.testFile} - discover: ${timings.phaseEnd - timings.phaseStart}ms`);

  // Create complete file task for onCollected with duration metadata
  const collectedFileTask = createFileTaskWithTests(
    taskData.testFile,
    taskData.projectInfo,
    tests,
    taskData.compileTimings,
    timings
  );

  // Report onCollected
  await reportFileCollected(rpc, collectedFileTask);

  // Report suite-prepare (will move to executeBeforeAllHooks when hooks are implemented)
  await reportSuitePrepare(rpc, collectedFileTask);

  debug('[Worker] discoverTests complete, discovered', tests.length, 'tests');

  return { tests, timings };
}

// ============================================================================
// Worker Functions - Phase 3: Test Execution
// ============================================================================

/**
 * Execute a single test with RPC reporting
 *
 * Executes one test in a fresh WASM instance and reports lifecycle events:
 * - test-prepare (before execution)
 * - test-finished (after execution with results)
 *
 * This function is called once per test for maximum parallelism.
 *
 * Called via: pool.run(taskData, { name: 'executeTest', transferList: [port] })
 *
 * @param taskData - Test execution task data
 * @returns Test result
 */
export async function executeTest(taskData: ExecuteTestTask): Promise<ExecuteTestResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] executeTest started for:', taskData.testTaskName);

  // Create RPC client from port
  const rpc = createRpcClient(taskData.port);

  // Report test-prepare
  const testStartTime = Date.now();
  const prepareResult = {
    state: 'run' as const,
    startTime: testStartTime,
  };
  const prepareTaskPack: TaskResultPack = [taskData.testTaskId, prepareResult, {}];
  const prepareEventPack: TaskEventPack = [taskData.testTaskId, 'test-prepare', undefined];

  debug('[Worker] Reporting test-prepare for:', taskData.testTaskName);
  await rpc.onTaskUpdate([prepareTaskPack], [prepareEventPack]);

  // Execute single test via executor
  const executeStart = performance.now();

  // Determine if we should collect coverage during execution (single-mode only)
  const collectCoverage = taskData.coverageBinary !== undefined;

  const testResult = await executeSingleTest(
    taskData.binary,
    taskData.test,
    taskData.sourceMap,
    taskData.testFile,
    { collectCoverage }
  );

  const executeEnd = performance.now();
  debugTiming(`[TIMING] ${taskData.testFile} - test ${taskData.testIndex}: ${executeEnd - executeStart}ms`);

  // Report test-finished
  const finishedResult = {
    state: testResult.passed ? ('pass' as const) : ('fail' as const),
    errors: testResult.error ? [testResult.error] : undefined,
    duration: testResult.duration,
    startTime: testResult.startTime,
  };
  const finishedTaskPack: TaskResultPack = [taskData.testTaskId, finishedResult, {}];
  const finishedEventPack: TaskEventPack = [taskData.testTaskId, 'test-finished', undefined];

  debug('[Worker] Reporting test-finished for:', taskData.testTaskName, 'duration:', testResult.duration);
  await rpc.onTaskUpdate([finishedTaskPack], [finishedEventPack]);

  debug('[Worker] executeTest complete for:', taskData.testTaskName);

  return {
    result: testResult,
    testIndex: taskData.testIndex,
  };
}

// ============================================================================
// Worker Functions - Phase 4: Coverage Binary Compilation (Lazy)
// ============================================================================

/**
 * Compile coverage binary (lazy compilation in parallel with test execution)
 *
 * This function compiles the instrumented coverage binary on-demand.
 * The pool can queue this to run in parallel with test execution to maximize CPU utilization.
 *
 * Called via: pool.run(taskData, { name: 'compileCoverageBinary' })
 *
 * @param taskData - Coverage binary compilation task data
 * @returns Compiled coverage binary
 */
export async function compileCoverageBinary(
  taskData: CompileCoverageBinaryTask
): Promise<CompileCoverageBinaryResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] compileCoverageBinary started for:', taskData.testFile);

  const compileStart = performance.now();
  const result = await compileAssemblyScript(taskData.testFile, {
    coverage: true, // Always compile with coverage instrumentation
    stripInline: taskData.options.stripInline ?? true,
  });
  const compileEnd = performance.now();
  debugTiming(`[TIMING] ${taskData.testFile} - coverage binary compile: ${compileEnd - compileStart}ms`);

  if (result.error) {
    throw result.error;
  }

  if (!result.coverageBinary) {
    throw new Error(`Coverage binary compilation failed for: ${taskData.testFile}`);
  }

  debug('[Worker] compileCoverageBinary complete for:', taskData.testFile);

  return {
    coverageBinary: result.coverageBinary,
    debugInfo: result.debugInfo,
  };
}

// ============================================================================
// Worker Functions - Phase 5: Coverage Collection
// ============================================================================

/**
 * Execute coverage collection pass for a single test
 *
 * Re-runs the test on the instrumented coverage binary to collect coverage data.
 * This is used in dual-mode coverage where we execute tests on clean binary
 * (accurate errors) and collect coverage separately on instrumented binary.
 *
 * Called via: pool.run(taskData, { name: 'executeCoveragePass' })
 *
 * @param taskData - Coverage collection task data
 * @returns Coverage data for this test
 */
export async function executeCoveragePass(
  taskData: ExecuteCoveragePassTask
): Promise<ExecuteCoveragePassResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] executeCoveragePass started for test:', taskData.test.name);

  const coverage = await collectCoverageForTest(taskData.coverageBinary, taskData.test);

  debug('[Worker] executeCoveragePass complete, collected coverage for:', taskData.test.name);

  return { coverage };
}

// ============================================================================
// Worker Functions - Phase 6: File Summary Reporting
// ============================================================================

/**
 * Report file summary after all tests complete
 *
 * Reports suite-finished and final flush events to close out the file execution.
 * This is called after all tests in a file have completed.
 *
 * Called via: pool.run(taskData, { name: 'reportFileSummary', transferList: [port] })
 *
 * @param taskData - File summary reporting task data
 * @returns void
 */
export async function reportFileSummary(taskData: ReportFileSummaryTask): Promise<void> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] reportFileSummary started for:', taskData.testFile);

  // Create RPC client
  const rpc = createRpcClient(taskData.port);

  // Report suite-finished
  const fileTask = taskData.fileTask;
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result!, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

  debug('[Worker] Reporting suite-finished for:', taskData.testFile);
  await rpc.onTaskUpdate([taskPack], [eventPack]);

  // Final flush
  debug('[Worker] Sending final flush');
  await rpc.onTaskUpdate([], []);

  debug('[Worker] reportFileSummary complete');
}

// ============================================================================
// Worker Functions - Hook Execution (Not Yet Implemented)
// ============================================================================

/**
 * Execute beforeAll hooks and report suite-prepare
 * Not yet implemented - placeholder for future hook support
 *
 * When implemented:
 * - Reports suite-prepare (moves from discoverTests)
 * - Executes beforeAll hooks sequentially
 * - Reports before-hook-start/end for each hook
 * - Blocks test execution until complete
 */
export async function executeBeforeAllHooks(taskData: ExecuteBeforeAllHooksTask): Promise<void> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] executeBeforeAllHooks not yet implemented');
  throw new Error('executeBeforeAllHooks not yet implemented');
}

/**
 * Execute afterAll hooks
 * Not yet implemented - placeholder for future hook support
 *
 * When implemented:
 * - Executes afterAll hooks sequentially
 * - Reports after-hook-start/end for each hook
 * - Blocks suite-finished until complete
 */
export async function executeAfterAllHooks(taskData: ExecuteAfterAllHooksTask): Promise<void> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] executeAfterAllHooks not yet implemented');
  throw new Error('executeAfterAllHooks not yet implemented');
}
