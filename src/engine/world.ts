import { clamp, Random } from './random.js';
import { founderGenome, mutate, regulate } from './controller.js';
import { DEFAULT_CONFIG, number, validateConfig, validatePatch, validateSnapshot } from './validation.js';
import { GENE_BOUNDS, MODEL_VERSION, type Brush, type Cell, type Config, type ConfigPatch, type Counters, type Gene, type LabEvent, type Ledger, type Metrics, type Snapshot, type WorldView } from './types.js';

export const BIOMASS = 2;
const MAX_FOOD = 10;

/** Scalar diffusion with reflecting boundaries and impermeable walls. d <= .25 for the four-neighbor stencil. */
export function diffuse(field: Float64Array, walls: Uint8Array, width: number, height: number, d: number, decay: number): Float64Array {
  const out = new Float64Array(field.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; if (walls[i]) continue;
    const v = field[i]; let flux = 0;
    if (x > 0 && !walls[i - 1]) flux += field[i - 1] - v;
    if (x + 1 < width && !walls[i + 1]) flux += field[i + 1] - v;
    if (y > 0 && !walls[i - width]) flux += field[i - width] - v;
    if (y + 1 < height && !walls[i + width]) flux += field[i + width] - v;
    out[i] = (v + d * flux) * (1 - decay);
  }
  return out;
}

export class World {
  config: Config; rng: Random; tick = 0; nextId = 1;
  food: Float64Array; waste: Float64Array; a: Float64Array; b: Float64Array; walls: Uint8Array;
  cells = new Map<number, Cell>(); occupancy: Float64Array;
  ledger: Ledger = { initial: 0, supplied: 0, removed: 0, dissipated: 0 };
  counters: Counters = { births: 0, deaths: 0, mutations: 0, transfers: 0 };
  history: Metrics[] = []; events: LabEvent[] = [];
  private fertility: Float64Array;

  constructor(config: Partial<Config> = {}, initialize = true) {
    this.config = validateConfig({ ...DEFAULT_CONFIG, ...config }); this.rng = new Random(this.config.seed);
    const n = this.config.width * this.config.height;
    this.food = new Float64Array(n); this.waste = new Float64Array(n); this.a = new Float64Array(n); this.b = new Float64Array(n);
    this.walls = new Uint8Array(n); this.occupancy = new Float64Array(n); this.fertility = new Float64Array(n);
    for (let y = 0; y < this.config.height; y++) for (let x = 0; x < this.config.width; x++) {
      const i = y * this.config.width + x;
      this.fertility[i] = .18 + .82 * Math.pow((Math.sin(x * .15 + this.config.seed * .1) * Math.cos(y * .19) + 1) / 2, 2);
      if (initialize) this.food[i] = .3 + this.fertility[i] * 3 + this.rng.next() * .2;
    }
    if (!initialize) return;
    const places = this.rng.shuffle(Array.from({ length: n }, (_, i) => i));
    for (let k = 0; k < this.config.founders; k++) {
      const p = places[k], id = this.nextId++;
      const cell: Cell = { id, parentId: null, lineage: id, generation: 0,
        x: p % this.config.width, y: Math.floor(p / this.config.width), age: 0,
        energy: 7 + this.rng.next() * 3, integrity: 1, genome: founderGenome(this.rng),
        expression: [1, 1], memory: 0, lastInputs: Array(7).fill(0), lastOutputs: Array(7).fill(0), action: 'seeded', mutations: 0 };
      this.cells.set(id, cell); this.occupancy[p] = id;
    }
    this.ledger.initial = this.totalEnergy();
    this.event('seed', `${this.cells.size} hand-designed founder cells; seed ${this.config.seed}.`);
    this.record();
  }

  static fromSnapshot(value: unknown): World {
    const s = validateSnapshot(value), world = new World(s.config, false);
    world.tick = s.tick; world.nextId = s.nextId; world.rng.state = s.rng;
    for (const k of ['food', 'waste', 'a', 'b'] as const) world[k] = Float64Array.from(s.fields[k]);
    world.walls = Uint8Array.from(s.fields.walls);
    world.cells = new Map(s.cells.map(c => [c.id, c]));
    for (const cell of world.cells.values()) world.occupancy[world.index(cell.x, cell.y)] = cell.id;
    world.ledger = s.ledger; world.counters = s.counters; world.history = s.history; world.events = s.events;
    return world;
  }
  index(x: number, y: number): number { return y * this.config.width + x; }
  neighbors(i: number): number[] {
    const w = this.config.width, x = i % w, y = Math.floor(i / w), out: number[] = [];
    if (x > 0 && !this.walls[i - 1]) out.push(i - 1);
    if (x + 1 < w && !this.walls[i + 1]) out.push(i + 1);
    if (y > 0 && !this.walls[i - w]) out.push(i - w);
    if (y + 1 < this.config.height && !this.walls[i + w]) out.push(i + w);
    return out;
  }
  event(kind: string, message: string): void { this.events.push({ tick: this.tick, kind, message }); if (this.events.length > 100) this.events.shift(); }
  patch(patch: ConfigPatch): void { this.config = { ...this.config, ...validatePatch(patch, this.config) }; this.event('config', JSON.stringify(patch)); }
  private spend(cell: Cell, amount: number): number {
    const actual = Math.min(cell.energy, Math.max(0, amount)); cell.energy -= actual; this.ledger.dissipated += actual; return actual;
  }
  private die(cell: Cell): void {
    const p = this.index(cell.x, cell.y), stored = cell.energy + BIOMASS, recycled = stored * .6;
    this.food[p] += recycled; this.ledger.dissipated += stored - recycled;
    this.waste[p] += .2; this.cells.delete(cell.id); this.occupancy[p] = 0; this.counters.deaths++;
  }
  private chooseSpace(cell: Cell, spaces: number[]): number {
    const g = cell.genome.traits;
    let best = spaces[0], bestScore = -Infinity;
    for (const p of spaces) {
      const signal = this.config.signals ? g.receptorA * cell.expression[0] * this.a[p] + g.receptorB * cell.expression[1] * this.b[p] : 0;
      const score = this.food[p] - this.waste[p] * 2 + signal + this.rng.signed() * .3;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  private stepOnce(): void {
    const { width, height, supply, season } = this.config; this.tick++;
    this.food = diffuse(this.food, this.walls, width, height, .045, 0);
    this.waste = diffuse(this.waste, this.walls, width, height, .09, .012);
    this.a = diffuse(this.a, this.walls, width, height, .18, .045);
    this.b = diffuse(this.b, this.walls, width, height, .13, .035);
    const seasonFactor = season ? .55 + .45 * Math.sin(2 * Math.PI * this.tick / 900) : 1;
    for (let p = 0; p < this.food.length; p++) if (!this.walls[p]) {
      const added = Math.min(Math.max(0, MAX_FOOD - this.food[p]), supply * seasonFactor * this.fertility[p]);
      this.food[p] += added; this.ledger.supplied += added;
    }
    // Sensing reads the current diffused chemical fields. New emissions arrive next tick.
    const emitA = new Float64Array(this.a.length), emitB = new Float64Array(this.b.length);
    const order = this.rng.shuffle([...this.cells.values()]);
    for (const cell of order) {
      if (!this.cells.has(cell.id)) continue;
      const g = cell.genome.traits; cell.age++; cell.action = 'maintain';
      let p = this.index(cell.x, cell.y);
      const out = regulate(cell, this.food[p], this.waste[p], this.a[p], this.b[p], this.config.signals, this.config.plasticity);
      const uptake = Math.min(this.food[p], g.uptake * (.2 + .8 * out[0]), Math.max(0, 32 - cell.energy) / g.efficiency);
      this.food[p] -= uptake; cell.energy += uptake * g.efficiency;
      this.ledger.dissipated += uptake * (1 - g.efficiency); this.waste[p] += uptake * .10;
      const maintenance = .026 + g.uptake * .042 + g.motility * .018 + g.secretion * .03;
      const paid = this.spend(cell, maintenance);
      cell.integrity -= .0007 + this.waste[p] * .005 + (paid < maintenance ? .05 : 0);
      if (cell.integrity <= 0 || cell.age >= g.lifespan || cell.energy <= 0) { this.die(cell); continue; }
      const repair = Math.min(1 - cell.integrity, g.repair * out[1]);
      if (repair > .0001) { cell.integrity += this.spend(cell, repair * 3) / 3; cell.action = 'repair'; }
      if (this.config.signals && cell.energy > .4) {
        const a = g.secretion * out[3], b = g.secretion * out[4];
        const cost = (a + b) * .3, paidSignal = this.spend(cell, cost), ratio = cost > 0 ? paidSignal / cost : 0;
        emitA[p] += a * ratio; emitB[p] += b * ratio;
      }
      if (this.config.sharing && cell.energy > 8 && out[6] > .04) {
        const partners = this.neighbors(p).map(i => this.cells.get(this.occupancy[i])).filter((x): x is Cell => !!x && x.energy < cell.energy - 2);
        if (partners.length) {
          const partner = partners.reduce((a, b) => a.energy < b.energy ? a : b);
          const gift = Math.min(g.sharing * out[6], (cell.energy - partner.energy) / 2);
          if (gift > .0001) { cell.energy -= gift; partner.energy += gift * .95; this.ledger.dissipated += gift * .05; this.counters.transfers++; }
        }
      }
      let spaces = this.neighbors(p).filter(i => this.occupancy[i] === 0);
      if (spaces.length && cell.energy > .5 && this.rng.next() < g.motility * out[5]) {
        const target = this.chooseSpace(cell, spaces); this.occupancy[p] = 0; this.occupancy[target] = cell.id;
        cell.x = target % width; cell.y = Math.floor(target / width); p = target; this.spend(cell, .045); cell.action = 'move';
        spaces = this.neighbors(p).filter(i => this.occupancy[i] === 0);
      }
      if (spaces.length && cell.energy >= g.division && cell.integrity > .65 && this.rng.next() < out[2] * .18) {
        const target = this.chooseSpace(cell, spaces), change = mutate(cell.genome, this.rng, this.config.mutationRate, this.config.mutationScale);
        // A new cell costs BIOMASS energy units plus one dissipated unit. Remaining energy is split.
        this.spend(cell, 1); cell.energy -= BIOMASS; cell.energy /= 2;
        const child: Cell = { id: this.nextId++, parentId: cell.id, lineage: cell.lineage, generation: cell.generation + 1,
          x: target % width, y: Math.floor(target / width), age: 0, energy: cell.energy, integrity: 1,
          genome: change.genome, expression: [1, 1], memory: 0, lastInputs: Array(7).fill(0), lastOutputs: Array(7).fill(0),
          action: 'born', mutations: change.changes };
        this.cells.set(child.id, child); this.occupancy[target] = child.id;
        this.counters.births++; this.counters.mutations += change.changes; cell.action = 'divide';
      }
      if (cell.energy <= 0) this.die(cell);
    }
    for (let p = 0; p < this.a.length; p++) { this.a[p] += emitA[p]; this.b[p] += emitB[p]; }
    if (this.tick % 10 === 0) this.record();
    if (this.cells.size === 0 && !this.events.some(e => e.kind === 'extinction')) this.event('extinction', 'Population extinct. No automatic reseeding occurs.');
  }
  step(ticks = 1): void { number(ticks, 'ticks', 1, 10000000, true); for (let i = 0; i < ticks; i++) this.stepOnce(); }

  brush(tool: Brush, x: number, y: number, radius: number): void {
    number(x, 'x', 0, this.config.width - 1, true); number(y, 'y', 0, this.config.height - 1, true); number(radius, 'radius', 1, 10, true);
    if (!['food','toxin','damage','erase','wall','clear','signalA','signalB'].includes(tool)) throw new Error('Unknown brush');
    for (let yy = Math.max(0, y-radius); yy <= Math.min(this.config.height-1, y+radius); yy++) for (let xx = Math.max(0, x-radius); xx <= Math.min(this.config.width-1, x+radius); xx++) {
      const d = Math.hypot(xx-x, yy-y); if (d > radius) continue;
      const p = this.index(xx, yy), amount = 1 - d / (radius + 1), cell = this.cells.get(this.occupancy[p]);
      if (tool === 'wall') {
        if (cell) { this.ledger.removed += cell.energy + BIOMASS; this.cells.delete(cell.id); this.occupancy[p] = 0; this.counters.deaths++; }
        this.ledger.removed += this.food[p]; this.food[p] = this.a[p] = this.b[p] = this.waste[p] = 0; this.walls[p] = 1;
      } else if (tool === 'clear') { this.walls[p] = 0; }
      else if (!this.walls[p]) {
        if (tool === 'food') { const add = Math.min(5 * amount, Math.max(0, MAX_FOOD-this.food[p])); this.food[p] += add; this.ledger.supplied += add; }
        if (tool === 'toxin') this.waste[p] += 3 * amount;
        if (tool === 'signalA') this.a[p] += 3 * amount;
        if (tool === 'signalB') this.b[p] += 3 * amount;
        if (tool === 'damage' && cell) { cell.integrity = Math.max(0, cell.integrity - .7 * amount); if (cell.integrity <= 0) this.die(cell); }
        if (tool === 'erase' && cell) this.die(cell);
      }
    }
    this.event('intervention', `${tool} at (${x}, ${y}), radius ${radius}.`);
  }
  totalEnergy(): number {
    let total = 0; for (const n of this.food) total += n;
    for (const c of this.cells.values()) total += c.energy + BIOMASS;
    return total;
  }
  metrics(): Metrics {
    const cells = [...this.cells.values()], count = cells.length, denominator = Math.max(1, count);
    let food = 0, a = 0, b = 0, energy = 0, health = 0, expression = 0, generation = 0;
    for (let i = 0; i < this.food.length; i++) { food += this.food[i]; a += this.a[i]; b += this.b[i]; }
    for (const c of cells) { energy += c.energy; health += c.integrity; expression += (c.expression[0]+c.expression[1])/2; generation = Math.max(generation,c.generation); }
    let variance = 0;
    for (const key of Object.keys(GENE_BOUNDS) as Gene[]) {
      const [lo, hi] = GENE_BOUNDS[key], vals = cells.map(c => (c.genome.traits[key] - lo)/(hi-lo));
      const mean = vals.reduce((s,v) => s+v,0)/denominator;
      variance += vals.reduce((s,v) => s+(v-mean)**2,0)/denominator;
    }
    const visited = new Set<number>(); let clusters = 0, largestCluster = 0;
    for (const c of cells) {
      const start = this.index(c.x,c.y); if (visited.has(start)) continue;
      clusters++; const stack = [start]; visited.add(start); let size = 0;
      while (stack.length) { const p = stack.pop()!; size++; for (const neighbor of this.neighbors(p)) if (this.occupancy[neighbor] && !visited.has(neighbor)) { visited.add(neighbor); stack.push(neighbor); } }
      largestCluster = Math.max(largestCluster,size);
    }
    const totalEnergy = food + energy + count * BIOMASS;
    return { tick: this.tick, population: count, ...this.counters, generation,
      lineages: new Set(cells.map(c=>c.lineage)).size, traitSpread: Math.sqrt(variance/Object.keys(GENE_BOUNDS).length),
      meanEnergy: energy/denominator, meanIntegrity: health/denominator, meanExpression: expression/denominator,
      signalA:a/this.a.length,signalB:b/this.b.length,totalResource:food,totalEnergy,
      energyResidual:this.ledger.initial+this.ledger.supplied-this.ledger.removed-this.ledger.dissipated-totalEnergy,
      clusters,largestCluster };
  }
  private record(): void { this.history.push(this.metrics()); if (this.history.length > 600) this.history.shift(); }
  snapshot(): Snapshot {
    return structuredClone({ model: MODEL_VERSION, config: this.config, tick: this.tick, nextId: this.nextId, rng: this.rng.state,
      fields: { food: Array.from(this.food), waste: Array.from(this.waste), a: Array.from(this.a), b: Array.from(this.b), walls: Array.from(this.walls) },
      cells: [...this.cells.values()], ledger: this.ledger, counters: this.counters, history: this.history, events: this.events });
  }
  view(): WorldView {
    const rounded = (f: Float64Array) => Array.from(f, n=>Math.round(n*1000)/1000);
    return { model: MODEL_VERSION, config: { ...this.config }, tick: this.tick, metrics:this.metrics(), history:this.history,
      fields:{food:rounded(this.food),waste:rounded(this.waste),a:rounded(this.a),b:rounded(this.b),walls:Array.from(this.walls)},
      cells:[...this.cells.values()].map(c=>({id:c.id,parentId:c.parentId,lineage:c.lineage,generation:c.generation,x:c.x,y:c.y,energy:c.energy,integrity:c.integrity,age:c.age,action:c.action})),
      events:this.events };
  }
}
