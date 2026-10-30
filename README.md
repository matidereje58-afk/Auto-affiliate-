# WorkBuddy — an agentic AI coding IDE on Puter.js

WorkBuddy is a browser-native coding agent built on [Puter.js](https://docs.puter.com/).
It ships **every real Puter chat model**, shows **only the reasoning-effort levels a model
actually accepts**, streams the model's **thinking and every agent step**, and runs a full
plan → act → verify loop with real file editing, JavaScript/Python execution and live preview.

No backend, no API keys, no build step. Puter's *user-pays* model means each user's own
Puter account covers their AI usage.

```bash
npm start          # http://localhost:8080
```

> Puter.js must be served over HTTP (not `file://`). `server.mjs` is a zero-dependency static server.

## Why this is not “models as decoration”

| Concern | How WorkBuddy handles it |
| --- | --- |
| Which models exist? | `puter.ai.listModels()` at runtime (the same `…/puterai/chat/models/details` endpoint the SDK uses). `data/models.json` is a build-time snapshot so the picker is instant and still works if the API is unreachable. |
| Which models can this account call? | Only models returned by the live `listModels()` are shown. Routing variants (`:free`, `:flex`, `:priority`) and reseller duplicates collapse into one row with multiple providers. Non-chat models (embeddings, ASR/TTS, image/video) are filtered out. |
| Which effort levels are real? | `js/lib/effort.js` encodes the rules from the [puter.ai.chat() docs](https://docs.puter.com/AI/chat/) per family. Levels the model does not accept are never rendered and never sent. |
| Are they *actually* working? | Every level has a **Verify** action that calls the model with that exact level, records ok/failed + latency in the UI and in storage. A level is only ticked ✓ after a real successful call. |
| Is the agent's work inspectable? | Streaming **thought process** panel, per-tool cards with timing, unified diffs for every write, a live task plan, an execution console and a preview panel. |

### Documented effort rules (source of truth: `docs.puter.com/AI/chat`)

| Model family | Mode | Levels |
| --- | --- | --- |
| OpenAI reasoning (`gpt-5*`, `gpt-6*`, `o*`, `*-codex`) | `reasoning_effort` | `none · minimal · low · medium · high · xhigh · max` |
| `gpt-6.1-terra` | `reasoning_effort` | `none · low · medium · high · xhigh · max` (no `minimal`) |
| `moonshotai/kimi-k3.1-pro` | `reasoning_effort` | `low · high · max` (default `max`) |
| `google/gemini-4-argon` | `reasoning_effort` | `low · medium · high` |
| `gemini-3.1-flash-lite`, `gemini-3-flash-preview` | `reasoning_effort` | `minimal · low · medium · high` |
| Meta Muse Spark | `reasoning_effort` | `minimal … max` (`none` ignored by the API) |
| Anthropic Claude | `thinking` | `off` / 4K / 16K / 32K / 64K `budgetTokens` |
| Everything else | — | no control is shown; the honest note explains why |

Models that always reason (capability `Reasoning` in Puter's catalogue) are labelled
*“thinking: always on”* instead of advertising an effort knob that would 400.

## The agent

* **Loop** (`js/agent/loop.js`): plan → stream reasoning → call tools → observe → repeat.
  Native function calling when the model supports it; an explicit, documented
  `tool_code` text protocol for models that don't, so *every* model can act.
* **Tools** (`js/agent/tools.js`):
  `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `search_files`,
  `run_javascript` (isolated Web Worker, 8 s budget), `run_file` (executes a project file with a
  CommonJS loader so multi-file projects and test suites run for real), `run_python` (Pyodide),
  `preview_html`, `fetch_url` (`puter.net.fetch`, no CORS), `update_plan`,
  `remember`, `ask_user`, `finish`.
* **Safety rails**: exact-match edits (no blind overwrites), path traversal blocked,
  every turn is checkpointed and restorable from the Files panel,
  verified-in-sandbox execution, and abort at any moment.
* **Long sessions**: the model-format history is persisted, trimmed by token budget,
  and compacted into a dense summary when it grows past ~90K estimated tokens.
  *Auto-continue* keeps a long task running until its plan is complete.
* **Persistence**: workspace, sessions, files, plan, memory and verification results live in
  `localStorage` and are mirrored to `puter.kv` when signed in. Generated files are written
  through to `~/WorkBuddy/<project>/…` in the user's Puter cloud drive.

## Layout

```
index.html               app shell (sidebar · transcript · inspector, model modal)
css/app.css              design system + all component styles
js/app.js                boot, catalogue, model selection, run orchestration
js/puter-client.js       puter.ai.chat / listModels wrapper, chunk normalisation, retries
js/store.js              workspace persistence (localStorage + Puter KV)
js/lib/effort.js         documented effort rules (pure, unit-tested)
js/lib/catalog.js        catalogue normalisation, grouping, live/bundled merge (pure)
js/lib/markdown.js       XSS-safe markdown renderer
js/lib/diff.js           line diff + unified diff renderer
js/lib/tokens.js         token estimation, context budget, usage parsing
js/agent/loop.js         the agent loop + text-protocol fallback
js/agent/tools.js        tool schemas and runtime
js/agent/sandbox.js      Web Worker JS sandbox
js/agent/module-loader.js CommonJS loader for run_file (require across project files)
js/agent/prompts.js      system prompt / compaction prompt
js/agent/verify.js       live model + effort verification
js/ui/*.js               transcript, inspector, model picker, DOM helpers
data/models.json         build-time snapshot of the Puter catalogue (603 models)
tools/build-catalog.mjs  regenerate the snapshot
server.mjs               static server
tests/                   unit tests (node --test) + browser E2E (playwright-core)
```

## Verify it yourself

```bash
npm test                    # 57 unit tests: effort rules, catalogue, loop, tools, module loader, diff, markdown, tokens, verifier
npm run test:e2e            # headless-Chromium UI test (needs /usr/bin/chromium)
npm run build:catalog       # refresh data/models.json from the live Puter API
```

The E2E run drives the real app with a stub that implements Puter's documented
streaming chunk shape and asserts: model + effort ladders, streaming thinking,
tool cards, diffs, plan updates, preview rendering, effort verification,
persistence across reload, and a clean console.

## Keyboard & commands

`Enter` send · `Shift+Enter` newline · `/model` `/verify` `/clear` `/new` `/plan`
`/files` `/preview` `/console` `/export`

---

Powered by [Puter](https://developer.puter.com).
