/**
 * Heavy computation tests - CPU-intensive operations
 */

import { test, expect, TestOptions, describe } from 'vitest-pool-assemblyscript/assembly';
import { fibonacciRecursive, countPrimes } from '../../assembly-src/computation-utils';

describe("fibonacci", () => {
  test('fibonacci 28', () => {
    const result = fibonacciRecursive(28);
    expect(result).toBe(317811);
  });

  test('fibonacci 29', () => {
    const result = fibonacciRecursive(29);
    expect(result).toBe(514229);
  });

  test('fibonacci 30 [retry x3] [should fail]', TestOptions.retry(3), () => {
    const result = fibonacciRecursive(30);
    expect(result).toBe(832041); // intentionally wrong to test timeout retries
  });

  test('fibonacci 31', () => {
    const result = fibonacciRecursive(31);
    expect(result).toBe(1346269);
  });

  test('fibonacci 32', TestOptions.timeout(5).retry(1).fails(), () => {
    const result = fibonacciRecursive(32);
    expect(result).toBe(2178309);
  });

  describe("long running fibs", TestOptions.retry(0), () => {
    test('fibonacci 33 [timeout - retry x2] [should fail]',  TestOptions.timeout(15).retry(2), () => {
      const result = fibonacciRecursive(33);
      expect(result).not.toBe(3524578); // should timeout before getting to assertion
    });

    test('fibonacci 34', () => {
      const result = fibonacciRecursive(34);
      expect(result).toBe(5702887);
    });

    test('fibonacci 35', () => {
      const result = fibonacciRecursive(35);
      expect(result).toBe(9227465);
    });

    test('fibonacci 36', () => {
      const result = fibonacciRecursive(36);
      expect(result).toBe(14930352);
    });

    test('fibonacci 38 [timeout - retry x0] [should fail]', TestOptions.timeout(200), () => {
      const result = fibonacciRecursive(38);
      expect(result).not.toBe(39088169); // should timeout before getting to assertion
    });
  });
});

describe("primes", TestOptions.retry(1), () => {
  test('count primes to 10000', () => {
    const count = countPrimes(10000);
    expect(count).toBe(1229);
  });

  test('count primes to 20000', () => {
    const count = countPrimes(20000);
    expect(count).toBe(2262);
  });

  test('count primes to 30000', () => {
    const count = countPrimes(30000);
    expect(count).toBe(3245);
  });

  test('count primes to 40000', () => {
    const count = countPrimes(40000);
    expect(count).toBe(4203);
  });

  test('count primes to 50000', () => {
    const count = countPrimes(50000);
    expect(count).toBe(5133);
  });

  test('count primes to 60000', () => {
    const count = countPrimes(60000);
    expect(count).toBe(6057);
  });

  test('count primes to 70000', () => {
    const count = countPrimes(70000);
    expect(count).toBe(6935);
  });

  test('count primes to 80000', () => {
    const count = countPrimes(80000);
    expect(count).toBe(7837);
  });

  test('count primes to 90000', () => {
    const count = countPrimes(90000);
    expect(count).toBe(8713);
  });
});
