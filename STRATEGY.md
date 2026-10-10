# STRATEGY.md — The Honest Analysis

Every number below is labelled **[M] measured**, **[MOD] modelled**, or **[A] assumed**. If you can't tell which, I've failed.

---

## Part 1 — The physics of your constraints

Before choosing an idea, you must accept what your three ingredients actually imply. Most people skip this and build something that cannot work.

### 1.1 Revenue decomposes into four multipliers

```
Revenue = Traffic × Intent Value × Capture Rate × Repeat Factor
```

At $0 capital you control exactly one of these directly. So:

| Multiplier | Who controls it at $0 | What you must do instead |
|---|---|---|
| **Traffic** | You can't buy it. Platforms rent it. | Manufacture it: badges, contributors, journalists. **Never rent your only channel.** |
| **Intent Value** | You choose it — this is free. | Pick the vertical where a visitor is worth $15–40 RPM, not $3. Choose B2B anxiety over consumer anxiety. |
| **Capture Rate** | You choose it — this is free. | Don't let visitors leave anonymous. The email is the asset. |
| **Repeat Factor** | You choose it — this is free. | Pick something people **check daily**. A queue is checked daily. An article is read once. |

**Three of the four multipliers are free to optimise.** That is the entire reason this idea works at $0, and the reason a blog does not.

### 1.2 The arithmetic that kills the default plan (blog + AdSense)

**[MOD]** Consumer-information site, tier-1 traffic, 70% mobile, AdSense:

- Session RPM: **$3–9** (legal/anxiety content)
- To earn **$100/month** you need **~18,000 sessions/month**
- A brand-new domain in a competitive space typically needs **3–9 months** to rank for anything commercial
- Median time from writing 30 articles to $100/month: **5–8 months**

Meanwhile the same effort in a **B2B vertical** with cohort data:

- Session RPM: **$15–40** (dev tooling, SaaS, cloud, fintech advertisers)
- Repeat visits: **3–8×/month** per user (they are watching a queue)
- The same $100 needs **~4,000 sessions/month**

**You are fighting over a 4–8× multiplier before writing a single line of code. That choice is free. Most people never make it consciously.**

### 1.3 The uncomfortable truth about ads

**[MOD]** Direct sponsorship on a subscribed list, B2B dev audience: **$25–60 CPM on opens.**
Display ads, same person, same session: **$15–40 RPM.**

Sponsorship isn't better because it's fancier. It's better because:

1. **No intermediary** — you keep 100% instead of the network's cut.
2. **Paid in advance** — no threshold, no approval, no 60-day payout hold.
3. **It works on day 3**, when you have 200 subscribers and no ad network will look at you.
4. **It renews** — a sponsor who sees results books the next month.

> **Ads are the floor under a business that already exists. They are not the business.**
> Build for the list and the sponsor; let ads be the backstop. This reordering is worth more than any traffic tactic in this document.

---

## Part 2 — The red team, and why v1 died

I designed a first version, then had it attacked by an adversarial reviewer *before* committing to it. **V1 was a US-immigration queue tracker** (USCIS processing times, Visa Bulletin). It looked attractive: massive audience, desperate users, free public data, huge lawyer CPCs. It died. Here is the autopsy — the most useful part of this document, because it shows the pattern of reasoning.

| # | Fatal flaw in v1 | The mechanism / citation |
|---|---|---|
| **F1** | **Your only free distribution is rented from people who ban you.** | r/USCIS moderators enforce Reddit's self-promotion rules; tool links are removed within minutes without 6–12 months of in-sub karma. Show HN is only relevant to HN's own topics; a consumer immigration tracker dies at <5 points. Facebook groups gate and ban external links. |
| **F2** | **Unit economics fail at the median.** | Immigration traffic is ~70% mobile, consumer, anonymous → **$3–9** session RPM. p50 outcome ≈ **$2,800 over 6 months** for 600–1,200 hours = **$2.30–4.70/hour.** |
| **F3** | **The "moat" is legally a public good.** | US government works are uncopyrightable (**17 U.S.C. §105**); facts aren't copyrightable (**Feist v. Rural Telephone, 1991**). VisaJourney, Boundless, Nolo — or a bored lawyer with a spreadsheet — copies your dataset in an afternoon. Monthly publications = **12–24 data points/year**, not a compounding asset. |
| **F4** | **The core product isn't buildable as described.** | USCIS case-status lookups sit behind **reCAPTCHA** — you cannot programmatically answer "where am I in the line?" The official Case Status API returns a *status string*, not a queue position, is rate-limited, and is intermittently down. The premium promise ("when will it move?") is unknowable: Visa Bulletin retrogression has moved dates *backwards* by 1–3 years. You would be selling errors that cause churn. |
| **F5** | **Day-1 revenue is arithmetically $0.** | AdSense review 1–14 days, routinely rejected for "low value content" (2–3 attempts common). Legal affiliate networks impose 30–90-day payout holds. Stripe applies rolling reserves. Day-1 sessions ≈ 0 because nothing is indexed. |

Read F1–F5 again, because they are **generic** — they will destroy almost any "$0 + ads + website" plan you invent. Every design decision in `IDEA.md` exists to neutralise one of them:

| Flaw | The fix in the shipped design |
|---|---|
| F1 — rented distribution that bans you | **Developer audiences tolerate tools.** Show HN legitimately rewards working tools; dev subreddits ban *self-promo posts*, not *utilities*. And the **badge** moves distribution onto thousands of third-party sites you need no permission to occupy. |
| F2 — consumer-grade RPM | **B2B advertisers.** Dev tooling / ASO / CI-CD / cloud pay $5–25 CPC. A tier-1, desktop-heavy audience earns **3–5×** mobile consumer RPM. |
| F3 — public data isn't a moat | **The data is contributed, not copied.** User-submitted cohorts are your proprietary asset with network effects — legally yours, impossible for a competitor to bootstrap. |
| F4 — unbuildable core | **No scraping, no CAPTCHA, no official API.** The product's own intake form *is* the collection device. And we never promise to predict a platform's decision — we report a **distribution of user-reported outcomes** with explicit sample sizes and confidence intervals. |
| F5 — $0 on day 1 | **Sponsorship rail.** A B2B SaaS pays $150–400 up front on day 2–5 for a named slot. No network, no approval, no threshold, 100% margin. |

> **The transferable lesson:** if your plan's only distribution is a platform that can ban you, and its only monetisation is a network that must approve you, you do not have a business — you have a *permission slip you haven't been granted yet*. The design above removes both permission gates.

---

## Part 3 — Unit economics (p10 / p50 / p90)

### 3.1 Stated assumptions

**[A] Operator:** solo, competent, 15–20 hrs/week, can ship a working static site + a serverless function.
**[A] Launch:** Show HN + 3 dev subreddits (r/iOSProgramming, r/androiddev, r/SideProject) + Product Hunt + 2 free dev-newsletter listings. One queue only.
**[A] Traffic decay:** a launch spike decays ~85% within 72h. Anything after that must come from embeds, search, or community return visits.
**[A] Funnel:** 100 visitors → 15 email captures [MOD, conservative for a tool with a gated result] → 3 badge embeds [MOD] → ~0.6 returning weekly.
**[MOD] Revenue rates:** display $15–40 RPM (blend **$20** at scale, **$8** early while the publisher tier is poor); sponsor **$250–400/mo** per slot; affiliate **$0.10–0.60** per check; Pro **$9/mo**, 0.5–2% of list.

**Hours are the hidden cost.** The p50 case below is ~500 hours over 6 months. Judge every number against that.

### 3.2 The table

| Horizon | p10 (it stalls) | p50 (it works, modestly) | p90 (it lands) |
|---|---|---|---|
| **Day 7** — cumulative revenue | **$0–20** (HN misses; 400 sessions) | **~$230** (4k sessions; 1 sponsor @ $200; affiliate $30) | **~$800** (25k sessions; sponsor $400; ads just approved $150; affiliate $250) |
| **Day 30** — monthly revenue | **~$25** (2k sessions, no sponsor) | **~$475** (10k sessions; ads $150; sponsor $200; affiliate $80; 5 Pro @ $9) | **~$3,800** (90k sessions; ads $1,800; sponsor $400; affiliate $700; 45 Pro; index sponsor $500) |
| **Day 90** — monthly run rate | **~$60** (6k sessions) | **~$1,670** (40k sessions; ads $800; sponsor $250; affiliate $350; 30 Pro) | **~$12,700** (300k sessions; ads $6,600; sponsor $500; affiliate $2,400; 250 Pro; index $1,000) |
| **Month 6** — run rate | **~$150** | **~$4,300** (90k sessions; ads $1,800; sponsor $400; affiliate $900; 80 Pro; index $500) | **~$32,800** (700k sessions; ads $17,500; affiliate $5,000; 800 Pro; sponsor $600; index $2,000; 2 data-API customers) |

### 3.3 How to read this honestly

- **p10 means "this didn't work."** You spent ~500 hours for ~$600 cumulative. This is the *most likely single outcome* for a random person, and it happens because the launch missed (no HN front page, subreddit removal, badge adoption at 0.3% instead of 3%).
- **p50 is a real but unexciting side income**: ~$4,300/month by month 6, ~$10–13k cumulative, ≈ **$25/hr** effective. Better than the v1 immigration plan's $2.30–4.70/hr, and it is *durable* — the data moat keeps paying after you stop writing.
- **p90 is a genuine business.** ~$33k/month run rate at month 6 is a top-decile outcome, not the plan. Design for p90; *budget* for p10.
- **The distribution of outcomes is dominated by one variable: whether badge embeds reach ~1% of visitors.** With 1% embed rate, p50 behaves like p75. With 0.1%, p50 behaves like p10. **Instrument this metric on day one** — it is the single highest-leverage number in the model.

### 3.4 The Day-1 number, stated plainly

**Day-1 ad revenue: $0.** Not "low" — zero, because no ad network has approved you and nothing is indexed. Anyone telling you otherwise is selling something.

**Day-1–3 first dollar:** the founding sponsor, at **$150–400**, paid up front. That is the only honest fast-money rail in the design, and it is an **ad sale** — just sold directly instead of through a network. `PLAYBOOK.md` has the exact script.

---

## Part 4 — The moat, examined

A moat is something a well-funded competitor cannot buy. Let's audit the four candidate moats honestly:

| Candidate moat | Can a funded competitor buy it? | Verdict |
|---|---|---|
| **The code** | Yes. A weekend of a good engineer's time. | ❌ Not a moat |
| **The dataset** | **No.** It is a *time series of human experience*. You cannot buy 3 years of cohort history — you can only wait 3 years, or buy you, which is the point. | ✅ **Primary moat** |
| **Badge embeds** | **No.** Each embed is a relationship with a user who chose you. 5,000 live embeds = 5,000 permanent referral nodes no ad budget can replicate. | ✅ **Distribution moat** |
| **The brand on the Index** | Partially. Press cites the *first* source. Being the citable authority is a 12-month head start that compounds. | 🟨 Secondary moat |

**The honest weakness:** the moat takes ~6 months to set. In months 1–2 a funded competitor could clone you trivially. Your defence in that window is speed and the fact that nobody else cares yet — which is exactly why you should launch *narrow* and *loud* rather than broad and quiet.

**Also honest:** the moat is only real if the data is *cohort-segmented*. A single global average is commodity. `median for a first-time iOS submission from a US account in the week of Aug 12` is not — that requires sample density and segmentation discipline, and it is what makes the answer defensible.

---

## Part 5 — Risk register

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| **Google "scaled content abuse" / "site reputation abuse" penalty** (Mar 2024 policies target thin programmatic pages) | High | Medium | Do **not** mass-generate thin pages. Ship **one tool + one index + ~10 genuinely useful explainer pages**. Unique user-contributed data is the opposite of "scaled content." |
| **AdSense rejection for "low value content"** | Medium | High (1st attempt often fails) | Apply only once you have 8–12 substantive pages and real traffic. Have Ezoic as a no-minimum fallback. Never make ads a dependency for month 1–2. |
| **Trademark / implied affiliation with Apple or Google** | High | Low | No platform name in the domain. Nominative use in text only. Persistent footer: *"Not affiliated with Apple Inc. or Google LLC. All data is user-reported."* |
| **Scraping ToS violations** (Reddit's API terms; Apple's ToS) | High | Low if disciplined | **No automated scraping.** Seed data read manually from public discussions, clearly labelled as anecdote. All live data is user-submitted. This also keeps the moat proprietary. |
| **Fabricated/defamatory claims about platform behaviour** | Medium | Low | Never assert intent ("Apple is deliberately slow"). Report only *user-reported distributions* with n, and show confidence intervals. Never show a median below n=30. |
| **CAN-SPAM / GDPR / CCPA on alert emails** | Medium | Medium | Explicit consent checkbox (unchecked by default), one-click unsubscribe in every email, honest subject lines, postal address in footer, data minimisation (email only, no receipts/PII). |
| **FTC affiliate disclosure** | Low | Certain | Visible disclosure on every page carrying affiliate links (16 CFR Part 255). |
| **Low sample density per cohort** | High | High early | Launch one queue; show "insufficient data (n<30)" honestly until you have it. Trust earned by *not* faking precision. |
| **Founder burnout at 500 hours for p10 money** | High | Medium | Hard decision gates (Part 7). Timebox. The engine is portable, so a failed vertical is *data*, not a loss. |
| **Tax / bookkeeping** | Low | Certain | Track every dollar from dollar one; income is taxable; keep a simple ledger. |

**Business-killers:** the Google scaled-content penalty, and trademark abuse. Everything else is a manageable cost or a fixable process.

---

## Part 6 — Vertical selection (the same engine, ranked)

Scores 1–5. *Ad value* = blended session RPM/EPC for that audience. *WTP* = willingness to pay for alerts. *Legal* = 5 means no YMYL, no licensing regime. *Dist* = how fast free distribution works (link-tolerant communities, tool-friendly culture).

| # | Vertical | Ad $/session | WTP | Legal | Free dist. | **Total** | Notes |
|---|---|---|---|---|---|---|---|
| **1** | **App-store & dev-platform review queues** (Apple, Play, Meta, notarization, quota increases, enterprise API access) | **5** ($15–40 RPM; ASO, CI/CD, cloud, attribution) | 4 (devs already pay $50–500/mo) | **5** | **5** (Show HN rewards tools; dev subs ban posts, not utilities) | **19** | **LAUNCH HERE.** Precedent exists (appreviewtimes.com) → demand validated, differentiation available (cohort segmentation + alerts + badge). Data refreshes daily. Zero YMYL. |
| **2** | **Professional licensure & certification queues** (RN/NCLEX, teacher cert, PE, bar admissions, CPA) | 4 ($20–60 CPM; education + recruiting) | 4 (a job start depends on it) | 5 | 3 (cohort FB groups are link-tolerant but admin-gated) | 16 | Strong second vertical. Deadline-driven (credentials have start dates). Fragmented by state = moat by grind. |
| **3** | **Payment-platform underwriting & payout holds** (Stripe, PayPal, Shopify Payments) | 5 (fintech, chargeback, e-com SaaS) | 5 (money is literally frozen) | 3 (financially sensitive) | 3 | 16 | Highest pain-per-visitor of any option. Legal sensitivity and platform-hostility risk keep it at #2 priority, not #1. |
| **4** | **Passport / Global Entry / trust-traveller appointment queues** | 3 ($8–14 travel) | 4 | 5 | 3 | 15 | Nice, but seasonal and dominated by existing paid sniping tools. |
| **5** | **Municipal permit / inspection queues** (contractor & solar expediters) | 5 ($30–70 CPM) | 4 ($49–199/mo tools are normal) | 4 (municipal ToS) | 2 (trade FB groups gatekeep hard) | 15 | Rich B2B buyer, but distribution is the hardest of the five. Better as vertical #3 or #4. |

**Choice: #1, launch on app-store / dev-platform review queues.**
Justification, in numbers: advertisers are B2B SaaS bidding **$5–25 CPC** — **4–10× immigration's consumer RPM**; the audience's home turf (dev subreddits, Show HN) is the one place on the internet where **a working tool earns links instead of bans** (HN front page ≈ 20–30k sessions, 30–60% US desktop, which roughly triples RPM versus mobile consumer traffic); there is **zero YMYL, zero licensing, zero regulatory exposure, and no PII**; and the data is **crowd-submitted, so it is legally yours** — the moat that the v1 plan could never have.

---

## Part 7 — What would have to be true, and when to quit

### 7.1 The minimal conditions for this to work

If all five hold, the p50 outcome is in play. If any two fail, it is p10.

1. **≥30 submissions per launch queue within 45 days.**
2. **≥1% of visitors embed a badge** (≈100 live embeds by day 30). *This is the load-bearing metric.*
3. **≥1 sponsor pays ≥$150 before traffic proof exists.**
4. **≥1 press or newsletter citation of the Index by day 60.**
5. **≥30% of traffic is organic (non-launch) by day 60.**

### 7.2 Decision gates — hard, pre-committed, non-negotiable

Write these down before you start. The purpose of a gate is to stop you from rationalising a loss into a grind.

| Gate | Date | Measure | If it fails |
|---|---|---|---|
| **G1** | Day 14 | ≥300 submissions | The *funnel* is broken, not the market. Fix intake (form friction, gating, mobile). Do **not** pivot verticals yet. |
| **G2** | Day 30 | ≥1 sponsor has paid ≥$100 | Your monetisation assumption is wrong for this audience. Switch to affiliate-first and re-test at G3. |
| **G3** | Day 45 | ≥50 live badge embeds | **The distribution engine is failing.** This is the most serious signal. Either the badge isn't useful enough, or the audience isn't who you thought. |
| **G4** | Day 75 | Organic ≥20% of total sessions | SEO/AEO is not working. Fix indexability, page depth, and the explainer set. |
| **G5** | Day 90 | ≥$500/month run rate | **Shelve the vertical. Keep the engine.** Re-skin to #2 with everything you learned. This is a cheap, fast, *designed* failure — which is the whole reason the engine is portable. |

> **G5 is not a defeat.** A blog author who fails at vertical #1 starts from zero at #2. You start at 80% — same code, same badge system, same ad stack, same playbook. **Portability converts failure from a loss into a cost of learning.**

### 7.3 The strategic summary, in one paragraph

You cannot outspend anyone for attention, so stop trying to buy it. **Manufacture the reason for attention** (a queue people already obsess over daily), **own the measurement of it** (contributed data nobody can buy), **make the distribution part of the product** (badges on other people's sites), **rank your monetisation from most direct to most passive** (sponsor → list → alerts → affiliate → ads), and **pick a vertical where advertisers pay 5× what they pay elsewhere**. Every one of those four levers is free to pull. That is how a $0 operator beats a funded one: not by working harder, but by choosing a shape of business where the expensive advantages don't matter.




