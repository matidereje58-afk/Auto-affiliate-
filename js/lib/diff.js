/**
 * Tiny line-diff used to render edit previews in the transcript and to build
 * the human-readable summary a tool returns to the model.
 */

function lcsMatrix(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = new Uint32Array(rows * cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      matrix[i * cols + j] = a[i - 1] === b[j - 1]
        ? matrix[(i - 1) * cols + (j - 1)] + 1
        : Math.max(matrix[(i - 1) * cols + j], matrix[i * cols + (j - 1)]);
    }
  }
  return { matrix, cols };
}

/**
 * Diff two strings line by line.
 * @returns {{lines: {type:'add'|'del'|'ctx', text:string, oldLine:number|null, newLine:number|null}[],
 *            added:number, removed:number, unified:string}}
 */
export function diffLines(before, after, { context = 3, maxLines = 4000 } = {}) {
  const split = (value) => (String(value ?? '') === '' ? [] : String(value).split('\n'));
  const a = split(before);
  const b = split(after);
  if (a.length > maxLines || b.length > maxLines) {
    return {
      lines: [{ type: 'ctx', text: '(diff skipped: file too large)', oldLine: null, newLine: null }],
      added: 0,
      removed: 0,
      unified: '(diff skipped: file too large)',
    };
  }
  const { matrix, cols } = lcsMatrix(a, b);
  const ops = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'ctx', text: a[i - 1], oldLine: i, newLine: j });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || matrix[i * cols + (j - 1)] >= matrix[(i - 1) * cols + j])) {
      ops.push({ type: 'add', text: b[j - 1], oldLine: null, newLine: j });
      j -= 1;
    } else if (i > 0) {
      ops.push({ type: 'del', text: a[i - 1], oldLine: i, newLine: null });
      i -= 1;
    }
  }
  ops.reverse();
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'add') added += 1;
    if (op.type === 'del') removed += 1;
  }
  const keep = new Set();
  ops.forEach((op, index) => {
    if (op.type === 'ctx') return;
    for (let k = Math.max(0, index - context); k <= Math.min(ops.length - 1, index + context); k += 1) {
      keep.add(k);
    }
  });
  const compact = ops.filter((op, index) => keep.has(index));
  const unified = compact
    .map((op) => `${op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' '}${op.text}`)
    .join('\n');
  return { lines: ops, added, removed, unified };
}

/** Short "+12 −3" summary. */
export function diffStat(before, after) {
  const { added, removed } = diffLines(before, after);
  return { added, removed };
}

/** Render a unified diff (with hunk separators) for the UI. */
export function renderDiff(before, after) {
  const { lines, added, removed } = diffLines(before, after);
  const html = [];
  let lastShown = -2;
  lines.forEach((line, index) => {
    if (line.type === 'ctx') {
      if (index - lastShown > 6) {
        if (lastShown !== -2) html.push('<div class="diff-gap">…</div>');
      } else {
        html.push(`<div class="diff-line ctx">${escapeLine(line.text)}</div>`);
      }
      lastShown = index;
      return;
    }
    html.push(
      `<div class="diff-line ${line.type}"><span class="diff-sign">${line.type === 'add' ? '+' : '−'}</span>${escapeLine(line.text)}</div>`,
    );
    lastShown = index;
  });
  return { html: html.join(''), added, removed };
}

function escapeLine(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
