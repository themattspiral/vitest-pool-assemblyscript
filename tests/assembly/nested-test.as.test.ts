import { test, assert } from '../../assembly/index';

function level3(): void {
  assert(false, 'error at level 3');
}

function level2(): void {
  level3();
}

function level1(): void {
  level2();
}

test('nested call stack', (): void => {
  level1();
});
