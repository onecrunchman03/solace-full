<script lang="ts">
  import { suitPic, suitPicStyle } from "../lib/suitpic.svelte";
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
  import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
  import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
  import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
  import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
  import {
    connectGame,
    type GameNet,
    type Welcome,
    type BrItem,
    type DebriefRelic,
    type CorpseItem,
    type OperatorView,
    type StationState,
    type OfficeState,
    type HotelState,
    type LightsState,
    type OceanState,
    type CaveState,
    type SuburbState,
    type SpectateState,
  } from "./gamenet";
  import { relicImg, relicDesc } from "./reliccatalog";
  import { drawOperator } from "./opmap";
  import {
    createScene,
    buildChunk,
    pruneChunks,
    setLevelStyle,
    applyLevelEnvironment,
    setPoolEnvironment,
    makePoolEnvironment,
    makeStationEnvironment,
    setStationEnvironment,
    tickWater,
    tickSwingDoors,
    wallsBetween,
    tickFlickers,
    tickEntityFlicker,
    tickAvatar,
    addDoorMarker,
    redDoorOutline,
    DOOR_RED,
    addFloorRing,
    clearChunkMarks,
    addSprayMark,
    preloadProps,
    setPropLoadedHook,
    releaseLevelLights,
    PIPE_LAMP_KIND,
    PIPE_RUN_KIND,
    STATION_PANEL_KIND,
    HOTEL_FIXTURE_KINDS,
    LIGHTS_FIXTURE_KINDS,
    setStationPower,
    tickStationWater,
    tickOfficeRain,
    setModelWarmHook,
    wallHit,
    WorldIndex,
    makeAvatar,
    makeRagdollBody,
    makePoolsExitDoor,
    setAvatarEquip,
    setAvatarEmote,
    installAvatarTorchPool,
    ensureHazmat,
    makeViewmodel,
    makeEmoteBody,
    loadEmoteClip,
    playEmote,
    EMOTES,
    type EmoteBody,
    tickViewmodel,
    placeViewmodel,
    attachToHand,
    armIK,
    type Viewmodel,
    disposeAvatar,
    CELL,
    EYE,
    PIT_LETHAL_STEPS,
    setPowerLevel,
    type PeerAvatar,
  } from "./world";
  import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
  import { createController, PITCH_DOWN_MAX, WALK_SPEED, type PlayerState } from "./controller";
  import { joinProximityVoice, type ProximityVoice, type SpatialPeer } from "./voicechat";
  import {
    startHum,
    setHumBed,
    footstep,
    closeAmbience,
    updateEntitySound,
    updateStalkerSound,
    setGameVolume,
    shyScream,
    shyQuiet,
    updateShySound,
    warmShySound,
    warmGatorSound,
    gatorMunch,
    setRoomSound,
    stationSfx,
    warmStationSound,
  } from "./ambience";
  import { roomSound } from "../../../src/backrooms/surfaces";
  import { WET_TYPES } from "../../../src/backrooms/lights-vocab";
  import { warmBleederSound, updateBleederSound, bleederCry, stopBleederSound } from "./bleeder-audio";
  import { warmTempSound, updateTempSound, officeSfx, stopTempSound } from "./temp-audio";
  import { warmHotelSound, updateHotelLoop, hotelSfx, stopHotelSound } from "./hotel-audio";
  import { HotelScene } from "./hotel-scene";
  import { warmLightsSound, updateLightsLoop, lightsSfx, stopLightsSound, panFor } from "./lights-audio";
  import { LightsScene, openSeaHatch } from "./lights-scene";
  import { makeSign } from "./signs";
  import { WallSeats, SIDE_STEP, THIN_FACE } from "./wallseat";
  import { OceanScene, makeHelmet } from "./ocean-scene";
  import { warmOceanSound, updateOceanLoop, oceanSfx, stopOceanSound } from "./ocean-audio";
  import { CaveScene, makeRope } from "./cave-scene";
  import { warmCaveSound, updateCaveLoop, caveSfx, stopCaveSound } from "./cave-audio";
  import { SuburbScene, makeHouseKey } from "./suburb-scene";
  import { warmSuburbSound, updateSuburbLoop, suburbSfx, stopSuburbSound } from "./suburb-audio";
  import { warmGrabberSound, updateGrabberSound, grabberCry, stopGrabberSound } from "./grabber-audio";
  import { gearSfx, startSprayHiss, stopSprayHiss, warmGearSfx, peerSprayHiss, stopAllPeerSprays } from "./gearsfx";
  import { createRagdoll, type Ragdoll } from "./ragdoll";
  import { bloodBurst, bloodImpact, bloodPool, clearBlood, tickBlood } from "./blood";
  import { isDesktopShell, isMac } from "../lib/platform";
  import { ESC_CRUMB, reportNote } from "../lib/errorreport";
  import { acquirePointerLock, isTeleport } from "../lib/pointerlock";
  import {
    brSettings,
    saveBrSettings,
    resetBrKeys,
    bindBrKey,
    keyLabel,
    BR_ACTIONS,
    type BrAction,
    type GfxPreset,
  } from "./settings.svelte";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
  import { api as hubApi } from "../lib/api";
  import { api as brApi } from "./gameapi";
  import { session } from "../lib/session.svelte";

  let {
    door,
    loadout = [],
    enterLevel = 0,
    onExit,
  }: { door: number; loadout?: number[]; enterLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; onExit: () => void } = $props();

  let host: HTMLDivElement;
  let doorName = $state("");
  let entered = $state(false);
  let deniedMsg = $state("");
  let lost = $state(false);
  let locked = $state(false);
  // POINTER-LOCK FALLBACK (Josh's Mac, Aug 2026): the desktop shell's macOS
  // webview (WKWebView) has NO Pointer Lock API, so `locked` never went true
  // — no look, no walk. When a lock request goes nowhere, this mode fakes
  // it: `locked` is driven by us, the cursor hides via CSS, and the look
  // comes from raw mouse deltas. ESC pauses (there's no real lock to lose).
  let lockFallback = false;
  /** The game's own exits (the debrief, a death, a refusal) set this; anything
   *  else that unmounts the game is reported if it follows an Escape. */
  let leavingOnPurpose = false;
  let lastEscAt = 0;
  /** Set once the scene is up: the one way to ask for the mouse. Every screen
   *  that releases the pointer (reader, loot, death, debrief, pause) comes
   *  back through here, so there is a single place the policy applies. */
  let grabPointerFn: (() => void) | null = null;
  let micState = $state<"joining" | "live" | "muted" | "off">("off");
  let voice: ProximityVoice | null = null;
  /** LAW 12: the dead's own voice room on the level (joinGhostVoice). */
  let ghostVoice: ProximityVoice | null = null;

  // ---- Survival HUD state (B3 core) ----------------------------------------
  let hp = $state(100);
  // The loop's own values are plain; the HUD reads quantized mirrors (Oct
  // 2026 review: the house rule keeps $state out of the rAF write path — a
  // same-value write is free, a fresh float every frame flushed effects).
  let stamina = 100;
  let staminaUi = $state(100);
  let crouching = $state(false);
  // SWIMMING (Poolrooms v3): 1 → 0 over the 10 seconds your head is under.
  // The server owns the actual drown kill; this is the countdown you see.
  let breath = 1;
  let breathUi = $state(1);
  let inWaterHud = $state(false); // head under → the underwater wash + meter
  // Slots hold the run's LOADOUT (locker items the server validated). A
  // backpack in the loadout raises the count to 9 without occupying a slot.
  let slots = $state<(BrItem | null)[]>(Array(5).fill(null));
  let selSlot = $state(0);
  // ---- THE EMOTE WHEEL (Josh, Aug 2026) -------------------------------------
  // Hold the emote key (default B, rebindable) → a Fortnite-style radial.
  // The pointer stays LOCKED (it has to — the Mac shell has no Pointer Lock
  // API at all, so "unlock for a real cursor" isn't portable): mouse deltas
  // drive a virtual cursor, the wedge under it highlights, and click OR
  // releasing the key plays the highlighted dance. While the dance runs the
  // player is rooted, the camera pulls out to third person (mouse orbits),
  // and the first-person body — whose mask faces are CUT from the mesh —
  // is swapped for a full-headed clone so you aren't watching a headless
  // man dance. Peers see the same dance via `em` on the pos frames.
  let wheelOpen = $state(false);
  let wheelX = $state(0); // virtual cursor, SVG units from the wheel center
  let wheelY = $state(0);
  let wheelHover = $state(-1);
  let emoting = $state<{ id: string; body: EmoteBody } | null>(null);
  let emoteBodyCache: EmoteBody | null = null;
  let emoteBodyColor = "yellow"; // the suit the cached stand-in was built in
  /** Hard deadline for the running emote (epoch ms). Josh got stranded in
   *  third person once on live — the action's `paused` flag is the exact
   *  finish line, but no single mechanism gets to strand the camera: this
   *  failsafe force-ends the emote at clip length + a beat, and covers the
   *  fetch-never-resolves case with a 20s cap until the clip arrives. */
  let emoteEndsAt = 0;
  let emoteYaw = 0; // third-person orbit angle (mouse X)
  let emotePitch = 0.35; // orbit elevation (mouse Y)
  const WHEEL_N = EMOTES.length;
  const WHEEL_SPAN = (Math.PI * 2) / WHEEL_N;
  /** Annulus wedge path for slot i — angle 0 is 12 o'clock, clockwise. */
  function wedgePath(i: number): string {
    const a0 = i * WHEEL_SPAN - WHEEL_SPAN / 2 + 0.035;
    const a1 = i * WHEEL_SPAN + WHEEL_SPAN / 2 - 0.035;
    const pt = (r: number, a: number): string => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
    return `M ${pt(56, a0)} L ${pt(148, a0)} A 148 148 0 0 1 ${pt(148, a1)} L ${pt(56, a1)} A 56 56 0 0 0 ${pt(56, a0)} Z`;
  }
  /** Labels ride further out and smaller now the ring carries ELEVEN dances
   *  (Aug 2026). MEASURED, with the browser's own text metrics rather than by
   *  eye: the worst neighbours are Hip Hop + Gangnam, and the pair straddling
   *  12 o'clock is the tightest because both labels are horizontal there. At
   *  the old 102/15px they were 57 units apart and needed 64 — the top of the
   *  wheel overlapped itself. 112/12px gives 60.5 for a needed 51. Tangential
   *  room is what a wedge count costs; this is the dial to turn if the list
   *  grows again (or rotate the labels radially, which stops costing). */
  function wedgeLabel(i: number): { x: number; y: number } {
    const a = i * WHEEL_SPAN;
    return { x: Math.sin(a) * 112, y: -Math.cos(a) * 112 + 4 };
  }
  /** Feed a mouse delta to the wheel's virtual cursor and re-pick the wedge. */
  function wheelPoint(dx: number, dy: number): void {
    wheelX += dx;
    wheelY += dy;
    const mag = Math.hypot(wheelX, wheelY);
    if (mag > 145) {
      wheelX *= 145 / mag;
      wheelY *= 145 / mag;
    }
    // A dead zone in the hub, so opening the wheel never pre-selects.
    if (mag < 48) {
      wheelHover = -1;
      return;
    }
    const a = Math.atan2(wheelX, -wheelY); // 0 at 12 o'clock, clockwise +
    wheelHover = ((Math.round(a / WHEEL_SPAN) % WHEEL_N) + WHEEL_N) % WHEEL_N;
  }

  // ADMIN FLYCAM (F) — operator tool, mirrored here only to drive the HUD.
  let flying = $state(false);
  let flySpeed = $state(6);
  // ADMIN PROBE (G-eometry readout). Three rounds of "there's a dark patch"
  // were spent guessing from screenshots; this reports what the renderer
  // actually put in front of the camera, so a hole can be named instead of
  // inferred. Admins only, toggled with B.
  let probeOn = $state(false);
  let probeText = $state("");
  let flashOn = $state(false);
  let flashPct = $state(1); // selected flashlight's battery fraction (HUD)
  // The item pictures (same set the section uses).
  // The store renders (Josh's model shots) — backpack + suit keep the
  // original art by his call; the bottle finally gives almond water a face.
  const GEAR_IMG: Record<string, string> = {
    flashlight: "/assets/gear/store/flashlight.webp",
    walkie: "/assets/gear/store/walkietalkie.webp",
    camera: "/assets/gear/store/camera.webp",
    spraycan: "/assets/gear/store/spraycan.webp",
    backpack: "/assets/gear/backpack.png",
    suit: "/assets/gear/suit.png",
    pills: "/assets/gear/store/pills.webp",
    battery: "/assets/gear/store/battery.webp",
    almondwater: "/assets/gear/store/bottle.webp",
  };
  const GLYPH_FALLBACK: Record<string, string> = { almondwater: "🥛" };
  // An item's picture: relics their own, suits the rendered model in their
  // colorway (lib/suitpic), everything else the store render.
  const imgFor = (kind: string, color: string | null | undefined): string =>
    kind === "relic" ? (relicImg(color ?? "") ?? "") : kind === "suit" ? suitPic(color) : (GEAR_IMG[kind] ?? "");
  // Battery minutes by upgrade level (matches src/backrooms/gear.ts).
  const FLASH_MIN = [15, 20, 30, 60];
  const WALKIE_MIN = [7, 10, 15, 20];
  const SPRAY_SEC = [90, 120, 180, 240];
  const CAM_SEC = [30, 60, 120, 180];
  let walkieChan = $state(1);
  let txing = $state(false);
  let walkiePct = $state(1);
  let sprayPct = $state(1);
  let camRec = $state(false);
  // True once the camera has reached the mask — the view is the camera's own.
  let camAimed = $state(false);
  let camLeft = $state(0); // seconds of tape remaining (selected camera)
  // Death (the entity got you): red flash → fade to black → back to Solace.
  let deadScreen = $state<"none" | "flash" | "black">("none");
  /** LAW 12 — THE DEAD, WATCHING. The server's latest word on who you watch
   *  (null = not watching), and whether the watch has begun on screen (it
   *  waits for the death screen to finish). `specClock` ticks the HUD. */
  let spec = $state<(SpectateState & { at: number }) | null>(null);
  let specOn = $state(false);
  let specClock = $state(0);
  /** The leave button: the component's own exit, wired up in onMount. */
  let leaveSpectate: () => void = () => {};
  let deadCause = $state<string | undefined>(undefined);
  // Looting a fallen player's body (E on it opens; click items to take).
  let lootPanel = $state<{ id: number; name: string; items: CorpseItem[] } | null>(null);
  // THE LANDING asks which door you meant: down to Level 0, or out to
  // Threshold-4 (Josh — the passage is an exit now too).
  let landingChoice = $state(false);
  const ITEM_LABEL: Record<string, string> = {
    flashlight: "Flashlight",
    walkie: "Walkie Talkie",
    camera: "Camera",
    spraycan: "Spray Can",
    backpack: "Backpack",
    suit: "Hazmat Suit",
    pills: "Health Pills",
    battery: "Battery",
    almondwater: "Almond Water",
    relic: "Relic",
  };
  let hudNote = $state(""); // transient "nothing here" style messages
  let hudNoteTimer = 0;
  // ---- The Research archive + THE DOOR (Josh's lore design) ----------------
  // A recovered drive opens its reader right there in the run; the key and the
  // door are the community's end goal for Level 0.
  let reading = $state<{ driveId: string; title: string; file: string; body: string; ada: string; fresh: boolean } | null>(null);
  let hasKey = $state(false);
  let level1Open = $state(false);
  let level1By = $state("");
  /** Pipe Dreams' fuses in your hands (they never take a slot). */
  let fusesCarrying = $state(0);
  /** THE ELECTRICAL STATION's chip: breakers on, and your section's power. */
  let stationChip = $state("");
  /** THE TERROR HOTEL (Level 5): you are in it; your heat (0-100, the server's,
   *  yours alone); the register's one clear line once you have read it; the
   *  lift you stand at with its panel open, and the floor being typed. */
  let inHotel = $state(false);
  let heat = $state(0);
  let registerLine = $state<string | null>(null);
  let registerTimer: ReturnType<typeof setTimeout> | null = null;
  let liftAt = $state<{ x: number; y: number } | null>(null);
  let liftDigits = $state("");
  /** What the key chip says: which door the key you hold opens. */
  let keyChip = $state("THE KEY — take it to the door");
  const keyChipFor = (lv: number): string =>
    lv === 9 ? "THE HOUSE KEY — to Number 9's front door" : lv === 8 ? "THE CLIMBING ROPE — to the chimney (too heavy to run with)" : lv === 7 ? "THE DIVING HELMET — a minute of air" : lv === 6 ? "THE HANDWHEEL — take it to the sea hatch" : lv === 5 ? "THE BOILER KEY — take it to the rusty door" : lv === 4 ? "THE KEYCARD — badge it at the stairwell door" : lv === 1 ? "THE POOLROOMS' KEY — take it to the drain hatch" : "THE KEY — take it to the door";
  /** A level opening further down: the same banner as THE DOOR's, for a while. */
  let gateBanner = $state<{ k: string; t: string; s: string } | null>(null);
  let gateBannerTimer: ReturnType<typeof setTimeout> | null = null;
  const showGate = (k: string, t: string, who: string, tail: string): void => {
    gateBanner = { k, t, s: who ? `${who} ${tail}` : tail };
    if (gateBannerTimer) clearTimeout(gateBannerTimer);
    gateBannerTimer = setTimeout(() => (gateBanner = null), 9000);
  };
  // The Voss debrief (extraction) — set by the server's debrief frame.
  let debrief = $state<{ revealed: number; ms: number; relics: DebriefRelic[]; footage: string | null; test?: boolean; home?: boolean } | null>(null);
  const FOOTAGE_LABEL: Record<string, string> = {
    close: "CLOSE RANGE (≤3m) — Voss pays 400 silver",
    mid: "mid range (≤10m) — Voss pays 250 silver",
    far: "a distant glimpse — Voss pays 50 silver",
  };
  let wasLocked = $state(false); // once true, unlock = the pause menu
  let showMap = $state(false);
  let mapCanvas = $state<HTMLCanvasElement | null>(null);
  // ---- Pause menu (Josh's B3 settings screen) -------------------------------
  let pauseTab = $state<"main" | "audio" | "video" | "controls">("main");
  /** Live perf readout for the VIDEO tab (pushed ~2Hz from the frame loop):
   *  fps, frame ms, and the internal resolution actually being rendered. */
  let gfxView = $state({ fps: 0, ms: 0, res: "", scale: 100 });
  /** Assigned in onMount (needs the composer/flashlight closures); the VIDEO
   *  tab's controls call it to re-apply preset + render scale live. */
  let applyGfx: () => void = () => {};
  let confirmForfeit = $state(false);
  let mics = $state<MediaDeviceInfo[]>([]);
  let speakers = $state<MediaDeviceInfo[]>([]);
  let capturing = $state<BrAction | null>(null); // action awaiting a key press
  let micMeter = $state(0);
  let meterTimer = 0;

  const note = (t: string): void => {
    hudNote = t;
    clearTimeout(hudNoteTimer);
    hudNoteTimer = window.setTimeout(() => (hudNote = ""), 1600);
  };

  const hpColor = $derived(hp > 60 ? "#4fc35e" : hp > 30 ? "#d8b93c" : "#c9382a");
  const mins = (ms: number): string => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };

  let net: GameNet | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  /** Filled by the game loop's closure: extract from wherever the body is
   *  standing right now (used by The Landing's choice panel, which lives in
   *  the markup and can't see `player`). */
  let extractNow: () => void = () => {};
  let raf = 0;
  /** True once onDestroy has run — guards async joins resolving onto a dead
   *  component (the voice connect takes seconds; see the casino's twin). */
  let brDisposed = false;
  let cleanupFns: (() => void)[] = [];

  onMount(() => {
    const { scene, camera } = createScene();
    // Peer flashlight beams come from a fixed pool (see world.ts) — a
    // toggling torch must never change the scene's light count, because a
    // light-count change recompiles every material mid-frame.
    cleanupFns.push(installAvatarTorchPool(scene));
    // powerPreference: on dual-GPU laptops the browser is otherwise free to
    // hand Solace the INTEGRATED chip — this line asks for the discrete one.
    // (The antialias flag only covers the default framebuffer; real MSAA
    // through the composer is set per-preset in applyGfx below.)
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Shadows exist for exactly ONE light: your flashlight (see below).
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // One frame is several render() calls (the composer's passes): count them
    // all, reset once a frame, so the debug hook reads a whole frame's draws.
    renderer.info.autoReset = false;
    host.appendChild(renderer.domElement);
    // what the Poolrooms' glazed tile reflects (world.ts → THE POOL TILE):
    // a soft pool hall, prefiltered once for the renderer that owns it
    setPoolEnvironment(makePoolEnvironment(renderer));
    // …and what the Station's standing water reflects: its lamps in the dark
    setStationEnvironment(makeStationEnvironment(renderer));
    setGameVolume(brSettings.outputVolume);
    warmGearSfx();
    // Furniture models load once and are shared; chunks built before a model
    // arrived get rebuilt when it does, so nothing is permanently empty.
    // ONLY the chunks that actually place that kind, and via the paced
    // rebuild queue — this used to rebuild the ENTIRE loaded world
    // synchronously once per model file (8 files × up to 81 chunks), which
    // was the multi-second freeze right after entering (Aug 2026).
    preloadProps();
    setPropLoadedHook((kind) => {
      for (const [k, chunk] of world.chunks) {
        // Pipe Dreams' lamps are fixtures instanced into every chunk, not
        // props on its list — the lamp's arrival rebuilds them all.
        if (world.meshes.has(k) && (chunk.props?.some((p) => p.kind === kind) || (kind === PIPE_LAMP_KIND && level >= 2) || (kind === PIPE_RUN_KIND && level === 2) || (kind === STATION_PANEL_KIND && level === 3) || (level === 5 && HOTEL_FIXTURE_KINDS.includes(kind)) || (level === 6 && LIGHTS_FIXTURE_KINDS.includes(kind)))) rebuildQueue.add(k);
      }
    });
    // THE MODEL WARM (see world.ts setModelWarmHook): every streamed-in
    // model — props, held items, and the creature prototypes below — gets
    // its programs compiled off-thread and its textures uploaded the moment
    // it loads, so its FIRST SIGHT never stalls the render thread.
    const warmModel = (root: THREE.Object3D): void => {
      if (!renderer) return;
      void renderer.compileAsync(root, camera, scene).catch(() => {});
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) {
          for (const v of Object.values(mm)) {
            if (v && (v as THREE.Texture).isTexture) renderer?.initTexture(v as THREE.Texture);
          }
        }
      });
    };
    setModelWarmHook(warmModel);
    cleanupFns.push(() => setModelWarmHook(null));
    // the prop hook closed over this world, and the level lights over this
    // scene — both outlived the game (Oct 2026 review)
    cleanupFns.push(() => {
      setPropLoadedHook(null);
      releaseLevelLights();
    });

    // Bloom sells the fluorescence: threshold sits above every lit surface
    // so ONLY the panels bleed — the halo your eyes add around a bright
    // light.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Soft halos around the panels — restrained (Josh: lights too bright).
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.5, 0.93);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // THE ATMOSPHERE FILTER (Josh, July 2026: "a subtle filter to make it
    // more atmospheric" — this supersedes the earlier no-grain note). One
    // cheap display-referred pass after the output transform:
    //   · animated film grain, damped in highlights so lit panels stay clean
    //   · a soft vignette pulling the corners down
    //   · a whisper of edge chromatic fringing (lens, not glitch)
    // All three are deliberately faint — the mood is analog unease, not VHS
    // cosplay. The camera-item viewfinder already does the heavy VHS look.
    const atmo = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          time: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform float time;
          varying vec2 vUv;
          void main() {
            vec2 d = vUv - 0.5;
            float r2 = dot(d, d);
            // Edge chromatic fringe — zero at centre, ~1.5px at the corners.
            vec2 ca = d * r2 * 0.012;
            vec3 col;
            col.r = texture2D(tDiffuse, vUv + ca).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv - ca).b;
            // Animated grain, damped in highlights.
            float n = fract(sin(dot(vUv + fract(time * 7.31), vec2(12.9898, 78.233))) * 43758.5453);
            float luma = clamp(dot(col, vec3(0.333)), 0.0, 1.0);
            col += (n - 0.5) * 0.04 * (1.0 - 0.55 * luma);
            // Soft vignette.
            float v = smoothstep(0.95, 0.35, length(d) * 1.32);
            col *= mix(0.74, 1.0, v);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    composer.addPass(atmo);

    const world = new WorldIndex(16);
    // Dev-only inspection handle for the Playwright verification harness —
    // never present in production builds.
    if (import.meta.env.DEV) (window as unknown as { __brWorld?: WorldIndex }).__brWorld = world;
    const player: PlayerState = { x: 0, y: 0, yaw: 0, pitch: 0, moving: false, alt: 0 };
    const ctl = createController(player, world);
    const peers = new Map<number, PeerAvatar>();
    /** How long a peer may go unheard before it is taken off the screen (the
     *  server's presence pulse is 1s, so this is three missed pulses). */
    const PEER_STALE_MS = 3_500;
    let lastPeerSweep = 0;
    /** HOW LOUD SOMEBODY ELSE IS (law 5, Oct 2026): every sound a peer makes —
     *  their gear, their steps, their can — fades with distance (gone at 14
     *  cells) and darkens through each wall, instead of playing flat inside
     *  10 cells and not at all past it. */
    const PEER_EARSHOT = 14;
    const peerLevel = (x: number, y: number, walls: number): number => {
      const d = Math.hypot(x - player.x, y - player.y);
      if (d >= PEER_EARSHOT) return 0;
      return Math.pow(1 - d / PEER_EARSHOT, 1.3) * Math.pow(0.55, Math.min(4, walls));
    };
    /** Each peer's stride clock, for their footsteps. */
    const peerStride = new Map<number, number>();

    let worldSize = 256;
    // Which world we're standing in (0 = Level 0, 1 = THE POOLROOMS) and the
    // lobby-door spray marks, taken down when travel leaves Level 0.
    let level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 0;
    /** Which dressing a level wears — the ONE mapping, so welcome and travel can't disagree. */
    const styleFor = (l: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): "carpet" | "pools" | "pipes" | "station" | "office" | "hotel" | "lights" | "ocean" | "cave" | "suburb" =>
      l === 9 ? "suburb" : l === 8 ? "cave" : l === 7 ? "ocean" : l === 6 ? "lights" : l === 5 ? "hotel" : l === 4 ? "office" : l === 3 ? "station" : l === 2 ? "pipes" : l === 1 ? "pools" : "carpet";
    /** The footstep surface of a level's dry floor. */
    const floorSurface = (l: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): "carpet" | "tile" | "concrete" => (l === 9 ? "concrete" : l === 8 ? "concrete" : l === 7 ? "concrete" : l === 6 ? "concrete" : l >= 4 ? "carpet" : l >= 2 ? "concrete" : l === 1 ? "tile" : "carpet");
    /** What the HUD calls the level you're in. */
    /** LIGHTS OUT: is this cell in the Wet End's water (every step a splash)? */
    const LIGHTS_WET = new Set<string>(WET_TYPES);
    /** THE CAVE SYSTEM: the flooded track bed and the river are ankle-deep. */
    const CAVE_WET = new Set<string>(["trackbed", "caveriver"]);
    const lightsWetAt = (x: number, y: number): boolean =>
      (level === 6 && LIGHTS_WET.has(world.typeAt(Math.floor(x), Math.floor(y)))) || (level === 8 && CAVE_WET.has(world.typeAt(Math.floor(x), Math.floor(y))));
    const levelName = (l: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, lobbyDoor: string): string =>
      l === 9 ? "The Suburbs" : l === 8 ? "The Cave System" : l === 7 ? "Thalassophobia" : l === 6 ? "Lights Out" : l === 5 ? "The Terror Hotel" : l === 4 ? "The Abandoned Office" : l === 3 ? "The Electrical Station" : l === 2 ? "Pipe Dreams" : l === 1 ? "The Poolrooms" : lobbyDoor;
    let doorMarks: THREE.Object3D[] = [];
    let chunkSize = 16;
    /** chunk key -> when it was asked for. An answer that never comes (the
     *  server streams only chunks near where IT thinks you are, so an ask
     *  that outruns your move frame after a flycam jump is declined) must not
     *  block the chunk forever: an unanswered ask is retried after 2.5s. */
    const requested = new Map<string, number>();
    /** Chunks whose neighbour just arrived — rebuilt one per frame so their
     *  cross-seam guesses (corners, wall tops) get corrected without a hitch. */
    const rebuildQueue = new Set<string>();
    let lastChunkCheck = 0;
    let lastMoveSend = 0;
    let lastVoiceAt = 0;
    const wallCache = new Map<number, number>(); // peerId → occlusion walls (5Hz)
    let lastSent = { x: -1, y: -1, h: -999, p: 0, e: "", pt: 0, em: "" };
    let bobT = 0;
    // Brownout envelope (server-called; see world.ts setPowerLevel). The
    // SHAPE is local — a dying stutter, a long dark simmer, a fluorescent
    // re-strike — but the START and LENGTH are the server's, so everyone
    // watches the same failure together.
    let brownStart = 0;
    let brownUntil = 0;
    let brownFlickAt = 0;
    let brownLevel = 1;
    let brownBlack = false; // this event's middle stretch goes to BLACK
    let lastRoomK = 1; // last power level actually applied
    // Extraction + verticality (client-cosmetic — the server tracks x/y only).
    /** Every door's trigger spot — ANY of them extracts (Josh, July 2026). */
    let exitDoors: { x: number; y: number; edge: "N" | "S" | "E" | "W"; radial?: boolean }[] = [];
    let winded = false; // stamina hit 0 — sprint stays revoked until 20
    let staminaFreeUntil = 0; // almond water: 7s of free sprint/jumps
    const SPRAY_RAY = new THREE.Raycaster();
    const SPRAY_TARGETS: THREE.Object3D[] = [];
    const ARM_TARGET = new THREE.Vector3();

    // The flashlight rig: one spotlight riding the camera, target thrown
    // ahead each frame. Per-ITEM battery (two flashlights = two batteries),
    // full at run start; drains only while lit and in hand.
    //
    // IT IS STRICTLY LOCAL (Josh's rule: "other players should not see the
    // light"). Nothing about the flashlight goes on the wire — no state
    // frame, no peer beam — so this SpotLight exists only in YOUR scene and
    // only ever lights YOUR view. It also CASTS SHADOWS: without them the
    // beam passed straight through drywall and lit the room next door, which
    // is the one way a neighbour could have seen a light that isn't theirs.
    const flash = new THREE.SpotLight(0xfff0c8, 0, 20, 0.5, 0.45, 1.5);
    const flashTarget = new THREE.Object3D();
    flash.target = flashTarget;
    flash.visible = false;
    flash.castShadow = true;
    flash.shadow.mapSize.set(1024, 1024);
    flash.shadow.camera.near = 0.4;
    flash.shadow.camera.far = 22;
    flash.shadow.bias = -0.0015; // kills the acne on the merged wall mesh
    scene.add(flash);
    scene.add(flashTarget);
    const batteries = new Map<number, number>(); // itemId → seconds left
    const FWD = new THREE.Vector3();
    const radioPeers = new Set<number>(); // userIds transmitting on my channel

    // A floating text label (relic names, dropped-item names). Canvas sprite,
    // depth-tested off so it reads even edge-on to a wall.
    /** Remove a streamed marker AND free its GPU memory. Every proximity
     *  marker (relic/drive/drop/key sprites + labels) is built fresh each
     *  time it enters range; reaping with a bare scene.remove leaked a
     *  CanvasTexture per flicker at the stream edge — which is exactly a
     *  frame rate that "slowly drops over time in certain areas" (Josh).
     *  Sprites own their texture+material (safe to free); meshes may share
     *  geometry, so they are only removed. */
    const reap = (o: THREE.Object3D | null | undefined): void => {
      if (!o) return;
      scene.remove(o);
      if ((o as THREE.Sprite).isSprite) {
        const m = (o as THREE.Sprite).material;
        m.map?.dispose();
        m.dispose();
      }
    };
    const makeLabel = (text: string, tint: string, depth = false): THREE.Sprite => {
      const H = 96;
      const FONT = "700 40px system-ui, sans-serif";
      // A long sign WIDENS rather than cropping its text ("THE ENTRANCE — WAY
      // IN & OUT" ran off both ends of a fixed 512px canvas). The letters stay
      // the size every other sign's are.
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.font = FONT;
      const W = Math.max(512, Math.min(1280, Math.ceil(probe.measureText(text).width + 64)));
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const g = cv.getContext("2d")!;
      g.font = FONT;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const w = Math.min(W - 12, g.measureText(text).width + 44);
      g.fillStyle = "rgba(12,9,4,0.62)";
      g.beginPath();
      g.roundRect((W - w) / 2, 18, w, H - 36, 10);
      g.fill();
      g.strokeStyle = "rgba(232,211,134,0.45)";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = tint;
      g.fillText(text, W / 2, H / 2);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      // depth: a door sign sits behind walls like the wall it's on — Level 0
      // never gave you a waypoint home through the drywall, and still doesn't.
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: depth }));
      sp.scale.set(2.1 * (W / 512), 0.39, 1);
      return sp;
    };

    // Relic sites: golden pulsing sprites. Josh's round-3 call — the relic is
    // NAMED in the world, so you can decide from across the room whether it's
    // worth the walk (or whether you already own it).
    const relicSites = new Map<
      number,
      { x: number; y: number; seenAt: number; sprite: THREE.Sprite; label: THREE.Sprite; pin: GroundPin; labelPin: GroundPin }
    >();
    const relicTex = (() => {
      const S = 128;
      const cv = document.createElement("canvas");
      cv.width = S;
      cv.height = S;
      const g = cv.getContext("2d")!;
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, "rgba(255, 236, 170, 0.95)");
      grad.addColorStop(0.25, "rgba(255, 214, 110, 0.6)");
      grad.addColorStop(0.6, "rgba(230, 180, 70, 0.18)");
      grad.addColorStop(1, "rgba(230, 180, 70, 0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      g.strokeStyle = "rgba(255, 240, 190, 0.9)";
      g.lineWidth = 3;
      for (const a of [0, Math.PI / 2]) {
        g.beginPath();
        g.moveTo(S / 2 - Math.cos(a) * 26, S / 2 - Math.sin(a) * 26);
        g.lineTo(S / 2 + Math.cos(a) * 26, S / 2 + Math.sin(a) * 26);
        g.stroke();
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const relicMat = new THREE.SpriteMaterial({ map: relicTex, transparent: true, depthWrite: false });
    // THE PLACEMENT LAW, client half (src/backrooms/placement.ts is the server
    // half): anything the server places on the map is drawn ON THE FLOOR UNDER
    // IT, and kept there. A pickup used to be drawn at a fixed height (a relic
    // at 1.15m) — right on Level 0's flat carpet, and inside or under the deck
    // on any level whose floor isn't at the datum (Josh found a Pipe Dreams
    // relic under the floor). groundAt also reads 0 until the chunk under a
    // point has streamed, so a height read once at arrival can be wrong too:
    // every pin is re-read each frame, which is what makes it right the moment
    // the floor arrives. A pin drops itself when its object leaves the scene.
    type GroundPin = { o: THREE.Object3D; x: number; y: number; off: number };
    const groundPins = new Set<GroundPin>();
    const pinToGround = (o: THREE.Object3D, x: number, y: number, off: number): GroundPin => {
      o.position.set(x * CELL, world.groundAt(x, y) + off, y * CELL);
      const pin = { o, x, y, off };
      groundPins.add(pin);
      return pin;
    };
    const tickGroundPins = (): void => {
      for (const p of groundPins) {
        if (!p.o.parent) {
          groundPins.delete(p);
          continue;
        }
        p.o.position.y = world.groundAt(p.x, p.y) + p.off;
      }
    };

    // THE OPERATOR OVERLAY (admin, flying — Josh, Oct 2026: "as the admin i am
    // able to fly in every map and see all monster, relics, objectives, and
    // hard drives"). The server sends the level's whole hunt once a second
    // while you fly (net.ts "op"); every item gets a through-wall label, on its
    // floor, readable at any range. It clears the moment you land.
    const OP_TINT: Record<string, string> = { monster: "#ff5a5a", relic: "#ffd24a", drive: "#9fd7ff", objective: "#ff9a3d" };
    const opMarks = new Map<string, { label: THREE.Sprite; text: string; pin: GroundPin; sx: number; sy: number }>();
    let opSeenAt = 0;
    const OP_NAMES: Record<string, string> = { entity: "ENTITY", stalker: "STALKER", shy: "SHY GUY", gator: "ALLIGATOR", bleeder: "THE BLEEDER", grabber: "THE GRABBER", temp: "THE TEMP", moths: "DEATHMOTHS", listener: "THE LISTENER", deep: "THE THING BELOW", burrower: "THE BURROWER", watch: "THE WATCH" };
    const clearOperator = (): void => {
      for (const m of opMarks.values()) reap(m.label);
      opMarks.clear();
    };
    const applyOperator = (v: OperatorView): void => {
      if (!flying) return;
      opSeenAt = performance.now();
      const keep = new Set<string>();
      const put = (key: string, text: string, tint: string, x: number, y: number, off: number): void => {
        keep.add(key);
        let m = opMarks.get(key);
        if (m && m.text !== text) {
          reap(m.label);
          m = undefined;
        }
        if (!m) {
          const label = makeLabel(text, tint);
          label.renderOrder = 999;
          scene.add(label);
          m = { label, text, pin: pinToGround(label, x, y, off), sx: label.scale.x, sy: label.scale.y };
          opMarks.set(key, m);
        }
        m.pin.x = x;
        m.pin.y = y;
      };
      for (const c of v.monsters) put(`m:${c.kind}:${c.id}`, `${OP_NAMES[c.kind] ?? c.kind} · ${c.mode}`, OP_TINT.monster, c.x, c.y, 2.6);
      v.relics.forEach((r, i) => put(`r:${i}:${r.name}`, `◆ ${r.name}`, OP_TINT.relic, r.x, r.y, 1.85));
      for (const d of v.drives) put(`d:${d.id}`, `▣ DRIVE ${d.id}`, OP_TINT.drive, d.x, d.y, 0.9);
      v.objectives.forEach((o, i) => put(`o:${o.kind}:${i}`, `${o.label} · ${o.state}`, OP_TINT.objective, o.x, o.y, 2.2));
      for (const [k, m] of opMarks) {
        if (keep.has(k)) continue;
        reap(m.label);
        opMarks.delete(k);
      }
    };
    /** Per frame: gone when you land or the frames stop; otherwise grown with
     *  distance so a label across the level reads as well as one beside you. */
    const tickOperator = (now: number): void => {
      if (!opMarks.size) return;
      if (!flying || now - opSeenAt > 3000) {
        clearOperator();
        return;
      }
      for (const m of opMarks.values()) {
        const d = Math.hypot(m.pin.x - player.x, m.pin.y - player.y);
        const k = Math.max(1, d / 14);
        m.label.scale.set(m.sx * k, m.sy * k, 1);
      }
    };

    const makeRelicSprite = (x: number, y: number): { sprite: THREE.Sprite; pin: GroundPin } => {
      const sp = new THREE.Sprite(relicMat);
      const pin = pinToGround(sp, x, y, 1.15);
      sp.scale.setScalar(0.8);
      scene.add(sp);
      return { sprite: sp, pin };
    };

    // Dropped items (G): the item's own picture standing on the carpet, named,
    // pickable with the interact key. Same one-hour rot as a body, server-side.
    const dropTexCache = new Map<string, THREE.Texture>();
    const dropSites = new Map<
      number,
      { x: number; y: number; kind: string; seenAt: number; sprite: THREE.Sprite; label: THREE.Sprite }
    >();
    const makeDropSprite = (kind: string): THREE.Sprite => {
      const url = GEAR_IMG[kind];
      let tex = dropTexCache.get(kind);
      if (!tex && url) {
        tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        dropTexCache.set(kind, tex);
      }
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex ?? null, transparent: true, depthWrite: false, color: 0xffffff }),
      );
      sp.scale.setScalar(0.55);
      return sp;
    };

    // ---- THE RESEARCH ARCHIVE, THE KEY, THE DOOR -------------------------
    // A lore drive is a dead SD-card-looking lump on the carpet; picking one up
    // unlocks its text for everyone on Solace, forever. The key is the one
    // object that opens the one door — both get their own look so neither can
    // be mistaken for loot.
    const driveSites = new Map<
      string,
      { x: number; y: number; seenAt: number; mesh: THREE.Mesh; label: THREE.Sprite }
    >();
    const driveGeo = new THREE.BoxGeometry(0.24, 0.05, 0.18);
    const driveMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.6 });
    const makeDrive = (x: number, y: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(driveGeo, driveMat);
      pinToGround(mesh, x, y, 0.06);
      mesh.rotation.y = (x * 7 + y * 13) % Math.PI; // deterministic-ish scatter
      scene.add(mesh);
      return mesh;
    };

    // THE KEY: small, brass, and it turns slowly so a beam catches it.
    let keySite: { x: number; y: number; seenAt: number; mesh: THREE.Group; label: THREE.Sprite } | null = null;
    // THE DRAIN HATCH (Level 1's door, in the floor) and PIPE DREAMS' FUSES
    let hatchSite: { x: number; y: number; open: boolean; group: THREE.Group; label: THREE.Sprite } | null = null;
    const fuseSites = new Map<number, { x: number; y: number; seenAt: number; mesh: THREE.Group; label: THREE.Sprite }>();
    let fuseBoxSite: { x: number; y: number; door: { x: number; y: number } | null; inserted: number; total: number; open: boolean; label: THREE.Sprite } | null = null;
    // THE ELECTRICAL STATION (Level 3): six breakers (one per section, they
    // only ever go ON), a cutoff per section (kills its power for a while —
    // lights out, water safe), and the lift shutter that all six power. Every
    // one sits on its wall, pinned to its floor, and the server's
    // StationState is the whole truth about them.
    type StationKind = "breaker" | "cutoff" | "shutter";
    type StationSite = {
      kind: StationKind;
      section: number;
      x: number;
      y: number;
      side: number;
      group: THREE.Group;
      pin: GroundPin;
      /** breaker: thrown; shutter: powered; cutoff: cut right now */
      on: boolean;
      lever: THREE.Object3D | null;
      lamp: THREE.Mesh | null;
      label: THREE.Sprite | null;
      labelText: string;
      labelPin: GroundPin | null;
    };
    let stationSites: StationSite[] = [];
    let stationPower: { section: number; powered: boolean; cutMs: number; darkMs: number }[] = [];
    let stationPowerAt = 0;
    let stationOn = 0;
    const SIDE_D: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
    const ON_GREEN = "#7dff9a";
    // The kit's models, loaded once and cloned per site.
    const stationKit = new Map<string, THREE.Object3D | null>();
    const stationKitWaiting = new Map<string, ((m: THREE.Object3D) => void)[]>();
    /** WHERE A WALL'S FACE IS, seen from cell (x, y) looking to `side`
     *  (0 N · 1 E · 2 S · 3 W): 0.15 m in from the edge for a thin wall, on
     *  the edge for a solid block next door, -1 for an open edge, null until
     *  the cells have streamed in — the world reads unloaded space as walled,
     *  which would hang a sign on thin air (wallseat.ts, Nov 2026 polish
     *  round). Off the map's rim counts as solid. */
    const wallFace = (x: number, y: number, side: number): number | null => {
      const [dx, dy] = SIDE_STEP[side] ?? [0, -1];
      const nx = x + dx;
      const ny = y + dy;
      if (!world.cellLookup(x, y)) return null;
      const off = nx < 0 || ny < 0 || nx >= world.mapSize || ny >= world.mapSize;
      if (!off && !world.cellLookup(nx, ny)) return null;
      const thin = side === 0 ? world.wallNAt(x, y) : side === 3 ? world.wallWAt(x, y) : off ? false : side === 1 ? world.wallWAt(nx, ny) : world.wallNAt(nx, ny);
      if (thin) return THIN_FACE;
      if (off || world.solidAt(nx, ny)) return 0;
      return -1;
    };
    /** The Electrical Station's sites, kept on their wall's real face. */
    const stationSeats = new WallSeats(wallFace);
    /** The freight lift's opening on Level 3 (metres). */
    const LIFT_SHUTTER_W = 2.8;
    const LIFT_SHUTTER_H = 3.0;
    let liftSill: THREE.MeshStandardMaterial | null = null;
    /** The freight lift's sill: the station's own hazard-stripe texture. */
    const liftSillMat = (): THREE.MeshStandardMaterial => {
      if (liftSill) return liftSill;
      const tex = new THREE.TextureLoader().load("/assets/station/tex/hazard-stripe-color.jpg");
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 0.6);
      liftSill = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0 });
      return liftSill;
    };
    const withStationKit = (name: string, cb: (m: THREE.Object3D) => void): void => {
      const hit = stationKit.get(name);
      if (hit) return cb(hit.clone());
      const q = stationKitWaiting.get(name);
      if (q) return void q.push(cb);
      stationKitWaiting.set(name, [cb]);
      stationKit.set(name, null);
      doorLoader.load(
        `/assets/propkit/${name}.gltf`,
        (g) => {
          warmModel(g.scene);
          stationKit.set(name, g.scene);
          for (const f of stationKitWaiting.get(name) ?? []) f(g.scene.clone());
          stationKitWaiting.delete(name);
        },
        undefined,
        () => stationKitWaiting.delete(name),
      );
    };
    /** Seat a kit model with its back flat on the group's origin (the wall's
     *  face), centred along the wall, and return its size. */
    const backToWall = (m: THREE.Object3D): THREE.Vector3 => {
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      m.position.z -= box.min.z;
      // centred across the wall too: the kit is not always centred on x
      m.position.x -= (box.min.x + box.max.x) / 2;
      return box.getSize(new THREE.Vector3());
    };
    const stationLabelText = (st: StationSite): [string, string] => {
      if (st.kind === "breaker") return [`BREAKER ${st.section} · ${st.on ? "ON" : "OFF"}`, st.on ? ON_GREEN : DOOR_RED];
      if (st.kind === "shutter") return [st.on ? "THE LIFT SHUTTER · POWERED" : `THE LIFT SHUTTER · ${stationOn}/6`, st.on ? ON_GREEN : DOOR_RED];
      const pw = stationPower.find((q) => q.section === st.section);
      const left = pw ? Math.max(0, pw.cutMs - (performance.now() - stationPowerAt)) : 0;
      return [left > 0 ? `CUTOFF ${st.section} · DEAD ${Math.ceil(left / 1000)}s` : `CUTOFF ${st.section}`, left > 0 ? "#9fd7ff" : "#ffb03d"];
    };
    const relabelStation = (st: StationSite): void => {
      const [text, tint] = stationLabelText(st);
      if (st.labelText === text) return;
      if (st.label) scene.remove(st.label);
      st.label = makeLabel(text, tint);
      st.labelText = text;
      st.labelPin = pinToGround(st.label, st.x, st.y, st.kind === "shutter" ? 3.75 : 2.3);
      scene.add(st.label);
    };
    const poseStation = (st: StationSite): void => {
      if (st.lever) st.lever.rotation.x = st.kind === "breaker" ? (st.on ? 0.45 : Math.PI - 0.45) : st.on ? Math.PI - 0.6 : 0.6;
      if (st.lamp) (st.lamp.material as THREE.MeshBasicMaterial).color.set(st.kind === "breaker" ? (st.on ? 0x3dff6a : 0xff2a2a) : st.on ? 0x4aa8ff : 0xffb03d);
      if (st.kind === "shutter") {
        // open: rolled up into its drum under the header
        const roller = st.group.getObjectByName("roller");
        if (roller) {
          roller.position.y = st.on ? LIFT_SHUTTER_H * 0.9 : 0;
          roller.scale.y = st.on ? 0.1 : 1;
        }
      }
      relabelStation(st);
    };
    /** A lever: a steel arm on a pivot with a red grip, rotating about x. */
    const makeLever = (len: number): THREE.Group => {
      const pivot = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0x6b7378, roughness: 0.45, metalness: 0.6 });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.05), steel);
      arm.position.y = len / 2;
      pivot.add(arm);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xc42020, roughness: 0.6 }));
      grip.rotation.z = Math.PI / 2;
      grip.position.y = len;
      pivot.add(grip);
      return pivot;
    };
    const makeStationSite = (kind: StationKind, section: number, x: number, y: number, side: number, on: boolean): StationSite => {
      const g = new THREE.Group();
      g.rotation.y = SIDE_ROT[side] ?? 0;
      const off = kind === "cutoff" ? 0.95 : 0;
      const st: StationSite = { kind, section, x, y, side, group: g, pin: pinToGround(g, x, y, off), on, lever: null, lamp: null, label: null, labelText: "", labelPin: null };
      // on the wall's real face, 1 cm proud: a fixed 0.16 floated a site
      // 16 cm off a bare solid block (wallseat.ts, Nov 2026 polish round)
      stationSeats.seat(g, x, y, side);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      if (kind === "breaker") {
        // a floor cabinet with the big lever on its face
        const lever = makeLever(0.42);
        lever.position.set(0, 1.0, 0.62);
        lamp.position.set(0.32, 1.35, 0.6);
        g.add(lever, lamp);
        st.lever = lever;
        st.lamp = lamp;
        withStationKit("switchgear-low", (m) => {
          // this model's panelled front is its +x side: turn it to face the room
          m.rotation.y = -Math.PI / 2;
          const size = backToWall(m);
          g.add(m);
          lever.position.set(0, Math.min(1.2, size.y * 0.62), size.z + 0.03);
          lamp.position.set(Math.min(0.35, size.x * 0.3), Math.min(1.5, size.y * 0.85), size.z + 0.02);
        });
      } else if (kind === "cutoff") {
        // a small box on the wall with a red pull handle under it
        const lever = makeLever(0.26);
        lever.position.set(0, 0.0, 0.18);
        lamp.position.set(0.16, 0.42, 0.16);
        g.add(lever, lamp);
        st.lever = lever;
        st.lamp = lamp;
        withStationKit("electrical-box-small", (m) => {
          const size = backToWall(m);
          g.add(m);
          lever.position.set(0, size.y * 0.35, size.z + 0.03);
          lamp.position.set(size.x * 0.32, size.y * 0.8, size.z + 0.02);
        });
      } else {
        // THE FREIGHT LIFT (Nov 2026 polish round — the audit's L3-08: a
        // 1.1 × 2.4 m domestic shutter, off-white, alone under a 6 m ceiling,
        // read as a garage, not the way down). The kit's shutter scaled to a
        // freight opening, painted steel, in a steel frame with a drum over
        // it, a hazard-striped sill and a call panel whose lamp is the power.
        // The Lift Hall's south wall is clear 2 cells either side of it.
        const steel = new THREE.MeshStandardMaterial({ color: 0x4a4f53, roughness: 0.55, metalness: 0.3 });
        const W = LIFT_SHUTTER_W;
        const H = LIFT_SHUTTER_H;
        const post = 0.2;
        for (const sx of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(post, H + 0.35, 0.3), steel);
          p.position.set(sx * (W / 2 + post / 2), (H + 0.35) / 2, 0.15);
          g.add(p);
        }
        const drum = new THREE.Mesh(new THREE.BoxGeometry(W + post * 2 + 0.1, 0.5, 0.42), steel);
        drum.position.set(0, H + 0.35, 0.21);
        g.add(drum);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(W + post * 2, 0.04, 0.6), liftSillMat());
        sill.position.set(0, 0.02, 0.32);
        g.add(sill);
        // the call panel beside it, its lamp the shutter's power lamp
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.06), steel);
        panel.position.set(W / 2 + post + 0.35, 1.35, 0.03);
        g.add(panel);
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
        button.rotation.x = Math.PI / 2;
        button.position.set(panel.position.x, 1.27, 0.075);
        g.add(button);
        lamp.position.set(panel.position.x, 1.45, 0.07);
        g.add(lamp);
        st.lamp = lamp;
        const sign = makeSign("sign-plate-yellow", "FREIGHT LIFT");
        // on the drum's face: the hall's ceiling is about at the drum's top
        sign.position.set(0, H + 0.19, 0.425);
        g.add(sign);
        const roller = new THREE.Group();
        roller.name = "roller";
        g.add(roller);
        withStationKit("roller-shutter--1", (m) => {
          const size = backToWall(m);
          // the kit's off-white slats, repainted in the station's grey steel
          m.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
            mm.color?.multiply(new THREE.Color(0x8a9096));
            mm.metalness = Math.min(0.3, mm.metalness ?? 0);
            mesh.material = mm;
          });
          // scaled about the origin backToWall centred it on, so it stays centred
          const wrap = new THREE.Group();
          wrap.scale.set(W / Math.max(0.01, size.x), H / Math.max(0.01, size.y), 1);
          wrap.add(m);
          roller.add(wrap);
          poseStation(st);
        });
      }
      scene.add(g);
      poseStation(st);
      return st;
    };
    const clearStation = (): void => {
      stationSeats.clear();
      for (const st of stationSites) {
        scene.remove(st.group);
        if (st.label) scene.remove(st.label);
      }
      stationSites = [];
      stationPower = [];
      stationChip = "";
      for (const f of arcFlashes) scene.remove(f.obj);
      arcFlashes.length = 0;
    };
    /** Dress the station from the server's state (welcome and travel). */
    const applyStation = (st: StationState | undefined): void => {
      clearStation();
      if (!st) return;
      stationOn = st.breakers.filter((b) => b.on).length;
      stationPower = st.power;
      stationPowerAt = performance.now();
      for (const b of st.breakers) stationSites.push(makeStationSite("breaker", b.section, b.x, b.y, b.side, b.on));
      for (const c of st.cutoffs) {
        const pw = st.power.find((q) => q.section === c.section);
        stationSites.push(makeStationSite("cutoff", c.section, c.x, c.y, c.side, !!pw && pw.cutMs > 0));
      }
      if (st.shutter) stationSites.push(makeStationSite("shutter", 0, st.shutter.x, st.shutter.y, st.shutter.side, st.shutter.open));
      applyStationPower(st.power, true);
      warmStationSound();
    };
    // THE TERROR HOTEL (Level 5): the register, the lifts, the rusty door, the
    // furnaces and the moths — hotel-scene.ts draws them from the server's
    // HotelState and answers "am I near one?".
    const hotel = new HotelScene({
      scene,
      makeLabel: (text, tint) => makeLabel(text, tint),
      pinToGround: (o, x, y, off) => pinToGround(o, x, y, off),
      reap,
      withKit: (name, cb) => withStationKit(name, cb),
      backToWall,
      groundAt: (x, y) => world.groundAt(x, y),
      ceilAt: (x, y) => world.ceilAt(x, y),
      tableNear: (x, y) => {
        let best: { x: number; y: number; d: number } | null = null;
        for (const ch of world.chunks.values()) {
          for (const p of ch.props ?? []) {
            if (!/table/.test(p.kind)) continue;
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < 1.6 && (!best || d < best.d)) best = { x: p.x, y: p.y, d };
          }
        }
        return best;
      },
      wallFace,
    });
    const applyHotel = (st: HotelState | undefined): void => {
      hotel.apply(st);
      warmHotelSound();
    };
    /** The hotel's loops, fed their nearest sources ~8 times a second. */
    let hotelSoundAt = 0;
    let whisperAt = 0;
    const HOT_ROOMS = new Set(["boiler", "pipeway", "coalstore", "rustydoor", "boilergate"]);
    const PARTY_ROOMS = new Set(["lounge", "dining"]);
    const tickHotelSound = (now: number): void => {
      if (now - hotelSoundAt < 120) return;
      hotelSoundAt = now;
      const px = player.x;
      const py = player.y;
      const sw = hotel.nearestAwake(px, py);
      updateHotelLoop("flutter", sw ? sw.d : null, sw ? wallsBetween(world, px, py, sw.x, sw.y) : 0);
      const fu = hotel.nearestFurnace(px, py);
      const fuNear = fu && fu.d < 12 ? fu : null;
      updateHotelLoop("furnace-roar", fuNear ? fuNear.d : null, fuNear ? wallsBetween(world, px, py, fuNear.x, fuNear.y) : 0);
      // a whisper in the fire, now and then, for whoever stands close to one
      if (fuNear && fuNear.d < 3 && now > whisperAt) {
        whisperAt = now + 18000 + Math.random() * 25000;
        hotelSfx("furnace-whisper", fuNear.d, 0, 0.45);
      }
      const here = world.typeAt(Math.floor(px), Math.floor(py));
      updateHotelLoop("boiler", HOT_ROOMS.has(here) ? 0 : null);
      // the party behind a door: nearest lounge or dining room within ~9 cells
      let party: number | null = null;
      if (!PARTY_ROOMS.has(here) && !HOT_ROOMS.has(here)) {
        for (let r = 3; r <= 9 && party === null; r += 3) {
          for (let a = 0; a < 8; a++) {
            const x = Math.floor(px + Math.cos((a * Math.PI) / 4) * r);
            const y = Math.floor(py + Math.sin((a * Math.PI) / 4) * r);
            if (PARTY_ROOMS.has(world.typeAt(x, y))) {
              party = r;
              break;
            }
          }
        }
      }
      updateHotelLoop("chatter", party, party === null ? 0 : 1);
    };
    // LIGHTS OUT (Level 6): the sea hatch and the Listener — lights-scene.ts
    // draws them from the server's LightsState and its frames.
    const lights = new LightsScene({
      scene,
      makeLabel: (text, tint) => makeLabel(text, tint),
      pinToGround: (o, x, y, off) => pinToGround(o, x, y, off),
      reap,
      withKit: (name, cb) => withStationKit(name, cb),
      backToWall,
      groundAt: (x, y) => world.groundAt(x, y),
      warm: (o) => warmModel(o),
      wallFace,
    });
    const applyLights = (st: LightsState | undefined): void => {
      lights.apply(st);
      warmLightsSound();
    };
    // THALASSOPHOBIA (Level 7): the subway stair and the thing below —
    // ocean-scene.ts draws them from the server's OceanState and deep frames.
    const ocean = new OceanScene({
      scene,
      makeLabel: (text, tint) => makeLabel(text, tint),
      pinToGround: (o, x, y, off) => pinToGround(o, x, y, off),
      reap,
      groundAt: (x, y) => world.groundAt(x, y),
      wallFace,
    });
    const applyOcean = (st: OceanState | undefined): void => {
      ocean.apply(st);
      warmOceanSound();
    };
    // THE CAVE SYSTEM (Level 8): the Chimney and the Burrowers — cave-scene.ts
    // draws them from the server's CaveState and burrower frames.
    const cave = new CaveScene({
      scene,
      makeLabel: (text, tint) => makeLabel(text, tint),
      pinToGround: (o, x, y, off) => pinToGround(o, x, y, off),
      reap,
      groundAt: (x, y) => world.groundAt(x, y),
      ceilAt: (x, y) => world.ceilAt(x, y),
      wallFace,
    });
    const applyCave = (st: CaveState | undefined): void => {
      cave.apply(st);
      warmCaveSound();
    };
    /** The Cave System's loops, fed ~8 times a second: THE CLICKING of the
     *  nearest Burrower (slow while it roams, fast while it hunts — it carries
     *  through rock; the warning), and THE RIVER, by its nearest water. */
    let caveSoundAt = 0;
    const tickCaveSound = (now: number): void => {
      if (now - caveSoundAt < 120) return;
      caveSoundAt = now;
      const px = player.x;
      const py = player.y;
      const b = cave.nearestBurrower(px, py);
      const hunting = b?.mode === "hunt";
      const walls = b ? wallsBetween(world, px, py, b.x, b.y) : 0;
      const pan = b ? panFor(px, py, player.yaw, b.x, b.y) : 0;
      updateCaveLoop("click", b && !hunting ? b.d : null, walls, pan);
      updateCaveLoop("click-fast", b && hunting ? b.d : null, walls, pan);
      let best: { d: number; x: number; y: number } | null = null;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      for (let dy = -12; dy <= 12; dy += 2)
        for (let dx = -12; dx <= 12; dx += 2) {
          if (world.typeAt(cx + dx, cy + dy) !== "caveriver") continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { d, x: cx + dx + 0.5, y: cy + dy + 0.5 };
        }
      updateCaveLoop("river", best ? best.d : null, best ? wallsBetween(world, px, py, best.x, best.y) : 0, best ? panFor(px, py, player.yaw, best.x, best.y) : 0);
    };
    // THE SUBURBS (Level 9): Number 9's front door and the Neighborhood
    // Watch — suburb-scene.ts draws them from the server's SuburbState and
    // watch frames.
    const suburb = new SuburbScene({
      scene,
      makeLabel: (text, tint) => makeLabel(text, tint),
      pinToGround: (o, x, y, off) => pinToGround(o, x, y, off),
      reap,
      withKit: (name, cb) => withStationKit(name, cb),
      backToWall,
      groundAt: (x, y) => world.groundAt(x, y),
    });
    /** Number 9's front door, once open, is a WAY OUT — law 5: one exit
     *  rule for every level, through exitDoors and atExitDoor (the server's
     *  2.4-cell reach). */
    let frontExit: { x: number; y: number; edge: "N" | "S" | "E" | "W"; radial: boolean } | null = null;
    const syncFrontExit = (): void => {
      if (frontExit) exitDoors = exitDoors.filter((ed) => ed !== frontExit);
      frontExit = null;
      const fd = level === 9 ? suburb.frontDoor() : null;
      if (!fd?.open) return;
      frontExit = { x: fd.x, y: fd.y, edge: "N", radial: true };
      exitDoors = [...exitDoors, frontExit];
    };
    const applySuburb = (st: SuburbState | undefined): void => {
      suburb.apply(st);
      warmSuburbSound();
      syncFrontExit();
    };
    /** The Suburbs' loops, fed ~8 times a second: THE WHISTLE of the nearest
     *  Watch while it walks its beat (the warning, carried down the street),
     *  and its STEPS — quick and hard while it hunts. */
    let suburbSoundAt = 0;
    const tickSuburbSound = (now: number): void => {
      if (now - suburbSoundAt < 120) return;
      suburbSoundAt = now;
      const w = suburb.nearestWatch(player.x, player.y);
      const hunting = w?.mode === "hunt";
      const walls = w ? wallsBetween(world, player.x, player.y, w.x, w.y) : 0;
      const pan = w ? panFor(player.x, player.y, player.yaw, w.x, w.y) : 0;
      updateSuburbLoop("whistle", w && !hunting ? w.d : null, walls, pan);
      // steps only while it really walks: a Watch at a light's edge or
      // knocking at a door stands still, and so do its feet (Nov 2026)
      const walking = !!w && w.speed > 0.25;
      updateSuburbLoop("steps", w && walking && !hunting ? w.d : null, walls, pan);
      updateSuburbLoop("steps-fast", w && walking && hunting ? w.d : null, walls, pan);
    };
    /** In a crawlspace you can't stand: crouched on the way in, kept crouched
     *  until you're out, then up again unless you're holding crouch. */
    let crawlForced = false;
    /** UNDER THE SEA the world is not the grey day above it: with the camera
     *  below the waterline the fog closes in and goes green-black, darker and
     *  nearer the deeper you are — at the bottom of the square you see ten
     *  metres. Back up through the surface, the day comes back. */
    const OCEAN_UNDER = new THREE.Color(0x10221f);
    let oceanUnder = false;
    const tickOceanFog = (): void => {
      const fog = scene.fog as THREE.Fog;
      const bg = scene.background as THREE.Color;
      const y = camera.position.y;
      // the swimmer's own "head under" (an eye at the surface sits a hair
      // below the waterline, and that is not diving); a flyer by the camera
      if (ctl.fly.on ? y < -0.05 : submerged) {
        const k = Math.min(1, -y / 24);
        fog.color.copy(OCEAN_UNDER).multiplyScalar(1 - 0.7 * k);
        bg.copy(fog.color);
        fog.near = 0.5;
        fog.far = 18 - 8 * k;
        oceanUnder = true;
      } else if (oceanUnder) {
        oceanUnder = false;
        applyLevelEnvironment(scene, "ocean");
      }
    };
    /** The hum of it circling, fed ~8 times a second: yours loudest, somebody
     *  else's by distance. */
    let oceanSoundAt = 0;
    const tickOceanSound = (now: number): void => {
      if (now - oceanSoundAt < 120) return;
      oceanSoundAt = now;
      const n = ocean.nearest(player.x, player.y);
      updateOceanLoop("hum", n ? n.d : null, 0, 0);
    };
    /** Lights Out's loops, fed their sources ~8 times a second: the sea behind
     *  the hatch (its direction is how you find it) and the Listener's breath.
     *  Now and then, footsteps far off that aren't yours. */
    let lightsSoundAt = 0;
    let farStepsAt = 0;
    const tickLightsSound = (now: number): void => {
      if (now - lightsSoundAt < 120) return;
      lightsSoundAt = now;
      const px = player.x;
      const py = player.y;
      const h = lights.hatchState();
      if (h) {
        const d = Math.hypot(h.x - px, h.y - py);
        updateLightsLoop("surf", h.open ? null : d, wallsBetween(world, px, py, h.x, h.y), panFor(px, py, player.yaw, h.x, h.y));
      } else updateLightsLoop("surf", null);
      const li = lights.nearestListener(px, py);
      updateLightsLoop("breath", li ? li.d : null, li ? wallsBetween(world, px, py, li.x, li.y) : 0, li ? panFor(px, py, player.yaw, li.x, li.y) : 0);
      if (!farStepsAt) farStepsAt = now + 30000 + Math.random() * 40000;
      if (now > farStepsAt) {
        farStepsAt = now + 45000 + Math.random() * 60000;
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 8;
        lightsSfx("far-steps", r, 2, panFor(px, py, player.yaw, px + Math.cos(a) * r, py + Math.sin(a) * r), 0.5);
      }
    };
    // THE ABANDONED OFFICE (Level 4): THE STAIRWELL DOOR — heavy grey steel with
    // wired glass, and beside it a badge reader whose light is red until the
    // security keycard is badged, then green for everyone. The server's
    // OfficeState is the whole truth about it.
    type OfficeDoor = { x: number; y: number; side: number; open: boolean; group: THREE.Group; pin: GroundPin; led: THREE.Mesh; label: THREE.Sprite | null; labelPin: GroundPin | null };
    let officeDoor: OfficeDoor | null = null;
    const relabelOfficeDoor = (d: OfficeDoor): void => {
      if (d.label) scene.remove(d.label);
      d.label = makeLabel(d.open ? "THE STAIRWELL DOOR · OPEN" : "THE STAIRWELL DOOR · LOCKED", d.open ? ON_GREEN : DOOR_RED);
      d.labelPin = pinToGround(d.label, d.x, d.y, 2.9);
      scene.add(d.label);
      (d.led.material as THREE.MeshBasicMaterial).color.set(d.open ? 0x3dff6a : 0xff2a2a);
    };
    const clearOffice = (): void => {
      if (!officeDoor) return;
      scene.remove(officeDoor.group);
      if (officeDoor.label) scene.remove(officeDoor.label);
      officeDoor = null;
    };
    const makeOfficeDoor = (x: number, y: number, side: number, open: boolean): OfficeDoor => {
      const g = new THREE.Group();
      g.rotation.y = SIDE_ROT[side] ?? 0;
      const [dx, dy] = SIDE_D[side] ?? [0, -1];
      const into = (CELL / 2 - 0.16) / CELL;
      // the reader: a small black box at shoulder height, beside the door
      const reader = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.035), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.3 }));
      reader.position.set(0.88, 1.35, 0.02);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      led.position.set(0.88, 1.41, 0.04);
      g.add(reader, led);
      withStationKit("steel-door-swing--3", (m) => {
        backToWall(m);
        g.add(m);
      });
      scene.add(g);
      const d: OfficeDoor = { x, y, side, open, group: g, pin: pinToGround(g, x + dx * into, y + dy * into, 0), led, label: null, labelPin: null };
      // on the wall's real face: the fixed 0.16 floated it 16 cm off a bare
      // solid block (wallseat.ts, Nov 2026 polish round)
      stationSeats.seat(g, x, y, side);
      relabelOfficeDoor(d);
      return d;
    };
    const placeOfficeDoor = (sd: { x: number; y: number; side: number; open: boolean } | null): void => {
      if (!sd) return;
      if (officeDoor && officeDoor.x === sd.x && officeDoor.y === sd.y) {
        if (officeDoor.open !== sd.open) {
          officeDoor.open = sd.open;
          relabelOfficeDoor(officeDoor);
          if (sd.open) doorOpenSound();
        }
        return;
      }
      clearOffice();
      officeDoor = makeOfficeDoor(sd.x, sd.y, sd.side, sd.open);
    };
    /** Dress the office from the server's state (welcome and travel). */
    const applyOffice = (st: OfficeState | undefined): void => {
      clearOffice();
      if (!st) return;
      placeOfficeDoor(st.stairdoor);
    };
    /** The station's power: which sections are live. A change rebuilds every
     *  loaded chunk (the lamps and the water are baked into them). */
    const applyStationPower = (power: { section: number; powered: boolean; cutMs: number; darkMs: number }[], quiet = false): void => {
      const mine = world.sectionAt(Math.floor(player.x), Math.floor(player.y));
      const was = stationPower.find((q) => q.section === mine);
      stationPower = power;
      stationPowerAt = performance.now();
      const live: boolean[] = [];
      for (const q of power) live[q.section] = q.powered;
      // ONLY the chunks the change can touch (Backrooms law 9, Oct 2026 — it
      // used to rebuild EVERY loaded chunk on every power frame, and a pulled
      // cutoff re-sends one a second). A chunk bakes lamps up to 3 cells past
      // its own edge, so it is redrawn only when a cell of a changed section
      // lies inside that margin.
      const changed = new Set(setStationPower(live));
      if (changed.size) {
        const n = world.chunkSize;
        const M = 3;
        for (const k of world.meshes.keys()) {
          const [cx, cy] = k.split(",").map(Number);
          let hit = false;
          for (let y = cy * n - M; y < cy * n + n + M && !hit; y++) {
            for (let x = cx * n - M; x < cx * n + n + M; x++) {
              if (changed.has(world.sectionAt(x, y))) {
                hit = true;
                break;
              }
            }
          }
          if (hit) rebuildQueue.add(k);
        }
      }
      for (const st of stationSites) {
        if (st.kind !== "cutoff") continue;
        const pw = power.find((q) => q.section === st.section);
        st.on = !!pw && pw.cutMs > 0;
        poseStation(st);
      }
      const now = power.find((q) => q.section === mine);
      if (quiet || !was || !now || was.powered === now.powered) return;
      if (!now.powered) {
        stationSfx("power-down");
        note(now.cutMs > 0 ? "the section dies. the water's dead — cross it now." : "blackout. this section's lights are gone.");
      } else {
        stationSfx("power-up");
        note("the power's back. the water's live again.");
      }
    };
    // THE ARCS: a crackle of light at the panel a second before, then the
    // flash — a bright burst and a jagged bolt out into the room.
    const arcFlashes: { obj: THREE.Object3D; until: number; born: number; fire: boolean }[] = [];
    let arcGlowTex: THREE.Texture | null = null;
    const arcGlow = (): THREE.Texture => {
      if (arcGlowTex) return arcGlowTex;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const c2 = cv.getContext("2d")!;
      const gr = c2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.25, "rgba(170,215,255,0.9)");
      gr.addColorStop(1, "rgba(60,120,255,0)");
      c2.fillStyle = gr;
      c2.fillRect(0, 0, 64, 64);
      arcGlowTex = new THREE.CanvasTexture(cv);
      return arcGlowTex;
    };
    const arcAt = (x: number, y: number, side: number, fire: boolean): void => {
      const [dx, dy] = SIDE_D[side] ?? [0, -1];
      const into = (CELL / 2 - 0.3) / CELL;
      const px = x + dx * into;
      const py = y + dy * into;
      const g = new THREE.Group();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arcGlow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(fire ? 2.8 : 0.7);
      g.add(glow);
      if (fire) {
        // the bolt: a zigzag from the panel out to where it strikes
        const pts: THREE.Vector3[] = [];
        const reach = 1.4 * CELL * 0.6;
        for (let k = 0; k <= 7; k++) {
          const t = k / 7;
          pts.push(new THREE.Vector3((Math.random() - 0.5) * 0.35 * Math.sin(t * Math.PI), -0.9 * t + (Math.random() - 0.5) * 0.2, 0));
          pts[k].z = t * reach;
        }
        const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd8ecff, transparent: true, blending: THREE.AdditiveBlending }));
        bolt.rotation.y = SIDE_ROT[side] ?? 0;
        g.add(bolt);
      }
      pinToGround(g, px, py, 1.2);
      scene.add(g);
      const now = performance.now();
      arcFlashes.push({ obj: g, born: now, until: now + (fire ? 520 : 1100), fire });
      const dist = Math.hypot(px - player.x, py - player.y);
      stationSfx(fire ? "arc-fire" : "arc-warn", dist, wallsBetween(world, player.x, player.y, px, py), fire ? 1 : 0.8);
      if (fire && dist < 4) fallShake = Math.max(fallShake, 0.35);
    };
    const tickStation = (now: number): void => {
      for (let i = arcFlashes.length - 1; i >= 0; i--) {
        const f = arcFlashes[i];
        if (now >= f.until) {
          scene.remove(f.obj);
          // each flash made its own material (and a strike its bolt's line);
          // free them, but never the shared glow texture (Nov 2026)
          f.obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if ((m as unknown as THREE.Line).isLine) m.geometry?.dispose();
            const mat = m.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
            else mat?.dispose();
          });
          arcFlashes.splice(i, 1);
          continue;
        }
        const life = (now - f.born) / (f.until - f.born);
        // the warning flickers; the strike blazes and fades
        const a = f.fire ? 1 - life : Math.random() < 0.55 ? 0.9 : 0.15;
        f.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number };
          if (m && "opacity" in m) m.opacity = a;
        });
      }
      if (level !== 3) return;
      tickStationWater(now);
      for (const st of stationSites) {
        if (st.lamp && st.kind === "breaker" && !st.on) st.lamp.visible = Math.floor(now / 500) % 2 === 0;
        if (st.kind === "cutoff" && st.on) relabelStation(st);
        if (!st.label) continue;
        const mat = st.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (26 - Math.hypot(st.x - player.x, st.y - player.y)) / 10));
        st.label.visible = mat.opacity > 0.02;
      }
      const mine = world.sectionAt(Math.floor(player.x), Math.floor(player.y));
      const pw = stationPower.find((q) => q.section === mine);
      const gone = now - stationPowerAt;
      const here = !pw
        ? ""
        : pw.cutMs - gone > 0
          ? ` · SECTION ${mine} CUT ${Math.ceil((pw.cutMs - gone) / 1000)}s`
          : pw.darkMs - gone > 0 || !pw.powered
            ? ` · SECTION ${mine} BLACKOUT`
            : ` · SECTION ${mine} LIVE`;
      stationChip = `BREAKERS ${stationOn}/6${here}`;
    };
    /** Who's standing at which station object (E). */
    const stationSiteNear = (): StationSite | null => {
      let best: StationSite | null = null;
      let bd = Infinity;
      for (const st of stationSites) {
        const d = Math.hypot(st.x - player.x, st.y - player.y);
        if (d < (st.kind === "shutter" ? 2.8 : 1.8) && d < bd) {
          best = st;
          bd = d;
        }
      }
      return best;
    };
    let lastShockNote = 0;

    /** A drain hatch: a red ring on the floor round an iron grate, and under
     *  it, once it's open, the dark of the way down. */
    const makeHatch = (x: number, y: number, open: boolean): THREE.Group => {
      const g = new THREE.Group();
      const iron = new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.7, metalness: 0 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.95, 48), new THREE.MeshBasicMaterial({ color: 0xd42a2a }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      if (open) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.66, 32), new THREE.MeshBasicMaterial({ color: 0x050505 }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.y = 0.02;
        g.add(hole);
      }
      const grate = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.045, 6, 32), iron);
      rim.rotation.x = Math.PI / 2;
      grate.add(rim);
      for (let k = -3; k <= 3; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 1.32 * Math.sqrt(Math.max(0, 1 - (k / 3.6) ** 2))), iron);
        bar.position.x = k * 0.17;
        grate.add(bar);
      }
      grate.position.y = 0.05;
      // open: the grate lies beside the hole it came out of
      if (open) grate.position.set(1.3, 0.05, 0.3);
      g.add(grate);
      pinToGround(g, x, y, 0);
      scene.add(g);
      return g;
    };
    /** A cartridge fuse: amber glass between two brass caps, lying down. */
    // ONE set of fuse parts, shared by every fuse that streams in and never
    // disposed: a fresh set per fuse leaked GPU memory each time one came back
    // into view (Nov 2026 validation run)
    let fuseParts: { brass: THREE.Material; glass: THREE.Material; body: THREE.BufferGeometry; cap: THREE.BufferGeometry } | null = null;
    const makeFuse = (x: number, y: number): THREE.Group => {
      const g = new THREE.Group();
      fuseParts ??= {
        brass: new THREE.MeshStandardMaterial({ color: 0xb8902e, roughness: 0.4, metalness: 0 }),
        glass: new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0x7a4a10, roughness: 0.2, transparent: true, opacity: 0.85 }),
        body: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 12),
        cap: new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12),
      };
      const body = new THREE.Mesh(fuseParts.body, fuseParts.glass);
      const capA = new THREE.Mesh(fuseParts.cap, fuseParts.brass);
      const capB = capA.clone();
      capA.position.y = 0.12;
      capB.position.y = -0.12;
      const inner = new THREE.Group();
      inner.add(body, capA, capB);
      inner.rotation.z = Math.PI / 2;
      g.add(inner);
      pinToGround(g, x, y, 0.45);
      scene.add(g);
      return g;
    };
    // THE SECURITY KEYCARD (Level 4's key): the card model, held upright and
    // turning like the key, a hand's width tall so a beam catches it.
    let keycardModel: THREE.Object3D | null = null;
    const keycardWaiting: THREE.Group[] = [];
    const dressKeycard = (g: THREE.Group): void => {
      if (!keycardModel) {
        keycardWaiting.push(g);
        if (keycardWaiting.length === 1)
          doorLoader.load("/assets/office/keycard.glb", (gl) => {
            const m = gl.scene;
            m.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(m);
            const s = box.getSize(new THREE.Vector3());
            m.scale.setScalar(0.15 / Math.max(s.x, s.y, s.z));
            const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
            m.position.sub(c);
            warmModel(m);
            keycardModel = m;
            for (const w of keycardWaiting.splice(0)) w.add(m.clone());
          });
        return;
      }
      g.add(keycardModel.clone());
    };
    const makeKey = (x: number, y: number): THREE.Group => {
      const g = new THREE.Group();
      if (level === 9) {
        // THE HOUSE KEY, its tag face up
        g.add(makeHouseKey());
        g.position.set(x * CELL, world.groundAt(x, y), y * CELL); // re-read every frame (the key's bob)
        scene.add(g);
        return g;
      }
      if (level === 8) {
        // THE CLIMBING ROPE, coiled where somebody dropped it
        g.add(makeRope());
        g.position.set(x * CELL, world.groundAt(x, y), y * CELL); // re-read every frame (the key's bob)
        scene.add(g);
        return g;
      }
      if (level === 7) {
        // THE DIVING HELMET, sitting on its roof
        g.add(makeHelmet());
        g.position.set(x * CELL, world.groundAt(x, y) + 0.5, y * CELL); // re-read every frame (the key's bob)
        scene.add(g);
        return g;
      }
      if (level === 6) {
        // THE HANDWHEEL, lying where somebody left it
        withStationKit("valve-wheel", (m) => {
          m.rotation.x = 0.3;
          g.add(m);
        });
        g.position.set(x * CELL, world.groundAt(x, y) + 0.5, y * CELL); // re-read every frame (the key's bob)
        scene.add(g);
        return g;
      }
      if (level === 4) {
        dressKeycard(g);
        g.position.set(x * CELL, world.groundAt(x, y) + 0.5, y * CELL); // re-read every frame (the key's bob)
        scene.add(g);
        return g;
      }
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.9 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), brass);
      shaft.rotation.z = Math.PI / 2;
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 14), brass);
      bow.position.x = -0.15;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), brass);
      tooth.position.set(0.1, -0.04, 0);
      g.add(shaft, bow, tooth);
      g.position.set(x * CELL, world.groundAt(x, y) + 0.5, y * CELL); // re-read every frame (the key's bob)
      scene.add(g);
      return g;
    };

    // THE DOOR: heavy, fixed, wrong-material, keyhole where a handle should be.
    //
    // THE MODEL (Josh, Aug 2026: "use the door model and door open sound for
    // the doors in back rooms that lead to other levels"). Both level
    // transitions come through here — THE DOOR on Level 0 and THE LANDING
    // back from the Poolrooms — so one implementation dresses both.
    //
    // The source GLB swings 0° → 90° at t=3.13s and then CLOSES again by
    // 7.47s, so the open is the first half only, driven by hand through
    // mixer.setTime() and parked at the peak. Played whole, the door would
    // shut itself in your face.
    //
    // A REAL DOOR IN THE WALL (Josh, Sep 2026: "make the entrance and exit
    // door an actual door against the wall use any of the door assets … make
    // the actual exit a door to unlock with a key"). The models are the prop
    // kit's own doors, from his downloads through scripts/props/intake.mjs:
    // the worn white panelled door for THE DOOR on Level 0, the teal steel
    // door for The Landing. Each carries an "open" clip that ENDS open, so
    // the whole clip plays and parks at its last frame.
    const DOOR_OPEN_T = 3.13; // the OLD model's peak (kept for the fallback's sake)
    const doorOpenSound = (): void => gearSfx("door-open");
    type DoorProto = {
      url: string;
      scene: THREE.Group;
      clip: THREE.AnimationClip | null;
      /** Clip time at which the leaf is fully open, and how fast to get there. */
      openT: number;
      speed: number;
      /** The frame's size (m) and the opening's (the leaf at rest). */
      frame: THREE.Vector3;
      hole: THREE.Vector3;
    };
    let doorProto: DoorProto | null = null;
    let doorProtoLoading = "";
    const doorModelUrl = (): string =>
      level === 1 ? "/assets/propkit/steel-door-swing--4.gltf" : "/assets/propkit/wood-door-swing--1.gltf";
    const doorLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const loadDoorModel = (): void => {
      const url = doorModelUrl();
      if (doorProtoLoading === url || doorProto?.url === url) return;
      doorProtoLoading = url;
      doorLoader.load(
        url,
        (g) => {
          if (doorProtoLoading !== url) return; // a travel asked for another door since
          doorProtoLoading = "";
          const model = g.scene;
          warmModel(model); // programs + textures ready before first sight
          model.updateMatrixWorld(true);
          // The kit builds every prop in metres, feet on y=0, centred on x/z.
          const frame = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
          const leafNode = model.getObjectByName("leaf");
          const hole = leafNode ? new THREE.Box3().setFromObject(leafNode).getSize(new THREE.Vector3()) : frame.clone().multiplyScalar(0.85);
          model.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            // The scene is lit by one flashlight over vertex-coloured walls, so
            // a fully unlit door reads as a black hole in the corridor. A faint
            // emissive is the same trick the old slab used.
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat?.isMeshStandardMaterial) {
              mat.emissive = new THREE.Color(0x1a1c20);
              mat.metalness = 0;
            }
          });
          const clip = g.animations.find((a) => a.name === "open") ?? g.animations?.[0] ?? null;
          doorProto = { url, scene: model, clip, openT: clip ? clip.duration : DOOR_OPEN_T, speed: 1, frame, hole };
          // A door already built from the fallback gets re-dressed in place.
          if (doorSite) {
            scene.remove(doorSite.group);
            doorSite.group = makeDoor(doorSite.x, doorSite.y, doorSite.open);
            placeDoorLabel();
          }
        },
        undefined,
        () => { /* fall back to the built slab below — never block the run */ },
      );
    };
    let doorSite: {
      x: number;
      y: number;
      open: boolean;
      group: THREE.Group;
      label: THREE.Sprite;
      /** Unused since the doors went into the wall (the outline rides the
       *  door's own group); kept so teardown stays a no-op for it. */
      outline: THREE.Object3D | null;
      /** A door whose sign should stay hidden (none do now). */
      quiet: boolean;
      mixer?: THREE.AnimationMixer;
      /** Where the swing has got to, in clip seconds. */
      t?: number;
      /** Driving toward the open pose (false = parked). */
      swinging?: boolean;
      /** The Landing (the way home), not THE DOOR. */
      back?: boolean;
    } | null = null;
    const doorSignText = (back: boolean, open: boolean): string =>
      back ? "THE LANDING — WAY IN & OUT" : open ? "THE DOOR — TO LEVEL 1 · OPEN" : "THE DOOR — TO LEVEL 1 · LOCKED";
    /** The sign hangs over the door wherever the door ended up. */
    const placeDoorLabel = (): void => {
      if (!doorSite) return;
      const g = doorSite.group;
      doorSite.label.position.set(g.position.x, g.position.y + (doorProto?.frame.y ?? 2.4) + 0.55, g.position.z);
    };
    // ---- How big is the room I'm standing in? -----------------------------
    // Feeds the proximity voice's reverb (Josh, Aug 2026: "echo in big
    // rooms"). Eight rays out from the listener, stopped by the first solid
    // cell; the mean reach is the room's radius, normalised into 0..1.
    // Re-measured a few times a second and cached — this runs inside the
    // render loop and 8 short grid marches are cheap, but not free.
    const OPEN_RAYS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    });
    const OPEN_MAX = 16; // cells; past this it is "a big room" either way
    let opennessAt = 0;
    let opennessVal = 0;
    /** How far a ray gets before it meets a wall. THIN WALLS, not solid
     *  blocks: Level 0's rooms are made of wallN/wallW edges and barely any
     *  cell is `solid`, so a solidAt-only march sailed through every partition
     *  and measured 92% of the map as one enormous hall (checked against the
     *  real sector — the crossfade would have been stuck wide open). */
    const rayReach = (dx: number, dy: number): number => {
      let cx = Math.floor(player.x);
      let cy = Math.floor(player.y);
      for (let step = 1; step <= OPEN_MAX * 3; step++) {
        const t = step / 3; // third-of-a-cell steps: never skip a boundary
        const nx = Math.floor(player.x + dx * t);
        const ny = Math.floor(player.y + dy * t);
        if (nx === cx && ny === cy) continue;
        if (nx !== cx) {
          if (world.wallWAt(Math.max(cx, nx), cy) || world.solidAt(nx, cy)) return t;
          cx = nx;
        }
        if (ny !== cy) {
          if (world.wallNAt(cx, Math.max(cy, ny)) || world.solidAt(cx, ny)) return t;
          cy = ny;
        }
      }
      return OPEN_MAX;
    };
    const roomOpenness = (): number => {
      const now = performance.now();
      if (now - opennessAt < 300) return opennessVal;
      opennessAt = now;
      let total = 0;
      for (const [dx, dy] of OPEN_RAYS) total += Math.min(rayReach(dx, dy), OPEN_MAX);
      const mean = total / OPEN_RAYS.length;
      // Thresholds set from the measured distribution on the real maps, not by
      // eye: a plain room sits near 2 cells of mean reach, the big halls and
      // the flooded Poolrooms chambers run 5+.
      opennessVal = Math.max(0, Math.min(1, (mean - 2.2) / 5.5));
      return opennessVal;
    };

    /** Which way a door at this cell should FACE. The model stands in the XZ
     *  plane with its width along X, so it wants the axis you can WALK
     *  through: a door across a north-south corridor is turned 90°. Without
     *  this it always faced the same way and could end up flat against the
     *  wall it is supposed to be set into (Josh: "make sure they are properly
     *  placed"). Falls back to unrotated when the geometry is ambiguous or the
     *  chunk hasn't streamed in yet. */
    const doorYaw = (x: number, y: number): number => {
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      const openNS = (world.solidAt(cx, cy - 1) ? 0 : 1) + (world.solidAt(cx, cy + 1) ? 0 : 1);
      const openEW = (world.solidAt(cx - 1, cy) ? 0 : 1) + (world.solidAt(cx + 1, cy) ? 0 : 1);
      // More open north-south ⇒ you pass along Z ⇒ the leaf spans X, which is
      // the model's own resting orientation. The other way round turns it.
      return openEW > openNS ? Math.PI / 2 : 0;
    };
    /** AGAINST THE WALL: the nearest wall edge within two cells of the door's
     *  cell, and the door set flush to it facing into the room. Null when
     *  nothing is near (or the chunk hasn't streamed) — then the door stands
     *  free in its cell, turned across the way through, as before. */
    const wallMount = (x: number, y: number): { px: number; pz: number; ground: number; yaw: number } | null => {
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      const OFF = 0.26; // wall face (0.15) + half the frame's depth, a hair proud
      let best: { px: number; pz: number; ground: number; yaw: number; d: number } | null = null;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (world.solidAt(gx, gy) || !world.cellLookup(gx, gy)) continue;
          const ground = world.groundAt(gx + 0.5, gy + 0.5);
          const base = Math.hypot(dx, dy);
          const edges: [boolean, number, number, number][] = [
            [world.wallNAt(gx, gy) || world.solidAt(gx, gy - 1), (gx + 0.5) * CELL, gy * CELL + OFF, 0],
            [world.wallNAt(gx, gy + 1) || world.solidAt(gx, gy + 1), (gx + 0.5) * CELL, (gy + 1) * CELL - OFF, Math.PI],
            [world.wallWAt(gx, gy) || world.solidAt(gx - 1, gy), gx * CELL + OFF, (gy + 0.5) * CELL, Math.PI / 2],
            [world.wallWAt(gx + 1, gy) || world.solidAt(gx + 1, gy), (gx + 1) * CELL - OFF, (gy + 0.5) * CELL, -Math.PI / 2],
          ];
          for (const [has, px, pz, yaw] of edges) {
            if (!has) continue;
            const d = base + Math.hypot(px / CELL - x, pz / CELL - y) * 0.01;
            if (!best || d < best.d) best = { px, pz, ground, yaw, d };
          }
        }
      }
      return best;
    };
    /** Doors built before the chunks round them streamed (the server sends a
     *  door from 40 cells; chunks load only a couple out), still waiting for
     *  a wall: each is retried every frame until one is there, or THE DOOR
     *  stood free in mid-cell for good (Nov 2026 polish round). */
    const unmountedDoors = new Map<THREE.Group, { x: number; y: number }>();
    /** Stand a door group where it belongs: in the wall if there is one near. */
    const placeDoor = (g: THREE.Group, x: number, y: number): void => {
      const m = wallMount(x, y);
      if (m) {
        g.position.set(m.px, m.ground, m.pz);
        g.rotation.y = m.yaw;
        unmountedDoors.delete(g);
      } else {
        g.position.set(x * CELL, world.groundAt(x, y), y * CELL);
        g.rotation.y = doorYaw(x, y);
        unmountedDoors.set(g, { x, y });
      }
    };
    const retryDoorMounts = (): void => {
      for (const [g, at] of unmountedDoors) {
        if (!g.parent) unmountedDoors.delete(g); // torn down meanwhile
        else if (wallMount(at.x, at.y)) placeDoor(g, at.x, at.y);
      }
    };
    /** The red outline, and what shows through the opening once it's open:
     *  the pool's pale water beyond THE DOOR, the yellow of Level 0 beyond The
     *  Landing. Both ride the door's own group, so they follow it anywhere. */
    const dressDoor = (g: THREE.Group, frame: THREE.Vector3, hole: THREE.Vector3): void => {
      const outline = redDoorOutline(frame.x + 0.12, frame.y + 0.08);
      outline.position.set(0, -0.02, frame.z / 2 + 0.03);
      g.add(outline);
      const beyond = new THREE.Mesh(
        new THREE.PlaneGeometry(hole.x * 0.96, hole.y * 0.98),
        new THREE.MeshBasicMaterial({ color: level === 1 ? 0xe2cf7e : 0x9fd7d2, fog: false }),
      );
      beyond.position.set(0, hole.y / 2, -0.05);
      g.add(beyond);
    };
    /** The model door. Returns null until the GLB is in. */
    const makeModelDoor = (x: number, y: number, open: boolean): THREE.Group | null => {
      if (!doorProto || doorProto.url !== doorModelUrl()) return null;
      const g = new THREE.Group();
      const model = doorProto.scene.clone(true);
      g.add(model);
      dressDoor(g, doorProto.frame, doorProto.hole);
      placeDoor(g, x, y);
      scene.add(g);
      if (doorProto.clip) {
        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(doorProto.clip);
        // ONCE, and held: a looping clip set to exactly its own length wraps
        // to frame 0 — an OPEN door drawn shut
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        // Arriving at an already-open door snaps to the pose, silently: the
        // sound belongs to the moment it moves, not to walking up to it.
        const t = open ? doorProto.openT : 0;
        mixer.setTime(t);
        if (doorSite) {
          doorSite.mixer = mixer;
          doorSite.t = t;
          doorSite.swinging = false;
        } else {
          pendingDoorMixer = { mixer, t };
        }
      }
      return g;
    };
    /** makeDoor runs before doorSite exists on the first build, so the mixer
     *  it creates is parked here and adopted a line later. */
    let pendingDoorMixer: { mixer: THREE.AnimationMixer; t: number } | null = null;
    const makeDoor = (x: number, y: number, open: boolean): THREE.Group => {
      const fromModel = makeModelDoor(x, y, open);
      if (fromModel) return fromModel;
      loadDoorModel();
      const g = new THREE.Group();
      // NOT METAL, however much a steel door wants to be. Metalness reflects an
      // ENVIRONMENT MAP, and this scene has none — the lighting is baked into
      // vertex colours with a single flashlight — so metalness 0.75 had nothing
      // to reflect and the door rendered as a black slab (Josh: "the door is
      // black"). Non-metal with a faint emissive picks up the same ambient the
      // hazmat suits do, and the cold grey against all that yellow still reads
      // as the one object in Level 0 made of the wrong material.
      const steel = new THREE.MeshStandardMaterial({
        color: 0x8d9095,
        roughness: 0.5,
        metalness: 0,
        emissive: 0x23262b,
      });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.15, 0.14), steel);
      slab.position.y = 1.08;
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.34, 2.4, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0x64686e,
          roughness: 0.72,
          metalness: 0,
          emissive: 0x191b1f,
        }),
      );
      frame.position.set(0, 1.2, -0.04);
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10),
        new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 }),
      );
      hole.rotation.x = Math.PI / 2;
      hole.position.set(0.34, 1.0, 0.07);
      g.add(frame, slab, hole);
      if (open) {
        // Opened, and staying open: the slab swings and something pale and wet
        // shows through the gap.
        slab.rotation.y = -1.15;
        slab.position.x = -0.5;
        const beyond = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2.15),
          new THREE.MeshBasicMaterial({ color: 0x9fd7d2 }),
        );
        beyond.position.set(0, 1.08, -0.06);
        g.add(beyond);
      }
      const outline = redDoorOutline(1.46, 2.46);
      outline.position.set(0, -0.02, 0.1);
      g.add(outline);
      // ON ITS FLOOR — the door cell sits at -0.5m in A3, and a door based
      // at y=0 floated half a metre over the carpet (part of Josh's "the
      // door is there and I click E, I just don't see anything").
      g.position.set(x * CELL, world.groundAt(x, y), y * CELL);
      scene.add(g);
      return g;
    };

    // Fallen bodies: the hazmat avatar, lying where they fell — over its own
    // dried blood pool (deterministic from the body id, so latecomers and
    // revisits all draw the same stain).
    const bodyMap = new Map<
      number,
      { x: number; y: number; avatar: PeerAvatar; seenAt: number; pool: THREE.Mesh | null }
    >();
    const makeBody = (x: number, y: number, name: string, suit: string): PeerAvatar => {
      const a = makeAvatar(scene, name, suit);
      pinToGround(a.group, x, y, 0.18);
      a.group.rotation.x = -Math.PI / 2; // face-up ragdoll rest
      a.group.rotation.z = Math.random() * 0.6 - 0.3;
      return a;
    };

    // ---- THE RAGDOLL (Aug 2026) -------------------------------------------
    // A death event replaces the body with a seeded verlet flail: thrown by
    // whatever killed them, splattering what it hits, settling at the
    // server's rest spot — then the static corpse takes over forever. The
    // matching bodyMap entry stays HIDDEN while its ragdoll is still flying.
    interface ActiveRagdoll {
      userId: number;
      group: THREE.Group;
      rag: Ragdoll | null;
      rx: number;
      ry: number;
      startedAt: number;
    }
    const ragdolls: ActiveRagdoll[] = [];
    const MAX_RAGDOLLS = 6;
    /** While I'm the one dying: the send-off window before the red screen. */
    let dying = false;
    // LAW 12: the orbit round the one you watch, and the ghost's key
    let specYaw = 0;
    let specPitch = 0.38;
    let specCamSentAt = 0;
    let specCamSentYaw = NaN;
    let ghostKey = false;
    /** Spectators speaking to ME: where their camera hangs round me. */
    const ghostsTalking = new Map<number, { yaw: number; name: string }>();
    let lastGhostNote = 0;
    leaveSpectate = (): void => {
      net?.specLeave();
      spec = null;
      specOn = false;
      leavingOnPurpose = true;
      onExit();
    };
    let deathCam: { x: number; y: number; z: number; rag: ActiveRagdoll } | null = null;
    const finishRagdoll = (r: ActiveRagdoll): void => {
      scene.remove(r.group);
      const i = ragdolls.indexOf(r);
      if (i !== -1) ragdolls.splice(i, 1);
      // Reveal the corpse that was waiting under it.
      for (const [, c] of bodyMap) {
        if (!c.avatar.group.visible && Math.hypot(c.x - r.rx, c.y - r.ry) < 0.8) c.avatar.group.visible = true;
      }
      if (deathCam?.rag === r) deathCam = null;
    };
    const spawnRagdoll = (ev: {
      id: number;
      x: number;
      y: number;
      rx: number;
      ry: number;
      dir: number;
      power: number;
      seed: number;
      suit: string;
      h: number;
    }): ActiveRagdoll => {
      // The server's heading, for EVERYONE — the victim's own client used to
      // seed with live player.yaw while witnesses used the last wire heading
      // (or nothing at all), so the "identical flail" started from different
      // facings per observer. One appearance, every observer.
      const heading = ev.h;
      const feetY = world.groundAt(ev.x, ev.y);
      const entry: ActiveRagdoll = {
        userId: ev.id,
        group: null as unknown as THREE.Group,
        rag: null,
        rx: ev.rx,
        ry: ev.ry,
        startedAt: performance.now(),
      };
      entry.group = makeRagdollBody(scene, ev.suit, ev.x, ev.y, feetY, heading, (model) => {
        entry.rag = createRagdoll({
          world,
          model,
          dir: ev.dir,
          power: ev.power,
          seed: ev.seed,
          restX: ev.rx,
          restY: ev.ry,
          onImpact: (i) => {
            bloodImpact(world, scene, i);
            // The thud, if you're close enough to deserve it.
            const d = Math.hypot(i.x / CELL - player.x, i.z / CELL - player.y);
            if (d < 14 && i.speed > 3.4) {
              footstep(true, false, floorSurface(level), Math.max(0.2, 1 - d / 14));
            }
          },
        });
      });
      ragdolls.push(entry);
      if (ragdolls.length > MAX_RAGDOLLS) finishRagdoll(ragdolls[0]);
      return entry;
    };

    // THE ENTITY — rendered only while the server says it's near.
    //
    // TWO ANIMATIONS, by Josh's rule: the walk, and the same walk a little
    // faster when it chases. Both come from the file's one sustained clip
    // (bendingOverScene, 9.3s — measured; everything else is the jumpscare, a
    // 0.2s fragment, and two zero-frame poses). The clip is a SCENE capture:
    // its root bone travels 2.1m inside the animation, which — played raw —
    // slid the body off its server anchor and snapped it back on every loop.
    // The root's horizontal travel is stripped at load (see stripRootTravel),
    // so the clip walks in place while the GROUP does the actual moving, and
    // the body always faces its direction of travel (rotation from the frame
    // loop). The old procedural bob/roll/wave layers are GONE — they were
    // compensation for the years this clip contributed nothing visible.
    // JUMPSCARE keeps its 3.5m lunge: it plays exactly once, over the red
    // death flash, and the lunge is the kill.
    // Sounds are untouched: walking.mp3 and scream.mp3 still drive themselves
    // from the server's mode, so the audio Josh signed off on is unchanged.
    // TWO CREATURES since the relic-patrol rework (Josh: "make it so there
    // are two entities… swapping between relics"). Everything hard-won about
    // rendering ONE body (rest-pose reset, shimmer, grab, floor pin,
    // snapshot interpolation) now lives per-instance; the model + processed
    // clips load once and the second body is a SkeletonUtils clone.
    interface EntInst {
      group: THREE.Group;
      model: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      clip: string;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      mode: "wander" | "chase";
      seenAt: number;
      bones: { bone: THREE.Object3D; depth: number }[];
      rest: { bone: THREE.Object3D; q: THREE.Quaternion }[];
      grabDir: THREE.Vector3;
      /** Ground speed, m/s, smoothed — a body standing still must not walk in place. */
      speed: number;
    }
    const entInsts = new Map<number, EntInst>();
    /** Build another body for an id the server introduced (a map editor
     *  SPAWNER's Entity — ids 100 and up); set once the model has loaded. */
    let makeEntInst: ((id: number) => void) | null = null;
    /** What the file actually contained, for the admin probe. */
    let entClipInfo = "";
    let entLoading = false;
    /** SNAPSHOT INTERPOLATION for the entity's movement (Josh: "extremely
     *  jittery and jumps back and forth"). The server speaks at 10Hz; the
     *  old exp-lerp-to-latest sprinted toward each new frame then stalled —
     *  a 10Hz surge-stall cycle — and a frame landing behind the rendered
     *  position visibly dragged the body BACKWARD. Standard fix: keep the
     *  recent frames and render the body ENT_LAG ms in the past, linearly
     *  interpolating between the two frames that bracket that moment — the
     *  motion is continuous by construction and never reverses. */
    const ENT_LAG = 170; // > one server tick + jitter headroom
    /** Bones by hierarchy DEPTH for the flesh shimmer — a low-amplitude
     *  travelling wave layered on the walk clip so the body never reads
     *  still, even through the clip's quiet stretches (Josh's second look:
     *  "he should be moving"). This is seasoning on the SAME walk animation,
     *  not a third state — deleted once and missed immediately. */

    /** EVERY bone's baseline pose, restored EVERY frame BEFORE the mixer
     *  runs. The hard-won rule (three rounds of whack-a-mole): any bone the
     *  mixer doesn't rewrite each frame ACCUMULATES the shimmer/grab
     *  multiplies forever — and "which bones does the mixer own" turned out
     *  to be unknowable from track names alone (subclip drops keyless
     *  tracks, and the skeleton has DUPLICATE bone names, where the mixer
     *  binds only the first instance — the drift-snap-drift trajectory of
     *  Bone036_013 proved it live). So no classification: reset everything,
     *  let the mixer overwrite what it actually drives, and apply the
     *  procedural layers fresh on top. Nothing can accumulate, ever. */
    const entWaveQ = new THREE.Quaternion();
    const ENT_WAVE_AXIS = new THREE.Vector3(1, 0, 0);
    /** The model node + its load-time grounding, for the per-frame FLOOR
     *  CLAMP: the walk clip swings the body well below the bind-pose floor
     *  line, so every frame the lowest bone is measured and the model lifted
     *  exactly enough to keep it on the carpet ("rocking in and out of the
     *  floor", Josh's test — no constant clearance can chase a moving clip). */
    let entBaseY = 0;
    const ENT_TMP_V = new THREE.Vector3();
    /** The skinned flesh hangs below the bone JOINTS the pin measures —
     *  measured live: with the lowest bone exactly on the carpet, the mesh's
     *  median low point sat right at floor level but its ribbons dipped in
     *  ("still clipping through the floor"). Pin the lowest bone this far
     *  ABOVE the carpet so the sag rides on it; a light brush remains, a
     *  visible sink does not. */
    const ENT_FLESH_LIFT = 0.12;
    /** THE GRAB (scratch + tuning) — inside ENT_GRAB_FAR metres the upper
     *  limbs stretch toward the player, hardest at point blank: Josh, after
     *  cutting the airborne lunge-at-you look: "make his arms reach out
     *  towards the players position when he gets close within range like he
     *  is trying to grab them." A post-mixer layer like the shimmer, so
     *  nothing accumulates frame to frame. */
    const ENT_GRAB_NEAR = 1.2;
    const ENT_GRAB_FAR = 4.5;
    /** Per-bone reach angle, applied ONLY to bones at depth 3–8. The first
     *  cut rotated EVERY bone above the waist and let it compound down
     *  15-deep chains — 137° of whip, limbs flung 2m over the body's own
     *  head (measured), which was the "tumbling". Six bones × 0.09 caps the
     *  whole reach at ~31°: a deliberate arm extension, physically bounded.
     *  Tips still travel — they ride their rotated parents. */
    const ENT_GRAB_MAX = 0.09;
    const ENT_GRAB_DEPTH_LO = 3;
    const ENT_GRAB_DEPTH_HI = 8;
    /** The grab's aim is DAMPED and fades out inside 0.9m: at point-blank
     *  the raw direction to the player flips sign every frame (the entity
     *  is standing IN the camera), and an instant axis whipped the limbs
     *  end over end — measured 2.5m of body-height chaos, which is exactly
     *  the "tumbling" Josh kept seeing at close range. */
    const ENT_GRAB_AXIS = new THREE.Vector3();
    const ENT_GRAB_Q = new THREE.Quaternion();
    const ENT_GRAB_PQ = new THREE.Quaternion();
    const ENT_GRAB_P = new THREE.Vector3();
    const ENT_GRAB_S = new THREE.Vector3();

    /** The three things it can be doing, and how each is played. Keyed by
     *  STATE rather than clip name, because wander and chase share a clip and
     *  differ only in speed — comparing clip names would never switch them. */
    // Clip NAMES are resolved from the file at load, not hardcoded here. Twice
    // now a clip name has looked right and been wrong — stalkingpose turned out
    // to have zero frames — so the move clip is chosen by MEASURED DURATION
    // (the longest one is the only thing that can carry sustained motion) and
    // the kill by name with a longest-other fallback. entPoses is filled in by
    // loadEntity; if a future re-export renames everything, this still works.
    const entPoses: Record<string, { clip: string; rate: number; once?: boolean }> = {};

    /** Cross-fade to a pose. `once` clamps on the last frame — the jumpscare
     *  must not loop back into a neutral wander mid-kill. */
    const playEntClip = (inst: EntInst, pose: string): void => {
      if (inst.clip === pose) return;
      const spec = entPoses[pose];
      const next = spec && inst.actions[spec.clip];
      if (!next) return;
      const prevSpec = entPoses[inst.clip];
      const prev = prevSpec && inst.actions[prevSpec.clip];
      if (prev === next) {
        // Same clip, new tempo: ease the rate instead of restarting, so
        // breaking into a chase doesn't snap it back to frame zero.
        next.timeScale = spec.rate;
        inst.clip = pose;
        return;
      }
      // NO crossFadeTo. It interpolates weight between two actions and leaves
      // the incoming one at weight 0 if the outgoing one was not actually
      // running — a silent way to end up with a correctly-playing action that
      // renders nothing. Stop the old one and assert full weight on the new.
      if (prev) prev.stop();
      next.reset();
      // PLAIN FORWARD LOOP. Ping-pong was tried first (the clip is a scene
      // capture, its last frame doesn't match its first) — but playing the
      // whole 9s gesture forward-then-BACKWARD is exactly the "rocking back
      // and forth" Josh flagged twice. Measured on the bench: the end pose
      // is only ~half a second of ordinary motion away from the start pose,
      // so the LoopRepeat seam is a sub-second stutter on a writhing mass —
      // invisible next to a nine-second visible reversal.
      next.setLoop(spec.once ? THREE.LoopOnce : THREE.LoopRepeat, spec.once ? 1 : Infinity);
      next.clampWhenFinished = !!spec.once;
      next.timeScale = spec.rate;
      next.enabled = true;
      next.paused = false;
      next.setEffectiveWeight(1);
      next.play();
      inst.clip = pose;
    };

    const loadEntity = (): void => {
      if (entLoading) return;
      entLoading = true;
      // ?v=2 busts the OLD cache tier: entity.glb spent ten days being served
      // "immutable, 1 year", so clients that ever fetched it will not ask
      // again — a new query string is a new URL, which is the only thing an
      // immutable cache respects. Bump it if the model file is ever swapped.
      new GLTFLoader().load("/assets/entity/entity.glb?v=2", (g) => {
        const model = g.scene;
        warmModel(model); // programs + textures ready before first sight
        model.updateMatrixWorld(true);

        // TWO THINGS ABOUT THIS FILE, both found on the animation bench
        // (scripts/animview.html) after four rounds of guessing from
        // screenshots. Together they are why the entity looked like a static
        // speck: it was being rendered at about an eighth of its intended
        // size, floating, and no amount of animation is visible on a 29cm blob
        // seen across a room.
        //
        // 1. IT CARRIES STRAY SCENE GEOMETRY. Object_166 sits 233 units away
        //    from the creature — a slab of the room the model was posed in.
        //    It stretched the bounding box to 245 units deep, so scaling "to
        //    2.3m tall" off that box shrank the actual creature to nothing.
        //    Outliers are rejected by MEDIAN distance: robust, because one
        //    huge outlier cannot drag a median the way it drags a mean.
        const parts: { o: THREE.Mesh; bb: THREE.Box3; c: THREE.Vector3 }[] = [];
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
          parts.push({ o: mesh, bb, c: bb.getCenter(new THREE.Vector3()) });
        });
        if (parts.length > 2) {
          const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
          const mc = new THREE.Vector3(
            med(parts.map((p) => p.c.x)),
            med(parts.map((p) => p.c.y)),
            med(parts.map((p) => p.c.z)),
          );
          const md = Math.max(0.001, med(parts.map((p) => p.c.distanceTo(mc))));
          for (const p of parts) if (p.c.distanceTo(mc) > md * 8) p.o.visible = false;
        }

        // 2. FOR A SKINNED MESH, geometry.boundingBox IS THE BIND POSE — not
        //    where the bones actually put the vertices. This rig's bind pose
        //    is spread over 27 units while the assembled creature is 2.4 units
        //    tall, so measuring the mesh box gets the size wrong by 1.7x even
        //    after the stray is gone. The BONES are the honest measure of how
        //    big the thing really is, so scale and ground it from those.
        const bones: THREE.Object3D[] = [];
        model.traverse((o) => {
          if ((o as THREE.Bone).isBone) bones.push(o);
        });
        const bbox = new THREE.Box3();
        if (bones.length) {
          for (const b of bones) bbox.expandByPoint(b.getWorldPosition(new THREE.Vector3()));
        } else {
          for (const p of parts) if (p.o.visible) bbox.union(p.bb);
        }
        const size = bbox.getSize(new THREE.Vector3());
        // 2.9, up from 2.3 (Josh's screenshot: it read as a small spider).
        // The target is the BIND pose with limbs outstretched — in its actual
        // stalking pose the body crouches to ~73% of it, so 2.3 left the
        // creature standing 1.68m: SHORTER THAN THE PLAYER (measured live).
        // At 2.9 it stalks at ~2.1m over a 1.72m human; 3.5 was tried and its
        // rear-up moments draped limbs through the 4.2m office ceilings.
        const s = 2.9 / (size.y || 1);
        model.scale.setScalar(s);
        // Centre it on its own body and stand it on the floor, so the server's
        // position means the creature rather than the middle of a bind pose.
        // The Y here is only the BASE — the clip swings the body far below the
        // bind-pose floor line ("rocking in and out of the floor", Josh's
        // test), so a per-frame FLOOR CLAMP in the loop measures the lowest
        // bone and lifts the model however much this frame's pose needs.
        const mid = bbox.getCenter(new THREE.Vector3());
        entBaseY = -bbox.min.y * s;
        model.position.set(-mid.x * s, entBaseY, -mid.z * s);
        // Skinned bounds lie under animation — without this the whole entity
        // pops out of existence when its bind-pose box leaves the frustum.
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
        });

        // WHY IT LOOKED 2D (Josh's catch), and the fix. The file's material is
        // near-black (#1e1612, no textures), and this world's lighting is
        // deliberately DIRECTIONLESS — baked pools + hemisphere/ambient, no
        // directional light (the light doctrine). Direction-free light on a
        // near-black surface produces no shading gradient at all, so the
        // creature rendered as a flat silhouette. A scene light can't fix it
        // without repainting the whole baked world (three lights are global),
        // so the entity carries its OWN light: a MATCAP — studio shading baked
        // into a little sphere texture, sampled by view-space normal. Curves
        // shade themselves from any angle, the world is untouched, fog still
        // applies. Painted here rather than shipped: a radial key light from
        // upper-left in dead-flesh browns, a faint cool rim lower-right so it
        // separates from dark corridors, near-black everywhere else.
        const matcapCv = document.createElement("canvas");
        matcapCv.width = matcapCv.height = 256;
        const mg = matcapCv.getContext("2d")!;
        // Punched up on Josh's second look ("still looks 2D"): a brighter,
        // wider key and a stronger rim so the form reads at corridor
        // distance, not just at arm's length.
        const key = mg.createRadialGradient(95, 85, 14, 128, 128, 138);
        key.addColorStop(0, "#7d6250");
        key.addColorStop(0.35, "#46332a");
        key.addColorStop(0.7, "#1e150e");
        key.addColorStop(1, "#070404");
        mg.fillStyle = key;
        mg.fillRect(0, 0, 256, 256);
        const rim = mg.createRadialGradient(192, 202, 4, 192, 202, 96);
        rim.addColorStop(0, "rgba(88,102,118,0.45)");
        rim.addColorStop(1, "rgba(88,102,118,0)");
        mg.fillStyle = rim;
        mg.fillRect(0, 0, 256, 256);
        const matcapTex = new THREE.CanvasTexture(matcapCv);
        matcapTex.colorSpace = THREE.SRGBColorSpace;
        const entMat = new THREE.MeshMatcapMaterial({ matcap: matcapTex, side: THREE.DoubleSide });
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            (o as THREE.Mesh).material = entMat;
          }
        });

        // Clips are named "Armature.001|stalkingpose" — key them by the part
        // after the bar so a re-export that renames the armature can't break
        // the lookup. (Actions are created per INSTANCE below; the clip
        // processing here — root-strip, subclip, seam bake — is shared.)
        const clips = g.animations ?? [];
        // Pick by MEASURED duration, never by name. Zero-length clips are
        // poses and can only ever render a statue; the longest clip is the
        // only one that can carry sustained movement.
        const byLength = [...clips]
          .map((c) => ({ key: c.name.split("|").pop() ?? c.name, dur: c.duration, clip: c }))
          .filter((c) => c.dur > 0.05)
          .sort((a, b) => b.dur - a.dur);
        const move = byLength[0]?.key;
        // STRIP THE WALK CLIP'S ROOT TRAVEL. Measured on the bench: the clip
        // is a scene capture whose root bone (Bone001_03 in this export)
        // translates 2.1m — played raw, the body slid away from its server
        // anchor and snapped back at every loop, which is what Josh's "the
        // animations look wrong" was. The root is found by MEASUREMENT (the
        // position track with the largest horizontal range), never by name,
        // and only its X/Z are frozen to the first key — the vertical dip and
        // every limb's own position track keep moving. The GROUP does the
        // travelling; the clip now walks in place on top of it. The jumpscare
        // is deliberately NOT stripped: its 3.5m lunge plays once, at the
        // kill, aimed wherever the body faces — which is you.
        if (byLength[0]) {
          let best: THREE.KeyframeTrack | null = null;
          let bestRange = 0;
          for (const t of byLength[0].clip.tracks) {
            if (!t.name.endsWith(".position")) continue;
            const v = t.values;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < v.length; i += 3) {
              if (v[i] < minX) minX = v[i];
              if (v[i] > maxX) maxX = v[i];
              if (v[i + 2] < minZ) minZ = v[i + 2];
              if (v[i + 2] > maxZ) maxZ = v[i + 2];
            }
            const r = Math.hypot(maxX - minX, maxZ - minZ);
            if (r > bestRange) {
              bestRange = r;
              best = t;
            }
          }
          if (best && bestRange > 0.3) {
            const v = best.values;
            // All THREE axes now (Josh's playtest: "bouncing up and down") —
            // the root's vertical drive went with the horizontal travel. The
            // body's organic rise-and-fall survives in the ROTATION tracks;
            // only the whole-creature elevator is gone.
            for (let i = 3; i < v.length; i += 3) {
              v[i] = v[0];
              v[i + 1] = v[1];
              v[i + 2] = v[2];
            }
          }
        }
        // THE UPRIGHT WINDOW (Josh's fourth look: "it is tumbling… it should
        // be somewhat upright walking"). The 9.3s scene capture spends whole
        // stretches bent double — at chase speed those read as the creature
        // tumbling end over end. Measured on the bench: body height across
        // the clip runs 1.6–2.0 units, but the 5.85–7.85s stretch holds
        // 1.77–1.86 (94% upright, 9cm of wobble) AND its endpoints are only
        // ~0.15s of pose apart — a clean upright walking loop. Everything
        // plays THAT two-second window now; the rest of the capture is dead
        // weight. 30fps matches the export's key rate.
        if (byLength[0]) {
          const sub = THREE.AnimationUtils.subclip(byLength[0].clip, "walkLoop", Math.round(5.85 * 30), Math.round(7.85 * 30), 30);
          // BAKE THE LOOP SEAMLESS (Josh: "extremely jittery… not smooth").
          // The window's endpoints are close but not identical, and at chase
          // rate the LoopRepeat snap fired every ~1s — a visible pose pop.
          // The last 350ms of every track now eases into that track's FIRST
          // key (slerp for rotations, lerp for position/scale, smoothstepped
          // so the correction itself doesn't kink): the loop lands exactly
          // where it restarts, so there is no seam left to see.
          const BLEND = 0.35;
          const dur = sub.duration;
          const qa = new THREE.Quaternion();
          const qb = new THREE.Quaternion();
          for (const tr of sub.tracks) {
            const size = tr.getValueSize();
            // SPARSE TRACKS FIRST (found live: the pop survived the blend —
            // a track whose last key sits before the blend window holds
            // that stale pose to the end, then snaps to its first key at
            // the wrap; the floor pin then telegraphs the jump into every
            // bone). Append an explicit final key equal to the FIRST key,
            // so every track provably ends exactly where it restarts.
            const lastKeyT = tr.times[tr.times.length - 1];
            if (lastKeyT < dur - 0.001) {
              const nt = new Float32Array(tr.times.length + 1);
              nt.set(tr.times);
              nt[nt.length - 1] = dur;
              const nv = new Float32Array(tr.values.length + size);
              nv.set(tr.values);
              for (let c = 0; c < size; c++) nv[tr.values.length + c] = tr.values[c];
              tr.times = nt;
              tr.values = nv;
            }
            const isQuat = /\.quaternion$/.test(tr.name);
            for (let i = 0; i < tr.times.length; i++) {
              const a = (tr.times[i] - (dur - BLEND)) / BLEND;
              if (a <= 0) continue;
              const k = Math.min(1, a);
              const w = k * k * (3 - 2 * k);
              if (isQuat) {
                qa.fromArray(tr.values, i * size);
                qb.fromArray(tr.values, 0);
                qa.slerp(qb, w);
                qa.toArray(tr.values, i * size);
              } else {
                for (let c = 0; c < size; c++) {
                  tr.values[i * size + c] += (tr.values[c] - tr.values[i * size + c]) * w;
                }
              }
            }
          }
          clips.push(sub);
        }
        // Josh's two-animation rule: the walk, and the walk a little faster.
        // Rates retuned after his second look ("he should be moving") — 1.0
        // read as languid through the clip's quiet stretches. THE KILL IS
        // THE WALK TOO (Josh: "no lunging, tumbling, jumping") — the old
        // jumpscare clip dove 3.5m through the air; now the kill is the same
        // grounded walk at a frantic rate, and the GRAB (below) already has
        // its arms in your face at that range. Same clip → playEntClip just
        // eases the tempo, no restart.
        if (move) {
          const walk = clips.some((c) => c.name === "walkLoop") ? "walkLoop" : move;
          entPoses.wander = { clip: walk, rate: 1.35 };
          entPoses.chase = { clip: walk, rate: 1.9 };
          entPoses.kill = { clip: walk, rate: 2.3 };
        }
        entClipInfo = byLength.map((c) => `${c.key}:${c.dur.toFixed(1)}s`).join(" ");
        // Index the skeleton by DEPTH for the shimmer (bones are generically
        // named Bone.041_019, so depth is the only usable structure).
        // TWO BODIES from one processed model: instance 0 is the original,
        // instance 1 a SkeletonUtils clone (skinned rigs need it). Each gets
        // its own mixer/actions/rest snapshot — the accumulation rule holds
        // per skeleton. The darkness aura stays CUT (Josh's call — the
        // ceiling-panel flicker is the tell, driven from the frame loop).
        const buildInst = (id: number, m: THREE.Object3D): void => {
          const mixer = new THREE.AnimationMixer(m);
          const actions: Record<string, THREE.AnimationAction> = {};
          for (const clip of clips) {
            actions[clip.name.split("|").pop() ?? clip.name] = mixer.clipAction(clip);
          }
          const bones: { bone: THREE.Object3D; depth: number }[] = [];
          m.traverse((o) => {
            if (!(o as THREE.Bone).isBone) return;
            let depth = 0;
            for (let p = o.parent; p && depth < 64; p = p.parent) {
              depth++;
              if ((p as THREE.Bone).isBone === undefined) break;
            }
            bones.push({ bone: o, depth });
          });
          const group = new THREE.Group();
          group.add(m);
          group.visible = false;
          scene.add(group);
          const inst: EntInst = {
            group,
            model: m,
            mixer,
            actions,
            clip: "",
            snaps: [],
            heading: 0,
            mode: "wander",
            seenAt: 0,
            bones,
            rest: [],
            grabDir: new THREE.Vector3(0, 0, 1),
            speed: 0,
          };
          entInsts.set(id, inst);
          playEntClip(inst, "wander");
          // Snapshot EVERY bone's baseline: one mixer sync so driven bones
          // hold the walk's frame-0 pose and everything else holds bind.
          mixer.update(0);
          inst.rest = bones.map(({ bone }) => ({ bone, q: bone.quaternion.clone() }));
        };
        buildInst(0, model);
        buildInst(1, cloneSkeleton(model));
        makeEntInst = (id: number) => buildInst(id, cloneSkeleton(model));
      });
    };

    // The player's own arms, once the shared hazmat model is in memory. The
    // suit colour is the wire-truth `wornSuit` (what peers are told), so you
    // see the sleeves you paid for — and if the welcome hasn't landed yet,
    // ensureViewmodelSuit() rebuilds these when it does.
    void ensureHazmat().then(() => {
      if (brDisposed) return; // backed out during the FBX fetch — no body on a dead scene
      viewmodel = makeViewmodel(wornSuit);
      viewmodelSuit = wornSuit;
      // In the SCENE, not on the camera: the body must not inherit pitch, or it
      // tips forward like a turret and can never look down (see placeViewmodel).
      if (viewmodel) scene.add(viewmodel.group);
    });
    // LOADED ON ENTRY, not on sight. The rigged model is ~12MB, and fetching
    // that at the exact moment the server first says "it's near" is the worst
    // possible time: it would arrive late, or pop in already on top of you. It
    // stays invisible until the server says otherwise — this only moves the
    // download to somewhere it doesn't cost anything.
    loadEntity();

    // ---- THE STALKER (Josh, July 2026) ------------------------------------
    // Level 0's third creature: a jet-black shape that keeps its distance
    // while the lights hold, throws snatches of other players' voices, and
    // only closes in when the power dies. The model ships white — painted
    // black here (Josh's call), and the SCP-4666 sound belongs to the hunt
    // alone (ambience.updateStalkerSound enforces it).
    interface StalkerInst {
      group: THREE.Group;
      model: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      clip: string;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      mode: "shadow" | "hunt" | "flee";
      seenAt: number;
      /** A beam is burning it (server's word, from the last frame). */
      burn: boolean;
      /** Its ground speed, cells/s, smoothed — the walk's tempo follows it. */
      speed: number;
      /** Its one material, so a burn can smoulder on it. */
      mat: THREE.MeshStandardMaterial;
      /** The body's forward lean at a run (a group between it and the model,
       *  pivoting at the feet). */
      lean: THREE.Group;
    }
    /** THE STALKER'S STRIDE, measured (Sep 30 2026) off stalker.glb at the
     *  2.25m it is drawn: one Walk cycle (0.975s) carries a foot 2.1-2.2m
     *  fore and aft, so the clip at rate 1 walks ~4.3 m/s — 2.15 cells/s. It
     *  moves at twice a sprint (5.7 cells/s), and the old fixed rates (1 in
     *  shadow, 1.7 hunting, 2.1 fleeing) slid its feet across the carpet. The
     *  tempo now follows the ground it actually covers. */
    const STALKER_WALK_CELLS = 2.15;
    /** THE RUN, ON A BODY WITH NO RUN CLIP (Nov 2026 polish round — the
     *  audit's L2-02). stalker.glb has Idle / Walk / Attack / Attack Near and
     *  nothing faster, so the Grabber's 5.4 cells/s bolt and the stalker's
     *  5.7 hunt played the 0.98 s walk at 2.5-2.65x: a fast-forwarded walk.
     *  The tempo is capped here, and past a brisk walk the body pitches
     *  forward from the feet the way a sprinter leans (`stalkerLean`) — the
     *  run reads as a run, at the cost of some slide at the very top speed.
     *  A real run clip retargeted onto the rig is the owner's (an asset). */
    const STALKER_TEMPO_CAP = 1.9;
    const stalkerTempo = (cellsPerSec: number): number => Math.min(STALKER_TEMPO_CAP, Math.max(0.6, cellsPerSec / STALKER_WALK_CELLS));
    /** The forward lean (radians) for a ground speed: none at a walk, 0.3 at
     *  a full bolt. */
    const stalkerLean = (cellsPerSec: number): number => 0.3 * Math.min(1, Math.max(0, (cellsPerSec - 2.6) / 2.6));
    let stalkerInst: StalkerInst | null = null;
    let stalkerLoading = false;
    const playStalkerClip = (name: string, rate: number): void => {
      const st = stalkerInst;
      if (!st) return;
      const next = st.actions[name];
      if (!next) return;
      if (st.clip === name) {
        next.timeScale = rate;
        return;
      }
      const prev = st.actions[st.clip];
      if (prev && prev !== next) prev.stop();
      next.reset();
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.timeScale = rate;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      st.clip = name;
    };
    const loadStalker = (): void => {
      if (stalkerLoading) return;
      stalkerLoading = true;
      new GLTFLoader().load("/assets/stalker/stalker.glb", (g) => {
        const model = g.scene;
        warmModel(model); // programs + textures ready before first sight
        model.updateMatrixWorld(true);
        // Size from the BONES (the entity's lesson: a skinned mesh's
        // geometry box is the bind pose, not the creature).
        const bones: THREE.Object3D[] = [];
        model.traverse((o) => {
          if ((o as THREE.Bone).isBone) bones.push(o);
        });
        const bbox = new THREE.Box3();
        if (bones.length) {
          for (const b of bones) bbox.expandByPoint(b.getWorldPosition(new THREE.Vector3()));
        } else {
          bbox.setFromObject(model);
        }
        const size = bbox.getSize(new THREE.Vector3());
        const s = 2.25 / (size.y || 1);
        model.scale.setScalar(s);
        const mid = bbox.getCenter(new THREE.Vector3());
        model.position.set(-mid.x * s, -bbox.min.y * s, -mid.z * s);
        // PAINT IT BLACK (Josh: "i think his model is white so lets make him
        // black"). Standard material so the flashlight's real light carves
        // him out of the dark — in a blackout he is nearly invisible until
        // a beam lands, which is the whole design.
        const black = new THREE.MeshStandardMaterial({
          color: 0x0d0d10,
          roughness: 0.45,
          metalness: 0.15,
          emissive: 0xe6470f, // the burn's ember — dark until a beam holds it
          emissiveIntensity: 0,
        });
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            mesh.material = black;
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });
        const mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of g.animations ?? []) {
          actions[clip.name.split("|").pop() ?? clip.name] = mixer.clipAction(clip);
        }
        const group = new THREE.Group();
        const lean = new THREE.Group();
        lean.add(model);
        group.add(lean);
        group.visible = false;
        scene.add(group);
        stalkerInst = {
          lean,
          group,
          model,
          mixer,
          actions,
          clip: "",
          snaps: [],
          heading: 0,
          mode: "shadow",
          seenAt: 0,
          burn: false,
          speed: 0,
          mat: black,
        };
        playStalkerClip("Idle", 1);
      });
    };
    // ---- THE GRABBER (Oct 2026) — Pipe Dreams' creature --------------------
    // Josh: "reuse the level 0 monster and call it the grabber". The stalker's
    // body and clips (Idle / Walk / Attack / Attack Near), its own instance and
    // its own brain (service.ts → THE GRABBER). It is heard, not seen, first:
    // NOTHING plays past GRABBER_HEAR_CELLS — "the player will not hear the
    // creature until its close" — and test_grabber pins that number.
    const GRABBER_HEAR_CELLS = 8;
    /** In its arms: the camera is wrenched round to face it and you cannot
     *  move (the server refuses the moves too) until this clock runs out. */
    let grabbedUntil = 0;
    let grabbedBy: { x: number; y: number } | null = null;
    interface GrabberInst {
      group: THREE.Group;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      clip: string;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      wantH: number;
      mode: "stalk" | "grab" | "flee";
      seenAt: number;
      targetId: number;
      /** The forward lean at a run (see STALKER_TEMPO_CAP). */
      lean: THREE.Group;
      /** Its ground speed, cells/s, smoothed. */
      speed: number;
    }
    let grabberInst: GrabberInst | null = null;
    let grabberLoading = false;
    const playGrabberClip = (name: string, rate: number, once = false): void => {
      const gb = grabberInst;
      if (!gb) return;
      const next = gb.actions[name];
      if (!next) return;
      if (gb.clip === name) {
        next.timeScale = rate;
        return;
      }
      const prev = gb.actions[gb.clip];
      if (prev && prev !== next) prev.fadeOut(0.12);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.timeScale = rate;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.fadeIn(0.12);
      next.play();
      gb.clip = name;
    };
    const loadGrabber = (): void => {
      if (grabberLoading) return;
      grabberLoading = true;
      warmGrabberSound();
      new GLTFLoader().load("/assets/stalker/stalker.glb", (g) => {
        const model = g.scene;
        warmModel(model);
        model.updateMatrixWorld(true);
        // sized from the BONES, exactly as the stalker is (the same body)
        const bones: THREE.Object3D[] = [];
        model.traverse((o) => {
          if ((o as THREE.Bone).isBone) bones.push(o);
        });
        const bbox = new THREE.Box3();
        if (bones.length) for (const b of bones) bbox.expandByPoint(b.getWorldPosition(new THREE.Vector3()));
        else bbox.setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const s = 2.25 / (size.y || 1);
        model.scale.setScalar(s);
        const mid = bbox.getCenter(new THREE.Vector3());
        model.position.set(-mid.x * s, -bbox.min.y * s, -mid.z * s);
        // black, like the stalker — the flashlight carves it out of the dark
        const black = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.45, metalness: 0.15 });
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            mesh.material = black;
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });
        const mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of g.animations ?? []) actions[clip.name.split("|").pop() ?? clip.name] = mixer.clipAction(clip);
        const group = new THREE.Group();
        const lean = new THREE.Group();
        lean.add(model);
        group.add(lean);
        group.visible = false;
        scene.add(group);
        grabberInst = { group, mixer, actions, clip: "", snaps: [], heading: 0, wantH: 0, mode: "stalk", seenAt: 0, targetId: 0, lean, speed: 0 };
        playGrabberClip("Idle", 1);
      });
    };
    // ---- THE BLEEDER (Oct 2026) — the Electrical Station's creature --------
    // The Dover Demon (W.Prigs, CC-BY — the creature from the Roblox game
    // Whispering Pines). Its nine clips are the brain's states one to one:
    // Search1/Walk hunting, Scream when it has seen someone, Run, Attack1 on
    // the touch, Idle2 over a body, RetreatScream as the beam drives it off,
    // and Hurt1 while a held beam is on it. Server-driven like the shy guy;
    // the heading is the SERVER's, because a charge has to look like what it
    // is.
    interface BleederInst {
      group: THREE.Group;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      clip: string;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      wantH: number;
      mode: "hunt" | "scream" | "chase" | "feed" | "retreat";
      burn: boolean;
      seenAt: number;
      /** Who it is after (0 = nobody) — every observer faces it the same way. */
      targetId: number;
    }
    /** It is tall — the model's own 2.39m, kept. */
    const BLEEDER_HEIGHT = 2.4;
    let bleederInst: BleederInst | null = null;
    let bleederLoading = false;
    const playBleederClip = (name: string, rate: number, once = false): void => {
      const b = bleederInst;
      if (!b) return;
      const next = b.actions[name];
      if (!next) return;
      if (b.clip === name) {
        next.timeScale = rate;
        return;
      }
      const prev = b.actions[b.clip];
      if (prev && prev !== next) prev.fadeOut(0.12);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.timeScale = rate;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.fadeIn(0.12);
      next.play();
      b.clip = name;
    };
    const loadBleeder = (): void => {
      if (bleederLoading) return;
      bleederLoading = true;
      warmBleederSound();
      new GLTFLoader().load("/assets/station/bleeder/bleeder.glb", (g) => {
        const model = g.scene;
        warmModel(model);
        model.updateMatrixWorld(true);
        // Sized off its MESH box: this model's bind pose IS its standing pose
        // (measured 1.41 × 2.39 × 0.81m, centred on its origin — hence the
        // lift by the box's floor).
        const geo = new THREE.Box3().setFromObject(model);
        const size = geo.getSize(new THREE.Vector3());
        const s = BLEEDER_HEIGHT / (size.y || 1);
        model.scale.setScalar(s);
        const mid = geo.getCenter(new THREE.Vector3());
        model.position.set(-mid.x * s, -geo.min.y * s, -mid.z * s);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });
        const mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of g.animations ?? []) actions[clip.name.split("|").pop() ?? clip.name] = mixer.clipAction(clip);
        const group = new THREE.Group();
        group.add(model);
        group.visible = false;
        scene.add(group);
        bleederInst = { group, mixer, actions, clip: "", snaps: [], heading: 0, wantH: 0, mode: "hunt", burn: false, seenAt: 0, targetId: 0 };
        playBleederClip("Search1", 1);
      });
    };

    // ---- THE TEMP (Level 4) — the office's mannequin -----------------------
    // It never walks: it is a mannequin, only ever somewhere new. The model's
    // one clip (Peeling Wood Mannequin, an unsettled idle) is FROZEN at five
    // moments — its poses (TEMP_POSE_T: neutral, head turned, head cocked,
    // twisted and leaning in, arms out) — and the server says which. Its
    // position SNAPS to the server's (no glide): it is never seen moving.
    interface TempInst {
      group: THREE.Group;
      mixer: THREE.AnimationMixer;
      action: THREE.AnimationAction | null;
      pose: number;
      moving: boolean;
      seenAt: number;
    }
    const TEMP_POSE_T = [0, 1, 2, 4, 5];
    /** A store mannequin's height. */
    const TEMP_HEIGHT = 1.86;
    let tempInst: TempInst | null = null;
    let tempLoading = false;
    let officeDipUntil = 0;
    /** Every zone's dip, not only yours: a Temp in a zone that has gone dark
     *  is in the dark to you too, wherever you watch it from. */
    const zoneDipUntil = new Map<number, number>();
    const poseTemp = (pose: number): void => {
      const t = tempInst;
      if (!t?.action) return;
      t.pose = pose;
      t.action.paused = false;
      t.action.time = TEMP_POSE_T[pose % TEMP_POSE_T.length];
      t.mixer.update(0);
      t.action.paused = true;
    };
    const loadTemp = (): void => {
      if (tempLoading) return;
      tempLoading = true;
      warmTempSound();
      new GLTFLoader().load("/assets/office/temp/temp.glb", (g) => {
        const model = g.scene;
        warmModel(model);
        const mixer = new THREE.AnimationMixer(model);
        const clip = g.animations?.[0];
        const action = clip ? mixer.clipAction(clip) : null;
        if (action) {
          action.play();
          action.time = 0;
          mixer.update(0);
          action.paused = true;
        }
        // sized in its neutral pose, off the BONES (a skinned box is the
        // bind pose, not the body)
        model.updateMatrixWorld(true);
        const bbox = new THREE.Box3();
        model.traverse((o) => {
          if ((o as THREE.Bone).isBone) bbox.expandByPoint(o.getWorldPosition(new THREE.Vector3()));
        });
        if (bbox.isEmpty()) bbox.setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        // the bones stop at the crown's joint: a head's worth more is the body
        const s = TEMP_HEIGHT / ((size.y || 1) * 1.08);
        model.scale.setScalar(s);
        const mid = bbox.getCenter(new THREE.Vector3());
        model.position.set(-mid.x * s, -bbox.min.y * s, -mid.z * s);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });
        const group = new THREE.Group();
        group.add(model);
        group.visible = false;
        scene.add(group);
        tempInst = { group, mixer, action, pose: 0, moving: false, seenAt: 0 };
      });
    };

    // ---- THE SHY GUY (Josh, Aug 2026) — the Poolrooms' creature ------------
    // SCP-096, playing itself. The model ships with the full canon animation
    // set (idle / walk / panic / attackrun / attack), so the clip choice IS
    // the state machine: docile shuffle → face covered and screaming the
    // moment you look at it → the run. Unlike Level 0's creatures it is
    // never repainted — it arrives looking exactly like what it is.
    interface ShyInst {
      group: THREE.Group;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      clip: string;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      mode: "lurk" | "trigger" | "chase" | "flee" | "leave";
      targetId: number;
      seenAt: number;
      /** Radius of its silhouette in world units — the cheap pre-test that
       *  keeps the precise mesh raycast off the hot path. */
      reach: number;
    }
    /** How deep it lets itself sink before it wades at the surface instead of
     *  tracking the floor (metres of body under the waterline). It stands
     *  2.38m, so chest-deep. */
    const SHY_WADE_Y = 1.5;
    /** How much wider than its own silhouette the eye-contact window is
     *  (Josh: "a little to the left or right of his model"). 1 would be
     *  triangle-exact; this makes catching his eye forgiving. */
    const SHY_AIM_GRACE = 2.4;
    let shyInst: ShyInst | null = null;
    let shyLoading = false;
    let shyScreaming = false;
    /** One report per docile visit — the server ignores repeats anyway, and
     *  a look that has already landed shouldn't keep raycasting. */
    let shyLooked = false;
    let shyLookAt = 0;
    const playShyClip = (name: string, rate: number, once = false): void => {
      const sh = shyInst;
      if (!sh) return;
      const next = sh.actions[name];
      if (!next) return;
      if (sh.clip === name) {
        next.timeScale = rate;
        return;
      }
      const prev = sh.actions[sh.clip];
      if (prev && prev !== next) prev.fadeOut(0.18);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.timeScale = rate;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.fadeIn(0.18);
      next.play();
      sh.clip = name;
    };
    const loadShy = (): void => {
      if (shyLoading) return;
      shyLoading = true;
      warmShySound(); // the scream must never land on a silent frame
      new GLTFLoader().load("/assets/pools/shy.glb", (g) => {
        const model = g.scene;
        warmModel(model); // programs + textures ready before first sight
        model.updateMatrixWorld(true);
        // Size off the BONES, not the geometry box (the entity's lesson: a
        // skinned mesh's box is its bind pose, not the creature). 096 is
        // canonically 2.38m — tall enough to read as wrong from across a hall.
        const bones: THREE.Object3D[] = [];
        model.traverse((o) => {
          if ((o as THREE.Bone).isBone) bones.push(o);
        });
        const bbox = new THREE.Box3();
        if (bones.length) {
          for (const b of bones) bbox.expandByPoint(b.getWorldPosition(new THREE.Vector3()));
        } else {
          bbox.setFromObject(model);
        }
        const size = bbox.getSize(new THREE.Vector3());
        const s = 2.38 / (size.y || 1);
        model.scale.setScalar(s);
        const mid = bbox.getCenter(new THREE.Vector3());
        model.position.set(-mid.x * s, -bbox.min.y * s, -mid.z * s);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });
        const mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of g.animations ?? []) {
          actions[clip.name.split("|").pop() ?? clip.name] = mixer.clipAction(clip);
        }
        const group = new THREE.Group();
        group.add(model);
        group.visible = false;
        scene.add(group);
        shyInst = {
          group,
          mixer,
          actions,
          clip: "",
          snaps: [],
          heading: 0,
          mode: "lurk",
          targetId: 0,
          seenAt: 0,
          reach: Math.max(0.7, (Math.max(size.x, size.z) * s) / 2),
        };
        playShyClip("scp096idle1", 1);
      });
    };

    // ---- THE ALLIGATORS (Level 1) — one per large body of water ----------
    // No animations by design (Josh): a static inflatable-crocodile model
    // gliding on the waterline, heading straight from the server (the mouth
    // is the weapon, so the facing must be the SERVER's facing, not one
    // derived from motion). Instances share the loaded base model.
    interface GatorInst {
      group: THREE.Group;
      snaps: { x: number; z: number; at: number }[];
      heading: number;
      wantH: number;
      mode: "idle" | "chase";
      seenAt: number;
    }
    /** Nose-to-tail, metres — a big animal, sized to read as one. */
    const GATOR_LEN = 3.6;
    /** Which way the artist's nose points down the long axis, relative to
     *  the +Z heading convention. VERIFIED BY EYE on the bench (Aug 2026):
     *  the pool-float croc's snout is already +Z, so no flip. */
    const GATOR_FLIP = 0;
    const gatorInsts = new Map<number, GatorInst>();
    let gatorBase: THREE.Group | null = null;
    let gatorHalfH = 0.12;
    let gatorLoading = false;
    const loadGatorBase = (): void => {
      if (gatorLoading) return;
      gatorLoading = true;
      warmGatorSound(); // the first bite must not land on a silent frame
      new GLTFLoader().load("/assets/pools/gator.glb", (g) => {
        const model = g.scene;
        warmModel(model); // programs + textures ready before first sight
        model.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const mid = bbox.getCenter(new THREE.Vector3());
        // Centre the body on its own origin, then normalise: longest
        // horizontal axis becomes +Z (the heading convention peers and the
        // shy guy already use), scaled to GATOR_LEN.
        model.position.set(-mid.x, -mid.y, -mid.z);
        const inner = new THREE.Group();
        inner.add(model);
        if (size.x > size.z) inner.rotation.y = Math.PI / 2;
        inner.rotation.y += GATOR_FLIP;
        const s = GATOR_LEN / (Math.max(size.x, size.z) || 1);
        inner.scale.setScalar(s);
        gatorHalfH = Math.max(0.06, (size.y * s) / 2);
        inner.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.castShadow = true;
        });
        gatorBase = inner;
      });
    };
    const ensureGator = (id: number): GatorInst | null => {
      const have = gatorInsts.get(id);
      if (have) return have;
      if (!gatorBase) {
        loadGatorBase();
        return null; // frames arrive 10/s — the next one lands after the load
      }
      const group = new THREE.Group();
      group.add(gatorBase.clone(true));
      group.visible = false;
      scene.add(group);
      const inst: GatorInst = { group, snaps: [], heading: 0, wantH: 0, mode: "idle", seenAt: 0 };
      gatorInsts.set(id, inst);
      return inst;
    };

    let exiting = false;
    let exitRetryAt = 0;
    /** AT A WAY OUT (Backrooms law 5, Oct 2026 — one rule on every level):
     *  a door in the middle of a room (radial) within 2.4 cells; a marked
     *  wall (Level 0's Entrance) standing against it — laterally inside the
     *  door cell and within 0.5 of its plane, inside the server's own 0.6. */
    const atExitDoor = (ed: { x: number; y: number; edge: "N" | "S" | "E" | "W"; radial?: boolean }): boolean => {
      if (ed.radial) return Math.hypot(player.x - ed.x, player.y - ed.y) < 2.4;
      const lateral = ed.edge === "N" || ed.edge === "S" ? Math.abs(player.x - ed.x) : Math.abs(player.y - ed.y);
      const perp =
        ed.edge === "N" ? player.y - (ed.y - 0.5)
        : ed.edge === "S" ? ed.y + 0.5 - player.y
        : ed.edge === "E" ? ed.x + 0.5 - player.x
        : player.x - (ed.x - 0.5);
      return lateral < 0.75 && perp >= 0 && perp < 0.5;
    };
    let atExitShown = false;
    extractNow = (): void => {
      exiting = true;
      exitRetryAt = performance.now() + 700;
      net?.move(player.x, player.y, player.yaw); // force-sync, then ask
      net?.exit();
    };
    let jumpY = 0;
    let vy = 0;
    // AIRBORNE STATE (the arc rebuild): while true the body flies from
    // `airBase` (the ground height it left) + jumpY, ignoring the terrain
    // underneath until it lands. Set by a jump OR by walking off a ledge.
    let airborne = false;
    let airBase = 0;
    // v2 verticality: the eased ground height under the player, and a decaying
    // jolt when a landing hurts.
    let groundY = 0;
    // SWIMMING (Poolrooms v3). In swim-deep water (≥1.5m) the feet decouple
    // from the floor: you sink slowly, SPACE swims up (cheaper than a jump),
    // CROUCH dives. swimY is the feet height in metres; head under the
    // surface runs the 10-second drown clock — the SERVER owns the kill,
    // the breath meter here is the countdown you feel.
    let swimming = false;
    let swimY = 0;
    let submerged = false;
    let sentSub = false;
    /** Well under Level 7's sea (not just head-under at the surface): where
     *  the thing below's shapes are drawn over you instead of on the water. */
    const oceanDiving = (): boolean => submerged && !ctl.fly.on && camera.position.y < -2;
    let swimT = 0; // stroke/bob clock
    let swimPhase = 0;
    // FIRST-PERSON ARMS. Parented to the CAMERA, so they ride the view for
    // free — no per-frame transform to keep in sync, which is the usual way
    // viewmodels drift. Built once the hazmat model and its clips have landed.
    let viewmodel: Viewmodel | null = null;
    // ONE APPEARANCE, EVERY OBSERVER (Josh's core law, Aug 2026): the suit
    // colour every self-view wears (viewmodel sleeves, emote stand-in) is the
    // WIRE-TRUTH one — the same inventory read the server's suitOf() makes
    // when it tells peers. It is set from the welcome frame, BEFORE the
    // hotbar filter drops the worn suit out of `slots` (reading it from
    // `slots` was the bug that kept every player's own body yellow).
    let wornSuit = "yellow";
    let viewmodelSuit = "yellow";
    /** Rebuild the first-person arms if their sleeves don't match the
     *  wire-truth suit (the welcome can land before OR after the shared
     *  hazmat model finishes loading — both orders must end matched). */
    const ensureViewmodelSuit = (): void => {
      if (!viewmodel || viewmodelSuit === wornSuit) return;
      scene.remove(viewmodel.group);
      viewmodel = makeViewmodel(wornSuit);
      viewmodelSuit = wornSuit;
      if (viewmodel) scene.add(viewmodel.group);
    };
    let heldObj: THREE.Object3D | null = null;
    let heldKind = "";
    // THE HELD ITEM RIDES THE CAMERA, not the hand bone. Josh's spec is about
    // where things are RELATIVE TO THE VIEW — "by the player's side", "up to the
    // right ear", "aims where the cursor aims" — and a hand bone cannot promise
    // any of that, because the walk cycle swings it. Camera-parented means an
    // item pointed down -Z is pointed exactly at the crosshair, by construction.
    let heldHolder: THREE.Group | null = null;
    // Two poses per item, [x, y, z, pitch, yaw, roll] in camera space: x right,
    // y up, -z forward. STOWED is carried; ACTIVE is in use. The item eases
    // between them, so raising the walkie to your ear is a movement, not a cut.
    type Pose = [number, number, number, number, number, number];
    const HELD_POSE: Record<string, { stow: Pose; use: Pose }> = {
      // Down by the side, then raised into the middle of the view so the nozzle
      // points where you are looking — Josh: "aims where the cursor aims".
      // Re-posed for the UPRIGHT can (July 2026): the old offsets were tuned
      // for the sideways orientation — standing up at y=-0.45 the whole can
      // sat below a 72° frame's bottom edge.
      spraycan: {
        stow: [0.24, -0.19, -0.36, 0.12, -0.2, -0.12],
        use: [0.12, -0.16, -0.38, -0.08, 0, -0.04],
      },
      // Never stowed: held in the right hand, half lifted toward the aim point,
      // so the beam and the crosshair agree.
      flashlight: {
        stow: [0.22, -0.26, -0.36, -0.15, 0.06, 0.1],
        use: [0.17, -0.19, -0.42, -0.24, 0.03, 0.05],
      },
      // Both hands, brought up to the face — close to the lens and centred,
      // which is what looking through a viewfinder looks like from inside.
      camera: {
        stow: [0.24, -0.42, -0.32, 0.2, -0.15, 0],
        use: [0.0, -0.09, -0.24, 0, 0, 0],
      },
      // By the side, then up to the RIGHT EAR to talk.
      walkie: {
        stow: [0.26, -0.44, -0.3, 0.25, -0.15, 0],
        use: [0.15, -0.07, -0.16, -0.05, -0.75, 0.35],
      },
      pills: { stow: [0.25, -0.45, -0.3, 0.3, 0, 0], use: [0.09, -0.17, -0.33, -0.1, 0, 0] },
      battery: { stow: [0.25, -0.45, -0.3, 0.3, 0, 0], use: [0.1, -0.18, -0.34, -0.1, 0, 0] },
      // The Almond Water — carried IN VIEW low-right (the flashlight rule, not
      // the by-the-side rule: a consumable has no use state to lift it into
      // frame, so an out-of-frame stow would mean the bottle never appears at
      // all). The "use" pose tips it toward the mask; it's reserved for a
      // future drink animation — a click consumes instantly today.
      // Framing note: the top ~10cm of the model is its BLACK cap and carry
      // loop — the stow has to ride high enough that the yellow body clears
      // the bottom of a 72° frame, or all you see is black hardware.
      almondwater: { stow: [0.26, -0.2, -0.42, 0.12, -0.15, -0.08], use: [0.1, -0.16, -0.3, -0.35, 0, 0] },
    };
    /** Eased 0..1 — how far the current item is into its ACTIVE pose. */
    let heldRaise = 0;
    /** Right mouse button held with the camera in hand — the AIM. Raising the
     *  camera to the mask is this, not recording: aim and shoot are separate
     *  inputs (Josh's ask). Recording keeps rolling from the hip if you lower
     *  it — the tape doesn't care where the camera is pointed from. */
    let camAiming = false;
    // Admin geometry probe (see probeOn) — a raycaster down the crosshair,
    // sampled a few times a second rather than every frame.
    const probeRay = new THREE.Raycaster();
    const PROBE_CENTER = new THREE.Vector2(0, 0);
    // The emote camera's wall probe. `.camera` set because the scene holds
    // Sprites (name tags), whose raycast path throws without one.
    const emoteRay = new THREE.Raycaster();
    const EMOTE_V1 = new THREE.Vector3();
    const EMOTE_V2 = new THREE.Vector3();
    let probeFrame = 0;
    let fallShake = 0;
    let crouchAmt = 0; // 0 standing → 1 crouched (eased)

    // The AUTO render-scale governor's current value (renderScale 0 = Auto):
    // eased between 0.5 and 1.0 to hold ~60fps on machines that can't do
    // native. Manual scales bypass it entirely.
    let autoScale = 1;
    let frameEma = 16.7; // smoothed raw frame interval, ms
    let lastGovern = 0;
    let lastFpsPush = 0;
    let gfxMsaa = 4; // the preset's ask — resize() caps it by pixel budget
    const GFX_SIZE = new THREE.Vector2();

    const resize = (): void => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      const manual = brSettings.renderScale;
      const scale = manual > 0 ? manual : autoScale;
      // Internal resolution = device pixels × the render scale. The 16384
      // guard keeps a 200% ultrawide from asking for a texture the GPU
      // can't allocate.
      let pr = Math.min(window.devicePixelRatio, 2) * scale;
      pr = Math.min(pr, 16384 / Math.max(w, h));
      // MSAA drops out above ~9 megapixels internal (Josh's blackout: 200%
      // on an ultrawide asks for 11MP × 4-sample renderbuffers — hundreds
      // of MB the GPU may simply refuse, and the screen goes black). At
      // that scale supersampling IS the anti-aliasing, so nothing is lost.
      const effMsaa = w * h * pr * pr > 9_000_000 ? 0 : Math.min(gfxMsaa, renderer!.capabilities.maxSamples ?? 0);
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        if (rt.samples !== effMsaa) {
          rt.samples = effMsaa;
          rt.dispose();
        }
      }
      renderer!.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      renderer!.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // ---- Graphics quality (Josh's GPU package, July 2026) ----------------
    // What each preset buys. Bloom is ~15-25% of the frame on integrated
    // GPUs; the atmosphere filter ~5%; MSAA is resolved by the composer's
    // render targets (the context's antialias flag does nothing once
    // rendering goes through the composer — found while building this: the
    // game had shipped with NO real anti-aliasing).
    const GFX: Record<GfxPreset, { bloom: boolean; atmo: boolean; shadow: number; msaa: number }> = {
      low: { bloom: false, atmo: false, shadow: 512, msaa: 0 },
      medium: { bloom: true, atmo: true, shadow: 1024, msaa: 0 },
      high: { bloom: true, atmo: true, shadow: 1024, msaa: 4 },
      ultra: { bloom: true, atmo: true, shadow: 2048, msaa: 8 },
    };
    applyGfx = (): void => {
      const g = GFX[brSettings.gfxPreset] ?? GFX.high;
      bloom.enabled = g.bloom;
      atmo.enabled = g.atmo; // the composer routes the last ENABLED pass to screen
      gfxMsaa = g.msaa; // applied (and pixel-budget-capped) in resize()
      if (flash.shadow.mapSize.x !== g.shadow) {
        flash.shadow.mapSize.set(g.shadow, g.shadow);
        flash.shadow.map?.dispose();
        flash.shadow.map = null; // re-allocated at the new size on next lit frame
      }
      resize();
    };
    applyGfx();
    window.addEventListener("resize", resize);
    cleanupFns.push(() => window.removeEventListener("resize", resize));
    // panelMat and friends are MODULE singletons — leaving the game mid-
    // blackout must not strand them dim (createScene also resets on the next
    // mount; this keeps the invariant even if that ever changes).
    cleanupFns.push(() => setPowerLevel(1));

    // ---- Net -----------------------------------------------------------
    /** Drop EVERYTHING belonging to the current world: chunks, paint, door
     *  marks, THE DOOR's frame, the entity's last-seen body, every peer. Used
     *  by travel AND welcome — a welcome after any reconnect must never build
     *  the new world on top of a stale one (the graffiti-bleed class). */
    // Door 0 is The Landing: the passage home to Level 0 AND a way out to
    // Threshold-4. Everything else is a plain exit. Both take a deliberate
    // E, never mere proximity — and both are REAL BUILT DOORS now (Josh:
    // "some of the exits are just text floating in the air").
    // THE LANDING is a real door in a wall now (Josh, Sep 2026) — the model
    // door that onTheDoor builds — so the free-standing tiled doorway that
    // used to mark it is gone. Any further pools door would still get one.
    const poolsExitLabels = (doors: { x: number; y: number; name?: string; floor?: number }[]): THREE.Object3D[] =>
      doors.slice(1).map((dd) => makePoolsExitDoor(scene, { ...dd, name: dd.name ?? "THE WAY OUT" }, false, makeLabel));
    /** Every level's ways out, dressed the one way (welcome and travel used
     *  to disagree: a travel into Pipe Dreams dressed its drain as a
     *  Poolrooms door). */
    const dressDoors = (doors: { x: number; y: number; edge: "N" | "S" | "E" | "W"; name?: string; floor?: number }[]): void => {
      if (level === 0) {
        // THE WAY IN: red lines on the wall, nothing more (Josh: "in level 0
        // just mark red lines against the wall as the entrance")
        doorMarks = doors.map((dd) => addDoorMarker(scene, dd));
        exitDoors = doors.map((dd) => ({ x: dd.x + 0.5, y: dd.y + 0.5, edge: dd.edge }));
      } else if (level === 2 || level === 9) {
        // THE SUBURBS: the manhole you climbed out of, a red ring round it —
        // the way back down (Number 9's front door is the other way out).
        // PIPE DREAMS: one way in and out — the drain's ladder (labelled
        // plainly as an exit: it is no passage to another level).
        // THE DRAIN: a red circle on the floor round the hatch (Josh: "for
        // the drain just mark a circle in red on the floor")
        doorMarks = doors.map((dd) => addFloorRing(scene, dd));
        exitDoors = doors.map((dd) => ({ x: dd.x + 0.5, y: dd.y + 0.5, edge: dd.edge, radial: true }));
      } else if (level === 3 || level === 4 || level === 5 || level === 6 || level === 7 || level === 8) {
        // THE ELECTRICAL STATION: the pressure door you came through, red on
        // its wall, and E at it takes you out (the server's 2.8-cell rule).
        // THE OFFICE the same: the lift you came down in.
        doorMarks = doors.map((dd) => addDoorMarker(scene, dd, makeLabel));
        exitDoors = doors.map((dd) => ({ x: dd.x + 0.5, y: dd.y + 0.5, edge: dd.edge, radial: true }));
        // THALASSOPHOBIA's Hatch is the very sea hatch Lights Out has on its
        // side, standing open in the red outline (Nov 2026 polish round — it
        // was the outline alone on a bare wall)
        if (level === 7) {
          for (const mk of doorMarks) {
            void openSeaHatch(warmModel).then((m) => {
              if (!m || !mk.parent || level !== 7) return;
              const mark = mk.children[0];
              if (mark) mark.visible = false;
              m.position.z = -0.01;
              mk.add(m);
            });
          }
        }
      } else {
        doorMarks = poolsExitLabels(doors);
        exitDoors = doors.slice(1).map((dd) => ({ x: dd.x + 0.5, y: dd.y + 0.5, edge: dd.edge, radial: true }));
      }
    };
    const teardownWorld = (): void => {
      clearBlood();
      for (const k of pruneChunks(world, scene, 1e9, 1e9, 0)) requested.delete(k);
      requested.clear();
      rebuildQueue.clear();
      for (const mk of doorMarks) scene.remove(mk);
      doorMarks = [];
      if (doorSite) {
        scene.remove(doorSite.group);
        scene.remove(doorSite.label);
        if (doorSite.outline) scene.remove(doorSite.outline);
        doorSite = null;
      }
      if (hatchSite) {
        scene.remove(hatchSite.group);
        scene.remove(hatchSite.label);
        hatchSite = null;
      }
      for (const fs of fuseSites.values()) {
        scene.remove(fs.mesh);
        scene.remove(fs.label);
      }
      fuseSites.clear();
      if (fuseBoxSite) {
        scene.remove(fuseBoxSite.label);
        fuseBoxSite = null;
      }
      clearStation();
      clearOffice();
      hotel.clear();
      stopHotelSound();
      lights.clear();
      ocean.clear();
      stopOceanSound();
      cave.clear();
      stopCaveSound();
      suburb.clear();
      stopSuburbSound();
      stopLightsSound();
      heat = 0;
      liftAt = null;
      registerLine = null;
      if (keySite) {
        scene.remove(keySite.mesh);
        scene.remove(keySite.label);
        keySite = null;
      }
      for (const inst of entInsts.values()) {
        inst.group.visible = false;
        inst.snaps.length = 0;
      }
      if (stalkerInst) {
        stalkerInst.group.visible = false;
        stalkerInst.snaps.length = 0;
      }
      if (shyInst) {
        shyInst.group.visible = false;
        shyInst.snaps.length = 0;
        shyInst.seenAt = 0;
      }
      if (shyScreaming) {
        shyScreaming = false;
        shyQuiet();
      }
      if (bleederInst) {
        bleederInst.group.visible = false;
        bleederInst.snaps.length = 0;
        bleederInst.seenAt = 0;
      }
      updateBleederSound(null, "hunt", 0);
      if (grabberInst) {
        grabberInst.group.visible = false;
        grabberInst.snaps.length = 0;
        grabberInst.seenAt = 0;
      }
      updateGrabberSound(null, false, 0, GRABBER_HEAR_CELLS);
      grabbedUntil = 0;
      grabbedBy = null;
      for (const g of gatorInsts.values()) {
        g.group.visible = false;
        g.snaps.length = 0;
        g.seenAt = 0;
      }
      for (const [, p] of peers) disposeAvatar(scene, p);
      peers.clear();
      stopAllPeerSprays();
      peerStride.clear();
      for (const [, b] of boatViews) scene.remove(b.group);
      boatViews.clear();
      myBoat = null;
      // Flails in progress belong to the world we're leaving.
      for (const r of [...ragdolls]) finishRagdoll(r);
      deathCam = null;
      world.districtTypes.clear();
    };

    // ---- THE BOATS (Poolrooms v3.1; Josh's inflatable, Aug 2026) ---------
    // A green two-bench inflatable (the oars were cut out of the GLB — it's
    // paddled by hand as far as anyone can tell). FIRST ABOARD TAKES THE
    // BACK BENCH and the helm — their normal movement IS the boat
    // (server-validated to wet water); the second rider sits the FRONT
    // bench, pinned to the hull. Riders play the sitting pose.
    let myBoat: { id: number; seat: "captain" | "passenger" } | null = null;
    const boatViews = new Map<
      number,
      {
        group: THREE.Group;
        tx: number;
        ty: number;
        th: number;
        captain: number | null;
        passenger: number | null;
        wake: number; // travel accumulator, cells — paces the water slosh
        px: number; // last drawn position, world metres
        pz: number;
      }
    >();
    let boatLastGood: { x: number; y: number } | null = null;
    /** Hull length in metres (the old punt's size — it fits the waterways). */
    const BOAT_SCALE = 0.65; // the GLB is 4.6m nose-to-stern natively
    /** Bench offsets measured off the GLB (local z × scale; the bow is -Z):
     *  the BACK bench is the captain's, the front the passenger's. */
    const BOAT_SEAT_AFT = 0.39;
    const BOAT_SEAT_FORE = -0.44;
    /** A seated rider's feet-origin sits this far BELOW the waterline: bench
     *  top (wl − 0.1 hull draft + 0.31 bench height) minus the sit clip's
     *  measured pelvis height (0.264 × the 1.72m suit ≈ 0.45). */
    const BOAT_SIT_DROP = 0.23;
    /** Rowing pace, cells/s — ONE speed, no sprint. Faster than the
     *  alligator's 2.85 deep-water rush (Josh: "make sure the boat is
     *  faster than the alligator") — open water is safety in a hull. */
    const BOAT_SPEED = 3.1;
    let boatBase: THREE.Group | null = null;
    let boatLoading = false;
    const loadBoatBase = (): void => {
      if (boatLoading) return;
      boatLoading = true;
      new GLTFLoader().load("/assets/pools/boat.glb", (g) => {
        const model = g.scene;
        warmModel(model); // programs + textures ready before first sight
        model.scale.setScalar(BOAT_SCALE);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        boatBase = model;
        // Any hull that spawned before the file landed gets its body now.
        for (const [, v] of boatViews) v.group.add(boatBase.clone(true));
      });
    };
    let dbgFrames = 0;
    let dbgDt = 0;
    if (import.meta.env.DEV) {
      (window as unknown as { __brBoats?: unknown }).__brBoats = boatViews;
      // Spawn a client-only test ragdoll at my feet — the visual iteration
      // hook (no server involved; the "corpse" it settles into never exists).
      (window as unknown as { __brRagdoll?: unknown }).__brRagdoll = (dir = player.yaw + Math.PI, power = 3.4, seed = 42): void => {
        const dx = Math.sin(dir);
        const dy = Math.cos(dir);
        spawnRagdoll({
          id: -1,
          x: player.x,
          y: player.y,
          rx: player.x + dx * Math.min(3, power),
          ry: player.y + dy * Math.min(3, power),
          dir,
          power,
          seed,
          suit: "orange",
          h: player.yaw,
        });
        bloodBurst(world, scene, player.x, player.y, world.groundAt(player.x, player.y) + 1.15, dir, seed);
      };
      // Aim the head from a script. Automated verification can't drive a
      // pointer lock, and "walk until it happens to be on screen" is not a
      // test — this is how a harness looks AT something on purpose.
      (window as unknown as { __brLook?: unknown }).__brLook = (yaw: number, pitch = 0): void => {
        ctl.onMouse((player.yaw - yaw) / 0.0023, 0);
        ctl.onMouse(0, (player.pitch - pitch) / 0.0023);
      };
      // Hold or release a movement key from a script — the same reason as
      // __brLook: a harness cannot take the pointer lock the keys wait for.
      (window as unknown as { __brKey?: unknown }).__brKey = (code: string, down: boolean): void => {
        if (down) ctl.keys.add(code);
        else ctl.keys.delete(code);
      };
      // The operator's flycam from a script (the F key needs the keyboard
      // focus a harness can't give it) — the theme pass flies every level.
      // The server still decides: a member's request is refused there.
      (window as unknown as { __brFly?: unknown }).__brFly = (on: boolean): void => requestFly(on);
      // The screenshot rig's teleport (scripts/backrooms/shoot.mjs): the
      // flycam put exactly where a shot wants it. Flying only — the server
      // takes any position from a flying admin. z is the eye in metres; left
      // out, it is eye height over the floor, under the ceiling (call again
      // once the chunk has streamed — an unstreamed floor reads 0).
      // .status() says whether the 5x5 chunks round the eye have landed;
      // .labels(false) hides the operator's through-wall tags for a clean shot.
      (window as unknown as { __brGoto?: unknown }).__brGoto = Object.assign(
        (x: number, y: number, z?: number, yaw?: number, pitch?: number): void => {
          if (!ctl.fly.on) requestFly(true);
          player.x = x;
          player.y = y;
          const cx = Math.floor(x);
          const cy = Math.floor(y);
          player.alt = z ?? (world.hasCell(cx, cy) ? Math.min(world.groundAt(x, y) + EYE, world.ceilAt(cx, cy) - 0.25) : EYE);
          if (yaw !== undefined) player.yaw = yaw;
          if (pitch !== undefined) player.pitch = Math.max(-1.45, Math.min(1.45, pitch));
          wantChunks(true);
        },
        {
          status: () => {
            const pcx = Math.floor(player.x / chunkSize);
            const pcy = Math.floor(player.y / chunkSize);
            const maxC = Math.ceil(worldSize / chunkSize);
            let want = 0;
            let have = 0;
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const cx = pcx + dx;
                const cy = pcy + dy;
                if (cx < 0 || cy < 0 || cx >= maxC || cy >= maxC) continue;
                want++;
                if (world.meshes.has(`${cx},${cy}`)) have++;
              }
            }
            const cx = Math.floor(player.x);
            const cy = Math.floor(player.y);
            const known = world.hasCell(cx, cy);
            return {
              want, have, fly: ctl.fly.on, x: player.x, y: player.y, alt: player.alt, yaw: player.yaw, pitch: player.pitch,
              known, ground: known ? world.groundAt(player.x, player.y) : null, ceil: known ? world.ceilAt(cx, cy) : null,
              worldSize, chunkSize, calls: renderer?.info.render.calls ?? 0,
            };
          },
          labels: (on: boolean): void => {
            for (const m of opMarks.values()) m.label.visible = on;
          },
        },
      );
      // …and the torch (its click waits for the pointer lock too).
      // THE HOTEL: what its scene is drawing (the swarms, the nests).
      (window as unknown as { __brHotel?: unknown }).__brHotel = () => hotel.debug();
      // LIGHTS OUT: the hatch and the Listeners the scene is drawing.
      (window as unknown as { __brLights?: unknown }).__brLights = () => lights.debug();
      // THALASSOPHOBIA: the subway stair and what the deep is doing.
      (window as unknown as { __brOcean?: unknown }).__brOcean = () => ocean.debug();
      // THE CAVE SYSTEM: the Chimney and the Burrowers the scene is drawing.
      (window as unknown as { __brCave?: unknown }).__brCave = () => cave.debug();
      // THE SUBURBS: Number 9's front door and the Watches the scene is drawing.
      (window as unknown as { __brSuburb?: unknown }).__brSuburb = () => suburb.debug();
      (window as unknown as { __brTorch?: unknown }).__brTorch = (on: boolean): void => {
        flashOn = on;
      };
      (window as unknown as { __brDbg?: unknown }).__brDbg = () => ({
        peers: [...peers.entries()].map(([id, p]) => ({ id, x: +(p.group.position.x / CELL).toFixed(2), y: +(p.group.position.z / CELL).toFixed(2), equip: p.equip, ageMs: Math.round(performance.now() - p.lastPosAt) })),
        px: +player.x.toFixed(2),
        py: +player.y.toFixed(2),
        moving: player.moving,
        keys: [...ctl.keys],
        scale: +ctl.mods.scale.toFixed(2),
        myBoat,
        lastGood: boatLastGood,
        depth: +world.waterDepthAt(Math.floor(player.x), Math.floor(player.y)).toFixed(2),
        known: world.hasCell(Math.floor(player.x), Math.floor(player.y)),
        frames: dbgFrames,
        dt: dbgDt,
        calls: renderer?.info.render.calls ?? 0,
        tris: renderer?.info.render.triangles ?? 0,
        yaw: +player.yaw.toFixed(2),
        entered,
        swimming,
        shy: shyInst && shyInst.group.visible
          ? {
              mode: shyInst.mode,
              clip: shyInst.clip,
              x: +(shyInst.group.position.x / CELL).toFixed(2),
              y: +(shyInst.group.position.z / CELL).toFixed(2),
              screaming: shyScreaming,
              looked: shyLooked,
            }
          : null,
        rags: ragdolls.map((r) => ({
          uid: r.userId,
          live: !!r.rag,
          groupInScene: !!r.group.parent,
          groupVisible: r.group.visible,
          kids: r.group.children.length,
          pelvis: r.rag ? r.rag.pelvis() : null,
          skins: (() => {
            let n = 0;
            let vis = 0;
            r.group.traverse((o) => {
              if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
                n++;
                if (o.visible) vis++;
              }
            });
            return `${vis}/${n}`;
          })(),
        })),
        gators: [...gatorInsts.entries()]
          .filter(([, g]) => g.group.visible)
          .map(([id, g]) => ({
            id,
            mode: g.mode,
            x: +(g.group.position.x / CELL).toFixed(2),
            y: +(g.group.position.z / CELL).toFixed(2),
            gy: +g.group.position.y.toFixed(2),
            h: +g.heading.toFixed(2),
          })),
      });
    }
    const boatSurfaceY = (bx: number, by: number): number => {
      const wl = world.waterAt(Math.floor(bx), Math.floor(by));
      return (wl ?? 0) - 0.1; // the hull sits low in the water
    };
    const ensureBoatView = (f: { id: number; x: number; y: number; h: number; captain: number | null; passenger: number | null }) => {
      let v = boatViews.get(f.id);
      if (!v) {
        const group = new THREE.Group();
        if (boatBase) group.add(boatBase.clone(true));
        else loadBoatBase(); // retro-attached when the GLB lands
        group.position.set(f.x * CELL, boatSurfaceY(f.x, f.y), f.y * CELL);
        scene.add(group);
        v = {
          group,
          tx: f.x,
          ty: f.y,
          th: f.h,
          captain: f.captain,
          passenger: f.passenger,
          wake: 0,
          px: f.x * CELL,
          pz: f.y * CELL,
        };
        boatViews.set(f.id, v);
      }
      v.tx = f.x;
      v.ty = f.y;
      v.th = f.h;
      v.captain = f.captain;
      v.passenger = f.passenger;
      return v;
    };

    /** Proximity voice: open mic, distance does the rest — ONE ROOM PER LEVEL,
     *  so this runs on arrival and again on every travel. A muted mic stays
     *  muted across the hop. If voice isn't configured the game stays silent. */
    let voiceJoin = 0;
    /** LAW 12: the dead's own room on this level — the spectators watching
     *  the same player hear each other freely, as ordinary chat (open mic). */
    let ghostJoining = false;
    const joinGhostVoice = (): void => {
      ghostJoining = true;
      const mine = voiceJoin;
      void joinProximityVoice(brApi.ghostVoiceToken).then((r) => {
        ghostJoining = false;
        if (!r.ok) return;
        if (brDisposed || mine !== voiceJoin || !spec) { r.voice.leave(); return; }
        ghostVoice = r.voice;
      });
    };
    const leaveGhostVoice = (): void => {
      ghostVoice?.leave();
      ghostVoice = null;
    };
    const joinLevelVoice = (): void => {
      leaveGhostVoice();
      const wasMuted = micState === "muted";
      const mine = ++voiceJoin;
      if (voice) {
        voice.leave();
        voice = null;
      }
      micState = "joining";
      void joinProximityVoice().then((r) => {
        if (r.ok) {
          // Left the game (or hopped again) while connecting → hang up NOW,
          // or the mic stays hot with nobody holding the handle.
          if (brDisposed || mine !== voiceJoin) { r.voice.leave(); return; }
          voice = r.voice;
          if (wasMuted) voice.setMuted(true);
          micState = wasMuted ? "muted" : "live";
        } else if (mine === voiceJoin) {
          micState = "off";
        }
      });
    };

    net = connectGame({
      onWelcome: (w: Welcome) => {
        // A RESUMED session can wake up in the Poolrooms — dress accordingly,
        // and NEVER on top of whatever world this instance held before.
        teardownWorld();
        // a resumed run's key and fuses in hand (Oct 2026 review)
        hasKey = !!w.hasKey;
        fusesCarrying = w.fuses ?? 0;
        level = w.level === 9 ? 9 : w.level === 8 ? 8 : w.level === 7 ? 7 : w.level === 6 ? 6 : w.level === 5 ? 5 : w.level === 4 ? 4 : w.level === 3 ? 3 : w.level === 2 ? 2 : w.level === 1 ? 1 : 0;
        setLevelStyle(styleFor(level));
        applyLevelEnvironment(scene, styleFor(level));
        setHumBed(styleFor(level));
        worldSize = w.size;
        chunkSize = w.chunk;
        world.chunkSize = w.chunk;
        for (const d of w.districts ?? []) world.districtTypes.set(d.id, d.type);
        world.mapSize = w.size;
        player.x = w.you.x;
        player.y = w.you.y;
        // Face away from your door into the yellow.
        const d = w.doors[w.you.door] ?? w.doors[0];
        player.yaw = d.edge === "N" ? Math.PI : d.edge === "S" ? 0 : d.edge === "E" ? Math.PI / 2 : -Math.PI / 2;
        doorName = levelName(level, d.name);
        // ANY door is a way out now (Josh, July 2026 — matching the server's
        // exit rule): every door wall gets the red mark, and every one of
        // them extracts whoever touches it, however they came in. LEVEL 0
        // ONLY: the Poolrooms' way home is The Landing, not a lobby wall.
        dressDoors(w.doors ?? []);
        if (level === 3) applyStation(w.station);
        if (level === 4) applyOffice(w.office);
        inHotel = level === 5;
        if (level === 5) applyHotel(w.hotel);
        if (level === 6) applyLights(w.lights);
        if (level === 7) applyOcean(w.ocean);
        if (level === 8) applyCave(w.cave);
        if (level === 9) applySuburb(w.suburb);
        // THIS LEVEL'S CREATURE, loaded now: each loader used to start on the
        // creature's first frame, so on a cold page its first appearance was
        // a body that wasn't drawn and a warning that wasn't heard — the
        // Grabber's footsteps, the Bleeder's scream (Nov 2026 polish round).
        // The lazy calls in the frame handlers stay as the fallback.
        if (level === 0) loadStalker();
        if (level === 1) loadShy();
        if (level === 2) loadGrabber();
        if (level === 3) loadBleeder();
        if (level === 4) loadTemp();
        // The loadout fills the slots (backpack raises the count, worn not
        // carried); batteries start full by item level.
        const inv = w.inventory ?? [];
        const cap = inv.some((i) => i.kind === "backpack") ? 9 : 5;
        // THE WORN SUIT IS READ HERE, before the filter below drops it out of
        // the hotbar forever — this is the same inventory the server's
        // suitOf() reads when it colours you for everyone else, so the body
        // you look down at matches the body the room sees.
        wornSuit = inv.find((i) => i.kind === "suit")?.color ?? "yellow";
        void ensureHazmat().then(() => ensureViewmodelSuit());
        // Suit + backpack are worn, not slotted.
        const carried = inv.filter((i) => i.kind !== "backpack" && i.kind !== "suit");
        slots = Array.from({ length: cap }, (_, i) => carried[i] ?? null);
        // a RESUMED run's relics are still in hand — show them (the server
        // counts them against the slots either way)
        for (const [k, slug] of (w.relics ?? []).entries()) {
          const idx = slots.findIndex((x) => x === null);
          if (idx === -1) break;
          slots[idx] = { id: -(Date.now() * 10 + k), kind: "relic", level: 0, color: slug };
        }
        for (const item of carried) {
          if (item.kind === "flashlight") batteries.set(item.id, (FLASH_MIN[item.level] ?? 15) * 60);
          if (item.kind === "walkie") batteries.set(item.id, (WALKIE_MIN[item.level] ?? 7) * 60);
          if (item.kind === "spraycan") batteries.set(item.id, SPRAY_SEC[item.level] ?? 90);
          if (item.kind === "camera") batteries.set(item.id, CAM_SEC[item.level] ?? 30);
        }
        if (carried.some((i) => i.kind === "walkie")) net!.walkieCh(walkieChan);
        if (typeof w.hp === "number") hp = w.hp;
        // Joined mid-blackout: pick the event up where everyone else is in
        // it (skip the dying stutter — the lights failed before you arrived).
        if (w.brownoutMs && w.brownoutMs > 0) {
          brownStart = performance.now() - 5000;
          brownUntil = performance.now() + w.brownoutMs;
          brownBlack = !!w.brownoutBlack;
        }
        entered = true;
        wantChunks(true);
        joinLevelVoice();
      },
      onTravel: (tf) => {
        level = tf.level;
        // a voice room per level (law 9): through the door, into its room
        joinLevelVoice();
        // a key never leaves its level: through a door it goes home
        hasKey = false;
        fusesCarrying = 0;
        setLevelStyle(styleFor(level));
        applyLevelEnvironment(scene, styleFor(level));
        setHumBed(styleFor(level));
        // TEAR DOWN the world we just left; the proximity markers clean
        // themselves up via their stale sweeps within seconds.
        teardownWorld();
        for (const d of tf.districts ?? []) world.districtTypes.set(d.id, d.type);
        world.mapSize = tf.size;
        worldSize = tf.size;
        player.x = tf.you.x;
        player.y = tf.you.y;
        doorName = levelName(level, "Level 0");
        dressDoors(tf.doors ?? []);
        if (level === 3) applyStation(tf.station);
        if (level === 4) applyOffice(tf.office);
        inHotel = level === 5;
        if (level === 5) applyHotel(tf.hotel);
        if (level === 6) applyLights(tf.lights);
        if (level === 7) applyOcean(tf.ocean);
        if (level === 8) applyCave(tf.cave);
        if (level === 9) applySuburb(tf.suburb);
        // Brownout state belongs to Level 0's grid.
        if (tf.brownoutMs && tf.brownoutMs > 0) {
          brownStart = performance.now() - 5000;
          brownUntil = performance.now() + tf.brownoutMs;
          brownBlack = !!tf.brownoutBlack;
        } else {
          brownUntil = 0;
        }
        note(
          level === 9 ? "you climb out of a manhole into a cul-de-sac under one streetlight. dark houses, as far as you can see. somebody is whistling, far off. stay in the light — and don't stand by a door."
          : level === 8 ? "the stair comes down onto a flooded subway platform. past the tunnel the rock has broken open into caves. something clicks in the walls — when it does, get out into the open and be still."
          : level === 7 ? "you climb out into a tower. outside, a city drowned to its roofs, and fog. stay on the roofs where you can — something lives in the deep water."
          : level === 6 ? "the stairs end in the dark. it is very quiet. something down here is listening — keep your voice down, and don't run unless you must."
          : level === 5 ? "the service stair ends at a corridor of numbered doors. a band is playing somewhere. keep your torch off the ceilings."
          : level === 4 ? "the lift doors close behind you. grey carpet, dead lights, rain on a window somewhere. something is standing very still."
          : level === 3 ? "the pressure door seals behind you. a hum in the walls — and somewhere, the lights are failing."
          : level === 2 ? "concrete and pipes. it's hot down here."
          : level === 1 ? "the air goes humid. water, somewhere, everywhere."
          : "yellow wallpaper. home, of a kind.",
        );
        wantChunks(true);
      },
      onTravelDenied: (e) => {
        note(
          e === "not_built" ? (level === 8 ? "the rope is fixed in the chimney. at the top: a streetlight — the street above isn't open yet." : level === 7 ? "the subway stair is open — the tunnel below it isn't open yet." : level === 6 ? "the sea hatch is open — the water beyond it isn't open yet." : level === 5 ? "the rusty door is open — the dark below it isn't open yet." : level === 4 ? "the stairwell door is open — the hotel below isn't open yet." : level === 3 ? "the lift has power. the office below isn't open yet." : "the pressure door is open. beyond it: nothing yet — Level 3 isn't open.")
          : e === "office_offline" ? "the office failed verification. the lift won't move."
          : e === "hotel_offline" ? "the hotel failed verification. the stairwell door won't move."
          : e === "hotel_locked" ? "the stairwell door is open — the hotel below isn't open yet."
          : e === "lights_offline" ? "the dark below failed verification. the rusty door won't move."
          : e === "lights_locked" ? "the rusty door is open — the dark below it isn't open yet."
          : e === "ocean_offline" ? "the sea beyond failed verification. the hatch won't move."
          : e === "ocean_locked" ? "the sea hatch is open — the water beyond it isn't open yet."
          : e === "cave_offline" ? "the caves below failed verification. the stair goes nowhere."
          : e === "cave_locked" ? "the subway stair is open — the tunnel below it isn't open yet."
          : e === "station_offline" ? "the station failed verification. the pressure door won't move."
          : e === "level_testing" ? "the level beyond is being test-played. try again in a few minutes."
          : e === "pipes_offline" ? "the plant below failed verification. the hatch won't move."
          : e === "suburbs_offline" ? "the street above failed verification. the chimney goes nowhere."
          : e === "no_helmet" ? "too deep to go on without the Diving Helmet."
          : e === "held" ? "it has you."
          : e === "locked" ? "the door is locked. someone must open it first."
          : e === "too_far" ? "closer…"
          : e === "pools_offline" ? "the far side failed verification. the door won't move."
          : "the door won't move",
        );
      },
      onDenied: (e) => {
        deniedMsg =
          e === "full" ? "That level is at capacity (16 inside). Try again soon."
          : e === "already_inside" ? "You're already inside from another window."
          : e === "backrooms_offline" ? "The doors won't open — the world failed verification server-side."
          : e === "no_suit" ? "No hazmat suit, no entry. Threshold-4 sells the Standard Kit."
          : e === "level_testing" ? "This level is being test-played from the map editor. It opens again in a few minutes."
          : e === "station_offline" ? "The Electrical Station failed verification server-side. Its door won't open."
          : e === "station_locked" ? "The Electrical Station isn't open yet."
          : e === "office_offline" ? "The Abandoned Office failed verification server-side. Its lift won't open."
          : e === "office_locked" ? "The Abandoned Office isn't open yet."
          : e === "hotel_offline" ? "The Terror Hotel failed verification server-side. Its stair won't open."
          : e === "hotel_locked" ? "The Terror Hotel isn't open yet."
          : e === "lights_offline" ? "Lights Out failed verification server-side. Its stair won't open."
          : e === "lights_locked" ? "Lights Out isn't open yet."
          : e === "ocean_offline" ? "Thalassophobia failed verification server-side. Its hatch won't open."
          : e === "ocean_locked" ? "Thalassophobia isn't open yet."
          : e === "cave_offline" ? "The Cave System failed verification server-side. Its stair won't open."
          : e === "cave_locked" ? "The Cave System isn't open yet."
          : e === "suburbs_offline" ? "The Suburbs failed verification server-side. Its manhole won't open."
          : e === "suburbs_locked" ? "The Suburbs isn't open yet."
          : e === "pools_locked" ? "The Poolrooms isn't open yet."
          : e === "pipes_offline" ? "Pipe Dreams failed verification server-side. Its drain won't open."
          : e === "pipes_locked" ? "Pipe Dreams isn't open yet."
          : "The door won't open.";
      },
      onChunk: (c) => {
        // THE GRAFFITI-BLEED HARDENING: a chunk for the other world — however
        // it got here (a race, a resumed socket, a takeover) — is refused.
        if ((c.level ?? 0) !== level) return;
        // A props-only publish from the map editor: the server re-sends the
        // chunks whose props changed. Rebuild one we hold; one we don't will
        // stream the new props whenever we walk up to it anyway.
        if (c.refresh) {
          if (world.meshes.has(world.key(c.cx, c.cy))) buildChunk(world, scene, c, true);
          return;
        }
        const fresh = !world.meshes.has(world.key(c.cx, c.cy));
        buildChunk(world, scene, c);
        // HEAL THE SEAMS (Josh's map sweep, July 2026). A chunk built before
        // its neighbour arrived guessed at everything across the seam —
        // corner heights, wall tops, riser depths — and heightOf's comment
        // claimed a rebuild would correct it, but NO REBUILD EXISTED: the
        // guesses were permanent, and a one-step ramp crossing a chunk seam
        // kept a see-through slit where the two chunks disagreed about the
        // shared corners (Josh's photo, cell 303,287 — the seam at row
        // 287|288). Every fresh arrival now queues its already-built
        // neighbours (8 ways — cornerFor reads diagonals) for a rebuild,
        // drained ONE PER FRAME so a streaming burst can't hitch the walk.
        if (fresh) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nk = world.key(c.cx + dx, c.cy + dy);
              if (world.meshes.has(nk)) rebuildQueue.add(nk);
            }
          }
        }
      },
      onPos: (id, name, x, y, h, suit, pose, equip, pitch, emote) => {
        let p = peers.get(id);
        const fresh = !p;
        if (!p) {
          p = makeAvatar(scene, name, suit);
          peers.set(id, p);
        }
        // True speed off the wire — what picks walk vs RUN for their clip
        // (the old lag-based guess could never fire; Josh: "when sprinting
        // other players see it as walking").
        const tNow = performance.now();
        if (p.lastPosAt > 0) {
          const dtw = (tNow - p.lastPosAt) / 1000;
          if (dtw > 0.02 && dtw < 1.5) {
            const dxw = x * CELL - p.target.x;
            const dzw = y * CELL - p.target.z;
            const sp = Math.hypot(dxw, dzw) / dtw;
            p.wireSpeed = p.wireSpeed * 0.6 + sp * 0.4;
          }
        }
        p.lastPosAt = tNow;
        p.pitch = pitch;
        // Feet on THEIR floor, not on y=0 — the flat-world leftover buried
        // anyone standing on a terrace and floated anyone in a sublevel. The
        // frame loop re-samples this as chunks stream in, so a peer heard
        // before their ground is loaded still settles onto it.
        // Pose 3 = SWIMMING: the body hangs at the waterline, not on the
        // pool floor metres down (which read as "they vanished").
        // Pose 4 = ABOARD: seated in the hull, just above the waterline.
        const wlPeer = pose === 3 || pose === 4 ? world.waterAt(Math.floor(x), Math.floor(y)) : null;
        p.swimming = pose === 3;
        p.aboard = pose === 4;
        {
          const peerFloor = world.groundAt(x, y);
          const depth = wlPeer === null && pose !== 3 && pose !== 4 ? (world.waterAt(Math.floor(x), Math.floor(y)) ?? -1) - peerFloor : -1;
          p.wade = pose === 0 && depth > 0.15 ? (depth > 0.6 ? 0.55 : 0.78) : 1;
        }
        const peerY =
          pose === 4 && wlPeer !== null ? wlPeer - BOAT_SIT_DROP : wlPeer !== null ? wlPeer - 1.32 : world.groundAt(x, y);
        p.target.set(x * CELL, peerY, y * CELL);
        // A body you have just come across (or that jumped — a spectator's
        // new target, a travel) is simply THERE: it used to glide in from
        // the world's origin, which read as somebody sprinting through walls.
        if (fresh || p.group.position.distanceTo(p.target) > 6 * CELL) p.group.position.copy(p.target);
        p.heading = h;
        p.pose = pose === 3 || pose === 4 ? 1 : pose; // crouch is the degraded fallback if the clips are missing
        // Held equipment + audible use (Josh: "others should see the
        // equipment and hear the sounds"). The model swap happens in
        // setAvatarEquip; the active-flag TRANSITIONS make the noise —
        // only within earshot (10 cells), like footsteps.
        const wasActive = p.equip.endsWith("!");
        const prevKind = wasActive ? p.equip.slice(0, -1) : p.equip;
        const isActive = equip.endsWith("!");
        const kind = isActive ? equip.slice(0, -1) : equip;
        if (kind === prevKind && isActive !== wasActive) {
          const lvl = peerLevel(x, y, wallCache.get(id) ?? 0);
          if (kind === "flashlight") gearSfx(isActive ? "flashlight-on" : "flashlight-off", lvl);
          else if (kind === "walkie") gearSfx(isActive ? "radio-on" : "radio-off", lvl);
          // (the can is a HELD hiss — the frame loop runs it while it's down)
        }
        setAvatarEquip(p, equip);
        setAvatarEmote(p, emote); // their dance, played on the avatar
      },
      onBye: (id) => {
        // gone means off the radio too, or a keyed radio rang on for good
        radioPeers.delete(id);
        const p = peers.get(id);
        peerSprayHiss(id, 0);
        peerStride.delete(id);
        if (p) {
          disposeAvatar(scene, p);
          peers.delete(id);
        }
      },
      onCorrect: (x, y) => {
        player.x = x;
        player.y = y;
      },
      onClosed: () => {
        if (!debrief && deadScreen === "none") lost = true;
      },
      onDebrief: (revealed, ms, relics, footage, test, home) => {
        debrief = { revealed, ms, relics, footage, test, home };
        unlockPointer();
      },
      onRelics: (list) => {
        const t = performance.now();
        for (const r of list) {
          const known = relicSites.get(r.id);
          if (known) {
            known.seenAt = t;
          } else {
            const label = makeLabel(r.name ?? "relic", "#ffe9a8");
            const labelPin = pinToGround(label, r.x, r.y, 1.85);
            scene.add(label);
            const { sprite, pin } = makeRelicSprite(r.x, r.y);
            relicSites.set(r.id, { x: r.x, y: r.y, seenAt: t, sprite, label, pin, labelPin });
          }
        }
      },
      onExitDenied: () => {
        // the server wants you closer — say so, and let E try again
        exiting = false;
        note("closer to the door…");
      },
      onRelicTaken: (ok, relicId, name, error, test) => {
        if (!ok) {
          note(error === "no_space" ? "no space in inventory" : error === "too_far" ? "closer…" : error === "already_have" ? "you already have that relic — find the rest of this level's first" : "it's gone");
          return;
        }
        note(test ? `you got "${name}" — a test run keeps nothing` : `you got "${name}"`);
        gearSfx("relic");
        // Fill the first empty slot with the relic (identity revealed now).
        const idx = slots.findIndex((s) => s === null);
        if (idx !== -1) slots[idx] = { id: -Date.now(), kind: "relic", level: 0, color: relicId ?? null };
        // Drop the nearest rendered site — the stream confirms shortly.
        let bestId = -1;
        let bestD = Infinity;
        for (const [id, r] of relicSites) {
          const d = Math.hypot(r.x - player.x, r.y - player.y);
          if (d < bestD) {
            bestD = d;
            bestId = id;
          }
        }
        if (bestId !== -1) {
          const r = relicSites.get(bestId)!;
          reap(r.sprite);
          reap(r.label);
          relicSites.delete(bestId);
        }
      },
      onDrives: (list) => {
        const t = performance.now();
        for (const d of list) {
          const known = driveSites.get(d.id);
          if (known) {
            known.seenAt = t;
            continue;
          }
          const label = makeLabel("hard drive", "#9fd7ff");
          pinToGround(label, d.x, d.y, 0.62);
          scene.add(label);
          driveSites.set(d.id, { x: d.x, y: d.y, seenAt: t, mesh: makeDrive(d.x, d.y), label });
        }
      },
      onDriveTaken: (ok, drive, error) => {
        if (!ok || !drive) {
          note(error === "too_far" ? "closer…" : "nothing there");
          return;
        }
        gearSfx("relic"); // the archive chime — a drive is a find, not loot
        reading = drive;
        unlockPointer();
        // Drop the rendered site immediately; the stream confirms shortly.
        const s = driveSites.get(drive.driveId);
        if (s) {
          reap(s.mesh);
          reap(s.label);
          driveSites.delete(drive.driveId);
        }
      },
      onDriveFound: (title, finder) => note(`${finder} recovered a drive — "${title}"`),
      onKey: (x, y) => {
        const t = performance.now();
        if (keySite) {
          keySite.seenAt = t;
          return;
        }
        const label = makeLabel(level === 9 ? "the house key" : level === 8 ? "the climbing rope" : level === 7 ? "the diving helmet" : level === 6 ? "the handwheel" : level === 5 ? "the boiler key" : level === 4 ? "a keycard" : "a key", "#ffe08a");
        pinToGround(label, x, y, 0.95);
        scene.add(label);
        keySite = { x, y, seenAt: t, mesh: makeKey(x, y), label };
      },
      onKeyTaken: (ok, error) => {
        if (!ok) {
          note(
            error === "too_far" ? "closer…"
            : error === "already_open" ? "the door is already open"
            : "it's gone",
          );
          return;
        }
        hasKey = true;
        keyChip = keyChipFor(level);
        gearSfx("relic");
        if (level === 7) oceanSfx("helmet", 0, 0, 0, 0.9);
        if (level === 8) caveSfx("rope-take", 0, 0, 0, 0.9);
        if (level === 9) suburbSfx("key-take", 0, 0, 0, 0.9);
        note(level === 9 ? "you have the House Key. the tag says 9. Number 9 is the last house on the street — its porch light is on. keep to the light, and listen for the whistle." : level === 8 ? "you have the Climbing Rope. it's too heavy to run with. the chimney is at the far end of the Deep — past whatever clicks in the rock." : level === 7 ? "you have the Diving Helmet. under water it is a minute of air, not ten seconds. the stair is at the bottom of the sunken square." : level === 6 ? "you have the Handwheel. the hatch is somewhere in the water at the far end. listen for the sea." : level === 5 ? "you have the Boiler Key. the rusty door is below stairs, past the furnaces. it gets hot down there." : level === 4 ? "you have the security keycard. the stairwell door is a long walk. keep looking behind you." : level === 1 ? "you have the Poolrooms' key. the drain hatch is somewhere dry. don't die." : "you have THE KEY. don't die.");
        if (keySite) {
          reap(keySite.mesh);
          reap(keySite.label);
          keySite = null;
        }
      },
      onKeyInPlay: (who) => note(level === 9 ? `${who} picked up the House Key` : level === 8 ? `${who} took the Climbing Rope` : level === 7 ? `${who} took the Diving Helmet` : level === 6 ? `${who} picked up the Handwheel` : level === 5 ? `${who} took the Boiler Key` : level === 4 ? `${who} picked up the keycard` : `${who} picked up THE KEY`),
      onTheDoor: (x, y, open, back) => {
        if (!doorSite) {
          // THE DOOR wears the red outline and a red sign (Josh, Sep 2026:
          // "a clear outline entrance and exit door marker in red"). At The
          // Landing the built doorway (makePoolsExitDoor) already carries
          // both, standing in the same cell, so this one keeps quiet — two
          // signs stacked over one door was the old muddle.
          const label = makeLabel(doorSignText(back, open), DOOR_RED);
          scene.add(label);
          doorSite = { x, y, open, group: makeDoor(x, y, open), label, outline: null, quiet: false, back };
          placeDoorLabel();
          if (pendingDoorMixer) {
            doorSite.mixer = pendingDoorMixer.mixer;
            doorSite.t = pendingDoorMixer.t;
            doorSite.swinging = false;
            pendingDoorMixer = null;
          }
        } else if (doorSite.open !== open) {
          doorSite.open = open;
          {
            // the sign says OPEN now
            scene.remove(doorSite.label);
            doorSite.label = makeLabel(doorSignText(!!doorSite.back, open), DOOR_RED);
            scene.add(doorSite.label);
            placeDoorLabel();
          }
          if (doorSite.mixer) {
            // IT SWINGS. The model door animates open where the old slab was
            // rebuilt standing ajar, so the moment the key turns you watch it
            // go — and the latch lands on the frame it starts moving, per the
            // sound-sync doctrine.
            doorSite.swinging = open;
            if (open) doorOpenSound();
            else { doorSite.t = 0; doorSite.mixer.setTime(0); }
          } else {
            // No model (still loading, or it failed): the built slab is
            // rebuilt ajar exactly as before.
            scene.remove(doorSite.group);
            doorSite.group = makeDoor(x, y, open);
            if (open) doorOpenSound();
          }
        }
      },
      onDoorTried: (ok, fresh, error) => {
        if (!ok) {
          note(
            error === "no_key" ? (level === 9 ? "locked. a brass keyhole — it wants a house key with a 9 on its tag." : level === 8 ? "you can't climb it bare-handed. it wants a rope." : level === 7 ? "it won't open. you need the helmet to stay down here long enough." : level === 6 ? "the hatch's hub is bare. it wants its wheel." : level === 5 ? "locked. a big iron keyhole — it wants the Boiler Key." : level === 4 ? "the reader beeps red. it wants the security keycard." : level === 1 ? "locked. the grate has a keyhole — the Poolrooms' key is somewhere dry." : "locked. a keyhole, and nothing to grip.")
            : error === "test_run" ? "a test run can't open it for real"
            : error === "too_far" ? "closer…"
            : "it won't move",
          );
          return;
        }
        // THE HELMET IS A TOOL, NOT A KEY: it stays on for the swim back up
        if (level !== 7) hasKey = false;
        if (fresh && level === 9) {
          keyChip = "";
          suburbSfx("unlock", 0, 0, 0, 0.9);
          // one swing for everybody: whichever of this answer and the
          // level10 frame lands first plays it, the other finds it open
          if (!suburb.frontDoor()?.open) {
            suburb.openFrontDoor();
            syncFrontExit();
            setTimeout(() => suburbSfx("door-open", 0, 0, 0, 0.9), 700);
          }
          note("the key turns. the door of Number 9 swings in on a warm hall, and the lights are on. it's open — for everyone. walk through it.");
        } else if (fresh && level === 8) {
          keyChip = "";
          caveSfx("rope-fix", 0, 0, 0, 0.9);
          note("you hammer in a piton and tie off. the rope hangs up the chimney — the climb is open for everyone.");
        } else if (fresh && level === 7) {
          oceanSfx("stair-open", 0, 0, 0, 0.9);
          note("the gate at the bottom of the stair swings open — for everyone. now swim back up: the helmet is still on.");
        } else if (fresh && level === 6) {
          keyChip = "";
          lightsSfx("wheel-fit", 0, 0, 0, 0.9);
          note("the wheel bites on the hub. it turns. the hatch swings in — and the sea is right there. open for everyone.");
        } else if (fresh && level === 5) {
          keyChip = "";
          note("the key turns. the rusty door grinds open — for everyone.");
        } else if (fresh && level === 4) {
          keyChip = "";
          note("the reader turns green. the stairwell door is open — for everyone.");
        } else if (fresh) level1Open = true;
        else note("the door is already open");
      },
      onLevel1: (who) => {
        level1Open = true;
        level1By = who;
      },
      onHatch: (x, y, open) => {
        if (hatchSite && hatchSite.open === open) return;
        if (hatchSite) {
          scene.remove(hatchSite.group);
          scene.remove(hatchSite.label);
          if (open) doorOpenSound();
        }
        const label = makeLabel(open ? "THE DRAIN · OPEN — PIPE DREAMS" : "THE DRAIN · LOCKED", DOOR_RED);
        pinToGround(label, x, y, 1.6);
        scene.add(label);
        hatchSite = { x, y, open, group: makeHatch(x, y, open), label };
      },
      onLevel2: (who) => showGate("THE DRAIN IS OPEN", "LEVEL 2 — PIPE DREAMS", who, "turned the key. It stays open for everyone, forever."),
      onLevel3: (who) => showGate("THE PRESSURE DOOR IS OPEN", "LEVEL 3", who, "put in the last fuse. Nobody has been through yet."),
      onLevel4: (who) => showGate("THE LIFT SHUTTER HAS POWER", "LEVEL 4", who, "threw the last breaker. Nobody has been down yet."),
      onLevel5: (who) => {
        if (officeDoor && !officeDoor.open) {
          officeDoor.open = true;
          relabelOfficeDoor(officeDoor);
          doorOpenSound();
        }
        showGate("THE STAIRWELL DOOR IS OPEN", "LEVEL 5", who, "badged the keycard. Nobody has been down yet.");
      },
      onStairDoor: (d) => {
        if (level === 4) placeOfficeDoor(d);
      },
      onRustyDoor: (d) => {
        if (level !== 5) return;
        if (hotel.setRustyDoor(d)) hotelSfx("rusty-door", Math.hypot(d.x - player.x, d.y - player.y), wallsBetween(world, player.x, player.y, d.x, d.y));
      },
      onLevel6: (who) => {
        if (level === 5) {
          const rd = hotel.rustyDoor();
          if (rd && !rd.open && hotel.setRustyDoor({ ...rd, side: 0, open: true })) hotelSfx("rusty-door", Math.hypot(rd.x - player.x, rd.y - player.y), wallsBetween(world, player.x, player.y, rd.x, rd.y));
        }
        showGate("THE RUSTY DOOR IS OPEN", "LEVEL 6", who, "turned the Boiler Key. Nobody has been through yet.");
      },
      onSubway: (d) => {
        if (level !== 7) return;
        if (ocean.setSubway(d)) oceanSfx("stair-open", Math.hypot(d.x - player.x, d.y - player.y), 0, 0, 0.6);
      },
      onLevel8: (who) => {
        if (level === 7) {
          const h = ocean.subwayState();
          if (h && !h.open) ocean.setSubway({ ...h, side: 0, open: true });
        }
        showGate("THE SUBWAY STAIR IS OPEN", "LEVEL 8", who, "wore the helmet down to it. Nobody has been through yet.");
      },
      onFrontDoor: (d) => {
        if (level !== 9) return;
        const opened = suburb.setFrontDoor(d);
        syncFrontExit();
        if (opened) suburbSfx("door-open", Math.hypot(d.x - player.x, d.y - player.y), wallsBetween(world, player.x, player.y, d.x, d.y), panFor(player.x, player.y, player.yaw, d.x, d.y), 0.6);
      },
      onLevel10: (who) => {
        if (level === 9) {
          // everybody on the street hears it swing, not only the one who
          // turned the key (Nov 2026 validation run)
          const fd = suburb.frontDoor();
          if (fd && !fd.open) suburbSfx("door-open", Math.hypot(fd.x - player.x, fd.y - player.y), wallsBetween(world, player.x, player.y, fd.x, fd.y), panFor(player.x, player.y, player.yaw, fd.x, fd.y), 0.6);
          suburb.openFrontDoor();
          syncFrontExit();
        }
        showGate("NUMBER 9's FRONT DOOR IS OPEN", "THE WAY OUT", who, "turned the House Key. The door goes out.");
      },
      onWatch: (id, x, y, h, mode) => {
        if (level !== 9) return;
        suburb.watchPos(id, x, y, h, mode);
      },
      onWatchEv: (id, ev, x, y) => {
        if (level !== 9) return;
        if (ev === "gone") {
          suburb.watchGone(id);
          return;
        }
        const d = Math.hypot(x - player.x, y - player.y);
        const walls = wallsBetween(world, player.x, player.y, x, y);
        const pan = panFor(player.x, player.y, player.yaw, x, y);
        if (ev === "knock") {
          suburb.watchKnock(id);
          suburbSfx("knock", d, walls, pan, 1);
          if (d < 14) note("three knocks, at a door near you. stay away from the door.");
          return;
        }
        suburb.watchStrike(id);
        suburbSfx("take", d, walls, pan, 1);
      },
      onChimney: (d) => {
        if (level !== 8) return;
        if (cave.setChimney(d)) caveSfx("rope-fix", Math.hypot(d.x - player.x, d.y - player.y), wallsBetween(world, player.x, player.y, d.x, d.y), panFor(player.x, player.y, player.yaw, d.x, d.y), 0.6);
      },
      onLevel9: (who) => {
        if (level === 8) {
          const h = cave.chimneyState();
          if (h && !h.open) cave.setChimney({ ...h, side: 0, open: true });
        }
        showGate("THE CHIMNEY HAS A ROPE", "LEVEL 9", who, "carried it through the Deep. Nobody has climbed it yet.");
      },
      onBurrower: (id, x, y, mode) => {
        if (level !== 8) return;
        cave.burrowerPos(id, x, y, mode);
      },
      onBurrowerEv: (id, ev, x, y) => {
        if (level !== 8) return;
        if (ev === "gone") {
          cave.burrowerGone(id);
          return;
        }
        const d = Math.hypot(x - player.x, y - player.y);
        cave.burrowerStrike(id);
        caveSfx("strike", d, wallsBetween(world, player.x, player.y, x, y), panFor(player.x, player.y, player.yaw, x, y), 1);
      },
      onDeep: (ev, stage, uid, x, y, you) => {
        if (level !== 7) return;
        const d = you ? 0 : Math.hypot(x - player.x, y - player.y);
        if (ev === "strike") {
          ocean.strike(uid, x, y);
          oceanSfx("strike", d, 0, 0, 1);
          return;
        }
        ocean.deep(uid, stage, x, y, you);
        // a diver well under sees it pass OVER them, against the light, and
        // has no roof within reach: the notes say what they can see from
        // there (Nov 2026 polish round — the audit's L7-06)
        const deepDown = you && oceanDiving();
        if (stage === 1) {
          oceanSfx("pass", d, 0, 0, you ? 1 : 0.6);
          if (you) note(deepDown ? "something very large just passed over you, between you and the light." : "something very large just passed under you.");
        } else if (stage === 2 && you) note(deepDown ? "it's circling you, up there against the light. get up and out of the water." : "it's circling you. get out of the water.");
        else if (stage === 3) {
          oceanSfx("rise", d, 0, 0, you ? 1 : 0.7);
          if (you) {
            fallShake = Math.max(fallShake, 0.5);
            note(deepDown ? "THE LIGHT ABOVE YOU IS GOING OUT — IT IS RISING ALL ROUND YOU." : "THE WATER IS GOING DARK UNDER YOU — GET ON A ROOF.");
          }
        } else if (stage === 0 && you) note("it sinks away.");
      },
      onSeaHatch: (d) => {
        if (level !== 6) return;
        if (lights.setHatch(d)) lightsSfx("hatch-open", Math.hypot(d.x - player.x, d.y - player.y), wallsBetween(world, player.x, player.y, d.x, d.y), panFor(player.x, player.y, player.yaw, d.x, d.y));
      },
      onLevel7: (who) => {
        if (level === 6) {
          const h = lights.hatchState();
          if (h && !h.open && lights.setHatch({ ...h, side: 0, open: true })) lightsSfx("hatch-open", Math.hypot(h.x - player.x, h.y - player.y), wallsBetween(world, player.x, player.y, h.x, h.y));
        }
        showGate("THE SEA HATCH IS OPEN", "LEVEL 7", who, "fitted the Handwheel. Nobody has been through yet.");
      },
      onListener: (id, x, y, mode) => {
        if (level !== 6) return;
        const before = lights.nearestListener(player.x, player.y);
        lights.listenerPos(id, x, y, mode);
        // the rush of it coming for a noise, close
        if (mode === "lunge" && before?.mode !== "lunge") {
          const d = Math.hypot(x - player.x, y - player.y);
          if (d < 10) lightsSfx("lunge", d, wallsBetween(world, player.x, player.y, x, y), panFor(player.x, player.y, player.yaw, x, y), 0.9);
        }
      },
      onListenerEv: (id, ev, x, y, you) => {
        if (level !== 6) return;
        if (ev === "gone") {
          lights.listenerGone(id);
          return;
        }
        // the killing touch: it bites, heard where it happens; the victim's
        // own death screen does the rest, so they get no note (Nov 2026
        // polish round — it used to read as a touch: "DON'T MOVE" over your
        // own death)
        if (ev === "kill") {
          lights.struck(id, x, y);
          const dk = Math.hypot(x - player.x, y - player.y);
          lightsSfx("touch", you ? 0 : dk, you ? 0 : wallsBetween(world, player.x, player.y, x, y), you ? 0 : panFor(player.x, player.y, player.yaw, x, y), you ? 1 : 0.8);
          if (!you && dk < 12) note("somebody near you was taken");
          return;
        }
        lights.touched(id);
        const d = Math.hypot(x - player.x, y - player.y);
        lightsSfx("whisper", d, wallsBetween(world, player.x, player.y, x, y), panFor(player.x, player.y, player.yaw, x, y), you ? 1 : 0.6);
        if (you) {
          lightsSfx("touch", 0, 0, 0, 1);
          fallShake = Math.max(fallShake, 0.6);
          note("a cold hand on the back of your neck. DON'T MOVE — or run, now. it is listening.");
        } else if (d < 12) note("somebody near you was just touched");
      },
      onHeat: (v) => {
        if (v >= 100 && heat < 100) {
          hotelSfx("heat-sizzle", 0, 0, 0.8);
          note("the heat is cooking you — get back upstairs, or drink");
        } else if (v >= 70 && heat < 70) note("it's getting very hot down here");
        heat = v;
      },
      onMoths: (id, x, y, mode) => {
        if (level === 5) hotel.mothPos(id, x, y, mode);
      },
      onMothsEv: (id, ev, x, y) => {
        if (level !== 5) return;
        hotel.mothEv(id, ev, x, y);
        if (ev === "wake") {
          const d = Math.hypot(x - player.x, y - player.y);
          hotelSfx("wake", d, wallsBetween(world, player.x, player.y, x, y));
          if (d < 14) note("something on the ceiling just woke up");
        }
      },
      onRegister: (r) => {
        if (!r.ok) {
          note(r.error === "too_far" ? "closer…" : "the register's pages are stuck together");
          return;
        }
        hotelSfx("register-page", 0, 0, 0.9);
        registerLine = `Most of the ink has run. One line is still clear — a guest who never checked out: SUITE ${r.number}.`;
        if (registerTimer) clearTimeout(registerTimer);
        registerTimer = setTimeout(() => (registerLine = null), 12000);
      },
      onLifted: (r) => {
        if (!r.ok) {
          note(r.error === "too_far" ? "closer…" : r.error === "bad_floor" ? "that button doesn't press" : "the lift won't move");
          return;
        }
        hotelSfx("lift-ride", 0, 0, 0.9);
        player.x = r.x!;
        player.y = r.y!;
        wantChunks(true);
        setTimeout(() => hotelSfx("lift-chime", 0, 0, 0.9), 900);
        note(`the doors open on floor ${r.floor}. it looks like the same floor. it isn't where you were.`);
      },
      onPower: (power) => {
        if (level === 3) applyStationPower(power);
      },
      onArc: (ev) => {
        if (level === 3) arcAt(ev.x, ev.y, ev.side, ev.phase === "fire");
      },
      onBreaker: (ev) => {
        if (level !== 3) return;
        stationOn = ev.on;
        for (const st of stationSites) {
          if (st.kind === "breaker" && st.section === ev.section) {
            st.on = true;
            poseStation(st);
            stationSfx("breaker-on", Math.hypot(st.x - player.x, st.y - player.y), wallsBetween(world, player.x, player.y, st.x, st.y));
          }
          if (st.kind === "shutter") {
            st.on = st.on || ev.opened;
            poseStation(st);
          }
        }
        if (ev.by !== (session.user?.displayName ?? "")) note(`${ev.by} threw breaker ${ev.section} — ${ev.on} of ${ev.total} on`);
      },
      onBreakerThrown: (r) => {
        if (!r.ok) {
          note(r.error === "too_far" ? "closer…" : "the lever won't move");
          return;
        }
        if (!r.fresh) note(`it's already on. ${r.on} of ${r.total}.`);
        else note(r.opened ? "the last breaker. somewhere a shutter hums awake." : `breaker on — ${r.on} of ${r.total}`);
      },
      onCutoffPulled: (r) => {
        if (!r.ok) {
          note(r.error === "too_far" ? "closer…" : "the handle won't move");
          return;
        }
        stationSfx("cutoff");
        note(`the section's dead for ${Math.round((r.ms ?? 0) / 1000)}s — the water's safe. move.`);
      },
      onFuses: (list) => {
        const t = performance.now();
        for (const f of list) {
          const known = fuseSites.get(f.i);
          if (known) {
            known.seenAt = t;
            continue;
          }
          const label = makeLabel("a fuse", "#ffcf6a");
          pinToGround(label, f.x, f.y, 0.95);
          scene.add(label);
          fuseSites.set(f.i, { x: f.x, y: f.y, seenAt: t, mesh: makeFuse(f.x, f.y), label });
        }
      },
      onFuseTaken: (ok, carrying, error) => {
        if (!ok) {
          note(error === "too_far" ? "closer…" : "it's gone");
          return;
        }
        fusesCarrying = carrying;
        gearSfx("relic");
        note(`a fuse. ${carrying === 1 ? "take it" : `${carrying} of them — take them`} to the fuse box by the pressure door.`);
        for (const [i, fs] of fuseSites) {
          if (Math.hypot(fs.x - player.x, fs.y - player.y) < 2.2) {
            scene.remove(fs.mesh);
            scene.remove(fs.label);
            fuseSites.delete(i);
          }
        }
      },
      onFuseInPlay: (who) => note(`${who} picked up a fuse`),
      onOp: (v) => applyOperator(v),
      onFuseBox: (b) => {
        fusesCarrying = b.carrying;
        if (!fuseBoxSite) {
          const label = makeLabel(`FUSE BOX · ${b.inserted}/${b.total}`, DOOR_RED);
          pinToGround(label, b.x, b.y, 2.2);
          scene.add(label);
          fuseBoxSite = { ...b, label };
        } else if (fuseBoxSite.inserted !== b.inserted || fuseBoxSite.open !== b.open) {
          scene.remove(fuseBoxSite.label);
          const label = makeLabel(b.open ? "PRESSURE DOOR · OPEN" : `FUSE BOX · ${b.inserted}/${b.total}`, DOOR_RED);
          pinToGround(label, b.x, b.y, 2.2);
          scene.add(label);
          fuseBoxSite = { ...b, label };
        }
      },
      onFusesIn: (ok, inserted, added, opened, error) => {
        if (!ok) {
          note(error === "no_fuse" ? "the box wants fuses. you have none." : error === "too_far" ? "closer…" : error === "test_run" ? "a test run can't fill the box for real" : "it won't take them");
          return;
        }
        fusesCarrying = 0;
        if (added) doorOpenSound();
        note(opened ? "the last fuse. the pressure door grinds open." : added ? `${inserted} of 3 fuses in. ${3 - inserted} to go.` : "the box is already full");
      },
      onFuseAdded: (who, inserted) => note(`${who} put a fuse in the box — ${inserted} of 3`),
      onDrops: (list) => {
        const t = performance.now();
        for (const d of list) {
          const known = dropSites.get(d.id);
          if (known) {
            known.seenAt = t;
            continue;
          }
          const sprite = makeDropSprite(d.kind);
          pinToGround(sprite, d.x, d.y, 0.42);
          scene.add(sprite);
          const label = makeLabel(
            `${ITEM_LABEL[d.kind] ?? d.kind}${d.level ? ` L${d.level}` : ""}`,
            "#d8cfae",
          );
          pinToGround(label, d.x, d.y, 0.95);
          scene.add(label);
          dropSites.set(d.id, { x: d.x, y: d.y, kind: d.kind, seenAt: t, sprite, label });
        }
      },
      onDropped: (ok, itemId, kind, error) => {
        const pending = itemId; // echoed by the server — no pending-var race
        if (!ok) {
          note(
            error === "cant_drop_suit" ? "the suit stays on"
            : error === "not_carried" ? "nothing in hand"
            : "can't drop that",
          );
          return;
        }
        // The server confirmed it: clear the slot we dropped from.
        const idx = slots.findIndex((s) => s?.id === pending);
        if (idx !== -1) slots[idx] = null;
        batteries.delete(pending);
        if (kind === "flashlight") flashOn = false; // don't relight the next one
        note(`dropped ${ITEM_LABEL[kind ?? ""] ?? kind}`);
      },
      onTookDrop: (ok, item, charge, error) => {
        if (!ok) {
          note(error === "no_space" ? "no space in inventory" : error === "too_far" ? "closer…" : "it's gone");
          return;
        }
        if (!item) return;
        if (item.kind === "backpack" && slots.length < 9) {
          slots = [...slots, ...Array(9 - slots.length).fill(null)];
          note("backpack — 9 slots now");
        } else if (item.kind !== "suit") {
          const idx = slots.findIndex((s) => s === null);
          if (idx !== -1) slots[idx] = item;
          note(`picked up ${ITEM_LABEL[item.kind] ?? item.kind}`);
        }
        // Wear travels WITH the item (a dropped dead flashlight comes back
        // dead) — `charge` is what it had when it hit the floor.
        const full =
          item.kind === "flashlight" ? (FLASH_MIN[item.level] ?? 15) * 60
          : item.kind === "walkie" ? (WALKIE_MIN[item.level] ?? 7) * 60
          : item.kind === "spraycan" ? (SPRAY_SEC[item.level] ?? 90)
          : item.kind === "camera" ? (CAM_SEC[item.level] ?? 30)
          : 0;
        if (full > 0) batteries.set(item.id, charge === null ? full : Math.max(0, Math.min(full, charge)));
      },
      onWalkie: (id, on) => {
        if (on) radioPeers.add(id);
        else radioPeers.delete(id);
      },
      onMark: (m) => {
        if ((m.level ?? 0) !== level) return; // wrong world's paint
        addSprayMark(world, scene, m);
      },
      onMarksBatch: (cx, cy, lvl, marks) => {
        if (lvl !== level) return; // wrong world's paint
        clearChunkMarks(world, scene, cx, cy);
        for (const m of marks) addSprayMark(world, scene, m);
      },
      onCorpses: (list) => {
        const t = performance.now();
        for (const c of list) {
          const known = bodyMap.get(c.id);
          if (known) {
            known.seenAt = t;
            continue;
          }
          const avatar = makeBody(c.x, c.y, c.name, c.suit);
          // A body whose ragdoll is still flying stays hidden — the swap
          // happens when the flail settles (finishRagdoll reveals it).
          if (ragdolls.some((r) => Math.hypot(r.rx - c.x, r.ry - c.y) < 0.8)) avatar.group.visible = false;
          bodyMap.set(c.id, {
            x: c.x,
            y: c.y,
            avatar,
            seenAt: t,
            pool: bloodPool(scene, c.x * CELL, world.groundAt(c.x, c.y), c.y * CELL, c.id),
          });
        }
      },
      onCorpseView: (ok, id, name, items, error) => {
        if (!ok) {
          note(error === "too_far" ? "closer…" : "nothing there");
          return;
        }
        lootPanel = { id, name, items };
        unlockPointer();
      },
      onLooted: (ok, item, remaining, error) => {
        if (!ok) {
          note(error === "no_space" ? "no space in inventory" : error === "already_have" ? "you already have that relic — find the rest of this level's first" : "couldn't take it");
          return;
        }
        if (item) {
          // THE KEY and a FUSE take no slot: the hand holds them (Oct 2026
          // review — a looted key was a slot placeholder and the door, which
          // gates on hasKey, never opened)
          if (item.kind === "key") {
            hasKey = true;
            keyChip = keyChipFor(level);
            note("you took the key off the body");
          } else if (item.kind === "fuse") {
            fusesCarrying += 1;
          } else if (item.kind === "backpack" && slots.length < 9) {
            slots = [...slots, ...Array(9 - slots.length).fill(null)];
            note("backpack — 9 slots now");
          } else if (item.kind !== "suit" && item.kind !== "backpack") {
            const idx = slots.findIndex((s) => s === null);
            // the server's real locker id, so it can be dropped and used
            const id = typeof item.id === "number" && item.id ? item.id : -Math.floor(Math.random() * 1e9);
            if (idx !== -1) slots[idx] = { id, kind: item.kind, level: item.level, color: item.color };
            if (item.kind === "flashlight") batteries.set(id, (FLASH_MIN[item.level] ?? 15) * 60);
            if (item.kind === "walkie") batteries.set(id, (WALKIE_MIN[item.level] ?? 7) * 60);
            if (item.kind === "spraycan") batteries.set(id, SPRAY_SEC[item.level] ?? 90);
            if (item.kind === "camera") batteries.set(id, CAM_SEC[item.level] ?? 30);
          }
          if (item.kind === "suit") note("took the suit");
        }
        if (lootPanel) {
          if (remaining.length) lootPanel = { ...lootPanel, items: remaining };
          else {
            lootPanel = null;
            resume();
          }
        }
      },
      onPeerGear: (id, kind, x, y) => {
        const lvl = peerLevel(x, y, wallCache.get(id) ?? 0);
        if (kind === "pills") gearSfx("pills", lvl);
        else if (kind === "almondwater") gearSfx("drink", lvl);
        else if (kind === "battery") gearSfx("battery", lvl);
      },
      onConsumed: (ok, itemId, kind, serverHp) => {
        if (!ok) {
          pendingCharge.delete(itemId);
          note("can't use that");
          return;
        }
        const idx = slots.findIndex((s) => s?.id === itemId);
        if (idx !== -1) slots[idx] = null;
        if (kind === "pills") {
          if (typeof serverHp === "number") hp = serverHp; // server owns health in v2
          gearSfx("pills");
          note("patched up (+50%)");
        } else if (kind === "almondwater") {
          stamina = 100;
          winded = false;
          // Josh, July 2026: drinking buys 7 SECONDS OF FREE LEGS — sprint
          // and jumps cost nothing while it lasts. Plus an audible gulp.
          staminaFreeUntil = performance.now() + 7000;
          gearSfx("drink");
          note("almond water — 7s of free legs. suspiciously fine.");
        } else if (kind === "battery") {
          const target = pendingCharge.get(itemId);
          pendingCharge.delete(itemId);
          gearSfx("battery");
          if (target) {
            const cap =
              target.kind === "flashlight"
                ? (FLASH_MIN[target.level] ?? 15) * 60
                : (WALKIE_MIN[target.level] ?? 7) * 60;
            batteries.set(target.id, cap);
            note(`${target.kind === "flashlight" ? "flashlight" : "walkie"} recharged`);
          }
        }
      },
      onStalker: (x, y, mode, burn) => {
        loadStalker();
        const st = stalkerInst;
        if (!st) return;
        st.burn = burn;
        const nx = x * CELL;
        const nz = y * CELL;
        const last = st.snaps[st.snaps.length - 1];
        // no frame yet (a fresh arrival) is a teleport too: it is placed, never
        // glided across the map from where it last vanished (Nov 2026)
        if (!last || Math.hypot(nx - last.x, nz - last.z) > 6) {
          st.snaps.length = 0;
          st.group.position.set(nx, world.groundAt(x, y), nz);
        }
        st.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (st.snaps.length > 10) st.snaps.shift();
        st.mode = mode;
        st.seenAt = performance.now();
      },
      onShy: (x, y, mode, targetId) => {
        loadShy();
        const sh = shyInst;
        if (!sh) return;
        const nx = x * CELL;
        const nz = y * CELL;
        const last = sh.snaps[sh.snaps.length - 1];
        if (!last || Math.hypot(nx - last.x, nz - last.z) > 6) {
          sh.snaps.length = 0;
          sh.group.position.set(nx, world.groundAt(x, y), nz);
        }
        sh.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (sh.snaps.length > 10) sh.snaps.shift();
        const wasQuiet = sh.mode === "lurk" || sh.mode === "leave";
        sh.mode = mode;
        sh.targetId = targetId;
        sh.seenAt = performance.now();
        // THE SCREAM starts on the TRIGGER frame — the moment its hands go
        // up, not when the run begins. That two-second wind-up is the whole
        // horror of it, and it should be audible from the first instant.
        if (wasQuiet && (mode === "trigger" || mode === "chase")) {
          shyScreaming = true;
          shyScream();
        } else if (shyScreaming && (mode === "lurk" || mode === "leave")) {
          shyScreaming = false;
          shyQuiet();
        }
      },
      onBleeder: (x, y, h, mode, targetId, burn) => {
        loadBleeder();
        const b = bleederInst;
        if (!b) return;
        b.targetId = targetId;
        const nx = x * CELL;
        const nz = y * CELL;
        const last = b.snaps[b.snaps.length - 1];
        if (!last || Math.hypot(nx - last.x, nz - last.z) > 6) {
          b.snaps.length = 0;
          b.group.position.set(nx, world.groundAt(x, y), nz);
        }
        if (!b.seenAt) {
          b.group.position.set(nx, world.groundAt(x, y), nz);
          b.heading = h;
        }
        b.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (b.snaps.length > 10) b.snaps.shift();
        // the touch: it was charging and now it is over a body
        if (b.mode === "chase" && mode === "feed") {
          const d = Math.hypot(x - player.x, y - player.y);
          bleederCry("attack", d, wallsBetween(world, player.x, player.y, x, y));
        }
        b.mode = mode;
        b.burn = burn;
        b.wantH = h;
        b.seenAt = performance.now();
      },
      onGrabber: (x, y, h, mode, targetId) => {
        loadGrabber();
        const gb = grabberInst;
        if (!gb) return;
        gb.targetId = targetId;
        const nx = x * CELL;
        const nz = y * CELL;
        const last = gb.snaps[gb.snaps.length - 1];
        if (!gb.seenAt || (last && Math.hypot(nx - last.x, nz - last.z) > 6)) {
          gb.snaps.length = 0;
          gb.group.position.set(nx, world.groundAt(x, y), nz);
          gb.heading = h;
        }
        gb.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (gb.snaps.length > 10) gb.snaps.shift();
        gb.mode = mode;
        gb.wantH = h;
        gb.seenAt = performance.now();
        if (grabbedBy && targetId === session.user?.id) grabbedBy = { x, y };
      },
      onFly: (ok, on, error) => {
        if (ok) {
          if (on !== ctl.fly.on) applyFly(on); // the server's word is the state
          return;
        }
        // refused: put the camera back the way it was before the key
        applyFly(!ctl.fly.on);
        note(error === "bad_landing" ? "can't land here — the server says that's not open floor" : error === "forbidden" ? "the flycam is the operator's" : `flycam refused (${error || "no reason given"})`);
      },
      onGrabberGone: () => {
        const gb = grabberInst;
        grabbedUntil = 0;
        grabbedBy = null;
        if (!gb) return;
        gb.group.visible = false;
        gb.snaps.length = 0;
        gb.seenAt = 0;
        gb.mode = "stalk";
        updateGrabberSound(null, false, 0, GRABBER_HEAR_CELLS);
      },
      onGrabberCry: (cry, x, y, targetId) => {
        const d = Math.hypot(x - player.x, y - player.y);
        grabberCry(cry, d, wallsBetween(world, player.x, player.y, x, y));
        if (cry === "screech") {
          // a light found it: it lets go of whoever it had and runs
          if (grabbedUntil) {
            grabbedUntil = 0;
            grabbedBy = null;
            note("it let go — it's running.");
          }
          // and its flight a beat after, as it bolts (not stacked on the screech)
          setTimeout(() => {
            const gb = grabberInst;
            const fx = gb ? gb.group.position.x / CELL : x;
            const fy = gb ? gb.group.position.z / CELL : y;
            grabberCry("flee", Math.hypot(fx - player.x, fy - player.y), wallsBetween(world, player.x, player.y, fx, fy));
          }, 900);
        } else if (cry === "grab" && targetId === session.user?.id) {
          // IT HAS YOU: turned round to face it, held still
          grabbedUntil = performance.now() + 1500;
          grabbedBy = { x, y };
          fallShake = Math.max(fallShake, 0.35);
          ctl.keys.clear();
          note("IT HAS YOU — somebody light it!");
        }
      },
      onTemp: (x, y, h, pose, moving) => {
        loadTemp();
        const t = tempInst;
        if (!t) return;
        if (t.pose !== pose) poseTemp(pose);
        t.group.position.set(x * CELL, world.groundAt(x, y), y * CELL);
        t.group.rotation.y = h;
        t.moving = moving;
        t.seenAt = performance.now();
      },
      onTempFreeze: (x, y, pose) => {
        poseTemp(pose);
        officeSfx("creak", Math.hypot(x - player.x, y - player.y), wallsBetween(world, player.x, player.y, x, y));
      },
      onTempGone: () => {
        if (tempInst) {
          tempInst.group.visible = false;
          tempInst.seenAt = 0;
          tempInst.moving = false;
        }
        updateTempSound(null, false, 0);
      },
      onBlink: (zone, ms) => {
        if (level !== 4) return;
        zoneDipUntil.set(zone, performance.now() + ms);
        // the troffers of YOUR zone dip with everyone else's in it
        if (world.sectionAt(Math.floor(player.x), Math.floor(player.y)) !== zone) return;
        officeDipUntil = performance.now() + ms;
        officeSfx("blink", 0, 0, 0.35);
      },
      onBleederGone: () => {
        const b = bleederInst;
        if (!b) return;
        b.group.visible = false;
        b.snaps.length = 0;
        b.seenAt = 0;
        b.mode = "hunt";
        updateBleederSound(null, "hunt", 0);
      },
      onBleederCry: (cry, x, y, targetId) => {
        const d = Math.hypot(x - player.x, y - player.y);
        bleederCry(cry, d, wallsBetween(world, player.x, player.y, x, y));
        if (cry === "scream" && targetId === session.user?.id) {
          fallShake = Math.max(fallShake, 0.25);
          note("something in the dark has seen you. LIGHT — hold the beam on it.");
        }
      },
      onShyGone: () => {
        const sh = shyInst;
        if (shyScreaming) {
          shyScreaming = false;
          shyQuiet();
        }
        if (!sh) return;
        sh.group.visible = false;
        sh.snaps.length = 0;
        sh.seenAt = 0;
        sh.mode = "lurk";
      },
      onGator: (id, x, y, h, mode) => {
        const g = ensureGator(id);
        if (!g) return;
        const nx = x * CELL;
        const nz = y * CELL;
        const last = g.snaps[g.snaps.length - 1];
        if (!last || Math.hypot(nx - last.x, nz - last.z) > 6) {
          g.snaps.length = 0;
          g.group.position.set(nx, g.group.position.y, nz);
        }
        g.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (g.snaps.length > 10) g.snaps.shift();
        g.wantH = h;
        g.mode = mode;
        g.seenAt = performance.now();
      },
      onGatorBite: (id, x, y) => {
        // The munch, from where the bite landed — the victim's own hp frame
        // rides the normal hurt pipeline.
        const d = Math.hypot(x - player.x, y - player.y);
        gatorMunch(d, wallsBetween(world, player.x, player.y, x, y));
      },
      onDeath: (ev) => {
        // THE SEND-OFF (Aug 2026). Arrives before the dead/bye frames, so
        // the body is mid-air by the time the avatar vanishes. Blood first
        // (the wound sprays from where they DIED), then the seeded flail.
        bloodBurst(world, scene, ev.x, ev.y, world.groundAt(ev.x, ev.y) + 1.15, ev.dir, ev.seed);
        const entry = spawnRagdoll(ev);
        if (ev.id === (session.user?.id ?? -1)) {
          // My own death: watch it happen. The camera steps back opposite
          // the throw (clamped out of walls) and tracks the tumbling body;
          // onDead holds the red screen until the show is over.
          dying = true;
          if (viewmodel) viewmodel.group.visible = false;
          if (heldObj) heldObj.visible = false;
          let back = 2.6;
          const hit = wallHit(world, ev.x, ev.y, -Math.sin(ev.dir), -Math.cos(ev.dir), back / CELL);
          if (hit) back = Math.max(0.8, hit.dist * CELL - 0.4);
          deathCam = {
            x: ev.x * CELL - Math.sin(ev.dir) * back,
            y: world.groundAt(ev.x, ev.y) + 1.9,
            z: ev.y * CELL - Math.cos(ev.dir) * back,
            rag: entry,
          };
        }
      },
      onStalkerMimic: (of, x, y) => {
        // A snatch of a REAL player's voice from the wrong dark — replayed
        // from this client's own proximity-voice capture (never recorded,
        // never uploaded). If that player hasn't spoken lately it simply
        // says nothing, which is somehow worse.
        voice?.playMimic?.(of, x, y);
      },
      onBoats: (list) => {
        const me = session.user?.id ?? -1;
        for (const f of list) {
          const v = ensureBoatView(f);
          v.group.position.set(f.x * CELL, boatSurfaceY(f.x, f.y), f.y * CELL);
          v.group.rotation.y = f.h;
          // RESUME: a reload (or a re-entry) finds the server still holding
          // your seat — take the oars back instead of standing in the hull
          // as a ghost who can't row. Only if the body is actually AT the
          // boat: an admin flycam (or any teleport) can leave the session
          // holding a seat from across the map, and re-adopting it would
          // drag the hull along on dry tile.
          const mine = f.captain === me || f.passenger === me;
          if (!mine) continue;
          if (Math.hypot(f.x - player.x, f.y - player.y) > 3.2) {
            net?.boatLeave(); // resync: we're nowhere near it
            continue;
          }
          myBoat = { id: f.id, seat: f.captain === me ? "captain" : "passenger" };
        }
        // Only a WET starting point is a good one to fall back to.
        if (myBoat && world.waterDepthAt(Math.floor(player.x), Math.floor(player.y)) > 0.05) {
          boatLastGood = { x: player.x, y: player.y };
        }
      },
      onBoat: (f) => {
        // My own captained boat is local-authoritative — ignore the echo.
        if (myBoat && myBoat.seat === "captain" && myBoat.id === f.id) {
          const v = boatViews.get(f.id);
          if (v) {
            v.captain = f.captain;
            v.passenger = f.passenger;
          }
          return;
        }
        ensureBoatView(f);
      },
      onBoatSeat: (id, seat, error) => {
        if (id === null) {
          if (error === "boat_full") note("no room aboard");
          else if (error === "too_far") note("get closer to the boat");
          else if (myBoat) note("back on your own two feet");
          myBoat = null;
          boatLastGood = null;
          return;
        }
        myBoat = { id, seat: seat ?? "passenger" };
        boatLastGood = { x: player.x, y: player.y };
        note(seat === "captain" ? "you take the back bench — WASD paddles, E steps off" : "you take the front bench — E steps off");
      },
      onEntity: (x, y, mode, id) => {
        loadEntity();
        if (!entInsts.has(id)) makeEntInst?.(id);
        const inst = entInsts.get(id);
        if (!inst) return; // still downloading — frames resume once built
        const nx = x * CELL;
        const nz = y * CELL;
        const lastSnap = inst.snaps[inst.snaps.length - 1];
        // A jump of 6m+ between frames is a TELEPORT (fresh summon, wake on
        // the far side of a relic site) — clear the buffer and place the
        // body there directly rather than gliding it across the map.
        if (!lastSnap || Math.hypot(nx - lastSnap.x, nz - lastSnap.z) > 6) {
          inst.snaps.length = 0;
          inst.group.position.set(nx, world.groundAt(x, y), nz);
        }
        inst.snaps.push({ x: nx, z: nz, at: performance.now() });
        if (inst.snaps.length > 10) inst.snaps.shift();
        inst.mode = mode;
        inst.seenAt = performance.now();
      },
      onBrownout: (ms, black) => {
        brownStart = performance.now();
        brownUntil = performance.now() + ms;
        brownBlack = black;
        note(black ? "the lights are going" : "the lights…");
      },
      onHurt: (serverHp, drop, cause) => {
        hp = serverHp;
        if (cause === "drowning") {
          // The water is taking it — the underwater wash already screams;
          // one note, not a spam of them.
          if (Math.ceil(serverHp) % 20 === 0) note("your lungs are burning");
          return;
        }
        if (cause === "shock") {
          // the live water: a zap every 400ms you stand in it
          stationSfx("shock", 0, 0, 0.7);
          fallShake = Math.max(fallShake, 0.45);
          if (performance.now() - lastShockNote > 2500) {
            lastShockNote = performance.now();
            note("the water's live — GET OUT, or cut the section's power");
          }
          return;
        }
        if (cause === "arc") {
          fallShake = 0.9;
          note("the panel arced into you. keep clear of the crackling ones.");
          return;
        }
        if (cause === "moths") {
          // wings at your ears and stings — the bite sound, throttled
          if (performance.now() - lastMothBite > 900) {
            lastMothBite = performance.now();
            hotelSfx("bite", 0, 0, 0.8);
            fallShake = Math.max(fallShake, 0.25);
          }
          if (performance.now() - lastMothNote > 4000) {
            lastMothNote = performance.now();
            note("they're on you — TORCH OFF, and get out of their sight");
          }
          return;
        }
        if (cause === "the heat" || cause === "a furnace") {
          if (performance.now() - lastHeatNote > 3000) {
            lastHeatNote = performance.now();
            hotelSfx("heat-sizzle", 0, 0, 0.6);
            note(cause === "a furnace" ? "the furnace's mouth — step away from it" : "the heat is burning you — get upstairs");
          }
          return;
        }
        if (cause === "burrower") {
          // Its first bite (the strike played from its frame): one more and
          // you're dead, so the note is the way out.
          fallShake = 0.9;
          note("it bit you — the next one kills. GET OUT INTO THE OPEN");
          return;
        }
        if (cause === "gator") {
          // Teeth. The munch already played from the bite frame; this is the
          // jolt you feel and the one instruction that matters.
          fallShake = 0.8;
          note("teeth — GET OUT OF THE WATER");
          return;
        }
        // A landing you felt: screen jolt + a grunt of a note.
        fallShake = Math.min(1, drop / 8);
        note(drop >= 6 ? "that was too far" : "ouch");
      },
      onSpectate: (st) => {
        if (!st) {
          // nobody left alive: the watch is over
          const was = spec !== null;
          spec = null;
          if (ghostKey) {
            ghostKey = false;
            voice?.setMuted(true);
          }
          leaveGhostVoice();
          if (was && specOn) {
            specOn = false;
            note("nobody left alive down here — the watch is over");
            window.setTimeout(() => {
              leavingOnPurpose = true;
              onExit();
            }, 2_500);
          }
          return;
        }
        spec = { ...st, at: performance.now() };
        if (st.talking && ghostKey) {
          // the server granted the talk: only the one we watch may hear it
          voice?.setListeners([st.target]);
          if (voice?.muted()) voice.setMuted(false);
        } else if (!st.talking && voice && !voice.muted()) {
          // the server ran the clock out (or refused, or we let go)
          voice.setMuted(true);
        }
        // the dead's own room: free talk with the others watching
        if (!ghostVoice && !ghostJoining) joinGhostVoice();
      },
      onGhost: (g) => {
        if (g.on) {
          if (!ghostsTalking.has(g.id) && performance.now() - lastGhostNote > 8_000) {
            lastGhostNote = performance.now();
            note(`👻 ${g.name} whispers from the other side`);
          }
          ghostsTalking.set(g.id, { yaw: g.yaw, name: g.name });
          voice?.setPeerPitch(g.id, 1.22);
        } else {
          ghostsTalking.delete(g.id);
          voice?.setPeerPitch(g.id, 1);
        }
      },
      onDead: (cause) => {
        // the victim's session is gone before any frame says "feed", so the
        // bite is played here, on the death itself
        if (cause === "the bleeder") bleederCry("attack", 0, 0);
        if (cause === "the grabber") grabberCry("grab", 0, 0);
        if (cause === "the temp") officeSfx("kill", 0, 0);
        grabbedUntil = 0;
        grabbedBy = null;
        confirmForfeit = false;
        // nothing a living runner had open stays up over the death (Oct 2026
        // review: the loot panel's buttons acted on a dead session)
        lootPanel = null;
        landingChoice = false;
        reading = null;
        showMap = false;
        liftAt = null;
        unlockPointer();
        stopSprayHiss();
        // If it was close enough to be on screen, this was its kill — let it
        // play the jumpscare over the red flash. Deaths that aren't the entity
        // (a fall, a forfeit, the grace window) leave it alone: it isn't there
        // and the model is usually not even visible.
        // (law 2 audit: it used to play the kill on ANY death with an Entity in
        // view — a fall or the Shy Guy got the Entity's frantic tempo.)
        if (cause === "the entity") {
          for (const inst of entInsts.values()) {
            if (inst.group.visible) playEntClip(inst, "kill");
          }
        }
        updateEntitySound(null, false, 0);
        // THE SEND-OFF HOLD (Aug 2026): if a death event set up the ragdoll
        // cam, the red screen waits while you watch your own body fly. A
        // crumple gets a shorter look; no ragdoll at all (grace-window
        // deaths) plays the old immediate sequence.
        const watch = deathCam ? 2_300 : dying ? 1_200 : 0;
        window.setTimeout(() => {
          deadScreen = "flash";
          deadCause = cause;
          window.setTimeout(() => (deadScreen = "black"), 900);
          window.setTimeout(() => {
            // LAW 12: somebody is still alive down here — watch them
            if (spec) {
              deadScreen = "none";
              specOn = true;
              deathCam = null;
              voice?.setMuted(true); // the dead speak only through the ghost key
              note("you are watching the living — click to look around");
              return;
            }
            leavingOnPurpose = true;
            onExit();
          }, 3_400);
        }, watch);
      },
    });
    net.enter(door, loadout, enterLevel);

    const wantChunks = (immediate = false): void => {
      const now = performance.now();
      if (!immediate && now - lastChunkCheck < 250) return;
      lastChunkCheck = now;
      const pcx = Math.floor(player.x / chunkSize);
      const pcy = Math.floor(player.y / chunkSize);
      const missing: { cx: number; cy: number }[] = [];
      const maxC = Math.ceil(worldSize / chunkSize);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          if (cx < 0 || cy < 0 || cx >= maxC || cy >= maxC) continue;
          const k = `${cx},${cy}`;
          const asked = requested.get(k);
          if (!world.meshes.has(k) && (asked === undefined || now - asked > 2500)) {
            requested.set(k, now);
            missing.push({ cx, cy });
          }
        }
      }
      if (missing.length) net!.requestChunks(missing);
      // A pruned chunk must leave the "already asked for this" set, or
      // walking back into it streams nothing — and its SPRAY MARKS (which
      // arrive with the chunk) would stay missing for the whole session.
      for (const k of pruneChunks(world, scene, pcx, pcy, 4)) requested.delete(k);
    };

    // ---- Input ---------------------------------------------------------
    const canvas = renderer.domElement;
    const engageFallback = (): void => {
      if (lockFallback && locked) return;
      lockFallback = true;
      locked = true;
      wasLocked = true;
      canvas.style.cursor = "none";
    };
    /** The three facts the lock policy needs. `hasApi` is read off the live
     *  element rather than assumed, because "advertises it, never grants it"
     *  is a real webview shape. */
    const lockEnv = (el: HTMLElement) => ({
      hasApi: typeof (el as HTMLElement & { requestPointerLock?: unknown }).requestPointerLock === "function",
      isMac,
      isShell: isDesktopShell,
    });
    /** Ask for the mouse. The whole policy — who may use the cursor-following
     *  pseudo-lock, and which refusals are worth answering — lives in
     *  lib/pointerlock.ts, shared with the casino and covered by
     *  scripts/checks/test_pointerlock.mjs. RAW MOUSE (`unadjustedMovement`)
     *  is asked for there too: Chromium runs lock deltas through the OS
     *  acceleration curve otherwise, which is what makes a fast flick
     *  over-rotate out of all proportion to a slow one. */
    const grabPointer = (): void => {
      acquirePointerLock(canvas, {
        raw: brSettings.rawMouse,
        env: lockEnv(canvas),
        onFallback: engageFallback,
        onUnlocked: () => {
          // Staying unlocked is the right answer where a real lock exists:
          // one more click, rather than a camera that throws itself around.
          note("click to take the controls back");
        },
      });
    };
    grabPointerFn = grabPointer;
    cleanupFns.push(() => {
      grabPointerFn = null;
    });
    const onClick = (): void => {
      if (!locked) {
        if (lockFallback) engageFallback(); // resume from the fallback pause
        else grabPointer();
      }
      voice?.onGesture(); // retry any autoplay-blocked voices on real input
      startHum(); // needs a gesture once; idempotent after
    };
    const onLockChange = (): void => {
      const real = document.pointerLockElement === canvas;
      if (real && lockFallback) {
        // A real lock arrived after all — retire the fallback.
        lockFallback = false;
        canvas.style.cursor = "";
      }
      if (lockFallback) return; // the fallback owns `locked`
      locked = real;
      if (locked) wasLocked = true; // from now on, unlock = the pause menu
      else {
        // Losing the pointer drops everything held: no stuck stride, no
        // crouch latch, no can hissing into a pause screen, no hot mic.
        // The emote WHEEL closes (it's held input) — a RUNNING dance keeps
        // dancing behind the pause menu; it roots you either way.
        ctl.keys.clear();
        crouching = false;
        sprayHeld = false;
        camAiming = false;
        wheelOpen = false;
        stopSprayHiss();
        if (txing) {
          txing = false;
          gearSfx("radio-off");
          net?.walkieTx(false);
        }
      }
    };
    let fbLastX = 0;
    let fbLastY = 0;
    let fbHaveLast = false;
    /** Where a locked-pointer delta goes: the emote wheel's cursor while it's
     *  open, the third-person orbit while a dance plays, the view otherwise.
     *  One router, so the Mac fallback path and the real lock agree. */
    const routeLook = (dx: number, dy: number, sens: number, invert: number): void => {
      if (wheelOpen) {
        wheelPoint(dx, dy); // UI cursor: raw deltas, no sensitivity/invert
        return;
      }
      if (emoting) {
        emoteYaw -= dx * 0.005;
        emotePitch = Math.max(0.08, Math.min(1.15, emotePitch + dy * 0.004));
        return;
      }
      if (specOn) {
        specYaw -= dx * 0.005 * sens;
        specPitch = Math.max(-0.2, Math.min(1.2, specPitch + dy * 0.004 * sens * invert));
        return;
      }
      ctl.onMouse(dx * sens, dy * sens * invert);
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (!locked) {
        fbHaveLast = false;
        return;
      }
      const sens = brSettings.mouseSensitivity;
      const invert = brSettings.invertY ? -1 : 1;
      if (lockFallback) {
        // Raw deltas without a lock: movementX where the webview provides
        // it, position differences where it doesn't. Boosted a little —
        // trackpad strokes stop at the screen edge, so each one must count.
        let dx = e.movementX;
        let dy = e.movementY;
        if (typeof dx !== "number" || typeof dy !== "number") {
          dx = fbHaveLast ? e.clientX - fbLastX : 0;
          dy = fbHaveLast ? e.clientY - fbLastY : 0;
        }
        fbLastX = e.clientX;
        fbLastY = e.clientY;
        fbHaveLast = true;
        // NOTHING OWNS THE CURSOR HERE, so it can leave the window and come
        // back somewhere else entirely, and that reads as one enormous
        // movement. No human flicks that far between two mouse events at
        // 60Hz; a jump that size is the pointer teleporting, so drop it
        // rather than whip the camera round.
        if (isTeleport(dx, dy)) return;
        routeLook(dx * 1.5, dy * 1.5, sens, invert);
        return;
      }
      routeLook(e.movementX, e.movementY, sens, invert);
    };
    // THE FIELD MAP is LIVE while it's open (Josh: "you have to keep reopening
    // the map to see where you are going"). The terrain — fog, walls, solids —
    // is a big base64 payload, so it is fetched ONCE on open and cached; only
    // the cheap layer (you, your heading, and the operator markers) repaints,
    // at 10Hz. The fog is re-fetched every few seconds so ground you chart
    // while walking with the map up appears without closing it.
    const MAP_S = 3;
    const MAP_REPAINT_MS = 100;
    const MAP_REFETCH_MS = 4000;
    type MapPayload = Awaited<ReturnType<typeof hubApi.backroomsMap>>;
    let mapPayload: MapPayload | null = null;
    let mapTerrain: HTMLCanvasElement | null = null; // pre-rendered fog+walls
    let mapFetchedAt = 0;
    let mapTimer: ReturnType<typeof setInterval> | null = null;

    /** Bake the static layer once per fetch — redrawing 131k cells at 10Hz
     *  would cost more than the game does. */
    const bakeTerrain = (m: MapPayload): void => {
      const n = m.size;
      const cnv = document.createElement("canvas");
      cnv.width = n * MAP_S;
      cnv.height = n * MAP_S;
      const ctx = cnv.getContext("2d")!;
      ctx.fillStyle = "#050403";
      ctx.fillRect(0, 0, n * MAP_S, n * MAP_S);
      const bits = (b64: string): Uint8Array => {
        const raw = atob(b64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
      };
      const bit = (buf: Uint8Array, i: number): number => (buf[i >> 3] >> (i & 7)) & 1;
      const explored = bits(m.explored);
      const wallN = bits(m.wallN);
      const wallW = bits(m.wallW);
      const solidB = bits(m.solid);
      ctx.fillStyle = "#c9b26a";
      for (let i = 0; i < n * n; i++) {
        if (bit(explored, i)) ctx.fillRect((i % n) * MAP_S, Math.floor(i / n) * MAP_S, MAP_S, MAP_S);
      }
      ctx.fillStyle = "#4a3d1e";
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          if (!bit(explored, i)) continue;
          if (bit(solidB, i)) ctx.fillRect(x * MAP_S, y * MAP_S, MAP_S, MAP_S);
          if (bit(wallN, i)) ctx.fillRect(x * MAP_S, y * MAP_S, MAP_S, 1);
          if (bit(wallW, i)) ctx.fillRect(x * MAP_S, y * MAP_S, 1, MAP_S);
        }
      }
      mapTerrain = cnv;
    };

    const paintGameMap = (): void => {
      const cnv = mapCanvas;
      const m = mapPayload;
      if (!cnv || !m || !mapTerrain) return;
      const n = m.size;
      const S = MAP_S;
      if (cnv.width !== n * S) {
        cnv.width = n * S;
        cnv.height = n * S;
      }
      const ctx = cnv.getContext("2d")!;
      ctx.drawImage(mapTerrain, 0, 0);

      // OPERATOR MARKERS — admins only (the server sends `operator` to nobody
      // else): this level's monsters, relics, drives and objectives, drawn by
      // the same code as the lobby map (opmap.ts).
      if (m.operator) drawOperator(ctx, m.operator, S, true);

      // YOU ARE HERE, live — with a wedge for which way you're facing, which
      // is the half of "where am I going" a dot can't answer.
      const px = player.x * S;
      const py = player.y * S;
      // yaw 0 faces north (-y in cell space); screen y grows southward.
      const fx = Math.sin(player.yaw) * -1;
      const fy = Math.cos(player.yaw) * -1;
      ctx.fillStyle = "rgba(92, 220, 120, 0.55)";
      ctx.beginPath();
      ctx.moveTo(px + fx * 16, py + fy * 16);
      ctx.lineTo(px + (-fy) * 6, py + fx * 6);
      ctx.lineTo(px + fy * 6, py + (-fx) * 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5cdc78";
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();

      // Follow the player rather than snapping once on open.
      const scroller = cnv.parentElement;
      if (scroller) {
        scroller.scrollLeft = px - scroller.clientWidth / 2;
        scroller.scrollTop = py - scroller.clientHeight / 2;
      }
    };

    const drawGameMap = async (): Promise<void> => {
      try {
        if (!mapPayload || Date.now() - mapFetchedAt > MAP_REFETCH_MS) {
          mapPayload = await hubApi.backroomsMap(level);
          mapFetchedAt = Date.now();
          bakeTerrain(mapPayload);
        }
        paintGameMap();
      } catch {
        /* the map desk isn't answering — overlay just keeps the last paint */
      }
    };

    /** Open/close drives the live loop; nothing repaints while it's shut. */
    const setMapOpen = (on: boolean): void => {
      if (mapTimer) {
        clearInterval(mapTimer);
        mapTimer = null;
      }
      if (!on) return;
      void drawGameMap();
      mapTimer = setInterval(() => {
        if (!showMap) return;
        // Cheap paint every tick; the terrain refetch rate-limits itself.
        if (Date.now() - mapFetchedAt > MAP_REFETCH_MS) void drawGameMap();
        else paintGameMap();
      }, MAP_REPAINT_MS);
    };
    // Leaving the run must stop the loop — an interval outliving the component
    // would keep hitting the map endpoint forever.
    cleanupFns.push(() => setMapOpen(false));

    // CLOSING THE TAB WHILE INSIDE. The browser only allows a generic "leave
    // site?" prompt — the text is not ours to write — but the prompt itself is
    // the point: it stops a reflexive Ctrl-W from quietly ending a run with
    // gear on the line. It is a COURTESY, not the enforcement: what actually
    // stops closing the app being a free escape is the server's disconnect
    // policy, because a determined player can always kill the process.
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (!entered || debrief) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    cleanupFns.push(() => window.removeEventListener("beforeunload", onBeforeUnload));
    /** Play a dance. Roots the player, swaps the (headless-by-design)
     *  first-person body for a full clone, pulls the camera to third person.
     *  Runs to completion — Josh's rule: "they can't move until that emote
     *  finishes". Death is the only interrupt. */
    const startEmote = (id: string): void => {
      if (emoting || airborne || swimming || myBoat || ctl.fly.on || !entered) return;
      // The stand-in wears the wire-truth suit (wornSuit, from the welcome
      // inventory) — `slots` never contains the suit, so reading it there
      // danced every player in default yellow while the room saw their colour.
      if (emoteBodyCache && emoteBodyColor !== wornSuit) emoteBodyCache = null;
      const body = emoteBodyCache ?? makeEmoteBody(wornSuit);
      if (!body) return; // model never loaded — no dance, no harm
      emoteBodyCache = body;
      emoteBodyColor = wornSuit;
      body.group.position.set(player.x * CELL, groundY, player.y * CELL);
      body.group.rotation.y = player.yaw;
      scene.add(body.group);
      if (viewmodel) viewmodel.group.visible = false;
      if (heldObj) heldObj.visible = false;
      // Start BEHIND the body at a slight elevation; the mouse orbits from here.
      emoteYaw = player.yaw;
      emotePitch = 0.35;
      emoting = { id, body };
      emoteEndsAt = performance.now() + 20_000; // fetch cap; tightened below
      void loadEmoteClip(id).then((clip) => {
        if (emoting?.id !== id) return; // died / cleaned up while fetching
        if (!clip) return endEmote(); // missing file — stand back up
        body.action?.stop();
        body.action = playEmote(body.mixer, clip);
        // The real deadline: clip length plus a comfortable beat. The
        // paused/finished checks end it exactly; this ends it regardless.
        emoteEndsAt = performance.now() + (clip.duration / Math.max(0.01, Math.abs(body.action.timeScale))) * 1000 + 750;
        // Belt AND braces: the mixer says so the moment the clip runs out.
        body.mixer.addEventListener("finished", onEmoteFinished);
      });
    };
    const onEmoteFinished = (): void => endEmote();
    const endEmote = (): void => {
      if (!emoting) return;
      emoting.body.mixer.removeEventListener("finished", onEmoteFinished);
      emoting.body.action?.stop();
      emoting.body.action = null;
      scene.remove(emoting.body.group);
      emoting = null;
      if (viewmodel) viewmodel.group.visible = true;
      if (heldObj) heldObj.visible = true;
    };

    /** The flycam's local half — the F key and the server's answer share it,
     *  so a REFUSAL (a landing the server won't take, or a session that
     *  isn't the admin's after all) puts the camera back exactly as it was
     *  instead of leaving it flying while the server keeps the body on foot. */
    const applyFly = (on: boolean): void => {
      ctl.fly.on = on;
      flying = on;
      flySpeed = ctl.fly.speed;
      // THE OPERATOR IS A CAMERA: the first-person body stays below with the
      // walking state machine, and over the Drop or under water it fell or
      // swam and swung a yellow sleeve into the flycam's view (Nov 2026
      // polish round). Hidden while flying, back on landing.
      if (viewmodel) viewmodel.group.visible = !on;
      if (heldObj) heldObj.visible = !on;
      if (on) {
        player.alt = world.groundAt(player.x, player.y) + EYE;
      } else {
        // Land ON the floor of the cell, not wherever the eye happened to be.
        vy = 0;
        jumpY = 0;
        airborne = false;
        groundY = world.groundAt(player.x, player.y);
        airBase = groundY;
        // A flycam may pitch past the walking limit — landing brings the
        // gaze back inside it, or the first mouse move would snap it there.
        player.pitch = Math.max(-PITCH_DOWN_MAX, player.pitch);
      }
    };
    /** Take off or land: the camera moves at once and the server is asked;
     *  its refusal puts the camera back through applyFly (onFly). */
    const requestFly = (on: boolean): void => {
      applyFly(on);
      net?.setFly(on);
    };
    let lastMothBite = 0;
    let lastMothNote = 0;
    let lastHeatNote = 0;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (specOn && !capturing) {
        if (e.repeat) return;
        // the talk key first: bound to Q or E it would otherwise only ever
        // cycle, and the ghost could never speak (Oct 2026 review)
        if (e.code === brSettings.keys.talk) {
          if (!ghostKey) {
            ghostKey = true;
            // the mic opens when the server says the talk has begun
            // (onSpectate: talking) — the budget is the server's, not ours
            if ((spec?.talkLeftMs ?? 0) > 0) net?.ghostPtt(true);
            else note("no voice left — it comes back when the clock refills");
          }
        } else if (e.code === "KeyQ") net?.specCycle(-1);
        else if (e.code === "KeyE") net?.specCycle(1);
        return;
      }
      // The KEY CAPTURE screen owns every key while it's arming a bind.
      if (capturing) {
        e.preventDefault();
        if (e.code !== "Escape") bindBrKey(capturing, e.code);
        capturing = null;
        return;
      }
      if (liftAt && entered && !e.repeat) {
        const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          if (liftDigits.length < 2) liftDigits += digit[1];
          return;
        }
        if (e.code === "Backspace") {
          e.preventDefault();
          liftDigits = liftDigits.slice(0, -1);
          return;
        }
        if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === brSettings.keys.interact) {
          e.preventDefault();
          const floor = Number(liftDigits);
          if (!liftDigits) {
            liftAt = null;
            return;
          }
          liftDigits = "";
          liftAt = null;
          if (floor >= 13 && floor <= 20) hotelSfx("lift-doom", 0, 0, 1);
          net!.lift(floor);
          return;
        }
      }
      if (e.code === "Escape" && entered) {
        // The breadcrumb for the Mac kick-out (lib/errorreport.ts).
        try {
          sessionStorage.setItem(ESC_CRUMB, JSON.stringify({
            at: Date.now(), fallback: lockFallback, locked, realLock: !!document.pointerLockElement,
            display: document.fullscreenElement ? "page-fullscreen" : "window",
          }));
        } catch {
          /* private mode */
        }
        lastEscAt = Date.now();
      }
      // FALLBACK PAUSE: with no real pointer lock there's no unlock event —
      // ESC opens the pause menu by hand, dropping held input exactly like
      // a lock loss does. The key is CLAIMED: nothing past the game — the
      // app's keybinds, the webview's own Escape handling — gets to act on it.
      if (lockFallback && locked && e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        locked = false;
        if (renderer) renderer.domElement.style.cursor = "";
        ctl.keys.clear();
        crouching = false;
        sprayHeld = false;
        camAiming = false;
        camRec = false;
        wheelOpen = false;
        stopSprayHiss();
        if (txing) {
          txing = false;
          gearSfx("radio-off");
          net?.walkieTx(false);
        }
        return;
      }
      // No pointer lock = paused, looting, debriefing or dead: the world takes
      // NO input. Without this you could walk (and spray, and radio) around
      // while the pause menu was open, and Space would double-fire on a
      // focused settings button.
      if (!locked) return;
      ctl.keys.add(e.code);
      // Every action below reads the player's OWN binding (pause → Controls).
      const K = brSettings.keys;
      if (e.code === K.mic && voice) {
        const next = !voice.muted();
        voice.setMuted(next);
        micState = next ? "muted" : "live";
      }
      if (e.code === K.map && entered) {
        showMap = !showMap;
        // The canvas only exists once the overlay has rendered.
        if (showMap) setTimeout(() => setMapOpen(true), 0);
        else setMapOpen(false);
      }
      // ADMIN FLYCAM (F). Not rebindable and not in the Controls list on
      // purpose — it's an operator tool, not a game control. The server
      // re-checks the admin flag; a non-admin pressing F just gets snapped
      // back by correction frames.
      if (e.code === "KeyF" && entered && session.user?.isAdmin) {
        e.preventDefault();
        const on = !ctl.fly.on;
        if (!on) {
          // LANDING RULE: you may only land somewhere you could have walked
          // to. Touching down inside a wall, in sealed scenery or down a
          // shaft would leave the ghost somewhere the server's normal
          // movement rules can't get them out of — every step refused, stuck
          // for good. So refuse the landing instead and say why.
          const cx = Math.floor(player.x);
          const cy = Math.floor(player.y);
          if (world.solidAt(cx, cy) || world.backgroundAt(cx, cy) || (world.floorStepsAt(cx, cy) <= -PIT_LETHAL_STEPS && world.waterAt(cx, cy) === null)) {
            note("can't land here — find open floor");
            return;
          }
        }
        requestFly(on);
        note(on ? "flycam ON — scroll to change speed" : "flycam off");
      }
      // ADMIN (J, the station only): bring THE BLEEDER out round the nearest
      // corner now, power or no power — the playtest lever, since it otherwise
      // only comes in a section that has gone dark.
      // ADMIN (J, the office): THE TEMP round the nearest corner from you.
      // ADMIN (J, the hotel): the nearest swarm wakes and comes for you.
      // ADMIN (J, the Suburbs): THE WATCH sent at you (outdoors, in the dark).
      if (e.code === "KeyJ" && !e.repeat && entered && level === 9 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonWatch()
          .then((r) => note(r.ok ? "it's seen you. it's coming down the street." : "it only comes for somebody outdoors, in the dark."))
          .catch(() => note("couldn't summon it"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 8 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonBurrower()
          .then((r) => note(r.ok ? "it heard you. it's coming through the rock." : "it only comes for somebody in its passages."))
          .catch(() => note("couldn't summon it"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 7 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonDeep()
          .then((r) => note(r.ok ? "it has noticed you. it's circling." : "it only comes for somebody in the water."))
          .catch(() => note("couldn't summon it"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 6 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonListener()
          .then((r) => note(r.ok ? "the listener is round a corner, coming for where you stand. keep quiet." : "couldn't send it — are you flying?"))
          .catch(() => note("couldn't summon it"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 5 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonMoths()
          .then((r) => note(r.ok ? "the nearest swarm is awake and coming. torch off to lose it." : "no swarm to wake"))
          .catch(() => note("couldn't summon them"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 4 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonTemp()
          .then((r) => note(r.ok ? "the temp is round a corner. look at it — and keep looking." : "nowhere out of sight near enough to put it"))
          .catch(() => note("couldn't summon it"));
      }
      if (e.code === "KeyJ" && !e.repeat && entered && level === 3 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonBleeder()
          .then((r) => note(r.ok ? "the bleeder is out — round a corner, coming. hold the beam on it." : "no dark corner near enough to bring it round"))
          .catch(() => note("couldn't summon it"));
      }
      // ADMIN (J, Pipe Dreams): THE GRABBER round behind you, now — the
      // playtest lever (it otherwise visits on its own minutes-long clock).
      if (e.code === "KeyJ" && !e.repeat && entered && level === 2 && session.user?.isAdmin) {
        e.preventDefault();
        void hubApi
          .adminBrSummonGrabber()
          .then((r) => note(r.ok ? "the grabber is behind you somewhere. listen — turn and light it." : "nowhere behind you it could come from (a lit room, or it's switched off here)"))
          .catch(() => note("couldn't summon it"));
      }
      // ADMIN PROBE (P): what is actually in front of me? Moved off B — that
      // key now defaults to the emote wheel for everyone, admin included.
      if (e.code === "KeyP" && entered && session.user?.isAdmin) {
        e.preventDefault();
        probeOn = !probeOn;
        note(probeOn ? "geometry probe ON" : "geometry probe off");
      }
      // THE EMOTE WHEEL — hold to open. Grounded and on foot only: no
      // dancing mid-air, mid-swim, in a boat, or as a flying ghost.
      if (e.code === K.emote && !e.repeat && entered && !emoting && !wheelOpen
          && !airborne && !swimming && !myBoat && !ctl.fly.on) {
        e.preventDefault();
        wheelOpen = true;
        wheelX = 0;
        wheelY = 0;
        wheelHover = -1;
      }
      if (e.code === K.jump && entered && !ctl.fly.on && !swimming && !myBoat && !emoting) {
        e.preventDefault();
        // Winded = no jumping either (Josh's rule). Takeoff freezes the
        // ground reference: from here the arc owns the height until it
        // lands, so a jump ACROSS a ledge keeps its air.
        if (!airborne && (stamina >= 15 || performance.now() < staminaFreeUntil) && !winded) {
          airborne = true;
          airBase = groundY;
          jumpY = 0;
          vy = 4.6;
          if (performance.now() >= staminaFreeUntil) stamina = Math.max(0, stamina - 15);
        }
      }
      if (e.code === K.crouch && !emoting) crouching = true;
      // Walkie: hold to transmit, channel keys to tune — only with the radio
      // in hand and juice in it. Keying up and releasing both squelch.
      if (e.code === K.talk && entered && !e.repeat) {
        const held = slots[selSlot];
        if (held?.kind === "walkie") {
          if ((batteries.get(held.id) ?? 0) <= 0) note("walkie battery dead");
          else if (micState === "muted") note(`mic is muted (${keyLabel(K.mic)})`);
          else if (!txing) {
            txing = true;
            gearSfx("radio-on");
            net!.walkieTx(true);
          }
        }
      }
      if ((e.code === K.chanDown || e.code === K.chanUp) && entered) {
        const held = slots[selSlot];
        if (held?.kind === "walkie") {
          walkieChan = Math.min(10, Math.max(1, walkieChan + (e.code === K.chanUp ? 1 : -1)));
          net!.walkieCh(walkieChan);
          note(`channel ${walkieChan}`);
        }
      }
      if (/^Digit[1-9]$/.test(e.code)) {
        const n = Number(e.code.slice(5)) - 1;
        if (n < slots.length) {
          // Battery charging (the spec's verb): holding a flashlight or
          // walkie and pressing the BATTERY's slot number charges it.
          const held = slots[selSlot];
          const pressed = slots[n];
          if (
            pressed?.kind === "battery" &&
            held &&
            (held.kind === "flashlight" || held.kind === "walkie")
          ) {
            pendingCharge.set(pressed.id, held);
            net!.consume(pressed.id);
          } else {
            selSlot = n;
          }
        }
      }
      if (e.code === K.interact && entered && locked && !emoting) {
        // Aboard a boat, E means one thing: step off.
        if (myBoat) {
          net!.boatLeave();
          return;
        }
        // THE DOOR outranks everything — you don't want to fumble a relic
        // pickup while standing at the end of Level 0.
        // Radius widened 2.0 → 3.2 (Josh: "I click E, I just don't see
        // anything" — a step too far fell through to the pickup checks in
        // SILENCE). The server still validates the real distance, so the
        // worst a long press earns is the "closer…" note — feedback either
        // way, never nothing.
        // THE ELECTRICAL STATION: breakers go on, cutoffs kill a section, and
        // the shutter wants all six.
        // LIGHTS OUT: the sea hatch wants the Handwheel on its hub.
        // THALASSOPHOBIA: the subway stair wants the helmet, 24m down.
        // THE CAVE SYSTEM: the chimney wants the Climbing Rope.
        // THE SUBURBS: Number 9's front door wants the House Key; once it's
        // open, walking through it is the end of the descent (an exit — the
        // server checks you're at it).
        if (level === 9 && suburb.nearFrontDoor(player.x, player.y)) {
          const fd = suburb.frontDoor();
          if (!fd?.open) {
            if (hasKey) net!.openDoor();
            else note("locked. a brass keyhole — it wants a house key with a 9 on its tag.");
            return;
          }
          // open: it is a way out like any other (syncFrontExit put it in
          // exitDoors) — the exit loop below takes it
        }
        if (level === 8 && cave.nearChimney(player.x, player.y)) {
          const h = cave.chimneyState();
          if (h?.open) net!.travel();
          else if (hasKey) net!.openDoor();
          else note("you can't climb it bare-handed. it wants a rope.");
          return;
        }
        if (level === 7 && ocean.nearSubway(player.x, player.y)) {
          const h = ocean.subwayState();
          // AT the bottom, not just under: the stair is 24m down, and hovering
          // a head's depth below the surface above it used to count (Nov 2026
          // validation run). The feet within 2.5m of the floor under you.
          const atBottom = submerged && swimming && swimY - world.groundAt(player.x, player.y) < 2.5;
          if (!atBottom) note("the stair is at the bottom of the square — dive.");
          else if (h?.open) net!.travel();
          else net!.openDoor();
          return;
        }
        if (level === 6 && lights.nearHatch(player.x, player.y)) {
          const h = lights.hatchState();
          if (h?.open) net!.travel();
          else if (hasKey) net!.openDoor();
          else note("the hatch's hub is bare. it wants its wheel.");
          return;
        }
        // THE TERROR HOTEL: the rusty door wants the Boiler Key; the register
        // is read at its table; a lift opens its panel.
        if (level === 5) {
          if (hotel.nearRusty(player.x, player.y)) {
            const rd = hotel.rustyDoor();
            if (rd?.open) net!.travel();
            else if (hasKey) net!.openDoor();
            else note("locked. a big iron keyhole — it wants the Boiler Key.");
            return;
          }
          if (hotel.nearRegister(player.x, player.y)) {
            net!.readRegister();
            return;
          }
          const lift = hotel.nearLift(player.x, player.y);
          if (lift) {
            liftAt = lift;
            liftDigits = "";
            hotelSfx("lift-chime", 0, 0, 0.6);
            return;
          }
        }
        // THE OFFICE: the stairwell door wants the keycard at its reader
        if (level === 4 && officeDoor && Math.hypot(officeDoor.x - player.x, officeDoor.y - player.y) < 2.6) {
          if (officeDoor.open) net!.travel();
          else if (hasKey) net!.openDoor();
          else note("the reader beeps red. it wants the security keycard.");
          return;
        }
        if (level === 3) {
          const st = stationSiteNear();
          if (st?.kind === "breaker") {
            if (st.on) note(`breaker ${st.section} is on. ${stationOn} of 6.`);
            else net!.throwBreaker(st.section);
            return;
          }
          if (st?.kind === "cutoff") {
            net!.pullCutoff(st.section);
            return;
          }
          if (st?.kind === "shutter") {
            if (st.on) net!.travel();
            else note(`the shutter's dead. ${stationOn} of 6 breakers are on — find the rest.`);
            return;
          }
        }
        // THE DRAIN HATCH: open it with the Poolrooms' key, then down.
        if (level === 1 && hatchSite && Math.hypot(hatchSite.x - player.x, hatchSite.y - player.y) < 2.4) {
          if (hatchSite.open) net!.travel();
          else net!.openDoor();
          return;
        }
        // PIPE DREAMS' FUSE BOX, and the pressure door beside it.
        if (level === 2 && fuseBoxSite) {
          const atBox = Math.hypot(fuseBoxSite.x - player.x, fuseBoxSite.y - player.y) < 2.8;
          const atDoor = !!fuseBoxSite.door && Math.hypot(fuseBoxSite.door.x - player.x, fuseBoxSite.door.y - player.y) < 2.8;
          if (atBox && fusesCarrying > 0) {
            net!.insertFuses();
            return;
          }
          if (atBox || atDoor) {
            if (fuseBoxSite.open) net!.travel();
            else note(`sealed. the fuse box beside it holds ${fuseBoxSite.inserted} of ${fuseBoxSite.total} fuses — find the rest.`);
            return;
          }
        }
        // (The Landing asks within 2.1 — inside the server's 2.2 for the
        // passage and 2.8 for the way out, so a choice it offers is honoured)
        if (doorSite && Math.hypot(doorSite.x - player.x, doorSite.y - player.y) < (level === 1 ? 2.1 : 3.2)) {
          if (level === 1) {
            // THE LANDING is two doors in one (Josh): the passage back to
            // Level 0, and a way out to Threshold-4. Ask which.
            landingChoice = true;
            unlockPointer();
          } else if (doorSite.open) net!.travel();
          else net!.openDoor();
          return;
        }
        // A WAY OUT, on any level: a deliberate E extracts you. (The
        // Poolrooms' doors used to fire on proximity alone — walking past one
        // ended the run — and Level 0's Entrance on a touch; law 5 makes it
        // one rule everywhere.)
        for (const ed of exitDoors) {
          if (atExitDoor(ed)) {
            exiting = true;
            exitRetryAt = performance.now() + 700;
            // force-sync first: standing still at the wall, the 10Hz sender
            // may never have sent the final position the server checks
            net!.move(player.x, player.y, player.yaw);
            net!.exit();
            return;
          }
        }
        // THE KEY next.
        if (keySite && Math.hypot(keySite.x - player.x, keySite.y - player.y) < 1.4) {
          net!.takeKey();
          return;
        }
        // a FUSE, on Pipe Dreams
        for (const [i, fs] of fuseSites) {
          if (Math.hypot(fs.x - player.x, fs.y - player.y) < 1.4) {
            net!.takeFuse(i);
            return;
          }
        }
        // Lore drives before loot: they're the rarer find.
        let driveId = "";
        let driveD = Infinity;
        for (const [id, d] of driveSites) {
          const dist = Math.hypot(d.x - player.x, d.y - player.y);
          if (dist < driveD) {
            driveD = dist;
            driveId = id;
          }
        }
        if (driveId && driveD < 1.3) {
          net!.takeDrive(driveId);
          return;
        }
        // Bodies first, then loose items, then relics.
        let bodyId = -1;
        let bodyD = Infinity;
        for (const [id, c] of bodyMap) {
          const d = Math.hypot(c.x - player.x, c.y - player.y);
          if (d < bodyD) {
            bodyD = d;
            bodyId = id;
          }
        }
        if (bodyId !== -1 && bodyD < 1.4) {
          net!.lootOpen(bodyId);
          return;
        }
        let dropId = -1;
        let dropD = Infinity;
        for (const [id, d0] of dropSites) {
          const d = Math.hypot(d0.x - player.x, d0.y - player.y);
          if (d < dropD) {
            dropD = d;
            dropId = id;
          }
        }
        if (dropId !== -1 && dropD < 1.3) {
          net!.takeDrop(dropId);
          return;
        }
        let bestId = -1;
        let bestD = Infinity;
        for (const [id, r] of relicSites) {
          const d = Math.hypot(r.x - player.x, r.y - player.y);
          if (d < bestD) {
            bestD = d;
            bestId = id;
          }
        }
        if (bestId !== -1 && bestD < 1.3) {
          net!.takeRelic(bestId);
          return;
        }
        // A rowboat within reach? (Last — the wider radius must never eat a
        // pickup standing on the dock.)
        let boatId = -1;
        let boatD = Infinity;
        for (const [id, v] of boatViews) {
          const d = Math.hypot(v.tx - player.x, v.ty - player.y);
          if (d < boatD) {
            boatD = d;
            boatId = id;
          }
        }
        if (boatId !== -1 && boatD < 2.6) {
          net!.boatBoard(boatId);
          return;
        }
        if (slots.every((s) => s !== null)) note("no space in inventory");
        else note("nothing here");
      }
      if (e.code === K.drop && entered && locked && !emoting) {
        const held = slots[selSlot];
        if (!held) {
          note("nothing in hand");
        } else if (held.kind === "relic") {
          // Relics ride the run and bank at extraction; dropping one would
          // need a ground-relic concept the spec doesn't have.
          note("you're not putting that down");
        } else {
          if (held.kind === "spraycan") {
            sprayHeld = false;
            stopSprayHiss();
          }
          net!.drop(held.id, batteries.get(held.id) ?? null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (specOn && e.code === brSettings.keys.talk && ghostKey) {
        ghostKey = false;
        net?.ghostPtt(false);
        voice?.setMuted(true);
      }
      // ALWAYS release, lock or no lock: if the pointer unlocked mid-stride,
      // the keydown that started it is already in the set and only this can
      // clear it (else you walk forever after resuming).
      ctl.keys.delete(e.code);
      const K = brSettings.keys;
      // Releasing the emote key with a wedge highlighted plays it — the
      // hold-flick-release flow. Releasing over the dead-zone hub just closes.
      if (e.code === K.emote && wheelOpen) {
        const pick = wheelHover;
        wheelOpen = false;
        if (pick >= 0) startEmote(EMOTES[pick].id);
      }
      if (e.code === K.crouch) crouching = false;
      if (e.code === K.talk && txing) {
        txing = false;
        gearSfx("radio-off");
        net!.walkieTx(false);
      }
    };
    const onWheel = (e: WheelEvent): void => {
      if (!locked) return;
      e.preventDefault();
      // While flying the wheel is the throttle (Josh's ask) — the hotbar is
      // meaningless to a ghost, and reaching for a key mid-flight isn't.
      if (ctl.fly.on) {
        flySpeed = ctl.nudgeFlySpeed(e.deltaY > 0 ? -1 : 1);
        return;
      }
      selSlot = (selSlot + (e.deltaY > 0 ? 1 : slots.length - 1)) % slots.length;
    };
    let sprayHeld = false;
    let lastSprayAt = 0;
    let camSent = false;
    let lastNoiseAt = 0;
    const pendingCharge = new Map<number, BrItem>(); // batteryItemId → equipment to charge
    const onMouseDown = (e: MouseEvent): void => {
      if (!locked) return;
      // The wheel: click plays the highlighted dance (or just closes).
      if (wheelOpen) {
        const pick = wheelHover;
        wheelOpen = false;
        if (e.button === 0 && pick >= 0) startEmote(EMOTES[pick].id);
        return;
      }
      // Mid-dance the hands are busy — no torch, spray, or shutter.
      if (emoting) return;
      const held = slots[selSlot];
      // RIGHT-CLICK AIMS (Josh's split): holding button 2 raises the camera to
      // the mask — the scope view — independent of whether tape is rolling.
      // Left click is the shutter: it starts/stops the RECORDING. Aim and
      // shoot are two inputs, like any ADS.
      if (e.button === 2) {
        if (held?.kind === "camera") camAiming = true;
        return;
      }
      if (e.button !== 0) return;
      if (held?.kind === "flashlight") {
        if (!flashOn && (batteries.get(held.id) ?? 0) <= 0) {
          note("battery dead");
          return;
        }
        flashOn = !flashOn;
        gearSfx(flashOn ? "flashlight-on" : "flashlight-off");
      }
      if (held?.kind === "spraycan") {
        if ((batteries.get(held.id) ?? 0) <= 0) note("can's empty");
        else {
          sprayHeld = true;
          startSprayHiss(); // runs exactly as long as paint is leaving the can
        }
      }
      if (held?.kind === "camera") {
        // Recording needs the camera AT YOUR FACE (Josh: "only engage the
        // camera when bringing it to your face") — no hip-firing the tape.
        if (!camAiming) note("hold right-click to raise the camera first");
        else if (!camRec && (batteries.get(held.id) ?? 0) <= 0) note("tape full");
        else camRec = !camRec;
      }
      // Consumables: click to use with them in hand (single use).
      if (held?.kind === "pills") {
        if (hp >= 100) note("you're not hurt");
        else net!.consume(held.id);
      }
      if (held?.kind === "almondwater") {
        if (stamina >= 99 && !winded) note("you're not tired");
        else net!.consume(held.id);
      }
    };
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 2) {
        camAiming = false;
        // Lowering the camera ends the take — the HUD and the tape live at
        // your face, never from the hip.
        if (camRec) camRec = false;
        return;
      }
      sprayHeld = false;
      stopSprayHiss();
    };
    // Right-click is game input — the browser menu must never open over it.
    const onContextMenu = (e: Event): void => {
      if (locked) e.preventDefault();
    };
    const onBlur = (): void => {
      ctl.keys.clear();
      crouching = false;
      sprayHeld = false;
      camAiming = false;
      camRec = false; // the camera lowers with the window — the take ends
      stopSprayHiss();
      // Alt-tabbing must never leave the mic keyed open (the main app's rule
      // for hold-binds, and doubly true here — the entity hears radios).
      if (txing) {
        txing = false;
        gearSfx("radio-off");
        net?.walkieTx(false);
      }
      // ...and a ghost's talk key ends with the window too (Oct 2026 review —
      // a held key released in another window burned the whole talk budget)
      if (ghostKey) {
        ghostKey = false;
        net?.ghostPtt(false);
        voice?.setMuted(true);
      }
      // ALT-TAB IS A SANCTIONED EXIT, and it must land in the pause menu on
      // every surface. A real lock gets this free (the browser releases it on
      // focus loss → onLockChange pauses); the Mac shell's pseudo-lock has no
      // such event, so without this the game stayed "locked" and live while
      // the window sat in the background.
      if (lockFallback && locked) {
        locked = false;
        if (renderer) renderer.domElement.style.cursor = "";
      }
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    cleanupFns.push(() => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      unlockPointer();
    });

    // ---- The loop ------------------------------------------------------
    // Debug handle (harmless in prod; used by dev tooling/screenshot checks).
    (window as unknown as { __br?: unknown }).__br = { world, player, scene, camera, peers, requeue: (k: string) => rebuildQueue.add(k) };

    let last = performance.now();
    let lastSeamRebuild = 0; // paces the rebuildQueue drain (starvation guard)
    let lastRoomSoundAt = 0; // paces the room-sound check (the map editor's Sound)
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const rawMs = now - last;
      const dt = Math.min(0.05, rawMs / 1000);
      last = now;
      if (import.meta.env.DEV) {
        dbgFrames++;
        dbgDt = +dt.toFixed(4);
      }

      // ---- The AUTO render-scale governor + the VIDEO tab's readout ------
      // EMA of the raw frame interval (background-tab stalls excluded so a
      // minimized window can't convince it the GPU is dying). In Auto, ease
      // the internal resolution down when we can't hold ~60 and back up when
      // there's clear headroom — one step every 2s, never below 50%, never
      // above native (supersampling stays a MANUAL choice).
      if (rawMs < 250 && !document.hidden) frameEma = frameEma * 0.94 + rawMs * 0.06;
      if (brSettings.renderScale === 0 && now - lastGovern > 2000) {
        if (frameEma > 19 && autoScale > 0.5) {
          autoScale = Math.max(0.5, autoScale - 0.1);
          lastGovern = now;
          resize();
        } else if (frameEma < 13.5 && autoScale < 1) {
          autoScale = Math.min(1, autoScale + 0.1);
          lastGovern = now;
          resize();
        }
      }
      if (now - lastFpsPush > 500) {
        lastFpsPush = now;
        const scale = brSettings.renderScale > 0 ? brSettings.renderScale : autoScale;
        gfxView.fps = Math.round(1000 / Math.max(1, frameEma));
        gfxView.ms = +frameEma.toFixed(1);
        gfxView.scale = Math.round(scale * 100);
        const size = renderer!.getDrawingBufferSize(GFX_SIZE);
        gfxView.res = `${size.x}×${size.y}`;
      }

      // ---- Survival systems: stamina, crouch, jump (B3 core) -------------
      // Stamina drains at a decent-but-fair pace on sprint, jumps bite a
      // chunk, and it regens at medium speed (Josh's tuning words made
      // numeric: sprint 9/s, jump 15 flat, regen 12/s).
      // WINDED latch (Josh's rule): depleting the bar locks BOTH sprint and
      // jump until it recovers to 50% (or, later, an almond water).
      if (stamina <= 0) winded = true;
      else if (winded && stamina >= 50) winded = false;
      // THE CAVE SYSTEM: a crawlspace's roof is lower than you are — the
      // controller won't let you in standing (mods.tall), and inside it you
      // stay crouched until you're out
      if (level === 8 && !ctl.fly.on && world.lowAt(Math.floor(player.x), Math.floor(player.y))) {
        crouching = true;
        crawlForced = true;
      } else if (crawlForced) {
        crawlForced = false;
        if (!ctl.keys.has(brSettings.keys.crouch)) crouching = false;
      }
      ctl.mods.tall = !crouching && !ctl.fly.on;
      // THE CLIMBING ROPE is too heavy to run with (the Cave System's key)
      const ropeBound = level === 8 && hasKey;
      const wantSprint = ctl.keys.has(brSettings.keys.sprint) && player.moving && !crouching && !ropeBound;
      const sprinting = wantSprint && !winded && stamina > 0;
      ctl.mods.allowSprint = !winded && !crouching && !ropeBound;
      crouchAmt += ((crouching ? 1 : 0) - crouchAmt) * Math.min(1, dt * 10);
      let wade = 1;
      // WATER IS THE MAP'S, on any level (law 5) — not the Poolrooms' level
      // number; a level with no water simply has none to wade in
      const wlHere = world.waterAt(Math.floor(player.x), Math.floor(player.y));
      const groundHere = world.groundAt(player.x, player.y);
      const depthHere = wlHere !== null ? wlHere - groundHere : 0;
      // How far the FEET are under the surface right now. Airborne that is
      // the jump arc, not the floor — a cell with water in it is not the
      // same thing as a body in the water.
      const feetNow = airborne ? airBase + jumpY : groundY;
      const underBy = wlHere !== null ? wlHere - feetNow : -1;
      // WADING DRAG applies to a body in the water, NOT to a cell that
      // happens to be wet (Josh: "when a user jumps over water they slow
      // down because the game thinks they are in the water"). Sailing over a
      // channel is a jump like any other; only wet feet cost you speed.
      if (wlHere !== null && !swimming && !airborne && underBy > 0.15) {
        wade = depthHere > 0.6 ? 0.55 : 0.78;
      }
      // ---- SWIMMING (Poolrooms v3) ------------------------------------------
      // Deep water (≥1.5m) floats you: sink slowly, SPACE to swim up (a
      // trickle of stamina — far less than a jump), CROUCH to dive. Below
      // the waterline the breath meter runs; the server's 10-second clock
      // is the one that kills.
      // SWIMMING starts when the BODY is actually in the water — never
      // while sailing over it mid-jump (Josh: "jumping over water sucks you
      // into the water"). Airborne, the feet are airBase + jumpY; only once
      // they dip under the surface does the water take you.
      // THE WATER HAS TO ACTUALLY CATCH YOU. Skimming the surface used to
      // grab you the instant your feet were 15cm under, so clipping a pool
      // on the way past yanked you out of the air mid-jump (Josh: "if a user
      // touches water it sucks them right in its jarring"). Now the body has
      // to be properly in it — knee-deep past the surface — which a jump
      // that merely grazes the top never reaches.
      const CATCH_DEPTH = 0.55;
      const inTheWater = underBy > CATCH_DEPTH;
      const swimDeep = wlHere !== null && depthHere >= 1.5 && inTheWater && !ctl.fly.on && !myBoat;
      if (swimDeep && !swimming) {
        swimming = true;
        // Walked in: start where the body is. Fell in: catch at entry depth.
        // NEVER below near-surface on ENTRY — a session that resumes
        // standing on a pool floor would otherwise wake up drowning with no
        // key pressed (the first Vault Sea death was exactly this).
        swimY = Math.max(Math.max(groundHere + 0.15, wlHere - 1.45), Math.min(groundY + jumpY, wlHere - 1.25));
        jumpY = 0;
        vy = 0;
        airborne = false; // the water caught you
        footstep(true, false, "water"); // the splash
      } else if (!swimDeep && swimming) {
        swimming = false;
        jumpY = 0;
        vy = 0;
        airborne = false;
        airBase = world.groundAt(player.x, player.y);
        if (submerged) {
          submerged = false;
          inWaterHud = false;
        }
      }
      if (swimming && wlHere !== null) {
        const wantUp = ctl.keys.has(brSettings.keys.jump);
        const canKick = !winded && (stamina > 0 || now < staminaFreeUntil);
        if (wantUp && canKick) {
          swimY += 1.05 * dt;
          if (now >= staminaFreeUntil) stamina = Math.max(0, stamina - 5 * dt);
        } else if (crouching) {
          swimY -= 1.0 * dt; // the dive
        } else {
          swimY -= 0.34 * dt; // the slow sink — Josh's rule
        }
        swimY = Math.max(groundHere + 0.15, Math.min(swimY, wlHere - 1.22));
        swimT += dt * (player.moving ? 1.6 : 0.9);
        ctl.mods.scale = 0.5; // swimming is slow — and quiet, the water isn't
        // a diver in the drowned city swims round a sunken roof, not through
        ctl.mods.bodyFloor = level === 7 ? swimY : Number.NEGATIVE_INFINITY;
      } else {
        ctl.mods.scale = (1 - crouchAmt * 0.5) * wade;
        ctl.mods.bodyFloor = Number.NEGATIVE_INFINITY;
      }
      // ABOARD (set last — it outranks wade/crouch): rowing is ONE pace, no
      // sprint and no stamina bill — BOAT_SPEED beats the alligator's 2.85
      // deep-water rush (Josh's rule). A passenger doesn't move at all;
      // the hull carries them.
      if (myBoat) {
        ctl.mods.allowSprint = false;
        ctl.mods.scale = myBoat.seat === "captain" ? BOAT_SPEED / WALK_SPEED : 0;
      }
      // A DANCE ROOTS YOU (Josh: "they can't move until that emote
      // finishes"). Movement zeroed, not the keys — releasing mid-dance
      // still updates the key set, so nothing sticks when it ends.
      if (emoting) ctl.mods.scale = 0;
      // Dead bodies don't take input — the death cam is watching yours.
      if (dying) ctl.mods.scale = 0;
      if (sprinting && now >= staminaFreeUntil) stamina = Math.max(0, stamina - 9 * dt);
      else if (!sprinting && !swimming) stamina = Math.min(100, stamina + 12 * dt);
      else if (swimming && !ctl.keys.has(brSettings.keys.jump)) stamina = Math.min(100, stamina + 6 * dt);
      // THE JUMP ARC (rebuilt, Josh: "jumping across an elevation change
      // sucks you to the ground"). While AIRBORNE the body ignores the
      // terrain entirely: it flies a ballistic arc from the height it left
      // (airBase + jumpY), and only lands when that height reaches the
      // ground actually beneath it. The old version re-based on whatever
      // floor was under you each frame, so crossing a ledge mid-jump
      // snapped the arc down onto the new floor.
      if (!swimming && !myBoat && airborne) {
        vy -= 12 * dt;
        jumpY += vy * dt;
        const gUnder = world.groundAt(player.x, player.y);
        const feet = airBase + jumpY;
        if (vy <= 0 && feet <= gUnder + 0.001) {
          // Touchdown on whatever is under us now.
          groundY = gUnder;
          airBase = gUnder;
          jumpY = 0;
          vy = 0;
          airborne = false;
        }
      }
      // Head vs waterline → the breath clock + the server report.
      if (swimming && wlHere !== null) {
        const head = swimY + 1.5;
        const under = head < wlHere;
        if (under !== submerged) {
          submerged = under;
          inWaterHud = under;
          if (under) footstep(false, true, "water"); // the gulp under
        }
        // THE DIVING HELMET (Thalassophobia): a minute of air, not ten seconds
        breath = under ? Math.max(0, breath - dt / (level === 7 && hasKey ? 60 : 10)) : Math.min(1, breath + dt / 2.5);
      } else if (breath < 1) {
        breath = Math.min(1, breath + dt / 2.5);
      }
      staminaUi = Math.round(stamina);
      breathUi = Math.round(breath * 100) / 100;
      if (submerged !== sentSub) {
        sentSub = submerged;
        net?.swim(submerged);
      }
      // THE DANCE. The stand-in body follows the (rooted) player, its clip
      // advances, and the clamped final frame is the finish line. Death is
      // the only other exit — the body and the third-person camera go with it.
      if (emoting) {
        if (deadScreen !== "none" || !entered) {
          endEmote();
        } else {
          const eb = emoting.body;
          eb.group.position.set(player.x * CELL, groundY, player.y * CELL);
          eb.group.rotation.y = player.yaw;
          eb.mixer.update(dt);
          if (eb.action?.paused) endEmote(); // LoopOnce clamped = finished
          else if (now > emoteEndsAt) {
            // The failsafe. If this ever fires the exact detections above
            // missed — log it so a report of "stuck dancing" has a trail.
            console.warn(`[emote] failsafe ended "${emoting.id}" — finish detection missed`);
            endEmote();
          }
        }
      }
      // THE ARMS. State comes from what the player is actually doing, not from
      // a position delta — this is the one avatar whose input we know exactly.
      // DIRECTION comes straight from the input axes (the one body whose input
      // we know exactly): strafing plays the strafe clip, backpedalling the
      // backward one — the feet finally agree with the floor.
      if (viewmodel && !emoting) {
        const K = brSettings.keys;
        let fwd = 0;
        let strafe = 0;
        if (ctl.keys.has(K.forward) || ctl.keys.has("ArrowUp")) fwd += 1;
        if (ctl.keys.has(K.back) || ctl.keys.has("ArrowDown")) fwd -= 1;
        if (ctl.keys.has(K.left) || ctl.keys.has("ArrowLeft")) strafe -= 1;
        if (ctl.keys.has(K.right) || ctl.keys.has("ArrowRight")) strafe += 1;
        // Forward wins ties so diagonals read as forward movement.
        const dir =
          !player.moving ? ""
          : Math.abs(fwd) >= Math.abs(strafe) ? (fwd >= 0 ? "" : "back")
          : strafe > 0 ? "right"
          : "left";
        // IN THE WATER (Josh, Aug 2026): moving = the stroke, still (or only
        // rising/diving — vertical is not a direction) = treading water. The
        // stroke also engages wading past the WAIST, before the feet leave
        // the floor — same rule the peer bodies follow.
        const st =
          myBoat ? "sit" // a rider sits — the hull does the moving
          : swimming ? (player.moving ? "swim" : "tread")
          : airborne ? "jump"
          : depthHere > 0.6 && inTheWater && player.moving ? "swim"
          : crouching ? (player.moving ? (dir ? `crouch${dir}` : "crouchwalk") : "crouchidle")
          : !player.moving ? "idle"
          : sprinting ? `run${dir}`
          : `walk${dir}`;
        tickViewmodel(viewmodel, st, dt);
        // The held item follows the selected slot. Rebuilt only when the KIND
        // changes, so scrolling the hotbar doesn't rebuild geometry every frame.
        const want = slots[selSlot]?.kind ?? "";
        if (want !== heldKind) {
          heldObj?.parent?.remove(heldObj);
          heldObj = null;
          heldKind = want;
          heldRaise = 0;
          camAiming = false; // switching items lowers the camera — re-aim on return
          if (want) {
            heldHolder ??= (() => {
              const gg = new THREE.Group();
              camera.add(gg);
              return gg;
            })();
            heldObj = attachToHand(heldHolder, want);
          }
        }
        // Pose it. Which items count as "in use" is per item, and matches what
        // the gear actually does: a lit torch, a keyed radio, a rolling camera,
        // a can with the trigger held down.
        const pose = HELD_POSE[heldKind];
        if (heldObj && pose) {
          const inUse =
            heldKind === "flashlight" ? flashOn
            : heldKind === "walkie" ? txing
            : heldKind === "camera" ? camAiming // the raise is the AIM (right-click), not the tape
            : heldKind === "spraycan" ? sprayHeld
            : false;
          heldRaise += ((inUse ? 1 : 0) - heldRaise) * Math.min(1, dt * 8);
          const t = heldRaise;
          const p = pose.stow.map((v, i) => v + (pose.use[i] - v) * t);
          heldObj.position.set(p[0], p[1], p[2]);
          heldObj.rotation.set(p[3], p[4], p[5]);
          // THE SCOPE SNAP. Past 82% of the lift the view becomes the camera's
          // own: the HUD takes the screen and the physical body of the camera is
          // hidden, because you are looking THROUGH it now. Held just short of
          // 1.0 so the swap lands as the lift finishes rather than at the start.
          if (heldKind === "camera") {
            camAimed = t > 0.82;
            heldObj.visible = !camAimed && !ctl.fly.on;
          } else if (!heldObj.visible && !ctl.fly.on) heldObj.visible = true;
        }
      }

      const grounded = !airborne;
      // THE MANTLE (Josh): while you're in the air you may climb TWO steps
      // (1.0m) instead of one, so a waist-high ledge is something you hop onto
      // rather than an invisible wall. Feet on the floor, it's a stride only.
      ctl.mods.climb = grounded ? 1 : 2;

      if (grabbedUntil && now > grabbedUntil) {
        grabbedUntil = 0;
        grabbedBy = null;
      }
      if (entered && !specOn && grabbedUntil && grabbedBy) {
        const want = Math.atan2(-(grabbedBy.x - player.x), -(grabbedBy.y - player.y));
        let dy = want - player.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        player.yaw += dy * (1 - Math.exp(-14 * dt));
        player.pitch += (0.18 - player.pitch) * (1 - Math.exp(-8 * dt));
      }
      if (entered && !specOn) {
        if (!grabbedUntil) ctl.tick(dt);
        // THE BOATS, after movement resolved. Captain: the hull IS you —
        // never let it slide over shallow (the server refuses too; this
        // keeps the picture honest between corrections). Passenger: pinned.
        if (myBoat) {
          const v = boatViews.get(myBoat.id);
          if (v && myBoat.seat === "captain") {
            // Keep the hull off the shore locally so the server's refusal
            // never has to rubber-band you. ONLY when the cell is actually
            // loaded — an unstreamed chunk reads as zeros, and treating that
            // as "shallow" pinned the boat in place until it re-entered.
            // A hull needs WATER, not depth (Josh: "I can't use the boat
            // over shallow areas") — any wet cell floats it; only dry land
            // turns it back. Unknown (unstreamed) cells are allowed: the
            // server has the last word and reading zeros as "dry" used to
            // pin the boat in place.
            const cx0 = Math.floor(player.x);
            const cy0 = Math.floor(player.y);
            const known = world.hasCell(cx0, cy0);
            const wet = world.waterDepthAt(cx0, cy0) > 0.05;
            if (known && !wet && boatLastGood) {
              player.x = boatLastGood.x;
              player.y = boatLastGood.y;
            } else if (!known || wet) {
              boatLastGood = { x: player.x, y: player.y };
            }
            v.tx = player.x;
            v.ty = player.y;
            v.th = player.yaw;
            // The captain rides the BACK bench, so the hull sits one
            // aft-bench offset AHEAD of the eye (hull centre = you, moved
            // noseward) — from the water you see yourself at the stern.
            v.group.position.set(
              player.x * CELL - Math.sin(player.yaw) * BOAT_SEAT_AFT,
              boatSurfaceY(player.x, player.y),
              player.y * CELL - Math.cos(player.yaw) * BOAT_SEAT_AFT,
            );
            v.group.rotation.y = player.yaw;
            v.group.rotation.z = Math.sin(now / 900) * 0.018; // the water's sway
          } else if (v) {
            player.x += (v.tx - player.x) * Math.min(1, dt * 12);
            player.y += (v.ty - player.y) * Math.min(1, dt * 12);
          }
        }
        // Peer boats glide toward their frames. The wire position is the
        // CAPTAIN (the back bench), so the hull draws the same noseward
        // offset the local captain applies — both views agree on the water.
        for (const [id, v] of boatViews) {
          if (myBoat && myBoat.seat === "captain" && myBoat.id === id) continue;
          const gx = v.tx * CELL - Math.sin(v.th) * BOAT_SEAT_AFT;
          const gz = v.ty * CELL - Math.cos(v.th) * BOAT_SEAT_AFT;
          const k = 1 - Math.exp(-8 * dt);
          v.group.position.x += (gx - v.group.position.x) * k;
          v.group.position.z += (gz - v.group.position.z) * k;
          v.group.position.y = boatSurfaceY(v.tx, v.ty);
          let dh = v.th - v.group.rotation.y;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          v.group.rotation.y += dh * k;
          v.group.rotation.z = Math.sin(now / 900 + id) * 0.015;
        }
        // RIDERS SIT THE HULL (the sitting pose, Aug 2026): placed FROM the
        // boat — captain on the back bench, passenger on the front — never
        // from their own wire frames (the server pins both riders to the
        // hull's position, which would stack the two bodies on one bench).
        // And THE WAKE: a hull under way sloshes — the same water-step
        // slices the feet use, paced by distance travelled, faded by range.
        for (const [, v] of boatViews) {
          const yaw = v.group.rotation.y;
          const seatPeer = (uid: number | null, zLocal: number): void => {
            if (uid === null) return;
            const p = peers.get(uid);
            if (!p || !p.aboard) return;
            p.target.x = v.group.position.x + Math.sin(yaw) * zLocal;
            p.target.z = v.group.position.z + Math.cos(yaw) * zLocal;
            p.heading = yaw; // a seated body faces the bow, not their look
          };
          seatPeer(v.captain, BOAT_SEAT_AFT);
          seatPeer(v.passenger, BOAT_SEAT_FORE);
          // Paced off the BENCH position (tx/ty), not the hull centre —
          // the hull pivots around the bench when the captain turns their
          // head, and a look-around must not read as travel.
          const trav = Math.hypot(v.tx * CELL - v.px, v.ty * CELL - v.pz) / CELL;
          v.px = v.tx * CELL;
          v.pz = v.ty * CELL;
          if (trav > 0.0004 && trav < 1.5) {
            v.wake += trav;
            if (v.wake > 0.85) {
              v.wake = 0;
              const dist = Math.hypot(v.group.position.x / CELL - player.x, v.group.position.z / CELL - player.y);
              if (dist < 16) footstep(false, false, "water", Math.max(0.2, 1 - dist / 16));
            }
          }
        }
        wantChunks();

        // Send position at 10Hz when something changed. Pose (crouch/air)
        // counts as a change on its own — crouching in place has no position
        // delta, but peers still need to see the body drop.
        if (now - lastMoveSend > 100) {
          const pose = ctl.fly.on ? 0 : myBoat ? 4 : swimming ? 3 : !grounded ? 2 : crouching ? 1 : 0;
          // Equipment rides the pos wire like the suit does (Josh: "other
          // players cannot see equipment they are holding/using") — the
          // held KIND plus a "!" when it's actively in use, so peers can
          // pose the model and play the sound.
          const heldNow = slots[selSlot];
          const heldActive =
            heldNow?.kind === "flashlight" ? flashOn
            : heldNow?.kind === "walkie" ? txing
            // The RAISE is what peers pose on, and locally the raise is the
            // AIM (right-click), not the tape — camRec here meant you saw the
            // camera at your face while the room saw it stowed at your hip.
            : heldNow?.kind === "camera" ? camAiming
            : heldNow?.kind === "spraycan" ? sprayHeld
            : false;
          // A dance empties the hands on every screen: locally the held item
          // hides for the emote (startEmote), so the wire must not keep
          // telling peers to IK a flashlight into the dancer's fist.
          const equip = heldNow && !emoting ? `${heldNow.kind}${heldActive ? "!" : ""}` : "";
          const em = emoting?.id ?? "";
          const dx = Math.abs(player.x - lastSent.x) + Math.abs(player.y - lastSent.y);
          const dh = Math.abs(player.yaw - lastSent.h);
          const dpt = Math.abs(player.pitch - lastSent.pt);
          if (dx > 0.01 || dh > 0.03 || dpt > 0.05 || pose !== lastSent.p || equip !== lastSent.e || em !== lastSent.em) {
            net!.move(player.x, player.y, player.yaw, pose, equip, player.pitch, em);
            lastSent = { x: player.x, y: player.y, h: player.yaw, p: pose, e: equip, pt: player.pitch, em };
          }
          lastMoveSend = now;
        }

        // AT A WAY OUT: say so once each time you arrive (the Entrance is
        // only red lines on a wall, by design — this is how you learn the key).
        if (exitDoors.length && !debrief && !specOn) {
          const near = exitDoors.some((ed) => atExitDoor(ed));
          if (near && !atExitShown && !exiting) note(`${keyLabel(brSettings.keys.interact)} — leave the Backrooms here`);
          atExitShown = near;
        }
      }

      // Camera from player state (+ a subtle walk bob). Each bob trough is a
      // footfall — the step sounds ride the same clock as the sway. Crouch
      // lowers the eye and hushes the steps (the entity won't hear them).
      const prevPhase = Math.floor(bobT / Math.PI);
      bobT = player.moving ? bobT + dt * (sprinting ? 12 : crouchAmt > 0.5 ? 6.5 : 9) : 0;
      if (player.moving && grounded && !swimming && !myBoat && Math.floor(bobT / Math.PI) !== prevPhase && bobT > 0) {
        // Surface: the Poolrooms walk on tile — and SLOSH where there's
        // water under your feet (Josh's samples for both).
        const wl = world.waterAt(Math.floor(player.x), Math.floor(player.y));
        const inWater = wl !== null && wl - world.groundAt(player.x, player.y) > 0.05;
        footstep(sprinting, crouchAmt > 0.5, inWater || lightsWetAt(player.x, player.y) ? "water" : floorSurface(level));
      }
      // Swim strokes ride their own slower clock (a soft slosh per stroke —
      // silent when fully under, the water swallows it).
      if (swimming && player.moving && Math.floor(swimT / Math.PI) !== swimPhase) {
        swimPhase = Math.floor(swimT / Math.PI);
        if (!submerged) footstep(false, true, "water");
      }
      const bob = swimming ? Math.sin(swimT) * 0.05 : player.moving && grounded ? Math.sin(bobT) * 0.035 : 0;
      // v2 VERTICALITY: the eye rides the smooth ground height under the
      // player (bilinear over shared corner heights), so a ramp feels like a
      // slope instead of a stair-step, and a sublevel actually reads as down.
      // Swimming pins it to the float height instead, so climbing out
      // resumes the ground follow from the waterline, not the pool floor.
      // Aboard, the body's origin sits BOAT_SIT_DROP under the waterline so
      // the sit clip's pelvis lands on the bench (boatSurfaceY is wl − 0.1).
      if (myBoat) groundY = boatSurfaceY(player.x, player.y) - (BOAT_SIT_DROP - 0.1);
      else if (swimming) groundY = swimY;
      else if (airborne) {
        // In the air the eye rides the ARC, not the terrain — groundY is
        // frozen at the takeoff height (airBase) and jumpY carries it.
        groundY = airBase;
      } else {
        const gNow = world.groundAt(player.x, player.y);
        // (never under the flycam: the camera flies, the body doesn't fall)
        if (gNow < groundY - 0.35 && !ctl.fly.on) {
          // THE FLOOR FELL AWAY (Josh: "it sucks them to the ground — there
          // should be air time"). Walking off a ledge starts a FALL from
          // where the feet already are, instead of teleporting them down.
          // The 0.35m gate is above any per-frame ramp descent, below any
          // real ledge.
          airborne = true;
          airBase = groundY;
          jumpY = 0;
          vy = 0;
        } else {
          groundY += (gNow - groundY) * Math.min(1, dt * 14);
          airBase = groundY;
        }
      }
      // EYE HEIGHT FOLLOWS THE BODY'S OWN HEAD. It used to subtract
      // `crouchAmt * 0.55`, a guess that had no relationship to how far the
      // crouch CLIP actually lowers the head — so the view and the body
      // disagreed, worst of all while crouched. headDrop is measured off the
      // real head bone every frame (placeViewmodel), so the eye tracks whatever
      // the animation does. The guess remains as a fallback for the first frames
      // before the model has loaded.
      const poseDrop = viewmodel ? viewmodel.headDrop : -crouchAmt * 0.55;
      // Swimming: the eye rides the float height — head just above the
      // surface while treading, genuinely UNDER it while sinking/diving.
      // Aboard: SEATED height — the standing eye plus the sit clip's own
      // measured head drop (poseDrop), and a gentle roll instead of the
      // walk bob. The eye lands wherever the seated body's head actually is.
      let eyeY = myBoat
        ? groundY + EYE + poseDrop + Math.sin(now / 900) * 0.03
        : swimming
          ? swimY + 1.42 + bob
          : groundY + EYE + poseDrop + jumpY + bob;
      if (!ctl.fly.on) {
        // HEADROOM CLAMP. Whatever the floor is doing — a ramp, a jump, a
        // hard landing — the eye never leaves the room it's in. Without this a
        // low-ceilinged district plus any upward push put the camera above the
        // tiles and you were looking down on the level from inside the
        // ceiling. A ghost is exempt: going through the roof is its job.
        const cx = Math.floor(player.x);
        const cy = Math.floor(player.y);
        const ceil = world.floorAt(cx, cy) + world.cellHeightAt(cx, cy);
        eyeY = Math.min(eyeY, ceil - 0.25);
      }

      // ADMIN PROBE: cast down the crosshair and name what it hits. "NOTHING"
      // is the answer that matters — it means the pixel Josh is looking at has
      // no geometry behind it, i.e. a real hole, and it prints the cell so I
      // can dump exactly that spot instead of inferring from a screenshot.
      if (probeOn && (probeFrame = (probeFrame + 1) % 15) === 0) {
        const cx = Math.floor(player.x);
        const cy = Math.floor(player.y);
        probeRay.setFromCamera(PROBE_CENTER, camera);
        probeRay.far = 120;
        const hits = probeRay.intersectObjects(scene.children, true);
        const hit = hits.find((h) => h.object instanceof THREE.Mesh && h.object.visible);
        // The ENTITY's animation state. "still static" is a symptom with a
        // dozen causes; this prints the actual mixer numbers, so one glance
        // says whether the action is running, whether its TIME is advancing,
        // and whether it has any weight to render with.
        let ent = " · entity: not loaded";
        {
          const inst0 = entInsts.get(0);
          const spec = inst0 && entPoses[inst0.clip];
          const act = inst0 && spec ? inst0.actions[spec.clip] : null;
          ent =
            ` · entity[${inst0 ? `${inst0.mode}${inst0.group.visible ? "" : ",hidden"}` : "unloaded"}] ` +
            (act && spec
              ? `${spec.clip} t=${act.time.toFixed(2)} w=${act.getEffectiveWeight().toFixed(2)} ` +
                `rate=${act.timeScale} ${act.isRunning() ? "RUNNING" : "STOPPED"}`
              : `NO ACTION`) +
            ` · clips ${entClipInfo || "(none)"}`;
        }
        const here = `cell ${cx},${cy} floor ${world.floorStepsAt(cx, cy)} (${world.floorAt(cx, cy).toFixed(1)}m) ceil ${world.cellHeightAt(cx, cy).toFixed(1)}m${ent}`;
        if (!hit) {
          probeText = `${here} · LOOKING AT: NOTHING — no geometry (a hole)`;
        } else {
          const p = hit.point;
          const hx = Math.floor(p.x / CELL);
          const hy = Math.floor(p.z / CELL);
          const name = hit.object.name || "(unnamed)";
          probeText =
            `${here} · LOOKING AT: ${name} @ ${hx},${hy} ` +
            `floor ${world.floorStepsAt(hx, hy)} ${world.solidAt(hx, hy) ? "SOLID" : "open"} ` +
            `${hit.distance.toFixed(1)}m`;
        }
      }
      camera.position.set(
        player.x * CELL,
        // Flying: the eye is wherever the ghost put it. Walking: it rides the
        // smooth floor, clamped under the ceiling.
        ctl.fly.on ? player.alt : eyeY,
        player.y * CELL,
      );
      // A PASSENGER'S server position is the hull (the captain's bench) —
      // their eye belongs over the FRONT bench, one bench-spread noseward.
      // Purely visual: the wire keeps the pinned position.
      if (myBoat && myBoat.seat === "passenger") {
        const v = boatViews.get(myBoat.id);
        if (v) {
          const span = BOAT_SEAT_AFT - BOAT_SEAT_FORE;
          camera.position.x -= Math.sin(v.group.rotation.y) * span;
          camera.position.z -= Math.cos(v.group.rotation.y) * span;
        }
      }
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
      // THE DEATH CAM (Aug 2026): while your own ragdoll flies, the camera
      // stands where the killer was and watches the body tumble away. Set
      // LAST so the yaw/pitch writes above can't undo the lookAt.
      if (deathCam) {
        camera.position.set(deathCam.x, deathCam.y, deathCam.z);
        if (deathCam.rag.rag) {
          const p = deathCam.rag.rag.pelvis();
          camera.lookAt(p.x, p.y, p.z);
        }
      }
      // THE BODY, placed once the eye for this frame is final — a frame of lag
      // here would read as the body trailing your own head. Must also come
      // after tickViewmodel, since it overrides the clip's neck pose.
      // (Skipped mid-emote: the body on screen is the stand-in clone.)
      if (viewmodel && !emoting) {
        placeViewmodel(viewmodel, camera.position, player.yaw, player.pitch);
        // THE GEAR ARM (Josh: "attach the model to the right hand and
        // animate it"): the right arm IKs to wherever the held item is
        // posed, every frame, after the body and pitch are placed — so
        // raising the walkie visibly RAISES YOUR ARM, the torch rides an
        // extended hand, and the item and the arm always agree. The camera
        // has to be up to date first (heldObj lives in camera space).
        if (heldObj && viewmodel.upperArm && viewmodel.foreArm && viewmodel.hand) {
          camera.updateMatrixWorld(true);
          heldObj.getWorldPosition(ARM_TARGET);
          armIK(viewmodel.upperArm, viewmodel.foreArm, viewmodel.hand, ARM_TARGET, 0.75);
        }
      }
      if (fallShake > 0.001) {
        // A hard landing rattles the view for a moment, then settles.
        camera.rotation.z = (Math.random() - 0.5) * 0.09 * fallShake;
        camera.position.y -= fallShake * 0.16;
        fallShake *= Math.exp(-6 * dt);
      } else camera.rotation.z = 0;

      // THIRD PERSON FOR THE DANCE (Josh: "so the player can see it").
      // The camera leaves the head and orbits the stand-in body — mouse X
      // swings around it, mouse Y rides up and over. Clamped by a ray from
      // the chest so a 2m corridor never puts the lens inside a wall, and
      // never below the last first-person eye so it can't sink into the
      // floor. Overrides everything the first-person block just did; the
      // moment the emote ends the old camera math simply resumes.
      if (emoting) {
        const bx = player.x * CELL;
        const bz = player.y * CELL;
        const focusY = groundY + 1.15;
        const cosP = Math.cos(emotePitch);
        const want = 2.7;
        const ox = Math.sin(emoteYaw) * cosP;
        const oz = Math.cos(emoteYaw) * cosP;
        const oy = Math.sin(emotePitch);
        emoteRay.camera = camera;
        emoteRay.set(EMOTE_V1.set(bx, focusY, bz), EMOTE_V2.set(ox, oy, oz).normalize());
        emoteRay.far = want;
        const hits = emoteRay.intersectObjects(scene.children, true);
        // The ray starts inside the dancing body — never let the body's own
        // mesh (any ancestor = its group) count as a wall.
        const bodyGroup = emoting.body.group;
        const isBody = (o: THREE.Object3D): boolean => {
          for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === bodyGroup) return true;
          return false;
        };
        const hit = hits.find((h) => h.object instanceof THREE.Mesh && h.object.visible && !isBody(h.object));
        const dist = Math.max(0.6, (hit ? hit.distance : want) - 0.18);
        camera.position.set(bx + ox * dist, focusY + oy * dist, bz + oz * dist);
        camera.lookAt(bx, focusY, bz);
      }

      // LAW 12 — THE WATCH. The camera hangs round the one you watch: the
      // mouse swings it, a ray from their chest keeps it out of the walls.
      // The world streams round them (player.x/y ride along — nothing is
      // sent, the dead don't move), and the HUD's clock ticks.
      if (specOn && spec) {
        const t = peers.get(spec.target);
        if (t) {
          const bx = t.group.position.x;
          const bz = t.group.position.z;
          const focusY = t.group.position.y + 1.3;
          player.x = bx / CELL;
          player.y = bz / CELL;
          const cosP = Math.cos(specPitch);
          const want = 3.4;
          const ox = Math.sin(specYaw) * cosP;
          const oz = Math.cos(specYaw) * cosP;
          const oy = Math.sin(specPitch);
          emoteRay.camera = camera;
          emoteRay.set(EMOTE_V1.set(bx, focusY, bz), EMOTE_V2.set(ox, oy, oz).normalize());
          emoteRay.far = want;
          const body = t.group;
          const isBody = (o: THREE.Object3D): boolean => {
            for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === body) return true;
            return false;
          };
          const hit = emoteRay.intersectObjects(scene.children, true).find((h) => h.object instanceof THREE.Mesh && h.object.visible && !isBody(h.object));
          const dist = Math.max(0.6, (hit ? hit.distance : want) - 0.2);
          camera.position.set(bx + ox * dist, focusY + oy * dist, bz + oz * dist);
          camera.lookAt(bx, focusY, bz);
          if (now - specCamSentAt > 200 && !(Math.abs(specYaw - specCamSentYaw) < 0.04)) {
            specCamSentAt = now;
            specCamSentYaw = specYaw;
            net?.specCam(specYaw);
          }
        }
        if (now - specClock > 100) specClock = now;
      }

      // Walkie: transmitting drains the SELECTED radio; switching away or
      // running dry cuts the transmission.
      const heldNow = slots[selSlot];
      if (txing) {
        if (heldNow?.kind !== "walkie") {
          txing = false;
          net!.walkieTx(false);
        } else {
          let wb = Math.max(0, (batteries.get(heldNow.id) ?? 0) - dt);
          batteries.set(heldNow.id, wb);
          if (wb <= 0) {
            txing = false;
            net!.walkieTx(false);
            note("walkie battery dead");
          }
        }
      }
      if (heldNow?.kind === "walkie") {
        walkiePct = (batteries.get(heldNow.id) ?? 0) / ((WALKIE_MIN[heldNow.level] ?? 7) * 60);
      }

      // Spray paint: hold click with the can in hand, aimed at a wall
      // within reach. FAST emission (~26 splats/s — reads as a continuous
      // stroke) but the can drains in REAL held-seconds, so faster spray
      // does not mean faster empty (Josh's tuning).
      const heldSpray = slots[selSlot];
      if (sprayHeld && heldSpray?.kind === "spraycan") {
        let paint = batteries.get(heldSpray.id) ?? 0;
        if (paint <= 0) {
          sprayHeld = false;
          stopSprayHiss();
          note("can's empty");
        } else {
          paint = Math.max(0, paint - dt); // held time IS the budget
          batteries.set(heldSpray.id, paint);
          if (now - lastSprayAt > 38) {
            // A REAL RAYCAST at the crosshair (Josh: "it will spray on the
            // wall if I am looking up" — the old 2D grid walk ignored pitch
            // entirely and painted whatever wall the horizontal ray met).
            // Paint lands exactly where the dot is, or nowhere.
            camera.getWorldDirection(FWD);
            SPRAY_RAY.set(camera.position, FWD);
            SPRAY_RAY.far = 3.6;
            SPRAY_TARGETS.length = 0;
            for (const [, grp] of world.meshes) SPRAY_TARGETS.push(grp);
            const sHit = SPRAY_RAY
              .intersectObjects(SPRAY_TARGETS, true)
              .find((hh) => (hh.object.name === "wall" || hh.object.name === "riser") && hh.face);
            if (sHit && sHit.face) {
              const n = sHit.face.normal; // merged geometry is world-space
              const hx = sHit.point.x, hy = sHit.point.y, hz = sHit.point.z;
              let face: "N" | "S" | "E" | "W" | null = null;
              let scx = 0, scy = 0, su = 0;
              if (n.z > 0.7) {
                face = "N"; scy = Math.round(hz / CELL); scx = Math.floor(hx / CELL); su = hx / CELL - scx;
              } else if (n.z < -0.7) {
                face = "S"; scy = Math.round(hz / CELL) - 1; scx = Math.floor(hx / CELL); su = hx / CELL - scx;
              } else if (n.x < -0.7) {
                face = "E"; scx = Math.round(hx / CELL) - 1; scy = Math.floor(hz / CELL); su = hz / CELL - scy;
              } else if (n.x > 0.7) {
                face = "W"; scx = Math.round(hx / CELL); scy = Math.floor(hz / CELL); su = hz / CELL - scy;
              }
              if (face) {
                const v = Math.max(0, Math.min(1, (hy - 0.1) / 2.9));
                const mark = { cellX: scx, cellY: scy, face, u: Math.max(0, Math.min(1, su)), v };
                net!.spray(mark);
                addSprayMark(world, scene, { ...mark, color: heldSpray.color ?? "black" });
                lastSprayAt = now;
              }
            }
          }
        }
      } else if (sprayHeld) {
        // Holstered mid-stroke — the can stops making noise too.
        sprayHeld = false;
        stopSprayHiss();
      }
      if (heldSpray?.kind === "spraycan") {
        sprayPct = (batteries.get(heldSpray.id) ?? 0) / (SPRAY_SEC[heldSpray.level] ?? 90);
      }

      // Camera: recording eats tape only while IN HAND and rolling. The
      // server scores the footage (closest LOS shot of the entity) — it
      // just needs to know when the camera is actually rolling.
      if (camRec !== camSent) {
        camSent = camRec;
        net!.cam(camRec);
      }
      const heldCam = slots[selSlot];
      if (heldCam?.kind === "camera") {
        let tape = batteries.get(heldCam.id) ?? 0;
        if (camRec) {
          tape = Math.max(0, tape - dt);
          batteries.set(heldCam.id, tape);
          if (tape <= 0) {
            camRec = false;
            note("tape full");
          }
        }
        camLeft = Math.floor(tape); // shown in whole seconds
      } else if (camRec) {
        camRec = false; // holstered mid-recording
      }

      // Flashlight: lit only while IN HAND and on; battery drains only lit.
      const held = slots[selSlot];
      const isFlash = held?.kind === "flashlight";
      if (isFlash) {
        let batt = batteries.get(held!.id) ?? 0;
        if (flashOn && batt > 0) {
          // LIGHTS OUT drinks batteries: half as fast again
          batt = Math.max(0, batt - dt * (level === 6 ? 1.5 : 1));
          batteries.set(held!.id, batt);
          if (batt <= 0) flashOn = false;
        }
        flashPct = Math.round((batt / ((FLASH_MIN[held!.level] ?? 15) * 60)) * 100) / 100; // shown in whole percent
      }
      const lit = isFlash && flashOn && (batteries.get(held!.id) ?? 0) > 0;
      flash.visible = lit;
      if (lit) {
        // Intensity 30/decay-1.5 blinded at close range (Josh) — decay 1
        // flattens the near/far contrast so a wall at arm's length glows
        // instead of detonating, and the beam still throws its 20m.
        flash.intensity = 9;
        flash.decay = 1.0;
        // LIGHTS OUT: the beam ends at half its reach (the dark drinks it)
        flash.distance = level === 6 ? 10 : 20;
        flash.penumbra = 0.65;
        camera.getWorldDirection(FWD);
        // The beam leaves the TORCH IN YOUR HAND, not your forehead (Josh:
        // "make the light emanate from the front of the flashlight") —
        // low-right of view, pushed forward to the lens.
        const rx = FWD.z, rz = -FWD.x; // camera-right on the ground plane
        flash.position.set(
          camera.position.x + rx * 0.26 + FWD.x * 0.45,
          camera.position.y - 0.24,
          camera.position.z + rz * 0.26 + FWD.z * 0.45,
        );
        flashTarget.position.copy(camera.position).addScaledVector(FWD, 8);
      }

      // Seam healing: one queued neighbour rebuild per frame (see onChunk) —
      // but only when the frame has HEADROOM (Aug 2026 stutter fix: after a
      // boundary crossing the queue holds 15-20 chunks, and draining one
      // unconditionally put a full build into every already-busy frame for
      // most of a second). A 400ms starvation guard keeps a struggling
      // machine healing seams anyway, just slower.
      if (rebuildQueue.size && (performance.now() - now < 7 || now - lastSeamRebuild > 400)) {
        lastSeamRebuild = now;
        const nk = rebuildQueue.values().next().value as string;
        rebuildQueue.delete(nk);
        const nd = world.chunks.get(nk);
        if (nd) buildChunk(world, scene, nd, true);
      }

      tickFlickers(world, now);
      // THE ROOM SOUND underfoot (the map editor's Sound setting), a few
      // times a second: a loop over the hum, silence, or the level's own
      if (now - lastRoomSoundAt > 250) {
        lastRoomSoundAt = now;
        const st = world.styleAt(Math.floor(player.x), Math.floor(player.y));
        const rs = roomSound(st?.sound);
        setRoomSound(rs ? (rs.url ?? "silence") : null);
      }
      tickWater(now); // returns at once on a level with no pools built
      // placed doors swing open for whoever is near (the prop kit's "open" clips)
      {
        const bodies: { x: number; y: number }[] = [{ x: player.x, y: player.y }];
        for (const p of peers.values()) bodies.push({ x: p.group.position.x / CELL, y: p.group.position.z / CELL });
        tickSwingDoors(world, bodies, dt);
      }
      // The entity's tell: fixtures near it lose their nerve (replaces the
      // darkness aura). AFTER tickFlickers — it multiplies onto the cloned
      // flicker mats that tickFlickers just rewrote.
      let flickEnt: EntInst | null = null;
      for (const inst of entInsts.values()) {
        if (!inst.group.visible) continue;
        if (
          !flickEnt ||
          Math.hypot(inst.group.position.x - player.x * CELL, inst.group.position.z - player.y * CELL) <
            Math.hypot(flickEnt.group.position.x - player.x * CELL, flickEnt.group.position.z - player.y * CELL)
        ) {
          flickEnt = inst;
        }
      }
      tickEntityFlicker(
        world,
        flickEnt?.group.position.x ?? 0,
        flickEnt?.group.position.z ?? 0,
        !!flickEnt,
        now,
      );

      // THE BROWNOUT ENVELOPE. Three acts on the server's clock: ~1s of
      // dying stutter (bright/dark fighting), the long dark simmer (a few
      // percent of power, slow-wandering), and a fluorescent RE-STRIKE in
      // the last 800ms (flashes before the tubes commit). Flicker steps are
      // re-rolled every 40–150ms; between rolls the level holds, which is
      // exactly how failing discharge tubes behave — steps, not fades.
      if (brownUntil > 0) {
        if (now >= brownUntil) {
          brownUntil = 0;
          brownLevel = 1;
        } else if (now >= brownFlickAt) {
          brownFlickAt = now + 40 + Math.random() * 110;
          const dying = Math.min(1, (now - brownStart) / 1000);
          const restrike = Math.max(0, 1 - (brownUntil - now) / 800);
          if (restrike > 0) {
            brownLevel = Math.random() < 0.45 ? 0.06 + Math.random() * 0.1 : 0.45 + Math.random() * 0.55;
          } else if (dying < 1) {
            brownLevel =
              Math.random() < 0.35 + 0.55 * dying
                ? 0.05 + Math.random() * 0.1
                : 0.5 + Math.random() * 0.5;
          } else if (brownBlack && now - brownStart > 4000 && brownUntil - now > 1500) {
            // THE BLACKOUT: past the sag, the sector goes to nothing —
            // flashlights or feel your way. A rare dying spark, that's all.
            brownLevel = Math.random() < 0.985 ? 0 : 0.2 + Math.random() * 0.15;
          } else {
            brownLevel = 0.04 + Math.random() * 0.09;
          }
        }
      }
      // THE ROOM'S LIGHT = the blackout envelope × the entity's flicker.
      // Josh: "when the entity is chasing you it makes the lights flicker
      // [but] the brightness of the room doesn't change" — now the same
      // chatter that rattles the panels drags the room's whole light level
      // with it, deepening as it closes. This is the honest version of
      // "real-time lighting" the baked world can afford: one global dial a
      // frame, zero extra draw cost.
      let entDim = 1;
      for (const inst of entInsts.values()) {
        if (!inst.group.visible) continue;
        const edx = inst.group.position.x - player.x * CELL;
        const edz = inst.group.position.z - player.y * CELL;
        const eprox = 1 - Math.min(1, Math.hypot(edx, edz) / 18);
        if (eprox > 0.02) {
          const eph = (now / 1000) * 9.7;
          const wave = Math.sin(eph) * Math.sin(eph * 2.31 + 1.7);
          const flick = wave > 0.35 - eprox * 0.55 ? 1 : 0.5 + 0.35 * (1 - eprox);
          entDim = Math.min(entDim, 1 + (flick - 1) * eprox);
        }
      }
      // THE OFFICE's dip: the troffers of your zone go to nothing for a breath
      const officeDip = level === 4 && now < officeDipUntil ? 0.08 : 1;
      const roomK = (brownUntil > 0 ? brownLevel : 1) * entDim * officeDip;
      if (roomK !== lastRoomK) {
        setPowerLevel(roomK);
        lastRoomK = roomK;
      }

      // Bodies vanish when the stream stops mentioning them (looted empty) —
      // and take their blood pool with them.
      for (const [bid, c] of bodyMap) {
        if (now - c.seenAt > 6500) {
          disposeAvatar(scene, c.avatar);
          if (c.pool) c.pool.parent?.remove(c.pool);
          bodyMap.delete(bid);
        }
      }

      // Relic sites bob + pulse; stale ones (stream stopped) vanish. The name
      // label rides along, fading in only within reading distance so the
      // whole sector doesn't shout at you.
      for (const [rid, r] of relicSites) {
        if (now - r.seenAt > 4500) {
          reap(r.sprite);
          reap(r.label);
          relicSites.delete(rid);
          continue;
        }
        // The bob rides the floor pin's offset: tickGroundPins rewrites y from
        // the floor every frame, so setting y here was overwritten and no
        // relic ever bobbed (Nov 2026 polish round).
        r.pin.off = 1.15 + Math.sin(now / 480 + rid) * 0.13;
        r.labelPin.off = r.pin.off + 0.7;
        r.sprite.scale.setScalar(0.75 + Math.sin(now / 300 + rid) * 0.08);
        const dCells = Math.hypot(r.x - player.x, r.y - player.y);
        const mat = r.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (16 - dCells) / 6));
        r.label.visible = mat.opacity > 0.02;
      }

      // Lore drives: dead lumps that don't move. The label fades in close, and
      // a site vanishes when the stream stops mentioning it (somebody got it).
      for (const [id, d] of driveSites) {
        if (now - d.seenAt > 6500) {
          reap(d.mesh);
          reap(d.label);
          driveSites.delete(id);
          continue;
        }
        const dCells = Math.hypot(d.x - player.x, d.y - player.y);
        const mat = d.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (9 - dCells) / 4));
        d.label.visible = mat.opacity > 0.02;
      }

      stationSeats.tick(); // the station's sites and the office's door
      tickGroundPins();
      if (unmountedDoors.size) retryDoorMounts();
      tickOperator(now);

      // THE KEY turns where it lies, so a flashlight beam finds it.
      if (keySite) {
        if (now - keySite.seenAt > 6500) {
          scene.remove(keySite.mesh);
          scene.remove(keySite.label);
          keySite = null;
        } else {
          keySite.mesh.rotation.y = now / 1400;
          keySite.mesh.position.y = world.groundAt(keySite.x, keySite.y) + 0.5 + Math.sin(now / 900) * 0.04;
          const dCells = Math.hypot(keySite.x - player.x, keySite.y - player.y);
          const mat = keySite.label.material as THREE.SpriteMaterial;
          mat.opacity = Math.max(0, Math.min(1, (12 - dCells) / 5));
          keySite.label.visible = mat.opacity > 0.02;
        }
      }

      for (const [i, fs] of fuseSites) {
        if (now - fs.seenAt > 6500) {
          scene.remove(fs.mesh);
          scene.remove(fs.label);
          fuseSites.delete(i);
          continue;
        }
        fs.mesh.rotation.y = now / 1300 + i;
        const mat = fs.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (12 - Math.hypot(fs.x - player.x, fs.y - player.y)) / 5));
        fs.label.visible = mat.opacity > 0.02;
      }
      tickStation(now);
      if (level === 4) tickOfficeRain(now);
      if (level === 6) {
        lights.tick(now, dt, player.x, player.y);
        tickLightsSound(now);
      }
      if (level === 8) {
        cave.tick(now, dt, player.x, player.y);
        tickCaveSound(now);
      }
      if (level === 9) {
        suburb.tick(now, dt, player.x, player.y);
        tickSuburbSound(now);
      }
      if (level === 7) {
        ocean.tick(now, player.x, player.y, session.user?.id ?? -1, oceanDiving() ? camera.position.y : null);
        tickOceanSound(now);
        tickOceanFog();
      }
      if (level === 5) {
        hotel.tick(now, dt);
        tickHotelSound(now);
        // walking away from a lift closes its panel
        if (liftAt && Math.hypot(liftAt.x - player.x, liftAt.y - player.y) > 2.6) liftAt = null;
      }
      for (const lab of [hatchSite?.label, fuseBoxSite?.label]) {
        if (!lab) continue;
        const src = lab === hatchSite?.label ? hatchSite! : fuseBoxSite!;
        const mat = lab.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (30 - Math.hypot(src.x - player.x, src.y - player.y)) / 12));
        lab.visible = mat.opacity > 0.02;
      }

      // THE DOOR's name reads from a long way off — its location is allowed to
      // be known; the key's is not.
      if (doorSite) {
        const dCells = Math.hypot(doorSite.x - player.x, doorSite.y - player.y);
        const mat = doorSite.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (30 - dCells) / 12));
        doorSite.label.visible = !doorSite.quiet && mat.opacity > 0.02;
        // THE SWING. Driven by hand rather than left to the mixer, because the
        // source clip closes the door again after 3.13s and we want it to stay
        // open once it's open.
        if (doorSite.mixer && doorSite.swinging) {
          const peak = doorProto?.openT ?? DOOR_OPEN_T;
          const t = Math.min(peak, (doorSite.t ?? 0) + dt * (doorProto?.speed ?? 1));
          doorSite.t = t;
          doorSite.mixer.setTime(t);
          if (t >= peak) doorSite.swinging = false;
        }
      }

      // Dropped items: sit still, name shown up close, gone when the stream
      // stops mentioning them (picked up, or rotted after an hour).
      for (const [did, d] of dropSites) {
        if (now - d.seenAt > 6500) {
          reap(d.sprite);
          reap(d.label);
          dropSites.delete(did);
          continue;
        }
        const dCells = Math.hypot(d.x - player.x, d.y - player.y);
        const mat = d.label.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, Math.min(1, (10 - dCells) / 4));
        d.label.visible = mat.opacity > 0.02;
      }

      // THE ENTITIES: glide each to its last server frame, face where it's
      // going, vanish when the server stops talking about it — and SOUND like
      // the NEAREST one (walking loop wandering, the scream hunting). Every
      // hard-won rule (rest-pose reset, shimmer, grab, floor pin) runs per
      // instance; nothing is shared between the two skeletons.
      {
        let soundInst: EntInst | null = null;
        for (const inst of entInsts.values()) {
          const near = now - inst.seenAt < 1600;
          inst.group.visible = near;
          if (near) {
            // Where was it ENT_LAG ms ago? Interpolate between the two server
            // frames bracketing that moment (snapshot interpolation).
            const rt = now - ENT_LAG;
            let tx = inst.group.position.x;
            let tz = inst.group.position.z;
            const snaps = inst.snaps;
            if (snaps.length) {
              const newest = snaps[snaps.length - 1];
              if (rt >= newest.at) {
                tx = newest.x;
                tz = newest.z;
              } else if (rt <= snaps[0].at) {
                tx = snaps[0].x;
                tz = snaps[0].z;
              } else {
                for (let i = snaps.length - 2; i >= 0; i--) {
                  if (snaps[i].at <= rt) {
                    const a = snaps[i];
                    const b = snaps[i + 1];
                    const fr = (rt - a.at) / Math.max(1, b.at - a.at);
                    tx = a.x + (b.x - a.x) * fr;
                    tz = a.z + (b.z - a.z) * fr;
                    break;
                  }
                }
              }
            }
            const prevX = inst.group.position.x;
            const prevZ = inst.group.position.z;
            // A light final smooth irons the snapshot corners; the target is
            // already continuous, so this adds ~70ms of lag, not mush.
            const s = 1 - Math.exp(-14 * dt);
            inst.group.position.x += (tx - prevX) * s;
            inst.group.position.z += (tz - prevZ) * s;
            // Floor height re-sampled at the CURRENT spot every frame (a chunk
            // can stream in late), eased so a height step isn't a pop.
            const gy = world.groundAt(inst.group.position.x / CELL, inst.group.position.z / CELL);
            inst.group.position.y += (gy - inst.group.position.y) * Math.min(1, 1 - Math.exp(-16 * dt));
            const mdx = inst.group.position.x - prevX;
            const mdz = inst.group.position.z - prevZ;
            if (Math.hypot(mdx, mdz) > 0.0012) {
              // Heading EASED along the shortest arc — the old instant atan2
              // twitched the whole body on every wobble of the target.
              const want = Math.atan2(mdx, mdz);
              let dh = want - inst.heading;
              while (dh > Math.PI) dh -= Math.PI * 2;
              while (dh < -Math.PI) dh += Math.PI * 2;
              inst.heading += dh * (1 - Math.exp(-9 * dt));
              while (inst.heading > Math.PI) inst.heading -= Math.PI * 2;
              while (inst.heading < -Math.PI) inst.heading += Math.PI * 2;
              inst.group.rotation.y = inst.heading;
            }
            if (
              !soundInst ||
              Math.hypot(inst.group.position.x / CELL - player.x, inst.group.position.z / CELL - player.y) <
                Math.hypot(soundInst.group.position.x / CELL - player.x, soundInst.group.position.z / CELL - player.y)
            ) {
              soundInst = inst;
            }
            // The clip follows the server's mode — never the client's guess.
            // A jumpscare, once started, owns the body until the kill ends it.
            if (inst.clip !== "kill") {
              playEntClip(inst, inst.mode === "chase" ? "chase" : "wander");
              // STILL IS STILL (law 2 audit: every still state played the walk
              // and walked in place). Josh's rule is one clip — the walk — so a
              // body that has stopped (listening, resting, orbiting in place)
              // slows that clip to a slow writhe and the flesh shimmer below
              // carries the life; it picks the stride back up as it moves.
              inst.speed += (Math.hypot(mdx, mdz) / Math.max(dt, 1e-3) - inst.speed) * (1 - Math.exp(-6 * dt));
              const spec = entPoses[inst.clip];
              const act = spec && inst.actions[spec.clip];
              if (act) {
                const k = Math.min(1, Math.max(0, (inst.speed - 0.05) / 0.45));
                act.timeScale = spec.rate * (0.1 + 0.9 * k * k * (3 - 2 * k));
              }
            }
          }
          // Reset EVERY bone to baseline, THEN let the mixer overwrite the
          // ones it drives — the only accumulation-proof order.
          for (const u of inst.rest) u.bone.quaternion.copy(u.q);
          inst.mixer.update(dt);
          // FLESH SHIMMER — a low-amplitude travelling wave down every bone
          // chain, layered AFTER the mixer so it rides the walk clip instead
          // of fighting it. Subtle: the clip carries the gait.
          if (inst.group.visible && inst.bones.length) {
            const hunting = inst.mode === "chase";
            const rate = hunting ? 4.2 : 2.2;
            const amp = hunting ? 0.034 : 0.024;
            const ph = (now / 1000) * rate;
            for (const { bone, depth } of inst.bones) {
              entWaveQ.setFromAxisAngle(ENT_WAVE_AXIS, (Math.sin(ph - depth * 0.55) * amp) / (1 + depth * 0.12));
              bone.quaternion.multiply(entWaveQ);
            }
          }
          // THE GRAB — within range the upper limbs tilt toward the player in
          // WORLD space (qp⁻¹·R·qp per bone), damped aim per instance.
          if (inst.group.visible && inst.bones.length) {
            const gdx = player.x * CELL - inst.group.position.x;
            const gdz = player.y * CELL - inst.group.position.z;
            const gDist = Math.hypot(gdx, gdz);
            let grab = 1 - Math.min(1, Math.max(0, (gDist - ENT_GRAB_NEAR) / (ENT_GRAB_FAR - ENT_GRAB_NEAR)));
            grab *= Math.min(1, Math.max(0, (gDist - 0.5) / 0.4));
            if (grab > 0.02) {
              const inv = 1 / (gDist || 1);
              inst.grabDir.x += (gdx * inv - inst.grabDir.x) * (1 - Math.exp(-8 * dt));
              inst.grabDir.z += (gdz * inv - inst.grabDir.z) * (1 - Math.exp(-8 * dt));
              const dl = Math.hypot(inst.grabDir.x, inst.grabDir.z) || 1;
              ENT_GRAB_AXIS.set(inst.grabDir.z / dl, 0, -inst.grabDir.x / dl); // up×dir
              inst.model.updateMatrixWorld(true);
              for (const { bone, depth } of inst.bones) {
                if (depth < ENT_GRAB_DEPTH_LO || depth > ENT_GRAB_DEPTH_HI || !bone.parent) continue;
                const yRel = bone.getWorldPosition(ENT_TMP_V).y - inst.group.position.y;
                const hw = Math.min(1, Math.max(0, (yRel - 0.7) / 0.9)); // waist-up only
                if (hw < 0.02) continue;
                bone.parent.matrixWorld.decompose(ENT_GRAB_P, ENT_GRAB_PQ, ENT_GRAB_S);
                ENT_GRAB_Q.setFromAxisAngle(ENT_GRAB_AXIS, grab * hw * ENT_GRAB_MAX);
                ENT_GRAB_Q.multiply(ENT_GRAB_PQ); //          R·qp
                ENT_GRAB_PQ.invert().multiply(ENT_GRAB_Q); // qp⁻¹·R·qp
                bone.quaternion.premultiply(ENT_GRAB_PQ);
              }
            }
          }
          // THE FLOOR PIN — after the mixer, the shimmer and the grab have
          // posed the skeleton, pin the lowest bone just above the carpet,
          // BOTH directions (nothing it does is allowed off the floor).
          if (inst.group.visible && inst.bones.length) {
            inst.model.position.y = entBaseY;
            inst.model.updateMatrixWorld(true);
            let minY = Infinity;
            for (const { bone } of inst.bones) {
              const y = bone.getWorldPosition(ENT_TMP_V).y;
              if (y < minY) minY = y;
            }
            inst.model.position.y = entBaseY + (inst.group.position.y + ENT_FLESH_LIFT - minY);
          }
        }
        if (soundInst) {
          const distCells = Math.hypot(
            soundInst.group.position.x / CELL - player.x,
            soundInst.group.position.z / CELL - player.y,
          );
          const entWalls = wallsBetween(
            world,
            player.x,
            player.y,
            soundInst.group.position.x / CELL,
            soundInst.group.position.z / CELL,
          );
          updateEntitySound(distCells, soundInst.mode === "chase", entWalls);
        } else {
          updateEntitySound(null, false, 0);
        }
      }

      // THE STALKER: same snapshot glide, black shape at the edge of sight.
      if (stalkerInst) {
        const st = stalkerInst;
        const near = now - st.seenAt < 1600;
        st.group.visible = near;
        if (near) {
          const rt = now - ENT_LAG;
          let tx = st.group.position.x;
          let tz = st.group.position.z;
          if (st.snaps.length) {
            const newest = st.snaps[st.snaps.length - 1];
            if (rt >= newest.at) {
              tx = newest.x;
              tz = newest.z;
            } else if (rt <= st.snaps[0].at) {
              tx = st.snaps[0].x;
              tz = st.snaps[0].z;
            } else {
              for (let i = st.snaps.length - 2; i >= 0; i--) {
                if (st.snaps[i].at <= rt) {
                  const a = st.snaps[i];
                  const b = st.snaps[i + 1];
                  const fr = (rt - a.at) / Math.max(1, b.at - a.at);
                  tx = a.x + (b.x - a.x) * fr;
                  tz = a.z + (b.z - a.z) * fr;
                  break;
                }
              }
            }
          }
          const prevX = st.group.position.x;
          const prevZ = st.group.position.z;
          const sm = 1 - Math.exp(-14 * dt);
          st.group.position.x += (tx - prevX) * sm;
          st.group.position.z += (tz - prevZ) * sm;
          const gy = world.groundAt(st.group.position.x / CELL, st.group.position.z / CELL);
          st.group.position.y += (gy - st.group.position.y) * Math.min(1, 1 - Math.exp(-16 * dt));
          const mdx = st.group.position.x - prevX;
          const mdz = st.group.position.z - prevZ;
          const moving = Math.hypot(mdx, mdz) / Math.max(0.001, dt) > 0.2;
          const inst = Math.hypot(mdx, mdz) / CELL / Math.max(0.001, dt);
          st.speed += (inst - st.speed) * (1 - Math.exp(-6 * dt));
          if (Math.hypot(mdx, mdz) > 0.0012) {
            const want = Math.atan2(mdx, mdz);
            let dh = want - st.heading;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            st.heading += dh * (1 - Math.exp(-9 * dt));
            st.group.rotation.y = st.heading;
          }
          // Clip by judgement over the available set (Idle/Walk/Attack/
          // Attack Near): walk carries every gait, tempo says which; the
          // near-kill lunge plays inside 3m of a hunt.
          const sd = Math.hypot(st.group.position.x / CELL - player.x, st.group.position.z / CELL - player.y);
          const stride = stalkerTempo(st.speed);
          st.lean.rotation.x += (stalkerLean(st.speed) - st.lean.rotation.x) * (1 - Math.exp(-6 * dt));
          const burning = st.burn && now - st.seenAt < 400;
          // …and on SOMEBODY ELSE: a bystander watching it reach their friend
          // sees it strike (its "Attack" clip, unused until the law 2 audit),
          // not walk into them — one appearance, every observer.
          let peerD = Infinity;
          if (st.mode === "hunt") {
            const sx = st.group.position.x / CELL;
            const sy = st.group.position.z / CELL;
            for (const pr of peers.values()) {
              if (!pr.group.visible) continue;
              peerD = Math.min(peerD, Math.hypot(pr.group.position.x / CELL - sx, pr.group.position.z / CELL - sy));
            }
          }
          if (st.mode === "hunt" && sd < 1.6 && !burning) playStalkerClip("Attack Near", 1.2);
          else if (st.mode === "hunt" && peerD < 1.6 && !burning) playStalkerClip(st.actions.Attack ? "Attack" : "Attack Near", 1.2);
          else if (burning && st.speed < 0.6) playStalkerClip("Idle", 2.6); // it writhes in the beam
          else if (moving || st.mode !== "shadow") playStalkerClip("Walk", stride);
          else playStalkerClip("Idle", 1);
          // THE BURN, seen: an ember smoulder under the black while a beam
          // holds it (emissive only — it lights nothing, the fixture law).
          const ember = burning ? 0.35 + 0.25 * Math.sin(now / 45) * Math.sin(now / 131) : 0;
          st.mat.emissiveIntensity += (ember - st.mat.emissiveIntensity) * (1 - Math.exp(-12 * dt));
          const stWalls = wallsBetween(world, player.x, player.y, st.group.position.x / CELL, st.group.position.z / CELL);
          updateStalkerSound(sd, st.mode === "hunt", stWalls, burning);
        } else {
          updateStalkerSound(null, false, 0);
        }
        st.mixer.update(dt);
      }

      /** Where somebody is, in cells — me, or a peer I can see. */
      const bodyAt = (uid: number): { x: number; y: number } | null => {
        if (uid && uid === session.user?.id) return { x: player.x, y: player.y };
        const p = uid ? peers.get(uid) : undefined;
        return p ? { x: p.group.position.x / CELL, y: p.group.position.z / CELL } : null;
      };
      // THE TEMP: drawn where the server says, in the pose it says. Its scrape
      // is heard only while it moves and only by someone NOT looking at it.
      if (tempInst) {
        const tp = tempInst;
        const near = level === 4 && now - tp.seenAt < 1600;
        // It moves only in the dark. Watched from another zone, its own zone's
        // dip used to leave it fully lit while it slid a cell and a half — the
        // one thing it must never be seen doing (Nov 2026 validation run). In
        // its zone's dip, moving, it is not drawn; it is simply somewhere else
        // when the lights come back.
        const tz = world.sectionAt(Math.floor(tp.group.position.x / CELL), Math.floor(tp.group.position.z / CELL));
        const inDark = (zoneDipUntil.get(tz) ?? 0) > now;
        tp.group.visible = near && !(inDark && tp.moving);
        if (near) {
          const tx = tp.group.position.x / CELL;
          const ty = tp.group.position.z / CELL;
          const td = Math.hypot(tx - player.x, ty - player.y);
          const walls = wallsBetween(world, player.x, player.y, tx, ty);
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          const lx = tp.group.position.x - camera.position.x;
          const lz = tp.group.position.z - camera.position.z;
          const ll = Math.hypot(lx, lz) || 1;
          const flat = Math.hypot(dir.x, dir.z) || 1;
          const looking = walls === 0 && (lx / ll) * (dir.x / flat) + (lz / ll) * (dir.z / flat) >= Math.SQRT1_2;
          updateTempSound(td, tp.moving && !looking, walls);
        } else updateTempSound(null, false, 0);
      }
      // THE BLEEDER: the snapshot glide, the server's heading, and the clip
      // set as its state machine.
      if (bleederInst) {
        const b = bleederInst;
        const near = now - b.seenAt < 1600;
        b.group.visible = near;
        if (near) {
          const rt = now - ENT_LAG;
          let tx = b.group.position.x;
          let tz = b.group.position.z;
          if (b.snaps.length) {
            const newest = b.snaps[b.snaps.length - 1];
            if (rt >= newest.at) {
              tx = newest.x;
              tz = newest.z;
            } else if (rt <= b.snaps[0].at) {
              tx = b.snaps[0].x;
              tz = b.snaps[0].z;
            } else {
              for (let i = b.snaps.length - 2; i >= 0; i--) {
                if (b.snaps[i].at <= rt) {
                  const a = b.snaps[i];
                  const c = b.snaps[i + 1];
                  const fr = (rt - a.at) / Math.max(1, c.at - a.at);
                  tx = a.x + (c.x - a.x) * fr;
                  tz = a.z + (c.z - a.z) * fr;
                  break;
                }
              }
            }
          }
          const prevX = b.group.position.x;
          const prevZ = b.group.position.z;
          const smooth = 1 - Math.exp(-16 * dt);
          b.group.position.x += (tx - prevX) * smooth;
          b.group.position.z += (tz - prevZ) * smooth;
          const cx = b.group.position.x / CELL;
          const cy = b.group.position.z / CELL;
          const gy = world.groundAt(cx, cy);
          b.group.position.y += (gy - b.group.position.y) * Math.min(1, 1 - Math.exp(-16 * dt));
          const speed = Math.hypot(b.group.position.x - prevX, b.group.position.z - prevZ) / CELL / Math.max(0.001, dt);
          // Screaming and charging it faces ITS TARGET — the same body on
          // every screen (it used to face whoever was watching, so a
          // bystander saw it charge sideways at someone else); otherwise its
          // own heading.
          const tgt = b.mode === "scream" || b.mode === "chase" ? bodyAt(b.targetId) : null;
          const want = tgt ? Math.atan2(tgt.x - cx, tgt.y - cy) : b.wantH;
          const tgtD = tgt ? Math.hypot(tgt.x - cx, tgt.y - cy) : Infinity;
          let dh = want - b.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          b.heading += dh * (1 - Math.exp(-12 * dt));
          b.group.rotation.y = b.heading;
          const bd = Math.hypot(cx - player.x, cy - player.y);
          // Its Run clip is 0.32s a stride at rate 1 — frantic, which is the
          // point; past ~4 cells/s it quickens with the body.
          // Hurt1 and RetreatScream are STAND-IN-PLACE clips (no foot travel),
          // and the server keeps it moving under the beam and bolts it from
          // the first tick of a retreat — played on a moving body they made
          // it skate ~5m across the floor at the moment the beam won (Nov
          // 2026 polish round). A moving body walks/runs; the flinch and the
          // shriek play only while it is standing.
          if (b.burn && b.mode !== "retreat") playBleederClip(speed > 0.3 ? "Walk" : "Hurt1", speed > 0.3 ? Math.max(0.5, speed / 2.6) : 0.8);
          else if (b.mode === "scream") playBleederClip("Scream", 1, true);
          else if (b.mode === "chase") playBleederClip(tgtD < 1.3 ? "Attack1" : "Run", Math.max(1, speed / 4));
          else if (b.mode === "retreat") {
            if (speed > 0.8) playBleederClip("Run", Math.max(1.2, speed / 4));
            else if (b.clip !== "RetreatScream" && b.clip !== "Run") playBleederClip("RetreatScream", 1, true);
          } else if (b.mode === "feed") playBleederClip("Idle2", 1);
          else playBleederClip(speed > 0.3 ? "Walk" : "Search1", speed > 0.3 ? Math.max(0.6, speed / 2.6) : 1);
          // Hunting with nobody to hunt is WAITING (the design's idle): standing
          // in the dark it searches, and it breathes the idle loop, not the hunt.
          const heard = b.mode === "hunt" && b.clip === "Search1" ? "wait" : b.mode;
          updateBleederSound(bd, heard, wallsBetween(world, player.x, player.y, cx, cy));
        } else {
          updateBleederSound(null, b.mode, 0);
        }
        b.mixer.update(dt);
      }

      // THE GRABBER: the snapshot glide; the stalker's clips as its states.
      if (grabberInst) {
        const gb = grabberInst;
        const near = now - gb.seenAt < 1600;
        gb.group.visible = near;
        if (near) {
          const rt = now - ENT_LAG;
          let tx = gb.group.position.x;
          let tz = gb.group.position.z;
          if (gb.snaps.length) {
            const newest = gb.snaps[gb.snaps.length - 1];
            if (rt >= newest.at) {
              tx = newest.x;
              tz = newest.z;
            } else if (rt <= gb.snaps[0].at) {
              tx = gb.snaps[0].x;
              tz = gb.snaps[0].z;
            } else {
              for (let i = gb.snaps.length - 2; i >= 0; i--) {
                if (gb.snaps[i].at <= rt) {
                  const a = gb.snaps[i];
                  const c = gb.snaps[i + 1];
                  const fr = (rt - a.at) / Math.max(1, c.at - a.at);
                  tx = a.x + (c.x - a.x) * fr;
                  tz = a.z + (c.z - a.z) * fr;
                  break;
                }
              }
            }
          }
          const prevX = gb.group.position.x;
          const prevZ = gb.group.position.z;
          const smooth = 1 - Math.exp(-16 * dt);
          gb.group.position.x += (tx - prevX) * smooth;
          gb.group.position.z += (tz - prevZ) * smooth;
          const cx = gb.group.position.x / CELL;
          const cy = gb.group.position.z / CELL;
          gb.group.position.y += (world.groundAt(cx, cy) - gb.group.position.y) * Math.min(1, 1 - Math.exp(-16 * dt));
          const speed = Math.hypot(gb.group.position.x - prevX, gb.group.position.z - prevZ) / CELL / Math.max(0.001, dt);
          // in the grab it faces its victim, on every screen
          const tgt = gb.mode === "grab" ? bodyAt(gb.targetId) : null;
          const want = tgt ? Math.atan2(tgt.x - cx, tgt.y - cy) : gb.wantH;
          let dh = want - gb.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          gb.heading += dh * (1 - Math.exp(-12 * dt));
          gb.group.rotation.y = gb.heading;
          gb.speed += (speed - gb.speed) * (1 - Math.exp(-6 * dt));
          if (gb.mode === "grab") playGrabberClip(gb.actions["Attack Near"] ? "Attack Near" : "Attack", 1);
          else playGrabberClip(speed > 0.3 ? "Walk" : "Idle", speed > 0.3 ? stalkerTempo(gb.speed) : 1);
          const gLean = gb.mode === "grab" ? 0 : stalkerLean(gb.speed);
          gb.lean.rotation.x += (gLean - gb.lean.rotation.x) * (1 - Math.exp(-6 * dt));
          const gd = Math.hypot(cx - player.x, cy - player.y);
          // heard only up close — and never while it runs (the flight is the cry)
          updateGrabberSound(gb.mode !== "flee" && gd < GRABBER_HEAR_CELLS ? gd : null, speed > 0.3, wallsBetween(world, player.x, player.y, cx, cy), GRABBER_HEAR_CELLS);
        } else {
          updateGrabberSound(null, false, 0, GRABBER_HEAR_CELLS);
        }
        gb.mixer.update(dt);
      }

      // THE SHY GUY: the same snapshot glide, and the clip set carries the
      // whole state machine. This is also where EYE CONTACT is measured —
      // the crosshair against the real model, which is the one thing only
      // the client can know (Josh: "direct aim cursor on his model").
      if (shyInst) {
        const sh = shyInst;
        const near = now - sh.seenAt < 1600;
        sh.group.visible = near;
        if (near) {
          const rt = now - ENT_LAG;
          let tx = sh.group.position.x;
          let tz = sh.group.position.z;
          if (sh.snaps.length) {
            const newest = sh.snaps[sh.snaps.length - 1];
            if (rt >= newest.at) {
              tx = newest.x;
              tz = newest.z;
            } else if (rt <= sh.snaps[0].at) {
              tx = sh.snaps[0].x;
              tz = sh.snaps[0].z;
            } else {
              for (let i = sh.snaps.length - 2; i >= 0; i--) {
                if (sh.snaps[i].at <= rt) {
                  const a = sh.snaps[i];
                  const b = sh.snaps[i + 1];
                  const fr = (rt - a.at) / Math.max(1, b.at - a.at);
                  tx = a.x + (b.x - a.x) * fr;
                  tz = a.z + (b.z - a.z) * fr;
                  break;
                }
              }
            }
          }
          const prevX = sh.group.position.x;
          const prevZ = sh.group.position.z;
          const smooth = 1 - Math.exp(-14 * dt);
          sh.group.position.x += (tx - prevX) * smooth;
          sh.group.position.z += (tz - prevZ) * smooth;
          const cx = sh.group.position.x / CELL;
          const cy = sh.group.position.z / CELL;
          // IT RIDES THE WATERLINE. Its feet follow the floor while it can
          // touch bottom, but the pools go 2m+ down and a creature tracking
          // the floor through those would walk along the bottom of the deep
          // end, submerged and half-clipped through the surface — which is
          // exactly the "glitching out in deep water" to avoid. Past
          // chest-depth it wades at the surface instead, the same trick the
          // peer avatars use for swimmers.
          const wl = world.waterAt(Math.floor(cx), Math.floor(cy));
          const floorY = world.groundAt(cx, cy);
          const gy = wl !== null ? Math.max(floorY, wl - SHY_WADE_Y) : floorY;
          sh.group.position.y += (gy - sh.group.position.y) * Math.min(1, 1 - Math.exp(-16 * dt));
          const mdx = sh.group.position.x - prevX;
          const mdz = sh.group.position.z - prevZ;
          const moving = Math.hypot(mdx, mdz) / Math.max(0.001, dt) > 0.2;
          // Water drags its gait too, or it sprints on the spot: it makes 0.8
          // cells/s in the deep against 5.7 on dry tile.
          const wetD = world.waterDepthAt(Math.floor(cx), Math.floor(cy));
          const gait = wetD >= 1.5 ? 0.45 : wetD > 0.6 ? 0.62 : wetD > 0.15 ? 0.82 : 1;
          // THE RUN CLIP WAS TIMED AGAINST A 3.5 cells/s CHASE, and the chase
          // is 5.7 now (twice a sprint, Josh, Aug 2026) — at timeScale 1 the
          // feet would step for 3.5 while the body covers 5.7, which is the
          // classic ice-skate. Only on dry tile: in water the caps hold it at
          // 1.45/1.0/0.8 whatever its land speed is, so the bands above
          // already tell the truth there.
          const runGait = wetD > 0.15 ? gait : gait * (5.7 / 3.5);
          // While it is coming for you it faces YOU, not just its heading —
          // a charge that looks slightly off-axis reads as a bug.
          const shTgt = sh.mode === "chase" || sh.mode === "trigger" ? bodyAt(sh.targetId) : null;
          if (shTgt) {
            // faces ITS target, not whoever is watching (Oct 2026 audit)
            const want = Math.atan2(shTgt.x - cx, shTgt.y - cy);
            let dh = want - sh.heading;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            sh.heading += dh * (1 - Math.exp(-11 * dt));
            sh.group.rotation.y = sh.heading;
          } else if (Math.hypot(mdx, mdz) > 0.0012) {
            const want = Math.atan2(mdx, mdz);
            let dh = want - sh.heading;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            sh.heading += dh * (1 - Math.exp(-9 * dt));
            sh.group.rotation.y = sh.heading;
          }
          const sd = Math.hypot(cx - player.x, cy - player.y);
          // panicstart (2.46s) is the hands-over-the-face wind-up and the
          // trigger window is 2.2s, so it plays ONCE and lands almost exactly
          // as the run begins; panic is the loop if the window ever outlasts it.
          if (sh.mode === "trigger") {
            if (sh.clip !== "scp096panicstart" && sh.clip !== "scp096panic") playShyClip("scp096panicstart", 1, true);
            else if (sh.clip === "scp096panicstart" && (sh.actions.scp096panicstart?.time ?? 0) >= 2.4) playShyClip("scp096panic", 1);
          }
          else if (sh.mode === "chase") playShyClip((shTgt ? Math.hypot(shTgt.x - cx, shTgt.y - cy) : sd) < 1.4 ? "scp096attack1" : "scp096attackrun", runGait);
          else if (sh.mode === "flee") playShyClip("scp096running", 1.1 * runGait);
          else playShyClip(moving ? "scp096walk" : "scp096idle1", moving ? gait : 1);
          const shWalls = wallsBetween(world, player.x, player.y, cx, cy);
          if (shyScreaming) updateShySound(sd, shWalls);

          // EYE CONTACT. Josh, Aug 2026: "lets make it the cursor is a little
          // to the left or right his player model then it triggers his chase.
          // make it a little more easier to get chased." So this is no longer
          // a triangle-exact hit on the model — it's an angular window around
          // it, SHY_AIM_GRACE times its own silhouette, which at any range
          // means "the crosshair is on him or just beside him". That also
          // removes a per-frame skinned-mesh raycast from the hot path.
          //
          // Only ever while it is still docile: once it has seen you, looking
          // away changes nothing, which is the point of the creature.
          // A report the server turned down (its line check can disagree for a
          // tick) is RETRIED every 1.5s while it stays docile — it used to be
          // sent once and then never again until it changed mode (law 2 audit).
          if (sh.mode === "lurk" && (!shyLooked || now - shyLookAt > 1500) && now - shyLookAt > 120 && sd < 34 && shWalls === 0) {
            shyLookAt = now;
            const toX = cx - player.x;
            const toY = cy - player.y;
            // yaw 0 faces −y, so the facing vector is (−sin, −cos) — the same
            // convention the flashlight beam uses above.
            const facing = -Math.sin(player.yaw) * (toX / sd) + -Math.cos(player.yaw) * (toY / sd);
            // Its angular half-width at this range, widened by the grace, and
            // floored so a distant figure is still catchable by eye.
            const halfW = Math.max(0.055, Math.atan2(sh.reach * SHY_AIM_GRACE, sd * CELL));
            if (facing > Math.cos(halfW)) {
              // IT HAS TO BE VISIBLE, not merely in front of you: a pillar
              // between you is not eye contact, and the server's own line
              // check only knows about walls.
              probeRay.setFromCamera(PROBE_CENTER, camera);
              probeRay.far = sd * CELL + 4;
              SPRAY_TARGETS.length = 0;
              for (const [, grp] of world.meshes) SPRAY_TARGETS.push(grp);
              const wall = probeRay.intersectObjects(SPRAY_TARGETS, true)[0];
              if (!wall || wall.distance > sd * CELL - 1) {
                shyLooked = true;
                net?.shyLook();
              }
            }
          }
        } else if (shyScreaming) {
          // Out of stream range mid-scream — let it fall away rather than cut.
          updateShySound(34, 4);
        }
        if (sh.mode !== "lurk") shyLooked = false;
        sh.mixer.update(dt);
      }

      // THE ALLIGATORS glide their pools: same snap interpolation as the shy
      // guy, but the heading comes from the SERVER (the mouth is the weapon
      // and the server aims it), and the body rides the waterline — an
      // inflatable floats, it doesn't track the pool floor.
      for (const [gid, ga] of gatorInsts) {
        const near = now - ga.seenAt < 1600;
        ga.group.visible = near;
        if (!near) continue;
        const rt = now - ENT_LAG;
        let tx = ga.group.position.x;
        let tz = ga.group.position.z;
        if (ga.snaps.length) {
          const newest = ga.snaps[ga.snaps.length - 1];
          if (rt >= newest.at) {
            tx = newest.x;
            tz = newest.z;
          } else if (rt <= ga.snaps[0].at) {
            tx = ga.snaps[0].x;
            tz = ga.snaps[0].z;
          } else {
            for (let i = ga.snaps.length - 2; i >= 0; i--) {
              if (ga.snaps[i].at <= rt) {
                const a = ga.snaps[i];
                const b = ga.snaps[i + 1];
                const fr = (rt - a.at) / Math.max(1, b.at - a.at);
                tx = a.x + (b.x - a.x) * fr;
                tz = a.z + (b.z - a.z) * fr;
                break;
              }
            }
          }
        }
        const smooth = 1 - Math.exp(-14 * dt);
        ga.group.position.x += (tx - ga.group.position.x) * smooth;
        ga.group.position.z += (tz - ga.group.position.z) * smooth;
        const gcx = Math.floor(ga.group.position.x / CELL);
        const gcy = Math.floor(ga.group.position.z / CELL);
        // Mid-body at the waterline, a touch sunken, floored in the shallows;
        // plus a lazy bob and roll — a static model that still reads as alive.
        const wl = world.waterAt(gcx, gcy);
        const floorY = world.groundAt(ga.group.position.x / CELL, ga.group.position.z / CELL);
        const rest = wl !== null ? Math.max(floorY + gatorHalfH * 0.5, wl - 0.05) : floorY + gatorHalfH;
        const bob = Math.sin(now * 0.0011 + gid * 2.1) * 0.02;
        ga.group.position.y += (rest + bob - ga.group.position.y) * Math.min(1, 1 - Math.exp(-10 * dt));
        let gdh = ga.wantH - ga.heading;
        while (gdh > Math.PI) gdh -= Math.PI * 2;
        while (gdh < -Math.PI) gdh += Math.PI * 2;
        ga.heading += gdh * (1 - Math.exp(-9 * dt));
        ga.group.rotation.y = ga.heading;
        ga.group.rotation.z = Math.sin(now * 0.0009 + gid * 1.3) * 0.025;
      }

      // THE RAGDOLLS: seeded flails in flight. A finished one swaps for the
      // static corpse that's been waiting (hidden) underneath it.
      for (let i = ragdolls.length - 1; i >= 0; i--) {
        const r = ragdolls[i];
        if (r.rag) {
          if (!r.rag.tick(dt)) finishRagdoll(r);
        } else if (now - r.startedAt > 4_000) {
          finishRagdoll(r); // the model never resolved — fail to the corpse
        }
      }
      tickBlood(dt);

      // Peers glide toward their latest reported spot, hazmat suits swapping
      // between walk and idle by whether they're covering ground. Their floor
      // height is re-sampled every frame: a pos frame can arrive before the
      // ground under it has streamed in, and groundAt() of an unloaded chunk
      // is 0 — the resample settles them onto the real floor when it lands.
      const t = 1 - Math.exp(-10 * dt);
      for (const p of peers.values()) {
        // Swimmers hang at the waterline; boat riders sit their bench (the
        // sit clip's pelvis lands on the bench top with the origin this far
        // under the surface); everyone else on their floor.
        const wlp =
          p.swimming || p.aboard ? world.waterAt(Math.floor(p.target.x / CELL), Math.floor(p.target.z / CELL)) : null;
        p.target.y =
          wlp !== null ? (p.aboard ? wlp - BOAT_SIT_DROP : wlp - 1.32) : world.groundAt(p.target.x / CELL, p.target.z / CELL);
        // THE STROKE ENGAGES AT WAIST DEPTH (Josh, Aug 2026) — measured from
        // the water standing on the peer's own cell, not from the swim pose,
        // so wading past the waist already reads as swimming. Boat riders sit
        // dry by definition.
        p.swim =
          !p.aboard &&
          (p.swimming ||
            world.waterDepthAt(Math.floor(p.target.x / CELL), Math.floor(p.target.z / CELL)) > 0.6);
        p.group.position.lerp(p.target, t);
        p.group.rotation.y = p.heading;
        // A BODY STANDING IN YOUR CAMERA IS NOT DRAWN (law 5, Oct 2026).
        // Runners pass through each other (there is no player-to-player
        // collision), and two who come in by the same door used to arrive on
        // the very same spot: a suit whose vertices straddle the near plane
        // projects as screen-wide shards of colour, which read as the game
        // breaking. Inside half a metre of the eye, the body simply isn't
        // there until one of you steps away.
        const ex = p.group.position.x - camera.position.x;
        const ez = p.group.position.z - camera.position.z;
        const ey = camera.position.y - p.group.position.y;
        p.group.visible = !(ex * ex + ez * ez < 0.5 * 0.5 && ey > -0.3 && ey < 2.2);
        // …and their NAME holds its size on screen once they're within 4m: a
        // fixed-size world sprite at arm's length was as wide as the screen.
        const tagD = Math.hypot(ex, ez, p.group.position.y + 2.15 - camera.position.y);
        const tagK = Math.min(1, tagD / 4);
        p.tag.scale.set(1.5 * tagK, 0.33 * tagK, 1);
        tickAvatar(p, dt);
      }

      // Acoustics: occlusion rays at 5Hz (cheap grid walk), positions every
      // frame so the HRTF panner tracks movement smoothly. And the OTHER
      // side of the open mic: while you're actually speaking, the entity
      // hears you (a periodic noise beacon — crouching won't save a talker).
      // Occlusion, refreshed at 5Hz: how many walls sit between me and each
      // peer. Audio uses it to muffle voices, and NAME TAGS use it to hide —
      // the tag sprite draws with depthTest off (so an avatar's own head can't
      // eat it), which also made every name legible THROUGH walls, quietly
      // reporting where everyone was. Runs whether or not voice connected.
      if (now - lastVoiceAt > 200) {
        lastVoiceAt = now;
        wallCache.clear();
        for (const [id, p] of peers) {
          wallCache.set(id, wallsBetween(world, player.x, player.y, p.target.x / CELL, p.target.z / CELL));
        }
      }
      for (const [id, p] of peers) p.tag.visible = (wallCache.get(id) ?? 0) === 0;
      // A PEER THAT HAS GONE QUIET IS GONE (Backrooms law 9/10): the server
      // re-announces every still body near you once a second, so a peer
      // silent for longer than this has left your range (or the level) —
      // it used to stand frozen where you last saw it forever, and its voice
      // stayed pinned to that spot. No position = no sound, so dropping it
      // also silences a voice that has walked out of earshot.
      if (now - lastPeerSweep > 1000) {
        lastPeerSweep = now;
        for (const [id, p] of peers) {
          if (p.lastPosAt > 0 && now - p.lastPosAt > PEER_STALE_MS) {
            disposeAvatar(scene, p);
            peers.delete(id);
            peerSprayHiss(id, 0);
            peerStride.delete(id);
          }
        }
      }
      // OTHER PEOPLE, HEARD (law 5): a can held down hisses the whole time,
      // and feet make steps on their own stride — the same samples as yours,
      // at their distance, through their walls.
      for (const [id, p] of peers) {
        const px = p.group.position.x / CELL;
        const py = p.group.position.z / CELL;
        const lvl = peerLevel(px, py, wallCache.get(id) ?? 0);
        peerSprayHiss(id, p.equip === "spraycan!" ? lvl * 0.8 : 0);
        const walking = p.wireSpeed > 0.6 && !p.swimming && !p.aboard && p.pose !== 2;
        if (!walking || lvl <= 0.02) {
          peerStride.set(id, 0);
          continue;
        }
        const running = p.wireSpeed > 4.5 * p.wade;
        const crouched = p.pose === 1;
        const prev = peerStride.get(id) ?? 0;
        const next = prev + dt * (running ? 12 : crouched ? 6.5 : 9);
        peerStride.set(id, next);
        if (Math.floor(next / Math.PI) !== Math.floor(prev / Math.PI) && next > 0) {
          const wl = world.waterAt(Math.floor(px), Math.floor(py));
          const wet = wl !== null && wl - world.groundAt(px, py) > 0.05;
          footstep(running, crouched, wet || lightsWetAt(px, py) ? "water" : floorSurface(level), lvl);
        }
      }
      // A body's tag is a findable marker, not a live player — but it should
      // still respect a wall.
      for (const c of bodyMap.values()) {
        c.avatar.tag.visible = wallsBetween(world, player.x, player.y, c.x, c.y) === 0;
      }

      if (voice) {
        if (entered && now - lastNoiseAt > 1500 && voice.speaking()) {
          lastNoiseAt = now;
          net!.noise();
        }
        const sp = new Map<number, SpatialPeer>();
        const ghostMode = new Map<number, "ghost" | "near">();
        if (specOn && spec) {
          // THE DEAD: the one you watch, where they stand; the others
          // watching them, plainly; nobody else at all. You listen from the
          // camera, facing them.
          const t = peers.get(spec.target);
          if (t) sp.set(spec.target, { x: t.target.x / CELL, y: t.target.z / CELL, walls: 0 });
          for (const w of spec.watchers) ghostMode.set(w, "near");
          voice.updateSpatial(
            { x: camera.position.x / CELL, y: camera.position.z / CELL, yaw: specYaw },
            sp,
            undefined,
            roomOpenness(),
            ghostMode,
          );
          // the dead's own room: the others watching the same player, plainly;
          // the rest of the dead on this level go unheard (no position)
          ghostVoice?.updateSpatial(
            { x: camera.position.x / CELL, y: camera.position.z / CELL, yaw: specYaw },
            new Map(),
            undefined,
            roomOpenness(),
            ghostMode,
          );
        } else {
          for (const [id, p] of peers) {
            sp.set(id, { x: p.target.x / CELL, y: p.target.z / CELL, walls: wallCache.get(id) ?? 0 });
          }
          // A GHOST speaking to me: from where their camera hangs round me —
          // the side they are looking at me from.
          for (const [gid, g] of ghostsTalking) {
            sp.set(gid, { x: player.x + Math.sin(g.yaw) * 1.6, y: player.y + Math.cos(g.yaw) * 1.6, walls: 0 });
            ghostMode.set(gid, "ghost");
          }
          voice.updateSpatial({ x: player.x, y: player.y, yaw: player.yaw }, sp, radioPeers, roomOpenness(), ghostMode);
        }
      }

      atmo.uniforms.time.value = now / 1000; // drives the grain animation
      renderer?.info.reset();
      composer.render();
    };
    raf = requestAnimationFrame(frame);

    cleanupFns.push(() => {
      cancelAnimationFrame(raf);
      for (const p of peers.values()) disposeAvatar(scene, p);
      peers.clear();
      renderer?.dispose();
      renderer?.forceContextLoss(); // free the GL context now, not at GC time
      renderer?.domElement.remove();
      renderer = null; // a late model load must find nothing to warm (Sep 2026 review)
    });
  });

  onDestroy(() => {
    brDisposed = true;
    clearBlood();
    // Closed by something other than the game's own exits, right after an
    // Escape: that's the Mac kick-out. Report what the game was doing.
    if (!leavingOnPurpose && Date.now() - lastEscAt < 5_000) {
      reportNote(
        "backrooms: game closed right after Escape",
        `${Date.now() - lastEscAt}ms after Escape · fallback=${lockFallback} locked=${locked} realLock=${!!document.pointerLockElement} · ua=${navigator.userAgent}`,
      );
    }
    try {
      voice?.leave();
      ghostVoice?.leave();
      net?.leave();
      net?.close();
    } catch {
      /* gone */
    }
    stopSprayHiss();
    stopAllPeerSprays();
    clearInterval(meterTimer);
    stopBleederSound();
    stopTempSound();
    stopGrabberSound();
    closeAmbience();
    for (const fn of cleanupFns) fn();
  });

  function leaveNow() {
    leavingOnPurpose = true;
    onExit();
  }
  function resume() {
    capturing = null;
    pauseTab = "main";
    stopMeter();
    if (lockFallback) {
      // No real lock to request — just take the controls back.
      locked = true;
      if (renderer) renderer.domElement.style.cursor = "none";
    } else {
      // THIS is where the recovered-drive reader used to lose the mouse. The
      // click that closed it had just released the lock, and Chromium refuses
      // a re-lock for ~1.25s after that; the bare request was refused, the
      // rejection went unhandled (10 of them reached the errors table), and
      // the player was left with a live view and a roaming cursor. Going
      // through the shared policy waits the cooldown out and asks again.
      grabPointerFn?.();
    }
  }

  /** Release the look wherever a screen takes over (death, loot, reading,
   *  debrief). With a real pointer lock the unlock event does the rest; in
   *  fallback mode `locked` is ours to clear. */
  function unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
    if (lockFallback) {
      locked = false;
      if (renderer) renderer.domElement.style.cursor = "";
    }
  }

  // ---- Pause-menu settings (backrooms-only, persisted per machine) ----------
  // Every change writes localStorage immediately and pushes the value into the
  // live audio graph, so a mid-run tweak takes effect without a re-entry.
  function pushAudio(): void {
    saveBrSettings();
    setGameVolume(brSettings.outputVolume);
    voice?.applyAudio({
      micGain: brSettings.micGain,
      micSensitivity: brSettings.micSensitivity,
      neuralNS: brSettings.neuralNS,
      voiceVolume: brSettings.voiceVolume,
      inputDevice: brSettings.inputDevice,
      outputDevice: brSettings.outputDevice,
    });
  }

  async function loadDevices(): Promise<void> {
    try {
      // Labels only exist once mic permission has been granted — inside a run
      // it always has been (the open mic is the game's whole comms model).
      const list = await navigator.mediaDevices.enumerateDevices();
      mics = list.filter((d) => d.kind === "audioinput");
      speakers = list.filter((d) => d.kind === "audiooutput");
    } catch {
      mics = [];
      speakers = [];
    }
  }

  function startMeter(): void {
    voice?.startMeter();
    clearInterval(meterTimer);
    meterTimer = window.setInterval(() => (micMeter = voice?.micLevel() ?? 0), 100);
  }
  function stopMeter(): void {
    clearInterval(meterTimer);
    meterTimer = 0;
    micMeter = 0;
    voice?.stopMeter();
  }

  function openAudioTab(): void {
    pauseTab = "audio";
    void loadDevices();
    startMeter();
  }

  function doForfeit(): void {
    confirmForfeit = false;
    // The server treats it as a death: body on the floor, ledger entry, and
    // the death screen takes it from here.
    net?.forfeit();
  }
</script>

<div class="game" bind:this={host}>
  {#if doorName && entered}
    <div class="door-banner">{doorName}</div>
  {/if}
  {#if entered && !locked && !wasLocked}
    <div class="hint">click to look around · WASD to walk · SHIFT to hurry · SPACE jumps · C crouches</div>
  {/if}
  {#if !entered && !deniedMsg}
    <div class="veil"><span>opening the door…</span></div>
  {/if}
  {#if deniedMsg}
    <div class="veil">
      <span>{deniedMsg}</span>
      <button onclick={leaveNow}>back</button>
    </div>
  {/if}
  {#if lost && !debrief}
    <div class="veil">
      <span>connection lost — the hum swallowed the signal.</span>
      <button onclick={leaveNow}>back to the doors</button>
    </div>
  {/if}

  {#if entered && !debrief}
    <!-- ---- Survival HUD ---------------------------------------------- -->
    <div class="hud-left" class:specgone={specOn}>
      <!-- Comms indicator sits ABOVE the bars (Josh: it was rendering behind
           the health/stamina bars down here). One line, mic + radio state. -->
      {#if micState !== "off"}
        <div class="comms" class:muted={micState === "muted"} class:tx={txing}>
          {#if txing}
            ● RADIO TX · CH{walkieChan}
          {:else if micState === "joining"}
            ◌ mic…
          {:else if micState === "muted"}
            ✕ MIC MUTED · {keyLabel(brSettings.keys.mic)}
          {:else}
            ● MIC LIVE · {keyLabel(brSettings.keys.mic)} mutes
          {/if}
        </div>
      {/if}
      {#if hasKey}
        <!-- You are carrying the community's one shot at Level 1. -->
        <div class="keychip">🔑 {keyChip}</div>
      {/if}
      {#if stationChip}
        <div class="keychip">⚡ {stationChip}</div>
      {/if}
      {#if fusesCarrying > 0}
        <div class="keychip">⚡ {fusesCarrying} FUSE{fusesCarrying === 1 ? "" : "S"} — take {fusesCarrying === 1 ? "it" : "them"} to the fuse box</div>
      {/if}
      <div class="bar stamina"><div class="fill" style="width:{staminaUi}%"></div></div>
      <div class="bar health"><div class="fill" style="width:{hp}%; background:{hpColor}"></div></div>
      {#if breathUi < 1}
        <div class="bar breath"><div class="fill" style="width:{breathUi * 100}%"></div></div>
      {/if}
      {#if inHotel && heat > 0}
        <div class="bar heat" class:hot={heat >= 100}><div class="fill" style="width:{heat}%"></div></div>
      {/if}
    </div>
    {#if inHotel && registerLine}
      <div class="hotelcard">
        <div class="hk">THE GUEST REGISTER</div>
        <div class="ht">{registerLine}</div>
      </div>
    {/if}
    {#if inHotel && liftAt}
      <div class="hotelcard lift">
        <div class="hk">THE LIFT</div>
        <div class="floors">
          {#each Array.from({ length: 20 }, (_, i) => 20 - i) as f (f)}
            <span class="fl" class:on={liftDigits !== "" && Number(liftDigits) === f}>{f}</span>
          {/each}
        </div>
        <div class="ht">type a floor: <b>{liftDigits || "_"}</b> · {keyLabel(brSettings.keys.interact)} to ride · walk away to leave</div>
      </div>
    {/if}
    <div class="hud-slots">
      {#if hudNote}<div class="hud-note">{hudNote}</div>{/if}
      <div class="slots" class:specgone={specOn}>
        {#each slots as item, i (i)}
          <div class="slot" class:sel={i === selSlot}>
            {#if item}
              {#if imgFor(item.kind, item.color)}
                <img
                  class="slotimg"
                  src={imgFor(item.kind, item.color)}
                  alt={item.kind}
                  style={item.kind === "suit" ? suitPicStyle(item.color) : ""}
                />
              {:else}
                <span class="slotglyph">{GLYPH_FALLBACK[item.kind] ?? "▪"}</span>
              {/if}
              {#if item.level > 0}<span class="lvl">L{item.level}</span>{/if}
            {:else}
              <span class="idx">{i + 1}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showMap && !debrief}
    <div class="mapov">
      <div class="maphead">
        <span>FIELD MAP</span>
        <span class="dim">
          live — walk with it open{session.user?.isAdmin ? " · operator markers on" : ""} · M closes
        </span>
      </div>
      <div class="mapscroll"><canvas bind:this={mapCanvas}></canvas></div>
    </div>
  {/if}

  {#if lootPanel}
    <div class="veil lootveil">
      <div class="lootcard">
        <p class="ltitle">{lootPanel.name}'s body</p>
        {#if lootPanel.items.length}
          <div class="lootgrid">
            {#each lootPanel.items as it, i (i)}
              <button class="lootitem" onclick={() => net!.lootTake(lootPanel!.id, i)}>
                {#if imgFor(it.kind, it.color)}
                  <img src={imgFor(it.kind, it.color)} alt={it.kind} style={it.kind === "suit" ? suitPicStyle(it.color) : ""} />
                {:else}
                  <span class="lootglyph">{GLYPH_FALLBACK[it.kind] ?? "▪"}</span>
                {/if}
                <span class="lootname">{ITEM_LABEL[it.kind] ?? it.kind}{it.level ? ` L${it.level}` : ""}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="lempty">picked clean.</p>
        {/if}
        <button
          class="vreturn"
          onclick={() => {
            lootPanel = null;
            resume();
          }}
        >leave the body</button>
      </div>
    </div>
  {/if}

  {#if landingChoice}
    <!-- THE LANDING is both doors: down to Level 0, or out of the program. -->
    <div class="veil lootveil">
      <div class="lootcard">
        <p class="ltitle">The Landing</p>
        <p class="lempty">
          The passage down to Level 0 is here — and so is the way out. What are you doing?
        </p>
        <div class="lchoices">
          <button
            class="vreturn"
            onclick={() => {
              landingChoice = false;
              net!.travel();
              resume();
            }}
          >step through to Level 0</button>
          <button
            class="vreturn out"
            onclick={() => {
              landingChoice = false;
              extractNow();
            }}
          >extract — end the run</button>
          <button
            class="vreturn ghost"
            onclick={() => {
              landingChoice = false;
              resume();
            }}
          >stay in the water</button>
        </div>
      </div>
    </div>
  {/if}

  {#if reading}
    <!-- A recovered drive, read where you found it. It's already unlocked for
         everyone on Solace by the time this renders. -->
    <div class="veil readveil">
      <div class="readcard">
        <p class="rkicker">RECOVERED HARD DRIVE · {reading.fresh ? "NEW TO THE ARCHIVE" : "ALREADY ARCHIVED"}</p>
        <p class="rtitle">{reading.driveId} — {reading.title}</p>
        <p class="rfile">{reading.file}</p>
        <div class="rbody">{reading.body}</div>
        {#if reading.ada}
          <!-- law 1: Dr. Voss has a word on every drive -->
          <p class="rada"><b>DR. A. VOSS — THRESHOLD-4</b>{reading.ada}</p>
        {/if}
        <p class="rnote">
          {reading.fresh
            ? "Unlocked for everyone — it stays in the Research archive permanently."
            : "Someone already brought this one out. It's in the Research archive."}
        </p>
        <button
          class="vreturn"
          onclick={() => {
            reading = null;
            resume();
          }}
        >close</button>
      </div>
    </div>
  {/if}

  {#if gateBanner && entered}
    <div class="level1">
      <span class="l1k">{gateBanner.k}</span>
      <span class="l1t">{gateBanner.t}</span>
      <span class="l1s">{gateBanner.s}</span>
    </div>
  {/if}

  {#if level1Open && entered}
    <div class="level1">
      <span class="l1k">THE DOOR IS OPEN</span>
      <span class="l1t">LEVEL 1 — THE POOLROOMS</span>
      <span class="l1s">{level1By ? `${level1By} turned the key. It stays open for everyone, forever.` : "It stays open for everyone, forever."}</span>
    </div>
  {/if}

  {#if entered && wasLocked && !locked && !debrief && !lost && !deniedMsg && !lootPanel && !landingChoice && !reading && deadScreen === "none" && !specOn}
    <div class="veil pause">
      <div class="pausecard">
        <p class="ptitle">PAUSED</p>
        <nav class="ptabs">
          <button class:on={pauseTab === "main"} onclick={() => { pauseTab = "main"; stopMeter(); }}>GAME</button>
          <button class:on={pauseTab === "audio"} onclick={openAudioTab}>AUDIO</button>
          <button class:on={pauseTab === "video"} onclick={() => { pauseTab = "video"; stopMeter(); }}>VIDEO</button>
          <button class:on={pauseTab === "controls"} onclick={() => { pauseTab = "controls"; stopMeter(); }}>CONTROLS</button>
        </nav>

        {#if pauseTab === "main"}
          <button class="pbtn" onclick={resume}>resume run</button>
          <p class="rule">
            the only way out is the way you came in — find your door's red mark.
            Everything you're carrying is on the line until you're through it.
          </p>
          <button class="pbtn danger" onclick={() => (confirmForfeit = true)}>forfeit the run</button>
          <p class="pnote">
            Forfeiting kills your character on the spot. Your gear and any
            unbanked relics drop with the body for someone else to find.
          </p>
        {:else if pauseTab === "audio"}
          <div class="pset">
            <label class="prow">
              <span>Microphone</span>
              <select
                value={brSettings.inputDevice}
                onchange={(e) => {
                  brSettings.inputDevice = (e.currentTarget as HTMLSelectElement).value;
                  pushAudio();
                }}
              >
                <option value="">system default</option>
                {#each mics as d (d.deviceId)}
                  <option value={d.deviceId}>{d.label || "microphone"}</option>
                {/each}
              </select>
            </label>
            <label class="prow">
              <span>Output</span>
              <select
                value={brSettings.outputDevice}
                onchange={(e) => {
                  brSettings.outputDevice = (e.currentTarget as HTMLSelectElement).value;
                  pushAudio();
                }}
              >
                <option value="">system default</option>
                {#each speakers as d (d.deviceId)}
                  <option value={d.deviceId}>{d.label || "speakers"}</option>
                {/each}
              </select>
            </label>
            <div class="prow">
              <span>Mic level</span>
              <div class="meter">
                <div class="meterfill" style="width:{Math.min(100, micMeter * 400)}%"></div>
                <div class="meterthresh" style="left:{Math.min(100, brSettings.micSensitivity * 400)}%"></div>
              </div>
            </div>
            <label class="prow">
              <span>Mic sensitivity</span>
              <input
                type="range"
                min="0"
                max="0.08"
                step="0.002"
                value={brSettings.micSensitivity}
                oninput={(e) => {
                  brSettings.micSensitivity = Number((e.currentTarget as HTMLInputElement).value);
                  pushAudio();
                }}
              />
              <b>{brSettings.micSensitivity === 0 ? "always open" : "gated"}</b>
            </label>
            <label class="prow">
              <span>Mic gain</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={brSettings.micGain}
                oninput={(e) => {
                  brSettings.micGain = Number((e.currentTarget as HTMLInputElement).value);
                  pushAudio();
                }}
              />
              <b>{brSettings.micGain.toFixed(1)}×</b>
            </label>
            <label class="prow">
              <span>Voices</span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={brSettings.voiceVolume}
                oninput={(e) => {
                  brSettings.voiceVolume = Number((e.currentTarget as HTMLInputElement).value);
                  pushAudio();
                }}
              />
              <b>{Math.round(brSettings.voiceVolume * 100)}%</b>
            </label>
            <label class="prow">
              <span>World sound</span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={brSettings.outputVolume}
                oninput={(e) => {
                  brSettings.outputVolume = Number((e.currentTarget as HTMLInputElement).value);
                  pushAudio();
                }}
              />
              <b>{Math.round(brSettings.outputVolume * 100)}%</b>
            </label>
            <label class="prow check">
              <input
                type="checkbox"
                checked={brSettings.neuralNS}
                onchange={(e) => {
                  brSettings.neuralNS = (e.currentTarget as HTMLInputElement).checked;
                  pushAudio();
                }}
              />
              <span>Neural noise suppression (RNNoise)</span>
            </label>
            <p class="pnote">
              These are the BACKROOMS' settings — separate from Solace's, saved
              on this machine, and reloaded next run.
            </p>
          </div>
          <button class="pbtn" onclick={resume}>back to the yellow</button>
        {:else if pauseTab === "video"}
          <div class="pset">
            <label class="prow">
              <span>Quality</span>
              <select
                value={brSettings.gfxPreset}
                onchange={(e) => {
                  brSettings.gfxPreset = (e.currentTarget as HTMLSelectElement).value as GfxPreset;
                  saveBrSettings();
                  applyGfx();
                }}
              >
                <option value="low">Low — no bloom, no filter</option>
                <option value="medium">Medium — no anti-aliasing</option>
                <option value="high">High — 4× MSAA</option>
                <option value="ultra">Ultra — 8× MSAA, sharp shadows</option>
              </select>
            </label>
            <label class="prow">
              <span>Render scale</span>
              <select
                value={String(brSettings.renderScale)}
                onchange={(e) => {
                  brSettings.renderScale = Number((e.currentTarget as HTMLSelectElement).value);
                  saveBrSettings();
                  applyGfx();
                }}
              >
                <option value="0">Auto — hold 60 fps</option>
                <option value="0.5">50% — performance</option>
                <option value="0.75">75%</option>
                <option value="1">100% — native</option>
                <option value="1.25">125%</option>
                <option value="1.5">150%</option>
                <option value="2">200% — supersampled</option>
              </select>
            </label>
            <label class="prow">
              <span>Blood & gore</span>
              <input
                type="checkbox"
                checked={brSettings.gore}
                onchange={(e) => {
                  brSettings.gore = (e.currentTarget as HTMLInputElement).checked;
                  saveBrSettings();
                }}
              />
              <b>{brSettings.gore ? "on" : "off"}</b>
            </label>
            <div class="prow">
              <span>Frame rate</span>
              <b>{gfxView.fps} fps · {gfxView.ms} ms</b>
            </div>
            <div class="prow">
              <span>Rendering at</span>
              <b>{gfxView.res} ({gfxView.scale}%{brSettings.renderScale === 0 ? " auto" : ""})</b>
            </div>
            <p class="pnote">
              Auto lowers resolution when your machine can't hold 60 fps.
              200% is for big GPUs. Saved on this machine.
            </p>
          </div>
          <button class="pbtn" onclick={resume}>back to the yellow</button>
        {:else}
          <div class="pset keys">
            <label class="prow">
              <span>Mouse sensitivity</span>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.05"
                value={brSettings.mouseSensitivity}
                oninput={(e) => {
                  brSettings.mouseSensitivity = Number((e.currentTarget as HTMLInputElement).value);
                  saveBrSettings();
                }}
              />
              <b>{brSettings.mouseSensitivity.toFixed(2)}×</b>
            </label>
            <label class="prow">
              <span>Raw input</span>
              <input
                type="checkbox"
                checked={brSettings.rawMouse}
                onchange={(e) => {
                  brSettings.rawMouse = (e.currentTarget as HTMLInputElement).checked;
                  saveBrSettings();
                }}
              />
              <b>{brSettings.rawMouse ? "on" : "off"}</b>
            </label>
            <label class="prow">
              <span>Invert look</span>
              <input
                type="checkbox"
                checked={brSettings.invertY}
                onchange={(e) => {
                  brSettings.invertY = (e.currentTarget as HTMLInputElement).checked;
                  saveBrSettings();
                }}
              />
              <b>{brSettings.invertY ? "on" : "off"}</b>
            </label>
            <p class="pnote">
              Raw input skips the OS's pointer acceleration. Takes effect on
              the next pause/resume. Saved on this machine.
            </p>
            {#each BR_ACTIONS as a (a.id)}
              <div class="prow">
                <span>{a.label}</span>
                <button
                  class="keybtn"
                  class:arming={capturing === a.id}
                  onclick={() => (capturing = capturing === a.id ? null : a.id)}
                >
                  {capturing === a.id ? "press a key…" : keyLabel(brSettings.keys[a.id])}
                </button>
              </div>
            {/each}
            <p class="pnote">
              Mouse: left click uses the held item · scroll or 1–9 selects a slot
              · ESC pauses. Those are fixed.
            </p>
          </div>
          <div class="prow2">
            <button class="pbtn ghost" onclick={() => { resetBrKeys(); capturing = null; }}>reset defaults</button>
            <button class="pbtn" onclick={resume}>back to the yellow</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if confirmForfeit}
    <div class="veil confirmveil">
      <div class="pausecard narrow">
        <p class="ptitle danger">ARE YOU SURE?</p>
        <p class="rule">
          Forfeiting kills <b>your character</b> where you stand — no debrief,
          and everything you carry stays on the body.
        </p>
        <div class="prow2">
          <button class="pbtn danger" onclick={doForfeit}>yes — end me</button>
          <button class="pbtn ghost" onclick={() => (confirmForfeit = false)}>keep going</button>
        </div>
      </div>
    </div>
  {/if}

  {#if inWaterHud && deadScreen === "none"}
    <!-- UNDERWATER: the teal wash + darkening as breath runs out. Purely
         visual — the server's 10-second clock is the one that kills. -->
    <div class="underwater" style="--drown:{1 - breathUi}"></div>
  {/if}

  {#if specOn && spec}
    {@const tName = spec.targets.find((q) => q.id === spec!.target)?.name ?? "someone"}
    {@const idx = spec.targets.findIndex((q) => q.id === spec!.target) + 1}
    {@const gone = Math.max(0, specClock - spec.at)}
    {@const left = Math.max(0, spec.talkLeftMs - (spec.talking ? gone : 0))}
    {@const refill = Math.max(0, spec.refillInMs - gone)}
    <!-- LAW 12: the dead, watching the living -->
    <div class="spechud">
      <div class="spectop">👻 WATCHING <b>{tName}</b>{#if spec.targets.length > 1}<span class="specn"> {idx}/{spec.targets.length}</span>{/if}</div>
      <div class="speckeys">Q ◀ ▶ E · mouse to look · hold {keyLabel(brSettings.keys.talk)} to whisper to them</div>
      <div class="spectalk" class:live={spec.talking}>
        <div class="specbar"><div class="specfill" style="width:{(left / 15_000) * 100}%"></div></div>
        <span>{(left / 1000).toFixed(1)}s of voice{#if left < 15_000} · full again in {Math.floor(refill / 60_000)}:{String(Math.floor(refill / 1000) % 60).padStart(2, "0")}{/if}</span>
      </div>
      {#if spec.watchers.length}<div class="specwith">{spec.watchers.length} other{spec.watchers.length === 1 ? "" : "s"} watching with you — you can hear each other</div>{/if}
      <button class="specleave" onclick={() => leaveSpectate()}>Leave</button>
    </div>
  {/if}

  {#if deadScreen !== "none"}
    <div class="deathov" class:black={deadScreen === "black"}>
      <span class="died">YOU DIED</span>
      <!-- The recovery rule, stated once, where it lands: nothing else in the
           app will ever tell you where the body is. -->
      <span class="diedsub">
        {deadCause === "drowned" ? "the deep kept you — your body drifts where you sank" : "your body lies where you fell, with everything on it"}<br />
        <b>24 hours</b> to bring it home · nothing will mark the spot
      </span>
    </div>
  {/if}

  {#if debrief}
    <div class="veil debrief">
      <div class="voss">
        <img src="/assets/voss.webp" alt="Dr. Ada Voss" />
        <div class="vtext">
          <p class="vkicker">THRESHOLD-4 · FIELD DEBRIEF</p>
          <p class="vname">Dr. Ada Voss</p>
          {#if debrief.home}
            <p class="vline">
              "You found a door that goes <b>out</b>. Number 9. I have read your telemetry three times and I still can't tell you where it put you — only that it wasn't here. Welcome back, surveyor. I mean that.
              Time in the dark: <b>{mins(debrief.ms)}</b>."
            </p>
          {:else}
          <p class="vline">
            "You came back. Statistically interesting.
            {#if debrief.revealed > 0}
              Your walk put <b>{debrief.revealed.toLocaleString()}</b> new cells on the community map.
            {:else}
              You charted nothing we didn't already have. Do better.
            {/if}
            Time in the yellow: <b>{mins(debrief.ms)}</b>."
          </p>
          {/if}
          {#if debrief.test}
            <p class="vsub"><b>TEST RUN</b> — nothing from it is kept: no relics, no footage.</p>
          {:else if debrief.relics.length}
            <div class="vrelics">
              {#each debrief.relics as r, i (i)}
                <span class="vrelic">
                  <img src={relicImg(r.relicId)} alt={r.name} />
                  <span>
                    {r.name} — {r.fresh ? "NEW · unlocked" : "duplicate → your locker (Voss pays 1,000 silver)"}
                    {#if r.fresh}<small class="vrdesc">{relicDesc(r.relicId)} Her notes are in your collection.</small>{/if}
                  </span>
                </span>
              {/each}
            </div>
          {:else}
            <p class="vsub">relics recovered: none</p>
          {/if}
          <p class="vsub">
            entity footage:
            {#if debrief.footage}
              <b>{FOOTAGE_LABEL[debrief.footage] ?? debrief.footage}</b> — the tape is in your locker.
            {:else}
              none — nothing on the reel worth her budget.
            {/if}
          </p>
          <button class="vreturn" onclick={leaveNow}>return to Solace</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ADMIN FLYCAM readout. Deliberately loud: you should never be unsure
       whether you're a ghost, because the entity and the fog behave
       differently while you are. -->
  <!-- THE AIMING CURSOR. Small and dim on purpose: it is there so you know
       where the spray will land and where the torch is pointed, not to make
       this a shooter. Hidden while the map, pause menu or a panel is up. -->
  <!-- `locked` is pointer lock, which is exactly "actively playing": it is
       false for the pause menu, the map, looting, reading and death. -->
  {#if entered && !debrief && locked && !showMap && !lootPanel && !reading && !wheelOpen && !emoting && !specOn}
    <div class="crosshair"></div>
  {/if}

  <!-- THE EMOTE WHEEL. Held open on the emote key; mouse deltas steer the
       dot, the wedge under it lights, click or release plays it. Pure SVG —
       shaped after Josh's Fortnite reference: a ring of wedges round a hub. -->
  {#if wheelOpen}
    <div class="emotewheel">
      <svg viewBox="-160 -160 320 320">
        {#each EMOTES as e, i (e.id)}
          <path d={wedgePath(i)} class="wedge" class:hot={wheelHover === i} />
          <text x={wedgeLabel(i).x} y={wedgeLabel(i).y} class="wlabel" class:hot={wheelHover === i}>{e.label}</text>
        {/each}
        <circle r="46" class="hub" />
        <text y="6" class="hubtext">{wheelHover >= 0 ? EMOTES[wheelHover].label.toUpperCase() : "EMOTES"}</text>
        <circle cx={wheelX} cy={wheelY} r="5" class="wcursor" />
      </svg>
      <p class="whint">flick toward a dance — release or click to play it</p>
    </div>
  {/if}

  {#if entered && !debrief && probeOn && probeText}
    <div class="probechip">{probeText}</div>
  {/if}

  {#if entered && !debrief && flying}
    <div class="flychip">
      👁 FLYCAM · {flySpeed < 10 ? flySpeed.toFixed(1) : Math.round(flySpeed)} c/s · scroll to
      change · shift ×3 · F to land
      <span class="flynote">invisible · charts no map · the entity can't see you</span>
    </div>
  {/if}

  {#if entered && !debrief && slots[selSlot]?.kind === "flashlight"}
    <div class="battery" class:low={flashPct < 0.2}>
      🔦 {Math.round(flashPct * 100)}% · {flashOn ? "ON" : "click to light"}
    </div>
  {/if}
  {#if entered && !debrief && slots[selSlot]?.kind === "camera"}
    <!-- THE SCOPE TRANSITION (Josh): you watch the camera come up to your mask,
         and once it is there the view SNAPS to being the camera's own — the
         viewfinder HUD takes the screen and the physical camera model is hidden,
         because you are now looking THROUGH it, not at it. `camAimed` crosses at
         0.82 of the raise so the swap lands as the body finishes the lift, not
         before it starts. -->
    <img class="camhud" class:up={camAimed} src="/assets/gear/camera-hud.avif" alt="" />
    <div class="battery" class:tx={camRec}>
      {camRec ? "● REC" : "📷"} · {Math.floor(camLeft / 60)}:{String(Math.floor(camLeft % 60)).padStart(2, "0")} tape ·
      hold right-click to raise · {camRec ? "click stops" : "click records while raised"}
    </div>
  {/if}
  {#if entered && !debrief && slots[selSlot]?.kind === "spraycan"}
    <div class="battery" class:low={sprayPct < 0.2}>
      🖌 {slots[selSlot]?.color ?? "black"} · {Math.round(sprayPct * 100)}% · hold click on a wall
    </div>
  {/if}
  {#if entered && !debrief && slots[selSlot]?.kind === "walkie"}
    <div class="battery" class:low={walkiePct < 0.2} class:tx={txing}>
      📻 CH{walkieChan} · {Math.round(walkiePct * 100)}% · {txing ? "● TX" : "hold V · , . channel"}
    </div>
  {/if}
</div>

<style>
  .game {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #837b40;
    cursor: crosshair;
  }
  .game :global(canvas) {
    display: block;
  }
  .door-banner {
    position: absolute;
    top: 26px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 22px;
    background: rgba(10, 8, 4, 0.55);
    border: 1px solid rgba(201, 178, 106, 0.35);
    border-radius: 3px;
    color: #e8dcae;
    font-size: 0.85rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    animation: fadeaway 6s ease forwards;
    pointer-events: none;
  }
  @keyframes fadeaway {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  .hint {
    position: absolute;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    padding: 7px 16px;
    background: rgba(10, 8, 4, 0.55);
    border-radius: 3px;
    color: #cfc39a;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(6, 5, 3, 0.82);
    color: #d8cfae;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    z-index: 5;
  }
  .veil button {
    padding: 8px 22px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 700;
    cursor: pointer;
  }
  /* ---- Survival HUD ------------------------------------------------- */
  .hud-left {
    position: absolute;
    left: 20px;
    bottom: 22px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: min(240px, 30vw);
    z-index: 3;
    pointer-events: none;
  }
  .bar {
    height: 10px;
    background: rgba(8, 6, 3, 0.62);
    border: 1px solid rgba(201, 178, 106, 0.28);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar .fill {
    height: 100%;
    transition: width 0.12s linear;
  }
  .bar.stamina {
    height: 7px;
  }
  .bar.stamina .fill {
    background: #d8b93c;
  }
  .bar.breath {
    height: 7px;
  }
  .bar.breath .fill {
    background: #5fd7e8;
    transition: width 0.15s linear;
  }
  /* THE HOTEL's heat: orange climbing to red, pulsing once it is burning you */
  .bar.heat {
    height: 7px;
  }
  .bar.heat .fill {
    background: linear-gradient(90deg, #e8a13c, #e0461f);
    transition: width 0.3s linear;
  }
  .bar.heat.hot {
    animation: heatpulse 0.8s ease-in-out infinite;
  }
  @keyframes heatpulse {
    50% { border-color: #ff5a2a; }
  }
  .hotelcard {
    position: absolute;
    top: 14%;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(520px, 86vw);
    padding: 14px 22px;
    background: rgba(24, 12, 8, 0.86);
    border: 1px solid #b8873f;
    border-radius: 6px;
    color: #f0dfbd;
    text-align: center;
    z-index: 8;
    pointer-events: none;
    font-family: Georgia, "Times New Roman", serif;
  }
  .hotelcard .hk {
    font-size: 0.68rem;
    letter-spacing: 0.32em;
    color: #e7c27a;
    font-weight: 800;
    margin-bottom: 6px;
    font-family: system-ui, sans-serif;
  }
  .hotelcard .ht {
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .hotelcard .floors {
    display: grid;
    grid-template-columns: repeat(5, 30px);
    gap: 6px;
    justify-content: center;
    margin: 6px 0 10px;
  }
  .hotelcard .fl {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid #8a6a36;
    display: grid;
    place-items: center;
    font-size: 0.78rem;
    color: #d8c39a;
    font-family: system-ui, sans-serif;
  }
  .hotelcard .fl.on {
    background: #e7c27a;
    color: #24140a;
    box-shadow: 0 0 10px #e7c27a;
  }
  /* UNDERWATER: teal wash + a vignette that closes in as --drown → 1. */
  .underwater {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 4;
    background:
      radial-gradient(
        ellipse at 50% 50%,
        transparent calc(62% - var(--drown, 0) * 45%),
        rgba(2, 10, 14, calc(0.55 + var(--drown, 0) * 0.45)) 100%
      ),
      rgba(28, 90, 96, 0.28);
    animation: waterSway 3.6s ease-in-out infinite alternate;
  }
  @keyframes waterSway {
    from {
      backdrop-filter: blur(1.2px);
    }
    to {
      backdrop-filter: blur(2.2px);
    }
  }
  .hud-slots {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 3;
    pointer-events: none;
  }
  .hud-note {
    padding: 4px 12px;
    background: rgba(8, 6, 3, 0.7);
    border-radius: 3px;
    color: #e8dcae;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
  }
  .slots {
    display: flex;
    gap: 7px;
  }
  .slot {
    width: 52px;
    height: 52px;
    background: rgba(90, 88, 84, 0.42);
    border: 2px solid rgba(140, 136, 128, 0.55);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .slot.sel {
    border-color: #e8d386;
    background: rgba(120, 110, 80, 0.5);
  }
  .slot .idx {
    color: rgba(220, 214, 196, 0.42);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .slot:has(.slotimg) {
    background: rgba(140, 128, 92, 0.5);
    border-color: rgba(200, 186, 140, 0.7);
  }
  .slot .lvl {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font-size: 0.58rem;
    color: #c9b26a;
    font-weight: 800;
  }
  .slot {
    position: relative;
  }
  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    margin: -2.5px 0 0 -2.5px;
    border-radius: 50%;
    background: rgba(240, 230, 200, 0.55);
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    z-index: 5;
  }
  /* ---- The emote wheel ---- */
  .emotewheel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    pointer-events: none; /* the pointer is locked — deltas drive it */
    z-index: 7;
    background: radial-gradient(closest-side, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.12) 65%, transparent 80%);
  }
  .emotewheel svg {
    width: min(56vh, 66vw, 480px);
    height: min(56vh, 66vw, 480px);
    filter: drop-shadow(0 8px 30px rgba(0, 0, 0, 0.7));
  }
  .wedge {
    fill: rgba(26, 24, 14, 0.82);
    stroke: rgba(232, 220, 174, 0.22);
    stroke-width: 1.4;
    transition: fill 70ms linear;
  }
  .wedge.hot {
    fill: rgba(196, 168, 84, 0.92);
    stroke: rgba(255, 244, 200, 0.85);
  }
  .wlabel {
    fill: rgba(232, 220, 174, 0.85);
    font: 700 12px system-ui, sans-serif;
    text-anchor: middle;
    letter-spacing: 0.04em;
    pointer-events: none;
  }
  .wlabel.hot {
    fill: #171307;
  }
  .hub {
    fill: rgba(14, 13, 8, 0.85);
    stroke: rgba(232, 220, 174, 0.3);
    stroke-width: 1.4;
  }
  .hubtext {
    fill: rgba(232, 220, 174, 0.9);
    font: 800 13px system-ui, sans-serif;
    text-anchor: middle;
    letter-spacing: 0.16em;
  }
  .wcursor {
    fill: #ffe9a8;
    stroke: rgba(0, 0, 0, 0.6);
    stroke-width: 1;
  }
  .whint {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(232, 220, 174, 0.75);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }

  .probechip {
    position: absolute;
    bottom: 96px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 92vw;
    padding: 5px 12px;
    background: rgba(8, 14, 26, 0.8);
    border: 1px solid rgba(120, 190, 255, 0.45);
    border-radius: 3px;
    color: #bcdcff;
    font-family: ui-monospace, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.02em;
    line-height: 1.5;
    text-align: center;
    pointer-events: none;
    z-index: 6;
  }
  .flychip {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 14px;
    background: rgba(8, 14, 26, 0.72);
    border: 1px solid rgba(120, 190, 255, 0.5);
    border-radius: 3px;
    color: #bcdcff;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    pointer-events: none;
    z-index: 6;
  }
  .flynote {
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    color: #7d9bc0;
    text-transform: uppercase;
  }
  .battery {
    position: absolute;
    bottom: 54px;
    right: 18px;
    padding: 6px 12px;
    background: rgba(10, 8, 4, 0.55);
    border: 1px solid rgba(201, 178, 106, 0.35);
    border-radius: 3px;
    color: #e8dcae;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    pointer-events: none;
    z-index: 4;
  }
  .battery.low {
    border-color: rgba(194, 90, 58, 0.6);
    color: #c98a72;
  }
  .battery.tx {
    border-color: rgba(92, 220, 120, 0.7);
    color: #8fdc9c;
  }
  .lootveil {
    background: rgba(6, 5, 3, 0.7);
  }
  .lootcard {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px 26px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 8px;
    max-width: 520px;
  }
  .ltitle {
    margin: 0;
    color: #c9b26a;
    font-weight: 800;
    letter-spacing: 0.14em;
  }
  .lootgrid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .lootitem {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 96px;
    padding: 9px 6px;
    background: rgba(90, 88, 84, 0.16);
    border: 1px solid #4a4128;
    border-radius: 6px;
    cursor: pointer;
  }
  .lootitem:hover {
    border-color: #c9b26a;
  }
  .lootitem img {
    width: 46px;
    height: 46px;
    object-fit: contain;
  }
  .lootglyph {
    font-size: 1.8rem;
    line-height: 46px;
  }
  .lootname {
    color: #d8cfae;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .lempty {
    margin: 0;
    color: #9a8f6c;
    font-style: italic;
  }
  .deathov {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    align-items: center;
    justify-content: center;
    background: rgba(140, 12, 6, 0.55);
    animation: deathflash 0.9s ease;
    transition: background 2.2s ease;
  }
  .deathov.black {
    background: rgba(0, 0, 0, 1);
  }
  .died {
    font-size: 3rem;
    font-weight: 900;
    letter-spacing: 0.5em;
    color: #ff5238;
    text-shadow: 0 0 40px rgba(255, 40, 20, 0.8);
    animation: diedfade 3.2s ease forwards;
  }
  .diedsub {
    max-width: 30rem;
    text-align: center;
    font-size: 0.85rem;
    line-height: 1.7;
    letter-spacing: 0.06em;
    color: #f0c9b8;
    text-transform: uppercase;
    animation: diedfade 3.2s ease forwards;
  }
  .diedsub b {
    color: #ffd0a0;
  }
  @keyframes deathflash {
    0% { background: rgba(255, 30, 10, 0.9); }
    100% { background: rgba(140, 12, 6, 0.55); }
  }
  @keyframes diedfade {
    0%, 55% { opacity: 1; }
    100% { opacity: 0; }
  }
  /* Camera view: the HUD frame is an OVERLAY, not a filter. Screen blending
     drops its black pixels out entirely (Josh: "too dark, the player can
     barely see what's in front of them"), so only the bright readouts sit on
     top of the room and the view through the viewfinder stays legible. */
  .camhud {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
    /* Faint while the camera is still coming up — you are looking PAST it — then
       full once it reaches the mask and the view becomes the camera's own. The
       scale settles from slightly wide, which reads as the frame seating against
       your eye rather than a hard cut. */
    opacity: 0.18;
    transform: scale(1.06);
    transition: opacity 0.14s ease-out, transform 0.14s ease-out;
    mix-blend-mode: screen;
    z-index: 2;
  }
  .camhud.up {
    opacity: 0.72;
    transform: scale(1);
  }
  .slotimg {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 3px;
    box-sizing: border-box;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  }
  .slotglyph {
    font-size: 1.6rem;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9));
  }
  /* ---- Field map ------------------------------------------------------ */
  .mapov {
    position: absolute;
    inset: 6% 14%;
    background: rgba(8, 6, 3, 0.94);
    border: 1px solid rgba(201, 178, 106, 0.4);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    z-index: 6;
  }
  .maphead {
    display: flex;
    justify-content: space-between;
    padding: 10px 14px;
    color: #c9b26a;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    border-bottom: 1px solid rgba(201, 178, 106, 0.25);
  }
  .maphead .dim {
    color: #6a6045;
    letter-spacing: 0.08em;
  }
  .mapscroll {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .mapscroll canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    image-rendering: pixelated;
  }
  /* ---- Pause + settings + debrief ------------------------------------- */
  .pausecard {
    width: min(560px, 92vw);
    max-height: 86vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 22px 24px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 8px;
  }
  .pausecard.narrow {
    width: min(430px, 92vw);
  }
  .ptitle {
    margin: 0;
    font-size: 1.1rem;
    letter-spacing: 0.4em;
    color: #c9b26a;
    font-weight: 800;
  }
  .ptitle.danger {
    color: #e0563c;
  }
  .ptabs {
    display: flex;
    gap: 6px;
  }
  .ptabs button {
    flex: 1;
    padding: 7px 0;
    background: rgba(90, 88, 84, 0.16);
    border: 1px solid #2b2413;
    border-radius: 5px;
    color: #9a8f6c;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    cursor: pointer;
  }
  .ptabs button.on {
    background: rgba(201, 178, 106, 0.16);
    border-color: #c9b26a;
    color: #e8d386;
  }
  .pbtn {
    padding: 9px 18px;
    background: #c9b26a;
    border: none;
    border-radius: 4px;
    color: #171204;
    font-weight: 800;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .pbtn:hover {
    background: #e8d386;
  }
  .pbtn.ghost {
    background: transparent;
    border: 1px solid #4a4128;
    color: #9a8f6c;
  }
  .pbtn.ghost:hover {
    border-color: #c9b26a;
    color: #d8cfae;
    background: transparent;
  }
  .pbtn.danger {
    background: #7d2417;
    color: #ffdfd6;
  }
  .pbtn.danger:hover {
    background: #a12f1d;
  }
  .prow2 {
    display: flex;
    gap: 8px;
  }
  .prow2 .pbtn {
    flex: 1;
  }
  .pause .rule,
  .confirmveil .rule {
    margin: 0;
    color: #c98a72;
    font-size: 0.82rem;
    line-height: 1.5;
    font-style: italic;
    text-align: left;
  }
  .rule b {
    color: #e0563c;
    font-style: normal;
  }
  .pnote {
    margin: 0;
    color: #6a6045;
    font-size: 0.74rem;
    line-height: 1.5;
    text-align: left;
  }
  .pset {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    color: #d8cfae;
  }
  .prow > span:first-child {
    width: 130px;
    flex-shrink: 0;
    color: #9a8f6c;
    text-align: left;
  }
  .prow b {
    width: 78px;
    color: #e8d386;
    font-size: 0.74rem;
    text-align: right;
  }
  .prow select {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    background: #171308;
    border: 1px solid #4a4128;
    border-radius: 4px;
    color: #d8cfae;
    font-size: 0.78rem;
  }
  .prow input[type="range"] {
    flex: 1;
    min-width: 0;
    accent-color: #c9b26a;
  }
  .prow.check {
    gap: 8px;
  }
  .prow.check span {
    width: auto;
    color: #d8cfae;
  }
  .meter {
    position: relative;
    flex: 1;
    height: 10px;
    background: rgba(8, 6, 3, 0.7);
    border: 1px solid #4a4128;
    border-radius: 3px;
    overflow: hidden;
  }
  .meterfill {
    height: 100%;
    background: #5cdc78;
    transition: width 0.1s linear;
  }
  .meterthresh {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: #e0563c;
  }
  .keys .prow {
    justify-content: space-between;
  }
  .keybtn {
    min-width: 118px;
    padding: 5px 10px;
    background: rgba(90, 88, 84, 0.2);
    border: 1px solid #4a4128;
    border-radius: 4px;
    color: #e8d386;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }
  .keybtn:hover {
    border-color: #c9b26a;
  }
  .keybtn.arming {
    border-color: #e0563c;
    color: #e0563c;
  }
  /* ---- The archive reader + the key + the door ------------------------- */
  .readveil {
    background: rgba(4, 4, 6, 0.9);
  }
  .readcard {
    width: min(680px, 92vw);
    max-height: 86vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 24px 26px;
    background: #0b0d10;
    border: 1px solid #22303a;
    border-radius: 8px;
  }
  .rkicker {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: 0.3em;
    color: #5d7f92;
  }
  .rtitle {
    margin: 0;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #9fd7ff;
  }
  .rfile {
    margin: 0;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.74rem;
    color: #4f6a78;
  }
  .rbody {
    white-space: pre-wrap;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.84rem;
    line-height: 1.65;
    color: #c8d6dd;
    padding: 12px 14px;
    background: rgba(20, 32, 40, 0.5);
    border-left: 2px solid #2d4a5a;
    border-radius: 3px;
    text-align: left;
  }
  .rada {
    margin: 0;
    padding: 8px 10px;
    border-left: 2px solid #4f7a8c;
    background: rgba(79, 122, 140, 0.1);
    font-size: 0.82rem;
    line-height: 1.45;
    color: #b9cdd6;
  }
  .rada b {
    display: block;
    margin-bottom: 3px;
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    color: #7fa3b3;
  }
  .rnote {
    margin: 0;
    font-size: 0.75rem;
    color: #6a8593;
    font-style: italic;
  }
  .keychip {
    align-self: flex-start;
    padding: 4px 10px;
    background: rgba(40, 30, 6, 0.7);
    border: 1px solid #c9a227;
    border-radius: 3px;
    color: #ffe08a;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .level1 {
    position: absolute;
    top: 12%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 30px;
    background: rgba(6, 18, 20, 0.82);
    border: 1px solid #6fc7c0;
    border-radius: 8px;
    z-index: 8;
    pointer-events: none;
    animation: l1in 1.2s ease;
  }
  @keyframes l1in {
    from { opacity: 0; transform: translateX(-50%) scale(0.96); }
    to { opacity: 1; transform: translateX(-50%) scale(1); }
  }
  .l1k {
    font-size: 0.7rem;
    letter-spacing: 0.34em;
    color: #6fc7c0;
    font-weight: 800;
  }
  .l1t {
    font-size: 1.25rem;
    letter-spacing: 0.2em;
    color: #d6f5f1;
    font-weight: 900;
  }
  .l1s {
    font-size: 0.78rem;
    color: #8fb6b2;
  }
  .comms {
    align-self: flex-start;
    padding: 4px 10px;
    background: rgba(10, 8, 4, 0.6);
    border: 1px solid rgba(92, 220, 120, 0.35);
    border-radius: 3px;
    color: #8fdc9c;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }
  .comms.muted {
    border-color: rgba(194, 90, 58, 0.5);
    color: #c98a72;
  }
  .comms.tx {
    border-color: rgba(232, 211, 134, 0.8);
    color: #e8d386;
  }
  .debrief {
    background: rgba(4, 3, 2, 0.93);
  }
  /* The debrief is Voss's scene — she reads at portrait scale now (Josh),
     and the card grew with her so the text column keeps its measure. On a
     short/narrow window it stacks and the card scrolls rather than clipping. */
  .voss {
    display: flex;
    gap: 26px;
    max-width: 860px;
    max-height: 88vh;
    overflow-y: auto;
    padding: 26px;
    background: #0e0c08;
    border: 1px solid #2b2413;
    border-radius: 8px;
    align-items: flex-start;
  }
  .voss img {
    width: 280px;
    max-width: 34vw;
    border-radius: 6px;
    border: 1px solid #2b2413;
    flex-shrink: 0;
  }
  @media (max-width: 720px) {
    .voss {
      flex-direction: column;
      align-items: center;
    }
    .voss img {
      width: min(300px, 70vw);
      max-width: none;
    }
  }
  .vtext {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .vkicker {
    margin: 0;
    font-size: 0.66rem;
    letter-spacing: 0.32em;
    color: #6a6045;
  }
  .vname {
    margin: 0;
    font-weight: 800;
    color: #c9b26a;
    letter-spacing: 0.08em;
  }
  .vline {
    margin: 0;
    color: #d8cfae;
    line-height: 1.55;
    font-size: 0.92rem;
  }
  .vline b {
    color: #e8d386;
  }
  .vsub {
    margin: 0;
    font-size: 0.78rem;
    color: #9a8f6c;
  }
  .vsub b {
    color: #e8d386;
  }
  .vrelics {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vrelic {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.84rem;
    color: #e8d386;
  }
  .vrdesc {
    display: block;
    color: #b8a978;
    font-size: 0.74rem;
    line-height: 1.4;
    margin-top: 2px;
  }
  .vrelic img {
    width: 38px;
    height: 38px;
    object-fit: contain;
    border-radius: 5px;
    border: 1px solid #8a6a2a;
  }
  .vreturn {
    align-self: flex-start;
    margin-top: 6px;
    padding: 9px 22px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 800;
    cursor: pointer;
  }
  .vreturn:hover {
    background: #e8d386;
  }
  /* The Landing's two-doors panel. */
  .lchoices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }
  .vreturn.out {
    background: #9fe8b0;
  }
  .vreturn.out:hover {
    background: #c6f5d1;
  }
  .vreturn.ghost {
    background: transparent;
    border: 1px solid rgba(220, 214, 196, 0.35);
    color: #dcd6c4;
    font-weight: 600;
  }
  .vreturn.ghost:hover {
    background: rgba(220, 214, 196, 0.12);
  }
  /* LAW 12 — the dead's HUD: quiet, top-centre, out of the view's way */
  .spechud {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: rgba(6, 10, 14, 0.62);
    border: 1px solid rgba(150, 190, 220, 0.25);
    border-radius: 6px;
    color: #dbe7f0;
    font-size: 0.78rem;
    pointer-events: auto;
    z-index: 25;
  }
  .spectop { font-weight: 800; letter-spacing: 0.12em; }
  .specn { opacity: 0.6; font-weight: 600; }
  .speckeys { opacity: 0.75; font-size: 0.72rem; }
  .spectalk { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; opacity: 0.85; }
  .spectalk.live { opacity: 1; color: #bfe3ff; }
  .specbar { width: 140px; height: 6px; background: rgba(255, 255, 255, 0.12); border-radius: 3px; overflow: hidden; }
  .specfill { height: 100%; background: linear-gradient(90deg, #7fb6ff, #d6ecff); }
  .specwith { font-size: 0.7rem; opacity: 0.7; }
  .specleave {
    margin-top: 2px;
    padding: 4px 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  /* the dead carry nothing: their bars and pockets stand down while they watch */
  .specgone { display: none !important; }
</style>
