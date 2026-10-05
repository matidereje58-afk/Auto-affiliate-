// Bot AI.
//
// Utility-driven with an explicit state machine. Bots perceive on a slow tick
// and act continuously, which keeps the cost near O(players) rather than
// O(players^2) per frame while still giving varied, believable behaviour.

import { clamp, damp, distXZ, angleDelta, lerp } from './math.js';
import { RNG } from './rng.js';
import { tryFire, tryReload, tryHarvest } from './combat.js';
import { WEAPONS, currentSpread } from './weapons.js';
import { consumableUseful, MAX_HEALTH, MAX_SHIELD } from './health.js';
import { PIECE } from './grid.js';
import { POIS } from './terrain.js';
import { STORM_STATE_DONE } from './storm.js';

export const BOT_STATE = {
  LOOT: 'loot', ROTATE: 'rotate', ENGAGE: 'engage',
  FLEE: 'flee', HEAL: 'heal', HARVEST: 'harvest', BUILD: 'build',
};

const IDLE = { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false };

const NAMES = [
  'Rook', 'Vex', 'Nomad', 'Sable', 'Kite', 'Dune', 'Flint', 'Juno',
  'Marlin', 'Onyx', 'Pike', 'Quill', 'Raven', 'Slate', 'Talon', 'Umber',
  'Vesper', 'Wren', 'Zephyr', 'Cobalt', 'Drift', 'Ember', 'Frost', 'Gale',
  'Husk', 'Ibis', 'Jackal', 'Kestrel', 'Lynx', 'Mesa', 'Nimbus', 'Ochre',
  'Prowl', 'Quartz', 'Ridge', 'Surge', 'Thorn', 'Vale', 'Wisp', 'Yarrow',
  'Bandit', 'Cinder', 'Echo', 'Ferro', 'Glim', 'Halcyon', 'Iron', 'Kilo',
];

let BOT_SERIAL = 1;

export class Bot {
  constructor(actor, skill = 0.6) {
    this.actor = actor;
    this.skill = clamp(skill, 0, 1);
    this.id = BOT_SERIAL++;
    /** Seeded per bot so a match replays identically. */
    this.rng = new RNG((actor.id * 2654435761 + 12345) >>> 0);

    this.state = BOT_STATE.LOOT;
    this.stateTime = 0;
    this.thinkTimer = this.thinkDelay();
    this.target = null;
    this.targetSeenAt = -99;
    this.targetLastSeen = -99;
    this.aimError = { x: 0, y: 0 };
    this.aimSettle = 0;
    this.hasLineOfSight = false;

    this.destX = 0;
    this.destZ = 0;
    this.destTimer = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.jumpTimer = 0;
    this.buildTimer = 0;
    this.lootCooldown = 0;
    this.lootGoal = null;
    this.lootPool = [];
    this.harvestGoal = null;

    this.dropTarget = this.chooseDrop();
  }

  thinkDelay() { return 0.14 + (1 - this.skill) * 0.22 + this.rng.next() * 0.08; }

  /** Landing spot: named hubs are attractive, with long-range options. */
  chooseDrop() {
    const hubs = POIS.filter((p) => p.hub);
    if (this.rng.next() < 0.72 && hubs.length) {
      const p = hubs[(this.rng.next() * hubs.length) | 0];
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * p.r * 0.8;
      return { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, poi: p.name };
    }
    const p = POIS[(this.rng.next() * POIS.length) | 0];
    return { x: p.x, z: p.z, poi: p.name };
  }

  onLanded(world) {
    const near = [];
    for (const item of world.pickups) {
      if (item.pickedUp) continue;
      if (distXZ(item, this.dropTarget) < 95) near.push(item);
    }
    this.lootPool = near.slice(0, 26);
  }

  update(dt, world) {
    const a = this.actor;
    if (!a.alive) return IDLE;

    this.thinkTimer -= dt;
    this.strafeTimer -= dt;
    this.jumpTimer -= dt;
    this.buildTimer -= dt;
    this.lootCooldown -= dt;

    if (!world.storm.isSafe(a.pos.x, a.pos.z)) {
      const res = world.stormDamage(a, world.storm.currentDps() * dt);
      if (res.killed) return IDLE;
    }

    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.thinkDelay();
      this.perceive(world);
      this.decide(world);
    }
    this.aimSettle = Math.min(1, this.aimSettle + dt * 2.2);
    return this.act(dt, world);
  }

  // ------------------------------------------------------------ perception

  perceive(world) {
    const a = this.actor;
    const engageRange = lerp(48, 165, this.skill);
    let best = null;
    let bestScore = -Infinity;

    for (const other of world.actors) {
      if (!a.isEnemyOf(other)) continue;
      const d = distXZ(a.pos, other.pos);
      if (d > engageRange) continue;

      let score = 100 - d;
      if (other.health + other.shield < 45) score += 35;
      const los = !world.props.blockedSight(a.eyePos, other.chestPos) &&
        !this.blockedByBuild(world, a, other);
      if (!los) continue;
      score += 20;
      if (other === this.target) score += 18;
      if (score > bestScore) { bestScore = score; best = other; }
    }

    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.targetSeenAt = world.time;
        this.aimSettle = 0;
        this.aimError.x = (this.rng.next() - 0.5) * 0.14;
        this.aimError.y = (this.rng.next() - 0.5) * 0.10;
      }
      this.hasLineOfSight = true;
      this.targetLastSeen = world.time;
    } else {
      this.hasLineOfSight = false;
    }

    if (this.target && world.time - this.targetLastSeen > 3.4) this.target = null;
  }

  blockedByBuild(world, self, other) {
    const dir = {
      x: other.chestPos.x - self.eyePos.x,
      y: other.chestPos.y - self.eyePos.y,
      z: other.chestPos.z - self.eyePos.z,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 0.01) return false;
    return !!world.build.raycast(self.eyePos, {
      x: dir.x / len, y: dir.y / len, z: dir.z / len,
    }, len);
  }

  // ---------------------------------------------------------------- decide

  decide(world) {
    const a = this.actor;
    const storm = world.storm;

    const needsHeal = a.health < MAX_HEALTH * (0.45 + 0.25 * this.skill);
    const needsShield = a.shield < MAX_SHIELD * (0.4 + 0.2 * this.skill);
    const threatened = this.target && world.time - this.targetLastSeen < 1.2;

    if (a.usingId === null && (needsHeal || needsShield) &&
        (!threatened || this.rng.next() < 0.35)) {
      const pick = this.chooseConsumable();
      if (pick) {
        this.state = BOT_STATE.HEAL;
        this.stateTime = 0;
        a.usingId = pick;
        a.useTimer = 0;
        return;
      }
    }

    // Storm. Once it is finished there is nowhere left to run, so prioritise
    // fighting - otherwise the last survivors mill about the ring.
    const outside = storm.distanceOutside(a.pos.x, a.pos.z);
    const stormDone = storm.state === STORM_STATE_DONE;
    let needToMove = outside > 2;
    if (!stormDone) {
      const timeToClose = storm.state === 'shrink' ? storm.timer : storm.timer + 30;
      needToMove = needToMove || timeToClose < 22;
    }
    if (needToMove) {
      this.state = BOT_STATE.ROTATE;
      this.stateTime = 0;
      return;
    }

    if (this.target && this.hasLineOfSight) {
      const d = distXZ(a.pos, this.target.pos);
      if (stormDone || d < 190) {
        this.state = BOT_STATE.ENGAGE;
        this.stateTime = 0;
        return;
      }
    }

    const item = this.findLoot(world);
    if (item) {
      this.state = BOT_STATE.LOOT;
      this.stateTime = 0;
      this.lootGoal = item;
      return;
    }

    const bag = a.inventory.bag;
    if (bag.total() < 160 && this.buildTimer <= 0) {
      const prop = world.props.nearest(a.pos.x, a.pos.y, a.pos.z, 14,
        (p) => p.def.material && p.kind !== 'bush');
      if (prop) {
        this.state = BOT_STATE.HARVEST;
        this.stateTime = 0;
        this.harvestGoal = prop;
        return;
      }
    }

    this.state = BOT_STATE.ROTATE;
  }

  chooseConsumable() {
    const a = this.actor;
    const inv = a.inventory;
    const order = a.health < 45
      ? ['medkit', 'bandage']
      : ['bigShield', 'jug', 'smallShield', 'bandage'];
    for (const id of order) {
      if (inv.countConsumable(id) > 0 && consumableUseful(id, a)) return id;
    }
    return null;
  }

  findLoot(world) {
    const a = this.actor;
    const inv = a.inventory;
    if (this.lootPool.length === 0 || this.lootCooldown <= 0) {
      this.lootCooldown = 3.0;
      const near = [];
      for (const item of world.pickups) {
        if (item.pickedUp) continue;
        if (distXZ(a.pos, item) > 130) continue;
        if (!this.wants(item, inv)) continue;
        near.push(item);
      }
      near.sort((p, q) => distXZ(a.pos, p) - distXZ(a.pos, q));
      this.lootPool = near.slice(0, 18);
      if (this.lootPool.length === 0) return null;
    }
    for (const item of this.lootPool) {
      if (item.pickedUp) continue;
      if (distXZ(a.pos, item) > 140) continue;
      if (!this.wants(item, inv)) continue;
      return item;
    }
    return null;
  }

  wants(item, inv) {
    switch (item.kind) {
      case 'weapon': {
        if (!inv.current && inv.firstEmpty() < 0) return false;
        if (!inv.current) return true;
        const order = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
        return order[item.weapon.rarity] > order[inv.current.rarity];
      }
      case 'ammo':
        return inv.ammo[item.ammoId] < 200;
      case 'consumable':
        return inv.countConsumable(item.consumableId) < 9;
      case 'material':
        return inv.bag.get(item.materialId) < 400;
      case 'chest':
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ act

  act(dt, world) {
    const a = this.actor;
    a.buildMaterial = a.inventory.buildMaterial;
    switch (this.state) {
      case BOT_STATE.HEAL: return this.actHeal();
      case BOT_STATE.ENGAGE: return this.actEngage(dt, world);
      case BOT_STATE.LOOT: return this.actLoot(dt, world);
      case BOT_STATE.HARVEST: return this.actHarvest(world);
      default: return this.actRotate(dt, world);
    }
  }

  actHeal() {
    return { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false };
  }

  actEngage(dt, world) {
    const a = this.actor;
    const target = this.target;
    if (!target || !target.alive) { this.state = BOT_STATE.ROTATE; return IDLE; }

    const d = distXZ(a.pos, target.pos);
    const w = a.weapon;
    this.aimAt(target, dt, world);

    if (w) {
      const reserve = a.inventory.reserveFor(w);
      if (w.ammo === 0 && reserve > 0) tryReload(a);
      else if (w.ammo <= w.magazine * 0.25 && d > 26 && reserve > 0 && !w.reloading) tryReload(a);
    }

    if (this.strafeTimer <= 0) {
      this.strafeTimer = 0.7 + this.rng.next() * 1.1;
      this.strafeDir = this.rng.next() < 0.5 ? -1 : 1;
    }

    let fwd = 0;
    const strafe = this.strafeDir * (0.55 + this.skill * 0.4);
    const comfort = w ? idealRangeFor(w, d) : 10;
    if (d > comfort * 1.25) fwd = 1;
    else if (d < comfort * 0.6) fwd = -0.85;

    let jump = false;
    if (this.jumpTimer <= 0 && d > 12) {
      this.jumpTimer = 1.6 + this.rng.next() * 3.2;
      jump = this.rng.next() < 0.25 + this.skill * 0.2;
    }

    if (this.buildTimer <= 0 && a.inventory.bag.total() >= 40 && d < 24 &&
        this.rng.next() < 0.35) {
      if (this.tryBuildCover(world, target)) this.buildTimer = 2.5;
    }

    this.tryShoot(world, d);
    a.aiming = d > 22;

    return {
      fwd, strafe, jump,
      sprint: d > 26 && this.skill > 0.4,
      crouch: false, yaw: a.yaw, pitch: a.pitch,
    };
  }

  actLoot(dt, world) {
    const a = this.actor;
    const item = this.lootGoal;
    if (!item || item.pickedUp || !this.wants(item, a.inventory)) {
      this.state = BOT_STATE.ROTATE;
      return IDLE;
    }
    const d = distXZ(a.pos, item);
    const yaw = Math.atan2(item.z - a.pos.z, item.x - a.pos.x);
    a.yaw = yaw;

    if (d < 2.2) {
      world.tryPickup(a, item);
      this.state = BOT_STATE.ROTATE;
      return { fwd: 0.1, strafe: 0, jump: false, sprint: false, crouch: false };
    }

    if (this.target && this.hasLineOfSight) {
      this.aimAt(this.target, dt, world);
      this.tryShoot(world, distXZ(a.pos, this.target.pos));
    }

    return {
      fwd: 1, strafe: 0, jump: false,
      sprint: d > 16 && !world.storm.distanceOutside(a.pos.x, a.pos.z),
      crouch: false, yaw, pitch: a.pitch,
    };
  }

  actHarvest(world) {
    const a = this.actor;
    const prop = this.harvestGoal;
    if (!prop || !prop.alive || a.inventory.bag.total() >= 400) {
      this.state = BOT_STATE.ROTATE;
      return IDLE;
    }
    const d = distXZ(a.pos, prop);
    const yaw = Math.atan2(prop.z - a.pos.z, prop.x - a.pos.x);
    a.yaw = yaw;
    if (d < 2.4) {
      tryHarvest(a, world);
      this.buildTimer = 0;
      return { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false };
    }
    return { fwd: 1, strafe: 0, jump: false, sprint: d > 8, crouch: false, yaw, pitch: a.pitch };
  }

  actRotate(dt, world) {
    const a = this.actor;
    const storm = world.storm;

    if (!this.destTimer || this.destTimer <= 0) {
      this.destTimer = 2.6 + this.rng.next() * 2.4;
      const r = Math.sqrt(this.rng.next()) * Math.max(2, storm.to.r * 0.82);
      const ang = this.rng.next() * Math.PI * 2;
      this.destX = storm.to.cx + Math.cos(ang) * r;
      this.destZ = storm.to.cz + Math.sin(ang) * r;
    }
    this.destTimer -= dt;

    let dx = this.destX - a.pos.x;
    let dz = this.destZ - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 6) this.destTimer = 0;

    // Steer around the shoreline rather than into the sea.
    const ilen = d || 1;
    const ahead = { x: a.pos.x + (dx / ilen) * 6, z: a.pos.z + (dz / ilen) * 6 };
    if (world.terrain.heightAt(ahead.x, ahead.z) < 0.6) {
      const yaw = Math.atan2(dz, dx) + (this.strafeDir * Math.PI) / 2.2;
      dx = Math.cos(yaw); dz = Math.sin(yaw);
    }

    const yaw = Math.atan2(dz, dx);
    a.yaw = yaw;

    if (this.target && world.time - this.targetLastSeen < 2.2) {
      this.aimAt(this.target, dt, world);
      this.tryShoot(world, distXZ(a.pos, this.target.pos));
      a.aiming = distXZ(a.pos, this.target.pos) > 22;
    } else {
      a.aiming = false;
    }

    return {
      fwd: 1, strafe: 0, jump: false,
      sprint: storm.distanceOutside(a.pos.x, a.pos.z) > 2 || d > 20,
      crouch: false, yaw, pitch: a.pitch,
    };
  }

  // --------------------------------------------------------------- combat

  aimAt(target, dt, world) {
    const a = this.actor;
    const d = distXZ(a.pos, target.pos);

    const w = a.weapon;
    const speed = w ? WEAPONS[w.archetype].projectile : null;
    let px = target.chestPos.x;
    let py = target.chestPos.y;
    let pz = target.chestPos.z;

    if (speed && d > 12) {
      const tof = d / speed;
      const lx = target.vel.x * tof * 0.85;
      const lz = target.vel.z * tof * 0.85;
      px = lerp(target.chestPos.x, px + lx, 0.3 + this.skill * 0.7);
      pz = lerp(target.chestPos.z, pz + lz, 0.3 + this.skill * 0.7);
    }

    const to = { x: px - a.eyePos.x, y: py - a.eyePos.y, z: pz - a.eyePos.z };
    const len = Math.hypot(to.x, to.y, to.z) || 1;
    const wantYaw = Math.atan2(to.z, to.x);
    const wantPitch = Math.asin(clamp(to.y / len, -1, 1));

    const turnRate = lerp(3.4, 13, this.skill);
    a.yaw += angleDelta(a.yaw, wantYaw) * Math.min(1, turnRate * dt);
    a.pitch += (wantPitch - a.pitch) * Math.min(1, turnRate * dt);

    const floor = lerp(0.075, 0.008, this.skill);
    const spread = currentSpread(w || { spread: 0.01, moveSpread: 0, adsSpread: 1, recoil: 0 },
      { moving: 0, aiming: true });
    const errMag = floor + spread;
    this.aimError.x = damp(this.aimError.x, (this.rng.next() - 0.5) * errMag, 6, dt);
    this.aimError.y = damp(this.aimError.y, (this.rng.next() - 0.5) * errMag, 6, dt);
  }

  tryShoot(world, distance) {
    const a = this.actor;
    const w = a.weapon;
    if (!w) return false;
    if (w.reloading > 0 || a.fireCooldown > 0) return false;
    if (w.ammo <= 0) { tryReload(a); return false; }

    const seenFor = world.time - this.targetSeenAt;
    if (seenFor < lerp(0.46, 0.10, this.skill)) return false;

    const target = this.target;
    if (!target) return false;
    const to = {
      x: target.chestPos.x - a.eyePos.x,
      y: target.chestPos.y - a.eyePos.y,
      z: target.chestPos.z - a.eyePos.z,
    };
    const len = Math.hypot(to.x, to.y, to.z) || 1;
    const dir = { x: to.x / len, y: to.y / len, z: to.z / len };
    const aim = a.aimDir();
    const dot = aim.x * dir.x + aim.y * dir.y + aim.z * dir.z;
    if (dot < Math.cos(0.14 + (1 - this.skill) * 0.16)) return false;

    const missScale = 1 + (1 - this.skill) * (distance / 90) * 0.9;
    return !!tryFire(a, world, { spreadScale: missScale });
  }

  /** Place a wall between this bot and a threat. */
  tryBuildCover(world, threat) {
    const a = this.actor;
    const bag = a.inventory.bag;
    const mat = ['wood', 'brick', 'metal'].reduce(
      (best, m) => (bag.get(m) > bag.get(best) ? m : best), 'wood');
    if (bag.get(mat) < 10) return false;

    const dirX = threat.pos.x - a.pos.x;
    const dirZ = threat.pos.z - a.pos.z;
    const d = Math.hypot(dirX, dirZ) || 1;
    const px = a.pos.x + (dirX / d) * 2.4;
    const pz = a.pos.z + (dirZ / d) * 2.4;
    const gy = Math.floor(a.pos.y);

    for (const rot of [0, 1]) {
      for (const dy of [0, 1]) {
        const piece = world.build.tryPlace(PIECE.WALL, Math.floor(px), gy + dy, Math.floor(pz), rot, a, world.actors);
        if (piece) return true;
      }
    }
    return false;
  }
}

/** Preferred engagement distance for a weapon archetype. */
export function idealRangeFor(weapon, currentDist) {
  const b = WEAPONS[weapon.archetype];
  if (!b) return currentDist;
  switch (b.class) {
    case 'Shotgun': return 6;
    case 'SMG': return 11;
    case 'Light': return 15;
    case 'Assault Rifle':
    case 'Burst Rifle': return 30;
    case 'Sniper': return 70;
    case 'Launcher': return 45;
    default: return 20;
  }
}

export function makeBotName(rng, index) {
  return `${rng.pick(NAMES)}${index % 10 === 0 ? index : ''}`;
}
