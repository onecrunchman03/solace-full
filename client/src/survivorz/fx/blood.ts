// SURVIVORZ EFFECTS — blood (docs/survivorz/EFFECTS.md step F2): the spray on a hit,
// the spurt, the spatter on walls and floor, the pool that spreads under a body, the
// trail where somebody is dragged, drips from a wound, and bloody prints. Zombie blood
// is darker and thicker; a survivor's is bright and runs.
//
// The marks are the ActionVFX photographs, baked by scripts/survivorz/fx-blood.mjs into
// two atlases (blood/blood.json says what each cell is):
//   "blood"  spatter — bursts, directional sprays (tail at +x), drops
//   "pools"  pools (they GROW: a spread map says the order they fill in), drag smears,
//            single footprints and handprints cut out of the photographs
// Both are WET when laid and dry over minutes, on the GPU (decals.ts): glossy and red,
// then matte and brown. Nothing here is a new draw: every mark is a slot in one of the
// two sets.
import * as THREE from "three";
import type { Effect, Emitter, FxSystem } from "./system";
import type { DecalAtlas } from "./decals";
import { SPRITE } from "./sprites";
import { inCone, pick, range, type Rng } from "./rng";

export type BloodKind = "human" | "zombie";
type RGB = [number, number, number];

interface BloodLook {
  /** the drops and mist in the air */
  drop: RGB;
  mist: RGB;
  /** × the photograph's colour, for the marks */
  mark: RGB;
  /** × a pool's colour (the pool photographs are much darker than the spatter) */
  pool: RGB;
  /** seconds a mark takes to dry */
  dry: number;
  /** how far it flies (thick blood doesn't go as far) */
  reach: number;
  drag: number;
  /** how much fine mist (thick blood hardly mists) */
  misting: number;
  /** how big the drops are */
  thick: number;
}

export const BLOOD: Record<BloodKind, BloodLook> = {
  human: { drop: [0.2, 0.01, 0.006], mist: [0.42, 0.02, 0.015], mark: [1, 1, 1], pool: [0.85, 0.85, 0.85], dry: 150, reach: 1, drag: 0.6, misting: 1, thick: 1 },
  // old, half-clotted: near black, heavy, short
  zombie: { drop: [0.07, 0.016, 0.007], mist: [0.16, 0.035, 0.015], mark: [0.42, 0.36, 0.34], pool: [0.36, 0.31, 0.3], dry: 420, reach: 0.72, drag: 1.1, misting: 0.35, thick: 1.45 },
};

interface CellInfo {
  cell: number;
  kind: string;
  from: string;
  parts?: [number, number, number, number][];
}
interface AtlasInfo {
  size: number;
  cols: number;
  rows: number;
  color: { png: string; ktx2?: string };
  normal: { png: string; ktx2?: string };
  spread?: { png: string; ktx2?: string };
  cells: CellInfo[];
}

export interface Print {
  cell: number;
  rect: [number, number, number, number];
  /** which foot (a footprint), or which hand */
  side: "l" | "r";
}

export interface BloodKit {
  /** kind → cells, per set */
  splat: Record<string, number[]>;
  pools: Record<string, number[]>;
  feet: Print[];
  hands: Print[];
  /** the runs' cells (scripts/survivorz/fx-runs.mjs), empty if they weren't baked */
  runs: number[];
  bytes: number;
}

/** Load both atlases and make the two decal sets (replacing any stand-in "blood" set). */
export async function loadBloodKit(fx: FxSystem): Promise<BloodKit> {
  const { load } = fx.opts;
  const man = await load.json<{ splat: AtlasInfo; pools: AtlasInfo }>("blood/blood.json");
  const tex = async (f: { png: string; ktx2?: string }, space: "srgb" | "linear") => {
    if (f.ktx2 && load.compressed) {
      const t = await load.compressed(`blood/${f.ktx2}`);
      t.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 8;
      return { t, topDown: true };
    }
    const t = await load.texture(`blood/${f.png}`, space);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return { t, topDown: false };
  };
  const atlas = async (a: AtlasInfo): Promise<DecalAtlas> => {
    const c = await tex(a.color, "srgb");
    return {
      map: c.t, normalMap: (await tex(a.normal, "linear")).t, spreadMap: a.spread ? (await tex(a.spread, "linear")).t : undefined,
      cols: a.cols, rows: a.rows, topDown: c.topDown,
    };
  };
  for (const name of ["blood", "pools"]) {
    const old = fx.decalSets.get(name);
    if (old) {
      fx.root.remove(old.mesh, old.keptRoot);
      fx.decalSets.delete(name);
    }
  }
  // spatter is many small marks; pools are few big ones over more of the floor's triangles
  const spatter = fx.addDecalSet("blood", await atlas(man.splat), 400, 48, { wet: true });
  // (96 triangles a pool: a 1.5 m pool on a floor tessellated every half metre takes ~50)
  const pools = fx.addDecalSet("pools", await atlas(man.pools), 96, 96, { wet: true });
  const byKind = (a: AtlasInfo) => {
    const out: Record<string, number[]> = {};
    for (const c of a.cells) (out[c.kind] ??= []).push(c.cell);
    return out;
  };
  const prints = (kind: string): Print[] => man.pools.cells.filter((c) => c.kind === kind).flatMap((c) =>
    (c.parts ?? []).map((rect) => ({ cell: c.cell, rect, side: (rect[0] + rect[2]) / 2 < 0.52 ? "l" as const : "r" as const })));
  // blood running down a wall: its own small set, wet like the rest, growing down the wall by
  // its spread map (fx-runs.mjs); optional, so a box without the bake still bleeds
  let runs: number[] = [], runBytes = 0;
  const old = fx.decalSets.get("runs");
  if (old) {
    fx.root.remove(old.mesh, old.keptRoot);
    fx.decalSets.delete("runs");
  }
  try {
    const r = await load.json<{ cols: number; rows: number; color?: { png: string; ktx2?: string }; normal: { png: string; ktx2?: string }; spread: { png: string; ktx2?: string } }>("blood/runs.json");
    if (r.color) {
      const c = await tex(r.color, "srgb");
      // (a run is a tall thin quad on a flat wall: few triangles)
      const set = fx.addDecalSet("runs", { map: c.t, normalMap: (await tex(r.normal, "linear")).t, spreadMap: (await tex(r.spread, "linear")).t, cols: r.cols, rows: r.rows, topDown: c.topDown }, 48, 32, { wet: true });
      // drawn over the spatter they run out of
      set.mesh.renderOrder = 6;
      runs = Array.from({ length: r.cols * r.rows }, (_, i) => i);
      runBytes = set.gpuBytes();
    }
  } catch {
    // no runs baked: walls take spatter only
  }
  return { splat: byKind(man.splat), pools: byKind(man.pools), feet: prints("footprints"), hands: prints("handprints"), runs, bytes: spatter.gpuBytes() + pools.gpuBytes() + runBytes };
}

// ---- small helpers ---------------------------------------------------------------------
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const Zp = new THREE.Vector3(0, 0, 1);
const v3 = () => new THREE.Vector3();

/** Cells of a kind in a set; without the kit (the check script's stand-in), any cell. */
function cellsOf(fx: FxSystem, set: "blood" | "pools", kind: string): number[] {
  const kit = fx.blood;
  const list = kit ? (set === "blood" ? kit.splat : kit.pools)[kind] : undefined;
  if (list?.length) return list;
  const d = fx.decalSets.get(set);
  return d ? Array.from({ length: d.atlas.cols * d.atlas.rows }, (_, i) => i) : [];
}

/** The spin that turns a decal's +x (or +y) along `along`, on a surface facing `normal`. */
export function spinAlong(normal: THREE.Vector3, along: THREE.Vector3, axis: "x" | "y" = "x"): number {
  const q = new THREE.Quaternion().setFromUnitVectors(Zp, normal.clone().normalize());
  const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q), y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const t = along.clone().addScaledVector(normal, -along.dot(normal));
  return axis === "x" ? Math.atan2(t.dot(y), t.dot(x)) : Math.atan2(-t.dot(x), t.dot(y));
}

/** The floor under a point (a registered surface facing up), within `reach` below it. */
function floorUnder(fx: FxSystem, at: THREE.Vector3, reach = 0.6) {
  const h = fx.hit(at.clone().add(new THREE.Vector3(0, 0.3, 0)), DOWN, reach + 0.3);
  return h && h.normal.y > 0.5 ? h : null;
}

/** A drop of blood landing: a small splat where it hit, `chance` of the time. */
export function dropSplat(fx: FxSystem, rng: Rng, kind: BloodKind, chance: number, size: [number, number]) {
  if (!fx.decalSets.has("blood") || rng() >= chance) return undefined;
  const cells = cellsOf(fx, "blood", "drop");
  return (at: THREE.Vector3) => {
    const floor = floorUnder(fx, at);
    if (!floor || !cells.length) return;
    fx.decal("blood", {
      target: floor.mesh, pos: floor.point, normal: floor.normal, size: range(rng, size[0], size[1]) * BLOOD[kind].thick ** 0.5, spin: range(rng, 0, 6.28),
      cell: pick(rng, cells), color: BLOOD[kind].mark, opacity: 0.95, dry: BLOOD[kind].dry,
    });
  };
}

/** A drop in flight, landing as a splat now and then. */
function drop(fx: FxSystem, rng: Rng, kind: BloodKind, pos: THREE.Vector3, vel: THREE.Vector3, floorY: number | undefined, splat: number, splatSize: [number, number] = [0.03, 0.09], delay = 0) {
  const L = BLOOD[kind];
  const sz = range(rng, 0.007, 0.02) * L.thick;
  fx.spawn("sprites", {
    pos, vel, life: 1.8, delay, size: [sz, sz], stretch: 0.012 / L.thick,
    frame: { kind: "fixed", frame: SPRITE.drop }, color: L.drop, gravity: 9.8, drag: L.drag, floorY, dieOnLand: true,
    fadeIn: 0, fadeOut: 0.05, onLand: dropSplat(fx, rng, kind, splat, splatSize),
  });
}

/** Spatter on a surface a hit came at along `dir`: a burst head-on, a spray glancing. */
export function spatter(fx: FxSystem, rng: Rng, kind: BloodKind, hit: { mesh: THREE.Mesh; point: THREE.Vector3; normal: THREE.Vector3; distance?: number }, dir: THREE.Vector3, size: number): void {
  if (!fx.decalSets.has("blood")) return;
  const d = dir.clone().normalize();
  const glance = 1 - Math.abs(d.dot(hit.normal));
  const L = BLOOD[kind];
  const sprays = cellsOf(fx, "blood", "spray"), bursts = cellsOf(fx, "blood", "burst");
  if (glance > 0.3 && sprays.length) {
    // the dense end where it struck, the tail thrown on along the shot
    const along = d.clone().addScaledVector(hit.normal, -d.dot(hit.normal)).normalize();
    const len = size * (1.3 + glance);
    fx.decal("blood", {
      target: hit.mesh, pos: hit.point.clone().addScaledVector(along, len * 0.3), normal: hit.normal, size: len, aspect: 0.55,
      spin: spinAlong(hit.normal, along) + range(rng, -0.12, 0.12), cell: pick(rng, sprays), color: L.mark, opacity: 0.95, dry: L.dry,
    });
  } else {
    // head-on: the wide mist it threw round itself, and a tighter, heavier one in the middle
    const cells = bursts.length ? bursts : sprays;
    for (const [k, a] of [[1.3, 0.75], [0.7, 0.95]]) {
      fx.decal("blood", {
        target: hit.mesh, pos: hit.point, normal: hit.normal, size: size * k, spin: range(rng, 0, 6.28),
        cell: pick(rng, cells), color: L.mark, opacity: a, dry: L.dry,
      });
    }
  }
}

// ---- blood running down a wall ----------------------------------------------------------
/** A run hanging from where blood hit a wall: three to six rivulets crawling down over
 *  several seconds (slower for a zombie's thick blood), each ending in a bead. Only on a wall
 *  steep enough for blood to run. The soaked band at the top of its cell sits on the hit. */
export function bloodRun(fx: FxSystem, rng: Rng, kind: BloodKind, hit: { mesh: THREE.Mesh; point: THREE.Vector3; normal: THREE.Vector3 }, width: number): boolean {
  const runs = fx.blood?.runs ?? [];
  if (!runs.length || !fx.decalSets.has("runs") || Math.abs(hit.normal.y) > 0.35) return false;
  const L = BLOOD[kind];
  const aspect = 2;
  const w = width * range(rng, 0.8, 1.1);
  // straight down the wall
  const down = DOWN.clone().addScaledVector(hit.normal, -DOWN.dot(hit.normal)).normalize();
  fx.decal("runs", {
    target: hit.mesh, pos: hit.point.clone().addScaledVector(down, w * aspect * 0.42), normal: hit.normal, size: w, aspect,
    spin: spinAlong(hit.normal, UP, "y") + range(rng, -0.03, 0.03), cell: pick(rng, runs), color: L.mark, opacity: 0.95, dry: L.dry * 1.5,
    grow: range(rng, 5, 11) * (kind === "zombie" ? 1.7 : 1),
  });
  return true;
}

// ---- a hit: the spray along the shot, the mist, the spatter behind -------------------
export interface BloodP {
  pos: THREE.Vector3;
  /** the shot's direction, so the spray leaves the far side */
  dir: THREE.Vector3;
  floorY?: number;
  /** 0..1, how much: a graze to a shotgun at close range */
  amount?: number;
  kind?: BloodKind;
}
export const bloodHit: Effect<BloodP> = ({ fx, rng }, p) => {
  const kind = p.kind ?? "human";
  const L = BLOOD[kind];
  const amt = p.amount ?? 0.6;
  const dir = p.dir.clone().normalize();
  const drops = Math.round((14 + 40 * amt) / Math.sqrt(L.thick));
  for (let i = 0; i < drops; i++) {
    const v = inCone(rng, dir, 0.5, v3()).multiplyScalar(range(rng, 1.5, 5.5) * (0.6 + amt) * L.reach);
    drop(fx, rng, kind, p.pos, v, p.floorY, 0.3);
  }
  // a few heavy ones that fall short, straight out of the wound
  for (let i = 0; i < 3 + amt * 4; i++) {
    drop(fx, rng, kind, p.pos, inCone(rng, dir, 1.2, v3()).multiplyScalar(range(rng, 0.3, 1.1)), p.floorY, 0.7, [0.05, 0.12]);
  }
  // the fine mist hanging where the round went through
  for (let i = 0; i < Math.round(4 * L.misting) + 1; i++) {
    fx.spawn("sprites", {
      pos: p.pos.clone().addScaledVector(dir, 0.05 + i * 0.04), vel: dir.clone().multiplyScalar(range(rng, 0.3, 0.8)), life: range(rng, 0.35, 0.6),
      size: [0.12 * (0.6 + amt), 0.3 * (0.6 + amt)], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist },
      color: L.mist, alpha: 0.7, drag: 3, fadeIn: 0, fadeOut: 0.7,
    });
  }
  // spatter on the wall behind, if there is one close enough
  const wall = fx.hit(p.pos, dir, 2.5 * L.reach);
  if (wall && wall.normal.y < 0.7) {
    spatter(fx, rng, kind, wall, dir, (0.25 + 0.45 * amt) * (1 + wall.distance * 0.35));
    // enough blood close enough runs down it
    if (amt >= 0.5 && wall.distance < 1.6 * L.reach && rng() < 0.35 + 0.5 * amt) bloodRun(fx, rng, kind, wall, 0.16 + 0.22 * amt);
  }
};

// ---- a spurt: an artery, a melee hit, a stump ------------------------------------------
export interface SpurtP {
  /** where it comes out and which way, each frame (null when it's gone) */
  from: () => { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  /** seconds of beating, getting weaker; then it oozes for a few more */
  secs?: number;
  /** how hard the first beat is, 0..1.5 */
  force?: number;
  floorY?: number;
  kind?: BloodKind;
}
export function bloodSpurt(p: SpurtP): Emitter {
  const kind = p.kind ?? "human";
  const L = BLOOD[kind];
  const secs = p.secs ?? 3, force = p.force ?? 1;
  let t = 0, nextBeat = 0, nextDrip = 0;
  return ({ fx, rng }, dt) => {
    t += dt;
    const at = p.from();
    if (!at || t > secs + 5) return false;
    const left = Math.max(0, 1 - t / secs);
    nextBeat -= dt;
    if (left > 0 && nextBeat <= 0) {
      // a beat: a jet of drops, weaker and slower each time (a zombie's heart barely does it)
      nextBeat += (kind === "zombie" ? 0.7 : 0.42) + (1 - left) * 0.5;
      for (let i = 0; i < (8 + 14 * left) * force; i++) {
        drop(fx, rng, kind, at.pos, inCone(rng, at.dir, 0.18, v3()).multiplyScalar(range(rng, 1.2, 2.8) * (0.35 + left) * force * L.reach), p.floorY, 0.22, [0.04, 0.1], i * 0.008);
      }
    }
    nextDrip -= dt;
    if (nextDrip <= 0) {
      nextDrip += range(rng, 0.15, 0.5) * (kind === "zombie" ? 1.6 : 1);
      drop(fx, rng, kind, at.pos, at.dir.clone().multiplyScalar(0.1), p.floorY, 0.5, [0.025, 0.06]);
    }
    return true;
  };
}

// ---- drips from a wound, while somebody walks ------------------------------------------
export interface DripP {
  /** where the wound is, each frame (null when it's gone) */
  from: () => THREE.Vector3 | null;
  secs?: number;
  /** drops a second */
  rate?: number;
  floorY?: number;
  kind?: BloodKind;
}
export function woundDrips(p: DripP): Emitter {
  const kind = p.kind ?? "human";
  const secs = p.secs ?? 20, rate = p.rate ?? 2.5;
  let t = 0, next = 0;
  return ({ fx, rng }, dt) => {
    t += dt;
    const at = p.from();
    if (!at || t > secs) return false;
    next -= dt;
    // it slows as the wound starts to close
    while (next <= 0) {
      next += range(rng, 0.5, 1.5) / rate * (1 + t / secs);
      drop(fx, rng, kind, at.clone().add(new THREE.Vector3(range(rng, -0.02, 0.02), 0, range(rng, -0.02, 0.02))), new THREE.Vector3(0, -0.2, 0), p.floorY, 0.85, [0.025, 0.06]);
    }
    return true;
  };
}

// ---- a pool that spreads out under a body ---------------------------------------------
export interface PoolP {
  /** about where the body lies (the pool is laid on the floor under it) */
  pos: THREE.Vector3;
  /** metres across when it's done */
  size?: number;
  /** seconds to spread */
  grow?: number;
  kind?: BloodKind;
}
export const bloodPool: Effect<PoolP> = ({ fx, rng }, p) => {
  if (!fx.decalSets.has("pools")) return;
  const kind = p.kind ?? "human";
  const floor = floorUnder(fx, p.pos, 1.5);
  if (!floor) return;
  fx.decal("pools", {
    target: floor.mesh, pos: floor.point, normal: floor.normal, size: (p.size ?? 1.2) * range(rng, 0.9, 1.1), spin: range(rng, 0, 6.28),
    cell: pick(rng, cellsOf(fx, "pools", "pool")), color: BLOOD[kind].pool, opacity: 1, depth: 0.4,
    // a pool stays wet a long time; zombie blood barely spreads before it sets
    dry: BLOOD[kind].dry * 2, grow: (p.grow ?? 10) * (kind === "zombie" ? 1.6 : 1),
  });
};

// ---- a trail: somebody dragged, or crawling -------------------------------------------
export interface TrailP {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** metres across */
  width?: number;
  /** 0..1, how much blood is left to leave */
  amount?: number;
  kind?: BloodKind;
}
export const bloodTrail: Effect<TrailP> = ({ fx, rng }, p) => {
  if (!fx.decalSets.has("pools")) return;
  const kind = p.kind ?? "human";
  const w = p.width ?? 0.45, amt = p.amount ?? 1;
  const span = p.to.clone().sub(p.from);
  const len = span.length();
  if (len < 0.05) return;
  const along = span.clone().divideScalar(len);
  const smears = cellsOf(fx, "pools", "smear");
  // long smears laid with heavy overlap, so it reads as one mark thinning out, not a row of stamps
  const step = w * 0.7;
  for (let s = 0; s < len; s += step * range(rng, 0.85, 1.05)) {
    const at = p.from.clone().addScaledVector(along, s + step / 2).add(new THREE.Vector3(range(rng, -0.04, 0.04) * w, 0, range(rng, -0.04, 0.04) * w));
    const floor = floorUnder(fx, at, 1);
    if (!floor) continue;
    const k = amt * (1 - 0.5 * (s / len));
    fx.decal("pools", {
      target: floor.mesh, pos: floor.point, normal: floor.normal, size: step * 2.6, aspect: w / (step * 2.6),
      spin: spinAlong(floor.normal, along) + range(rng, -0.06, 0.06), cell: pick(rng, smears),
      color: BLOOD[kind].mark, opacity: 0.35 + 0.45 * k, dry: BLOOD[kind].dry,
    });
  }
};

// ---- prints: a foot that stepped in it, a hand on a wall -------------------------------
export interface FootP {
  /** where the foot came down */
  pos: THREE.Vector3;
  /** the way the foot points */
  dir: THREE.Vector3;
  foot: "l" | "r";
  /** 0..1: soaked, down to the last faint print */
  strength?: number;
  /** metres heel to toe */
  length?: number;
  kind?: BloodKind;
}
export const bloodyFootprint: Effect<FootP> = ({ fx, rng }, p) => {
  const feet = fx.blood?.feet ?? [];
  if (!feet.length || !fx.decalSets.has("pools")) return;
  const floor = floorUnder(fx, p.pos);
  if (!floor) return;
  // the right print of the right foot, or the other foot's mirrored
  const same = feet.filter((f) => f.side === p.foot);
  const f = same.length ? pick(rng, same) : pick(rng, feet);
  const [x0, y0, x1, y1] = f.rect;
  const len = p.length ?? 0.3;
  const s = p.strength ?? 1;
  fx.decal("pools", {
    target: floor.mesh, pos: floor.point, normal: floor.normal, size: len * ((x1 - x0) / (y1 - y0)), aspect: (y1 - y0) / (x1 - x0),
    // the print's toe is up its cell: +y along the way the foot points
    spin: spinAlong(floor.normal, p.dir, "y") + range(rng, -0.06, 0.06), cell: f.cell, rect: f.rect, flip: f.side !== p.foot,
    color: BLOOD[p.kind ?? "human"].mark, opacity: Math.max(0.15, Math.min(1, s)), dry: BLOOD[p.kind ?? "human"].dry * 0.5,
  });
};

export interface HandP {
  /** a point on (or just off) the wall */
  pos: THREE.Vector3;
  /** the wall's normal there */
  normal: THREE.Vector3;
  /** roughly the way the fingers point (up, by default) */
  up?: THREE.Vector3;
  /** dragged down the wall instead of planted */
  smear?: boolean;
  kind?: BloodKind;
}
export const bloodyHandprint: Effect<HandP> = ({ fx, rng }, p) => {
  if (!fx.decalSets.has("pools")) return;
  const n = p.normal.clone().normalize();
  const wall = fx.hit(p.pos.clone().addScaledVector(n, 0.3), n.clone().negate(), 0.6);
  if (!wall) return;
  const L = BLOOD[p.kind ?? "human"];
  const up = p.up ?? new THREE.Vector3(0, 1, 0);
  if (p.smear) {
    // hands clawing down a wall
    fx.decal("pools", {
      target: wall.mesh, pos: wall.point, normal: wall.normal, size: 0.6, spin: spinAlong(wall.normal, up, "y") + range(rng, -0.3, 0.3),
      cell: pick(rng, cellsOf(fx, "pools", "handsmear")), color: L.mark, opacity: 0.95, dry: L.dry,
    });
    return;
  }
  const hands = fx.blood?.hands ?? [];
  if (!hands.length) return;
  const h = pick(rng, hands);
  const [x0, y0, x1, y1] = h.rect;
  const size = 0.24;
  fx.decal("pools", {
    target: wall.mesh, pos: wall.point, normal: wall.normal, size: size * Math.max(1, (x1 - x0) / (y1 - y0)), aspect: (y1 - y0) / (x1 - x0),
    spin: spinAlong(wall.normal, up, "y") + range(rng, -0.7, 0.7), cell: h.cell, rect: h.rect, flip: rng() < 0.5,
    color: L.mark, opacity: 0.95, dry: L.dry,
  });
};

// ---- drops flung hard: melee and cast-off ------------------------------------------------
/** A wall or ceiling mark waiting for its drop to get there. */
interface Strike { at: number; mark: () => void }

/** A drop flung hard (a melee hit, a cast-off). Traced along its own arc with the particles'
 *  own physics, so one that meets a wall or the ceiling before the floor leaves a streak
 *  THERE, drawn out the way it was going, at the moment it arrives; one that reaches the
 *  floor falls as an ordinary drop. Everything random is drawn now, never when the mark
 *  lands, so every observer's copy is the same. */
function flung(fx: FxSystem, rng: Rng, kind: BloodKind, pos: THREE.Vector3, vel: THREE.Vector3, floorY: number | undefined, strikes: Strike[], delay: number, splat: number, splatSize: [number, number] = [0.02, 0.06]) {
  const L = BLOOD[kind];
  const p = pos.clone(), v = vel.clone(), q = v3(), seg = v3();
  const step = 1 / 60;
  for (let t = step; t < 1.2; t += step) {
    q.copy(p);
    v.multiplyScalar(Math.exp(-L.drag * step));
    v.y -= 9.8 * step;
    p.addScaledVector(v, step);
    if (floorY !== undefined && p.y <= floorY) break;
    seg.subVectors(p, q);
    const len = seg.length();
    const h = len > 1e-6 ? fx.hit(q, seg.divideScalar(len), len) : null;
    if (!h || h.normal.y >= 0.5) continue;
    // it meets a wall (or the ceiling) first: in flight until then, then a streak there
    // (sized to read across a room on the broadcast, like the wounds: true to life, 2-5 cm,
    // it was invisible at 3.5 m)
    const sz = range(rng, 0.007, 0.018) * L.thick;
    fx.spawn("sprites", {
      pos, vel, life: t, delay, size: [sz, sz], stretch: 0.012 / L.thick,
      frame: { kind: "fixed", frame: SPRITE.drop }, color: L.drop, gravity: 9.8, drag: L.drag, fadeIn: 0, fadeOut: 0.02,
    });
    const sprays = cellsOf(fx, "blood", "spray");
    if (!fx.decalSets.has("blood") || !sprays.length) return;
    const speed = v.length(), along = v.clone().normalize();
    const mark = {
      target: h.mesh, pos: h.point.clone(), normal: h.normal.clone(), size: Math.min(0.2, 0.05 + 0.02 * speed) * L.thick ** 0.5, aspect: 0.36,
      spin: spinAlong(h.normal, along) + range(rng, -0.08, 0.08), cell: pick(rng, sprays), color: L.mark, opacity: 0.92, dry: L.dry,
    };
    strikes.push({ at: delay + t, mark: () => { fx.decal("blood", mark); } });
    return;
  }
  drop(fx, rng, kind, pos, vel, floorY, splat, splatSize, delay);
}

/** Lays each waiting mark when its drop arrives. */
function runStrikes(fx: FxSystem, strikes: Strike[]) {
  if (!strikes.length) return;
  strikes.sort((a, b) => a.at - b.at);
  let clock = 0, i = 0;
  fx.emit((_ctx, dt) => {
    clock += dt;
    while (i < strikes.length && strikes[i].at <= clock) strikes[i++].mark();
    return i < strikes.length;
  }, 0);
}

export type MeleeKind = "claw" | "sharp" | "blunt" | "stomp";
export interface MeleeP {
  /** where it struck */
  pos: THREE.Vector3;
  /** which way the blow went into the body */
  dir: THREE.Vector3;
  /** which way the weapon (or the claws) was travelling as it struck: the blood goes on that way */
  swing?: THREE.Vector3;
  /** claw: a zombie's scratch; sharp: knife, axe; blunt: pipe, hammer, bat; stomp: a boot on a zombie down */
  weapon: MeleeKind;
  /** 0..1, how much */
  amount?: number;
  floorY?: number;
  kind?: BloodKind;
}

/** A melee hit's blood. Unlike a round there's no mist: blood is thrown off what struck,
 *  so it goes on the way the blow was travelling. A scratch is three rakes of fine drops; a
 *  blade throws a line of them; a blunt blow bursts them back and out round it; a stomp
 *  throws them out along the floor round the boot, and leaves a pool under it. */
export const meleeHit: Effect<MeleeP> = ({ fx, rng }, p) => {
  const kind = p.kind ?? "human";
  const L = BLOOD[kind];
  const amt = p.amount ?? 0.6;
  const dir = p.dir.clone().normalize();
  const swing = (p.swing ?? p.dir).clone().normalize();
  const side = new THREE.Vector3().crossVectors(swing, dir);
  if (side.lengthSq() < 1e-4) side.crossVectors(UP, dir);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const n = (base: number, extra: number) => Math.round((base + extra * amt) / Math.sqrt(L.thick));
  const strikes: Strike[] = [];
  switch (p.weapon) {
    case "claw":
      // three rakes, a claw's width apart, each flicking a few fine drops on along the swipe
      for (let c = -1; c <= 1; c++) {
        const o = p.pos.clone().addScaledVector(side, c * 0.022);
        for (let i = 0; i < 2 + Math.round(3 * amt); i++) {
          flung(fx, rng, kind, o, inCone(rng, swing, 0.35, v3()).multiplyScalar(range(rng, 1.2, 3.2) * L.reach), p.floorY, strikes, i * 0.012, 0.25, [0.012, 0.03]);
        }
      }
      break;
    case "sharp":
      // a line of drops off the edge, thrown on along the swing
      for (let i = 0; i < n(10, 16); i++) {
        const o = p.pos.clone().addScaledVector(swing, range(rng, -0.06, 0.06));
        flung(fx, rng, kind, o, inCone(rng, swing, 0.22, v3()).multiplyScalar(range(rng, 2, 5) * (0.6 + amt) * L.reach), p.floorY, strikes, i * 0.006, 0.35);
      }
      for (let i = 0; i < 2 + amt * 3; i++) drop(fx, rng, kind, p.pos, inCone(rng, DOWN, 0.6, v3()).multiplyScalar(range(rng, 0.2, 0.8)), p.floorY, 0.7, [0.04, 0.1]);
      break;
    case "blunt": {
      // a burst back toward the swing and out round where it landed: heavier drops, slower
      const back = dir.clone().negate().lerp(swing, 0.5).normalize();
      for (let i = 0; i < n(12, 22); i++) {
        flung(fx, rng, kind, p.pos, inCone(rng, back, 0.9, v3()).multiplyScalar(range(rng, 0.8, 3.2) * (0.5 + amt) * L.reach), p.floorY, strikes, i * 0.004, 0.4, [0.03, 0.08]);
      }
      for (let i = 0; i < 2 + amt * 4; i++) drop(fx, rng, kind, p.pos, inCone(rng, DOWN, 0.8, v3()).multiplyScalar(range(rng, 0.3, 1)), p.floorY, 0.8, [0.05, 0.12]);
      break;
    }
    case "stomp":
      // out along the floor all round the boot, low, and a pool spreading under it
      for (let i = 0; i < n(16, 20); i++) {
        const a = range(rng, 0, Math.PI * 2);
        const v = new THREE.Vector3(Math.cos(a), range(rng, 0.25, 1), Math.sin(a)).multiplyScalar(range(rng, 0.8, 2.8) * L.reach);
        flung(fx, rng, kind, p.pos, v, p.floorY, strikes, i * 0.003, 0.5, [0.03, 0.08]);
      }
      bloodPool({ fx, rng, now: fx.now }, { pos: p.pos, size: 0.35 + 0.3 * amt, grow: 1.5, kind });
      break;
  }
  runStrikes(fx, strikes);
};

export interface CastOffP {
  /** where the weapon's tip is as the backswing starts */
  from: THREE.Vector3;
  /** which way the tip travels through the backswing (up and back, usually) */
  along: THREE.Vector3;
  /** metres the tip travels while it's throwing blood */
  arc?: number;
  /** the swing's turning axis (default: level, square to `along`); the release direction turns
   *  about it through the throw, which is what fans the drops into a line */
  axis?: THREE.Vector3;
  /** 0..1, how bloody the weapon is */
  amount?: number;
  floorY?: number;
  kind?: BloodKind;
}

/** Blood flicked off a weapon on the backswing: drops let go one after another as the tip
 *  travels, so they land in a LINE across a wall or the ceiling, each drawn out the way it
 *  flew. The pattern a crime scene reads a swing from. */
export const castOff: Effect<CastOffP> = ({ fx, rng }, p) => {
  const kind = p.kind ?? "human";
  const L = BLOOD[kind];
  const amt = p.amount ?? 0.6;
  const along = p.along.clone().normalize();
  const arc = p.arc ?? 0.6;
  const count = Math.round((5 + 9 * amt) / Math.sqrt(L.thick));
  const axis = (p.axis ?? new THREE.Vector3().crossVectors(along, UP)).clone();
  if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
  axis.normalize();
  // the tip goes round an arc: each drop leaves along the tip's travel AT ITS MOMENT, so the
  // releases fan out through about 50 degrees in the swing's plane
  const SWEEP = 0.9;
  const strikes: Strike[] = [];
  for (let i = 0; i < count; i++) {
    const f = count > 1 ? i / (count - 1) : 0;
    const o = p.from.clone().addScaledVector(along, f * arc);
    const leave = along.clone().applyAxisAngle(axis, (f - 0.5) * SWEEP);
    const v = inCone(rng, leave, 0.04, v3()).multiplyScalar(range(rng, 5, 6.5) * L.reach);
    flung(fx, rng, kind, o, v, p.floorY, strikes, f * 0.18, 0.4, [0.02, 0.05]);
  }
  runStrikes(fx, strikes);
};

// ---- a cough bringing up blood ------------------------------------------------------------
export interface CoughP {
  /** the mouth (BodyLook / findMouth), and which way the head faces */
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** 0..1: a spatter (0.3) to a mouthful (1) */
  amount?: number;
  /** a fist over the mouth (body.ts handAtMouth): the blood goes into it, a little mist gets
   *  out round it, and a drop or two falls from it */
  hand?: THREE.Vector3 | null;
  floorY?: number;
}

/** A cough bringing up blood: a fine mist hanging in front of the mouth for a moment, and a
 *  few drops thrown forward and down that land as small marks. Only in the last stage of
 *  infection, and only some coughs (the show decides): a tell for the viewers, kept small.
 *  The blood left at the lips is BodyLook.coughedBlood. Always a survivor's blood. */
export const coughBlood: Effect<CoughP> = ({ fx, rng }, p) => {
  const L = BLOOD.human;
  const amt = p.amount ?? 0.6;
  const out = p.dir.clone().setY(0).normalize().add(new THREE.Vector3(0, -0.35, 0)).normalize();
  if (p.hand) {
    // into a fist: a thin mist escaping round the sides of it, and a drop or two off it
    const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
    for (const s2 of [-1, 1]) {
      fx.spawn("sprites", {
        pos: p.hand.clone().addScaledVector(side, s2 * 0.05), vel: side.clone().multiplyScalar(s2 * range(rng, 0.2, 0.4)).addScaledVector(out, 0.15), life: range(rng, 0.3, 0.5),
        size: [0.04 + 0.03 * amt, 0.08 + 0.05 * amt], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist },
        color: L.mist, alpha: 0.3 + 0.15 * amt, drag: 3, fadeIn: 0, fadeOut: 0.7,
      });
    }
    for (let i = 0; i < 1 + Math.round(2 * amt); i++) {
      drop(fx, rng, "human", p.hand.clone().add(new THREE.Vector3(range(rng, -0.02, 0.02), -0.03, range(rng, -0.02, 0.02))), new THREE.Vector3(range(rng, -0.1, 0.1), range(rng, -0.3, 0), range(rng, -0.1, 0.1)), p.floorY, 0.7, [0.012, 0.03], range(rng, 0.05, 0.6));
    }
    return;
  }
  for (let i = 0; i < 2 + Math.round(2 * amt); i++) {
    fx.spawn("sprites", {
      pos: p.pos.clone().addScaledVector(out, 0.03 + i * 0.03), vel: out.clone().multiplyScalar(range(rng, 0.35, 0.7)), life: range(rng, 0.35, 0.6),
      size: [0.05 + 0.05 * amt, 0.12 + 0.1 * amt], rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist },
      color: L.mist, alpha: 0.45 + 0.25 * amt, drag: 3, fadeIn: 0, fadeOut: 0.7,
    });
  }
  for (let i = 0; i < 3 + Math.round(9 * amt); i++) {
    drop(fx, rng, "human", p.pos, inCone(rng, out, 0.45, v3()).multiplyScalar(range(rng, 0.6, 2.2)), p.floorY, 0.5, [0.012, 0.035], i * 0.006);
  }
};

// ---- a body dragged: the smear laid behind it as it goes -----------------------------------
export interface DragP {
  /** where the bleeding part of the body is touching the floor, each frame (null: let go) */
  from: () => THREE.Vector3 | null;
  /** metres across the smear (a torso, ~0.4; a leg, ~0.2) */
  width?: number;
  /** 0..1, how much blood there is to leave: it thins out as it's used */
  amount?: number;
  /** still bleeding: it never runs out (a wound that hasn't been closed) */
  bleeding?: boolean;
  kind?: BloodKind;
}

/** A body dragged across the floor (SURVIVORZ.md: a downed survivor can be dragged): the smear
 *  laid behind it as it moves, the way it moved, long marks overlapping so it reads as one
 *  streak rather than a row of stamps, thinning out as the blood is used — unless the wound's
 *  still open. Nothing when it's still; it ends when it's let go. */
export function dragSmear(p: DragP): Emitter {
  const w = p.width ?? 0.4;
  const step = w * 0.7;
  const kind = p.kind ?? "human";
  let left = p.amount ?? 1;
  let last: THREE.Vector3 | null = null;
  return ({ fx, rng }) => {
    const at = p.from();
    if (!at) return false;
    if (!last) {
      last = at.clone();
      return true;
    }
    const moved = at.clone().sub(last).setY(0);
    const d = moved.length();
    if (d < step) return true;
    if (!fx.decalSets.has("pools") || left <= 0.02) {
      last.copy(at);
      return left > 0.02 || !!p.bleeding;
    }
    const along = moved.divideScalar(d);
    const mid = last.clone().addScaledVector(along, d / 2);
    const floor = floorUnder(fx, mid, 1);
    if (floor) {
      const smears = cellsOf(fx, "pools", "smear");
      fx.decal("pools", {
        target: floor.mesh, pos: floor.point, normal: floor.normal, size: d * 2.4, aspect: w / (d * 2.4),
        spin: spinAlong(floor.normal, along) + range(rng, -0.05, 0.05), cell: pick(rng, smears),
        color: BLOOD[kind].mark, opacity: 0.3 + 0.5 * left, dry: BLOOD[kind].dry,
      });
    }
    // a metre of floor takes about a fifth of what's there, unless it keeps coming
    if (!p.bleeding) left *= Math.exp(-d / 4.5);
    last.copy(at);
    return true;
  };
}
