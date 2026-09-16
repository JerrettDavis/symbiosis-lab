import { BrowserLab } from './browser-runtime.js';
import { checkpointStore } from './checkpoint-store.js';

const scope = globalThis as unknown as {
  location: Location;
  postMessage(value: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
const lab = new BrowserLab(checkpointStore(new URL('../', scope.location.href).pathname));
let queue = Promise.resolve();
scope.onmessage = event => {
  const { id, path, data } = event.data;
  queue = queue.then(async () => {
    try { scope.postMessage({ id, result: await lab.request(path, data) }); }
    catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error), status: (error as {status?: number}).status }); }
  });
};
await lab.ready;
let previous = performance.now();
setInterval(() => { const now = performance.now(); lab.advance((now - previous) / 1000); previous = now; }, 20);
setInterval(() => { queue = queue.then(() => lab.autosave()); }, 30000);
