/**
 * Computation-heavy tests for verifying parallel execution
 * Each test does significant work to make timing observable
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { factorial, fibonacci, isPrime, sumOfPrimes, countPrimes } from '../../assembly-src/computation-utils';

test('compute factorial of 20', () => {
  // Do some computational work
  let result: i64 = 1;
  for (let iter = 0; iter < 10000; iter++) {
    result = factorial(20);
  }

  // factorial(20) = 2432902008176640000
  expect(result).toBe(2432902008176640000);
});

test('compute fibonacci of 50', () => {
  // Do some computational work
  let result: i64 = 0;
  for (let iter = 0; iter < 10000; iter++) {
    result = fibonacci(50);
  }

  // fibonacci(50) = 12586269025
  expect(result).toBe(12586269025);
});

test('find primes up to 10000', () => {
  // Do some computational work
  let count: i32 = 0;
  for (let iter = 0; iter < 100; iter++) {
    count = countPrimes(10000);
  }

  // There are 1229 primes up to 10000
  expect(count).toBe(1229);
});

test('sum of primes up to 5000', () => {
  // Do some computational work
  let sum: i64 = 0;
  for (let iter = 0; iter < 100; iter++) {
    sum = sumOfPrimes(5000);
  }

  // Sum of primes up to 5000 = 1548136
  expect(sum).toBe(1548136);
});

test('matrix multiplication stress test', () => {
  // Simple 10x10 matrix multiplication repeated many times
  const size: i32 = 10;
  const iterations: i32 = 1000;

  let sum: i32 = 0;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i: i32 = 0; i < size; i++) {
      for (let j: i32 = 0; j < size; j++) {
        for (let k: i32 = 0; k < size; k++) {
          sum += i * j * k;
        }
      }
    }
  }

  expect(sum > 0).toBeTruthy();
});

test('nested loop computation', () => {
  // Nested loops to burn CPU time
  let total: i64 = 0;

  for (let a: i32 = 0; a < 100; a++) {
    for (let b: i32 = 0; b < 100; b++) {
      for (let c: i32 = 0; c < 10; c++) {
        total += i64(a * b + c);
      }
    }
  }

  expect(total > 0).toBeTruthy();
});
