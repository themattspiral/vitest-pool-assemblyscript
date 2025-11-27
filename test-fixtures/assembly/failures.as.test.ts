import { test, assert } from '../../assembly';
import * as fail from '../assembly-src/failure-utils';

test('failNamedFunc [should fail]', () => {
  const val = fail.failNamedFunc();
  assert(val == 3);
});

test('failArrowFunc [should fail]', () => {
  const val = fail.failArrowFunc();
  assert(val == 3);
});

test('failNamedCallbackInNamed [should fail]', () => {
  const val = fail.failNamedCallbackInNamed();
  assert(val == 3);
});

test('failArrowCallbackInNamed [should fail]', () => {
  const val = fail.failArrowCallbackInNamed();
  assert(val == 3);
});

test('failAnonCallbackInNamed [should fail]', () => {
  const val = fail.failAnonCallbackInNamed();
  assert(val == 3);
});

test('failAnonCallbackInNamedCallsNamed [should fail]', () => {
  const val = fail.failAnonCallbackInNamedCallsNamed();
  assert(val == 3);
});

test('failAnonCallbackInNamedCallsArrow [should fail]', () => {
  const val = fail.failAnonCallbackInNamedCallsArrow();
  assert(val == 3);
});

test('decoratedArrowFunc should return input plus 5', () => {
  const val = fail.decoratedArrowFunc(3);
  assert(val == 8);
});
