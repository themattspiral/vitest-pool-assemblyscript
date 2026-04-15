/**
 * Namespace class coverage verification.
 * Tests that classes inside different namespaces with identical structure
 * are tracked independently with correct hit counts per namespace.
 *
 * This guards against a specific coverage extraction bug: the deep equality
 * transform injects a comparison method into each class, which consumes a
 * coverage memory index but is later filtered from the debug info. When enough
 * filtered methods exist, later functions' coverage indices exceed the extracted
 * Uint32Array length, causing their hit counts to read as 0 (out-of-bounds).
 *
 * The filler classes below exist to create enough filtered deep-equals methods
 * to push the namespace class coverage indices past the truncation boundary.
 * Without them, the file has too few classes for the bug to manifest.
 */

// --- Filler classes (create gap between filtered count and max coverage index) ---

export class FillerA { v: i32 = 0; constructor() {} }
export class FillerB { v: i32 = 0; constructor() {} }
export class FillerC { v: i32 = 0; constructor() {} }

// --- Namespace classes under test (must appear AFTER filler classes) ---

export namespace Animals {
  export class Dog {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    speak(): string {
      return "woof";
    }
  }
}

export class FillerD { v: i32 = 0; constructor() {} }
export class FillerE { v: i32 = 0; constructor() {} }
export class FillerF { v: i32 = 0; constructor() {} }

export namespace Robots {
  export class Dog {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    speak(): string {
      return "beep";
    }
  }
}
