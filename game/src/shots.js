// The screenshot scenes behind ?shot=cover|drive|chase|mission. Each one sets up a
// real game state (a mission in progress, a wanted level, a shootout), then plays the
// real rules forward for a few seconds with scripted keys, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { SCREEN_PLAY } from './world.js';

const STEPS_PER_SECOND = 60;

function holdKey(input, code, seconds, step) {
  input._testPress(code);
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i += 1) step();
  input._testRelease(code);
}

function putPlayerInCar(ctx, x, z, heading) {
  const { state, player } = ctx;
  // Find the nearest parked car and drive it to the staging point.
  let best = null;
  let bestD = 1e9;
  for (const car of state.cars) {
    if (!car.parked) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (!best) return null;
  best.x = x;
  best.z = z;
  best.heading = heading;
  best.group.position.set(x, 0, z);
  best.group.rotation.y = heading;
  state.player.x = x;
  state.player.z = z;
  player.enterCar(best);
  return best;
}

function stageCover(ctx) {
  // Rico driving toward the Pier 9 pickup, mission 1 live, the city ahead.
  const { state, missions } = ctx;
  state.cash = 250;
  missions.forceStart(0, 0);
  putPlayerInCar(ctx, 0, 120, Math.PI);
  state.camYaw = 0;
  holdKey(ctx.input, 'KeyW', 2.2, ctx.step);
}

function stageDrive(ctx) {
  // A fast run down the beachfront road toward the causeway.
  const { state } = ctx;
  state.cash = 640;
  putPlayerInCar(ctx, -58, 150, 0);
  state.camYaw = Math.PI;
  state.camPitch = 0.24;
  holdKey(ctx.input, 'KeyW', 3.2, ctx.step);
}

function stageChase(ctx) {
  // Three stars, cruisers closing in, Rico flooring it through the grid.
  const { state, world } = ctx;
  state.cash = 1150;
  putPlayerInCar(ctx, 0, -20, 0);
  state.camYaw = Math.PI;
  state.camPitch = 0.24;
  world.addHeat(2.5); // three stars
  ctx.step();
  holdKey(ctx.input, 'KeyW', 3.6, ctx.step);
  // Put two cruisers in frame ahead of the player, closing in head-on, so the
  // chase reads in a still: the rest of the pack is behind the camera.
  const car = state.player.inCar;
  const fx0 = Math.sin(car.heading);
  const fz0 = Math.cos(car.heading);
  state.police.slice(0, 2).forEach((unit, i) => {
    const side = i === 0 ? -6 : 6;
    unit.car.x = car.x + fx0 * 26 - fz0 * side;
    unit.car.z = car.z + fz0 * 26 + fx0 * side;
    unit.car.heading = car.heading + Math.PI;
    unit.car.speed = 20;
  });
  ctx.step();
}

function stageMission(ctx) {
  // Turf War: Rico on foot in the old lot, gang members closing in.
  const { state, missions, player } = ctx;
  state.cash = 900;
  state.player.x = -87;
  state.player.z = 70;
  state.player.heading = 0; // facing south, toward the lot and the gang
  state.camYaw = Math.PI; // camera north of Rico, looking south at the gang
  state.camPitch = 0.3;
  missions.forceStart(3, 1); // mission 4, kill step: 5 gang members spawn
  player.mesh.visible = true;
  for (let i = 0; i < 2 * STEPS_PER_SECOND; i += 1) ctx.step();
  // Rico fires at the nearest gang member, so a tracer shows in the frame.
  ctx.combat.shootFrom(ctx.camera);
  ctx.step();
}

/**
 * Set the game to the named scene (cover, drive, chase or mission; any other name
 * is cover) and leave it on the play screen with the HUD showing.
 */
export function stageShot(name, ctx) {
  const { state } = ctx;
  state.screen = SCREEN_PLAY;
  if (name === 'drive') stageDrive(ctx);
  else if (name === 'chase') stageChase(ctx);
  else if (name === 'mission') stageMission(ctx);
  else stageCover(ctx);
  state.screen = SCREEN_PLAY;
}
