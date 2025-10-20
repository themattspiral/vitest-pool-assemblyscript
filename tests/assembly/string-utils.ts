/**
 * Simple string utility functions
 * These are "production code" that we're testing
 */

export function getLength(str: string): i32 {
  return str.length;
}

export function isEmpty(str: string): bool {
  return str.length == 0;
}

export function concat(a: string, b: string): string {
  return a + b;
}

export function repeat(str: string, count: i32): string {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += str;
  }
  return result;
}
