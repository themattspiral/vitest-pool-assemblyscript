import { readFile } from 'fs/promises';

const binary = await readFile('tests/coverage.as.test.wasm');
const module = await WebAssembly.compile(binary);
console.log('Module imports:');
console.log(WebAssembly.Module.imports(module));
