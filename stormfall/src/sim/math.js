// Pure math helpers. No DOM, no three.js - safe to import in Node for tests.
// Vectors are plain {x,y,z} objects to stay engine-agnostic.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const deg = (d) => (d * Math.PI) / 180;

/** Shortest signed angular difference b-a, wrapped to [-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent exponential approach. `rate` = fraction closed per second. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vclone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const vcopy = (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vmul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vcross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vlen2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const vdist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const vdistXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function vnorm(a) {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}

export const vlerp = (a, b, t) => ({
  x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
});

/** Yaw (radians, 0 = +X) to a horizontal unit vector. */
export const yawToDir = (yaw) => ({ x: Math.cos(yaw), y: 0, z: Math.sin(yaw) });

/** Horizontal unit vector to yaw. */
export const dirToYaw = (d) => Math.atan2(d.z, d.x);

// ---------------------------------------------------------------------------
// Axis-aligned box
// ---------------------------------------------------------------------------

/** AABB from center + half-extents. */
export function aabb(cx, cy, cz, hx, hy, hz) {
  return {
    min: { x: cx - hx, y: cy - hy, z: cz - hz },
    max: { x: cx + hx, y: cy + hy, z: cz + hz },
  };
}

export function aabbContains(box, p) {
  return (
    p.x >= box.min.x && p.x <= box.max.x &&
    p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z
  );
}

export function aabbOverlaps(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

/** Squared distance from a point to an AABB (0 when inside). */
export function aabbDist2(p, box) {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return dx * dx + dy * dy + dz * dz;
}

export function aabbExpand(box, m) {
  return {
    min: { x: box.min.x - m, y: box.min.y - m, z: box.min.z - m },
    max: { x: box.max.x + m, y: box.max.y + m, z: box.max.z + m },
  };
}

/**
 * Slab-method ray/AABB intersection.
 * Returns entry distance along `dir` (normalized) or -1 when there is no hit
 * within [0, maxT].
 */
export function rayAabb(origin, dir, box, maxT = Infinity) {
  let tmin = 0;
  let tmax = maxT;
  for (const ax of ['x', 'y', 'z']) {
    const d = dir[ax];
    const o = origin[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[ax] || o > box.max[ax]) return -1;
    } else {
      const inv = 1 / d;
      let t1 = (box.min[ax] - o) * inv;
      let t2 = (box.max[ax] - o) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/**
 * Ray vs vertical capsule (the shape we use for character hitboxes).
 * Capsule axis is along +Y, centered at `base`, `radius`, `height` total.
 * Solves the infinite-cylinder case in XZ then clamps against the caps.
 * Returns entry distance or -1.
 */
export function rayCapsuleY(origin, dir, base, radius, height, maxT = Infinity) {
  const ox = origin.x - base.x;
  const oz = origin.z - base.z;
  const dx = dir.x;
  const dz = dir.z;

  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;

  if (a < 1e-9) {
    // Ray is vertical: check if inside the cylinder, then test caps.
    if (c > 0) return -1;
    const y0 = base.y;
    const y1 = base.y + height;
    let t = -1;
    if (Math.abs(dir.y) > 1e-9) {
      const ta = (y0 - origin.y) / dir.y;
      const tb = (y1 - origin.y) / dir.y;
      const tmin = Math.min(ta, tb);
      if (tmin >= 0 && tmin <= maxT) t = tmin;
    }
    return t >= 0 ? t : -1;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return -1;

  // Reject cylinder hits that fall outside the cap segment.
  const y = origin.y + dir.y * t;
  if (y < base.y || y > base.y + height) {
    // Try the cap planes instead.
    let best = -1;
    if (Math.abs(dir.y) > 1e-9) {
      for (const capY of [base.y, base.y + height]) {
        const tc = (capY - origin.y) / dir.y;
        if (tc < 0 || tc > maxT) continue;
        const px = ox + dir.x * tc;
        const pz = oz + dir.z * tc;
        if (px * px + pz * pz <= radius * radius) {
          if (best < 0 || tc < best) best = tc;
        }
      }
    }
    return best;
  }
  return t;
}

/** Shortest distance between two points on a horizontal plane (XZ only). */
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Yaw difference needed to look from `from` toward `to`. */
export const yawToward = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);

// ---------------------------------------------------------------------------
// 2D helpers (used heavily by the storm circle and minimap)
// ---------------------------------------------------------------------------

export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export const dist2Sq = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

/**
 * Closest point to (px,pz) on or inside the circle (cx,cz,r).
 * Returns the point itself when already inside.
 */
export function closestPointOnCircle(px, pz, cx, cz, r) {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d <= r || d < 1e-9) return { x: px, z: pz, inside: true };
  const s = r / d;
  return { x: cx + dx * s, z: cz + dz * s, inside: false };
}

/** Is (px,pz) inside the circle? */
export const inCircle = (px, pz, cx, cz, r) =>
  dist2Sq(px, pz, cx, cz) <= r * r;

/** Random point uniformly distributed inside a circle. */
export function randomPointInCircle(cx, cz, r, rng) {
  const a = rng.next() * TAU;
  const d = Math.sqrt(rng.next()) * r;
  return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
}