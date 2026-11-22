// SOLACE SURVIVORZ — THE MAP A WORLD IS MADE ON, AS DATA (Nov 2026, the second map's stage 1).
//
// The simulation was written against one map (the bunker, sim/map.ts). A SimWorld is now HANDED its map: the
// rooms, doors and zones (a Facility), what its navigation is built from, where the cast may wake, where the dead
// stand at the start and where more of them walk in from. world.ts, survivor.ts, knowledge.ts and zombie.ts read
// `w.map` and nothing of the bunker's own modules, so a second world on another map shares no state with it.
//
// A NEW MAP is an entry in DEFS here (and in maps.ts for the picker). `id` is the picker's id (maps.ts, the
// broadcast's app_kv); `site.id` is what a SAVE names — a save made on one site is refused by any other.
//
// Data only. It must not import maps.ts (maps.ts reads the bunker's seats from here at module load).
import type { Door, Facility, Room } from "../facility";
import type { NavSource } from "./nav";
import { PLACEMENTS, START_LOCKED, type Item, type Placement } from "./tables";
import { MAP as BUNKER_SITE, START_ROOMS as BUNKER_STARTS, SPOTS_OF as BUNKER_SPOTS_OF } from "./map";
import BUNKER_WALK from "./walk.json";
import BUNKER_SIGHT from "./sight.json";
import GLENRIDGE_SITE from "../glenridge-site.json";
import GLENRIDGE_WALK from "../glenridge-walk.json";
import GLENRIDGE_SIGHT from "../glenridge-sight.json";

export interface MapDef {
  /** the maps.ts id: "bunker", "glenridge" */
  id: string;
  /** rooms, doors, zones, the start room. `site.id` is the id a save carries */
  site: Facility;
  /** what the navigation is built from: the walk grid (with its links, spots and beds), the sight grid, the rooms and doors */
  nav: NavSource;
  /** rooms a survivor may wake in, one each */
  startRooms: string[];
  /** the map's own spots of a kind (the crank, the radio set, the part and note places), with the room each is in */
  spotsOf(kind: string): { id: string; room: string }[];
  /** the dead at the start */
  placements: Placement[];
  /** doors shut and locked at the start */
  lockedDoors: string[];
  /** rooms behind a lock at the start: no dead are placed in them */
  lockedRooms: string[];
  /** where more of the dead walk in from, and the room they make for (the bunker: the tunnel, toward the
   *  vestibule). `room` is OUTSIDE: nobody is moved or spawned there and it isn't counted as inside. null = none */
  arrivals: { room: string; toward: string } | null;
  /** what the thing that opens a card door is called here ("the butler's key"); absent = "a level-N keycard" */
  keyName?: string;
  /** the map's objectives (sim/scenario.ts), by id; absent = the bunker's own, written into the sim */
  scenario?: string;
  /** doors that stand OPEN at the start (every other inside door starts shut) */
  openDoors?: string[];
  /** what a container may hold, by its id (first match), and the fixed finds; absent = the bunker's tables */
  lootRules?: [RegExp, [Item, number, number][]][];
  fixedLoot?: Record<string, Item[]>;
  /** WHERE SOMEBODY IN NEED LOOKS FIRST, by a container's id: for something to fight with, for something for a
   *  wound, for food and water (survivor.ts jobMenu). Absent = the bunker's own (its workbenches, its infirmary,
   *  its stores). The mansion had none, so the bunker's words were asked of its cupboards: nobody hurt went to a
   *  bathroom cabinet, and one container of forty-three counted as a place to find a weapon (the code review's
   *  A-11). */
  lootHints?: { weapon: RegExp; med: RegExp; food: RegExp };
}

const BUNKER: MapDef = {
  id: "bunker",
  site: BUNKER_SITE,
  nav: { walk: BUNKER_WALK as unknown as NavSource["walk"], sight: BUNKER_SIGHT as unknown as NavSource["sight"], site: BUNKER_SITE },
  startRooms: BUNKER_STARTS,
  spotsOf: BUNKER_SPOTS_OF,
  placements: PLACEMENTS,
  lockedDoors: START_LOCKED,
  lockedRooms: ["armory", "radio"],
  arrivals: { room: "tunnel", toward: "vestibule" },
};

// GLENRIDGE HALL (docs/survivorz/GLENRIDGE.md): the house, its grounds, its doors, stairs and spots as the walk map
// wrote them (scripts/survivorz/glenridge/walkmap.py), and the design's own rules laid over them.
type GlenSpot = { room: string; kind: string; floor: number; at: number[]; stand: number[] };
const GLEN_WALK = GLENRIDGE_WALK as unknown as NavSource["walk"] & { simLinks: NavSource["walk"]["links"]; spots: Record<string, GlenSpot> };
const GLEN_ROOMS = (GLENRIDGE_SITE as unknown as { rooms: Room[] }).rooms;
const OUT = new Set(GLEN_ROOMS.filter((r) => r.outdoor).map((r) => r.id));
// the vault's door takes the butler's key (the bunker's card reader, tier 1); every other door is as the house has it
const GLEN_DOORS = (GLENRIDGE_SITE as unknown as { doors: Door[] }).doors.map((d) => (d.id === "vault-door" ? { ...d, kind: "keycard" as const, tier: 1 } : d));
const GLENRIDGE_FACILITY: Facility = {
  id: "glenridge-v1",
  zones: [{ id: "glenridge", name: "Glenridge Hall", expectWeek: 1, emergencyPower: true }],
  rooms: GLEN_ROOMS, doors: GLEN_DOORS, start: "great-hall",
};
/** THE HOUSE IS LOCKED UP FOR THE NIGHT: every door from a room to the grounds but the front door (which stands
 *  open), and the glazed doors onto the two porches that are open to the garden. The garage is not the house. */
const GLEN_LOCKED = GLEN_DOORS.filter((d) => d.kind === "door" && d.id !== "front-door" && d.id !== "garage-8"
  && (OUT.has(d.a) !== OUT.has(d.b) || [d.a, d.b].some((r) => r === "dining-porch" || r === "west-porch"))).map((d) => d.id);
const GLENRIDGE: MapDef = {
  id: "glenridge",
  site: GLENRIDGE_FACILITY,
  nav: { walk: { ...GLEN_WALK, links: GLEN_WALK.simLinks, spots: GLEN_WALK.spots as unknown as NavSource["walk"]["spots"], beds: {} }, sight: GLENRIDGE_SIGHT as unknown as NavSource["sight"], site: GLENRIDGE_FACILITY },
  // OUTSIDE IN THE RAIN (Josh, Nov 13 2026): apart, at the gate and along the drive
  startRooms: ["gate", "gate", "gate", "drive", "drive", "garage-road"],
  spotsOf: (kind) => GLEN_ROOMS.flatMap((r) => r.spots.filter((sp) => sp.kind === kind).map((sp) => ({ id: sp.id, room: r.id }))),
  // THE DEAD ARE ALREADY ROUND THE HOUSE AND IN IT (the same ruling): 14 in the grounds, 10 inside ✱ (and the one
  // in the cell, which the scenario places)
  placements: [
    { rooms: ["forecourt"], n: 2, kinds: "outside" },
    { rooms: ["west-lawn"], n: 4, kinds: "outside" },
    { rooms: ["east-lawn"], n: 4, kinds: "outside" },
    { rooms: ["terrace"], n: 3, kinds: "outside" },
    { rooms: ["garage-court"], n: 1, kinds: "outside" },
    { rooms: ["great-hall", "gallery", "dining-room"], n: 3, kinds: "outside" },
    { rooms: ["library", "solarium", "arcade"], n: 2, kinds: "outside" },
    { rooms: ["kitchen", "e-corridor", "servants-sitting"], n: 2, kinds: "outside" },
    { rooms: ["upper-gallery", "mrs-glenn-bedroom", "boys-bedroom-a"], n: 2, kinds: "outside" },
    { rooms: ["furnace-room", "laundry"], n: 1, kinds: "outside" },
  ],
  lockedDoors: GLEN_LOCKED,
  lockedRooms: ["vault", "cellar-cell", "hidden-study", "hearth-stair", "gate", "drive", "garage-road"],
  arrivals: null,
  scenario: "glenridge",
  keyName: "the butler's key",
  openDoors: ["front-door", "garage-8"],
  // WHAT THE HOUSE HOLDS ✱: food in the kitchens, bandages in the bathrooms, a little of everything in bedrooms
  lootHints: { weapon: /^garage-|knife-block|furnace-tools/, med: /^bath-/, food: /^kitchen-|^cellar-/ },
  lootRules: [
    [/^vault-|^garage-|^safe-/, []],
    [/^kitchen-/, [["food", 1, 3], ["water", 1, 2]]],
    [/^bath-/, [["bandage", 1, 3], ["medkit", 0, 1]]],
    [/^bedroom-/, [["bandage", 0, 1], ["food", 0, 1], ["water", 0, 1]]],
    [/^cellar-/, [["food", 0, 2], ["water", 0, 2], ["battery", 0, 1]]],
    [/^desk-/, [["battery", 0, 1], ["bandage", 0, 1]]],
    [/.*/, [["food", 0, 1], ["water", 0, 1]]],
  ],
  fixedLoot: {
    "kitchen-knife-block": ["knife", "knife"],
    "garage-bench": ["crowbar", "hammer"],
    "garage-wall": ["axe"],
    "cellar-furnace-tools": ["pipe"],
    "vault-case": ["pistol", "ammo", "ammo", "ammo"],
    "bedroom-glenn-nightstand": ["pistol", "ammo"],
    "safe-cabinet": ["medkit", "medkit", "bandage", "bandage", "bandage", "bandage"],
  },
};

const DEFS: readonly MapDef[] = [BUNKER, GLENRIDGE];

/** The map of that id (a maps.ts id). Unknown, empty or absent is the bunker: a run kept before maps had ids is one. */
export function mapDef(id?: string | null): MapDef {
  return DEFS.find((d) => d.id === id) ?? BUNKER;
}
/** every map the simulation can be handed */
export const MAP_DEFS: readonly MapDef[] = DEFS;
