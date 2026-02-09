import { test, expect } from 'vitest';
import { capitalize, reverse, truncate, countWords, isPalindrome } from '../js-example-meta-src/string-utils.js';

// Exercises ~50-60% of string-utils functions
// slugify, camelToKebab, kebabToCamel are intentionally untested

test('capitalize', () => {
  expect(capitalize('hello')).toBe('Hello');
  expect(capitalize('')).toBe('');
});

test('reverse', () => {
  expect(reverse('abc')).toBe('cba');
});

test('truncate', () => {
  expect(truncate('hello world', 8)).toBe('hello...');
  expect(truncate('short', 10)).toBe('short');
});

test('countWords', () => {
  expect(countWords('one two three')).toBe(3);
  expect(countWords('')).toBe(0);
});

test('isPalindrome', () => {
  expect(isPalindrome('racecar')).toBe(true);
  expect(isPalindrome('hello')).toBe(false);
});
