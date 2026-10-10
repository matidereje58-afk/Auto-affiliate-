# FEELEAK — The Crowdsourced Junk Fee Index

**One line:** A free tool that reads your bill and tells you exactly how badly you're being
overcharged — then publishes an *anonymized* version of that result as a permanent public page,
so every single user you ever get permanently recruits more users for you.

**The three ingredients, assembled:**
1. **Tool** — a "Bill Autopsy" engine (not a calculator) that turns a photo of a bill into a
   dollar figure, a verdict, and a ready-to-send fight-back script.
2. **Ads** — display ads served at *the anxiety moment* (the second someone discovers they are
   overpaying), which is the highest-intent ad impression that exists in consumer finance.
3. **Architecture** — a four-loop traffic engine that converts the product's own exhaust into
   search traffic, press, and distribution.

---

## 1. The market autopsy (why the obvious version of this already failed)

I checked what already exists before committing. Here is what I found:

| Player | What they do | The hole they left |
|---|---|---|
| **GetScrewedScore** (screwedscore.com) | Upload a bill → AI flags overcharges → `SCREWED / MAYBE / SAFE`. "Wall of Shame," vendor registry. | **Every result is private** (a UUID link only you can see). No public pages → no search traffic, no compounding, no viral loop. Monetized by $6.99/mo subscription, not ads. |
| **TrueTotal** (truetotalcalculator.com) | "The Hidden-Fee Index" — +49% average hidden cost across 38 categories. | **Explicitly refuses to name a single business**: *"It reports on categories and fee types, never a single business."* And the data is *"illustrative sample figures"* computed from their own models — not real user data. |
| **DetectHiddenFees** | "Hidden Fee Database" | **25 records.** A content farm, not a utility. |
| **FeeInsight** | Bank Fee Index | B2B, sold to banks. Not consumer-facing. |
| **Rocket Money / Trim / BillFixers** | Humans negotiate your bills | A paid service, not a free index. They *want* the fee opacity to continue; it is their sales pitch. |

### The two decisive observations

**Observation A — the incumbent made the result private, and that killed its growth engine.**
GetScrewedScore's privacy-first default is good ethics and terrible strategy. Wordle's entire
growth was one shareable artifact. GetScrewedScore produces a result people would *love* to
screenshot, then hides it behind a UUID. **Inverting that single default is the whole business.**

**Observation B — the index incumbent refuses to name companies, and that is exactly where all
the traffic is.** TrueTotal publicly promises never to name a business. That sounds noble; it
also means they cannot rank for `Xfinity junk fees`, `is Comcast ripping me off`,
`T-Mobile hidden charges` — the highest-intent, highest-commercial-value queries in the entire
category. **They left the money on the table on purpose.**

### Why the gap is open (the real reason, and the real moat)

The gap is not open because nobody thought of it. It is open because **naming companies is
scary** — defamation, trade libel, and a demand letter from a telco legal department. TrueTotal
avoided it by design. GetScrewedScore avoided it by keeping everything private.

**So the moat is not technology. The technology is a weekend of work.** The moat is being
*willing to do the legally-careful version that everyone else was too afraid to do.* And it is
genuinely defensible, because the correct construction is simple:

- You publish **user-submitted facts** (what the bill actually said), not your opinion.
- You publish **the company's own published rate card** next to it (FCC Broadband Consumer
  Labels are legally mandated and public — see §6).
- You **never assert a fee is illegal.** You report what it is and what it costs.
- You enforce a **minimum sample size** (N ≥ 10 reports) before any company page goes live.
- You give the company a **right of reply** on its own page.

That is a facts-and-figures publication, not a hit piece. It is the same posture as a consumer
reporter's — and consumer reporters do not get sued successfully for accurate aggregation.

---

## 2. The structural insight (the asymmetry you are exploiting)

> **The ad industry pays the most money for the exact moment a person discovers they have been
> cheated. Almost nobody builds a product that deliberately manufactures that moment.**

Insurance and finance keywords carry $14–$45 RPM (2026 benchmarks, US traffic) precisely because
those searchers are *about to spend money*. But the searcher has to be *told* they have a problem
first.

FeeLeak is a **problem-manufacturing machine**. It takes a passive person ("I pay my internet
bill") and, in twenty seconds, converts them into an activated person ("I am losing $412 a year
and I want to switch, dispute, or reclaim it"). That activated person is then shown an ad for
exactly the remedy. **That is the single most valuable ad impression in consumer finance, and you
get to generate it on demand.**

Everyone else optimises the *ad*. You optimise the *moment before the ad*.

## 3. The product — "Bill Autopsy"

Not a calculator. A calculator takes numbers you already have and does arithmetic you could do
yourself. **Bill Autopsy takes a document you cannot read and returns a decision you could not
have made.**

**Input:** a photo, PDF, or pasted text of any recurring bill — internet, phone, cable, insurance,
energy, bank statement, lease.

**Output (the report card):**

```
+----------------------------------------------+
|  YOUR BILL AUTOPSY            Xfinity        |
|                                              |
|  $412 / year in junk fees                    |
|  ----------------------------------------    |
|  You are in the worst 8% of Xfinity          |
|  customers (1,847 reports)                   |
|                                              |
|  ## Regulatory Cost Recovery Fee   $94/yr    |
|  ## Network Enhancement Fee        $72/yr    |
|  ## Broadcast TV Fee              $180/yr    |
|  ## Device Protection (unused)     $66/yr    |
|                                              |
|  -> 3 of these are negotiable                |
|  -> 1 looks like a duplicate                 |
+----------------------------------------------+
```

Plus, below the card: the **fight-back script** — a word-for-word cancellation/negotiation email,
the exact sentence that removes each fee, and the escalation path. This is what converts a
curiosity into a share.

**The mechanic that makes it spread:** the **percentile**. "You are in the worst 8% of Xfinity
customers" is (a) emotionally irresistible, (b) screenshot-ready, and (c) *only possible if you
own the aggregate data*. It is simultaneously the viral unit and the moat.

---

## 4. The four-loop traffic architecture (the "smart ingredient")

This is the part that answers "how do I get ultra-high visitors from Day 1". No single loop does
it. Four loops stacked do, because they start at different times and compound into each other.

### Loop 1 — The Share Loop (fires on Day 1)
`User scans bill -> gets card -> posts card to Reddit/TikTok/friends -> new users scan`

The card is designed to be posted. It has a number, a verdict, and a percentile. It is an
injustice with a receipt. **This is the only loop that produces traffic on Day 1, and it is the
one GetScrewedScore deliberately disabled.**

### Loop 2 — The SEO Loop (fires from Week 1, compounds forever)
`User scans bill -> anonymised data point -> company page updated -> page ranks -> new users`

Every scan silently mints a page that did not exist before. Ten thousand scans a month is ten
thousand pieces of evidence attached to pages targeting `[company] junk fees`,
`[company] hidden charges`, `is [company] ripping me off`, `[company] bill too high`. **The product's exhaust is the content strategy. Zero marginal content cost.**

Critically, these pages are **not thin content**, because each one carries a live percentile, a
fee breakdown, a report count, and the company's own published rate card. That is unique,
data-backed content — the thing Google actually rewards.

### Loop 3 — The Press Loop (fires from Month 1)
`Index data -> auto-generated monthly "Junk Fee Report" -> journalists cite it -> backlinks`

Journalists *need* a citable number and *need* someone to name names. You are the only source
that will. "The worst offender in our index this month was X, at $Y per customer" is a story that
writes itself, and each citation is a high-authority backlink that makes Loop 2 rank faster.
This is why refusing to name companies (TrueTotal's choice) is strategically fatal.

### Loop 4 — The Embed Loop (fires from Month 1, permanent)
`Free widget -> bloggers / credit unions / local news / subreddit wikis embed it -> referral traffic`

A one-line `<iframe>` "Am I overpaying?" widget with a "powered by" link. Every embed is a
permanent, zero-cost traffic faucet and a backlink. This is how a tool site escapes the
feast-or-famine of social traffic.

### Why the loops reinforce each other
Loop 1 gives you the initial data. Loop 2 converts that data into an asset that earns traffic
while you sleep. Loop 3 accelerates Loop 2. Loop 4 is a permanent base load. **A social spike is
a one-time event; this architecture converts the spike into a compounding machine.**

---

## 5. The five "smart ingredients" (the non-obvious decisions)

**Ingredient 1 — Make the private thing public by default.**
Every other player defaults to private. Public-by-default is the entire growth engine. Mitigate
privacy properly: strip all PII, show only the provider, the fee types and the totals, and let the
user choose their display name or stay anonymous. Privacy is a *setting*, not an architecture.

**Ingredient 2 — Publish the company name.**
The incumbent wrote a public promise never to do this. That promise is your entire SEO moat.
Do it with discipline (minimum sample size, right of reply, facts only) — the discipline is what
makes it survivable.

**Ingredient 3 — Rule engine first, AI second. Make COGS zero.**
A curated library of ~150 real junk-fee patterns (`Regulatory Cost Recovery Fee`,
`Broadcast TV Fee`, `Regional Sports Fee`, `Administrative Fee`, `Convenience Fee`,
`Device Protection`, `Network Enhancement Fee`...) classifies the majority of bills with **no API
call at all**. AI is the *enhancement tier*, not the engine. This means the free tool is genuinely
free to run — you are not paying $0.01 per scan to earn $0.015 in ads. Most AI tool sites die
right here; this design makes unit economics positive from the very first scan.

**Ingredient 4 — Bootstrap the index from public data before you have users.**
This kills the cold-start problem. Under FCC rules (effective April 2024, tightened October 2025)
**every US internet provider must publish a machine-readable "Broadband Consumer Label"** showing
the all-in price including fees. That is thousands of real, citable, authoritative pages you can
generate **on Day 1, with zero users**, so that when Loop 1 delivers your first visitors, Loop 2 is
already standing. *(The shipped seed dataset in `data/companies.json` is clearly labelled
illustrative sample data — see section 9.)*

**Ingredient 5 — The Data Dividend.**
Users who contribute a bill unlock ad-free reports or a Pro feature, for free. This converts your
audience into a paid data workforce at zero cost, and it makes contribution feel like a fair trade
rather than surveillance.

<!--NEXT-->
