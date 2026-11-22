// THE SURFACES — every wall, floor and ceiling a room can wear, on any level,
// as the map editor offers them (Josh, Sep 2026: "how do you apply textures in the
// editor" → a look picker: choose a room's walls, floor and ceiling
// separately, from the textures there are).
//
// By default a room wears its LEVEL's look — on Level 0 its room TYPE's
// (LOBBY_LOOK in the client's world.ts, whose wall / floor / ceil numbers are
// indexes into these lists), on the Poolrooms the white tile, in Pipe Dreams
// the raw concrete. A room design may override any of the three with `look`
// (tiles.ts), on every level (Josh: "do all the levels now"), and since the
// "next level" round also its LIGHTS (how many are on, how many flicker, how
// bright the room is) and its SOUND (a loop over the level's own hum).
// Imports nothing, so the server, the editor and the game all read it.
//
// APPEND ONLY, per kind: a built-in surface's INDEX is its number in
// LOBBY_LOOK. Rename a `name` freely; never reorder, never remove.
//
// A surface with `file` is a PHOTOGRAPH under /assets/br/tex/ (`<file>-color.jpg`
// and, with `normal`, `<file>-normal.jpg`), `sizeM` metres across. One without
// is DRAWN by the game (world.ts buildLookMats knows each by index).
//
// CUSTOM TEXTURES (Josh, Sep 2026: "add a texture in the editor"): photos
// uploaded from the editor, kept in the database (map_surfaces) and served
// from /api/br-surface/<file>. They join the lists at runtime through
// setCustomSurfaces — the server at boot and after an upload, the editor from
// its state, the game from the chunks that use one — and are named by a
// stable id ("c<n>") exactly like a built-in one.

export type SurfaceKind = "wall" | "floor" | "ceil";

export interface Surface {
  /** Stable id — what a room design stores. Never change it. */
  id: string;
  name: string;
  /** Photographed: the file stem under /assets/br/tex/. */
  file?: string;
  /** The photograph's real width in metres (how big one repeat is). */
  sizeM?: number;
  /** The photograph ships a `<file>-normal.jpg`. */
  normal?: boolean;
  roughness?: number;
  /** Hang it LEVEL: it has horizontal detail (a rail, a panel row) that would
   *  jump between wall segments at the usual random height (walls only). */
  level?: boolean;
  /** Who made it and under what licence, for a downloaded texture. */
  credit?: string;
}

/** A texture uploaded in the editor. */
export interface CustomSurface extends Surface {
  kind: SurfaceKind;
  /** Where the picture is served (/api/br-surface/<file>). */
  url: string;
}

export const SURFACES: Readonly<Record<SurfaceKind, readonly Surface[]>> = {
  wall: [
    { id: "paper-chevron", name: "Yellow wallpaper — chevrons" },
    { id: "paper-dots", name: "Yellow wallpaper — dots" },
    { id: "paper-stripes", name: "Yellow wallpaper — stripes" },
    { id: "paper-manila", name: "Manila wallpaper (old, brown)" },
    { id: "wall-tile", name: "Small wall tile" },
    {
      id: "wood-panels",
      name: "Wood panelling",
      file: "wooden-panels",
      sizeM: 4.2,
      normal: true,
      roughness: 0.55,
      level: true,
      credit: '"Wooden Panels" by Dimitrios Savva, Poly Haven (CC0)',
    },
    { id: "concrete-wall", name: "Concrete" },
    { id: "pool-tile", name: "White pool tile" },
    // P6's references (Josh, Sep 29 2026): the Deep's darker stone
    { id: "grey-marble-wall", name: "Grey marble", file: "grey-marble", sizeM: 2.4, normal: true, roughness: 0.3, credit: '"Liminal Pools Scene" by PyramyDD, Sketchfab (CC BY 4.0)' },
    // The Electrical Station's own wall (Oct 2026, law 8's reference task:
    // every one of the 20 is brick corridors under sodium light). 1m square,
    // ~7cm a course — real brick scale. Its courses run level (`level`).
    { id: "red-brick", name: "Red brick", file: "red-brick", sizeM: 1, normal: true, roughness: 0.85, level: true, credit: '"Red Brick 03" by Rob Tuytel, Poly Haven (CC0)' },
    // Level 4, the Abandoned Office (Oct 2026, its 20 references: beige painted
    // drywall over grey commercial carpet). Plaster, tinted the beige of an
    // office wall; one repeat is 2m.
    { id: "office-drywall", name: "Beige drywall", file: "office-drywall", sizeM: 2, normal: true, roughness: 0.8, credit: '"Painted Plaster 017" by ambientCG (CC0)' },
    // THE INTAKE OF OCT 12 2026 (scripts/assets/texture.mjs): the industrial
    // set fetched for the Station round, and the hotel pack's own materials
    // for the hotel level to come. Tiles hang LEVEL so their grout runs true.
    { id: "black-metal", name: "Black powder-coated metal", file: "black-metal", sizeM: 2, normal: true, roughness: 0.5, credit: '"Metal 027" by ambientCG (CC0)' },
    { id: "rusted-plates", name: "Rusted metal plates", file: "rusted-plates", sizeM: 2, normal: true, roughness: 0.7, credit: '"Metal Plates 013" by ambientCG (CC0)' },
    { id: "green-rust-metal", name: "Green painted metal, rusting", file: "green-rust-metal", sizeM: 2, normal: true, roughness: 0.6, credit: '"Painted Metal 006" by ambientCG (CC0)' },
    { id: "grey-rust-metal", name: "Grey painted metal, rusting", file: "grey-rust-metal", sizeM: 2, normal: true, roughness: 0.6, credit: '"Painted Metal 014" by ambientCG (CC0)' },
    { id: "green-metal", name: "Green metal", file: "green-metal", sizeM: 2, normal: true, roughness: 0.55, credit: '"Green Metal Rust" by Rob Tuytel, Poly Haven (CC0)' },
    { id: "worn-red-metal", name: "Worn red painted metal", file: "worn-red-metal", sizeM: 2, normal: true, roughness: 0.6, credit: '"Rusty Painted Metal" by Amal Kumar, Poly Haven (CC0)' },
    { id: "dirty-white-tile", name: "Dirty white tile", file: "dirty-white-tile", sizeM: 1, normal: true, roughness: 0.4, level: true, credit: '"Tiles 054" by ambientCG (CC0)' },
    { id: "corroded-tile", name: "Corroded grid tile", file: "corroded-tile", sizeM: 1.2, normal: true, roughness: 0.6, level: true, credit: '"Tiles 140" by ambientCG (CC0)' },
    { id: "dirty-brown-tile", name: "Dirty brown tile", file: "dirty-brown-tile", sizeM: 2, normal: true, roughness: 0.6, level: true, credit: '"Dirty Tiles" by Matterfield, Jenelle van Heerden, Poly Haven (CC0)' },
    { id: "white-square-tile", name: "White square tile", file: "white-square-tile", sizeM: 1, normal: true, roughness: 0.3, level: true, credit: '"Tiles 036" by ambientCG (CC0)' },
    { id: "hotel-dark-wood", name: "Dark wood panelling", file: "hotel-dark-wood", sizeM: 2, normal: true, roughness: 0.5, credit: '"Wood 067" by ambientCG (CC0)' },
    { id: "hotel-cream-wallpaper", name: "Cream hotel wallpaper", file: "hotel-cream-wallpaper", sizeM: 1, normal: true, roughness: 0.8, credit: '"Hotel Asset Pack" (author not recorded)' },
    { id: "hotel-white-wallpaper", name: "White hotel wallpaper", file: "hotel-white-wallpaper", sizeM: 1, normal: true, roughness: 0.8, credit: '"Wallpaper 001 A" by ambientCG (CC0)' },
    // Level 5, the Terror Hotel (Oct 2026, scripts/assets/level5.json): two
    // Poly Haven jacquards as wallpaper, at their scanned size. The quatrefoil
    // weave was crimson — re-coloured mahogany over its own light and shade.
    // The floral's 0.25 × 0.38m repeat was laid 3 across × 2 down to make a
    // square (0.76m) one, so it tiles without stretching.
    { id: "mahogany-damask", name: "Mahogany damask wallpaper", file: "mahogany-damask", sizeM: 0.28, normal: true, roughness: 0.85, credit: '"Quatrefoil Jacquard Fabric" by colormass, Rico Cilliers, Poly Haven (CC0)' },
    { id: "dark-floral-wallpaper", name: "Dark floral wallpaper", file: "dark-floral-wallpaper", sizeM: 0.76, normal: true, roughness: 0.8, credit: '"Floral Jacquard" by colormass, Rico Cilliers, Poly Haven (CC0)' },
    // Level 6, Lights Out (Oct 2026, scripts/assets/level6.json): stained
    // poured concrete for the corridors, cracked and flaking for the rooms.
    { id: "poured-concrete", name: "Stained poured concrete", file: "poured-concrete", sizeM: 3, normal: true, roughness: 0.85, credit: '"Concrete Wall 006" by Dario Barresi, Charlotte Baglioni, Poly Haven (CC0)' },
    { id: "cracked-concrete", name: "Cracked concrete", file: "cracked-concrete", sizeM: 2.5, normal: true, roughness: 0.85, credit: '"Cracked Concrete Wall" by Dimitrios Savva, Rico Cilliers, Poly Haven (CC0)' },
    // Level 8, the Cave System (Oct 2026): brown limestone for the caverns,
    // a damp mossy rock for the Deep's passages.
    { id: "cave-rock", name: "Limestone rock face", file: "cave-rock", sizeM: 3, normal: true, roughness: 0.85, credit: '"Rock Face 03" by Dario Barresi, Rico Cilliers, Poly Haven (CC0)' },
    { id: "cave-damp-rock", name: "Damp mossy rock", file: "cave-damp-rock", sizeM: 2.5, normal: true, roughness: 0.6, credit: '"Rock Wall 02" by Rob Tuytel, Poly Haven (CC0)' },
  ],
  floor: [
    { id: "carpet", name: "Yellow carpet" },
    { id: "carpet-stained", name: "Stained brown carpet" },
    { id: "floor-tile", name: "Cream floor tile" },
    { id: "concrete-floor", name: "Concrete" },
    { id: "carpet-green", name: "Green carpet" },
    { id: "pool-tile-floor", name: "White pool tile" },
    { id: "metal-walkway", name: "Rusted metal walkway" },
    { id: "grey-marble-floor", name: "Grey marble", file: "grey-marble", sizeM: 2.4, normal: true, roughness: 0.3, credit: '"Liminal Pools Scene" by PyramyDD, Sketchfab (CC BY 4.0)' },
    { id: "cream-marble-floor", name: "Cream marble", file: "cream-marble", sizeM: 2.0, normal: true, roughness: 0.35, credit: '"Liminal Pools Scene" by PyramyDD, Sketchfab (CC BY 4.0)' },
    // Level 4: the office's dark grey-blue commercial carpet, 1m a repeat.
    { id: "office-carpet", name: "Grey office carpet", file: "office-carpet", sizeM: 1, normal: true, roughness: 0.95, credit: '"Carpet 001" by ambientCG (CC0)' },
    // the intake of Oct 12 2026 (see the walls)
    { id: "corroded-tile-floor", name: "Corroded grid tile", file: "corroded-tile", sizeM: 1.2, normal: true, roughness: 0.6, credit: '"Tiles 140" by ambientCG (CC0)' },
    { id: "dirty-brown-tile-floor", name: "Dirty brown tile", file: "dirty-brown-tile", sizeM: 2, normal: true, roughness: 0.6, credit: '"Dirty Tiles" by Matterfield, Jenelle van Heerden, Poly Haven (CC0)' },
    { id: "wet-asphalt", name: "Wet asphalt", file: "wet-asphalt", sizeM: 2, normal: true, roughness: 0.3, credit: '"Asphalt 025 C" by ambientCG (CC0)' },
    { id: "diamond-plate", name: "Diamond plate", file: "diamond-plate", sizeM: 1, normal: true, roughness: 0.45, credit: '"Diamond Plate 008 C" by ambientCG (CC0)' },
    { id: "rubber-matting", name: "Rubber matting", file: "rubber-matting", sizeM: 1, normal: true, roughness: 0.9, credit: '"Rubber 004" by ambientCG (CC0)' },
    { id: "epoxy-floor", name: "Chipped epoxy floor", file: "epoxy-floor", sizeM: 2, normal: true, roughness: 0.5, credit: '"Garage Floor" by Jenelle van Heerden, Poly Haven (CC0)' },
    { id: "hotel-red-carpet", name: "Red hotel carpet", file: "hotel-red-carpet", sizeM: 1, normal: true, roughness: 0.95, credit: '"Fabric 026" by ambientCG (CC0)' },
    { id: "herringbone-floor", name: "Herringbone parquet", file: "herringbone-floor", sizeM: 2, normal: true, roughness: 0.55, credit: '"Wood Floor 053" by ambientCG (CC0)' },
    { id: "wood-plank-floor", name: "Wood plank floor", file: "wood-plank-floor", sizeM: 2, normal: true, roughness: 0.55, credit: '"Wood Floor 007" by ambientCG (CC0)' },
    { id: "checker-marble-floor", name: "Checkered marble", file: "checker-marble-floor", sizeM: 2, normal: true, roughness: 0.3, credit: '"Tiles 074" by ambientCG (CC0)' },
    // Level 6: broken, patched concrete underfoot; a darker stained one under
    // the Wet End's water.
    { id: "damaged-concrete-floor", name: "Damaged concrete", file: "damaged-concrete-floor", sizeM: 3, normal: true, roughness: 0.8, credit: '"Concrete Floor Damaged 01" by Rob Tuytel, Poly Haven (CC0)' },
    { id: "stained-concrete-floor", name: "Stained concrete", file: "stained-concrete-floor", sizeM: 3, normal: true, roughness: 0.5, credit: '"Damaged Concrete Floor" by Rob Tuytel, Poly Haven (CC0)' },
    // Level 8: grey gravel on the cave floors, a stony bed under the river.
    { id: "cave-gravel", name: "Cave gravel", file: "cave-gravel", sizeM: 3, normal: true, roughness: 0.9, credit: '"Rock Ground" by Rob Tuytel, Poly Haven (CC0)' },
    { id: "cave-riverbed", name: "Stony riverbed", file: "cave-riverbed", sizeM: 3, normal: true, roughness: 0.4, credit: '"Rocks Ground 02" by Rob Tuytel, Poly Haven (CC0)' },
  ],
  ceil: [
    { id: "drop-ceiling", name: "Drop ceiling (tiles and panels)" },
    { id: "concrete-ceiling", name: "Bare concrete" },
    { id: "pool-tile-ceiling", name: "White pool tile" },
    // Level 8: the cave's roof, the limestone of its walls.
    { id: "cave-rock-ceiling", name: "Limestone rock", file: "cave-rock", sizeM: 3, normal: true, roughness: 0.85, credit: '"Rock Face 03" by Dario Barresi, Rico Cilliers, Poly Haven (CC0)' },
  ],
};

/** LEVEL 0 WEARS THE BACKROOMS AND NOTHING ELSE (Josh, Sep 30 2026: "level 0
 *  should only have backrooms texturing not pools or stuff from pipe
 *  dream"). The yellow papers, the manila, the office panelling, the carpets
 *  and the drop ceiling. The tile reads as the Poolrooms and the concrete IS
 *  Pipe Dreams' (the same photographs), so neither is offered on Level 0 and
 *  its checker refuses them. A texture Josh uploads himself is his call and
 *  is allowed anywhere. */
export const LEVEL0_SURFACES: Readonly<Record<SurfaceKind, readonly string[]>> = {
  wall: ["paper-chevron", "paper-dots", "paper-stripes", "paper-manila", "wood-panels"],
  floor: ["carpet", "carpet-stained", "carpet-green"],
  ceil: ["drop-ceiling"],
};
/** THE POOLROOMS WEAR THE TILE AND NOTHING ELSE (Josh, Oct 11 2026: "I do
 *  not want marble or stone in the pools. I just want the tile"). The marble
 *  entries stay in the catalogue (append-only — their index is a number on
 *  the wire), but no Poolrooms room may wear them and the picker never
 *  offers them there. */
export const LEVEL1_SURFACES: Readonly<Record<SurfaceKind, readonly string[]>> = {
  wall: ["pool-tile"],
  floor: ["pool-tile-floor"],
  ceil: ["pool-tile-ceiling"],
};
const LEVEL_ONLY: Readonly<Record<number, Readonly<Record<SurfaceKind, readonly string[]>>>> = { 0: LEVEL0_SURFACES, 1: LEVEL1_SURFACES };
/** May this surface be worn on this level? Uploaded textures always may. */
export function surfaceOnLevel(kind: SurfaceKind, id: string, level: number): boolean {
  const only = LEVEL_ONLY[level];
  if (!only) return true;
  if (!SURFACES[kind].some((s) => s.id === id)) return true; // an upload (or unknown — lookProblems says so)
  return only[kind].includes(id);
}
/** The surfaces a level's look picker offers (built-in ones). */
export function levelSurfaces(kind: SurfaceKind, level: number): readonly Surface[] {
  return SURFACES[kind].filter((s) => surfaceOnLevel(kind, s.id, level));
}

let CUSTOM: CustomSurface[] = [];
/** The uploaded textures there are (replaces the list). */
export function setCustomSurfaces(list: readonly CustomSurface[]): void {
  CUSTOM = [...list];
}
/** Add (or refresh) some uploaded textures without dropping the others — the
 *  game learns them a chunk at a time. */
export function addCustomSurfaces(list: readonly CustomSurface[]): void {
  for (const c of list) {
    const k = CUSTOM.findIndex((q) => q.id === c.id);
    if (k >= 0) CUSTOM[k] = c;
    else CUSTOM.push(c);
  }
}
export function customSurfaces(kind?: SurfaceKind): readonly CustomSurface[] {
  return kind ? CUSTOM.filter((c) => c.kind === kind) : CUSTOM;
}
/** Every surface of a kind, built-in first, then the uploaded ones. */
export function allSurfaces(kind: SurfaceKind): readonly Surface[] {
  return [...SURFACES[kind], ...customSurfaces(kind)];
}

/** The index of a BUILT-IN surface id within its kind, or -1. */
export function surfaceIndex(kind: SurfaceKind, id: string | undefined): number {
  if (!id) return -1;
  return SURFACES[kind].findIndex((s) => s.id === id);
}
/** A surface by id, built-in or uploaded, or null. */
export function findSurface(kind: SurfaceKind, id: string | undefined): Surface | CustomSurface | null {
  if (!id) return null;
  return SURFACES[kind].find((s) => s.id === id) ?? CUSTOM.find((c) => c.kind === kind && c.id === id) ?? null;
}

// ---- ROOM SOUNDS -------------------------------------------------------------
// A loop the room plays over its level's hum while you stand in it (the
// client's ambience layer crossfades it in and out). "silence" hushes the
// level's own hum instead. The loops were generated for this (scripts/
// gen-sounds.mjs "rooms") or are the levels' own beds.
export interface RoomSound {
  id: string;
  name: string;
  /** null = hush the level's hum. */
  url: string | null;
}
export const ROOM_SOUNDS: readonly RoomSound[] = [
  { id: "silence", name: "Silence (the hum stops)", url: null },
  { id: "drip", name: "Dripping water", url: "/assets/br/rooms/drip.ogg" },
  { id: "buzz", name: "Buzzing lights", url: "/assets/pipes/bulb-buzz.ogg" },
  { id: "machine", name: "Machinery", url: "/assets/pipes/hum-machine.ogg" },
  { id: "radio", name: "A radio in the static", url: "/assets/br/rooms/radio.ogg" },
  { id: "wind", name: "Wind in the vents", url: "/assets/br/rooms/wind.ogg" },
  { id: "music", name: "Music through the wall", url: "/assets/br/rooms/music.ogg" },
  { id: "lobby", name: "Level 0's hum", url: "/assets/ambience.ogg" },
  { id: "pools", name: "The Poolrooms' water", url: "/assets/pools/ambience.ogg" },
  { id: "pipes", name: "Pipe Dreams' tunnels", url: "/assets/pipes/ambience.ogg" },
];
export const roomSound = (id: string | undefined): RoomSound | null => (id ? (ROOM_SOUNDS.find((s) => s.id === id) ?? null) : null);

/** A room design's style override: any of its surfaces by id, its lights and
 *  its sound. Every field optional — missing means the room's usual. */
export interface LookSpec {
  wall?: string;
  floor?: string;
  ceil?: string;
  /** Share of the room's lights that are on, percent (0–100). */
  lights?: number;
  /** Share of the lights that flicker, percent (0–100). */
  flicker?: number;
  /** How bright the room is, percent of the usual (10–200). */
  bright?: number;
  /** A ROOM_SOUNDS id. */
  sound?: string;
}

/** Everything wrong with a look override, as plain sentences. */
export function lookProblems(look: LookSpec | undefined, level?: number): string[] {
  if (!look) return [];
  const out: string[] = [];
  for (const kind of ["wall", "floor", "ceil"] as const) {
    const id = look[kind];
    const what = kind === "ceil" ? "ceiling" : kind;
    if (id !== undefined && !findSurface(kind, id)) out.push(`the look's ${what} "${id}" isn't a ${what} surface`);
    else if (id !== undefined && level !== undefined && !surfaceOnLevel(kind, id, level))
      out.push(`the look's ${what} "${id}" belongs to another level — ${level === 1 ? "the Poolrooms wear only the pool tile" : "Level 0 wears only the backrooms' own surfaces"}`);
  }
  const range = (v: number | undefined, lo: number, hi: number, what: string): void => {
    if (v !== undefined && (!Number.isFinite(v) || v < lo || v > hi)) out.push(`the room's ${what} must be ${lo}–${hi}%`);
  };
  range(look.lights, 0, 100, "lights on");
  range(look.flicker, 0, 100, "flickering lights");
  range(look.bright, 10, 200, "brightness");
  if (look.sound !== undefined && !roomSound(look.sound)) out.push(`the room's sound "${look.sound}" isn't one there is`);
  return out;
}

/** A look with nothing in it is no look (the library stores none). */
export function lookIsEmpty(look: LookSpec | undefined): boolean {
  return !look || Object.values(look).every((v) => v === undefined);
}

/** A look's comparable form: the same style always gives the same key. */
export function lookKey(look: LookSpec): string {
  const o: Record<string, unknown> = {};
  for (const k of ["wall", "floor", "ceil", "lights", "flicker", "bright", "sound"] as const) if (look[k] !== undefined) o[k] = look[k];
  return JSON.stringify(o);
}

/** THE STYLE TABLE of a map: every distinct look the rooms wear, once.
 *  Sector.look holds, per cell, 1 + its index here (0 = the room's usual).
 *  `styleOf` hands out the number for a look, adding it the first time. */
export class StyleTable {
  readonly styles: LookSpec[] = [];
  private keys = new Map<string, number>();
  styleOf(look: LookSpec | undefined): number {
    if (lookIsEmpty(look)) return 0;
    const k = lookKey(look!);
    let i = this.keys.get(k);
    if (i === undefined) {
      i = this.styles.length;
      this.styles.push({ ...look! });
      this.keys.set(k, i);
    }
    return i + 1;
  }
}
