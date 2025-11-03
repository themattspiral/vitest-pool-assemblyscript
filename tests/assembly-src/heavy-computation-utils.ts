/**
 * Heavy computation utilities
 */

export function fibonacciRecursive(n: i32): i64 {
  if (n <= 1) return n as i64;
  return fibonacciRecursive(n - 1) + fibonacciRecursive(n - 2);
}

export function isPrime(n: i32): bool {
  if (n < 2) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

export function countPrimes(limit: i32): i32 {
  let count = 0;
  for (let i = 2; i < limit; i++) {
    if (isPrime(i)) count++;
  }
  return count;
}
