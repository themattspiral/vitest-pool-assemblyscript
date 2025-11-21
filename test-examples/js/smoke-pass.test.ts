import { test, expect } from 'vitest';
import { increment } from '../js-src/smoke-utils.js';

test('smoke pass', () => {
  const res: number = increment(1);
  expect(res).toBe(2);
});
