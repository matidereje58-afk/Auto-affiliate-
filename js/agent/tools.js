/**
 * The agent's tool belt.
 *
 * Every tool is a real capability with a JSON schema the model can call:
 *  - files:   list / read / write / edit / delete / search  (project FS + Puter cloud FS)
 *  - execute: javascript (Web Worker sandbox), python (Pyodide), html preview
 *  - web:     fetch_url (puter.net.fetch -> readable text)
 *  - meta:    update_plan, remember, ask_user, finish
 */
import { diffLines } from '../lib/diff.js';
import { createRunner, formatRunOutput } from './sandbox.js';

const MAX_TOOL_RESULT = 24000;

const pathSchema = {
  type: 'object',
  properties: { path: { type: 'string', description: 'Project-relative path, e.g. "src/app.js"' } },
  required: ['path'],
};

export const TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List every file in the project with its size. Use it to orient yourself before editing.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a project file. Always read a file before editing it. Use line ranges for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'integer', minimum: 1, description: '1-based first line (optional)' },
          end_line: { type: 'integer', minimum: 1, description: '1-based last line (optional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a file or replace its whole contents. Prefer edit_file for small changes to existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'Full file contents' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact snippet in a file. old_string must appear verbatim (include surrounding lines so it is unique). Fails loudly when it does not match.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a project file.',
      parameters: pathSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search the project for text or a regular expression. Returns matching lines as file:line.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          regex: { type: 'boolean', description: 'Treat query as a regular expression' },
          path_prefix: { type: 'string', description: 'Only search files under this prefix' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_javascript',
      description: 'Execute JavaScript in an isolated sandbox and return console output. Use it to test algorithms, verify code, or transform data. No DOM, no network, 8s limit.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'JavaScript body. Use `return` to emit a value.' } },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_python',
      description: 'Execute Python (CPython via Pyodide; the first run downloads the runtime). Returns stdout.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_html',
      description: 'Render an HTML file (or raw HTML) in the live preview panel so the user can see the result.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project HTML file to preview (optional)' },
          html: { type: 'string', description: 'Raw HTML to preview instead of a file (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL through Puter networking (no CORS limits) and return readable text. Use it for docs and APIs.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          max_chars: { type: 'integer', description: 'Truncate output (default 12000)' },
        },
        required: ['url'],
      },
    },
  },
];

/** Planning + control-flow tools; always available (no tool-calling capability needed). */
export const META_TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Maintain the visible task plan. Call it first, and again whenever a task starts or finishes.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
              },
              required: ['title', 'status'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Store a durable project fact (conventions, decisions, API shapes) for future turns.',
      parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Pause and ask the user a question when a decision is genuinely ambiguous.',
      parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Declare the task complete with a short summary of what changed and how it was verified.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary'],
      },
    },
  },
];

export const ALL_TOOL_SPECS = [...TOOL_SPECS, ...META_TOOL_SPECS];

const LABELS = {
  list_files: ['List files', '📁'],
  read_file: ['Read file', '📄'],
  write_file: ['Write file', '💾'],
  edit_file: ['Edit file', '✏️'],
  delete_file: ['Delete file', '🗑️'],
  search_files: ['Search', '🔍'],
  run_javascript: ['Run JavaScript', '⚡'],
  run_python: ['Run Python', '🐍'],
  preview_html: ['Preview', '🖥️'],
  fetch_url: ['Fetch URL', '🌐'],
  update_plan: ['Update plan', '🗺️'],
  remember: ['Remember', '🧠'],
  ask_user: ['Ask user', '🙋'],
  finish: ['Finish', '✅'],
};

export function toolMeta(name) {
  const [label, icon] = LABELS[name] ?? [name, '🔧'];
  return { label, icon };
}

// ------------------------------------------------------------- helpers ----
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let pyodidePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(script);
  });
}

function ensurePyodide() {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    await loadScript(PYODIDE_URL + 'pyodide.js');
    return window.loadPyodide({ indexURL: PYODIDE_URL });
  })().catch((error) => {
    pyodidePromise = null;
    throw error;
  });
  return pyodidePromise;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
}

function normalizePath(path) {
  const value = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!value || value.includes('..')) return null;
  return value;
}

function clip(text, limit = MAX_TOOL_RESULT) {
  const value = String(text ?? '');
  if (value.length <= limit) return value;
  return value.slice(0, limit) + '\n… [truncated ' + (value.length - limit) + ' characters]';
}

function humanBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function createToolRuntime({ store, onEvent = () => {}, askUser = null, cloud = true } = {}) {
  const runner = createRunner({ timeoutMs: 8000 });

  const cloudPath = (path) => `~/WorkBuddy/${store.project.id}/${path}`;

  /** Mirror a generated file into the user's real Puter cloud drive (best effort). */
  async function syncToPuter(path, content) {
    if (!cloud) return;
    const puter = window.puter;
    if (!puter?.fs || !puter?.auth?.isSignedIn?.()) return;
    try {
      await puter.fs.write(cloudPath(path), content, { createMissingParents: true });
    } catch (error) {
      console.warn('Puter FS mirror failed for', path, error);
    }
  }

  /** Put the agent's files on disk in a temporary folder and return them. */
  function projectSnapshot() {
    const files = store.project.files;
    return Object.keys(files)
      .sort()
      .map((path) => ({ path, bytes: (files[path]?.content ?? '').length }));
  }

  const handlers = {
    list_files() {
      const files = projectSnapshot();
      if (!files.length) return { ok: true, summary: 'The project is empty. Create files with write_file.' };
      const lines = files.map((f) => `${f.path} (${humanBytes(f.bytes)})`);
      return { ok: true, summary: `${files.length} file(s):\n${lines.join('\n')}` };
    },

    read_file(input) {
      const path = normalizePath(input.path);
      if (!path) return { ok: false, summary: 'Invalid path.' };
      const content = store.readFile(path);
      if (content === null) {
        const files = projectSnapshot().map((f) => f.path);
        return {
          ok: false,
          summary: `File not found: ${path}\nAvailable files: ${files.length ? files.join(', ') : '(none)'}`,
        };
      }
      const all = content.split('\n');
      const start = Math.max(1, Number(input.start_line) || 1);
      const end = Math.min(all.length, Number(input.end_line) || all.length);
      const slice = all.slice(start - 1, end).join('\n');
      const header = `File: ${path} (lines ${start}-${end} of ${all.length})\n`;
      return {
        ok: true,
        summary: clip(header + '```\n' + slice + '\n```'),
        ui: { path, content, start, end, total: all.length },
      };
    },

    async write_file(input) {
      const path = normalizePath(input.path);
      if (!path) return { ok: false, summary: 'Invalid path.' };
      if (typeof input.content !== 'string') return { ok: false, summary: 'content must be a string.' };
      const before = store.readFile(path);
      store.writeFile(path, input.content);
      await syncToPuter(path, input.content);
      const diff = diffLines(before ?? '', input.content);
      onEvent({
        type: 'file_changed',
        path,
        action: before === null ? 'created' : 'updated',
        before: before ?? '',
        after: input.content,
        added: diff.added,
        removed: diff.removed,
      });
      return {
        ok: true,
        summary: `${before === null ? 'Created' : 'Updated'} ${path} (${diff.added} added, ${diff.removed} removed, ${humanBytes(input.content.length)}).`,
        ui: { path, before: before ?? '', after: input.content, diff: { added: diff.added, removed: diff.removed }, action: before === null ? 'created' : 'updated' },
      };
    },

    async edit_file(input) {
      const path = normalizePath(input.path);
      if (!path) return { ok: false, summary: 'Invalid path.' };
      const before = store.readFile(path);
      if (before === null) return { ok: false, summary: `File not found: ${path}. Use write_file to create it.` };
      const oldString = String(input.old_string ?? '');
      const newString = String(input.new_string ?? '');
      if (!oldString) return { ok: false, summary: 'old_string must not be empty.' };
      const occurrences = before.split(oldString).length - 1;
      let after;
      if (occurrences === 0) {
        return {
          ok: false,
          summary: `old_string was not found verbatim in ${path}. Read the file again and copy the exact snippet, including indentation.`,
        };
      }
      if (occurrences > 1 && !input.replace_all) {
        return {
          ok: false,
          summary: `old_string appears ${occurrences} times in ${path}. Add surrounding lines to make it unique, or pass replace_all: true.`,
        };
      }
      after = input.replace_all ? before.split(oldString).join(newString) : before.replace(oldString, newString);
      store.writeFile(path, after);
      await syncToPuter(path, after);
      const diff = diffLines(before, after);
      onEvent({ type: 'file_changed', path, action: 'edited', before, after, added: diff.added, removed: diff.removed });
      return {
        ok: true,
        summary: `Edited ${path} (${diff.added} added, ${diff.removed} removed).`,
        ui: { path, before, after, diff: { added: diff.added, removed: diff.removed }, action: 'edited' },
      };
    },

    delete_file(input) {
      const path = normalizePath(input.path);
      if (!path) return { ok: false, summary: 'Invalid path.' };
      if (store.readFile(path) === null) return { ok: false, summary: `File not found: ${path}` };
      store.deleteFile(path);
      onEvent({ type: 'file_deleted', path });
      return { ok: true, summary: `Deleted ${path}.` };
    },

    search_files(input) {
      const query = String(input.query ?? '');
      if (!query) return { ok: false, summary: 'query is required.' };
      let matcher;
      try {
        matcher = input.regex ? new RegExp(query, 'i') : new RegExp(escapeRegExp(query), 'i');
      } catch (error) {
        return { ok: false, summary: `Invalid regular expression: ${error.message}` };
      }
      const prefix = input.path_prefix ? normalizePath(input.path_prefix) : null;
      const hits = [];
      for (const path of store.listFiles()) {
        if (prefix && !path.startsWith(prefix)) continue;
        const lines = (store.readFile(path) ?? '').split('\n');
        lines.forEach((line, index) => {
          if (matcher.test(line) && hits.length < 200) {
            hits.push(`${path}:${index + 1}: ${line.trim().slice(0, 200)}`);
          }
        });
      }
      if (!hits.length) return { ok: true, summary: `No matches for ${JSON.stringify(query)}.` };
      return { ok: true, summary: `${hits.length} match(es):\n${hits.join('\n')}` };
    },
  };

  Object.assign(handlers, {
    async run_javascript(input) {
      const code = String(input.code ?? '');
      if (!code.trim()) return { ok: false, summary: 'code is required.' };
      const result = await runner.run(code);
      const output = formatRunOutput(result);
      return {
        ok: Boolean(result.ok),
        summary: clip('JavaScript ' + (result.ok ? 'output' : 'error') + ':\n' + output),
        ui: { code, output, ok: Boolean(result.ok), ms: result.ms },
      };
    },

    async run_python(input) {
      const code = String(input.code ?? '');
      if (!code.trim()) return { ok: false, summary: 'code is required.' };
      onEvent({ type: 'tool_status', status: 'loading Python runtime…' });
      try {
        const pyodide = await ensurePyodide();
        const pyLogs = [];
        pyodide.setStdout({ batched: (text) => { pyLogs.push(text); } });
        pyodide.setStderr({ batched: (text) => { pyLogs.push(text); } });
        const value = await pyodide.runPythonAsync(code);
        if (value !== undefined && value !== null && String(value) !== 'None') pyLogs.push(String(value));
        const output = pyLogs.join('\n') || '(no output)';
        return { ok: true, summary: clip('Python output:\n' + output), ui: { code, output, ok: true } };
      } catch (error) {
        const message = String(error?.message ?? error);
        return { ok: false, summary: 'Python error: ' + clip(message, 4000), ui: { code, output: message, ok: false } };
      }
    },

    preview_html(input) {
      const path = input.path ? normalizePath(input.path) : null;
      const html = input.html ?? (path ? store.readFile(path) : null);
      if (!html) {
        return {
          ok: false,
          summary: path ? `No HTML found at ${path}. Create it first.` : 'Pass either path or html.',
        };
      }
      onEvent({ type: 'preview', path, html });
      return { ok: true, summary: `Preview updated${path ? ' from ' + path : ''}. The user can see it in the Preview tab.` };
    },

    async fetch_url(input) {
      const url = String(input.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, summary: 'Only http(s) URLs are supported.' };
      const limit = Math.min(60000, Math.max(1000, Number(input.max_chars) || 12000));
      try {
        const puter = window.puter;
        const response = await (puter?.net?.fetch ? puter.net.fetch(url) : fetch(url));
        const body = await response.text();
        const contentType = response.headers?.get?.('content-type') ?? '';
        const text = /html/i.test(contentType) ? htmlToText(body) : body;
        return {
          ok: true,
          summary: clip(`Fetched ${url} (${response.status})\n\n${text.slice(0, limit)}`),
          ui: { url, status: response.status, chars: text.length },
        };
      } catch (error) {
        return { ok: false, summary: `Fetch failed: ${error?.message ?? error}` };
      }
    },

    update_plan(input) {
      const tasks = Array.isArray(input.tasks) ? input.tasks : [];
      store.setPlan(tasks.map((t) => ({ title: String(t.title ?? ''), status: String(t.status ?? 'pending') })));
      const rendered = tasks.map((t) => `${t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'} ${t.title}`);
      return { ok: true, summary: `Plan updated (${tasks.length} tasks):\n${rendered.join('\n')}` };
    },

    remember(input) {
      store.addMemory(String(input.fact ?? ''));
      return { ok: true, summary: `Remembered: ${input.fact}` };
    },

    async ask_user(input) {
      const question = String(input.question ?? '');
      if (!askUser) return { ok: true, summary: `Question for the user: ${question}` };
      const answer = await askUser(question);
      return { ok: true, summary: `User answered: ${answer || '(no answer)'}`, ui: { question, answer }, pause: true };
    },

    finish(input) {
      return { ok: true, summary: `Task finished: ${input.summary ?? ''}`, ui: { summary: input.summary, files: input.files ?? [] }, done: true };
    },
  });

  /**
   * Execute a tool call. Never throws: failures are returned to the model as
   * text so it can repair its own mistake.
   */
  async function execute(name, input = {}) {
    const handler = handlers[name];
    const started = performance.now();
    onEvent({ type: 'tool_start', name, input });
    if (!handler) {
      const summary = `Unknown tool: ${name}. Available tools: ${Object.keys(handlers).join(', ')}.`;
      onEvent({ type: 'tool_end', name, ok: false, summary, ms: 0 });
      return { ok: false, summary };
    }
    try {
      const result = (await handler(input ?? {})) ?? { ok: true, summary: 'ok' };
      const ms = Math.round(performance.now() - started);
      onEvent({ type: 'tool_end', name, ok: result.ok !== false, summary: result.summary, ms, ui: result.ui, done: result.done });
      return { ...result, ms };
    } catch (error) {
      const summary = `Tool ${name} crashed: ${error?.message ?? error}`;
      onEvent({ type: 'tool_end', name, ok: false, summary, ms: Math.round(performance.now() - started) });
      return { ok: false, summary };
    }
  }

  return {
    execute,
    specs: ALL_TOOL_SPECS,
    dispose: () => runner.dispose(),
  };
}
