// LEVEL 9 — THE SUBURBS — the shared vocabulary: the room types, the module
// the rooms are drawn to, the street grid, the deco codes the server and the
// client both read. Pure data with NO imports (the map editor, a browser page,
// reads it too). The design is BACKROOMS.md → "LEVEL 9 — THE SUBURBS".
//
// Josh, 2026-10-30 ("Go with your picks"): THE FRONT DOOR (a house key lies in
// one of the houses; it opens the front door of Number 9, the last house, and
// walking through it ends the descent), THE NEIGHBORHOOD WATCH (it walks the
// dark streets; the pools under the streetlights are safe, the houses are where
// you hide, and it knocks), and a STREET GRID of house lots under a night sky.

/** The Suburbs' room types. APPEND ONLY: a type's index is its district id on
 *  the wire (sector.district). Every name is the suburbs' OWN (the client keys
 *  ceilings and looks by type NAME across every level). */
export type SuburbType =
  | "manhole" //  the way in: the manhole you climb out of, in a lit cul-de-sac (SAFE)
  | "road" //     asphalt, the middle of a street
  | "sidewalk" // the pavement either side of a road, the verge
  | "yard" //     lawns, fences, front paths
  | "house" //    inside a house (indoors: the Watch never comes in)
  | "garage" //   inside a garage (indoors)
  | "park" //     the park: grass, a playground
  | "porch"; //   Number 9's front yard, under its porch light: THE FRONT DOOR
export const SUBURB_TYPES: readonly SuburbType[] = ["manhole", "road", "sidewalk", "yard", "house", "garage", "park", "porch"];

/** THE LATTICE: Lights Out's — 8-cell modules (16m), a 2-wide doorway SLOT in
 *  the middle two cells of every module side. */
export const MODULE = 8;
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE STREET GRID, in modules counted from the way in. Streets run ALONG the
 *  rim at these depths, the whole width of the map; cross streets run DEEP at
 *  these alongs, from the first street to the last. The manhole's cul-de-sac
 *  joins the first street from the rim at the middle (the middle cross street
 *  runs on out to it). */
export const STREET_ROWS: readonly number[] = [2, 7, 12, 17];
export const STREET_COLS: readonly number[] = [3, 9, 15];

/** What a cell is to the Watch (Sector.section): outdoors or indoors. 0 is
 *  no zone (solid). */
export const ZONE_OUT = 1;
export const ZONE_IN = 2;

/** Rooms under a roof: the Watch never sets foot in them. */
export const SUBURB_INDOOR_TYPES: readonly SuburbType[] = ["house", "garage"];
/** Rooms nothing hunts in: the way in. */
export const SUBURB_SAFE_TYPES: readonly SuburbType[] = ["manhole"];
/** The street family: laid by the grid, never packed. */
export const STREET_TYPES: readonly SuburbType[] = ["road", "sidewalk"];

/** How far (cells) a lit streetlight's pool reaches: inside it you are seen,
 *  but not reached. A flickering light is no light. */
export const LIGHT_R = 2.6;

/** Ceiling height (metres) by room type. Outdoors there is no ceiling at all
 *  (the client draws the night sky); its 40 is only the open air's height, so
 *  the controller never reads a street as a crawlspace (Thalassophobia's rule). */
export const SUBURB_CEILINGS: Readonly<Record<SuburbType, number>> = {
  manhole: 40,
  road: 40,
  sidewalk: 40,
  yard: 40,
  house: 2.7,
  garage: 2.9,
  park: 40,
  porch: 40,
};

/** ONE DOOR PER LEVEL: the way in, up out of a manhole. */
export const MANHOLE_NAME = "The Manhole";
/** The way out — the front door of the last house on the street. */
export const FRONT_DOOR_NAME = "The Front Door";
/** The last house. */
export const HOME_NAME = "Number 9";
/** Level 9's key. */
export const HOUSE_KEY_NAME = "the House Key";

/** How many key spots a map carries at least. */
export const KEY_SPOTS_MIN = 8;

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Only what PLAYS or what the client must draw at a cell. Dressing is the prop
// kit's job (real models in the room designs).
export const UDECO = Object.freeze({
  none: 0,
  /** A light (the fixture law: a real lamp model). v0 a streetlight, LIT · v1
   *  a streetlight, DEAD · v2 a streetlight, flickering · v3 a porch light,
   *  LIT. Lit ones (v0, v3) throw a pool the Watch won't enter. */
  lamp: 1,
  /** The way in: the manhole, on this cell's floor; v = the rim side. */
  entrance: 2,
  /** THE FRONT DOOR of Number 9. v = the wall the door is in (the side you
   *  face to open it). */
  frontdoor: 3,
  /** A spot the House Key may lie on (the plan picks one per map). */
  key: 4,
});
export const udecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const udecoKind = (b: number): number => b >> 4;
export const udecoVar = (b: number): number => b & 15;
/** Does this deco byte throw a pool of light (a lit streetlight or a porch
 *  light)? */
export const udecoLit = (b: number): boolean => udecoKind(b) === UDECO.lamp && (udecoVar(b) === 0 || udecoVar(b) === 3);
