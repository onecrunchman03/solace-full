// THE FORGE — the Market's fourth counter (Josh, Sep 2026: "melt down their
// emojis … into a material called emoji essence … use this essence to
// upgrade a current emoji into a higher tier all the way up to mythic").
//
// Pure constants + rules, no imports (mortality.ts / lender.ts's shape) so
// the harness can pin the numbers without a store.
//
// THE FAUCET DOCTRINE, applied: essence is not a new source of value — it is
// what DESTROYED emoji leave behind. Every melt burns real, distinct emoji
// (ownership is binary, so there are no duplicates to feed it; you trade the
// breadth of a collection for its height), and every upgrade CONSUMES the
// emoji being upgraded plus the essence, and pays a random UNOWNED emoji of
// the next tier — the Wheel's own award rule. Nothing here mints silver, and
// essence never converts to silver (a melt-then-sell loop would be a second
// faucet). The MYTHIC step is the one that matters: Sterling's counter prices
// the tier at 500,000 burned silver, so the Forge's mythic costs a
// LEGENDARY plus the essence of twenty more — roughly three weeks of a
// committed player's legendary luck. Retune here if the boards show mythics
// arriving faster than the counter's price intends.

/** Essence a melted emoji leaves behind, per tier. Mythics, the talisman and
 *  specials don't melt — a mythic is the top of the ladder, not fuel for it. */
export const MELT_YIELD: Record<string, number> = {
  common: 1,
  rare: 5,
  legendary: 25,
};

/** Essence an upgrade costs, keyed by the tier being upgraded FROM. The
 *  emoji itself is consumed on top of this. */
export const UPGRADE_COST: Record<string, number> = {
  common: 12,     // → rare      (twelve commons' worth)
  rare: 60,       // → legendary (twelve rares' worth)
  legendary: 500, // → mythic    (twenty legendaries' worth)
};

/** The ladder. Anything not here (mythic, talisman, special) has no next rung. */
export const NEXT_TIER: Record<string, string> = {
  common: "rare",
  rare: "legendary",
  legendary: "mythic",
};

/** THE MYTHIC TOLL (Josh, Sep 2026). Essence is cheap in silver terms — a
 *  committed player melting everything the Wheel gives them reaches 500
 *  essence in under a week, and a shelf or an auction turns silver into
 *  essence at a few silver apiece — so the legendary → mythic strike also
 *  BURNS silver, a fifth of Sterling's counter. A Forge mythic lands around a
 *  third of the counter's price once the essence is bought or won: a
 *  grinder's discount, not a printing press. Never paid to anyone. */
export const MYTHIC_TOLL = 100_000;

/** EVERY STEP CARRIES A TOLL NOW (Josh, Sep 2026: "make rare to legendary
 *  upgrades in the forge 5 grand each and rare upgrades for 100"). Silver
 *  burned on top of the essence, keyed by the tier being upgraded FROM. The
 *  same round raised what Sterling pays (50 / 200 / 2,500), so the tolls
 *  sit at two commons' worth, two-and-a-half rares' worth, and the mythic
 *  step's fifth of the counter. */
export const TOLLS: Record<string, number> = {
  common: 100,
  rare: 5_000,
  legendary: MYTHIC_TOLL,
};

export const MAX_MELT_BATCH = 100;

export function meltYieldOf(tier: string): number {
  return MELT_YIELD[tier] ?? 0;
}

export function upgradeCostOf(tier: string): number {
  return UPGRADE_COST[tier] ?? 0;
}

export function nextTierOf(tier: string): string | null {
  return NEXT_TIER[tier] ?? null;
}

/** Silver burned on top of the essence, keyed by the tier being upgraded
 *  FROM. Zero for anything with no next rung. */
export function tollOf(fromTier: string): number {
  return NEXT_TIER[fromTier] ? (TOLLS[fromTier] ?? 0) : 0;
}
