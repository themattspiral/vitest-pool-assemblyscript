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
 * - Inheritance
 * - Private/protected fields
 * - Generic classes
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
