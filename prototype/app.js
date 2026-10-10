/* InReview — prototype logic.
   Pure vanilla JS, no dependencies. Cohort stats are computed client-side from
   data/seed.json (SYNTHETIC). In production the same maths runs in a Pages
   Function against the submissions table. */

const QUEUE_LABELS = {
  apple: 'Apple App Review',
  google: 'Google Play Review',
  meta: 'Meta App Review',
};
const PLATFORM_OPTIONS = {
  apple: ['ios', 'ipados', 'macos', 'tvos'],
  google: ['android'],
  meta: ['quest'],
};
const MIN_N = 30; // never show a statistic below this

let SEED = null;
let DEMO_TODAY = null;

const $ = (s, r = document) => r.querySelector(s);
const DAY = 86400000;

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d).replace(/\.0$/, ''));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── statistics ─────────────────────────────────────────────────── */

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0] ?? null,
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    max: s[s.length - 1] ?? null,
  };
}

/** Fraction of the cohort that took <= x days. */
function percentileOf(sorted, x) {
  if (!sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= x) lo = m + 1; else hi = m; }
  return lo / sorted.length;
}

/* ── cohort selection ───────────────────────────────────────────── */

function cohortRows(sel) {
  return SEED.rows.filter(
    (r) =>
      r.queue === sel.queue &&
      r.platform === sel.platform &&
      r.releaseType === sel.releaseType &&
      r.countryTier === sel.countryTier &&
      r.firstSubmission === sel.firstSubmission
  );
}

/** Progressively relax filters until we clear MIN_N, and report what we dropped. */
function resolveCohort(sel) {
  const byQueue = SEED.rows.filter((r) => r.queue === sel.queue);
  const tiers = [
    { rows: cohortRows(sel), label: 'exact cohort' },
    { rows: cohortRows({ ...sel, firstSubmission: !sel.firstSubmission }), label: 'first-submission filter relaxed' },
    { rows: byQueue.filter((r) => r.platform === sel.platform && r.releaseType === sel.releaseType), label: 'all country tiers' },
    { rows: byQueue.filter((r) => r.platform === sel.platform), label: 'all release types and country tiers' },
    { rows: byQueue, label: 'all ' + QUEUE_LABELS[sel.queue] + ' submissions' },
  ];
  for (const t of tiers) if (t.rows.length >= MIN_N) return t;
  return tiers[tiers.length - 1];
}

/* ── badge rendering ────────────────────────────────────────────── */

function badgeSvg(label, value, color) {
  const pad = 10, fs = 11, charW = 6.6;
  const lw = Math.round(label.length * charW) + pad * 2;
  const vw = Math.round(value.length * charW) + pad * 2;
  const w = lw + vw, h = 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="${h}" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="${h}" fill="#1b1f29"/>
    <rect x="${lw}" width="${vw}" height="${h}" fill="${color}"/>
    <rect width="${w}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fs}">
    <text x="${lw / 2}" y="15" fill="#000" opacity=".3">${esc(label)}</text>
    <text x="${lw / 2}" y="14">${esc(label)}</text>
    <text x="${lw + vw / 2}" y="15" fill="#000" opacity=".3">${esc(value)}</text>
    <text x="${lw + vw / 2}" y="14">${esc(value)}</text>
  </g>
</svg>`;
}

const BADGE_COLORS = { ok: '#2ea043', watch: '#b8860b', late: '#c0392b', unknown: '#4b5563' };

/* ── the check ──────────────────────────────────────────────────── */

const ordinal = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
};

function runCheck(sel) {
  const elapsed = Math.max(0, daysBetween(sel.submittedAt, DEMO_TODAY));
  const { rows, label: cohortLabel } = resolveCohort(sel);
  const values = rows.map((r) => r.daysToDecision);
  const st = stats(values);
  const sorted = [...values].sort((a, b) => a - b);
  const pct = percentileOf(sorted, elapsed);

  let verdict = 'unknown', headline = 'Not enough data yet';
  if (st.n >= MIN_N) {
    if (elapsed <= st.p75) { verdict = 'ok'; headline = 'Normal for this cohort'; }
    else if (elapsed <= st.p90) { verdict = 'watch'; headline = 'Slower than most — but inside the normal tail'; }
    else { verdict = 'late'; headline = 'Past the p90 — this is now unusual'; }
  }

  const badgeValue = st.n >= MIN_N ? `day ${elapsed} · ${verdict}` : 'insufficient data';
  const badgeLabel = `${QUEUE_LABELS[sel.queue].replace(' Review', '')} review`;

  return { sel, elapsed, st, pct, verdict, headline, cohortLabel, badgeValue,
           badgeColor: BADGE_COLORS[verdict], badgeLabel };
}

function renderResult(r) {
  const { st, elapsed, pct, verdict, headline, cohortLabel } = r;
  const pctTxt = pct == null ? '—' : `${Math.round(pct * 100)}${ordinal(Math.round(pct * 100))}`;
  const has = st.n >= MIN_N;

  const rows = [
    ['Your submission', `${QUEUE_LABELS[r.sel.queue]} · ${r.sel.platform} · ${r.sel.releaseType.replace('_', ' ')}`],
    ['Submitted', r.sel.submittedAt],
    ['Elapsed', `day ${elapsed}`],
    ['Cohort used', `${st.n.toLocaleString()} reports (${cohortLabel})`],
    ['Median for this cohort', has ? `day ${fmt(st.median)}` : 'insufficient data'],
    ['Typical range (p25–p75)', has ? `day ${fmt(st.p25)} – ${fmt(st.p75)}` : '—'],
    ['p90 tail ("am I forgotten?")', has ? `day ${fmt(st.p90)}` : '—'],
    ['You are here', has ? `${pctTxt} percentile` : '—'],
  ];

  const note = {
    ok: 'Nothing to do. Keep waiting.',
    watch: 'Still inside the normal range, but you are in the slower half. No action recommended yet.',
    late: 'Most comparable submissions have resolved by now. Check your submission for a missing requirement before escalating.',
    unknown: `Only ${st.n} reports in this cohort (we require ${MIN_N}). Treat these numbers as indicative.`,
  }[verdict];

  $('#result-card').innerHTML =
    rows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('') +
    (has ? `<div class="bar"><i style="width:${Math.min(100, Math.max(2, pct * 100))}%"></i>
              <span style="left:${Math.min(99, pct * 100)}%"></span></div>` : '') +
    `<div class="verdict ${verdict}"><strong>${esc(headline)}</strong><br>${esc(note)}</div>`;

  $('#result').hidden = false;
}

function renderBadge(r) {
  const svg = badgeSvg(r.badgeLabel, r.badgeValue, r.badgeColor);
  $('#badge-preview').innerHTML = svg;

  const token = btoa(`${r.sel.queue}|${r.sel.platform}|${r.sel.releaseType}|${r.sel.submittedAt}`).replace(/=+$/, '');
  const origin = location.origin + location.pathname.replace(/\/[^/]*$/, '');
  const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  $('#embed-code').value =
    `<!-- live badge (production: served by functions/badge/[token].js) -->\n` +
    `<a href="${origin}/q/${token}"><img src="${origin}/badge/${token}.svg" alt="Review status"></a>\n` +
    `<!-- works offline right now: -->\n` +
    `<a href="#"><img src="${dataUri}" alt="Review status"></a>`;

  $('#copy-note').textContent =
    `Production URL: ${origin}/badge/${token}.svg — cached at the edge, updates automatically as the cohort moves.`;
}

/* ── The Queue Index ────────────────────────────────────────────── */

function weeklySeries(queueKey, weeks = 8) {
  const rows = SEED.rows.filter((r) => r.queue === queueKey);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const inWeek = rows.filter((r) => Math.floor(daysBetween(r.submittedAt, DEMO_TODAY) / 7) === w);
    const st = stats(inWeek.map((r) => r.daysToDecision));
    out.push({ week: w, n: st.n, median: st.median, p90: st.p90 });
  }
  return out; // index 0 = most recent week
}

function sparkline(values) {
  const max = Math.max(...values.filter((v) => v != null), 1);
  return `<div class="spark">${values
    .map((v) => {
      const h = v == null ? 0 : Math.max(6, Math.round((v / max) * 100));
      return `<i style="height:${h}%" title="${v == null ? '—' : fmt(v)} days"></i>`;
    })
    .join('')}</div>`;
}

function renderIndex() {
  const cards = Object.keys(QUEUE_LABELS).map((q) => {
    const s = weeklySeries(q);
    const latest = s[0];
    const prior = s.slice(1, 5).filter((x) => x.median != null);
    const avg4 = prior.length ? prior.reduce((a, b) => a + b.median, 0) / prior.length : null;
    const delta = latest.median != null && avg4 ? latest.median - avg4 : null;
    const cls = delta == null ? 'flat' : delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'flat';
    const arrow = delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
    const chrono = s.map((x) => x.median).reverse();

    return `<tr>
      <td><strong>${esc(QUEUE_LABELS[q])}</strong>${sparkline(chrono)}</td>
      <td class="num">${latest.median == null ? '—' : 'day ' + fmt(latest.median)}</td>
      <td class="num">${avg4 == null ? '—' : 'day ' + fmt(avg4)}</td>
      <td class="num ${cls}">${delta == null ? '—' : arrow + ' ' + fmt(Math.abs(delta))}</td>
      <td class="num">${latest.p90 == null ? '—' : 'day ' + fmt(latest.p90)}</td>
      <td class="num">${latest.n.toLocaleString()}</td>
    </tr>`;
  }).join('');

  const total = SEED.rows.length;
  $('#index-card').innerHTML = `
    <p class="fine" style="margin-top:0">
      Reporting window: 8 weeks ending <strong>${DEMO_TODAY}</strong> ·
      <strong>${total.toLocaleString()}</strong> user-reported outcomes ·
      median is days from submission to first decision.
    </p>
    <table>
      <thead><tr>
        <th>Queue</th><th style="text-align:right">Median (7d)</th>
        <th style="text-align:right">Prior 4-wk avg</th><th style="text-align:right">Δ</th>
        <th style="text-align:right">p90</th><th style="text-align:right">n</th>
      </tr></thead>
      <tbody>${cards}</tbody>
    </table>
    <p class="fine">Sparkline runs oldest → newest. Δ is the last 7 days versus the prior 4-week average.</p>`;
}

/* ── bootstrap ──────────────────────────────────────────────────── */

function syncPlatformOptions() {
  const form = $('#check-form');
  const queue = form.queue.value;
  const sel = form.platform;
  sel.innerHTML = PLATFORM_OPTIONS[queue].map((p) => `<option value="${p}">${p}</option>`).join('');
}

async function boot() {
  const res = await fetch('data/seed.json');
  SEED = await res.json();
  DEMO_TODAY = SEED.generatedAt.slice(0, 10);

  const form = $('#check-form');
  syncPlatformOptions();
  form.queue.addEventListener('change', syncPlatformOptions);

  // default: a submission 6 days ago (the "am I forgotten?" case)
  const d = new Date(DEMO_TODAY);
  d.setDate(d.getDate() - 6);
  form.submittedAt.value = d.toISOString().slice(0, 10);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const sel = {
      queue: form.queue.value,
      platform: form.platform.value,
      releaseType: form.releaseType.value,
      countryTier: form.countryTier.value,
      firstSubmission: form.firstSubmission.checked,
      submittedAt: form.submittedAt.value,
    };
    const r = runCheck(sel);
    renderResult(r);
    renderBadge(r);
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#copy-embed').addEventListener('click', async () => {
    const ta = $('#embed-code');
    try {
      await navigator.clipboard.writeText(ta.value);
      $('#copy-note').textContent = 'Copied. Every embed is a permanent referral node.';
    } catch {
      ta.select();
      $('#copy-note').textContent = 'Select and copy (clipboard blocked in this context).';
    }
  });

  renderIndex();

  // Render the default state immediately so the demo is never empty.
  const sel = {
    queue: 'apple', platform: 'ios', releaseType: 'new_app',
    countryTier: 'us', firstSubmission: true, submittedAt: form.submittedAt.value,
  };
  const r = runCheck(sel);
  renderResult(r);
  renderBadge(r);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div class="banner wrap">Could not load <code>data/seed.json</code> (${esc(err.message)}).
     Serve the folder over HTTP — e.g. <code>python3 -m http.server 8080</code> — rather than opening the file directly.</div>`
  );
});

