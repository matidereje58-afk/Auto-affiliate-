// Axis-aligned building grid.
//
// The world is diced into CELL-sized cubes aligned to integer world coordinates.
// Every placeable build piece occupies exactly one grid cell, so a piece is
// identified by (type, gx, gy, gz, rot) and can be looked up in O(1).

import { clamp } from './math.js';

export const CELL = 1;
export const THICK = 0.22;
export const BUILD_REACH = 7.2;
export const REPAIR_REACH = 3.6;

export const PIECE = { FLOOR: 0, WALL: 1, STAIR: 2, ROOF: 3 };
export const PIECE_NAME = ['floor', 'wall', 'stair', 'roof'];

export const BUILD_TYPES = [
  { type: PIECE.WALL, label: 'Wall', key: 'wall' },
  { type: PIECE.FLOOR, label: 'Floor', key: 'floor' },
  { type: PIECE.STAIR, label: 'Stairs', key: 'stair' },
  { type: PIECE.ROOF, label: 'Roof', key: 'roof' },
];

export const isVertical = (type) => type === PIECE.WALL;

export const snapCell = (v) => Math.floor(v / CELL);
export const snapCentre = (v) => (Math.floor(v / CELL) + 0.5) * CELL;

/** World-space AABB for a piece. `rot` only affects walls. */
export function pieceBounds(type, gx, gy, gz, rot) {
  const x = gx * CELL, y = gy * CELL, z = gz * CELL;
  const h = CELL * 0.5;
  const t = THICK * 0.5;

  switch (type) {
    case PIECE.FLOOR:
    case PIECE.ROOF:
      return {
        min: { x, y: y + h - t, z },
        max: { x: x + CELL, y: y + h + t, z: z + CELL },
      };
    case PIECE.WALL:
      return rot
        ? { min: { x: x + h - t, y, z }, max: { x: x + h + t, y: y + CELL, z: z + CELL } }
        : { min: { x, y, z: z + h - t }, max: { x: x + CELL, y: y + CELL, z: z + h + t } };
    case PIECE.STAIR:
      return { min: { x, y, z }, max: { x: x + CELL, y: y + CELL, z: z + CELL } };
    default:
      return { min: { x, y, z }, max: { x, y, z } };
  }
}

export function pieceCentre(type, gx, gy, gz, rot) {
  const b = pieceBounds(type, gx, gy, gz, rot);
  return {
    x: (b.min.x + b.max.x) * 0.5,
    y: (b.min.y + b.max.y) * 0.5,
    z: (b.min.z + b.max.z) * 0.5,
  };
}

export function edgeNeighbours(type, gx, gy, gz, rot) {
  const out = [];
  if (type === PIECE.WALL) {
    if (rot) out.push([gx - 1, gy, gz], [gx + 1, gy, gz]);
    else out.push([gx, gy, gz - 1], [gx, gy, gz + 1]);
  } else {
    out.push([gx, gy, gz - 1], [gx, gy, gz + 1], [gx - 1, gy, gz], [gx + 1, gy, gz]);
  }
  return out;
}

/**
 * Pack a piece into a collision-free number usable as a Map key.
 * Mixed-radix weights: type*2+rot is 0..7, gy+512 is 0..1024, gx+1024 and
 * gz+1024 are 0..2048.
 */
export function pieceKey(type, gx, gy, gz, rot) {
  const tr = type * 2 + (rot ? 1 : 0);
  return tr + (gy + 512) * 8 + (gx + 1024) * 8 * 1025 + (gz + 1024) * 8 * 1025 * 2049;
}

/** Inverse of pieceKey, for debugging. */
export function unpackKey(k) {
  const tr = k % 8;
  let rest = (k - tr) / 8;
  const gyRaw = rest % 1025;
  rest = (rest - gyRaw) / 1025;
  const gxRaw = rest % 2049;
  const gzRaw = (rest - gxRaw) / 2049;
  return { type: tr >> 1, rot: tr & 1, gx: gxRaw - 1024, gy: gyRaw - 512, gz: gzRaw - 1024 };
}

/** Spatial hash over placed pieces. */
export class PieceGrid {
  constructor() {
    this.pieces = new Map();
    this.cells = new Map();
    this.cellSize = CELL;
  }

  /**
   * Spatial-hash cell key. Mixed radix rather than bit shifts: grid coords run
   * -1024..1024 so after offsetting they need 11 bits each, and a 32-bit shift
   * would overlap neighbouring fields and report phantom collisions.
   */
  static cellKey(gx, gy, gz) {
    return (gy + 512) + (gx + 1024) * 1025 + (gz + 1024) * 1025 * 2049;
  }

  add(piece) {
    const k = pieceKey(piece.type, piece.gx, piece.gy, piece.gz, piece.rot);
    piece.key = k;
    this.pieces.set(k, piece);
    const ck = PieceGrid.cellKey(piece.gx, piece.gy, piece.gz);
    let set = this.cells.get(ck);
    if (!set) { set = new Set(); this.cells.set(ck, set); }
    set.add(k);
    return piece;
  }

  remove(piece) {
    const k = piece.key ?? pieceKey(piece.type, piece.gx, piece.gy, piece.gz, piece.rot);
    this.pieces.delete(k);
    const ck = PieceGrid.cellKey(piece.gx, piece.gy, piece.gz);
    const set = this.cells.get(ck);
    if (set) {
      set.delete(k);
      if (set.size === 0) this.cells.delete(ck);
    }
  }

  get(type, gx, gy, gz, rot) {
    return this.pieces.get(pieceKey(type, gx, gy, gz, rot));
  }

  /** Any piece occupying the cell, regardless of type or rotation. */
  anyInCell(gx, gy, gz) {
    const set = this.cells.get(PieceGrid.cellKey(gx, gy, gz));
    if (!set) return null;
    for (const k of set) {
      const p = this.pieces.get(k);
      if (p && p.hp > 0) return p;
    }
    return null;
  }

  get size() { return this.pieces.size; }

  clear() { this.pieces.clear(); this.cells.clear(); }

  *all() {
    for (const p of this.pieces.values()) if (p.hp > 0) yield p;
  }

  /** All live pieces whose cell overlaps the given box. */
  query(box, out = []) {
    out.length = 0;
    const gx0 = Math.floor(box.min.x), gx1 = Math.floor(box.max.x);
    const gy0 = Math.floor(box.min.y), gy1 = Math.floor(box.max.y);
    const gz0 = Math.floor(box.min.z), gz1 = Math.floor(box.max.z);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const set = this.cells.get(PieceGrid.cellKey(gx, gy, gz));
          if (!set) continue;
          for (const k of set) {
            const p = this.pieces.get(k);
            if (p && p.hp > 0) out.push(p);
          }
        }
      }
    }
    return out;
  }
}
