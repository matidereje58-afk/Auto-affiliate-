// Atria Agent — application controller.

import { $, el, fmtDuration, fmtBytes } from './lib/util.js';
import { vfs } from './lib/vfs.js';
import { settings, conversations, memory, memoryForPrompt, newConversation } from './lib/store.js';
import { pythonSandbox, jsSandbox } from './lib/sandbox.js';
import { runAgent, runSubagent, buildSystemPrompt } from './agent/loop.js';
import { createPanels } from './ui/panels.js';
import { openSettings, openHistory, openArtifact, toast } from './ui/modals.js';
import {
  renderWelcome, renderSuggestions, addUserMessage, beginTurn, newStep, addReasoningBlock,
  addContentBlock, addToolCard, finishToolCard, addPlanCard, addArtifactCard, addErrorCard,
  addNoteCard, scrollToBottom, SUGGESTIONS,
} from './ui/render.js';

const state = {
  conv: newConversation(),
  running: false,
  abort: null,
  usage: { prompt: 0, completion: 0, steps: 0 },
};

const panels = createPanels({ onPreviewArtifact: (a) => openArtifact(a), toast });

/* ------------------------------------------------------------- status bar -- */

function setStatus(text, stateName = 'idle') {
  $('#statusText').textContent = text;
  $('#statusPill').dataset.state = stateName;
}

function updateUsage() {
  $('#sbTokens').textContent = `tokens: ${state.usage.prompt.toLocaleString()} in / ${state.usage.completion.toLocaleString()} out`;
  $('#sbSteps').textContent = `steps: ${state.usage.steps}`;
  const bar = $('#usageBar');
  bar.innerHTML = '';
  bar.append(
    el('span', { text: `${state.usage.prompt.toLocaleString()} prompt tokens` }),
    el('span', { text: `${state.usage.completion.toLocaleString()} completion tokens` }),
    el('span', { text: `${state.usage.steps} model step(s)` }),
    el('span', { text: `${settings.data.reasoningEffort} effort` }),
    el('span', { text: `${panels.state.files.length} workspace file(s)` }),
  );
}

function setSandboxState(which, s) {
  if (which !== 'python') return;
  const node = $('#sbSandbox');
  node.dataset.state = s === 'ready' ? 'ready' : s === 'loading' ? 'loading' : s === 'error' ? 'error' : 'cold';
  node.textContent = `python sandbox: ${s === 'ready' ? `ready (${s})` : s}`;
}

pythonSandbox.onStateChange = setSandboxState;
jsSandbox.onStateChange = setSandboxState;

/* ------------------------------------------------------------ conversation -- */

function saveConversation() {
  if (!state.conv.messages.length) return;
  conversations.save({ ...state.conv, usage: state.usage });
}

function newChat() {
  saveConversation();
  state.conv = newConversation();
  state.usage = { prompt: 0, completion: 0, steps: 0 };
  updateUsage();
  renderWelcome((text) => { $('#input').value = text; send(); });
  panels.setPlan([]);
  setStatus('idle');
}

function loadConversation(id) {
  const conv = conversations.get(id);
  if (!conv) return;
  state.conv = { ...conv, messages: conv.messages || [] };
  state.usage = conv.usage || { prompt: 0, completion: 0, steps: 0 };
  rebuildChatFromHistory();
  updateUsage();
  toast('Conversation loaded.', 'ok');
}

function rebuildChatFromHistory() {
  $('#messages').innerHTML = '';
  const msgs = state.conv.messages.filter((m) => m.role !== 'system');
  if (!msgs.length) { renderWelcome((t) => { $('#input').value = t; send(); }); return; }
  let turn = null;
  for (const m of msgs) {
    if (m.role === 'user') { turn = null; addUserMessage(m.content); continue; }
    if (m.role !== 'assistant') continue;
    if (!turn) turn = beginTurn();
    if (m.content?.trim()) addContentBlock(turn, m.content);
    for (const tc of m.tool_calls || []) {
      const ref = addToolCard(turn, { id: tc.id, name: tc.function.name, args: safeParse(tc.function.arguments) });
      const result = state.conv.messages.find((x) => x.role === 'tool' && x.tool_call_id === tc.id);
      finishToolCard(ref, { error: false, output: result?.content ?? '(result not retained in history)', ms: 0 });
    }
    turn = null;
  }
  scrollToBottom();
}

function safeParse(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return { _raw: raw }; }
}

/* ------------------------------------------------------------- system prompt -- */

async function workspaceSummary() {
  const files = await vfs.list();
  if (!files.length) return 'The workspace is currently empty.';
  const rows = files.slice(0, 40).map((f) => `- ${f.path} (${fmtBytes(f.size)})`);
  const more = files.length > 40 ? `\n…and ${files.length - 40} more.` : '';
  return `${files.length} file(s):\n${rows.join('\n')}${more}`;
}

async function buildMessages() {
  const system = buildSystemPrompt({
    systemPrompt: settings.data.systemPrompt,
    workspaceSummary: await workspaceSummary(),
    memory: memoryForPrompt(),
  });
  const messages = state.conv.messages.filter((m) => m.role !== 'system');
  return [{ role: 'system', content: system }, ...messages];
}
/* ---------------------------------------------------------------- run turn -- */

let currentTurn = null;
let liveToolCards = new Map();

function summarize(args) {
  if (!args || typeof args !== 'object') return '';
  const s = Object.entries(args).map(([k, v]) => `${k}=${String(v).slice(0, 80).replace(/\s+/g, ' ')}`).join(', ');
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'step_start':
      if (!currentTurn) currentTurn = beginTurn();
      newStep(currentTurn);
      state.usage.steps += 1;
      updateUsage();
      setStatus(ev.step === 1 ? 'thinking' : `step ${ev.step}/${ev.maxSteps}`, 'thinking');
      break;
    case 'reasoning':
      if (!currentTurn) currentTurn = beginTurn();
      addReasoningBlock(currentTurn, ev.text);
      break;
    case 'content':
      if (!currentTurn) currentTurn = beginTurn();
      addContentBlock(currentTurn, ev.text, { live: true });
      break;
    case 'tool_args': {
      const ref = liveToolCards.get(ev.index);
      if (ref && ev.name) ref.card.querySelector('.tool-name').textContent = ev.name;
      break;
    }
    case 'tool_start': {
      if (!currentTurn) currentTurn = beginTurn();
      setStatus(`running ${ev.name}`, 'tool');
      liveToolCards.set(ev.id, addToolCard(currentTurn, { id: ev.id, name: ev.name, args: ev.args }));
      break;
    }
    case 'tool_end': {
      const ref = liveToolCards.get(ev.id);
      if (ref) finishToolCard(ref, { error: ev.error, output: ev.output, ms: ev.ms });
      liveToolCards.delete(ev.id);
      panels.log({ kind: ev.name, ok: !ev.error, ms: ev.ms, extra: summarize(ev.args) });
      break;
    }
    case 'assistant_message':
      if (!currentTurn) currentTurn = beginTurn();
      break;
    case 'usage':
      state.usage.prompt += ev.usage.prompt_tokens || 0;
      state.usage.completion += ev.usage.completion_tokens || 0;
      updateUsage();
      break;
    case 'retry':
      setStatus(`retrying (${ev.attempt})…`, 'thinking');
      panels.log({ kind: 'retry', ok: false, text: ev.error });
      break;
    case 'continue_truncated':
      panels.log({ kind: 'auto-continue', text: 'response hit the output limit — continuing' });
      break;
    case 'max_steps':
      addNoteCard(`Reached the step limit (${ev.steps}). Send "continue" to let the agent keep going.`);
      break;
    case 'aborted':
      addNoteCard('Run stopped by you.');
      break;
    case 'error':
      addErrorCard(ev.error, ev.hint);
      setStatus('error', 'error');
      break;
    case 'turn_done':
      setStatus('idle');
      break;
    default:
      break;
  }
}

async function runTurn() {
  state.running = true;
  state.abort = new AbortController();
  liveToolCards = new Map();
  currentTurn = null;
  $('#btnSend').disabled = true;
  $('#btnStop').hidden = false;
  setStatus('thinking', 'thinking');

  const working = await buildMessages();
  const started = performance.now();

  try {
    await runAgent({
      messages: working,
      settings: settings.data,
      emit: handleEvent,
      signal: state.abort.signal,
      memoryStore: memory,
      onArtifact: async (entry) => {
        await panels.addArtifact(entry);
        await panels.refreshFiles();
        if (settings.data.autoOpenArtifacts) openArtifact(entry);
        else toast(`Artifact ready: ${entry.path}`, 'ok');
      },
      onPlan: async (tasks) => {
        panels.setPlan(tasks);
        if (currentTurn) addPlanCard(currentTurn, tasks);
      },
      activity: (a) => panels.log(a),
      spawnSubagent: settings.data.enableSubagents
        ? ({ task, maxSteps }) => runSubagent({
            task, maxSteps, settings: settings.data,
            emit: (e) => {
              if (e.type === 'tool_start') panels.log({ kind: `subagent · ${e.name}`, text: summarize(e.args) });
              if (e.type === 'tool_end') panels.log({ kind: `subagent · ${e.name}`, ok: !e.error, ms: e.ms });
            },
            signal: state.abort.signal,
            memoryStore: memory,
            onArtifact: async (entry) => { await panels.addArtifact(entry); await panels.refreshFiles(); },
            onPlan: async (t) => panels.setPlan(t),
            activity: (a) => panels.log({ ...a, kind: 'subagent · ' + (a.kind || '') }),
          })
        : null,
    });
  } catch (err) {
    addErrorCard(err.message);
  } finally {
    state.conv.messages = working.filter((m) => m.role !== 'system');
    if (currentTurn) currentTurn.root.querySelectorAll('.tool-card .spinner').forEach((s) => s.remove());
    currentTurn = null;
    state.running = false;
    $('#btnSend').disabled = false;
    $('#btnStop').hidden = true;
    if ($('#statusPill').dataset.state !== 'error') setStatus('idle');
    saveConversation();
    await panels.refreshFiles();
    updateUsage();
    panels.log({ kind: 'turn complete', text: `${((performance.now() - started) / 1000).toFixed(1)}s` });
  }
}
async function send(textOverride) {
  if (state.running) return;
  const input = $('#input');
  const text = (textOverride ?? input.value).trim();
  if (!text) return;

  if (!state.conv.messages.length) state.conv.title = text.slice(0, 60);
  $('#suggestions').style.display = 'none';
  input.value = '';
  autoResize();
  if (isMobile()) input.blur();   // dismiss the on-screen keyboard so the answer is visible
  state.conv.messages.push({ role: 'user', content: text });
  addUserMessage(text);
  await runTurn();
}

function stopRun() {
  if (!state.running) return;
  state.abort?.abort();
  setStatus('stopping…', 'idle');
}

/* -------------------------------------------------------------------- init -- */

function autoResize() {
  const input = $('#input');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 260) + 'px';
}

const isMobile = () => window.matchMedia('(max-width: 860px), (max-height: 520px) and (pointer: coarse)').matches;

function openSide() {
  document.body.classList.remove('side-hidden');
  panels.switchTab(panels.state.activeTab || 'files');
  if (isMobile()) $('#scrim').hidden = false;
  $('#btnWorkspace').setAttribute('aria-expanded', 'true');
}

function closeSide() {
  if (isMobile()) {
    document.body.classList.add('side-hidden');
    $('#scrim').hidden = true;
  } else {
    document.body.classList.add('side-hidden');
  }
  $('#btnWorkspace').setAttribute('aria-expanded', 'false');
}

function toggleSide() {
  if (document.body.classList.contains('side-hidden')) openSide();
  else closeSide();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  settings.save({ theme });
}

function refreshSettingsUi() {
  $('#modelChip').textContent = settings.data.model;
  $('#sbModel').textContent = `model: ${settings.data.model}`;
  $('#effortLabel').textContent = settings.data.reasoningEffort;
  $('#stepHint').textContent = `max ${settings.data.maxSteps} steps`;
}

function wireUi() {
  const input = $('#input');
  input.addEventListener('input', autoResize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    if (e.key === 'Escape') stopRun();
  });
  $('#btnSend').addEventListener('click', () => send());
  $('#btnStop').addEventListener('click', stopRun);
  $('#btnNew').addEventListener('click', () => newChat());
  $('#btnHistory').addEventListener('click', () => openHistory({
    currentId: state.conv.id,
    onPick: (id) => loadConversation(id),
    onNew: () => newChat(),
  }));
  $('#btnSettings').addEventListener('click', () => openSettings({
    onSaved: () => { refreshSettingsUi(); toast('Settings saved.', 'ok'); },
    onWipe: async () => { await panels.refreshFiles(); panels.clearPreview(); panels.renderArtifacts(); },
  }));
  $('#btnTheme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#btnWorkspace').addEventListener('click', toggleSide);
  $('#btnSideClose').addEventListener('click', closeSide);
  $('#scrim').addEventListener('click', closeSide);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#scrim').hidden) closeSide();
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) { $('#scrim').hidden = true; document.body.classList.remove('side-hidden'); }
  });
  $('#btnEffort').addEventListener('click', () => {
    const order = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(settings.data.reasoningEffort) + 1) % order.length];
    settings.save({ reasoningEffort: next });
    refreshSettingsUi();
    toast(`Reasoning effort: ${next}`);
  });
  $('#fileInput').addEventListener('change', async (e) => {
    if (e.target.files?.length) {
      await panels.uploadFiles(e.target.files);
      const names = Array.from(e.target.files).map((f) => f.name).join(', ');
      input.value = (input.value ? input.value + '\n\n' : '') + `Files added to the workspace: ${names}`;
      autoResize();
    }
    e.target.value = '';
  });
  $('#btnUpload').addEventListener('click', () => $('#fileInput').click());
  $('#btnNewFile').addEventListener('click', async () => {
    const name = prompt('New file name (e.g. notes.md or data.csv):');
    if (!name) return;
    await vfs.write(name, '');
    await panels.refreshFiles();
    panels.previewFile(name);
  });
  $('#btnZip').addEventListener('click', () => panels.downloadZip());
  $('#btnClearWs').addEventListener('click', async () => {
    if (!confirm('Delete every workspace file?')) return;
    await vfs.clear();
    await vfs.kvDelete('artifacts');
    await panels.refreshFiles();
    panels.clearPreview();
    panels.renderArtifacts();
    toast('Workspace cleared.');
  });
  $('#btnOpenArtifact').addEventListener('click', () => {
    const first = panels.state.artifacts[0];
    if (!first) return toast('No artifacts yet.', 'err');
    openArtifact(first);
  });
  $('#btnArtifactFull').addEventListener('click', () => {
    const first = panels.state.artifacts[0];
    if (!first) return toast('No artifacts yet.', 'err');
    panels.downloadFile(first.path);
    toast('Downloaded — open the file in a new tab to see it full-screen.', 'ok');
  });
  document.querySelectorAll('.side-tab').forEach((tab) => {
    tab.addEventListener('click', () => panels.switchTab(tab.dataset.tab));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
  });
  window.addEventListener('beforeunload', saveConversation);
}

async function boot() {
  settings.load();
  applyTheme(settings.data.theme || 'dark');
  wireUi();
  // On phones the side panel starts closed so the chat gets the full width.
  if (isMobile()) { document.body.classList.add('side-hidden'); $('#scrim').hidden = true; }
  refreshSettingsUi();
  $('#suggestions').style.display = '';
  renderWelcome((text) => { $('#input').value = text; send(); });
  updateUsage();
  await panels.refreshFiles();
  await panels.loadArtifacts();

  panels.log({ kind: 'session', text: `model ${settings.data.model} · effort ${settings.data.reasoningEffort}` });

  pythonSandbox.boot()
    .then((msg) => panels.log({ kind: 'python ready', text: `Pyodide ${msg.version}` }))
    .catch((e) => panels.log({ kind: 'python boot failed', ok: false, text: e.message }));
  jsSandbox.boot().catch(() => {});

  if (!settings.data.apiKey) openSettings({ onSaved: refreshSettingsUi });
  else toast('Atria Agent ready — ask for something ambitious.', 'ok');
}

boot();
