// Renders the simulation's prop list. The sim owns the authoritative list of
// trees, rocks, crates and cars, so what you can see is exactly what you can
// chop. Everything is instanced - one draw call per prop kind.

import * as THREE from '../../vendor/three.module.js';
import { PROP } from '../sim/props.js';

function makeKinds(quality) {
  const seg = quality === 'high' ? 8 : 5;
  return {
    [PROP.PINE]: [
      new THREE.CylinderGeometry(0.34, 0.5, 3.6, 6),
      new THREE.ConeGeometry(2.5, 8.0, seg),
      new THREE.ConeGeometry(1.9, 5.6, seg),
    ],
    [PROP.TREE]: [
      new THREE.CylinderGeometry(0.36, 0.54, 3.4, 6),
      new THREE.IcosahedronGeometry(3.0, 0),
    ],
    [PROP.ROCK]: [new THREE.DodecahedronGeometry(1, 0)],
    [PROP.BUSH]: [new THREE.IcosahedronGeometry(0.85, 0)],
    [PROP.CRATE]: [new THREE.BoxGeometry(1.25, 1.25, 1.25)],
    [PROP.BARREL]: [new THREE.CylinderGeometry(0.48, 0.48, 1.15, 9)],
    [PROP.CAR]: [
      new THREE.BoxGeometry(1.9, 0.62, 4.2),
      new THREE.BoxGeometry(1.7, 0.6, 2.0),
    ],
    [PROP.WRECK]: [new THREE.BoxGeometry(1.9, 0.8, 3.6)],
  };
}

const COLOURS = {
  trunk: 0x4a3a2a, pine: 0x27492c, pineTop: 0x2f5f36, leaf: 0x33632e,
  rock: 0x7a7168, bush: 0x3d6b33, crate: 0x9a6b3c, barrel: 0xc4453a,
  car: 0x7a8a96, wreck: 0x5c5348,
};

export class PropsRender {
  constructor(props, { quality = 'high' } = {}) {
    this.props = props;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.meshes = new Map();
    this.kinds = makeKinds(quality);
    this.materials = {
      trunk: new THREE.MeshStandardMaterial({ color: COLOURS.trunk, roughness: 1 }),
      pine: new THREE.MeshStandardMaterial({ color: COLOURS.pine, roughness: 0.95 }),
      pineTop: new THREE.MeshStandardMaterial({ color: COLOURS.pineTop, roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ color: COLOURS.leaf, roughness: 0.95 }),
      rock: new THREE.MeshStandardMaterial({ color: COLOURS.rock, roughness: 1, flatShading: true }),
      bush: new THREE.MeshStandardMaterial({ color: COLOURS.bush, roughness: 0.95 }),
      crate: new THREE.MeshStandardMaterial({ color: COLOURS.crate, roughness: 0.95 }),
      barrel: new THREE.MeshStandardMaterial({ color: COLOURS.barrel, roughness: 0.6, metalness: 0.2 }),
      car: new THREE.MeshStandardMaterial({ color: COLOURS.car, roughness: 0.5, metalness: 0.35 }),
      wreck: new THREE.MeshStandardMaterial({ color: COLOURS.wreck, roughness: 0.95 }),
    };
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._slot = { y: 0, scale: [1, 1, 1] };
  }

  matFor(kind, part) {
    switch (kind) {
      case PROP.PINE: return part === 0 ? this.materials.trunk : (part === 1 ? this.materials.pine : this.materials.pineTop);
      case PROP.TREE: return part === 0 ? this.materials.trunk : this.materials.leaf;
      case PROP.ROCK: return this.materials.rock;
      case PROP.BUSH: return this.materials.bush;
      case PROP.CRATE: return this.materials.crate;
      case PROP.BARREL: return this.materials.barrel;
      case PROP.CAR: return this.materials.car;
      case PROP.WRECK: return this.materials.wreck;
      default: return this.materials.rock;
    }
  }

  place(kind, part, prop, out) {
    const s = prop.scale;
    switch (kind) {
      case PROP.PINE: out.y = [1.6, 7.2, 10.2][part] * s; out.scale = [1, 1, 1]; break;
      case PROP.TREE: out.y = [1.5, 3.4][part] * s; break;
      case PROP.ROCK: out.y = 0.55 * s; out.scale = [1.2, 0.85, 1.1]; break;
      case PROP.BUSH: out.y = 0.5 * s; break;
      case PROP.CRATE: out.y = 0.62 * s; break;
      case PROP.BARREL: out.y = 0.58 * s; break;
      case PROP.CAR: out.y = [0.55, 1.2][part] * s; break;
      case PROP.WRECK: out.y = 0.6 * s; break;
      default: out.y = 0.5;
    }
    out.scale = out.scale.map((v) => v * s);
  }

  /** (Re)build the instance buffers. Called when the prop list changes. */
  rebuild() {
    const counts = new Map();
    for (const p of this.props.props.values()) {
      if (!p.alive) continue;
      const parts = this.kinds[p.kind]?.length || 0;
      for (let i = 0; i < parts; i++) {
        const k = `${p.kind}:${i}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }

    for (const [key, mesh] of this.meshes) {
      if (!counts.has(key)) {
        this.group.remove(mesh);
        mesh.dispose?.();
        this.meshes.delete(key);
      }
    }

    for (const [key, n] of counts) {
      const [kind, partStr] = key.split(':');
      const part = Number(partStr);
      let mesh = this.meshes.get(key);
      if (!mesh || mesh.instanceMatrix.count < n) {
        if (mesh) { this.group.remove(mesh); mesh.dispose?.(); }
        mesh = new THREE.InstancedMesh(this.kinds[kind][part], this.matFor(kind, part), n);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.name = key;
        this.meshes.set(key, mesh);
        this.group.add(mesh);
      }
      mesh.count = n;
    }

    const idx = new Map();
    for (const p of this.props.props.values()) {
      if (!p.alive) continue;
      const parts = this.kinds[p.kind]?.length || 0;
      for (let i = 0; i < parts; i++) {
        const key = `${p.kind}:${i}`;
        const mesh = this.meshes.get(key);
        if (!mesh) continue;
        const i0 = idx.get(key) || 0;
        this._slot.y = 0;
        this._slot.scale = [1, 1, 1];
        this.place(p.kind, i, p, this._slot);
        this._v.set(p.x, p.y + this._slot.y, p.z);
        this._e.set(0, p.rot, 0);
        this._q.setFromEuler(this._e);
        this._s.set(...this._slot.scale);
        this._m4.compose(this._v, this._q, this._s);
        mesh.setMatrixAt(i0, this._m4);
        idx.set(key, i0 + 1);
      }
    }
    for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true;
  }

  update() { /* buffers rebuilt on demand */ }
}
