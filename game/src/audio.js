// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// Engine hum, sirens, gunshots, pickup chimes and a small bass-and-hats loop.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function noiseBuffer(seconds) {
    const c = ensure();
    if (!c) return null;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    const c = ensure();
    if (!c || muted) return;
    const buf = noiseBuffer(dur);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
  }

  // A laid-back loop: root-note bass on the beat, hats off it, a sparse lead.
  // Chords: Am - F - C - G, 96 bpm, all oscillators, nothing sampled.
  const CHORDS = [110, 87.31, 130.81, 98];
  let bar = 0;
  function musicStep() {
    const c = ensure();
    if (!c || muted) return;
    const root = CHORDS[bar % CHORDS.length];
    const t = c.currentTime;
    // Bass on beats 1 and 3.
    for (const beat of [0, 2]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = root / 2;
      const start = t + beat * 0.3125;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
    // Hats on the off-beats.
    for (const beat of [1, 3]) {
      const buf = noiseBuffer(0.05);
      if (!buf) continue;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const gain = c.createGain();
      const start = t + beat * 0.3125;
      gain.gain.setValueAtTime(0.05, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
      src.connect(filter).connect(gain).connect(c.destination);
      src.start(start);
    }
    // Lead pluck on bar 2 and 4.
    if (bar % 2 === 1) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = root * 2;
      const start = t + 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    }
    bar += 1;
  }

  return {
    unlock,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (muted) {
        this.stopEngine();
        this.stopSiren();
        this.stopMusic();
      }
      return muted;
    },
    startMusic() {
      const c = ensure();
      if (!c || musicTimer) return;
      unlock();
      musicStep();
      musicTimer = window.setInterval(musicStep, 1250);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    startEngine() {
      const c = ensure();
      if (!c || engineOsc) return;
      unlock();
      engineOsc = c.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = c.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = c.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(c.destination);
      engineOsc.start();
    },
    setEngine(speed01, on) {
      if (!engineOsc || !engineGain) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
      engineGain.gain.setTargetAtTime(on && !muted ? 0.05 + speed01 * 0.05 : 0.0, t, 0.1);
    },
    stopEngine() {
      if (engineOsc) {
        try {
          engineOsc.stop();
        } catch {
          // Already stopped.
        }
        engineOsc = null;
        engineGain = null;
        engineFilter = null;
      }
    },
    startSiren() {
      const c = ensure();
      if (!c || sirenOsc) return;
      unlock();
      sirenOsc = c.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenLfo = c.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 220;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = c.createGain();
      sirenGain.gain.value = muted ? 0 : 0.035;
      sirenOsc.connect(sirenGain).connect(c.destination);
      sirenOsc.start();
      sirenLfo.start();
    },
    stopSiren() {
      if (sirenOsc) {
        try {
          sirenOsc.stop();
          sirenLfo.stop();
        } catch {
          // Already stopped.
        }
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 1800);
      blip(160, 0.12, 'square', 0.18, 55);
    },
    sirenBlip() {
      blip(700, 0.14, 'triangle', 0.12, 950);
      window.setTimeout(() => blip(950, 0.14, 'triangle', 0.12, 700), 140);
    },
    punch() {
      noiseBurst(0.08, 0.3, 700);
    },
    chime() {
      blip(660, 0.14, 'sine', 0.16);
      window.setTimeout(() => blip(880, 0.2, 'sine', 0.16), 90);
      window.setTimeout(() => blip(1320, 0.26, 'sine', 0.12), 180);
    },
    fail() {
      blip(220, 0.25, 'sawtooth', 0.14, 110);
    },
    crash() {
      noiseBurst(0.25, 0.5, 900);
    },
    pickup() {
      blip(990, 0.1, 'sine', 0.14);
      window.setTimeout(() => blip(1320, 0.16, 'sine', 0.14), 70);
    },
    click() {
      blip(1200, 0.05, 'square', 0.06);
    },
  };
}
