/**
 * Model catalogue normalisation.
 *
 * Source of truth: `puter.ai.listModels()` — which fetches
 * `https://api.puter.com/puterai/chat/models/details` using the signed-in
 * user's token. `data/models.json` is a build-time snapshot of the same
 * endpoint so the picker renders instantly and still works offline.
 *
 * This module is pure (no DOM, no puter globals) so it is unit-testable in Node
 * and shared between the build script and the browser.
 */
import { resolveEffort, normalizeModelId, bareModelName } from './effort.js';

const NON_CHAT_ID = /(embedding|rerank|asr|tts|whisper|livetranslate|voice-enrollment|omni-flash-realtime|realtime-plus|image$|image-|video|sora|veo|kling|hailuo|wan2|seedance|flux|midjourney|stable-diffusion|moderation|content-safety|z-image)/i;

/** Cost keys differ per vendor family; take the first that exists. */
const INPUT_KEYS = ['prompt_tokens', 'input_tokens', 'prompt', 'input'];
const OUTPUT_KEYS = ['completion_tokens', 'output_tokens', 'completion', 'output'];

function firstCost(costs, keys) {
  if (!costs) return null;
  for (const key of keys) {
    if (typeof costs[key] === 'number') return costs[key];
  }
  return null;
}

/** Puter reports costs in USD cents per `costs.tokens` tokens. */
function toPerMillion(cost, tokens) {
  if (typeof cost !== 'number') return null;
  const unit = typeof tokens === 'number' && tokens > 0 ? tokens : 1000000;
  return Math.round(((cost / unit) * 1000000) / 100 * 10000) / 10000; // dollars per 1M
}

/** True when the entry can be used with `puter.ai.chat()`. */
export function isChatModel(entry) {
  if (!entry) return false;
  const id = normalizeModelId(entry.id ?? '');
  const caps = Array.isArray(entry.capabilities) ? entry.capabilities.map((c) => String(c).toLowerCase()) : [];
  if (caps.length) {
    const hasText = caps.some((c) => ['tg', 'reasoning', 'vu', 'realtime-chatting'].includes(c));
    const hasAudioOnly = caps.every((c) => c.includes('asr') || c.includes('tts'));
    if (!hasText || hasAudioOnly) return false;
  }
  const output = entry.modalities?.output;
  if (Array.isArray(output) && output.length && !output.includes('text')) return false;
  if (NON_CHAT_ID.test(id) && !/coder|code|chat|gpt-oss|instruct/.test(id)) return false;
  return true;
}

/** Pick the id a caller should pass as `model` for one catalogue entry. */
const VARIANT_RE = /:(free|flex|priority)$/;

export function variantOf(id) {
  const match = String(id ?? '').match(VARIANT_RE);
  return match ? match[1] : null;
}

/** "infron:anthropic/claude-opus-5.5:flex" -> "anthropic/claude-opus-5.5" */
export function stripRouting(id) {
  let value = String(id ?? '').trim();
  value = value.replace(VARIANT_RE, '');
  const colon = value.indexOf(':');
  if (colon > 0) value = value.slice(colon + 1);
  return value;
}

export function callableId(entry) {
  const candidates = [];
  if (entry.puterId) candidates.push(entry.puterId);
  if (Array.isArray(entry.aliases)) {
    candidates.push(...entry.aliases.filter((a) => typeof a === 'string' && a.trim()));
  }
  if (entry.id) candidates.push(entry.id);
  const cleaned = candidates.map(stripRouting).filter(Boolean);
  const vendorStyle = cleaned.filter((v) => v.includes('/') && !v.includes(' '));
  const pool = vendorStyle.length ? vendorStyle : cleaned;
  return pool.sort((a, b) => a.length - b.length)[0] ?? null;
}

/** "Anthropic: Claude Opus 5.5 (OpenRouter)" -> "Claude Opus 5.5" */
export function cleanName(name) {
  if (!name) return null;
  return String(name)
    .replace(/\s*\((openrouter|infron|together ai|azure|router|fast|flex|priority|free)\)\s*$/gi, '')
    .replace(/^[^:]{2,24}:\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}


export function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!isChatModel(entry)) return null;
  const id = callableId(entry);
  if (!id) return null;
  const tokens = entry.costs?.tokens;
  const inputPrice = toPerMillion(firstCost(entry.costs, INPUT_KEYS), tokens);
  const outputPrice = toPerMillion(firstCost(entry.costs, OUTPUT_KEYS), tokens);
  const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities : [];
  const features = Array.isArray(entry.features) ? entry.features : [];
  const offer = {
    provider: entry.provider ?? 'puter',
    modelId: id,
    variant: variantOf(entry.id),
    context: entry.context ?? null,
    maxTokens: entry.max_tokens ?? null,
    inputPrice,
    outputPrice,
    toolCall: entry.tool_call ?? null,
    modalities: entry.modalities ?? null,
    capabilities,
    features,
    releaseDate: entry.release_date ?? null,
    knowledge: entry.knowledge ?? null,
    openWeights: entry.open_weights ?? null,
    maxReasoningTokens: entry.maxReasoningTokens ?? null,
    reasoningMaxOutputTokens: entry.reasoningMaxOutputTokens ?? null,
    responsesApi: Boolean(entry.responses_api || entry.responsesApi),
    description: entry.description ?? null,
    name: cleanName(entry.name),
  };
  offer.free = (inputPrice === 0 && outputPrice === 0) || /:free$/i.test(String(entry.id)) || false;
  offer.pinned = String(entry.id).includes(':') ? String(entry.id) : null;
  return offer;
}


const PROVIDER_LABELS = {
  'openai-completion': 'OpenAI',
  'openai-responses': 'OpenAI',
  openai: 'OpenAI',
  'azure-openai': 'Azure OpenAI',
  'azure-openai-responses': 'Azure OpenAI',
  claude: 'Anthropic',
  anthropic: 'Anthropic',
  gemini: 'Google',
  google: 'Google',
  alibaba: 'Alibaba',
  'together-ai': 'Together AI',
  togetherai: 'Together AI',
  moonshotai: 'Moonshot AI',
  kimi: 'Moonshot AI',
  minimax: 'MiniMax',
  deepseek: 'DeepSeek',
  zai: 'Z.ai',
  'z-ai': 'Z.ai',
  xai: 'xAI',
  'x-ai': 'xAI',
  mistral: 'Mistral',
  mistralai: 'Mistral',
  byteplus: 'BytePlus',
  infron: 'Infron',
  openrouter: 'OpenRouter',
  'particle-ai': 'Particle',
};

/** Providers that serve the model natively (routing vendors come after them). */
const FIRST_PARTY = new Set([
  'openai-completion', 'openai-responses', 'azure-openai', 'azure-openai-responses',
  'claude', 'anthropic', 'gemini', 'google', 'moonshotai', 'kimi', 'minimax', 'deepseek',
  'zai', 'z-ai', 'xai', 'x-ai', 'mistral', 'mistralai', 'byteplus', 'alibaba', 'together-ai',
]);

export function providerLabel(provider) {
  const key = String(provider ?? '').toLowerCase();
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
  return key ? key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Puter';
}

/** "openai/gpt-6-astra" -> "GPT-6 Astra" */
export function prettifyModelId(id) {
  const bare = bareModelName(id);
  return bare
    .replace(/^~/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(gpt|glm|grok|kimi|qwen|llm|ai)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** "openai/gpt-6-astra" -> "OpenAI". Falls back to the routing provider. */
export function vendorOf(modelId, offers = []) {
  const norm = normalizeModelId(modelId).replace(/^~/, '');
  if (norm.includes('/')) {
    const vendor = norm.split('/')[0];
    const known = {
      openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', moonshotai: 'Moonshot AI',
      minimax: 'MiniMax', 'x-ai': 'xAI', xai: 'xAI', 'z-ai': 'Z.ai', zai: 'Z.ai',
      'meta-llama': 'Meta', meta: 'Meta', 'meta-ai': 'Meta', 'meta-models': 'Meta',
      mistralai: 'Mistral', deepseek: 'DeepSeek', bytedance: 'BytePlus', byteplus: 'BytePlus',
      qwen: 'Alibaba', alibaba: 'Alibaba', cohere: 'Cohere', nvidia: 'Nvidia',
      perplexity: 'Perplexity', amazon: 'Amazon', microsoft: 'Microsoft',
    };
    if (known[vendor]) return known[vendor];
    return providerLabel(vendor);
  }
  const firstParty = offers.find((o) => FIRST_PARTY.has(String(o.provider).toLowerCase()));
  return providerLabel((firstParty ?? offers[0])?.provider ?? 'puter');
}

function scoreOffer(offer) {
  let score = 0;
  if (FIRST_PARTY.has(String(offer.provider).toLowerCase())) score += 100;
  if (offer.description) score += 10;
  if (offer.toolCall) score += 5;
  if (offer.context) score += 2;
  if (/:(free|flex|priority)$/.test(offer.modelId)) score -= 20;
  return score;
}

function pickPrimaryOffer(offers) {
  return [...offers].sort((a, b) => scoreOffer(b) - scoreOffer(a))[0];
}

/** Prefer the first-party display name, then the shortest clean name, then prettify. */
function pickName(group, primary) {
  const named = group.filter((o) => o.name && o.name.length > 1);
  const firstParty = named.find((o) => FIRST_PARTY.has(String(o.provider).toLowerCase()));
  if (firstParty) return firstParty.name;
  if (primary.name) return primary.name;
  if (named.length) return named.sort((a, b) => a.name.length - b.name.length)[0].name;
  return prettifyModelId(primary.modelId);
}

/**
 * Group raw catalogue entries (one entry per provider/variant) into models.
 * Every returned model can be passed straight to `puter.ai.chat({ model })`.
 */
export function buildCatalog(entries = [], meta = {}) {
  const offers = [];
  for (const entry of entries) {
    const offer = normalizeEntry(entry);
    if (offer) offers.push(offer);
  }
  const groups = new Map();
  for (const offer of offers) {
    const key = String(offer.modelId).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(offer);
  }
  const models = [];
  for (const [key, group] of groups) {
    const primary = pickPrimaryOffer(group);
    const capability = resolveEffort({
      ...primary,
      id: primary.modelId,
      capabilities: [...new Set(group.flatMap((o) => o.capabilities ?? []))],
      features: [...new Set(group.flatMap((o) => o.features ?? []))],
      maxReasoningTokens: Math.max(0, ...group.map((o) => Number(o.maxReasoningTokens) || 0)),
      reasoningMaxOutputTokens: Math.max(0, ...group.map((o) => Number(o.reasoningMaxOutputTokens) || 0)),
    });
    const inputPrice = primary.inputPrice ?? group.find((o) => o.inputPrice !== null)?.inputPrice ?? null;
    const outputPrice = primary.outputPrice ?? group.find((o) => o.outputPrice !== null)?.outputPrice ?? null;
    models.push({
      key,
      id: primary.modelId,
      name: pickName(group, primary),
      vendor: vendorOf(primary.modelId, group),
      providers: [...new Set(group.map((o) => o.provider))],
      primaryProvider: primary.provider,
      context: Math.max(0, ...group.map((o) => Number(o.context) || 0)) || null,
      maxTokens: Math.max(0, ...group.map((o) => Number(o.maxTokens) || 0)) || null,
      toolCall: group.some((o) => o.toolCall),
      modalities: primary.modalities,
      inputPrice,
      outputPrice,
      free: group.some((o) => o.free),
      reasoning: capability.mode !== 'none',
      effort: capability,
      description: primary.description,
      releaseDate: primary.releaseDate,
      knowledge: primary.knowledge,
      openWeights: primary.openWeights,
      responsesApi: group.some((o) => o.responsesApi),
      offers: group.map((o) => ({
        provider: o.provider,
        modelId: o.modelId,
        variant: o.variant,
        context: o.context,
        maxTokens: o.maxTokens,
        inputPrice: o.inputPrice,
        outputPrice: o.outputPrice,
        pinned: o.pinned,
      })),
    });
  }
  models.sort(compareModels);
  return {
    version: 2,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    source: meta.source ?? 'https://api.puter.com/puterai/chat/models/details',
    totalEntries: entries.length,
    models,
  };
}

function compareModels(a, b) {
  if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

/**
 * Merge the live `puter.ai.listModels()` result with the bundled snapshot.
 * Live entries decide *availability*; the snapshot supplies rich metadata
 * (descriptions, prices, reasoning flags) when the live payload is thin.
 */
export function mergeLive(liveEntries = [], bundled = { models: [] }) {
  const bundledByKey = new Map();
  for (const model of bundled.models ?? []) {
    bundledByKey.set(String(model.key), model);
    bundledByKey.set(String(model.id).toLowerCase(), model);
    bundledByKey.set(bareModelName(model.id), model);
  }
  const matched = new Map();
  const unknown = [];
  for (const entry of liveEntries) {
    const offer = normalizeEntry(entry);
    if (!offer) continue;
    const keys = [String(offer.modelId).toLowerCase(), bareModelName(offer.modelId)];
    const hit = keys.map((key) => bundledByKey.get(key)).find(Boolean);
    if (hit) matched.set(hit.key, hit);
    else unknown.push(entry);
  }
  if (!matched.size && !unknown.length) {
    return { ...bundled, live: false, models: bundled.models ?? [] };
  }
  const models = [...matched.values()];
  if (unknown.length) {
    const fresh = buildCatalog(unknown, { generatedAt: bundled.generatedAt });
    const seen = new Set(models.map((m) => m.key));
    for (const model of fresh.models) {
      if (!seen.has(model.key) && !models.some((m) => bareModelName(m.id) === bareModelName(model.id))) {
        models.push(model);
      }
    }
  }
  models.sort(compareModels);
  return {
    ...bundled,
    live: true,
    liveCount: matched.size + unknown.length,
    liveOnly: models.filter((m) => !matched.has(m.key)).length,
    models,
  };
}

/** Search/filter helper used by the model picker and the slash commands. */
export function filterModels(models, { query = '', vendor = '', toolsOnly = false, reasoningOnly = false, freeOnly = false } = {}) {
  const q = query.trim().toLowerCase();
  return models.filter((m) => {
    if (vendor && m.vendor !== vendor) return false;
    if (toolsOnly && !m.toolCall) return false;
    if (reasoningOnly && !m.reasoning) return false;
    if (freeOnly && !m.free) return false;
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.vendor.toLowerCase().includes(q) ||
      (m.description ?? '').toLowerCase().includes(q)
    );
  });
}

export function formatContext(tokens) {
  if (!tokens) return '—';
  if (tokens >= 1000000) {
    const value = tokens / 1000000;
    return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  if (price === 0) return 'free';
  if (price < 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2).replace(/\.00$/, '')}`;
}

export function findModel(models, id) {
  const target = String(id ?? '').toLowerCase();
  return models.find((m) => m.id.toLowerCase() === target) ??
    models.find((m) => normalizeModelId(m.id) === normalizeModelId(target)) ??
    models.find((m) => m.name.toLowerCase() === target) ??
    null;
}
