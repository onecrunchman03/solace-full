// SURVIVORZ EFFECTS — the guns (F1, docs/survivorz/EFFECTS.md §1): the muzzle
// flash per gun, the smoke after it, the brass, and what a round does to the
// surface it lands on. A shot is a plain function of the gun, where the gun is
// (its world matrix, from the animation everyone already shares) and the event's
// seed, so every observer sees the same shot.
import * as THREE from "three";
import type { Effect } from "./system";
import { SPRITE } from "./sprites";
import { inCone, pick, range } from "./rng";
import { GUN_FX, gunDir, gunPoint, type GunId } from "./guns";
import { holeCell } from "./holes";
import { sparks } from "./effects";
import { bloodHit, type BloodKind } from "./blood";

const v3 = () => new THREE.Vector3();

export interface ShotP {
  gun: GunId;
  /** the gun model's matrixWorld at the moment it fired */
  matrix: THREE.Matrix4;
  /** the floor under the shooter, for the brass */
  floorY?: number;
}

const HOT: [number, number, number] = [2.4, 1.9, 1.15];
const COOLED: [number, number, number] = [1.7, 0.75, 0.2];

/** The flash alone: the side-on jet, the end-on bloom, the tongues a flash hider throws,
 *  unburnt powder, and the muzzle light. On screen for two or three frames, like a real one. */
export const muzzleFlash: Effect<ShotP> = ({ fx, rng }, p) => {
  const g = GUN_FX[p.gun], f = g.flash;
  const mz = gunPoint(p.matrix, g.muzzle);
  const fwd = gunDir(p.matrix, [0, 0, 1]);
  const s = range(rng, 0.8, 1.15);
  const life = f.life * range(rng, 0.85, 1.2);
  // the jet: a streak card whose length is its (tiny) velocity × stretch, so it lies along
  // the barrel and shortens by itself when the camera looks down the barrel
  const jet = (dir: THREE.Vector3, len: number, width: number, bright: number) => {
    fx.spawn("sprites", {
      pos: mz.clone().addScaledVector(dir, len / 2), vel: dir.clone().multiplyScalar(0.01), stretch: len / 0.01, aspect: 0,
      life, size: [width, width * 0.85], frame: { kind: "fixed", frame: SPRITE.jet }, glow: 1,
      color: [HOT[0] * bright, HOT[1] * bright, HOT[2] * bright], colorEnd: COOLED, fadeIn: 0, fadeOut: 0.6,
    });
  };
  jet(fwd, f.jet[0] * s, f.jet[1] * s, 1);
  if (rng() < 0.6) jet(inCone(rng, fwd, 0.08, v3()), f.jet[0] * s * range(rng, 0.55, 0.8), f.jet[1] * s * 0.7, 0.8);
  for (let i = 0; i < f.tongues; i++) {
    // a flash hider's prong vents sideways: tongues fanned round the barrel
    const a = (i / f.tongues) * Math.PI * 2 + rng() * 1.2;
    const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).transformDirection(p.matrix);
    const dir = fwd.clone().multiplyScalar(0.8).addScaledVector(side, range(rng, 0.6, 0.95)).normalize();
    jet(dir, f.jet[0] * s * range(rng, 0.35, 0.5), f.jet[1] * s * 0.55, 0.85);
  }
  fx.spawn("sprites", {
    pos: mz.clone().addScaledVector(fwd, 0.015), life, size: [f.petal * s, f.petal * s * 0.9], rot: range(rng, 0, 6.28),
    frame: { kind: "fixed", frame: SPRITE.petal }, glow: 1, color: HOT, colorEnd: COOLED, fadeIn: 0, fadeOut: 0.7,
  });
  fx.spawn("sprites", {
    pos: mz.clone().addScaledVector(fwd, 0.01), life: life * 0.7, size: [f.petal * 0.55 * s, f.petal * 0.4 * s],
    frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [2.6, 2.3, 1.8], fadeIn: 0, fadeOut: 0.8,
  });
  if (f.fireball > 0) {
    const sheets = ["fireball-a", "fireball-b"].filter((x) => fx.has(x));
    if (sheets.length) {
      fx.spawn(pick(rng, sheets), {
        // the throat of the blast only: small, early frames, gone with the flash
        pos: mz.clone().addScaledVector(fwd, f.fireball * 0.35 * s), vel: fwd.clone().multiplyScalar(0.6), life,
        size: [f.fireball * s, f.fireball * s * 1.15], rot: range(rng, 0, 6.28), glow: 1, alpha: 0.9, fadeIn: 0, fadeOut: 0.6,
        frame: { kind: "life", from: 2, to: 9 },
      });
    }
  }
  for (let i = 0; i < f.sparks; i++) {
    // unburnt powder, thrown out ahead of the flash
    const d = inCone(rng, fwd, 0.22, v3());
    fx.spawn("sprites", {
      pos: mz, vel: d.multiplyScalar(range(rng, 4, 9)), life: range(rng, 0.04, 0.1), size: [0.007, 0.005], stretch: 0.009,
      frame: { kind: "fixed", frame: SPRITE.spark }, glow: 1, color: [2.2, 1.3, 0.5], colorEnd: [1.2, 0.3, 0.05], drag: 3, fadeIn: 0, fadeOut: 0.5,
    });
  }
  fx.flash("muzzle", mz.clone().addScaledVector(fwd, 0.12), f.light[0] * s, life * 1.6, 0xffb468, f.light[1], 0.005);
};

/** A spent case or shell leaving the ejection port. The pump gun calls this when it's
 *  pumped; the others' shots call it themselves. */
export const ejectCasing: Effect<ShotP> = ({ fx, rng }, p) => {
  const g = GUN_FX[p.gun];
  const at = gunPoint(p.matrix, g.eject.at);
  const out = gunDir(p.matrix, g.eject.dir);
  const dir = inCone(rng, out, 0.22, v3());
  fx.casings.spawn({
    kind: g.casing, pos: at, vel: dir.multiplyScalar(range(rng, g.eject.speed[0], g.eject.speed[1])),
    axis: gunDir(p.matrix, [0, 0, 1]), tumble: range(rng, 22, 42), floorY: p.floorY, seed: Math.floor(rng() * 2 ** 31),
  });
  // a breath of smoke from the port as the case leaves
  fx.spawn("sprites", {
    pos: at, vel: out.clone().multiplyScalar(0.4), life: range(rng, 0.35, 0.55), size: [0.025, 0.09], rot: range(rng, 0, 6.28),
    frame: { kind: "fixed", frame: SPRITE.puff }, color: [0.75, 0.75, 0.72], alpha: 0.3, drag: 3, fadeIn: 0, fadeOut: 0.7,
  });
};

/** A shot: the flash, the smoke that follows it, and (except the pump gun) the brass. */
export const gunShot: Effect<ShotP> = (ctx, p) => {
  const { fx, rng } = ctx;
  muzzleFlash(ctx, p);
  const g = GUN_FX[p.gun];
  const mz = gunPoint(p.matrix, g.muzzle);
  const fwd = gunDir(p.matrix, [0, 0, 1]);
  const wisps = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((x) => fx.has(x));
  for (let i = 0; i < g.smoke.puffs && wisps.length; i++) {
    const sz = g.smoke.size * range(rng, 0.8, 1.2);
    fx.spawn(pick(rng, wisps), {
      pos: mz.clone().addScaledVector(fwd, 0.05 + i * 0.06),
      vel: inCone(rng, fwd, 0.3, v3()).multiplyScalar(range(rng, 0.8, 1.8)).add(new THREE.Vector3(0, 0.12, 0)),
      life: range(rng, 1.2, 2), delay: 0.02 + i * 0.02, size: [sz * 1.2, sz * range(rng, 3, 4.2)], rot: range(rng, 0, 6.28), spin: range(rng, -0.5, 0.5),
      color: [0.82, 0.82, 0.8], alpha: 0.5, drag: 2.4, fadeIn: 0.05, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 16, 24)) },
    });
  }
  if (g.smoke.linger && fx.has("smoke-candle")) {
    // the thin thread that curls up off a hot barrel afterwards
    fx.spawn("smoke-candle", {
      pos: mz.clone().add(new THREE.Vector3(0, 0.1, 0)), vel: new THREE.Vector3(0, 0.12, 0), life: range(rng, 2, 2.8), delay: 0.25,
      size: [0.07, 0.22], rot: range(rng, -0.2, 0.2), color: [0.85, 0.85, 0.85], alpha: 0.35, fadeIn: 0.2, fadeOut: 0.5, frame: { kind: "life" },
    });
  }
  if (g.ejectOnShot) ejectCasing(ctx, p);
};

export type SurfaceKind = "concrete" | "metal" | "wood" | "glass" | "flesh";

export interface ImpactP {
  surface: SurfaceKind;
  pos: THREE.Vector3;
  /** the surface's normal where the round struck */
  normal: THREE.Vector3;
  /** the round's direction of travel */
  dir: THREE.Vector3;
  floorY?: number;
  /** leave a hole (default yes; flesh never takes one, the body work does wounds) */
  mark?: boolean;
  /** whose blood, on flesh (a survivor's by default) */
  blood?: BloodKind;
}

/** Where the round lands: what the surface throws back, and the hole it leaves. */
export const bulletImpact: Effect<ImpactP> = (ctx, p) => {
  const { fx, rng } = ctx;
  const n = p.normal.clone().normalize();
  // what comes back off a surface leaves between the normal and the mirror of the shot
  const mirror = p.dir.clone().normalize().reflect(n).add(n).normalize();
  const at = p.pos.clone().addScaledVector(n, 0.015);
  const wisps = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((x) => fx.has(x));
  const dust = (color: [number, number, number], size: number, count: number, alpha: number) => {
    for (let i = 0; i < count; i++) {
      const v = inCone(rng, mirror, 0.5, v3()).multiplyScalar(range(rng, 0.6, 1.6));
      if (wisps.length) {
        fx.spawn(pick(rng, wisps), {
          pos: at, vel: v, life: range(rng, 0.9, 1.6), size: [size * 0.7, size * range(rng, 2.2, 3)], rot: range(rng, 0, 6.28), spin: range(rng, -0.6, 0.6),
          color, alpha, drag: 3.2, gravity: -0.05, fadeIn: 0.03, fadeOut: 0.6, frame: { kind: "life", from: Math.floor(range(rng, 14, 22)) },
        });
      } else {
        fx.spawn("sprites", { pos: at, vel: v, life: 1, size: [size, size * 2], frame: { kind: "fixed", frame: SPRITE.puff }, color, alpha, drag: 3 });
      }
    }
    // the fast burst at the strike itself: a puff stretched out along the spray
    fx.spawn("sprites", {
      pos: at, vel: mirror.clone().multiplyScalar(range(rng, 2.5, 4)), life: 0.22, size: [size * 0.9, size * 1.4], stretch: 0.04,
      frame: { kind: "fixed", frame: SPRITE.puff }, color, alpha: alpha * 1.2, drag: 7, fadeIn: 0, fadeOut: 0.8,
    });
  };
  const bits = (frame: number, color: [number, number, number], count: number, size: [number, number], speed: [number, number], bounce: number, spin: number, glint = 0, along = mirror, cone = 0.75) => {
    for (let i = 0; i < count; i++) {
      const sz = range(rng, size[0], size[1]);
      fx.spawn("sprites", {
        pos: at, vel: inCone(rng, along, cone, v3()).multiplyScalar(range(rng, speed[0], speed[1])), life: range(rng, 0.9, 1.8),
        size: [sz, sz], rot: range(rng, 0, 6.28), spin: range(rng, -spin, spin),
        frame: { kind: "fixed", frame }, color, glow: glint, gravity: 9.8, drag: 0.8, floorY: p.floorY, bounce, fadeIn: 0, fadeOut: 0.25,
      });
    }
  };
  const hole = (kind: "concrete" | "metal" | "wood" | "glass", size: number) => {
    if (p.mark === false || !fx.decalSets.has("holes")) return;
    const surf = fx.hit(p.pos.clone().addScaledVector(n, 0.1), n.clone().negate(), 0.3);
    // a wood hole tears along the grain, which runs up the wall: it stays (nearly) upright
    const spin = kind === "wood" ? range(rng, -0.12, 0.12) + (rng() < 0.5 ? 0 : Math.PI) : range(rng, 0, 6.28);
    if (surf) fx.decal("holes", { target: surf.mesh, pos: surf.point, normal: surf.normal, size: size * range(rng, 0.85, 1.15), spin, cell: holeCell(fx, kind, rng), depth: 0.12 });
  };
  switch (p.surface) {
    case "concrete":
      dust([0.66, 0.63, 0.58], 0.12, 3, 0.7);
      bits(SPRITE.chip, [0.5, 0.48, 0.45], Math.round(range(rng, 8, 13)), [0.008, 0.02], [1.5, 5], 0.3, 12);
      hole("concrete", 0.14);
      break;
    case "metal":
      sparks(ctx, { pos: p.pos, normal: mirror, count: Math.round(range(rng, 12, 20)), floorY: p.floorY });
      dust([0.55, 0.55, 0.56], 0.07, 1, 0.45);
      hole("metal", 0.1);
      break;
    case "wood":
      dust([0.6, 0.5, 0.38], 0.1, 2, 0.55);
      bits(SPRITE.splinter, [0.62, 0.45, 0.28], Math.round(range(rng, 6, 10)), [0.02, 0.05], [1.5, 4.5], 0.2, 16);
      hole("wood", 0.13);
      break;
    case "glass":
      dust([0.85, 0.88, 0.9], 0.06, 1, 0.35);
      // shards go both ways: back at the shooter and on through the pane
      bits(SPRITE.shard, [0.75, 0.85, 0.9], Math.round(range(rng, 10, 16)), [0.012, 0.035], [1.2, 4], 0.15, 18, 0.35);
      bits(SPRITE.shard, [0.75, 0.85, 0.9], 8, [0.01, 0.03], [1.5, 4], 0.15, 18, 0.35, p.dir.clone().normalize(), 0.5);
      fx.spawn("sprites", { pos: at, life: 0.08, size: [0.12, 0.12], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.star }, glow: 1, color: [1.6, 1.7, 1.8], fadeIn: 0, fadeOut: 0.8 });
      hole("glass", 0.26);
      break;
    case "flesh":
      bloodHit(ctx, { pos: p.pos, dir: p.dir, floorY: p.floorY, amount: 0.45, kind: p.blood });
      break;
  }
};
