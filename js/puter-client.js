/**
 * Thin, defensive wrapper around Puter.js AI.
 *
 * Docs: https://docs.puter.com/AI/chat/  ·  https://docs.puter.com/AI/listModels/
 *
 * Everything the rest of the app needs goes through here so that vendor
 * differences in streamed chunk shapes live in one place:
 *   text | reasoning | tool_use | usage | image | compaction | error
 */
import { effortOptions } from './lib/effort.js';
import { readUsage } from './lib/tokens.js';

export class PuterClient extends EventTarget {
  constructor() {
    super();
    this.modelsCache = null;
    this.modelsFetchedAt = 0;
  }

  /** Wait until the puter.js script from js.puter.com has initialised. */
  async ready(timeout = 20000) {
    const started = Date.now();
    while (!(window.puter && window.puter.ai)) {
      if (Date.now() - started > timeout) {
        throw new Error('Puter.js did not load. Check your connection to js.puter.com.');
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return window.puter;
  }

  get puter() {
    return window.puter;
  }

  // ---------------------------------------------------------------- auth ----
  isSignedIn() {
    try {
      return Boolean(this.puter?.auth?.isSignedIn?.());
    } catch {
      return false;
    }
  }

  async signIn() {
    await this.ready();
    return this.puter.auth.signIn();
  }

  async signOut() {
    try {
      await this.puter?.auth?.signOut?.();
    } catch (error) {
      console.warn('sign-out failed', error);
    }
  }

  async currentUser() {
    try {
      if (!this.isSignedIn()) return null;
      return await this.puter.auth.getUser();
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------- models ----
  /**
   * The authoritative, live catalogue: only models Puter can call right now.
   * Rejects on failure so the caller can fall back to the bundled snapshot.
   */
  async listModels({ force = false } = {}) {
    if (!force && this.modelsCache && Date.now() - this.modelsFetchedAt < 60_000) {
      return this.modelsCache;
    }
    await this.ready();
    const live = await Promise.race([
      this.puter.ai.listModels(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('listModels timeout')), 30000)),
    ]);
    this.modelsCache = Array.isArray(live) ? live : [];
    this.modelsFetchedAt = Date.now();
    return this.modelsCache;
  }

  // ---------------------------------------------------------------- chat ----
  /**
   * Stream a completion and translate Puter chunks into simple events.
   *
   * @param {object} params
   * @param {Array} params.messages
   * @param {string} params.model
   * @param {object|null} [params.effort] resolved effort capability
   * @param {string|null} [params.level]  chosen effort level
   * @param {Array} [params.tools]
   * @param {AbortSignal} [params.signal]
   * @param {number} [params.maxTokens]
   * @param {number|null} [params.temperature]
   * @param {string|null} [params.provider]
   * @param {(event: object) => void} [params.onEvent]
   */
  async streamChat({
    messages,
    model,
    effort = null,
    level = null,
    tools = null,
    signal = null,
    maxTokens = null,
    temperature = null,
    provider = null,
    webSearch = false,
    onEvent = () => {},
  }) {
    await this.ready();
    const options = this.buildOptions({ model, effort, level, tools, maxTokens, temperature, provider, webSearch });
    const started = Date.now();
    const result = { text: '', reasoning: '', toolCalls: [], usage: null, finishReason: null, model, level };
    let streamed = false;

    const consume = async (response) => {
      if (!response) return;
      if (typeof response[Symbol.asyncIterator] !== 'function') {
        this.handleNonStreaming(response, result, onEvent);
        return;
      }
      for await (const chunk of response) {
        streamed = true;
        this.handleChunk(chunk, result, onEvent);
      }
    };

    try {
      const response = await this.withRetry(
        () => this.puter.ai.chat(messages, { ...options, stream: true, signal: signal ?? undefined }),
        { signal, hasPartial: () => streamed },
      );
      await consume(response);
    } catch (error) {
      const info = this.classifyError(error);
      onEvent({ type: 'error', ...info, raw: error });
      result.error = info;
      result.durationMs = Date.now() - started;
      return result;
    }

    result.durationMs = Date.now() - started;
    onEvent({
      type: 'done',
      text: result.text,
      reasoning: result.reasoning,
      toolCalls: result.toolCalls,
      usage: result.usage,
      durationMs: result.durationMs,
      finishReason: result.finishReason,
    });
    return result;
  }

  buildOptions({ model, effort, level, tools, maxTokens, temperature, provider, webSearch }) {
    const options = { model, normalize: true };
    if (provider) options.provider = provider;
    if (maxTokens) options.max_tokens = maxTokens;
    if (Array.isArray(tools) && tools.length) options.tools = tools;
    Object.assign(options, effortOptions(effort, level));
    // Anthropic rejects a custom temperature while extended thinking is on.
    const thinkingOn = Boolean(options.thinking && options.thinking.type !== 'disabled');
    if (typeof temperature === 'number' && !thinkingOn && effort?.mode !== 'reasoning_effort') {
      options.temperature = temperature;
    }
    if (webSearch) {
      const list = Array.isArray(options.tools) ? options.tools.slice() : [];
      list.push({ type: 'web_search' });
      options.tools = list;
    }
    return options;
  }


  handleChunk(chunk, result, onEvent) {
    if (!chunk || typeof chunk !== 'object') return;
    const type = chunk.type ?? (chunk.text ? 'text' : chunk.reasoning ? 'reasoning' : null);
    switch (type) {
      case 'text':
        if (chunk.text) {
          result.text += chunk.text;
          onEvent({ type: 'text', text: chunk.text });
        }
        break;
      case 'reasoning':
        if (chunk.reasoning) {
          result.reasoning += chunk.reasoning;
          onEvent({ type: 'reasoning', text: chunk.reasoning });
        }
        break;
      case 'reasoning_start':
        onEvent({ type: 'reasoning_start', format: chunk.format });
        break;
      case 'reasoning_detail':
        onEvent({ type: 'reasoning_detail', detail: chunk.detail });
        break;
      case 'tool_use':
        result.toolCalls.push({
          id: chunk.id ?? `call_${result.toolCalls.length + 1}`,
          name: chunk.name,
          input: chunk.input ?? {},
          extra: chunk.extra_content ?? null,
        });
        onEvent({ type: 'tool_use', id: chunk.id, name: chunk.name, input: chunk.input ?? {} });
        break;
      case 'tool_use_start':
        onEvent({ type: 'tool_use_start', id: chunk.id, name: chunk.name });
        break;
      case 'tool_input_delta':
        onEvent({ type: 'tool_input_delta', id: chunk.id, delta: chunk.partialJson });
        break;
      case 'server_tool':
        onEvent({ type: 'server_tool', block: chunk.block });
        break;
      case 'usage': {
        const usage = readUsage(chunk.usage ?? chunk);
        if (usage) {
          result.usage = usage;
          result.finishReason = chunk.finish_reason ?? chunk.stopReason ?? null;
          onEvent({ type: 'usage', usage, finishReason: result.finishReason });
        }
        break;
      }
      case 'image':
        onEvent({ type: 'image', image: chunk.image });
        break;
      case 'compaction':
        onEvent({ type: 'compaction', item: chunk });
        break;
      case 'error': {
        const info = this.classifyError(chunk);
        result.error = info;
        onEvent({ type: 'error', ...info });
        break;
      }
      default:
        if (chunk.text) {
          result.text += chunk.text;
          onEvent({ type: 'text', text: chunk.text });
        } else if (chunk.reasoning) {
          result.reasoning += chunk.reasoning;
          onEvent({ type: 'reasoning', text: chunk.reasoning });
        }
    }
  }


  handleNonStreaming(response, result, onEvent) {
    const message = response.message ?? response;
    const content = message?.content;
    if (typeof content === 'string') {
      result.text = content;
      if (content) onEvent({ type: 'text', text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && block.text) {
          result.text += block.text;
          onEvent({ type: 'text', text: block.text });
        } else if (block?.type === 'thinking' && block.thinking) {
          result.reasoning += block.thinking;
          onEvent({ type: 'reasoning', text: block.thinking });
        }
      }
    }
    const reasoning = message?.reasoning ?? message?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning && !result.reasoning) {
      result.reasoning = reasoning;
      onEvent({ type: 'reasoning', text: reasoning });
    }
    for (const call of message?.tool_calls ?? []) {
      const fn = call.function ?? call;
      let input = fn.arguments ?? fn.input ?? {};
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input);
        } catch {
          input = { raw: input };
        }
      }
      result.toolCalls.push({ id: call.id ?? `call_${result.toolCalls.length + 1}`, name: fn.name, input });
      onEvent({ type: 'tool_use', id: call.id, name: fn.name, input });
    }
    const usage = readUsage(response.usage);
    if (usage) {
      result.usage = usage;
      onEvent({ type: 'usage', usage, finishReason: response.finish_reason ?? null });
    }
    result.finishReason = response.finish_reason ?? null;
    onEvent({
      type: 'done',
      text: result.text,
      reasoning: result.reasoning,
      toolCalls: result.toolCalls,
      usage: result.usage,
    });
  }

  /** One-shot, non-streaming call (used by the verifier and helper utilities). */
  async chat({ messages, model, effort = null, level = null, maxTokens = 512, temperature = null, provider = null, signal = null }) {
    await this.ready();
    const options = this.buildOptions({ model, effort, level, maxTokens, temperature, provider });
    const response = await this.puter.ai.chat(messages, { ...options, stream: false, signal: signal ?? undefined });
    const result = { text: '', reasoning: '', toolCalls: [], usage: null };
    this.handleNonStreaming(response, result, () => {});
    return result;
  }


  // -------------------------------------------------------------- errors ----
  /** Map vendor errors to a small, actionable taxonomy. */
  classifyError(error = {}) {
    const message = String(error?.message ?? error?.error?.message ?? error ?? 'Unknown error');
    const code = String(error?.code ?? error?.error?.code ?? '');
    const lower = `${code} ${message}`.toLowerCase();
    if (error?.name === 'AbortError' || lower.includes('abort')) {
      return { kind: 'aborted', message: 'Stopped by user.', retryable: false };
    }
    if (lower.includes('rate') || lower.includes('429') || lower.includes('quota') || lower.includes('allowance') || lower.includes('credit')) {
      return { kind: 'rate_limit', message, retryable: true };
    }
    if (lower.includes('token_missing') || lower.includes('unauth') || lower.includes('401') || lower.includes('permission')) {
      return { kind: 'auth', message, retryable: false };
    }
    if (lower.includes('bad_request') || lower.includes('400')) {
      return { kind: 'bad_request', message, retryable: false };
    }
    if (lower.includes('model') && (lower.includes('not found') || lower.includes('unsupported') || lower.includes('invalid'))) {
      return { kind: 'model', message, retryable: false };
    }
    if (lower.includes('context') || lower.includes('too long') || lower.includes('maximum length')) {
      return { kind: 'context', message, retryable: false };
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout') || lower.includes('502') || lower.includes('503')) {
      return { kind: 'network', message, retryable: true };
    }
    return { kind: 'unknown', message, retryable: false };
  }

  async withRetry(fn, { signal, hasPartial = () => false, attempts = 3 } = {}) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const info = this.classifyError(error);
        if (!info.retryable || hasPartial() || attempt === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

/** Shared instance; the UI and the agent both use it. */
export const puterClient = new PuterClient();

