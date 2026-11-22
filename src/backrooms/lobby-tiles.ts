// LEVEL 0 — THE LOBBY — Level 0's DIALECT of the room library (tiles.ts is the
// format itself, shared by every level built from hand-drawn rooms).
//
// Josh, 2026-09-27: "All three levels now", and "Just put only one door per
// level for entering let's make it easy".
//
// Level 0 is the classic backrooms: yellow rooms packed wall to wall, drywall
// between them, no rock anywhere. So its rooms follow a LATTICE
// (lobby-vocab.ts): each is drawn as a whole number of 10-cell modules, filled
// edge to edge (no empty cells), with a 2-wide doorway SLOT at the same place
// on every module side it opens. The generator packs rooms across the map and
// decides which slots to open.
//
// Inside a room, use the WALLS layer for drywall — partitions, cubicles, a
// maze — and '#' only for solid things: pillars, a long table, a column.
// Floors can climb and fall one step at a time; a drop of two or more is a
// ledge you can fall from but not climb; nine or more is a lethal shaft.
//
// The furniture alphabet:
//   D  THE ENTRANCE — the one way in and out (the start room only): a door
//      marked on the wall behind it, with two clear cells in front.

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type Side, type LintCtx, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { LOBBY_TYPES, MODULE, SLOT_AT, SLOT_W, LOBBY_PIT, type LobbyType } from "./lobby-vocab";
import { lookProblems, surfaceOnLevel } from "./surfaces";
import { surfaceKindOf } from "./kit";

export type LobbySet = "any";
/** start: the room with The Entrance · block: an ordinary room · landmark: a
 *  named set piece (the key waits in the one farthest from THE DOOR). */
export type LobbyRole = "start" | "block" | "landmark";
export const LOBBY_SETS: readonly LobbySet[] = ["any"];
export const LOBBY_ROLES: readonly LobbyRole[] = ["start", "block", "landmark"];

/** Zone letters → room type. */
export const LOBBY_ZONES: Readonly<Record<string, LobbyType>> = {
  c: "classic",
  p: "pillars",
  o: "offices",
  w: "warrens",
  h: "halls",
  a: "atrium",
  t: "terraces",
  s: "sublevel",
  m: "manila",
  r: "restrooms",
  e: "panelled",
  g: "storage",
  k: "unlit",
};

export const LOBBY_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the entrance (start room only)" },
};

export const LOBBY_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [{ name: "Set pieces", glyphs: "D" }];

/** Where the slots start along a room side of `len` cells. */
export function slotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

function lobbyLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a Level 0 room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a Level 0 room fills its whole rectangle (use # for solid)`);
  // doorways: only at the slots, 2 wide, on floor 0
  const ok = new Set<string>();
  for (const x of slotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of slotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a Level 0 doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
  }
  if (t.sockets.length < 2 && def.role !== "start") W("a room with one doorway is a dead end — give it a slot on another side if you can");
  // the entrance
  const doors = t.pieces.filter((p) => p.k === "entrance");
  if (def.role === "start" && doors.length !== 1) E("the start room carries exactly one entrance 'D'");
  if (def.role !== "start" && doors.length) E("only the start room carries the entrance");
  for (const d of doors) {
    if (t.hgt[I(d.x, d.y)] !== 0) E(`entrance at (${d.x},${d.y}): it stands on floor 0`);
    // you arrive two cells in from the wall it's marked on
    const back = d.o as Side;
    for (let k = 1; k <= 2; k++) {
      const x = d.x - DX[back] * k;
      const y = d.y - DY[back] * k;
      if (x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1 || t.hgt[I(x, y)] !== 0) E(`entrance at (${d.x},${d.y}): the two cells in front of it must be clear floor at 0 (you arrive there)`);
    }
  }
}

/** Level 0's dialect. */
export const LOBBY_DIALECT: Dialect = {
  level: 0,
  types: LOBBY_TYPES,
  zones: LOBBY_ZONES,
  glyphs: LOBBY_GLYPHS,
  groups: LOBBY_GLYPH_GROUPS,
  sets: LOBBY_SETS,
  roles: LOBBY_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: new Set(["entrance"]),
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(),
  axisKinds: new Set(),
  maxDoorWidth: 5,
  axisOf: () => 0,
  pieceByte: () => 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: (h) => h <= -LOBBY_PIT,
  lint: lobbyLint,
};

/** Parse a Level 0 definition (see tiles.ts). */
export function parseLobbyTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, LOBBY_DIALECT, lint);
}

/** Everything wrong with a Level 0 room. */
export function lintLobbyTile(def: TileDef): Lint & { tile: Tile } {
  const out = lintAny(def, LOBBY_DIALECT);
  // Level 0 wears only the backrooms' own surfaces (surfaces.ts
  // LEVEL0_SURFACES); the shared checker has already refused unknown ones.
  for (const m of lookProblems(def.look, 0)) if (!out.errors.includes(m)) out.errors.push(m);
  // …and so does a shape's surface
  for (const pl of def.props ?? []) {
    const kind = pl.tex ? surfaceKindOf(pl.tex) : null;
    if (kind && !surfaceOnLevel(kind, pl.tex!, 0)) out.errors.push(`prop "${pl.p}" at (${pl.x},${pl.y}): its surface "${pl.tex}" belongs to another level — Level 0 wears only the backrooms' own surfaces`);
  }
  return out;
}
