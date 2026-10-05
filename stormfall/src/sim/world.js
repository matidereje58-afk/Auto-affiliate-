// World: owns every entity and runs the fixed-step simulation.
//
// Nothing here touches the DOM or three.js. The presentation layer reads
// `world` each frame and drains `world.events`.

import { RNG } from './rng.js';
import { Terrain, POIS, WATER_LEVEL } from './terrain.js';
import { BuildSystem } from './build.js';
import { PropSystem, PROP } from './props.js';
import { Storm } from './storm.js';
import { Match, MATCH_STATE, DROP, dropDamage, busPos, busRouteLength, routeTFor } from './match.js';
import { Actor } from './character.js';
import { Bot, makeBotName } from './bot.js';
import { updateProjectiles, tryFire, tryReload, tryHarvest } from './combat.js';
import { applyDamage, consumableUseful, CONSUMABLES, MAX_HEALTH, MAX_SHIELD } from './health.js';
import { generateLoot, openChest, pickupLabel, makePickup } from './loot.js';
import { BUILD_TYPES, BUILD_REACH, PIECE } from './grid.js';
import { clamp } from './math.js';

export const TICK = 1 / 60;

export class World {
  constructor({ seed = 1337, players = 50, difficulty = 0.62, lootDensity = 1 } = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.time = 0;
    this.rngAcc = 0;
    this.events = [];

    this.terrain = new Terrain({ seed, res: 256 });
    this.build = new BuildSystem(this.terrain);
    this.props = new PropSystem(this.terrain, this.rng.fork(11), { density: 1 });
    this.storm = new Storm(this.rng.fork(23));
    this.match = new Match({ totalPlayers: players });
    this.match.aliveTotal = players;
    this.match.setState(MATCH_STATE.DROPSHIP);
    this.difficulty = difficulty;

    this.actors = [];
    this.bots = new Map();
    this.projectiles = [];
    this.pickups = generateLoot(this.terrain, this.rng.fork(37), { density: lootDensity });

    this.player = null;
    this.playerIntent = null;

    this.stats = { shotsFired: 0, shotsHit: 0, piecesBuilt: 0, propsHarvested: 0 };
    this.paused = false;
    this.ended = false;
    this.result = null;

    this._spawn(players);
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  _spawn(count) {
    for (let i = 0; i < count; i++) {
      const isPlayer = i === 0;
      const name = isPlayer ? 'You' : makeBotName(this.rng, i);
      const a = new Actor({ name, isPlayer, x: 0, y: 0, z: 0 });
      a.id = i + 1;
      this.actors.push(a);
      if (isPlayer) {
        this.player = a;
        // The player has no AI, so give them a sensible default landing spot
        // near the middle of the bus route.
        a.dropTarget = { x: 0, z: 0, poi: 'Island centre' };
      } else {
        const skill = clamp(this.difficulty * this.rng.range(0.78, 1.12), 0.08, 0.99);
        const bot = new Bot(a, skill);
        this.bots.set(a.id, bot);
        a.dropTarget = bot.dropTarget;
      }
    }

    // Leave the bus when it is actually over the spot you want to land on,
    // rather than at an arbitrary point along the route.
    for (const a of this.actors) {
      a.deployAt = clamp(routeTFor(this.match, a.dropTarget), 0.02, 0.98);
      const p = busPos(this.match, 0);
      a.pos.x = p.x; a.pos.y = p.y; a.pos.z = p.z;
    }
  }

  /** Advance with fixed steps so behaviour does not change with frame rate. */
  update(dtRaw) {
    if (this.paused || this.ended) return;
    const dt = Math.min(0.25, dtRaw);
    this.rngAcc += dt;
    let steps = 0;
    while (this.rngAcc >= TICK && steps < 8) {
      this.rngAcc -= TICK;
      this.step(TICK);
      steps++;
    }
    if (steps === 8) this.rngAcc = 0;
  }

  step(dt) {
    this.time += dt;
    this.match.time += dt;
    this.match.stateTime += dt;
    this.events.length = 0;
    this.build.events.length = 0;
    this.props.events.length = 0;

    this.stepMatch(dt);
    this.stepActors(dt);
    updateProjectiles(this, dt);
    this.stepConsumables(dt);
    this.stepStorm();
    this.stepPickups();
    this.stepEliminations();
    this.checkEnd();
  }

  stepMatch(dt) {
    const m = this.match;
    if (m.state !== MATCH_STATE.DROPSHIP) return;
    const len = busRouteLength(m);

    m.busT += (m.busSpeed / len) * dt;
    // Actors still aboard ride with the bus, so the position they leave from
    // matches the point on their flight path.
    const p = busPos(m, Math.min(1, m.busT));
    for (const a of this.actors) {
      if (a.fallState !== 'aboard') continue;
      a.pos.x = p.x;
      a.pos.y = p.y;
      a.pos.z = p.z;
      if (m.busT >= a.deployAt) this.jump(a);
    }
    if (m.busT >= 1) {
      for (const a of this.actors) {
        if (a.fallState === 'aboard') this.jump(a);
      }
      m.setState(MATCH_STATE.FREEFALL);
    }
  }

  jump(a) {
    if (a.fallState !== 'aboard') return;
    a.fallState = 'freefall';
    a.vel.x = 0; a.vel.y = -4; a.vel.z = 0;
    this.emit('jump', { actorId: a.id });
  }

  openGlider(a) {
    if (a.fallState !== 'freefall') return false;
    const h = a.pos.y - this.terrain.heightAt(a.pos.x, a.pos.z);
    if (h < DROP.GLIDE_MIN_HEIGHT * 0.55 && h > 0) return false;
    a.fallState = 'gliding';
    a.glideOpen = true;
    a.vel.y = -DROP.GLIDE_DESCENT;
    this.emit('glide', { actorId: a.id });
    return true;
  }

  stepActors(dt) {
    const m = this.match;

    for (const a of this.actors) {
      if (!a.alive) continue;

      if (a.fireCooldown > 0) a.fireCooldown -= dt;
      if (a.recoilKick > 0) a.recoilKick = Math.max(0, a.recoilKick - a.recoilKick * 6 * dt);

      const w = a.weapon;
      if (w) {
        if (w.reloading > 0) {
          w.reloading -= dt;
          if (w.reloading <= 0) this.finishReload(a, w);
        }
        if (w.burst > 1 && a.burstLeft > 0) {
          a.burstTimer -= dt;
          if (a.burstTimer <= 0 && a.fireCooldown <= 0 && w.ammo > 0) {
            this.fireWeapon(a, w);
            a.burstLeft--;
            a.burstTimer = 0;
          }
        }
      }

      if (a.fallState === 'aboard') continue;

      let intent;
      if (a.isPlayer && this.playerIntent) {
        intent = this.playerIntent;
      } else {
        const bot = this.bots.get(a.id);
        intent = bot
          ? bot.update(dt, this)
          : { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false };
        if (a.fallState === 'freefall') {
          const h = a.pos.y - this.terrain.heightAt(a.pos.x, a.pos.z);
          if (h < DROP.GLIDE_MIN_HEIGHT) this.openGlider(a);
        }
      }

      // Airborne actors get their own integrator: the walking integrator damps
      // horizontal velocity toward the movement intent, which would fight the
      // glider's airspeed and freefall's terminal velocity.
      if (a.fallState === 'gliding' || a.fallState === 'freefall') {
        this.integrateAirborne(a, dt, intent);
      } else {
        a.updateMovement(dt, this, intent);
      }

      if (a.pendingFallDamage) {
        const res = applyDamage(a, a.pendingFallDamage);
        a.pendingFallDamage = 0;
        if (res.killed) { a.deathCause = 'fall'; this.eliminate(a, null, 'fall'); }
      }

      this.props.resolveCircle(a.pos, a.radius, a.height);

      if (!this.storm.isSafe(a.pos.x, a.pos.z) && a.fallState === 'ground') {
        const res = this.stormDamage(a, this.storm.currentDps() * dt);
        if (res.killed) { a.deathCause = 'storm'; this.eliminate(a, null, 'storm'); }
      }

      if (m.state === MATCH_STATE.FREEFALL &&
          this.actors.every((x) => x.fallState !== 'aboard' && x.grounded)) {
        m.setState(MATCH_STATE.PLAYING);
      }
    }

    this.storm.update(dt);
  }

  /** Flight physics for freefall and gliding. */
  integrateAirborne(a, dt, intent) {
    const gliding = a.fallState === 'gliding';

    const speed = gliding ? DROP.GLIDE_SPEED : DROP.FREEFALL_SPEED;
    const fx = intent.fwd || 0;
    const sx = intent.strafe || 0;
    const inLen = Math.hypot(fx, sx);
    a.moving = inLen > 0.01;
    if (a.moving) {
      const cos = Math.cos(a.yaw), sin = Math.sin(a.yaw);
      const dx = cos * fx - sin * sx;
      const dz = sin * fx + cos * sx;
      const l = Math.hypot(dx, dz) || 1;
      const s = Math.min(1, inLen);
      a.vel.x = (dx / l) * speed * s;
      a.vel.z = (dz / l) * speed * s;
    } else {
      a.vel.x = 0;
      a.vel.z = 0;
    }

    const sink = gliding ? DROP.GLIDE_DESCENT : DROP.FREEFALL_TERMINAL;
    if (a.vel.y > -sink) a.vel.y = Math.max(a.vel.y - DROP.FALL_ACCEL * dt, -sink);

    const prevY = a.pos.y;
    a.pos.x += a.vel.x * dt;
    a.pos.y += a.vel.y * dt;
    a.pos.z += a.vel.z * dt;
    a.speed = Math.hypot(a.vel.x, a.vel.z);

    const groundH = this.terrain.heightAt(a.pos.x, a.pos.z);
    const floorY = Math.max(
      groundH, WATER_LEVEL,
      this.build.surfaceAt(a.pos.x, a.pos.z, prevY + 0.5).y,
    );
    if (a.pos.y <= floorY) {
      a.pos.y = floorY;
      a.vel.y = 0;
      a.grounded = true;
      const dmg = dropDamage(prevY - floorY, gliding);
      if (dmg > 0) a.pendingFallDamage = (a.pendingFallDamage || 0) + dmg;
      a.fallState = 'ground';
      a.glideOpen = false;
      const bot = this.bots.get(a.id);
      if (bot) bot.onLanded(this);
      this.emit('landed', { actorId: a.id });
    } else {
      a.grounded = false;
    }

    const r = Math.hypot(a.pos.x, a.pos.z);
    if (r > 545) {
      const k = 545 / r;
      a.pos.x *= k;
      a.pos.z *= k;
    }
  }

  fireWeapon(a, w) { return tryFire(a, this); }

  finishReload(a, w) {
    const ammoType = a.inventory.ammoTypeFor(w);
    const reserve = a.inventory.ammo[ammoType] || 0;
    const take = Math.min(w.magazine - w.ammo, reserve);
    if (take > 0) {
      w.ammo += take;
      a.inventory.ammo[ammoType] -= take;
    }
    w.reloading = 0;
  }

  stormDamage(a, amount) {
    const res = applyDamage(a, amount);
    if (res.killed) this.eliminate(a, null, 'storm');
    return res;
  }

  stepConsumables(dt) {
    for (const a of this.actors) {
      if (!a.alive || a.usingId === null) continue;
      const def = CONSUMABLES[a.usingId];
      a.useTimer += dt;
      // Cancelled by taking damage or sprinting away.
      if (a.useTimer > 0.35 && (a.speed > 5.5 || this.time - a.lastDamageTime < 0.4)) {
        a.usingId = null;
        this.emit('use-cancelled', { actorId: a.id });
        continue;
      }
      if (def.healPerSec) a.health = Math.min(MAX_HEALTH, a.health + def.healPerSec * dt);
      if (def.shieldPerSec) a.shield = Math.min(MAX_SHIELD, a.shield + def.shieldPerSec * dt);
      if (a.useTimer >= def.useTime) {
        this.emit('used', { actorId: a.id, item: def.name });
        a.usingId = null;
      }
    }
  }

  stepPickups() {
    for (const item of this.pickups) {
      if (item.pickedUp) continue;
      for (const a of this.actors) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - item.x, a.pos.z - item.z) > 2.0) continue;
        if (item.kind === 'chest') { this.openChestFor(a, item); break; }
        this.tryPickup(a, item);
        break;
      }
    }
  }

  tryPickup(a, item) {
    if (!item || item.pickedUp || !a.alive) return false;
    const inv = a.inventory;
    let taken = false;

    switch (item.kind) {
      case 'weapon': {
        const res = inv.addWeapon(item.weapon);
        taken = true;
        if (res.replaced) this.spawnPickup('weapon', { weapon: res.replaced }, a.pos.x, a.pos.y, a.pos.z);
        break;
      }
      case 'ammo': {
        const got = inv.addAmmo(item.ammoId, item.count);
        taken = got > 0;
        item.count -= got;
        break;
      }
      case 'consumable': {
        const got = inv.addConsumable(item.consumableId, item.count);
        taken = got > 0;
        item.count -= got;
        break;
      }
      case 'material': {
        const got = inv.addMaterial(item.materialId, item.count);
        taken = got > 0;
        item.count -= got;
        break;
      }
      default:
        return false;
    }

    if (item.count !== undefined && item.count <= 0) taken = true;
    if (taken) {
      item.pickedUp = true;
      const idx = this.pickups.indexOf(item);
      if (idx >= 0) this.pickups.splice(idx, 1);
      this.emit('pickup', { actorId: a.id, kind: item.kind, label: pickupLabel(item) });
    }
    return taken;
  }

  spawnPickup(kind, payload, x, y, z) {
    const p = makePickup(kind, payload, x, y + 0.4, z);
    this.pickups.push(p);
    return p;
  }

  openChestFor(a, chest) {
    if (chest.opened) return;
    chest.opened = true;
    const drops = openChest(this.rng, chest.x, chest.y, chest.z, this.storm.phase);
    for (const d of drops) this.pickups.push(d);
    this.emit('chest-opened', { actorId: a.id, x: chest.x, y: chest.y, z: chest.z });
    chest.pickedUp = true;
    const idx = this.pickups.indexOf(chest);
    if (idx >= 0) this.pickups.splice(idx, 1);
  }

  stepStorm() {
    if (this.storm.justAdvanced) {
      this.emit('storm-advance', {
        phase: this.storm.phase, radius: this.storm.r,
        nextRadius: this.storm.to.r, dps: this.storm.currentDps(),
      });
    }
  }

  /**
   * Route every death through one place. Damage can kill an actor from bullets,
   * splash, the storm or a fall, each calling `applyDamage` directly; rather than
   * duplicating bookkeeping in each path, sweep for actors that are dead but
   * have not yet been given a placement.
   */
  stepEliminations() {
    for (const a of this.actors) {
      if (a.alive) continue;
      if (a.placement !== null && a.placement !== undefined) continue;
      const cause = a.eliminatedBy != null ? 'gun' : (a.deathCause || 'storm');
      this.eliminate(a, a.eliminatedBy, cause);
    }
  }

  eliminate(actor, killerId, cause = 'gun') {
    if (actor.placement !== null && actor.placement !== undefined) return null;
    actor.alive = false;
    actor.deathCause = cause;
    const place = this.match.eliminate(actor);
    actor.usingId = null;
    this.emit('eliminated', {
      actorId: actor.id,
      name: actor.name,
      killerId: killerId ?? actor.eliminatedBy,
      place,
      cause,
      storm: cause === 'storm',
    });
    if (this.player && actor.id === this.player.id) {
      this.result = this.buildResult(actor, false);
    }
    return place;
  }

  buildResult(player, won) {
    return {
      won,
      placement: player.placement,
      kills: player.kills,
      damage: Math.round(player.damageTaken),
      survived: this.time,
      circles: this.storm.phase,
    };
  }

  checkEnd() {
    if (this.ended) return;
    const alive = this.actors.filter((a) => a.alive);
    if (alive.length <= 1) {
      this.ended = true;
      const winner = alive[0] || null;
      if (winner) {
        winner.placement = 1;
        this.match.winner = winner.id;
        if (winner.id === this.player.id) {
          this.result = this.buildResult(winner, true);
          this.emit('victory', {});
        }
      }
      this.match.setState(MATCH_STATE.ENDED);
      this.emit('match-end', {
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : null,
      });
      if (this.player && !this.result) {
        this.result = this.buildResult(this.player, false);
      }
    }
  }

  // -------------------------------------------------------- player API

  setPlayerIntent(intent) { this.playerIntent = intent; }

  playerFire() {
    const a = this.player;
    if (!a || !a.alive) return null;
    return tryFire(a, this);
  }

  playerReload() {
    const a = this.player;
    return a ? tryReload(a) : false;
  }

  playerHarvest() {
    const a = this.player;
    return a ? tryHarvest(a, this) : null;
  }

  playerJump() {
    const a = this.player;
    if (!a) return false;
    if (a.fallState === 'aboard') { this.jump(a); return true; }
    if (a.fallState === 'freefall') return this.openGlider(a);
    return false;
  }

  playerBuild(rot = null) {
    const a = this.player;
    if (!a || !a.alive) return null;
    const spec = BUILD_TYPES[a.buildIndex % BUILD_TYPES.length];
    const target = this.aimBuildTarget(a);
    if (!target) {
      a.lastBuildBlockedAt = this.time;
      this.emit('build-failed', { reason: 'No target' });
      return null;
    }
    const useRot = rot === null ? a.buildRot : rot;
    const piece = this.build.tryPlace(spec.type, target.gx, target.gy, target.gz, useRot, a, this.actors);
    if (piece) {
      a.lastBuildAt = this.time;
      this.stats.piecesBuilt++;
    } else {
      a.lastBuildBlockedAt = this.time;
      this.emit('build-failed', { reason: this.build.lastReason || 'Blocked' });
    }
    return piece;
  }

  /** Where the player's build should land: the aim ray walked onto the grid. */
  aimBuildTarget(a) {
    const origin = a.eyePos;
    const dir = a.aimDir();
    const spec = BUILD_TYPES[a.buildIndex % BUILD_TYPES.length];

    let best = null;
    const reach = BUILD_REACH;
    for (let t = 0.6; t <= reach; t += 0.28) {
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const cell = { gx: Math.floor(px), gy: Math.floor(py), gz: Math.floor(pz) };
      if (this.build.grid.anyInCell(cell.gx, cell.gy, cell.gz)) return cell;
      if (best === null) best = cell;
    }

    const t = Math.max(1.2, (origin.y - this.terrain.heightAt(
      origin.x + dir.x * reach, origin.z + dir.z * reach)) / Math.max(0.2, -dir.y));
    const tx = origin.x + dir.x * t;
    const tz = origin.z + dir.z * t;
    const ty = this.terrain.heightAt(tx, tz);
    const cell = { gx: Math.floor(tx), gy: Math.floor(ty), gz: Math.floor(tz) };

    if (spec.type === PIECE.WALL) {
      // Walls snap to the cell in front of the player at body height.
      cell.gx = Math.floor(a.pos.x + dir.x * 2.2);
      cell.gz = Math.floor(a.pos.z + dir.z * 2.2);
      cell.gy = Math.floor(a.pos.y);
    } else {
      cell.gy = Math.floor(ty + 1.05);
    }
    return cell;
  }

  playerCycleMaterial(dir) {
    const a = this.player;
    if (!a) return null;
    a.inventory.cycleBuildMaterial(dir);
    a.buildMaterial = a.inventory.buildMaterial;
    return a.buildMaterial;
  }

  playerUseConsumable(id) {
    const a = this.player;
    if (!a || !a.alive) return false;
    if (a.usingId) return false;
    if (a.inventory.countConsumable(id) <= 0) return false;
    if (!consumableUseful(id, a)) return false;
    a.usingId = id;
    a.useTimer = 0;
    return true;
  }

  playerSelectSlot(i, swap = false) {
    const a = this.player;
    if (!a) return null;
    if (swap) {
      const w = a.inventory.takeSlot(i);
      if (w) {
        this.spawnPickup('weapon', { weapon: w }, a.pos.x, a.pos.y, a.pos.z);
        a.slot = a.inventory.active;
        return null;
      }
    }
    const w = a.inventory.setActive(i);
    a.slot = a.inventory.active;
    return w;
  }

  playerCycleWeapon(dir) {
    const a = this.player;
    if (!a) return null;
    const w = a.inventory.cycle(dir);
    a.slot = a.inventory.active;
    return w;
  }

  /** Nearest interactable for the HUD prompt. */
  playerInteractable() {
    const a = this.player;
    if (!a || !a.alive) return null;
    const eye = a.eyePos;
    const dir = a.aimDir();
    let best = null;
    let bestScore = -Infinity;

    for (const item of this.pickups) {
      if (item.pickedUp) continue;
      const dx = item.x - eye.x;
      const dy = item.y + 0.4 - eye.y;
      const dz = item.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 3.4) continue;
      const dot = d > 0.01 ? (dx * dir.x + dy * dir.y + dz * dir.z) / d : 1;
      if (dot < 0.35) continue;
      const score = dot * 2 - d * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'pickup', item, label: pickupLabel(item) };
      }
    }

    const prop = this.props.nearest(a.pos.x, a.pos.y, a.pos.z, 2.6);
    if (prop && bestScore < 1.0) {
      const salvaging = prop.kind === PROP.CAR || prop.kind === PROP.CRATE || prop.kind === PROP.WRECK;
      best = {
        kind: 'prop', prop,
        label: salvaging ? `Salvage ${prop.def.label}` : `Harvest ${prop.def.label}`,
      };
    }
    return best;
  }

  hud() {
    const a = this.player;
    return {
      match: this.match.hud(),
      storm: this.storm.hud(),
      actor: a ? {
        id: a.id, alive: a.alive,
        health: Math.max(0, Math.round(a.health)),
        shield: Math.max(0, Math.round(a.shield)),
        kills: a.kills, placement: a.placement,
        fallState: a.fallState, glideOpen: a.glideOpen,
      } : null,
      inventory: a ? a.inventory.snapshot() : null,
      stormSafe: a ? this.storm.isSafe(a.pos.x, a.pos.z) : true,
      outsideBy: a ? Math.round(this.storm.distanceOutside(a.pos.x, a.pos.z)) : 0,
      pickupCount: this.pickups.length,
      pieces: this.build.count(),
      bots: this.bots.size,
    };
  }
}

export { MATCH_STATE, DROP, POIS, WATER_LEVEL, tryHarvest };
