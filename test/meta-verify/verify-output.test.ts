import { describe, test, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

const RESULTS_PATH = resolve(PROJECT_ROOT, '.meta-verify-results.json');

describe('meta test output capture', () => {
  let jsonOutput: object | null;
  let cliOutput: string;

  beforeAll(() => {
    const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
    jsonOutput = results.jsonOutput;
    cliOutput = results.cliOutput;
  });

  test('json output has content', () => {
    expect(jsonOutput).not.toBeNull();
    expect(jsonOutput).toBeTypeOf('object');
  });

  test('cli output has content', () => {
    expect(cliOutput).toBeTruthy();
    expect(cliOutput.length).toBeGreaterThan(0);
  });
});
