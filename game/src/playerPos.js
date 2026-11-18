// The player's real position: the car while driving, Rico on foot otherwise.
// The on-foot coordinates go stale the moment Rico gets in a car, so police,
// traffic, pedestrians and enemies all aim at this instead of state.player.x/z.
export function playerPos(state) {
  const p = state.player;
  return p.inCar ? { x: p.inCar.x, z: p.inCar.z } : { x: p.x, z: p.z };
}
