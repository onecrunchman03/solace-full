// SLORP's synthesized fallbacks. The house rule (Phase 33): every game sound
// tries its real file first and falls back to synth — the fallbacks are never
// deleted, because a missing or not-yet-decoded file must never mean silence
// at the moment something is happening to you.
//
// All three are built from the shared sfx context so they obey the app's own
// volume slider, and all three are cheap: a trip is already paying for two
// fullscreen passes.

import { sfxContext, sfxOut } from "../lib/sfx";

/** Swallowing it: a wet gulp and a chemical shiver on the way down. */
export function slorpDrinkSynth(): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  // the gulp — a short pitched-down thud
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.32);
  // …and the shiver: a filtered noise tail that rises where it should fall
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(400, t + 0.1);
  bp.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
  bp.Q.value = 6;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t + 0.1);
  ng.gain.exponentialRampToValueAtTime(0.18, t + 0.25);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  n.connect(bp).connect(ng).connect(out);
  n.start(t + 0.1);
}

/** The noise you start making in stage three. Wet, low, and not a word. */
export function slorpGurgleSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sawtooth";
  const f0 = 90 + Math.random() * 50;
  o.frequency.setValueAtTime(f0, t);
  // the lurch: it slides somewhere it shouldn't and comes back wrong
  o.frequency.linearRampToValueAtTime(f0 * 0.55, t + 0.18);
  o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.34);
  // a slow tremolo IS the gurgle
  const lfo = c.createOscillator();
  lfo.frequency.value = 11 + Math.random() * 9;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * gain, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  lfo.connect(lfoG).connect(g.gain);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.45);
  lfo.stop(t + 0.45);
}

/** Coming apart: a wet burst with a low thump under it. */
export function slorpBurstSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  // the thump
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.4);
  const og = c.createGain();
  og.gain.setValueAtTime(0.7 * gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.52);
  // the wet part: bright noise slammed through a falling lowpass
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.8), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const k = 1 - i / d.length;
    d[i] = (Math.random() * 2 - 1) * k * k;
  }
  n.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(7000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.55);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.85 * gain, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
  n.connect(lp).connect(ng).connect(out);
  n.start(t);
}
