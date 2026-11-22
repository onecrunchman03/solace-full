// SURVIVORZ EFFECTS — the system: every particle layer, decal set and effect
// light, the warm-up, the budget, and the explosion shake.
// docs/survivorz/EFFECTS.md is the plan; this is §2's rules in code.
//
//   const fx = new FxSystem({ scene, camera, renderer, load });
//   await fx.load();            sheets + sprites + decal atlases, once
//   await fx.warm();            compile every program and upload every texture NOW
//   fx.play(muzzle, { ... });   from a server event (with its seed)
//   fx.update(dt);              every frame, with the show's clock
//
// THE BUDGET IS ENFORCED, NOT HOPED FOR: 4,000 particles across every layer
// (each layer's capacity is fixed at load and they sum under the cap), decal
// sets of fixed size, six lights. A layer that's full drops the newest card;
// nothing ever grows.
import * as THREE from "three";
import { ParticleLayer, type SheetInfo, type Spawn } from "./particles";
import { makeSpriteTexture, SPRITE_SHEET } from "./sprites";
import { DecalSet, type DecalAtlas, type DecalSetOptions, type DecalSpec } from "./decals";
import { LightPool, type LightKind } from "./lights";
import { mulberry32, type Rng } from "./rng";
import { CasingPool } from "./casings";
import { RigidPool } from "./rigid";
import { Cuttable, loadGoreKit, type GoreKit } from "./gore";
import { loadBloodKit, type BloodKit } from "./blood";
import { loadScorchKit, type ScorchKit } from "./fire";
import { BeamPool } from "./beams";
import { Fixtures } from "./fixtures";
import { Torches } from "./torches";
import { BodyLook, loadSkinMask } from "./body";
import { DebrisPool, loadBreakKit, settleRattles, type BreakKit } from "./breaking";
import { loadHoleKit, type HoleKit } from "./holes";

export const BUDGET = {
  /** live particles across every layer */
  particles: 4000,
  /** the sprite layer's share (sparks, droplets, motes, chips: the many small things) */
  sprites: 1600,
  /** each flipbook layer's share */
  perSheet: 160,
  /** marks per decal set */
  decals: 400,
  /** draw calls effects may take in the worst moment */
  draws: 60,
} as const;

/** a sheet that's only there in case the better one isn't: our renders of the JangaFX
 *  simulations (F3) replaced the Unity blasts, which saved 33 MB of graphics memory */
const FALLBACK_FOR: Record<string, string> = { "explosion-a": "gas-burst", "explosion-hd": "gas-burst", "explosion-dust": "dust-impact" };

/** baked and kept, but drawn by nothing yet: not loaded unless asked for by name (2.7 MB) */
const UNDRAWN = new Set(["flame-small"]);

export interface FlipbookMeta extends SheetInfo {
  id: string;
  file: string;
  /** the same sheet compressed for the GPU (KTX2/UASTC → BC7), when it was baked */
  ktx2?: string | null;
}

export interface FxLoader {
  /** a texture under the fx/ tree, e.g. "flipbooks/flame-a.png" */
  texture(path: string, space: "srgb" | "linear"): Promise<THREE.Texture>;
  /** a KTX2 under the fx/ tree (a KTX2Loader with its transcoder); without it the PNGs load,
   *  at four times the graphics memory */
  compressed?(path: string): Promise<THREE.Texture>;
  json<T>(path: string): Promise<T>;
  /** a model under the fx/ tree (a GLTFLoader with the meshopt decoder); the gore needs it */
  model?(path: string): Promise<THREE.Object3D>;
}

export interface FxOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  load: FxLoader;
  /** which sheets to load (all of flipbooks.json by default) */
  sheets?: string[];
  /** the sprite sheet, if not drawn here (a check script outside a browser has no canvas) */
  spriteTexture?: THREE.Texture;
}

export interface EffectContext {
  fx: FxSystem;
  rng: Rng;
  now: number;
}
export type Effect<P> = (ctx: EffectContext, params: P) => void;

/** Something that keeps going (a fire): called every frame until it returns false. */
export type Emitter = (ctx: EffectContext, dt: number) => boolean;

export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  distance: number;
}

interface Shake {
  t0: number;
  dur: number;
  pos: THREE.Vector3;
  strength: number;
  radius: number;
  seed: number;
}

export class FxSystem {
  readonly root = new THREE.Group();
  readonly layers = new Map<string, ParticleLayer>();
  readonly decalSets = new Map<string, DecalSet>();
  readonly lights = new LightPool();
  /** spent brass and shells: real little meshes, three draws at most */
  readonly casings = new CasingPool();
  /** severed limbs, heads and gibs lying about */
  readonly rigid = new RigidPool();
  /** every light beam in the room (fixtures, flashlights): one draw */
  readonly beams = new BeamPool();
  /** the room's fixtures, driven: flicker, power, lockdown (F4) */
  readonly fixtures = new Fixtures();
  /** which room a surface is in: the world sets this when it registers its rooms (a mark that
   *  lasts is kept with its room) */
  roomOf: (obj: THREE.Object3D) => string = () => "";
  /** which room a point is in (wreckage lying there is kept with that room) */
  roomAt: (p: THREE.Vector3) => string = () => "";
  /** QUIET: effects make what lasts (wreckage, a severed piece) but nothing passing — no
   *  particles, lights, marks, shakes or emitters. A replay after a restart runs in it, so
   *  a door broken an hour ago is made again without breaking again on screen */
  quiet = false;
  /** what the show is doing right now (its event), stamped onto what it makes */
  cause?: unknown;
  /** the survivors' flashlights: their beams, their lenses, their batteries (one draw) */
  readonly torches = new Torches(this.beams);
  /** the survivors' bodies: grime, wounds, infection (F5) */
  readonly bodies = new Set<BodyLook>();
  /** the pieces of whatever just broke: a burst door, a pane, a plank (F6), one draw a break */
  readonly breaks = new DebrisPool();
  /** the wood and glass for things breaking, once loadBreaking() has run */
  breaking: BreakKit | null = null;
  /** the baked bullet holes (a "holes" decal set), once loadHoles() has run */
  holes: HoleKit | null = null;
  /** the helper session's caps and gibs, once loadGore() has run */
  gore: GoreKit | null = null;
  /** the photographed blood (two decal sets and what each cell is), once loadBlood() has run */
  blood: BloodKit | null = null;
  /** the scorch marks' cells, once loadScorch() has run */
  scorch: ScorchKit | null = null;
  /** walls, floors and props decals may land on (registered by the world) */
  readonly surfaces: THREE.Mesh[] = [];
  private emitters: { fn: Emitter; ctx: EffectContext; stopped?: boolean }[] = [];
  private shakes: Shake[] = [];
  private ray = new THREE.Raycaster();
  /** the show's clock, in seconds; advanced only by update() so a bench renders on a fixed clock */
  now = 0;

  constructor(readonly opts: FxOptions) {
    this.root.name = "fx";
    this.root.add(this.lights.group);
    this.root.add(this.casings.group);
    this.root.add(this.rigid.group);
    this.root.add(this.beams.mesh);
    this.root.add(this.torches.mesh);
    this.root.add(this.breaks.group);
    // wreckage is kept with the room it lies in, and knows what made it
    this.breaks.roomAt = (p) => this.roomAt(p);
    this.rigid.roomAt = (p) => this.roomAt(p);
    this.breaks.onAdd = (d) => { d.cause = this.cause; };
    opts.scene.add(this.root);
  }

  async load(): Promise<void> {
    const { load } = this.opts;
    const books = await load.json<Record<string, FlipbookMeta>>("flipbooks/flipbooks.json");
    // by default every sheet but a stand-in whose better version is there (5.6 MB never drawn)
    const want = this.opts.sheets ?? Object.keys(books).filter((id) => !(FALLBACK_FOR[id] && books[FALLBACK_FOR[id]]) && !UNDRAWN.has(id));
    const sprites = new ParticleLayer("sprites", this.opts.spriteTexture ?? makeSpriteTexture(), SPRITE_SHEET, BUDGET.sprites);
    sprites.mesh.renderOrder = 12;
    this.addLayer(sprites);
    let used = BUDGET.sprites;
    // (every sheet asked for at once, taken in order: one after another was a round trip to the server each —
    // a second and more of the load before the first big file was even started; Nov 13 2026, the review’s H5)
    const sheets = new Map<string, Promise<THREE.Texture>>();
    for (const id of want) {
      const m = books[id];
      if (!m) throw new Error(`fx: no flipbook "${id}"`);
      const p = m.ktx2 && load.compressed ? load.compressed(`flipbooks/${m.ktx2}`) : load.texture(`flipbooks/${m.file}`, "srgb");
      p.catch(() => {});   // (reported where it is awaited, below)
      sheets.set(id, p);
    }
    for (const id of want) {
      const m = books[id];
      if (used + BUDGET.perSheet > BUDGET.particles) throw new Error(`fx: ${id} would take the layers past ${BUDGET.particles} particles`);
      const packed = m.ktx2 && load.compressed;
      const tex = await sheets.get(id)!;
      if (packed) {
        // its mips came baked in the file; the colour is sRGB (the file says so)
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
      } else {
        // the PNG is already premultiplied: don't let the browser premultiply it again
        tex.premultiplyAlpha = false;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      const layer = new ParticleLayer(id, tex, m, BUDGET.perSheet, !!packed);
      // fire draws after smoke and dust: a fireball reads through a veil of dust the way it
      // does in life, where drawn the other way round the dust greyed the flame out (seen on
      // the pipe bomb). The sprites (sparks, embers, chips) draw last of all.
      // Bursts and fireballs carry smoke inside them, so they go between: over the dust, under
      // the pure flames (their smoke pockets laid over a molotov's flames read olive-green).
      layer.mesh.renderOrder = m.glow >= 0.9 ? 11 : m.glow >= 0.25 ? 10.5 : 10;
      this.addLayer(layer);
      used += BUDGET.perSheet;
    }
  }

  private addLayer(l: ParticleLayer): void {
    this.layers.set(l.name, l);
    this.root.add(l.mesh);
  }

  addDecalSet(name: string, atlas: DecalAtlas, capacity: number = BUDGET.decals, trisPerSlot?: number, opts?: DecalSetOptions): DecalSet {
    const d = new DecalSet(name, atlas, capacity, trisPerSlot, opts);
    // (a set loaded again replaces the old one: its kept marks with it)
    const old = this.decalSets.get(name);
    if (old) this.root.remove(old.mesh, old.keptRoot);
    d.roomOf = (o) => this.roomOf(o);
    this.decalSets.set(name, d);
    this.root.add(d.mesh, d.keptRoot);
    return d;
  }

  layer(name: string): ParticleLayer {
    const l = this.layers.get(name);
    if (!l) throw new Error(`fx: no layer "${name}"`);
    return l;
  }

  has(name: string): boolean {
    return this.layers.has(name);
  }

  spawn(layer: string, s: Spawn): boolean {
    if (this.quiet) return false;
    return this.layer(layer).spawn(s);
  }

  decal(set: string, d: DecalSpec): number {
    const s = this.decalSets.get(set);
    if (!s) throw new Error(`fx: no decal set "${set}"`);
    if (this.quiet) return -1;
    const slot = s.add(d, this.now);
    if (slot >= 0) this.onMark?.(set, d, this.now);
    return slot;
  }

  /** told of every mark laid (the ledger writes the lasting ones down) */
  onMark?: (set: string, d: DecalSpec, now: number) => void;
  /** told when something breaks and its marks go with it */
  onGone?: (obj: THREE.Object3D, now: number) => void;

  flash(kind: LightKind, pos: THREE.Vector3, peak: number, dur: number, color: THREE.ColorRepresentation, distance?: number, attack?: number): boolean {
    if (this.quiet) return false;
    return this.lights.flash(kind, this.now, pos, peak, dur, color, distance, attack);
  }

  holdLight(kind: LightKind) {
    if (this.quiet) return null;
    return this.lights.hold(kind, this.now);
  }

  /** Run an effect from a server event; the seed makes every observer's copy identical. */
  play<P>(effect: Effect<P>, params: P, seed: number): void {
    effect({ fx: this, rng: mulberry32(seed), now: this.now }, params);
  }

  /** Start something that keeps going. The handle stops it (a leak fixed, the power cut):
   *  it runs no more frames after stop(). */
  emit(fn: Emitter, seed: number): { stop(): void } {
    if (this.quiet) return { stop: () => {} };
    const e = { fn, ctx: { fx: this, rng: mulberry32(seed), now: this.now }, stopped: false };
    this.emitters.push(e);
    return { stop: () => { e.stopped = true; } };
  }

  /** Load the blood photographs into the "blood" (spatter) and "pools" decal sets. Once. */
  async loadBlood(): Promise<BloodKit> {
    this.blood ??= await loadBloodKit(this);
    return this.blood;
  }

  /** Load the scorch marks into a "scorch" decal set. Once. */
  async loadScorch(): Promise<ScorchKit> {
    this.scorch ??= await loadScorchKit(this);
    return this.scorch;
  }

  /** Load the baked bullet holes into a "holes" decal set. Once. */
  async loadHoles(): Promise<HoleKit> {
    this.holes ??= await loadHoleKit(this);
    return this.holes;
  }

  /** Load the wood and glass things break into. Once. */
  async loadBreaking(): Promise<BreakKit> {
    this.breaking ??= await loadBreakKit(this);
    return this.breaking;
  }

  /** Load the gore pieces (caps, gibs, their texture sets). Once, before the show. */
  async loadGore(): Promise<GoreKit> {
    this.gore ??= await loadGoreKit(this);
    return this.gore;
  }

  /** Make a body cuttable: its own copies of its materials, the cut attributes on its
   *  geometry (measured once a model), and every program the cut will use compiled now,
   *  so the first severed arm is not a freeze. */
  async cuttable(root: THREE.Object3D): Promise<Cuttable> {
    const kit = await this.loadGore();
    const c = new Cuttable(this, kit, root);
    if (!this.warmedCut.has(c.meshes[0].geometry)) {
      this.warmedCut.add(c.meshes[0].geometry);
      // the piece's static variant of each material, on a scrap of its own geometry
      const { renderer, camera, scene } = this.opts;
      const scrap = new THREE.Group();
      for (const m of c.meshes) {
        const g = new THREE.BufferGeometry();
        for (const name of ["position", "normal", "uv", "color", "aCutA", "aCutB", "aCutC"]) {
          const a = m.geometry.getAttribute(name);
          if (a) g.setAttribute(name, a);
        }
        g.setDrawRange(0, 3);
        scrap.add(new THREE.Mesh(g, m.material));
      }
      for (const o of [...kit.caps.values(), ...kit.gibs.values()]) scrap.add(o.clone());
      await renderer.compileAsync(scrap, camera, scene);
      // (the scrap is never disposed: its attributes are the body's own, and disposing it would
      // throw away the body's buffers)
    }
    return c;
  }

  private warmedCut = new WeakSet<THREE.BufferGeometry>();

  /** Give a survivor's body its look layer (their own material copy, their skin mask from
   *  fx-skin.mjs by name), with its program compiled now. */
  async body(root: THREE.Object3D, name: string): Promise<BodyLook> {
    const b = new BodyLook(root, await loadSkinMask(this.opts.load, name));
    this.bodies.add(b);
    const { renderer, camera, scene } = this.opts;
    this.opts.renderer.initTexture(b.texture);
    await renderer.compileAsync(root, camera, scene);
    return b;
  }

  /** The body is gone (a death, a newcomer's slot reused). */
  dropBody(b: BodyLook): void {
    this.bodies.delete(b);
  }

  /** What lights the covering part of every card (smoke, dust): the zone's ambient colour ×
   *  level. Glowing cards (flame, sparks, flashes) ignore it. */
  setAmbient(c: THREE.Color): void {
    for (const l of this.layers.values()) l.setLight(c);
  }

  /** The nearest registered surface along a ray, within `far` metres. */
  hit(origin: THREE.Vector3, dir: THREE.Vector3, far: number): SurfaceHit | null {
    if (this.surfaces.length === 0) return null;
    this.ray.set(origin, dir.clone().normalize());
    this.ray.far = far;
    const h = this.ray.intersectObjects(this.surfaces, false)[0];
    if (!h || !h.face) return null;
    const mesh = h.object as THREE.Mesh;
    const normal = h.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
    // a ray can meet a face from behind; the mark goes on the side we came from
    if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
    return { point: h.point.clone(), normal, mesh, distance: h.distance };
  }

  /** A short camera shake from a blast at `pos` (no slow motion — Josh, 2026-10-22). */
  shake(pos: THREE.Vector3, strength: number, radius: number, dur: number, seed: number): void {
    if (this.quiet) return;
    this.shakes.push({ t0: this.now, dur, pos: pos.clone(), strength, radius, seed });
  }

  /** How far to push a camera at `camPos` this frame. Small, decaying, falls off with distance. */
  shakeOffset(camPos: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(0, 0, 0);
    for (const s of this.shakes) {
      const t = this.now - s.t0;
      if (t < 0 || t >= s.dur) continue;
      const d = camPos.distanceTo(s.pos);
      const near = Math.max(0, 1 - d / s.radius);
      const k = s.strength * near * near * Math.pow(1 - t / s.dur, 2);
      if (k <= 0) continue;
      // smooth noise: a few sines at the event's own phases, so every observer shakes alike
      const r = mulberry32(s.seed);
      const ph = [r(), r(), r(), r(), r(), r()].map((x) => x * 6.283);
      out.x += k * (Math.sin(t * 37 + ph[0]) * 0.6 + Math.sin(t * 61 + ph[1]) * 0.4);
      out.y += k * (Math.sin(t * 41 + ph[2]) * 0.6 + Math.sin(t * 67 + ph[3]) * 0.4);
      out.z += k * (Math.sin(t * 29 + ph[4]) * 0.5 + Math.sin(t * 53 + ph[5]) * 0.3);
    }
    return out;
  }

  update(dt: number): void {
    this.now += dt;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.ctx.now = this.now;
      if (e.stopped || !e.fn(e.ctx, dt)) this.emitters.splice(i, 1);
    }
    for (const l of this.layers.values()) l.update(dt, this.opts.camera);
    for (const d of this.decalSets.values()) d.update(this.now);
    this.casings.update(dt, this.surfaces.length ? (o, d, f) => this.hit(o, d, f) : undefined);
    this.rigid.update(dt, this.surfaces.length ? (o, d, f) => this.hit(o, d, f) : undefined);
    this.breaks.update(dt, this.surfaces.length ? (o, d, f) => this.hit(o, d, f) : undefined);
    this.fixtures.update(this.now);
    this.torches.update(this.now, this.opts.camera);
    for (const b of this.bodies) b.update(dt);
    this.beams.update(this.now, this.surfaces.length ? (o, d, f) => this.hit(o, d, f)?.distance ?? null : undefined);
    this.lights.update(this.now);
    this.shakes = this.shakes.filter((s) => this.now - s.t0 < s.dur);
  }

  /** Compile every effect's program and upload every texture before the show, so the first
   *  molotov is not a freeze. Layers are briefly shown (empty) so the compiler sees them. */
  async warm(): Promise<void> {
    const { renderer, scene, camera } = this.opts;
    const hidden: THREE.Object3D[] = [];
    for (const o of [...[...this.layers.values()].map((l) => l.mesh), ...[...this.decalSets.values()].map((d) => d.mesh), ...this.casings.meshes.values(), this.beams.mesh, this.torches.mesh]) {
      if (!o.visible) {
        o.visible = true;
        hidden.push(o);
      }
    }
    for (const l of this.layers.values()) renderer.initTexture(l.texture);
    for (const d of this.decalSets.values()) {
      for (const t of [d.atlas.map, d.atlas.normalMap, d.atlas.roughnessMap, d.atlas.spreadMap]) if (t) renderer.initTexture(t);
    }
    // the effect lights are already in the scene (count fixed), so this compiles the
    // programs the show will actually use
    await renderer.compileAsync(scene, camera);
    for (const o of hidden) o.visible = false;
  }

  stats() {
    let particles = 0, draws = 0, gpu = 0;
    const layers: Record<string, number> = {};
    for (const l of this.layers.values()) {
      particles += l.live;
      layers[l.name] = l.live;
      if (l.live > 0) draws++;
      gpu += l.gpuBytes();
    }
    let decals = 0;
    for (const d of this.decalSets.values()) {
      decals += d.live;
      if (d.mesh.visible) draws++;
      // (a room's kept marks: one draw a chunk, frustum-culled like the room itself)
      draws += d.keptDraws;
      gpu += d.gpuBytes();
    }
    draws += this.casings.draws + this.rigid.draws + this.breaks.draws + (this.beams.mesh.visible ? 1 : 0) + (this.torches.mesh.visible ? 1 : 0);
    gpu += this.casings.gpuBytes() + (this.gore?.bytes ?? 0) + (this.breaking?.bytes ?? 0) + this.breaks.gpuBytes();
    for (const b of this.bodies) gpu += b.gpuBytes();
    return { particles, layers, decals, casings: this.casings.live, rigid: this.rigid.live, debris: this.breaks.live, draws, lights: this.lights.busy, emitters: this.emitters.length, gpuMB: Math.round(gpu / 1e5) / 10 };
  }

  /** A NEW RUN (show/scene.ts, on a snapshot of a different run): everything the last run left on
   *  the floor goes — blood, scorch, holes, casings, severed limbs, gore and wreckage, the effects in
   *  flight — and nothing the ROOMS own (their fixtures and beams, registered by the zones that are
   *  loaded) is touched. The bodies' own looks go with their actors. */
  clearRun(): void {
    this.emitters = [];
    this.shakes = [];
    for (const l of this.layers.values()) l.clear();
    for (const d of this.decalSets.values()) d.clear();
    this.lights.clear();
    this.casings.clear();
    this.rigid.clear();
    this.breaks.clear();
    settleRattles();
  }

  clear(): void {
    this.emitters = [];
    this.shakes = [];
    for (const l of this.layers.values()) l.clear();
    for (const d of this.decalSets.values()) d.clear();
    this.lights.clear();
    this.casings.clear();
    this.rigid.clear();
    this.breaks.clear();
    settleRattles();
    this.fixtures.clear();
    this.torches.clear();
    this.beams.clear();
  }
}
