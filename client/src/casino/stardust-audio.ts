// STAR DUST's synthesized fallbacks. House rule (Phase 33): every sound tries
// its real file first and falls back to synth, and the fallbacks are never
// deleted. The pop's real file is Josh's own pick — fart-with-reverb.mp3,
// mastered into the bank as sfx/stardust-pop.ogg — so the synth here only ever
// plays if that file hasn't decoded yet, which must still not mean silence at
// the funniest moment the hall has.

import { sfxContext, sfxOut } from "../lib/sfx";

/** Huffing from the canister: the valve's metal click, then a rising hiss
 *  dragged through a bandpass — compressed gas leaving a nozzle into a pair of
 *  lungs — with a faint ring off the can. */
export function huffSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  // the valve click — a short bright noise tick
  const click = c.createBufferSource();
  const cb = c.createBuffer(1, Math.floor(c.sampleRate * 0.03), c.sampleRate);
  const cd = cb.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cd.length);
  click.buffer = cb;
  const chp = c.createBiquadFilter();
  chp.type = "highpass";
  chp.frequency.value = 2400;
  const cg = c.createGain();
  cg.gain.value = 0.5 * gain;
  click.connect(chp).connect(cg).connect(out);
  click.start(t);
  // the inhale: noise through a bandpass that climbs — a hiss becoming a gasp
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.95), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(500, t + 0.03);
  bp.frequency.exponentialRampToValueAtTime(2600, t + 0.8);
  bp.Q.value = 3.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.38 * gain, t + 0.2);
  ng.gain.setValueAtTime(0.38 * gain, t + 0.62);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
  n.connect(bp).connect(ng).connect(out);
  n.start(t + 0.03);
  // the can rings, just barely
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.value = 2734;
  const og = c.createGain();
  og.gain.setValueAtTime(0.06 * gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

/** The pop, if the real file isn't warm: two detuned low saws with a fast
 *  tremolo through a falling lowpass — a brap with a room behind it. */
export function gasPopSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + 0.85);
  const g = c.createGain();
  g.gain.setValueAtTime(0.55 * gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  // the flap: a fast tremolo IS the raspberry
  const trem = c.createOscillator();
  trem.frequency.setValueAtTime(34, t);
  trem.frequency.exponentialRampToValueAtTime(18, t + 0.8);
  const tg = c.createGain();
  tg.gain.value = 0.45;
  trem.connect(tg).connect(g.gain);
  for (const f of [62, 93]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.8);
    o.connect(lp);
    o.start(t);
    o.stop(t + 1.0);
  }
  lp.connect(g).connect(out);
  trem.start(t);
  trem.stop(t + 1.0);
}
