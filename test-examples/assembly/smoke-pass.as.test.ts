import { test, assert } from '../../assembly';
import { increment } from '../assembly-src/smoke-utils';

test('smoke pass', () => {
  const x: i32 = increment(1);
  assert(x == 2);
});
