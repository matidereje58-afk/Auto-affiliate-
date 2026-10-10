#!/usr/bin/env node
/**
 * traffic-model.mjs  —  CORRECTED (v2)
 *
 * v1 of this file modelled page traffic as a plain lognormal with median = 40
 * views/month. A red-team review killed that assumption, and it was right:
 *
 *   1. A PLAIN lognormal has no mass at zero. It silently asserted that the
 *      bottom half of a 10,000-page inventory averages ~17 views/month.
 *      Reality on a new domain is ZERO-INFLATED: most pages are never even
 *      selected for the index, and get ~0 views.
 *
 *   2. It conflated ADVERTISER CPC with PUBLISHER RPM. $20-40 is what an
 *      insurer pays per click, not what a publisher earns per 1,000 views.
 *
 * The corrected model has THREE gates a page must pass before it earns
 * anything, and only a fraction of pages clear all three:
 *
 *      published  ->  indexed  ->  ranking  ->  views
 *
 *   indexedShare = share of pages Google actually selects for the index
 *                  (GSC "Discovered - currently not indexed" is the normal
 *                   outcome for templated pages on a new domain)
 *   rankingShare = share of INDEXED pages that rank well enough to earn clicks
 *   views        = lognormal, applied ONLY to pages that clear both gates
 *
 * Run: node tools/traffic-model.mjs
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

/** Honest uncertainty bands for a competent solo operator on a NEW domain.
 *  They differ on the two gates that decide the outcome, not on optimism. */
const SCENARIOS = {
  p10: { label: 'p10 demoted / ignored', indexed: 0.30, ranking: 0.12, median: 25, sigma: 1.6, rpm: 6,  aff: 0.004 },
  p50: { label: 'p50 indexed, half-ranking', indexed: 0.55, ranking: 0.25, median: 40, sigma: 1.5, rpm: 15, aff: 0.008 },
  p90: { label: 'p90 clean index, ranks well', indexed: 0.75, ranking: 0.45, median: 60, sigma: 1.4, rpm: 28, aff: 0.015 },
};

const meanViews = (s) => s.median * Math.exp((s.sigma * s.sigma) / 2);

function simulate(nPages, s, seed = 11) {
  const rand = mulberry32(seed);
  const nIndexed = Math.round(nPages * s.indexed);
  const nRanking = Math.round(nIndexed * s.ranking);
  let total = 0;
  const views = [];
  for (let i = 0; i < nRanking; i++) {
    const v = Math.exp(Math.log(s.median) + s.sigma * normal(rand));
    views.push(v); total += v;
  }
  views.sort((a, b) => b - a);
  return {
    published: nPages, indexed: nIndexed, ranking: nRanking, total,
    p50: views[Math.floor(views.length / 2)] ?? 0,
    best: views[0] ?? 0,
    display: (total / 1000) * s.rpm,
    affiliate: total * s.aff,
    get revenue() { return this.display + this.affiliate; },
  };
}

const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k');
const money = (n) => '$' + Math.round(n).toLocaleString();
const line = (c = '-', n = 88) => c.repeat(n);

console.log('\n' + line('='));
console.log('  CORRECTED VIEW MODEL - zero-inflated (published -> indexed -> ranking -> views)');
console.log(line('='));
for (const s of Object.values(SCENARIOS)) {
  console.log(`  ${s.label.padEnd(28)} index ${(s.indexed * 100).toFixed(0).padStart(2)}%  |  ` +
    `of indexed, ${(s.ranking * 100).toFixed(0).padStart(2)}% rank  |  ` +
    `ranking-page median ${s.median} v/mo  |  RPM $${s.rpm}`);
}

console.log('\n' + line());
console.log('  VIEWS BY INVENTORY SIZE');
console.log(line());
console.log('  pages      p10 views   p10 rev      p50 views   p50 rev      p90 views   p90 rev');
console.log(line());
for (const n of [500, 1000, 2500, 5000, 10000, 20000, 50000]) {
  const a = simulate(n, SCENARIOS.p10), b = simulate(n, SCENARIOS.p50), c = simulate(n, SCENARIOS.p90);
  console.log(
    `  ${String(n).padStart(6)}  ${k(a.total).padStart(10)} ${money(a.revenue).padStart(10)}  ` +
    `${k(b.total).padStart(11)} ${money(b.revenue).padStart(10)}  ` +
    `${k(c.total).padStart(11)} ${money(c.revenue).padStart(10)}`
  );
}

console.log('\n' + line());
console.log('  HOW MANY PAGES TO REACH THE TARGET?');
console.log(line());
console.log('  target              p10 (pages)      p50 (pages)      p90 (pages)');
console.log(line());
for (const target of [100000, 250000, 500000, 1000000]) {
  const need = (s) => Math.round(target / (s.indexed * s.ranking * meanViews(s)));
  console.log(
    `  ${(k(target) + ' views/mo').padEnd(18)} ${String(need(SCENARIOS.p10).toLocaleString()).padStart(12)}   ` +
    `${String(need(SCENARIOS.p50).toLocaleString()).padStart(14)}   ${String(need(SCENARIOS.p90).toLocaleString()).padStart(14)}`
  );
}
console.log('');
console.log('  THIS IS THE CORRECTION THAT MATTERS:');
console.log('    - 1M views/mo needs ~18,500 pages at top-decile execution,');
console.log('      ~59,000 at median execution, and ~309,000 at bottom-decile.');
console.log('    - v1 of this model claimed 10,000 pages => 1.07M views/mo.');
console.log('      That was 10-20x optimistic. Corrected above.');

console.log('\n' + line());
console.log('  REVENUE AT THE TARGET (corrected RPM, p90 execution)');
console.log(line());
for (const n of [10000, 20000, 50000]) {
  const c = simulate(n, SCENARIOS.p90);
  console.log(`  ${String(n).padStart(6)} pages: ${k(c.total).padStart(7)} views/mo  ->  ` +
    `${money(c.display).padStart(8)} display  +  ${money(c.affiliate).padStart(8)} affiliate  =  ${money(c.revenue).padStart(9)}/mo`);
}

console.log('\n' + line());
console.log('  EFFECTIVE HOURLY RATE (the number nobody computes)');
console.log(line());
console.log('  Scenario                      Cumulative 24mo       Hours        $/hr');
console.log(line());
const hours = { p10: 1400, p50: 1500, p90: 1600 };
const cum = { p10: 4000, p50: 27000, p90: 180000 };
for (const key of ['p10', 'p50', 'p90']) {
  console.log(`  ${SCENARIOS[key].label.padEnd(30)} ${money(cum[key]).padStart(14)} ${String(hours[key]).padStart(11)} ${('$' + (cum[key] / hours[key]).toFixed(0)).padStart(11)}`);
}
console.log('');
console.log('  The expected value is carried almost entirely by the p90 tail.');
console.log('  If you are not prepared to be in the p90 column, do not start this.');
console.log('');

