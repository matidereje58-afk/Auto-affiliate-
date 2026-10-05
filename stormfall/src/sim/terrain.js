// Procedural island heightfield. Pure logic - renderers build a mesh from
// `heights`, gameplay queries it via `heightAt`.

import { clamp, smoothstep, lerp, dist2D } from './math.js';
import { fbm2D, valueNoise2D } from './rng.js';

export const ISLAND_RADIUS = 500;
export const HALF_SIZE = 512;
export const WATER_LEVEL = 0;
export const BEACH_LEVEL = 3.5;
export const SEA_FLOOR = -26;

/** Points of interest. These flatten terrain locally and seed loot density. */
export const POIS = [
  { name: 'Dustbloom',     x:   0, z:    0, r: 58, hub: true,  loot: 1.5 },
  { name: 'Ironworks',     x: -168, z: -140, r: 46, hub: true,  loot: 1.35 },
  { name: 'Saltmarsh',     x:  190, z: -110, r: 44, hub: true,  loot: 1.3 },
  { name: 'Cinderworks',   x:  210, z:  170, r: 42, hub: false, loot: 1.25 },
  { name: 'Pinehaven',     x: -200, z:  160, r: 48, hub: false, loot: 1.2 },
  { name: 'The Vault',     x:  -40, z:  250, r: 38, hub: true,  loot: 1.6 },
  { name: 'Crater Camp',   x:  120, z:  -30, r: 34, hub: false, loot: 1.15 },
  { name: 'Whisper Dunes', x: -280, z:   20, r: 40, hub: false, loot: 1.1 },
  { name: 'Glimmer Row',   x:  -95, z:  -60, r: 30, hub: false, loot: 1.2 },
  { name: 'Redrock Bluff', x:  300, z:  -20, r: 36, hub: false, loot: 1.15 },
  { name: 'Northwatch',    x:   30, z: -300, r: 42, hub: false, loot: 1.25 },
  { name: 'Tidal Steps',   x: -320, z: -230, r: 34, hub: false, loot: 1.05 },
];

/**
 * Four regions with distinct character so the map is not a uniform dome.
 * 0 grass plains, 1 highlands, 2 wetlands, 3 badlands.
 */
export const REGIONS = [
  { name: 'The Reach', id: 0, colour: 0x4e7c34 },
  { name: 'Highlands', id: 1, colour: 0x5f7042 },
  { name: 'Saltmarsh', id: 2, colour: 0x3f6b45 },
  { name: 'Badlands',  id: 3, colour: 0x7d6c45 },
];

const REGION_BLEND = 0.14;

/** Smooth biome weights at (x,z). Weights sum to 1. */
export function regionWeights(x, z) {
  const r = Math.hypot(x, z);
  const sector = Math.atan2(z, x) / (Math.PI * 2);
  const w = [0, 0, 0, 0];
  const band = REGION_BLEND * 2.2;
  for (let i = 0; i < 4; i++) {
    const centre = (i - 0.5) / 4 + 0.06;
    let d = Math.abs(sector - centre);
    d = Math.min(d, 1 - d);
    w[i] = Math.max(0, 1 - d / band);
  }
  const sum = w[0] + w[1] + w[2] + w[3];
  if (sum < 1e-6) { w[0] = 1; return { w, dominant: 0, r }; }
  for (let i = 0; i < 4; i++) w[i] /= sum;
  let dom = 0;
  for (let i = 1; i < 4; i++) if (w[i] > w[dom]) dom = i;
  return { w, dominant: dom, r };
}

/** Base terrain elevation before POI flattening, in world units. */
function rawHeight(x, z, seed) {
  const r = dist2D(x, z, 0, 0) / ISLAND_RADIUS;

  // Solid inland, falling to open sea past the coast. This is a single monotone
  // falloff - an inner ramp here would flood the middle of the map instead of
  // carving a shoreline.
  const coast = smoothstep(clamp((1.00 - r) / 0.11, 0, 1));

  const nx = x * 0.0052, nz = z * 0.0052;
  const hills = fbm2D(nx, nz, 5, 2.0, 0.5, seed);
  const ridge = 1 - Math.abs(fbm2D(nx * 1.7 + 31.4, nz * 1.7 - 11.2, 3, 2.1, 0.5, seed + 7) * 2 - 1);
  const detail = valueNoise2D(x * 0.028, z * 0.028, seed + 99);

  const { w: rw } = regionWeights(x, z);
  const [plains, highland, wetland, badland] = rw;

  const relief =
    plains   * (hills * 11 + ridge * ridge * 9 + detail * 2.2) +
    highland * (hills * 17 + ridge * ridge * 33 + detail * 3.4) +
    wetland  * (hills * 4 + detail * 1.2) +
    badland  * (hills * 13 + ridge * ridge * 20 + detail * 5.5);

  // Terracing in the badlands produces mesa steps and cliff faces.
  const terraced = Math.round(relief / 7.5) * 7.5;
  const badlandRelief = lerp(relief, terraced, 0.72 * badland);

  const rimBoost = 0.55 + 0.45 * smoothstep(clamp((r - 0.34) / 0.60, 0, 1));
  const marsh = -3.0 * wetland;

  // Floor the interior so noise troughs inland never dip below sea level.
  const interior = Math.max(badlandRelief * rimBoost + marsh, 6.4);

  // Sea bed keeps some relief so the water reads as depth, not a flat plate.
  const seaBed = SEA_FLOOR + valueNoise2D(x * 0.013, z * 0.013, seed + 41) * 13;
  let h = lerp(seaBed, interior, coast);

  // Beach band: flatten the coastal strip toward just above the waterline.
  const beachT = 1 - clamp(Math.abs(h - BEACH_LEVEL) / 7.5, 0, 1);
  if (beachT > 0) h = lerp(h, BEACH_LEVEL * 0.42, beachT * beachT * 0.78);

  return h;
}

/** Height contribution from POI flattening, applied after raw terrain. */
function poiFlatten(x, z, h, seed) {
  for (const p of POIS) {
    const d = dist2D(x, z, p.x, p.z);
    if (d > p.r * 1.9) continue;
    const w = 1 - smoothstep(clamp((d - p.r * 0.55) / (p.r * 1.35), 0, 1));
    if (w <= 0) continue;
    const base = 6 + valueNoise2D(p.x * 0.01 + 500, p.z * 0.01 + 500, seed + 3) * 16;
    h = lerp(h, base, w * 0.86);
  }
  return h;
}

export class Terrain {
  constructor({ seed = 1337, res = 256, half = HALF_SIZE } = {}) {
    this.seed = seed;
    this.res = res;
    this.half = half;
    this.step = (half * 2) / (res - 1);
    this.heights = new Float32Array(res * res);
    this.minH = Infinity;
    this.maxH = -Infinity;
    this.generate();
  }

  generate() {
    const { res, half, seed } = this;
    for (let j = 0; j < res; j++) {
      const z = -half + j * this.step;
      for (let i = 0; i < res; i++) {
        const x = -half + i * this.step;
        let h = rawHeight(x, z, seed);
        h = poiFlatten(x, z, h, seed);
        h = Math.round(h * 4) / 4;   // quantise so flats are clean for building
        this.heights[j * res + i] = h;
        if (h < this.minH) this.minH = h;
        if (h > this.maxH) this.maxH = h;
      }
    }
    this._computeWaterDistance();
  }

  /**
   * Distance (world units) from each cell to the nearest water cell, via a
   * two-pass chamfer sweep. Lets the renderer and gameplay tell a coastal beach
   * from an inland basin that merely happens to sit low.
   */
  _computeWaterDistance() {
    const { res, step } = this;
    const BIG = 1e9;
    const d = new Float32Array(res * res);
    let waterCells = 0;

    for (let k = 0; k < d.length; k++) {
      if (this.heights[k] < WATER_LEVEL) { d[k] = 0; waterCells++; }
      else d[k] = BIG;
    }
    if (waterCells === 0) { this.waterDist = d; return; }

    const D1 = step;
    const D2 = step * Math.SQRT2;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        let v = d[k];
        if (v === 0) continue;
        if (j > 0) {
          if (i > 0) v = Math.min(v, d[k - res - 1] + D2);
          v = Math.min(v, d[k - res] + D1);
          if (i < res - 1) v = Math.min(v, d[k - res + 1] + D2);
        }
        if (i > 0) v = Math.min(v, d[k - 1] + D1);
        d[k] = v;
      }
    }
    for (let j = res - 1; j >= 0; j--) {
      for (let i = res - 1; i >= 0; i--) {
        const k = j * res + i;
        let v = d[k];
        if (v === 0) continue;
        if (j < res - 1) {
          if (i < res - 1) v = Math.min(v, d[k + res + 1] + D2);
          v = Math.min(v, d[k + res] + D1);
          if (i > 0) v = Math.min(v, d[k + res - 1] + D2);
        }
        if (i < res - 1) v = Math.min(v, d[k + 1] + D1);
        d[k] = v;
      }
    }
    this.waterDist = d;
  }

  /** Bilinear height sample at world (x,z). */
  heightAt(x, z) {
    const { res, half, step } = this;
    const fx = (x + half) / step;
    const fz = (z + half) / step;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > res - 2) i = res - 2;
    if (j < 0) j = 0; else if (j > res - 2) j = res - 2;
    const tx = clamp(fx - i, 0, 1);
    const tz = clamp(fz - j, 0, 1);
    const h = this.heights;
    const h00 = h[j * res + i];
    const h10 = h[j * res + i + 1];
    const h01 = h[(j + 1) * res + i];
    const h11 = h[(j + 1) * res + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x, z, eps = 1.2) {
    const hl = this.heightAt(x - eps, z);
    const hr = this.heightAt(x + eps, z);
    const hd = this.heightAt(x, z - eps);
    const hu = this.heightAt(x, z + eps);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  slopeAt(x, z, eps = 1.2) {
    return Math.acos(clamp(this.normalAt(x, z, eps).y, -1, 1));
  }

  isWater(x, z) { return this.heightAt(x, z) < WATER_LEVEL; }

  inBounds(x, z, margin = 0) {
    const lim = HALF_SIZE - margin;
    return x > -lim && x < lim && z > -lim && z < lim;
  }

  centreDist(x, z) { return dist2D(x, z, 0, 0); }

  poiAt(x, z) {
    for (const p of POIS) if (dist2D(x, z, p.x, p.z) < p.r) return p;
    return null;
  }

  /** Distance to the nearest water, in world units. */
  waterDistanceAt(x, z) {
    const d = this.waterDist;
    if (!d) return 0;
    const { res, half, step } = this;
    const fx = clamp((x + half) / step, 0, res - 1.001);
    const fz = clamp((z + half) / step, 0, res - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = d[j * res + i];
    const b = d[j * res + i + 1];
    const c = d[(j + 1) * res + i];
    const e = d[(j + 1) * res + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, e, tx), tz);
  }

  waterDepth(x, z) { return Math.max(0, WATER_LEVEL - this.heightAt(x, z)); }
}
