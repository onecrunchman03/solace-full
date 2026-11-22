// Synthesized Bone Pit sounds — the house tradition: no asset files.
// A cup of rattling dice, and the LIAR verdict: a bright "you got him" ding
// when the caller is right, a flat wrong-answer buzz when the bluff holds.

import { playSfx, playSfxAt, preloadSfx } from "./sfx";

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

export function ensurePitAudio(): void {
  ensure();
  preloadSfx(["dice-shake", "pit-cupslam", "pit-liar", "pit-diecrack", "pit-crown"]);
}

/** The liar's-dice ritual: shake the cup, SLAM it down. */
export function diceRattle(): void {
  playSfx("dice-shake", 0.55, synthDiceRattle);
  playSfxAt("pit-cupslam", 950, 0.6);
}

function synthDiceRattle(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  let t = 0;
  for (let i = 0; i < 14; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 900 + Math.random() * 1600;
    const gain = 0.05 + Math.random() * 0.04;
    g.gain.setValueAtTime(gain, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.035);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0 + t);
    o.stop(t0 + t + 0.05);
    t += 0.03 + Math.random() * 0.05 + i * 0.004; // knocks thin out as the cup settles
  }
}

/** LIAR was RIGHT: the ascending dings — the verdict speaks for itself. */
export function verdictRight(): void {
  synthVerdictRight();
}

function synthVerdictRight(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const dt = i * 0.14;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.linearRampToValueAtTime(0.11, t + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.4);
    o.connect(g);
    g.connect(c.destination);
    o.start(t + dt);
    o.stop(t + dt + 0.45);
  });
}

/** LIAR was WRONG: the flat descending buzz — no crowd, just the shame. */
export function verdictWrong(): void {
  synthVerdictWrong();
}

function synthVerdictWrong(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(95, t + 0.4);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.5);
}
