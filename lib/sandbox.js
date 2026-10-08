// Sandbox manager: owns the Python (Pyodide) and JavaScript workers,
// syncs the workspace filesystem in and out, and enforces time limits.

import { vfs } from './vfs.js';
import { uid } from './util.js';

class WorkerHandle {
  constructor(url, name) {
    this.url = url;
    this.name = name;
    this.worker = null;
    this.pending = new Map();
    this.ready = null;
    this.state = 'cold';
    this.onStateChange = null;
    this.synced = new Map(); // path -> signature last mirrored into the sandbox
  }

  setState(s) {
    this.state = s;
    this.onStateChange?.(this.name, s);
  }

  spawn() {
    if (this.worker) return;
    this.worker = new Worker(this.url);
    this.worker.onmessage = (ev) => this._onMessage(ev.data);
    this.worker.onerror = (e) => {
      const err = new Error(`${this.name} worker crashed: ${e.message || 'unknown error'}`);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
      this.setState('error');
    };
    this.setState('cold');
  }

  _onMessage(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'error') p.reject(new Error(msg.error + (msg.stack ? '\n' + msg.stack : '')));
    else p.resolve(msg);
  }

  send(message, { timeoutMs = 0 } = {}) {
    this.spawn();
    const id = uid('r');
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            this.pending.delete(id);
            const err = new Error(`Execution timed out after ${Math.round(timeoutMs / 1000)}s — the sandbox was reset.`);
            err.timeout = true;
            this.kill();
            reject(err);
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...message, id });
    });
  }

  async boot() {
    if (this.ready) return this.ready;
    this.setState('loading');
    this.ready = this.send({ type: 'init' }, { timeoutMs: 180000 })
      .then((msg) => {
        this.setState('ready');
        return msg;
      })
      .catch((e) => {
        this.ready = null;
        this.setState('error');
        throw e;
      });
    return this.ready;
  }

  kill() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
    this.synced.clear();
    this.setState('cold');
  }

  async reset() {
    this.kill();
    return this.boot();
  }

  /** Push the workspace files that changed since the last run into the sandbox. */
  async collectChangedFiles() {
    const files = await vfs.list();
    const out = [];
    const seen = new Set();
    for (const f of files) {
      seen.add(f.path);
      const sig = `${f.size}:${f.updatedAt}:${f.binary ? 'b' : 't'}`;
      if (this.synced.get(f.path) === sig) continue;
      if (f.size > 6_000_000) continue;
      if (f.binary) {
        out.push({ path: f.path, b64: toBase64(f.bytes) });
      } else {
        out.push({ path: f.path, text: f.text ?? '' });
      }
      this.synced.set(f.path, sig);
    }
    for (const p of [...this.synced.keys()]) if (!seen.has(p)) this.synced.delete(p);
    return out;
  }

  /** Write sandbox-produced files back into the workspace. */
  async applyResultFiles(result) {
    const written = [];
    for (const f of result.files || []) {
      if (f.skip) continue;
      const data = f.b64 !== undefined ? fromBase64(f.b64) : (f.text ?? '');
      const rec = await vfs.write(f.path, data, { source: this.name });
      written.push(rec);
      const sig = `${rec.size}:${rec.updatedAt}:${rec.binary ? 'b' : 't'}`;
      this.synced.set(rec.path, sig);
    }
    for (const p of result.removed || []) {
      if (await vfs.has(p)) await vfs.delete(p);
      this.synced.delete(p);
    }
    return written;
  }
}

function toBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const pythonSandbox = new WorkerHandle('./workers/python-worker.js', 'python');
export const jsSandbox = new WorkerHandle('./workers/js-worker.js', 'javascript');
export { toBase64, fromBase64 };

export async function resetAllSandboxes() {
  pythonSandbox.kill();
  jsSandbox.kill();
}