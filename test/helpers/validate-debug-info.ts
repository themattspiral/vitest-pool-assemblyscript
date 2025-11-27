/**
 * Validators for debug info correctness
 *
 * Verifies that extracted debug info actually maps to correct source code locations
 */

import { readFileSync } from 'fs';
import type { DebugInfo } from '../../src/native/addon-types';

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
export function validateDebugInfoStructure(debugInfo: DebugInfo, options: ValidationOptions = {}): ValidationResult {
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

  // Validate debug files array
  if (!Array.isArray(debugInfo.debugFiles)) {
    errors.push('debugFiles must be an array');
  } else if (debugInfo.debugFiles.length === 0) {
    warnings.push('No debug files found - binary may not have debug info');
  }

  // Validate functions object
  if (typeof debugInfo.functions !== 'object' || debugInfo.functions === null) {
    errors.push('functions must be an object');
    return { valid: false, errors, warnings, stats };
  }

  const functionNames = Object.keys(debugInfo.functions);
  stats.totalFunctions = functionNames.length;

  if (functionNames.length === 0) {
    warnings.push('No functions found in debug info');
  }

  // Track function indices for uniqueness and sequential validation
  const seenIndices = new Set<number>();
  const allIndices: number[] = [];

  for (const funcName of functionNames) {
    const func = debugInfo.functions[funcName];

    // Validate function structure
    if (typeof func.index !== 'number') {
      errors.push(`Function "${funcName}" has invalid index`);
      continue;
    }

    // Validate hasDebugInfo field
    if (typeof func.hasDebugInfo !== 'boolean') {
      errors.push(`Function "${funcName}" has invalid hasDebugInfo field`);
    }

    // Validate signature field
    if (typeof func.signature !== 'object' || func.signature === null) {
      errors.push(`Function "${funcName}" has invalid signature field`);
    } else {
      if (!Array.isArray(func.signature.params)) {
        errors.push(`Function "${funcName}" signature has invalid params array`);
      } else {
        // Validate each param type is a string
        for (let i = 0; i < func.signature.params.length; i++) {
          if (typeof func.signature.params[i] !== 'string') {
            errors.push(`Function "${funcName}" signature param ${i} is not a string`);
          }
        }
      }
      if (!Array.isArray(func.signature.results)) {
        errors.push(`Function "${funcName}" signature has invalid results array`);
      } else {
        // Validate each result type is a string
        for (let i = 0; i < func.signature.results.length; i++) {
          if (typeof func.signature.results[i] !== 'string') {
            errors.push(`Function "${funcName}" signature result ${i} is not a string`);
          }
        }
      }
    }

    // Validate optional globalName field
    if ('globalName' in func) {
      if (typeof func.globalName !== 'string') {
        errors.push(`Function "${funcName}" has invalid globalName (expected string, got ${typeof func.globalName})`);
      } else if (func.globalName.length === 0) {
        errors.push(`Function "${funcName}" has empty globalName`);
      }
    }

    // Check for duplicate indices
    if (seenIndices.has(func.index)) {
      errors.push(`Function "${funcName}" has duplicate index ${func.index}`);
    }
    seenIndices.add(func.index);
    allIndices.push(func.index);

    if (!Array.isArray(func.expressions)) {
      errors.push(`Function "${funcName}" has invalid expressions array`);
      continue;
    }

    if (!Array.isArray(func.basicBlocks)) {
      errors.push(`Function "${funcName}" has invalid basicBlocks array`);
      continue;
    }

    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;

    let funcHasDebugInfo = false;

    // Validate expressions
    for (let i = 0; i < func.expressions.length; i++) {
      const expr = func.expressions[i];

      if (typeof expr.type !== 'string' || expr.type.length === 0) {
        errors.push(`Function "${funcName}" expression ${i} has invalid type`);
      }

      if (typeof expr.isBranch !== 'boolean') {
        errors.push(`Function "${funcName}" expression ${i} has invalid isBranch`);
      }

      if (typeof expr.branchPaths !== 'number') {
        errors.push(`Function "${funcName}" expression ${i} has invalid branchPaths`);
      }

      // Validate branch consistency
      if (expr.isBranch && expr.branchPaths === 0) {
        errors.push(`Function "${funcName}" expression ${i} is marked as branch but has 0 paths`);
      }

      if (!expr.isBranch && expr.branchPaths !== 0) {
        errors.push(`Function "${funcName}" expression ${i} is not a branch but has ${expr.branchPaths} paths`);
      }

      // Validate debug location
      if (expr.location) {
        stats.expressionsWithLocations++;
        funcHasDebugInfo = true;

        const loc = expr.location;
        if (typeof loc.fileIndex !== 'number' || loc.fileIndex < 0) {
          errors.push(`Function "${funcName}" expression ${i} has invalid fileIndex`);
        }

        if (loc.fileIndex >= debugInfo.debugFiles.length) {
          errors.push(`Function "${funcName}" expression ${i} fileIndex ${loc.fileIndex} out of range (max ${debugInfo.debugFiles.length - 1})`);
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
      const block = func.basicBlocks[i];

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
          errors.push(`Function "${funcName}" basic block ${i} has expression index ${exprIdx} out of range`);
        }
      }

      // Validate branch targets
      for (const branch of block.branches) {
        if (typeof branch.toBlock !== 'number' || branch.toBlock < 0 || branch.toBlock >= func.basicBlocks.length) {
          errors.push(`Function "${funcName}" basic block ${i} has branch to invalid block ${branch.toBlock}`);
        }
      }
    }
  }

  // Validate function indices are sequential (0, 1, 2, ...)
  if (allIndices.length > 0) {
    const sortedIndices = [...allIndices].sort((a, b) => a - b);
    for (let i = 0; i < sortedIndices.length; i++) {
      if (sortedIndices[i] !== i) {
        errors.push(`Function indices are not sequential: expected ${i} but found ${sortedIndices[i]}`);
        break;
      }
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
export function sanityCheckDebugInfoAgainstSourceMap(debugInfo: DebugInfo, sourceMapJson: string): ValidationResult {
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
    sourceMap = JSON.parse(sourceMapJson);
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
  const debugFiles = debugInfo.debugFiles;

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
  const debugFunctionNames = Object.keys(debugInfo.functions);
  stats.totalFunctions = debugFunctionNames.length;

  for (const debugFuncName of debugFunctionNames) {
    const debugFunc = debugInfo.functions[debugFuncName];
    stats.totalExpressions += debugFunc.expressions.length;
    stats.totalBasicBlocks += debugFunc.basicBlocks.length;

    let funcHasDebugInfo = false;

    for (let i = 0; i < debugFunc.expressions.length; i++) {
      const expr = debugFunc.expressions[i];

      if (!expr.location) {
        continue;
      }

      stats.expressionsWithLocations++;
      funcHasDebugInfo = true;

      const { fileIndex, line, column } = expr.location;

      // Validate file index is within range
      if (fileIndex < 0 || fileIndex >= debugFiles.length) {
        errors.push(`Function "${debugFuncName}" expression ${i} has fileIndex ${fileIndex} out of range (max ${debugFiles.length - 1})`);
        continue;
      }

      // Validate the file exists in source map
      const fileName = debugFiles[fileIndex];
      if (!sourceMapSet.has(fileName)) {
        errors.push(`Function "${debugFuncName}" expression ${i} references file "${fileName}" not in source map`);
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
    const line = lines[i];
    const funcMatch = line.match(funcRegex);
    const arrowMatch = line.match(arrowFuncRegex);
    const match = funcMatch || arrowMatch;

    if (match) {
      const funcName = match[1];
      const startLine = i + 1; // Convert to 1-based

      // Find the closing brace by tracking brace depth
      let braceDepth = 0;
      let foundOpenBrace = false;
      let endLine = startLine;

      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j];

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
  return parts[parts.length - 1];
}

/**
 * Validate that all functions with debug locations map to correct source code lines.
 *
 * This parses source files to find function boundaries and verifies that
 * expressions in WASM functions map to lines within the corresponding source functions
 */
export function validateDebugInfoFunctionSourceLocations(debugInfo: DebugInfo): ValidationResult {
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
  const sourceFiles = new Map<number, string[]>();
  const functionBoundaries = new Map<number, Map<string, { start: number; end: number }>>();

  for (let i = 0; i < debugInfo.debugFiles.length; i++) {
    const filePath = debugInfo.debugFiles[i];

    // skip AS standard lib files
    if (filePath.startsWith('~lib')) {
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      sourceFiles.set(i, lines);

      // Parse function boundaries for this file
      const boundaries = parseFunctionBoundaries(content);
      functionBoundaries.set(i, boundaries);
    } catch (err) {
        errors.push(`Could not read source file for validation: ${filePath}`);
    }
  }

  const functionNames = Object.keys(debugInfo.functions);
  stats.totalFunctions = functionNames.length;

  for (const wasmFuncName of functionNames) {
    const func = debugInfo.functions[wasmFuncName];
    stats.totalExpressions += func.expressions.length;
    stats.totalBasicBlocks += func.basicBlocks.length;

    // Extract source function name from WASM function name
    const sourceFuncName = extractSourceFunctionName(wasmFuncName);
    if (!sourceFuncName) {
      // Skip anonymous functions
      continue;
    }

    // Only validate functions with debug info
    if (!func.hasDebugInfo) {
      continue;
    }
    
    let funcHasDebugInfo = false;

    for (let i = 0; i < func.expressions.length; i++) {
      const expr = func.expressions[i];

      if (!expr.location) {
        continue;
      }

      stats.expressionsWithLocations++;
      funcHasDebugInfo = true;

      const { fileIndex, line, column } = expr.location;

      // Check if source file was loaded
      const sourceLines = sourceFiles.get(fileIndex);
      if (!sourceLines) {
        // Already warned above
        continue;
      }

      // Basic range check
      if (line < 1 || line > sourceLines.length) {
        errors.push(`Function "${wasmFuncName}" expression ${i} has line ${line} out of range (file has ${sourceLines.length} lines)`);
        continue;
      }

      // Get function boundaries for this file
      const boundariesForFile = functionBoundaries.get(fileIndex);
      if (!boundariesForFile) {
        // No boundaries parsed for this file
        continue;
      }

      // Check if this source function exists
      const funcBoundary = boundariesForFile.get(sourceFuncName);
      if (!funcBoundary) {
        // Function not found in source - unexpected data included in debug info
        warnings.push(`Unexpected WASM function "${wasmFuncName}" - Expected source name: "${sourceFuncName}" not found in source file "${debugInfo.debugFiles[fileIndex]}" (index: ${fileIndex})`);
        continue;
      }

      // Verify expression location is within the source function boundaries
      if (line < funcBoundary.start || line > funcBoundary.end) {
        errors.push(
          `WASM function "${wasmFuncName}" expression ${i} at line ${line} is outside source function "${sourceFuncName}" bounds (${funcBoundary.start}-${funcBoundary.end})`
        );
      }

      // Check if line contains actual code
      const sourceLine = sourceLines[line - 1]; // Convert to 0-based
      if (!isCodeLine(sourceLine)) {
        errors.push(
          `WASM function "${wasmFuncName}" expression ${i} at line ${line} points to non-code (comment/whitespace)`
        );
      }

      // Validate column (0-based)
      if (column < 0 || column > sourceLine.length) {
        errors.push(
          `WASM function "${wasmFuncName}" expression ${i} has column ${column} out of range (line ${line} has ${sourceLine.length} chars)`
        );
      }
    }

    if (funcHasDebugInfo) {
      stats.functionsWithDebugInfo++;
    }
  }

  // Verify all source functions exist in debug info
  // Build efficient lookup maps first
  const globalNameToWasm = new Map<string, string>();
  for (const wasmFuncName of functionNames) {
    const func = debugInfo.functions[wasmFuncName];
    if (func.globalName) {
      globalNameToWasm.set(func.globalName, wasmFuncName);
    }
  }

  // Confirm each source function is present in the debug info
  for (const [fileIndex, boundaries] of functionBoundaries.entries()) {
    const filePath = debugInfo.debugFiles[fileIndex];

    for (const [sourceFuncName, boundary] of boundaries.entries()) {
      // skip functions starting with "unused" as these are intentionally
      // not called (and get tree-shaken by the AS compiler)
      if (sourceFuncName.startsWith('unused')) {
        continue;
      }

      // Try to find this source function in debug info
      let matchingWasmFunc: string | null = null;

      // Check 1: Look for WASM function with full path ending in this function name
      const expectedWasmName = filePath.replace(/\.ts$/, '') + '/' + sourceFuncName;
      if (functionNames.includes(expectedWasmName)) {
        matchingWasmFunc = expectedWasmName;
      }

      // Check 2: Look in globalName map
      if (!matchingWasmFunc && globalNameToWasm.has(expectedWasmName)) {
        matchingWasmFunc = globalNameToWasm.get(expectedWasmName)!;
      }

      if (!matchingWasmFunc) {
        errors.push(
          `Source function "${sourceFuncName}" in "${filePath}" (lines ${boundary.start}-${boundary.end}) not found in debug info (expected WASM name or globalName: "${expectedWasmName}")`
        );
        continue;
      }

      // Verify the matched function has expressions within the source boundaries
      const func = debugInfo.functions[matchingWasmFunc];
      if (func.hasDebugInfo && func.expressions.length > 0) {
        let hasValidLocation = false;

        for (let i = 0; i < func.expressions.length; i++) {
          const expr = func.expressions[i];
          if (!expr.location) continue;

          const { fileIndex: exprFileIndex, line } = expr.location;

          // Check if expression is in the correct file and within boundaries
          if (exprFileIndex === fileIndex && line >= boundary.start && line <= boundary.end) {
            hasValidLocation = true;
            break;
          }
        }

        if (!hasValidLocation) {
          warnings.push(
            `Source function "${sourceFuncName}" in "${filePath}" (lines ${boundary.start}-${boundary.end}) found as "${matchingWasmFunc}" but has no debug locations within source boundaries`
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
export function compareDebugInfo(original: DebugInfo, regenerated: DebugInfo): ValidationResult {
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
  if (original.debugFiles.length !== regenerated.debugFiles.length) {
    errors.push(`Debug files count mismatch: ${original.debugFiles.length} vs ${regenerated.debugFiles.length}`);
  } else {
    for (let i = 0; i < original.debugFiles.length; i++) {
      if (original.debugFiles[i] !== regenerated.debugFiles[i]) {
        warnings.push(`Debug file ${i} differs: "${original.debugFiles[i]}" vs "${regenerated.debugFiles[i]}"`);
      }
    }
  }

  // Compare functions
  const originalFuncs = Object.keys(original.functions).sort();
  const regeneratedFuncs = Object.keys(regenerated.functions).sort();

  if (originalFuncs.length !== regeneratedFuncs.length) {
    errors.push(`Function count mismatch: ${originalFuncs.length} vs ${regeneratedFuncs.length}`);
  }

  stats.totalFunctions = originalFuncs.length;

  for (const funcName of originalFuncs) {
    if (!regenerated.functions[funcName]) {
      errors.push(`Function "${funcName}" missing in regenerated debug info`);
      continue;
    }

    const origFunc = original.functions[funcName];
    const regenFunc = regenerated.functions[funcName];

    // Compare function index
    if (origFunc.index !== regenFunc.index) {
      errors.push(`Function "${funcName}" index mismatch: ${origFunc.index} vs ${regenFunc.index}`);
    }

    // Compare expressions count
    if (origFunc.expressions.length !== regenFunc.expressions.length) {
      errors.push(`Function "${funcName}" expression count mismatch: ${origFunc.expressions.length} vs ${regenFunc.expressions.length}`);
      continue; // Can't compare individual expressions if counts differ
    }

    stats.totalExpressions += origFunc.expressions.length;

    // Compare each expression
    for (let i = 0; i < origFunc.expressions.length; i++) {
      const origExpr = origFunc.expressions[i];
      const regenExpr = regenFunc.expressions[i];

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

        if (origLoc.fileIndex !== regenLoc.fileIndex ||
            origLoc.line !== regenLoc.line ||
            origLoc.column !== regenLoc.column) {
          errors.push(`Function "${funcName}" expression ${i} location mismatch: ` +
            `[${origLoc.fileIndex}:${origLoc.line}:${origLoc.column}] vs ` +
            `[${regenLoc.fileIndex}:${regenLoc.line}:${regenLoc.column}]`);
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
    for (let i = 0; i < origFunc.basicBlocks.length; i++) {
      const origBlock = origFunc.basicBlocks[i];
      const regenBlock = regenFunc.basicBlocks[i];

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
          if (origBlock.branches[j].toBlock !== regenBlock.branches[j].toBlock) {
            errors.push(`Function "${funcName}" block ${i} branch ${j} target mismatch`);
          }
        }
      }
    }

    if (origFunc.expressions.some(e => e.location)) {
      stats.functionsWithDebugInfo++;
    }
  }

  // Check for extra functions in regenerated
  for (const funcName of regeneratedFuncs) {
    if (!original.functions[funcName]) {
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
