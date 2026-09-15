import { GENE_BOUNDS, INPUTS, OUTPUTS, type Cell, type Gene, type Genome, type Traits } from './types.js';
import { clamp, Random } from './random.js';

export function founderGenome(rng: Random): Genome {
  // A deliberately viable starting scaffold. Life, cell boundaries and these channels are designed, not discovered.
  const traits: Traits = { uptake: .4, efficiency: .78, repair: .045, division: 13,
    motility: .25, secretion: .08, receptorA: .9, receptorB: -.8,
    sharing: .06, plasticity: .045, lifespan: 1100 };
  for (const key of Object.keys(GENE_BOUNDS) as Gene[]) {
    const [lo, hi] = GENE_BOUNDS[key];
    traits[key] = clamp(traits[key] + rng.signed() * (hi - lo) * .12, lo, hi);
  }
  // Rows: uptake, repair, divide, emit A, emit B, move, share. Columns: INPUTS.
  const weights = [
     1.0,  1.7,  .5, -.3,  .1,  .2,  .2,
    -1.0,   .0,   0, 1.5,  .0, -.5, 2.0,
     1.5, -4.0,  .5,  -1, -.4,  .3, -1.0,
    -1.5, -1.0, 2.5, -.5,  .0,  .0,  .0,
    -2.0,  1.0,  .0, 2.5,  .0,  .0, 1.5,
    -1.0,  2.0,  -1, 1.0,  .4, -.5,  .5,
    -1.5, -3.0,  .0,   0,  .2, -.3,   0
  ];
  return { traits, weights: weights.map(v => v + rng.signed() * .25) };
}

export function mutate(genome: Genome, rng: Random, rate: number, scale: number): { genome: Genome; changes: number } {
  const child: Genome = { traits: { ...genome.traits }, weights: [...genome.weights] };
  let changes = 0;
  for (const key of Object.keys(GENE_BOUNDS) as Gene[]) {
    if (rng.next() < rate) {
      const [lo, hi] = GENE_BOUNDS[key], before = child.traits[key];
      child.traits[key] = clamp(before + rng.signed() * (hi - lo) * scale, lo, hi);
      if (child.traits[key] !== before) changes++;
    }
  }
  child.weights = child.weights.map(w => {
    if (rng.next() >= rate) return w;
    const next = clamp(w + rng.signed() * scale * 4, -6, 6);
    if (next !== w) changes++;
    return next;
  });
  return { genome: child, changes };
}

export function regulate(cell: Cell, food: number, waste: number, a: number, b: number, signals: boolean, plasticity: boolean): number[] {
  const g = cell.genome.traits;
  const stress = clamp(waste / 3 + (1 - cell.integrity) + Math.max(0, 4 - cell.energy) / 4, 0, 3);
  cell.memory += .08 * (stress - cell.memory);
  if (plasticity) {
    // Bounded receptor adaptation, not backpropagation or demonstrated associative learning.
    const targetA = signals ? 1 / (1 + a * .5) : 1;
    const targetB = signals ? 1 / (1 + b * .5) : 1;
    cell.expression[0] += g.plasticity * (targetA - cell.expression[0]);
    cell.expression[1] += g.plasticity * (targetB - cell.expression[1]);
  }
  const inputs = [1, clamp(1 - cell.energy / g.division, -1, 1), Math.tanh(food / 3),
    Math.tanh(waste / 2), signals ? Math.tanh(a) * g.receptorA * cell.expression[0] : 0,
    signals ? Math.tanh(b) * g.receptorB * cell.expression[1] : 0, Math.tanh(cell.memory)];
  const outputs = OUTPUTS.map((_, row) => {
    let value = 0;
    for (let col = 0; col < INPUTS.length; col++) value += inputs[col] * cell.genome.weights[row * INPUTS.length + col];
    return 1 / (1 + Math.exp(-value));
  });
  cell.lastInputs = inputs; cell.lastOutputs = outputs;
  return outputs;
}
