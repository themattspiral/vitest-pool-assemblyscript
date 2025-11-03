import { test, assert } from '../../assembly/index';
import { createArray, accessOutOfBounds } from '../assembly-src/bounds-utils';

test('should fail with bounds error', (): void => {
  const arr = createArray();
  const value: i32 = accessOutOfBounds(arr, 10); // RUNTIME_ERROR@6:22 STACK_DEPTH:3 EXPECT_IN:bounds-utils.ts:10:10 Index out of range
  assert(value == 0, 'should not reach here');
});
