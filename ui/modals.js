// Modals: settings, conversation history, artifact preview.

import { $, el } from '../lib/util.js';
import { settings, conversations, memory } from '../lib/store.js';
import { ping } from '../agent/atria.js';
import { vfs } from '../lib/vfs.js';
import { renderMarkdown, highlightWithin } from './markdown.js';

let root;

function ensureRoot() {
  root = $('#modalRoot');
  return root;
}

export function closeModal() {
  const r = ensureRoot();
  r.hidden = true;
  r.innerHTML = '';
}

function openModal(content, { wide = false } = {}) {
  const r = ensureRoot();
  r.innerHTML = '';
  r.hidden = false;
  r.append(el('div', { class: 'modal' + (wide ? ' wide' : '') }, content));
  r.onclick = (e) => { if (e.target === r) closeModal(); };
  const onKey = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

function header(title, extra = []) {
  return el('div', { class: 'modal-head' }, [
    el('h3', { text: title }),
    ...extra,
    el('button', { class: 'mini close', text: '✕', onclick: closeModal }),
  ]);
}

/* --------------------------------------------------------------- settings -- */

export function openSettings({ onSaved, onWipe } = {}) {
  const s = settings.data;
  const memLines = Object.entries(memory.all()).map(([k, v]) => `${k} = ${v}`).join('\n');

  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'field' }, [
      el('label', { text: 'Atria API key' }),
      el('input', { type: 'password', id: 'setKey', value: s.apiKey, autocomplete: 'off', spellcheck: 'false' }),
      el('div', { class: 'desc', text: 'Stored only in this browser. You can also pass a key in the URL fragment (#key=atr_…) which is never persisted.' }),
    ]),
    el('div', { class: 'row2' }, [
      el('div', { class: 'field' }, [
        el('label', { text: 'API base URL' }),
        el('input', { type: 'text', id: 'setBase', value: s.baseUrl }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'Model' }),
        el('input', { type: 'text', id: 'setModel', value: s.model }),
      ]),
    ]),
    el('div', { class: 'row2' }, [
      el('div', { class: 'field' }, [
        el('label', { text: 'Reasoning effort' }),
        el('select', { id: 'setEffort' }, ['low', 'medium', 'high'].map((v) =>
          el('option', { value: v, selected: s.reasoningEffort === v, text: v }))),
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'Max tool steps per message' }),
        el('input', { type: 'number', id: 'setSteps', min: 1, max: 60, value: s.maxSteps }),
      ]),
    ]),
    el('div', { class: 'row2' }, [
      el('div', { class: 'field' }, [
        el('label', { text: 'Max output tokens per step' }),
        el('input', { type: 'number', id: 'setMaxTokens', min: 1024, max: 65536, step: 1024, value: s.maxTokens }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'Temperature (blank = provider default)' }),
        el('input', { type: 'number', id: 'setTemp', min: 0, max: 2, step: 0.1, value: s.temperature ?? '' }),
      ]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Custom system prompt (blank = built-in Atria Agent prompt)' }),
      el('textarea', { id: 'setPrompt', placeholder: 'Leave empty to use the built-in agent prompt…', text: s.systemPrompt || '' }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Long-term memory (editable)' }),
      el('textarea', { id: 'setMemory', text: memLines, spellcheck: 'false' }),
      el('div', { class: 'desc', text: 'One "key = value" per line. Loaded into the agent prompt at the start of every session.' }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Capabilities' }),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;font-size:13px' }, [
        el('input', { type: 'checkbox', id: 'setSubagents', checked: s.enableSubagents, style: 'width:auto' }),
        'Allow the agent to spawn sub-agents',
      ]),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;font-size:13px;margin-top:6px' }, [
        el('input', { type: 'checkbox', id: 'setAutoArtifacts', checked: s.autoOpenArtifacts, style: 'width:auto' }),
        'Open delivered artifacts automatically',
      ]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Danger zone' }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'mini', text: 'Clear workspace files', onclick: async (e) => {
          if (!confirm('Delete every workspace file?')) return;
          await vfs.clear();
          await vfs.kvDelete('artifacts');
          e.target.textContent = 'cleared';
          onWipe?.();
        } }),
        el('button', { class: 'mini', text: 'Clear conversations', onclick: (e) => {
          if (!confirm('Delete saved conversations?')) return;
          conversations.clear();
          e.target.textContent = 'cleared';
        } }),
        el('button', { class: 'mini', text: 'Reset settings', onclick: (e) => {
          settings.save({ systemPrompt: '', reasoningEffort: 'medium', maxSteps: 25, maxTokens: 16384, temperature: null, enableSubagents: true, autoOpenArtifacts: true });
          e.target.textContent = 'reset — reopen to see';
        } }),
      ]),
    ]),
  ]);

  const test = el('span', { class: 'hint', id: 'pingOut' });
  const foot = el('div', { class: 'modal-foot' }, [test, ...settingsFooter(test, onSaved)]);
  openModal([header('Settings'), body, foot]);
}

function settingsFooter(test, onSaved) {
  return [
    el('button', { class: 'btn small', text: 'Test connection', onclick: async () => {
      test.textContent = 'testing…';
      try {
        const models = await ping({ apiKey: $('#setKey').value.trim(), baseUrl: $('#setBase').value.trim() });
        test.textContent = `OK — ${models.join(', ') || 'no models listed'}`;
      } catch (e) {
        test.textContent = `Failed: ${e.message.slice(0, 120)}`;
      }
    } }),
    el('button', { class: 'btn small ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { class: 'btn primary small', text: 'Save', onclick: async () => {
      const tempVal = $('#setTemp').value.trim();
      settings.save({
        apiKey: $('#setKey').value.trim(),
        baseUrl: $('#setBase').value.trim() || 'https://api.atria-asi.ai/v1',
        model: $('#setModel').value.trim() || 'Atria-Dawn-Preview',
        reasoningEffort: $('#setEffort').value,
        maxSteps: Number($('#setSteps').value) || 25,
        maxTokens: Number($('#setMaxTokens').value) || 16384,
        temperature: tempVal === '' ? null : Number(tempVal),
        systemPrompt: $('#setPrompt').value,
        enableSubagents: $('#setSubagents').checked,
        autoOpenArtifacts: $('#setAutoArtifacts').checked,
      });
      await memory.clear();
      for (const line of $('#setMemory').value.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) await memory.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
      }
      closeModal();
      onSaved?.();
    } }),
  ];
}

/* ---------------------------------------------------------------- history -- */

export function openHistory({ currentId, onPick, onNew }) {
  const list = conversations.all();
  const body = el('div', { class: 'modal-body' });
  if (!list.length) body.append(el('div', { class: 'empty', text: 'No saved conversations yet.' }));
  for (const c of list) {
    const row = el('div', { class: 'conv-row' + (c.id === currentId ? ' active' : '') }, [
      el('div', { class: 'ct' }, [
        el('b', { text: c.title || 'Untitled' }),
        el('span', { text: `${new Date(c.updatedAt || c.createdAt).toLocaleString()} · ${(c.messages || []).length} messages` }),
      ]),
      el('button', { class: 'mini', text: 'Open', onclick: (e) => { e.stopPropagation(); closeModal(); onPick(c.id); } }),
      el('button', { class: 'mini', text: 'Delete', onclick: (e) => {
        e.stopPropagation();
        conversations.remove(c.id);
        closeModal();
        openHistory({ currentId, onPick, onNew });
      } }),
    ]);
    body.append(row);
  }
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn small', text: 'New conversation', onclick: () => { closeModal(); onNew(); } }),
  ]);
  openModal([header('Conversations'), body, foot]);
}

/* --------------------------------------------------------------- artifact -- */

export async function openArtifact({ path, title }) {
  const rec = await vfs.read(path);
  if (!rec) return;
  const blobUrl = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
  const isHtml = path.endsWith('.html') || rec.mime === 'text/html';
  const isImg = rec.mime.startsWith('image/');
  const isMd = /\.(md|markdown)$/i.test(path);

  let inner;
  if (isHtml) {
    inner = el('iframe', {
      class: 'preview-frame',
      sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-downloads',
      src: blobUrl,
    });
  } else if (isImg) {
    inner = el('img', { src: blobUrl, style: 'max-width:100%;border-radius:10px' });
  } else if (isMd) {
    inner = el('div', { class: 'msg-body', html: renderMarkdown(rec.text ?? '') });
  } else {
    inner = el('pre', { class: 'tool-section', style: 'max-height:65vh;overflow:auto;font-family:var(--mono);font-size:12px;white-space:pre-wrap', text: (rec.text ?? '').slice(0, 200000) });
  }

  const foot = el('div', { class: 'modal-foot' }, [
    el('a', { class: 'btn small', href: blobUrl, download: path.split('/').pop(), text: 'Download' }),
    el('a', { class: 'btn small', href: blobUrl, target: '_blank', rel: 'noreferrer', text: 'Open in new tab' }),
    el('button', { class: 'btn primary small', text: 'Close', onclick: closeModal }),
  ]);

  openModal([header(title || path), el('div', { class: 'modal-body' }, [inner]), foot], { wide: true });
  if (isMd) highlightWithin(root);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 360000);
}

/* ------------------------------------------------------------------ toast -- */

export function toast(message, kind = '') {
  const box = $('#toasts');
  const node = el('div', { class: 'toast ' + kind, text: message });
  box.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 320);
  }, kind === 'err' ? 7000 : 4200);
}
