// LEVEL 5 — TERROR HOTEL — its DIALECT of the room library (tiles.ts is the
// format, shared by every level built from hand-drawn rooms).
//
// The hotel is the office's LATTICE (hotel-vocab.ts): every room is a whole
// number of 8-cell modules, filled edge to edge, with a 2-wide doorway SLOT in
// the middle of every module side it may open through. A room belongs to the
// MAIN HALL (set "hall") or the BOILER ROOM (set "boiler"); the generator lays
// the Boiler Room across the far side of the map and lets exactly one room —
// the Boiler Room's door — open between the two.
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with real kit props in the props layer):
//   D  THE SERVICE STAIR — the way in from the office (the start room only),
//      on the wall behind it, two clear cells in front
//   S  THE RUSTY DOOR — the way on to Level 6 (the goal room only), on the
//      wall behind it, a clear cell in front
//   K  a BOILER KEY spot (exactly one in every suite; the register names the
//      suite whose key is real), on clear floor
//   R  THE GUEST REGISTER on the Mahjong table (the hub only — exactly one)
//   L  a LIFT door, on the wall behind it, a clear cell in front (lift halls)
//   *  a ceiling fixture (a chandelier upstairs, a caged bulb below)
//   o  a wall sconce, on the wall behind it
//   F  a FURNACE (Boiler Room only), its back to a wall, a clear cell in
//      front of its mouth
//   N  a MOTH NEST (dark rooms: linen rooms, coal stores, some suites)

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { HOTEL_TYPES, MODULE, SLOT_AT, SLOT_W, HDECO, hdecoByte, type HotelType } from "./hotel-vocab";

export type HotelSet = "hall" | "boiler";
/** start: the Service Stair · goal: the Rusty Door · hub: the Beverly Room
 *  (the register) · suite: a hotel room with a key spot · gate: the Boiler
 *  Room's door · block: an ordinary room. */
export type HotelRole = "start" | "goal" | "hub" | "suite" | "gate" | "block";
export const HOTEL_SETS: readonly HotelSet[] = ["hall", "boiler"];
export const HOTEL_ROLES: readonly HotelRole[] = ["start", "goal", "hub", "suite", "gate", "block"];

/** Zone letters → room type. */
export const HOTEL_ZONES: Readonly<Record<string, HotelType>> = {
  a: "landing",
  c: "corridor",
  g: "lounge",
  s: "suite",
  l: "lifthall",
  b: "beverly",
  n: "linen",
  d: "dining",
  y: "library",
  x: "boilergate",
  f: "boiler",
  p: "pipeway",
  k: "coalstore",
  r: "rustydoor",
};

export const HOTEL_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the service stair (start room only)" },
  S: { k: "rustydoor", t: 0, label: "the rusty door to Level 6 (goal room only)" },
  K: { k: "key", t: 0, label: "a Boiler Key spot (one in every suite)" },
  R: { k: "register", t: 0, label: "the guest register (the Beverly Room only)" },
  L: { k: "lift", t: 0, label: "a lift door" },
  "*": { k: "lamp", t: 0, label: "ceiling fixture (chandelier / caged bulb)" },
  o: { k: "sconce", t: 0, label: "wall sconce" },
  F: { k: "furnace", t: 0, label: "a furnace (Boiler Room only)" },
  N: { k: "nest", t: 0, label: "a moth nest" },
};

export const HOTEL_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DSKRL" },
  { name: "Boiler Room", glyphs: "F" },
  { name: "Moths", glyphs: "N" },
  { name: "Fixtures", glyphs: "*o" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => hdecoByte(HDECO.entrance, p.o),
  rustydoor: (p) => hdecoByte(HDECO.rustydoor, p.o),
  key: () => hdecoByte(HDECO.key, 0),
  register: () => hdecoByte(HDECO.register, 0),
  lift: (p) => hdecoByte(HDECO.lift, p.o),
  lamp: () => hdecoByte(HDECO.lamp, 0),
  sconce: (p) => hdecoByte(HDECO.sconce, p.o & 3),
  furnace: (p) => hdecoByte(HDECO.furnace, p.o & 3),
  nest: () => hdecoByte(HDECO.nest, 0),
};

/** Where the slots start along a room side of `len` cells. */
export function hotelSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

/** The ROLE each set piece belongs to: exactly one in its own role's rooms,
 *  none anywhere else. */
const PIECE_ROLE: Record<string, HotelRole> = { entrance: "start", rustydoor: "goal", register: "hub", key: "suite" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, rustydoor: 1, key: 0, register: 0, lift: 1, furnace: 1 };
const WALL_PIECES = new Set(["entrance", "rustydoor", "lift", "sconce", "furnace"]);
const BOILER_ONLY: readonly string[] = ["furnace"];

function hotelLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a hotel room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a hotel room fills its whole rectangle (use # for solid)`);
  const sets = Array.isArray(def.set) ? def.set : [def.set];
  if (sets.length !== 1 || !HOTEL_SETS.includes(sets[0] as HotelSet)) E(`a hotel room is in the Main Hall ("hall") or the Boiler Room ("boiler") — exactly one`);
  const boiler = sets[0] === "boiler";
  if (def.role === "start" || def.role === "hub" || def.role === "suite") if (boiler) E(`a ${def.role} room is in the Main Hall`);
  if (def.role === "goal" || def.role === "gate") if (!boiler) E(`a ${def.role} room is in the Boiler Room`);
  // doorways: only at the slots, 2 wide, on floor 0
  const ok = new Set<string>();
  for (const x of hotelSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of hotelSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a hotel doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
  }
  // a suite has ONE door (its numbered door on the corridor), so finding the
  // register's number means finding THAT door
  if (def.role === "suite" && t.sockets.length !== 1) E(`a suite has exactly one doorway (its numbered door): this one has ${t.sockets.length}`);
  if (t.sockets.length < 2 && !["start", "goal", "suite", "gate"].includes(def.role)) W("a room with one doorway is a dead end — give it a slot on another side if you can");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it (where you stand to use it)
  const nameOf = (k: string): string => HOTEL_GLYPHS[Object.keys(HOTEL_GLYPHS).find((g) => HOTEL_GLYPHS[g].k === k)!].label;
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${nameOf(k)}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${nameOf(k)}`);
  }
  for (const p of t.pieces) {
    const k = p.k;
    if (BOILER_ONLY.includes(k) && !boiler) E(`${nameOf(k)} at (${p.x},${p.y}): only below stairs (a Boiler Room room)`);
    if (k === "lift" && def.type !== "lifthall") E(`a lift door at (${p.x},${p.y}): lifts stand in lift halls`);
    if (FRONT[k] === undefined) continue;
    if (t.hgt[I(p.x, p.y)] !== 0) E(`${nameOf(k)} at (${p.x},${p.y}): it stands on floor 0`);
    const back = p.o as Side;
    for (let q = 0; q <= FRONT[k]; q++) {
      const x = WALL_PIECES.has(k) ? p.x - DX[back] * q : p.x;
      const y = WALL_PIECES.has(k) ? p.y - DY[back] * q : p.y;
      const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
      if (solidOrOut) E(`${nameOf(k)} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear floor`);
    }
  }
  // the service stair is on the room's outer wall (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the service stair at (${d.x},${d.y}) must stand against the room's outer wall (it goes on the map's edge)`);
  }
  if (!t.pieces.some((p) => p.k === "lamp" || p.k === "sconce" || p.k === "furnace")) W("no light: this room will be pitch dark (every light is a fixture — draw * or o)");
}

/** The hotel's dialect. */
export const HOTEL_DIALECT: Dialect = {
  // the generator may open any module-side slot whose edge cells are floor (Nov 2026 polish round)
  lattice: { module: MODULE, slotAt: SLOT_AT, slotW: SLOT_W, closedRoles: ["suite"], pieceOk: ["lamp"] }, // a suite keeps its one door; never through a set piece on the rim
  level: 5,
  types: HOTEL_TYPES,
  zones: HOTEL_ZONES,
  glyphs: HOTEL_GLYPHS,
  groups: HOTEL_GLYPH_GROUPS,
  sets: HOTEL_SETS,
  roles: HOTEL_ROLES,
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
  skipCell: () => false,
  lint: hotelLint,
};

/** Parse a hotel room (see tiles.ts). */
export function parseHotelTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, HOTEL_DIALECT, lint);
}

/** Everything wrong with a hotel room. */
export function lintHotelTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, HOTEL_DIALECT);
}
