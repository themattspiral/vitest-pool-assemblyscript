import { describe, test, expect, beforeAll } from 'vitest';
import {
  type CoverageTableRow, type ParsedCliOutput, COVERAGE_ENABLED,
  loadParsedCliOutput, requireCoverageTableRow,
} from '../../helpers/shared.js';

/**
 * Verifies the user-facing coverage summary TABLE (Istanbul's text reporter) — the full
 * per-file row a user reads: % Stmts, % Branch, % Funcs, % Lines, and the "Uncovered Line
 * #s" column, together. Per-type coverage *data* correctness (the underlying counts) is
 * owned by the function/, statement/, and branch/ suites; this suite confirms the four
 * mixed-type columns render correctly side by side in the summary row.
 *
 * Two reporter behaviors the expectations below rely on:
 *  - The "Uncovered Line #s" column is LINE-derived: it lists the start lines of uncovered
 *    statements and groups consecutive uncovered ENTRIES (in statement order, not by
 *    line-number contiguity) into `first-last` ranges. So `11-15` can appear even when
 *    lines 12-14 carry no statements at all — 11 and 15 are simply adjacent uncovered
 *    statement lines with nothing covered between them.
 *  - A file with no branches reports 100% Branch — Istanbul's percent(0, 0) is 100.
 *
 * Each row's expected values are derived from the fixture source + the functions its
 * driver exercises (the per-row notes show the covered/total derivation), independent of
 * the rendered output. Percentages are Istanbul's floor-to-2-decimals of covered/total.
 */

interface ExpectedSummaryRow {
  /** Short label + the discriminating aspect this row exercises. */
  label: string;
  /** Path suffix for requireCoverageTableRow. */
  file: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
  uncovered: string;
}

const ROWS: ExpectedSummaryRow[] = [
  {
    // 7 fns, 3 tested (toUpperBound, sign, isPositive). All four columns distinct.
    // Stmts 7/11: `sign` is 5 statements (`if (c) return x;` = if + return, twice, plus
    //   `return 0`); covered = toUpperBound(1) + sign(5) + isPositive(1). The 4 uncovered
    //   statements are the untested single-return fns (toLowerBound/absoluteValue/isEven/isZero).
    // Branch 6/10: toUpperBound ternary 2/2 + sign's two ifs 2/2 each (incl. implicit else);
    //   toLowerBound & absoluteValue ternaries 0/2 each.
    // Lines 5/9: 9 distinct statement lines, 5 covered (sign's 5 stmts collapse onto 3 lines).
    label: 'partial-three-of-seven (3/7 funcs; all four columns distinct, mixed uncovered gaps)',
    file: 'partial-three-of-seven.meta.ts',
    stmts: 63.63, branch: 60, funcs: 42.85, lines: 55.55, uncovered: '11-15,25,33',
  },
  {
    // 9 fns, 5 tested (double/triple/square/cube/halve), each a single-return statement.
    // Stmts/Funcs/Lines all 5/9. Branch 0/2: the only branch is `difference`'s ternary,
    // which is untested. Uncovered statements are contiguous (remainder..average).
    label: 'partial-five-of-nine (5/9 funcs; branch 0 from a single untested ternary, contiguous gap)',
    file: 'partial-five-of-nine.meta.ts',
    stmts: 55.55, branch: 0, funcs: 55.55, lines: 55.55, uncovered: '27-39',
  },
  {
    // 11 fns, 2 tested (increment, decrement). Stmts/Lines/Funcs all distinct.
    // Stmts 2/15: `clamp` is 5 statements (two `if (c) return x;` + `return value`); the
    //   other 10 fns are 1 each. Lines 2/13: clamp's 5 stmts sit on 3 lines.
    // Branch 0/8: max/min ternaries + clamp's two ifs (2 arms each), all untested.
    label: 'partial-two-of-eleven (2/11 funcs; low coverage, Stmts<Lines<Funcs, branch 0)',
    file: 'partial-two-of-eleven.meta.ts',
    stmts: 13.33, branch: 0, funcs: 18.18, lines: 15.38, uncovered: '15-49',
  },
  {
    // 7 fns, 6 tested (all but triangleNumber). Stmts ≠ Lines — the discriminating case.
    // Stmts 30/32: two uncovered statements — triangleNumber's `return`, AND fibonacci's
    //   `return 1` (the `if (n == 1)` consequent, never hit by inputs 10/0).
    // Lines 25/26: only ONE uncovered line (triangleNumber@54); fibonacci's uncovered
    //   `return 1` shares line 13 with the covered `if`, so the line reads covered.
    // Branch 5/6: factorial if 2/2 + fibonacci if@12 2/2 + fibonacci if@13 1/2 (n==1 never
    //   true). Loops (for/while) are excluded from branch coverage.
    label: 'partial-six-of-seven (6/7 funcs; Stmts≠Lines via an unreached if-consequent, partial branch)',
    file: 'partial-six-of-seven.meta.ts',
    stmts: 93.75, branch: 83.33, funcs: 85.71, lines: 96.15, uncovered: '54',
  },
  {
    // 5 fns, all tested. 100% across the board. No branches in this fixture, so % Branch is
    // 100 by absence (percent(0, 0) === 100), not by covering arms.
    label: 'partial-all-covered (5/5; 100% all types, branch 100 by absence)',
    file: 'partial-all-covered.meta.ts',
    stmts: 100, branch: 100, funcs: 100, lines: 100, uncovered: '',
  },
  {
    // 3 standalone functions never imported by any test → 0% stmts/funcs/lines. No branches
    // anywhere, so % Branch is still 100 (percent(0, 0)) despite the file being fully unhit.
    label: 'standalone-unused (0/3; never imported, 0% but branch 100 by absence)',
    file: 'standalone-unused.meta.ts',
    stmts: 0, branch: 100, funcs: 0, lines: 0, uncovered: '7-15',
  },
  {
    // An uninstantiated class: all 7 members (ctor, methods, getter, setter, static, private)
    // at 0%. No branches, so % Branch is 100 by absence.
    label: 'class-utils-unused (0/7; uninstantiated class, 0% but branch 100 by absence)',
    file: 'class-utils-unused.meta.ts',
    stmts: 0, branch: 100, funcs: 0, lines: 0, uncovered: '9-36',
  },
];

describe.runIf(COVERAGE_ENABLED)('coverage summary — CLI table full-row verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  for (const expected of ROWS) {
    test(`${expected.label} — full summary row`, () => {
      const row: CoverageTableRow = requireCoverageTableRow(parsedCli, expected.file);
      expect(row.stmts, '% Stmts').toBe(expected.stmts);
      expect(row.branch, '% Branch').toBe(expected.branch);
      expect(row.funcs, '% Funcs').toBe(expected.funcs);
      expect(row.lines, '% Lines').toBe(expected.lines);
      expect(row.uncoveredLines, 'Uncovered Line #s').toBe(expected.uncovered);
    });
  }
});
