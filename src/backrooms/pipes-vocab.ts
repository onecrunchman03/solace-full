// PIPE DREAMS — the shared vocabulary: deco codes, footprints, furniture
// names, the safe room types. Pure data with NO imports, so the generator,
// the room library's parser (pipes-tiles.ts) and the room editor (a browser
// page, which cannot load worldgen.ts's node:crypto) all read one table. The
// client keeps its own copy in client/src/backrooms/pipes-props.ts and the
// harness compares the two.

/** Level 2's room types — a subset of worldgen.ts's DistrictType. */
export type PipeType =
  | "pipegallery"
  | "servicering"
  | "corridor"
  | "tunnel"
  | "office"
  | "suite"
  | "breakroom"
  | "controlroom"
  | "enginehall"
  | "catwalk"
  | "boilerhouse"
  | "warehouse"
  | "machineshop"
  | "drainroom"
  | "vault";

/** Steps between decks (3m). */
export const BAND = 6;
/** How far an engine hall's floor sits under its catwalks: one deck. */
export const PIT_SINK = 6;

// ---- Deco codes (kind*16 + variant) --------------------------------------------
// The server reads vent, panel, exitdoor and hatch; the rest is dressing the
// client builds props from. Codes 3 and 4 are retired (safety and catwalks are
// ROOM TYPES — see SAFE_TYPES and "catwalk").
export const PDECO = Object.freeze({
  none: 0,
  /** Steam vent on this cell's wall. v = side: 0 N, 1 E, 2 S, 3 W. */
  vent: 1,
  /** Caged ceiling bulb. v0 working · v1 dead · v2 flickering. */
  lamp: 2,
  /** Stair cell. v = direction of ASCENT: 0 N, 1 E, 2 S, 3 W. */
  stairs: 5,
  /** The fuse panel beside the pressure door. v = wall side. */
  panel: 6,
  /** Prop locked door (scenery — a sealed room behind it). v = wall side. */
  lockeddoor: 7,
  /** Machine anchor (NW cell of a SOLID footprint). v indexes MACHINES. */
  machine: 8,
  /** Tank / boiler anchor (NW cell of a SOLID footprint). v indexes TANKS. */
  tank: 9,
  /** Storage rack cell (solid). v0 run E-W, v1 N-S. */
  rack: 10,
  /** The drain hatch overhead + ladder: the one entrance. */
  hatch: 11,
  /** The pressure door to Level 3, on this cell's wall. v = wall side. */
  exitdoor: 12,
  /** Wall furniture, first set (WALL_A). v = type*4 + the wall it backs onto. */
  wallA: 13,
  /** Wall furniture, second set (WALL_B). v = type*4 + the wall it backs onto. */
  wallB: 14,
  /** Free-standing furniture (FREE). v = type*2 + axis (0: long side E-W). */
  free: 15,
});
export const pdecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);

/** Machine footprints by variant (w along x, h along y). All SOLID. */
export const MACHINES: readonly { name: string; w: number; h: number }[] = [
  { name: "pump", w: 2, h: 2 },
  { name: "generator", w: 2, h: 1 },
  { name: "generator", w: 1, h: 2 },
  { name: "cabinet", w: 1, h: 1 },
  { name: "turbine", w: 6, h: 3 },
  { name: "turbine", w: 3, h: 6 },
  { name: "transformer", w: 2, h: 2 },
  { name: "compressor", w: 2, h: 1 },
  { name: "compressor", w: 1, h: 2 },
  { name: "lathe", w: 2, h: 1 },
  { name: "lathe", w: 1, h: 2 },
  { name: "press", w: 2, h: 2 },
];

/** Tank footprints by variant. All SOLID. */
export const TANKS: readonly { name: string; w: number; h: number }[] = [
  { name: "boiler", w: 5, h: 3 },
  { name: "boiler", w: 3, h: 5 },
  { name: "vtank", w: 2, h: 2 },
  { name: "htank", w: 4, h: 2 },
  { name: "htank", w: 2, h: 4 },
];

export const WALL_A = ["locker", "workbench", "cabinet", "console"] as const;
export const WALL_B = ["shelf", "counter", "breaker", "manifold"] as const;
export const FREE = ["bench", "table", "desk", "crates", "drums", "pallet", "cabledrum", "stall"] as const;

/** Room types a player is SAFE in (lit; the Grabber stays out). */
export const SAFE_TYPES: ReadonlySet<PipeType> = new Set<PipeType>(["breakroom", "controlroom", "drainroom"]);

/** Every district type Level 2 uses, in the order the zone letters list them. */
export const PIPE_TYPES: readonly PipeType[] = [
  "pipegallery",
  "servicering",
  "corridor",
  "tunnel",
  "office",
  "suite",
  "breakroom",
  "controlroom",
  "enginehall",
  "catwalk",
  "boilerhouse",
  "warehouse",
  "machineshop",
  "drainroom",
  "vault",
];

/** Types where a drop of two steps or more is by design (a hall's pit under
 *  its catwalks — the client rails every such edge). */
export const HALL_TYPES: ReadonlySet<PipeType> = new Set<PipeType>(["enginehall", "catwalk"]);
