/**
 * Array utility functions
 * Helper functions for array operations
 */

export function arraySum(arr: i32[]): i32 {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

export function filterEvens(arr: i32[]): i32[] {
  const evens: i32[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] % 2 == 0) {
      evens.push(arr[i]);
    }
  }
  return evens;
}

export function reverseArray(arr: i32[]): i32[] {
  const reversed = arr.slice(0);
  reversed.reverse();
  return reversed;
}
