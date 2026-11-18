// GTA6-01 full playtest — reconstructs the v1 35-check Playwright suite from
// RESULT.md (the v1 script itself is not in the workspace). Same setup v1 used:
// `node serve.ts` + cached Chromium 1255 + SwiftShader.
// Usage: node tests/full-v2.mjs <repoDir> <port>
// Prints one line per check plus a summary; exit 0 only when all pass.
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
const port = Number(process.argv[3] ?? 8092);
const BASE = `http://localhost:${port}`;
const EXE = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await page.evaluate(fn)) return true;
    } catch { /* still loading */ }
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: repoDir, stdio: 'ignore' });
  const results = [];
  const check = (name, pass, detail = '') => {
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    results.push(pass);
  };
  try {
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
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await ctx.newPage();
    const errors = [];
    const failedReqs = [];
    const externalReqs = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('requestfailed', (r) => failedReqs.push(r.url()));
    page.on('request', (r) => {
      if (!r.url().startsWith(BASE)) externalReqs.push(r.url());
    });
    const S = (fn, ...args) => page.evaluate(fn, ...args);

    await page.goto(`${BASE}/?seed=7`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 60000 });
    await sleep(5000);
    check('01 boot: title screen shows', await S(() => {
      const el = document.getElementById('titleScreen');
      return el && getComputedStyle(el).display !== 'none';
    }));
    check('02 boot: canvas present', await S(() => {
      const c = document.getElementById('game');
      return !!c && c.width > 0 && c.height > 0;
    }));
    await page.click('#startBtn');
    await sleep(1500);
    check('03 start: screen is PLAY', await S(() => window.__game.state.screen === 'play'));
    check('04 start: cash $0', await S(() => window.__game.state.cash === 0));
    check('05 start: health 100', await S(() => window.__game.state.player.health === 100));
    check('06 start: ammo 12', await S(() => window.__game.state.player.ammo === 12));
    check('07 start: stars 0', await S(() => window.__game.state.stars === 0));
    check('08 start: mission marker present', await S(() => window.__game.state.marker !== null));
    check('09 world: 10 traffic cars', await S(() => window.__game.state.cars.filter((c) => c.traffic).length === 10));
    check('10 world: 22 pedestrians', await S(() => window.__game.state.peds.length === 22));
    check('11 HUD: minimap present', await S(() => {
      const m = document.getElementById('minimap');
      return !!m && m.width > 0;
    }));

    // Walk forward.
    const p0 = await S(() => ({ x: window.__game.state.player.x, z: window.__game.state.player.z }));
    await page.keyboard.down('w');
    await sleep(3000);
    await page.keyboard.up('w');
    const p1 = await S(() => ({ x: window.__game.state.player.x, z: window.__game.state.player.z }));
    const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('12 walk: moves forward', walked >= 3, `${walked.toFixed(1)}m (v1: 6.7m)`);

    // Jump.
    await page.keyboard.press(' ');
    let jumped = false;
    for (let i = 0; i < 10; i += 1) {
      await sleep(300);
      if (await S(() => window.__game.state.player.y > 0.1)) { jumped = true; break; }
    }
    check('13 jump: leaves the ground', jumped);

    // Steal the nearest parked car.
    const car = await S(() => {
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
    await S((c) => {
      const s = window.__game.state;
      s.player.x = c.x + 2;
      s.player.z = c.z;
      s.player.heading = Math.atan2(c.x - s.player.x, c.z - s.player.z);
    }, car);
    await page.keyboard.press('e');
    await sleep(1500);
    check('14 steal: gets in the car', await S(() => !!window.__game.state.player.inCar));
    check('15 steal: stars rise', await S(() => window.__game.state.stars >= 1));

    // Drive.
    const d0 = await S(() => ({ x: window.__game.state.player.inCar.x, z: window.__game.state.player.inCar.z }));
    await page.keyboard.down('w');
    await sleep(3000);
    const speed = await S(() => window.__game.state.player.inCar.speed);
    await page.keyboard.up('w');
    const d1 = await S(() => ({ x: window.__game.state.player.inCar.x, z: window.__game.state.player.inCar.z }));
    const driven = Math.hypot(d1.x - d0.x, d1.z - d0.z);
    check('16 drive: car moves', driven >= 5, `${driven.toFixed(1)}m (v1: 11.2m)`);
    check('17 drive: speedometer > 0', speed > 3, `speed ${speed.toFixed(1)}`);
    await page.keyboard.press('e');
    await sleep(1200);
    check('18 exit: leaves the car', await S(() => !window.__game.state.player.inCar));

    // Mission 1 advances and completes.
    await S(() => window.__game.forceMission(0, 0));
    await S(() => window.__game.teleport(0, 170));
    await waitFor(page, () => {
      const s = window.__game.state;
      return s.mission && s.mission.stepIndex === 1;
    }, 30000, 'mission 1 step 2');
    check('19 mission 1: advances on reaching pickup', true);
    await S(() => window.__game.teleport(116, 58));
    await waitFor(page, () => {
      const s = window.__game.state;
      return s.mission === null && s.missionIndex === 1;
    }, 30000, 'mission 1 complete');
    check('20 mission 1: completes, +$150', await S(() => window.__game.state.cash === 150));
    check('21 save: written after mission', await S(() => {
      const raw = window.localStorage.getItem('sunshore-save-v1');
      if (!raw) return false;
      const save = JSON.parse(raw);
      return save.cash === 150 && save.missionIndex === 1;
    }));

    // Wanted level: cruisers + officers.
    await S(() => window.__game.setHeat(2.5));
    await sleep(4000);
    const wanted = await S(() => ({
      stars: window.__game.state.stars,
      police: window.__game.state.police.length,
      officers: window.__game.state.officers.length,
    }));
    check('22 wanted: 3 stars bring cruisers', wanted.stars >= 3 && wanted.police >= 3, JSON.stringify(wanted));
    check('23 wanted: officers spawn on foot', wanted.officers >= 1, JSON.stringify(wanted));

    // Turf War spawns 5 gang members.
    await S(() => window.__game.forceMission(3, 1));
    await sleep(1500);
    check('24 Turf War: 5 gang members', await S(() => window.__game.state.enemies.filter((e) => e.alive).length === 5));

    // Click shoots, R reloads.
    const ammo0 = await S(() => window.__game.state.player.ammo);
    await page.mouse.click(320, 180);
    await sleep(1200);
    const ammo1 = await S(() => window.__game.state.player.ammo);
    check('25 shoot: click spends ammo', ammo1 === ammo0 - 1, `${ammo0} -> ${ammo1}`);
    await page.keyboard.press('r');
    await sleep(4000);
    check('26 reload: ammo back to 12', await S(() => window.__game.state.player.ammo === 12));

    // Mission banner shows.
    check('27 banner: mission banner shows', await S(() => {
      const b = window.__game.state.banner;
      return !!b && /Turf War/.test(b.title);
    }));

    // HUD elements all present.
    check('28 HUD: all elements present', await S(() => ['cash', 'stars', 'healthFill', 'ammo', 'objective', 'timer', 'feed', 'speedo']
      .every((id) => !!document.getElementById(id))));

    // Pause / resume. Reset first: by now the Turf War gang + 3-star police
    // may have wasted or busted Rico, and P only toggles from PLAY/PAUSED.
    await S(() => window.__game.respawn());
    await sleep(800);
    await page.keyboard.press('p');
    await sleep(800);
    check('29 pause: P pauses', await S(() => window.__game.state.screen === 'paused'));
    await page.keyboard.press('p');
    await sleep(800);
    check('30 pause: P resumes', await S(() => window.__game.state.screen === 'play'));

    // Respawn writes a save.
    await S(() => window.__game.respawn());
    await sleep(800);
    check('31 save: respawn writes save', await S(() => !!window.localStorage.getItem('sunshore-save-v1')));

    // Test hook version.
    check('32 hooks: version sunshore-1', await S(() => window.__game.version === 'sunshore-1'));

    // Error / request hygiene over the whole run.
    check('33 errors: 0 console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('34 requests: 0 failed requests', failedReqs.length === 0, failedReqs.slice(0, 3).join(' | '));
    check('35 requests: 0 external requests', externalReqs.length === 0, externalReqs.slice(0, 3).join(' | '));

    const passed = results.filter(Boolean).length;
    console.log(`FULL ${passed}/${results.length} passed`);
    await browser.close();
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    server.kill();
  }
}

main();
