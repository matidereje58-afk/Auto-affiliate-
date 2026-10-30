import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentTurn, parseTextToolCalls, stripToolBlocks } from '../js/agent/loop.js';

function fakeStore(files = {}) {
  const project = { id: 'p1', name: 'test', files: {}, memory: [], plan: [] };
  return {
    project,
    readFile: (p) => (p in project.files ? project.files[p].content : null),
    writeFile: (p, c) => { project.files[p] = { content: c }; },
    deleteFile: (p) => { delete project.files[p]; },
    listFiles: () => Object.keys(project.files),
    setPlan: (tasks) => { project.plan = tasks; },
    addMemory: (f) => project.memory.push({ text: f }),
  };
}

function fakeRuntime(handlers = {}) {
  const calls = [];
  return {
    calls,
    specs: [
      { type: 'function', function: { name: 'write_file', parameters: {} } },
      { type: 'function', function: { name: 'finish', parameters: {} } },
    ],
    async execute(name, input) {
      calls.push({ name, input });
      if (handlers[name]) return handlers[name](input);
      return { ok: true, summary: `${name} ok` };
    },
    dispose() {},
  };
}

/** Scripted client: each entry is one model response. */
function scriptedClient(script) {
  let index = 0;
  return {
    async streamChat({ onEvent }) {
      const step = script[Math.min(index, script.length - 1)];
      index += 1;
      for (const part of step.reasoning ?? []) onEvent({ type: 'reasoning', text: part });
      for (const part of step.text ?? []) onEvent({ type: 'text', text: part });
      for (const call of step.toolCalls ?? []) onEvent({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      onEvent({ type: 'usage', usage: { input: 10, output: 5, cost: 0 } });
      return { text: (step.text ?? []).join(''), reasoning: (step.reasoning ?? []).join(''), toolCalls: step.toolCalls ?? [], usage: { input: 10, output: 5 } };
    },
    async chat() {
      return { text: 'summary' };
    },
  };
}

test('native tool calling: plan, act, then finish', async () => {
  const store = fakeStore();
  const runtime = fakeRuntime({
    write_file: (input) => {
      store.writeFile(input.path, input.content);
      return { ok: true, summary: 'wrote ' + input.path };
    },
    finish: () => ({ ok: true, summary: 'done', done: true }),
  });
  const client = scriptedClient([
    { reasoning: ['I should ', 'write a file.'], toolCalls: [{ id: 'c1', name: 'write_file', input: { path: 'a.js', content: 'x' } }] },
    { text: ['All set.'], toolCalls: [{ id: 'c2', name: 'finish', input: { summary: 'created a.js' } }] },
  ]);
  const events = [];
  const result = await runAgentTurn({
    client, store, runtime,
    model: { id: 'openai/gpt-6-astra', toolCall: true },
    history: [{ role: 'user', content: 'make a.js' }],
    onEvent: (e) => events.push(e),
  });
  assert.equal(result.finished, true);
  assert.equal(store.readFile('a.js'), 'x');
  assert.deepEqual(runtime.calls.map((c) => c.name), ['write_file', 'finish']);
  assert.equal(result.steps, 2);
  assert.equal(result.usage.input, 20);
  assert.ok(events.some((e) => e.type === 'assistant_reasoning'));
  assert.ok(events.some((e) => e.type === 'step_tool'));
});

test('models without tool support use the text protocol', async () => {
  const store = fakeStore();
  const runtime = fakeRuntime({
    write_file: (input) => { store.writeFile(input.path, input.content); return { ok: true, summary: 'wrote' }; },
    finish: () => ({ ok: true, summary: 'done', done: true }),
  });
  const client = scriptedClient([
    { text: ['Let me write the file.\n```tool_code\n{"tool":"write_file","input":{"path":"b.txt","content":"hi"}}\n```'] },
    { text: ['Done.\n```tool_code\n{"tool":"finish","input":{"summary":"wrote b.txt"}}\n```'] },
  ]);
  const result = await runAgentTurn({
    client, store, runtime,
    model: { id: 'z-ai/glm-5', toolCall: false },
    history: [{ role: 'user', content: 'make b.txt' }],
    onEvent: () => {},
  });
  assert.equal(result.finished, true);
  assert.equal(store.readFile('b.txt'), 'hi');
  assert.equal(runtime.calls[0].name, 'write_file');
});

test('a plain answer ends the turn without tools', async () => {
  const runtime = fakeRuntime();
  const client = scriptedClient([{ text: ['Just an answer.'] }]);
  const result = await runAgentTurn({
    client, store: fakeStore(), runtime,
    model: { id: 'openai/gpt-6-astra', toolCall: true },
    history: [{ role: 'user', content: 'hi' }],
    onEvent: () => {},
  });
  assert.equal(result.finished, true);
  assert.equal(result.text, 'Just an answer.');
  assert.equal(runtime.calls.length, 0);
});

test('abort stops immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = scriptedClient([{ text: ['never'] }]);
  const result = await runAgentTurn({
    client, store: fakeStore(), runtime: fakeRuntime(),
    model: { id: 'openai/gpt-6-astra', toolCall: true },
    history: [], signal: controller.signal, onEvent: () => {},
  });
  assert.equal(result.aborted, true);
  assert.equal(result.steps, 0);
});

test('hitStepLimit is reported so the UI can auto-continue', async () => {
  const runtime = fakeRuntime({ write_file: () => ({ ok: true, summary: 'ok' }) });
  const client = scriptedClient([{ toolCalls: [{ id: 'x', name: 'write_file', input: { path: 'a', content: 'b' } }] }]);
  const result = await runAgentTurn({
    client, store: fakeStore(), runtime,
    model: { id: 'openai/gpt-6-astra', toolCall: true },
    history: [{ role: 'user', content: 'loop' }], maxSteps: 2, onEvent: () => {},
  });
  assert.equal(result.hitStepLimit, true);
  assert.equal(result.steps, 2);
});

test('text protocol parser ignores prose and bad json', () => {
  assert.deepEqual(parseTextToolCalls('no tools here'), []);
  assert.deepEqual(parseTextToolCalls('```json\n{"not":"a tool"}\n```'), []);
  const calls = parseTextToolCalls('```tool_code\n{"tool":"read_file","input":{"path":"x"}}\n```');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'read_file');
  assert.equal(stripToolBlocks('hi ```tool_code\n{"tool":"x"}\n``` there').includes('tool_code'), false);
});
