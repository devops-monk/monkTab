// All sounds synthesised with Web Audio API — no external URLs, 100% reliable.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNodes: AudioNode[] = [];

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function stopAll() {
  activeNodes.forEach((n) => {
    try { (n as AudioBufferSourceNode).stop?.(); } catch { /* already stopped */ }
  });
  activeNodes = [];
}

// ── White noise buffer (2s looped) ──────────────────────────────────────────

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

// ── Synthesizers ─────────────────────────────────────────────────────────────

function synthRain(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.4;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 80;
  src.connect(hp); hp.connect(lp); lp.connect(dest);
  src.start();
  activeNodes.push(src, lp, hp);
}

function synthRiver(ac: AudioContext, dest: AudioNode) {
  // Two noise streams + slow modulated bandpass
  [1, 2].forEach((_, i) => {
    const src = noiseSource(ac);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 600 + i * 300; bp.Q.value = 0.6;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.08 + i * 0.05;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
    const g = ac.createGain(); g.gain.value = 0.5;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(); lfo.start();
    activeNodes.push(src, bp, lfo, lfoGain, g);
  });
}

function synthOcean(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 350;
  const lfo = ac.createOscillator();
  lfo.type = 'sine'; lfo.frequency.value = 0.12;
  const lfoGain = ac.createGain(); lfoGain.gain.value = 0.3;
  const waveGain = ac.createGain(); waveGain.gain.value = 0;
  lfo.connect(lfoGain); lfoGain.connect(waveGain.gain);
  src.connect(lp); lp.connect(waveGain); waveGain.connect(dest);
  // Bass rumble
  const bass = noiseSource(ac);
  const bassLp = ac.createBiquadFilter();
  bassLp.type = 'lowpass'; bassLp.frequency.value = 120;
  const bassG = ac.createGain(); bassG.gain.value = 0.4;
  bass.connect(bassLp); bassLp.connect(bassG); bassG.connect(dest);
  src.start(); lfo.start(); bass.start();
  activeNodes.push(src, lp, lfo, lfoGain, waveGain, bass, bassLp, bassG);
}

function synthStorm(ac: AudioContext, dest: AudioNode) {
  // Heavy rain layer
  const rain = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const g = ac.createGain(); g.gain.value = 0.8;
  rain.connect(lp); lp.connect(g); g.connect(dest);
  rain.start();
  activeNodes.push(rain, lp, g);
  // Periodic thunder rumbles
  function thunder() {
    if (!ctx || activeNodes.length === 0) return;
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

function synthWind(ac: AudioContext, dest: AudioNode) {
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.05;
  const lfoG = ac.createGain(); lfoG.gain.value = 0.35;
  const wg = ac.createGain(); wg.gain.value = 0.5;
  lfo.connect(lfoG); lfoG.connect(wg.gain);
  src.connect(lp); lp.connect(wg); wg.connect(dest);
  src.start(); lfo.start();
  activeNodes.push(src, lp, lfo, lfoG, wg);
}

function synthBirds(ac: AudioContext, dest: AudioNode) {
  // Ambient bird soundscape: continuous layered chirps at different pitches
  const baseFreqs = [2200, 2800, 3400, 1800, 3100];

  // Continuous ambient noise bed (rustling leaves)
  const noise = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
  const ng = ac.createGain(); ng.gain.value = 0.06;
  noise.connect(bp); bp.connect(ng); ng.connect(dest);
  noise.start();
  activeNodes.push(noise, bp, ng);

  function chirp() {
    if (activeNodes.length === 0) return;
    const freq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)] + (Math.random() - 0.5) * 300;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(dest);
    const now = ac.currentTime;
    const vol = 0.08 + Math.random() * 0.08;
    const dur = 0.06 + Math.random() * 0.12;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    g.gain.setValueAtTime(vol, now + dur);
    // Frequency slide (bird call)
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freq * (0.9 + Math.random() * 0.2), now + dur);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.08);
    osc.start(now); osc.stop(now + dur + 0.1);
    // Double chirp sometimes
    if (Math.random() > 0.5) {
      setTimeout(chirp, 80 + Math.random() * 120);
    }
    setTimeout(chirp, 200 + Math.random() * 1800);
  }
  for (let i = 0; i < 4; i++) setTimeout(chirp, Math.random() * 600);
}

function synthForest(ac: AudioContext, dest: AudioNode) {
  synthWind(ac, dest);
  synthBirds(ac, dest);
}

function synthFireplace(ac: AudioContext, dest: AudioNode) {
  // Base hiss
  const src = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const g = ac.createGain(); g.gain.value = 0.25;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, lp, g);
  // Crackle impulses
  function crackle() {
    if (activeNodes.length === 0) return;
    const imp = noiseSource(ac);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const ig = ac.createGain(); ig.gain.value = 0;
    imp.connect(hp); hp.connect(ig); ig.connect(dest);
    const now = ac.currentTime;
    ig.gain.setValueAtTime(0.4, now);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.04 + Math.random() * 0.06);
    imp.start(now); imp.stop(now + 0.12);
    setTimeout(crackle, 100 + Math.random() * 600);
  }
  crackle();
}

function synthCafe(ac: AudioContext, dest: AudioNode) {
  // Low murmur band
  const src = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.3;
  const g = ac.createGain(); g.gain.value = 0.4;
  src.connect(bp); bp.connect(g); g.connect(dest);
  src.start();
  activeNodes.push(src, bp, g);
  // Mid-range chatter layer
  const src2 = noiseSource(ac);
  const bp2 = ac.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2000; bp2.Q.value = 0.5;
  const g2 = ac.createGain(); g2.gain.value = 0.15;
  src2.connect(bp2); bp2.connect(g2); g2.connect(dest);
  src2.start();
  activeNodes.push(src2, bp2, g2);
  // Occasional cup clink
  function clink() {
    if (activeNodes.length === 0) return;
    const osc = ac.createOscillator(); osc.frequency.value = 1800 + Math.random() * 400;
    const og = ac.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(dest);
    const now = ac.currentTime;
    og.gain.setValueAtTime(0.08, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now); osc.stop(now + 0.5);
    setTimeout(clink, 3000 + Math.random() * 8000);
  }
  clink();
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface Soundscape {
  id: string;
  label: string;
  svg: string;
}

export const SOUNDSCAPES: Soundscape[] = [
  {
    id: 'rain', label: 'Rain',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="10" y1="21" x2="10" y2="23"/><line x1="14" y1="21" x2="14" y2="23"/></svg>`,
  },
  {
    id: 'river', label: 'River',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 9c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 13c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M8 5 C9 3 11 3 12 5" stroke-width="2"/></svg>`,
  },
  {
    id: 'ocean', label: 'Ocean',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 14c2-5 6-5 8 0s6 5 8 0"/><path d="M2 19c2-4 6-4 8 0s6 4 8 0"/><path d="M6 9c0-4 5-5 6-2"/><path d="M11 7c1-2 4-2 5 0s2 5 0 6"/></svg>`,
  },
  {
    id: 'storm', label: 'Storm',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`,
  },
  {
    id: 'wind', label: 'Wind',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
  },
  {
    id: 'forest', label: 'Forest',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 20 2 20"/><polygon points="12 7 19 20 5 20" fill="currentColor" opacity="0.15"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="7" y1="11" x2="4" y2="20"/><line x1="17" y1="11" x2="20" y2="20"/></svg>`,
  },
  {
    id: 'fireplace', label: 'Fire',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 6 6 10 8 14c-2-1-3-3-3-5C3 14 5 20 12 22c7-2 9-8 7-13-1 2-2 4-4 4 2-3 1-7-3-11z"/></svg>`,
  },
  {
    id: 'cafe', label: 'Café',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  },
];

export function playSoundscape(id: string, volume: number) {
  stopAll();
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  const dest = masterGain!;
  masterGain!.gain.value = volume / 100;
  switch (id) {
    case 'rain':      synthRain(ac, dest); break;
    case 'river':     synthRiver(ac, dest); break;
    case 'ocean':     synthOcean(ac, dest); break;
    case 'storm':     synthStorm(ac, dest); break;
    case 'wind':      synthWind(ac, dest); break;
    case 'forest':    synthForest(ac, dest); break;
    case 'fireplace': synthFireplace(ac, dest); break;
    case 'cafe':      synthCafe(ac, dest); break;
  }
}

export function stopSoundscape() {
  stopAll();
}

export function setSoundVolume(volume: number) {
  if (masterGain) masterGain.gain.value = volume / 100;
}
