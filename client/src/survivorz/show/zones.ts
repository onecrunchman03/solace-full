// SOLACE SURVIVORZ — THE SHOW: the whole facility in one scene, zone by zone.
//
// Each zone is the Look Test's room (room/lobby.ts, the source this follows — keep the two in
// step): the baked shell with its two lightmaps (the blackout and the mains), the grime, the
// packed props, the fixtures. What is different here:
//   · ZONES STREAM. All eight at once is ~2,000 props and two 2048² float lightmaps a zone; the
//     show runs beside a 15 GB language model. A zone loads when the camera comes near it and
//     goes when it is far and the budget is full (`ZONE_BUDGET`). One loads at a time.
//   · PROPS ARE INSTANCED: every repeat of one mesh in a zone (a bunk, a chair, a locker) is one
//     InstancedMesh — a zone's 500 props are a few dozen draws, not a thousand.
//   · THE POWER IS THE SERVER'S: the frames' `power` and `zone.powered` swap a zone's lightmap
//     (the same channel, no recompile) and the effects' Fixtures drive every glow, flicker,
//     bank-by-bank return and dip from the event's seed and time (fx/fixtures.ts).
//   · NO LIGHT IS EVER ADDED HERE. The real-time lights are the show's fixed rig (show/rig.ts);
//     a zone only says where its working fixtures are.
import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, loadGlb, loadTexture, prefetchAsset, sessionHeaders } from "../assets";
import { cachedBytes, FetchError } from "../assetcache";
import { tameGlbTransparency } from "../../lib/three-hygiene";
import type { FlickerStyle, FxSystem } from "../fx";
import { ZONES, WALL_PIECE, wallYaw, hashStr, trimOffset, type FixtureKind, type Layout, type Prop, type ZoneId } from "../room/lobby";
import { releaseGeometry, releaseTexture } from "./release";
import { FLOOR_Y, MAP_ID, ROOMS, SITE_OF, allZonesAlways, ceilingOf, distToBox, neighbours, roomAt, roomInfo, zoneBox, zonesInPlay, type SiteZone, type V3, type ZoneBox } from "./site";

/** A HOUSE WHOSE LAMPS ARE IN ITS BAKE (Glenridge Hall): with the lights out, this much of the baked light is left */
const DARK_LEVEL = 0.06;
/** the light on a set with no bake of its own (the grounds, at night): a flat, dim blue, standing in for a lightmap */
const NIGHT = [0.06, 0.08, 0.135] as const;
/** THE FLASHLIGHTS LIGHT THE WALLS (a house in the dark): a baked shell takes no real-time light (its lamps are in
 *  the bake), so a torch lit the bodies and never the room. The house's shells add the three torch spots the rig
 *  lends (show/rig.ts) by hand, in view space: uniforms shared by every shell material, written once a frame. */
export const TORCH_N = 3;
const TORCH_U = {
  uTorchPos: { value: Array.from({ length: TORCH_N }, () => new THREE.Vector3()) },
  uTorchDir: { value: Array.from({ length: TORCH_N }, () => new THREE.Vector3(0, 0, -1)) },
  uTorchLevel: { value: new Float32Array(TORCH_N) },
};
const TORCH_FRAG = `
uniform vec3 uTorchPos[${TORCH_N}]; uniform vec3 uTorchDir[${TORCH_N}]; uniform float uTorchLevel[${TORCH_N}];
vec3 houseTorch(vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${TORCH_N}; i++) {
    if (uTorchLevel[i] <= 0.0) continue;
    vec3 L = uTorchPos[i] + vViewPosition;      // (vViewPosition is minus the fragment's place in view space)
    float d = length(L); L /= max(d, 1e-4);
    float cone = smoothstep(0.86, 0.965, dot(-L, uTorchDir[i]));
    float fall = 1.0 / (1.0 + 0.09 * d * d) * (1.0 - smoothstep(9.0, 15.0, d));
    sum += vec3(1.0, 0.95, 0.86) * (uTorchLevel[i] * cone * fall * max(dot(n, L), 0.0));
  }
  return sum;
}`;

/** A HEARTH'S FLAMES: the build's are flat white cards in a GLB (a node material does not survive the export), so
 *  each fire is drawn here: three crossed sheets of scrolling noise, additive, every fire of a zone in one mesh. */
const FLAME_U = { uTime: { value: 0 } };
let flameMat: THREE.ShaderMaterial | null = null;
function flameMaterial(): THREE.ShaderMaterial {
  return (flameMat ??= new THREE.ShaderMaterial({
    // (forceSinglePass: transparent + two-sided otherwise takes three's two-pass path, which rebuilds the material
    // twice a frame for ever — the hall's rule, CLAUDE.md "NO TWO-PASS TRANSPARENCY")
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false, uniforms: FLAME_U,
    vertexShader: `
      attribute float seed; uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv; vSeed = seed;
        vec3 p = position;
        p.x += sin(uTime * 3.1 + seed * 7.0 + uv.y * 4.0) * 0.035 * uv.y;
        p.z += cos(uTime * 2.3 + seed * 5.0 + uv.y * 3.0) * 0.03 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15; }
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float f = fbm(vec2(vUv.x * 3.0 + vSeed * 9.0, vUv.y * 2.4 - uTime * 1.7));
        // a tongue: wide at the foot, drawn in and torn toward the tip
        float body = 1.0 - smoothstep(0.25 + 0.55 * (1.0 - vUv.y), 0.95 - 0.35 * vUv.y, x + (f - 0.5) * 0.5 * (0.4 + vUv.y));
        float a = body * smoothstep(1.0, 0.35, vUv.y + (f - 0.5) * 0.7) * smoothstep(0.0, 0.06, vUv.y);
        float heat = a * (1.15 - vUv.y) * (0.75 + f * 0.6);
        vec3 col = mix(vec3(0.75, 0.09, 0.01), vec3(1.0, 0.48, 0.06), smoothstep(0.15, 0.6, heat));
        col = mix(col, vec3(1.0, 0.9, 0.55), smoothstep(0.6, 1.05, heat));
        gl_FragColor = vec4(col * a * 1.5, a);
      }`,
  }));
}
let nightTex: THREE.DataTexture | null = null;
function nightMap(): THREE.DataTexture {
  if (!nightTex) {
    nightTex = new THREE.DataTexture(new Float32Array([NIGHT[0], NIGHT[1], NIGHT[2], 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    nightTex.channel = 0; nightTex.needsUpdate = true;
  }
  return nightTex;
}

/** how many zones may be loaded at once (measured: see the show's report) */
export const ZONE_BUDGET = 4;
/** a zone load whose step hasn't moved for this long is taken as hung, dropped and tried again */
const LOAD_STUCK_MS = 45_000;
/** load a zone once the camera is this near its box, metres */
const LOAD_NEAR = 18;
/** a zone further than this may be unloaded to make room */
const UNLOAD_FAR = 34;


/** A working fixture: where it is, what the rig may light at it. */
export interface ZFix {
  id: string;            // the effects' fixture id (fx.fixtures)
  kind: FixtureKind;
  at: THREE.Vector3;
  face?: THREE.Vector3;
  room: string;
  zone: SiteZone;
  /** "mains": lit only with the zone powered; "battery": the emergency circuit, always; "emergency": the twin-heads, lit only in a blackout */
  feed: "mains" | "battery" | "emergency";
  /** a hearth's own light (a house): it flickers */
  fire?: boolean;
}

interface Loaded {
  id: ZoneId;
  site: SiteZone;
  box: ZoneBox;
  group: THREE.Group;
  state: "loading" | "ready" | "gone";
  shellMats: THREE.MeshStandardMaterial[];
  lm: [THREE.Texture | null, THREE.Texture | null];
  mains: boolean;
  fixtures: ZFix[];
  /** what this zone owns and frees (props' shared geometry and materials are NOT here) */
  own: { geo: Set<THREE.BufferGeometry>; mat: Set<THREE.Material>; tex: Set<THREE.Texture> };
  surfaces: THREE.Mesh[];
  /** fx clock time to swap the lightmap at (a power change waits for the banks) */
  swapAt: number | null;
  /** the door props standing in this zone (a lab door's leaf, the vault's), for the doors */
  doorProps: THREE.Object3D[];
  /** ROOM CULLING: what stands in each room (its props, decals, the shell's fixtures and glass),
   *  shown only while the camera can see into that room (FacilityZones.cull) */
  rooms: Map<string, THREE.Object3D[]>;
  /** the set's moving parts (nodes named DYN_<name> in the zone's file: a stone, a crest, the car) */
  dyn: Map<string, THREE.Object3D>;
  /** the parts that glow by the house's electricity (not its fires), and how brightly when it is on */
  glow: { m: THREE.MeshStandardMaterial; base: number }[];
  /** where a fire burns (the flames' own meshes in the zone's file): for its sound and its light */
  fires: THREE.Vector3[];
  /** each fire's flames as the build drew them: the box they fill */
  fireBoxes: THREE.Box3[];
  /** the flames' materials (they flicker: FacilityZones.update) */
  flames: THREE.MeshStandardMaterial[];
}

const BOX = (z: ZoneId) => zoneBox(SITE_OF[z]);

/** THE FIRST ZONE'S FILES, ASKED FOR AT ONCE (Nov 3 2026): the shell and both lightmaps start downloading
 *  into the asset store as the page opens, while the effects load, instead of only once the scene asks for
 *  the zone — its load then finds them there (assetcache.ts). The zone nearest `p` (the camera's first look). */
export function prefetchZone(p: V3): void {
  const id = zonesInPlay().map((z) => ({ z, d: distToBox(p, BOX(z)) })).sort((a, b) => a.d - b.d)[0]?.z;
  if (!id) return;
  const area = ZONES[id].area;
  prefetchAsset(assetUrl(area, `${id}.glb`), 0);
  for (const f of ["lightmap.exr", "lightmap-mains.exr"]) prefetchAsset(`/api/survivorz/asset/${area}/${f}`, 0);
}

export class FacilityZones {
  readonly zones = new Map<ZoneId, Loaded>();
  private boxes = new Map<ZoneId, ZoneBox>(zonesInPlay().map((z) => [z, BOX(z)]));
  /** the power as the server has it, zone by zone (kept for zones that load later) */
  private power = new Map<SiteZone, boolean>();
  private propCache = new Map<string, Promise<THREE.Object3D>>();
  private decalTex = new Map<string, Promise<THREE.Texture | null>>();
  private busy = false;
  private disposed = false;
  /** a zone whose load failed waits this long (performance.now) before it's tried again */
  private failedUntil = new Map<ZoneId, number>();
  /** zones the camera asked to keep regardless (a pinned zone) */
  pinned = new Set<ZoneId>();
  budget = ZONE_BUDGET;
  onChange: () => void = () => {};
  /** THE LOAD, SAID (Nov 3 2026: Josh's desktop app sat on no zone at all, ready but black): the step the
   *  zone being loaded is on and since when, and the last failure — read by the page's Shift+D box */
  loading: { id: ZoneId; step: string; since: number; at: number } | null = null;
  lastError = "";
  private loadingZone: Loaded | null = null;
  private step(s: string): void { if (this.loading) { this.loading.step = s; this.loading.at = performance.now(); } }
  /** a zone's load reached a stage (the scene's load log, show/scene.ts) */
  onStage: (id: ZoneId, stage: string) => void = () => {};

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private camera: THREE.Camera, private fx: FxSystem) {}

  ready(): ZoneId[] { return [...this.zones.values()].filter((z) => z.state === "ready").map((z) => z.id); }
  isReady(site: SiteZone): boolean {
    for (const z of this.zones.values()) if (z.site === site && z.state === "ready") return true;
    return false;
  }
  fixtures(): ZFix[] {
    const out: ZFix[] = [];
    for (const z of this.zones.values()) if (z.state === "ready") out.push(...z.fixtures);
    return out;
  }
  powered(site: SiteZone): boolean { return this.power.get(site) ?? false; }

  /** Which zones the camera wants (call every few frames). Loads the nearest wanted one if it
   *  isn't, and drops the furthest when over budget. */
  want(p: V3): void {
    if (this.disposed) return;
    // A LOAD THAT HANGS IS LET GO (a step that never comes back — a fetch, a decode, a compile — used to keep
    // `busy` for good: no zone ever again, a black picture under a live overlay). It's dropped and tried again.
    if (this.busy && this.loading && this.loadingZone && performance.now() - this.loading.at > LOAD_STUCK_MS) {
      const z = this.loadingZone;
      this.lastError = `${z.id}: stuck on ${this.loading.step} for ${Math.round((performance.now() - this.loading.at) / 1000)} s`;
      console.warn(`[survivorz] zone ${this.lastError} — trying again`);
      z.state = "gone";
      if (this.zones.get(z.id) === z) this.zones.delete(z.id);
      this.failedUntil.set(z.id, performance.now() + 5_000);
      this.loading = null; this.loadingZone = null;
      this.busy = false;
    }
    const order = [...this.boxes.entries()].map(([id, b]) => ({ id, d: this.pinned.has(id) ? -1 : distToBox(p, b) })).sort((a, b) => a.d - b.d);
    // (a house and its grounds are seen through each other's windows: all of it is kept, nearest first)
    const want = allZonesAlways() ? order.map((o) => o.id) : order.filter((o) => o.d < LOAD_NEAR).slice(0, this.budget).map((o) => o.id);
    // the zone the camera is in always (a camera between zones gets the nearest)
    if (!want.length) want.push(order[0].id);
    // over budget: let go of the furthest one that isn't wanted and is far
    const loaded = [...this.zones.values()].filter((z) => z.state !== "gone");
    if (loaded.length >= this.budget && !allZonesAlways()) {
      const far = loaded.filter((z) => !want.includes(z.id) && !this.pinned.has(z.id)).map((z) => ({ z, d: distToBox(p, z.box) })).sort((a, b) => b.d - a.d)[0];
      if (far && (far.d > UNLOAD_FAR || want.some((w) => !this.zones.has(w)))) this.unload(far.z.id);
    }
    if (this.busy) return;
    const next = want.find((w) => !this.zones.has(w) && (this.failedUntil.get(w) ?? 0) < performance.now());
    if (next && (allZonesAlways() || [...this.zones.values()].filter((z) => z.state !== "gone").length < this.budget)) void this.load(next);
  }

  /** The server's power for a zone. `at` (fx clock) is when the event happened; the lightmap
   *  swaps once the banks have mostly come up (on) or gone (off). */
  setPower(site: SiteZone, on: boolean, at: number | null): void {
    this.power.set(site, on);
    for (const z of this.zones.values()) {
      if (z.site !== site || z.state !== "ready") continue;
      if (at === null) this.swap(z, on);
      // (an event is never in the future: a clock a little out must not hold the lights for half a minute)
      else z.swapAt = Math.min(at, this.fx.now) + (on ? 1.2 : 0.35);
    }
  }

  update(fxNow: number): void {
    for (const z of this.zones.values()) {
      if (z.swapAt !== null && fxNow >= z.swapAt) { z.swapAt = null; this.swap(z, this.powered(z.site)); }
      FLAME_U.uTime.value = fxNow;
      // the flames breathe (a uniform each: nothing compiles)
      for (let i = 0; i < z.flames.length; i++) {
        const m = z.flames[i], b = (m.userData.base as number) ?? 1;
        m.emissiveIntensity = b * (0.82 + 0.18 * Math.sin(fxNow * 9.1 + i * 2.3) + 0.12 * Math.sin(fxNow * 23.7 + i * 5.1));
      }
    }
  }
  /** every fire burning in the zones that are in (a hearth's flames) */
  fires(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const z of this.zones.values()) if (z.state === "ready") out.push(...z.fires);
    return out;
  }

  private swap(z: Loaded, on: boolean): void {
    const map = on ? z.lm[1] ?? z.lm[0] : z.lm[0];
    z.mains = on && !!z.lm[1];
    // (a set with nothing baked keeps the flat night light it was given)
    if (map) for (const m of z.shellMats) m.lightMap = map;   // the same channel and filtering: a swap, no recompile
    // ONE BAKE, LAMPS LIT (Glenridge Hall): the lights out is that bake turned almost off, and the lamps' own
    // glass with it (uniforms: no recompile). The fires stay lit. The grounds' flat night light isn't the house's.
    if (MAP_ID !== "bunker" && z.lm[0] && !z.lm[1]) {
      for (const m of z.shellMats) m.lightMapIntensity = Math.PI * (on ? 1 : DARK_LEVEL);
      for (const g of z.glow) g.m.emissiveIntensity = g.base * (on ? 1 : 0.02);
    }
  }

  private unload(id: ZoneId): void {
    const z = this.zones.get(id);
    if (!z) return;
    z.state = "gone";
    this.zones.delete(id);
    this.free(z);
    this.onChange();
  }

  /** take a zone out of the world and free what it owns (idempotent: a zone dropped while it was
   *  still loading is freed again by the load once it notices) */
  private free(z: Loaded): void {
    this.scene.remove(z.group);
    for (const f of z.fixtures) this.fx.fixtures.remove(f.id);
    const surf = new Set(z.surfaces);
    for (let i = this.fx.surfaces.length - 1; i >= 0; i--) if (surf.has(this.fx.surfaces[i])) this.fx.surfaces.splice(i, 1);
    // (an InstancedMesh's instance matrices are a GPU buffer of its own — not its geometry, which the
    // props share — and only its dispose() lets it go: every unload leaked one per instanced group)
    // (a skinned prop's clone has its own skeleton, whose bone texture is the same kind of orphan)
    z.group.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      else if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose();
    });
    for (const g of z.own.geo) g.dispose();
    for (const m of z.own.mat) m.dispose();
    for (const t of z.own.tex) t.dispose();
  }

  /** the door props of the ready zones (show/doors.ts finds a door's real leaf among them) */
  doorProps(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const z of this.zones.values()) if (z.state === "ready") out.push(...z.doorProps);
    return out;
  }

  private async load(id: ZoneId): Promise<void> {
    this.busy = true;
    const now = performance.now();
    this.loading = { id, step: "the shell and its light", since: now, at: now };
    this.onStage(id, "started");
    const L = ZONES[id].layout;
    const z: Loaded = {
      id, site: SITE_OF[id], box: this.boxes.get(id)!, group: new THREE.Group(), state: "loading", shellMats: [], lm: [null, null], mains: false,
      fixtures: [], own: { geo: new Set(), mat: new Set(), tex: new Set() }, surfaces: [], swapAt: null, doorProps: [], rooms: new Map(),
      dyn: new Map(), glow: [], fires: [], fireBoxes: [], flames: [],
    };
    z.group.name = `zone:${id}`;
    this.zones.set(id, z);
    this.loadingZone = z;
    try {
      const area = ZONES[id].area;
      // (each part says how far it got, so a stall names itself: the shell's download, or which lightmap)
      const part = { shell: 0, lm: "…", mains: "…" };
      // THE PROPS START NOW (Nov 13 2026, the review’s H5): each is its own file, placed once the shell is in — but
      // asked for only then, so their unpacking (three seconds of texture workers, the page idle) came after the
      // shell’s instead of beside it. Started here; placeProps finds them under way. A failure is its to report.
      for (const id of new Set((L.props as { id: string }[]).map((p) => p.id))) void this.prop(id).catch(() => {});
      const say = () => this.step(`the shell ${part.shell >= 1 ? "done" : `${Math.round(part.shell * 100)}%`} · light ${part.lm} · mains light ${part.mains}`);
      const [room, lm0, lm1] = await Promise.all([
        loadGlb(assetUrl(area, `${id}.glb`), (f) => { if (Math.round(f * 100) !== Math.round(part.shell * 100)) { part.shell = f; say(); } }, 0).then((r) => { part.shell = 1; say(); return r; }),
        this.lightmap(area, "lightmap.exr", (f) => { const v = `${Math.round(f * 100)}%`; if (v !== part.lm) { part.lm = v; say(); } }).then((t) => { part.lm = t ? "done" : "none"; say(); return t; }),
        this.lightmap(area, "lightmap-mains.exr", (f) => { const v = `${Math.round(f * 100)}%`; if (v !== part.mains) { part.mains = v; say(); } }).then((t) => { part.mains = t ? "done" : "none"; say(); return t; }),
      ]);
      if (this.gone(z)) { freeTree(room.scene); lm0?.dispose(); lm1?.dispose(); return; }
      this.onStage(id, "shell and light in");
      tameGlbTransparency(room.scene);
      z.lm = [lm0, lm1];
      for (const t of [lm0, lm1]) if (t) z.own.tex.add(t);
      room.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        z.own.geo.add(m.geometry);
        for (const mat of mats(m)) { z.own.mat.add(mat); for (const t of texturesOf(mat)) z.own.tex.add(t); }
      });
      // the shell's arrays and pixels leave JS once they're on the GPU (show/release.ts): nothing
      // raycasts the shell or projects onto it (the fixtures were measured first, in dressShell)
      z.group.add(room.scene);
      this.dressShell(z, room.scene, L);
      room.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) releaseGeometry(m.geometry); });
      for (const t of z.own.tex) releaseTexture(t);
      this.step("decals"); this.onStage(id, "decals");
      await this.placeDecals(z, L);
      if (this.gone(z)) return;
      this.step("props"); this.onStage(id, "props");
      await this.placeProps(z, L);
      if (this.gone(z)) return;
      this.catchers(z);
      this.proxies(z);
      // the power as it stands now: no bank-by-bank return for a zone that arrives already lit
      this.swap(z, this.powered(z.site));
      // compile and upload before it's seen (the hall's rule): the shell's programs are shared,
      // its textures aren't
      // (compiled OUTSIDE the scene, against its lights: three's compile walks only what's visible,
      // and a group hidden in the scene to compile compiled nothing — the first frame that showed it
      // then built every program synchronously, an 11-second freeze measured in Chrome on ANGLE)
      this.step("compiling"); this.onStage(id, "compiling");
      await this.renderer.compileAsync(z.group, this.camera, this.scene);
      if (this.gone(z)) return;
      this.step("uploading"); this.onStage(id, "uploading");
      // every texture up before it's seen — both lightmaps too (the mains one isn't on a material
      // yet: a power change mustn't upload) — A FEW A FRAME: all of a zone's at once was a 435 ms
      // long task (measured, Medical), a visible stall on the stream
      const up = new Set<THREE.Texture>();
      z.group.traverse((o) => { for (const m of mats(o as THREE.Mesh)) for (const t of texturesOf(m)) up.add(t); });
      for (const t of z.lm) if (t) up.add(t);
      let t0 = performance.now();
      for (const t of up) {
        if (performance.now() - t0 > 6) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          if (this.gone(z)) return;
          t0 = performance.now();
        }
        this.renderer.initTexture(t);
      }
      if (this.gone(z)) return;
      this.scene.add(z.group);
      z.state = "ready";
      this.onStage(id, "ready");
      this.dirtyCull = true;
      this.onChange();
    } catch (e) {
      console.warn(`[survivorz] zone ${id} failed to load`, e);
      this.lastError = `${id}: ${String((e as Error)?.message ?? e)}`;
      this.failedUntil.set(id, performance.now() + 30_000);
      if (this.zones.get(id) === z) this.zones.delete(id);
      this.free(z);
    } finally {
      // (a load let go as stuck has already handed `busy` on; only the load still on the books clears it)
      if (this.loadingZone === z) { this.busy = false; this.loading = null; this.loadingZone = null; }
    }
  }

  /** file a thing under the room it stands in (culled with the room) */
  private inRoom(z: Loaded, room: string | null | undefined, o: THREE.Object3D): void {
    let id = room && roomInfo(room) ? room : "";
    if (!id) {
      const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
      id = roomAt(c.x, b.min.y + 0.3, c.z)?.id ?? "";
    }
    let list = z.rooms.get(id);
    if (!list) z.rooms.set(id, (list = []));
    list.push(o);
  }

  private visible = new Set<string>();
  private lastCull = "";
  private dirtyCull = true;

  /** ROOM CULLING. Three can only cull what's off screen, not what's behind a wall, and a zone is
   *  hundreds of props: so only the rooms the camera could see into are drawn — its own room, the
   *  rooms a door away and a door further, and any room within a few metres (a camera outside every
   *  room, flying, sees what's near). The shell (one mesh a zone) is always drawn. */
  cull(cam: THREE.Vector3, focus: THREE.Vector3): void {
    const vis = new Set<string>();
    const near = (p: THREE.Vector3, m: number) => {
      for (const r of ROOMS) {
        const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dz = Math.max(r.z0 - p.z, 0, p.z - r.z1), dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
        if (Math.hypot(dx, dz, dy * 3) < m) vis.add(r.id);
      }
    };
    const spread = (id: string, depth: number) => {
      let front = [id];
      vis.add(id);
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const r of front) for (const n of neighbours(r)) if (!vis.has(n)) { vis.add(n); next.push(n); }
        front = next;
      }
    };
    const rc = roomAt(cam.x, cam.y, cam.z), rf = roomAt(focus.x, focus.y, focus.z);
    if (rc) spread(rc.id, 2); else near(cam, 14);
    if (rf) spread(rf.id, 1);
    near(cam, 4);
    const key = [...vis].sort().join(",");
    if (key === this.lastCull && !this.dirtyCull) return;
    this.lastCull = key;
    this.dirtyCull = false;
    this.visible = vis;
    for (const z of this.zones.values()) {
      if (z.state !== "ready") continue;
      for (const [room, list] of z.rooms) {
        const on = room === "" || vis.has(room) || allZonesAlways();
        for (const o of list) o.visible = on;
      }
    }
  }
  /** (a house is seen into through its windows, from the grounds and across its halls: nothing of it is hidden by room) */
  roomVisible(id: string | null | undefined): boolean { return !id || allZonesAlways() || this.visible.has(id); }
  /** one of the set's moving parts, by name (a zone's DYN_<name> node), once its zone is in */
  dyn(name: string): THREE.Object3D | null {
    for (const z of this.zones.values()) { if (z.state !== "ready") continue; const o = z.dyn.get(name); if (o) return o; }
    return null;
  }
  /** the survivors' flashlights, for the house's shells: place and aim in the world, level 0..1 (up to TORCH_N) */
  setTorches(list: { pos: THREE.Vector3; dir: THREE.Vector3; level: number }[], camera: THREE.Camera): void {
    const view = camera.matrixWorldInverse;
    for (let i = 0; i < TORCH_N; i++) {
      const t = list[i];
      TORCH_U.uTorchLevel.value[i] = t ? t.level * 1.1 : 0;
      if (!t) continue;
      TORCH_U.uTorchPos.value[i].copy(t.pos).applyMatrix4(view);
      TORCH_U.uTorchDir.value[i].copy(t.dir).transformDirection(view);
    }
  }
  /** LIGHTNING: the grounds' flat night light, lifted for a moment (a uniform: nothing compiles). 1 = as it stands. */
  flash(k: number): void {
    for (const z of this.zones.values()) if (z.state === "ready" && !z.lm[0]) for (const m of z.shellMats) m.lightMapIntensity = Math.PI * k;
  }

  private gone(z: Loaded): boolean {
    if (!this.disposed && z.state !== "gone") return false;
    this.free(z);
    return true;
  }

  private async lightmap(area: string, file: string, onProgress?: (f: number) => void): Promise<THREE.Texture | null> {
    const url = `/api/survivorz/asset/${area}/${file}`;
    // the bytes through the asset store (assetcache.ts: kept on this machine, a stalled download dropped)
    let buf: ArrayBuffer;
    try {
      buf = await cachedBytes(url, { headers: sessionHeaders(), onProgress, priority: 0 });
    } catch (e) {
      // a zone with no bake has no file (an honest "none"); anything else fails the zone, which is tried
      // again — a lightmap lost to a restart used to leave the zone unlit for the rest of the watch
      if (e instanceof FetchError && e.status === 404) return null;
      throw e;
    }
    try {
      // decoded in a worker (show/exr.worker.ts): on the page's own thread a zone's two EXRs were a
      // hitch of hundreds of ms each time the camera walked into a new zone. A worker that never answers
      // (the desktop app's WebView2, Nov 3 2026) gives up after EXR_WORKER_MS and the page decodes the
      // kept copy itself (the worker was handed the bytes, so they're read again from the store)
      const tex = await exrInWorker(buf).catch(async () => exrOnPage(await cachedBytes(url, { headers: sessionHeaders() })));
      // (room/lobby.ts loadLightmap: the glTF exporter flipped V, the bake didn't)
      tex.channel = 1;
      tex.flipY = false;
      tex.repeat.set(1, -1);
      tex.offset.set(0, 1);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    } catch {
      return null;
    }
  }

  /** room/lobby.ts dressRoom: the shell takes the bake; the fixtures are found and handed to the effects */
  private dressShell(z: Loaded, root: THREE.Object3D, L: Layout): void {
    const anis = this.renderer.capabilities.getMaxAnisotropy();
    const deadKit = L.kit?.dead ?? {};
    const kitStyles = L.kit?.styles ?? {};
    const layoutFix = L.fixtures;
    // (a set with no bake, the grounds at night: a flat dim light in the lightmap's place, so the fill and the
    // lamps that light the bodies never light the ground)
    const lightmap = z.lm[0] ?? (MAP_ID !== "bunker" ? nightMap() : null);
    const house = MAP_ID !== "bunker";
    const glowSeen = new Set<THREE.Material>();
    root.traverse((o) => {
      // the set's moving parts: found here, moved by the doors file (never culled, never merged)
      if (o.name.startsWith("DYN_")) z.dyn.set(o.name.slice(4), o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const shell = /^SHELL/.test(mesh.name) || /^SHELL/.test(mesh.parent?.name ?? "");
      if (house) for (const m of mats(mesh) as THREE.MeshPhysicalMaterial[]) {
        // (no environment map here: a fully metal surface draws black — the car, the gilt, the chrome, and the
        // shell's own lead, steel and iron. The kit's rule.)
        if ((m.metalness ?? 0) > 0.3) m.metalness = 0.3;
        // GLASS THAT ASKS FOR TRANSMISSION (a chandelier's, a lantern's, the car's lamps) makes three draw the whole
        // scene a second time into a half-float target every frame it is in view: 5.85 M triangles became 11.7 M.
        // It is plain see-through glass here.
        if ((m.transmission ?? 0) > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.depthWrite = false; m.forceSinglePass = true; }
      }
      if (house && !shell) for (const m of mats(mesh) as THREE.MeshStandardMaterial[]) {
        if (glowSeen.has(m) || !m.emissive || (m.emissiveIntensity ?? 0) <= 0 || (m.emissive.getHex() === 0 && !m.emissiveMap)) continue;
        glowSeen.add(m);
        if (!/flame|fire|ember|candle|coal/i.test(`${m.name} ${mesh.name}`)) z.glow.push({ m, base: m.emissiveIntensity });
        else if (/flame|fire/i.test(`${m.name} ${mesh.name}`)) { m.userData.base = m.emissiveIntensity; z.flames.push(m); }
      }
      // THE HEARTHS: the build's flames are one mesh for every fire in the zone (material "fireflame"): its points
      // are gathered into fires (a hearth is under 1.6 m across), the flat cards hidden, and real flames drawn
      if (house && !shell && (mats(mesh)[0] as THREE.Material | undefined)?.name === "fireflame") {
        const pos = mesh.geometry.getAttribute("position"), v = new THREE.Vector3();
        mesh.updateWorldMatrix(true, false);
        const step = Math.max(1, Math.floor(pos.count / 4000));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          let b = z.fireBoxes.find((bx) => Math.hypot((bx.min.x + bx.max.x) / 2 - v.x, (bx.min.z + bx.max.z) / 2 - v.z) < 1.6 && Math.abs(bx.min.y - v.y) < 2.5);
          if (!b) z.fireBoxes.push((b = new THREE.Box3(v.clone(), v.clone())));
          b.expandByPoint(v);
        }
        mesh.visible = false;
        mesh.userData.hidden = true;
      }
      for (const m of mats(mesh) as THREE.MeshStandardMaterial[]) {
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"] as const) if (m[k]) m[k]!.anisotropy = anis;
        if (shell && lightmap) {
          m.lightMap = lightmap;
          m.lightMapIntensity = Math.PI;
          m.envMapIntensity = 0;
          m.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader
              .replace("#include <lights_fragment_maps>", "irradiance = vec3(0.0);\n#include <lights_fragment_maps>")
              .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n\treflectedLight.directDiffuse = vec3(0.0);");
            if (!house) return;
            // (a house: the survivors' flashlights are the one real-time light its shells take)
            Object.assign(sh.uniforms, TORCH_U);
            sh.fragmentShader = sh.fragmentShader
              .replace("void main() {", `${TORCH_FRAG}\nvoid main() {`)
              .replace("reflectedLight.directDiffuse = vec3(0.0);", "reflectedLight.directDiffuse = houseTorch(normal) * diffuseColor.rgb;");
          };
          m.customProgramCacheKey = () => (house ? "house-shell" : "lobby-shell");
          z.shellMats.push(m);
        }
        // THE TRIM SITS ON THE WALL'S OWN PLANE (map polish, Oct 28 2026 — measured in the shells: every
        // skirting is exactly coplanar with the shadow-gap backing behind the wall panels, 12 cm of
        // flicker along the foot of every wall in five zones, ~130 m² of it; the egress stripe, the
        // steel frames and thresholds and the stair landings' plates do the same against their walls
        // and floors). A depth offset settles it in the trim's favour — render state, no recompile.
        if (shell) trimOffset(m);
      }
      if (/^GLASS_/.test(mesh.name)) {
        for (const m of mats(mesh)) { m.transparent = true; m.depthWrite = false; (m as THREE.MeshStandardMaterial).envMapIntensity = 0; }
        mesh.renderOrder = 3;
      }
      mesh.receiveShadow = false;
      mesh.castShadow = false;
    });
    if (z.fireBoxes.length) {
      // one mesh for the zone's fires: three crossed sheets a fire, standing on the fire's foot
      const P: number[] = [], U: number[] = [], S: number[] = [], I: number[] = [];
      z.fireBoxes.forEach((b, k) => {
        const c = b.getCenter(new THREE.Vector3()), w = Math.max(0.5, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 1.15), h = Math.max(0.45, (b.max.y - b.min.y) * 1.5);
        z.fires.push(new THREE.Vector3(c.x, b.min.y + h * 0.4, c.z));
        for (let s = 0; s < 3; s++) {
          const a = (s / 3) * Math.PI + k, dx = (Math.cos(a) * w) / 2, dz = (Math.sin(a) * w) / 2, o = P.length / 3;
          P.push(c.x - dx, b.min.y, c.z - dz, c.x + dx, b.min.y, c.z + dz, c.x + dx, b.min.y + h, c.z + dz, c.x - dx, b.min.y + h, c.z - dz);
          U.push(0, 0, 1, 0, 1, 1, 0, 1);
          for (let q = 0; q < 4; q++) S.push(k * 1.7 + s * 0.37);
          I.push(o, o + 1, o + 2, o, o + 2, o + 3);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      geo.setAttribute("seed", new THREE.Float32BufferAttribute(S, 1)); geo.setIndex(I);
      z.own.geo.add(geo);
      const fl = new THREE.Mesh(geo, flameMaterial());
      fl.name = "hearth-flames"; fl.renderOrder = 4; fl.frustumCulled = false;
      z.group.add(fl);
    }
    // THE MOVING PARTS STAND IN BAKED ROOMS WITH NO BAKE OF THEIR OWN (a stone in a lit floor, a crest on a lit
    // chimneypiece read as black holes): each is given its own colour as a glow at about the room's level, which
    // goes out with the house's lights like the lamps' glass. (Its own copies of the materials: nothing else dims.)
    if (house && z.lm[0]) for (const part of z.dyn.values()) part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = (mats(mesh) as THREE.MeshStandardMaterial[]).map((m) => {
        const c = m.clone();
        c.metalness = Math.min(c.metalness ?? 0, 0.15);
        c.emissive = c.color.clone(); c.emissiveMap = c.map; c.emissiveIntensity = 0.5;
        z.own.mat.add(c); z.glow.push({ m: c, base: 0.5 });
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    const roomOf = (p: THREE.Vector3) => roomAt(p.x, p.y, p.z)?.id ?? "";
    root.traverse((o) => {
      const m = /^FIXTURE_(k([ab])(\d+)|p(\d+)|s(\d+)|m(\d+))$/.exec(o.name);
      if (!m) return;
      let style: FlickerStyle | "dead" = "steady", room = "", bank = 0;
      let feed: ZFix["feed"] = "battery";
      const box = new THREE.Box3().setFromObject(o);
      const at = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y - 0.04, (box.min.z + box.max.z) / 2);
      let kind: FixtureKind = "panel", glow = 4.5, colour = 0xf0f6ff;
      if (m[5] || m[6]) {
        const f = m[5] ? (layoutFix[Number(m[5])] as { style?: FlickerStyle; room: string; bank?: number } | undefined) : undefined;
        style = f?.style ?? "steady"; room = f?.room ?? roomOf(at); bank = f?.bank ?? 0;
        feed = m[5] ? "battery" : "mains";
        kind = "slot"; glow = 1.6; colour = 0xe4efff;
      } else if (m[2]) {
        const i = Number(m[3]);
        if (deadKit[m[2]]?.includes(i)) style = "dead";
        else if (kitStyles[`${m[2]}${i}`]) style = kitStyles[`${m[2]}${i}`];
        room = roomOf(at); bank = i % 3;
      } else {
        const f = layoutFix[Number(m[4])] as { style?: FlickerStyle; room: string; circuit?: "battery" | "mains"; bank?: number } | undefined;
        style = f?.style ?? "steady"; room = f?.room ?? roomOf(at); bank = f?.bank ?? 0;
        if (f?.circuit === "mains") feed = "mains";
      }
      const fmats: THREE.MeshStandardMaterial[] = [];
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(colour);
        mat.emissiveIntensity = style === "dead" ? 0 : glow;
        mesh.material = mat;
        z.own.mat.add(mat);
        fmats.push(mat);
      });
      if (style === "dead") return;
      this.addFixture(z, { id: `${z.id}:${o.name}`, kind, at, room, zone: z.site, feed }, fmats, style, bank);
    });
    // the shell's own detail (the fixtures' housings, the glass) is culled with its room; the
    // walls, floors and ceilings themselves (SHELL_*) never are
    const detail: THREE.Object3D[] = [];
    root.traverse((o) => { if (/^(FIXTURE_|GLASS_)/.test(o.name) && !/^(FIXTURE_|GLASS_)/.test(o.parent?.name ?? "")) detail.push(o); });
    for (const o of detail) this.inRoom(z, null, o);
  }

  /** hand a fixture to the effects (they drive its glow: power, flicker, dips) and to the rig */
  private addFixture(z: Loaded, f: ZFix, emissive: THREE.MeshStandardMaterial[], style: FlickerStyle, bank: number): void {
    // the battery circuit never loses power, but it sags in a brownout: its own "zone" for dips
    const zone = f.feed === "battery" ? `${f.zone}:battery` : f.zone;
    this.fx.fixtures.add({ id: f.id, zone, bank, emissive, style, emergency: f.feed === "emergency", seed: hashStr(f.id) });
    z.fixtures.push(f);
  }

  /** room/lobby.ts placeDecals */
  private async placeDecals(z: Loaded, L: Layout): Promise<void> {
    type Decal = { tex: string; at: number[]; n: number[]; size: number[]; rot?: number; opaque?: boolean; paint?: boolean; repeat?: number[] };
    const decals = (L.decals ?? []) as Decal[];
    const Z = new THREE.Vector3(0, 0, 1);
    await Promise.all(decals.map(async (d, i) => {
      let p = this.decalTex.get(d.tex);
      if (!p) {
        const key = d.tex, mine: Promise<THREE.Texture | null> = loadTexture(assetUrl("roomdecal", `${d.tex}.webp`), { space: "srgb" }).catch(() => null);
        // (a failed load isn't kept: the zone's next visit asks again)
        void mine.then((t) => { if (!t && this.decalTex.get(key) === mine) this.decalTex.delete(key); });
        p = mine;
        this.decalTex.set(key, p);
      }
      let map = await p;
      if (!map) return;
      if (d.repeat) { map = map.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(d.repeat[0], d.repeat[1]); map.needsUpdate = true; z.own.tex.add(map); }
      const mat = d.paint
        ? new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
        : d.opaque
        ? new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
        : new THREE.MeshBasicMaterial({ map, transparent: true, premultipliedAlpha: true, depthWrite: false, blending: THREE.CustomBlending,
            blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, polygonOffset: true, polygonOffsetFactor: -2 - (i % 4), toneMapped: false });
      const geo = new THREE.PlaneGeometry(d.size[0], d.size[1]);
      z.own.geo.add(geo); z.own.mat.add(mat);
      const m = new THREE.Mesh(geo, mat);
      const n = new THREE.Vector3(d.n[0], d.n[1], d.n[2]).normalize();
      m.quaternion.setFromUnitVectors(Z, n);
      if (d.rot) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.degToRad(d.rot)));
      m.position.set(d.at[0], d.at[1], d.at[2]).addScaledVector(n, 0.003);
      m.renderOrder = 2;
      z.group.add(m);
      const into = m.position.clone().addScaledVector(n, 0.3);   // (a wall's decal belongs to the room it faces)
      this.inRoom(z, roomAt(into.x, into.y, into.z)?.id ?? null, m);
    }));
  }

  /** one packed prop, shared by every zone that places it (never freed with a zone) */
  prop(id: string): Promise<THREE.Object3D> {
    let p = this.propCache.get(id);
    if (!p) {
      p = loadGlb(assetUrl("prop", `${id}.glb`), undefined, 0).then((g) => {
        tameGlbTransparency(g.scene);
        // the power is out: no screen or LED on a prop glows (room/lobby.ts placeProps)
        g.scene.traverse((c) => {
          const m = c as THREE.Mesh;
          for (const mat of mats(m) as THREE.MeshStandardMaterial[]) {
            if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
            for (const t of texturesOf(mat)) releaseTexture(t);
          }
          // (shared by every zone, never raycast: the bounds are measured, the arrays let go)
          if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) releaseGeometry(m.geometry);
        });
        return g.scene;
      });
      this.propCache.set(id, p);
      // (a failed load isn't kept: a 502 during a deploy left the prop missing from every zone for
      // the rest of the session — the zone's next visit asks again)
      const mine = p;
      mine.catch(() => { if (this.propCache.get(id) === mine) this.propCache.delete(id); });
    }
    return p.then((s) => cloneSkinned(s));
  }

  /** room/lobby.ts placeProps, then every repeat of one mesh made a single InstancedMesh */
  private async placeProps(z: Loaded, L: Layout): Promise<void> {
    const stage = new THREE.Group();
    const props = L.props as Prop[];
    await Promise.all(props.map(async (p) => {
      const o = await this.prop(p.id).catch(() => null);
      if (!o) return;
      o.position.set(p.at[0], p.at[1], p.at[2]);
      if (p.rot) {
        const d = THREE.MathUtils.degToRad;
        o.rotation.set(d(p.rot[0]), d(p.rot[1]), d(p.rot[2]), "YXZ");
        o.updateMatrixWorld(true);
        o.position.y += p.at[1] - new THREE.Box3().setFromObject(o).min.y;
      } else o.rotation.y = THREE.MathUtils.degToRad(p.yaw ?? 0);
      o.userData.propId = p.id;
      o.userData.room = p.room;
      stage.add(o);
    }));
    // THE BLAST DOOR, in its frame where the layout says (room/lobby.ts does the same: [x, z, yaw])
    const va = (L as { vaultAt?: number[] }).vaultAt;
    if (va) {
      const door = await this.prop("vault-door").catch(() => null);
      if (door) { door.position.set(va[0], 0, va[1]); door.rotation.y = THREE.MathUtils.degToRad(va[2] ?? 0); door.userData.propId = "vault-door"; stage.add(door); }
    }
    // the caged fixtures and the wall pieces (emergency units, exit signs)
    type LF = { kind: string; at: number[]; yaw?: number; face?: number[]; room: string; style?: FlickerStyle; circuit?: "mains" | "battery"; bank?: number };
    await Promise.all((L.fixtures as LF[]).map(async (f, i) => {
      // a lamp that is in the zone's own file: nothing to place, only somewhere for the rig's light to stand.
      // On the house's electricity: out with the lights.
      if (f.kind === "lamp") {
        // (a lamp standing in a hearth is the fire's own light: it burns through a blackout, and it flickers)
        const at = new THREE.Vector3(f.at[0], f.at[1], f.at[2]);
        // (IN the fire: within a hearth's width of it and low. A wall lamp two metres off is a lamp.)
        const fire = z.fires.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 0.9 && Math.abs(p.y - at.y) < 1.2);
        this.addFixture(z, { id: `${z.id}:l${i}`, kind: "lamp", at, room: f.room, zone: z.site, feed: fire ? "battery" : "mains", fire }, [], "steady", i % 3);
        return;
      }
      if (f.kind === "caged") {
        const o = await this.prop("caged-light").catch(() => null);
        if (!o) return;
        o.position.set(f.at[0], f.at[1], f.at[2]);
        o.rotation.y = THREE.MathUtils.degToRad(f.yaw ?? 0);
        const fm: THREE.MeshStandardMaterial[] = [];
        o.traverse((c) => {
          const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mat.emissive = new THREE.Color(0xffe2b0); mat.emissiveIntensity = 3;
          mesh.material = mat; fm.push(mat); z.own.mat.add(mat);
        });
        o.userData.keep = true;
        o.userData.room = f.room;
        stage.add(o);
        this.addFixture(z, { id: `${z.id}:c${i}`, kind: "caged", at: new THREE.Vector3(f.at[0], f.at[1] - 0.05, f.at[2]), room: f.room, zone: z.site, feed: f.circuit === "mains" ? "mains" : "battery" }, fm, f.style ?? "steady", f.bank ?? 0);
        return;
      }
      if ((f.kind !== "emergency" && f.kind !== "exit") || !f.face) return;
      const w = WALL_PIECE[f.kind];
      const o = await this.prop(w.file).catch(() => null);
      if (!o) return;
      o.position.set(f.at[0] + f.face[0] * w.depth, f.at[1], f.at[2] + f.face[2] * w.depth);
      o.rotation.y = wallYaw(f.kind, f.face[0], f.face[2]);
      const fm: THREE.MeshStandardMaterial[] = [];
      const tint = new THREE.Color(f.kind === "exit" ? 0x3dff7a : 0xffd08a);
      o.traverse((c) => {
        const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const glows = !!src.emissiveMap || src.emissive.getHex() !== 0 || /lamp|light|lens|glass|bulb|led|sign|exit/i.test(src.name);
        if (!glows) return;
        const mat = src.clone();
        if (!mat.emissiveMap) mat.emissive = tint;
        mat.emissiveIntensity = f.kind === "exit" ? 2.2 : 3.0;
        mesh.material = mat; fm.push(mat); z.own.mat.add(mat);
      });
      o.userData.keep = true;
      o.userData.room = f.room;
      stage.add(o);
      const face = new THREE.Vector3(f.face[0], f.face[1], f.face[2]);
      const at = new THREE.Vector3(f.at[0], f.at[1] + w.lift, f.at[2]).addScaledVector(face, w.out);
      // the exit signs are on the battery; the twin-heads only light in a blackout
      this.addFixture(z, { id: `${z.id}:${f.kind === "exit" ? "x" : "e"}${i}`, kind: f.kind, at, face, room: f.room, zone: z.site, feed: f.kind === "exit" ? "battery" : "emergency" }, fm, f.style ?? "steady", f.bank ?? 0);
    }));
    // INSTANCING: the same geometry and material placed again and again becomes one draw
    stage.updateMatrixWorld(true);
    const groups = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; at: THREE.Matrix4[]; one: THREE.Mesh; room: string }>();
    const keepWhole: THREE.Object3D[] = [];
    for (const o of [...stage.children]) {
      // a skinned prop (the microscope's focus parts are bones) or a fixture with its own glowing
      // material copies stays whole
      let skinned = false;
      o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
      const door = o.userData.propId === "vault-door" || /^lab-door|^bulkhead-door/.test(o.userData.propId ?? "");
      if (door) z.doorProps.push(o);
      if (skinned || o.userData.keep || door) { keepWhole.push(o); continue; }
      const room = String(o.userData.room ?? "");
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        // (instanced within a ROOM, so a room's things are culled with it)
        const key = `${room}|${m.geometry.uuid}|${mats(m).map((x) => x.uuid).join(",")}`;
        let g = groups.get(key);
        if (!g) { g = { geo: m.geometry, mat: m.material, at: [], one: m, room }; groups.set(key, g); }
        g.at.push(m.matrixWorld.clone());
      });
    }
    for (const g of groups.values()) {
      // (props cast no real-time shadow: theirs are in the bake already — room-bakeprops.mjs — and
      // a second one on the catcher doubled it; only the bodies and the door leaves cast)
      if (g.at.length === 1) {
        const m = new THREE.Mesh(g.geo, g.mat);
        g.at[0].decompose(m.position, m.quaternion, m.scale);
        z.group.add(m);
        this.inRoom(z, g.room, m);
        continue;
      }
      const im = new THREE.InstancedMesh(g.geo, g.mat, g.at.length);
      g.at.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      z.group.add(im);
      this.inRoom(z, g.room, im);
    }
    for (const o of keepWhole) {
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = false; });
      z.group.add(o);
      // (a door prop is never culled: the doors file swings its leaf, and a doorway is between rooms)
      if (!z.doorProps.includes(o)) this.inRoom(z, o.userData.room as string | undefined, o);
    }
  }

  /** the shadow catchers under the bodies: one per floor of the zone (room/lobby.ts buildLights) */
  private catchers(z: Loaded): void {
    if (MAP_ID !== "bunker") {
      // a house: each room's own floor, to its outline, at its own height (the grounds are not flat: none there)
      const mat = new THREE.ShadowMaterial({ opacity: 0.45 });
      z.own.mat.add(mat);
      for (const r of ROOMS) {
        if (r.zone !== z.site || r.outdoor) continue;
        const sh = new THREE.Shape((r.poly ?? [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]).map(([x, zz]) => new THREE.Vector2(x, -zz)));
        const geo = new THREE.ShapeGeometry(sh);
        z.own.geo.add(geo);
        const c = new THREE.Mesh(geo, mat);
        c.rotation.x = -Math.PI / 2;
        c.position.y = r.fy + 0.006;
        c.receiveShadow = true;
        c.name = "catcher";
        z.group.add(c);
      }
      return;
    }
    for (const f of z.box.floors) {
      const rooms = ROOMS.filter((r) => r.zone === z.site && r.floor <= f && f < r.floor + (r.room.spans ?? 1));
      if (!rooms.length) continue;
      const x0 = Math.min(...rooms.map((r) => r.x0)), x1 = Math.max(...rooms.map((r) => r.x1));
      const z0 = Math.min(...rooms.map((r) => r.z0)), z1 = Math.max(...rooms.map((r) => r.z1));
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      const mat = new THREE.ShadowMaterial({ opacity: 0.45 });
      z.own.geo.add(geo); z.own.mat.add(mat);
      const c = new THREE.Mesh(geo, mat);
      c.rotation.x = -Math.PI / 2;
      c.position.set((x0 + x1) / 2, (FLOOR_Y[f] ?? 0) + 0.004, (z0 + z1) / 2);
      c.receiveShadow = true;
      c.name = "catcher";
      z.group.add(c);
    }
  }

  /** what effects land on and bounce off (fx.surfaces): each room's floor and four walls as flat
   *  stand-ins — the shell itself is half a million triangles and three has no BVH. A mark on a
   *  doorway's empty middle is the price of the draft. */
  private proxies(z: Loaded): void {
    const mat = new THREE.MeshBasicMaterial();
    z.own.mat.add(mat);
    for (const r of ROOMS) {
      if (r.zone !== z.site) continue;
      const house = MAP_ID !== "bunker";
      const y = house ? r.fy : FLOOR_Y[r.floor + (r.room.spans ?? 1) - 1] ?? 0, h = house ? ceilingOf(r.id) : (FLOOR_Y[r.floor] ?? 0) + 3.2 - y;
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const add = (geo: THREE.BufferGeometry, pos: V3, rotX: number, rotY: number) => {
        z.own.geo.add(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(...pos); m.rotation.set(rotX, rotY, 0);
        m.visible = false;   // never drawn; a raycast doesn't look at `visible`
        m.userData.room = r.id;
        m.updateMatrixWorld(true);
        z.group.add(m);
        z.surfaces.push(m);
        this.fx.surfaces.push(m);
      };
      add(new THREE.PlaneGeometry(w, d), [cx, y, cz], -Math.PI / 2, 0);
      if (house) {
        // a house's rooms are outlines: a wall along each edge, facing in (the grounds have none)
        if (r.outdoor) continue;
        const p = r.poly ?? [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
        for (let i = 0; i < p.length; i++) {
          const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 0.3) continue;
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          // the plane's face (+z, turned by yaw) looks at the room's middle
          let yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
          const nx = Math.sin(yaw), nz = Math.cos(yaw);
          if (nx * (cx - mx) + nz * (cz - mz) < 0) yaw += Math.PI;
          add(new THREE.PlaneGeometry(len, h), [mx, y + h / 2, mz], 0, yaw);
        }
        continue;
      }
      add(new THREE.PlaneGeometry(w, h), [cx, y + h / 2, r.z0], 0, 0);
      add(new THREE.PlaneGeometry(w, h), [cx, y + h / 2, r.z1], 0, Math.PI);
      add(new THREE.PlaneGeometry(d, h), [r.x0, y + h / 2, cz], 0, Math.PI / 2);
      add(new THREE.PlaneGeometry(d, h), [r.x1, y + h / 2, cz], 0, -Math.PI / 2);
    }
  }

  /** what the zones hold on the GPU, roughly (textures by size and format) */
  gpuMB(): number {
    let bytes = 0;
    const seen = new Set<THREE.Texture>();
    for (const z of this.zones.values()) for (const t of z.own.tex) if (!seen.has(t)) { seen.add(t); bytes += texBytes(t); }
    return Math.round(bytes / 1e5) / 10;
  }

  dispose(): void {
    this.disposed = true;
    stopExrWorker();
    for (const id of [...this.zones.keys()]) this.unload(id);
    void Promise.all([...this.propCache.values()].map((p) => p.then((s) => freeTree(s)).catch(() => {})));
    void Promise.all([...this.decalTex.values()].map((p) => p.then((t) => t?.dispose()).catch(() => {})));
    this.propCache.clear();
  }
}

// ---- the lightmaps' worker -------------------------------------------------------------------------
let exrWorker: Worker | null = null;
let exrJob = 0;
/** how long a lightmap may take in the worker before it's decoded on the page instead */
const EXR_WORKER_MS = 20_000;
const exrWaiting = new Map<number, { ok: (t: THREE.DataTexture) => void; fail: (e: Error) => void }>();

/** decode on the page's own thread (the worker's fallback) */
function exrOnPage(buf: ArrayBuffer): THREE.DataTexture {
  const p = new EXRLoader().parse(buf) as { data: Uint16Array | Float32Array; width: number; height: number; type: number; format: number };
  const t = new THREE.DataTexture(p.data, p.width, p.height, (p.format ?? THREE.RGBAFormat) as THREE.PixelFormat, (p.type ?? THREE.HalfFloatType) as THREE.TextureDataType);
  t.needsUpdate = true;
  return t;
}

function exrInWorker(buf: ArrayBuffer): Promise<THREE.DataTexture> {
  if (!exrWorker) {
    exrWorker = new Worker(new URL("./exr.worker.ts", import.meta.url), { type: "module" });
    exrWorker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; data?: Uint16Array; width?: number; height?: number; type?: number; format?: number; error?: string }>) => {
      const w = exrWaiting.get(e.data.id);
      if (!w) return;
      exrWaiting.delete(e.data.id);
      if (!e.data.ok || !e.data.data) { w.fail(new Error(e.data.error ?? "exr")); return; }
      const t = new THREE.DataTexture(e.data.data, e.data.width, e.data.height, (e.data.format ?? THREE.RGBAFormat) as THREE.PixelFormat, (e.data.type ?? THREE.HalfFloatType) as THREE.TextureDataType);
      t.needsUpdate = true;
      w.ok(t);
    };
    exrWorker.onerror = () => { for (const w of exrWaiting.values()) w.fail(new Error("exr worker")); exrWaiting.clear(); exrWorker?.terminate(); exrWorker = null; };
  }
  const id = ++exrJob;
  return new Promise((ok, fail) => {
    // a worker that never answers (it didn't start, or its decode hung) fails the job, and the caller decodes
    // on the page instead (Nov 3 2026: a zone sat on its light for good in Josh's desktop app)
    const timer = setTimeout(() => { if (exrWaiting.delete(id)) fail(new Error("exr worker timed out")); }, EXR_WORKER_MS);
    exrWaiting.set(id, { ok: (t) => { clearTimeout(timer); ok(t); }, fail: (e) => { clearTimeout(timer); fail(e); } });
    // (the bytes are HANDED over, not copied: tens of MB)
    exrWorker!.postMessage({ id, buf }, [buf]);
  });
}

/** the lightmaps' worker goes with the last show (FacilityZones.dispose) */
function stopExrWorker(): void {
  exrWorker?.terminate();
  exrWorker = null;
  for (const w of exrWaiting.values()) w.fail(new Error("stopped"));
  exrWaiting.clear();
}

const mats = (m: THREE.Mesh): THREE.Material[] => (!m?.material ? [] : Array.isArray(m.material) ? m.material : [m.material]);

function texturesOf(m: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) out.push(v);
  return out;
}

function freeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    for (const mat of mats(m)) { for (const t of texturesOf(mat)) t.dispose(); mat.dispose(); }
  });
}

function texBytes(t: THREE.Texture): number {
  const img = t.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0, h = img?.height ?? 0;
  const per = t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : (t as THREE.CompressedTexture).isCompressedTexture ? 1 : 4;
  return w * h * per * (t.generateMipmaps || (t as THREE.CompressedTexture).isCompressedTexture ? 1.33 : 1);
}

export { roomAt };
