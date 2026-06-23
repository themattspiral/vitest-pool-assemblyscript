import { test, describe, expect } from 'vitest';
import { Counter, Dog, Cat } from '../../js-coverage-parity-src/function/classes.js';

// Parity twin for the AS classes fixture: identical instantiation pattern to the
// Counter + inheritance describes in function/classes.meta.test.ts (the @operator
// case is AS-only and has no twin here), so v8's function coverage is the oracle.
describe('class function coverage parity twin', () => {
  test('all member kinds on one class', () => {
    const c = new Counter(5);
    c.increment();
    c.increment();
    c.value = 100;
    expect(c.value).toBe(100);
  });

  test('inherited method via subclass (Dog.speak from Animal)', () => {
    const dog = new Dog("Rex");
    expect(dog.speak()).toBe("...");
  });

  test('overridden method (Dog.move overrides Animal.move)', () => {
    const dog = new Dog("Rex");
    expect(dog.move()).toBe("runs");
  });

  test('inherited method via a different subclass (Cat.speak from Animal)', () => {
    const cat = new Cat("Whiskers");
    expect(cat.speak()).toBe("...");
  });

  test('inherited method Cat does NOT override (Cat.move from Animal)', () => {
    const cat = new Cat("Whiskers");
    expect(cat.move()).toBe("moves");
  });

  test('Dog-only method', () => {
    const dog = new Dog("Rex");
    expect(dog.bark()).toBe("woof");
  });

  test('Cat-only method', () => {
    const cat = new Cat("Whiskers");
    expect(cat.meow()).toBe("meow");
  });

  test('name getter via subclass', () => {
    const dog = new Dog("Rex");
    expect(dog.name).toBe("Rex");
  });
});
