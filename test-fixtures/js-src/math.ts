/**
 * Simple math functions for JS coverage testing
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('divide by zero is not allowed');
  }

  return a / b;
}

export function fibonacciRecursive(n: bigint): bigint {
  if (n < 2n) {
    return n;
  }
  return fibonacciRecursive(n - 1n) + fibonacciRecursive(n - 2n);
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

export function countPrimes(limit: number): number {
  let count = 0;
  for (let i = 2; i < limit; i++) {
    if (isPrime(i)) count++;
  }
  return count;
}

// This function won't be called in tests - should show 0% coverage
export function unusedFunction(): string {
  return 'never called';
}
