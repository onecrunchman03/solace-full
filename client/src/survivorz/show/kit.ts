// SOLACE SURVIVORZ — THE SHOW: WHAT A SURVIVOR WEARS (Oct 28 2026). Pure placement maths, no three:
// actors.ts, scripts/survivorz/kit-fit.mjs (the headless fitter, which also WRITES kit-fit.json) and
// scripts/survivorz/kit-bench.html all place a backpack and a stowed weapon by these same functions.
//
// THE BODY FRAME, not a bone's own axes: the scanned bodies' bones point every which way, so the frame
// is built from bone POSITIONS each frame — origin the upper chest (spine_03), up along the spine
// (spine_02 → neck), right across the shoulders (upperarm_l → upperarm_r), forward = up × right. A pack
// laid in it leans when the body leans and turns when the chest turns, and never inherits a bone's roll.
//
// THE FIT IS MEASURED (kit-fit.json, written by kit-fit.mjs): per body and per pack, how far behind the
// chest the pack sits so the body never sinks into it across every clip the show plays with it on (the
// law's line: no limb in a body — and no body in a pack). A body with no fit wears nothing.
// IMPORT-FREE (the numbers come in through setKitFit) so plain Node and the bench can load it too.

export type PackId = "backpack-small" | "backpack-large";
export type V3 = [number, number, number];

/** per body, per pack: back = metres behind the chest origin (along −forward) to the pack model's
 *  origin; up = metres along the spine from the chest origin to the model's origin (its bottom);
 *  tilt = degrees the pack's top leans back off the spine; scale = the model's size on this body.
 *  THE MODELS (Fab "Survival Backpacks"): bottom at y 0, back panel (straps, the big one's hip belt)
 *  toward −z — measured off the meshes (kit-fit.mjs prints them). */
export interface PackFit {
  back: number; up: number; tilt: number; scale: number;
  /** the clips that would sink the body into the pack at `back` (a braced struggle, a lunge): how much
   *  further out it rides on its straps while they play — blended in by the clip's weight (actors.ts) */
  push?: Record<string, number>;
}
export interface KitFit { packs: Record<string, Partial<Record<PackId, PackFit>>>; stow: Record<string, Record<string, StowFit>> }
/** the measured numbers (kit-fit.json): actors.ts hands them in; the fitter and the bench hand in theirs */
export let PACK_FIT: KitFit = { packs: {}, stow: {} };
export function setKitFit(f: KitFit): void { PACK_FIT = f; }
/** THE CREATOR'S BODIES' FITS (the bake's "kit" step, served as body/kitfit.json): added beside the page's own,
 *  never over them — a body fitted in kit-fit.json keeps that fit (the loop speeds' and the gun seats' rule). */
export function addKitFit(f: Partial<KitFit> | null | undefined): void {
  for (const [b, v] of Object.entries(f?.packs ?? {})) if (v && typeof v === "object" && !PACK_FIT.packs[b]) PACK_FIT.packs[b] = v;
  for (const [b, v] of Object.entries(f?.stow ?? {})) if (v && typeof v === "object" && !PACK_FIT.stow[b]) PACK_FIT.stow[b] = v;
}

/** THE BIG PACK'S HIP BELT IS LEFT OFF: its two wings reach 20 cm forward round the wearer's hips, and
 *  no one belt fits seven bodies — measured, on Carla they sat in her hips and pushed the whole pack a
 *  hand's width off her back. A triangle wholly in this box (model metres) is dropped from the mesh. */
export const PACK_TRIM: Partial<Record<PackId, { yBelow: number; zBelow: number }>> = {
  "backpack-large": { yBelow: 0.3, zBelow: -0.08 },
};
/** drop a pack's trimmed triangles: an index list without them (null = nothing to trim). `at(i)` is vertex
 *  i in the PACK'S space (the file's root: its mesh node is moved, turned and scaled under it) */
export function trimIndex(pack: PackId, at: (i: number) => V3, index: ArrayLike<number> | null, count: number): number[] | null {
  const t = PACK_TRIM[pack];
  if (!t) return null;
  const out: number[] = [];
  const cut = (i: number) => { const p = at(i); return p[1] < t.yBelow && p[2] < t.zBelow; };
  for (let k = 0; k + 2 < count; k += 3) {
    const a = index ? index[k] : k, b = index ? index[k + 1] : k + 1, c = index ? index[k + 2] : k + 2;
    if (cut(a) && cut(b) && cut(c)) continue;
    out.push(a, b, c);
  }
  return out;
}

/** A pack comes OFF for these (and goes back on after): lying on your back on it, sitting back in a
 *  chair against it, sleeping. Nobody naps in a hiking pack, and on the floor it would sink into it. */
export function packOff(clip: string): boolean {
  return /laying|sleeping|sitting|death|dying|falling-down|laytoidle|receiving-cpr|lying/.test(clip);
}

export type StowFrame = "chest" | "hip" | "thigh_l" | "thigh_r";
/** a stowed thing (kit-fit.json, per body and slot): the frame it rides, where its pivot sits in it (right,
 *  up, forward metres), the frame directions its own +Y and +Z lie along, and the pivot (prop metres) */
export interface StowFit { frame: StowFrame; at: V3; y: V3; z: V3; pivot: V3 }

// ---- the frame ----------------------------------------------------------------------------------

type BoneAt = (name: string) => { matrixWorld: { elements: ArrayLike<number> } } | undefined;
const pos = (b: ReturnType<BoneAt>): V3 | null => (b ? [b.matrixWorld.elements[12], b.matrixWorld.elements[13], b.matrixWorld.elements[14]] : null);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export interface Frame { o: V3; up: V3; right: V3; fwd: V3 }
/** the body's chest frame (or the same axes at its hips); `spine` is where its up line starts (tried for
 *  packs: the hip → neck line sat a pack 3–5 cm further off a standing back than the chest's own lean,
 *  measured — so the chest's it is, and a run's lean is the PUSH's job) */
export function bodyFrame(bone: BoneAt, at: "chest" | "hip" = "chest", spine = "spine_02"): Frame | null {
  const s2 = pos(bone(spine)), nk = pos(bone("neck")), ul = pos(bone("upperarm_l")), ur = pos(bone("upperarm_r"));
  const o = pos(bone(at === "chest" ? "spine_03" : "hip"));
  if (!s2 || !nk || !ul || !ur || !o) return null;
  const up = norm(sub(nk, s2));
  const r0 = sub(ur, ul);
  const right = norm(add(r0, up, -dot(r0, up)));
  const fwd = norm(cross(up, right));
  return { o, up, right, fwd };
}

/** a column-major 4x4 from a basis and an origin (three's Matrix4.elements order) */
function basis(x: V3, y: V3, z: V3, o: V3, s: number, out: { elements: number[] | Float32Array }): void {
  const e = out.elements;
  e[0] = x[0] * s; e[1] = x[1] * s; e[2] = x[2] * s; e[3] = 0;
  e[4] = y[0] * s; e[5] = y[1] * s; e[6] = y[2] * s; e[7] = 0;
  e[8] = z[0] * s; e[9] = z[1] * s; e[10] = z[2] * s; e[11] = 0;
  e[12] = o[0]; e[13] = o[1]; e[14] = o[2]; e[15] = 1;
}

/** does this body wear this pack at all (a measured fit; Rollo has none) */
export function packMatrixFits(body: string, pack: PackId): boolean { return !!PACK_FIT.packs[body]?.[pack]; }

/** the push a clip asks of this pack on this body (0 for most) */
export function packPush(body: string, pack: PackId, clip: string): number { return PACK_FIT.packs[body]?.[pack]?.push?.[clip] ?? 0; }

/** the pack's world matrix on this body now, into `out` (`extra`: the playing clips' push, blended);
 *  false = this body wears none (no fit) */
export function packMatrix(body: string, pack: PackId, bone: BoneAt, out: { elements: number[] | Float32Array }, extra = 0): boolean {
  const fit = PACK_FIT.packs[body]?.[pack];
  const F = fit ? bodyFrame(bone) : null;
  if (!fit || !F) return false;
  // the model's +y along the spine leaning back by `tilt`, its +z (away from the panel) pointing BACK
  // out of the body, so the panel lies against the back
  const t = (fit.tilt * Math.PI) / 180;
  const y = norm(add(scl(F.up, Math.cos(t)), F.fwd, -Math.sin(t)));
  const z0 = scl(F.fwd, -1);
  const z = norm(add(z0, y, -dot(z0, y)));
  const x = norm(cross(y, z));
  basis(x, y, z, add(add(F.o, F.fwd, -(fit.back + extra)), F.up, fit.up), fit.scale, out);
  return true;
}

/** where a stowed thing goes. A pistol in a holster down the right thigh; a knife or hammer through the
 *  belt on the left; a long tool (crowbar, pipe, axe) or the rifle slung across the back — or, with a pack
 *  on, strapped down its side (the rifle on the left, a tool on the right) */
export function stowSlot(id: string, pack: PackId | null): string {
  if (id === "pistol") return "holster";
  if (/crowbar|lead-pipe|fire-axe|hk416|shotgun/.test(id)) return pack ? `${pack}:${id}` : `back:${id}`;
  return `belt:${id}`;
}

/** the frame a stowed thing rides: the chest's; the hips' (up the spine, across the thighs' roots); or a
 *  thigh's (down the thigh, so a holster swings with the leg the way a drop-leg holster does, and never
 *  through it) */
export function stowFrame(bone: BoneAt, f: StowFrame): Frame | null {
  if (f === "chest") return bodyFrame(bone);
  const hip = pos(bone("hip")), s2 = pos(bone("spine_02")), ll = pos(bone("upperleg_l")), lr = pos(bone("upperleg_r"));
  if (!hip || !s2 || !ll || !lr) return null;
  let o: V3, up: V3;
  if (f === "hip") { o = hip; up = norm(sub(s2, hip)); }
  else {
    const top = f === "thigh_l" ? ll : lr, knee = pos(bone(f === "thigh_l" ? "lowerleg_l" : "lowerleg_r"));
    if (!knee) return null;
    o = top; up = norm(sub(top, knee));
  }
  const r0 = sub(lr, ll);
  const right = norm(add(r0, up, -dot(r0, up)));
  return { o, up, right, fwd: norm(cross(up, right)) };
}

/** a stowed thing's world matrix: the prop's +Y and +Z laid along `y` and `z` (directions in the frame:
 *  right, up, forward), its `pivot` (a point in the prop's own space) at `at`; false = no fit */
export function stowMatrix(body: string, slot: string, bone: BoneAt, out: { elements: number[] | Float32Array }): boolean {
  const fit = PACK_FIT.stow[body]?.[slot];
  const F = fit ? stowFrame(bone, fit.frame) : null;
  if (!fit || !F) return false;
  const w = (v: V3): V3 => norm(add(add(scl(F.right, v[0]), F.up, v[1]), F.fwd, v[2]));
  const y = w(fit.y), z0 = w(fit.z);
  const z = norm(add(z0, y, -dot(z0, y)));
  const x = norm(cross(y, z));
  const at = add(add(add(F.o, F.right, fit.at[0]), F.up, fit.at[1]), F.fwd, fit.at[2]);
  const p = fit.pivot;
  const o: V3 = [at[0] - (x[0] * p[0] + y[0] * p[1] + z[0] * p[2]), at[1] - (x[1] * p[0] + y[1] * p[1] + z[1] * p[2]), at[2] - (x[2] * p[0] + y[2] * p[1] + z[2] * p[2])];
  basis(x, y, z, o, 1, out);
  return true;
}
