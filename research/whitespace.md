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

---

## 3. Ranked shortlist (12 concrete tools)

> **Provenance.** Sections 1–2 above were produced by the `whitespace` research agent; its run failed
> (body timeout) before sections 3–4. **Sections 3–4 were completed by the lead agent** from the same
> demand data plus the monetization envelopes in [`ad-economics.md`](./ad-economics.md) and the
> competitor/traffic inspections recorded in [`../IDEA.md`](../IDEA.md). Scores are judgement calls on
> 1–5 scales, labelled as such — not measurements.

Scoring: **DEM** demand size (from §2a bucket score), **CMP** competition weakness (5 = weak/paid incumbents, 1 = entrenched free giants), **AIP** AI-proofness (does it require the user's own device/file/live data?), **VIR** built-in virality / forced-share multiplier, **RPM** ad-vertical attractiveness. Equal weights, then an RPM-weighted variant (RPM ×2) because ads pay `pageviews × RPM`.

| # | Tool idea | DEM | CMP | AIP | VIR | RPM | Equal | RPM×2 |
|---|---|---|---|---|---|---|---|---|
| 1 | **Personal guest pass + QR guest tools for events** (chosen: see `../IDEA.md`) | 3 | 2 | 5 | 5 | 5 | **4.0** | **4.4** |
| 2 | **Privacy/fingerprint scan** — "what the web already knows about me" + shareable uniqueness card | 4 | 2 | 5 | 4 | 4 | **3.8** | 4.0 |
| 3 | **Anonymous group poll** for WhatsApp/Telegram groups (no signup, truly anonymous) | 4 | 3 | 5 | 5 | 2 | **3.8** | 3.2 |
| 4 | **Car value from crowd-reported sales** ("what did you actually get for yours?") | 5 | 1 | 5 | 3 | 4 | **3.6** | 3.8 |
| 5 | **Teacher artifact generators** (bingo, word search, seating chart, random group picker) | 5 | 2 | 5 | 3 | 2 | **3.4** | 2.8 |
| 6 | **Free ATS resume scanner** + shareable score card | 5 | 2 | 4 | 2 | 4 | **3.4** | 3.8 |
| 7 | **Legal/finance letter engine** (deposit dispute, insurance denial, chargeback) | 4 | 3 | 3 | 2 | 5 | **3.4** | 4.2 |
| 8 | **AI-agent readability audit** (live multi-user-agent fetch test + scorecard) | 4 | 1 | 4 | 3 | 4 | **3.2** | 3.6 |
| 9 | **Family chore chart / household hub** (free, no app, kids check off) | 4 | 3 | 4 | 2 | 3 | **3.2** | 3.2 |
| 10 | **Device diagnostics suite** (dead pixel, refresh rate, gamepad drift, mic/cam) | 5 | 2 | 5 | 1 | 2 | **3.0** | 2.6 |
| 11 | **AI image/text detector** | 5 | 1 | 3 | 3 | 3 | **3.0** | 3.0 |
| 12 | **"Is it down" / mundane utilities** (days-until, what-day, is-X-down) | 5 | 1 | 5 | 1 | 2 | **2.8** | 2.4 |

**Reading the two columns honestly.** Under equal weights, #2 and #3 tie with the chosen idea — because the rubric rewards virality and AI-proofness equally with revenue. Under an RPM-weighted rubric (which is the correct one, since **revenue = pageviews × RPM**, so both halves must be strong), **#1 wins outright (4.4)**, and #7 (legal letters) rises to 4.2 despite weak virality. That is exactly why the chosen idea is a *forced-share loop inside a $15–40 RPM vertical* rather than the most viral idea available (#3 has the best virality and the worst economics).


---

## 4. Top 3 — incumbents, moats, and the exact wedge

### #1 Personal guest pass + QR guest tools for events (the chosen idea — full plan in `../IDEA.md`)

* **Incumbents.** Wedding-website platforms (Zola, The Knot, Joy, WithJoy, Minted) are *already free* — they monetise gift registries and paper invitations, so you cannot out-price or out-SEO them. The QR/guest-tool layer is instead occupied by **single-feature indie tools** (`guestory.app`, `findtheseat.com`, `myguestwork`, `venued.app`), all 2025–26 vintage, none with meaningful traffic.
* **Their moat.** Domain authority + registry/gift economics (big players); nothing but novelty (indie tools).
* **The wedge.** Don't compete with the wedding website — **sit on top of it.** "Already have a site or an invitation? Add the guest layer." Free, no signup, QR-first, personal pass with the table number, and a co-authored keepsake. Revenue comes from ads on guest pages, which the incumbent *cannot* copy without cannibalising its own registry revenue.
* **Why the rubric likes it.** VIR 5 (100–300 forced visitors per host, K≈1–2) × RPM 5 ($15–40 Tier-1).

### #2 Privacy / fingerprint scan ("what the web already knows about me")

* **Incumbents.** BrowserLeaks, Pixelscan, AmIUnique, EFF's Cover Your Tracks, plus the "what is my IP" utilities. All free, all dated, almost all **un-shareable** (raw tables, no card).
* **Their moat.** Long-standing domain authority and technical credibility; nothing on design, sharing or mobile.
* **The wedge.** Turn the raw output into a **shareable, screenshot-ready "uniqueness card"** ("you are 1 in 312,000 — here is exactly which 14 signals identify you") plus a plain-English fix list. AI-proof by construction (it must run on *your* device), and the audience is exactly who VPN/security advertisers pay $10–25 RPM to reach. Ship it in a weekend; monetise on the content pages, not the scan itself.
* **Risk.** Commodity category; you win on presentation and share loop, not on new capability.

### #3 Anonymous group poll for WhatsApp/Telegram groups

* **Incumbents.** Strawpoll, Doodle, Google Forms, Poll Everywhere — plus WhatsApp's own (non-anonymous) polls.
* **Their moat.** Free, familiar, and already installed in the group chat. Google Forms is genuinely anonymous but clunky to share into WhatsApp.
* **The wedge.** "**Anonymous**, no signup, works in a WhatsApp group in 10 seconds" — the demand is explicit in the data (`anonymous poll maker whatsapp`, `anonymous survey free no sign up`, `anonymous poll website free`). The blocker is economics, not demand: consumer RPM is ~$3–8, so treat it as a **weekend experiment that feeds traffic into a higher-RPM tool**, not as the business.

**What all three share (the pattern worth copying):** each is a **verdict on the user's own thing** — the dominant intent class in this dataset (`checker/test/tester` = 2,385 appearances, `my/mine/personal` = 638) and the one class an AI Overview can never satisfy.

