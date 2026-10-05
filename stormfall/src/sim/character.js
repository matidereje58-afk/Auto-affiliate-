// Actor: shared state and movement for the player and every bot.
//
// Movement is deliberately slower than a typical shooter. In a battle royale the
// walk speed *is* the combat pacing - fast movement removes the value of
// building cover, so these numbers are tuned low on purpose.

import { clamp, damp, yawToDir } from './math.js';
import { Inventory } from './inventory.js';
import { MAX_HEALTH, MAX_SHIELD, fallDamage } from './health.js';
import { WATER_LEVEL } from './terrain.js';

export const GRAVITY = 22;
export const JUMP_VELOCITY = 6.7;
export const SPEED = { walk: 5.4, sprint: 7.7, crouch: 2.9, swim: 3.3, air: 5.6 };

export const BODY_RADIUS = 0.42;
export const BODY_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const CROUCH_HEIGHT = 1.25;
export const CROUCH_EYE = 1.1;

export const HEAD_RADIUS = 0.28;
export const HEAD_Y = BODY_HEIGHT - 0.28;
export const STEP_HEIGHT = 0.55;

let NEXT_ID = 1;

export class Actor {
  constructor({ id, name = 'Player', isPlayer = false, x = 0, y = 0, z = 0 }) {
    this.id = id ?? NEXT_ID++;
    this.name = name;
    this.isPlayer = isPlayer;
    this.kind = isPlayer ? 'player' : 'bot';

    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.radius = BODY_RADIUS;
    this.height = BODY_HEIGHT;
    this.eyeHeight = EYE_HEIGHT;

    this.alive = true;
    this.health = MAX_HEALTH;
    this.shield = 0;
    this.damageTaken = 0;
    this.kills = 0;
    this.lastAttackerId = null;
    this.lastDamageTime = -99;
    this.lastDamageDir = null;
    this.eliminatedBy = null;
    this.eliminatedAt = null;
    this.deathCause = null;
    this.placement = null;
    this.time = 0;

    this.grounded = false;
    this.crouching = false;
    this.sprinting = false;
    this.swimming = false;
    this.inWater = false;
    this.waterDepth = 0;
    this.onBuildPiece = false;
    this.moving = false;
    this.speed = 0;
    this.stamina = 1;

    this.inventory = new Inventory();
    this.bag = this.inventory.bag;
    this.buildMaterial = 'wood';
    this.slot = 0;
    this.dropTarget = null;
    this.deployAt = 0;

    this.fireCooldown = 0;
    this.lastDryFire = -9;
    this.reloadTimer = 0;
    this.recoilKick = 0;
    this.aiming = false;
    this.burstLeft = 0;
    this.burstTimer = 0;

    this.harvestTarget = null;
    this.harvestProgress = 0;
    this.harvestTimer = 0;
    this.buildIndex = 0;
    this.buildRot = 0;
    this.lastBuildAt = -99;
    this.lastBuildBlockedAt = -99;

    this.usingId = null;
    this.useTimer = 0;

    /** aboard | freefall | gliding | ground */
    this.fallState = 'aboard';
    this.glideOpen = false;
    this.pendingFallDamage = 0;
  }

  get eyePos() {
    return {
      x: this.pos.x,
      y: this.pos.y + (this.crouching ? CROUCH_EYE : this.eyeHeight),
      z: this.pos.z,
    };
  }

  get headPos() { return { x: this.pos.x, y: this.pos.y + HEAD_Y, z: this.pos.z }; }

  get chestPos() {
    return {
      x: this.pos.x,
      y: this.pos.y + (this.crouching ? 0.75 : 1.15),
      z: this.pos.z,
    };
  }

  get weapon() { return this.inventory.current; }

  get fallSpeed() { return -this.vel.y; }

  aimDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: Math.cos(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: Math.sin(this.yaw) * cp,
    };
  }

  horizontalAim() { return yawToDir(this.yaw); }

  isEnemyOf(other) {
    if (this === other) return false;
    if (!this.alive || !other.alive) return false;
    return this.id !== other.id;
  }

  /** Integrate ground movement for one step. */
  updateMovement(dt, world, intent) {
    const { terrain, build } = world;
    this.time += dt;

    if (intent.yaw !== undefined) this.yaw = intent.yaw;
    if (intent.pitch !== undefined) this.pitch = clamp(intent.pitch, -1.45, 1.45);

    this.crouching = !!intent.crouch && this.grounded;
    this.sprinting = !!intent.sprint && !this.crouching && (intent.fwd || 0) > 0.1;

    const targetHeight = this.crouching ? CROUCH_HEIGHT : BODY_HEIGHT;
    if (targetHeight > this.height) {
      const probe = {
        min: { x: this.pos.x - this.radius, y: this.pos.y + this.height, z: this.pos.z - this.radius },
        max: { x: this.pos.x + this.radius, y: this.pos.y + targetHeight, z: this.pos.z + this.radius },
      };
      if (build.boxFree(probe)) this.height = damp(this.height, targetHeight, 18, dt);
    } else {
      this.height = damp(this.height, targetHeight, 18, dt);
    }

    const groundH = terrain.heightAt(this.pos.x, this.pos.z);
    this.waterDepth = Math.max(0, WATER_LEVEL - groundH);
    const headY = this.pos.y + this.height;
    this.swimming = this.waterDepth > 1.25 && headY < WATER_LEVEL + 0.35;
    this.inWater = this.waterDepth > 0.3;

    const f = intent.fwd || 0;
    const s = intent.strafe || 0;
    const inLen = Math.hypot(f, s);
    let speed = 0;
    if (inLen > 0.01) {
      if (this.swimming) speed = SPEED.swim;
      else if (this.crouching) speed = SPEED.crouch;
      else if (this.sprinting) speed = SPEED.sprint;
      else if (!this.grounded) speed = SPEED.air;
      else speed = SPEED.walk;
      speed *= Math.min(1, inLen);
    }
    this.moving = inLen > 0.01;

    if (this.sprinting && speed > 0) this.stamina = Math.max(0, this.stamina - dt * 0.10);
    else this.stamina = Math.min(1, this.stamina + dt * 0.24);
    if (this.stamina <= 0.01) this.sprinting = false;

    if (this.moving) {
      const moveYaw = Math.atan2(
        Math.sin(this.yaw) * f + Math.cos(this.yaw) * s,
        Math.cos(this.yaw) * f - Math.sin(this.yaw) * s,
      );
      if (!this.aiming) this.yaw = moveYaw;
      const dir = yawToDir(moveYaw);
      this.vel.x = damp(this.vel.x, dir.x * speed, this.grounded ? 26 : 9, dt);
      this.vel.z = damp(this.vel.z, dir.z * speed, this.grounded ? 26 : 9, dt);
    } else {
      const rate = this.swimming ? 5 : (this.grounded ? 22 : 4);
      this.vel.x = damp(this.vel.x, 0, rate, dt);
      this.vel.z = damp(this.vel.z, 0, rate, dt);
    }

    if (this.swimming) {
      const surfaceY = WATER_LEVEL - this.waterDepth + this.height - 0.35;
      const target = Math.max(groundH, surfaceY);
      this.vel.y = intent.jump ? 3.2 : damp(this.vel.y, (target - this.pos.y) * 3.2, 8, dt);
      if (this.pos.y < groundH) { this.pos.y = groundH; this.vel.y = 0; }
      this.grounded = false;
    } else {
      // Gravity always pulls while airborne, in both directions of travel.
      this.vel.y -= GRAVITY * dt;
      if (intent.jump && this.grounded) {
        this.vel.y = JUMP_VELOCITY;
        this.grounded = false;
      }
      if (this.vel.y < 0) this.vel.y = Math.max(this.vel.y, -55);
    }

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    this.onBuildPiece = false;
    build.resolveActor(this);

    const groundTarget = build.surfaceAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
    const floorY = Math.max(groundTarget.y, terrain.heightAt(this.pos.x, this.pos.z));

    const wasGrounded = this.grounded;
    if (this.pos.y <= floorY + 0.02 && this.vel.y <= 0.01) {
      if (!wasGrounded && this.vel.y < -12 && !this.swimming) {
        this.pendingFallDamage = (this.pendingFallDamage || 0) + fallDamage(prevY - floorY);
      }
      this.pos.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    const r = Math.hypot(this.pos.x, this.pos.z);
    const LIMIT = 545;
    if (r > LIMIT) {
      const k = LIMIT / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }

    return this;
  }
}
