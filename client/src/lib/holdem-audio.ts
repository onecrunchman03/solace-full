// Synthesized Hold'em sounds — card-room quiet, not slot-floor loud: card
// swishes off the deck, chips clicking into the pot, the double knock of a
// check, a soft "your action" ping, and the pot sliding over.

import { playSfx, preloadSfx, sfxContext, sfxOut } from "./sfx";

// The synth fallbacks run on the SHARED sfx context and land on its master
// gain, so they obey the App-sounds slider like every recorded sound (this
// module used to build a private AudioContext wired straight to the speakers).
function ensure(): AudioContext | null {
  return sfxContext();
}

/** Where a synth voice connects: the master gain, else the bare output. */
function out(c: AudioContext): AudioNode {
  return sfxOut() ?? c.destination;
}

export function ensureHoldemAudio(): void {
  ensure();
  preloadSfx(["card-deal", "card-deal3", "card-flip", "card-muck", "chip-few", "chip-cascade"]);
}

function noiseSwish(c: AudioContext, at: number, from: number, to: number, dur: number, gain: number): void {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(out(c));
  src.start(at);
}

/** A card sliding off the deck (one per card; stagger for the flop). */
export function cardDeal(count = 1): void {
  playSfx(count >= 3 ? "card-deal3" : "card-deal", 0.6, () => {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    for (let i = 0; i < count; i++) {
      noiseSwish(c, t0 + i * 0.09, 1800, 5200, 0.09, 0.1);
    }
  });
}

/** Chips clicking into the pot (a bet, call, or raise). */
export function chipBet(quiet = false): void {
  playSfx("chip-few", quiet ? 0.4 : 0.55, synthChipBet);
}

function synthChipBet(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 2600 + Math.random() * 900;
    g.gain.setValueAtTime(0.07, t0 + i * 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.035 + 0.03);
    o.connect(g);
    g.connect(out(c));
    o.start(t0 + i * 0.035);
    o.stop(t0 + i * 0.035 + 0.04);
  }
}

/** The classic double table-knock: check. */
export function checkKnock(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  for (const dt of [0, 0.13]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(210, t0 + dt);
    o.frequency.exponentialRampToValueAtTime(140, t0 + dt + 0.07);
    g.gain.setValueAtTime(0.17, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.09);
    o.connect(g);
    g.connect(out(c));
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.11);
  }
}

/** Soft ping: the action is on YOU. */
export function yourTurn(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 987;
  g.gain.setValueAtTime(0.09, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  o.connect(g);
  g.connect(out(c));
  o.start(t0);
  o.stop(t0 + 0.32);
}

/** The pot slides your way — a chip cascade with a warm tail. */
export function potWin(): void {
  playSfx("chip-cascade", 0.7, synthPotWin);
}

function synthPotWin(): void {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  let t = 0;
  for (let i = 0; i < 9; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = 1700 + i * 130 + Math.random() * 150;
    g.gain.setValueAtTime(0.08, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.1);
    o.connect(g);
    g.connect(out(c));
    o.start(t0 + t);
    o.stop(t0 + t + 0.11);
    t += 0.045 + Math.random() * 0.02;
  }
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 523;
  g.gain.setValueAtTime(0.0001, t0 + 0.1);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  o.connect(g);
  g.connect(out(c));
  o.start(t0 + 0.1);
  o.stop(t0 + 0.85);
}
