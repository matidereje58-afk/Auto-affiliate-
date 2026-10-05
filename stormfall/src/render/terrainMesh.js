// Builds the terrain mesh straight from the sim heightfield so visuals and
// collision can never disagree, plus water depth tinting and scatter props.

import * as THREE from '../../vendor/three.module.js';
import { PALETTE } from './scene.js';
import { WATER_LEVEL, BEACH_LEVEL, POIS, REGIONS, regionWeights } from '../sim/terrain.js';

const cTmp = new THREE.Color();
const cA = new THREE.Color();
const cB = new THREE.Color();

/** Heightmap resolution used for the render mesh. */
const MESH_RES = 257;

/** Pick a base colour for a terrain vertex from height, slope and wetness. */
const cReg = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
for (let i = 0; i < 4; i++) cReg[i].setHex(REGIONS[i].colour);

/**
 * Pick a base colour from biome, height, slope and wetness. Written as an
 * explicit cascade so shallow water reads as turquoise and the sand shelf stays
 * visible where land meets sea.
 */
function vertexColor(terrain, x, z, h, slope, out) {
  // Underwater: turquoise in the shallows, deep blue further out.
  if (h < WATER_LEVEL) {
    const depth = WATER_LEVEL - h;
    cA.setHex(0x6fc6c0);
    cB.setHex(0x0b2f4d);
    out.copy(cA).lerp(cB, Math.min(1, depth / 20));
    return out;
  }

  // Sand beach, gated on true coastal proximity rather than low altitude so
  // inland basins are not painted as sand.
  if (h < WATER_LEVEL + 3.6 && terrain.waterDistanceAt(x, z) < 46) {
    cA.setHex(PALETTE.sand);
    cB.setHex(0xc0ab74);
    out.copy(cA).lerp(cB, Math.min(1, (h - WATER_LEVEL) / (WATER_LEVEL + 3.6)) * 0.5);
    return out;
  }

  // Blended biome ground.
  const { w } = regionWeights(x, z);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 4; i++) {
    if (w[i] <= 0) continue;
    r += cReg[i].r * w[i];
    g += cReg[i].g * w[i];
    b += cReg[i].b * w[i];
  }
  out.setRGB(r, g, b);

  // Dry out on the highest ground only.
  const alt = Math.min(1, Math.max(0, (h - 17) / 14));
  cTmp.setHex(0x9a9163);
  out.lerp(cTmp, alt * 0.42);

  // Rock takes over on steep faces, which is what makes cliffs legible.
  const rockMix = Math.min(1, Math.max(0, (slope - 0.40) / 0.34));
  cTmp.setHex(PALETTE.rock);
  out.lerp(cTmp, rockMix);

  // A little frost on the highest ground.
  cTmp.setHex(PALETTE.snow);
  out.lerp(cTmp, Math.min(1, Math.max(0, (h - 30) / 13)));

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

  }
}
