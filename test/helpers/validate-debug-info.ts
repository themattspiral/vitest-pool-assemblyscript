// @ts-nocheck
// TODO - update to work with AST parser

/**
 * Validators for debug info correctness
 *
 * Verifies that extracted debug info actually maps to correct source code locations
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BinaryDebugInfo, CompileResult } from '../../src/types.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');

export interface ValidationOptions {
  /** Allow some expressions to have no debug location (default: true) */
  allowMissingLocations?: boolean;
  /** Minimum percentage of expressions that must have locations (default: 50) */
  minLocationCoverage?: number;
}

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

/**
 * Validate that debug info structure is internally consistent
 */
export function validateDebugInfoStructure(debugInfo: BinaryDebugInfo, options: ValidationOptions = {}): ValidationResult {
  const {
    allowMissingLocations = true,
    minLocationCoverage = 0,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalFunctions: 0,
    totalExpressions: 0,
    expressionsWithLocations: 0,
    totalBasicBlocks: 0,
    functionsWithDebugInfo: 0,
  };
  
  if (typeof debugInfo.functionsByFileAndPosition !== 'object' || debugInfo.functionsByFileAndPosition === null) {
    errors.push('functionsByFileAndPosition must be an object');
    return { valid: false, errors, warnings, stats };
  }

  const functions = Array.from(Object.values(debugInfo.functionsByFileAndPosition))
    .flatMap(fileFunctionsByPosition => Array.from(Object.values(fileFunctionsByPosition)));
  stats.totalFunctions = functions.length;

  if (functions.length === 0) {
    warnings.push('No functions found in debug info');
  }

  // Track function indices for uniqueness and sequential validation
  const seenIndices = new Set<number>();
  const allIndices: number[] = [];

  for (const func of functions) {
     const funcName = func.name;

    // Validate function structure
    if (typeof func.wasmIndex !== 'number') {
      errors.push(`Function "${func.name}" has invalid wasmIndex`);
      continue;
    }

    // Check for duplicate indices
    if (seenIndices.has(func.wasmIndex)) {
      errors.push(`Function "${func.name}" has duplicate index ${func.wasmIndex}`);
    }
    seenIndices.add(func.wasmIndex);
    allIndices.push(func.wasmIndex);

    if (!Array.isArray(func.expressions)) {
      errors.push(`Function "${func.name}" has invalid expressions array`);
      continue;
    }

    if (!Array.isArray(func.basicBlocks)) {
      errors.push(`Function "${func.name}" has invalid basicBlocks array`);
      continue;
    }

    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;

    let funcHasDebugInfo = false;

    // Validate expressions
    for (let i = 0; i < func.expressions.length; i++) {
      const expr = func.expressions[i]!;

      if (typeof expr.type !== 'string' || expr.type.length === 0) {
        errors.push(`Function "${funcName}" expression ${i} has invalid type`);
      }

      if (typeof expr.isBranch !== 'boolean') {
        errors.push(`Function "${funcName}" expression ${i} has invalid isBranch`);
      }

      // Validate branch consistency
      if (expr.isBranch) {
        if (typeof expr.branchPaths !== 'number') {
          errors.push(`Function "${funcName}" expression ${i} (isBranch: true) has invalid branchPaths: ${expr.branchPaths}`);
        } else if (expr.branchPaths === 0) {
          errors.push(`Function "${funcName}" expression ${i} is marked as branch but has 0 paths`);
        }
      } else if (typeof expr.branchPaths === 'number' && expr.branchPaths > 0) {
        errors.push(`Function "${funcName}" expression ${i} is not a branch but has ${expr.branchPaths} paths`);
      }

      // Validate debug location
      if (expr.location) {
        stats.expressionsWithLocations++;
        funcHasDebugInfo = true;

        const loc = expr.location;
        if (typeof loc.filePath !== 'string' || loc.filePath === '') {
          errors.push(`Function "${funcName}" expression ${i} has invalid filePath: ${loc.filePath}`);
        }

        if (typeof loc.line !== 'number' || loc.line <= 0) {
          errors.push(`Function "${funcName}" expression ${i} has invalid line ${loc.line} (must be >= 1)`);
        }

        if (typeof loc.column !== 'number' || loc.column < 0) {
          errors.push(`Function "${funcName}" expression ${i} has invalid column ${loc.column} (must be >= 0)`);
        }
      }
    }

    if (funcHasDebugInfo) {
      stats.functionsWithDebugInfo++;
    }

    // Validate basic blocks
    for (let i = 0; i < func.basicBlocks.length; i++) {
      const block = func.basicBlocks[i]!;

      if (typeof block.index !== 'number' || block.index !== i) {
        errors.push(`Function "${funcName}" basic block ${i} has incorrect index ${block.index}`);
      }

      if (!Array.isArray(block.expressionIndices)) {
        errors.push(`Function "${funcName}" basic block ${i} has invalid expressionIndices`);
        continue;
      }

      if (!Array.isArray(block.branches)) {
        errors.push(`Function "${funcName}" basic block ${i} has invalid branches`);
        continue;
      }

      // Validate expression indices are in range and in order
      for (const exprIdx of block.expressionIndices) {
        if (typeof exprIdx !== 'number' || exprIdx < 0 || exprIdx >= func.expressions.length) {
          errors.push(`Function "${funcName}" basic block ${i} has expression index ${exprIdx} out of range (total function expressions: ${func.expressions.length})`);
        }
      }

      // Validate branch targets
      for (const branch of block.branches) {
        if (typeof branch.targetBlockIndex !== 'number' || branch.targetBlockIndex < 0 || branch.targetBlockIndex >= func.basicBlocks.length) {
          errors.push(`Function "${funcName}" basic block ${i} has branch to invalid target block index: ${branch.targetBlockIndex}`);
        }
      }
    }
  }

  // Validate functionsByFileAndPosition structure and consistency with functionsByName
  const positionKeyRegex = /^\d+:\d+$/;
  const functionsInPositionMap = new Set<string>();

  for (const [filePath, positionMap] of Object.entries(debugInfo.functionsByFileAndPosition)) {
    // Validate file path key
    if (typeof filePath !== 'string' || filePath.length === 0) {
      errors.push(`functionsByFileAndPosition has invalid file path key: ${filePath}`);
      continue;
    }

    if (typeof positionMap !== 'object' || positionMap === null) {
      errors.push(`functionsByFileAndPosition["${filePath}"] is not an object`);
      continue;
    }

    for (const [positionKey, func] of Object.entries(positionMap)) {
      // Validate position key format (line:column)
      if (!positionKeyRegex.test(positionKey)) {
        errors.push(`functionsByFileAndPosition["${filePath}"] has invalid position key: "${positionKey}" (expected "line:column" format)`);
        continue;
      }

      // Validate function has representativeLocation
      if (!func.representativeLocation) {
        errors.push(`Function "${func.name}" in functionsByFileAndPosition["${filePath}"]["${positionKey}"] has no representativeLocation`);
        continue;
      }

      // Validate position key matches representativeLocation
      const expectedKey = `${func.representativeLocation.line}:${func.representativeLocation.column}`;
      if (positionKey !== expectedKey) {
        errors.push(
          `Function "${func.name}" position key "${positionKey}" does not match representativeLocation "${expectedKey}"`
        );
      }

      // Validate representativeLocation filePath matches the file key
      if (func.representativeLocation.filePath !== filePath) {
        errors.push(
          `Function "${func.name}" representativeLocation.filePath "${func.representativeLocation.filePath}" does not match file key "${filePath}"`
        );
      }

      // Track function for cross-reference check
      functionsInPositionMap.add(func.name);
    }
  }

  // Check location coverage
  const locationCoverage = stats.totalExpressions > 0
    ? (stats.expressionsWithLocations / stats.totalExpressions) * 100
    : 0;

  if (!allowMissingLocations && stats.expressionsWithLocations < stats.totalExpressions) {
    errors.push(`Not all expressions have debug locations (${stats.expressionsWithLocations}/${stats.totalExpressions})`);
  } else if (locationCoverage < minLocationCoverage) {
    warnings.push(`Low debug location coverage: ${locationCoverage.toFixed(1)}% (minimum: ${minLocationCoverage}%)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Parse and validate source map against debug info
 *
 * This is a sanity check to ensure our debug info is consistent with the source map.
 * We can't fully validate correctness (that's why Binaryen exists), but we can check:
 * - Source files list matches
 * - File indices are valid
 * - Basic source map structure is correct
 */
export function sanityCheckDebugInfoAgainstSourceMap(result: CompileResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalFunctions: 0,
    totalExpressions: 0,
    expressionsWithLocations: 0,
    totalBasicBlocks: 0,
    functionsWithDebugInfo: 0,
  };

  // Parse source map
  let sourceMap: any;
  try {
    sourceMap = JSON.parse(result.sourceMap);
  } catch (err) {
    errors.push(`Failed to parse source map JSON: ${err}`);
    return { valid: false, errors, warnings, stats };
  }

  // Validate source map has required fields
  if (!sourceMap.sources || !Array.isArray(sourceMap.sources)) {
    errors.push('Source map missing or invalid "sources" field');
    return { valid: false, errors, warnings, stats };
  }

  if (typeof sourceMap.mappings !== 'string') {
    errors.push('Source map missing or invalid "mappings" field');
    return { valid: false, errors, warnings, stats };
  }

  // Compare source file entries
  const sourceMapFiles = sourceMap.sources;
  const debugFiles = result.debugInfo.debugSourceFiles;

  // Check if source files are consistent (order might differ)
  const sourceMapSet = new Set(sourceMapFiles);
  const debugFilesSet = new Set(debugFiles);

  for (const file of debugFiles) {
    if (!sourceMapSet.has(file)) {
      errors.push(`Debug Info file "${file}" not found in source map`);
    }
  }

  for (const file of sourceMapFiles) {
    if (!debugFilesSet.has(file)) {
      errors.push(`Source map file "${file}" not found in Debug Info`);
    }
  }

  // Validate that all debug locations reference valid file indices
  const functions = Array.from(Object.values(result.debugInfo.functionsByFileAndPosition))
    .flatMap(fileFunctionsByPosition => Array.from(Object.values(fileFunctionsByPosition)));
  stats.totalFunctions = functions.length;

  for (const func of functions) {
    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;

    let funcHasDebugInfo = false;

    for (let i = 0; i < func.expressions.length; i++) {
      const expr = func.expressions[i]!;

      if (!expr.location) {
        continue;
      }

      stats.expressionsWithLocations++;
      funcHasDebugInfo = true;

      const { filePath } = expr.location;

      // Validate the file exists in source map
      if (!sourceMapSet.has(filePath)) {
        errors.push(`Function "${func.name}" expression ${i} references file "${filePath}" not in source map`);
      }
    }

    if (funcHasDebugInfo) {
      stats.functionsWithDebugInfo++;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Parse TypeScript source to find function boundaries
 *
 * Returns a map of function names to their start/end line ranges
 * Handles both regular functions and arrow functions
 */
function parseFunctionBoundaries(sourceCode: string): Map<string, { start: number; end: number }> {
  const boundaries = new Map<string, { start: number; end: number }>();
  const lines = sourceCode.split('\n');

  // Regex to match: function NAME( or export function NAME(
  const funcRegex = /^\s*(?:export\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;

  // Regex to match: const NAME = (...) => or export const NAME = (...) =>
  const arrowFuncRegex = /^\s*(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*:\s*[^=]+\s*=>\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const funcMatch = line.match(funcRegex);
    const arrowMatch = line.match(arrowFuncRegex);
    const match = funcMatch || arrowMatch;

    if (match) {
      const funcName = match[1]!;
      const startLine = i + 1; // Convert to 1-based

      // Find the closing brace by tracking brace depth
      let braceDepth = 0;
      let foundOpenBrace = false;
      let endLine = startLine;

      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j]!;

        // Count braces
        for (const char of currentLine) {
          if (char === '{') {
            braceDepth++;
            foundOpenBrace = true;
          } else if (char === '}') {
            braceDepth--;
            if (foundOpenBrace && braceDepth === 0) {
              endLine = j + 1; // Convert to 1-based
              boundaries.set(funcName, { start: startLine, end: endLine });
              break;
            }
          }
        }

        if (foundOpenBrace && braceDepth === 0) {
          break;
        }
      }
    }
  }

  return boundaries;
}

/**
 * Check if a line contains actual code (not just comments or whitespace)
 */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  // Empty line
  if (trimmed.length === 0) return false;
  // Single-line comment
  if (trimmed.startsWith('//')) return false;
  // Multi-line comment start (not perfect, but good enough)
  if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
  return true;
}

/**
 * Extract source function name from WASM function name
 *
 * WASM names like "test-fixtures/assembly/math/add" -> "add"
 * Skip anonymous functions like "~anonymous|N"
 * Skip entry functions like "start:test-fixtures/assembly/math.as.test\"
 */
function extractSourceFunctionName(wasmFuncName: string): string | null {
  // Skip anonymous functions
  if (wasmFuncName.includes('~anonymous')) {
    return null;
  }
  
  // Skip entry functions
  if (wasmFuncName.startsWith('start:')) {
    return null;
  }

  // Extract last part after /
  const parts = wasmFuncName.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Validate that all functions with debug locations map to correct source code lines.
 *
 * This parses source files to find function boundaries and verifies that
 * expressions in WASM functions map to lines within the corresponding source functions
 */
export function validateDebugInfoFunctionSourceLocations(debugInfo: BinaryDebugInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalFunctions: 0,
    totalExpressions: 0,
    expressionsWithLocations: 0,
    totalBasicBlocks: 0,
    functionsWithDebugInfo: 0,
  };

  // Load source files and parse function boundaries
  const sourceFiles = new Map<string, string[]>();
  const functionBoundaries = new Map<string, Map<string, { start: number; end: number }>>();
  const debugFiles = debugInfo.debugSourceFiles;

  for (const filePath of debugFiles) {
    // skip AS standard lib files
    if (filePath.startsWith('~lib')) {
      continue;
    }

    try {
      const absPath = resolve(PROJECT_ROOT, filePath);
      const content = readFileSync(absPath, 'utf-8');
      const lines = content.split('\n');
      sourceFiles.set(filePath, lines);

      // Parse function boundaries for this file
      const boundaries = parseFunctionBoundaries(content);
      functionBoundaries.set(filePath, boundaries);
    } catch (err) {
        errors.push(`Could not read source file for validation: ${filePath}`);
    }
  }

  const functions = Array.from(Object.values(debugInfo.functionsByFileAndPosition))
    .flatMap(fileFunctionsByPosition => Array.from(Object.values(fileFunctionsByPosition)));
  stats.totalFunctions = functions.length;

  for (const func of functions) {
    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;

    // Extract source function name from WASM function name
    const sourceFuncName = extractSourceFunctionName(func.name);
    if (!sourceFuncName) {
      // Skip anonymous functions
      continue;
    }

    // Only validate functions with debug info
    if (!func.hasDebugInfo) {
      continue;
    }

    // Validate representativeLocation if present
    if (func.representativeLocation) {
      const repLoc = func.representativeLocation;
      const repSourceLines = sourceFiles.get(repLoc.filePath);

      if (repSourceLines) {
        // Basic range check
        if (repLoc.line < 1 || repLoc.line > repSourceLines.length) {
          errors.push(
            `Function "${func.name}" representativeLocation line ${repLoc.line} out of range (file has ${repSourceLines.length} lines)`
          );
        } else {
          // Get function boundaries and validate representativeLocation is within
          const repBoundaries = functionBoundaries.get(repLoc.filePath);
          if (repBoundaries) {
            const repFuncBoundary = repBoundaries.get(sourceFuncName);
            if (repFuncBoundary) {
              if (repLoc.line < repFuncBoundary.start || repLoc.line > repFuncBoundary.end) {
                errors.push(
                  `Function "${func.name}" representativeLocation at line ${repLoc.line} is outside source function "${sourceFuncName}" bounds (${repFuncBoundary.start}-${repFuncBoundary.end})`
                );
              }
            }
          }

          // Validate column
          const repSourceLine = repSourceLines[repLoc.line - 1]!;
          if (repLoc.column < 0 || repLoc.column > repSourceLine.length) {
            errors.push(
              `Function "${func.name}" representativeLocation column ${repLoc.column} out of range (line ${repLoc.line} has ${repSourceLine.length} chars)`
            );
          }
        }
      }

      // Verify function is in functionsByFileAndPosition at correct key
      const positionMap = debugInfo.functionsByFileAndPosition[repLoc.filePath];
      const posKey = `${repLoc.line}:${repLoc.column}`;
      if (!positionMap) {
        errors.push(
          `Function "${func.name}" has representativeLocation in "${repLoc.filePath}" but file not in functionsByFileAndPosition`
        );
      } else if (!positionMap[posKey]) {
        errors.push(
          `Function "${func.name}" has representativeLocation "${posKey}" but not found at that position in functionsByFileAndPosition`
        );
      } else if (positionMap[posKey] !== func) {
        errors.push(
          `Function "${func.name}" at position "${posKey}" in functionsByFileAndPosition is different object than in functionsByName`
        );
      }
    }

    let funcHasDebugInfo = false;

    for (let i = 0; i < func.expressions.length; i++) {
      const expr = func.expressions[i]!;

      if (!expr.location) {
        continue;
      }

      stats.expressionsWithLocations++;
      funcHasDebugInfo = true;

      const { filePath, line, column } = expr.location;

      // Check if source file was loaded
      const sourceLines = sourceFiles.get(filePath);
      if (!sourceLines) {
        // Already warned above
        continue;
      }

      // Basic range check
      if (line < 1 || line > sourceLines.length) {
        errors.push(`Function "${func.name}" expression ${i} has line ${line} out of range (file has ${sourceLines.length} lines)`);
        continue;
      }

      // Get function boundaries for this file
      const boundariesForFile = functionBoundaries.get(filePath);
      if (!boundariesForFile) {
        // No boundaries parsed for this file
        continue;
      }

      // Check if this source function exists
      const funcBoundary = boundariesForFile.get(sourceFuncName);
      if (!funcBoundary) {
        // Function not found in source - unexpected data included in debug info
        warnings.push(`Unexpected WASM function "${func.name}" - Expected source name: "${sourceFuncName}" not found in source file "${filePath}"`);
        continue;
      }

      // Verify expression location is within the source function boundaries
      if (line < funcBoundary.start || line > funcBoundary.end) {
        errors.push(
          `WASM function "${func.name}" expression ${i} at line ${line} is outside source function "${sourceFuncName}" bounds (${funcBoundary.start}-${funcBoundary.end})`
        );
      }

      // Check if line contains actual code
      const sourceLine = sourceLines[line - 1]!; // Convert to 0-based
      if (!isCodeLine(sourceLine)) {
        errors.push(
          `WASM function "${func.name}" expression ${i} at line ${line} points to non-code (comment/whitespace)`
        );
      }

      // Validate column (0-based)
      if (column < 0 || column > sourceLine.length) {
        errors.push(
          `WASM function "${func.name}" expression ${i} has column ${column} out of range (line ${line} has ${sourceLine.length} chars)`
        );
      }
    }

    if (funcHasDebugInfo) {
      stats.functionsWithDebugInfo++;
    }
  }

  // Confirm each source function is present in the debug info
  for (const [filePath, boundaries] of functionBoundaries.entries()) {
    for (const [sourceFuncName, boundary] of boundaries.entries()) {
      // skip functions starting with "unused" as these are intentionally
      // not called (and get tree-shaken by the AS compiler)
      if (sourceFuncName.startsWith('unused')) {
        continue;
      }

      // Try to find this source function in debug info
      let matchingWasmFunc: string | null = null;
      const expectedWasmName = filePath.replace(/\.ts$/, '') + '/' + sourceFuncName;

      // Look for WASM function
      if (debugFunctionNames.includes(expectedWasmName)) {
        matchingWasmFunc = expectedWasmName;
      }

      if (!matchingWasmFunc) {
        errors.push(
          `Source function "${sourceFuncName}" in "${filePath}" (lines ${boundary.start}-${boundary.end}) not found in debug info (expected WASM name: "${expectedWasmName}")`
        );
        continue;
      }

      // Verify the matched function has expressions within the source boundaries
      const func = debugInfo.functionsByName[matchingWasmFunc]!;
      if (func.hasDebugInfo && func.expressions.length > 0) {
        let hasAnyValidLocation = false;
        let allLocationsValid = true;
        
        for (let i = 0; i < func.expressions.length; i++) {
          const expr = func.expressions[i]!;
          if (!expr.location) {
            continue;
          }

          const { filePath: exprFilePath, line } = expr.location;

          // Check if expression is in the correct file and within boundaries
          if (exprFilePath === filePath && line >= boundary.start && line <= boundary.end) {
            hasAnyValidLocation = true;
          } else {
            allLocationsValid = false;
          }
        }

        if (!hasAnyValidLocation) {
          errors.push(
            `Source function "${sourceFuncName}" in "${filePath}" (lines ${boundary.start}-${boundary.end}) found as "${matchingWasmFunc}" but has no debug locations within source boundaries`
          );
        }
        
        if (!allLocationsValid) {
          errors.push(
            `Source function "${sourceFuncName}" in "${filePath}" (lines ${boundary.start}-${boundary.end}) found as "${matchingWasmFunc}" but some expression debug locations are outside source boundaries`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Validate that two DebugInfo objects are equivalent
 *
 * Used to verify that source map regeneration produces the same debug info
 */
export function compareDebugInfo(original: BinaryDebugInfo, regenerated: BinaryDebugInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalFunctions: 0,
    totalExpressions: 0,
    expressionsWithLocations: 0,
    totalBasicBlocks: 0,
    functionsWithDebugInfo: 0,
  };

  // Compare debug files
  const originalFiles = Object.keys(original.functionsByFileAndPosition);
  const regeneratedFiles = Object.keys(regenerated.functionsByFileAndPosition);
  if (originalFiles.length !== regeneratedFiles.length) {
    errors.push(`Debug files count mismatch: ${originalFiles.length} vs ${regeneratedFiles.length}`);
  } else {
    for (let i = 0; i < originalFiles.length; i++) {
      if (originalFiles[i] !== regeneratedFiles[i]) {
        warnings.push(`Debug file ${i} differs: "${originalFiles[i]}" vs "${regeneratedFiles[i]}"`);
      }
    }
  }

  // Compare functions
  const originalFuncs = Object.keys(original.functionsByName).sort();
  const regeneratedFuncs = Object.keys(regenerated.functionsByName).sort();

  if (originalFuncs.length !== regeneratedFuncs.length) {
    errors.push(`Function count mismatch: ${originalFuncs.length} vs ${regeneratedFuncs.length}`);
  }

  stats.totalFunctions = originalFuncs.length;

  for (const funcName of originalFuncs) {
    if (!regenerated.functionsByName[funcName]) {
      errors.push(`Function "${funcName}" missing in regenerated debug info`);
      continue;
    }

    const origFunc = original.functionsByName[funcName]!;
    const regenFunc = regenerated.functionsByName[funcName];

    // Compare function index
    if (origFunc.wasmIndex !== regenFunc.wasmIndex) {
      errors.push(`Function "${funcName}" index mismatch: ${origFunc.wasmIndex} vs ${regenFunc.wasmIndex}`);
    }

    // Compare expressions count
    if (origFunc.expressions.length !== regenFunc.expressions.length) {
      errors.push(`Function "${funcName}" expression count mismatch: ${origFunc.expressions.length} vs ${regenFunc.expressions.length}`);
      continue; // Can't compare individual expressions if counts differ
    }

    stats.totalExpressions += origFunc.expressions.length;

    // Compare each expression
    for (let i = 0; i < origFunc.expressions.length; i++) {
      const origExpr = origFunc.expressions[i]!;
      const regenExpr = regenFunc.expressions[i]!;

      if (origExpr.type !== regenExpr.type) {
        errors.push(`Function "${funcName}" expression ${i} type mismatch: "${origExpr.type}" vs "${regenExpr.type}"`);
      }

      if (origExpr.isBranch !== regenExpr.isBranch) {
        errors.push(`Function "${funcName}" expression ${i} isBranch mismatch: ${origExpr.isBranch} vs ${regenExpr.isBranch}`);
      }

      if (origExpr.branchPaths !== regenExpr.branchPaths) {
        errors.push(`Function "${funcName}" expression ${i} branchPaths mismatch: ${origExpr.branchPaths} vs ${regenExpr.branchPaths}`);
      }

      // Compare debug locations
      const origLoc = origExpr.location;
      const regenLoc = regenExpr.location;

      if (origLoc && regenLoc) {
        stats.expressionsWithLocations++;

        if (origLoc.filePath !== regenLoc.filePath ||
            origLoc.line !== regenLoc.line ||
            origLoc.column !== regenLoc.column) {
          errors.push(`Function "${funcName}" expression ${i} location mismatch: ` +
            `[${origLoc.filePath}:${origLoc.line}:${origLoc.column}] vs ` +
            `[${regenLoc.filePath}:${regenLoc.line}:${regenLoc.column}]`);
        }
      } else if (origLoc && !regenLoc) {
        warnings.push(`Function "${funcName}" expression ${i} lost debug location in regeneration`);
      } else if (!origLoc && regenLoc) {
        warnings.push(`Function "${funcName}" expression ${i} gained debug location in regeneration`);
      }
    }

    // Compare basic blocks count
    if (origFunc.basicBlocks.length !== regenFunc.basicBlocks.length) {
      errors.push(`Function "${funcName}" basic block count mismatch: ${origFunc.basicBlocks.length} vs ${regenFunc.basicBlocks.length}`);
      continue;
    }

    stats.totalBasicBlocks += origFunc.basicBlocks.length;

    // Compare each basic block
    for (let i = 0; i < origFunc.basicBlocks.length || 0; i++) {
      const origBlock = origFunc.basicBlocks[i]!;
      const regenBlock = regenFunc.basicBlocks[i]!;

      if (origBlock.expressionIndices.length !== regenBlock.expressionIndices.length) {
        errors.push(`Function "${funcName}" block ${i} expression indices count mismatch`);
      } else {
        for (let j = 0; j < origBlock.expressionIndices.length; j++) {
          if (origBlock.expressionIndices[j] !== regenBlock.expressionIndices[j]) {
            errors.push(`Function "${funcName}" block ${i} expression index ${j} mismatch`);
          }
        }
      }

      if (origBlock.branches.length !== regenBlock.branches.length) {
        errors.push(`Function "${funcName}" block ${i} branch count mismatch`);
      } else {
        for (let j = 0; j < origBlock.branches.length; j++) {
          if (origBlock.branches[j]?.targetBlockIndex !== regenBlock.branches[j]?.targetBlockIndex) {
            errors.push(`Function "${funcName}" block ${i} branch ${j} target mismatch`);
          }
        }
      }
    }

    if (origFunc.expressions?.some(e => e.location)) {
      stats.functionsWithDebugInfo++;
    }
  }

  // Check for extra functions in regenerated
  for (const funcName of regeneratedFuncs) {
    if (!original.functionsByName[funcName]) {
      errors.push(`Function "${funcName}" unexpectedly present in regenerated debug info`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}
