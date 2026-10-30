/**
 * Where the recorded runs are kept: this browser's IndexedDB, database `swvr.training` (never
 * localStorage: that is small and holds the career saves, shared with every address of the
 * site). Two stores: the runs' headers (the list) and the runs themselves. The oldest go past
 * CONFIG.training.record.keepRuns. Every call fails quietly (private windows, storage
 * blocked): the recording is then this session's only.
 */
import { CONFIG } from '../config';
import type { Run, RunHeader } from './recording';

const DB = 'swvr.training';
const HEADERS = 'headers';
const RUNS = 'runs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HEADERS)) db.createObjectStore(HEADERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'header.id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class RunStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= openDb();
    return this.db;
  }

  /** Keep a run (and drop the oldest past the limit). */
  async put(run: Run): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([HEADERS, RUNS], 'readwrite');
    tx.objectStore(HEADERS).put(run.header);
    tx.objectStore(RUNS).put(run);
    await done(tx);
    const all = await this.list();
    const extra = all.slice(CONFIG.training.record.keepRuns);
    if (!extra.length) return;
    const del = db.transaction([HEADERS, RUNS], 'readwrite');
    for (const h of extra) {
      del.objectStore(HEADERS).delete(h.id);
      del.objectStore(RUNS).delete(h.id);
    }
    await done(del);
  }

  /** Every run's header, newest first. */
  async list(): Promise<RunHeader[]> {
    const db = await this.open();
    const all = await request(db.transaction(HEADERS).objectStore(HEADERS).getAll() as IDBRequest<RunHeader[]>);
    return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async get(id: string): Promise<Run | null> {
    const db = await this.open();
    return ((await request(db.transaction(RUNS).objectStore(RUNS).get(id))) as Run | undefined) ?? null;
  }
}
