// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, play,
// paused, wasted and busted. ?seed=N fixes the city; ?shot=cover|drive|chase|mission
// (with &seed=N) stages a screenshot scene instead of running the loop.
import * as THREE from 'three';
import { SAVE_KEY } from './config.js';
import { createWorld, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './world.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { createFx } from './particles.js';
import { createPlayer } from './player.js';
import { createTraffic, drivePlayerCar } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const els = {
  hud: document.getElementById('hud'),
  minimap: document.getElementById('minimap'),
  cash: document.getElementById('cash'),
  stars: document.getElementById('stars'),
  healthFill: document.getElementById('healthFill'),
  ammo: document.getElementById('ammo'),
  objective: document.getElementById('objective'),
  timer: document.getElementById('timer'),
  feed: document.getElementById('feed'),
  speedo: document.getElementById('speedo'),
  speed: document.getElementById('speed'),
  hint: document.getElementById('hint'),
  crosshair: document.getElementById('crosshair'),
  banner: document.getElementById('banner'),
  bannerTitle: document.getElementById('bannerTitle'),
  bannerSub: document.getElementById('bannerSub'),
  damage: document.getElementById('damage'),
  titleScreen: document.getElementById('titleScreen'),
  pauseScreen: document.getElementById('pauseScreen'),
  overScreen: document.getElementById('overScreen'),
  bustedScreen: document.getElementById('bustedScreen'),
  overStats: document.getElementById('overStats'),
  bustedStats: document.getElementById('bustedStats'),
  startBtn: document.getElementById('startBtn'),
  continueBtn: document.getElementById('continueBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  restartBtn: document.getElementById('restartBtn'),
  bustedBtn: document.getElementById('bustedBtn'),
  muteBtn: document.getElementById('muteBtn'),
};

const world = createWorld(seed);
const { state } = world;

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 40, 80);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Subsystems ---
const audio = createAudio();
const fx = createFx(state, scene, audio);
const input = createInput(canvas);
const city = buildCity(scene, world, state.rng);
const player = createPlayer(state, scene, world, fx);
const traffic = createTraffic(state, scene, world, state.rng);
const pedestrians = createPedestrians(state, scene, world, state.rng);
const police = createPolice(state, scene, world, state.rng, fx);
const combat = createCombat(state, scene, world, fx, audio);
const missions = createMissions(state, scene, world, fx, combat, audio, writeSave);
const hud = createHud(state, els, audio);
const minimap = createMinimap(els.minimap, state);

// Player starts on the pier road, facing the city.
state.player.x = 0;
state.player.z = 160;
state.player.heading = Math.PI;
state.camYaw = Math.PI;
state.camPitch = 0.34;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
    }));
  } catch {
    // Storage can be off: the game still plays, it just does not save.
  }
}

function announce(message) {
  status.textContent = message;
}

function startGame(useSave) {
  const save = useSave ? readSave() : null;
  if (save) {
    state.cash = save.cash;
    state.missionIndex = save.missionIndex;
    state.missionsDone = save.missionsDone;
    world.message(`Welcome back, Rico. $${state.cash} in the pocket, ${state.missionsDone}/5 jobs done.`);
  } else {
    state.cash = 0;
    state.missionIndex = 0;
    state.missionsDone = 0;
    world.message('Mama Delia has work. Reach the yellow marker.');
  }
  state.screen = SCREEN_PLAY;
  audio.unlock();
  audio.startMusic();
  announce('Playing Sunshore City.');
}

function respawn(penalty) {
  const p = state.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar = null;
    player.mesh.visible = true;
  }
  p.x = 0;
  p.z = 160;
  p.y = 0;
  p.vx = 0;
  p.vz = 0;
  p.vy = 0;
  p.health = 100;
  p.ammo = 12;
  p.hurtFlash = 0;
  p.invulnerable = 2;
  state.heat = 0;
  state.stars = 0;
  police.despawnAll();
  combat.clearEnemies();
  if (state.mission) missions.failMission('Rico went down.');
  if (penalty > 0) {
    state.cash = Math.max(0, state.cash - penalty);
    world.message(`Bail and hospital bills: -$${penalty}.`);
  }
  audio.stopSiren();
  writeSave();
  state.screen = SCREEN_PLAY;
}

hud.bindButtons({
  onStart: (useSave) => startGame(useSave),
  onResume: () => { state.screen = SCREEN_PLAY; },
  onRestart: () => respawn(0),
  onBusted: () => respawn(150),
});

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    els.muteBtn.textContent = muted ? '🔇 Unmute (M)' : '🔊 Mute (M)';
    if (!muted && state.screen === SCREEN_PLAY) audio.startMusic();
  }
  if (actions & ACTION_PAUSE) {
    if (state.screen === SCREEN_PLAY) state.screen = SCREEN_PAUSED;
    else if (state.screen === SCREEN_PAUSED) state.screen = SCREEN_PLAY;
  }
  if (state.screen !== SCREEN_PLAY) return;
  if (actions & ACTION_CONFIRM) {
    // Clicking also shoots; the confirm key alone does nothing in play.
  }
  if (actions & ACTION_ENTER) {
    const p = state.player;
    if (p.inCar) player.exitCar();
    else {
      const car = player.nearestCar(3.6);
      if (car) player.enterCar(car);
      else world.message('No car close enough. Walk up to one and press E.');
    }
  }
  if (actions & ACTION_PUNCH && !state.player.inCar) player.punch();
  if (actions & ACTION_RELOAD) combat.reload();
  if (actions & ACTION_MISSION) {
    const def = missions.currentDef();
    if (def) world.message(`Next mission: ${def.title} — ${def.brief}`);
    else world.message('All missions complete. Free roam!');
  }
  if (input.takeClick() && !state.player.inCar) combat.shootFrom(camera);
}

// Third-person camera: orbit with the mouse, chase behind the car while driving.
let lastDragAt = -10;
function updateCamera(dt) {
  const p = state.player;
  const delta = input.mouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    state.camYaw -= delta.dx * 0.005;
    state.camPitch += delta.dy * 0.003;
    state.camPitch = Math.max(0.08, Math.min(0.9, state.camPitch));
    lastDragAt = state.time;
  }
  const target = p.inCar
    ? { x: p.inCar.x, y: 1.6, z: p.inCar.z }
    : { x: p.x, y: p.y + 1.5, z: p.z };
  // While driving, ease the camera behind the car unless the player just dragged.
  if (p.inCar && state.time - lastDragAt > 1.2) {
    const want = p.inCar.heading + Math.PI;
    let diff = want - state.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.camYaw += diff * Math.min(1, 1.6 * dt);
  }
  const dist = p.inCar ? 10.5 : 7.5;
  const height = Math.sin(state.camPitch) * dist;
  const flat = Math.cos(state.camPitch) * dist;
  const cx = target.x + Math.sin(state.camYaw) * flat;
  const cz = target.z + Math.cos(state.camYaw) * flat;
  const shake = state.shake;
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
  camera.position.set(cx + sx, target.y + height + sy, cz);
  camera.lookAt(target.x, target.y, target.z);
}

function step() {
  const dt = STEP;
  state.time += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
  const p = state.player;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  // Player: on foot or driving.
  if (p.inCar) {
    drivePlayerCar(state, world, p.inCar, input, dt, fx);
    audio.startEngine();
    audio.setEngine(Math.abs(p.inCar.speed) / 42, true);
    if (p.inCar.health <= 0) {
      // The car is wrecked: Rico climbs out of the smoke.
      const wreck = p.inCar;
      fx.explosion(wreck.x, wreck.z);
      player.exitCar();
      wreck.health = 100;
      p.health -= 20;
    }
  } else {
    player.update(dt, input, state.camYaw);
    audio.setEngine(0, false);
  }

  traffic.update(dt);
  pedestrians.update(dt);
  police.update(dt);
  combat.update(dt, camera);
  missions.update(dt);
  world.decayHeat(dt);
  city.update(dt);
  fx.update(dt);

  // Wanted decay also hides the player: no stars, no police.
  if (p.health <= 0) {
    state.screen = SCREEN_OVER;
    audio.stopSiren();
    audio.stopEngine();
    writeSave();
  }
  if (state.screen === SCREEN_BUSTED) {
    els.bustedStats.textContent = `Cash $${state.cash.toLocaleString('en-US')} · Missions ${state.missionsDone}/5 — bail costs $150.`;
    writeSave();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  handleActions();
  if (state.screen === SCREEN_PLAY || state.screen === SCREEN_BUSTED) {
    // The busted screen freezes the world but still paints it.
    if (state.screen === SCREEN_PLAY) {
      frameAccumulator += Math.min((now - lastTime) / 1000, MAX_FRAME);
      while (frameAccumulator >= STEP) {
        step();
        frameAccumulator -= STEP;
        if (state.screen !== SCREEN_PLAY) break;
      }
    }
  } else if (state.screen === SCREEN_TITLE) {
    // Title backdrop: a slow orbit over the city, traffic rolling.
    state.time += 1 / 60;
    state.camYaw += 0.0006;
    traffic.update(1 / 60);
    city.update(1 / 60);
    const cx = Math.sin(state.camYaw) * 120;
    const cz = Math.cos(state.camYaw) * 120;
    camera.position.set(cx, 55, cz);
    camera.lookAt(0, 0, 0);
  }
  lastTime = now;
  if (state.screen !== SCREEN_TITLE) updateCamera(1 / 60);
  hud.update();
  minimap.draw();
  renderer.render(scene, camera);
}

let frameAccumulator = 0;
let lastTime = performance.now();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === SCREEN_PLAY) state.screen = SCREEN_PAUSED;
});

// --- Test hooks for the Playwright playtest (never used by the game itself) ---
window.__game = {
  state,
  start: (useSave) => startGame(useSave),
  respawn: () => respawn(0),
  input,
  teleport: (x, z) => {
    const p = state.player;
    if (p.inCar) {
      p.inCar.x = x;
      p.inCar.z = z;
    } else {
      p.x = x;
      p.z = z;
    }
  },
  exitCar: () => player.exitCar(),
  forceMission: (index, stepIndex) => missions.forceStart(index, stepIndex),
  setHeat: (heat) => world.addHeat(heat),
  version: 'sunshore-1',
};

if (shot) {
  // Staged screenshot scene: build it, paint it, signal readiness.
  stageShot(shot, {
    state, world, missions, combat, player, traffic, input, camera,
    step: () => step(),
  });
  // Keep rendering so the frame settles, then flag ready.
  let painted = 0;
  (function paint() {
    updateCamera(1 / 60);
    hud.update();
    minimap.draw();
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  announce('Sunshore City. Press Start to play.');
  requestAnimationFrame(frame);
}
