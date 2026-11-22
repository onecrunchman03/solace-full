// EGO's synthesized sounds. All synth, no assets — the goop gulp, the
// submarine-hull creak of a head at critical mass, and the pop (a party
// balloon the size of a mistake). House rule: cheap, built off the shared
// sfx context so they obey the app volume.

import { sfxContext, sfxOut } from "../lib/sfx";

/** Downing the shot: a thick, reluctant triple-glug — goop, not liquor. */
export function egoGulpSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  // three slow descending glugs, each fatter than a drink's
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.22;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(240 - i * 30, at);
    o.frequency.exponentialRampToValueAtTime(60 - i * 8, at + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.4 * gain, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.22);
  }
  // …and a viscous settle: dark noise, quickly gone
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  const ng = c.createGain();
  ng.gain.value = 0.2 * gain;
  n.connect(lp).connect(ng).connect(out);
  n.start(t + 0.62);
}

/** One creak of a head under pressure — a low stressed groan with a resonant
 *  edge, pitched by `strain` (0..1) so the last ones are higher and shorter,
 *  like a hull about to give. Call it repeatedly through the creak window. */
export function egoCreakSynth(strain = 0.5, gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  const dur = 0.5 - 0.25 * strain;
  const o = c.createOscillator();
  o.type = "sawtooth";
  const f0 = 70 + 110 * strain;
  o.frequency.setValueAtTime(f0, t);
  // the groan bends upward — material losing an argument
  o.frequency.linearRampToValueAtTime(f0 * (1.3 + 0.5 * strain), t + dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 300 + 500 * strain;
  bp.Q.value = 9;
  // a slow rattle under it — the strained-rope tremolo
  const lfo = c.createOscillator();
  lfo.frequency.value = 18 + 22 * strain;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3 * gain * (0.5 + 0.5 * strain), t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lfo.connect(lfoG).connect(g.gain);
  o.connect(bp).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

/** The pop. A deep balloon burst (noise slammed through a falling lowpass over
 *  a pitch-dropped thump) with a bright confetti tick on top — festive, and
 *  final. */
export function egoPopSynth(gain = 1): void {
  const c = sfxContext();
  const out = sfxOut();
  if (!c || !out) return;
  const t = c.currentTime;
  // the burst
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const k = 1 - i / d.length;
    d[i] = (Math.random() * 2 - 1) * k * k;
  }
  n.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(9000, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.4);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.9 * gain, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  n.connect(lp).connect(ng).connect(out);
  n.start(t);
  // the thump under it
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
  const og = c.createGain();
  og.gain.setValueAtTime(0.6 * gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.5);
  // …and the confetti: a handful of bright ticks scattered over half a second
  for (let i = 0; i < 7; i++) {
    const at = t + 0.06 + Math.random() * 0.5;
    const tick = c.createOscillator();
    tick.type = "triangle";
    tick.frequency.value = 1800 + Math.random() * 2600;
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.1 * gain, at);
    tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    tick.connect(tg).connect(out);
    tick.start(at);
    tick.stop(at + 0.1);
  }
}
