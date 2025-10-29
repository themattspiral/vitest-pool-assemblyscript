import type { CachedCompilation } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Interface for managing compilation cache lifecycle
 *
 * Handles storage, invalidation, and validation of compiled WASM binaries
 * with generation-based tracking to prevent stale cache entries.
 */
export interface CompilationCache {
  /**
   * Get cached compilation for a test file
   */
  get(testFile: string): CachedCompilation | undefined;

  /**
   * Set cached compilation for a test file
   */
  set(testFile: string, cached: CachedCompilation): void;

  /**
   * Invalidate cache entries for specified files and bump generation numbers
   */
  invalidate(files: string[]): void;

  /**
   * Validate and cache compilation result
   * Returns true if cached, false if rejected (stale generation)
   */
  validateAndCache(testFile: string, result: CachedCompilation): boolean;

  /**
   * Clear all cache entries
   */
  clear(): void;

  /**
   * Get current generation number for a file
   */
  getCurrentGeneration(testFile: string): number;
}

/**
 * Create a compilation cache instance
 *
 * Uses factory pattern with closure to encapsulate cache state.
 * Generation numbers prevent stale compilations from late-returning workers
 * from populating the cache after a file has been invalidated.
 *
 * @returns CompilationCache instance
 */
export function createCompilationCache(): CompilationCache {
  // Cache state in closure
  const compilationCache = new Map<string, CachedCompilation>();
  const cacheGeneration = new Map<string, number>();

  return {
    get(testFile: string): CachedCompilation | undefined {
      return compilationCache.get(testFile);
    },

    set(testFile: string, cached: CachedCompilation): void {
      compilationCache.set(testFile, cached);
      debug('[Pool] Cached compilation for', testFile, 'at generation:', cached.generation);
    },

    invalidate(files: string[]): void {
      for (const file of files) {
        // Clear cache for invalidated file
        if (compilationCache.has(file)) {
          compilationCache.delete(file);
          debug('[Pool] Cleared cache for:', file);
        }

        // Bump generation number to invalidate in-flight worker compilations
        const currentGen = cacheGeneration.get(file) ?? 0;
        cacheGeneration.set(file, currentGen + 1);
        debug('[Pool] Bumped generation for', file, 'to:', currentGen + 1);
      }
    },

    validateAndCache(testFile: string, compileResult: CachedCompilation): boolean {
      // Get current generation for this file
      const currentGen = cacheGeneration.get(testFile) ?? 0;

      // Validate generation matches
      if (compileResult.generation !== currentGen) {
        debug('[Pool] Rejecting stale compilation for', testFile,
              '- result generation:', compileResult.generation,
              'current generation:', currentGen);
        return false;
      }

      // Generation matches - safe to cache
      this.set(testFile, compileResult);
      return true;
    },

    clear(): void {
      compilationCache.clear();
    },

    getCurrentGeneration(testFile: string): number {
      return cacheGeneration.get(testFile) ?? 0;
    },
  };
}
