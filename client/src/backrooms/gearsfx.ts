// Gear sounds — the things your hands do.
//
// Same doctrine as the main app's sfx.ts: TRY THE FILE FIRST
// (/sfx/br-<id>.ogg, droppable later from the ElevenLabs pipeline), fall back
// to a synth voice that is good enough to ship today. Everything rides the
// shared game bus (ambience.ts gameOut), so the pause menu's output slider
// governs it and leaving the run tears it down with the rest.
//
// Sync doctrine (Phase 33): each sound anchors to the VISIBLE moment — the
// click fires on the toggle frame, the hiss lives exactly as long as paint is
// leaving the can, the charge lands when the battery is consumed.

import { gameCtx, gameOut } from "./ambience";

export type GearSound =
  | "flashlight-on"
  | "flashlight-off"
  | "spray"
  | "battery"
  | "pills"
  | "relic"
  | "radio-on"
  | "radio-off"
  | "drink"
  | "door-open";

const FILE: Record<GearSound, string> = {
  "flashlight-on": "/sfx/br-flashlight-on.ogg",
  "flashlight-off": "/sfx/br-flashlight-off.ogg",
  spray: "/sfx/br-spray.ogg",
  battery: "/sfx/br-battery.ogg",
  pills: "/sfx/br-pills.ogg",
  relic: "/sfx/br-relic.ogg",
  "radio-on": "/sfx/br-radio-on.ogg",
  "radio-off": "/sfx/br-radio-off.ogg",
  drink: "/sfx/br-drink.ogg", // no file yet — the synth gulps below carry it
  // Josh's own recording, for the doors that lead between levels. Not gear,
  // but it wants exactly what this module already does: warmed on entry,
  // played through the game bus, governed by the pause menu's slider.
  "door-open": "/sfx/br-door-open.ogg",
};

const buffers = new Map<GearSound, AudioBuffer | null>(); // null = no file, use synth
const pending = new Set<GearSound>();

function warm(id: GearSound): void {
  if (buffers.has(id) || pending.has(id)) return;
  pending.add(id);
  const c = gameCtx();
  fetch(FILE[id])
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => buffers.set(id, buf))
    .catch(() => buffers.set(id, null))
    .finally(() => pending.delete(id));
}

/** Pre-fetch the bank on entry so the first click isn't the synth fallback
 *  (the lesson from the main app: lazy per-sound loads always lose the race). */
export function warmGearSfx(): void {
  for (const id of Object.keys(FILE) as GearSound[]) warm(id);
}

function playFile(id: GearSound, gain: number): boolean {
  const buf = buffers.get(id);
  if (!buf) return false;
  const c = gameCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(gearOut());
  src.start();
  return true;
}

// ---- Synth voices ----------------------------------------------------------

/** Shared noise source — hiss, rattles and static all shape the same grain. */
let noiseBuf: AudioBuffer | null = null;
function noise(): AudioBuffer {
  const c = gameCtx();
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A switch click: a hard little transient with a body resonance — the sound
 *  of a plastic slider hitting its stop. `up` raises the pitch (ON). */
function synthClick(up: boolean, level = 0.5): void {
  const c = gameCtx();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise();
  src.playbackRate.value = 1.4;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = up ? 2600 : 1900;
  bp.Q.value = 1.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.055);
  src.connect(bp);
  bp.connect(g);
  g.connect(gearOut());
  src.start(t, Math.random());
  src.stop(t + 0.08);
  // The plastic "tock" under the transient.
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(up ? 480 : 360, t);
  osc.frequency.exponentialRampToValueAtTime(up ? 180 : 130, t + 0.05);
  const og = c.createGain();
  og.gain.setValueAtTime(level * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.0008, t + 0.06);
  osc.connect(og);
  og.connect(gearOut());
  osc.start(t);
  osc.stop(t + 0.07);
}

/** Battery: a rising electrical whine that lands on a contact clunk. */
function synthCharge(): void {
  const c = gameCtx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(1250, t + 0.42);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.42);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.06);
  g.gain.setValueAtTime(0.14, t + 0.34);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.46);
  osc.connect(lp);
  lp.connect(g);
  g.connect(gearOut());
  osc.start(t);
  osc.stop(t + 0.5);
  // Contacts seating.
  const cl = c.createBufferSource();
  cl.buffer = noise();
  const clf = c.createBiquadFilter();
  clf.type = "lowpass";
  clf.frequency.value = 900;
  const cg = c.createGain();
  cg.gain.setValueAtTime(0, t + 0.4);
  cg.gain.linearRampToValueAtTime(0.4, t + 0.412);
  cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.52);
  cl.connect(clf);
  clf.connect(cg);
  cg.connect(gearOut());
  cl.start(t + 0.4, Math.random());
  cl.stop(t + 0.55);
}

/** Pill bottle: four or five plastic-on-plastic rattles over a shake. */
function synthShake(): void {
  const c = gameCtx();
  const t0 = c.currentTime;
  const hits = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < hits; i++) {
    const t = t0 + i * (0.055 + Math.random() * 0.05);
    const src = c.createBufferSource();
    src.buffer = noise();
    src.playbackRate.value = 1.6 + Math.random() * 0.6;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400 + Math.random() * 2600;
    bp.Q.value = 2.2;
    const g = c.createGain();
    const lvl = 0.16 + Math.random() * 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(gearOut());
    src.start(t, Math.random());
    src.stop(t + 0.07);
  }
}

/** Relic pickup: a bright shimmer arpeggio — the one MAGICAL sound in a game
 *  with no magic. Deliberately unlike anything else in the soundscape. */
function synthRelic(): void {
  const c = gameCtx();
  const t0 = c.currentTime;
  const NOTES = [659.3, 987.8, 1318.5, 1975.5]; // E5 B5 E6 B6 — open and clean
  NOTES.forEach((f, i) => {
    const t = t0 + i * 0.075;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);
    // A detuned twin gives it the glassy beat of a struck bell.
    const osc2 = c.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = f * 1.005;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.055, t + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
    osc.connect(g);
    osc2.connect(g2);
    g.connect(gearOut());
    g2.connect(gearOut());
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.35);
    osc2.stop(t + 1.15);
  });
  // Air shimmer over the top.
  const src = c.createBufferSource();
  src.buffer = noise();
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5200;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.05, t0 + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.1);
  src.connect(hp);
  hp.connect(g);
  g.connect(gearOut());
  src.start(t0, Math.random() * 0.4);
  src.stop(t0 + 1.2);
}

/** Releasing the PTT bar: just the switch letting go. A tiny, dry, high tick —
 *  no body, no tail. Josh on the old one: "that sounds like a drum", which it
 *  did, because it carried synthClick's 360Hz plastic tock plus a fifth of a
 *  second of carrier crackle. A real radio's key-up is loud; the release is
 *  almost nothing, and that asymmetry is most of what sells it as a button. */
function synthKeyRelease(): void {
  const c = gameCtx();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise();
  src.playbackRate.value = 1.9;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.13, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0006, t + 0.028);
  src.connect(hp);
  hp.connect(g);
  g.connect(gearOut());
  src.start(t, Math.random());
  src.stop(t + 0.05);
}

/** Radio: the squelch. `on` = keying up (click + burst opening), off = the
 *  soft release of the bar (see synthKeyRelease). */
function synthSquelch(on: boolean): void {
  if (!on) {
    synthKeyRelease();
    return;
  }
  const c = gameCtx();
  const t = c.currentTime;
  synthClick(on, 0.3);
  const src = c.createBufferSource();
  src.buffer = noise();
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.9;
  const g = c.createGain();
  const dur = on ? 0.12 : 0.2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(on ? 0.11 : 0.16, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(gearOut());
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
  if (on) {
    // The confirmation beep every cheap radio makes when the channel opens.
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1180;
    const og = c.createGain();
    og.gain.setValueAtTime(0, t + 0.03);
    og.gain.linearRampToValueAtTime(0.045, t + 0.045);
    og.gain.setValueAtTime(0.045, t + 0.1);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    osc.connect(og);
    og.connect(gearOut());
    osc.start(t + 0.03);
    osc.stop(t + 0.16);
  }
}

/** Three quick gulps — a throat is a lowpassed pulse with a falling pitch. */
function synthDrink(): void {
  const c = gameCtx();
  const t0 = c.currentTime;
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.22;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(210 - i * 18, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.13);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(gearOut());
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

/** One-shot gear sound. */
/** The level the next gear voice plays at — 1 for your own, less for a
 *  peer's at a distance. Set only for the length of one gearSfx call. */
let voiceLevel = 1;
/** Where a voice connects: the game's output, through a fader when this
 *  voice is somebody else's (released once it has had time to finish). */
function gearOut(): AudioNode {
  if (voiceLevel >= 0.999) return gameOut();
  const g = gameCtx().createGain();
  g.gain.value = voiceLevel;
  g.connect(gameOut());
  setTimeout(() => g.disconnect(), 4_000);
  return g;
}

/** A gear sound — `level` 1 for your own, less for a peer's at a distance. */
export function gearSfx(id: GearSound, level = 1): void {
  if (level <= 0.01) return;
  voiceLevel = level;
  try {
    gearSfxAt(id);
  } finally {
    voiceLevel = 1;
  }
}

function gearSfxAt(id: GearSound): void {
  warm(id);
  // Josh's call (July 2026): the flashlight toggle and the walkie's OFF are
  // JUST A CLICK — no foley, no flourish. The files stay on disk but these
  // ids never play them; the walkie's power-ON keeps its beep (the "I'm
  // online" voice) and keying keeps its squelch.
  if (id === "flashlight-on" || id === "flashlight-off" || id === "radio-off") {
    synthClick(id !== "flashlight-off", 0.45);
    return;
  }
  const level = id === "relic" ? 0.9 : 0.7;
  if (playFile(id, level)) return;
  switch (id) {
    case "battery":
      synthCharge();
      break;
    case "pills":
      synthShake();
      break;
    case "relic":
      synthRelic();
      break;
    case "radio-on":
      synthSquelch(true);
      break;
    case "drink":
      synthDrink();
      break;
    case "spray":
      break; // handled by the sustained loop below
  }
}

// ---- The spray hiss (sustained) --------------------------------------------
// A can that's actually spraying makes noise the WHOLE time the button is
// down — so this is a loop with fades, not a one-shot. If the ogg exists it
// loops seamlessly; otherwise it's filtered noise with a little wobble, which
// is what an aerosol is anyway.

type Hiss = { out: GainNode; stop: () => void };
let hiss: Hiss | null = null;

/** One aerosol hiss at `level` (0..1). Yours, or a peer's (each peer holds
 *  their own, its level following their distance and the walls between). */
function makeHiss(level: number): Hiss {
  const c = gameCtx();
  const out = c.createGain();
  out.gain.setValueAtTime(0, c.currentTime);
  out.gain.linearRampToValueAtTime(level, c.currentTime + 0.04);
  out.connect(gameOut());
  const buf = buffers.get("spray");
  const src = c.createBufferSource();
  src.buffer = buf ?? noise();
  src.loop = true;
  if (buf) {
    const g = c.createGain();
    g.gain.value = 0.8;
    src.connect(g);
    g.connect(out);
  } else {
    // Synth aerosol: bandpassed noise with a slow flutter (the ball rattling
    // in the can shows up as level movement, not pitch).
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 0.55;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const g = c.createGain();
    g.gain.value = 0.2;
    const lfo = c.createOscillator();
    lfo.frequency.value = 7.5;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.045;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    lfo.start();
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start();
    return {
      out,
      stop: () => {
        out.gain.setTargetAtTime(0, c.currentTime, 0.03);
        setTimeout(() => {
          try {
            src.stop();
            lfo.stop();
          } catch {
            /* stopped */
          }
          out.disconnect();
        }, 180);
      },
    };
  }
  src.start();
  return {
    out,
    stop: () => {
      out.gain.setTargetAtTime(0, c.currentTime, 0.03);
      setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* stopped */
        }
        out.disconnect();
      }, 180);
    },
  };
}

export function startSprayHiss(): void {
  if (hiss) return;
  hiss = makeHiss(1);
}

export function stopSprayHiss(): void {
  hiss?.stop();
  hiss = null;
}

// ---- Other people's cans (Backrooms law 5, Oct 2026) ----------------------
// A peer spraying used to be one burst at most — the synth spray has no
// one-shot — so the room never heard a can held down. Now each spraying peer
// in earshot holds a hiss of their own, faded by distance and walls.
const peerHiss = new Map<number, Hiss & { level: number }>();
/** Set a peer's spray: a level above ~0 starts or re-levels it, 0 stops it. */
export function peerSprayHiss(id: number, level: number): void {
  const h = peerHiss.get(id);
  if (level <= 0.01) {
    if (h) {
      h.stop();
      peerHiss.delete(id);
    }
    return;
  }
  if (!h) {
    peerHiss.set(id, { ...makeHiss(level), level });
    return;
  }
  // re-levelled on CHANGE, never per frame (the frame loop calls this every
  // frame for every spraying peer)
  if (Math.abs(level - h.level) < 0.03) return;
  h.level = level;
  h.out.gain.setTargetAtTime(level, h.out.context.currentTime, 0.08);
}
/** Leaving the level: silence every peer's can. */
export function stopAllPeerSprays(): void {
  for (const h of peerHiss.values()) h.stop();
  peerHiss.clear();
}
