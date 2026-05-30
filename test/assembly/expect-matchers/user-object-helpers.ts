import {
  Point, GameState,
} from "../../assembly-src/user-class-utils";

// Helpers for composite object tests — at module level because AS doesn't support closures.
// Each "different X" test calls defaultGameState() and overrides the field under test.
function defaultInventory(): Map<string, i32> {
  const m = new Map<string, i32>();
  m.set("sword", 1);
  m.set("potion", 5);
  return m;
}
function defaultTags(): Set<string> {
  const s = new Set<string>();
  s.add("warrior");
  s.add("guild-member");
  return s;
}
function defaultRawScores(): Int32Array {
  const a = new Int32Array(3);
  a[0] = 100; a[1] = 200; a[2] = 300;
  return a;
}
function defaultLandmarks(): Map<string, Point> {
  const m = new Map<string, Point>();
  m.set("spawn", new Point(0, 0));
  m.set("boss", new Point(99, 99));
  return m;
}
function defaultVisited(): Set<Point> {
  const s = new Set<Point>();
  s.add(new Point(1, 1));
  s.add(new Point(2, 2));
  return s;
}
function defaultBuf(): ArrayBuffer {
  const b = new ArrayBuffer(4);
  store<u8>(changetype<usize>(b), 0xAB);
  store<u8>(changetype<usize>(b) + 1, 0xCD);
  return b;
}

export function defaultGameState(): GameState {
  return new GameState(
    3, 1500.5, true, "Hero",
    new Point(10, 20),
    new Point(50, 50),
    defaultInventory(),
    defaultTags(),
    [10, 20, 30],
    StaticArray.fromArray<f64>([1.5, 2.5]),
    defaultRawScores(),
    [new Point(1, 2), new Point(3, 4)],
    defaultLandmarks(),
    defaultVisited(),
    i32x4(1, 0, 0, 0),
    defaultBuf(),
  );
}
