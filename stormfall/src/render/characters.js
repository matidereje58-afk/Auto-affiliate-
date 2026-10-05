// Low-poly humanoid rig with a procedural walk cycle.
//
// One shared set of geometries is reused for every actor, so a hundred players
// cost a hundred small groups rather than a hundred unique meshes. Limbs are
// driven by a phase accumulator tied to actual ground speed.

import * as THREE from '../../vendor/three.module.js';
import { CROUCH_HEIGHT, BODY_HEIGHT } from '../sim/character.js';

const SKINS = [0xf0c9a4, 0xd9a878, 0xb8845c, 0x8d5f3f, 0x6b4630, 0xf5d9bd];
const SHIRTS = [
  0x3f6fa8, 0x8a3f52, 0x3f8a63, 0x8a7a3f, 0x5a3f8a, 0x2f4858, 0xa8632f, 0x46707a,
];
const PANTS = [0x2c3440, 0x3a3a44, 0x24333d, 0x413a2e, 0x2a2a32];

let SHARED = null;

function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    geo: {
      torso: new THREE.BoxGeometry(0.46, 0.62, 0.26),
      head: new THREE.BoxGeometry(0.27, 0.29, 0.25),
      limb: new THREE.BoxGeometry(0.14, 0.46, 0.15),
      leg: new THREE.BoxGeometry(0.16, 0.5, 0.17),
      foot: new THREE.BoxGeometry(0.17, 0.1, 0.26),
      pack: new THREE.BoxGeometry(0.34, 0.4, 0.16),
      gun: new THREE.BoxGeometry(0.09, 0.13, 0.66),
      mag: new THREE.BoxGeometry(0.07, 0.2, 0.11),
      canopy: new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    },
    mat: {
      boot: new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.7 }),
      pack: new THREE.MeshStandardMaterial({ color: 0x36414d, roughness: 0.9 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.5, metalness: 0.55 }),
      chute: new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.85, side: THREE.DoubleSide }),
    },
  };
  return SHARED;
}

export class CharacterMesh {
  constructor(actor, { isPlayer = false } = {}) {
    const S = shared();
    this.actor = actor;
    this.isPlayer = isPlayer;
    this.root = new THREE.Group();
    this.root.name = `actor-${actor.id}`;

    const i = Math.abs(actor.id) % 997;
    const skin = new THREE.MeshStandardMaterial({ color: SKINS[i % SKINS.length], roughness: 0.82 });
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[i % SHIRTS.length], roughness: 0.88 });
    const pants = new THREE.MeshStandardMaterial({ color: PANTS[i % PANTS.length], roughness: 0.9 });

    this.body = new THREE.Group();
    this.root.add(this.body);

    const part = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    this.body.add(part(S.geo.torso, shirt, 0, 1.16, 0));
    this.body.add(part(S.geo.pack, S.mat.pack, 0, 1.18, -0.2));
    this.head = part(S.geo.head, skin, 0, 1.63, 0);
    this.body.add(this.head);

    this.armL = new THREE.Group();
    this.armL.position.set(-0.31, 1.42, 0);
    this.armL.add(part(S.geo.limb, shirt, 0, -0.23, 0));
    this.body.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.31, 1.42, 0);
    this.armR.add(part(S.geo.limb, shirt, 0, -0.23, 0));
    this.body.add(this.armR);

    this.gun = new THREE.Group();
    const gunBody = new THREE.Mesh(S.geo.gun, S.mat.gun);
    gunBody.position.set(0, 0, 0.24);
    gunBody.castShadow = true;
    this.gun.add(gunBody);
    const mag = new THREE.Mesh(S.geo.mag, S.mat.gun);
    mag.position.set(0, -0.13, 0.12);
    this.gun.add(mag);
    this.gun.position.set(0.31, 1.16, 0.16);
    this.body.add(this.gun);

    this.legL = new THREE.Group();
    this.legL.position.set(-0.13, 0.86, 0);
    this.legL.add(part(S.geo.leg, pants, 0, -0.25, 0));
    this.legL.add(part(S.geo.foot, S.mat.boot, 0, -0.52, 0.06));
    this.body.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.13, 0.86, 0);
    this.legR.add(part(S.geo.leg, pants, 0, -0.25, 0));
    this.legR.add(part(S.geo.foot, S.mat.boot, 0, -0.52, 0.06));
    this.body.add(this.legR);

    this.chute = new THREE.Group();
    const canopy = new THREE.Mesh(S.geo.canopy, S.mat.chute);
    canopy.castShadow = true;
    this.chute.add(canopy);
    for (let k = 0; k < 4; k++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0xdddddd }),
      );
      line.rotation.y = (k / 4) * Math.PI * 2;
      this.chute.add(line);
    }
    this.chute.position.set(0, 2.9, 0);
    this.chute.visible = false;
    this.root.add(this.chute);

    this.phase = (actor.id * 1.7) % (Math.PI * 2);
    this._visible = true;
  }

  set visible(v) {
    this._visible = v;
    this.root.visible = v;
  }
  get visible() { return this._visible; }

  update(dt) {
    const a = this.actor;
    this.root.position.set(a.pos.x, a.pos.y, a.pos.z);
    this.root.rotation.y = -a.yaw + Math.PI * 0.5;

    const crouchT = (CROUCH_HEIGHT - BODY_HEIGHT) / BODY_HEIGHT;
    const targetCrouch = a.crouching ? crouchT : 0;
    this.body.scale.y += (1 - targetCrouch - this.body.scale.y) * Math.min(1, dt * 14);

    const stride = Math.min(1.9, Math.hypot(a.vel.x, a.vel.z));
    if (a.grounded) this.phase += stride * dt * 2.5;
    const swing = a.grounded ? Math.sin(this.phase) * Math.min(1, stride / 4.2) : 0;
    const bob = Math.abs(Math.cos(this.phase)) * Math.min(0.05, stride * 0.012);

    this.legL.rotation.x = swing * 0.95;
    this.legR.rotation.x = -swing * 0.95;
    this.body.position.y = bob;

    const aimBlend = a.aiming ? 1 : (a.weapon ? 0.45 : 0);
    this.armL.rotation.x = -swing * 0.55 - aimBlend * 1.15;
    this.armR.rotation.x = swing * 0.55 - aimBlend * 1.28;
    this.armL.rotation.z = aimBlend * 0.34;
    this.armR.rotation.z = -aimBlend * 0.2;

    this.gun.visible = !!a.weapon;
    if (a.weapon) this.gun.rotation.x = -a.recoilKick * 2.4;
    this.head.rotation.x = -a.pitch * 0.5;

    const airborne = a.fallState === 'gliding' || a.fallState === 'freefall';
    this.chute.visible = airborne;
    if (airborne) {
      this.chute.rotation.y += dt * 0.4;
      this.body.rotation.z = Math.sin(this.phase * 0.7) * 0.06;
    } else {
      this.body.rotation.z = 0;
    }
  }
}
