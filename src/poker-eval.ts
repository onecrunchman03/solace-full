// Poker hand evaluation — the Hold'em rules oracle's scoring half.
//
// Deliberately dependency-free: hand RANKING is a small, closed problem
// (unlike chess legality), so a category evaluator + an exhaustive harness
// beats pulling in a package. `best7` scores the best 5-card hand out of 7
// (board + hole) as a single integer — bigger wins, equal splits. The
// encoding packs [category, tiebreak ranks...] in base-15 so any two hands
// compare correctly with plain `>`.

import { randomInt } from "node:crypto";

/** rank 2..14 (14 = ace), suit 0..3 (♠♥♦♣ — display only). */
export interface Card {
  r: number;
  s: number;
}

export const CATEGORY_NAMES = [
  "High card", "Pair", "Two pair", "Three of a kind", "Straight",
  "Flush", "Full house", "Four of a kind", "Straight flush",
];

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return d;
}

/** Crypto Fisher-Yates — the same trust level as every other house game. */
export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Score exactly five cards. */
export function score5(cards: Card[]): number {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);

  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  // Sort ranks by (count desc, rank desc) — the tiebreak order for pairs etc.
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Straight detection (5 distinct ranks, span 4) + the wheel (A-2-3-4-5).
  let straightHigh = 0;
  if (count.size === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[1] - ranks[4] === 3) straightHigh = 5;
  }

  let cat: number;
  let tie: number[];
  if (flush && straightHigh) {
    cat = 8;
    tie = [straightHigh];
  } else if (groups[0][1] === 4) {
    cat = 7;
    tie = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    cat = 6;
    tie = [groups[0][0], groups[1][0]];
  } else if (flush) {
    cat = 5;
    tie = ranks;
  } else if (straightHigh) {
    cat = 4;
    tie = [straightHigh];
  } else if (groups[0][1] === 3) {
    cat = 3;
    tie = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    cat = 2;
    tie = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    cat = 1;
    tie = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  } else {
    cat = 0;
    tie = ranks;
  }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tie[i] ?? 0);
  return score;
}

/** Best 5-of-7 score (all 21 combinations — tiny and exact). */
export function best7(cards: Card[]): number {
  let best = 0;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = score5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (s > best) best = s;
          }
  return best;
}

/** "Full house" etc. from a score — for reveal banners. */
export function categoryName(score: number): string {
  return CATEGORY_NAMES[Math.floor(score / 15 ** 5)] ?? "?";
}
