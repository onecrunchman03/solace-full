// SURVIVORZ EFFECTS — fire and explosives (docs/survivorz/EFFECTS.md step F3).
//
// THE MOLOTOV: the bottle breaks, the fuel splashes and catches in a ball of fire,
// the floor burns for a while (with little satellite fires where the splash landed),
// a smoke column climbs to the ceiling, and a scorch is left in the shape of the
// spill. Anything standing in it can catch fire (`catchFire`).
// THE PIPE BOMB: a flash that lights the room, a quick fireball, a cloud of dust
// thrown up out of the floor and a ring of it rolling out, grit and sparks, a blast
// scorch on the floor and the walls near it, dust falling from the ceiling, and the
// broadcast cameras shaken (a small shake, on blasts only — Josh, 2026-10-22).
//
// The fireball and the two dust sheets are OUR renders of the JangaFX simulations
// (scripts/survivorz/fx-vdb.mjs); the scorch marks are baked by fx-scorch.mjs. Every
// recipe is a plain function of the event and its seed, like the rest.
import * as THREE from "three";
import type { Effect, Emitter, FxSystem } from "./system";
import type { HeldLight } from "./lights";
import { SPRITE } from "./sprites";
import { inCone, pick, range, type Rng } from "./rng";

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const v3 = () => new THREE.Vector3();

// ---- the scorch marks ------------------------------------------------------------------
export interface ScorchKit {
  blast: number[];
  fuel: number[];
}

/** The scorch atlas into a "scorch" decal set. Once. */
export async function loadScorchKit(fx: FxSystem): Promise<ScorchKit> {
  const { load } = fx.opts;
  const man = await load.json<{ cols: number; rows: number; color: { png: string; ktx2?: string }; normal: { png: string; ktx2?: string }; cells: { cell: number; kind: string }[] }>("scorch/scorch.json");
  const tex = async (f: { png: string; ktx2?: string }, space: "srgb" | "linear") => {
    if (f.ktx2 && load.compressed) {
      const t = await load.compressed(`scorch/${f.ktx2}`);
      t.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 8;
      return { t, topDown: true };
    }
    const t = await load.texture(`scorch/${f.png}`, space);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return { t, topDown: false };
  };
  const c = await tex(man.color, "srgb");
  const set = fx.addDecalSet("scorch", { map: c.t, normalMap: (await tex(man.normal, "linear")).t, cols: man.cols, rows: man.rows, topDown: c.topDown }, 32, 160);
  set.material.roughness = 0.95;
  // under the blood: a body bleeds onto a burn, not the other way round
  set.mesh.renderOrder = 4;
  return { blast: man.cells.filter((x) => x.kind === "blast").map((x) => x.cell), fuel: man.cells.filter((x) => x.kind === "fuel").map((x) => x.cell) };
}

/** A scorch mark. It LASTS (Josh, Oct 23: scorch persists all show; it used to fade ten
 *  minutes after the fire). */
function scorch(fx: FxSystem, rng: Rng, kind: "blast" | "fuel", hit: { mesh: THREE.Mesh; point: THREE.Vector3; normal: THREE.Vector3 }, size: number, along?: THREE.Vector3): void {
  if (!fx.decalSets.has("scorch")) return;
  const kit = fx.scorch;
  const cells = kit ? kit[kind] : [0];
  // (drawn out along a run of fuel when it has one: round marks in a row read as stepping stones)
  const spin = along ? Math.atan2(-along.z, along.x) + range(rng, -0.15, 0.15) : range(rng, 0, 6.28);
  fx.decal("scorch", { target: hit.mesh, pos: hit.point, normal: hit.normal, size, aspect: along ? 0.42 : 1, spin, cell: pick(rng, cells), opacity: 0.95, depth: along ? 0.25 : 0.5 });
}

function floorUnder(fx: FxSystem, at: THREE.Vector3, reach = 1) {
  const h = fx.hit(at.clone().add(new THREE.Vector3(0, 0.4, 0)), DOWN, reach + 0.4);
  return h && h.normal.y > 0.5 ? h : null;
}

/** burning fuel and a burning body: deeper orange than the sheets' near-white cores */
const FLAME_TINT: [number, number, number] = [1, 0.72, 0.48];

/** The flames a patch of burning floor throws up, `strength` 0..1. */
function flames(fx: FxSystem, rng: Rng, at: THREE.Vector3, r: number, strength: number, scale = 1): void {
  const sheets = ["flame-a", "flame-b", "flame-hollow"].filter((s) => fx.has(s));
  if (!sheets.length) return;
  const rr = Math.sqrt(rng()) * r, a = rng() * Math.PI * 2;
  // a sheet of fire, not a row of candles: most tongues short and broad, a few tall ones,
  // the tall ones toward the middle where the fuel is deepest
  const tall = rng() < 0.25 * (1 - rr / Math.max(r, 1e-3));
  const h = (tall ? range(rng, 0.8, 1.3) : range(rng, 0.45, 0.8)) * (0.45 + 0.55 * strength) * scale;
  // the open-middled flame for the broad low ones: they overlap into a sheet instead of each
  // showing its own white-hot core like a row of candles
  const sheet = !tall && fx.has("flame-hollow") && rng() < 0.6 ? "flame-hollow" : pick(rng, sheets);
  const w = h * (tall ? 0.6 : 1.15), ch = w * fx.layer(sheet).sheet.aspect;
  // the card's foot just under the floor, softened into it rather than cut off by it
  fx.spawn(sheet, {
    pos: at.clone().add(new THREE.Vector3(Math.cos(a) * rr, ch * 0.42, Math.sin(a) * rr)),
    vel: new THREE.Vector3(range(rng, -0.05, 0.05), range(rng, 0.2, 0.45), range(rng, -0.05, 0.05)), life: range(rng, 0.5, 0.9),
    size: [w, w * 0.8], rot: range(rng, -0.12, 0.12), alpha: 0.85, fadeIn: 0.12, fadeOut: 0.4, frame: { kind: "life", from: Math.floor(range(rng, 0, 20)) },
    soft: [at.y, Math.max(0.05, ch * 0.12)], color: FLAME_TINT,
  });
}

// ---- the molotov ------------------------------------------------------------------------
export interface MolotovP {
  /** where the bottle broke */
  pos: THREE.Vector3;
  /** the way it was thrown (the fuel carries on that way) */
  dir: THREE.Vector3;
  floorY?: number;
  /** how high the ceiling is (the smoke spreads under it) */
  ceilingY?: number;
  /** metres the fuel spreads across */
  radius?: number;
  /** seconds the floor burns */
  burn?: number;
}

export function molotov(p: MolotovP): Emitter {
  const R = p.radius ?? 1.3, burn = p.burn ?? 18;
  const ceil = p.ceilingY ?? (p.floorY ?? 0) + 3.2;
  let t = 0, started = false, nextFlame = 0, nextSmoke = 0, scorched = false;
  let light: HeldLight | null | undefined;
  // where the fuel ends up: the centre of the pool, carried a little on along the throw
  const along = p.dir.clone().setY(0);
  if (along.lengthSq() < 1e-6) along.set(1, 0, 0);
  along.normalize();
  const centre = p.pos.clone().addScaledVector(along, R * 0.35);
  centre.y = p.floorY ?? p.pos.y;
  const satellites: { at: THREE.Vector3; r: number; until: number; from: number }[] = [];
  return ({ fx, rng }, dt) => {
    t += dt;
    if (!started) {
      started = true;
      // the bottle: glass thrown both ways, catching the fireball's light
      for (let i = 0; i < 22; i++) {
        const d = inCone(rng, along.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), 1.4, v3());
        fx.spawn("sprites", {
          pos: p.pos, vel: d.multiplyScalar(range(rng, 1.5, 4.5)), life: range(rng, 1, 2.2), size: [range(rng, 0.02, 0.05), range(rng, 0.02, 0.05)],
          rot: range(rng, 0, 6.28), spin: range(rng, -14, 14), frame: { kind: "fixed", frame: SPRITE.shard }, color: [0.75, 0.82, 0.78],
          gravity: 9.8, floorY: p.floorY, bounce: 0.3, fadeIn: 0, fadeOut: 0.25,
        });
      }
      // the fuel splashing on along the throw, alight; where a splash lands, a little fire
      for (let i = 0; i < 26; i++) {
        const d = inCone(rng, along.clone().add(new THREE.Vector3(0, 0.45, 0)).normalize(), 0.9, v3());
        const lands = i < 5;
        fx.spawn("sprites", {
          pos: p.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), vel: d.multiplyScalar(range(rng, 2, 5)), life: 1.6, size: [0.035, 0.035], stretch: 0.03,
          frame: { kind: "fixed", frame: SPRITE.drop }, glow: 1, color: [2.2, 1.1, 0.3], colorEnd: [1.2, 0.35, 0.05], gravity: 9.8, drag: 0.5,
          floorY: p.floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.05,
          onLand: lands ? (at) => satellites.push({ at: at.clone(), r: range(rng, 0.12, 0.25), from: t, until: t + range(rng, 3, 7) }) : undefined,
        });
      }
      // the fuel catching: one ball of fire rolling up
      if (fx.has("gas-burst")) {
        fx.spawn("gas-burst", {
          pos: centre.clone().add(new THREE.Vector3(0, R * 1.05, 0)), vel: new THREE.Vector3(0, 0.25, 0), life: 1.7, size: [R * 2.4, R * 2.4],
          // only its fire: the render's last frames are its own grey smoke, which laid a veil over
          // the bright flames still burning under it and read as a sickly olive-green. The
          // molotov's smoke column (drawn behind the flames) is the smoke
          rot: range(rng, -0.1, 0.1), alpha: 1, fadeIn: 0, fadeOut: 0.4, frame: { kind: "life", from: 2, to: 38 },
          color: FLAME_TINT,
        });
      }
      fx.flash("blast", centre.clone().add(new THREE.Vector3(0, 0.8, 0)), 40, 0.9, 0xffa040, 12, 0.05);
    }
    // the burning floor: spreads out fast, burns, and dies down over the last third
    const spread = Math.min(1, t / 0.6);
    const strength = t < 0.3 ? t / 0.3 : t > burn * 0.66 ? Math.max(0, (burn - t) / (burn * 0.34)) : 1;
    if (t >= burn + 4) {
      light?.release();
      return false;
    }
    if (t < burn) {
      if (light === undefined) light = fx.holdLight("fire");
      nextFlame -= dt;
      while (nextFlame <= 0) {
        nextFlame += 0.022 / Math.max(0.15, strength);
        flames(fx, rng, centre, R * spread, strength, 1.15);
      }
      // the satellites
      for (const s of satellites) {
        if (t > s.until) continue;
        const k = Math.min(1, (t - s.from) / 0.2) * Math.min(1, (s.until - t) / 1.5);
        if (rng() < dt * 9 * k) flames(fx, rng, s.at, s.r, k, 0.5);
      }
      // embers
      if (rng() < dt * 12 * strength) {
        fx.spawn("sprites", {
          pos: centre.clone().add(new THREE.Vector3(range(rng, -R, R) * spread * 0.7, 0.3, range(rng, -R, R) * spread * 0.7)),
          vel: new THREE.Vector3(range(rng, -0.3, 0.3), range(rng, 0.9, 2.2), range(rng, -0.3, 0.3)), life: range(rng, 1, 2.2),
          size: [0.012, 0.007], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [1.6, 0.7, 0.2], colorEnd: [0.8, 0.15, 0.02], drag: 0.4, fadeIn: 0, fadeOut: 0.6,
        });
      }
      light?.set(centre.clone().add(new THREE.Vector3(0, 0.7, 0)), strength * (9 + 3 * Math.sin(t * 13.1) + 2 * Math.sin(t * 29.7 + 1.3) + (rng() - 0.5) * 1.5), 0xff8030, 9);
    }
    // the smoke column, thick and black at first, climbing to the ceiling and spreading under it
    nextSmoke -= dt;
    const smokes = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    while (nextSmoke <= 0 && smokes.length) {
      const thick = t < 3 ? 1 : Math.max(0.15, strength);
      nextSmoke += 0.16 / thick;
      const y0 = centre.y + 0.9;
      const vy = range(rng, 0.9, 1.4);
      const rise = Math.max(0.5, ceil - y0 - 0.4);
      const life = rise / vy + range(rng, 1.5, 3);
      fx.spawn(pick(rng, smokes), {
        pos: centre.clone().add(new THREE.Vector3(range(rng, -0.3, 0.3) * R, y0 - centre.y, range(rng, -0.3, 0.3) * R)),
        vel: new THREE.Vector3(range(rng, -0.15, 0.15), vy, range(rng, -0.15, 0.15)), drag: 0.25, life,
        size: [0.7 * R, 2.2 * R + rise * 0.5], rot: range(rng, 0, 6.28), spin: range(rng, -0.25, 0.25),
        color: [0.07, 0.065, 0.06], alpha: 0.7 * thick, fadeIn: 0.1, fadeOut: 0.45,
        frame: { kind: "life", from: Math.floor(range(rng, 16, 24)) },
      });
    }
    // the scorch, under the flames once they're up
    if (!scorched && t > 0.8) {
      scorched = true;
      const floor = floorUnder(fx, centre);
      if (floor) scorch(fx, rng, "fuel", floor, R * 2.3);
      for (const s of satellites) {
        const f = floorUnder(fx, s.at);
        if (f) scorch(fx, rng, "fuel", f, s.r * 3);
      }
    }
    return true;
  };
}

// ---- catching fire ----------------------------------------------------------------------
export interface CatchFireP {
  /** what's burning (a zombie, a survivor): its bones are where the flames come from */
  target: THREE.Object3D;
  /** seconds it burns */
  secs?: number;
  /** its OWN material copies, to char as it burns (never shared ones: every zombie would char) */
  char?: THREE.Material[];
}
export function catchFire(p: CatchFireP): Emitter {
  const secs = p.secs ?? 8;
  const bones: THREE.Object3D[] = [];
  p.target.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o); });
  const base = new Map<THREE.Material, THREE.Color>();
  for (const m of p.char ?? []) if ((m as THREE.MeshStandardMaterial).color) base.set(m, (m as THREE.MeshStandardMaterial).color.clone());
  let t = 0, next = 0;
  let light: HeldLight | null | undefined;
  const at = v3(), centre = v3();
  return ({ fx, rng }, dt) => {
    t += dt;
    if (!p.target.parent || t > secs + 2) {
      light?.release();
      return false;
    }
    const k = t < 0.5 ? t / 0.5 : t > secs ? 0 : t > secs * 0.75 ? (secs - t) / (secs * 0.25) : 1;
    p.target.getWorldPosition(centre);
    next -= dt;
    while (next <= 0 && k > 0) {
      next += 0.035 / Math.max(0.2, k);
      if (bones.length) bones[Math.floor(rng() * bones.length)].getWorldPosition(at);
      else at.copy(centre).add(new THREE.Vector3(range(rng, -0.2, 0.2), range(rng, 0.2, 1.6), range(rng, -0.2, 0.2)));
      // (not flame-small: its temperature colours read white-hot on a body)
      const sheet = pick(rng, ["flame-a", "flame-b"].filter((s) => fx.has(s)));
      if (!sheet) break;
      const h = range(rng, 0.25, 0.55) * k;
      fx.spawn(sheet, {
        pos: at.clone().add(new THREE.Vector3(0, h * 0.35, 0)), vel: new THREE.Vector3(0, range(rng, 0.4, 0.9), 0), life: range(rng, 0.4, 0.7),
        size: [h * 0.6, h * 0.75], alpha: 0.95, fadeIn: 0.12, fadeOut: 0.45, frame: { kind: "life", from: Math.floor(range(rng, 0, 20)) }, color: FLAME_TINT,
      });
      const smoke = ["smoke-wisp-a", "smoke-wisp-b"].filter((s) => fx.has(s));
      if (smoke.length && rng() < 0.25) {
        fx.spawn(pick(rng, smoke), {
          pos: at.clone().add(new THREE.Vector3(0, 0.3, 0)), vel: new THREE.Vector3(0, range(rng, 0.6, 1), 0), life: range(rng, 1.5, 2.5),
          size: [0.4, 1.1], rot: range(rng, 0, 6.28), color: [0.08, 0.075, 0.07], alpha: 0.5 * k, fadeIn: 0.1, fadeOut: 0.5, drag: 0.3,
          frame: { kind: "life", from: 18 },
        });
      }
    }
    if (light === undefined) light = fx.holdLight("fire");
    light?.set(centre.clone().add(new THREE.Vector3(0, 1, 0)), k * (4 + 1.5 * Math.sin(t * 17) + (rng() - 0.5)), 0xff7a30, 5);
    // the body chars as it burns
    for (const [m, c] of base) (m as THREE.MeshStandardMaterial).color.copy(c).multiplyScalar(1 - 0.82 * Math.min(1, t / (secs * 0.8)));
    return true;
  };
}

// ---- the pipe bomb ----------------------------------------------------------------------
export interface PipeBombP {
  pos: THREE.Vector3;
  floorY?: number;
  ceilingY?: number;
  /** metres of blast */
  radius?: number;
}
export const pipeBomb: Effect<PipeBombP> = ({ fx, rng }, p) => {
  const R = p.radius ?? 3;
  const floorY = p.floorY ?? p.pos.y;
  const ground = new THREE.Vector3(p.pos.x, floorY, p.pos.z);
  // the flash: brighter than anything else in the show, gone in half a second
  fx.flash("blast", p.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 90, 0.55, 0xffd6a0, R * 6, 0.01);
  fx.spawn("sprites", { pos: p.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), life: 0.09, size: [R * 1.4, R * 1.4], frame: { kind: "fixed", frame: SPRITE.star }, glow: 1, color: [3, 2.6, 2], rot: range(rng, 0, 6.28), fadeIn: 0, fadeOut: 0.9 });
  // a quick ball of fire, not a big one: a pipe bomb is mostly blast. The gasoline render's
  // first half, played fast, is the fuel-less flash of a charge going off
  const blast = ["gas-burst", "explosion-hd", "explosion-a"].find((s) => fx.has(s));
  if (blast === "gas-burst") {
    // (its foot fades into the floor rather than being cut by it in a straight line)
    fx.spawn(blast, { pos: p.pos.clone().add(new THREE.Vector3(0, R * 0.42, 0)), life: 1.2, size: [R * 1.15, R * 1.15], rot: range(rng, -0.2, 0.2), alpha: 1, fadeIn: 0, fadeOut: 0.45, frame: { kind: "life", from: 2, to: 34 }, soft: [floorY, 0.3] });
  } else if (blast) {
    fx.spawn(blast, { pos: p.pos.clone().add(new THREE.Vector3(0, R * 0.25, 0)), life: 1.5, size: [R * 0.9, R], rot: range(rng, -0.3, 0.3), alpha: 1, fadeIn: 0, fadeOut: 0.4, frame: { kind: "life", to: 40 } });
  }
  // the dust thrown up out of the floor, and the ring rolling out along it (bottom of the card on the floor)
  // (each card's bottom tenth is under the floor: the renders' flat skirt of dust along the
  // ground is hidden by the floor rather than standing above it as a shelf)
  if (fx.has("dust-impact")) {
    const asp = fx.layer("dust-impact").sheet.aspect, w = R * 2.1;
    fx.spawn("dust-impact", { pos: ground.clone().add(new THREE.Vector3(0, w * asp * 0.42, 0)), life: 4.5, delay: 0.1, size: [w, w], color: [0.88, 0.85, 0.8], alpha: 0.8, fadeIn: 0.05, fadeOut: 0.4, frame: { kind: "life" }, soft: [floorY, 0.35] });
  }
  if (fx.has("dust-ring")) {
    const asp = fx.layer("dust-ring").sheet.aspect, w = R * 2.6;
    fx.spawn("dust-ring", { pos: ground.clone().add(new THREE.Vector3(0, w * asp * 0.42, 0)), life: 3.2, delay: 0.08, size: [w, w], color: [0.85, 0.82, 0.78], alpha: 0.7, fadeIn: 0.05, fadeOut: 0.45, frame: { kind: "life", to: 52 }, soft: [floorY, 0.3] });
  }
  // sparks and grit
  for (let i = 0; i < 40; i++) {
    const dir = inCone(rng, UP, 1.3, v3());
    fx.spawn("sprites", {
      pos: p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), vel: dir.multiplyScalar(range(rng, 3, 10)), life: range(rng, 0.4, 1), size: [0.02, 0.012], stretch: 0.04,
      frame: { kind: "fixed", frame: SPRITE.spark }, glow: 1, color: [2.2, 1.6, 0.9], colorEnd: [1.4, 0.45, 0.1], gravity: 9.8, drag: 1, floorY, bounce: 0.35, fadeIn: 0, fadeOut: 0.5,
    });
  }
  for (let i = 0; i < 46; i++) {
    const dir = inCone(rng, UP, 1.35, v3());
    fx.spawn("sprites", {
      pos: p.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), vel: dir.multiplyScalar(range(rng, 3, 11)), life: range(rng, 1.4, 2.6),
      size: [range(rng, 0.015, 0.05), range(rng, 0.015, 0.05)], rot: range(rng, 0, 6.28), spin: range(rng, -14, 14),
      frame: { kind: "fixed", frame: SPRITE.chip }, color: [0.24, 0.22, 0.2], gravity: 9.8, floorY, bounce: 0.25, fadeIn: 0, fadeOut: 0.2,
    });
  }
  // the scorch: on the floor under it, and on any wall close enough to have taken the blast
  const floor = floorUnder(fx, p.pos, 1.5);
  if (floor) scorch(fx, rng, "blast", floor, R * 1.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
    const d = new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)).normalize();
    const wall = fx.hit(p.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), d, R * 0.8);
    if (wall && Math.abs(wall.normal.y) < 0.5) scorch(fx, rng, "blast", wall, R * 0.9 * (1 - wall.distance / (R * 0.8)) + 0.4);
  }
  // dust shaken down from the ceiling, in streams, for a few seconds after
  const ceil = p.ceilingY;
  if (ceil !== undefined) {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R * 1.6;
      const at = new THREE.Vector3(p.pos.x + Math.cos(a) * r, ceil - 0.02, p.pos.z + Math.sin(a) * r);
      const start = range(rng, 0.15, 0.9);
      // a fine stream, falling and spreading: many faint motes, not a few blobs
      for (let k = 0; k < 14; k++) {
        fx.spawn("sprites", {
          pos: at.clone().add(new THREE.Vector3(range(rng, -0.04, 0.04), 0, range(rng, -0.04, 0.04))), delay: start + k * range(rng, 0.04, 0.14),
          vel: new THREE.Vector3(range(rng, -0.05, 0.05), -range(rng, 0.2, 0.6), range(rng, -0.05, 0.05)), life: range(rng, 1.8, 2.8), size: [range(rng, 0.03, 0.06), range(rng, 0.12, 0.3)],
          rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist }, color: [0.5, 0.48, 0.45], alpha: 0.28, gravity: 1.4, drag: 1.4,
          fadeIn: 0.15, fadeOut: 0.6,
        });
      }
      // and a bit of plaster or grit with it
      if (rng() < 0.6) {
        fx.spawn("sprites", {
          pos: at, delay: start, vel: v3(), life: 2, size: [0.02, 0.02], rot: range(rng, 0, 6.28), spin: range(rng, -8, 8),
          frame: { kind: "fixed", frame: SPRITE.chip }, color: [0.55, 0.53, 0.5], gravity: 9.8, floorY, bounce: 0.2, fadeIn: 0, fadeOut: 0.2,
        });
      }
    }
  }
  // the smoke it leaves hanging
  const smokes = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
  for (let i = 0; i < 5 && smokes.length; i++) {
    fx.spawn(pick(rng, smokes), {
      pos: p.pos.clone().add(new THREE.Vector3(range(rng, -0.6, 0.6), range(rng, 0.6, 1.4), range(rng, -0.6, 0.6))), delay: range(rng, 0.3, 0.8),
      vel: new THREE.Vector3(range(rng, -0.2, 0.2), range(rng, 0.2, 0.5), range(rng, -0.2, 0.2)), life: range(rng, 4, 6), size: [R * 0.5, R * 1.3],
      rot: range(rng, 0, 6.28), spin: range(rng, -0.2, 0.2), color: [0.22, 0.21, 0.2], alpha: 0.6, drag: 0.6, fadeIn: 0.1, fadeOut: 0.5,
      frame: { kind: "life", from: 18 },
    });
  }
  fx.shake(p.pos, 0.08, R * 6, 0.8, Math.floor(rng() * 1e9));
};

// ---- fire that spreads, and fire in a doorway ---------------------------------------------
// The server decides where fire goes (SURVIVORZ.md: a molotov's ~8 s patch that can spread,
// and can block a doorway); these draw it. Each is its own event with its own seed, so a late
// joiner replays the same fire. They share the molotov's flames, embers, smoke and scorch.

/** Black smoke rising off burning fuel to the ceiling, `thick` 0..1. */
function smokeUp(fx: FxSystem, rng: Rng, at: THREE.Vector3, spread: number, ceil: number, thick: number, size: number): void {
  const smokes = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
  if (!smokes.length) return;
  const y0 = at.y + 0.8;
  const vy = range(rng, 0.8, 1.3);
  const rise = Math.max(0.5, ceil - y0 - 0.4);
  fx.spawn(pick(rng, smokes), {
    pos: at.clone().add(new THREE.Vector3(range(rng, -0.3, 0.3) * spread, y0 - at.y, range(rng, -0.3, 0.3) * spread)),
    vel: new THREE.Vector3(range(rng, -0.15, 0.15), vy, range(rng, -0.15, 0.15)), drag: 0.25, life: rise / vy + range(rng, 1.5, 3),
    size: [0.7 * size, 2.2 * size + rise * 0.5], rot: range(rng, 0, 6.28), spin: range(rng, -0.25, 0.25),
    color: [0.07, 0.065, 0.06], alpha: 0.65 * thick, fadeIn: 0.1, fadeOut: 0.45,
    frame: { kind: "life", from: Math.floor(range(rng, 16, 24)) },
  });
}

/** An ember lifting off a fire. */
function ember(fx: FxSystem, rng: Rng, at: THREE.Vector3, ax: THREE.Vector3, w: number, depth: number): void {
  fx.spawn("sprites", {
    pos: at.clone().addScaledVector(ax, range(rng, -w, w)).add(new THREE.Vector3(range(rng, -depth, depth), 0.3, range(rng, -depth, depth))),
    vel: new THREE.Vector3(range(rng, -0.3, 0.3), range(rng, 0.9, 2.2), range(rng, -0.3, 0.3)), life: range(rng, 1, 2.2),
    size: [0.012, 0.007], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [1.6, 0.7, 0.2], colorEnd: [0.8, 0.15, 0.02], drag: 0.4, fadeIn: 0, fadeOut: 0.6,
  });
}

/** How strongly a fire burns `t` seconds in: catching, burning, dying over its last third. */
const burning = (t: number, burn: number, catching: number) => (t < catching ? t / catching : t > burn * 0.66 ? Math.max(0, (burn - t) / (burn * 0.34)) : 1);

export interface FirePatchP {
  /** the middle of the patch, on the floor */
  pos: THREE.Vector3;
  /** metres across it spreads */
  radius?: number;
  /** seconds it burns */
  burn?: number;
  floorY?: number;
  ceilingY?: number;
}

/** A patch of floor catching from fire beside it (no bottle, no fireball): it creeps out from
 *  where it caught over a second, burns, dies down, and leaves a scorch. */
export function firePatch(p: FirePatchP): Emitter {
  const R = p.radius ?? 0.8, burn = p.burn ?? 8;
  const ceil = p.ceilingY ?? (p.floorY ?? p.pos.y) + 3.2;
  const at = p.pos.clone();
  if (p.floorY !== undefined) at.y = p.floorY;
  let t = 0, nextFlame = 0, nextSmoke = 0.3, scorched = false;
  let light: HeldLight | null | undefined;
  return ({ fx, rng }, dt) => {
    t += dt;
    if (t >= burn + 4) {
      light?.release();
      return false;
    }
    const strength = burning(t, burn, 0.6);
    const spread = Math.min(1, t / 1);
    if (t < burn) {
      if (light === undefined) light = fx.holdLight("fire");
      nextFlame -= dt;
      while (nextFlame <= 0) {
        nextFlame += 0.03 / Math.max(0.15, strength);
        flames(fx, rng, at, R * spread, strength, 1);
      }
      if (rng() < dt * 8 * strength) ember(fx, rng, at, new THREE.Vector3(1, 0, 0), R * 0.6 * spread, R * 0.5 * spread);
      light?.set(at.clone().add(new THREE.Vector3(0, 0.6, 0)), strength * (6 + 2 * Math.sin(t * 12.3) + 1.5 * Math.sin(t * 27.1 + 0.7)), 0xff8030, 7);
    }
    nextSmoke -= dt;
    while (nextSmoke <= 0) {
      nextSmoke += 0.24 / Math.max(0.15, strength);
      smokeUp(fx, rng, at, R, ceil, Math.max(0.15, strength), R);
    }
    if (!scorched && t > 1) {
      scorched = true;
      const floor = floorUnder(fx, at);
      if (floor) scorch(fx, rng, "fuel", floor, R * 2.2);
    }
    return true;
  };
}

export interface FireSpreadP {
  /** where the burning fuel starts to run from */
  from: THREE.Vector3;
  /** where it runs to (and catches) */
  to: THREE.Vector3;
  /** metres a second the flame front runs along the fuel */
  speed?: number;
  /** how wide the trail of fuel is */
  width?: number;
  /** seconds the trail and the patch it reaches burn */
  burn?: number;
  /** a patch catches where it ends (false when it runs into a doorway: doorwayFire takes over) */
  patch?: boolean;
  radius?: number;
  floorY?: number;
  ceilingY?: number;
}

/** Fire running along spilled fuel: a front racing across the floor from the fire it came out
 *  of, the trail behind it burning low, and a patch catching where it ends. */
export function fireSpread(p: FireSpreadP): Emitter {
  const speed = p.speed ?? 2.4, width = p.width ?? 0.35, burn = p.burn ?? 8;
  const ceil = p.ceilingY ?? (p.floorY ?? p.from.y) + 3.2;
  const a = p.from.clone(), b = p.to.clone();
  if (p.floorY !== undefined) a.y = b.y = p.floorY;
  const run = b.clone().sub(a), len = Math.max(0.01, run.length());
  const ax = run.clone().divideScalar(len);
  const side = new THREE.Vector3(-ax.z, 0, ax.x);
  const arrive = len / speed;
  let t = 0, nextFlame = 0, nextSmoke = 0.4, caught = false, scorchedTo = 0;
  return ({ fx, rng }, dt) => {
    t += dt;
    const front = Math.min(len, t * speed);
    // the trail burns from when the front passed: catching, burning, dying, all on one clock
    const strength = burning(t, burn + arrive, 0.25);
    if (t >= burn + arrive + 4) return false;
    if (t < burn + arrive) {
      nextFlame -= dt;
      while (nextFlame <= 0) {
        nextFlame += 0.035 / Math.max(0.15, strength);
        // most of the fire right behind the front, where it has just caught
        const d = rng() < 0.7 ? Math.max(0, front - rng() * Math.min(front, 1.2)) : rng() * front;
        const at = a.clone().addScaledVector(ax, d).addScaledVector(side, range(rng, -0.5, 0.5) * width);
        flames(fx, rng, at, width * 0.4, strength, 0.75);
      }
      if (rng() < dt * 5 * strength) ember(fx, rng, a.clone().addScaledVector(ax, rng() * front), side, width * 0.4, 0.05);
    }
    nextSmoke -= dt;
    while (nextSmoke <= 0 && front > 0.2) {
      nextSmoke += 0.4 / Math.max(0.15, strength);
      smokeUp(fx, rng, a.clone().addScaledVector(ax, rng() * front), width, ceil, Math.max(0.15, strength) * 0.7, 0.6);
    }
    // the floor blackens behind the front: long marks overlapping along the run
    while (scorchedTo + 0.35 <= front) {
      scorchedTo += 0.35;
      const floor = floorUnder(fx, a.clone().addScaledVector(ax, scorchedTo - 0.17));
      if (floor) scorch(fx, rng, "fuel", floor, 0.75, ax);
    }
    // where it ends, a patch catches (its own emitter, its seed from this one)
    if (!caught && front >= len) {
      caught = true;
      if (p.patch !== false) fx.emit(firePatch({ pos: b, radius: p.radius ?? 0.7, burn, floorY: p.floorY, ceilingY: p.ceilingY }), Math.floor(rng() * 2 ** 31));
    }
    return true;
  };
}

export interface DoorwayFireP {
  /** the middle of the doorway, at the floor */
  pos: THREE.Vector3;
  /** across the doorway, jamb to jamb */
  along: THREE.Vector3;
  /** which way the doorway faces (either side: the smoke spills out of both) */
  normal: THREE.Vector3;
  width?: number;
  height?: number;
  /** seconds it burns */
  burn?: number;
  floorY?: number;
  ceilingY?: number;
}

/** Fire across a doorway, jamb to jamb: a wall of flame too tall to step through, its smoke
 *  rolling out under the lintel on both sides and up the wall over it, and the doorway
 *  blackened when it's out (the floor across it and the wall above the frame). */
export function doorwayFire(p: DoorwayFireP): Emitter {
  const W = p.width ?? 0.9, H = p.height ?? 2.1, burn = p.burn ?? 8;
  const ceil = p.ceilingY ?? (p.floorY ?? p.pos.y) + 3.2;
  const at = p.pos.clone();
  if (p.floorY !== undefined) at.y = p.floorY;
  const ax = p.along.clone().setY(0).normalize(), nrm = p.normal.clone().setY(0).normalize();
  let t = 0, nextFlame = 0, nextSmoke = 0.25, scorched = false;
  let light: HeldLight | null | undefined;
  return ({ fx, rng }, dt) => {
    t += dt;
    if (t >= burn + 5) {
      light?.release();
      return false;
    }
    const strength = burning(t, burn, 0.5);
    if (t < burn) {
      if (light === undefined) light = fx.holdLight("fire");
      nextFlame -= dt;
      while (nextFlame <= 0) {
        // (more than this and the overlapping tongues burn out to a flat white sheet)
        nextFlame += 0.024 / Math.max(0.15, strength);
        // jamb to jamb, tallest in the middle of the opening
        const u = range(rng, -0.5, 0.5);
        const f = at.clone().addScaledVector(ax, u * W * 0.92).addScaledVector(nrm, range(rng, -0.12, 0.12));
        flames(fx, rng, f, 0.1, strength, 1.15 + 0.45 * (1 - Math.abs(u) * 2));
      }
      if (rng() < dt * 14 * strength) ember(fx, rng, at, ax, W * 0.45, 0.1);
      light?.set(at.clone().add(new THREE.Vector3(0, 1, 0)), strength * (10 + 3 * Math.sin(t * 11.7) + 2 * Math.sin(t * 31.3 + 2.1) + (rng() - 0.5) * 1.5), 0xff8030, 9);
    }
    // the smoke: thick from the flames up to the lintel, then rolling out of the top of the
    // doorway on both sides and climbing the wall above it
    nextSmoke -= dt;
    const smokes = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    while (nextSmoke <= 0 && smokes.length) {
      const thick = Math.max(0.15, t < burn ? strength : 0.3 * (1 - (t - burn) / 5));
      nextSmoke += 0.11 / thick;
      const out = rng() < 0.5 ? 1 : -1;
      const top = at.clone().addScaledVector(ax, range(rng, -0.4, 0.4) * W).add(new THREE.Vector3(0, H - 0.15, 0)).addScaledVector(nrm, out * 0.12);
      const rise = Math.max(0.4, ceil - top.y);
      fx.spawn(pick(rng, smokes), {
        pos: top, vel: nrm.clone().multiplyScalar(out * range(rng, 0.35, 0.7)).add(new THREE.Vector3(range(rng, -0.1, 0.1), range(rng, 0.5, 0.9), 0)), drag: 0.35,
        life: rise / 0.7 + range(rng, 1.5, 3), size: [W * 0.8, W * 1.6 + rise * 0.6], rot: range(rng, 0, 6.28), spin: range(rng, -0.25, 0.25),
        color: [0.06, 0.055, 0.05], alpha: 0.7 * thick, fadeIn: 0.12, fadeOut: 0.45, frame: { kind: "life", from: Math.floor(range(rng, 16, 24)) },
      });
    }
    if (!scorched && t > 1.2) {
      scorched = true;
      const floor = floorUnder(fx, at);
      if (floor) scorch(fx, rng, "fuel", floor, W * 1.5);
      // the wall over the frame, from either side
      for (const s of [1, -1]) {
        const above = at.clone().add(new THREE.Vector3(0, H + 0.35, 0)).addScaledVector(nrm, s * 0.6);
        const wall = fx.hit(above, nrm.clone().multiplyScalar(-s), 0.8);
        if (wall && Math.abs(wall.normal.y) < 0.5) scorch(fx, rng, "blast", wall, W * 1.1);
      }
    }
    return true;
  };
}

// ---- a lit molotov: the rag burning in the bottle's neck -----------------------------------
export interface LitRagP {
  /** the rag's tip, each frame (null: the bottle has gone, thrown and broken or put out) */
  from: () => THREE.Vector3 | null;
}

/** A molotov lit and held, then thrown: a small fire on the rag, its flames leaning back from
 *  the way it's moving (a thrown bottle trails fire), embers and a thread of black smoke off
 *  it, and a flickering light in the hand when the pool can spare one. It ends when the
 *  bottle does — the molotov effect takes over where it breaks. */
export function litRag(p: LitRagP): Emitter {
  let t = 0, nextFlame = 0, nextSmoke = 0.2;
  let light: HeldLight | null | undefined;
  const last = new THREE.Vector3(), vel = new THREE.Vector3();
  let had = false;
  return ({ fx, rng }, dt) => {
    t += dt;
    const at = p.from();
    if (!at) {
      light?.release();
      return false;
    }
    // how it's moving: the flames trail behind it
    // (smoothed over a couple of frames: a jittery hand mustn't whip the flame about)
    if (had && dt > 0) vel.lerp(at.clone().sub(last).divideScalar(dt), 0.5);
    last.copy(at);
    had = true;
    const sheets = ["flame-a", "flame-b"].filter((s) => fx.has(s));
    const speed = vel.length();
    // catching: it takes half a second for the rag to burn up properly
    const k = Math.min(1, t / 0.5);
    nextFlame -= dt;
    while (nextFlame <= 0 && sheets.length) {
      // (faster when it moves: a thrown bottle draws an unbroken streak of fire, not dots)
      nextFlame += 0.05 / k / (1 + Math.min(3, speed * 0.4));
      const sheet = pick(rng, sheets);
      const h = range(rng, 0.11, 0.19) * (0.5 + 0.5 * k) * (1 + Math.min(1.5, speed * 0.08));
      const w = h * 0.6, ch = w * fx.layer(sheet).sheet.aspect;
      // still, the flame stands up off the rag; moving, it's left behind where the bottle was
      // (a world velocity of a quarter of the bottle's: the bottle runs on ahead of it)
      const back = vel.clone().multiplyScalar(0.25).add(new THREE.Vector3(range(rng, -0.05, 0.05), range(rng, 0.25, 0.45), range(rng, -0.05, 0.05)));
      fx.spawn(sheet, {
        pos: at.clone().add(new THREE.Vector3(0, ch * 0.3, 0)), vel: back, life: range(rng, 0.25, 0.45) / (1 + Math.min(1, speed * 0.1)), size: [w, w * 0.8],
        rot: range(rng, -0.15, 0.15), alpha: 0.9, fadeIn: 0.08, fadeOut: 0.45, frame: { kind: "life", from: Math.floor(range(rng, 0, 20)) }, color: FLAME_TINT,
      });
    }
    if (rng() < dt * 6 * k) {
      fx.spawn("sprites", {
        pos: at, vel: vel.clone().multiplyScalar(-0.4).add(new THREE.Vector3(range(rng, -0.25, 0.25), range(rng, 0.6, 1.4), range(rng, -0.25, 0.25))), life: range(rng, 0.6, 1.4),
        size: [0.008, 0.005], frame: { kind: "fixed", frame: SPRITE.dot }, glow: 1, color: [1.6, 0.7, 0.2], colorEnd: [0.8, 0.15, 0.02], drag: 0.6, fadeIn: 0, fadeOut: 0.6,
      });
    }
    nextSmoke -= dt;
    const smokes = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    while (nextSmoke <= 0 && smokes.length) {
      nextSmoke += 0.22;
      fx.spawn(pick(rng, smokes), {
        pos: at.clone().add(new THREE.Vector3(0, 0.12, 0)), vel: vel.clone().multiplyScalar(-0.3).add(new THREE.Vector3(0, range(rng, 0.4, 0.7), 0)), drag: 0.4,
        life: range(rng, 1.2, 2), size: [0.08, 0.3], rot: range(rng, 0, 6.28), spin: range(rng, -0.4, 0.4),
        color: [0.07, 0.065, 0.06], alpha: 0.35 * k, fadeIn: 0.1, fadeOut: 0.5, frame: { kind: "life", from: Math.floor(range(rng, 16, 24)) },
      });
    }
    if (light === undefined) light = fx.holdLight("fire");
    light?.set(at.clone().add(new THREE.Vector3(0, 0.1, 0)), k * (6 + 1.8 * Math.sin(t * 17.3) + 1.2 * Math.sin(t * 31.7 + 1.1) + (rng() - 0.5) * 1), 0xff8a3a, 6);
    return true;
  };
}
