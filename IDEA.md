# IDEA.md — The Product, Specified

> **Flagship deployment: `InReview` — "How long will your approval *actually* take?"**
> First queue covered: app-store & developer-platform review/approval queues (Apple App Review, Google Play, Meta App Review, TestFlight/notarization, and adjacent platform gates). The engine then expands by config file.

---

## 1. The problem, stated as a market

Every developer, agency, and e-commerce operator lives behind an **opaque approval queue**:

- App Review says "In Review" for 2 days or 3 weeks. You cannot see the line, the queue length, or whether your submission is normal or forgotten.
- Google Play, Meta App Review, payment-platform underwriting, ad-account reviews, cloud quota increases, enterprise API access — all the same structure: **you submit, the platform goes dark, and your launch date hangs on an unknown clock.**

Three things are true at once, and that combination *is* the business:

1. **The anxiety is acute and recurring.** People check daily. Some check hourly.
2. **The data genuinely does not exist in usable form.** Platforms publish nothing. Third-party estimates are stale averages with no cohort, no country, no submission type, no confidence interval — and, critically, **no answer to the only question that matters: "is my wait unusual *for me*?"**
3. **The audience is valuable to advertisers.** Indie developers, mobile teams, and agencies spend $50–500/month on tooling without blinking. B2B SaaS advertisers bid $5–25 CPC to reach them.

**The insight:** the platform will never publish the queue. But **thousands of people are living through it right now, and each of them knows their own start and end date.** The dataset already exists, sitting in the heads of the population, unaggregated. You don't need to scrape anyone. You need to build the *surface* that collects it as exhaust.

---

## 2. What you actually build (screen by screen)

### Screen 1 — The Check (hook, SEO surface, data intake)

> **"When did you submit? What are you submitting?"**

Two inputs (date + queue config). Output, instantly and free:

```
Your submission                        Apple App Review — iOS, new app, US
Submitted                              Day 0
Current median for this cohort         Day 4  (n = 1,284, p25–p75 = 2–7)
Cohort status                          NORMAL
You are here                           Day 6 → 62nd percentile
Expected decision                      ~Day 8   (80% CI: Day 5 – Day 14)
Verdict                                ⚠ Slower than 62% of this cohort — not yet a problem
```

The output is **personalised, comparative, and defensible.** That is what makes it shareable: people screenshot it into team Slack, subreddit threads, Discords.

**Critical design decision:** the result is free, but it sits **behind an email** (or a one-click magic link). You do not have a business until you have the list. See `STRATEGY.md` for why the list is worth 5–350x the ad impressions.

### Screen 2 — The Badge (the distribution engine)

Every check mints a **live SVG badge** with a permanent URL:

```html
<a href="https://inreview.app/q/apple/abc123">
  <img src="https://inreview.app/badge/abc123.svg" alt="App Review status">
</a>
```

Rendered live: `App Review: pending · day 6 · normal` — recoloured automatically as the cohort shifts.

Developers put badges in READMEs, docs and status pages, internal dashboards, PR descriptions, and Slack channels. **Distribution that costs nothing, never decays, and compounds** — and it's culturally native (shields.io trained 15 years of developers to do exactly this). Every embed is also a permanent backlink, and a pageview whenever anyone looks.

> The badge is the load-bearing wall of the entire strategy. If you build one thing well, build this.

### Screen 3 — The Index (PR surface, sponsor inventory)

A public, auto-updated, journalist-ready page:

> **The Queue Index — Week 34**
> App Store review median: **4.1 days (+1.3 vs 4-week avg)**
> Google Play median: **2.7 days (−0.4)**
> p90 tail (the "am I forgotten?" tail): **14 days (+4)**
> Backlog proxy: **+38% submissions week-over-week**

**Journalists need citable numbers and don't care about your traffic.** "App Store review times up 47% since March" is a story 9to5Mac, Mobile Dev Memo, and every dev newsletter runs with a link. That is free, editorial, high-authority distribution — the one channel that never depends on a moderator's goodwill.

It is also **your most valuable ad surface**: one page, high-intent B2B audience, natural single-sponsor fit.

### Screen 4 — The Alert (retention loop, paid tier)

> "Alert me when my cohort's median moves." / "Alert me if I pass p90 and should escalate to an appeal."

Email alerts free. **Alerts on your own submission + appeal-timing advice + a weekly cohort report** = Pro. This is where recurring revenue lives.

### Screen 5 — B2B (month 4+, only if the above works)

An API/CSV of cohort medians and tail risk, sold to tools that already sell to this audience (release management, ASO, CI/CD, mobile observability). This is the exit-shaped asset: **a dataset nobody else can assemble.**

---

## 3. The queue config — why this is an engine, not a website

Every queue is one declarative file. This is the entire expansion mechanism:

```yaml
queue: apple_app_review
label: "Apple App Review"
unit: days
submit_url: "https://appstoreconnect.apple.com"
# What makes cohorts incomparable (and therefore what we segment on)
segments:
  - platform: [ios, ipados, macos, tvos, watchos, visionos]
  - release_type: [new_app, update, hotfix, resubmission]
  - country_tier: [us, eu, row]
  - first_submission: [true, false]
# The anxiety vocabulary — becomes the SEO surface and the alert triggers
escalation_threshold_p90: true
typical_range: [2, 7]
sources_of_record: ["Apple's stated 24-48h", "App Review Guidelines §2.3"]
```

Payment-platform underwriting, ad-account reviews, cloud quota increases, enterprise API access, domain/SSL issuance, marketplace seller verification, app-store featuring pitches — **same file, different label.** One codebase, one badge system, one ad stack, ~300 addressable queues.

**That is the compounding asymmetry:** a blog author must write 300 articles. You write one engine and 300 config files, each of which starts collecting proprietary data the day it goes live.

---

## 4. The monetization stack (in the order you switch each on)

Ranked by revenue per visitor.

| # | Rail | Turn on | Realistic value | Why it's here |
|---|---|---|---|---|
| 1 | **Founding sponsor** — one B2B SaaS logo, flat fee, sold by DM | **Day 2–5** | **$150–400/mo** or one-off, paid up front | The only Day-1-adjacent dollar. 100% margin, no gatekeeper, no approval. |
| 2 | **Email list** (the actual asset) | Day 1 | **$0.50–3.00 per subscriber per month** | The only thing a platform can't take from you. Sponsors pay per open, not per impression. |
| 3 | **Premium alerts** ($6–12/mo) | Day 20–45 | 0.5–2% of list → **$60–480/mo at 1,000 subs** | Recurring, high-intent, near-zero marginal cost. |
| 4 | **Affiliate / lead routing** on the check page | Day 1 | **$0.10–0.60 per check** | ASO, release management, crash reporting, cloud credits. High EPC, fast approvals. |
| 5 | **Display ads** (the "floor") | Day 7–21, after approval | **$15–40 RPM** | Ezoic/AdSense on tier-1 B2B traffic. The *backstop*, not the business. |
| 6 | **Sponsorship of The Queue Index** | Day 45+ | **$250–2,000/mo** once citations exist | Sells itself the moment you can show press pickups. |
| 7 | **B2B data API** | Month 4+ | **$200–2,000/mo per customer** | The defensible, sellable asset. |

**The ranking is the strategy.** Almost everyone inverts it — they build for #5 and wonder why the money never arrives. Ads are the *floor under a business that already exists*, not the business.

---

## 5. The two flywheels

**Flywheel A — Data.** More users → more cohort samples → tighter confidence intervals → more trustworthy answer → more users. The dataset, not the code, is the moat. It can't be bought, only accumulated — and you start accumulating on day one.

**Flywheel B — Distribution.** Free check → badge embed → visitor from someone else's README → free check → more badges. No ad spend, no algorithm, no moderator. Every embed is a permanent, self-replicating ad unit installed by the user, free, on their own property.

The flywheels feed each other: badges bring users who submit data; data makes badges more accurate; accuracy makes badges worth embedding.

---

## 6. Why it works specifically at $0

| Constraint | How the architecture neutralises it |
|---|---|
| No ad budget | Badges are distribution you don't pay for; the Index is PR you don't pitch cold. |
| No data at launch | Day-1 estimates come from public anecdotes (review-complaint threads, public launch write-ups) clearly labelled as *seed*; real cohorts accumulate from submissions. Be transparent when n<30. |
| No brand | The badge carries *their* brand, not yours — embeds are social proof, so you borrow trust. |
| No team | Every queue is a config file; alerts and index are cron + static templates. |
| No legal budget | No YMYL, no licensing, no PII beyond an email address, no copyrighted data ingested. |

---

## 7. What would make this fail (watch for these)

1. **Submission volume too low per queue** → cohorts never reach n≥30 and the answer is noise. *Mitigation: launch ONE queue, drive all traffic to it, pick a queue with obvious daily traffic.*
2. **Platform legal pressure** → unlikely (you collect user-reported experience, not proprietary data). *Mitigation: never imply affiliation; clear disclaimer; "not affiliated with Apple Inc."*
3. **Badge embeds don't happen** → distribution collapses and you're back to SEO. *Mitigation: make embedding one-click, and make the badge genuinely useful (live status), not decorative.*
4. **Sponsors won't pay pre-traffic** → you need real numbers before you DM. *Mitigation: the DM script in `PLAYBOOK.md` sells a specific slot with specific impressions, not a vague pitch.*

---

*Next: [STRATEGY.md](STRATEGY.md) — the honest numbers, and what the red team said would kill this.*
