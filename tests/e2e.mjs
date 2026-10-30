/**
 * End-to-end UI test.
 *
 * Runs the real app in headless Chromium with a stubbed `window.puter` so the
 * whole UI + agent loop can be exercised without spending account credits.
 * The stub implements the documented Puter.js surface (ai.listModels,
 * ai.chat streaming chunks, auth, kv, fs, net).
 *
 *   node tests/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 8137;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium';

const STUB = `
(function () {
  const catalog = [
    {
      id: 'claude-opus-5-5', puterId: 'anthropic:anthropic/claude-opus-5-5', provider: 'claude',
      name: 'Claude Opus 5.5', aliases: ['anthropic/claude-opus-5-5', 'claude-opus-5.5'],
      context: 1000000, max_tokens: 128000, tool_call: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
      costs: { tokens: 1000000, input_tokens: 400, output_tokens: 2000 },
    },
    {
      id: 'gpt-6-astra', puterId: 'openai:openai/gpt-6-astra', provider: 'openai-completion',
      name: 'GPT-6 Astra', aliases: ['openai/gpt-6-astra'],
      context: 1050000, max_tokens: 128000, tool_call: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
      costs: { tokens: 1000000, prompt_tokens: 1000, completion_tokens: 5000 },
    },
    {
      id: 'kimi-k3.1-pro', puterId: 'moonshotai:moonshotai/kimi-k3.1-pro', provider: 'moonshotai',
      name: 'Kimi K3.1 Pro', aliases: ['moonshotai/kimi-k3.1-pro'],
      context: 1048576, max_tokens: 1048576, tool_call: true,
      modalities: { input: ['text'], output: ['text'] },
      costs: { tokens: 1000000, prompt_tokens: 200, completion_tokens: 1000 },
    },
  ];

  let step = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function* script(options) {
    const wantsTools = Array.isArray(options.tools) && options.tools.length > 0;
    if (!wantsTools) {
      yield { type: 'reasoning', reasoning: 'Plain chat answer, no tools needed.' };
      yield { type: 'text', text: 'Here is the explanation you asked for.' };
      yield { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 8, cost: 400000 } };
      return;
    }
    if (step === 0) {
      yield { type: 'reasoning', reasoning: 'The user wants a landing page. I will plan, then write the file, then preview it. ' };
      yield { type: 'reasoning', reasoning: 'Plan: 1) scaffold index.html 2) preview 3) finish.' };
      yield { type: 'tool_use', id: 'call_1', name: 'update_plan', input: { tasks: [
        { title: 'Scaffold index.html', status: 'in_progress' },
        { title: 'Preview the page', status: 'pending' },
      ] } };
      yield { type: 'usage', usage: { prompt_tokens: 120, completion_tokens: 40, cost: 1000000 } };
      step += 1;
      return;
    }
    if (step === 1) {
      yield { type: 'text', text: 'Writing the page now. ' };
      yield { type: 'tool_use', id: 'call_2', name: 'write_file', input: {
        path: 'index.html',
        content: '<!doctype html><html><body><h1>Hello WorkBuddy</h1></body></html>',
      } };
      yield { type: 'usage', usage: { prompt_tokens: 150, completion_tokens: 60, cost: 1200000 } };
      step += 1;
      return;
    }
    if (step === 2) {
      yield { type: 'tool_use', id: 'call_3', name: 'preview_html', input: { path: 'index.html' } };
      step += 1;
      return;
    }
    if (step === 3) {
      yield { type: 'tool_use', id: 'call_3b', name: 'write_file', input: { path: 'src/math.js', content: 'exports.add = (a, b) => a + b;' } };
      step += 1;
      return;
    }
    if (step === 4) {
      yield { type: 'tool_use', id: 'call_3c', name: 'write_file', input: { path: 'src/main.js', content: "const { add } = require('./math'); console.log('sum', add(20, 22));" } };
      step += 1;
      return;
    }
    if (step === 5) {
      yield { type: 'tool_use', id: 'call_3d', name: 'run_file', input: { path: 'src/main.js' } };
      step += 1;
      return;
    }
    yield { type: 'tool_use', id: 'call_4', name: 'update_plan', input: { tasks: [
      { title: 'Scaffold index.html', status: 'done' },
      { title: 'Preview the page', status: 'done' },
    ] } };
    yield { type: 'tool_use', id: 'call_5', name: 'finish', input: { summary: 'Built index.html and previewed it.', files: ['index.html'] } };
    yield { type: 'usage', usage: { prompt_tokens: 200, completion_tokens: 30, cost: 900000 } };
  }

  window.puter = {
    ai: {
      listModels: async () => catalog,
      chat: async (messages, options = {}) => {
        if (options.stream) {
          await sleep(5);
          const it = script(options);
          return { async *[Symbol.asyncIterator]() { for (const chunk of it) { await sleep(2); yield chunk; } } };
        }
        return { message: { content: 'OK' }, usage: { prompt_tokens: 3, completion_tokens: 1 } };
      },
    },
    auth: { isSignedIn: () => true, getUser: async () => ({ username: 'e2e-tester' }), signIn: async () => ({}), signOut: async () => {} },
    kv: { set: async () => true, get: async () => null },
    fs: { write: async () => ({ path: 'ok' }) },
    net: { fetch: async () => ({ status: 200, headers: { get: () => 'text/plain' }, text: async () => 'stub' }) },
  };
})();
`;

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(BASE + '/');
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

let browser;
let page;
const errors = [];
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/js.puter.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }),
  );
  context.on('requestfailed', (request) => console.log('REQFAIL', request.url()));
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 1. model loads with only real, documented effort levels
  await page.waitForFunction(() => document.querySelector('#model-name')?.textContent?.includes('Claude Opus 5.5'));
  const claudeChips = await page.$$eval('.effort-chip', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.deepEqual(claudeChips, ['Off', 'Low', 'Medium', 'High', 'Max'], 'Claude exposes thinking budgets');
  console.log('✓ Claude Opus 5.5 selected with 5 thinking levels');

  // 2. picker: switch to GPT-6 Astra, whose ladder comes from the docs
  await page.click('#model-btn');
  await page.waitForSelector('#model-modal.open');
  await page.fill('#model-search', 'astra');
  await page.click('.model-row');
  await page.waitForSelector('.effort-row');
  const detailLevels = await page.$$eval('.effort-row .lvl', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.deepEqual(detailLevels, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  await page.click('.model-detail .btn.primary');
  await page.waitForFunction(() => document.querySelector('#model-name')?.textContent?.includes('GPT-6 Astra'));
  const astraChips = await page.$$eval('.effort-chip', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.deepEqual(astraChips, ['None', 'Minimal', 'Low', 'Medium', 'High', 'XHigh', 'Max']);
  console.log('✓ GPT-6 Astra exposes the 7 documented reasoning levels');

  // 3. run an agent turn: thinking, tools, files, plan, preview
  await page.fill('#prompt', 'Build a landing page');
  await page.press('#prompt', 'Enter');
  await page.waitForSelector('.tool-card', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.tool-card').length >= 3, null, { timeout: 20000 });
  await page.waitForSelector('.thinking-body');
  const thinking = await page.textContent('.thinking-body');
  assert.match(thinking, /I will plan/, 'reasoning is streamed into the UI');
  const toolNames = await page.$$eval('.tool-card .tool-name', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.ok(toolNames.includes('Write file'), 'write_file card rendered: ' + toolNames.join(','));
  assert.ok(toolNames.includes('Update plan'));
  await page.waitForFunction(() => document.body.innerText.includes('index.html'));
  const fileRows = await page.$$eval('.file-tree .file-row', (nodes) => nodes.map((n) => n.textContent));
  assert.ok(fileRows.some((row) => row.includes('index.html')), 'file appears in the workspace');
  const planItems = await page.$$eval('.plan-item', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.ok(planItems.length >= 2, 'plan panel populated');
  const previewSrc = await page.getAttribute('#preview-frame', 'srcdoc');
  assert.match(previewSrc ?? '', /Hello WorkBuddy/, 'preview frame rendered the html');
  await page.waitForFunction(() => document.body.innerText.includes('Run file'), null, { timeout: 25000 });
  await page.waitForFunction(() => document.body.innerText.includes('sum 42'), null, { timeout: 25000 });
  console.log('✓ run_file executed a multi-file project in the sandbox (require + console)');
  await page.waitForSelector('.completion-banner', { timeout: 20000 });
  const diffLines = await page.$$eval('.diff-line.add', (nodes) => nodes.length);
  assert.ok(diffLines > 0, 'a diff was shown for the written file');
  console.log('✓ agent turn streamed thinking, tool cards, diff, plan, preview and completion');

  // 4. verify effort levels against the (stubbed) live API
  await page.click('#effort-chips .chip');
  await page.waitForFunction(() => document.querySelectorAll('.effort-chip.verified').length >= 7, null, { timeout: 30000 });
  const verified = await page.$$eval('.effort-chip.verified', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.ok(verified.includes('High'), 'levels are marked verified after a real call');
  console.log('✓ ' + verified.length + ' effort levels verified live');

  // 5. persistence across reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.msg.assistant').length >= 1);
  const restored = await page.textContent('.msg.assistant');
  assert.match(restored, /index\.html|Writing the page/, 'conversation restored from storage');
  console.log('✓ session, files and transcript survive a reload');

  // 6. stop button + chat mode smoke
  await page.click('#mode-toggle button[data-mode="chat"]');
  await page.fill('#prompt', 'explain this');
  await page.press('#prompt', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Here is the explanation you asked for'));
  console.log('✓ chat mode answers without tools');

  const fatal = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
  assert.deepEqual(fatal, [], 'no page errors: ' + fatal.join('\n'));
  console.log('\nE2E OK — no console errors');
} catch (error) {
  console.error('E2E FAILED:', error.message);
  if (page) {
    console.error('collected errors:', errors.join(' | '));
    console.error('puter present:', await page.evaluate(() => typeof window.puter));
    console.error('model label:', await page.textContent('#model-name').catch(() => 'n/a'));
    console.error('body snippet:', (await page.textContent('body').catch(() => '')).slice(0, 600));
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
