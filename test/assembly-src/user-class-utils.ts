/**
 * Test fixtures for deep equality of user-defined objects.
 *
 * These classes exercise patterns the deep equality transform must handle:
 * - Simple primitive fields
 * - String fields
 * - Nested user-defined object fields
 * - Nullable fields
 * - Classes with @operator("==") (user-defined equality semantics)
 * - Classes with .equals() method (user-defined equality semantics)
 * - Inheritance (single, multi-level, abstract, sibling subclasses)
 * - Private/protected fields
 * - Generic classes
 * - Edge cases: empty, static-only, getter-only, readonly, sealed, unmanaged,
 *   no constructor, class expressions, container fields with user objects,
 *   circular references, namespaced classes
 */

// --- Simple field classes ---

export class Point {
  x: i32;
  y: i32;

  constructor(x: i32, y: i32) {
    this.x = x;
    this.y = y;
  }
}

export class PointF {
  x: f64;
  y: f64;

  constructor(x: f64, y: f64) {
    this.x = x;
    this.y = y;
  }
}

export class Person {
  name: string;
  age: i32;

  constructor(name: string, age: i32) {
    this.name = name;
    this.age = age;
  }
}

// --- Nested objects ---

export class Line {
  start: Point;
  end: Point;

  constructor(start: Point, end: Point) {
    this.start = start;
    this.end = end;
  }
}

// --- Nullable fields ---

export class NullableFields {
  label: string | null;
  value: i32;

  constructor(label: string | null, value: i32) {
    this.label = label;
    this.value = value;
  }
}

// --- @operator("==") (user-defined equality semantics) ---

export class Color {
  r: u8;
  g: u8;
  b: u8;
  name: string;

  constructor(r: u8, g: u8, b: u8, name: string) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.name = name;
  }

  // Custom equality: compare by RGB values only, ignore name
  @operator("==")
  equalsAnotherColor(other: Color): bool {
    return this.r == other.r && this.g == other.g && this.b == other.b;
  }
}

// --- .equals() method (user-defined equality semantics) ---

export class Token {
  kind: i32;
  value: string;
  position: i32;

  constructor(kind: i32, value: string, position: i32) {
    this.kind = kind;
    this.value = value;
    this.position = position;
  }

  // Custom equality: compare by kind and value only, ignore position
  equals(other: Token): bool {
    return this.kind == other.kind && this.value == other.value;
  }
}

// --- Inheritance ---

export class Shape {
  color: string;

  constructor(color: string) {
    this.color = color;
  }
}

export class Circle extends Shape {
  radius: f64;

  constructor(color: string, radius: f64) {
    super(color);
    this.radius = radius;
  }
}

// --- Private / protected fields ---

export class Wallet {
  private _balance: i32;
  owner: string;

  constructor(owner: string, balance: i32) {
    this.owner = owner;
    this._balance = balance;
  }

  get balance(): i32 {
    return this._balance;
  }
}

// --- Complex composite class (exercises all recursive comparison paths) ---

export class GameState {
  level: i32;
  score: f64;
  active: bool;
  playerName: string;
  position: Point;
  inventory: Map<string, i32>;
  tags: Set<string>;
  rawData: ArrayBuffer;

  constructor(
    level: i32,
    score: f64,
    active: bool,
    playerName: string,
    position: Point,
    inventory: Map<string, i32>,
    tags: Set<string>,
    rawData: ArrayBuffer,
  ) {
    this.level = level;
    this.score = score;
    this.active = active;
    this.playerName = playerName;
    this.position = position;
    this.inventory = inventory;
    this.tags = tags;
    this.rawData = rawData;
  }
}

// --- Generic class ---

export class Pair<T> {
  first: T;
  second: T;

  constructor(first: T, second: T) {
    this.first = first;
    this.second = second;
  }
}

// =============================================================================
// Edge case fixtures
// =============================================================================

// --- Empty class (no stored fields) ---

export class Empty {}

// --- Only static fields (no instance fields to compare) ---

export class StaticOnly {
  static counter: i32 = 0;
}

// --- Only getters (all excluded from comparison by design) ---
// No stored instance fields — only computed getters.

export class GetterOnly {
  get value(): i32 {
    return 42;
  }

  get label(): string {
    return "computed";
  }
}

// --- Readonly fields ---

export class Config {
  readonly host: string;
  readonly port: i32;

  constructor(host: string, port: i32) {
    this.host = host;
    this.port = port;
  }
}

// --- No explicit constructor (AS auto-generates default) ---

export class Tag {
  label: string = "default";
  priority: i32 = 0;
}

// --- @sealed class (prevents subclassing) ---

// @ts-ignore - AS supports top leve decorators
@sealed
export class SealedPoint {
  x: i32;
  y: i32;

  constructor(x: i32, y: i32) {
    this.x = x;
    this.y = y;
  }
}

// --- @unmanaged class (bypasses GC, manual memory management) ---
// Uses only primitive fields since @unmanaged classes have restrictions
// on managed references.

@unmanaged
export class RawVec2 {
  // @ts-ignore
  x: f32;
  // @ts-ignore
  y: f32;
}

// --- Multi-level inheritance (extends existing Shape → Circle) ---

export class Sphere extends Circle {
  solid: bool;

  constructor(color: string, radius: f64, solid: bool) {
    super(color, radius);
    this.solid = solid;
  }
}

// --- Sibling subclass (same base as Circle) ---

export class Square extends Shape {
  side: f64;

  constructor(color: string, side: f64) {
    super(color);
    this.side = side;
  }
}

// --- Abstract base class with concrete subclasses ---

export abstract class Animal {
  name: string;
  legs: i32;

  constructor(name: string, legs: i32) {
    this.name = name;
    this.legs = legs;
  }
}

export class Dog extends Animal {
  breed: string;

  constructor(name: string, breed: string) {
    super(name, 4);
    this.breed = breed;
  }
}

export class Cat extends Animal {
  indoor: bool;

  constructor(name: string, indoor: bool) {
    super(name, 4);
    this.indoor = indoor;
  }
}

// --- Both @operator("==") AND .equals() — operator takes precedence ---

export class DualEquality {
  id: i32;
  label: string;

  constructor(id: i32, label: string) {
    this.id = id;
    this.label = label;
  }

  // Custom equality via operator: compares id only
  @operator("==")
  opEquals(other: DualEquality): bool {
    return this.id == other.id;
  }

  // Custom equality via .equals(): compares label only (not used by deep equality — operator== takes precedence)
  equals(other: DualEquality): bool {
    return this.label == other.label;
  }
}

// --- @operator("==") that throws on specific condition ---

export class ThrowingEquals {
  value: i32;

  constructor(value: i32) {
    this.value = value;
  }

  @operator("==")
  opEquals(other: ThrowingEquals): bool {
    if (this.value < 0 || other.value < 0) {
      throw new Error("Cannot compare negative values");
    }
    return this.value == other.value;
  }
}

// --- Container fields with user objects ---

export class Team {
  teamName: string;
  members: Array<Person>;

  constructor(teamName: string, members: Array<Person>) {
    this.teamName = teamName;
    this.members = members;
  }
}

export class Registry {
  entries: Map<string, Point>;

  constructor(entries: Map<string, Point>) {
    this.entries = entries;
  }
}

export class PointGroup {
  points: Set<Point>;

  constructor(points: Set<Point>) {
    this.points = points;
  }
}

// --- Nested type mismatch: wrapper with polymorphic field ---

export class ShapeWrapper {
  label: string;
  shape: Shape;

  constructor(label: string, shape: Shape) {
    this.label = label;
    this.shape = shape;
  }
}

// --- Circular / self-referential ---

export class ListNode {
  value: i32;
  next: ListNode | null;

  constructor(value: i32, next: ListNode | null = null) {
    this.value = value;
    this.next = next;
  }
}

// --- Namespaced classes with the same name ---

export namespace NS_A {
  export class Item {
    value: i32;

    constructor(value: i32) {
      this.value = value;
    }
  }
}

export namespace NS_B {
  export class Item {
    value: i32;

    constructor(value: i32) {
      this.value = value;
    }
  }
}
