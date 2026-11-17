// The wanted level: police cars and foot officers who chase, ram and arrest.
// Stars 1-2 bring cruisers; 3+ adds more and faster ones; on foot, officers close in
// and hold Rico until he is busted. Stars decay while Rico stays clean.
import * as THREE from 'three';
import { CAR, CITY } from './config.js';
import { SCREEN_BUSTED } from './world.js';
import { createCar } from './vehicles.js';
import { range } from './random.js';

const MAX_CRUISERS = 5;

function createOfficerMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f6e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), navy);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.4), navy);
  cap.position.y = 1.9;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), navy);
  legL.geometry.translate(0, -0.39, 0);
  legL.position.set(-0.17, 0.78, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  group.userData = { legL, legR };
  return group;
}

export function createPolice(state, scene, world, rng, fx) {
  let sirenOn = false;

  function spawnCruiser() {
    const p = state.player;
    const angle = rng() * Math.PI * 2;
    const dist = range(rng, 55, 80);
    const x = Math.max(-190, Math.min(190, p.x + Math.sin(angle) * dist));
    const z = Math.max(-190, Math.min(190, p.z + Math.cos(angle) * dist));
    const car = createCar(state, scene, 'police', 0x1c2f6e, x, z, rng() * Math.PI * 2);
    car.police = true;
    car.parked = false;
    car.cruise = 0;
    state.police.push({ car, ramTimer: 0 });
    return car;
  }

  function spawnOfficer() {
    const p = state.player;
    const angle = rng() * Math.PI * 2;
    const mesh = createOfficerMesh();
    const x = p.x + Math.sin(angle) * 18;
    const z = p.z + Math.cos(angle) * 18;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const officer = { group: mesh, x, z, heading: 0, arrest: 0, phase: 0 };
    mesh.userData.actorRef = { kind: 'officer', officer };
    state.officers.push(officer);
    return officer;
  }

  function despawnAll() {
    for (const unit of state.police) {
      scene.remove(unit.car.group);
      const i = state.cars.indexOf(unit.car);
      if (i >= 0) state.cars.splice(i, 1);
    }
    state.police = [];
    for (const officer of state.officers) scene.remove(officer.group);
    state.officers = [];
  }

  function update(dt) {
    const stars = state.stars;
    const p = state.player;
    const wanted = stars > 0;

    // Siren follows the wanted level.
    if (wanted && !sirenOn) {
      fx.startSiren();
      sirenOn = true;
    } else if (!wanted && sirenOn) {
      fx.stopSiren();
      sirenOn = false;
    }

    // Cruisers: one per star, up to five.
    const wantCruisers = Math.min(MAX_CRUISERS, stars);
    while (state.police.length < wantCruisers) spawnCruiser();
    while (state.police.length > wantCruisers) {
      const unit = state.police.pop();
      scene.remove(unit.car.group);
      const i = state.cars.indexOf(unit.car);
      if (i >= 0) state.cars.splice(i, 1);
    }
    // Foot officers when Rico is on foot and wanted.
    const wantOfficers = !p.inCar && stars >= 2 ? Math.min(3, stars - 1) : 0;
    while (state.officers.length < wantOfficers) spawnOfficer();
    while (state.officers.length > wantOfficers) {
      const officer = state.officers.pop();
      scene.remove(officer.group);
    }

    // --- Cruiser pursuit: steer toward the player, ram on contact ---
    const targetX = p.inCar ? p.inCar.x : p.x;
    const targetZ = p.inCar ? p.inCar.z : p.z;
    for (const unit of state.police) {
      const car = unit.car;
      const dx = targetX - car.x;
      const dz = targetZ - car.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const topSpeed = 26 + stars * 3;
      car.speed += (topSpeed - car.speed) * Math.min(1, 0.9 * dt);
      car.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff * 2.2 * dt * 2));
      const probe = {
        x: car.x + Math.sin(car.heading) * car.speed * dt,
        z: car.z + Math.cos(car.heading) * car.speed * dt,
      };
      const hitWall = world.resolveCircle(probe, CAR.radius);
      world.clampToGround(probe, CAR.radius);
      if (hitWall) car.speed *= 0.5;
      car.x = probe.x;
      car.z = probe.z;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      for (const wheel of car.group.userData.wheels) wheel.rotation.x += (car.speed * dt) / 0.36;
      // Flash the light bar.
      if (car.group.userData.lightBar) {
        car.group.userData.lightBar.visible = Math.floor(state.time * 6) % 2 === 0;
      }
      // Ramming the player's car damages it; ramming Rico hurts him.
      if (dist < 3.4) {
        unit.ramTimer -= dt;
        if (unit.ramTimer <= 0) {
          unit.ramTimer = 0.8;
          if (p.inCar) {
            p.inCar.health -= 12;
            fx.crash(10);
            state.shake = Math.max(state.shake, 0.5);
            if (p.inCar.health <= 0) {
              p.inCar.health = 0;
              fx.explosion(p.inCar.x, p.inCar.z);
              world.message('Your car is wrecked!');
            }
          } else if (p.invulnerable <= 0) {
            p.health -= 15;
            p.invulnerable = 0.8;
            p.hurtFlash = 0.5;
            state.shake = Math.max(state.shake, 0.6);
            fx.crash(8);
          }
        }
      }
      // Despawn a cruiser that fell far behind.
      if (dist > 240) {
        car.x = targetX + Math.sin(rng() * Math.PI * 2) * 70;
        car.z = targetZ + Math.cos(rng() * Math.PI * 2) * 70;
        car.x = Math.max(-190, Math.min(190, car.x));
        car.z = Math.max(-190, Math.min(190, car.z));
      }
    }

    // --- Foot officers: close in and hold Rico until he is busted ---
    for (const officer of state.officers) {
      const dx = p.x - officer.x;
      const dz = p.z - officer.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - officer.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      officer.heading += diff * Math.min(1, 8 * dt);
      const speed = dist > 2 ? 6.5 : 0;
      officer.x += Math.sin(officer.heading) * speed * dt;
      officer.z += Math.cos(officer.heading) * speed * dt;
      officer.phase += speed * dt * 2;
      const u = officer.group.userData;
      u.legL.rotation.x = Math.sin(officer.phase) * 0.6;
      u.legR.rotation.x = -Math.sin(officer.phase) * 0.6;
      officer.group.position.set(officer.x, 0, officer.z);
      officer.group.rotation.y = officer.heading;
      if (dist < 1.6) {
        officer.arrest += dt;
        if (officer.arrest > 1.6) {
          state.screen = SCREEN_BUSTED;
        }
      } else {
        officer.arrest = Math.max(0, officer.arrest - dt);
      }
    }
  }

  return { update, despawnAll };
}
