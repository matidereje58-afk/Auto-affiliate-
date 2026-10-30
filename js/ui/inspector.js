/** Right-hand inspector: plan, files, live preview, console, model card. */
import { el, clear, formatBytes, formatDuration } from './dom.js';
import { formatContext, formatPrice } from '../lib/catalog.js';
import { verificationKey } from '../agent/verify.js';

export class Inspector {
  constructor() {
    this.planEl = document.getElementById('panel-plan');
    this.filesEl = document.getElementById('panel-files');
    this.previewFrame = document.getElementById('preview-frame');
    this.previewPath = document.getElementById('preview-path');
    this.consoleEl = document.getElementById('panel-console');
    this.modelEl = document.getElementById('panel-model');
    this.tabs = document.getElementById('inspector-tabs');
    this.logs = [];
    this.expandedFiles = new Set();

    this.tabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');
      if (button) this.openTab(button.dataset.tab);
    });
    document.getElementById('preview-refresh').addEventListener('click', () => this.reloadPreview());
    this.lastPreview = null;
  }

  openTab(name) {
    for (const button of this.tabs.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.tab === name);
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('active', panel.dataset.panel === name);
    }
    if (window.innerWidth < 1040) document.getElementById('app').classList.add('show-inspector');
  }

  // ------------------------------------------------------------- plan ----
  renderPlan(plan = []) {
    clear(this.planEl);
    if (!plan.length) {
      this.planEl.append(el('div', { class: 'empty', text: 'The agent writes its plan here before it starts working.' }));
      return;
    }
    const done = plan.filter((t) => t.status === 'done').length;
    this.planEl.append(el('div', { class: 'section-title', text: `${done}/${plan.length} tasks complete` }));
    const list = el('div', { class: 'plan-list' });
    for (const task of plan) {
      const mark = task.status === 'done' ? '✔' : task.status === 'in_progress' ? '◐' : '○';
      list.append(
        el('div', { class: `plan-item ${task.status}` },
          el('span', { class: 'mark', text: mark }),
          el('span', { class: 'plan-title', text: task.title }),
        ),
      );
    }
    this.planEl.append(list);
  }

  // ------------------------------------------------------------ files ----
  renderFiles(files = {}, onOpen = null) {
    clear(this.filesEl);
    const paths = Object.keys(files).sort();
    if (!paths.length) {
      this.filesEl.append(el('div', { class: 'empty', text: 'No files yet. Ask the agent to build something.' }));
      return;
    }
    this.filesEl.append(el('div', { class: 'section-title', text: `${paths.length} files · mirrored to ~/WorkBuddy` }));
    for (const path of paths) {
      const content = files[path]?.content ?? '';
      const expanded = this.expandedFiles.has(path);
      const card = el('div', { class: 'file-card' });
      const header = el('header', {
        onclick: () => {
          if (this.expandedFiles.has(path)) this.expandedFiles.delete(path);
          else this.expandedFiles.add(path);
          this.renderFiles(files);
          onOpen?.(path);
        },
      }, el('span', { text: expanded ? '▾' : '▸' }), el('span', { text: path }), el('span', { class: 'badge', text: formatBytes(content.length) }));
      card.append(header);
      if (expanded) card.append(el('pre', { text: content.slice(0, 20000) }));
      this.filesEl.append(card);
    }
  }

  // ---------------------------------------------------------- preview ----
  setPreview(html, path = null) {
    this.lastPreview = { html, path };
    this.previewPath.textContent = path ?? 'inline html';
    this.previewFrame.srcdoc = html;
    this.openTab('preview');
  }

  reloadPreview() {
    if (this.lastPreview) this.previewFrame.srcdoc = this.lastPreview.html;
  }

  // ---------------------------------------------------------- console ----
  log(text, kind = 'meta') {
    this.logs.push({ text: String(text ?? ''), kind, at: Date.now() });
    if (this.logs.length > 500) this.logs.shift();
    this.renderConsole();
  }

  renderConsole() {
    clear(this.consoleEl);
    if (!this.logs.length) {
      this.consoleEl.append(el('div', { class: 'empty', text: 'Tool executions, model calls and errors appear here.' }));
      return;
    }
    const wrap = el('div', { class: 'console-log' });
    for (const entry of this.logs.slice(-300)) {
      wrap.append(el('div', { class: `console-line ${entry.kind}`.trim(), text: `${new Date(entry.at).toLocaleTimeString()}  ${entry.text}` }));
    }
    this.consoleEl.append(wrap);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }
}

Inspector.prototype.renderModelCard = function renderModelCard({ model, level, effort, getVerification, usage }) {
    clear(this.modelEl);
    if (!model) {
      this.modelEl.append(el('div', { class: 'empty', text: 'No model selected.' }));
      return;
    }
    const section = (title, ...children) => el('div', {}, el('div', { class: 'section-title', text: title }), ...children);
    this.modelEl.append(
      el('div', {}, el('h3', { style: 'margin:0;font-size:14px', text: model.name }), el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--text-faint)', text: model.id })),
      section('MODEL',
        el('dl', { class: 'kv' },
          el('dt', { text: 'Vendor' }), el('dd', { text: model.vendor }),
          el('dt', { text: 'Context' }), el('dd', { text: formatContext(model.context) + ' tokens' }),
          el('dt', { text: 'Max output' }), el('dd', { text: formatContext(model.maxTokens) + ' tokens' }),
          el('dt', { text: 'Price' }), el('dd', { text: `${formatPrice(model.inputPrice)} in / ${formatPrice(model.outputPrice)} out per 1M` }),
          el('dt', { text: 'Tools' }), el('dd', { text: model.toolCall ? 'native function calling' : 'text protocol (no native tools)' }),
          el('dt', { text: 'Providers' }), el('dd', { text: (model.providers ?? []).join(', ') }),
        ),
      ),
      section('EFFORT',
        el('div', { class: 'pill-row' },
          ...(effort?.levels?.length
            ? effort.levels.map((lvl) => {
                const record = getVerification?.(verificationKey(model.id, lvl));
                const state = record ? (record.ok ? 'ok' : 'bad') : '';
                return el('span', { class: `pill ${state}`.trim(), title: record?.error ?? '', text: lvl + (record ? (record.ok ? ` · ${formatDuration(record.ms)}` : ' · failed') : '') });
              })
            : [el('span', { class: 'pill', text: effort?.mode === 'fixed' ? 'always reasoning' : 'no reasoning control' })]),
        ),
        effort?.note ? el('div', { style: 'font-size:11px;color:var(--text-faint);margin-top:6px', text: effort.note }) : null,
        el('div', { style: 'font-size:10.5px;color:var(--text-faint);margin-top:4px', text: `Active level: ${level ?? 'model default'}` }),
      ),
      section('THIS RUN',
        el('dl', { class: 'kv' },
          el('dt', { text: 'Input' }), el('dd', { text: (usage?.input ?? 0).toLocaleString() + ' tokens' }),
          el('dt', { text: 'Output' }), el('dd', { text: (usage?.output ?? 0).toLocaleString() + ' tokens' }),
          el('dt', { text: 'Cost' }), el('dd', { text: usage?.cost ? '$' + usage.cost.toFixed(4) : '—' }),
        ),
      ),
      el('a', { href: 'https://docs.puter.com/AI/chat/', target: '_blank', rel: 'noopener', style: 'font-size:11px', text: 'Puter chat docs ↗' }),
    );
};
