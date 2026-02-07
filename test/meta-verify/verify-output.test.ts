import { describe, test, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVitest } from '../../scripts/run-vitest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

const isExternalContext = process.env.RUN_CONTEXT === 'external';
const isExternalNoCoverageContext = process.env.RUN_CONTEXT === 'external_no_coverage';

describe('meta test output capture', () => {
  let result: ReturnType<typeof runVitest>;

  beforeAll(() => {
    const cwd = isExternalContext || isExternalNoCoverageContext ? EXTERNAL_DIR : PROJECT_ROOT;
    const start = performance.now();

    const args = ['-c', 'vitest.meta.config.ts'];
    if (isExternalNoCoverageContext) {
      args.push('--coverage.enabled=false');
    }

    result = runVitest({
      cwd,
      args,
      capture: true,
    });

    console.log(`Meta Runner received result from \`vitest -c vitest.meta.config.ts\` in "${cwd}"`);
    console.log(`Meta Runner execution completed in ${(performance.now() - start).toFixed(2)}ms`);
  });

  test('json output has content', () => {
    expect(result.jsonOutput).not.toBeNull();
    expect(result.jsonOutput).toBeTypeOf('object');
  });

  test('cli output has content', () => {
    expect(result.cliOutput).toBeTruthy();
    expect(result.cliOutput.length).toBeGreaterThan(0);
  });
});
