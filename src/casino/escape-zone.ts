// THE ESCAPE ROOM ZONE — the complex's own relay (E2; design ESCAPE.md).
//
// Its OWN socket (`/ws-escape`), not a zone flag on the casino floor's — a
// revision of the doc's first sketch, recorded there: the floor relay carries
// gun/slorp/seat state under an 80-assert harness, and the complex shares
// none of it. Two sockets on a rare door-crossing is cheaper than teaching
// one relay two worlds.
//
// SERVER-OWNED, ALL OF IT: who is inside (pass checked HERE, gun refused
// HERE — the client's door prompt is a courtesy), where THE KEY is, whether
// the exit stands open, and which room doors are shut. The client renders;
// it never decides.
//
// THE KEY CYCLE (Josh's rules, ESCAPE.md):
//   · exactly one key, spawned in a random LABELED room, never the same room
//     twice running
//   · picking it up costs a real bag slot (a full bag is refused)
//   · using it at the exit consumes it and opens the way out for THIRTY
//     SECONDS — for EVERYONE (the "door's open, RUN" moment)
//   · when the window shuts, a fresh key spawns elsewhere
//   · a holder who dies, disconnects, or leaves the zone RESETS it — and
//     everyone inside is told it moved
//   · held unused for ten minutes it CRUMBLES (anti-hostage) — same reset,
//     same announcement
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { randomInt } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { rememberSocketToken, sessionStandsFor, userForToken } from "../auth";
import { termsOutstanding } from "../legal";
import { ER_INV_SLOTS } from "./escape";
import {
  rollChest, ER_SKINS, CHEST_COUNT, CHEST_RESPAWN_MIN_MS, CHEST_RESPAWN_MAX_MS, ER_OPENS_PER_DAY,
} from "./escape-loot";

/** Cells — mirrored from client/src/casino/escape/er-layout.ts ROOMS. Only
 *  what the server needs: ids and rects for key spawns + door adjacency. The
 *  full geometry stays a client concern; the layout harness pins the two
 *  files against each other. */
export const ER_ROOMS: { id: string; x0: number; y0: number; x1: number; y1: number; door: { x: number; y: number } }[] = [
  { id: "C1", x0: 3, y0: 3, x1: 4, y1: 5, door: { x: 5, y: 4 } },
  { id: "C2", x0: 3, y0: 7, x1: 4, y1: 9, door: { x: 5, y: 8 } },
  { id: "C3", x0: 3, y0: 11, x1: 4, y1: 13, door: { x: 5, y: 12 } },
  { id: "C4", x0: 7, y0: 3, x1: 8, y1: 5, door: { x: 6, y: 4 } },
  { id: "C5", x0: 7, y0: 7, x1: 8, y1: 9, door: { x: 6, y: 8 } },
  { id: "C6", x0: 7, y0: 11, x1: 8, y1: 13, door: { x: 6, y: 12 } },
  { id: "C7", x0: 11, y0: 4, x1: 13, y1: 5, door: { x: 12, y: 6 } },
  { id: "C8", x0: 16, y0: 4, x1: 18, y1: 5, door: { x: 17, y: 6 } },
  { id: "C9", x0: 11, y0: 8, x1: 13, y1: 9, door: { x: 12, y: 7 } },
  { id: "C10", x0: 16, y0: 8, x1: 18, y1: 9, door: { x: 17, y: 7 } },
  { id: "B2", x0: 21, y0: 3, x1: 23, y1: 4, door: { x: 22, y: 5 } },
  { id: "B3", x0: 24, y0: 3, x1: 26, y1: 4, door: { x: 25, y: 5 } },
  { id: "B5", x0: 27, y0: 3, x1: 29, y1: 4, door: { x: 28, y: 5 } },
  { id: "B7", x0: 30, y0: 3, x1: 32, y1: 4, door: { x: 31, y: 5 } },
  { id: "B9", x0: 35, y0: 3, x1: 37, y1: 4, door: { x: 36, y: 5 } },
  { id: "B11", x0: 38, y0: 3, x1: 40, y1: 4, door: { x: 39, y: 5 } },
  { id: "B13", x0: 41, y0: 3, x1: 43, y1: 4, door: { x: 42, y: 5 } },
  { id: "B1", x0: 21, y0: 7, x1: 23, y1: 8, door: { x: 22, y: 6 } },
  { id: "B4", x0: 24, y0: 7, x1: 26, y1: 8, door: { x: 25, y: 6 } },
  { id: "B6", x0: 27, y0: 7, x1: 29, y1: 8, door: { x: 28, y: 6 } },
  { id: "B8", x0: 30, y0: 7, x1: 32, y1: 8, door: { x: 31, y: 6 } },
  { id: "B10", x0: 35, y0: 7, x1: 37, y1: 8, door: { x: 36, y: 6 } },
  { id: "B12", x0: 38, y0: 7, x1: 40, y1: 8, door: { x: 39, y: 6 } },
  { id: "B14", x0: 41, y0: 7, x1: 43, y1: 8, door: { x: 42, y: 6 } },
  { id: "D1", x0: 10, y0: 12, x1: 12, y1: 13, door: { x: 11, y: 14 } },
  { id: "D2", x0: 13, y0: 12, x1: 15, y1: 13, door: { x: 14, y: 14 } },
  { id: "D3", x0: 16, y0: 12, x1: 18, y1: 13, door: { x: 17, y: 14 } },
  { id: "D4", x0: 10, y0: 15, x1: 12, y1: 16, door: { x: 11, y: 14 } },
  { id: "D5", x0: 13, y0: 15, x1: 15, y1: 16, door: { x: 14, y: 14 } },
  { id: "D6", x0: 16, y0: 15, x1: 18, y1: 16, door: { x: 17, y: 14 } },
  { id: "A5", x0: 22, y0: 12, x1: 24, y1: 13, door: { x: 23, y: 14 } },
  { id: "A6", x0: 25, y0: 12, x1: 27, y1: 13, door: { x: 26, y: 14 } },
  { id: "A7", x0: 28, y0: 12, x1: 30, y1: 13, door: { x: 29, y: 14 } },
  { id: "A8", x0: 31, y0: 12, x1: 33, y1: 13, door: { x: 32, y: 14 } },
  { id: "A1", x0: 21, y0: 15, x1: 23, y1: 16, door: { x: 22, y: 14 } },
  { id: "A3", x0: 24, y0: 15, x1: 26, y1: 16, door: { x: 25, y: 14 } },
  { id: "A9", x0: 31, y0: 15, x1: 33, y1: 16, door: { x: 32, y: 14 } },
  { id: "A2", x0: 21, y0: 18, x1: 23, y1: 19, door: { x: 22, y: 20 } },
  { id: "A4", x0: 24, y0: 18, x1: 26, y1: 19, door: { x: 25, y: 20 } },
  { id: "A10", x0: 28, y0: 18, x1: 30, y1: 19, door: { x: 29, y: 20 } },
  { id: "A11", x0: 31, y0: 18, x1: 33, y1: 19, door: { x: 32, y: 20 } },
  { id: "Z1", x0: 44, y0: 3, x1: 45, y1: 5, door: { x: 46, y: 4 } },
  { id: "Z4", x0: 48, y0: 3, x1: 49, y1: 5, door: { x: 47, y: 4 } },
  { id: "Z2", x0: 44, y0: 7, x1: 45, y1: 9, door: { x: 46, y: 8 } },
  { id: "Z5", x0: 48, y0: 7, x1: 49, y1: 9, door: { x: 47, y: 8 } },
  { id: "Z3", x0: 44, y0: 11, x1: 45, y1: 13, door: { x: 46, y: 12 } },
  { id: "Z6", x0: 48, y0: 11, x1: 49, y1: 13, door: { x: 47, y: 12 } },
  { id: "Z7", x0: 48, y0: 15, x1: 49, y1: 17, door: { x: 47, y: 16 } },
];

/** The open floor + the stub, mirrored from er-layout v2 like ER_ROOMS (the
 *  layout harness pins all of it literal-for-literal). The monster's world. */
export const ER_FLOOR = { x0: 2, y0: 2, x1: 53, y1: 21 };
export const ER_STUB = { x0: 26, y0: 22, x1: 27, y1: 22 };
export const ER_DENS: { id: string; x0: number; y0: number; x1: number; y1: number; door: { x: number; y: number } }[] = [
  { id: "den-west", x0: 2, y0: 16, x1: 4, y1: 17, door: { x: 3, y: 15 } },
  { id: "den-mid", x0: 33, y0: 3, x1: 34, y1: 4, door: { x: 33, y: 5 } },
  { id: "den-east", x0: 50, y0: 16, x1: 52, y1: 17, door: { x: 51, y: 15 } },
];

/** The way out: the stub's mouth (er-layout v2; the ante-room lies south of
 *  it). Using the key here opens it. */
export const ER_EXIT = { x: 27, y: 22.5 };
/** Where a body entering the complex appears (just inside the exit). */
export const ER_ENTRY = { x: 27, y: 21.2 };
/** The plate plus its stub, exit and entry, with a cell of slack: the box a
 *  body may report itself inside. Rooms and dens stand INSIDE the plate. */
export const ER_BOUNDS = { x0: ER_FLOOR.x0 - 1, y0: ER_FLOOR.y0 - 1, x1: ER_FLOOR.x1 + 2, y1: ER_EXIT.y + 1.5 };

// ---- THE ANTE-ROOM, SHARED (Oct 2026) ---------------------------------------
// Josh: "the escape room in the casino is not a shared instance — I cannot see
// other players in the ready room or in the actual escape room." Sterling's
// ante-room used to be a purely local scene; it is a second, smaller relay on
// this same socket now. Its coordinates are the CLIENT ante's own: cells with
// the origin at the room's NW corner, 0..ER_ANTE.w × 0..ER_ANTE.h (the client
// draws it as RW × RD metres = cells × 2). Mirrored from er-layout SPAWN_ROOM
// (22..31 × 23..28) — test_escape_ante pins the two together.
export const ER_ANTE_ROOM = { x0: 22, y0: 23, x1: 31, y1: 28 };
export const ER_ANTE = { w: ER_ANTE_ROOM.x1 - ER_ANTE_ROOM.x0 + 1, h: ER_ANTE_ROOM.y1 - ER_ANTE_ROOM.y0 + 1 };
/** Where a body reports it may stand in the ante: the room, a body's radius in. */
export const ER_ANTE_BOUNDS = { x0: 0.25, y0: 0.25, x1: ER_ANTE.w - 0.25, y1: ER_ANTE.h - 0.25 };
/** Arriving from the casino floor: the south half, facing the complex door. */
export const ER_ANTE_ARRIVE = { x: ER_ANTE.w / 2, y: 4.9, yaw: 0 };
/** Back out of the complex (walked out, or died): under its door, facing in. */
export const ER_ANTE_RETURN = { x: ER_ANTE.w / 2, y: 1.1, yaw: Math.PI };
/** Floor no arrival is seated on — Sterling's counter (client COUNTER, with a
 *  body's margin) and the lockers on the east wall. */
const ANTE_BLOCKED = [
  { x0: 6.0, y0: 0, x1: 8.3, y1: 1.7 },
  { x0: 9.0, y0: 0, x1: ER_ANTE.w, y1: ER_ANTE.h },
];
const MAX_ANTE = 32;
/** Two arrivals closer than this are standing inside each other. */
const SEAT_GAP = 0.9;

export const ER_EXIT_MS = Number(process.env.ER_EXIT_MS ?? 30_000);
/** A dropped socket in the calm leaves its body standing this long, so a
 *  refresh resumes it where it stood (Oct 2026 review). */
export const ER_DROP_GRACE_MS = Number(process.env.ER_DROP_GRACE_MS ?? 60_000);
export const ER_KEY_CRUMBLE_MS = Number(process.env.ER_KEY_CRUMBLE_MS ?? 600_000);

// ---- THE HUNT's clocks (ESCAPE.md; every one env-dialable for the harness) --
/** Calm minutes between hunts: {2,4,6,8}, crypto-picked (Josh approved the
 *  shift up from {1,3,5,7} — a 1-minute gap left ~45s of real exploring). */
export const ER_HUNT_GAPS_MS = process.env.ER_HUNT_GAP_MS
  ? [Number(process.env.ER_HUNT_GAP_MS)]
  : [2, 4, 6, 8].map((m) => m * 60_000);
/** Hunt lengths: {1,2,3} minutes, crypto-picked. */
export const ER_HUNT_LENS_MS = process.env.ER_HUNT_LEN_MS
  ? [Number(process.env.ER_HUNT_LEN_MS)]
  : [1, 2, 3].map((m) => m * 60_000);
/** The red-light telegraph: fifteen seconds to find a room. */
export const ER_TELEGRAPH_MS = Number(process.env.ER_TELEGRAPH_MS ?? 15_000);
/** The monster runs at 2x the player's SPRINT (backrooms 2.85 cells/s) —
 *  uncatchable by design: hunts are about POSITION, not footraces. */
export const ER_MON_SPEED = Number(process.env.ER_MON_SPEED ?? 5.7);
/** Contact = death. */
const MON_KILL_RANGE = 0.75;
/** Retreat gives up and teleports home after this long (a pathing wedge must
 *  never hold the lights hostage). */
const RETREAT_MAX_MS = 30_000;
/** Arm's reach for key pickup / door toggles / the exit, in cells. */
const REACH = 2.2;
const MAX_ZONE = 24;
// A BUCKET, not a minimum gap (Oct 2026): a hiccup delivers several frames at
// once, and a 40ms gap kept the OLDEST of them, so everyone else watched that
// body stall where the burst began. Same shape as the Backrooms' (net.ts).
const MOVE_BURST = 10;
const MOVE_RATE = 25;

interface Body {
  ws: WebSocket;
  id: number;
  name: string;
  x: number;
  y: number;
  yaw: number;
  pose: number;
  suit: string;
  /** What the right hand shows, in the BACKROOMS' own wire grammar: "" empty,
   *  "flashlight" lowered, "flashlight!" lit (the ! is the active flag).
   *  PERSISTED like the casino's hold — a newcomer sees the torches already
   *  burning. Validated against the CARRIED bag, so nobody mimes a tool they
   *  don't own. */
  eq: string;
  /** The socket dropped at this time: the body still stands — frozen, still
   *  in the zone (the locker stays shut, the monster can still take it) —
   *  until an `enter` resumes it or the grace runs out. */
  lostAt?: number;
}

export interface EscapeZone {
  has(userId: number): boolean;
  count(): number;
  /** Bodies standing in the shared ante-room. */
  anteCount(): number;
  /** E4's death hook: rip a body out, void its bag, reset a held key. */
  kill(userId: number, reason: string): void;
}

export function attachEscapeZone(httpServer: Server, store: Store, bus?: Bus): EscapeZone {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // pos frames, not uploads
  const zone = new Map<number, Body>();
  /** The ante-room's bodies — the same shape, in the ante's own cells. */
  const ante = new Map<number, Body>();
  /** Sockets that opted into the shared ante (sent `ante-enter`), with the
   *  suit they asked for. Only these are seated back in the ante when their
   *  body leaves the complex — a bare `enter` client (every harness, an old
   *  bundle) gets exactly the old protocol and never an ante frame. */
  const anteSockets = new Map<WebSocket, { suit: string }>();
  const authed = new Map<WebSocket, { id: number; name: string; isAdmin?: boolean }>();
  const moveBucket = new Map<number, { tokens: number; at: number }>();

  // ---- the key -------------------------------------------------------------
  // Boot hygiene: a key row is live-session state; a crash must not strand
  // one in somebody's bag (the complex would be keyless forever).
  store.erClearKeys();
  let keyRoom: string | null = null;
  let keyHolder: number | null = null;
  let keyHeldAt = 0;
  let exitUntil = 0;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  const doors = new Map<string, boolean>(); // roomId -> open (default shut)

  const cryptoPick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const cryptoPickHard = <T>(arr: T[]): T => arr[randomInt(0, arr.length)];
  // (Math.random is FINE here: key/chest PLACEMENT is pacing, not money —
  // the crypto-only rule guards outcomes that mint or destroy value. The
  // chest's CONTENTS roll in escape-loot.ts, on node:crypto.)

  // ---- THE CHESTS (E3 — the mint's physical bodies) ------------------------
  // Five stand in distinct labeled rooms; an opened one respawns elsewhere
  // on the 4–8 minute clock. Contents are rolled AT OPEN, per opener — the
  // chest is a place, not a package.
  let chestSeq = 1;
  const chests = new Map<number, { room: string; x: number; y: number }>();
  const chestRoomPick = (): string => {
    const taken = new Set([...chests.values()].map((c) => c.room));
    return cryptoPick(ER_ROOMS.filter((r) => !taken.has(r.id))).id;
  };
  const spawnChest = (announce: boolean): void => {
    const room = chestRoomPick();
    const r = ER_ROOMS.find((q) => q.id === room)!;
    // Off-centre so it never fights the key for the middle of the rug.
    const id = chestSeq++;
    const c = { room, x: (r.x0 + r.x1 + 1) / 2 - 0.6, y: (r.y0 + r.y1 + 1) / 2 + 0.55 };
    chests.set(id, c);
    if (announce) broadcast({ type: "chest", id, state: "spawned", room, x: c.x, y: c.y });
  };

  // never the same room twice running — key-take clears keyRoom, so the
  // last room is remembered on its own (Oct 2026 review)
  let lastKeyRoom: string | null = null;
  const spawnKey = (announce: boolean): void => {
    const candidates = ER_ROOMS.filter((r) => r.id !== keyRoom && r.id !== lastKeyRoom);
    keyRoom = cryptoPick(candidates).id;
    lastKeyRoom = keyRoom;
    keyHolder = null;
    keyHeldAt = 0;
    if (announce) broadcast({ type: "key", state: "spawned", room: keyRoom });
  };

  const keyPos = (): { x: number; y: number } | null => {
    if (!keyRoom) return null;
    const r = ER_ROOMS.find((q) => q.id === keyRoom);
    if (!r) return null;
    return { x: (r.x0 + r.x1 + 1) / 2, y: (r.y0 + r.y1 + 1) / 2 };
  };

  const resetKey = (why: string): void => {
    if (keyHolder !== null) store.erRemoveItem(keyHolder, "key");
    spawnKey(false);
    broadcast({ type: "key", state: "moved", room: keyRoom, why });
  };

  // ---- THE HUNT (E4) --------------------------------------------------------
  // The grid the monster thinks in: walkable cells + the same door-edge law
  // players live under. Precomputed once; door state consulted at query time.
  const walkable = new Set<string>();
  const cellRoom = new Map<string, string>(); // cell -> room/den id ("" = hall)
  {
    const add = (r: { x0: number; y0: number; x1: number; y1: number }, id: string): void => {
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          walkable.add(`${x},${y}`);
          if (id) cellRoom.set(`${x},${y}`, id);
        }
    };
    add(ER_FLOOR, "");
    add(ER_STUB, "");
    for (const r of ER_ROOMS) add(r, r.id); // islands re-tag their floor cells
    for (const d of ER_DENS) add(d, d.id);
  }
  /** The open floor — where the monster prowls when it knows nobody. */
  const hallCells: { x: number; y: number }[] = [];
  for (const key of walkable) {
    if (cellRoom.get(key)) continue;
    const [x, y] = key.split(",").map(Number);
    hallCells.push({ x, y });
  }
  /** WHERE ARRIVALS STAND. Every body used to be seated at exactly
   *  ER_ENTRY, so two arrivals stood inside each other and neither could see
   *  the other (Josh, Oct 2026). The entry itself first, then open HALL cells
   *  near it — never a room, a den, a doorway or the stub's mouth (the way
   *  out stays clear) — nearest first. */
  const doorCells = new Set([...ER_ROOMS, ...ER_DENS].map((r) => `${r.door.x},${r.door.y}`));
  const entrySeats: { x: number; y: number }[] = [{ x: ER_ENTRY.x, y: ER_ENTRY.y }];
  {
    const near: { x: number; y: number; d: number }[] = [];
    for (const c of hallCells) {
      if (c.y >= ER_STUB.y0 || doorCells.has(`${c.x},${c.y}`)) continue;
      const x = c.x + 0.5, y = c.y + 0.5;
      const d = Math.hypot(x - ER_ENTRY.x, y - ER_ENTRY.y);
      if (d < 0.5 || d > 4.6) continue;
      near.push({ x, y, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const c of near) entrySeats.push({ x: c.x, y: c.y });
  }
  const anteArriveSeats: { x: number; y: number }[] = [];
  const anteReturnSeats: { x: number; y: number }[] = [];
  {
    const build = (anchor: { x: number; y: number }, dys: number[], out: { x: number; y: number }[]): void => {
      const all: { x: number; y: number; d: number }[] = [];
      for (const dy of dys)
        for (let dx = -4.5; dx <= 4.5; dx += 0.9) {
          const x = Math.round((anchor.x + dx) * 100) / 100, y = anchor.y + dy;
          if (x < 0.8 || x > ER_ANTE.w - 0.8 || y < 0.8 || y > ER_ANTE.h - 0.6) continue;
          if (ANTE_BLOCKED.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) continue;
          all.push({ x, y, d: Math.hypot(x - anchor.x, dy) });
        }
      all.sort((a, b) => a.d - b.d);
      for (const c of all) out.push({ x: c.x, y: c.y });
    };
    build(ER_ANTE_ARRIVE, [0, -0.9, 0.5, -1.8], anteArriveSeats);
    build(ER_ANTE_RETURN, [0, 0.9, 1.8], anteReturnSeats);
  }
  /** The nearest seat nobody is standing on; crowded out, a random one. */
  const pickSeat = (seats: { x: number; y: number }[], others: Iterable<Body>): { x: number; y: number } => {
    const os = [...others];
    for (const st of seats) if (os.every((o) => Math.hypot(o.x - st.x, o.y - st.y) >= SEAT_GAP)) return st;
    return seats[Math.floor(Math.random() * seats.length)];
  };

  /** May the monster cross between two adjacent cells? Same-region always;
   *  across a region boundary only through that room's DOORWAY, and only
   *  while the door stands OPEN (dens always open to their owner). */
  const monPassable = (ax: number, ay: number, bx: number, by: number): boolean => {
    if (!walkable.has(`${bx},${by}`)) return false;
    const ra = cellRoom.get(`${ax},${ay}`) ?? "";
    const rb = cellRoom.get(`${bx},${by}`) ?? "";
    if (ra === rb) return true;
    const roomId = ra || rb; // one side is a hall
    if (ra && rb) return false; // room↔room never connects directly
    const den = ER_DENS.find((d) => d.id === roomId);
    if (den) {
      // The shutter is the monster's own door — always passable, but only
      // AT the doorway cell.
      const hall = ra ? { x: bx, y: by } : { x: ax, y: ay };
      return hall.x === den.door.x && hall.y === den.door.y;
    }
    const room = ER_ROOMS.find((r) => r.id === roomId);
    if (!room) return false;
    if (!(doors.get(roomId) ?? false)) return false; // shut door = shut
    const hall = ra ? { x: bx, y: by } : { x: ax, y: ay };
    return hall.x === room.door.x && hall.y === room.door.y;
  };

  type HuntPhase = "calm" | "telegraph" | "hunt" | "retreat";
  let phase: HuntPhase = "calm";
  let phaseEndsAt = Date.now() + cryptoPickHard(ER_HUNT_GAPS_MS);
  // The zone BOOTS empty, so it boots PARKED — without this, a server that
  // sat quiet past the first gap greeted its first visitor with an instant
  // telegraph instead of the documented calm (Aug 2026 review). thawIfFirst
  // re-arms the full gap when the first body walks in.
  let pausedRemaining: number | null = phaseEndsAt - Date.now();
  let openBlocks: string[] = [];
  let denId = "";
  const mon = { x: 0, y: 0 };
  let monPath: { x: number; y: number }[] = [];
  let retreatStartedAt = 0;
  /** Admin P-menu: hold the creature still for a screenshot or a close look. */
  let monFrozen = false;

  const BLOCKS = ["A", "B", "C", "D", "Z"];
  const huntSnapshot = () => ({
    phase,
    until: phaseEndsAt,
    blocks: openBlocks,
    den: denId,
    mon: phase === "hunt" || phase === "retreat" ? { x: mon.x, y: mon.y } : null,
  });
  const lockdown = (): boolean => phase !== "calm";

  /** THE KILL HONOURS THE SAME WALLS THE WALK DOES (Josh, Aug 2026: "when
   *  the hunt starts and I'm in a room with the door open I just die"). The
   *  sweep used raw distance with no wall check, so the sprint past an
   *  open-door room's corridor wall killed THROUGH the wall before the
   *  monster ever reached the doorway. It may take a body only from inside
   *  the same region, or lunging across the open doorway edge itself. A
   *  shut door still blocks (that edge is impassable) — and a monster
   *  already INSIDE the room kills regardless of the door: shutting
   *  yourself in with it is not a hiding place. */
  /** Can a body reach something in this room? From inside the room, or from
   *  its doorway while the door stands open — never through a wall or a shut
   *  door (Oct 2026 review: the key and chests were taken through walls,
   *  which got round the block-letter lockdown). */
  const reachesRoom = (b: Body, roomId: string): boolean => {
    const bx = Math.floor(b.x), by = Math.floor(b.y);
    if ((cellRoom.get(`${bx},${by}`) ?? "") === roomId) return true;
    const room = ER_ROOMS.find((r) => r.id === roomId);
    return !!room && (doors.get(roomId) ?? false) && bx === room.door.x && by === room.door.y;
  };
  const canTake = (b: Body): boolean => {
    const mx = Math.floor(mon.x), my = Math.floor(mon.y);
    const bx = Math.floor(b.x), by = Math.floor(b.y);
    if ((cellRoom.get(`${mx},${my}`) ?? "") === (cellRoom.get(`${bx},${by}`) ?? "")) return true;
    if (Math.abs(mx - bx) + Math.abs(my - by) === 1) return monPassable(mx, my, bx, by);
    return false;
  };

  /** BFS over cells honouring monPassable. Small grid; runs per think-tick. */
  const pathTo = (tx: number, ty: number): { x: number; y: number }[] => {
    const start = `${Math.floor(mon.x)},${Math.floor(mon.y)}`;
    const goal = `${tx},${ty}`;
    if (start === goal) return [];
    const prev = new Map<string, string>();
    const q = [start];
    prev.set(start, "");
    while (q.length) {
      const cur = q.shift()!;
      if (cur === goal) break;
      const [cx, cy] = cur.split(",").map(Number);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        const k = `${nx},${ny}`;
        if (prev.has(k) || !monPassable(cx, cy, nx, ny)) continue;
        prev.set(k, cur);
        q.push(k);
      }
    }
    if (!prev.has(goal)) return [];
    const out: { x: number; y: number }[] = [];
    for (let k = goal; k !== start; k = prev.get(k)!) {
      const [x, y] = k.split(",").map(Number);
      out.unshift({ x: x + 0.5, y: y + 0.5 });
    }
    return out;
  };

  const beginTelegraph = (): void => {
    phase = "telegraph";
    phaseEndsAt = Date.now() + ER_TELEGRAPH_MS;
    const count = 2 + randomInt(0, 2); // 2 or 3 letters
    const pool = [...BLOCKS];
    openBlocks = [];
    for (let i = 0; i < count; i++) openBlocks.push(pool.splice(randomInt(0, pool.length), 1)[0]);
    openBlocks.sort();
    denId = cryptoPickHard(ER_DENS).id;
    // THE LOCKDOWN SLAMS EVERY DOOR (Josh): all shut the moment the alarms
    // start; only the open letters may be re-opened (the existing
    // block_locked gate). And a body inside a room OUTSIDE tonight's act is
    // TURNED OUT — teleported in front of its own door, which shuts behind
    // it. Standing in the wrong room is not a hiding place.
    for (const [room, open] of [...doors.entries()]) {
      if (open) broadcast({ type: "door", room, open: false });
    }
    doors.clear();
    for (const b of zone.values()) {
      const roomId = cellRoom.get(`${Math.floor(b.x)},${Math.floor(b.y)}`) ?? "";
      if (!roomId || roomId.startsWith("den")) continue;
      if (openBlocks.includes(roomId[0])) continue; // tonight's rooms may shelter
      const room = ER_ROOMS.find((r) => r.id === roomId);
      if (!room) continue;
      b.x = room.door.x + 0.5;
      b.y = room.door.y + 0.5;
      send(b.ws, { type: "teleport", x: b.x, y: b.y });
      broadcast({ type: "pos", id: b.id, x: b.x, y: b.y, yaw: b.yaw, p: b.pose }, b.id);
    }
    broadcast({ type: "hunt", ...huntSnapshot() });
  };
  const beginHunt = (): void => {
    phase = "hunt";
    phaseEndsAt = Date.now() + cryptoPickHard(ER_HUNT_LENS_MS);
    const den = ER_DENS.find((d) => d.id === denId)!;
    mon.x = (den.x0 + den.x1 + 1) / 2;
    mon.y = (den.y0 + den.y1 + 1) / 2;
    monPath = [];
    broadcast({ type: "hunt", ...huntSnapshot() });
  };
  const beginRetreat = (): void => {
    phase = "retreat";
    retreatStartedAt = Date.now();
    phaseEndsAt = Date.now() + RETREAT_MAX_MS;
    broadcast({ type: "hunt", ...huntSnapshot() });
  };
  const backToCalm = (): void => {
    phase = "calm";
    openBlocks = [];
    denId = "";
    phaseEndsAt = Date.now() + cryptoPickHard(ER_HUNT_GAPS_MS);
    broadcast({ type: "hunt", ...huntSnapshot() });
  };

  const monKillSweep = (): void => {
    for (const b of [...zone.values()]) {
      if (!canTake(b)) continue;
      if (Math.hypot(b.x - mon.x, b.y - mon.y) <= MON_KILL_RANGE) {
        broadcast({ type: "killed", id: b.id, name: b.name });
        api_kill(b.id, "the thing in the halls");
      }
    }
  };

  /** WHAT THE MONSTER KNOWS: a body is hidden from it only behind a SHUT
   *  door. Standing in a room with the door OPEN is standing in its line of
   *  sight — it walks in through the doorway and takes you (Josh, Aug 2026:
   *  the first cut made ANY room invisible, so the thing never had a reason
   *  to path through an open door and looked like broken pathfinding — an
   *  open door has to be a mistake, or shutting it means nothing). Den
   *  cells never hide anyone. */
  const isKnown = (b: Body): boolean => {
    const room = cellRoom.get(`${Math.floor(b.x)},${Math.floor(b.y)}`) ?? "";
    if (!room || room.startsWith("den")) return true;
    // Standing in the room WITH it is known whatever the door says — a shut
    // door hides you from the halls, not from the thing already inside.
    if (room === (cellRoom.get(`${Math.floor(mon.x)},${Math.floor(mon.y)}`) ?? "")) return true;
    return doors.get(room) ?? false; // open door = seen through the doorway
  };
  /** The nearest walkable cell to (x, y) — a body standing in the plate's
   *  slack, off the floor, gave the monster a goal it could never path to,
   *  and it stood still (Oct 2026 review). */
  const floorNear = (x: number, y: number): { x: number; y: number } => {
    if (walkable.has(`${x},${y}`)) return { x, y };
    for (let r = 1; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (walkable.has(`${x + dx},${y + dy}`)) return { x: x + dx, y: y + dy };
    return { x, y };
  };
  const monThink = (dt: number): void => {
    // Nearest KNOWN body. Nobody in the open → it PROWLS the halls (a
    // wander, not a stake-out — lurking at an occupied door would leak the
    // knowledge it isn't supposed to have).
    let target: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const b of zone.values()) {
      if (!isKnown(b)) continue;
      const d = Math.hypot(b.x - mon.x, b.y - mon.y);
      if (d < bestD) { bestD = d; target = floorNear(Math.floor(b.x), Math.floor(b.y)); }
    }
    if (phase === "retreat") {
      const den = ER_DENS.find((d) => d.id === denId)!;
      target = { x: Math.floor((den.x0 + den.x1 + 1) / 2), y: Math.floor((den.y0 + den.y1 + 1) / 2) };
    }
    if (target) monPath = pathTo(target.x, target.y);
    else if (!monPath.length && hallCells.length) {
      // pacing only — never an outcome roll
      const c = hallCells[Math.floor(Math.random() * hallCells.length)];
      monPath = pathTo(c.x, c.y);
    }
    // Walk the path.
    let budget = ER_MON_SPEED * dt;
    while (budget > 0 && monPath.length) {
      const wp = monPath[0];
      // A door can shut mid-chase. Never walk a waypoint the walls now
      // refuse — drop the stale path and re-plan next think, instead of
      // ghosting through the shut door on old waypoints.
      if (!monPassable(Math.floor(mon.x), Math.floor(mon.y), Math.floor(wp.x), Math.floor(wp.y))) {
        monPath = [];
        break;
      }
      const d = Math.hypot(wp.x - mon.x, wp.y - mon.y);
      if (d <= budget) {
        mon.x = wp.x;
        mon.y = wp.y;
        monPath.shift();
        budget -= d;
      } else {
        mon.x += ((wp.x - mon.x) / d) * budget;
        mon.y += ((wp.y - mon.y) / d) * budget;
        budget = 0;
      }
    }
    monKillSweep();
  };

  let lastTick = Date.now();
  const huntTick = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.5, (now - lastTick) / 1000);
    lastTick = now;
    if (zone.size === 0) return; // parked — the clock belongs to the occupied
    if (now >= phaseEndsAt) {
      if (phase === "calm") beginTelegraph();
      else if (phase === "telegraph") beginHunt();
      else if (phase === "hunt") beginRetreat();
      else backToCalm(); // retreat timeout: teleport home, lights up
    }
    if (phase === "hunt" || phase === "retreat") {
      if (!monFrozen) monThink(dt);
      broadcast({ type: "mon", x: Math.round(mon.x * 20) / 20, y: Math.round(mon.y * 20) / 20 });
      if (phase === "retreat") {
        const den = ER_DENS.find((d) => d.id === denId)!;
        const home = Math.hypot(mon.x - (den.x0 + den.x1 + 1) / 2, mon.y - (den.y0 + den.y1 + 1) / 2) < 0.9;
        if (home || now - retreatStartedAt > RETREAT_MAX_MS) backToCalm();
      }
    }
  }, 200);
  huntTick.unref?.();

  /** Freeze the clock when the last body leaves; thaw when the first enters.
   *  A RED PHASE DOES NOT SURVIVE AN EMPTY ZONE: the entry gate refuses
   *  newcomers during the alarms, so a machine parked mid-hunt would lock
   *  the complex FOREVER — nobody inside to run the clock, nobody allowed in
   *  to become inside. (Shipped that way for forty minutes; Josh was the
   *  first person locked out.) An act with no audience simply ends. */
  const parkIfEmpty = (): void => {
    if (zone.size !== 0) return;
    // The housekeeping pass: an empty complex shuts its doors. A day of play
    // left every door standing open (hugging the wall at 90°, invisible from
    // the hall), which read as "there are no doors" — a fresh act starts on
    // a made-up stage. Nobody's inside, so there is nobody to broadcast to.
    doors.clear();
    if (phase !== "calm") {
      phase = "calm";
      openBlocks = [];
      denId = "";
      pausedRemaining = cryptoPickHard(ER_HUNT_GAPS_MS);
      return;
    }
    if (pausedRemaining === null) pausedRemaining = Math.max(0, phaseEndsAt - Date.now());
  };
  const thawIfFirst = (): void => {
    if (pausedRemaining !== null) {
      phaseEndsAt = Date.now() + pausedRemaining;
      pausedRemaining = null;
    }
  };
  // The kill path needs a forward reference (defined in the return below).
  let api_kill: (userId: number, reason: string) => void = () => {};

  const send = (ws: WebSocket, msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: unknown, except?: number): void => {
    for (const b of zone.values()) if (b.id !== except) send(b.ws, msg);
  };
  const anteBroadcast = (msg: unknown, except?: number): void => {
    for (const b of ante.values()) if (b.id !== except) send(b.ws, msg);
  };
  /** The roster's one line: "in the Escape Room" while the body stands in
   *  the ante OR the complex. Computed from both, after every move between
   *  them, so a crossing never flickers the line off (realtime dedupes). */
  const syncPresence = (id: number): void => {
    bus?.emit("zone.presence", { userId: id, zone: "escape", on: zone.has(id) || ante.has(id), detail: null });
  };
  /** The suit check, the FLOOR's way (backrooms locker rows) — the same suit
   *  system everywhere (the uniformity law). A quiet yellow fallback. */
  const suitFor = (userId: number, claimed: unknown): string => {
    const suit = String(claimed ?? "yellow");
    if (suit === "yellow") return suit;
    const owned = store.brLockerItems(userId).some((i) => i.kind === "suit" && (i.color ?? "yellow") === suit);
    return owned ? suit : "yellow";
  };
  const anteLeave = (id: number): void => {
    if (!ante.delete(id)) return;
    anteBroadcast({ type: "ante-bye", id });
  };
  /** Seat a body in the shared ante and introduce it. `at` picks the anchor:
   *  arriving from the floor, or back out of the complex. */
  const anteSeat = (ws: WebSocket, who: { id: number; name: string }, suit: string, at: "arrive" | "return"): void => {
    const anchor = at === "arrive" ? ER_ANTE_ARRIVE : ER_ANTE_RETURN;
    const spot = pickSeat(at === "arrive" ? anteArriveSeats : anteReturnSeats, [...ante.values()].filter((o) => o.id !== who.id));
    const b: Body = { ws, id: who.id, name: who.name, x: spot.x, y: spot.y, yaw: anchor.yaw, pose: 0, suit, eq: "" };
    ante.set(who.id, b);
    send(ws, {
      type: "ante-welcome",
      you: { id: who.id, x: b.x, y: b.y, yaw: b.yaw },
      peers: [...ante.values()].filter((p) => p.id !== who.id).map(dto),
    });
    anteBroadcast({ type: "ante-join", peer: dto(b) }, who.id);
  };
  /** A body just left the complex on this socket: back into the ante, if the
   *  socket asked to be there. */
  const backToAnte = (ws: WebSocket, who: { id: number; name: string }): void => {
    const opt = anteSockets.get(ws);
    if (!opt || ws.readyState !== WebSocket.OPEN) return;
    if (!ante.has(who.id) && ante.size >= MAX_ANTE) return;
    anteSeat(ws, who, opt.suit, "return");
  };

  const dto = (b: Body) => ({ id: b.id, name: b.name, x: b.x, y: b.y, yaw: b.yaw, p: b.pose, suit: b.suit, eq: b.eq });
  const snapshot = () => ({
    key: keyHolder !== null
      ? { state: "held", by: keyHolder }
      : { state: "loose", room: keyRoom, pos: keyPos() },
    exitUntil,
    doors: [...doors.entries()].filter(([, open]) => open).map(([room]) => room),
    chests: [...chests.entries()].map(([id, c]) => ({ id, room: c.room, x: c.x, y: c.y })),
  });

  const leave = (id: number, tellThem: boolean): void => {
    const b = zone.get(id);
    if (!b) return;
    zone.delete(id);
    parkIfEmpty();
    broadcast({ type: "bye", id });
    if (keyHolder === id) resetKey("the holder left");
    if (tellThem) {
      send(b.ws, { type: "left" });
      backToAnte(b.ws, { id, name: b.name });
    }
    // The roster's line ends with the body — unless it walked into the ante.
    syncPresence(id);
  };

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws-escape") return;
    const user = userForToken(store, url.searchParams.get("token") ?? undefined);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // THE PAPERWORK: no Terms on file, no complex (legal.ts).
    if (termsOutstanding(user)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      rememberSocketToken(ws, url.searchParams.get("token"));
      // a few sockets per account, the oldest let go (Oct 2026 review — the
      // app socket's rule; this door had no cap at all)
      const mine = [...authed].filter(([, w]) => w.id === user.id).map(([s]) => s);
      for (const old of mine.slice(0, Math.max(0, mine.length - 3))) old.close(4008, "replaced");
      authed.set(ws, { id: user.id, name: user.displayName, isAdmin: !!user.isAdmin });
      wss.emit("connection", ws);
    });
  });

  const drop = (ws: WebSocket): void => {
    const who = authed.get(ws);
    authed.delete(ws);
    if (!who) return;
    anteSockets.delete(ws);
    const b = zone.get(who.id);
    // A DROPPED SOCKET IS NOT A WAY OUT (Oct 2026 review): it used to delete
    // the body on the spot — no death, the pass and the bag kept, the locker
    // open again — so closing the tab dodged the monster and the "no exit
    // without the key" rule alike. During the alarms it is a death; in the
    // calm the body stands frozen for ER_DROP_GRACE_MS and a refresh resumes it.
    if (b && b.ws === ws) {
      if (lockdown()) api_kill(who.id, "lost in the dark");
      else {
        b.lostAt = Date.now();
        if (keyHolder === who.id) resetKey("the holder left");
      }
    }
    const a = ante.get(who.id);
    if (a && a.ws === ws) {
      anteLeave(who.id);
      syncPresence(who.id);
    }
  };
  // A ban/suspend/scrub/jail hangs up this wire too (Sep 2026 review) — a
  // banned body used to keep holding the key until it disconnected itself.
  bus?.on("user.kick", ({ userId }) => {
    for (const [ws, who] of authed) if (who.id === userId && !sessionStandsFor(store, ws)) ws.close(4003, "kicked");
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("close", () => drop(ws));
    ws.on("error", () => drop(ws));
    ws.on("message", (raw: RawData) => {
      const who = authed.get(ws);
      if (!who) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === "enter") {
        // THE DOOR'S REAL GUARDS. The hall-side prompt already said all this,
        // but the hall-side prompt is a client.
        if (lockdown() && !zone.has(who.id)) {
          // The alarms are ringing: nobody NEW walks in (Josh's spec — the
          // exit stays usable; entry does not).
          send(ws, { type: "denied", error: "lockdown" });
          return;
        }
        if (!store.erPass(who.id)) {
          send(ws, { type: "denied", error: "no_pass" });
          return;
        }
        if (store.casinoGunRounds(who.id) !== null) {
          send(ws, { type: "denied", error: "gun_carried" });
          return;
        }
        if (!zone.has(who.id) && zone.size >= MAX_ZONE) {
          send(ws, { type: "denied", error: "zone_full" });
          return;
        }
        const prev = zone.get(who.id);
        if (prev && prev.ws === ws) {
          // Already inside on THIS socket: re-sending "enter" must not
          // re-seat the body — a fresh Body at ER_ENTRY was a free mid-chase
          // teleport to the door, dodging a death that would have burned the
          // pass (Aug 2026 review). Re-serve the welcome where they stand.
          send(ws, {
            type: "welcome",
            you: { id: who.id, x: prev.x, y: prev.y, yaw: prev.yaw },
            peers: [...zone.values()].filter((p) => p.id !== who.id).map(dto),
            ...snapshot(),
            hunt: huntSnapshot(),
            // the day's chest count, so the prompt is right after a reload
            opens: store.erOpensToday(who.id),
            opensMax: ER_OPENS_PER_DAY,
          });
          return;
        }
        if (prev && prev.ws !== ws) {
          send(prev.ws, { type: "denied", error: "replaced" });
          prev.ws.close();
        }
        // The suit you wore on the floor walks in with you — validated the
        // FLOOR'S way (backrooms locker rows), because it is the same suit
        // system everywhere (the uniformity law). Not a refusal — the door
        // is not a dress code.
        const suit = suitFor(who.id, msg.suit);
        // A REPLACEMENT (refresh, second tab) resumes where the body stood —
        // seating it at ER_ENTRY was the same free teleport with an F5. A
        // fresh arrival takes the nearest free seat by the entry, and THE
        // WELCOME SAYS WHERE: the client used to seat itself at ER_ENTRY
        // whatever the server decided, which stacked every arrival and
        // desynced a resumed one.
        const seat = prev ? { x: prev.x, y: prev.y } : pickSeat(entrySeats, zone.values());
        const b: Body = {
          ws, id: who.id, name: who.name,
          x: seat.x, y: seat.y,
          yaw: prev?.yaw ?? 0, pose: 0, suit, eq: "",
        };
        // Out of the ante (on any socket — one body per person).
        const inAnte = ante.get(who.id);
        if (inAnte) {
          anteLeave(who.id);
          if (inAnte.ws !== ws) {
            send(inAnte.ws, { type: "ante-replaced" });
            anteSockets.delete(inAnte.ws);
          }
        }
        thawIfFirst();
        zone.set(who.id, b);
        send(ws, {
          type: "welcome",
          you: { id: who.id, x: b.x, y: b.y, yaw: b.yaw },
          peers: [...zone.values()].filter((p) => p.id !== who.id).map(dto),
          ...snapshot(),
          hunt: huntSnapshot(),
          // the day's chest count, so the prompt is right after a reload
          opens: store.erOpensToday(who.id),
          opensMax: ER_OPENS_PER_DAY,
        });
        broadcast({ type: "join", peer: dto(b) }, who.id);
        // …and the whole app's roster learns where they went.
        syncPresence(who.id);
        return;
      }

      if (msg.type === "ante-enter") {
        // THE SHARED ANTE: a body standing in Sterling's room, seen by
        // everyone else standing there. No pass needed — it is a room.
        let inside = zone.get(who.id);
        // a FROZEN body (its socket dropped in the calm) walks out when its
        // owner chooses the ante instead of resuming it
        if (inside && inside.lostAt !== undefined && !lockdown()) {
          leave(who.id, false);
          inside = undefined;
        }
        if (inside) {
          // One body per person: inside the complex on another window, this
          // one stays a private view of the ante.
          if (inside.ws !== ws) send(ws, { type: "denied", error: "in_complex" });
          return;
        }
        const suit = suitFor(who.id, msg.suit);
        anteSockets.set(ws, { suit });
        const cur = ante.get(who.id);
        if (cur && cur.ws === ws) {
          // A repeat on this socket re-serves the welcome where they stand.
          send(ws, {
            type: "ante-welcome",
            you: { id: who.id, x: cur.x, y: cur.y, yaw: cur.yaw },
            peers: [...ante.values()].filter((p) => p.id !== who.id).map(dto),
          });
          return;
        }
        if (cur && cur.ws !== ws) {
          // A second window takes the body over; the first goes quiet.
          anteLeave(who.id);
          send(cur.ws, { type: "ante-replaced" });
          anteSockets.delete(cur.ws);
        }
        if (ante.size >= MAX_ANTE) {
          send(ws, { type: "denied", error: "ante_full" });
          return;
        }
        anteSeat(ws, who, suit, "arrive");
        syncPresence(who.id);
        return;
      }

      if (msg.type === "move" || msg.type === "equip") {
        // ROUTED BY WHERE THE SERVER HAS THE BODY, never by a client's claim.
        // The optional `in` tag only lets a stale frame be DROPPED: an ante
        // move still in flight when the complex welcomed the body must not
        // teleport it to ante coordinates inside the complex (or back).
        const inZone = zone.get(who.id);
        const inAnte = ante.get(who.id);
        const where = inZone && inZone.ws === ws ? "complex" : inAnte && inAnte.ws === ws ? "ante" : null;
        if (!where) return;
        if ((msg.in === "ante" || msg.in === "complex") && msg.in !== where) return;
        const b = (where === "complex" ? inZone : inAnte)!;
        if (msg.type === "equip") {
          const eq = String(msg.eq ?? "");
          // The backrooms' own "kind!" active grammar, over the ER bag: empty
          // hand, flashlight, walkie, the almond bottle in hand, or the key.
          // Wire kinds are the BACKROOMS vocabulary (uniformity — one grammar
          // everywhere); the bag speaks ER item names, so the bottle maps.
          const kind = eq.endsWith("!") ? eq.slice(0, -1) : eq;
          const KINDS: Record<string, string> = { flashlight: "flashlight", walkie: "walkie", almondwater: "almond", key: "key" };
          if (kind !== "" && !(kind in KINDS)) return;
          if (kind && !store.erInventory(who.id).some((i) => i.item === KINDS[kind])) {
            send(ws, { type: "denied", error: "not_carried" });
            return;
          }
          if (b.eq === eq) return;
          b.eq = eq;
          if (where === "complex") broadcast({ type: "equip", id: b.id, eq });
          else anteBroadcast({ type: "ante-equip", id: b.id, eq }, b.id);
          return;
        }
        const now = Date.now();
        const bk = moveBucket.get(who.id) ?? { tokens: MOVE_BURST, at: now };
        bk.tokens = Math.min(MOVE_BURST, bk.tokens + ((now - bk.at) / 1000) * MOVE_RATE);
        bk.at = now;
        moveBucket.set(who.id, bk);
        if (bk.tokens < 1) return;
        bk.tokens -= 1;
        // HOSTILE INPUT (Sep 2026 review). `Number(x) || 0` turned NaN into 0
        // but let Infinity straight through: JSON.stringify writes it as
        // null, so one frame put a `null` coordinate on every peer's wire,
        // and a NaN yaw/pose reached three.js as a NaN matrix. The floor and
        // the backrooms validate their frames; this door now does too — a
        // non-finite coordinate is dropped whole, and a finite one is kept
        // inside its room (ER_BOUNDS in the complex, so a body can never
        // stand off the plate where no kill sweep or reach check can find
        // it; ER_ANTE_BOUNDS in the ante).
        const x = Number(msg.x), y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const box = where === "complex" ? ER_BOUNDS : ER_ANTE_BOUNDS;
        b.x = Math.min(box.x1, Math.max(box.x0, x));
        b.y = Math.min(box.y1, Math.max(box.y0, y));
        const yaw = Number(msg.yaw);
        if (Number.isFinite(yaw)) b.yaw = yaw;
        const pose = Number(msg.p);
        b.pose = Number.isFinite(pose) ? Math.max(0, Math.min(4, Math.round(pose))) : 0;
        if (where === "complex") broadcast({ type: "pos", id: b.id, x: b.x, y: b.y, yaw: b.yaw, p: b.pose }, who.id);
        else anteBroadcast({ type: "ante-pos", id: b.id, x: b.x, y: b.y, yaw: b.yaw, p: b.pose }, who.id);
        return;
      }

      if (msg.type === "debug") {
        // THE ADMIN'S P-MENU (E5, Josh's ask: "test all the features are
        // working correctly"). Server-enforced like every admin surface —
        // the client's menu is a convenience, this check is the rule.
        // Deliberately ABOVE the in-zone body guard: the menu must work
        // from the ANTE, because the thing being diagnosed may be the very
        // door that puts a body in the zone (found the hard way, in
        // production, with the operator locked outside his own complex).
        if (!who.isAdmin) {
          send(ws, { type: "denied", error: "not_admin" });
          return;
        }
        const op = String(msg.op ?? "");
        if (op === "hunt-start" && phase === "calm") {
          // An act needs an audience. Starting a hunt over an EMPTY zone
          // recreated the production forever-lockout the empty-zone rule was
          // shipped to fix: the tick never advances while nobody's inside,
          // and the lockdown refuses everyone who tries to become inside
          // (Aug 2026 review — the P-menu answers from the ante, one door
          // away from exactly this).
          if (zone.size === 0) {
            send(ws, { type: "denied", error: "empty_zone" });
            return;
          }
          beginTelegraph();
        } else if (op === "hunt-end" && phase !== "calm") {
          backToCalm(); // straight to calm — a retreat that instantly ends is just two contradictory frames
        } else if (op === "key-reset") resetKey("the house reshuffled it");
        else if (op === "chest-spawn") spawnChest(true);
        else if (op === "mon-freeze") {
          monFrozen = !monFrozen;
          send(ws, { type: "debug", op, frozen: monFrozen });
          return;
        } else if (op === "state") {
          send(ws, { type: "debug", op, hunt: huntSnapshot(), bodies: zone.size, ante: ante.size, doors: [...doors.entries()].filter(([, o]) => o).map(([r]) => r) });
          return;
        }
        send(ws, { type: "debug", op, done: true });
        return;
      }

      const b = zone.get(who.id);
      if (!b || b.ws !== ws) return;

      if (msg.type === "leave") {
        // Walking out through an OPEN exit only — there is no other way to
        // stop being inside (Josh: "not able to leave unless they recover a
        // key"). Distance-checked like everything else.
        if (Date.now() >= exitUntil) {
          send(ws, { type: "denied", error: "exit_locked" });
          return;
        }
        if (Math.hypot(b.x - ER_EXIT.x, b.y - ER_EXIT.y) > REACH) {
          send(ws, { type: "denied", error: "too_far" });
          return;
        }
        leave(who.id, true);
        return;
      }

      if (msg.type === "key-take") {
        const kp = keyPos();
        if (keyHolder !== null || !kp) {
          send(ws, { type: "denied", error: "no_key_here" });
          return;
        }
        if (Math.hypot(b.x - kp.x, b.y - kp.y) > REACH || !reachesRoom(b, keyRoom!)) {
          send(ws, { type: "denied", error: "too_far" });
          return;
        }
        // The slot cost is REAL: a full bag cannot take the key.
        if (!store.erGrantItem(who.id, "key", 1, ER_INV_SLOTS)) {
          send(ws, { type: "denied", error: "bag_full" });
          return;
        }
        keyHolder = who.id;
        keyHeldAt = Date.now();
        keyRoom = null;
        broadcast({ type: "key", state: "taken", by: who.id, name: b.name });
        return;
      }

      if (msg.type === "key-use") {
        if (keyHolder !== who.id) {
          send(ws, { type: "denied", error: "not_holder" });
          return;
        }
        if (Math.hypot(b.x - ER_EXIT.x, b.y - ER_EXIT.y) > REACH) {
          send(ws, { type: "denied", error: "too_far" });
          return;
        }
        store.erRemoveItem(who.id, "key");
        keyHolder = null;
        keyHeldAt = 0;
        exitUntil = Date.now() + ER_EXIT_MS;
        broadcast({ type: "exit", until: exitUntil, by: b.name });
        if (exitTimer) clearTimeout(exitTimer);
        exitTimer = setTimeout(() => {
          exitTimer = null;
          // The window shuts; a fresh key waits somewhere else — unless one is
          // already out or in somebody's bag (Oct 2026 review: re-spawning
          // over a held key left a phantom in the holder's bag)
          if (keyRoom === null && keyHolder === null) spawnKey(true);
          broadcast({ type: "exit", until: 0, by: "" });
        }, ER_EXIT_MS);
        return;
      }

      if (msg.type === "consume") {
        // Drinking from the bag (E2c: almond water). Server-owned like every
        // bag movement: the guarded decrement IS the rule — nothing carried,
        // nothing happens, and never a double-swig from one bottle.
        const item = String(msg.item ?? "");
        if (item !== "almond") return;
        if (!store.erConsumeItem(who.id, item)) {
          send(ws, { type: "denied", error: "not_carried" });
          return;
        }
        send(ws, { type: "consumed", item });
        // The room sees the swig — the same one-shot shape as the casino
        // floor's drink frame.
        broadcast({ type: "drink", id: who.id }, who.id);
        return;
      }

      if (msg.type === "chest-open") {
        const id = Number(msg.id);
        const c = chests.get(id);
        if (!c) {
          send(ws, { type: "denied", error: "no_chest" });
          return;
        }
        if (Math.hypot(b.x - c.x, b.y - c.y) > REACH || !reachesRoom(b, c.room)) {
          send(ws, { type: "denied", error: "too_far" });
          return;
        }
        // Roll first (pure), grant second (transactional). A refused
        // allowance costs nothing AND LEAVES THE CHEST for somebody who can
        // still open today — the valve throttles the player, not the room.
        const roll = rollChest(store.erOwnedSkins(who.id, ER_SKINS));
        const r = store.erOpenChest(who.id, roll, ER_OPENS_PER_DAY);
        if (!r.ok) {
          send(ws, { type: "denied", error: r.error });
          return;
        }
        chests.delete(id);
        store.bumpStat(who.id, "chests_opened"); // Ledger/achievement telemetry
        // The RESULT is the opener's alone (recipient-scoped, like hole
        // cards); the room sees only that the chest is spent.
        send(ws, {
          type: "loot",
          tier: roll.tier,
          kind: roll.kind,
          amount: roll.amount ?? 0,
          skin: roll.skin ?? null,
          opens: r.opens,
          opensMax: ER_OPENS_PER_DAY,
        });
        broadcast({ type: "chest", id, state: "opened", by: b.name });
        const wait = CHEST_RESPAWN_MIN_MS + Math.random() * (CHEST_RESPAWN_MAX_MS - CHEST_RESPAWN_MIN_MS);
        const t = setTimeout(() => spawnChest(true), wait);
        (t as { unref?: () => void }).unref?.();
        return;
      }

      if (msg.type === "door") {
        const room = String(msg.room ?? "");
        const r = ER_ROOMS.find((q) => q.id === room);
        if (!r) return;
        if (Math.hypot(b.x - (r.door.x + 0.5), b.y - (r.door.y + 0.5)) > REACH + 0.8) {
          send(ws, { type: "denied", error: "too_far" });
          return;
        }
        const open = !!msg.open;
        // THE BLOCK LETTERS gate OPENING during the red phase — closing is
        // always allowed (being behind a shut door is safe regardless of
        // block; the letters decide where you can still GET to safety).
        if (open && (phase === "telegraph" || phase === "hunt") && !openBlocks.includes(room[0])) {
          send(ws, { type: "denied", error: "block_locked" });
          return;
        }
        if (doors.get(room) === open) return;
        doors.set(room, open);
        broadcast({ type: "door", room, open });
        return;
      }
    });
  });

  // THE CRUMBLE — a pocketed key must not own everyone else's exit. Checked
  // on a coarse clock; only runs while the holder is actually inside.
  // The frozen bodies' grace: run out during the alarms and the dark has
  // them; run out in the calm and they are walked out as before.
  const graceTimer = setInterval(() => {
    const now = Date.now();
    for (const b of [...zone.values()]) {
      if (b.lostAt === undefined || now - b.lostAt < ER_DROP_GRACE_MS) continue;
      if (lockdown()) kill(b.id, "lost in the dark");
      else leave(b.id, false);
    }
  }, Math.min(1_000, Math.max(50, ER_DROP_GRACE_MS / 2)));
  graceTimer.unref?.();
  const crumble = setInterval(() => {
    if (keyHolder !== null && keyHeldAt && Date.now() - keyHeldAt > ER_KEY_CRUMBLE_MS) {
      resetKey("it crumbled in their pocket");
    }
  }, 15_000);
  crumble.unref?.();

  spawnKey(false);
  for (let i = 0; i < CHEST_COUNT; i++) spawnChest(false);

  const kill = (userId: number, reason: string): void => {
    // The monster's teeth (and the admin's). The bag wipe + pass revocation
    // live in store.erDeath; the key resets with an announcement.
    const b = zone.get(userId);
    store.erDeath(userId, reason);
    if (b) {
      zone.delete(userId);
      parkIfEmpty();
      broadcast({ type: "bye", id: userId });
      send(b.ws, { type: "dead", reason });
    }
    if (keyHolder === userId) resetKey("the holder is gone");
    // Dead, back on the ante's carpet (a socket that asked to be there).
    if (b) backToAnte(b.ws, { id: userId, name: b.name });
    syncPresence(userId);
  };
  api_kill = kill;

  return {
    has: (userId) => zone.has(userId),
    count: () => zone.size,
    anteCount: () => ante.size,
    kill,
  };
}
