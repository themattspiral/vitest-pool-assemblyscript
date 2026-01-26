/**
 * Heavy computation tests - CPU-intensive operations
 */

import { test, assert, assertEqual, TestOptions, describe, expect } from '../../../assembly';
import { fibonacciRecursive, countPrimes } from '../../assembly-src/heavy-computation-utils';

describe("fibonacci", () => {
  test('fibonacci 28', () => {
    const result = fibonacciRecursive(28);
    assert(result == 317811);
  });
  
  test('fibonacci 29', () => {
    const result = fibonacciRecursive(29);
    assert(result == 514229);
  });
  
  test('fibonacci 30 [should fail]', TestOptions.retry(3), () => {
    const result = fibonacciRecursive(30);
    expect(result).toBe(832041); // intentionally wrong
  });
  
  test('fibonacci 31', () => {
    const result = fibonacciRecursive(31);
    assert(result == 1346269);
  });
  
  test('fibonacci 32', TestOptions.timeout(5).retry(1).fails(), () => {
    const result = fibonacciRecursive(32);
    assert(result == 2178309);
  });

  describe("long running fibs", TestOptions.retry(0), () => {
    test('fibonacci 33 [should fail]',  TestOptions.timeout(15).retry(2), () => {
      const result = fibonacciRecursive(33);
      expect(result).toBe(3524578);
    });

    test('fibonacci 34', () => {
      const result = fibonacciRecursive(34);
      assert(result == 5702887);
    });

    test('fibonacci 35', () => {
      const result = fibonacciRecursive(35);
      assert(result == 9227465);
    });

    test('fibonacci 36', () => {
      const result = fibonacciRecursive(36);
      assert(result == 14930352);
    });

    test('fibonacci 38 [should fail]', TestOptions.timeout(200), () => {
      const result = fibonacciRecursive(38);
      assertEqual(result, 39088169);
    });
  });
});

describe("primes", TestOptions.retry(1), () => {
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

  test('count primes to 50000', () => {
    const count = countPrimes(50000);
    assert(count == 5133)
  });

  test('count primes to 60000', () => {
    const count = countPrimes(60000);
    assert(count == 6057)
  });

  test('count primes to 70000', () => {
    const count = countPrimes(70000);
    assert(count == 6935)
  });

  test('count primes to 80000', () => {
      const count = countPrimes(80000);
      assert(count == 7837)
    }
  );

  test('count primes to 90000', () => {
    const count = countPrimes(90000);
    assert(count == 8713)
  });
});
