// Everything is synthesised with WebAudio so there are no sound files to license or ship.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;

let engineOsc: OscillatorNode | null = null;
let engineOsc2: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let windGain: GainNode | null = null;
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

/** Must be called from a user gesture. */
export function initAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 500;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain).connect(master);
  engineOsc.start();
  engineOsc2.start();

  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 900;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(master);
  wind.start();

  sirenOsc = ctx.createOscillator();
  sirenOsc.type = 'square';
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain).connect(master);
  sirenOsc.start();
}

/** rpm 0..1 plus speed fraction 0..1. */
export function updateEngine(rpm: number, speedFrac: number, on: boolean, siren: number): void {
  if (!ctx || !engineOsc || !engineOsc2 || !engineGain || !engineFilter || !windGain || !sirenOsc || !sirenGain) return;
  const t = ctx.currentTime;
  const f = 38 + rpm * 150;
  engineOsc.frequency.setTargetAtTime(f, t, 0.05);
  engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engineFilter.frequency.setTargetAtTime(300 + rpm * 1400, t, 0.05);
  engineGain.gain.setTargetAtTime(on ? 0.12 + rpm * 0.1 : 0, t, 0.1);
  windGain.gain.setTargetAtTime(on ? speedFrac * speedFrac * 0.18 : 0, t, 0.1);
  sirenGain.gain.setTargetAtTime(siren * 0.035, t, 0.2);
  sirenOsc.frequency.setValueAtTime(Math.floor(t * 2) % 2 ? 760 : 960, t);
}

export function silence(): void {
  updateEngine(0, 0, false, 0);
}

function burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', q = 1): void {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'square', slideTo?: number, delay = 0): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  const g = ctx.createGain();
  const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  whoosh: () => burst(0.18, 2200, 0.25, 'bandpass', 1.5),
  hit: () => { burst(0.2, 700, 0.6); tone(140, 0.15, 0.3, 'square', 60); },
  crash: () => { burst(0.9, 500, 0.9); tone(90, 0.5, 0.35, 'sawtooth', 30); },
  bump: () => burst(0.12, 400, 0.4),
  cash: () => { tone(880, 0.08, 0.2, 'square'); tone(1320, 0.14, 0.2, 'square', undefined, 0.07); },
  beep: () => tone(660, 0.18, 0.25, 'square'),
  go: () => tone(990, 0.5, 0.3, 'square'),
  grab: () => { tone(500, 0.08, 0.25, 'square'); tone(900, 0.1, 0.25, 'square', undefined, 0.08); },
  busted: () => { tone(700, 0.3, 0.3, 'square', 300); tone(500, 0.5, 0.3, 'square', 150, 0.25); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 0.25, 'square', undefined, i * 0.14)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 0.25, 'sawtooth', undefined, i * 0.2)),
  click: () => tone(1200, 0.04, 0.15, 'square'),
  nitro: () => burst(0.6, 1800, 0.3, 'highpass'),
};
