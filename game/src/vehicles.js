// Cars: a low-poly box-built factory, arcade driving physics for the player's car,
// and traffic cars that follow the road grid with simple stopping and turning.
import * as THREE from 'three';
import { CAR, CITY, COLOURS } from './config.js';
import { pick, range } from './random.js';
import { playerPos } from './playerPos.js';

const TRAFFIC_COLOURS = [0xc23b2e, 0x2e6fc2, 0xe8e4da, 0x3a3f46, 0x7a2e4d, 0x2c7a4b, 0xd8a03a, 0x6b5ca8];
const TRAFFIC_COUNT = 10;

function box(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// A car is a group of boxes: body, cabin, wheels, lights. `kind` picks the trim.
export function createCarMesh(kind = 'sedan', color = 0xc23b2e) {
  const group = new THREE.Group();
  const isPolice = kind === 'police';
  const isTaxi = kind === 'taxi';
  const bodyColor = isPolice ? COLOURS.police : isTaxi ? COLOURS.taxi : color;
  const body = box(2.0, 0.62, 4.4, bodyColor, 0, 0.55, 0);
  group.add(body);
  const cabin = box(1.7, 0.55, 2.2, isPolice ? 0xe8e4da : 0x1c2733, 0, 1.1, -0.2);
  group.add(cabin);
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights and taillights.
  group.add(box(0.4, 0.14, 0.06, 0xfff6c9, -0.6, 0.62, 2.21, { emissive: 0xfff2a0, emissiveIntensity: 0.8 }));
  group.add(box(0.4, 0.14, 0.06, 0xfff6c9, 0.6, 0.62, 2.21, { emissive: 0xfff2a0, emissiveIntensity: 0.8 }));
  group.add(box(0.4, 0.14, 0.06, 0xc23b2e, -0.6, 0.62, -2.21, { emissive: 0xc23b2e, emissiveIntensity: 0.6 }));
  group.add(box(0.4, 0.14, 0.06, 0xc23b2e, 0.6, 0.62, -2.21, { emissive: 0xc23b2e, emissiveIntensity: 0.6 }));
  if (isTaxi) {
    group.add(box(0.9, 0.22, 0.5, 0xf5c518, 0, 1.5, -0.2, { emissive: 0xf5c518, emissiveIntensity: 0.5 }));
  }
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    lightBar.add(box(0.7, 0.18, 0.3, 0xff2a2a, -0.45, 1.48, -0.2, { emissive: 0xff2a2a, emissiveIntensity: 1.6 }));
    lightBar.add(box(0.7, 0.18, 0.3, 0x2a6bff, 0.45, 1.48, -0.2, { emissive: 0x2a6bff, emissiveIntensity: 1.6 }));
    group.add(lightBar);
    group.add(box(1.8, 0.3, 0.1, 0xffffff, 0, 0.62, 2.22)); // push bar
  }
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  return group;
}

export function createCar(state, scene, kind, color, x, z, heading) {
  const group = createCarMesh(kind, color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    group, kind, color,
    x, z, heading,
    speed: 0, steer: 0,
    parked: kind !== 'traffic',
    traffic: kind === 'traffic',
    police: kind === 'police',
    driver: null, // 'player' when Rico is inside
    health: 100,
    axis: 'x', dir: 1, road: 0, lane: 0, // traffic AI
    stuck: 0,
  };
  group.userData.actorRef = { kind: 'car', car };
  state.cars.push(car);
  return car;
}

// Arcade driving: accelerate, brake, reverse, steer harder at low speed, drift with
// the handbrake, and bounce off buildings and other cars.
export function drivePlayerCar(state, world, car, input, dt, fx) {
  const move = input.move();
  const throttle = move.forward; // 1 = W, -1 = S
  const steerInput = -move.strafe; // A = left
  const handbrake = input.handbrake();

  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (handbrake) car.speed *= Math.max(0, 1 - 1.6 * dt);

  const steerTarget = steerInput * CAR.steerMax * (car.speed >= 0 ? 1 : -1);
  const steerRate = handbrake ? 5 : 3.2;
  car.steer += (steerTarget - car.steer) * Math.min(1, steerRate * dt);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 12);
  car.heading += car.steer * (car.speed / 2.6) * speedFactor * dt * (handbrake ? 1.5 : 1);

  const fx0 = Math.sin(car.heading);
  const fz0 = Math.cos(car.heading);
  const nx = car.x + fx0 * car.speed * dt;
  const nz = car.z + fz0 * car.speed * dt;
  const probe = { x: nx, z: nz };
  const hitWall = world.resolveCircle(probe, CAR.radius);
  world.clampToGround(probe, CAR.radius);
  const hitCar = collideWithCars(state, probe, car);
  if (hitWall || hitCar) {
    if (Math.abs(car.speed) > 8) {
      car.health -= Math.abs(car.speed) * 0.4;
      fx.crash(Math.abs(car.speed));
      world.addHeat(0);
    }
    car.speed *= -0.25;
  }
  car.x = probe.x;
  car.z = probe.z;

  // Skid marks while the handbrake is on at speed.
  if (handbrake && Math.abs(car.speed) > 10) {
    state.skidMarks.push({ x: car.x, z: car.z, heading: car.heading });
    if (state.skidMarks.length > 220) state.skidMarks.shift();
    fx.dust(car.x, car.z, 2);
  }

  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  for (const wheel of car.group.userData.wheels) wheel.rotation.x += (car.speed * dt) / 0.36;
  return car;
}

// Circle-vs-circle against every other car; pushes the other car aside a little.
function collideWithCars(state, probe, self) {
  let hit = false;
  for (const other of state.cars) {
    if (other === self) continue;
    const dx = probe.x - other.x;
    const dz = probe.z - other.z;
    const d2 = dx * dx + dz * dz;
    const min = CAR.radius * 2 - 0.4;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      probe.x += (dx / d) * push;
      probe.z += (dz / d) * push;
      if (other.traffic) {
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
      }
      hit = true;
    }
  }
  return hit;
}

function randomRoad(rng) {
  return CITY.roadPos[Math.floor(rng() * CITY.roadPos.length)];
}

function spawnTrafficCar(state, scene, rng, near) {
  const axis = rng() < 0.5 ? 'x' : 'z';
  const road = near !== undefined ? near : randomRoad(rng);
  const dir = rng() < 0.5 ? 1 : -1;
  const lane = dir > 0 ? -3.5 : 3.5;
  const along = range(rng, -180, 180);
  const x = axis === 'x' ? along : road + lane;
  const z = axis === 'x' ? road + lane : along;
  const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  const car = createCar(state, scene, 'traffic', pick(rng, TRAFFIC_COLOURS), x, z, heading);
  car.axis = axis;
  car.dir = dir;
  car.road = road;
  car.speed = range(rng, 8, 13);
  car.cruise = car.speed;
  return car;
}

export function createTraffic(state, scene, world, rng) {
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(state, scene, rng);

  // Parked cars the player can steal, from the city's spawn points.
  for (const spot of state.spawnPoints) {
    const kind = rng() < 0.2 ? 'taxi' : 'sedan';
    const car = createCar(state, scene, kind, pick(rng, TRAFFIC_COLOURS), spot.x, spot.z, spot.heading);
    car.parked = true;
  }

  function carAhead(car) {
    for (const other of state.cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = car.axis === 'x' ? dx * car.dir : dz * car.dir;
      const across = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
      if (along > 0 && along < 11 && across < 3.4) return true;
    }
    return false;
  }

  function update(dt) {
    // Traffic respawns near where Rico actually is — the car while driving.
    const { x: px, z: pz } = playerPos(state);
    for (const car of state.cars) {
      if (!car.traffic) continue;
      // Respawning far-away traffic near the player keeps the streets busy.
      const dist = Math.hypot(car.x - px, car.z - pz);
      if (dist > 260) {
        const axis = rng() < 0.5 ? 'x' : 'z';
        const road = CITY.roadPos[Math.floor(rng() * CITY.roadPos.length)];
        const along = (axis === 'x' ? px : pz) + range(rng, -120, 120);
        car.axis = axis;
        car.dir = rng() < 0.5 ? 1 : -1;
        car.road = road;
        car.x = axis === 'x' ? along : road + (car.dir > 0 ? -3.5 : 3.5);
        car.z = axis === 'x' ? road + (car.dir > 0 ? -3.5 : 3.5) : along;
        car.speed = car.cruise;
      }
      // Turn at an intersection sometimes.
      const cross = CITY.roadPos;
      let nearCross = false;
      for (const p of cross) {
        const along = car.axis === 'x' ? car.x : car.z;
        if (Math.abs(along - p) < 2.5) {
          nearCross = true;
          break;
        }
      }
      if (nearCross && rng() < dt * 0.9) {
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newRoad = car.axis === 'x' ? car.z : car.x;
        // Snap onto the cross road.
        let best = cross[0];
        for (const p of cross) if (Math.abs(p - newRoad) < Math.abs(best - newRoad)) best = p;
        car.axis = newAxis;
        car.road = best;
        car.dir = rng() < 0.5 ? 1 : -1;
        const lane = car.dir > 0 ? -3.5 : 3.5;
        if (newAxis === 'x') {
          car.z = best + lane;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.x = best + lane;
          car.heading = car.dir > 0 ? 0 : Math.PI;
        }
      }
      const targetSpeed = carAhead(car) ? 0 : car.cruise;
      car.speed += (targetSpeed - car.speed) * Math.min(1, 2.5 * dt);
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.z += car.dir * car.speed * dt;
      // Wrap around the city edge instead of driving into the sea.
      if (car.x > 196) car.x = -196;
      if (car.x < -196) car.x = 196;
      if (car.z > 196) car.z = -196;
      if (car.z < -196) car.z = 196;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      for (const wheel of car.group.userData.wheels) wheel.rotation.x += (car.speed * dt) / 0.36;
    }
  }

  return { update };
}
