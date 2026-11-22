// SEATING THINGS ON A WALL'S FACE (Nov 2026 polish round). A wall here is one
// of two things, and they put the face in different places:
//
//  · a THIN WALL (a wallN/wallW flag): a 0.29-0.30 m slab centred on the cell
//    edge, so its face stands 0.15 m in from the edge;
//  · a bare SOLID block next door: drawn as a whole cell, its face ON the edge.
//
// Every level carries both (measured off the frozen maps: the station 1,391
// walled solid edges to 3,847 bare, the hotel 1,362 to 2,990, the caves 1,185
// to 5,707), so no one fixed inset is right: 0.06 buried models 9 cm in a thin
// wall, 0.16 floated them 16 cm off a bare block. The set pieces arrive with
// the welcome, before their chunk, so each is seated at the thin-wall guess
// and moved onto the real face the moment its cell has streamed in.
import type * as THREE from "three";
import { CELL } from "./world";

/** Wall side → the cell step toward that wall (0 N · 1 E · 2 S · 3 W). */
export const SIDE_STEP: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Seen from cell (x, y) looking toward `side`: how far (m) in from that
 *  edge the visible face stands — 0.15 for a thin wall, 0 for a solid block
 *  next door — or -1 when the edge is open (walk across it), or null while
 *  the chunk hasn't streamed in. */
export type WallFace = (x: number, y: number, side: number) => number | null;

/** The thin-wall guess, until the cell is known. */
export const THIN_FACE = 0.15;

interface Seat {
  o: THREE.Object3D;
  x: number;
  y: number;
  side: number;
  proud: number;
}

/** Keeps wall-mounted things on their wall's real face. */
export class WallSeats {
  private pending: Seat[] = [];
  constructor(private face: WallFace) {}

  /** Where (cells) the face is for the site at (x, y) — a cell centre or any
   *  point in the cell — on `side`, `proud` metres out from it. */
  static at(x: number, y: number, side: number, faceIn: number, proud: number): { x: number; y: number } {
    const [dx, dy] = SIDE_STEP[side] ?? [0, -1];
    const cx = Math.floor(x) + 0.5;
    const cy = Math.floor(y) + 0.5;
    const into = (CELL / 2 - faceIn - proud) / CELL;
    // keep the site's position along the wall (it need not be the centre)
    return { x: dx ? cx + dx * into : x, y: dy ? cy + dy * into : y };
  }

  /** Seat `o` (already pinned to the ground) on the wall; re-seated once known. */
  seat(o: THREE.Object3D, x: number, y: number, side: number, proud = 0.01): { x: number; y: number } {
    const p = WallSeats.at(x, y, side, THIN_FACE, proud);
    o.position.x = p.x * CELL;
    o.position.z = p.y * CELL;
    const s: Seat = { o, x, y, side, proud };
    if (!this.settle(s)) this.pending.push(s);
    return p;
  }

  /** Per frame (cheap: only what is still waiting). */
  tick(): void {
    if (!this.pending.length) return;
    this.pending = this.pending.filter((s) => s.o.parent && !this.settle(s));
  }

  clear(): void {
    this.pending = [];
  }

  private settle(s: Seat): boolean {
    const f = this.face(Math.floor(s.x), Math.floor(s.y), s.side);
    if (f === null) return false;
    const p = WallSeats.at(s.x, s.y, s.side, f < 0 ? THIN_FACE : f, s.proud);
    s.o.position.x = p.x * CELL;
    s.o.position.z = p.y * CELL;
    return true;
  }
}
