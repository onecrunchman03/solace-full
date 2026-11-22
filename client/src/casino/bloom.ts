// THE HALL'S GLOW (Oct 2026, the Vegas redesign's first step). Josh: "I want
// that flashy casino look, lights, fun to look like enticing to play" — and a
// casino's light only reads as LIGHT when it spills: a marquee bulb, a neon
// tube and a slot's topper all bleed into the air around them. This is that
// spill, and nothing else in the hall changes.
//
// The shape is the "dual filter" bloom (downsample a chain of half-size
// targets, then upsample back up adding each level in), which is cheap at
// full DPR and soft enough not to read as a filter:
//
//   scene → sceneRT (HalfFloat, so a lit surface can be brighter than 1.0)
//         → bright pass + first halving        → down[0]   (1/2)
//         → down[0] → down[1] → … → down[N-1]  (each a further half)
//         → up: up[i] = tent(up[i+1]) + down[i]
//         → composite: scene + up[0] × strength → the next pass, or the canvas
//
// THE JUMBOTRON'S HOLE IS KEPT. The hall's racetrack is DOM behind the canvas,
// seen through a rectangle the screen's quad punches to alpha 0. The
// composite returns that rectangle exactly transparent — rgb too, since the
// canvas composites premultiplied and colour with no alpha would glow over
// the board (the drink pass's rule, drink.ts).
//
// THE ENCODE belongs to whichever pass writes the canvas, exactly once (drink
// and slorp's rule). The composite encodes only when it IS the last pass.
//
// Light count is untouched — this is pure post, so the frozen-light rule
// (CLAUDE.md, THE HALL NEVER COMPILES MID-GAME) holds; the materials here are
// warmed with the rest of the post chain in CasinoGame's prewarm.
import * as THREE from "three";

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The bright pass, fused with the first halving: a 4-tap box at half res,
// each tap thresholded with a soft knee so the glow fades in rather than
// switching on at a contour line.
const BRIGHT_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;     // 1 / source size
  uniform float uThreshold;
  uniform float uKnee;
  uniform float uClamp;
  vec3 bright(vec2 uv) {
    vec4 s = texture2D(tSrc, uv);
    if (s.a < 0.01) return vec3(0.0); // the jumbotron's hole sheds no light
    // THE CLAMP (Oct 2026, Josh: "the light glow is a little too intense"):
    // a pendant's shade sits right on its own point light, so its lit inside
    // reads many times brighter than any bulb or neon tube (those top out at
    // 1.0) and poured all of that into the halo — a sun overhead. Capping what
    // one pixel may hand the chain makes the shade glow like any other lamp.
    vec3 c = s.rgb * min(1.0, uClamp / max(max(s.r, max(s.g, s.b)), 1e-4));
    s = vec4(c, s.a);
    float l = max(s.r, max(s.g, s.b));
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float w = max(soft, l - uThreshold) / max(l, 1e-4);
    return s.rgb * w;
  }
  void main() {
    vec2 o = uTexel * 0.5;
    vec3 c = bright(vUv + vec2(-o.x, -o.y)) + bright(vUv + vec2(o.x, -o.y))
           + bright(vUv + vec2(-o.x, o.y)) + bright(vUv + vec2(o.x, o.y));
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;

// Dual-filter downsample: centre weighted 4, four diagonal half-texel taps.
const DOWN_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  void main() {
    vec2 o = uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }
`;

// Dual-filter upsample (a tent over the smaller level) plus this level's own
// downsample, so every scale contributes: small halos round bulbs, wide ones
// round the big signs.
const UP_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;   // the smaller level, already upsampled
  uniform sampler2D tAdd;   // this level's downsample
  uniform vec2 uTexel;      // 1 / tSrc size
  uniform float uRadius;
  void main() {
    vec2 o = uTexel * uRadius;
    vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
  }
`;

const COMPOSITE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uStrength;
  uniform float uEncode;
  void main() {
    vec4 s = texture2D(tScene, vUv);
    if (s.a < 0.01) { gl_FragColor = vec4(0.0); return; }
    vec3 col = s.rgb + texture2D(tBloom, vUv).rgb * uStrength;
    // a soft shoulder, so a pile-up of glow rolls off instead of clipping to
    // a flat white blob (only above 0.8 — the rest of the room is untouched)
    vec3 over = max(col - 0.8, vec3(0.0));
    col = min(col, vec3(0.8)) + over / (1.0 + over * 2.5);
    vec3 low = col * 12.92;
    vec3 high = 1.055 * pow(max(col, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    vec3 enc = mix(low, high, step(vec3(0.0031308), col));
    gl_FragColor = vec4(mix(col, enc, uEncode), s.a);
  }
`;

/** Levels in the chain: 1/2 … 1/64 of the frame. */
const LEVELS = 6;

export interface BloomTuning {
  /** How much of the glow is laid back over the room. */
  strength: number;
  /** Linear brightness where light starts to spill. */
  threshold: number;
  /** The soft ramp below the threshold. */
  knee: number;
  /** Upsample spread (1 = the classic filter; more = wider haloes). */
  radius: number;
  /** The most any one pixel may hand the glow (linear) — the anti-sun cap. */
  clamp: number;
}

/** Tuned by eye in the current hall (Oct 2026): the marquees, the slot
 *  toppers and the chandelier pendants glow; the carpet and walls don't.
 *  Retuned Oct 14 (Josh: "a little too intense"): the CLAMP is what tamed it —
 *  before it, every pendant shade overhead was a sun and the widest halo
 *  washed the whole floor orange. Was strength 1.5 · threshold 0.64 · radius
 *  1.15 with no clamp. */
export const BLOOM_DEFAULTS: BloomTuning = { strength: 1.2, threshold: 0.6, knee: 0.2, radius: 1.05, clamp: 1.6 };

const rtOpts = (samples = 0): THREE.RenderTargetOptions => ({
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: samples > 0,
  samples,
});

export class HallBloom {
  readonly tuning: BloomTuning = { ...BLOOM_DEFAULTS };
  /** The scene, linear and unclipped. MSAA to match the canvas's edges. */
  readonly sceneRT = new THREE.WebGLRenderTarget(2, 2, rtOpts(2));
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private brightMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private cam = new THREE.Camera();

  constructor() {
    for (let i = 0; i < LEVELS; i++) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, rtOpts()));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, rtOpts()));
    }
    const common = { vertexShader: VERT, depthTest: false, depthWrite: false };
    this.brightMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 0 }, uKnee: { value: 0 }, uClamp: { value: 1 },
      },
    });
    this.downMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: DOWN_FRAG,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    });
    this.upMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: UP_FRAG,
      uniforms: {
        tSrc: { value: null }, tAdd: { value: null },
        uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 },
      },
    });
    this.compMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: this.sceneRT.texture }, tBloom: { value: null },
        uStrength: { value: 0 }, uEncode: { value: 1 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Match the canvas (device pixels). Cheap to call every frame. */
  setSize(w: number, h: number): void {
    if (this.sceneRT.width !== w || this.sceneRT.height !== h) this.sceneRT.setSize(w, h);
    let lw = w, lh = h;
    for (let i = 0; i < LEVELS; i++) {
      lw = Math.max(1, lw >> 1);
      lh = Math.max(1, lh >> 1);
      const d = this.down[i], u = this.up[i];
      if (d.width !== lw || d.height !== lh) d.setSize(lw, lh);
      if (u.width !== lw || u.height !== lh) u.setSize(lw, lh);
    }
  }

  private pass(r: THREE.WebGLRenderer, mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    r.setRenderTarget(target);
    r.render(this.quadScene, this.cam);
  }

  /** Render the room with its glow into `target` (null = the canvas).
   *  `encode` = this is the last pass and owes the sRGB transfer. */
  render(
    r: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget | null,
    encode: boolean,
  ): void {
    const w = r.domElement.width, h = r.domElement.height;
    this.setSize(w, h);
    const t = this.tuning;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const bu = this.brightMat.uniforms;
    bu.tSrc.value = this.sceneRT.texture;
    bu.uTexel.value.set(1 / w, 1 / h);
    bu.uThreshold.value = t.threshold;
    bu.uKnee.value = Math.max(1e-3, t.knee);
    bu.uClamp.value = t.clamp;
    this.pass(r, this.brightMat, this.down[0]);

    const du = this.downMat.uniforms;
    for (let i = 1; i < LEVELS; i++) {
      const src = this.down[i - 1];
      du.tSrc.value = src.texture;
      du.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(r, this.downMat, this.down[i]);
    }

    // the smallest level stands as its own "upsampled" top
    const uu = this.upMat.uniforms;
    uu.uRadius.value = t.radius;
    let top = this.down[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; i--) {
      uu.tSrc.value = top.texture;
      uu.tAdd.value = this.down[i].texture;
      uu.uTexel.value.set(1 / top.width, 1 / top.height);
      this.pass(r, this.upMat, this.up[i]);
      top = this.up[i];
    }

    const cu = this.compMat.uniforms;
    cu.tBloom.value = top.texture;
    // the chain sums LEVELS scales of the same light; normalise so the
    // strength dial reads the same whatever LEVELS is
    cu.uStrength.value = t.strength / LEVELS;
    cu.uEncode.value = encode ? 1 : 0;
    this.pass(r, this.compMat, target);
    r.setRenderTarget(null);
  }

  /** Compile everything off the visible frame (CasinoGame's prewarm): the
   *  hall's HalfFloat-target variant and the four quads, plus one hidden
   *  run of the chain so the MSAA resolve and framebuffers are set up. */
  async warm(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, scratch: THREE.WebGLRenderTarget): Promise<void> {
    this.setSize(r.domElement.width, r.domElement.height);
    r.setRenderTarget(this.sceneRT);
    const p = r.compileAsync(scene, camera);
    r.setRenderTarget(null);
    await p;
    for (const m of [this.brightMat, this.downMat, this.upMat, this.compMat]) {
      this.quad.material = m;
      await r.compileAsync(this.quadScene, this.cam);
    }
    // the hidden run writes into a scratch target, never the canvas
    this.render(r, scene, camera, scratch, false);
  }

  dispose(): void {
    this.sceneRT.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    for (const m of [this.brightMat, this.downMat, this.upMat, this.compMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}

/** The per-viewer switch, remembered on this device (a look, not an account
 *  setting — and a preview Josh is comparing before it becomes the hall). */
const KEY = "solace_casino_glow";
export function loadGlowPref(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function saveGlowPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private window: the switch just won't be remembered */
  }
}
