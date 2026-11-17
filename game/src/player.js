// Rico Vega on foot: a stylized low-poly person built from boxes, WASD movement
// relative to the camera, running, jumping, punching, and getting in and out of cars.
import * as THREE from 'three';
import { CAR, PLAYER } from './config.js';

export function createPlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e6fc2 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22242c });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.38), hair);
  hairTop.position.y = 1.9;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.position.set(-0.17, 0.39, 0);
  legL.geometry.translate(0, -0.39, 0);
  legL.position.y = 0.78;
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), shirt);
  armL.position.set(-0.42, 1.42, 0);
  armL.geometry.translate(0, -0.33, 0);
  armL.position.y = 1.42;
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export function createPlayer(state, scene, world, fx) {
  const mesh = createPlayerMesh();
  scene.add(mesh);
  const p = state.player;
  let walkPhase = 0;

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.driver === 'player') continue;
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  // Step on a car: stealing a parked car is a crime, taking a stopped one too.
  function enterCar(car) {
    const wasParked = car.parked;
    p.inCar = car;
    car.driver = 'player';
    car.parked = false;
    car.traffic = false;
    if (wasParked && !car.stolenCounted) {
      car.stolenCounted = true;
      state.carsStolen += 1;
      world.addHeat(1.0);
      world.message('Car stolen! The cops were told.');
      fx.sirenBlip();
    } else {
      world.message('You got in the car.');
    }
    mesh.visible = false;
  }

  function exitCar() {
    const car = p.inCar;
    if (!car) return;
    car.driver = null;
    p.inCar = null;
    // Step out on the driver's side.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    p.x = car.x + sideX * 1.8;
    p.z = car.z + sideZ * 1.8;
    p.vx = 0;
    p.vz = 0;
    p.heading = car.heading;
    mesh.visible = true;
    world.message('You got out.');
  }

  function punch() {
    if (p.punchCooldown > 0) return;
    p.punchCooldown = 0.45;
    fx.punch();
    const fx0 = Math.sin(p.heading);
    const fz0 = Math.cos(p.heading);
    // Hit the nearest enemy, ped or officer in front.
    const targets = [
      ...state.enemies.filter((e) => e.alive),
      ...state.officers,
      ...state.peds,
    ];
    for (const t of targets) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) continue;
      if ((dx * fx0 + dz * fz0) / Math.max(d, 0.001) < 0.4) continue;
      if (t.health !== undefined) {
        t.health -= 25;
        fx.blood(t.x, 1.2, t.z);
        if (t.health <= 0 && t.alive !== undefined) {
          t.alive = false;
          world.addHeat(1.2);
          state.kills += 1;
        }
      } else {
        // A pedestrian: they panic and run; hitting one is a crime.
        t.panic = 6;
        t.state = 'flee';
        world.addHeat(0.8);
        world.message('You hit a pedestrian! Witnesses called the police.');
      }
      return;
    }
  }

  function update(dt, input, camYaw) {
    if (p.inCar) return;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;

    const move = input.move();
    // Camera-relative movement: forward is where the camera looks, i.e. away
    // from the camera's orbit position (-sin(camYaw), -cos(camYaw)).
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    let mx = -sin * move.forward + cos * move.strafe;
    let mz = -cos * move.forward - sin * move.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const accel = 40;
    p.vx += (mx * speed - p.vx) * Math.min(1, accel * dt / speed);
    p.vz += (mz * speed - p.vz) * Math.min(1, accel * dt / speed);

    const probe = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
    const hit = world.resolveCircle(probe, PLAYER.radius);
    if (hit) {
      p.vx *= 0.4;
      p.vz *= 0.4;
    }
    world.clampToGround(probe, PLAYER.radius);
    // Bumping into a parked car shoves the player, not the car.
    for (const car of state.cars) {
      const dx = probe.x - car.x;
      const dz = probe.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < CAR.radius && d > 0.01) {
        probe.x = car.x + (dx / d) * CAR.radius;
        probe.z = car.z + (dz / d) * CAR.radius;
      }
    }
    p.x = probe.x;
    p.z = probe.z;

    if (input.jumping() && p.onGround) {
      p.vy = PLAYER.jumpSpeed;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= PLAYER.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.onGround = true;
        fx.dust(p.x, p.z, 3);
      }
    }

    // Face the direction of travel.
    const moving = Math.hypot(p.vx, p.vz);
    if (moving > 0.5) {
      const target = Math.atan2(p.vx, p.vz);
      let diff = target - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += diff * Math.min(1, 12 * dt);
      walkPhase += moving * dt * 1.6;
    }
    const swing = moving > 0.5 ? Math.sin(walkPhase) * 0.55 : 0;
    const u = mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    if (p.punchCooldown > 0.25) {
      u.armR.rotation.x = -1.6; // punching arm extended
    }

    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.heading;
  }

  return {
    mesh,
    update,
    enterCar,
    exitCar,
    punch,
    nearestCar,
  };
}
