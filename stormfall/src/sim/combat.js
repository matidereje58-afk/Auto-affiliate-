// Shooting, hit resolution, projectiles, splash damage and harvesting.
//
// One code path serves the player and every bot: an actor produces a fire intent
// and the world resolves it identically, so bot accuracy is governed purely by
// the aim vector they generate.

import { rayCapsuleY, vsub, vmul, vnorm, vlen, clamp } from './math.js';
import { pieceBounds } from './grid.js';
import { HEAD_RADIUS } from './character.js';
import { damageAtRange, currentSpread, WEAPONS } from './weapons.js';
import { applyDamage } from './health.js';
import { ammoForClass } from './loot.js';
import { WATER_LEVEL } from './terrain.js';

const TERRAIN_MARCH = 0.9;
const MAX_RANGE = 460;

let NEXT_PROJ = 1;

export class Projectile {
  constructor() { this.alive = false; }

  init(shooter, weapon, origin, dir, weaponDef) {
    this.alive = true;
    this.id = NEXT_PROJ++;
    this.shooterId = shooter.id;
    this.weapon = weapon;
    this.def = weaponDef;
    this.pos = { ...origin };
    this.prev = { ...origin };
    this.vel = vmul(dir, weaponDef.projectile);
    this.life = 0;
    this.maxLife = MAX_RANGE / weaponDef.projectile + 0.4;
    this.damage = weapon.damage;
    this.splash = weapon.splash;
    this.splashRadius = weapon.splashRadius;
    return this;
  }
}

/** Ray vs terrain heightfield. Returns distance or Infinity. */
export function raycastTerrain(terrain, origin, dir, maxDist = MAX_RANGE) {
  let t = 0;
  let prevAbove = origin.y - Math.max(WATER_LEVEL, terrain.heightAt(origin.x, origin.z));
  while (t < maxDist) {
    t += TERRAIN_MARCH;
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const ground = Math.max(WATER_LEVEL, terrain.heightAt(x, z));
    const above = y - ground;
    if (above <= 0 && prevAbove > 0) {
      // Bisect for a clean impact point.
      let lo = t - TERRAIN_MARCH, hi = t;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) * 0.5;
        const my = origin.y + dir.y * mid;
        const mh = Math.max(WATER_LEVEL, terrain.heightAt(origin.x + dir.x * mid, origin.z + dir.z * mid));
        if (my - mh <= 0) hi = mid; else lo = mid;
      }
      return hi;
    }
    prevAbove = above;
  }
  return Infinity;
}

/** Ray vs every actor. Closest hit wins; head hitbox takes priority. */
export function raycastActors(actors, origin, dir, maxDist, ignoreId) {
  let best = null;

  for (const a of actors) {
    if (!a.alive || a.id === ignoreId) continue;

    const toC = vsub({ x: a.pos.x, y: a.pos.y + a.height * 0.5, z: a.pos.z }, origin);
    const along = toC.x * dir.x + toC.y * dir.y + toC.z * dir.z;
    if (along < -3 || along > maxDist + 3) continue;
    const clamped = clamp(along, 0, maxDist);
    const closest = {
      x: origin.x + dir.x * clamped,
      y: origin.y + dir.y * clamped,
      z: origin.z + dir.z * clamped,
    };
    const d = Math.hypot(
      closest.x - a.pos.x,
      closest.y - (a.pos.y + a.height * 0.5),
      closest.z - a.pos.z,
    );
    if (d > a.height * 0.5 + a.radius + 0.6) continue;

    const tHead = raySphere(origin, dir, a.headPos, HEAD_RADIUS, maxDist);
    const tBody = rayCapsuleY(origin, dir, a.pos, a.radius, a.height, maxDist);

    const tHit = tHead >= 0 ? tHead : tBody;
    if (tHit < 0) continue;
    const headshot = tHead >= 0 && (tBody < 0 || tHead <= tBody + 0.001);

    if (!best || tHit < best.t) {
      best = { t: tHit, actor: a, headshot, part: headshot ? 'head' : 'body' };
    }
  }
  return best;
}

/** Ray vs sphere, entry distance or -1. */
export function raySphere(origin, dir, centre, radius, maxDist) {
  const ox = origin.x - centre.x;
  const oy = origin.y - centre.y;
  const oz = origin.z - centre.z;
  const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = (-b - s) / 2;
  if (t < 0) t = (-b + s) / 2;
  return t >= 0 && t <= maxDist ? t : -1;
}

/** Resolve one bullet against actors, structures and terrain. */
export function resolveShot(origin, dir, weapon, world, shooterId) {
  const maxDist = weapon.range;
  const terrainT = raycastTerrain(world.terrain, origin, dir, maxDist);
  const pieceHit = world.build.raycast(origin, dir, maxDist);
  const pieceT = pieceHit ? pieceHit.t : Infinity;
  const actorHit = raycastActors(world.actors, origin, dir, maxDist, shooterId);

  const t = Math.min(terrainT, pieceT, actorHit ? actorHit.t : Infinity);
  if (!isFinite(t)) return null;

  let kind = 'terrain';
  if (actorHit && actorHit.t === t) kind = 'actor';
  else if (pieceHit && pieceHit.t === t) kind = 'piece';

  return {
    t, kind,
    actor: kind === 'actor' ? actorHit.actor : null,
    headshot: kind === 'actor' ? actorHit.headshot : false,
    piece: kind === 'piece' ? pieceHit.piece : null,
    point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
  };
}

export function applyBulletDamage(hit, weapon, shooter, world) {
  if (!hit || hit.kind !== 'actor' || !hit.actor) return null;

  const base = damageAtRange(weapon, hit.t);
  const dmg = base * (hit.headshot ? weapon.headMult : 1);

  const result = applyDamage(hit.actor, dmg, {
    headshot: hit.headshot,
    direction: { x: hit.actor.pos.x - shooter.pos.x, z: hit.actor.pos.z - shooter.pos.z },
  });
  hit.actor.lastAttackerId = shooter.id;
  hit.actor.lastHitBy = shooter.id;

  if (result.killed) {
    hit.actor.eliminatedBy = shooter.id;
    hit.actor.eliminatedAt = world.time;
    hit.actor.deathCause = 'gun';
    shooter.kills++;
  }
  world.stats.shotsHit++;
  world.events.push({
    type: 'hit-damage', actorId: hit.actor.id,
    attackerId: shooter.id, amount: dmg, headshot: hit.headshot,
  });
  return { ...result, damage: dmg };
}

/** Radial damage used by launchers and barrels. */
export function splashDamage(centre, radius, maxDamage, world, sourceId) {
  const victims = [];
  for (const a of world.actors) {
    if (!a.alive || a.id === sourceId) continue;
    const d = Math.hypot(
      a.pos.x - centre.x,
      a.pos.y + a.height * 0.5 - centre.y,
      a.pos.z - centre.z,
    );
    if (d > radius) continue;
    const falloff = 1 - (d / radius) ** 1.35;
    const dmg = maxDamage * falloff;
    const res = applyDamage(a, dmg, {
      direction: { x: a.pos.x - centre.x, z: a.pos.z - centre.z },
    });
    if (res.killed) {
      a.eliminatedBy = sourceId;
      a.eliminatedAt = world.time;
      a.deathCause = 'gun';
      const src = world.actors.find((x) => x.id === sourceId);
      if (src) src.kills++;
    }
    victims.push({ actor: a, damage: dmg, killed: res.killed });
  }

  for (const piece of world.build.grid.all()) {
    const b = pieceBounds(piece.type, piece.gx, piece.gy, piece.gz, piece.rot);
    const cx = Math.max(b.min.x, Math.min(centre.x, b.max.x));
    const cy = Math.max(b.min.y, Math.min(centre.y, b.max.y));
    const cz = Math.max(b.min.z, Math.min(centre.z, b.max.z));
    const d = Math.hypot(cx - centre.x, cy - centre.y, cz - centre.z);
    if (d > radius) continue;
    world.build.damagePiece(piece, maxDamage * (1 - d / radius) * 1.4);
  }

  world.events.push({ type: 'explosion', centre: { ...centre }, radius, victims: victims.length });
  return victims;
}

/** Rotate a unit vector by a random offset inside a cone. */
export function jitter(dir, cone, rng) {
  if (cone <= 1e-6) return dir;
  const up = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let rx = up.y * dir.z - up.z * dir.y;
  let ry = up.z * dir.x - up.x * dir.z;
  let rz = up.x * dir.y - up.y * dir.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = dir.y * rz - dir.z * ry;
  const uy = dir.z * rx - dir.x * rz;
  const uz = dir.x * ry - dir.y * rx;

  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(rng.next()) * cone;
  const cx = Math.cos(a) * r;
  const cy = Math.sin(a) * r;
  return vnorm({
    x: dir.x + rx * cx + ux * cy,
    y: dir.y + ry * cx + uy * cy,
    z: dir.z + rz * cx + uz * cy,
  });
}

/** Attempt to fire the actor's current weapon. */
export function tryFire(actor, world, { aimOverride = null, spreadScale = 1 } = {}) {
  const weapon = actor.weapon;
  if (!weapon || !actor.alive) return null;
  if (weapon.reloading > 0) return null;
  if (actor.fireCooldown > 0) return null;
  if (weapon.burst > 1 && actor.burstLeft > 0) return null;

  if (weapon.ammo <= 0) {
    if (world.time - actor.lastDryFire > 0.35) {
      actor.lastDryFire = world.time;
      world.events.push({ type: 'dry-fire', actorId: actor.id });
    }
    return null;
  }

  weapon.ammo -= weapon.ammoPerShot;
  actor.fireCooldown = weapon.fireInterval;
  world.stats.shotsFired++;

  if (weapon.burst > 1) actor.burstLeft = weapon.burst - 1;

  const origin = actor.eyePos;
  const baseDir = aimOverride || actor.aimDir();
  const spread = currentSpread(weapon, {
    moving: actor.speed,
    aiming: actor.aiming,
    crouched: actor.crouching,
    airborne: !actor.grounded,
  }) * spreadScale;

  const def = WEAPONS[weapon.archetype];

  if (def.projectile) {
    const shots = [];
    for (let i = 0; i < weapon.pellets; i++) {
      const dir = jitter(baseDir, spread, world.rng);
      const proj = new Projectile().init(actor, weapon, origin, dir, def);
      world.projectiles.push(proj);
      shots.push({ projectile: proj, dir, origin });
    }
    actor.recoilKick += weapon.recoil;
    world.events.push({
      type: 'shot', actorId: actor.id, weapon, origin: { ...origin }, dir: baseDir,
    });
    return { kind: 'projectile', weapon, shots, origin, dir: baseDir };
  }

  const shots = [];
  let anyHit = false;
  for (let i = 0; i < weapon.pellets; i++) {
    const dir = jitter(baseDir, spread, world.rng);
    const hit = resolveShot(origin, dir, weapon, world, actor.id);
    let result = null;
    if (hit) {
      result = applyBulletDamage(hit, weapon, actor, world);
      if (hit.kind === 'actor') anyHit = true;
      else if (hit.kind === 'piece') world.build.damagePiece(hit.piece, weapon.damage);
    }
    shots.push({ dir, hit, result });
  }

  actor.recoilKick += weapon.recoil;
  world.events.push({
    type: 'shot', actorId: actor.id, weapon, origin: { ...origin }, dir: baseDir, hit: anyHit,
  });
  return { kind: 'hitscan', weapon, shots, origin, dir: baseDir, anyHit };
}

export function tryReload(actor) {
  const weapon = actor.weapon;
  if (!weapon || !actor.alive) return false;
  if (weapon.reloading > 0) return false;
  if (weapon.ammo >= weapon.magazine) return false;
  const ammoType = ammoForClass(weapon.class);
  if (actor.inventory.ammo[ammoType] <= 0) return false;
  weapon.reloading = weapon.reloadTime;
  return true;
}

/** Advance projectiles one step, sweeping so fast rounds cannot tunnel. */
export function updateProjectiles(world, dt) {
  const list = world.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life += dt;
    if (p.life > p.maxLife) { list.splice(i, 1); continue; }

    p.prev = { ...p.pos };
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;

    const seg = vsub(p.pos, p.prev);
    const segLen = vlen(seg);
    if (segLen < 1e-6) continue;
    const dir = vmul(seg, 1 / segLen);
    const shooter = world.actors.find((a) => a.id === p.shooterId);

    const hit = resolveShot(p.prev, dir, p.weapon, world, p.shooterId);
    if (hit && hit.t <= segLen + 0.35) {
      const impact = {
        x: p.prev.x + dir.x * hit.t,
        y: p.prev.y + dir.y * hit.t,
        z: p.prev.z + dir.z * hit.t,
      };
      if (hit.kind === 'actor' && shooter) {
        applyBulletDamage(hit, p.weapon, shooter, world);
      } else if (hit.kind === 'piece') {
        world.build.damagePiece(hit.piece, p.damage);
      }
      if (p.splash > 0 && shooter) {
        splashDamage(impact, p.splashRadius, p.splash, world, shooter.id);
      }
      world.events.push({
        type: 'impact', point: impact, weapon: p.weapon,
        kind: hit.kind, explosive: p.splash > 0,
      });
      list.splice(i, 1);
    }
  }
}

/** Nearest enemy inside a cone around the aim direction. */
export function nearestEnemyInCone(actor, world, dir, range, maxAngleDeg) {
  const maxDot = Math.cos((maxAngleDeg * Math.PI) / 180);
  let best = null;
  let bestT = Infinity;
  for (const a of world.actors) {
    if (!a.isEnemyOf(actor)) continue;
    const to = vsub({ x: a.pos.x, y: a.pos.y + a.height * 0.6, z: a.pos.z }, actor.pos);
    const d = vlen(to);
    if (d > range || d < 1e-4) continue;
    const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / d;
    if (dot < maxDot) continue;
    if (d < bestT) { bestT = d; best = { actor: a, distance: d }; }
  }
  return best;
}

/** Resolve a harvesting swing: build piece, then prop, then a bare-handed hit. */
export function tryHarvest(actor, world, aimOverride = null) {
  if (!actor.alive) return null;
  const origin = actor.eyePos;
  const dir = aimOverride || actor.aimDir();
  const maxReach = 4.4;

  const propHit = world.props.nearest(origin.x, origin.y, origin.z, maxReach);
  let propT = Infinity;
  let prop = null;
  if (propHit) {
    const to = { x: propHit.x - origin.x, y: propHit.y + 1.0 - origin.y, z: propHit.z - origin.z };
    const along = to.x * dir.x + to.y * dir.y + to.z * dir.z;
    if (along > 0.2) {
      const perp = Math.hypot(to.x - dir.x * along, to.y - dir.y * along, to.z - dir.z * along);
      if (perp < propHit.radius + 0.75) { propT = along; prop = propHit; }
    }
  }

  const pieceHit = world.build.raycast(origin, dir, maxReach);
  const pieceT = pieceHit ? pieceHit.t : Infinity;

  if (prop && propT <= pieceT) {
    const res = world.props.harvest(prop, actor);
    if (res.destroyed && prop.def.explosive) {
      splashDamage({ x: prop.x, y: prop.y + 1, z: prop.z },
        prop.def.explosiveRadius, prop.def.explosiveDamage, world, actor.id);
    }
    world.events.push({ type: 'harvest', actorId: actor.id, target: 'prop', kind: prop.kind });
    return { target: prop, ...res };
  }

  if (pieceHit && pieceHit.t <= propT) {
    const res = world.build.harvestPiece(pieceHit.piece, actor);
    if (res.destroyed) world.build.refundOnDestroy(pieceHit.piece, actor);
    world.events.push({ type: 'harvest', actorId: actor.id, target: 'piece' });
    return { target: pieceHit.piece, ...res };
  }

  const enemy = nearestEnemyInCone(actor, world, dir, maxReach, 32);
  if (enemy) {
    const res = applyDamage(enemy.actor, 12);
    enemy.actor.lastHitBy = actor.id;
    if (res.killed) {
      enemy.actor.eliminatedBy = actor.id;
      enemy.actor.eliminatedAt = world.time;
      enemy.actor.deathCause = 'melee';
      actor.kills++;
    }
    world.events.push({ type: 'melee', actorId: actor.id, targetId: enemy.actor.id });
    return { target: enemy.actor, melee: true, yield: 0, destroyed: res.killed };
  }

  return null;
}

export { MAX_RANGE };
