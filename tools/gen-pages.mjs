#!/usr/bin/env node
/**
 * gen-pages.mjs — the Layer 2 + Layer 3 proof.
 *
 * Reads data/mock-vehicles.json (ILLUSTRATIVE MOCK DATA), computes the
 * Severity-Adjusted Complaint Rate per 1,000 vehicle-years, and generates a
 * static site: an index ranking by the normalized metric AND by raw counts side
 * by side, plus one page per vehicle-year.
 *
 * The point: the normalized ranking inverts the raw-count ranking. That
 * inversion IS the product.
 *
 * Run: node tools/gen-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(__root, 'site');
const WEIGHTS = { crash_fire_injury: 5, powertrain_failure: 3, electrical_failure: 3, minor: 1 };

const data = JSON.parse(readFileSync(resolve(__root, 'data/mock-vehicles.json'), 'utf8'));

/* ── LAYER 2: NORMALIZE ─────────────────────────────────────────────── */

function computeMetrics(v) {
  const vehicleYears = v.registrationsByYear.reduce((a, b) => a + b, 0);
  const rawComplaints = Object.values(v.complaints).reduce((a, b) => a + b, 0);
  const weighted = Object.entries(v.complaints).reduce((s, [k, n]) => s + (WEIGHTS[k] || 1) * n, 0);
  return {
    ...v,
    vehicleYears,
    rawComplaints,
    weighted,
    sacr: (weighted / vehicleYears) * 1000,
    severityIndex: weighted / rawComplaints,
    topFault: Object.entries(v.complaints).sort(
      (a, b) => (WEIGHTS[b[0]] || 1) * b[1] - (WEIGHTS[a[0]] || 1) * a[1]
    )[0][0],
  };
}

const metrics = data.vehicles.map(computeMetrics);
const bySacr = [...metrics].sort((a, b) => b.sacr - a.sacr);
bySacr.forEach((m, i) => (m.rankNormalized = i + 1));
const byRaw = [...metrics].sort((a, b) => b.rawComplaints - a.rawComplaints);
byRaw.forEach((m, i) => (m.rankRaw = i + 1));
const medianSacr = [...metrics].sort((a, b) => a.sacr - b.sacr)[Math.floor(metrics.length / 2)].sacr;

/* ── helpers ────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = (x) => x.toFixed(2);
const int = (x) => Math.round(x).toLocaleString();
const FAULT_LABEL = {
  crash_fire_injury: 'Crash, fire or injury',
  powertrain_failure: 'Powertrain failure',
  electrical_failure: 'Electrical failure',
  minor: 'Minor / other',
};

const CSS = `
:root{--bg:#0f1116;--panel:#171a21;--line:#2a2f3a;--fg:#e8eaf0;--muted:#9aa3b2;
--accent:#5eead4;--bad:#f87171;--warn:#fbbf24;--ok:#4ade80}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:24px 20px 60px}
a{color:var(--accent);text-decoration:none}
h1{font-size:clamp(24px,4vw,34px);letter-spacing:-.02em;margin:.2em 0}
h2{font-size:20px;margin:1.6em 0 .5em}
.lede{color:var(--muted);max-width:70ch}
.banner{background:#1b1a12;border:1px solid #4a3f16;color:#e6d9a8;font-size:13px;padding:11px 15px;border-radius:9px;margin-bottom:24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:20px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}
th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
td.num{text-align:right;font-family:ui-monospace,Menlo,monospace}
.bad{color:var(--bad)}.ok{color:var(--ok)}.warn{color:var(--warn)}.muted{color:var(--muted)}
.inv{background:#2a1a1a;color:#ffd0d0;font-weight:700;padding:2px 7px;border-radius:5px;font-size:12px}
.ad{border:1px dashed var(--line);border-radius:11px;padding:14px 16px;margin:12px 0;background:#141821}
.ad b{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:5px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{background:#141821;border:1px solid var(--line);border-radius:11px;padding:13px}
.stat b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.stat span{font-size:22px;font-family:ui-monospace,Menlo,monospace}
.cta{display:inline-block;background:var(--accent);color:#06231e;font-weight:650;padding:11px 18px;border-radius:9px;margin-top:12px}
footer{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;font-size:12.5px;color:var(--muted)}
`;

const shell = (title, body, depth = 0) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Severity-adjusted complaint rates per 1,000 vehicle-years.">
<link rel="stylesheet" href="${'../'.repeat(depth)}styles.css">
</head><body><div class="wrap">
<div class="banner"><strong>Demo.</strong> Built from <code>data/mock-vehicles.json</code> — illustrative mock data, not real NHTSA records.
Not affiliated with NHTSA or any manufacturer.</div>
${body}
<footer>
  <p><strong>Methodology.</strong> SACR = Σ(severity-weighted complaints) ÷ vehicle-years of exposure × 1,000.
  Severity weights: crash/fire/injury 5, powertrain failure 3, electrical failure 3, minor 1.
  Exposure = sum of annual registrations across the model-year's life (FHWA).</p>
  <p>Raw complaint counts are not comparable across vehicles: a high-volume model will always
  accumulate more complaints than a low-volume one. Normalizing by exposure is the whole point.</p>
</footer>
</div></body></html>`;

/* ── LAYER 3: GENERATE ──────────────────────────────────────────────── */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'v'), { recursive: true });
writeFileSync(resolve(OUT, 'styles.css'), CSS);

const rows = bySacr.map((m) => {
  const inverted = m.rankNormalized <= 3 && m.rankRaw >= 8;
  return `<tr>
    <td class="num">${m.rankNormalized}</td>
    <td><a href="v/${m.id}.html">${m.year} ${esc(m.make)} ${esc(m.model)}</a>
        ${inverted ? '<span class="inv">raw counts rank it #' + m.rankRaw + '</span>' : ''}</td>
    <td class="num ${m.sacr > medianSacr * 2 ? 'bad' : m.sacr < medianSacr * 0.7 ? 'ok' : ''}">${n1(m.sacr)}</td>
    <td class="num muted">${int(m.rawComplaints)}</td>
    <td class="num muted">#${m.rankRaw}</td>
    <td class="num muted">${n1(m.severityIndex)}</td>
  </tr>`;
}).join('');

const indexBody = `
<h1>Severity-adjusted complaint rate, per 1,000 vehicle-years</h1>
<p class="lede">Every other complaints site ranks by <em>raw complaint count</em> — a popularity contest,
because a model with a large fleet always collects more complaints. This ranks by
<strong>exposure-normalized, severity-weighted</strong> rate instead. The two rankings disagree sharply.</p>

<div class="card">
  <table>
    <thead><tr>
      <th style="text-align:right">#</th><th>Vehicle</th>
      <th style="text-align:right">SACR<br>per 1k vy</th>
      <th style="text-align:right">Raw<br>complaints</th>
      <th style="text-align:right">Rank by<br>raw count</th>
      <th style="text-align:right">Severity<br>index</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>

<div class="ad"><b>Sponsor slot</b>Auto insurance / extended warranty — sold direct at $200–2,000/month once the Index is cited.</div>
<div class="ad"><b>Display</b>Ezoic / AdSense. $20–40 RPM in this vertical.</div>

<h2>Why the two rankings disagree</h2>
<p class="lede">The Maserati Ghibli has the <em>fewest</em> raw complaints of any vehicle here — and the
<em>worst</em> normalized rate, because its fleet is roughly 46× smaller than a Civic's. That is not a quirk
of this data; it is the entire reason raw counts are useless for this question.</p>
`;

writeFileSync(resolve(OUT, 'index.html'), shell('The Reliability Index — normalized', indexBody));

for (const m of metrics) {
  const faultRows = Object.entries(m.complaints)
    .sort((a, b) => (WEIGHTS[b[0]] || 1) * b[1] - (WEIGHTS[a[0]] || 1) * a[1])
    .map(([k, n]) => `<tr><td>${FAULT_LABEL[k] || k}</td><td class="num">${int(n)}</td>
      <td class="num">×${WEIGHTS[k] || 1}</td><td class="num">${int(n * (WEIGHTS[k] || 1))}</td></tr>`)
    .join('');

  const body = `
<h1>${m.year} ${esc(m.make)} ${esc(m.model)} — problems and reliability</h1>
<p class="lede">Severity-adjusted complaint rate: <strong>${n1(m.sacr)} per 1,000 vehicle-years</strong>,
ranked <strong>#${m.rankNormalized} of ${metrics.length}</strong> in this cohort. By raw complaint count it
would rank #${m.rankRaw}.</p>

<div class="grid">
  <div class="stat"><b>SACR / 1k vy</b><span class="${m.sacr > medianSacr * 2 ? 'bad' : m.sacr < medianSacr * 0.7 ? 'ok' : ''}">${n1(m.sacr)}</span></div>
  <div class="stat"><b>Raw complaints</b><span>${int(m.rawComplaints)}</span></div>
  <div class="stat"><b>Vehicle-years</b><span>${int(m.vehicleYears)}</span></div>
  <div class="stat"><b>Severity index</b><span>${n1(m.severityIndex)}</span></div>
  <div class="stat"><b>Worst area</b><span style="font-size:15px">${FAULT_LABEL[m.topFault]}</span></div>
</div>

<h2>Complaint mix, severity-weighted</h2>
<div class="card"><table>
  <thead><tr><th>Category</th><th style="text-align:right">Count</th><th style="text-align:right">Weight</th><th style="text-align:right">Weighted</th></tr></thead>
  <tbody>${faultRows}
  <tr><td><strong>Total</strong></td><td class="num"><strong>${int(m.rawComplaints)}</strong></td><td class="num"></td><td class="num"><strong>${int(m.weighted)}</strong></td></tr></tbody>
</table></div>

<div class="ad"><b>Sponsor slot</b>Shown on every one of 10,000 pages. This is the volume rail.</div>

<h2>Track your own vehicle</h2>
<p class="lede">Add this vehicle to your garage for recall alerts and a monthly SACR trend for
<em>your</em> car — the retention layer that turns an anonymous search visit into an owned email.</p>
<a class="cta" href="../index.html">← Back to the Index</a>
`;

  writeFileSync(resolve(OUT, 'v', `${m.id}.html`), shell(`${m.year} ${m.make} ${m.model} problems`, body, 1));
}

/* ── report ─────────────────────────────────────────────────────────── */

console.log(`\ngenerated ${metrics.length + 1} pages -> site/`);
console.log('\nThe inversion (raw-count rank vs normalized rank):\n');
console.log('  vehicle                              SACR   raw   rank(raw)  rank(SACR)   delta');
console.log('  ───────────────────────────────────────────────────────────────────────────────');
for (const m of bySacr) {
  const d = m.rankRaw - m.rankNormalized;
  const flag = Math.abs(d) >= 3 ? (d > 0 ? '  <- UNDER-rated by raw counts' : '  <- OVER-rated by raw counts') : '';
  console.log(
    `  ${(m.year + ' ' + m.make + ' ' + m.model).padEnd(34)} ${n1(m.sacr).padStart(6)} ${int(m.rawComplaints).padStart(6)} ` +
    `${String('#' + m.rankRaw).padStart(10)} ${String('#' + m.rankNormalized).padStart(11)} ${String(d > 0 ? '+' + d : d).padStart(6)}${flag}`
  );
}
const worstRaw = byRaw[0], worstNorm = bySacr[0];
console.log(`\n  Most raw complaints: ${worstRaw.year} ${worstRaw.make} ${worstRaw.model} (${int(worstRaw.rawComplaints)})`);
console.log(`  Worst normalized:    ${worstNorm.year} ${worstNorm.make} ${worstNorm.model} (${n1(worstNorm.sacr)} per 1k vy — on only ${int(worstNorm.rawComplaints)} raw complaints)`);
console.log('\n  -> The headline writes itself, and it exists nowhere else on the internet.\n');

