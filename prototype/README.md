# GuestPass — prototype

A working, dependency-free demo of the **core mechanic** from `../IDEA.md`:

> one host creates an event → one link → **every guest gets their own personal pass** →
> every pass page carries the *"make your own"* loop footer.

Open `index.html` in a browser (no server, no build step, no account). Click
**"Open demo event"** in the header to see a populated event, a guest pass, the message wall,
the QR card and the host console.

## What the prototype proves

| Claim in IDEA.md | Where to see it |
|---|---|
| A host can create an event with no signup | home page → *Create your event in 60 seconds* |
| Guests are forced through a link (they are the traffic) | `#/e/<id>/join` → personal pass |
| Each guest gets a *personal* page (table, schedule, calendar file, map) | `#/e/<id>/pass/<gid>` |
| The pass is multi-page (3 tabs = 3 pageviews) | *My pass / Messages / Songs* tabs |
| Guests co-author content (ad-safe, keepsake) | message wall + song requests |
| The growth loop is measurable | footer CTA carries `?ref=pass_<eventId>`; the host console counts new events created by guests |
| Ad policy is respected | ad slots are **suppressed** on the RSVP form, on printable views and on empty states; pass-page slots are marked *contextual / non-personalised* |
| No PII in URLs | pass URLs contain opaque ids (`g7f3a91`), never names |

## Production architecture (still $0)

```
Cloudflare Pages (static HTML/CSS/JS)
        │  fetch
        ▼
Cloudflare Worker (API)  ──►  D1 (SQLite)   events · guests · messages · songs · pages
        │
        └──► AdSense script (page-level, never on forms/printables/empty states)
```

Free-tier limits that matter: Workers **100,000 requests/day**, D1 **5 GB / 5M row-reads a day**,
Pages **unlimited requests**. Text-only means you never outgrow the free tier for years.

### Minimal Worker API

```
POST /api/events            -> { slug, hostToken }        (create; no auth)
GET  /api/events/:slug      -> public event JSON          (no guest data)
POST /api/events/:slug/join -> { guestId }                (name + party size)
GET  /api/guests/:guestId   -> that guest's pass only     (opaque id = capability)
POST /api/events/:slug/messages   (rate-limited, profanity-filtered)
POST /api/events/:slug/songs
GET  /api/events/:slug/host/:token -> guest list + counts (host capability)
DELETE /api/events/:slug/host/:token -> hard delete everything (privacy promise)
```

### Deployment (10 minutes)

```bash
npm create cloudflare@latest guestpass -- --type=hello-world
cd guestpass
npx wrangler d1 create guestpass          # paste the id into wrangler.toml
npx wrangler d1 execute guestpass --file=schema.sql
npx wrangler deploy                        # Worker -> free *.workers.dev
npx wrangler pages deploy ./public --project-name guestpass
```

### AdSense integration (do this on day 12, not day 1)

1. Get approved with the landing page + 3 tool pages (each needs 800+ words of real content).
2. Insert the script once, then call `adSlot()` only where `allowed === true` (see `app.js`).
3. Never render a slot before content exists on the page. Never on the RSVP form, printable
   QR card, host console, loading or error states.
4. Pass pages: contextual ads only. Do not pass guest names, ids or event slugs into the ad request.

## What this prototype deliberately does NOT do

* No photo storage (that is how a "$0" project becomes a $200/month project — link out instead).
* No accounts, no passwords, no email sending (capability URLs only).
* No LLM calls (deterministic product, $0 marginal cost).
* No payments (nothing to license, nothing to charge).
