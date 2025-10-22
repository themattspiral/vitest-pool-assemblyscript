#!/usr/bin/env node
/**
 * Compare source maps WITH and WITHOUT @inline stripping
 *
 * This tool compiles the same test file twice:
 * 1. WITH strip-inline transform
 * 2. WITHOUT strip-inline transform
 *
 * Then compares the resulting source maps to understand why line numbers remain accurate.
 */

import asc from 'assemblyscript/dist/asc.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function compileWithOptions(filename, stripInline = false) {
  let binary = null;
  let sourceMap = null;

  const compilerFlags = [
    filename,
    '--outFile', 'output.wasm',
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--importMemory',
    '--debug',
    '--sourceMap',
    '--exportStart', '_start',
    '--exportTable',
  ];

  if (stripInline) {
    compilerFlags.push('--transform', './src/transforms/strip-inline.mjs');
  }

  const stderr = {
    write: (text) => {
      console.error(text);
      return true;
    }
  };

  const result = await asc.main(compilerFlags, {
    stderr,
    writeFile: (name, contents, _baseDir) => {
      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        sourceMap = contents;
      }
    },
  });

  if (result.error) {
    throw result.error;
  }

  return { binary, sourceMap };
}

async function main() {
  const testFile = 'tests/assembly/inline-error-test.as.test.ts';

  console.log('=== Compiling WITHOUT @inline stripping ===\n');
  const withoutStrip = await compileWithOptions(testFile, false);
  console.log(`Binary size: ${withoutStrip.binary.length} bytes`);
  console.log(`Source map size: ${withoutStrip.sourceMap.length} bytes\n`);

  console.log('=== Compiling WITH @inline stripping ===\n');
  const withStrip = await compileWithOptions(testFile, true);
  console.log(`Binary size: ${withStrip.binary.length} bytes`);
  console.log(`Source map size: ${withStrip.sourceMap.length} bytes\n`);

  // Save source maps for manual inspection
  const outputDir = 'debug-tools/output';
  writeFileSync(join(outputDir, 'without-strip.wasm.map'), withoutStrip.sourceMap);
  writeFileSync(join(outputDir, 'with-strip.wasm.map'), withStrip.sourceMap);
  console.log(`Saved source maps to ${outputDir}/\n`);

  // Parse and compare
  const mapWithout = JSON.parse(withoutStrip.sourceMap);
  const mapWith = JSON.parse(withStrip.sourceMap);

  console.log('=== Source Map Comparison ===\n');
  console.log('WITHOUT stripping:');
  console.log(`  Sources: ${mapWithout.sources.length}`);
  console.log(`  Mappings length: ${mapWithout.mappings.length}`);
  console.log(`  Sources list: ${mapWithout.sources.join(', ')}\n`);

  console.log('WITH stripping:');
  console.log(`  Sources: ${mapWith.sources.length}`);
  console.log(`  Mappings length: ${mapWith.mappings.length}`);
  console.log(`  Sources list: ${mapWith.sources.join(', ')}\n`);

  // Check if mappings differ
  if (mapWithout.mappings === mapWith.mappings) {
    console.log('⚠️  MAPPINGS ARE IDENTICAL - This is unexpected!\n');
  } else {
    console.log('✓ Mappings differ (expected)\n');
    console.log(`Mapping difference: ${Math.abs(mapWith.mappings.length - mapWithout.mappings.length)} characters\n`);
  }

  // Sample first 500 chars of mappings
  console.log('=== Sample Mappings (first 500 chars) ===\n');
  console.log('WITHOUT stripping:');
  console.log(mapWithout.mappings.substring(0, 500) + '...\n');
  console.log('WITH stripping:');
  console.log(mapWith.mappings.substring(0, 500) + '...\n');
}

main().catch(console.error);
