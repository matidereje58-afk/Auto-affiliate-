# Whitespace research: free, interactive, AI-proof tools that can pull high visitor volume

**Author:** whitespace (SEO / demand-research analyst) · **Date:** 2026-10-10
**Question:** where is there a free, interactive, AI-proof web tool with high volume, weak incumbents, viral output and ad-attractive economics?

> **Honesty contract used throughout.** Search-volume numbers are **estimates** unless a source URL is given. Every claim has a URL or a saved evidence file. "AI-proof" means the answer *requires the user's own device, file, or a live external fetch* — something a chatbot / AI Overview cannot return. "Dead traffic" means an AI Overview or ChatGPT already answers it inline (zero-click).

---

## 1. Method & evidence index

**Primary demand proxy = Google autocomplete (real API, live in sandbox).**
Endpoint used: `https://suggestqueries.google.com/complete/search?client={firefox|chrome}&hl=en&q=SEED`
(raw JSON saved under `/workspace/research/autocomplete/`).

**Harvest executed (scripts in this folder):**
- `harvest.sh` — 113 base seeds × 2 clients (firefox+chrome) + alphabet expansion (`"seed a"…"seed z","seed 0-9"`) on 27 high-value seeds + year/context modifiers (`"seed 2026","seed online","seed free"`).
- `probe2.sh` — second pass on 52 finalist seeds + alphabet expansion on 5 finalists.
- Result: **1,407 raw JSON dumps; 1,396 parsed; 10,872 unique suggestions.**
- Aggregation: `analyze.py` (intent buckets) → `buckets.txt`; `analyze2.py` (action modifiers) → `modifiers.txt`.
- Search proxy: `search.py` (Bing RSS `format=rss`, used because DuckDuckGo/Reddit/Similarweb returned 403/anti-bot).

**Cross-check sources:** Wikimedia pageviews REST API (`wikimedia.org/api/rest_v1/metrics/pageviews/...`), competitor pages fetched directly, Chrome Web Store (JS-rendered — install counts **not** retrievable), and teammate monetization brief `/workspace/research/ad-economics.md`.

**Known limits (brutal):** no absolute keyword volumes (no Keyword Planner); Similarweb, Reddit, X, DuckDuckGo all blocked from sandbox; autocomplete frequency is a *relative intent* signal, not a volume number; RPM ranges are the teammate's `directional` planning envelopes.

---

## 2. Raw demand-signal table (evidence)

### 2a. Intent-bucket totals — sum of suggestion appearances across all seeds

| Rank | Intent bucket | Signal score | Representative repeated intents (cross-seed count) |
|---|---|---|---|
| 1 | **edu-generators** (bingo, word search, crossword, seating chart, group/name picker, spinner, worksheets) | **2,373** | random name generator (8), random name picker (7), spinner wheel generator (4), bingo card generator free printable (4) |
| 2 | **finance-legal** (contract/invoice/dispute/ATS/resume/car-value) | **1,889** | dispute letter example (16), how much is my car worth calculator (14), resume format to pass ATS (8), contract generator free (4) |
| 3 | **device/display** (dead pixel, refresh rate, HDR, color) | **1,205** | dead pixel tester (5), refresh rate test (5), dead pixel test monitor (5), dead pixel test and fix (5) |
| 4 | **creator-utility** (QR, link-in-bio, polls, RSVP, anonymous msg) | **1,037** | qr code generator free (5), qr code generator free no expiration (4), anonymous message website (2) |
| 5 | **device/input-latency** (gamepad, controller drift, input lag, keyboard/mouse) | **961** | gamepad tester online (7), gamepad tester stick drift (7), gamepad tester and debugger (7), gamepad tester calibration (5), gamepad not working (5) |
| 6 | **device/mic-cam** (mic, camera, webcam, speaker, headphones) | **937** | mic test online (6), camera test online (5), camera test website/laptop/mac (4 each) |
| 7 | **ai-detection** (AI text/image detector, deepfake) | **838** | what is ai image (9), ai detector image (6), ai detector for essays (5), ai image detector bypass (4) |
| 8 | **mundane** (is it down, days-until, what day) | **804** | is it down or just me (4), is it down for everyone (4), how many days until christmas (4) |
| 9 | **privacy-fingerprint** (my IP, browser fingerprint, DNS/WebRTC leak) | **754** | what is my ip address (8), what is my ip address nordvpn (7), what is my ip address ipv4 (6), browser fingerprint check (5), how to check browser fingerprint (5) |
| 10 | **ai-visibility** (AI visibility/GEO, llms.txt, robots.txt, AI crawler, AI cost) | **707** | robots.txt example (8), robots.txt explained (6), llms.txt generator free (3), ai visibility checker free/tool/for website (2 each), ai crawler blocking (2) |
| 11 | **net-diagnostics** (speed, ping, DNS leak) | **703** | internet speed test google/ookla/spectrum/xfinity (4 each), "dns leak test nordvpn/surfshark (3 each) |

### 2b. Action-modifier frequency — what users *want to do* (across 10,872 unique suggestions)

| Modifier | Count | Read |
|---|---|---|
| checker / test / tester | **2,385** | Dominant intent is "give me a verdict on MY thing" → tool-shaped, not article-shaped |
| ai-era (ai/chatgpt/llm/prompt/deepfake/watermark) | **1,153** | The 2025-26 demand wave is real and large in the graph |
| generator / maker / builder | **656** | Output-creation intent (viral/shareable potential) |
| my / mine / personal | **638** | \"my device / my IP / my file / my car\" → **AI-proof** by construction |
| free | **388** | Price sensitivity is table stakes |
| template / example | **302** | Doc/letter demand (mostly AI-answerable) |
| online / no-download | **258** | Browser-first expectation |
| download / print / pdf | **195** | Education/print loop (bingo, worksheets) |
| how-to | **84** | Mostly **dead** (AI answers these) |
| alternative / vs | **78** | Dissatisfaction with incumbents = wedge signal |
| not working / fix | **69** | Problem-aware, high-intent (gamepad drift, dead pixel, mic) |

### 2c. Highest cross-seed intents (the \"most-repeated intents\" the brief asked for)

`dispute letter example (16)` · `how much is my car worth calculator (14)` · `browser fingerprinting meaning (11)` · `what is ai detection (10)` · `browser fingerprint example (10)` · `what is my ip address (8)` · `random name generator (8)` · `resume format to pass ats (8)` · `gamepad tester online/stick drift/download/android/and debugger (7 each)` · `robots.txt example (8)` · `ai detector image (6)` · `mic test online (6)`."
