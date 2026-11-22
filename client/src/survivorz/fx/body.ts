// SURVIVORZ EFFECTS — what the days leave on a survivor (docs/survivorz/EFFECTS.md
// step F5): grime building up, sweat, wounds and the blood round them drying, and an
// infection you can see coming — pallor, dark veins spreading out from the bite, a
// fevered sheen. And their breath in the cold.
//
// "A LAYER IN THE SKIN'S OWN SHADER, driven by numbers the server already tracks" (§3):
// nothing is swapped; it builds up. Each survivor's material gets a patch and ONE small
// texture (512², 1 MB, no mips):
//   R  dried blood       G  fresh blood (it dries into R over a couple of minutes)
//   B  the skin mask (baked by fx-skin.mjs: where the atlas is skin, not clothes)
//   A  a bruise (0 .. 0.45) or an open wound (0.5 .. 1)
// Grime, sweat and infection are not painted: they're the shader's, from three numbers
// and the body's own REST-POSE position (noise on that never crawls when it moves and
// has no seams, which a pattern painted on the atlas would have at every island edge).
//
// Wounds are painted by DISTANCE ON THE BODY, not on the atlas: a scan's atlas is cut into
// dozens of small islands, and a splash painted as a disc in atlas space stopped at an
// island's edge in a hard straight line (it looked like a red square). So each survivor
// gets a map, once, of where on the body every atlas texel is (its rest-pose position),
// and a wound paints every texel within so many centimetres of the hit, across any seam,
// with an edge roughened by noise. All of it from the event's seed, so every observer's
// survivor bleeds alike.
import * as THREE from "three";
import type { Emitter } from "./system";
import { mulberry32, pick, range, type Rng } from "./rng";

export interface BodyState {
  /** 0 clean .. 1 a month without a wash */
  grime?: number;
  /** 0 dry .. 1 running with it (effort, fever) */
  sweat?: number;
  /** 0 healthy .. 1 about to turn */
  infection?: number;
  /** the turn itself (the minute they're down, and after): 0 alive .. 1 one of the dead —
   *  the skin gone to the dead's grey, the eyes clouded (SURVIVORZ.md §5: "the skin blending
   *  to grey — the death viewers remember") */
  turned?: number;
}

export type WoundKind = "bullet" | "bite" | "cut" | "graze" | "bruise" | "scratch";

/** One thing done to a body, written down so a restart can do it again (Josh: wounds persist
 *  the show). Everything that depended on where the body stood is already resolved: a vertex,
 *  or a point on the body's rest pose. `t`: when (the body's `time`). */
export type BodyOp =
  | { o: "set"; t: number; s: BodyState }
  | { o: "wound"; t: number; kind: WoundKind; v: number; s: number }
  | { o: "cough"; t: number; s: number; a: number; c: number[]; r: number[]; k?: number[] }
  | { o: "bleed"; t: number; a: number }
  | { o: "patch"; t: number; kind: number; c: number[]; r: number }
  | { o: "seep"; t: number; slot: number; a: number; f: number }
  | { o: "unpatch"; t: number; slot: number }
  | { o: "clean"; t: number };

const SIZE = 512;
// seconds for fresh blood to mostly dry (its time constant: two thirds in this long)
const DRY_S = 90;

const VERT_HEAD = /* glsl */ `
varying vec3 vBind;
uniform vec4 uBindBox; // min y, 1 / height, and the centre x, z
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vBind;
uniform sampler2D uBody;
uniform vec4 uLook;     // grime, sweat, infection, turned
uniform vec4 uEyeL;     // the eyes (normalised rest pose) and their radius, for the turn
uniform vec4 uEyeR;
uniform vec4 uBite;     // where the bite is (normalised rest pose), and how far the veins reach
uniform vec4 uPatch[6]; // bandages and burns: where (normalised rest pose) and how big
uniform vec4 uPatchB[6]; // what each is (1 bandage, 2 burn; 0 none), how much has seeped through, how fresh
float bh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float bn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1, 0, 0)), f.x), mix(bh(i + vec3(0, 1, 0)), bh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh(i + vec3(0, 0, 1)), bh(i + vec3(1, 0, 1)), f.x), mix(bh(i + vec3(0, 1, 1)), bh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float bfbm(vec3 p) { return 0.55 * bn(p) + 0.3 * bn(p * 2.3) + 0.15 * bn(p * 5.1); }
`;

// the shader's job, after the texture's colour is read
const FRAG_COLOR = /* glsl */ `
  vec4 bodyOv = texture2D(uBody, vMapUv);
  float skin = bodyOv.b;
  float grime = uLook.x, sweat = uLook.y, infection = uLook.z;
  // GRIME: everywhere, worst low down (shoes, knees, hems). Not an even darkening — that
  // reads as the shirt being in shadow — but STAINS with edges, grit, and a general
  // dulling, so some of the cloth stays light and the rest is clearly soiled
  float low = 1.0 - smoothstep(0.08, 0.9, vBind.y);
  float gn = bfbm(vBind * 9.0);
  float g1 = bfbm(vBind * 6.0 + 1.7);
  float stains = smoothstep(0.5, 0.58, g1 + 0.18 * low - 0.12 * (1.0 - grime));
  float grit = smoothstep(0.6, 0.9, bn(vBind * 70.0));
  // (less on the skin: a face gets grimy, not black — people wipe their faces)
  float dirt = clamp(grime * ((0.18 + 0.5 * low) + stains * 0.62 + grit * 0.22 + gn * 0.25), 0.0, 1.0) * (1.0 - 0.5 * skin);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.33, 0.27, 0.2) + vec3(0.025, 0.02, 0.012), dirt);
  // INFECTION, on the skin: grey-green pallor, and veins darkening out from the bite
  float inf = infection * skin;
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.9, 1.0, 0.88) * 1.04, inf * 0.65);
  float ridge = 1.0 - abs(bn(vBind * 34.0) * 2.0 - 1.0);
  ridge = pow(ridge, 7.0) * (0.6 + 0.4 * bn(vBind * 9.0));
  float reach = uBite.w * (0.25 + 0.75 * infection);
  float nearBite = uBite.w > 0.0 ? 1.0 - smoothstep(reach * 0.55, reach, distance(vBind, uBite.xyz)) : 0.0;
  float veins = ridge * max(nearBite, smoothstep(0.75, 1.0, infection) * 0.55) * inf;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.05, 0.11), clamp(veins * 2.2, 0.0, 0.9));
  // dark round the eyes and lips as it takes hold: everywhere on the skin, faintly mottled
  diffuseColor.rgb *= 1.0 - inf * smoothstep(0.6, 1.0, infection) * 0.25 * bn(vBind * 18.0);
  // THE TURN: the last colour going. The skin to the dead's grey, mottled darker where the
  // blood has settled, veins dark everywhere; the eyes clouding over milk-white
  float turned = uLook.w;
  // (a half-skin edge — the neck under the collar — turns fully, or it reads as a warm seam)
  float tk = turned * smoothstep(0.0, 0.45, skin);
  float tl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 dead = vec3(0.34, 0.335, 0.3) * (0.4 + 1.0 * tl);
  dead *= mix(vec3(1.0), vec3(0.62, 0.55, 0.62), smoothstep(0.5, 0.72, bfbm(vBind * 13.0 + 4.2)));
  diffuseColor.rgb = mix(diffuseColor.rgb, dead, tk * 0.9);
  // veins: the same network, drawn thin (ridge², a hairline) and only where a slow noise lets
  // them surface, so they read as under the skin rather than painted on it
  float tvr = 1.0 - abs(bn(vBind * 72.0 + 3.3) * 2.0 - 1.0);
  float tvein = pow(tvr, 4.0) * smoothstep(0.3, 0.5, bfbm(vBind * 5.0 + 9.1));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.06, 0.09), clamp(tvein * tk * 1.4, 0.0, 0.5));
  vec3 eyeK = vec3(1.0, 1.7, 0.6); // wider than tall, forgiving in depth (the cornea bulges)
  float eyes = uEyeL.w > 0.0 ? max(1.0 - smoothstep(uEyeL.w * 0.45, uEyeL.w, length((vBind - uEyeL.xyz) * eyeK)), 1.0 - smoothstep(uEyeR.w * 0.45, uEyeR.w, length((vBind - uEyeR.xyz) * eyeK))) : 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.58) * (0.5 + 0.5 * tl), eyes * turned * 0.8);
  // BLOOD: dried (dark brown-red, matte) and fresh (red, wet), and the wounds under it
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.035, 0.02), bodyOv.r * 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.012, 0.008), bodyOv.g * 0.95);
  float bruise = clamp(bodyOv.a / 0.45, 0.0, 1.0) * (1.0 - step(0.5, bodyOv.a));
  float wound = smoothstep(0.5, 1.0, bodyOv.a);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.42, 0.62), bruise * skin * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.008, 0.006), wound);
  // PATCHES, over everything (a bandage hides the wound it's on): a bandage is off-white cloth
  // with a weave and a soft folded edge, the blood seeping through its middle; a burn on the
  // skin is raw and red in the middle, blistered, charred round its rim, reddened round that,
  // and on cloth a charred hole. A patch is a sphere in the rest pose, so on a limb it wraps
  // all the way round (a wrapped forearm) and on the torso it's a pad
  float patchWet = 0.0, patchMatte = 0.0;
  for (int i = 0; i < 6; i++) {
    float kind = uPatchB[i].x;
    if (kind < 0.5) continue;
    float d = distance(vBind, uPatch[i].xyz) / max(uPatch[i].w, 1e-5);
    float edge = d + 0.12 * (bn(vBind * 160.0 + float(i) * 7.1) - 0.5);
    if (kind < 1.5) {
      float on = 1.0 - smoothstep(0.92, 1.0, edge);
      if (on <= 0.0) continue;
      float weave = 0.9 + 0.1 * bn(vBind * 900.0) + 0.05 * sin(vBind.y * 2400.0);
      vec3 cloth = vec3(0.8, 0.78, 0.72) * weave * (1.0 - 0.18 * smoothstep(0.75, 0.98, edge));
      // it gets grubby like everything else, if less
      cloth = mix(cloth, cloth * vec3(0.55, 0.5, 0.42), grime * 0.45 * (0.6 + 0.4 * gn));
      float seep = uPatchB[i].y * (1.0 - smoothstep(0.15, 0.62, edge - 0.15 * bn(vBind * 60.0)));
      cloth = mix(cloth, mix(vec3(0.28, 0.02, 0.012), vec3(0.2, 0.05, 0.03), 1.0 - uPatchB[i].z), clamp(seep * 1.3, 0.0, 0.92));
      // a rim at the edge where the wrap folds over
      cloth *= 1.0 - 0.25 * (smoothstep(0.84, 0.9, edge) - smoothstep(0.9, 0.97, edge));
      diffuseColor.rgb = mix(diffuseColor.rgb, cloth, on);
      patchMatte = max(patchMatte, on * (1.0 - seep * uPatchB[i].z));
      patchWet = max(patchWet, seep * uPatchB[i].z * on);
    } else {
      float red = 1.0 - smoothstep(0.85, 1.35, edge);
      if (red <= 0.0) continue;
      float rim = smoothstep(0.55, 0.75, edge) * (1.0 - smoothstep(0.85, 1.0, edge));
      float raw = 1.0 - smoothstep(0.35, 0.6, edge);
      float blister = smoothstep(0.62, 0.8, bn(vBind * 260.0 + float(i) * 3.3)) * raw;
      if (skin > 0.3) {
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 0.62, 0.55), red * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.12, 0.08) + vec3(0.18, 0.12, 0.08) * blister, raw * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.035, 0.03), rim * 0.85);
        patchWet = max(patchWet, raw * 0.7);
      } else {
        // cloth burns through: scorched brown round it, a charred black edge, and through the
        // hole the burned skin under it
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.42, 0.3), red * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.025), rim * 0.95);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.12, 0.08) + vec3(0.16, 0.11, 0.07) * blister, raw * 0.92);
        patchMatte = max(patchMatte, rim);
        patchWet = max(patchWet, raw * 0.55);
      }
    }
  }
  // (the dead don't sweat: the fevered sheen goes with the turn)
  float bodySweat = clamp(sweat + infection * 0.6, 0.0, 1.0) * skin * (1.0 - turned);
  float bodyWet = max(max(bodyOv.g, wound * 0.8) * (1.0 - patchMatte), patchWet);
  float bodyDirt = dirt;
`;
const FRAG_ROUGH = /* glsl */ `
  // sweat and fever: a sheen on the skin, patchy; fresh blood and an open wound shine;
  // dirt dulls everything
  roughnessFactor = mix(roughnessFactor, 0.42, bodySweat * (0.55 + 0.45 * bn(vBind * 14.0)));
  roughnessFactor = mix(roughnessFactor, 0.3, bodyWet);   // wet, not a mirror (0.14 blew out under the ceiling lights)
  roughnessFactor = mix(roughnessFactor, 1.0, bodyDirt * 0.6);
  roughnessFactor = mix(roughnessFactor, 0.95, patchMatte * (1.0 - bodyWet));
`;

interface Patched {
  uBody: { value: THREE.DataTexture };
  uLook: { value: THREE.Vector4 };
  uBite: { value: THREE.Vector4 };
  uBindBox: { value: THREE.Vector4 };
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
  uPatch: { value: THREE.Vector4[] };
  uPatchB: { value: THREE.Vector4[] };
}

/** vertices skinned to a bone, by (part of) its name: "upperarm_r" */
const boneMatch = (name?: string) => (name ? new RegExp(name.replace(/[^a-z0-9]/gi, "[^a-z0-9]?"), "i") : undefined);

/** a survivor's bandages and burns at once (the shader's slots) */
export const PATCHES = 6;

export class BodyLook {
  readonly mesh: THREE.SkinnedMesh;
  readonly data: Uint8Array;
  readonly texture: THREE.DataTexture;
  private u: Patched;
  /** where on the body each atlas texel is: rest-pose position, normalised like vBind
   *  (NaN where the atlas is empty) */
  private where: Float32Array;
  /** the body's height in metres (what one normalised unit is) */
  private heightM = 1.75;
  private bind: { minY: number; inv: number; cx: number; cz: number };
  /** the 2 s step of its time drying has reached (NaN: not started) */
  private dryAt = NaN;
  private dirty = false;
  private root: THREE.Object3D;
  private eyesFound = false;
  /** the mouth in the body's normalised rest pose, and the face's forward and right there
   *  (measured with the eyes, findEyes) */
  private face?: { mouth: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3 };
  /** where its wounds are (normalised rest pose), the newest last: a bandage goes on one */
  private woundsAt: THREE.Vector3[] = [];
  private nextPatch = 0;
  /** a suit and respirator over a hidden body (Rollo): the face shows through the visor
   *  (his skin mask is the face there), so it pales, greys and clouds like anyone's, the eyes
   *  carried onto the visor from the body inside; but the mouth is behind the respirator, so a
   *  cough leaves no blood on it. The game skips a suited survivor's cough spray too. */
  readonly suited: boolean;
  /** the hidden body's eyeballs, in THIS body's rest space (a suit has none of its own) */
  private inner?: [THREE.Vector3[], THREE.Vector3[]];
  /** where the painted eyes are, as atlas positions (the skin mask says, for a painted face) */
  private paintedEyes?: [number, number][];
  /** texels with fresh blood on them (null: look again) — drying walks only these */
  private wet: number[] | null = [];
  /** seconds this body has been drawn (its default `time`) */
  private clock = 0;
  private replaying: number | null = null;
  /** when something is done to it (default: its own clock; the show gives its own) */
  time: () => number = () => this.clock;
  /** everything done to it since its last clean, in order (BodyOp): what the world keeps */
  readonly ops: BodyOp[] = [];
  /** told of each op as it's done (the world writes it down) */
  onOp?: (op: BodyOp) => void;

  /** `skin`: the survivor's baked mask (fx-skin.mjs), SIZE² bytes. */
  constructor(root: THREE.Object3D, skin: SkinMask) {
    const found: THREE.SkinnedMesh[] = [];
    root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) found.push(o as THREE.SkinnedMesh); });
    // the body that's DRAWN: never the hidden person inside a suit (Rollo's "*body_proxy*",
    // which the game doesn't draw), and of the rest the biggest (his suit, not his gloves)
    const drawn = found.filter((m) => !/body_proxy/.test(m.name));
    if (!drawn.length) throw new Error("fx: no skinned body");
    this.root = root;
    const count = (m: THREE.SkinnedMesh) => (m.geometry.getAttribute("position") as THREE.BufferAttribute).count;
    const mesh = drawn.reduce((a, m) => (count(m) > count(a) ? m : a));
    this.mesh = mesh;
    this.data = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) this.data[i * 4 + 2] = skin[i] ?? 0;
    // a suit over a hidden body (Rollo): his face shows through the visor, his mouth doesn't
    const proxy = found.find((m) => /body_proxy/.test(m.name));
    this.suited = !!proxy;
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
    // the atlas isn't flipped for a glTF: match the body's own texture
    this.texture.flipY = false;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    const g = mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    this.bind = { minY: bb.min.y, inv: 1 / Math.max(1e-6, bb.max.y - bb.min.y), cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2 };
    // the scans' positions are quantised (±1) with the scale above the mesh, so a metre is
    // measured: the posed body's height in the world
    this.where = whereMap(g, SIZE, this.bind);
    this.paintedEyes = skin.eyes;
    // measured in the REST pose (the skeleton put back to its bind pose for a moment, under
    // whatever the body stands in): a body's size can't depend on how it happens to be
    // standing, or a restart that finds it with its head turned paints its wounds a shade
    // bigger or smaller than they were
    const bones = [...new Set([...mesh.skeleton.bones, ...(proxy?.skeleton.bones ?? [])])];
    const saved = bones.map((bn) => [bn.position.clone(), bn.quaternion.clone(), bn.scale.clone()] as const);
    proxy?.skeleton.pose();
    mesh.skeleton.pose();
    root.updateMatrixWorld(true);
    mesh.skeleton.update();
    proxy?.skeleton.update();
    if (proxy) this.inner = innerEyes(proxy, mesh) ?? undefined;
    let lo = Infinity, hi = -Infinity;
    const tv = new THREE.Vector3(), n = (g.getAttribute("position") as THREE.BufferAttribute).count;
    for (let i = 0; i < n; i += 7) {
      mesh.getVertexPosition(i, tv);
      tv.applyMatrix4(mesh.matrixWorld);
      lo = Math.min(lo, tv.y); hi = Math.max(hi, tv.y);
    }
    if (hi > lo) this.heightM = hi - lo;
    bones.forEach((bn, i) => { bn.position.copy(saved[i][0]); bn.quaternion.copy(saved[i][1]); bn.scale.copy(saved[i][2]); });
    root.updateMatrixWorld(true);
    mesh.skeleton.update();
    proxy?.skeleton.update();
    this.u = {
      uBody: { value: this.texture },
      uLook: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBite: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBindBox: { value: new THREE.Vector4(this.bind.minY, this.bind.inv, this.bind.cx, this.bind.cz) },
      uEyeL: { value: new THREE.Vector4(0, 0, 0, 0) },
      uEyeR: { value: new THREE.Vector4(0, 0, 0, 0) },
      uPatch: { value: Array.from({ length: PATCHES }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uPatchB: { value: Array.from({ length: PATCHES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    };
    // its own copy of its material (a survivor's grime is theirs)
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const m = src.clone();
    const u = this.u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  // the rest pose, normalised: height 0 at the feet, 1 at the top of the head
  vBind = vec3((position.x - uBindBox.z) * uBindBox.y, (position.y - uBindBox.x) * uBindBox.y, (position.z - uBindBox.w) * uBindBox.y);`);
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAG_COLOR}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`);
    };
    m.customProgramCacheKey = () => "fx-body-v11";
    mesh.material = m;
  }

  set(s: BodyState): void {
    this.log({ o: "set", t: this.now(), s: { ...s } });
    const l = this.u.uLook.value;
    if (s.grime !== undefined) l.x = clamp01(s.grime);
    if (s.sweat !== undefined) l.y = clamp01(s.sweat);
    if (s.infection !== undefined) l.z = clamp01(s.infection);
    if (s.turned !== undefined) {
      l.w = clamp01(s.turned);
      if (l.w > 0 && !this.eyesFound) this.findEyes();
    }
  }

  get state(): Required<BodyState> {
    const l = this.u.uLook.value;
    return { grime: l.x, sweat: l.y, infection: l.z, turned: l.w };
  }

  /** Where the eyes are, for the turn: measured off the face (findMouth), then up and to
   *  either side of the mouth by a face's proportions. The mouth is carried back to the rest
   *  pose through the head bone (the skinning, inverted) and the offsets are laid out THERE,
   *  where the face is upright and square: laid out in the world, a head tilted down and to
   *  the side put one eye on the bridge of the nose and the other on the brow. Not snapped
   *  to the nearest vertex either: a face's vertices are sparse round the eyes. */
  private findEyes(): void {
    this.eyesFound = true;
    const head = findBone(this.root, "head");
    if (!head) return;
    const b = this.bind;
    const m = this.mesh;
    const hi = m.skeleton.bones.indexOf(head as THREE.Bone);
    if (hi < 0) return;
    m.updateMatrixWorld(true);
    // world = M · bindMatrixInverse · head.matrixWorld · boneInverse · bindMatrix · rest, so
    // rest = bindMatrix⁻¹ · boneInverse⁻¹ · head⁻¹ · bindMatrixInverse⁻¹ · M⁻¹ · world.
    // (In "attached" mode three re-derives bindMatrixInverse from the mesh's world matrix
    // every frame: it is NOT bindMatrix's inverse, so each is inverted on its own.)
    const toRest = new THREE.Matrix4()
      .copy(m.bindMatrix).invert()
      .multiply(m.skeleton.boneInverses[hi].clone().invert())
      .multiply(head.matrixWorld.clone().invert())
      .multiply(m.bindMatrixInverse.clone().invert())
      .multiply(m.matrixWorld.clone().invert());
    // the rest pose's facing: from the head bone's rest position out to the eyeballs (where
    // the rig has them) or the posed mouth carried back to rest, flattened onto whichever
    // horizontal axis it mostly runs along
    const headR = new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(m.bindMatrix).invert().multiply(m.skeleton.boneInverses[hi].clone().invert()));
    const posedMouthR = () => head.localToWorld(findMouth(this.root, head)).applyMatrix4(toRest);
    const eyesR = this.eyeballCentre();
    const out = (eyesR ?? posedMouthR()).clone().sub(headR);
    const fwd = Math.abs(out.x) > Math.abs(out.z) ? new THREE.Vector3(Math.sign(out.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(out.z));
    const mouthR = restMouth(m, hi, fwd, this.heightM * b.inv) ?? posedMouthR();
    const right = new THREE.Vector3(0, 1, 0).cross(fwd);
    const unit = 1 / (this.heightM * b.inv); // rest units per metre
    this.face = { mouth: new THREE.Vector3((mouthR.x - b.cx) * b.inv, (mouthR.y - b.minY) * b.inv, (mouthR.z - b.cz) * b.inv), fwd: fwd.clone(), right: right.clone() };
    const r = 0.014 / this.heightM; // a little past the visible eye (~3cm wide, ~1cm tall)
    // the eyeballs where the rig has them; a face's proportions where it doesn't
    const seen = this.painted() ?? this.eyeballs(fwd, right);
    // (a suit with no eyes found anywhere: none, rather than guessed ones painted on its mask)
    if (!seen && this.suited) return;
    for (const [side, u] of [[1, this.u.uEyeL], [-1, this.u.uEyeR]] as const) {
      const at = seen?.[side > 0 ? 0 : 1] ?? mouthR.clone()
        .addScaledVector(new THREE.Vector3(0, 1, 0), 0.068 * unit)
        .addScaledVector(right, side * 0.031 * unit)
        .addScaledVector(fwd, -0.008 * unit);
      u.value.set((at.x - b.cx) * b.inv, (at.y - b.minY) * b.inv, (at.z - b.cz) * b.inv, r);
    }
  }

  /** The nearest point of the body's rest-pose surface to a normalised rest point (null if
   *  nothing is within 5 cm). */
  private restNearest(at: THREE.Vector3): THREE.Vector3 | null {
    const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, b = this.bind;
    const reach = 0.05 / this.heightM;
    let best = -1, bd = reach * reach;
    for (let i = 0; i < pos.count; i++) {
      const dx = (pos.getX(i) - b.cx) * b.inv - at.x, dy = (pos.getY(i) - b.minY) * b.inv - at.y, dz = (pos.getZ(i) - b.cz) * b.inv - at.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : new THREE.Vector3((pos.getX(best) - b.cx) * b.inv, (pos.getY(best) - b.minY) * b.inv, (pos.getZ(best) - b.cz) * b.inv);
  }

  /** Where the eyeballs sit in the rest pose, both together (null on a rig without eye bones). */
  private eyeballCentre(): THREE.Vector3 | null {
    const both = this.eyeballs(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    return both ? both[0].clone().add(both[1]).multiplyScalar(0.5) : null;
  }

  /** The eyes where the face is PAINTED (atlas positions from the skin mask), read off the
   *  body through its texel-position map: left then right of the face, in the rest pose,
   *  un-normalised like eyeballs(). Null when the mask doesn't say. */
  private painted(): [THREE.Vector3, THREE.Vector3] | null {
    const e = this.paintedEyes;
    if (!e || e.length < 2) return null;
    const b = this.bind, w = this.where;
    const at = ([u, v]: [number, number]): THREE.Vector3 | null => {
      // the texel there, or the nearest one on the body (an eye at an island's edge)
      const x0 = Math.round(u * SIZE - 0.5), y0 = Math.round(v * SIZE - 0.5);
      for (let r = 0; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const k = (y * SIZE + x) * 3;
        if (w[k] !== w[k]) continue;
        return new THREE.Vector3(w[k] / b.inv + b.cx, w[k + 1] / b.inv + b.minY, w[k + 2] / b.inv + b.cz);
      }
      return null;
    };
    const a = at(e[0]), c = at(e[1]);
    return a && c ? [a, c] : null;
  }

  /** The eyes, from the eyeballs themselves: a rig with eye bones (the survivors' have
   *  eye_l / eye_r) weights each eyeball's vertices to its bone, so the front of that
   *  cluster, on the face's forward axis, is the cornea. Null on a rig without them. */
  private eyeballs(fwd: THREE.Vector3, right: THREE.Vector3): [THREE.Vector3, THREE.Vector3] | null {
    const m = this.mesh, g = m.geometry;
    const norm = (n: string) => n.toLowerCase().replace(/^.*[:|]/, "").replace(/[^a-z]/g, "");
    const bones = m.skeleton.bones.map((b) => norm(b.name));
    const find = (side: "l" | "r") => bones.findIndex((n) => n === `eye${side}` || n === `${side === "l" ? "left" : "right"}eye`);
    const si = g.getAttribute("skinIndex") as THREE.BufferAttribute, sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    if (!si || !sw) return null;
    const out: THREE.Vector3[] = [];
    const p = new THREE.Vector3();
    for (const [n, side] of (["l", "r"] as const).entries()) {
      const bi = find(side);
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let front = -Infinity, c = 0;
      const take = (q: THREE.Vector3) => { lo.min(q); hi.max(q); front = Math.max(front, q.dot(fwd)); c++; };
      if (bi >= 0) for (let v = 0; v < si.count; v++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === bi) w += sw.getComponent(v, k);
        if (w < 0.5) continue;
        take(p.fromBufferAttribute(pos, v).clone());
      }
      // a suit has no eyeballs: the body inside it does (inner), and the eye seen is where
      // that one meets the visor, straight out in front of it
      const borrowed = c < 8 && !!this.inner;
      if (borrowed) { c = 0; for (const q of this.inner![n]) take(q); }
      if (c < 8) return null;
      const mid = lo.add(hi).multiplyScalar(0.5);
      const eye = mid.addScaledVector(fwd, front - mid.dot(fwd));
      if (borrowed) {
        // (searched over the body's texel positions, not its vertices: dense on any mesh)
        const tol = 0.012 / (this.heightM * this.bind.inv); // 1.2 cm, in rest units
        const b = this.bind, w = this.where;
        let best = Infinity;
        const at = eye.clone(), q = new THREE.Vector3(), d = new THREE.Vector3();
        for (let k = 0; k < w.length; k += 3) {
          if (w[k] !== w[k]) continue;
          q.set(w[k] / b.inv + b.cx, w[k + 1] / b.inv + b.minY, w[k + 2] / b.inv + b.cz);
          d.copy(q).sub(eye);
          const along = d.dot(fwd);
          if (along <= 0 || along >= best) continue;
          if (d.addScaledVector(fwd, -along).length() > tol) continue;
          best = along;
          at.copy(q);
        }
        out.push(at);
      } else out.push(eye);
    }
    // listed left then right of the FACE (the bones' own l / r are the character's)
    return out[0].dot(right) >= out[1].dot(right) ? [out[0], out[1]] : [out[1], out[0]];
  }

  /** A wound where `at` (world) meets the body, from the event's seed. Returns the vertex
   *  it centred on, or -1 if the body isn't there. */
  wound(kind: WoundKind, at: THREE.Vector3, seed: number): number {
    const v = this.nearest(at);
    if (v < 0) return -1;
    this.woundAt(kind, v, seed);
    return v;
  }

  /** The wound itself, on a vertex (wound() finds it; a replay already knows it). */
  private woundAt(kind: WoundKind, v: number, seed: number): void {
    this.log({ o: "wound", t: this.now(), kind, v, s: seed });
    const rng = mulberry32(seed);
    const g = this.mesh.geometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute, nor = g.getAttribute("normal") as THREE.BufferAttribute;
    const b = this.bind;
    const c = new THREE.Vector3((pos.getX(v) - b.cx) * b.inv, (pos.getY(v) - b.minY) * b.inv, (pos.getZ(v) - b.cz) * b.inv);
    if (kind !== "bruise") this.woundsAt.push(c.clone());
    // a frame on the skin there: the normal, and two directions along the surface
    const n = new THREE.Vector3(nor.getX(v), nor.getY(v), nor.getZ(v)).normalize();
    const t1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0).cross(n);
    t1.normalize();
    const t2 = n.clone().cross(t1).normalize();
    const m = (metres: number) => metres / this.heightM; // metres → body units
    const ang = rng() * Math.PI * 2;
    const along = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
    const side = n.clone().cross(along).normalize();
    switch (kind) {
      case "bullet":
        this.paint(c, null, m(0.007), 3, 1, rng, 0.2);
        this.paint(c, null, m(0.028), 1, 0.9, rng, 0.45);
        this.paint(c, null, m(0.045), 3, 0.32, rng, 0.4);
        break;
      case "bite": {
        // two arcs of tooth marks facing each other, a bruise round them, blood in them
        for (const s2 of [-1, 1]) {
          for (let k = 0; k < 6; k++) {
            const a = (k / 5 - 0.5) * 2.2;
            const p = c.clone().addScaledVector(along, Math.sin(a) * m(0.024)).addScaledVector(side, s2 * (m(0.012) + (1 - Math.cos(a)) * m(0.01)));
            this.paint(p, null, m(0.0045), 3, 0.95, rng, 0.2);
          }
        }
        this.paint(c, null, m(0.04), 3, 0.38, rng, 0.35);
        this.paint(c, null, m(0.026), 1, 0.85, rng, 0.5);
        this.u.uBite.value.set(c.x, c.y, c.z, 0.32);
        break;
      }
      case "cut":
      case "graze": {
        const len = kind === "cut" ? m(0.09) : m(0.06);
        const a = c.clone().addScaledVector(along, -len / 2), e = c.clone().addScaledVector(along, len / 2);
        this.paint(a, e, kind === "cut" ? m(0.0035) : m(0.012), 3, kind === "cut" ? 0.95 : 0.62, rng, 0.3);
        this.paint(a, e, kind === "cut" ? m(0.012) : m(0.02), 1, kind === "cut" ? 0.85 : 0.5, rng, 0.5);
        break;
      }
      case "bruise":
        this.paint(c, null, m(0.05), 3, 0.42, rng, 0.4);
        break;
      case "scratch": {
        // a zombie's claws: three thin parallel rakes, a claw's width apart, a graze round them
        const len = m(range(rng, 0.06, 0.1));
        for (let k = -1; k <= 1; k++) {
          const o = c.clone().addScaledVector(side, k * m(0.014)).addScaledVector(along, k * m(0.006));
          const a2 = o.clone().addScaledVector(along, -len / 2), e2 = o.clone().addScaledVector(along, len / 2 - Math.abs(k) * m(0.012));
          this.paint(a2, e2, m(0.0025), 3, 0.9, rng, 0.25);
          this.paint(a2, e2, m(0.007), 1, 0.7, rng, 0.45);
        }
        this.paint(c, null, m(0.035), 3, 0.2, rng, 0.4);
        break;
      }
    }
    this.dirty = true;
  }

  /** A cough bringing up blood (the last stage of infection): fresh blood at the lips and a
   *  few flecks on the chin, drying like any other blood. `amount` 0..1. The spray in the
   *  air is blood.ts's coughBlood. `hand`: where a covering fist is (handAtMouth, moved a
   *  little toward the mouth): most of it goes on the knuckles instead, and the lips get a
   *  little. False if the face can't be found. */
  coughedBlood(seed: number, amount = 0.6, hand?: THREE.Vector3): boolean {
    if (this.suited) return false;
    if (!this.eyesFound) this.findEyes();
    const f = this.face;
    if (!f) return false;
    const m = (metres: number) => metres / this.heightM;
    // onto the lips themselves: the measured mouth sits a centimetre in front of them, and on a
    // face the measurement can't read (the fallback) further still. The nearest point of the
    // body's own rest-pose surface
    const c = this.restNearest(f.mouth) ?? f.mouth.clone().addScaledVector(f.fwd, -m(0.006));
    const covered = hand ? this.nearest(hand, /hand|thumb|index|middle|ring|pinky|finger/i) : -1;
    let k: THREE.Vector3 | undefined;
    if (covered >= 0) {
      const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, b = this.bind;
      k = new THREE.Vector3((pos.getX(covered) - b.cx) * b.inv, (pos.getY(covered) - b.minY) * b.inv, (pos.getZ(covered) - b.cz) * b.inv);
    }
    this.coughAt(seed, amount, c, f.right, k);
    return true;
  }

  /** The cough's blood, from points already found (coughedBlood finds them; a replay knows). */
  private coughAt(seed: number, amount: number, c: THREE.Vector3, right: THREE.Vector3, k?: THREE.Vector3): void {
    this.log({ o: "cough", t: this.now(), s: seed, a: amount, c: c.toArray(), r: right.toArray(), k: k?.toArray() });
    const rng = mulberry32(seed);
    const m = (metres: number) => metres / this.heightM;
    const covered = k ? 1 : -1;
    if (k) {
      // into the fist: the knuckles take it, spattered round
      this.paint(k, null, m(0.014 + 0.012 * amount), 1, 0.55 + 0.4 * amount, rng, 0.55);
      for (let i = 0; i < 3 + Math.round(4 * amount); i++) {
        const at = k.clone().add(new THREE.Vector3(m(range(rng, -0.03, 0.03)), m(range(rng, -0.03, 0.03)), m(range(rng, -0.03, 0.03))));
        this.paint(at, null, m(range(rng, 0.003, 0.006)), 1, 0.85, rng, 0.3);
      }
    }
    this.paint(c, null, m((0.012 + 0.01 * amount) * (covered >= 0 ? 0.6 : 1)), 1, (0.45 + 0.4 * amount) * (covered >= 0 ? 0.7 : 1), rng, 0.5);
    for (let i = 0; i < 2 + Math.round(3 * amount); i++) {
      const at = c.clone().addScaledVector(right, m(range(rng, -0.025, 0.025))).add(new THREE.Vector3(0, -m(range(rng, 0.008, 0.035)), 0));
      this.paint(at, null, m(range(rng, 0.003, 0.006)), 1, 0.8, rng, 0.3);
    }
    this.dirty = true;
  }

  /** Fresh blood running from every open wound, a little more each call (a bleeding
   *  survivor). */
  bleed(amount = 0.15): void {
    this.log({ o: "bleed", t: this.now(), a: amount });
    this.wet = null;
    const d = this.data;
    const next = new Uint8Array(SIZE * SIZE);
    for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x;
      if (d[i * 4 + 3] < 128 && d[i * 4 + 1] < 40) continue;
      // spreads to neighbours a little
      for (const j of [i, i - 1, i + 1, i - SIZE, i + SIZE]) next[j] = Math.max(next[j], Math.round(255 * amount));
    }
    for (let i = 0; i < SIZE * SIZE; i++) if (next[i]) d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] + next[i]);
    this.dirty = true;
  }

  /** Fresh blood dries into dried; uploads what changed. Every frame (cheap: it only works
   *  every couple of seconds). */
  update(dt: number): void {
    this.clock += dt;
    this.catchUp(this.now());
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  /** Dry up to `to` (the body's time) in whole 2 s steps of that clock. On a fixed grid of
   *  its time, not the frame clock: so a replay, which knows only when each thing happened,
   *  dries exactly as the body did. Every op catches up first (log), for the same reason. */
  private catchUp(to: number): void {
    const g = Math.floor(to / 2);
    // (a clock that went backwards, a new epoch: start the grid again from there)
    if (!(g >= this.dryAt)) { this.dryAt = g; return; }
    for (let n = g - this.dryAt; n > 0; n--) if (!this.dry(2 / DRY_S)) break;
    this.dryAt = g;
  }

  /** one drying step: fresh blood moves toward dried by the fraction `k` (at least a step) */
  private dry(k: number): boolean {
    const d = this.data;
    if (!this.wet) {
      this.wet = [];
      for (let i = 0; i < SIZE * SIZE; i++) if (d[i * 4 + 1]) this.wet.push(i);
    }
    if (!this.wet.length) return false;
    const still: number[] = [];
    for (const i of this.wet) {
      const g = d[i * 4 + 1];
      if (!g) continue;
      const move = Math.min(g, Math.max(1, Math.round(g * k)));
      d[i * 4 + 1] = g - move;
      d[i * 4] = Math.min(255, d[i * 4] + move);
      if (g - move) still.push(i);
    }
    this.wet = still;
    this.dirty = true;
    return still.length > 0;
  }

  /** Do again everything in `ops` (a restart: the world kept them), the blood drying between
   *  them as it did, then on to `now` (when the world says it is; the last op's time if not).
   *  Nothing is told of it (onOp): it's already written down. The body's pose doesn't
   *  matter: every op already says where on the body it was. */
  replay(ops: BodyOp[], now?: number): void {
    let t = ops.length ? ops[0].t : this.now();
    for (const op of ops) {
      t = op.t;
      // (each op catches the drying up to its own time first: log)
      this.replaying = op.t;
      try {
        const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
        switch (op.o) {
          case "set": this.set(op.s); break;
          case "wound": this.woundAt(op.kind, op.v, op.s); break;
          case "cough": this.coughAt(op.s, op.a, v(op.c), v(op.r), op.k ? v(op.k) : undefined); break;
          case "bleed": this.bleed(op.a); break;
          case "patch": this.patch(op.kind, v(op.c), op.r); break;
          case "seep": this.seep(op.slot, op.a, op.f); break;
          case "unpatch": this.unpatch(op.slot); break;
          case "clean": this.clean(); break;
        }
      } finally {
        this.replaying = null;
      }
    }
    this.catchUp(now ?? t);
    this.clock = Math.max(this.clock, now ?? t);
    this.texture.needsUpdate = true;
  }

  private now(): number {
    return this.replaying ?? this.time();
  }

  private log(op: BodyOp): void {
    this.catchUp(op.t);
    // the same bandage seeping a little more replaces what it said last
    const last = this.ops[this.ops.length - 1];
    if (op.o === "seep" && last?.o === "seep" && last.slot === op.slot) this.ops.pop();
    // and a look changing every frame (sweat, the turn) is one op, the newest values
    if (op.o === "set" && last?.o === "set") {
      this.ops.pop();
      op = { o: "set", t: op.t, s: { ...last.s, ...op.s } };
    }
    this.ops.push(op);
    if (this.replaying === null) this.onOp?.(op);
  }

  /** a clean start: the morning after a shower (a newcomer, a revive) */
  /** A bandage on a wound: the wound nearest `at` (world), or the newest one. `metres`
   *  across it covers (a dressing on a cut, ~6 cm; a forearm wrapped, ~9). It hides what's
   *  under it; `seep` it later. The slot, or -1 if there's no wound to put it on. */
  bandage(at?: THREE.Vector3, metres = 0.07, on?: string): number {
    let c: THREE.Vector3 | undefined;
    if (at) {
      const v = this.nearest(at, boneMatch(on));
      if (v >= 0) {
        const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, b = this.bind;
        const p = new THREE.Vector3((pos.getX(v) - b.cx) * b.inv, (pos.getY(v) - b.minY) * b.inv, (pos.getZ(v) - b.cz) * b.inv);
        c = this.woundsAt.length ? this.woundsAt.reduce((a, w) => (w.distanceTo(p) < a.distanceTo(p) ? w : a)) : p;
      }
    } else c = this.woundsAt[this.woundsAt.length - 1];
    if (!c) return -1;
    return this.patch(1, c, metres / 2 / this.heightM);
  }

  /** Blood coming through a bandage: `amount` 0..1, `fresh` 1 wet red .. 0 dried brown. */
  seep(slot: number, amount: number, fresh = 1): void {
    const b = this.u.uPatchB.value[slot];
    if (!b || b.x !== 1) return;
    this.log({ o: "seep", t: this.now(), slot, a: amount, f: fresh });
    b.y = Math.max(0, Math.min(1, amount));
    b.z = Math.max(0, Math.min(1, fresh));
  }

  /** A burn where `at` (world) meets the body, `metres` across: raw and blistered on the
   *  skin, a charred hole in clothes. `on`: the bone it's on (an arm hangs against the torso,
   *  and a point in front of it is nearer the torso's side). The slot, or -1 if the body
   *  isn't there. */
  burn(at: THREE.Vector3, metres = 0.12, on?: string): number {
    const v = this.nearest(at, boneMatch(on));
    if (v < 0) return -1;
    const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, b = this.bind;
    return this.patch(2, new THREE.Vector3((pos.getX(v) - b.cx) * b.inv, (pos.getY(v) - b.minY) * b.inv, (pos.getZ(v) - b.cz) * b.inv), metres / 2 / this.heightM);
  }

  /** Take a bandage off (or a burn, as if healed: a show cut that long). */
  unpatch(slot: number): void {
    this.log({ o: "unpatch", t: this.now(), slot });
    this.u.uPatchB.value[slot]?.set(0, 0, 0, 0);
  }

  /** what's in each patch slot: [kind, seep, fresh] (for the checks and the replay) */
  get patches(): number[][] {
    return this.u.uPatchB.value.map((b) => [b.x, b.y, b.z]);
  }

  private patch(kind: number, c: THREE.Vector3, r: number): number {
    this.log({ o: "patch", t: this.now(), kind, c: c.toArray(), r });
    // the same place again replaces what was there (a fresh dressing on the same wound)
    let i = this.u.uPatch.value.findIndex((p, k) => this.u.uPatchB.value[k].x === kind && Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < r * 0.5);
    if (i < 0) {
      i = this.u.uPatchB.value.findIndex((b) => b.x === 0);
      if (i < 0) { i = this.nextPatch; this.nextPatch = (this.nextPatch + 1) % PATCHES; }
    }
    this.u.uPatch.value[i].set(c.x, c.y, c.z, r);
    this.u.uPatchB.value[i].set(kind, 0, 1, 0);
    return i;
  }

  clean(): void {
    for (let i = 0; i < SIZE * SIZE; i++) { this.data[i * 4] = 0; this.data[i * 4 + 1] = 0; this.data[i * 4 + 3] = 0; }
    this.u.uBite.value.set(0, 0, 0, 0);
    for (const b of this.u.uPatchB.value) b.set(0, 0, 0, 0);
    this.woundsAt = [];
    this.nextPatch = 0;
    this.wet = [];
    this.dirty = true;
    // nothing before a clean matters any more: the log starts again from it
    this.ops.length = 0;
    this.log({ o: "clean", t: this.now() });
  }

  gpuBytes(): number {
    return SIZE * SIZE * 4;
  }

  // ---- inside ----------------------------------------------------------------------------
  /** the vertex of the posed body nearest a world point (-1 if it's nowhere near) */
  private nearest(at: THREE.Vector3, only?: RegExp): number {
    const m = this.mesh, n = (m.geometry.getAttribute("position") as THREE.BufferAttribute).count;
    m.updateMatrixWorld(true);
    m.skeleton.update();
    const tv = new THREE.Vector3();
    const si = m.geometry.getAttribute("skinIndex"), sw = m.geometry.getAttribute("skinWeight");
    const allowed = only ? m.skeleton.bones.map((b) => only.test(b.name)) : null;
    let best = -1, bd = 0.25 * 0.25;
    for (let i = 0; i < n; i++) {
      if (allowed && si && sw) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (allowed[si.getComponent(i, k)]) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
      }
      m.getVertexPosition(i, tv);
      tv.applyMatrix4(m.matrixWorld);
      const d = tv.distanceToSquared(at);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** a mark into one channel (`ch` 0..3) round a point, or along a segment `a`–`b`, by
   *  distance on the body; its edge roughened by noise of the body position (so it's the
   *  same splash however the atlas is cut), never lowering what's already there */
  private paint(a: THREE.Vector3, b: THREE.Vector3 | null, r: number, ch: number, v: number, rng: Rng, rough: number): void {
    const d = this.data, w = this.where;
    const ox = range(rng, 0, 100), oy = range(rng, 0, 100), oz = range(rng, 0, 100);
    const freq = 1 / Math.max(1e-4, r) * 1.6;
    const ab = b ? b.clone().sub(a) : null, abl = ab ? ab.lengthSq() : 0;
    const reach = r * (1 + rough), reach2 = reach * reach;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < SIZE * SIZE; i++) {
      const x = w[i * 3];
      if (x !== x) continue; // NaN: an empty texel
      p.set(x, w[i * 3 + 1], w[i * 3 + 2]);
      // distance to the point, or to the nearest point of the segment
      if (ab) {
        const t = Math.max(0, Math.min(1, q.copy(p).sub(a).dot(ab) / abl));
        q.copy(a).addScaledVector(ab, t);
      } else q.copy(a);
      const d2 = p.distanceToSquared(q);
      if (d2 > reach2) continue;
      const nz = vnoise(p.x * freq + ox, p.y * freq + oy, p.z * freq + oz);
      const edge = r * (1 + rough * (nz - 0.5) * 2);
      const f = 1 - smooth((Math.sqrt(d2) - edge * 0.6) / Math.max(1e-6, edge * 0.4));
      if (f <= 0) continue;
      const k = i * 4 + ch;
      const val = Math.round(255 * v * f);
      // a bruise never paints over an open wound (A carries both)
      if (ch === 3 && d[k] >= 128 && val < 128) continue;
      if (val > d[k]) d[k] = val;
    }
    if (ch === 1) this.wet = null;
  }
}

/** value noise in 3D, 0..1, for roughening a mark's edge */
function vnoise(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number) => {
    let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy),
    fz,
  );
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Where on the body each atlas texel is: every triangle rasterised into the atlas with
 *  its rest-pose position (normalised like vBind) interpolated across it. Once a model. */
function whereMap(g: THREE.BufferGeometry, size: number, b: { minY: number; inv: number; cx: number; cz: number }): Float32Array {
  const out = new Float32Array(size * size * 3).fill(NaN);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const idx = g.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const P = (i: number) => [(pos.getX(i) - b.cx) * b.inv, (pos.getY(i) - b.minY) * b.inv, (pos.getZ(i) - b.cz) * b.inv];
  for (let t = 0; t < tri; t++) {
    const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    // atlas pixel coordinates (the glTF atlas isn't flipped: v = 0 is the first row)
    const ax = uv.getX(ia) * size - 0.5, ay = uv.getY(ia) * size - 0.5;
    const bx = uv.getX(ib) * size - 0.5, by = uv.getY(ib) * size - 0.5;
    const cx = uv.getX(ic) * size - 0.5, cy = uv.getY(ic) * size - 0.5;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    const pa = P(ia), pb = P(ib), pc = P(ic);
    // a pixel's worth of padding round each triangle, so the island edges are covered too
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
      const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
      const w2 = 1 - w0 - w1;
      const pad = -1.2 / Math.sqrt(Math.abs(area));
      if (w0 < pad || w1 < pad || w2 < pad) continue;
      const k = (y * size + x) * 3;
      if (out[k] === out[k] && (w0 < 0 || w1 < 0 || w2 < 0)) continue; // padding never overwrites a real hit
      out[k] = pa[0] * w0 + pb[0] * w1 + pc[0] * w2;
      out[k + 1] = pa[1] * w0 + pb[1] * w1 + pc[1] * w2;
      out[k + 2] = pa[2] * w0 + pb[2] * w1 + pc[2] * w2;
    }
  }
  return out;
}

/** A survivor's bone by its plain name ("head", "lowerarm_l"): some of the scans' rigs
 *  carry their export's name in front of every bone (rp_sophia_animated_003_idling_head). */
export function findBone(root: THREE.Object3D, name: string): THREE.Bone | undefined {
  let hit: THREE.Bone | undefined;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && (o.name === name || o.name.endsWith(`_${name}`))) hit = o as THREE.Bone;
  });
  return hit;
}

/** The skin mask baked by fx-skin.mjs, from its JSON. */
/** The eyeball vertices of the body hidden inside a suit, carried into the SUIT's rest space.
 *  Both are skinned to the same skeleton, so a rest position goes from one to the other
 *  through their bind matrices alone: suit.bindMatrix^-1 . proxy.bindMatrix. (Through the
 *  world it would carry wherever the body stands into the answer.) */
function innerEyes(proxy: THREE.SkinnedMesh, suit: THREE.SkinnedMesh): [THREE.Vector3[], THREE.Vector3[]] | null {
  const norm = (n: string) => n.toLowerCase().replace(/^.*[:|]/, "").replace(/[^a-z]/g, "");
  const names = proxy.skeleton.bones.map((b) => norm(b.name));
  const g = proxy.geometry;
  const si = g.getAttribute("skinIndex") as THREE.BufferAttribute, sw = g.getAttribute("skinWeight") as THREE.BufferAttribute;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  if (!si || !sw) return null;
  const toSuit = new THREE.Matrix4().copy(suit.bindMatrix).invert().multiply(proxy.bindMatrix);
  const out: THREE.Vector3[][] = [];
  for (const side of ["l", "r"]) {
    const bi = names.findIndex((n) => n === `eye${side}` || n === `${side === "l" ? "left" : "right"}eye`);
    if (bi < 0) return null;
    const pts: THREE.Vector3[] = [];
    for (let v = 0; v < si.count; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === bi) w += sw.getComponent(v, k);
      if (w < 0.5) continue;
      pts.push(new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(toSuit));
    }
    if (pts.length < 8) return null;
    out.push(pts);
  }
  return [out[0], out[1]];
}

/** A survivor's skin mask (fx-skin.mjs), and where its PAINTED eyes are on the atlas when
 *  they can't be found from eyeballs (Rollo's face is painted on his visor). */
export type SkinMask = Uint8Array & { eyes?: [number, number][] };

export async function loadSkinMask(load: { json<T>(p: string): Promise<T> }, name: string): Promise<SkinMask> {
  const j = await load.json<{ size: number; data: string; eyes?: [number, number][] }>(`survivors/${name}-skin.json`);
  const bin = atob(j.data);
  const out: SkinMask = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (j.eyes) out.eyes = j.eyes;
  return out;
}

// ---- breath in the cold ----------------------------------------------------------------------
export interface BreathP {
  /** the head bone (the mouth is a little in front of and below it) */
  head: THREE.Object3D;
  /** what says which way they face (the body's root; +z forward). The head bone's own axes
   *  are the rig's business and point anywhere */
  facing?: THREE.Object3D;
  /** 0 warm (nothing) .. 1 the freezer */
  cold: number | (() => number);
  /** 0 at rest .. 1 out of breath: faster, bigger puffs */
  effort?: number | (() => number);
  /** where the mouth is, in the head bone's own frame (findMouth); measured from the body the
   *  first time it breathes if not given */
  mouth?: THREE.Vector3;
}

/** Where a survivor's mouth is, in the head bone's frame, measured off their own face: the
 *  forward-most point of each centimetre down the face's centre line gives its profile; the
 *  chin is where that profile falls back sharply into the neck; the lips are 4.5 cm above it.
 *  A fixed offset from the head bone put the breath at the chin or under the jaw — the head
 *  bone sits in a different place on every rig. Measured on the posed body (call it with the
 *  body standing). The arms and hands are left out: mid-cough a fist at the mouth is the
 *  forward-most thing there, and the "mouth" landed 11 cm in front of the face. */
/** arm, hand and finger bones, on any of the rigs (they're never the face) */
const ARM = /arm|hand|thumb|index|middle|ring|pinky|finger|shoulder|clavicle|wrist/i;

/** The hand covering the mouth, if one is (a cough into a fist): its KNUCKLES' world
 *  position (the middle finger's first joint; the hand bone itself is the wrist, and blood
 *  aimed from there landed on the cuff) when they're within `reach` of the mouth, else null. */
export function handAtMouth(root: THREE.Object3D, mouth: THREE.Vector3, reach = 0.16): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null, bd = reach;
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone || !/hand(?!.*(thumb|index|middle|ring|pinky))/i.test(o.name) || /end|twist/i.test(o.name)) return;
    let knuckle: THREE.Object3D = o;
    o.traverse((c) => { if (knuckle === o && (c as THREE.Bone).isBone && /middle.*0?1|index.*0?1/i.test(c.name)) knuckle = c; });
    const p = knuckle.getWorldPosition(new THREE.Vector3());
    const dd = p.distanceTo(mouth);
    if (dd < bd) { bd = dd; best = p; }
  });
  return best;
}

export function findMouth(root: THREE.Object3D, head: THREE.Object3D, facing: THREE.Object3D = root): THREE.Vector3 {
  root.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(facing.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
  const bins = new Map<number, number>();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.getAttribute("position");
    const si = m.geometry.getAttribute("skinIndex"), sw = m.geometry.getAttribute("skinWeight");
    const limb = m.skeleton.bones.map((b) => ARM.test(b.name));
    for (let i = 0; i < pos.count; i++) {
      if (si && sw) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (limb[si.getComponent(i, k)]) w += sw.getComponent(i, k);
        if (w >= 0.5) continue;
      }
      m.getVertexPosition(i, v);
      m.localToWorld(v);
      d.copy(v).sub(hp);
      if (d.y < -0.3 || d.y > 0.35 || Math.abs(d.dot(right)) > 0.025) continue;
      const f = d.dot(fwd);
      if (f < -0.05 || f > 0.3) continue;
      const b = Math.round(v.y * 100);
      bins.set(b, Math.max(bins.get(b) ?? -1, f));
    }
  });
  const fallback = head.worldToLocal(hp.clone().addScaledVector(fwd, 0.11).add(new THREE.Vector3(0, -0.06, 0)));
  const lips = lipsFromProfile(bins);
  if (!lips) return fallback;
  const world = hp.clone().addScaledVector(fwd, lips.reach + 0.01).setY(lips.y);
  return head.worldToLocal(world);
}

/** The lips from a face's profile: for each centimetre of height (the key), how far forward
 *  of the head the face reaches there (metres). The chin is where the profile falls back into
 *  the neck below the forward-most part of the face; the lips are 4.5 cm above it. */
function lipsFromProfile(bins: Map<number, number>): { y: number; reach: number } | null {
  if (bins.size < 10) return null;
  const ys = [...bins.keys()].sort((a, b) => b - a);
  const top = ys[0];
  let maxF = -1;
  for (const y of ys) maxF = Math.max(maxF, bins.get(y)!);
  let chin = NaN;
  let past = false;
  for (const y of ys) {
    const f = bins.get(y)!;
    if (f >= maxF * 0.9) past = true;
    if (past && f < maxF * 0.55 && top - y > 0.12) {
      chin = (y + 1) / 100;
      break;
    }
  }
  if (!Number.isFinite(chin)) return null;
  const my = chin + 0.045;
  let mf = -1;
  for (const y of ys) if (Math.abs(y / 100 - my) <= 0.011) mf = Math.max(mf, bins.get(y)!);
  if (mf < 0) return null;
  return { y: my, reach: mf };
}

/** The mouth in a body's REST pose (its geometry's own units), measured off the face there:
 *  upright and square whatever the body is doing now. Mid-cough, with the head bent and a
 *  fist at the mouth, the posed measurement put the lips on the nose. Null if the rest-pose
 *  face can't be read. `mpu`: metres per geometry unit. */
function restMouth(mesh: THREE.SkinnedMesh, hi: number, fwd: THREE.Vector3, mpu: number): THREE.Vector3 | null {
  const g = mesh.geometry;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight");
  const limb = mesh.skeleton.bones.map((b) => ARM.test(b.name));
  const hp = new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(mesh.bindMatrix).invert().multiply(mesh.skeleton.boneInverses[hi].clone().invert()));
  const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
  const bins = new Map<number, number>();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (si && sw) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (limb[si.getComponent(i, k)]) w += sw.getComponent(i, k);
      if (w >= 0.5) continue;
    }
    v.fromBufferAttribute(pos, i);
    d.copy(v).sub(hp).multiplyScalar(mpu);
    if (d.y < -0.3 || d.y > 0.35 || Math.abs(d.dot(right)) > 0.025) continue;
    const f = d.dot(fwd);
    if (f < -0.05 || f > 0.3) continue;
    const b = Math.round(v.y * mpu * 100);
    bins.set(b, Math.max(bins.get(b) ?? -1, f));
  }
  const lips = lipsFromProfile(bins);
  if (!lips) return null;
  return hp.clone().addScaledVector(fwd, (lips.reach + 0.01) / mpu).setY(lips.y / mpu);
}
export function breath(p: BreathP): Emitter {
  let next = 0.3;
  const at = new THREE.Vector3(), fwd = new THREE.Vector3(), q = new THREE.Quaternion();
  const val = (x: number | (() => number) | undefined, d: number) => (typeof x === "function" ? x() : x ?? d);
  return ({ fx, rng }, dt) => {
    if (!p.head.parent) return false;
    const cold = val(p.cold, 0), effort = val(p.effort, 0);
    next -= dt;
    if (next > 0 || cold <= 0.02) return true;
    // a breath every 3.5 s at rest, every 1.4 s out of breath
    next = range(rng, 0.85, 1.15) * (3.5 - 2.1 * effort);
    const sheets = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => fx.has(s));
    if (!sheets.length) return true;
    p.head.updateWorldMatrix(true, false);
    p.head.getWorldPosition(at);
    (p.facing ?? p.head).getWorldQuaternion(q);
    // the body faces +z in its own frame
    fwd.set(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    // the mouth, measured off this body's own face the first time (it follows the head after)
    if (!p.mouth && p.facing) p.mouth = findMouth(p.facing, p.head);
    const mouth = p.mouth ? p.head.localToWorld(p.mouth.clone()) : at.clone().addScaledVector(fwd, 0.11).add(new THREE.Vector3(0, -0.06, 0));
    const big = 1 + effort * 0.8;
    for (let i = 0; i < 3; i++) {
      fx.spawn(pick(rng, sheets), {
        pos: mouth, delay: i * 0.12, vel: fwd.clone().multiplyScalar(range(rng, 0.35, 0.6) * big).add(new THREE.Vector3(range(rng, -0.04, 0.04), range(rng, 0.02, 0.1), range(rng, -0.04, 0.04))),
        life: range(rng, 1.1, 1.6), size: [0.04 * big, range(rng, 0.28, 0.4) * big], rot: range(rng, 0, 6.28), spin: range(rng, -0.6, 0.6),
        color: [1.6, 1.65, 1.7], alpha: 0.32 * cold, glow: 0.15, drag: 2.4, gravity: -0.15, fadeIn: 0.08, fadeOut: 0.6,
        frame: { kind: "life", from: Math.floor(range(rng, 8, 16)) },
      });
    }
    return true;
  };
}
