// Web access tools: search, page fetch (with reader fallbacks), Wikipedia, PDF text.

const READERS = [
  { name: 'r.jina.ai', url: (u) => `https://r.jina.ai/${u}` },
  { name: 'r.jina.ai-plain', url: (u) => `https://r.jina.ai/${u}`, headers: { 'x-respond-with': 'text' } },
];

const readCache = new Map();

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function unwrapDdg(url) {
  const m = /[?&]uddg=([^&]+)/.exec(url || '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { return url; } }
  return url;
}

/* ---------------------------------------------------------------- search ---- */

async function searchViaReader(query, max) {
  const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await withTimeout(fetch(`https://r.jina.ai/${target}`, { headers: { Accept: 'text/plain' } }), 30000, 'web search');
  if (!res.ok) throw new Error(`search reader HTTP ${res.status}`);
  const md = await res.text();
  const results = [];
  const lines = md.split('\n');
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const h = /^#{2,4}\s+\[(.+?)\]\((\S+?)\)\s*$/.exec(line);
    if (h) {
      if (current && current.url) results.push(current);
      current = { title: decodeEntities(h[1]).replace(/[*_`]/g, ''), url: unwrapDdg(h[2]), snippet: '' };
      continue;
    }
    if (current && !current.snippet) {
      const p = /^\[([^\]]{25,})\]\((\S+?)\)\s*$/.exec(line);
      const text = p ? p[1] : (/^[^[\]()|#]/.test(line) ? line : '');
      if (text && !/^!\[|^Image \d/.test(text)) {
        current.snippet = decodeEntities(text).replace(/\*/g, '').slice(0, 320);
      }
    }
    if (results.length >= max) break;
  }
  if (current && current.url) results.push(current);
  return results.filter((r) => r.url && !/duckduckgo\.com\/(html|l\/)/.test(r.url)).slice(0, max);
}

async function searchViaInstantAnswer(query, max) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
  const res = await withTimeout(fetch(url), 15000, 'instant answer');
  if (!res.ok) throw new Error(`instant answer HTTP ${res.status}`);
  const j = await res.json();
  const out = [];
  if (j.AbstractText && j.AbstractURL) out.push({ title: j.Heading || query, url: j.AbstractURL, snippet: j.AbstractText });
  const walk = (topics) => {
    for (const t of topics || []) {
      if (out.length >= max) return;
      if (t.Topics) walk(t.Topics);
      else if (t.FirstURL && t.Text) out.push({ title: t.Text.split(' - ')[0], url: t.FirstURL, snippet: t.Text });
    }
  };
  walk(j.RelatedTopics);
  return out.slice(0, max);
}

async function searchWikipedia(query, max) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${max}&format=json&origin=*`;
  const res = await withTimeout(fetch(url), 15000, 'wikipedia search');
  if (!res.ok) throw new Error(`wikipedia search HTTP ${res.status}`);
  const j = await res.json();
  return (j.query?.search || []).map((s) => ({
    title: s.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
    snippet: decodeEntities(String(s.snippet || '').replace(/<[^>]*>/g, '')),
  }));
}

export async function webSearch({ query, max_results = 8 }) {
  const max = Math.max(1, Math.min(Number(max_results) || 8, 15));
  const providers = [
    ['duckduckgo', () => searchViaReader(query, max)],
    ['duckduckgo-instant', () => searchViaInstantAnswer(query, max)],
    ['wikipedia', () => searchWikipedia(query, max)],
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const results = await fn();
      if (results.length) return { provider: name, query, count: results.length, results, errors: errors.length ? errors : undefined };
      errors.push(`${name}: no results`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  return { provider: null, query, count: 0, results: [], errors };
}

export function formatSearchResults(payload) {
  if (!payload.results?.length) {
    return `No results for "${payload.query}". Tried: ${(payload.errors || []).join('; ')}`;
  }
  const lines = [`Search provider: ${payload.provider} — ${payload.count} result(s) for "${payload.query}"`, ''];
  payload.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet.replace(/\s+/g, ' ').trim()}`);
  });
  if (payload.errors?.length) lines.push('', `Note: ${payload.errors.join('; ')}`);
  return lines.join('\n');
}
/* ------------------------------------------------------------- fetch_url ---- */

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

async function pdfToText(url, maxChars) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, 60);
  const chunks = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    chunks.push(`--- page ${i} ---\n` + content.items.map((it) => it.str).join(' '));
    if (chunks.join('\n').length > maxChars) break;
  }
  return { text: chunks.join('\n\n').slice(0, maxChars), pages: doc.numPages };
}

export async function fetchUrl({ url, format = 'markdown', max_chars = 30000 }) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error('url must start with http:// or https://');
  const maxChars = Math.max(1000, Math.min(Number(max_chars) || 30000, 120000));
  const cacheKey = `${url}::${format}`;
  const cached = readCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 120000) return { ...cached.value, cached: true };

  const attempts = [];

  // 1. Reader proxy first for markdown (renders JS-heavy pages, strips boilerplate).
  if (format === 'markdown') {
    for (const reader of READERS) {
      try {
        const res = await withTimeout(fetch(reader.url(url), { headers: reader.headers || {} }), 35000, `reader ${reader.name}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let text = await res.text();
        text = text.replace(/^Title:.*\n/, '').replace(/^URL Source:.*\n/, '').replace(/^Markdown Content:\s*\n/, '');
        if (text.trim().length < 60) throw new Error('empty reader response');
        const value = { url, format, content: text.slice(0, maxChars), truncated: text.length > maxChars, source: `reader:${reader.name}` };
        readCache.set(cacheKey, { at: Date.now(), value });
        return value;
      } catch (e) { attempts.push(`${reader.name}: ${e.message}`); }
    }
  }

  // 2. Direct fetch (CORS-enabled sites, JSON APIs, PDFs).
  try {
    const res = await withTimeout(fetch(url, { redirect: 'follow' }), 25000, 'fetch');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (/pdf/i.test(ct) || /\.pdf($|\?)/i.test(url)) {
      const pdf = await pdfToText(url, maxChars);
      const value = { url, format: 'text', contentType: 'application/pdf', pages: pdf.pages, content: pdf.text, source: 'direct' };
      readCache.set(cacheKey, { at: Date.now(), value });
      return value;
    }
    const raw = await res.text();
    const isHtml = /html/i.test(ct) || /^\s*<(!doctype|html)/i.test(raw);
    const content = format === 'html' ? raw : (isHtml ? htmlToText(raw) : raw);
    if (content.trim().length < 40 && format !== 'html') throw new Error(`blocked or empty response (${raw.length} bytes)`);
    const value = {
      url, format, contentType: ct,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
      source: 'direct',
    };
    readCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (e) { attempts.push(`direct: ${e.message}`); }

  // 3. Last resort: reader as plain text.
  for (const reader of READERS) {
    try {
      const res = await withTimeout(fetch(reader.url(url), { headers: reader.headers || {} }), 35000, `reader ${reader.name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      if (format === 'text') text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#]{1,3}/g, '');
      if (text.trim().length < 40) throw new Error('empty reader response');
      const value = { url, format, content: text.slice(0, maxChars), truncated: text.length > maxChars, source: `reader:${reader.name}` };
      readCache.set(cacheKey, { at: Date.now(), value });
      return value;
    } catch (e) { attempts.push(`${reader.name}(text): ${e.message}`); }
  }

  throw new Error(`Could not fetch ${url}. Attempts — ${attempts.join(' | ')}`);
}
/* -------------------------------------------------------------- wikipedia --- */

export async function wikipedia({ query, sentences = 8 }) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
  const sres = await withTimeout(fetch(searchUrl), 15000, 'wikipedia search');
  const sj = await sres.json();
  const hit = sj.query?.search?.[0];
  if (!hit) return { found: false, query };

  const title = hit.title;
  let extract = '';
  try {
    const exUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exlimit=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const eres = await withTimeout(fetch(exUrl), 20000, 'wikipedia extract');
    const ej = await eres.json();
    const page = Object.values(ej.query?.pages || {})[0];
    extract = page?.extract || '';
  } catch { /* summary only */ }

  let summary = '';
  try {
    const name = encodeURIComponent(title.replace(/ /g, '_'));
    const rres = await withTimeout(fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${name}`), 15000, 'wikipedia summary');
    const rj = await rres.json();
    summary = rj.extract || '';
  } catch { /* ignore */ }

  const parts = String(extract).split(/(?<=[.!?])\s+/);
  const intro = parts.slice(0, Math.max(1, Math.min(Number(sentences) || 8, 25))).join(' ');
  const sections = [...String(extract).matchAll(/^(=+)\s*(.+?)\s*\1$/gm)].map((m) => m[2]).slice(0, 25);

  return {
    found: true,
    title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    summary: summary || intro,
    intro: intro.slice(0, 4000),
    sections,
    fullTextChars: extract.length,
  };
}
