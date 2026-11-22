// SOLACE SURVIVORZ — THE SHOW SCENE: the whole facility, the cast, the effects and the sound,
// drawn from the server's frames (src/survivorz/sim/wire.ts) and nothing else.
//
//   const s = new ShowScene(host);
//   await s.load();
//   feed.onFrame = (f) => s.apply(f);     // the live socket (survivorz/live.ts) or the mock feed
//
// ONE DOOR IN: `apply(frame)`. Whatever produces frames — the simulation over /ws-survivorz, the
// mock in show/mockfeed.ts, a recording played back — the scene can't tell them apart.
//
// The floor's rules hold here (CLAUDE.md, "THE FLOOR STAYS SMOOTH" / "THE HALL NEVER COMPILES"):
//   · the LIGHT COUNT is fixed at build (show/rig.ts + the effects' own six); a zone arriving
//     compiles its programs off-thread before it's shown, and the effects warm theirs at load;
//   · nothing reactive is written from the frame loop (the panel reads `stats()` / `vitals()` on
//     its own slow timer);
//   · disposing frees the context (forceContextLoss), and every async load checks `disposed`.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { assetUrl, initCompressed, disposeCompressed, prefetchAsset } from "../assets";
import { holdLate } from "../assetcache";
import { castFiles } from "./preload";
import { sfxContext } from "../../lib/sfx";
import { reportNote } from "../../lib/errorreport";
import { FxSystem, ShowFx } from "../fx";
import { SoundEngine } from "../audio/engine";
import { vocalStandIn } from "../audio/cues";
import { VOX_CAST } from "./overlay";
import { roomSurface, setHouse, STEP_LEVEL, STEP_SOUND } from "../audio/rules";
import type { Emitter } from "../audio/engine";
import type { BodyState, DirectorWire, ServerFrame, ScreenFrame, SurvivorVitals } from "../../../../src/survivorz/sim/wire";
import { ZONES } from "../room/lobby";
import { Actors, type Actor } from "./actors";
import { handleEvent } from "./bridge";
import { runChanged, runOf } from "./director";
import { Pairs } from "./pairs";
import { BAND, TALK, hash2, talkKind } from "./stance";
import { ShowCamera } from "./camera";
import { ShowDoors } from "./doors";
import { showFxLoader } from "./fxload";
import { LightRig } from "./rig";
import { BAKED_OF, MAP_ID, ROOMS, coversOf, roomAt, roomUnder, underTheSky, wallsBetween, zonesInPlay, type SiteZone, type V3 } from "./site";
import { Storm } from "./storm";
import { FacilityZones, prefetchZone } from "./zones";

/** how far behind the newest tick the bodies are drawn (a tick and a half at 10 Hz) */
const INTERP_MS = 150;
/** a body further than this from the camera isn't drawn or animated */
const DRAW_FAR = 70;

export interface ShowStatus { phase: string; frac: number; error?: string }

/** HOW THE PICTURE IS RENDERED. `maxFps` caps the frame loop (a 144 Hz monitor drew 144 frames a
 *  second for a stream that takes 60, double the GPU for nothing); `pixelRatio` is canvas pixels
 *  per CSS pixel. The admin's tab keeps a sharp picture on a scaled display; THE STREAM pins both
 *  (STREAM_RENDER): exactly the canvas's CSS size at 1:1 (a 1920x1080 page renders 1920x1080, not
 *  2400x1350 through the 4x MSAA composer and down again), at 60 fps. */
export interface RenderSettings { maxFps: number; pixelRatio: number }
export const STREAM_RENDER: RenderSettings = { maxFps: 60, pixelRatio: 1 };
export const defaultRender = (): RenderSettings => ({ maxFps: 60, pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
/** a lost WebGL context reloads the page after this long (ms) */
export const RELOAD_AFTER_LOST_MS = 3_000;
/** an unattended sound start that failed is tried again after this (doubling, ms) */
const SOUND_RETRY_MS = 15_000;
export interface ShowStats {
  fps: number; frameMs: number; draws: number; tris: number; lights: number; programs: number; geometries: number; textures: number;
  heapMB: number | null; zones: string[]; zoneGpuMB: number; bodies: number; drawn: number; fx: ReturnType<FxSystem["stats"]>; frames: number;
}

/** the most the ear sits from the shot's subject, metres */
const EAR_M = 2.5;
/** footsteps from another room are heard only this near the ear */
const STEP_NEAR_M = 6;

export class ShowScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 260);
  readonly cam: ShowCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  fx!: FxSystem;
  show!: ShowFx;
  zones!: FacilityZones;
  rig!: LightRig;
  actors!: Actors;
  pairs!: Pairs;
  doors!: ShowDoors;
  sound: SoundEngine | null = null;
  /** the weather, where the map has any (Glenridge Hall's storm) */
  storm: Storm | null = null;
  /** THE MAP CHANGED UNDER THE SCENE (a snapshot names another one than the scene was built for): everything here
   *  is the old map's — its zones, doors, rooms — so the page throws the scene away and builds one for the new map
   *  (Show.svelte). The frame is not applied. */
  onMapChange: ((map: string) => void) | null = null;
  /** the map this scene was built for (show/site.ts useMap, before the scene is made) */
  readonly map = MAP_ID;
  status: ShowStatus = { phase: "starting", frac: 0 };
  onStatus: (s: ShowStatus) => void = () => {};
  /** WHAT THE LOAD DID, AND WHEN (Nov 13 2026, the review's H5: 21 s to a picture with every file already on
   *  this machine, and nothing said which step it was): each stage, each step of the first zone and each
   *  survivor dressed, in ms since the scene was made. The Shift+D box prints it; the review's load timer
   *  reads it (window.__szLoad). Nothing is added once the picture is up. */
  loadLog: [number, string][] = [];
  private born = performance.now();
  private mark(what: string): void { if (this.status.phase !== "ready" && this.loadLog.length < 80) this.loadLog.push([Math.round(performance.now() - this.born), what]); }
  day = 1;
  director: DirectorWire | null = null;
  power: Record<string, boolean> = {};
  private ready = false;
  private queue: ScreenFrame[] = [];
  private offset = 0;
  /** where the clock is being steered to (clock_); `offset` slews toward it in the frame loop */
  private offsetWant = 0;
  private haveClock = false;
  private disposed = false;
  private raf = 0;
  private clock = new THREE.Timer();
  private frameN = 0;
  private fpsAcc = { n: 0, t: 0, fps: 0, ms: 0 };
  private nextListen = 0;
  private nextMusic = 0;
  private lastFight = -1e9;
  private framesIn = 0;
  private lightCount = 0;
  private shake = new THREE.Vector3();
  /** THE DIRECTOR (show/direct.ts) hooks in here: every frame that comes in, and a beat before the
   *  camera moves each frame */
  onFrameIn: ((f: ScreenFrame) => void) | null = null;
  beforeCamera: ((dt: number) => void) | null = null;
  /** after the frame is drawn, with the camera where it was drawn from (the names over heads, show/tags.ts) */
  afterFrame: (() => void) | null = null;
  /** zones held by prepare() (a count each, so overlapping prepares don't drop each other's pin) */
  private pins = new Map<string, number>();
  /** events seen, by name (the panel's readout, and the checks) */
  readonly evCounts: Record<string, number> = {};
  /** survivors who died, turned or collapsed turning this run: nothing more of theirs is said or heard */
  private silenced = new Set<string>();
  /** the run the frames belong to (the snapshot's `run`): a different one is a fresh world */
  private run: string | null = null;
  /** the render cap and resolution (setRender) */
  private renderCfg: RenderSettings;
  private nextFrameAt = 0;
  /** the GPU dropped the context (a driver reset): the picture is gone and the page reloads */
  contextLost = false;
  /** what a lost context does (default: report it and reload the page after RELOAD_AFTER_LOST_MS).
   *  The scene has already stopped drawing and set its status to failed by the time this runs. */
  onContextLost: () => void = () => {
    reportNote("[survivorz] WebGL context lost, reloading the show", `${location.pathname}${location.hash}`);
    // (kept, so that leaving the page inside those seconds does not reload the whole app: dispose clears it)
    this.lostTimer = setTimeout(() => location.reload(), RELOAD_AFTER_LOST_MS);
  };
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private soundRetry: ReturnType<typeof setTimeout> | null = null;

  constructor(private host: HTMLElement, opts: { render?: RenderSettings } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderCfg = opts.render ?? defaultRender();
    this.renderer.setPixelRatio(this.renderCfg.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // (three r185: the soft one is deprecated to this anyway)
    // the frame's whole cost (the shadow maps, every pass of the composer) in one count: reset by the loop
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);
    // A LOST CONTEXT NEVER COMES BACK HERE (release.ts drops the CPU copies of every texture and
    // geometry once uploaded, so three's own restore has nothing to re-upload): the page reloads.
    this.renderer.domElement.addEventListener("webglcontextlost", this.lost, false);
    const house = MAP_ID !== "bunker";
    // the sound's own rules for the map in play: a house's floors, how its rooms ring, its rain (audio/rules.ts)
    setHouse(house ? ROOMS.map((r) => ({ id: r.id, outdoor: !!r.outdoor, surface: r.room.surface, below: r.fy < -1 })) : null);
    // (a house at night in the rain: the dark is blue, and the far trees go into it)
    this.scene.background = new THREE.Color(house ? 0x04060b : 0x020203);
    this.scene.fog = new THREE.FogExp2(house ? 0x05070d : 0x050505, house ? 0.016 : 0.012);
    this.cam = new ShowCamera(this.camera, this.renderer.domElement);
    // (room/lobby.ts: 4x MSAA on the composer's own targets, bloom on the true highlights only)
    const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.06, 0.05, 4.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // EVERY COMPILE IS FOR THE COMPOSER'S TARGET: the scene is drawn into a linear half-float target
    // (the bloom's input), and a program built for the canvas is a different program — compiled
    // ahead for the wrong one, a zone's programs were built again on the frame it first showed: a
    // 4-second freeze (measured). The effects and the bodies compile through this too.
    const r = this.renderer, compileAsync = r.compileAsync.bind(r);
    r.compileAsync = (obj, cam, target) => {
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.composer.readBuffer);
      try { return compileAsync(obj, cam, target); } finally { r.setRenderTarget(prev); }
    };
    initCompressed(this.renderer);
    // the GLBs' meshopt streams decode in workers (the shared decoder: three asks for its async
    // path, which uses them) — a zone's shell and a body's 30 MB of animation were main-thread hitches
    try { if (localStorage.getItem("sz_meshopt_workers") === "1") MeshoptDecoder.useWorkers?.(2); } catch { /* storage blocked: the default */ }
    // the opening look: the map's own (the house is first seen from its front, out in the rain)
    const shots = house ? ZONES["glen-outside"].layout.shots : ZONES[zonesInPlay()[0]].layout.shots;
    const first = (shots as Record<string, { at: number[]; look: number[] }>).front ?? Object.values(shots)[0];
    this.cam.look(first.look as V3, first.at as V3);
  }

  private say(phase: string, frac: number): void { this.mark(phase); this.status = { phase, frac }; this.onStatus(this.status); }

  /** Change the render cap / resolution (the stream mode calls this with STREAM_RENDER). */
  setRender(cfg: RenderSettings): void {
    this.renderCfg = { maxFps: Math.max(1, cfg.maxFps), pixelRatio: Math.max(0.25, cfg.pixelRatio) };
    this.renderer.setPixelRatio(this.renderCfg.pixelRatio);
    this.composer.setPixelRatio(this.renderCfg.pixelRatio);
    this.nextFrameAt = 0;
    this.fit();
  }
  get render(): RenderSettings { return { ...this.renderCfg }; }

  private lost = (e: Event): void => {
    e.preventDefault();
    if (this.disposed || this.contextLost) return;
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    // nothing keeps a dead canvas looking alive: the canvas is hidden and the status is a failure
    // (Show.svelte drops the overlay on anything but "ready"), so no watchdog reads it as a picture
    this.renderer.domElement.style.visibility = "hidden";
    this.status = { phase: "failed", frac: 0, error: "The picture was lost. Reloading..." };
    this.onStatus(this.status);
    try { this.onContextLost(); } catch { /* the reload must not be the bug */ }
  };

  fit(): void {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async load(): Promise<void> {
    (globalThis as { __szLoad?: [number, string][] }).__szLoad = this.loadLog;
    // (the dead are unpacked once the picture is up: assetcache.ts holdLate)
    holdLate(true);
    // THE BIG FILES START NOW (Nov 3 2026): the first zone's shell and lightmaps download into the asset store
    // while the effects load, and the cast's bodies as soon as the snapshot names them (apply below) — the
    // effects' few MB used to come first and the ~1 GB after, one stage at a time
    prefetchZone(this.cam.focus.toArray() as V3);
    this.say("the effects", 0.05);
    this.fx = new FxSystem({ scene: this.scene, camera: this.camera, renderer: this.renderer, load: showFxLoader(this.renderer) });
    await this.fx.load();
    if (this.disposed) return;
    this.say("blood, wood and glass", 0.25);
    await Promise.all([this.fx.loadBlood(), this.fx.loadBreaking(), this.fx.loadHoles(), this.fx.loadScorch(), this.fx.loadGore()]);
    if (this.disposed) return;
    this.show = new ShowFx(this.fx, 0);
    this.rig = new LightRig(this.scene);
    if (MAP_ID !== "bunker") this.storm = new Storm(this.scene, Storm.roofMask(ROOMS, coversOf()));
    this.zones = new FacilityZones(this.scene, this.renderer, this.camera, this.fx);
    this.zones.onChange = () => { if (!this.disposed) { this.doors.rebuild(this.zones); this.syncFires(); } };
    this.zones.onStage = (id, stage) => this.mark(`${id}: ${stage}`);
    this.fx.roomOf = (o) => (o.userData.room as string) ?? roomAt(o.position.x, o.position.y, o.position.z)?.id ?? "";
    this.fx.roomAt = (p) => roomAt(p.x, p.y, p.z)?.id ?? "";
    this.say("the cast's grips", 0.4);
    this.actors = new Actors(this.scene, this.fx);
    await this.actors.init();
    if (this.disposed) return;
    this.actors.onStep = (a, pace) => this.step(a, pace);
    // a body reaching the floor: the thud, where it lands
    this.actors.onThud = (a) => { if (this.sound && a.pos.distanceTo(this.ear) < 22) this.sound.cue("body.fall", {}, [a.pos.x, a.pos.y + 0.2, a.pos.z]); };
    this.actors.onReady = (a) => this.bodyReady(a);
    this.pairs = new Pairs(this.actors);
    // the work's own sounds, at the hands: the roll and the tape, a bottle drunk from
    this.actors.onPose = (a, _from, to) => {
      if (!this.sound || a.kind !== "survivor" || a.pos.distanceTo(this.ear) > 18) return;
      const at: [number, number, number] = [a.pos.x, a.pos.y + 1.1, a.pos.z];
      if (to === "bandage") this.sound.cue("bandage", {}, at);
      else if (to === "drink") this.sound.cue("drink", {}, at);
    };
    this.actors.compile = (o) => this.renderer.compileAsync(o, this.camera, this.scene);
    this.doors = new ShowDoors(this.scene, this.show);
    this.say("warming up", 0.6);
    await this.fx.warm();
    await this.renderer.compileAsync(this.doors.warmScrap(), this.camera, this.scene);
    if (this.disposed) return;
    this.scene.traverse((o) => { if ((o as THREE.Light).isLight) this.lightCount++; });
    this.say("the first zone", 0.75);
    this.ready = true;
    for (const f of this.queue.splice(0)) this.apply(f);
    this.loop();
    // the zone the camera starts in, before the curtain goes up
    this.zones.want(this.cam.focus.toArray() as V3);
    const t0 = performance.now();
    while (!this.disposed && this.zones.ready().length === 0 && performance.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 200));
    // ...and the cast dressed: a body's first appearance builds its look (its skin map, a zombie's
    // cut measure) and compiles — seconds of hitches that belong behind the curtain, not on air
    // ONLY THE SURVIVORS hold the curtain (REALISM.md → Loading: the picture fast, things brought in as they
    // arrive; a body shows nothing until it's ready) — the dead are many and big, and come in on air
    this.say("the cast", 0.9);
    while (!this.disposed && performance.now() - t0 < 60_000 && [...this.actors.list.values()].some((a) => a.kind === "survivor" && !a.ready)) await new Promise((r) => setTimeout(r, 200));
    this.say("ready", 1);
    holdLate(false);
  }

  // ---- the one door in ----

  apply(f: ScreenFrame): void {
    if (this.disposed) return;
    // another map than this scene was built for: the page builds a new scene (nothing of this frame is this map's)
    if (f.type === "snap" && (f.map ?? "bunker") !== this.map) { this.onMapChange?.(f.map ?? "bunker"); return; }
    if (!this.ready) { this.hold(f); return; }
    this.framesIn++;
    this.onFrameIn?.(f);
    if ("t" in f && typeof f.t === "number") this.clock_(f.t, f.type === "snap");
    switch (f.type) {
      case "snap": {
        // A NEW RUN: the ids collide (`s:<who>`, `z:0`...), so the old run is cleared, not merged into
        const run = runOf(f);
        if (runChanged(this.run, run)) this.newRun();
        if (run) this.run = run;
        this.day = f.day;
        this.director = f.director;
        this.show.sync(f.t);
        // a reset: everybody not in it is gone (and no hold or turn carries over)
        this.pairs.clear();
        this.turningOut.clear();
        const keep = new Set(f.bodies.map((b) => b.id));
        for (const id of [...this.actors.list.keys()]) if (!keep.has(id)) this.dropBody(id);
        for (const b of f.bodies) this.spawnBody(b);
        for (const d of f.doors) this.doors.setState(d);
        this.doors.setProps(f.goals?.props, true);
        this.power = {};
        for (const [key, on] of Object.entries(f.power)) {
          for (const z of this.powerZones(key)) {
            this.power[z] = on;
            this.show.power(z, on);
            this.zones.setPower(z, on, null);
          }
        }
        break;
      }
      case "tick":
        if (f.director) this.director = f.director;
        if (f.goals?.props) this.doors.setProps(f.goals.props);
        for (const b of f.b) {
          this.actors.tick(b, f.t);
          if (b.vitals) { const a = this.actors.get(b.id); if (a) this.actors.vitalsLook(a); }
        }
        break;
      case "spawn": this.spawnBody(f.body); break;
      case "gone": {
        // THE TURN: the survivor lying there stays drawn until the thing they became is dressed and on the
        // floor in their place (it's dressed from the same body file; a few hundred ms) — never a blank
        const a = this.actors.get(f.id);
        if (a?.kind === "survivor" && a.who && (a.state.vitals?.job === "turning" || a.state.vitals?.sick === 5)) { this.turningOut.set(a.who, { id: f.id, until: performance.now() + 8000 }); break; }
        this.dropBody(f.id);
        break;
      }
      case "ev": {
        this.evCounts[f.event] = (this.evCounts[f.event] ?? 0) + 1;
        if (f.event === "zone.powered" && typeof f.zone === "string") this.power[f.zone] = f.on !== false;
        // (a house's lights go and come back as one: Glenridge Hall's power.cut / power.on)
        if (f.event === "power.cut" || f.event === "power.on") for (const z of zonesInPlay()) this.power[z] = f.event === "power.on";
        // THE DEAD SAY NOTHING: from a death, a turn or the collapse before one, their voice stops mid-word
        // and a line of theirs that still arrives is dropped (the server drops them too; this is the belt)
        if (typeof f.victim === "string" && (f.event === "survivor.dead" || f.event === "survivor.turned" || (f.event === "survivor.dying" && f.turning))) {
          this.silenced.add(f.victim);
          this.sound?.stopVoice(f.victim);
        }
        handleEvent({ fx: this.fx, show: this.show, actors: this.actors, doors: this.doors, zones: this.zones, sound: () => this.sound, gone: () => this.disposed, fighting: () => { this.lastFight = performance.now(); }, pairs: this.pairs }, f);
        break;
      }
      case "say": {
        const sp = this.actors.get(f.by);
        if (this.silenced.has(f.by) || sp?.dead || sp?.state.vitals?.job === "turning") break;
        // a voiced line (voices.ts): from where the speaker stands, following them while it plays
        if (f.audio && this.sound) {
          const a = this.actors.get(f.by);
          if (a) void this.sound.voice(f.audio, [a.pos.x, a.pos.y + 1.6, a.pos.z], () => { const b = this.actors.get(f.by); return b ? [b.pos.x, b.pos.y + 1.6, b.pos.z] : null; }, f.by);
        }
        this.gesture(f.by, f.text, f.ms);
        break;
      }
      case "offair": break;
    }
  }

  /** the zones a power key in a snapshot speaks for: its own, or (a house with one supply) every zone in play */
  private powerZones(key: string): SiteZone[] {
    const all = zonesInPlay();
    if (all.includes(key as SiteZone)) return [key as SiteZone];
    return MAP_ID !== "bunker" && key !== "bunker" ? all : [];
  }

  /** A FRAME THAT ARRIVES WHILE THE SCENE LOADS (the watch socket opens with the page, Show.svelte): kept for
   *  when it's ready. A snapshot is a whole reset, so it replaces whatever was held, and its bodies start
   *  downloading at once (show/preload.ts). The moments of the load (`ev`, `say`) are let go — a minute of
   *  blood and gunfire played at once when the curtain went up would be wrong, and the watch page asks for
   *  a fresh snapshot once the scene is up, which brings back anything an event changed (a door, the power). */
  private hold(f: ScreenFrame): void {
    if (f.type === "snap") {
      this.queue = [f];
      const survivors = new Set(f.bodies.filter((b) => b.kind === "survivor").map((b) => b.body));
      for (const file of castFiles(f.bodies)) prefetchAsset(assetUrl("body", `${file}.glb`), survivors.has(file) ? 1 : 2);
    } else if (f.type === "tick" || f.type === "gone") this.queue.push(f);
    else if (f.type === "spawn") { this.queue.push(f); prefetchAsset(assetUrl("body", `${f.body.body}.glb`), f.body.kind === "survivor" ? 1 : 2); }
  }

  /** everything run-scoped: every body (and with them their wounds and looks, their torches), and
   *  every mark, limb, gore and wreckage the effects kept (the rooms' fixtures stay) */
  private newRun(): void {
    for (const id of [...this.actors.list.keys()]) this.dropBody(id);
    this.fx.clearRun();
    this.lastFight = -1e9;
    this.silenced.clear();
  }

  /** the show clock: what server time it is now, smoothed (a frame that arrives late doesn't
   *  pull the clock back; a jump of over a second is a new clock) */
  private clock_(t: number, hard: boolean): void {
    const est = t - performance.now();
    if (!this.haveClock || hard || Math.abs(est - this.offset) > 1000) { this.offset = this.offsetWant = est; this.haveClock = true; return; }
    this.offsetWant = est > this.offsetWant ? this.offsetWant + (est - this.offsetWant) * 0.1 : this.offsetWant + (est - this.offsetWant) * 0.02;
  }
  /** THE CLOCK NEVER JUMPS (realism round 6, Nov 2026): each tick's estimate used to move the clock at once —
   *  a few ms of network jitter landing in one frame every 100 ms, so every body sped up and slowed down ten
   *  times a second and planted feet skated (measured: a walker at 1.1 m/s lurching to 1.7 for a frame). It is
   *  steered now, never faster than 3% of real time either way. */
  private slewClock(dtMs: number): void {
    const d = this.offsetWant - this.offset, max = 0.03 * dtMs;
    this.offset += Math.max(-max, Math.min(max, d));
  }
  serverNow(): number { return performance.now() + this.offset; }

  private spawnBody(b: BodyState): void {
    // a survivor who turned: not drawn (the thing they became is its own body); the director keeps the card
    if (b.kind === "survivor" && (b.turned || b.escaped)) { this.dropBody(b.id); return; }
    const a = this.actors.spawn(b);
    if (a.ready) this.bodyReady(a);
  }

  private dropBody(id: string): void {
    this.fx.torches.remove(id);
    this.actors.gone(id);
  }

  /** THE TURN's hand-over: survivors lying there until the one they became is on the floor */
  private turningOut = new Map<string, { id: string; until: number }>();

  /** TALK (Oct 31 2026): a line said standing about is said with the body — a shrug on a question, a
   *  shout, an argument, a laugh, a nod — not the same talking loop for every line. Picked off the words
   *  (stance.ts talkKind), for the length of the line, and only where the body is free (standing still,
   *  not in a fight or a hold); the gesture ends the moment the wire's pose moves on. */
  private gesture(id: string, text: string, ms?: number): void {
    const a = this.actors.get(id);
    if (!a || a.kind !== "survivor" || a.dead || !a.ready || a.speed > BAND.still || a.anchor || a.link) return;
    if (a.state.pose !== "idle" && a.state.pose !== "talk") return;
    if (a.state.alert && a.state.pose === "idle") return;   // (weapon up, on guard: they talk without waving it about)
    const list = TALK[talkKind(text)].filter((c) => a.canPlay(c));
    if (!list.length) return;
    const clip = list[hash2(a.seed, text.length) % list.length];
    const dur = Math.max(1800, Math.min(9000, ms ?? text.length * 65));
    a.setForced(clip, dur, false, a.state.pose);
  }

  /** a body got its model: its torch (fx/torches draws the beam and lens; the rig lends the light) */
  private bodyReady(a: Actor): void {
    // the one who turned is on the floor in their place: the body they were goes now
    if (a.kind === "zombie" && a.state.turned) {
      const t = this.turningOut.get(a.state.turned);
      if (t) { this.turningOut.delete(a.state.turned); this.dropBody(t.id); }
    }
    if (a.kind !== "survivor") return;
    this.mark(`cast: ${a.id}`);
    this.fx.torches.add({ id: a.id, lens: () => (a.state.torch && a.root.visible ? a.lens : null), on: true, charge: 1, length: 11, angle: 0.3 });
    this.actors.vitalsLook(a);
  }

  /** a footstep: the floor's surface by the room, at the foot — a rung on a ladder; and the dead's own
   *  (Oct 31 2026): a heavier, duller, dragging step, quieter and nearer only (a crowd isn't a drum line) */
  private step(a: Actor, pace: "walk" | "run" | "sneak"): void {
    if (!this.sound) return;
    const d = a.pos.distanceTo(this.ear);
    if (a.link === "ladder") { if (d < 18) this.sound.cue("ladder", {}, [a.pos.x, a.pos.y + 0.5, a.pos.z]); return; }
    // THE ROOM'S OWN FEET (Nov 12 2026 — Josh: "it sounded cluttered and didn't make any sense"): every body within
    // 24 m was heard, through walls, so a shot of two people talking carried the feet of four others and a dozen of
    // the dead in other rooms. Feet are heard from the room the ear is in, and from anybody within STEP_NEAR_M.
    const room = roomAt(a.pos.x, a.pos.y + 0.5, a.pos.z)?.id ?? null;
    if (room !== this.earRoom && d > STEP_NEAR_M) return;
    if (a.kind === "zombie") {
      if (d > 14 || a.state.zkind === "crawler") return;
      const run = a.speed > 1.6;
      void this.sound.play(STEP_SOUND[roomSurface(room)], { at: [a.pos.x, a.pos.y + 0.05, a.pos.z], gain: (run ? 0.6 : 0.42) * STEP_LEVEL, rate: run ? 0.9 : 0.78, lowpassHz: run ? 3200 : 2200 });
      return;
    }
    if (d > 24) return;
    this.sound.step(roomSurface(room), pace, [a.pos.x, a.pos.y + 0.05, a.pos.z]);
  }

  /** THE FIRES ARE HEARD (a house's hearths: the flames' places are the zones'): one loop a fire, where it burns.
   *  Called when the sound starts and whenever a zone arrives or goes. */
  private fireLoops = new Map<string, Emitter | null>();
  private syncFires(): void {
    const e = this.sound;
    if (!e || MAP_ID === "bunker" || !this.zones || !e.has("fire-crackle")) return;
    const want = new Map<string, THREE.Vector3>(this.zones.fires().slice(0, 10).map((p) => [`${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`, p]));
    for (const [k, em] of this.fireLoops) if (!want.has(k)) { em?.stop(0.5); this.fireLoops.delete(k); }
    for (const [k, p] of want) {
      if (this.fireLoops.has(k)) continue;
      this.fireLoops.set(k, null);
      void e.loop("fire-crackle", { at: [p.x, p.y, p.z], gain: 0.5 }).then((em) => {
        if (this.disposed || this.sound !== e || !this.fireLoops.has(k)) { em?.stop(0); return; }
        this.fireLoops.set(k, em);
      });
    }
  }

  /** THE FACILITY TALKS TO ITSELF (Oct 31 2026): water dripping where there's plumbing, pipes ticking and
   *  groaning where the plant is, the tunnels' far rumble in the Deep — one-shots off to the side of the
   *  ear, a few times a minute. (Halcyon's PA announcements are gone: the bunker has no PA — Josh, Nov 2026:
   *  "there should be no PA system".) */
  private nextAmbient = 0;
  private ambience(now: number, zone: string | null): void {
    const sound = this.sound;
    if (!sound || !zone) return;
    if (now >= this.nextAmbient) {
      this.nextAmbient = now + 4000 + Math.random() * 7000;
      const table: [string, number][] = (({
        lobby: [["drip", 0.25], ["pipe-creak", 0.15]], residential: [["drip", 0.5], ["pipe-creak", 0.2]],
        labs: [["drip", 0.25], ["pipe-creak", 0.3]], medical: [["drip", 0.45], ["pipe-creak", 0.2]],
        security: [["pipe-creak", 0.3], ["drip", 0.15]], power: [["pipe-creak", 0.6], ["drip", 0.3], ["rumble-distant", 0.15]],
        containment: [["drip", 0.45], ["pipe-creak", 0.4], ["rumble-distant", 0.1]], deep: [["rumble-distant", 0.45], ["drip", 0.5], ["pipe-creak", 0.35]],
        // THE BUNKER (one set, zone "bunker"): it had no row, so the shelter never dripped or ticked at all
        bunker: [["drip", 0.35], ["pipe-creak", 0.3], ["rumble-distant", 0.08]],
        // GLENRIDGE HALL: its cellars drip and tick; above them an old timber house settles in the storm
        "glen-basement": [["drip", 0.4], ["pipe-creak", 0.3]],
        "glen-ground": [["house-creak", 0.4]], "glen-upper": [["house-creak", 0.55]],
      }) as Record<string, [string, number][]>)[zone] ?? [];
      for (const [id, p] of table) {
        if (Math.random() > p) continue;
        const ang = Math.random() * Math.PI * 2, r = id === "rumble-distant" ? 14 : 4 + Math.random() * 6;
        void sound.play(id, { at: [this.ear.x + Math.sin(ang) * r, this.ear.y + (id === "drip" ? 0.6 : 1.2), this.ear.z + Math.cos(ang) * r], gain: id === "rumble-distant" ? 0.55 : 0.45, rate: 0.92 + Math.random() * 0.16 });
        break;
      }
    }
  }

  // ---- the sound (a click starts it: the browser's rule) ----

  /** START SOUND WITH NOBODY TO CLICK: the stream page calls this at load. Edge is launched with
   *  `--autoplay-policy=no-user-gesture-required`, so the shared context resumes without a gesture;
   *  anywhere else (an ordinary browser) it stays suspended and this resolves false, leaving the
   *  "Turn sound on" button to do it. A failed start (the sound index 5xx during a deploy) is tried
   *  again by itself, backing off, until it works or the scene goes. Resolves true once sound is on. */
  async startSoundUnattended(retryMs = SOUND_RETRY_MS): Promise<boolean> {
    if (this.sound) return true;
    if (this.disposed) return false;
    const ctx = sfxContext();
    if (!ctx) return false;
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    if (ctx.state !== "running") return false;
    try {
      await this.startSound();
      return !!this.sound;
    } catch (e) {
      console.warn("[survivorz] sound failed to start, trying again", e);
      if (this.soundRetry) clearTimeout(this.soundRetry);
      this.soundRetry = setTimeout(() => { this.soundRetry = null; void this.startSoundUnattended(Math.min(300_000, retryMs * 2)); }, retryMs);
      return false;
    }
  }

  async startSound(): Promise<void> {
    if (this.sound) return;
    // (the button and the unattended start may both ask: one engine, never two)
    if (this.soundStarting) return this.soundStarting;
    this.soundStarting = this.startSoundNow().finally(() => { this.soundStarting = null; });
    return this.soundStarting;
  }
  private soundStarting: Promise<void> | null = null;
  private async startSoundNow(): Promise<void> {
    const e = await SoundEngine.create();
    if (this.disposed || this.sound) { e.dispose(); return; }
    this.sound = e;
    // (a character with no scream, pain or cough recordings of their own borrows a cast member's)
    e.vocalStandIn = (who, kind) => vocalStandIn(who, kind, VOX_CAST, (id) => e.has(id));
    e.paSystem = false;
    e.setOcclusion((a, b) => wallsBetween(a, b));
    if (MAP_ID !== "bunker") {
      // THE STORM, RECORDED: the rain is the room tone (audio/rules.ts bedOf); each stroke's thunder is played here,
      // nearer and sharper out of doors, a dull roll from inside, and a far stroke well under a near one. (Said
      // BEFORE the files load, so the storm's stand-in noise never plays over the recording while they do.)
      if (this.storm) {
        this.storm.audible = true;
        if (e.has("thunder") && e.has("rain-out")) this.storm.recorded = (delayS, level) => {
          const r = roomUnder(this.ear.x, this.ear.y, this.ear.z), out = !r || !!r.outdoor;
          const far = level < 0.62 && e.has("thunder-far");
          void e.play(far ? "thunder-far" : "thunder", { gain: (0.55 + level * 0.45) * (out ? 1 : 0.6) * (far ? 0.45 : 1) * (r && r.fy < -1 ? 0.5 : 1), delayMs: delayS * 1000, lowpassHz: out ? null : 1400, rate: 0.94 + Math.random() * 0.1 });
        };
      }
      await e.preload(["step-wood", "step-stone", "step-gravel", "step-carpet", "step-vinyl", "door-wood-open", "door-wood-close", "door-wood-pound", "thunder", "thunder-far", "rain-out", "rain-in"]);
      if (this.disposed) return;
      this.syncFires();
    }
    await e.preload(["step-concrete", "step-vinyl", "step-grating", "gun-pistol-shot", "gun-rifle-shot", "gun-shotgun-shot", "melee-swing-light", "melee-hit-flesh", "zombie-idle", "zombie-attack", "zombie-death", "light-flicker", "spark"]);
    if (this.disposed) return;
    void e.score.start();
  }

  // ---- the frame ----

  /** THE DRAW FAILING, SAID (Nov 3 2026 — Josh's desktop app drew the overlay over a black picture and
   *  nothing said why): the first error a frame throws, for the page to show and report. The loop goes on. */
  onFrameError: (message: string, stack?: string) => void = () => {};
  private frameErrors = 0;
  private loop = (): void => {
    if (this.disposed || this.contextLost) return;
    this.raf = requestAnimationFrame(this.loop);
    try { this.frame(); } catch (e) {
      if (this.frameErrors++ === 0) { console.error("[survivorz] a frame failed", e); this.onFrameError(String((e as Error)?.message ?? e), (e as Error)?.stack); }
    }
  };
  private frame(): void {
    const t0 = performance.now();
    // THE FRAME CAP: a frame only once its slot has come (a little early is fine: the display's own
    // beats jitter; falling behind re-anchors rather than racing to catch up)
    const slot = 1000 / this.renderCfg.maxFps;
    if (t0 < this.nextFrameAt - 2) return;
    this.nextFrameAt = t0 - this.nextFrameAt > slot ? t0 + slot : this.nextFrameAt + slot;
    this.clock.update();
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.1, rawDt);
    this.renderer.info.reset();
    this.slewClock(rawDt * 1000);
    const renderT = this.serverNow() - INTERP_MS;
    this.beforeCamera?.(Math.min(1, rawDt));
    const followed = this.cam.follow ? this.actors.get(this.cam.follow) : undefined;
    // the camera eases on REAL elapsed time (capped at 1 s): at a low frame rate a capped dt let the
    // follow fall metres behind its subject and lose it off the frame
    this.cam.update(Math.min(1, rawDt), followed);
    const focus = this.cam.focus;
    if (this.frameN++ % 12 === 0) this.zones.want(focus.toArray() as V3);
    if (this.frameN % 4 === 0) this.zones.cull(this.camera.position, focus);
    this.zones.update(this.fx.now);
    const camPos = this.camera.position;
    this.pairs.update();
    for (const [who, tr] of this.turningOut) if (t0 >= tr.until) { this.turningOut.delete(who); this.dropBody(tr.id); }
    this.actors.update(dt, renderT, camPos, (a) => this.near(a));
    this.doors.update(dt);
    // the torches nearest the camera get the rig's three lights
    this.torchLights();
    this.rig.assign(focus, this.zones, t0 / 1000);
    this.rig.update(this.fx, this.zones);
    if (this.storm) {
      const cr = roomUnder(camPos.x, camPos.y, camPos.z);
      // (the stroke lifts the bodies and the furniture fully out of doors, a little through the windows of a room
      // above ground, and not at all in the cellars — the baked walls there don't flash, and nor may a sofa)
      const seen = underTheSky(cr) ? 1 : cr!.fy < -1 ? 0 : 0.3;
      const k = this.storm.update(dt, t0 / 1000, camPos, underTheSky(cr), (ground, fill) => { this.zones.flash(ground); this.rig.flash(1 + (fill - 1) * seen); });
      // the sky and the rain-haze go with the stroke (two colours: nothing compiles)
      (this.scene.background as THREE.Color).setRGB(0.016 + k * 0.2, 0.024 + k * 0.24, 0.043 + k * 0.34, THREE.SRGBColorSpace);
      (this.scene.fog as THREE.FogExp2).color.setRGB(0.02 + k * 0.16, 0.027 + k * 0.19, 0.05 + k * 0.27, THREE.SRGBColorSpace);
    }
    this.fx.update(dt);
    // the ear, at 12 Hz (CLAUDE.md: audio automation on change, never per frame)
    if (this.sound && t0 >= this.nextListen) {
      this.nextListen = t0 + 1000 / 12;
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      // THE SURVIVORS WEAR MICS (the casino show's rule): the ear is at most EAR_M from the shot's
      // subject, on the camera's side of it — a wide shot from across a room (or from a security
      // camera behind a wall) heard their footsteps and swings faint and muffled, under a score at
      // full level (Josh, Oct 28 2026: "I can't hear anything they are doing"). Panning still
      // follows the camera's facing.
      // (THE OFFSET IS ITS OWN VECTOR — Nov 2026, "no gun sounds, no zombie sounds": it used to BE this.ear
      // (copy() returns itself), so `ear.copy(focus).add(off)` added the ear to itself and put it at twice the
      // focus — far outside the bunker, out of range of every footstep, blow, groan and door. Only the mic'd
      // voices and the unplaced score still carried.)
      const off = this.earOff.copy(camPos).sub(focus);
      const len = off.length();
      if (len > EAR_M) off.multiplyScalar(EAR_M / len);
      this.ear.copy(focus).add(off);
      const r = roomAt(focus.x, focus.y, focus.z) ?? roomAt(camPos.x, camPos.y, camPos.z);
      this.sound.setListener([this.ear.x, this.ear.y, this.ear.z], Math.atan2(dir.x, -dir.z), r?.id ?? null, r?.zone ?? null);
      this.earRoom = r?.id ?? null;
    }
    if (this.sound && t0 >= this.nextMusic) {
      this.nextMusic = t0 + 1000;
      const r = roomAt(focus.x, focus.y, focus.z);
      const tension = this.director?.tension ?? {};
      const subject = this.cam.follow ? this.actors.get(this.cam.follow)?.who : undefined;
      const threat = (subject ? tension[subject] ?? 0 : Math.max(0, ...Object.values(tension))) / 100;
      const hour = new Date(this.serverNow()).getHours();
      this.sound.score.update({ threat, fighting: t0 - this.lastFight < 6000, zone: r?.zone ?? null, room: r?.id ?? null, night: hour < 6 });
      this.ambience(t0, r?.zone ?? null);
    }
    // the effects' shake, for this frame only
    this.fx.shakeOffset(camPos, this.shake);
    camPos.add(this.shake);
    this.composer.render(dt);
    camPos.sub(this.shake);
    this.afterFrame?.();
    const a = this.fpsAcc;
    a.n++; a.t += dt; a.ms += performance.now() - t0;
    if (a.t >= 1) { a.fps = a.n / a.t; a.ms = a.ms / a.n; this.lastMs = a.ms; a.n = 0; a.t = 0; a.ms = 0; }
  }
  private lastMs = 0;
  /** where the sound is heard from (see the ear, in the frame loop) */
  private ear = new THREE.Vector3();
  /** the room the ear is in (footsteps are the room's own, and whoever is right beside it) */
  private earRoom: string | null = null;
  private earOff = new THREE.Vector3();

  private near(a: Actor): boolean {
    if (a.pos.distanceToSquared(this.camera.position) > DRAW_FAR * DRAW_FAR) return false;
    const r = roomAt(a.pos.x, a.pos.y + 0.5, a.pos.z);
    // (a body in a room the camera can't see into isn't drawn: the room culling's rule)
    return r ? this.zones.isReady(r.zone) && this.zones.roomVisible(r.id) : false;
  }

  private torchLights(): void {
    const cam = this.camera.position;
    const lit = [...this.actors.list.values()].filter((a) => a.kind === "survivor" && a.state.torch && a.lens && a.root.visible)
      .sort((x, y) => x.pos.distanceToSquared(cam) - y.pos.distanceToSquared(cam));
    for (let i = 0; i < this.rig.torches.length; i++) {
      const a = lit[i];
      this.rig.torch(i, a?.lens?.pos ?? null, a?.lens?.dir ?? null, a ? this.fx.torches.level(a.id) : 0);
    }
    // (a house's walls take the same three beams: show/zones.ts setTorches)
    if (MAP_ID !== "bunker") {
      this.camera.updateMatrixWorld();
      this.zones.setTorches(lit.slice(0, this.rig.torches.length).filter((a) => a.lens).map((a) => ({ pos: a.lens!.pos, dir: a.lens!.dir, level: this.fx.torches.level(a.id) })), this.camera);
    }
  }

  // ---- for the panel (read on its own timer, never from the frame loop) ----

  stats(): ShowStats {
    const info = this.renderer.info;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    let drawn = 0;
    if (this.actors) for (const a of this.actors.list.values()) if (a.root.visible && a.body) drawn++;
    return {
      fps: Math.round(this.fpsAcc.fps * 10) / 10, frameMs: Math.round(this.lastMs * 100) / 100, draws: info.render.calls, tris: info.render.triangles,
      lights: this.lightCount, programs: info.programs?.length ?? 0, geometries: info.memory.geometries, textures: info.memory.textures,
      heapMB: heap ? Math.round(heap.usedJSHeapSize / 1e6) : null, zones: this.zones?.ready() ?? [], zoneGpuMB: this.zones?.gpuMB() ?? 0,
      bodies: this.actors?.list.size ?? 0, drawn, fx: this.fx?.stats() ?? ({} as ReturnType<FxSystem["stats"]>), frames: this.framesIn,
    };
  }

  /** the bodies, for the panel's follow list */
  cast(): { id: string; label: string; kind: string }[] {
    if (!this.actors) return [];
    return [...this.actors.list.values()].map((a) => ({ id: a.id, label: a.who ? `${a.who} (${a.state.body})` : `${a.state.zkind ?? "zombie"} ${a.id}`, kind: a.kind }))
      .sort((x, y) => (x.kind === y.kind ? x.label.localeCompare(y.label) : x.kind === "survivor" ? -1 : 1));
  }

  vitals(id: string): { hp: number; hpMax: number; pose: string; room: string | null; why?: string; held?: string | null; v?: SurvivorVitals; clip: string; speed: number } | null {
    const a = this.actors?.get(id);
    if (!a) return null;
    return { hp: a.state.hp, hpMax: a.state.hpMax, pose: a.state.pose, room: a.state.room, why: a.state.why, held: a.state.held, v: a.state.vitals, clip: a.baseName, speed: Math.round(a.speed * 100) / 100 };
  }

  /** GET A PLACE READY BEFORE CUTTING TO IT: the zones round a point are loaded (and kept while it
   *  matters) and this resolves once they're drawn. A hard cut to a body in a zone that isn't
   *  loaded shows a void for the seconds the zone takes — the director must call this first.
   *  `holdMs` keeps the zone pinned that long after it's ready (the cut lands a beat later, and an
   *  unpinned zone far from the current shot can be let go in between). */
  async prepare(p: THREE.Vector3, timeoutMs = 30_000, holdMs = 0): Promise<boolean> {
    const r = roomAt(p.x, p.y + 0.5, p.z);
    if (!r) return false;
    const baked = BAKED_OF[r.zone];
    if (this.zones.isReady(r.zone) && !holdMs) return true;
    this.pin(baked, true);
    const t0 = performance.now();
    while (!this.disposed && !this.zones.isReady(r.zone) && performance.now() - t0 < timeoutMs) {
      this.zones.want(p.toArray() as V3);
      await new Promise((res) => setTimeout(res, 150));
    }
    if (holdMs > 0) setTimeout(() => this.pin(baked, false), holdMs);
    else this.pin(baked, false);
    return this.zones.isReady(r.zone);
  }

  private pin(z: (typeof BAKED_OF)[SiteZone], on: boolean): void {
    const n = (this.pins.get(z) ?? 0) + (on ? 1 : -1);
    if (n > 0) { this.pins.set(z, n); this.zones?.pinned.add(z); }
    else { this.pins.delete(z); this.zones?.pinned.delete(z); }
  }

  followBody(id: string | null): void {
    this.cam.follow = id;
    const a = id ? this.actors.get(id) : undefined;
    if (a) {
      const c = a.chest(new THREE.Vector3());
      const back = a.forward(new THREE.Vector3()).multiplyScalar(-3.2);
      this.cam.look([c.x, a.pos.y + 1.15, c.z], [c.x + back.x, a.pos.y + 2.4, c.z + back.z]);
    }
  }

  /** the zone a point is in (the panel's readout) */
  zoneAt(p: THREE.Vector3): string | null { return roomAt(p.x, p.y, p.z)?.zone ?? null; }
  siteZones(): SiteZone[] { return zonesInPlay(); }

  dispose(): void {
    holdLate(false);
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.soundRetry) clearTimeout(this.soundRetry);
    if (this.lostTimer) { clearTimeout(this.lostTimer); this.lostTimer = null; }
    this.renderer.domElement.removeEventListener("webglcontextlost", this.lost, false);
    this.sound?.dispose();
    this.sound = null;
    this.storm?.dispose();
    this.storm = null;
    this.cam.dispose();
    this.doors?.dispose();
    this.actors?.dispose();
    this.zones?.dispose();
    this.fx?.clear();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat?.dispose();
    });
    disposeCompressed();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** THE STREAM PAGE'S TWO CALLS (scripts/survivorz/ launches Edge with
 *  `--autoplay-policy=no-user-gesture-required` on a 1920x1080 window):
 *    scene.setRender(STREAM_RENDER);          // exactly the page's pixels, 60 fps
 *    await startAudioUnattended(scene);       // sound on with nobody to click (retries by itself)
 *  Resolves true once sound is on; false where the browser still wants a gesture. */
export function startAudioUnattended(scene: ShowScene): Promise<boolean> {
  return scene.startSoundUnattended();
}
