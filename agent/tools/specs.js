// JSON-schema tool definitions handed to the model.

export const TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'run_python',
      description:
        'Execute Python in a persistent WebAssembly sandbox (numpy/pandas/matplotlib/scipy/sklearn auto-install on first import, ' +
        'top-level await supported). Variables persist between calls. Output is captured; use print() to see values. ' +
        'Files written to /workspace (or via write_file()) appear in the shared workspace. Matplotlib figures are auto-saved as PNG.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python source to execute.' },
          timeout_s: { type: 'number', description: 'Optional time limit in seconds (default 90, max 600).' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_javascript',
      description:
        'Execute JavaScript in a persistent worker (async scope, top-level await supported). console.log output is captured. ' +
        'Helpers: writeFile(path, text), readFile(path), listFiles(), sleep(ms), fetchText(url), fetchJson(url), env().',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript source to execute.' },
          timeout_s: { type: 'number', description: 'Optional time limit in seconds (default 30, max 300).' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the shared workspace with sizes and modification times.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Optional subdirectory or prefix filter.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a workspace file as text. Use start_line/end_line for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'number' },
          end_line: { type: 'number' },
          max_chars: { type: 'number', description: 'Cap the returned characters (default 40000).' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a workspace file with text content. Parent folders are created automatically.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: 'Append text to a workspace file (creates it if missing).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a workspace file.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search the text of all workspace files for a string or regular expression (case-insensitive).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          regex: { type: 'boolean', description: 'Treat query as a regular expression.' },
          max_results: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the live web and get result titles, URLs and snippets. Use this to discover sources, then fetch_url the best ones.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_results: { type: 'number', description: 'default 8, max 15' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description:
        'Fetch a URL and return its content. format="markdown" (default) strips boilerplate for reading; "text" is raw text; ' +
        '"html" returns source. PDFs are converted to text automatically.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          format: { type: 'string', enum: ['markdown', 'text', 'html'] },
          max_chars: { type: 'number', description: 'default 30000, max 120000' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia',
      description: 'Look up a topic on Wikipedia and return the summary + key sections (fast, reliable, no scraping).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, sentences: { type: 'number' } },
        required: ['query'],
      },
    },
  },
];
TOOL_SPECS.push(
  {
    type: 'function',
    function: {
      name: 'create_artifact',
      description:
        'Deliver a finished, viewable artifact. For HTML, pass the full document — it is rendered live in a sandboxed preview ' +
        'panel the user can open full-screen. Also writes the file to the workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'File name, e.g. report.html or dashboard.html' },
          content: { type: 'string', description: 'File content (HTML for interactive artifacts, markdown/text otherwise)' },
          title: { type: 'string', description: 'Human-readable title for the artifact card' },
        },
        required: ['name', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'todo_write',
      description:
        'Publish/replace your task plan for the current request. Call it at the start of multi-step work and again whenever a step ' +
        'changes state. Statuses: pending, in_progress, completed.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
              required: ['text', 'status'],
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
      name: 'memory',
      description:
        'Persistent key/value memory stored on the user device, loaded automatically at the start of every future session. ' +
        'Use it for durable facts (user preferences, project details, ongoing goals).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['set', 'get', 'list', 'delete'] },
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        'Delegate one self-contained task to a fresh sub-agent with its own context and the same sandbox/tools (no nesting). ' +
        'Returns only its final report. Great for research, parallel exploration, or long side-quests.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Complete, standalone instructions including the expected output format.' },
          max_steps: { type: 'number', description: 'Tool-call budget for the sub-agent (default 12, max 30).' },
        },
        required: ['task'],
      },
    },
  }
);

export const TOOL_NAMES = TOOL_SPECS.map((t) => t.function.name);
