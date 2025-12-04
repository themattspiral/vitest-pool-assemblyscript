/**
 * Flow control edge cases for containment matching verification
 * Tests various statement types and control flow patterns
 */

// Edge case: switch/case
export function getCategory(val: i32): i32 {
  switch (val) {
    case 0:
      return 100;
    case 1:
      return 200;
    case 2:
      return 300;
    default:
      return -1;
  }
}

// Edge case: if/else if/else chain
export function classify(n: i32): i32 {
  if (n < 0) {
    return -1;
  } else if (n === 0) {
    return 0;
  } else if (n < 10) {
    return 1;
  } else {
    return 2;
  }
}

// Edge case: while loop
export function countDown(start: i32): i32 {
  let count: i32 = 0;
  while (start > 0) {
    count++;
    start--;
  }
  return count;
}

// Edge case: do-while loop
export function doCountUp(limit: i32): i32 {
  let i: i32 = 0;
  let sum: i32 = 0;
  do {
    sum += i;
    i++;
  } while (i < limit);
  return sum;
}

// Edge case: nested loops
export function nestedLoops(n: i32): i32 {
  let result: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    for (let j: i32 = 0; j < n; j++) {
      result += i * j;
    }
  }
  return result;
}

// Edge case: break and continue
export function findFirst(arr: i32[], target: i32): i32 {
  for (let i: i32 = 0; i < arr.length; i++) {
    if (arr[i] === 0) {
      continue;
    }
    if (arr[i] === target) {
      return i;
    }
  }
  return -1;
}

// Edge case: early return with multiple paths
export function validateRange(val: i32, min: i32, max: i32): i32 {
  if (val < min) {
    return -1;
  }
  if (val > max) {
    return 1;
  }
  return 0;
}

// Edge case: switch with fall-through prevention (break)
export function getDayType(day: i32): i32 {
  let result: i32 = 0;
  switch (day) {
    case 0:
    case 6:
      result = 1;
      break;
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      result = 2;
      break;
    default:
      result = 0;
      break;
  }
  return result;
}

// Edge case: nested conditionals inside loop
export function processMatrix(n: i32): i32 {
  let sum: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    for (let j: i32 = 0; j < n; j++) {
      if (i === j) {
        sum += 1;
      } else if (i > j) {
        sum += 2;
      } else {
        sum += 3;
      }
    }
  }
  return sum;
}

// Edge case: complex boolean expressions
export function complexCondition(a: i32, b: i32, c: i32): bool {
  if ((a > 0 && b > 0) || (c < 0 && a !== b)) {
    return true;
  }
  return false;
}

// Edge case: complex boolean expressions
export function complexCondition2(a: i32, b: i32, c: i32, d: i32): bool {
  if (c < -5) {
    switch (d) {
      case 1:
        if ((a > 0 && b > 0) || (c < 0 && a !== b)) {
          return true;
        }
      case 2:
        if ((c > 0 && b > 0) || (a < 0 && a !== b)) {
          return true;
        }
      default:
        if ((d > 5 && b > 0) || (d < 5 && a !== b)) {
        return true;
      }
    };
  }
  return false;
}

// Edge case: ternary inside loop
export function ternaryLoop(n: i32): i32 {
  let sum: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    sum += i % 2 === 0 ? i : -i;
  }
  return sum;
}
