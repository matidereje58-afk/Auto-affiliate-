// The agent loop: think → call tools → observe → repeat, with context management.

import { streamChat, DEFAULT_BASE_URL, DEFAULT_MODEL } from './atria.js';
import { createToolRunner, TOOL_SPECS } from './tools/index.js';
import { buildSystemPrompt, SUBAGENT_SYSTEM_PROMPT } from './prompt.js';
import { estTokens, truncate } from '../lib/util.js';

const TOOL_RESULT_BUDGET = 24000;     // chars kept per tool result in history
const CONTEXT_CHAR_BUDGET = 380000;   // ~95k tokens max in one request

/**
 * Run one agent turn (possibly many model/tool iterations).
 * `messages` is the live conversation array and is mutated in place.
 */
export async function runAgent(opts) {
  const {
    messages, settings, emit = () => {}, signal, depth = 0, memoryStore,
    onArtifact, onPlan, activity, spawnSubagent, isSubagent = false,
  } = opts;

  const runner = createToolRunner({ onArtifact, onPlan, activity, memoryStore, spawnSubagent, depth });
  const maxSteps = Math.max(1, Math.min(Number(settings.maxSteps) || 25, 60));

  const systemIndex = messages.findIndex((m) => m.role === 'system');
  if (systemIndex === -1) throw new Error('conversation is missing its system message');

  let steps = 0;
  let continuations = 0;
  const totals = { prompt: 0, completion: 0, reasoning: 0 };

  while (steps < maxSteps) {
    if (signal?.aborted) { emit({ type: 'aborted' }); break; }
    steps++;

    trimContext(messages, systemIndex);
    emit({ type: 'step_start', step: steps, maxSteps, messageCount: messages.length });

    let chunk;
    try {
      chunk = await streamChat({
        messages,
        tools: settings.useTools !== false ? TOOL_SPECS : undefined,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || DEFAULT_BASE_URL,
        model: settings.model || DEFAULT_MODEL,
        maxTokens: settings.maxTokens || 16384,
        reasoningEffort: settings.reasoningEffort || 'medium',
        temperature: settings.temperature,
        signal,
        onDelta: (d) => {
          if (d.type === 'content') emit({ type: 'content', text: d.text });
          else if (d.type === 'reasoning') emit({ type: 'reasoning', text: d.text });
          else if (d.type === 'tool_call') emit({ type: 'tool_args', index: d.index, name: d.name, arguments: d.arguments });
        },
        onRetry: ({ attempt, wait, error }) => emit({ type: 'retry', attempt, wait, error: String(error.message || error) }),
      });
    } catch (err) {
      if (err.name === 'AbortError') { emit({ type: 'aborted' }); break; }
      emit({ type: 'error', error: err.message, hint: err.hint, status: err.status });
      break;
    }

    if (chunk.usage) {
      totals.prompt += chunk.usage.prompt_tokens || 0;
      totals.completion += chunk.usage.completion_tokens || 0;
      totals.reasoning += chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
      emit({ type: 'usage', usage: chunk.usage, totals: { ...totals } });
    }

    const assistantMessage = { role: 'assistant', content: chunk.content || '' };
    if (chunk.toolCalls.length) {
      assistantMessage.tool_calls = chunk.toolCalls.map((t) => ({
        id: t.id,
        type: 'function',
        function: { name: t.name, arguments: t.arguments || '{}' },
      }));
    }
    messages.push(assistantMessage);
    emit({
      type: 'assistant_message',
      content: chunk.content || '',
      reasoning: chunk.reasoning,
      toolCalls: chunk.toolCalls.map((t) => ({ id: t.id, name: t.name, args: t.args, raw: t.arguments })),
      finishReason: chunk.finishReason,
    });

    if (chunk.toolCalls.length) {
      for (const call of chunk.toolCalls) {
        if (signal?.aborted) { emit({ type: 'aborted' }); return totals; }
        const args = call.args ?? {};
        emit({ type: 'tool_start', id: call.id, name: call.name, args });
        const t0 = performance.now();
        let result;
        try {
          result = await runner.execute(call.name, args);
        } catch (err) {
          result = { output: `ERROR: ${err.message}`, error: true };
        }
        const ms = Math.round(performance.now() - t0);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: truncate(result.output ?? '', TOOL_RESULT_BUDGET, '\n…[truncated]'),
        });
        emit({ type: 'tool_end', id: call.id, name: call.name, args, ms, error: !!result.error, output: result.output, display: result.display, extra: result });
      }
      continue;
    }

    if (chunk.finishReason === 'length' && continuations < 2 && (chunk.content || '').trim()) {
      continuations++;
      messages.push({ role: 'user', content: 'Your previous response was cut off by the output-length limit. Continue from exactly where it stopped — do not repeat anything already written.' });
      emit({ type: 'continue_truncated' });
      continue;
    }
    emit({ type: 'turn_done', steps, totals: { ...totals } });
    return totals;
  }

  if (steps >= maxSteps) emit({ type: 'max_steps', steps: maxSteps });
  return totals;
}
/** Keep the request inside the model window: drop the oldest step (assistant + tool results) first. */
export function trimContext(messages, systemIndex) {
  const total = () => messages.reduce(
    (n, m) => n + estTokens(m.content) + estTokens(JSON.stringify(m.tool_calls || '')),
    0
  );
  const budget = CONTEXT_CHAR_BUDGET / 4; // tokens
  if (total() <= budget) return;

  const keepTail = 10;
  let i = systemIndex + 1;
  while (total() > budget && messages.length - i > keepTail) {
    const msg = messages[i];
    messages.splice(i, 1);
    // A dropped assistant message with tool_calls orphans its tool results — drop them too.
    if (msg.role === 'assistant' && msg.tool_calls) {
      const ids = new Set(msg.tool_calls.map((t) => t.id));
      while (i < messages.length && messages[i].role === 'tool' && ids.has(messages[i].tool_call_id)) messages.splice(i, 1);
    }
  }
}

/** Build a fresh sub-agent conversation, run it to completion, return its final report. */
export async function runSubagent({ task, maxSteps, settings, emit, signal, memoryStore, onArtifact, onPlan, activity }) {
  const messages = [
    { role: 'system', content: SUBAGENT_SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];
  const totals = await runAgent({
    messages,
    settings: { ...settings, maxSteps: Math.max(1, Math.min(Number(maxSteps) || 12, 30)) },
    emit, signal, depth: 0, memoryStore, onArtifact, onPlan, activity, isSubagent: true,
  });
  const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content?.trim());
  const report = last?.content?.trim() || '(the sub-agent produced no final report)';
  const toolsUsed = messages
    .filter((m) => m.role === 'assistant' && m.tool_calls)
    .reduce((n, m) => n + m.tool_calls.length, 0);
  return `${report}\n\n[sub-agent: ${toolsUsed} tool call(s), ${totals.prompt + totals.completion} tokens]`;
}

export { buildSystemPrompt };
