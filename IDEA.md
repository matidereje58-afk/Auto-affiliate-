# THE ONE IDEA — "GuestPass"
### A free, zero-signup, QR-powered *personal guest pass* engine for weddings & every other occasion
**Zero-budget · ad-monetized · one person · built on free-tier infra**

---

## 0. The 60-second version

> **Build one tiny free tool: a host creates an event in 60 seconds (no account) and gets ONE link + one QR code. Every guest opens that link, types their name, and receives a *personal* pass page — their table, the schedule, the menu, parking, dress code — plus a message wall they co-author.**
>
> The guests are not your customers. **They are your traffic.** One host = 100–300 people who *must* open your URL, 4–6 times each, across 3–5 real pages each time.
>
> Monetization: display ads on every page, in the highest-RPM consumer vertical that exists (weddings/celebrations, US/UK/CA/AU traffic). Cost: $0 (Cloudflare free tier + client-side rendering, text-only, no photo storage).
>
> The loop that makes it compound: every pass page carries *"Create your own free guest pass"* — and the audience staring at it (wedding guests) is statistically the **most likely population on earth to host their own big event within 24 months**.

That single sentence is the whole strategy: **stop trying to acquire traffic. Make a tool where every user is forced to hand your URL to 100+ other people.**

---

## 1. The three ingredients, re-read honestly

You gave me three ingredients. Most people use them wrong. Here is the correct reading:

| Your ingredient | The naive reading (fails) | The strategic reading (works) |
|---|---|---|
| **"I have zero dollars"** | "I can't compete, I can't buy ads." | **$0 is not a handicap, it is a filter.** It forces a design that cannot be copied by someone who just throws money at Google Ads. Free-tier edge compute (Cloudflare Workers/Pages/D1/KV) gives a solo operator a real backend for $0. Zero budget means: no media storage, no LLM API calls, no servers — **text-only, client-side, edge-cached.** Design for that constraint from minute one and your marginal cost per visitor is literally $0.00. |
| **"I want to make money with ads (CPM/CPC)"** | "Put ads on a page and hope." | **Ads pay per 1,000 *pageviews*, in a *vertical*, to a *geography*.** So the only three levers that matter are: (1) volume of pageviews, (2) RPM of the vertical, (3) share of Tier-1 traffic. Every architectural decision below exists to multiply one of those three. |
| **"I'll build a website with a novel tool (not a calculator)"** | "Build a clever utility and wait for SEO." | **The tool must be a *distribution machine*, not a utility.** A utility gets one visitor. A tool that a host *has to share* with 100 guests gets 100 visitors — and 100 free impressions of your brand. The tool's job is not to be clever; it is to **route other people's audiences onto your domain.** |

**The "smart ingredient" you asked me to add is this: the tool is the distribution channel.** Everything else (SEO, Pinterest, launch spikes) is secondary to a product whose *output* is a link that hundreds of people must open.

---

## 2. Why this exact idea and not the obvious ones

I researched the obvious plays before choosing. Here is what the evidence said — and why each was rejected. (Full sources in `research/`.)

| Candidate | Verdict | The evidence that killed it |
|---|---|---|
| "AI bot access / AI visibility checker" | ❌ **Commodity already** | A dozen free clones exist (`aibotaccess.com`, `crawlercheck.com`, `aicrawlercheck.com`, …), most are just robots.txt parsers used as lead-magnets for paid SaaS. Ahrefs already published the big dataset. Audience = webmasters (small). |
| "Free wedding website builder" | ❌ **Red ocean, unwinnable on SEO** | Zola, The Knot, Joy, WithJoy, Minted + dozens of indie builders are *already free* (they monetize registries/gifts). You cannot out-SEO them. |
| "Free ATS resume checker" | ⚠️ **Huge demand, no distribution loop** | 30 "free"-intent autocomplete signals (the strongest of any seed I mined), but incumbents (Jobscan, Teal, Rezi) have real domains. 1 user = 1.5 visitors. No compounding. Good runner-up, bad *architecture*. |
| "QR seating chart / digital guestbook app" | ⚠️ **Emerging but being colonised right now** | `guestory.app`, `findtheseat.com`, `myguestwork`, `venued.app` — all 2025–26 indie tools. **This is the signal to move fast, not to stay away**: the incumbents are single-feature and have no traffic yet, unlike the wedding-website giants. |
| "Free chore chart / family hub" | ❌ | 25 "free" signals — but the intent is *printable PDF*, one visit, no multiplier, and Cozi already owns free+ads. |
| "Anonymous poll for WhatsApp groups" | ⚠️ | 21 "free"-intent signals and a real unmet need (WhatsApp polls are not anonymous), but consumer RPM is ~$3–8 and Strawpoll/Doodle exist. |
| **"One-link personal guest pass for occasions"** | ✅ **Chosen** | Highest RPM vertical (weddings: $15–40 US RPM), highest forced-share multiplier (100–300 people per host), content-rich pages (AdSense-safe), text-only ($0 to run), AI-proof (an LLM cannot collect your RSVPs or hand your guests a table number). |

**The one-line reason:** it is the only candidate where **RPM is top-tier, the audience is adults in Tier-1 countries, every unit of acquisition produces 100+ pageviews, and the marginal cost is zero.**

---

## 3. The architecture — six loops that turn one host into hundreds of visitors

```
        ┌──────────────────────────────────────────────────────────────────┐
        │  HOST (1 person)                                                 │
        │  creates event in 60s, no account → gets 1 link + 1 QR           │
        └───────────────┬──────────────────────────────────────────────────┘
                        │  shares link/QR once (WhatsApp, invite, printed card)
                        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  GUESTS (100–300) — they MUST open it                                 │
   │  • RSVP (visit 1)                                                     │
   │  • check details / table / schedule (visit 2–3)                       │
   │  • day-of: table lookup + schedule + menu (visit 4)                   │
   │  • after: read the message wall / add a message (visit 5–6)           │
   │  Each pass = 3–5 real pages (pass, schedule, travel, messages)        │
   └───────────────┬──────────────────────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────────────────────┬───────────────────────┐
     ▼             ▼                             ▼                       ▼
  LOOP 1        LOOP 2                        LOOP 3                  LOOP 4
  GUEST→HOST    PLUS-ONE / FORWARD            PLANNER/VENUE           SEO
  footer CTA    guests forward the            one planner =           programmatic
  "make your    link to their partner         20–40 events/yr         occasion pages
   own free     = 2nd visitor free            → bulk seeding          (real content)
   pass"
     │
     ▼
  LOOP 5 — SHARE CARDS: each guest can share a spoiler-free "I'm going to X" card
           (watermark = your domain, 0.5–2% click-back on social)
     ▼
  LOOP 6 — DATA → PUBLIC PAGES: aggregate, anonymised, non-PII insight pages
           ("most requested wedding songs in 2026") → journalist/Reddit bait,
           real original data (survives Google's scaled-content policy), backlinks.
```

**Why each loop matters (and what it is worth):**

| Loop | Mechanism | Why it works | Value per unit |
|---|---|---|---|
| **1. Guest → Host** | Footer CTA on every guest page | Wedding guests are couples in the same life stage; ~10% marry within 2 years. And every other occasion (birthday, baby shower, graduation, retirement, reunion, company offsite) uses the *same* engine. | 1 host → ~100 guests → ~1–2 future hosts (K ≈ 1–2) |
| **2. Plus-one / forwarding** | Guests forward the link to partners, babysitters, carpool | Free multiplier, zero effort from you | +20–40% visitors |
| **3. Planner / venue** | One wedding planner or venue recommends you | Planners do 20–40 weddings/yr; venues host 50–200/yr. One relationship = thousands of guests. | 1 planner ≈ 20–40 events ≈ 20k–60k pageviews/yr |
| **4. SEO surface** | A page per occasion type + per tool ("QR seating chart", "free RSVP link", "digital guestbook") with genuine content around the tool | Tool pages are *not* answerable by an AI Overview, and ad policy requires real content — so the content is required anyway | compounding, slow, durable |
| **5. Share cards** | Auto-generated "I'm going!" / "See you at X" card with your watermark | The Wordle mechanic: the artifact carries the brand | 0.5–2% click-back on social |
| **6. Aggregate data** | Anonymised, non-PII insight pages ("top song requests of 2026") | Original data = the content class Google's spam policies explicitly reward; press/Reddit pick it up | backlinks + authority |

**The core pageview math (conservative):**

```
Per guest:   4 visits × 1.5 pages   = 6 pageviews
Per event:   100 guests × 6         = 600 pageviews
Per planner: 25 events × 600        = 15,000 pageviews/year from ONE relationship
```

That is the entire point: **you are not buying traffic and you are not writing 500 SEO articles. You are building a machine where 1 unit of adoption = 600 pageviews.**


---

## 4. The money — honest math, no fantasy

### 4.1 Revenue model

```
Monthly revenue = (pageviews ÷ 1000) × RPM
```

RPM envelopes from `research/ad-economics.md` §2b (directional planning envelopes; US-heavy traffic):

| Vertical | US-heavy RPM | Mixed/global RPM |
|---|---|---|
| **Weddings / celebrations** | **$15–$40** | $3–8 |
| Finance / insurance / legal | $12–$40+ | $2–8 |
| Home services / B2B | $10–$25 | $2–7 |
| Education / study tools | $5–$15 | $1–5 |
| Generic utility (converters, PDF, generators) | $4–$12 | $1–4 |
| Gaming / entertainment | $3–$10 | $0.5–3 |

**This is why the idea targets weddings, not "typing tests":** the same pageview is worth 4–6× more. Geography is the second lever — a guest in Texas is worth ~3–6× a guest in a low-RPM market, so all growth work targets US/UK/CA/AU hosts and US-skewed Pinterest.

### 4.2 Scenario table

| Scenario | Events/mo | Pageviews/mo | RPM $10 | RPM $20 | RPM $30 |
|---|---|---|---|---|---|
| **Day 1** | 3–10 | ~2k–6k | $20–60 | $40–120 | $60–180 |
| **Month 1** (one Reddit post lands + Pinterest seeded) | 30–80 | 20k–50k | $200–500 | $400–1k | $600–1.5k |
| **Month 3** (planner loop + 150 pins + long-tail) | 150–400 | 100k–250k | $1k–2.5k | $2k–5k | $3k–7.5k |
| **Month 6** | 400–900 | 250k–550k | $2.5k–5.5k | $5k–11k | $7.5k–16.5k |
| **Month 12** (+ birthdays, baby showers, reunions, corporate offsites) | 1.2k–3k | 700k–1.8M | $7k–18k | $14k–36k | $21k–54k |

**Benchmarks that keep this honest:** `bingobaker.com` — a single free generator, ads only — runs ~**26.7k visitors/day and ~145k pageviews/day** (~4.4M pv/month) per HypeStat/SEMrush estimates, built by essentially one developer. `baamboozle.com` (free classroom games, ads) does ~**5M visits/month at 5.86 pages/visit**. Those are the ceilings of this model; your year-1 target is 5–20% of them.

### 4.3 The ad-network ladder (verified requirements — `research/ad-economics.md` §1, §7)

| Stage | Network | Requirement | Notes |
|---|---|---|---|
| **Day 1** | **Google AdSense** | none | No company needed; ~80% revenue share after platform fee; $100 payout threshold; identity verification required before ads show. |
| **~1,000 Tier-1 sessions/30d** | **Journey by Mediavine** | 1,000 US/CA/UK/AU sessions | Self-serve, better RPM than AdSense; the on-ramp to Mediavine. Apply the moment you cross it. |
| **25,000 pv/mo** | **Raptive** | 25k PV (lowered from 100k in Oct 2025) | Highest ceiling; majority Tier-1 traffic + original content required. |
| **$5,000/yr ad revenue** | **Mediavine core** | $5k annual revenue (replaced the old 50k-session bar) | Premium brand demand. |
| **250,000 MAU** | **Ezoic** | 250k+ MAU (Feb 2026) | Late-stage only. |
| **Avoid** | Monetag / Adsterra / HilltopAds pop-unders | — | **Cannot coexist with AdSense on the same pages.** Redirect/pop-under chains are policy + invalid-traffic traps. Not worth it. |

### 4.4 The one number that decides everything

**Guest → Host conversion.** If 100 guests produce ≥1 new host, growth is self-sustaining (K≈1). Every product decision should be judged by that metric. Instrument it from day 1: `?ref=pass_<eventId>` on the footer CTA, and track `events created by a user who first arrived as a guest`.



---

## 5. Build spec — how to ship this for $0

### 5.1 The stack (all free tiers, no credit card)

| Layer | Choice | Free limit that matters | Why |
|---|---|---|---|
| Hosting / CDN | **Cloudflare Pages** | unlimited requests, 500 builds/mo | Static-first, global, free SSL. |
| API / dynamic | **Cloudflare Workers** | 100,000 requests/day | Serves event JSON, RSVPs, messages. |
| Database | **Cloudflare D1** (SQLite) or **KV** | D1: 5GB storage, 5M row-reads/day | Events, guests, messages — all text. |
| QR codes | **client-side JS** (qrcode lib, ~5KB) | — | Zero API calls, instant. |
| Printable QR card / seating chart | **client-side print CSS** | — | No server rendering, no cost. |
| Photos | **do not store them.** Link out to the host's own Google Photos/iCloud album | — | Media storage is the #1 way a "$0" project becomes a $200/mo project. Text-only keeps you at $0 forever. |
| AI | **none** | — | Any LLM call = a bill. Everything here is deterministic. |

**Why "no LLM" is a feature:** marginal cost stays exactly $0, latency stays ~50ms, and the product cannot be cloned by someone whose only skill is wrapping an API.

### 5.2 Data model (D1 — 5 tables, ~40 lines of SQL)

```sql
events(id, slug, kind, host_name, partner_name, event_date, venue_name, venue_addr,
       dress_code, notes, song_list_json, created_at, is_public)
guests(id, event_id, name, email_or_phone, party_size, rsvp, table_no, notes, created_at)
messages(id, event_id, guest_id, body, created_at)          -- the co-authored keepsake
songs(id, event_id, guest_id, title, artist, created_at)    -- doubles as the DJ playlist
pages(event_id, section, body_md)                           -- schedule / travel / faq / menu
```

### 5.3 Page types and where the ads go (a policy question, not a design question)

Google's Publisher Policy forbids ads on screens "**without publisher-content or with low-value content**" (verified — `research/ad-economics.md` §4d). So:

| Page | Ad-safe? | Why |
|---|---|---|
| `/` landing + occasion guides | ✅ Yes | Real editorial content + tool. |
| `/qr-seating-chart`, `/free-rsvp-link`, `/digital-guestbook` tool pages | ✅ Yes | Substantive content *around* the tool (methodology, examples, FAQ) — never an empty input box with an ad. |
| `/e/<slug>` public event info (schedule, travel, menu, FAQ) | ✅ Yes | Genuine content written by the host; no PII. |
| `/e/<slug>/messages` (keepsake wall) | ✅ Yes | User-generated content = real content. |
| `/e/<slug>/pass/<opaqueId>` personal pass | ⚠️ **Non-personalised ads only** | Personal + behavioural screen: serve contextual ads only, never pass PII into the ad request. |
| RSVP form, loading/empty states, error pages, printable pages | ❌ **No ad slots at all** | Policy names empty/under-construction/behavioural screens. Suppress the slot in code. |
| Anything `noindex` | ❌ | Keep ad inventory on indexable, content-rich pages. |

**Two hard design rules:**
1. **Never put a guest's name in a URL.** Use opaque IDs (`/pass/g_7f3a91`). Protects privacy *and* stops PII leaking into ad requests, analytics and logs.
2. **Guest data is private by default:** `noindex` on every event page, no guest list ever public, one-click "delete my event and everything in it".

### 5.4 The six screens that must exist on day 1 (nothing more)

1. **Create** — 6 fields, one button, no signup. Output: link + QR + "print your QR card".
2. **Host dashboard** — private link (a token, not an account): RSVP list, counts, table assignment (paste your guest list → auto-distribute), printable seating chart.
3. **Guest entry** — open link → type name → find their row (or "add me +1").
4. **Personal pass** — name, date, venue + map link, table number, schedule, dress code, menu, parking, "add to calendar" (ICS), plus tabs for **Messages** and **Song requests**.
5. **Message wall** — the co-authored keepsake; guests read/contribute; export as a printable PDF after the event.
6. **Footer loop** — *"This pass was made free with [BRAND]. Make one for your event in 60 seconds →"* with `?ref=pass_<eventId>`.

**Everything else is v2.** Birthdays, baby showers, graduations, reunions, company offsites — all are the same six screens with different labels.

---

## 6. Day-1 launch playbook — where the first 5,000 visitors come from (and why it costs $0)

You cannot get "ultra-high traffic on day 1" from SEO — nobody can. **What you *can* get on day 1 is a concentrated community spike, and then the architecture does the compounding.** Here is the exact order of operations.

### Day 0 — before you announce anything
- Ship the 6 screens. Make one real event with 30 fake-but-plausible guests so every page is populated (never launch an empty product; ad slots must never fire on empty states anyway).
- Create the launch asset: **a 45-second screen recording** of "create event → send link → guest gets a personal pass with their table number". This video *is* your marketing; it explains the product in one watch.
- Prepare 3 different hooks (see below) because you will post to different communities with different rules.

### Day 1–3 — the concentrated spikes (pick 3, not 10)

| Channel | Why it works | The hook that survives moderation |
|---|---|---|
| **r/weddingplanning** (~1M members) | Hosts actively planning, mid-funnel, they answer "how do I do a seating chart / RSVP" daily | Answer 5 real seating-chart questions *with the tool*, then post: "I built a free thing that gives every guest a personal pass with their table number — no signup, no app." Lead with the free QR card. |
| **r/weddingsunder10k** | The single most cost-obsessed wedding community on the internet | "Free, no fees, no registry lock-in" is the entire culture there. |
| **r/DIYweddings / r/wedding** | Same audience, different mods | Same post, rewritten. |
| **Pinterest** (US-skewed, evergreen, free) | The wedding traffic king; pins compound for years | 20 pins: "QR seating chart", "free digital guestbook", "printable QR guest card", "wedding schedule QR". Vertical 1000×1500 images. This is your month-3 engine. |
| **TikTok / Reels** (#weddingtok, #weddingplanning) | The "guess my table" and "digital guestbook" formats are already viral | Film the *guest's* phone: scan QR → pass appears with table 7. 15 seconds, no talking. |
| **Facebook wedding groups** | Massive, less moderated than Reddit | Post the same free offer, ask the admins first. |
| **Product Hunt** | One-day spike, decent backlink | Only if you can ship a genuinely polished demo. |

### Day 3–14 — the multiplier that actually scales: **planners and venues**
One relationship is worth more than 100 Reddit upvotes.

- **Message 50 wedding planners** (find them on Instagram/Google Maps — they all list an email or DM): *"Your couples keep asking about seating charts and RSVPs. I built a free tool where every guest gets a personal pass with their table number and your branding on it. Unlimited events, no signup, no fee — I'd love to give you a custom-branded version for your next wedding."*
- **Same message to venues, photographers, DJs, officiants, and event coordinators** (DJs are perfect: they *want* the song-request feature).
- Target: **5 planners × 25 events/yr = 125 events/year from five emails.**

### Week 2+ — the compounding layers
- **Long-tail SEO** (§7): build the tool pages first, the essays second.
- **The keepsake export**: after each event, the host gets a "your guests wrote 47 messages — here's the printable keepsake". That email is a *reason to come back* and a reason to tell the next host.
- **Seasonal waves:** engagement season (Dec–Feb) → wedding season (May–Sep). Ramp content in November, harvest in June.

### The three hooks (use verbatim, A/B them)
1. **"Your guests will lose the invitation. They will not lose their table number."** → the pass is the product.
2. **"No signup, no app, no fees. Send one link, every guest gets their own pass."** → the wedge against every incumbent.
3. **"Print one QR card, put it on the table — 100 guests find their seats in 4 seconds."** → the day-of utility (this is the one venues and planners forward).

**Anti-patterns that will get you banned:** posting the same link to 6 subreddits on the same day; DM-spamming brides; using affiliate links in launch posts; making the first comment "check out my tool" without answering a question first.


---

## 7. The AI-proof layer — why this survives 2026 (and what does not)

**The brutal fact:** informational content is dead as a traffic strategy. Studies of Google AI Overviews found **58–61% lower click-through** on queries that get an AI answer (`research/` notes; multiple 2025–26 studies). If your plan is "write 300 articles about wedding etiquette", an AI Overview eats 6 of every 10 clicks and you lose.

**The good news:** an AI Overview cannot do any of the following, and never will:
- collect an RSVP from 100 named guests,
- tell a guest their table number,
- host a message wall written by 47 different people,
- generate a QR code that works at a specific venue,
- hand a host a live headcount 3 days before the event.

So the rule is: **the tool is the traffic; the content is only the wrapper that makes the tool ad-eligible and discoverable.**

### 7.1 What to index vs. what to hide

| Index | Noindex |
|---|---|
| `/` landing, occasion guides | every `/e/<slug>` event page (private by default) |
| tool pages: `/qr-seating-chart`, `/free-rsvp-link`, `/digital-guestbook`, `/qr-song-requests`, `/guest-pass` | guest pass pages, RSVP forms, host dashboards |
| programmatic *public* pages built on aggregate, non-PII data (`/song-requests/most-popular-2026`) | anything containing a name, phone, email or address |
| printable QR card templates | printable outputs themselves (no ad inventory) |

### 7.2 The content that must exist around each tool (AdSense-safe wrapper)

For every tool page, ship the same 6-block structure — this is what turns "an empty input box with ads" (a policy violation) into a legitimate resource:

1. **What it is** (2 short paragraphs, plain language).
2. **How it works** (numbered steps + one screenshot).
3. **A worked example** (a real-looking event: "Sarah & Tom, 120 guests, 14 tables").
4. **FAQ** (8–12 questions taken verbatim from autocomplete — you already have the demand data).
5. **Related tools** (internal links — this is how you get 2–3 pages/session).
6. **The tool itself**, above the fold, with ads *below* it and in the sidebar only.

### 7.3 The programmatic layer (do this in month 2, not month 1)

Only build pages that contain **data no one else has**, because that is the one content class Google's spam policy explicitly protects (`research/ad-economics.md` §4a: the test is *user value, not authoring method*):

- **Aggregate, anonymised, non-PII insights**: "The 100 most-requested wedding songs of 2026", "Average number of +1s per guest (n=12,480 events)", "What time guests actually RSVP". These get cited, linked, and shared — and they are genuinely un-copyable.
- **Programmatic per-occasion pages**: one page per occasion type × per tool (wedding/birthday/baby shower/graduation × pass/RSVP/seating/guestbook). Each must have real, differentiated content — **never** a template with the noun swapped. That is exactly the "scaled content abuse" pattern (verified policy, §4a).
- **What NOT to do:** thousands of near-identical pages, AI-written filler, or public event pages (privacy + thin content + UGC spam exposure).

### 7.4 The four things that will kill this project (and the early warning for each)

| Risk | Early warning | Mitigation |
|---|---|---|
| **Guests don't adopt the pass** (they RSVP and never come back) | pages/guest < 2 after 20 events | Make the pass the *only* way to get the table number + put the schedule/menu *only* on the pass. The pass must be *necessary*, not nice. |
| **Guest → Host conversion ≈ 0** | <1 new host per 100 guests after 30 events | Test 5 footer CTAs; move the CTA into the "after the event" keepsake email (highest-intent moment: they just saw 47 friends write messages). |
| **Ad policy problem** (low-value screens, PII in ad requests) | AdSense warnings, "no content" flags | Follow §5.3 exactly; never a bare input box with an ad; never names in URLs. |
| **A funded competitor copies you** | — | They won't copy the free/no-signup/QR-first position *and* the ad model at the same time (it looks unattractive to VCs and it cannibalises their registry revenue). Speed + the planner relationship network is the moat, not the code. |

**Kill criteria (be ruthless):** if after 90 days and 100+ real events you have (a) fewer than 3 pageviews per guest, or (b) fewer than 1 new host per 150 guests, pivot the engine to a vertical with a *higher* group frequency — corporate offsites/HR (attendees are adults, RPM is B2B) or classrooms (daily frequency, but COPPA care needed).


---

## 8. The 14-day build plan (one person, $0)

| Day | Ship | Done when |
|---|---|---|
| 1 | Repo + Cloudflare Pages project + design tokens | `example.pages.dev` loads |
| 2 | Create-event flow (6 fields) + D1 schema + Worker endpoints | You can create an event and get a slug |
| 3 | Guest entry + RSVP + host dashboard (token link) | 10 test guests RSVP from a phone |
| 4 | Personal pass page (table, schedule, dress code, ICS, map link) | A guest sees their own pass |
| 5 | QR generation + printable QR card (print CSS) | You print a card, scan it, land on the event |
| 6 | Message wall + song requests | Two test guests exchange messages |
| 7 | Ad slots behind a feature flag + content wrapper for `/` | AdSense-safe layout from day 1 |
| 8 | Footer loop + `?ref=pass_<eventId>` attribution + analytics events | You can measure guest→host |
| 9 | Privacy: `noindex` on event pages, opaque IDs, delete-my-event | No name appears in any URL |
| 10 | 3 tool pages with the full 6-block wrapper (§7.2) | Each page has 800+ words of real content |
| 11 | 20 Pinterest pins + 45-second demo video | Assets ready to publish |
| 12 | Apply to AdSense; publish 3 Reddit answers + 1 post | Live and earning-eligible |
| 13 | DM 50 planners / venues / DJs | 50 messages sent |
| 14 | Measure guests, pages/guest, guest→host, RPM | You have a baseline to iterate on |

**Then measure only 4 numbers:** (1) events created, (2) pageviews per guest, (3) guest→host conversion, (4) RPM. Everything else is vanity.


---

## 9. Runner-ups (if you want a different risk profile)

Scored on the same rubric — **D1** day-1 reachability, **SP** self-propagation, **RPM**, **VOL** volume ceiling, **BUILD** simplicity/$0, **DUR** durability/AI-proofness (1–5, weighted).

| Idea | D1 | SP | RPM | VOL | BUILD | DUR | Weighted | Verdict |
|---|---|---|---|---|---|---|---|---|
| **A. GuestPass (chosen)** | 4 | 5 | 5 | 4 | 3 | 4 | **4.25** | Best architecture + best RPM; medium build; move before the niche fills. |
| **B. Free ATS / job-scan toolkit** (resume score, keyword gap, cover-letter match, shareable score card) | 5 | 2 | 4 | 5 | 4 | 3 | **3.75** | Biggest proven demand — the strongest "free"-intent signal of any seed I mined (30 queries). Simplest build. **No distribution loop**, so month 1 is slower. Pick this if you want to ship in 4 days. |
| **C. AI agent-readability audit** (a *live* multi-user-agent fetch test, not a robots.txt parser, + shareable scorecard) | 4 | 2 | 4 | 2 | 3 | 4 | **2.95** | Timeliest topic in tech marketing and genuinely differentiated — I verified the mechanic live: `cnn.com` returns **451** to GPTBot/PerplexityBot/ClaudeBot but **200** to OAI-SearchBot (a screenshot-worthy, LLM-unanswerable result). But the audience is small (webmasters) and free checkers are already a commodity. |
| **D. Anonymous group poll for WhatsApp** | 4 | 5 | 2 | 4 | 5 | 4 | **4.10** | Weekend build, strong unmet need, but consumer RPM is $3–8 and Strawpoll/Doodle exist. Great experiment, weak business. |
| **E. Classroom live tool (13+)** | 5 | 5 | 3 | 4 | 3 | 4 | **4.10** | Highest-frequency group engine that exists (a class opens it daily) — but ads on child-facing pages carry COPPA/policy risk and Kahoot/Blooket/Baamboozle/Gimkit own the space. |

**Why GuestPass still ranks first:** B and E have equal or better *demand*, but only A converts **one adopter into 100+ visitors at a $15–40 RPM** — the specific thing you asked for. B is the pragmatic fallback; D is the weekend test.


---

## 10. Evidence base (everything in this doc is sourced)

| Claim | Source |
|---|---|
| RPM envelopes by vertical; ad-network thresholds (Journey 1k sessions, Raptive 25k PV, Mediavine $5k/yr, Ezoic 250k MAU) | `research/ad-economics.md` §1–2, §7 (network policy pages, fetched 2026-10-10) |
| AdSense: no company needed, ~80% share after platform fee, $100 payout, identity verification first | `research/ad-economics.md` §6a (Google AdSense support docs) |
| No ads on "screens without publisher-content / low-value content", empty states, printable or behavioural screens | Google Publisher Policies via `research/ad-economics.md` §4d (verified) |
| Ads cannot be served inside widgets embedded on third-party domains; pop-unders incompatible with AdSense | `research/ad-economics.md` §5 (verified) |
| Scaled-content-abuse policy = "user value, not authoring method" | `research/ad-economics.md` §4a (Google Search spam policies, updated 2026-08-28) |
| Ad density ceiling 20% desktop / 24% mobile; >25% correlated with declines | Raptive Aug-2025 spam-update analysis via `research/ad-economics.md` §2a |
| `bingobaker.com` ≈ 26.7k visitors/day, 145k pageviews/day (~4.4M pv/mo) | HypeStat + SEMrush estimates (fetched 2026-10-10) — *estimates, not audited* |
| `baamboozle.com` ≈ 5.0M visits/month at 5.86 pages/visit | HypeStat compare page (fetched 2026-10-10) — *estimates* |
| Free-tool demand signals: resume-ats 30 "free"-intent queries, chore-chart 25, wedding-website 21, anonymous-poll 21, rsvp 20 | Google autocomplete harvest — `research/autocomplete/` (373 query sets mined live, raw JSON kept) |
| AI Overviews reduce clicks ~58–61% | 2025–26 published studies surfaced during research (directional) |
| The live bot-block differential test works and produces a dramatic result | my own curl test in this session: `cnn.com` → 451 (GPTBot/PerplexityBot/ClaudeBot), 200 (OAI-SearchBot, normal browser) |
| Wedding QR/guest-tool niche is emerging, not saturated | direct inspection of `guestory.app`, `findtheseat.com`, `myguestwork`, `venued.app` (2025–26 indie tools, single-feature) |

**Honesty note:** every RPM figure in §4 is a *planning envelope*, not a promise. Revenue depends on your actual geo mix, ad density, seasonality and fill rate. Replace every number above with your own AdSense data after 30 days.

---

## 11. What to do in the next 60 minutes

1. **Decide:** GuestPass (architecture-first, ~2 weeks) or the ATS toolkit (demand-first, ~4 days). If you want revenue sooner with less complexity, build B — and reuse A's *loop* (share cards + attribution footer) as your distribution mechanic.
2. **Reserve the domain** and create the Cloudflare Pages project (both free, both 5 minutes).
3. **Write the copy before the code** — the create flow, the pass, the footer CTA. In this product, the copy *is* the growth engine.
4. **Run one real event for a friend** and watch 20 real guests use it. That single test tells you whether pages/guest > 3 — the number the entire business rests on.

