// The Backrooms world generator — Sector A of Level 0.
//
// Design contract (locked with Josh, July 2026):
// - The world is generated ONCE from a seed and is then PERMANENT: explored
//   fog, spray paint, loot history, and corpses all key off cell coordinates,
//   so a frozen seed must reproduce the identical sector forever. NEVER
//   change generation logic for a seed that has shipped — expansion happens
//   by adding NEW sectors (their own seeds), not by editing this one.
// - Quality bar: fully explorable (100% of walkable cells reachable from all
//   four entry doors — validated, not hoped), intelligently varied (typed
//   districts so navigation FEELS different area to area), and landmarked
//   (hand-authored set-pieces the generator stamps in — the anchors players
//   navigate and tell stories by).
// - Scale: cells are 2m. Sector A is 256×256 cells ≈ 500m × 500m.
//
// Representation: thin walls (the drywall look of Level 0). Every cell has
// two wall bits — its NORTH edge and its WEST edge — so a wall is shared
// between neighbors and doorways are gaps. `solid` cells are pillars/blocks
// (unwalkable mass). This is what both the 3D client and the top-down map
// renderer consume.

import { createHash } from "node:crypto";

// ---- The frozen world ------------------------------------------------------
// SECTOR A WAS FROZEN BY JOSH ON 2026-07-25. Seed 999983, 256×256 — from
// this moment the map is permanent: spray paint, fog, loot history, and
// corpses all key off these exact walls. The generation code may be
// EXTENDED (new district types for FUTURE sectors, new landmark templates
// appended, new sectors) but any change that alters Sector A's output is a
// world-breaking bug — the fingerprint below is asserted by the harness
// (and should be verified at backrooms boot in B2) so it can't slip in
// silently.

// ---- LEVEL 0 v2 (2026-07-27) -----------------------------------------------
// THE EXPANSION. Josh asked for twice the map with everything we'd learned:
// slopes, height changes, lethal shafts, mixed districts, unreachable scenery.
// That is a NEW WORLD, not an edit of the old one — the frozen 256² sector
// could never grow without breaking every fog byte and paint mark keyed to its
// geometry, which is exactly what the admin RESET MAP button exists for.
//
// Sector A is now A3: 362×362 (twice A1's AREA — 724m square), seed 20260727,
// with verticality. Same seed as A2, but a genuinely different world, because
// two generator faults were fixed under it (July 2026, Josh's five-pass audit):
//
//   · SCENERY IS GONE. The out-of-bounds rooms were sealed by their own pass
//     and then unsealed by connectAll, which carves wherever it likes. 204 of
//     333 scenery cells ended up with no wall between them and walkable floor:
//     a floor and a ceiling, no wall, no collider, and a height gap with
//     nothing closing it. Those were the dark voids in Josh's screenshots.
//     Anything unreachable is now FILLED WITH SOLID ROCK instead.
//   · EVERY DOOR NOW OPENS ONTO THE WHOLE WORLD. connectAll and the validator
//     both flooded from all four doors at once, so three good doors masked a
//     bad one — seed 700001 put Door II in a sealed 28-cell closet and every
//     check called the map 100% connected. See connectDoors, and doorReach in
//     the validation report.
//
// The id is bumped so the old world's fog, paint and drops (keyed to "A2") are
// inert rather than misread. RUN THE ADMIN MAP RESET after deploying anyway:
// bodies and the death ledger aren't sector-keyed.
//
// A4 (Sep 2026) REPLACED A3: Level 0 rebuilt from hand-drawn rooms, a lattice
// packed wall to wall, ONE door (worldgen-lobby.ts). The generator below is
// the retired rule-built one, kept for the record and scripts/render-sector.mjs.
//
// A5 (Sep 2026, the same week) REPLACED A4 — Josh: "The level 0 is way to
// massive lets condense it down a 3rd its size please with more variations in
// its rooms type and look." 212² against 362² (a third of the walkable floor:
// ~43,000 cells against ~128,000), and thirteen room types against eight, each
// with its own walls, floor and lights (client world.ts LOBBY_LOOK).
//
// A6 (Sep 29 2026) REPLACED A5 — Josh: "keep most of the map the same color
// pallet with a couple of room with different variance like the one we have
// now. lets also make the map a little smaller by like 25%". 182² against
// 212² (about three quarters of the walkable floor: ~32,000 cells against
// ~43,000); every district wears the yellow palette, and the rooms that
// break it — tiled restrooms, wood panelling, concrete storage — are a few
// single rooms (worldgen-lobby.ts ACCENTS) beside The Washroom and The
// Boardroom.
export const SECTOR_A = Object.freeze({ id: "A6", seed: 20261038, size: 182 });

/** Captured at freeze time; regenerating Sector A must always produce this. */
export const SECTOR_A_FINGERPRINT = "sha256:0300561f2e46c042ee64b112ac23fd126a564cdf2300396e423d0ef1063ecfa5";

/** The retired A5 — thirteen room types as districts, 212². */
export const SECTOR_A5_RETIRED = Object.freeze({
  id: "A5",
  seed: 20261002,
  size: 212,
  fingerprint: "sha256:9fee940dbfddb61226c10c60e57691bfc37518e136f6f1c24d5d0e1a6e37cdc3",
});

/** The retired A4 — the first hand-drawn Level 0, 362², eight room types. */
export const SECTOR_A4_RETIRED = Object.freeze({
  id: "A4",
  seed: 20260931,
  size: 362,
  fingerprint: "sha256:b2c4299f824c0fc3da9fa84886e54275c008ddbc5fbc42b6187b5e19287bc948",
});

/** The retired A3 — the rule-built Level 0 with four edge doors. */
export const SECTOR_A3_RETIRED = Object.freeze({
  id: "A3",
  seed: 20260727,
  size: 362,
  fingerprint: "sha256:31b655074de504dd8202aee531106e2d189a64f6c1b813c6f243f0bccc71e3d1",
});

/** The retired A2 world — same seed, but with the scenery holes and the
 *  possibility of a sealed door. Kept so its fingerprint stays checkable. */
export const SECTOR_A2_RETIRED = Object.freeze({
  id: "A2",
  seed: 20260727,
  size: 362,
  fingerprint: "sha256:36ba8bfaf08eb7c0997d5713cb4480ef9ee734ee970dbba9581ec78681acc0e5",
});

/** The retired flat world, for the record (and for anyone reading the fog
 *  rows it left behind). Nothing generates it any more. */
export const SECTOR_A1_RETIRED = Object.freeze({
  id: "A",
  seed: 999983,
  size: 256,
  fingerprint: "sha256:ee643cd9396381f371ef49cbaa184515d717b72a003d874c85053916619793ce",
});

/** Deterministic content hash of a generated sector (walls, solids,
 *  districts, landmarks, doors — everything gameplay-visible).
 *
 *  FLOOR HEIGHTS join the hash only when the sector actually HAS any: the
 *  256² world was frozen before verticality existed, and hashing an all-zero
 *  array unconditionally would have changed its fingerprint and refused to
 *  serve the shipped world. A flat sector hashes exactly as it always did. */
export function sectorFingerprint(s: Sector): string {
  const h = createHash("sha256");
  h.update(Buffer.from(s.wallN));
  h.update(Buffer.from(s.wallW));
  h.update(Buffer.from(s.solid));
  h.update(Buffer.from(s.district));
  h.update(Buffer.from(s.landmark));
  let vertical = false;
  for (let i = 0; i < s.floor.length; i++) {
    if (s.floor[i] !== 0) {
      vertical = true;
      break;
    }
  }
  if (vertical) h.update(Buffer.from(new Uint8Array(s.floor.buffer, s.floor.byteOffset, s.floor.length)));
  let scenery = false;
  for (let i = 0; i < s.background.length; i++) {
    if (s.background[i]) {
      scenery = true;
      break;
    }
  }
  if (scenery) h.update(Buffer.from(s.background));
  // Water joins the hash the same way heights did: only when the sector is
  // actually wet, so every dry world hashes exactly as it always did.
  if (s.water) {
    let wet = false;
    for (let i = 0; i < s.water.length; i++) {
      if (s.water[i] !== WATER_NONE) {
        wet = true;
        break;
      }
    }
    if (wet) h.update(Buffer.from(new Uint8Array(s.water.buffer, s.water.byteOffset, s.water.length)));
  }
  // Deco joins the hash like water and heights: only when present and
  // non-empty, so every undecorated world hashes exactly as it always did.
  if (s.deco) {
    let any = false;
    for (let i = 0; i < s.deco.length; i++) {
      if (s.deco[i]) {
        any = true;
        break;
      }
    }
    if (any) h.update(Buffer.from(s.deco));
  }
  // The station's sections join the same way: only a sectioned world hashes them.
  if (s.section) h.update(Buffer.from(s.section));
  h.update(JSON.stringify({ seed: s.seed, size: s.size, landmarks: s.landmarks, doors: s.doors }));
  return "sha256:" + h.digest("hex");
}

// ---- THE CLIMB RULE (shared by generator, server and client) ---------------

/** Is a cell a lethal pit floor? (Deep enough that falling in kills.)
 *  A floor under WATER never is, however deep: you land in the water, and
 *  swim. No level had water over a floor that deep until Thalassophobia
 *  (Level 7), whose drowned streets lie 6m down and its sunken plaza 24m. */
export function isPitCell(s: Sector, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return false;
  const i = idx(s.size, x, y);
  if (s.floor[i] > -PIT_LETHAL) return false;
  return !s.water || s.water[i] === WATER_NONE;
}

/** A stride: one step (0.5m) up, taken without thinking about it. */
export const CLIMB_WALK = 1;
/** A MANTLE: two steps (1.0m) up, but only with a jump (Josh, July 2026 —
 *  "enable players to be able to crouch jump on top of something if the height
 *  is high enough"). Waist-high ledges are now scenery you can get onto
 *  instead of invisible walls. Three steps (1.5m) is still a cliff. */
export const CLIMB_JUMP = 2;

/** Can you step from one open cell to an ADJACENT open cell, ignoring walls?
 *  Up: a stride, or a mantle with a jump. Down: any drop (you fall). That
 *  asymmetry is what makes pits one-way.
 *
 *  This is the SERVER'S permission, so it allows the mantle: the client decides
 *  whether you are actually airborne, and the worst a liar gains is standing on
 *  a 1m ledge. The GENERATOR deliberately does NOT use this — see
 *  heightWalkable — because the world must be traversable by someone who never
 *  jumps at all. */
export function heightPassable(from: number, to: number): boolean {
  return to - from <= CLIMB_JUMP;
}

/** Climb-only, no jumping, both directions within ONE step. This is the
 *  standard the connectivity and escape passes hold the world to: every corner
 *  of Level 0 must be reachable AND leavable on foot alone. Never relax this to
 *  CLIMB_JUMP — a map that needs a jump to escape is a map that traps whoever
 *  mistimes it. */
export function heightWalkable(from: number, to: number): boolean {
  return Math.abs(to - from) <= CLIMB_WALK;
}

// ---- Seeded PRNG (mulberry32 — the Derby/Emporium pattern) -----------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Sub-seeded PRNG so each pass rolls independently of the others. */
export function rngFor(seed: number, domain: string): () => number {
  return mulberry32(hashStr(`${seed}:${domain}`));
}

// ---- Types -----------------------------------------------------------------

// ---- Level 0 v2: VERTICALITY (Josh, 2026-07-27) -----------------------------
// The expansion brief: "pillar rooms, mazes, long grand hallways, slopes,
// height changes, pits players can fall to their death in, mixed and matched
// areas — really capture the backrooms aesthetic without breaking the game."
//
// The one new primitive that unlocks all of it is a FLOOR HEIGHT per cell,
// in integer STEPS of FLOOR_STEP metres. Everything else — ramps, terraces,
// sunken levels, galleries, lethal shafts — is that array plus rules:
//
//   THE CLIMB RULE (the load-bearing invariant, enforced identically in the
//   generator's connectivity pass, the server's movement validator and the
//   client's collision):
//     · |Δfloor| ≤ 1  → walkable. A 1-step change renders as a RAMP.
//     · Δ ≥ +2 up     → impassable. That's a cliff face, not a step.
//     · Δ ≤ -2 down   → you may walk off it. That's a FALL, and it hurts.
//
//   PIT_LETHAL steps of drop is unsurvivable from full health, which is what
//   makes a pit a pit. Two things must therefore be true of every pit, and
//   validateSector asserts both: it is deep enough to kill (never a trap you
//   sit in), and no non-pit cell is reachable ONLY by falling (no soft-locks).
export const FLOOR_STEP = 0.5; // metres per height step
/** Sectors at least this wide get the v2 verticality passes. The frozen 256²
 *  world predates them and must keep hashing flat, so the size is the switch —
 *  no flag to forget, and the old fingerprint is safe by construction. */
export const VERTICAL_FROM = 300;
/** A drop of this many steps or more is certain death (see FALL_* on the
 *  server). Pits are dug at least this deep, so falling in is fatal, never a
 *  soft-lock. */
export const PIT_LETHAL = 9; // 4.5m

export type DistrictType =
  | "classic"
  | "pillars"
  | "offices"
  | "warrens"
  | "halls"
  // v2 verticality districts:
  /** Grand multi-level room: sunken floor, raised gallery ring, ramps up. */
  | "atrium"
  /** A slow hill — floor climbs in one-step bands, ramps all the way. */
  | "terraces"
  /** The whole district dropped several steps; entered by ramps at its rim. */
  | "sublevel"
  // Level 0's Sep 2026 rooms (lobby-vocab.ts):
  | "manila"
  | "restrooms"
  | "panelled"
  | "storage"
  | "unlit"
  // ---- The Poolrooms (Level 1) — generated in worldgen-pools.ts ----
  /** Grand pool hall: colonnade ring, one enormous central basin, high glass. */
  | "natatorium"
  /** A sunken wading field — ankle-to-knee water across the whole district. */
  | "shallows"
  /** Small white rooms, half of them with a private square pool. */
  | "soak"
  /** Dry white-tile maze — the connective tissue between the wet places. */
  | "poolmaze"
  /** Halls with a water canal down the middle: ledges, bridges, step-outs. */
  | "channels"
  /** Stepped decks with pools on different levels. */
  | "sundeck"
  // The Drowned Palace (Poolrooms v2):
  /** An open flooded SEA — islands, causeways, trenches, column forests. */
  | "sea"
  /** A mega-room holding a moated ziggurat pavilion with a rooftop pool. */
  | "pavilion"
  // The Poolrooms v3 (Josh's reference-image rebuild, Aug 2026):
  /** Deep flood wall to wall — an arch forest springing from the water, one
   *  curving raised walkway. Blue_Tiles / i9l4qjb8a2x81. */
  | "vaultsea"
  /** Long axial gallery pierced by nested full-circle portals, a knee-deep
   *  channel between dry ledges. Poolrooms-3 / benidjer. */
  | "portalhall"
  /** Curving barrel-vault tunnel maze, wading water throughout, porthole
   *  walls, round chambers. level-33-1 / images.jpg. */
  | "tunnels"
  /** Circular domed room, ring of arched doorways, concentric steps down
   *  into a round pool. Poolrooms-4 / images (1).jpg. */
  | "rotunda"
  /** Small white bath rooms, sunken private pools, arched doors. gametiles. */
  | "baths"
  // The Poolrooms v4 (Sep 2026, built from hand-drawn rooms — the rivers are
  // the spine): the river halls, towpath to towpath.
  /** A river hall: the channel, its graded banks and a towpath each side. */
  | "river"
  // ---- PIPE DREAMS (Level 2) — generated in worldgen-pipes.ts ----
  // v2 (D2): one type per kind of SPACE, not per district — the type is the
  // ceiling height, so a corridor is low, a hall is tall, and the catwalk's
  // ceiling meets its engine hall's exactly.
  /** The long pipe galleries on the structural grid. */
  | "pipegallery"
  /** The perimeter service corridor. */
  | "servicering"
  /** A block's own corridors (double-loaded, rooms both sides). */
  | "corridor"
  /** Maintenance tunnels and crawlways. */
  | "tunnel"
  /** Small rooms: offices, valve rooms, electrical rooms, stores, WCs. */
  | "office"
  /** Bigger rooms: locker rooms, pump rooms. */
  | "suite"
  /** SAFE: a lit break room. */
  | "breakroom"
  /** SAFE: a lit control room. */
  | "controlroom"
  /** An engine hall's machine floor (sunk a deck under its catwalks). */
  | "enginehall"
  /** The catwalks and bridges round an engine hall. */
  | "catwalk"
  | "boilerhouse"
  | "warehouse"
  | "machineshop"
  /** SAFE: the drain chamber, the level's landing. */
  | "drainroom"
  /** The valve gallery and the pressure door's antechamber. */
  | "vault"
  // ---- THE ELECTRICAL STATION (Level 3) — station-vocab.ts STATION_TYPES
  | "intake"
  | "lifthall"
  | "switchroom"
  | "serviceway"
  | "cablevault"
  | "controldesk"
  | "batteryroom"
  | "xfmrbay"
  | "substation"
  | "workshop"
  | "floodroom"
  // ---- THE ABANDONED OFFICE (Level 4) — office-vocab.ts OFFICE_TYPES
  | "liftlobby"
  | "security"
  | "stairwell"
  | "hallway"
  | "cubicles"
  | "openplan"
  | "conference"
  | "corneroffice"
  | "kitchenette"
  | "copyroom"
  | "records"
  | "serverroom"
  | "washroom"
  | "reception"
  | "supply"
  // ---- THE TERROR HOTEL (Level 5) — hotel-vocab.ts HOTEL_TYPES (corridor,
  // suite and lifthall are already above)
  | "landing"
  | "lounge"
  | "beverly"
  | "linen"
  | "dining"
  | "library"
  | "boilergate"
  | "boiler"
  | "pipeway"
  | "coalstore"
  | "rustydoor"
  // ---- LIGHTS OUT (Level 6) — lights-vocab.ts LIGHTS_TYPES
  | "stairfoot"
  | "darkhall"
  | "piperun"
  | "darkroom"
  | "storeroom"
  | "cellblock"
  | "rubble"
  | "deadoffice"
  | "wetway"
  | "cistern"
  | "seahatch"
  // ---- THALASSOPHOBIA (Level 7) — ocean-vocab.ts OCEAN_TYPES
  | "seatower"
  | "searoof"
  | "seawade"
  | "seacanal"
  | "seaplaza"
  | "seadrop"
  | "seasunk"
  // ---- THE CAVE SYSTEM (Level 8) — cave-vocab.ts CAVE_TYPES
  | "subwaystair"
  | "platform"
  | "trackbed"
  | "concourse"
  | "breach"
  | "cavern"
  | "gallery"
  | "caveriver"
  | "chasm"
  | "grotto"
  | "passage"
  | "crawl"
  | "chimney"
  // ---- THE SUBURBS (Level 9) — suburb-vocab.ts SUBURB_TYPES
  | "manhole"
  | "road"
  | "sidewalk"
  | "yard"
  | "house"
  | "garage"
  | "park"
  | "porch";

export interface District {
  id: number;
  type: DistrictType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Landmark {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Door {
  x: number;
  y: number;
  edge: "N" | "S" | "E" | "W";
  name: string;
}

export interface Sector {
  seed: number;
  size: number;
  /** wallN[y*size+x] = 1 → wall on the cell's north edge. */
  wallN: Uint8Array;
  /** wallW[y*size+x] = 1 → wall on the cell's west edge. */
  wallW: Uint8Array;
  /** solid[y*size+x] = 1 → pillar/block (unwalkable). */
  solid: Uint8Array;
  /** floor[y*size+x] = height in STEPS of FLOOR_STEP metres (0 = the datum,
   *  negative = sunken). All-zero in the frozen 256² world; the v2 sector uses
   *  it for slopes, galleries, sublevels and lethal pits. See THE CLIMB RULE. */
  floor: Int8Array;
  /** background[y*size+x] = 1 → SCENERY. Real geometry, deliberately with no
   *  route in: a balcony above you, a lit room across a shaft. Josh's ask —
   *  "designs and structure players can never reach but are there for
   *  background". Connectivity EXEMPTS these cells (they're meant to be
   *  sealed) and every placement pass must refuse them, or players would hunt
   *  for something they can never hold. */
  background: Uint8Array;
  /** district id per cell (index into districts). */
  district: Uint8Array;
  /** landmark id per cell (0 = none; ids are 1-based into landmarks). */
  landmark: Uint8Array;
  districts: District[];
  landmarks: Landmark[];
  doors: Door[];
  /** water[y*size+x] = water SURFACE height in steps, or WATER_NONE = dry.
   *  Only wet sectors (the Poolrooms) carry this; Level 0 leaves it unset so
   *  the frozen A3 fingerprint is untouched. Water never blocks movement — it
   *  slows it — and a cell is "in water" iff floor < water. */
  water?: Int8Array;
  /** EFFECTIVE floor for the climb rule: max(floor, water surface) — a
   *  swimmer floats at the surface, so stepping out of deep water onto a
   *  quay one step above the WATERLINE is legal even though the pool floor
   *  is metres down. Built by wet generators before their connectivity
   *  passes; when absent (every dry sector) all passes read raw floor. */
  eff?: Int8Array;
  /** DECORATION per cell — kind*16+variant, kinds in worldgen-pools.ts.
   *  Purely visual (kit-piece dressing: arches, circle portals, portholes,
   *  pillars, bridges, skylights, spiral cores); colliders stay in
   *  solid/wall/floor. Streamed with chunks, hashed when present. */
  deco?: Uint8Array;
  /** THE PROP KIT: real models placed by hand in the room designs, copied
   *  into the map by the generator (src/backrooms/kit.ts). x/y in cells, r
   *  yaw degrees, z metres above the cell's floor. Not hashed: a prop moved
   *  in a room design changes no floor, wall or route, and the maps are
   *  versioned by the editor's publish, not by this list. */
  kit?: (import("./kit").KitPlace & { v: number; r: number; z: number })[];
  /** THE GAME LAYER (marks.ts): creature spawners and relic / drive spots,
   *  placed in the room designs and copied here, in sector cells. Not hashed
   *  (a spawner moved changes no floor or route): a publish that moves them
   *  keeps the map, and the service re-seats what they place. */
  marks?: import("./marks").MarkPlace[];
  /** THE ROOM STYLES per cell (the map editor's Look, Lights and Sound):
   *  1 + an index into `styles`, 0 = the room's usual. Dressing like the
   *  kit: not hashed, so a restyle publishes without resetting the level. */
  look?: Uint16Array;
  /** Every distinct room style the map uses, once (surfaces.ts StyleTable). */
  styles?: import("./surfaces").LookSpec[];
  /** THE HELD CEILING per cell (ceiling.ts): the floor height, in steps, the
   *  cell's ceiling hangs from; LID_NONE = it follows the floor. Absent when
   *  no room holds one. Dressing — not hashed. */
  lid?: Int8Array;
  /** THE STAIRS (stairs.ts): per cell the side that is UP (0-3 N E S W) or
   *  STAIR_NONE; absent when the map has none. Dressing — not hashed (who can
   *  walk where is the floor's business). */
  stair?: Int8Array;
  /** Each stair cell's dressing: 1 + an index into `stairSpecs` (0 = usual). */
  stairStyle?: Uint8Array;
  stairSpecs?: import("./stairs").StairSpec[];
  /** THE SECTIONS (Level 3, station-vocab.ts): per cell the power circuit it
   *  is on, 1..SECTIONS (0 = none). Each section has one breaker, one cutoff,
   *  its own lights and its own live water, so WHO GETS HURT WHERE depends
   *  on it — it joins the fingerprint, like deco, when present. The office
   *  (Level 4) uses the same layer for its BLINK ZONES, 1..BLINK_ZONES: the
   *  troffers dip a zone at a time, and a dip is when the Temp moves. */
  section?: Uint8Array;
  /** LEVEL 5 (the Terror Hotel) only: what the plan decided that the cells
   *  can't carry — every suite's number, door and room, and WHICH suite the
   *  guest register names. SERVER ONLY (the register's number is the
   *  level's puzzle) and outside the fingerprint, like the kit. */
  hotel?: {
    suites: { x: number; y: number; number: number; door: { x: number; y: number; side: number }; rect: { x: number; y: number; w: number; h: number } }[];
    target: number;
  };
  /** LEVEL 6 (Lights Out) only: where the plan put the Handwheel among the
   *  spots the rooms drew, every battery spot, and the sea hatch. SERVER ONLY
   *  (where the wheel lies is the level's search) and outside the
   *  fingerprint, like the kit. */
  lights?: {
    wheel: { x: number; y: number } | null;
    wheelSpots: { x: number; y: number }[];
    batterySpots: { x: number; y: number }[];
    hatch: { x: number; y: number; side: number } | null;
  };
  /** THALASSOPHOBIA (Level 7), server only: where the Diving Helmet lies,
   *  every spot it may, and the subway stair at the bottom of the plaza. */
  ocean?: {
    helmet: { x: number; y: number } | null;
    helmetSpots: { x: number; y: number }[];
    subway: { x: number; y: number; side: number } | null;
  };
  /** THE CAVE SYSTEM (Level 8), server only: where the Climbing Rope lies,
   *  every spot it may, and the Chimney's foot. */
  cave?: {
    rope: { x: number; y: number } | null;
    ropeSpots: { x: number; y: number }[];
    chimney: { x: number; y: number; side: number } | null;
  };
  /** THE SUBURBS (Level 9), server only: where the House Key lies, every
   *  spot it may, and Number 9's front door. */
  suburb?: {
    key: { x: number; y: number } | null;
    keySpots: { x: number; y: number }[];
    frontDoor: { x: number; y: number; side: number } | null;
  };
}

/** Sentinel for "no water here" in Sector.water. */
export const WATER_NONE = -128;

// ---- Generation ------------------------------------------------------------

const DISTRICT_MIN = 30; // BSP leaf bounds (cells)
const DISTRICT_MAX = 72;

/** BSP partition of the sector into rectangular district leaves. */
function partition(size: number, rnd: () => number): District[] {
  interface Rect { x: number; y: number; w: number; h: number }
  const leaves: Rect[] = [];
  const stack: Rect[] = [{ x: 0, y: 0, w: size, h: size }];
  while (stack.length) {
    const r = stack.pop()!;
    const canSplitW = r.w > DISTRICT_MAX || (r.w >= DISTRICT_MIN * 2 && rnd() < 0.75);
    const canSplitH = r.h > DISTRICT_MAX || (r.h >= DISTRICT_MIN * 2 && rnd() < 0.75);
    if (!canSplitW && !canSplitH) {
      leaves.push(r);
      continue;
    }
    // Split the longer axis (ties by coin flip) at a jittered midpoint.
    const splitW = canSplitW && (!canSplitH || r.w > r.h || (r.w === r.h && rnd() < 0.5));
    if (splitW) {
      const at = Math.floor(r.w * (0.38 + rnd() * 0.24));
      stack.push({ x: r.x, y: r.y, w: at, h: r.h });
      stack.push({ x: r.x + at, y: r.y, w: r.w - at, h: r.h });
    } else {
      const at = Math.floor(r.h * (0.38 + rnd() * 0.24));
      stack.push({ x: r.x, y: r.y, w: r.w, h: at });
      stack.push({ x: r.x, y: r.y + at, w: r.w, h: r.h - at });
    }
  }
  // Weighted type assignment — classic dominates (it IS Level 0), the rest
  // break it up so long walks keep changing texture. v2 adds the three
  // vertical types at a deliberately low share: verticality is a PUNCTUATION
  // mark. If every third district were a hill, none of them would land.
  const WEIGHTS: [DistrictType, number][] =
    size >= VERTICAL_FROM
      ? [
          ["classic", 0.26],
          ["pillars", 0.15],
          ["offices", 0.14],
          ["warrens", 0.13],
          ["halls", 0.12],
          ["atrium", 0.07],
          ["terraces", 0.07],
          ["sublevel", 0.06],
        ]
      : [
          ["classic", 0.34],
          ["pillars", 0.18],
          ["offices", 0.18],
          ["warrens", 0.15],
          ["halls", 0.15],
        ];
  const pick = (): DistrictType => {
    let r = rnd();
    for (const [t, w] of WEIGHTS) {
      if ((r -= w) <= 0) return t;
    }
    return "classic";
  };
  return leaves.map((r, i) => ({ id: i, type: pick(), ...r }));
}

/** Helpers to index the wall arrays. */
export function idx(size: number, x: number, y: number): number {
  return y * size + x;
}

/** Draw a full wall box around a rect (north+west edges of the right cells). */
export function wallRect(s: Sector, x: number, y: number, w: number, h: number): void {
  for (let cx = x; cx < x + w; cx++) {
    if (y < s.size) s.wallN[idx(s.size, cx, y)] = 1; // top edge
    if (y + h < s.size) s.wallN[idx(s.size, cx, y + h)] = 1; // bottom edge
  }
  for (let cy = y; cy < y + h; cy++) {
    if (x < s.size) s.wallW[idx(s.size, x, cy)] = 1; // left edge
    if (x + w < s.size) s.wallW[idx(s.size, x + w, cy)] = 1; // right edge
  }
}

/** Punch a doorway gap (1-2 cells) in one side of a rect. */
export function punchDoor(
  s: Sector,
  x: number,
  y: number,
  w: number,
  h: number,
  side: "N" | "S" | "E" | "W",
  rnd: () => number,
  width = 1,
): void {
  if (side === "N" || side === "S") {
    const at = x + 1 + Math.floor(rnd() * Math.max(1, w - width - 1));
    const wy = side === "N" ? y : y + h;
    if (wy >= s.size) return;
    for (let i = 0; i < width; i++) if (at + i < x + w) s.wallN[idx(s.size, at + i, wy)] = 0;
  } else {
    const at = y + 1 + Math.floor(rnd() * Math.max(1, h - width - 1));
    const wx = side === "W" ? x : x + w;
    if (wx >= s.size) return;
    for (let i = 0; i < width; i++) if (at + i < y + h) s.wallW[idx(s.size, wx, at + i)] = 0;
  }
}

// ---- District fills --------------------------------------------------------

/** classic: the canonical Level 0 — irregular yellow rooms, doorway gaps,
 *  the occasional wall knocked clean through. */
function fillClassic(s: Sector, d: District, rnd: () => number): void {
  interface Rect { x: number; y: number; w: number; h: number }
  const rooms: Rect[] = [];
  const stack: Rect[] = [{ x: d.x, y: d.y, w: d.w, h: d.h }];
  while (stack.length) {
    const r = stack.pop()!;
    if ((r.w <= 12 && r.h <= 12 && rnd() < 0.55) || (r.w <= 6 && r.h <= 6)) {
      rooms.push(r);
      continue;
    }
    if (r.w >= r.h && r.w > 6) {
      const at = Math.floor(r.w * (0.35 + rnd() * 0.3));
      stack.push({ x: r.x, y: r.y, w: at, h: r.h });
      stack.push({ x: r.x + at, y: r.y, w: r.w - at, h: r.h });
    } else if (r.h > 6) {
      const at = Math.floor(r.h * (0.35 + rnd() * 0.3));
      stack.push({ x: r.x, y: r.y, w: r.w, h: at });
      stack.push({ x: r.x, y: r.y + at, w: r.w, h: r.h - at });
    } else {
      rooms.push(r);
    }
  }
  for (const r of rooms) {
    wallRect(s, r.x, r.y, r.w, r.h);
  }
  // Rooms open sparingly — one guaranteed doorway keeps flow, extra doors
  // are the exception. (First tuning pass had doors on every side and the
  // sector's depth collapsed to ~100 cells: an open mall, not a maze.)
  for (const r of rooms) {
    punchDoor(s, r.x, r.y, r.w, r.h, "N", rnd, 1 + (rnd() < 0.3 ? 1 : 0));
    if (rnd() < 0.55) punchDoor(s, r.x, r.y, r.w, r.h, "W", rnd);
    if (rnd() < 0.15) punchDoor(s, r.x, r.y, r.w, r.h, "S", rnd);
    if (rnd() < 0.15) punchDoor(s, r.x, r.y, r.w, r.h, "E", rnd);
  }
}

/** pillars: vast open halls, a grid of square columns with jitter and gaps —
 *  long sightlines, nowhere to hide. */
function fillPillars(s: Sector, d: District, rnd: () => number): void {
  const pitch = 4 + Math.floor(rnd() * 2); // 4-5 cells between columns
  for (let y = d.y + 2; y < d.y + d.h - 2; y += pitch) {
    for (let x = d.x + 2; x < d.x + d.w - 2; x += pitch) {
      if (rnd() < 0.12) continue; // missing column — landmark-ish anomaly
      const jx = x + (rnd() < 0.2 ? 1 : 0);
      const jy = y + (rnd() < 0.2 ? 1 : 0);
      s.solid[idx(s.size, jx, jy)] = 1;
      // Fat columns sometimes (2×2).
      if (rnd() < 0.22 && jx + 1 < d.x + d.w && jy + 1 < d.y + d.h) {
        s.solid[idx(s.size, jx + 1, jy)] = 1;
        s.solid[idx(s.size, jx, jy + 1)] = 1;
        s.solid[idx(s.size, jx + 1, jy + 1)] = 1;
      }
    }
  }
}

/** offices: corridor spines with small rooms budding off them — the "someone
 *  worked here once" texture. Spines repeat every ~11 rows so tall districts
 *  fill wall-to-wall instead of leaving bare fields around a single strip. */
function fillOffices(s: Sector, d: District, rnd: () => number): void {
  const band = 11;
  for (let spineY = d.y + 5 + Math.floor(rnd() * 3); spineY < d.y + d.h - 4; spineY += band) {
    for (const top of [true, false]) {
      let x = d.x;
      while (x < d.x + d.w - 3) {
        const rw = 3 + Math.floor(rnd() * 4);
        const rh = 3 + Math.floor(rnd() * 3);
        const ry = top ? Math.max(d.y, spineY - rh - 1) : Math.min(d.y + d.h - rh, spineY + 2);
        const w = Math.min(rw, d.x + d.w - x);
        if (w >= 3 && rnd() < 0.85) {
          wallRect(s, x, ry, w, rh);
          // Door onto the spine side.
          punchDoor(s, x, ry, w, rh, top ? "S" : "N", rnd);
          // Occasionally interconnect neighboring offices.
          if (rnd() < 0.3) punchDoor(s, x, ry, w, rh, "E", rnd);
        }
        x += w;
      }
    }
  }
}

/** warrens: a maze at TWO-CELL corridor width (4m halls, not 2m slots) with
 *  occasional open clearings — disorienting but breathable. (The first
 *  1-cell version rendered as a solid dark tangle; Josh: "less dense".) */
function fillWarrens(s: Sector, d: District, rnd: () => number): void {
  const gw = Math.floor(d.w / 2);
  const gh = Math.floor(d.h / 2);
  if (gw < 2 || gh < 2) return;
  // Walls on every coarse boundary; the backtracker carves 2-wide openings.
  for (let gy = 1; gy < gh; gy++) {
    for (let x = d.x; x < d.x + d.w; x++) s.wallN[idx(s.size, x, d.y + gy * 2)] = 1;
  }
  for (let gx = 1; gx < gw; gx++) {
    for (let y = d.y; y < d.y + d.h; y++) s.wallW[idx(s.size, d.x + gx * 2, y)] = 1;
  }
  const openN = (gx: number, gy: number) => {
    // Open the north boundary of coarse cell (gx,gy) across both fine cells.
    const fx = d.x + gx * 2;
    const fy = d.y + gy * 2;
    s.wallN[idx(s.size, fx, fy)] = 0;
    if (fx + 1 < d.x + d.w) s.wallN[idx(s.size, fx + 1, fy)] = 0;
  };
  const openW = (gx: number, gy: number) => {
    const fx = d.x + gx * 2;
    const fy = d.y + gy * 2;
    s.wallW[idx(s.size, fx, fy)] = 0;
    if (fy + 1 < d.y + d.h) s.wallW[idx(s.size, fx, fy + 1)] = 0;
  };
  const visited = new Uint8Array(gw * gh);
  const stack: [number, number][] = [];
  const sx = Math.floor(rnd() * gw);
  const sy = Math.floor(rnd() * gh);
  visited[sy * gw + sx] = 1;
  stack.push([sx, sy]);
  const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx >= 0 && nx < gw && ny >= 0 && ny < gh && !visited[ny * gw + nx];
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(rnd() * options.length)];
    const nx = cx + dx;
    const ny = cy + dy;
    if (dy === -1) openN(cx, cy);
    else if (dy === 1) openN(cx, ny);
    else if (dx === -1) openW(cx, cy);
    else openW(nx, cy);
    visited[ny * gw + nx] = 1;
    stack.push([nx, ny]);
  }
  // Braid a few coarse walls so the maze loops.
  const knocks = Math.floor(gw * gh * 0.08);
  for (let i = 0; i < knocks; i++) {
    const gx = 1 + Math.floor(rnd() * (gw - 1));
    const gy = 1 + Math.floor(rnd() * (gh - 1));
    if (rnd() < 0.5) openN(gx, gy);
    else openW(gx, gy);
  }
  // Clearings: small open rooms punched into the maze (breathing space, and
  // natural spots for loot/marks later).
  const clearings = 1 + Math.floor((d.w * d.h) / 900);
  for (let i = 0; i < clearings; i++) {
    const cw = 4 + Math.floor(rnd() * 3);
    const ch = 4 + Math.floor(rnd() * 3);
    const cx = d.x + 2 + Math.floor(rnd() * Math.max(1, d.w - cw - 4));
    const cy = d.y + 2 + Math.floor(rnd() * Math.max(1, d.h - ch - 4));
    clearRect(s, cx, cy, cw, ch);
  }
}

/** halls: long parallel corridors with periodic cuts — the marathon walk. */
function fillHalls(s: Sector, d: District, rnd: () => number): void {
  const horizontal = d.w >= d.h;
  const pitch = 4 + Math.floor(rnd() * 3); // corridor width 4-6
  if (horizontal) {
    for (let y = d.y + pitch; y < d.y + d.h - 1; y += pitch) {
      for (let x = d.x; x < d.x + d.w; x++) s.wallN[idx(s.size, x, y)] = 1;
      // Sparse cuts — the marathon feel needs LONG stretches between them.
      for (let x = d.x + 4; x < d.x + d.w - 1; x += 14 + Math.floor(rnd() * 11)) {
        s.wallN[idx(s.size, x, y)] = 0;
        if (rnd() < 0.4 && x + 1 < d.x + d.w) s.wallN[idx(s.size, x + 1, y)] = 0;
      }
    }
  } else {
    for (let x = d.x + pitch; x < d.x + d.w - 1; x += pitch) {
      for (let y = d.y; y < d.y + d.h; y++) s.wallW[idx(s.size, x, y)] = 1;
      for (let y = d.y + 4; y < d.y + d.h - 1; y += 14 + Math.floor(rnd() * 11)) {
        s.wallW[idx(s.size, x, y)] = 0;
        if (rnd() < 0.4 && y + 1 < d.y + d.h) s.wallW[idx(s.size, x, y + 1)] = 0;
      }
    }
  }
}

/** atrium: the plan is nearly empty on purpose — an enormous room whose SHAPE
 *  is its height (see shapeHeights): sunken floor, gallery ring, four ramps.
 *  A colonnade marks where the gallery's edge runs so the drop reads. */
function fillAtrium(s: Sector, d: District, rnd: () => number): void {
  clearRect(s, d.x, d.y, d.w, d.h);
  const gal = 4;
  const step = 3 + Math.floor(rnd() * 2);
  for (let x = d.x + gal; x < d.x + d.w - gal; x += step) {
    for (const y of [d.y + gal, d.y + d.h - gal - 1]) {
      if (rnd() < 0.75) s.solid[idx(s.size, x, y)] = 1;
    }
  }
  for (let y = d.y + gal; y < d.y + d.h - gal; y += step) {
    for (const x of [d.x + gal, d.x + d.w - gal - 1]) {
      if (rnd() < 0.75) s.solid[idx(s.size, x, y)] = 1;
    }
  }
}

/** terraces: the hill. Mostly open so the slope is legible, with low cross
 *  walls at some band edges — a retaining wall you walk around. */
function fillTerraces(s: Sector, d: District, rnd: () => number): void {
  clearRect(s, d.x, d.y, d.w, d.h);
  const along = d.w >= d.h;
  const band = 6 + Math.floor(rnd() * 4);
  if (along) {
    for (let x = d.x + band; x < d.x + d.w - 2; x += band) {
      if (rnd() < 0.5) continue;
      for (let y = d.y; y < d.y + d.h; y++) s.wallW[idx(s.size, x, y)] = 1;
      // Gaps you can walk through — never a sealed band.
      for (let g = 0; g < 2 + Math.floor(rnd() * 2); g++) {
        const gy = d.y + 1 + Math.floor(rnd() * Math.max(1, d.h - 2));
        s.wallW[idx(s.size, x, gy)] = 0;
        if (gy + 1 < d.y + d.h) s.wallW[idx(s.size, x, gy + 1)] = 0;
      }
    }
  } else {
    for (let y = d.y + band; y < d.y + d.h - 2; y += band) {
      if (rnd() < 0.5) continue;
      for (let x = d.x; x < d.x + d.w; x++) s.wallN[idx(s.size, x, y)] = 1;
      for (let g = 0; g < 2 + Math.floor(rnd() * 2); g++) {
        const gx = d.x + 1 + Math.floor(rnd() * Math.max(1, d.w - 2));
        s.wallN[idx(s.size, gx, y)] = 0;
        if (gx + 1 < d.x + d.w) s.wallN[idx(s.size, gx + 1, y)] = 0;
      }
    }
  }
}

/** sublevel: down the ramp, the rooms get tighter and the ceiling presses —
 *  offices logic at a smaller grain, so it reads as a basement of the level
 *  above rather than more of the same. */
function fillSublevel(s: Sector, d: District, rnd: () => number): void {
  fillOffices(s, d, rnd);
  // Then punch a few larger vaults so it isn't wall-to-wall cubicles.
  const vaults = 1 + Math.floor((d.w * d.h) / 1400);
  for (let i = 0; i < vaults; i++) {
    const vw = 5 + Math.floor(rnd() * 5);
    const vh = 5 + Math.floor(rnd() * 5);
    const vx = d.x + 2 + Math.floor(rnd() * Math.max(1, d.w - vw - 4));
    const vy = d.y + 2 + Math.floor(rnd() * Math.max(1, d.h - vh - 4));
    clearRect(s, vx, vy, vw, vh);
  }
}

// Partial: the Poolrooms district types fill in worldgen-pools.ts, not here.
const FILLS: Partial<Record<DistrictType, (s: Sector, d: District, rnd: () => number) => void>> = {
  classic: fillClassic,
  pillars: fillPillars,
  offices: fillOffices,
  warrens: fillWarrens,
  halls: fillHalls,
  atrium: fillAtrium,
  terraces: fillTerraces,
  sublevel: fillSublevel,
};

// ---- Mixing pockets --------------------------------------------------------
// "Mix together some of the areas" (Josh, map review round 1): patches of one
// district type spliced into another — a stand of pillars inside the yellow
// rooms, a run of offices breaking a hall, a pocket maze in a pillar field.
// Pockets are placed anywhere, INCLUDING across district borders, which also
// erases the razor-straight quilt seams where they land.

function mixPockets(s: Sector, rnd: () => number): void {
  const TYPES: DistrictType[] = ["classic", "pillars", "offices", "warrens", "halls"];
  const count = 12 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const w = 8 + Math.floor(rnd() * 8);
    const h = 8 + Math.floor(rnd() * 8);
    const x = 4 + Math.floor(rnd() * (s.size - w - 8));
    const y = 4 + Math.floor(rnd() * (s.size - h - 8));
    // Pick a type DIFFERENT from what dominates the patch.
    const centerDistrict = s.districts[s.district[idx(s.size, x + (w >> 1), y + (h >> 1))]];
    const options = TYPES.filter((t) => t !== centerDistrict?.type);
    const type = options[Math.floor(rnd() * options.length)];
    // Flatten the patch (interior walls + solids), then re-fill as the new
    // type. Exactly TWO openings on random sides — a pocket weaves into its
    // surroundings without becoming a junction (the first pass opened every
    // side and the sector's depth collapsed by a third).
    clearRect(s, x, y, w, h);
    FILLS[type]!(s, { id: centerDistrict?.id ?? 0, type, x, y, w, h }, rnd);
    const sides: ("N" | "S" | "E" | "W")[] = ["N", "S", "E", "W"];
    for (let p = 0; p < 2; p++) {
      const side = sides.splice(Math.floor(rnd() * sides.length), 1)[0];
      punchDoor(s, x, y, w, h, side, rnd, 1 + (rnd() < 0.4 ? 1 : 0));
    }
    // Recolor the patch for the map (and for per-district ambience later):
    // adopt the id of some district of the new type, if one exists.
    const donor = s.districts.find((d) => d.type === type);
    if (donor) {
      for (let cy = y; cy < y + h; cy++) {
        for (let cx = x; cx < x + w; cx++) {
          s.district[idx(s.size, cx, cy)] = donor.id & 0xff;
        }
      }
    }
  }
}

// ---- Landmarks -------------------------------------------------------------
// Hand-authored set-pieces the generator stamps over whatever was there.
// These are the navigation anchors ("meet at the Red Door") — visually
// distinct in 3D later; on the map they render as named, tinted rooms.

interface LandmarkTemplate {
  name: string;
  w: number;
  h: number;
  stamp: (s: Sector, x: number, y: number, rnd: () => number) => void;
}

export const clearRect = (s: Sector, x: number, y: number, w: number, h: number): void => {
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) {
      s.solid[idx(s.size, cx, cy)] = 0;
      if (cy > y) s.wallN[idx(s.size, cx, cy)] = 0;
      if (cx > x) s.wallW[idx(s.size, cx, cy)] = 0;
    }
  }
};

const LANDMARK_TEMPLATES: LandmarkTemplate[] = [
  {
    name: "The Red Door",
    w: 9,
    h: 9,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 9, 9);
      wallRect(s, x, y, 9, 9);
      // One entrance only — the door itself. (It doesn't open. Yet.)
      s.wallN[idx(s.size, x + 4, y + 9 < s.size ? y + 9 : y)] = 0;
    },
  },
  {
    name: "Pillar Garden",
    w: 13,
    h: 13,
    stamp: (s, x, y, rnd) => {
      clearRect(s, x, y, 13, 13);
      // A dense ceremonial pillar ring with a bare center.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const px = x + 6 + Math.round(Math.cos(a) * 4.5);
        const py = y + 6 + Math.round(Math.sin(a) * 4.5);
        s.solid[idx(s.size, px, py)] = 1;
      }
      void rnd;
    },
  },
  {
    name: "The Long Table",
    w: 16,
    h: 7,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 16, 7);
      wallRect(s, x, y, 16, 7);
      for (let cx = x + 2; cx < x + 14; cx++) s.solid[idx(s.size, cx, y + 3)] = 1;
      punchDoor(s, x, y, 16, 7, "N", () => 0.5, 2);
      punchDoor(s, x, y, 16, 7, "S", () => 0.5, 2);
    },
  },
  {
    name: "The Basin",
    w: 11,
    h: 11,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 11, 11);
      // A sunken square (floor detail in 3D; on the map, an open plaza with
      // corner posts).
      s.solid[idx(s.size, x + 1, y + 1)] = 1;
      s.solid[idx(s.size, x + 9, y + 1)] = 1;
      s.solid[idx(s.size, x + 1, y + 9)] = 1;
      s.solid[idx(s.size, x + 9, y + 9)] = 1;
    },
  },
  {
    name: "Static Row",
    w: 15,
    h: 5,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 15, 5);
      wallRect(s, x, y, 15, 5);
      // Cubicle teeth along both long sides.
      for (let cx = x + 2; cx < x + 13; cx += 3) {
        s.wallW[idx(s.size, cx, y)] = 1;
        s.wallW[idx(s.size, cx, y + 4)] = 1;
      }
      punchDoor(s, x, y, 15, 5, "W", () => 0.5);
      punchDoor(s, x, y, 15, 5, "E", () => 0.5);
    },
  },
  {
    name: "The Switchback",
    w: 10,
    h: 10,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 10, 10);
      // A serpentine — three baffle walls.
      for (let cx = x; cx < x + 7; cx++) s.wallN[idx(s.size, cx, y + 3)] = 1;
      for (let cx = x + 3; cx < x + 10; cx++) s.wallN[idx(s.size, cx, y + 6)] = 1;
      for (let cx = x; cx < x + 7; cx++) s.wallN[idx(s.size, cx, y + 9 < s.size ? y + 9 : y)] = 0;
    },
  },
  {
    name: "The Hollow",
    w: 14,
    h: 14,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 14, 14);
      // A vast empty room. That's it. That's the landmark. (In 3D: the hum
      // stops here.)
    },
  },
  {
    name: "Court of Columns",
    w: 12,
    h: 12,
    stamp: (s, x, y) => {
      clearRect(s, x, y, 12, 12);
      for (let cy = y + 2; cy < y + 11; cy += 3) {
        for (let cx = x + 2; cx < x + 11; cx += 3) {
          s.solid[idx(s.size, cx, cy)] = 1;
        }
      }
    },
  },
];

// ---- VERTICALITY (v2) ------------------------------------------------------
// Order matters, and it's the order that keeps the world honest:
//   1. shapeHeights   — each district grades its own floor. Deliberate cliffs
//                       (atrium galleries) are PROTECTED, because the fill that
//                       makes them also builds the ramp that serves them.
//   2. smoothSlopes   — every unprotected adjacency is filed down to ≤1 step,
//                       so accidental cliffs simply cannot exist.
//   3. carvePits      — the lethal shafts, dug AFTER smoothing so nothing
//                       fills them back in.
//   4. regradeStranded— the safety net: if anything ended up climb-unreachable,
//                       grade it back into reach. Validation then asserts zero
//                       stranded cells, so a soft-lock can't ship.

/** Cells whose height the smoothing pass must not touch (built cliffs). */
export type Protected = Set<number>;

function shapeHeights(s: Sector, rnd: () => number, keep: Protected): void {
  const size = s.size;
  const setH = (x: number, y: number, h: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    s.floor[idx(size, x, y)] = Math.max(-120, Math.min(120, Math.round(h)));
  };
  for (const d of s.districts) {
    if (d.type === "sublevel") {
      // The whole district sits low. Its rim gets a graded ramp so you walk
      // down into it rather than falling.
      const depth = 3 + Math.floor(rnd() * 3); // 1.5m – 2.5m down
      const RAMP = depth + 1; // cells of run for the grade
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) {
          const edge = Math.min(x - d.x, y - d.y, d.x + d.w - 1 - x, d.y + d.h - 1 - y);
          setH(x, y, edge >= RAMP ? -depth : -Math.round((edge / RAMP) * depth));
        }
      }
    } else if (d.type === "terraces") {
      // A slow hill: bands of one step, running along the district's long axis,
      // with a jittered band width so it never reads as stairs.
      const along = d.w >= d.h;
      const band = 4 + Math.floor(rnd() * 5);
      const dir = rnd() < 0.5 ? 1 : -1;
      const span = along ? d.w : d.h;
      const levels = Math.min(7, Math.floor(span / band));
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) {
          const t = along ? x - d.x : y - d.y;
          const step = Math.min(levels, Math.floor(t / band));
          setH(x, y, dir * step);
        }
      }
    } else if (d.type === "atrium") {
      // The set-piece: a sunken centre, a raised gallery ring around it, and
      // ramps cut through the gallery so the middle is reachable. The gallery's
      // inner edge is a deliberate CLIFF you can drop off (survivable) — it's
      // protected from smoothing, and safe because the ramps exist.
      const gal = 4 + Math.floor(rnd() * 3); // gallery depth in cells
      const up = 3 + Math.floor(rnd() * 2); // gallery height, steps
      const sink = 1 + Math.floor(rnd() * 2); // how far the centre drops
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) {
          const edge = Math.min(x - d.x, y - d.y, d.x + d.w - 1 - x, d.y + d.h - 1 - y);
          if (edge < gal) {
            setH(x, y, up);
            keep.add(idx(size, x, y));
          } else {
            setH(x, y, -sink);
            keep.add(idx(size, x, y));
          }
        }
      }
      // Four ramps, one per side, cut from the gallery down to the floor.
      const cx = d.x + (d.w >> 1);
      const cy = d.y + (d.h >> 1);
      const run = up + sink + 1;
      for (const [dx, dy, sx, sy] of [
        [0, 1, cx, d.y + gal - 1],
        [0, -1, cx, d.y + d.h - gal],
        [1, 0, d.x + gal - 1, cy],
        [-1, 0, d.x + d.w - gal, cy],
      ] as [number, number, number, number][]) {
        for (let i = 0; i <= run; i++) {
          const gx = sx + dx * i;
          const gy = sy + dy * i;
          const h = up - Math.round((i / run) * (up + sink));
          for (const wide of [-1, 0, 1]) {
            const px = dx === 0 ? gx + wide : gx;
            const py = dy === 0 ? gy + wide : gy;
            setH(px, py, h);
            keep.delete(idx(size, px, py)); // a ramp IS smoothable
          }
        }
      }
    } else if (rnd() < 0.35) {
      // Everywhere else: a gentle, mostly-flat drift so "flat" isn't a rule.
      // One or two steps across a whole district — you feel it more than see it.
      const amp = rnd() < 0.6 ? 1 : 2;
      const along = rnd() < 0.5;
      const span = Math.max(1, along ? d.w : d.h);
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) {
          const t = (along ? x - d.x : y - d.y) / span;
          setH(x, y, Math.round(t * amp) - (amp >> 1));
        }
      }
    }
  }
}

/** File every unprotected adjacency down to at most one step. Repeats until
 *  stable, so it cannot leave an accidental cliff behind.
 *
 *  PITS ARE EXEMPT, and that exemption is load-bearing: a shaft is nothing but
 *  a deliberate cliff, so an earlier version of this pass — run again after the
 *  shafts were dug — quietly filled every one of them back in and the map
 *  shipped with a single pit instead of fourteen. */
export function smoothSlopes(s: Sector, keep: Protected): number {
  const size = s.size;
  let passes = 0;
  for (let guard = 0; guard < 64; guard++) {
    let changed = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = idx(size, x, y);
        if (s.solid[i] || keep.has(i) || isPitCell(s, x, y)) continue;
        const here = s.floor[i];
        for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as [number, number][]) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = idx(size, nx, ny);
          if (s.solid[ni] || isPitCell(s, nx, ny)) continue; // never fill a shaft
          const there = s.floor[ni];
          // Only ever move toward the neighbour, and only if the gap is a
          // cliff. Raising the low side is what turns a step into a ramp.
          if (there - here > 1) {
            s.floor[i] = there - 1;
            changed++;
            break;
          }
          if (here - there > 1 && !keep.has(ni)) {
            s.floor[ni] = here - 1;
            changed++;
          }
        }
      }
    }
    passes++;
    if (!changed) break;
  }
  return passes;
}

/** The lethal shafts. Dug after smoothing, deep enough to be certain death,
 *  and only where you can SEE them coming: open district types, never in the
 *  warrens (a blind maze corner that kills is just cruel), never near an
 *  entrance, and never touching a landmark. */
function carvePits(s: Sector, rnd: () => number): { x: number; y: number; w: number; h: number }[] {
  const size = s.size;
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const want = Math.max(6, Math.round((size * size) / 9000)); // ~14 at 362²
  const OPEN: DistrictType[] = ["pillars", "halls", "atrium", "classic", "terraces"];
  for (let tries = 0; tries < 8000 && out.length < want; tries++) {
    const w = 2 + Math.floor(rnd() * 3);
    const h = 2 + Math.floor(rnd() * 3);
    const x = 2 + Math.floor(rnd() * (size - w - 4));
    const y = 2 + Math.floor(rnd() * (size - h - 4));
    const d = s.districts[s.district[idx(size, x, y)]];
    if (!d || !OPEN.includes(d.type)) continue;
    // Clear of the entrances, and of anything already dug.
    if (s.doors.some((dr) => Math.hypot(dr.x - x, dr.y - y) < 30)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 14)) continue;
    // The footprint plus a one-cell rim must be plain open floor at one level:
    // a pit needs a lip you can stand on and see over.
    let okSpot = true;
    let rimH: number | null = null;
    for (let yy = y - 1; yy <= y + h && okSpot; yy++) {
      for (let xx = x - 1; xx <= x + w && okSpot; xx++) {
        const i = idx(size, xx, yy);
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) okSpot = false;
        else if (s.solid[i] || s.landmark[i]) okSpot = false;
        else if (rimH === null) rimH = s.floor[i];
        else if (Math.abs(s.floor[i] - rimH) > 1) okSpot = false;
      }
    }
    if (!okSpot || rimH === null) continue;
    // Dig. Deeper than PIT_LETHAL by a margin, so a full-health fall is fatal
    // however the damage curve is later tuned.
    const depth = rimH - (PIT_LETHAL + 2 + Math.floor(rnd() * 6));
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = idx(size, xx, yy);
        s.floor[i] = Math.max(-120, depth);
        // Open the shaft: no walls inside it, and none on its lip either, or
        // you'd get an invisible barrier where a hole should be.
        s.wallN[i] = 0;
        s.wallW[i] = 0;
        if (xx + 1 < size) s.wallW[idx(size, xx + 1, yy)] = 0;
        if (yy + 1 < size) s.wallN[idx(size, xx, yy + 1)] = 0;
      }
    }
    out.push({ x, y, w, h });
  }
  return out;
}

// SCENERY (balconies + far lips) was REMOVED July 2026 on Josh's call: "remove
// the out of bounds stuff, i think that is causing glitches". He was right, and
// the reason is instructive. The pass sealed each scenery room with walls — but
// connectAll() runs AFTERWARDS and carves connections wherever it needs them,
// happily punching straight through those seals. 204 of the 333 scenery cells
// ended up with NO wall between them and walkable floor, so you could stand at
// the edge and look into a room that had a floor and a ceiling, no wall, no
// collider drawn, and a floor at a different height with nothing closing the
// gap. Those were the dark voids in his screenshots.
//
// The `background` array survives, always zero, so the wire format and every
// client/server check stay exactly as they were. Nothing plants into it now.

/** EVERY DOOR MUST OPEN ONTO THE WHOLE WORLD.
 *
 *  connectAll and regradeStranded both flood from ALL FOUR doors at once, and
 *  that union hides the one failure that ruins a run: a door whose own pocket
 *  is sealed off from everything else. Every cell in the pocket is "reached"
 *  (by that door), every cell outside is "reached" (by the other three), so
 *  both passes and the old validator declared the map 100% connected — while
 *  seed 700001 quietly put Door II in a 28-cell closet. Walk through it and
 *  you are trapped in a cupboard with no way out and no way back.
 *
 *  So each door is checked ALONE against the largest component, and any door
 *  that misses gets a corridor cut to it: walls removed along the route and the
 *  floor regraded to a legal ramp, since the isolation can be either. */
export function connectDoors(s: Sector, avoid?: Set<number>): number {
  const size = s.size;
  let carved = 0;
  // `avoid`: cells a rescue corridor must ROUTE AROUND (the Poolrooms passes
  // its protected pool geometry — a carved path regrades floors to its goal
  // height, which flattened 26 rows of canal straight through a water basin).
  const openCell = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && !s.solid[idx(size, x, y)] &&
    !isPitCell(s, x, y) && !avoid?.has(idx(size, x, y));

  for (let round = 0; round < 8; round++) {
    // Each door's own reach, alone.
    const reach = s.doors.map((d) => distanceMap(s, [{ x: d.x, y: d.y }]));
    const counts = reach.map((r) => r.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0));
    const main = counts.indexOf(Math.max(...counts));
    const stragglers = counts.map((c, i) => [c, i]).filter(([c]) => c < counts[main] / 2);
    if (!stragglers.length) return carved;

    for (const [, di] of stragglers) {
      const d = s.doors[di];
      // Route to the nearest cell of the main component, ignoring walls and
      // heights — this is the line we are about to MAKE walkable.
      const prev = new Int32Array(size * size).fill(-2);
      const start = idx(size, d.x, d.y);
      prev[start] = -1;
      const queue = [start];
      let target = -1;
      for (let head = 0; head < queue.length && target < 0; head++) {
        const c = queue[head];
        const cx = c % size;
        const cy = (c / size) | 0;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!openCell(nx, ny)) continue;
          const ni = idx(size, nx, ny);
          if (prev[ni] !== -2) continue;
          prev[ni] = c;
          if (reach[main][ni] >= 0) {
            target = ni;
            break;
          }
          queue.push(ni);
        }
      }
      if (target < 0) continue; // nothing to join to — next round will retry
      const path: number[] = [];
      for (let c = target; c !== -1; c = prev[c]) path.push(c);
      path.reverse();
      // Open the route and grade it so every step is a legal stride.
      const goal = s.floor[target];
      for (let k = 0; k < path.length; k++) {
        const c = path[k];
        const x = c % size;
        const y = (c / size) | 0;
        // Walk the height toward the target one step at a time; the tail of a
        // long path simply sits at the target height.
        const want = Math.max(-(PIT_LETHAL - 1), Math.min(goal, s.floor[path[0]] + Math.sign(goal - s.floor[path[0]]) * k));
        s.floor[c] = goal >= s.floor[path[0]] ? Math.min(want, goal) : Math.max(want, goal);
        if (k === 0) continue;
        const p = path[k - 1];
        const px = p % size;
        const py = (p / size) | 0;
        if (y === py - 1) s.wallN[idx(size, px, py)] = 0;
        else if (y === py + 1) s.wallN[c] = 0;
        else if (x === px - 1) s.wallW[idx(size, px, py)] = 0;
        else if (x === px + 1) s.wallW[c] = 0;
        carved++;
      }
    }
  }
  return carved;
}

/** THE SAFETY NET. Anything not climb-reachable from the doors gets graded
 *  back into reach: raise or lower it toward its best-connected neighbour
 *  until the climb rule lets you in. Pits are exempt — they're supposed to be
 *  one-way. Returns how many cells it had to touch (0 is the goal). */
export function regradeStranded(s: Sector): number {
  let touched = 0;
  for (let round = 0; round < 40; round++) {
    const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    let fixedAny = false;
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const i = idx(s.size, x, y);
        if (s.solid[i] || dist[i] >= 0 || isPitCell(s, x, y)) continue;
        // Stranded. Find a reachable neighbour we could step to if the height
        // agreed, and match it. If every neighbour is SOLID, dig one out —
        // otherwise a lone open cell walled in by pillars can never be fixed
        // by regrading alone, which is exactly the residue an earlier version
        // left behind.
        let opened = false;
        for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as [number, number][]) {
          if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
          const ni = idx(s.size, nx, ny);
          if (!s.solid[ni] || isPitCell(s, nx, ny)) continue;
          // Is there anything reachable on the far side of this pillar?
          const bx = nx + (nx - x);
          const by = ny + (ny - y);
          if (bx < 0 || by < 0 || bx >= s.size || by >= s.size) continue;
          const bi = idx(s.size, bx, by);
          if (s.solid[bi] || dist[bi] < 0) continue;
          s.solid[ni] = 0; // dig the pillar out
          s.floor[ni] = s.floor[bi];
          opened = true;
          touched++;
          fixedAny = true;
          break;
        }
        if (opened) continue;
        for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as [number, number][]) {
          if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
          const ni = idx(s.size, nx, ny);
          if (s.solid[ni] || dist[ni] < 0 || isPitCell(s, nx, ny)) continue;
          // Is there even a doorway between us? If not, knock it — that's the
          // old connectAll behaviour, and it's still correct here.
          if (ny === y - 1 && s.wallN[i]) s.wallN[i] = 0;
          else if (ny === y + 1 && s.wallN[ni]) s.wallN[ni] = 0;
          else if (nx === x - 1 && s.wallW[i]) s.wallW[i] = 0;
          else if (nx === x + 1 && s.wallW[ni]) s.wallW[ni] = 0;
          s.floor[i] = s.floor[ni]; // flush with its way in
          touched++;
          fixedAny = true;
          break;
        }
      }
    }
    if (!fixedAny) break;
  }
  // Last resort: anything STILL unreachable is FILLED IN — it becomes solid
  // rock. It used to become scenery, which was the wrong answer twice over: a
  // sealed room is only "scenery" if you can see it, and an unreachable cell
  // left open is a hole in the world that the renderer draws a floor into and
  // no wall around. Solid rock is honest, is drawn as a closed box, and cannot
  // be seen into or fallen into. Nothing reachable can be cut off by this,
  // because by definition nothing could reach it.
  {
    const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const i = idx(s.size, x, y);
        if (s.solid[i] || dist[i] >= 0 || isPitCell(s, x, y)) continue;
        s.solid[i] = 1;
        touched++;
      }
    }
  }
  return touched;
}

/** Spread landmarks with best-candidate sampling (max-min distance). */
function placeLandmarks(s: Sector, rnd: () => number): void {
  const placed: { x: number; y: number }[] = [];
  // The frozen 256² world stamps exactly 8 (that number is part of its
  // fingerprint). A bigger sector scales with AREA and reuses templates once
  // the list runs out — landmark DENSITY is what makes a place navigable, and
  // 8 anchors spread over twice the floor would be no anchors at all.
  const count =
    s.size >= VERTICAL_FROM
      ? Math.round(8 * ((s.size * s.size) / (256 * 256)))
      : Math.min(LANDMARK_TEMPLATES.length, 8);
  for (let i = 0; i < count; i++) {
    const t = LANDMARK_TEMPLATES[i % LANDMARK_TEMPLATES.length];
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let c = 0; c < 24; c++) {
      const x = 8 + Math.floor(rnd() * (s.size - t.w - 16));
      const y = 8 + Math.floor(rnd() * (s.size - t.h - 16));
      const score = placed.length
        ? Math.min(...placed.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2))
        : Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (!best) continue;
    t.stamp(s, best.x, best.y, rnd);
    const id = s.landmarks.length + 1;
    // A repeated template gets a COMPASS name, not a number: landmarks exist to
    // be navigated by and talked about ("meet me at the North Drain"), and
    // "The Drain 2" is not a place anyone can find.
    let name = t.name;
    if (s.landmarks.some((l) => l.name === t.name)) {
      const half = s.size / 2;
      const ns = best.y < half ? "North" : "South";
      const ew = best.x < half ? "West" : "East";
      const quad = `${ns} ${ew}`;
      name = `${t.name} — ${quad}`;
      let n = 2;
      while (s.landmarks.some((l) => l.name === name)) name = `${t.name} — ${quad} ${n++}`;
    }
    s.landmarks.push({ id, name, x: best.x, y: best.y, w: t.w, h: t.h });
    for (let cy = best.y; cy < best.y + t.h; cy++) {
      for (let cx = best.x; cx < best.x + t.w; cx++) {
        s.landmark[idx(s.size, cx, cy)] = id;
      }
    }
    placed.push(best);
  }
}

// ---- Doors (the four lobby entry points) -----------------------------------

function placeDoors(s: Sector, rnd: () => number): void {
  const mid = () => Math.floor(s.size * (0.35 + rnd() * 0.3));
  const doors: Door[] = [
    { x: mid(), y: 0, edge: "N", name: "Door I — North Stair" },
    { x: s.size - 1, y: mid(), edge: "E", name: "Door II — Freight Lift" },
    { x: mid(), y: s.size - 1, edge: "S", name: "Door III — Flood Drain" },
    { x: 0, y: mid(), edge: "W", name: "Door IV — Maintenance Hatch" },
  ];
  // Clear a small arrival room at each door so you spawn in a space, not a wall.
  for (const d of doors) {
    const ax = Math.max(0, Math.min(s.size - 5, d.x - 2));
    const ay = Math.max(0, Math.min(s.size - 5, d.y - 2));
    clearRect(s, ax, ay, 5, 5);
  }
  s.doors = doors;
}

// ---- Connectivity ----------------------------------------------------------

/** Walkable-neighbor test: within bounds, both open, no wall between — AND the
 *  climb rule (|Δheight| ≤ 1 both ways). This is the definition of "reachable
 *  on foot without falling", so distanceMap and every reachability guarantee
 *  in this file account for verticality. Background scenery is excluded: it's
 *  sealed on purpose. */
/** Every cell you can walk to from (x,y) in one step (walls and the climb rule). */
export function neighbors(s: Sector, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  const i = idx(s.size, x, y);
  // The EFFECTIVE floor when the sector has one (wet worlds): a swimmer
  // floats at the surface, so deep water is walkable-through and its quay
  // edges are climbable-out. Dry sectors read raw floor, bit for bit.
  const F = s.eff ?? s.floor;
  const here = F[i];
  const can = (nx: number, ny: number): boolean => {
    const ni = idx(s.size, nx, ny);
    return !s.solid[ni] && !s.background[ni] && heightWalkable(here, F[ni]);
  };
  if (y > 0 && !s.wallN[i] && can(x, y - 1)) out.push([x, y - 1]);
  if (y < s.size - 1 && !s.wallN[idx(s.size, x, y + 1)] && can(x, y + 1)) out.push([x, y + 1]);
  if (x > 0 && !s.wallW[i] && can(x - 1, y)) out.push([x - 1, y]);
  if (x < s.size - 1 && !s.wallW[idx(s.size, x + 1, y)] && can(x + 1, y)) out.push([x + 1, y]);
  return out;
}

/** BFS distance map from a set of sources (-1 = unreached). */
export function distanceMap(s: Sector, sources: { x: number; y: number }[]): Int32Array {
  const dist = new Int32Array(s.size * s.size).fill(-1);
  const qx = new Int32Array(s.size * s.size);
  const qy = new Int32Array(s.size * s.size);
  let head = 0;
  let tail = 0;
  for (const src of sources) {
    const i = idx(s.size, src.x, src.y);
    if (s.solid[i]) continue;
    dist[i] = 0;
    qx[tail] = src.x;
    qy[tail] = src.y;
    tail++;
  }
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    const d = dist[idx(s.size, x, y)];
    for (const [nx, ny] of neighbors(s, x, y)) {
      const ni = idx(s.size, nx, ny);
      if (dist[ni] === -1) {
        dist[ni] = d + 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
  }
  return dist;
}

/** Stitch every walkable region into ONE component: repeatedly find an
 *  unreached open cell adjacent (through a wall) to a reached one and knock
 *  that wall. Guarantees the fully-explorable contract. */
export function connectAll(s: Sector): number {
  let knocked = 0;
  for (;;) {
    const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    let fixed = false;
    for (let y = 0; y < s.size && !fixed; y++) {
      for (let x = 0; x < s.size && !fixed; x++) {
        const i = idx(s.size, x, y);
        if (s.solid[i] || dist[i] !== -1) continue;
        // Unreached open cell — probe the four walls for a reached neighbor.
        if (y > 0 && s.wallN[i] && !s.solid[idx(s.size, x, y - 1)] && dist[idx(s.size, x, y - 1)] >= 0) {
          s.wallN[i] = 0;
          fixed = true;
        } else if (x > 0 && s.wallW[i] && !s.solid[idx(s.size, x - 1, y)] && dist[idx(s.size, x - 1, y)] >= 0) {
          s.wallW[i] = 0;
          fixed = true;
        } else if (y < s.size - 1 && s.wallN[idx(s.size, x, y + 1)] && !s.solid[idx(s.size, x, y + 1)] && dist[idx(s.size, x, y + 1)] >= 0) {
          s.wallN[idx(s.size, x, y + 1)] = 0;
          fixed = true;
        } else if (x < s.size - 1 && s.wallW[idx(s.size, x + 1, y)] && !s.solid[idx(s.size, x + 1, y)] && dist[idx(s.size, x + 1, y)] >= 0) {
          s.wallW[idx(s.size, x + 1, y)] = 0;
          fixed = true;
        }
      }
    }
    if (!fixed) {
      // No wall-adjacent fix found. Any remaining unreached cells are sealed
      // behind solids (pillar-locked pockets) — open them by clearing one
      // adjacent solid; if none remain unreached, we're done.
      const dist2 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
      let cleared = false;
      for (let y = 0; y < s.size && !cleared; y++) {
        for (let x = 0; x < s.size && !cleared; x++) {
          const i = idx(s.size, x, y);
          if (s.solid[i] || dist2[i] !== -1) continue;
          for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as [number, number][]) {
            if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
            const ni = idx(s.size, nx, ny);
            if (s.solid[ni]) {
              s.solid[ni] = 0;
              cleared = true;
              break;
            }
          }
        }
      }
      if (!cleared) break;
    }
    knocked++;
    if (knocked > 5000) break; // safety valve — validation will catch it
  }
  return knocked;
}

// ---- Inter-district doorways ----------------------------------------------
// District fills wall their own borders; make sure every shared border has
// gaps so districts flow into each other in multiple places.

function connectDistricts(s: Sector, rnd: () => number): void {
  // Stingy borders: ~70% of frontiers get ONE direct doorway, long ones
  // sometimes a second — and some get NONE (you go around, or through a
  // mixing pocket that straddles the seam). The pockets pass adds crossings
  // of its own, so the base allotment stays low to protect depth; connectAll
  // guarantees nothing can actually seal.
  for (const d of s.districts) {
    // South border with whatever lies below.
    if (d.y + d.h < s.size) {
      const gaps = (rnd() < 0.7 ? 1 : 0) + (d.w > 48 && rnd() < 0.4 ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const x = d.x + 2 + Math.floor(rnd() * Math.max(1, d.w - 4));
        s.wallN[idx(s.size, x, d.y + d.h)] = 0;
        if (rnd() < 0.5 && x + 1 < d.x + d.w) s.wallN[idx(s.size, x + 1, d.y + d.h)] = 0;
      }
    }
    // East border with whatever lies right.
    if (d.x + d.w < s.size) {
      const gaps = (rnd() < 0.7 ? 1 : 0) + (d.h > 48 && rnd() < 0.4 ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const y = d.y + 2 + Math.floor(rnd() * Math.max(1, d.h - 4));
        s.wallW[idx(s.size, d.x + d.w, y)] = 0;
        if (rnd() < 0.5 && y + 1 < d.y + d.h) s.wallW[idx(s.size, d.x + d.w, y + 1)] = 0;
      }
    }
  }
}

// ---- The generator ---------------------------------------------------------

export function generateSector(seed: number, size = 256): Sector {
  const s: Sector = {
    seed,
    size,
    wallN: new Uint8Array(size * size),
    wallW: new Uint8Array(size * size),
    solid: new Uint8Array(size * size),
    floor: new Int8Array(size * size),
    background: new Uint8Array(size * size),
    district: new Uint8Array(size * size),
    landmark: new Uint8Array(size * size),
    districts: [],
    landmarks: [],
    doors: [],
  };

  // 1. Districts.
  s.districts = partition(size, rngFor(seed, "districts"));
  for (const d of s.districts) {
    for (let y = d.y; y < d.y + d.h; y++) {
      for (let x = d.x; x < d.x + d.w; x++) {
        s.district[idx(size, x, y)] = d.id & 0xff;
      }
    }
  }

  // 2. District border walls, then per-type interiors.
  for (const d of s.districts) wallRect(s, d.x, d.y, d.w, d.h);
  for (const d of s.districts) FILLS[d.type]!(s, d, rngFor(seed, `fill:${d.id}`));

  // 3. Doorways between districts.
  connectDistricts(s, rngFor(seed, "connect"));

  // 3b. Mixing pockets — splice patches of one type into another (and across
  //     seams), so the quilt reads as one continuous, varied place.
  mixPockets(s, rngFor(seed, "pockets"));

  // 4. Landmarks stamp over everything.
  placeLandmarks(s, rngFor(seed, "landmarks"));

  // 5. Entry doors + arrival rooms.
  placeDoors(s, rngFor(seed, "doors"));

  // 5b. VERTICALITY (v2, flat worlds skip it entirely — see VERTICAL_FROM).
  //     Order is the guarantee: grade, file the accidental cliffs off, dig the
  //     shafts, plant the scenery, then let connectivity and the safety net
  //     prove nobody is stranded.
  if (size >= VERTICAL_FROM) {
    const keep: Protected = new Set();
    shapeHeights(s, rngFor(seed, "heights"), keep);
    smoothSlopes(s, keep);
    carvePits(s, rngFor(seed, "pits"));
    // Entrances stay flat and safe: no ramp, cliff or shaft in an arrival room.
    for (const d of s.doors) {
      for (let y = d.y - 3; y <= d.y + 3; y++) {
        for (let x = d.x - 3; x <= d.x + 3; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          s.floor[idx(size, x, y)] = 0;
          s.background[idx(size, x, y)] = 0;
        }
      }
    }
    smoothSlopes(s, keep); // re-file whatever the flattened aprons just broke
  }

  // 6. Guarantee: every open cell reachable from every door.
  connectAll(s);
  // Per-door, not the union — the union is what let seed 700001 ship a door
  // opening into a sealed closet (see connectDoors).
  connectDoors(s);
  if (size >= VERTICAL_FROM) regradeStranded(s); // heights can strand what walls can't
  connectDoors(s); // regrading can isolate a door too; prove it again after

  // 7. The outer boundary is absolute (Sector A's frontier — future sectors
  //    open it from the far side).
  for (let x = 0; x < size; x++) s.wallN[idx(size, x, 0)] = 1;
  for (let y = 0; y < size; y++) s.wallW[idx(size, 0, y)] = 1;

  return s;
}

// ---- Validation ------------------------------------------------------------

export interface SectorReport {
  size: number;
  seed: number;
  walkableCells: number;
  walkablePct: number;
  reachablePct: number; // of walkable, from all doors — MUST be 100
  /** Cells each door reaches ON ITS OWN. The union above cannot see a door
   *  sealed in its own pocket (three good doors mask the fourth), which is
   *  exactly how a 28-cell closet-door shipped. MUST all be equal. */
  doorReach: number[];
  /** Doors reaching less than half of the best door — MUST be 0. */
  isolatedDoors: number;
  deadEnds: number;
  deadEndPct: number;
  maxDistFromDoors: number;
  avgDistFromDoors: number;
  landmarks: number;
  minLandmarkSpacing: number;
  districts: Record<DistrictType, number>;
  // ---- v2 verticality ----
  /** Cells whose floor isn't the datum. */
  slopedCells: number;
  floorMin: number;
  floorMax: number;
  /** Adjacent open pairs that differ by exactly one step: the ramps you walk. */
  rampEdges: number;
  /** Adjacent open pairs you can fall down (≥2 steps) — the drops. */
  fallEdges: number;
  /** Lethal shaft cells (floor ≤ -PIT_LETHAL). */
  pitCells: number;
  pitCount: number;
  /** Sealed scenery cells — visible, never enterable, holds nothing. */
  backgroundCells: number;
  /** MUST be 0: an open, non-pit, non-scenery cell you cannot walk to. */
  strandedCells: number;
  /** MUST be 0: a pit shallow enough to trap rather than kill. */
  shallowPits: number;
  /** MUST be 0: scenery a placement pass could put something in. */
  sceneryWithLandmark: number;
}

export function validateSector(s: Sector): SectorReport {
  const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  let walkable = 0;
  let reached = 0;
  let deadEnds = 0;
  let sum = 0;
  let max = 0;
  for (let y = 0; y < s.size; y++) {
    for (let x = 0; x < s.size; x++) {
      const i = idx(s.size, x, y);
      // "Walkable" now means PLAYABLE: sealed scenery and lethal shafts are
      // deliberately not walk-to-able, so counting them would make a healthy
      // world look broken.
      if (s.solid[i] || s.background[i] || isPitCell(s, x, y)) continue;
      walkable++;
      const d = dist[i];
      if (d >= 0) {
        reached++;
        sum += d;
        if (d > max) max = d;
      }
      if (neighbors(s, x, y).length === 1) deadEnds++;
    }
  }
  let minSpace = Infinity;
  for (let a = 0; a < s.landmarks.length; a++) {
    for (let b = a + 1; b < s.landmarks.length; b++) {
      const la = s.landmarks[a];
      const lb = s.landmarks[b];
      const d = Math.hypot(la.x - lb.x, la.y - lb.y);
      if (d < minSpace) minSpace = d;
    }
  }
  const counts = {} as Record<DistrictType, number>;
  for (const d of s.districts) counts[d.type] = (counts[d.type] ?? 0) + 1;

  // ---- v2 verticality audit ----------------------------------------------
  // The three MUST-BE-ZERO numbers are the whole safety story: nothing
  // stranded (no soft-locks), no shallow pit (a pit either kills or isn't a
  // pit), and no scenery holding content (nothing to hunt for that can't be
  // reached).
  let sloped = 0;
  let floorMin = 0;
  let floorMax = 0;
  let ramps = 0;
  let falls = 0;
  let pitCells = 0;
  let background = 0;
  let stranded = 0;
  let sceneryWithLandmark = 0;
  for (let y = 0; y < s.size; y++) {
    for (let x = 0; x < s.size; x++) {
      const i = idx(s.size, x, y);
      if (s.background[i]) {
        background++;
        if (s.landmark[i]) sceneryWithLandmark++;
      }
      if (s.solid[i]) continue;
      const h = s.floor[i];
      if (h !== 0) sloped++;
      if (h < floorMin) floorMin = h;
      if (h > floorMax) floorMax = h;
      if (isPitCell(s, x, y)) pitCells++;
      else if (!s.background[i] && dist[i] < 0) stranded++;
      // Count each adjacency once: east and south only.
      for (const [nx, ny, blocked] of [
        [x + 1, y, s.wallW[idx(s.size, Math.min(x + 1, s.size - 1), y)]],
        [x, y + 1, s.wallN[idx(s.size, x, Math.min(y + 1, s.size - 1))]],
      ] as [number, number, number][]) {
        if (nx >= s.size || ny >= s.size) continue;
        const ni = idx(s.size, nx, ny);
        if (s.solid[ni] || blocked) continue;
        const d2 = Math.abs(s.floor[ni] - h);
        if (d2 === 1) ramps++;
        else if (d2 >= 2) falls++;
      }
    }
  }
  // A pit must be deep enough to kill from its own rim, or it's a trap.
  let shallowPits = 0;
  const seen = new Uint8Array(s.size * s.size);
  let pitCount = 0;
  for (let y = 0; y < s.size; y++) {
    for (let x = 0; x < s.size; x++) {
      const i = idx(s.size, x, y);
      if (!isPitCell(s, x, y) || seen[i]) continue;
      // Flood the shaft, tracking its floor and the highest rim beside it.
      pitCount++;
      let deepest = 0;
      let rim = -128;
      const stack: [number, number][] = [[x, y]];
      seen[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        deepest = Math.min(deepest, s.floor[idx(s.size, cx, cy)]);
        for (const [nx, ny] of [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]] as [number, number][]) {
          if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
          const ni = idx(s.size, nx, ny);
          if (s.solid[ni]) continue;
          if (isPitCell(s, nx, ny)) {
            if (!seen[ni]) {
              seen[ni] = 1;
              stack.push([nx, ny]);
            }
          } else {
            rim = Math.max(rim, s.floor[ni]);
          }
        }
      }
      if (rim !== -128 && rim - deepest < PIT_LETHAL) shallowPits++;
    }
  }

  // Each door ALONE — see the doorReach doc comment.
  const doorReach = s.doors.map((d) =>
    distanceMap(s, [{ x: d.x, y: d.y }]).reduce((n, v) => n + (v >= 0 ? 1 : 0), 0),
  );
  const bestDoor = Math.max(...doorReach, 0);
  const isolatedDoors = doorReach.filter((r) => r < bestDoor / 2).length;

  return {
    size: s.size,
    seed: s.seed,
    walkableCells: walkable,
    walkablePct: (walkable / (s.size * s.size)) * 100,
    reachablePct: walkable ? (reached / walkable) * 100 : 0,
    doorReach,
    isolatedDoors,
    deadEnds,
    deadEndPct: walkable ? (deadEnds / walkable) * 100 : 0,
    maxDistFromDoors: max,
    avgDistFromDoors: walkable ? sum / walkable : 0,
    landmarks: s.landmarks.length,
    minLandmarkSpacing: Number.isFinite(minSpace) ? minSpace : 0,
    districts: counts,
    slopedCells: sloped,
    floorMin,
    floorMax,
    rampEdges: ramps,
    fallEdges: falls,
    pitCells,
    pitCount,
    backgroundCells: background,
    strandedCells: stranded,
    shallowPits,
    sceneryWithLandmark,
  };
}
