import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffort, effortOptions, EFFORT_LEVELS, describeLevel } from '../js/lib/effort.js';

test('OpenAI reasoning models expose the full effort ladder', () => {
  const model = { id: 'openai/gpt-6-astra', provider: 'openai-completion' };
  const effort = resolveEffort(model);
  assert.equal(effort.mode, 'reasoning_effort');
  assert.deepEqual(effort.levels, EFFORT_LEVELS);
  assert.equal(effort.defaultLevel, 'medium');
  assert.deepEqual(effortOptions(effort, 'xhigh'), { reasoning_effort: 'xhigh' });
});

test('GPT-6.1 Terra omits minimal (documented)', () => {
  const effort = resolveEffort({ id: 'openai/gpt-6.1-terra', provider: 'openai-completion' });
  assert.deepEqual(effort.levels, ['none', 'low', 'medium', 'high', 'xhigh', 'max']);
});

test('Kimi K3.1 Pro only accepts low/high/max and defaults to max', () => {
  const effort = resolveEffort({ id: 'moonshotai/kimi-k3.1-pro', provider: 'moonshotai' });
  assert.deepEqual(effort.levels, ['low', 'high', 'max']);
  assert.equal(effort.defaultLevel, 'max');
  assert.deepEqual(effortOptions(effort, 'minimal'), {}, 'unsupported level must not be sent');
});

test('Gemini argon and flash tiers use their documented subsets', () => {
  assert.deepEqual(resolveEffort({ id: 'google/gemini-4-argon' }).levels, ['low', 'medium', 'high']);
  assert.deepEqual(resolveEffort({ id: 'google/gemini-3.1-flash-lite' }).levels, ['minimal', 'low', 'medium', 'high']);
});

test('Claude models map effort to an extended-thinking budget', () => {
  const effort = resolveEffort({ id: 'anthropic/claude-opus-5-5', provider: 'claude' });
  assert.equal(effort.mode, 'thinking');
  assert.deepEqual(effortOptions(effort, 'off'), { thinking: { type: 'disabled' } });
  assert.deepEqual(effortOptions(effort, 'high'), { thinking: { type: 'enabled', budgetTokens: 32768 } });
  assert.match(describeLevel(effort, 'max'), /64,000/);
});

test('non-reasoning models advertise no effort control instead of fake levels', () => {
  const plain = resolveEffort({ id: 'openai/gpt-4o-mini', provider: 'openai-completion' });
  assert.equal(plain.mode, 'none');
  assert.deepEqual(plain.levels, []);

  const alwaysOn = resolveEffort({ id: 'deepseek/deepseek-v4-pro', provider: 'deepseek', maxReasoningTokens: 1000 });
  assert.equal(alwaysOn.mode, 'fixed');
  assert.deepEqual(alwaysOn.levels, []);
  assert.match(alwaysOn.note, /always reasons/i);
});

test('routing prefixes and variant suffixes do not change the rules', () => {
  const effort = resolveEffort({ id: 'infron:openai/gpt-6-astra:flex' });
  assert.equal(effort.mode, 'reasoning_effort');
  assert.equal(effort.levels.includes('max'), true);
});
