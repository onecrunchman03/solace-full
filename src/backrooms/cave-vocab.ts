// LEVEL 8 — THE CAVE SYSTEM — the shared vocabulary: the room types, the
// module the rooms are drawn to, the three zones, the deco codes the server
// and the client both read. Pure data with NO imports (the map editor, a
// browser page, reads it too). The design is BACKROOMS.md → "LEVEL 8 — THE
// CAVE SYSTEM".
//
// Josh, 2026-10-15 ("1. A 2. A 3. A"): THE SUBWAY BREACH (down Level 7's
// subway stair onto a half-flooded platform with a dead train, the tunnel
// broken into caves: the Station, the Caverns, the Deep), THE CLIMB (find the
// Climbing Rope in the caverns, carry it through the Deep, fix it at the
// Chimney's foot), and THE BURROWER (long, pale, eyeless, only in the narrow
// passages and crawlspaces; it clicks in the rock).

/** The Cave System's room types. APPEND ONLY: a type's index is its district
 *  id on the wire (sector.district). Every name is the cave's OWN (the client
 *  keys ceilings and looks by type NAME across every level). */
export type CaveType =
  | "subwaystair" // the way in: Level 7's subway stair comes down here (SAFE)
  | "platform" //    a subway platform: tiles, benches, the platform edge
  | "trackbed" //    the flooded track bed: rails under ankle-deep water, dead cars
  | "concourse" //   the station's hall: tiles, turnstiles, a ticket booth
  | "breach" //      where the tunnel broke into the rock: half tile, half cave
  | "cavern" //      a big rock chamber, stalagmites
  | "gallery" //     a chamber in terraces: ledges you drop off and walk round
  | "caveriver" //   the underground river, wading
  | "chasm" //       a chamber cut by a drop that kills, a bridge over it
  | "grotto" //      a small open chamber in the Deep (open: the Burrower's edge)
  | "passage" //     a narrow rock passage (the Burrower's)
  | "crawl" //       a crawlspace: crouch or nothing (the Burrower's)
  | "chimney"; //    THE CHIMNEY, the way on to Level 9
export const CAVE_TYPES: readonly CaveType[] = [
  "subwaystair",
  "platform",
  "trackbed",
  "concourse",
  "breach",
  "cavern",
  "gallery",
  "caveriver",
  "chasm",
  "grotto",
  "passage",
  "crawl",
  "chimney",
];

/** THE LATTICE: Lights Out's — 8-cell modules (16m), a 2-wide doorway SLOT in
 *  the middle two cells of every module side. */
export const MODULE = 8;
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE THREE ZONES, by id on the map (Sector.section). 0 is no zone (solid). */
export const ZONE_STATION = 1;
export const ZONE_CAVERNS = 2;
export const ZONE_DEEP = 3;
/** Module rows of the map, counted from the way in: the Station's first, the
 *  Deep's last (of 20), the Caverns in between. */
export const STATION_ROWS = 4;
export const DEEP_ROWS = 6;

/** Rooms standing in water: every floor cell is ankle-deep — every step a
 *  splash. */
export const CAVE_WET_TYPES: readonly CaveType[] = ["trackbed", "caveriver"];
/** Rooms nothing hunts in: the way in. */
export const CAVE_SAFE_TYPES: readonly CaveType[] = ["subwaystair"];
/** THE BURROWER's rooms, and the only ones: the narrow passages and the
 *  crawlspaces. Everything else is open, and open is safety. */
export const BURROW_TYPES: readonly CaveType[] = ["passage", "crawl"];
/** Rooms you can only cross crouched: the ceiling is lower than you are. */
export const CRAWL_TYPES: readonly CaveType[] = ["crawl"];
/** The clearance (metres, floor to ceiling) below which you must crouch. A
 *  standing body needs 1.8m; a crouched one 1.1m. */
export const STAND_CLEAR = 1.7;

/** How deep a drop that kills is (steps) — worldgen.ts PIT_LETHAL. */
export const CAVE_PIT = 9;

/** Ceiling height (metres) by room type: the caverns tall, the passages
 *  close, a crawlspace lower than a standing man. */
export const CAVE_CEILINGS: Readonly<Record<CaveType, number>> = {
  subwaystair: 3.6,
  platform: 4.2,
  trackbed: 4.4,
  concourse: 3.8,
  breach: 5.0,
  cavern: 9.0,
  gallery: 8.0,
  caveriver: 6.5,
  chasm: 10.0,
  grotto: 4.2,
  passage: 2.6,
  crawl: 1.25,
  chimney: 14.0,
};

/** ONE DOOR PER LEVEL: the way in, down Level 7's subway stair. */
export const CAVE_DOOR_NAME = "The Subway Stair";
/** The way on to Level 9, climbed with the Climbing Rope. */
export const CHIMNEY_NAME = "The Chimney";
/** Level 8's key. */
export const ROPE_NAME = "the Climbing Rope";

/** How many rope spots a map carries at least. */
export const ROPE_SPOTS_MIN = 6;

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Only what PLAYS or what the client must draw at a cell. Dressing is the prop
// kit's job (real models in the room designs).
export const CDECO = Object.freeze({
  none: 0,
  /** A light fixture (the fixture law: a real lamp model). v0 a survey team's
   *  work lamp, LIT · v1 a station tunnel batten, DEAD · v2 a platform lamp,
   *  flickering. */
  lamp: 1,
  /** The way in, on this cell's wall. v = wall side 0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** THE CHIMNEY's foot, where the rope is fixed. v = the wall the shaft is
   *  in (the side you face to climb). */
  chimney: 3,
  /** A spot the Climbing Rope may lie on (the plan picks one per map). */
  rope: 4,
});
export const cdecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const cdecoKind = (b: number): number => b >> 4;
export const cdecoVar = (b: number): number => b & 15;
