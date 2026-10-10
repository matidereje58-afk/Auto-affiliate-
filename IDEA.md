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

