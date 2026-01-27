import { test, expect } from '../../../assembly';
import * as fail from '../../assembly-src/failure-utils';

test('failNamedFunc [should fail]', () => {
  const val = fail.failNamedFunc();
  expect(val).toBe(3, "failNamedFunc should return 3");
});

test('failArrowFunc [should fail]', () => {
  const val = fail.failArrowFunc();
  expect(val).toBe(3, "failArrowFunc should return 3");
});

test('failNamedCallbackInNamed [should fail]', () => {
  const val = fail.failNamedCallbackInNamed();
  expect(val).toBe(3, "failNamedCallbackInNamed should return 3");
});

test('failArrowCallbackInNamed [should fail]', () => {
  const val = fail.failArrowCallbackInNamed();
  expect(val).toBe(3, "failArrowCallbackInNamed should return 3");
});

test('failAnonCallbackInNamed [should fail]', () => {
  const val = fail.failAnonCallbackInNamed();
  expect(val).toBe(3, "failAnonCallbackInNamed should return 3");
});

test('failAnonCallbackInNamedCallsNamed [should fail]', () => {
  const val = fail.failAnonCallbackInNamedCallsNamed();
  expect(val).toBe(3, "failAnonCallbackInNamedCallsNamed should return 3");
});

test('failAnonCallbackInNamedCallsArrow [should fail]', () => {
  const val = fail.failAnonCallbackInNamedCallsArrow();
  expect(val).toBe(3, "failAnonCallbackInNamedCallsArrow should return 3");
});

test('ClassWithFailingMethods.fail() [should fail]', () => {
  const c = new fail.ClassWithFailingMethods();
  const val = c.fail();
  expect(val).toBe(3, "fail() should return 3");
});

test('ClassWithFailingMethods.failingMemberFunction() [should fail]', () => {
  const c = new fail.ClassWithFailingMethods();
  const val = c.failingMemberFunction();
  expect(val).toBe(3, "failingMemberFunction() should return 3");
});
