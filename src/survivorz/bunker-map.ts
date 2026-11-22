// SOLACE SURVIVORZ — THE BUNKER: Civil Defence Shelter 14 as LOGIC (docs/survivorz/BUNKER.md).
//
// The map Josh approved on Nov 2 2026 (docs/survivorz/bunker-floorplan.png, drawn from this file by
// scripts/survivorz/bunker/floorplan.mjs). One floor, in world metres: x east, y = z south, the blast
// door on the south edge. Rooms tile with SHARED EDGES, because a door sits where two rooms meet
// (facility.ts doorPlacement puts it in the middle of the shared stretch) and the grey box builds one
// wall along every edge (scripts/survivorz/greybox.mjs --map bunker). Halls and passages are rooms too.
//
// Door kinds borrow the old show's vocabulary for the GEOMETRY (an opening's size and leaf); what each
// door does in the bunker (the keycard, the keypad, zombies pushing steel doors open) is step 3.
//
// Pure: imports types only.
import type { Door, Rect, RoomKind } from "./facility";

/** The bunker's wings: what the floor plan colours and the director's "where" is built from. */
export type Wing = "entrance" | "commons" | "dorms" | "command" | "utility";

export type BunkerSpotKind =
  | "crank"       // the blast door's hand-crank wheel (objective 1)
  | "keycard"     // the armory keycard, on the security office desk
  | "radio"       // the radio set (objective 3)
  | "part"        // a place the radio's missing part may be (one is picked each run)
  | "note"        // a place the keypad code's note may be (one is picked each run)
  | "armory";     // the guns' racks and lockers

export interface BunkerSpot { id: string; kind: BunkerSpotKind }

export interface BunkerRoom {
  id: string;
  name: string;
  zone: Wing;
  kind: RoomKind;
  rect: Rect;
  floor: 0;
  /** ceiling height, metres (default 3.2 for a room, 3.0 for a hall) */
  height?: number;
  /** a survivor may wake here (never the entrance, the armory or the radio room) */
  start?: boolean;
  /** not on Josh's core list: added to reach 20-25 rooms (he approved them with the plan) */
  extra?: boolean;
  spots: BunkerSpot[];
}

export interface BunkerMap {
  id: string;
  zones: { id: Wing; name: string }[];
  rooms: BunkerRoom[];
  doors: Door[];
}

const r = (id: string, name: string, zone: Wing, kind: RoomKind, x: number, y: number, w: number, h: number,
  more: Partial<Pick<BunkerRoom, "height" | "start" | "extra" | "spots">> = {}): BunkerRoom =>
  ({ id, name, zone, kind, rect: { x, y, w, h }, floor: 0, spots: [], ...more });
const spot = (id: string, kind: BunkerSpotKind): BunkerSpot => ({ id, kind });
const steel = (id: string, a: string, b: string): Door => ({ id, kind: "door", a, b, material: "metal" });
const open = (id: string, a: string, b: string): Door => ({ id, kind: "doorway", a, b });

export const BUNKER: BunkerMap = {
  id: "shelter-14-v1",
  zones: [
    { id: "entrance", name: "The Entrance" },
    { id: "commons", name: "The Commons" },
    { id: "dorms", name: "The Dormitories" },
    { id: "command", name: "Command" },
    { id: "utility", name: "Utilities" },
  ],
  rooms: [
    // the entrance: the dead's way in
    r("tunnel", "Entrance Tunnel", "entrance", "exit", 37, 57, 6, 20, { height: 4.2 }),
    r("vestibule", "Entry Vestibule", "entrance", "room", 34, 51, 12, 6, { height: 3.6, spots: [spot("crank", "crank")] }),
    r("decon", "Decontamination", "entrance", "corridor", 38.5, 41, 3, 10),
    r("equipment", "Equipment Room", "entrance", "room", 41.5, 43, 7.5, 8, { start: true, extra: true }),
    // the heart, and the halls round it
    r("common", "Common Room", "commons", "room", 26, 21, 28, 20, { height: 3.6, start: true }),
    r("hall-n", "North Hall", "commons", "corridor", 14, 14, 48, 4, { extra: true }),
    r("hall-w", "West Hall", "commons", "corridor", 14, 18, 4, 32, { extra: true }),
    r("hall-e", "East Hall", "commons", "corridor", 62, 6, 4, 46, { extra: true }),
    r("pass-n", "North Passage", "commons", "corridor", 38, 18, 4, 3),
    r("pass-w", "West Passage", "commons", "corridor", 18, 29, 8, 4),
    r("pass-e", "East Passage", "commons", "corridor", 54, 29, 8, 4),
    // the dormitory wing (west)
    r("barracks", "Barracks", "dorms", "room", 2, 18, 12, 16, { start: true }),
    r("private-a", "Private Room A", "dorms", "room", 6, 36, 8, 6, { start: true }),
    r("private-b", "Private Room B", "dorms", "room", 6, 42, 8, 6, { start: true, spots: [spot("note-private-b", "note")] }),
    r("laundry", "Laundry", "dorms", "room", 18, 18, 8, 11, { start: true, extra: true }),
    // the command wing (north)
    r("maint", "Maintenance", "utility", "room", 18, 8, 6, 6, { start: true, extra: true }),
    r("armory", "Armory", "command", "room", 24, 2, 10, 12, { spots: [spot("armory-racks", "armory")] }),
    r("security", "Security Office", "command", "room", 35, 4, 10, 10, { start: true, spots: [spot("keycard", "keycard"), spot("note-security", "note")] }),
    r("radio", "Radio Room", "command", "room", 48, 4, 10, 10, { spots: [spot("radio-set", "radio")] }),
    // the utility wing (east)
    r("generator", "Generator Room", "utility", "room", 66, 2, 16, 12, { height: 4.5, start: true }),
    r("workshop", "Workshop", "utility", "room", 54, 18, 8, 11, { start: true, spots: [spot("part-workshop", "part")] }),
    r("infirmary", "Infirmary", "commons", "room", 54, 33, 8, 13, { start: true }),
    r("qm", "Quartermaster", "command", "room", 54, 46, 8, 6, { start: true, extra: true, spots: [spot("note-qm", "note")] }),
    r("mess", "Mess Hall", "commons", "room", 66, 16, 14, 12, { height: 3.4, start: true }),
    r("kitchen", "Kitchen", "commons", "room", 66, 28, 14, 6, { start: true }),
    r("stores", "Stores", "utility", "room", 66, 36, 16, 14, { height: 3.6, start: true, spots: [spot("part-stores", "part")] }),
  ],
  doors: [
    { id: "blast", kind: "vault", a: "vestibule", b: "tunnel", name: "Blast Door" },
    steel("vestibule-decon", "vestibule", "decon"),
    steel("decon-common", "decon", "common"),
    steel("decon-equipment", "decon", "equipment"),
    open("hall-n-pass-n", "hall-n", "pass-n"),
    open("pass-n-common", "pass-n", "common"),
    open("hall-w-pass-w", "hall-w", "pass-w"),
    open("pass-w-common", "pass-w", "common"),
    open("common-pass-e", "common", "pass-e"),
    open("pass-e-hall-e", "pass-e", "hall-e"),
    open("hall-n-hall-w", "hall-n", "hall-w"),
    open("hall-n-hall-e", "hall-n", "hall-e"),
    steel("barracks", "hall-w", "barracks"),
    steel("private-a", "hall-w", "private-a"),
    steel("private-b", "hall-w", "private-b"),
    steel("laundry", "hall-w", "laundry"),
    steel("maint", "hall-n", "maint"),
    { id: "armory", kind: "keycard", tier: 1, a: "hall-n", b: "armory", name: "Armory" },
    steel("security", "hall-n", "security"),
    { id: "radio", kind: "keypad", a: "hall-n", b: "radio", name: "Radio Room" },
    steel("generator", "hall-e", "generator"),
    steel("workshop", "hall-e", "workshop"),
    steel("infirmary", "hall-e", "infirmary"),
    steel("qm", "hall-e", "qm"),
    steel("mess", "hall-e", "mess"),
    steel("kitchen", "hall-e", "kitchen"),
    steel("stores", "hall-e", "stores"),
  ],
};
