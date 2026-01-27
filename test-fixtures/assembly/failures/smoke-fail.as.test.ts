import { test, expect, TestOptions } from '../../../assembly';
import { fails } from '../../assembly-src/smoke-fail-utils';
import { fibonacciRecursive } from '../../assembly-src/heavy-computation-utils';

test('as smoke fail [should fail]', () => {
  const x: i32 = fails();
  expect(x).toBe(2);
});

test('as smoke fail long running [should fail]', TestOptions.timeout(50).retry(1), () => {
  const res = fibonacciRecursive(37);

  // if we get here we didn't timeout correctly
  expect(2).toBe(3, "Expected Timeout, but completed with assertion failure");
});

