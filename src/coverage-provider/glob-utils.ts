/**
 * Glob Utilities for Coverage
 *
 * Uses test-exclude (same as Vitest's v8 coverage provider) to glob
 * AssemblyScript files matching coverage.include patterns.
 */

import { resolve } from 'path';
import TestExclude from 'test-exclude';

import { GlobResult } from '../types.js';

/**
 * Glob files matching coverage include/exclude patterns
 *
 * Uses test-exclude for consistent behavior with Vitest's built-in
 * coverage providers.
 *
 * @param include - Include patterns (e.g., ['assembly/**\/*.ts'])
 * @param exclude - Exclude patterns (e.g., ['**\/*.test.ts'])
 * @param projectRoot - Project root directory
 * @returns Array of absolute file paths
 */
export function globFiles(
  include: string[],
  exclude: string[],
  projectRoot: string
): GlobResult[] {
  // avoid issues with default behavior being grabbing from cwd
  if (include.length === 0) {
    return [];
  }

  const testExclude = new TestExclude({
    cwd: projectRoot,
    include,
    exclude,
    excludeNodeModules: true,
  });

  const includedFiles = testExclude.globSync(projectRoot);
  const results: GlobResult[] = includedFiles.map((file: string) => ({
    absolute: resolve(projectRoot, file),
    projectRootRelative: file
  })) || [];

  return results;
}
