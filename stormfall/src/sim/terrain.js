// Procedural island heightfield. Pure logic - renderers build a mesh from
// `heights`, gameplay queries it via `heightAt`.

import { clamp, smoothstep, lerp, dist2D } from './math.js';
import { fbm2D, valueNoise2D } from './rng.js';

export const ISLAND_RADIUS = 500;   // playable radius from island centre
export const HALF_SIZE = 512;       // grid spans [-512, 512] in X and Z
export const WATER_LEVEL = 0;       // y of sea level
export const BEACH_LEVEL = 3.5;     // sand band above water
export const SEA_FLOOR = -26;

/**
 * Points of interest. These flatten the terrain locally and seed loot density,
 * landmark geometry and bot drop preferences. Names are original.
 */
export const POIS = [
  { name: 'Dustbloom',      x:   0, z:    0, r: 58, hub: true,  loot: 1.5 },
  { name: 'Ironworks',      x: -168, z: -140, r: 46, hub: true,  loot: 1.35 },
  { name: 'Saltmarsh',      x:  190, z: -110, r: 44, hub: true,  loot: 1.3 },
  { name: 'Cinderworks',    x:  210, z:  170, r: 42, hub: false, loot: 1.25 },
  { name: 'Pinehaven',      x: -200, z:  160, r: 48, hub: false, loot: 1.2 },
  { name: 'The Vault',      x:  -40, z:  250, r: 38, hub: true,  loot: 1.6 },
  { name: 'Crater Camp',    x:  120, z:  -30, r: 34, hub: false, loot: 1.15 },
  { name: 'Whisper Dunes',  x: -280, z:   20, r: 40, hub: false, loot: 1.1 },
  { name: 'Glimmer Row',    x:  -95, z:  -60, r: 30, hub: false, loot: 1.2 },
  { name: 'Redrock Bluff',  x:  300, z:  -20, r: 36, hub: false, loot: 1.15 },
  { name: 'Northwatch',     x:   30, z: -300, r: 42, hub: false, loot: 1.25 },
  { name: 'Tidal Steps',    x: -320, z: -230, r: 34, hub: false, loot: 1.05 },
];

/** Base terrain elevation before POI flattening, in world units. */
function rawHeight(x, z, seed) {
  const r = dist2D(x, z, 0, 0) / ISLAND_RADIUS;

  // Radial island profile. Solid inland, falling to open sea past the coast.
  // This is a single monotone falloff - an inner ramp here would flood the
  // middle of the map instead of carving a shoreline.
  const coast = smoothstep(clamp((1.00 - r) / 0.11, 0, 1));

  // Ridged + billowy noise blended for interesting silhouettes.
  const nx = x * 0.0052, nz = z * 0.0052;
  const hills = fbm2D(nx, nz, 5, 2.0, 0.5, seed);
  const ridge = 1 - Math.abs(fbm2D(nx * 1.7 + 31.4, nz * 1.7 - 11.2, 3, 2.1, 0.5, seed + 7) * 2 - 1);
  const detail = valueNoise2D(x * 0.028, z * 0.028, seed + 99);

  // Relief grows toward the rim so the centre stays contestable and open.
  const rimBoost = 0.42 + 0.58 * smoothstep(clamp((r - 0.28) / 0.58, 0, 1));
  const relief = hills * 15 + ridge * ridge * 21 + detail * 2.6;

  // Floor the interior so noise troughs inland never dip below sea level.
  const interior = Math.max(relief * rimBoost, 6.0);

  // Blend down to the sea bed offshore. This is what creates the ocean.
  let h = lerp(SEA_FLOOR, interior, coast);

  // Beach band: flatten the coastal strip toward just above the waterline.
  if (h > SEA_FLOOR + 4 && h < BEACH_LEVEL + 7) {
    const w = 1 - Math.abs(h - BEACH_LEVEL) / 8;
    h = lerp(h, BEACH_LEVEL * 0.5, clamp(w, 0, 1) * 0.5);
  }
  return h;
}

/** Height contribution from POI flattening, applied after raw terrain. */
function poiFlatten(x, z, h, seed) {
  for (const p of POIS) {
    const d = dist2D(x, z, p.x, p.z);
    if (d > p.r * 1.9) continue;
    // Smooth falloff from the POI centre out to ~1.9x its radius.
    const w = 1 - smoothstep(clamp((d - p.r * 0.55) / (p.r * 1.35), 0, 1));
    if (w <= 0) continue;
    // Deterministic per-POI plateau height.
    const base = 6 + valueNoise2D(p.x * 0.01 + 500, p.z * 0.01 + 500, seed + 3) * 16;
    h = lerp(h, base, w * 0.86);
  }
  return h;
}

export class Terrain {
  /**
   * @param {object} opts
   * @param {number} opts.seed   procedural seed
   * @param {number} opts.res    samples per axis (heights is res*res)
   * @param {number} opts.half   half-extent in world units
   */
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
        h = Math.round(h * 4) / 4; // quantise to keep flats clean for building
        this.heights[j * res + i] = h;
        if (h < this.minH) this.minH = h;
        if (h > this.maxH) this.maxH = h;
      }
    }
  }

  /** Bilinear height sample at world (x,z). Clamps outside the island. */
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

  /** Upward surface normal via central differences. */
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

  /** Slope in radians from vertical. 0 = flat, PI/2 = vertical wall. */
  slopeAt(x, z, eps = 1.2) {
    const n = this.normalAt(x, z, eps);
    return Math.acos(clamp(n.y, -1, 1));
  }

  isWater(x, z) { return this.heightAt(x, z) < WATER_LEVEL; }

  /** Water surface height, accounting for the character floating at the top. */
  waterSurface(x, z) { return WATER_LEVEL; }

  inBounds(x, z, margin = 0) {
    const lim = HALF_SIZE - margin;
    return x > -lim && x < lim && z > -lim && z < lim;
  }

  /** Distance from the island centre, used for out-of-bounds and bot logic. */
  centreDist(x, z) { return dist2D(x, z, 0, 0); }

  /** Name of the POI containing (x,z), or null. */
  poiAt(x, z) {
    for (const p of POIS) if (dist2D(x, z, p.x, p.z) < p.r) return p;
    return null;
  }

  /**
   * Flattened, buildable pad height at a location. Used so structures in a POI
   * sit on a level footing.
   */
  padHeight(x, z) { return this.heightAt(x, z); }

  /**
   * Water depth at (x,z); 0 on land. Drives swim speed and damage.
   */
  waterDepth(x, z) { return Math.max(0, WATER_LEVEL - this.heightAt(x, z)); }
}