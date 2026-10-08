# Atria Agent

**A powerful AI agent that runs a whole sandbox inside your browser tab — no backend, no install.**

Powered by the **Atria Dawn Preview** model (`Atria-Dawn-Preview`, 744B-parameter MoE, 256K context) through the
[Atria API](https://api.atria-asi.ai/docs).

Live site: **https://matidereje58-afk.github.io/Auto-affiliate-/**

---

## What it is

A single-page web app that gives the model a real execution environment and an agent loop
(`think → call tool → observe → repeat`) so it can actually *do* things instead of only talking:

| Capability | Implementation |
| --- | --- |
| **Python sandbox** | CPython compiled to WebAssembly (Pyodide 0.27) in a Web Worker. Persistent interpreter session: variables, imports and objects survive between tool calls. Top-level `await` works. `numpy`, `pandas`, `matplotlib`, `scipy`, `scikit-learn`, `sympy` and ~20 more packages auto-install via micropip on first import. |
| **JavaScript sandbox** | Separate persistent Worker (async scope, `console` capture, `fetch`, file helpers). Killing an infinite loop is a `terminate()`. |
| **Shared workspace** | Virtual filesystem in IndexedDB, mirrored in and out of both sandboxes, browsable in the UI, with preview (HTML renders live in a sandboxed iframe), download and one-click `.zip` export. |
| **Web access** | `web_search` (DuckDuckGo discovery → reader fallbacks → Wikipedia), `fetch_url` (reader proxy rendering → direct CORS fetch → PDF text extraction with pdf.js), `wikipedia` (clean API lookups). |
| **Artifacts** | `create_artifact` writes a file and surfaces it in an Artifacts panel: HTML dashboards/reports render live and can be opened full-screen or downloaded. |
| **Charts** | Any open `matplotlib` figure is auto-saved to the workspace as PNG and shown in the UI. |
| **Planning** | `todo_write` publishes a live task list into the chat and the Plan panel. |
| **Sub-agents** | `spawn_subagent` runs a fresh agent (own context, same sandbox) on one self-contained task and returns only its report — parallel research without polluting the main context. |
| **Memory** | `memory` key/value store persisted on the device and injected into the system prompt of every future session. |
| **Conversations** | History list with restore; settings, memory and workspace all persist locally. |
| **Streaming UI** | Live reasoning panel, streaming markdown with syntax highlighting, per-tool cards showing arguments and raw results, token/step counters, activity log, stop button. |

Everything runs client-side. The only network calls are to the Atria API, the CDN assets and the pages the agent chooses to read.

## Quick start

### Run it locally

```bash
python3 -m http.server 8000     # or: npx serve .
# open http://127.0.0.1:8000/
```

A static file server is required (ES modules + Web Workers do not work from `file://`).

### Use it

1. Open the page. The Atria API key is pre-filled in **Settings** (stored in this browser only).
   You can also pass a key without storing it: `index.html#key=atr_…`.
2. Type a task, e.g. *"Analyse this CSV, chart the trends and build an interactive dashboard."*
3. Watch the reasoning, tool calls and results stream in; files appear in the Workspace panel,
   deliverables in the Artifacts panel.

### Deploy it

The site is a plain static bundle — host the repository root anywhere:

* **GitHub Pages** — *Settings → Pages → Source: Deploy from a branch → `main` / `(root)`* →
  `https://<user>.github.io/<repo>/`
* **Netlify / Cloudflare Pages / Vercel** — drag & drop the folder or connect the repo (no build step).
* **Any web server / S3 bucket** — upload `index.html`, `app.css`, `app.js`, `icon.svg`,
  `manifest.webmanifest`, `lib/`, `agent/`, `ui/`, `workers/`.

## Configuration

Open **Settings** (⚙) in the app:

| Setting | Default | Notes |
| --- | --- | --- |
| API key | the key in `lib/store.js` | Stored locally; sent only to the Atria API. |
| Base URL | `https://api.atria-asi.ai/v1` | Any OpenAI-compatible endpoint. |
| Model | `Atria-Dawn-Preview` | Case-sensitive. |
| Reasoning effort | `low` | `low` / `medium` / `high`. This preview endpoint burns a lot of reasoning tokens: `low` is far faster for interactive work, `high` is for hard problems. |
| Max steps | 25 | Tool-call iterations per user message. |
| Max output tokens | 16384 | Per model step (model limit: 65,536). |
| Temperature | unset | Left to the provider by default. |
| System prompt | built-in | Fully replaceable. |
| Memory | editable | One `key = value` per line. |
| Sub-agents | on | Allow `spawn_subagent`. |

> **Security note:** the API key is embedded in the shipped page so the site works for anyone who
> opens the link, and every visitor's requests are billed to that key. Replace it in **Settings**
> (and in `lib/store.js` if you self-host) with a key you are happy to share.

## Architecture

```
index.html            shell + panels
app.css               design system (dark/light)
app.js                controller: session, streaming UI, run loop wiring
lib/util.js           helpers (path normalisation, formatting, tolerant JSON)
lib/vfs.js            workspace filesystem (IndexedDB)
lib/store.js          settings / conversations / memory persistence
lib/sandbox.js        worker handles, timeouts, workspace ⇄ sandbox sync
agent/atria.js        streaming client for the Atria API (+ stall watchdog, retries)
agent/prompt.js       system prompts (main agent + sub-agent)
agent/loop.js         the agent loop, context trimming, sub-agent runner
agent/tools/specs.js  tool JSON schemas exposed to the model
agent/tools/index.js  tool dispatch (sandbox, files, web, artifacts, plan, memory)
agent/tools/web.js    search, fetch (reader fallbacks, PDF), Wikipedia
ui/render.js          chat rendering (reasoning, tool cards, plans, artifacts)
ui/panels.js          workspace / artifacts / plan / activity panels
ui/modals.js          settings, history, artifact preview, toasts
workers/python-worker.js  Pyodide sandbox (persistent namespace, file mirror, charts)
workers/js-worker.js      JavaScript sandbox (persistent scope, console capture)
```

The agent loop trims the oldest tool traffic when a request approaches the context budget, caps each
tool result, retries after rate-limit/5xx responses or stream stalls, and auto-continues when the
model hits the output-length limit.

## Tools exposed to the model

`run_python`, `run_javascript`, `list_files`, `read_file`, `write_file`, `append_file`,
`delete_file`, `search_files`, `web_search`, `fetch_url`, `wikipedia`, `create_artifact`,
`todo_write`, `memory`, `spawn_subagent`.

## Verified behaviour

End-to-end runs in headless Chromium (Playwright) against the live API, on the shipped build:

* The Python sandbox boots (Pyodide 0.27.4) and the agent computes, verifies, writes `report.md` to
  the workspace and reports the file — `run_python` + `write_file` cards with raw results, zero page errors.
* Multi-step tasks stream live reasoning, tool arguments/results and a plan list.
* HTML artifacts are written to the workspace, listed in the Artifacts panel and rendered in a
  sandboxed iframe; matplotlib figures are exported to PNG automatically.

## Limits to know about

* Python is WebAssembly: heavy native packages (torch, tensorflow) are unavailable and long numeric
  workloads run slower than native CPython. There is no shell/OS access by design.
* The provider is a *preview* endpoint at roughly 10 tokens/s, so a large HTML artifact takes minutes.
  Reasoning effort `low` is recommended; the UI streams continuously so you can watch progress.
* Requests go straight from the browser to `api.atria-asi.ai` (CORS is open). If you place the app
  behind a strict Content-Security-Policy, allow `https://api.atria-asi.ai`, `https://cdn.jsdelivr.net`,
  `https://cdnjs.cloudflare.com`, `https://r.jina.ai`, `https://en.wikipedia.org` and
  `https://html.duckduckgo.com`.

## License

MIT.
