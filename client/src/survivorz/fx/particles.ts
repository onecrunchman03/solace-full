// SURVIVORZ EFFECTS — a particle layer: every card drawn from ONE sheet, in ONE
// draw call (docs/survivorz/EFFECTS.md §2–3).
//
// A card is either a flipbook frame (smoke, flame, explosion — the sheets baked
// by scripts/survivorz/fx-flipbook.mjs) or a sprite from the procedural sheet
// (sparks, droplets, motes). Cards face the camera; a card with `stretch` lines
// up along its own motion instead (a spark is a streak, not a dot).
//
// THE SHEETS ARE PREMULTIPLIED, and the blend is (ONE, ONE_MINUS_SRC_ALPHA):
// smoke covers what is behind it, and `glow` drives the written alpha towards
// zero so a flame ADDS light. One blend for both is what lets one layer hold
// smoke and fire together.
//
// THE HALL'S RULES, kept: the material is built once and never disposed (a
// rebuilt program froze the casino), it is single-pass (two-pass transparency
// leaked a full material rebuild every frame), and an idle layer is hidden
// rather than removed, so the scene's program list never changes mid-show.
import * as THREE from "three";

export interface SheetInfo {
  cols: number;
  rows: number;
  frames: number;
  /** height / width of one frame (a flame's card is tall) */
  aspect: number;
  /** how much of a card adds light rather than covering, by default */
  glow: number;
}

/** How a card picks its frame over its life. */
export type FrameMode =
  | { kind: "life"; from?: number; to?: number } // play [from, to) of the sheet across the card's life
  | { kind: "fps"; fps: number; from?: number; loop?: boolean } // play at a steady rate
  | { kind: "fixed"; frame: number }; // one frame (a sprite)

export interface Spawn {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  /** seconds */
  life: number;
  /** seconds before it appears */
  delay?: number;
  /** card width in metres, at birth and at death */
  size: [number, number];
  /** a card's height / width; the sheet's own by default */
  aspect?: number;
  rot?: number;
  /** radians a second */
  spin?: number;
  /** tint, multiplied into the sheet's colour (1,1,1 = as baked) */
  color?: [number, number, number];
  /** a second tint it fades to over its life (a spark cooling, smoke greying) */
  colorEnd?: [number, number, number];
  /** peak opacity, and the share of the life spent fading in and out */
  alpha?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** 0 covers, 1 adds light; the sheet's default otherwise */
  glow?: number;
  /** m/s² downward (negative rises: hot smoke) */
  gravity?: number;
  /** 1/s, how fast it loses its speed */
  drag?: number;
  /** a streak's length per m/s of speed; 0 = an ordinary facing card */
  stretch?: number;
  /** lies flat on the floor (a ripple, a pool of light) instead of facing the camera */
  flat?: boolean;
  /** stops (and may bounce) at this height */
  floorY?: number;
  /** 0 = sticks, 0.4 = a spark skipping */
  bounce?: number;
  frame?: FrameMode;
  /** called once, the first time it reaches floorY (a droplet leaving a mark) */
  onLand?: (pos: THREE.Vector3, vel: THREE.Vector3) => void;
  /** dies on landing instead of resting there */
  dieOnLand?: boolean;
  /** [floor height, metres]: the card fades out over that much height above the floor, so
   *  where a camera-facing card meets the floor it softens instead of being cut by it in a
   *  hard straight line (a flame's base, a dust cloud's skirt) */
  soft?: [number, number];
}

interface Live {
  on: boolean;
  delay: number;
  age: number;
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  s0: number;
  s1: number;
  aspect: number;
  rot: number;
  spin: number;
  c0: [number, number, number];
  c1: [number, number, number];
  alpha: number;
  fadeIn: number;
  fadeOut: number;
  glow: number;
  gravity: number;
  drag: number;
  stretch: number;
  floorY: number;
  bounce: number;
  frame: FrameMode;
  onLand?: (pos: THREE.Vector3, vel: THREE.Vector3) => void;
  landed: boolean;
  dieOnLand: boolean;
  depth: number;
  softY: number;
  softH: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iSizeRot;   // width, height, rotation, stretch
attribute vec4 iColor;     // tint rgb, opacity
attribute vec3 iFrame;     // frame a, frame b, mix
attribute vec3 iGlow;       // glow, and the soft floor: its height and fade metres (0 = none)
uniform vec3 uGrid;        // cols, rows, 1 when the sheet's top row is at v=0 (KTX2), 0 when at v=1 (PNG)
varying vec2 vUvA;
varying vec2 vUvB;
varying float vMix;
varying vec4 vColor;
varying float vGlow;
varying float vViewZ;
varying float vSoft;
#include <common>
#include <logdepthbuf_pars_vertex>
vec2 cellUv(float f, vec2 uv) {
  float col = mod(f, uGrid.x);
  float row = floor(f / uGrid.x);
  // row 0 is the TOP of the sheet. A PNG is flipped on upload (UV 0,0 bottom-left); a KTX2
  // can't be, so its top row sits at v=0 (uGrid.z = 1)
  float k = (row + 1.0 - uv.y) / uGrid.y;
  return vec2((col + uv.x) / uGrid.x, uGrid.z > 0.5 ? k : 1.0 - k);
}
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;
  vec2 off;
  if (iSizeRot.w < 0.0) {
    // lying flat: the card's corners in the world's XZ plane, turned by its rotation
    float c = cos(iSizeRot.z), s = sin(iSizeRot.z);
    vec2 q = corner * iSizeRot.xy;
    vec2 w = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    mv = modelViewMatrix * vec4(iPos + vec3(w.x, 0.0, w.y), 1.0);
    off = vec2(0.0);
  } else if (iSizeRot.w > 0.0) {
    // a streak: the card's long side follows the motion as the camera sees it
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float l = length(d);
    d = l > 1e-4 ? d / l : vec2(0.0, 1.0);
    vec2 n = vec2(-d.y, d.x);
    float len = iSizeRot.y + l * iSizeRot.w;
    off = n * corner.x * iSizeRot.x + d * corner.y * len;
  } else {
    float c = cos(iSizeRot.z), s = sin(iSizeRot.z);
    vec2 q = corner * iSizeRot.xy;
    off = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vUvA = cellUv(iFrame.x, uv);
  vUvB = cellUv(iFrame.y, uv);
  vMix = iFrame.z;
  vColor = iColor;
  vGlow = iGlow.x;
  vViewZ = -mv.z;
  // how far this corner is above the soft floor, in fade lengths: the view-space offset taken
  // back to world space (the view's rotation is orthonormal, so its transpose undoes it)
  float wy = (modelMatrix * vec4(iPos, 1.0)).y + dot(viewMatrix[1].xyz, vec3(off, 0.0));
  vSoft = iGlow.z > 0.0 ? (wy - iGlow.y) / iGlow.z : 2.0;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLight;       // what lights the covering (smoke) part of a card: the zone's ambient
uniform float uNearFade;   // metres: cards this close to the lens fade out instead of filling it
varying vec2 vUvA;
varying vec2 vUvB;
varying float vMix;
varying vec4 vColor;
varying float vGlow;
varying float vViewZ;
varying float vSoft;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = mix(texture2D(uMap, vUvA), texture2D(uMap, vUvB), vMix);
  // premultiplied: colour already carries coverage
  vec3 lit = mix(uLight, vec3(1.0), vGlow);
  vec3 rgb = t.rgb * vColor.rgb * lit;
  float near = smoothstep(0.0, uNearFade, vViewZ - 0.05);
  float k = vColor.a * near * smoothstep(0.0, 1.0, vSoft);
  gl_FragColor = vec4(rgb * k, t.a * k * (1.0 - vGlow));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const tmpV = new THREE.Vector3();

export class ParticleLayer {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private parts: Live[] = [];
  private free: number[] = [];
  private order: number[] = [];
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aFrame: THREE.InstancedBufferAttribute;
  private aGlow: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  /** live cards after the last update */
  live = 0;

  /** `topDown`: the sheet's first row is at v=0 (a compressed KTX2, which can't be flipped on
   *  upload); false for a PNG loaded the usual way (first row at v=1). */
  constructor(readonly name: string, readonly texture: THREE.Texture, readonly sheet: SheetInfo, capacity: number, topDown = false) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute("iPos", (this.aPos = mk(3)));
    geo.setAttribute("iVel", (this.aVel = mk(3)));
    geo.setAttribute("iSizeRot", (this.aSize = mk(4)));
    geo.setAttribute("iColor", (this.aColor = mk(4)));
    geo.setAttribute("iFrame", (this.aFrame = mk(3)));
    geo.setAttribute("iGlow", (this.aGlow = mk(3)));
    geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: texture },
        uGrid: { value: new THREE.Vector3(sheet.cols, sheet.rows, topDown ? 1 : 0) },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uNearFade: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      toneMapped: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // the cards move every frame; bounds would be stale
    this.mesh.name = `fx:${name}`;
    this.mesh.renderOrder = 10; // after the opaque world, sorted among themselves
    this.mesh.visible = false;
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.parts = Array.from({ length: capacity }, () => ({
      on: false, delay: 0, age: 0, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s0: 1, s1: 1, aspect: 1, rot: 0, spin: 0,
      c0: [1, 1, 1], c1: [1, 1, 1], alpha: 1, fadeIn: 0.1, fadeOut: 0.3, glow: 0, gravity: 0, drag: 0, stretch: 0, floorY: -Infinity,
      bounce: 0, frame: { kind: "life" }, landed: false, dieOnLand: false, depth: 0, softY: 0, softH: 0,
    }));
  }

  /** Light the covering part of every card (the zone's ambient colour × level). */
  setLight(c: THREE.Color): void {
    (this.material.uniforms.uLight.value as THREE.Color).copy(c);
  }

  /** false when the layer is full: the newest card is the one that doesn't appear */
  spawn(s: Spawn): boolean {
    const i = this.free.pop();
    if (i === undefined) return false;
    const q = this.parts[i];
    q.on = true;
    q.delay = s.delay ?? 0;
    q.age = 0;
    q.life = Math.max(0.01, s.life);
    q.p.copy(s.pos);
    q.v.copy(s.vel ?? ZERO);
    q.s0 = s.size[0];
    q.s1 = s.size[1];
    q.aspect = s.aspect ?? this.sheet.aspect;
    q.rot = s.rot ?? 0;
    q.spin = s.spin ?? 0;
    q.c0 = s.color ?? [1, 1, 1];
    q.c1 = s.colorEnd ?? q.c0;
    q.alpha = s.alpha ?? 1;
    q.fadeIn = s.fadeIn ?? 0.05;
    q.fadeOut = s.fadeOut ?? 0.3;
    q.glow = s.glow ?? this.sheet.glow;
    q.gravity = s.gravity ?? 0;
    q.drag = s.drag ?? 0;
    q.stretch = s.flat ? -1 : s.stretch ?? 0;
    q.floorY = s.floorY ?? -Infinity;
    q.bounce = s.bounce ?? 0;
    q.frame = s.frame ?? { kind: "life" };
    q.onLand = s.onLand;
    q.landed = false;
    q.dieOnLand = s.dieOnLand ?? false;
    q.softY = s.soft?.[0] ?? 0;
    q.softH = s.soft?.[1] ?? 0;
    return true;
  }

  private kill(i: number): void {
    this.parts[i].on = false;
    this.parts[i].onLand = undefined;
    this.free.push(i);
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) if (this.parts[i].on) this.kill(i);
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
    this.live = 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    const view = camera.matrixWorldInverse;
    this.order.length = 0;
    for (let i = 0; i < this.capacity; i++) {
      const q = this.parts[i];
      if (!q.on) continue;
      if (q.delay > 0) {
        q.delay -= dt;
        if (q.delay > 0) continue;
      }
      q.age += dt;
      if (q.age >= q.life) {
        this.kill(i);
        continue;
      }
      if (!q.landed || q.bounce > 0) {
        if (q.drag > 0) q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.v.y -= q.gravity * dt;
        q.p.addScaledVector(q.v, dt);
        if (q.p.y <= q.floorY) {
          q.p.y = q.floorY;
          if (!q.landed) {
            q.landed = true;
            q.onLand?.(q.p.clone(), q.v.clone());
            if (q.dieOnLand) {
              this.kill(i);
              continue;
            }
          }
          if (q.bounce > 0 && Math.abs(q.v.y) > 0.4) {
            q.v.y = -q.v.y * q.bounce;
            q.v.x *= 0.7;
            q.v.z *= 0.7;
          } else {
            q.v.set(0, 0, 0);
            q.bounce = 0;
          }
        }
      }
      q.rot += q.spin * dt;
      q.depth = tmpV.copy(q.p).applyMatrix4(view).z; // more negative = further away
      this.order.push(i);
    }
    // back to front: smoke over smoke has to be drawn far first
    this.order.sort((a, b) => this.parts[a].depth - this.parts[b].depth);
    const n = this.order.length;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array;
    const S = this.aSize.array as Float32Array, C = this.aColor.array as Float32Array;
    const F = this.aFrame.array as Float32Array, G = this.aGlow.array as Float32Array;
    const { frames } = this.sheet;
    for (let k = 0; k < n; k++) {
      const q = this.parts[this.order[k]];
      const t = q.age / q.life;
      const size = q.s0 + (q.s1 - q.s0) * t;
      let a = q.alpha;
      if (q.fadeIn > 0 && t < q.fadeIn) a *= t / q.fadeIn;
      if (q.fadeOut > 0 && t > 1 - q.fadeOut) a *= (1 - t) / q.fadeOut;
      let f = 0;
      const fm = q.frame;
      if (fm.kind === "fixed") f = fm.frame;
      else if (fm.kind === "life") {
        const from = fm.from ?? 0, to = fm.to ?? frames;
        f = from + (to - from - 1) * t;
      } else {
        const raw = (fm.from ?? 0) + q.age * fm.fps;
        f = fm.loop ? raw % frames : Math.min(raw, frames - 1);
      }
      const fa = Math.floor(f);
      const fb = fm.kind === "fixed" ? fa : Math.min(fa + 1, frames - 1);
      P[k * 3] = q.p.x; P[k * 3 + 1] = q.p.y; P[k * 3 + 2] = q.p.z;
      V[k * 3] = q.v.x; V[k * 3 + 1] = q.v.y; V[k * 3 + 2] = q.v.z;
      S[k * 4] = size; S[k * 4 + 1] = size * q.aspect; S[k * 4 + 2] = q.rot; S[k * 4 + 3] = q.stretch;
      C[k * 4] = q.c0[0] + (q.c1[0] - q.c0[0]) * t;
      C[k * 4 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * t;
      C[k * 4 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * t;
      C[k * 4 + 3] = a;
      F[k * 3] = fa; F[k * 3 + 1] = fb; F[k * 3 + 2] = f - fa;
      G[k * 3] = q.glow; G[k * 3 + 1] = q.softY; G[k * 3 + 2] = q.softH;
    }
    for (const at of [this.aPos, this.aVel, this.aSize, this.aColor, this.aFrame, this.aGlow]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
      at.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    // hidden, never removed: an empty layer costs no draw and changes no program
    this.mesh.visible = n > 0;
    this.live = n;
  }

  /** what it holds on the GPU: the sheet with its mips, plus the instance buffers */
  gpuBytes(): number {
    return Math.round(textureBytes(this.texture) + this.capacity * (3 + 3 + 4 + 4 + 3 + 3) * 4);
  }


  dispose(): void {
    // only at the very end of a session (the material is never thrown away mid-show)
    this.geo.dispose();
    this.material.dispose();
  }
}

const ZERO = new THREE.Vector3();

/** What a texture holds on the GPU. A compressed one counts its real mip data (BC7 is one
 *  byte a pixel); anything else is RGBA8 with a third again for its mips. */
export function textureBytes(t?: THREE.Texture | null): number {
  if (!t) return 0;
  const mips = (t as THREE.CompressedTexture).mipmaps as { data?: ArrayBufferView }[] | undefined;
  if ((t as THREE.CompressedTexture).isCompressedTexture && mips?.length) return mips.reduce((n, m) => n + (m.data?.byteLength ?? 0), 0);
  const img = t.image as { width?: number; height?: number } | undefined;
  return img?.width && img?.height ? img.width * img.height * 4 * (4 / 3) : 0;
}
