/** Model picker: live catalogue, real effort levels, per-level verification. */
import { filterModels, formatContext, formatPrice, providerLabel, sortForDisplay } from '../lib/catalog.js';
import { EFFORT_META, describeLevel } from '../lib/effort.js';
import { el, clear, formatDuration, toast } from './dom.js';
import { verificationKey } from '../agent/verify.js';

export class ModelPicker {
  constructor({ getCatalog, getSelected, getVerification, onSelect, onVerify, onPinProvider }) {
    this.getCatalog = getCatalog;
    this.getSelected = getSelected;
    this.getVerification = getVerification;
    this.onSelect = onSelect;
    this.onVerify = onVerify;
    this.onPinProvider = onPinProvider;

    this.modal = document.getElementById('model-modal');
    this.listEl = document.getElementById('model-list');
    this.detailEl = document.getElementById('model-detail');
    this.vendorEl = document.getElementById('vendor-filters');
    this.searchEl = document.getElementById('model-search');
    this.subEl = document.getElementById('model-modal-sub');

    this.query = '';
    this.vendor = '';
    this.toolsOnly = false;
    this.reasoningOnly = false;
    this.freeOnly = false;
    this.catalog = { models: [] };
    this.highlighted = null;
    this.verifying = null;

    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.renderList();
    });
    document.getElementById('filter-tools').addEventListener('change', (e) => {
      this.toolsOnly = e.target.checked;
      this.renderList();
    });
    document.getElementById('filter-reasoning').addEventListener('change', (e) => {
      this.reasoningOnly = e.target.checked;
      this.renderList();
    });
    document.getElementById('filter-free').addEventListener('change', (e) => {
      this.freeOnly = e.target.checked;
      this.renderList();
    });
    document.getElementById('close-modal').addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modal.classList.contains('open')) this.close();
    });
  }

  open() {
    this.modal.classList.add('open');
    this.render();
    setTimeout(() => this.searchEl.focus(), 30);
  }

  close() {
    this.modal.classList.remove('open');
  }

  setCatalog(catalog) {
    this.catalog = catalog;
    if (this.modal.classList.contains('open')) this.render();
  }

  render() {
    const models = this.catalog.models ?? [];
    const live = this.catalog.live;
    this.subEl.textContent = live
      ? `${models.length} callable models from puter.ai.listModels() — availability is live, effort levels are verified on demand.`
      : `${models.length} models from the bundled Puter snapshot (offline mode) — connect to refresh.`;
    this.renderVendors();
    this.renderList();
    const selected = this.getSelected();
    this.highlighted = selected?.model ?? models[0] ?? null;
    this.renderDetail();
  }

  renderVendors() {
    const counts = new Map();
    for (const model of this.catalog.models ?? []) {
      counts.set(model.vendor, (counts.get(model.vendor) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    clear(this.vendorEl);
    this.vendorEl.append(
      el('button', {
        class: this.vendor === '' ? 'active' : '',
        onclick: () => {
          this.vendor = '';
          this.renderVendors();
          this.renderList();
        },
      }, 'All vendors', el('span', { class: 'count', text: String(this.catalog.models?.length ?? 0) })),
    );
    for (const [vendor, count] of entries) {
      this.vendorEl.append(
        el('button', {
          class: this.vendor === vendor ? 'active' : '',
          onclick: () => {
            this.vendor = vendor;
            this.renderVendors();
            this.renderList();
          },
        }, vendor, el('span', { class: 'count', text: String(count) })),
      );
    }
  }

  filtered() {
    const models = filterModels(this.catalog.models ?? [], {
      query: this.query,
      vendor: this.vendor,
      toolsOnly: this.toolsOnly,
      reasoningOnly: this.reasoningOnly,
      freeOnly: this.freeOnly,
    });
    return this.query ? models : sortForDisplay(models);
  }

  renderList() {
    const models = this.filtered();
    clear(this.listEl);
    if (!models.length) {
      this.listEl.append(el('div', { class: 'empty', text: 'No model matches those filters.' }));
      return;
    }
    const selected = this.getSelected()?.model?.id;
    const fragment = document.createDocumentFragment();
    for (const model of models.slice(0, 400)) {
      const active = this.highlighted?.id === model.id || selected === model.id;
      const badges = [];
      if (model.toolCall) badges.push(el('span', { class: 'pill ok', text: 'tools' }));
      if (model.reasoning) badges.push(el('span', { class: 'pill', text: model.effort.mode === 'thinking' ? 'thinking' : 'reasoning' }));
      if (model.free) badges.push(el('span', { class: 'pill warn', text: 'free' }));
      fragment.append(
        el('button', {
          class: 'model-row' + (active ? ' active' : ''),
          onclick: () => {
            this.highlighted = model;
            this.renderList();
            this.renderDetail();
          },
          ondblclick: () => this.commit(model),
        },
          el('div', { class: 'm-main' },
            el('div', { class: 'm-name', text: model.name }),
            el('div', { class: 'm-sub' },
              el('span', { text: model.id }),
              model.context ? el('span', { text: formatContext(model.context) + ' ctx' }) : null,
              model.inputPrice !== null ? el('span', { text: formatPrice(model.inputPrice) + '/M in' }) : null,
            ),
          ),
          el('div', { class: 'm-badges' }, ...badges),
        ),
      );
    }
    this.listEl.append(fragment);
  }

  renderDetail() {
    const model = this.highlighted;
    clear(this.detailEl);
    if (!model) {
      this.detailEl.append(el('div', { class: 'empty', text: 'Select a model to inspect it.' }));
      return;
    }
    const selected = this.getSelected();
    const isCurrent = selected?.model?.id === model.id;
    const effort = model.effort ?? { mode: 'none', levels: [], note: 'No reasoning mode.' };

    this.detailEl.append(...[
      el('div', {}, el('h3', { text: model.name }), el('div', { class: 'sub', text: model.id })),
      el('div', { class: 'pill-row' },
        el('span', { class: 'pill', text: model.vendor }),
        model.context ? el('span', { class: 'pill', text: formatContext(model.context) + ' context' }) : null,
        model.maxTokens ? el('span', { class: 'pill', text: formatContext(model.maxTokens) + ' max out' }) : null,
        model.toolCall ? el('span', { class: 'pill ok', text: 'tool calling' }) : el('span', { class: 'pill bad', text: 'no tools' }),
        model.free ? el('span', { class: 'pill warn', text: 'free variant' }) : null,
      ),
      el('dl', { class: 'kv' },
        el('dt', { text: 'Input' }), el('dd', { text: formatPrice(model.inputPrice) + ' / 1M tokens' }),
        el('dt', { text: 'Output' }), el('dd', { text: formatPrice(model.outputPrice) + ' / 1M tokens' }),
        el('dt', { text: 'Modalities' }), el('dd', { text: (model.modalities?.input ?? ['text']).join(', ') + ' → ' + (model.modalities?.output ?? ['text']).join(', ') }),
        el('dt', { text: 'Providers' }), el('dd', { text: (model.providers ?? []).map(providerLabel).join(', ') || 'puter' }),
        model.releaseDate ? el('dt', { text: 'Released' }) : null,
        model.releaseDate ? el('dd', { text: model.releaseDate }) : null,
      ),
      model.description ? el('div', { class: 'desc', text: model.description }) : null,
    ].filter(Boolean));

    // ---- provider pin (only useful for resold models) ----
    if ((model.providers ?? []).length > 1) {
      const select = el('select', {
        style: 'width:100%;padding:7px 9px;border-radius:9px;border:1px solid var(--line);background:var(--bg-elev-2);font-size:12px',
        onchange: (event) => this.onPinProvider?.(model, event.target.value || null),
      });
      select.append(el('option', { value: '' }, 'Routing: automatic (Puter picks)'));
      for (const provider of model.providers) select.append(el('option', { value: provider }, 'Pin to ' + providerLabel(provider)));
      this.detailEl.append(el('div', {}, el('div', { class: 'section-title', text: 'Provider' }), select));
    }

    // ---- effort levels, with live verification state ----
    const effortSection = el('div', {}, el('div', { class: 'section-title', text: 'Reasoning effort' }));
    if (!effort.levels.length) {
      effortSection.append(
        el('div', { class: 'effort-row' },
          el('span', { class: 'lvl', text: effort.mode === 'fixed' ? 'always on' : 'none' }),
          el('span', { class: 'hint-text', text: effort.note ?? 'This model has no effort control.' }),
        ),
      );
    } else {
      for (const level of effort.levels) {
        const key = verificationKey(model.id, level);
        const record = this.getVerification(key);
        const status = record ? (record.ok ? `<span class="status pill ok">ok ${formatDuration(record.ms)}</span>` : `<span class="status pill bad">${escapeHtml(String(record.error ?? 'failed')).slice(0, 60)}</span>`) : '<span class="status pill">not tested</span>';
        const row = el('div', { class: 'effort-row' },
          el('span', { class: 'lvl', text: level }),
          el('span', { class: 'hint-text', text: describeLevel(effort, level) || EFFORT_META[level]?.hint || '' }),
        );
        row.insertAdjacentHTML('beforeend', status);
        effortSection.append(row);
      }
      effortSection.append(
        el('div', { class: 'hint', style: 'padding:2px 2px 0;color:var(--text-faint);font-size:11px', text: effort.note ?? '' }),
        el('div', { class: 'hint', style: 'padding:2px 2px 0;color:var(--text-faint);font-size:10.5px', text: 'Rule source: ' + (effort.source ?? 'Puter catalogue') }),
      );
    }
    this.detailEl.append(effortSection);

    const verifyBtn = el('button', {
      class: 'btn block',
      onclick: async () => {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Testing every level…';
        try {
          await this.onVerify(model, effort);
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify every effort level';
          this.renderDetail();
        }
      },
    }, effort.levels.length ? '🔬 Verify every effort level' : '🔬 Test this model');

    const useBtn = el('button', {
      class: 'btn primary block',
      onclick: () => this.commit(model),
    }, isCurrent ? '✓ Currently selected' : 'Use this model');

    this.detailEl.append(
      el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, useBtn, verifyBtn),
      el('div', { class: 'hint', style: 'color:var(--text-faint);font-size:10.5px', text: 'Effort levels come from the Puter docs; the Verify button proves them against the live API and remembers the result.' }),
      el('a', { href: 'https://developer.puter.com/ai/models/', target: '_blank', rel: 'noopener', style: 'font-size:11px', text: 'Model page ↗' }),
    );
  }

  commit(model) {
    const effort = model.effort ?? { levels: [] };
    const current = this.getSelected();
    let level = current?.level ?? null;
    if (effort.levels.length && !effort.levels.includes(level)) level = effort.defaultLevel ?? effort.levels[0];
    if (!effort.levels.length) level = null;
    this.onSelect(model, level);
    this.highlighted = model;
    this.renderList();
    this.renderDetail();
    toast(`Using ${model.name}`, 'ok');
    this.close();
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
