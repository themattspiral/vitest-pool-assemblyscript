import { test, expect } from 'vitest';
import { increment } from '../js-example-src/smoke-utils.js';

test('js smoke pass', () => {
  const res: number = increment(1);
  expect(res).toBe(2);
});
