// Chat rendering helpers.

import { $, el, fmtTime, fmtDuration, fmtBytes, truncate } from '../lib/util.js';
import { renderMarkdown, highlightWithin, enhanceLinks, attachCopyButtons } from './markdown.js';

export const SUGGESTIONS = [
  'Research the latest on a topic and write a sourced brief',
  'Analyse a CSV I attach and chart the key trends',
  'Build an interactive HTML dashboard for this data',
  'Solve a hard maths problem and verify it numerically',
  'Write and test a Python utility, then save it to the workspace',
  'Turn a public page into a clean markdown table',
];

export function scrollToBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

export function oneLine(s, n = 150) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function summarizeArgs(name, args = {}) {
  if (name === 'run_python' || name === 'run_javascript') return oneLine(args.code || '', 110);
  if (name === 'write_file' || name === 'append_file') return `${args.path} (${(args.content || '').length} chars)`;
  if (name === 'fetch_url') return args.url || '';
  if (name === 'web_search') return args.query || '';
  if (name === 'spawn_subagent') return oneLine(args.task || '', 110);
  return Object.entries(args).map(([k, v]) => `${k}=${oneLine(String(v), 50)}`).join(', ');
}

export function renderWelcome(onSuggestion) {
  const box = $('#messages');
  box.innerHTML = '';
  const cards = [
    ['Deep research', 'Searches the live web, reads the sources and writes a cited brief plus an interactive report.'],
    ['Data analysis', 'Runs real Python (pandas, numpy, matplotlib) in your browser on files you attach or URLs you give it.'],
    ['Build & verify', 'Writes code, executes it, checks the output, and iterates until it actually works.'],
    ['Web apps', 'Produces self-contained HTML/CSS/JS artifacts you can preview full-screen and download.'],
  ].map(([t, d], i) => el('button', { class: 'card', onclick: () => onSuggestion(SUGGESTIONS[i]) },
    [el('b', { text: t }), el('span', { text: d })]));

  box.append(el('div', { class: 'welcome' }, [
    el('h1', { text: 'Your own AI agent, running in this tab.' }),
    el('p', {
      html: 'Powered by <b>Atria&nbsp;Dawn&nbsp;Preview</b> (744B MoE, 256K context) with a real sandbox attached: a persistent Python interpreter compiled to WebAssembly, a JavaScript worker, a shared file workspace, and live web access. Nothing to install — the model plans, runs code, reads pages, verifies results and hands you finished files.',
    }),
    el('div', { class: 'cards' }, cards),
  ]));
  renderSuggestions(onSuggestion);
}

export function renderSuggestions(onSuggestion) {
  const box = $('#suggestions');
  box.innerHTML = '';
  for (const s of SUGGESTIONS) {
    box.append(el('button', { class: 'suggestion', text: s, onclick: () => onSuggestion(s) }));
  }
}

export function addUserMessage(text) {
  const msg = el('div', { class: 'msg user' }, [
    el('div', { class: 'msg-head' }, [
      el('span', { class: 'msg-role', text: 'You' }),
      el('span', { class: 'msg-time', text: fmtTime(Date.now()) }),
    ]),
    el('div', { class: 'msg-body' }, [el('div', { style: 'white-space:pre-wrap', text })]),
  ]);
  $('#messages').append(msg);
  scrollToBottom();
  return msg;
}

export function beginTurn() {
  const steps = el('div', { class: 'steps' });
  const root = el('div', { class: 'msg assistant' }, [
    el('div', { class: 'msg-head' }, [
      el('span', { class: 'msg-role', text: 'Atria Agent' }),
      el('span', { class: 'msg-time', text: fmtTime(Date.now()) }),
    ]),
    steps,
  ]);
  $('#messages').append(root);
  scrollToBottom();
  return { root, steps, current: null };
}

export function newStep(turn) {
  const group = el('div', { class: 'step-group' });
  turn.steps.append(group);
  turn.current = { group, contentEl: null, contentBuf: '', lastRender: 0, reasoningEl: null };
  return turn.current;
}

export function addReasoningBlock(turn, text) {
  const cur = turn.current || newStep(turn);
  if (!cur.reasoningEl) {
    const body = el('div', { class: 'r-body' });
    cur.group.append(el('details', { class: 'reasoning', open: true }, [
      el('summary', { text: 'Reasoning' }),
      body,
    ]));
    cur.reasoningEl = body;
  }
  cur.reasoningEl.textContent += text;
  cur.reasoningEl.scrollTop = cur.reasoningEl.scrollHeight;
}

export function addContentBlock(turn, text, { live = false } = {}) {
  const cur = turn.current || newStep(turn);
  if (!cur.contentEl) {
    cur.contentEl = el('div', { class: 'msg-body' });
    cur.group.append(cur.contentEl);
  }
  cur.contentBuf += text;
  if (live) {
    const now = performance.now();
    if (now - cur.lastRender > 150) {
      cur.lastRender = now;
      cur.contentEl.classList.add('streaming');
      cur.contentEl.innerHTML = renderMarkdown(cur.contentBuf);
      scrollToBottom();
    }
  } else {
    cur.contentEl.classList.remove('streaming');
    cur.contentEl.innerHTML = renderMarkdown(cur.contentBuf);
    finalizeMarkdown(cur.contentEl);
  }
  return cur.contentEl;
}

export function finalizeMarkdown(node) {
  if (!node) return;
  highlightWithin(node);
  enhanceLinks(node);
  attachCopyButtons(node);
}
/* ------------------------------------------------------------- tool cards -- */

export function addToolCard(turn, { id, name, args }) {
  const cur = turn.current || newStep(turn);
  const stateEl = el('span', { class: 'tool-state run', text: 'running' });
  const card = el('div', { class: 'tool-card open' }, [
    el('div', { class: 'tool-head', onclick: () => card.classList.toggle('open') }, [
      el('span', { class: 'chev', text: '▸' }),
      el('span', { class: 'spinner' }),
      el('span', { class: 'tool-name', text: name }),
      el('span', { class: 'tool-arg', text: args && Object.keys(args).length ? summarizeArgs(name, args) : '' }),
      stateEl,
    ]),
    el('div', { class: 'tool-body' }, [
      el('div', { class: 'tool-section in' }, [
        el('h5', { text: 'arguments' }),
        el('pre', { text: truncate(JSON.stringify(args ?? {}, null, 2), 6000) }),
      ]),
      el('div', { class: 'tool-section out' }, [
        el('h5', { text: 'result' }),
        el('pre', { text: '…' }),
      ]),
    ]),
  ]);
  cur.group.append(card);
  scrollToBottom();
  return { card, stateEl, outEl: card.querySelector('.tool-section.out pre'), id, name };
}

export function finishToolCard(ref, { error, output, ms }) {
  ref.stateEl.className = 'tool-state ' + (error ? 'err' : 'ok');
  ref.stateEl.textContent = error ? `error · ${fmtDuration(ms)}` : fmtDuration(ms);
  ref.card.querySelector('.spinner')?.remove();
  const out = output ?? '';
  ref.outEl.textContent = out.length > 24000 ? out.slice(0, 24000) + '\n…[truncated for display]' : out;
}

export function addPlanCard(turn, tasks) {
  const cur = turn.current || newStep(turn);
  const ul = el('ul');
  for (const t of tasks) {
    ul.append(el('li', { class: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : '' }, [
      el('span', { class: 'st', text: t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '⏳' : '⬜' }),
      el('span', { text: t.text }),
    ]));
  }
  cur.group.append(el('div', { class: 'plan-card' }, [el('h5', { text: 'Plan' }), ul]));
}

export function addArtifactCard(turn, entry, onOpen) {
  const cur = turn.current || newStep(turn);
  cur.group.append(el('div', { class: 'artifact-card' }, [
    el('span', { text: '📦' }),
    el('div', { class: 'grow' }, [
      el('div', { class: 'name', text: entry.title || entry.path }),
      el('div', { style: 'font-size:11.5px;color:var(--text-faint)', text: `${entry.path} · ${fmtBytes(entry.size)}` }),
    ]),
    el('button', { class: 'btn small', text: 'Open preview', onclick: () => onOpen(entry) }),
  ]));
  scrollToBottom();
}

export function addErrorCard(text, hint) {
  $('#messages').append(el('div', { class: 'msg error' }, [
    el('div', { class: 'msg-head' }, [el('span', { class: 'msg-role', text: 'Error' })]),
    el('div', { class: 'msg-body' }, [
      el('div', { style: 'white-space:pre-wrap', text }),
      hint ? el('div', { style: 'margin-top:8px;color:var(--text-dim)', text: hint }) : null,
    ]),
  ]));
  scrollToBottom();
}

export function addNoteCard(text) {
  $('#messages').append(el('div', { class: 'msg' }, [
    el('div', { class: 'msg-head' }, [el('span', { class: 'msg-role', text: 'Notice' })]),
    el('div', { class: 'msg-body' }, [el('div', { style: 'color:var(--text-dim)', text })]),
  ]));
  scrollToBottom();
}
