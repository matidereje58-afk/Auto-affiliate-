// Keyboard / mouse input with pointer lock.
//
// Produces the same movement intent shape the bots emit, so the player and the
// AI go through one code path in the simulation.

import { clamp } from './sim/math.js';

const KEY_FWD = ['KeyW', 'ArrowUp'];
const KEY_BACK = ['KeyS', 'ArrowDown'];
const KEY_LEFT = ['KeyA', 'ArrowLeft'];
const KEY_RIGHT = ['KeyD', 'ArrowRight'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, middle: false };
    this.locked = false;
    this.wheel = 0;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this._taps = new Map();
    this.held = { build: false, fire: false };
    this.onLockChange = null;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const taps = this._taps.get(e.code);
      if (taps) for (const fn of taps) fn(e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.held.fire = true; }
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 1) this.mouse.middle = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.left = false; this.held.fire = false; }
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 1) this.mouse.middle = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouse.left = false;
        this.mouse.right = false;
        this.held.fire = false;
      }
      this.onLockChange?.(this.locked);
    });
  }

  on(code, fn) {
    if (!this._taps.has(code)) this._taps.set(code, []);
    this._taps.get(code).push(fn);
    return this;
  }

  requestLock() {
    if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  down(code) { return this.keys.has(code); }
  anyDown(codes) { return codes.some((c) => this.keys.has(c)); }

  /**
   * Consume accumulated mouse movement. Deltas are zeroed so a dropped frame
   * does not replay the same look input.
   */
  consumeLook(yaw, pitch) {
    const dx = this.mouse.dx * this.sensitivity;
    const dy = this.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return { yaw: yaw - dx, pitch: clamp(pitch - dy, -1.45, 1.45) };
  }

  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  axes() {
    let fwd = 0;
    let strafe = 0;
    if (this.anyDown(KEY_FWD)) fwd += 1;
    if (this.anyDown(KEY_BACK)) fwd -= 1;
    if (this.anyDown(KEY_RIGHT)) strafe += 1;
    if (this.anyDown(KEY_LEFT)) strafe -= 1;
    const len = Math.hypot(fwd, strafe);
    if (len > 1) { fwd /= len; strafe /= len; }
    return { fwd, strafe };
  }

  intent(yaw, pitch) {
    const { fwd, strafe } = this.axes();
    return {
      fwd, strafe,
      jump: this.down('Space'),
      sprint: this.anyDown(['ShiftLeft', 'ShiftRight']),
      crouch: this.down('KeyC') || this.down('ControlLeft'),
      yaw, pitch,
    };
  }
}
