// Builds the terrain mesh straight from the sim heightfield so visuals and
// collision can never disagree, plus water depth tinting and scatter props.

import * as THREE from '../../vendor/three.module.js';
import { PALETTE } from './scene.js';
import { WATER_LEVEL, BEACH_LEVEL, POIS } from '../sim/terrain.js';
import { RNG } from '../sim/rng.js';

const cTmp = new THREE.Color();
const cA = new THREE.Color();
const cB = new THREE.Color();

/** Heightmap resolution used for the render mesh. */
const MESH_RES = 257;

/** Pick a base colour for a terrain vertex from height, slope and wetness. */
function vertexColor(terrain, x, z, h, slope, out) {
  // Wet sand below and just above the waterline.
  if (h < WATER_LEVEL + 0.6) {
    cA.setHex(PALETTE.sand);
    cB.setHex(0x9a8459);
    out.copy(cA).lerp(cB, Math.min(1, (WATER_LEVEL + 12 - h) / 14));
    return out;
  }

  if (h < BEACH_LEVEL + 1.5) {
    cA.setHex(PALETTE.sand);
    cB.setHex(PALETTE.grass);
    out.copy(cA).lerp(cB, Math.min(1, (h - WATER_LEVEL) / (BEACH_LEVEL + 1.5)));
    return out;
  }

  // Grass, drying out with altitude, turning to rock on steep faces.
  const alt = Math.min(1, (h - BEACH_LEVEL) / 26);
  cA.setHex(PALETTE.grass);
  cB.setHex(PALETTE.grassDry);
  out.copy(cA).lerp(cB, alt * 0.75);

  cTmp.setHex(PALETTE.rock);
  const rockMix = Math.min(1, Math.max(0, (slope - 0.42) / 0.36));
  out.lerp(cTmp, rockMix);

  cTmp.setHex(PALETTE.snow);
  out.lerp(cTmp, Math.min(1, Math.max(0, (h - 27) / 12)));

  return out;
}

export class TerrainMesh {
  /**
   * @param {import('../sim/terrain.js').Terrain} terrain
   * @param {{quality?:string}} opts
   */
  constructor(terrain, { quality = 'high' } = {}) {
    this.terrain = terrain;
    this.group = new THREE.Group();

    const half = terrain.half;
    const seg = quality === 'high' ? MESH_RES : 129;

    // Sample the sim heightfield on the mesh's own grid.
    const geo = new THREE.PlaneGeometry(half * 2, half * 2, seg - 1, seg - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const stepX = (half * 2) / (seg - 1);
    const col = new THREE.Color();

    for (let j = 0; j < seg; j++) {
      const z = -half + j * stepX;
      for (let i = 0; i < seg; i++) {
        const x = -half + i * stepX;
        const vi = j * seg + i;
        const h = terrain.heightAt(x, z);
        pos.setY(vi, h);
        const slope = terrain.slopeAt(x, z, stepX * 0.75);
        vertexColor(terrain, x, z, h, slope, col);
        // Subtle noise breaks up flat fills without needing textures.
        const n = 0.92 + ((Math.sin(x * 0.37) * Math.cos(z * 0.41) + 1) * 0.5) * 0.16;
        colors[vi * 3] = col.r * n;
        colors[vi * 3 + 1] = col.g * n;
        colors[vi * 3 + 2] = col.b * n;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terrain';
    this.group.add(this.mesh);

    this.props = buildProps(terrain, new RNG(terrain.seed ^ 0x5eed), quality);
    this.group.add(this.props);
  }
}

// ---------------------------------------------------------------------------
// Prop scattering (kept separate so the mesh class stays readable)
// ---------------------------------------------------------------------------

export function buildProps(terrain, rng, quality = 'high') {
  const group = new THREE.Group();
  const density = quality === 'high' ? 1 : 0.45;

  const withinPoi = (x, z, pad = 1.0) => {
    for (const p of POIS) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < (p.r * pad) ** 2) return true;
    }
    return false;
  };

  // --- Pine trees: cone stack + trunk, instanced -------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.42, 0.62, 4.2, 6);
  trunkGeo.translate(0, 2.1, 0);
  const coneGeo = new THREE.ConeGeometry(2.9, 8.4, 7);
  coneGeo.translate(0, 8.6, 0);
  const cone2Geo = new THREE.ConeGeometry(2.1, 6.0, 7);
  cone2Geo.translate(0, 12.0, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.foliagePine, roughness: 0.92 });
  const leaf2Mat = new THREE.MeshStandardMaterial({ color: 0x2f5f36, roughness: 0.92 });

  const targetTrees = Math.floor(1500 * density);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, targetTrees);
  const conesA = new THREE.InstancedMesh(coneGeo, leafMat, targetTrees);
  const conesB = new THREE.InstancedMesh(cone2Geo, leaf2Mat, targetTrees);
  for (const m of [trunks, conesA, conesB]) {
    m.castShadow = true; m.receiveShadow = true; m.count = 0;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();

  // Broadleaf trees on gentler, lower ground; pines higher up.
  const leafBallGeo = new THREE.IcosahedronGeometry(3.5, 0);
  const leafBallMat = new THREE.MeshStandardMaterial({ color: PALETTE.foliage, roughness: 0.95 });
  const ballTarget = Math.floor(900 * density);
  const balls = new THREE.InstancedMesh(leafBallGeo, leafBallMat, ballTarget);
  balls.castShadow = true; balls.receiveShadow = true; balls.count = 0;

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1, flatShading: true });
  const rockTarget = Math.floor(700 * density);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockTarget);
  rocks.castShadow = true; rocks.receiveShadow = true; rocks.count = 0;

  let attempts = 0;
  const maxAttempts = targetTrees * 14;
  while ((conesA.count < targetTrees || balls.count < ballTarget) && attempts < maxAttempts) {
    attempts++;
    const x = rng.range(-terrain.half + 6, terrain.half - 6);
    const z = rng.range(-terrain.half + 6, terrain.half - 6);
    const h = terrain.heightAt(x, z);
    if (h < WATER_LEVEL + 1.6) continue;
    if (withinPoi(x, z, 1.0)) continue;
    const slope = terrain.slopeAt(x, z);
    if (slope > 0.52) continue;

    const alpine = h > 22;
    const wantBall = !alpine && rng.chance(0.42);
    const size = rng.range(0.78, 1.45) * (wantBall ? 1.05 : 1);
    pv.set(x, h - 0.4, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
    sc.set(size, size * rng.range(0.85, 1.25), size);
    m4.compose(pv, q, sc);

    if (wantBall && balls.count < ballTarget) {
      balls.setMatrixAt(balls.count++, m4);
      pv.set(x, h + 3.6 * size, z);
      m4.compose(pv, q, sc);
      if (conesA.count < targetTrees) {
        trunks.setMatrixAt(trunks.count++, m4);
        conesA.setMatrixAt(conesA.count++, m4);
      }
    } else if (conesA.count < targetTrees) {
      trunks.setMatrixAt(trunks.count++, m4);
      conesA.setMatrixAt(conesA.count++, m4);
      pv.set(x, h - 0.4, z);
      m4.compose(pv, q, sc);
      conesB.setMatrixAt(conesB.count++, m4);
    }
  }

  // Rocks, allowed on steeper ground than trees.
  attempts = 0;
  while (rocks.count < rockTarget && attempts < rockTarget * 12) {
    attempts++;
    const x = rng.range(-terrain.half + 4, terrain.half - 4);
    const z = rng.range(-terrain.half + 4, terrain.half - 4);
    const h = terrain.heightAt(x, z);
    if (h < WATER_LEVEL - 6) continue;
    const s = rng.range(0.6, 3.2);
    pv.set(x, h - s * 0.35, z);
    q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3)));
    sc.set(s * rng.range(0.8, 1.4), s * rng.range(0.5, 0.9), s * rng.range(0.8, 1.4));
    m4.compose(pv, q, sc);
    rocks.setMatrixAt(rocks.count++, m4);
  }

  for (const m of [trunks, conesA, conesB, balls, rocks]) {
    if (m.count === 0) continue;
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}