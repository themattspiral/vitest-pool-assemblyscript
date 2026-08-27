import { describe, test, expect, beforeAll } from 'vitest';
import {
  loadParsedCliOutput, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const FIXTURE_FILE = 'pool-options/stdlib-imports.meta.test.ts';
const FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${FIXTURE_FILE}`;

/**
 * Verify that console output attributed to a specific test contains the
 * expected content on the line(s) immediately following the attribution header.
 *
 * Vitest attributes console output with a header line:
 *   "stdout | filepath > testname"  or  "stderr | filepath > testname"
 * followed by the content on the next line(s)
 */
function expectConsoleOutput(
  lines: string[],
  testName: string,
  stream: 'stdout' | 'stderr',
  nextLinesToCompare: number = 1,
) {
  const suiteName = 'AssemblyScript console stdlib interface - pool provided functions';
  const fullTestName = `${FIXTURE_PATH} > ${suiteName} > ${testName}`;
  const attribution = `${stream} | ${fullTestName}`;
  const headerIdx = lines.findIndex(l => l === attribution);

  expect(headerIdx, `No ${stream} attribution found for "${attribution}"`).toBeGreaterThan(-1);

  const nextLine = nextLinesToCompare === 1
    ? lines[headerIdx + 1] ?? ''
    : lines.slice(headerIdx + 1, headerIdx + 1 + nextLinesToCompare).join('\n');

  return expect(nextLine, `${nextLinesToCompare === 1 ? 'Line' : 'Lines'} after "${attribution}" was not expected`);
}

let lines: string[];

beforeAll(async () => {
  const parsedCliOutput = await loadParsedCliOutput();
  lines = parsedCliOutput.testReportOutput.split('\n');
});

describe('AssemblyScript console stdlib interface - pool provided functions verification', () => {
  
  
  test('console.log attributed via stdout', () => {
    expectConsoleOutput(lines, 'console log', 'stdout').toBe('this is a log');
  });

  test('console.info prefixed with "Info:" and attributed via stdout', () => {
    expectConsoleOutput(lines, 'console info', 'stdout').toBe('Info: this is info');
  });

  test('console.warn prefixed with "Warning:" and attributed via stderr', () => {
    expectConsoleOutput(lines, 'console warn', 'stderr').toBe('Warning: this is a warning');
  });

  test('console.error prefixed with "Error:" and attributed via stderr', () => {
    expectConsoleOutput(lines, 'console error', 'stderr').toBe('Error: This is an error!!');
  });

  test('console.debug prefixed with "Debug:" and attributed via stdout', () => {
    expectConsoleOutput(lines, 'console debug', 'stdout').toBe('Debug: This is a debug message');
  });

  test('console.assert failure prefixed with "Assertion failed:" and attributed via stdout', () => {
    expectConsoleOutput(lines, 'console assert', 'stdout').toBe('Assertion failed: this is a console.assert failure');
  });

  test('console.time / timeLog / timeEnd produce timer output via stdout', () => {
    expectConsoleOutput(lines, 'console time functions', 'stdout', 2).toMatch(/(default: \d{1,}\.\d{3}ms\n*){2}/);
  });

  test('console.log before failure is still attributed to the test', () => {
    // Console output IS preserved for regular failures (assertion/runtime errors).
    // Only timeout failures lose console output because the worker thread is killed.
    expectConsoleOutput(
      lines,
      'console log is still printed for failed test [should fail]',
      'stdout',
    ).toBe('this is a console log from a test before it fails');
  });
});

describe('AssemblyScript trace stdlib interface - pool provided function verification', () => {
  test('trace() outputs message with stack trace referencing fixture file', () => {
    // trace() is an AS built-in that calls console.trace on the host side.
    // Unlike console.log/info/etc, it does not get vitest's stdout/stderr
    // attribution header and instead outputs a raw stack trace to stderr.
    // We find the trace message line and verify the stack trace on the
    // following line references the fixture file.
    const traceIdx = lines.findIndex(l => l.includes('WASM Trace: trace marker'));
    expect(traceIdx, 'trace marker not found in test report output').toBeGreaterThan(-1);

    // The first stack frame (traceIdx+1) is the host-side trace() wrapper.
    // The second frame (traceIdx+2) references the AS fixture file.
    // TODO - update this test when we source-map trace()
    const stackLine = lines[traceIdx + 2] ?? '';
    expect(stackLine, 'stack trace after trace message should reference fixture').toContain('stdlib-imports.meta.test');
  });
});
