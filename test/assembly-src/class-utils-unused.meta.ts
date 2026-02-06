/**
 * Unused class - never instantiated
 * All methods should appear in coverage at 0%
 */
export class UnusedCounter {
  private _count: i32;

  constructor(start: i32 = 0) {
    this._count = start;
  }

  increment(): void {
    this._count++;
  }

  get count(): i32 {
    return this._count;
  }

  set count(value: i32) {
    this._count = value;
  }

  // Static method
  static createDefault(): UnusedCounter {
    return new UnusedCounter(0);
  }

  // Private method
  private tripleCount(): i32 {
    return this._count * 3;
  }

  // Method that uses private method
  getTripled(): i32 {
    return this.tripleCount();
  }
}
