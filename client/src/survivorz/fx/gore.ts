// SURVIVORZ EFFECTS — dismemberment (docs/survivorz/EFFECTS.md §7: "graphic, and
// dismemberment is IN"; the pieces approved by Josh 2026-10-22).
//
// THE ZOMBIES DON'T COME CUT UP: each is one skinned body on an Auto-Rig Pro
// skeleton. So the cut is made at runtime, three ways at once:
//
//  1. THE BODY. Every vertex carries, per cut SITE, its signed distance past that
//     site's cut plane, measured once in the bind pose and only for the limb's own
//     bones (`aCutA/B/C`). The zombie's materials are patched to drop every
//     fragment past an active cut, so the cut is a clean plane through the
//     triangles and stays welded to the skin as the body animates.
//  2. THE STUMP. The helper session's cap (`fx/gore/caps/<site>.glb`: a wound
//     face, radius 1, +Y out of the body, +Z to its front, a skin skirt down to
//     y = -0.2) is fitted to the limb's measured cross-section at the cut and
//     parented to the bone above it.
//  3. THE PIECE. The severed part's triangles are lifted out of the body as it
//     stands at that instant — a small STATIC mesh, a few hundred triangles,
//     cheaper than a second skinned body — with its own cap, and thrown as a
//     rigid piece (rigid.ts).
//
// Then the blood: spurts from the stump in time with a heart that's slowing,
// drips off the piece, a splat where it lands, and meat. A head can also BURST
// (a close shotgun, the pipe bomb): no head piece, skull, jaw and brain instead.
//
// Every number comes from the event's seed; the pose comes from the animation
// everyone already shares. So every observer sees the same arm land in the same
// place.
import * as THREE from "three";
import type { FxSystem } from "./system";
import { inCone, mulberry32, pick, range, type Rng } from "./rng";
import { SPRITE } from "./sprites";
import { supportPoints } from "./rigid";
import { textureBytes } from "./particles";
import { BLOOD, bloodSpurt, dropSplat, type BloodKind } from "./blood";
import { ZombieLook, bindPositions, skinOf, ZLOOK_FRAG_COLOR, ZLOOK_FRAG_HEAD, ZLOOK_FRAG_ROUGH, ZLOOK_VERT_HEAD, ZLOOK_VERT_MAIN, type ZLookUniforms, type ZLookState } from "./zlook";

export type Site = "neck" | "upperarm.l" | "upperarm.r" | "forearm.l" | "forearm.r" | "thigh.l" | "thigh.r" | "shin.l" | "shin.r";

/** Slot of each site in the cut attributes: A.xyzw, B.xyzw, C. */
export const SITES: Site[] = ["neck", "upperarm.l", "upperarm.r", "forearm.l", "forearm.r", "thigh.l", "thigh.r", "shin.l", "shin.r"];

/** A bone's name as a key: the glTF loader strips dots, so "arm_stretch.l" arrives as
 *  "arm_stretchl"; compare on letters only, lower case. */
const key = (n: string) => n.replace(/[^a-z0-9]/gi, "").toLowerCase();

interface Rig {
  /** the bone the cut is across, and the joint it runs to */
  from: string;
  to: string;
  /** how far along from → to the cut lies */
  t: number;
  /** the bones on the far side (keys) */
  chain: (k: string) => boolean;
  /** the helper's cap model for this site */
  cap: "neck" | "upperarm" | "forearm" | "thigh" | "shin";
  /** a cut here makes these impossible (they went with it) */
  takes: Site[];
  /** bones whose skin goes with the piece WHEREVER it hangs (the head's hair below a neck
   *  cut); everything else is decided by the plane */
  whole?: (k: string) => boolean;
}

/** The same sites on the survivors' rig: only the bones; the far side comes from the
 *  skeleton (measure). */
function humanRig(site: Site): Rig {
  const base = rigFor(site);
  if (site === "neck") return { ...base, from: "neck", to: "head" };
  const [part, side] = site.split(".") as [string, "l" | "r"];
  const bones: Record<string, [string, string]> = { upperarm: ["upperarm", "lowerarm"], forearm: ["lowerarm", "hand"], thigh: ["upperleg", "lowerleg"], shin: ["lowerleg", "foot"] };
  const [from, to] = bones[part];
  return { ...base, from: `${from}${side}`, to: `${to}${side}` };
}

const FINGERS = /^(index|middle|pinky|ring|thumb)/;
function rigFor(site: Site): Rig {
  if (site === "neck") {
    return { from: "neckx", to: "headx", t: 0.45, cap: "neck", takes: [], whole: (k) => k !== "neckx", chain: (k) => k === "neckx" || k === "headx" || k.startsWith("c") && !k.startsWith("chest") || k.startsWith("teeth") };
  }
  const [part, side] = site.split(".") as [string, "l" | "r"];
  const s = (k: string) => k.endsWith(side);
  const arm = (k: string) => s(k) && (k.startsWith("arm") || k.startsWith("forearm") || k.startsWith("hand") || FINGERS.test(k));
  const fore = (k: string) => s(k) && (k.startsWith("forearm") || k.startsWith("hand") || FINGERS.test(k));
  const leg = (k: string) => s(k) && (k.startsWith("thigh") || k.startsWith("leg") || k.startsWith("foot") || k.startsWith("toes"));
  const shin = (k: string) => s(k) && (k.startsWith("leg") || k.startsWith("foot") || k.startsWith("toes"));
  switch (part) {
    case "upperarm": return { from: `armstretch${side}`, to: `forearmstretch${side}`, t: 0.5, cap: "upperarm", chain: arm, takes: [`forearm.${side}` as Site] };
    case "forearm": return { from: `forearmstretch${side}`, to: `hand${side}`, t: 0.55, cap: "forearm", chain: fore, takes: [] };
    case "thigh": return { from: `thighstretch${side}`, to: `legstretch${side}`, t: 0.5, cap: "thigh", chain: leg, takes: [`shin.${side}` as Site] };
    default: return { from: `legstretch${side}`, to: `foot${side}`, t: 0.55, cap: "shin", chain: shin, takes: [] };
  }
}

// ---- the shader patch -----------------------------------------------------------
// A material is drawn with three uniforms holding each site's MODE: 0 inactive,
// +1 drop what's past the cut (the body), -1 drop what ISN'T (the severed piece).
// A vertex's value per site is mode × distance (or -1 where inactive); the
// fragment is dropped if the largest is above zero.
const CUT_VERT_HEAD = /* glsl */ `
attribute vec4 aCutA;
attribute vec4 aCutB;
attribute float aCutC;
uniform vec4 uCutA;
uniform vec4 uCutB;
uniform float uCutC;
varying float vCut;
float fxCutOne(float d, float m) { return m == 0.0 ? -1.0 : m * d; }
`;
const CUT_VERT_MAIN = /* glsl */ `
  vCut = max(max(max(fxCutOne(aCutA.x, uCutA.x), fxCutOne(aCutA.y, uCutA.y)), max(fxCutOne(aCutA.z, uCutA.z), fxCutOne(aCutA.w, uCutA.w))),
             max(max(max(fxCutOne(aCutB.x, uCutB.x), fxCutOne(aCutB.y, uCutB.y)), max(fxCutOne(aCutB.z, uCutB.z), fxCutOne(aCutB.w, uCutB.w))), fxCutOne(aCutC, uCutC)));
`;
const CUT_FRAG_HEAD = /* glsl */ `
varying float vCut;
`;
const CUT_FRAG_MAIN = /* glsl */ `
  if (vCut > 0.0) discard;
`;

interface CutUniforms {
  uCutA: { value: THREE.Vector4 };
  uCutB: { value: THREE.Vector4 };
  uCutC: { value: number };
}

/** A copy of `src` that can be cut — and that wears the zombie's look (zlook.ts), drawn in
 *  the same patch so the two never fight. Every copy shares one program (the cache key is
 *  fixed); each has its own cut uniforms, and the look's are the zombie's, shared by its
 *  body and every piece cut off it. */
function cuttable(src: THREE.Material, look?: ZLookUniforms): THREE.Material & { userData: { cut: CutUniforms } } {
  const m = src.clone() as THREE.Material & { userData: { cut: CutUniforms } };
  const zl = look ? { ...look, uZSkin: { value: skinOf(src) } } : null;
  // a material that already carries a patch (a survivor's look, body.ts) keeps it: clone()
  // doesn't copy onBeforeCompile, and a turned survivor would lose their grey on being cut
  // (a piece's material is made from its body's, which is already a cut copy: it wraps what
  // that copy wrapped, never the copy itself, or the cut would be patched in twice)
  const origin = cutOrigin.get(src) ?? { prev: src.onBeforeCompile, key: src.customProgramCacheKey() };
  cutOrigin.set(m, origin);
  const prev = origin.prev;
  const prevKey = origin.key;
  // (every cut off: a bare Vector4 is (0, 0, 0, 1), which switched the fourth site of each
  // vector ON — every zombie came without its left hand and its left foot)
  const u: CutUniforms = { uCutA: { value: new THREE.Vector4(0, 0, 0, 0) }, uCutB: { value: new THREE.Vector4(0, 0, 0, 0) }, uCutC: { value: 0 } };
  m.userData = { ...src.userData, cut: u };
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = CUT_VERT_HEAD + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + CUT_VERT_MAIN);
    shader.fragmentShader = CUT_FRAG_HEAD + shader.fragmentShader.replace("void main() {", "void main() {\n" + CUT_FRAG_MAIN);
    if (zl) {
      Object.assign(shader.uniforms, zl);
      shader.vertexShader = ZLOOK_VERT_HEAD + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + ZLOOK_VERT_MAIN);
      shader.fragmentShader = ZLOOK_FRAG_HEAD + shader.fragmentShader
        .replace("#include <map_fragment>", "#include <map_fragment>\n" + ZLOOK_FRAG_COLOR)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + ZLOOK_FRAG_ROUGH);
    }
  };
  // (the key carries the earlier patch's, so a survivor's cut program is its own)
  const base = zl ? "fx-cut-look-v2" : "fx-cut-v1";
  m.customProgramCacheKey = () => (prevKey && prevKey.startsWith("fx-") ? `${prevKey}+${base}` : base);
  return m;
}

/** what each cut copy wrapped: the material's own patch before the cut's */
const cutOrigin = new WeakMap<THREE.Material, { prev: THREE.Material["onBeforeCompile"]; key: string }>();

function setMode(u: CutUniforms, site: Site, mode: number): void {
  const i = SITES.indexOf(site);
  if (i < 4) u.uCutA.value.setComponent(i, mode);
  else if (i < 8) u.uCutB.value.setComponent(i - 4, mode);
  else u.uCutC.value = mode;
}

// ---- measuring a model, once ------------------------------------------------------
interface SiteFrame {
  /** the cut's frame in bind space: origin, +Y along the limb (outward), +Z to the front */
  bind: THREE.Matrix4;
  /** the cross-section's half-widths along the frame's X and Z */
  rx: number;
  rz: number;
  /** which bone the stump rides, and which the piece hung from */
  bone: number;
}
interface ModelCut {
  sites: Partial<Record<Site, SiteFrame>>;
  /** skin vertices right at each cut, [mesh, vertex], for its colour */
  skin: Partial<Record<Site, [number, number][]>>;
  /** that colour, once read (null = couldn't read the texture) */
  tints: Partial<Record<Site, THREE.Color | null>>;
}

/** Bind-space position of a bone. */
function boneBind(sk: THREE.Skeleton, i: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert());
}

/** Compute and attach `aCutA/B/C` to a skinned geometry, and measure each site's frame.
 *  Geometry is shared by every instance of a model, so this runs once a model. */
function measure(meshes: THREE.SkinnedMesh[]): ModelCut {
  const sk = meshes[0].skeleton;
  // bone names without a prefix every bone shares (one survivor's export puts its whole file
  // name in front of each: "rp_sophia_animated_003_idling_upperarm_l")
  const raw = sk.bones.map((b) => key(b.name));
  let pre = raw[0] ?? "";
  for (const k of raw) while (pre && !k.startsWith(pre)) pre = pre.slice(0, -1);
  if (raw.some((k) => k === pre)) pre = "";
  const keys = raw.map((k) => k.slice(pre.length));
  const idx = new Map(keys.map((k, i) => [k, i]));
  // THE SURVIVORS' RIG (upperarm_l, lowerarm_l, upperleg_l, lowerleg_l, foot_l, neck, head) —
  // a turned survivor is cut like any of the dead. Its far side is the cut bone's own
  // descendants in the skeleton, which no name list can get wrong
  const human = idx.has("upperarml") && !idx.has("armstretchl");
  const below = (i: number): Set<number> => {
    const out = new Set<number>();
    sk.bones[i].traverse((o) => { const j = sk.bones.indexOf(o as THREE.Bone); if (j >= 0) out.add(j); });
    return out;
  };
  const cut: ModelCut = { sites: {}, skin: {}, tints: {} };
  const front = new THREE.Vector3(0, 0, 1);
  const planes: ({ p: THREE.Vector3; n: THREE.Vector3; chain: Set<number>; whole: Set<number> } | null)[] = SITES.map((site) => {
    const r = human ? humanRig(site) : rigFor(site);
    const a = idx.get(r.from), b = idx.get(r.to);
    if (a === undefined || b === undefined) return null;
    const pa = boneBind(sk, a), pb = boneBind(sk, b);
    const n = pb.clone().sub(pa).normalize();
    const p = pa.clone().lerp(pb, r.t);
    const chain = new Set<number>();
    const whole = new Set<number>();
    if (human) {
      for (const i of below(a)) chain.add(i);
      if (site === "neck") for (const i of below(b)) whole.add(i);
    } else {
      sk.bones.forEach((_bone, i) => {
        const k = keys[i];
        if (r.chain(k)) {
          chain.add(i);
          if (r.whole?.(k)) whole.add(i);
        }
      });
    }
    // the cut's frame: +Y along the limb, +Z toward the body's front
    const z = front.clone().addScaledVector(n, -front.dot(n));
    if (z.lengthSq() < 1e-4) z.set(0, 1, 0).addScaledVector(n, -n.y);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(n, z).normalize();
    cut.sites[site] = { bind: new THREE.Matrix4().makeBasis(x, n, z).setPosition(p), rx: 0, rz: 0, bone: a };
    return { p, n, chain, whole };
  });
  const v = new THREE.Vector3();
  const samples: [number, number][][] = SITES.map(() => []);
  for (const [mi, mesh] of meshes.entries()) {
    const g = mesh.geometry;
    // what the cap is sized to: hair, eyes and teeth never; for the neck the skin alone (a
    // collar may stand round a neck stump), for a limb the sleeve or trouser too (a cap
    // smaller than the trouser leg would leave a see-through ring)
    const matName = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name.toLowerCase();
    const anyMeasure = !/hair|eye|cornea|mouth|teeth/.test(matName);
    // (a survivor is one material — the whole scan IS the body, and the median filter below
    // drops a collar standing off the neck; reading only body/head/skin materials gave the
    // survivors' neck a cap of radius 0)
    const skin = human || /body|head|skin/.test(matName);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const si = g.getAttribute("skinIndex") as THREE.BufferAttribute;
    const sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
    const A = new Float32Array(pos.count * 4), B = new Float32Array(pos.count * 4), C = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      for (let s = 0; s < SITES.length; s++) {
        const pl = planes[s];
        let d = -1;
        if (pl) {
          let w = 0, ww = 0;
          for (let k = 0; k < 4; k++) {
            const b = si.getComponent(i, k), x = sw.getComponent(i, k);
            if (pl.chain.has(b)) w += x;
            if (pl.whole.has(b)) ww += x;
          }
          if (w >= 0.5) {
            d = v.clone().sub(pl.p).dot(pl.n);
            if (ww >= 0.5) d = Math.max(d, 0.004);
            // the cross-section: every vertex right at the cut, sorted out below
            if (Math.abs(d) < 0.025 && anyMeasure && (s !== 0 || skin)) {
              const f = cut.sites[SITES[s]]!;
              const off = v.clone().sub(pl.p);
              samples[s].push([off.dot(new THREE.Vector3().setFromMatrixColumn(f.bind, 0)), off.dot(new THREE.Vector3().setFromMatrixColumn(f.bind, 2))]);
              if (skin) ((cut.skin[SITES[s]] ??= []).length < 48) && cut.skin[SITES[s]]!.push([mi, i]);
            }
          }
        }
        if (s < 4) A[i * 4 + s] = d;
        else if (s < 8) B[i * 4 + s - 4] = d;
        else C[i] = d;
      }
    }
    g.setAttribute("aCutA", new THREE.BufferAttribute(A, 4));
    g.setAttribute("aCutB", new THREE.BufferAttribute(B, 4));
    g.setAttribute("aCutC", new THREE.BufferAttribute(C, 1));
  }
  // THE CROSS-SECTION IS THE SKIN, NOT THE MAX: hair hanging past the neck and a collar
  // standing off it are near the cut too, and the largest of them made the neck's cap a
  // dish 2.5 times its width. So keep what lies near the median radius, and take the
  // 95th percentile of that across each axis.
  SITES.forEach((site, s) => {
    const f = cut.sites[site];
    const pts = samples[s];
    if (!f || pts.length < 4) return;
    const rad = pts.map(([x, z]) => Math.hypot(x, z)).sort((a, b) => a - b);
    const med = rad[Math.floor(rad.length / 2)];
    const near = pts.filter(([x, z]) => Math.hypot(x, z) < med * 1.6);
    const p95 = (a: number[]) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
    f.rx = p95(near.map(([x]) => Math.abs(x)));
    f.rz = p95(near.map(([, z]) => Math.abs(z)));
  });
  return cut;
}

const modelCache = new WeakMap<THREE.BufferGeometry, ModelCut>();

// ---- the kit: caps, gibs, their materials -------------------------------------------
export interface GoreManifest {
  sets: Record<string, {
    size: number;
    normal: { png: string; ktx2?: string };
    fresh: { color: { png: string; ktx2?: string }; roughness: { png: string; ktx2?: string } };
    /** the caps' skin band: 1 on the skin and the skirt, 0 on the wound (linear) */
    skinMask?: { png: string; ktx2?: string };
  }>;
  caps: { name: string; site: string; side: "stump" | "piece"; file: string; set: string }[];
  gibs: { name: string; file: string; set?: string; sets?: Record<string, string> }[];
}

export interface GoreKit {
  /** "<site>:<side>" → the cap, wearing its set's TINTABLE material (white until a stump is cut) */
  caps: Map<string, THREE.Object3D>;
  gibs: Map<string, THREE.Object3D>;
  /** what its textures hold on the GPU */
  bytes: number;
}

/** Load the helper's pieces and texture sets once (fresh sets only; dried come later). */
export async function loadGoreKit(fx: FxSystem): Promise<GoreKit> {
  const load = fx.opts.load;
  if (!load.model) throw new Error("fx: the loader can't load models (FxLoader.model)");
  const man = await load.json<GoreManifest>("gore/gore.json");
  const tex = async (f: { png: string; ktx2?: string }, space: "srgb" | "linear") => {
    const t = f.ktx2 && load.compressed ? await load.compressed(`gore/${f.ktx2}`) : await load.texture(`gore/${f.png}`, space);
    t.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false; // both stored top row first, the glTF way
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  for (const [id, set] of Object.entries(man.sets)) {
    const m = new THREE.MeshStandardMaterial({
      name: `gore:${id}`, map: await tex(set.fresh.color, "srgb"), normalMap: await tex(set.normal, "linear"),
      roughnessMap: await tex(set.fresh.roughness, "linear"), roughness: 1, metalness: 0,
    });
    // a cap's skin is painted neutral grey with a mask, so each stump takes its own
    // zombie's skin colour (the helper's build, 2026-10-22)
    if (set.skinMask) tintable(m, await tex(set.skinMask, "linear"));
    mats.set(id, m);
  }
  const dress = (o: THREE.Object3D, set?: string, sets?: Record<string, string>) => {
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      const id = sets?.[name] ?? set ?? name;
      const mat = mats.get(id);
      if (mat) mesh.material = mat;
      mesh.castShadow = false;
      mesh.frustumCulled = true;
    });
    return o;
  };
  const caps = new Map<string, THREE.Object3D>(), gibs = new Map<string, THREE.Object3D>();
  for (const c of man.caps) caps.set(`${c.site}:${c.side}`, dress(await load.model(`gore/${c.file}`), c.set));
  for (const g of man.gibs) gibs.set(g.name, dress(await load.model(`gore/${g.file}`), g.set, g.sets));
  let bytes = 0;
  for (const m of mats.values()) bytes += textureBytes(m.map) + textureBytes(m.normalMap) + textureBytes(m.roughnessMap);
  return { caps, gibs, bytes };
}

// ---- the stump's skin takes the zombie's colour ---------------------------------------
// colour × mix(1, skin, mask): the mask is 1 on the skin band and the skirt, 0 on the wound
// (and on the blood running down the skirt), so only the skin is tinted.
interface TintUniforms {
  uSkinTint: { value: THREE.Color };
  uSkinMask: { value: THREE.Texture | null };
}
// kept beside the material, not in userData: Material.clone JSON-copies userData, and this
// holds a texture
const tints = new WeakMap<THREE.Material, TintUniforms>();
function tintable(m: THREE.MeshStandardMaterial, mask: THREE.Texture): void {
  const u: TintUniforms = { uSkinTint: { value: new THREE.Color(1, 1, 1) }, uSkinMask: { value: mask } };
  tints.set(m, u);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 uSkinTint;\nuniform sampler2D uSkinMask;\nvoid main() {")
      .replace("#include <map_fragment>", "#include <map_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), uSkinTint, texture2D(uSkinMask, vMapUv).r);");
  };
  m.customProgramCacheKey = () => "fx-cap-tint-v1";
}
/** A cap of this kind, its tintable materials copied and set to `skin` (linear). */
function capOf(kit: GoreKit, key: string, skin: THREE.Color | null): THREE.Object3D | undefined {
  const src = kit.caps.get(key);
  if (!src) return undefined;
  const o = src.clone();
  if (skin) {
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      const m = mesh.isMesh ? (mesh.material as THREE.MeshStandardMaterial) : null;
      const t = m ? tints.get(m) : undefined;
      if (!m || !t) return;
      const c = m.clone();
      tintable(c, t.uSkinMask.value!);
      tints.get(c)!.uSkinTint.value.copy(skin);
      mesh.material = c;
    });
  }
  return o;
}

/** Pixels of a texture, read once, for sampling a colour. null where they can't be read
 *  (a compressed texture, no canvas — the check script). */
const pixelCache = new WeakMap<THREE.Texture, { data: Uint8ClampedArray; w: number; h: number } | null>();
function pixels(t: THREE.Texture | null | undefined) {
  if (!t) return null;
  if (pixelCache.has(t)) return pixelCache.get(t)!;
  let out: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  try {
    const img = t.image as CanvasImageSource & { width: number; height: number };
    if (img && img.width && typeof document !== "undefined" && !(t as THREE.CompressedTexture).isCompressedTexture) {
      const w = Math.min(256, img.width), h = Math.min(256, img.height);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      out = { data: g.getImageData(0, 0, w, h).data, w, h };
    }
  } catch {
    out = null;
  }
  pixelCache.set(t, out);
  return out;
}

/** The skin's colour right at a cut, in linear: the body's texture under the skin vertices
 *  that sit on the cut, times the material's colour and the vertex colour. */
function skinAt(meshes: THREE.SkinnedMesh[], samples: [number, number][]): THREE.Color | null {
  const acc = new THREE.Color(0, 0, 0);
  let n = 0;
  const c = new THREE.Color();
  for (const [mi, vi] of samples) {
    const mesh = meshes[mi];
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const px = pixels(mat.map);
    const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (!px || !uv) continue;
    // glTF textures aren't flipped: v = 0 is the top row
    const x = Math.min(px.w - 1, Math.max(0, Math.floor((uv.getX(vi) - Math.floor(uv.getX(vi))) * px.w)));
    const y = Math.min(px.h - 1, Math.max(0, Math.floor((uv.getY(vi) - Math.floor(uv.getY(vi))) * px.h)));
    const k = (y * px.w + x) * 4;
    c.setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace);
    c.multiply(mat.color);
    const vc = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (vc && mat.vertexColors) c.multiply(new THREE.Color(vc.getX(vi), vc.getY(vi), vc.getZ(vi)));
    acc.add(c);
    n++;
  }
  return n ? acc.multiplyScalar(1 / n) : null;
}

// ---- one zombie -----------------------------------------------------------------------
export interface SeverP {
  site: Site;
  /** which way the blow went (the piece goes with it) */
  dir: THREE.Vector3;
  /** 0..1, how hard: a hatchet to a shotgun at arm's length */
  force?: number;
  floorY?: number;
}

const tm = new THREE.Matrix4();
const tm2 = new THREE.Matrix4();

export class Cuttable {
  readonly meshes: THREE.SkinnedMesh[] = [];
  readonly cut: Set<Site> = new Set();
  private model: ModelCut;
  private uniforms: CutUniforms[] = [];
  /** whose blood comes out (a zombie's, unless this is a survivor) */
  kind: BloodKind = "zombie";
  /** its look: the G-Strain, its own blood and grime, the wounds it takes (zlook.ts) */
  readonly look: ZombieLook;
  /** who it is in the world: its id, and the model it's a copy of (a severed limb is written
   *  down with these, so a restart can cut it from a fresh copy) */
  ref?: { id: string; model: string };
  /** each cut's stump: its cap, and where it sits on its bone */
  private stumps = new Map<Site, { key: string; obj: THREE.Object3D }>();

  constructor(readonly fx: FxSystem, readonly kit: GoreKit, readonly root: THREE.Object3D) {
    root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) this.meshes.push(o as THREE.SkinnedMesh); });
    if (!this.meshes.length) throw new Error("fx: nothing skinned to cut");
    const g0 = this.meshes[0].geometry;
    this.model = modelCache.get(g0) ?? measure(this.meshes);
    for (const m of this.meshes) modelCache.set(m.geometry, this.model);
    this.look = new ZombieLook(this.meshes);
    // this zombie's own copies of its materials (the cut is per zombie; the program isn't)
    for (const m of this.meshes) {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      const copies = list.map((x) => cuttable(x, this.look.u));
      for (const c of copies) this.uniforms.push(c.userData.cut);
      m.material = Array.isArray(m.material) ? copies : copies[0];
    }
  }

  /** Can this site still be cut (not already gone with a bigger cut)? */
  canCut(site: Site): boolean {
    if (this.cut.has(site) || !this.model.sites[site]) return false;
    for (const s of this.cut) if (rigFor(s).takes.includes(site)) return false;
    return true;
  }

  /** This zombie's skin at a cut (read once a model, from the body's own texture). */
  private skinFor(site: Site): THREE.Color | null {
    if (!(site in this.model.tints)) this.model.tints[site] = skinAt(this.meshes, this.model.skin[site] ?? []);
    return this.model.tints[site] ?? null;
  }

  /** The cut, from the event and its seed. Returns false if there's nothing left there. */
  sever(p: SeverP, seed: number): boolean {
    if (!this.canCut(p.site)) return false;
    const rng = mulberry32(seed);
    const fx = this.fx;
    const f = this.model.sites[p.site]!;
    const force = p.force ?? 0.6;
    this.root.updateMatrixWorld(true);
    for (const m of this.meshes) m.skeleton.update();
    const mesh = this.meshes[0];
    const bone = mesh.skeleton.bones[f.bone];
    const boneInv = mesh.skeleton.boneInverses[f.bone];
    // where the cut is right now: bind space → world, through the bone above it
    const toWorld = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(boneInv);
    const scale = new THREE.Vector3(f.rx * 1.08, (f.rx + f.rz) * 0.54, f.rz * 1.08);
    const cutWorld = toWorld.clone().multiply(f.bind).multiply(tm.makeScale(scale.x, scale.y, scale.z));
    const out = new THREE.Vector3().setFromMatrixColumn(cutWorld, 1).normalize();
    const at = new THREE.Vector3().setFromMatrixPosition(cutWorld);

    // 1. the piece, lifted out as it stands (before the body loses it)
    const piece = this.lift(p.site);
    // 2. the body loses it
    this.cut.add(p.site);
    for (const u of this.uniforms) setMode(u, p.site, 1);
    // 3. the stump, riding the bone
    const skin = this.skinFor(p.site);
    const stump = capOf(this.kit, `${rigFor(p.site).cap}:stump`, skin);
    if (stump) {
      tm2.copy(bone.matrixWorld).invert().multiply(cutWorld);
      tm2.decompose(stump.position, stump.quaternion, stump.scale);
      stump.name = `fx-stump:${p.site}`;
      bone.add(stump);
      this.stumps.set(p.site, { key: `${rigFor(p.site).cap}:stump`, obj: stump });
      fx.emit(stumpBleed(stump, p.floorY ?? 0, 3.2 + force * 2, this.kind), Math.floor(rng() * 2 ** 31));
    }
    // 4. the piece flies, with its own cap on the cut face
    if (piece) {
      const pc = capOf(this.kit, `${rigFor(p.site).cap}:piece`, skin);
      if (pc) {
        // its +Y points back the way the body was: flip the frame about its X
        const m = cutWorld.clone().multiply(tm.makeRotationX(Math.PI));
        m.premultiply(tm2.copy(piece.matrixWorld).invert()).decompose(pc.position, pc.quaternion, pc.scale);
        piece.add(pc);
      }
      const dir = p.dir.clone().normalize();
      const vel = dir.multiplyScalar(range(rng, 1.2, 2.6) * (0.5 + force)).addScaledVector(out, range(rng, 0.6, 1.4)).add(new THREE.Vector3(0, range(rng, 0.8, 2) * (0.4 + force), 0));
      const spin = new THREE.Vector3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)).normalize().multiplyScalar(range(rng, 4, 12) * (0.4 + force));
      const points = supportPoints((piece.children[0] as THREE.Mesh).geometry, 14, seed);
      for (const ch of piece.children.slice(1)) if ((ch as THREE.Mesh).isMesh && (ch as THREE.Mesh).geometry !== (pc as THREE.Mesh | undefined)?.geometry) points.push(...supportPoints((ch as THREE.Mesh).geometry, 6, seed + 1));
      let splats = 0;
      if (pc) { pc.userData.fxCap = `${rigFor(p.site).cap}:piece`; }
      const cutsBefore = [...this.cut].filter((x) => x !== p.site);
      fx.rigid.spawn({
        obj: piece, points, vel, spin, floorY: p.floorY, restitution: 0.15, keep: Infinity, seed: Math.floor(rng() * 2 ** 31),
        // it lasts (Josh: severed limbs persist the show), held as it is: it wears this zombie's look
        last: "keep", cause: { limb: { cut: this, site: p.site, cuts: cutsBefore } } satisfies LimbCause,
        onImpact: (hit, speed) => {
          if (splats++ > 2) return;
          dropSplat(fx, rng, this.kind, 1, [0.18 + Math.min(0.3, speed * 0.06), 0.25 + Math.min(0.4, speed * 0.08)])?.(hit);
        },
      });
      fx.emit(pieceDrip(piece, p.floorY ?? 0, this.kind), Math.floor(rng() * 2 ** 31));
    }
    // 5. the moment itself: a burst of blood out of the cut both ways, and a bit of meat
    burst(fx, rng, at, out, p.dir, force, p.floorY, this.kind);
    const meats = ["meat-a", "meat-b", "meat-c"].filter((g) => this.kit.gibs.has(g));
    for (let i = 0, n = Math.round(range(rng, 1, 2.5 + force * 2)); i < n && meats.length; i++) {
      throwGib(fx, this.kit, pick(rng, meats), at, inCone(rng, out.clone().add(p.dir.clone().normalize()).normalize(), 0.9, new THREE.Vector3()).multiplyScalar(range(rng, 1.5, 4) * (0.5 + force)), p.floorY, rng);
    }
    if (p.site !== "neck" && force > 0.5 && this.kit.gibs.has("splinter-a") && rng() < 0.6) {
      throwGib(fx, this.kit, pick(rng, ["splinter-a", "splinter-b"]), at, inCone(rng, out, 0.7, new THREE.Vector3()).multiplyScalar(range(rng, 2, 4)), p.floorY, rng);
    }
    return true;
  }

  /** What this zombie looks like now, for the world to keep with it (Josh: wounds and cuts
   *  persist the show): its look (the G-Strain, its blood, its wounds), whose blood, and each
   *  cut with its stump's place on the bone. Small: a few hundred bytes. */
  get state(): CutState {
    return {
      look: this.look.state,
      kind: this.kind,
      cuts: [...this.cut].map((site) => {
        const st = this.stumps.get(site);
        // (from its parts: its matrix is only brought up to date when the scene next draws)
        return st ? { site, cap: st.key, m: new THREE.Matrix4().compose(st.obj.position, st.obj.quaternion, st.obj.scale).toArray().map((x) => Math.round(x * 1e5) / 1e5) } : { site };
      }),
    };
  }

  /** Put a kept state back on a fresh copy (a restart): the look, and every cut with its
   *  stump on its bone, quietly — nothing thrown, nothing bleeding. The pieces themselves are
   *  the ledger's (they lie where they fell). Cuts it already has are left alone. */
  restore(st: CutState): void {
    this.look.state = st.look;
    this.kind = st.kind;
    for (const c of st.cuts) {
      const site = c.site as Site;
      if (this.cut.has(site) || !this.model.sites[site]) continue;
      this.cut.add(site);
      for (const u of this.uniforms) setMode(u, site, 1);
      if (!c.cap || !c.m) continue;
      const stump = capOf(this.kit, c.cap, this.skinFor(site));
      if (!stump) continue;
      new THREE.Matrix4().fromArray(c.m).decompose(stump.position, stump.quaternion, stump.scale);
      stump.name = `fx-stump:${site}`;
      this.meshes[0].skeleton.bones[this.model.sites[site]!.bone].add(stump);
      this.stumps.set(site, { key: c.cap, obj: stump });
    }
  }

  /** The head comes apart: no head to throw, skull and brain and jaw instead. */
  burstHead(p: { dir: THREE.Vector3; floorY?: number }, seed: number): boolean {
    if (!this.canCut("neck")) return false;
    const rng = mulberry32(seed);
    const fx = this.fx;
    const f = this.model.sites.neck!;
    this.root.updateMatrixWorld(true);
    for (const m of this.meshes) m.skeleton.update();
    const mesh = this.meshes[0];
    const bone = mesh.skeleton.bones[f.bone];
    const toWorld = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[f.bone]);
    const cutWorld = toWorld.clone().multiply(f.bind).multiply(tm.makeScale(f.rx * 1.08, (f.rx + f.rz) * 0.54, f.rz * 1.08));
    const out = new THREE.Vector3().setFromMatrixColumn(cutWorld, 1).normalize();
    const at = new THREE.Vector3().setFromMatrixPosition(cutWorld);
    const headAt = at.clone().addScaledVector(out, 0.12);
    this.cut.add("neck");
    for (const u of this.uniforms) setMode(u, "neck", 1);
    const stump = capOf(this.kit, "neck:stump", this.skinFor("neck"));
    if (stump) {
      tm2.copy(bone.matrixWorld).invert().multiply(cutWorld);
      tm2.decompose(stump.position, stump.quaternion, stump.scale);
      stump.name = "fx-stump:neck";
      bone.add(stump);
      this.stumps.set("neck", { key: "neck:stump", obj: stump });
      fx.emit(stumpBleed(stump, p.floorY ?? 0, 5, this.kind), Math.floor(rng() * 2 ** 31));
    }
    const dir = p.dir.clone().normalize();
    burst(fx, rng, headAt, dir, dir, 1.4, p.floorY, this.kind);
    for (const g of ["skull-a", "skull-b", "jaw", "brain-a", "brain-b", "meat-a", "meat-b"]) {
      if (!this.kit.gibs.has(g)) continue;
      const v = inCone(rng, dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), 1.0, new THREE.Vector3()).multiplyScalar(range(rng, 2, 6));
      throwGib(fx, this.kit, g, headAt, v, p.floorY, rng);
    }
    // the cloud it leaves hanging
    for (let i = 0; i < 6; i++) {
      fx.spawn("sprites", {
        pos: headAt, vel: inCone(rng, dir, 0.8, new THREE.Vector3()).multiplyScalar(range(rng, 0.4, 1.4)), life: range(rng, 0.6, 1.1), size: [0.25, 0.7],
        rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist }, color: BLOOD[this.kind].mist, alpha: 0.75, drag: 2.5, fadeIn: 0, fadeOut: 0.7,
      });
    }
    return true;
  }

  /** The severed part as it stands: one static mesh per body part it spans, in a group
   *  centred on the piece. Its materials drop everything but the piece. */
  private lift(site: Site, given?: { cuts: string[]; parts: Map<number, Float32Array> }): THREE.Group | null {
    const slot = SITES.indexOf(site);
    const earlier = given ? new Set(given.cuts) : this.cut;
    const group = new THREE.Group();
    group.name = `fx-piece:${site}`;
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[] = [];
    const centre = new THREE.Vector3();
    let count = 0;
    const v = new THREE.Vector3();
    for (const [mi, mesh] of this.meshes.entries()) {
      const g = mesh.geometry;
      const cutAttr = slot < 4 ? g.getAttribute("aCutA") : slot < 8 ? g.getAttribute("aCutB") : g.getAttribute("aCutC");
      const comp = slot < 4 ? slot : slot < 8 ? slot - 4 : 0;
      const d = (i: number) => (cutAttr as THREE.BufferAttribute).getComponent(i, comp);
      const index = g.index;
      const tri = index ? index.count / 3 : g.getAttribute("position").count / 3;
      const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
      const keep: number[] = [];
      for (let t = 0; t < tri; t++) {
        if (d(vi(t, 0)) > 0 || d(vi(t, 1)) > 0 || d(vi(t, 2)) > 0) keep.push(t);
      }
      if (!keep.length) continue;
      const map = new Map<number, number>();
      const order: number[] = [];
      const idx: number[] = [];
      for (const t of keep) for (let k = 0; k < 3; k++) {
        const o = vi(t, k);
        let n = map.get(o);
        if (n === undefined) {
          n = order.length;
          map.set(o, n);
          order.push(o);
        }
        idx.push(n);
      }
      const geo = new THREE.BufferGeometry();
      geo.userData.fxPart = mi;
      const known = given?.parts.get(mi);
      if (given && (!known || known.length !== order.length * 3)) continue;
      const P = known ? Float32Array.from(known) : new Float32Array(order.length * 3);
      if (!known) {
        order.forEach((o, n) => {
          mesh.getVertexPosition(o, v).applyMatrix4(mesh.matrixWorld);
          P[n * 3] = v.x; P[n * 3 + 1] = v.y; P[n * 3 + 2] = v.z;
          centre.add(v);
          count++;
        });
      } else count += order.length;
      geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
      for (const name of ["uv", "color", "aCutA", "aCutB", "aCutC"]) {
        const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
        if (!a) continue;
        const arr = new Float32Array(order.length * a.itemSize);
        order.forEach((o, n) => { for (let c = 0; c < a.itemSize; c++) arr[n * a.itemSize + c] = a.getComponent(o, c); });
        geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
      }
      // where each vertex sits on the body at rest, so the piece keeps its wounds and colour
      geo.setAttribute("aZBind", bindPositions(mesh, order));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      // the piece keeps the far side of THIS cut, and still drops what earlier cuts took
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const mats = src.map((m) => {
        const c = cuttable(m, this.look.u);
        for (const s of earlier) setMode(c.userData.cut, s as Site, 1);
        setMode(c.userData.cut, site, -1);
        return c;
      });
      parts.push({ geo, mat: Array.isArray(mesh.material) ? mats : mats[0] });
    }
    if (!count) return null;
    // (written-down positions are already the piece's own, about its centre)
    if (!given) centre.divideScalar(count);
    for (const { geo, mat } of parts) {
      if (!given) geo.translate(-centre.x, -centre.y, -centre.z);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      group.add(m);
    }
    if (!given) group.position.copy(centre);
    group.updateMatrixWorld(true);
    return group;
  }

  /** A severed piece made again from what was written down (a restart): this copy cut the
   *  same way, its shape as it was at the cut, its cap on its cut face. Not thrown, not
   *  bleeding: placed by the caller where it lay. */
  rebuild(site: Site, cuts: string[], parts: Map<number, Float32Array>, cap?: { key: string; m: number[] }): THREE.Group | null {
    const piece = this.lift(site, { cuts, parts });
    if (!piece) return null;
    if (cap) {
      const pc = capOf(this.kit, cap.key, this.skinFor(site));
      if (pc) {
        new THREE.Matrix4().fromArray(cap.m).decompose(pc.position, pc.quaternion, pc.scale);
        pc.userData.fxCap = cap.key;
        piece.add(pc);
      }
    }
    return piece;
  }
}

/** a zombie as the world keeps it (Cuttable.state / restore) */
export interface CutState {
  look: ZLookState;
  kind: BloodKind;
  cuts: { site: string; cap?: string; m?: number[] }[];
}

/** what a severed piece carries as its cause (fx.rigid: written down when it's kept) */
export interface LimbCause {
  limb: { cut: Cuttable; site: Site; cuts: string[] };
}

// ---- the blood that goes with it (blood.ts makes it; this says where) -------------------
function burst(fx: FxSystem, rng: Rng, at: THREE.Vector3, out: THREE.Vector3, dir: THREE.Vector3, force: number, floorY: number | undefined, kind: BloodKind): void {
  const L = BLOOD[kind];
  for (const way of [out, out.clone().negate().add(dir.clone().normalize()).normalize()]) {
    for (let i = 0; i < (18 + force * 22) / Math.sqrt(L.thick); i++) {
      const sz = range(rng, 0.008, 0.025) * L.thick;
      fx.spawn("sprites", {
        pos: at, vel: inCone(rng, way, 0.6, new THREE.Vector3()).multiplyScalar(range(rng, 1.5, 5) * (0.6 + force * 0.6) * L.reach), life: 1.6, size: [sz, sz], stretch: 0.012 / L.thick,
        frame: { kind: "fixed", frame: SPRITE.drop }, color: L.drop, gravity: 9.8, drag: L.drag, floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.05,
        onLand: dropSplat(fx, rng, kind, 0.3, [0.05, 0.14]),
      });
    }
  }
  for (let i = 0; i < 2 + Math.round(2 * L.misting); i++) {
    fx.spawn("sprites", {
      pos: at.clone().addScaledVector(out, 0.04 * i), vel: out.clone().multiplyScalar(range(rng, 0.3, 0.9)), life: range(rng, 0.4, 0.7), size: [0.12, 0.35],
      rot: range(rng, 0, 6.28), frame: { kind: "fixed", frame: SPRITE.mist }, color: L.mist, alpha: 0.7, drag: 3, fadeIn: 0, fadeOut: 0.7,
    });
  }
}

/** Spurts from the stump in time with a heart that's slowing, then a drip, for `secs`. */
function stumpBleed(stump: THREE.Object3D, floorY: number, secs: number, kind: BloodKind) {
  const at = new THREE.Vector3(), out = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  return bloodSpurt({
    secs, floorY, kind, force: 1,
    from: () => {
      if (!stump.parent) return null;
      stump.updateMatrixWorld(true);
      stump.matrixWorld.decompose(at, q, s);
      out.set(0, 1, 0).applyQuaternion(q).normalize();
      return { pos: at, dir: out };
    },
  });
}

/** A few drips off a severed piece while it's fresh. */
function pieceDrip(piece: THREE.Object3D, floorY: number, kind: BloodKind) {
  let t = 0, next = 0;
  const p = new THREE.Vector3();
  const L = BLOOD[kind];
  return ({ fx, rng }: { fx: FxSystem; rng: Rng }, dt: number): boolean => {
    t += dt;
    if (t > 5 || !piece.parent) return false;
    next -= dt;
    if (next <= 0) {
      next += range(rng, 0.2, 0.6) + t * 0.08;
      piece.getWorldPosition(p);
      const sz = range(rng, 0.006, 0.012) * L.thick;
      fx.spawn("sprites", { pos: p, life: 1.2, size: [sz, sz], stretch: 0.01, vel: new THREE.Vector3(0, -0.2, 0), frame: { kind: "fixed", frame: SPRITE.drop }, color: L.drop, gravity: 9.8, floorY, dieOnLand: true, fadeIn: 0, fadeOut: 0.05, onLand: dropSplat(fx, rng, kind, 0.6, [0.03, 0.07]) });
    }
    return true;
  };
}

function throwGib(fx: FxSystem, kit: GoreKit, name: string, at: THREE.Vector3, vel: THREE.Vector3, floorY: number | undefined, rng: Rng): void {
  const src = kit.gibs.get(name);
  if (!src) return;
  const obj = src.clone();
  obj.position.copy(at);
  obj.quaternion.setFromEuler(new THREE.Euler(range(rng, 0, 6.28), range(rng, 0, 6.28), range(rng, 0, 6.28)));
  obj.updateMatrixWorld(true);
  const mesh = obj.getObjectByProperty("isMesh", true) as THREE.Mesh | undefined;
  if (!mesh) return;
  const points = supportPoints(mesh.geometry, 10, Math.floor(rng() * 1000));
  fx.rigid.spawn({
    obj, points, vel, spin: new THREE.Vector3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)).multiplyScalar(range(rng, 6, 18)),
    floorY, restitution: name.startsWith("skull") || name.startsWith("splinter") || name === "jaw" ? 0.3 : 0.08, keep: Infinity, seed: Math.floor(rng() * 2 ** 31),
    // it lasts too, merged with the room's: a chunk of meat is a plain model
    last: "merge", cause: { gib: name },
  });
}
