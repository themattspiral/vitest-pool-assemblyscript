import { test, assert } from '../../assembly';
import { fails } from '../assembly-src/smoke-utils';

test('smoke fail [should fail]', () => {
  const x: i32 = fails();
  assert(x == 2);
});
