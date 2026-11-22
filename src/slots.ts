import { randomInt } from "node:crypto";
import type { Store } from "./db/store";
import type { User } from "./types";
import { lotteryDay } from "./lottery";

/**
 * Slots of Chance — a pure coin sink (Phase 13d).
 *
 * Unlike the original emoji Slots (13a), this pays **silver**, never emoji, and
 * costs silver to play — the coin cost *is* the throttle, so there's no free
 * pull allowance and no refill timer. Server-authoritative like the Wheel: the
 * server rolls the outcome, then reports the three payline symbols so the client
 * just animates the reels landing on them.
 *
 * Economy invariant (locked with the user): Slots must stay **≤ break-even EV**
 * so it can never mint net value — the Wheel is the sole faucet. The table below
 * is tuned to a ~13% house edge (see the EV note on WEIGHTS), so a session of
 * Slots is always a net drain on the coin supply. If you retune, keep EV < COST.
 */

/** Silver cost of one pull at the base stake. The only throttle — no free
 *  pulls, no timer. */
export const PULL_COST = 10;

/**
 * THE STAKES (Josh, Oct 2026 — the Boulevard's sections play at different
 * stakes). A machine's denomination is a WHOLE MULTIPLE of the base pull, and
 * every payout scales by the same multiple, so each stake carries the
 * identical 12.9% edge and 69.6% hit rate — the odds never change, only the
 * size of the coins. 25 was refused for exactly this reason: ×2.5 makes the
 * 1-silver cherry a fraction, and rounding it would move the edge.
 */
export const STAKES = [10, 20, 50, 100] as const;
export type Stake = (typeof STAKES)[number];
/** A stake from the wire, or null if it isn't one of STAKES. */
export function stakeOf(v: unknown): Stake | null {
  const n = Number(v);
  return (STAKES as readonly number[]).includes(n) ? (n as Stake) : null;
}

/**
 * Slot symbols. Six paying symbols plus two pure-filler symbols (lemon,
 * clover) that only ever appear on losing lines to keep them varied.
 */
export const SYMBOLS = ["crown", "diamond", "seven", "bar", "bell", "cherry", "lemon", "clover"] as const;
export type Symbol = (typeof SYMBOLS)[number];
const NON_CHERRY: Symbol[] = SYMBOLS.filter((s) => s !== "cherry") as Symbol[];

/** What each winning line pays (silver). Cherry×3 is a refund (== PULL_COST).
 *  13 outcome classes (the 2026 variety pass): EVERY symbol has a paying
 *  triple now (fillers included), plus near-jackpot pair teases. */
export const PAYOUT = {
  crown: 250, // 👑👑👑  jackpot
  diamond: 100, // 💎💎💎
  seven: 75, // 7️⃣7️⃣7️⃣
  bar: 40, // ▬▬▬
  clover: 30, // 🍀🍀🍀
  bell: 20, // 🔔🔔🔔
  lemon: 15, // 🍋🍋🍋
  crown2: 15, // 👑👑·  (a near-jackpot pays)
  cherry3: 10, // 🍒🍒🍒  (refund)
  diamond2: 8, // 💎💎·
  seven2: 5, // 7️⃣7️⃣·
  cherry2: 4, // 🍒🍒·
  cherry1: 1, // 🍒··    (the classic consolation tinkle)
} as const;

type Line = keyof typeof PAYOUT | "none";

/** Symbols whose PAIR pays (and must therefore stay out of losing lines). */
const PAIR_SYMBOLS: Symbol[] = ["crown", "diamond", "seven"];

/**
 * Outcome weights, per 10,000 pulls. Expected payout per pull:
 *   (28·250 + 80·100 + 120·75 + 350·40 + 230·30 + 550·20 + 400·15
 *    + 300·15 + 600·10 + 500·8 + 900·5 + 1100·4 + 1800·1) / 10000 = 8.71
 * against a 10-silver cost — a **12.9% house edge**, hit rate 69.6% spread
 * over THIRTEEN outcome classes so no single dribble dominates. EV (8.71)
 * < COST (10): Slots stays a net sink; keep it that way if retuned.
 */
export const WEIGHTS: { line: Line; weight: number }[] = [
  { line: "crown", weight: 28 },
  { line: "diamond", weight: 80 },
  { line: "seven", weight: 120 },
  { line: "bar", weight: 350 },
  { line: "clover", weight: 230 },
  { line: "bell", weight: 550 },
  { line: "lemon", weight: 400 },
  { line: "crown2", weight: 300 },
  { line: "cherry3", weight: 600 },
  { line: "diamond2", weight: 500 },
  { line: "seven2", weight: 900 },
  { line: "cherry2", weight: 1100 },
  { line: "cherry1", weight: 1800 },
  { line: "none", weight: 3042 },
];
const TOTAL_WEIGHT = WEIGHTS.reduce((s, w) => s + w.weight, 0); // 10000

function rollLine(): Line {
  // Crypto, not Math.random — outcome rolls must not ride V8's predictable
  // PRNG (weights are integers summing to TOTAL_WEIGHT, so this is exact).
  let r = randomInt(TOTAL_WEIGHT);
  for (const w of WEIGHTS) {
    if ((r -= w.weight) < 0) return w.line;
  }
  return "none";
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a 3-symbol payline that matches (and ONLY matches) the rolled line —
 *  every pattern is disjoint from every other paying pattern. */
export function payline(line: Line): Symbol[] {
  // Fillers for a paying pair's third reel: not the pair symbol itself, not
  // cherry (any cherry pays), not another pair-payer to avoid ambiguity.
  const pairFiller = (of: Symbol) =>
    NON_CHERRY.filter((s) => s !== of && !PAIR_SYMBOLS.includes(s));
  switch (line) {
    case "crown":
    case "diamond":
    case "seven":
    case "bar":
    case "clover":
    case "bell":
    case "lemon":
      return [line, line, line];
    case "cherry3":
      return ["cherry", "cherry", "cherry"];
    case "crown2":
      return shuffle(["crown", "crown", pick(pairFiller("crown"))]);
    case "diamond2":
      return shuffle(["diamond", "diamond", pick(pairFiller("diamond"))]);
    case "seven2":
      return shuffle(["seven", "seven", pick(pairFiller("seven"))]);
    case "cherry2":
      return shuffle(["cherry", "cherry", pick(NON_CHERRY)]);
    case "cherry1": {
      // Exactly one cherry; the others can't form a PAYING pair.
      const a = pick(NON_CHERRY);
      const b = pick(
        PAIR_SYMBOLS.includes(a) ? NON_CHERRY.filter((s) => s !== a) : NON_CHERRY,
      );
      return shuffle(["cherry", a, b]);
    }
    case "none": {
      // NOT a paying pattern: no cherries (any cherry pays), not any
      // three-of-a-kind (all triples pay now), no crown/diamond/seven pair.
      for (;;) {
        const reels = [pick(NON_CHERRY), pick(NON_CHERRY), pick(NON_CHERRY)];
        const allEqual = reels[0] === reels[1] && reels[1] === reels[2];
        const pair = PAIR_SYMBOLS.some((p) => reels.filter((s) => s === p).length >= 2);
        if (!allEqual && !pair) return reels;
      }
    }
  }
}

export type SlotsResult =
  | { type: "win"; line: Exclude<Line, "none">; payout: number }
  | { type: "lose" };

export interface SlotsOutcome {
  ok: boolean;
  error?: string;
  result?: SlotsResult;
  /** The three payline symbols the client animates the reels onto. */
  reels?: Symbol[];
  /** The player's silver balance after the pull (cost debited, any payout credited). */
  coins?: number;
  /** Escape-room balances (E3b): free pulls left, casino chips left. */
  freePulls?: number;
  chips?: number;
  /** How this pull was paid: a free pull, chips (partly or wholly), or coin. */
  paidWith?: "free" | "chips" | "coins";
  /** The stake this pull was played at. */
  stake?: Stake;
}

/**
 * Play one pull, atomically. THE PAYMENT ORDER (E3b, ESCAPE.md): a FREE PULL
 * from the escape room's slot pass is consumed first; then casino CHIPS,
 * silver covering any remainder; then plain silver. Payouts pay SILVER always
 * — chips convert to coin only through the machine's own 12.9% edge, which is
 * the intended, lossy path. If the player can't afford it, nothing changes.
 */
export function pull(store: Store, user: User, stake: Stake = PULL_COST): SlotsOutcome {
  const mult = stake / PULL_COST;
  return store.transaction(() => {
    let paidWith: "free" | "chips" | "coins" = "coins";
    // A free pull is worth ONE base pull, so it only plays a base-stake
    // machine — at a 100-silver cabinet it would be worth ten times that.
    if (stake === PULL_COST && store.erConsumeFreePull(user.id)) {
      paidWith = "free";
    } else {
      const split = store.spendCoinsChipsFirst(user.id, stake);
      if (split === null) {
        return {
          ok: false, error: "insufficient",
          coins: store.getCoins(user.id), chips: store.getChips(user.id), freePulls: 0,
        };
      }
      paidWith = split.chips > 0 ? "chips" : "coins";
    }

    const line = rollLine();
    const reels = payline(line);
    // Ledger leaderboard telemetry. A free pull gambles nothing of yours.
    store.bumpStat(user.id, "slots_pulls");
    if (paidWith !== "free") store.bumpStat(user.id, "gambled", stake);
    // The goblins' file: consecutive coinless pulls are a dry spell they write about.
    store.streakStat(user.id, "slots_dry", line === "none");

    const tail = () => ({
      coins: store.getCoins(user.id),
      chips: store.getChips(user.id),
      freePulls: store.getFreePulls(user.id),
      paidWith,
    });

    if (line === "none") {
      // A slice of the machine's take seeds the nightly lottery pot. A FREE
      // pull's loss tithes nothing — the house never took a stake for it.
      if (paidWith !== "free") store.houseEdgeTake(lotteryDay(), stake, "slots");
      return { ok: true, result: { type: "lose" }, reels, stake, ...tail() };
    }

    const payout = PAYOUT[line] * mult;
    store.maxStat(user.id, "slots_best", payout);
    store.addCoins(user.id, payout);
    const houseNet = stake - payout;
    if (paidWith !== "free") store.houseEdgeTake(lotteryDay(), houseNet, "slots");
    return {
      ok: true,
      result: { type: "win", line, payout },
      reels,
      stake,
      ...tail(),
    };
  });
}
