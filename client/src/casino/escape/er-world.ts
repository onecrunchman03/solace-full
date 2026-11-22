// THE COMPLEX, BUILT — er-layout.ts turned into meshes, colliders and doors
// (E2; design ESCAPE.md). Pure three.js construction; no Svelte, no network.
//
// Geometry strategy: the walkable-cell union generates the walls — every edge
// between a walkable cell and a solid one grows a quad, EXCEPT at doorways,
// which grow a lintel + two jamb strips around a 1.2m opening instead. All
// wall/floor/ceiling quads merge into one geometry per material (a few
// hundred quads must not become a few hundred draw calls). UVs come from
// world coordinates, so the wallpaper tiles continuously across merged quads.
//
// LIGHTING IS A POOL: 48 always-lit rooms cannot be 48 live point lights.
// Sources (room centres + hall fixtures) are data; the ten nearest the
// player get the ten real PointLights, re-assigned on a coarse clock. The
// fixture MESHES are everywhere; only the light objects travel.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ControllerWorld } from "../../backrooms/controller";
import { FLOOR, ROOMS, DENS, SPAWN_ROOM, walkableCells, type Room } from "./er-layout";
import { carpetTex, damaskTex, ceilingTex, WALNUT } from "../world";
import { tameGlbTransparency } from "../../lib/three-hygiene";

export const CELL = 2;
// TALLER, to wear the casino's own pendant fixtures (Josh: "use the ceiling
// lights from the casino and make the ceilings taller to fit them better").
export const CEIL_M = 4.2;
const DOOR_W = 1.2;
const DOOR_H = 2.1;

export interface ErDoorway {
  room: string;
  /** Centre of the opening, metres. */
  x: number;
  z: number;
  /** 0 = opening faces ±z (north/south wall), 1 = faces ±x. */
  axis: 0 | 1;
  /** +1/-1: which side of the wall the HALL lies on (stamp + hinge side). */
  hallSide: 1 | -1;
}

export interface ErWorld {
  group: THREE.Group;
  doorways: ErDoorway[];
  /** Set a room door's open state (rotates the pivot). */
  setDoor(room: string, open: boolean): void;
  isDoorOpen(room: string): boolean;
  /** The room whose DOOR LEAF is under the crosshair within reach, or null.
   *  Aim is the only way to address a door (Josh) — proximity alone opens
   *  nothing. */
  aimDoor(camera: THREE.Camera, maxDist: number): string | null;
  /** Solid-furniture AABBs, metres: [x0,z0,x1,z1]. */
  colliders: [number, number, number, number][];
  /** THE UNIFORMITY LAW made concrete: the complex as a backrooms
   *  ControllerWorld, so the ONE shared controller (walk/run/crouch speeds,
   *  the climb rule, the player radius) drives here exactly as it does in
   *  the backrooms and the casino hall. Closed doors and furniture are
   *  props; the wall sets below are the same thin-wall grammar the
   *  backrooms speaks. */
  controllerWorld: ControllerWorld;
  /** Walls (and CLOSED doors) crossed by the straight line between two
   *  points in cells, capped at 4 — the voicechat's own muffling scale. */
  wallsBetween(ax: number, ay: number, bx: number, by: number): number;
  /** Per-frame: pool lights toward the player, spin the key, pulse the exit. */
  tick(px: number, pz: number, dt: number): void;
  /** Show the loose key at (metres) or hide it (null). */
  setKey(pos: { x: number; z: number } | null): void;
  /** Reconcile the standing chests to the server's list (metres computed
   *  from the wire's cells by the caller). */
  setChests(list: { id: number; x: number; z: number }[]): void;
  /** Exit-open glow on/off. */
  setExitOpen(open: boolean): void;
  /** THE HUNT's lighting (E4): "calm" restores the halls; "red" kills the
   *  hall fixtures and runs the flashing emergency reds. Rooms stay lit
   *  ALWAYS — Josh's spec, and the reason a shut door reads as sanctuary. */
  setHuntLights(state: "calm" | "red"): void;
  /** Roll a den's shutter up (the monster is coming) or down. */
  setShutter(den: string, up: boolean): void;
  keyReady: Promise<void>;
}

const texLoader = new THREE.TextureLoader();
const aimRay = new THREE.Raycaster();
const aimCentre = new THREE.Vector2(0, 0); // the crosshair
function tiledTex(url: string): THREE.Texture {
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** A vertical quad from (x0,z0) to (x1,z1), floor to CEIL, with world-mapped
 *  UVs. Faces get normals from winding; we add BOTH sides (interior maze —
 *  every wall is seen from both faces at some point, and backface culling on
 *  a single quad shows the void). */
function wallQuad(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = CEIL_M): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const uScale = 0.25; // 4m of wall per texture repeat
  const len = Math.hypot(x1 - x0, z1 - z0);
  const verts = new Float32Array([
    x0, y0, z0, x1, y0, z1, x1, y1, z1,
    x0, y0, z0, x1, y1, z1, x0, y1, z0,
    // back face
    x1, y0, z1, x0, y0, z0, x0, y1, z0,
    x1, y0, z1, x0, y1, z0, x1, y1, z1,
  ]);
  const u0 = (x0 + z0) * uScale, u1 = u0 + len * uScale;
  const v0 = y0 * 0.3, v1 = y1 * 0.3;
  const uvs = new Float32Array([
    u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1,
    u1, v0, u0, v0, u0, v1, u1, v0, u0, v1, u1, v1,
  ]);
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** A horizontal quad (floor y=0 up-facing or ceiling down-facing). */
function flatQuad(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const s = 0.25;
  const p = up
    ? [x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1]
    : [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
  const uv = up
    ? [x0 * s, z0 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s, x0 * s, z1 * s, x1 * s, z1 * s]
    : [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s];
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  return g;
}

/** Deterministic per-room randomness — the same furniture for every visitor. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** White stencil letters for the door leaves (Josh: "just stamp the
 *  letter/number on the door in white stencil letters"). Transparent
 *  ground, blocky paint — lit by the scene, so it goes dark in the dark. */
const stencilTex = (id: string, color = "rgba(240, 240, 235, 0.92)"): THREE.CanvasTexture => {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let px = 150;
  do {
    g.font = `bold ${px}px "Arial Black", Impact, sans-serif`;
    px -= 6;
  } while (g.measureText(id).width > 225 && px > 40);
  g.fillText(id, 128, 136);
  // The stencil bridges: two thin clear cuts through the paint, the way a
  // sprayed template reads.
  g.clearRect(0, 96, 256, 5);
  g.clearRect(0, 176, 256, 5);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** The hall's material rule for EVERY model this world loads: Lambert with
 *  the map and SIDEDNESS carried (a single-shell model renders inside-out
 *  without `side`), NearestFilter to match the room. Raw GLTF ships PBR
 *  MeshStandardMaterial, and ~2,500 draw calls of PBR under a pool of point
 *  lights was most of the "terrible frames" — Lambert is the frame diet. */
/** Flatten a loaded GLTF into a group whose origin is its own BOTTOM-CENTRE
 *  — the hall's takeProp recipe, verbatim. Each mesh is cloned with its full
 *  ancestor chain BAKED into its local matrix, so placement is pure
 *  arithmetic on a two-level group. This exists because Box3 measured on a
 *  detached GLTF scene read a MIXED-STALE matrix chain here (some axes with
 *  an internal node's translation, some without) and hung every door leaf
 *  half-buried in the floor. Never measure a detached deep hierarchy. */
function bakeModel(root: THREE.Object3D): { group: THREE.Group; size: THREE.Vector3 } {
  root.updateMatrixWorld(true);
  const inner = new THREE.Group();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // A PLAIN STATIC MESH, always — never clone(). THE ROOT CAUSE OF "THERE
    // ARE NO DOORS": Sketchfab rigs props (the door has 5 bones), and a
    // cloned SkinnedMesh still skins its vertices through bones living in
    // the DETACHED source scene — so the leaf drew wherever the orphan
    // skeleton said, not where its matrix said, while every CPU probe
    // (which ignores skinning) swore it was placed perfectly. A static
    // snapshot at bind pose is what a prop wants; the pivot does the
    // animating here. This also sheds the mesh-level boundingBox/Sphere a
    // SkinnedMesh carries, which poisoned Box3.setFromObject and frustum
    // culling with skeleton-space volumes.
    const c = new THREE.Mesh(m.geometry, m.material);
    c.name = m.name;
    c.applyMatrix4(m.matrixWorld);
    inner.add(c);
  });
  // Union GEOMETRY bounds under each mesh's composed matrix — never
  // setFromObject on model-derived meshes (see above).
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  const tmp = new THREE.Box3();
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    bb.union(tmp);
  });
  const ctr = bb.getCenter(new THREE.Vector3());
  inner.position.set(-ctr.x, -bb.min.y, -ctr.z);
  const g = new THREE.Group();
  g.add(inner);
  return { group: g, size: bb.getSize(new THREE.Vector3()) };
}

/** Baked mesh parts for INSTANCING: each mesh's geometry/material with its
 *  full local matrix relative to the baked bottom-centre origin. */
function bakeParts(root: THREE.Object3D): {
  parts: { geom: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[];
  size: THREE.Vector3;
} {
  const { group, size } = bakeModel(root);
  group.updateMatrixWorld(true);
  const parts: { geom: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    parts.push({ geom: m.geometry, mat: m.material, local: m.matrixWorld.clone() });
  });
  return { parts, size };
}

export function lambertify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (mat: THREE.Material): THREE.Material => {
      const std = mat as THREE.MeshStandardMaterial;
      const map = std.map ?? null;
      if (map) map.magFilter = THREE.NearestFilter;
      const lam = new THREE.MeshLambertMaterial({
        map,
        color: map ? 0xffffff : (std.color ?? new THREE.Color(0xcccccc)),
        transparent: std.transparent ?? false,
        opacity: std.opacity ?? 1,
        side: std.side ?? THREE.FrontSide,
        forceSinglePass: true, // never three's two-pass transparency (three-hygiene)
      });
      lam.name = std.name; // consumers key off names (the alarm's Lumina lens)
      return lam;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material as THREE.Material);
  });
}

export function buildComplex(): ErWorld {
  const group = new THREE.Group();
  const cells = walkableCells();
  // The ante-room is NOT part of the complex scene.
  for (let y = SPAWN_ROOM.y0; y <= SPAWN_ROOM.y1; y++)
    for (let x = SPAWN_ROOM.x0; x <= SPAWN_ROOM.x1; x++) cells.delete(`${x},${y}`);

  const isWalk = (cx: number, cy: number): boolean => cells.has(`${cx},${cy}`);
  const roomOf = (cx: number, cy: number): Room | undefined =>
    ROOMS.find((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1);
  const denOf = (cx: number, cy: number) =>
    DENS.find((d) => cx >= d.x0 && cx <= d.x1 && cy >= d.y0 && cy <= d.y1);

  // ---- doorway census (room/den doors + the exit mouth) --------------------
  const doorways: ErDoorway[] = [];
  const doorwayEdges = new Set<string>(); // "cx,cy|nx,ny" both directions
  const markDoorway = (roomCell: [number, number], hallCell: [number, number], id: string): void => {
    doorwayEdges.add(`${roomCell[0]},${roomCell[1]}|${hallCell[0]},${hallCell[1]}`);
    doorwayEdges.add(`${hallCell[0]},${hallCell[1]}|${roomCell[0]},${roomCell[1]}`);
    const axis: 0 | 1 = roomCell[1] === hallCell[1] ? 1 : 0;
    const x = axis === 1
      ? (Math.max(roomCell[0], hallCell[0])) * CELL
      : (roomCell[0] + 0.5) * CELL;
    const z = axis === 0
      ? (Math.max(roomCell[1], hallCell[1])) * CELL
      : (roomCell[1] + 0.5) * CELL;
    const hallSide: 1 | -1 = axis === 0 ? (hallCell[1] > roomCell[1] ? 1 : -1) : (hallCell[0] > roomCell[0] ? 1 : -1);
    doorways.push({ room: id, x, z, axis, hallSide });
  };
  for (const r of ROOMS) {
    const d = r.door;
    const rc: [number, number] =
      r.facing === "N" ? [d.x, d.y + 1] : r.facing === "S" ? [d.x, d.y - 1] : r.facing === "W" ? [d.x + 1, d.y] : [d.x - 1, d.y];
    markDoorway(rc, [d.x, d.y], r.id);
  }
  for (const den of DENS) {
    const d = den.door;
    // Den doors always face a hall above/below/beside; find the den cell
    // adjacent to the door cell.
    const cand: [number, number][] = [[d.x, d.y + 1], [d.x, d.y - 1], [d.x + 1, d.y], [d.x - 1, d.y]];
    const dc = cand.find(([cx, cy]) => denOf(cx, cy));
    if (dc) markDoorway(dc, [d.x, d.y], den.id);
  }

  // ---- the wall grammar -----------------------------------------------------
  // Canonical thin-wall sets, THE BACKROOMS' OWN LANGUAGE: wallN("x,y") is a
  // wall on the NORTH edge of cell (x,y); wallW its WEST edge. One source
  // feeds both the meshes and the shared controller's collision.
  const wallN = new Set<string>();
  const wallW = new Set<string>();
  for (const key of cells) {
    const [cx, cy] = key.split(",").map(Number);
    const myRoom = roomOf(cx, cy)?.id ?? denOf(cx, cy)?.id ?? null;
    const edges: { n: [number, number]; mark: () => void }[] = [
      { n: [cx, cy - 1], mark: () => wallN.add(`${cx},${cy}`) },
      { n: [cx, cy + 1], mark: () => wallN.add(`${cx},${cy + 1}`) },
      { n: [cx - 1, cy], mark: () => wallW.add(`${cx},${cy}`) },
      { n: [cx + 1, cy], mark: () => wallW.add(`${cx + 1},${cy}`) },
    ];
    for (const e of edges) {
      const [nx, ny] = e.n;
      if (doorwayEdges.has(`${cx},${cy}|${nx},${ny}`)) continue;
      const nWalk = isWalk(nx, ny);
      const theirRoom = nWalk ? roomOf(nx, ny)?.id ?? denOf(nx, ny)?.id ?? null : null;
      if (!nWalk || myRoom !== theirRoom) e.mark();
    }
  }

  // ---- merged geometry ------------------------------------------------------
  // THE COMPLEX WEARS THE CASINO (Josh: "make sure texturing is the same as
  // the rest of the casino, with the bedrooms having wood floors"). The wall
  // grammar splits every quad at the hall's own wainscot line — walnut wood
  // below, wine damask above — the halls walk on the hall's carpet, the
  // ceiling is the hall's coffers, and ONLY the bedroom islands keep their
  // wood-plank floors (which is also what the footstep banks key off).
  const WAIN = 1.2; // the hall's wainscot height — keep in step with world.ts
  const wallLowParts: THREE.BufferGeometry[] = [];
  const wallHighParts: THREE.BufferGeometry[] = [];
  const roomFloorParts: THREE.BufferGeometry[] = [];
  const hallFloorParts: THREE.BufferGeometry[] = [];
  const ceilParts: THREE.BufferGeometry[] = [];
  /** Push a wall span split at the wainscot line into the two material
   *  lists — as a BOX, not a sheet (Josh: "make the walls a little thicker,
   *  they are paper thin"): both faces offset ±WALL_T/2 off the wall line,
   *  end caps closing the reveals (doorway jambs show real depth), and an
   *  exposed underside for lintels. Segments are axis-aligned by
   *  construction. Collision stays the thin-edge cell law — the visual
   *  thickness is centred on it, inside the player radius. */
  const WALL_T = 0.14;
  const pushWall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = CEIL_M): void => {
    const emit = (yA: number, yB: number, list: THREE.BufferGeometry[]): void => {
      const xr = x0 !== x1; // x-run vs z-run
      const hx = xr ? 0 : WALL_T / 2;
      const hz = xr ? WALL_T / 2 : 0;
      list.push(wallQuad(x0 + hx, z0 + hz, x1 + hx, z1 + hz, yA, yB));
      list.push(wallQuad(x0 - hx, z0 - hz, x1 - hx, z1 - hz, yA, yB));
      list.push(wallQuad(x0 - hx, z0 - hz, x0 + hx, z0 + hz, yA, yB)); // start reveal
      list.push(wallQuad(x1 - hx, z1 - hz, x1 + hx, z1 + hz, yA, yB)); // end reveal
      if (yA > 0.01) {
        list.push(flatQuad(
          Math.min(x0, x1) - hx, Math.min(z0, z1) - hz,
          Math.max(x0, x1) + hx, Math.max(z0, z1) + hz,
          yA, false,
        )); // the lintel's underside
      }
    };
    if (y0 < WAIN) emit(y0, Math.min(y1, WAIN), wallLowParts);
    if (y1 > WAIN) emit(Math.max(y0, WAIN), y1, wallHighParts);
  };

  for (const key of cells) {
    const [cx, cy] = key.split(",").map(Number);
    const x0 = cx * CELL, z0 = cy * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    (roomOf(cx, cy) || denOf(cx, cy) ? roomFloorParts : hallFloorParts).push(flatQuad(x0, z0, x1, z1, 0, true));
    ceilParts.push(flatQuad(x0, z0, x1, z1, CEIL_M, false));
  }
  // THE EXIT DOORWAY (Josh: "there is no exit door, put a exit door") — the
  // stub's south wall carries a real door now. The carve is MESH-ONLY: the
  // wall keys stay in the collision sets, because the exit has always been a
  // teleport threshold (E at the open door leaves; walking never does).
  const EXIT_KEYS = new Set(["26,23", "27,23"]);
  const EXIT_X = 27 * CELL; // centred on the stub
  const EXIT_Z = 23 * CELL;
  for (const key of wallN) {
    if (EXIT_KEYS.has(key)) continue;
    const [cx, cy] = key.split(",").map(Number);
    pushWall(cx * CELL, cy * CELL, (cx + 1) * CELL, cy * CELL);
  }
  {
    const half = DOOR_W / 2;
    pushWall(26 * CELL, EXIT_Z, EXIT_X - half, EXIT_Z);
    pushWall(EXIT_X + half, EXIT_Z, 28 * CELL, EXIT_Z);
    pushWall(EXIT_X - half, EXIT_Z, EXIT_X + half, EXIT_Z, DOOR_H, CEIL_M);
  }
  for (const key of wallW) {
    const [cx, cy] = key.split(",").map(Number);
    pushWall(cx * CELL, cy * CELL, cx * CELL, (cy + 1) * CELL);
  }
  // Doorways: a lintel over the opening and a jamb strip either side.
  for (const dw of doorways) {
    const jamb = (CELL - DOOR_W) / 2;
    if (dw.axis === 0) {
      const x0 = dw.x - CELL / 2;
      pushWall(x0, dw.z, x0 + jamb, dw.z);
      pushWall(x0 + CELL - jamb, dw.z, x0 + CELL, dw.z);
      pushWall(x0 + jamb, dw.z, x0 + CELL - jamb, dw.z, DOOR_H, CEIL_M);
    } else {
      const z0 = dw.z - CELL / 2;
      pushWall(dw.x, z0, dw.x, z0 + jamb);
      pushWall(dw.x, z0 + CELL - jamb, dw.x, z0 + CELL);
      pushWall(dw.x, z0 + jamb, dw.x, z0 + CELL - jamb, DOOR_H, CEIL_M);
    }
  }

  // wallQuad maps u at 1 repeat/4m and v at 0.3/m; the hall tiles everything
  // at one motif per 2m, so the repeats below convert one to the other.
  const damask = damaskTex();
  damask.repeat.set(2, 1 / 0.6);
  const wainWood = tiledTex("/assets/casino/tex/wood.png");
  wainWood.repeat.set(2, 1 / 0.6);
  const carpet = carpetTex();
  carpet.repeat.set(2, 2); // flatQuad maps at 1/4m; the hall lays carpet per 2m
  const coffers = ceilingTex();
  coffers.repeat.set(2, 2);
  const wallLowMat = new THREE.MeshLambertMaterial({ map: wainWood, color: WALNUT });
  const wallHighMat = new THREE.MeshLambertMaterial({ map: damask });
  const roomFloorMat = new THREE.MeshLambertMaterial({ map: tiledTex("/assets/casino/tex/wood.png") });
  const hallFloorMat = new THREE.MeshLambertMaterial({ map: carpet });
  const ceilMat = new THREE.MeshLambertMaterial({ map: coffers });
  group.add(new THREE.Mesh(mergeGeometries(wallLowParts), wallLowMat));
  group.add(new THREE.Mesh(mergeGeometries(wallHighParts), wallHighMat));
  group.add(new THREE.Mesh(mergeGeometries(roomFloorParts), roomFloorMat));
  group.add(new THREE.Mesh(mergeGeometries(hallFloorParts), hallFloorMat));
  group.add(new THREE.Mesh(mergeGeometries(ceilParts), ceilMat));

  // ---- doors ----------------------------------------------------------------
  // Each doorway gets a swinging leaf on a hinge pivot, with the room's id
  // STENCILED IN WHITE on both faces (Josh's call — the stamp plaques above
  // the openings are gone; the door itself is the sign).
  const loader = new GLTFLoader();
  {
    // Every GLB through this loader gets its transparency tamed (see
    // lib/three-hygiene): the alarm light's glass shipped transparent +
    // DoubleSide, which is three's two-pass path — a per-frame material
    // re-init, twice, forever.
    const rawLoad = loader.load.bind(loader);
    loader.load = (url, onLoad, onProgress, onError): void =>
      rawLoad(url, (g) => { tameGlbTransparency(g.scene); onLoad?.(g); }, onProgress, onError);
  }
  // THE LEAF IS PROCEDURAL NOW (Josh, Aug 2026: "see snip for current door
  // placement — fix that"). door.glb was a three-door Sketchfab diorama
  // whose full-height wood surface was the FRAME, not the leaf — the whole
  // framed assembly swung as one slab, proud of the wall, overlapping the
  // wainscot, with sight gaps at the jambs. Measured (node dump), not
  // guessed: the leaf mesh in bind pose was a 1.3-unit band, the frame the
  // 2×4.1 slab everyone saw. A clean box in the complex's own walnut, panel
  // insets, and a brass knob seats flush in the opening every time.
  //
  // The PIVOT carries the doorway's fixed orientation; the SWING inside it is
  // what opens. They were one group once — and the open/close lerp drove the
  // pivot's own yaw to 0, folding every north-south door flat INTO its wall
  // (the second half of "there are no doors").
  const doorPivots = new Map<string, { swing: THREE.Group; open: boolean; target: number }>();
  /** Raycast roots for aim-addressing — room doors only, never the EXIT. */
  const doorHitRoots: THREE.Group[] = [];
  {
    const leafW = DOOR_W - 0.02;
    const leafH = DOOR_H - 0.02;
    const leafD = 0.05;
    const doorWood = tiledTex("/assets/casino/tex/wood.png");
    doorWood.repeat.set(0.6, 1.05);
    // Shared materials, per the never-dispose/shared-material law.
    const leafMat = new THREE.MeshLambertMaterial({ map: doorWood, color: 0xb98d5e });
    const panelMat = new THREE.MeshLambertMaterial({ map: doorWood, color: 0x8a6238 });
    const knobMat = new THREE.MeshLambertMaterial({ color: 0xc9a24b });
    const knobGeo = new THREE.SphereGeometry(0.034, 10, 8);
    const roseGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8);
    const buildLeaf = (): THREE.Group => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafD), leafMat);
      slab.position.set(leafW / 2, leafH / 2 + 0.01, 0);
      g.add(slab);
      // Two recessed panels per face — a hair off the slab so they read as
      // joinery, not decals.
      for (const side of [1, -1] as const) {
        for (const [py, ph] of [[1.52, 0.72], [0.62, 0.86]] as const) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 0.3, ph), panelMat);
          p.position.set(leafW / 2, py, side * (leafD / 2 + 0.002));
          p.rotation.y = side > 0 ? 0 : Math.PI;
          g.add(p);
        }
        // The knob, near the free edge, both faces.
        const knob = new THREE.Mesh(knobGeo, knobMat);
        knob.position.set(leafW - 0.09, 1.02, side * (leafD / 2 + 0.045));
        g.add(knob);
      }
      const rose = new THREE.Mesh(roseGeo, knobMat);
      rose.rotation.x = Math.PI / 2;
      rose.position.set(leafW - 0.09, 1.02, 0);
      g.add(rose);
      return g;
    };
    const stencilZ = leafD / 2 + 0.012;
    const addStencils = (swing: THREE.Group, dec: THREE.CanvasTexture): void => {
      for (const side of [1, -1] as const) {
        const p = new THREE.Mesh(
          new THREE.PlaneGeometry(0.52, 0.52),
          new THREE.MeshLambertMaterial({ map: dec, transparent: true, depthWrite: false }),
        );
        p.position.set(leafW / 2, 1.5, side * stencilZ);
        p.rotation.y = side > 0 ? 0 : Math.PI;
        swing.add(p);
      }
    };
    for (const dw of doorways) {
      // DENS ARE NOT ROOMS (Josh: "what is this den-mid door — fix that"):
      // a den's mouth wears its rolling SHUTTER and nothing else. No leaf,
      // no stencil, no aim target — the doorway census includes dens only
      // for the walls' sake.
      if (dw.room.startsWith("den")) continue;
      const pivot = new THREE.Group();
      const swing = new THREE.Group();
      pivot.add(swing);
      swing.add(buildLeaf());
      addStencils(swing, stencilTex(dw.room));
      const half = DOOR_W / 2;
      if (dw.axis === 1) {
        pivot.position.set(dw.x, 0, dw.z - half);
        pivot.rotation.y = -Math.PI / 2;
      } else {
        pivot.position.set(dw.x - half, 0, dw.z);
      }
      pivot.userData.room = dw.room;
      doorHitRoots.push(pivot);
      group.add(pivot);
      doorPivots.set(dw.room, { swing, open: false, target: 0 });
    }
    // THE EXIT DOOR — same leaf, green EXIT stencil, hinged at the carved
    // gap's west edge; setExitOpen swings it INTO the stub for the window
    // and shuts it after. Behind it, the dark of the threshold (the ante is
    // another scene — every door in this place is a teleport).
    {
      const pivot = new THREE.Group();
      const swing = new THREE.Group();
      pivot.add(swing);
      swing.add(buildLeaf());
      addStencils(swing, stencilTex("EXIT", "rgba(110, 245, 150, 0.95)"));
      pivot.position.set(EXIT_X - DOOR_W / 2, 0, EXIT_Z);
      group.add(pivot);
      doorPivots.set("EXIT", { swing, open: false, target: 0 });
      const voidPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(DOOR_W + 0.2, DOOR_H + 0.15),
        new THREE.MeshBasicMaterial({ color: 0x020202 }),
      );
      voidPlane.position.set(EXIT_X, DOOR_H / 2, EXIT_Z + 0.3);
      voidPlane.rotation.y = Math.PI;
      group.add(voidPlane);
    }
  }

  // Den shutters: the rolling door over each den mouth. The hunt lifts the
  // chosen one (setShutter) — the clatter of WHICH one is the player's tell.
  const shutters = new Map<string, { mesh: THREE.Group; up: boolean; target: number; baseY: number }>();
  loader.load("/assets/er/shutter.glb", (gltf) => {
    lambertify(gltf.scene);
    const { group: bakedShutter, size: ssz } = bakeModel(gltf.scene);
    const s = 2.3 / ssz.y;
    for (const den of DENS) {
      const dw = doorways.find((d) => d.room === den.id);
      if (!dw) continue;
      const m = bakedShutter.clone(true) as THREE.Group;
      m.scale.setScalar(s);
      // Baked bottom-centre origin: the doorway point IS the position.
      m.position.set(dw.x, 0, dw.z);
      if (dw.axis === 1) m.rotation.y = Math.PI / 2;
      group.add(m);
      shutters.set(den.id, { mesh: m, up: false, target: m.position.y, baseY: m.position.y });
    }
  });

  // ---- furnishing -----------------------------------------------------------
  const colliders: [number, number, number, number][] = [];
  const furnitureSpecs: { file: string; scale: number; w: number; d: number }[] = [
    { file: "bed", scale: 1, w: 1.79, d: 2.18 },
    { file: "antique_dresser", scale: 1, w: 0.74, d: 1.14 },
    { file: "dresser", scale: 1, w: 0.69, d: 0.44 },
    { file: "bedside_table", scale: 0.25, w: 1.07, d: 0.82 },
    { file: "floor_lamp", scale: 1, w: 0.52, d: 0.52 },
    { file: "rug", scale: 0.0055, w: 1.65, d: 2.87 },
    { file: "dresser_seat", scale: 1, w: 1.52, d: 0.56 },
  ];
  const furniture = new Map<string, THREE.Group>();
  const furnitureReady = Promise.all(
    furnitureSpecs.map(
      (f) =>
        new Promise<void>((res) =>
          loader.load(`/assets/er/${f.file}.glb`, (g) => {
            g.scene.updateMatrixWorld(true);
            furniture.set(f.file, g.scene);
            res();
          }, undefined, () => res()),
        ),
    ),
  );
  // THE BEDROOMS, INSTANCED (the perf pass): 48 rooms of cloned PBR props was
  // ~2,500 draw calls; now every unique furniture MESH is ONE InstancedMesh
  // carrying all its placements. Placement is data first (`puts`), matrices
  // second — and each piece is centred in its own frame BEFORE the yaw is
  // applied, which is the bug the old clones had (they rotated about the
  // authoring origin, so rotated pieces drifted into walls).
  type Put = { file: string; x: number; z: number; yaw: number };
  const puts: Put[] = [];
  for (const r of ROOMS) {
    const rand = mulberry32(hash(r.id));
    const cx = ((r.x0 + r.x1 + 1) / 2) * CELL;
    const cz = ((r.y0 + r.y1 + 1) / 2) * CELL;
    // Room-local frame: 6m wide (lx), 4m deep (lz), +lz toward the door wall
    // (every v2 room is 3×2 cells one way round or the other).
    // +lz maps through rot as (−sin·lz, cos·lz): S→+z rot 0, N→−z rot π,
    // W→−x rot +π/2, E→+x rot −π/2. THE FIRST CUT HAD W/E SWAPPED, which
    // put every east/west room's "back wall" furniture ON ITS DOOR WALL —
    // Josh's "furniture is still blocking doors in the C rooms" (C1-C6 and
    // all of Z face east/west; the N/S blocks masked the bug).
    const rot = r.facing === "N" ? Math.PI : r.facing === "S" ? 0 : r.facing === "W" ? Math.PI / 2 : -Math.PI / 2;
    const put = (file: string, lx: number, lz: number, yawLocal: number): void => {
      const spec = furnitureSpecs.find((f) => f.file === file)!;
      // Footprint in the LOCAL frame (yaws are quarter-turns, so the box
      // stays axis-aligned): quarter-turned pieces swap w/d.
      const quarter = Math.abs(Math.abs(yawLocal) - Math.PI / 2) < 0.1;
      const hx = (quarter ? spec.d : spec.w) / 2;
      const hz = (quarter ? spec.w : spec.d) / 2;
      // THE DOOR CORRIDOR IS SACRED (Josh, twice): nothing solid may stand
      // in the walk-in — the opening's width plus the leaf's swing, from the
      // door wall to mid-room. A violating piece is skipped outright; an
      // empty corner beats a blocked door.
      if (file !== "rug" && lx + hx > -0.85 && lx - hx < 0.85 && lz + hz > 0.2) return;
      const wx = cx + lx * Math.cos(rot) - lz * Math.sin(rot);
      const wz = cz + lx * Math.sin(rot) + lz * Math.cos(rot);
      puts.push({ file, x: wx, z: wz, yaw: yawLocal + rot });
      if (file !== "rug") {
        // Collider = the true footprint (world-axis-aligned: room rots are
        // quarter-turns too). The old conservative SQUARE swallowed the
        // doorway for long pieces — the bed's 2.18m square blocked doors.
        const worldQuarter = Math.abs(Math.sin(rot)) > 0.5;
        const whx = worldQuarter ? hz : hx;
        const whz = worldQuarter ? hx : hz;
        colliders.push([wx - whx, wz - whz, wx + whx, wz + whz]);
      }
    };
    // A bedroom, arranged like one, EVERY wall piece dead flush (Josh: "all
    // furniture needs to be up against the wall flat"): position = wall −
    // true half-footprint − 2cm. Fronts are MEASURED authored axes (the
    // axis lineup renders), not assumptions: bed's headboard is its −z end,
    // the plain dresser fronts +z, the ANTIQUE fronts +x (the 90°-wrong
    // teal in Josh's screenshot), the bedside table fronts −z (yaw 0 showed
    // the room its stamped back — the 180 flip), the seat fronts +z.
    put("bed", -2.08, -0.89, 0); // headboard flush to the back wall, side to the corner
    put("bedside_table", -0.62, -1.57, Math.PI); // at the bed's head, back to the wall, drawers out
    const antique = rand() < 0.5;
    if (antique) put("antique_dresser", 2.62, -0.6, Math.PI); // +x front → into the room
    else put("dresser", 2.77, -0.6, -Math.PI / 2); // +z front → into the room
    if (rand() < 0.5) put("dresser_seat", 2.71, 1.0, -Math.PI / 2); // against the right wall, cushion out
    put("floor_lamp", 2.7, -1.7, 0); // the back-right corner
    put("rug", -0.2, 0.9, Math.PI / 2);
  }
  void furnitureReady.then(() => {
    for (const spec of furnitureSpecs) {
      const src = furniture.get(spec.file);
      const list = puts.filter((p) => p.file === spec.file);
      if (!src || !list.length) continue;
      lambertify(src);
      // Bake to a bottom-centre origin (the takeProp recipe), then each
      // placement is pure arithmetic: translate · yaw · scale · baked-local.
      const { parts } = bakeParts(src);
      const holders = list.map((p) =>
        new THREE.Matrix4()
          .makeTranslation(p.x, 0, p.z)
          .multiply(new THREE.Matrix4().makeRotationY(p.yaw))
          .multiply(new THREE.Matrix4().makeScale(spec.scale, spec.scale, spec.scale)),
      );
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geom, part.mat, list.length);
        const mm = new THREE.Matrix4();
        for (let i = 0; i < list.length; i++) {
          mm.copy(holders[i]).multiply(part.local);
          im.setMatrixAt(i, mm);
        }
        im.instanceMatrix.needsUpdate = true;
        group.add(im);
      }
    }
    // The lamps are ON (Josh): a warm bulb glow inside every shade — light
    // the eye reads, no light the GPU pays for (the room's pool light does
    // the real work).
    const lamps = puts.filter((p) => p.file === "floor_lamp");
    if (lamps.length) {
      const glow = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe6c088 }),
        lamps.length,
      );
      const gm = new THREE.Matrix4();
      for (let i = 0; i < lamps.length; i++) {
        gm.makeTranslation(lamps[i].x, 1.62, lamps[i].z);
        glow.setMatrixAt(i, gm);
      }
      group.add(glow);
    }
  });

  // ---- lighting -------------------------------------------------------------
  const sources: { x: number; z: number; warm: boolean }[] = [];
  for (const r of ROOMS) sources.push({ x: ((r.x0 + r.x1 + 1) / 2) * CELL, z: ((r.y0 + r.y1 + 1) / 2) * CELL, warm: true });
  // The open floor (v2): a fixture grid over cells no island claims — every
  // ~5 cells, skipping anything inside a room or den.
  for (let y = FLOOR.y0 + 1; y <= FLOOR.y1; y += 5)
    for (let x = FLOOR.x0 + 2; x <= FLOOR.x1; x += 5) {
      if (roomOf(x, y) || denOf(x, y)) continue;
      sources.push({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL, warm: false });
    }
  // Fixture meshes everywhere (INSTANCED — one draw call), real lights pooled.
  // THE ROOMS wear Josh's ceiling fan (a fan with a caged lamp — authored in
  // inches, a 52" fan), one per room at the centre, with a warm bulb glow in
  // the cage. THE HALLS wear the casino's own pendant lamp — the props-pack
  // "lamp" the hall hangs at every PENDANTS spot, atlas-dressed, because a
  // corridor of this casino should be lit by this casino's fixtures.
  const roomSpots = sources.filter((s) => s.warm);
  const hallSpots = sources.filter((s) => !s.warm);
  loader.load("/assets/er/ceiling_fan.glb", (gltf) => {
    lambertify(gltf.scene);
    const FS = 0.0254; // inches → metres
    const { parts, size } = bakeParts(gltf.scene);
    const hangY = CEIL_M - size.y * FS;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geom, part.mat, roomSpots.length);
      const mm = new THREE.Matrix4();
      for (let i = 0; i < roomSpots.length; i++) {
        mm.makeTranslation(roomSpots[i].x, hangY, roomSpots[i].z)
          .multiply(new THREE.Matrix4().makeScale(FS, FS, FS))
          .multiply(part.local);
        im.setMatrixAt(i, mm);
      }
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
    // The bulb in the cage, visibly ON (warm, not bright — the pool light
    // does the actual illuminating).
    const bulb = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8c188 }),
      roomSpots.length,
    );
    const bm = new THREE.Matrix4();
    for (let i = 0; i < roomSpots.length; i++) {
      bm.makeTranslation(roomSpots[i].x, hangY + 0.14, roomSpots[i].z);
      bulb.setMatrixAt(i, bm);
    }
    group.add(bulb);
  }, undefined, () => console.warn("[escape] ceiling_fan.glb failed to load"));
  {
    // The casino pendant: props.glb's "lamp" pick over the shared atlases —
    // the EXACT fixture the hall hangs (uniformity: the same asset, not a
    // lookalike).
    const atlasTex = (url: string): THREE.Texture => {
      const t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false; // GLTF UV convention — the hall's texFile does the same
      t.magFilter = THREE.NearestFilter;
      return t;
    };
    const atlas1 = new THREE.MeshLambertMaterial({ map: atlasTex("/assets/casino/atlas-1.webp") });
    const atlas2 = new THREE.MeshLambertMaterial({ map: atlasTex("/assets/casino/atlas-2.webp") });
    loader.load("/assets/casino/props.glb", (gltf) => {
      const lampRoot = new THREE.Group();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        let node: THREE.Object3D | null = m;
        let isLamp = false;
        while (node) { if (/lamp/i.test(node.name)) isLamp = true; node = node.parent; }
        if (!isLamp) return;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
          const nm = (mat.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return nm.includes("atlas1") ? atlas1 : nm.includes("atlas2") ? atlas2 : atlas1;
        });
        const c = new THREE.Mesh(m.geometry, mats.length === 1 ? mats[0] : mats);
        c.applyMatrix4(m.matrixWorld);
        lampRoot.add(c);
      });
      if (!lampRoot.children.length) { console.warn("[escape] no lamp mesh in props.glb"); return; }
      const { parts } = bakeParts(lampRoot);
      const hangY = CEIL_M - 1.3; // the hall hangs its pendants below the slab
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geom, part.mat, hallSpots.length);
        const mm = new THREE.Matrix4();
        for (let i = 0; i < hallSpots.length; i++) {
          mm.makeTranslation(hallSpots[i].x, hangY, hallSpots[i].z).multiply(part.local);
          im.setMatrixAt(i, mm);
        }
        im.instanceMatrix.needsUpdate = true;
        group.add(im);
      }
      // the cord up to the slab
      const cord = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.015, 0.015, CEIL_M - hangY, 5),
        new THREE.MeshLambertMaterial({ color: 0x17110b }),
        hallSpots.length,
      );
      const cm = new THREE.Matrix4();
      for (let i = 0; i < hallSpots.length; i++) {
        cm.makeTranslation(hallSpots[i].x, (CEIL_M + hangY) / 2, hallSpots[i].z);
        cord.setMatrixAt(i, cm);
      }
      group.add(cord);
    }, undefined, () => console.warn("[escape] props.glb (pendant) failed to load"));
  }

  // THE LIGHT BUDGET IS THE FRAME BUDGET. Everything below shares ONE pool of
  // sixteen PointLights — three.js evaluates every light in the scene for
  // every fragment whether it shines or not, and the old build carried ~37
  // (a second red array, a glow per chest). Sixteen, reassigned around the
  // player, is the whole complex now: warm fixtures in the calm; during the
  // RED PHASE half keep the ROOMS lit (Josh's law — rooms never go dark) and
  // half become the alarm strobes.
  // THE LIGHT COUNT IS FROZEN (Aug 2026 — "it keeps freezing"): three.js
  // bakes the count of VISIBLE lights into every material's shader, so a
  // light flipping `visible` recompiles the whole complex mid-frame. Every
  // light here stays visible forever; an idle one sits at intensity 0. The
  // per-fragment cost of an intensity-0 light is a few ALU ops — the price of
  // a recompile was a third of a second of frozen room.
  const POOL = 16;
  const pool: THREE.PointLight[] = [];
  /** Which pool slots the last reassignment actually gave a source — the red
   *  strobe must not wake a slot that has nowhere to be. */
  const poolLive: boolean[] = new Array(16).fill(false);
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffd9a0, 0, 15, 1.7);
    group.add(l);
    pool.push(l);
  }
  const ambient = new THREE.AmbientLight(0x4a4234, 1.7);
  group.add(ambient);
  let ambientTarget = 1.7;
  let lastPool = 0;

  // THE ALARM LIGHTS (Josh's model — assets/casino/escape room/alarm_light.glb):
  // wall-bracket beacons ringing the floor plate's perimeter walls. In the
  // calm they are dead housings; when the alarms start the HALLS GO DARK and
  // these are all that's left — the pool's red half strobes from their heads,
  // and the "Lumina" lens material pulses emissive in step.
  let huntLights: "calm" | "red" = "calm";
  const redSpots: { x: number; z: number }[] = [];
  const alarmSpots: { x: number; z: number; yaw: number }[] = [];
  {
    const x0m = FLOOR.x0 * CELL, x1m = (FLOOR.x1 + 1) * CELL;
    const z0m = FLOOR.y0 * CELL, z1m = (FLOOR.y1 + 1) * CELL;
    // model +x points OUT of the mounting plate: rotate +x onto each wall's
    // inward normal.
    for (let x = FLOOR.x0 + 4; x <= FLOOR.x1 - 2; x += 10) {
      alarmSpots.push({ x: (x + 0.5) * CELL, z: z0m + 0.05, yaw: -Math.PI / 2 }); // north wall, faces +z
      alarmSpots.push({ x: (x + 0.5) * CELL, z: z1m - 0.05, yaw: Math.PI / 2 }); // south wall, faces -z
    }
    for (let y = FLOOR.y0 + 4; y <= FLOOR.y1 - 2; y += 8) {
      alarmSpots.push({ x: x0m + 0.05, z: (y + 0.5) * CELL, yaw: 0 }); // west wall, faces +x
      alarmSpots.push({ x: x1m - 0.05, z: (y + 0.5) * CELL, yaw: Math.PI }); // east wall, faces -x
    }
    for (const a of alarmSpots) {
      redSpots.push({ x: a.x + Math.cos(a.yaw) * 0.4, z: a.z - Math.sin(a.yaw) * 0.4 });
    }
  }
  let alarmLens: THREE.MeshLambertMaterial | null = null;
  loader.load("/assets/er/alarm_light.glb", (gltf) => {
    lambertify(gltf.scene);
    const AS = 0.5; // a fixture, not a monument (Josh: "a little smaller")
    const { parts, size } = bakeParts(gltf.scene);
    // The baked origin is bottom-CENTRE; the mount plate is the model's -x
    // face, so the bracket stands half its depth off the wall — embed that
    // half so the plate sits ON the plaster instead of floating (Josh).
    const wallOff = (size.x / 2) * AS - 0.03;
    for (const part of parts) {
      // The lens ("Lumina" in the model): shared across every instance ON
      // PURPOSE — the whole complex flashes as one system, one material tick.
      const mats = Array.isArray(part.mat) ? part.mat : [part.mat];
      for (const mt of mats) {
        if (/lumina/i.test(mt.name)) alarmLens = mt as THREE.MeshLambertMaterial;
      }
      const im = new THREE.InstancedMesh(part.geom, part.mat, alarmSpots.length);
      const mm = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      for (let i = 0; i < alarmSpots.length; i++) {
        const a = alarmSpots[i];
        mm.makeTranslation(a.x + Math.cos(a.yaw) * wallOff, 2.55, a.z - Math.sin(a.yaw) * wallOff)
          .multiply(rot.makeRotationY(a.yaw))
          .multiply(new THREE.Matrix4().makeScale(AS, AS, AS))
          .multiply(part.local);
        im.setMatrixAt(i, mm);
      }
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
  }, undefined, () => console.warn("[escape] alarm_light.glb failed to load"));

  // ---- the key + the exit ---------------------------------------------------
  // The GROUP stays visible forever (the frozen-light-count rule above — its
  // glow is a light); the MESH hides and the glow drops to intensity 0.
  const keyGroup = new THREE.Group();
  let keyShown = false;
  group.add(keyGroup);
  const keyGlow = new THREE.PointLight(0xffe9a0, 0, 8, 1.5);
  keyGlow.position.y = 1.1;
  keyGroup.add(keyGlow);
  const keyMesh = new THREE.Group();
  keyMesh.visible = false;
  keyGroup.add(keyMesh);
  let keyReadyRes: () => void;
  const keyReady = new Promise<void>((r) => (keyReadyRes = r));
  loader.load("/assets/er/key.glb", (gltf) => {
    lambertify(gltf.scene);
    const m = bakeModel(gltf.scene).group;
    m.scale.setScalar(0.0011); // authored in mm; ~0.8m of ornate key — the
    // one object in the whole complex you're hunting, so it reads at range
    m.position.y = 0.95; // baked bottom-centre: lift to hover height
    keyMesh.add(m);
    keyReadyRes();
  }, undefined, () => keyReadyRes());

  // ---- the chests -----------------------------------------------------------
  const chestMeshes = new Map<number, THREE.Group>();
  let chestSrc: THREE.Group | null = null;
  let pendingChests: { id: number; x: number; z: number }[] = [];
  const placeChest = (c: { id: number; x: number; z: number }): void => {
    if (!chestSrc || chestMeshes.has(c.id)) return;
    const g = new THREE.Group();
    const m = chestSrc.clone(true);
    m.scale.setScalar(0.5); // E0's table: authored 2.6m wide → a 1.3m chest
    g.add(m); // chestSrc is BAKED: origin already bottom-centre

    // No light per chest (the light budget is the frame budget) — the chest
    // BREATHES gold instead: its shared materials pulse emissive in tick.
    g.position.set(c.x, 0, c.z);
    group.add(g);
    chestMeshes.set(c.id, g);
  };
  const chestMats: THREE.MeshLambertMaterial[] = [];
  loader.load("/assets/er/chest.glb", (gltf) => {
    lambertify(gltf.scene);
    chestSrc = bakeModel(gltf.scene).group;
    chestSrc.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        chestMats.push(mat as THREE.MeshLambertMaterial);
    });
    for (const c of pendingChests) placeChest(c);
    pendingChests = [];
  });

  // Same rule as the key: the light never leaves the scene; the BAR hides
  // and the glow's intensity carries the open/shut state.
  const exitGlow = new THREE.Group();
  let exitOpenNow = false;
  const exitBar = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W + 0.6, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x35d06a }),
  );
  exitBar.position.set(27 * CELL, DOOR_H + 0.25, 22.9 * CELL);
  exitBar.visible = false;
  exitGlow.add(exitBar);
  const exitLight = new THREE.PointLight(0x35d06a, 0, 8, 1.6);
  exitLight.position.set(27 * CELL, 1.6, 22.4 * CELL);
  exitGlow.add(exitLight);
  group.add(exitGlow);

  // ---- the law of movement: the SHARED controller's world ------------------
  // Furniture (metres) and closed doors become props in CELLS — the same
  // {x,y,rx,ry} boxes the backrooms' propsNear speaks.
  // THE DOOR IS THE BARRIER (Josh: "doors should not be no clip when open…
  // physicalize the doors. don't put an invisible wall"): the collider
  // tracks the LEAF. Closed, it spans the opening; open, it stands along its
  // swing direction from the hinge — walk through the doorway, not the wood.
  const doorProp = (dw: ErDoorway, open: boolean): { x: number; y: number; rx: number; ry: number } => {
    if (!open) {
      return dw.axis === 0
        ? { x: dw.x / CELL, y: dw.z / CELL, rx: 0.32, ry: 0.06 }
        : { x: dw.x / CELL, y: dw.z / CELL, rx: 0.06, ry: 0.32 };
    }
    const half = DOOR_W / 2;
    if (dw.axis === 0) {
      // hinge west edge, leaf swings to +z
      return { x: (dw.x - half) / CELL, y: (dw.z + 0.52) / CELL, rx: 0.06, ry: 0.27 };
    }
    // axis 1: hinge north edge, leaf swings to -x
    return { x: (dw.x - 0.52) / CELL, y: (dw.z - half) / CELL, rx: 0.27, ry: 0.06 };
  };
  const controllerWorld: ControllerWorld = {
    mapSize: 56,
    effStepsAt: () => 0, // one storey, no pits — the complex is flat
    wallNAt: (x, y) => wallN.has(`${x},${y}`),
    wallWAt: (x, y) => wallW.has(`${x},${y}`),
    solidAt: (x, y) => !cells.has(`${x},${y}`),
    propsNear(x, y) {
      const out: { x: number; y: number; rx: number; ry: number }[] = [];
      for (const c of colliders) {
        const px = (c[0] + c[2]) / 2 / CELL, py = (c[1] + c[3]) / 2 / CELL;
        if (Math.abs(px - x) > 3 || Math.abs(py - y) > 3) continue;
        out.push({ x: px, y: py, rx: (c[2] - c[0]) / 2 / CELL, ry: (c[3] - c[1]) / 2 / CELL });
      }
      for (const dw of doorways) {
        // A DEN's mouth is its SHUTTER, not a leaf: shutter down = a solid
        // (visible) roll door, shutter up = a genuinely open hole. The old
        // doorPivots fallback treated dens as permanently shut invisible
        // doors — the exact invisible-wall rule this codebase bans (Aug
        // 2026 review). Walking into an open den is legal and unwise: den
        // cells never hide anyone, and the thing lives there.
        if (dw.room.startsWith("den")) {
          if (shutters.get(dw.room)?.up) continue; // open mouth — no collider
          const p = doorProp(dw, false); // the rolled-down shutter is the wall
          if (Math.abs(p.x - x) <= 3 && Math.abs(p.y - y) <= 3) out.push(p);
          continue;
        }
        // The leaf collides in BOTH states — the swung-open door stands
        // along the wall and you walk the opening, not through the wood.
        const p = doorProp(dw, doorPivots.get(dw.room)?.open ?? false);
        if (Math.abs(p.x - x) <= 3 && Math.abs(p.y - y) <= 3) out.push(p);
      }
      return out;
    },
  };

  /** Is this doorway acoustically/physically open? Rooms read their leaf's
   *  pivot; DENS read their shutter (they have no leaf — the doorPivots
   *  fallback used to read them as permanently shut). */
  const doorOpenFor = (room: string): boolean =>
    room.startsWith("den") ? !!shutters.get(room)?.up : !!doorPivots.get(room)?.open;

  /** Voice muffling: walk the segment in quarter-cell steps and count every
   *  wall (or shut door) the line crosses. The same wall sets the meshes and
   *  the controller use — one geometry, three consumers. */
  const wallsBetween = (ax: number, ay: number, bx: number, by: number): number => {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
    let count = 0;
    let px = Math.floor(ax), py = Math.floor(ay);
    for (let i = 1; i <= steps && count < 4; i++) {
      const x = ax + ((bx - ax) * i) / steps;
      const y = ay + ((by - ay) * i) / steps;
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cx === px && cy === py) continue;
      // Crossed at least one cell edge; check the walls on the axes moved.
      if (cx !== px) {
        const edgeX = Math.max(cx, px);
        if (wallW.has(`${edgeX},${py}`)) count++;
        else if (doorwayEdges.has(`${px},${py}|${cx},${py}`)) {
          const dw = doorways.find((d) => d.axis === 1 && Math.abs(d.x / CELL - edgeX) < 0.6 && Math.abs(d.z / CELL - (py + 0.5)) < 0.8);
          if (dw && !doorOpenFor(dw.room)) count++;
        }
      }
      if (cy !== py) {
        const edgeY = Math.max(cy, py);
        if (wallN.has(`${cx},${edgeY}`)) count++;
        else if (doorwayEdges.has(`${cx},${py}|${cx},${cy}`)) {
          const dw = doorways.find((d) => d.axis === 0 && Math.abs(d.z / CELL - edgeY) < 0.6 && Math.abs(d.x / CELL - (cx + 0.5)) < 0.8);
          if (dw && !doorOpenFor(dw.room)) count++;
        }
      }
      px = cx;
      py = cy;
    }
    return Math.min(4, count);
  };

  let t = 0;
  return {
    group,
    doorways,
    wallsBetween,
    setDoor(room, open) {
      const st = doorPivots.get(room);
      if (st) {
        st.open = open;
        st.target = open ? -Math.PI / 2 + 0.12 : 0;
      }
    },
    isDoorOpen: (room) => doorPivots.get(room)?.open ?? false,
    aimDoor(camera, maxDist) {
      aimRay.setFromCamera(aimCentre, camera);
      aimRay.far = maxDist;
      const hits = aimRay.intersectObjects(doorHitRoots, true);
      for (const h of hits) {
        let n: THREE.Object3D | null = h.object;
        while (n) {
          if (typeof n.userData?.room === "string") return n.userData.room as string;
          n = n.parent;
        }
      }
      return null;
    },
    colliders,
    controllerWorld,
    tick(px, pz, dt) {
      t += dt;
      // Door swing.
      for (const st of doorPivots.values()) {
        st.swing.rotation.y += (st.target - st.swing.rotation.y) * Math.min(1, dt * 7);
      }
      // Key idle spin + bob.
      if (keyShown) {
        keyGroup.rotation.y = t * 1.1;
        keyGroup.position.y = Math.sin(t * 1.7) * 0.07;
      }
      if (exitOpenNow) exitLight.intensity = 11 + Math.sin(t * 5) * 4;
      // The ambient breathes between states instead of snapping — the dark
      // arriving over a second is scarier than a switch.
      ambient.intensity += (ambientTarget - ambient.intensity) * Math.min(1, dt * 2.2);
      // Light pool re-assignment on a coarse clock. In the calm all sixteen
      // are warm fixtures. During the RED PHASE the halls are DARK: half the
      // pool keeps the nearest ROOMS lit (rooms never go dark — Josh's law,
      // and why a shut door reads as sanctuary), and half moves to the
      // nearest alarm heads to strobe.
      const now = performance.now();
      if (now - lastPool > 350) {
        lastPool = now;
        const nearest = <T extends { x: number; z: number }>(list: T[], n: number): T[] =>
          list
            .map((s) => ({ s, d: (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, n)
            .map((e) => e.s);
        if (huntLights === "calm") {
          const near = nearest(sources, POOL);
          for (let i = 0; i < POOL; i++) {
            const l = pool[i];
            const src = near[i];
            poolLive[i] = !!src;
            if (!src) { l.intensity = 0; continue; }
            l.position.set(src.x, CEIL_M - 0.45, src.z);
            l.color.setHex(src.warm ? 0xffd9a0 : 0xf2e5c8);
            l.intensity = 22;
            l.distance = 15;
          }
        } else {
          const HALF = POOL / 2;
          const rooms = nearest(sources.filter((s) => s.warm), HALF);
          const reds = nearest(redSpots, HALF);
          for (let i = 0; i < HALF; i++) {
            const l = pool[i];
            const src = rooms[i];
            poolLive[i] = !!src;
            if (!src) { l.intensity = 0; continue; }
            // CLAMPED TO THE ROOM (Josh: "the lights from the room should not
            // bleed through the walls into hallways") — a 6×4m room held by a
            // 4.4m throw ends at its own walls; the halls belong to the reds.
            l.position.set(src.x, CEIL_M - 1.2, src.z);
            l.color.setHex(0xffd9a0);
            l.intensity = 16;
            l.distance = 4.4;
          }
          for (let i = 0; i < HALF; i++) {
            const l = pool[HALF + i];
            const src = reds[i];
            poolLive[HALF + i] = !!src;
            if (!src) { l.intensity = 0; continue; }
            l.position.set(src.x, 2.3, src.z);
            l.color.setHex(0xff2213);
            l.distance = 24;
          }
        }
      }
      if (huntLights === "red") {
        // A hard strobe, not a fade: on for a third of each cycle, every
        // alarm in the complex on the SAME clock — one system, ringing.
        const on = t % 1.1 < 0.38;
        const HALF = POOL / 2;
        for (let i = HALF; i < POOL; i++) pool[i].intensity = on && poolLive[i] ? 42 : 0;
        if (alarmLens) {
          alarmLens.emissive.setHex(on ? 0xff2213 : 0x1a0302);
          alarmLens.emissiveIntensity = on ? 1.6 : 1;
        }
      } else if (alarmLens && alarmLens.emissiveIntensity !== 0) {
        alarmLens.emissive.setHex(0x000000);
        alarmLens.emissiveIntensity = 0;
      }
      // The chests breathe gold — an emissive pulse, not a light.
      if (chestMats.length && chestMeshes.size) {
        const em = (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.34;
        for (const mat of chestMats) mat.emissive.setRGB(em * 0.85, em * 0.55, em * 0.12);
      }
      // Shutters glide on their pivots.
      for (const s of shutters.values()) {
        s.mesh.position.y += (s.target - s.mesh.position.y) * Math.min(1, dt * 3);
      }
    },
    setKey(pos) {
      keyShown = !!pos;
      keyMesh.visible = keyShown;
      keyGlow.intensity = keyShown ? 16 : 0;
      if (!pos) return;
      keyGroup.position.set(pos.x, 0, pos.z);
      keyGroup.position.y = 0;
    },
    setExitOpen(open) {
      exitOpenNow = open;
      exitBar.visible = open;
      if (!open) exitLight.intensity = 0;
      const d = doorPivots.get("EXIT");
      if (d) {
        d.open = open;
        // Swings INTO the stub (+90°) — the void plane sits behind it.
        d.target = open ? Math.PI / 2 - 0.12 : 0;
      }
    },
    setHuntLights(state) {
      huntLights = state;
      // The alarms take the LIGHT with them: near-black ambient while red —
      // dark enough that the strobes are genuinely the only thing lighting
      // the halls (Josh's spec, verbatim).
      ambientTarget = state === "red" ? 0.12 : 1.7;
      lastPool = 0; // reassign the pool on the very next tick
      if (state === "calm") pool.forEach((l, i) => { l.intensity = poolLive[i] ? 22 : 0; });
    },
    setShutter(den, up) {
      const s = shutters.get(den);
      if (s) {
        s.up = up;
        s.target = s.baseY + (up ? 2.05 : 0);
      }
    },
    setChests(list) {
      const want = new Set(list.map((c) => c.id));
      // the waiting list is the latest list, not every list ever (Oct 2026
      // review: a chest opened before the model loaded came back as a phantom)
      pendingChests = pendingChests.filter((c) => want.has(c.id));
      for (const [id, g] of chestMeshes) {
        if (!want.has(id)) {
          group.remove(g);
          chestMeshes.delete(id);
        }
      }
      for (const c of list) {
        if (chestMeshes.has(c.id)) continue;
        if (chestSrc) placeChest(c);
        else if (!pendingChests.some((p) => p.id === c.id)) pendingChests.push(c);
      }
    },
    keyReady,
  };
}
