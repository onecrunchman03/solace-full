// DR. VOSS'S RESEARCH — vague directions, for a surveyor she trusts (Josh,
// Oct 2026: "her research, some hints about where to find relics or drives.
// very vague though but good enough to work with while still requiring
// exploration").
//
// This is the one place game knowledge reaches the house's brains, so the
// vagueness is decided HERE, in code, not left to a model's discretion: a
// hint names the KIND of room, which side of the level it's on, and how far
// it is from the level's door — never a landmark, a cell, a distance in
// metres or anything a player could walk straight to. The rest is
// exploration. It is read only into a trusted surveyor's own DM with Voss
// (brain.ts), and the place names carry no digits, so the reply's number
// check never has a figure to leak.

import type { Sector } from "./worldgen";
import { zoneAt } from "./worldgen-pools";

/** What a surveyor would call each room type, per level. A room there is
 *  only ONE of (the Beverly Room, the security office, Number 9's porch…)
 *  is a landmark however it is named, so those read as the area around
 *  them (Oct 2026 review). */
const PLACE: Record<number, Record<string, string>> = {
  0: {
    classic: "the yellow rooms",
    pillars: "the pillared halls",
    offices: "the empty offices",
    warrens: "the warrens",
    halls: "the long halls",
    atrium: "the atriums",
    terraces: "the terraces",
    sublevel: "the sunken rooms",
    manila: "the manila rooms",
    restrooms: "the restrooms",
    panelled: "the panelled offices",
    storage: "the storage rooms",
    unlit: "the unlit rooms",
  },
  2: {
    pipegallery: "the pipe galleries",
    servicering: "the service rings",
    corridor: "the service corridors",
    tunnel: "the tunnels",
    office: "the plant offices",
    suite: "the office suites",
    breakroom: "the break rooms",
    controlroom: "the control rooms",
    enginehall: "the engine halls",
    catwalk: "the catwalks",
    boilerhouse: "the boiler house",
    warehouse: "the warehouses",
    machineshop: "the machine shops",
    drainroom: "the drain rooms",
    vault: "the vaults",
  },
  3: {
    intake: "the intake halls",
    lifthall: "the halls",
    switchroom: "the switch rooms",
    serviceway: "the service ways",
    cablevault: "the cable vaults",
    controldesk: "the control desks",
    batteryroom: "the battery rooms",
    xfmrbay: "the transformer bays",
    substation: "the substations",
    workshop: "the workshops",
    floodroom: "the flooded rooms",
  },
  4: {
    liftlobby: "the offices",
    security: "the offices",
    stairwell: "the far offices",
    hallway: "the corridors",
    cubicles: "the cubicle farms",
    openplan: "the open floors",
    conference: "the conference rooms",
    corneroffice: "the corner offices",
    kitchenette: "the break rooms",
    copyroom: "the copy rooms",
    records: "the records rooms",
    serverroom: "the server rooms",
    washroom: "the washrooms",
    reception: "the offices",
    supply: "the supply closets",
  },
  5: {
    landing: "the corridors",
    corridor: "the corridors",
    lounge: "the lounges",
    suite: "the guest rooms",
    lifthall: "the lift halls",
    beverly: "the public rooms",
    linen: "the linen closets",
    dining: "the dining rooms",
    library: "the reading rooms",
    boilergate: "below stairs",
    boiler: "the furnace rooms",
    pipeway: "the pipe tunnels",
    coalstore: "the coal stores",
    rustydoor: "below stairs",
  },
  6: {
    stairfoot: "the corridors",
    darkhall: "the corridors",
    darkroom: "the bare rooms",
    storeroom: "the store rooms",
    piperun: "the pipe runs",
    cellblock: "the partition rooms",
    rubble: "the fallen rooms",
    deadoffice: "the dead offices",
    wetway: "the flooded corridors",
    cistern: "the cisterns",
    seahatch: "the water",
  },
  7: {
    seatower: "the roofs",
    searoof: "the roofs",
    seawade: "the drowned roofs",
    seacanal: "the streets",
    seaplaza: "the open water",
    seadrop: "the open water",
    seasunk: "the sunk roofs",
  },
  8: {
    subwaystair: "the station",
    platform: "the platforms",
    trackbed: "the tunnel",
    concourse: "the ticket halls",
    breach: "the caverns",
    cavern: "the caverns",
    gallery: "the terraced caverns",
    caveriver: "the river",
    chasm: "the chasms",
    grotto: "the hollows of the Deep",
    passage: "the passages",
    crawl: "the crawlspaces",
    chimney: "the hollows of the Deep",
  },
  9: {
    manhole: "the streets",
    road: "the streets",
    sidewalk: "the pavements",
    yard: "the gardens",
    house: "one of the houses",
    garage: "one of the garages",
    park: "the park",
    porch: "one of the houses",
  },
};
const POOL_ZONES: Record<string, string> = { baths: "the Sunlit Baths", arcades: "the Arcades", deep: "the Deep" };

/** The level's name as a surveyor says it — no digits, on purpose. */
export const HINT_LEVEL_NAMES: Record<number, string> = {
  0: "the Lobby",
  1: "the Poolrooms",
  2: "Pipe Dreams",
  3: "the Electrical Station",
  4: "the Abandoned Office",
  5: "the Terror Hotel",
  6: "Lights Out",
  7: "Thalassophobia",
  8: "the Cave System",
  9: "the Suburbs",
};

/** Where a cell is, as vaguely as Voss will say it: the kind of room, the
 *  side of the level, and a walk from the door ("a long walk", never a
 *  number). */
export function placeHint(sector: Sector, level: number, x: number, y: number): string {
  const size = sector.size;
  const cx = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(size - 1, Math.floor(y)));
  const door = sector.doors[0];
  let where = "the rooms";
  if (level === 1 && door) {
    where = POOL_ZONES[zoneAt(cx, cy, door, size)] ?? where;
  } else {
    const type = sector.districts[sector.district[cy * size + cx]]?.type as string | undefined;
    where = (type && PLACE[level]?.[type]) ?? where;
  }
  // Which side of the level, by the map's own orientation (y grows south).
  const dx = cx - size / 2, dy = cy - size / 2;
  const side = Math.hypot(dx, dy) < size * 0.15
    ? "near the middle"
    : `toward the ${Math.abs(dy) > Math.abs(dx) * 2 ? (dy < 0 ? "north" : "south")
      : Math.abs(dx) > Math.abs(dy) * 2 ? (dx < 0 ? "west" : "east")
      : `${dy < 0 ? "north" : "south"}-${dx < 0 ? "west" : "east"}`} side`;
  const far = door ? Math.hypot(cx - door.x, cy - door.y) : size;
  const walk = far < size * 0.2 ? "not far from" : far < size * 0.45 ? "a fair walk from" : "a long walk from";
  const doorName = door?.name ?? "the way in";
  return `${where} of ${HINT_LEVEL_NAMES[level] ?? "that level"}, ${side}, ${walk} ${doorName}`;
}
