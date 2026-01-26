/**
 * Computation-heavy tests for verifying parallel execution
 * Each test does significant work to make timing observable
 */

import { test, assert } from '../../../assembly';
import { factorial, fibonacci, isPrime, sumOfPrimes, countPrimes } from '../../assembly-src/computation-utils';

test('compute factorial of 20', () => {
  // Do some computational work
  let result: i64 = 1;
  for (let iter = 0; iter < 10000; iter++) {
    result = factorial(20);
  }

  // factorial(20) = 2432902008176640000
  assert(result == 2432902008176640000, 'factorial(20) should be 2432902008176640000');
});

test('compute fibonacci of 50', () => {
  // Do some computational work
  let result: i64 = 0;
  for (let iter = 0; iter < 10000; iter++) {
    result = fibonacci(50);
  }

  // fibonacci(50) = 12586269025
  assert(result == 12586269025, 'fibonacci(50) should be 12586269025');
});

test('find primes up to 10000', () => {
  // Do some computational work
  let count: i32 = 0;
  for (let iter = 0; iter < 100; iter++) {
    count = countPrimes(10000);
  }

  // There are 1229 primes up to 10000
  assert(count == 1229, 'there should be 1229 primes up to 10000');
});

test('sum of primes up to 5000', () => {
  // Do some computational work
  let sum: i64 = 0;
  for (let iter = 0; iter < 100; iter++) {
    sum = sumOfPrimes(5000);
  }

  // Sum of primes up to 5000 = 1548136
  assert(sum == 1548136, 'sum of primes up to 5000 should be 1548136');
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

  assert(sum > 0, 'matrix multiplication should produce positive sum');
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

  assert(total > 0, 'nested loop computation should produce positive result');
});
