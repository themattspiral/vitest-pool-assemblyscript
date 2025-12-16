/**
 * Structural validation tests across ALL fixtures
 *
 * Verifies that extracted debug info has valid internal structure:
 * - Function indices are unique
 * - Expression/block references are valid
 * - Branch targets point to valid blocks
 * - Source map matches extracted data
 *
 * Runs on all test fixtures in test-fixtures/assembly/
 *
 * NOTE: Tests for the validator functions themselves are in test/internal/validators.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getAllFixtures,
  compileAndExtract,
  type CompiledFixture,
} from '../helpers/test-fixtures.js';
import {
  validateDebugInfoStructure,
  sanityCheckDebugInfoAgainstSourceMap,
  validateDebugInfoFunctionSourceLocations,
} from '../helpers/validate-debug-info.js';

describe('Native Instrumentation Debug Info', () => {
  // Validation tests run on all fixtures
  const fixtures = getAllFixtures();

  describe.each(fixtures)('$name fixture', (fixture) => {
    let compiledFixtureInfo: CompiledFixture;

    beforeAll(async () => {
      compiledFixtureInfo = await compileAndExtract(fixture);
      expect(compiledFixtureInfo.compileResult.binary).toBeDefined();
      expect(compiledFixtureInfo.compileResult.debugInfo).toBeDefined();
      expect(compiledFixtureInfo.compileResult.sourceMap).toBeDefined();
      expect(compiledFixtureInfo.compileResult.isInstrumented).toBe(true);
    });

    it('should have valid object structure', () => {
      const result = validateDebugInfoStructure(compiledFixtureInfo.compileResult.debugInfo!);

      // TEMP: Log coverage info
      // const coverage = result.stats.totalExpressions > 0
      //   ? ((result.stats.expressionsWithLocations / result.stats.totalExpressions) * 100).toFixed(1)
      //   : 0;
      // console.log(`\n[${fixture.name}] Coverage: ${result.stats.expressionsWithLocations}/${result.stats.totalExpressions} (${coverage}%)`);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.stats.totalFunctions).toBeGreaterThan(0);
      expect(result.stats.totalExpressions).toBeGreaterThan(0);
    });

    it('should pass source map sanity check', () => {
      const result = sanityCheckDebugInfoAgainstSourceMap(compiledFixtureInfo.compileResult);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
    
    // disable until we refactor source validation to use the ast parser
    it.skip('should have correct function representative locations', () => {
      const result = validateDebugInfoFunctionSourceLocations(compiledFixtureInfo.compileResult.debugInfo!);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });
});
