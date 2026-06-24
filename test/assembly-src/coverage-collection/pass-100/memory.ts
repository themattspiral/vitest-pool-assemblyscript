/**
 * Array / memory operations for the 100% passing set: single-dimension allocation +
 * fill, a reducing scan, and a nested 2-D allocation. Exercises allocation-heavy code
 * (which the incremental runtime restructures) with no branches; the driver calls each
 * with non-empty sizes so every loop body runs → 100% on all four types.
 */

export function filledArray(size: i32): i32[] {
  const arr = new Array<i32>(size);
  for (let i = 0; i < size; i++) {
    arr[i] = i * 2;
  }
  return arr;
}

export function sumArray(arr: i32[]): i32 {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
}

export function matrix(rows: i32, cols: i32): i32[][] {
  const grid = new Array<i32[]>(rows);
  for (let r = 0; r < rows; r++) {
    const row = new Array<i32>(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = r * cols + c;
    }
    grid[r] = row;
  }
  return grid;
}
