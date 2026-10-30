/**
 * Live verification of models and reasoning-effort levels.
 *
 * The UI never shows an effort level as "working" because a doc said so: this
 * module actually calls the model with that level and records what happened.
 */

export function verificationKey(modelId, level) {
  return `${modelId}::${level || 'default'}`;
}

/**
 * Call the model once with a tiny prompt.
 * @returns {Promise<{ok:boolean, ms:number, error:string|null, reasoningChars:number, text:string}>}
 */
export async function probeModel({ client, model, effort = null, level = null, signal = null, provider = null }) {
  const started = performance.now();
  try {
    const result = await client.streamChat({
      messages: [
        { role: 'system', content: 'You are a health check. Answer with exactly one word.' },
        { role: 'user', content: 'Reply with OK.' },
      ],
      model: model.id,
      effort,
      level,
      maxTokens: 64,
      provider,
      signal,
      onEvent: () => {},
    });
    const ms = Math.round(performance.now() - started);
    if (result.error) {
      return { ok: false, ms, error: result.error.message || result.error.kind, reasoningChars: 0, text: '' };
    }
    const text = String(result.text ?? '').trim();
    if (!text && !result.reasoning) {
      return { ok: false, ms, error: 'Empty response', reasoningChars: 0, text: '' };
    }
    return { ok: true, ms, error: null, reasoningChars: (result.reasoning ?? '').length, text: text.slice(0, 120) };
  } catch (error) {
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      error: error?.message ?? String(error),
      reasoningChars: 0,
      text: '',
    };
  }
}

/**
 * Probe every level a model claims to support, sequentially (rate-limit friendly).
 * Results are persisted through `store.setVerification`.
 */
export async function verifyEffortLevels({ client, store, model, effort, levels, signal = null, provider = null, onProgress = () => {} }) {
  const results = {};
  const list = levels?.length ? levels : [null];
  for (const level of list) {
    if (signal?.aborted) break;
    onProgress({ status: 'started', level });
    const outcome = await probeModel({ client, model, effort, level, signal, provider });
    const key = verificationKey(model.id, level);
    store.setVerification(key, outcome);
    results[level ?? 'default'] = outcome;
    onProgress({ status: 'finished', level, outcome });
  }
  return results;
}
