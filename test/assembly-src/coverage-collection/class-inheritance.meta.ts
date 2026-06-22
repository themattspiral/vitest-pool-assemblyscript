/**
 * Class inheritance coverage verification.
 * Tests whether inherited vs overridden methods are attributed correctly.
 */

export class Animal {
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  /** Inherited method — not overridden by subclasses */
  speak(): string {
    return "...";
  }

  /** Overridden by Dog, not by Cat */
  move(): string {
    return "moves";
  }

  get name(): string {
    return this._name;
  }
}

export class Dog extends Animal {
  constructor(name: string) {
    super(name);
  }

  /** Overrides Animal.move */
  move(): string {
    return "runs";
  }

  /** Dog-only method */
  bark(): string {
    return "woof";
  }
}

export class Cat extends Animal {
  constructor(name: string) {
    super(name);
  }

  /** Cat-only method */
  meow(): string {
    return "meow";
  }
}
