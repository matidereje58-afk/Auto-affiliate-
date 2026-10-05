// HUD: vitals, hotbar, minimap, killfeed, prompts, damage feedback.
// Reads the world each frame and writes to the DOM only when a value changes.

import { MAX_HEALTH, MAX_SHIELD, CONSUMABLES } from '../sim/health.js';
import { RARITY } from '../sim/weapons.js';
import { MATERIALS } from '../sim/materials.js';
import { POIS } from '../sim/terrain.js';
import { clamp } from '../sim/math.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      alive: $('alive-count'),
      kills: $('kill-count'),
      stormLabel: $('storm-label'),
      stormTimer: $('storm-timer'),
      stormChip: $('storm-chip'),
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      shieldFill: $('shield-fill'),
      shieldText: $('shield-text'),
      consumables: $('consumables'),
      hotbar: $('hotbar'),
      matList: $('mat-list'),
      minimap: $('minimap'),
      bigmap: $('bigmap'),
      bigmapCanvas: $('bigmap-canvas'),
      killfeed: $('killfeed'),
      prompt: $('prompt'),
      buildInfo: $('build-info'),
      phaseBanner: $('phase-banner'),
      vignette: $('dmg-vignette'),
      hitmarker: $('hitmarker'),
      dmgDirs: $('dmg-dirs'),
      centreNote: $('center-note'),
      crosshair: $('crosshair'),
    };
    this.mmCtx = this.el.minimap.getContext('2d');
    this.bigCtx = this.el.bigmapCanvas?.getContext('2d') || null;
    this._last = {};
    this._consumableEls = new Map();
    this._hotbarEls = [];
    this._matEls = new Map();
    this._mapImage = null;
    this._feed = [];
    this._bannerTimer = 0;
    this.buildStatic();
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  buildStatic() {
    this.el.hotbar.innerHTML = '';
    this._hotbarEls = [];
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'slot empty';
      d.innerHTML = `<span class="num">${i + 1}</span><div class="nm"></div><div class="am"></div><div class="rar"></div>`;
      this.el.hotbar.appendChild(d);
      this._hotbarEls.push(d);
    }

    this.el.consumables.innerHTML = '';
    this._consumableEls.clear();
    for (const id of ['bandage', 'medkit', 'smallShield', 'bigShield', 'jug']) {
      const c = CONSUMABLES[id];
      const d = document.createElement('div');
      d.className = 'cons';
      d.style.borderColor = `#${c.colour.toString(16).padStart(6, '0')}`;
      d.innerHTML = '<b>0</b>';
      d.title = c.name;
      this.el.consumables.appendChild(d);
      this._consumableEls.set(id, d);
    }

    this.el.matList.innerHTML = '';
    this._matEls.clear();
    for (const id of ['wood', 'brick', 'metal']) {
      const m = MATERIALS[id];
      const row = document.createElement('div');
      row.className = 'mat';
      row.innerHTML = `<span><span class="sw" style="background:#${m.colour.toString(16).padStart(6, '0')}"></span>${m.name}</span><b>0</b>`;
      this.el.matList.appendChild(row);
      this._matEls.set(id, row.querySelector('b'));
    }
  }

  /** Hillshaded island image shared by the minimap and the big map. */
  buildMapImage(terrain) {
    const N = 256;
    const cvs = document.createElement('canvas');
    cvs.width = N;
    cvs.height = N;
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(N, N);
    const half = terrain.half;
    const step = (half * 2) / N;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -half + i * step;
        const z = -half + j * step;
        const h = terrain.heightAt(x, z);
        const k = (j * N + i) * 4;
        if (h < 0) {
          const d = clamp(-h / 26, 0, 1);
          img.data[k] = 22 + (1 - d) * 50;
          img.data[k + 1] = 70 + (1 - d) * 70;
          img.data[k + 2] = 100 + (1 - d) * 70;
        } else {
          const hx = terrain.heightAt(x + step, z) - terrain.heightAt(x - step, z);
          const hz = terrain.heightAt(x, z + step) - terrain.heightAt(x, z - step);
          const shade = clamp(0.62 + (-hx - hz) * 0.075, 0.3, 1.25);
          const t = clamp(h / 34, 0, 1);
          img.data[k] = clamp((108 + t * 96) * shade, 0, 255);
          img.data[k + 1] = clamp((132 + t * 74) * shade, 0, 255);
          img.data[k + 2] = clamp((74 + t * 82) * shade, 0, 255);
        }
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    ctx.font = '600 9px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    for (const p of POIS) {
      const px = ((p.x + half) / (half * 2)) * N;
      const py = ((p.z + half) / (half * 2)) * N;
      ctx.fillStyle = p.hub ? 'rgba(255,235,190,0.95)' : 'rgba(220,230,240,0.6)';
      ctx.fillText(p.name.toUpperCase(), px, py);
    }
    this._mapImage = cvs;
    return cvs;
  }

  update(world, dt) {
    const h = world.hud();
    const p = world.player;

    this._text(this.el.alive, h.match.alive);
    this._text(this.el.kills, p ? p.kills : 0);

    const st = h.storm;
    this._text(this.el.stormLabel, st.done ? 'FINAL STORM' : st.label);
    this._text(this.el.stormTimer, st.done ? '—' : fmtTime(st.timer));
    const danger = !h.stormSafe;
    if (this._last.danger !== danger) {
      this.el.stormChip.classList.toggle('danger', danger);
      this._last.danger = danger;
    }

    if (p) {
      const hp = Math.max(0, Math.round(p.health));
      const sh = Math.max(0, Math.round(p.shield));
      this._style(this.el.healthFill, `width:${(hp / MAX_HEALTH) * 100}%`);
      this._style(this.el.shieldFill, `width:${(sh / MAX_SHIELD) * 100}%`);
      this._text(this.el.healthText, hp);
      this._text(this.el.shieldText, sh);

      this._hotbar(p.inventory);
      const mats = p.inventory.bag.toJSON();
      for (const [id, el] of this._matEls) this._text(el, mats[id] | 0);
      for (const [id, el] of this._consumableEls) {
        const n = p.inventory.countConsumable(id);
        const key = `${id}:${n}:${p.usingId === id}`;
        if (this._last[`c_${id}`] === key) continue;
        this._last[`c_${id}`] = key;
        el.querySelector('b').textContent = n;
        el.classList.toggle('use', n > 0 && p.usingId !== id && consumableReady(id, p));
      }
    }

    this._damageFeedback(world);
    this._minimap(world);
    if (!this.el.bigmap.classList.contains('hidden')) this._bigmap(world);
    this._prompt(world);

    if (p) {
      this._setNote(
        p.fallState === 'aboard' ? 'PRESS SPACE TO JUMP'
          : p.fallState === 'freefall' ? 'SPACE — DEPLOY GLIDER' : null,
      );
    }
    void dt;
  }

  _hotbar(inv) {
    for (let i = 0; i < 5; i++) {
      const el = this._hotbarEls[i];
      const w = inv.slots[i];
      const key = w
        ? `${w.archetype}:${w.rarity}:${w.ammo}:${i === inv.active}`
        : `empty:${i === inv.active}`;
      if (this._last[`h${i}`] === key) continue;
      this._last[`h${i}`] = key;
      el.classList.toggle('active', i === inv.active);
      el.classList.toggle('empty', !w);
      const nm = el.querySelector('.nm');
      const am = el.querySelector('.am');
      const rar = el.querySelector('.rar');
      if (w) {
        nm.textContent = w.name;
        nm.className = `nm ${RARITY[w.rarity].css}`;
        am.textContent = `${w.ammo}/${inv.reserveFor(w)}`;
        rar.style.background = `#${RARITY[w.rarity].colour.toString(16).padStart(6, '0')}`;
      } else {
        nm.textContent = '';
        nm.className = 'nm';
        am.textContent = '';
        rar.style.background = 'transparent';
      }
    }
  }

  _damageFeedback(world) {
    const p = world.player;
    if (!p) return;
    const hurt = 1 - clamp((p.health + p.shield) / (MAX_HEALTH + MAX_SHIELD), 0, 1);
    this.el.vignette.style.opacity = String(Math.min(0.85, hurt * 0.75));

    const since = world.time - p.lastDamageTime;
    const wantDirs = since < 1.1 && p.lastDamageDir;
    if (this._last.dirs === String(wantDirs)) return;
    this._last.dirs = String(wantDirs);
    if (!wantDirs) { this.el.dmgDirs.innerHTML = ''; return; }
    const rel = Math.atan2(p.lastDamageDir.z, p.lastDamageDir.x) - p.yaw;
    this.el.dmgDirs.innerHTML = '';
    for (const off of [-0.5, 0, 0.5]) {
      const d = document.createElement('div');
      d.className = 'dmg-dir';
      d.style.transform = `rotate(${-(rel + off) + Math.PI / 2}rad)`;
      this.el.dmgDirs.appendChild(d);
    }
  }

  _minimap(world) {
    const ctx = this.mmCtx;
    const cvs = this.el.minimap;
    const W = cvs.width;
    const p = world.player;
    if (!p) return;

    // The minimap shows WORLD_SPAN world units across its width. The baked map
    // image covers 1024 world units in 256 px, so the source rectangle has to be
    // derived from that ratio rather than assumed.
    const WORLD_SPAN = 300;
    const MAP_PX = 256;
    const WORLD_IN_MAP = 1024;
    const srcHalf = (WORLD_SPAN / 2) * (MAP_PX / WORLD_IN_MAP);
    const scale = W / WORLD_SPAN;
    ctx.clearRect(0, 0, W, W);

    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-p.yaw);

    if (this._mapImage) {
      const px = ((p.pos.x + 512) / WORLD_IN_MAP) * MAP_PX;
      const pz = ((p.pos.z + 512) / WORLD_IN_MAP) * MAP_PX;
      ctx.drawImage(this._mapImage,
        px - srcHalf, pz - srcHalf, srcHalf * 2, srcHalf * 2,
        -W / 2, -W / 2, W, W);
    }

    const rel = (wx, wz) => ({ x: (wx - p.pos.x) * scale, z: (wz - p.pos.z) * scale });

    const c = rel(world.storm.cx, world.storm.cz);
    ctx.strokeStyle = '#c05aff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(c.x, c.z, world.storm.r * scale, 0, Math.PI * 2);
    ctx.stroke();

    if (Math.abs(world.storm.to.r - world.storm.r) > 1.2) {
      const n = rel(world.storm.to.cx, world.storm.to.cz);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(n.x, n.z, world.storm.to.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const item of world.pickups) {
      if (item.pickedUp || item.kind !== 'chest') continue;
      if (Math.hypot(item.x - p.pos.x, item.z - p.pos.z) > 190) continue;
      const q = rel(item.x, item.z);
      ctx.fillStyle = '#ffc23d';
      ctx.fillRect(q.x - 1.6, q.z - 1.6, 3.2, 3.2);
    }
    ctx.restore();

    // Player arrow, always centred.
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(W / 2, W / 2 - 8);
    ctx.lineTo(W / 2 - 6, W / 2 + 6);
    ctx.lineTo(W / 2 + 6, W / 2 + 6);
    ctx.closePath();
    ctx.fill();
  }

  _bigmap(world) {
    const ctx = this.bigCtx;
    const cvs = this.el.bigmapCanvas;
    if (!ctx) return;
    const W = cvs.width;
    ctx.clearRect(0, 0, W, W);
    if (this._mapImage) ctx.drawImage(this._mapImage, 0, 0, W, W);
    const toPx = (wx, wz) => ({ x: ((wx + 512) / 1024) * W, y: ((wz + 512) / 1024) * W });
    const p = world.player;

    const c = toPx(world.storm.cx, world.storm.cz);
    ctx.strokeStyle = '#c05aff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, (world.storm.r / 1024) * W, 0, Math.PI * 2);
    ctx.stroke();

    if (Math.abs(world.storm.to.r - world.storm.r) > 1.2) {
      const n = toPx(world.storm.to.cx, world.storm.to.cz);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(n.x, n.y, (world.storm.to.r / 1024) * W, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    const a = toPx(world.match.busFrom.x, world.match.busFrom.z);
    const b = toPx(world.match.busTo.x, world.match.busTo.z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const item of world.pickups) {
      if (item.pickedUp || item.kind !== 'chest') continue;
      const q = toPx(item.x, item.z);
      ctx.fillStyle = '#ffc23d';
      ctx.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
    }

    if (p) {
      const q = toPx(p.pos.x, p.pos.z);
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  kill(killerName, victimName, weaponName, mine = false, storm = false) {
    const div = document.createElement('div');
    div.className = 'kf' + (mine ? ' mine' : '') + (storm ? ' storm' : '');
    div.innerHTML = storm
      ? `<span class="k">${escapeHtml(victimName)}</span> <span class="v">was consumed by the storm</span>`
      : `<span class="k">${escapeHtml(killerName)}</span> <span class="w">${escapeHtml(weaponName || 'melee')}</span> <span class="v">${escapeHtml(victimName)}</span>`;
    this.el.killfeed.appendChild(div);
    this._feed.push({ el: div, t: 0 });
    while (this._feed.length > 6) this._feed.shift().el.remove();
  }

  tickTimers(dt) {
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.el.phaseBanner.classList.add('hidden');
    }
    for (let i = this._feed.length - 1; i >= 0; i--) {
      const f = this._feed[i];
      f.t += dt;
      if (f.t > 7) { f.el.remove(); this._feed.splice(i, 1); }
      else if (f.t > 6) f.el.style.opacity = String(1 - (f.t - 6));
    }
  }

  hit(kill = false) {
    const el = this.el.hitmarker;
    el.classList.remove('show', 'kill');
    void el.offsetWidth;   // force reflow so rapid hits restart the animation
    el.classList.add('show');
    if (kill) el.classList.add('kill');
  }

  banner(text, seconds = 4) {
    this.el.phaseBanner.textContent = text;
    this.el.phaseBanner.classList.remove('hidden');
    this._bannerTimer = seconds;
  }

  _prompt(world) {
    const p = world.player;
    const it = p && p.alive ? world.playerInteractable() : null;
    if (!it) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.innerHTML = `<b>E</b> ${escapeHtml(it.label)}`;
    this.el.prompt.classList.remove('hidden');
  }

  buildPreview(label, valid, reason, materialName, cost) {
    const el = this.el.buildInfo;
    if (!label) { el.classList.add('hidden'); return; }
    el.innerHTML = `<b>${label}</b> · ${materialName} <b>${cost}</b>`
      + (valid ? '' : ` · <span class="bad">${escapeHtml(reason)}</span>`);
    el.classList.remove('hidden');
  }

  _setNote(text) {
    if (this._last.note === text) return;
    this._last.note = text;
    const el = this.el.centreNote;
    if (text) { el.textContent = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  _text(el, v) {
    if (!el) return;
    const s = String(v);
    if (this._last[el.id] === s) return;
    this._last[el.id] = s;
    el.textContent = s;
  }

  _style(el, s) {
    if (!el) return;
    if (this._last[`s_${el.id}`] === s) return;
    this._last[`s_${el.id}`] = s;
    el.style.cssText = s;
  }
}

function consumableReady(id, actor) {
  if (actor.usingId) return false;
  if (id === 'bandage' || id === 'medkit') return actor.health < MAX_HEALTH;
  return actor.shield < MAX_SHIELD;
}
