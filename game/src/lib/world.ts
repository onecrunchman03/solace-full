// The Level 0 renderer — blockout tier, tuned toward the Kane Pixels look
// with zero texture assets: mono-yellow surfaces under warm fluorescent
// haze, distance dissolving into GLOW (fog toward light, never black), an
// unbroken panel grid overhead. Real materials arrive in the aesthetics
// pass; the geometry, palette, and haze are the bones the look-test judges.
//
// Coordinates: 1 cell = 2m. Cell (x,y) → world (x*2, 0, y*2); +x east,
// +z south. Walls sit ON cell edges (thin drywall), ceiling at 3m.

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ChunkData } from "./gamenet";

export const CELL = 2; // meters
export const WALL_H = 3; // the BASE height — districts vary from it
export const EYE = 1.65;

// Ceiling height varies by district (Josh: the flat 3m everywhere was
// monotonous): grand pillar halls soar, warrens press down on you. Heights
// derive from the district map, so every client agrees without extra wire.
// Raised across the board THREE times (Josh: still felt cramped) — warrens
// stay the low, pressing exception.
const HEIGHT_BY_TYPE: Record<string, number> = {
  classic: 4.4,
  halls: 5.2,
  pillars: 6.0,
  offices: 3.7,
  warrens: 3.1,
};

// The dark — per the pack's reference renders: the deep distance falls into
// near-black brown murk; light lives in pools under the panels.
export const FOG_COLOR = 0x2e2817;

const PANEL_COLOR = 0xf4ead0; // warm face, visible tube — bloom does the rest

// ---- Materials (Josh's texture pack) ---------------------------------------
// TheBackroomsAndPoolrooms pack, staged by scripts/prepare-assets.mjs. The
// pack IS the palette — no tinting. Three wallpaper variants give districts
// their own flavor (which paper a zone wears comes from the welcome frame's
// district types). Repeats are INTEGER per 32m chunk span so tiling aligns
// seamlessly across chunk boundaries.

function tex(url: string, repeatX: number, repeatY: number, srgb: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Baked light pools -----------------------------------------------------
// The reference renders are lit in POOLS under each panel. Panels sit on a
// strict grid (one per 2×2 cells, at cell (0.5, 1.5) of each tile), so the
// entire lighting solution BAKES into aligned repeating canvas textures —
// zero runtime lights. Chunk origins are multiples of 16 cells, so an
// 8-repeats-per-chunk texture lines up globally, forever.

/** Floor: dark LOOP-PILE carpet — light arrives as pool quads under the
 *  REAL panels, never baked to the grid (a skipped fixture must leave
 *  darkness). Josh's berber reference sets the scale: the texture is ONE
 *  METER (512px/m), packed with ~8mm loops drawn as shadow-ring +
 *  offset-highlight pairs, so the nap reads as thousands of tiny loops —
 *  never blobs. Loop noise is self-similar, so the 1m repeat is invisible. */
function floorCanvas(): THREE.CanvasTexture {
  const S = 512; // ONE METER of carpet
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  // Yellower, less brown (Josh) — mustard base, loop tops leaning gold.
  g.fillStyle = "#463d1c";
  g.fillRect(0, 0, S, S);
  const STEP = 5; // loop pitch ≈ 10mm
  for (let gy = 0; gy < S / STEP; gy++) {
    for (let gx = 0; gx < S / STEP; gx++) {
      const x = gx * STEP + 2.5 + (Math.random() - 0.5) * 3.4;
      const y = gy * STEP + 2.5 + (Math.random() - 0.5) * 3.4;
      const r = 1.7 + Math.random() * 1.1;
      // Shadow ring, then a top-left highlight — the classic drawn loop.
      g.fillStyle = "rgba(42,36,15,0.8)";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      const v = 76 + Math.floor(Math.random() * 34) + (Math.random() < 0.06 ? 26 : 0);
      g.fillStyle = `rgb(${v + 7},${v},${Math.floor(v * 0.45)})`;
      g.beginPath();
      g.arc(x - 0.6, y - 0.6, r * 0.62, 0, Math.PI * 2);
      g.fill();
    }
  }
  // NO wear-mottle layer: the soft blotches read as blurry stains on the
  // pile (Josh: remove) — the carpet is uniform loop noise, nothing else.
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(32, 32); // 1m per tile across the 32m chunk floor
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ceiling: a DROP ceiling — 3×3 tiles per cell (≈0.67m, the real-world
 *  600mm acoustic tile) under a visible dark T-bar grid. Fixtures are sized
 *  and aligned to occupy exactly two tiles (Josh's spec). Panel spill comes
 *  from the per-vertex light field, not the texture. */
export const CEIL_TILES = 3; // tiles per cell edge — panel size/alignment derive from it
function ceilingCanvas(): THREE.CanvasTexture {
  const S = 510; // divisible by 3 — crisp tile borders
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#8a7d4e";
  g.fillRect(0, 0, S, S);
  const img = new Image();
  img.onload = () => {
    const T = S / CEIL_TILES; // one CELL (2m) of ceiling = 3×3 tiles
    for (let y = 0; y < CEIL_TILES; y++) {
      for (let x = 0; x < CEIL_TILES; x++) g.drawImage(img, x * T, y * T, T, T);
    }
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#aaa172"; // a touch of yellow (Josh), off the gray-brown
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "source-over";
    // The T-BAR GRID — the dark metal frame between tiles is what makes a
    // drop ceiling read as a drop ceiling (Josh, vs the references).
    g.strokeStyle = "#3f3a26";
    g.lineWidth = Math.max(2, S / 170);
    for (let k = 0; k <= CEIL_TILES; k++) {
      g.beginPath();
      g.moveTo(k * T, 0);
      g.lineTo(k * T, S);
      g.stroke();
      g.beginPath();
      g.moveTo(0, k * T);
      g.lineTo(S, k * T);
      g.stroke();
    }
    t.needsUpdate = true;
  };
  img.src = "/assets/br/ceiling_color.png";
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1); // ceiling renders as per-cell quads (heights vary)
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- THE LIGHT DOCTRINE (settled after Josh's artifact rounds) -------------
// NO additive light quads anywhere — not on walls (they overhung corners:
// "lighting hitting an invisible wall"), not on the ceiling (they floated
// mid-air at height steps: "the same wall catching light but on the
// ceiling"), not on the floor (they bled under walls and streaked at
// grazing angles). EVERY surface — floor, walls, ceiling — bakes the
// fixture light field PER VERTEX at build time. Panels themselves stay
// emissive (bloom supplies the halo). Nothing floats, nothing clips,
// nothing tracks the player.
// Fascia, end caps, and corner posts all wear the WALLPAPER — the gray flat
// materials read as missing textures (Josh). World-scale UVs (boxGeo) make
// a 0.3m face show a correct 0.3m slice of paper instead of the old
// full-texture smear, so nothing needs a placeholder tone.

/** Wallpaper at REFERENCE SCALE (one texture ≈ 4m of wall, full height) with
 *  a baked vertical light gradient — lit at the ceiling, dark at the base. */
function wallCanvas(n: 1 | 2 | 3): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#b2a66c";
  g.fillRect(0, 0, S, S);
  const img = new Image();
  img.onload = () => {
    // Soften the paper: the raw patterns are high-contrast; the references
    // read matte and faded. Draw over a warm base at partial alpha under a
    // FLAT tone — no baked vertical gradient (it striped the wall tops;
    // the scene lights do the shading now). Lightened off the old
    // dark-mustard cast (Josh) — pattern presence up, tone up.
    g.fillStyle = "#b6ab7c";
    g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.62;
    // OVERSCAN the source ~1%: the pack images carry a light border row
    // (atlas padding) that texture filtering smeared into a white line at
    // the top and bottom of every wall (Josh's snips). Cropping the edge
    // texels off kills the band at both V seams.
    g.drawImage(img, -12, -12, S + 24, S + 24);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#a89d74";
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "source-over";
    // NO baked shading gradient here: the lit-from-above falloff lives in
    // VERTEX COLORS (boxGeo) so it spans each wall exactly once at any
    // height — in the texture it would tile when V repeats on tall walls.
    t.needsUpdate = true;
  };
  img.src = `/assets/br/wall${n}_color.png`;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  // repeat stays (1,1): wall geometry bakes WORLD-scale UVs (pattern spans
  // 4m in U, 3m in V on every face, whatever the wall's size).
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Carpet is LAMBERT — zero specular lobe. StandardMaterial (even at
// roughness 1) keeps a sheen, and the normal map shimmered under the panels
// as you moved (Josh: "less reflective… it needs to look like carpet").
// The nap lives in the texture's fiber grain, not in directional response.
const floorMat = new THREE.MeshLambertMaterial({ map: floorCanvas(), vertexColors: true });
const ceilMat = new THREE.MeshStandardMaterial({
  map: ceilingCanvas(),
  roughness: 1,
  vertexColors: true,
});
function wallVariant(n: 1 | 2 | 3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: wallCanvas(n),
    normalMap: tex(`/assets/br/wall${n}_normal.png`, 1, 1, false),
    roughnessMap: tex(`/assets/br/wall${n}_rough.png`, 1, 1, false),
    roughness: 0.75,
    // The lit-from-above gradient rides the geometry (see boxGeo).
    vertexColors: true,
  });
}
const wallMats = [wallVariant(1), wallVariant(2), wallVariant(3)];
/** district type → wallpaper index (classic wears the classic paper). */
export const WALL_BY_TYPE: Record<string, number> = {
  classic: 0,
  halls: 0,
  pillars: 0,
  offices: 1,
  warrens: 2,
};
const panelMat = new THREE.MeshBasicMaterial({
  map: tex("/assets/br/panel_color.png", 1, 1, true),
  color: PANEL_COLOR,
});
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2618, roughness: 0.9 });

// A handful of panels flicker — deterministic per position (same panels
// stutter for everyone, forever; they become landmarks of their own).
export interface FlickerPanel {
  mat: THREE.MeshBasicMaterial;
  /** The panel's own light quads (floor pool + ceiling glow) — a dark panel
   *  takes its light with it. */
  pools: { mat: THREE.MeshBasicMaterial; base: number }[];
  phase: number;
  nextAt: number;
  dark: boolean;
}
const flickerHash = (gx: number, gy: number): number =>
  (((gx * 73856093) ^ (gy * 19349663)) >>> 0) % 1000;

export function createScene(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 8, 44);
  // Dim base — the light is BAKED: pool quads on the carpet, glow quads on
  // the ceiling, per-vertex light on the walls, all tied to real fixtures.
  // NOTHING is positional/dynamic (Josh: panels visibly lit up as you
  // approached the roving-PointLight version — never again). Lit areas read
  // comfortably; darkness belongs only to zones WITHOUT fixtures.
  scene.add(new THREE.HemisphereLight(0xf0ecd0, 0x54503f, 1.45));
  scene.add(new THREE.AmbientLight(0xeae4c8, 0.54));
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  camera.rotation.order = "YXZ";
  return { scene, camera };
}

/** Everything the collision + rendering needs from received chunks. */
export class WorldIndex {
  chunkSize: number;
  chunks = new Map<string, ChunkData>();
  meshes = new Map<string, THREE.Group>();
  /** Panels that stutter — keyed by chunk so pruning drops theirs. */
  flickers = new Map<string, FlickerPanel[]>();
  /** district id → type (from the welcome frame) — picks wallpaper variants. */
  districtTypes = new Map<number, string>();
  /** sector size in cells (from the welcome frame) — perimeter closure. */
  mapSize = 256;

  constructor(chunkSize: number) {
    this.chunkSize = chunkSize;
  }

  key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  cellLookup(x: number, y: number): { chunk: ChunkData; i: number } | null {
    if (x < 0 || y < 0) return null;
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const chunk = this.chunks.get(this.key(cx, cy));
    if (!chunk) return null;
    const lx = x - cx * this.chunkSize;
    const ly = y - cy * this.chunkSize;
    return { chunk, i: ly * this.chunkSize + lx };
  }

  /** Ceiling height of a cell (from its district's type; 3m if unknown). */
  cellHeightAt(x: number, y: number): number {
    const c = this.cellLookup(x, y);
    if (!c) return WALL_H;
    return HEIGHT_BY_TYPE[this.districtTypes.get(c.chunk.district[c.i]) ?? "classic"] ?? WALL_H;
  }

  /** Unloaded space is treated as WALLED — you can't walk off the known map. */
  wallNAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? c.chunk.wallN[c.i] === 1 : true;
  }
  wallWAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? c.chunk.wallW[c.i] === 1 : true;
  }
  solidAt(x: number, y: number): boolean {
    const c = this.cellLookup(x, y);
    return c ? c.chunk.solid[c.i] === 1 : true;
  }
}

/** Build the chunk's meshes and add them to the scene. `rebuild` tears down
 *  an existing build first (used when a neighbor's arrival changes
 *  cross-chunk wall heights). */
export function buildChunk(world: WorldIndex, scene: THREE.Scene, data: ChunkData, rebuild = false): void {
  const k = world.key(data.cx, data.cy);
  if (world.meshes.has(k)) {
    if (!rebuild) return;
    const old = world.meshes.get(k)!;
    scene.remove(old);
    old.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) o.geometry.dispose();
    });
    world.meshes.delete(k);
    world.flickers.delete(k);
  }
  world.chunks.set(k, data);

  const group = new THREE.Group();
  const n = data.size;
  const ox = data.cx * n * CELL;
  const oz = data.cy * n * CELL;

  // Which wallpaper does this chunk wear? Its dominant district decides.
  const districtCount = new Map<number, number>();
  for (const id of data.district) districtCount.set(id, (districtCount.get(id) ?? 0) + 1);
  let domId = 0;
  let domN = -1;
  for (const [id, count] of districtCount) {
    if (count > domN) {
      domN = count;
      domId = id;
    }
  }
  // Offices + warrens keep their signature papers; the generic districts
  // (classic/halls/pillars) each roll one of all three by district id, so
  // crossing a district line often means new wallpaper (Josh: mix the pack
  // up — one paper across most of the map was monotonous).
  const domType = world.districtTypes.get(domId) ?? "classic";
  const paper =
    domType === "offices" || domType === "warrens" ? (WALL_BY_TYPE[domType] ?? 0) : domId % 3;
  const wallMat = wallMats[paper];

  const heightOf = (cx: number, cy: number): number => {
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) {
      return HEIGHT_BY_TYPE[world.districtTypes.get(data.district[cy * n + cx]) ?? "classic"] ?? WALL_H;
    }
    // Out-of-chunk: consult the LOADED neighbor. Chunk-local fallbacks here
    // built boundary walls to the WRONG height when a district height-step
    // crossed a chunk edge — the gap showed the neighbor room's lit ceiling
    // as a white line along the wall top (Josh's bug). Unloaded neighbor →
    // -1 (same-height assumption); buildChunk REBUILDS built neighbors when
    // a chunk arrives, so the assumption is always corrected.
    const c = world.cellLookup(data.cx * n + cx, data.cy * n + cy);
    if (!c) return -1;
    return HEIGHT_BY_TYPE[world.districtTypes.get(c.chunk.district[c.i]) ?? "classic"] ?? WALL_H;
  };

  // ---- Wall geometry: EXACT sizes, WORLD-scale UVs, vertex shading ----------
  // The old system instanced ONE unit box per family and Y-SCALED it, which
  // stretched the paper on tall rooms (Josh: "if the height of a room
  // changes make sure the wall textures are automatically scaled"), smeared
  // the full texture into 0.3m caps, and needed overlapping boxes whose
  // coplanar faces z-fought. Now every distinct size gets its own cached
  // geometry, built UNSCALED with:
  //  - UVs in WORLD METERS on every face (pattern spans 4m in U, 3m in V —
  //    a tall wall shows MORE paper, never stretched paper; a 0.3m cap
  //    shows a correct 0.3m slice, so caps/fascia/posts wear the wallpaper
  //    and nothing needs a gray placeholder material);
  //  - a VERTEX-COLOR lit-from-above gradient (bright top → contact-shadow
  //    base) spanning the box exactly once at any height;
  //  - segments cut to EXACT length (no overhang): corners + junctions are
  //    closed by 0.32m corner POSTS at wall-meeting vertices, so no two
  //    boxes ever share a coplanar overlap (the z-fight class is gone).
  // Walls stay ~30cm drywall (collision unaffected: the player's 0.44m
  // clearance exceeds the half-thickness); N walls 0.30 vs W walls 0.29 so
  // even buried cap planes never coincide with a crossing side plane.
  const geoCache = new Map<string, THREE.BoxGeometry>();
  const boxGeo = (w: number, h: number, d: number): THREE.BoxGeometry => {
    const key = `${w}|${h}|${d}`;
    const hit = geoCache.get(key);
    if (hit) return hit;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const posAttr = g.attributes.position as THREE.BufferAttribute;
    // Box face order: +x, -x, +y, -y, +z, -z (4 verts each).
    const faceU = [d, d, w, w, w, w];
    const faceV = [h, h, d, d, h, h];
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const f = Math.floor(i / 4);
      uv.setXY(i, uv.getX(i) * (faceU[f] / 4), uv.getY(i) * (faceV[f] / 3));
      const t = posAttr.getY(i) / h + 0.5; // 0 base → 1 top
      const c = t < 0.12 ? 0.62 + 1.5 * t : 0.8 + 0.2 * ((t - 0.12) / 0.88);
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geoCache.set(key, g);
    return g;
  };
  const WALL_T_N = 0.3;
  const WALL_T_W = 0.29;
  const POST_T = 0.32;
  const r2 = (v: number): number => Math.round(v * 100) / 100; // stable cache keys
  const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
  // A fixture = exactly TWO drop-ceiling tiles (0.67m × 1.33m — the classic
  // 600×1200 twin-tube troffer), placed ON the tile grid, never across it.
  const panelGeo = new THREE.PlaneGeometry(CELL / CEIL_TILES, (CELL / CEIL_TILES) * 2);

  // Walls MERGE into one mesh per chunk (not instanced): the light field
  // bakes PER VERTEX, so brightness flows continuously along a wall run.
  // The per-instance flat tints made each 2m segment its own brightness —
  // Josh: "they look like disconnected walls instead of one unified wall."
  // Shared corners sample identical light values, so continuity is exact.
  const wallPieces: THREE.BufferGeometry[] = [];
  const pushBox = (geo: THREE.BoxGeometry, mx: THREE.Matrix4): void => {
    const g = geo.clone();
    g.applyMatrix4(mx);
    const posA = g.attributes.position as THREE.BufferAttribute;
    const colA = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < posA.count; i++) {
      // Range deepened when the wash quads left — the vertex field is the
      // walls' entire light response now.
      const l = 0.76 + 0.4 * lightAt(posA.getX(i), posA.getZ(i));
      colA.setXYZ(i, colA.getX(i) * l, colA.getY(i) * l, colA.getZ(i) * l);
    }
    wallPieces.push(g);
  };
  const panels: THREE.Matrix4[] = [];
  const ceilQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  // Panel orientations: long axis north-south (default) or east-west (turned
  // to run ALONG a corridor when the N/S edges are walled).
  const panelQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const panelQEW = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    .multiply(panelQ);
  const one = new THREE.Vector3(1, 1, 1);

  // ---- Fixture prepass + the baked light field ------------------------------
  // Every fixture this chunk will place, resolved BEFORE geometry so wall/
  // ceiling instances can be tinted by their distance to real lights
  // (Josh: "make the wall interact with light more realistic" — surfaces
  // near fixtures lift, corridors between them fall into gloom; all baked,
  // nothing tracks the player). The main loop reuses this map for panel
  // placement — one source of truth.
  interface FixtureSpot {
    px: number;
    pz: number;
    isNS: boolean;
  }
  const fixtures = new Map<number, FixtureSpot>();
  const lightSpots: { px: number; pz: number }[] = [];
  // The prepass scans a 3-cell HALO beyond the chunk (world-level lookups),
  // so the light field is continuous across chunk seams — without it, a
  // wall crossing a seam stepped in brightness. Unloaded neighbors read as
  // walled (no fixtures) and heal via rebuild-on-arrival.
  for (let y = -3; y < n + 3; y++) {
    for (let x = -3; x < n + 3; x++) {
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      if (gx % 2 !== 0 || gy % 2 !== 1) continue;
      if (gx < 0 || gy < 0 || gx >= world.mapSize || gy >= world.mapSize) continue;
      if (world.solidAt(gx, gy)) continue;
      const clearNS = !world.wallNAt(gx, gy) && !world.wallNAt(gx, gy + 1);
      const clearEW = !world.wallWAt(gx, gy) && !world.wallWAt(gx + 1, gy);
      if (!clearNS && !clearEW) continue;
      const TILE = CELL / CEIL_TILES;
      const fx = ox + x * CELL;
      const fz = oz + y * CELL;
      const spot = {
        px: fx + (clearNS ? CELL / 2 : TILE * 2),
        pz: fz + (clearNS ? TILE * 2 : CELL / 2),
        isNS: clearNS,
      };
      lightSpots.push(spot);
      if (x >= 0 && y >= 0 && x < n && y < n) fixtures.set(y * n + x, spot);
    }
  }
  /** 0..1 light energy at a point from nearby fixtures (incl. the halo). */
  const lightAt = (sx: number, sz: number): number => {
    let e = 0;
    for (const f of lightSpots) {
      const dx = f.px - sx;
      const dz = f.pz - sz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 46) continue;
      e += 1.6 / (1 + d2 * 0.5);
    }
    return Math.min(1, e);
  };
  // Merged per-vertex surfaces (the doctrine): ceiling cell pieces + the
  // tessellated floor, both sampling the fixture field at every vertex.
  const ceilPieces: THREE.BufferGeometry[] = [];
  const pushCeil = (mx: THREE.Matrix4): void => {
    const g = ceilGeo.clone();
    g.applyMatrix4(mx);
    const p = g.attributes.position as THREE.BufferAttribute;
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const l = 0.78 + 0.42 * lightAt(p.getX(i), p.getZ(i));
      arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = l;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    ceilPieces.push(g);
  };
  // Floor: ONE tessellated quad (1m grid) with the light field baked per
  // vertex — the old additive pool quads bled under walls and could streak
  // at grazing angles (same class as the wall/ceiling quads; Josh asked to
  // make sure the floor was covered too).
  {
    const span = n * CELL;
    const fg = new THREE.PlaneGeometry(span, span, n * 2, n * 2);
    fg.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    fg.applyMatrix4(new THREE.Matrix4().makeTranslation(ox + span / 2, 0, oz + span / 2));
    const p = fg.attributes.position as THREE.BufferAttribute;
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const l = 0.78 + 0.46 * lightAt(p.getX(i), p.getZ(i));
      arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = l;
    }
    fg.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    const floor = new THREE.Mesh(fg, floorMat);
    floor.frustumCulled = false;
    group.add(floor);
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const wx = ox + x * CELL;
      const wz = oz + y * CELL;
      const hHere = heightOf(x, y);

      // Per-cell ceiling at the district height (merged, per-vertex light).
      m.compose(new THREE.Vector3(wx + CELL / 2, hHere, wz + CELL / 2), ceilQ, one);
      pushCeil(m);

      if (data.wallN[i]) {
        const hN = heightOf(x, y - 1);
        const h = Math.max(hHere, hN > 0 ? hN : hHere);
        m.compose(new THREE.Vector3(wx + CELL / 2, h / 2, wz), q, one);
        pushBox(boxGeo(CELL, r2(h), WALL_T_N), m);
        // Sprinkled baseboard trim in RUNS — consecutive selected segments
        // merge into ONE board, so lengths vary from 2m stubs to long
        // continuous runs (Josh: the uniform per-segment pieces looked too
        // segmented). Selection hashes global coords (all clients agree);
        // boards run 3cm short of their ends (flush ends z-fought doorway
        // caps) and runs break at chunk seams — reads as a joint.
        {
          const gbx = data.cx * n + x;
          const gby = data.cy * n + y;
          const sel = (cx3: number): boolean => flickerHash(cx3 * 3 + 7, gby * 5 + 11) < 450;
          const leftIsRun = x > 0 && data.wallN[y * n + (x - 1)] === 1 && sel(gbx - 1);
          if (sel(gbx) && !leftIsRun) {
            let span = 1;
            while (x + span < n && data.wallN[y * n + (x + span)] === 1 && sel(gbx + span)) span++;
            const len = span * CELL - 0.06;
            m.compose(new THREE.Vector3(wx + len / 2 + 0.03, 0.09, wz), q, one);
            pushBox(boxGeo(r2(len), 0.18, WALL_T_N + 0.08), m);
          }
        }
      } else {
        // Open edge between different ceiling heights: a fascia strip fills
        // the step. It runs 3cm PAST the lower ceiling and 2cm past the
        // taller one — sharing either ceiling's exact plane z-fought where
        // the ceiling quad crossed the fascia box (Josh's "texture
        // collision" at ceiling drops); the tiny lip reads as a real
        // soffit return.
        const hN = heightOf(x, y - 1);
        if (hN > 0 && Math.abs(hN - hHere) > 0.01) {
          const lo = Math.min(hHere, hN);
          const hi = Math.max(hHere, hN);
          const fh = r2(hi - lo + 0.05);
          m.compose(new THREE.Vector3(wx + CELL / 2, lo - 0.03 + fh / 2, wz), q, one);
          pushBox(boxGeo(CELL, fh, WALL_T_N), m);
        }
      }
      if (data.wallW[i]) {
        const hW = heightOf(x - 1, y);
        const h = Math.max(hHere, hW > 0 ? hW : hHere);
        m.compose(new THREE.Vector3(wx, h / 2, wz + CELL / 2), q, one);
        pushBox(boxGeo(WALL_T_W, r2(h), CELL), m);
        {
          const gbx = data.cx * n + x;
          const gby = data.cy * n + y;
          const sel = (cy3: number): boolean => flickerHash(gbx * 7 + 3, cy3 * 11 + 5) < 450;
          const upIsRun = y > 0 && data.wallW[(y - 1) * n + x] === 1 && sel(gby - 1);
          if (sel(gby) && !upIsRun) {
            let span = 1;
            while (y + span < n && data.wallW[(y + span) * n + x] === 1 && sel(gby + span)) span++;
            const len = span * CELL - 0.06;
            m.compose(new THREE.Vector3(wx, 0.09, wz + len / 2 + 0.03), q, one);
            pushBox(boxGeo(WALL_T_W + 0.08, 0.18, r2(len)), m);
          }
        }
      } else {
        const hW = heightOf(x - 1, y);
        if (hW > 0 && Math.abs(hW - hHere) > 0.01) {
          const lo = Math.min(hHere, hW);
          const hi = Math.max(hHere, hW);
          const fh = r2(hi - lo + 0.05);
          m.compose(new THREE.Vector3(wx, lo - 0.03 + fh / 2, wz + CELL / 2), q, one);
          pushBox(boxGeo(WALL_T_W, fh, CELL), m);
        }
      }
      if (data.solid[i]) {
        m.compose(new THREE.Vector3(wx + CELL / 2, hHere / 2, wz + CELL / 2), q, one);
        pushBox(boxGeo(CELL, r2(hHere), CELL), m);
      }
      // Perimeter closure: the generator only walls the map's north/west
      // edges — synthesize the south/east boundary so the sector never
      // shows raw void (Josh's "missing textures on the boundary wall").
      const gxCell = data.cx * n + x;
      const gyCell = data.cy * n + y;
      if (gyCell === world.mapSize - 1) {
        m.compose(new THREE.Vector3(wx + CELL / 2, hHere / 2, wz + CELL), q, one);
        pushBox(boxGeo(CELL, r2(hHere), WALL_T_N), m);
      }
      if (gxCell === world.mapSize - 1) {
        m.compose(new THREE.Vector3(wx + CELL, hHere / 2, wz + CELL / 2), q, one);
        pushBox(boxGeo(WALL_T_W, r2(hHere), CELL), m);
      }
      // The endless panel grid: one fixture per 2×2 cells, sized exactly
      // two ceiling tiles and SNAPPED to the T-bar grid — width on the
      // middle tile column, length spanning two whole tiles toward a
      // verified-open edge (fixture edges land on grid lines, like a real
      // drop ceiling). A fixture NEVER sits against a wall (Josh's rule):
      // its long axis must have wall-free edges — default north-south, else
      // turned east-west to run along a corridor, else no light here.
      // Chunk-boundary cells can't see the neighbor's edge and
      // conservatively skip that orientation — deterministic for everyone.
      // ~2.5% of eligible panels flicker, deterministic by position.
      const gx = data.cx * n + x;
      const gy = data.cy * n + y;
      const spot = fixtures.get(i);
      if (spot) {
        const orient = spot.isNS ? panelQ : panelQEW;
        const px = spot.px;
        const pz = spot.pz;
        if (flickerHash(gx, gy) < 25) {
          const fmat = panelMat.clone() as THREE.MeshBasicMaterial;
          const fmesh = new THREE.Mesh(panelGeo, fmat);
          fmesh.position.set(px, hHere - 0.02, pz);
          fmesh.quaternion.copy(orient);
          group.add(fmesh);
          const list = world.flickers.get(k) ?? [];
          list.push({
            mat: fmat,
            pools: [],
            phase: (flickerHash(gx * 7 + 1, gy * 3 + 1) / 1000) * 6,
            nextAt: 0,
            dark: false,
          });
          world.flickers.set(k, list);
        } else {
          m.compose(new THREE.Vector3(px, hHere - 0.02, pz), orient, one);
          panels.push(m.clone());
        }
      }
    }
  }

  const addInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    mats: THREE.Matrix4[],
    colors?: THREE.Color[],
  ): void => {
    if (!mats.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mx, idx) => mesh.setMatrixAt(idx, mx));
    if (colors) {
      colors.forEach((c, idx) => mesh.setColorAt(idx, c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Instance matrices carry WORLD positions while the mesh sits at the
    // origin — default frustum culling sees a 2m sphere at (0,0,0) and culls
    // the entire chunk's walls the moment you walk away from the corner of
    // the map. Chunk pruning is our culling; draw calls stay tiny.
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  // Corner posts — at TRUE L-BENDS ONLY (exactly one wall per axis at the
  // vertex): that's the one junction with an exposed corner notch. At T and
  // X junctions the through-wall buries the branch's end cap, and a post
  // there stands 1cm proud of the flat face — Josh's "invisible wall
  // catching the light" was exactly that band, visible on the flat side,
  // hidden behind the crossing wall from the other. Cross-chunk lookups
  // keep seams honest; a vertex is OWNED by the chunk whose local (vx, vy)
  // cell contains it, so two chunks never double-post a seam vertex.
  for (let vy = 0; vy < n; vy++) {
    for (let vx = 0; vx < n; vx++) {
      const gvx = data.cx * n + vx;
      const gvy = data.cy * n + vy;
      const ewCount = (world.wallNAt(gvx, gvy) ? 1 : 0) + (world.wallNAt(gvx - 1, gvy) ? 1 : 0);
      const nsCount = (world.wallWAt(gvx, gvy) ? 1 : 0) + (world.wallWAt(gvx, gvy - 1) ? 1 : 0);
      if (ewCount !== 1 || nsCount !== 1) continue;
      const hs = [
        heightOf(vx, vy),
        heightOf(vx - 1, vy),
        heightOf(vx, vy - 1),
        heightOf(vx - 1, vy - 1),
      ].filter((v) => v > 0);
      const ph = hs.length ? Math.max(...hs) : WALL_H;
      const pxv = ox + vx * CELL;
      const pzv = oz + vy * CELL;
      m.compose(new THREE.Vector3(pxv, ph / 2, pzv), q, one);
      pushBox(boxGeo(POST_T, r2(ph), POST_T), m);
    }
  }

  if (wallPieces.length) {
    const merged = mergeGeometries(wallPieces);
    for (const p of wallPieces) p.dispose();
    const wallsMesh = new THREE.Mesh(merged, wallMat);
    wallsMesh.frustumCulled = false;
    group.add(wallsMesh);
  }
  if (ceilPieces.length) {
    const cMerged = mergeGeometries(ceilPieces);
    for (const p of ceilPieces) p.dispose();
    const ceilMesh = new THREE.Mesh(cMerged, ceilMat);
    ceilMesh.frustumCulled = false;
    group.add(ceilMesh);
  }
  for (const g of geoCache.values()) g.dispose(); // templates — clones own their data
  addInstanced(panelGeo, panelMat, panels);

  world.meshes.set(k, group);
  scene.add(group);

  // A fresh chunk can change what an already-built NEIGHBOR should look
  // like (cross-chunk wall heights at district steps) — rebuild built
  // neighbors once. No cascade: rebuilds never trigger rebuilds.
  if (!rebuild) {
    const dirs: readonly (readonly [number, number])[] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nk = world.key(data.cx + dx, data.cy + dy);
      const nd = world.chunks.get(nk);
      if (nd && world.meshes.has(nk)) buildChunk(world, scene, nd, true);
    }
  }
}

/** Drop chunks far outside the streaming radius (memory + draw calls). */
export function pruneChunks(world: WorldIndex, scene: THREE.Scene, pcx: number, pcy: number, keep: number): void {
  for (const [k, group] of world.meshes) {
    const [cx, cy] = k.split(",").map(Number);
    if (Math.abs(cx - pcx) > keep || Math.abs(cy - pcy) > keep) {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) o.geometry.dispose();
      });
      world.meshes.delete(k);
      world.chunks.delete(k);
      world.flickers.delete(k);
    }
  }
}

/** Animate the stuttering panels: mostly bright, occasional buzzy dropouts
 *  and half-brightness sputters on each panel's own random schedule. */
export function tickFlickers(world: WorldIndex, timeMs: number): void {
  for (const list of world.flickers.values()) {
    for (const f of list) {
      if (timeMs >= f.nextAt) {
        // Weighted schedule: long steady stretches, brief failures.
        const r = Math.random();
        if (f.dark) {
          f.dark = false;
          f.nextAt = timeMs + 400 + Math.random() * 4000;
        } else if (r < 0.55) {
          f.nextAt = timeMs + 300 + Math.random() * 2500; // stay lit
        } else {
          f.dark = true;
          f.nextAt = timeMs + 40 + Math.random() * (r < 0.85 ? 140 : 900);
        }
        f.mat.color.setHex(f.dark ? 0x4a4534 : PANEL_COLOR);
        for (const p of f.pools) p.mat.opacity = f.dark ? 0 : p.base;
      }
    }
  }
}

/** Count walls crossed by the straight line between two points (cell space) —
 *  the acoustics occlusion ray. Solids count double (a pillar is thicker than
 *  drywall); capped at 4 (past that it's inaudible anyway). Unloaded chunks
 *  read as walled, which only over-muffles things too far to matter. */
export function wallsBetween(world: WorldIndex, x0: number, y0: number, x1: number, y1: number): number {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  let walls = 0;
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = Math.floor(x0 + (x1 - x0) * t);
    const ny = Math.floor(y0 + (y1 - y0) * t);
    if (nx === cx && ny === cy) continue;
    let sx = cx;
    const sy = cy;
    if (nx !== sx) {
      if (world.wallWAt(Math.max(sx, nx), sy)) walls++;
      if (world.solidAt(nx, sy)) walls += 2;
      sx = nx;
    }
    if (ny !== sy) {
      if (world.wallNAt(sx, Math.max(sy, ny))) walls++;
      if (world.solidAt(sx, ny)) walls += 2;
    }
    cx = nx;
    cy = ny;
    if (walls >= 4) return 4;
  }
  return Math.min(4, walls);
}

// ---- Other players: the Hazmat PS1 model -----------------------------------
// Loaded once, cloned per peer (SkeletonUtils handles skinned rigs). Texture
// filtered NEAREST for the PS1 crunch. If the FBX carries clips, peers play
// walk while moving and idle at rest; until the model resolves (or if it
// fails) a capsule stands in.

interface HazmatBase {
  object: THREE.Group;
  height: number;
  minY: number;
  clips: THREE.AnimationClip[];
}
let hazmatBase: HazmatBase | null = null;
let hazmatLoading: Promise<void> | null = null;

function loadHazmat(): Promise<void> {
  if (hazmatLoading) return hazmatLoading;
  hazmatLoading = new Promise((resolve) => {
    const texYellow = new THREE.TextureLoader().load("/assets/hazmat/hazmat_yellow.png");
    texYellow.colorSpace = THREE.SRGBColorSpace;
    texYellow.magFilter = THREE.NearestFilter; // the PS1 crunch
    new FBXLoader().load(
      "/assets/hazmat/hazmat.fbx",
      (fbx) => {
        const mat = new THREE.MeshStandardMaterial({ map: texYellow, roughness: 0.95 });
        fbx.traverse((o) => {
          if (o instanceof THREE.Mesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
            (o as THREE.Mesh).material = mat;
            (o as THREE.Mesh).frustumCulled = false; // skinned bounds lie
          }
        });
        const box = new THREE.Box3().setFromObject(fbx);
        const height = Math.max(0.01, box.max.y - box.min.y);
        hazmatBase = { object: fbx, height, minY: box.min.y, clips: fbx.animations ?? [] };
        resolve();
      },
      undefined,
      () => resolve(), // capsule fallback on failure
    );
  });
  return hazmatLoading;
}

interface SwingBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  /** Swing amplitude in radians; sign sets phase (L vs R). */
  amp: number;
  /** Phase offset within the stride cycle. */
  phase: number;
}

export interface PeerAvatar {
  group: THREE.Group;
  target: THREE.Vector3;
  heading: number;
  mixer: THREE.AnimationMixer | null;
  walkAction: THREE.AnimationAction | null;
  idleAction: THREE.AnimationAction | null;
  walking: boolean;
  /** Procedural stride (the hazmat FBX is rigged but shipped without clips). */
  swings: SwingBone[];
  stride: number;
}

export function makeAvatar(scene: THREE.Scene, name: string): PeerAvatar {
  const group = new THREE.Group();
  const avatar: PeerAvatar = {
    group,
    target: new THREE.Vector3(),
    heading: 0,
    mixer: null,
    walkAction: null,
    idleAction: null,
    walking: false,
    swings: [],
    stride: Math.random() * Math.PI * 2, // nobody marches in sync
  };

  const placeholder = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 4, 12), bodyMat);
  placeholder.position.y = 0.9;
  group.add(placeholder);

  void loadHazmat().then(() => {
    if (!hazmatBase || !group.parent) return; // failed, or peer already gone
    group.remove(placeholder);
    placeholder.geometry.dispose();
    const model = cloneSkeleton(hazmatBase.object) as THREE.Group;
    const scale = 1.72 / hazmatBase.height; // suit up to human height
    model.scale.setScalar(scale);
    // The FBX is authored facing the OTHER way (players saw each other's
    // backs — Josh's live catch), and its pivot isn't at the feet: flip
    // 180° and drop the soles to the carpet.
    model.rotation.y = Math.PI;
    model.position.y = -hazmatBase.minY * scale;
    group.add(model);
    if (hazmatBase.clips.length) {
      avatar.mixer = new THREE.AnimationMixer(model);
      const findClip = (words: string[]) =>
        hazmatBase!.clips.find((c) => words.some((w) => c.name.toLowerCase().includes(w))) ?? null;
      const walkClip = findClip(["walk", "run", "move"]) ?? hazmatBase.clips[0];
      const idleClip = findClip(["idle", "stand"]) ?? null;
      if (walkClip) {
        avatar.walkAction = avatar.mixer.clipAction(walkClip);
        avatar.walkAction.play();
        avatar.walkAction.paused = true;
      }
      if (idleClip) {
        avatar.idleAction = avatar.mixer.clipAction(idleClip);
        avatar.idleAction.play();
      }
    } else {
      // No clips in the FBX (rigged only) — drive the stride procedurally.
      // Blender-style bone names: thigh/shin/upper_arm/forearm .L/.R.
      const SWING: [string, number, number][] = [
        ["thigh.L", 0.55, 0],
        ["thigh.R", 0.55, Math.PI],
        ["shin.L", 0.45, Math.PI * 0.55],
        ["shin.R", 0.45, Math.PI * 1.55],
        ["upper_arm.L", 0.3, Math.PI],
        ["upper_arm.R", 0.3, 0],
        ["forearm.L", 0.18, Math.PI * 1.3],
        ["forearm.R", 0.18, Math.PI * 0.3],
      ];
      model.traverse((o) => {
        const hit = SWING.find(([name]) => o.name === name || o.name === name.replace(".", ""));
        if (hit) {
          avatar.swings.push({ bone: o, rest: o.quaternion.clone(), amp: hit[1], phase: hit[2] });
        }
      });
    }
  });

  // Name tag: a small canvas sprite floating overhead.
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(20,16,8,0.55)";
  ctx.fillRect(0, 6, 256, 44);
  ctx.fillStyle = "#e8dcae";
  ctx.fillText(name.slice(0, 16), 128, 38);
  const tex = new THREE.CanvasTexture(canvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  tag.scale.set(1.5, 0.33, 1);
  tag.position.y = 2.15;
  group.add(tag);

  scene.add(group);
  return avatar;
}

export function disposeAvatar(scene: THREE.Scene, a: PeerAvatar): void {
  a.mixer?.stopAllAction();
  scene.remove(a.group);
  a.group.traverse((o) => {
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

/** Per-frame peer animation: glide to the reported spot, and swap between
 *  walk/idle by whether the avatar is actually covering ground. Clips play
 *  if the model has them; otherwise the procedural stride swings the rig. */
const SWING_TMP = new THREE.Quaternion();
const SWING_AXIS = new THREE.Vector3(1, 0, 0);

export function tickAvatar(a: PeerAvatar, dt: number): void {
  const dist = a.group.position.distanceTo(a.target);
  const walking = dist > 0.08;
  if (walking !== a.walking) {
    a.walking = walking;
    if (a.walkAction) a.walkAction.paused = !walking;
    if (a.idleAction) a.idleAction.paused = walking;
  }
  a.mixer?.update(dt);

  if (a.swings.length) {
    if (walking) {
      a.stride += dt * 7.5; // ~2.4 steps/s at walking pace
      for (const s of a.swings) {
        SWING_TMP.setFromAxisAngle(SWING_AXIS, Math.sin(a.stride + s.phase) * s.amp);
        s.bone.quaternion.copy(s.rest).multiply(SWING_TMP);
      }
    } else {
      // Ease every bone back to rest — no freeze mid-stride.
      for (const s of a.swings) {
        s.bone.quaternion.slerp(s.rest, Math.min(1, dt * 8));
      }
    }
  }
}
