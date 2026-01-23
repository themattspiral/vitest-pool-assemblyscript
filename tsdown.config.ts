import { defineConfig } from 'tsdown';

const MINIFY = false;
const SOUCE_MAP = true;

export default defineConfig([{
  entry: [
    // v4
    'src/index.ts',
    'src/config/index.ts',
    'src/pool-thread/compile-worker-thread.ts',
    'src/pool-thread/test-worker-thread.ts',
    
     // v3
    'src/index-v3.ts',
    'src/config/index-v3.ts',
    'src/pool-thread/v3-tinypool-thread.ts',
    
    // shared
    'src/coverage-provider/index.ts',
    'src/compiler/transforms/strip-inline.mts',
    
    // internal testing
    'src/index-internal.ts',
  ],
  format: 'es',
  outDir: './dist',
  target: 'node20',
  platform: 'node',
  dts: true,
  clean: true,

  inputOptions: {
    optimization: {
      inlineConst: true,
      pifeForModuleWrappers: true
    }
  },
  
  sourcemap: SOUCE_MAP,
  minify: MINIFY,
  outputOptions: {
    minifyInternalExports: MINIFY,
    minify: MINIFY,
    sourcemap: SOUCE_MAP,
  },
}]);
