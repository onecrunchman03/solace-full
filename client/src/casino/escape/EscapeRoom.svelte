<script lang="ts">
  // THE ESCAPE ROOM ANTE-ROOM (E1 — design ESCAPE.md). The safe room between
  // the casino floor and the complex: Sterling's counter, the two lockers,
  // the wall map, and two teleport doors. The complex door is SEALED until E2
  // wires the zone relay; everything else here is live against the real
  // /api/escape surface.
  //
  // Deliberately a compact sibling of CasinoGame, not a fork of it: one
  // rectangular room — so movement is a clamp, not a grid. SHARED since Oct
  // 2026 (Josh: "I cannot see other players in the ready room"): the
  // /ws-escape socket opens on mount, `ante-enter` seats this body in the
  // server's ante, and everyone standing here is drawn from `antePeers` with
  // the complex peers' exact loop.
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { api } from "../../lib/api";
  import { acquirePointerLock, isTeleport } from "../../lib/pointerlock";
  import { isMac, isDesktopShell } from "../../lib/platform";
  import { brSettings } from "../../backrooms/settings.svelte";
  import { sterlingMurmur } from "../../lib/shop-audio";
  import { buildSterlingFigure, STERLING_MOUTH } from "../sterling-model";
  import { sterlingLine } from "../../lib/sterling-lines";
  import { takeIdle } from "../../lib/npcvoice";
  import { GRID, FLOOR, STUB, ROOMS, DENS, SPAWN_ROOM, DOOR_COMPLEX } from "./er-layout";
  import { buildComplex, lambertify, type ErWorld } from "./er-world";
  import { carpetTex, damaskTex, ceilingTex, WALNUT } from "../world";
  import LockerPanel from "../LockerPanel.svelte";
  import { getToken } from "../../lib/api";
  // THE UNIFORMITY LAW (Josh, 2026-08-13): movement, bodies and equipment are
  // the backrooms' own — the same controller the backrooms and the casino
  // hall drive, the same hazmat avatars, the same held-item grammar.
  import { createController, type ControllerWorld, type PlayerState } from "../../backrooms/controller";
  import {
    ensureHazmat, makeAvatar, tickAvatar, disposeAvatar, setAvatarEquip,
    makeViewmodel, tickViewmodel, placeViewmodel, attachToHand, armIK,
    installAvatarTorchPool,
    type PeerAvatar, type Viewmodel,
  } from "../../backrooms/world";
  import { gearSfx, warmGearSfx } from "../../backrooms/gearsfx";
  import { joinProximityVoice, type ProximityVoice, type SpatialPeer } from "../../backrooms/voicechat";
  import { playSfx, playSfxLoop } from "../../lib/sfx";
  import { session } from "../../lib/session.svelte";
  import { makeStepBank, loadSteps, stepSound } from "../steps";

  let { onBack }: { onBack: () => void } = $props();

  /** Where the body is: the safe ante-room, or the complex proper. */
  let mode = $state<"ante" | "complex">("ante");
  // The zone's live state, straight off /ws-escape.
  let keyState = $state<{ state: string; room?: string; pos?: { x: number; y: number } | null; by?: number } | null>(null);
  let exitUntil = $state(0);
  let exitLeft = $state(0);
  let holdKey = $state(false);
  /** Standing chests, cells off the wire. */
  let chestList = $state<{ id: number; room: string; x: number; y: number }[]>([]);
  /** The loot toast: what the last chest paid, briefly. */
  let lootToast = $state<{ tier: string; kind: string; amount: number; skin: string | null } | null>(null);
  let lootTimer: ReturnType<typeof setTimeout> | undefined;
  let opensToday = $state(0);
  let opensMax = $state(10);
  /** THE HUNT's state off the wire (E4). */
  let huntPhase = $state<"calm" | "telegraph" | "hunt" | "retreat">("calm");
  let huntUntil = $state(0);
  let huntBlocks = $state<string[]>([]);
  let huntLeft = $state(0);
  let killedFlash = $state(false);
  /** The admin's P-menu (E5): every hunt lever, for testing the features. */
  let debugOpen = $state(false);
  let debugState = $state<string>("");
  let monFrozen = $state(false);
  /** The menu's buttons live outside the mount closure; the ops reach the
   *  socket through this hook (the stakeAndEnter pattern). */
  let dbgHook: ((op: string) => void) | null = null;
  let goHook: ((x: number, z: number, yaw: number) => void) | null = null;

  const CELL = 2;
  const EYE = 1.62;
  // The ante-room in LOCAL metres, origin at its NW corner.
  const RW = (SPAWN_ROOM.x1 - SPAWN_ROOM.x0 + 1) * CELL; // 20
  const RD = (SPAWN_ROOM.y1 - SPAWN_ROOM.y0 + 1) * CELL; // 12
  const CEIL_H = 3.4;

  let canvas: HTMLCanvasElement;
  let locked = $state(false);
  let lockHint = $state(false);
  let loading = $state(true);
  let failed = $state(false);
  let prompt = $state("");
  let menuOpen = $state(false);
  let counterOpen = $state(false);
  let lockerOpen = $state(false);
  /** The CASINO locker cabinet — the hall's own 50-slot LockerPanel, not the
   *  escape bag UI. Same locker, second door (Josh: "the same as the one in
   *  the casino"). */
  let casLockerOpen = $state(false);
  let busy = $state(false);
  let notice = $state("");

  // The threshold state, straight off /api/escape.
  let coins = $state(0);
  let inv = $state<{ item: string; qty: number }[]>([]);
  let locker = $state<{ item: string; qty: number }[]>([]);
  let tools = $state<Record<string, { name: string; price: number; blurb: string }>>({});
  let invSlots = $state(5);

  const toolIcon: Record<string, string> = { flashlight: "🔦", walkie: "📻", almond: "🥛", key: "🗝" };
  /** Josh's own gear renders — the SAME art the backrooms store shows
   *  (assets/gear/store; bottle.webp IS almond water). Uniformity in the
   *  shop window, not just the world. */
  const toolArt: Record<string, string> = {
    flashlight: "/assets/gear/store/flashlight.webp",
    walkie: "/assets/gear/store/walkietalkie.webp",
    almond: "/assets/gear/store/bottle.webp",
  };
  const itemLabel = (id: string): string => tools[id]?.name ?? id;

  // ---- THE HOTBAR (the backrooms' inventory system, verbatim — THE
  // UNIFORMITY LAW). Five slots over the ER bag; ER item names map onto the
  // backrooms KIND vocabulary so attachToHand/setAvatarEquip/gearSfx all
  // speak their native language. Selection: Digit1-5 or the mouse wheel;
  // LMB uses the held thing; V is push-to-talk. selSlot + slots[selSlot] IS
  // the held item — no separate equipped state, exactly like the backrooms.
  let selSlot = $state(0);
  const BR_KIND: Record<string, string> = { flashlight: "flashlight", walkie: "walkie", almond: "almondwater", key: "key" };
  const slotItems = $derived.by(() => {
    const out: ({ item: string; kind: string; qty: number } | null)[] = Array(5).fill(null);
    inv.slice(0, 5).forEach((it, n) => { out[n] = { item: it.item, kind: BR_KIND[it.item] ?? it.item, qty: it.qty }; });
    return out;
  });
  /** Hotbar icons by backrooms KIND (the same images the backrooms HUD uses). */
  const GEAR_IMG: Record<string, string> = {
    flashlight: "/assets/gear/store/flashlight.webp",
    walkie: "/assets/gear/store/walkietalkie.webp",
    almondwater: "/assets/gear/store/bottle.webp",
  };

  // Sterling at his counter — his blips, and once the room is built, his grill.
  let sterlingTalk = (text: string): void => { sterlingMurmur(text); };
  let sterlingTick: ((dt: number) => void) | null = null;
  const say = (t: string): void => {
    notice = t;
    setTimeout(() => { if (notice === t) notice = ""; }, 3000);
  };

  const refresh = async (): Promise<void> => {
    const t = await api.escape();
    coins = t.coins;
    inv = t.inv;
    locker = t.locker;
    tools = t.tools;
    invSlots = t.invSlots;
  };

  const buyTool = async (id: string): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const r = await api.escapeBuy(id);
      coins = r.coins;
      inv = r.inv;
      sterlingTalk("a fine choice. it may even come back with you.");
    } catch (e) {
      const err = (e as { error?: string }).error;
      say(err === "insufficient" ? "not enough silver" : err === "bag_full" ? "your bag is full — five kinds, no more" : "Sterling shakes his head");
    } finally {
      busy = false;
    }
  };

  const moveItem = async (id: string, dir: "store" | "take"): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const r = dir === "store" ? await api.escapeLockerStore(id, 1) : await api.escapeLockerTake(id, 1);
      inv = r.inv;
      locker = r.locker;
    } catch (e) {
      const err = (e as { error?: string }).error;
      say(err === "bag_full" ? "your bag is full" : err === "locker_full" ? "the locker is full" : "that didn't fit");
    } finally {
      busy = false;
    }
  };

  // ---- THE WALL MAP — drawn from the real layout, not the sketch ----------
  function drawWallMap(): HTMLCanvasElement {
    const px = 22; // px per cell
    const cv = document.createElement("canvas");
    cv.width = GRID.w * px;
    cv.height = GRID.h * px;
    const g = cv.getContext("2d")!;
    // Aged paper under glass.
    const bg = g.createLinearGradient(0, 0, cv.width, cv.height);
    bg.addColorStop(0, "#e8dcc0");
    bg.addColorStop(1, "#d4c4a0");
    g.fillStyle = bg;
    g.fillRect(0, 0, cv.width, cv.height);
    const rect = (r: { x0: number; y0: number; x1: number; y1: number }, pad = 0): [number, number, number, number] =>
      [r.x0 * px + pad, r.y0 * px + pad, (r.x1 - r.x0 + 1) * px - pad * 2, (r.y1 - r.y0 + 1) * px - pad * 2];
    // Corridors: warm floorboards.
    g.fillStyle = "#c9ad7c";
    g.fillRect(...rect(FLOOR));
    g.fillRect(...rect(STUB));
    // Rooms: outlined, numbered.
    for (const r of ROOMS) {
      const [x, y, w, h] = rect(r, 1.5);
      g.fillStyle = "#efe6cf";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "#6d5636";
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      g.fillStyle = "#4a3a20";
      g.font = `bold ${px * 0.62}px Georgia, serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(r.id, x + w / 2, y + h / 2);
      // The door, as a gap-marker on the corridor side.
      g.fillStyle = "#8a6a3a";
      g.fillRect(r.door.x * px + px * 0.3, r.door.y * px + px * 0.3, px * 0.4, px * 0.4);
    }
    // The dens: red, unlabeled — the map admits they exist and no more.
    for (const d of DENS) {
      const [x, y, w, h] = rect(d, 1.5);
      g.fillStyle = "#8d2f26";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "#5d1d16";
      g.strokeRect(x, y, w, h);
    }
    // The ante-room + YOU ARE HERE.
    {
      const [x, y, w, h] = rect(SPAWN_ROOM, 1.5);
      g.fillStyle = "#dcc9a2";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "#6d5636";
      g.strokeRect(x, y, w, h);
      g.fillStyle = "#7a1f1a";
      g.font = `bold ${px * 0.7}px Georgia, serif`;
      g.fillText("YOU ARE HERE", x + w / 2, y + h / 2);
      g.beginPath();
      g.arc(DOOR_COMPLEX.x * px + px / 2, (DOOR_COMPLEX.y + 1.6) * px, px * 0.28, 0, Math.PI * 2);
      g.fillStyle = "#7a1f1a";
      g.fill();
    }
    // Title strip.
    g.fillStyle = "#4a3a20";
    g.font = `bold ${px * 1.15}px Georgia, serif`;
    g.textAlign = "left";
    g.fillText("THE COMPLEX — 48 ROOMS", px, px * 1.4);
    g.font = `${px * 0.6}px Georgia, serif`;
    g.fillText("red rooms are not rooms. find the key. the door gives you thirty seconds.", px, px * 2.4);
    return cv;
  }

  onMount(() => {
    let disposed = false;
    const cleanup: (() => void)[] = [];

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0805);
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);

    // ---- THE COMPLEX (built lazily on the first crossing) ------------------
    let complexScene: THREE.Scene | null = null;
    let erw: ErWorld | null = null;
    const ensureComplex = (): void => {
      if (complexScene) return;
      complexScene = new THREE.Scene();
      complexScene.background = new THREE.Color(0x0d0805);
      // FOG IS THE ROOM TONE (and a perf mercy — the far plate melts into it
      // instead of reading as an empty void). The red phase deepens it.
      complexScene.fog = new THREE.FogExp2(0x0d0805, 0.034);
      erw = buildComplex();
      complexScene.add(erw.group);
      complexCtl = createController(st, erw.controllerWorld);
      // Peer torch beams come from the fixed pool (world.ts) — a toggling
      // flashlight must never change the light count and recompile the
      // complex mid-frame.
      cleanup.push(installAvatarTorchPool(complexScene));
      // The hazmat rig + clips, warmed before the first body needs them —
      // the same call the casino floor makes.
      void ensureHazmat();
      // …and a hidden body wearing them, parked under the floor: it keeps the
      // suit's materials in this renderer's program cache, so the FIRST peer
      // walking in doesn't compile the rig mid-frame (each WebGLRenderer has
      // its own cache — the casino hall's warm programs don't carry over).
      const warmBody = makeAvatar(complexScene, "", "yellow");
      warmBody.group.visible = false;
      warmBody.group.position.set(0, -60, 0);
      // The local torch: the backrooms beam, camera-carried.
      localTorch = new THREE.SpotLight(0xfff0c8, 0, 20, 0.5, 0.65, 1.0);
      localTorchTarget = new THREE.Object3D();
      localTorch.target = localTorchTarget;
      complexScene.add(localTorch);
      complexScene.add(localTorchTarget);
    };
    let localTorch: THREE.SpotLight | null = null;
    let localTorchTarget: THREE.Object3D | null = null;
    let torchOn = false;
    // THE PREWARM (the casino hall's rule, Aug 2026): compile the complex's
    // materials in the background instead of at first sight — the monster's
    // reveal, the red-light state and every late-loading GLB used to compile
    // on the render thread mid-scare. Staged passes because the complex's
    // models land over the first seconds; each pass only compiles what's new
    // (compileAsync links off-thread via KHR_parallel_shader_compile).
    let warmTimers: ReturnType<typeof setTimeout>[] = [];
    const warmComplex = (): void => {
      for (const t of warmTimers) clearTimeout(t);
      warmTimers = [];
      for (const delay of [400, 2500, 8000]) {
        warmTimers.push(setTimeout(() => {
          if (!complexScene) return;
          try {
            void renderer.compileAsync(complexScene, camera).catch(() => {});
          } catch {
            // a refusing driver just keeps the old first-use compiles
          }
        }, delay));
      }
    };
    cleanup.push(() => { for (const t of warmTimers) clearTimeout(t); });
    let walkieKeyed = false;
    // Held-item machinery — the backrooms' own (see BackroomsGame): the model
    // hangs off a CAMERA-parented holder, and the arm IKs to it.
    let heldHolder: THREE.Group | null = null;
    let heldObj: THREE.Object3D | null = null;
    let heldKind = "";
    let heldRaise = 0;
    let lastEq = "";
    const ARM_TARGET = new THREE.Vector3();
    /** [x,y,z,pitch,yaw,roll] camera-space, [stow, use] — the backrooms
     *  HELD_POSE rows for the kinds this bag can hold, VERBATIM. */
    const HELD_POSE: Record<string, [number[], number[]]> = {
      flashlight: [[0.22, -0.26, -0.36, -0.15, 0.06, 0.1], [0.17, -0.19, -0.42, -0.24, 0.03, 0.05]],
      walkie: [[0.26, -0.44, -0.3, 0.25, -0.15, 0], [0.15, -0.07, -0.16, -0.05, -0.75, 0.35]],
      almondwater: [[0.26, -0.2, -0.42, 0.12, -0.15, -0.08], [0.1, -0.16, -0.3, -0.35, 0, 0]],
    };

    // ---- THE MONSTER + THE HUNT'S NOISE (E4) --------------------------------
    const monPos = { x: 0, y: 0, tx: 0, ty: 0, shown: false };
    let monGroup: THREE.Group | null = null;
    let monMixer: THREE.AnimationMixer | null = null;
    let monIdle: THREE.AnimationAction | null = null;
    let monRun: THREE.AnimationAction | null = null;
    // one load at a time, and none landing after the room closed (Oct 2026
    // review: two welcomes loaded two monsters)
    let monLoading = false;
    const loadMonster = (): void => {
      if (monGroup || monLoading || !complexScene) return;
      monLoading = true;
      const gl = new GLTFLoader();
      gl.load("/assets/er/monster.glb", (g) => {
        monLoading = false;
        if (!complexScene || disposed || monGroup) return;
        monGroup = new THREE.Group();
        const body = g.scene;
        lambertify(body); // the world's material rule — skinned meshes included
        const bb = new THREE.Box3().setFromObject(body);
        body.position.y = -bb.min.y;
        monGroup.add(body);
        monGroup.visible = false;
        complexScene.add(monGroup);
        warmComplex(); // its materials compile NOW, not at the first reveal
        monMixer = new THREE.AnimationMixer(body);
        if (g.animations[0]) {
          monIdle = monMixer.clipAction(g.animations[0]);
          monIdle.play();
        }
        gl.load("/assets/er/monster-run.glb", (r) => {
          if (monMixer && r.animations[0]) monRun = monMixer.clipAction(r.animations[0]);
        });
      });
    };
    let stopAlarm: (() => void) | null = null;
    let stopChase: (() => void) | null = null;
    let chaseGainAt = 0;
    const setAlarm = (on: boolean): void => {
      if (on && !stopAlarm) stopAlarm = playSfxLoop("er-alarm", 10 * 60_000, 0.28);
      if (!on && stopAlarm) { stopAlarm(); stopAlarm = null; }
    };
    const setChase = (on: boolean): void => {
      // A TENSION loop, per Josh ("just have it loop properly to keep the
      // tension going") — steady, not positional.
      if (on && !stopChase) stopChase = playSfxLoop("er-chase", 10 * 60_000, 0.25);
      if (!on && stopChase) { stopChase(); stopChase = null; }
    };
    cleanup.push(() => { setAlarm(false); setChase(false); });
    void chaseGainAt;
    const applyHunt = (phase: typeof huntPhase, den?: string): void => {
      huntPhase = phase;
      const red = phase === "telegraph" || phase === "hunt" || phase === "retreat";
      erw?.setHuntLights(red ? "red" : "calm");
      // The dark arrives with the alarms: the fog closes in and goes to
      // blood, the background with it (Josh: "dark, only being illuminated
      // by the red lights flashing").
      if (complexScene?.fog instanceof THREE.FogExp2) {
        complexScene.fog.color.setHex(red ? 0x060101 : 0x0d0805);
        complexScene.fog.density = red ? 0.052 : 0.034;
        (complexScene.background as THREE.Color).setHex(red ? 0x060101 : 0x0d0805);
      }
      setAlarm(mode === "complex" && (phase === "telegraph" || phase === "hunt"));
      setChase(mode === "complex" && (phase === "hunt" || phase === "retreat"));
      if (monGroup) monGroup.visible = phase === "hunt" || phase === "retreat";
      // The chosen shutter stands open for the whole red act; the others
      // stay down. Calm closes everything.
      for (const d of ["den-west", "den-mid", "den-east"])
        erw?.setShutter(d, red && d === den);
    };

    // YOUR OWN BODY — the backrooms viewmodel, exactly as the casino hall
    // mounts it: in the SCENE, not on the camera. One body, moved between
    // the ante and the complex on crossings.
    let viewmodel: Viewmodel | null = null;
    const mySuit = localStorage.getItem("solace_suit") || "yellow";
    void ensureHazmat().then(() => {
      viewmodel = makeViewmodel(mySuit);
      if (viewmodel) {
        (mode === "complex" && complexScene ? complexScene : scene).add(viewmodel.group);
      }
    });
    // THE CAMERA RIDES IN THE LIVE SCENE (Oct 2026 review): the held item
    // hangs off it, and three.js draws only what is under the scene being
    // rendered — a parentless camera's children were never drawn, so nothing
    // you held showed in first person.
    const parentCamera = (): void => {
      const live = mode === "complex" && complexScene ? complexScene : scene;
      if (camera.parent !== live) {
        camera.parent?.remove(camera);
        live.add(camera);
      }
    };
    parentCamera();
    const moveViewmodel = (): void => {
      parentCamera();
      if (!viewmodel) return;
      viewmodel.group.parent?.remove(viewmodel.group);
      (mode === "complex" && complexScene ? complexScene : scene).add(viewmodel.group);
    };
    let crouchAmt = 0;
    let bobT = 0;
    // THE JUMP — the hall's exact numbers (4.6 m/s takeoff, 12 gravity, a
    // hard landing step). The complex is flat, so the ballistics are simple.
    let airborne = false;
    let jumpY = 0;
    let vy = 0;
    // FOOTSTEPS — surface-aware, both banks the SAME onset-sliced machinery
    // (steps.ts makeStepBank): the hall's carpet everywhere the complex wears
    // the casino's carpet (the ante, the open halls), Josh's wood-floor
    // recording inside the BEDROOM islands (Josh: "bedrooms having wood
    // floors"). Local strides by distance walked; every peer's feet too,
    // faded over 16m — each pair of feet keyed to the floor UNDER THEM.
    const woodSteps = makeStepBank("/assets/er/steps-wood.ogg");
    woodSteps.load();
    loadSteps(); // the casino carpet bank
    warmGearSfx(); // the backrooms gear sounds, decoded before the first click
    const stepAt = (xm: number, zm: number): ((gain: number, run: boolean) => void) => {
      if (mode !== "complex") return stepSound;
      const cx = Math.floor(xm / 2), cy = Math.floor(zm / 2);
      const island =
        ROOMS.some((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1) ||
        DENS.some((d) => cx >= d.x0 && cx <= d.x1 && cy >= d.y0 && cy <= d.y1);
      return island ? woodSteps.step : stepSound;
    };
    let strideAcc = 0;
    const peerStride = new Map<number, { acc: number; lx: number; lz: number }>();
    const antePeerStride = new Map<number, { acc: number; lx: number; lz: number }>();

    // ---- proximity voice (the backrooms spatial graph, escape room) --------
    let voice: ProximityVoice | null = null;
    const erGrant = async (): Promise<{ token: string; url: string }> => {
      const r = await fetch("/api/escape/voice-token", {
        method: "POST",
        headers: { authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!r.ok) throw new Error("no_voice");
      return r.json();
    };
    // one join in flight (Oct 2026 review: two welcomes started two joins,
    // and the first's room and audio graph leaked for the session)
    let voiceJoining = false;
    const joinVoice = (): void => {
      if (voice || voiceJoining) return;
      voiceJoining = true;
      void joinProximityVoice(erGrant).then((r) => {
        voiceJoining = false;
        if (!r.ok) return;
        if (voice) { r.voice.leave(); return; }
        // Left the complex (or unmounted) while connecting → hang up NOW.
        // The old bare return left a hot mic and a live audio graph running
        // with nobody holding the handle (Aug 2026 perf review).
        if (disposed || mode !== "complex") { r.voice.leave(); return; }
        voice = r.voice;
        voice.applyAudio({
          micGain: brSettings.micGain,
          micSensitivity: brSettings.micSensitivity,
          neuralNS: brSettings.neuralNS,
          voiceVolume: brSettings.voiceVolume,
          inputDevice: brSettings.inputDevice,
          outputDevice: brSettings.outputDevice,
        });
      }).catch(() => { voiceJoining = false; /* no LiveKit / no mic = a quiet complex, like the floor */ });
    };
    const leaveVoiceZone = (): void => {
      voice?.leave();
      voice = null;
    };
    cleanup.push(leaveVoiceZone);

    // ---- the zone wire ------------------------------------------------------
    // Peers are THE hazmat bodies — makeAvatar/tickAvatar straight from the
    // backrooms, exactly as the casino hall does it. Suit recolors, name
    // tags, locomotion from travel, torches that actually throw light: all
    // inherited, none reimplemented.
    let ws: WebSocket | null = null;
    type PeerData = { id: number; name: string; suit?: string; x: number; y: number; yaw: number; p: number; eq?: string };
    /** The complex's bodies (in complexScene) and the ante's (in the ante
     *  scene) — two maps, one avatar code path. Only the map for the space
     *  this body stands in is ever live. */
    const peers = new Map<number, PeerAvatar>();
    const antePeers = new Map<number, PeerAvatar>();
    /** In the ante a torch is just carried — a lit one would claim a slot
     *  from the COMPLEX's fixed torch pool (world.ts keeps one pool), and
     *  the ante's light count must never move either. */
    const anteEq = (eq: string): string => (eq.endsWith("!") ? eq.slice(0, -1) : eq);
    const addTo = (map: Map<number, PeerAvatar>, sc: THREE.Scene | null, pd: PeerData, isAnte: boolean): void => {
      if (!sc) return;
      // A replacement (a refresh, a second tab) re-joins the same id with no
      // bye in between — de-dupe, or the old body stands there frozen.
      dropFrom(map, sc, pd.id);
      const a = makeAvatar(sc, pd.name, pd.suit || "yellow");
      a.target.set(pd.x * 2, 0, pd.y * 2);
      a.group.position.copy(a.target);
      a.group.rotation.y = pd.yaw;
      a.heading = pd.yaw;
      a.pose = pd.p;
      if (pd.eq) setAvatarEquip(a, isAnte ? anteEq(pd.eq) : pd.eq);
      map.set(pd.id, a);
    };
    const dropFrom = (map: Map<number, PeerAvatar>, sc: THREE.Scene | null, id: number): void => {
      const a = map.get(id);
      if (a && sc) disposeAvatar(sc, a);
      map.delete(id);
    };
    const addPeer = (pd: PeerData): void => addTo(peers, complexScene, pd, false);
    const dropPeer = (id: number): void => { dropFrom(peers, complexScene, id); peerStride.delete(id); };
    const addAntePeer = (pd: PeerData): void => addTo(antePeers, scene, pd, true);
    const dropAntePeer = (id: number): void => { dropFrom(antePeers, scene, id); antePeerStride.delete(id); };
    const clearAntePeers = (): void => { for (const id of [...antePeers.keys()]) dropAntePeer(id); };
    const clearPeers = (): void => { for (const id of [...peers.keys()]) dropPeer(id); };
    /** A wire position onto an avatar — with the true wire speed (the
     *  casino's smoothing), which picks run vs walk clips; without it every
     *  sprinting peer ambled. */
    const applyPos = (a: PeerAvatar, m: { x: number; y: number; yaw: number; p?: number }): void => {
      const now = performance.now();
      if (a.lastPosAt) {
        const dtw = (now - a.lastPosAt) / 1000;
        if (dtw > 0.01) {
          const sp = Math.hypot(m.x * 2 - a.target.x, m.y * 2 - a.target.z) / dtw;
          a.wireSpeed = a.wireSpeed * 0.6 + sp * 0.4;
        }
      }
      a.lastPosAt = now;
      a.target.set(m.x * 2, 0, m.y * 2);
      a.heading = m.yaw;
      a.pose = m.p ?? 0;
    };
    /** Whether this window's ante is shared (false once another window took
     *  the body over, or while this one is inside the complex elsewhere). */
    let anteShared = true;
    let zoneRetry: ReturnType<typeof setTimeout> | undefined;
    let zoneBackoff = 1500;
    cleanup.push(() => clearTimeout(zoneRetry));
    const sendAnteEnter = (): void => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ante-enter", suit: mySuit }));
    };
    const applyKeyState = (): void => {
      if (!erw) return;
      if (keyState?.state === "loose" && keyState.pos)
        erw.setKey({ x: keyState.pos.x * 2, z: keyState.pos.y * 2 });
      else erw.setKey(null);
    };
    const openZone = (): void => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws-escape?token=${getToken() ?? ""}`);
      // The ante is shared from the moment the room mounts (it used to be a
      // private scene, and the socket opened only at the complex door).
      ws.addEventListener("open", () => {
        zoneBackoff = 1500;
        if (anteShared && mode === "ante") sendAnteEnter();
      });
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.type === "denied" && (m.error === "in_complex" || m.error === "ante_full")) {
          // The ante's own refusals: this window stays a private view.
          anteShared = false;
          clearAntePeers();
          if (m.error === "in_complex") say("you're inside the complex in another window");
          return;
        }
        if (m.type === "denied") {
          wantEnter = false;
          if (m.error === "exit_locked") say("the exit is locked — find the key");
          else if (m.error === "bag_full") say("your bag is full — the key needs a slot");
          else if (m.error === "gun_carried") say("the gun stays in the casino locker");
          else if (m.error === "replaced") { reseatToAnte(); say("you entered from another window"); }
          else if (m.error === "lockdown") say("the alarms are ringing — the door opens when the lights come back");
          else if (m.error === "block_locked") say("that block is locked down — find an open letter");
          else if (m.error === "no_pass") say("the door wants a pass");
          else if (m.error === "no_opens") say("your hands are done for today — ten chests a day");
          else say(`refused: ${m.error}`); // NEVER silent — a swallowed refusal
          // reads as a broken door (found the hard way, in production).
          return;
        }
        if (m.type === "welcome") {
          wantEnter = false;
          ensureComplex();
          myId = m.you?.id ?? 0;
          lastEq = ""; // the server starts every body empty-handed
          if (typeof m.opens === "number") opensToday = m.opens;
          if (typeof m.opensMax === "number") opensMax = m.opensMax;
          keyState = m.key;
          exitUntil = m.exitUntil ?? 0;
          holdKey = m.key?.state === "held" && m.key.by === myId;
          clearPeers();
          // Out of the ante: its bodies stay behind (the server already told
          // them this one left).
          clearAntePeers();
          for (const pd of m.peers ?? []) addPeer(pd);
          if (erw) for (const room of m.doors ?? []) erw.setDoor(room, true);
          chestList = m.chests ?? [];
          erw?.setChests(chestList.map((c) => ({ id: c.id, x: c.x * 2, z: c.y * 2 })));
          applyKeyState();
          erw?.setExitOpen(exitUntil > Date.now());
          // The crossing proper: onto the seat THE SERVER chose (a spread
          // round the stub's mouth, or — resuming from another window —
          // exactly where the body stood). Seating ourselves at the entry
          // stacked every arrival inside each other and desynced a resume.
          const seat = m.you ?? {};
          st.x = Number.isFinite(seat.x) ? seat.x : 27;
          st.y = Number.isFinite(seat.y) ? seat.y : 21.2;
          st.yaw = Number.isFinite(seat.yaw) ? seat.yaw : 0;
          lastNet = { x: st.x, z: st.y, yaw: st.yaw, p: 0 };
          mode = "complex";
          moveViewmodel();
          joinVoice();
          if (m.hunt) {
            huntUntil = m.hunt.until ?? 0;
            huntBlocks = m.hunt.blocks ?? [];
            applyHunt(m.hunt.phase, m.hunt.den);
            if (m.hunt.mon) { monPos.x = monPos.tx = m.hunt.mon.x * 2; monPos.y = monPos.ty = m.hunt.mon.y * 2; }
          }
          loadMonster();
          warmComplex();
          return;
        }
        // ---- THE SHARED ANTE ----
        if (m.type === "ante-welcome") {
          // The server seated this body in the ante: on arrival, and again
          // after walking out of (or dying in) the complex.
          if (mode === "complex") reseatToAnte();
          anteShared = true;
          myId = m.you?.id ?? myId;
          const seat = m.you ?? {};
          if (Number.isFinite(seat.x)) st.x = seat.x;
          if (Number.isFinite(seat.y)) st.y = seat.y;
          if (Number.isFinite(seat.yaw)) st.yaw = seat.yaw;
          lastNet = { x: st.x, z: st.y, yaw: st.yaw, p: 0 };
          lastEq = ""; // every space starts the hand empty on the wire
          clearAntePeers();
          for (const pd of m.peers ?? []) addAntePeer(pd);
          return;
        }
        if (m.type === "ante-join") { addAntePeer(m.peer); return; }
        if (m.type === "ante-bye") { dropAntePeer(m.id); return; }
        if (m.type === "ante-pos") {
          const a = antePeers.get(m.id);
          if (a) applyPos(a, m);
          return;
        }
        if (m.type === "ante-equip") {
          const a = antePeers.get(m.id);
          if (a) setAvatarEquip(a, anteEq(m.eq ?? ""));
          return;
        }
        if (m.type === "ante-replaced") {
          // Another window took this body over; this one goes quiet.
          anteShared = false;
          clearAntePeers();
          say("the escape room is open in another window");
          return;
        }
        if (m.type === "join") { addPeer(m.peer); return; }
        if (m.type === "bye") { dropPeer(m.id); return; }
        if (m.type === "pos") {
          const a = peers.get(m.id);
          if (a) applyPos(a, m);
          return;
        }
        if (m.type === "equip") {
          const a = peers.get(m.id);
          if (a) setAvatarEquip(a, m.eq ?? "");
          return;
        }
        if (m.type === "key") {
          if (m.state === "taken") {
            holdKey = m.by === undefined ? holdKey : m.by === myId;
            keyState = { state: "held", by: m.by };
            say(m.by === myId ? "THE KEY IS YOURS — get to the exit" : `${m.name ?? "someone"} has the key`);
            // The pickup is HEARD (Josh, Aug 2026) — the relic chime, the
            // backrooms' own found-treasure sound.
            if (m.by === myId) { gearSfx("relic"); void refresh(); }
          } else {
            // spawned / moved
            if (holdKey) { holdKey = false; void refresh(); }
            const room = m.room;
            const r = ROOMS.find((q) => q.id === room);
            keyState = { state: "loose", room, pos: r ? { x: (r.x0 + r.x1 + 1) / 2, y: (r.y0 + r.y1 + 1) / 2 } : null };
            say(m.state === "spawned" ? "a fresh key waits somewhere" : `the key has moved — ${m.why ?? ""}`);
          }
          applyKeyState();
          return;
        }
        if (m.type === "exit") {
          exitUntil = m.until;
          erw?.setExitOpen(exitUntil > Date.now());
          if (m.until > 0) { say(`${m.by} opened the exit — RUN`); holdKey = false; void refresh(); }
          return;
        }
        if (m.type === "door") { erw?.setDoor(m.room, m.open); return; }
        if (m.type === "teleport") {
          // The lockdown put you out of a room that isn't in tonight's act
          // — in front of its door, which is now shut behind you.
          st.x = Number(m.x) || st.x;
          st.y = Number(m.y) || st.y;
          say("the room turns you out — the lockdown has begun");
          return;
        }
        if (m.type === "hunt") {
          huntUntil = m.until ?? 0;
          huntBlocks = m.blocks ?? [];
          applyHunt(m.phase, m.den);
          if (m.phase === "telegraph") say(`LOCKDOWN — open blocks: ${huntBlocks.join(", ")}. FIND A ROOM. SHUT THE DOOR.`);
          else if (m.phase === "hunt") say("it is OUT. shut a door.");
          else if (m.phase === "calm") say("the lights return. it went home.");
          if (m.mon) { monPos.tx = m.mon.x * 2; monPos.ty = m.mon.y * 2; monPos.x = monPos.tx; monPos.y = monPos.ty; }
          loadMonster();
          return;
        }
        if (m.type === "mon") {
          monPos.tx = m.x * 2;
          monPos.ty = m.y * 2;
          if (!monPos.shown) { monPos.x = monPos.tx; monPos.y = monPos.ty; monPos.shown = true; }
          return;
        }
        if (m.type === "killed") {
          if (m.id !== myId) {
            say(`${m.name} was taken.`);
            // The kill is HEARD (Josh's gore recording) — faded with the
            // distance to where they stood, so a far scream stays a rumor.
            const a = peers.get(m.id);
            const d = a ? Math.hypot(a.group.position.x - mx(), a.group.position.z - mz()) : 24;
            playSfx("er-gore", Math.max(0.12, Math.min(0.85, 1 - d / 36)));
          }
          return;
        }
        if (m.type === "debug") {
          if (m.op === "mon-freeze") monFrozen = !!m.frozen;
          if (m.op === "state") debugState = JSON.stringify({ hunt: m.hunt, bodies: m.bodies, doors: m.doors }, null, 1);
          return;
        }
        if (m.type === "chest") {
          if (m.state === "opened") chestList = chestList.filter((c) => c.id !== m.id);
          else chestList = [...chestList, { id: m.id, room: m.room, x: m.x, y: m.y }];
          erw?.setChests(chestList.map((c) => ({ id: c.id, x: c.x * 2, z: c.y * 2 })));
          return;
        }
        if (m.type === "loot") {
          // The lid is HEARD (Josh, Aug 2026) — the mystery box's creak, the
          // one box-opening sound the bank already owns.
          playSfx("mystery-open", 0.75);
          opensToday = m.opens;
          opensMax = m.opensMax;
          lootToast = { tier: m.tier, kind: m.kind, amount: m.amount, skin: m.skin };
          clearTimeout(lootTimer);
          lootTimer = setTimeout(() => (lootToast = null), 5200);
          void refresh(); // wallet chip; spins/chips/pulls land server-side
          return;
        }
        if (m.type === "left") {
          reseatToAnte();
          void refresh();
          return;
        }
        if (m.type === "consumed") {
          // Server-confirmed, never optimistic — the backrooms' consume shape.
          if (m.item === "almond") {
            gearSfx("drink");
            say("almond water — cold, sweet, steadying");
          } else say("consumed");
          void refresh();
          return;
        }
        if (m.type === "drink") {
          // The room hears a swig happened; the pouring animation rides the
          // avatar equip pass in a later slice.
          return;
        }
        if (m.type === "dead") {
          playSfx("er-gore", 0.9); // your own ending, at full volume
          killedFlash = true;
          setTimeout(() => (killedFlash = false), 1400);
          reseatToAnte();
          applyHunt("calm");
          say("you died in there. the pass died with you.");
          void refresh();
          return;
        }
      };
      ws.onclose = (ev) => {
        clearAntePeers();
        // The shared ante survives a blip: reconnect (backing off) and sit
        // back down. Never after a kick, and never once this window has
        // handed the body to another one.
        if (!disposed && ev.code !== 4003) {
          clearTimeout(zoneRetry);
          zoneRetry = setTimeout(() => {
            if (disposed || !anteShared) return;
            openZone();
          }, zoneBackoff);
          zoneBackoff = Math.min(30_000, zoneBackoff * 2);
        }
        if (mode === "complex") {
          // The socket-death path needs the FULL teardown the dead/left
          // handlers do (Aug 2026 review): without the reseat the body kept
          // complex cells in the ante's little box (the corpse-in-the-void
          // bug, again), the proximity-voice connection stayed live with a
          // hot mic, and the alarm/chase loops played over the ante.
          reseatToAnte();
          say("the complex went quiet — connection lost");
        }
        // A socket that died before any welcome means the DOOR itself is
        // unreachable (a proxy that doesn't route /ws-escape did exactly
        // this in production, silently). NEVER silent — same law as denied.
        else if (wantEnter) { wantEnter = false; say("the complex door isn't answering — tell the house"); }
      };
    };
    cleanup.push(() => { ws?.close(); ws = null; });
    /** ONE teardown for every way a body lands back in the ante — walked out,
     *  died, replaced, socket death. The reseat into the ante's own
     *  coordinate space (the corpse-in-the-void lesson), gear down, voice
     *  off, hunt sounds off, and the key/exit chrome cleared: a stale
     *  "THE KEY" chip or a frozen "EXIT IS OPEN" banner used to pin to the
     *  ante screen after dying with the key (Aug 2026 review). */
    const reseatToAnte = (): void => {
      mode = "ante";
      // The server's ante-welcome follows with the real seat (and the room's
      // bodies); this is the fallback when nothing does (a dead socket).
      st.x = (RW / 2) / 2;
      st.y = 1.1;
      st.yaw = Math.PI;
      lastNet = { x: st.x, z: st.y, yaw: st.yaw, p: 0 };
      clearPeers();
      // A window that was a private view of the ante (the body was inside
      // elsewhere) asks to share it again; the server says no if it must.
      if (!anteShared) { anteShared = true; sendAnteEnter(); }
      torchOn = false;
      walkieKeyed = false;
      if (localTorch) localTorch.intensity = 0;
      moveViewmodel();
      leaveVoiceZone();
      setAlarm(false);
      setChase(false);
      holdKey = false;
      exitUntil = 0;
      exitLeft = 0;
    };
    let myId = 0;
    let wantEnter = false;
    const enterComplex = (): void => {
      wantEnter = true;
      ensureComplex();
      openZone();
      const sendEnter = (): void => ws?.send(JSON.stringify({ type: "enter", suit: mySuit }));
      if (ws && ws.readyState === WebSocket.OPEN) sendEnter();
      else if (ws) ws.addEventListener("open", sendEnter, { once: true });
    };
    // Wire-position cadence (cells on the wire, like the hall's).
    let lastNetAt = 0;
    let lastNet = { x: 0, z: 0, yaw: 0, p: 0 };

    // THE SHARED BODY. One PlayerState in CELLS, driven by the backrooms
    // controller — the same speeds, radius, sensitivity and rebinds as every
    // other first-person mode (the uniformity law). Two ControllerWorlds:
    // the ante-room's little box, and the complex from er-world. Mode
    // switches swap the world and re-seat the state in that space's coords.
    const st: PlayerState = { x: (RW / 2) / 2, y: (RD - 2.2) / 2, yaw: 0, pitch: 0, moving: false, alt: 0 };
    /** Metres, for every proximity check and the camera. */
    const mx = (): number => st.x * 2;
    const mz = (): number => st.y * 2;
    const anteWorld: ControllerWorld = {
      mapSize: 16,
      effStepsAt: () => 0,
      // The ante box: cells 0..RW/2 × 0..RD/2, walls on the perimeter.
      wallNAt: (x, y) => y === 0 || y === RD / 2,
      wallWAt: (x, y) => x === 0 || x === RW / 2,
      solidAt: (x, y) => x < 0 || y < 0 || x >= RW / 2 || y >= RD / 2,
      propsNear(x, y) {
        const out: { x: number; y: number; rx: number; ry: number }[] = [];
        for (const c of colliders) {
          const px = (c.x0 + c.x1) / 2 / 2, py = (c.z0 + c.z1) / 2 / 2;
          if (Math.abs(px - x) > 3 || Math.abs(py - y) > 3) continue;
          out.push({ x: px, y: py, rx: (c.x1 - c.x0) / 2 / 2, ry: (c.z1 - c.z0) / 2 / 2 });
        }
        return out;
      },
    };
    const anteCtl = createController(st, anteWorld);
    let complexCtl: ReturnType<typeof createController> | null = null;
    const activeCtl = (): ReturnType<typeof createController> =>
      mode === "complex" && complexCtl ? complexCtl : anteCtl;

    // Review hooks, the __cas pattern: drive the overlays and park the eye
    // without a pointer lock (headless verification can't hold one).
    goHook = (x, z, yaw) => { st.x = x / 2; st.y = z / 2; st.yaw = yaw; };
    cleanup.push(() => { goHook = null; });
    (window as unknown as { __er?: unknown }).__er = {
      counter: () => (counterOpen = true),
      locker: () => (lockerOpen = true),
      casLocker: () => (casLockerOpen = true),
      close: () => { counterOpen = false; lockerOpen = false; casLockerOpen = false; menuOpen = false; },
      state: () => ({ coins, inv: [...inv], locker: [...locker], mode, holdKey, exitUntil, key: keyState, chests: [...chestList], opens: opensToday }),
      /** Metres in, cells stored — the hook keeps its old contract. */
      go: (x: number, z: number, yaw: number, pitch = 0) => {
        st.x = x / 2; st.y = z / 2; st.yaw = yaw; st.pitch = pitch;
      },
      dbg: (op: string) => dbg(op),
      enter: () => enterComplex(),
      /** Review-only: walk a DEAD copy of the complex with no server — the
       *  scene, doors, furniture and lighting, none of the wire. */
      preview: () => { ensureComplex(); mode = "complex"; st.x = 27; st.y = 21.2; moveViewmodel(); },
      /** Review-only: drive the hunt LIGHTING locally (no monster, no wire). */
      huntFx: (phase: "calm" | "hunt") => applyHunt(phase === "hunt" ? "hunt" : "calm"),
      /** Review-only: the raw complex scene, for measuring — never gameplay. */
      scene: () => complexScene,
      /** Review-only: who this window is drawing, in each space (metres). */
      peers: () => ({
        shared: anteShared,
        seat: { x: st.x, y: st.y, yaw: st.yaw },
        ante: [...antePeers].map(([id, a]) => ({ id, x: a.group.position.x, z: a.group.position.z })),
        complex: [...peers].map(([id, a]) => ({ id, x: a.group.position.x, z: a.group.position.z })),
      }),
      /** Review-only: swing a door locally (no server) to eyeball physics. */
      door: (room: string, open: boolean) => erw?.setDoor(room, open),
      keyTake: () => ws?.send(JSON.stringify({ type: "key-take" })),
      keyUse: () => ws?.send(JSON.stringify({ type: "key-use" })),
      out: () => ws?.send(JSON.stringify({ type: "leave" })),
    };
    cleanup.push(() => delete (window as unknown as { __er?: unknown }).__er);

    const size = (): void => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    window.addEventListener("resize", size);
    cleanup.push(() => window.removeEventListener("resize", size));

    // ---- build the room ----------------------------------------------------
    const texLoader = new THREE.TextureLoader();
    const tex = (url: string, rx: number, ry: number): THREE.Texture => {
      const t = texLoader.load(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      return t;
    };
    // THE ANTE WEARS THE CASINO (Josh: "make sure texturing is the same as the
    // rest of the casino") — the hall's own recipe, imported not copied: wine
    // carpet, walnut wainscot to 1.2m, damask above, the coffered ceiling.
    const WAIN = 1.2;
    const carpet = carpetTex();
    carpet.repeat.set(RW / 2, RD / 2);
    const floorMat = new THREE.MeshLambertMaterial({ map: carpet });
    const coffers = ceilingTex();
    coffers.repeat.set(RW / 2, RD / 2);
    const ceilMat = new THREE.MeshLambertMaterial({ map: coffers });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(RW / 2, 0, RD / 2);
    scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(RW / 2, CEIL_H, RD / 2);
    scene.add(ceil);
    // Each wall = a wainscot band + a damask band (the hall's wallStrip rule:
    // one motif per 2m both ways).
    const damaskBase = damaskTex();
    const mkBand = (w: number, y0: number, y1: number, wood: boolean): THREE.Mesh => {
      const map = wood ? tex("/assets/casino/tex/wood.png", w / 2, (y1 - y0) / 2) : damaskBase.clone();
      if (!wood) { map.repeat.set(w / 2, (y1 - y0) / 2); map.needsUpdate = true; }
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, y1 - y0),
        new THREE.MeshLambertMaterial({ map, color: wood ? WALNUT : 0xffffff }),
      );
      m.position.y = (y0 + y1) / 2;
      return m;
    };
    const mkWallPair = (w: number): THREE.Group => {
      const g = new THREE.Group();
      g.add(mkBand(w, 0, WAIN, true));
      g.add(mkBand(w, WAIN, CEIL_H, false));
      return g;
    };
    const wN = mkWallPair(RW); wN.position.set(RW / 2, 0, 0); scene.add(wN);
    const wS = mkWallPair(RW); wS.position.set(RW / 2, 0, RD); wS.rotation.y = Math.PI; scene.add(wS);
    const wW = mkWallPair(RD); wW.position.set(0, 0, RD / 2); wW.rotation.y = Math.PI / 2; scene.add(wW);
    const wE = mkWallPair(RD); wE.position.set(RW, 0, RD / 2); wE.rotation.y = -Math.PI / 2; scene.add(wE);

    // PHYSICAL LIGHT UNITS (three r155+): the hall's fixtures run intensities
    // in the 20-30s — the first cut used 0.85 and rendered a coal cellar.
    scene.add(new THREE.AmbientLight(0x554636, 1.7));
    const bulbSpots: [number, number][] = [[RW * 0.25, RD * 0.35], [RW * 0.75, RD * 0.35], [RW * 0.25, RD * 0.75], [RW * 0.75, RD * 0.75]];
    for (const [bx, bz] of bulbSpots) {
      const l = new THREE.PointLight(0xffd9a0, 22, 15, 1.7);
      l.position.set(bx, CEIL_H - 0.5, bz);
      scene.add(l);
    }

    // A plaque helper (the hall's style, local copy — text on wood). The text
    // is MEASURED and shrunk to fit: the first cut drew everything at a fixed
    // 64px, so "CASINO LOCKER" shipped as "ASINO LOCKE" and THE COMPLEX as
    // "LEX" (Josh: "fix the signs") — a sign that clips its own name isn't one.
    const plaque = (text: string, sub: string, w = 1.6): THREE.Mesh => {
      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 224;
      const g = cv.getContext("2d")!;
      const fit = (s: string, px: number, weight: string): number => {
        for (; px > 14; px--) {
          g.font = `${weight}${px}px Georgia, serif`;
          if (g.measureText(s).width <= 472) return px;
        }
        return px;
      };
      g.fillStyle = "#181009";
      g.fillRect(0, 0, 512, 224);
      g.strokeStyle = "#8a6a3a";
      g.lineWidth = 4;
      g.strokeRect(8, 8, 496, 208);
      g.textAlign = "center";
      g.fillStyle = "#f0c869";
      fit(text, 64, "bold ");
      g.fillText(text, 256, 100);
      g.fillStyle = "#b9ae97";
      fit(sub, 32, "");
      g.fillText(sub, 256, 165);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.4375), new THREE.MeshBasicMaterial({ map: t }));
    };

    // ---- the two doors -----------------------------------------------------
    const doorway = (label: string, sub: string, sealed: boolean): THREE.Group => {
      const g = new THREE.Group();
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a2a16 });
      const vd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshBasicMaterial({ color: sealed ? 0x140b08 : 0x000000 }));
      vd.position.set(0, 1.25, 0.02);
      g.add(vd);
      for (const s of [-1, 1]) {
        const j = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.64, 0.16), frameMat);
        j.position.set(s * 0.82, 1.32, 0.06);
        g.add(j);
      }
      const lin = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 0.16), frameMat);
      lin.position.set(0, 2.57, 0.06);
      g.add(lin);
      const p = plaque(label, sub);
      p.position.set(0, 3.05, 0.05);
      g.add(p);
      if (sealed) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0x8d2f26 }));
        bar.position.set(0, 1.35, 0.08);
        bar.rotation.z = 0.16;
        g.add(bar);
      }
      return g;
    };
    const complexDoorX = RW / 2 - 1.5; // aligned with DOOR_COMPLEX (cell 26 of 22..31)
    const dC = doorway("THE COMPLEX", "E — ENTER · EXIT NEEDS THE KEY", false);
    dC.position.set(complexDoorX, 0, 0);
    scene.add(dC);
    const dS = doorway("CASINO FLOOR", "E — BACK TO THE HALL", false);
    dS.position.set(RW / 2 - 1.5, 0, RD);
    dS.rotation.y = Math.PI;
    scene.add(dS);

    // ---- the wall map (west wall) -----------------------------------------
    const mapCv = drawWallMap();
    const mapTex = new THREE.CanvasTexture(mapCv);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    const MAP_W = 6.4;
    const MAP_H = MAP_W * (mapCv.height / mapCv.width);
    const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshBasicMaterial({ map: mapTex }));
    mapMesh.rotation.y = Math.PI / 2;
    // PROUD of the frame box (which spans x -0.01..0.07) — at 0.06 the map sat
    // INSIDE the frame and the wall showed a big blank panel.
    mapMesh.position.set(0.085, 1.75, RD / 2);
    scene.add(mapMesh);
    const mapFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, MAP_H + 0.24, MAP_W + 0.24), new THREE.MeshLambertMaterial({ color: 0x3a2a16 }));
    mapFrame.position.set(0.03, 1.75, RD / 2);
    scene.add(mapFrame);
    const mapLight = new THREE.PointLight(0xfff2d8, 10, 8, 1.7);
    mapLight.position.set(1.6, 2.6, RD / 2);
    scene.add(mapLight);

    // ---- Sterling's counter (north-east quarter) ---------------------------
    const COUNTER = { x: RW * 0.72, z: 2.1, w: 2.6, d: 0.75 };
    {
      const wood = new THREE.MeshLambertMaterial({ map: tex("/assets/casino/tex/wood.png", 2, 1) });
      const top = new THREE.Mesh(new THREE.BoxGeometry(COUNTER.w, 0.08, COUNTER.d), wood);
      top.position.set(COUNTER.x, 1.06, COUNTER.z);
      scene.add(top);
      const body = new THREE.Mesh(new THREE.BoxGeometry(COUNTER.w, 1.02, COUNTER.d - 0.1), new THREE.MeshLambertMaterial({ color: 0x2e2013 }));
      body.position.set(COUNTER.x, 0.51, COUNTER.z);
      scene.add(body);
      const p = plaque("STERLING", "EXPEDITION SUPPLIES · 100 EA");
      p.position.set(COUNTER.x, 2.5, 0.05);
      scene.add(p);
      // Sterling himself — the same body as the casino barman (sterling-model.ts,
      // drawn from the Trader portrait), on a low duckboard so his belly gear
      // clears this counter the way it clears the bar's.
      const RISER = 0.12;
      const duck = new THREE.Mesh(new THREE.BoxGeometry(1.6, RISER, 0.7), new THREE.MeshLambertMaterial({ color: 0x4a2f1a }));
      duck.position.set(COUNTER.x, RISER / 2, COUNTER.z - 0.85);
      scene.add(duck);
      const fig = buildSterlingFigure();
      fig.group.position.set(COUNTER.x, RISER, COUNTER.z - 0.85);
      scene.add(fig.group);
      // he breathes, watches you, blinks, tips his hat and polishes glasses
      // (sterling-model.ts), and the grill flickers while he talks, like the bar's
      let mouthMs = 0;
      const lookAt = new THREE.Vector3();
      sterlingTalk = (text: string): void => { mouthMs = sterlingMurmur(text); };
      sterlingTick = (dt: number): void => {
        fig.tick(dt, { look: mode === "ante" ? lookAt.set(mx(), EYE, mz()) : null, talking: mouthMs > 0 });
        if (mouthMs > 0) {
          mouthMs -= dt * 1000;
          fig.mouth.color.setHex(mouthMs <= 0 ? STERLING_MOUTH : Math.sin(mouthMs / 42) > 0 ? 0xffd98a : 0xc97e2a);
        }
      };
    }

    // ---- the two lockers (east wall) + signs ------------------------------
    const colliders: { x0: number; z0: number; x1: number; z1: number }[] = [
      { x0: COUNTER.x - COUNTER.w / 2 - 0.25, z0: 0, x1: COUNTER.x + COUNTER.w / 2 + 0.25, z1: COUNTER.z + COUNTER.d / 2 + 0.1 },
    ];
    const LOCKER_CAS = { x: RW - 0.35, z: RD * 0.38 };
    const LOCKER_ER = { x: RW - 0.35, z: RD * 0.62 };
    new GLTFLoader().load("/assets/casino/locker.glb", (gltf) => {
      if (disposed) return;
      // THE HALL'S OWN CABINET, worn the hall's way (Josh: "make the casino
      // locker the same as the one in the casino"): the same material rebuild
      // the hall does in loadCasinoAssets — Lambert with the model's map and
      // its SIDEDNESS carried (the single-shell cabinet renders inside-out
      // without `side`), NearestFilter to match the room. Raw PBR under this
      // lighting was the grey slab Josh saw. Natural model scale, like the
      // hall's placement — no shrinking.
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const lam = (mat: THREE.Material): THREE.Material => {
          const std = mat as THREE.MeshStandardMaterial;
          const map = std.map ?? null;
          if (map) map.magFilter = THREE.NearestFilter;
          return new THREE.MeshLambertMaterial({
            map,
            color: map ? 0xffffff : (std.color ?? new THREE.Color(0xdddddd)),
            transparent: std.transparent ?? false,
            opacity: std.opacity ?? 1,
            side: std.side ?? THREE.FrontSide,
            forceSinglePass: true, // never three's two-pass transparency (three-hygiene)
          });
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(lam) : lam(mesh.material as THREE.Material);
      });
      for (const [spot, lz] of [[LOCKER_CAS, 0], [LOCKER_ER, 0]] as const) {
        void lz;
        const m = gltf.scene.clone(true);
        const bb2 = new THREE.Box3().setFromObject(m);
        m.position.set(spot.x - (bb2.max.x + bb2.min.x) / 2, -bb2.min.y, spot.z - (bb2.max.z + bb2.min.z) / 2);
        m.rotation.y = -Math.PI / 2; // face into the room from the east wall
        scene.add(m);
        colliders.push({ x0: spot.x - 0.6, z0: spot.z - 0.8, x1: RW, z1: spot.z + 0.8 });
      }
    }, undefined, () => { /* the room stands without its cabinets */ });
    const pCas = plaque("CASINO LOCKER", "THE GUN STAYS HERE", 1.5);
    pCas.rotation.y = -Math.PI / 2;
    pCas.position.set(RW - 0.06, 2.35, LOCKER_CAS.z);
    scene.add(pCas);
    const pEr = plaque("ESCAPE ROOM LOCKER", "WHAT YOU STORE SURVIVES YOU", 1.5);
    pEr.rotation.y = -Math.PI / 2;
    pEr.position.set(RW - 0.06, 2.35, LOCKER_ER.z);
    scene.add(pEr);

    // ---- THE SHARED ANTE ----------------------------------------------------
    // The first peer to walk in must not compile the suit mid-frame: a body
    // wearing it, parked under the carpet (visible, so compileAsync walks it —
    // it only visits visible objects), then one off-thread compile of the
    // whole room. The ante's light count is fixed at build (four bulbs and
    // the map lamp); peer torches here are carried, never lit, so nothing a
    // peer does ever changes it.
    void ensureHazmat().then(() => {
      if (disposed) return;
      const warm = makeAvatar(scene, "", "yellow");
      warm.group.position.set(RW / 2, -60, RD / 2);
      const t = setTimeout(() => {
        if (disposed) return;
        try {
          void renderer.compileAsync(scene, camera).catch(() => {});
        } catch {
          // a refusing driver just keeps the old first-use compiles
        }
      }, 600);
      cleanup.push(() => clearTimeout(t));
    });
    // The socket opens with the room now, not at the complex door.
    openZone();

    // ---- pointer lock + look ----------------------------------------------
    let fallback = false;
    let lastX = 0, lastY = 0;
    const engageFallback = (): void => {
      fallback = true;
      locked = true;
      canvas.style.cursor = "none";
    };
    const grabPointer = (): void => {
      acquirePointerLock(canvas, {
        raw: brSettings.rawMouse,
        env: { hasApi: typeof canvas.requestPointerLock === "function", isMac, isShell: isDesktopShell },
        onFallback: engageFallback,
        onUnlocked: () => {
          lockHint = true;
          setTimeout(() => (lockHint = false), 2600);
        },
      });
    };
    const anyOverlay = (): boolean => menuOpen || counterOpen || lockerOpen || casLockerOpen || debugOpen;
    const dbg = (op: string): void => {
      // The ops ride the zone socket, but the P-menu must work from the
      // ANTE (that's where you stand when the complex is the problem) —
      // so open the socket on demand rather than assuming enter did.
      openZone();
      const fire = (): void => ws?.send(JSON.stringify({ type: "debug", op }));
      if (ws && ws.readyState === WebSocket.OPEN) fire();
      else ws?.addEventListener("open", fire, { once: true });
    };
    dbgHook = dbg;
    cleanup.push(() => { dbgHook = null; });
    const onClick = (): void => {
      if (anyOverlay()) return;
      if (!locked) grabPointer();
    };
    canvas.addEventListener("click", onClick);
    cleanup.push(() => canvas.removeEventListener("click", onClick));
    // LMB USES THE HELD THING — the backrooms' one-button rule: torch
    // toggles, the bottle drinks. (The click-to-lock case is handled above;
    // this only fires while the pointer is already owned.)
    const onMouseDown = (e: MouseEvent): void => {
      if (!locked || anyOverlay() || e.button !== 0) return;
      const held = slotItems[selSlot];
      if (!held) return;
      if (held.kind === "flashlight") {
        torchOn = !torchOn;
        gearSfx(torchOn ? "flashlight-on" : "flashlight-off");
      } else if (held.kind === "almondwater" && mode === "complex") {
        ws?.send(JSON.stringify({ type: "consume", item: "almond" }));
      } else if (held.kind === "key") {
        say("it wants the way out — find the exit");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    cleanup.push(() => document.removeEventListener("mousedown", onMouseDown));
    // The wheel cycles the hotbar (wraps), exactly the backrooms gesture.
    const onWheel = (e: WheelEvent): void => {
      if (!locked || anyOverlay()) return;
      selSlot = (selSlot + (e.deltaY > 0 ? 1 : slotItems.length - 1)) % slotItems.length;
    };
    window.addEventListener("wheel", onWheel);
    cleanup.push(() => window.removeEventListener("wheel", onWheel));
    const onLockChange = (): void => {
      if (fallback) return;
      locked = document.pointerLockElement === canvas;
      // Losing the pointer releases the PTT — an alt-tab can't stick a
      // walkie open (the backrooms' input-drop safety, same rule).
      if (!locked && walkieKeyed) { walkieKeyed = false; gearSfx("radio-off"); }
      // ...and the held movement keys, or the body ran on by itself (Oct
      // 2026 review — the keyups landed in another window)
      if (!locked) dropMoveKeys();
    };
    document.addEventListener("pointerlockchange", onLockChange);
    cleanup.push(() => document.removeEventListener("pointerlockchange", onLockChange));
    const onBlur = (): void => {
      if (walkieKeyed) { walkieKeyed = false; gearSfx("radio-off"); }
      dropMoveKeys();
    };
    window.addEventListener("blur", onBlur);
    cleanup.push(() => window.removeEventListener("blur", onBlur));
    const onMove = (e: MouseEvent): void => {
      if (!locked || anyOverlay()) return;
      let dx: number, dy: number;
      if (fallback) {
        dx = e.movementX !== undefined && e.movementX !== 0 ? e.movementX : e.clientX - lastX;
        dy = e.movementY !== undefined && e.movementY !== 0 ? e.movementY : e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (isTeleport(dx, dy)) return;
        dx *= 1.5; dy *= 1.5;
      } else {
        dx = e.movementX; dy = e.movementY;
      }
      // The controller owns sensitivity and pitch clamps — one feel, every mode.
      activeCtl().onMouse(dx, dy);
    };
    document.addEventListener("mousemove", onMove);
    cleanup.push(() => document.removeEventListener("mousemove", onMove));

    // ---- keys --------------------------------------------------------------
    /** Opening ANY overlay drops the held movement keys — pressing E mid-run
     *  used to leave W stuck in the controller (the overlay gate swallowed
     *  the keyup too), so the body jogged in place behind the UI (Josh,
     *  Aug 2026). */
    const dropMoveKeys = (): void => {
      anteCtl.keys.clear();
      complexCtl?.keys.clear();
    };
    const onKey = (e: KeyboardEvent, down: boolean): void => {
      if (down && e.code === "Escape") {
        // Claimed: nothing past the game acts on it (the Mac kick-out, Sep 2026).
        e.preventDefault();
        e.stopImmediatePropagation();
        if (debugOpen) { debugOpen = false; return; }
        if (counterOpen || lockerOpen || casLockerOpen) { counterOpen = false; lockerOpen = false; casLockerOpen = false; return; }
        menuOpen = !menuOpen;
        if (menuOpen) {
          dropMoveKeys();
          if (document.pointerLockElement) document.exitPointerLock();
        }
        return;
      }
      // THE ADMIN'S P-MENU (Josh: "press p while in the escape rooms to test
      // all the features"). Admin-gated here for the UI; the server enforces.
      // It opens from the ANTE too — the whole point is diagnosing the
      // complex, which you may be locked out of (found the hard way).
      if (down && e.code === "KeyP" && session.user?.isAdmin) {
        debugOpen = !debugOpen;
        if (debugOpen) {
          dropMoveKeys();
          if (document.pointerLockElement) document.exitPointerLock();
        }
        return;
      }
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (typing) return;
      if (anyOverlay()) {
        // Releases still land while a UI is up — a keyup that bounced off
        // this gate is exactly how a movement key got stuck down.
        if (!down) {
          anteCtl.keys.delete(e.code);
          complexCtl?.keys.delete(e.code);
        }
        return;
      }
      if (down && e.code === "KeyE") {
        if (mode === "ante") {
          if (nearCounter()) {
            counterOpen = true;
            dropMoveKeys();
            if (document.pointerLockElement) document.exitPointerLock();
            // Personalized from the one brain — venue "escape" (his old fixed
        // greeting lives in that pool now, alongside his debt disdain).
        sterlingTalk(takeIdle("sterling", "escape") ?? sterlingLine("escape"));
            return;
          }
          if (nearCasLocker()) {
            // The hall's own locker UI — the gun lives here, "0/9 loaded" and
            // all, exactly as it reads from the casino-floor cabinet.
            casLockerOpen = true;
            dropMoveKeys();
            if (document.pointerLockElement) document.exitPointerLock();
            return;
          }
          if (nearErLocker()) {
            lockerOpen = true;
            dropMoveKeys();
            if (document.pointerLockElement) document.exitPointerLock();
            return;
          }
          if (nearCasinoDoor()) { onBack(); return; }
          if (nearComplexDoor()) { enterComplex(); return; }
          return;
        }
        // ---- inside the complex ----
        const ch = nearChest();
        if (ch) { ws?.send(JSON.stringify({ type: "chest-open", id: ch.id })); return; }
        if (nearKey()) { ws?.send(JSON.stringify({ type: "key-take" })); return; }
        if (nearExit()) {
          if (exitUntil > Date.now()) ws?.send(JSON.stringify({ type: "leave" }));
          else if (holdKey) ws?.send(JSON.stringify({ type: "key-use" }));
          else say("locked. find the key.");
          return;
        }
        const aimed = aimedDoor();
        if (aimed) {
          ws?.send(JSON.stringify({ type: "door", room: aimed, open: !erw?.isDoorOpen(aimed) }));
          return;
        }
      }
      // THE HOTBAR — the backrooms' own grammar, verbatim (THE UNIFORMITY
      // LAW): Digit1-5 selects a slot, the WHEEL cycles it, LMB uses what's
      // in hand, V is push-to-talk on a held walkie. No F/G/X toggles — one
      // set of mechanics across every first-person mode.
      if (down && /^Digit[1-9]$/.test(e.code)) {
        const n = Number(e.code.slice(5)) - 1;
        if (n < slotItems.length) selSlot = n;
        return;
      }
      // THE WALKIE — hold V (the backrooms talk bind): your voice reaches
      // every other walkie CARRIER across the whole complex.
      if (e.code === brSettings.keys.talk && mode === "complex") {
        const held = slotItems[selSlot];
        if (down && !e.repeat && held?.kind === "walkie" && !walkieKeyed) {
          walkieKeyed = true;
          gearSfx("radio-on");
        } else if (!down && walkieKeyed) {
          walkieKeyed = false;
          gearSfx("radio-off");
        }
        if (held?.kind === "walkie") return;
      }
      // THE JUMP — same bind, same takeoff as the hall.
      if (down && e.code === brSettings.keys.jump && !airborne && locked && !anyOverlay()) {
        airborne = true;
        jumpY = 0;
        vy = 4.6;
      }
      // Movement codes feed BOTH controllers' key sets (one is dormant);
      // the controller maps them through brSettings' rebindable binds.
      if (down) {
        anteCtl.keys.add(e.code);
        complexCtl?.keys.add(e.code);
      } else {
        anteCtl.keys.delete(e.code);
        complexCtl?.keys.delete(e.code);
      }
    };
    const kd = (e: KeyboardEvent): void => onKey(e, true);
    const ku = (e: KeyboardEvent): void => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    cleanup.push(() => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); });

    // ---- interaction gates — LOOK AT IT OR NOTHING (Josh's rule: "you
    // should only be able to interact with something using E if you are
    // looking at it, no proximity interacts at all"). Every gate is reach
    // AND a tight cone around the camera forward; the wire's reach checks
    // re-verify server-side as always.
    const looking = (x: number, z: number, reach: number, coneDeg = 24): boolean => {
      const dx = x - mx(), dz = z - mz();
      const d = Math.hypot(dx, dz);
      if (d > reach) return false;
      if (d < 0.35) return true; // standing ON it — no cone can miss
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
      return (dx / d) * fx + (dz / d) * fz > Math.cos((coneDeg * Math.PI) / 180);
    };
    const nearCounter = (): boolean => looking(COUNTER.x, COUNTER.z + 0.8, 1.9, 32);
    const nearCasLocker = (): boolean => looking(LOCKER_CAS.x - 0.5, LOCKER_CAS.z, 2.0, 26);
    const nearErLocker = (): boolean => looking(LOCKER_ER.x - 0.5, LOCKER_ER.z, 2.0, 26);
    const nearCasinoDoor = (): boolean => looking(RW / 2 - 1.5, RD, 2.2, 32);
    const nearComplexDoor = (): boolean => looking(complexDoorX, 0, 2.2, 32);
    const nearChest = (): { id: number } | null => {
      for (const c of chestList)
        if (looking(c.x * 2, c.y * 2, 3.2, 22)) return { id: c.id };
      return null;
    };
    const nearKey = (): boolean =>
      keyState?.state === "loose" && !!keyState.pos &&
      looking(keyState.pos.x * 2, keyState.pos.y * 2, 3.2, 22);
    const nearExit = (): boolean => looking(27 * 2, 22.6 * 2, 3.2, 30);
    // A door answers only to AIM (Josh: "only way to open a door is by
    // having your aim on it") — the crosshair must be ON the leaf, within
    // arm's reach. Dens' shutters are not doors and carry no userData.room.
    const aimedDoor = (): string | null => {
      if (!erw) return null;
      const room = erw.aimDoor(camera, 2.6);
      return room && !room.startsWith("den") ? room : null;
    };

    // ---- frame loop --------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sterlingTick?.(dt);

      const ctl = activeCtl();
      const crouching = ctl.keys.has(brSettings.keys.crouch);
      const sprinting = st.moving && ctl.keys.has(brSettings.keys.sprint);
      const px0 = mx(), pz0 = mz();
      if (locked && !anyOverlay()) {
        // THE controller — backrooms speeds, radius, wall law, prop slides.
        ctl.tick(dt);
      }
      // The jump's ballistics (flat world: land at zero).
      if (airborne) {
        vy -= 12 * dt;
        jumpY += vy * dt;
        if (vy <= 0 && jumpY <= 0) {
          jumpY = 0;
          vy = 0;
          airborne = false;
          stepAt(mx(), mz())(0.3, true); // the landing, one hard step
        }
      }
      // Your own feet: distance-accumulated strides on the wood.
      {
        const dm = Math.hypot(mx() - px0, mz() - pz0);
        strideAcc += dm;
        const stride = sprinting ? 1.7 : 1.35;
        if (strideAcc > stride) {
          strideAcc = 0;
          if (!airborne) stepAt(mx(), mz())(0.2, sprinting);
        }
      }
      // Crouch dip + headbob, the hall's own numbers.
      crouchAmt += ((crouching ? 1 : 0) - crouchAmt) * Math.min(1, dt * 10);
      bobT = st.moving && !airborne && locked && !anyOverlay()
        ? bobT + dt * (sprinting ? 12 : crouchAmt > 0.5 ? 6.5 : 9)
        : 0;
      const bob = bobT > 0 ? Math.sin(bobT) * 0.035 : 0;
      // Your own body, breathing on the same clips as every peer's.
      if (viewmodel) {
        tickViewmodel(
          viewmodel,
          airborne ? "jump"
            : crouching ? (st.moving ? "crouchwalk" : "crouchidle")
            : !st.moving ? "idle" : sprinting ? "run" : "walk",
          dt,
        );
      }

      // Wire cadence: 12Hz when moved (cells on the wire — the state
      // already lives in them). BOTH spaces now: the ante is shared too. The
      // `in` tag lets the server drop a frame that was in flight across a
      // crossing; it never decides where the body is — the server does.
      if ((mode === "complex" || anteShared) && !wantEnter) {
        const nowMs = performance.now();
        // Pose rides the same frames (was hardcoded 0 — peers never saw a
        // crouch or a jump): 1 crouched, 2 airborne, the backrooms grammar.
        const wirePose = airborne ? 2 : crouching ? 1 : 0;
        if (
          nowMs - lastNetAt > 85 &&
          (Math.abs(st.x - lastNet.x) > 0.01 || Math.abs(st.y - lastNet.z) > 0.01 ||
            Math.abs(st.yaw - lastNet.yaw) > 0.05 || wirePose !== lastNet.p)
        ) {
          lastNetAt = nowMs;
          lastNet = { x: st.x, z: st.y, yaw: st.yaw, p: wirePose };
          if (ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "move", in: mode, x: st.x, y: st.y, yaw: st.yaw, p: wirePose }));
        }
      }
      // The shared avatars GLIDE to their wire positions and face their
      // wire headings, then animate — the casino floor's exact loop. The
      // first cut called only tickAvatar, which animates IN PLACE: every
      // peer stood frozen at the entrance forever while their `target`
      // dutifully tracked the wire, and the proximity voice (which reads
      // the BODY's position) pinned their voices to the doorway with them
      // (Josh, Aug 2026: "people are not able to see others moving …
      // voice comm just stays at the entrance"). Only the map for the space
      // this body stands in runs.
      {
        const live = mode === "complex" ? peers : antePeers;
        const strides = mode === "complex" ? peerStride : antePeerStride;
        const pk = 1 - Math.exp(-9 * dt);
        for (const [pid, a] of live) {
          a.group.position.lerp(a.target, pk);
          a.group.rotation.y = a.heading;
          tickAvatar(a, dt);
          let ps = strides.get(pid);
          if (!ps) {
            ps = { acc: 0, lx: a.group.position.x, lz: a.group.position.z };
            strides.set(pid, ps);
          }
          const pdm = Math.hypot(a.group.position.x - ps.lx, a.group.position.z - ps.lz);
          ps.lx = a.group.position.x;
          ps.lz = a.group.position.z;
          ps.acc += pdm;
          if (ps.acc > 1.45) {
            ps.acc = 0;
            const d = Math.hypot(a.group.position.x - mx(), a.group.position.z - mz());
            if (d < 16) stepAt(a.group.position.x, a.group.position.z)(0.16 * (1 - d / 16), pdm / Math.max(1e-4, dt) > 4.4);
          }
        }
      }

      if (mode === "complex") {
        // The spatial voice graph: positions in cells, walls counted through
        // the real geometry, the radio set = keyed walkies heard by carriers.
        if (voice) {
          const sp = new Map<number, SpatialPeer>();
          const radio = new Set<number>();
          const iCarry = inv.some((i) => i.item === "walkie");
          for (const [id, a] of peers) {
            sp.set(id, {
              x: a.group.position.x / 2,
              y: a.group.position.z / 2,
              walls: erw?.wallsBetween(st.x, st.y, a.group.position.x / 2, a.group.position.z / 2) ?? 0,
            });
            if (iCarry && a.equip === "walkie!") radio.add(id);
          }
          voice.updateSpatial({ x: st.x, y: st.y, yaw: st.yaw }, sp, radio, 0.15);
        }
        // The local torch rides the camera.
        if (localTorch && localTorchTarget && torchOn) {
          localTorch.position.set(mx(), EYE - 0.15, mz());
          localTorchTarget.position.set(
            mx() - Math.sin(st.yaw) * Math.cos(st.pitch) * 8,
            EYE - 0.15 + Math.sin(st.pitch) * 8,
            mz() - Math.cos(st.yaw) * Math.cos(st.pitch) * 8,
          );
        }
        erw?.tick(mx(), mz(), dt);
        exitLeft = exitUntil > Date.now() ? Math.ceil((exitUntil - Date.now()) / 1000) : 0;
        if (exitUntil > 0 && exitUntil <= Date.now()) erw?.setExitOpen(false);
        huntLeft = huntUntil > Date.now() ? Math.ceil((huntUntil - Date.now()) / 1000) : 0;
        // The monster walks its wire positions; run clip while moving.
        if (monGroup && monGroup.visible) {
          const dx = monPos.tx - monPos.x, dy = monPos.ty - monPos.y;
          const dist = Math.hypot(dx, dy);
          const k = Math.min(1, dt * 9);
          monPos.x += dx * k;
          monPos.y += dy * k;
          monGroup.position.set(monPos.x, 0, monPos.y);
          if (dist > 0.05) monGroup.rotation.y = Math.atan2(dx, dy);
          const moving = dist > 0.25;
          if (monRun && monIdle) {
            const want = moving ? monRun : monIdle;
            const other = moving ? monIdle : monRun;
            if (!want.isRunning() || other.isRunning()) {
              want.reset().fadeIn(0.15).play();
              other.fadeOut(0.15);
            }
          }
          monMixer?.update(dt);
        }
      }

      // Labels name the thing, never the key (Josh: "you don't need to give
      // people tips on keys — they can figure that out"). No idle hint line.
      prompt = !locked
        ? ""
        : counterOpen || lockerOpen || casLockerOpen || menuOpen
          ? ""
          : mode === "ante"
            ? nearCounter()
              ? "Sterling's counter"
              : nearCasLocker()
                ? "the CASINO locker"
                : nearErLocker()
                ? "the ESCAPE ROOM locker"
                : nearCasinoDoor()
                  ? "the casino floor"
                  : nearComplexDoor()
                    ? "THE COMPLEX"
                    : ""
            : nearChest()
              ? opensToday >= opensMax
                ? "a chest — but your hands are done for today"
                : "a chest"
              : nearKey()
              ? "THE KEY"
              : nearExit()
                ? exitUntil > Date.now()
                  ? "ESCAPE"
                  : holdKey
                    ? "the way out"
                    : "the way out is LOCKED"
                : aimedDoor() ?? "";

      // THE EYE FOLLOWS THE BODY'S OWN HEAD (the hall's rule): headDrop is
      // measured off the real head bone, so crouching dips the view by
      // exactly as much as it dips the model.
      const poseDrop = viewmodel ? viewmodel.headDrop : -crouchAmt * 0.55;
      const eyeVec = new THREE.Vector3(mx(), EYE + poseDrop + bob + jumpY, mz());
      camera.position.copy(eyeVec);
      camera.rotation.set(st.pitch, st.yaw, 0, "YXZ");
      if (viewmodel) placeViewmodel(viewmodel, eyeVec, st.yaw, st.pitch);

      // ---- THE HELD ITEM (backrooms machinery, verbatim) -------------------
      // Camera-parented holder + attachToHand for the model, stow→use pose
      // ease, and the right arm IK'd TO the item. Same tables, same feel.
      {
        const want = slotItems[selSlot]?.kind ?? "";
        if (want !== heldKind) {
          heldObj?.parent?.remove(heldObj);
          heldObj = null;
          heldKind = want;
          heldRaise = 0;
          if (want !== "flashlight") torchOn = false;
          if (want !== "walkie" && walkieKeyed) { walkieKeyed = false; gearSfx("radio-off"); }
          if (want) {
            heldHolder ??= (() => { const gg = new THREE.Group(); camera.add(gg); return gg; })();
            heldObj = attachToHand(heldHolder, want);
          }
        }
        const pose = HELD_POSE[heldKind];
        if (heldObj && pose) {
          const inUse = heldKind === "flashlight" ? torchOn : heldKind === "walkie" ? walkieKeyed : false;
          heldRaise += ((inUse ? 1 : 0) - heldRaise) * Math.min(1, dt * 8);
          const t2 = heldRaise;
          const p0 = pose[0], p1 = pose[1];
          heldObj.position.set(
            p0[0] + (p1[0] - p0[0]) * t2,
            p0[1] + (p1[1] - p0[1]) * t2,
            p0[2] + (p1[2] - p0[2]) * t2,
          );
          heldObj.rotation.set(
            p0[3] + (p1[3] - p0[3]) * t2,
            p0[4] + (p1[4] - p0[4]) * t2,
            p0[5] + (p1[5] - p0[5]) * t2,
          );
        }
        // The torch beam: the backrooms flash rig — from the hand-side of
        // the camera, thrown 8m along the look.
        if (localTorch && localTorchTarget) {
          const lit = mode === "complex" && heldKind === "flashlight" && torchOn;
          localTorch.intensity = lit ? 9 : 0;
          if (lit) {
            camera.updateMatrixWorld(true);
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            localTorch.position.copy(camera.position).addScaledVector(right, 0.26).addScaledVector(fwd, 0.45);
            localTorch.position.y -= 0.24;
            localTorchTarget.position.copy(camera.position).addScaledVector(fwd, 8);
          }
        }
        // The right arm reaches for what the hand holds (backrooms blend 0.75).
        if (viewmodel?.upperArm && viewmodel.foreArm && viewmodel.hand && heldObj) {
          camera.updateMatrixWorld(true);
          heldObj.getWorldPosition(ARM_TARGET);
          armIK(viewmodel.upperArm, viewmodel.foreArm, viewmodel.hand, ARM_TARGET, 0.75);
        }
        // The wire hears about the hand only when it changes — the backrooms
        // "kind!" grammar over the ER's equip frame.
        if ((mode === "complex" || anteShared) && !wantEnter && ws?.readyState === WebSocket.OPEN) {
          const active = heldKind === "flashlight" ? torchOn : heldKind === "walkie" ? walkieKeyed : false;
          const eqNow = heldKind ? heldKind + (active ? "!" : "") : "";
          if (eqNow !== lastEq) {
            lastEq = eqNow;
            ws.send(JSON.stringify({ type: "equip", in: mode, eq: eqNow }));
          }
        }
      }
      renderer.render(mode === "complex" && complexScene ? complexScene : scene, camera);
    };

    void refresh()
      .then(() => {
        // Unmounted while the fetch was in flight → don't start a zombie
        // render loop (frame self-reschedules; a detached canvas still
        // renders forever — Aug 2026 perf review).
        if (disposed) return;
        loading = false;
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        failed = true;
        loading = false;
      });

    onDestroy(() => {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const fn of cleanup) fn();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      // dispose() frees caches, not the GL context — lose it deliberately so
      // hopping casino ↔ escape doesn't stack live contexts (VRAM + a driver
      // hitch when the browser force-loses the oldest).
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });
  });
</script>

<div class="er-shell">
  <canvas bind:this={canvas}></canvas>

  {#if loading}
    <div class="er-scrim"><span>unlocking the ante-room…</span></div>
  {:else if failed}
    <div class="er-scrim">
      <span>the ante-room isn't answering.</span>
      <button onclick={onBack}>back to the casino</button>
    </div>
  {/if}

  {#if !locked && !loading && !failed && !menuOpen && !counterOpen && !lockerOpen}
    <div class="er-scrim click"><span>click to look around</span>{#if lockHint}<span class="hint">the browser refused the pointer — one more click</span>{/if}</div>
  {/if}

  {#if prompt}<div class="er-prompt">{prompt}</div>{/if}
  {#if notice}<div class="er-notice">{notice}</div>{/if}
  <div class="er-wallet">🪙 {coins.toLocaleString()}</div>
  <!-- THE HOTBAR — the backrooms HUD, verbatim markup and dress: selected
       slot ringed gold, empty slots numbered, icons the same store art. -->
  <div class="hud-slots">
    <div class="slots">
      {#each slotItems as item, i (i)}
        <div class="slot" class:sel={i === selSlot}>
          {#if item}
            {#if GEAR_IMG[item.kind]}
              <img class="slotimg" src={GEAR_IMG[item.kind]} alt={item.item} />
            {:else}
              <span class="slotglyph">{toolIcon[item.item] ?? "▪"}</span>
            {/if}
            {#if item.qty > 1}<span class="lvl">×{item.qty}</span>{/if}
          {:else}
            <span class="idx">{i + 1}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if counterOpen}
    <div class="er-overlay">
      <div class="er-panel">
        <h3>STERLING — EXPEDITION SUPPLIES</h3>
        <p class="sub">everything burns at this counter. everything down there stays useful.</p>
        <div class="toolrow">
          {#each Object.entries(tools) as [id, t] (id)}
            <button class="tool" disabled={busy || coins < t.price} onclick={() => void buyTool(id)}>
              {#if toolArt[id]}
                <img class="tart" src={toolArt[id]} alt={t.name} />
              {:else}
                <span class="ticon">{toolIcon[id] ?? "▪"}</span>
              {/if}
              <b>{t.name}</b>
              <span class="blurb">{t.blurb}</span>
              <span class="price">🪙 {t.price}</span>
            </button>
          {/each}
        </div>
        <button class="er-close" onclick={() => (counterOpen = false)}>done</button>
      </div>
    </div>
  {/if}

  {#if lockerOpen}
    <div class="er-overlay">
      <div class="er-panel wide">
        <h3>THE LOCKERS</h3>
        <p class="sub">what you carry dies with you. what you store survives you.</p>
        <div class="lockercols">
          <div>
            <h4>YOUR BAG ({inv.length}/{invSlots})</h4>
            {#each inv as i (i.item)}
              <div class="lrow">
                <span>{toolIcon[i.item] ?? "▪"} {itemLabel(i.item)}{i.qty > 1 ? ` ×${i.qty}` : ""}</span>
                <button disabled={busy} onclick={() => void moveItem(i.item, "store")}>store →</button>
              </div>
            {:else}
              <p class="empty">empty-handed</p>
            {/each}
          </div>
          <div>
            <h4>ESCAPE ROOM LOCKER ({locker.length})</h4>
            {#each locker as i (i.item)}
              <div class="lrow">
                <span>{toolIcon[i.item] ?? "▪"} {itemLabel(i.item)}{i.qty > 1 ? ` ×${i.qty}` : ""}</span>
                <button disabled={busy} onclick={() => void moveItem(i.item, "take")}>← take</button>
              </div>
            {:else}
              <p class="empty">nothing stored</p>
            {/each}
          </div>
        </div>
        <button class="er-close" onclick={() => (lockerOpen = false)}>done</button>
      </div>
    </div>
  {/if}

  {#if casLockerOpen}
    <!-- THE CASINO LOCKER — the hall's own 50-slot panel, same component,
         same server rows. The gun stored at either cabinet reads identically
         from both, because there is only one locker. -->
    <div class="er-overlay">
      <div class="er-panel wide">
        <LockerPanel />
        <button class="er-close" onclick={() => (casLockerOpen = false)}>done</button>
      </div>
    </div>
  {/if}

  {#if menuOpen}
    <div class="er-overlay">
      <div class="er-panel">
        <h3>PAUSED</h3>
        <button class="er-close" onclick={() => (menuOpen = false)}>resume</button>
        {#if mode === "ante"}
          <button class="er-close leave" onclick={onBack}>leave to the casino floor</button>
        {:else}
          <p class="sub">there is no pause-menu way out of the complex.<br />find the key. that's the game.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if exitLeft > 0}
    <div class="er-escape-banner">THE EXIT IS OPEN — {exitLeft}s</div>
  {/if}
  {#if mode === "complex" && huntPhase === "telegraph"}
    <div class="er-hunt-banner telegraph">
      LOCKDOWN IN {huntLeft}s — OPEN BLOCKS: {huntBlocks.join(" · ")}
    </div>
  {:else if mode === "complex" && huntPhase === "hunt"}
    <div class="er-hunt-banner hunting">IT IS OUT — {huntLeft}s · blocks {huntBlocks.join(" · ")}</div>
  {:else if mode === "complex" && huntPhase === "retreat"}
    <div class="er-hunt-banner retreat">it is going home. hold.</div>
  {/if}
  {#if killedFlash}
    <div class="er-killed"></div>
  {/if}

  {#if debugOpen}
    <div class="er-overlay">
      <div class="er-panel">
        <h3>HOUSE CONTROLS <span class="dbgtag">admin</span></h3>
        <p class="sub">every lever the hunt has — the server checks the badge again.</p>
        <div class="dbgrow">
          <button onclick={() => dbgHook?.("hunt-start")}>start hunt</button>
          <button onclick={() => dbgHook?.("hunt-end")}>end hunt</button>
          <button onclick={() => dbgHook?.("key-reset")}>reset key</button>
          <button onclick={() => dbgHook?.("chest-spawn")}>spawn chest</button>
          <button class:on={monFrozen} onclick={() => dbgHook?.("mon-freeze")}>{monFrozen ? "unfreeze" : "freeze"} monster</button>
          <button onclick={() => dbgHook?.("state")}>dump state</button>
        </div>
        <div class="dbgrow">
          <button onclick={() => goHook?.(54, 42.4, 0)}>tp: entry</button>
          <button onclick={() => goHook?.(54, 21, Math.PI / 2)}>tp: mid floor</button>
          <button onclick={() => goHook?.(28, 21, 0)}>tp: west floor</button>
          {#if keyState?.state === "loose" && keyState.pos}
            <button onclick={() => goHook?.(keyState!.pos!.x * 2, keyState!.pos!.y * 2 + 1.5, 0)}>tp: the key</button>
          {/if}
        </div>
        {#if debugState}<pre class="dbgstate">{debugState}</pre>{/if}
        <button class="er-close" onclick={() => (debugOpen = false)}>close</button>
      </div>
    </div>
  {/if}
  {#if lootToast}
    {@const t = lootToast}
    <div class="er-loot {t.tier}">
      <span class="loot-tier">{t.tier.toUpperCase()} CHEST</span>
      <span class="loot-what">
        {#if t.kind === "silver"}🪙 {t.amount.toLocaleString()} silver
        {:else if t.kind === "spins"}🎡 {t.amount} wheel spin{t.amount === 1 ? "" : "s"}
        {:else if t.kind === "chips"}🎰 {t.amount.toLocaleString()} casino chips
        {:else if t.kind === "pulls"}🎫 {t.amount} free slot pulls
        {:else}🥼 the {t.skin?.toUpperCase()} suit — yours alone{/if}
      </span>
      <span class="loot-count">{opensToday}/{opensMax} today</span>
    </div>
  {/if}
  {#if holdKey}
    <div class="er-keychip">🗝 THE KEY</div>
  {/if}
</div>

<style>
  .er-shell { position: fixed; inset: 0; z-index: 60; background: #000; }
  canvas { width: 100%; height: 100%; display: block; }
  .er-scrim {
    position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px;
    align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55);
    color: #e6dfd0; font-size: 1.05rem; letter-spacing: 0.04em;
  }
  .er-scrim.click { cursor: pointer; pointer-events: none; }
  .er-scrim .hint { font-size: 0.85rem; color: #d9a05b; }
  .er-scrim button {
    padding: 9px 18px; background: none; border: 1px solid #6a5535; border-radius: 8px;
    color: #e6dfd0; cursor: pointer;
  }
  .er-prompt {
    position: absolute; left: 50%; bottom: 9%; transform: translateX(-50%);
    padding: 7px 18px; background: rgba(10, 8, 5, 0.78); border: 1px solid #4a3c28;
    border-radius: 999px; color: #dfd6c2; font-size: 0.9rem; pointer-events: none;
  }
  .er-notice {
    position: absolute; left: 50%; top: 15%; transform: translateX(-50%);
    padding: 9px 20px; background: rgba(20, 10, 6, 0.88); border: 1px solid #6a4030;
    border-radius: 999px; color: #f0d9c8; font-size: 0.92rem; font-weight: 700; pointer-events: none;
  }
  .er-wallet {
    position: absolute; top: 14px; right: 16px; padding: 6px 14px;
    background: rgba(10, 8, 5, 0.72); border: 1px solid #4a3c28; border-radius: 999px;
    color: #e8d9b8; font-size: 0.9rem; font-weight: 700; pointer-events: none;
  }
  /* THE HOTBAR — the backrooms HUD's own dress, verbatim (uniformity). */
  .hud-slots {
    position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    z-index: 3; pointer-events: none;
  }
  .slots { display: flex; gap: 7px; }
  .slot {
    width: 52px; height: 52px; position: relative;
    background: rgba(90, 88, 84, 0.42); border: 2px solid rgba(140, 136, 128, 0.55);
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
  }
  .slot.sel { border-color: #e8d386; background: rgba(120, 110, 80, 0.5); }
  .slot .idx { color: rgba(220, 214, 196, 0.42); font-size: 0.72rem; font-weight: 700; }
  .slot:has(.slotimg) { background: rgba(140, 128, 92, 0.5); border-color: rgba(200, 186, 140, 0.7); }
  .slot .lvl { position: absolute; right: 3px; bottom: 1px; font-size: 0.58rem; color: #c9b26a; font-weight: 800; }
  .slotimg { width: 100%; height: 100%; object-fit: contain; padding: 3px; box-sizing: border-box; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8)); }
  .slotglyph { font-size: 1.6rem; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.9)); }
  .tool .tart { width: 54px; height: 54px; object-fit: contain; }
  .er-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4, 3, 2, 0.7); }
  .er-panel {
    width: min(92vw, 520px); background: linear-gradient(180deg, #17110a, #0d0a06);
    border: 1px solid #6a5535; border-radius: 14px; padding: 20px 22px; color: #e6dfd0;
  }
  .er-panel.wide { width: min(94vw, 680px); }
  .er-panel h3 { margin: 0 0 4px; letter-spacing: 0.12em; color: #f0c869; font-size: 1.05rem; }
  .er-panel .sub { margin: 0 0 14px; color: #97917f; font-size: 0.85rem; font-style: italic; }
  .toolrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
  .tool {
    display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 6px;
    background: rgba(255, 255, 255, 0.04); border: 1px solid #453723; border-radius: 10px;
    color: #d8cdb8; cursor: pointer; font-size: 0.78rem;
  }
  .tool:not(:disabled):hover { border-color: #c9a24a; }
  .tool:disabled { opacity: 0.45; cursor: default; }
  .ticon { font-size: 1.5rem; }
  .tool .blurb { font-size: 0.68rem; color: #97917f; text-align: center; }
  .tool .price { color: #e8d9b8; font-weight: 700; }
  .lockercols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 14px; }
  .lockercols h4 { margin: 0 0 8px; font-size: 0.78rem; letter-spacing: 0.1em; color: #b9ae97; }
  .lrow {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 6px 8px; border: 1px solid #352a19; border-radius: 8px; margin-bottom: 6px; font-size: 0.85rem;
  }
  .lrow button {
    padding: 3px 10px; background: none; border: 1px solid #5a4a33; border-radius: 6px;
    color: #d8cdb8; cursor: pointer; font-size: 0.75rem;
  }
  .lrow button:hover { border-color: #c9a24a; }
  .empty { color: #6f6a5c; font-size: 0.8rem; font-style: italic; }
  .er-close {
    width: 100%; padding: 10px; background: none; border: 1px solid #5a4a33; border-radius: 9px;
    color: #b9ae97; cursor: pointer; font-weight: 700; letter-spacing: 0.05em; margin-top: 4px;
  }
  .er-close:hover { color: #e6dfd0; border-color: #8a7350; }
  .er-close.leave { color: #d9927a; }
  .dbgtag { font-size: 0.62rem; color: #7d7666; letter-spacing: 0.1em; margin-left: 8px; }
  .dbgrow { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
  .dbgrow button {
    padding: 7px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid #453723;
    border-radius: 8px; color: #d8cdb8; cursor: pointer; font-size: 0.78rem;
  }
  .dbgrow button:hover { border-color: #c9a24a; }
  .dbgrow button.on { border-color: #ff5a3a; color: #ffb0a0; }
  .dbgstate {
    max-height: 180px; overflow: auto; font-size: 0.68rem; color: #97917f;
    background: rgba(0, 0, 0, 0.35); border-radius: 8px; padding: 8px; margin: 0 0 10px;
  }
  .er-escape-banner {
    position: absolute; top: 9%; left: 50%; transform: translateX(-50%);
    padding: 10px 26px; background: rgba(8, 30, 14, 0.85); border: 1px solid #35d06a;
    border-radius: 999px; color: #7df0a8; font-size: 1.05rem; font-weight: 800;
    letter-spacing: 0.1em; pointer-events: none; animation: er-pulse 0.9s ease-in-out infinite;
  }
  @keyframes er-pulse { 50% { box-shadow: 0 0 22px rgba(53, 208, 106, 0.45); } }
  .er-keychip {
    position: absolute; top: 14px; left: 16px; padding: 6px 14px;
    background: rgba(35, 26, 8, 0.82); border: 1px solid #c9a24a; border-radius: 999px;
    color: #f0c869; font-size: 0.9rem; font-weight: 800; pointer-events: none;
  }
  .er-hunt-banner {
    position: absolute; top: 4%; left: 50%; transform: translateX(-50%);
    padding: 9px 24px; border-radius: 999px; pointer-events: none;
    font-size: 1rem; font-weight: 800; letter-spacing: 0.09em;
  }
  .er-hunt-banner.telegraph {
    background: rgba(60, 12, 6, 0.9); border: 1px solid #ff5a3a; color: #ffb0a0;
    animation: er-strobe 0.66s steps(2, jump-none) infinite;
  }
  .er-hunt-banner.hunting {
    background: rgba(40, 4, 2, 0.94); border: 1px solid #ff2a1a; color: #ff7a68;
    animation: er-strobe 0.5s steps(2, jump-none) infinite;
  }
  .er-hunt-banner.retreat { background: rgba(20, 14, 6, 0.85); border: 1px solid #6a5535; color: #b9ae97; }
  @keyframes er-strobe { 50% { box-shadow: 0 0 26px rgba(255, 42, 26, 0.55); } }
  .er-killed {
    position: absolute; inset: 0; pointer-events: none; z-index: 40;
    background: radial-gradient(ellipse at center, rgba(120, 6, 2, 0.55), rgba(20, 0, 0, 0.92));
    animation: er-killed-in 1.4s ease-out forwards;
  }
  @keyframes er-killed-in { from { opacity: 0; } 20% { opacity: 1; } to { opacity: 0; } }
  /* THE LOOT TOAST — Josh: "make sure the notification is clean and aesthetic". */
  .er-loot {
    position: absolute; top: 20%; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 14px 34px 12px; border-radius: 12px; pointer-events: none;
    background: linear-gradient(180deg, rgba(20, 15, 8, 0.94), rgba(10, 8, 5, 0.94));
    border: 1px solid #6a5535; animation: loot-in 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.65);
  }
  @keyframes loot-in { from { transform: translateX(-50%) translateY(-14px) scale(0.92); opacity: 0; } }
  .er-loot .loot-tier { font-size: 0.72rem; letter-spacing: 0.28em; font-weight: 800; color: #b9ae97; }
  .er-loot.rare .loot-tier { color: #6ab8f0; }
  .er-loot.legendary .loot-tier { color: #f0c869; text-shadow: 0 0 12px rgba(240, 200, 105, 0.55); }
  .er-loot.rare { border-color: #2f5d84; }
  .er-loot.legendary { border-color: #c9a24a; box-shadow: 0 0 34px rgba(201, 162, 74, 0.28), 0 18px 60px rgba(0, 0, 0, 0.65); }
  .er-loot .loot-what { font-size: 1.18rem; font-weight: 800; color: #efe6d2; }
  .er-loot .loot-count { font-size: 0.7rem; color: #7d7666; }
</style>
