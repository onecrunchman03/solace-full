// Synthesized slot-machine audio via the Web Audio API — no asset files. A
// mechanical lever ka-chunk, a rattling reel spin, a heavy clunk as each reel
// lands, and an ascending payout jingle. Created lazily on a user gesture
// (browsers block audio before that). Mirrors the wheel-audio module's approach.

import { playSfx, playSfxLoop, preloadSfx, getSfxVolume } from "./sfx";

const SLOT_SOUNDS = ["slots-lever", "slots-reelspin", "slots-reelstop", "slots-payout", "slots-jackpot"];

let ctx: AudioContext | null = null;
let sfx: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
// Slots has no mute toggle (unlike the Wheel) — the flag machinery was
// copied but never wired to UI, so the constant stays and the setter's gone.
const enabled = true;

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
  } catch {
    ctx = null;
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.08);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** A short filtered noise burst — the raw material for clicks and thunks. */
function burst(c: AudioContext, out: GainNode, t: number, vol: number, freq: number, q: number, dur: number): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** A pitched knock (a woody/metallic body under a burst). */
function knock(c: AudioContext, out: GainNode, t: number, freq: number, vol: number, dur: number, type: OscillatorType = "square"): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A descending glide tone (a spring twang / sproing). */
function glide(c: AudioContext, out: GainNode, t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = "triangle"): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** A short resonant metallic ping (a cog tooth / the axle ringing). */
function ping(c: AudioContext, out: GainNode, t: number, freq: number, vol: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.06);
}

/**
 * The lever's mechanical feel, timed to the ~0.7s arm swing toward the player:
 * spring tension winding up, a cog ratchet that accelerates as it's hauled down,
 * a heavy latch clunk at the bottom, then a two-tone metallic sproing + flutter
 * as the arm snaps back up.
 */
export function leverPull(): void {
  if (!enabled) return;
  preloadSfx(SLOT_SOUNDS); // a user gesture — warm everything the pull needs
  playSfx("slots-lever", 0.7, synthLeverPull);
}

function synthLeverPull(): void {
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;

  // 0–0.2s: spring tension winding up (a rising low tone) under a cog ratchet.
  glide(c, out, now, 90, 210, 0.2, 0.12, "sawtooth");
  const R = 9;
  for (let i = 0; i < R; i++) {
    const frac = i / R;
    const t = now + 0.2 * (frac * frac); // accelerate — denser as tension peaks
    burst(c, out, t, 0.09 + 0.06 * frac, 2400 + i * 260, 9, 0.016); // hard cog click
    ping(c, out, t + 0.001, 2600 + i * 120, 0.05 + 0.03 * frac); // metallic tooth ring
  }
  // ~0.22s: the heavy latch/thunk at the bottom of the throw (thud + metal clank).
  knock(c, out, now + 0.22, 128, 0.6, 0.19, "square");
  const sub = c.createOscillator(), sg = c.createGain();
  sub.type = "sine"; sub.frequency.setValueAtTime(70, now + 0.22); sub.frequency.exponentialRampToValueAtTime(42, now + 0.4);
  sg.gain.setValueAtTime(0.42, now + 0.22); sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  sub.connect(sg); sg.connect(out); sub.start(now + 0.22); sub.stop(now + 0.44);
  burst(c, out, now + 0.225, 0.3, 1050, 2.5, 0.11); // clank
  ping(c, out, now + 0.235, 1400, 0.14);
  // ~0.36s: the arm springs back toward rest — a two-tone metallic sproing + flutter.
  glide(c, out, now + 0.36, 560, 150, 0.24, 0.2, "triangle");
  glide(c, out, now + 0.36, 830, 220, 0.2, 0.12, "sawtooth");
  for (let i = 0; i < 6; i++) burst(c, out, now + 0.38 + i * 0.028, 0.05, 3000 + Math.random() * 1600, 9, 0.018);
  // ~0.62s: a final settle click as it seats back in the housing.
  burst(c, out, now + 0.62, 0.1, 1800, 5, 0.02);
  ping(c, out, now + 0.62, 900, 0.06);
}

/** The reels spinning: a real mechanical whirr, looped gaplessly for the
 *  spin and faded out into the last reel's stop (no hard cut). */
export function playReels(durationMs: number): void {
  if (!enabled) return;
  playSfxLoop("slots-reelspin", durationMs, 0.4, () => synthReels(durationMs), { fadeInMs: 90, fadeOutMs: 300 });
}

function synthReels(durationMs: number): void {
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  const dur = durationMs / 1000;
  const rate = 24; // ticks per second — the reel rotating
  const n = Math.floor(dur * rate);
  for (let i = 0; i < n; i++) {
    const t = now + (i / rate);
    burst(c, out, t, 0.05, 2600 + Math.random() * 1200, 8, 0.012);
  }
}

/** A heavy clunk as one reel lands (each landing a touch harder than the
 *  last — the classic left-to-right build). */
export function reelStop(gain = 0.7): void {
  if (!enabled) return;
  playSfx("slots-reelstop", gain, () => {
    ensureAudio();
    if (!ctx || !sfx) return;
    const c = ctx, out = sfx, now = c.currentTime;
    knock(c, out, now, 190, 0.34, 0.1, "triangle");
    burst(c, out, now, 0.16, 1200, 3, 0.05);
  });
}

function bell(c: AudioContext, out: GainNode, t: number, freq: number, dur: number, vol = 0.22): void {
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
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  o2.start(t);
  o2.stop(t + dur + 0.05);
}

// Ascending payout runs, longer/higher the bigger the prize.
const C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, C7 = 2093.0;

/** A classic payout jingle scaled to the prize — with the real coin tray
 *  layered under it for the big ones. `gain` fades it for a win heard across
 *  the casino floor (someone else's cabinet); the 2D game leaves it at 1. */
/** `voice` is a cabinet's own take on the tune (casino/slot-themes.ts
 *  THEME_JINGLE): a pitch ratio and the gap between notes. */
export function winJingle(payout: number, gain = 1, voice: { mul: number; gap: number } = { mul: 1, gap: 0.1 }): void {
  if (!enabled || gain <= 0) return;
  if (payout >= 200) playSfx("slots-jackpot", 0.75 * gain);
  else if (payout >= 40) playSfx("slots-payout", 0.6 * gain);
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  let notes: number[];
  if (payout >= 200) notes = [C6, E6, G6, C7, G6, C7];
  else if (payout >= 80) notes = [C6, E6, G6, C7];
  else if (payout >= 40) notes = [C6, E6, G6];
  else if (payout >= 20) notes = [C6, E6, G6];
  else if (payout >= 10) notes = [C6, E6];
  else notes = [C6, D6];
  notes.forEach((f, i) => bell(c, out, now + i * voice.gap, f * voice.mul, 0.5 * gain));
  // coin shimmer for the bigger wins
  if (payout >= 40) {
    const shimmer = payout >= 200 ? 16 : 8;
    for (let i = 0; i < shimmer; i++) burst(c, out, now + 0.2 + i * 0.045, 0.05 * gain, 4800 + Math.random() * 2500, 10, 0.03);
  }
}

/** A soft low thud for a losing pull. */
export function loseThud(): void {
  if (!enabled) return;
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  knock(c, out, now, 200, 0.12, 0.18, "sine");
}

/** Two-of-a-kind on the line and one reel still turning: a quickening
 *  heartbeat + a slowly rising tension tone under the rattle. */
export function anticipation(durationMs: number): void {
  if (!enabled) return;
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  const dur = Math.min(durationMs, 4000) / 1000;
  let t = 0;
  let period = 0.62;
  while (t < dur - 0.15) {
    knock(c, out, now + t, 95, 0.2, 0.09, "sine"); // lub
    knock(c, out, now + t + 0.16, 78, 0.14, 0.09, "sine"); // dub
    t += period;
    period = Math.max(0.34, period * 0.9); // quickens
  }
  glide(c, out, now, 160, 340, dur, 0.045, "sawtooth"); // rising tension
}

/** One bright coin clink — the payout counter ticking up. */
export function coinTick(): void {
  if (!enabled) return;
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  ping(c, out, now, 3400 + Math.random() * 900, 0.07);
  burst(c, out, now, 0.04, 5200 + Math.random() * 1500, 9, 0.02);
}

/** A cascade of coins hitting the tray — the big-win payoff sound. */
export function coinCascade(count: number, gain = 1): void {
  if (!enabled || gain <= 0) return;
  ensureAudio();
  if (!ctx || !sfx) return;
  const c = ctx, out = sfx, now = c.currentTime;
  const n = Math.min(count, 40);
  for (let i = 0; i < n; i++) {
    // Coins arrive in an accelerating then thinning clatter.
    const t = now + Math.pow(i / n, 0.8) * 1.9 + Math.random() * 0.05;
    ping(c, out, t, 2800 + Math.random() * 2400, (0.05 + Math.random() * 0.05) * gain);
    burst(c, out, t + 0.004, 0.05 * gain, 4200 + Math.random() * 2200, 8, 0.03);
    if (i % 5 === 0) knock(c, out, t + 0.006, 320 + Math.random() * 120, 0.06 * gain, 0.05, "triangle");
  }
}
