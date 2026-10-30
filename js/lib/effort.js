/**
 * Reasoning-effort capability resolution.
 *
 * Rules transcribed from the official Puter.js docs:
 *   https://docs.puter.com/AI/chat/  (options `reasoning_effort`, `thinking`)
 *   https://developer.puter.com/ai/models/ (per-model pages)
 *
 *  - `reasoning_effort` accepts: none | minimal | low | medium | high | xhigh | max
 *  - It is understood by OpenAI models, Moonshot Kimi K3.1 Pro, Meta Muse Spark,
 *    gemini-4-argon, gemini-3.1-flash-lite and gemini-3-flash-preview. Everything
 *    else rejects or ignores it, so we never send it to those models.
 *  - GPT-6.1 Terra: none | low | medium (default) | high | xhigh | max (no minimal)
 *  - Kimi K3.1 Pro: low | high | max (default max); anything else -> 400 bad_request
 *  - gemini-4-argon: low | medium (default) | high
 *  - gemini-3.1-flash-lite / gemini-3-flash-preview: minimal | low | medium | high
 *  - Muse Spark always reasons, so `none` is ignored.
 *  - Anthropic models use `thinking: { type, budgetTokens }` instead.
 */

export const EFFORT_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Short labels + the honest one-line description shown in the UI. */
export const EFFORT_META = {
  none: { label: 'None', hint: 'No thinking. Fastest possible answer.' },
  minimal: { label: 'Minimal', hint: 'A few thinking tokens, near-instant.' },
  low: { label: 'Low', hint: 'Light reasoning. Good for small edits.' },
  medium: { label: 'Medium', hint: 'Balanced reasoning (provider default).' },
  high: { label: 'High', hint: 'Deeper reasoning for multi-file work.' },
  xhigh: { label: 'XHigh', hint: 'Very deep reasoning, slower and costlier.' },
  max: { label: 'Max', hint: 'Maximum thinking budget the model allows.' },
};

/** Anthropic `thinking.budgetTokens` used for each effort level. */
export const THINKING_BUDGETS = {
  off: 0,
  low: 4096,
  medium: 16384,
  high: 32768,
  max: 64000,
};

const OPENAI_FULL = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function lc(value) {
  return String(value ?? '').toLowerCase();
}

/** Strip routing prefixes/variant suffixes so rules match every alias. */
export function normalizeModelId(id) {
  let value = lc(id).trim();
  const colon = value.indexOf(':');
  if (colon > 0) value = value.slice(colon + 1); // "openai:openai/gpt-6-astra" -> "openai/gpt-6-astra"
  value = value.replace(/:(free|flex|priority)$/, '');
  return value;
}

/** "openai/gpt-6-astra" -> "gpt-6-astra" */
export function bareModelName(id) {
  const value = normalizeModelId(id);
  const slash = value.lastIndexOf('/');
  return slash === -1 ? value : value.slice(slash + 1);
}

function isOpenAiReasoningFamily(model) {
  const provider = lc(model.provider);
  const name = bareModelName(model.id);
  const norm = normalizeModelId(model.id);
  // gpt-4 / gpt-3.5 / chat-latest are plain completion models: no reasoning knob.
  if (/^(gpt-4|gpt-3|chat-latest)/.test(name) && !/gpt-5|gpt-6/.test(name)) return false;
  const openAiProvider = /openai|azure/.test(provider) || norm.startsWith('openai/');
  const reasoningShape = /^(gpt-5|gpt-6|o[1-9])/.test(name) || /codex/.test(name);
  return openAiProvider && reasoningShape;
}

function isClaude(model) {
  const provider = lc(model.provider);
  const name = bareModelName(model.id);
  return provider === 'claude' || provider === 'anthropic' || /^claude-/.test(name) || /^fable-/.test(name);
}

function capabilitiesOf(model) {
  return Array.isArray(model.capabilities) ? model.capabilities.map((c) => lc(c)) : [];
}

/** True when the model reports a reasoning/thinking mode in Puter's own catalogue. */
export function isReasoningModel(model) {
  const caps = capabilitiesOf(model);
  if (caps.includes('reasoning')) return true;
  if (Number(model.maxReasoningTokens) > 0) return true;
  if (Number(model.reasoningMaxOutputTokens) > 0) return true;
  if (isOpenAiReasoningFamily(model) || isClaude(model)) return true;
  const features = Array.isArray(model.features) ? model.features.map((f) => lc(f)) : [];
  return features.includes('reasoning');
}


/**
 * Resolve how (and whether) effort can be controlled for a model.
 *
 * @param {{id:string, provider?:string, capabilities?:string[], features?:string[],
 *          maxReasoningTokens?:number, reasoningMaxOutputTokens?:number}} model
 * @returns {{
 *   mode: 'reasoning_effort'|'thinking'|'fixed'|'none',
 *   levels: string[],          // levels that can actually be sent to the API
 *   defaultLevel: string|null,
 *   param: string|null,        // option name we set when calling
 *   source: string,            // where the rule came from (shown in the UI)
 *   note: string,              // honest explanation for the user
 *   budgets?: Record<string, number>
 * }}
 */
export function resolveEffort(model = {}) {
  const id = normalizeModelId(model.id);
  const name = bareModelName(model.id);
  const provider = lc(model.provider);

  // --- Documented per-model overrides (checked before provider families) ---
  if (/gemini-4-argon/.test(id)) {
    return {
      mode: 'reasoning_effort',
      levels: ['low', 'medium', 'high'],
      defaultLevel: 'medium',
      param: 'reasoning_effort',
      source: 'docs: gemini-4-argon',
      note: 'gemini-4-argon accepts low, medium or high and defaults to medium.',
    };
  }
  if (/gemini-3\.1-flash-lite|gemini-3-flash-preview/.test(id)) {
    return {
      mode: 'reasoning_effort',
      levels: ['minimal', 'low', 'medium', 'high'],
      defaultLevel: 'medium',
      param: 'reasoning_effort',
      source: 'docs: Gemini flash reasoning',
      note: 'Accepts minimal, low, medium or high, otherwise Google’s default.',
    };
  }
  if (/kimi-k3\.1-pro/.test(id)) {
    return {
      mode: 'reasoning_effort',
      levels: ['low', 'high', 'max'],
      defaultLevel: 'max',
      param: 'reasoning_effort',
      source: 'docs: Kimi K3.1 Pro',
      note: 'Kimi K3.1 Pro only accepts low, high or max (default max).',
    };
  }
  if (/gpt-6\.1-terra/.test(id)) {
    return {
      mode: 'reasoning_effort',
      levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultLevel: 'medium',
      param: 'reasoning_effort',
      source: 'docs: GPT-6.1 Terra',
      note: 'GPT-6.1 Terra accepts none, low, medium, high, xhigh or max (no minimal).',
    };
  }
  if (/muse-spark/.test(id)) {
    return {
      mode: 'reasoning_effort',
      levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultLevel: 'high',
      param: 'reasoning_effort',
      source: 'docs: Muse Spark',
      note: 'Muse Spark always reasons, so “none” is ignored by the API.',
    };
  }
  if (isOpenAiReasoningFamily(model)) {
    return {
      mode: 'reasoning_effort',
      levels: [...OPENAI_FULL],
      defaultLevel: 'medium',
      param: 'reasoning_effort',
      source: 'docs: OpenAI reasoning models',
      note: 'OpenAI reasoning models accept none → max. The API ignores temperature.',
    };
  }
  if (isClaude(model)) {
    return {
      mode: 'thinking',
      levels: ['off', 'low', 'medium', 'high', 'max'],
      defaultLevel: 'off',
      param: 'thinking',
      budgets: { ...THINKING_BUDGETS },
      source: 'docs: Anthropic thinking',
      note: 'Claude uses an extended-thinking budget instead of reasoning_effort.',
    };
  }

  if (isReasoningModel({ ...model, id, provider })) {
    return {
      mode: 'fixed',
      levels: [],
      defaultLevel: null,
      param: null,
      source: 'Puter catalogue: capabilities include Reasoning',
      note: 'This model always reasons; Puter exposes no effort control for it.',
    };
  }

  return {
    mode: 'none',
    levels: [],
    defaultLevel: null,
    param: null,
    source: 'Puter catalogue: no configurable reasoning effort',
    note: 'Puter documents no effort control for this model, so none is sent. Use “Test this model” to check it responds.',
  };
}

/** Build the options fragment merged into `puter.ai.chat` for a chosen effort. */
export function effortOptions(capability, level) {
  if (!capability || !level) return {};
  const levels = capability.levels ?? [];
  if (!levels.includes(level)) return {};
  if (capability.mode === 'reasoning_effort') {
    return { reasoning_effort: level };
  }
  if (capability.mode === 'thinking') {
    if (level === 'off') return { thinking: { type: 'disabled' } };
    const budgetTokens = capability.budgets?.[level] ?? THINKING_BUDGETS[level];
    return { thinking: { type: 'enabled', budgetTokens } };
  }
  return {};
}

export function describeLevel(capability, level) {
  if (!capability) return '';
  if (capability.mode === 'thinking') {
    const budget = capability.budgets?.[level] ?? THINKING_BUDGETS[level] ?? 0;
    return level === 'off' ? 'Thinking disabled' : `${budget.toLocaleString()} thinking tokens`;
  }
  return EFFORT_META[level]?.hint ?? '';
}

/**
 * Clamp an effort capability to what a specific model can actually take.
 * Anthropic requires `max_tokens` to exceed the thinking budget, and older
 * Claude models only allow 8K-16K of output, so a 64K budget would 400.
 */
export function adaptEffortToModel(capability, model) {
  if (!capability || capability.mode !== 'thinking') return capability;
  const maxOut = Number(model?.maxTokens) || 8192;
  const ceiling = Math.max(1024, maxOut - 2048);
  const budgets = {};
  for (const [level, value] of Object.entries(capability.budgets ?? THINKING_BUDGETS)) {
    budgets[level] = level === 'off' ? 0 : Math.min(value, ceiling);
  }
  const levels = (capability.levels ?? []).filter((level) => level === 'off' || budgets[level] >= 1024);
  const defaultLevel = levels.includes(capability.defaultLevel) ? capability.defaultLevel : levels[0] ?? null;
  return { ...capability, ...(defaultLevel ? { defaultLevel } : {}), levels, budgets };
}
