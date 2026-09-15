import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../engine/world.js';
import { number, object, validatePatch } from '../engine/validation.js';
import { PRESETS, type Brush } from '../engine/types.js';

export interface AppOptions { dataDir?: string; autosave?: boolean; running?: boolean; world?: World; tps?: number; }
export function createLab(options: AppOptions = {}) {
  const dataDir = resolve(options.dataDir ?? 'data'), savePath = resolve(dataDir, 'latest.json');
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const autosave = options.autosave ?? true;
  mkdirSync(dataDir, { recursive: true });
  let world = options.world ?? (existsSync(savePath) ? World.fromSnapshot(JSON.parse(readFileSync(savePath, 'utf8'))) : new World());
  let running = options.running ?? true, tps = number(options.tps ?? 30, 'tps', 1, 120, true);
  let accumulator = 0, previous = performance.now(), actualTps = 0, count = 0, measureAt = performance.now();
  let revision = 0, cacheRevision = -1, cacheView: ReturnType<World['view']> | null = null;
  let lastSavedTick: number | null = null, lastSaveError: string | null = null, dirty = false;
  const invalidate = () => { revision++; dirty = true; };
  const save = () => {
    // Synchronous capture + atomic rename: saves cannot interleave. This blocks briefly in a single-user demo.
    const tmp = `${savePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(world.snapshot()), { mode: 0o600 }); renameSync(tmp, savePath);
    lastSavedTick = world.tick; lastSaveError = null; dirty = false;
    return { saved: true, tick: world.tick };
  };
  const safeSave = () => { try { save(); } catch (err) { lastSaveError = err instanceof Error ? err.message : 'Save failed'; console.error(lastSaveError); } };
  const timer = setInterval(() => {
    const now = performance.now(), elapsed = Math.min(.25, (now - previous) / 1000); previous = now;
    if (running) {
      accumulator += elapsed * tps;
      const steps = Math.min(12, Math.floor(accumulator));
      if (steps) { world.step(steps); accumulator -= steps; count += steps; invalidate(); }
    } else accumulator = 0;
    if (now-measureAt > 1000) { actualTps = count * 1000 / (now-measureAt); count = 0; measureAt = now; }
  }, 20);
  timer.unref();
  const saveTimer = setInterval(() => { if (autosave && dirty) safeSave(); }, 30000); saveTimer.unref();

  function json(res: ServerResponse, status: number, value: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
  }
  async function body(req: IncomingMessage): Promise<unknown> {
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new Error('Content-Type must be application/json');
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > 16 * 1024 * 1024) throw new Error('Request exceeds 16 MiB');
    const chunks: Buffer[] = []; let total = 0;
    for await (const chunk of req) { const b = Buffer.from(chunk); total += b.length; if (total > 16 * 1024 * 1024) throw new Error('Request exceeds 16 MiB'); chunks.push(b); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/healthz') return json(res, 200, { status: 'ok', tick: world.tick, running, lastSaveError });
      if (req.method === 'GET' && path === '/api/state') {
        if (cacheRevision !== revision || !cacheView) { cacheView = world.view(); cacheRevision = revision; }
        return json(res, 200, { ...cacheView, runtime: { running, targetTps: tps, actualTps, lastSavedTick, lastSaveError } });
      }
      if (req.method === 'GET' && path === '/api/presets') return json(res, 200, PRESETS);
      if (req.method === 'GET' && /^\/api\/cells\/\d+$/.test(path)) {
        const cell = world.cells.get(Number(path.split('/').pop()));
        return json(res, cell ? 200 : 404, cell ?? { error: 'This cell is no longer alive.' });
      }
      if (req.method === 'GET' && path === '/api/snapshot') {
        res.setHeader('Content-Disposition', `attachment; filename="symbiosis-seed${world.config.seed}-tick${world.tick}.json"`);
        return json(res, 200, world.snapshot());
      }
      if (req.method === 'POST') {
        // JSON-only writes and same-origin checks reduce accidental cross-site controls. Not an authentication system.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin writes are not allowed.' });
        const value = await body(req);
        if (path === '/api/snapshot') {
          const candidate = World.fromSnapshot(value); // validate before touching the running world
          world = candidate; running = false; accumulator = 0; invalidate();
          return json(res, 200, { imported: true, tick: world.tick, paused: true });
        }
        if (path === '/api/checkpoint') {
          const command = object(value, 'checkpoint');
          if (command.action === 'save') { try { return json(res, 200, save()); } catch (e) { lastSaveError = String(e); return json(res, 500, { error: 'Could not save checkpoint. Check data directory permissions.' }); } }
          if (command.action === 'load') {
            if (!existsSync(savePath)) return json(res, 404, { error: 'No checkpoint has been saved yet.' });
            const candidate = World.fromSnapshot(JSON.parse(readFileSync(savePath, 'utf8')));
            world = candidate; running = false; accumulator = 0; invalidate(); return json(res, 200, { loaded: true, tick: world.tick });
          }
          throw new Error('Unknown checkpoint action');
        }
        if (path === '/api/command') {
          const cmd = object(value, 'command');
          switch (cmd.type) {
            case 'pause': running = false; accumulator = 0; break;
            case 'resume': running = true; break;
            case 'step': { const n = number(cmd.ticks ?? 1, 'ticks', 1, 250, true); running = false; accumulator = 0; world.step(n); invalidate(); break; }
            case 'speed': tps = number(cmd.tps, 'tps', 1, 120, true); break;
            case 'config': world.patch(validatePatch(cmd.patch, world.config)); invalidate(); break;
            case 'reset': {
              const preset = typeof cmd.preset === 'string' ? PRESETS[cmd.preset] : PRESETS.meadow;
              if (!preset || !preset.patch) throw new Error('Unknown preset');
              const seed = number(cmd.seed ?? 42, 'seed', 0, 4294967295, true);
              world = new World({ seed, ...preset.patch }); accumulator = 0; invalidate(); break;
            }
            case 'brush': world.brush(cmd.tool as Brush, cmd.x as number, cmd.y as number, cmd.radius as number); invalidate(); break;
            default: throw new Error('Unknown command');
          }
          return json(res, 200, { ok: true, tick: world.tick, running });
        }
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      const decoded = decodeURIComponent(path), file = resolve(publicDir, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!file.startsWith(publicDir.endsWith(sep) ? publicDir : publicDir + sep) || !existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: 'Not found' });
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    } catch (err) {
      if (!res.headersSent) json(res, 400, { error: err instanceof Error ? err.message : 'Invalid request' });
      else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  async function stop(): Promise<void> {
    clearInterval(timer); clearInterval(saveTimer); if (autosave) safeSave();
    await new Promise<void>((ok, fail) => server.close(e => e ? fail(e) : ok()));
  }
  return { server, stop, save, get world() { return world; } };
}
