import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import Tinypool from 'tinypool';
import { resolve } from 'node:path';
import { availableParallelism } from 'node:os';

import {
  getAllFixtures,
  type CompiledFixture,
} from './helpers/test-fixtures.js';
import {
  sanityCheckDebugInfoAgainstSourceMap,
  validateCounterIndexIntegrity,
} from './helpers/validate-debug-info.js';

describe('Native Instrumentation Debug Info', () => {
  const COMPILE_WORKER_PATH = resolve(import.meta.dirname, 'helpers/validator-compile-worker.mjs');
  const EXCLUDED_FIXTURES: { [name: string]: true } = {
    'compilation-error.meta.test': true,
  };
  let COMPILE_POOL: Tinypool;

  beforeAll(() => {
    COMPILE_POOL = new Tinypool({
      filename: COMPILE_WORKER_PATH,
      minThreads: 1,
      maxThreads: Math.ceil(availableParallelism() / 2),
      isolateWorkers: false,
      idleTimeout: 30000,
    });
  });

  afterAll(async () => {
    await COMPILE_POOL.destroy();
  });

  // Validation tests run on all fixtures (except those expected to fail)
  const fixtures = getAllFixtures().filter(f => !EXCLUDED_FIXTURES[f.name]);

  describe.concurrent.each(fixtures)('$name fixture', (fixture) => {
    let compiledFixtureInfo: CompiledFixture;

    beforeAll(async () => {
      compiledFixtureInfo = await COMPILE_POOL.run(fixture, { name: 'compileAndExtractTestFixture' });
      expect(compiledFixtureInfo.compilation.compiledModule).toBeDefined();
      expect(compiledFixtureInfo.compilation.debugInfo).toBeDefined();
      expect(compiledFixtureInfo.compilation.sourceMap).toBeDefined();
      expect(compiledFixtureInfo.compilation.isInstrumented).toBe(true);
    });
    
    it('should pass source map sanity check', async ({ expect }) => {
      const result = sanityCheckDebugInfoAgainstSourceMap(compiledFixtureInfo.compilation);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('should allocate unique, dense coverage counter indices', async ({ expect }) => {
      const result = validateCounterIndexIntegrity(compiledFixtureInfo.compilation.debugInfo!);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });
});
