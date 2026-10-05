// Loadout: five weapon slots, ammo pools, consumable stacks and materials.

import { MaterialBag, MATERIALS } from './materials.js';
import { AMMO_TYPES, ammoForClass } from './loot.js';
import { CONSUMABLES } from './health.js';

export const WEAPON_SLOTS = 5;

export class Inventory {
  constructor() {
    this.slots = new Array(WEAPON_SLOTS).fill(null);
    this.active = 0;
    this.ammo = { light: 0, medium: 0, shells: 0, sniperAmmo: 0, rockets: 0 };
    this.consumables = { bandage: 0, medkit: 0, smallShield: 0, bigShield: 0, jug: 0 };
    this.bag = new MaterialBag();
    this.buildMaterial = 'wood';
  }

  get current() { return this.slots[this.active] || null; }

  setActive(i) {
    if (i < 0 || i >= WEAPON_SLOTS) return null;
    this.active = i;
    return this.current;
  }

  firstEmpty() { return this.slots.findIndex((s) => s === null); }

  addWeapon(weapon) {
    const empty = this.firstEmpty();
    if (empty >= 0) {
      this.slots[empty] = weapon;
      return { placed: empty, replaced: null };
    }
    const replaced = this.slots[this.active];
    this.slots[this.active] = weapon;
    return { placed: this.active, replaced };
  }

  swapSlots(a, b) {
    if (a < 0 || b < 0 || a >= WEAPON_SLOTS || b >= WEAPON_SLOTS) return;
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  cycle(dir = 1) {
    for (let n = 1; n <= WEAPON_SLOTS; n++) {
      const i = (this.active + dir * n + WEAPON_SLOTS * 4) % WEAPON_SLOTS;
      if (this.slots[i]) { this.active = i; return this.current; }
    }
    return null;
  }

  findArchetype(archetypeId) {
    return this.slots.findIndex((s) => s && s.archetype === archetypeId);
  }

  addAmmo(id, n) {
    if (!(id in this.ammo)) return 0;
    const cap = AMMO_TYPES[id].stack;
    const before = this.ammo[id];
    this.ammo[id] = Math.min(cap, before + n);
    return this.ammo[id] - before;
  }

  reserveFor(weapon) {
    if (!weapon) return 0;
    return this.ammo[ammoForClass(weapon.class)] || 0;
  }

  ammoTypeFor(weapon) { return weapon ? ammoForClass(weapon.class) : null; }

  totalAmmoFor(weapon) { return weapon ? weapon.ammo + this.reserveFor(weapon) : 0; }

  addConsumable(id, n) {
    if (!(id in this.consumables)) return 0;
    const cap = CONSUMABLES[id].stack;
    const before = this.consumables[id];
    this.consumables[id] = Math.min(cap, before + n);
    return this.consumables[id] - before;
  }

  countConsumable(id) { return this.consumables[id] | 0; }

  addMaterial(id, n) { return this.bag.add(id, n); }
  spendMaterial(id, n) { return this.bag.spend(id, n); }

  cycleBuildMaterial(dir = 1) {
    const order = ['wood', 'brick', 'metal'];
    const i = order.indexOf(this.buildMaterial);
    this.buildMaterial = order[(i + dir + order.length) % order.length];
    return this.buildMaterial;
  }

  takeSlot(i) {
    if (i < 0 || i >= WEAPON_SLOTS) return null;
    const w = this.slots[i];
    this.slots[i] = null;
    if (this.active === i) {
      const next = this.slots.findIndex((s) => s !== null);
      this.active = next >= 0 ? next : 0;
    }
    return w;
  }

  snapshot() {
    return {
      slots: this.slots.map((w) => (w ? {
        archetype: w.archetype, name: w.name, rarity: w.rarity,
        ammo: w.ammo, magazine: w.magazine, class: w.class,
      } : null)),
      active: this.active,
      ammo: { ...this.ammo },
      consumables: { ...this.consumables },
      materials: this.bag.toJSON(),
      buildMaterial: this.buildMaterial,
    };
  }
}

export { MaterialBag, MATERIALS, CONSUMABLES };
