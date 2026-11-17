// Pedestrians: low-poly walkers who stroll the sidewalks, cross at intersections,
// and run away screaming (in behaviour, not in audio) when scared by a car or a shot.
import * as THREE from 'three';
import { CITY } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = [0xe8632c, 0x2e6fc2, 0x7a2e4d, 0x2c7a4b, 0xd8a03a, 0x6b5ca8, 0xe8e4da, 0x3a3f46];
const PED_COUNT = 22;

function createPedMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d34 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), shirt);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legL.geometry.translate(0, -0.36, 0);
  legL.position.set(-0.15, 0.72, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), shirt);
  armL.geometry.translate(0, -0.3, 0);
  armL.position.set(-0.38, 1.36, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.38;
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

// A sidewalk waypoint: on a road's kerb, or on a block's edge.
function randomSidewalkPoint(rng) {
  const road = pick(rng, CITY.roadPos);
  if (rng() < 0.5) return { x: road + 9.5, z: range(rng, -185, 185) };
  return { x: range(rng, -185, 185), z: road + 9.5 };
}

export function createPedestrians(state, scene, world, rng) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const spot = randomSidewalkPoint(rng);
    const mesh = createPedMesh(pick(rng, SHIRTS));
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    const target = randomSidewalkPoint(rng);
    const ped = {
      group: mesh, x: spot.x, z: spot.z,
      heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.0),
      target, state: 'walk', panic: 0, phase: rng() * 6,
    };
    mesh.userData.actorRef = { kind: 'ped', ped };
    peds.push(ped);
  }
  state.peds = peds;

  function scare(x, z, radius, panicTime = 5) {
    for (const ped of peds) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.panic = panicTime;
        ped.state = 'flee';
      }
    }
  }

  function update(dt) {
    const px = state.player.x;
    const pz = state.player.z;
    const playerCar = state.player.inCar;
    for (const ped of peds) {
      if (ped.panic > 0) ped.panic -= dt;
      if (ped.panic <= 0 && ped.state === 'flee') ped.state = 'walk';

      // A speeding car nearby scares pedestrians; a car that touches one is a crime.
      if (playerCar) {
        const d = Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z);
        if (d < 6 && Math.abs(playerCar.speed) > 6) {
          ped.panic = 4;
          ped.state = 'flee';
        }
        if (d < 1.9 && Math.abs(playerCar.speed) > 2) {
          world.addHeat(0.8);
          world.message('You hit a pedestrian!');
          ped.panic = 6;
          ped.state = 'flee';
          ped.x += (ped.x - playerCar.x) * 0.6;
          ped.z += (ped.z - playerCar.z) * 0.6;
          playerCar.speed *= 0.6;
        }
      }

      let tx;
      let tz;
      let speed = ped.speed;
      if (ped.state === 'flee') {
        // Run directly away from the player.
        const dx = ped.x - px;
        const dz = ped.z - pz;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 10;
        tz = ped.z + (dz / d) * 10;
        speed = 5.5;
      } else {
        tx = ped.target.x;
        tz = ped.target.z;
        if (Math.hypot(tx - ped.x, tz - ped.z) < 1.5) ped.target = randomSidewalkPoint(rng);
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += diff * Math.min(1, 8 * dt);
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        ped.phase += speed * dt * 2.2;
      }
      // Keep pedestrians on dry land.
      if (world.inWater(ped.x, ped.z)) {
        ped.z = CITY.waterZ - 1;
        ped.target = randomSidewalkPoint(rng);
      }
      ped.x = Math.max(-198, Math.min(198, ped.x));
      ped.z = Math.max(-198, Math.min(198, ped.z));
      const swing = Math.sin(ped.phase) * 0.5;
      const u = ped.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.heading;
    }
  }

  return { update, scare };
}
