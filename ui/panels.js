// Side panel UI: workspace files, artifacts, plan, activity log.

import { $, el, fmtBytes, fmtTime, isImagePath } from '../lib/util.js';
import { vfs } from '../lib/vfs.js';
import { renderMarkdown, highlightWithin } from './markdown.js';
import { prepareHtmlPreview } from './assets.js';
import { openEditor } from './modals.js';

export function createPanels({ onPreviewArtifact, toast }) {
  const state = { files: [], selected: null, artifacts: [], log: [] };

  /* ------------------------------------------------------------ workspace -- */

  async function refreshFiles() {
    state.files = await vfs.list();
    const list = $('#fileList');
    list.innerHTML = '';
    if (!state.files.length) {
      list.append(el('div', { class: 'empty', text: 'Workspace is empty. Ask the agent to create something, or upload a file.' }));
    }
    for (const f of state.files) {
      const row = el('div', {
        class: 'file-row' + (state.selected === f.path ? ' active' : ''),
        title: f.path,
        onclick: () => previewFile(f.path),
      }, [
        el('span', { text: isImagePath(f.path) ? '🖼' : f.path.endsWith('.html') ? '🌐' : '📄' }),
        el('span', { class: 'fname', text: f.path }),
        el('span', { class: 'fsize', text: fmtBytes(f.size) }),
      ]);
      row.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        if (confirm(`Delete ${f.path}?`)) {
          await vfs.delete(f.path);
          await refreshFiles();
          if (state.selected === f.path) clearPreview();
        }
      });
      list.append(row);
    }
  }

  function clearPreview() {
    state.selected = null;
    $('#filePreview').innerHTML = '<div class="empty">Select a file to preview. The agent can read and write every file here.</div>';
  }

  async function previewFile(path) {
    const rec = await vfs.read(path);
    if (!rec) return;
    state.selected = path;
    const box = $('#filePreview');
    box.innerHTML = '';
    box.append(el('div', { class: 'prev-head' }, [
      el('span', { text: path }),
      el('span', { style: 'color:var(--text-faint);font-family:var(--sans)', text: fmtBytes(rec.size) }),
      el('button', { class: 'mini', style: 'margin-left:auto', text: 'Edit', onclick: () => openEditor({ path, onSaved: () => refreshFiles().then(() => previewFile(path)) }) }),
      el('button', { class: 'mini', text: 'Download', onclick: () => downloadFile(path) }),
      path.endsWith('.html') ? el('button', { class: 'mini', text: 'Open', onclick: () => onPreviewArtifact({ path, title: path }) }) : null,
    ]));

    if (isImagePath(path)) {
      const url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
      box.append(el('img', { src: url, alt: path, onload: () => URL.revokeObjectURL(url) }));
    } else if (rec.binary) {
      box.append(el('div', { class: 'empty', text: `Binary file (${rec.mime}, ${fmtBytes(rec.size)}). Inspect it with the agent's Python sandbox.` }));
    } else if (path.endsWith('.html')) {
      const prepared = await prepareHtmlPreview(rec.text ?? '', path);
      const frame = el('iframe', {
        class: 'preview-frame',
        style: 'height:340px',
        sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
      });
      frame.srcdoc = prepared.html;
      box.append(frame);
      setTimeout(() => prepared.urls.forEach((u) => URL.revokeObjectURL(u)), 300000);
    } else if (/\.(md|markdown)$/i.test(path)) {
      const div = el('div', { class: 'msg-body', html: renderMarkdown(rec.text ?? '') });
      box.append(div);
      highlightWithin(div);
    } else {
      box.append(el('pre', { text: (rec.text ?? '').slice(0, 60000) }));
    }
    document.querySelectorAll('.file-row').forEach((r) => r.classList.toggle('active', r.title === path));
  }

  async function downloadFile(path) {
    const rec = await vfs.read(path);
    if (!rec) return;
    const url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
    const a = el('a', { href: url, download: path.split('/').pop() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadZip() {
    const files = await vfs.list();
    if (!files.length) return toast('Workspace is empty.', 'err');
    try {
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
      const zip = new JSZip();
      for (const f of files) zip.file(f.path, f.bytes);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `atria-workspace-${Date.now()}.zip` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Zipped ${files.length} file(s).`, 'ok');
    } catch (e) {
      toast('Zip failed: ' + e.message, 'err');
    }
  }

  async function uploadFiles(fileList) {
    let n = 0;
    for (const file of fileList) {
      const buf = new Uint8Array(await file.arrayBuffer());
      await vfs.write(file.name, buf, { source: 'user' });
      n++;
    }
    await refreshFiles();
    toast(`Added ${n} file(s) to the workspace.`, 'ok');
    return n;
  }
/* ------------------------------------------------------------ artifacts -- */

  async function loadArtifacts() {
    const stored = await vfs.kvGet('artifacts');
    state.artifacts = Array.isArray(stored) ? stored : [];
    renderArtifacts();
  }

  async function addArtifact(entry) {
    state.artifacts = [entry, ...state.artifacts.filter((a) => a.path !== entry.path)].slice(0, 60);
    await vfs.kvSet('artifacts', state.artifacts);
    renderArtifacts();
  }

  function renderArtifacts() {
    const box = $('#artifactList');
    box.innerHTML = '';
    if (!state.artifacts.length) {
      box.append(el('div', { class: 'empty', text: 'No artifacts yet. The agent creates them with create_artifact — HTML reports, dashboards, charts.' }));
      return;
    }
    for (const a of state.artifacts) {
      const row = el('div', { class: 'file-row' }, [
        el('span', { text: a.path.endsWith('.html') ? '🌐' : isImagePath(a.path) ? '🖼' : '📄' }),
        el('span', { class: 'fname', text: a.title || a.path }),
        el('span', { class: 'fsize', text: fmtTime(a.createdAt) }),
      ]);
      row.addEventListener('click', () => onPreviewArtifact(a));
      box.append(row);
    }
  }

  /* ----------------------------------------------------------------- plan -- */

  function setPlan(tasks) {
    const box = $('#planList');
    box.innerHTML = '';
    if (!tasks?.length) {
      box.append(el('div', { class: 'empty', text: 'No active plan. The agent posts a todo list here on long tasks.' }));
      return;
    }
    const ul = el('ul');
    for (const t of tasks) {
      ul.append(el('li', { class: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : '' }, [
        el('span', { class: 'st', text: t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '⏳' : '⬜' }),
        el('span', { text: t.text }),
      ]));
    }
    box.append(el('div', { class: 'plan-card' }, [el('h5', { text: 'Current plan' }), ul]));
    renderPlanBubble(tasks);
  }

  // Kept in the chat for context as well.
  function renderPlanBubble(tasks) {
    const target = document.getElementById('livePlan');
    if (!target) return;
    target.innerHTML = '';
    const ul = el('ul');
    for (const t of tasks) {
      ul.append(el('li', { class: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : '' }, [
        el('span', { class: 'st', text: t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '⏳' : '⬜' }),
        el('span', { text: t.text }),
      ]));
    }
    target.append(ul);
  }

  /* ------------------------------------------------------------------ log -- */

  function log(entry) {
    state.log.unshift({ at: Date.now(), ...entry });
    state.log = state.log.slice(0, 200);
    const box = $('#logList');
    box.innerHTML = '';
    for (const e of state.log) {
      box.append(el('div', { class: 'log-entry' + (e.ok === false ? ' err' : '') }, [
        el('div', {}, [
          el('span', { class: 'lt', text: fmtTime(e.at) + '  ' }),
          el('span', { class: 'ln', text: e.kind || 'event' }),
          el('span', { class: 'lt', text: e.ms ? `  ${e.ms} ms` : '' }),
        ]),
        el('div', { style: 'color:var(--text-dim);margin-top:3px;word-break:break-word', text: e.text || e.extra || '' }),
      ]));
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.side-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.side-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
  }

  return {
    state, refreshFiles, previewFile, downloadFile, downloadZip, uploadFiles, clearPreview,
    addArtifact, loadArtifacts, renderArtifacts, setPlan, log, switchTab,
  };
}
