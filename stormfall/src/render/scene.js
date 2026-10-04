// three.js renderer bootstrap: camera, lighting, sky, fog, render loop.
// This is the only module that touches WebGL - everything under src/sim stays
// engine-agnostic so it can be unit-tested in Node.

import * as THREE from '../../vendor/three.module.js';
import { WATER_LEVEL } from '../sim/terrain.js';

export const PALETTE = {
  skyTop: 0x2a5c9e,
  skyHorizon: 0x9fc4e8,
  sun: 0xfff4e0,
  ambientSky: 0x8fb6e8,
  ambientGround: 0x4a4232,
  water: 0x1f6f8f,
  waterDeep: 0x0d3550,
  sand: 0xd9c98f,
  grass: 0x4f7a3a,
  grassDry: 0x7d8c46,
  rock: 0x7a7168,
  rockHigh: 0x9aa0a4,
  snow: 0xe8eef2,
  foliage: 0x2f5c2a,
  foliagePine: 0x27492c,
};

const SKY_VERT = `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Vertical gradient sky with a soft sun glow. Cheap and reads well.
const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorldDir;
void main() {
  vec3 d = normalize(vWorldDir);
  float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.85));
  float sun = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sun, 220.0) * 1.6;          // disc
  col += uSunColor * pow(sun, 12.0) * 0.22;          // haze
  gl_FragColor = vec4(col, 1.0);
}`;

export class SceneRig {
  constructor(canvas, { quality = 'high' } = {}) {
    this.quality = quality;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'high',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.skyHorizon, 260, 1150);

    this.camera = new THREE.PerspectiveCamera(78, 1, 0.35, 3000);
    this.camera.position.set(0, 60, 90);

    this.sunDir = new THREE.Vector3(0.42, 0.72, 0.28).normalize();
    this._buildLights();
    this._buildSky();
    this._buildWater();

    this.resize();
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(
      PALETTE.ambientSky, PALETTE.ambientGround, 1.15,
    );
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(PALETTE.sun, 2.35);
    sun.position.copy(this.sunDir).multiplyScalar(400);
    if (this.quality === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = 170;
      sun.shadow.camera.left = -s;
      sun.shadow.camera.right = s;
      sun.shadow.camera.top = s;
      sun.shadow.camera.bottom = -s;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 900;
      sun.shadow.bias = -0.0009;
      sun.shadow.normalBias = 0.045;
    }
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Bounce light from below keeps shadowed sides of characters readable.
    const fill = new THREE.DirectionalLight(0xa9c4dd, 0.42);
    fill.position.set(-0.5, 0.28, -0.7).multiplyScalar(300);
    this.scene.add(fill);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(1800, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(PALETTE.skyTop) },
        uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
        uSunDir: { value: this.sunDir.clone() },
        uSunColor: { value: new THREE.Color(PALETTE.sun) },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _buildWater() {
    const geo = new THREE.PlaneGeometry(2600, 2600, 40, 40);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: PALETTE.water,
      transparent: true,
      opacity: 0.82,
      roughness: 0.14,
      metalness: 0.05,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 1;
    this.scene.add(this.water);
  }

  /** Keep the shadow frustum centred on the action. */
  focusShadows(target) {
    if (!this.sun.castShadow) return;
    this.sun.target.position.copy(target);
    this.sun.position.copy(this.sunDir).multiplyScalar(400).add(target);
    this.sun.target.updateMatrixWorld();
  }

  /** Sky and water follow the camera so they never appear to run out. */
  followCamera(cameraPos, time) {
    this.sky.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    this.water.position.x = cameraPos.x;
    this.water.position.z = cameraPos.z;
    if (this.waterMat) {
      // Cheap animated ripple on the surface normal proxy.
      this.waterMat.roughness = 0.12 + Math.sin(time * 0.7) * 0.03;
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}