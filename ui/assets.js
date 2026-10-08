// Makes workspace-produced HTML self-contained enough to preview in a sandboxed iframe:
// local file references (e.g. src="chart_1.png") are rewritten to blob URLs of the real files.

import { vfs } from '../lib/vfs.js';
import { basename, isImagePath } from '../lib/util.js';

const ASSET_RE = /(src|href|poster|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Rewrite references to workspace files inside an HTML document and inject a <base target="_blank">.
 * Returns { html, urls } — urls must be revoked by the caller when the preview closes.
 */
export async function prepareHtmlPreview(html, currentPath) {
  const files = await vfs.list();
  const urls = [];
  const sources = files.filter((f) => isImagePath(f.path) || /\.(css|js)$/i.test(f.path));

  const byName = new Map();
  for (const f of sources) {
    const rec = await vfs.read(f.path);
    if (!rec) continue;
    const url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
    urls.push(url);
    const bare = basename(f.path);
    byName.set(bare, url);
    byName.set(f.path, url);
    byName.set('./' + bare, url);
    byName.set('/workspace/' + f.path, url);
  }

  let out = String(html ?? '');
  out = out.replace(ASSET_RE, (match, attr, dq, sq) => {
    const ref = String(dq ?? sq ?? '').trim();
    if (!ref || /^(https?:|data:|blob:|mailto:|#|\/\/)/i.test(ref)) return match;
    const key = ref.replace(/^\.\//, '');
    const url = byName.get(ref) || byName.get(key) || byName.get(basename(key));
    if (!url) return match;
    return `${attr}="${url}"`;
  });

  if (!/<base\s/i.test(out)) {
    out = out.includes('<head') ? out.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">')
      : `<!DOCTYPE html><html><head><base target="_blank"></head><body>${out}</body></html>`;
  }
  return { html: out, urls };
}