import { test, expect } from 'vitest';
import { fails } from '../js-src/smoke-utils.js';

test('smoke fail [should fail]', () => {
  const res: number = fails();
  expect(res).toBe(2);
});
