// Cross-file coverage provider for pass-100/cross-file-consumer.ts. The class carries
// a default constructor parameter so a consumer's `new Widget()` inlines the default
// here — attributed back to this constructor, not the consumer.

export class Widget {
  size: i32;

  constructor(size: i32 = 10) {
    this.size = size;
  }

  area(): i32 {
    return this.size * this.size;
  }
}

export function providerHelper(): i32 {
  return 42;
}
