// Harvestable world props: trees, rocks, crates, barrels, cars.
//
// The simulation owns this list. The renderer instancing reads the same data,
// so what you see is exactly what you can chop. Trees, rocks and cars also act
// as movement colliders, which is what makes cover and tree fights work.

import { WATER_LEVEL, POIS } from './terrain.js';

export const PROP = {
  PINE: 'pine', TREE: 'tree', ROCK: 'rock', BUSH: 'bush',
  CRATE: 'crate', BARREL: 'barrel', CAR: 'car', WRECK: 'wreck',
};

export const PROP_DEFS = {
  [PROP.PINE]: {
    kind: PROP.PINE, hp: 220, hits: 5, material: 'wood', yields: [18, 24],
    solid: true, radius: 0.62, blocksSight: true, label: 'Pine Tree', felled: true,
  },
  [PROP.TREE]: {
    kind: PROP.TREE, hp: 240, hits: 5, material: 'wood', yields: [18, 24],
    solid: true, radius: 0.72, blocksSight: true, label: 'Tree', felled: true,
  },
  [PROP.ROCK]: {
    kind: PROP.ROCK, hp: 300, hits: 5, material: 'brick', yields: [12, 20],
    solid: true, radius: 1.05, blocksSight: false, label: 'Rock', felled: false,
  },
  [PROP.BUSH]: {
    kind: PROP.BUSH, hp: 60, hits: 1, material: 'wood', yields: [8, 10],
    solid: false, radius: 0.6, blocksSight: false, label: 'Bush', felled: false,
  },
  [PROP.CRATE]: {
    kind: PROP.CRATE, hp: 100, hits: 3, material: 'wood', yields: [10, 14],
    solid: true, radius: 0.72, blocksSight: false, label: 'Crate',
    loot: true, felled: false,
  },
  [PROP.BARREL]: {
    kind: PROP.BARREL, hp: 80, hits: 1, material: 'metal', yields: [0, 0],
    solid: true, radius: 0.6, blocksSight: false, label: 'Barrel',
    explosive: true, explosiveRadius: 4.6, explosiveDamage: 55, felled: false,
  },
  [PROP.CAR]: {
    kind: PROP.CAR, hp: 400, hits: 6, material: 'metal', yields: [14, 22],
    solid: true, radius: 1.5, blocksSight: false, label: 'Car',
    loot: true, felled: false,
  },
  [PROP.WRECK]: {
    kind: PROP.WRECK, hp: 300, hits: 5, material: 'metal', yields: [12, 20],
    solid: true, radius: 1.3, blocksSight: false, label: 'Wreck',
    loot: true, felled: false,
  },
};

let NEXT_PROP = 1;

export class PropSystem {
  constructor(terrain, rng, { density = 1 } = {}) {
    this.terrain = terrain;
    this.rng = rng;
    this.props = new Map();
    this.solid = [];
    this.events = [];
    this.pois = POIS;
    if (density > 0) this.generate(density);
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  add(kind, x, y, z, extra = {}) {
    const def = PROP_DEFS[kind];
    if (!def) throw new Error(`unknown prop ${kind}`);
    const p = {
      id: NEXT_PROP++,
      kind, def,
      x, y, z,
      rot: extra.rot ?? this.rng.range(0, Math.PI * 2),
      scale: extra.scale ?? 1,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      solid: def.solid,
      radius: def.radius * (extra.scale ?? 1),
    };
    this.props.set(p.id, p);
    if (p.solid) this.solid.push(p);
    return p;
  }

  remove(p) {
    p.alive = false;
    this.props.delete(p.id);
    const i = this.solid.indexOf(p);
    if (i >= 0) this.solid.splice(i, 1);
  }

  *all() { yield* this.props.values(); }

  count() { return this.props.size; }

  generate(density = 1) {
    const terrain = this.terrain;
    const rng = this.rng;
    const half = terrain.half;

    const inPoi = (x, z, pad) => {
      for (const p of this.pois) {
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < (p.r * pad) ** 2) return true;
      }
      return false;
    };

    const plan = [
      { kind: PROP.PINE, n: Math.floor(760 * density), minH: 8, maxSlope: 0.52 },
      { kind: PROP.TREE, n: Math.floor(560 * density), minH: 3, maxSlope: 0.48 },
      { kind: PROP.ROCK, n: Math.floor(300 * density), minH: 2, maxSlope: 1.3 },
      { kind: PROP.BUSH, n: Math.floor(380 * density), minH: 2, maxSlope: 0.6 },
    ];

    for (const spec of plan) {
      let placed = 0;
      let attempts = 0;
      const budget = spec.n * 16;
      while (placed < spec.n && attempts < budget) {
        attempts++;
        const x = rng.range(-half + 8, half - 8);
        const z = rng.range(-half + 8, half - 8);
        const h = terrain.heightAt(x, z);
        if (h < WATER_LEVEL + spec.minH) continue;
        if (terrain.slopeAt(x, z) > spec.maxSlope) continue;
        if (inPoi(x, z, 0.86)) continue;
        placed++;
        this.add(spec.kind, x, h, z, { scale: rng.range(0.82, 1.4) });
      }
    }

    // Structures cluster around POIs, which is where fights happen.
    const poiPlan = [
      { kind: PROP.CRATE, perPoi: Math.floor(11 * density) },
      { kind: PROP.BARREL, perPoi: Math.floor(5 * density) },
      { kind: PROP.CAR, perPoi: Math.floor(4 * density) },
      { kind: PROP.WRECK, perPoi: Math.floor(3 * density) },
    ];
    for (const poi of this.pois) {
      for (const spec of poiPlan) {
        const n = spec.kind === PROP.CAR
          ? Math.max(1, Math.round(spec.perPoi * (poi.r / 40)))
          : spec.perPoi;
        let placed = 0;
        let attempts = 0;
        while (placed < n && attempts < n * 40) {
          attempts++;
          const a = rng.range(0, Math.PI * 2);
          const d = Math.sqrt(rng.next()) * poi.r * 1.05;
          const x = poi.x + Math.cos(a) * d;
          const z = poi.z + Math.sin(a) * d;
          const h = terrain.heightAt(x, z);
          if (h < WATER_LEVEL + 0.6) continue;
          if (terrain.slopeAt(x, z) > 0.36) continue;
          placed++;
          this.add(spec.kind, x, h, z, { scale: 1 });
        }
      }
    }

    const roadCars = Math.floor(26 * density);
    for (let i = 0; i < roadCars; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(90, 380);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = terrain.heightAt(x, z);
      if (h < WATER_LEVEL + 1 || terrain.slopeAt(x, z) > 0.3) continue;
      this.add(PROP.CAR, x, h, z, { scale: 1 });
    }
  }

  harvest(prop, actor) {
    if (!prop || !prop.alive) return { destroyed: false, yield: 0, hitsLeft: 0 };
    const def = prop.def;
    const perHit = Math.max(1, Math.round(def.hp / def.hits));
    prop.hp -= perHit;

    const swing = 1 / def.hits;
    const granted = Math.round((def.yields[0] + (def.yields[1] - def.yields[0]) * swing) / 2);

    if (prop.hp <= 0) {
      prop.hp = 0;
      const pos = { x: prop.x, y: prop.y, z: prop.z };
      const wasExplosive = !!def.explosive;
      this.emit('prop-destroyed', { prop, pos, explosive: wasExplosive, kind: prop.kind });
      if (def.felled) {
        const i = this.solid.indexOf(prop);
        if (i >= 0) this.solid.splice(i, 1);
      }
      this.remove(prop);
      return { destroyed: true, yield: granted, hitsLeft: 0, explosive: wasExplosive };
    }

    actor.bag.add(def.material, granted);
    this.emit('prop-harvested', { prop, actorId: actor.id, yield: granted });
    return { destroyed: false, yield: granted, hitsLeft: def.hits };
  }

  nearest(x, y, z, r = 2.6, filter = null) {
    let best = null;
    let bestD = r * r;
    for (const p of this.props.values()) {
      if (!p.alive) continue;
      if (filter && !filter(p)) continue;
      const dx = p.x - x, dy = p.y + 1 - y, dz = p.z - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  colliders() { return this.solid; }

  /** Push a point out of every overlapping prop. */
  resolveCircle(p, r, actorHeight = 1.8) {
    let moved = false;
    for (const prop of this.solid) {
      if (!prop.alive) continue;
      const dx = p.x - prop.x;
      const dz = p.z - prop.z;
      const rr = prop.radius + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      if (d2 < 1e-9) {
        // Exactly at the centre: pick an arbitrary escape direction.
        p.x += rr;
        moved = true;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = rr - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      moved = true;
    }
    return moved;
  }

  /** Cheap segment-sampled line of sight through sight-blocking props. */
  blockedSight(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return false;
    const steps = Math.min(48, Math.max(4, Math.ceil(len / 1.2)));
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (let i = 1; i < steps; i++) {
      const x = from.x + sx * i;
      const y = from.y + sy * i;
      const z = from.z + sz * i;
      for (const prop of this.solid) {
        if (!prop.def.blocksSight || !prop.alive) continue;
        const r = prop.radius * 0.8;
        if ((prop.x - x) ** 2 + (prop.z - z) ** 2 < r * r &&
            y > prop.y && y < prop.y + 6) return true;
      }
    }
    return false;
  }
}
