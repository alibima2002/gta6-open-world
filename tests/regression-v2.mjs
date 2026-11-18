// GTA6-01 v2 regression tests — one per audit fix (H1, H2, M1, M2, M3, L1).
// Usage: node tests/regression-v2.mjs <repoDir> <port>
// Serves <repoDir>/game on <port>, drives it with cached Chromium 1255 +
// SwiftShader (the same setup v1 used), prints one PASS/FAIL line per fix.
// Exit code 0 only when all six pass.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('/home/hatch/workspace/makefun/entries/gta6-v2-audit/node_modules/playwright-core'));
} catch {
  ({ chromium } = require('playwright-core'));
}

const repoDir = process.argv[2] ?? '/home/hatch/workspace/makefun/entries/gta6-01';
const port = Number(process.argv[3] ?? 8091);
const BASE = `http://localhost:${port}`;
const EXE = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await page.evaluate(fn)) return true;
    } catch { /* page still loading */ }
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}/?seed=7`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#startBtn', { timeout: 60000 });
  await sleep(5000);
  await page.click('#startBtn');
  await sleep(1500);
  return errors;
}

async function enterNearestCar(page) {
  const car = await page.evaluate(() => {
    const s = window.__game.state;
    let best = null;
    let bestD = 1e9;
    for (const c of s.cars) {
      if (!c.parked) continue;
      const d = Math.hypot(c.x - s.player.x, c.z - s.player.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best ? { x: best.x, z: best.z } : null;
  });
  if (!car) throw new Error('no parked car found');
  await page.evaluate((c) => {
    const s = window.__game.state;
    s.player.x = c.x + 2;
    s.player.z = c.z;
    s.player.heading = Math.atan2(c.x - s.player.x, c.z - s.player.z);
  }, car);
  await page.keyboard.press('e');
  await sleep(1500);
  const inCar = await page.evaluate(() => !!window.__game.state.player.inCar);
  if (!inCar) throw new Error('pressing E did not enter the car');
}

// H1: completing a mission writes the save at once; a reload restores it.
async function testH1(page) {
  await page.evaluate(() => window.__game.forceMission(0, 0));
  await page.evaluate(() => window.__game.teleport(0, 170));
  await waitFor(page, () => {
    const s = window.__game.state;
    return s.mission && s.mission.stepIndex === 1;
  }, 30000, 'mission 1 step 2');
  await page.evaluate(() => window.__game.teleport(116, 58));
  await waitFor(page, () => {
    const s = window.__game.state;
    return s.mission === null && s.missionIndex === 1;
  }, 30000, 'mission 1 complete');
  const saved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('sunshore-save-v1');
    return raw ? JSON.parse(raw) : null;
  });
  if (!saved || saved.cash !== 150 || saved.missionIndex !== 1) {
    return { pass: false, detail: `save after complete: ${JSON.stringify(saved)} (want cash 150, missionIndex 1)` };
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#continueBtn', { timeout: 60000 });
  await sleep(4000);
  await page.click('#continueBtn');
  await sleep(1500);
  const restored = await page.evaluate(() => {
    const s = window.__game.state;
    return { cash: s.cash, missionIndex: s.missionIndex, missionsDone: s.missionsDone };
  });
  const pass = restored.cash === 150 && restored.missionIndex === 1 && restored.missionsDone === 1;
  return { pass, detail: `saved=${JSON.stringify(saved)} restored=${JSON.stringify(restored)}` };
}

// H2: cruisers spawn near the CAR after a long drive (not the stale entry
// point), and far-away traffic respawns near the car too.
async function testH2(page) {
  await enterNearestCar(page);
  await page.evaluate(() => window.__game.teleport(150, -150));
  await sleep(500);
  await page.evaluate(() => window.__game.setHeat(2.5));
  await sleep(1500);
  const cruiser = await page.evaluate(() => {
    const s = window.__game.state;
    const car = s.player.inCar;
    let best = 1e9;
    for (const u of s.police) best = Math.min(best, Math.hypot(u.car.x - car.x, u.car.z - car.z));
    return { nearest: Math.round(best), count: s.police.length };
  });
  if (cruiser.nearest > 90) {
    return { pass: false, detail: `nearest cruiser ${cruiser.nearest}m from car (want <= 90m), ${cruiser.count} cruisers` };
  }
  // Traffic: shove one traffic car 300 m from the car and watch it respawn.
  const traffic = await page.evaluate(() => {
    const s = window.__game.state;
    const car = s.player.inCar;
    const t = s.cars.find((c) => c.traffic);
    if (!t) return null;
    t.x = car.x + 300;
    t.z = car.z;
    return true;
  });
  if (!traffic) return { pass: false, detail: 'no traffic car found for respawn check' };
  await sleep(2000);
  const respawn = await page.evaluate(() => {
    const s = window.__game.state;
    const car = s.player.inCar;
    const t = s.cars.find((c) => c.traffic);
    return Math.round(Math.hypot(t.x - car.x, t.z - car.z));
  });
  const pass = respawn < 160;
  return { pass, detail: `nearest cruiser ${cruiser.nearest}m from car; respawned traffic ${respawn}m from car (want < 160m)` };
}

// M1: one roll decides tracer + damage — the tracer and the damage must
// AGREE on every shot. The damage rate alone cannot show this: on v1 the
// damage roll is independent of the tracer roll, so ~half the shots disagree
// (tracer shows a hit but nothing lands, or vice versa) even though the raw
// damage rate looks right. The game records the last enemy tracer in
// state.lastEnemyTracer (test hook in combat.js); without it this test cannot
// observe the tracer and fails explicitly instead of guessing.
async function testM1(page) {
  await page.evaluate(() => {
    window.__game.forceMission(3, 1);
    const s = window.__game.state;
    s.enemies.forEach((e, i) => { if (i > 0) e.alive = false; });
    // Pin the survivor exactly 10 m from the player: after forceMission the
    // gang walks toward the spawn point, so its position is not the ring spot.
    const e = s.enemies[0];
    e.x = -87;
    e.z = 97;
    e.group.position.set(-87, 0, 97);
    s.player.x = -87;
    s.player.z = 87;
    s.player.heading = 0;
  });
  await sleep(1000);
  // The hook is set on the first enemy shot; the loop below fails explicitly
  // if it never appears.
  let agree = 0;
  let tracerHits = 0;
  let damages = 0;
  let shots = 0;
  const t0 = Date.now();
  while (shots < 40 && Date.now() - t0 < 150000) {
    await page.evaluate(() => {
      const s = window.__game.state;
      const e = s.enemies.find((x) => x.alive);
      if (e) e.shootTimer = 0.02;
      s.player.invulnerable = 0;
    });
    try {
      await waitFor(page, () => {
        const s = window.__game.state;
        const e = s.enemies.find((x) => x.alive);
        return !!e && e.shootTimer > 0.5;
      }, 3000, 'enemy shot');
    } catch {
      break; // enemy stopped shooting; count what we have
    }
    shots += 1;
    await sleep(200);
    const snap = await page.evaluate(() => {
      const s = window.__game.state;
      const t = s.lastEnemyTracer;
      return { tracerHit: t ? t.hit : null, hp: s.player.health };
    });
    if (snap.tracerHit === null) {
      return { pass: false, detail: 'no lastEnemyTracer hook: tracer not observable on this build' };
    }
    const damaged = snap.hp < 100;
    if (snap.tracerHit) tracerHits += 1;
    if (damaged) damages += 1;
    if (snap.tracerHit === damaged) agree += 1;
    if (damaged) {
      await page.evaluate(() => {
        const s = window.__game.state;
        s.player.health = 100;
        s.player.invulnerable = 0;
      });
    }
    // Park the timer high so no natural shot fires before the next force;
    // each counted shot is exactly one forced shot.
    await page.evaluate(() => {
      const s = window.__game.state;
      const e = s.enemies.find((x) => x.alive);
      if (e) e.shootTimer = 5;
    });
    await sleep(1300);
  }
  return {
    pass: shots >= 35 && agree >= 35,
    detail: `agree=${agree}/${shots} tracerHits=${tracerHits} damages=${damages} (v2: tracer and damage always agree, ~40/40; v1: independent rolls, ~20/40)`,
  };
}

// M2a: punching an officer is assaulting an officer (right message, real
// damage), and after enough punches he goes down.
async function testM2a(page) {
  // 2 stars needs heat >= 1.5 sustained: stars are heat bands, 1.5 decays
  // below the band at once, so use 2.0.
  // Stand on the sand (0,200): off the roads, so traffic and cruisers cannot
  // shove Rico into the officer mid-test.
  await page.evaluate(() => {
    const s = window.__game.state;
    s.player.x = 0;
    s.player.z = 200;
    s.player.heading = Math.PI;
    s.player.invulnerable = 999; // cruiser rams cannot kill Rico mid-test
  });
  await page.evaluate(() => window.__game.setHeat(2.0));
  await sleep(3000);
  const place = () => page.evaluate(() => {
    const s = window.__game.state;
    const p = s.player;
    p.invulnerable = 999;
    // Park every cruiser in the far corner: their rams shove Rico around
    // and can push him into (or away from) the officer mid-punch.
    s.police.forEach((u) => {
      u.car.x = 190;
      u.car.z = 190;
      u.car.speed = 0;
      u.car.group.position.set(190, 0, 190);
    });
    s.peds.forEach((pd) => { pd.x = p.x + 60; pd.z = p.z + 60; });
    s.officers.forEach((o, i) => {
      if (i === 0) {
        // 2.1 m: inside punch range (2.2 m), outside arrest range (1.6 m).
        o.x = p.x + Math.sin(p.heading) * 2.1;
        o.z = p.z + Math.cos(p.heading) * 2.1;
        o.arrest = 0;
      } else {
        o.x = p.x + 40;
        o.z = p.z + 40;
      }
      o.group.position.set(o.x, 0, o.z);
    });
    return s.officers.length;
  });
  const face = () => page.evaluate(() => {
    const s = window.__game.state;
    const p = s.player;
    const o = s.officers[0];
    p.heading = Math.atan2(o.x - p.x, o.z - p.z);
  });
  if ((await place()) < 1) return { pass: false, detail: 'no officer spawned at 2 stars' };
  await face();
  await page.keyboard.press('f');
  await sleep(900);
  const snap = await page.evaluate(() => {
    const s = window.__game.state;
    const o = s.officers[0];
    return { health: o.health, msgs: s.messageLog.map((m) => m.text), screen: s.screen };
  });
  const msgOk = snap.msgs.some((t) => /police officer/i.test(t))
    && !snap.msgs.some((t) => /punched a pedestrian|hit a pedestrian/i.test(t));
  for (let i = 0; i < 3; i += 1) {
    await place();
    await face();
    await page.keyboard.press('f');
    await sleep(900);
  }
  const down = await page.evaluate(() => {
    const o = window.__game.state.officers[0];
    return { alive: o.alive, rotX: o.group.rotation.x, y: o.group.position.y, health: o.health, screen: window.__game.state.screen };
  });
  const fell = down.alive === false && Math.abs(down.rotX + Math.PI / 2) < 0.1 && Math.abs(down.y - 0.4) < 0.1;
  return {
    pass: snap.health === 75 && msgOk && fell,
    detail: `after 1 punch health=${snap.health} (want 75) msgOk=${msgOk} screen=${snap.screen} msgs=${JSON.stringify(snap.msgs)}; after 4 punches alive=${down.alive} rotX=${down.rotX.toFixed(2)} y=${down.y} health=${down.health} screen=${down.screen}`,
  };
}

// M2b: a gang member killed by punch falls like a shot one (mesh felled,
// kill counter advances).
async function testM2b(page) {
  await page.evaluate(() => {
    window.__game.forceMission(3, 1);
    const s = window.__game.state;
    const e = s.enemies[0];
    s.player.x = e.x;
    s.player.z = e.z - 1.5;
    s.player.heading = 0;
    s.enemies.forEach((x, i) => {
      if (i > 0) { x.x = -190; x.z = -190; x.group.position.set(-190, 0, -190); }
    });
    s.peds.forEach((pd) => { pd.x += 60; pd.z += 60; });
  });
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('f');
    await sleep(1500);
    await page.evaluate(() => {
      const s = window.__game.state;
      const e = s.enemies[0];
      if (e.alive) {
        s.player.x = e.x;
        s.player.z = e.z - 1.5;
        s.player.heading = 0;
      }
    });
  }
  const res = await page.evaluate(() => {
    const s = window.__game.state;
    const e = s.enemies[0];
    return { alive: e.alive, rotX: e.group.rotation.x, y: e.group.position.y, kills: s.kills, health: e.health };
  });
  const pass = res.alive === false && Math.abs(res.rotX + Math.PI / 2) < 0.1
    && Math.abs(res.y - 0.4) < 0.1 && res.kills >= 1;
  return { pass, detail: `alive=${res.alive} rotX=${res.rotX.toFixed(2)} y=${res.y} kills=${res.kills} health=${res.health}` };
}

// M3: shooting an officer damages him; three hits put him down.
async function testM3(page) {
  await page.evaluate(() => {
    const s = window.__game.state;
    const p = s.player;
    p.x = 0;
    p.z = 90;
    p.heading = 0;
    s.camYaw = 0;
    s.camPitch = 0.08;
    p.invulnerable = 999; // cruiser rams cannot kill Rico mid-test
  });
  await page.evaluate(() => window.__game.setHeat(2.0));
  await sleep(3000);
  const hasOfficer = await page.evaluate(() => window.__game.state.officers.length > 0);
  if (!hasOfficer) return { pass: false, detail: 'no officer spawned at 2 stars' };
  let down = false;
  let clicks = 0;
  let healthSeen = null;
  for (let i = 0; i < 8 && !down; i += 1) {
    await page.evaluate(() => {
      const s = window.__game.state;
      s.player.invulnerable = 999;
      // Park every cruiser in the far corner so their rams cannot shove
      // Rico off the camera ray mid-test.
      s.police.forEach((u) => {
        u.car.x = 190;
        u.car.z = 190;
        u.car.speed = 0;
        u.car.group.position.set(190, 0, 190);
      });
      s.officers.forEach((o, j) => {
        if (j === 0) { o.x = 0; o.z = 85; o.arrest = 0; }
        else { o.x = 60; o.z = 60; }
        o.group.position.set(o.x, 0, o.z);
      });
      s.camYaw = 0;
      s.camPitch = 0.08;
    });
    await page.mouse.click(320, 180);
    clicks += 1;
    await sleep(1500);
    const snap = await page.evaluate(() => {
      const s = window.__game.state;
      const o = s.officers[0];
      return o ? { alive: o.alive, health: o.health, rotX: o.group.rotation.x, y: o.group.position.y } : null;
    });
    if (!snap) break;
    healthSeen = snap.health;
    down = snap.alive === false;
  }
  return {
    pass: down === true && typeof healthSeen === 'number',
    detail: `clicks=${clicks} officerDown=${down} lastHealth=${healthSeen} (v1: health stays undefined, never falls)`,
  };
}

// L1: with every lot car already stolen, mission 2 still finds a marked car.
async function testL1(page) {
  await page.evaluate(() => {
    const s = window.__game.state;
    // Clear EVERY parked car: startStep searches all parked cars, not just
    // the lot, so leaving one kerb car would mask the soft-lock.
    for (const car of s.cars) if (car.parked) car.parked = false;
  });
  await page.evaluate(() => window.__game.forceMission(1, 0));
  await sleep(1500);
  const res = await page.evaluate(() => {
    const s = window.__game.state;
    const marked = s.cars.filter((c) => c.group.userData.marked);
    return {
      marker: s.marker,
      marked: marked.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), parked: c.parked })),
    };
  });
  const ok = res.marker !== null && res.marked.length >= 1
    && Math.hypot(res.marked[0].x - 87, res.marked[0].z + 87) < 15;
  if (!ok) return { pass: false, detail: `marker=${JSON.stringify(res.marker)} marked=${JSON.stringify(res.marked)}` };
  // And the step can actually advance: get in the marked car.
  await page.evaluate(() => {
    const s = window.__game.state;
    const c = s.cars.find((x) => x.group.userData.marked);
    s.player.x = c.x + 2;
    s.player.z = c.z;
    s.player.heading = Math.atan2(c.x - s.player.x, c.z - s.player.z);
  });
  await page.keyboard.press('e');
  await sleep(1500);
  const inMarked = await page.evaluate(() => {
    const s = window.__game.state;
    return s.player.inCar && s.player.inCar.group.userData.marked === true;
  });
  return { pass: inMarked === true, detail: `marker=${JSON.stringify(res.marker)} marked=${JSON.stringify(res.marked)} enteredMarkedCar=${inMarked}` };
}

const TESTS = [
  ['H1 save-on-mission-complete', testH1],
  ['H2 pursuit uses car position', testH2],
  ['M1 single-roll hit chance', testM1],
  ['M2a punch officer', testM2a],
  ['M2b punch-kill falls', testM2b],
  ['M3 shoot officer', testM3],
  ['L1 mission-2 empty lot', testL1],
];

async function main() {
  const filter = process.argv[4] ?? '';
  const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: repoDir, stdio: 'ignore' });
  try {
    // Wait for the server to answer.
    for (let i = 0; i < 30; i += 1) {
      try {
        const r = await fetch(`${BASE}/`);
        if (r.ok) break;
      } catch { /* not up yet */ }
      await sleep(500);
    }
    const browser = await chromium.launch({
      executablePath: EXE,
      args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const results = [];
    try {
      for (const [name, fn] of TESTS) {
        if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
        const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
        const page = await ctx.newPage();
        try {
          const errors = await boot(page);
          const r = await fn(page);
          const errNote = errors.length ? ` [page errors: ${errors.slice(0, 2).join(' | ')}]` : '';
          console.log(`${r.pass ? 'PASS' : 'FAIL'} ${name} — ${r.detail}${errNote}`);
          results.push({ name, pass: r.pass && errors.length === 0 });
        } catch (e) {
          console.log(`FAIL ${name} — ERROR ${e.message}`);
          results.push({ name, pass: false });
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await browser.close();
    }
    const passed = results.filter((r) => r.pass).length;
    console.log(`REGRESSION ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    server.kill();
  }
}

main();
