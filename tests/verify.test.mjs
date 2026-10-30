import test from 'node:test';
import assert from 'node:assert/strict';
import { probeModel, verifyEffortLevels, verificationKey } from '../js/agent/verify.js';
import { resolveEffort } from '../js/lib/effort.js';

function clientWith(behavior) {
  return {
    calls: [],
    async streamChat(params) {
      this.calls.push(params);
      return behavior(params);
    },
  };
}

const model = { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra' };

test('a healthy model reports ok, latency and reasoning size', async () => {
  const client = clientWith(() => ({ text: 'OK', reasoning: 'thinking…', error: null }));
  const result = await probeModel({ client, model, level: 'high' });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'OK');
  assert.equal(result.reasoningChars, 9);
  assert.equal(typeof result.ms, 'number');
  assert.equal(client.calls[0].model, 'openai/gpt-6-astra');
  assert.equal(client.calls[0].level, 'high');
});

test('a rejected level is recorded as an error, not as success', async () => {
  const client = clientWith(() => ({ text: '', error: { kind: 'bad_request', message: '400 bad_request: unsupported reasoning_effort' } }));
  const result = await probeModel({ client, model, level: 'minimal' });
  assert.equal(result.ok, false);
  assert.match(result.error, /bad_request/);
});

test('empty responses and thrown errors are failures', async () => {
  const empty = await probeModel({ client: clientWith(() => ({ text: '   ', reasoning: '', error: null })), model });
  assert.equal(empty.ok, false);
  const throwing = await probeModel({
    client: clientWith(() => { throw new Error('offline'); }),
    model,
  });
  assert.equal(throwing.ok, false);
  assert.match(throwing.error, /offline/);
});

test('verifyEffortLevels probes only the documented levels and persists them', async () => {
  const saved = new Map();
  const store = {
    setVerification: (key, value) => saved.set(key, value),
    getVerification: (key) => saved.get(key),
  };
  const effort = resolveEffort({ id: 'moonshotai/kimi-k3.1-pro' });
  let call = 0;
  const client = clientWith((params) => {
    call += 1;
    // Simulate a vendor that rejects "low" but accepts the rest.
    if (params.level === 'low') return { text: '', error: { kind: 'bad_request', message: '400 bad_request' } };
    return { text: 'OK', reasoning: '' };
  });
  const progress = [];
  const results = await verifyEffortLevels({
    client, store, model: { id: 'moonshotai/kimi-k3.1-pro' }, effort,
    levels: effort.levels, onProgress: (p) => progress.push(p),
  });
  assert.equal(call, 3);
  assert.deepEqual(Object.keys(results), ['low', 'high', 'max']);
  assert.equal(results.low.ok, false);
  assert.equal(results.high.ok, true);
  assert.equal(saved.get(verificationKey('moonshotai/kimi-k3.1-pro', 'low')).ok, false);
  assert.equal(progress.filter((p) => p.status === 'finished').length, 3);
});

test('verification stops when aborted', async () => {
  const controller = new AbortController();
  const store = { setVerification: () => {}, getVerification: () => null };
  const client = clientWith(() => { controller.abort(); return { text: 'OK' }; });
  const results = await verifyEffortLevels({
    client, store, model, effort: { levels: ['low', 'high', 'max'] },
    levels: ['low', 'high', 'max'], signal: controller.signal,
  });
  assert.equal(Object.keys(results).length, 1);
});
