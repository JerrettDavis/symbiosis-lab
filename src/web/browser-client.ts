export function createBrowserClient() {
  const worker = new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
  let nextId = 0, failure: Error | null = null;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const fail = () => {
    failure = new Error('The browser simulation stopped. Reload the page to restore the last checkpoint.');
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(failure); }
    pending.clear(); worker.terminate();
  };
  worker.onerror = fail; worker.onmessageerror = fail;
  worker.onmessage = event => {
    const { id, result, error, status } = event.data, entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(id);
    if (error) entry.reject(Object.assign(new Error(error), { status })); else entry.resolve(result);
  };
  return <T>(path: string, data?: unknown): Promise<T> => {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(fail, 60000);
      pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      worker.postMessage({ id, path, data });
    });
  };
}
