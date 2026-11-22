// THE MAP EDITOR's LEVEL KITS — everything the editor draws differently for
// each level built from rooms. The room format itself (tiles.ts) is the same
// for every level; each level brings its own DIALECT (its room types, its
// furniture, its rules — pipes-tiles.ts, pools-tiles.ts), and this file adds
// what only the editor needs on top: colours, ceiling heights for the 3D
// preview, the words in the palette and the stats of a built level.
//
// A new level built from rooms = a dialect on the server side, and one entry
// here.

import type { Dialect, Footprint, Lint, Tile, TileDef } from "../../../src/backrooms/tiles";
import { PIPES_DIALECT, lintTile as lintPipeTile } from "../../../src/backrooms/pipes-tiles";
import { POOLS_DIALECT, lintPoolTile } from "../../../src/backrooms/pools-tiles";
import { LOBBY_DIALECT, lintLobbyTile } from "../../../src/backrooms/lobby-tiles";
import { STATION_DIALECT, lintStationTile } from "../../../src/backrooms/station-tiles";
import { STATION_CEILINGS, type StationType } from "../../../src/backrooms/station-vocab";
import { OFFICE_DIALECT, lintOfficeTile } from "../../../src/backrooms/office-tiles";
import { OFFICE_CEILINGS, type OfficeType } from "../../../src/backrooms/office-vocab";
import { HOTEL_DIALECT, lintHotelTile } from "../../../src/backrooms/hotel-tiles";
import { HOTEL_CEILINGS, type HotelType } from "../../../src/backrooms/hotel-vocab";
import { LIGHTS_DIALECT, lintLightsTile } from "../../../src/backrooms/lights-tiles";
import { OCEAN_DIALECT, lintOceanTile } from "../../../src/backrooms/ocean-tiles";
import { OCEAN_CEILINGS, type OceanType } from "../../../src/backrooms/ocean-vocab";
import { CAVE_DIALECT, lintCaveTile } from "../../../src/backrooms/cave-tiles";
import { CAVE_CEILINGS, CAVE_WET_TYPES, type CaveType } from "../../../src/backrooms/cave-vocab";
import { SUBURB_DIALECT, lintSuburbTile } from "../../../src/backrooms/suburb-tiles";
import { SUBURB_CEILINGS, type SuburbType } from "../../../src/backrooms/suburb-vocab";
import { LIGHTS_CEILINGS, type LightsType } from "../../../src/backrooms/lights-vocab";
import { LOBBY_CEILINGS } from "../../../src/backrooms/lobby-vocab";
import { POOL_CEILINGS, wetFloor } from "../../../src/backrooms/pools-vocab";
import { PIPE_CEILINGS, pipeHallRoof } from "../backrooms/pipes-props";

export interface LevelKit {
  level: number;
  dia: Dialect;
  lint: (def: TileDef) => Lint & { tile: Tile };
  /** Footprint table of a block piece (machines, pillars), or undefined. */
  blocks: (k: string) => readonly Footprint[] | undefined;
  zoneColor: Readonly<Record<string, string>>;
  pieceColor: Readonly<Record<string, string>>;
  /** Metres from a floor (m) of this type to its ceiling. */
  headroom: (type: string, floorM: number) => number;
  /** The height layer's help line, and how a height reads in the palette. */
  heightHelp: string;
  heightLabel: (v: number) => string;
  heights: readonly number[];
  /** Is a floor of h steps under water (drawn blue)? */
  wet: (h: number) => boolean;
  /** The order roles are listed in the room list. */
  roleOrder: readonly string[];
  /** "stretch" for Pipe Dreams, "set" elsewhere. */
  setLabel: string;
  doorWidths: readonly { w: number; label: string }[];
  mapHint: string;
  /** The whole-level view's stats, as HTML lines (values already numbers or
   *  plain text — escaped by the caller where they are strings). */
  statLines: (s: Record<string, unknown>, esc: (t: string) => string) => string;
  /** One sentence for the publish card. */
  publishLine: (s: Record<string, unknown>) => string;
}

const PIPES: LevelKit = {
  level: 2,
  dia: PIPES_DIALECT,
  lint: lintPipeTile,
  blocks: (k) => PIPES_DIALECT.blocks[k],
  zoneColor: {
    pipegallery: "#6d655a",
    servicering: "#5f594f",
    corridor: "#7d786e",
    tunnel: "#4d4943",
    office: "#77736b",
    suite: "#687078",
    breakroom: "#557a54",
    controlroom: "#4f7a6c",
    enginehall: "#34312d",
    catwalk: "#8a6a3a",
    boilerhouse: "#735f50",
    warehouse: "#6e6555",
    machineshop: "#5c6570",
    drainroom: "#44708a",
    vault: "#7a5048",
  },
  pieceColor: {
    wallA: "#d8d3c6",
    wallB: "#e0b070",
    free: "#b99a74",
    machine: "#7aa0c8",
    tank: "#c87a4a",
    rack: "#a0784a",
    lamp: "#ffe070",
    vent: "#ff5a4a",
    hatch: "#3cc8ff",
    exitdoor: "#ff3a3a",
    panel: "#ffc400",
    lockeddoor: "#e040b0",
  },
  headroom: (ty, f) => (ty === "enginehall" ? pipeHallRoof(f) - f : (PIPE_CEILINGS[ty] ?? 3)),
  heightHelp: "Floor height in steps of 0.5m. Doors must sit at 0 or ±6 (one deck). Only a catwalk may drop to an engine-hall pit.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 6 || v === -6 ? " (a deck)" : v === 0 ? " (the datum)" : ""}`,
  heights: [12, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6],
  wet: () => false,
  roleOrder: ["start", "goal", "hall", "gallery", "stair", "corridor", "room", "cap"],
  setLabel: "stretch",
  doorWidths: [
    { w: 1, label: "a door (rooms, tunnels)" },
    { w: 2, label: "double (corridors)" },
    { w: 3, label: "a gallery (3 wide)" },
    { w: 4, label: "4 wide" },
  ],
  mapHint: "Amber outlines are the route from the drain (blue) to the pressure door (red); warm dots are props. Click any piece to open its room.",
  statLines: (s, esc) => `
      <div><b>${s.pieces}</b> pieces · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>drain → door: <b>${s.exit}</b> cells walking</div>
      <div>loops: <b>${s.loops}</b> (${s.cross} cross-streets)</div>
      <div>lit rooms: <b>${s.safeRooms}</b> · furthest from light: <b>${s.maxToSafe}</b></div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>
      <div class="route">${esc(String(s.route))}</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> pieces, <b>${s.props}</b> props, ${s.exit} cells from the drain to the door.`,
};

const POOLS: LevelKit = {
  level: 1,
  dia: POOLS_DIALECT,
  lint: lintPoolTile,
  blocks: (k) => POOLS_DIALECT.blocks[k],
  zoneColor: {
    river: "#8fa6ad",
    natatorium: "#c9d2d2",
    vaultsea: "#9fb1b8",
    portalhall: "#b8c4c7",
    tunnels: "#a3adae",
    shallows: "#b3c8c9",
    rotunda: "#d4dada",
    baths: "#c2c9cf",
  },
  pieceColor: {
    pillar: "#f2f4f4",
    spiralcore: "#e6e0cc",
    arch: "#f7f3e8",
    portal: "#9de3ff",
    bridge: "#b98a5a",
    porthole: "#5cc8ff",
    cubby: "#d8c7a4",
    ladder: "#dfe7ee",
    skylight: "#fff4b0",
    window: "#ffd95a",
    door: "#ff3a3a",
  },
  headroom: (ty) => POOL_CEILINGS[ty] ?? 6,
  heightHelp: "Floor height in steps of 0.5m. The water line is at -1: anything drawn lower is under water (-2 ankle, -3 waist, -4 and deeper you swim). A doorway sits at 0 on dry floor: every room's water is its own.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the deck)" : v === -1 ? " (a dry step)" : v === -2 ? " (ankle water)" : v === -3 ? " (waist)" : v === -4 ? " (swim)" : v === -6 ? " (deep water)" : ""}`,
  heights: [8, 6, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6],
  wet: wetFloor,
  roleOrder: ["door", "hall", "corridor", "room", "cap"],
  setLabel: "set",
  doorWidths: [
    { w: 1, label: "a door (small rooms)" },
    { w: 3, label: "a doorway (3 wide)" },
  ],
  mapHint: "The level grows out from The Landing (red) in three zones: the sunlit baths nearest it, the arcades round them, the deep beyond. A room's set says which zone it stands in. Warm dots are props. Click any piece to open its room.",
  statLines: (s, esc) => `
      <div><b>${s.pieces}</b> pieces · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>zones: <b>${esc(String(s.route))}</b></div>
      <div>water: <b>${s.wet}%</b> of the floor, <b>${s.swim}%</b> deep enough to swim</div>
      <div>alligators: <b>${s.gators}</b> (one per big water)</div>
      <div>loops: <b>${s.loops}</b> (${s.links} built by the linker)</div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> pieces, <b>${s.props}</b> props, ${s.gators} alligator waters, ${s.wet}% under water.`,
};

const LOBBY: LevelKit = {
  level: 0,
  dia: LOBBY_DIALECT,
  lint: lintLobbyTile,
  blocks: () => undefined,
  zoneColor: {
    classic: "#b9a55c",
    pillars: "#ad9a55",
    offices: "#a6985a",
    warrens: "#8f8047",
    halls: "#b3a262",
    atrium: "#cbb872",
    terraces: "#bba963",
    sublevel: "#7e7040",
    // the Sep 2026 rooms, coloured like their looks
    manila: "#8c7446",
    restrooms: "#c9cdc6",
    panelled: "#7a5634",
    storage: "#8d8a82",
    unlit: "#3d3826",
  },
  pieceColor: { entrance: "#ff3a3a" },
  headroom: (ty) => LOBBY_CEILINGS[ty] ?? 5,
  heightHelp: "Floor height in steps of 0.5m. A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb; nine or more is a lethal shaft. Doorways sit at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : v <= -9 ? " (a lethal shaft)" : ""}`,
  heights: [4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -9, -12],
  wet: () => false,
  roleOrder: ["start", "landmark", "block"],
  setLabel: "set",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 4 cells into its module side)" }],
  mapHint: "Amber outlines are The Entrance and the landmarks; the key waits in the landmark farthest from THE DOOR. Click any piece to open its room.",
  statLines: (s, esc) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>doorways opened: <b>${s.opened}</b> (${s.tree} to connect everything, the rest for loops)</div>
      <div>THE DOOR is <b>${s.door}</b> cells from The Entrance · lore drives placed: <b>${s.drives}</b> of 20</div>
      <div>${esc(String(s.types))}</div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, THE DOOR ${s.door} cells from The Entrance, all ${s.drives} lore drives placed.`,
};

const STATION: LevelKit = {
  level: 3,
  dia: STATION_DIALECT,
  lint: lintStationTile,
  blocks: () => undefined,
  zoneColor: {
    intake: "#6f7f86",
    lifthall: "#8a7a52",
    switchroom: "#5c6f80",
    serviceway: "#6c6a62",
    cablevault: "#4e4c46",
    controldesk: "#4f7a6c",
    batteryroom: "#6a7450",
    xfmrbay: "#7a5a42",
    substation: "#3e4652",
    workshop: "#7a6a52",
    floodroom: "#3f6a8a",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    shutter: "#ff9a3a",
    breaker: "#ffc400",
    arc: "#9ad8ff",
    puddle: "#3c8cff",
    lamp: "#ffe070",
  },
  headroom: (ty) => STATION_CEILINGS[ty as StationType] ?? 3.4,
  heightHelp: "Floor height in steps of 0.5m. A step of one is a ramp you can walk; two or more is a ledge you can drop off but not climb. Doorways sit at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : ""}`,
  heights: [4, 3, 2, 1, 0, -1, -2, -3, -4],
  wet: () => false,
  roleOrder: ["start", "goal", "breaker", "block"],
  setLabel: "set",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: "Amber outlines are the pressure door's room, the lift hall and the six breaker rooms; each room belongs to one of six sections. Click any piece to open its room.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>breakers: <b>${s.breakers}</b> · cutoffs: <b>${s.cutoffs}</b> · lamps: <b>${s.lamps}</b></div>
      <div>live water: <b>${s.puddles}</b> cells (${s.drained} drained to keep a lever dry) · arcing panels: <b>${s.arcs}</b></div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, <b>${s.breakers}</b> breakers and <b>${s.cutoffs}</b> cutoffs, every one reachable.`,
};

const OFFICE: LevelKit = {
  level: 4,
  dia: OFFICE_DIALECT,
  lint: lintOfficeTile,
  blocks: () => undefined,
  zoneColor: {
    liftlobby: "#6f8a74",
    security: "#8a5a5a",
    stairwell: "#7a5a86",
    hallway: "#6c6a64",
    cubicles: "#7e7464",
    openplan: "#8a8270",
    conference: "#5e6f86",
    corneroffice: "#86705a",
    kitchenette: "#8a7650",
    copyroom: "#6f707c",
    records: "#6a6e58",
    serverroom: "#4e5866",
    washroom: "#5c7a7e",
    reception: "#7a7080",
    supply: "#6c645a",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    stairdoor: "#ff3ad8",
    keycard: "#ffc400",
    window: "#5cd8ff",
    lamp: "#ffe070",
  },
  headroom: (ty) => OFFICE_CEILINGS[ty as OfficeType] ?? 2.8,
  heightHelp: "Floor height in steps of 0.5m. The office is flat: keep everything at 0 unless a step is the point. Doorways sit at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : ""}`,
  heights: [2, 1, 0, -1, -2],
  wet: () => false,
  roleOrder: ["start", "key", "goal", "block"],
  setLabel: "set",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: "Amber outlines are the Lift Lobby, the Security Office (the keycard) and the Stairwell; every room is in one of eight blink zones. Click any piece to open its room.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>troffers: <b>${s.lamps}</b> (${s.dead} dead) · floor lit: <b>${s.lit}%</b> · windows: <b>${s.windows}</b></div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, the keycard and the stairwell door in place, ${s.lit}% of the floor lit.`,
};

const HOTEL: LevelKit = {
  level: 5,
  dia: HOTEL_DIALECT,
  lint: lintHotelTile,
  blocks: () => undefined,
  zoneColor: {
    landing: "#6f8a74",
    corridor: "#7a3c34",
    lounge: "#8c6e46",
    suite: "#96604a",
    lifthall: "#827858",
    beverly: "#b03838",
    linen: "#504c48",
    dining: "#8c6450",
    library: "#6e543c",
    boilergate: "#82502f",
    boiler: "#6e462e",
    pipeway: "#5c4838",
    coalstore: "#322e2c",
    rustydoor: "#965a96",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    rustydoor: "#ff3ad8",
    key: "#ff4a4a",
    register: "#ffd23c",
    lift: "#3cd2e6",
    lamp: "#ffe070",
    sconce: "#ffcf7a",
    furnace: "#ff8a1e",
    nest: "#9a46dc",
  },
  headroom: (ty) => HOTEL_CEILINGS[ty as HotelType] ?? 3.2,
  heightHelp: "Floor height in steps of 0.5m. The hotel is flat: keep everything at 0 unless a step is the point. Doorways sit at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : ""}`,
  heights: [2, 1, 0, -1, -2],
  wet: () => false,
  roleOrder: ["start", "hub", "suite", "gate", "goal", "block"],
  setLabel: "zone",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: "Amber outlines are the Service Stair, the Beverly Room, the Boiler Room's door and the Rusty Door; suites carry their numbers. Click any piece to open its room.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>suites: <b>${s.suites}</b> · lift doors: <b>${s.lifts}</b> · furnaces: <b>${s.furnaces}</b> · nests: <b>${s.nests}</b></div>
      <div>fixtures: <b>${s.lamps}</b> (${s.dead} dead) · ${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, <b>${s.suites}</b> suites for the register to choose from, the rusty door below stairs.`,
};

const LIGHTS: LevelKit = {
  level: 6,
  dia: LIGHTS_DIALECT,
  lint: lintLightsTile,
  blocks: () => undefined,
  zoneColor: {
    stairfoot: "#6f8a74",
    darkhall: "#5c5c5c",
    darkroom: "#706e6a",
    storeroom: "#786c56",
    piperun: "#605448",
    cellblock: "#686474",
    rubble: "#5a5046",
    deadoffice: "#747060",
    wetway: "#385878",
    cistern: "#2c4c74",
    seahatch: "#965a96",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    seahatch: "#ff3ad8",
    wheel: "#ff4a4a",
    battery: "#e6d23c",
    lamp: "#8a8a8a",
    batten: "#a0a0a0",
  },
  headroom: (ty) => LIGHTS_CEILINGS[ty as LightsType] ?? 3.0,
  heightHelp: "Floor height in steps of 0.5m. Lights Out is flat: keep everything at 0. Doorways sit at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : ""}`,
  heights: [2, 1, 0, -1, -2],
  wet: () => false,
  roleOrder: ["start", "goal", "block"],
  setLabel: "zone",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: "Outlines are the Stair and the Sea Hatch. The Wet End is blue: every floor cell of a flooded room is under water. The red cross is where the Handwheel lies on this seed. Click any piece to open its room.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>Handwheel spots: <b>${s.wheelSpots}</b> · battery spots: <b>${s.batterySpots}</b> · cells under water: <b>${s.wet}</b></div>
      <div>dead fixtures: <b>${s.lamps}</b> · ${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, the Handwheel on one of <b>${s.wheelSpots}</b> spots, the sea hatch in the water.`,
};

const OCEAN: LevelKit = {
  level: 7,
  dia: OCEAN_DIALECT,
  lint: lintOceanTile,
  blocks: () => undefined,
  zoneColor: {
    seatower: "#b0966a",
    searoof: "#8c9092",
    seawade: "#6f8a92",
    seasunk: "#587a88",
    seacanal: "#3c6478",
    seaplaza: "#1a2c40",
    seadrop: "#0c1622",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    subway: "#ff3ad8",
    helmet: "#ff4a4a",
    lamp: "#e8d070",
  },
  headroom: (ty) => OCEAN_CEILINGS[ty as OceanType] ?? 40,
  heightHelp: "Floor height in steps of 0.5m, the waterline at 0. Roofs (r) stand 1 to 12 out of the water; a waist-deep roof (w) is -1 or -2; a sunk roof (s) -4 to -10. Streets, the square and the deep take their own depth.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the waterline)" : ""}`,
  heights: [12, 6, 4, 2, 1, 0, -1, -2, -4, -6, -10],
  wet: (h) => h < 0,
  roleOrder: ["start", "goal", "block"],
  setLabel: "zone",
  doorWidths: [{ w: 2, label: "a street opening (2 wide, through the water)" }],
  mapHint: "Outlines are the hatch and the subway stair. Water is shaded by depth: the streets mid blue, the square and the Drop near black. The red cross is where the Diving Helmet lies on this seed. Click any piece to open its block.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> blocks · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>helmet spots: <b>${s.helmetSpots}</b> · cells in the water: <b>${s.wet}</b> (the Drop <b>${s.drop}</b>) · dry: <b>${s.dry}</b></div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> blocks, the Diving Helmet on one of <b>${s.helmetSpots}</b> spots, the subway stair at the bottom of the square.`,
};

const CAVE: LevelKit = {
  level: 8,
  dia: CAVE_DIALECT,
  lint: lintCaveTile,
  blocks: () => undefined,
  zoneColor: {
    subwaystair: "#6f8a74",
    platform: "#a8a49a",
    trackbed: "#4a6a8a",
    concourse: "#b8b2a2",
    breach: "#8a7e66",
    cavern: "#9c7c58",
    gallery: "#8c6e4e",
    caveriver: "#2c5a7c",
    chasm: "#6e5a44",
    grotto: "#6e7444",
    passage: "#7c4430",
    crawl: "#6a1e1e",
    chimney: "#965a96",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    chimney: "#ff3ad8",
    rope: "#ff4a4a",
    lamp: "#e8d070",
    batten: "#8a8a8a",
    flicker: "#c0b060",
  },
  headroom: (ty) => CAVE_CEILINGS[ty as CaveType] ?? 3.0,
  heightHelp: "Floor height in steps of 0.5m. Doorways sit at 0. A step of one is a slope; two or more a ledge you drop off but can't climb (leave a way round); i (-9) or lower a drop that kills — chasms only, never the Station. Crawlspaces stay flat.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : v <= -9 ? " (kills)" : ""}`,
  heights: [4, 3, 2, 1, 0, -1, -2, -3, -4, -10],
  wet: () => false,
  roleOrder: ["start", "goal", "block"],
  setLabel: "zone",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: `Outlines are the Subway Stair and the Chimney. The track and the river are blue (${CAVE_WET_TYPES.join(", ")}); the Burrower's passages red-brown, its crawlspaces dark red. The red cross is where the Climbing Rope lies on this seed. Click any piece to open its room.`,
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>rope spots: <b>${s.ropeSpots}</b> · the Burrower's ground: <b>${s.burrow}</b> cells (crawlspace <b>${s.crawl}</b>) · under water: <b>${s.wet}</b> · chasms: <b>${s.chasms}</b></div>
      <div>lamps: <b>${s.lamps}</b> · ${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, the Climbing Rope on one of <b>${s.ropeSpots}</b> spots, the Chimney at the far end of the Deep.`,
};

const SUBURB: LevelKit = {
  level: 9,
  dia: SUBURB_DIALECT,
  lint: lintSuburbTile,
  blocks: () => undefined,
  zoneColor: {
    manhole: "#6f8a74",
    road: "#3c3e44",
    sidewalk: "#9a968c",
    yard: "#4e7a3e",
    house: "#b89a72",
    garage: "#8a8478",
    park: "#3e6a34",
    porch: "#965a96",
  },
  pieceColor: {
    entrance: "#ff3a3a",
    frontdoor: "#ff3ad8",
    key: "#ff4a4a",
    lamp: "#e8d070",
    dead: "#8a8a8a",
    flicker: "#c0b060",
    porch: "#ffd890",
    porchdead: "#a08a6a",
  },
  // outdoors there is no ceiling: the preview stands a fence's height
  headroom: (ty) => (SUBURB_CEILINGS[ty as SuburbType] ?? 40) > 10 ? 1.2 : SUBURB_CEILINGS[ty as SuburbType],
  heightHelp: "The Suburbs are flat: leave every cell at 0.",
  heightLabel: (v) => `${v > 0 ? "+" : ""}${v}${v === 0 ? " (the floor)" : ""}`,
  heights: [0],
  wet: () => false,
  roleOrder: ["start", "goal", "block"],
  setLabel: "set",
  doorWidths: [{ w: 2, label: "a slot (2 wide, 3 cells into its module side)" }],
  mapHint: "Outlines are the Manhole and Number 9's front door. The red cross is where the House Key lies on this seed; yellow cells are lit streetlights (the Watch won't step into their light). Click any piece to open its room.",
  statLines: (s) => `
      <div><b>${s.pieces}</b> rooms · <b>${s.props}</b> props · built in ${s.ms} ms</div>
      <div>key spots: <b>${s.keySpots}</b> · streetlights: <b>${s.lamps}</b> (<b>${s.litLamps}</b> lit)</div>
      <div>${s.reach}% reachable · ${s.lost} cells sealed</div>`,
  publishLine: (s) => `The level builds cleanly: <b>${s.pieces}</b> rooms, the House Key on one of <b>${s.keySpots}</b> spots, Number 9 at the end of the last street.`,
};

export const LEVEL_KITS: Readonly<Record<number, LevelKit>> = { 0: LOBBY, 1: POOLS, 2: PIPES, 3: STATION, 4: OFFICE, 5: HOTEL, 6: LIGHTS, 7: OCEAN, 8: CAVE, 9: SUBURB };

export function levelKit(level: number): LevelKit {
  return LEVEL_KITS[level] ?? PIPES;
}
