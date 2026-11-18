// Combat: the pistol (click to shoot, R to reload, muzzle flash and tracers),
// punching is in player.js, and the rival gang members who shoot back.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { playerPos } from './playerPos.js';

const ENEMY_SHOOT_RANGE = 42;

function createEnemyMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), jacket);
  cap.position.y = 1.9;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.geometry.translate(0, -0.39, 0);
  legL.position.set(-0.17, 0.78, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  // A dark pistol in the right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111214 }));
  gun.position.set(0.42, 1.1, 0.3);
  group.add(gun);
  group.userData = { legL, legR };
  return group;
}

export function createCombat(state, scene, world, fx, audio) {
  const raycaster = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);

  function spawnEnemy(x, z) {
    const mesh = createEnemyMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const enemy = {
      group: mesh, x, z, heading: 0,
      health: COMBAT.enemyHealth, alive: true,
      shootTimer: 1 + Math.random() * 1.5,
      phase: Math.random() * 6,
    };
    tagActor(mesh, { kind: 'enemy', enemy });
    state.enemies.push(enemy);
    return enemy;
  }

  function clearEnemies() {
    for (const e of state.enemies) scene.remove(e.group);
    state.enemies = [];
  }

  // Raycast from the camera through the crosshair; returns the first hit.
  function shootFrom(camera) {
    const p = state.player;
    if (p.inCar || p.reloading > 0 || p.shootCooldown > 0) return;
    if (p.ammo <= 0) {
      audio.fail();
      world.message('Out of ammo — press R to reload.');
      p.shootCooldown = 0.3;
      return;
    }
    p.ammo -= 1;
    p.shootCooldown = 0.25;
    audio.gunshot();
    world.addHeat(0.15);
    const muzzlePos = { x: p.x, y: p.y + 1.4, z: p.z };
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    fx.muzzle(muzzlePos, { x: dir.x, y: 0, z: dir.z });
    raycaster.setFromCamera(centre, camera);
    raycaster.far = 120;
    const targets = [];
    for (const e of state.enemies) if (e.alive) targets.push(e.group);
    for (const o of state.officers) if (o.alive) targets.push(o.group);
    for (const ped of state.peds) targets.push(ped.group);
    for (const car of state.cars) targets.push(car.group);
    if (state.shootables) targets.push(...state.shootables);
    const hits = raycaster.intersectObjects(targets, true);
    let end = new THREE.Vector3().copy(camera.position).addScaledVector(dir, 120);
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      // Walk up to the actor group: enemies, officers, peds and cars carry a back-ref.
      let actor = hit.object;
      while (actor && actor.parent && !actor.userData.actorRef) actor = actor.parent;
      const ref = actor ? actor.userData.actorRef : null;
      if (ref && ref.kind === 'enemy' && ref.enemy.alive) {
        ref.enemy.health -= COMBAT.pistolDamage;
        fx.blood(ref.enemy.x, 1.3, ref.enemy.z);
        world.addHeat(0.6);
        if (ref.enemy.health <= 0) {
          ref.enemy.alive = false;
          ref.enemy.group.rotation.x = -Math.PI / 2;
          ref.enemy.group.position.y = 0.4;
          state.kills += 1;
          world.addHeat(1.2);
          world.message('Gang member down.');
        }
      } else if (ref && ref.kind === 'officer') {
        // Officers are damageable: each hit hurts, and enough hits put one down.
        const officer = ref.officer;
        if (officer.alive) {
          officer.health -= COMBAT.pistolDamage;
          fx.blood(officer.x, 1.3, officer.z);
          world.addHeat(1.5);
          if (officer.health <= 0) {
            officer.alive = false;
            officer.group.rotation.x = -Math.PI / 2;
            officer.group.position.y = 0.4;
            world.addHeat(1.5);
            world.message('Officer down! Every unit in the city is coming.');
          } else {
            world.message('You shot a cop! Every unit in the city is coming.');
          }
        }
      } else if (ref && ref.kind === 'ped') {
        ref.ped.panic = 6;
        ref.ped.state = 'flee';
        world.addHeat(0.8);
        world.message('You shot a pedestrian!');
      } else if (ref && ref.kind === 'car') {
        ref.car.health -= COMBAT.pistolDamage;
        fx.sparks(end.x, end.y, end.z);
        if (ref.car.health <= 0 && ref.car.driver !== 'player') {
          fx.explosion(ref.car.x, ref.car.z);
          ref.car.health = 0;
        }
      } else {
        fx.sparks(end.x, end.y, end.z);
      }
    }
    fx.tracer(muzzlePos, { x: end.x, y: end.y, z: end.z });
    // Nearby pedestrians flee the gunshot.
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - p.x, ped.z - p.z) < 25) {
        ped.panic = 5;
        ped.state = 'flee';
      }
    }
  }

  function reload() {
    const p = state.player;
    if (p.reloading > 0 || p.ammo === COMBAT.pistolAmmo) return;
    p.reloading = COMBAT.reloadTime;
    audio.click();
  }

  function update(dt, camera) {
    const p = state.player;
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        p.ammo = COMBAT.pistolAmmo;
        p.reloading = 0;
        world.message('Reloaded.');
      }
    }
    // Gang members: close in to range, shoot with poor aim, fall when dead.
    for (const e of state.enemies) {
      if (!e.alive) continue;
      // Aim at where Rico actually is — the car while driving.
      const pos = playerPos(state);
      const dx = pos.x - e.x;
      const dz = pos.z - e.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - e.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.heading += diff * Math.min(1, 6 * dt);
      if (dist > 14) {
        e.x += Math.sin(e.heading) * 4.2 * dt;
        e.z += Math.cos(e.heading) * 4.2 * dt;
        e.phase += 8 * dt;
        const u = e.group.userData;
        u.legL.rotation.x = Math.sin(e.phase) * 0.55;
        u.legR.rotation.x = -Math.sin(e.phase) * 0.55;
      } else {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && dist < ENEMY_SHOOT_RANGE) {
          e.shootTimer = 1.2 + Math.random() * 1.2;
          audio.gunshot();
          const from = { x: e.x, y: 1.3, z: e.z };
          // Poor aim: the further away, the more likely to miss.
          const hitChance = Math.max(0.12, 0.55 - dist * 0.01);
          // One roll decides both the tracer and the damage: a tracer that
          // shows a hit must hurt, and a miss must not.
          const hit = Math.random() < hitChance;
          const to = hit
            ? { x: pos.x, y: p.y + 1.2, z: pos.z }
            : { x: pos.x + (Math.random() - 0.5) * 4, y: p.y + 1.2, z: pos.z + (Math.random() - 0.5) * 4 };
          fx.tracer(from, to);
          // Test hook (M1): the last enemy tracer, so a playtest can check
          // the tracer and the damage agree. Read by tests only, never by
          // the game itself.
          state.lastEnemyTracer = { hit, x: to.x, y: to.y, z: to.z };
          fx.muzzle(from, { x: Math.sin(e.heading), y: 0, z: Math.cos(e.heading) });
          if (hit && p.invulnerable <= 0 && !p.inCar) {
            p.health -= 8;
            p.invulnerable = 0.4;
            p.hurtFlash = 0.4;
            state.shake = Math.max(state.shake, 0.4);
          } else if (hit && p.inCar) {
            p.inCar.health -= 6;
          }
        }
      }
      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = e.heading;
    }
  }

  return { update, shootFrom, reload, spawnEnemy, clearEnemies };
}

// Tag an actor group's root so a raycast hit can find its owner.
export function tagActor(group, ref) {
  group.userData.actorRef = ref;
}
