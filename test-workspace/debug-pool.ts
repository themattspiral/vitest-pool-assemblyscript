import type { ProcessPool, Vitest, TestSpecification } from 'vitest/node';
import { writeFileSync } from 'fs';

export default function(ctx: Vitest): ProcessPool {
  const log: string[] = [];

  log.push('\n=== POOL CREATION ===');
  log.push(`ctx.config.coverage?.enabled: ${ctx.config.coverage?.enabled}`);
  log.push(`ctx.config.name: ${ctx.config.name}`);

  return {
    name: 'debug-pool',

    async runTests(specs: TestSpecification[]) {
      log.push('\n=== RUNTEST CALLED ===');
      log.push(`Number of specs: ${specs.length}`);

      specs.forEach((spec, i) => {
        log.push(`\nSpec ${i}:`);
        log.push(`  file: ${spec.moduleId}`);
        log.push(`  project.name: ${spec.project.name}`);
        log.push(`  project.config.name: ${spec.project.config.name}`);
        log.push(`  project.config.coverage?.enabled: ${spec.project.config.coverage?.enabled}`);
      });

      log.push('\n=== ctx.config vs spec.project.config ===');
      if (specs.length > 0) {
        log.push(`ctx.config === spec[0].project.config? ${ctx.config === specs[0].project.config}`);
        log.push(`ctx.config === spec[0].project.globalConfig? ${ctx.config === specs[0].project.globalConfig}`);
      }

      writeFileSync('/home/matt/code/vitest-pool-assemblyscript/test-workspace/debug-output.txt', log.join('\n'));
    },

    async close() {},
  };
}
