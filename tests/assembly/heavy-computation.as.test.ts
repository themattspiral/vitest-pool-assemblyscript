/**
 * Heavy computation tests - CPU-intensive operations
 * Used to measure execution time vs compilation time
 */

import { test, assert } from '../../assembly';

function fibonacciRecursive(n: i32): i64 {
  if (n <= 1) return n as i64;
  return fibonacciRecursive(n - 1) + fibonacciRecursive(n - 2);
}

function isPrime(n: i32): bool {
  if (n < 2) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

function countPrimes(limit: i32): i32 {
  let count = 0;
  for (let i = 2; i < limit; i++) {
    if (isPrime(i)) count++;
  }
  return count;
}

// Split heavy fib(35) into multiple moderate tests
test('fibonacci 28', () => {
  const result = fibonacciRecursive(28);
  assert(result == 317811);
});

test('fibonacci 29', () => {
  const result = fibonacciRecursive(29);
  assert(result == 514229);
});

test('fibonacci 30', () => {
  const result = fibonacciRecursive(30);
  assert(result == 832040);
});

test('fibonacci 31', () => {
  const result = fibonacciRecursive(31);
  assert(result == 1346269);
});

test('fibonacci 32', () => {
  const result = fibonacciRecursive(32);
  assert(result == 2178309);
});

// Split heavy prime counting into smaller chunks
test('count primes to 10000', () => {
  const count = countPrimes(10000);
  assert(count == 1229);
});

test('count primes to 20000', () => {
  const count = countPrimes(20000);
  assert(count == 2262);
});

test('count primes to 30000', () => {
  const count = countPrimes(30000);
  assert(count == 3245);
});

test('count primes to 40000', () => {
  const count = countPrimes(40000);
  assert(count == 4203);
});
