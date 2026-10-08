/* JavaScript sandbox worker.
 * A persistent, isolated scope with console capture and workspace file helpers.
 * Computation runs off the UI thread; an infinite loop can be killed by terminating this worker.
 */

let scope = Object.create(null);
let logs = [];

const MAX_LOGS = 4000;

function fmt(v) {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
  if (typeof v === 'bigint') return v.toString() + 'n';
  try {
    if (Array.isArray(v)) return JSON.stringify(v, replacer, 1) ?? String(v);
    if (typeof v === 'object') return JSON.stringify(v, replacer, 2) ?? String(v);
  } catch { /* circular */ }
  return String(v);
}

function replacer(key, value) {
  if (typeof value === 'bigint') return value.toString() + 'n';
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  return value;
}

function pushLog(level, args) {
  if (logs.length > MAX_LOGS) return;
  logs.push(level + ': ' + args.map(fmt).join(' '));
}

const sandboxConsole = {
  log: (...a) => pushLog('log', a),
  info: (...a) => pushLog('info', a),
  warn: (...a) => pushLog('warn', a),
  error: (...a) => pushLog('error', a),
  debug: (...a) => pushLog('debug', a),
  table: (...a) => pushLog('table', a),
  trace: (...a) => pushLog('trace', a),
  group: (...a) => pushLog('group', a),
  groupEnd: () => {},
  time: () => {},
  timeEnd: () => {},
  dir: (...a) => pushLog('dir', a),
  assert: (cond, ...a) => { if (!cond) pushLog('assert', ['assertion failed', ...a]); },
};

const fileState = new Map(); // path -> text content in the sandbox view

const api = {
  console: sandboxConsole,
  sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms | 0, 30000))),
  readFile: (path) => {
    const p = String(path).replace(/^\/+/, '');
    if (!fileState.has(p)) throw new Error(`readFile: no such file in workspace: ${path}`);
    return fileState.get(p);
  },
  writeFile: (path, content) => {
    const p = String(path).replace(/^\/+/, '');
    fileState.set(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return p;
  },
  listFiles: () => [...fileState.keys()].sort(),
  files: () => [...fileState.keys()].sort(),
  fetchJson: async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  },
  fetchText: async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  },
  env: () => ({ worker: true, userAgent: navigator.userAgent, now: new Date().toISOString() }),
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function syncIn(files) {
  for (const f of files || []) {
    if (f.text !== undefined) fileState.set(f.path, f.text);
    else fileState.delete(f.path);
  }
}

async function run({ code, files, label }) {
  syncIn(files);
  const before = new Map(fileState);
  logs = [];
  const t0 = performance.now();
  const names = Object.keys(api);
  let returned;
  let error = null;

  // Capture the value of the final expression, like a REPL.
  const wrapped = `"use strict";\n${code}\n;`;
  try {
    const fn = new AsyncFunction(...names, wrapped);
    returned = await fn(...names.map((n) => api[n]));
  } catch (err) {
    error = (err && err.stack) ? String(err.stack) : String(err);
    if (error.length > 4000) error = error.slice(0, 4000) + '\n…';
  }

  const changed = [];
  for (const [p, text] of fileState) {
    if (!before.has(p) || before.get(p) !== text) changed.push({ path: p, text });
  }
  const removed = [...before.keys()].filter((p) => !fileState.has(p));
  for (const p of removed) fileState.delete(p);

  const printed = logs.join('\n');
  const out = {
    stdout: printed.slice(0, 200000),
    truncated: printed.length > 200000,
    error,
    result: returned === undefined ? '' : fmt(returned).slice(0, 20000),
    files: changed,
    removed,
    durationMs: Math.round(performance.now() - t0),
    label: label || 'js',
  };
  if (out.stdout.length > 200000) out.stdout = out.stdout.slice(0, 200000);
  return out;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const rid = msg.id;
  try {
    if (msg.type === 'run') {
      self.postMessage({ type: 'result', id: rid, ...(await run(msg)) });
    } else if (msg.type === 'reset') {
      fileState.clear();
      self.postMessage({ type: 'reset', id: rid });
    } else if (msg.type === 'ping') {
      self.postMessage({ type: 'pong', id: rid });
    } else {
      self.postMessage({ type: 'error', id: rid, error: 'unknown message type: ' + msg.type });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: rid, error: String(err?.stack ?? err) });
  }
};