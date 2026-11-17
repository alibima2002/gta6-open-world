// Sunshore City: the one place every tuning number lives. All distances are metres,
// the city is a grid of roads, and the beach and water sit at the south edge (+Z).
export const CITY = {
  half: 200, // playable ground runs -200..200 on X, -200..200 on Z (beach beyond +Z)
  roadHalf: 7, // half the width of a road
  roadPos: [-174, -116, -58, 0, 58, 116, 174], // road centre lines, both axes
  blockSize: 44, // a block is roadPos[k+1] - roadPos[k] - 2 * roadHalf
  beachZ: 192, // sand starts here
  waterZ: 208, // water plane starts here
  causewayHalf: 14, // drivable causeway over the water, centred on X = 0
  islandZ: 292, // lighthouse island centre
  islandR: 26,
};

export const COLOURS = {
  sky: 0x87bfe8,
  fog: 0xa8c8e0,
  sun: 0xfff2d0,
  asphalt: 0x2e3138,
  sidewalk: 0x9a938a,
  sand: 0xe8d29a,
  water: 0x1e7fa8,
  grass: 0x5da24a,
  police: 0x1c2f6e,
  taxi: 0xf5c518,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.55,
  health: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  steerMax: 0.55,
  grip: 6.5,
  radius: 1.6,
};

// Wanted heat: crimes add heat, stars are heat bands; heat decays while clean.
export const WANTED = {
  stealCar: 1.0,
  hitPed: 0.8,
  hitCar: 0.25,
  shoot: 0.6,
  kill: 1.2,
  decayPerSec: 0.045,
  // stars = 0 while heat < 0.5, then 1 per 1.0 heat, capped at 5.
};

export const COMBAT = {
  pistolDamage: 34,
  pistolAmmo: 12,
  reloadTime: 1.4,
  punchDamage: 25,
  punchRange: 2.2,
  enemyHealth: 100,
};

export const SAVE_KEY = 'sunshore-save-v1';

// Fictional ads for the billboards: our own brands, nothing borrowed.
export const BILLBOARDS = [
  { brand: 'SOL SODA', line: 'Taste the sun.', bg: '#e8632c', fg: '#fff3d6' },
  { brand: 'PALM AIR', line: 'Fly Sunshore.', bg: '#1e7fa8', fg: '#eaf7ff' },
  { brand: 'VEGA MOTORS', line: 'Built to outrun.', bg: '#22242c', fg: '#f5c518' },
  { brand: 'MAMA DELIA’S', line: 'Café · 24h · Pier 9', bg: '#7a2e4d', fg: '#ffe9f2' },
  { brand: 'SUNSHORE FM', line: '104.9 — all day.', bg: '#2c7a4b', fg: '#eafff0' },
];

// The story: Rico Vega, driver-for-hire, works for fixer Mama Delia.
export const STORY = {
  hero: 'Rico Vega',
  fixer: 'Mama Delia',
  city: 'Sunshore City',
  intro:
    'Sunshore City. Rico Vega came back with nothing but a driver’s licence and a debt. ' +
    'Mama Delia runs the pier, and she has work for a wheelman who asks no questions.',
};
