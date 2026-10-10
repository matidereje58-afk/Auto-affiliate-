# THE NORMALIZATION ENGINE
### A $0 build with a credible path to **500k–1M views/month** — and the corrections that make the claim honest.

---

## The idea, in one paragraph

> **Take a free public dataset that everyone publishes as raw counts — and publish the number nobody publishes: the *normalized* one.**

Raw counts are biased by popularity. The version of these questions that exists on the internet today is therefore **wrong** — it tells you what is *popular*, not what is *bad*. Divide by the right exposure denominator and you get a number that **exists nowhere else**, which is simultaneously your content, your SEO survival strategy, your PR hook, and your moat.

**But there is one filter that kills most versions of this idea instantly — see §2.**

---

## The correction (read this first)

I built v1 of this play, then had it attacked by a hostile reviewer. **It died, and I was wrong by an order of magnitude.** That correction is the most valuable part of this repo, so it goes first:

| # | What v1 claimed | What was actually true |
|---|---|---|
| **1** | "Compute severity-adjusted complaints **per 1,000 vehicle-years**." | ☠️ **The denominator does not exist for free.** FHWA publishes registrations by **state × body type** — *not* make/model/year. That data is a $50k–500k/yr enterprise licence (S&P Global Mobility, Experian). **The auto vertical was never buildable.** |
| **2** | "10,000 pages ≈ 1.07M views/month." | 🔧 The model used a plain lognormal, which has **no mass at zero**. Real programmatic long-tail is **zero-inflated** — most pages are never indexed at all. Corrected: **1M views/mo needs ~18,500 pages at top-decile execution, ~59,000 at median, ~309,000 at bottom-decile.** |
| **3** | "$20–40 RPM." | 🔧 I conflated **advertiser CPC** with **publisher RPM**. Publisher RPM is **$6–12 entry / $15–25 mid / $20–35 top**. |
| **4** | "A unique number isn't 'scaled content.'" | 🔧 Wishful. The March-2024 policy applies *"regardless of how it's produced."* Google classifies the **rendered page shape**, not your methodology. |

**The method survived. The deployment did not.** Full autopsy: [`VOLUME-PLAY.md` §0](VOLUME-PLAY.md).

---

## §2 — The filter that matters: **the denominator must be free**

Every dataset publishes the **numerator** (the counts) and hides the **denominator** (the exposure). **The numerator is the press release; the denominator is the product.**

| Dataset | Denominator | Free? |
|---|---|---|
| NHTSA vehicle complaints | make/model/year registrations | ❌ **$50k–500k/yr licence** |
| CPSC recalls | units sold | ❌ commercial |
| **BTS aviation** | **departures, seats, passenger-miles** | ✅ **free** |
| **CMS hospitals** | **discharges, patient-days** | ✅ **free** |
| **NCES education** | **enrollment** | ✅ **free** |
| **FBI crime** | **population** | ✅ **free** |
| **FAA aircraft registry** | **aircraft by make/model** | ✅ **free** |

> **If the denominator is not free, the metric cannot be computed and the idea does not exist — no matter how clever it is.**

---

## §1 — The corrected path to 500k–1M views/month

```bash
node tools/traffic-model.mjs
```

```
  target              p10 (pages)      p50 (pages)      p90 (pages)
  100k views/mo            30,893            5,903            1,853
  500k views/mo           154,465           29,514            9,267
  1.00M views/mo          308,930           59,028           18,534
```

Nobody should build one 60,000-page site — that shape is exactly what gets classified as a farm. So:

> **You reach 500k–1M views/month as a PORTFOLIO of normalization sites, not as one site.** Six sites of 3,000–10,000 pages each, in six verticals, each with its own free denominator and its own brand: individually defensible, individually survivable, cumulatively 1M+/month, and near-zero marginal cost because it is **the same pipeline re-skinned**.

| Phase | Months | Build | Target |
|---|---|---|---|
| 1 | 0–6 | One vertical. 1 Index + 1 tool + 200–300 differentiated pages. | 5k–20k views/mo |
| 2 | 6–12 | Scale to 2,000–5,000 pages where the data supports it. | 50k–150k views/mo |
| 3 | 12–24 | Re-skin to verticals #2 and #3. | 200k–500k views/mo |
| 4 | 24–36 | Verticals #4–#6. | **500k–1M+ views/mo** |

---

## The three ingredients you gave me, used properly

| # | Ingredient | Naive use | **Strategic use** |
|---|---|---|---|
| 1 | **$0 capital** | "I'll do it manually until I can afford ads." | Zero capital forces **leverage over spend**: you can't buy traffic, so you *manufacture a metric nobody has* and let portability do the scaling. |
| 2 | **Ad clicks** | "AdSense on a blog, pray for pageviews." | Ads only work **at volume and at the right RPM** — and RPM is set by the vertical, not by traffic tactics. |
| 3 | **Own website** | "A blog." | The site is the **factory and the moat**: you own the pipeline, the metric, and the audience. A platform owns the audience and rents it back at whatever price it decides. |

## …and the smart ingredient

> **THE 4TH INGREDIENT — Normalization.**
>
> Free public data becomes a proprietary metric the moment you divide it by the right denominator. It is **free to compute, impossible to copy without doing the work, produces a number that exists nowhere else, and frequently inverts what everyone believes.**
>
> One trick, four jobs: **content strategy, SEO survival strategy, PR strategy, and moat.**

---

## Read this repo in order

| File | What it is |
|---|---|
| **[VOLUME-PLAY.md](VOLUME-PLAY.md)** | ⭐ **The main document.** The correction, the free-denominator filter, corrected traffic math, vertical scoring, the two survival rules, the portfolio path to 1M, corrected economics, hard kill criteria. |
| **[tools/traffic-model.mjs](tools/traffic-model.mjs)** | The **corrected** zero-inflated model: published → indexed → ranking → views. |
| **[IDEA.md](IDEA.md)** | The **retention layer** — the Queue Engine (check → forecast → live badge). Converts anonymous search traffic into an audience you own. |
| **[STRATEGY.md](STRATEGY.md)** | Constraint physics, p10/p50/p90 unit economics, the first red-team autopsy, the legal risk register. |
| **[PLAYBOOK.md](PLAYBOOK.md)** | Day 0 → Day 90 execution: the $0 stack, launch copy, the sponsor DM script. |
| **[tools/gen-pages.mjs](tools/gen-pages.mjs)** | A working normalization engine — **mechanism demo only**; its denominator is not free. |
| **[prototype/](prototype/)** | Working prototype of the retention layer (live badge + cohort forecast). |

---

## The honest verdict

**500k–1M views/month is reachable — as a 24–36 month portfolio build, at top-decile execution.** The corrected economics:

| | p10 | p50 | p90 |
|---|---|---|---|
| Views/month at month 24 | ~10k | ~180k | ~1.09M |
| Monthly revenue | ~$60 | ~$4,200 | ~$46,700 |
| Cumulative 24-month revenue | $4,000 | $27,000 | $180,000 |
| **Effective $/hour** | **$3** | **$18** | **$113** |

**The expected value is carried almost entirely by the p90 tail.** If you are not prepared to be in that column, don't start — and if you do, honour gate **G3** in `VOLUME-PLAY.md` §8: *3,000 sessions/month or 30% indexed by month 9, or re-skin the vertical.*

---

*Built on branch `cline/anyxxqjr`. Every number is labelled measured, modelled, or assumed — and the ones that were wrong are documented rather than deleted.*

