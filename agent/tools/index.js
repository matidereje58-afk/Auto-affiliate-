// Tool dispatcher: maps model tool calls to sandbox / workspace / web actions.

import { TOOL_SPECS, TOOL_NAMES } from './specs.js';
import { webSearch, formatSearchResults, fetchUrl, wikipedia } from './web.js';
import { normPath, truncate, fmtBytes, basename } from '../../lib/util.js';
import { vfs } from '../../lib/vfs.js';
import { pythonSandbox, jsSandbox } from '../../lib/sandbox.js';

export { TOOL_SPECS, TOOL_NAMES };

const MAX_TOOL_CHARS = 60000;
const clip = (s) => truncate(String(s ?? ''), MAX_TOOL_CHARS, `\n…[result truncated at ${MAX_TOOL_CHARS} chars]`);

export function createToolRunner(ctx) {
  const { onArtifact, onPlan, activity, memoryStore, spawnSubagent } = ctx;

  async function execute(name, args = {}) {
    switch (name) {
      case 'run_python': return runPython(args);
      case 'run_javascript': return runJavaScript(args);
      case 'list_files': return listFiles(args);
      case 'read_file': return readFile(args);
      case 'write_file': return writeFile(args, false);
      case 'append_file': return writeFile(args, true);
      case 'delete_file': return deleteFile(args);
      case 'search_files': return searchFiles(args);
      case 'web_search': return search(args);
      case 'fetch_url': return fetch_(args);
      case 'wikipedia': return wiki(args);
      case 'create_artifact': return createArtifact(args);
      case 'todo_write': return todoWrite(args);
      case 'memory': return memory(args);
      case 'spawn_subagent': return subagent(args);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  /* ------------------------------------------------------------- sandboxes -- */

  async function runPython({ code, timeout_s }) {
    const files = await pythonSandbox.collectChangedFiles();
    const timeoutMs = Math.min(Math.max((Number(timeout_s) || 90) * 1000, 5000), 600000);
    let res;
    try {
      res = await pythonSandbox.send({ type: 'run', code, files }, { timeoutMs });
    } catch (e) {
      if (!e.timeout) throw e;
      activity?.({ kind: 'python', ok: false, extra: 'timeout' });
      return { output: `ERROR: ${e.message}`, error: true, display: { kind: 'python', code, output: e.message } };
    }
    const written = await pythonSandbox.applyResultFiles(res);
    const parts = [res.error ? `STATUS: error (${Math.round(res.durationMs)} ms)` : `STATUS: ok (${Math.round(res.durationMs)} ms)`];
    if (res.stdout?.trim()) parts.push('--- stdout ---\n' + truncate(res.stdout, 20000));
    if (res.stderr?.trim()) parts.push('--- stderr ---\n' + truncate(res.stderr, 12000));
    if (res.result) parts.push('--- last expression ---\n' + truncate(res.result, 6000));
    if (res.error) parts.push('--- traceback ---\n' + truncate(res.error, 12000));
    if (written.length) parts.push('--- files written to workspace ---\n' + written.map((f) => `${f.path} (${fmtBytes(f.size)})`).join('\n'));
    if (res.charts?.length) parts.push('--- charts rendered ---\n' + res.charts.join(', ') + ' (PNG in workspace)');
    if (res.notes?.length) parts.push('--- notes ---\n' + res.notes.join('\n'));
    if (!res.stdout?.trim() && !res.stderr?.trim() && !res.result && !res.error) {
      parts.push('(no output — use print(), or make the last expression an inspectable value)');
    }
    activity?.({ kind: 'python', ok: !res.error, ms: res.durationMs, extra: written.length ? `${written.length} file(s) written` : '' });
    return {
      output: clip(parts.join('\n\n')),
      error: !!res.error,
      display: { kind: 'python', code, output: parts.join('\n\n'), files: written.map((f) => f.path) },
    };
  }

  async function runJavaScript({ code, timeout_s }) {
    const files = await jsSandbox.collectChangedFiles();
    const timeoutMs = Math.min(Math.max((Number(timeout_s) || 30) * 1000, 2000), 300000);
    let res;
    try {
      res = await jsSandbox.send({ type: 'run', code, files }, { timeoutMs });
    } catch (e) {
      if (!e.timeout) throw e;
      return { output: `ERROR: ${e.message}`, error: true, display: { kind: 'js', code, output: e.message } };
    }
    const written = await jsSandbox.applyResultFiles(res);
    const parts = [res.error ? `STATUS: error (${Math.round(res.durationMs)} ms)` : `STATUS: ok (${Math.round(res.durationMs)} ms)`];
    if (res.stdout?.trim()) parts.push('--- console ---\n' + truncate(res.stdout, 20000));
    if (res.result) parts.push('--- return value ---\n' + truncate(res.result, 8000));
    if (res.error) parts.push('--- error ---\n' + truncate(res.error, 12000));
    if (written.length) parts.push('--- files written ---\n' + written.map((f) => `${f.path} (${fmtBytes(f.size)})`).join('\n'));
    activity?.({ kind: 'javascript', ok: !res.error, ms: res.durationMs });
    return { output: clip(parts.join('\n\n')), error: !!res.error, display: { kind: 'js', code, output: parts.join('\n\n') } };
  }
/* ----------------------------------------------------------------- files -- */

  async function listFiles({ path }) {
    const all = await vfs.list();
    const filter = path ? normPath(path).toLowerCase() : '';
    const rows = all.filter((f) => !filter || f.path.toLowerCase().startsWith(filter));
    if (!rows.length) return { output: filter ? `No files matching "${filter}".` : 'Workspace is empty. Create files with write_file or run_python.' };
    const lines = rows.map((f) => `${f.path}\t${fmtBytes(f.size)}\t${new Date(f.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}`);
    return { output: `${rows.length} file(s) in workspace (path / size / modified):\n` + lines.join('\n') };
  }

  async function readFile({ path, start_line, end_line, max_chars }) {
    const p = normPath(path);
    const rec = await vfs.read(p);
    if (!rec) {
      const names = (await vfs.list()).map((f) => f.path).slice(0, 40).join(', ');
      return { output: `ERROR: no such file "${p}". Workspace contains: ${names || '(nothing)'}`, error: true };
    }
    const text = rec.text ?? '';
    if (!text && rec.binary) {
      return { output: `ERROR: "${p}" is a binary file (${fmtBytes(rec.size)}). Read it with Python (e.g. PIL/pandas) instead.`, error: true };
    }
    const lines = text.split('\n');
    const from = Math.max(1, Number(start_line) || 1);
    const to = Math.min(lines.length, Number(end_line) || lines.length);
    const slice = lines.slice(from - 1, to).join('\n');
    const capped = truncate(slice, Math.min(Number(max_chars) || 40000, 120000));
    const range = from > 1 || to < lines.length ? ` (showing lines ${from}-${to})` : '';
    return { output: `File: ${p} — ${lines.length} lines, ${fmtBytes(rec.size)}${range}\n${'-'.repeat(40)}\n${capped}` };
  }

  async function writeFile({ path, content }, append) {
    if (!path) throw new Error('path is required');
    if (content === undefined || content === null) throw new Error('content is required');
    const p = normPath(path);
    let data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    if (append) data = ((await vfs.readText(p)) ?? '') + data;
    const rec = await vfs.write(p, data, { source: 'agent' });
    return { output: `${append ? 'Appended to' : 'Wrote'} ${p} (${fmtBytes(rec.size)}).`, fileWritten: rec.path };
  }

  async function deleteFile({ path }) {
    const p = normPath(path);
    if (!(await vfs.has(p))) return { output: `ERROR: no such file "${p}".`, error: true };
    await vfs.delete(p);
    return { output: `Deleted ${p}.`, fileDeleted: p };
  }

  async function searchFiles({ query, regex, max_results = 25 }) {
    if (!query) throw new Error('query is required');
    const files = await vfs.list();
    const limit = Math.min(Number(max_results) || 25, 100);
    let re;
    try { re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
    catch (e) { return { output: `ERROR: invalid regex — ${e.message}`, error: true }; }
    const hits = [];
    for (const f of files) {
      if (f.binary || !f.text) continue;
      const lines = f.text.split('\n');
      for (let i = 0; i < lines.length && hits.length < limit; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) hits.push(`${f.path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
      }
      if (hits.length >= limit) break;
    }
    return { output: hits.length ? `${hits.length} match(es):\n` + hits.join('\n') : `No matches for "${query}".` };
  }
/* ------------------------------------------------------------------- web -- */

  async function search({ query, max_results }) {
    if (!query) throw new Error('query is required');
    const payload = await webSearch({ query, max_results });
    activity?.({ kind: 'web_search', ok: payload.count > 0, extra: payload.provider || 'no provider' });
    return { output: clip(formatSearchResults(payload)), error: payload.count === 0 };
  }

  async function fetch_({ url, format, max_chars }) {
    const res = await fetchUrl({ url, format, max_chars });
    const head = `URL: ${res.url}\nSource: ${res.source}${res.contentType ? ` (${res.contentType})` : ''}`
      + `${res.pages ? ` — ${res.pages} pages` : ''}${res.truncated ? ' — TRUNCATED' : ''}`;
    activity?.({ kind: 'fetch_url', ok: true, extra: String(res.url).slice(0, 80) });
    return { output: clip(`${head}\n${'-'.repeat(40)}\n${res.content}`) };
  }

  async function wiki({ query, sentences }) {
    const res = await wikipedia({ query, sentences });
    if (!res.found) return { output: `No Wikipedia article found for "${query}".`, error: true };
    const out = [
      `Wikipedia: ${res.title}`,
      res.url,
      '',
      res.summary || res.intro,
      res.sections?.length ? `\nSections: ${res.sections.join(' · ')}` : '',
      `\n(full article text: ${res.fullTextChars} chars — fetch_url the article URL for details)`,
    ].join('\n');
    activity?.({ kind: 'wikipedia', ok: true, extra: res.title });
    return { output: clip(out) };
  }

  /* ------------------------------------------------------------- artifacts -- */

  async function createArtifact({ name, content, title }) {
    const p = normPath(name || 'artifact.html');
    const rec = await vfs.write(p, content ?? '', { source: 'artifact' });
    const entry = { path: rec.path, title: title || basename(rec.path), createdAt: Date.now(), size: rec.size, mime: rec.mime };
    await onArtifact?.(entry);
    activity?.({ kind: 'create_artifact', ok: true, extra: rec.path });
    return {
      output: `Artifact delivered: ${rec.path} (${fmtBytes(rec.size)}). It now appears in the user's Artifacts panel and workspace.`,
      artifact: entry,
    };
  }

  async function todoWrite({ tasks }) {
    const list = (Array.isArray(tasks) ? tasks : []).slice(0, 40).map((t) => ({
      text: String(t?.text ?? t ?? ''),
      status: ['pending', 'in_progress', 'completed'].includes(t?.status) ? t.status : 'pending',
    }));
    await onPlan?.(list);
    const done = list.filter((t) => t.status === 'completed').length;
    return {
      output: `Plan updated (${done}/${list.length} complete):\n`
        + list.map((t) => `- [${t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : ' '}] ${t.text}`).join('\n'),
      plan: list,
    };
  }

  async function memory({ action, key, value }) {
    if (!memoryStore) return { output: 'Memory is unavailable.', error: true };
    switch (action) {
      case 'set': {
        if (!key) throw new Error('key is required for set');
        await memoryStore.set(key, value ?? '');
        return { output: `Remembered "${key}".` };
      }
      case 'get': {
        const v = await memoryStore.get(key);
        return { output: v === undefined || v === null ? `No memory stored for "${key}".` : `${key} = ${v}` };
      }
      case 'list': {
        const all = await memoryStore.all();
        const keys = Object.keys(all);
        return { output: keys.length ? keys.map((k) => `${k}: ${String(all[k]).slice(0, 300)}`).join('\n') : 'Memory is empty.' };
      }
      case 'delete': {
        await memoryStore.delete(key);
        return { output: `Forgot "${key}".` };
      }
      default: throw new Error(`unknown action "${action}"`);
    }
  }

  async function subagent({ task, max_steps }) {
    if (!spawnSubagent) return { output: 'Sub-agents are disabled in settings.', error: true };
    if (ctx.depth >= 1) return { output: 'ERROR: sub-agents cannot spawn further sub-agents.', error: true };
    if (!task) throw new Error('task is required');
    const steps = Math.min(Math.max(Number(max_steps) || 12, 1), 30);
    activity?.({ kind: 'subagent', ok: true, extra: task.slice(0, 70) });
    const report = await spawnSubagent({ task, maxSteps: steps });
    return { output: clip(`Sub-agent report:\n${'-'.repeat(40)}\n${report}`) };
  }

  return { execute, specs: TOOL_SPECS, names: TOOL_NAMES };
}
