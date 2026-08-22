import type { StoredRecipe } from './recipe';

/**
 * Recipe library persistence for the installed app.
 *
 * IndexedDB is the primary store: it survives a reload, an offline start from
 * the service worker, and holds far more than the ~5 MB localStorage budget.
 * Browsers that block it (private windows, embedded webviews) fall back to
 * localStorage so the feature degrades instead of failing.
 */

const DB_NAME = 'byteforce-recipes';
const DB_VERSION = 1;
const STORE_NAME = 'recipes';
const FALLBACK_KEY = 'byteforce.recipes';

type Backend = 'indexeddb' | 'localstorage' | 'memory';

let dbPromise: Promise<IDBDatabase> | null = null;
let backend: Backend | null = null;
/** Last resort when both browser stores are unavailable — keeps the UI working. */
const memoryStore = new Map<string, StoredRecipe>();

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
  // A rejected promise must not be cached, or every later call fails too.
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

function readFallback(): StoredRecipe[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredRecipe[]) : [];
  } catch {
    return [...memoryStore.values()];
  }
}

function writeFallback(records: StoredRecipe[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
    backend = 'localstorage';
  } catch {
    memoryStore.clear();
    for (const record of records) memoryStore.set(record.id, record);
    backend = 'memory';
  }
}

function byNewestFirst(records: StoredRecipe[]): StoredRecipe[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const recipeStore = {
  /** Which store the last successful call used — surfaced as a hint in the UI. */
  get backend(): Backend | null {
    return backend;
  },

  async list(): Promise<StoredRecipe[]> {
    try {
      const records = await withStore('readonly', (store) =>
        request<StoredRecipe[]>(store.getAll() as IDBRequest<StoredRecipe[]>)
      );
      backend = 'indexeddb';
      return byNewestFirst(records);
    } catch {
      backend = backend === 'memory' ? 'memory' : 'localstorage';
      return byNewestFirst(backend === 'memory' ? [...memoryStore.values()] : readFallback());
    }
  },

  async put(record: StoredRecipe): Promise<StoredRecipe> {
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

  /** Used by the library import, which replaces the whole collection at once. */
  async replaceAll(records: StoredRecipe[]): Promise<void> {
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
