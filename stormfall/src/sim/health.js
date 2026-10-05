// Vitals (health / shield), damage resolution and consumables.

import { clamp } from './math.js';

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const SHIELD_ABSORB = 1.0;

export const CONSUMABLES = {
  bandage: {
    id: 'bandage', name: 'Bandage', stack: 12, useTime: 2.0,
    healPerSec: 8, shieldPerSec: 0, colour: 0xd8d8d8,
  },
  medkit: {
    id: 'medkit', name: 'Med Kit', stack: 6, useTime: 5.0,
    healPerSec: 22, shieldPerSec: 0, colour: 0xe05b5b,
  },
  smallShield: {
    id: 'smallShield', name: 'Small Shield', stack: 8, useTime: 2.5,
    healPerSec: 0, shieldPerSec: 11, colour: 0x5aa8e0,
  },
  bigShield: {
    id: 'bigShield', name: 'Shield Potion', stack: 4, useTime: 3.0,
    healPerSec: 0, shieldPerSec: 18, colour: 0x3f7fd0,
  },
  jug: {
    id: 'jug', name: 'Chug Jug', stack: 2, useTime: 15.0,
    healPerSec: 0, shieldPerSec: 100 / 15, colour: 0x2f63b8,
  },
};

export const CONSUMABLE_IDS = Object.keys(CONSUMABLES);

/**
 * Applies damage to a target, shield first. Overflow above max shield spills
 * into health.
 */
export function applyDamage(target, amount, { headshot = false, direction = null } = {}) {
  if (!target.alive) {
    return { dealt: 0, toShield: 0, toHealth: 0, killed: false, absorbed: 0 };
  }

  let remaining = Math.max(0, amount);
  let absorbed = 0;

  if (target.shield > 0) {
    const room = target.shield;
    if (remaining <= room) {
      absorbed = remaining;
      target.shield -= remaining;
      remaining = 0;
    } else {
      absorbed = room;
      target.shield = 0;
      remaining -= room;
    }
  }
  const toHealth = remaining;
  target.health = Math.max(0, target.health - remaining);
  target.damageTaken += amount;
  target.lastDamageTime = target.time ?? 0;
  if (direction) target.lastDamageDir = direction;

  const killed = target.health <= 0;
  if (killed) {
    target.alive = false;
    target.deathTime = target.time ?? 0;
  }

  return { dealt: absorbed + toHealth, toShield: absorbed, toHealth, killed, absorbed, headshot };
}

export function consumableUseful(id, actor) {
  const c = CONSUMABLES[id];
  if (!c) return false;
  if (c.healPerSec > 0) return actor.health < MAX_HEALTH && actor.health > 0;
  return actor.shield < MAX_SHIELD;
}

export function vitals(actor) {
  return {
    health: Math.max(0, Math.round(actor.health)),
    shield: Math.max(0, Math.round(actor.shield)),
    healthPct: clamp(actor.health / MAX_HEALTH, 0, 1),
    shieldPct: clamp(actor.shield / MAX_SHIELD, 0, 1),
  };
}

/** Fall damage for a running-jump landing. */
export function fallDamage(fallDistance) {
  const SAFE = 9;
  if (fallDistance <= SAFE) return 0;
  return (fallDistance - SAFE) * 6.2;
}

export function stormDamage(phaseIndex) {
  return 1 + phaseIndex * 0.8;
}
