// The Bone Pit — Liar's Dice (Perudo), the mythic game.
//
// Why this game for the top prize: the skill is reading and deceiving the
// PEOPLE at the table. The server holds every secret (it rolls; you only ever
// see your own cup via recipient-scoped delivery), so there's nothing to
// intercept — and no engine or AI can tell you whether your friend's "four
// fives" is a lie. The Vault died to Google; chess would die to Stockfish;
// this dies to nothing but better bluffers.
//
// Rules (classic, lightly trimmed):
//   - 2-6 players, 5 dice each. The server rolls every cup secretly.
//   - In turn order, RAISE the bid ("at least N dice showing face F, table-
//     wide") or call LIAR. A raise increases the count, or keeps the count
//     and increases the face. ONES ARE WILD — they count toward any face
//     (unless the bid is on ones themselves).
//   - LIAR reveals all cups. Bid true → the challenger loses a die; bid
//     false → the bidder loses a die. The loser opens the next round.
//   - Out of dice = out of the game. Last player holding dice takes the pot.
//
// Money: buy-ins escrow in bonepit_stakes (crash → boot refund); the winner
// takes the whole pot in one txn — coin-neutral PvP, no rake, like chess
// silver. THE CROWN: the first game each ISO week that finishes with 3+
// players awards a random unowned MYTHIC (atomic weekly claim in
// bonepit_weeks — the only mythic faucet, ≤1/week server-wide by design).
//
// Games are in-memory (a restart refunds and clears — same rule as
// blackjack tables); every state change broadcasts a sanitized pit.state,
// while each player's own dice ride pit.dice to their sockets only.

import { randomUUID, randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import type { Emoji, PublicUser } from "./types";
import { toPublicUser } from "./types";

export const MIN_STAKE = 10;
export const MAX_STAKE = 100_000;
export const MAX_PLAYERS = 6;
export const DICE_PER_PLAYER = 5;
export const TURN_MS = 35_000; // tuned down from 60s — voice-table pacing
const GATHER_MAX_MS = 15 * 60_000; // a table nobody starts eventually folds
const DONE_LINGER_MS = 30_000; // finished tables stay visible briefly

interface Player {
  userId: number;
  dice: number[]; // my current cup (secret)
  eliminated: boolean;
}

interface Game {
  id: string;
  stake: number;
  hostId: number;
  phase: "gathering" | "playing" | "done";
  players: Player[];
  createdAt: number;
  // playing:
  turnIdx: number; // index into players[]
  turnDeadline: number;
  bid: { count: number; face: number; byUserId: number } | null;
  round: number;
  /** Mid-game deserters (forfeits), kept for the leave/forfeit rules. */
  leavers?: number;
  // last challenge, kept for the reveal display:
  reveal: {
    bid: { count: number; face: number };
    actual: number;
    bidderId: number;
    callerId: number;
    loserId: number;
    cups: { userId: number; dice: number[] }[];
  } | null;
  // done:
  winnerId: number | null;
  pot: number;
  doneAt: number;
}

export interface PitPublicPlayer {
  user: PublicUser | null;
  diceCount: number;
  eliminated: boolean;
}

/** What everyone sees — no cup contents until a reveal. */
export interface PitGameDTO {
  id: string;
  stake: number;
  hostId: number;
  phase: Game["phase"];
  players: PitPublicPlayer[];
  turnUserId: number | null;
  turnDeadline: number | null;
  bid: { count: number; face: number; byUserId: number } | null;
  round: number;
  reveal: Game["reveal"];
  winnerId: number | null;
  pot: number;
  totalDice: number;
}

export interface PitStateDTO {
  games: PitGameDTO[];
}

export function createBonePit(store: Store, bus: Bus) {
  const games = new Map<string, Game>();

  // Crash recovery: any stakes left from a previous life go home.
  const refunded = store.pitRefundOpenStakes();
  if (refunded > 0) console.log(`[bonepit] refunded ${refunded} orphaned stake(s) from before restart`);

  const roll = (n: number): number[] =>
    Array.from({ length: n }, () => randomInt(1, 7)).sort((a, b) => a - b);

  function alive(g: Game): Player[] {
    return g.players.filter((p) => !p.eliminated);
  }

  function toDTO(g: Game): PitGameDTO {
    const turn = g.phase === "playing" ? g.players[g.turnIdx] : null;
    return {
      id: g.id,
      stake: g.stake,
      hostId: g.hostId,
      phase: g.phase,
      players: g.players.map((p) => {
        const u = store.getUserById(p.userId);
        return { user: u ? toPublicUser(u) : null, diceCount: p.dice.length, eliminated: p.eliminated };
      }),
      turnUserId: turn?.userId ?? null,
      turnDeadline: g.phase === "playing" ? g.turnDeadline : null,
      bid: g.bid,
      round: g.round,
      reveal: g.reveal,
      winnerId: g.winnerId,
      pot: g.pot,
      totalDice: g.players.reduce((n, p) => n + p.dice.length, 0),
    };
  }

  function stateDTO(): PitStateDTO {
    return { games: [...games.values()].map(toDTO) };
  }

  function broadcast(): void {
    bus.emit("pit.state", { state: stateDTO() });
  }

  /** Each player's cup goes to their sockets only — never broadcast. */
  function sendCups(g: Game): void {
    for (const p of alive(g)) {
      bus.emit("pit.dice", { userIds: [p.userId], gameId: g.id, dice: p.dice });
    }
  }

  function startRound(g: Game, starterId: number | null): void {
    for (const p of alive(g)) p.dice = roll(p.dice.length);
    g.bid = null;
    g.round += 1;
    const live = alive(g);
    const idx = starterId === null ? randomInt(0, live.length) : live.findIndex((p) => p.userId === starterId);
    const starter = live[Math.max(0, idx)];
    g.turnIdx = g.players.indexOf(starter);
    g.turnDeadline = Date.now() + TURN_MS;
    sendCups(g);
  }

  function nextTurn(g: Game): void {
    let i = g.turnIdx;
    do {
      i = (i + 1) % g.players.length;
    } while (g.players[i].eliminated);
    g.turnIdx = i;
    g.turnDeadline = Date.now() + TURN_MS;
  }

  /** Count dice showing `face` across the table (ones wild unless face=1). */
  function countFace(g: Game, face: number): number {
    let n = 0;
    for (const p of alive(g)) {
      for (const d of p.dice) if (d === face || (face !== 1 && d === 1)) n++;
    }
    return n;
  }

  /** A player loses a die; handle elimination and either end the game or
   *  start the next round with the loser (or the next player) opening. */
  function loseDie(g: Game, loserId: number): void {
    const p = g.players.find((x) => x.userId === loserId);
    if (!p) return;
    p.dice.pop();
    if (p.dice.length === 0) p.eliminated = true;

    const live = alive(g);
    if (live.length <= 1) {
      finish(g, live[0]?.userId ?? null);
      return;
    }
    startRound(g, p.eliminated ? live[0].userId : loserId);
  }

  function finish(g: Game, winnerId: number | null): void {
    g.phase = "done";
    g.winnerId = winnerId;
    g.doneAt = Date.now();
    g.pot = store.pitSettle(g.id, winnerId);
    if (winnerId != null) store.bumpStat(winnerId, "pit_wins"); // Ledger/achievement telemetry
    const sb = store.settleSideBets("pit", g.id, winnerId);
    if (sb) bus.emit("sidebet.settled", { kind: "pit", gameId: g.id, ...sb });
  }

  /** My current cup (for reconnects — the socket frame is the live path). */
  function myDice(userId: number): { gameId: string; dice: number[] } | null {
    for (const g of games.values()) {
      if (g.phase !== "playing") continue;
      const p = g.players.find((x) => x.userId === userId && !x.eliminated);
      if (p) return { gameId: g.id, dice: p.dice };
    }
    return null;
  }

  function create(userId: number, stake: number): { ok: boolean; error?: string; gameId?: string } {
    if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
      return { ok: false, error: "bad_stake" };
    }
    for (const g of games.values()) {
      if (g.phase !== "done" && g.players.some((p) => p.userId === userId)) {
        return { ok: false, error: "already_seated" };
      }
    }
    const id = randomUUID();
    if (!store.pitStake(id, userId, stake)) return { ok: false, error: "insufficient" };
    games.set(id, {
      id,
      stake,
      hostId: userId,
      phase: "gathering",
      players: [{ userId, dice: [], eliminated: false }],
      createdAt: Date.now(),
      turnIdx: 0,
      turnDeadline: 0,
      bid: null,
      round: 0,
      reveal: null,
      winnerId: null,
      pot: 0,
      doneAt: 0,
    });
    broadcast();
    return { ok: true, gameId: id };
  }

  function join(userId: number, gameId: string): { ok: boolean; error?: string } {
    const g = games.get(gameId);
    if (!g || g.phase !== "gathering") return { ok: false, error: "no_table" };
    if (g.players.length >= MAX_PLAYERS) return { ok: false, error: "full" };
    if (g.players.some((p) => p.userId === userId)) return { ok: false, error: "already_seated" };
    for (const other of games.values()) {
      if (other.phase !== "done" && other.players.some((p) => p.userId === userId)) {
        return { ok: false, error: "already_seated" };
      }
    }
    if (!store.pitStake(gameId, userId, g.stake)) return { ok: false, error: "insufficient" };
    g.players.push({ userId, dice: [], eliminated: false });
    broadcast();
    return { ok: true };
  }

  function leave(userId: number, gameId: string): { ok: boolean; error?: string } {
    const g = games.get(gameId);
    if (!g) return { ok: false, error: "no_table" };
    const p = g.players.find((x) => x.userId === userId);
    if (!p) return { ok: false, error: "not_seated" };

    if (g.phase === "gathering") {
      store.pitRefundOne(gameId, userId);
      g.players = g.players.filter((x) => x.userId !== userId);
      if (g.players.length === 0) {
        games.delete(gameId);
        const sb = store.settleSideBets("pit", gameId, null); // table dissolved
        if (sb) bus.emit("sidebet.settled", { kind: "pit", gameId, ...sb });
      } else if (g.hostId === userId) {
        g.hostId = g.players[0].userId;
      }
      broadcast();
      return { ok: true };
    }
    if (g.phase === "playing" && !p.eliminated) {
      // Forfeit: dice gone, stake stays in the pot. If it was their turn,
      // play moves on; if only one player remains, they win.
      // Deserters are still counted: the tally is what the forfeit rules
      // read, and it used to gate the weekly crown before that was retired.
      g.leavers = (g.leavers ?? 0) + 1;
      p.eliminated = true;
      p.dice = [];
      const live = alive(g);
      if (live.length <= 1) {
        finish(g, live[0]?.userId ?? null);
      } else if (g.players[g.turnIdx].userId === userId) {
        g.bid = null; // bid state involving the deserter resets
        nextTurn(g);
        sendCups(g);
      }
      broadcast();
      return { ok: true };
    }
    return { ok: false, error: "not_seated" };
  }

  function start(userId: number, gameId: string): { ok: boolean; error?: string } {
    const g = games.get(gameId);
    if (!g || g.phase !== "gathering") return { ok: false, error: "no_table" };
    if (g.hostId !== userId) return { ok: false, error: "not_host" };
    if (g.players.length < 2) return { ok: false, error: "need_players" };

    g.phase = "playing";
    // Side bets on players who left before the cups rolled go home.
    store.refundSideBetsNotOn("pit", g.id, g.players.map((p) => p.userId));
    for (const p of g.players) p.dice = Array(DICE_PER_PLAYER).fill(0);
    startRound(g, null);
    broadcast();
    return { ok: true };
  }

  function bid(userId: number, gameId: string, count: number, face: number): { ok: boolean; error?: string } {
    const g = games.get(gameId);
    if (!g || g.phase !== "playing") return { ok: false, error: "no_table" };
    if (g.players[g.turnIdx].userId !== userId) return { ok: false, error: "not_your_turn" };
    if (!Number.isInteger(count) || !Number.isInteger(face) || count < 1 || face < 1 || face > 6) {
      return { ok: false, error: "bad_bid" };
    }
    const total = g.players.reduce((n, p) => n + p.dice.length, 0);
    if (count > total) return { ok: false, error: "bad_bid" };
    if (g.bid) {
      const raises = count > g.bid.count || (count === g.bid.count && face > g.bid.face);
      if (!raises) return { ok: false, error: "must_raise" };
    }
    g.bid = { count, face, byUserId: userId };
    g.reveal = null;
    nextTurn(g);
    broadcast();
    return { ok: true };
  }

  function liar(userId: number, gameId: string): { ok: boolean; error?: string } {
    const g = games.get(gameId);
    if (!g || g.phase !== "playing") return { ok: false, error: "no_table" };
    if (g.players[g.turnIdx].userId !== userId) return { ok: false, error: "not_your_turn" };
    if (!g.bid) return { ok: false, error: "no_bid" };

    const actual = countFace(g, g.bid.face);
    const bidTrue = actual >= g.bid.count;
    const loserId = bidTrue ? userId : g.bid.byUserId;
    g.reveal = {
      bid: { count: g.bid.count, face: g.bid.face },
      actual,
      bidderId: g.bid.byUserId,
      callerId: userId,
      loserId,
      cups: alive(g).map((p) => ({ userId: p.userId, dice: [...p.dice] })),
    };
    loseDie(g, loserId);
    broadcast();
    return { ok: true };
  }

  /** Periodic sweep: turn timeouts cost a die; stale tables fold. */
  function sweep(): void {
    const now = Date.now();
    let changed = false;
    for (const g of [...games.values()]) {
      if (g.phase === "gathering" && now - g.createdAt > GATHER_MAX_MS) {
        for (const p of g.players) store.pitRefundOne(g.id, p.userId);
        games.delete(g.id);
        const sb = store.settleSideBets("pit", g.id, null); // table folded
        if (sb) bus.emit("sidebet.settled", { kind: "pit", gameId: g.id, ...sb });
        changed = true;
      } else if (g.phase === "playing" && now > g.turnDeadline) {
        const slow = g.players[g.turnIdx];
        g.reveal = null;
        g.bid = null;
        loseDie(g, slow.userId); // stalling costs a die and restarts the round
        changed = true;
      } else if (g.phase === "done" && now - g.doneAt > DONE_LINGER_MS) {
        games.delete(g.id);
        changed = true;
      }
    }
    if (changed) broadcast();
  }
  const timer = setInterval(sweep, 3_000);

  /** Side-bet gate: spectators only, gathering tables only, seated targets. */
  function canBet(gameId: string, onUserId: number, bettorId: number): string | null {
    const g = games.get(gameId);
    if (!g || g.phase !== "gathering") return "bets_closed";
    if (g.players.some((p) => p.userId === bettorId)) return "players_cant_bet";
    if (!g.players.some((p) => p.userId === onUserId)) return "not_seated";
    return null;
  }

  /** Logout hook: leave whatever table this user is at. The normal leave()
   *  rules apply — gathering refunds the stake, mid-game forfeits it. */
  function leaveAll(userId: number): void {
    for (const g of games.values()) {
      if (g.phase !== "done" && g.players.some((p) => p.userId === userId)) {
        leave(userId, g.id);
        return;
      }
    }
  }

  return {
    state: stateDTO,
    myDice,
    create,
    join,
    leave,
    leaveAll,
    start,
    bid,
    liar,
    canBet,
    stop: () => clearInterval(timer),
  };
}

export type BonePit = ReturnType<typeof createBonePit>;
