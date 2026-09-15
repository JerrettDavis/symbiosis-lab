export const MODEL_VERSION = 'symbiosis-0.1';
export const INPUTS = ['bias', 'energy deficit', 'food', 'waste', 'channel A', 'channel B', 'stress memory'] as const;
export const OUTPUTS = ['uptake', 'repair', 'divide', 'emit A', 'emit B', 'move', 'share'] as const;
export const GENE_BOUNDS = {
  uptake: [0.12, 0.75], efficiency: [0.48, 0.94], repair: [0.012, 0.09],
  division: [9, 22], motility: [0, 0.8], secretion: [0, 0.24],
  receptorA: [-2, 2], receptorB: [-2, 2], sharing: [0, 0.22],
  plasticity: [0.002, 0.12], lifespan: [450, 1800]
} as const;
export type Gene = keyof typeof GENE_BOUNDS;
export type Traits = Record<Gene, number>;
export interface Genome { traits: Traits; weights: number[]; }
export interface Cell {
  id: number; parentId: number | null; lineage: number; generation: number;
  x: number; y: number; age: number; energy: number; integrity: number;
  genome: Genome; expression: [number, number]; memory: number;
  lastInputs: number[]; lastOutputs: number[]; action: string;
  mutations: number;
}
export interface Config {
  width: number; height: number; seed: number; founders: number;
  supply: number; mutationRate: number; mutationScale: number;
  signals: boolean; plasticity: boolean; sharing: boolean; season: boolean;
}
export type ConfigPatch = Partial<Pick<Config, 'supply' | 'mutationRate' | 'mutationScale' | 'signals' | 'plasticity' | 'sharing' | 'season'>>;
export interface Ledger { initial: number; supplied: number; removed: number; dissipated: number; }
export interface Counters { births: number; deaths: number; mutations: number; transfers: number; }
export interface Metrics {
  tick: number; population: number; births: number; deaths: number; mutations: number;
  generation: number; lineages: number; traitSpread: number; meanEnergy: number;
  meanIntegrity: number; meanExpression: number; signalA: number; signalB: number;
  totalResource: number; totalEnergy: number; energyResidual: number;
  clusters: number; largestCluster: number; transfers: number;
}
export interface LabEvent { tick: number; kind: string; message: string; }
export interface Snapshot {
  model: typeof MODEL_VERSION; config: Config; tick: number; nextId: number; rng: number;
  fields: { food: number[]; waste: number[]; a: number[]; b: number[]; walls: number[] };
  cells: Cell[]; ledger: Ledger; counters: Counters; history: Metrics[]; events: LabEvent[];
}
export interface CellView { id: number; parentId: number | null; lineage: number; generation: number; x: number; y: number; energy: number; integrity: number; age: number; action: string; }
export interface WorldView {
  model: string; config: Config; tick: number; metrics: Metrics; history: Metrics[];
  cells: CellView[]; fields: Snapshot['fields']; events: LabEvent[];
}
export type Brush = 'food' | 'toxin' | 'damage' | 'erase' | 'wall' | 'clear' | 'signalA' | 'signalB';
export const PRESETS: Record<string, { label: string; description: string; patch: ConfigPatch }> = {
  meadow: { label: 'Open meadow', description: 'Patchy, replenished nutrients. A stable starting point, not a guaranteed equilibrium.', patch: { supply: 0.018, season: false, signals: true, plasticity: true, sharing: true } },
  scarcity: { label: 'Resource scarcity', description: 'Lower external input makes acquisition and maintenance tradeoffs visible.', patch: { supply: 0.004, season: false, signals: true, plasticity: true, sharing: true } },
  seasons: { label: 'Seasonal world', description: 'A 900-tick resource cycle changes the local selection pressures.', patch: { supply: 0.018, season: true, signals: true, plasticity: true, sharing: true } }
};
