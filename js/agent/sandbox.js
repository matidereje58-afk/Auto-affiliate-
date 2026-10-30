/**
 * Sandboxed JavaScript runner.
 *
 * Executes model-authored code inside a dedicated Web Worker with a hard
 * timeout, no DOM access and no access to the host page's globals. Console
 * output, the completion value and errors are streamed back.
 *
 * Usage:  const runner = createRunner(); await runner.run('return 1 + 1');
 */

const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { id, code } = event.data || {};
  const logs = [];
  const fmt = (value) => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };
  const push = (level) => (...args) => logs.push({ level, text: args.map(fmt).join(' ') });
  const sandboxConsole = {
    log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug'),
    table: push('log'), trace: push('log'),
  };
  const started = Date.now();
  try {
    const factory = new Function('console', 'setTimeout', 'clearTimeout', '"use strict"; return (async () => {' + code + '\\n})();');
    const result = await factory(sandboxConsole, () => {}, () => {});
    self.postMessage({ id, ok: true, logs, result: fmt(result ?? ''), ms: Date.now() - started });
  } catch (error) {
    self.postMessage({
      id, ok: false, logs,
      error: { name: error && error.name, message: error && error.message, stack: error && String(error.stack || '').split('\\n').slice(0, 4).join('\\n') },
      ms: Date.now() - started,
    });
  }
};
`;

export function createRunner({ timeoutMs = 8000 } = {}) {
  let worker = null;
  let seq = 0;
  const pending = new Map();

  const ensure = () => {
    if (worker) return worker;
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (event) => {
      const entry = pending.get(event.data?.id);
      if (!entry) return;
      pending.delete(event.data.id);
      clearTimeout(entry.timer);
      entry.resolve(event.data);
    };
    worker.onerror = (event) => {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, logs: [], error: { message: event.message || 'Worker crashed' } });
      }
      pending.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  };

  return {
    async run(code) {
      const instance = ensure();
      const id = ++seq;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          worker?.terminate();
          worker = null;
          resolve({ ok: false, logs: [], error: { message: `Execution timed out after ${timeoutMs}ms` }, timeout: true });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        instance.postMessage({ id, code });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}

/** Render an execution result as compact text for the model + the UI. */
export function formatRunOutput(result) {
  if (!result) return '(no output)';
  const lines = [];
  for (const log of result.logs ?? []) {
    lines.push(`[${log.level}] ${log.text}`);
  }
  if (result.ok) {
    if (result.result !== undefined && result.result !== '' && result.result !== 'undefined') {
      lines.push(`=> ${result.result}`);
    }
  } else if (result.error) {
    lines.push(`${result.error.name ?? 'Error'}: ${result.error.message}`);
    if (result.error.stack) lines.push(result.error.stack);
  }
  if (!lines.length) lines.push('(no output)');
  return lines.join('\n');
}
