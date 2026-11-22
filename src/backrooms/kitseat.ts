// WALL PROPS ON THE WALL'S REAL FACE (Nov 2026 polish round).
//
// A room design hangs a picture or a sign a little way off its edge, but the
// edge a COPY of the room lands on is one of two different things:
//
//  · a THIN WALL (a wallN / wallW flag): a slab 0.29 m thick centred on the
//    cell edge, so its face stands WALL_FACE (0.0725 cells) in from the edge;
//  · a bare SOLID cell next door (or scenery, or the map's own edge): drawn as
//    a whole block, its face ON the edge.
//
// Rooms are packed wall to wall, so a design hangs its props on the thin-wall
// face; but where a copy meets the map's solid rim instead, the same prop
// floated 15 cm off the stone. So once a map is built, every wall-mount kit
// prop is seated on whichever face its copy actually backs on to. Props are
// dressing — none of this is in the fingerprint — and a prop with no wall
// behind it (a sign over a doorway, a street sign on its post) is left alone.

import type { Sector } from "./worldgen";
import { KIT, kitExtents, kitYaw } from "./kit";

/** A thin wall's half thickness, in cells (0.145 m). */
export const WALL_FACE = 0.0725;
/** How far a prop may sit off the face before it's moved (cells, ≈1 cm). */
export const SEAT_TOLERANCE = 0.006;
/** The gap left between the face and a prop's back (cells, 4 mm). */
const SEAT_GAP = 0.002;

export type WallEdge = "thin" | "solid" | null;

/** The wall on one side (0 N · 1 E · 2 S · 3 W) of cell (x, y): a thin wall
 *  (the flag wins — the slab is drawn even against a solid cell), a solid
 *  face, or open. */
export function edgeAt(s: Sector, x: number, y: number, side: number): WallEdge {
  const N = s.size;
  const at = (xx: number, yy: number): number => yy * N + xx;
  const inside = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < N && yy < N;
  const flag =
    side === 0 ? s.wallN[at(x, y)] : side === 2 ? (inside(x, y + 1) ? s.wallN[at(x, y + 1)] : 0) : side === 3 ? s.wallW[at(x, y)] : inside(x + 1, y) ? s.wallW[at(x + 1, y)] : 0;
  if (flag) return "thin";
  const nx = x + (side === 1 ? 1 : side === 3 ? -1 : 0);
  const ny = y + (side === 2 ? 1 : side === 0 ? -1 : 0);
  if (!inside(nx, ny) || s.solid[at(nx, ny)] || s.background?.[at(nx, ny)]) return "solid";
  return null;
}

/** The wall a wall-mount placement backs on to: its side, the distance from
 *  its centre to that edge, its half depth along the wall's normal, the face's
 *  inset — or null when nothing stands behind it within 0.3 cells. */
export function wallBehind(s: Sector, k: { p: string; v?: number; x: number; y: number; r?: number }): { side: number; dist: number; half: number; face: number } | null {
  const def = KIT.get(k.p);
  if (!def || def.mount !== "wall") return null;
  const N = s.size;
  const cx = Math.floor(k.x), cy = Math.floor(k.y);
  if (cx < 0 || cy < 0 || cx >= N || cy >= N || s.solid[cy * N + cx]) return null;
  const fx = k.x - cx, fy = k.y - cy;
  const e = kitExtents(k);
  const sides: [number, number, number][] = [];
  if (fy < 0.3) sides.push([0, fy, e.ry]);
  if (fx > 0.7) sides.push([1, 1 - fx, e.rx]);
  if (fy > 0.7) sides.push([2, 1 - fy, e.ry]);
  if (fx < 0.3) sides.push([3, fx, e.rx]);
  // a wall prop's back is to its wall: facing south (r 0) it hangs on the
  // north wall, west (90) on the east, north (180) on the south, east (270)
  // on the west — which also settles a prop sitting exactly on a cell line
  const yaw = kitYaw(k.r ?? 0);
  const facing = yaw % 90 === 0 ? [0, 1, 2, 3][yaw / 90] : -1;
  let best: { side: number; dist: number; half: number; face: number } | null = null;
  for (const [side, dist, half] of sides) {
    if (facing >= 0 && side !== facing) continue;
    const edge = edgeAt(s, cx, cy, side);
    if (!edge) continue;
    if (!best || dist < best.dist) best = { side, dist, half, face: edge === "thin" ? WALL_FACE : 0 };
  }
  return best;
}

/** Seat every wall-mount kit prop of a built map on its wall's face. Returns
 *  how many moved. */
export function seatWallProps(s: Sector): number {
  let moved = 0;
  for (const k of s.kit ?? []) {
    const b = wallBehind(s, k);
    if (!b) continue;
    const back = b.dist - b.half;
    if (Math.abs(back - b.face) <= SEAT_TOLERANCE) continue;
    const want = b.face + b.half + SEAT_GAP;
    const cx = Math.floor(k.x), cy = Math.floor(k.y);
    if (b.side === 0) k.y = cy + want;
    else if (b.side === 2) k.y = cy + 1 - want;
    else if (b.side === 3) k.x = cx + want;
    else k.x = cx + 1 - want;
    k.x = Math.round(k.x * 1000) / 1000;
    k.y = Math.round(k.y * 1000) / 1000;
    moved++;
  }
  return moved;
}
