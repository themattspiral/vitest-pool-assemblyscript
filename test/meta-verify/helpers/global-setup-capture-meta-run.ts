/**
 * Global setup for meta-verify tests.
 *
 * Runs the meta suite ONCE before any test workers spawn,
 * writes results to a known file. Test files read the file
 * instead of running the suite themselves.
 *
 * This eliminates duplicate meta suite runs and race conditions
 * on shared output files (JSON reporter temp file, coverage-final.json).
 */

import { stripVTControlCharacters } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, unlink, mkdir } from 'node:fs/promises';

import { runVitest } from '../../../scripts/run-vitest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

/** Well-known path for the results file. Test files read from here. */
const TMP_DIR = resolve(PROJECT_ROOT, 'tmp/');
const RESULTS_PATH = resolve(TMP_DIR, '.meta-verify-results.json');

export default async function setup(): Promise<() => Promise<void>> {
  // remove any existing results file
  await unlink(RESULTS_PATH).catch(() => {});

  // create project tmp dir if it doesn't exist
  await mkdir(TMP_DIR, { recursive: true }).catch(() => {});

  const context = process.env.RUN_CONTEXT || 'local';
  const isExternal = context === 'external';
  const isExternalNoCoverage = context === 'external_no_coverage';
  const cwd = isExternal || isExternalNoCoverage ? EXTERNAL_DIR : PROJECT_ROOT;
  const coverageEnabled = !isExternalNoCoverage;

  const args = ['-c', 'vitest.meta.config.ts'];
  if (!coverageEnabled) {
    args.push('--coverage.enabled=false');
  }

  const start = performance.now();
  const { jsonOutput, cliOutput, exitCode } = await runVitest({ cwd, args, capture: true });
  const duration = (performance.now() - start).toFixed(0);

  const runLine = stripVTControlCharacters(cliOutput).match(/RUN\s+v[\d.]+\s+.+/)?.[0]?.trim() ?? 'unknown';

  console.log(`[Meta-Verify globalSetup] Meta suite run completed in ${duration}ms`);
  console.log(`[Meta-Verify globalSetup]   CLI Output: ${runLine}`);
  console.log(`[Meta-Verify globalSetup]   RUN_CONTEXT: ${context}`);
  console.log(`[Meta-Verify globalSetup]   args: ${args.join(' ')}`);
  console.log(`[Meta-Verify globalSetup]   cwd: ${cwd}`);

  await writeFile(RESULTS_PATH, JSON.stringify({
    jsonOutput,
    cliOutput,
    exitCode,
    cwd,
  }));

  console.log(`[Meta-Verify globalSetup]   Captured results in: ${RESULTS_PATH}`);
  console.log('');

  // Teardown: clean up results file
  return async (): Promise<void> => {
    await unlink(RESULTS_PATH).catch(() => {});
  };
}
