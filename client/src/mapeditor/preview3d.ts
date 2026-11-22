// The map editor's 3D preview: one room, built the way the game builds it.
// Pipe Dreams' fixtures come from the game's own builder (pipes-props.ts), so
// what stands in the preview is what will stand in the level; the Poolrooms'
// masonry (pillars, arches, portal rings, bridge decks) and its water are
// drawn here in plain shapes; floors, walls and
// the doorways are drawn here (the game's chunk builder needs a whole world).
// Kit props load the same files the game loads (/assets/propkit), placed by
// the same rule: position (x·CELL, floor + z, y·CELL), rotation.y = -r.
// Level 0's rooms wear the game's own look materials (world.ts LOBBY_LOOK),
// so a room reads in the preview as it will in the level.
//
// THE CAMERA IS UNREAL'S (Josh, Oct 2026: "I would like to mimic the controls
// from unreal engine 5 view port camera controls"): hold the LEFT button and
// move the mouse to turn the camera where it stands; with the mouse over the
// view W / S fly forward and back along where it looks, A / D slide left and
// right, Q / E sink and rise, Shift goes faster; the wheel steps forward and
// back; the right button pans. A click without a drag still picks a prop, and
// the move handle still owns a drag that starts on it. The editor's own keys
// are left alone everywhere else.
//
// LIGHTS (the same round: "the option in the viewer for turning on
// lighting"): the 💡 button bakes the GAME's light field into the room —
// the same fixtures (each room's Lights setting decides which are on), the
// same falloff, the same walls stopping it, the same per-room brightness —
// and draws the panels where they hang, flickering where the room says so.
// What you see is how the room will be lit, without a test play.
//
// WALK MODE (Josh, Sep 2026 — "test the draft in first person"): the Walk
// button fills the editor with the preview, raises the walls to their real
// ceilings, puts a lid on the room and drops you in at eye height. WASD walks,
// Shift runs, the mouse looks, Esc stops. It walks by the game's rules where
// they matter for a room's feel: walls and solid cells stop you, one step up
// is a stride and more is a wall, any drop is fine, solid props are walked
// round. The mouse goes through the shared pointer-lock policy
// (lib/pointerlock.ts), like the games.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { kitVariant, kitBlocks, kitCovers, kitSize, KIT_BASE, isSignFile, isShapeFile } from "../../../src/backrooms/kit";
import { makeShape } from "../backrooms/shapes";
import { stairGeometry, stairRailMat, tintedStairMat } from "../backrooms/stairs";
import { LID_NONE, ceilingWithLid } from "../../../src/backrooms/ceiling";
import { MARK } from "../../../src/backrooms/marks";
import { makeSign } from "../backrooms/signs";
import { lobbyLookMaterials, lobbyLookOf, lookWithStyle, lookIndexOf, styleBright, lobbyLampOn, styleLampOn, wallsBetween, shapeSurface, bakeKitSkins, PAPER_U_M, PAPER_V_M, type WorldIndex } from "../backrooms/world";
import type { LookSpec } from "../../../src/backrooms/surfaces";
import { acquirePointerLock, isTeleport } from "../lib/pointerlock";
import { WALK_SPEED, SPRINT_SPEED } from "../backrooms/controller";
import { isMac, isDesktopShell } from "../lib/platform";
import { buildPipeFixtures, PIPE_CEILINGS, PIPE_SAFE_TYPES, pipeHallRoof, type PipeWorld } from "../backrooms/pipes-props";
import type { Tile } from "../../../src/backrooms/tiles";
import { POOL_CEILINGS, WATER_TABLE, wetFloor } from "../../../src/backrooms/pools-vocab";
import { LOBBY_CEILINGS } from "../../../src/backrooms/lobby-vocab";
import { STATION_CEILINGS } from "../../../src/backrooms/station-vocab";
import { OFFICE_CEILINGS } from "../../../src/backrooms/office-vocab";
import { HOTEL_CEILINGS } from "../../../src/backrooms/hotel-vocab";
import { LIGHTS_CEILINGS } from "../../../src/backrooms/lights-vocab";
import { OCEAN_CEILINGS } from "../../../src/backrooms/ocean-vocab";
import { CAVE_CEILINGS } from "../../../src/backrooms/cave-vocab";
import { SUBURB_CEILINGS } from "../../../src/backrooms/suburb-vocab";
/** The Suburbs in the preview: a house's rooms their ceiling, the open air a
 *  fence's height (the game draws no ceiling outdoors). */
const SUBURB_PREVIEW: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(SUBURB_CEILINGS).map(([k, v]) => [k, v > 10 ? 1.2 : v]));

const CELL = 2;
const STEP = 0.5;

const FLOOR_COLOR: Record<string, number> = {
  pipegallery: 0x6d655a,
  servicering: 0x5f594f,
  corridor: 0x7a766d,
  tunnel: 0x4d4943,
  office: 0x77736b,
  suite: 0x6b7278,
  breakroom: 0x5f7a5c,
  controlroom: 0x5c7a70,
  enginehall: 0x3f3c38,
  catwalk: 0x8a6a3a,
  boilerhouse: 0x735f50,
  warehouse: 0x6e6555,
  machineshop: 0x626a72,
  drainroom: 0x4f6f80,
  vault: 0x7a5048,
  // the Poolrooms: white tile everywhere, the rivers a shade greyer
  river: 0xb9c6c8,
  natatorium: 0xe4eaea,
  vaultsea: 0xc9d5d8,
  portalhall: 0xd8e0e2,
  tunnels: 0xcfd6d6,
  shallows: 0xd6e2e2,
  rotunda: 0xeceeee,
  baths: 0xdde3e6,
  // Level 0: the yellow
  classic: 0xc8b46a,
  pillars: 0xc0ad66,
  offices: 0xb8a866,
  warrens: 0xa89858,
  halls: 0xc2b06c,
  atrium: 0xd6c47c,
  terraces: 0xc6b470,
  sublevel: 0x9c8c52,
  manila: 0x8f7a4c,
  restrooms: 0xd8d6cc,
  panelled: 0x4f6e56,
  storage: 0x9a968c,
  unlit: 0x4a432c,
};

export interface Preview3D {
  /** Draw a room; `selected` is the index of the prop to ring (or -1). */
  show(tile: Tile | null, selected?: number): void;
  /** How finely the move handle snaps, in metres (0 = free). */
  setSnap(m: number): void;
  dispose(): void;
}

/** What the preview tells the editor (THE 3D MOVE HANDLE, Josh Sep 2026:
 *  "being able to move props on a x/y/z axis would be cool"). */
export interface PreviewHooks {
  /** A prop was clicked in the 3D view. */
  onPick?: (k: number) => void;
  /** A prop was moved, turned or (a shape) resized with the handle: x, y in
   *  cells, z metres above its cell's floor, r the yaw, rx / rz the tilt in
   *  degrees (kit.ts), and a shape's new size in metres. */
  onMove?: (k: number, to: { x: number; y: number; z: number; r: number; rx: number; rz: number; size?: [number, number, number] }) => void;
}

// one loader and one cache for the page: a prop is fetched once however many
// rooms place it (the game shares its models the same way)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = new Map<string, Promise<THREE.Object3D | null>>();
function model(file: string): Promise<THREE.Object3D | null> {
  let m = models.get(file);
  if (!m) {
    m = loader.loadAsync(`${KIT_BASE}${file}.gltf`).then(
      (g) => {
        // a still, skinned model draws only once its skin is baked out — the
        // game's rule (world.ts bakeKitSkins; Nov 2026 polish round), so the
        // Hotel's corridor doors show here as they do in the game
        if (!g.animations.some((a) => a.name === "open")) bakeKitSkins(g.scene);
        return g.scene;
      },
      () => null,
    );
    models.set(file, m);
  }
  return m;
}

/** A box's UVs in WORLD metres (the game's rule: walls repeat every
 *  uM × vM metres whatever their size) plus a vertex colour, which the game's
 *  materials read as baked light. BoxGeometry's faces run +x −x +y −y +z −z. */
function dress(g: THREE.BoxGeometry, sx: number, sy: number, sz: number, uM: number, vM: number, light: number | ((x: number, y: number, z: number, nx: number, nz: number) => number)): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / uM, (uv.getY(k) * dims[f][1]) / vM);
    }
  }
  shade(g, light);
}

/** Vertex light on a geometry: one value, or the Lights view's field. */
function shade(g: THREE.BufferGeometry, light: number | ((x: number, y: number, z: number, nx: number, nz: number) => number)): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  if (typeof light === "number") {
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(uv.count * 3).fill(light), 3));
    return;
  }
  // the LIGHTS view: every vertex samples the room's light field
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const l = light(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getZ(i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = l;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** What walk mode needs to know about the room on show. */
interface Nav {
  inside: (x: number, y: number) => boolean;
  open: (x: number, y: number) => boolean;
  wallOn: (x: number, y: number, side: number) => boolean;
  floor: (x: number, y: number) => number;
  /** The ground under a continuous position (a stair climbs across its cell). */
  ground: (x: number, y: number) => number;
  steps: (x: number, y: number) => number;
  propBlocks: (x: number, y: number) => boolean;
  spawn: { x: number; y: number };
}

export function createPreview3D(host: HTMLElement, hooks: PreviewHooks = {}): Preview3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14120f);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.rotation.order = "YXZ";
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  // Unreal's viewport: the left button LOOKS (below), the right one pans, and
  // the wheel steps the camera itself forward (below) rather than dollying
  // towards a point it can never pass
  controls.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.enableZoom = false;
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a241c, 1.4));
  // inside a room the sky light only reaches the floor; the game lights its
  // ceilings from the panels, so walk mode lifts everything a little instead
  const roomLight = new THREE.AmbientLight(0xfff2dc, 0);
  scene.add(roomLight);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(20, 40, 12);
  scene.add(sun);
  const hemi = scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  // the game's own dim base (world.ts): the light lives in the baked field
  const gameAmb = new THREE.AmbientLight(0xeae4c8, 0);
  scene.add(gameAmb);
  let lit = false;
  const setRig = (): void => {
    if (lit) {
      hemi.color.set(0xf0ecd0);
      hemi.groundColor.set(0x54503f);
      hemi.intensity = 1.45;
      gameAmb.intensity = 0.54;
      sun.intensity = 0;
      roomLight.intensity = 0;
      scene.background = new THREE.Color(0x0c0b09);
    } else {
      hemi.color.set(0xfff2dc);
      hemi.groundColor.set(0x2a241c);
      hemi.intensity = 1.4;
      gameAmb.intensity = 0;
      sun.intensity = 1.2;
      roomLight.intensity = walking ? 1.1 : 0;
      scene.background = new THREE.Color(0x14120f);
    }
  };
  /** The panels drawn in the Lights view, and which of them flicker. */
  let flickering: { m: THREE.Mesh; seed: number }[] = [];
  const group = new THREE.Group();
  scene.add(group);
  // props live in their own group: they are shared clones of cached models,
  // so clearing them must never dispose geometry the cache still holds
  const propGroup = new THREE.Group();
  scene.add(propGroup);
  // THE MOVE HANDLE: arrows on the selected prop (drag one to slide it along
  // that axis — up and down included), or a ring to turn it
  const handle = new TransformControls(camera, canvas);
  handle.setSize(0.85);
  scene.add(handle.getHelper());
  let handleMode: "translate" | "rotate" | "scale" = "translate";
  let snapM = 0.5;
  let floorUnder: (x: number, y: number) => number = () => 0;
  handle.addEventListener("dragging-changed", (e) => {
    controls.enabled = !(e as unknown as { value: boolean }).value && !walking;
  });
  handle.addEventListener("mouseUp", () => {
    const o = handle.object;
    if (!o || o.userData.k === undefined) return;
    const x = o.position.x / CELL;
    const y = o.position.z / CELL;
    const floor = floorUnder(Math.floor(x), Math.floor(y));
    // read the turn back in the kit's order (yaw, then pitch, then roll)
    const e = new THREE.Euler().setFromQuaternion(o.quaternion, "YXZ");
    const deg = (rad: number): number => Math.round(((rad * 180) / Math.PI) * 10) / 10;
    const r = ((((-e.y * 180) / Math.PI) % 360) + 360) % 360;
    const base = o.userData.size as [number, number, number] | undefined;
    const size = base
      ? ([base[0] * o.scale.x, base[1] * o.scale.y, base[2] * o.scale.z].map((v) => Math.round(Math.max(0.05, Math.min(30, v)) * 100) / 100) as [number, number, number])
      : undefined;
    hooks.onMove?.(o.userData.k as number, {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.max(0, Math.round((o.position.y - floor) * 100) / 100),
      r: Math.round(r * 10) / 10,
      rx: deg(e.x),
      rz: deg(e.z),
      size,
    });
  });
  const applySnap = (): void => {
    handle.setTranslationSnap(snapM || null);
    handle.setRotationSnap(THREE.MathUtils.degToRad(15));
    handle.setScaleSnap(0.05);
  };
  applySnap();
  let gen = 0;
  let raf = 0;
  // the review hook (like the games' __cas / __brRagdoll): the preview's
  // scene, for checking what it actually drew
  (window as unknown as { __mePreview?: unknown }).__mePreview = { scene, propGroup, camera, handle: () => handle, controls: () => controls };
  let lastKey = "";

  // ---- walk mode state
  const ui = document.createElement("div");
  ui.className = "p3ui";
  ui.innerHTML = `<button class="p3walk" title="Walk around this room in first person">Walk it</button><button class="p3big" title="A bigger 3D view (Esc shrinks it)">⤢ Bigger</button><button class="p3lit" title="See the room lit the way the game lights it">💡 Lights</button><span class="p3mode" hidden><button data-m="translate" class="on" title="Drag the arrows to move it — the green one lifts it">✥ Move</button><button data-m="rotate" title="Drag a ring to turn or tilt it — any of the three">⟳ Turn</button><button data-m="scale" class="p3size" title="Drag a handle to stretch it along that side (shapes)">⇲ Size</button></span><div class="p3hint" hidden></div><div class="p3fly">Left-drag look · WASD move · Q/E down/up · right-drag pan · wheel in/out · Shift faster</div>`;
  host.appendChild(ui);
  const walkBtn = ui.querySelector<HTMLButtonElement>(".p3walk")!;
  const bigBtn = ui.querySelector<HTMLButtonElement>(".p3big")!;
  const modeBox = ui.querySelector<HTMLSpanElement>(".p3mode")!;
  const sizeBtn = ui.querySelector<HTMLButtonElement>(".p3size")!;
  const litBtn = ui.querySelector<HTMLButtonElement>(".p3lit")!;
  litBtn.onclick = () => {
    lit = !lit;
    litBtn.classList.toggle("on", lit);
    litBtn.textContent = lit ? "💡 Lights on" : "💡 Lights";
    setRig();
    show(cur, curSel);
  };
  const setBig = (on: boolean): void => {
    host.classList.toggle("big", on);
    bigBtn.textContent = on ? "⤡ Smaller" : "⤢ Bigger";
  };
  bigBtn.onclick = () => setBig(!host.classList.contains("big"));
  modeBox.onclick = (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-m]")?.dataset.m as "translate" | "rotate" | "scale" | undefined;
    if (!m) return;
    handleMode = m;
    handle.setMode(m);
    // every axis in every mode: arrows to slide, rings to turn and tilt,
    // handles to stretch (Josh: "xyz axis rotation for props")
    handle.showX = true;
    handle.showZ = true;
    handle.showY = true;
    handle.setSpace(m === "translate" ? "world" : "local");
    for (const b of modeBox.querySelectorAll("button")) b.classList.toggle("on", b.dataset.m === m);
  };
  const hint = ui.querySelector<HTMLDivElement>(".p3hint")!;
  let walking = false;
  // NO REAL POINTER LOCK (the Mac desktop app's webview has none): the game's
  // pseudo-lock — the view follows the mouse with no button held (a trackpad
  // can't click-and-drag comfortably), the cursor hidden. Arrow keys turn too.
  let pseudoLock = false;
  let fbLast: { x: number; y: number } | null = null;
  let cur: Tile | null = null;
  let curSel = -1;
  let nav: Nav | null = null;
  let px = 0;
  let py = 0;
  let eye = 1.6;
  let yaw = 0;
  let pitch = 0;
  let saved: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const keys = new Set<string>();
  const flyKeys = new Set<string>();
  let hovered = false;
  let lastT = performance.now();

  const resize = (): void => {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 260;
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (walking) {
      // arrow keys turn and look — for a trackpad, and for anyone
      const turn = (keys.has("arrowleft") ? 1 : 0) - (keys.has("arrowright") ? 1 : 0);
      const tilt = (keys.has("arrowup") ? 1 : 0) - (keys.has("arrowdown") ? 1 : 0);
      yaw += turn * 2.2 * dt;
      pitch = Math.max(-1.45, Math.min(1.45, pitch + tilt * 1.6 * dt));
      stepWalk(dt);
    }
    else {
      fly(dt);
      controls.update();
    }
    if (lit && flickering.length) {
      // the flickering panels stutter like the game's (cosmetic here)
      for (const fp of flickering) fp.m.visible = Math.sin(now / 90 + fp.seed) + Math.sin(now / 37 + fp.seed * 3) > -0.6;
    }
    renderer.render(scene, camera);
  };
  loop();

  const clear = (): void => {
    for (const c of [...group.children]) {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
    }
  };

  function show(t: Tile | null, selected = -1): void {
    cur = t;
    curSel = selected;
    handle.detach();
    modeBox.hidden = true;
    clear();
    const mine = ++gen;
    // a sign or a shape is built fresh each draw, so it is let go here (Oct
    // 2026 review: every redraw leaked their geometry, and a sign's materials)
    propGroup.traverse((o) => {
      const own = o.userData.ownGeo || o.userData.ownMat;
      if (!own) return;
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        if (o.userData.ownMat) for (const mat of [mesh.material].flat() as THREE.Material[]) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); }
      });
    });
    propGroup.clear();
    nav = null;
    if (!t || !t.w || !t.h) return;
    const { w, h } = t;
    const I = (x: number, y: number): number => y * w + x;
    const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && t.cell[I(x, y)] !== 0;
    const pools = t.dia.level === 1;
    const lobby = t.dia.level === 0;
    const typeAt = (x: number, y: number): string => t.dia.types[t.zone[I(x, y)]] ?? "office";
    const socketEdge = new Set<string>();
    for (const s of t.sockets) {
      const lx = s.side === 0 || s.side === 2 ? 1 : 0;
      for (let k = 0; k < s.w; k++) socketEdge.add(`${s.x + lx * k},${s.y + (1 - lx) * k},${s.side}`);
    }
    const innerEdge = new Set<string>();
    for (const d of t.inner) {
      innerEdge.add(`${d.x},${d.y},${d.side}`);
      const nx = d.x + [0, 1, 0, -1][d.side];
      const ny = d.y + [-1, 0, 1, 0][d.side];
      innerEdge.add(`${nx},${ny},${(d.side + 2) % 4}`);
    }
    // a wall on the edge between (x,y) and its neighbour on `side`?
    const wallOn = (x: number, y: number, side: number): boolean => {
      const nx = x + [0, 1, 0, -1][side];
      const ny = y + [-1, 0, 1, 0][side];
      const a = inside(x, y);
      const b = inside(nx, ny);
      if (!a && !b) return false;
      if (a && !b) return !socketEdge.has(`${x},${y},${side}`);
      if (!a && b) return !socketEdge.has(`${nx},${ny},${(side + 2) % 4}`);
      if (t.room[I(x, y)] !== t.room[I(nx, ny)]) return !innerEdge.has(`${x},${y},${side}`);
      // the room's own thin walls
      if (side === 0) return !!t.wallN[I(x, y)];
      if (side === 3) return !!t.wallW[I(x, y)];
      if (side === 2) return !!t.wallN[I(nx, ny)];
      return !!t.wallW[I(nx, ny)];
    };
    const world: PipeWorld = {
      decoAt: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? t.deco[I(x, y)] : 0),
      solidAt: (x, y) => !inside(x, y) || t.cell[I(x, y)] === 2,
      hasCell: (x, y) => inside(x, y),
      floorAt: (x, y) => (inside(x, y) ? t.hgt[I(x, y)] * STEP : 0),
      wallNAt: (x, y) => wallOn(x, y, 0),
      wallWAt: (x, y) => wallOn(x, y, 3),
      // the Poolrooms: one flat lid per room over the deck (world.ts ceilOver)
      ceilAt: (x, y) => ceilAt(x, y),
    };
    // THE HELD CEILING (ceiling.ts): a cell whose ceiling the Heights tool
    // kept where it was hangs it from that height, not from its own floor
    function ceilAt(x: number, y: number): number {
      if (!inside(x, y)) return 3;
      const ty = typeAt(x, y);
      const f = t!.hgt[I(x, y)] * STEP;
      // the sea's open air: one flat lid above sea level, as the game draws it
      // (world.ts ceilOver) — floor + 40 boxed every island in a 55m slab
      const seaAir = t!.dia.level === 7 && ((OCEAN_CEILINGS as Readonly<Record<string, number>>)[ty] ?? 0) >= 20;
      const over = (fm: number): number =>
        ty === "enginehall" ? pipeHallRoof(fm) : pools ? Math.max(POOL_CEILINGS[ty] ?? 6, fm + 4) : seaAir ? Math.max(OCEAN_CEILINGS[ty as keyof typeof OCEAN_CEILINGS], fm + 4) : fm + ((t!.dia.level === 0 ? LOBBY_CEILINGS : t!.dia.level === 3 ? (STATION_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 4 ? (OFFICE_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 5 ? (HOTEL_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 6 ? (LIGHTS_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 7 ? (OCEAN_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 8 ? (CAVE_CEILINGS as Readonly<Record<string, number>>) : t!.dia.level === 9 ? SUBURB_PREVIEW : PIPE_CEILINGS)[ty] ?? 3);
      if (pools) return over(f);
      const lv = t!.lid[I(x, y)];
      return ceilingWithLid(over, f, lv === LID_NONE ? null : lv * STEP);
    }
    // Level 0 wears the game's own looks; the others plain colours
    // the surface catalogue's materials — the game's own (world.ts)
    const looks = lobbyLookMaterials();
    // the room design's look override, on its own-type cells (as the generator lays it)
    const ownZone = t.dia.types.indexOf(t.def.type);
    const styleAt = (x: number, y: number): LookSpec | null => (t.zone[I(x, y)] === ownZone ? (t.def.look ?? null) : null);
    const lookAt = (x: number, y: number) => lookWithStyle(typeAt(x, y), styleAt(x, y));
    // Level 0 always wears catalogue surfaces; the other levels only where a
    // room picked one (null = the preview's plain colour for that level)
    const wallMatAt = (x: number, y: number): THREE.Material | null => {
      if (lobby) return looks.walls[lookAt(x, y).wall];
      const i = lookIndexOf("wall", styleAt(x, y)?.wall);
      return i >= 0 ? lobbyLookMaterials().walls[i] : null;
    };
    const floorMatAt = (x: number, y: number): THREE.Material | null => {
      if (lobby) return looks.floors[lookAt(x, y).floor];
      const i = lookIndexOf("floor", styleAt(x, y)?.floor);
      return i >= 0 ? lobbyLookMaterials().floors[i] : null;
    };
    const ceilMatAt = (x: number, y: number): THREE.Material | null => {
      if (lobby) return looks.ceils[lookAt(x, y).ceil];
      const i = lookIndexOf("ceil", styleAt(x, y)?.ceil);
      return i >= 0 ? lobbyLookMaterials().ceils[i] : null;
    };
    // the room's base light (Level 0's type) and its Brightness setting
    const lightOf = (x: number, y: number): number => Math.max(0.2, lobby ? (lookAt(x, y).ambient ?? 1) : styleBright(styleAt(x, y)));
    const piped = t.dia.level === 2;
    // ---- THE LIGHTS VIEW: the game's fixtures and light field (world.ts
    // buildChunk), worked out for this room alone
    const spots: { px: number; pz: number; x: number; y: number }[] = [];
    if (lit) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!inside(x, y) || t.cell[I(x, y)] === 2) continue;
          if (piped) {
            const code = t.deco[I(x, y)];
            const lamp = code >> 4 === 2 && (code & 15) !== 1;
            const safe = x % 2 === 0 && y % 2 === 0 && PIPE_SAFE_TYPES.has(typeAt(x, y));
            if ((!lamp && !safe) || !styleLampOn(styleAt(x, y), x, y)) continue;
            spots.push({ px: x * CELL + 1, pz: y * CELL + 1, x, y });
            continue;
          }
          if (x % 2 !== 0 || y % 2 !== 1) continue;
          if (lobby && !lobbyLampOn(typeAt(x, y), x, y, styleAt(x, y))) continue;
          if (pools && !styleLampOn(styleAt(x, y), x, y)) continue;
          const clearNS = !wallOn(x, y, 0) && !wallOn(x, y, 2);
          const clearEW = !wallOn(x, y, 3) && !wallOn(x, y, 1);
          if (!clearNS && !clearEW) continue;
          spots.push({ px: x * CELL + 1, pz: y * CELL + 1, x, y });
        }
      }
    }
    const occWorld = { wallNAt: (x: number, y: number) => wallOn(x, y, 0), wallWAt: (x: number, y: number) => wallOn(x, y, 3), solidAt: (x: number, y: number) => !inside(x, y) || t.cell[I(x, y)] === 2 } as unknown as WorldIndex;
    const OCC = [1, 0.08, 0, 0, 0];
    const occCache = new Map<string, number>();
    /** 0..1 light energy at a point, as world.ts lightAt works it out. */
    const lightAt = (sx: number, sz: number, nx = 0, nz = 0): number => {
      let e = 0;
      const directional = nx !== 0 || nz !== 0;
      for (let fi = 0; fi < spots.length; fi++) {
        const sp = spots[fi];
        const dx = sp.px - sx;
        const dz = sp.pz - sz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 46) continue;
        let g = 1.6 / (1 + d2 * 0.5);
        if (directional && d2 > 0.4) {
          const inv = 1 / Math.sqrt(d2);
          let wgt = (nx * dx * inv + nz * dz * inv + 0.35) / 1.35;
          if (wgt <= 0) continue;
          wgt = 1 + (wgt - 1) * Math.min(1, (d2 - 0.4) / 1.6);
          g *= wgt;
        }
        if (g < 0.004) continue;
        const key = `${Math.round((sx / CELL) * 16)},${Math.round((sz / CELL) * 16)},${fi}`;
        let occ = occCache.get(key);
        if (occ === undefined) {
          occ = OCC[wallsBetween(occWorld, Math.round((sx / CELL) * 16) / 16, Math.round((sz / CELL) * 16) / 16, sp.px / CELL, sp.pz / CELL)];
          occCache.set(key, occ);
        }
        e += g * occ;
      }
      return Math.min(1, e);
    };
    /** A vertex's light, by what it is (the game's own curves). */
    const vertexLight = (base: number, gain: number) => (wx: number, wz: number, nx: number, nz: number): number => {
      const cx = Math.floor(wx / CELL);
      const cy = Math.floor(wz / CELL);
      const b = styleBright(inside(cx, cy) ? styleAt(cx, cy) : null);
      const e = lightAt(wx, wz, nx, nz);
      if (piped) return (0.05 + 1.3 * e) * b;
      if (lobby && inside(cx, cy)) return (base * (lookAt(cx, cy).ambient ?? 1) + gain * e) * b;
      return (base + gain * e) * b;
    };
    const SURF: Record<"floor" | "wall" | "ceil", [number, number]> = { floor: [0.9, 0.32], wall: [0.89, 0.3], ceil: [0.88, 0.38] };
    // floors and solid blocks
    const mats = new Map<number, THREE.MeshStandardMaterial>();
    const mat = (c: number): THREE.MeshStandardMaterial => {
      let m = mats.get(c);
      if (!m) mats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, vertexColors: true })));
      return m;
    };
    const box = (c: number | THREE.Material, x: number, y0: number, z: number, sx: number, sy: number, sz: number, uv?: { u: number; v: number; light: number }, surf?: "floor" | "wall" | "ceil"): void => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const cy0 = y0 + sy / 2;
      // in the Lights view a surface samples the room's light field at every
      // vertex (nudged a hair towards the box's middle, off the cell lines)
      const light =
        lit && surf
          ? (lx: number, _ly: number, lz: number, nx: number, nz: number) => {
              const wx = x + lx * 0.98;
              const wz = z + lz * 0.98;
              return vertexLight(SURF[surf][0], SURF[surf][1])(wx, wz, surf === "wall" ? nx : 0, surf === "wall" ? nz : 0);
            }
          : (uv?.light ?? 1);
      if (uv) dress(g, sx, sy, sz, uv.u, uv.v, light);
      else shade(g, light);
      const mesh = new THREE.Mesh(g, typeof c === "number" ? mat(c) : c);
      mesh.position.set(x, cy0, z);
      group.add(mesh);
    };
    const fixtureCell = new Set<number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const code = t.deco[I(x, y)];
        const k = code >> 4;
        if (!pools && k === 10) fixtureCell.add(I(x, y));
      }
    }
    for (const p of t.pieces) if (t.dia.blocks[p.k]) for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) fixtureCell.add(I(xx, yy));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        const f = t.hgt[I(x, y)] * STEP;
        const cx = x * CELL + 1;
        const cz = y * CELL + 1;
        const base = -6;
        const fm = floorMatAt(x, y);
        if (fm) box(fm, cx, base, cz, CELL, f - base, CELL, { u: 1, v: 1, light: lightOf(x, y) }, "floor");
        else box(FLOOR_COLOR[typeAt(x, y)] ?? 0x666666, cx, base, cz, CELL, f - base, CELL, undefined, "floor");
        if (t.cell[I(x, y)] === 2 && !fixtureCell.has(I(x, y))) {
          const top = walking ? world.ceilAt(x, y) - f : 3.2;
          const wm = wallMatAt(x, y);
          if (wm) box(wm, cx, f, cz, CELL, top, CELL, { u: PAPER_U_M, v: PAPER_V_M, light: lightOf(x, y) }, "wall");
          else box(0x4a4640, cx, f, cz, CELL, top, CELL, undefined, "wall");
        }
        // THE STAIRS: real steps, as the game draws them (backrooms/stairs.ts)
        const side = t.stair[I(x, y)];
        if (side >= 0) {
          const spec = t.def.stairs ?? {};
          const surf = spec.tex ? shapeSurface(spec.tex) : null;
          const base = surf?.mat ?? floorMatAt(x, y) ?? mat(FLOOR_COLOR[typeAt(x, y)] ?? 0x666666);
          const sameFlight = (sd: number): boolean => {
            const nx = x + [0, 1, 0, -1][sd];
            const ny = y + [-1, 0, 1, 0][sd];
            return inside(nx, ny) && t.stair[I(nx, ny)] === side;
          };
          const openSide = (sd: number): boolean => {
            const nx = x + [0, 1, 0, -1][sd];
            const ny = y + [-1, 0, 1, 0][sd];
            if (wallOn(x, y, sd) || !inside(nx, ny) || t.cell[I(nx, ny)] === 2) return false;
            return t.stair[I(nx, ny)] !== side;
          };
          const built = stairGeometry(
            {
              x0: x * CELL, z0: y * CELL, cell: CELL, y0: f, rise: STEP, side, spec,
              railLeft: openSide((side + 3) % 4), railRight: openSide((side + 1) % 4),
              edgeLeft: !sameFlight((side + 3) % 4), edgeRight: !sameFlight((side + 1) % 4),
              uM: surf?.uM ?? 1, vM: surf?.vM ?? 1,
            },
            lit ? (sx, sz) => vertexLight(...SURF.floor)(sx, sz, 0, 0) : lightOf(x, y),
          );
          group.add(new THREE.Mesh(built.treads, tintedStairMat(base, spec.tex ?? `floor${base.uuid}`, spec.col)));
          if (built.rails) group.add(new THREE.Mesh(built.rails, stairRailMat()));
        }
        // walking: put a lid on it
        if (walking && t.cell[I(x, y)] !== 2) {
          const lid = new THREE.PlaneGeometry(CELL, CELL);
          const lidLight = lit ? vertexLight(...SURF.ceil)(cx, cz, 0, 0) : lightOf(x, y);
          lid.setAttribute("color", new THREE.Float32BufferAttribute(new Array(12).fill(lidLight), 3));
          const m = new THREE.Mesh(lid, ceilMatAt(x, y) ?? mat(pools ? 0xe8eeee : 0x3a3834));
          m.rotation.x = Math.PI / 2;
          m.position.set(cx, world.ceilAt(x, y), cz);
          group.add(m);
        }
      }
    }
    // walls — half height from above so the room reads, full height walking —
    // and the doorways
    const wallMat = 0xb8b0a0;
    const wallLook = (a: [number, number], b: [number, number]): { m: THREE.Material; light: number } | null => {
      const [x, y] = inside(a[0], a[1]) ? a : b;
      const m = wallMatAt(x, y);
      return m ? { m, light: lightOf(x, y) } : null;
    };
    const wallTop = (a: [number, number], b: [number, number], f: number): number => {
      if (!walking) return Math.max(0, f) + 1.4;
      const c = Math.max(inside(a[0], a[1]) ? world.ceilAt(a[0], a[1]) : -99, inside(b[0], b[1]) ? world.ceilAt(b[0], b[1]) : -99);
      return c;
    };
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x <= w; x++) {
        // N edge of (x,y) = between (x,y-1) and (x,y)
        if (x < w && wallOn(x, y, 0)) {
          const f = Math.max(inside(x, y) ? t.hgt[I(x, y)] : -99, inside(x, y - 1) ? t.hgt[I(x, y - 1)] : -99) * STEP;
          const lo = Math.min(f, 0) - 6;
          const hi = wallTop([x, y], [x, y - 1], f);
          const lk = wallLook([x, y], [x, y - 1]);
          if (lk) box(lk.m, x * CELL + 1, lo, y * CELL, CELL, hi - lo, 0.2, { u: PAPER_U_M, v: PAPER_V_M, light: lk.light }, "wall");
          else box(wallMat, x * CELL + 1, lo, y * CELL, CELL, hi - lo, 0.2, undefined, "wall");
        }
        if (y < h && wallOn(x, y, 3)) {
          const f = Math.max(inside(x, y) ? t.hgt[I(x, y)] : -99, inside(x - 1, y) ? t.hgt[I(x - 1, y)] : -99) * STEP;
          const lo = Math.min(f, 0) - 6;
          const hi = wallTop([x, y], [x - 1, y], f);
          const lk = wallLook([x, y], [x - 1, y]);
          if (lk) box(lk.m, x * CELL, lo, y * CELL + 1, 0.2, hi - lo, CELL, { u: PAPER_U_M, v: PAPER_V_M, light: lk.light }, "wall");
          else box(wallMat, x * CELL, lo, y * CELL + 1, 0.2, hi - lo, CELL, undefined, "wall");
        }
      }
    }
    for (const s of t.sockets) {
      const lx = s.side === 0 || s.side === 2 ? 1 : 0;
      for (let k = 0; k < s.w; k++) {
        const x = s.x + lx * k;
        const y = s.y + (1 - lx) * k;
        const f = t.hgt[I(x, y)] * STEP;
        const ex = x * CELL + 1 + [0, 1, 0, -1][s.side] * 1;
        const ez = y * CELL + 1 + [-1, 0, 1, 0][s.side] * 1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(lx ? CELL : 0.3, 2.2, lx ? 0.3 : CELL), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.45 }));
        m.position.set(ex, f + 1.1, ez);
        group.add(m);
        // walking: the wall carries on over the doorway, as the game builds it
        if (walking) {
          const top = world.ceilAt(x, y);
          const lwm = wallMatAt(x, y);
          const lk = lwm ? { m: lwm, light: lightOf(x, y) } : null;
          const sx = lx ? CELL : 0.2;
          const sz = lx ? 0.2 : CELL;
          if (top > f + 2.4) {
            if (lk) box(lk.m, ex, f + 2.4, ez, sx, top - f - 2.4, sz, { u: PAPER_U_M, v: PAPER_V_M, light: lk.light }, "wall");
            else box(wallMat, ex, f + 2.4, ez, sx, top - f - 2.4, sz, undefined, "wall");
          }
        }
      }
    }
    if (t.dia.level === 2) {
      const built = buildPipeFixtures(world, 0, 0, Math.max(w, h), lit ? (px, pz) => lightAt(px, pz) : () => 0.7);
      for (const m of built.meshes) group.add(m);
    } else if (pools) {
      // THE WATER: one sheet at the table over every wet cell
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x3fb4d8, transparent: true, opacity: 0.55, roughness: 0.15 });
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!inside(x, y) || t.cell[I(x, y)] !== 1 || !wetFloor(t.hgt[I(x, y)])) continue;
          const sheet = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), waterMat);
          sheet.rotation.x = -Math.PI / 2;
          sheet.position.set(x * CELL + 1, WATER_TABLE * STEP, y * CELL + 1);
          group.add(sheet);
        }
      }
      const white = 0xf2f4f4;
      for (const p of t.pieces) {
        const f = t.hgt[I(p.x, p.y)] * STEP;
        const cx = p.x * CELL + (p.w * CELL) / 2;
        const cz = p.y * CELL + (p.h * CELL) / 2;
        if (p.k === "pillar" || p.k === "spiralcore") {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(p.w * 0.95, p.w * 0.95, 7, 20), mat(p.k === "pillar" ? white : 0xe6e0cc));
          drum.position.set(cx, f - 1 + 3.5, cz);
          group.add(drum);
        } else if (p.k === "arch" || p.k === "portal") {
          const span = p.k === "portal" ? 3 * CELL : CELL * 1.2;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(span / 2, p.k === "portal" ? 0.35 : 0.25, 8, 24, p.k === "portal" ? Math.PI * 2 : Math.PI), mat(white));
          ring.position.set(cx, f + (p.k === "portal" ? span / 2 : 2.4), cz);
          if (p.o === 1) ring.rotation.y = Math.PI / 2;
          group.add(ring);
        } else if (p.k === "bridge") {
          box(0xb98a5a, cx, f - 0.1, cz, CELL, 0.1, CELL);
        } else if (p.k === "skylight") {
          box(0xfff4b0, cx, world.ceilAt(p.x, p.y) - 0.1, cz, CELL * 0.8, 0.06, CELL * 0.8);
        } else if (p.k === "door") {
          box(0xff3a3a, cx, f, cz, CELL * 1.8, 3.2, 0.25);
        } else if (p.k === "porthole" || p.k === "cubby" || p.k === "ladder") {
          const dx = [0, 1, 0, -1][p.o] * (CELL / 2 - 0.15);
          const dz = [-1, 0, 1, 0][p.o] * (CELL / 2 - 0.15);
          const c = p.k === "porthole" ? 0x5cc8ff : p.k === "cubby" ? 0xd8c7a4 : 0xdfe7ee;
          box(c, cx + dx, p.k === "porthole" ? f + 1.4 : f, cz + dz, p.o % 2 ? 0.25 : CELL * 0.7, p.k === "porthole" ? 0.6 : p.k === "cubby" ? 0.5 : 1.6, p.o % 2 ? CELL * 0.7 : 0.25);
        }
      }
    }
    // THE LIGHTS VIEW: the panels (Level 0, the Poolrooms), glowing where
    // they hang; the flickering ones flicker
    flickering = [];
    if (lit && !piped) {
      const panelMat = new THREE.MeshBasicMaterial({ color: 0xf4ead0, side: THREE.DoubleSide });
      for (const sp of spots) {
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panelMat);
        pan.rotation.x = Math.PI / 2;
        pan.position.set(sp.px, ceilAt(sp.x, sp.y) - 0.03, sp.pz);
        group.add(pan);
        const st = styleAt(sp.x, sp.y);
        const share = lobby ? (lookAt(sp.x, sp.y).flicker ?? 0.025) : st?.flicker !== undefined ? st.flicker / 100 : 0;
        const hash = ((Math.imul(sp.x, 2654435761) ^ Math.imul(sp.y, 40503)) >>> 0) % 1000;
        if (hash < share * 1000) flickering.push({ m: pan, seed: hash });
      }
    }
    // the kit props (a sign is drawn, not loaded)
    floorUnder = (x, y) => (inside(x, y) ? t.hgt[I(x, y)] * STEP : 0);
    t.props.forEach((pl, drawn) => {
      // the room's own index, not the drawn one (a skipped prop leaves a gap)
      const k = t.propSrc?.[drawn] ?? drawn;
      const v = kitVariant(pl);
      if (!v) return;
      const cx = Math.floor(pl.x);
      const cy = Math.floor(pl.y);
      const floor = inside(cx, cy) ? t.hgt[I(cx, cy)] * STEP : 0;
      const place = (o: THREE.Object3D): void => {
        o.position.set(pl.x * CELL, floor + pl.z, pl.y * CELL);
        o.rotation.set(((pl.rx ?? 0) * Math.PI) / 180, (-pl.r * Math.PI) / 180, ((pl.rz ?? 0) * Math.PI) / 180, "YXZ");
        o.userData.k = k;
        propGroup.add(o);
        if (k === selected && !walking) {
          const shapeSel = isShapeFile(v.file);
          sizeBtn.hidden = !shapeSel;
          if (handleMode === "scale" && !shapeSel) handleMode = "translate";
          handle.attach(o);
          handle.setMode(handleMode);
          handle.setSpace(handleMode === "translate" ? "world" : "local");
          for (const b of modeBox.querySelectorAll("button")) b.classList.toggle("on", b.dataset.m === handleMode);
          modeBox.hidden = false;
        }
      };
      if (isSignFile(v.file)) {
        const sg = makeSign(v.file, pl.text);
        sg.userData.ownMat = true;
        place(sg);
      } else if (isShapeFile(v.file)) {
        const size = kitSize(pl)!;
        const o = makeShape(v.file, { sx: size[0], sy: size[1], sz: size[2], tex: pl.tex, col: pl.col }, shapeSurface);
        o.userData.size = size;
        o.userData.ownGeo = true; // its material is the shared surface's
        place(o);
      }
      else
        void model(v.file).then((src) => {
          if (!src || mine !== gen) return; // a newer draw replaced this one
          place(src.clone(true));
        });
    });
    // the game markers: a creature a coloured shape standing where it spawns,
    // a relic or drive spot a small glowing marker
    for (const m of t.marks) {
      const d = MARK.get(m.k);
      if (!d) continue;
      const cx = Math.floor(m.x);
      const cy = Math.floor(m.y);
      const floor = inside(cx, cy) ? t.hgt[I(cx, cy)] * STEP : 0;
      const col = new THREE.Color(d.color);
      const mat2 = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75 });
      const g = d.creature
        ? new THREE.Mesh(m.k === "gator" ? new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20) : new THREE.CylinderGeometry(0.28, 0.4, 2.2, 12), mat2)
        : new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat2);
      const y = m.k === "gator" ? Math.max(floor, WATER_TABLE * STEP) + 0.08 : d.creature ? floor + 1.1 : floor + 0.9;
      g.position.set(m.x * CELL, y, m.y * CELL);
      group.add(g);
    }

    // ---- what walk mode walks on
    const R = 0.25; // body radius, cells
    const blockers = t.props.filter((pl) => kitBlocks(pl));
    // scenery (floor no door reaches) is drawn, never walked into — as in the game
    const open = (x: number, y: number): boolean => inside(x, y) && t.cell[I(x, y)] === 1 && !t.scenery[I(x, y)];
    const propBlocks = (x: number, y: number): boolean =>
      blockers.some((pl) => kitCovers(pl, x, y) || kitCovers(pl, x + R, y) || kitCovers(pl, x - R, y) || kitCovers(pl, x, y + R) || kitCovers(pl, x, y - R));
    // start at the open cell nearest the room's middle that no prop stands on
    let spawn = { x: w / 2, y: h / 2 };
    let best = Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!open(x, y) || propBlocks(x + 0.5, y + 0.5)) continue;
        const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
        if (d < best) {
          best = d;
          spawn = { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    nav = {
      inside,
      open,
      wallOn,
      floor: (x, y) => (inside(x, y) ? t.hgt[I(x, y)] * STEP : 0),
      ground: (px, py) => {
        const x = Math.floor(px);
        const y = Math.floor(py);
        if (!inside(x, y)) return 0;
        const f0 = t.hgt[I(x, y)] * STEP;
        const sd = t.stair[I(x, y)];
        if (sd < 0) return f0;
        const fx = px - x;
        const fy = py - y;
        const up = sd === 0 ? 1 - fy : sd === 1 ? fx : sd === 2 ? fy : 1 - fx;
        return f0 + STEP * up;
      },
      steps: (x, y) => (inside(x, y) ? t.hgt[I(x, y)] : 0),
      propBlocks,
      spawn,
    };

    // frame the tile the first time it's shown (and when its size changes)
    const key = `${t.id}:${w}x${h}`;
    if (key !== lastKey) {
      lastKey = key;
      const cx = (w * CELL) / 2;
      const cz = (h * CELL) / 2;
      const r = Math.max(w, h) * CELL;
      if (walking) {
        px = spawn.x;
        py = spawn.y;
      } else {
        controls.target.set(cx, 0, cz);
        camera.position.set(cx + r * 0.55, r * 0.75, cz + r * 0.85);
      }
    }
  }

  /** Glide the camera and what it orbits: WASD across the room (relative to
   *  where the camera looks), Q/E down and up, Shift faster. The speed scales
   *  with how far out the camera sits, so a big room crosses as fast as a
   *  small one. */
  const flyFwd = new THREE.Vector3();
  const flyMove = new THREE.Vector3();
  function fly(dt: number): void {
    if (!flyKeys.size) return;
    const f = (flyKeys.has("w") ? 1 : 0) - (flyKeys.has("s") ? 1 : 0);
    const r = (flyKeys.has("d") ? 1 : 0) - (flyKeys.has("a") ? 1 : 0);
    const u = (flyKeys.has("e") ? 1 : 0) - (flyKeys.has("q") ? 1 : 0);
    if (!f && !r && !u) return;
    // forward is where the camera LOOKS, up and down included (Unreal's W);
    // A / D slide level, Q / E go straight down and up
    camera.getWorldDirection(flyFwd);
    const hx = flyFwd.x;
    const hz = flyFwd.z;
    const hl = Math.hypot(hx, hz) || 1;
    flyMove.set(flyFwd.x * f - (hz / hl) * r, flyFwd.y * f + u, flyFwd.z * f + (hx / hl) * r);
    if (flyMove.lengthSq() < 1e-6) return;
    const sp = flySpeed() * (flyKeys.has("shift") ? 3 : 1) * dt;
    flyMove.normalize().multiplyScalar(sp);
    camera.position.add(flyMove);
    controls.target.add(flyMove);
  }

  /** Metres a second: quick enough to cross a big room, slow enough to
   *  line up on a prop. */
  function flySpeed(): number {
    return Math.max(5, Math.min(30, camera.position.distanceTo(controls.target) * 0.5));
  }
  /** Turn the camera where it stands: swing what it looks at round it. */
  const lookV = new THREE.Vector3();
  function lookBy(dx: number, dy: number): void {
    lookV.subVectors(controls.target, camera.position);
    const dist = Math.max(0.5, lookV.length());
    let yaw = Math.atan2(lookV.x, lookV.z);
    let pitch = Math.asin(Math.max(-1, Math.min(1, lookV.y / dist)));
    yaw -= dx * 0.0042;
    pitch = Math.max(-1.52, Math.min(1.52, pitch - dy * 0.0042));
    lookV.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    controls.target.copy(camera.position).add(lookV);
  }
  let looking: { x: number; y: number } | null = null;
  const onLookDown = (e: PointerEvent): void => {
    // the move handle owns a drag that starts on it
    if (walking || e.button !== 0 || handle.axis) return;
    looking = { x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e: PointerEvent): void => {
    if (!looking || walking) return;
    if (!(e.buttons & 1) || handle.dragging) {
      looking = null;
      return;
    }
    const dx = e.clientX - looking.x;
    const dy = e.clientY - looking.y;
    looking = { x: e.clientX, y: e.clientY };
    lookBy(dx, dy);
  };
  const onLookUp = (): void => {
    looking = null;
  };
  /** The wheel steps the camera itself forward and back along its view. */
  const onWheel = (e: WheelEvent): void => {
    if (walking) return;
    e.preventDefault();
    camera.getWorldDirection(flyFwd);
    const step = -Math.sign(e.deltaY) * Math.max(0.6, flySpeed() * 0.12) * Math.min(3, Math.abs(e.deltaY) / 100 || 1);
    flyMove.copy(flyFwd).multiplyScalar(step);
    camera.position.add(flyMove);
    controls.target.add(flyMove);
  };
  canvas.addEventListener("pointerdown", onLookDown);
  window.addEventListener("pointermove", onLookMove);
  window.addEventListener("pointerup", onLookUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // ---- walking
  function stepWalk(dt: number): void {
    const n = nav;
    if (!n) return;
    const f = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    const r = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    if (f || r) {
      // the game's own speeds (backrooms/controller.ts)
      const sp = (keys.has("shift") ? SPRINT_SPEED : WALK_SPEED) * dt;
      const len = Math.hypot(f, r);
      const fx = -Math.sin(yaw);
      const fy = -Math.cos(yaw);
      const dx = ((fx * f + Math.cos(yaw) * r) / len) * sp;
      const dy = ((fy * f - Math.sin(yaw) * r) / len) * sp;
      px = tryAxis(n, px, py, dx, true);
      py = tryAxis(n, px, py, dy, false);
    }
    const target = n.ground(px, py) + 1.6;
    eye += (target - eye) * Math.min(1, dt * 10);
    camera.position.set(px * CELL, eye, py * CELL);
    camera.rotation.set(pitch, yaw, 0);
  }

  /** Move along one axis unless a wall, a solid cell, a step up of more than
   *  one, or a solid prop is in the way (THE CLIMB RULE without the jump). */
  function tryAxis(n: Nav, x: number, y: number, d: number, alongX: boolean): number {
    if (!d) return alongX ? x : y;
    const R = 0.25;
    const from = alongX ? x : y;
    const to = from + d;
    const lead = to + Math.sign(d) * R;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const a = Math.floor(from);
    const b = Math.floor(lead);
    if (a !== b) {
      const side = alongX ? (d > 0 ? 1 : 3) : d > 0 ? 2 : 0;
      const nx = alongX ? b : cx;
      const ny = alongX ? cy : b;
      if (n.wallOn(cx, cy, side) || !n.open(nx, ny) || n.steps(nx, ny) - n.steps(cx, cy) > 1) return from;
    }
    if (alongX ? n.propBlocks(lead, y) : n.propBlocks(x, lead)) return from;
    return to;
  }

  const locked = (): boolean => document.pointerLockElement === canvas;
  function grabMouse(): void {
    acquirePointerLock(canvas, {
      raw: false,
      env: { hasApi: typeof (canvas as HTMLElement & { requestPointerLock?: unknown }).requestPointerLock === "function", isMac, isShell: isDesktopShell },
      onFallback: () => {
        if (!walking) return; // the walk ended while the lock was still being asked for
        pseudoLock = true;
        fbLast = null;
        host.classList.add("nocursor");
        hint.textContent = "Move the mouse to look · arrow keys turn too · WASD walk · Shift run · Esc stops";
      },
      onUnlocked: () => {
        hint.textContent = "Click the view to look around (or use the arrow keys) · WASD walk · Esc stops";
      },
    });
  }

  function startWalk(): void {
    if (walking || !cur || !nav) return;
    walking = true;
    setBig(false);
    handle.detach();
    saved = { pos: camera.position.clone(), target: controls.target.clone() };
    controls.enabled = false;
    host.classList.add("walking");
    walkBtn.textContent = "Stop walking (Esc)";
    hint.hidden = false;
    hint.textContent = "WASD walk · Shift run · mouse or arrow keys look · Esc stops";
    show(cur, curSel); // full-height walls and a ceiling
    if (!nav) return;
    const n: Nav = nav;
    px = n.spawn.x;
    py = n.spawn.y;
    eye = n.floor(Math.floor(px), Math.floor(py)) + 1.6;
    yaw = 0;
    pitch = 0;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    roomLight.intensity = lit ? 0 : 1.1;
    grabMouse();
  }

  function stopWalk(): void {
    if (!walking) return;
    walking = false;
    pseudoLock = false;
    fbLast = null;
    host.classList.remove("nocursor");
    keys.clear();
    if (locked()) document.exitPointerLock();
    host.classList.remove("walking");
    walkBtn.textContent = "Walk it";
    hint.hidden = true;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    roomLight.intensity = 0;
    controls.enabled = true;
    if (saved) {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
    }
    show(cur, curSel);
  }

  walkBtn.onclick = () => (walking ? stopWalk() : startWalk());
  let downAt: { x: number; y: number } | null = null;
  const ray = new THREE.Raycaster();
  const onDown = (e: PointerEvent): void => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent): void => {
    const d = downAt;
    downAt = null;
    if (walking || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || handle.dragging || handle.axis) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    for (const hit of ray.intersectObjects(propGroup.children, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.k === undefined) o = o.parent;
      if (o) {
        hooks.onPick?.(o.userData.k as number);
        return;
      }
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  const onBigKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !walking && host.classList.contains("big")) setBig(false);
  };
  window.addEventListener("keydown", onBigKey);
  const onCanvasDown = (): void => {
    if (walking && !pseudoLock && !locked()) grabMouse();
  };
  canvas.addEventListener("mousedown", onCanvasDown);
  const onMove = (e: MouseEvent): void => {
    if (!walking) return;
    let dx = e.movementX;
    let dy = e.movementY;
    if (!locked()) {
      if (!pseudoLock) return;
      // movementX where the webview gives it, position differences where it
      // doesn't; a jump the size of the pointer leaving and re-entering the
      // window is dropped, not turned into a whip of the camera (the game's rule)
      if (typeof dx !== "number" || typeof dy !== "number") {
        dx = fbLast ? e.clientX - fbLast.x : 0;
        dy = fbLast ? e.clientY - fbLast.y : 0;
      }
      fbLast = { x: e.clientX, y: e.clientY };
      if (isTeleport(dx, dy)) return;
      dx *= 1.5;
      dy *= 1.5;
    }
    yaw -= dx * 0.0022;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * 0.0022));
  };
  document.addEventListener("mousemove", onMove);
  // Esc on a real lock releases it (the browser's own key): that ends the walk
  let hadLock = false;
  const onLockChange = (): void => {
    // a cooldown retry that lands after the walk ended gives the mouse back
    // (Oct 2026 review: it hid the cursor over the editor)
    if (locked() && !walking) {
      document.exitPointerLock();
      return;
    }
    if (locked()) hadLock = true;
    else if (walking && hadLock) {
      hadLock = false;
      stopWalk();
    }
  };
  document.addEventListener("pointerlockchange", onLockChange);
  // While walking the keys are the walk's: the editor's own shortcuts (R
  // turns a prop, arrows nudge it, Delete removes it) must not fire behind it.
  const WALK_KEYS = new Set(["w", "a", "s", "d", "shift", "arrowleft", "arrowright", "arrowup", "arrowdown"]);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!walking) return;
    const k = e.key.toLowerCase();
    if (k === "escape") stopWalk();
    else if (WALK_KEYS.has(k)) keys.add(k);
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!walking) return;
    keys.delete(e.key.toLowerCase());
    e.stopImmediatePropagation();
  };
  const onBlur = (): void => {
    keys.clear();
    flyKeys.clear();
  };
  // ---- FLY: WASD over the view (not while walking — the walk owns the keys
  // then — and never while typing in one of the editor's fields)
  const FLY_KEYS = new Set(["w", "a", "s", "d", "q", "e", "shift"]);
  const onFlyDown = (e: KeyboardEvent): void => {
    if (walking || !hovered || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (!FLY_KEYS.has(k)) return;
    flyKeys.add(k);
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onFlyUp = (e: KeyboardEvent): void => {
    flyKeys.delete(e.key.toLowerCase());
  };
  const onEnter = (): void => {
    hovered = true;
  };
  const onLeave = (): void => {
    hovered = false;
    flyKeys.clear();
  };
  host.addEventListener("pointerenter", onEnter);
  host.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onFlyDown, true);
  window.addEventListener("keyup", onFlyUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);

  return {
    show,
    setSnap(m: number): void {
      snapM = m;
      applySnap();
    },
    dispose(): void {
      cancelAnimationFrame(raf);
      handle.detach();
      handle.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onBigKey);
      if (locked()) document.exitPointerLock();
      canvas.removeEventListener("mousedown", onCanvasDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onLookDown);
      window.removeEventListener("pointermove", onLookMove);
      window.removeEventListener("pointerup", onLookUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onFlyDown, true);
      window.removeEventListener("keyup", onFlyUp, true);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      clear();
      // dispose() alone leaves the GL context alive (Oct 2026 review: one
      // leaked per editor open — the house rule is forceContextLoss too)
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      delete (window as unknown as { __mePreview?: unknown }).__mePreview;
    },
  };
}
