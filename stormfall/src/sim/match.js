// Match lifecycle: dropship run, freefall, glide, live phase, results.

export const MATCH_STATE = {
  LOBBY: 'lobby',
  DROPSHIP: 'dropship',
  FREEFALL: 'freefall',
  GLIDING: 'gliding',
  PLAYING: 'playing',
  ENDED: 'ended',
};

/** Altitude thresholds for the freefall -> glide -> land transitions. */
export const DROP = {
  GLIDE_MIN_HEIGHT: 78,
  FREEFALL_TERMINAL: 52,
  FALL_ACCEL: 26,
  FREEFALL_SPEED: 9,
  GLIDE_DESCENT: 11.5,
  GLIDE_SPEED: 15.5,
  LAND_HEIGHT: 1.2,
};

/**
 * Fall damage for a given drop height. An open glider removes it entirely,
 * which is what makes deploying on time the skill the mechanic rewards.
 */
export function dropDamage(distance, glided) {
  if (glided) return 0;
  const SAFE = 11;
  if (distance <= SAFE) return 0;
  return (distance - SAFE) * 5.4;
}

export class Match {
  constructor({ totalPlayers }) {
    this.totalPlayers = totalPlayers;
    this.state = MATCH_STATE.LOBBY;
    this.time = 0;
    this.stateTime = 0;
    this.eliminationOrder = [];
    this.winner = null;
    this.aliveTotal = 0;
    this.events = [];

    // Dropship path: a long chord straight across the island.
    this.busT = 0;
    this.busSpeed = 24;
    this.busFrom = { x: -560, z: -250 };
    this.busTo = { x: 560, z: 260 };
    this.busY = 320;
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.emit('state', { state: s });
  }

  /**
   * Register an elimination and assign the placement.
   *
   * Placement is the number of players still alive *including* the one who just
   * died, so the first death in a 100 lobby is 100th and the winner is 1st.
   *
   * Idempotent: damage can kill an actor from several code paths, so this is
   * driven from a single sweep rather than from each source.
   */
  eliminate(actor) {
    if (actor.placement !== null && actor.placement !== undefined) {
      return actor.placement;
    }
    actor.placement = this.aliveTotal;
    this.aliveTotal = Math.max(0, this.aliveTotal - 1);
    this.eliminationOrder.push({
      id: actor.id,
      name: actor.name,
      by: actor.eliminatedBy,
      at: this.time,
      placement: actor.placement,
      storm: false,
    });
    return actor.placement;
  }

  static place(n) { return `#${n}`; }

  hud() {
    return { state: this.state, time: this.time, alive: this.aliveTotal, total: this.totalPlayers };
  }

  snapshot() {
    return {
      state: this.state, time: this.time, alive: this.aliveTotal,
      total: this.totalPlayers, winner: this.winner,
      eliminations: this.eliminationOrder.slice(-8),
    };
  }
}

/** Dropship position at normalised route parameter t in [0,1]. */
export function busPos(match, t) {
  return {
    x: match.busFrom.x + (match.busTo.x - match.busFrom.x) * t,
    y: match.busY,
    z: match.busFrom.z + (match.busTo.z - match.busFrom.z) * t,
  };
}

export function busRouteLength(match) {
  return Math.hypot(match.busTo.x - match.busFrom.x, match.busTo.z - match.busFrom.z);
}

/**
 * Route parameter at which the bus is closest to a world point. Used so an actor
 * leaves the dropship when it is actually over the spot they want to land on.
 */
export function routeTFor(match, target) {
  const dx = match.busTo.x - match.busFrom.x;
  const dz = match.busTo.z - match.busFrom.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 0;
  const t = ((target.x - match.busFrom.x) * dx + (target.z - match.busFrom.z) * dz) / len2;
  return Math.max(0, Math.min(1, t));
}
