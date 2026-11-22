// Synthesized craps sounds — the house tradition: no asset files, just Web
// Audio shaped to the real table. A throw is a hand-shake rattle, a whoosh
// down the felt, tumbling clacks that thin out, and two settling knocks; the
// verdicts are chip payouts and the seven-out groan.

import { playSfx, playSfxAt, playSfxLoop, preloadSfx } from "./sfx";

let ctx: AudioContext | null = null;

function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function ensureCrapsAudio(): void {
  ensure();
  preloadSfx(["craps-whoosh", "craps-tumble", "craps-settle", "chip-place", "chip-cascade", "crowd-cheer", "crowd-groan"]);
}

/** One short filtered-noise tick — the building block of clacks + rattles. */
function tick(c: AudioContext, at: number, freq: number, gain: number, dur = 0.03): void {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 2.2;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(at);
}

/** The throw, synced to the ACTUAL roll window (the dice animate tumbling
 *  from the moment the broadcast lands until rollEndsAt): a launch whoosh at
 *  t=0, a gapless tumble underneath that fades as the dice slow, and the two
 *  settling knocks timed to land exactly as the dice visually stop. */
export function diceThrow(durationMs = 4500): void {
  const w = Math.max(1200, durationMs);
  playSfx("craps-whoosh", 0.5, () => {
    // Buffers not ready — the synth arc carries the whole throw instead.
    synthDiceThrow();
  });
  // The dice VISUALLY tumble until the reveal freezes them at w — so the
  // tumble runs almost to the end and the settle knocks hit AT the freeze,
  // not before it (the knock transient starts ~140ms early so its impact
  // lands on the exact frame the dice stop moving).
  playSfxLoop("craps-tumble", w - 240, 0.5, undefined, { fadeInMs: 100, fadeOutMs: 320 });
  playSfxAt("craps-settle", w - 140, 0.7);
}

function synthDiceThrow(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  // Shake: dense soft rattle for ~0.5s.
  let t = 0;
  for (let i = 0; i < 12; i++) {
    tick(c, t0 + t, 2400 + Math.random() * 1800, 0.05 + Math.random() * 0.03);
    t += 0.028 + Math.random() * 0.03;
  }
  // Whoosh down the felt: a noise sweep.
  const len = Math.ceil(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(500, t0 + 0.5);
  f.frequency.exponentialRampToValueAtTime(2200, t0 + 0.95);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0 + 0.5);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.72);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t0 + 0.5);
  // Tumbling clacks, thinning out as the dice slow.
  t = 1.0;
  const gaps = [0.05, 0.07, 0.09, 0.12, 0.16, 0.22, 0.3, 0.42];
  for (const gap of gaps) {
    tick(c, t0 + t, 1500 + Math.random() * 1400, 0.13, 0.035);
    tick(c, t0 + t + 0.012, 1200 + Math.random() * 1000, 0.09, 0.03);
    t += gap;
  }
  // Two settling knocks — wood-ish thumps.
  for (const [dt, fr] of [[t, 320], [t + 0.14, 260]] as const) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(fr, t0 + dt);
    o.frequency.exponentialRampToValueAtTime(fr * 0.6, t0 + dt + 0.09);
    og.gain.setValueAtTime(0.16, t0 + dt);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.12);
    o.connect(og);
    og.connect(c.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.14);
  }
}

/** A chip (or a short stack) pressed onto the felt. */
export function chipPlace(): void {
  playSfx("chip-place", 0.6, () => {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    tick(c, t0, 3400, 0.12, 0.02);
    tick(c, t0 + 0.045, 2900, 0.09, 0.02);
  });
}

/** Paid! A little cascade of chip tinks sliding your way. */
export function crapsWin(): void {
  playSfx("chip-cascade", 0.65, synthCrapsWin);
}

function synthCrapsWin(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  let t = 0;
  for (let i = 0; i < 7; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = 1900 + i * 160 + Math.random() * 120;
    g.gain.setValueAtTime(0.09, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.09);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0 + t);
    o.stop(t0 + t + 0.1);
    t += 0.05 + Math.random() * 0.02;
  }
}

/** Seven out — the whole rail exhales. */
export function sevenOut(): void {
  playSfx("crowd-groan", 0.55, synthSevenOut);
}

function synthSevenOut(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(70, t0 + 0.55);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 500;
  g.gain.setValueAtTime(0.11, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  o.connect(f);
  f.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + 0.65);
}

/** Point made — the rail cheers. */
export function pointMade(): void {
  playSfx("crowd-cheer", 0.5, synthPointMade);
}

function synthPointMade(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  for (const [dt, fr] of [[0, 880], [0.11, 1175]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.12, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.22);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.25);
  }
}
