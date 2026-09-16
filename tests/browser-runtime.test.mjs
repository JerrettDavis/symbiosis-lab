import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserLab } from '../dist/web/browser-runtime.js';
import { World } from '../dist/engine/world.js';

function storage() {
  let saved;
  return { async read() { return saved; }, async write(value) { saved = structuredClone(value); } };
}
test('browser runtime runs the real engine and preserves exact checkpoint replay', async () => {
  const store = storage(), lab = new BrowserLab(store);
  await lab.ready;
  const call = (path, data) => lab.request('/api/' + path, data);
  await call('command', { type: 'step', ticks: 100 });
  const expected = new World(); expected.step(100);
  assert.deepEqual(await call('snapshot'), expected.snapshot());
  await call('checkpoint', { action: 'save' });
  await call('command', { type: 'step', ticks: 100 });
  const future = await call('snapshot');
  await call('checkpoint', { action: 'load' });
  await call('command', { type: 'step', ticks: 100 });
  assert.deepEqual(await call('snapshot'), future);
  const reopened = new BrowserLab(store); await reopened.ready;
  assert.equal((await reopened.request('/api/state')).tick, 100);
  assert.equal((await reopened.request('/api/state')).runtime.running, false);
});
test('browser controls validate changes and failed imports preserve the world', async () => {
  const lab = new BrowserLab(storage()); await lab.ready;
  await lab.request('/api/command', { type: 'config', patch: { signals: false } });
  await lab.request('/api/command', { type: 'brush', tool: 'signalA', x: 5, y: 5, radius: 3 });
  const before = await lab.request('/api/snapshot');
  assert.equal(before.config.signals, false);
  assert.ok(before.fields.a.some(v => v > 0));
  await assert.rejects(lab.request('/api/snapshot', {}));
  assert.deepEqual(await lab.request('/api/snapshot'), before);
  await assert.rejects(lab.request('/api/command', { type: 'step', ticks: -1 }));
  await lab.request('/api/command', { type: 'reset', preset: 'scarcity', seed: 7 });
  assert.equal((await lab.request('/api/state')).config.seed, 7);
});
test('storage failures leave simulation usable and visible in runtime status', async () => {
  const lab = new BrowserLab({ async read() { throw new Error('Storage blocked'); }, async write() { throw new Error('Quota exceeded'); } });
  await lab.ready;
  assert.match((await lab.request('/api/state')).runtime.lastSaveError, /Storage blocked/);
  await lab.request('/api/command', { type: 'step', ticks: 1 });
  await assert.rejects(lab.request('/api/checkpoint', { action: 'save' }), /Quota exceeded/);
  assert.equal((await lab.request('/api/state')).tick, 1);
  assert.match((await lab.request('/api/state')).runtime.lastSaveError, /Quota exceeded/);
});
test('playback and autosave preserve changes made while an asynchronous save is pending', async () => {
  let persisted, finish;
  const lab = new BrowserLab({
    async read() { return persisted; },
    async write(value) { await new Promise(resolve => { finish = resolve; }); persisted = value; },
  });
  await lab.ready;
  lab.advance(.1);
  assert.equal((await lab.request('/api/state')).tick, 3);
  const saving = lab.autosave();
  await new Promise(resolve => setImmediate(resolve));
  lab.advance(.1);
  finish(); await saving;
  assert.equal(persisted.tick, 3);
  const nextSave = lab.autosave();
  await new Promise(resolve => setImmediate(resolve));
  finish(); await nextSave;
  assert.equal(persisted.tick, 6);
  await lab.request('/api/command', { type: 'pause' });
  lab.advance(.25);
  assert.equal((await lab.request('/api/state')).tick, 6);
});
test('reported throughput uses real elapsed time when browser timers are throttled', async () => {
  const lab = new BrowserLab(storage()); await lab.ready;
  for (let i = 0; i < 4; i++) lab.advance(1);
  const state = await lab.request('/api/state');
  assert.equal(state.tick, 30);
  assert.equal(state.runtime.actualTps, 8);
});
