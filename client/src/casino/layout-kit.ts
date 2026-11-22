// THE FLOOR's shared kit — the vocabulary the hall is drawn in (Oct 2026, the
// casino redesign). Types, measured furniture sizes and the small builders (a
// slot bank, a blackjack table with its stools, a lounge table) live here,
// import-free, apart from WHERE things stand (layout-boulevard.ts). Most of the
// measurements were taken in the classic hall the Boulevard replaced.
//
// Units: cells are 2m (the backrooms CELL), x west→east, y north→south.

export interface Placement {
  /** which file: "props" (the big PSX pack) or a bar-pack GLB stem */
  src: "props" | "modular_bar" | "bar_stool" | "furniture_high" | "chair" | "round_table" | "square_table" | "chess" | "barrel" | "bottle" | "glasses" | "cash_register" | "kiosk" | "poker7" | "jukebox" | "locker" | "atm";
  /** node pick — normalized name (lowercase alphanumerics), or "all" for the
   *  whole file. */
  pick: string;
  at: [number, number]; // cells
  yawDeg?: number; // 0 faces south (toward the entrance)
  scale?: number;
  h?: number; // metres above the local floor (table-top dressing)
  /** axis-aligned collider half-extents in CELLS (post-rotation); omit = walk-through */
  collider?: [number, number];
  /** MULTI-BOX collider for curved furniture: each box is [dx, dy, rx, ry] in
   *  cells relative to `at` (post-rotation authored). A staircase of small
   *  boxes follows an arc the way one big square can't — the blackjack felts'
   *  foot rail (Josh: the square barrier fought the curve). */
  colliders?: [number, number, number, number][];
  /** render fullbright (neon signs, screens) */
  basic?: boolean;
  /** multiply the prop's own texture by this colour. The bar pack's furniture is
   *  pale blond pine, which read as farmhouse against a walnut-and-wine room —
   *  the hall's own woodwork is tinted the same way (WALNUT in world.ts). Keep
   *  it mild: the tint hits upholstery too, and a hard multiply muddies the
   *  stools' red seats. */
  tint?: number;
  /** self-illumination 0..1 — the prop's own texture is re-used as an emissive
   *  map, so a cabinet glows in ITS OWN colours instead of being washed flat by
   *  `basic`. This is what makes the slot banks read as machines-in-the-dark
   *  (every reference photo in assets/casino/reference/ is lit that way). */
  glow?: number;
}

/** C3 — the stations. Walk into a zone and E opens the REAL game (the same
 *  Svelte view the 2D hub mounts, lazy-loaded into a docked overlay). Pure
 *  data: `game` keys the CasinoGame view map; the zone is a circle in cells.
 *  Zones may overlap — the NEAREST one in range wins the prompt. */
export interface Station {
  game: "wheel" | "blackjack" | "roulette" | "holdem" | "chess" | "bonepit" | "kiosk" | "sterling" | "jukebox" | "locker" | "lender";
  label: string;
  /** Hint-bar text override — the default is "play {label}". */
  prompt?: string;
  /** Where the GAME physically is, when the stand-here zone is offset from
   *  it (blackjack, the wheel) — the look-at gate aims here. Default: x,y. */
  aim?: [number, number];
  /** Blackjack only: WHICH engine lobby this physical table is (BJ_TABLES
   *  order = engine order, so this is its index). The floor strip binds a
   *  table to its lobby — walking to the Gold felt plays the Gold table. */
  lobby?: number;
  x: number;
  y: number;
  r: number;
  /** The TABLE SHOT (option 1, Josh's pick): while this station's dock is
   *  open the camera glides here and frames the felt — the room is the game
   *  board, the UI is a strip along the bottom. [x cells, y cells, h metres]. */
  cam?: [number, number, number];
  look?: [number, number, number];
}

/** Cosmetic first-come seats (C2): E to sit, any movement key stands you up.
 *  Index in a hall's SEATS IS the seat id on the wire — append only, never
 *  reorder. `h` = the SEAT SURFACE height in metres. `heading` is the avatar
 *  group's rotation.y: forward is (−sin h, −cos h) in cell space, so
 *  0 = north · π/2 = WEST · π = south · −π/2 = EAST. */
export interface Seat {
  x: number;
  y: number;
  heading: number;
  h: number;
}

/** A blackjack felt. `arc` is the unit direction the player rail faces;
 *  `yawDeg` follows the MEASURED wheel (Aug 2026): the felt's arc azimuth is
 *  270 − yawDeg, so arc-west = 0 · SW = 45 · south = 90 · north = 270 ·
 *  NW = 315. */
export interface BjTable {
  key: string;
  x: number;
  y: number;
  arc: [number, number];
  yawDeg: number;
}

/** A wall plaque (or a hanging table sign): `at` is the panel's plane, `face`
 *  the unit compass it looks toward, `h` its centre in metres. */
export interface WallSign {
  text: string;
  sub: string;
  at: [number, number];
  face: [number, number];
  h: number;
}

/** Something hung on a wall: `x, y` (cells) on the wall plane, `face` the
 *  unit vector into the room. */
export interface WallFixture {
  x: number;
  y: number;
  face: [number, number];
}

/** THE SHELL — the architecture world.ts draws around the furniture, as data:
 *  everything that used to be a hardcoded coordinate in buildHall. */
export interface HallShell {
  /** the stage's tiered chandelier (cells) — absent where the hall hangs its
   *  own (the Boulevard's dome) */
  chandelier?: { x: number; y: number };
  /** full-height walnut wall columns, centres in cells (0.5m square) */
  columns: [number, number][];
  /** warm carpet runners: centre in cells, size in METRES */
  runners: { x: number; y: number; w: number; h: number }[];
  /** the jumbotron the Derby's board is mounted on: a wall fixture, its
   *  centre `z` metres up, `w × h` metres */
  jumbo: WallFixture & { z: number; w: number; h: number };
  /** the two side boards: the Wheel's live feed and the big winners */
  feedScreen: WallFixture;
  winsScreen: WallFixture;
  /** lit bottle walls along the NORTH wall behind the bar: x ranges in cells */
  backBar: [number, number][];
  /** framed pictures on the damask band */
  pictures: WallFixture[];
  /** ceiling spotlights over the games that aren't blackjack or Hold'em
   *  (those two get theirs from the table data): intensity, cone angle */
  spots: { x: number; y: number; i: number; angle: number; color?: number; h?: number }[];
  /** neon spill: a coloured point light by a lit sign; `stutter` = the older
   *  tube that misfires now and then */
  neon: { x: number; y: number; h: number; color: number; i: number; d: number; stutter?: boolean }[];
  /** where the legendary party's six strobes hang (cells) — always six: the
   *  light count is frozen at build */
  strobes: [number, number][];
}

/** Mild walnut wash for the bar pack's blond pine furniture, so stools, chairs
 *  and tables sit in the same wood family as the hall's own joinery. Deliberately
 *  lighter than world.ts's WALNUT — this multiplies the red seat cushions too. */
export const FURN_TINT = 0xc79a70;

export const D = Math.SQRT1_2;

/** World-space model height of Josh's ATM is 10.1595 units — its nodes carry a
 *  ×0.01 matrix the accessor bounds don't show (the "invisible ATM" lesson). */
export const LENDER_MODEL = { w: 4.5151, h: 10.1595, d: 4.028 };
export const LENDER_SCALE = 1.85 / LENDER_MODEL.h;
/** NO LIFT: takeProp re-centres every prop and drops its min-y to zero, so the
 *  model's own mid-body origin never matters. `h` is for table dressing only. */
export const LENDER_LIFT = 0;

/** How far from the stage centre a thrown body is aimed to come to rest. */
export const THROW_REACH = 3.4;
/** Launch speed of a stage death, cells/second — MEASURED in the classic hall:
 *  the hardest throw that stays inside a 5m room's own geometry (peak 2.92m).
 *  Every ceiling the Boulevard has is higher, so it holds there too. */
export const THROW_POWER = 4.2;

/** Where a stage death throws you: always OFF the stage, radially away from its
 *  centre, never into a wall (the rest spot is clamped inside the hall). Dead
 *  centre is thrown toward the entrance (+y). `dir` uses the sim's cell
 *  convention: the heading vector is (sin dir, cos dir). */
export function stageThrowAimIn(
  stage: { x0: number; x1: number; y0: number; y1: number }, w: number, h: number, x: number, y: number,
): { dir: number; restX: number; restY: number } {
  const cx = (stage.x0 + stage.x1) / 2;
  const cy = (stage.y0 + stage.y1) / 2;
  let dx = x - cx;
  let dy = y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  return {
    dir: Math.atan2(dx, dy),
    restX: Math.min(w - 1.5, Math.max(1.5, cx + dx * THROW_REACH)),
    restY: Math.min(h - 1.5, Math.max(1.5, cy + dy * THROW_REACH)),
  };
}

// ---- BLACKJACK --------------------------------------------------------------

export const BJ_SCALE = 1.2; // seats six around the arc at this size
/* THE PLAYER RAIL — an OFFSET OF THE TABLE'S OWN OUTLINE, walked by ARC
 * LENGTH (Josh, Aug 2026: "players are sitting right on top of each other").
 * The felt measures 0.843 x 0.385 cells half-extents with a ~0.30 corner;
 * seats ride 0.52 cells clear of that outline, spaced 0.42 cells (84cm)
 * apart, which is a genuine gap between shoulders. */
const RAIL_HA = 0.843; // table half-length, cells
const RAIL_HB = 0.385; // table half-width
const RAIL_R = 0.30; // its corner radius
const RAIL_D = 0.52; // how far off the table a seated body sits
const RAIL_STRAIGHT = RAIL_HA - RAIL_R; // the flat run of the front edge
const RAIL_ARC_R = RAIL_R + RAIL_D; // the corner's radius, offset outward
/** Seat pitch measured ALONG the rail — not along the table's axis, which is
 *  what makes the end seats round the corners instead of piling up. */
const RAIL_PITCH = 0.42;
/** Walk `s` cells along the rail from the front centre → (along, across). */
function railAt(s: number): { along: number; across: number } {
  const sgn = s < 0 ? -1 : 1;
  const a = Math.abs(s);
  if (a <= RAIL_STRAIGHT) return { along: sgn * a, across: RAIL_HB + RAIL_D };
  const phi = (a - RAIL_STRAIGHT) / RAIL_ARC_R; // radians around the corner
  return {
    along: sgn * (RAIL_STRAIGHT + RAIL_ARC_R * Math.sin(phi)),
    across: RAIL_HB - RAIL_R + RAIL_ARC_R * Math.cos(phi),
  };
}
/** Where along the rail seat `i` of six sits, in cells (centred on 0). */
const bjRailS = (i: number): number => (i - 2.5) * RAIL_PITCH;
/** How far along the table's long axis stool `i` sits, in cells. Seat 0 is the
 *  -L end (which is also canvas-RIGHT on the felt overlay, so a painted hand
 *  sits on the same side as its own player). */
export const bjStoolLong = (i: number): number => railAt(bjRailS(i)).along;
/** Stool `i` (0-5) around table `t` — an arc hugging the player rail, however
 *  the table is turned. Shared by placements, SEATS, and ghosts, so a 2D
 *  player's ghost lands exactly on a stool a floor player could take. */
export function bjStool(t: { x: number; y: number; arc: [number, number] }, i: number): { x: number; y: number; heading: number } {
  const { along: b, across: a } = railAt(bjRailS(i));
  // arc rotated +90 deg is the long axis
  const dx = t.arc[0] * a - t.arc[1] * b;
  const dy = t.arc[1] * a + t.arc[0] * b;
  // face the table: forward (−sin h, −cos h) = −(dx, dy)
  return {
    x: +(t.x + dx).toFixed(2),
    y: +(t.y + dy).toFixed(2),
    heading: Math.atan2(dx, dy),
  };
}
/** The felt's collider: a chain of square boxes along the table's LONG axis
 *  plus a nose toward the rail — squares stay honest at ANY table rotation,
 *  and a chain slides like the curve it approximates. */
function bjColliders(t: { arc: [number, number] }): [number, number, number, number][] {
  const L: [number, number] = [-t.arc[1], t.arc[0]]; // the long axis
  const boxes: [number, number, number, number][] = [];
  for (const k of [-0.54, -0.27, 0, 0.27, 0.54]) {
    boxes.push([+(L[0] * k).toFixed(2), +(L[1] * k).toFixed(2), 0.3, 0.3]);
  }
  // the rail's nose — MEASURED: the felt is 0.384 cells half across the arc,
  // so the nose reaches 0.30+0.14 = 0.44, a hair proud of the rail.
  boxes.push([+(t.arc[0] * 0.30).toFixed(2), +(t.arc[1] * 0.30).toFixed(2), 0.14, 0.14]);
  return boxes;
}
export const bjRow = (t: BjTable): Placement => ({
  src: "props", pick: "blackjacktable", at: [t.x, t.y], yawDeg: t.yawDeg, scale: BJ_SCALE,
  colliders: bjColliders(t),
});
/** SIX stools arcing a blackjack table's player rail. */
export const bjStools = (t: BjTable): Placement[] =>
  Array.from({ length: 6 }, (_, i): Placement => {
    const s = bjStool(t, i);
    return { src: "bar_stool", pick: "cube010", at: [s.x, s.y], scale: 0.62, collider: [0.12, 0.12], tint: FURN_TINT };
  });
/** A felt's chip plate + one dealt card, riding its own table (dealer side =
 *  opposite the stool arc; the 1.16m top × BJ_SCALE = 1.39). */
export const bjDressing = (t: BjTable, i: number): Placement[] => [
  { src: "props", pick: "tokensplate", at: [+(t.x - t.arc[0] * 0.32).toFixed(2), +(t.y - t.arc[1] * 0.32).toFixed(2)], h: 1.39, yawDeg: t.yawDeg },
  { src: "props", pick: ["clubcarda", "diamondcardq", "spadecard10", "heartcard7"][i % 4], at: [+(t.x + t.arc[0] * 0.1).toFixed(2), +(t.y + t.arc[1] * 0.1).toFixed(2)], h: 1.4, yawDeg: t.yawDeg },
];
/** The table shot and the stand-here zone for blackjack table `t` (engine
 *  lobby `i`): the camera offsets toward the stool arc, which puts screen-up on
 *  the DEALER side on every table, however it is turned. */
export const bjStation = (t: BjTable, i: number): Station => ({
  game: "blackjack", label: `Blackjack (${t.key === "highroller" ? "High Roller" : t.key[0].toUpperCase() + t.key.slice(1)})`, lobby: i, aim: [t.x, t.y],
  x: +(t.x + t.arc[0] * 1.35).toFixed(2), y: +(t.y + t.arc[1] * 1.35).toFixed(2), r: 1.35,
  cam: [+(t.x + t.arc[0] * 0.44).toFixed(2), +(t.y + t.arc[1] * 0.44).toFixed(2), 3.3],
  look: [+(t.x + t.arc[0] * 0.34).toFixed(2), +(t.y + t.arc[1] * 0.34).toFixed(2), 0.8],
});

// ---- SLOTS ------------------------------------------------------------------

// MEASURED head-on: the Casino_Machine cabinet's FACING BY yawDeg is
// 0=west · 90=south · 180=east · 270=north.
export const SLOT_EAST = 180;
export const SLOT_WEST = 0;
/** One cabinet. Tight collider — the cabinet is 0.92×1.1m at this scale. */
export const slot = (x: number, y: number, yawDeg: number): Placement => ({
  src: "props", pick: "casinomachine", at: [x, y], yawDeg, scale: 0.85,
  collider: [0.3, 0.25], glow: 0.58,
});
/** The banked pitch: 0.62 cells (1.24m) against a 0.92m cabinet. */
export const SLOT_PITCH = 0.62;
/** Back-to-back centres: the measured 1.10m cabinet depth, so the backs kiss. */
export const SLOT_BACK = 0.55;
/** A bank of `n` machines running north→south from `y0` at the banked pitch. */
export const slotBank = (x: number, y0: number, n: number, yawDeg: number): Placement[] =>
  Array.from({ length: n }, (_, i) => slot(x, y0 + i * SLOT_PITCH, yawDeg));

// ---- SEATING + DRESSING -----------------------------------------------------

export const stool = (x: number, y: number): Placement => ({
  src: "bar_stool", pick: "cube010", at: [x, y], scale: 0.62, collider: [0.12, 0.12], tint: FURN_TINT,
});
export const stanchion = (x: number, y: number): Placement => ({
  src: "props", pick: "stanchion1", at: [x, y], collider: [0.08, 0.08],
});
/** A round lounge table with a chair either side (east/west). The chair
 *  model's seat faces ±x at yaw 0 (measured in-hall over two wrong guesses) —
 *  0 seats the west chair toward the table, 180 mirrors it. */
export const loungeTable = (x: number, y: number): Placement[] => [
  { src: "round_table", pick: "cube019", at: [x, y], scale: 0.55, collider: [0.28, 0.28], tint: FURN_TINT },
  { src: "chair", pick: "cube011", at: [x - 0.45, y], yawDeg: 0, scale: 0.55, collider: [0.13, 0.13], tint: FURN_TINT },
  { src: "chair", pick: "cube011", at: [x + 0.45, y], yawDeg: 180, scale: 0.55, collider: [0.13, 0.13], tint: FURN_TINT },
];
/** The two SEATS of a lounge table (west chair faces EAST = −π/2). */
export const loungeSeats = (x: number, y: number): Seat[] => [
  { x: x - 0.45, y, heading: -Math.PI / 2, h: 0.55 },
  { x: x + 0.45, y, heading: Math.PI / 2, h: 0.55 },
];
/** A bottle and a glass on a lounge table (tops at 0.83 after 0.55 scale). */
export const loungeDressing = (x: number, y: number): Placement[] => [
  { src: "props", pick: "whisky", at: [x - 0.1, y - 0.08], h: 0.84 },
  { src: "props", pick: "glass1", at: [x + 0.12, y + 0.1], h: 0.84 },
];
/** A chair whose seat opens toward (tx, ty) — the chair model opens +x at
 *  yawDeg 0. */
export const chairFacing = (x: number, y: number, tx: number, ty: number): Placement => ({
  src: "chair", pick: "cube011", at: [x, y],
  yawDeg: Math.round((Math.atan2(-(ty - y), tx - x) * 180) / Math.PI),
  scale: 0.55, collider: [0.13, 0.13], tint: FURN_TINT,
});

// ---- HOLD'EM ----------------------------------------------------------------

/** Chair `i` of the 7-seat Hold'em oval (poker7.glb, baked 2.93×1.48m × the
 *  1.1 scale) centred on `c` — an ellipse, every chair facing the felt. */
export function holdemSeatAround(c: { x: number; y: number }, i: number): { x: number; y: number; heading: number } {
  const a = (i / 7) * Math.PI * 2 + Math.PI / 7;
  const dx = Math.sin(a) * 1.18;
  const dy = Math.cos(a) * 0.85;
  return {
    x: +(c.x + dx).toFixed(2),
    y: +(c.y + dy).toFixed(2),
    heading: Math.atan2(dx, dy), // face the felt
  };
}
/** The oval and its seven chairs. Collider: a three-box chain along it. */
export const holdemPlacements = (c: { x: number; y: number }): Placement[] => [
  {
    src: "poker7", pick: "all", at: [c.x, c.y], scale: 1.1,
    colliders: [[-0.55, 0, 0.28, 0.36], [0, 0, 0.34, 0.44], [0.55, 0, 0.28, 0.36]],
  },
  ...Array.from({ length: 7 }, (_, i): Placement => {
    const s = holdemSeatAround(c, i);
    return chairFacing(s.x, s.y, c.x, c.y);
  }),
];

// ---- THE JUKEBOX'S REACH ----------------------------------------------------

/** Cells. Standing this close to the jukebox is the full near field… */
const MUSIC_NEAR = 1.6;
/** …and this far from it, the machine itself is inaudible. */
const MUSIC_FAR = 7.5;
/** A ceiling speaker covers this radius… */
export const SPK_REACH = 7.0;
/** …at this share of the near field. */
const SPK_LEVEL = 0.44;

/** How loud the jukebox is at a point, 0..1 — the machine's near field or the
 *  loudest ceiling speaker, whichever is more. Smoothstep shoulders so walking
 *  under a speaker doesn't click on. */
export function musicLevelFor(
  jukebox: { x: number; y: number }, speakers: [number, number][], x: number, y: number,
): number {
  const dj = Math.hypot(x - jukebox.x, y - jukebox.y);
  const near = dj <= MUSIC_NEAR ? 1 : Math.max(0, (MUSIC_FAR - dj) / (MUSIC_FAR - MUSIC_NEAR));
  let bed = 0;
  for (const [sx, sy] of speakers) {
    const d = Math.hypot(x - sx, y - sy);
    if (d >= SPK_REACH) continue;
    const t = 1 - d / SPK_REACH;
    bed = Math.max(bed, t * t * (3 - 2 * t) * SPK_LEVEL);
  }
  return Math.min(1, Math.max(near, bed));
}
