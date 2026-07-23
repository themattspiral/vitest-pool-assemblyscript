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

import { runVitest } from '../../../scripts/run-vitest-external.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

/** Well-known path for the results file. Test files read from here. */
const TMP_DIR = resolve(PROJECT_ROOT, 'tmp/');
const RESULTS_PATH = resolve(TMP_DIR, '.meta-verify-results.json');

const VITEST_RUN_BANNER_PATTERN = /RUN\s+v\S+\s+.+/;

export default async function setup(): Promise<() => Promise<void>> {
  // remove any existing results file
  await unlink(RESULTS_PATH).catch(() => {});

  // create project tmp dir if it doesn't exist
  await mkdir(TMP_DIR, { recursive: true }).catch(() => {});

  const context = process.env.RUN_CONTEXT || 'local';
  const isExternal = context === 'external';
  const cwd = isExternal ? EXTERNAL_DIR : PROJECT_ROOT;
  const coverageEnabled = true;

  // The delegated JS coverage provider the meta suite runs under. The suite
  // inherits VITEST_AS_POOL_JS_PROVIDER through the spawned child's env, so its
  // coverage config selects the matching entry point; recorded here so the
  // verification run is self-describing.
  const jsProvider = process.env.VITEST_AS_POOL_JS_PROVIDER === 'istanbul' ? 'istanbul' : 'v8';

  const args = ['-c', 'vitest.meta.config.ts'];
  if (!coverageEnabled) {
    args.push('--coverage.enabled=false');
  }

  const start = performance.now();
  const { jsonOutput, cliOutput, exitCode } = await runVitest({ cwd, args, capture: true });
  const duration = (performance.now() - start).toFixed(0);

  const runLine = stripVTControlCharacters(cliOutput).match(VITEST_RUN_BANNER_PATTERN)?.[0]?.trim() ?? 'unknown';

  console.log(`[Meta-Verify globalSetup] Meta suite run completed in ${duration}ms`);
  console.log(`[Meta-Verify globalSetup]   CLI Output: ${runLine}`);
  console.log(`[Meta-Verify globalSetup]   RUN_CONTEXT: ${context}`);
  console.log(`[Meta-Verify globalSetup]   jsProvider: ${jsProvider}`);
  console.log(`[Meta-Verify globalSetup]   args: ${args.join(' ')}`);
  console.log(`[Meta-Verify globalSetup]   cwd: ${cwd}`);

  if (!jsonOutput) {
    throw new Error(
      `[Meta-Verify globalSetup] Meta suite run produced no JSON output (exit ${exitCode}); `
        + `it likely crashed before running any tests. Captured output:\n\n${cliOutput}`,
    );
  }

  await writeFile(RESULTS_PATH, JSON.stringify({
    jsonOutput,
    cliOutput,
    exitCode,
    cwd,
    jsProvider,
  }));

  console.log(`[Meta-Verify globalSetup]   Captured results in: ${RESULTS_PATH}`);
  console.log('');

  // Teardown: clean up results file
  return async (): Promise<void> => {
    await unlink(RESULTS_PATH).catch(() => {});
  };
}
