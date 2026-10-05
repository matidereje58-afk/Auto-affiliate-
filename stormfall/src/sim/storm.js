// The storm: a shrinking safe circle with escalating damage.

import { clamp, lerp, dist2D, closestPointOnCircle } from './math.js';
import { ISLAND_RADIUS } from './terrain.js';

export const STORM_PHASES = [
  { wait: 42, shrink: 58, frac: 0.66, dps: 1.0 },
  { wait: 42, shrink: 52, frac: 0.63, dps: 1.8 },
  { wait: 38, shrink: 46, frac: 0.61, dps: 2.6 },
  { wait: 34, shrink: 42, frac: 0.59, dps: 3.5 },
  { wait: 30, shrink: 38, frac: 0.57, dps: 4.6 },
  { wait: 26, shrink: 34, frac: 0.55, dps: 6.0 },
  { wait: 22, shrink: 30, frac: 0.53, dps: 7.6 },
  { wait: 20, shrink: 26, frac: 0.50, dps: 9.5 },
  { wait: 18, shrink: 30, frac: 0.28, dps: 13.0 },
];

export const STORM_STATE_DONE = 'done';

export const STORM_STATE = {
  IDLE: 'idle',
  WAIT: 'wait',
  SHRINK: 'shrink',
  DONE: STORM_STATE_DONE,
};

export class Storm {
  constructor(rng, { startRadius = ISLAND_RADIUS * 0.92 } = {}) {
    this.rng = rng;
    this.startRadius = startRadius;

    this.cx = 0;
    this.cz = 0;
    this.r = startRadius;
    this.from = { cx: 0, cz: 0, r: startRadius };
    this.to = { cx: 0, cz: 0, r: startRadius };

    this.phase = 0;
    this.state = STORM_STATE.WAIT;
    this.timer = 0;
    this.shrinkTotal = 1;
    this.elapsed = 0;
    this.dps = 0;
    this.justAdvanced = false;
    // Slow drift applied during the final collapse.
    this.driftX = this.rng.range(-0.35, 0.35);
    this.driftZ = this.rng.range(-0.35, 0.35);

    this._pickNextCircle();
    // Hold at the starting circle for the first phase's wait time.
    this.timer = STORM_PHASES[0].wait;
  }

  get total() { return STORM_PHASES.length; }
  get targetRadius() { return this.to.r; }

  /**
   * Choose the next circle. The centre stays inside the current circle so every
   * player always has somewhere to run to.
   */
  _pickNextCircle() {
    const p = STORM_PHASES[Math.min(this.phase, STORM_PHASES.length - 1)];
    const nextR = Math.max(6, this.r * p.frac);
    const maxOffset = Math.max(0, this.r - nextR) * 0.82;
    const a = this.rng.range(0, Math.PI * 2);
    const d = Math.sqrt(this.rng.next()) * maxOffset;

    this.from = { cx: this.cx, cz: this.cz, r: this.r };
    this.to = { cx: this.cx + Math.cos(a) * d, cz: this.cz + Math.sin(a) * d, r: nextR };
  }

  update(dt) {
    this.justAdvanced = false;

    // Final collapse. Once the phase table is exhausted the circle keeps closing
    // on a slow burn; without this the last survivors can stand in a safe pocket
    // forever and the match never resolves.
    if (this.state === STORM_STATE.DONE) {
      this.elapsed += dt;
      this.dps = STORM_PHASES[STORM_PHASES.length - 1].dps;
      this.r = Math.max(0.6, this.r * Math.exp(-dt * 0.055));
      this.cx += this.driftX * dt;
      this.cz += this.driftZ * dt;
      return;
    }

    this.elapsed += dt;
    this.timer -= dt;

    if (this.state === STORM_STATE.WAIT) {
      if (this.timer <= 0) {
        this.state = STORM_STATE.SHRINK;
        this.timer = STORM_PHASES[Math.min(this.phase, STORM_PHASES.length - 1)].shrink;
        this.shrinkTotal = this.timer;
        this.justAdvanced = true;
      }
      return;
    }

    if (this.state === STORM_STATE.SHRINK) {
      const total = this.shrinkTotal || 1;
      const t = clamp(1 - this.timer / total, 0, 1);
      this.cx = lerp(this.from.cx, this.to.cx, t);
      this.cz = lerp(this.from.cz, this.to.cz, t);
      this.r = lerp(this.from.r, this.to.r, t);
      if (this.timer <= 0) {
        this.cx = this.to.cx;
        this.cz = this.to.cz;
        this.r = this.to.r;
        this.phase++;
        if (this.phase >= STORM_PHASES.length) {
          this.state = STORM_STATE.DONE;
          this.dps = STORM_PHASES[STORM_PHASES.length - 1].dps;
          return;
        }
        this._pickNextCircle();
        this.state = STORM_STATE.WAIT;
        this.timer = STORM_PHASES[this.phase].wait;
        this.justAdvanced = true;
      }
    }
  }

  currentDps() {
    if (this.state === STORM_STATE.DONE) {
      return STORM_PHASES[STORM_PHASES.length - 1].dps;
    }
    return STORM_PHASES[Math.min(this.phase, STORM_PHASES.length - 1)].dps;
  }

  isSafe(x, z) { return dist2D(x, z, this.cx, this.cz) <= this.r; }

  distanceOutside(x, z) {
    const d = dist2D(x, z, this.cx, this.cz);
    return d <= this.r ? 0 : d - this.r;
  }

  nearestWallPoint(x, z) { return closestPointOnCircle(x, z, this.cx, this.cz, this.r); }

  hud() {
    const nextIdx = Math.min(
      this.phase + (this.state === STORM_STATE.WAIT ? 1 : 0),
      STORM_PHASES.length - 1,
    );
    const next = STORM_PHASES[nextIdx];
    return {
      phase: this.phase,
      total: STORM_PHASES.length,
      state: this.state,
      timer: Math.max(0, this.timer),
      shrinking: this.state === STORM_STATE.SHRINK,
      done: this.state === STORM_STATE.DONE,
      dps: this.currentDps(),
      radius: this.r,
      nextRadius: this.to.r,
      label: this.state === STORM_STATE.SHRINK ? 'STORM CLOSING' : 'STORM CLOSES IN',
      nextDps: next ? next.dps : 0,
    };
  }
}
