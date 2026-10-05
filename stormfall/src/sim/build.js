// Build system: placement rules, durability, harvesting and collision.

import {
  CELL, THICK, PIECE, PIECE_NAME,
  pieceBounds, pieceCentre, PieceGrid, snapCell,
} from './grid.js';
import { MATERIALS, BUILD_COST } from './materials.js';
import { aabbOverlaps } from './math.js';
import { WATER_LEVEL } from './terrain.js';

let NEXT_ID = 1;

export class BuildSystem {
  constructor(terrain) {
    this.terrain = terrain;
    this.grid = new PieceGrid();
    this.events = [];
    /** Bumped on any structural change so renderers can skip idle frames. */
    this.version = 0;
    this.lastReason = '';
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  canPlace(type, gx, gy, gz, rot, builder, actors) {
    if (this.grid.anyInCell(gx, gy, gz)) return { ok: false, reason: 'Occupied' };
    if (this.grid.get(type, gx, gy, gz, rot)) return { ok: false, reason: 'Occupied' };

    const b = pieceBounds(type, gx, gy, gz, rot);
    const cost = BUILD_COST[PIECE_NAME[type]];
    const mat = builder.buildMaterial;
    if (!builder.bag.canAfford(mat, cost)) {
      return { ok: false, reason: `Need ${cost} ${MATERIALS[mat].name}` };
    }

    if (Math.abs(gx * CELL) > 520 || Math.abs(gz * CELL) > 520 || gy * CELL < -8) {
      return { ok: false, reason: 'Out of bounds' };
    }

    if (this._intersectsTerrain(b)) return { ok: false, reason: 'Blocked' };

    // Cannot place a piece containing a character.
    if (actors) {
      for (const a of actors) {
        if (!a.alive) continue;
        if (aabbOverlaps(actorBox(a), b)) return { ok: false, reason: 'Blocked' };
      }
    }

    if (!this._hasSupport(type, gx, gy, gz, rot)) {
      return { ok: false, reason: 'No support' };
    }
    return { ok: true, reason: '' };
  }

  /** Terrain intersection test using the piece's footprint corners. */
  _intersectsTerrain(b) {
    const t = this.terrain;
    // Floors and roofs are thin: reject only when the whole cell is underground.
    if (b.max.y - b.min.y < CELL * 0.5) {
      const hMax = Math.max(
        t.heightAt(b.min.x, b.min.z), t.heightAt(b.max.x, b.min.z),
        t.heightAt(b.min.x, b.max.z), t.heightAt(b.max.x, b.max.z),
      );
      return hMax > b.max.y + 0.15;
    }
    // Walls and stairs: allow the base to sit a little into the ground so a
    // player can still wall off a slope, but reject genuinely buried pieces.
    const hMax = Math.max(
      t.heightAt(b.min.x, b.min.z), t.heightAt(b.max.x, b.min.z),
      t.heightAt(b.min.x, b.max.z), t.heightAt(b.max.x, b.max.z),
    );
    return hMax > b.min.y + 0.6;
  }

  _hasSupport(type, gx, gy, gz, rot) {
    // Adjacent to any live piece: same layer, the cell directly below (which is
    // what lets floors stack), or diagonals on the layer below.
    const layerNeighbours = [
      [gx - 1, gy, gz], [gx + 1, gy, gz], [gx, gy, gz - 1], [gx, gy, gz + 1],
      [gx, gy - 1, gz],
      [gx - 1, gy - 1, gz], [gx + 1, gy - 1, gz],
      [gx - 1, gy, gz - 1], [gx + 1, gy, gz + 1],
    ];
    for (const [ax, ay, az] of layerNeighbours) {
      if (this.grid.anyInCell(ax, ay, az)) return true;
    }

    // Ground contact, measured against the cell's own y band rather than the
    // piece's visual bottom so a floor in the cell above the ground always
    // counts as supported instead of only sometimes.
    const groundY = this.terrain.heightAt(gx + 0.5, gz + 0.5);
    const cellY = gy * CELL;
    if (Math.abs(cellY - groundY) <= 1.0) return true;
    if (groundY < WATER_LEVEL && Math.abs(cellY - WATER_LEVEL) <= 1.0) return true;
    return false;
  }

  tryPlace(type, gx, gy, gz, rot, builder, actors) {
    const check = this.canPlace(type, gx, gy, gz, rot, builder, actors);
    if (!check.ok) { this.lastReason = check.reason; return null; }

    const cost = BUILD_COST[PIECE_NAME[type]];
    const matId = builder.buildMaterial;
    builder.bag.spend(matId, cost);

    const mat = MATERIALS[matId];
    const piece = {
      id: NEXT_ID++,
      type, gx, gy, gz, rot,
      material: matId,
      hp: mat.hp,
      maxHp: mat.hp,
      ownerId: builder.id,
      fresh: true,
    };
    this.grid.add(piece);
    this.version++;
    this.emit('build', { piece, builderId: builder.id });
    return piece;
  }

  damagePiece(piece, amount) {
    if (!piece || piece.hp <= 0) return { destroyed: false, piece };
    piece.hp -= amount;
    if (piece.hp <= 0) {
      piece.hp = 0;
      this.grid.remove(piece);
      this.version++;
      this.emit('piece-destroyed', {
        piece,
        centre: pieceCentre(piece.type, piece.gx, piece.gy, piece.gz, piece.rot),
      });
      return { destroyed: true, piece };
    }
    this.version++;
    this.emit('piece-damaged', { piece, amount });
    return { destroyed: false, piece };
  }

  harvestPiece(piece, actor) {
    if (!piece || piece.hp <= 0) return { yield: 0, destroyed: false, damage: 0 };
    const mat = MATERIALS[piece.material];
    const perHit = Math.max(1, Math.round(mat.hp / mat.harvestHits));
    const damage = Math.min(piece.hp, perHit);

    const swing = Math.min(1, damage / mat.hp) * mat.harvestHits;
    const granted = Math.round(swing * mat.yieldPerHit * 0.5);

    const before = piece.hp;
    const res = this.damagePiece(piece, damage);
    const actual = before - piece.hp;

    const yieldAmt = res.destroyed
      ? granted
      : Math.max(1, Math.round((actual / mat.hp) * mat.hp * 0.12 / 5) * 5);

    actor.bag.add(piece.material, yieldAmt);
    this.emit('harvest-piece', { piece, actorId: actor.id, yield: yieldAmt });
    return { yield: yieldAmt, destroyed: res.destroyed, damage: actual };
  }

  refundOnDestroy(piece, owner) {
    if (!owner || piece.ownerId !== owner.id) return 0;
    const refund = Math.round(MATERIALS[piece.material].yieldPerHit * 0.9);
    owner.bag.add(piece.material, refund);
    return refund;
  }

  /** Push a capsule out of any build pieces it overlaps. */
  resolveActor(actor) {
    const p = actor.pos;
    const r = actor.radius;
    const h = actor.height;
    const box = {
      min: { x: p.x - r, y: p.y, z: p.z - r },
      max: { x: p.x + r, y: p.y + h, z: p.z + r },
    };
    const hits = this.grid.query(box);
    if (hits.length === 0) return false;
    let moved = false;

    for (const piece of hits) {
      const b = pieceBounds(piece.type, piece.gx, piece.gy, piece.gz, piece.rot);
      if (!aabbOverlaps(box, b)) continue;

      const dxLeft = (b.max.x + actor.radius) - p.x;
      const dxRight = p.x - (b.min.x - actor.radius);
      const dzLeft = (b.max.z + actor.radius) - p.z;
      const dzRight = p.z - (b.min.z - actor.radius);
      const dyUp = b.max.y - p.y;
      const dyDown = p.y + h - b.min.y;

      const opts = [
        { d: dxLeft, axis: 'x', dir: -1 },
        { d: dxRight, axis: 'x', dir: 1 },
        { d: dzLeft, axis: 'z', dir: -1 },
        { d: dzRight, axis: 'z', dir: 1 },
      ].filter((o) => o.d > 0);
      opts.sort((a, z) => a.d - z.d);

      if (dyUp > 0 && dyUp <= h * 0.6 && p.y >= b.max.y - 0.35) {
        p.y = b.max.y;
        actor.vel.y = Math.max(actor.vel.y, 0);
        actor.grounded = true;
        actor.onBuildPiece = true;
        moved = true;
        continue;
      }
      if (dyDown > 0 && p.y + h > b.max.y && actor.vel.y > 0) {
        actor.vel.y = Math.min(actor.vel.y, 0) * 0.2;
        moved = true;
        continue;
      }
      if (opts.length === 0) continue;
      const o = opts[0];
      p[o.axis] += o.dir * o.d;
      if (actor.vel[o.axis]) actor.vel[o.axis] *= -0.05;
      moved = true;
    }
    return moved;
  }

  /**
   * Highest walkable surface at (x,z) at or below `fromY`. Scans the whole grid
   * column downward so a tall stack is found regardless of how far above the
   * query point it is.
   */
  surfaceAt(x, z, fromY) {
    let best = this.terrain.heightAt(x, z);
    let piece = null;
    const gx = snapCell(x);
    const gz = snapCell(z);
    const start = Math.floor(fromY / CELL) + 1;
    const limit = Math.max(1, Math.ceil((fromY - best) / CELL) + 2);

    for (let k = 0; k <= limit; k++) {
      const gy = start - k;
      if (gy < -8) break;
      const cell = this.grid.anyInCell(gx, gy, gz);
      if (!cell) continue;
      if (cell.type === PIECE.WALL) continue;
      const b = pieceBounds(cell.type, cell.gx, cell.gy, cell.gz, cell.rot);
      if (b.max.y <= fromY + 0.35 && b.max.y > best) {
        best = b.max.y;
        piece = cell;
      }
    }
    return { y: best, piece };
  }

  /** Raycast against placed pieces, walking grid cells. */
  raycast(origin, dir, maxDist = 200) {
    let bestT = maxDist;
    let best = null;
    const seen = new Set();
    const step = CELL * 0.5;
    for (let t = 0; t <= maxDist; t += step) {
      const gx = snapCell(origin.x + dir.x * t);
      const gy = snapCell(origin.y + dir.y * t);
      const gz = snapCell(origin.z + dir.z * t);
      const ck = PieceGrid.cellKey(gx, gy, gz);
      if (seen.has(ck)) continue;
      seen.add(ck);
      const set = this.grid.cells.get(ck);
      if (!set) continue;
      for (const key of set) {
        const p = this.grid.pieces.get(key);
        if (!p || p.hp <= 0) continue;
        const b = pieceBounds(p.type, p.gx, p.gy, p.gz, p.rot);
        const hit = rayBox(origin, dir, b, bestT);
        if (hit >= 0 && hit < bestT) { bestT = hit; best = p; }
      }
    }
    return best ? { t: bestT, piece: best } : null;
  }

  nearest(x, y, z, r = 3.6) {
    const gx = snapCell(x), gy = snapCell(y), gz = snapCell(z);
    const span = Math.ceil(r / CELL);
    let best = null, bestD = r * r;
    for (let dy = -span; dy <= span; dy++) {
      for (let dz = -span; dz <= span; dz++) {
        for (let dx = -span; dx <= span; dx++) {
          const p = this.grid.anyInCell(gx + dx, gy + dy, gz + dz);
          if (!p) continue;
          const c = pieceCentre(p.type, p.gx, p.gy, p.gz, p.rot);
          const d = (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2;
          if (d < bestD) { bestD = d; best = p; }
        }
      }
    }
    return best;
  }

  count() { let n = 0; for (const _ of this.grid.all()) n++; return n; }

  boxFree(box) {
    const hits = this.grid.query(box);
    return !hits.some((p) => aabbOverlaps(box, pieceBounds(p.type, p.gx, p.gy, p.gz, p.rot)));
  }
}

export function actorBox(actor) {
  const r = actor.radius;
  return {
    min: { x: actor.pos.x - r, y: actor.pos.y, z: actor.pos.z - r },
    max: { x: actor.pos.x + r, y: actor.pos.y + actor.height, z: actor.pos.z + r },
  };
}

/** Ray vs AABB, entry distance or -1. */
function rayBox(origin, dir, b, maxT) {
  let tmin = 0, tmax = maxT;
  for (const ax of ['x', 'y', 'z']) {
    const d = dir[ax];
    const o = origin[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < b.min[ax] || o > b.max[ax]) return -1;
    } else {
      const inv = 1 / d;
      let t1 = (b.min[ax] - o) * inv;
      let t2 = (b.max[ax] - o) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
