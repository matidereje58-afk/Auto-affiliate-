// Weapons, rarity tiers and per-rarity stat scaling.

export const RARITY = {
  common:    { id: 'common',    name: 'Common',    css: 'r-common',    colour: 0xb9c4cf, damage: 1.00, rpm: 1.00, mag: 1.00 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  css: 'r-uncommon',  colour: 0x52d97e, damage: 1.10, rpm: 1.05, mag: 1.10 },
  rare:      { id: 'rare',      name: 'Rare',      css: 'r-rare',      colour: 0x46d2ff, damage: 1.20, rpm: 1.10, mag: 1.20 },
  epic:      { id: 'epic',      name: 'Epic',      css: 'r-epic',      colour: 0xb47cff, damage: 1.32, rpm: 1.15, mag: 1.35 },
  legendary: { id: 'legendary', name: 'Legendary', css: 'r-legendary', colour: 0xffc23d, damage: 1.45, rpm: 1.20, mag: 1.50 },
};

export const RARITY_IDS = Object.keys(RARITY);

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'Sidearm', class: 'Light',
    rpm: 320, damage: 25, headMult: 1.7, magazine: 16, reload: 1.55,
    range: 90, falloffStart: 40, falloffEnd: 90, falloffMin: 0.72,
    spread: 0.007, moveSpread: 0.010, adsSpread: 0.62, recoil: 0.0055,
    projectile: null, ammoPerShot: 1, weight: 20,
  },
  smg: {
    id: 'smg', name: 'Sidewinder', class: 'SMG',
    rpm: 780, damage: 21, headMult: 1.5, magazine: 30, reload: 2.05,
    range: 70, falloffStart: 26, falloffEnd: 70, falloffMin: 0.45,
    spread: 0.013, moveSpread: 0.006, adsSpread: 0.70, recoil: 0.0075,
    projectile: null, ammoPerShot: 1, tracerEvery: 2, weight: 22,
  },
  rifle: {
    id: 'rifle', name: 'Longmarch', class: 'Assault Rifle',
    rpm: 420, damage: 34, headMult: 1.9, magazine: 30, reload: 2.45,
    range: 200, falloffStart: 140, falloffEnd: 200, falloffMin: 0.82,
    spread: 0.008, moveSpread: 0.011, adsSpread: 0.48, recoil: 0.0085,
    projectile: null, ammoPerShot: 1, weight: 20,
  },
  burst: {
    id: 'burst', name: 'Tatburst AR', class: 'Burst Rifle',
    rpm: 420, burst: 3, damage: 30, headMult: 1.9, magazine: 30, reload: 2.5,
    range: 180, falloffStart: 120, falloffEnd: 180, falloffMin: 0.85,
    spread: 0.010, moveSpread: 0.012, adsSpread: 0.50, recoil: 0.010,
    projectile: null, ammoPerShot: 1, weight: 14,
  },
  shotgun: {
    id: 'shotgun', name: 'Breaker', class: 'Shotgun',
    rpm: 78, damage: 19, pellets: 9, headMult: 1.35, magazine: 5, reload: 3.1,
    range: 42, falloffStart: 12, falloffEnd: 42, falloffMin: 0.16,
    spread: 0.075, moveSpread: 0.004, adsSpread: 0.78, recoil: 0.030,
    projectile: null, ammoPerShot: 1, weight: 18,
  },
  sniper: {
    id: 'sniper', name: 'Longwatch', class: 'Sniper',
    rpm: 42, damage: 112, headMult: 2.5, magazine: 5, reload: 3.6,
    range: 420, falloffStart: 420, falloffEnd: 460, falloffMin: 1.0,
    spread: 0.002, moveSpread: 0.055, adsSpread: 0.18, recoil: 0.055,
    projectile: 620, ammoPerShot: 1, weight: 7,
  },
  launcher: {
    id: 'launcher', name: 'Thunderclap', class: 'Launcher',
    rpm: 55, damage: 118, splash: 62, splashRadius: 5.4, headMult: 1.0,
    magazine: 1, reload: 3.4, range: 320, falloffStart: 320, falloffEnd: 320,
    falloffMin: 1.0, spread: 0.003, moveSpread: 0.020, adsSpread: 0.55,
    recoil: 0.045, projectile: 190, ammoPerShot: 1, weight: 4,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

let NEXT_SERIAL = 1;

export function makeWeapon(archetypeId, rarityId = 'common') {
  const base = WEAPONS[archetypeId];
  if (!base) throw new Error(`unknown weapon archetype: ${archetypeId}`);
  const r = RARITY[rarityId] || RARITY.common;

  const rpm = base.rpm * r.rpm;
  return {
    serial: NEXT_SERIAL++,
    archetype: base.id,
    name: base.name,
    class: base.class,
    rarity: r.id,
    rarityCss: r.css,
    rarityColour: r.colour,

    damage: base.damage * r.damage,
    headMult: base.headMult,
    splash: base.splash ? base.splash * r.damage : 0,
    splashRadius: base.splashRadius || 0,
    pellets: base.pellets || 1,

    rpm,
    fireInterval: 60 / rpm / (base.burst || 1),
    burst: base.burst || 1,
    magazine: Math.max(1, Math.round(base.magazine * r.mag)),
    reloadTime: base.reload,

    range: base.range,
    falloffStart: base.falloffStart,
    falloffEnd: base.falloffEnd,
    falloffMin: base.falloffMin,
    spread: base.spread,
    moveSpread: base.moveSpread,
    adsSpread: base.adsSpread,
    recoil: base.recoil,
    projectile: base.projectile,
    tracerEvery: base.tracerEvery || 1,
    ammoPerShot: base.ammoPerShot,

    ammo: Math.max(1, Math.round(base.magazine * r.mag)),
    cooldown: 0,
    reloading: 0,
    burstLeft: 0,
    burstTimer: 0,
  };
}

export function damageAtRange(weapon, distance) {
  const b = WEAPONS[weapon.archetype];
  if (distance <= b.falloffStart) return weapon.damage;
  if (distance >= b.falloffEnd) return weapon.damage * b.falloffMin;
  const t = (distance - b.falloffStart) / (b.falloffEnd - b.falloffStart);
  return weapon.damage * (1 + (b.falloffMin - 1) * t);
}

export function currentSpread(weapon, { moving = 0, aiming = false, crouched = false, airborne = false } = {}) {
  let s = weapon.spread + moving * weapon.moveSpread;
  if (aiming) s *= weapon.adsSpread;
  if (crouched) s *= 0.72;
  if (airborne) s *= 2.1;
  return s;
}

export const displayRpm = (weapon) => Math.round(weapon.rpm * weapon.burst);
