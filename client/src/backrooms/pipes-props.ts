// PIPE DREAMS — the fixtures (Level 2, sector D2).
//
// The generator (src/backrooms/worldgen-pipes.ts) dresses every room with a
// deco code per cell: machines, tanks and racks on SOLID footprints, wall
// furniture backed onto a named wall, free-standing pieces on an axis. This
// module turns those codes into geometry. Everything is procedural — boxes,
// cylinders, a torus for a valve wheel — merged per material per chunk, with
// the chunk's baked light field written into the vertex colours exactly as
// the walls are, so a pump in a dead stretch of tunnel sits in the same dark
// as the wall behind it. The pack's models can replace any piece later; the
// anchors, footprints and facings are already the contract.
//
// The footprint tables MUST match the server's MACHINES / TANKS (the harness
// reads both files and compares them): a mismatch draws a machine over a
// cell the server thinks is open floor, or leaves an invisible solid.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { modelled } from "../../../src/backrooms/pipes-models";

export const PIPE_MACHINES: readonly { name: string; w: number; h: number }[] = [
  { name: "pump", w: 2, h: 2 },
  { name: "generator", w: 2, h: 1 },
  { name: "generator", w: 1, h: 2 },
  { name: "cabinet", w: 1, h: 1 },
  { name: "turbine", w: 6, h: 3 },
  { name: "turbine", w: 3, h: 6 },
  { name: "transformer", w: 2, h: 2 },
  { name: "compressor", w: 2, h: 1 },
  { name: "compressor", w: 1, h: 2 },
  { name: "lathe", w: 2, h: 1 },
  { name: "lathe", w: 1, h: 2 },
  { name: "press", w: 2, h: 2 },
];
export const PIPE_TANKS: readonly { name: string; w: number; h: number }[] = [
  { name: "boiler", w: 5, h: 3 },
  { name: "boiler", w: 3, h: 5 },
  { name: "vtank", w: 2, h: 2 },
  { name: "htank", w: 4, h: 2 },
  { name: "htank", w: 2, h: 4 },
];

/** Deco kinds (mirrors the server's PDECO). */
export const PK = {
  vent: 1,
  lamp: 2,
  stairs: 5,
  panel: 6,
  lockeddoor: 7,
  machine: 8,
  tank: 9,
  rack: 10,
  hatch: 11,
  exitdoor: 12,
  wallA: 13,
  wallB: 14,
  free: 15,
} as const;

/** Ceiling height (m above the floor) of each Level 2 room type: low and
 *  close in the tunnels and corridors, the galleries tall enough for the pipe
 *  runs overhead, the halls cathedral-tall. A catwalk's ceiling is its engine
 *  hall's MINUS the 3m it stands above the pit floor, so the two meet in one
 *  flat roof. world.ts spreads this into its table. */
export const PIPE_CEILINGS: Readonly<Record<string, number>> = {
  pipegallery: 4.4,
  servicering: 3.4,
  corridor: 3.0,
  tunnel: 2.7,
  office: 3.0,
  suite: 3.8,
  breakroom: 3.0,
  controlroom: 3.6,
  enginehall: 13.0,
  catwalk: 10.0,
  boilerhouse: 9.0,
  warehouse: 7.5,
  machineshop: 5.5,
  drainroom: 7.0,
  vault: 7.0,
};

/** An engine hall's roof is ONE flat plane: its pit floor plus the hall's
 *  13m. The pit floor is a deck (a multiple of 3m) minus 3m, so it is found
 *  from any cell's floor by rounding DOWN to 3m — which is what keeps the
 *  stairs down from the catwalks (whose floors step between the two) from
 *  notching the roof above them, as a per-cell floor + height did. */
export function pipeHallRoof(floorM: number): number {
  return Math.floor(floorM / 3 + 1e-6) * 3 + PIPE_CEILINGS.enginehall;
}

/** Room types a player is safe in — the server's SAFE_TYPES. */
export const PIPE_SAFE_TYPES: ReadonlySet<string> = new Set(["breakroom", "controlroom", "drainroom"]);

const CELL = 2;

/** What the builder needs to know about the world. */
export interface PipeWorld {
  decoAt(x: number, y: number): number;
  solidAt(x: number, y: number): boolean;
  hasCell(x: number, y: number): boolean;
  floorAt(x: number, y: number): number;
  wallNAt(x: number, y: number): boolean;
  wallWAt(x: number, y: number): boolean;
  /** Ceiling ELEVATION (metres) of a cell. */
  ceilAt(x: number, y: number): number;
}

/** Is this solid cell part of a fixture (machine, tank or rack)? Those are
 *  drawn as the fixture, with floor under them, never as a wall box. */
export function pipeFixtureCell(w: PipeWorld, gx: number, gy: number): boolean {
  if ((w.decoAt(gx, gy) >> 4) === PK.rack) return true;
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      const code = w.decoAt(gx - dx, gy - dy);
      const k = code >> 4;
      if (k !== PK.machine && k !== PK.tank) continue;
      const fp = (k === PK.machine ? PIPE_MACHINES : PIPE_TANKS)[code & 15];
      if (fp && dx < fp.w && dy < fp.h) return true;
    }
  }
  return false;
}

// ---- Materials (shared, never disposed — see THE HALL NEVER COMPILES) ------

const surfLoader = new THREE.TextureLoader();
/** A catalogue texture, repeating (its scale comes from worldUV's span). */
function surfTex(url: string, color: boolean): THREE.Texture {
  const t = surfLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** UVs from WORLD position by the face's dominant axis (the walls' kit pieces
 *  do the same — world.ts worldTiled), one texture every `span` metres. */
function worldUV(m: THREE.MeshStandardMaterial, span: number): void {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
  {
    vec4 wpU = modelMatrix * vec4( transformed, 1.0 );
    vec3 wnU = abs( inverseTransformDirection( transformedNormal, viewMatrix ) );
    vec2 pUv = ( wnU.y >= wnU.x && wnU.y >= wnU.z ) ? wpU.xz : ( wnU.x >= wnU.z ? wpU.zy : wpU.xy );
    pUv /= ${span.toFixed(3)};
    #ifdef USE_MAP
      vMapUv = pUv;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv = pUv;
    #endif
  }`,
    );
  };
  m.customProgramCacheKey = () => `pipesWorldUV${span}`;
}

let mats: Record<string, THREE.Material> | null = null;
function materials(): Record<string, THREE.Material> {
  if (mats) return mats;
  // REAL SURFACES, NOT FLAT PAINT (Nov 2026 polish round, L2-03): every piece
  // with no kit model was a flat colour and read as greybox next to the
  // textured concrete and the kit pipes. Each finish now wears a photographed
  // surface from the catalogue (rusted and painted metal, worn wood), tinted
  // toward its old colour, its UVs taken from WORLD position in the vertex
  // shader (a box projection) so a tank, a turbine or a bench carries the
  // grain at its real size whatever primitive built it. Still one shared
  // material per finish (draw calls unchanged), all built here once.
  const std = (color: number, rough: number, metal: number, surf: string, span: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      vertexColors: true,
      map: surfTex(`/assets/br/tex/${surf}-color.jpg`, true),
      normalMap: surfTex(`/assets/br/tex/${surf}-normal.jpg`, false),
      normalScale: new THREE.Vector2(0.7, 0.7),
    });
    worldUV(m, span);
    return m;
  };
  mats = {
    metal: std(0xc4ccd2, 0.55, 0.3, "grey-rust-metal", 1.6),
    green: std(0xb8d0bc, 0.6, 0.3, "green-rust-metal", 1.6),
    rust: std(0xffffff, 0.8, 0.3, "rusted-plates", 1.6),
    wood: std(0xe8d4b4, 0.85, 0.05, "wood-plank-floor", 2),
    dark: std(0x8a9096, 0.7, 0.3, "black-metal", 1.4),
    pale: std(0xe4e6e2, 0.7, 0.1, "grey-rust-metal", 1.6),
    red: std(0xffffff, 0.6, 0.3, "worn-red-metal", 1.6),
    rack: std(0x6f9cd0, 0.55, 0.3, "grey-rust-metal", 1.6),
    beam: std(0xffb070, 0.6, 0.3, "worn-red-metal", 1.6),
    yellow: std(0xf0d070, 0.6, 0.3, "grey-rust-metal", 1.6),
    screen: new THREE.MeshBasicMaterial({ color: 0x6fe3a4 }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffb04a }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

// ---- The builder ---------------------------------------------------------------

type Mat = "metal" | "green" | "rust" | "wood" | "dark" | "pale" | "red" | "rack" | "beam" | "yellow" | "screen" | "amber";

class Pieces {
  readonly by = new Map<Mat, THREE.BufferGeometry[]>();
  add(mat: Mat, g: THREE.BufferGeometry): void {
    const arr = this.by.get(mat);
    if (arr) arr.push(g);
    else this.by.set(mat, [g]);
  }
  /** A box with its BASE at y0, centred on (cx, cz), turned `rot` about y. */
  box(mat: Mat, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, rot = 0): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rot) g.rotateY(rot);
    g.translate(cx, y0 + sy / 2, cz);
    this.add(mat, g);
  }
  /** A cylinder: axis "y" stands (base at y0), "x"/"z" lies with its centre
   *  line at height y0. */
  cyl(mat: Mat, cx: number, y0: number, cz: number, r: number, len: number, axis: "x" | "y" | "z", seg = 14): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    else if (axis === "z") g.rotateX(Math.PI / 2);
    g.translate(cx, axis === "y" ? y0 + len / 2 : y0, cz);
    this.add(mat, g);
  }
  /** A valve handwheel facing along `axis`. */
  wheel(mat: Mat, cx: number, cy: number, cz: number, r: number, axis: "x" | "z"): void {
    const g = new THREE.TorusGeometry(r, r * 0.16, 6, 14);
    if (axis === "x") g.rotateY(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(mat, g);
  }
}

/** Offsets for a piece backed onto a wall: returns world helpers that place
 *  along-wall (a) and out-from-wall (o) coordinates in the cell. */
function wallFrame(gx: number, gy: number, side: number): { at: (a: number, o: number) => [number, number]; rot: number; along: "x" | "z" } {
  const cx = (gx + 0.5) * CELL;
  const cz = (gy + 0.5) * CELL;
  const H = CELL / 2;
  // o = distance OUT from the wall face; a = offset along the wall
  if (side === 0) return { at: (a, o) => [cx + a, cz - H + o], rot: 0, along: "x" };
  if (side === 2) return { at: (a, o) => [cx - a, cz + H - o], rot: Math.PI, along: "x" };
  if (side === 3) return { at: (a, o) => [cx - H + o, cz - a], rot: Math.PI / 2, along: "z" };
  return { at: (a, o) => [cx + H - o, cz + a], rot: -Math.PI / 2, along: "z" };
}

/** A cheap deterministic hash for per-cell variety. */
const hash = (x: number, y: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

function wallPiece(P: Pieces, w: PipeWorld, gx: number, gy: number, set: 13 | 14, type: number, side: number): void {
  const f0 = w.floorAt(gx, gy);
  const top = w.ceilAt(gx, gy);
  const F = wallFrame(gx, gy, side);
  const rot = F.rot;
  const place = (mat: Mat, a: number, y0: number, o: number, len: number, h: number, depth: number): void => {
    const [x, z] = F.at(a, o + depth / 2);
    P.box(mat, x, y0, z, len, h, depth, rot);
  };
  if (set === 13) {
    if (type === 0) {
      // locker bank: three doors, seams between them, a vent strip at the top
      place("metal", 0, f0, 0.02, 1.92, 1.95, 0.48);
      for (const a of [-0.32, 0.32]) place("dark", a, f0 + 0.05, 0.5, 0.025, 1.85, 0.02);
      place("dark", 0, f0 + 1.7, 0.5, 1.8, 0.03, 0.02);
    } else if (type === 1) {
      // workbench: a thick top, a shelf under it, legs, a vice
      place("wood", 0, f0 + 0.86, 0.03, 1.9, 0.08, 0.72);
      place("wood", 0, f0 + 0.22, 0.08, 1.8, 0.04, 0.6);
      for (const a of [-0.88, 0.88]) {
        place("dark", a, f0, 0.06, 0.07, 0.86, 0.07);
        place("dark", a, f0, 0.66, 0.07, 0.86, 0.07);
      }
      place("metal", 0.55, f0 + 0.94, 0.55, 0.22, 0.16, 0.18);
    } else if (type === 2) {
      place("metal", 0, f0, 0.04, 1.1, 1.9, 0.55);
      place("dark", 0.36, f0 + 0.9, 0.6, 0.04, 0.2, 0.03);
    } else {
      // console: a desk of instruments with a glowing panel above it
      place("dark", 0, f0, 0.04, 1.9, 0.86, 0.7);
      place("metal", 0, f0 + 0.86, 0.04, 1.9, 0.72, 0.14);
      for (const a of [-0.6, 0, 0.6]) place(hash(gx + a, gy) < 0.3 ? "amber" : "screen", a, f0 + 1.02, 0.19, 0.42, 0.3, 0.01);
      place("dark", 0, f0 + 0.86, 0.36, 1.8, 0.04, 0.34);
    }
    return;
  }
  if (type === 0) {
    // shelving: two uprights, four boards, stock on them
    for (const a of [-0.93, 0.93]) place("dark", a, f0, 0.04, 0.05, 2.2, 0.5);
    for (const y of [0.1, 0.65, 1.2, 1.75]) place("pale", 0, f0 + y, 0.04, 1.86, 0.04, 0.5);
    for (const [k, y] of [0.14, 0.69, 1.24].entries()) {
      if (hash(gx * 3 + k, gy) < 0.35) continue;
      place(hash(gx, gy + k) < 0.5 ? "wood" : "red", -0.4 + k * 0.35, f0 + y, 0.1, 0.5, 0.36, 0.38);
    }
  } else if (type === 1) {
    place("pale", 0, f0, 0.03, 1.94, 0.9, 0.6);
    place("dark", 0, f0 + 0.9, 0.03, 1.96, 0.04, 0.62);
  } else if (type === 2) {
    // breaker panel on the wall
    place("metal", 0, f0 + 0.4, 0.02, 1.1, 1.5, 0.24);
    place("amber", 0.35, f0 + 1.7, 0.27, 0.07, 0.07, 0.01);
    place("dark", 0, f0 + 0.5, 0.27, 0.9, 0.02, 0.01);
  } else {
    // valve manifold: two runs along the wall, a riser to the ceiling, a
    // handwheel at chest height
    const [rx, rz] = F.at(0, 0.3);
    for (const y of [0.7, 1.35]) {
      const [x, z] = F.at(0, 0.24);
      P.cyl("rust", x, f0 + y, z, 0.11, CELL, F.along);
    }
    P.cyl("rust", rx, f0, rz, 0.16, Math.max(0.5, top - f0), "y");
    const [wx, wz] = F.at(0, 0.52);
    P.wheel("red", wx, f0 + 1.05, wz, 0.24, F.along === "x" ? "z" : "x");
  }
}

function freePiece(P: Pieces, w: PipeWorld, gx: number, gy: number, type: number, axis: number): void {
  const f0 = w.floorAt(gx, gy);
  const cx = (gx + 0.5) * CELL;
  const cz = (gy + 0.5) * CELL;
  const rot = axis === 0 ? 0 : Math.PI / 2;
  const box = (mat: Mat, a: number, o: number, y0: number, sa: number, sy: number, so: number): void => {
    const [x, z] = axis === 0 ? [cx + a, cz + o] : [cx + o, cz + a];
    P.box(mat, x, y0, z, sa, sy, so, rot);
  };
  switch (type) {
    case 0: // bench
      box("wood", 0, 0, f0 + 0.4, 1.8, 0.06, 0.38);
      for (const a of [-0.7, 0.7]) box("dark", a, 0, f0, 0.06, 0.4, 0.34);
      break;
    case 1: // table
      box("wood", 0, 0, f0 + 0.72, 1.8, 0.06, 0.9);
      for (const a of [-0.8, 0.8]) for (const o of [-0.36, 0.36]) box("dark", a, o, f0, 0.06, 0.72, 0.06);
      break;
    case 2: // desk with a terminal
      box("wood", 0, 0, f0 + 0.72, 1.5, 0.05, 0.75);
      box("metal", 0.5, 0, f0, 0.45, 0.72, 0.7);
      box("dark", -0.68, 0, f0, 0.05, 0.72, 0.65);
      box("pale", -0.15, -0.05, f0 + 0.77, 0.46, 0.4, 0.42);
      box(hash(gx, gy) < 0.25 ? "amber" : "screen", -0.15, 0.17, f0 + 0.82, 0.34, 0.26, 0.01);
      break;
    case 3: // crates
      box("wood", -0.2, 0.1, f0, 0.9, 0.9, 0.9);
      box("wood", 0.3, -0.2, f0 + 0.9, 0.65, 0.6, 0.65);
      break;
    case 4: // drums
      for (const [k, [a, o]] of ([[-0.35, -0.3], [0.35, -0.25], [0, 0.35]] as [number, number][]).entries()) {
        const [x, z] = axis === 0 ? [cx + a, cz + o] : [cx + o, cz + a];
        P.cyl(hash(gx + k, gy) < 0.6 ? "rust" : "green", x, f0, z, 0.29, 0.88, "y", 12);
      }
      break;
    case 5: // pallet with a load
      box("wood", 0, 0, f0, 1.2, 0.14, 1.0);
      if (hash(gx, gy) < 0.6) box("pale", 0, 0, f0 + 0.14, 1.0, 0.7, 0.85);
      break;
    case 6: {
      // cable drum on its side
      const [x, z] = [cx, cz];
      const ax2 = axis === 0 ? "x" : "z";
      for (const s of [-0.3, 0.3]) {
        const [px, pz] = axis === 0 ? [x + s, z] : [x, z + s];
        P.cyl("wood", px, f0 + 0.55, pz, 0.55, 0.06, ax2, 16);
      }
      P.cyl("dark", x, f0 + 0.55, z, 0.3, 0.56, ax2, 12);
      break;
    }
    default: // cubicle partitions (a stall)
      for (const a of [-0.97, 0.97]) box("pale", a, 0, f0 + 0.15, 0.04, 1.85, 1.5);
      box("pale", 0.45, 0.73, f0 + 0.15, 0.9, 1.85, 0.04);
      break;
  }
}

function machinePiece(P: Pieces, w: PipeWorld, gx: number, gy: number, v: number): void {
  const fp = PIPE_MACHINES[v];
  if (!fp) return;
  const f0 = w.floorAt(gx, gy);
  const top = w.ceilAt(gx, gy);
  const cx = (gx + fp.w / 2) * CELL;
  const cz = (gy + fp.h / 2) * CELL;
  const W = fp.w * CELL;
  const H = fp.h * CELL;
  const alongX = fp.w >= fp.h;
  const L = Math.max(W, H);
  const D = Math.min(W, H);
  // (a, o) = along the long axis / across it
  const at = (a: number, o: number): [number, number] => (alongX ? [cx + a, cz + o] : [cx + o, cz + a]);
  const box = (mat: Mat, a: number, o: number, y0: number, sa: number, sy: number, so: number): void => {
    const [x, z] = at(a, o);
    P.box(mat, x, y0, z, alongX ? sa : so, sy, alongX ? so : sa);
  };
  const lay = (mat: Mat, a: number, o: number, y: number, r: number, len: number): void => {
    const [x, z] = at(a, o);
    P.cyl(mat, x, y, z, r, len, alongX ? "x" : "z");
  };
  const riser = (a: number, o: number, y0: number, r: number): void => {
    const [x, z] = at(a, o);
    if (top - y0 > 0.3) P.cyl("rust", x, y0, z, r, top - y0, "y", 10);
  };
  switch (fp.name) {
    case "pump": {
      box("dark", 0, 0, f0, W - 0.5, 0.3, H - 0.5);
      const [vx, vz] = at(-0.7, 0);
      P.cyl("green", vx, f0 + 0.3, vz, 0.95, 1.1, "y");
      lay("green", 0.85, 0, f0 + 0.95, 0.55, 1.8);
      box("yellow", 0.1, 0, f0 + 0.55, 0.35, 0.75, 0.9);
      riser(-0.7, 0, f0 + 1.4, 0.22);
      lay("rust", -0.7 - 0.95, 0, f0 + 0.8, 0.2, 0.6);
      break;
    }
    case "generator":
      box("dark", 0, 0, f0, L - 0.3, 0.25, D - 0.3);
      box("green", -0.3, 0, f0 + 0.25, L * 0.62, 1.45, D - 0.7);
      lay("metal", L * 0.3, 0, f0 + 0.95, 0.6, L * 0.25);
      break;
    case "cabinet":
      box("metal", 0, 0, f0, 1.5, 2.1, 1.2);
      box("dark", 0, 0.61, f0 + 1.6, 1.1, 0.25, 0.01);
      box(hash(gx, gy) < 0.5 ? "amber" : "screen", 0.4, 0.61, f0 + 1.3, 0.1, 0.1, 0.01);
      break;
    case "turbine": {
      box("dark", 0, 0, f0, L - 0.4, 0.6, D - 0.6);
      lay("green", -L * 0.18, 0, f0 + 0.6 + 1.7, 1.7, L * 0.52);
      box("metal", L * 0.28, 0, f0 + 0.6, L * 0.3, 3.1, D - 1.6);
      lay("metal", L * 0.47, 0, f0 + 2.0, 0.8, 1.0);
      riser(-L * 0.28, 0, f0 + 3.6, 0.42);
      riser(-L * 0.06, 0, f0 + 3.6, 0.42);
      break;
    }
    case "transformer": {
      box("green", 0, 0, f0, W - 1.2, 2.4, H - 1.6);
      for (let k = -2; k <= 2; k++) {
        box("dark", k * 0.5, (H - 1.6) / 2 + 0.3, f0 + 0.3, 0.05, 1.8, 0.6);
        box("dark", k * 0.5, -(H - 1.6) / 2 - 0.3, f0 + 0.3, 0.05, 1.8, 0.6);
      }
      for (const a of [-0.8, 0, 0.8]) {
        const [x, z] = at(a, 0);
        P.cyl("pale", x, f0 + 2.4, z, 0.12, 0.75, "y", 8);
      }
      break;
    }
    case "compressor":
      box("dark", 0, 0, f0, L - 0.3, 0.25, D - 0.3);
      lay("green", -0.4, 0, f0 + 0.9, 0.62, L * 0.55);
      box("metal", L * 0.3, 0, f0 + 0.25, L * 0.25, 1.2, D - 0.6);
      break;
    case "lathe":
      for (const a of [-L * 0.36, L * 0.36]) box("dark", a, 0, f0, 0.55, 0.85, 0.6);
      box("metal", 0, 0, f0 + 0.85, L - 0.4, 0.25, 0.6);
      box("green", -L * 0.32, 0, f0 + 1.1, 0.8, 0.6, 0.7);
      box("green", L * 0.3, 0, f0 + 1.1, 0.4, 0.45, 0.5);
      break;
    default: {
      // press: two columns, a crown, a bed
      for (const a of [-1.1, 1.1]) box("green", a, 0, f0, 0.45, 3.0, 1.8);
      box("green", 0, 0, f0 + 3.0, 2.8, 0.8, 2.0);
      box("dark", 0, 0, f0, 1.8, 0.9, 1.6);
      break;
    }
  }
}

function tankPiece(P: Pieces, w: PipeWorld, gx: number, gy: number, v: number): void {
  const fp = PIPE_TANKS[v];
  if (!fp) return;
  const f0 = w.floorAt(gx, gy);
  const top = w.ceilAt(gx, gy);
  const cx = (gx + fp.w / 2) * CELL;
  const cz = (gy + fp.h / 2) * CELL;
  const alongX = fp.w >= fp.h;
  const L = Math.max(fp.w, fp.h) * CELL;
  const D = Math.min(fp.w, fp.h) * CELL;
  const at = (a: number, o: number): [number, number] => (alongX ? [cx + a, cz + o] : [cx + o, cz + a]);
  const ax = alongX ? "x" : "z";
  if (fp.name === "vtank") {
    const h = Math.max(1.5, Math.min(5.2, top - f0 - 0.8));
    P.cyl("rust", cx, f0, cz, 1.7, h, "y", 20);
    P.cyl("dark", cx, f0 + h, cz, 1.2, 0.3, "y", 16);
    if (top - f0 - h > 0.6) P.cyl("rust", cx + 0.6, f0 + h + 0.3, cz, 0.2, top - f0 - h - 0.3, "y", 10);
    return;
  }
  const r = fp.name === "boiler" ? Math.min(2.3, D / 2 - 0.3) : Math.min(1.7, D / 2 - 0.2);
  const y = f0 + 0.45 + r;
  const [sx, sz] = at(0, 0);
  P.cyl("rust", sx, y, sz, r, L - 0.9, ax, 22);
  for (const a of [-(L / 2 - 0.45), L / 2 - 0.45]) {
    const g = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.35, 1);
    if (alongX) g.rotateZ(a > 0 ? -Math.PI / 2 : Math.PI / 2);
    else g.rotateX(a > 0 ? Math.PI / 2 : -Math.PI / 2);
    const [px, pz] = at(a, 0);
    g.translate(px, y, pz);
    P.add("rust", g);
  }
  // saddles
  for (const a of [-L * 0.3, L * 0.3]) {
    const [x, z] = at(a, 0);
    P.box("dark", x, f0, z, alongX ? 0.5 : D - 0.6, 0.45 + r * 0.5, alongX ? D - 0.6 : 0.5);
  }
  if (fp.name === "boiler") {
    // the steam drum along its back, and the uptake to the ceiling
    const [dx, dz] = at(0, 0);
    P.cyl("rust", dx, y + r + 0.55, dz, 0.55, L * 0.7, ax, 14);
    const [ux, uz] = at(-L * 0.3, 0);
    if (top - (y + r + 1.1) > 0.3) P.cyl("dark", ux, y + r + 1.1, uz, 0.5, top - (y + r + 1.1), "y", 12);
  }
}

function rackPiece(P: Pieces, w: PipeWorld, gx: number, gy: number, v: number): void {
  const f0 = w.floorAt(gx, gy);
  const cx = (gx + 0.5) * CELL;
  const cz = (gy + 0.5) * CELL;
  const alongX = v === 0;
  const box = (mat: Mat, a: number, o: number, y0: number, sa: number, sy: number, so: number): void => {
    const [x, z] = alongX ? [cx + a, cz + o] : [cx + o, cz + a];
    P.box(mat, x, y0, z, alongX ? sa : so, sy, alongX ? so : sa);
  };
  const levels = [0.12, 1.6, 3.1, 4.55];
  for (const a of [-0.97, 0.97]) for (const o of [-0.62, 0.62]) box("rack", a, o, f0, 0.07, 4.6, 0.07);
  for (const y of levels) {
    for (const o of [-0.62, 0.62]) box("beam", 0, o, f0 + y, 2.0, 0.1, 0.06);
    box("wood", 0, 0, f0 + y + 0.1, 1.9, 0.03, 1.2);
  }
  for (const [k, y] of levels.slice(0, 3).entries()) {
    const hh = hash(gx * 5 + k, gy * 3);
    if (hh < 0.2) continue;
    box(hh < 0.55 ? "wood" : hh < 0.8 ? "pale" : "rust", -0.4, 0, f0 + y + 0.13, 0.85, 0.9 + hh * 0.3, 1.0);
    if (hh > 0.45) box("wood", 0.5, 0, f0 + y + 0.13, 0.8, 0.8, 0.9);
  }
}

/** A prop locked door on the cell's `side` wall: steel slab, frame, a red
 *  stencil plate. The exit door is the same, bigger, with the fuse panel's
 *  box beside it. */
function doorPiece(P: Pieces, w: PipeWorld, gx: number, gy: number, side: number, big: boolean): void {
  const f0 = w.floorAt(gx, gy);
  const F = wallFrame(gx, gy, side);
  const place = (mat: Mat, a: number, y0: number, o: number, len: number, h: number, depth: number): void => {
    const [x, z] = F.at(a, o + depth / 2);
    P.box(mat, x, y0, z, len, h, depth, F.rot);
  };
  const dw = big ? 1.9 : 1.05;
  const dh = big ? 2.9 : 2.1;
  place("dark", 0, f0, 0.0, dw + 0.24, dh + 0.14, 0.06);
  place("metal", 0, f0, 0.06, dw, dh, 0.06);
  place(big ? "yellow" : "red", 0, f0 + dh * 0.62, 0.12, dw * 0.55, 0.26, 0.01);
  if (big) for (const a of [-0.6, 0, 0.6]) place("dark", a, f0 + 0.2, 0.12, 0.06, dh - 0.4, 0.04);
}

function panelPiece(P: Pieces, w: PipeWorld, gx: number, gy: number, side: number): void {
  const f0 = w.floorAt(gx, gy);
  const F = wallFrame(gx, gy, side);
  const place = (mat: Mat, a: number, y0: number, o: number, len: number, h: number, depth: number): void => {
    const [x, z] = F.at(a, o + depth / 2);
    P.box(mat, x, y0, z, len, h, depth, F.rot);
  };
  place("metal", 0, f0 + 0.7, 0.0, 0.9, 1.2, 0.3);
  for (const a of [-0.25, 0, 0.25]) place("dark", a, f0 + 1.0, 0.3, 0.14, 0.5, 0.02);
  place("amber", 0, f0 + 1.65, 0.3, 0.12, 0.12, 0.01);
}

/** Railings along every open edge that drops two or more steps — catwalks,
 *  the bridge, the sides of the pit stairs. Returns the rail segments as
 *  colliders too (in cells), so nobody walks off a catwalk by accident. */
function railings(P: Pieces, w: PipeWorld, gx: number, gy: number, out: { x: number; y: number; rx: number; ry: number }[]): void {
  if (w.solidAt(gx, gy)) return;
  const f = w.floorAt(gx, gy);
  const nbr: [number, number, number, boolean][] = [
    [gx, gy - 1, 0, !w.wallNAt(gx, gy)],
    [gx + 1, gy, 1, !w.wallWAt(gx + 1, gy)],
    [gx, gy + 1, 2, !w.wallNAt(gx, gy + 1)],
    [gx - 1, gy, 3, !w.wallWAt(gx, gy)],
  ];
  for (const [nx, ny, side, open] of nbr) {
    if (!open || !w.hasCell(nx, ny) || w.solidAt(nx, ny)) continue;
    if (f - w.floorAt(nx, ny) < 0.99) continue; // two steps = 1m
    const F = wallFrame(gx, gy, side);
    const [px, pz] = F.at(0, 0.05);
    for (const a of [-0.95, 0, 0.95]) {
      const [x, z] = F.at(a, 0.05);
      P.box("yellow", x, f, z, 0.05, 1.05, 0.05);
    }
    for (const y of [0.52, 1.02]) P.box("yellow", px, f + y, pz, 1.96, 0.045, 0.045, F.rot);
    P.box("yellow", px, f, pz, 1.96, 0.1, 0.02, F.rot);
    // the collider: a thin bar on the higher cell's side of the edge
    const along = side === 0 || side === 2;
    out.push({
      x: gx + 0.5 + (side === 1 ? 0.45 : side === 3 ? -0.45 : 0),
      y: gy + 0.5 + (side === 2 ? 0.45 : side === 0 ? -0.45 : 0),
      rx: along ? 0.5 : 0.06,
      ry: along ? 0.06 : 0.5,
    });
  }
}

/** The colliders the furniture needs (cells). Solid footprints already
 *  collide as cells; these are the pieces that stand on open floor. */
function furnitureCollider(code: number, gx: number, gy: number): { x: number; y: number; rx: number; ry: number } | null {
  const k = code >> 4;
  const v = code & 15;
  if (k === PK.wallA || k === PK.wallB) {
    const side = v & 3;
    const type = v >> 2;
    // breakers and manifolds are shallow; everything else ~0.6m deep
    const depth = k === PK.wallB && (type === 2 || type === 3) ? 0.14 : 0.18;
    const along = side === 0 || side === 2;
    const off = 0.5 - depth;
    return {
      x: gx + 0.5 + (side === 1 ? off : side === 3 ? -off : 0),
      y: gy + 0.5 + (side === 2 ? off : side === 0 ? -off : 0),
      rx: along ? 0.48 : depth,
      ry: along ? depth : 0.48,
    };
  }
  if (k === PK.free) {
    const type = v >> 1;
    const axis = v & 1;
    const dims: [number, number][] = [
      [0.45, 0.1], // bench
      [0.45, 0.23], // table
      [0.38, 0.19], // desk
      [0.26, 0.26], // crates
      [0.3, 0.28], // drums
      [0, 0], // pallet: step over it
      [0.2, 0.28], // cable drum
      [0, 0], // stall: walk into it
    ];
    const [a, o] = dims[type] ?? [0, 0];
    if (!a) return null;
    return { x: gx + 0.5, y: gy + 0.5, rx: axis === 0 ? a : o, ry: axis === 0 ? o : a };
  }
  return null;
}

/** Build every fixture of one chunk: returns meshes to add and the extra
 *  colliders (in cells). `light` is the chunk's baked light at a world
 *  point (0..1), the same field the walls sample. */
export function buildPipeFixtures(
  w: PipeWorld,
  cx: number,
  cy: number,
  n: number,
  light: (x: number, z: number) => number,
  /** The chunk's own light curve (field strength → vertex brightness), so a
   *  machine sits in exactly the light its walls do; the default is the old
   *  curve, for the map editor's preview. */
  shade: (e: number, x: number, z: number) => number = (e) => Math.min(1.4, 0.05 + 1.3 * e),
): { meshes: THREE.Mesh[]; colliders: { x: number; y: number; rx: number; ry: number }[] } {
  const P = new Pieces();
  const colliders: { x: number; y: number; rx: number; ry: number }[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx = cx * n + x;
      const gy = cy * n + y;
      const code = w.decoAt(gx, gy);
      const k = code >> 4;
      const v = code & 15;
      // a piece the kit has a real model of arrives as a kit prop
      // (src/backrooms/pipes-models.ts) — only its collider is built here
      if (modelled(code)) {
        const c = furnitureCollider(code, gx, gy);
        if (c) colliders.push(c);
        railings(P, w, gx, gy, colliders);
        continue;
      }
      if (k === PK.machine) machinePiece(P, w, gx, gy, v);
      else if (k === PK.tank) tankPiece(P, w, gx, gy, v);
      else if (k === PK.rack) rackPiece(P, w, gx, gy, v);
      else if (k === PK.wallA || k === PK.wallB) wallPiece(P, w, gx, gy, k as 13 | 14, v >> 2, v & 3);
      else if (k === PK.free) freePiece(P, w, gx, gy, v >> 1, v & 1);
      else if (k === PK.lockeddoor) doorPiece(P, w, gx, gy, v & 3, false);
      else if (k === PK.exitdoor) doorPiece(P, w, gx, gy, v & 3, true);
      else if (k === PK.panel) panelPiece(P, w, gx, gy, v & 3);
      const c = furnitureCollider(code, gx, gy);
      if (c) colliders.push(c);
      railings(P, w, gx, gy, colliders);
    }
  }
  const M = materials();
  const meshes: THREE.Mesh[] = [];
  for (const [mat, geos] of P.by) {
    if (!geos.length) continue;
    // Normalise attributes so the pieces merge (spheres/torii carry the same
    // three as boxes; drop anything extra).
    for (const g of geos) {
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const material = M[mat];
    if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      const pos = merged.attributes.position as THREE.BufferAttribute;
      const nor = merged.attributes.normal as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        // sample a hand off the surface, along its normal, so the bake reads
        // from this side of the nearest wall
        const sx = pos.getX(i) + nor.getX(i) * 0.15;
        const sz = pos.getZ(i) + nor.getZ(i) * 0.15;
        const l = shade(light(sx, sz), sx, sz);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = l;
      }
      merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `pipes:${mat}`;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return { meshes, colliders };
}

// ---- THE PIPE RUNS (Backrooms law 8, Oct 2026) --------------------------------
// Every one of the twenty reference images for Pipe Dreams (docs/backrooms/
// REFERENCES.md) is defined by the same thing: bundles of horizontal pipes
// along both walls and the ceiling of its corridors. Ours had none — a known
// gap since Sep 2026. These are those runs, on every real wall (never on a
// machine, tank or rack) of the rooms a plant would pipe: high on the wall
// above the doorways, a pair along a corridor's ceiling, and a pair near the
// floor in the galleries.
//
// CHEAP BY CONSTRUCTION: a run is ONE low-poly cylinder for as many cells as
// its wall goes on (a kit pipe piece is 512 triangles; a corridor-heavy chunk
// would carry ~150k of them), merged into ONE mesh a chunk, lit by its own baked
// field per vertex exactly like the furniture above — so a pipe sits in the
// same dark as the wall behind it instead of glowing. They wear the KIT
// PIPE's own material once it has loaded (Josh's pipe pack), in four
// finishes: bare, painted grey, faded green, faded red.
//
// Deterministic: a wall LINE's pipes come from a hash of the line, not of the
// cell, so a run keeps its sizes all the way along its wall and every client
// draws the same plant. Nothing here is on the wire or in the fingerprint.

/** WHAT A LEVEL RUNS ALONG ITS WALLS. Pipe Dreams lays its kit pipe in four
 *  finishes; the Electrical Station (Oct 2026, the reference task: conduit and
 *  cable along every corridor) lays thin galvanized conduit in bundles with
 *  the same builder — the reuse law: one run, one end-turn rule, one merge. */
export interface RunProfile {
  /** Room types the runs go through. */
  runTypes: ReadonlySet<string>;
  /** …that also carry runs down the middle of the ceiling. */
  ceilingTypes: ReadonlySet<string>;
  /** …that carry a pair near the floor (Pipe Dreams only). */
  lowTypes: ReadonlySet<string>;
  /** Radii of the high runs, as fractions of the kit pipe's radius. */
  scales: readonly number[];
  /** How many high runs a wall line asks for (fit permitting), off its hash. */
  want: (h: number) => number;
  /** Gap between stacked runs, metres. */
  gap: number;
  /** The highest a wall run hangs, metres above the floor (a tall room keeps
   *  its conduit where people look, not under a 7m ceiling). */
  topCap?: number;
  /** Finish tints, white = the material as it is. */
  tints: readonly number[];
  /** Ceiling runs: offsets across the corridor, and their radius fraction. */
  ceilLats: readonly number[];
  ceilScale: number;
  /** Does this solid cell count as a machine standing on floor (not a wall)? */
  fixtureCell: (w: PipeWorld, gx: number, gy: number) => boolean;
  /** Do Pipe Dreams' wall deco (vents, panels, doors) clear a stretch? */
  respectDeco: boolean;
}
/** Room types a plant runs pipe through (never the safe rooms or the offices). */
export const PIPE_RUN_TYPES: ReadonlySet<string> = new Set([
  "pipegallery",
  "servicering",
  "corridor",
  "tunnel",
  "machineshop",
  "boilerhouse",
  "enginehall",
  "warehouse",
]);
/** …and the ones that also carry a pair along the ceiling. */
const CEILING_RUN_TYPES: ReadonlySet<string> = new Set(["pipegallery", "servicering", "corridor", "tunnel"]);
/** …and the ones with a pair near the floor too. */
const LOW_RUN_TYPES: ReadonlySet<string> = new Set(["pipegallery", "servicering", "boilerhouse"]);
const RUN_CELL_M = 2;
const DOOR_CLEAR = 2.25; // the lowest a high run may hang (above every doorway)
const KIT_PIPE_D = 0.281; // the kit pipe's diameter, which the radii scale from
const FINISH_TINTS = [0xffffff, 0x9a9d98, 0x86957f, 0xa07a6e] as const; // bare, grey, green, red
/** Pipe Dreams' runs: the kit pipe, bare / grey / green / red. */
export const PIPE_RUN_PROFILE: RunProfile = {
  runTypes: PIPE_RUN_TYPES,
  ceilingTypes: CEILING_RUN_TYPES,
  lowTypes: LOW_RUN_TYPES,
  scales: [0.55, 0.75, 1.0, 1.3],
  want: (h) => 2 + (h % 3),
  gap: 0.06,
  tints: FINISH_TINTS,
  ceilLats: [-0.26, 0.26],
  ceilScale: 0.8,
  fixtureCell: (w, gx, gy) => pipeFixtureCell(w, gx, gy),
  respectDeco: true,
};
/** The Electrical Station's runs: CONDUIT — thin galvanized tube in bundles
 *  of three to six up the walls of its working rooms, a tray-width bundle
 *  down the middle of every serviceway and cable vault. Galvanized, dull
 *  grey, and the black of cable sheath. */
export const STATION_RUN_PROFILE: RunProfile = {
  runTypes: new Set(["serviceway", "cablevault", "switchroom", "intake", "substation", "xfmrbay", "batteryroom", "workshop", "lifthall", "floodroom"]),
  ceilingTypes: new Set(["serviceway", "cablevault"]),
  lowTypes: new Set(),
  scales: [0.18, 0.24, 0.3, 0.36],
  want: (h) => 3 + (h % 4),
  gap: 0.05,
  topCap: 3.4,
  tints: [0xe6e9eb, 0xc9cdd0, 0xa4a8ab, 0x4e5053],
  ceilLats: [-0.32, -0.24, -0.16, 0.16, 0.24],
  ceilScale: 0.24,
  fixtureCell: () => false,
  respectDeco: false,
};
const RADIAL = 8; // eight sides: round enough at arm's length, and a corridor carries dozens

const pipeHash = (a: number, b: number, c: number): number =>
  (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;

const runMats = new Map<string, THREE.MeshStandardMaterial>();
function runMaterial(base: THREE.Material | null, finish: number): THREE.MeshStandardMaterial {
  const key = `${base?.uuid ?? "plain"}:${finish}`;
  let m = runMats.get(key);
  if (!m) {
    const src = base as THREE.MeshStandardMaterial | null;
    m = src?.isMeshStandardMaterial
      ? (src.clone() as THREE.MeshStandardMaterial)
      : new THREE.MeshStandardMaterial({ color: 0x7a7066, roughness: 0.7, metalness: 0.2 });
    m.vertexColors = true;
    m.color.multiply(new THREE.Color(FINISH_TINTS[finish]));
    if (m.metalness > 0.3) m.metalness = 0.3; // no environment map: metal renders black
    runMats.set(key, m);
  }
  return m;
}

/** The pipes one wall LINE carries: centre heights above the floor, radii,
 *  finishes. As many high runs as fit between the doorways and the ceiling. */
export function pipeLineSet(type: string, floorToCeil: number, line: number, prof: RunProfile = PIPE_RUN_PROFILE): { h: number; r: number; finish: number }[] {
  const h0 = pipeHash(line, type.length, 7);
  const out: { h: number; r: number; finish: number }[] = [];
  const scales = prof.scales;
  const nt = prof.tints.length;
  let top = Math.min(floorToCeil, prof.topCap ?? Infinity) - 0.12;
  const want = prof.want(h0);
  for (let k = 0; k < want; k++) {
    const r = (KIT_PIPE_D / 2) * scales[(h0 >>> (3 + k * 2)) % scales.length];
    const h = top - r;
    if (h - r < DOOR_CLEAR) break;
    out.push({ h, r, finish: (h0 >>> (12 + k)) % nt });
    top = h - r - prof.gap;
  }
  if (prof.lowTypes.has(type) && (h0 & 1) === 0) {
    const r1 = (KIT_PIPE_D / 2) * 1.1;
    out.push({ h: 0.32, r: r1, finish: (h0 >>> 20) % nt });
    out.push({ h: 0.32 + r1 * 2 + 0.08, r: (KIT_PIPE_D / 2) * 0.7, finish: (h0 >>> 23) % nt });
  }
  return out;
}

export interface PipeRunWorld extends PipeWorld {
  typeAt(x: number, y: number): string;
}

export function buildPipeRuns(
  w: PipeRunWorld,
  cx: number,
  cy: number,
  n: number,
  light: (x: number, z: number) => number,
  kitMat: THREE.Material | null,
  prof: RunProfile = PIPE_RUN_PROFILE,
  /** The chunk's own light curve (see buildPipeFixtures). */
  shade: (e: number, x: number, z: number) => number = (e) => Math.min(1.4, 0.05 + 1.3 * e),
): THREE.Mesh[] {
  const byFinish = new Map<number, THREE.BufferGeometry[]>();
  const add = (finish: number, g: THREE.BufferGeometry): void => {
    let a = byFinish.get(finish);
    if (!a) byFinish.set(finish, (a = []));
    a.push(g);
  };
  /** A real wall on this side of the cell — a wall line or solid rock, never
   *  a machine, tank or rack (those are fixtures with floor under them). */
  const wallOn = (gx: number, gy: number, side: number): boolean => {
    const nx = gx + (side === 1 ? 1 : side === 3 ? -1 : 0);
    const ny = gy + (side === 2 ? 1 : side === 0 ? -1 : 0);
    const thin = side === 0 ? w.wallNAt(gx, gy) : side === 2 ? w.wallNAt(gx, gy + 1) : side === 3 ? w.wallWAt(gx, gy) : w.wallWAt(gx + 1, gy);
    if (thin) return true;
    return w.solidAt(nx, ny) && !prof.fixtureCell(w, nx, ny);
  };
  /** Something already hangs on this side of the cell (a vent, a panel, a
   *  door, a locker or bench): the pipes leave that stretch alone. */
  const busySide = (gx: number, gy: number, side: number): boolean => {
    if (!prof.respectDeco) return false;
    const code = w.decoAt(gx, gy);
    const k = code >> 4;
    const v = code & 15;
    if (k === PK.vent || k === PK.panel || k === PK.lockeddoor || k === PK.exitdoor || k === PK.wallA || k === PK.wallB) return (v & 3) === side;
    return false;
  };
  const runnable = (gx: number, gy: number): boolean => w.hasCell(gx, gy) && !w.solidAt(gx, gy) && prof.runTypes.has(w.typeAt(gx, gy));

  /** A straight piece of pipe between two points, any direction. */
  const UP = new THREE.Vector3(0, 1, 0);
  const segment = (a: THREE.Vector3, b: THREE.Vector3, r: number, finish: number, segs: number): void => {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 0.03) return;
    // CAPPED (Nov 2026 polish round): every end was meant to go into a wall,
    // a fitting or the next chunk's run, and an open cylinder end that missed
    // showed its pale hollow inside — at outside corners, at chunk seams and
    // on the Station's conduit. A cap is hidden wherever the end is buried,
    // and closes the pipe wherever one isn't.
    const g = new THREE.CylinderGeometry(r, r, len, RADIAL, Math.max(1, segs), false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    add(finish, g); // indexed, like every piece here: a fifth of the vertices to light
  };
  /** Where a run turns, a fitting covers the joint. */
  const joint = (at: THREE.Vector3, r: number, finish: number): void => {
    const g = new THREE.SphereGeometry(r * 1.1, RADIAL, 4);
    g.translate(at.x, at.y, at.z);
    add(finish, g);
  };
  /** A run along one axis from u0 to u1 (metres along it), at height y, with
   *  `f` its fixed coordinate across the axis. A coupling sleeve every other
   *  cell. An end that would stop in mid-air TURNS instead: `t0`/`t1` is the
   *  short leg it bends into (into its wall, or up into the ceiling), so no
   *  run ever ends on an open stub. */
  const run = (alongX: boolean, f: number, u0: number, u1: number, y: number, r: number, finish: number, cells: number, t0: THREE.Vector3 | null, t1: THREE.Vector3 | null): void => {
    const at = (u: number): THREE.Vector3 => (alongX ? new THREE.Vector3(u, y, f) : new THREE.Vector3(f, y, u));
    const inset = r + 0.04;
    const a = at(t0 ? u0 + inset : u0);
    const b = at(t1 ? u1 - inset : u1);
    segment(a, b, r, finish, cells);
    for (let c = 1; c < cells; c += 2) {
      const sleeve = at(u0 + ((u1 - u0) * c) / cells);
      segment(sleeve.clone().addScaledVector(b.clone().sub(a).normalize(), -0.06), sleeve.clone().addScaledVector(b.clone().sub(a).normalize(), 0.06), r * 1.2, finish, 1);
    }
    for (const [end, turn] of [[a, t0], [b, t1]] as const) {
      if (!turn) continue;
      joint(end, r, finish);
      segment(end, end.clone().add(turn), r, finish, 1);
    }
  };
  /** How one end of a run meets what lies past it: a WALL takes the pipe in,
   *  a run carrying on into the next chunk (or past the streamed world) is
   *  CONT, and anything else is OPEN — the end must turn. */
  const endKind = (alongX: boolean, gx: number, gy: number, dir: 1 | -1, ok: (x: number, y: number) => boolean, base: number, ceil: number): "wall" | "cont" | "open" => {
    const nx = alongX ? gx + dir : gx;
    const ny = alongX ? gy : gy + dir;
    if (!w.hasCell(nx, ny)) return "cont";
    const thin = alongX ? (dir > 0 ? w.wallWAt(gx + 1, gy) : w.wallWAt(gx, gy)) : dir > 0 ? w.wallNAt(gx, gy + 1) : w.wallNAt(gx, gy);
    if (thin || (w.solidAt(nx, ny) && !prof.fixtureCell(w, nx, ny))) return "wall";
    const local = alongX ? nx - cx * n : ny - cy * n;
    // the next chunk's run must be the SAME run: its pipes are chosen by its
    // first cell's type (pipeLineSet), so a seam where the type changes is two
    // different sets of pipes meeting — each end turns instead
    if ((local < 0 || local >= n) && ok(nx, ny) && w.typeAt(nx, ny) === w.typeAt(gx, gy) && Math.abs(w.floorAt(nx, ny) - base) < 0.01 && Math.abs(w.ceilAt(nx, ny) - ceil) < 0.01) return "cont";
    return "open";
  };

  /** Walk one line of the chunk, cutting it into runs of cells that pass
   *  `ok` on one floor and one ceiling height; `emit` draws each run. */
  const scan = (line: number, alongX: boolean, ok: (gx: number, gy: number) => boolean, emit: (start: number, end: number, base: number, ceil: number) => void): void => {
    const x0 = cx * n;
    const y0 = cy * n;
    let start = -1;
    let base = 0;
    let ceil = 0;
    let type = "";
    for (let b = 0; b <= n; b++) {
      const gx = alongX ? x0 + b : x0 + line;
      const gy = alongX ? y0 + line : y0 + b;
      const pass = b < n && ok(gx, gy);
      const f = pass ? w.floorAt(gx, gy) : 0;
      const c = pass ? w.ceilAt(gx, gy) : 0;
      const t = pass ? w.typeAt(gx, gy) : "";
      // a run is one type too (Nov 2026 polish round): its pipes are its first
      // cell's, so they must be the pipes all the way along (see endKind)
      const breaks = !pass || (start >= 0 && (Math.abs(f - base) > 0.01 || Math.abs(c - ceil) > 0.01 || t !== type));
      if (breaks && start >= 0) {
        emit(start, b, base, ceil);
        start = -1;
      }
      if (pass && start < 0) {
        start = b;
        base = f;
        ceil = c;
        type = t;
      }
    }
  };

  const x0 = cx * n;
  const y0 = cy * n;
  // ---- the wall runs: N and S walls run along x, E and W walls along y ----
  for (const side of [0, 1, 2, 3]) {
    const alongX = side === 0 || side === 2;
    const ok = (gx: number, gy: number): boolean => runnable(gx, gy) && wallOn(gx, gy, side) && !busySide(gx, gy, side);
    for (let a = 0; a < n; a++) {
      scan(a, alongX, ok, (start, end, base, ceil) => {
        const g = (b: number): [number, number] => (alongX ? [x0 + b, y0 + a] : [x0 + a, y0 + b]);
        const type = w.typeAt(...g(start));
        const lineKey = alongX ? (y0 + a) * 4 + side : (x0 + a) * 4 + side;
        const open0 = endKind(alongX, ...g(start), -1, ok, base, ceil) === "open";
        const open1 = endKind(alongX, ...g(end - 1), 1, ok, base, ceil) === "open";
        // a one-cell stretch of wall (a doorway's jamb) that turns at an end is
        // a stub sticking out of the opening, not a run (Nov 2026 polish round)
        if (end - start <= 1 && (open0 || open1)) return;
        const toWall = side === 0 || side === 3 ? -1 : 1; // the wall is on this side of the pipe
        for (const p of pipeLineSet(type, ceil - base, lineKey, prof)) {
          const off = 0.16 + p.r + 0.03; // half the wall's ~30cm, the pipe, a hand's gap
          const line = alongX ? y0 + a : x0 + a;
          const f = toWall < 0 ? line * RUN_CELL_M + off : (line + 1) * RUN_CELL_M - off;
          const into = alongX ? new THREE.Vector3(0, 0, toWall * off) : new THREE.Vector3(toWall * off, 0, 0);
          const u0 = ((alongX ? x0 : y0) + start) * RUN_CELL_M;
          const u1 = ((alongX ? x0 : y0) + end) * RUN_CELL_M;
          run(alongX, f, u0, u1, base + p.h, p.r, p.finish, end - start, open0 ? into : null, open1 ? into : null);
        }
      });
    }
  }
  // ---- the ceiling pair down the middle of a corridor, its axis read off its
  //      walls (clear of the wall runs, which hug the wall at the same height)
  for (const alongX of [true, false]) {
    const ok = (gx: number, gy: number): boolean =>
      runnable(gx, gy) &&
      prof.ceilingTypes.has(w.typeAt(gx, gy)) &&
      (alongX ? wallOn(gx, gy, 0) && wallOn(gx, gy, 2) : wallOn(gx, gy, 1) && wallOn(gx, gy, 3));
    for (let a = 0; a < n; a++) {
      scan(a, alongX, ok, (start, end, base, ceil) => {
        const g = (b: number): [number, number] => (alongX ? [x0 + b, y0 + a] : [x0 + a, y0 + b]);
        const line = alongX ? y0 + a : x0 + a;
        const h0 = pipeHash(line, alongX ? 1 : 2, 11);
        const r = (KIT_PIPE_D / 2) * prof.ceilScale * (1 + ((h0 >>> 4) & 3) * 0.19);
        const y = ceil - 0.1 - r;
        const up = new THREE.Vector3(0, ceil + 0.05 - y, 0);
        const open0 = endKind(alongX, ...g(start), -1, ok, base, ceil) === "open";
        const open1 = endKind(alongX, ...g(end - 1), 1, ok, base, ceil) === "open";
        // An end that turns up into the ceiling turns one cell short of the
        // opening (Nov 2026 polish round): the cell a corridor ends on is its
        // doorway, and the elbows climbing into the corridor's lower ceiling
        // hung in the door's head, seen from the taller room beyond. Only a
        // run long enough to spare the cell gives it up — and a stub of one or
        // two cells that turns up is no run at all, only a knot of elbows in
        // a doorway (the control room's), so it isn't drawn.
        if (end - start <= 2 && (open0 || open1)) return;
        let s0 = start;
        let s1 = end;
        if (open0 && s1 - s0 >= 3) s0++;
        if (open1 && s1 - s0 >= 3) s1--;
        const u0 = ((alongX ? x0 : y0) + s0) * RUN_CELL_M;
        const u1 = ((alongX ? x0 : y0) + s1) * RUN_CELL_M;
        prof.ceilLats.forEach((lat, k) => {
          const finish = (h0 >>> (8 + k * 3)) % prof.tints.length;
          run(alongX, line * RUN_CELL_M + RUN_CELL_M / 2 + lat, u0, u1, y, r, finish, s1 - s0, open0 ? up : null, open1 ? up : null);
        });
      });
    }
  }

  // ONE mesh per chunk: each finish is a tint baked into the vertex colour
  // beside the light, so four finishes cost one draw call, not four.
  const parts: THREE.BufferGeometry[] = [];
  for (const [finish, geos] of byFinish) {
    for (const g of geos) for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const tint = new THREE.Color(prof.tints[finish]);
    const pos = merged.attributes.position as THREE.BufferAttribute;
    const nor = merged.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const sx = pos.getX(i) + nor.getX(i) * 0.15;
      const sz = pos.getZ(i) + nor.getZ(i) * 0.15;
      const l = shade(light(sx, sz), sx, sz);
      col[i * 3] = l * tint.r;
      col[i * 3 + 1] = l * tint.g;
      col[i * 3 + 2] = l * tint.b;
    }
    merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(merged);
  }
  if (!parts.length) return [];
  const all = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) for (const g of parts) g.dispose();
  if (!all) return [];
  const mesh = new THREE.Mesh(all, runMaterial(kitMat, 0));
  mesh.name = "pipes:runs";
  mesh.castShadow = true;
  return [mesh];
}
