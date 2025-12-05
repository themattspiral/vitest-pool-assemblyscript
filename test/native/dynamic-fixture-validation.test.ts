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

describe('Native Addon - Dynamic Fixture Validation', () => {
  // Validation tests that run on ALL fixtures
  describe.each(getAllFixtures())('$name fixture validation', (fixture) => {
    let compiled: CompiledFixture;

    beforeAll(async () => {
      // strip inline decorators so that we can validate the presence of all named functions
      // TODO - remove when we're using the AST parser and position-based validation
      compiled = await compileAndExtract(fixture, { stripInline: true });
      expect(compiled.compiled.binary).toBeDefined();
      expect(compiled.compiled.sourceMap).toBeDefined();
    });

    it('should pass structural validation', () => {
      const { debugInfo } = compiled;
      const result = validateDebugInfoStructure(debugInfo);

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
      const { debugInfo, compiled: compileResult } = compiled;
      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, compileResult.sourceMap!.toString());

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
    
    it('should pass line number mapping correctness check', () => {
      const { debugInfo } = compiled;
      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });
});
