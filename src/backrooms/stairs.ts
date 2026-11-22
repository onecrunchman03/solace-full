// STAIRS THAT LOOK LIKE STAIRS (Josh, Oct 2026: "make sure the stairs work
// with this so its look clean and less wonky. also give me the ability to
// color, scale, resize and texture stairs so they look more natural in the
// environment").
//
// A stair cell has always been a half-metre RAMP: the room's Stairs layer
// marks which way is up, the floor climbs one step across the cell, and the
// game drew it as sloped floor whose corners were averaged with every
// neighbour — so the cells round a stair tilted too. Now the game draws REAL
// STEPS on every stair cell (client/src/backrooms/stairs.ts, the same builder
// for the game and the editor's preview), a stair's low edge sits exactly on
// the floor below and its high edge exactly on the floor above, and walking
// follows the step line. Nothing about who can walk where changes: a stair is
// still one step a cell (the climb rule).
//
// A room design may dress its stairs (`TileDef.stairs`): the surface its
// treads wear (any surface id, or the floor's own when absent), a colour
// (paint, or a tint over the surface), how many steps a cell is cut into,
// how much of the cell's width the flight takes (the rest is a solid cheek
// either side) and whether it has rails. The map carries the stair cells and
// their dressing as DRESSING — not in the fingerprint, swapped live.
//
// Imports only the surface catalogue, so the server, the editor and the game
// all read it.

import { findSurface } from "./surfaces";

export interface StairSpec {
  /** Surface id the treads wear (surfaces.ts, any kind). Absent: the floor's own. */
  tex?: string;
  /** "#rrggbb" — paint, or a tint over the surface. */
  col?: string;
  /** Steps a cell is cut into (each cell climbs half a metre). Default 3. */
  steps?: number;
  /** Share of the cell's width the flight takes, percent; the rest is a
   *  solid cheek either side. Default 100. */
  width?: number;
  /** Handrails along the open sides. Default false. */
  rail?: boolean;
}

export const STAIR_STEPS_DEFAULT = 3;
export const STAIR_STEPS_MIN = 1;
export const STAIR_STEPS_MAX = 8;
export const STAIR_WIDTH_MIN = 40;

/** No stair on this cell (the map's stair byte). Otherwise 0-3 = the side
 *  that is UP: N, E, S, W. */
export const STAIR_NONE = -1;

/** Everything wrong with a stair dressing, as plain sentences. */
export function stairProblems(s: StairSpec | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.tex !== undefined && (typeof s.tex !== "string" || !(["wall", "floor", "ceil"] as const).some((k) => findSurface(k, s.tex)))) out.push(`the stairs' surface "${String(s.tex)}" isn't a surface there is`);
  if (s.col !== undefined && (typeof s.col !== "string" || !/^#[0-9a-f]{6}$/i.test(s.col))) out.push(`the stairs' colour must be "#rrggbb"`);
  if (s.steps !== undefined && (!Number.isInteger(s.steps) || s.steps < STAIR_STEPS_MIN || s.steps > STAIR_STEPS_MAX)) out.push(`the stairs must have ${STAIR_STEPS_MIN}–${STAIR_STEPS_MAX} steps a cell`);
  if (s.width !== undefined && (!Number.isFinite(s.width) || s.width < STAIR_WIDTH_MIN || s.width > 100)) out.push(`the stairs' width must be ${STAIR_WIDTH_MIN}–100%`);
  if (s.rail !== undefined && typeof s.rail !== "boolean") out.push("the stairs' rails must be on or off");
  return out;
}

/** A dressing's comparable form: the same dressing always gives the same key. */
export function stairKey(s: StairSpec): string {
  const o: Record<string, unknown> = {};
  for (const k of ["tex", "col", "steps", "width", "rail"] as const) if (s[k] !== undefined) o[k] = s[k];
  return JSON.stringify(o);
}

/** Every distinct stair dressing a map uses, once — a cell carries 1 + its
 *  index (0 = the usual). */
export class StairTable {
  readonly specs: StairSpec[] = [];
  private readonly byKey = new Map<string, number>();
  /** The number for a dressing (0 for none / an empty one). */
  styleOf(s: StairSpec | undefined): number {
    if (!s) return 0;
    const k = stairKey(s);
    if (k === "{}") return 0;
    let n = this.byKey.get(k);
    if (n === undefined) {
      this.specs.push({ ...s });
      n = this.specs.length;
      this.byKey.set(k, n);
    }
    return n;
  }
}
