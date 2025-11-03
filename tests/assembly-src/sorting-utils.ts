/**
 * Sorting and searching utilities
 */

export function bubbleSort(arr: i32[]): void {
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}

export function binarySearch(arr: i32[], target: i32): i32 {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = (left + right) / 2;
    if (arr[mid] == target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
