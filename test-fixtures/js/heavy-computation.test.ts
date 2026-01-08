import { describe, test, expect } from 'vitest';
import { fibonacciRecursive, countPrimes } from '../js-src/math.js';

describe.skip('heavy math computation', () => {
  test('fibonacci 28', () => {
    const result = fibonacciRecursive(28n);
    expect(result).toBe(317811n);
  });

  test('count primes to 10000', () => {
    const count = countPrimes(10000);
    expect(count).toBe(1229)
  });

  test('fibonacci 29', () => {
    const result = fibonacciRecursive(29n);
    expect(result).toBe(514229n);
  });

  test('count primes to 20000', () => {
    const count = countPrimes(20000);
    expect(count).toBe(2262)
  });

  test('fibonacci 30', () => {
    const result = fibonacciRecursive(30n);
    expect(result).toBe(832040n);
  });

  test('count primes to 30000', () => {
    const count = countPrimes(30000);
    expect(count).toBe(3245)
  });

  test('fibonacci 31', () => {
    const result = fibonacciRecursive(31n);
    expect(result).toBe(1346269n);
  });

  test('count primes to 40000', () => {
    const count = countPrimes(40000);
    expect(count).toBe(4203)
  });

  test('fibonacci 32', () => {
    const result = fibonacciRecursive(32n);
    expect(result).toBe(2178309n);
  });

  test('count primes to 50000', () => {
    const count = countPrimes(50000);
    expect(count).toBe(5133)
  });

  test('fibonacci 33', () => {
    const result = fibonacciRecursive(33n);
    expect(result).toBe(3524578n);
  });

  test('count primes to 60000', () => {
    const count = countPrimes(60000);
    expect(count).toBe(6057)
  });

  test('fibonacci 34', () => {
    const result = fibonacciRecursive(34n);
    expect(result).toBe(5702887n);
  });

  test('count primes to 70000', () => {
    const count = countPrimes(70000);
    expect(count).toBe(6935)
  });

  test('fibonacci 35', () => {
    const result = fibonacciRecursive(35n);
    expect(result).toBe(9227465n);
  });

  test('count primes to 80000', () => {
    const count = countPrimes(80000);
    expect(count).toBe(7837)
  });

  test('fibonacci 36', () => {
    const result = fibonacciRecursive(36n);
    expect(result).toBe(14930352n);
  });

  test('count primes to 90000', () => {
    const count = countPrimes(90000);
    expect(count).toBe(8713)
  });
});
