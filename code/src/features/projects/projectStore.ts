import type { StoredProject } from './types';

/**
 * Saved catering projects persistence for the installed app.
 *
 * IndexedDB is the primary store: it survives a reload, an offline start from
 * the service worker, and holds large plans with full shopping lists and pricing.
 * Browsers that block it (private windows, embedded webviews) fall back to
 * localStorage so the feature degrades gracefully instead of failing.
 */

const DB_NAME = 'byteforce-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const FALLBACK_KEY = 'byteforce.projects';

type Backend = 'indexeddb' | 'localstorage' | 'memory';

let dbPromise: Promise<IDBDatabase> | null = null;
let backend: Backend | null = null;
/** Last resort when both browser stores are unavailable — keeps the UI working. */
const memoryStore = new Map<string, StoredProject>();

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) {
        const store = open.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB could not be opened'));
    open.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, mode);
  const result = await run(transaction.objectStore(STORE_NAME));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
  });
  return result;
}

function readFallback(): StoredProject[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredProject[]) : [];
  } catch {
    return [...memoryStore.values()];
  }
}

function writeFallback(records: StoredProject[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
    backend = 'localstorage';
  } catch {
    memoryStore.clear();
    for (const record of records) memoryStore.set(record.id, record);
    backend = 'memory';
  }
}

function byNewestFirst(records: StoredProject[]): StoredProject[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const projectStore = {
  /** Which store the last successful call used. */
  get backend(): Backend | null {
    return backend;
  },

  async list(): Promise<StoredProject[]> {
    try {
      const records = await withStore('readonly', (store) =>
        request<StoredProject[]>(store.getAll() as IDBRequest<StoredProject[]>)
      );
      backend = 'indexeddb';
      return byNewestFirst(records);
    } catch {
      backend = backend === 'memory' ? 'memory' : 'localstorage';
      return byNewestFirst(backend === 'memory' ? [...memoryStore.values()] : readFallback());
    }
  },

  async get(id: string): Promise<StoredProject | null> {
    try {
      const record = await withStore('readonly', (store) =>
        request<StoredProject | undefined>(store.get(id) as IDBRequest<StoredProject | undefined>)
      );
      backend = 'indexeddb';
      return record ?? null;
    } catch {
      const list = await this.list();
      return list.find((p) => p.id === id) ?? null;
    }
  },

  async put(record: StoredProject): Promise<StoredProject> {
    try {
      await withStore('readwrite', (store) => request(store.put(record)));
      backend = 'indexeddb';
      return record;
    } catch {
      const rest = readFallback().filter((entry) => entry.id !== record.id);
      writeFallback([record, ...rest]);
      return record;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await withStore('readwrite', (store) => request(store.delete(id)));
      backend = 'indexeddb';
    } catch {
      writeFallback(readFallback().filter((entry) => entry.id !== id));
    }
  },

  async replaceAll(records: StoredProject[]): Promise<void> {
    try {
      await withStore('readwrite', async (store) => {
        await request(store.clear());
        for (const record of records) await request(store.put(record));
      });
      backend = 'indexeddb';
    } catch {
      writeFallback(records);
    }
  },

  async clear(): Promise<void> {
    await this.replaceAll([]);
  },
};
