// All sounds synthesised with Web Audio API — no external URLs, 100% reliable.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNodes: AudioNode[] = [];
let session = 0; // incremented on every stop — prevents old setTimeout callbacks from firing into a new sound

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function stopAll() {
  session++;
  activeNodes.forEach((n) => {
    try { (n as AudioBufferSourceNode).stop?.(); } catch { /* already stopped */ }
  });
  activeNodes = [];
}

// ── Noise buffer ─────────────────────────────────────────────────────────────

function createNoiseBuffer(ac: AudioContext, seconds = 2): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseSource(ac: AudioContext): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = createNoiseBuffer(ac);
  src.loop = true;
  return src;
}

// ── Rain family ──────────────────────────────────────────────────────────────

function synthRainLight(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.3;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
  const g = ac.createGain(); g.gain.value = 0.6;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, hp, g);
}

function synthRainHeavy(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100;
  const g = ac.createGain(); g.gain.value = 1.0;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, hp, g);
}

function synthRainUmbrella(ac: AudioContext, dest: AudioNode) {
  // Base drizzle
  synthRainLight(ac, dest);
  const mySession = session;
  // Tapping impacts — isolated drops on fabric
  function drop() {
    if (session !== mySession) return;
    const imp = noiseSource(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ig = ac.createGain(); ig.gain.value = 0;
    imp.connect(hp); hp.connect(ig); ig.connect(dest);
    const now = ac.currentTime;
    ig.gain.setValueAtTime(0.18 + Math.random() * 0.12, now);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.04 + Math.random() * 0.04);
    imp.start(now); imp.stop(now + 0.1);
    setTimeout(drop, 80 + Math.random() * 260);
  }
  setTimeout(drop, 100);
}

function synthRainWindow(ac: AudioContext, dest: AudioNode) {
  // Very gentle ambient rain bed
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.3;
  const g = ac.createGain(); g.gain.value = 0.4;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, g);
  const mySession = session;
  // Slow glass-drop taps
  function droplet() {
    if (session !== mySession) return;
    const osc = ac.createOscillator(); osc.type = 'sine';
    osc.frequency.value = 900 + Math.random() * 600;
    const og = ac.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(dest);
    const now = ac.currentTime;
    og.gain.setValueAtTime(0.05, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now); osc.stop(now + 0.4);
    setTimeout(droplet, 400 + Math.random() * 1200);
  }
  for (let i = 0; i < 3; i++) setTimeout(droplet, Math.random() * 600);
}

// ── Ocean family ─────────────────────────────────────────────────────────────

function synthOceanWaves(ac: AudioContext, dest: AudioNode, speed = 0.12, bassGain = 0.4) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350;
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = speed;
  const lfoGain = ac.createGain(); lfoGain.gain.value = 0.3;
  const waveGain = ac.createGain(); waveGain.gain.value = 0;
  lfo.connect(lfoGain); lfoGain.connect(waveGain.gain);
  src.connect(lp); lp.connect(waveGain); waveGain.connect(dest);
  const bass = noiseSource(ac);
  const bassLp = ac.createBiquadFilter(); bassLp.type = 'lowpass'; bassLp.frequency.value = 100;
  const bassG = ac.createGain(); bassG.gain.value = bassGain;
  bass.connect(bassLp); bassLp.connect(bassG); bassG.connect(dest);
  src.start(); lfo.start(); bass.start();
  activeNodes.push(src, lp, lfo, lfoGain, waveGain, bass, bassLp, bassG);
}

function synthOceanBeach(ac: AudioContext, dest: AudioNode) {
  synthOceanWaves(ac, dest, 0.28, 0.3); // faster crash rhythm
}

function synthOceanDeep(ac: AudioContext, dest: AudioNode) {
  // Pure deep bass rumble
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.05;
  const lfoG = ac.createGain(); lfoG.gain.value = 0.4;
  const wg = ac.createGain(); wg.gain.value = 0.1;
  lfo.connect(lfoG); lfoG.connect(wg.gain);
  src.connect(lp); lp.connect(wg); wg.connect(dest);
  src.start(); lfo.start();
  activeNodes.push(src, lp, lfo, lfoG, wg);
}

// ── Storm ────────────────────────────────────────────────────────────────────

function synthStorm(ac: AudioContext, dest: AudioNode) {
  const rain = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const g = ac.createGain(); g.gain.value = 0.8;
  rain.connect(lp); lp.connect(g); g.connect(dest);
  rain.start();
  activeNodes.push(rain, lp, g);
  const mySession = session;
  function thunder() {
    if (session !== mySession) return;
    const t = noiseSource(ac);
    const lp2 = ac.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 80;
    const tg = ac.createGain(); tg.gain.value = 0;
    t.connect(lp2); lp2.connect(tg); tg.connect(dest);
    const now = ac.currentTime;
    tg.gain.setValueAtTime(0, now);
    tg.gain.linearRampToValueAtTime(1.2, now + 0.05);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    t.start(); t.stop(now + 2.6);
    setTimeout(thunder, 6000 + Math.random() * 10000);
  }
  setTimeout(thunder, 1000);
}

// ── Wind family ──────────────────────────────────────────────────────────────

function synthWindGentle(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.04;
  const lfoG = ac.createGain(); lfoG.gain.value = 0.25;
  const wg = ac.createGain(); wg.gain.value = 0.35;
  lfo.connect(lfoG); lfoG.connect(wg.gain);
  src.connect(lp); lp.connect(wg); wg.connect(dest);
  src.start(); lfo.start();
  activeNodes.push(src, lp, lfo, lfoG, wg);
}

function synthWindHowl(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.08;
  const lfoG = ac.createGain(); lfoG.gain.value = 0.45;
  const wg = ac.createGain(); wg.gain.value = 0.7;
  lfo.connect(lfoG); lfoG.connect(wg.gain);
  // High whistle layer
  const src2 = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
  const g2 = ac.createGain(); g2.gain.value = 0.08;
  src2.connect(bp); bp.connect(g2); g2.connect(dest);
  src.connect(lp); lp.connect(wg); wg.connect(dest);
  src.start(); lfo.start(); src2.start();
  activeNodes.push(src, lp, lfo, lfoG, wg, src2, bp, g2);
}

// ── Forest family ────────────────────────────────────────────────────────────

function synthBirds(ac: AudioContext, dest: AudioNode) {
  const baseFreqs = [2200, 2800, 3400, 1800, 3100];
  const noise = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
  const ng = ac.createGain(); ng.gain.value = 0.05;
  noise.connect(bp); bp.connect(ng); ng.connect(dest);
  noise.start();
  activeNodes.push(noise, bp, ng);
  const mySession = session;
  function chirp() {
    if (session !== mySession) return;
    const freq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)] + (Math.random() - 0.5) * 300;
    const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(dest);
    const now = ac.currentTime;
    const vol = 0.08 + Math.random() * 0.08;
    const dur = 0.06 + Math.random() * 0.12;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freq * (0.9 + Math.random() * 0.2), now + dur);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.08);
    osc.start(now); osc.stop(now + dur + 0.1);
    if (Math.random() > 0.5) setTimeout(chirp, 80 + Math.random() * 120);
    setTimeout(chirp, 200 + Math.random() * 1800);
  }
  for (let i = 0; i < 4; i++) setTimeout(chirp, Math.random() * 600);
}

function synthForestMorning(ac: AudioContext, dest: AudioNode) {
  synthWindGentle(ac, dest);
  synthBirds(ac, dest);
}

function synthForestNight(ac: AudioContext, dest: AudioNode) {
  // Crickets at ~3kHz with slight variation
  const noise = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
  const ng = ac.createGain(); ng.gain.value = 0.15;
  noise.connect(lp); lp.connect(ng); ng.connect(dest);
  noise.start();
  activeNodes.push(noise, lp, ng);
  const mySession = session;
  function cricket() {
    if (session !== mySession) return;
    const chirps = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < chirps; i++) {
      const osc = ac.createOscillator(); osc.type = 'sine';
      osc.frequency.value = 4200 + Math.random() * 600;
      const g = ac.createGain(); g.gain.value = 0;
      osc.connect(g); g.connect(dest);
      const start = ac.currentTime + i * 0.055;
      g.gain.setValueAtTime(0.04, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      osc.start(start); osc.stop(start + 0.05);
    }
    setTimeout(cricket, 300 + Math.random() * 800);
  }
  for (let i = 0; i < 6; i++) setTimeout(cricket, Math.random() * 400);
}

function synthForestRain(ac: AudioContext, dest: AudioNode) {
  synthRainLight(ac, dest);
  synthBirds(ac, dest);
}

// ── Fire family ───────────────────────────────────────────────────────────────

function synthFireBase(ac: AudioContext, dest: AudioNode, crackleRate: number, baseGain: number) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const g = ac.createGain(); g.gain.value = baseGain;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, g);
  const mySession = session;
  function crackle() {
    if (session !== mySession) return;
    const imp = noiseSource(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const ig = ac.createGain(); ig.gain.value = 0;
    imp.connect(hp); hp.connect(ig); ig.connect(dest);
    const now = ac.currentTime;
    const vol = 0.2 + Math.random() * 0.25;
    ig.gain.setValueAtTime(vol, now);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.04 + Math.random() * 0.06);
    imp.start(now); imp.stop(now + 0.12);
    setTimeout(crackle, crackleRate + Math.random() * 500);
  }
  crackle();
}

function synthFireplace(ac: AudioContext, dest: AudioNode) {
  synthFireBase(ac, dest, 150, 0.25);
}

function synthCampfire(ac: AudioContext, dest: AudioNode) {
  synthFireBase(ac, dest, 80, 0.4);  // more crackle, louder
  // Low wind layer
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
  const g = ac.createGain(); g.gain.value = 0.15;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, g);
}

function synthCandle(ac: AudioContext, dest: AudioNode) {
  // Very gentle, barely there flicker
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const g = ac.createGain(); g.gain.value = 0.08;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, g);
  const mySession = session;
  function tick() {
    if (session !== mySession) return;
    const imp = noiseSource(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
    const ig = ac.createGain(); ig.gain.value = 0;
    imp.connect(hp); hp.connect(ig); ig.connect(dest);
    const now = ac.currentTime;
    ig.gain.setValueAtTime(0.06, now);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    imp.start(now); imp.stop(now + 0.05);
    setTimeout(tick, 500 + Math.random() * 1500);
  }
  tick();
}

// ── River family ─────────────────────────────────────────────────────────────

function synthRiver(ac: AudioContext, dest: AudioNode) {
  [1, 2].forEach((_, i) => {
    const src = noiseSource(ac);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600 + i * 300; bp.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.08 + i * 0.05;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 150;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
    const g = ac.createGain(); g.gain.value = 0.5;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(); lfo.start();
    activeNodes.push(src, bp, lfo, lfoGain, g);
  });
}

function synthWaterfall(ac: AudioContext, dest: AudioNode) {
  // Full-bandwidth rushing water
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200;
  const g = ac.createGain(); g.gain.value = 0.85;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, hp, g);
  // Bass mist rumble
  const bass = noiseSource(ac);
  const bassLp = ac.createBiquadFilter(); bassLp.type = 'lowpass'; bassLp.frequency.value = 120;
  const bassG = ac.createGain(); bassG.gain.value = 0.35;
  bass.connect(bassLp); bassLp.connect(bassG); bassG.connect(dest);
  bass.start();
  activeNodes.push(bass, bassLp, bassG);
}

// ── Café family ───────────────────────────────────────────────────────────────

function synthCafeBase(ac: AudioContext, dest: AudioNode, murmurGain: number, chatterGain: number) {
  const src = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.3;
  const g = ac.createGain(); g.gain.value = murmurGain;
  src.connect(bp); bp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, bp, g);
  const src2 = noiseSource(ac);
  const bp2 = ac.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2000; bp2.Q.value = 0.5;
  const g2 = ac.createGain(); g2.gain.value = chatterGain;
  src2.connect(bp2); bp2.connect(g2); g2.connect(dest);
  src2.start();
  activeNodes.push(src2, bp2, g2);
  const mySession = session;
  function clink() {
    if (session !== mySession) return;
    const osc = ac.createOscillator(); osc.frequency.value = 1800 + Math.random() * 400;
    const og = ac.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(dest);
    const now = ac.currentTime;
    og.gain.setValueAtTime(0.06, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now); osc.stop(now + 0.5);
    setTimeout(clink, 3000 + Math.random() * 8000);
  }
  clink();
}

function synthCafeQuiet(ac: AudioContext, dest: AudioNode) {
  synthCafeBase(ac, dest, 0.22, 0.08);
}

function synthCafeBusy(ac: AudioContext, dest: AudioNode) {
  synthCafeBase(ac, dest, 0.5, 0.22);
}

function synthCafeRainy(ac: AudioContext, dest: AudioNode) {
  synthCafeBase(ac, dest, 0.22, 0.1);
  synthRainWindow(ac, dest);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SoundVariant {
  id: string;
  label: string;
}

export interface Soundscape {
  id: string;
  label: string;
  svg: string;
  variants: SoundVariant[];
}

export const SOUNDSCAPES: Soundscape[] = [
  {
    id: 'rain', label: 'Rain',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="10" y1="21" x2="10" y2="23"/><line x1="14" y1="21" x2="14" y2="23"/></svg>`,
    variants: [
      { id: 'rain-light',    label: 'Light Rain' },
      { id: 'rain-heavy',    label: 'Heavy Rain' },
      { id: 'rain-umbrella', label: 'On Umbrella' },
      { id: 'rain-window',   label: 'On Window' },
    ],
  },
  {
    id: 'ocean', label: 'Ocean',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 14c2-5 6-5 8 0s6 5 8 0"/><path d="M2 19c2-4 6-4 8 0s6 4 8 0"/><path d="M6 9c0-4 5-5 6-2"/><path d="M11 7c1-2 4-2 5 0s2 5 0 6"/></svg>`,
    variants: [
      { id: 'ocean-waves', label: 'Ocean Waves' },
      { id: 'ocean-beach', label: 'Beach' },
      { id: 'ocean-deep',  label: 'Deep Ocean' },
    ],
  },
  {
    id: 'storm', label: 'Storm',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`,
    variants: [
      { id: 'storm', label: 'Thunderstorm' },
    ],
  },
  {
    id: 'forest', label: 'Forest',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 20 2 20"/><polygon points="12 7 19 20 5 20" fill="currentColor" opacity="0.15"/><line x1="12" y1="20" x2="12" y2="22"/></svg>`,
    variants: [
      { id: 'forest-morning', label: 'Morning Birds' },
      { id: 'forest-night',   label: 'Night Crickets' },
      { id: 'forest-rain',    label: 'Forest Rain' },
    ],
  },
  {
    id: 'fire', label: 'Fire',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 6 6 10 8 14c-2-1-3-3-3-5C3 14 5 20 12 22c7-2 9-8 7-13-1 2-2 4-4 4 2-3 1-7-3-11z"/></svg>`,
    variants: [
      { id: 'fire-fireplace', label: 'Fireplace' },
      { id: 'fire-campfire',  label: 'Campfire' },
      { id: 'fire-candle',    label: 'Candle' },
    ],
  },
  {
    id: 'river', label: 'River',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 9c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 13c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/></svg>`,
    variants: [
      { id: 'river-stream',    label: 'Babbling Brook' },
      { id: 'river-waterfall', label: 'Waterfall' },
    ],
  },
  {
    id: 'wind', label: 'Wind',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
    variants: [
      { id: 'wind-gentle', label: 'Gentle Breeze' },
      { id: 'wind-howl',   label: 'Howling Wind' },
    ],
  },
  {
    id: 'cafe', label: 'Café',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    variants: [
      { id: 'cafe-quiet', label: 'Quiet Café' },
      { id: 'cafe-busy',  label: 'Busy Café' },
      { id: 'cafe-rainy', label: 'Rainy Day Café' },
    ],
  },
];

const SYNTH_MAP: Record<string, (ac: AudioContext, dest: AudioNode) => void> = {
  'rain-light':      synthRainLight,
  'rain-heavy':      synthRainHeavy,
  'rain-umbrella':   synthRainUmbrella,
  'rain-window':     synthRainWindow,
  'ocean-waves':     (ac, d) => synthOceanWaves(ac, d),
  'ocean-beach':     synthOceanBeach,
  'ocean-deep':      synthOceanDeep,
  'storm':           synthStorm,
  'forest-morning':  synthForestMorning,
  'forest-night':    synthForestNight,
  'forest-rain':     synthForestRain,
  'fire-fireplace':  synthFireplace,
  'fire-campfire':   synthCampfire,
  'fire-candle':     synthCandle,
  'river-stream':    synthRiver,
  'river-waterfall': synthWaterfall,
  'wind-gentle':     synthWindGentle,
  'wind-howl':       synthWindHowl,
  'cafe-quiet':      synthCafeQuiet,
  'cafe-busy':       synthCafeBusy,
  'cafe-rainy':      synthCafeRainy,
};

export function playSoundscape(variantId: string, volume: number) {
  stopAll();
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  masterGain!.gain.value = volume / 100;
  const fn = SYNTH_MAP[variantId];
  if (fn) fn(ac, masterGain!);
}

export function stopSoundscape() {
  stopAll();
}

export function setSoundVolume(volume: number) {
  if (masterGain) masterGain.gain.value = volume / 100;
}
