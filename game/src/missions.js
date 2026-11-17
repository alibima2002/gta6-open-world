// Missions: a five-job story arc for Rico Vega. Each mission is a list of steps
// (go somewhere, steal a marked car, escape a tail, win a shootout); the beacon,
// the HUD arrow and the minimap all point at the current target.
import * as THREE from 'three';

// Mission start points and targets, on the city grid.
export const MISSION_DEFS = [
  {
    id: 1, title: 'First Fare', reward: 150,
    start: { x: 0, z: 170 },
    brief: 'Mama Delia needs a fare picked up at Pier 9 and dropped at the marina hotel.',
    steps: [
      { type: 'goto', x: 0, z: 170, radius: 6, label: 'Pick up the fare at Pier 9', hint: 'Drive or walk to the yellow marker.' },
      { type: 'goto', x: 116, z: 58, radius: 6, label: 'Drop the fare at the marina hotel', hint: 'The fare is counting on you.' },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', reward: 300,
    start: { x: 87, z: -87 },
    brief: 'A customer wants a very specific coupe from the lot on 5th. Take it. Quietly is optional.',
    steps: [
      { type: 'steal', label: 'Steal the marked coupe from the lot', hint: 'Press E next to the marked car.' },
      { type: 'deliver', x: -174, z: 116, radius: 7, label: 'Deliver the coupe to the garage', hint: 'Don’t scratch it. Much.' },
    ],
  },
  {
    id: 3, title: 'Tail Spin', reward: 400,
    start: { x: 0, z: 0 },
    brief: 'The cops made you. Lose the tail — get to the lighthouse island or stay clean until they give up.',
    steps: [
      { type: 'escape', x: 0, z: 292, radius: 10, seconds: 90, label: 'Escape to the lighthouse island', hint: 'Three stars on you. Drive!' },
    ],
  },
  {
    id: 4, title: 'Turf War', reward: 600,
    start: { x: -58, z: 58 },
    brief: 'The Coral Kings are moving on Delia’s turf. Clear them out of the old lot.',
    steps: [
      { type: 'goto', x: -87, z: 87, radius: 8, label: 'Get to the old lot', hint: 'Bring the pistol. Click to shoot.' },
      { type: 'kill', count: 5, label: 'Clear out the Coral Kings (0/5)', hint: 'Click to shoot, R to reload.' },
    ],
  },
  {
    id: 5, title: 'The Big Score', reward: 1500,
    start: { x: 29, z: 29 },
    brief: 'One last job: the Sunshore Trust bank. Grab the cash, then vanish to the island.',
    steps: [
      { type: 'goto', x: 58, z: -58, radius: 7, label: 'Get to the Sunshore Trust bank', hint: 'Park out front and walk in.' },
      { type: 'grab', x: 58, z: -58, radius: 4, label: 'Grab the cash', hint: 'Walk into the marker.' },
      { type: 'escape', x: 0, z: 292, radius: 10, seconds: 120, label: 'Escape to the lighthouse island', hint: 'Four stars. Lose them or reach the island.' },
    ],
  },
];

function createBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 17;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  const light = new THREE.PointLight(0xffd34d, 12, 42);
  light.position.y = 4;
  group.add(light);
  group.visible = false;
  scene.add(group);
  return group;
}

export function createMissions(state, scene, world, fx, combat, audio) {
  const beacon = createBeacon(scene);
  let targetCar = null;

  function playerPos() {
    const p = state.player;
    return p.inCar ? { x: p.inCar.x, z: p.inCar.z } : { x: p.x, z: p.z };
  }

  function setMarker(x, z, label) {
    state.marker = { x, z, label };
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }

  function clearMarker() {
    state.marker = null;
    beacon.visible = false;
  }

  function currentDef() {
    return MISSION_DEFS[state.missionIndex] ?? null;
  }

  function startStep(step) {
    const m = state.mission;
    m.step = step;
    m.timer = step.seconds ?? 0;
    if (step.type === 'escape') {
      // The tail is already on you when the escape starts.
      world.addHeat(2.5);
      world.message('The police are on you — lose them!');
    }
    if (step.type === 'steal') {
      // The marked coupe: the parked car nearest the lot's centre.
      let best = null;
      let bestD = 1e9;
      for (const car of state.cars) {
        if (!car.parked) continue;
        const d = Math.hypot(car.x - 87, car.z + 87);
        if (d < bestD) {
          best = car;
          bestD = d;
        }
      }
      targetCar = best;
      if (targetCar) {
        targetCar.group.userData.marked = true;
        setMarker(targetCar.x, targetCar.z, step.label);
      }
    } else if (step.type === 'kill') {
      combat.clearEnemies();
      const cx = -87;
      const cz = 87;
      for (let i = 0; i < step.count; i += 1) {
        const a = (i / step.count) * Math.PI * 2;
        combat.spawnEnemy(cx + Math.sin(a) * 10, cz + Math.cos(a) * 10);
      }
      setMarker(cx, cz, step.label);
    } else if (step.x !== undefined) {
      setMarker(step.x, step.z, step.label);
    }
    world.message(step.label);
  }

  function startMission(index) {
    const def = MISSION_DEFS[index];
    if (!def) return false;
    state.mission = { def, stepIndex: 0, step: null, timer: 0 };
    world.showBanner(`Mission ${def.id}: ${def.title}`, def.brief);
    world.message(def.brief);
    audio.chime();
    startStep(def.steps[0]);
    return true;
  }

  function completeMission() {
    const m = state.mission;
    const reward = m.def.reward;
    state.cash += reward;
    state.missionsDone += 1;
    state.missionIndex += 1;
    state.mission = null;
    targetCar = null;
    clearMarker();
    combat.clearEnemies();
    world.showBanner('Mission Complete', `+$${reward}  ·  ${m.def.title}`);
    world.message(`Mission complete! +$${reward}`);
    audio.chime();
    fx.dust(state.player.x, state.player.z, 12);
  }

  function failMission(reason) {
    const m = state.mission;
    state.mission = null;
    targetCar = null;
    clearMarker();
    combat.clearEnemies();
    world.showBanner('Mission Failed', reason);
    world.message(`Mission failed: ${reason}`);
    audio.fail();
  }

  function advanceStep() {
    const m = state.mission;
    m.stepIndex += 1;
    if (m.stepIndex >= m.def.steps.length) {
      completeMission();
    } else {
      audio.pickup();
      startStep(m.def.steps[m.stepIndex]);
    }
  }

  // The start marker: stand in it to begin the next mission.
  function startMarkerPos() {
    const def = currentDef();
    if (!def) return null;
    return def.start;
  }

  function update(dt) {
    const m = state.mission;
    const pos = playerPos();
    if (!m) {
      // Free roam: show the next mission's start marker.
      const def = currentDef();
      if (def) {
        const sx = def.start.x;
        const sz = def.start.z;
        setMarker(sx, sz, `Start mission: ${def.title}`);
        if (Math.hypot(pos.x - sx, pos.z - sz) < 6) {
          clearMarker();
          startMission(state.missionIndex);
        }
      } else if (state.marker) {
        clearMarker();
      }
      return;
    }

    const step = m.step;
    // The beacon follows a moving target car.
    if (step.type === 'steal' && targetCar) {
      beacon.position.set(targetCar.x, 0, targetCar.z);
      state.marker = { x: targetCar.x, z: targetCar.z, label: step.label };
    }

    if (step.type === 'goto' || step.type === 'deliver' || step.type === 'grab') {
      const tx = step.x;
      const tz = step.z;
      const d = Math.hypot(pos.x - tx, pos.z - tz);
      if (step.type === 'deliver') {
        if (state.player.inCar === targetCar && d < step.radius) advanceStep();
        else if (d < step.radius && !state.player.inCar) world.message('You need the coupe for this delivery.');
      } else if (d < step.radius) {
        if (step.type === 'grab') {
          world.addHeat(2.5);
          world.message('You grabbed the cash! The whole city is after you now.');
          audio.chime();
        }
        advanceStep();
      }
    } else if (step.type === 'steal') {
      if (targetCar && state.player.inCar === targetCar) {
        world.message('You stole the coupe. Now deliver it.');
        advanceStep();
      }
    } else if (step.type === 'escape') {
      m.timer -= dt;
      const d = Math.hypot(pos.x - step.x, pos.z - step.z);
      if (d < step.radius) {
        world.message('You lost them. The island is yours.');
        advanceStep();
      } else if (state.stars === 0) {
        world.message('The heat died down. You slipped away.');
        advanceStep();
      } else if (m.timer <= 0) {
        failMission('The police boxed you in.');
      }
    } else if (step.type === 'kill') {
      const alive = state.enemies.filter((e) => e.alive).length;
      const done = step.count - alive;
      m.step = { ...step, label: `Clear out the Coral Kings (${done}/${step.count})` };
      if (state.marker) state.marker.label = m.step.label;
      if (alive === 0) advanceStep();
    }

    // Pulse the beacon.
    if (beacon.visible) {
      const s = 1 + Math.sin(state.time * 3) * 0.12;
      beacon.scale.set(s, 1, s);
    }
  }

  return {
    update,
    startMission,
    failMission,
    currentDef,
    // Test / staging hook: jump straight into a mission step.
    forceStart(index, stepIndex = 0) {
      startMission(index);
      const m = state.mission;
      if (!m) return;
      while (m.stepIndex < stepIndex) {
        m.stepIndex += 1;
        if (m.stepIndex >= m.def.steps.length) break;
        startStep(m.def.steps[m.stepIndex]);
      }
    },
  };
}
