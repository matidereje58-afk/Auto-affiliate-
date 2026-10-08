// Markdown rendering: marked (from CDN) + DOMPurify sanitising + highlight.js.

const markedReady = () => typeof window.marked !== 'undefined';
const purifyReady = () => typeof window.DOMPurify !== 'undefined';

let configured = false;

function configure() {
  if (configured || !markedReady()) return;
  window.marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });
  configured = true;
}

export function renderMarkdown(text) {
  const src = String(text ?? '');
  if (!src.trim()) return '';
  try {
    configure();
    let html = markedReady() ? window.marked.parse(src) : escapeAndParagraph(src);
    if (purifyReady()) {
      html = window.DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style', 'form', 'input', 'iframe'],
      });
    }
    return html;
  } catch (e) {
    console.warn('markdown render failed', e);
    return escapeAndParagraph(src);
  }
}

function escapeAndParagraph(src) {
  const esc = src.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<p>${esc.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

export function highlightWithin(root) {
  if (typeof window.hljs === 'undefined' || !root) return;
  root.querySelectorAll('pre code').forEach((block) => {
    if (block.dataset.highlighted === 'yes') return;
    try {
      window.hljs.highlightElement(block);
      block.dataset.highlighted = 'yes';
    } catch { /* ignore */ }
  });
}

export function enhanceLinks(root) {
  root.querySelectorAll('.msg-body a[href]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noreferrer noopener');
  });
}

/** Small helper for the copy buttons on code blocks. */
export function attachCopyButtons(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-code')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-code';
    btn.type = 'button';
    btn.textContent = 'copy';
    btn.style.cssText = 'position:absolute;top:6px;right:6px;font-size:11px;padding:2px 7px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text-dim);cursor:pointer;';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code')?.innerText ?? pre.innerText;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'copied';
      } catch { btn.textContent = 'failed'; }
      setTimeout(() => { btn.textContent = 'copy'; }, 1400);
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

/** Lightweight inline markdown for tool call arguments / short strings. */
export function oneLine(text, max = 140) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}