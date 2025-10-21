import { test, assert } from '../../assembly';

/**
 * COMMENTED OUT: These tests document a real AssemblyScript compiler bug with const-folding.
 *
 * Bug: Direct evaluation of arithmetic comparisons returns incorrect results.
 * - `1 + 1 == 2` evaluates to FALSE (incorrect)
 * - Breaking into steps: `const x = 1 + 1; x == 2` evaluates to TRUE (correct)
 *
 * This is NOT caused by our test framework - verified by compiling directly with AS compiler.
 *
 * TODO: Re-enable these tests once the AS compiler bug is fixed.
 */

// test('direct const fold', () => {
//   assert(1 + 1 == 2, 'direct expression');
// });

test('variable const fold', () => {
  const result: i32 = 1 + 1;
  assert(result == 2, 'via variable');
});
