import { test, assert, assertEqual, TestOptions } from '../../../assembly';
import { fails } from '../../assembly-src/smoke-fail-utils';
import { fibonacciRecursive } from '../../assembly-src/heavy-computation-utils';

test('as smoke fail [should fail]', () => {
  const x: i32 = fails();
  assert(x == 2);
});

test('as smoke fail long running [should fail]', TestOptions.timeout(50).retry(1), () => {
  const res = fibonacciRecursive(37);
  assertEqual(2, 3);
});

