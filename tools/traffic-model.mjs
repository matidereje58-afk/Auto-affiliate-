#!/usr/bin/env node
/**
 * traffic-model.mjs — does the architecture actually reach 500k-1M views/month?
 *
 * Models monthly pageviews for a programmatic long-tail site as a lognormal
 * distribution over pages. Calibration rationale:
 *
 *   median page = 40 views/month
 *   A long-tail page ("2013 Nissan Altima problems") ranking mid-page-1 for a
 *   query with 1-3k searches/mo converts ~4-10% CTR -> 40-300 visits/mo.
 *   40 is deliberately the *median*, i.e. half of all pages do worse. This is a
 *   conservative calibration, not an optimistic one.
 *
 *   sigma = 1.4 -> the head is long. The best page in a 10,000-page inventory
 *   lands around 15-16k views/mo, which is what a #1-3 ranking on a high-volume
 *   model-year query actually earns.
 *
 * Deterministic (seeded). Run: node tools/traffic-model.mjs
 */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const MEDIAN_VIEWS = 40;
const SIGMA = 1.4;
const MU = Math.log(MEDIAN_VIEWS);
const MEAN_VIEWS = Math.exp(MU + (SIGMA * SIGMA) / 2); // ~106.6 views/mo per mature page

function simulate(nPages, seed = 7) {
  const rand = mulberry32(seed);
  const views = [];
  for (let i = 0; i < nPages; i++) views.push(Math.exp(MU + SIGMA * normal(rand)));
  views.sort((a, b) => b - a);
  const sum = views.reduce((a, b) => a + b, 0);
  const q = (p) => views[Math.min(views.length - 1, Math.floor(p * views.length))];
  return {
    n: nPages, total: sum,
    p50: q(0.5), p90: q(0.1), p99: q(0.01), max: views[0],
    top10Share: views.slice(0, 10).reduce((a, b) => a + b, 0) / sum,
    top100Share: views.slice(0, 100).reduce((a, b) => a + b, 0) / sum,
  };
}

const k = (n) => Math.round(n / 1000).toLocaleString() + 'k';
const money = (n) => '$' + Math.round(n).toLocaleString();
const pct = (n) => (n * 100).toFixed(0) + '%';

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  VIEW MODEL — programmatic long-tail inventory');
console.log('══════════════════════════════════════════════════════════════════');
console.log(`  median page      ${MEDIAN_VIEWS} views/month`);
console.log(`  mean page        ${MEAN_VIEWS.toFixed(1)} views/month (lognormal, sigma=${SIGMA})`);
console.log('');
console.log('  pages      total views/mo    p50 page   p90 page   p99 page   best page');
console.log('  ────────────────────────────────────────────────────────────────────────');
for (const n of [500, 1000, 2500, 5000, 7500, 10000, 15000]) {
  const s = simulate(n);
  console.log(
    `  ${String(n).padStart(6)}   ${k(s.total).padStart(12)}   ` +
    `${Math.round(s.p50).toString().padStart(8)}   ${Math.round(s.p90).toString().padStart(8)}   ` +
    `${Math.round(s.p99).toString().padStart(8)}   ${Math.round(s.max).toString().padStart(9)}`
  );
}
const s5 = simulate(5000), s10 = simulate(10000), s15 = simulate(15000);
console.log('');
console.log(`  concentration: top 10 pages = ${pct(s10.top10Share)} of traffic, top 100 = ${pct(s10.top100Share)}`);
console.log(`  → 5,000 pages ≈ ${k(s5.total)} views/mo · 10,000 ≈ ${k(s10.total)} · 15,000 ≈ ${k(s15.total)}`);

// ── page inventory: what can actually be built from the dataset ──────────────
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  PAGE INVENTORY (derived from free NHTSA + FHWA data)');
console.log('══════════════════════════════════════════════════════════════════');
const inventory = [
  ['Vehicle-year reliability pages (250 models x 25 yrs)', 6250],
  ['Vehicle-year recall & safety pages', 6250],
  ['Component pages (model x common fault)', 3000],
  ['"Years to avoid" pages (model)', 250],
  ['Comparison pages (A vs B)', 500],
  ['Brand & make overview pages', 120],
  ['Methodology / index / editorial', 60],
];
let total = 0;
for (const [label, n] of inventory) { total += n; console.log(`  ${String(n).padStart(6)}   ${label}`); }
console.log(`  ${String(total).padStart(6)}   TOTAL addressable inventory`);
console.log('  → inventory comfortably exceeds the 10,000 pages needed for 1M views/mo');

// ── ramp: indexing lag is real and is why this takes 12-24 months, not 3 ─────
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  TIMELINE (indexing + ranking lag applied)');
console.log('══════════════════════════════════════════════════════════════════');
console.log('  month  pages live  ranking  effective   views/mo   display @$12    @$20    @$30');
console.log('  ─────────────────────────────────────────────────────────────────────────────────');
const ramp = [
  [3, 600, 0.45], [6, 1800, 0.60], [9, 3200, 0.70],
  [12, 5000, 0.78], [15, 7000, 0.82], [18, 9000, 0.85], [24, 12000, 0.88],
];
let hit500 = null, hit1m = null;
for (const [month, pages, rate] of ramp) {
  const eff = pages * rate;
  const views = eff * MEAN_VIEWS;
  if (!hit500 && views >= 500000) hit500 = month;
  if (!hit1m && views >= 1000000) hit1m = month;
  console.log(
    `  ${String(month).padStart(5)}  ${String(pages).padStart(10)}  ${pct(rate).padStart(7)}  ` +
    `${Math.round(eff).toString().padStart(9)}  ${k(views).padStart(9)}  ` +
    `${money(views / 1000 * 12).padStart(11)}  ${money(views / 1000 * 20).padStart(7)}  ${money(views / 1000 * 30).padStart(7)}`
  );
}
console.log('');
console.log(`  → 500k views/mo crossed around month ${hit500 ?? '>24'}; 1M views/mo around month ${hit1m ?? '>24'}`);

// ── revenue stack at the target ──────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  REVENUE STACK AT TARGET');
console.log('══════════════════════════════════════════════════════════════════');
console.log('  rail                                    500k views/mo        1M views/mo');
console.log('  ─────────────────────────────────────────────────────────────────────────');
const rails = [
  ['Display ads @ $12 RPM (entry tier)', (v) => (v / 1000) * 12],
  ['Display ads @ $20 RPM (mid tier)', (v) => (v / 1000) * 20],
  ['Display ads @ $30 RPM (Raptive tier)', (v) => (v / 1000) * 30],
  ['Affiliate / lead-gen @ $0.006/view', (v) => v * 0.006],
  ['Affiliate / lead-gen @ $0.015/view', (v) => v * 0.015],
  ['Index sponsorship (flat)', () => 1000],
];
for (const [label, fn] of rails) {
  console.log(`  ${label.padEnd(40)} ${money(fn(500000)).padStart(11)} ${money(fn(1000000)).padStart(20)}`);
}
const lo = (v) => (v / 1000) * 12 + v * 0.006;
const hi = (v) => (v / 1000) * 30 + v * 0.015 + 1000;
console.log('');
console.log(`  TOTAL realistic range @ 500k views/mo:  ${money(lo(500000))} – ${money(hi(500000))} / month`);
console.log(`  TOTAL realistic range @ 1M views/mo:    ${money(lo(1000000))} – ${money(hi(1000000))} / month`);
console.log('');
console.log('  Ad-network gates crossed along the way:');
console.log('    Mediavine  (50k sessions/mo)  -> ~month 5-6   (RPM roughly doubles)');
console.log('    Raptive    (100k sessions/mo) -> ~month 8-10  (RPM roughly triples vs entry)');
console.log('');
console.log('  NOTE: 500k-1M views/mo is a 12-24 month build, not a 90-day one.');
console.log('  Intermediate milestones still pay: ~$500/mo at 30k views, ~$3k/mo at 150k.');
console.log('');
