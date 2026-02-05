/**
 * Glob Utilities for Coverage
 *
 * Uses tinyglobby to glob AssemblyScript files matching coverage include/exclude patterns.
 * Supports ../ path traversals for projects that import source from outside the project root.
 *
 * Note: tinyglobby docs warn of a performance cost when globbing outside cwd (e.g. ../ patterns)
 * due to recalculating relative paths. Acceptable here since this runs once at startup.
 */

import { relative } from 'node:path';
import { globSync } from 'tinyglobby';

import { GlobResult } from '../types/types.js';
import { toForwardSlash } from '../util/path-utils.js';

const NODE_MODULES_GLOB = '**/node_modules/**';

/**
 * Glob files matching coverage include/exclude patterns
 *
 * @param include - Include patterns (e.g., ['assembly/**\/*.ts'])
 * @param exclude - Exclude patterns (e.g., ['**\/*.test.ts'])
 * @param projectRoot - Project root directory
 * @returns Array of glob results with absolute and project-root-relative paths
 */
export function globFiles(
  include: string[],
  exclude: string[],
  projectRoot: string
): GlobResult[] {
  if (include.length === 0) {
    return [];
  }

  const absolutePaths = globSync(include, {
    cwd: projectRoot,
    ignore: [NODE_MODULES_GLOB, ...exclude],
    absolute: true,
  });

  return absolutePaths.map((absolute) => ({
    absolute: toForwardSlash(absolute),
    projectRootRelative: toForwardSlash(relative(projectRoot, absolute)),
  }));
}
