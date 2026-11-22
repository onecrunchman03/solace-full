// LEVEL 4 — THE ABANDONED OFFICE — its DIALECT of the room library (tiles.ts
// is the format, shared by every level built from hand-drawn rooms).
//
// The office is the Station's LATTICE (office-vocab.ts): every room is a whole
// number of 8-cell modules, filled edge to edge, with a 2-wide doorway SLOT
// in the middle of every module side it may open through. The generator packs
// the rooms, deals them into the BLINK ZONES and chooses the slots.
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with real kit props in the props layer: desks, chairs, the
// cubicle partitions you can see over, the copier, the vending machines):
//   D  THE LIFT — the way in from the Station and out again (the start room
//      only), on the wall behind it, two clear cells in front
//   S  THE STAIRWELL DOOR — the way on to Level 5, badge-locked (the goal
//      room only), on the wall behind it, a clear cell in front
//   K  THE SECURITY KEYCARD's spot (the key room only — exactly one), on
//      clear floor
//   W  a WINDOW, rain and fog behind it, on a wall
//   *  a ceiling troffer (a fixture; most of them are dead — the generator
//      rolls each one)

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { OFFICE_TYPES, MODULE, SLOT_AT, SLOT_W, OFFICE_PIT, ODECO, odecoByte, type OfficeType } from "./office-vocab";

export type OfficeSet = "any";
/** start: the Lift Lobby (the way in) · goal: the Stairwell Door · key: the
 *  Security Office (the keycard) · block: an ordinary room. */
export type OfficeRole = "start" | "goal" | "key" | "block";
export const OFFICE_SETS: readonly OfficeSet[] = ["any"];
export const OFFICE_ROLES: readonly OfficeRole[] = ["start", "goal", "key", "block"];

/** Zone letters → room type. */
export const OFFICE_ZONES: Readonly<Record<string, OfficeType>> = {
  l: "liftlobby",
  s: "security",
  t: "stairwell",
  c: "hallway",
  u: "cubicles",
  o: "openplan",
  m: "conference",
  e: "corneroffice",
  b: "kitchenette",
  p: "copyroom",
  r: "records",
  v: "serverroom",
  w: "washroom",
  n: "reception",
  y: "supply",
};

export const OFFICE_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the lift (start room only)" },
  S: { k: "stairdoor", t: 0, label: "the stairwell door to Level 5 (goal room only)" },
  K: { k: "keycard", t: 0, label: "the security keycard (key room only)" },
  W: { k: "window", t: 0, label: "a window, rain behind it" },
  "*": { k: "lamp", t: 0, label: "ceiling troffer" },
};

export const OFFICE_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DSK" },
  { name: "Walls", glyphs: "W" },
  { name: "Fixtures", glyphs: "*" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => odecoByte(ODECO.entrance, p.o),
  stairdoor: (p) => odecoByte(ODECO.stairdoor, p.o),
  keycard: () => odecoByte(ODECO.keycard, 0),
  window: (p) => odecoByte(ODECO.window, p.o),
  lamp: () => odecoByte(ODECO.lamp, 0),
};

/** Where the slots start along a room side of `len` cells. */
export function officeSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

/** The ROLE each set piece belongs to: exactly one in its own role's rooms,
 *  none anywhere else. */
const PIECE_ROLE: Record<string, OfficeRole> = { entrance: "start", stairdoor: "goal", keycard: "key" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, stairdoor: 1, keycard: 0 };
const WALL_PIECES = new Set(["entrance", "stairdoor", "window"]);

function officeLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`an office room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — an office room fills its whole rectangle (use # for solid)`);
  // doorways: only at the slots, 2 wide, on floor 0
  const ok = new Set<string>();
  for (const x of officeSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of officeSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: an office doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
  }
  if (t.sockets.length < 2 && def.role !== "start" && def.role !== "goal" && def.role !== "key") W("a room with one doorway is a dead end — give it a slot on another side if you can");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it (where you stand to use it)
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    const name = OFFICE_GLYPHS[Object.keys(OFFICE_GLYPHS).find((g) => OFFICE_GLYPHS[g].k === k)!].label;
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${name}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${name}`);
    for (const p of list) {
      if (t.hgt[I(p.x, p.y)] !== 0) E(`${name} at (${p.x},${p.y}): it stands on floor 0`);
      const back = p.o as Side;
      for (let q = 0; q <= FRONT[k]; q++) {
        const x = WALL_PIECES.has(k) ? p.x - DX[back] * q : p.x;
        const y = WALL_PIECES.has(k) ? p.y - DY[back] * q : p.y;
        const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
        if (solidOrOut) E(`${name} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear floor`);
      }
    }
  }
  // the lift is on the room's outer wall (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the lift at (${d.x},${d.y}) must stand against the room's outer wall (it goes on the map's edge)`);
  }
  if (!t.pieces.some((p) => p.k === "lamp")) W("no troffer: this room will be pitch dark (every light is a fixture — draw *)");
}

/** The office's dialect. */
export const OFFICE_DIALECT: Dialect = {
  // the generator may open any module-side slot whose edge cells are floor (Nov 2026 polish round)
  lattice: { module: MODULE, slotAt: SLOT_AT, slotW: SLOT_W },
  level: 4,
  types: OFFICE_TYPES,
  zones: OFFICE_ZONES,
  glyphs: OFFICE_GLYPHS,
  groups: OFFICE_GLYPH_GROUPS,
  sets: OFFICE_SETS,
  roles: OFFICE_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: WALL_PIECES,
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: (hh) => hh <= -OFFICE_PIT,
  lint: officeLint,
};

/** Parse an office room (see tiles.ts). */
export function parseOfficeTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, OFFICE_DIALECT, lint);
}

/** Everything wrong with an office room. */
export function lintOfficeTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, OFFICE_DIALECT);
}
