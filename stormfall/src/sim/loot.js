// Loot generation: what spawns, where, and at what rarity.

import { RARITY_IDS, WEAPONS, WEAPON_IDS, makeWeapon } from './weapons.js';
import { CONSUMABLES } from './health.js';
import { MATERIALS } from './materials.js';
import { POIS, WATER_LEVEL } from './terrain.js';
import { dist2D } from './math.js';

export const RARITY_WEIGHTS = { common: 52, uncommon: 28, rare: 14, epic: 5, legendary: 1 };
export const CHEST_WEIGHTS = { common: 0, uncommon: 22, rare: 44, epic: 26, legendary: 8 };

export const AMMO_TYPES = {
  light: { name: 'Light Bullets', stack: 250, classes: ['Light', 'SMG'] },
  medium: { name: 'Medium Bullets', stack: 250, classes: ['Assault Rifle', 'Burst Rifle'] },
  shells: { name: 'Shells', stack: 60, classes: ['Shotgun'] },
  sniperAmmo: { name: 'Sniper Ammo', stack: 40, classes: ['Sniper'] },
  rockets: { name: 'Rockets', stack: 12, classes: ['Launcher'] },
};

export const AMMO_IDS = Object.keys(AMMO_TYPES);

export function ammoForClass(weaponClass) {
  for (const id of AMMO_IDS) {
    if (AMMO_TYPES[id].classes.includes(weaponClass)) return id;
  }
  return 'medium';
}

export function rarityWeightsFor(base, { poiLoot = 1, circlePhase = 0, chest = false } = {}) {
  const out = {};
  const legendaryMul = (1 + circlePhase * 0.5) * (poiLoot > 1.2 ? 1.6 : 1);
  const epicMul = (1 + circlePhase * 0.32) * (poiLoot > 1.2 ? 1.5 : 1);
  for (const id of RARITY_IDS) {
    let w = base[id] ?? 0;
    if (id === 'legendary') w *= legendaryMul;
    else if (id === 'epic') w *= epicMul;
    else if (id === 'rare') w *= 1 + circlePhase * 0.12;
    out[id] = w;
  }
  if (chest) out.common = 0;
  return out;
}

export function rollRarity(rng, weights) {
  let total = 0;
  for (const id of RARITY_IDS) total += weights[id] || 0;
  if (total <= 0) return 'common';
  let r = rng.next() * total;
  for (const id of RARITY_IDS) {
    r -= weights[id] || 0;
    if (r <= 0) return id;
  }
  return 'common';
}

export function rollWeaponArchetype(rng, owned = [], circlePhase = 0) {
  const candidates = [];
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    let weight = w.weight;
    if (owned.includes(id)) weight *= 0.18;
    if (id === 'launcher') weight *= 1 + circlePhase * 0.5;
    if (id === 'sidearm') weight *= owned.length > 1 ? 0.4 : 1.5;
    candidates.push({ id, weight });
  }
  return rng.weighted(candidates).id;
}

let NEXT_PICKUP = 1;

export function makePickup(kind, payload, x, y, z) {
  return {
    id: NEXT_PICKUP++,
    kind, x, y, z,
    ...payload,
    pickedUp: false,
    bob: (NEXT_PICKUP * 0.7) % (Math.PI * 2),
  };
}

export function makeWeaponPickup(rng, archetypeId, rarityId, x, y, z) {
  return makePickup('weapon', { weapon: makeWeapon(archetypeId, rarityId) }, x, y, z);
}

const ISLAND_SAFE_R = 430;

/** Populate the island with floor loot and chests. */
export function generateLoot(terrain, rng, { density = 1 } = {}) {
  const items = [];
  const half = terrain.half;

  const poiAt = (x, z) => {
    for (const p of POIS) {
      if (dist2D(x, z, p.x, p.z) < p.r) return p;
    }
    return null;
  };

  const target = Math.floor(1450 * density);
  let placed = 0;
  let attempts = 0;
  while (placed < target && attempts < target * 12) {
    attempts++;
    const x = rng.range(-half + 12, half - 12);
    const z = rng.range(-half + 12, half - 12);
    const h = terrain.heightAt(x, z);
    if (h < WATER_LEVEL + 0.8) continue;
    if (terrain.slopeAt(x, z) > 0.55) continue;

    const poi = poiAt(x, z);
    const w = poi ? poi.loot * 3.4 : 1;
    if (!rng.chance(w / (w + 2.6))) continue;

    const weights = rarityWeightsFor(RARITY_WEIGHTS, { poiLoot: poi ? poi.loot : 1 });
    placed++;
    const roll = rng.next();

    if (roll < 0.40) {
      const rar = rollRarity(rng, weights);
      items.push(makeWeaponPickup(rng, rollWeaponArchetype(rng, [], 0), rar, x, h + 0.4, z));
    } else if (roll < 0.68) {
      const cls = rng.pick(['Light', 'SMG', 'Assault Rifle', 'Burst Rifle', 'Shotgun', 'Sniper']);
      const id = ammoForClass(cls);
      const n = Math.round(AMMO_TYPES[id].stack * rng.range(0.22, 0.5));
      items.push(makePickup('ammo', { ammoId: id, count: n }, x, h + 0.35, z));
    } else if (roll < 0.92) {
      const cid = rng.weighted([
        { id: 'bandage', weight: 34 },
        { id: 'smallShield', weight: 28 },
        { id: 'medkit', weight: 10 },
        { id: 'bigShield', weight: 18 },
        { id: 'jug', weight: 5 },
      ]).id;
      items.push(makePickup('consumable', { consumableId: cid, count: rng.int(1, 3) }, x, h + 0.35, z));
    } else {
      const mat = rng.weighted([
        { id: 'wood', weight: 46 }, { id: 'brick', weight: 32 }, { id: 'metal', weight: 22 },
      ]).id;
      items.push(makePickup('material', { materialId: mat, count: rng.int(40, 140) }, x, h + 0.35, z));
    }
  }

  const chestTarget = Math.floor(78 * density);
  let chests = 0;
  attempts = 0;
  while (chests < chestTarget && attempts < chestTarget * 16) {
    attempts++;
    const poi = rng.chance(0.72) ? rng.pick(POIS) : null;
    let x, z;
    if (poi) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * poi.r * 0.92;
      x = poi.x + Math.cos(a) * d;
      z = poi.z + Math.sin(a) * d;
    } else {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(120, ISLAND_SAFE_R);
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
    }
    const h = terrain.heightAt(x, z);
    if (h < WATER_LEVEL + 1.0) continue;
    if (terrain.slopeAt(x, z) > 0.42) continue;
    chests++;
    items.push(makePickup('chest', { opened: false }, x, h + 0.5, z));
  }

  return items;
}

export function openChest(rng, x, y, z, circlePhase = 0) {
  const out = [];
  const weights = rarityWeightsFor(CHEST_WEIGHTS, { circlePhase }, true);
  const rar = rollRarity(rng, weights);
  out.push(makeWeaponPickup(rng, rollWeaponArchetype(rng, [], circlePhase), rar, x, y, z));

  const cls = rng.pick(['Light', 'SMG', 'Assault Rifle', 'Burst Rifle', 'Shotgun', 'Sniper']);
  const aid = ammoForClass(cls);
  out.push(makePickup('ammo', {
    ammoId: aid, count: Math.round(AMMO_TYPES[aid].stack * rng.range(0.3, 0.6)),
  }, x + 0.8, y, z));

  const cid = rng.weighted([
    { id: 'bandage', weight: 26 }, { id: 'smallShield', weight: 22 },
    { id: 'medkit', weight: 14 }, { id: 'bigShield', weight: 24 },
    { id: 'jug', weight: 8 },
  ]).id;
  out.push(makePickup('consumable', { consumableId: cid, count: rng.int(1, 3) }, x - 0.8, y, z));

  if (rng.chance(0.55)) {
    const mid = rng.pick(['wood', 'brick', 'metal']);
    out.push(makePickup('material', { materialId: mid, count: rng.int(60, 180) }, x, y, z + 0.8));
  }
  return out;
}

export function pickupLabel(item) {
  switch (item.kind) {
    case 'weapon':
      return `${item.weapon.rarity[0].toUpperCase()}${item.weapon.rarity.slice(1)} ${item.weapon.name}`;
    case 'ammo':
      return `${item.count} ${AMMO_TYPES[item.ammoId].name}`;
    case 'consumable':
      return `${item.count}x ${CONSUMABLES[item.consumableId].name}`;
    case 'material':
      return `${item.count} ${MATERIALS[item.materialId].name}`;
    case 'chest':
      return 'Chest';
    default:
      return 'Item';
  }
}

export function pickupColour(item) {
  switch (item.kind) {
    case 'weapon': return item.weapon.rarityColour;
    case 'ammo': return 0xbfa76a;
    case 'consumable': return CONSUMABLES[item.consumableId].colour;
    case 'material': return MATERIALS[item.materialId].colour;
    case 'chest': return 0xffc23d;
    default: return 0xffffff;
  }
}
