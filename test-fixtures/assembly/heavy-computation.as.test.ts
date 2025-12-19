/**
 * Heavy computation tests - CPU-intensive operations
 * Used to measure execution time vs compilation time
 */

import { test, assert, assertEqual } from '../../assembly';
import { fibonacciRecursive, countPrimes } from '../assembly-src/heavy-computation-utils';

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

test('fibonacci 33', () => {
  const result = fibonacciRecursive(33);
  assert(result == 3524578);
});

test('fibonacci 34', () => {
  const result = fibonacciRecursive(38);
  assertEqual(result, 39088169, 'bad fib');
});

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
