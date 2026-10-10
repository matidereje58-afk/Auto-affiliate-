# VOLUME-PLAY.md
## The idea that can clear 500k–1M views/month — and the corrections that got it there

---

## 0. What changed, and why you should trust the rest of this document more because of it

I built a first version of this play and had it attacked by a hostile reviewer. **It died on two counts, and one was fatal.** I lead with that because a strategy document that has never been falsified is a sales pitch, not a strategy.

| # | What I claimed | What was wrong | Status |
|---|---|---|---|
| **1** | "Compute severity-adjusted complaints **per 1,000 vehicle-years** on the road." | **The denominator does not exist for free.** FHWA Highway Statistics publishes registrations by **state × body type** (MV-1: auto / bus / truck / motorcycle). It does **not** publish make/model/year counts. That data is an enterprise licence — S&P Global Mobility (Polk), Experian Automotive, J.D. Power. No free tier, no API, no workaround. | ☠️ **FATAL — auto vertical killed** |
| **2** | "5,000 pages ≈ 531k views/month; 10,000 ≈ 1.07M." | The model used a **plain lognormal** with median 40 views/page. A plain lognormal has **no mass at zero** — it silently assumed the worst half of a 10,000-page inventory still averages ~17 views/month. Real programmatic long-tail on a new domain is **zero-inflated**: most pages are never selected for the index at all. | 🔧 **Fixed — see §1** |
| **3** | "A number that exists nowhere else is not 'scaled content.'" | Wishful. Google's March-2024 policy says *"regardless of how it's produced."* The classifier reads the **rendered page shape**, not your methodology. | 🔧 **Fixed — see §6** |
| **4** | "$20–40 RPM in this vertical." | I conflated **advertiser CPC** with **publisher RPM**. $20–40 is what an insurer pays per *click*. Publisher RPM is roughly **$6–12 entry / $15–25 mid / $20–35 top tier**. | 🔧 **Fixed — see §8** |
| **5** | "Reporting the government's own records — low legal risk." | Publishing a **severity-weighted ranking of named manufacturers** built from **unverified self-reported complaints** is trade-libel exposure. NHTSA's own disclaimer: complaints are unverified allegations. Truth is a defence; defending it costs $50k+. | 🔧 **Fixed — see §4** |

**Corrections 1 and 2 together mean my first answer was ~10–20× optimistic on traffic, in a vertical that could not be built at all.** Everything below is the corrected version. The *method* survived; the *deployment* did not.

---

## 1. The corrected answer to "500k–1M views/month"

Run it yourself: `node tools/traffic-model.mjs`

The corrected model has **three gates** a page must pass before it earns a single view — and the honest uncertainty lives in gates 1 and 2, not in optimism about gate 3:

```
published  ->  indexed  ->  ranking  ->  views
```

| Scenario | Indexed | Of indexed, % ranking | Views/page (ranking) | RPM |
|---|---|---|---|---|
| **p10** demoted / ignored | 30% | 12% | median 25 | $6 |
| **p50** indexed, half-ranking | 55% | 25% | median 40 | $15 |
| **p90** clean index, ranks well | 75% | 45% | median 60 | $28 |

**How many pages you actually need:**

```
  target              p10 (pages)      p50 (pages)      p90 (pages)
  100k views/mo            30,893            5,903            1,853
  250k views/mo            77,233           14,757            4,633
  500k views/mo           154,465           29,514            9,267
  1.00M views/mo          308,930           59,028           18,534
```

**Read that slowly, because it is the whole correction:**

> **1M views/month needs ~18,500 pages at top-decile execution, ~59,000 at median execution, and ~309,000 at bottom-decile.** My first answer said 10,000. It was wrong by an order of magnitude.

And the revenue, corrected:

```
  10,000 pages, p90:    529k views/mo  ->  $14,812 display + $7,935 affiliate  =  $22,747/mo
  20,000 pages, p90:   1.09M views/mo  ->  $30,428 display + $16,300 affiliate =  $46,728/mo
  10,000 pages, p50:    183k views/mo  ->                              $4,210/mo
  10,000 pages, p10:     40k views/mo  ->                                $397/mo
```

**The honest verdict on your requirement:** 500k–1M views/month is **reachable, but only as a 24–36 month build at 18,500–59,000 pages, and only with top-decile execution.** It is not a side hustle. The same effort at p50 yields ~180k views and ~$4,200/month — a good outcome, and the case you should *plan* for while designing for p90.

---

## 2. The filter that actually matters: **the denominator must be free**

This is the single most valuable thing the red team produced, and it generalises far beyond cars.

Every "normalize public data" idea lives or dies on one question:

> **Is the exposure denominator — the thing you divide by — freely obtainable?**

Almost every dataset publishes the numerator (the counts) and hides the denominator (the exposure). **The numerator is the press release; the denominator is the product.**

| Dataset | Numerator (free) | Denominator | Free? |
|---|---|---|---|
| NHTSA vehicle complaints | ✅ complaints by make/model/year | make/model/year registrations | ❌ **S&P Global / Experian, $50k–500k/yr** |
| CPSC recalls | ✅ recalls | units sold | ❌ commercial |
| CMS hospital data | ✅ complications | ✅ **discharges, patient-days** | ✅ **free** |
| BTS aviation | ✅ delays, mishandled bags | ✅ **departures, seats, passenger-miles** | ✅ **free** |
| NCES education | ✅ test scores | ✅ **enrollment** | ✅ **free** |
| FBI crime data | ✅ offences | ✅ **population** | ✅ **free** |
| SEC / EDGAR | ✅ filings | ✅ **shares outstanding** | ✅ **free** |
| City 311 / code enforcement | ✅ violations | ✅ **parcels, lane-miles** | 🟨 varies by city |
| FAA aircraft registry | ✅ registrations | ✅ **aircraft by make/model** | ✅ **free** |

> **Rule: if the denominator is not free, the metric cannot be computed and the idea does not exist — no matter how clever it is.** My auto play violated this rule, so it was never a business. Test every idea against this table *before* writing code.

---

## 3. Vertical selection, corrected

Scored on the filters that actually decide the outcome.

| Vertical | Free denominator? | Metric novel? | Winnable vs incumbents? | Publisher RPM | Legal risk | **Verdict** |
|---|---|---|---|---|---|---|
| **Aviation ops** (BTS T-100 + On-Time + ATCR) | ✅ **yes** | Airport-level yes; **carrier × route × equipment-type cuts are enterprise-paywalled** (Cirium/OAG/FlightStats) | ✅ **strong** — nobody posts "AA1234 A321 on-time rate" | $12–20 display, **+ travel credit-card affiliate $50–200/approval** | ✅ **low** — DOT already ranks carriers publicly | ⭐ **BUILD THIS** |
| **Education** (NCES CCD) | ✅ yes | partly | ❌ GreatSchools / Niche / US News / SchoolDigger entrenched | $25–50 (real-estate) | 🟨 named schools, parent complaints | high volume, hard to win |
| **Hospitals** (CMS) | ✅ yes | partly (Care Compare exists) | 🟨 | $20–40 | ❌ **high** — named institutions, YMYL, defamation | good money, bad risk |
| **Cities / neighbourhoods** (Census, FBI) | ✅ yes | partly | ❌ NeighborhoodScout / AreaVibes / Niche | $15–30 | 🟨 | crowded |
| **SEC / EDGAR** | ✅ yes | partly | ❌ saturated | $20–40 | ❌ YMYL | no |
| **Auto reliability** (my v1) | ❌ **NO** | — | — | — | ❌ trade libel | ☠️ **dead on §2** |
| **CPSC recalls** | ❌ no units-sold denominator | — | — | — | 🟨 | ☠️ same flaw as auto |

**Corrected pick: aviation operations.**

Why it clears every filter: the denominators are genuinely published and free; the useful cuts (carrier × route × aircraft type) are locked inside enterprise platforms so consumer SEO is wide open; there is **no Reddit/forum dominance** because nobody writes forum posts about on-time rates; legal risk is low because the DOT already publishes carrier rankings and you are re-cutting official data; and the affiliate value (travel credit cards, travel insurance) is among the highest available anywhere.

**The metric** — the same normalization trick, with a denominator that exists:

```
Route Reliability Score =
   (delay minutes + 5 × cancelled flights + 25 × tarmac-delay events)
   ÷ departures
   × 1,000
```

Plus, per aircraft type and per carrier × route: **delay minutes per 1,000 departures**, **mishandled bags per 1,000 passengers**, and **% of flights delayed >45 min**. All computable from free BTS tables, and the carrier × route × equipment-type cut is not published anywhere in consumer form.

**The honest caveat:** aviation's search volume is lower than education or crime. It will not reach 1M views/month on its own — realistically **100k–300k views/month at maturity**. Which is exactly why §7 exists.


---

## 4. The two rules that keep you alive

### Rule 1 — Never publish a severity-weighted ranking of a named private entity

This is what killed v1's legal position. Aggregating **unverified, self-reported allegations** and then applying **your own severity weights** to produce a ranking of named companies is trade libel / product disparagement. Truth is a defence; defending it costs more than the business is worth.

**What to do instead:**

- Rank **operational outcomes from official, verified datasets** (DOT on-time performance is a *measured fact*, not an allegation). ✅
- If you must use complaint data, **never apply your own severity weighting to a named entity** — publish the raw counts and the ratio, attributed explicitly.
- Always show **n**, always link the primary source, always state that the data is as-published.
- Standing disclaimer: *"Data is reproduced from official [agency] datasets. We do not independently verify it. No affiliation with, or endorsement by, any entity named."*
- **Never assert intent.** "Airline X is deliberately slow" is a different legal object from "Airline X's flights were delayed an average of 21 minutes."

### Rule 2 — Google classifies the *shape* of the page, not your intentions

The March-2024 spam policy applies *"regardless of how it's produced."* A unique computed number does **not** automatically exempt you. The classifier sees: N thousand URLs, one template, a handful of swapped fields, ~400 words, 3 ad units. **That shape is the problem.**

**Shape, not count, is the variable you control.** A page that is *structurally different* from its siblings — an interactive tool, a real chart of the underlying series, a genuinely different table, original interpretation — reads as a product. A page that swaps five fields into a fixed sentence template reads as a farm.

**Per-page test:** if you deleted this page, would anyone lose access to something they cannot get elsewhere? If the answer is "no — the same number is on 400 sibling pages," **do not publish it.**

---

## 5. The corrected architecture

```
┌─ 1 · INGEST ───────────────────────────────────────────────────┐
│  GitHub Actions cron (free) -> free, keyless public APIs:       │
│   • BTS T-100 segment (departures, seats, passenger-miles)      │
│   • BTS On-Time Performance (delay minutes, cancellations)      │
│   • DOT Air Travel Consumer Report (tarmac delays, bags)        │
│  Output: raw/*.json committed to the repo. Cost: $0.            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 2 · NORMALIZE  (the moat) ────────────────────────────────────┐
│  Route Reliability Score, delay-minutes per 1,000 departures,   │
│  cut by carrier x route x aircraft type. Rank, percentile,      │
│  YoY delta, and a sensitivity check under alternate weights.    │
│  Output: data/metrics.json. Nobody else publishes this cut.     │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 3 · GENERATE  (shape-differentiated, NOT a template farm) ────┐
│  • 1 flagship Index page (the citable, press-facing artifact)   │
│  • 1 interactive route/carrier lookup tool (the product)        │
│  • ~200-300 hand-differentiated entity pages with real charts   │
│  • THEN scale to 2,000-5,000 only where the data supports it    │
│  Static HTML -> Cloudflare Pages. Cost: $0.                     │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 4 · RETAIN ───────────────────────────────────────────────────┐
│  "My flights": track a route -> delay alerts + a live badge.    │
│  Converts anonymous search traffic into an owned email list.    │
│  (This is IDEA.md's Queue Engine, used as the retention layer.) │
└────────────────────────────────────────────────────────────────┘
```

**The correction that matters most:** the red team's highest-leverage recommendation was **"do not build 10,000 pages — build 200–300, and make the metric an interactive tool."** That is right *for a single site*, because page count is not the lever — **index selection and links** are. §6 is how you get to 1M anyway.


---

## 6. How you actually reach 500k–1M views/month

The honest synthesis, and the answer to your requirement:

> **You reach 500k–1M views/month as a PORTFOLIO of normalization sites, not as one site.**

§1 says 1M/month needs 18,500–59,000 pages. Nobody should build one 60,000-page site — that shape is exactly what gets classified as a farm. But **six sites of 3,000–10,000 pages each**, in six verticals, each with its own free-denominator metric and its own brand, is:

- **individually defensible** — each is a focused data product, not a 60,000-page farm;
- **individually survivable** — an update that hits one does not hit all;
- **cumulatively 1M+ views/month**;
- and **near-zero marginal cost**, because it is the same pipeline re-skinned. That was the original thesis all along.

| Phase | Months | What you build | Target |
|---|---|---|---|
| **1** | 0–6 | One vertical (aviation ops). 1 Index + 1 tool + 200–300 differentiated pages. Get indexed, get links, get a sponsor. | 5k–20k views/mo |
| **2** | 6–12 | Scale that vertical to 2,000–5,000 pages *where the data supports it*. Add the retention layer. | 50k–150k views/mo |
| **3** | 12–24 | **Re-skin to vertical #2 and #3.** Same pipeline, new denominator, new brand. | 200k–500k views/mo |
| **4** | 24–36 | Verticals #4–#6. Portfolio diversification. | **500k–1M+ views/mo** |

**This is why the portability of the engine matters more than the choice of vertical.** A blogger who fails in aviation starts from zero in education. You start at 80% — same ingest, same normalize, same generator, same badge, same ad stack. **Portability converts a failed vertical from a loss into a cost of learning.**

---

## 7. Corrected economics

| | p10 | p50 | p90 |
|---|---|---|---|
| Pages at month 24 | ~2,000 | ~5,000 | ~20,000 |
| Views/month | ~10k | ~180k | ~1.09M |
| Monthly revenue | ~$60 | ~$4,200 | ~$46,700 |
| Cumulative 24-month revenue | **$4,000** | **$27,000** | **$180,000** |
| Hours invested | 1,400 | 1,500 | 1,600 |
| **Effective $/hour** | **$3** | **$18** | **$113** |

**Stated plainly:** the expected value of this play is carried almost entirely by the p90 tail. At the median you earn **~$18/hour** over two years — worse than most part-time work, and only worth it because the asset keeps paying after you stop and the engine re-skins.

**The three things that move you from p50 to p90:**

1. **Index selection.** Getting pages actually indexed is worth more than getting more pages. Instrument `indexed ÷ published` from week one.
2. **Links.** 20–50 real referring domains (data-driven PR, the Index, embeds) is what separates p90 from p50. Page count is not the lever.
3. **The affiliate rail.** At p90, affiliate is ~35% of revenue. Pick verticals with high-value affiliate (travel credit cards: $50–200 per approval) rather than display-only verticals.

---

## 8. Kill criteria — pre-committed

| Gate | When | Threshold | If it fails |
|---|---|---|---|
| G1 | Month 3 | ≥150 pages live and ≥25% indexed | The pipeline is broken, not the market. Fix ingestion/templates. |
| G2 | Month 6 | ≥1,000 sessions/month organic | Vertical is wrong. **Do not add pages.** Re-skin. |
| G3 | Month 9 | **≥3,000 sessions/month OR ≥30% indexed** | Vertical is wrong — keep the pipeline, re-skin. *(This gate comes directly from the red team.)* |
| G4 | Month 12 | ≥$500/month revenue | Monetisation is wrong. Switch to affiliate-first. |
| G5 | Month 24 | ≥$3,000/month | Portfolio is not compounding. Stop adding verticals; fix the one that works. |

> **Page count is not the lever.** If G2 or G3 fails, adding 5,000 more pages makes things *worse* — it deepens the farm shape that is suppressing your index rate.

---

## 9. The verdict, in one paragraph

Your requirement is achievable, and the corrected architecture is: **normalize a free dataset whose denominator is genuinely free, publish it as one citable Index plus one interactive tool plus a few hundred shape-differentiated pages, earn links rather than page count, then re-skin the identical pipeline into five more verticals until the portfolio clears 500k–1M views/month.** At top-decile execution that is **$46,000/month by month 24**; at median execution it is **$4,200/month**; and at bottom-decile it is **$3/hour and you should quit at gate G3**. The idea is novel, the method is sound, and the honest timeline is **24–36 months, not 90 days** — which is the part everyone selling you a shortcut leaves out.

