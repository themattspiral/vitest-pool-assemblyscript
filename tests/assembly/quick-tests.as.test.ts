/**
 * Quick tests - many small, fast tests
 * Used to measure overhead of per-test isolation
 */

import { test, assert } from '../../assembly';

// 20 trivial tests that should complete in <1ms each
// Using variable assignment to avoid AS compiler const-folding bug
test('quick 1', () => { const x: i32 = 1 + 1; assert(x == 2); });
test('quick 2', () => { const x: i32 = 2 + 2; assert(x == 4); });
test('quick 3', () => { const x: i32 = 3 + 3; assert(x == 6); });
test('quick 4', () => { const x: i32 = 4 + 4; assert(x == 8); });
test('quick 5', () => { const x: i32 = 5 + 5; assert(x == 10); });
test('quick 6', () => { const x: i32 = 6 + 6; assert(x == 12); });
test('quick 7', () => { const x: i32 = 7 + 7; assert(x == 14); });
test('quick 8', () => { const x: i32 = 8 + 8; assert(x == 16); });
test('quick 9', () => { const x: i32 = 9 + 9; assert(x == 18); });
test('quick 10', () => { const x: i32 = 10 + 10; assert(x == 20); });
test('quick 11', () => { const x: i32 = 11 + 11; assert(x == 22); });
test('quick 12', () => { const x: i32 = 12 + 12; assert(x == 24); });
test('quick 13', () => { const x: i32 = 13 + 13; assert(x == 26); });
test('quick 14', () => { const x: i32 = 14 + 14; assert(x == 28); });
test('quick 15', () => { const x: i32 = 15 + 15; assert(x == 30); });
test('quick 16', () => { const x: i32 = 16 + 16; assert(x == 32); });
test('quick 17', () => { const x: i32 = 17 + 17; assert(x == 34); });
test('quick 18', () => { const x: i32 = 18 + 18; assert(x == 36); });
test('quick 19', () => { const x: i32 = 19 + 19; assert(x == 38); });
test('quick 20', () => { const x: i32 = 20 + 20; assert(x == 40); });
