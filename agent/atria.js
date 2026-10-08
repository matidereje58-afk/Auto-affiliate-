// Atria Dawn Preview API client — OpenAI-compatible chat completions with SSE streaming.
// The endpoint is called straight from the browser (CORS is open for the public API).

export const DEFAULT_BASE_URL = 'https://api.atria-asi.ai/v1';
export const DEFAULT_MODEL = 'Atria-Dawn-Preview';

/**
 * Stream one chat completion.
 * @param {object} opts
 * @param {Array} opts.messages
 * @param {Array} [opts.tools]
 * @param {string} opts.apiKey
 * @param {string} [opts.baseUrl]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.reasoningEffort] low | medium | high
 * @param {number} [opts.temperature]
 * @param {AbortSignal} [opts.signal]
 * @param {(evt:object)=>void} [opts.onDelta]  receives {type:'content'|'reasoning'|'tool_call', ...}
 * @returns {Promise<{content:string, reasoning:string, toolCalls:Array, finishReason:string, usage:object}>}
 */
export async function streamChat(opts) {
  const {
    messages, tools, apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL,
    maxTokens = 16384, reasoningEffort = 'medium', temperature, signal, onDelta, onRetry,
  } = opts;

  const body = { model, messages, stream: true, max_tokens: maxTokens, stream_options: { include_usage: true } };
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;
  if (typeof temperature === 'number') body.temperature = temperature;
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }

  let attempt = 0;
  let lastErr;
  while (attempt < 3) {
    attempt++;
    try {
      return await streamOnce({ body, apiKey, baseUrl, signal, onDelta });
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') throw err;
      if (!isRetryable(err) || attempt >= 3) throw err;
      const wait = 700 * attempt + Math.random() * 400;
      onRetry?.({ attempt, error: err, wait });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function isRetryable(err) {
  if (err.status === 429 || err.status === 408) return true;
  if (err.status >= 500) return true;
  if (err.status === undefined) return true; // network/timeout
  return false;
}

async function streamOnce({ body, apiKey, baseUrl, signal, onDelta }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 900); } catch {}
    let msg = detail;
    try {
      const j = JSON.parse(detail);
      msg = j?.error?.message || j?.message || detail;
    } catch {}
    // Common upstream complaints we can explain instead of dumping raw JSON.
    if (/not a multimodal model/i.test(msg)) msg = 'This model accepts text only (no images).';
    const e = new Error(`Atria API ${res.status}: ${msg || res.statusText}`);
    e.status = res.status;
    e.detail = detail;
    if (res.status === 401) e.hint = 'Your Atria API key was rejected. Open Settings and paste a valid key.';
    throw e;
  }

  const out = { content: '', reasoning: '', toolCalls: [], finishReason: '', usage: null, id: null };
  const acc = new Map(); // index -> tool call

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      consumeChunk(json, out, acc, onDelta);
    }
  }

  out.toolCalls = [...acc.values()].filter((t) => t.name || t.arguments);
  for (const tc of out.toolCalls) {
    try { tc.args = JSON.parse(tc.arguments || '{}'); } catch { tc.args = { _raw: tc.arguments }; }
  }
  return out;
}

function consumeChunk(json, out, acc, onDelta) {
  if (json.id && !out.id) out.id = json.id;
  if (json.usage) out.usage = json.usage;
  const choice = json.choices?.[0];
  if (!choice) return;
  if (choice.finish_reason) out.finishReason = choice.finish_reason;
  const d = choice.delta;
  if (!d) return;

  if (typeof d.content === 'string' && d.content) {
    out.content += d.content;
    onDelta?.({ type: 'content', text: d.content });
  }
  const rsn = d.reasoning_content ?? d.reasoning;
  if (typeof rsn === 'string' && rsn) {
    out.reasoning += rsn;
    onDelta?.({ type: 'reasoning', text: rsn });
  }
  if (Array.isArray(d.tool_calls)) {
    for (const tc of d.tool_calls) {
      const idx = tc.index ?? 0;
      let entry = acc.get(idx);
      if (!entry) { entry = { id: tc.id || `call_${idx}`, name: '', arguments: '' }; acc.set(idx, entry); }
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name = (entry.name || '') + tc.function.name;
      if (tc.function?.arguments) entry.arguments += tc.function.arguments;
      onDelta?.({ type: 'tool_call', index: idx, id: entry.id, name: entry.name, arguments: entry.arguments });
    }
  }
}

/** Lightweight connectivity check used by Settings. */
export async function ping({ apiKey, baseUrl = DEFAULT_BASE_URL }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    const e = new Error(`HTTP ${res.status} ${detail}`);
    e.status = res.status;
    throw e;
  }
  const json = await res.json();
  return (json.data || []).map((m) => m.id);
}