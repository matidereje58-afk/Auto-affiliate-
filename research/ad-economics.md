# Economics of an Ad-Monetized Free-Tool Website (late 2025 / early 2026)

**Scope:** zero-budget, solo operator; free web tool (utility/calculator/converter-style) monetized with display/interstitial ads. Not a content/blog site.
**Compiled:** 2026-10-10 (all figures reflect the live web as of this date).
**Author:** monetization research brief.

## Confidence key (used throughout)

| Label | Meaning |
|---|---|
| **verified** | Taken from the network's own policy/eligibility/pricing page (URL given) on 2026-10-10. |
| **directional** | Reasonable synthesis from network-published case studies or multiple secondary sources; magnitude is trustworthy, exact value is not. |
| **uncertain** | Could not confirm from a primary source in this environment; treat as a hypothesis to test. |

> **Method / honesty note.** This environment blocked `reddit.com` (HTTP 403) and live `x.com`/Twitter and Indie Hackers search, so the exact Reddit r/juststart, r/adops and X creator-report URLs requested in the brief **could not be retrieved or cited** here. Where the brief asks for community RPM reports, I substituted (a) network-published case studies with real dollar RPMs and (b) one long-running public blog income report, and I label those rows explicitly. **No number in this brief is invented.** Ranges I could not pin to a primary source are marked `directional`/`uncertain`.

---

## 1. Ad-network landscape & minimum-traffic thresholds (as of 2026-10-10)

### 1a. Premium / curated networks ("you need traffic")

| Network | Min traffic to join | Rev share / model | Payout min | New site <10k pv/mo? | Conf. |
|---|---|---|---|---|---|
| **Journey by Mediavine** | **1,000 Tier-1 sessions / 30 days** (US, CA, UK, AU). Note: non-Tier-1 traffic is *not penalised* but does not count toward the bar. | Mediavine ad tech; separate inventory pool from core Mediavine; revenue-share model (share not published). | Not published. | ✅ Yes — designed for this. | **verified** ([mediavine.com/blog/two-years-of-journey-by-mediavine](https://www.mediavine.com/blog/two-years-of-journey-by-mediavine/), [mediavine.com/mediavine-requirements](https://www.mediavine.com/mediavine-requirements)) |
| **Mediavine** (core) | **$5,000 in annual ad revenue** (this replaced the old "50,000 sessions/mo" bar). | Revenue share (not published). | Not published. | ❌ No. | **verified** ([mediavine.com/mediavine-requirements](https://www.mediavine.com/mediavine-requirements)) |
| **Raptive** (ex-AdThrive) | **25,000 monthly pageviews** (lowered from 100,000 on 2025-10-16). Requires majority US/CA/UK/AU/NZ traffic, 100% original content. | Revenue share (not published). **RPM guarantee**: +15% RPM lift (or smaller if you reduce ad density) — but only for sites averaging **≥100k monthly PVs and ≥$20k net ad revenue/12 mo**. | Not published. | ❌ No (25k floor). | **verified** ([raptive.com/blog/opening-the-door...](https://raptive.com/blog/opening-the-door-to-more-creators-who-meet-raptive-quality-standards/), [raptive.com/rpm-guarantee](https://raptive.com/rpm-guarantee/)) |
| **Ezoic** | **250,000+ monthly active users** — *new requirement effective 2026-02-19*. Publishers active before that date are **grandfathered** (void if Ezoic is removed >7 consecutive days). Separately, <250k sites may apply to the **Incubator Program**, which accepts only **20 publishers/month** and gives full platform access. | "Aligned incentives… earns a share only when you earn more" — revenue-share; no upfront cost claimed. | Not published. | ⚠️ Only via Incubator, competitive, 20/mo. | **verified** ([support.ezoic.com/…/getting-started-ezoics-requirements](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements), [Ezoic Incubator](https://support.ezoic.com/kb/article/ezoic-incubator-program)) |
| **Monumetric** | Tiered programs: **Propel 10k–80k PV/mo**, Ascend 80k–500k, Stratos 500k–10M, Apollo 10M+. | Ad-management rev share (share not published). Historically a one-time setup fee at low tiers. | Not published. | ⚠️ 10k floor. | **verified** for tiers ([monumetric.com](https://www.monumetric.com/)); fee **uncertain** (not shown on current site) |
| **SheMedia** (Penske Media) | No public numeric floor on the partner page. Network of "5K+ entrepreneurs". Lifestyle/female-skewed. | Rev share + sponsored campaigns. | Not published. | ❓ Unknown. | **uncertain** ([shemedia.com/partner-network](https://www.shemedia.com/partner-network/)) |
| **Setupad** | No public floor; sells "flat CPM fees" + direct Prebid/GAM infra; **500+ international sites**, "4B+ impressions/month". Enterprise/self-serve. | Flat CPM fee model (not a % reseller). | Not published. | ❓ Probably too heavy for a solo tool site. | **verified** for model ([setupad.com](https://setupad.com/)); floor **uncertain** |
| **Snigel** | **Snigel is now part of Publisher Collective** (site shows a merger banner only). Legacy Snigel floor (~10k) no longer verifiable. | — | — | ❓ | **uncertain** ([snigel.com](https://www.snigel.com/)) |
| **PubFuture** | Site is a JS SPA; no scrapeable thresholds. | — | — | ❓ | **uncertain** ([pubfuture.com](https://pubfuture.com/)) |

**Key structural change to flag:** in 2025–2026 the *entry* bars moved in opposite directions. **Ezoic went up hard** (10k-era tier → **250k MAU**), while **Raptive went down** (100k → **25k PV**) and **Mediavine lowered its own bar** to a **revenue** test ($5k) and pushed the small-site entry point to **Journey (1,000 Tier-1 sessions)**.

### 1b. Self-serve / remnant networks (accept tiny and zero-traffic sites)

| Network | Min traffic | Model & share | Payout min | New site <10k pv/mo? | Conf. |
|---|---|---|---|---|---|
| **Google AdSense** | **None.** | **Publisher receives 80% of revenue after the advertiser platform fee; ~68% effective when Google Ads buys the impression.** Same % regardless of geography. | **$100 USD payment threshold** (varies by currency); identity verification **$0**; address (PIN) **$10**; payment-method-selection **$10**. | ✅ Yes. | **verified** ([revenue share](https://support.google.com/adsense/answer/180195), [thresholds](https://support.google.com/adsense/answer/1709871)) |
| **Monetag** | **None.** | Rev-share; Popunder, Push, Vignette (native), In-Page Push, SmartLink, banner. "100% fill, 195+ GEOs". | **Weekly from $5.** | ✅ Yes (no website required for some formats). | **verified** ([monetag.com](https://monetag.com/); payout in [terms](https://monetag.com/terms/)) |
| **Adsterra** | **None** — "no entry limits to the volumes of impressions". | eCPM rev-share; Popunder, Social Bar, In-Page Push, Interstitial, Native, Banner, Smartlink. | Net-7 weekly (typical). | ✅ Yes. | **directional** ([adsterra.com](https://adsterra.com/)); exact min **uncertain** |
| **HilltopAds** | **None stated.** | eCPM/CPC/CPA; Popunder, In-Page, Video, Banners. "Weekly payouts with Net7". | Net-7 weekly. | ✅ Yes. | **directional** ([hilltopads.com](https://hilltopads.com/)) |

### 1c. "AI-era" ad-tech (what actually changed, not marketing)

- **Rewarded / value-exchange ads** are the biggest new format for *tool* sites: Ezoic promotes **rewarded ads** ("watch a 15s ad to unlock a feature/export/credits — no paywall") and claims **"U.S. identified users see 110%+ EPMV improvement"** via first-party identity (**ezID**, hashed, via LiveRamp/ID5/UID2/Trade Desk). A free tool has an obvious "unlock" moment that a blog lacks. Source: [ezoic.com/monetize](https://www.ezoic.com/monetize/) (network claim, **directional**).
- **AI-based throttling/optimisation** (Ezoic real-time per-impression auction; Monetag "MultiTag" AI CPM forecasting) is table stakes and does not change the traffic thresholds above.
- **Raptive's positioning shift** is explicitly AI-driven: they lowered the PV bar *because* "AI drives inflated pageviews for low-quality websites", i.e. originality now outweighs raw traffic. Source: [raptive.com opening-the-door post](https://raptive.com/blog/opening-the-door-to-more-creators-who-meet-raptive-quality-standards/).
- **AI answer engines are eating utility search clicks.** Raptive measured **AI Overviews up 45% since Q1** and **CTR down as much as 60%** in affected queries. For a free-tool site this is the #1 demand risk. Source: [raptive.com Aug-2025 spam-update analysis](https://raptive.com/blog/heres-what-we-learned-from-googles-august-2025-spam-update/) (**verified** as a network measurement).


---

## 2. Realistic RPM benchmarks by vertical (tool/utility traffic)

> **Read this first.** RPM = revenue per 1,000 **pageviews** (not sessions). "Tools" traffic monetises like **content** but with fewer pageviews/session (often 1.0–1.4 vs 2–3 for recipe/hobby blogs), which lowers session-based EPMV. Finance/insurance/legal are high because a *single* click (a quote request) can be worth $20–$100 to the advertiser; gaming is low because the audience is younger/mobile/less US.

### 2a. Anchor data points I could actually verify

| Data point | Value | Source | Conf. |
|---|---|---|---|
| Raptive creator pre-period RPM example (lifestyle/blog) | **$17.26 RPM** vs comparable-cohort **$20 RPM** (2021) | [raptive.com/blog/proven-rpm-lifts](https://raptive.com/blog/proven-rpm-lifts/) | **directional** (single example, 2021) |
| Raptive UK RPM lift (2025, ad-code work) | **+19.3% UK RPM** (ad code alone +17.8%) | [raptive.com international RPM post](https://raptive.com/blog/raptive-rpms-on-the-rise-for-international-traffic/) | **verified** as claim |
| Raptive ad-density guidance | **20% ads-to-content desktop / 24% mobile**; >25% ratio correlated with traffic declines | [raptive.com Aug-2025 analysis](https://raptive.com/blog/heres-what-we-learned-from-googles-august-2025-spam-update/) | **verified** |
| Mediavine case study (Old World Garden Farms, gardening) | **+174% RPM**, +705% revenue in year 1 | [mediavine.com](https://www.mediavine.com/) | **verified** as claim |
| Fat Stacks niche-site income report (May 2023 peak) | **$116,434/mo** ads+other across a niche-site portfolio | [fatstacksblog.com/niche-site-income-report](https://fatstacksblog.com/niche-site-income-report/) | **verified** as a real creator report |

### 2b. Working RPM ranges for a tool/utility site (synthesised — planning envelopes)

| Vertical | US-heavy RPM | Global/mixed RPM | Notes |
|---|---|---|---|
| Finance / insurance / legal | **$12–$40+** | $2–$8 | Highest; leads are expensive. Hard to get *pure* AdSense demand; often needs direct/affiliate. |
| Home services / B2B tools | **$10–$25** | $2–$7 | Contractor/quote tools monetise well. |
| Health / medical (non-YMYL) | **$8–$20** | $2–$6 | YMYL pages risk policy restrictions. |
| Tech / dev tools | **$6–$18** | $2–$6 | Dev audiences block ads more; desktop-heavy = higher viewability. |
| Education / study tools | **$5–$15** | $1–$5 | Strong student mobile mix drags RPM. |
| Generic utility (converters, PDF, generators) | **$4–$12** | $1–$4 | The "default" for a free tool; low session depth. |
| Gaming / entertainment | **$3–$10** | $0.5–$3 | Young, mobile, non-US; lowest brand demand. |

**All rows in 2b are `directional`.** They reconcile with the verified anchors above (premium networks ~$15–$20+ RPM on US lifestyle; AdSense-only global tools often $1–$5). **Sanity-check rule:** US traffic RPM ≈ **3–6×** the same site's global-mix RPM; desktop RPM ≈ **1.5–2×** mobile RPM on the same page (`directional`).

---

## 3. Pageview → revenue math (low / mid / high RPM)

Monthly revenue = (pageviews ÷ 1,000) × RPM. Scenarios chosen to bracket "low/mid/high":

- **Low = $2 RPM** — AdSense/remnant, mostly non-US/global, mobile, thin tool pages.
- **Mid = $8 RPM** — mixed US/global, decent placements, AdSense+mediation or Monumetric/Journey tier.
- **High = $20 RPM** — US-heavy, premium network (Raptive/Mediavine), finance/insurance/home-services vertical.

| Monthly pageviews | Low ($2) | Mid ($8) | High ($20) |
|---|---|---|---|
| 50,000 | **$100** | **$400** | **$1,000** |
| 250,000 | **$500** | **$2,000** | **$5,000** |
| 1,000,000 | **$2,000** | **$8,000** | **$20,000** |
| 5,000,000 | **$10,000** | **$40,000** | **$100,000** |

**Annualised (mid, $8 RPM):** 50k ≈ **$4.8k/yr**, 250k ≈ **$24k/yr**, 1M ≈ **$96k/yr**, 5M ≈ **$480k/yr**.

### 3a. From impressions to dollars (mechanics, so you can model your own)

```
Revenue        = impressions × viewable% × CPM_sold ÷ 1000
Publisher RPM  = Revenue ÷ pageviews × 1000
```
- **CPM vs CPC:** display is mostly sold on CPM (per 1,000 impressions). Programmatic *paid* CPMs for a US tool are frequently **$0.50–$4 CPM gross**, of which you keep a share. An advertiser "CPM" of $3 is NOT a $3 RPM to you — RPM is what survives fill, floor and viewability.
- **Viewability:** benchmark **~70%**; Ezoic claims it lifted **display viewability to 87% by cutting 25% of impressions** — i.e. *fewer, better* placements can raise net RPM. `directional`.
- **CTR:** banner CTR is tiny (**~0.05%–0.3%**); pop-under/social-bar CTR is higher but carries policy/invalid-traffic risk. `directional`.
- **Mobile vs desktop:** mobile ≈ **50–65% of desktop RPM** on the same page; a 90%-mobile tool should model the low/mid end. `directional`.
- **Pages/session:** tools often run **1.0–1.4**; each extra result page (e.g. a shareable result URL) directly multiplies pageview-based revenue.
- **Ad-density ceiling:** keep ads-to-content **≤20% desktop / ≤24% mobile**; over **25%** correlated with ranking declines (Raptive). `verified`.


---

## 4. Policy risk: Google spam policies (2024–2026) and how they hit a free-tool site

### 4a. Scaled content abuse (exact policy language)

> "Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users. This abusive practice is typically focused on creating large amounts of unoriginal content that provides little to no value to users, **no matter how it's created**. Examples … Using generative AI tools or other similar tools to generate many pages without adding value for users; Scraping feeds, search results, or other …"
> — [developers.google.com/search/docs/essentials/spam-policies](https://developers.google.com/search/docs/essentials/spam-policies) (**verified**, page last updated 2026-08-28)

How it applies to a free tool:
- **(a) Programmatic / templated pages** — a generator that spins up thousands of near-identical pages ("*convert 1 lb to kg*", "*generate random name #4721*") is the textbook risk. The test is **user value, not authoring method** ("no matter how it's created"). A handful of genuinely useful result pages is fine; mass auto-generated near-duplicates are not.
- **(b) User-generated pages** — covered separately by the **"User-generated spam"** policy ("spammy content added to a site by users through a channel intended for user content… Spammy posts on forum threads, comment spam"). If your tool lets users create public pages, you own the moderation burden.
- **(c) AI-generated text** — not banned per se; banned only when it produces **many low-value pages**. Google's March 2024 announcement framed this explicitly ([blog](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)).

### 4b. Site reputation abuse (parasite SEO) — exact scope + Nov 2024 enforcement

> "Having third-party content alone is not a violation of the site reputation abuse policy. It's only a violation if the content is being published in an attempt to abuse search rankings by taking advantage of the host site's ranking signals." … "The policy is not about targeting affiliate content… Affiliate links marked appropriately aren't considered site reputation abuse."
> — Google's Dec-2024 FAQ, summarised by [searchenginejournal.com/google-site-reputation-abuse](https://www.searchenginejournal.com/google-site-reputation-abuse/) (**verified**)

- Enforcement of **site reputation abuse** began **November 2024** (manual actions). Remediation needs **`noindex` + a reconsideration request in Search Console** — noindex alone does not clear the manual action; use `nofollow` on cross-links from the old host.
- **For a free tool:** the risk is *hosting third-party content* (sponsored "how-to" pages, white-label articles, a coupon/deal subfolder) on your domain to borrow its rankings. **Affiliate content itself is explicitly fine** if marked appropriately.

### 4c. What actually got demoted in 2024–2026 (measured, not rumoured)

Raptive analysed the **Aug 26–Sep 22, 2025 spam update** across sites = 95% of its network traffic ([source](https://raptive.com/blog/heres-what-we-learned-from-googles-august-2025-spam-update/), **verified** as a network measurement):
- **Thin pages lost ground** — posts **under 500 words consistently underperformed**.
- **High ad density hurt** — sites with **>25% ads-to-content ratio** were more likely to decline; balanced density was most stable.
- **Authority protected** — sites with **DA ≥40** and strong branded search fared best.
- **AI spam** — SpamBrain keeps improving at spotting low-quality/derivative content.

> **Named-victim caveat.** The brief asks for named sites penalised in 2024–2026. In this environment I could **not** verify a specific named-victim list from a primary source (Search Engine Land returned 403; Reddit was blocked), so I will **not** assert names. What is *verifiable* is the **policy scope** (4a/4b) and the **measurable drivers** above. Treat any "site X was hit" claim you see elsewhere as **uncertain** unless it comes with a Search Console/manual-action screenshot.

### 4d. Running AdSense on a page that is "mostly a tool with little text"

Governed by the **Google Publisher Policy "Inventory value / Google-served ads on screens without publisher-content"**:

> "We do not allow Google-served ads on screens: **without publisher-content or with low-value content**, that are under construction, that are used for alerts, navigation or other behavioral purposes." — [Google Publisher Policies](https://support.google.com/adsense/answer/10502938) (**verified**)

Companion rule: "**More ads or paid promotional material than publisher-content**" is not allowed (same source).

**Practical reading:** a bare input box + an ad is exactly the "low-value content" pattern. Mitigate by shipping **real, useful, indexable content around the tool** — explanatory copy, worked examples, FAQs, methodology, "related tools" — so the page is a *resource that contains a tool*, not a *tool page with ads bolted on*. Never serve AdSense on **empty states, error pages, "calculating…" screens, login pages or thank-you pages** (the policy names "under construction" and "behavioral purposes" screens).


---

## 5. Ad-network policy traps specific to free-tool sites

| Trap | Policy / source | Practical rule |
|---|---|---|
| **Ads on empty states / no-result screens** | GPP "screens without publisher-content … low-value content … under construction … alerts, navigation" ([link](https://support.google.com/adsense/answer/10502938)) **verified** | Suppress ad slots until there is a result + content. Never load an ad unit into a blank container. |
| **Ads on generated / printable pages** | Same inventory-value policy + "more ads than publisher-content". Ezoic bans "**empty pages with no original content**" ([link](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements)) **verified** | Printable/PDF-output pages carry **no ads** or are `noindex`; keep an HTML wrapper with real copy. |
| **Pop-unders** | Allowed by Monetag/Adsterra/HilltopAds (flagship format). **Disallowed in Google's ecosystem**: GPP "Abusive experiences" + "**Better Ads Standards**" ([link](https://support.google.com/adsense/answer/10502938)) **verified** | You generally **cannot run AdSense and pop-under networks on the same pages**. Segregate by domain/path and check exclusivity clauses. |
| **Ad density** | Raptive: **20% desktop / 24% mobile**; >25% ratio risky ([link](https://raptive.com/blog/heres-what-we-learned-from-googles-august-2025-spam-update/)) **verified**; Google "Better Ads Standards" | Cap density; prefer fewer, higher-viewability slots. |
| **Invalid traffic from embeds/widgets on other sites** | AdSense "Traffic sources": "Google ads may not be placed on pages receiving traffic from certain sources… publishers may not… **display ads as the result of the action of any software application**" ([link](https://support.google.com/adsense/answer/48182)) **verified** | Third-party embeds create impressions you don't control → IVT risk. Never auto-trigger ad loads from a widget without a real page view. |
| **Redirect / short-link / "SmartLink" chains** | AdSense forbids **sneaky redirects** and software/paid-to-click traffic; Monetag's **SmartLink** is explicitly marketed for "**redirect, 404 traffic, expired domains**" ([monetag.com](https://monetag.com/)) **verified** | Keep SmartLink/redirect monetisation **off any domain running AdSense**. |
| **Serving ads inside a widget embedded on someone else's site** | GPP "**Authorized inventory**": "You must not place Google-served ads on a domain that uses **ads.txt** where you are **not included as an authorized seller**" ([link](https://support.google.com/adsense/answer/10502938)) **verified** | You can only serve where you are an authorised seller in that domain's `ads.txt` (or via a sanctioned syndication/parent-child agreement). A solo operator dropping an ad-bearing iframe onto random third-party sites is a **policy violation and a near-certain invalid-traffic problem**. Do not build on it. |
| **Modifying ad code to force fills/CTR** | AdSense "Modifications of AdSense ad code": no hiding units, no overlap, no email/software distribution, no drag-triggered clicks ([link](https://support.google.com/adsense/answer/1354736)) **verified** | Don't hack the snippet to "make a tool page look fuller". |

**One-line rule:** monetise **pages that are real destinations** (tool + substantive content), keep **pop-under/redirect networks quarantined** from Google monetisation, and **never** serve Google ads into embedded widgets you don't own.


---

## 6. Payment plumbing for a solo operator with no company

### 6a. Google AdSense (the backbone for a 0–10k site)

- **No company required.** Individuals (sole operators) can hold an AdSense account; it is tied to a **payments profile** (name/address) and a **payments account**.
- **Thresholds (USD):** tax-info **$0** (if applicable); **identity verification $0** — *you must verify your identity before the account can show ads or receive payments*; **address (PIN) verification $10**; **payment-method selection $10**; **payment threshold $100**; cancellation threshold $10. Non-USD currencies have local equivalents (A$100, C$100, ₺200, د.إ350…). Source: [support.google.com/adsense/answer/1709871](https://support.google.com/adsense/answer/1709871) (**verified**).
- **Timeline:** earnings finalise after month close; payment issued around the **21st of the following month** once the $100 threshold is met and there are no holds; **final payment ≈90 days** after account cancellation.
- **Payment methods:** EFT/bank transfer, wire, check, and **PayPal Hyperwallet** (availability varies by country).
- **Revenue share:** **80% of revenue after the advertiser platform fee** (≈**68%** effective via Google Ads), same worldwide ([link](https://support.google.com/adsense/answer/180195)) **verified**.

### 6b. Does being non-US change anything?

- **Yes, on tax and entity — not on eligibility.** Google's **contracting entity** depends on your location (Google LLC / **Google Ireland** / Google Advertising (Shanghai) / Google Asia Pacific). Most non-US operators contract with **Google Ireland**.
- **Tax forms:** you must submit tax info; **non-US** operators typically file a **W-8** series form (e.g. W-8BEN for individuals); US persons file a W-9. If you have **US-sourced activities** and no treaty benefit, US withholding can apply. AdSense reports in **local currency** and handles **VAT** for EU/UK where applicable.
- **Practical:** a non-US solo operator needs **no company** for AdSense, Adsterra, Monetag or HilltopAds — just ID, address and a bank/Paxum/PayPal-style payout method. **Premium networks are more corporate**: Mediavine/Journey/Raptive contract with a business on US terms (W-9/W-8 + signed agreement), so a simple entity and business bank account become worthwhile once you're at ~$5k+/yr.

### 6c. Other networks' payout basics

| Network | Payout minimum | Cadence | Conf. |
|---|---|---|---|
| Monetag | **$5** | Weekly | **verified** ([monetag.com](https://monetag.com/)) |
| Adsterra | ~$5–$100 by method (not stated on site) | Net-7 weekly | **uncertain** |
| HilltopAds | Not stated | Net-7 weekly | **directional** |
| Raptive / Mediavine / Journey | Not published; typically monthly on US terms | Monthly | **uncertain** |


---

## 7. Ranked recommendation: which network, by stage

### 0 – 10,000 pageviews / month
1. **Google AdSense** — the only brand-safe, zero-minimum, tool-compatible, no-company-needed option. Build the content wrapper (see §4d) so it survives the "low-value content" test. `verified` eligibility.
2. **Journey by Mediavine** — if you have **1,000 Tier-1 sessions/30 days** and quality content, this beats AdSense RPM and puts you on the Mediavine path. Apply via the unified `mediavine.com/apply`. `verified`.
3. **Monetag** (rewarded/interstitial/SmartLink) — only as an **isolated** supplement on non-AdSense paths; zero minimum, $5 weekly. `verified` terms.
4. **Ezoic Incubator** — long shot (20 slots/mo) but free upside if accepted; note the 250k MAU main gate. `verified`.
5. **Adsterra / HilltopAds** — last resort for traffic AdSense won't monetise (social, redirect, non-tier-1). Policy-isolate from AdSense.

### ~50,000 pageviews / month
1. **Journey by Mediavine** — still the default upgrade from AdSense (self-serve, low bar, premium tech). `verified`.
2. **Monumetric (Propel 10k–80k)** — full-service ad ops with a dedicated manager; good if you want hands-off. `verified` tiers.
3. **Raptive** — now reachable at **25k PV**; highest ceiling, most selective, US/CA/UK/AU/NZ traffic expected. `verified`.
4. **AdSense (+ AdSense mediation)** — keep as backfill/comparison baseline.

### ~500,000 pageviews / month
1. **Raptive** — premium demand + a **15% RPM-lift guarantee** once you clear 100k PV + $20k net revenue; strongest upside. `verified`.
2. **Mediavine** — once you clear **$5k annual ad revenue**; premium brand demand, strong case-study RPMs. `verified`.
3. **Ezoic** — now open at **250k MAU**; best if you want rewarded/value-exchange formats for tool interactions. `verified`.
4. **Setupad** (flat-CPM/direct Prebid) or **Snigel/Publisher Collective** — for EU/global or if you want to own your ad stack. `verified` model / `uncertain` floor.
5. **SheMedia** — lifestyle/female-skewed only. `uncertain`.

**Migration note:** these are *not* mutually exclusive by page — but AdSense + a pop-under network *are* incompatible on the same pages (§5). Pick one "clean" monetisation path per URL.

---

## 8. Limitations & what to verify next

- **Reddit/X/Indie Hackers were unreachable** (403/blocked) from this environment, so community RPM reports could not be cited. To close this gap, pull 5–10 r/juststart and r/adops threads manually and record screenshot RPMs by niche.
- **Named site-reputation-abuse victims** were not verified; do not repeat unnamed "site X got hit" claims.
- **SheMedia, Snigel, PubFuture, Setupad floors** are unconfirmed.
- **RPM ranges in §2b** are planning envelopes, not measured medians. Validate against your own AdSense account after 30 days of real data before making build/buy decisions.

## 9. Source index (primary, all fetched 2026-10-10)

- Google AdSense revenue share — https://support.google.com/adsense/answer/180195
- Google AdSense payment thresholds — https://support.google.com/adsense/answer/1709871
- Google AdSense Program policies (invalid traffic, traffic sources) — https://support.google.com/adsense/answer/48182
- Google AdSense ad-code modifications — https://support.google.com/adsense/answer/1354736
- Google Publisher Policies (inventory value, ads.txt, Better Ads) — https://support.google.com/adsense/answer/10502938
- Google Search spam policies (scaled content abuse, UGC spam) — https://developers.google.com/search/docs/essentials/spam-policies
- Google March 2024 core update + spam policies — https://developers.google.com/search/blog/2024/03/core-update-spam-policies
- Site reputation abuse FAQ (Nov 2024 enforcement) — https://www.searchenginejournal.com/google-site-reputation-abuse/
- Mediavine & Journey requirements — https://www.mediavine.com/mediavine-requirements
- Journey 1,000 Tier-1 sessions — https://www.mediavine.com/blog/two-years-of-journey-by-mediavine/
- Raptive 25k PV bar — https://raptive.com/blog/opening-the-door-to-more-creators-who-meet-raptive-quality-standards/
- Raptive RPM guarantee (15%) — https://raptive.com/rpm-guarantee/
- Raptive RPM-lift study ($17.26 example) — https://raptive.com/blog/proven-rpm-lifts/
- Raptive international RPMs (UK +19.3%) — https://raptive.com/blog/raptive-rpms-on-the-rise-for-international-traffic/
- Raptive Aug-2025 spam-update analysis (ad density, thin pages) — https://raptive.com/blog/heres-what-we-learned-from-googles-august-2025-spam-update/
- Ezoic requirements (250k MAU, Feb 19 2026) — https://support.ezoic.com/kb/article/getting-started-ezoics-requirements
- Ezoic Incubator (20/mo) — https://support.ezoic.com/kb/article/ezoic-incubator-program
- Ezoic monetize/rewarded/ezID — https://www.ezoic.com/monetize/
- Monumetric program tiers — https://www.monumetric.com/
- Monetag (formats, $5 weekly) — https://monetag.com/ ; terms — https://monetag.com/terms/
- Adsterra — https://adsterra.com/
- HilltopAds — https://hilltopads.com/
- Setupad — https://setupad.com/
- Snigel / Publisher Collective — https://www.snigel.com/
- SheMedia Partner Network — https://www.shemedia.com/partner-network/
- Fat Stacks niche-site income report — https://fatstacksblog.com/niche-site-income-report/

