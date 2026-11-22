// Trader sounds: a soft till "cha-ching" for sales, and Sterling's voice —
// the refined brass-robot blips (sterling-voice.ts; muttering that never
// quite becomes words — think Animal Crossing, but brass).

import { playSfx, preloadSfx } from "./sfx";
import { sterlingBlips } from "./sterling-voice";
import { voice } from "./voice.svelte";

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

/** Soft money sound: two till-bell dings + a little coin shiver. */
export function chaChing(): void {
  preloadSfx(["register"]);
  playSfx("register", 0.65, synthChaChing);
}

function synthChaChing(): void {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime;

  // Two bright dings (the "cha" and the "ching"), gentle volume.
  for (const [t, f] of [
    [0, 1567.98], // G6
    [0.09, 2093.0], // C7
  ] as const) {
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    o2.type = "sine";
    o2.frequency.value = f * 2.76; // inharmonic partial = metallic
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2);
    g2.connect(g);
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.linearRampToValueAtTime(0.09, now + t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.5);
    o.connect(g);
    g.connect(c.destination);
    o.start(now + t);
    o.stop(now + t + 0.55);
    o2.start(now + t);
    o2.stop(now + t + 0.55);
  }

  // Coin shiver: a short burst of bandpassed noise.
  const len = Math.floor(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 5200;
  bp.Q.value = 2.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.05, now + 0.1);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(c.destination);
  src.start(now + 0.1);
  src.stop(now + 0.3);
}

/**
 * Sterling "speaks": the refined blip voice. Returns the murmur duration in
 * ms (0 if he's mid-sentence or muted) so the UI can animate his mouth-grill.
 * Gated by the soundboard volume slider like every Sterling utterance —
 * 0 = a mute robot, in the Shop too.
 */
export function sterlingMurmur(text: string): number {
  const vol = voice.soundboardVolume;
  if (vol <= 0) return 0;
  ensure(); // resume on this gesture-driven path
  return sterlingBlips(text, vol);
}
