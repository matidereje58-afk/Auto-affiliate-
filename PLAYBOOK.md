# PLAYBOOK.md — Day 0 → Day 90

Everything here costs **$0** until revenue exists. No step requires a credit card.

---

## Part A — The free stack (exact tools, no substitutes needed)

| Layer | Tool | Free limit | Why this one |
|---|---|---|---|
| Hosting + serverless | **Cloudflare Pages + Functions** | 100k function calls/day, unlimited bandwidth | Runs the badge SVG endpoint and the intake API at zero cost, no cold-start tax. |
| Database | **Cloudflare D1** (or Supabase free) | 5M reads/day | Stores submissions + cohorts. |
| Domain | **`inreview.pages.dev`** | Free | Do **not** buy a domain on day 1. Buy a $10 .com from the first sponsor dollar — *after* you know the idea is alive. |
| Badge rendering | **Pages Function → `image/svg+xml`** | Included above | The entire distribution engine is one function. |
| Email / alerts | **Buttondown** or **MailerLite** | 100–1,000 subs free | The list is the asset; never host it yourself. |
| Daily index rebuild | **GitHub Actions cron** | 2,000 min/month | Recomputes medians, rebuilds the index page, commits it. |
| Analytics | **Cloudflare Web Analytics** | Free, cookieless | No cookie banner needed (GDPR-friendly), and page-level views for the Index. |
| Payments | **Stripe Payment Links** | No monthly fee (2.9% + 30¢) | Zero code. Send a link, get paid, sponsor goes live in 5 minutes. |
| Ads | **Ezoic** (no minimum) → **AdSense** → **Mediavine** (50k sessions/mo) | — | Turn on only at day 30+, as the *floor*. |
| Design | Hand-written CSS | — | No framework, no build step, no dependency rot. |

**Total fixed cost: $0.** Your only real input is hours.

---

## Part B — The 7-day sprint to first dollar

### Day 0 — Choose the queue (2 hrs)

Pick **one** queue. For the flagship: *Apple App Review, iOS, new submission vs update, US*. Do not cover Google Play yet. Narrow wins.

Write the config file (see `IDEA.md` §3). Then answer: **where do the first 100 visitors come from, today?** If you can't name three specific places, narrow further.

### Day 1 — Ship the Check + the Badge (8 hrs)

Build only these, nothing else:
1. `/` — the intake form (date, platform, release type) → returns the forecast.
2. `POST /api/submit` — writes the submission, returns a `token`.
3. `/q/<token>` — the shareable result page (carries the sponsor slot and the ads).
4. `/badge/<token>.svg` — the live badge.
5. `/index` — a stub with honest n counts.

**Ship it ugly.** Design is a week-4 problem. Utility is a day-1 problem.

Set up your metrics sheet **before** you have any data (Part E).

### Day 2–5 — Sell the first sponsor (the only fast money) ⭐

This is the step everyone skips, and it is the one that actually pays. Do it *before* the launch.

**Build the target list (~40 names) — you already know these companies:**
- ASO / mobile growth: Appfigures, AppTweak, SplitMetrics, Sensor Tower
- Release & CI: Runway, Codemagic, Bitrise, Emerge Tools, Sentry, Bugsnag
- Mobile infra: RevenueCat, Superwall, Mixpanel, Amplitude, PostHog
- Infra for indie devs: Railway, Render, Fly.io, Neon, Supabase

**Find the person:** founder, DevRel, or head of growth. LinkedIn/X search. No email-finding tool needed — most are `first@company.com` or have a contact form.

**The script** (short, specific, ends in a question):

> Hi {Name} — I run **InReview**, a free tracker where iOS devs post their submission date and immediately learn whether their review time is normal.
>
> Last week **{N} developers** checked it, and **{M}** were indies shipping to the US App Store — the exact people evaluating {their product}.
>
> I'm opening **one** sponsor slot on the result page. It appears at the precise moment someone is waiting and browsing tools, which is the highest-intent moment in their release cycle. **$200 for month one** — one logo, one line, one link. I'll send the placement screenshot and traffic numbers before you decide.
>
> Is this interesting, and who on your team should I send details to?

**Why it works:** specific (named slot, named price, real numbers), low-risk ($200 is a rounding error to these companies), scarcity ("one slot"), and it ends with a question instead of a demand.

**Expected outcome [MOD]:** 40 sends → 8–15 replies → 1–3 yes → **$150–600 paid up front, before launch.** That is your day-2–5 money, and it is an *ad sale* — just sold directly instead of through a network.

### Day 3–7 — Launch into the one channel that rewards tools

**Show HN** (Tue–Thu, 8–10am ET):

> **Show HN: InReview – Find out if your app store review time is normal**
>
> Every dev has refreshed App Store Connect wondering whether a 6-day "In Review" is normal or a problem. Apple publishes nothing useful, so I built a tracker: you submit your date and cohort, and it tells you the current distribution (median, p25–p75, p90) for submissions like yours — plus a live badge you can embed in your README so your team sees status without asking.
>
> All data is user-reported. Right now it's n={N}, so treat the first numbers as indicative; it sharpens with every submission. No account needed. Not affiliated with Apple.

Then the same day: **r/iOSProgramming, r/androiddev, r/SideProject** — framed as *"I built this because I kept asking this question,"* **not** as a product launch. Disclose that it's yours. Reply to every comment within the hour.

Also submit to: **Product Hunt**, **Lobste.rs**, **Indie Hackers**, **dev.to**, and 2 free dev-newsletter listings.

> **Reddit survival rules.** (1) Read the sub's self-promo rules first. (2) Accumulate 50+ karma of genuine comments in that sub *before* posting. (3) Post the **insight** ("here's the actual distribution of review times") with the tool as the source — never "check out my site." (4) Answer questions for hours afterward. The insight framing is the difference between upvotes and a removal.

**Instrument the one metric that decides your outcome: badge embeds.** Put a `?ref=` on the copy button and log every embed.

---

## Part C — Day 7 → 30: turn on the money rails, in order

| Day | Action | Why now |
|---|---|---|
| 7 | Add **affiliate links** on the result page: release tooling, crash reporting, cloud credits. Add the FTC disclosure line. | High EPC, no traffic minimum, works immediately. |
| 10 | Apply to **Ezoic** (no minimum) as the ad backstop. | Slowest gate in the stack — start the clock early. |
| 12 | Ship the **email alert**: "I'll email you the day your cohort's median moves." | Converts the visitor into the asset. |
| 14 | **G1 gate:** ≥300 submissions? If not, fix the funnel (form friction, mobile, gating). | Funnel before vertical. |
| 18 | Publish the first **Queue Index** and email it to 20 dev journalists/newsletters. | The only distribution channel that never bans you. |
| 21 | Turn on **Pro alerts** ($9/mo, Stripe Payment Link). | First recurring revenue. |
| 25 | Second sponsor push — go back to everyone who said "not now." | Warm pipeline converts better than cold. |
| 30 | **G2 gate:** ≥1 sponsor paid ≥$100? | Validates the monetisation assumption. |

### The Index PR email (send to dev journalists, not consumers)

> Subject: **App Store review times are up 47% since March (data)**
>
> Hi {Name} — I run InReview, where iOS devs report their submission and decision dates. We now have {N} reports. The median review time went from {X} to {Y} days over the last 8 weeks, and the p90 tail (the "am I forgotten?" tail) went from {A} to {B}.
>
> Chart and full CSV here: {link}. Happy to slice it by platform, app type, or country if that helps — no attribution needed, I just want the number to be right in public.

**Journalists need citable numbers and don't care about your traffic.** This is the highest-leverage free distribution available to you, and it works *because* your data is proprietary.

---

## Part D — Day 30 → 90: compound

1. **Badge adoption push (highest leverage).** Add a "your team's status page" — a private URL listing all your pending submissions, free. Teams that adopt it embed it. Every embed is a permanent ad unit on someone else's property.
2. **Second queue, via config file:** Google Play → Meta App Review → payment-platform underwriting.
3. **The Index becomes a product:** weekly email digest with a sponsor slot. At ~12 citations this sells for $250–2,000/month.
4. **AEO (answer-engine optimisation).** As AI assistants become the first stop, structure the Index as the citable source of truth: clean headings, an explicit *methodology* section, dates, sample sizes, stable URLs. Being cited inside an AI answer is the new backlink — and it drives branded search.
5. **Month 4+:** open the **data API** to one pilot customer ($200/mo). This is the asset an acquirer would actually buy.

---

## Part E — The only dashboard you need

Track these nine numbers weekly in one sheet. Ignore everything else.

| Metric | Why it matters | Healthy by day 30 |
|---|---|---|
| Submissions (by queue) | Sample density — the whole product | ≥300 |
| Unique visitors | Traffic | ≥10,000/mo |
| **Badge embeds / copies** | **The load-bearing metric** | **≥1% of visitors** |
| Email captures | The asset | ≥15% of visitors |
| 7-day return rate | Proves the "daily compulsion" thesis | ≥25% |
| Revenue by rail (5 columns) | Tells you which rail to double down on | ≥1 paid sponsor |
| Organic share of traffic | Durability after the launch spike | ≥20% by day 75 |
| Sponsor pipeline (sent / replies / yes) | The only revenue you control pre-traffic | ≥40 sent |
| Hours logged | Denominator for whether this is worth it | — |

---

## Part F — No-code track (if you'd rather not write code)

The MVP is reproducible with nothing but free tiers:

- **Site:** Framer or Carrd free tier
- **Intake + logic:** Airtable free + Softr/Glide free tier
- **Badge:** one **Cloudflare Worker** you paste in once (or a Sheets → JSON badge endpoint)
- **Email:** MailerLite free
- **Payments:** Stripe Payment Links
- **Analytics:** Cloudflare Web Analytics

**The trade-off, stated honestly:** no-code gets you live in ~2 days instead of ~1, but the badge endpoint and the daily index rebuild are materially harder — and *those two things are what make this idea work*. If you go no-code, get the badge working above all else.

---

## Part G — Kill criteria

See `STRATEGY.md` Part 7.2 for gates **G1–G5**. Put them in your calendar **today** as events, with the threshold written into the event description. A gate you haven't pre-committed to is not a gate — it's a rationalisation waiting for its moment.

**G5 is the important one:** under $500/month at day 90 → shelve the vertical, keep the engine, re-skin to the next queue. You lose ~3 weeks, not ~6 months. That portability is the single biggest structural advantage you have over someone who decided to become a blogger.


