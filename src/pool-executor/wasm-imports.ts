/**
 * WASM Import Object Creators
 *
 * This module provides functions for creating WebAssembly import objects
 * for different execution phases:
 * - Test discovery (registration phase)
 * - Test execution (clean binary)
 * - Coverage collection (instrumented binary)
 */

import { extractCallStack } from './source-maps.js';
import { decodeString, decodeAbortInfo } from './wasm-memory.js';
import { debug } from '../utils/debug.mjs';
import type { DiscoveredTests, TestResult } from '../types.js';
import { ERROR_NAMES } from '../types.js';

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Decode and log abort information
 * Shared helper for abort handlers across different import objects
 *
 * @param memory - WebAssembly memory instance
 * @param msgPtr - Pointer to abort message
 * @param filePtr - Pointer to file name
 * @param line - Line number
 * @param column - Column number
 * @param context - Context string for log message (e.g., "during discovery", "during execution")
 * @returns Decoded abort info
 */
export function logAbort(
  memory: WebAssembly.Memory,
  msgPtr: number,
  filePtr: number,
  line: number,
  column: number,
  context: string
): { message: string; location: string | null } {
  const abortInfo = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
  debug(`[Executor] Abort ${context}: ${abortInfo.message}${abortInfo.location ? ` at ${abortInfo.location}` : ''}`);
  return abortInfo;
}

// ============================================================================
// Import Object Creators
// ============================================================================

/**
 * Create import object for test discovery
 *
 * Used during test discovery phase to register test names and function indices.
 * Minimal imports - only registration callback and stubs.
 *
 * When the binary is instrumented (has coverage memory import), we must provide
 * a stub coverage memory even though we're not collecting coverage during discovery.
 *
 * @param memory - WebAssembly memory instance
 * @param tests - Array to collect registered tests (mutated by __register_test callback)
 * @param coverageMemory - Optional coverage memory (required if binary is instrumented)
 * @returns WebAssembly import object
 */
export function createDiscoveryImports(
  memory: WebAssembly.Memory,
  tests: DiscoveredTests,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),
      __register_test(namePtr: number, nameLen: number, fnIndex: number) {
        const testName = decodeString(memory, namePtr, nameLen);
        const id = `${testName}_${fnIndex}`;
        tests[id] = { name: testName, fnIndex, id };
        debug('[Executor] Registered test:', testName, 'at function index', fnIndex);
      },
      __assertion_pass() {},
      __assertion_fail() {},
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = logAbort(memory, msgPtr, filePtr, line, column, 'during discovery');
        const errorMsg = `AssemblyScript abort during test discovery: ${message}${location ? `\n  at ${location}` : ''}`;
        throw new Error(errorMsg);
      },
      trace(_msg: any, n: any, a0: any, a1: any, a2: any, a3: any) {
        console.log(`WASM trace${n !== undefined ? ` (${String(n)})` : ''}:`, a0, a1, a2, a3);
      }
    },
  };
}

/**
 * Create import object for test execution
 *
 * Used during test execution on clean or instrumented binaries. Captures test results,
 * error information, and assertions. The abort handler throws to halt execution on failure.
 *
 * When coverageMemory is provided (instrumented binary), it will be imported as __coverage_memory
 * for the WASM module to use directly via memory operations (no boundary crossings).
 *
 * @param memory - WebAssembly memory instance
 * @param currentTest - Mutable reference to current test result (updated by imports)
 * @param coverageMemory - Optional coverage memory for instrumented binaries
 * @returns WebAssembly import object
 */
export function createTestExecutionImports(
  memory: WebAssembly.Memory,
  currentTest: { value: TestResult | null },
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // Test registration callback (no-op during execution)
      __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},

      // Assertion tracking
      __assertion_pass() {
        if (currentTest.value) {
          currentTest.value.assertionsPassed++;
        }
      },

      __assertion_fail(msgPtr: number, msgLen: number) {
        if (currentTest.value) {
          currentTest.value.assertionsFailed++;
          const errorMsg = decodeString(memory, msgPtr, msgLen);
          debug('[Executor] Assertion failed:', errorMsg);
        }
      },

      // AS runtime imports
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message } = logAbort(memory, msgPtr, filePtr, line, column, 'during test execution');

        if (currentTest.value) {
          currentTest.value.passed = false;

          // Create error to capture V8 stack trace
          const error = new Error(message);

          // Extract V8 call stack BEFORE throwing
          // This gives us WAT line:column positions that can be mapped to AS source
          currentTest.value.rawCallStack = extractCallStack(error);
          
          // gets replaced when executor enhances error message
          currentTest.value.error = {
            name: ERROR_NAMES.RuntimeError,
            message: message
          };

          debug('[Executor] Captured raw V8 call stack with', currentTest.value.rawCallStack.length, 'frames');
        }

        // CRITICAL: Must throw to halt WASM execution
        // Without throwing after abort is called from an assert() failure, execution would continue
        // Per-test isolation ensures the next test still runs (in a fresh instance).
        throw new Error('AssemblyScript abort');
      },

      trace(_msg: any, n: any, a0: any, a1: any, a2: any, a3: any) {
        console.log(`WASM trace${n !== undefined  ? ` (${String(n)})` : ''}:`, a0, a1, a2, a3);
      }
    },
  };
}
