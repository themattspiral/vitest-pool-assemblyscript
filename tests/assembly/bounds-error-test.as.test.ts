import { test, assert } from '../../assembly/index';

test('array bounds error', (): void => {
  const arr: i32[] = [1, 2, 3];
  const value: i32 = arr[10]; // Out of bounds
  assert(value == 0, 'should not reach here');
});
