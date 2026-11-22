// LEVEL 8 — THE CAVE SYSTEM — its DIALECT of the room library (tiles.ts is
// the format, shared by every level built from hand-drawn rooms).
//
// The Cave System is Lights Out's LATTICE (cave-vocab.ts): every room is a
// whole number of 8-cell modules, filled edge to edge, with a 2-wide doorway
// SLOT in the middle of every module side it may open through. A room belongs
// to THE STATION (set "station"), THE CAVERNS ("caverns") or THE DEEP
// ("deep"); the generator lays them in bands out from the way in.
//
// HEIGHTS are what make it a cave. Every doorway stands on floor 0; inside a
// room the floor may climb and fall. A step of one (0.5m) is a slope; a drop
// of two or more is a ledge you can go off but not back up — so a ledge must
// always have a way round. A drop of CAVE_PIT (4.5m) or more is a fall that
// kills: the chasms. (The climb rule, worldgen.ts.)
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with real kit props in the props layer):
//   D  THE SUBWAY STAIR — the way in from Level 7 (the start room only), on
//      the wall behind it, two clear cells in front
//   C  THE CHIMNEY — the way on to Level 9 (the goal room only), on the wall
//      the shaft is in, a clear cell in front
//   R  a CLIMBING ROPE spot (the Caverns only; the plan picks one per map)
//   *  a survey work lamp, lit (a caged bulkhead)
//   =  a station tunnel batten, dead
//   ~  a platform lamp, flickering

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { CAVE_TYPES, MODULE, SLOT_AT, SLOT_W, CDECO, cdecoByte, CAVE_WET_TYPES, BURROW_TYPES, CRAWL_TYPES, CAVE_PIT, type CaveType } from "./cave-vocab";

export type CaveSet = "station" | "caverns" | "deep";
/** start: the Subway Stair · goal: the Chimney · block: an ordinary room. */
export type CaveRole = "start" | "goal" | "block";
export const CAVE_SETS: readonly CaveSet[] = ["station", "caverns", "deep"];
export const CAVE_ROLES: readonly CaveRole[] = ["start", "goal", "block"];

/** Which zone each room type belongs in. */
export const CAVE_TYPE_SETS: Readonly<Record<CaveType, readonly CaveSet[]>> = {
  subwaystair: ["station"],
  platform: ["station"],
  trackbed: ["station"],
  concourse: ["station"],
  breach: ["station", "caverns"],
  cavern: ["caverns"],
  gallery: ["caverns"],
  caveriver: ["caverns"],
  chasm: ["caverns", "deep"],
  grotto: ["deep"],
  passage: ["deep"],
  crawl: ["deep"],
  chimney: ["deep"],
};

/** Zone letters → room type. */
export const CAVE_ZONES: Readonly<Record<string, CaveType>> = {
  a: "subwaystair",
  p: "platform",
  t: "trackbed",
  h: "concourse",
  b: "breach",
  c: "cavern",
  g: "gallery",
  r: "caveriver",
  x: "chasm",
  o: "grotto",
  s: "passage",
  k: "crawl",
  m: "chimney",
};

export const CAVE_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the subway stair (start room only)" },
  C: { k: "chimney", t: 0, label: "the chimney to Level 9 (goal room only)" },
  R: { k: "rope", t: 0, label: "a Climbing Rope spot" },
  "*": { k: "lamp", t: 0, label: "a survey work lamp (lit)" },
  "=": { k: "batten", t: 0, label: "a dead tunnel batten" },
  "~": { k: "flicker", t: 0, label: "a flickering platform lamp" },
};

export const CAVE_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DC" },
  { name: "Things to find", glyphs: "R" },
  { name: "Lights", glyphs: "*=~" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => cdecoByte(CDECO.entrance, p.o),
  chimney: (p) => cdecoByte(CDECO.chimney, p.o),
  rope: () => cdecoByte(CDECO.rope, 0),
  lamp: () => cdecoByte(CDECO.lamp, 0),
  batten: () => cdecoByte(CDECO.lamp, 1),
  flicker: () => cdecoByte(CDECO.lamp, 2),
};

/** Where the slots start along a room side of `len` cells. */
export function caveSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

const PIECE_ROLE: Record<string, CaveRole> = { entrance: "start", chimney: "goal" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, chimney: 1, rope: 0 };
const WALL_PIECES = new Set(["entrance", "chimney"]);
const LIGHTS = new Set(["lamp", "batten", "flicker"]);

function caveLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a Cave System room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a Cave System room fills its whole rectangle (use # for rock)`);
  const sets = Array.isArray(def.set) ? def.set : [def.set];
  if (sets.length !== 1 || !CAVE_SETS.includes(sets[0] as CaveSet)) E(`a Cave System room is in the Station ("station"), the Caverns ("caverns") or the Deep ("deep") — exactly one`);
  const set = sets[0] as CaveSet;
  const type = def.type as CaveType;
  const okSets = CAVE_TYPE_SETS[type];
  if (okSets && !okSets.includes(set)) E(`a ${type} room belongs in ${okSets.map((s) => `the ${s}`).join(" or ")}, not the ${set}`);
  if (def.role === "start" && set !== "station") E("the subway stair is in the Station");
  if (def.role === "goal" && set !== "deep") E("the chimney is at the far end of the Deep");
  // the open floor's types: a crawl room is ALL crawlspace (the ceiling is
  // the room's), the Burrower's rooms only in the Deep
  for (let i = 0; i < w * h; i++) {
    if (t.cell[i] !== 1) continue;
    const zt = t.dia.types[t.zone[i]] as CaveType;
    if (BURROW_TYPES.includes(zt) && set !== "deep") {
      E(`(${i % w},${(i / w) | 0}) is ${zt} floor: the Burrower's passages and crawlspaces are in the Deep only`);
      break;
    }
  }
  if (CRAWL_TYPES.includes(type)) {
    for (let i = 0; i < w * h; i++) if (t.cell[i] === 1 && t.hgt[i] !== 0) {
      E(`(${i % w},${(i / w) | 0}): a crawlspace is flat (floor 0) — its ceiling is barely over you as it is`);
      break;
    }
  }
  // doorways: only at the slots, 2 wide, on floor 0
  const ok = new Set<string>();
  for (const x of caveSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of caveSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a Cave System doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
  }
  if (t.sockets.length < 2 && !["start", "goal"].includes(def.role)) W("a room with one doorway is a dead end — give it a second slot if you can");
  // the chasm: a drop that kills
  const deadly = (i: number): boolean => t.hgt[i] <= -CAVE_PIT;
  let pits = 0;
  for (let i = 0; i < w * h; i++) if (t.cell[i] === 1 && deadly(i)) pits++;
  if (type === "chasm" && !pits) E("a chasm room has a drop that kills: draw its floor at least " + CAVE_PIT + " steps down (height 'i' or lower)");
  if (pits && type !== "chasm" && type !== "gallery") E(`only a chasm or a gallery has a drop that kills (${pits} cells here)`);
  if (pits && set === "station") E("the Station has no killing drops — it's a subway, not a cave");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it
  const nameOf = (k: string): string => CAVE_GLYPHS[Object.keys(CAVE_GLYPHS).find((g) => CAVE_GLYPHS[g].k === k)!].label;
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${nameOf(k)}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${nameOf(k)}`);
  }
  const wet = (i: number): boolean => CAVE_WET_TYPES.includes(t.dia.types[t.zone[i]] as CaveType);
  for (const p of t.pieces) {
    const k = p.k;
    if (k === "rope") {
      if (set !== "caverns") E(`${nameOf(k)} at (${p.x},${p.y}): the rope lies in the Caverns`);
      if (wet(I(p.x, p.y))) E(`${nameOf(k)} at (${p.x},${p.y}): on dry floor, not in the water`);
      if (deadly(I(p.x, p.y))) E(`${nameOf(k)} at (${p.x},${p.y}): not at the bottom of a drop that kills`);
    }
    if (FRONT[k] === undefined) continue;
    if (WALL_PIECES.has(k) && t.hgt[I(p.x, p.y)] !== 0) E(`${nameOf(k)} at (${p.x},${p.y}): it stands on floor 0`);
    const back = p.o as Side;
    for (let q = 0; q <= FRONT[k]; q++) {
      const x = WALL_PIECES.has(k) ? p.x - DX[back] * q : p.x;
      const y = WALL_PIECES.has(k) ? p.y - DY[back] * q : p.y;
      const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
      if (solidOrOut) E(`${nameOf(k)} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear floor`);
    }
  }
  // the stair is on the room's outer wall (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the subway stair at (${d.x},${d.y}) must stand against the room's outer wall (it goes on the map's edge)`);
  }
  if (set !== "deep" && !t.pieces.some((p) => LIGHTS.has(p.k))) W("no lights: the Station keeps its dead fixtures and the survey team left lamps in the Caverns (draw *, = or ~)");
  if (set === "deep" && t.pieces.some((p) => p.k === "lamp") && BURROW_TYPES.includes(type)) W("a lit lamp in the Burrower's passages: nobody got far enough in to hang one");
}

/** The Cave System's dialect. */
export const CAVE_DIALECT: Dialect = {
  // the generator may open any module-side slot whose edge cells are floor (Nov 2026 polish round)
  lattice: { module: MODULE, slotAt: SLOT_AT, slotW: SLOT_W, openRoles: ["block"], pieceOk: ["lamp", "batten", "flicker"] }, // only plain blocks get a slot opened; never through a set piece
  level: 8,
  types: CAVE_TYPES,
  zones: CAVE_ZONES,
  glyphs: CAVE_GLYPHS,
  groups: CAVE_GLYPH_GROUPS,
  sets: CAVE_SETS,
  roles: CAVE_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: WALL_PIECES,
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp", "batten", "flicker"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: (hh) => hh <= -CAVE_PIT,
  lint: caveLint,
};

/** Parse a Cave System room (see tiles.ts). */
export function parseCaveTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, CAVE_DIALECT, lint);
}

/** Everything wrong with a Cave System room. */
export function lintCaveTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, CAVE_DIALECT);
}
