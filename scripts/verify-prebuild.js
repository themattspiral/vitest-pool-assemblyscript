/**
 * Verify that prebuild files exist after artifact download.
 *
 * Workaround for actions/download-artifact#454: the action can silently
 * exit 0 with an incomplete or empty download. This script verifies the
 * prebuild files actually landed on disk so we don't cascade into an
 * unnecessary source build during npm ci.
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');
const prebuildsDir = join(packageRoot, 'prebuilds');

if (!existsSync(prebuildsDir)) {
  console.error('Prebuild directory does not exist:', prebuildsDir);
  process.exit(1);
}

function listFiles(dir, prefix = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      listFiles(join(dir, entry.name), relative);
    } else {
      console.log(relative);
    }
  }
}

const entries = readdirSync(prebuildsDir);
if (entries.length === 0) {
  console.error('Prebuild directory is empty:', prebuildsDir);
  process.exit(1);
}

console.log('Prebuild contents:');
listFiles(prebuildsDir);
