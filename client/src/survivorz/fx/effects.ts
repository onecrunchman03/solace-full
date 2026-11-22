// SURVIVORZ EFFECTS — the recipes. Each is a plain function of the server's
// event and a seeded rng (EFFECTS.md §1). F0 holds the five that prove the
// engine end to end; F1 onwards add the show's real set beside them.
import * as THREE from "three";
import type { Effect, Emitter, EffectContext } from "./system";
import { SPRITE } from "./sprites";
import { inCone, pick, range } from "./rng";

const UP = new THREE.Vector3(0, 1, 0);
const v3 = () => new THREE.Vector3();

// ---- sparks: a bullet on metal, a broken wire ---------------------------------
export interface SparksP {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  count?: number;
  floorY?: number;
}
export const sparks: Effect<SparksP> = ({ fx, rng }, p) => {
  const n = p.count ?? 24;
  for (let i = 0; i < n; i++) {
    const dir = inCone(rng, p.normal, 1.1, v3());
    const speed = range(rng, 2.5, 8);
    const life = range(rng, 0.3, 0.8);
    fx.spawn("sprites", {
      pos: p.pos, vel: dir.multiplyScalar(speed), life, size: [0.02, 0.012], stretch: 0.04,
      frame: { kind: "fixed", frame: SPRITE.spark }, glow: 1, color: [2.2, 1.6, 0.9], colorEnd: [1.4, 0.45, 0.1],
      gravity: 9.8, drag: 1.2, floorY: p.floorY, bounce: 0.35, fadeIn: 0, fadeOut: 0.5,
    });
  }
  // the hot point where it struck: a flash too brief to see as a shape, only as light
  const at = p.pos.clone().addScaledVector(p.normal, 0.02);
  fx.spawn("sprites", { pos: at, life: 0.07, size: [0.22, 0.12], frame: { kind: "fixed", frame: SPRITE.star }, glow: 1, color: [2.4, 2, 1.4], rot: range(rng, 0, 6.28), fadeIn: 0, fadeOut: 0.8 });
  fx.spawn("sprites", { pos: at, life: 0.12, size: [0.12, 0.2], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [2, 1.4, 0.7], fadeIn: 0, fadeOut: 0.9 });
  // and the grit knocked off the surface
  fx.spawn("sprites", { pos: at, vel: p.normal.clone().multiplyScalar(0.4), life: 0.9, size: [0.08, 0.3], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.puff }, color: [0.55, 0.53, 0.5], alpha: 0.6, drag: 2.5, fadeIn: 0, fadeOut: 0.7 });
  fx.flash("muzzle", p.pos.clone().addScaledVector(p.normal, 0.1), 6, 0.08, 0xffb060, 3.5);
};

// ---- a puff of smoke: a shot's breath, a burst pipe ---------------------------
export interface PuffP {
  pos: THREE.Vector3;
  dir?: THREE.Vector3;
  size?: number;
  /** grey level of the smoke, 0..1 */
  shade?: number;
}
export const smokePuff: Effect<PuffP> = ({ fx, rng }, p) => {
  const sheet = pick(rng, ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s)));
  const size = p.size ?? 0.5;
  const sh = p.shade ?? 0.75;
  for (let i = 0; i < 3; i++) {
    const d = p.dir ? inCone(rng, p.dir, 0.4, v3()).multiplyScalar(range(rng, 0.3, 0.9)) : v3();
    fx.spawn(sheet, {
      pos: p.pos.clone().add(new THREE.Vector3(range(rng, -0.04, 0.04), range(rng, -0.04, 0.04), range(rng, -0.04, 0.04))),
      vel: d.add(new THREE.Vector3(0, range(rng, 0.15, 0.35), 0)), life: range(rng, 1.8, 2.8), delay: i * 0.03,
      // the wisp sheets start as a speck and bloom: begin a third of the way in, and draw the
      // card well over the visible smoke (the wisp fills only the middle of its frame)
      size: [size * 1.4, size * range(rng, 2.6, 3.4)], rot: range(rng, 0, 6.28), spin: range(rng, -0.4, 0.4),
      color: [sh, sh, sh], alpha: 0.85, fadeIn: 0.06, fadeOut: 0.55, drag: 1.5,
      frame: { kind: "life", from: Math.floor(range(rng, 18, 26)) },
    });
  }
};

// ---- an explosion: the blast sheet, a flash, sparks, dust, a shake -------------
export interface BlastP {
  pos: THREE.Vector3;
  floorY?: number;
  size?: number;
}
export const explosion: Effect<BlastP> = (ctx, p) => {
  const { fx, rng } = ctx;
  const size = p.size ?? 3;
  // our render of the JangaFX gasoline explosion when it's there (F3), the Unity blasts if not
  const sheet = ["gas-burst", "explosion-hd", "explosion-a"].find((s) => fx.has(s));
  if (sheet === "gas-burst") {
    fx.spawn(sheet, {
      pos: p.pos.clone().add(new THREE.Vector3(0, size * 0.42, 0)), life: 2.2, size: [size, size],
      rot: range(rng, -0.15, 0.15), alpha: 1, fadeIn: 0, fadeOut: 0.3, frame: { kind: "life", from: 3, to: 64 },
      // (its foot fades into the floor rather than being cut by it in a straight line)
      soft: [p.floorY ?? p.pos.y, 0.3],
    });
  } else if (sheet) {
    fx.spawn(sheet, {
      pos: p.pos.clone().add(new THREE.Vector3(0, size * 0.25, 0)), life: 2.4, size: [size, size * 1.15],
      rot: range(rng, -0.3, 0.3), alpha: 1, fadeIn: 0, fadeOut: 0.35, frame: { kind: "life" },
    });
  }
  if (fx.has("dust-impact")) {
    // the dust thrown up out of the floor (our render of the JangaFX simulation)
    const w = size * 1.9, asp = fx.layer("dust-impact").sheet.aspect;
    fx.spawn("dust-impact", { pos: p.pos.clone().add(new THREE.Vector3(0, w * asp * 0.42, 0)), life: 4.5, delay: 0.08, size: [w, w], color: [0.55, 0.52, 0.48], alpha: 0.85, fadeIn: 0, fadeOut: 0.4, frame: { kind: "life" }, soft: [p.floorY ?? p.pos.y, 0.35] });
  } else if (fx.has("explosion-dust")) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng();
      fx.spawn("explosion-dust", {
        pos: p.pos.clone().add(new THREE.Vector3(Math.cos(a) * size * 0.3, size * 0.1, Math.sin(a) * size * 0.3)),
        vel: new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(range(rng, 1, 2.2)), drag: 1.4,
        life: range(rng, 2.5, 3.5), delay: 0.12, size: [size * 0.6, size * 1.3], color: [0.55, 0.52, 0.48], alpha: 0.8,
        fadeIn: 0.05, fadeOut: 0.5, frame: { kind: "life", from: 10 },
      });
    }
  }
  sparks(ctx, { pos: p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), normal: UP, count: 40, floorY: p.floorY });
  for (let i = 0; i < 26; i++) {
    // debris chips thrown out and down
    const dir = inCone(rng, UP, 1.25, v3());
    fx.spawn("sprites", {
      pos: p.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), vel: dir.multiplyScalar(range(rng, 3, 9)), life: range(rng, 1.2, 2.4),
      size: [range(rng, 0.02, 0.05), range(rng, 0.02, 0.05)], rot: range(rng, 0, 6.28), spin: range(rng, -12, 12),
      frame: { kind: "fixed", frame: SPRITE.chip }, color: [0.22, 0.2, 0.18], gravity: 9.8, floorY: p.floorY, bounce: 0.25, fadeIn: 0, fadeOut: 0.2,
    });
  }
  fx.flash("blast", p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 60, 0.55, 0xffa055, 14, 0.02);
  fx.shake(p.pos, 0.06, 16, 0.7, Math.floor(rng() * 1e9));
};

// ---- a fire: flame cards, rising smoke, a flickering held light ---------------
export interface FireP {
  pos: THREE.Vector3;
  /** metres across the burning patch */
  radius?: number;
  /** seconds it burns (dying down over the last third) */
  duration?: number;
}
export function fire(p: FireP): Emitter {
  const radius = p.radius ?? 0.6;
  const dur = p.duration ?? 8;
  let t = 0, nextFlame = 0, nextSmoke = 0;
  let light: ReturnType<EffectContext["fx"]["holdLight"]> | undefined;
  return ({ fx, rng }, dt) => {
    t += dt;
    if (light === undefined) light = fx.holdLight("fire");
    const strength = t < 0.4 ? t / 0.4 : t > dur * 0.66 ? Math.max(0, (dur - t) / (dur * 0.34)) : 1;
    if (t >= dur) {
      light?.release();
      return false;
    }
    const flames = ["flame-a", "flame-b", "flame-hollow"].filter((s) => fx.has(s));
    nextFlame -= dt;
    while (nextFlame <= 0 && flames.length) {
      nextFlame += 0.07 / Math.max(0.2, strength);
      const r = Math.sqrt(rng()) * radius, a = rng() * Math.PI * 2;
      const h = range(rng, 0.45, 0.9) * (0.5 + 0.5 * strength);
      fx.spawn(pick(rng, flames), {
        pos: p.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, h * 0.45, Math.sin(a) * r)),
        vel: new THREE.Vector3(0, range(rng, 0.2, 0.5), 0), life: range(rng, 0.6, 1.0), size: [h * 0.55, h * 0.7],
        alpha: 0.9, fadeIn: 0.15, fadeOut: 0.4, frame: { kind: "life", from: Math.floor(range(rng, 0, 20)) }, soft: [p.pos.y, 0.08],
      });
    }
    nextSmoke -= dt;
    const smokes = ["smoke-wisp-a", "smoke-wisp-b"].filter((s) => fx.has(s));
    while (nextSmoke <= 0 && smokes.length) {
      nextSmoke += 0.35;
      fx.spawn(pick(rng, smokes), {
        pos: p.pos.clone().add(new THREE.Vector3(range(rng, -radius, radius) * 0.5, 0.9 * strength + 0.3, range(rng, -radius, radius) * 0.5)),
        vel: new THREE.Vector3(range(rng, -0.1, 0.1), range(rng, 0.5, 0.9), range(rng, -0.1, 0.1)), life: range(rng, 2.5, 4),
        size: [0.5, 1.6], rot: range(rng, 0, 6.28), spin: range(rng, -0.3, 0.3), color: [0.16, 0.15, 0.14], alpha: 0.55 * strength,
        fadeIn: 0.15, fadeOut: 0.5, drag: 0.3,
      });
    }
    // embers
    if (rng() < 0.4 * strength) {
      fx.spawn("sprites", {
        pos: p.pos.clone().add(new THREE.Vector3(range(rng, -radius, radius), 0.3, range(rng, -radius, radius))),
        vel: new THREE.Vector3(range(rng, -0.3, 0.3), range(rng, 0.8, 1.8), range(rng, -0.3, 0.3)), life: range(rng, 1, 2),
        size: [0.012, 0.006], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [1.5, 0.7, 0.2], colorEnd: [0.8, 0.15, 0.02],
        drag: 0.4, fadeIn: 0, fadeOut: 0.6,
      });
    }
    // the light flickers with the flames; it's what lights the walls and the survivors
    light?.set(
      p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
      strength * (5 + 2.2 * Math.sin(t * 13.1) + 1.4 * Math.sin(t * 29.7 + 1.3) + (rng() - 0.5)),
      0xff8a3a, 7,
    );
    return true;
  };
}
