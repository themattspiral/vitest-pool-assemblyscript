import { test, assert } from '../../assembly';

function add(a: i32, b: i32): i32 {
  return a + b;
}

test('smoke success', () => {
  const x: i32 = add(1, 1);
  assert(x == 2);
});
