// Small shared helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtBytes(n) {
  if (n === null || n === undefined) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

export function fmtDuration(ms) {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

export function truncate(str, max = 4000, note = '…[truncated]') {
  str = typeof str === 'string' ? str : String(str ?? '');
  if (str.length <= max) return str;
  return str.slice(0, max) + '\n' + note;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function basename(p) { return String(p).split('/').filter(Boolean).pop() || p; }

export function dirname(p) {
  const parts = String(p).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

/** Normalize a workspace path: strip leading slashes, reject traversal. */
export function normPath(p) {
  let s = String(p ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const out = [];
  for (const part of s.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part.replace(/[\u0000-\u001f]/g, '_'));
  }
  return out.join('/') || 'file';
}

export const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'xml', 'svg', 'sh', 'bash', 'sql', 'r', 'rb', 'go',
  'java', 'c', 'h', 'cpp', 'hpp', 'rs', 'php', 'tex', 'bib', 'env', 'gitignore', 'vtt', 'srt']);

export function isTextPath(p) { return TEXT_EXT.has(extname(p)); }

export function mimeFor(p) {
  const e = extname(p);
  const map = {
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
    json: 'application/json', csv: 'text/csv', md: 'text/markdown', txt: 'text/plain', xml: 'application/xml',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', zip: 'application/zip', py: 'text/x-python', yml: 'text/yaml', yaml: 'text/yaml',
  };
  return map[e] || 'application/octet-stream';
}

export const isImagePath = (p) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extname(p));

/** Tolerant JSON parse for tool arguments produced by an LLM. */
export function parseLooseJson(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'object') return raw;
  let s = String(raw).trim();
  if (!s) return {};
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch {}
  // Extract first balanced object/array
  const start = s.search(/[{[]/);
  if (start > 0) {
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) { s = s.slice(start, i + 1); break; } }
    }
  }
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')); } catch {}
  return { _raw: raw };
}

/** Rough token estimate: ~4 chars per token. */
export const estTokens = (text) => Math.ceil(String(text ?? '').length / 4);