/**
 * WorkBuddy — application shell.
 *
 * Boots Puter, loads the live model catalogue, wires the agent runtime to the
 * transcript/inspector, and owns all user input handling.
 */
import { puterClient } from './puter-client.js';
import { store } from './store.js';
import { buildCatalog, mergeLive, findModel, formatContext } from './lib/catalog.js';
import { EFFORT_META, describeLevel, adaptEffortToModel } from './lib/effort.js';
import { estimateConversationTokens, contextUsage, formatTokens } from './lib/tokens.js';
import { Transcript } from './ui/transcript.js';
import { Inspector } from './ui/inspector.js';
import { ModelPicker } from './ui/model-picker.js';
import { createToolRuntime } from './agent/tools.js';
import { runAgentTurn } from './agent/loop.js';
import { verifyEffortLevels, probeModel, verificationKey } from './agent/verify.js';
import { $, el, clear, toast, timeAgo, formatBytes } from './ui/dom.js';

const state = {
  catalog: { models: [], live: false },
  model: null,
  level: null,
  running: false,
  abort: null,
  usage: { input: 0, output: 0, cost: 0 },
  attachments: [],
  provider: null,
};

const dom = {
  app: $('#app'),
  transcript: $('#transcript'),
  prompt: $('#prompt'),
  send: $('#send-btn'),
  stop: $('#stop-btn'),
  modelBtn: $('#model-btn'),
  modelName: $('#model-name'),
  modelVendor: $('#model-vendor'),
  modelDot: $('#model-dot'),
  effortChips: $('#effort-chips'),
  modeToggle: $('#mode-toggle'),
  ctxMeter: $('#ctx-meter'),
  ctxLabel: $('#ctx-label'),
  sessions: $('#session-list'),
  fileTree: $('#file-tree'),
  fileCount: $('#file-count'),
  accountBtn: $('#account-btn'),
  accountName: $('#account-name'),
  accountSub: $('#account-sub'),
  accountAvatar: $('#account-avatar'),
  webBtn: $('#websearch-btn'),
  autoBtn: $('#autocontinue-btn'),
  newChat: $('#new-chat'),
  hint: $('#composer-hint'),
};

const transcript = new Transcript(dom.transcript, {
  onSuggestion: ({ prompt, file }) => {
    dom.prompt.value = prompt;
    dom.prompt.focus();
    if (file) state.attachments = [{ name: file, path: file }];
    renderAttachments();
  },
});
const inspector = new Inspector();
const picker = new ModelPicker({
  getCatalog: () => state.catalog,
  getSelected: () => ({ model: state.model, level: state.level }),
  getVerification: (key) => store.getVerification(key),
  onSelect: (model, level) => selectModel(model, level),
  onVerify: (model, effort) => verifyModel(model, effort),
  onPinProvider: (model, provider) => {
    state.provider = provider;
    toast(provider ? `Pinned to ${provider}` : 'Provider routing set to automatic');
  },
});

// ---------------------------------------------------------------- boot ----
async function boot() {
  renderSessions();
  renderFiles();
  inspector.renderPlan(store.project.plan);
  inspector.log('WorkBuddy starting…', 'meta');
  transcript.renderAll(store.project.messages);
  bindUi();
  syncSettingsUi();
  inspector.__onRestore = (id) => {
    if (store.restoreCheckpoint(id)) {
      renderFiles();
      toast('Checkpoint restored', 'ok');
    }
  };

  try {
    dom.modelName.textContent = 'Connecting to Puter…';
    await puterClient.ready();
    inspector.log('Puter.js ready', 'ok');
  } catch (error) {
    dom.modelName.textContent = 'Puter.js unavailable';
    dom.modelDot.style.background = 'var(--danger)';
    inspector.log(error.message, 'err');
    toast(error.message, 'error');
    return;
  }

  await loadCatalog();
  await refreshAccount();
}

async function loadCatalog({ force = false } = {}) {
  let bundled = { models: [] };
  try {
    const response = await fetch('./data/models.json');
    if (response.ok) bundled = await response.json();
  } catch {
    /* offline fallback below */
  }

  let catalog = bundled;
  try {
    const live = await puterClient.listModels({ force });
    catalog = mergeLive(live, bundled);
    if (!catalog.models.length) catalog = buildCatalog(live);
    inspector.log(`Live catalogue: ${catalog.models.length} callable models (${live.length} provider entries)`, 'ok');
  } catch (error) {
    inspector.log(`Live catalogue failed (${error.message}); using bundled snapshot`, 'err');
    toast('Using the bundled model snapshot — live catalogue unavailable', 'error');
  }
  if (!catalog.models?.length) {
    toast('No models available', 'error');
    return;
  }
  state.catalog = catalog;
  picker.setCatalog(catalog);
  restoreSelection();
  renderModelButton();
  renderEffortChips();
  renderContextMeter();
}

function restoreSelection() {
  const wanted = store.project.modelId ?? store.settings.modelId;
  let model = findModel(state.catalog.models, wanted);
  if (!model) model = findModel(state.catalog.models, 'anthropic/claude-opus-5-5');
  if (!model) model = findModel(state.catalog.models, 'openai/gpt-6-astra');
  if (!model) model = state.catalog.models[0];
  const level = store.project.level ?? store.settings.level;
  selectModel(model, level, { silent: true });
}

function selectModel(model, level, { silent = false } = {}) {
  if (!model) return;
  // Clamp thinking budgets to what this specific model can emit.
  model.effort = adaptEffortToModel(model.effort, model);
  state.model = model;
  const levels = model.effort?.levels ?? [];
  state.level = levels.length ? (levels.includes(level) ? level : model.effort.defaultLevel ?? levels[0]) : null;
  state.provider = null;
  store.project.modelId = model.id;
  store.project.level = state.level;
  store.updateSettings({ modelId: model.id, level: state.level });
  renderModelButton();
  renderEffortChips();
  inspector.renderModelCard({
    model,
    level: state.level,
    effort: model.effort,
    getVerification: (key) => store.getVerification(key),
    usage: state.usage,
  });
  if (!silent) inspector.log(`Model → ${model.name}${state.level ? ' · effort ' + state.level : ''}`, 'meta');
}

function renderModelButton() {
  if (!state.model) return;
  dom.modelName.textContent = state.model.name;
  dom.modelVendor.textContent = state.model.vendor;
  dom.modelDot.style.background = state.model.free ? 'var(--warn)' : 'var(--accent-3)';
  dom.modelBtn.title = `${state.model.id} · ${formatContext(state.model.context)} context`;
}

function renderEffortChips() {
  clear(dom.effortChips);
  if (!state.model) return;
  const effort = state.model.effort ?? { mode: 'none', levels: [] };
  if (!effort.levels.length) {
    dom.effortChips.append(
      el('span', {
        class: 'effort-note',
        title: effort.note ?? '',
        text: effort.mode === 'fixed' ? 'thinking: always on' : 'no effort control',
      }),
    );
    return;
  }
  for (const level of effort.levels) {
    const record = store.getVerification(verificationKey(state.model.id, level));
    const classes = ['effort-chip'];
    if (level === state.level) classes.push('active');
    if (record?.ok) classes.push('verified');
    if (record && !record.ok) classes.push('failed');
    dom.effortChips.append(
      el('button', {
        class: classes.join(' '),
        title: `${describeLevel(effort, level) || EFFORT_META[level]?.hint || level}${record ? (record.ok ? ` — verified in ${record.ms}ms` : ` — failed: ${record.error}`) : ' — not tested yet'}`,
        onclick: () => setLevel(level),
      }, levelLabel(level)),
    );
  }
  dom.effortChips.append(
    el('button', {
      class: 'chip',
      title: 'Call the model once per effort level to prove which ones really work',
      onclick: () => verifyModel(state.model, state.model.effort),
    }, 'verify'),
  );
}

function levelLabel(level) {
  if (EFFORT_META[level]?.label) return EFFORT_META[level].label;
  return String(level).charAt(0).toUpperCase() + String(level).slice(1);
}

function setLevel(level) {
  if (!state.model?.effort?.levels?.includes(level)) return;
  state.level = level;
  store.updateSettings({ level });
  store.project.level = level;
  renderEffortChips();
  inspector.renderModelCard({
    model: state.model,
    level,
    effort: state.model.effort,
    getVerification: (key) => store.getVerification(key),
    usage: state.usage,
  });
}

async function verifyModel(model, effort) {
  if (!model) return;
  const levels = effort?.levels?.length ? effort.levels : [null];
  inspector.log(`Verifying ${model.name} (${levels.length} level${levels.length > 1 ? 's' : ''})…`, 'meta');
  toast(`Verifying ${model.name} against the live API…`);
  const controller = new AbortController();
  const results = await verifyEffortLevels({
    client: puterClient,
    store,
    model,
    effort,
    levels,
    provider: state.provider,
    signal: controller.signal,
    onProgress: ({ status, level, outcome }) => {
      if (status === 'finished') {
        inspector.log(
          `${model.id} @ ${level ?? 'default'}: ${outcome.ok ? `ok (${outcome.ms}ms)` : 'failed — ' + outcome.error}`,
          outcome.ok ? 'ok' : 'err',
        );
      }
      renderEffortChips();
    },
  });
  const passed = Object.entries(results).filter(([, r]) => r.ok).length;
  toast(`${model.name}: ${passed}/${levels.length} level(s) verified`, passed ? 'ok' : 'error');
  renderEffortChips();
  if (state.model?.id === model.id) {
    inspector.renderModelCard({
      model,
      level: state.level,
      effort: model.effort,
      getVerification: (key) => store.getVerification(key),
      usage: state.usage,
    });
  }
}

function renderContextMeter() {
  const usage = contextUsage(conversationHistory(), state.model?.context ?? 128000);
  dom.ctxMeter.querySelector('i').style.width = Math.min(100, usage.ratio * 100).toFixed(1) + '%';
  dom.ctxLabel.textContent = formatTokens(usage.used) + ' / ' + formatTokens(usage.window);
  dom.ctxMeter.title = `${usage.used.toLocaleString()} of ${usage.window.toLocaleString()} tokens used in this session`;
}

function conversationHistory() {
  return store.project.history ?? [];
}

// ------------------------------------------------------------- sessions ----
function renderSessions() {
  clear(dom.sessions);
  const projects = [...store.state.projects].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const project of projects) {
    const active = project.id === store.project.id;
    const row = el('button', { class: 'session' + (active ? ' active' : ''), onclick: () => switchProject(project.id) },
      el('span', { class: 's-title', text: project.name }),
      el('span', { class: 's-time', text: timeAgo(project.updatedAt) }),
    );
    const del = el('span', { class: 's-del', text: '✕', title: 'Delete session' });
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      store.deleteProject(project.id);
      switchProject(store.project.id);
      renderSessions();
    });
    row.append(del);
    dom.sessions.append(row);
  }
}

function switchProject(id) {
  if (state.running) {
    toast('Stop the current run first', 'error');
    return;
  }
  store.selectProject(id);
  transcript.renderAll(store.project.messages);
  renderSessions();
  renderFiles();
  inspector.renderPlan(store.project.plan);
  renderContextMeter();
  restoreSelection();
}

function renderFiles() {
  const files = store.project.files ?? {};
  dom.fileCount.textContent = String(Object.keys(files).length);
  clear(dom.fileTree);
  const paths = Object.keys(files).sort();
  if (!paths.length) {
    dom.fileTree.append(el('div', { class: 'empty', text: 'Empty workspace' }));
  } else {
    for (const path of paths) {
      dom.fileTree.append(
        el('div', { class: 'file-row' },
          el('span', { text: '▸' }),
          el('span', { text: path }),
          el('span', { class: 'f-size', text: formatBytes((files[path]?.content ?? '').length) }),
        ),
      );
    }
  }
  inspector.renderFiles(files, null, store.project.checkpoints ?? []);
}

function renderAttachments() {
  const host = $('#attachments');
  clear(host);
  for (const [index, file] of state.attachments.entries()) {
    host.append(
      el('span', { class: 'attachment' }, '📎 ' + file.name,
        el('button', { onclick: () => { state.attachments.splice(index, 1); renderAttachments(); } }, '✕'),
      ),
    );
  }
}

// ---------------------------------------------------------------- send ----
async function handleSend() {
  const text = dom.prompt.value.trim();
  if (!text) return;
  if (text.startsWith('/')) {
    dom.prompt.value = '';
    autosize();
    return handleSlash(text);
  }
  if (state.running) {
    toast('Already running — stop the current turn first', 'error');
    return;
  }
  if (!state.model) {
    picker.open();
    return;
  }
  const attachments = state.attachments.slice();
  state.attachments = [];
  renderAttachments();
  dom.prompt.value = '';
  autosize();

  let content = text;
  if (attachments.length) {
    const fileBlocks = attachments
      .map((file) => {
        const stored = store.readFile(file.path) ?? file.content ?? '';
        return `\n\n[attached file: ${file.path}]\n\`\`\`\n${String(stored).slice(0, 12000)}\n\`\`\``;
      })
      .join('');
    content += fileBlocks;
  }
  if (transcript.inner.querySelector('.hero')) transcript.inner.replaceChildren();
  transcript.inner.append(transcript.userBubble({ content, createdAt: Date.now() }));
  transcript.scrollToBottom(true);
  await runTurn(content);
}

async function runTurn(userText) {
  state.running = true;
  state.abort = new AbortController();
  setRunning(true);
  store.checkpoint('before turn');

  const history = store.project.history ?? [];
  history.push({ role: 'user', content: userText });

  const view = transcript.beginTurn({
    modelName: state.model.name,
    level: state.level,
  });
  currentView = view;
  const turnUsage = { input: 0, output: 0, cost: 0 };
  let finished = false;
  let lastError = null;

  const runtime = createToolRuntime({
    store,
    cloud: true,
    askUser: askUserDialog,
    onEvent: (event) => handleRuntimeEvent(event, view),
  });

  const emit = (event) => {
    switch (event.type) {
      case 'step_start':
        inspector.log(`step ${event.step}/${event.maxSteps} → ${state.model.id}${state.level ? ' @ ' + state.level : ''}`, 'meta');
        break;
      case 'assistant_reasoning':
        view.setReasoning(event.text);
        break;
      case 'assistant_text':
        view.setText(event.text);
        break;
      case 'step_tool':
        view.toolStart({ id: event.call.id, name: event.call.name, input: event.call.input });
        break;
      case 'usage':
        turnUsage.input += event.usage?.input ?? 0;
        turnUsage.output += event.usage?.output ?? 0;
        turnUsage.cost += event.usage?.cost ?? 0;
        break;
      case 'error':
        inspector.log(`error (${event.kind}): ${event.message}`, 'err');
        if (event.kind !== 'aborted') {
          view.error(event.message);
          lastError = event;
        }
        break;
      case 'turn_error':
        lastError = event.error;
        view.error(event.error?.message ?? 'Request failed');
        break;
      case 'step_limit':
        inspector.log('Step budget exhausted', 'meta');
        break;
      case 'turn_end':
        finished = true;
        break;
      default:
        break;
    }
  };

  let result = await runAgentTurn({
    client: puterClient,
    store,
    runtime,
    model: state.model,
    effort: state.model.effort,
    level: state.level,
    history,
    mode: store.settings.mode,
    maxSteps: store.settings.maxSteps,
    signal: state.abort.signal,
    temperature: store.settings.temperature,
    webSearch: store.settings.webSearch,
    compaction: store.settings.compaction,
    provider: state.provider,
    onEvent: emit,
  });

  // Long-running work: keep going automatically when the step budget runs out.
  let continuations = 0;
  while (
    result.hitStepLimit &&
    store.settings.autoContinue &&
    continuations < 4 &&
    !state.abort.signal.aborted
  ) {
    continuations += 1;
    inspector.log(`auto-continue ${continuations}/4`, 'meta');
    result.messages.push({
      role: 'user',
      content: 'Continue exactly where you stopped. Keep the plan current, finish the remaining tasks, and verify them.',
    });
    result = await runAgentTurn({
      client: puterClient,
      store,
      runtime,
      model: state.model,
      effort: state.model.effort,
      level: state.level,
      history: result.messages,
      mode: store.settings.mode,
      maxSteps: store.settings.maxSteps,
      signal: state.abort.signal,
      temperature: store.settings.temperature,
      webSearch: store.settings.webSearch,
      compaction: store.settings.compaction,
      provider: state.provider,
      onEvent: emit,
    });
  }

  store.project.history = trimHistory(result.messages);
  store.project.usage = {
    input: (store.project.usage?.input ?? 0) + turnUsage.input,
    output: (store.project.usage?.output ?? 0) + turnUsage.output,
    cost: (store.project.usage?.cost ?? 0) + turnUsage.cost,
  };
  state.usage = store.project.usage;

  view.finalize({
    finished: finished || result.finished,
    steps: view.steps.length,
    usage: turnUsage,
    durationMs: Date.now() - view.startTime,
  });
  if (result.aborted) view.error('Stopped by user.');
  if (!result.finished && !result.aborted && !result.hitStepLimit && !lastError) {
    view.error('The model ended the turn without calling finish.');
  }

  store.addMessage({
    role: 'assistant',
    content: view.textValue,
    reasoning: view.reasoningValue,
    steps: view.steps,
    usage: turnUsage,
    durationMs: Date.now() - view.startTime,
    modelName: state.model?.name,
    level: state.level,
    finished: finished || result.finished,
    error: lastError?.message ?? null,
  });
  transcript.live = null;
  currentView = null;
  state.running = false;
  state.abort = null;
  setRunning(false);
  renderContextMeter();
  renderFiles();
  renderSessions();
  if (state.model) {
    inspector.renderModelCard({
      model: state.model,
      level: state.level,
      effort: state.model.effort,
      getVerification: (key) => store.getVerification(key),
      usage: state.usage,
    });
  }
  runtime.dispose?.();
}

let currentView = null;

function handleRuntimeEvent(event, view) {
  switch (event.type) {
    case 'tool_end':
      view?.toolEnd({
        name: event.name,
        ok: event.ok,
        summary: event.summary,
        ms: event.ms,
        ui: event.ui,
      });
      inspector.log(`${event.name}: ${event.ok ? 'ok' : 'failed'} (${event.ms}ms)`, event.ok ? 'ok' : 'err');
      if (event.done && event.ui?.summary) view?.completion({ summary: event.ui.summary, files: event.ui.files ?? [] });
      break;
    case 'tool_status':
      inspector.log(event.status, 'meta');
      break;
    case 'file_changed':
      inspector.log(`${event.action} ${event.path} (+${event.added}/-${event.removed})`, 'meta');
      renderFiles();
      if (/\.html?$/i.test(event.path)) inspector.setPreview(event.after, event.path);
      break;
    case 'file_deleted':
      inspector.log(`deleted ${event.path}`, 'meta');
      renderFiles();
      break;
    case 'preview':
      inspector.setPreview(event.html, event.path);
      inspector.log(`preview updated${event.path ? ' · ' + event.path : ''}`, 'ok');
      break;
    default:
      break;
  }
}

/** Blocking-ish inline question used by the ask_user tool. */
function askUserDialog(question) {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'modal open' });
    const box = el('div', { class: 'modal-card', style: 'height:auto;max-width:560px' });
    const input = el('textarea', { rows: '3', style: 'width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg-elev-2);outline:none' });
    const close = (answer) => {
      overlay.remove();
      resolve(answer);
    };
    box.append(
      el('div', { class: 'modal-head' }, el('div', {}, el('h2', { text: 'The agent needs a decision' }), el('p', { text: question }))),
      el('div', { style: 'padding:14px;display:flex;flex-direction:column;gap:10px' },
        input,
        el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' },
          el('button', { class: 'btn ghost', onclick: () => close('(skipped)') }, 'Skip'),
          el('button', { class: 'btn primary', onclick: () => close(input.value.trim() || '(no answer)') }, 'Answer'),
        ),
      ),
    );
    overlay.append(box);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close('(skipped)');
    });
    document.body.append(overlay);
    setTimeout(() => input.focus(), 40);
  });
}

/** Keep the persisted conversation under a sane token budget. */
function trimHistory(messages) {
  const limit = 130000;
  if (estimateConversationTokens(messages) <= limit) return messages;
  const kept = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const approx = Math.ceil(JSON.stringify(messages[i]).length / 4);
    if (total + approx > limit) break;
    total += approx;
    kept.unshift(messages[i]);
  }
  while (kept.length && kept[0].role === 'tool') kept.shift();
  return kept;
}

function setRunning(running) {
  dom.send.hidden = running;
  dom.stop.hidden = !running;
  dom.prompt.disabled = running;
  dom.hint.textContent = running ? 'Agent is working — every step is visible above' : '';
  dom.modelDot.style.animation = running ? 'pulse 1.4s infinite' : '';
}

function syncSettingsUi() {
  const mode = store.settings.mode ?? 'agent';
  for (const button of dom.modeToggle.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.mode === mode);
  }
  dom.webBtn.classList.toggle('active', Boolean(store.settings.webSearch));
  dom.autoBtn.classList.toggle('active', Boolean(store.settings.autoContinue));
}

// ------------------------------------------------------------- commands ----
function handleSlash(command) {
  const [name, ...rest] = command.slice(1).split(/\s+/);
  switch (name) {
    case 'model':
      return picker.open();
    case 'verify':
      return verifyModel(state.model, state.model?.effort);
    case 'clear':
      store.clearMessages();
      store.project.history = [];
      transcript.renderAll([]);
      return renderContextMeter();
    case 'new':
      return newSession();
    case 'plan':
      return inspector.openTab('plan');
    case 'files':
      return inspector.openTab('files');
    case 'preview':
      return inspector.openTab('preview');
    case 'console':
      return inspector.openTab('console');
    case 'export': {
      const blob = new Blob([store.exportProject()], { type: 'application/json' });
      const link = el('a', { href: URL.createObjectURL(blob), download: `${store.project.name.replace(/\s+/g, '-')}.json` });
      link.click();
      return toast('Project exported', 'ok');
    }
    case 'model-info':
      return inspector.openTab('model');
    default:
      return toast(`Unknown command /${name} — try /model, /verify, /clear, /new, /plan, /files, /preview, /export`);
  }
}

// ------------------------------------------------------------------ ui ----
function autosize() {
  dom.prompt.style.height = 'auto';
  dom.prompt.style.height = Math.min(220, dom.prompt.scrollHeight) + 'px';
}

function newSession() {
  if (state.running) return toast('Stop the current run first', 'error');
  store.createProject();
  transcript.renderAll([]);
  renderSessions();
  renderFiles();
  inspector.renderPlan([]);
  renderContextMeter();
  restoreSelection();
}

async function refreshAccount() {
  const user = await puterClient.currentUser();
  if (user) {
    const label = user.username || user.email || 'Puter user';
    dom.accountName.textContent = label;
    dom.accountSub.textContent = 'cloud sync on';
    dom.accountAvatar.textContent = label[0]?.toUpperCase() ?? 'P';
  } else {
    dom.accountName.textContent = 'Guest';
    dom.accountSub.textContent = 'sign in for cloud saves';
    dom.accountAvatar.textContent = '?';
  }
}

function bindUi() {
  dom.send.addEventListener('click', handleSend);
  dom.stop.addEventListener('click', () => {
    state.abort?.abort();
    inspector.log('abort requested', 'meta');
  });
  dom.prompt.addEventListener('input', autosize);
  dom.prompt.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  dom.modelBtn.addEventListener('click', () => picker.open());
  dom.newChat.addEventListener('click', newSession);
  dom.webBtn.addEventListener('click', () => {
    store.updateSettings({ webSearch: !store.settings.webSearch });
    syncSettingsUi();
    toast(store.settings.webSearch ? 'Provider web search enabled (OpenAI models)' : 'Provider web search off');
  });
  dom.autoBtn.addEventListener('click', () => {
    store.updateSettings({ autoContinue: !store.settings.autoContinue });
    syncSettingsUi();
    toast(store.settings.autoContinue ? 'Auto-continue on: long tasks keep running' : 'Auto-continue off');
  });
  dom.modeToggle.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    store.updateSettings({ mode: button.dataset.mode });
    syncSettingsUi();
  });
  dom.accountBtn.addEventListener('click', async () => {
    if (puterClient.isSignedIn()) {
      await puterClient.signOut();
      await refreshAccount();
      toast('Signed out');
      return;
    }
    try {
      await puterClient.signIn();
      await refreshAccount();
      toast('Signed in — projects will sync to Puter cloud', 'ok');
      await loadCatalog({ force: true });
    } catch (error) {
      toast('Sign-in failed: ' + (error?.message ?? error), 'error');
    }
  });
  document.getElementById('collapse-sidebar').addEventListener('click', () => {
    dom.app.classList.toggle('no-sidebar');
  });
  document.getElementById('toggle-inspector').addEventListener('click', () => {
    dom.app.classList.toggle('no-inspector');
  });
  document.getElementById('refresh-models').addEventListener('click', async () => {
    toast('Refreshing catalogue…');
    await loadCatalog({ force: true });
    toast(`Catalogue refreshed: ${state.catalog.models.length} models`, 'ok');
  });

  const fileInput = el('input', { type: 'file', style: 'display:none', multiple: 'true' });
  document.body.append(fileInput);
  document.getElementById('attach-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files ?? []) {
      if (file.size > 512 * 1024) {
        toast(`${file.name} is larger than 512KB — skipped`, 'error');
        continue;
      }
      const content = await file.text();
      state.attachments.push({ name: file.name, path: file.name, content });
    }
    renderAttachments();
    fileInput.value = '';
  });

  store.addEventListener('change', (event) => {
    if (event.detail.kind === 'plan') inspector.renderPlan(store.project.plan);
    if (event.detail.kind === 'files') renderFiles();
    if (event.detail.kind === 'verification') renderEffortChips();
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.running) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  autosize();
  dom.prompt.focus();
}

boot().catch((error) => {
  console.error(error);
  inspector.log('boot failed: ' + error.message, 'err');
  toast('Failed to start: ' + error.message, 'error');
});

// expose a tiny debug surface for tests and power users
window.workbuddy = { state, store, transcript, inspector, picker, puterClient, loadCatalog, handleSend, selectModel, verifyModel, setLevel };
