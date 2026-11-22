// STERLING'S SHELVES (Josh, Sep 2026: "instead of selling the emojis people
// sell him just have him do a small list of emojis for sale and have each
// day it be randomized. do it by shelves and make bottom shelf the most
// common emojis with top shelves legendaries").
//
// WHY THE SELL-BACK SHELF DIED. Migration 89 put every emoji sold to Sterling
// on a shelf at double, and the Forge's mythic step costs a legendary plus
// the essence of twenty more — so a full purse bought twenty-one legendaries
// at 200 each and struck a mythic for ~4,200 silver against a counter that
// prices the tier at 500,000. The shelf is a FIXED DAILY SPREAD now, the same
// for everyone, a pure function of the UTC day (the Emporium's rotation
// machinery — no DB state, restarts can't reroll it), each listing buyable
// ONCE PER PERSON PER DAY. The daily stock is the rationing, not the price:
// buying the whole spread every day is 46 essence and ~6,200 silver, so the
// shelf can feed the Forge at most one mythic per eleven days — and the
// mythic strike carries its own silver toll on top (src/forge.ts).
//
// Prices are multiples of what Sterling PAYS (src/shop.ts SELL_PRICES):
// common 5× · rare 10× · legendary 50×. The legendary line is the one that
// decides whether the shelf is a completionist's convenience or a farm —
// 5,000 is a week of a full player's sell income for a single legendary.
// The silver BURNS, as at every one of Sterling's counters.

import { hashStr, seededSample } from "./emporium";

/** Top shelf first — the order the Shop draws them in. */
export const SHELF_TIERS = ["legendary", "rare", "common"] as const;
export type ShelfTier = (typeof SHELF_TIERS)[number];

/** How many of each tier he lays out per UTC day. */
export const SHELF_SIZES: Record<ShelfTier, number> = {
  legendary: 1,
  rare: 3,
  common: 6,
};

/** What he charges, per tier. */
// Josh, Sep 2026: "legendaries for sale … 25k each, rares 1k each, and
// commons 100 each" — 10× / 5× / 2× what he now pays.
export const SHELF_PRICES: Record<ShelfTier, number> = {
  common: 100,
  rare: 1_000,
  legendary: 25_000,
};

export const utcDay = (now: number): number => Math.floor(now / 86_400_000);
export const restockAtFor = (day: number): number => (day + 1) * 86_400_000;

export function shelfPriceOf(tier: string): number {
  return (SHELF_PRICES as Record<string, number>)[tier] ?? 0;
}

/** The day's spread: a seeded sample per tier over the catalog's codes
 *  (sorted, so a catalog top-up can't reshuffle a day already in progress
 *  beyond the codes it adds). Pure — same day + same catalog = same shelf
 *  on every box. */
export function dailyShelf(day: number, codesByTier: (tier: ShelfTier) => string[]): Record<ShelfTier, string[]> {
  const out = {} as Record<ShelfTier, string[]>;
  for (const tier of SHELF_TIERS) {
    const pool = [...codesByTier(tier)].sort();
    out[tier] = seededSample(pool, SHELF_SIZES[tier], hashStr(`shelf:${day}:${tier}`));
  }
  return out;
}
