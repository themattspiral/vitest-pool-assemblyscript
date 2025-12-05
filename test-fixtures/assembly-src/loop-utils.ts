/**
 * Loop utility functions
 * Helper functions demonstrating various loop patterns
 */

export function sumRange(start: i32, end: i32): i32 {
  let sum = 0;
  for (let i = start; i <= end; i++) {
    sum += i;
  }
  return sum;
}

export function countdown(start: i32): i32 {
  let count = start;
  let iterations = 0;
  while (count > 0) {
    count--;
    iterations++;
  }
  return iterations;
}

export function nestedLoopSum(rows: i32, cols: i32): i32 {
  let sum = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      sum += i * j;
    }
  }
  return sum;
}
