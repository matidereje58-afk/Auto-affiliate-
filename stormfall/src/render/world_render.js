// Rendering for build pieces, the storm wall, loot pickups and effects.

import * as THREE from '../../vendor/three.module.js';
import { PIECE, pieceBounds, CELL, THICK } from '../sim/grid.js';
import { MATERIALS } from '../sim/materials.js';
import { pickupColour } from '../sim/loot.js';

// ===========================================================================
// Build pieces
// ===========================================================================

export class BuildRender {
  constructor(build) {
    this.build = build;
    this.group = new THREE.Group();
    this.group.name = 'build-pieces';
    this.pools = new Map();
    this.version = -1;
    this.active = new Map();

    this.materialFor = {
      wood: new THREE.MeshStandardMaterial({ color: MATERIALS.wood.colour, roughness: 0.92 }),
      brick: new THREE.MeshStandardMaterial({ color: MATERIALS.brick.colour, roughness: 0.95 }),
      metal: new THREE.MeshStandardMaterial({ color: MATERIALS.metal.colour, roughness: 0.5, metalness: 0.45 }),
    };
    this._geoCache = new Map();
  }

  _geo(type) {
    if (this._geoCache.has(type)) return this._geoCache.get(type);
    let geo;
    if (type === PIECE.FLOOR || type === PIECE.ROOF) {
      geo = new THREE.BoxGeometry(CELL, THICK, CELL);
    } else if (type === PIECE.WALL) {
      geo = new THREE.BoxGeometry(CELL, CELL, THICK);
    } else {
      // Stair: three stepped boxes merged into one geometry.
      const parts = [];
      for (let i = 0; i < 3; i++) {
        const b = new THREE.BoxGeometry(CELL / 3, (CELL / 3) * (i + 1), CELL);
        b.translate((i * CELL) / 3 + CELL / 6, ((CELL / 3) * (i + 1)) / 2, 0);
        parts.push(b);
      }
      geo = mergeGeometries(parts);
    }
    this._geoCache.set(type, geo);
    return geo;
  }

  _acquire(type, materialId) {
    const key = `${type}:${materialId}`;
    let pool = this.pools.get(key);
    if (!pool) { pool = []; this.pools.set(key, pool); }
    if (pool.length) return pool.pop();
    const mesh = new THREE.Mesh(this._geo(type), this.materialFor[materialId]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _release(key, mesh) {
    let pool = this.pools.get(key);
    if (!pool) { pool = []; this.pools.set(key, pool); }
    mesh.visible = false;
    if (!mesh.parent) this.group.add(mesh);
    pool.push(mesh);
  }

  update() {
    if (this.build.version === this.version) return;
    this.version = this.build.version;

    for (const [id, entry] of this.active) {
      const piece = entry.piece;
      if (!piece || piece.hp <= 0 || !this.build.grid.pieces.has(piece.key)) {
        this._release(entry.key, entry.mesh);
        this.active.delete(id);
      }
    }

    for (const piece of this.build.grid.all()) {
      const existing = this.active.get(piece.id);
      if (existing) { existing.piece = piece; continue; }

      const key = `${piece.type}:${piece.material}`;
      const mesh = this._acquire(piece.type, piece.material);
      mesh.visible = true;
      const b = pieceBounds(piece.type, piece.gx, piece.gy, piece.gz, piece.rot);
      mesh.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      if (piece.type === PIECE.STAIR) {
        // The merged stair geometry is authored along +X within the cell.
        mesh.position.set(piece.gx * CELL + CELL / 2, piece.gy * CELL, (piece.gz + 0.5) * CELL);
        mesh.rotation.y = piece.rot ? Math.PI : 0;
      } else {
        mesh.rotation.y = 0;
      }
      this.active.set(piece.id, { mesh, piece, key });
    }
  }
}

// ===========================================================================
// Storm wall
// ===========================================================================

const STORM_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STORM_FRAG = `
uniform float uTime;
uniform vec3 uInner;
uniform vec3 uOuter;
uniform float uOpacity;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float band = fract(vUv.y * 3.0 - uTime * 0.11);
  float pulse = 0.55 + 0.45 * sin(uTime * 2.1 + vUv.x * 22.0);
  float shimmer = hash(floor(vec2(vUv.x * 90.0, vUv.y * 26.0 - uTime * 1.4)));
  // Fade hard toward the top so the wall reads as a curtain at ground level
  // rather than a solid dome over the sky.
  float fade = pow(1.0 - smoothstep(0.05, 0.72, vUv.y), 1.6);
  vec3 col = mix(uInner, uOuter, band * 0.8 + shimmer * 0.2);
  gl_FragColor = vec4(col, (0.34 + 0.26 * pulse) * uOpacity * fade);
}`;

export class StormRender {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'storm';

    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uInner: { value: new THREE.Color(0x8f6bff) },
        uOuter: { value: new THREE.Color(0xff5aa8) },
        uOpacity: { value: 0.85 },
      },
      vertexShader: STORM_VERT,
      fragmentShader: STORM_FRAG,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.wall = new THREE.Mesh(geo, this.mat);
    this.wall.frustumCulled = false;
    this.group.add(this.wall);

    const ringGeo = new THREE.RingGeometry(0.985, 1.0, 96);
    ringGeo.rotateX(-Math.PI / 2);
    this.nextMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false,
    });
    this.nextRing = new THREE.Mesh(ringGeo, this.nextMat);
    this.nextRing.frustumCulled = false;
    this.group.add(this.nextRing);
  }

  update(storm, dt) {
    this.mat.uniforms.uTime.value += dt;
    const r = Math.max(0.6, storm.r);
    const h = 120;
    this.wall.position.set(storm.cx, h * 0.34, storm.cz);
    this.wall.scale.set(r, h, r);

    const showNext = Math.abs(storm.to.r - storm.r) > 1.2 && storm.state !== 'done';
    this.nextRing.visible = showNext;
    if (showNext) {
      this.nextRing.position.set(storm.to.cx, 0.9, storm.to.cz);
      this.nextRing.scale.set(storm.to.r, 1, storm.to.r);
      this.nextMat.opacity = storm.state === 'shrink' ? 0.28 : 0.55;
    }
  }
}

// ===========================================================================
// Pickups
// ===========================================================================

const PICKUP_GEO = new THREE.OctahedronGeometry(0.34, 0);
const CHEST_GEO = new THREE.BoxGeometry(1.1, 0.72, 0.8);
const CHEST_LID = new THREE.BoxGeometry(1.14, 0.22, 0.84);

export class PickupRender {
  constructor(pickups) {
    this.pickups = pickups;
    this.group = new THREE.Group();
    this.group.name = 'pickups';
    this.items = new Map();
    this.pool = [];
    this.chestPool = [];
    this.chestMat = new THREE.MeshStandardMaterial({ color: 0xb08040, roughness: 0.7, metalness: 0.3 });
    this.lidMat = new THREE.MeshStandardMaterial({ color: 0xd8a850, roughness: 0.55, metalness: 0.35 });
    this.time = 0;
    /** Beyond this range a pickup is not drawn at all. */
    this.viewRange = 130;
    /** Hard cap on simultaneously drawn pickups, nearest first. */
    this.maxVisible = 90;
  }

  _acquire(isChest) {
    const pool = isChest ? this.chestPool : this.pool;
    if (pool.length) { const o = pool.pop(); o.visible = true; return o; }
    let o;
    if (isChest) {
      o = new THREE.Group();
      const body = new THREE.Mesh(CHEST_GEO, this.chestMat);
      body.castShadow = true;
      o.add(body);
      const lid = new THREE.Mesh(CHEST_LID, this.lidMat);
      lid.position.y = 0.45;
      lid.castShadow = true;
      o.add(lid);
      o.userData.lid = lid;
    } else {
      o = new THREE.Mesh(PICKUP_GEO, new THREE.MeshStandardMaterial({
        roughness: 0.35, metalness: 0.25,
      }));
      o.castShadow = true;
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.6, 14),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -0.3;
      o.add(glow);
    }
    this.group.add(o);
    return o;
  }

  /**
   * Only pickups near the player are drawn. With ~1500 items in a match,
   * instancing everything would cost more than it is worth and would push most
   * of them through the far plane anyway.
   */
  update(dt, focus) {
    this.time += dt;
    const seen = new Set();
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    const near = [];

    for (const p of this.pickups) {
      if (p.pickedUp) continue;
      const dx = p.x - fx;
      const dz = p.z - fz;
      const d2 = dx * dx + dz * dz;
      if (d2 > this.viewRange * this.viewRange) continue;
      near.push({ p, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    if (near.length > this.maxVisible) near.length = this.maxVisible;

    for (const { p } of near) {
      seen.add(p.id);
      const isChest = p.kind === 'chest';
      let o = this.items.get(p.id);
      if (!o) {
        o = this._acquire(isChest);
        this.items.set(p.id, o);
        if (!isChest) {
          const c = pickupColour(p);
          o.material.color.setHex(c);
          if (o.material.emissive) o.material.emissive.setHex(c);
        }
      }
      o.visible = true;
      const bob = isChest ? 0 : Math.sin(this.time * 2.2 + p.bob) * 0.16;
      o.position.set(p.x, p.y + bob, p.z);
      if (!isChest) o.rotation.y += dt * 1.4;
    }

    // Recycle anything that left the range or vanished from the sim.
    for (const [id, o] of this.items) {
      if (seen.has(id)) continue;
      o.visible = false;
      (o.children.length > 1 ? this.chestPool : this.pool).push(o);
      this.items.delete(id);
    }
  }
}

// ===========================================================================
// Effects
// ===========================================================================

export class Effects {
  constructor(max = 220) {
    this.group = new THREE.Group();
    this.group.name = 'effects';
    this.time = 0;

    this.tracerGeo = new THREE.BoxGeometry(0.045, 0.045, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xfff0b0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracers = [];
    for (let i = 0; i < Math.floor(max * 0.6); i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0, ttl: 0.07 });
    }

    this.sparkGeo = new THREE.SphereGeometry(0.14, 5, 4);
    this.sparks = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({
        color: 0xffcc66, transparent: true, depthWrite: false,
      }));
      m.visible = false;
      this.group.add(m);
      this.sparks.push({ mesh: m, life: 0, ttl: 0.3, vel: { x: 0, y: 0, z: 0 } });
    }

    this.blastGeo = new THREE.SphereGeometry(1, 12, 10);
    this.blasts = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.blastGeo, new THREE.MeshBasicMaterial({
        color: 0xffa03c, transparent: true, opacity: 0.6, depthWrite: false,
      }));
      m.visible = false;
      this.group.add(m);
      this.blasts.push({ mesh: m, life: 0, ttl: 0.42, radius: 1 });
    }
    this._cursor = 0;
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[this._cursor++ % this.tracers.length];
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    t.mesh.visible = true;
    t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.mesh.lookAt(to.x, to.y, to.z);
    t.mesh.scale.set(1, 1, len);
    t.life = 0.07;
  }

  impact(point, colour = 0xffcc66, count = 5) {
    for (let i = 0; i < count; i++) {
      const s = this.sparks.find((x) => x.life <= 0);
      if (!s) return;
      s.mesh.visible = true;
      s.mesh.position.set(point.x, point.y, point.z);
      s.mesh.material.color.setHex(colour);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      s.vel = { x: Math.cos(a) * sp, y: Math.random() * 4, z: Math.sin(a) * sp };
      s.life = 0.3;
    }
  }

  explosion(point, radius) {
    const b = this.blasts.find((x) => x.life <= 0) || this.blasts[0];
    b.mesh.visible = true;
    b.mesh.position.set(point.x, point.y, point.z);
    b.mesh.scale.setScalar(radius * 0.3);
    b.radius = radius;
    b.life = 0.42;
    this.impact(point, 0xff9a3c, 10);
  }

  update(dt) {
    this.time += dt;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = 0.9 * (t.life / 0.07);
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vel.y -= 16 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      const k = s.life / 0.3;
      s.mesh.scale.setScalar(k);
      s.mesh.material.opacity = k;
    }
    for (const b of this.blasts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.mesh.visible = false; continue; }
      const k = 1 - b.life / 0.42;
      b.mesh.scale.setScalar(b.radius * (0.3 + k * 0.95));
      b.mesh.material.opacity = 0.62 * (1 - k);
    }
  }
}

/** Merge BufferGeometries sharing the same attribute layout. */
function mergeGeometries(list) {
  const out = new THREE.BufferGeometry();
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  for (const name of ['position', 'normal', 'uv']) {
    if (!list[0].attributes[name]) continue;
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of list) {
      const a = g.attributes[name];
      arr.set(a.array, off);
      off += a.array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = [];
  let vbase = 0;
  for (const g of list) {
    const gi = g.index;
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vbase);
    else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + vbase);
    vbase += g.attributes.position.count;
    g.dispose();
  }
  out.setIndex(idx);
  return out;
}

export { mergeGeometries };
