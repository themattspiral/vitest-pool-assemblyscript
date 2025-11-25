

import { describe, it, expect, beforeAll } from 'vitest';
import { extractDebugInfo } from '../../src/native/debug.js';
import { compileFixture, compileInvalidFixture, type CompileResult } from '../helpers/compile-fixture.js';
import { resolve } from 'path';

const SMOKE_FIXTURE = '../../test-examples/assembly-src/math.ts';

describe('extractDebugInfo', () => {
  it('should extract debug info from valid WASM with source map', async () => {
    const result = await compileFixture(resolve(import.meta.dirname, SMOKE_FIXTURE));
    expect(result.success).toBe(true);
    expect(result.sourceMap).toBeDefined();

    const debugInfo = extractDebugInfo(result.binary, result.sourceMap!);

    expect(debugInfo).toBeDefined();
    expect(debugInfo.debugFiles).toBeDefined();
    expect(Array.isArray(debugInfo.debugFiles)).toBe(true);
    expect(debugInfo.debugFiles.length).toBeGreaterThan(0);

    expect(debugInfo.functions).toBeDefined();
    expect(typeof debugInfo.functions).toBe('object');

    const functionNames = Object.keys(debugInfo.functions);
    expect(functionNames.length).toBeGreaterThan(0);
  });

  describe('error handling', () => {
    let validResult: CompileResult;

    beforeAll(async () => {
      validResult = await compileFixture(resolve(import.meta.dirname, SMOKE_FIXTURE));
      expect(validResult.success).toBe(true);
      expect(validResult.sourceMap).toBeDefined();
    });

    describe('invalid inputs should throw errors', () => {
      it('should throw TypeError for invalid wasmBuffer type', () => {
        try {
          extractDebugInfo('not a buffer' as any, Buffer.from('{}'));
          expect.fail('Should have thrown TypeError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(TypeError);
          expect(error.message).toBe('wasmBuffer must be a Buffer');
        }
      });

      it('should throw TypeError for invalid sourceMapBuffer type', () => {
        try {
          extractDebugInfo(validResult.binary, 'not a buffer' as any);
          expect.fail('Should have thrown TypeError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(TypeError);
          expect(error.message).toBe('sourceMapBuffer must be a Buffer');
        }
      });

      it('should throw Error for invalid WASM binary', async () => {
        const truncatedResult = await compileInvalidFixture(
          resolve(import.meta.dirname, SMOKE_FIXTURE),
          'truncate-wasm'
        );

        try {
          extractDebugInfo(truncatedResult.binary, truncatedResult.sourceMap!);
          expect.fail('Should have thrown Error');
        } catch (error: any) {
          expect(error).toBeInstanceOf(Error);
          expect(error).not.toBeInstanceOf(TypeError);
          expect(error.message).toContain('Failed to extract debug info');
        }
      });

      it('should throw Error for empty WASM binary', async () => {
        const emptyResult = await compileInvalidFixture(
          resolve(import.meta.dirname, SMOKE_FIXTURE),
          'empty-wasm'
        );

        try {
          extractDebugInfo(emptyResult.binary, emptyResult.sourceMap!);
          expect.fail('Should have thrown Error');
        } catch (error: any) {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Failed to extract debug info');
        }
      });

      it('should throw Error for corrupted source map', async () => {
        const corruptResult = await compileInvalidFixture(
          resolve(import.meta.dirname, SMOKE_FIXTURE),
          'corrupt-sourcemap'
        );

        try {
          extractDebugInfo(corruptResult.binary, corruptResult.sourceMap!);
          expect.fail('Should have thrown Error');
        } catch (error: any) {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Failed to extract debug info');
        }
      });
    });

    describe('graceful degradation', () => {
      it('should handle WASM compiled without debug flag gracefully', async () => {
        const missingDebugResult = await compileInvalidFixture(
          resolve(import.meta.dirname, SMOKE_FIXTURE),
          'no-debug'
        );

        // Should not throw, but debug info might be limited
        const debugInfo = extractDebugInfo(missingDebugResult.binary, missingDebugResult.sourceMap!);

        expect(debugInfo).toBeDefined();
        expect(debugInfo.functions).toBeDefined();

        // Functions should exist but may have no debug locations
        const functionNames = Object.keys(debugInfo.functions);
        if (functionNames.length > 0) {
          const firstFunc = debugInfo.functions[functionNames[0]];
          // Expressions exist but might not have locations
          expect(Array.isArray(firstFunc.expressions)).toBe(true);
        }
      });
    });
  });
});
