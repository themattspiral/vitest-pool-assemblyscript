export function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}
