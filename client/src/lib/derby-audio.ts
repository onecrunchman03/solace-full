// Derby sounds: the synth "3… 2… 1… GO!" countdown, plus real generated
// track audio (gate horn, grandstand roar, photo-finish fanfare) from /sfx.

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

export function ensureDerbyAudio(): void {
  ensure();
}

function tone(c: AudioContext, freq: number, dur: number, gain: number): void {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** One countdown beep — flat, clipped, identical for 3 / 2 / 1. */
export function countBeep(g = 1): void {
  const c = ensure();
  if (!c) return;
  tone(c, 440, 0.18, 0.09 * g);
}

/** GO! — the gate horn plus the green-light tone. */
export function goBeep(g = 1): void {
  const c = ensure();
  if (!c) return;
  preloadSfx(["derby-crowd", "derby-buzzer"]);
  tone(c, 880, 0.55, 0.1 * g);
  playSfx("derby-horn", 0.5 * g);
}

/** Distant CHEERING under the race (Josh: cheering, far away — but not the
 *  muffled murmur; and never loud enough to upstage the race). Gapless,
 *  faded in and out. Returns an early-stop (fading) so the component can
 *  kill it on unmount or a new race. */
export function raceCrowd(durationMs: number, g = 1): () => void {
  return playSfxLoop("derby-crowd", durationMs, 0.15 * g, undefined, { fadeInMs: 600, fadeOutMs: 900 });
}

/** "AND THAT'S THE RACE, FOLKS" — the finish buzzer. No cheering. */
export function finishFanfare(g = 1): void {
  playSfx("derby-buzzer", 0.55 * g);
}

/** Old Reliable keels over — one soft wooden flop on the frame it goes down
 *  (the settle thud, pitched as a body hitting dirt; the gag was silent). */
export function flopThud(g = 1): void {
  playSfx("wheel-thud", 0.45 * g);
}
