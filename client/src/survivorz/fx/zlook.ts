// SURVIVORZ EFFECTS — the zombies' look: the G-Strain tint, each copy's own blood, grime and
// colour, and the wounds they take (MECHANICS-BRIEF.md "Special effects"; SURVIVORZ.md §9).
//
// The survivors' look (body.ts) is a 1 MB texture each; there are ~80 zombies and 4 MB of
// memory left, so the zombies' is DRAWN, not painted: a few numbers per zombie and a short
// list of wound points, and the shader works out every pixel from the body's rest-pose
// position (its bind space, so nothing crawls as it moves). It lives INSIDE the
// dismemberment patch (gore.ts) — one patch, one program, so the two can never fight — and
// a severed piece shares its body's numbers, so a cut-off arm keeps its wounds and colour.
//
//   G-STRAIN (Josh, 2026-10-23: "dark deep purple"): the experiments' skin sunk to a deep
//     purple, darker veins through it, their blood purple-black.
//   EACH COPY (§9, "repeated faces: blood and grime variety, a slight colour shift, ±5%
//     size"): `variety(seed)` gives a copy its own skin shift, grime, old dried blood in its
//     own places, and the size to stand it at.
//   WOUNDS: a bullet (a hole, blood round it, a run down), a blunt blow (a dark bruise and a
//     split), a slash (a gash along the swing), the stomp (a crushed, blood-soaked head), and
//     FEEDING (blood round the mouth, run down the chin and chest). Twelve at a time; a
//     thirteenth takes the oldest's place.
import * as THREE from "three";
import { mulberry32, range } from "./rng";

export const ZWOUNDS = 12;
export type ZWoundKind = "bullet" | "blunt" | "slash" | "stomp" | "mouth";
const KIND: Record<ZWoundKind, number> = { bullet: 0, blunt: 1, slash: 2, stomp: 3, mouth: 4 };
/** each wound's size in metres, from the event's rng */
// (sized to read on a broadcast camera across a room: the first cut, true to a 9 mm hole, was
// a few pixels against the blood already painted into the zombies' textures)
const RADIUS: Record<ZWoundKind, [number, number]> = { bullet: [0.055, 0.075], blunt: [0.07, 0.1], slash: [0.09, 0.14], stomp: [0.12, 0.15], mouth: [0.06, 0.08] };

export interface ZLookUniforms {
  /** G-Strain 0..1, grime 0..1, old blood 0..1, the copy's noise offset */
  uZLook: { value: THREE.Vector4 };
  /** the copy's skin colour shift (a multiplier) */
  uZShift: { value: THREE.Vector3 };
  /** the copy's clothes: a tint and how faded (rgb multiplier; the fade is in w of uZFade) */
  uZCloth: { value: THREE.Vector4 };
  /** metres per bind-space unit */
  uZScale: { value: number };
  /** the feet's height in bind space (grime gathers low down) */
  uZFloor: { value: number };
  /** wounds: where (bind space) and radius (metres) */
  uZW: { value: THREE.Vector4[] };
  /** wounds: a direction (bind space, the slash's) and the kind (-1 = none) */
  uZWB: { value: THREE.Vector4[] };
}

export function zlookUniforms(): ZLookUniforms {
  return {
    uZLook: { value: new THREE.Vector4(0, 0, 0, 0) },
    uZShift: { value: new THREE.Vector3(1, 1, 1) },
    uZCloth: { value: new THREE.Vector4(1, 1, 1, 0) },
    uZScale: { value: 1 },
    uZFloor: { value: 0 },
    uZW: { value: Array.from({ length: ZWOUNDS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uZWB: { value: Array.from({ length: ZWOUNDS }, () => new THREE.Vector4(0, 0, 0, -1)) },
  };
}

/** Is this material skin (1), clothes (0) or neither (-1: eyes, teeth, hair)? From its name. */
export function skinOf(m: THREE.Material): number {
  const n = m.name.toLowerCase();
  if (/hair|eye|cornea|mouth|teeth|tongue|lash/.test(n)) return -1;
  return /body|head|skin|face|hand/.test(n) ? 1 : 0;
}

export const ZLOOK_VERT_HEAD = /* glsl */ `
attribute vec3 aZBind;
varying vec3 vZ;
`;
export const ZLOOK_VERT_MAIN = /* glsl */ `
#ifdef USE_SKINNING
  vZ = (bindMatrix * vec4(position, 1.0)).xyz;
#else
  vZ = aZBind;
#endif
`;
export const ZLOOK_FRAG_HEAD = /* glsl */ `
varying vec3 vZ;
uniform vec4 uZLook;
uniform vec3 uZShift;
uniform vec4 uZCloth;
uniform float uZScale;
uniform float uZFloor;
uniform float uZSkin;
uniform vec4 uZW[${ZWOUNDS}];
uniform vec4 uZWB[${ZWOUNDS}];
float zh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float zn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zh(i), zh(i + vec3(1, 0, 0)), f.x), mix(zh(i + vec3(0, 1, 0)), zh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(zh(i + vec3(0, 0, 1)), zh(i + vec3(1, 0, 1)), f.x), mix(zh(i + vec3(0, 1, 1)), zh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float zfbm(vec3 p) { return 0.55 * zn(p) + 0.3 * zn(p * 2.3) + 0.15 * zn(p * 5.1); }
float zWet = 0.0;
`;
export const ZLOOK_FRAG_COLOR = /* glsl */ `
  if (uZSkin > -0.5) {
    vec3 zp = (vZ - vec3(0.0, uZFloor, 0.0)) * uZScale;
    vec3 zq = zp + uZLook.w * 37.0;
    float zskin = uZSkin;
    // the copy's own skin, and its own clothes (a tint, sometimes faded): one face seen four
    // times shouldn't read as the same man four times
    diffuseColor.rgb *= mix(vec3(1.0), uZShift, zskin);
    float zcl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(zcl) * 1.15 + 0.02, uZCloth.w) * uZCloth.rgb, 1.0 - zskin);
    // G-STRAIN: dark deep purple, darker veins through it
    float zs = uZLook.x;
    float zlum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    // (deep, not bright: a bruise-dark purple that keeps the skin's own light and dark)
    vec3 zpurple = vec3(0.068, 0.02, 0.088) * (0.25 + 1.05 * zlum);
    diffuseColor.rgb = mix(diffuseColor.rgb, zpurple, zs * zskin * 0.78);
    float zridge = 1.0 - abs(zn(zq * 32.0) * 2.0 - 1.0);
    zridge = pow(zridge, 6.0) * (0.5 + 0.5 * zn(zq * 7.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.0, 0.06), clamp(zridge * zs * zskin * 1.7, 0.0, 0.85));
    // grime: stains with edges, worse low down; half as much on the skin
    float zlow = 1.0 - smoothstep(0.1, 1.2, zp.y);
    float zst = smoothstep(0.52, 0.6, zfbm(zq * 5.0) + 0.2 * zlow - 0.15 * (1.0 - uZLook.y));
    float zdirt = clamp(uZLook.y * (0.2 + 0.45 * zlow) + zst * 0.55 * uZLook.y, 0.0, 0.85) * (1.0 - 0.45 * zskin);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.36, 0.3, 0.24), zdirt);
    // old dried blood, in this copy's own places (more of it on the clothes)
    // (dried blood on cloth is near black-brown, stiff and matte, not red; patches, not a cast)
    vec3 zdried = mix(vec3(0.045, 0.012, 0.008), vec3(0.03, 0.006, 0.04), zs);
    float zob = smoothstep(0.66, 0.71, zfbm(zq * 6.0 + 11.0) + 0.03 * (1.0 - zskin)) * uZLook.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, zdried, zob * 0.8);
    // the wounds
    // fresh blood: brighter and wetter than the old blood painted into the texture, so a new
    // wound reads against it
    vec3 zfresh = mix(vec3(0.24, 0.02, 0.014), vec3(0.11, 0.012, 0.15), zs);
    float zblood = 0.0, zcore = 0.0, zbruise = 0.0;
    for (int i = 0; i < ${ZWOUNDS}; i++) {
      vec4 zw = uZW[i], zb = uZWB[i];
      if (zb.w < -0.5) continue;
      vec3 d = zp - (zw.xyz - vec3(0.0, uZFloor, 0.0)) * uZScale;
      float r = zw.w, k = zb.w;
      float n = zn(zp * 55.0 + float(i) * 3.1);
      // blood runs DOWN: below a wound the distance shrinks, above it grows
      vec3 dd = d;
      dd.y = d.y > 0.0 ? d.y * 1.5 : d.y * 0.28;
      float down = max(0.0, -d.y);
      float wob = (zn(vec3(zp.y * 28.0, float(i), 1.0)) - 0.5) * r * 0.3;
      float run = (1.0 - smoothstep(r * 0.06, r * 0.14, abs(d.x + wob))) * step(d.y, 0.0) * (1.0 - smoothstep(r * 2.0, r * 4.5, down));
      if (k < 0.5) {
        // a bullet: a dark hole, a ring of blood, a run
        float dl = length(d);
        zcore = max(zcore, 1.0 - smoothstep(r * 0.15, r * 0.24, dl + (n - 0.5) * r * 0.08));
        zblood = max(zblood, max(1.0 - smoothstep(r * 0.45, r * (0.75 + 0.3 * n), length(dd)), run * 0.95));
      } else if (k < 1.5) {
        // a blunt blow: a dark bruise, a split in the middle
        float dl = length(d);
        zbruise = max(zbruise, 1.0 - smoothstep(r * 0.45, r * (0.85 + 0.3 * n), dl));
        // the split where it landed, and the blood out of it
        zcore = max(zcore, (1.0 - smoothstep(r * 0.06, r * 0.12, abs(d.x * 0.8 + d.y * 0.6) + (n - 0.5) * r * 0.05)) * (1.0 - smoothstep(r * 0.25, r * 0.4, dl)));
        zblood = max(zblood, max((1.0 - smoothstep(r * 0.2, r * 0.5, length(dd))) * 0.9, run * 0.8));
      } else if (k < 2.5) {
        // a slash: a gash along the swing, blood along it and running from it
        vec3 dir = normalize(zb.xyz);
        float t = dot(d, dir);
        float perp = length(d - dir * t);
        float along = 1.0 - smoothstep(r * 0.75, r, abs(t));
        zcore = max(zcore, (1.0 - smoothstep(r * 0.03, r * 0.07, perp + (n - 0.5) * r * 0.04)) * along);
        vec3 dp = d - dir * clamp(t, -r, r);
        dp.y = dp.y > 0.0 ? dp.y * 1.5 : dp.y * 0.3;
        zblood = max(zblood, (1.0 - smoothstep(r * 0.1, r * (0.25 + 0.1 * n), length(dp))));
      } else if (k < 3.5) {
        // the stomp: crushed and soaked
        float dl = length(dd);
        zblood = max(zblood, 1.0 - smoothstep(r * 0.55, r * (0.9 + 0.25 * n), dl));
        zcore = max(zcore, (1.0 - smoothstep(r * 0.2, r * 0.45, length(d) + (n - 0.5) * r * 0.2)) * 0.8);
      } else {
        // feeding: round the mouth, run down the chin and chest
        vec3 dm = d;
        dm.y = d.y > 0.0 ? d.y * 2.2 : d.y * 0.18;
        zblood = max(zblood, 1.0 - smoothstep(r * 0.35, r * (0.75 + 0.35 * n), length(dm)));
      }
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.38, 0.2, 0.36) + vec3(0.02, 0.0, 0.02), zbruise * 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, zfresh, zblood * 0.93);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.004, 0.004), zcore);
    zWet = max(zblood, zcore * 0.6) + zs * zskin * 0.08;
  }
`;
export const ZLOOK_FRAG_ROUGH = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.32, clamp(zWet, 0.0, 1.0));   // wet, not a mirror
`;

/** One zombie's look: its numbers, shared by its body and every piece cut off it. */
/** a zombie's look as plain numbers (ZombieLook.state) */
export interface ZLookState {
  look: number[];
  shift: number[];
  cloth: number[];
  w: number[][];
  wb: number[][];
  next: number;
}

export class ZombieLook {
  readonly u = zlookUniforms();
  private next = 0;
  /** where the mouth is, in bind space (for feeding), found the first time it's needed */
  mouthBind: THREE.Vector3 | null = null;

  constructor(readonly meshes: THREE.SkinnedMesh[]) {
    const m = metresPerBindUnit(meshes);
    this.u.uZScale.value = m.scale;
    this.u.uZFloor.value = m.floor;
  }

  /** All of it as plain numbers (its settings and every wound), to be written down and laid
   *  back on a fresh copy after a restart. */
  get state(): ZLookState {
    const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
    const v4 = (v: THREE.Vector4) => v.toArray().map(r4);
    return {
      look: v4(this.u.uZLook.value), shift: this.u.uZShift.value.toArray().map(r4), cloth: v4(this.u.uZCloth.value),
      w: this.u.uZW.value.map(v4), wb: this.u.uZWB.value.map(v4), next: this.next,
    };
  }

  set state(s: ZLookState) {
    this.u.uZLook.value.fromArray(s.look);
    this.u.uZShift.value.fromArray(s.shift);
    this.u.uZCloth.value.fromArray(s.cloth);
    s.w.forEach((w, i) => this.u.uZW.value[i]?.fromArray(w));
    s.wb.forEach((w, i) => this.u.uZWB.value[i]?.fromArray(w));
    this.next = s.next;
  }

  /** G-Strain, grime and old blood (each 0..1), set by the show. */
  set(s: { strain?: number; grime?: number; blood?: number }): void {
    const v = this.u.uZLook.value;
    if (s.strain !== undefined) v.x = Math.min(1, Math.max(0, s.strain));
    if (s.grime !== undefined) v.y = Math.min(1, Math.max(0, s.grime));
    if (s.blood !== undefined) v.z = Math.min(1, Math.max(0, s.blood));
  }

  /** This copy's own look, from its seed: its skin shift, grime, old blood and where it is,
   *  and the G-Strain if it's an experiment. Returns the scale to stand it at (±5%). */
  variety(seed: number, kind: "outside" | "experiment" = "outside"): { scale: number } {
    const rng = mulberry32(seed);
    const bright = range(rng, 0.88, 1.1);
    this.u.uZShift.value.set(bright * range(rng, 0.94, 1.06), bright * range(rng, 0.94, 1.06), bright * range(rng, 0.94, 1.06));
    // the clothes: as they came, darker, warmer, cooler, or washed out
    const tints: [number, number, number, number][] = [[1, 1, 1, 0], [0.72, 0.72, 0.74, 0], [1.08, 0.96, 0.82, 0.1], [0.86, 0.95, 1.1, 0.1], [1.05, 1.03, 1.0, 0.55], [0.95, 1.05, 0.88, 0.2]];
    const [cr, cg, cb, cf] = tints[Math.floor(rng() * tints.length) % tints.length];
    const cb2 = range(rng, 0.9, 1.1);
    this.u.uZCloth.value.set(cr * cb2, cg * cb2, cb * cb2, cf);
    this.u.uZLook.value.set(kind === "experiment" ? 1 : 0, range(rng, 0.3, 0.85), range(rng, 0.2, 0.95), rng());
    return { scale: range(rng, 0.95, 1.05) };
  }

  /** A wound where `at` (world) meets the body; `dir` (world) is a slash's swing. Returns
   *  the slot it took, or -1 if the body isn't there. */
  wound(kind: ZWoundKind, at: THREE.Vector3, seed: number, dir?: THREE.Vector3): number {
    const near = nearestBind(this.meshes, at);
    if (!near) return -1;
    return this.place(kind, near.bind, seed, dir ? toBindDir(near.mesh, dir) : undefined);
  }

  /** A wound at a bind-space point (a replay from the server's record, or the mouth). */
  place(kind: ZWoundKind, bind: THREE.Vector3, seed: number, dir?: THREE.Vector3): number {
    const rng = mulberry32(seed);
    const i = this.next;
    this.next = (this.next + 1) % ZWOUNDS;
    const [lo, hi] = RADIUS[kind];
    this.u.uZW.value[i].set(bind.x, bind.y, bind.z, range(rng, lo, hi));
    const d = dir ?? new THREE.Vector3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1));
    this.u.uZWB.value[i].set(d.x, d.y, d.z, KIND[kind]);
    return i;
  }

  /** Feeding: blood round the mouth and down the chin, a little more each time. */
  feed(seed: number, mouthWorld?: THREE.Vector3): number {
    if (!this.mouthBind && mouthWorld) this.mouthBind = nearestBind(this.meshes, mouthWorld)?.bind ?? null;
    if (!this.mouthBind) return -1;
    return this.place("mouth", this.mouthBind, seed);
  }

  /** wounds in use, for the checks */
  get wounds(): number {
    return this.u.uZWB.value.filter((v) => v.w >= 0).length;
  }

  clear(): void {
    for (const v of this.u.uZWB.value) v.w = -1;
    this.next = 0;
  }
}

/** a world point to the nearest vertex of the posed body, and that vertex in bind space */
function nearestBind(meshes: THREE.SkinnedMesh[], at: THREE.Vector3): { bind: THREE.Vector3; mesh: THREE.SkinnedMesh } | null {
  let best = Infinity, bi = -1, bm: THREE.SkinnedMesh | null = null;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    if (skinOf(Array.isArray(m.material) ? m.material[0] : m.material) < 0) continue;
    m.updateMatrixWorld();
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      const d = v.distanceToSquared(at);
      if (d < best) {
        best = d;
        bi = i;
        bm = m;
      }
    }
  }
  if (!bm || best > 0.25 * 0.25) return null;
  return { bind: new THREE.Vector3().fromBufferAttribute(bm.geometry.getAttribute("position") as THREE.BufferAttribute, bi).applyMatrix4(bm.bindMatrix), mesh: bm };
}

/** a world direction into the body's bind space (the mesh's own frame, as near as matters
 *  for a slash's line) */
function toBindDir(m: THREE.SkinnedMesh, d: THREE.Vector3): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
  return d.clone().transformDirection(inv).transformDirection(m.bindMatrix);
}

/** metres per bind unit (the posed body's height in the world against its bind height), and
 *  the feet's bind height */
function metresPerBindUnit(meshes: THREE.SkinnedMesh[]): { scale: number; floor: number } {
  let blo = Infinity, bhi = -Infinity, wlo = Infinity, whi = -Infinity;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateMatrixWorld();
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 5) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.bindMatrix);
      blo = Math.min(blo, v.y);
      bhi = Math.max(bhi, v.y);
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      wlo = Math.min(wlo, v.y);
      whi = Math.max(whi, v.y);
    }
  }
  return { scale: bhi > blo ? (whi - wlo) / (bhi - blo) : 1, floor: Number.isFinite(blo) ? blo : 0 };
}

/** a static piece lifted off the body keeps its vertices' bind positions, for the look */
export function bindPositions(mesh: THREE.SkinnedMesh, order: number[]): THREE.BufferAttribute {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = new Float32Array(order.length * 3);
  const v = new THREE.Vector3();
  order.forEach((o, n) => {
    v.fromBufferAttribute(pos, o).applyMatrix4(mesh.bindMatrix);
    out[n * 3] = v.x;
    out[n * 3 + 1] = v.y;
    out[n * 3 + 2] = v.z;
  });
  return new THREE.BufferAttribute(out, 3);
}
