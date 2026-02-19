import { describe, test, expect, beforeAll } from 'vitest';
import {
  type CoverageTableRow, COVERAGE_ENABLED,
  loadCliOutput, parseCoverageTableRow,
} from '../helpers/shared.js';

describe.runIf(COVERAGE_ENABLED)('coverage summary — CLI table verification', () => {
  let cliOutput: string;

  beforeAll(async () => {
    cliOutput = await loadCliOutput();
  });

  // --- Partial coverage: non-whole-number percentages ---

  describe('partial-three-of-seven (3/7, non-contiguous gaps)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'partial-three-of-seven.meta.ts');
      expect(parsed, 'coverage table row not found for partial-three-of-seven.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 42.85', () => {
      expect(row.funcs).toBe(42.85);
    });

    test('uncovered lines show non-contiguous gaps', () => {
      expect(row.uncoveredLines).toBe('10-14,24,32');
    });
  });

  describe('partial-five-of-nine (5/9, contiguous block)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'partial-five-of-nine.meta.ts');
      expect(parsed, 'coverage table row not found for partial-five-of-nine.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 55.55', () => {
      expect(row.funcs).toBe(55.55);
    });

    test('uncovered lines show contiguous range', () => {
      expect(row.uncoveredLines).toBe('26-38');
    });
  });

  describe('partial-two-of-eleven (2/11)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'partial-two-of-eleven.meta.ts');
      expect(parsed, 'coverage table row not found for partial-two-of-eleven.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 18.18', () => {
      expect(row.funcs).toBe(18.18);
    });

    test('uncovered lines show contiguous range', () => {
      expect(row.uncoveredLines).toBe('14-46');
    });
  });

  describe('partial-six-of-seven (6/7)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'partial-six-of-seven.meta.ts');
      expect(parsed, 'coverage table row not found for partial-six-of-seven.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 85.71', () => {
      expect(row.funcs).toBe(85.71);
    });

    test('uncovered lines show single line', () => {
      expect(row.uncoveredLines).toBe('53');
    });
  });

  // --- Full coverage ---

  describe('partial-all-covered (5/5)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'partial-all-covered.meta.ts');
      expect(parsed, 'coverage table row not found for partial-all-covered.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 100', () => {
      expect(row.funcs).toBe(100);
    });

    test('no uncovered lines', () => {
      expect(row.uncoveredLines).toBe('');
    });
  });

  // --- Completely unused files (0% coverage) ---

  describe('standalone-unused (0/3)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'standalone-unused.meta.ts');
      expect(parsed, 'coverage table row not found for standalone-unused.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 0', () => {
      expect(row.funcs).toBe(0);
    });

    test('uncovered lines span all functions', () => {
      expect(row.uncoveredLines).toBe('6-14');
    });
  });

  describe('class-utils-unused (0/7)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      const parsed = parseCoverageTableRow(cliOutput, 'class-utils-unused.meta.ts');
      expect(parsed, 'coverage table row not found for class-utils-unused.meta.ts').not.toBeNull();
      row = parsed!;
    });

    test('% Funcs is 0', () => {
      expect(row.funcs).toBe(0);
    });

    test('uncovered lines span all methods', () => {
      expect(row.uncoveredLines).toBe('8-35');
    });
  });
});
