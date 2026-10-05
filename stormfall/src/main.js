// STORMFALL - entry point.
//
// Owns the frame loop and the bridge between the pure simulation (src/sim) and
// the three.js presentation (src/render). Nothing here decides gameplay rules.

import * as THREE from '../vendor/three.module.js';
import { World, TICK } from './sim/world.js';
import { BUILD_TYPES, pieceBounds, CELL } from './sim/grid.js';
import { MATERIALS, BUILD_COST } from './sim/materials.js';
import { currentSpread, makeWeapon } from './sim/weapons.js';
import { clamp, damp } from './sim/math.js';
import { SceneRig } from './render/scene.js';
import { TerrainMesh } from './render/terrainMesh.js';
import { CharacterMesh } from './render/characters.js';
import { PropsRender } from './render/propsRender.js';
import { BuildRender, StormRender, PickupRender, Effects } from './render/world_render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const Game = {
  quality: params.get('q') === 'high' ? 'high' : 'low',
  state: 'loading',
  world: null,
  rig: null,
  input: null,
  audio: null,
  hud: null,
  frames: 0,
  frameBudget: Number(params.get('frames') || 0),
  camYaw: 0,
  camPitch: 0,
  camDist: 5.4,
  camPos: new THREE.Vector3(),
  camTarget: new THREE.Vector3(),
  buildMode: false,
  time: 0,
  lastHarvestAt: -9,
  lastBuildAt: -9,
};

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ===========================================================================
// Boot
// ===========================================================================

async function boot() {
  const t = $('load-text');
  if (t) t.textContent = 'Starting renderer…';
  await frame();

  Game.rig = new SceneRig($('view'), { quality: Game.quality });
  Game.audio = new Audio();
  Game.input = new Input($('view'));
  Game.hud = new HUD();

  // A headless/dedicated run never takes pointer lock and never auto-pauses on
  // losing it, because a browser without a real pointer cannot hold the lock.
  const headless = params.get('headless') === '1';
  Game.input.onLockChange = (locked) => {
    if (!locked && !headless && Game.state === 'playing') pauseGame();
  };

  wireMenus();
  wireKeys();
  addEventListener('resize', () => Game.rig?.resize());
  Game.rig.resize();

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  Game.state = 'menu';

  if (params.get('auto') === '1') {
    startMatch({
      seed: Number(params.get('seed') || 1337),
      players: Number(params.get('players') || 50),
      difficulty: Number(params.get('difficulty') || 0.62),
    });
  }
  loop();
}

// ===========================================================================
// Match lifecycle
// ===========================================================================

function startMatch({ seed, players, difficulty, quality }) {
  if (quality && !params.get('q')) Game.quality = quality === 'high' ? 'high' : 'low';
  $('menu').classList.add('hidden');
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('loading').classList.remove('hidden');
  $('load-text').textContent = 'Generating island…';

  requestAnimationFrame(() => {
    Game.world = new World({ seed, players, difficulty, lootDensity: 1 });
    const w = Game.world;

    const rig = Game.rig;
    rig.scene.clear();
    rig._buildLights();
    rig._buildSky();
    rig._buildWater();

    rig.scene.add(new TerrainMesh(w.terrain, { quality: Game.quality }).group);
    Game.propsRender = new PropsRender(w.props, { quality: Game.quality });
    Game.propsRender.rebuild();
    rig.scene.add(Game.propsRender.group);

    Game.buildRender = new BuildRender(w.build);
    Game.stormRender = new StormRender();
    Game.pickupRender = new PickupRender(w.pickups);
    Game.effects = new Effects();
    rig.scene.add(Game.buildRender.group, Game.stormRender.group,
      Game.pickupRender.group, Game.effects.group);

    Game.charMeshes = new Map();
    for (const a of w.actors) {
      const cm = new CharacterMesh(a, { isPlayer: a.isPlayer });
      Game.charMeshes.set(a.id, cm);
      rig.scene.add(cm.root);
    }

    // Translucent preview of the piece the player would place.
    const ghostGeo = new THREE.BoxGeometry(CELL, CELL, CELL);
    Game.ghost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({
      color: 0x8fff9a, transparent: true, opacity: 0.26, depthWrite: false,
    }));
    Game.ghostWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(ghostGeo),
      new THREE.LineBasicMaterial({ color: 0x8fff9a, transparent: true, opacity: 0.85 }),
    );
    Game.ghost.add(Game.ghostWire);
    Game.ghost.visible = false;
    rig.scene.add(Game.ghost);

    Game.hud.buildMapImage(w.terrain);
    Game.hud.show(true);
    $('loading').classList.add('hidden');

    const p = w.player;
    Game.camYaw = p.yaw;
    Game.camPitch = -0.3;
    Game.buildMode = false;
    Game.state = 'playing';
    w.paused = false;

    if (!params.get('auto') && params.get('headless') !== '1') {
      setTimeout(() => { if (Game.state === 'playing') Game.input.requestLock(); }, 150);
    }
  });
}

function pauseGame() {
  if (Game.state !== 'playing') return;
  Game.state = 'paused';
  Game.world.paused = true;
  $('pause').classList.remove('hidden');
  Game.input.exitLock();
}

function resumeGame() {
  if (Game.state !== 'paused') return;
  $('pause').classList.add('hidden');
  Game.world.paused = false;
  Game.state = 'playing';
  Game.audio.resume();
  Game.input.requestLock();
}

function endMatch(win) {
  Game.state = 'result';
  Game.world.paused = true;
  Game.input.exitLock();
  const r = Game.world.result || { placement: 0, kills: 0, damage: 0, survived: 0, circles: 0 };
  $('result-title').textContent = win ? '#1  VICTORY ROYALE' : `#${r.placement}`;
  $('result-title').className = win ? 'win' : 'placement';
  $('result-sub').textContent = win
    ? 'You outlasted the storm.'
    : `You placed #${r.placement} of ${Game.world.match.totalPlayers}`;
  $('result-stats').innerHTML = `
    <div><span>Eliminations</span><b>${r.kills}</b></div>
    <div><span>Damage taken</span><b>${r.damage}</b></div>
    <div><span>Survived</span><b>${Math.floor(r.survived / 60)}m ${Math.floor(r.survived % 60)}s</b></div>
    <div><span>Storm phases</span><b>${r.circles}</b></div>`;
  $('result').classList.remove('hidden');
  Game.hud.show(false);
  if (win) Game.audio.victory();
}

function quitToMenu() {
  Game.state = 'menu';
  Game.world = null;
  $('pause').classList.add('hidden');
  $('result').classList.add('hidden');
  $('menu').classList.remove('hidden');
  Game.hud.show(false);
  Game.input.exitLock();
}

// ===========================================================================
// Menus and key bindings
// ===========================================================================

function wireMenus() {
  const opts = () => ({
    seed: Number($('opt-seed').value) || 1337,
    players: Number($('opt-players').value) || 50,
    difficulty: Number($('opt-difficulty').value) || 0.62,
    quality: $('opt-quality').value,
  });
  $('btn-play').onclick = () => { Game.audio.init(); Game.audio.resume(); startMatch(opts()); };
  $('btn-resume').onclick = resumeGame;
  $('btn-quit').onclick = quitToMenu;
  $('btn-again').onclick = () => { $('result').classList.add('hidden'); startMatch(opts()); };
  $('btn-menu').onclick = quitToMenu;
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && Game.state === 'playing') pauseGame();
  });
}

function wireKeys() {
  const I = Game.input;
  const playing = (fn) => (...a) => { if (Game.state === 'playing') fn(...a); };

  I.on('KeyR', playing(() => Game.world.playerReload()));
  I.on('KeyE', playing(interact));
  I.on('KeyQ', playing(dropWeapon));
  I.on('KeyB', playing(toggleBuildMode));
  I.on('KeyX', playing(() => {
    const p = Game.world?.player;
    if (p) p.buildRot = p.buildRot ? 0 : 1;
  }));
  I.on('KeyF', playing(() => $('materials').classList.toggle('hidden')));
  I.on('Tab', playing(() => $('materials').classList.toggle('hidden')));
  I.on('KeyM', playing(() => $('bigmap').classList.toggle('hidden')));
  for (let i = 1; i <= 5; i++) {
    I.on(`Digit${i}`, playing(() => {
      const w = Game.world;
      w.playerSelectSlot(i - 1, I.anyDown(['ShiftLeft', 'ShiftRight']));
    }));
  }
  // Consumables get their own keys so they cannot collide with weapon slots.
  I.on('KeyZ', playing(() => Game.world.playerUseConsumable('bandage')));
  I.on('KeyC', playing(() => Game.world.playerUseConsumable('smallShield')));
  I.on('KeyV', playing(() => Game.world.playerUseConsumable('bigShield')));
  I.on('KeyG', playing(() => Game.world.playerUseConsumable('medkit')));
  I.on('KeyH', playing(() => Game.world.playerUseConsumable('jug')));
}

function interact() {
  const w = Game.world;
  if (!w?.player) return;
  const it = w.playerInteractable();
  if (!it) return;
  if (it.kind === 'pickup') w.tryPickup(w.player, it.item);
  else if (it.kind === 'prop') w.playerHarvest();
}

function dropWeapon() {
  const w = Game.world;
  const p = w?.player;
  if (!p) return;
  const weapon = p.inventory.current;
  if (!weapon) return;
  p.inventory.takeSlot(p.inventory.active);
  w.spawnPickup('weapon', { weapon }, p.pos.x, p.pos.y, p.pos.z);
}

function toggleBuildMode() {
  Game.buildMode = !Game.buildMode;
  if (!Game.buildMode) {
    $('build-info').classList.add('hidden');
    if (Game.ghost) Game.ghost.visible = false;
  }
}

// ===========================================================================
// Frame loop
// ===========================================================================

let last = performance.now();

function loop() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  Game.time += dt;
  Game.frames++;

  if (Game.world) {
    if (Game.state === 'playing') stepGame(dt);
    if (Game.state !== 'menu') {
      renderWorld(dt);
      Game.hud.update(Game.world, dt);
      Game.hud.tickTimers(dt);
    }
  }

  if (Game.frameBudget > 0 && Game.frames >= Game.frameBudget) {
    globalThis.__GAME.ready = true;
    return;   // idle so headless screenshots can settle
  }
  requestAnimationFrame(loop);
}

function stepGame(dt) {
  const w = Game.world;
  const I = Game.input;
  const p = w.player;

  if (I.locked) {
    const look = I.consumeLook(Game.camYaw, Game.camPitch);
    Game.camYaw = look.yaw;
    Game.camPitch = look.pitch;
  }
  p.yaw = Game.camYaw;
  p.pitch = Game.camPitch;

  const wantBuild = Game.buildMode || I.down('KeyB');
  p.aiming = I.mouse.right && !wantBuild && !!p.weapon;
  w.setPlayerIntent(I.intent(p.yaw, p.pitch));

  // Firing. With a weapon drawn, left click is always the gun; bare-handed (or
  // completely dry) it harvests instead.
  if (I.mouse.left && I.locked) {
    if (p.fallState === 'aboard' || p.fallState === 'freefall') {
      w.playerJump();
    } else if (!wantBuild) {
      const weapon = p.weapon;
      const dry = weapon && weapon.ammo <= 0 && w.player.inventory.reserveFor(weapon) <= 0;
      if (!weapon || dry) {
        if (Game.time - Game.lastHarvestAt > 0.28) {
          Game.lastHarvestAt = Game.time;
          if (w.playerHarvest()) Game.audio.build('hit');
        }
      } else if (p.fireCooldown <= 0 && weapon.reloading <= 0) {
        w.playerFire();
      }
    }
  }

  if (wantBuild && p.fallState === 'ground' && Game.time - Game.lastBuildAt > 0.09) {
    Game.lastBuildAt = Game.time;
    Game.audio.build(w.playerBuild() ? 'place' : 'hit');
  }
  if (!wantBuild) Game.lastBuildAt = -9;

  const wheel = I.consumeWheel();
  if (wheel) w.playerCycleWeapon(wheel > 0 ? 1 : -1);

  w.update(dt);
  processEvents(w);

  // The player's own death ends their match immediately. Waiting for the last
  // player standing would leave a corpse and an active HUD on screen.
  if (!p.alive && Game.state === 'playing') {
    endMatch(w.result?.won === true);
  } else if (w.ended && Game.state === 'playing') {
    endMatch(w.result?.won === true);
  }
}

function processEvents(w) {
  const p = w.player;
  for (const e of w.events) {
    switch (e.type) {
      case 'shot': {
        const a = w.actors.find((x) => x.id === e.actorId);
        if (!a) break;
        const d = Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y, a.pos.z - p.pos.z);
        Game.audio.shot(e.weapon.class, d);
        const muzzle = a.eyePos;
        const dir = a.aimDir();
        const from = a.id === p.id
          ? { x: muzzle.x + dir.x * 0.7, y: muzzle.y - 0.12, z: muzzle.z + dir.z * 0.7 }
          : muzzle;
        Game.effects.tracer(from, {
          x: muzzle.x + dir.x * 55, y: muzzle.y + dir.y * 55, z: muzzle.z + dir.z * 55,
        });
        break;
      }
      case 'impact':
        Game.effects.impact(e.point, e.explosive ? 0xffa03c : 0xffd27a, e.explosive ? 12 : 4);
        break;
      case 'explosion':
        Game.effects.explosion(e.centre, e.radius);
        Game.audio.explosion();
        break;
      case 'hit-damage':
        if (e.actorId === p.id) { Game.audio.hitTaken(); Game.hud.hit(false); }
        else if (e.attackerId === p.id) Game.hud.hit(false);
        break;
      case 'eliminated': {
        const killer = e.killerId != null ? w.actors.find((x) => x.id === e.killerId) : null;
        Game.hud.kill(
          killer ? killer.name : 'The storm',
          e.name,
          killer?.weapon?.name,
          killer?.id === p.id || e.actorId === p.id,
          e.cause === 'storm',
        );
        if (e.actorId === p.id) Game.hud.hit(true);
        break;
      }
      case 'pickup':
      case 'chest-opened':
        if (e.actorId === p.id) Game.audio.pickup();
        break;
      case 'storm-advance':
        Game.hud.banner(`STORM ${e.phase + 1}  ·  ${e.dps.toFixed(0)} DPS OUTSIDE`, 4);
        Game.audio.stormWarning();
        break;
      case 'landed': {
        const a = w.actors.find((x) => x.id === e.actorId);
        if (a) Game.effects.impact({ x: a.pos.x, y: a.pos.y + 0.1, z: a.pos.z }, 0xd8cfae, 6);
        break;
      }
      default:
        break;
    }
  }
  if (w.props.events.some((x) => x.type === 'prop-destroyed')) Game.propsRender.rebuild();
  if (w.build.events.some((x) => x.type === 'build' || x.type === 'piece-destroyed')) {
    Game.buildRender.update();
  }
}

// ===========================================================================
// Rendering
// ===========================================================================

function renderWorld(dt) {
  const w = Game.world;
  const rig = Game.rig;
  const p = w.player;

  for (const a of w.actors) {
    const cm = Game.charMeshes.get(a.id);
    if (!cm) continue;
    const d2 = Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y, a.pos.z - p.pos.z);
    const visible = a.alive && d2 < 140;
    if (cm.visible !== visible) cm.visible = visible;
    if (visible) cm.update(dt);
  }

  Game.propsRender.update();
  Game.buildRender.update();
  Game.stormRender.update(w.storm, dt);
  Game.pickupRender.update(dt, p.pos);
  Game.effects.update(dt);

  updateCamera(dt, w, p);
  updateCrosshair(p);
  updateBuildGhost(w, p);

  rig.focusShadows(p.pos);
  rig.followCamera(rig.camera.position, Game.time);
  rig.render();
}

function updateCamera(dt, w, p) {
  const rig = Game.rig;
  const wantDist = Game.buildMode ? 6.4 : (p.aiming ? 2.5 : 5.4);
  Game.camDist = damp(Game.camDist, wantDist, 9, dt);

  const eye = p.eyePos;
  const cp = Math.cos(Game.camPitch);
  const dir = {
    x: Math.cos(Game.camYaw) * cp,
    y: Math.sin(Game.camPitch),
    z: Math.sin(Game.camYaw) * cp,
  };
  const right = { x: -Math.sin(Game.camYaw), z: Math.cos(Game.camYaw) };
  const shoulder = p.aiming ? 0.42 : 0.78;

  const focus = {
    x: eye.x + right.x * shoulder,
    y: eye.y + 0.06,
    z: eye.z + right.z * shoulder,
  };
  Game.camTarget.lerp(new THREE.Vector3(focus.x, focus.y, focus.z), 1 - Math.exp(-22 * dt));

  // Pull in if terrain is in the way.
  let dist = Game.camDist;
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  for (let t = 0.4; t <= Game.camDist; t += 0.35) {
    const px = focus.x + back.x * t;
    const py = focus.y + back.y * t;
    const pz = focus.z + back.z * t;
    if (py < w.terrain.heightAt(px, pz) + 0.5) { dist = Math.max(1.1, t - 0.35); break; }
  }
  Game.camPos.set(focus.x + back.x * dist, focus.y + back.y * dist, focus.z + back.z * dist);
  rig.camera.position.copy(Game.camPos);
  rig.camera.lookAt(Game.camTarget);

  const wantFov = p.aiming ? 52 : 78;
  if (Math.abs(rig.camera.fov - wantFov) > 0.05) {
    rig.camera.fov = damp(rig.camera.fov, wantFov, 14, dt);
    rig.camera.updateProjectionMatrix();
  }
}

function updateCrosshair(p) {
  const el = $('crosshair');
  const weapon = p.weapon;
  if (!weapon || p.aiming) {
    el.style.opacity = p.aiming ? '0.9' : '0';
    return;
  }
  el.style.opacity = '1';
  const spread = currentSpread(weapon, {
    moving: p.speed, aiming: false, crouched: p.crouching, airborne: !p.grounded,
  });
  const gap = clamp(6 + spread * 620, 5, 46);
  const spans = el.children;
  spans[0].style.top = `${13 - gap}px`;
  spans[1].style.top = `${gap + 3}px`;
  spans[2].style.left = `${13 - gap}px`;
  spans[3].style.left = `${gap + 3}px`;
}

function updateBuildGhost(w, p) {
  const ghost = Game.ghost;
  if (!ghost) return;
  if (!Game.buildMode || p.fallState !== 'ground') {
    ghost.visible = false;
    Game.hud.buildPreview(null);
    return;
  }
  const spec = BUILD_TYPES[p.buildIndex % BUILD_TYPES.length];
  const cell = w.aimBuildTarget(p);
  const mat = p.inventory.buildMaterial;
  const cost = BUILD_COST[spec.key];
  const check = w.build.canPlace(spec.type, cell.gx, cell.gy, cell.gz, p.buildRot, p, w.actors);

  ghost.visible = true;
  const b = pieceBounds(spec.type, cell.gx, cell.gy, cell.gz, p.buildRot);
  ghost.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  ghost.scale.set((b.max.x - b.min.x) / CELL, (b.max.y - b.min.y) / CELL, (b.max.z - b.min.z) / CELL);
  const col = check.ok ? 0x8fff9a : 0xff5a5a;
  ghost.material.color.setHex(col);
  Game.ghostWire.material.color.setHex(col);

  Game.hud.buildPreview(spec.label, check.ok, check.reason, MATERIALS[mat].name, cost);
}

// ===========================================================================
// Debug surface for headless verification
// ===========================================================================

globalThis.__GAME = {
  ready: false,
  get world() { return Game.world; },
  probe() {
    const w = Game.world;
    return {
      state: Game.state,
      quality: Game.quality,
      frames: Game.frames,
      fps: +(Game.frames / Math.max(0.001, Game.time)).toFixed(1),
      drawCalls: Game.rig?.renderer.info.render.calls,
      triangles: Game.rig?.renderer.info.render.triangles,
      world: w ? {
        alive: w.match.aliveTotal,
        actors: w.actors.length,
        bots: w.bots.size,
        props: w.props.count(),
        pickups: w.pickups.length,
        pieces: w.build.count(),
        projectiles: w.projectiles.length,
        shotsFired: w.stats.shotsFired,
        shotsHit: w.stats.shotsHit,
        matchState: w.match.state,
        storm: { phase: w.storm.phase, state: w.storm.state, r: +w.storm.r.toFixed(1) },
        player: w.player ? {
          alive: w.player.alive,
          hp: Math.round(w.player.health),
          shield: Math.round(w.player.shield),
          pos: [+w.player.pos.x.toFixed(1), +w.player.pos.y.toFixed(1), +w.player.pos.z.toFixed(1)],
          ground: +w.terrain.heightAt(w.player.pos.x, w.player.pos.z).toFixed(1),
          fallState: w.player.fallState,
          weapons: w.player.inventory.slots.filter(Boolean).length,
          kills: w.player.kills,
          ended: w.ended,
        } : null,
      } : null,
    };
  },
  api: {
    start: (opts) => startMatch({ seed: 1337, players: 50, difficulty: 0.62, ...opts }),
    look: (yaw, pitch) => { Game.camYaw = yaw; Game.camPitch = pitch; },
    build: (on) => { Game.buildMode = on; },
    jump: () => Game.world?.playerJump(),
    fire: () => Game.world?.playerFire(),
    harvest: () => Game.world?.playerHarvest(),
    teleport: (x, z) => {
      const w = Game.world;
      if (!w) return;
      w.player.pos.x = x;
      w.player.pos.z = z;
      w.player.pos.y = w.terrain.heightAt(x, z) + 0.5;
      w.player.fallState = 'ground';
      w.player.grounded = true;
    },
    giveWeapon: (arch = 'rifle', rarity = 'rare') => {
      const w = Game.world;
      if (!w) return false;
      w.player.inventory.addWeapon(makeWeapon(arch, rarity));
      return true;
    },
    giveAll: () => {
      const w = Game.world;
      if (!w) return false;
      const p = w.player;
      p.inventory.addWeapon(makeWeapon('rifle', 'epic'));
      p.inventory.addWeapon(makeWeapon('shotgun', 'rare'));
      p.inventory.addWeapon(makeWeapon('sniper', 'legendary'));
      p.inventory.addAmmo('light', 120);
      p.inventory.addAmmo('medium', 240);
      p.inventory.addAmmo('shells', 40);
      p.inventory.addAmmo('sniperAmmo', 20);
      p.inventory.addAmmo('rockets', 6);
      p.inventory.addConsumable('bandage', 6);
      p.inventory.addConsumable('medkit', 2);
      p.inventory.addConsumable('bigShield', 3);
      p.inventory.addMaterial('wood', 400);
      return true;
    },
    /** Fast-forward the simulation without rendering. */
    step: (n = 1) => { for (let i = 0; i < n; i++) Game.world?.step(TICK); },
  },
};

boot().catch((err) => {
  console.error('boot failed', err);
  const t = $('load-text');
  if (t) t.textContent = `Failed: ${err.message}`;
});
