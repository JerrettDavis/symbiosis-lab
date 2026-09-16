import type { CheckpointStore } from './browser-runtime.js';

/** Namespace storage by project path because GitHub Pages projects share an origin. */
export function checkpointStore(namespace: string): CheckpointStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`symbiosis-lab:${namespace}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('checkpoints');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open browser storage'));
    request.onblocked = () => reject(new Error('Browser storage is blocked by another tab'));
  });
  async function transaction(mode: IDBTransactionMode, value?: unknown): Promise<unknown> {
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('checkpoints', mode), store = tx.objectStore('checkpoints');
      const request = mode === 'readonly' ? store.get('latest') : store.put(value, 'latest');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Checkpoint transaction failed'));
      tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Checkpoint storage failed'));
    });
  }
  return { read: () => transaction('readonly'), write: async snapshot => { await transaction('readwrite', snapshot); } };
}
