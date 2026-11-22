// Roulette — the shared house table. European single-zero wheel, so every bet
// type carries exactly the same 2.7% house edge (1/37 of every stake, long
// run) — the standing net-sink rule with zero tuning knobs to get wrong.
//
// One global table, communal rounds: the first bet opens a betting window,
// the ball drops when it closes, everyone sweats the same pocket. Server-
// authoritative: the pocket is rolled with crypto randomness and settlement
// happens at roll time (crash-safe); the broadcast carries the pocket plus a
// spin deadline so clients animate the wheel landing on it and only reveal
// (and resync wallets) when the animation ends — the slots no-spoiler rule.
//
// Money safety is the blackjack discipline: every bet is an escrow row
// (roulette_bets, migration 38) debited in one txn; settlement credits and
// clears in one guarded txn; boot refunds orphans.

import { randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser } from "./types";
import type { PublicUser, RouletteStateDTO, User } from "./types";
import { lotteryDay } from "./lottery";

export type RouletteBetKind =
  | "straight"
  | "red" | "black"
  | "odd" | "even"
  | "low" | "high"
  | "dozen1" | "dozen2" | "dozen3"
  | "col1" | "col2" | "col3";

export const BET_KINDS: RouletteBetKind[] = [
  "straight", "red", "black", "odd", "even", "low", "high",
  "dozen1", "dozen2", "dozen3", "col1", "col2", "col3",
];

/** The red pockets of a European wheel (everything else 1-36 is black). */
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const MIN_BET = 5;
/** Raised 500 → 5,000 (Josh, Aug 2026: "allow users to bet a custom number up
 *  to 5000 as well as the chips") — the strip grew a custom-stake box and the
 *  table now takes real money on every bet class. */
export const MAX_OUTSIDE = 5000;
/** Straight numbers pay 35:1. Raised 50 → 5,000 with the rest (Josh's call):
 *  a maxed pocket now pays 180,000 — a jackpot on 1/37 odds, still 2.7% house
 *  edge in the long run. If the boards ever show this getting farmed, THIS is
 *  the dial to pull back first. */
export const MAX_STRAIGHT = 5000;
export const MAX_BETS_PER_PLAYER = 10;
const HISTORY_LEN = 14;

// Timings are env-dialable so the money-path harness can run fast rounds.
const BETTING_MS = Number(process.env.ROULETTE_BET_MS ?? 25_000);
const SPIN_MS = Number(process.env.ROULETTE_SPIN_MS ?? 8_000);
const SETTLE_MS = Number(process.env.ROULETTE_SETTLE_MS ?? 8_000);

/** Winnings multiplier (excluding the returned stake). */
export function payoutMult(kind: RouletteBetKind): number {
  if (kind === "straight") return 35;
  if (kind.startsWith("dozen") || kind.startsWith("col")) return 2;
  return 1; // red/black, odd/even, low/high
}

/** Does this bet win on this pocket? Zero beats every outside bet. */
export function betWins(kind: RouletteBetKind, target: number | null, pocket: number): boolean {
  if (kind === "straight") return target === pocket;
  if (pocket === 0) return false;
  switch (kind) {
    case "red": return RED_NUMBERS.has(pocket);
    case "black": return !RED_NUMBERS.has(pocket);
    case "odd": return pocket % 2 === 1;
    case "even": return pocket % 2 === 0;
    case "low": return pocket <= 18;
    case "high": return pocket >= 19;
    case "dozen1": return pocket <= 12;
    case "dozen2": return pocket >= 13 && pocket <= 24;
    case "dozen3": return pocket >= 25;
    case "col1": return pocket % 3 === 1;
    case "col2": return pocket % 3 === 2;
    case "col3": return pocket % 3 === 0;
    default: return false;
  }
}

interface LiveBet {
  betId: number; // escrow row id
  userId: number;
  pub: PublicUser;
  kind: RouletteBetKind;
  target: number | null;
  amount: number;
}

type Phase = RouletteStateDTO["phase"];

export type BetError = "closed" | "bad_bet" | "bad_amount" | "too_many" | "insufficient";

export class Roulette {
  private phase: Phase = "idle";
  private round = 1;
  private bets: LiveBet[] = [];
  private endsAt: number | null = null;
  private pocket: number | null = null;
  private history: number[] = [];
  private winners: { user: PublicUser; total: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: Store,
    private bus: Bus,
  ) {}

  state(): RouletteStateDTO {
    return {
      phase: this.phase,
      round: this.round,
      endsAt: this.endsAt,
      pocket: this.pocket,
      bets: this.bets.map((b) => ({ user: b.pub, kind: b.kind, target: b.target, amount: b.amount })),
      history: [...this.history],
      winners: [...this.winners],
    };
  }

  private broadcast(): void {
    this.bus.emit("roulette.state", { state: this.state() });
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  /** Place a bet. The first bet of a round opens the betting window. */
  placeBet(
    user: User,
    kind: RouletteBetKind,
    target: number | null,
    amount: number,
  ): { coins: number } | { error: BetError } {
    if (this.phase === "spinning" || this.phase === "settled") return { error: "closed" };
    if (!BET_KINDS.includes(kind)) return { error: "bad_bet" };
    if (kind === "straight") {
      if (target === null || !Number.isInteger(target) || target < 0 || target > 36) return { error: "bad_bet" };
    } else {
      target = null;
    }
    const max = kind === "straight" ? MAX_STRAIGHT : MAX_OUTSIDE;
    if (!Number.isInteger(amount) || amount < MIN_BET || amount > max) return { error: "bad_amount" };
    if (this.bets.filter((b) => b.userId === user.id).length >= MAX_BETS_PER_PLAYER) {
      return { error: "too_many" };
    }

    const escrow = this.store.rouletteBet(user.id, kind, target, amount);
    if (!escrow) return { error: "insufficient" };
    this.store.bumpStat(user.id, "gambled", amount); // Ledger telemetry

    this.bets.push({ betId: escrow.id, userId: user.id, pub: toPublicUser(user), kind, target, amount });
    if (this.phase === "idle") {
      this.phase = "betting";
      this.endsAt = Date.now() + BETTING_MS;
      this.schedule(BETTING_MS, () => this.spin());
    }
    this.broadcast();
    return { coins: escrow.coins };
  }

  /** Take back every bet you've placed this round (the misclick escape).
   *  Full escrow refund; only while the window is still open. */
  clearBets(user: User): { coins: number } | { error: "closed" | "none" } {
    if (this.phase === "spinning" || this.phase === "settled") return { error: "closed" };
    const mine = this.bets.filter((b) => b.userId === user.id);
    if (mine.length === 0) return { error: "none" };
    // A refund is a settle at exactly the stake (same guarded credit+delete).
    // Chips come back as chips (the converter rule), silver as silver.
    this.store.rouletteRefund(mine.map((b) => b.betId), user.id);
    // Taken-back stakes don't count as gambled.
    this.store.bumpStat(user.id, "gambled", -mine.reduce((n, b) => n + b.amount, 0));
    this.bets = this.bets.filter((b) => b.userId !== user.id);
    if (this.bets.length === 0) {
      // Last bettor backed out — close the empty window instead of spinning
      // an empty wheel later.
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.phase = "idle";
      this.endsAt = null;
    }
    this.broadcast();
    return { coins: this.store.getCoins(user.id) };
  }

  /** The window closed: roll the pocket, settle escrow NOW (crash-safe), and
   *  let clients animate toward the result. */
  private spin(): void {
    if (this.phase !== "betting" || this.bets.length === 0) {
      this.resetToIdle();
      return;
    }
    this.phase = "spinning";
    this.pocket = randomInt(37);
    this.endsAt = Date.now() + SPIN_MS;

    const rows = this.bets.map((b) => ({
      id: b.betId,
      userId: b.userId,
      payout: betWins(b.kind, b.target, this.pocket!) ? b.amount * (payoutMult(b.kind) + 1) : 0,
    }));
    const settled = this.store.rouletteSettle(rows);
    // A slice of the spin's net house take seeds the nightly lottery.
    // A bet whose row was already refunded (a death mid-window) seeds nothing.
    const houseNet =
      this.bets.reduce((n, b) => n + (settled.has(b.betId) ? b.amount : 0), 0) -
      rows.reduce((n, r) => n + (settled.has(r.id) ? r.payout : 0), 0);
    this.store.houseEdgeTake(lotteryDay(), houseNet, "roulette");

    // Per-player totals for the result banner (0-total players just lost).
    const totals = new Map<number, { user: PublicUser; total: number }>();
    this.bets.forEach((b, i) => {
      if (rows[i].payout === 0) return;
      const t = totals.get(b.userId) ?? { user: b.pub, total: 0 };
      t.total += rows[i].payout;
      totals.set(b.userId, t);
    });
    this.winners = [...totals.values()].sort((a, b) => b.total - a.total);
    for (const [userId, t] of totals) this.store.maxStat(userId, "roulette_best", t.total);

    this.broadcast();
    this.schedule(SPIN_MS, () => this.settled());
  }

  /** The ball has landed on every screen — show results, then clear the felt. */
  private settled(): void {
    this.phase = "settled";
    this.endsAt = Date.now() + SETTLE_MS;
    this.history.unshift(this.pocket!);
    if (this.history.length > HISTORY_LEN) this.history.length = HISTORY_LEN;
    this.broadcast();
    this.schedule(SETTLE_MS, () => this.resetToIdle());
  }

  private resetToIdle(): void {
    this.phase = "idle";
    this.round++;
    this.bets = [];
    this.endsAt = null;
    this.pocket = null;
    this.winners = [];
    this.broadcast();
  }
}

export function createRoulette(store: Store, bus: Bus): Roulette {
  const refunded = store.rouletteRefundOpenBets();
  if (refunded > 0) console.log(`[roulette] refunded ${refunded} escrowed bet(s) from a previous run`);
  return new Roulette(store, bus);
}
