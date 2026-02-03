/**
 * Math operations test suite
 * Tests basic arithmetic operations
 */

import { test, describe, expect } from 'vitest-pool-assemblyscript/assembly';
import { fails } from '../../assembly-src/failure-utils.external';
import { fibonacciRecursive } from '../../assembly-src/computation-utils';

test("console log is still printed for failed test [should fail]", () => {
  console.log("this is a console log from a test before it fails");
  fails();
});

test("console assert", () => {
  console.assert(false, "this is a console.assert failure");
});

test("console error", () => {
  console.error('This is an error!!');
});

test("console debug", () => {
  console.debug('This is a 🐛');
});

test("console log, info, warn", () => {
  console.log('this is a log');
  console.info('this is info');
  console.warn('this is a warning');
});

test("time functions", () => {
  console.time();
  fibonacciRecursive(33);
  console.timeLog();
  fibonacciRecursive(34);
  console.timeEnd();
});
