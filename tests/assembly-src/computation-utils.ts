/**
 * Computation utility functions for heavy calculations
 */

export function factorial(n: i32): i64 {
  let result: i64 = 1;
  for (let i: i32 = 2; i <= n; i++) {
    result *= i64(i);
  }
  return result;
}

export function fibonacci(n: i32): i64 {
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

export function isPrime(n: i32): bool {
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

export function sumOfPrimes(n: i32): i64 {
  let sum: i64 = 0;
  for (let i: i32 = 2; i <= n; i++) {
    if (isPrime(i)) {
      sum += i64(i);
    }
  }
  return sum;
}

export function countPrimes(max: i32): i32 {
  let count: i32 = 0;
  for (let i: i32 = 2; i <= max; i++) {
    if (isPrime(i)) {
      count++;
    }
  }
  return count;
}
