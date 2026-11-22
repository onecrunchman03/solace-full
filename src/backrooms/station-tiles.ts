// LEVEL 3 — THE ELECTRICAL STATION — its DIALECT of the room library (tiles.ts
// is the format, shared by every level built from hand-drawn rooms).
//
// The station is a LATTICE like Level 0 (station-vocab.ts): every room is a
// whole number of 8-cell modules, filled edge to edge, with a 2-wide doorway
// SLOT in the middle of every module side it may open through. The generator
// packs the rooms, deals them into the six SECTIONS and chooses the slots.
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with real kit props in the props layer):
//   D  THE PRESSURE DOOR — the way in from Pipe Dreams and out again (the
//      start room only), on the wall behind it, two clear cells in front
//   X  THE LIFT SHUTTER — the way on to Level 4 (the goal room only), on the
//      wall behind it, a clear cell in front
//   B  a section's BREAKER (a breaker room only — exactly one), on a wall
//   A  an ARCING PANEL, on a wall: it crackles, then arcs, while its section
//      has power. Stand back from it.
//   w  ELECTRIFIED WATER on the floor: live while its section has power
//   *  a ceiling lamp (a fixture model; lit while its section has power)
//
// Each section's CUTOFF is placed by the generator (in the section's room
// nearest the way in), so a room design never needs to draw one.

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { STATION_TYPES, MODULE, SLOT_AT, SLOT_W, STATION_PIT, SDECO, sdecoByte, type StationType } from "./station-vocab";

export type StationSet = "any";
/** start: the arrival hall (The Pressure Door) · goal: the lift hall (the
 *  shutter to Level 4) · breaker: a section's breaker room · block: an
 *  ordinary room. */
export type StationRole = "start" | "goal" | "breaker" | "block";
export const STATION_SETS: readonly StationSet[] = ["any"];
export const STATION_ROLES: readonly StationRole[] = ["start", "goal", "breaker", "block"];

/** Zone letters → room type. */
export const STATION_ZONES: Readonly<Record<string, StationType>> = {
  i: "intake",
  l: "lifthall",
  s: "switchroom",
  v: "serviceway",
  c: "cablevault",
  k: "controldesk",
  b: "batteryroom",
  x: "xfmrbay",
  u: "substation",
  o: "workshop",
  f: "floodroom",
};

export const STATION_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the pressure door (start room only)" },
  X: { k: "shutter", t: 0, label: "the lift shutter to Level 4 (goal room only)" },
  B: { k: "breaker", t: 0, label: "the section's breaker (breaker room only)" },
  A: { k: "arc", t: 0, label: "arcing panel (a hazard)" },
  w: { k: "puddle", t: 0, label: "electrified water" },
  "*": { k: "lamp", t: 0, label: "ceiling lamp" },
};

export const STATION_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DXB" },
  { name: "Hazards", glyphs: "Aw" },
  { name: "Fixtures", glyphs: "*" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => sdecoByte(SDECO.entrance, p.o),
  shutter: (p) => sdecoByte(SDECO.shutter, p.o),
  breaker: (p) => sdecoByte(SDECO.breaker, p.o),
  arc: (p) => sdecoByte(SDECO.arc, p.o),
  puddle: () => sdecoByte(SDECO.puddle, 0),
  lamp: () => sdecoByte(SDECO.lamp, 0),
};

/** Where the slots start along a room side of `len` cells. */
export function stationSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

/** The ROLE each set piece belongs to: exactly one in its own role's rooms,
 *  none anywhere else. */
const PIECE_ROLE: Record<string, StationRole> = { entrance: "start", shutter: "goal", breaker: "breaker" };

function stationLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a station room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a station room fills its whole rectangle (use # for solid)`);
  // doorways: only at the slots, 2 wide, on floor 0, and DRY — a live puddle
  // in a doorway would make the doorway itself the hazard
  const ok = new Set<string>();
  for (const x of stationSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of stationSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a station doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
    for (let q = 0; q < s.w; q++) {
      const x = s.side === 0 || s.side === 2 ? s.x + q : s.x;
      const y = s.side === 1 || s.side === 3 ? s.y + q : s.y;
      if (c.pieceAt.get(I(x, y))?.k === "puddle") E(`${tag}: the doorway stands in water — keep doorways dry`);
    }
  }
  if (t.sockets.length < 2 && def.role !== "start" && def.role !== "goal") W("a room with one doorway is a dead end — give it a slot on another side if you can");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it (where you stand to use it)
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    const name = STATION_GLYPHS[Object.keys(STATION_GLYPHS).find((g) => STATION_GLYPHS[g].k === k)!].label;
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${name}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${name}`);
    const front = k === "entrance" ? 2 : 1;
    for (const p of list) {
      if (t.hgt[I(p.x, p.y)] !== 0) E(`${name} at (${p.x},${p.y}): it stands on floor 0`);
      const back = p.o as Side;
      for (let q = 0; q <= front; q++) {
        const x = p.x - DX[back] * q;
        const y = p.y - DY[back] * q;
        const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
        const wet = c.pieceAt.get(I(x, y))?.k === "puddle";
        if (solidOrOut || wet) E(`${name} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear, dry floor`);
      }
    }
  }
  // the start room's door is on its outer wall (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the pressure door at (${d.x},${d.y}) must stand against the room's outer wall (it goes on the map's edge)`);
  }
  if (!t.pieces.some((p) => p.k === "lamp")) W("no lamp: this room will be dark even with its section powered (every light is a fixture — draw *)");
}

/** The station's dialect. */
export const STATION_DIALECT: Dialect = {
  // the generator may open any module-side slot whose edge cells are floor (Nov 2026 polish round)
  lattice: { module: MODULE, slotAt: SLOT_AT, slotW: SLOT_W },
  level: 3,
  types: STATION_TYPES,
  zones: STATION_ZONES,
  glyphs: STATION_GLYPHS,
  groups: STATION_GLYPH_GROUPS,
  sets: STATION_SETS,
  roles: STATION_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: new Set(["entrance", "shutter", "breaker", "arc"]),
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: (hh) => hh <= -STATION_PIT,
  lint: stationLint,
};

/** Parse a station room (see tiles.ts). */
export function parseStationTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, STATION_DIALECT, lint);
}

/** Everything wrong with a station room. */
export function lintStationTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, STATION_DIALECT);
}
