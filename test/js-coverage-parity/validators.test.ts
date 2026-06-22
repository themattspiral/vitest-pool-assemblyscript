import { test, expect } from 'vitest';
import { isEmail, isHexColor } from '../js-coverage-parity-src/validators.js';

// Exercises ~30-40% of validators functions
// isEmpty, isInRange, isUrl, isNumericString, isStrongPassword are intentionally untested

test('isEmail', () => {
  expect(isEmail('user@example.com')).toBe(true);
  expect(isEmail('not-an-email')).toBe(false);
});

test('isHexColor', () => {
  expect(isHexColor('#fff')).toBe(true);
  expect(isHexColor('#aabbcc')).toBe(true);
  expect(isHexColor('red')).toBe(false);
});
