/**
 * Multiple classes in one file.
 * Verifies each class's methods are tracked independently
 * with correct ClassName#method naming.
 */

export class Dog {
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  bark(): string {
    return "woof";
  }

  fetch(): string {
    return "fetching";
  }

  get name(): string {
    return this._name;
  }
}

export class Cat {
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  meow(): string {
    return "meow";
  }

  purr(): string {
    return "purr";
  }

  get name(): string {
    return this._name;
  }
}
