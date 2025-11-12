/**
 * Memory operation utilities
 */

export function createAndFillArray(size: i32): i32[] {
  const arr = new Array<i32>(size);
  for (let i = 0; i < size; i++) {
    arr[i] = i;
  }
  return arr;
}

export function createLargeArray(size: i32, firstValue: i32, lastValue: i32): i32[] {
  const arr = new Array<i32>(size);
  arr[0] = firstValue;
  arr[size - 1] = lastValue;
  return arr;
}

export function createMultipleArrays(count: i32, size: i32): i32[][] {
  const arrays = new Array<i32[]>(count);
  for (let i = 0; i < count; i++) {
    const arr = new Array<i32>(size);
    arr[0] = i + 1;
    arrays[i] = arr;
  }
  return arrays;
}
