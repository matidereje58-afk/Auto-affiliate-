/**
 * The agent loop.
 *
 * One turn = plan → reason (streamed, visible) → act with tools → observe → repeat.
 * Native function calling is used when the model supports it; otherwise the
 * model drives the same tools through a documented text protocol.
 */
import { buildSystemPrompt, buildCompactionPrompt, TOOL_PROTOCOL_HINT } from './prompts.js';
import { estimateConversationTokens } from '../lib/tokens.js';
import { toolMeta } from './tools.js';

const MAX_OBSERVATION = 12000;

/** Parse a ```tool_code {json} ``` block produced by non-function-calling models. */
export function parseTextToolCalls(text) {
  const calls = [];
  const pattern = /```(?:tool_code|json)?\s*([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(String(text ?? '')))) {
    const body = match[1].trim();
    if (!body.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.tool === 'string') {
        calls.push({ id: `text_${calls.length + 1}`, name: parsed.tool, input: parsed.input ?? {} });
      }
    } catch {
      /* not a tool call */
    }
  }
  return calls;
}

export function stripToolBlocks(text) {
  return String(text ?? '').replace(/```(?:tool_code)\s*[\s\S]*?```/g, '').trim();
}

export async function runAgentTurn({
  client,
  store,
  runtime,
  model,
  effort = null,
  level = null,
  history = [],
  mode = 'agent',
  maxSteps = 25,
  signal = null,
  temperature = null,
  webSearch = false,
  compaction = true,
  onEvent = () => {},
}) {
  const messages = [...history];
  const toolNames = mode === 'agent' ? runtime.specs.map((s) => s.function.name) : [];
  const nativeTools = mode === 'agent' && model?.toolCall !== false;
  const system = buildSystemPrompt({ project: store.project, model, mode, toolNames, webSearch });
  let steps = 0;
  let finished = false;
  let usage = { input: 0, output: 0, cost: 0 };
  let compacted = false;

  while (steps < maxSteps) {
    if (signal?.aborted) return { messages, steps, usage, finished: false, aborted: true };
    steps += 1;
    onEvent({ type: 'step_start', step: steps, maxSteps });

    if (compaction && !compacted && estimateConversationTokens(messages) > 90000 && messages.length > 8) {
      const result = await compactHistory({ client, model, messages, effort, level });
      if (result) {
        messages.length = 0;
        messages.push(...result);
        compacted = true;
        onEvent({ type: 'compacted' });
      }
    }

    const stepText = { text: '', reasoning: '', toolCalls: [] };
    const result = await client.streamChat({
      messages: [{ role: 'system', content: system }, ...messages],
      model: model.id,
      effort,
      level,
      tools: nativeTools ? runtime.specs : null,
      maxTokens: null,
      temperature,
      webSearch,
      signal,
      onEvent: (event) => {
        if (event.type === 'text') {
          stepText.text += event.text;
          onEvent({ type: 'assistant_text', text: event.text, step: steps });
        } else if (event.type === 'reasoning') {
          stepText.reasoning += event.text;
          onEvent({ type: 'assistant_reasoning', text: event.text, step: steps });
        } else if (event.type === 'tool_use') {
          stepText.toolCalls.push({ id: event.id, name: event.name, input: event.input });
        } else if (event.type === 'usage') {
          usage.input += event.usage?.input ?? 0;
          usage.output += event.usage?.output ?? 0;
          usage.cost += event.usage?.cost ?? 0;
          onEvent(event);
        } else if (event.type === 'error') {
          onEvent({ ...event, step: steps });
        }
      },
    });

    if (result.error && result.error.kind !== 'aborted') {
      onEvent({ type: 'turn_error', error: result.error });
      return { messages, steps, usage, finished: false, error: result.error };
    }
    if (result.error?.kind === 'aborted' || signal?.aborted) {
      return { messages, steps, usage, finished: false, aborted: true };
    }

    let calls = stepText.toolCalls;
    if (!nativeTools && mode === 'agent') {
      calls = parseTextToolCalls(stepText.text);
    }

    if (!calls.length) {
      messages.push({ role: 'assistant', content: nativeTools ? stepText.text : stripToolBlocks(stepText.text) });
      const finalText = nativeTools ? stepText.text : stripToolBlocks(stepText.text);
      onEvent({ type: 'turn_end', text: finalText, reasoning: stepText.reasoning, steps, usage });
      return { messages, steps, usage, finished: true, text: finalText, reasoning: stepText.reasoning };
    }

    const visibleText = nativeTools ? stepText.text : stripToolBlocks(stepText.text);
    messages.push({
      role: 'assistant',
      content: visibleText || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
      })),
    });

    for (const call of calls) {
      if (signal?.aborted) return { messages, steps, usage, finished: false, aborted: true };
      const meta = toolMeta(call.name);
      onEvent({ type: 'step_tool', step: steps, call, meta });
      const outcome = await runtime.execute(call.name, call.input ?? {});
      const observation = String(outcome.summary ?? '').slice(0, MAX_OBSERVATION);
      if (nativeTools) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: observation });
      } else {
        messages.push({ role: 'user', content: `TOOL RESULT (${call.name})\n${observation}` });
      }
      if (outcome.done) {
        onEvent({ type: 'turn_end', text: visibleText, steps, usage, finished: true });
        return { messages, steps, usage, finished: true, text: visibleText };
      }
    }
  }

  onEvent({ type: 'step_limit', steps, usage });
  return { messages, steps, usage, finished: false, hitStepLimit: true };
}

/** Replace the oldest half of the conversation with one dense summary message. */
async function compactHistory({ client, model, messages, effort, level }) {
  const keep = 6;
  if (messages.length <= keep) return null;
  const older = messages.slice(0, messages.length - keep);
  const recent = messages.slice(messages.length - keep);
  const transcript = older
    .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n')
    .slice(-24000);
  try {
    const summary = await client.chat({
      messages: [{ role: 'user', content: buildCompactionPrompt() + transcript }],
      model: model.id,
      effort,
      level: 'none',
      maxTokens: 900,
    });
    const text = String(summary.text ?? '').trim();
    if (!text) return null;
    return [{ role: 'assistant', content: `CONTEXT SUMMARY (earlier turns)\n${text}` }, ...recent];
  } catch {
    return null;
  }
}
