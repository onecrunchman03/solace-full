// SOLACE SURVIVORZ — THE MAP THE SIMULATION RUNS ON: Civil Defence Shelter 14 (bunker-map.ts,
// docs/survivorz/BUNKER.md), in the shape the sim's code reads (facility.ts Facility).
//
// The rooms' own spots are the map's (the crank, the keycard, the radio, the part and note spots, the
// armory's racks); the containers worth searching are the walk map's ("loot" spots, scripts/survivorz/
// sim-walk.mjs CONTAINERS) and are added to their rooms here, so everything that walks a room's spots
// sees both.
//
// This is the BUNKER's data and nothing more: a world is handed its map (sim/mapdef.ts wraps this as the "bunker"
// MapDef) and the simulation's code reads the world's, never this module.
import { BUNKER } from "../bunker-map";
import type { Facility, Room, Spot, Zone } from "../facility";
import WALK_JSON from "./walk.json";

const WALK_SPOTS = (WALK_JSON as unknown as { spots: Record<string, { room: string; kind: string }> }).spots;

const zones: Zone[] = BUNKER.zones.map((z) => ({ id: z.id, name: z.name, expectWeek: 1, emergencyPower: true }));

const rooms: Room[] = BUNKER.rooms.map((r) => {
  const spots: Spot[] = r.spots.map((s) => ({ id: s.id, kind: s.kind }));
  for (const [id, sp] of Object.entries(WALK_SPOTS)) if (sp.room === r.id && sp.kind === "loot" && !spots.some((x) => x.id === id)) spots.push({ id, kind: "loot" });
  return { id: r.id, name: r.name, zone: r.zone, kind: r.kind, rect: r.rect, floor: 0, spots };
});

/** The bunker, as the simulation reads a map. `start` is the common room (the heart; nobody need start there). */
export const MAP: Facility = { id: BUNKER.id, zones, rooms, doors: BUNKER.doors, start: "common" };

/** Rooms a survivor may wake in (BUNKER.md 14: never the entrance, the armory or the radio room). */
export const START_ROOMS: string[] = BUNKER.rooms.filter((r) => r.start).map((r) => r.id);

/** The bunker's own spots, by kind (the crank, the keycard, the radio set, the part and note places). */
export const SPOTS_OF = (kind: string): { id: string; room: string }[] =>
  BUNKER.rooms.flatMap((r) => r.spots.filter((s) => s.kind === kind).map((s) => ({ id: s.id, room: r.id })));
