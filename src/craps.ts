// Craps — the loudest table in the casino, faithfully. One shared global
// table (the roulette pattern): a shooter throws for everyone, the whole rail
// wins and loses together.
//
// REAL bank-craps rules, no inventions:
//   - Pass line: comeout 7/11 wins, 2/3/12 craps out; otherwise the point is
//     set and the bet becomes a CONTRACT (can't be taken down) until the
//     shooter makes the point (win) or sevens out (lose). 1:1.
//   - Don't pass: the dark side. Comeout 2/3 wins, 12 is BARRED (push — the
//     house keeps its edge), 7/11 loses; after the point, seven-out wins. 1:1,
//     removable any time (the house is happy to let a favorite walk).
//   - Odds: the famous zero-edge bet, only behind your pass bet once a point
//     is on. True odds — 2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8 — capped Vegas
//     3-4-5x style by point. Unit rules keep every payout integral.
//   - Field: one roll. 2 pays double, 12 pays triple (the liberal field),
//     3/4/9/10/11 even money, 5/6/7/8 lose.
//   - Place bets on 4/5/6/8/9/10: working only while a point is ON (off on
//     the comeout, the real default). Pay 7:6 on 6/8, 7:5 on 5/9, 9:5 on
//     4/10; the bet STAYS UP after a win; a seven-out takes them all. Unit
//     rules (6s on 6/8, 5s elsewhere) — the dealer would make you do it too.
//   - Hardways on 4/6/8/10: win if the number rolls as doubles, lose on any
//     seven or the "easy way". 7:1 on hard 4/10, 9:1 on hard 6/8. Off on the
//     comeout, stay up after a win.
//
// Server-authoritative dice (crypto), settle-at-roll-time (crash-safe), and
// the no-spoiler broadcast: the dice ride the state the moment they're
// thrown, clients tumble them and only reveal when the animation lands.
// Money safety is the blackjack/roulette discipline: every bet is an escrow
// row (craps_bets, migration 47); settlement is guarded credit+delete (or
// credit-if-still-standing for stay-up wins); boot refunds orphans.

import { randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser } from "./types";
import type { CrapsStateDTO, CrapsEvent, PublicUser, User } from "./types";
import { lotteryDay } from "./lottery";

export type CrapsBetKind = "pass" | "dontpass" | "odds" | "field" | "place" | "hard";

export const MIN_BET = 5;
export const MAX_LINE = 500; // pass / don't pass / field / place
export const MAX_HARD = 100; // pays up to 9:1 — capped like roulette straights
export const MAX_BETS_PER_PLAYER = 12;
export const PLACE_NUMBERS = [4, 5, 6, 8, 9, 10];
export const HARD_NUMBERS = [4, 6, 8, 10];
const HISTORY_LEN = 16;

// Timings are env-dialable so the money-path harness can run fast games.
const BET_MS = Number(process.env.CRAPS_BET_MS ?? 25_000);
const ROLL_MS = Number(process.env.CRAPS_ROLL_MS ?? 4_500);

/** Vegas 3-4-5x odds: the max odds multiple of your pass bet, by point. */
export function maxOddsMult(point: number): number {
  if (point === 4 || point === 10) return 3;
  if (point === 5 || point === 9) return 4;
  return 5; // 6, 8
}

/** True-odds WINNINGS per unit staked (the zero-edge payout). */
export function oddsWinnings(point: number, amount: number): number {
  if (point === 4 || point === 10) return amount * 2;
  if (point === 5 || point === 9) return (amount * 3) / 2; // even amounts enforced
  return (amount * 6) / 5; // 6/8 — multiples of 5 enforced
}

/** Place-bet WINNINGS per stake (units enforced at placement). */
export function placeWinnings(num: number, amount: number): number {
  if (num === 6 || num === 8) return (amount * 7) / 6;
  if (num === 5 || num === 9) return (amount * 7) / 5;
  return (amount * 9) / 5; // 4, 10
}

/** Hardway WINNINGS per stake. */
export function hardWinnings(num: number, amount: number): number {
  return num === 6 || num === 8 ? amount * 9 : amount * 7;
}

/** Field TOTAL RETURN (stake included); 0 = lost. */
export function fieldReturn(total: number, amount: number): number {
  if (total === 2) return amount * 3; // 2:1
  if (total === 12) return amount * 4; // 3:1
  if (total === 3 || total === 4 || total === 9 || total === 10 || total === 11) return amount * 2;
  return 0; // 5, 6, 7, 8
}

interface LiveBet {
  betId: number; // escrow row id
  userId: number;
  pub: PublicUser;
  kind: CrapsBetKind;
  num: number | null; // box number for place/hard
  amount: number;
}

export type BetError =
  | "closed" | "bad_bet" | "bad_amount" | "bad_units" | "too_many"
  | "already" | "wrong_phase" | "no_pass_bet" | "over_odds" | "insufficient";

export class Craps {
  private phase: "idle" | "comeout" | "point" | "rolling" = "idle";
  private point: number | null = null;
  private dice: [number, number] | null = null;
  private rollEndsAt: number | null = null;
  private autoRollAt: number | null = null;
  private shooterId: number | null = null;
  private round = 1; // shooter hands (increments on seven-out)
  private bets: LiveBet[] = [];
  private history: { d1: number; d2: number; event: CrapsEvent }[] = [];
  private outcome: CrapsStateDTO["outcome"] = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Where the table goes when the dice animation lands.
  private phaseAfterRoll: "comeout" | "point" = "comeout";

  constructor(
    private store: Store,
    private bus: Bus,
  ) {}

  state(): CrapsStateDTO {
    const effective = this.effectiveShooterId();
    const shooter = effective === null ? null : this.pubFor(effective);
    return {
      phase: this.phase,
      point: this.point,
      dice: this.dice ? [...this.dice] : null,
      rollEndsAt: this.rollEndsAt,
      autoRollAt: this.autoRollAt,
      shooter,
      round: this.round,
      bets: this.bets.map((b) => ({ user: b.pub, kind: b.kind, num: b.num, amount: b.amount })),
      history: this.history.map((h) => ({ ...h })),
      outcome: this.outcome,
    };
  }

  private pubFor(userId: number): PublicUser | null {
    const live = this.bets.find((b) => b.userId === userId);
    if (live) return live.pub;
    const u = this.store.getUserById(userId);
    return u ? toPublicUser(u) : null;
  }

  private broadcast(): void {
    this.bus.emit("craps.state", { state: this.state() });
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  /** Ordered distinct userIds currently holding a line bet (shooter pool). */
  private lineBettors(): number[] {
    const seen: number[] = [];
    for (const b of this.bets) {
      if ((b.kind === "pass" || b.kind === "dontpass") && !seen.includes(b.userId)) seen.push(b.userId);
    }
    return seen;
  }

  /** Can the dice actually be thrown right now? */
  private rollable(): boolean {
    if (this.phase === "comeout") return this.lineBettors().length > 0;
    if (this.phase === "point") return this.bets.length > 0;
    return false;
  }

  /** Arm the auto-roll clock IF the table can roll and no clock is running,
   *  disarm it if the table can't. A running clock is never re-stamped —
   *  otherwise a bettor could cycle bet/take-down every 20s and push the
   *  deadline forever, freezing everyone else's contract escrow (review
   *  finding: the takedown path used to reset it unconditionally). */
  private armAutoRoll(): void {
    if (this.rollable()) {
      if (this.autoRollAt === null) {
        this.autoRollAt = Date.now() + BET_MS;
        this.schedule(BET_MS, () => this.throwDice());
      }
    } else {
      this.autoRollAt = null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Who may throw RIGHT NOW: the sticky shooter if they still hold a line
   *  bet, else the first current line bettor (the stale-shooter fix — a
   *  departed shooter must never 403 the only live bettor at the table). */
  private effectiveShooterId(): number | null {
    const pool = this.lineBettors();
    if (this.shooterId !== null && pool.includes(this.shooterId)) return this.shooterId;
    return pool[0] ?? this.shooterId;
  }

  /** Place a bet. Any bet wakes an idle table onto a fresh comeout. */
  placeBet(
    user: User,
    kind: CrapsBetKind,
    num: number | null,
    amount: number,
  ): { coins: number } | { error: BetError } {
    if (this.phase === "rolling") return { error: "closed" };
    if (!["pass", "dontpass", "odds", "field", "place", "hard"].includes(kind)) return { error: "bad_bet" };

    const phase = this.phase === "idle" ? "comeout" : this.phase;
    const max = kind === "hard" ? MAX_HARD : MAX_LINE;
    if (!Number.isInteger(amount) || amount < MIN_BET) return { error: "bad_amount" };
    if (kind !== "odds" && amount > max) return { error: "bad_amount" };
    if (this.bets.filter((b) => b.userId === user.id).length >= MAX_BETS_PER_PLAYER) return { error: "too_many" };

    const mine = (k: CrapsBetKind, n: number | null = null) =>
      this.bets.find((b) => b.userId === user.id && b.kind === k && (n === null || b.num === n));

    if (kind === "pass" || kind === "dontpass") {
      // Line bets go down on the comeout only (no put bets).
      if (phase !== "comeout") return { error: "wrong_phase" };
      if (mine(kind)) return { error: "already" };
      num = null;
    } else if (kind === "odds") {
      if (phase !== "point" || this.point === null) return { error: "wrong_phase" };
      const passBet = mine("pass");
      if (!passBet) return { error: "no_pass_bet" };
      if (mine("odds")) return { error: "already" };
      if (amount > passBet.amount * maxOddsMult(this.point)) return { error: "over_odds" };
      // Unit rules keep true-odds payouts integral (the dealer would insist).
      if ((this.point === 5 || this.point === 9) && amount % 2 !== 0) return { error: "bad_units" };
      if ((this.point === 6 || this.point === 8) && amount % 5 !== 0) return { error: "bad_units" };
      num = this.point;
    } else if (kind === "field") {
      if (mine("field")) return { error: "already" };
      num = null;
    } else if (kind === "place") {
      if (num === null || !PLACE_NUMBERS.includes(num)) return { error: "bad_bet" };
      if (mine("place", num)) return { error: "already" };
      if ((num === 6 || num === 8) && amount % 6 !== 0) return { error: "bad_units" };
      if (num !== 6 && num !== 8 && amount % 5 !== 0) return { error: "bad_units" };
    } else {
      // hard
      if (num === null || !HARD_NUMBERS.includes(num)) return { error: "bad_bet" };
      if (mine("hard", num)) return { error: "already" };
    }

    const escrow = this.store.crapsBet(user.id, kind, num, amount);
    if (!escrow) return { error: "insufficient" };
    this.store.bumpStat(user.id, "gambled", amount);

    this.bets.push({ betId: escrow.id, userId: user.id, pub: toPublicUser(user), kind, num, amount });
    if (this.phase === "idle") {
      this.phase = "comeout";
      if (this.shooterId === null) this.shooterId = user.id;
    }
    if (this.autoRollAt === null) this.armAutoRoll();
    this.broadcast();
    return { coins: escrow.coins };
  }

  /** Take a bet down (full refund). Real-casino rules: the pass line is a
   *  CONTRACT once a point is on; everything else comes down on request. */
  takeDown(user: User, kind: CrapsBetKind, num: number | null): { coins: number } | { error: "closed" | "none" | "contract" } {
    if (this.phase === "rolling" || this.phase === "idle") return { error: "closed" };
    if (kind === "pass" && this.phase === "point") return { error: "contract" };
    const bet = this.bets.find(
      (b) => b.userId === user.id && b.kind === kind && (b.kind !== "place" && b.kind !== "hard" ? true : b.num === num),
    );
    if (!bet) return { error: "none" };
    // Taking down pass on the comeout also takes its (nonexistent) odds — but
    // odds only exist during a point, when pass is locked. No compound case.
    this.store.crapsSettle([{ id: bet.betId, userId: bet.userId, payout: bet.amount }]);
    this.store.bumpStat(user.id, "gambled", -bet.amount);
    this.bets = this.bets.filter((b) => b !== bet);
    if (this.bets.length === 0) this.resetToIdle();
    else {
      this.armAutoRoll();
      this.broadcast();
    }
    return { coins: this.store.getCoins(user.id) };
  }

  /** The shooter throws (or the auto-roll clock fires). */
  roll(user: User): { ok: true } | { error: "not_shooter" | "closed" } {
    if (this.phase !== "comeout" && this.phase !== "point") return { error: "closed" };
    if (!this.rollable()) return { error: "closed" };
    const shooter = this.effectiveShooterId();
    if (shooter !== null && user.id !== shooter) return { error: "not_shooter" };
    this.throwDice();
    return { ok: true };
  }

  /** Roll the dice, settle EVERYTHING at roll time (crash-safe), and let the
   *  clients tumble toward the known result. */
  private throwDice(): void {
    if (this.phase !== "comeout" && this.phase !== "point") return;
    if (!this.rollable()) {
      this.armAutoRoll();
      return;
    }
    // A bet whose escrow row is gone (a death mid-window swept it back into
    // the estate) is a ghost: it must neither win, lose nor count in the
    // house's net — it used to ride the felt until a seven-out (Oct 2026 review).
    const live = this.store.crapsBetsExisting(this.bets.map((b) => b.betId));
    this.bets = this.bets.filter((b) => live.has(b.betId));
    const wasComeout = this.phase === "comeout";
    const prevPoint = this.point;
    // The sticky shooter resolves to someone actually holding a line bet.
    this.shooterId = this.effectiveShooterId();

    const d1 = randomInt(1, 7);
    const d2 = randomInt(1, 7);
    const total = d1 + d2;
    const hard = d1 === d2;

    // ---- The settlement oracle ----
    const resolved: { id: number; userId: number; payout: number; keep?: boolean }[] = [];
    const credited = new Map<number, number>(); // userId -> total credited this roll
    let lost = 0;
    let profitPaid = 0;
    const survivors: LiveBet[] = [];
    const settle = (b: LiveBet, payout: number, keep = false) => {
      resolved.push({ id: b.betId, userId: b.userId, payout, keep });
      if (payout > 0) {
        credited.set(b.userId, (credited.get(b.userId) ?? 0) + payout);
        profitPaid += keep ? payout : payout - b.amount;
      } else if (!keep) {
        lost += b.amount;
      }
      if (keep) survivors.push(b);
    };

    let event: CrapsEvent;
    let newPoint: number | null = prevPoint;
    let sevenOut = false;

    for (const b of this.bets) {
      if (wasComeout) {
        // Place + hardways are OFF on the comeout — they neither win nor lose.
        if (b.kind === "place" || b.kind === "hard") { survivors.push(b); continue; }
        if (b.kind === "field") { settle(b, fieldReturn(total, b.amount)); continue; }
        if (b.kind === "pass") {
          if (total === 7 || total === 11) settle(b, b.amount * 2);
          else if (total === 2 || total === 3 || total === 12) settle(b, 0);
          else survivors.push(b); // point set — the contract rides
          continue;
        }
        if (b.kind === "dontpass") {
          if (total === 2 || total === 3) settle(b, b.amount * 2);
          else if (total === 7 || total === 11) settle(b, 0);
          else survivors.push(b); // 12 is barred (push, stays up) or point set
          continue;
        }
        // odds can't exist on a comeout
        survivors.push(b);
      } else {
        // Point is ON.
        if (total === 7) {
          // Seven-out: the table clears. Only don't pass survives — by winning.
          if (b.kind === "dontpass") settle(b, b.amount * 2);
          else settle(b, 0);
          continue;
        }
        if (b.kind === "field") { settle(b, fieldReturn(total, b.amount)); continue; }
        if (total === prevPoint) {
          if (b.kind === "pass") { settle(b, b.amount * 2); continue; }
          if (b.kind === "odds") { settle(b, b.amount + oddsWinnings(prevPoint!, b.amount)); continue; }
          if (b.kind === "dontpass") { settle(b, 0); continue; }
        }
        if (b.kind === "place" && b.num === total) { settle(b, placeWinnings(b.num, b.amount), true); continue; }
        if (b.kind === "hard" && b.num === total) {
          if (hard) settle(b, hardWinnings(b.num, b.amount), true);
          else settle(b, 0); // the easy way takes it
          continue;
        }
        survivors.push(b);
      }
    }

    if (wasComeout) {
      if (total === 7 || total === 11) event = "natural";
      else if (total === 2 || total === 3 || total === 12) event = "craps";
      else { event = "point-set"; newPoint = total; }
    } else if (total === 7) {
      event = "seven-out";
      newPoint = null;
      sevenOut = true;
    } else if (total === prevPoint) {
      event = "point-made";
      newPoint = null;
    } else {
      event = "roll";
    }

    const rekeyed = this.store.crapsSettle(resolved);
    // Stay-up wins were re-inserted under fresh ids — re-key the live bets.
    for (const b of survivors) {
      const nid = rekeyed.get(b.betId);
      if (nid !== undefined) b.betId = nid;
    }
    const houseNet = lost - profitPaid;
    this.store.houseEdgeTake(lotteryDay(), houseNet, "craps");
    for (const [userId, total_] of credited) this.store.maxStat(userId, "craps_best", total_);

    if (sevenOut) {
      // A seven-out settles EVERY bet, so the table always empties and
      // landed() drops to resetToIdle — the next shooter is simply the first
      // line bettor of the next round (effectiveShooterId). Computing a
      // rotation here was unreachable ceremony; only the round advances.
      this.round++;
    }

    this.bets = survivors;
    this.point = newPoint;
    this.phaseAfterRoll = newPoint !== null ? "point" : "comeout";
    this.phase = "rolling";
    this.dice = [d1, d2];
    this.rollEndsAt = Date.now() + ROLL_MS;
    this.autoRollAt = null;
    this.history.unshift({ d1, d2, event });
    if (this.history.length > HISTORY_LEN) this.history.length = HISTORY_LEN;
    this.outcome = {
      event,
      total,
      point: newPoint,
      prevPoint,
      winners: [...credited.entries()]
        .map(([userId, t]) => ({ user: this.pubFor(userId), total: t }))
        .filter((w): w is { user: PublicUser; total: number } => w.user !== null)
        .sort((a, b) => b.total - a.total),
    };

    this.broadcast();
    this.schedule(ROLL_MS, () => this.landed());
  }

  /** The dice have landed on every screen — reopen the rail. */
  private landed(): void {
    if (this.bets.length === 0) {
      this.resetToIdle();
      return;
    }
    this.phase = this.phaseAfterRoll;
    this.armAutoRoll();
    this.broadcast();
  }

  private resetToIdle(): void {
    this.phase = "idle";
    this.point = null;
    this.dice = null;
    this.rollEndsAt = null;
    this.autoRollAt = null;
    this.bets = [];
    this.outcome = null;
    this.shooterId = null; // an empty table has no shooter to gate on
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.broadcast();
  }
}

export function createCraps(store: Store, bus: Bus): Craps {
  const refunded = store.crapsRefundOpenBets();
  if (refunded > 0) console.log(`[craps] refunded ${refunded} escrowed bet(s) from a previous run`);
  return new Craps(store, bus);
}
