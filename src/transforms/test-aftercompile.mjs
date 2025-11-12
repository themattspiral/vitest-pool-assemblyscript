/**
 * Test transform to investigate afterCompile hook
 */

import { Transform } from 'assemblyscript/transform';
import binaryen from 'binaryen';

export default class AfterCompileTest extends Transform {
  afterCompile(module) {
    console.log('[AfterCompile Test] afterCompile called!');

    const numFuncs = module.getNumFunctions();
    console.log(`[AfterCompile Test] Found ${numFuncs} functions`);

    // Try binaryen.Function.getName
    console.log('[AfterCompile Test] Testing binaryen.Function.getName:');
    for (let i = 0; i < Math.min(10, numFuncs); i++) {
      const funcRef = module.getFunctionByIndex(i);
      const name = binaryen.Function.getName(funcRef);
      console.log(`[AfterCompile Test]   Function ${i}: name="${name}"`);
    }
  }
}
