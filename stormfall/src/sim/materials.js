// Build resources. Three tiers with distinct durability, yield and speed.

export const MATERIALS = {
  wood: {
    id: 'wood', name: 'Wood', hp: 150, harvestHits: 3, yieldPerHit: 20,
    harvestRate: 1.5, colour: 0xa9713f, colourDark: 0x6f4522, tier: 1,
  },
  brick: {
    id: 'brick', name: 'Brick', hp: 300, harvestHits: 3, yieldPerHit: 20,
    harvestRate: 1.1, colour: 0xa4543a, colourDark: 0x6b3122, tier: 2,
  },
  metal: {
    id: 'metal', name: 'Metal', hp: 440, harvestHits: 3, yieldPerHit: 20,
    harvestRate: 0.75, colour: 0x9aa4ac, colourDark: 0x5c666e, tier: 3,
  },
};

export const MATERIAL_IDS = Object.keys(MATERIALS);

export const BUILD_COST = { wall: 10, floor: 10, stair: 10, roof: 10 };

export class MaterialBag {
  constructor(start = { wood: 0, brick: 0, metal: 0 }) {
    this.wood = start.wood | 0;
    this.brick = start.brick | 0;
    this.metal = start.metal | 0;
  }

  get(id) { return this[id] | 0; }

  add(id, n) {
    this[id] = Math.max(0, this[id] + (n | 0));
    return this[id];
  }

  spend(id, n) {
    if (this[id] < n) return false;
    this[id] -= n;
    return true;
  }

  canAfford(id, n) { return this[id] >= n; }

  total() { return this.wood + this.brick + this.metal; }

  toJSON() { return { wood: this.wood, brick: this.brick, metal: this.metal }; }
}
