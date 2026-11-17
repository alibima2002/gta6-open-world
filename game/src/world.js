// The game's shared state and the collision rules, with no drawing in it: every
// subsystem reads and writes this one object, so the loop stays the only coordinator.
import { CITY, PLAYER, WANTED } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

export function createWorld(seed) {
  const rng = createRandom(seed);
  const state = {
    rng,
    seed,
    time: 0,
    screen: SCREEN_TITLE,
    // Rico Vega on foot.
    player: {
      x: 0, y: 0, z: 30,
      vx: 0, vz: 0, vy: 0,
      heading: 0, // facing, radians; 0 = -Z
      onGround: true,
      health: PLAYER.health,
      ammo: 12,
      reloading: 0,
      inCar: null, // the car object when driving
      punchCooldown: 0,
      shootCooldown: 0,
      hurtFlash: 0,
      invulnerable: 0,
    },
    cash: 0,
    heat: 0,
    stars: 0,
    kills: 0,
    carsStolen: 0,
    missionIndex: 0, // next mission to play
    missionsDone: 0,
    // The city builder fills these in.
    colliders: [], // {minX,maxX,minZ,maxZ}
    buildings: [], // {x,z,w,d,h} for the minimap
    roadLines: [], // road centre positions, for the minimap
    spawnPoints: [], // {x,z} parking spots
    // Live actors, filled by their managers.
    cars: [], // every drivable car: {group, x,z,heading,speed,steer,kind,color,parked,traffic,police,health}
    peds: [], // {group,x,z,heading,speed,state,panic}
    police: [], // {car, officer} pursuit units
    officers: [], // foot police {group,x,z,heading,arrest}
    enemies: [], // gang members {group,x,z,heading,health,shootTimer,alive}
    particles: [],
    tracers: [],
    skidMarks: [],
    // Camera orbit (mouse drag) and shake.
    camYaw: 0,
    camPitch: 0.32,
    shake: 0,
    // Mission runtime.
    mission: null, // {def, step, timer, target:{x,z}, marker, ...}
    marker: null, // {x,z,label} or null
    messageLog: [], // {text, t}
    banner: null, // {title, sub, t}
    muted: false,
  };

  function addCollider(minX, maxX, minZ, maxZ) {
    state.colliders.push({ minX, maxX, minZ, maxZ });
  }

  // Push a circle (x,z,radius) out of every building AABB it overlaps. Returns true
  // when a push happened, so callers can play a bump sound or lose speed.
  function resolveCircle(pos, radius) {
    let pushed = false;
    for (const c of state.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
      pushed = true;
    }
    return pushed;
  }

  // Water is a wall everywhere except the causeway corridor (and the island).
  function inWater(x, z) {
    if (z < CITY.waterZ) return false;
    if (Math.abs(x) <= CITY.causewayHalf) return false; // the causeway
    const dx = x;
    const dz = z - CITY.islandZ;
    if (dx * dx + dz * dz < (CITY.islandR + 2) * (CITY.islandR + 2)) return false;
    return true;
  }

  function clampToGround(pos, radius) {
    const half = CITY.half;
    pos.x = Math.max(-half + radius, Math.min(half - radius, pos.x));
    pos.z = Math.max(-half + radius, Math.min(half - radius, pos.z));
    if (inWater(pos.x, pos.z)) {
      // Shove back to the sand: the nearest dry point is straight back north.
      pos.z = CITY.waterZ - radius - 0.5;
    }
  }

  function addHeat(amount) {
    state.heat = Math.min(5.5, state.heat + amount);
    state.stars = state.heat < 0.5 ? 0 : Math.min(5, Math.floor(state.heat - 0.5) + 1);
  }

  function decayHeat(dt) {
    if (state.heat <= 0) return;
    state.heat = Math.max(0, state.heat - WANTED.decayPerSec * dt);
    state.stars = state.heat < 0.5 ? 0 : Math.min(5, Math.floor(state.heat - 0.5) + 1);
  }

  function message(text) {
    state.messageLog.push({ text, t: state.time });
    if (state.messageLog.length > 5) state.messageLog.shift();
  }

  function showBanner(title, sub) {
    state.banner = { title, sub, t: state.time };
  }

  return { state, addCollider, resolveCircle, inWater, clampToGround, addHeat, decayHeat, message, showBanner };
}
