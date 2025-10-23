import Tinypool from 'tinypool';
import { writeFileSync } from 'fs';

// Create a trivial worker
writeFileSync('trivial-worker.mjs', `
export function trivialTask() {
  return 42;
}
`);

const pool = new Tinypool({
  filename: new URL('./trivial-worker.mjs', import.meta.url).href,
  minThreads: 4,
  maxThreads: 4,
});

async function benchmark() {
  console.log('Warming up...');
  for (let i = 0; i < 10; i++) {
    await pool.run({}, { name: 'trivialTask' });
  }

  console.log('\nBenchmarking 100 trivial tasks...');
  const start = performance.now();

  const tasks = [];
  for (let i = 0; i < 100; i++) {
    tasks.push(pool.run({}, { name: 'trivialTask' }));
  }

  await Promise.all(tasks);
  const end = performance.now();

  const totalTime = end - start;
  const avgPerTask = totalTime / 100;

  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average per task: ${avgPerTask.toFixed(3)}ms`);
  console.log(`Overhead estimate: ~${avgPerTask.toFixed(3)}ms per task`);

  await pool.destroy();
}

benchmark().catch(console.error);
