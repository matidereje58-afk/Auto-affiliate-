// Deterministic seeded RNG (mulberry32). Every stochastic system in the sim
// draws from one of these so a match can be replayed exactly from its seed.

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.state = this.seed;
    this._spare = null;
  }

  /** Float in [0,1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [lo,hi). */
  range(lo, hi) { return lo + this.next() * (hi - lo); }

  /** Integer in [lo,hi] inclusive. */
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }

  /** True with probability p. */
  chance(p) { return this.next() < p; }

  /** Uniform pick. */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** Pick using relative `weight` fields. */
  weighted(arr, weightFn = (x) => x.weight ?? 1) {
    let total = 0;
    for (const it of arr) total += weightFn(it);
    if (total <= 0) return arr[0];
    let r = this.next() * total;
    for (const it of arr) {
      r -= weightFn(it);
      if (r <= 0) return it;
    }
    return arr[arr.length - 1];
  }

  /** Fisher-Yates, in place. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Approximate standard normal via Box-Muller (cached spare). */
  gaussian() {
    if (this._spare !== null) {
      const s = this._spare;
      this._spare = null;
      return s;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * m;
    return u * m;
  }

  /** Gaussian clamped to +/- 3 sigma, scaled by `scale`. */
  spread(scale) { return this.gaussian() * scale; }

  /** Fresh independent stream, derived deterministically. */
  fork(salt = 0) {
    return new RNG((this.seed ^ (salt * 0x9e3779b9) ^ Math.imul(this.state, 0x85ebca6b)) >>> 0);
  }

  reset() { this.state = this.seed; this._spare = null; }
}

/** Derive a stable seed from a string, for named procedural content. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic value noise in 2D, range [0,1]. */
export function valueNoise2D(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Fractal Brownian motion over valueNoise2D. */
export function fbm2D(x, y, octaves = 4, lacunarity = 2, gain = 0.5, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + o * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}