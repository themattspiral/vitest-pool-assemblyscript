const MY_ARRAY: StaticArray<u64> = new StaticArray(200000);

export function allocBoom(): string {
  return MY_ARRAY[99].toString();
}
