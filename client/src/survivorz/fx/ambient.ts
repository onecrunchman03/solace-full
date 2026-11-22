// SURVIVORZ EFFECTS — the facility breathing (docs/survivorz/EFFECTS.md step F4):
// steam from pipes, drips with ripples, sparking wiring, fog in the tunnels, bubbles
// in the specimen tanks, and dust drifting in the light beams.
//
// Each is an EMITTER placed on one of the room's anchors (the Vault Lobby's
// `vault-lobby-anchors.json`: a pipe, a ceiling leak, a broken panel, a tank) and kept
// running with the handle `fx.emit` returns, until the leak is fixed or the power cut.
// Like every recipe here they draw only from their own seeded rng, so every observer's
// steam puffs the same way. They are meant to run all day: each one holds a small,
// steady share of the particle budget, never a burst it has to wait to come down from.
import * as THREE from "three";
import type { Effect, Emitter } from "./system";
import type { BeamHandle } from "./beams";
import { SPRITE } from "./sprites";
import { inCone, pick, range } from "./rng";

const v3 = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---- steam from a pipe --------------------------------------------------------------------
export interface SteamP {
  /** the crack in the pipe, and which way it blows */
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** how hard: a weep (0.3) to a split pipe (1.5) */
  force?: number;
  /** it surges now and then, with a louder hiss */
  bursts?: boolean;
}
export function steam(p: SteamP): Emitter {
  const force = p.force ?? 0.8;
  const dir = p.dir.clone().normalize();
  let next = 0, burstUntil = -1, nextBurst = 2;
  let t = 0;
  return ({ fx, rng }, dt) => {
    t += dt;
    const sheets = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    if (!sheets.length) return false;
    if (p.bursts && t > nextBurst) {
      burstUntil = t + range(rng, 0.5, 1.1);
      nextBurst = t + range(rng, 4, 9);
    }
    const surge = t < burstUntil ? 2.2 : 1;
    next -= dt;
    while (next <= 0) {
      next += 0.07 / (force * surge);
      const speed = range(rng, 1.4, 2.6) * force * surge;
      fx.spawn(pick(rng, sheets), {
        pos: p.pos, vel: inCone(rng, dir, 0.18, v3()).multiplyScalar(speed), life: range(rng, 1, 1.7) * (0.7 + 0.3 * surge),
        size: [0.06 * force, range(rng, 0.5, 0.9) * force * (0.8 + 0.2 * surge)], rot: range(rng, 0, 6.28), spin: range(rng, -1, 1),
        // steam scatters whatever light there is: a little of it glows, or it vanishes in a dim room
        color: [2.1, 2.12, 2.16], alpha: 0.45, glow: 0.2, gravity: -0.6, drag: 2.2, fadeIn: 0.05, fadeOut: 0.6,
        frame: { kind: "life", from: Math.floor(range(rng, 6, 16)) },
      });
    }
    // condensate: now and then a drop runs off the pipe
    if (rng() < dt * 0.6) {
      fx.spawn("sprites", { pos: p.pos, vel: new THREE.Vector3(0, -0.2, 0), life: 1.2, size: [0.008, 0.008], stretch: 0.01, frame: { kind: "fixed", frame: SPRITE.drop }, color: [0.5, 0.55, 0.6], gravity: 9.8, fadeIn: 0, fadeOut: 0.05, dieOnLand: true });
    }
    return true;
  };
}

// ---- a ceiling drip, and the ripples where it lands ------------------------------------------
export interface DripsP {
  /** where it drips from (the ceiling, a pipe joint) */
  from: THREE.Vector3;
  /** the floor or puddle under it */
  floorY: number;
  /** drops a second */
  rate?: number;
  /** landing in standing water: ripples. On a dry floor: a small splash only */
  puddle?: boolean;
}
export function drips(p: DripsP): Emitter {
  const rate = p.rate ?? 0.8;
  // a drip is regular, more or less: the next one forms as the last falls
  let next = 0.3;
  return ({ fx, rng }, dt) => {
    next -= dt;
    while (next <= 0) {
      next += (1 / rate) * range(rng, 0.75, 1.3);
      fx.spawn("sprites", {
        pos: p.from.clone().add(new THREE.Vector3(range(rng, -0.01, 0.01), 0, range(rng, -0.01, 0.01))), vel: new THREE.Vector3(0, -0.05, 0),
        life: 4, size: [0.012, 0.012], stretch: 0.012, frame: { kind: "fixed", frame: SPRITE.drop }, color: [0.62, 0.68, 0.74],
        gravity: 9.8, floorY: p.floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.02,
        onLand: (at) => {
          const ground = new THREE.Vector3(at.x, p.floorY + 0.003, at.z);
          if (p.puddle) {
            // two rings spreading, the second smaller and later
            for (const [delay, s1, a] of [[0, 0.42, 0.55], [0.18, 0.26, 0.4]] as const) {
              fx.spawn("sprites", {
                pos: ground, delay, life: 1.1, size: [0.02, s1], flat: true, rot: range(rng, 0, 6.28),
                frame: { kind: "fixed", frame: SPRITE.ring }, color: [0.62, 0.68, 0.74], alpha: a, fadeIn: 0, fadeOut: 0.8,
              });
            }
          }
          // the crown: a few tiny drops thrown up
          for (let i = 0; i < (p.puddle ? 4 : 3); i++) {
            fx.spawn("sprites", {
              pos: ground, vel: inCone(rng, UP, 0.7, v3()).multiplyScalar(range(rng, 0.4, 0.9)), life: 0.5, size: [0.005, 0.005],
              frame: { kind: "fixed", frame: SPRITE.drop }, color: [0.62, 0.68, 0.74], gravity: 9.8, floorY: p.floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.1,
            });
          }
        },
      });
    }
    return true;
  };
}

// ---- broken wiring, sparking ---------------------------------------------------------------
export interface WireP {
  /** the bare end */
  pos: THREE.Vector3;
  /** roughly which way the sparks fall from it (down a wall, out of a panel) */
  dir?: THREE.Vector3;
  floorY?: number;
  /** how often it crackles: a nervous wire (2) to an occasional one (0.3) */
  rate?: number;
}
export function sparkingWire(p: WireP): Emitter {
  const rate = p.rate ?? 0.7;
  const dir = (p.dir ?? new THREE.Vector3(0, -1, 0)).clone().normalize();
  let next = 0.4;
  return ({ fx, rng }, dt) => {
    next -= dt;
    while (next <= 0) {
      next += range(rng, 0.25, 2.2) / rate;
      const big = rng() < 0.18;
      const n = big ? Math.round(range(rng, 18, 30)) : Math.round(range(rng, 4, 10));
      for (let i = 0; i < n; i++) {
        fx.spawn("sprites", {
          pos: p.pos, vel: inCone(rng, dir, big ? 1.2 : 0.8, v3()).multiplyScalar(range(rng, 1, big ? 5 : 3)), life: range(rng, 0.3, big ? 1.1 : 0.7),
          size: [0.012, 0.007], stretch: 0.035, frame: { kind: "fixed", frame: SPRITE.spark }, glow: 1, color: [2.2, 1.9, 1.3], colorEnd: [1.5, 0.5, 0.1],
          gravity: 9.8, drag: 0.8, floorY: p.floorY, bounce: 0.35, fadeIn: 0, fadeOut: 0.5,
        });
      }
      // the arc itself, too quick to see as more than a jag of blue-white
      fx.spawn("sprites", {
        pos: p.pos, life: big ? 0.1 : 0.05, size: [big ? 0.3 : 0.16, big ? 0.3 : 0.16], rot: range(rng, 0, 6.28),
        frame: { kind: "fixed", frame: SPRITE.arc }, glow: 1, color: [1.6, 1.9, 2.6], fadeIn: 0, fadeOut: 0.6,
      });
      fx.spawn("sprites", { pos: p.pos, life: big ? 0.12 : 0.06, size: [big ? 0.25 : 0.12, big ? 0.25 : 0.12], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [1.4, 1.7, 2.4], fadeIn: 0, fadeOut: 0.8 });
      // its light: the spare's, or nothing if a fight has the pool busy
      fx.flash("spare", p.pos.clone().addScaledVector(dir, -0.15), big ? 8 : 3, big ? 0.12 : 0.06, 0xb8d4ff, big ? 5 : 3);
      // and a breath of smoke off the burnt insulation after a big one
      if (big && fx.has("smoke-wisp-a")) {
        fx.spawn("smoke-wisp-a", { pos: p.pos, vel: new THREE.Vector3(0, 0.3, 0), life: 2, delay: 0.1, size: [0.1, 0.5], rot: range(rng, 0, 6.28), color: [0.4, 0.4, 0.4], alpha: 0.35, drag: 1, fadeIn: 0.1, fadeOut: 0.6, frame: { kind: "life", from: 14 } });
      }
    }
    return true;
  };
}

// ---- fog lying in a tunnel -------------------------------------------------------------------
export interface FogP {
  /** the space it fills: a box on the floor */
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** 0..1 */
  density?: number;
  color?: [number, number, number];
}
export function fog(p: FogP): Emitter {
  const density = p.density ?? 0.6;
  const size = p.max.clone().sub(p.min);
  // as many banks as the space can hold, each a few metres across; kept topped up
  const want = Math.max(4, Math.round(((size.x * size.z) / 6) * density));
  // when each bank ends, on the fog's own clock (a card says nothing when it dies)
  const ends: number[] = [];
  let t = 0;
  return ({ fx, rng }, dt) => {
    t += dt;
    const sheets = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    if (!sheets.length) return false;
    const spawnOne = (delay: number) => {
      const life = range(rng, 14, 22);
      ends.push(t + delay + life);
      const w = range(rng, 2.5, 4.2);
      const y = p.min.y + range(rng, 0.15, Math.min(1.2, size.y * 0.5));
      fx.spawn(pick(rng, sheets), {
        pos: new THREE.Vector3(range(rng, p.min.x, p.max.x), y, range(rng, p.min.z, p.max.z)),
        vel: new THREE.Vector3(range(rng, -0.08, 0.08), range(rng, -0.01, 0.02), range(rng, -0.08, 0.08)),
        life, delay, size: [w, w * 1.15], rot: range(rng, 0, 6.28), spin: range(rng, -0.03, 0.03),
        color: p.color ?? [0.9, 0.95, 1], alpha: 0.26 * (0.6 + 0.6 * density), glow: 0.08, fadeIn: 0.3, fadeOut: 0.35,
        frame: { kind: "life", from: 34, to: 64 }, soft: [p.min.y, 0.5],
      });
    };
    // a fog is already lying there when you arrive: it starts full, its banks at different ages
    if (t === dt) for (let i = 0; i < want; i++) spawnOne(i === 0 ? 0 : range(rng, 0, 0.5));
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= t) ends.splice(i, 1);
    if (ends.length < want && rng() < dt * 2) spawnOne(0);
    return true;
  };
}

// ---- bubbles in a specimen tank --------------------------------------------------------------
export interface TankP {
  /** the centre of the tank's floor */
  base: THREE.Vector3;
  radius: number;
  /** to the liquid's surface */
  height: number;
  /** the tank's light (the liquid glows a little) */
  color?: [number, number, number];
  /** bubbles a second */
  rate?: number;
}
export function tankBubbles(p: TankP): Emitter {
  const rate = p.rate ?? 6;
  const col = p.color ?? [0.55, 0.9, 0.7];
  let next = 0, nextBurst = 3, t = 0;
  // a few vents in the floor of the tank, where most bubbles come from
  const vents: THREE.Vector3[] = [];
  return ({ fx, rng }, dt) => {
    t += dt;
    if (!vents.length) for (let i = 0; i < 3; i++) { const a = rng() * 6.28, r = Math.sqrt(rng()) * p.radius * 0.7; vents.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const one = (from: THREE.Vector3, big: boolean, delay = 0) => {
      const vy = range(rng, 0.25, 0.5) * (big ? 1.3 : 1);
      const s = big ? range(rng, 0.025, 0.045) : range(rng, 0.008, 0.02);
      fx.spawn("sprites", {
        pos: p.base.clone().add(from), delay, vel: new THREE.Vector3(range(rng, -0.03, 0.03), vy, range(rng, -0.03, 0.03)), life: p.height / vy,
        size: [s, s * 1.3], frame: { kind: "fixed", frame: SPRITE.bubble }, glow: 0.5, color: col, alpha: 0.8, fadeIn: 0.05, fadeOut: 0.04,
      });
    };
    next -= dt;
    while (next <= 0) {
      next += range(rng, 0.5, 1.5) / rate;
      const from = rng() < 0.75 ? pick(rng, vents).clone().add(new THREE.Vector3(range(rng, -0.02, 0.02), 0, range(rng, -0.02, 0.02))) : (() => { const a = rng() * 6.28, r = Math.sqrt(rng()) * p.radius * 0.85; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r); })();
      one(from, false);
    }
    // now and then the specimen stirs: a rush of big bubbles from one place
    if (t > nextBurst) {
      nextBurst = t + range(rng, 6, 14);
      const from = pick(rng, vents);
      for (let i = 0; i < 14; i++) one(from.clone().add(new THREE.Vector3(range(rng, -0.04, 0.04), 0, range(rng, -0.04, 0.04))), rng() < 0.6, i * 0.04);
    }
    return true;
  };
}

// ---- dust drifting in a beam -----------------------------------------------------------------
export interface BeamDustP {
  beam: BeamHandle;
  /** motes kept in it */
  count?: number;
}
export function beamDust(p: BeamDustP): Emitter {
  const count = p.count ?? 24;
  let next = 0, primed = false;
  const c = new THREE.Color();
  return ({ fx, rng }, dt) => {
    const k = p.beam.spec.intensity ?? 1;
    const spawn = (age: number) => {
      c.set(p.beam.spec.color ?? 0xffffff);
      const life = range(rng, 4, 8);
      fx.spawn("sprites", {
        pos: fx.beams.pointIn(p.beam, rng(), rng(), rng()), delay: age, life,
        vel: new THREE.Vector3(range(rng, -0.03, 0.03), range(rng, -0.02, 0.025), range(rng, -0.03, 0.03)),
        size: [range(rng, 0.006, 0.012), range(rng, 0.006, 0.012)], frame: { kind: "fixed", frame: SPRITE.mote }, glow: 1,
        color: [c.r * 0.9 * k, c.g * 0.9 * k, c.b * 0.9 * k], alpha: 0.9, fadeIn: 0.25, fadeOut: 0.3,
      });
    };
    if (!primed) {
      primed = true;
      for (let i = 0; i < count; i++) spawn(range(rng, 0, 0.3));
    }
    if (k < 0.05) return true;
    // one in as one goes out, on average
    next -= dt;
    while (next <= 0) {
      next += 6 / count;
      spawn(0);
    }
    return true;
  };
}

// ---- the director's noises: a pipe bursting, something falling ------------------------------
// (SURVIVORZ.md, the director: "a noise in the world (a pipe bursts, something falls...) that
// the dead go to". The server sends the event with its seed; every screen draws the same.)

export interface PipeBurstP {
  /** where the pipe splits, and which way the split faces */
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** seconds it vents hard before it settles to a weep */
  secs?: number;
  /** seconds it weeps after that (0: it's spent) */
  weep?: number;
  floorY?: number;
}

/** A pipe giving way: a bang of steam with water and flakes of rust thrown off it, then it
 *  vents hard, surging, and tapers to a weep. */
export function pipeBurst(p: PipeBurstP): Emitter {
  const secs = p.secs ?? 18, weep = p.weep ?? 30;
  const dir = p.dir.clone().normalize();
  let t = 0, started = false, next = 0, nextSurge = 1.5, surgeUntil = -1;
  return ({ fx, rng }, dt) => {
    t += dt;
    const sheets = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    if (!started) {
      started = true;
      // the split: water and rust thrown off it, a short thump of light off the spray
      for (let i = 0; i < 40; i++) {
        fx.spawn("sprites", {
          pos: p.pos, vel: inCone(rng, dir, 0.7, v3()).multiplyScalar(range(rng, 2, 6)), life: range(rng, 0.6, 1.4), size: [0.01, 0.01], stretch: 0.02,
          frame: { kind: "fixed", frame: SPRITE.drop }, color: [0.55, 0.6, 0.65], gravity: 9.8, drag: 0.5, floorY: p.floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.1,
        });
      }
      for (let i = 0; i < 14; i++) {
        fx.spawn("sprites", {
          pos: p.pos, vel: inCone(rng, dir, 1.1, v3()).multiplyScalar(range(rng, 1, 3.5)), life: range(rng, 1, 2), size: [range(rng, 0.008, 0.02), range(rng, 0.008, 0.02)],
          rot: range(rng, 0, 6.28), spin: range(rng, -12, 12), frame: { kind: "fixed", frame: SPRITE.shard }, color: [0.42, 0.24, 0.12],
          gravity: 9.8, floorY: p.floorY, bounce: 0.25, fadeIn: 0, fadeOut: 0.2,
        });
      }
      // the first bang of steam: one big cloud thrown out of the split
      for (let i = 0; i < 10 && sheets.length; i++) {
        fx.spawn(pick(rng, sheets), {
          pos: p.pos, vel: inCone(rng, dir, 0.6, v3()).multiplyScalar(range(rng, 2.5, 5)), life: range(rng, 1.6, 2.6),
          size: [0.2, range(rng, 1, 1.6)], rot: range(rng, 0, 6.28), spin: range(rng, -1, 1),
          color: [2.1, 2.12, 2.16], alpha: 0.5, glow: 0.2, gravity: -0.4, drag: 2, fadeIn: 0.02, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 4, 12)) },
        });
      }
    }
    if (t > secs + weep || !sheets.length) return false;
    // how hard it's going: hard and surging, easing off to a weep over the last third
    const hard = t < secs * 0.66 ? 1 : t < secs ? 1 - 0.75 * ((t - secs * 0.66) / (secs * 0.34)) : 0.25;
    if (t > nextSurge && t < secs) {
      surgeUntil = t + range(rng, 0.4, 0.9);
      nextSurge = t + range(rng, 2.5, 6);
    }
    const force = (t < surgeUntil ? 2.4 : 1.5) * hard;
    next -= dt;
    while (next <= 0) {
      next += 0.06 / Math.max(0.2, force);
      fx.spawn(pick(rng, sheets), {
        pos: p.pos, vel: inCone(rng, dir, 0.2, v3()).multiplyScalar(range(rng, 1.4, 2.6) * force), life: range(rng, 1, 1.7),
        size: [0.06 * force, range(rng, 0.5, 0.9) * force], rot: range(rng, 0, 6.28), spin: range(rng, -1, 1),
        color: [2.1, 2.12, 2.16], alpha: 0.45, glow: 0.2, gravity: -0.6, drag: 2.2, fadeIn: 0.05, fadeOut: 0.6,
        frame: { kind: "life", from: Math.floor(range(rng, 6, 16)) },
      });
    }
    // water running off the pipe
    if (rng() < dt * 4 * hard) {
      fx.spawn("sprites", { pos: p.pos, vel: new THREE.Vector3(0, -0.3, 0), life: 1.2, size: [0.009, 0.009], stretch: 0.01, frame: { kind: "fixed", frame: SPRITE.drop }, color: [0.5, 0.55, 0.6], gravity: 9.8, floorY: p.floorY, fadeIn: 0, fadeOut: 0.05, dieOnLand: true });
    }
    return true;
  };
}

export interface FellP {
  /** where it lands, on the floor */
  pos: THREE.Vector3;
  /** how high it fell from (the ceiling it came off) */
  from?: number;
  /** how big a thing: a ceiling tile (0.5) to a duct section (1.2) */
  size?: number;
  floorY?: number;
}

/** Something falling somewhere: dust and grit trickling off the ceiling where it came away,
 *  then where it lands a puff of dust thrown along the floor and grit skipping out of it.
 *  (The thing itself is the room's: a tile, a panel, a light. This is what it throws up.) */
export const somethingFell: Effect<FellP> = ({ fx, rng }, p) => {
  const size = p.size ?? 0.7;
  const floorY = p.floorY ?? p.pos.y;
  const top = p.from ?? floorY + 3;
  const fall = Math.sqrt((2 * Math.max(0.2, top - floorY)) / 9.8);
  // off the ceiling where it came away: a trickle and a little cloud
  for (let i = 0; i < 30 * size; i++) {
    fx.spawn("sprites", {
      pos: new THREE.Vector3(p.pos.x + range(rng, -0.3, 0.3) * size, top - 0.05, p.pos.z + range(rng, -0.3, 0.3) * size),
      vel: new THREE.Vector3(range(rng, -0.1, 0.1), range(rng, -0.6, 0), range(rng, -0.1, 0.1)), life: range(rng, 1.5, 3), delay: range(rng, 0, 1.4),
      size: [0.006, 0.006], frame: { kind: "fixed", frame: SPRITE.dot }, color: [0.55, 0.52, 0.48], gravity: 5, drag: 3, floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.3,
    });
  }
  const sheets = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
  // a curtain of dust shaken off with it, sinking (dust is pale in the light: grey on a grey
  // floor vanished)
  for (let i = 0; i < 4 && sheets.length; i++) {
    fx.spawn(pick(rng, sheets), {
      pos: new THREE.Vector3(p.pos.x + range(rng, -0.3, 0.3) * size, top - 0.25, p.pos.z + range(rng, -0.3, 0.3) * size), vel: new THREE.Vector3(0, range(rng, -0.5, -0.25), 0),
      life: range(rng, 2.5, 3.5), delay: i * 0.12, size: [0.6 * size, 1.1 * size], rot: range(rng, 0, 6.28), spin: range(rng, -0.3, 0.3),
      color: [1.15, 1.1, 1.02], alpha: 0.32, drag: 0.6, fadeIn: 0.05, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 8, 14)) },
    });
  }
  // where it lands, when it gets there
  if (fx.has("dust-impact")) {
    const w = 2.2 * size, asp = fx.layer("dust-impact").sheet.aspect;
    fx.spawn("dust-impact", {
      pos: new THREE.Vector3(p.pos.x, floorY + w * asp * 0.42, p.pos.z), life: 3.5, delay: fall, size: [w, w],
      color: [1.05, 1.0, 0.92], alpha: 0.9, fadeIn: 0, fadeOut: 0.4, frame: { kind: "life" }, soft: [floorY, 0.3],
    });
  } else if (sheets.length) {
    fx.spawn(pick(rng, sheets), {
      pos: new THREE.Vector3(p.pos.x, floorY + 0.2, p.pos.z), vel: new THREE.Vector3(0, 0.3, 0), life: 2.5, delay: fall, size: [size, size],
      rot: range(rng, 0, 6.28), color: [0.6, 0.57, 0.52], alpha: 0.5, drag: 1.5, fadeIn: 0.02, fadeOut: 0.6, frame: { kind: "life", from: 8 },
    });
  }
  // a low skirt of it rolling out along the floor
  for (let i = 0; i < 6 && sheets.length; i++) {
    const a = (i / 6) * Math.PI * 2 + range(rng, -0.3, 0.3);
    fx.spawn(pick(rng, sheets), {
      pos: new THREE.Vector3(p.pos.x, floorY + 0.15, p.pos.z), delay: fall, vel: new THREE.Vector3(Math.cos(a), 0.08, Math.sin(a)).multiplyScalar(range(rng, 0.9, 1.5)),
      life: range(rng, 2, 3), size: [0.7 * size, 0.45 * size], rot: range(rng, 0, 6.28), color: [1.05, 1.0, 0.92], alpha: 0.4, drag: 1.4,
      fadeIn: 0.02, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 10, 16)) }, soft: [floorY, 0.2],
    });
  }
  for (let i = 0; i < 30 * size; i++) {
    const a = range(rng, 0, Math.PI * 2);
    fx.spawn("sprites", {
      pos: new THREE.Vector3(p.pos.x, floorY + 0.05, p.pos.z), delay: fall,
      vel: new THREE.Vector3(Math.cos(a), range(rng, 0.3, 1.2), Math.sin(a)).multiplyScalar(range(rng, 0.8, 2.6)), life: range(rng, 0.8, 1.6),
      size: [range(rng, 0.006, 0.016), range(rng, 0.006, 0.016)], rot: range(rng, 0, 6.28), spin: range(rng, -10, 10),
      frame: { kind: "fixed", frame: SPRITE.shard }, color: [0.5, 0.48, 0.45], gravity: 9.8, floorY, bounce: 0.3, fadeIn: 0, fadeOut: 0.2,
    });
  }
};

// ---- the sink: a tap running (the safe rooms' only working water) ---------------------------
export interface TapP {
  /** the mouth of the tap */
  spout: THREE.Vector3;
  /** the bottom of the basin under it (or the water standing in it) */
  basinY: number;
  /** how far open: 0 off .. 1 full. A number, or asked every frame (a tap being turned) */
  flow?: number | (() => number);
}

/** A tap running into a sink: a thin, unbroken stream that narrows as it falls, rippling the
 *  water where it lands, a little white where it hits, and drops thrown up out of it. Turned
 *  off, the stream thins to a last few drops. It runs until it's stopped. */
export function tapRunning(p: TapP): Emitter {
  const WATER: [number, number, number] = [0.62, 0.68, 0.74];
  let next = 0, nextRing = 0, nextFoam = 0, level = 0;
  const flowNow = () => Math.max(0, Math.min(1, typeof p.flow === "function" ? p.flow() : p.flow ?? 0.7));
  const fall = Math.max(0.05, p.spout.y - p.basinY);
  const ground = new THREE.Vector3(p.spout.x, p.basinY + 0.003, p.spout.z);
  return ({ fx, rng }, dt) => {
    // the tap opening and closing takes a moment, it never snaps
    const want = flowNow();
    level += (want - level) * Math.min(1, dt * 6);
    if (level < 0.01) return true;
    // the stream: elongated drops close enough to read as one ribbon of water, narrowing as it
    // falls (it speeds up, so it thins), a slight wobble so it isn't a glass rod
    next -= dt;
    while (next <= 0) {
      // (dense, and drawn out long: at 160 a second the stream read as dashes)
      next += 1 / (60 + 300 * level);
      const r = 0.003 + 0.006 * level;
      fx.spawn("sprites", {
        pos: p.spout.clone().add(new THREE.Vector3(range(rng, -0.0015, 0.0015), 0, range(rng, -0.0015, 0.0015))), vel: new THREE.Vector3(range(rng, -0.02, 0.02), -0.3 - 0.5 * level, range(rng, -0.02, 0.02)),
        life: 2, size: [r, r], stretch: 0.07, frame: { kind: "fixed", frame: SPRITE.drop }, color: WATER, glow: 0.12, alpha: 0.8,
        gravity: 9.8, floorY: p.basinY, dieOnLand: true, fadeIn: 0, fadeOut: 0.02,
      });
    }
    // where it lands: rings spreading on the water, steady
    nextRing -= dt;
    while (nextRing <= 0) {
      nextRing += 0.16 / (0.4 + level);
      fx.spawn("sprites", {
        pos: ground, life: 0.9, size: [0.02, 0.14 + 0.16 * level], flat: true, rot: range(rng, 0, 6.28),
        frame: { kind: "fixed", frame: SPRITE.ring }, color: WATER, alpha: 0.4 * level + 0.15, fadeIn: 0, fadeOut: 0.8,
      });
    }
    // a little white where it hits, and drops thrown up out of it
    nextFoam -= dt;
    while (nextFoam <= 0) {
      nextFoam += 0.06;
      fx.spawn("sprites", {
        pos: ground.clone().add(new THREE.Vector3(0, 0.01, 0)), life: 0.25, size: [0.03 + 0.05 * level, 0.03 + 0.05 * level], rot: range(rng, 0, 6.28),
        frame: { kind: "fixed", frame: SPRITE.mist }, color: [1.6, 1.65, 1.7], alpha: 0.25 + 0.2 * level, fadeIn: 0, fadeOut: 0.6,
      });
      for (let i = 0; i < 1 + Math.round(2 * level * Math.min(1, fall / 0.3)); i++) {
        fx.spawn("sprites", {
          pos: ground, vel: inCone(rng, UP, 0.9, v3()).multiplyScalar(range(rng, 0.3, 0.9) * (0.5 + level)), life: 0.5, size: [0.004, 0.004],
          frame: { kind: "fixed", frame: SPRITE.drop }, color: WATER, gravity: 9.8, floorY: p.basinY, dieOnLand: true, fadeIn: 0, fadeOut: 0.1,
        });
      }
    }
    return true;
  };
}
