// SURVIVORZ EFFECTS — what the facility's light fixtures DO: flicker, die when the
// power goes, come back bank by bank when it returns, and the red beacons that turn
// during a lockdown (docs/survivorz/EFFECTS.md step F4).
//
// THE ROOM OWNS THE FIXTURES; THE EFFECTS DRIVE THEM (EFFECTS.md §5: the room never
// wires effects in itself and keeps its own light count fixed). The room registers each
// fixture — its light, its glowing materials, its beam — and this changes only their
// intensities, never the number of lights.
//
// EVERY LEVEL IS A PURE FUNCTION OF TIME AND SEED: a flicker, a fluorescent tube
// striking, a bank coming on 0.8 s after the one before it. The server sends the event
// once (`zone.powered` with its seed and its time), and anybody who joins late computes
// the same state for "now" — no frame-by-frame randomness to drift between observers.
// Times here are in the effects' own clock (fx.now); the integration converts the
// server's (F7).
import * as THREE from "three";
import type { BeamHandle } from "./beams";

export type FlickerStyle = "steady" | "buzz" | "failing" | "dying";

const hash = (a: number, b: number) => {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (x: number) => x * x * (3 - 2 * x);
/** smooth value noise over time, 0..1 */
const wobble = (t: number, rate: number, seed: number) => {
  const x = t * rate, i = Math.floor(x), f = smooth(x - i);
  return hash(i, seed) * (1 - f) + hash(i + 1, seed) * f;
};

/** How bright a working fixture is right now, 0..1, by how it misbehaves. */
export function flicker(style: FlickerStyle, t: number, seed: number): number {
  switch (style) {
    case "steady":
      return 1;
    case "buzz":
      return 0.93 + 0.07 * wobble(t, 18, seed);
    case "failing": {
      // fine most of the time; every so often an episode of dropouts
      const win = Math.floor(t / 1.9), into = t - win * 1.9;
      const episode = hash(win, seed ^ 0x51) < 0.4 && into < 0.25 + hash(win, seed ^ 0x77) * 0.8;
      if (!episode) return 0.94 + 0.06 * wobble(t, 14, seed);
      const slot = Math.floor(t / 0.055);
      return hash(slot, seed) > 0.42 ? 0.95 : 0.06;
    }
    case "dying": {
      // mostly a dim orange-ish glow, sputtering, now and then a surge
      const slot = Math.floor(t / 0.08);
      const surge = hash(Math.floor(t / 2.6), seed ^ 0x3c) < 0.3 && (t % 2.6) < 0.45;
      if (surge) return hash(slot, seed) > 0.25 ? 0.9 : 0.15;
      return hash(slot, seed) > 0.7 ? 0.32 : hash(slot, seed ^ 0x9) > 0.5 ? 0.12 : 0.02;
    }
  }
}

/** A fluorescent tube striking: a flash, dark, a few stutters, then on. `dt` seconds since
 *  its power came. 0 before it starts. */
export function strike(dt: number, seed: number): number {
  if (dt < 0) return 0;
  if (dt < 0.07) return 0.9; // the first flash
  if (dt < 0.2) return 0;
  const settle = 0.55 + hash(1, seed) * 0.7; // some tubes catch fast, some don't
  if (dt > 0.2 + settle) return 1;
  const slot = Math.floor((dt - 0.2) / 0.05);
  const p = (dt - 0.2) / settle; // more and more often on
  return hash(slot, seed) < 0.25 + 0.7 * p ? 0.85 + 0.15 * p : 0.03;
}

/** The power going: a sag and a last flicker, then nothing. `dt` seconds since it went. */
export function cut(dt: number, seed: number): number {
  if (dt < 0) return 1;
  if (dt > 0.35) return 0;
  const slot = Math.floor(dt / 0.04);
  return (1 - dt / 0.35) * (hash(slot, seed) > 0.35 ? 1 : 0.2);
}

/** A power dip (a brownout): the zone's lights sag to a third and stutter for `dur` seconds,
 *  then struggle back up. A multiplier on the fixture's level, 1 outside the dip. `dt`
 *  seconds since it started. The power never goes, so the emergency lights don't come on. */
export function dip(dt: number, dur: number, seed: number): number {
  if (dt < 0 || dt > dur + 0.45) return 1;
  if (dt < 0.06) return 1 - (dt / 0.06) * 0.7;
  if (dt < dur) {
    const sag = 0.24 + 0.2 * wobble(dt, 3.5, seed);
    // the sagging tubes catch at the mains now and then: a stutter, a drop out
    const slot = Math.floor(dt / 0.05);
    const h = hash(slot, seed ^ 0x2d);
    return h < 0.12 ? 0.06 : h > 0.9 ? sag + 0.35 : sag;
  }
  // coming back: up in stutters, a touch too bright for an instant, then settled
  const u = (dt - dur) / 0.45;
  const slot = Math.floor((dt - dur) / 0.045);
  return hash(slot, seed ^ 0x61) < 0.3 + 0.6 * u ? Math.min(1.12, 0.6 + 0.6 * u) : 0.3;
}

/** An emergency light (a battery unit) after its zone's power went: dark for a moment while
 *  it switches over, a clunk on, then a steady low hum. `dt` seconds since the power went. */
export function emergencyOn(dt: number, seed: number): number {
  const delay = 0.45 + hash(3, seed) * 0.5;
  if (dt < delay) return 0;
  if (dt < delay + 0.06) return 0.7;
  if (dt < delay + 0.12) return 0.15;
  return 0.93 + 0.07 * wobble(dt, 6, seed ^ 0x77);
}

export interface FixtureSpec {
  id: string;
  /** which power zone feeds it */
  zone?: string;
  /** its bank in that zone: banks come on in order when the power returns */
  bank?: number;
  light?: THREE.Light;
  /** materials that glow with it (the panel, the bulb) */
  emissive?: THREE.MeshStandardMaterial[];
  beam?: BeamHandle;
  /** how a working fixture misbehaves */
  style?: FlickerStyle;
  /** a lockdown beacon: dark until a lockdown, then it turns */
  beacon?: { axis?: THREE.Vector3; rpm?: number };
  /** an emergency light: dark while its zone has power, on when the power goes (and on in a
   *  zone the generator isn't feeding: SURVIVORZ.md's zones on emergency power) */
  emergency?: boolean;
  seed?: number;
}

interface Fixture extends FixtureSpec {
  base: { light: number; emissive: number[]; beam: number };
  level: number;
  beamDir?: THREE.Vector3;
}

/** seconds between one bank coming on and the next */
export const BANK_GAP = 0.8;

export class Fixtures {
  private list = new Map<string, Fixture>();
  private power = new Map<string, { on: boolean; t0: number; seed: number }>();
  private lockdown: { on: boolean; t0: number } = { on: false, t0: 0 };
  private dips = new Map<string, { t0: number; dur: number; seed: number }>();

  /** Take a fixture over. Its CURRENT intensities are what "fully on" means. */
  add(f: FixtureSpec): void {
    this.list.set(f.id, {
      ...f, style: f.style ?? "steady", seed: f.seed ?? hashStr(f.id),
      base: { light: f.light?.intensity ?? 0, emissive: (f.emissive ?? []).map((m) => m.emissiveIntensity), beam: f.beam?.spec.intensity ?? 1 },
      level: 1, beamDir: f.beam?.spec.dir.clone(),
    });
  }

  remove(id: string): void {
    this.list.delete(id);
  }

  /** The power in a zone going off, or coming back (bank by bank from t0). */
  setPower(zone: string, on: boolean, t0: number, seed: number): void {
    this.power.set(zone, { on, t0, seed });
  }

  /** A power dip in a zone from t0 for `dur` seconds (the director's brownout). */
  setDip(zone: string, t0: number, dur: number, seed: number): void {
    this.dips.set(zone, { t0, dur, seed });
  }

  setLockdown(on: boolean, t0: number): void {
    this.lockdown = { on, t0 };
  }

  setStyle(id: string, style: FlickerStyle): void {
    const f = this.list.get(id);
    if (f) f.style = style;
  }

  /** The level a fixture is at (for the checks and the readouts). */
  level(id: string): number {
    return this.list.get(id)?.level ?? 0;
  }

  update(now: number): void {
    for (const f of this.list.values()) {
      let level: number;
      if (f.beacon) {
        level = this.lockdown.on ? Math.min(1, (now - this.lockdown.t0) / 0.3) : 0;
        // the beam turns round the beacon's axis, and the room goes red each time it sweeps
        // past the way the beacon faces
        const a = ((now - this.lockdown.t0) * (f.beacon.rpm ?? 40) * Math.PI) / 30;
        if (f.beam && f.beamDir) {
          const axis = f.beacon.axis ?? new THREE.Vector3(0, 1, 0);
          f.beam.set({ dir: f.beamDir.clone().applyAxisAngle(axis, a) });
        }
        level *= 0.35 + 0.65 * Math.max(0, Math.cos(a));
      } else if (f.emergency) {
        const p = f.zone ? this.power.get(f.zone) : undefined;
        const seed = ((p?.seed ?? 0) ^ (f.seed ?? 0)) >>> 0;
        level = p && !p.on ? emergencyOn(now - p.t0, seed) * flicker(f.style === "dying" || f.style === "failing" ? f.style : "steady", now, f.seed ?? 0) : 0;
      } else {
        const p = f.zone ? this.power.get(f.zone) : undefined;
        let power = 1;
        if (p) {
          const seed = (p.seed ^ (f.seed ?? 0)) >>> 0;
          if (p.on) {
            // its bank's turn, plus a little of its own: tubes in a bank don't catch together
            const start = p.t0 + (f.bank ?? 0) * BANK_GAP + hash(7, seed) * 0.25;
            power = strike(now - start, seed);
          } else power = cut(now - p.t0, seed);
        }
        const d = f.zone ? this.dips.get(f.zone) : undefined;
        if (d) power *= dip(now - d.t0, d.dur, (d.seed ^ (f.seed ?? 0)) >>> 0);
        level = power > 0 ? power * flicker(f.style ?? "steady", now, f.seed ?? 0) : 0;
      }
      f.level = level;
      if (f.light) f.light.intensity = f.base.light * level;
      f.emissive?.forEach((m, i) => { m.emissiveIntensity = f.base.emissive[i] * level; });
      f.beam?.set({ intensity: f.base.beam * level });
    }
  }

  clear(): void {
    // hand every fixture back as it was
    for (const f of this.list.values()) {
      if (f.light) f.light.intensity = f.base.light;
      f.emissive?.forEach((m, i) => { m.emissiveIntensity = f.base.emissive[i]; });
      if (f.beamDir) f.beam?.set({ dir: f.beamDir, intensity: f.base.beam });
    }
    this.list.clear();
    this.power.clear();
    this.dips.clear();
    this.lockdown = { on: false, t0: 0 };
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
