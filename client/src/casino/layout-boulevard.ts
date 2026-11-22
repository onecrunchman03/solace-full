// THE BOULEVARD — the redesigned floor (Josh, Oct 2026: "I want it look better,
// big bigger, and have a more structured layout" → option A of the plans,
// Classic Vegas). 36 × 22 cells, 72 × 44 m. You walk in under the marquee onto
// a marble boulevard with the Wheel's dome straight ahead; a marble loop runs
// round the rotunda and every district opens off it:
//
//   x  0 ─ 9    THE SLOTS (west): four back-to-back banks + a carousel
//   x  9 ─ 27   y 0 ─ 5   STERLING'S BAR (north wall) + its lounge
//   x 27 ─ 36   y 0 ─ 5   THE RACE BOOK (the jumbotron's board wall)
//   x 27 ─ 36   y 5 ─ 15  THE PIT: four blackjack felts round the roulette
//   x 27 ─ 36   y 15 ─ 22 THE POKER ROOM: Hold'em, the Bone Pit, chess
//   x  9 ─ 16   y 18 ─ 22 services: the locker, the goblins' ATM
//   x 20 ─ 27   y 18 ─ 22 services: the escape-room door
//   the loop's inner rect 12 ─ 24 × 7.5 ─ 15.5: the rotunda, the stage + Wheel
//
// Same units and vocabulary as the classic hall (layout-kit.ts). The
// regulars' walking graph for this floor is src/casino/hall.ts's BOULEVARD;
// `node scripts/checks/test_hall_nav.mjs` holds the two together.

import {
  type Placement, type Station, type Seat, type BjTable, type WallSign,
  FURN_TINT, bjRow, bjStools, bjDressing, bjStation, bjStool, slot, slotBank, SLOT_EAST, SLOT_WEST, SLOT_BACK, SLOT_PITCH,
  stool, stanchion, loungeTable, loungeSeats, loungeDressing, chairFacing,
  holdemSeatAround, holdemPlacements, stageThrowAimIn, musicLevelFor, LENDER_SCALE, LENDER_LIFT,
  type HallShell,
} from "./layout-kit.ts";

export const ID = "boulevard";

export const W = 36; // cells — 72m east-west
export const H = 22; // cells — 44m north-south
/** Where the gaming districts east of the loop begin (the classic hall's
 *  "wing" line — kept so the shared readers have a value). */
export const WING_X = 27;
/** The main ceiling, metres. The dome over the rotunda rises to 10m (world.ts
 *  builds it); everything the collision world asks about is under this. */
export const CEIL = 6;

/** The stage under the dome: a 1m platform (2 steps) with its stair strip on
 *  the south face, the Wheel at its north edge facing the door. */
export const STAGE = { x0: 16, x1: 20, y0: 10, y1: 13 };
export const STAIR = { x0: 17, x1: 19, y: 13 };
/** The rotunda: the dome's footprint (cells), centred on the stage. */
export const ROTUNDA = { x: 18, y: 11.5, r: 3.9 };

/** The entrance on the south wall, under the bulb marquee. */
export const DOOR = { x0: 16, x1: 20 };
/** Where you walk in: on the boulevard, facing the dome. */
export const SPAWN = { x: 18, y: 20.4, yaw: 0 };

/** THE JUKEBOX, against the north wall a step west of the bar's end — a
 *  regular queuing beside it must not cut the counter's corner. */
export const JUKEBOX = { x: 9.0, y: 0.21 };
/** THE ESCAPE ROOM DOOR — the south wall's east services bay, opening north. */
export const ESCAPE_DOOR = { x: 23.0, y: 21.9, face: [0, -1] as [number, number] };
/** THE SOUL KIOSK, at the race book's west end of the north wall. */
export const KIOSK = { x: 28.2, y: 0.18 };
/** THE CASINO LOCKER, south wall, west services bay — a coat-check by the
 *  door. Back set off the wall like the classic hall's. */
export const LOCKER = { x: 12.0, y: 21.83 };
/** GOBLIN LENDERS' terminal, south wall beside the locker: the moneylender is
 *  the last thing you pass on the way out, and the first on the way in. */
export const LENDER = { x: 14.2, y: 21.76 };

/** STERLING, behind the middle of his bar. */
export const STERLING = { x: 18, y: 1.35 };
/** The counter: one continuous run along the north wall. */
export const BAR = { x0: 10.9, x1: 25.1, y: 1.85 };

export function stageThrowAim(x: number, y: number): { dir: number; restX: number; restY: number } {
  return stageThrowAimIn(STAGE, W, H, x, y);
}

/** THE PIT: four felts round the roulette table, arcs facing it — the north
 *  pair's rails face south, the south pair's face north. ENGINE ORDER
 *  (Copper 0 → High Roller 3), so the lobbies and the ghosts map by index.
 *  yawDeg on the measured wheel: arc south = 90, arc north = 270. */
export const BJ_TABLES: BjTable[] = [
  { key: "copper", x: 29.5, y: 13.5, arc: [0, -1], yawDeg: 270 },
  { key: "silver", x: 33.5, y: 13.5, arc: [0, -1], yawDeg: 270 },
  { key: "gold", x: 29.5, y: 6.5, arc: [0, 1], yawDeg: 90 },
  { key: "highroller", x: 33.5, y: 6.5, arc: [0, 1], yawDeg: 90 },
];
/** The roulette table, dead centre of the pit, long axis north–south. */
export const ROULETTE = { x: 31.5, y: 10 };

/** THE POKER ROOM: the 7-seat Hold'em oval, the Bone Pit, the chess set. */
export const HOLDEM = { x: 30.0, y: 18.4 };
export const holdemSeat = (i: number): { x: number; y: number; heading: number } => holdemSeatAround(HOLDEM, i);
export const BONE_PIT = { x: 34.2, y: 17.4 };
export const CHESS = { x: 34.2, y: 20.4 };

/** THE SLOTS: four back-to-back banks of ten (2 × 5), on two columns with a
 *  cross aisle between their north and south blocks, and a carousel of eight
 *  below them. `x` is the bank's spine; machines sit SLOT_BACK/2 either side. */
export const SLOT_BANKS: { x: number; y0: number; n: number }[] = [
  { x: 2.6, y0: 2.5, n: 5 },
  { x: 6.4, y0: 2.5, n: 5 },
  { x: 2.6, y0: 9.5, n: 5 },
  { x: 6.4, y0: 9.5, n: 5 },
];
export const CAROUSEL = { x: 4.6, y: 16.2, r: 0.85, n: 8 };
/** THE END CAPS (the polish pass, Oct 2026): a lacquered panel closing each
 *  end of every bank, so no aisle looks at a cabinet's bare beige side.
 *  [x, y] cell centres; world-vegas.ts builds them, the colliders are below. */
export const SLOT_CAPS: [number, number][] = SLOT_BANKS.flatMap((b): [number, number][] => [
  [b.x, +(b.y0 - 0.36).toFixed(3)],
  [b.x, +(b.y0 + (b.n - 1) * SLOT_PITCH + 0.36).toFixed(3)],
]);
/** HIGH LIMIT (the polish pass): a row of eight against the south wall of the
 *  slots district, facing north across the aisle below the carousel — the
 *  corner that used to be an empty, unlit patch of carpet. */
export const HIGH_LIMIT = { x0: 1.9, y: 21.75, n: 8 };

/** THE SECTIONS (Josh, Oct 2026: "its all the same slot machine"). Every
 *  cabinet belongs to one, and the section is what makes it different: its
 *  name on the topper, its colour, its STAKE (src/slots.ts STAKES — the
 *  server refuses anything else), and its reel art. The two banks the floor's
 *  regulars play (src/casino/hall.ts `cabinets`) stay at the base stake —
 *  their engine pulls at 10, and test_hall_nav holds it. */
export type SlotTheme = "fruit" | "sevens" | "gems" | "crowns" | "liberty" | "gold";
/** which machine stands there (casino/slot-cabinets.ts has each one measured) */
export type SlotCabinet = "classic" | "lucky" | "jackpot" | "star" | "bulb";
export interface SlotSection {
  id: string;
  name: string;
  /** the topper's lacquer */
  color: string;
  /** silver a pull */
  stake: 10 | 20 | 50 | 100;
  theme: SlotTheme;
  cabinet: SlotCabinet;
  /** a colour multiplied into the cabinet's own finish (High Limit's gold) */
  tint?: string;
}
export const SLOT_SECTIONS: SlotSection[] = [
  { id: "chance", name: "SLOTS OF CHANCE", color: "#b0122a", stake: 10, theme: "fruit", cabinet: "classic" },
  { id: "sevens", name: "LUCKY SEVENS", color: "#5a1a8c", stake: 20, theme: "sevens", cabinet: "lucky" },
  { id: "diamond", name: "DIAMOND DELUXE", color: "#0f5a7a", stake: 10, theme: "gems", cabinet: "star" },
  { id: "crown", name: "CROWN JACKPOT", color: "#8a5a10", stake: 50, theme: "crowns", cabinet: "jackpot" },
  { id: "carousel", name: "CAROUSEL", color: "#7a1430", stake: 10, theme: "liberty", cabinet: "bulb" },
  { id: "highlimit", name: "HIGH LIMIT", color: "#14100c", stake: 100, theme: "gold", cabinet: "star", tint: "#ffcc80" },
];
/** Which section a cabinet at cell (x, y) belongs to: SLOT_BANKS[i] is
 *  SLOT_SECTIONS[i]; then the carousel; then the high-limit row. */
export function slotSectionAt(x: number, y: number): SlotSection {
  if (Math.abs(y - HIGH_LIMIT.y) < 0.6 && x > HIGH_LIMIT.x0 - 0.6 && x < HIGH_LIMIT.x0 + HIGH_LIMIT.n * SLOT_PITCH) return SLOT_SECTIONS[5];
  if (Math.hypot(x - CAROUSEL.x, y - CAROUSEL.y) < CAROUSEL.r + 0.6) return SLOT_SECTIONS[4];
  const i = SLOT_BANKS.findIndex((b) => Math.abs(x - b.x) < 0.8 && y > b.y0 - 0.6 && y < b.y0 + (b.n - 1) * SLOT_PITCH + 0.6);
  return SLOT_SECTIONS[i >= 0 ? i : 0];
}

/** Lounge tables: four along the bar, four round the rotunda's corners (to
 *  watch the Wheel from). */
const BAR_LOUNGE: [number, number][] = [[12.5, 4], [16, 4], [20, 4], [23.5, 4]];
const ROTUNDA_LOUNGE: [number, number][] = [[13.4, 8.6], [22.6, 8.6], [13.4, 14.4], [22.6, 14.4]];
/** The race book's row of chairs, facing the board wall (north). */
const BOOK_CHAIRS: [number, number][] = [29.5, 30.5, 31.5, 32.5, 33.5, 34.5].map((x): [number, number] => [x, 3.3]);
/** Bar stools along the counter's south face. The first ten are SEATS 0–9
 *  (the regulars sit there); the last four are appended. */
const BAR_STOOLS = Array.from({ length: 14 }, (_, i) => 11.5 + i);
const STOOL_Y = 2.35;

export const STATIONS: Station[] = [
  { game: "wheel", label: "the Wheel of Fortune", x: STAGE.x0 + 2, y: 11.9, r: 1.3, aim: [18, 10.9] },
  ...BJ_TABLES.map(bjStation),
  { game: "holdem", label: "Texas Hold'em", x: HOLDEM.x, y: HOLDEM.y, r: 1.8, cam: [HOLDEM.x, HOLDEM.y + 0.18, 3.05], look: [HOLDEM.x, HOLDEM.y, 0.85] },
  { game: "bonepit", label: "the Bone Pit", x: BONE_PIT.x, y: BONE_PIT.y, r: 1.45, cam: [BONE_PIT.x, BONE_PIT.y + 0.18, 3.0], look: [BONE_PIT.x, BONE_PIT.y, 0.85] },
  { game: "chess", label: "Chess Duel", x: CHESS.x, y: CHESS.y, r: 1.2, cam: [CHESS.x, CHESS.y + 0.12, 1.85], look: [CHESS.x, CHESS.y, 0.9] },
  // the classic hall's horizontal framing: camera EAST of the look lays the
  // long table across the frame
  { game: "roulette", label: "Roulette", x: ROULETTE.x, y: ROULETTE.y, r: 1.55, cam: [ROULETTE.x + 0.22, ROULETTE.y, 2.75], look: [ROULETTE.x, ROULETTE.y, 0.74] },
  {
    game: "kiosk", label: "the ticket kiosk", prompt: "bet on the races",
    x: KIOSK.x, y: 1.1, r: 1.15, aim: [KIOSK.x, KIOSK.y],
    cam: [KIOSK.x, KIOSK.y + 1.48, 1.7], look: [KIOSK.x, KIOSK.y + 0.1, 1.35],
  },
  {
    game: "jukebox", label: "the jukebox", prompt: "pick a record",
    x: JUKEBOX.x, y: 1.15, r: 1.15, aim: [JUKEBOX.x, JUKEBOX.y],
    cam: [JUKEBOX.x, 1.55, 1.55], look: [JUKEBOX.x, JUKEBOX.y + 0.1, 1.15],
  },
  {
    game: "sterling", label: "Sterling", prompt: "talk to Sterling", x: STERLING.x, y: 2.5, r: 1.3,
    aim: [STERLING.x, STERLING.y], cam: [STERLING.x, 3.15, 1.75], look: [STERLING.x, 1.5, 1.5],
  },
  // the two south-wall machines: you stand NORTH of them, in the room, and the
  // camera leans in from the room side
  {
    game: "locker", label: "the casino locker", prompt: "open your locker",
    x: LOCKER.x, y: LOCKER.y - 0.78, r: 1.2, aim: [LOCKER.x, LOCKER.y],
    cam: [LOCKER.x, LOCKER.y - 1.28, 1.6], look: [LOCKER.x, LOCKER.y + 0.1, 1.1],
  },
  {
    game: "lender", label: "Goblin Lenders", prompt: "borrow silver",
    x: LENDER.x, y: LENDER.y - 0.96, r: 1.2, aim: [LENDER.x, LENDER.y],
    cam: [LENDER.x, LENDER.y - 1.45, 1.62], look: [LENDER.x, LENDER.y - 0.1, 1.15],
  },
];

/** CEILING SPEAKERS — one over every gambling station and the bar, plus the
 *  walks, so no floor is silent (test_hall_nav checks the coverage). */
export const SPEAKERS: [number, number][] = [
  // the bar + the jukebox
  [9.0, 2.2], [13.5, 2.6], [18.0, 2.6], [22.5, 2.6],
  // the slots: both block aisles, the cross aisle, the carousel, the far corner
  [4.5, 3.7], [4.5, 10.7], [4.6, 7.0], [4.6, 16.2], [2.0, 20.0],
  // the race book
  [31.5, 2.6],
  // the pit: every felt + the roulette
  [29.5, 6.5], [33.5, 6.5], [29.5, 13.5], [33.5, 13.5], [31.5, 10.0],
  // the poker room
  [30.0, 18.4], [34.2, 17.4], [34.2, 20.4],
  // the loop's corners, the rotunda and the boulevard
  [10.5, 6.25], [25.5, 6.25], [10.5, 16.75], [25.5, 16.75], [18.0, 6.9], [18.0, 16.1], [13.5, 11.5], [22.5, 11.5], [18.0, 19.5],
  // the services bays
  [12.5, 20.5], [23.0, 20.5],
];

export function musicLevelAt(x: number, y: number): number {
  return musicLevelFor(JUKEBOX, SPEAKERS, x, y);
}

/** ONE list drives every ceiling pendant, its rose and its light (the classic
 *  hall's rule: no lamp ever hangs dark). The table pendants hang HIGH (3.95m)
 *  so the top-down table cameras at ~3m don't film a lampshade. */
export const PENDANTS: { x: number; y: number; i: number; d: number; h?: number; chandelier?: boolean }[] = [
  // the bar + the jukebox + the kiosk
  { x: 13.5, y: 1.9, i: 34, d: 13 },
  { x: 18.0, y: 1.9, i: 34, d: 13 },
  { x: 22.5, y: 1.9, i: 34, d: 13 },
  { x: 9.0, y: 1.3, i: 20, d: 9 },
  { x: 28.2, y: 1.3, i: 22, d: 9 },
  // the bar lounge
  ...BAR_LOUNGE.map(([x, y]) => ({ x, y: y - 0.05, i: 24, d: 10 })),
  // the slot aisles
  { x: 4.5, y: 3.7, i: 30, d: 13 },
  { x: 4.6, y: 7.0, i: 24, d: 11 },
  { x: 4.5, y: 10.7, i: 30, d: 13 },
  { x: 4.6, y: 16.2, i: 28, d: 12 },
  // the high-limit row
  { x: HIGH_LIMIT.x0 + ((HIGH_LIMIT.n - 1) * SLOT_PITCH) / 2, y: 20.5, i: 26, d: 11 },
  // the pit: every felt + the roulette, high over the table cameras
  ...BJ_TABLES.map((t) => ({ x: t.x, y: t.y, i: 28, d: 12, h: 3.95 })),
  { x: ROULETTE.x, y: ROULETTE.y, i: 26, d: 11, h: 3.95, chandelier: true },
  // the race book
  { x: 31.5, y: 2.9, i: 26, d: 12 },
  // the poker room
  { x: HOLDEM.x, y: HOLDEM.y, i: 32, d: 13, h: 3.95 },
  { x: BONE_PIT.x, y: BONE_PIT.y, i: 26, d: 11, h: 3.95 },
  { x: CHESS.x, y: CHESS.y, i: 24, d: 10 },
  // the spectators' corner (the dressing round — nothing a player walks up to
  // stands unlit)
  { x: 28.6, y: 20.9, i: 18, d: 8 },
  // the loop
  { x: 10.5, y: 6.25, i: 26, d: 12 },
  { x: 25.5, y: 6.25, i: 26, d: 12 },
  { x: 10.5, y: 16.75, i: 26, d: 12 },
  { x: 25.5, y: 16.75, i: 26, d: 12 },
  { x: 10.5, y: 11.5, i: 24, d: 11 },
  { x: 25.5, y: 11.5, i: 24, d: 11 },
  // (the rotunda's lounge corners are lit by the dome's chandelier)
  // the boulevard + the services bays
  // either side of the walk, so neither hangs across the SOLACE sign
  { x: 16.7, y: 19.6, i: 20, d: 11 },
  { x: 19.3, y: 19.6, i: 20, d: 11 },
  // one over each machine in the west bay (the fixture rule: nothing a player
  // walks up to stands unlit), one over the escape room's door
  { x: LOCKER.x, y: 20.9, i: 18, d: 8 },
  { x: LENDER.x, y: 20.9, i: 18, d: 8 },
  { x: 23.0, y: 20.6, i: 22, d: 9 },
];

/** Rose/pendant positions — derived from PENDANTS; the stage entry carries
 *  the chandelier's ceiling rose. */
export const LAMPS: [number, number][] = PENDANTS.filter((p) => !p.chandelier).map((p): [number, number] => [p.x, p.y]);

/** THE ROTUNDA'S COLUMNS: eight cream marble columns ringing the dome's rim,
 *  set off the four axes so none stands between the door and the Wheel. */
export const ROTUNDA_COLUMNS: [number, number][] = Array.from({ length: 8 }, (_, i): [number, number] => {
  const a = ((i + 0.5) / 8) * Math.PI * 2;
  return [+(ROTUNDA.x + Math.cos(a) * 4.3).toFixed(3), +(ROTUNDA.y + Math.sin(a) * 4.3).toFixed(3)];
});
/** THE LIVE SIGNBOARDS: two pylons where the boulevard meets the loop, facing
 *  the door — tonight's draw on the left, the Derby and tonight's biggest win
 *  on the right. */
export const SIGNBOARDS: { x: number; y: number; face: [number, number]; kind: "draw" | "derby" }[] = [
  { x: 15.4, y: 17.7, face: [0, 1], kind: "draw" },
  { x: 20.6, y: 17.7, face: [0, 1], kind: "derby" },
];
/** THE NEON: a sign over every district's way in, in its own colour. Hung
 *  from the ceiling where there's no wall (`hang`), on the wall otherwise. */
export const NEON: { text: string; x: number; y: number; face: [number, number]; h: number; w: number; color: string; hang: boolean }[] = [
  { text: "SLOTS", x: 9.0, y: 7.0, face: [1, 0], h: 4.3, w: 3.4, color: "#c58bff", hang: true },
  { text: "THE PIT", x: 27.0, y: 10.0, face: [-1, 0], h: 4.4, w: 3.8, color: "#7dffa6", hang: true },
  { text: "RACE BOOK", x: 27.0, y: 2.7, face: [-1, 0], h: 4.6, w: 4.2, color: "#6ad8ff", hang: true },
  { text: "POKER ROOM", x: 27.0, y: 17.6, face: [-1, 0], h: 4.4, w: 4.4, color: "#ffd166", hang: true },
  { text: "COCKTAILS", x: 18.0, y: 0.03, face: [0, 1], h: 5.05, w: 4.6, color: "#ff8ac8", hang: false },
  { text: "HIGH LIMIT", x: HIGH_LIMIT.x0 + ((HIGH_LIMIT.n - 1) * SLOT_PITCH) / 2, y: 21.97, face: [0, -1], h: 3.35, w: 4.0, color: "#ffcf5a", hang: false },
];
/** Crystal chandeliers down the pit's spine, between the felts (the middle one
 *  carries the roulette's light). Visual only — the frozen light count. */
export const PIT_CHANDELIERS: [number, number][] = [[31.5, 6.5], [31.5, 10], [31.5, 13.5]];

/** THE DRESSING ROUND (Josh, Oct 14 2026: "you can do some dressing"): the
 *  poker room and the High Limit corner were the two districts that read as
 *  bare carpet. Each gets a velvet-rope RAIL that says where the room is —
 *  posts at most a cell apart, the rope drawn by world.ts from ROPES, and a
 *  thin collider the length of every run so nobody walks through a rope.
 *  The poker room's rail stands on its loop side with the doorway the
 *  regulars walk through left open (hall.ts seam3 → wing2 crosses x 27 at
 *  y ≈ 16.6); High Limit's runs along the front of its aisle with a gap under
 *  the neon and the east end open (test_casino_layout walks both). */
export const RAILS: [number, number, number, number][] = [
  [27, 15.3, 27, 16.15],
  [27, 17.35, 27, 21.5],
  [0.15, 19.6, 3.55, 19.6],
  [4.95, 19.6, 7.4, 19.6],
];
const railPosts = ([x0, y0, x1, y1]: [number, number, number, number]): [number, number][] => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.0));
  return Array.from({ length: n + 1 }, (_, i): [number, number] => [+(x0 + ((x1 - x0) * i) / n).toFixed(3), +(y0 + ((y1 - y0) * i) / n).toFixed(3)]);
};
const railPlacements = (r: [number, number, number, number]): Placement[] => [
  ...railPosts(r).map(([x, y]) => stanchion(x, y)),
  { src: "props", pick: "__collider__", at: [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], collider: [Math.max(0.05, Math.abs(r[2] - r[0]) / 2), Math.max(0.05, Math.abs(r[3] - r[1]) / 2)] },
];
/** The poker room's spectators' corner: a lounge table on a rug in its empty
 *  south-west corner, within sight of the Hold'em oval. */
export const POKER_LOUNGE: [number, number] = [28.6, 20.9];
/** THE HIGH-LIMIT RUGS: three in front of the row, edge to edge. */
const HIGH_LIMIT_RUGS: [number, number][] = [2.1, 4.1, 6.1].map((x): [number, number] => [x, 20.53]);

const carouselMachines = (): Placement[] =>
  Array.from({ length: CAROUSEL.n }, (_, i): Placement => {
    const a = (i / CAROUSEL.n) * Math.PI * 2;
    const x = +(CAROUSEL.x + Math.cos(a) * CAROUSEL.r).toFixed(3);
    const y = +(CAROUSEL.y + Math.sin(a) * CAROUSEL.r).toFixed(3);
    // facing outward: the cabinet wheel is yaw = 180 − azimuth
    const p = slot(x, y, Math.round(180 - (a * 180) / Math.PI));
    p.collider = [0.28, 0.28];
    return p;
  });

export const PLACEMENTS: Placement[] = [
  // ---- STERLING'S BAR, along the north wall ---------------------------------
  // the counter is procedural (world.ts buildBar) — this is its line
  { src: "props", pick: "__collider__", at: [(BAR.x0 + BAR.x1) / 2, BAR.y], collider: [(BAR.x1 - BAR.x0) / 2, 0.24] },
  { src: "props", pick: "__collider__", at: [STERLING.x, STERLING.y], collider: [0.2, 0.2] },
  // his working kit either side of him; one display cluster at each end
  { src: "bottle", pick: "all", at: [11.4, 1.84], h: 1.16, scale: 0.5 },
  { src: "bottle", pick: "all", at: [24.6, 1.84], h: 1.16, scale: 0.5 },
  { src: "bottle", pick: "all", at: [STERLING.x + 0.65, 1.86], h: 1.16, scale: 0.5 },
  { src: "cash_register", pick: "cube001", at: [STERLING.x + 1.1, 1.85], h: 1.16, yawDeg: 180, scale: 0.5 },
  { src: "props", pick: "whisky", at: [STERLING.x - 0.7, 1.88], h: 1.16 },
  { src: "props", pick: "champagne", at: [STERLING.x - 0.38, 1.81], h: 1.16 },
  { src: "props", pick: "glass1", at: [STERLING.x - 0.92, 1.79], h: 1.16 },
  { src: "props", pick: "glass1", at: [STERLING.x + 0.32, 1.8], h: 1.16 },
  { src: "props", pick: "moneyroll", at: [STERLING.x + 0.6, 1.85], h: 1.16 },
  ...BAR_STOOLS.map((x) => stool(x, STOOL_Y)),
  ...BAR_LOUNGE.flatMap(([x, y]) => [...loungeTable(x, y), ...loungeDressing(x, y)]),

  // ---- the race book's kiosk, the jukebox -----------------------------------
  { src: "kiosk", pick: "all", at: [KIOSK.x, KIOSK.y], yawDeg: 180, scale: 0.62, collider: [0.26, 0.165] },
  { src: "jukebox", pick: "all", at: [JUKEBOX.x, JUKEBOX.y], yawDeg: 0, collider: [0.23, 0.19], glow: 0.42 },
  ...BOOK_CHAIRS.map(([x, y]) => chairFacing(x, y, x, y - 1)),

  // ---- the services bays on the south wall ----------------------------------
  // locker and ATM turned to face north, into the room (each model's own
  // front is −z: yaw 180 on the classic north wall turned it south)
  { src: "locker", pick: "all", at: [LOCKER.x, LOCKER.y], yawDeg: 180, collider: [0.34, 0.14] },
  { src: "atm", pick: "all", at: [LENDER.x, LENDER.y], yawDeg: 0, scale: LENDER_SCALE, h: LENDER_LIFT, collider: [0.21, 0.19], glow: 0.5 },

  // ---- THE SLOTS -------------------------------------------------------------
  ...SLOT_BANKS.flatMap((b) => [
    ...slotBank(b.x - SLOT_BACK / 2, b.y0, b.n, SLOT_WEST),
    ...slotBank(b.x + SLOT_BACK / 2, b.y0, b.n, SLOT_EAST),
  ]),
  ...carouselMachines(),
  // the end caps: 1.04 cells across the bank's two rows, 0.12m thick
  ...SLOT_CAPS.map(([x, y]): Placement => ({ src: "props", pick: "__collider__", at: [x, y], collider: [0.52, 0.04] })),
  // the high-limit row, facing north (270); a turned cabinet swaps its box
  ...Array.from({ length: HIGH_LIMIT.n }, (_, i): Placement => {
    const p = slot(+(HIGH_LIMIT.x0 + i * SLOT_PITCH).toFixed(3), HIGH_LIMIT.y, 270);
    p.collider = [0.25, 0.3];
    return p;
  }),
  // High Limit's rail and rugs (the dressing round)
  ...railPlacements(RAILS[2]),
  ...railPlacements(RAILS[3]),
  ...HIGH_LIMIT_RUGS.map(([x, y]): Placement => ({ src: "props", pick: "carpet2", at: [x, y], h: 0.025 })),
  // the carousel's centre column (its topper is built in world-vegas.ts)
  { src: "props", pick: "__collider__", at: [CAROUSEL.x, CAROUSEL.y], collider: [0.36, 0.36] },
  // the rotunda's columns (1.08m marble shafts) and the signboard pylons
  ...ROTUNDA_COLUMNS.map(([x, y]): Placement => ({ src: "props", pick: "__collider__", at: [x, y], collider: [0.27, 0.27] })),
  ...SIGNBOARDS.map((s): Placement => ({ src: "props", pick: "__collider__", at: [s.x, s.y], collider: [0.18, 0.18] })),

  // ---- THE PIT ----------------------------------------------------------------
  ...BJ_TABLES.map(bjRow),
  ...BJ_TABLES.flatMap(bjStools),
  ...BJ_TABLES.flatMap(bjDressing),
  { src: "props", pick: "roulettetable", at: [ROULETTE.x, ROULETTE.y], yawDeg: 0, scale: 0.62, collider: [0.46, 0.98] },

  // ---- THE POKER ROOM ---------------------------------------------------------
  ...holdemPlacements(HOLDEM),
  { src: "props", pick: "pokertable", at: [BONE_PIT.x, BONE_PIT.y], collider: [0.75, 0.75] },
  { src: "props", pick: "diceshaker", at: [BONE_PIT.x, BONE_PIT.y], h: 1.06 },
  { src: "props", pick: "dice1", at: [BONE_PIT.x - 0.15, BONE_PIT.y - 0.12], h: 1.06 },
  { src: "props", pick: "dice2", at: [BONE_PIT.x + 0.15, BONE_PIT.y + 0.12], h: 1.06 },
  { src: "square_table", pick: "cube019", at: [CHESS.x, CHESS.y], scale: 0.55, collider: [0.28, 0.28], tint: FURN_TINT },
  { src: "chess", pick: "all", at: [CHESS.x, CHESS.y], h: 0.84 },
  // the classic chess pair's measured yaws: north chair 270, south chair 90
  { src: "chair", pick: "cube011", at: [CHESS.x, CHESS.y - 0.5], yawDeg: 270, scale: 0.55, collider: [0.13, 0.13], tint: FURN_TINT },
  { src: "chair", pick: "cube011", at: [CHESS.x, CHESS.y + 0.5], yawDeg: 90, scale: 0.55, collider: [0.13, 0.13], tint: FURN_TINT },
  // the dressing round: the rail, the spectators' corner, the house's safe
  ...railPlacements(RAILS[0]),
  ...railPlacements(RAILS[1]),
  { src: "props", pick: "carpet1", at: POKER_LOUNGE, h: 0.025 },
  ...loungeTable(...POKER_LOUNGE),
  { src: "props", pick: "ashtray", at: [POKER_LOUNGE[0] - 0.1, POKER_LOUNGE[1] - 0.08], h: 0.84 },
  { src: "props", pick: "champagne", at: [POKER_LOUNGE[0] + 0.1, POKER_LOUNGE[1] + 0.06], h: 0.84 },
  // the safe's door is on the model's −x: yaw 270 turns it to face the room
  { src: "props", pick: "simplesafe", at: [33.6, 21.55], yawDeg: 270, collider: [0.21, 0.24] },
  { src: "props", pick: "briefcasefull", at: [32.95, 21.6], collider: [0.14, 0.14] },

  // ---- THE STAGE under the dome -----------------------------------------------
  { src: "props", pick: "fortuneroulette", at: [18, 10.9], yawDeg: 90, scale: 0.72, collider: [0.35, 0.25] },
  stanchion(STAGE.x0 - 0.4, STAGE.y0 - 0.4), stanchion(STAGE.x1 + 0.4, STAGE.y0 - 0.4),
  stanchion(STAGE.x0 - 0.4, STAGE.y1 + 0.4), stanchion(STAGE.x1 + 0.4, STAGE.y1 + 0.4),
  stanchion(STAIR.x0 - 0.6, STAIR.y + 0.9), stanchion(STAIR.x1 + 0.6, STAIR.y + 0.9),
  ...ROTUNDA_LOUNGE.flatMap(([x, y]) => [...loungeTable(x, y), ...loungeDressing(x, y)]),

  // ---- signage + lamps ---------------------------------------------------------
  ...PENDANTS.filter((p) => !p.chandelier).map((p): Placement => ({ src: "props", pick: "lamp", at: [p.x, p.y], h: p.h ?? CEIL - 1.75 })),
];

/** EACH CABINET'S OWN BOX (half extents in cells, [deep, wide] for a machine
 *  facing ±x): its measured depth and width at its hall scale, plus about 4cm,
 *  so nobody walks into air in front of a smaller machine. The classic keeps
 *  the box it always had. */
export const CABINET_COLLIDER: Record<SlotCabinet, [number, number]> = {
  classic: [0.3, 0.25],
  lucky: [0.23, 0.26], // 0.85m deep × 1.02m wide at ×1.25
  jackpot: [0.28, 0.26], // 1.04 × 1.0 at ×1.1
  star: [0.28, 0.27], // 1.05 × 1.08 at ×1.15
  bulb: [0.26, 0.29], // 0.97 × 1.15 (lever included) at ×1.1
};
for (const p of PLACEMENTS) {
  if (p.pick !== "casinomachine") continue;
  const kind = slotSectionAt(p.at[0], p.at[1]).cabinet;
  if (kind === "classic") continue;
  const [deep, wide] = CABINET_COLLIDER[kind];
  const yaw = (((p.yawDeg ?? 0) % 360) + 360) % 360;
  p.collider = yaw === 0 || yaw === 180 ? [deep, wide] : yaw === 90 || yaw === 270 ? [wide, deep] : [Math.max(deep, wide), Math.max(deep, wide)];
}

/** The felts' table signs hang over each dealer's side, facing the stools —
 *  the pit has no wall behind its tables, so the classic plaques hang from
 *  the ceiling here. The goblins' lease hangs over their terminal. */
export const WALL_SIGNS: WallSign[] = [
  ...BJ_TABLES.map((t, i): WallSign => ({
    text: ["COPPER", "SILVER", "GOLD", "HIGH ROLLER"][i],
    sub: `BLACKJACK · MIN ${[5, 10, 25, 50][i]}`,
    at: [+(t.x - t.arc[0] * 1.05).toFixed(2), +(t.y - t.arc[1] * 1.05).toFixed(2)],
    face: t.arc,
    h: 2.75,
  })),
  { text: "CONCESSION No. 3", sub: "GRANTED BY THE FOUNDRY · TERMS HONOURED IN FULL", at: [LENDER.x, H - 0.06], face: [0, -1], h: 2.2 },
];

/** Velvet rope round the stage, and the poker room's rail on the loop side
 *  (its gap at y 16–17.5 is the way in). */
export const ROPES: [number, number, number, number][] = [
  [STAGE.x0 - 0.4, STAGE.y0 - 0.4, STAGE.x1 + 0.4, STAGE.y0 - 0.4],
  [STAGE.x0 - 0.4, STAGE.y0 - 0.4, STAGE.x0 - 0.4, STAGE.y1 + 0.4],
  [STAGE.x1 + 0.4, STAGE.y0 - 0.4, STAGE.x1 + 0.4, STAGE.y1 + 0.4],
  [STAGE.x0 - 0.4, STAGE.y1 + 0.4, STAIR.x0 - 0.6, STAIR.y + 0.9],
  [STAGE.x1 + 0.4, STAGE.y1 + 0.4, STAIR.x1 + 0.6, STAIR.y + 0.9],
  // the dressing round's rails, post to post
  ...RAILS.flatMap((r) => {
    const ps = railPosts(r);
    return ps.slice(1).map((q, i): [number, number, number, number] => [ps[i][0], ps[i][1], q[0], q[1]]);
  }),
];

/** SEATS — the wire ids kept the classic hall's MEANING (0–9 bar stools,
 *  10–15 lounge, 16–17 chess, 18–29 + 36–47 blackjack, 30–35 + 48 Hold'em —
 *  the regulars' bjSeatId) and append the rest. Ids are append-only: a
 *  mid-list insert teleports everyone sitting behind it. Every id must stay
 *  under the server's MAX_SEATS (src/casino/floor.ts; test_casino_layout). */
export const SEATS: Seat[] = [
  // 0-9: the first ten bar stools
  ...BAR_STOOLS.slice(0, 10).map((x): Seat => ({ x, y: STOOL_Y, heading: 0, h: 0.78 })),
  // 10-15: the first three bar-lounge tables
  ...BAR_LOUNGE.slice(0, 3).flatMap(([x, y]) => loungeSeats(x, y)),
  // 16-17: chess
  { x: CHESS.x, y: CHESS.y - 0.5, heading: Math.PI, h: 0.55 },
  { x: CHESS.x, y: CHESS.y + 0.5, heading: 0, h: 0.55 },
  // 18-29: blackjack stools 0-2 of each felt
  ...BJ_TABLES.flatMap((t): Seat[] => [0, 1, 2].map((i): Seat => ({ ...bjStool(t, i), h: 0.78 }))),
  // 30-35: Hold'em chairs 0-5
  ...Array.from({ length: 6 }, (_, i): Seat => ({ ...holdemSeat(i), h: 0.55 })),
  // 36-47: blackjack stools 3-5
  ...BJ_TABLES.flatMap((t): Seat[] => [3, 4, 5].map((i): Seat => ({ ...bjStool(t, i), h: 0.78 }))),
  // 48: Hold'em chair 6
  { ...holdemSeat(6), h: 0.55 },
  // 49-52: the last four bar stools
  ...BAR_STOOLS.slice(10).map((x): Seat => ({ x, y: STOOL_Y, heading: 0, h: 0.78 })),
  // 53-54: the fourth bar-lounge table
  ...loungeSeats(...BAR_LOUNGE[3]),
  // 55-60: the race book's chairs, facing the board
  ...BOOK_CHAIRS.map(([x, y]): Seat => ({ x, y, heading: 0, h: 0.55 })),
  // 61-68: the rotunda's lounge tables
  ...ROTUNDA_LOUNGE.flatMap(([x, y]) => loungeSeats(x, y)),
  // 69-70: the poker room's spectators' corner
  ...loungeSeats(...POKER_LOUNGE),
];

/** Point lights: the dome chandelier's glow (it carries the stage), then
 *  every pendant lit. */
export const LIGHTS: { x: number; y: number; h: number; i: number; d: number }[] = [
  { x: 18, y: 11.6, h: 6.4, i: 40, d: 20 },
  ...PENDANTS.map((p) => ({ x: p.x, y: p.y, h: p.h ? p.h - 0.15 : CEIL - 1.9, i: p.i, d: p.d })),
];

/** THE SHELL — the Boulevard's architecture for buildHall. */
export const SHELL: HallShell = {
  columns: [
    // north wall: between the slots and the bar, between the bar and the book
    [8.4, 0.125], [26.5, 0.125],
    // south wall: the district lines and the doorway's two posts
    [9, 21.875], [15.7, 21.875], [20.3, 21.875], [27, 21.875],
    // west + east walls on the district lines
    [0.125, 7.3], [0.125, 14.6], [35.875, 5], [35.875, 15],
  ],
  // the slots wear their own midnight carpet (world-vegas.ts)
  runners: [],
  // THE RACE BOOK's board wall: the jumbotron centred on the book's north wall
  jumbo: { x: 32, y: 0, face: [0, 1], z: 3.35, w: 6.4, h: 3.2 },
  // the side boards hang behind the bar, either side of Sterling's bottles
  feedScreen: { x: 21.5, y: 0, face: [0, 1] },
  winsScreen: { x: 14.5, y: 0, face: [0, 1] },
  backBar: [[11.2, 13.5], [15.5, 20.5], [22.5, 24.8]],
  pictures: [
    // the slots' north and west walls
    ...[2.0, 4.5, 7.0].map((x) => ({ x, y: 0.03, face: [0, 1] as [number, number] })),
    ...[4.0, 10.8, 18.0].map((y) => ({ x: 0.03, y, face: [1, 0] as [number, number] })),
    // the east wall: the book and the poker room
    ...[2.6, 17.4, 20.4].map((y) => ({ x: 35.97, y, face: [-1, 0] as [number, number] })),
    // the south wall, clear of the high-limit row, the services bays and the door
    ...[29.5, 32.5].map((x) => ({ x, y: 21.97, face: [0, -1] as [number, number] })),
  ],
  spots: [
    { x: BONE_PIT.x, y: BONE_PIT.y, i: 100, angle: 0.4 },
    { x: CHESS.x, y: CHESS.y, i: 60, angle: 0.32 },
    { x: ROULETTE.x, y: ROULETTE.y, i: 100, angle: 0.42 },
    // from inside the dome, so a narrower cone over the same apron
    { x: 18, y: 11.9, i: 70, angle: 0.3, color: 0xfff2d8, h: 9.98 }, // the can sits on the dome
  ],
  neon: [],
  strobes: [[6, 6], [30, 6], [6, 16], [30, 16], [18, 6.25], [18, 16.75]],
};
