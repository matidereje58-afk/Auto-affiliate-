/**
 * Minimal, dependency-free and XSS-safe Markdown renderer.
 * Everything is HTML-escaped first; only a small, known set of tags is emitted.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i;

function safeUrl(url) {
  const value = String(url ?? '').trim();
  return SAFE_URL.test(value) ? escapeHtml(value) : '#';
}

function inline(text) {
  let out = escapeHtml(text);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code class="inline-code">${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${safeUrl(src)}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|\s)__([^_]+)__/g, '$1<strong>$2</strong>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function renderTable(rows) {
  const parse = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = parse(rows[0]);
  const body = rows.slice(2).map(parse);
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((cells) => `<tr>${head.map((_, i) => `<td>${inline(cells[i] ?? '')}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function isTableRow(line) {
  return /\|/.test(line) && /^\s*\|?.+\|.+\|?\s*$/.test(line);
}


/**
 * Render markdown to HTML.
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  const listStack = [];

  const closeLists = (toDepth = 0) => {
    while (listStack.length > toDepth) {
      html.push(listStack.pop().type === 'ol' ? '</ol>' : '</ul>');
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // --- fenced code ---
    const fence = line.match(/^\s*(```|~~~)([^\s`]*)\s*$/);
    if (fence) {
      closeLists();
      const marker = fence[1];
      const lang = fence[2] || 'text';
      const buffer = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = buffer.join('\n');
      html.push(
        `<div class="code-block" data-lang="${escapeHtml(lang)}">` +
          `<div class="code-head"><span class="code-lang">${escapeHtml(lang)}</span>` +
          `<button class="code-copy" type="button" data-copy="${escapeHtml(code)}">Copy</button></div>` +
          `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre></div>`,
      );
      continue;
    }

    // --- table ---
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      closeLists();
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      if (rows.length >= 2) html.push(renderTable(rows));
      continue;
    }

    // --- headings ---
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = Math.min(6, heading[1].length);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // --- horizontal rule ---
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeLists();
      html.push('<hr>');
      i += 1;
      continue;
    }

    // --- blockquote ---
    if (/^\s*>\s?/.test(line)) {
      closeLists();
      const buffer = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderMarkdown(buffer.join('\n'))}</blockquote>`);
      continue;
    }

    // --- lists ---
    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const indent = item[1].replace(/\t/g, '  ').length;
      const depth = Math.floor(indent / 2) + 1;
      const type = /\d/.test(item[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) {
        html.push(listStack.pop().type === 'ol' ? '</ol>' : '</ul>');
      }
      if (listStack.length < depth) {
        html.push(type === 'ol' ? '<ol>' : '<ul>');
        listStack.push({ type });
      } else if (listStack[listStack.length - 1].type !== type) {
        html.push(listStack.pop().type === 'ol' ? '</ol>' : '</ul>');
        html.push(type === 'ol' ? '<ol>' : '<ul>');
        listStack.push({ type });
      }
      const task = item[3].match(/^\[( |x|X)\]\s+(.*)$/);
      if (task) {
        const checked = task[1].toLowerCase() === 'x';
        html.push(`<li class="task-item"><input type="checkbox" disabled ${checked ? 'checked' : ''}> ${inline(task[2])}</li>`);
      } else {
        html.push(`<li>${inline(item[3])}</li>`);
      }
      i += 1;
      continue;
    }
    closeLists();

    // --- blank line ---
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // --- paragraph ---
    const buffer = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i])) {
      buffer.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${buffer.map(inline).join('<br>')}</p>`);
  }
  closeLists();
  return html.join('');
}

/** Markdown → plain text (titles, notifications, token estimates). */
export function markdownToText(source) {
  return String(source ?? '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ''))
    .replace(/[`*_~#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
