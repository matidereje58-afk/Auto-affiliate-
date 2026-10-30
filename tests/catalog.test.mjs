import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, mergeLive, filterModels, findModel, formatContext, formatPrice, isChatModel, callableId } from '../js/lib/catalog.js';

const entries = [
  {
    id: 'gpt-6-astra',
    puterId: 'openai:openai/gpt-6-astra',
    aliases: ['openai/gpt-6-astra', 'openai:openai/gpt-6-astra'],
    provider: 'openai-completion',
    context: 1050000,
    max_tokens: 128000,
    tool_call: true,
    modalities: { input: ['text', 'image'], output: ['text'] },
    costs: { tokens: 1000000, prompt_tokens: 1000, completion_tokens: 5000 },
    release_date: '2026-09-04',
  },
  {
    id: 'openrouter:openai/gpt-6-astra',
    aliases: ['openai/gpt-6-astra', 'openrouter:openai/gpt-6-astra'],
    provider: 'openrouter',
    context: 1050000,
    tool_call: true,
    costs: { tokens: 1000000, prompt: 750, completion: 3750 },
  },
  {
    id: 'text-embedding-v4',
    provider: 'alibaba',
    capabilities: ['EMB'],
    costs: { tokens: 1000000, prompt: 1 },
  },
  {
    id: 'fun-asr',
    provider: 'alibaba',
    capabilities: ['ASR'],
    costs: { tokens: 1000000, prompt: 1 },
  },
  {
    id: 'infron:minimax/minimax-m3:flex',
    aliases: ['minimax/minimax-m3'],
    provider: 'infron',
    context: 1000000,
    tool_call: true,
    costs: { tokens: 1000000, prompt: 30, completion: 120 },
  },
];

test('non-chat models are filtered out', () => {
  assert.equal(isChatModel(entries[2]), false);
  assert.equal(isChatModel(entries[3]), false);
  assert.equal(isChatModel(entries[0]), true);
});

test('callable ids are the ids Puter accepts (vendor/model, no provider prefix)', () => {
  assert.equal(callableId(entries[0]), 'openai/gpt-6-astra');
  assert.equal(callableId(entries[4]), 'minimax/minimax-m3');
});

test('variants and routing vendors collapse into one model with many offers', () => {
  const catalog = buildCatalog(entries);
  const astra = catalog.models.find((m) => m.id === 'openai/gpt-6-astra');
  assert.ok(astra, 'astra present');
  assert.equal(catalog.models.filter((m) => m.id === 'openai/gpt-6-astra').length, 1);
  assert.deepEqual(astra.providers.sort(), ['openai-completion', 'openrouter']);
  assert.equal(astra.context, 1050000);
  assert.equal(astra.toolCall, true);
  assert.equal(astra.inputPrice, 10, 'first-party price wins over the reseller');
  assert.equal(astra.outputPrice, 50);
  assert.equal(astra.effort.mode, 'reasoning_effort');
  assert.equal(astra.vendor, 'OpenAI');
  assert.equal(catalog.models.length, 2);
});

test('free variants are flagged and priced at zero', () => {
  const catalog = buildCatalog([
    { id: 'openrouter:vendor/model:free', aliases: ['vendor/model:free'], provider: 'openrouter', modalities: { input: ['text'], output: ['text'] }, costs: { tokens: 1000000, prompt: 0, completion: 0 } },
  ]);
  assert.equal(catalog.models[0].free, true);
  assert.equal(formatPrice(catalog.models[0].inputPrice), 'free');
});

test('mergeLive keeps only models the account can actually call', () => {
  const bundled = buildCatalog(entries);
  const live = [{ id: 'gpt-6-astra', provider: 'openai-completion' }];
  const merged = mergeLive(live, bundled);
  assert.equal(merged.live, true);
  assert.equal(merged.models.length, 1);
  assert.equal(merged.models[0].id, 'openai/gpt-6-astra');
  assert.equal(merged.models[0].effort.mode, 'reasoning_effort', 'bundled metadata survives the merge');
});

test('mergeLive adds models that appeared after the snapshot was built', () => {
  const bundled = buildCatalog([entries[0]]);
  const merged = mergeLive(
    [
      { id: 'gpt-6-astra', provider: 'openai-completion' },
      { id: 'brand-new-model', provider: 'alibaba', context: 32000, tool_call: true, modalities: { input: ['text'], output: ['text'] } },
    ],
    bundled,
  );
  const fresh = merged.models.find((m) => m.id === 'brand-new-model');
  assert.ok(fresh, 'live-only model is included');
  assert.equal(merged.liveOnly, 1);
});

test('search + filters work across name, id and description', () => {
  const catalog = buildCatalog(entries);
  assert.equal(filterModels(catalog.models, { query: 'astra' }).length, 1);
  assert.equal(filterModels(catalog.models, { vendor: 'MiniMax' }).length, 1);
  assert.equal(filterModels(catalog.models, { toolsOnly: true }).length, 2);
  assert.equal(findModel(catalog.models, 'OPENAI/GPT-6-ASTRA').id, 'openai/gpt-6-astra');
});

test('token and price formatting', () => {
  assert.equal(formatContext(1050000), '1.05M');
  assert.equal(formatContext(128000), '128K');
  assert.equal(formatPrice(0.15), '$0.15');
  assert.equal(formatPrice(null), '—');
});
