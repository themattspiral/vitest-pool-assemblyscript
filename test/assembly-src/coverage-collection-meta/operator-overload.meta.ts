/**
 * Operator overload coverage verification.
 * Tests whether @operator-decorated static methods appear in coverage
 * and what naming convention they use.
 */

export class Vec2 {
  x: f64;
  y: f64;

  constructor(x: f64, y: f64) {
    this.x = x;
    this.y = y;
  }

  // @ts-ignore: AS decorator
  @operator("+")
  static add(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  // @ts-ignore: AS decorator
  @operator("==")
  static equals(a: Vec2, b: Vec2): bool {
    return a.x == b.x && a.y == b.y;
  }

  /** Regular method for comparison */
  length(): f64 {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
}
