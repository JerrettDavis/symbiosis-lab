import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { World } from '../engine/world.js';
import { number } from '../engine/validation.js';
import { MODEL_VERSION, type ConfigPatch } from '../engine/types.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k,...v] = a.replace(/^--/,'').split('='); return [k,v.join('=')]; }));
for (const k of Object.keys(args)) if (!['seeds','ticks','out'].includes(k)) throw new Error(`Unknown argument --${k}`);
const seeds = (args.seeds ?? '1,2,3').split(',').map(x=>number(Number(x),'seed',0,4294967295,true));
const ticks = number(Number(args.ticks ?? 2000),'ticks',1,1000000,true);
if (seeds.length > 50) throw new Error('At most 50 seeds per batch');
const out = resolve(args.out ?? 'data/experiments'); mkdirSync(out,{recursive:true});
const variants: Record<string, ConfigPatch> = {
  baseline: {}, 'signals-off': {signals:false}, 'plasticity-off':{plasticity:false}, 'mutation-off':{mutationRate:0}
};
const results: Record<string, unknown>[] = [];
for (const seed of seeds) {
  const initial = new World({seed}).snapshot();
  for (const [variant, patch] of Object.entries(variants)) {
    const world = World.fromSnapshot(initial); if (Object.keys(patch).length) world.patch(patch);
    world.step(ticks); const metrics = world.metrics();
    const checksum = createHash('sha256').update(JSON.stringify(world.snapshot())).digest('hex');
    results.push({seed,variant,...metrics,checksum});
    writeFileSync(resolve(out,`seed-${seed}-${variant}.json`),JSON.stringify({model:MODEL_VERSION,seed,variant,ticks,patch,checksum,metrics,history:world.history},null,2));
    console.log(`${variant.padEnd(16)} seed=${seed} tick=${ticks} population=${metrics.population} births=${metrics.births} mutations=${metrics.mutations} residual=${metrics.energyResidual.toExponential(2)}`);
  }
}
writeFileSync(resolve(out,'results.json'),JSON.stringify({model:MODEL_VERSION,ticks,seeds,results},null,2));
const keys=Object.keys(results[0]);
writeFileSync(resolve(out,'results.csv'),keys.join(',')+'\n'+results.map(row=>keys.map(k=>row[k]).join(',')).join('\n')+'\n');
console.log(`Saved ${results.length} matched-initial-state runs to ${out}. These are descriptive ablations, not proof of open-ended evolution or cooperation.`);
