/**
 * Utilities for bounds testing
 */

export function createArray(): i32[] {
  return [1, 2, 3];
}

export function accessOutOfBounds(arr: i32[], index: i32): i32 {
  return arr[index]; // Index out of range when called with out-of-bounds index
}
