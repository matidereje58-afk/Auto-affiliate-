import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, estimateConversationTokens, contextUsage, trimConversation, readUsage, formatTokens } from '../js/lib/tokens.js';

test('token estimates grow with text and stay in a sane range', () => {
  assert.equal(estimateTokens(''), 0);
  const short = estimateTokens('hello world');
  const long = estimateTokens('hello world '.repeat(100));
  assert.ok(short > 0 && short < 10);
  assert.ok(long > 100);
});

test('conversation estimates include tool calls and reasoning', () => {
  const messages = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'thinking', reasoning: 'a'.repeat(400), tool_calls: [{ id: '1', function: { name: 'read_file', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: '1', content: 'file body' },
  ];
  assert.ok(estimateConversationTokens(messages) > estimateConversationTokens(messages.slice(0, 1)));
});

test('context usage reports ratio and remaining budget', () => {
  const usage = contextUsage([{ role: 'user', content: 'x'.repeat(4000) }], 1000);
  assert.equal(usage.window, 1000);
  assert.ok(usage.ratio > 0.5);
  assert.ok(usage.remaining >= 0);
});

test('trimConversation keeps the system prompt and the newest turns', () => {
  const messages = [
    { role: 'system', content: 'sys' },
    ...Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm'.repeat(500) + i })),
  ];
  const trimmed = trimConversation(messages, 1500);
  assert.equal(trimmed[0].role, 'system');
  assert.ok(trimmed.length < messages.length);
  assert.equal(trimmed[trimmed.length - 1].content.endsWith('39'), true);
  assert.notEqual(trimmed[1]?.role, 'tool');
});

test('usage reader normalises vendor shapes and converts microcents', () => {
  assert.deepEqual(readUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 2_500_000 }), { input: 10, output: 5, total: 15, cost: 2.5 });
  assert.deepEqual(readUsage({ input_tokens: 3, output_tokens: 4 }), { input: 3, output: 4, total: 7, cost: null });
  assert.equal(readUsage(null), null);
  assert.equal(formatTokens(1500), '1.5K');
});
