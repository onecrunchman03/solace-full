// Casino Chess Duel — speed chess with emoji stakes. Server-authoritative:
// move legality, clocks, and every settlement decision live here (chess.js
// is the rules oracle); clients only render state and send intents.
//
// Economy: pure player-vs-player — the house mints nothing. Each player
// stakes exactly ONE owned emoji; the winner takes the loser's stake. If the
// winner already owns that emoji, the house burns it (binary ownership is
// never violated, and the burn is a sink — same rule as graveyard dupes).
// A draw returns both stakes. Stakes are escrowed into chess_stakes rows
// the moment they're posted (mirroring blackjack_bets): a crash refunds in
// full on boot, so an emoji can be lost over the board, never to a restart.

import { Chess } from "chess.js";
import { isBound } from "./abyss";
import { randomUUID, randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser } from "./types";
import type {
  ChessChallengeDTO,
  ChessGameDTO,
  ChessStake,
  ChessStateDTO,
  PublicUser,
  User,
} from "./types";

export const TIME_CONTROLS = [1, 3, 5] as const; // minutes per side
export const MIN_SILVER_STAKE = 10;
export const MAX_SILVER_STAKE = 100_000;
const SWEEP_MS = 2_000; // flag-fall checks for live games
const FINISHED_LINGER_MS = 60_000; // finished boards stay on the floor a minute

/** The wire spec a client sends to stake: an owned emoji code, or a silver amount. */
export type StakeSpec = { kind: "emoji"; code: string } | { kind: "silver"; amount: number };

interface Challenge {
  id: string;
  userId: number;
  pub: PublicUser;
  stake: ChessStake;
  minutes: number;
  createdAt: number;
}

interface DuelSide {
  userId: number;
  pub: PublicUser;
  stake: ChessStake;
}

type EndReason =
  | "checkmate"
  | "timeout"
  | "resign"
  | "stalemate"
  | "insufficient"
  | "threefold"
  | "fifty-move";

interface Game {
  id: string;
  white: DuelSide;
  black: DuelSide;
  chess: Chess;
  minutes: number;
  wMs: number;
  bMs: number;
  lastMoveAt: number; // when the side to move's clock started running
  status: "active" | "finished";
  winner: "white" | "black" | "draw" | null; // null only while active
  endReason: EndReason | null;
  endedAt: number | null;
  lastMove: { from: string; to: string } | null;
}

export class ChessDuels {
  private challenges = new Map<string, Challenge>();
  private games = new Map<string, Game>();

  constructor(
    private store: Store,
    private bus: Bus,
  ) {
    setInterval(() => this.sweep(), SWEEP_MS).unref(); // never holds a closing process open
  }

  // ---- queries -------------------------------------------------------------

  state(): ChessStateDTO {
    return {
      challenges: [...this.challenges.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => this.challengeDto(c)),
      games: [...this.games.values()]
        .sort((a, b) => (b.endedAt ?? Infinity) - (a.endedAt ?? Infinity))
        .map((g) => this.gameDto(g)),
    };
  }

  private challengeDto(c: Challenge): ChessChallengeDTO {
    return { id: c.id, challenger: c.pub, stake: c.stake, minutes: c.minutes, createdAt: c.createdAt };
  }

  private gameDto(g: Game): ChessGameDTO {
    return {
      id: g.id,
      white: g.white.pub,
      black: g.black.pub,
      whiteStake: g.white.stake,
      blackStake: g.black.stake,
      minutes: g.minutes,
      fen: g.chess.fen(),
      turn: g.chess.turn(),
      wMs: g.wMs,
      bMs: g.bMs,
      lastMoveAt: g.lastMoveAt,
      status: g.status,
      winner: g.winner,
      endReason: g.endReason,
      lastMove: g.lastMove,
      inCheck: g.status === "active" && g.chess.inCheck(),
    };
  }

  private inActiveGame(userId: number): boolean {
    for (const g of this.games.values())
      if (g.status === "active" && (g.white.userId === userId || g.black.userId === userId)) return true;
    return false;
  }

  // ---- lobby ---------------------------------------------------------------

  /** Resolve + escrow a stake spec under `gameId`, returning the placed stake
   *  (or an error code). Emoji: must be owned. Silver: bounded + affordable. */
  private placeStake(
    gameId: string,
    userId: number,
    spec: StakeSpec,
  ): { stake: ChessStake } | { error: string } {
    if (spec.kind === "silver") {
      const amount = Math.floor(spec.amount);
      if (!Number.isInteger(amount) || amount < MIN_SILVER_STAKE || amount > MAX_SILVER_STAKE) {
        return { error: "bad_amount" };
      }
      if (!this.store.chessStakeSilver(gameId, userId, amount)) return { error: "insufficient" };
      return { stake: { kind: "silver", amount } };
    }
    const emoji = this.store.getEmoji(spec.code);
    if (!emoji) return { error: "unknown_emoji" };
    if (isBound(emoji.tier)) return { error: "bound" }; // the Stone of the Abyss is never a stake
    if (!this.store.chessStake(gameId, userId, spec.code)) return { error: "not_owned" };
    return { stake: { kind: "emoji", emoji } };
  }

  /** Return both escrow tables' stakes for a game to their owners / a winner. */
  private settleStakes(gameId: string, winnerId: number | null): void {
    this.store.chessSettleStakes(gameId, winnerId); // emoji rows (no-op if none)
    this.store.chessSettleSilver(gameId, winnerId); // silver rows (no-op if none)
  }

  challenge(user: User, spec: StakeSpec, minutes: number): { ok: boolean; error?: string } {
    if (!(TIME_CONTROLS as readonly number[]).includes(minutes)) return { ok: false, error: "bad_minutes" };
    for (const c of this.challenges.values())
      if (c.userId === user.id) return { ok: false, error: "already_challenging" };
    if (this.inActiveGame(user.id)) return { ok: false, error: "in_game" };
    const id = randomUUID();
    // Escrow first — the challenge only exists if the stake actually moved.
    const placed = this.placeStake(id, user.id, spec);
    if ("error" in placed) return { ok: false, error: placed.error };
    this.challenges.set(id, {
      id,
      userId: user.id,
      pub: toPublicUser(user),
      stake: placed.stake,
      minutes,
      createdAt: Date.now(),
    });
    this.publish();
    return { ok: true };
  }

  cancelChallenge(user: User): { ok: boolean; error?: string } {
    for (const c of this.challenges.values()) {
      if (c.userId === user.id) {
        this.challenges.delete(c.id);
        this.settleStakes(c.id, null); // stake returns home
        this.publish();
        return { ok: true };
      }
    }
    return { ok: false, error: "no_challenge" };
  }

  accept(user: User, challengeId: string, spec: StakeSpec): { ok: boolean; error?: string; gameId?: string } {
    const c = this.challenges.get(challengeId);
    if (!c) return { ok: false, error: "gone" };
    if (c.userId === user.id) return { ok: false, error: "own_challenge" };
    if (this.inActiveGame(user.id)) return { ok: false, error: "in_game" };
    // The acceptor must match the challenge's stake TYPE, and — for silver —
    // its amount (both sides put up the same, winner takes the pot).
    if (spec.kind !== c.stake.kind) return { ok: false, error: "stake_mismatch" };
    if (spec.kind === "silver" && c.stake.kind === "silver" && Math.floor(spec.amount) !== c.stake.amount) {
      return { ok: false, error: "stake_mismatch" };
    }
    const challenger = this.store.getUserById(c.userId);
    // …or died and was raised: the death swept the stake home, so the
    // challenge would play for the acceptor's stake alone.
    if (
      !challenger || challenger.disabled || challenger.locked || challenger.deletedAt ||
      (challenger.suspendedUntil != null && challenger.suspendedUntil > Date.now()) ||
      !this.store.chessHasStake(c.id, c.userId)
    ) {
      // The challenger died or vanished since posting — void the challenge.
      this.challenges.delete(c.id);
      this.settleStakes(c.id, null);
      this.publish();
      return { ok: false, error: "gone" };
    }
    if (this.inActiveGame(c.userId)) {
      // The challenger started another game while this challenge sat open —
      // nobody plays two boards (a stale challenge was a griefable back
      // door: accept it mid-blitz and win the stake on the clock). Void it.
      this.challenges.delete(c.id);
      this.settleStakes(c.id, null);
      this.publish();
      return { ok: false, error: "gone" };
    }
    // Accepting a duel withdraws YOUR own open challenge first (you can't
    // play two boards either — and this frees a stake you may be re-using).
    for (const mine of [...this.challenges.values()]) {
      if (mine.userId === user.id) {
        this.challenges.delete(mine.id);
        this.settleStakes(mine.id, null);
      }
    }
    // Escrow the acceptor's stake under the same game id as the challenger's.
    const placed = this.placeStake(c.id, user.id, spec);
    if ("error" in placed) return { ok: false, error: placed.error };
    this.challenges.delete(c.id);

    // Colors are dealt at random — the house doesn't play favorites.
    const challengerIsWhite = randomInt(2) === 0; // crypto coin — colors matter in blitz
    const cSide: DuelSide = { userId: c.userId, pub: c.pub, stake: c.stake };
    const aSide: DuelSide = { userId: user.id, pub: toPublicUser(user), stake: placed.stake };
    const ms = c.minutes * 60_000;
    const game: Game = {
      id: c.id,
      white: challengerIsWhite ? cSide : aSide,
      black: challengerIsWhite ? aSide : cSide,
      chess: new Chess(),
      minutes: c.minutes,
      wMs: ms,
      bMs: ms,
      lastMoveAt: Date.now(),
      status: "active",
      winner: null,
      endReason: null,
      endedAt: null,
      lastMove: null,
    };
    this.games.set(game.id, game);
    this.publish();
    return { ok: true, gameId: game.id };
  }

  // ---- play ----------------------------------------------------------------

  private sideOf(g: Game, userId: number): "w" | "b" | null {
    if (g.white.userId === userId) return "w";
    if (g.black.userId === userId) return "b";
    return null;
  }

  /** Remaining clock of the side to move, right now. */
  private runningClockMs(g: Game): number {
    const bank = g.chess.turn() === "w" ? g.wMs : g.bMs;
    return bank - (Date.now() - g.lastMoveAt);
  }

  move(
    user: User,
    gameId: string,
    from: string,
    to: string,
    promotion?: string,
  ): { ok: boolean; error?: string } {
    const g = this.games.get(gameId);
    if (!g || g.status !== "active") return { ok: false, error: "no_game" };
    const side = this.sideOf(g, user.id);
    if (!side) return { ok: false, error: "not_your_game" };
    if (g.chess.turn() !== side) return { ok: false, error: "not_your_turn" };

    // Flag falls are checked before the move lands.
    if (this.runningClockMs(g) <= 0) {
      this.flag(g);
      return { ok: false, error: "flagged" };
    }

    const promo = promotion && ["q", "r", "b", "n"].includes(promotion) ? promotion : "q";
    try {
      const mv = g.chess.move({ from, to, promotion: promo });
      g.lastMove = { from: mv.from, to: mv.to };
    } catch {
      return { ok: false, error: "illegal" };
    }

    // Bank the mover's remaining time; the opponent's clock starts now.
    const now = Date.now();
    const spent = now - g.lastMoveAt;
    if (side === "w") g.wMs -= spent;
    else g.bMs -= spent;
    g.lastMoveAt = now;

    if (g.chess.isGameOver()) {
      if (g.chess.isCheckmate()) {
        // The side that just moved delivered mate.
        this.finish(g, side === "w" ? "white" : "black", "checkmate");
      } else if (g.chess.isStalemate()) {
        this.finish(g, "draw", "stalemate");
      } else if (g.chess.isInsufficientMaterial()) {
        this.finish(g, "draw", "insufficient");
      } else if (g.chess.isThreefoldRepetition()) {
        this.finish(g, "draw", "threefold");
      } else {
        this.finish(g, "draw", "fifty-move");
      }
    } else {
      this.publish();
    }
    return { ok: true };
  }

  resign(user: User, gameId: string): { ok: boolean; error?: string } {
    const g = this.games.get(gameId);
    if (!g || g.status !== "active") return { ok: false, error: "no_game" };
    const side = this.sideOf(g, user.id);
    if (!side) return { ok: false, error: "not_your_game" };
    this.finish(g, side === "w" ? "black" : "white", "resign");
    return { ok: true };
  }

  // ---- settlement ----------------------------------------------------------

  private flag(g: Game): void {
    // The side to move ran out of time; the other side wins — unless it has
    // nothing left to mate with (Oct 2026 review: a flag against a bare king
    // scored a win; the rule makes it a draw).
    const winner = g.chess.turn() === "w" ? "black" : "white";
    const color = winner === "white" ? "w" : "b";
    const material = g.chess.board().flat().filter((sq) => sq && sq.color === color && sq.type !== "k").length;
    this.finish(g, material === 0 ? "draw" : winner, material === 0 ? "insufficient" : "timeout");
  }

  private finish(g: Game, winner: "white" | "black" | "draw", reason: EndReason): void {
    if (g.status !== "active") return;
    g.status = "finished";
    g.winner = winner;
    g.endReason = reason;
    g.endedAt = Date.now();
    const winnerId =
      winner === "draw" ? null : winner === "white" ? g.white.userId : g.black.userId;
    this.settleStakes(g.id, winnerId);
    if (winnerId != null) this.store.bumpStat(winnerId, "chess_wins"); // Ledger/achievement telemetry
    const sb = this.store.settleSideBets("chess", g.id, winnerId);
    if (sb) this.bus.emit("sidebet.settled", { kind: "chess", gameId: g.id, ...sb });
    this.publish();
  }

  /** Side-bet gate: spectators only, and only before each side's 2nd move
   *  (the position says nothing yet — no free-riding a won game). */
  canBet(gameId: string, onUserId: number, bettorId: number): string | null {
    const g = this.games.get(gameId);
    if (!g || g.status !== "active") return "bets_closed";
    if (g.chess.history().length >= 4) return "bets_closed";
    if (bettorId === g.white.userId || bettorId === g.black.userId) return "players_cant_bet";
    if (onUserId !== g.white.userId && onUserId !== g.black.userId) return "not_seated";
    return null;
  }

  private sweep(): void {
    let changed = false;
    const now = Date.now();
    for (const g of this.games.values()) {
      if (g.status === "active" && this.runningClockMs(g) <= 0) {
        this.flag(g); // publishes
      } else if (g.status === "finished" && g.endedAt && now - g.endedAt > FINISHED_LINGER_MS) {
        this.games.delete(g.id);
        changed = true;
      }
    }
    if (changed) this.publish();
  }

  private publish(): void {
    this.bus.emit("chess.state", { state: this.state() });
  }
}

export function createChessDuels(store: Store, bus: Bus): ChessDuels {
  const refunded = store.chessRefundOpenStakes() + store.chessRefundOpenSilver();
  if (refunded > 0) console.log(`[chess] refunded ${refunded} orphaned stake(s) from a previous run`);
  return new ChessDuels(store, bus);
}
