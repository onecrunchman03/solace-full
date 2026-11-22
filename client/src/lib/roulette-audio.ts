// Synthesized roulette sounds — the house tradition: no asset files.
// A ball that rattles fast then slows to a clatter, a landing thunk, and a
// win chime. All quiet and short.

import { playSfx, playSfxLoop, preloadSfx } from "./sfx";

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

export function ensureRouletteAudio(): void {
  ensure();
  preloadSfx(["roulette-orbit", "roulette-drop", "chip-place", "chip-cascade"]);
}

function tick(c: AudioContext, t: number, gain: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = 2900 + Math.random() * 700;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.04);
}

/** roulette-drop.ogg, measured (envelope scan): the fret clatter fills
 *  0–800ms peaking at ~580–700ms — the pocket PLUNK — then a decaying
 *  rattle to ~1.3s. Start the file this many ms before the wheel visually
 *  rests and the plunk lands right as the ball drops into the pocket. */
export const DROP_LEAD_MS = 600;

/** The ball run: a heavy roll around the wooden track for the whole spin. */
export function ballRun(durationMs: number): void {
  // The roll slows (playback-rate drift) and dies out exactly as the fret
  // clatter takes over — the handoff reads as the ball leaving the track.
  playSfxLoop("roulette-orbit", Math.max(600, durationMs - DROP_LEAD_MS + 250), 0.38, () => synthBallRun(durationMs), {
    fadeInMs: 250,
    fadeOutMs: 500,
    rateEnd: 0.8,
  });
}

function synthBallRun(durationMs: number): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const dur = Math.min(durationMs, 12_000) / 1000;
  // Tick spacing grows from 40ms to ~300ms — a wheel losing speed.
  let t = 0;
  let gap = 0.04;
  while (t < dur - 0.15) {
    tick(c, t0 + t, 0.025);
    t += gap;
    gap = Math.min(0.3, gap * 1.045);
  }
}

/** The ball leaves the rim: fret clatter → pocket plunk → dying rattle. */
export function ballLand(): void {
  playSfx("roulette-drop", 0.7, synthBallLand);
}

function synthBallLand(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  for (const [dt, freq, gain] of [[0, 190, 0.16], [0.09, 150, 0.1]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t + dt);
    o.frequency.exponentialRampToValueAtTime(70, t + dt + 0.09);
    g.gain.setValueAtTime(gain, t + dt);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.12);
    o.connect(g);
    g.connect(c.destination);
    o.start(t + dt);
    o.stop(t + dt + 0.15);
  }
}

/** You won something: chips slide your way. */
export function rouletteWin(): void {
  playSfx("chip-cascade", 0.65, synthRouletteWin);
}

function synthRouletteWin(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  [659.25, 830.61, 987.77, 1318.5].forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const dt = i * 0.09;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.linearRampToValueAtTime(0.08, t + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35);
    o.connect(g);
    g.connect(c.destination);
    o.start(t + dt);
    o.stop(t + dt + 0.4);
  });
}
