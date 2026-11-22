// THE GHOSTS — 2D players, embodied on the floor (C3, the seat doctrine).
//
// "Floor seat occupancy derives from game-state broadcasts; the floor service
// holds no seat state." This module is that derivation, and ONLY that: a pure
// read over the app-level game stores (which chat.svelte.ts already keeps
// current from the public broadcasts) producing the list of bodies the hall
// should be showing. CasinoGame reconciles avatars against it at 1Hz.
//
// A ghost is a generic seated/standing hazmat body with the player's nametag —
// never an empty chair while someone is actually in the game. Anyone with a
// REAL floor body (they're walking this hall themselves) is excluded: the
// physical presence wins, one body per person.

import { bj } from "../lib/blackjack.svelte";
import { chessduel } from "../lib/chessduel.svelte";
import { holdem } from "../lib/holdem.svelte";
import { pit } from "../lib/bonepit.svelte";
import { roulette } from "../lib/roulette.svelte";
import { BJ_TABLES, bjStool, holdemSeat, CHESS, BONE_PIT, ROULETTE } from "./layout";

export interface GhostSpec {
  /** Stable identity for reconciliation: game + spot + who. */
  key: string;
  userId: number;
  name: string;
  x: number; // cells
  y: number;
  heading: number;
  /** A house account (a bot): never a ghost. */
  bot?: boolean;
  /** Seat-surface height when seated; standing ghosts omit it. */
  seatH?: number;
}

/** Body forward is (−sin h, −cos h) — the measured avatar convention — so
 *  facing a target point means h = atan2(−dx, −dy). */
const face = (fromX: number, fromY: number, atX: number, atY: number): number =>
  Math.atan2(fromX - atX, fromY - atY);

export function desiredGhosts(excludeUserIds: Set<number>): GhostSpec[] {
  const out: GhostSpec[] = [];
  const push = (g: GhostSpec): void => {
    if (!excludeUserIds.has(g.userId) && !g.bot) out.push(g);
  };

  // ---- blackjack: engine seat i sits stool i of the six-seat arc -------------
  // (BJ_TABLES is in ENGINE lobby order, Copper 0 → High Roller 3, so the
  // lobby index IS the table; bjStool is the layout's own geometry)
  for (const lobby of bj.lobbies) {
    const t = BJ_TABLES[lobby.index];
    if (!t) continue;
    lobby.seats.forEach((seat, si) => {
      if (!seat || si > 5) return;
      const s = bjStool(t, si);
      push({
        key: `bj:${lobby.index}:${si}:${seat.user.id}`,
        userId: seat.user.id, bot: !!seat.user.isBot,
        name: seat.user.displayName || seat.user.username,
        x: s.x,
        y: s.y,
        heading: s.heading,
        seatH: 0.78,
      });
    });
  }

  // ---- chess: the first live duel takes the two chairs -----------------------
  const duel = chessduel.games.find((g) => g.status === "active");
  if (duel) {
    // white gets the south chair, black the north — arbitrary but stable
    push({
      key: `chess:w:${duel.white.id}`, userId: duel.white.id, bot: !!duel.white.isBot,
      name: duel.white.displayName || duel.white.username,
      x: CHESS.x, y: CHESS.y + 0.5, heading: 0, seatH: 0.55,
    });
    push({
      key: `chess:b:${duel.black.id}`, userId: duel.black.id, bot: !!duel.black.isBot,
      name: duel.black.displayName || duel.black.username,
      x: CHESS.x, y: CHESS.y - 0.5, heading: Math.PI, seatH: 0.55,
    });
  }

  // ---- hold'em: the physical oval binds to Copper (resolved pick) ------------
  // Engine seat i sits chair i of the shared seven-seat ellipse (holdemSeat —
  // the same geometry SEATS and the placements use).
  const copper = holdem.lobby?.tables.find((t) => /copper/i.test(t.name)) ?? holdem.lobby?.tables[0];
  if (copper) {
    copper.seats.forEach((seat, si) => {
      if (!seat || si > 6) return;
      const s = holdemSeat(si);
      push({
        key: `he:${si}:${seat.user.id}`, userId: seat.user.id, bot: !!seat.user.isBot,
        name: seat.user.displayName || seat.user.username,
        x: s.x,
        y: s.y,
        heading: s.heading,
        seatH: 0.55,
      });
    });
  }

  // ---- the bone pit: the liars ring their table ------------------------------
  const game = pit.games.find((g) => g.phase !== "done" && g.players.some((p) => p.user));
  if (game) {
    const cx = BONE_PIT.x;
    const cy = BONE_PIT.y;
    game.players.forEach((p, pi) => {
      if (!p.user) return;
      const ang = (pi / Math.max(3, game.players.length)) * Math.PI * 2 + 0.5;
      const x = cx + Math.sin(ang) * 1.05;
      const y = cy + Math.cos(ang) * 1.05;
      push({
        key: `pit:${game.id}:${pi}:${p.user.id}`, userId: p.user.id, bot: !!p.user.isBot,
        name: p.user.displayName || p.user.username,
        x, y, heading: face(x, y, cx, cy),
      });
    });
  }

  // ---- roulette: bettors line the EAST rail of the relocated table -----------
  // (the table sits west of the stage now; players face west into the felt)
  const rs = roulette.state;
  if (rs && (rs.phase === "betting" || rs.phase === "spinning")) {
    const seen = new Set<number>();
    let i = 0;
    for (const b of rs.bets) {
      if (!b.user || seen.has(b.user.id) || i >= 5) continue;
      seen.add(b.user.id);
      push({
        key: `ro:${b.user.id}`, userId: b.user.id, bot: !!b.user.isBot,
        name: b.user.displayName || b.user.username,
        x: ROULETTE.x + 1.05, y: ROULETTE.y - 0.75 + i * 0.42, heading: Math.PI / 2, // facing the felt, west
      });
      i++;
    }
  }

  return out;
}
