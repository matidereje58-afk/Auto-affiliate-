/* Python sandbox worker — CPython compiled to WebAssembly via Pyodide.
 * A persistent interpreter session shared with the workspace filesystem.
 */

const PYODIDE_VERSION = '0.27.4';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodide = null;
let ns = null;
let booting = null;

const PREAMBLE = String.raw`
import sys, os, io, json, base64, time, traceback
WORKSPACE = '/workspace'
os.makedirs(WORKSPACE, exist_ok=True)
_MAX_OUT = 200000

class _Cap(io.TextIOBase):
    def __init__(self):
        self._buf, self._len, self.truncated = [], 0, False
    def write(self, s):
        if self._len < _MAX_OUT:
            self._buf.append(s); self._len += len(s)
            if self._len > _MAX_OUT:
                self.truncated = True
        else:
            self.truncated = True
        return len(s)
    def flush(self): pass
    def getvalue(self): return ''.join(self._buf)
    def isatty(self): return False

_stdout, _stderr = _Cap(), _Cap()
_orig_stdout, _orig_stderr = sys.stdout, sys.stderr

def _begin():
    _stdout._buf, _stdout._len, _stdout.truncated = [], 0, False
    _stderr._buf, _stderr._len, _stderr.truncated = [], 0, False
    sys.stdout, sys.stderr = _stdout, _stderr
    globals()['_t0'] = time.time()

def _end():
    sys.stdout, sys.stderr = _orig_stdout, _orig_stderr
    return json.dumps({
        'stdout': _stdout.getvalue(),
        'stderr': _stderr.getvalue(),
        'truncated': _stdout.truncated or _stderr.truncated,
    })

# ---------- workspace helpers ----------
def _wp(path):
    p = os.path.normpath(os.path.join(WORKSPACE, str(path).lstrip('/')))
    if not p.startswith(WORKSPACE):
        raise ValueError('path escapes the workspace: ' + str(path))
    return p

def write_file(path, content, mode='w'):
    p = _wp(path)
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    if isinstance(content, (bytes, bytearray)):
        with open(p, 'wb') as f:
            f.write(bytes(content))
    else:
        with open(p, mode, encoding='utf-8') as f:
            f.write(content)
    return p

def read_file(path, mode='r'):
    with open(_wp(path), mode, encoding=None if 'b' in mode else 'utf-8') as f:
        return f.read()

def list_files(sub=''):
    root = _wp(sub) if sub else WORKSPACE
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('__pycache__', '.ipynb_checkpoints')]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            out.append(os.path.relpath(full, WORKSPACE))
    return sorted(out)

def _atria_manifest():
    m = {}
    for rel in list_files():
        try:
            st = os.stat(_wp(rel))
            m[rel] = [st.st_size, int(st.st_mtime_ns)]
        except OSError:
            pass
    return m

_manifest = _atria_manifest()
_CHART_N = [0]

def _atria_changed():
    global _manifest
    cur = _atria_manifest()
    changed = []
    for rel, sig in cur.items():
        if _manifest.get(rel) != sig:
            full = _wp(rel)
            size = sig[0]
            if size > 6000000:
                changed.append({'path': rel, 'skip': 'file too large to mirror (%d bytes)' % size})
                continue
            try:
                with open(full, 'rb') as f:
                    raw = f.read()
                try:
                    text = raw.decode('utf-8')
                    if '\x00' in text:
                        raise ValueError('binary')
                    changed.append({'path': rel, 'text': text})
                except (UnicodeDecodeError, ValueError):
                    changed.append({'path': rel, 'b64': base64.b64encode(raw).decode('ascii')})
            except OSError as e:
                changed.append({'path': rel, 'skip': str(e)})
    removed = [p for p in _manifest if p not in cur]
    _manifest = cur
    return {'changed': changed, 'removed': removed}

def _atria_save_figures():
    """Persist any open matplotlib figures into the workspace."""
    saved = []
    if 'matplotlib.pyplot' in sys.modules:
        try:
            import matplotlib
            matplotlib.use('Agg', force=True)
            import matplotlib.pyplot as plt
            for num in list(plt.get_fignums()):
                fig = plt.figure(num)
                _CHART_N[0] += 1
                name = 'chart_%d.png' % _CHART_N[0]
                fig.savefig(os.path.join(WORKSPACE, name), dpi=120, bbox_inches='tight')
                saved.append(name)
                plt.close(fig)
        except Exception as e:
            _stderr.write('chart export failed: %r\n' % (e,))
    return saved
`;

const PREAMBLE2 = String.raw`
# ---------- network (async) ----------
class _Net:
    """Async HTTP helpers. Use with top-level await, e.g.  text = await agent_net.get(url)"""
    async def get(self, url, headers=None):
        from pyodide.http import pyfetch
        r = await pyfetch(url, headers=headers or {})
        return await r.string()
    async def get_json(self, url, headers=None):
        return json.loads(await self.get(url, headers=headers))
    async def post(self, url, data=None, headers=None):
        from pyodide.http import pyfetch
        r = await pyfetch(url, method='POST', body=data, headers=headers or {})
        return await r.string()

agent_net = _Net()

# ---------- auto-install third-party imports ----------
_PKG_MAP = {
    'numpy': 'numpy', 'pandas': 'pandas', 'matplotlib': 'matplotlib', 'scipy': 'scipy',
    'sklearn': 'scikit-learn', 'sympy': 'sympy', 'networkx': 'networkx', 'PIL': 'pillow',
    'statsmodels': 'statsmodels', 'seaborn': 'seaborn', 'yaml': 'pyyaml', 'lxml': 'lxml',
    'openpyxl': 'openpyxl', 'bs4': 'beautifulsoup4', 'regex': 'regex', 'dateutil': 'python-dateutil',
    'tabulate': 'tabulate', 'jsonschema': 'jsonschema', 'jinja2': 'jinja2', 'tqdm': 'tqdm',
    'pytz': 'pytz', 'xlsxwriter': 'xlsxwriter', 'sqlalchemy': 'sqlalchemy',
}
_BUILTIN = set(sys.builtin_module_names) | {'sys', 'os', 'io', 'json', 'math', 'random', 're',
    'time', 'datetime', 'collections', 'itertools', 'functools', 'asyncio', 'csv', 'statistics',
    'traceback', 'base64', 'hashlib', 'uuid', 'typing', 'string', 'decimal', 'fractions', 'sqlite3',
    'unittest', 'textwrap', 'pathlib', 'copy', 'pprint', 'zipfile', 'gzip', 'tarfile', 'logging',
    'ast', 'inspect', 'operator', 'bisect', 'heapq', 'difflib', 'dataclasses', 'enum', 'abc',
    'webbrowser', 'platform', 'locale', 'getpass', 'shutil', 'tempfile', 'glob', 'argparse'}

def _atria_imports(code):
    import ast as _ast
    found = set()
    try:
        tree = _ast.parse(code)
    except SyntaxError:
        return []
    for node in _ast.walk(tree):
        if isinstance(node, _ast.Import):
            for a in node.names:
                found.add(a.name.split('.')[0])
        elif isinstance(node, _ast.ImportFrom):
            if node.module and node.level == 0:
                found.add(node.module.split('.')[0])
    todo = []
    for name in sorted(found):
        if name in _BUILTIN or name in sys.modules:
            continue
        pkg = _PKG_MAP.get(name)
        if pkg:
            todo.append(pkg)
    return todo
`;

function boot() {
  if (booting) return booting;
  booting = (async () => {
    importScripts(PYODIDE_URL + 'pyodide.js');
    pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    await pyodide.loadPackage('micropip');
    await pyodide.runPythonAsync(PREAMBLE);
    await pyodide.runPythonAsync(PREAMBLE2);
    pyodide.runPython(`
_agent_ns = {'__name__': '__main__'}
for _k in ('WORKSPACE', 'write_file', 'read_file', 'list_files', 'agent_net', 'json', 'sys', 'os'):
    _agent_ns[_k] = globals()[_k]
`);
    ns = pyodide.globals.get('_agent_ns');
    return pyodide.version;
  })();
  return booting;
}

async function installPackages(packages) {
  const installed = [], failed = [];
  if (!packages || !packages.length) return { installed, failed };
  const micropip = pyodide.pyimport('micropip');
  for (const p of packages) {
    try { await micropip.install(p); installed.push(p); }
    catch (e) { failed.push(`${p}: ${String(e.message || e).slice(0, 160)}`); }
  }
  return { installed, failed };
}

function toArray(proxy) {
  if (!proxy) return [];
  if (Array.isArray(proxy)) return proxy;
  if (typeof proxy.toJs === 'function') return proxy.toJs();
  return proxy;
}

async function run({ code, files }) {
  await boot();
  const t0 = performance.now();

  // 1. Mirror workspace files that changed since the sandbox last saw them.
  for (const f of files || []) {
    const target = '/workspace/' + f.path;
    const dir = target.split('/').slice(0, -1).join('/');
    pyodide.FS.mkdirTree(dir);
    const data = f.b64
      ? Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(f.text ?? '');
    pyodide.FS.writeFile(target, data);
  }

  const notes = [];
  let error = null, errorName = null;

  // 2. Auto-install third-party imports.
  try {
    const needed = toArray(pyodide.runPython('_atria_imports')(code));
    if (needed.length) {
      const res = await installPackages(needed);
      if (res.installed.length) notes.push('pip installed: ' + res.installed.join(', '));
      if (res.failed.length) notes.push('pip failed: ' + res.failed.join(' | '));
    }
  } catch (e) { notes.push('import scan skipped: ' + String(e.message || e).slice(0, 200)); }

  // 3. Execute in the persistent namespace (top-level await supported).
  pyodide.runPython('_begin()');
  let result;
  try {
    result = await pyodide.runPythonAsync(code, { globals: ns });
  } catch (err) {
    errorName = err?.constructor?.name || 'PythonError';
    error = String(err?.message ?? err);
  }
  let charts = [];
  try { charts = toArray(pyodide.runPython('_atria_save_figures()')); } catch { notes.push('chart export error'); }

  let resultRepr = '';
  if (result !== undefined && result !== null && typeof result !== 'function') {
    try { resultRepr = pyodide.runPython('repr')(result) ?? ''; } catch { resultRepr = String(result); }
    try { result?.destroy?.(); } catch {}
  }

  const caps = JSON.parse(pyodide.runPython('_end()'));
  const delta = JSON.parse(pyodide.runPython('json.dumps(_atria_changed())'));

  return {
    stdout: caps.stdout,
    stderr: caps.stderr,
    truncated: caps.truncated,
    error,
    errorName,
    result: resultRepr,
    files: delta.changed,
    removed: delta.removed,
    charts,
    notes,
    durationMs: Math.round(performance.now() - t0),
    vars: safeVars(),
  };
}

function safeVars() {
  try {
    const names = JSON.parse(pyodide.runPython(
      'json.dumps([k for k in list(globals().keys()) if not k.startswith("_") and k not in ("sys","os","io","json","base64","time","traceback")][:300])'
    ));
    return names;
  } catch { return []; }
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  const rid = msg.id;
  try {
    if (msg.type === 'init') {
      const version = await boot();
      self.postMessage({ type: 'ready', id: rid, version });
    } else if (msg.type === 'run') {
      self.postMessage({ type: 'result', id: rid, ...(await run(msg)) });
    } else if (msg.type === 'install') {
      await boot();
      self.postMessage({ type: 'installed', id: rid, ...(await installPackages(msg.packages || [])) });
    } else if (msg.type === 'reset') {
      pyodide.runPython(`
_agent_ns = {'__name__': '__main__'}
for _k in ('WORKSPACE', 'write_file', 'read_file', 'list_files', 'agent_net', 'json', 'sys', 'os'):
    _agent_ns[_k] = globals()[_k]
`);
      ns = pyodide.globals.get('_agent_ns');
      self.postMessage({ type: 'reset', id: rid });
    } else {
      self.postMessage({ type: 'error', id: rid, error: 'unknown message type: ' + msg.type });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: rid, error: String(err?.message ?? err), stack: String(err?.stack || '') });
  }
};
