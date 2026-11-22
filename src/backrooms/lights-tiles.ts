// LEVEL 6 — LIGHTS OUT — its DIALECT of the room library (tiles.ts is the
// format, shared by every level built from hand-drawn rooms).
//
// Lights Out is the office's LATTICE (lights-vocab.ts): every room is a whole
// number of 8-cell modules, filled edge to edge, with a 2-wide doorway SLOT in
// the middle of every module side it may open through. A room belongs to the
// dark CORRIDORS (set "dark") or THE WET END (set "wet"); the generator lays
// the Wet End across the far side of the map.
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with real kit props in the props layer):
//   D  THE STAIR — the way in from the hotel (the start room only), on the
//      wall behind it, two clear cells in front
//   H  THE SEA HATCH — the way on to Level 7 (the goal room only), on the
//      wall behind it, a clear cell in front
//   K  a HANDWHEEL spot (dry rooms; the plan picks one per map), on clear floor
//   B  a BATTERY spot (dry rooms), on clear floor
//   *  a dead caged bulkhead on the ceiling
//   =  a dead fluorescent batten on the ceiling

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { LIGHTS_TYPES, MODULE, SLOT_AT, SLOT_W, LDECO, ldecoByte, WET_TYPES, type LightsType } from "./lights-vocab";

export type LightsSet = "dark" | "wet";
/** start: the Stair · goal: the Sea Hatch · block: an ordinary room. */
export type LightsRole = "start" | "goal" | "block";
export const LIGHTS_SETS: readonly LightsSet[] = ["dark", "wet"];
export const LIGHTS_ROLES: readonly LightsRole[] = ["start", "goal", "block"];

/** Zone letters → room type. */
export const LIGHTS_ZONES: Readonly<Record<string, LightsType>> = {
  a: "stairfoot",
  c: "darkhall",
  r: "darkroom",
  s: "storeroom",
  p: "piperun",
  m: "cellblock",
  u: "rubble",
  o: "deadoffice",
  w: "wetway",
  t: "cistern",
  h: "seahatch",
};

export const LIGHTS_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the stair (start room only)" },
  H: { k: "seahatch", t: 0, label: "the sea hatch to Level 7 (goal room only)" },
  K: { k: "wheel", t: 0, label: "a Handwheel spot" },
  B: { k: "battery", t: 0, label: "a battery spot" },
  "*": { k: "lamp", t: 0, label: "a dead caged bulkhead" },
  "=": { k: "batten", t: 0, label: "a dead fluorescent batten" },
};

export const LIGHTS_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DH" },
  { name: "Things to find", glyphs: "KB" },
  { name: "Dead fixtures", glyphs: "*=" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => ldecoByte(LDECO.entrance, p.o),
  seahatch: (p) => ldecoByte(LDECO.seahatch, p.o),
  wheel: () => ldecoByte(LDECO.wheel, 0),
  battery: () => ldecoByte(LDECO.battery, 0),
  lamp: () => ldecoByte(LDECO.lamp, 0),
  batten: () => ldecoByte(LDECO.lamp, 1),
};

/** Where the slots start along a room side of `len` cells. */
export function lightsSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

/** The ROLE each set piece belongs to: exactly one in its own role's rooms,
 *  none anywhere else. */
const PIECE_ROLE: Record<string, LightsRole> = { entrance: "start", seahatch: "goal" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, seahatch: 1, wheel: 0, battery: 0 };
const WALL_PIECES = new Set(["entrance", "seahatch"]);
/** Pieces that must stand on dry floor. */
const DRY_ONLY: readonly string[] = ["wheel", "battery"];

function lightsLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a Lights Out room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a Lights Out room fills its whole rectangle (use # for solid)`);
  const sets = Array.isArray(def.set) ? def.set : [def.set];
  if (sets.length !== 1 || !LIGHTS_SETS.includes(sets[0] as LightsSet)) E(`a Lights Out room is in the dark corridors ("dark") or the Wet End ("wet") — exactly one`);
  const wet = sets[0] === "wet";
  if (def.role === "start" && wet) E("the stair is in the dark corridors, not the Wet End");
  if (def.role === "goal" && !wet) E("the sea hatch is in the Wet End");
  if (WET_TYPES.includes(def.type as LightsType) !== wet) E(wet ? `a Wet End room is a flooded type (${WET_TYPES.join(", ")})` : `a flooded type (${def.type}) belongs in the Wet End`);
  // doorways: only at the slots, 2 wide, on floor 0
  const ok = new Set<string>();
  for (const x of lightsSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of lightsSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a Lights Out doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
  }
  if (t.sockets.length < 2 && !["start", "goal"].includes(def.role)) W("a room with one doorway is a dead end — fine down here, but give it a second slot if you can");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it (where you stand to use it)
  const nameOf = (k: string): string => LIGHTS_GLYPHS[Object.keys(LIGHTS_GLYPHS).find((g) => LIGHTS_GLYPHS[g].k === k)!].label;
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${nameOf(k)}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${nameOf(k)}`);
  }
  for (const p of t.pieces) {
    const k = p.k;
    if (DRY_ONLY.includes(k) && wet) E(`${nameOf(k)} at (${p.x},${p.y}): only in a dry room (not the Wet End)`);
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
  // the stair is on the room's outer wall (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the stair at (${d.x},${d.y}) must stand against the room's outer wall (it goes on the map's edge)`);
  }
  if (!t.pieces.some((p) => p.k === "lamp" || p.k === "batten")) W("no fixtures on the ceiling: even a dead level hangs its dead lamps (draw * or =)");
}

/** Lights Out's dialect. */
export const LIGHTS_DIALECT: Dialect = {
  // the generator may open any module-side slot whose edge cells are floor (Nov 2026 polish round)
  lattice: { module: MODULE, slotAt: SLOT_AT, slotW: SLOT_W, openRoles: ["block"], pieceOk: ["lamp", "batten"] }, // only plain blocks get a slot opened; never through a set piece
  level: 6,
  types: LIGHTS_TYPES,
  zones: LIGHTS_ZONES,
  glyphs: LIGHTS_GLYPHS,
  groups: LIGHTS_GLYPH_GROUPS,
  sets: LIGHTS_SETS,
  roles: LIGHTS_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: WALL_PIECES,
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp", "batten"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: () => false,
  lint: lightsLint,
};

/** Parse a Lights Out room (see tiles.ts). */
export function parseLightsTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, LIGHTS_DIALECT, lint);
}

/** Everything wrong with a Lights Out room. */
export function lintLightsTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, LIGHTS_DIALECT);
}
