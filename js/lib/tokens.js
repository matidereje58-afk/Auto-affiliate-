/**
 * Cheap token estimation + context-window budgeting.
 * Puter does not expose a tokenizer in the browser, so we use the widely used
 * ~4 characters/token heuristic and add per-message overhead. It is only used
 * for the context meter and for deciding when to compact — never for billing.
 */

export function estimateTokens(text) {
  const value = typeof text === 'string' ? text : JSON.stringify(text ?? '');
  if (!value) return 0;
  const chars = value.length;
  const words = value.split(/\s+/).length;
  // Blend character and word heuristics; code is denser than prose.
  return Math.ceil((chars / 4 + words * 0.75) / 2);
}

export function estimateMessageTokens(message) {
  if (!message) return 0;
  let total = 4;
  if (typeof message.content === 'string') total += estimateTokens(message.content);
  else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.text) total += estimateTokens(part.text);
      else total += 8;
    }
  }
  if (Array.isArray(message.tool_calls)) total += estimateTokens(message.tool_calls);
  if (message.reasoning) total += estimateTokens(message.reasoning);
  return total;
}

export function estimateConversationTokens(messages = []) {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

/** 0..1 fraction of the window used, plus the remaining token budget. */
export function contextUsage(messages, contextWindow) {
  const used = estimateConversationTokens(messages);
  const window = Number(contextWindow) || 128000;
  return {
    used,
    window,
    remaining: Math.max(0, window - used),
    ratio: Math.min(1, used / window),
  };
}

/** Should we compact before the next call? */
export function needsCompaction(messages, contextWindow, threshold = 0.72) {
  const { ratio } = contextUsage(messages, contextWindow);
  return ratio >= threshold;
}

/** Trim a conversation to the most recent messages while keeping the system prompt. */
export function trimConversation(messages, maxTokens) {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  let budget = Math.max(0, maxTokens - estimateConversationTokens(system));
  const kept = [];
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const cost = estimateMessageTokens(rest[i]);
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(rest[i]);
  }
  // Never start a tool result without its assistant tool call.
  while (kept.length && kept[0].role === 'tool') kept.shift();
  return [...system, ...kept];
}

/** Coarse cost estimate in USD for a run. */
export function estimateCost(inputTokens, outputTokens, inputPrice, outputPrice) {
  if (!inputPrice && !outputPrice) return 0;
  return ((inputTokens * (inputPrice ?? 0)) + (outputTokens * (outputPrice ?? 0))) / 1_000_000;
}

export function formatCost(value) {
  const n = Number(value) || 0;
  if (!n) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

export function formatTokens(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Usage chunk from Puter may be shaped differently per vendor. */
export function readUsage(usage) {
  if (!usage) return null;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0;
  const cost = typeof usage.cost === 'number' ? usage.cost / 1_000_000 : null; // microcents -> USD
  return { input, output, total: input + output, cost };
}
