// STAIRS — real steps on a stair cell (src/backrooms/stairs.ts has the why).
// One builder for the game (world.ts buildChunk) and the map editor's preview,
// so a flight reads the same in both (the reuse law).
//
// A stair cell climbs one floor step (FLOOR_STEP, half a metre) across its
// CELL, towards its UP side. The flight is cut into `steps` treads, each a
// solid block from the cell's floor to its own top, so nothing under it is
// ever open. WIDTH narrows the FLIGHT, not each cell: only a cell on the
// flight's edge (no stair beside it climbing the same way) gives up its share,
// and the gap is filled by a sloped STRINGER riding just over the nosings —
// a two-cell flight at 70% is one stair 1.7 cells wide, never two strips with
// a curb between them. Risers shade a little darker than treads, so a flight
// reads as steps from any distance rather than as a ramp. Rails (optional) run along the open sides, 0.9m above
// the nosings, with a post at each end. The geometry comes back in world
// metres, NON-indexed with position · uv · normal · color — the same
// attributes as the game's floor pieces, so treads merge into the floor's own
// batches. UVs are box-projected in metres and divided by the surface's own
// unit, so a texture on a tread tiles at the scale it has on the floor.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STAIR_STEPS_DEFAULT, type StairSpec } from "../../../src/backrooms/stairs";

export interface StairCellSpec {
  /** The cell's north-west corner, world metres. */
  x0: number;
  z0: number;
  /** Cell edge, metres. */
  cell: number;
  /** The cell's floor (the flight's foot), metres. */
  y0: number;
  /** How far the flight climbs, metres. */
  rise: number;
  /** The UP side: 0 N (−z), 1 E (+x), 2 S (+z), 3 W (−x). */
  side: number;
  spec: StairSpec;
  /** Rails on the flight's left / right (as you climb), where a wall isn't. */
  railLeft: boolean;
  railRight: boolean;
  /** Is this cell the flight's left / right EDGE (no stair beside it on that
   *  side climbing the same way)? Width trims only the edges. Default true. */
  edgeLeft?: boolean;
  edgeRight?: boolean;
  /** One UV unit, metres (the tread surface's own scale). */
  uM: number;
  vM: number;
}

/** Vertex light: one value, or sampled at each vertex (x, z world metres). */
export type StairLight = number | ((x: number, z: number) => number);

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const n = g.toNonIndexed();
  g.dispose();
  return n;
}

/** UVs projected off whichever axis each triangle faces, in metres / unit. */
function projectUV(g: THREE.BufferGeometry, uM: number, vM: number): void {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) {
      ax += Math.abs(nrm.getX(i + k));
      ay += Math.abs(nrm.getY(i + k));
      az += Math.abs(nrm.getZ(i + k));
    }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[(i + k) * 2] = u / uM;
      uv[(i + k) * 2 + 1] = v / vM;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Upright faces (risers, stringer sides) catch less of an overhead light
 *  than the treads — the one cue that turns a stepped block into visible steps. */
const RISER_SHADE = 0.7;

function shade(g: THREE.BufferGeometry, light: StairLight): void {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const ny = Math.abs(nrm.getY(i));
    const l = (typeof light === "number" ? light : light(p.getX(i), p.getZ(i))) * (RISER_SHADE + (1 - RISER_SHADE) * ny);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = l;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** A sloped stringer between x0 and x1, in the flight's frame: from the foot
 *  (z = cell, y0) to the head (z = 0, y0 + rise), riding LIP over the nosings,
 *  solid down to y0. Non-indexed, outward normals. */
function stringer(x0: number, x1: number, cell: number, y0: number, rise: number): THREE.BufferGeometry {
  const LIP = 0.06;
  // the profile in (z, y)
  const P: [number, number][] = [[cell, y0], [0, y0], [0, y0 + rise + LIP], [cell, y0 + LIP]];
  const cz = cell / 2;
  const cy = y0 + (rise + LIP) / 2;
  const cx = (x0 + x1) / 2;
  const pos: number[] = [];
  const nor: number[] = [];
  // one triangle, wound so its normal points away from the prism's middle
  const tri = (a: number[], b: number[], c: number[]): void => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz];
    let pts = [a, b, c];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) {
      pts = [a, c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const q of pts) {
      pos.push(q[0], q[1], q[2]);
      nor.push(n[0] / l, n[1] / l, n[2] / l);
    }
  };
  const at = (x: number, k: number): number[] => [x, P[k][1], P[k][0]];
  for (const x of [x0, x1]) {
    tri(at(x, 0), at(x, 1), at(x, 2));
    tri(at(x, 0), at(x, 2), at(x, 3));
  }
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) % 4;
    tri(at(x0, k), at(x0, m), at(x1, m));
    tri(at(x0, k), at(x1, m), at(x1, k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A rail along one side: a sloped bar and a post at each end. Built in the
 *  flight's own frame (climbing towards −z, the cell spanning 0..cell). */
function rail(x: number, cell: number, y0: number, rise: number): THREE.BufferGeometry[] {
  const H = 0.9;
  const T = 0.05;
  const out: THREE.BufferGeometry[] = [];
  for (const z of [cell - 0.1, 0.1]) {
    const top = y0 + rise * (1 - z / cell) + H;
    out.push(box(x - T, x + T, y0 + rise * (1 - z / cell), top, z - T, z + T));
  }
  const len = Math.hypot(cell, rise);
  const bar = new THREE.BoxGeometry(T * 1.4, T * 1.4, len);
  bar.rotateX(Math.atan2(rise, cell));
  bar.translate(x, y0 + rise / 2 + H, cell / 2);
  out.push(bar.toNonIndexed());
  bar.dispose();
  return out;
}

/** The geometry of one stair cell: its treads (and cheeks), and its rails. */
export function stairGeometry(c: StairCellSpec, light: StairLight): { treads: THREE.BufferGeometry; rails: THREE.BufferGeometry | null } {
  const C = c.cell;
  const n = Math.max(1, Math.min(8, Math.round(c.spec.steps ?? STAIR_STEPS_DEFAULT)));
  const width = Math.max(0.4, Math.min(1, (c.spec.width ?? 100) / 100));
  // each EDGE of the flight gives up half the trimmed width; inner cells run
  // full, so a wide flight stays one continuous stair
  const trim = (C * (1 - width)) / 2;
  const xa = c.edgeLeft === false ? 0 : trim;
  const xb = c.edgeRight === false ? C : C - trim;
  const d = C / n;
  // in the flight's own frame: climbing towards −z, the cell 0..C on x and z
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const top = c.y0 + (c.rise * (i + 1)) / n;
    parts.push(box(xa, xb, c.y0, top, C - (i + 1) * d, C - i * d));
  }
  const strParts: THREE.BufferGeometry[] = [];
  if (xa > 0.001) strParts.push(stringer(0, xa, C, c.y0, c.rise));
  if (xb < C - 0.001) strParts.push(stringer(xb, C, C, c.y0, c.rise));
  const railParts: THREE.BufferGeometry[] = [];
  if (c.spec.rail) {
    // a rail stands on the stringer when there is one, else on the tread's edge
    if (c.railLeft) railParts.push(...rail(xa > 0.001 ? xa / 2 : 0.06, C, c.y0, c.rise));
    if (c.railRight) railParts.push(...rail(xb < C - 0.001 ? (xb + C) / 2 : C - 0.06, C, c.y0, c.rise));
  }
  // turn the flight to its UP side about the cell's middle, then place it
  const angle = [0, -Math.PI / 2, Math.PI, Math.PI / 2][c.side & 3];
  const place = (g: THREE.BufferGeometry): void => {
    g.translate(-C / 2, 0, -C / 2);
    g.rotateY(angle);
    g.translate(c.x0 + C / 2, 0, c.z0 + C / 2);
  };
  // the stringers join the tread batch (same surface); the boxes' own uv goes
  // (projectUV rewrites it) so every piece carries the same attributes
  for (const g of parts) g.deleteAttribute("uv");
  parts.push(...strParts);
  const treads = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  place(treads);
  projectUV(treads, c.uM, c.vM);
  shade(treads, light);
  let rails: THREE.BufferGeometry | null = null;
  if (railParts.length) {
    rails = mergeGeometries(railParts)!;
    for (const g of railParts) g.dispose();
    place(rails);
    projectUV(rails, 1, 1);
    shade(rails, light);
  }
  return { treads, rails };
}

/** The rails' material, shared (never disposed — rebuilding a chunk must not
 *  free what the next one draws with). */
let railMatShared: THREE.MeshStandardMaterial | null = null;
export function stairRailMat(): THREE.MeshStandardMaterial {
  return (railMatShared ??= new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.45, metalness: 0.3, vertexColors: true }));
}

/** A tread material tinted by a stair's colour, shared per (material, colour). */
const tints = new Map<string, THREE.Material>();
export function tintedStairMat(base: THREE.Material, key: string, col: string | undefined): THREE.Material {
  if (!col) return base;
  const k = `${key}|${col}`;
  let m = tints.get(k);
  if (!m) {
    const c = base.clone() as THREE.MeshStandardMaterial;
    if (c.color) c.color.set(col);
    tints.set(k, (m = c));
  }
  return m;
}
