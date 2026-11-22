// LEVEL 0 — THE LOBBY — the shared vocabulary: the room types, the module the
// rooms are drawn to, the doorway slots. Pure data with NO imports (the map
// editor, a browser page, reads it too).

/** Level 0's room types. The first eight are the originals; the last five
 *  came with the Sep 2026 condense (Josh: "more variations in its rooms type
 *  and look"), each with its own walls, floor and lighting (client world.ts
 *  LOBBY_LOOK). APPEND ONLY: a type's index is its district id on the wire. */
export type LobbyType = "classic" | "pillars" | "offices" | "warrens" | "halls" | "atrium" | "terraces" | "sublevel" | "manila" | "restrooms" | "panelled" | "storage" | "unlit";
export const LOBBY_TYPES: readonly LobbyType[] = ["classic", "pillars", "offices", "warrens", "halls", "atrium", "terraces", "sublevel", "manila", "restrooms", "panelled", "storage", "unlit"];

/** THE LATTICE. Level 0 is packed wall to wall — no rock between rooms — so
 *  its rooms are drawn to a grid: every room is a whole number of MODULES on
 *  each side, and every module side carries a doorway SLOT in the same place.
 *  The generator packs rooms edge to edge and chooses which slots to open. */
export const MODULE = 10;
/** A slot: SLOT_W cells wide, starting SLOT_AT cells into its module side. */
export const SLOT_AT = 4;
export const SLOT_W = 2;

/** How deep a lethal shaft is (steps) — worldgen.ts PIT_LETHAL; the harness
 *  holds the two equal. */
export const LOBBY_PIT = 9;

/** Ceiling height (metres) by room type — the client builds these
 *  (world.ts HEIGHT_BY_TYPE) and the editor's 3D preview reads them. */
export const LOBBY_CEILINGS: Readonly<Record<string, number>> = {
  classic: 5.0,
  halls: 5.8,
  pillars: 6.6,
  offices: 4.2,
  warrens: 3.4,
  atrium: 7.6,
  terraces: 5.4,
  sublevel: 3.6,
  manila: 3.8,
  restrooms: 3.2,
  panelled: 3.9,
  storage: 7.2,
  unlit: 4.6,
};

/** ONE DOOR PER LEVEL (Josh, 2026-09-27: "Just put only one door per level for
 *  entering let's make it easy"): the way in from the hub and the way out. */
export const LOBBY_DOOR_NAME = "The Entrance";
