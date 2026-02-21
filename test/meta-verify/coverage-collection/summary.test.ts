import { describe, test, expect, beforeAll } from 'vitest';
import {
  type CoverageTableRow, type ParsedCliOutput, COVERAGE_ENABLED,
  loadParsedCliOutput, requireCoverageTableRow,
} from '../helpers/shared.js';

describe.runIf(COVERAGE_ENABLED)('coverage summary — CLI table verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  describe('partial-three-of-seven (3/7, non-contiguous gaps)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      row = requireCoverageTableRow(parsedCli, 'partial-three-of-seven.meta.ts');
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
      row = requireCoverageTableRow(parsedCli, 'partial-five-of-nine.meta.ts');
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
      row = requireCoverageTableRow(parsedCli, 'partial-two-of-eleven.meta.ts');
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
      row = requireCoverageTableRow(parsedCli, 'partial-six-of-seven.meta.ts');
    });

    test('% Funcs is 85.71', () => {
      expect(row.funcs).toBe(85.71);
    });

    test('uncovered lines show single line', () => {
      expect(row.uncoveredLines).toBe('53');
    });
  });

  describe('partial-all-covered (5/5)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      row = requireCoverageTableRow(parsedCli, 'partial-all-covered.meta.ts');
    });

    test('% Funcs is 100', () => {
      expect(row.funcs).toBe(100);
    });

    test('no uncovered lines', () => {
      expect(row.uncoveredLines).toBe('');
    });
  });

  describe('standalone-unused (0/3)', () => {
    let row: CoverageTableRow;

    beforeAll(() => {
      row = requireCoverageTableRow(parsedCli, 'standalone-unused.meta.ts');
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
      row = requireCoverageTableRow(parsedCli, 'class-utils-unused.meta.ts');
    });

    test('% Funcs is 0', () => {
      expect(row.funcs).toBe(0);
    });

    test('uncovered lines span all methods', () => {
      expect(row.uncoveredLines).toBe('8-35');
    });
  });
});
