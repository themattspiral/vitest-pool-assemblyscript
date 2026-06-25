// @ts-nocheck

/**
 * Cheap structural guards on extracted debug info.
 *
 * These are deliberately narrow: meta-verify (the function/statement/branch/line coverage
 * suites) is the primary, end-to-end proof that debug info is correct. We keep only the
 * invariants that are NOT type-guaranteed and NOT loudly surfaced end-to-end:
 *   - `sanityCheckDebugInfoAgainstSourceMap` — the debug info and the regenerated source map
 *     agree on the source-file set (a file the regeneration dropped breaks error
 *     source-mapping for all code in it).
 *   - `validateCounterIndexIntegrity` — coverage counter indices are unique and densely fill
 *     [0, totalInstrumentationCounters); a duplicate or gap would silently mis-attribute or
 *     drop hit counts, which end-to-end tests reveal only indirectly.
 *
 * The former broad structure / source-location validators were dropped: TypeScript already
 * guarantees the object shape, and the end-to-end coverage tests verify the data far more
 * meaningfully than asserting fields exist.
 *
 * TODO (position-level): strengthen the source-map check from file-set to position-set —
 * decode the regenerated map's mappings and assert every debug location's line:column is
 * present. That needs the map's relative `~lib`/`test` sources resolved to the absolute paths
 * debug locations now use, plus line/column base alignment; tracked as a follow-up.
 */

import type { BinaryDebugInfo, AssemblyScriptCompilerResult } from '../../../src/types/types.js';

export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors found */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Statistics about the validation */
  stats: {
    totalFunctions: number;
    totalExpressions: number;
    expressionsWithLocations: number;
    totalBasicBlocks: number;
    functionsWithDebugInfo: number;
  };
}

/** Flatten the file→position→FunctionDebugInfo[] map into a flat list of functions. */
function allFunctions(debugInfo: BinaryDebugInfo) {
  return Object.values(debugInfo.functionsByFileAndPosition)
    .flatMap(byPosition => Object.values(byPosition))
    .flat();
}

function emptyStats() {
  return {
    totalFunctions: 0,
    totalExpressions: 0,
    expressionsWithLocations: 0,
    totalBasicBlocks: 0,
    functionsWithDebugInfo: 0,
  };
}

/**
 * Sanity-check debug info against the regenerated source map: the two must agree on the set
 * of source files. A file the regeneration dropped (or invented) would break error
 * source-mapping for code in it.
 */
export function sanityCheckDebugInfoAgainstSourceMap(result: AssemblyScriptCompilerResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = emptyStats();

  // The compiler result carries the source map as a parsed object; older builds passed a
  // JSON string, so handle both.
  let sourceMap: any;
  try {
    sourceMap = typeof result.sourceMap === 'string' ? JSON.parse(result.sourceMap) : result.sourceMap;
  } catch (err) {
    errors.push(`Failed to parse source map JSON: ${err}`);
    return { valid: false, errors, warnings, stats };
  }

  if (!sourceMap || !Array.isArray(sourceMap.sources)) {
    errors.push('Source map missing or invalid "sources" field');
    return { valid: false, errors, warnings, stats };
  }
  if (typeof sourceMap.mappings !== 'string') {
    errors.push('Source map missing or invalid "mappings" field');
    return { valid: false, errors, warnings, stats };
  }

  // Source-file set must match in both directions (debug info uses the same relative
  // `~lib`/`test` source names the map does, so a direct set comparison is valid).
  const sourceMapSet = new Set(sourceMap.sources);
  const debugFilesSet = new Set(result.debugInfo.debugSourceFiles);

  for (const file of result.debugInfo.debugSourceFiles) {
    if (!sourceMapSet.has(file)) {
      errors.push(`Debug Info file "${file}" not found in source map`);
    }
  }
  for (const file of sourceMap.sources) {
    if (!debugFilesSet.has(file)) {
      errors.push(`Source map file "${file}" not found in Debug Info`);
    }
  }

  const functions = allFunctions(result.debugInfo);
  stats.totalFunctions = functions.length;
  for (const func of functions) {
    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;
    const located = func.expressions.filter(e => e.location).length;
    stats.expressionsWithLocations += located;
    if (located > 0) {
      stats.functionsWithDebugInfo++;
    }
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}

/**
 * Verify coverage-memory counter indices are allocated cleanly: every instrumented function
 * and every instrumented basic block has a unique index, and the assigned indices densely
 * fill [0, totalInstrumentationCounters). Functions occupy the contiguous low region and
 * blocks follow, so a duplicate, a gap, or an out-of-range index means counter allocation is
 * broken — which would silently mis-attribute or drop hit counts.
 */
export function validateCounterIndexIntegrity(debugInfo: BinaryDebugInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = emptyStats();

  const functions = allFunctions(debugInfo);
  stats.totalFunctions = functions.length;

  const total = debugInfo.totalInstrumentationCounters;
  const seen = new Set<number>();

  const claim = (index: number, owner: string) => {
    if (typeof index !== 'number') {
      errors.push(`${owner} has a non-numeric coverage index: ${index}`);
      return;
    }
    if (index < 0 || index >= total) {
      errors.push(`${owner} coverage index ${index} is out of range [0, ${total})`);
    }
    if (seen.has(index)) {
      errors.push(`Duplicate coverage index ${index} (at ${owner})`);
    }
    seen.add(index);
  };

  for (const func of functions) {
    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;
    claim(func.coverageMemoryIndex, `function "${func.name}"`);
    for (const block of func.basicBlocks) {
      if (block.coverageMemoryIndex !== undefined) {
        claim(block.coverageMemoryIndex, `function "${func.name}" block ${block.index}`);
      }
    }
  }

  // Dense: every slot in [0, total) assigned exactly once (no gaps, no extras).
  if (seen.size !== total) {
    errors.push(
      `Assigned ${seen.size} unique counter indices but totalInstrumentationCounters is ${total} (gaps or extras)`,
    );
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}
