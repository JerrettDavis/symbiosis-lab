import { World } from '../engine/world.js';
import { PRESETS, type Brush, type Snapshot } from '../engine/types.js';
import { number, object, validatePatch } from '../engine/validation.js';

export interface CheckpointStore {
  read(): Promise<unknown>;
  write(snapshot: Snapshot): Promise<void>;
}

/** The same deterministic engine as the server, owned by one browser tab's worker. */
export class BrowserLab {
  private world = new World();
  private running = true;
  private tps = 30;
  private accumulator = 0;
  private actualTps = 0;
  private count = 0;
  private measured = 0;
  private revision = 0;
  private savedRevision = 0;
  private lastSavedTick: number | null = null;
  private lastSaveError: string | null = null;
  readonly ready: Promise<void>;

  constructor(private store: CheckpointStore) {
    this.ready = this.restoreOnStart();
  }
  private async restoreOnStart() {
    try {
      const saved = await this.store.read();
      if (saved !== undefined) {
        this.world = World.fromSnapshot(saved);
        this.lastSavedTick = this.world.tick;
        this.running = false;
      }
    } catch (error) { this.lastSaveError = String(error); }
  }
  advance(elapsed: number) {
    const seconds = Math.max(0, Math.min(.25, elapsed));
    if (this.running) {
      this.accumulator += seconds * this.tps;
      const steps = Math.min(12, Math.floor(this.accumulator));
      if (steps) { this.world.step(steps); this.accumulator -= steps; this.count += steps; this.revision++; }
    } else this.accumulator = 0;
    this.measured += Math.max(0, elapsed);
    if (this.measured >= 1) { this.actualTps = this.count / this.measured; this.count = 0; this.measured = 0; }
  }
  async autosave() {
    await this.ready;
    if (this.revision !== this.savedRevision) {
      try { await this.save(); } catch { /* reported in runtime status; simulation remains usable */ }
    }
  }
  private async save() {
    const snapshot = this.world.snapshot(), revision = this.revision;
    try {
      await this.store.write(snapshot);
      this.lastSavedTick = snapshot.tick; this.savedRevision = revision; this.lastSaveError = null;
      return { saved: true, tick: snapshot.tick };
    } catch (error) { this.lastSaveError = String(error); throw error; }
  }
  async request(path: string, value?: unknown): Promise<unknown> {
    await this.ready;
    if (value === undefined) {
      if (path === '/api/state') return { ...this.world.view(), runtime: {
        running: this.running, targetTps: this.tps, actualTps: this.actualTps,
        lastSavedTick: this.lastSavedTick, lastSaveError: this.lastSaveError,
      } };
      if (path === '/api/snapshot') return this.world.snapshot();
      if (path === '/api/presets') return PRESETS;
      if (/^\/api\/cells\/\d+$/.test(path)) {
        const cell = this.world.cells.get(Number(path.split('/').pop()));
        if (!cell) throw Object.assign(new Error('This cell is no longer alive.'), { status: 404 });
        return cell;
      }
    }
    if (path === '/api/snapshot' && value !== undefined) {
      const candidate = World.fromSnapshot(value);
      this.world = candidate; this.running = false; this.accumulator = 0; this.revision++;
      return { imported: true, tick: this.world.tick, paused: true };
    }
    if (path === '/api/checkpoint') {
      const cmd = object(value, 'checkpoint');
      if (cmd.action === 'save') return this.save();
      if (cmd.action === 'load') {
        const saved = await this.store.read();
        if (saved === undefined) throw new Error('No checkpoint has been saved yet.');
        const candidate = World.fromSnapshot(saved);
        this.world = candidate; this.running = false; this.accumulator = 0; this.revision++;
        return { loaded: true, tick: this.world.tick };
      }
      throw new Error('Unknown checkpoint action');
    }
    if (path === '/api/command') {
      const cmd = object(value, 'command');
      switch (cmd.type) {
        case 'pause': this.running = false; this.accumulator = 0; break;
        case 'resume': this.running = true; break;
        case 'step': {
          const ticks = number(cmd.ticks ?? 1, 'ticks', 1, 250, true);
          this.running = false; this.accumulator = 0; this.world.step(ticks); this.revision++; break;
        }
        case 'speed': this.tps = number(cmd.tps, 'tps', 1, 120, true); break;
        case 'config': this.world.patch(validatePatch(cmd.patch, this.world.config)); this.revision++; break;
        case 'reset': {
          const preset = typeof cmd.preset === 'string' ? PRESETS[cmd.preset] : PRESETS.meadow;
          if (!preset?.patch) throw new Error('Unknown preset');
          const seed = number(cmd.seed ?? 42, 'seed', 0, 4294967295, true);
          this.world = new World({ seed, ...preset.patch }); this.accumulator = 0; this.revision++; break;
        }
        case 'brush': this.world.brush(cmd.tool as Brush, cmd.x as number, cmd.y as number, cmd.radius as number); this.revision++; break;
        default: throw new Error('Unknown command');
      }
      return { ok: true, tick: this.world.tick, running: this.running };
    }
    throw new Error('Unknown browser request');
  }
}
