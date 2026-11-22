// Synthesized wheel audio via the Web Audio API — no asset files, no licensing.
// A decelerating ratchet of sharp clicks for the spin, tier-scaled win chimes,
// and an ominous death tone. Everything is created lazily on a user gesture
// (browsers block audio before that).

import { playSfx, preloadSfx, sfxBuffer, sfxContext, sfxOut, getSfxVolume } from "./sfx";

const WHEEL_SOUNDS = [
  "wheel-clack", "wheel-thud", "wheel-win-common", "wheel-win-rare",
  "wheel-win-legendary", "wheel-talisman", "wheel-womp", "wheel-death", "wheel-reaper", "mystery-open",
];

let ctx: AudioContext | null = null;
let sfx: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export function setEnabled(v: boolean): void {
  enabled = v;
}

/** Create (or resume) the audio context. Must be called from a user gesture. */
export function ensureAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    if (sfx) sfx.gain.value = 0.5 * getSfxVolume(); // pick up slider changes
    return;
  }
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    sfx = ctx.createGain();
    sfx.gain.value = 0.5 * getSfxVolume(); // synth fallbacks obey App sounds too
    sfx.connect(ctx.destination);
    preloadSfx(WHEEL_SOUNDS); // warm the buffers on this user gesture
  } catch {
    ctx = null;
  }
}

/** A tiny reusable buffer of white noise — the raw material for each "clack". */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/**
 * One sharp click: a short band-passed noise burst (the "clack") over a tiny
 * pitched knock (a woody body). The band-pass centre wanders per click, so the
 * ratchet reads as clickity-clackity rather than a steady tone.
 */
function tick(c: AudioContext, out: GainNode, t: number, vol: number): void {
  // The clack — a filtered burst of noise.
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700 + Math.random() * 1900;
  bp.Q.value = 5 + Math.random() * 4;
  const ng = c.createGain();
  ng.gain.setValueAtTime(vol, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02); // sharp, short
  src.connect(bp);
  bp.connect(ng);
  ng.connect(out);
  src.start(t);
  src.stop(t + 0.05);

  // A tiny pitched knock underneath, for a woody "clack" body.
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = 300 + Math.random() * 200;
  g.gain.setValueAtTime(vol * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.013);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.02);
}

/** A muted low thud — the pointer settling into the winning slot. Selling the
 *  stop matters: without it the ratchet just trails off and the result feels
 *  disconnected from the wheel. */
function thud(c: AudioContext, out: GainNode, t: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.2);

  // A soft body of noise under the sine, like felt on wood.
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(lp);
  lp.connect(ng);
  ng.connect(out);
  src.start(t);
  src.stop(t + 0.1);
}

// The DISC eases with cubic-bezier(0.16, 0.62, 0.1, 1) (WheelView.svelte's
// .disc rule). A clack fires each time the pointer crosses a peg, i.e. at
// EQUAL-ROTATION intervals — so the schedule must invert exactly that bezier,
// not an approximation, or the ratchet drifts against the picture mid-spin.
const BEZ = { x1: 0.16, y1: 0.62, x2: 0.1, y2: 1 };
function bezierProgressTable(steps = 256): Float32Array {
  // progress(timeFrac) sampled uniformly in time.
  const table = new Float32Array(steps + 1);
  const bx = (s: number) => 3 * BEZ.x1 * s * (1 - s) ** 2 + 3 * BEZ.x2 * s * s * (1 - s) + s ** 3;
  const by = (s: number) => 3 * BEZ.y1 * s * (1 - s) ** 2 + 3 * BEZ.y2 * s * s * (1 - s) + s ** 3;
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    // Solve bx(s) = x by bisection (bx is monotonic).
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < x) lo = mid;
      else hi = mid;
    }
    table[i] = by((lo + hi) / 2);
  }
  return table;
}
const PROGRESS = bezierProgressTable();
/** Time-fraction at which rotation-progress `p` is reached (inverse lookup). */
function timeAtProgress(p: number): number {
  for (let i = 1; i < PROGRESS.length; i++) {
    if (PROGRESS[i] >= p) {
      const p0 = PROGRESS[i - 1], p1 = PROGRESS[i];
      const f = p1 > p0 ? (p - p0) / (p1 - p0) : 0;
      return (i - 1 + f) / (PROGRESS.length - 1);
    }
  }
  return 1;
}

/** The giant-wheel ratchet: one clack per peg crossing, scheduled on the
 *  disc's OWN easing curve, ending in a settling thud as it stops. */
export function playSpin(durationMs: number): void {
  if (!enabled) return;
  ensureAudio();
  const sc = sfxContext();
  const clack = sfxBuffer("wheel-clack");
  const dur = durationMs / 1000;

  if (sc && clack) {
    const now = sc.currentTime;
    const N = 46; // peg crossings voiced (equal rotation steps)
    for (let i = 1; i <= N; i++) {
      const t = now + dur * timeAtProgress(i / (N + 1));
      const src = sc.createBufferSource();
      src.buffer = clack;
      // Pitch variance so no two clacks ring identically, drooping slightly
      // as the wheel slows — fast crossings ring bright, the last few sit
      // lower and heavier, like the flapper really striking slower pegs.
      src.playbackRate.value = 1.04 - 0.12 * (i / N) + Math.random() * 0.06;
      const g = sc.createGain();
      g.gain.value = 0.2 + 0.18 * (i / N); // quieter blur early, punchy singles late
      src.connect(g);
      g.connect(sfxOut() ?? sc.destination); // obey the App-sounds slider
      src.start(t);
    }
    const thudBuf = sfxBuffer("wheel-thud");
    if (thudBuf) {
      const src = sc.createBufferSource();
      src.buffer = thudBuf;
      const g = sc.createGain();
      g.gain.value = 0.6;
      src.connect(g);
      g.connect(sfxOut() ?? sc.destination);
      src.start(now + dur - 0.04); // the thud IS the stop
    }
    return;
  }

  // Synth fallback (buffers not decoded yet) — same curve.
  if (!ctx || !sfx) return;
  const c = ctx;
  const out = sfx;
  const now = c.currentTime;
  const N = 92;
  for (let i = 1; i <= N; i++) {
    const t = now + dur * timeAtProgress(i / (N + 1));
    tick(c, out, t, 0.11 + 0.08 * (1 - i / N));
  }
  thud(c, out, now + dur);
}

function bell(c: AudioContext, out: GainNode, t: number, freq: number, dur: number): void {
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  const g2 = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  o2.type = "sine";
  o2.frequency.value = freq * 2.01;
  g2.gain.value = 0.3;
  o2.connect(g2);
  g2.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  o2.start(t);
  o2.stop(t + dur + 0.05);
}

const CHIMES: Record<string, number[]> = {
  common: [523.25],
  rare: [523.25, 659.25],
  legendary: [523.25, 659.25, 783.99, 1046.5],
  mythic: [523.25, 659.25, 783.99, 1046.5, 1318.5],
  talisman: [440, 554.37, 659.25, 880],
};

const WIN_FILES: Record<string, string> = {
  common: "wheel-win-common",
  rare: "wheel-win-rare",
  legendary: "wheel-win-legendary",
  mythic: "wheel-win-legendary",
  talisman: "wheel-talisman",
};

export function playWin(tier: string): void {
  if (!enabled) return;
  playSfx(WIN_FILES[tier] ?? WIN_FILES.common, 0.65, () => {
    ensureAudio();
    if (!ctx || !sfx) return;
    const now = ctx.currentTime;
    (CHIMES[tier] ?? CHIMES.common).forEach((f, i) => bell(ctx!, sfx!, now + i * 0.12, f, 0.55));
  });
}

/** One descending "wah" — a sawtooth bent downward through a lowpass (muted,
 *  trombone-ish). Chained a few times this reads as the classic sad-trombone. */
function womp(c: AudioContext, out: GainNode, t: number, f0: number, f1: number, dur: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dur); // the downward "waaah" bend
  lp.type = "lowpass";
  lp.frequency.value = 850; // muted brass
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.2, t + 0.03);
  g.gain.setValueAtTime(0.2, t + Math.max(0.04, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** "Boo-womp" — the deadpan two-note fail sting for a blank spin (Josh's
 *  call, July 2026, per his reference clip: the four-note sad-trombone wah
 *  overstayed its welcome ~38% of spins; the boo-womp lands the joke and
 *  gets out of the way). */
export function playWomp(): void {
  if (!enabled) return;
  playSfx("wheel-womp", 0.55, synthWomp);
}

function synthWomp(): void {
  ensureAudio();
  if (!ctx || !sfx) return;
  // Two quick deep notes: a short "boo" dropping to a flat lower "womp".
  womp(ctx, sfx, ctx.currentTime, 174.61, 164.81, 0.16); // F3 → E3
  womp(ctx, sfx, ctx.currentTime + 0.19, 130.81, 123.47, 0.42); // C3 → B2
}

export function playDeath(): void {
  if (!enabled) return;
  playSfx("wheel-death", 0.85, synthDeath);
}

function synthDeath(): void {
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx;
  const now = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, now);
  o.frequency.exponentialRampToValueAtTime(55, now + 1.3);
  lp.type = "lowpass";
  lp.frequency.value = 800;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.26, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  o.connect(lp);
  lp.connect(g);
  g.connect(sfx);
  o.start(now);
  o.stop(now + 1.6);
}

