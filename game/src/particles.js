// Effects: dust, blood and explosion particles (one THREE.Points cloud), bullet
// tracers, muzzle flash, and skid marks. All of it is pooled and allocation-free
// after boot, and every call is safe to make from any other module.
import * as THREE from 'three';

const MAX_PARTICLES = 600;
const MAX_TRACERS = 10;

export function createFx(state, scene, audio) {
  // --- Particle cloud ---
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colours = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ alive: false, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1 });
  }
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life;
    p.r = r; p.g = g; p.b = b;
  }

  // --- Tracers: one line each, reused ---
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  // --- Muzzle flash: a small additive sprite and a point light, reused ---
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffc860, 0, 12);
  scene.add(flashLight);
  let flashLife = 0;

  // --- Skid marks: instanced dark quads laid from the car's trail ---
  const skidGeo = new THREE.PlaneGeometry(0.35, 1.6);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.55, depthWrite: false });
  const skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, 220);
  skidMesh.count = 0;
  skidMesh.frustumCulled = false;
  scene.add(skidMesh);
  const dummy = new THREE.Object3D();
  let lastSkidCount = -1;

  function updateSkids() {
    if (state.skidMarks.length === lastSkidCount) return;
    lastSkidCount = state.skidMarks.length;
    const n = Math.min(state.skidMarks.length, 220);
    skidMesh.count = n;
    for (let i = 0; i < n; i += 1) {
      const m = state.skidMarks[state.skidMarks.length - n + i];
      dummy.position.set(m.x, 0.02, m.z);
      dummy.rotation.set(0, m.heading, 0);
      dummy.updateMatrix();
      skidMesh.setMatrixAt(i, dummy.matrix);
    }
    skidMesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = parts[i];
      if (!p.alive) {
        positions[i * 3 + 1] = -50;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        positions[i * 3 + 1] = -50;
        continue;
      }
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy = 0;
      }
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const fade = p.life / p.maxLife;
      colours[i * 3] = p.r * fade;
      colours[i * 3 + 1] = p.g * fade;
      colours[i * 3 + 2] = p.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.12);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashMat.opacity = Math.max(0, flashLife / 0.06);
      flashLight.intensity = Math.max(0, flashLife / 0.06) * 30;
      if (flashLife <= 0) {
        flash.visible = false;
        flashLight.intensity = 0;
      }
    }
    updateSkids();
  }

  return {
    update,
    dust(x, z, n = 4) {
      for (let i = 0; i < n; i += 1) {
        spawn(x + (Math.random() - 0.5) * 0.8, 0.15, z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 2, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 2,
          0.5 + Math.random() * 0.4, 0.75, 0.7, 0.6);
      }
    },
    blood(x, y, z) {
      for (let i = 0; i < 10; i += 1) {
        spawn(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4,
          0.5, 0.7, 0.05, 0.05);
      }
    },
    sparks(x, y, z) {
      for (let i = 0; i < 8; i += 1) {
        spawn(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6,
          0.3, 1, 0.8, 0.3);
      }
    },
    explosion(x, z) {
      for (let i = 0; i < 40; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 8;
        spawn(x, 0.6, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s,
          0.7 + Math.random() * 0.5, 1, 0.5 + Math.random() * 0.3, 0.1);
      }
      state.shake = Math.max(state.shake, 1);
      audio.crash();
    },
    tracer(from, to) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 1;
      t.life = 0.12;
    },
    muzzle(pos, dir) {
      flash.position.set(pos.x + dir.x * 0.8, pos.y, pos.z + dir.z * 0.8);
      flash.lookAt(pos.x + dir.x * 2, pos.y, pos.z + dir.z * 2);
      flash.visible = true;
      flashMat.opacity = 1;
      flashLight.position.set(pos.x, pos.y + 0.5, pos.z);
      flashLight.intensity = 30;
      flashLife = 0.06;
    },
    crash(speed) {
      audio.crash();
      state.shake = Math.max(state.shake, Math.min(0.9, speed / 30));
    },
    startSiren() {
      audio.startSiren();
    },
    stopSiren() {
      audio.stopSiren();
    },
    punch() {
      audio.punch();
    },
    sirenBlip() {
      audio.sirenBlip();
    },
  };
}
