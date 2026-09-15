import { GENE_BOUNDS, MODEL_VERSION, type Config, type ConfigPatch, type Gene, type Snapshot } from './types.js';

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
export function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    throw new Error(`${label} must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}
export const DEFAULT_CONFIG: Config = { width: 72, height: 44, seed: 42, founders: 72,
  supply: .018, mutationRate: .045, mutationScale: .10, signals: true, plasticity: true, sharing: true, season: false };
export function validateConfig(value: unknown): Config {
  const v = object(value, 'config');
  for (const k of Object.keys(v)) if (!Object.hasOwn(DEFAULT_CONFIG, k)) throw new Error(`Unknown config field: ${k}`);
  const width = number(v.width, 'width', 16, 96, true), height = number(v.height, 'height', 12, 64, true);
  return {
    width, height, seed: number(v.seed, 'seed', 0, 4294967295, true),
    founders: number(v.founders, 'founders', 0, Math.min(width * height, 500), true),
    supply: number(v.supply, 'supply', 0, .08), mutationRate: number(v.mutationRate, 'mutationRate', 0, .3),
    mutationScale: number(v.mutationScale, 'mutationScale', 0, .5),
    signals: bool(v.signals, 'signals'), plasticity: bool(v.plasticity, 'plasticity'),
    sharing: bool(v.sharing, 'sharing'), season: bool(v.season, 'season')
  };
}
export function validatePatch(value: unknown, config: Config): ConfigPatch {
  const patch = object(value, 'patch');
  const allowed = ['supply', 'mutationRate', 'mutationScale', 'signals', 'plasticity', 'sharing', 'season'];
  for (const k of Object.keys(patch)) if (!allowed.includes(k)) throw new Error(`Cannot patch ${k}`);
  validateConfig({ ...config, ...patch });
  return patch as ConfigPatch;
}
function vector(value: unknown, length: number, name: string, min = 0, max = 1e9): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${name} must contain ${length} entries`);
  return value.map((x, i) => number(x, `${name}[${i}]`, min, max));
}
export function validateSnapshot(value: unknown): Snapshot {
  const v = object(value, 'snapshot');
  if (v.model !== MODEL_VERSION) throw new Error(`Unsupported model version; expected ${MODEL_VERSION}`);
  const config = validateConfig(v.config), n = config.width * config.height;
  number(v.tick, 'tick', 0, 1e12, true); number(v.nextId, 'nextId', 1, 1e12, true); number(v.rng, 'rng', 1, 4294967295, true);
  const f = object(v.fields, 'fields');
  for (const k of ['food', 'waste', 'a', 'b']) vector(f[k], n, `fields.${k}`);
  const walls = vector(f.walls, n, 'walls', 0, 1);
  if (walls.some(w => w !== 0 && w !== 1)) throw new Error('Walls must be 0 or 1');
  for (let i = 0; i < n; i++) if (walls[i] && ['food', 'waste', 'a', 'b'].some(k => (f[k] as number[])[i] !== 0)) throw new Error('Walls cannot contain fields');
  if (!Array.isArray(v.cells) || v.cells.length > n) throw new Error('Invalid cells array');
  const positions = new Set<number>(), ids = new Set<number>();
  for (const raw of v.cells) {
    const c = object(raw, 'cell'), id = number(c.id, 'cell.id', 1, (v.nextId as number) - 1, true);
    if (ids.has(id)) throw new Error('Duplicate cell id'); ids.add(id);
    const x = number(c.x, 'cell.x', 0, config.width - 1, true), y = number(c.y, 'cell.y', 0, config.height - 1, true), pos = y * config.width + x;
    if (positions.has(pos) || walls[pos]) throw new Error('Cell collision or cell inside wall'); positions.add(pos);
    if (c.parentId !== null) number(c.parentId, 'parentId', 1, id - 1, true);
    number(c.lineage, 'lineage', 1, id, true); number(c.generation, 'generation', 0, 1e12, true);
    number(c.age, 'age', 0, 1e12, true); number(c.energy, 'energy', 0, 100); number(c.integrity, 'integrity', 0, 1);
    number(c.memory, 'memory', 0, 3); number(c.mutations, 'mutations', 0, 60, true);
    vector(c.expression, 2, 'expression', 0, 1); vector(c.lastInputs, 7, 'lastInputs', -3, 3); vector(c.lastOutputs, 7, 'lastOutputs', 0, 1);
    if (typeof c.action !== 'string' || c.action.length > 80) throw new Error('Invalid cell action');
    const g = object(c.genome, 'genome'), traits = object(g.traits, 'traits');
    for (const key of Object.keys(GENE_BOUNDS) as Gene[]) number(traits[key], key, GENE_BOUNDS[key][0], GENE_BOUNDS[key][1]);
    vector(g.weights, 49, 'controller weights', -6, 6);
  }
  const ledger = object(v.ledger, 'ledger'), counters = object(v.counters, 'counters');
  for (const key of ['initial', 'supplied', 'removed', 'dissipated']) number(ledger[key], `ledger.${key}`, 0, 1e15);
  for (const key of ['births', 'deaths', 'mutations', 'transfers']) number(counters[key], `counters.${key}`, 0, 1e12, true);
  if (!Array.isArray(v.history) || v.history.length > 600) throw new Error('Invalid history');
  for (const entry of v.history) {
    const m = object(entry, 'history metric');
    for (const key of ['tick','population','births','deaths','mutations','generation','lineages','traitSpread','meanEnergy','meanIntegrity','meanExpression','signalA','signalB','totalResource','totalEnergy','energyResidual','clusters','largestCluster','transfers'])
      number(m[key], `metric.${key}`, key === 'energyResidual' ? -1e15 : 0, 1e15);
  }
  if (!Array.isArray(v.events) || v.events.length > 100) throw new Error('Invalid events');
  for (const raw of v.events) {
    const e = object(raw, 'event'); number(e.tick, 'event.tick', 0, v.tick as number, true);
    if (typeof e.kind !== 'string' || e.kind.length > 40 || typeof e.message !== 'string' || e.message.length > 300) throw new Error('Invalid event text');
  }
  // Deep-clone ownership, rejecting unknown executable behavior by accepting data only.
  return structuredClone(v) as unknown as Snapshot;
}
