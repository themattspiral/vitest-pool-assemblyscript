import { describe, test, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVitest } from '../../scripts/run-vitest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

describe('meta test output capture', () => {
  let result: ReturnType<typeof runVitest>;

  beforeAll(() => {
    result = runVitest({
      cwd: PROJECT_ROOT,
      args: ['-c', 'vitest.meta.config.ts'],
      capture: true,
    });
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
