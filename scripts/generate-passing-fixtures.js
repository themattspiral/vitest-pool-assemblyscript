/**
 * Executes all passing-suite fixture generators before vitest runs.
 *
 * Each file in `test/generators/` (excluding `*.meta.{js,mjs}`) is a generator
 * that default-exports a function which writes its fixture into the gitignored
 * `test-generated/` directory. This script discovers them, imports each, and
 * awaits its default export.
 *
 * It runs ahead of `vitest run` (wired into the passing npm scripts) because
 * vitest resolves both its test-spec glob and the coverage-include glob from the
 * filesystem before any `globalSetup` executes — so a fixture must already exist
 * on disk when vitest starts, or it is missed on the first run (always the case
 * in CI, where `test-generated/` is gitignored and each checkout is clean). See
 * the Developer Guide's "Generated Fixtures" section for the full rationale.
 *
 * Meta generators (named `*.meta.js` / `*.meta.mjs`, none today) are intentionally
 * excluded: a meta fixture would need generating ahead of the *meta* commands, not
 * the passing ones, so a future meta executor would own them.
 */

import { readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const GENERATORS_DIR = join(PROJECT_ROOT, 'test', 'generators');

/** A generator is a top-level `.js`/`.mjs` file in the generators dir, excluding `*.meta.*`. */
function isPassingGeneratorFile(filename) {
  if (!/\.(js|mjs)$/.test(filename)) {
    return false;
  }
  return !/\.meta\.(js|mjs)$/.test(filename);
}

const generatorFiles = readdirSync(GENERATORS_DIR)
  .filter(isPassingGeneratorFile)
  .sort();

if (generatorFiles.length === 0) {
  console.warn(`[generate-passing-fixtures] No generators found in ${GENERATORS_DIR}`);
}

console.log(`[generate-passing-fixtures] Running ${generatorFiles.length} generator(s)`);

for (const filename of generatorFiles) {
  const modulePath = join(GENERATORS_DIR, filename);
  // pathToFileURL is required for dynamic import on Windows, where a bare
  // absolute path (e.g. C:\...) is not a valid import specifier.
  const mod = await import(pathToFileURL(modulePath).href);

  if (typeof mod.default !== 'function') {
    throw new Error(
      `[generate-passing-fixtures] ${filename} has no callable default export. ` +
      `Every file in test/generators/ must default-export its generator function ` +
      `(name it *.meta.js to exclude it from the passing generators).`
    );
  }

  await mod.default();
}
