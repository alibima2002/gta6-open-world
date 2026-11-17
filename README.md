# Sunshore City — Rico Vega

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/alibima2002/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/alibima2002/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). It runs offline in a
desktop browser from the static files under `game/` — no network request, no
build step. Open `game/index.html` (or run `node serve.ts` and visit
http://localhost:8080).

## The game

Rico Vega came back to **Sunshore City** with nothing but a driver's licence
and a debt. Mama Delia runs the pier, and she has work for a wheelman who asks
no questions. Five jobs, one big score — don't get caught.

- **A city to explore** — a procedural sun-soaked coastal grid: varied
  buildings with lit windows, palms, a beach, the sea, a causeway and a
  lighthouse island, billboards for fictional brands, traffic and pedestrians.
- **On foot and by car** — third-person walking with running and jumping, an
  orbit camera, and arcade driving with a chase camera, handbrake drifts and
  skid marks. Press **E** near a parked car to steal it.
- **Traffic and pedestrians** — cars follow the roads, stop for each other and
  turn at intersections; pedestrians stroll the sidewalks and flee when scared.
- **Wanted level** — 1–5 stars for stealing, hitting people and shooting.
  Police cruisers chase and ram; foot officers close in and arrest. Stars decay
  while you stay clean.
- **Combat** — punch (**F**), pistol (click to shoot, **R** to reload) with
  muzzle flash and tracers, against rival gang members who shoot back.
- **Five missions and a story** — First Fare, Hot Wheels, Tail Spin, Turf War
  and The Big Score, with beacons, a HUD arrow and minimap blips, cash rewards
  and free roam between jobs.
- **HUD and menus** — cash, health, wanted stars, ammo, minimap, mission
  objective, speedometer, message feed, title / pause / wasted / busted
  screens, and a save in localStorage (Continue on the title screen).
- **Sound** — everything synthesized with WebAudio: engine hum, sirens,
  gunshots, pickup chimes and a bass-and-hats music loop. **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| Mouse drag | Orbit camera |
| Mouse click | Shoot |
| E | Enter / exit a car |
| F | Punch |
| R | Reload |
| N | Next mission info |
| P / Esc | Pause |
| M | Mute |

## How it is built

Three.js r160 is vendored as a minified file under `game/vendor/three.min.js`
and loaded through an import map. The game's own code is ES modules in
`game/src/`, one file per system: `config`, `city`, `player`, `vehicles`,
`traffic` (in `vehicles.js`), `pedestrians`, `police`, `combat`, `missions`,
`hud`, `minimap`, `particles`, `audio`, `input`, `world`, `shots`, `main`.

Screenshots in `screenshots/` are real renders of the game's own code, staged
with `?shot=cover|drive|chase|mission&seed=7` (see `game/src/shots.js`).

## License

MIT — see `LICENSE`. Everything in the game is original: its city, characters,
vehicles, names, story, art and sounds. Nothing is taken from any commercial
game.
