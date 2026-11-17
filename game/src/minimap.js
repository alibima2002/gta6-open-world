// The minimap: a 2D canvas top-down view — streets, buildings, beach and water,
// the player arrow, the mission marker, police blips and gang members, with north up.
import { CITY } from './config.js';

const SIZE = 180;
const WORLD_MIN = -210;
const WORLD_MAX = 320; // includes the island

function toMap(v) {
  return ((v - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * SIZE;
}

export function createMinimap(canvas, state) {
  const ctx = canvas.getContext('2d');

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Sea and sand.
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, toMap(CITY.waterZ), SIZE, SIZE - toMap(CITY.waterZ));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, toMap(CITY.beachZ), SIZE, toMap(CITY.waterZ) - toMap(CITY.beachZ));
    // Ground.
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, SIZE, toMap(CITY.beachZ));
    // Roads.
    ctx.strokeStyle = '#565b64';
    ctx.lineWidth = 5;
    for (const p of state.roadLines) {
      ctx.beginPath();
      ctx.moveTo(toMap(p), 0);
      ctx.lineTo(toMap(p), toMap(CITY.beachZ));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, toMap(p));
      ctx.lineTo(SIZE, toMap(p));
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#8d929e';
    for (const b of state.buildings) {
      ctx.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), toMap(b.x + b.w / 2) - toMap(b.x - b.w / 2), toMap(b.z + b.d / 2) - toMap(b.z - b.d / 2));
    }
    // Causeway and island.
    ctx.fillStyle = '#8f8a80';
    ctx.fillRect(toMap(-CITY.causewayHalf), toMap(CITY.beachZ), toMap(CITY.causewayHalf) - toMap(-CITY.causewayHalf), toMap(CITY.islandZ + 20) - toMap(CITY.beachZ));
    ctx.fillStyle = '#e8d29a';
    ctx.beginPath();
    ctx.arc(toMap(0), toMap(CITY.islandZ), toMap(CITY.islandR) - toMap(0), 0, Math.PI * 2);
    ctx.fill();

    // Gang members (red) and police (blue).
    for (const e of state.enemies) {
      if (!e.alive) continue;
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(toMap(e.x), toMap(e.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const unit of state.police) {
      ctx.fillStyle = '#4d7cff';
      ctx.beginPath();
      ctx.arc(toMap(unit.car.x), toMap(unit.car.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission marker: a pulsing yellow diamond.
    if (state.marker) {
      const pulse = 5 + Math.sin(state.time * 4) * 2;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(toMap(state.marker.x), toMap(state.marker.z) - pulse);
      ctx.lineTo(toMap(state.marker.x) + pulse, toMap(state.marker.z));
      ctx.lineTo(toMap(state.marker.x), toMap(state.marker.z) + pulse);
      ctx.lineTo(toMap(state.marker.x) - pulse, toMap(state.marker.z));
      ctx.closePath();
      ctx.fill();
    }
    // Player arrow, rotated to face the heading.
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const heading = p.inCar ? p.inCar.heading : p.heading;
    ctx.save();
    ctx.translate(toMap(px), toMap(pz));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North indicator.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('N', SIZE - 14, 14);
  }

  return { draw };
}
