// THE CHESTS — the floor's ONE sanctioned mint, as pure tables and rolls
// (E3; every number argued in ESCAPE.md's CHESTS section; Josh delegated the
// "chance ratings" with one constraint: don't break the casino).
//
// This module imports nothing and touches nothing, so the harness can pin
// the EV to the doc's numbers analytically AND empirically. The dials, in
// retune order (most leverage first): the DAILY ALLOWANCE, the tier odds,
// the type weights, the skew exponent, the respawn pacing.
//
// ROLLS ARE CRYPTO. This is the one place on the floor where randomness
// MINTS value — the Phase-34 rule (crypto for outcomes, Math.random for
// pacing) applies with both hands.
import { randomInt } from "node:crypto";

/** Chests standing in the complex at once (labeled rooms, ≤1 per room). */
export const CHEST_COUNT = 5;
/** An opened chest respawns elsewhere after 4–8 minutes. */
export const CHEST_RESPAWN_MIN_MS = Number(process.env.ER_CHEST_MIN_MS ?? 4 * 60_000);
export const CHEST_RESPAWN_MAX_MS = Number(process.env.ER_CHEST_MAX_MS ?? 8 * 60_000);
/** THE HARD VALVE: chest opens per player per UTC day. */
export const ER_OPENS_PER_DAY = 10;

/** The five hazmat colorways the legendary tier can unlock — per-player
 *  exclusives (Josh: "the skin only becomes available for that player").
 *  Client-side filters/swatches live in suitcolor.ts under the same ids. */
export const ER_SKINS = ["midnight", "blood", "neon", "royal", "gilded"] as const;

export type LootKind = "silver" | "spins" | "chips" | "pulls" | "skin";
export type LootTier = "common" | "rare" | "legendary";

export interface LootRoll {
  tier: LootTier;
  kind: LootKind;
  /** Quantity for the four numeric kinds; absent for a skin. */
  amount?: number;
  /** The unlocked colorway, kind === "skin" only. */
  skin?: string;
}

/** Tier odds, per ten thousand (the slots convention). 80 / 17 / 3. */
export const TIER_W: { tier: LootTier; w: number }[] = [
  { tier: "common", w: 8000 },
  { tier: "rare", w: 1700 },
  { tier: "legendary", w: 300 },
];

/** Type weights within each tier (per hundred) and Josh's ranges, verbatim.
 *  Engagement over raw silver: spins and chips carry more weight than coin. */
export const TYPE_TABLE: Record<
  LootTier,
  { kind: LootKind; w: number; min: number; max: number }[]
> = {
  common: [
    { kind: "silver", w: 25, min: 50, max: 500 },
    { kind: "spins", w: 35, min: 1, max: 3 },
    { kind: "chips", w: 40, min: 100, max: 250 },
  ],
  rare: [
    { kind: "silver", w: 20, min: 200, max: 1000 },
    { kind: "spins", w: 25, min: 5, max: 10 },
    { kind: "chips", w: 30, min: 250, max: 1000 },
    { kind: "pulls", w: 25, min: 10, max: 20 },
  ],
  legendary: [
    { kind: "silver", w: 15, min: 1500, max: 5000 },
    { kind: "spins", w: 20, min: 10, max: 25 },
    { kind: "chips", w: 25, min: 1000, max: 2500 },
    { kind: "pulls", w: 20, min: 25, max: 50 },
    { kind: "skin", w: 20, min: 0, max: 0 },
  ],
};

/** A uniform in [0,1) with crypto entropy. (randomInt's max span is 2^48-1,
 *  exclusive upper bound — 2^32 of resolution is plenty for these tables.) */
const cryptoRand = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

/** THE SKEW: rolls land LOW in their range — value = min + span·r², so the
 *  mean sits at min + span/3, not the midpoint. Josh's ranges are honoured
 *  verbatim; the skew lives inside them. */
export const skewRoll = (min: number, max: number, r: number): number =>
  Math.round(min + (max - min) * r * r);

/** Roll one chest. `ownedSkins` keeps the skin column honest: a finder who
 *  has all five (or the roll's pick) rerolls among the OTHER legendary
 *  columns — never a dead grant, never a duplicate unlock. */
export function rollChest(ownedSkins: readonly string[], rand: () => number = cryptoRand): LootRoll {
  const tierRoll = Math.floor(rand() * 10_000);
  let acc = 0;
  let tier: LootTier = "common";
  for (const t of TIER_W) {
    acc += t.w;
    if (tierRoll < acc) {
      tier = t.tier;
      break;
    }
  }
  let table = TYPE_TABLE[tier];
  const unowned = ER_SKINS.filter((s) => !ownedSkins.includes(s));
  if (tier === "legendary" && unowned.length === 0)
    table = table.filter((e) => e.kind !== "skin");
  const total = table.reduce((n, e) => n + e.w, 0);
  let typeRoll = rand() * total;
  let entry = table[table.length - 1];
  for (const e of table) {
    typeRoll -= e.w;
    if (typeRoll < 0) {
      entry = e;
      break;
    }
  }
  if (entry.kind === "skin") {
    return { tier, kind: "skin", skin: unowned[Math.floor(rand() * unowned.length)] };
  }
  return { tier, kind: entry.kind, amount: skewRoll(entry.min, entry.max, rand()) };
}

/** THE TRIPWIRE (ESCAPE.md): a red health check — which Sterling escalates
 *  like any red check — when one UTC day's mint crosses this, in
 *  silver-equivalents. ~15 players exhausting their full allowance. */
export const ER_MINT_TRIPWIRE = 25_000;

/** One accounting for "what did the mint emit", everywhere it's asked:
 *  spins at their ~11 sell-EV, pulls at slots' 8.71, chips at 0.95. */
export const mintSilverEq = (m: { silver: number; chips: number; spins: number; pulls: number }): number =>
  Math.round(m.silver + m.chips * 0.95 + m.spins * 11 + m.pulls * 8.71);

/** Analytic EV of one open in silver-equivalents, for the tripwire and the
 *  harness (spin ≈ 11 sell-EV, pull = 8.71, chips at 0.95 — ESCAPE.md's
 *  accounting). Skins count zero silver. Integer-rounding drift aside, the
 *  mean of skewRoll is min + span/3. */
export function chestEV(): number {
  const VAL: Record<LootKind, number> = { silver: 1, spins: 11, chips: 0.95, pulls: 8.71, skin: 0 };
  let ev = 0;
  for (const t of TIER_W) {
    const table = TYPE_TABLE[t.tier];
    const total = table.reduce((n, e) => n + e.w, 0);
    for (const e of table) {
      const mean = e.min + (e.max - e.min) / 3;
      ev += (t.w / 10_000) * (e.w / total) * (e.kind === "skin" ? 0 : mean * VAL[e.kind]);
    }
  }
  return ev;
}
