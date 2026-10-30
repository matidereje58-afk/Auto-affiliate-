/** Transcript rendering: user turns, streamed assistant turns, thinking, tools, diffs. */
import { renderMarkdown } from '../lib/markdown.js';
import { renderDiff } from '../lib/diff.js';
import { el, clear, formatDuration, copyText, toast } from './dom.js';
import { formatCost } from '../lib/tokens.js';
import { toolMeta } from '../agent/tools.js';

const SUGGESTIONS = [
  ['Landing page', 'Build a responsive product landing page with a pricing table', 'index.html'],
  ['Fix a bug', 'Review the project files and fix the most serious bug you find', null],
  ['Add tests', 'Write a JavaScript test suite for the project and run it in the sandbox', null],
  ['Explain', 'Explain how this project works, file by file', null],
];

export class Transcript {
  constructor(root, { onSuggestion } = {}) {
    this.root = root;
    this.inner = el('div', { class: 'transcript-inner' });
    this.root.append(this.inner);
    this.onSuggestion = onSuggestion;
    this.live = null;
    this.autoScroll = true;
    this.root.addEventListener('scroll', () => {
      const distance = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight;
      this.autoScroll = distance < 120;
    });
  }

  scrollToBottom(force = false) {
    if (force || this.autoScroll) this.root.scrollTop = this.root.scrollHeight;
  }

  renderHero() {
    clear(this.inner);
    const grid = el('div', { class: 'hero-grid' });
    for (const [title, prompt, file] of SUGGESTIONS) {
      grid.append(
        el('button', {
          class: 'hero-card',
          onclick: () => this.onSuggestion?.({ prompt, file }),
        }, el('strong', { text: title }), prompt),
      );
    }
    this.inner.append(
      el('div', { class: 'hero' },
        el('h1', { text: 'What are we building?' }),
        el('p', { text: 'Every model is live from Puter, every effort level is verified, and every step the agent takes is visible — thinking, files, executions and diffs.' }),
        grid,
      ),
    );
  }

  /** Render the full stored conversation. */
  renderAll(messages) {
    clear(this.inner);
    if (!messages.length) {
      this.renderHero();
      return;
    }
    for (const message of messages) this.renderMessage(message);
    this.scrollToBottom(true);
  }

  renderMessage(message) {
    if (message.role === 'user') {
      this.inner.append(this.userBubble(message));
      return;
    }
    if (message.role === 'assistant') {
      const view = new TurnView(this.inner, {
        modelName: message.modelName,
        level: message.level,
        usage: message.usage,
        durationMs: message.durationMs,
        createdAt: message.createdAt,
      });
      if (message.reasoning) view.setReasoning(message.reasoning, true);
      for (const step of message.steps ?? []) view.replayStep(step);
      if (message.content) view.setText(message.content, true);
      if (message.error) view.error(message.error);
      view.finalize({ finished: message.finished, steps: message.steps?.length ?? 0 });
      this.inner.append(view.node);
    }
  }

  userBubble(message) {
    return el('div', { class: 'msg user' },
      el('div', { class: 'avatar-badge', text: 'Y' }),
      el('div', { class: 'msg-body' },
        el('div', { class: 'msg-meta' }, el('span', { text: 'You' }), el('span', { class: 'pill', text: new Date(message.createdAt ?? Date.now()).toLocaleTimeString() })),
        el('div', { class: 'msg-content', html: renderMarkdown(message.content ?? '') }),
      ),
    );
  }

  beginTurn({ modelName, level }) {
    this.live = new TurnView(this.inner, { modelName, level });
    this.inner.append(this.live.node);
    this.scrollToBottom(true);
    return this.live;
  }

  endTurn(result = {}) {
    if (!this.live) return null;
    const view = this.live;
    view.finalize(result);
    this.live = null;
    return view;
  }
}

/** One streamed assistant turn. */
export class TurnView {
  constructor(container, { modelName, level, usage = null, durationMs = null, createdAt = Date.now() } = {}) {
    this.textValue = '';
    this.reasoningValue = '';
    this.steps = [];
    this.stepCards = new Map();
    this.userScrolledThinking = false;
    this.thinkingBuilt = false;

    this.thinkingEl = el('div', { class: 'thinking collapsed' });
    this.flowEl = el('div', { class: 'flow' });
    this.bannerEl = el('div');
    this.currentTextEl = null;

    this.node = el('div', { class: 'msg assistant' },
      el('div', { class: 'avatar-badge', text: '✦' }),
      el('div', { class: 'msg-body' },
        el('div', { class: 'msg-meta' },
          el('span', { text: modelName || 'assistant' }),
          level ? el('span', { class: 'pill', text: level }) : null,
          el('span', { class: 'pill', text: new Date(createdAt).toLocaleTimeString() }),
        ),
        this.thinkingEl,
        this.flowEl,
        this.bannerEl,
      ),
    );
    this.container = container;
    this.scheduled = false;
    this.modelName = modelName;
    this.level = level;
    this.usage = usage;
    this.durationMs = durationMs;
    this.startTime = Date.now();
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  /** A new narration block starts after every tool call. */
  ensureTextBlock() {
    if (!this.currentTextEl) {
      this.currentTextEl = el('div', { class: 'msg-content' });
      this.flowEl.append(this.currentTextEl);
    }
    return this.currentTextEl;
  }

  flush() {
    if (this.textValue && this.currentTextEl) this.currentTextEl.innerHTML = renderMarkdown(this.textValue);
    if (this.reasoningValue) {
      const body = this.thinkingEl.querySelector('.thinking-body');
      if (body) {
        body.textContent = this.reasoningValue;
        if (!this.userScrolledThinking) body.scrollTop = body.scrollHeight;
        const count = this.thinkingEl.querySelector('.t-count');
        if (count) count.textContent = `${this.reasoningValue.length.toLocaleString()} chars`;
      }
    }
    if (this.container?.isConnected) {
      this.container.parentElement?.scrollTo?.({ top: this.container.parentElement.scrollHeight });
    }
  }

  setReasoning(text, replace = false) {
    this.reasoningValue = replace ? text : this.reasoningValue + text;
    if (!this.thinkingBuilt) {
      const body = el('div', { class: 'thinking-body', text: this.reasoningValue });
      body.addEventListener('scroll', () => {
        this.userScrolledThinking = body.scrollHeight - body.scrollTop - body.clientHeight > 40;
      });
      this.thinkingEl.append(
        el('button', {
          class: 'thinking-head',
          onclick: () => this.thinkingEl.classList.toggle('collapsed'),
        },
          el('span', { class: 'spark', text: '✧' }),
          el('span', { text: 'Thinking' }),
          el('span', { class: 't-count', text: this.reasoningValue.length.toLocaleString() + ' chars' }),
        ),
        body,
      );
      this.thinkingEl.classList.remove('collapsed');
      this.thinkingBuilt = true;
    } else {
      const body = this.thinkingEl.querySelector('.thinking-body');
      body.textContent = this.reasoningValue;
    }
    this.schedule();
  }

  setText(text, replace = false) {
    this.textValue = replace ? text : this.textValue + text;
    this.ensureTextBlock();
    this.schedule();
  }

  collapseThinking() {
    this.thinkingEl.classList.add('collapsed');
    const label = this.thinkingEl.querySelector('.thinking-head span:nth-child(2)');
    if (label) label.textContent = 'Thought process';
  }

  toolStart({ id, name, input }) {
    const meta = toolMeta(name);
    const summary = summarizeArgs(name, input);
    const body = el('div', { class: 'tool-body collapsed' });
    const status = el('span', { class: 'tool-status' }, el('span', { class: 'dot' }), el('span', { text: 'running' }));
    const card = el('div', { class: 'tool-card running' },
      el('button', { class: 'tool-head', onclick: () => body.classList.toggle('collapsed') },
        el('span', { class: 'tool-icon', text: meta.icon }),
        el('span', { class: 'tool-name', text: meta.label }),
        el('span', { class: 'tool-arg', text: summary }),
        status,
      ),
      body,
    );
    this.currentTextEl = null;
    this.flowEl.append(card);
    const record = { id, name, input, card, body, status, startedAt: Date.now() };
    this.stepCards.set(id ?? name + this.stepCards.size, record);
    this.lastStep = record;
    this.steps.push({ name, input, status: 'running' });
    this.schedule();
    return record;
  }

  toolEnd({ name, ok, summary, ms, ui, id }) {
    const record = this.lastStep ?? Array.from(this.stepCards.values()).pop();
    if (!record) return;
    record.card.classList.remove('running');
    if (!ok) record.card.classList.add('failed');
    record.status.replaceChildren(el('span', { class: 'dot' }), el('span', { text: ok ? formatDuration(ms ?? Date.now() - record.startedAt) : 'failed' }));
    record.body.innerHTML = renderToolResult(name, summary, ui);
    const keepOpen = ['write_file', 'edit_file', 'run_javascript', 'run_python', 'run_file', 'preview_html', 'finish', 'ask_user'];
    record.body.classList.toggle('collapsed', !keepOpen.includes(name));
    const step = this.steps[this.steps.length - 1];
    if (step) Object.assign(step, { status: ok ? 'done' : 'failed', summary, ms, ui });
    this.lastStep = null;
    this.schedule();
  }

  error(error) {
    const message = typeof error === 'string' ? error : error?.message ?? JSON.stringify(error);
    this.bannerEl.append(el('div', { class: 'error-banner' }, el('span', { text: '⚠' }), el('span', { text: message })));
  }

  completion({ summary, files = [] } = {}) {
    this.bannerEl.append(
      el('div', { class: 'completion-banner' },
        el('span', { text: '✅' }),
        el('span', { text: summary || 'Task finished.' }),
        files.length ? el('span', { class: 'pill', text: `${files.length} file${files.length === 1 ? '' : 's'}` }) : null,
      ),
    );
  }

  /** Repaint a step recorded in a saved message. */
  replayStep(step) {
    const record = this.toolStart({ id: step.id ?? step.name, name: step.name, input: step.input ?? {} });
    this.toolEnd({ name: step.name, ok: step.status !== 'failed', summary: step.summary ?? '', ms: step.ms, ui: step.ui });
    return record;
  }

  finalize({ finished = false, steps = 0, usage = null, durationMs = null } = {}) {
    if (this.reasoningValue) this.collapseThinking();
    if (usage || durationMs) {
      const meta = this.node.querySelector('.msg-meta');
      if (meta) {
        const bits = [];
        if (usage?.input || usage?.output) bits.push(`${(usage.input ?? 0).toLocaleString()} in / ${(usage.output ?? 0).toLocaleString()} out`);
        if (usage?.cost) bits.push(formatCost(usage.cost));
        const ms = durationMs ?? Date.now() - this.startTime;
        if (ms) bits.push(formatDuration(ms));
        if (steps) bits.push(`${steps} step${steps === 1 ? '' : 's'}`);
        if (bits.length) meta.append(el('span', { class: 'pill', text: bits.join(' · ') }));
      }
    }
    if (!this.textValue && !this.reasoningValue && !this.steps.length && finished) {
      this.ensureTextBlock().innerHTML = '<p class="muted">(no output)</p>';
    }
    this.flush();
  }
}

function summarizeArgs(name, input = {}) {
  if (!input || typeof input !== 'object') return '';
  if (name === 'write_file' || name === 'read_file' || name === 'edit_file' || name === 'delete_file') return input.path ?? '';
  if (name === 'fetch_url') return input.url ?? '';
  if (name === 'search_files') return input.query ?? '';
  if (name === 'update_plan') return `${input.tasks?.length ?? 0} tasks`;
  if (name === 'run_javascript' || name === 'run_python') return (input.code ?? '').split('\n')[0].slice(0, 70);
  if (name === 'preview_html') return input.path ?? 'inline html';
  if (name === 'remember') return (input.fact ?? '').slice(0, 60);
  if (name === 'ask_user') return (input.question ?? '').slice(0, 70);
  if (name === 'finish') return (input.summary ?? '').slice(0, 70);
  return Object.keys(input).join(', ');
}

function renderToolResult(name, summary, ui) {
  if (name === 'edit_file' || name === 'write_file') {
    if (ui?.before !== undefined || ui?.after !== undefined) {
      const { html, added, removed } = renderDiff(ui.before ?? '', ui.after ?? '');
      return `<div class="diff-block">${html}</div><div class="tool-foot"><span class="ok">+${added}</span> <span class="del">−${removed}</span></div>`;
    }
  }
  if (name === 'run_javascript' || name === 'run_python' || name === 'run_file') {
    const output = ui?.output ?? summary ?? '';
    return `<div class="run-output"><span class="${ui?.ok ? 'ok' : 'err'}">${ui?.ok ? 'executed' : 'failed'}${ui?.ms ? ' in ' + ui.ms + 'ms' : ''}</span><pre>${escapeHtml(output)}</pre></div>`;
  }
  return `<pre>${escapeHtml(String(summary ?? '').slice(0, 6000))}</pre>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Global handlers for code-block copy buttons. */
document.addEventListener('click', async (event) => {
  const target = event.target.closest?.('.code-copy');
  if (!target) return;
  const ok = await copyText(target.dataset.copy ?? target.closest('.code-block')?.querySelector('code')?.textContent ?? '');
  if (ok) toast('Copied', 'ok');
});
