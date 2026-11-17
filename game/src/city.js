// Sunshore City: the procedural coastal grid. One ground texture carries the roads,
// sidewalks, crosswalks, beach and parks; buildings, palms, streetlights, hydrants
// and billboards are instanced meshes; the causeway and lighthouse island sit south.
import * as THREE from 'three';
import { BILLBOARDS, CITY, COLOURS } from './config.js';
import { chance, pick, range } from './random.js';

const PX = 1024; // ground texture pixels across 400 m
const WORLD = 400; // ground plane spans -200..200

function toPx(world) {
  return ((world + WORLD / 2) / WORLD) * PX;
}

// The ground texture: sidewalks, asphalt roads with dashed centrelines, crosswalks,
// beach sand at the south edge, plus the park, plaza and parking-lot blocks.
function makeGroundTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = PX;
  const g = canvas.getContext('2d');
  g.fillStyle = '#a89f92'; // sidewalk concrete
  g.fillRect(0, 0, PX, PX);

  // Block interiors: slightly varied concrete.
  const { roadPos } = CITY;
  for (let kx = 0; kx < roadPos.length - 1; kx += 1) {
    for (let kz = 0; kz < roadPos.length - 1; kz += 1) {
      const x0 = roadPos[kx] + CITY.roadHalf;
      const z0 = roadPos[kz] + CITY.roadHalf;
      const w = roadPos[kx + 1] - roadPos[kx] - 2 * CITY.roadHalf;
      const shade = 150 + Math.floor(rng() * 30);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 14})`;
      g.fillRect(toPx(x0), toPx(z0), toPx(x0 + w) - toPx(x0), toPx(z0 + w) - toPx(z0));
    }
  }
  // Park block (kx=1,kz=1) and plaza block (kx=3,kz=3): grass and pale stone.
  const park = { x: roadPos[1] + CITY.roadHalf, z: roadPos[1] + CITY.roadHalf, w: 44 };
  g.fillStyle = '#5da24a';
  g.fillRect(toPx(park.x), toPx(park.z), toPx(park.x + park.w) - toPx(park.x), toPx(park.z + park.w) - toPx(park.z));
  const plaza = { x: roadPos[3] + CITY.roadHalf, z: roadPos[3] + CITY.roadHalf, w: 44 };
  g.fillStyle = '#c9bfae';
  g.fillRect(toPx(plaza.x), toPx(plaza.z), toPx(plaza.x + plaza.w) - toPx(plaza.x), toPx(plaza.z + plaza.w) - toPx(plaza.z));
  // Parking-lot block (kx=4,kz=1) and turf lot (kx=1,kz=4): asphalt.
  for (const lot of [{ x: roadPos[4] + CITY.roadHalf, z: roadPos[1] + CITY.roadHalf }, { x: roadPos[1] + CITY.roadHalf, z: roadPos[4] + CITY.roadHalf }]) {
    g.fillStyle = '#3a3d44';
    g.fillRect(toPx(lot.x), toPx(lot.z), toPx(lot.x + 44) - toPx(lot.x), toPx(lot.z + 44) - toPx(lot.z));
  }

  // Roads: asphalt strips both ways.
  g.fillStyle = '#2e3138';
  for (const p of roadPos) {
    g.fillRect(toPx(p - CITY.roadHalf), 0, toPx(p + CITY.roadHalf) - toPx(p - CITY.roadHalf), PX);
    g.fillRect(0, toPx(p - CITY.roadHalf), PX, toPx(p + CITY.roadHalf) - toPx(p - CITY.roadHalf));
  }
  // Dashed yellow centrelines.
  g.fillStyle = '#d8b93a';
  for (const p of roadPos) {
    for (let d = -200; d < 200; d += 12) {
      g.fillRect(toPx(p) - 1, toPx(d), 2, toPx(d + 6) - toPx(d));
      g.fillRect(toPx(d), toPx(p) - 1, toPx(d + 6) - toPx(d), 2);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,235,0.85)';
  for (const px of roadPos) {
    for (const pz of roadPos) {
      for (let i = -3; i < 4; i += 1) {
        g.fillRect(toPx(px + i * 1.8) - 1, toPx(pz - CITY.roadHalf) + 2, 2, 8);
        g.fillRect(toPx(px + i * 1.8) - 1, toPx(pz + CITY.roadHalf) - 10, 2, 8);
        g.fillRect(toPx(px - CITY.roadHalf) + 2, toPx(pz + i * 1.8) - 1, 8, 2);
        g.fillRect(toPx(px + CITY.roadHalf) - 10, toPx(pz + i * 1.8) - 1, 8, 2);
      }
    }
  }
  // Beach: sand from the last street to the water.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(CITY.beachZ), PX, PX - toPx(CITY.beachZ));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i += 1) {
    g.fillRect(rng() * PX, toPx(CITY.beachZ) + rng() * (PX - toPx(CITY.beachZ)), 8, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Windows: a lit-window grid painted once, shared by every building.
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8d929e';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : '#2c3542';
      g.fillRect(x, y, 10, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture(ad) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = ad.bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = ad.fg;
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(ad.brand, 128, 56);
  g.font = '20px system-ui, sans-serif';
  g.fillText(ad.line, 128, 92);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, world, rng) {
  const { state } = world;
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();

  // --- Lights and sky ---
  scene.background = new THREE.Color(COLOURS.sky);
  scene.fog = new THREE.Fog(COLOURS.fog, 140, 560);
  const sun = new THREE.DirectionalLight(COLOURS.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.9));

  // --- Ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Water (south) ---
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 260),
    new THREE.MeshPhongMaterial({ color: COLOURS.water, shininess: 120, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, 200 + 130); // starts at the ground plane's edge, no gap
  scene.add(water);

  // --- Buildings (instanced boxes, one per sublot) ---
  const windowTex = makeWindowTexture();
  const buildingMat = new THREE.MeshLambertMaterial({ map: windowTex, emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 0.25 });
  const placements = [];
  const palette = [0xd8cfc0, 0xb9c4cc, 0xc9a689, 0xa8b8a0, 0xd0b8c8, 0x9fb4c8];
  const { roadPos } = CITY;
  for (let kx = 0; kx < roadPos.length - 1; kx += 1) {
    for (let kz = 0; kz < roadPos.length - 1; kz += 1) {
      // Special blocks stay open: park, plaza, parking lot, turf lot.
      if ((kx === 1 && kz === 1) || (kx === 3 && kz === 3) || (kx === 4 && kz === 1) || (kx === 1 && kz === 4)) continue;
      const bx = roadPos[kx] + CITY.roadHalf;
      const bz = roadPos[kz] + CITY.roadHalf;
      const downtown = Math.abs(bx + 22) < 70 && Math.abs(bz + 22) < 70;
      for (let sx = 0; sx < 2; sx += 1) {
        for (let sz = 0; sz < 2; sz += 1) {
          if (chance(rng, 0.22)) continue; // empty sublot: courtyard or garden
          const w = range(rng, 11, 18);
          const d = range(rng, 11, 18);
          const h = downtown ? range(rng, 16, 46) : range(rng, 7, 20);
          const cx = bx + 11 + sx * 22 + range(rng, -2, 2);
          const cz = bz + 11 + sz * 22 + range(rng, -2, 2);
          placements.push({ x: cx, z: cz, w, d, h, color: pick(rng, palette) });
          state.buildings.push({ x: cx, z: cz, w, d, h });
          world.addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
        }
      }
    }
  }
  const buildingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMat, placements.length);
  placements.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildingMesh.setMatrixAt(i, dummy.matrix);
    buildingMesh.setColorAt(i, colour.setHex(b.color));
  });
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  scene.add(buildingMesh);

  // --- Palms: instanced trunks and crowns, along sidewalks, the park and the beach ---
  const palmSpots = [];
  for (const p of roadPos) {
    for (let d = -190; d < 190; d += 29) {
      if (chance(rng, 0.55)) palmSpots.push({ x: p + 9.5, z: d });
      if (chance(rng, 0.55)) palmSpots.push({ x: d, z: p + 9.5 });
    }
  }
  for (let i = 0; i < 26; i += 1) palmSpots.push({ x: range(rng, -108, -64), z: range(rng, -108, -64) }); // park
  for (let i = 0; i < 18; i += 1) palmSpots.push({ x: range(rng, -190, 190), z: range(rng, 194, 206) }); // beach
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.26, 5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b4a }),
    palmSpots.length,
  );
  const crownMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.6, 2.2, 7),
    new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    palmSpots.length,
  );
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 2.5, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 5.6, p.z);
    dummy.scale.set(1, 0.7, 1);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(i, dummy.matrix);
  });
  trunkMesh.castShadow = true;
  crownMesh.castShadow = true;
  scene.add(trunkMesh);
  scene.add(crownMesh);

  // --- Streetlights along the roads ---
  const lightSpots = [];
  for (const p of roadPos) {
    for (let d = -180; d < 180; d += 58) {
      lightSpots.push({ x: p + 8.2, z: d });
      lightSpots.push({ x: d, z: p - 8.2 });
    }
  }
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
    lightSpots.length,
  );
  const headMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xfff2a0, emissiveIntensity: 0.7 }),
    lightSpots.length,
  );
  lightSpots.forEach((p, i) => {
    dummy.position.set(p.x, 3, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 6, p.z);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poleMesh);
  scene.add(headMesh);

  // --- Hydrants ---
  const hydrantSpots = [];
  for (let i = 0; i < 36; i += 1) {
    const p = pick(rng, roadPos);
    hydrantSpots.push({ x: p + 8.6, z: range(rng, -180, 180) });
  }
  const hydrantMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.8, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }),
    hydrantSpots.length,
  );
  hydrantSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0.4, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    hydrantMesh.setMatrixAt(i, dummy.matrix);
    world.addCollider(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3);
  });
  scene.add(hydrantMesh);

  // --- Billboards with our own fictional ads ---
  const billboardSpots = [
    { x: -116, z: -40, ry: Math.PI / 2, h: 12 },
    { x: 58, z: 100, ry: 0, h: 14 },
    { x: -40, z: 116, ry: Math.PI / 2, h: 11 },
    { x: 140, z: -58, ry: 0, h: 13 },
    { x: -174, z: 140, ry: Math.PI / 2, h: 12 },
  ];
  billboardSpots.forEach((spot, i) => {
    const ad = BILLBOARDS[i % BILLBOARDS.length];
    const group = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(12, 6, 0.6),
      new THREE.MeshLambertMaterial({ map: makeBillboardTexture(ad) }),
    );
    board.position.y = spot.h;
    board.castShadow = true;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, spot.h, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x555a60 }),
    );
    post.position.y = spot.h / 2;
    group.add(board);
    group.add(post);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.ry;
    scene.add(group);
    world.addCollider(spot.x - 0.5, spot.x + 0.5, spot.z - 0.5, spot.z + 0.5);
  });

  // --- Plaza fountain ---
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.6, 1.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x7fb2d9 }),
  );
  fountain.position.set(29, 0.55, 29);
  fountain.castShadow = true;
  scene.add(fountain);
  world.addCollider(24, 34, 24, 34);

  // --- Causeway over the water and the lighthouse island ---
  const causeway = new THREE.Mesh(
    new THREE.BoxGeometry(CITY.causewayHalf * 2, 1.2, 100),
    new THREE.MeshLambertMaterial({ color: 0x8f8a80 }),
  );
  causeway.position.set(0, 0.6, 245);
  causeway.receiveShadow = true;
  scene.add(causeway);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1, 100),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
    );
    rail.position.set(side * (CITY.causewayHalf - 0.4), 1.6, 245);
    scene.add(rail);
  }
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(CITY.islandR, CITY.islandR + 4, 2.4, 24),
    new THREE.MeshLambertMaterial({ color: COLOURS.sand }),
  );
  island.position.set(0, 1.2, CITY.islandZ);
  scene.add(island);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2 }),
  );
  tower.position.set(0, 10, CITY.islandZ);
  tower.castShadow = true;
  scene.add(tower);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffd34d, emissiveIntensity: 1.4 }),
  );
  lamp.position.set(0, 19, CITY.islandZ);
  scene.add(lamp);

  // --- Parking-lot spawn points (parked cars the player can steal) ---
  const lotX = roadPos[4] + CITY.roadHalf;
  const lotZ = roadPos[1] + CITY.roadHalf;
  for (let i = 0; i < 6; i += 1) {
    state.spawnPoints.push({ x: lotX + 8 + (i % 3) * 12, z: lotZ + 10 + Math.floor(i / 3) * 14, heading: Math.PI / 2 });
  }
  // A few more parked along the kerb.
  state.spawnPoints.push({ x: -49, z: 20, heading: 0 });
  state.spawnPoints.push({ x: 67, z: -49, heading: Math.PI });
  state.spawnPoints.push({ x: 9, z: 125, heading: Math.PI / 2 });

  state.roadLines = [...roadPos];
  // Raycast targets for shooting: the buildings and the ground.
  state.shootables = [buildingMesh, ground];

  return {
    // Gentle water shimmer: the water plane breathes so the sea is not a flat card.
    update(dt) {
      water.position.y = 0.06 + Math.sin(state.time * 0.7) * 0.05;
      lamp.material.emissiveIntensity = 1.1 + Math.sin(state.time * 2.4) * 0.5;
    },
  };
}
