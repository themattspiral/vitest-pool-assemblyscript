/**
 * Control-flow constructs for the 100% passing set: if/else, if/else-if chain,
 * ternary, switch, logical &&/||, for/while/do-while/nested loops, break, continue,
 * early-return, and throw. Every branch arm is reachable, and the driver supplies
 * inputs that take both sides of each decision, so branch coverage reaches 100%.
 */

// if / else.
export function sign(n: i32): i32 {
  if (n < 0) {
    return -1;
  } else {
    return 1;
  }
}

// if / else-if / else chain.
export function bucket(n: i32): i32 {
  if (n < 0) {
    return 0;
  } else if (n < 10) {
    return 1;
  } else {
    return 2;
  }
}

// Ternary.
export function absVal(n: i32): i32 {
  return n < 0 ? -n : n;
}

// Switch with explicit cases + default.
export function category(n: i32): i32 {
  switch (n) {
    case 0:
      return 100;
    case 1:
      return 200;
    default:
      return -1;
  }
}

// Logical && — right operand evaluated only when the left is true.
export function inRange(n: i32, lo: i32, hi: i32): bool {
  return n >= lo && n <= hi;
}

// Logical || — right operand evaluated only when the left is false.
export function outsideRange(n: i32, lo: i32, hi: i32): bool {
  return n < lo || n > hi;
}

// for loop.
export function sumTo(n: i32): i32 {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += i;
  }
  return total;
}

// while loop.
export function countDown(start: i32): i32 {
  let steps = 0;
  while (start > 0) {
    steps += 1;
    start -= 1;
  }
  return steps;
}

// do-while loop.
export function atLeastOnce(n: i32): i32 {
  let count = 0;
  do {
    count += 1;
    n -= 1;
  } while (n > 0);
  return count;
}

// Nested loops.
export function gridCells(n: i32): i32 {
  let cells = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells += 1;
    }
  }
  return cells;
}

// continue + early return inside a loop.
export function firstEven(arr: i32[]): i32 {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] % 2 != 0) {
      continue;
    }
    return arr[i];
  }
  return -1;
}

// break inside a loop.
export function indexOf(arr: i32[], target: i32): i32 {
  let found = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == target) {
      found = i;
      break;
    }
  }
  return found;
}

// Early return with multiple guard clauses.
export function classify(n: i32): i32 {
  if (n < 0) {
    return -1;
  }
  if (n == 0) {
    return 0;
  }
  return 1;
}

// throw — both arms taken (return for valid input, throw for invalid).
export function requirePositive(n: i32): i32 {
  if (n <= 0) {
    throw new Error("must be positive");
  }
  return n;
}
