// SOLACE SURVIVORZ — THE VAULT LOBBY LOOK TEST, the scene (docs/survivorz/ASSETS.md step C: "the
// picked kits make one finished room: real kit, baked lighting, dressing, grime, two survivors and a
// zombie in it, its sounds, on the Watch page. Josh judges it.").
//
// What's here, and where it came from:
//   the room       rooms/vault-lobby/vault-lobby.glb + lightmap.exr (scripts/survivorz/room-build.py)
//   what stands    vault-lobby.json: the packed props, the vault door, the fixtures, the cast
//   the light      BAKED on the shell (direct + bounced, Cycles); the shell's textures are multiplied
//                  by it. A FIXED set of real-time lights at the working fixtures lights the bodies
//                  and gives the shell only its specular sheen (the shell's material drops their
//                  diffuse, which the bake already has). Two of them cast the bodies' shadows onto a
//                  shadow-catcher floor. The light count never changes after load (the hall's rule).
//   the fixtures   the panels and cages glow; dead ones are dark; "failing"/"buzz" ones flicker by
//                  the effects' own pure function (fx/fixtures.ts flicker), so every screen agrees
//   the sound      the show's sound engine: the lobby's bed, each room's echo, the zombie's groans
import * as THREE from "three";
import { tameBody } from "../show/bodymat";
import { FlyCam } from "./flycam";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, initCompressed, loadGlb, loadTexture, sessionHeaders } from "../assets";
import { flicker, type FlickerStyle } from "../fx/fixtures";
import { SoundEngine, type Emitter } from "../audio/engine";
import BUNKER from "./bunker.json";

import { GLEN_ZONES } from "./glenridge";
type V3 = [number, number, number];
export interface Prop { id: string; at: number[]; yaw?: number; rot?: number[]; room: string }
/** "lamp": a light with no model of its own in the layout (Glenridge Hall: the lamp is in the zone's GLB) */
export type FixtureKind = "panel" | "caged" | "emergency" | "exit" | "slot" | "lamp";
/** circuit: "battery" (the emergency circuit, lit in the blackout) or "mains" (lit only with the power on) */
interface Fixture { id: string; kind: FixtureKind; at: THREE.Vector3; face?: THREE.Vector3; room: string; style: FlickerStyle | "dead"; mats: THREE.MeshStandardMaterial[]; glow: number; light: THREE.PointLight | THREE.SpotLight | null; seed: number; circuit?: "battery" | "mains" }

/** The real-time light budget: point lights at the working fixtures nearest the cast, and two
 *  shadow-casting spots. Fixed at load (CLAUDE.md, "the hall never compiles mid-game"). */
export const LIGHTS = { points: 10, shadowSpots: 2 };
/** Each fixture kind's real-time light, in candela at full power. */
export const LIGHT_LEVEL: Record<FixtureKind, number> = { panel: 26, caged: 22, emergency: 26, exit: 0, slot: 16, lamp: 9 };
/** A wall piece's native front (the emergency unit faces +x, the exit sign +z) and half its depth:
 *  the layout gives the point ON the wall, as room-build.py reads it. */
export const WALL_PIECE = { emergency: { file: "emergency-light", depth: 0.074, lift: 0.27, out: 0.12 }, exit: { file: "exit-sign", depth: 0.018, lift: 0.09, out: 0.03 } };
export const wallYaw = (kind: "emergency" | "exit", fx: number, fz: number) => (kind === "emergency" ? Math.atan2(-fz, fx) : Math.atan2(fx, fz));
/** THE TRIM SITS ON THE WALL'S OWN PLANE (map polish, Oct 28 2026 — measured in the shells: every skirting is
 *  exactly coplanar with the shadow-gap backing behind the wall panels, and the egress stripe, the steel frames
 *  and thresholds and the stair landings' plates do the same against their walls and floors). These shell
 *  materials take a depth offset so the trim always wins — render state only, no recompile. The look test
 *  and the show (show/zones.ts) both apply it. */
export const SHELL_TRIM = /^(plinth|egress|steel|steel-plate)$/;
export function trimOffset(m: THREE.Material): void { if (SHELL_TRIM.test(m.name)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; } }

/** A camera shot for the review: where it stands and what it looks at (each zone's layout lists its own). */
export type Shot = { at: V3; look: V3; label: string };

/** What a zone's layout file carries (room-build.py reads the same file). */
export interface Layout {
  props: Prop[]; fixtures: { kind: string; at: number[]; yaw?: number; face?: number[]; room: string; style?: FlickerStyle; circuit?: "battery" | "mains" }[];
  decals?: unknown[]; cast: { who?: string; kind?: string; at: number[]; yaw: number; clip: string }[];
  roomRects: Record<string, { x: number; z: number; w: number; h: number; zone: string }>;
  /** rooms as outlines [[x, z], ...], for a house whose rooms are not square to the grid (Glenridge Hall) */
  roomPolys?: Record<string, number[][]>;
  kit?: { dead?: Record<string, number[]>; styles?: Record<string, FlickerStyle> };
  shots: Record<string, Shot>; zombiePath?: number[][]; shadowSpots?: V3[]; catcher?: { at: number[]; size: number[] };
  /** where the vault door stands: [x, z, yaw degrees] (the bunker's faces north, inside; Halcyon's the default) */
  vaultAt?: number[];
}
/** THE SET: THE BUNKER (Civil Defence Shelter 14, docs/survivorz/BUNKER.md) is one baked set — its shell, lightmaps
 *  and layout (scripts/survivorz/bunker/layout.mjs). The show and the look test both read it from here. (The old
 *  show's eight Halcyon zones are archived with the tag halcyon-final.) */
export const ZONES = {
  bunker: { label: "The Bunker (Shelter 14)", area: "roombunker", layout: BUNKER as unknown as Layout },
  // GLENRIDGE HALL's four sets (./glenridge.ts): the show plays them too, since Nov 13 2026 (show/site.ts useMap)
  ...GLEN_ZONES,
} as const;
export type ZoneId = keyof typeof ZONES;
/** what the LOOK TEST can open: the show's set, and the next map's zones (./glenridge.ts) before the show can play them */
export const LOOK_ZONES = ZONES;
export type LookZoneId = keyof typeof LOOK_ZONES;

export const hashStr = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export interface LobbyStatus { phase: string; frac: number; error?: string }

export class Lobby {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 300);
  readonly controls: FlyCam;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private t = 0;
  fixtures: Fixture[] = [];
  private mixers: THREE.AnimationMixer[] = [];
  private zombie: { obj: THREE.Object3D; path: THREE.Vector3[]; leg: number; speed: number; groan: Emitter | null } | null = null;
  private door: THREE.Object3D | null = null;
  shellMats: THREE.MeshStandardMaterial[] = [];
  lightmap: THREE.Texture | null = null;
  /** the room baked with the power back on (room-build.py's "mains" state); null until it exists */
  lightmapMains: THREE.Texture | null = null;
  private mainsOn = false;
  private fill: THREE.HemisphereLight | null = null;
  private pool: THREE.SpotLight[] = [];   // the real-time lights, handed to the camera's room (assignLights)
  private litRoom: string | null = null;
  private raf = 0;
  private disposed = false;
  sound: SoundEngine | null = null;
  status: LobbyStatus = { phase: "starting", frac: 0 };
  onStatus: (s: LobbyStatus) => void = () => {};

  readonly L: Layout;
  private area: "room" | "roomres" | "roomlabs" | "roommed" | "roomsec" | "roompow" | "roomcon" | "roomdeep" | "roombunker" | "roomglenground" | "roomglenupper" | "roomglenbasement" | "roomglenoutside";
  constructor(private host: HTMLElement, readonly zone: LookZoneId = "bunker") {
    this.L = LOOK_ZONES[zone].layout;
    this.area = LOOK_ZONES[zone].area;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x020203);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.012);
    this.controls = new FlyCam(this.camera, this.renderer.domElement);
    // 4x MSAA on the composer's own targets: the passes render offscreen, where the canvas's antialias
    // does nothing, and a 60 mm light slot or a 10 mm panel gap broke into beads and crawl
    const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // glow on the true highlights only (a lit panel is several times white): a low threshold
    // bloomed the whole room into a haze (the baked floor near a panel reaches ~2.6)
    // (Josh, 2026-10-27: "still a little too much glow/bloom"): 0.3 / 0.2 / 3.5 hazed every lit ceiling;
    // this leaves a faint halo on the fixtures themselves and nothing on the room
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.06, 0.05, 4.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    initCompressed(this.renderer);
    this.shot(Object.keys(this.L.shots)[0]);
  }

  private say(phase: string, frac: number): void { this.status = { phase, frac }; this.onStatus(this.status); }

  fit(): void {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  shot(name: string): void {
    const s = this.L.shots[name]; if (!s) return;
    this.controls.place(s.at as THREE.Vector3Tuple, s.look as THREE.Vector3Tuple);
  }

  set exposure(v: number) { this.renderer.toneMappingExposure = v; }
  set bloomOn(v: boolean) { this.bloom.enabled = v; }
  /** THE POWER SWITCH: false = the blackout (the battery circuit), true = the mains back on. The room's
   *  baked light swaps whole; the fixtures follow (mains-only slots light, the twin-heads go dark, the
   *  battery slots stop failing and run steady); the props' fill rises with the room. */
  get mains(): boolean { return this.mainsOn; }
  set mains(on: boolean) {
    if (on && !this.lightmapMains) return;   // no mains bake yet
    this.mainsOn = on;
    const map = on ? this.lightmapMains : this.lightmap;
    for (const m of this.shellMats) m.lightMap = map;   // same channel and filtering: a swap, no recompile
    for (const f of this.fixtures) {
      const k = this.fixtureLevel(f, this.t);
      for (const m of f.mats) m.emissiveIntensity = f.glow * k;
      if (f.light) f.light.intensity = LIGHT_LEVEL[f.kind] * k * (on && f.kind !== "emergency" ? 1.3 : 1);
    }
    if (this.fill) this.fill.intensity = on ? 1.4 : 1.0;
    this.assignLights(true);   // the mains-only fixtures join the pool, the twin-heads leave it
  }
  /** a fixture's output, 0..1, in the current power state */
  private fixtureLevel(f: Fixture, t: number): number {
    if (this.mainsOn) {
      if (f.kind === "emergency") return 0;
      if (f.kind === "slot" || f.circuit === "mains") return 1;
    } else if (f.circuit === "mains") return 0;
    if (f.style === "dead") return 0;
    if (f.style === "steady") return 1;
    return flicker(f.style, t, f.seed);
  }
  /** The vault door's leaf: 0 shut .. 1 open (it swings out, into the chamber). */
  set doorOpen(v: number) { if (this.door) this.door.rotation.y = -THREE.MathUtils.degToRad(95) * v; }

  async load(): Promise<void> {
    this.say("the room", 0.05);
    const [room, lightmap, mains] = await Promise.all([loadGlb(assetUrl(this.area, `${this.zone}.glb`)), this.loadLightmap("lightmap.exr"), this.loadLightmap("lightmap-mains.exr")]);
    if (this.disposed) return;
    this.scene.add(room.scene);
    this.lightmap = lightmap;
    this.lightmapMains = mains;
    this.dressRoom(room.scene, lightmap);
    this.say("the grime", 0.3);
    await this.placeDecals();
    if (this.disposed) return;
    this.say("the props", 0.35);
    await this.placeProps();
    if (this.disposed) return;
    this.say("the lights", 0.6);
    this.buildLights();
    this.say("the cast", 0.7);
    await this.placeCast();
    if (this.disposed) return;
    this.say("warming up", 0.95);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.say("ready", 1);
    this.loop();
  }

  private async loadLightmap(file: string): Promise<THREE.Texture | null> {
    try {
      const loader = new EXRLoader().setRequestHeader(sessionHeaders());
      const tex = await loader.loadAsync(assetUrl(this.area, file));
      tex.channel = 1;
      tex.flipY = false;
      // the glTF exporter flips V (Blender's UVs start bottom-left, glTF's top-left) but the bake
      // image is still in Blender's orientation: flip it back here (measured: unflipped, the floor's
      // light lands in sharp-edged patches in the wrong places)
      tex.repeat.set(1, -1);
      tex.offset.set(0, 1);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    } catch {
      return null;   // no bake yet: the room still loads, lit by its real-time lights alone
    }
  }

  /** The shell takes the bake; the ceiling kit's fixtures are found and given their own materials. */
  private dressRoom(root: THREE.Object3D, lightmap: THREE.Texture | null): void {
    const anis = this.renderer.capabilities.getMaxAnisotropy();
    const deadKit = (this.L.kit as { dead?: Record<string, number[]> }).dead ?? {};
    const kitStyles = (this.L.kit as { styles?: Record<string, FlickerStyle> }).styles ?? {};
    const layoutFix = this.L.fixtures as { kind: string; style?: FlickerStyle; room: string }[];
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const shell = /^SHELL/.test(mesh.name) || /^SHELL/.test(mesh.parent?.name ?? "");
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      for (const m of mats) {
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"] as const) if (m[k]) m[k]!.anisotropy = anis;
        if (shell && lightmap) {
          m.lightMap = lightmap;
          m.lightMapIntensity = Math.PI;   // Cycles' diffuse bake is irradiance; three divides by pi in the Lambert term
          m.envMapIntensity = 0;
          // the real-time lights add only their specular here: their diffuse is in the bake already
          m.onBeforeCompile = (sh) => {
            // ...and none of the hemisphere fill either (it is for the props and bodies): left in, it lit
            // every wall and floor evenly on top of the bake and flattened the room's pools of light
            sh.fragmentShader = sh.fragmentShader
              .replace("#include <lights_fragment_maps>", "irradiance = vec3(0.0);\n#include <lights_fragment_maps>")
              .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n\treflectedLight.directDiffuse = vec3(0.0);");
          };
          m.customProgramCacheKey = () => "lobby-shell";
          this.shellMats.push(m);
        }
        if (shell) trimOffset(m);
      }
      if (/^GLASS_/.test(mesh.name)) {
        // the panes: see-through, never writing depth (so what's behind them still draws), drawn last
        for (const m of mats) { m.transparent = true; m.depthWrite = false; m.envMapIntensity = 0; }
        mesh.renderOrder = 3;
      }
      mesh.receiveShadow = false;
      mesh.castShadow = false;
    });
    // the fixtures: FIXTURE_ka<i>/kb<i> (the kit's hanging panels), FIXTURE_p<i> (the flush ones) and
    // FIXTURE_s<i> (the security hall's ceiling slots on the emergency circuit; <i> is the layout's index)
    root.traverse((o) => {
      const m = /^FIXTURE_(k([ab])(\d+)|p(\d+)|s(\d+)|m(\d+))$/.exec(o.name);
      if (!m) return;
      let style: FlickerStyle | "dead" = "steady", room = "reception";
      let circuit: "battery" | "mains" | undefined;
      if (m[5] || m[6]) {
        const f = m[5] ? layoutFix[Number(m[5])] : undefined;
        style = f?.style ?? "steady"; room = f?.room ?? room;
        const box = new THREE.Box3().setFromObject(o);
        const at = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y - 0.03, (box.min.z + box.max.z) / 2);
        if (!f) room = this.roomAt(at)?.id ?? room;   // a mains-only slot isn't in the layout: its room is where it hangs
        const mesh = o as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(0xe4efff);
        const circuit = m[5] ? "battery" : "mains";
        mat.emissiveIntensity = circuit === "battery" ? 1.6 : 0;   // the blackout: only the battery circuit glows
        mesh.material = mat;
        this.fixtures.push({ id: o.name, kind: "slot", at, room, style, mats: [mat], glow: 1.6, light: null, seed: hashStr(o.name), circuit });
        return;
      }
      if (m[2]) {
        const i = Number(m[3]);
        if (deadKit[m[2]]?.includes(i)) style = "dead";
        else if (kitStyles[`${m[2]}${i}`]) style = kitStyles[`${m[2]}${i}`];
      } else {
        const f = layoutFix[Number(m[4])] as { style?: FlickerStyle; room: string; circuit?: "battery" | "mains" } | undefined;
        style = f?.style ?? "steady"; room = f?.room ?? room; circuit = f?.circuit;
      }
      const box = new THREE.Box3().setFromObject(o);
      const at = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y - 0.05, (box.min.z + box.max.z) / 2);
      const mats: THREE.MeshStandardMaterial[] = [];
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(0xf0f6ff);
        mat.emissiveIntensity = style === "dead" ? 0 : 4.5;
        mesh.material = mat;
        mats.push(mat);
      });
      if (circuit === "mains") for (const mm of mats) mm.emissiveIntensity = 0;   // the blackout: mains-only panels are dark
      this.fixtures.push({ id: o.name, kind: "panel", at, room, style, mats, glow: 4.5, light: null, seed: hashStr(o.name), circuit });
    });
  }

  /** The grime layer (vault-lobby.json decals; textures by scripts/survivorz/room-decals.mjs).
   *  Stains MULTIPLY what's under them — dst x (1 - a + a x colour) — so a leak darkens a lit wall and
   *  a dark corner alike, never painting a flat brown that would glow in the dark. Signs and tape are
   *  stuck-on things: ordinary lit surfaces. Paint (stencils, floor markings) is lit and see-through. */
  private async placeDecals(): Promise<void> {
    type Decal = { tex: string; at: number[]; n: number[]; size: number[]; rot?: number; opaque?: boolean; paint?: boolean; repeat?: number[] };
    const decals = ((this.L as unknown as { decals?: Decal[] }).decals ?? []);
    const texCache = new Map<string, Promise<THREE.Texture>>();
    const tex = (name: string) => {
      let t = texCache.get(name);
      if (!t) { t = loadTexture(assetUrl("roomdecal", `${name}.webp`), { space: "srgb" }); texCache.set(name, t); }
      return t;
    };
    const Z = new THREE.Vector3(0, 0, 1);
    await Promise.all(decals.map(async (d, i) => {
      // a missing texture skips its decal; it must never hold the room's load (a 404'd plate once stalled a zone)
      let map = await tex(d.tex).catch(() => { console.warn(`[survivorz] decal ${d.tex} failed to load`); return null; });
      if (!map) return;
      if (d.repeat) { map = map.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(d.repeat[0], d.repeat[1]); map.needsUpdate = true; }
      // three kinds: stuck-on things (opaque plates, lit), PAINT (stencils and floor markings: lit, and
      // see-through where the paint is worn or absent), and stains (multiplied, below)
      const mat = d.paint
        ? new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
        : d.opaque
        ? new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
        : new THREE.MeshBasicMaterial({ map, transparent: true, premultipliedAlpha: true, depthWrite: false, blending: THREE.CustomBlending,
            blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, polygonOffset: true, polygonOffsetFactor: -2 - (i % 4), toneMapped: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.size[0], d.size[1]), mat);
      const n = new THREE.Vector3(d.n[0], d.n[1], d.n[2]).normalize();
      m.quaternion.setFromUnitVectors(Z, n);
      if (d.rot) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.degToRad(d.rot)));
      m.position.set(d.at[0], d.at[1], d.at[2]).addScaledVector(n, 0.003);
      m.renderOrder = 2;
      this.scene.add(m);
    }));
  }

  private glbCache = new Map<string, Promise<THREE.Object3D>>();
  private prop(id: string): Promise<THREE.Object3D> {
    let p = this.glbCache.get(id);
    if (!p) { p = loadGlb(assetUrl("prop", `${id}.glb`)).then((g) => g.scene); this.glbCache.set(id, p); }
    // skeleton-aware: a skinned prop (the lab microscope's focus parts are bones) cloned the plain way stays bound to
    // the original's bones, which sit at the world origin, and is drawn there instead of where it was put
    return p.then((s) => cloneSkinned(s));
  }

  private async placeProps(): Promise<void> {
    const props = this.L.props as Prop[];
    let done = 0;
    await Promise.all(props.map(async (p) => {
      const o = await this.prop(p.id);
      o.position.set(p.at[0], p.at[1], p.at[2]);
      if (p.rot) {
        // knocked over: tipped in its own frame, turned, then settled onto the floor it stands on
        const d = THREE.MathUtils.degToRad;
        o.rotation.set(d(p.rot[0]), d(p.rot[1]), d(p.rot[2]), "YXZ");
        o.updateMatrixWorld(true);
        o.position.y += p.at[1] - new THREE.Box3().setFromObject(o).min.y;
      } else o.rotation.y = THREE.MathUtils.degToRad(p.yaw ?? 0);
      // the power is out: no screen, LED or vending-machine panel glows (only the emergency units and
      // the exit signs, which are fixtures and run on their own batteries)
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
      });
      this.scene.add(o);
      this.say("the props", 0.35 + 0.25 * (++done / props.length));
    }));
    // the vault door, in its frame, at the wall the map cuts for it (Halcyon: z 8, its middle at x 60; a layout may say)
    const va = this.L.vaultAt ?? (this.L.roomRects["vault-chamber"] ? [60, 8, 0] : null);
    if (va) {
      const door = await this.prop("vault-door");
      door.position.set(va[0], 0, va[1]);
      door.rotation.y = THREE.MathUtils.degToRad(va[2] ?? 0);
      this.scene.add(door);
      this.door = door.getObjectByName("Vault_leaf") ?? null;
    }
    // the caged fixtures: the model hangs from its rods, its tube glows
    await Promise.all((this.L.fixtures as { kind: string; at: number[]; yaw?: number; room: string; style?: FlickerStyle; circuit?: "mains" | "battery" }[]).map(async (f, i) => {
      if (f.kind !== "caged") return;
      const o = await this.prop("caged-light");
      o.position.set(f.at[0], f.at[1], f.at[2]);
      o.rotation.y = THREE.MathUtils.degToRad(f.yaw ?? 0);
      const mats: THREE.MeshStandardMaterial[] = [];
      o.traverse((c) => {
        const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(0xffe2b0);
        mat.emissiveIntensity = 3;   // the tube only (it has an emissive map); the spot under it lights the room, not the cage
        mesh.material = mat; mats.push(mat);
      });
      this.scene.add(o);
      this.fixtures.push({ id: `FIXTURE_c${i}`, kind: "caged", at: new THREE.Vector3(f.at[0], f.at[1] - 0.05, f.at[2]), room: f.room, style: f.style ?? "steady", mats, glow: 3, light: null, seed: hashStr(`c${i}`), circuit: f.circuit });   // a plant room's high-bays are on the mains
    }));
    // lamps that are already in the zone's GLB: nothing to place, only somewhere for a real-time light to stand
    (this.L.fixtures as { kind: string; at: number[]; room: string }[]).forEach((f, i) => {
      if (f.kind !== "lamp") return;
      this.fixtures.push({ id: `FIXTURE_l${i}`, kind: "lamp", at: new THREE.Vector3(f.at[0], f.at[1], f.at[2]), room: f.room, style: "steady", mats: [], glow: 0, light: null, seed: hashStr(`l${i}`), circuit: "battery" });
    });
    // the wall pieces on emergency power: the twin-head units (warm) and the exit signs (green). Only
    // their own glowing parts are lit up; the housing stays a housing.
    type WallFix = { kind: string; at: number[]; face: number[]; room: string; style?: FlickerStyle };
    await Promise.all((this.L.fixtures as WallFix[]).map(async (f, i) => {
      if (f.kind !== "emergency" && f.kind !== "exit") return;
      const w = WALL_PIECE[f.kind];
      const o = await this.prop(w.file);
      o.position.set(f.at[0] + f.face[0] * w.depth, f.at[1], f.at[2] + f.face[2] * w.depth);
      o.rotation.y = wallYaw(f.kind, f.face[0], f.face[2]);
      const mats: THREE.MeshStandardMaterial[] = [];
      const tint = new THREE.Color(f.kind === "exit" ? 0x3dff7a : 0xffd08a);
      o.traverse((c) => {
        const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const glows = !!src.emissiveMap || src.emissive.getHex() !== 0 || /lamp|light|lens|glass|bulb|led|sign|exit/i.test(src.name);
        if (!glows) return;
        const mat = src.clone();
        if (!mat.emissiveMap) mat.emissive = tint;
        mesh.material = mat; mats.push(mat);
      });
      const glow = f.kind === "exit" ? 2.2 : 3.0;
      for (const m of mats) m.emissiveIntensity = glow;
      this.scene.add(o);
      const face = new THREE.Vector3(f.face[0], f.face[1], f.face[2]);
      const at = new THREE.Vector3(f.at[0], f.at[1] + w.lift, f.at[2]).addScaledVector(face, w.out);
      this.fixtures.push({ id: `FIXTURE_${f.kind === "exit" ? "x" : "e"}${i}`, kind: f.kind, at, face, room: f.room, style: f.style ?? "steady", mats, glow, light: null, seed: hashStr(`${f.kind}${i}`) });
    }));
  }

  /** The real-time set: a fixed pool of spots (a constant light count, so nothing recompiles) handed to
   *  the working fixtures of the room the camera stands in, two shadow spots. They cast no shadows, so a
   *  light given to a fixture in another room shone straight through the wall: the stores' lamps and the
   *  corridor's twin-heads washed the kitchen's and canteen's wall tops warm (2026-10-27). */
  private buildLights(): void {
    for (let i = 0; i < LIGHTS.points; i++) {
      const sp = new THREE.SpotLight(0xffffff, 0, 14, 1, 0.8, 2);
      this.scene.add(sp, sp.target);
      this.pool.push(sp);
    }
    this.assignLights(true);
    // two shadow spots, straight down over the counter and the chamber's doorway, and the catcher
    for (const at of (this.L.shadowSpots ?? []) as V3[]) {
      const s = new THREE.SpotLight(0xe8f0ff, 30, 12, THREE.MathUtils.degToRad(48), 0.6, 2);
      s.position.set(...at);
      s.target.position.set(at[0], 0, at[2]);
      s.castShadow = true;
      s.shadow.mapSize.set(2048, 2048);
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.02;
      s.shadow.camera.near = 0.5; s.shadow.camera.far = 10;
      this.scene.add(s, s.target);
    }
    // the catcher under the shadow spots (the zone's layout says where; a zone without spots has none)
    const cat = this.L.catcher ?? { at: [60, 20], size: [40, 30] };
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(cat.size[0], cat.size[1]), new THREE.ShadowMaterial({ opacity: 0.45 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(cat.at[0], 0.004, cat.at[1]);
    catcher.receiveShadow = true;
    this.scene.add(catcher);
    // the props and bodies have no lightmap: this fill stands in for the room's bounce light, measured
    // against the baked room (at 0.35 the desks read black on a lit floor)
    this.fill = new THREE.HemisphereLight(0xb8c2cc, 0x6a6660, 1.0);
    this.scene.add(this.fill);
  }

  private async placeCast(): Promise<void> {
    const cast = (this.L.cast ?? []) as { who?: string; kind?: string; at: number[]; yaw: number; clip: string }[];
    await Promise.all(cast.map(async (c) => {
      const file = c.kind === "zombie" ? "zombie-m03.glb" : `${c.who}.glb`;
      const g = await loadGlb(assetUrl("body", file));
      const body = cloneSkinned(g.scene);
      tameBody(body);
      body.position.set(c.at[0], c.at[1], c.at[2]);
      body.rotation.y = THREE.MathUtils.degToRad(c.yaw);
      body.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      this.scene.add(body);
      const mixer = new THREE.AnimationMixer(body);
      const want = c.kind === "zombie" ? ["hw-02-zombie-walk-02", "ual2-zombie-walk-fwd-loop", "mx-zombie-walk"] : [c.clip];
      const clip = want.map((n) => g.animations.find((a) => a.name === n)).find(Boolean) ?? g.animations[0];
      if (clip) mixer.clipAction(clip).play();
      mixer.update(Math.random() * 3);
      this.mixers.push(mixer);
      if (c.kind === "zombie") {
        // he shambles between the chamber's middle and the doorway, turning at each end
        this.zombie = { obj: body, path: (this.L.zombiePath ?? [[c.at[0], 0, c.at[2]], [c.at[0] + 2, 0, c.at[2] + 2]]).map((q) => new THREE.Vector3(q[0], q[1], q[2])), leg: 0, speed: 0.42, groan: null };
      }
    }));
  }

  /** Sound needs a click (the browser's rule): the lobby's bed, each room's echo, the zombie. */
  async startSound(): Promise<void> {
    if (this.sound) return;
    const e = await SoundEngine.create();
    if (this.disposed) { e.dispose(); return; }
    this.sound = e;
    await e.preload(["bed-fluorescent", "zombie-idle", "light-flicker"]);
    if (this.zombie) this.zombie.groan = await e.loop("zombie-idle", { at: this.zombie.obj.position.toArray() as V3, gain: 0.8 });
    const buzz = this.fixtures.find((f) => f.style === "failing");
    if (buzz) await e.loop("light-flicker", { at: buzz.at.toArray() as V3, gain: 0.35 });
  }

  private roomAt(p: THREE.Vector3): { id: string; zone: string } | null {
    for (const [id, poly] of Object.entries(this.L.roomPolys ?? {})) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return { id, zone: this.zone };
    }
    for (const [id, r] of Object.entries(this.L.roomRects as Record<string, { x: number; z: number; w: number; h: number; zone: string }>)) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.z >= r.z && p.z <= r.z + r.h) return { id, zone: r.zone };
    }
    return null;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.t += dt;
    this.controls.update(dt);
    for (const m of this.mixers) m.update(dt);
    // the zombie walks his loop
    const z = this.zombie;
    if (z) {
      const to = z.path[(z.leg + 1) % z.path.length];
      const d = to.clone().sub(z.obj.position); d.y = 0;
      const len = d.length();
      if (len < 0.15) z.leg = (z.leg + 1) % z.path.length;
      else {
        const want = Math.atan2(d.x, d.z);
        let diff = want - z.obj.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        z.obj.rotation.y += diff * Math.min(1, dt * 1.6);
        if (Math.abs(diff) < 0.6) z.obj.position.addScaledVector(d.normalize(), z.speed * dt);
      }
      z.groan?.setPosition(z.obj.position.toArray() as V3);
    }
    // the fixtures: a pure function of time and seed
    for (const f of this.fixtures) {
      if (f.style === "dead" || f.style === "steady") continue;
      if (this.mainsOn && (f.kind === "slot" || f.kind === "emergency")) continue;   // held by the switch
      const k = this.fixtureLevel(f, this.t);
      for (const m of f.mats) m.emissiveIntensity = f.glow * k;
      if (f.light) f.light.intensity = LIGHT_LEVEL[f.kind] * k * (this.mainsOn ? 1.3 : 1);
    }
    // the real-time lights follow the camera from room to room
    this.assignLights();
    // the ear follows the camera
    if (this.sound) {
      const p = this.camera.position, dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      const r = this.roomAt(p);
      this.sound.setListener([p.x, p.y, p.z], Math.atan2(dir.x, -dir.z), r?.id ?? null, r?.zone ?? null);
    }
    this.composer.render(dt);
  };

  /** hand the pool to the room the camera is in: its working fixtures, nearest first */
  private assignLights(force = false): void {
    const r = this.roomAt(this.camera.position);
    if (!r || (!force && r.id === this.litRoom)) return;
    this.litRoom = r.id;
    const p = this.camera.position;
    const live = this.fixtures.filter((f) => f.room === r.id && f.style !== "dead" && f.kind !== "exit" && (this.mainsOn ? f.kind !== "emergency" : f.circuit !== "mains"))
      .sort((a, b) => a.at.distanceTo(p) - b.at.distanceTo(p));
    for (const f of this.fixtures) f.light = null;
    this.pool.forEach((sp, i) => {
      const f = live[i];
      if (!f) { sp.intensity = 0; return; }
      sp.position.copy(f.at);
      if (f.kind === "emergency") {
        // the twin heads: out from the wall and 40 degrees down, as the bake aims them
        sp.color.set(0xffc98a); sp.distance = 16; sp.angle = THREE.MathUtils.degToRad(40); sp.penumbra = 0.55;
        const aim = f.face!.clone().multiplyScalar(Math.cos(0.698)).add(new THREE.Vector3(0, -Math.sin(0.698), 0));
        sp.target.position.copy(f.at).addScaledVector(aim, 4);
      } else if (f.kind === "lamp") {
        // a shaded lamp, a chandelier, a fire: warm, all round below it, and short (it must not reach the next room)
        sp.color.set(0xffb070); sp.distance = 8; sp.angle = THREE.MathUtils.degToRad(88); sp.penumbra = 1;
        sp.target.position.set(f.at.x, f.at.y - 3, f.at.z);
      } else {
        // a panel or a slot throws its light down (a point light under one lit its own housing into haze);
        // a caged tube shines all round, so its spot opens nearly to the horizon
        const caged = f.kind === "caged";
        sp.color.set(caged ? 0xffd9a0 : 0xe8f0ff); sp.distance = caged ? 12 : 14;
        sp.angle = THREE.MathUtils.degToRad(caged ? 85 : 68); sp.penumbra = caged ? 0.9 : 0.8;
        sp.target.position.set(f.at.x, 0, f.at.z);
      }
      f.light = sp;
      sp.intensity = LIGHT_LEVEL[f.kind] * this.fixtureLevel(f, this.t) * (this.mainsOn && f.kind !== "emergency" ? 1.3 : 1);
    });
  }

  stats(): { draws: number; tris: number; lights: number } {
    let lights = 0; this.scene.traverse((o) => { if ((o as THREE.Light).isLight) lights++; });
    return { draws: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, lights };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.sound?.dispose();
    this.controls.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
