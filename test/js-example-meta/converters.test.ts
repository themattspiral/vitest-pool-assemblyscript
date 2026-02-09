import { test, expect } from 'vitest';
import { celsiusToFahrenheit } from '../js-example-meta-src/converters.js';

// Exercises only celsiusToFahrenheit — most converter functions are intentionally untested

test('celsiusToFahrenheit', () => {
  expect(celsiusToFahrenheit(0)).toBe(32);
  expect(celsiusToFahrenheit(100)).toBe(212);
});
