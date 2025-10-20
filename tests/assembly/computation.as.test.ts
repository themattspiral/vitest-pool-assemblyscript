/**
 * Computation-heavy tests for verifying parallel execution
 * Each test does significant work to make timing observable
 */

import { test, assert } from '../../assembly';

/**
 * Helper: Compute factorial iteratively
 */
function factorial(n: i32): i64 {
  let result: i64 = 1;
  for (let i: i32 = 2; i <= n; i++) {
    result *= i64(i);
  }
  return result;
}

/**
 * Helper: Compute nth Fibonacci number iteratively
 */
function fibonacci(n: i32): i64 {
  if (n <= 1) return i64(n);

  let a: i64 = 0;
  let b: i64 = 1;

  for (let i: i32 = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }

  return b;
}

/**
 * Helper: Check if number is prime (slow trial division)
 */
function isPrime(n: i32): bool {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 == 0 || n % 3 == 0) return false;

  for (let i: i32 = 5; i * i <= n; i += 6) {
    if (n % i == 0 || n % (i + 2) == 0) {
      return false;
    }
  }

  return true;
}

/**
 * Helper: Sum of primes up to n
 */
function sumOfPrimes(n: i32): i64 {
  let sum: i64 = 0;
  for (let i: i32 = 2; i <= n; i++) {
    if (isPrime(i)) {
      sum += i64(i);
    }
  }
  return sum;
}

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
    count = 0;
    for (let i: i32 = 2; i <= 10000; i++) {
      if (isPrime(i)) {
        count++;
      }
    }
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
