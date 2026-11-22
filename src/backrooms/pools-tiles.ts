// THE POOLROOMS — Level 1's DIALECT of the room library (tiles.ts is the
// format itself, shared by every level built from hand-drawn rooms).
//
// P6 (Josh, 2026-09-29, from his references: "completely from scratch
// redesign the pools map"): a flooded bathhouse — halls, arcades, lap lanes,
// cisterns and tiled passages, in three zones outward from The Landing (a
// room's `set`: baths · arcades · deep · any). No rivers: every doorway is
// dry floor, and each room's water is its own.
//
// WATER IS DRAWN AS DEPTH. There is no water layer: the water table is one
// surface (pools-vocab.ts), so any floor drawn below it is wet — 'b' (-2) is
// ankle deep, 'c' waist, 'd' and below you swim, 'f' (-6) is the river bed.
// The climb rule reads the WATERLINE wherever a floor is under it, so a
// swimmer can climb out onto any quay a step above the surface.
//
// ROOMS ARE MASONRY. A pool hall's walls are drawn as '#' cells, not left to
// the thin walls between rooms: the arches, portholes and benches the client
// hangs on them need real stone behind them (decorules.ts), and two halls side
// by side read as a thick tiled wall with a deep doorway through it.
//
// The furniture alphabet:
//   O  round pillar, drawn as a 2×2 block      Q  spiral-stair core, 2×2
//   A  arch (in a one-cell opening, or a row)  P  portal ring (3-wide gap)
//   B  bridge deck (floor 1 or more, over water) o  porthole on a wall
//   b  bench in a wall cubby                   H  pool ladder (out of the water)
//   *  skylight                                D  an exit door (door tiles only)
//   W  a tall window with daylight behind it (on a wall)

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type Side, type LintCtx, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { lookProblems, surfaceOnLevel } from "./surfaces";
import { surfaceKindOf } from "./kit";
import { DECO, decoByte, POOL_TYPES, RIVER_PROFILE, type PoolType, effFloor, wetFloor, WATER_TABLE, GATOR_MIN_DEPTH } from "./pools-vocab";

/** Which zone a room is drawn for (pools-vocab ZONE_RADII); `any` stands
 *  anywhere (passages, small rooms). */
export type PoolSet = "baths" | "arcades" | "deep" | "any";
/** door carries the exit (The Landing); hall, corridor, room and cap grow
 *  from it. */
export type PoolRole = "door" | "hall" | "corridor" | "room" | "cap";
export const POOL_SETS: readonly PoolSet[] = ["baths", "arcades", "deep", "any"];
export const POOL_ROLES: readonly PoolRole[] = ["door", "hall", "corridor", "room", "cap"];
/** The river roles (P4/P5). No room carries a river now; kept so an old
 *  library reads as broken by name rather than by crash. */
export const SPINE_ROLES: ReadonlySet<string> = new Set(["river", "confluence", "source"]);

/** Zone letters → room type. */
export const POOL_ZONES: Readonly<Record<string, PoolType>> = {
  r: "river",
  n: "natatorium",
  v: "vaultsea",
  p: "portalhall",
  t: "tunnels",
  s: "shallows",
  o: "rotunda",
  b: "baths",
};

/** The furniture layer's alphabet. */
export const POOL_GLYPHS: Readonly<Record<string, Glyph>> = {
  O: { k: "pillar", t: "pillar", label: "round pillar 2×2" },
  Q: { k: "spiralcore", t: "spiralcore", label: "spiral stair core 2×2" },
  A: { k: "arch", t: 0, label: "arch" },
  P: { k: "portal", t: 0, label: "portal ring" },
  B: { k: "bridge", t: 0, label: "bridge deck" },
  o: { k: "porthole", t: 0, label: "porthole" },
  b: { k: "cubby", t: 0, label: "bench cubby" },
  H: { k: "ladder", t: 0, label: "pool ladder" },
  "*": { k: "skylight", t: 0, label: "skylight" },
  W: { k: "window", t: 0, label: "tall window (daylight)" },
  D: { k: "door", t: 0, label: "exit door" },
};

export const POOL_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Masonry", glyphs: "OQAP" },
  { name: "Water", glyphs: "BH" },
  { name: "On a wall", glyphs: "obW" },
  { name: "Ceiling", glyphs: "*" },
  { name: "Set pieces", glyphs: "D" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  pillar: () => decoByte(DECO.pillar),
  spiralcore: () => decoByte(DECO.spiralcore),
  arch: (p) => decoByte(DECO.arch, p.o),
  portal: (p) => decoByte(DECO.portal, p.o),
  bridge: (p) => decoByte(DECO.bridge, p.o),
  porthole: (p) => decoByte(DECO.porthole, p.o),
  cubby: (p) => decoByte(DECO.cubby, p.o),
  ladder: (p) => decoByte(DECO.ladder, p.o),
  skylight: () => decoByte(DECO.skylight),
  window: (p) => decoByte(DECO.window, p.o),
};

const sameProfile = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
/** Is this socket a river mouth (the river's cross-section)? */
export const isRiverSocket = (prof: readonly number[]): boolean => sameProfile(prof, RIVER_PROFILE);

function poolsLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I, walkEdge, pieceAt, count } = c;
  const { w, h } = t;
  // doorways: dry floor at the datum, one height across — every room's water
  // is its own (P6: no rivers)
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.prof.some(wetFloor)) E(`${tag}: a doorway stands on dry floor — keep the water inside the room`);
    else if (new Set(s.prof).size > 1 || s.z !== 0) E(`${tag}: a doorway stands on floor 0, one height across`);
  }
  if (SPINE_ROLES.has(def.role)) E(`the Poolrooms have no rivers now — "${def.role}" isn't a room role (use hall, corridor, room or cap)`);
  if ((def.role === "hall" || def.role === "corridor") && t.sockets.length < 2) E(`a ${def.role} tile needs at least two doors — it is part of a route`);
  // drops, read at the waterline
  const bridge = (i: number): boolean => pieceAt.get(i)?.k === "bridge";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = I(x, y);
      if (t.cell[i] !== 1) continue;
      for (const s of [1, 2] as Side[]) {
        if (!walkEdge(x, y, s)) continue;
        const j = I(x + DX[s], y + DY[s]);
        if (t.cell[j] !== 1) continue;
        const a = effFloor(t.hgt[i]);
        const b = effFloor(t.hgt[j]);
        const d = Math.abs(a - b);
        if (d < 2) continue;
        const hi = a > b ? i : j;
        if (d <= 3 && !bridge(hi)) E(`(${x},${y})→(${x + DX[s]},${y + DY[s]}): a ${d}-step lip — too high to climb, too low to read as a ledge (make it one step, or 4 and more)`);
        if (d >= 11) E(`(${x},${y}): a ${d}-step drop would kill`);
        else if (d > 6 && !wetFloor(t.hgt[a > b ? j : i])) W(`(${x},${y}): a ${d}-step drop onto dry floor hurts`);
      }
    }
  }
  // pieces
  for (const p of t.pieces) {
    const i = I(p.x, p.y);
    if (p.k === "bridge" && t.hgt[i] < 1) E(`bridge deck at (${p.x},${p.y}): a deck stands above the water — floor 1 or more`);
    if (p.k === "ladder" && !wetFloor(t.hgt[i])) E(`ladder at (${p.x},${p.y}): a pool ladder stands in the water`);
  }
  // an alligator's spawner stands in water deep enough to swim in (the game's
  // own pools rule, pools-vocab GATOR_MIN_DEPTH)
  for (const m of t.marks) {
    if (m.k !== "gator") continue;
    const h = t.hgt[I(Math.floor(m.x), Math.floor(m.y))];
    if (WATER_TABLE - h < GATOR_MIN_DEPTH) E(`alligator at (${Math.floor(m.x)},${Math.floor(m.y)}): put it in deep water (${GATOR_MIN_DEPTH} steps under the waterline or more)`);
  }
  const doors = t.pieces.filter((p) => p.k === "door");
  if (def.role === "door") {
    if (doors.length !== 1) E("a door tile carries exactly one exit door 'D'");
    if (!def.name) E("a door tile needs its name (The Landing, The Changing Rooms, The Filtration Hall, The High Dive)");
  } else if (doors.length) E("only a door tile carries an exit door");
  for (const d of doors) {
    if (t.hgt[I(d.x, d.y)] !== 0) E(`exit door at (${d.x},${d.y}): it stands on floor 0`);
    // AGAINST A WALL (Josh, Sep 2026: "an actual door against the wall"): a
    // door with solid wall straight behind it needs its clear dry floor on
    // the OPEN side only — three cells out and three either side. A door
    // standing free still needs it all the way round.
    const back = ([0, 1, 2, 3] as Side[]).find((s) => {
      const bx = d.x + DX[s];
      const by = d.y + DY[s];
      return bx >= 0 && by >= 0 && bx < w && by < h && t.cell[I(bx, by)] === 2;
    });
    let bad = 0;
    for (let y = d.y - 3; y <= d.y + 3; y++) {
      for (let x = d.x - 3; x <= d.x + 3; x++) {
        if (back !== undefined && (x - d.x) * DX[back] + (y - d.y) * DY[back] > 0) continue; // behind the wall
        if (!(x >= 0 && y >= 0 && x < w && y < h) || t.cell[I(x, y)] !== 1 || wetFloor(t.hgt[I(x, y)])) bad++;
      }
    }
    if (bad) E(`exit door at (${d.x},${d.y}): it needs clear dry floor three cells ${back !== undefined ? "out from its wall" : "round it"} (${bad} cell${bad > 1 ? "s aren't" : " isn't"})`);
  }
  void count;
}

/** The Poolrooms' dialect. */
export const POOLS_DIALECT: Dialect = {
  level: 1,
  types: POOL_TYPES,
  zones: POOL_ZONES,
  glyphs: POOL_GLYPHS,
  groups: POOL_GLYPH_GROUPS,
  sets: POOL_SETS,
  roles: POOL_ROLES,
  blocks: { pillar: [{ name: "pillar", w: 2, h: 2 }], spiralcore: [{ name: "spiralcore", w: 2, h: 2 }] },
  solidLine: new Set(),
  wallBacked: new Set(["porthole", "cubby", "ladder", "window"]),
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["arch", "portal", "skylight"]),
  axisKinds: new Set(["arch", "portal", "bridge"]),
  maxDoorWidth: 25,
  axisOf(k, c) {
    if (c.face === "H") return 0;
    if (c.face === "V") return 1;
    if (k === "bridge") return c.runV > c.runH ? 1 : 0;
    // an arch spans between the piers either side of it; a portal ring
    // between the walls two cells out
    const r = k === "portal" ? 2 : 1;
    if (c.solidAt(-r, 0) && c.solidAt(r, 0)) return 0;
    if (c.solidAt(0, -r) && c.solidAt(0, r)) return 1;
    if (c.vert && !c.horiz) return 1;
    return 0;
  },
  backs(k, c, side) {
    // flat things hang on real stone (the client's backedOn), not on the
    // thin wall between two rooms
    if (k === "porthole" || k === "cubby" || k === "window") return c.solidAt(DX[side], DY[side]);
    // a ladder climbs out of the water onto the deck beside it
    if (k === "ladder") {
      const f = c.floorAt(DX[side], DY[side]);
      return f !== null && f >= c.floor + 2 && !wetFloor(f);
    }
    return undefined;
  },
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(effFloor(a) - effFloor(b)) <= 1,
  lint: poolsLint,
};

/** Parse a Poolrooms definition (see tiles.ts). */
export function parsePoolTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, POOLS_DIALECT, lint);
}

/** Everything wrong with a Poolrooms tile. */
export function lintPoolTile(def: TileDef): Lint & { tile: Tile } {
  const out = lintAny(def, POOLS_DIALECT);
  // the Poolrooms wear only the pool tile (surfaces.ts LEVEL1_SURFACES)
  for (const m of lookProblems(def.look, 1)) if (!out.errors.includes(m)) out.errors.push(m);
  for (const pl of def.props ?? []) {
    const kind = pl.tex ? surfaceKindOf(pl.tex) : null;
    if (kind && !surfaceOnLevel(kind, pl.tex!, 1)) out.errors.push(`prop "${pl.p}" at (${pl.x},${pl.y}): its surface "${pl.tex}" belongs to another level — the Poolrooms wear only the pool tile`);
  }
  return out;
}
