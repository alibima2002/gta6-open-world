// The DOM HUD: cash, health, wanted stars, ammo, objective, message feed,
// speedometer, banners, damage flash and the menu screens. The 3D world never
// touches the DOM directly; this module reads state and writes text.
import { SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './world.js';

export function createHud(state, els, audio) {
  const cache = {};
  let lastScreen = null;

  function setText(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }

  function starsText(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    return s;
  }

  function update() {
    const p = state.player;
    setText(els.cash, 'cash', `$${state.cash.toLocaleString('en-US')}`);
    setText(els.stars, 'stars', starsText(state.stars));
    els.stars.classList.toggle('hot', state.stars > 0);
    setText(els.ammo, 'ammo', p.inCar ? '' : `🔫 ${p.ammo}${p.reloading > 0 ? ' …' : ''}`);
    els.healthFill.style.width = `${Math.max(0, p.health)}%`;
    els.healthFill.classList.toggle('low', p.health < 30);

    const mission = state.mission;
    const def = mission ? mission.def : null;
    const objective = mission
      ? `Mission ${def.id}: ${def.title} — ${mission.step.label}`
      : state.missionIndex < 5
        ? `Next: ${['First Fare', 'Hot Wheels', 'Tail Spin', 'Turf War', 'The Big Score'][state.missionIndex]} — reach the yellow marker`
        : 'All missions complete — Sunshore City is yours. Free roam!';
    setText(els.objective, 'objective', objective);
    if (mission && mission.step.type === 'escape') {
      setText(els.timer, 'timer', `⏱ ${Math.ceil(mission.timer)}s`);
      els.timer.style.display = 'block';
    } else {
      els.timer.style.display = 'none';
    }

    // Speedometer, only while driving.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 3.6);
      setText(els.speed, 'speed', `${kmh} km/h`);
      els.speedo.style.display = 'block';
    } else {
      els.speedo.style.display = 'none';
    }

    // Message feed: the last few lines, fading with age.
    const lines = state.messageLog.slice(-4).map((m) => m.text);
    setText(els.feed, 'feed', lines.join('\n'));

    // Mission banner, shown for a few seconds.
    const banner = state.banner;
    if (banner && state.time - banner.t < 4) {
      setText(els.bannerTitle, 'bannerTitle', banner.title);
      setText(els.bannerSub, 'bannerSub', banner.sub);
      els.banner.style.display = 'block';
    } else {
      els.banner.style.display = 'none';
    }

    // Damage flash and low-health vignette.
    const flash = Math.max(p.hurtFlash, 0);
    els.damage.style.opacity = String(Math.min(0.7, flash * 1.4 + (p.health < 30 ? 0.18 : 0)));
    els.hint.style.display = state.screen === SCREEN_PLAY ? 'block' : 'none';

    // Screens.
    if (state.screen !== lastScreen) {
      lastScreen = state.screen;
      els.titleScreen.style.display = state.screen === SCREEN_TITLE ? 'flex' : 'none';
      els.pauseScreen.style.display = state.screen === SCREEN_PAUSED ? 'flex' : 'none';
      els.overScreen.style.display = state.screen === SCREEN_OVER ? 'flex' : 'none';
      els.bustedScreen.style.display = state.screen === SCREEN_BUSTED ? 'flex' : 'none';
      els.hud.style.display = state.screen === SCREEN_PLAY ? 'block' : 'none';
      els.crosshair.style.display = state.screen === SCREEN_PLAY && !p.inCar ? 'block' : 'none';
      if (state.screen === SCREEN_OVER) {
        setText(els.overStats, 'overStats', `Cash $${state.cash.toLocaleString('en-US')} · Missions ${state.missionsDone}/5`);
      }
    }
  }

  function bindButtons(callbacks) {
    els.startBtn.addEventListener('click', () => callbacks.onStart(false));
    els.continueBtn.addEventListener('click', () => callbacks.onStart(true));
    els.resumeBtn.addEventListener('click', () => callbacks.onResume());
    els.restartBtn.addEventListener('click', () => callbacks.onRestart());
    els.bustedBtn.addEventListener('click', () => (callbacks.onBusted ?? callbacks.onRestart)());
    els.muteBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      els.muteBtn.textContent = muted ? '🔇 Unmute (M)' : '🔊 Mute (M)';
    });
  }

  return { update, bindButtons };
}
