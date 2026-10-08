// Virtual workspace filesystem, persisted in IndexedDB.
// Files are shared by the agent's Python/JS sandboxes, the UI and downloads.

import { normPath, isTextPath, mimeFor } from './util.js';

const DB_NAME = 'atria-agent';
const STORE = 'files';
const META_STORE = 'kv';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'path' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toRecord(path, data, extra = {}) {
  const p = normPath(path);
  let bytes, text = null, binary = false;
  if (typeof data === 'string') {
    bytes = enc.encode(data);
    text = data;
  } else if (data instanceof Uint8Array) {
    bytes = data;
    binary = !isTextPath(p) && data.some((b) => b === 0);
    if (!binary) {
      try { text = dec.decode(data); } catch { text = null; binary = true; }
    }
  } else if (data instanceof ArrayBuffer) {
    return toRecord(p, new Uint8Array(data), extra);
  } else if (data === null || data === undefined) {
    bytes = new Uint8Array(0); text = '';
  } else {
    return toRecord(p, JSON.stringify(data, null, 2), extra);
  }
  return {
    path: p,
    name: p.split('/').pop(),
    mime: extra.mime || mimeFor(p),
    text,
    binary,
    bytes,
    size: bytes.length,
    updatedAt: Date.now(),
    source: extra.source || 'agent',
  };
}

export const vfs = {
  async write(path, data, extra) {
    const rec = toRecord(path, data, extra);
    await tx(STORE, 'readwrite', (s) => s.put(rec));
    return rec;
  },

  async read(path) {
    const rec = await tx(STORE, 'readonly', (s) => s.get(normPath(path)));
    return rec || null;
  },

  async readText(path) {
    const rec = await this.read(path);
    if (!rec) return null;
    if (rec.text !== null && rec.text !== undefined) return rec.text;
    try { return dec.decode(rec.bytes); } catch { return null; }
  },

  async list() {
    const all = await tx(STORE, 'readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => a.path.localeCompare(b.path));
  },

  async meta() {
    const all = await this.list();
    return all.map((f) => ({ path: f.path, size: f.size, updatedAt: f.updatedAt, mime: f.mime, binary: f.binary }));
  },

  async has(path) { return !!(await this.read(path)); },

  async delete(path) { await tx(STORE, 'readwrite', (s) => s.delete(normPath(path))); },

  async clear() { await tx(STORE, 'readwrite', (s) => s.clear()); },

  async count() { return (await tx(STORE, 'readonly', (s) => s.count())) || 0; },

  /** Read a JSON blob from the kv store (used for artifacts + memory). */
  async kvGet(key) { return (await tx(META_STORE, 'readonly', (s) => s.get(key))) ?? null; },
  async kvSet(key, value) { await tx(META_STORE, 'readwrite', (s) => s.put(value, key)); },
  async kvDelete(key) { await tx(META_STORE, 'readwrite', (s) => s.delete(key)); },

  /** Blob URL helper for previews/downloads. */
  async objectUrl(path) {
    const rec = await this.read(path);
    if (!rec) return null;
    return URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
  },

  async blob(path) {
    const rec = await this.read(path);
    if (!rec) return null;
    return new Blob([rec.bytes], { type: rec.mime });
  },
};

export { enc, dec };