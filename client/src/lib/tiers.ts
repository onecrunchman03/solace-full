// GROUPING A COLLECTION BY RARITY — one definition, every inventory.
//
// Josh, Sep 2026: "in the emoji auction and trade inventory selection box
// make to cleanly organize the emojis by tier". The Shop's sell grid, the
// Forge and the Profile already did this (the Sep 2026 "INVENTORIES BY
// RARITY" round) — each with its own copy of the colours and the order, and
// Trade and the Auction House were simply missed. A fourth and fifth copy
// would have guaranteed they drift, so the rule lives here now.
//
// The order is the rarity ladder read downwards, so the scarce things a
// player is deciding about are at the top of the box rather than buried
// under four hundred commons.

/** The tier tint used for a group's wash and its heading. */
export const TIER_COLOR: Record<string, string> = {
  abyss: "#8a5cf6",
  talisman: "#42c1c4",
  mythic: "#ff5db1",
  legendary: "#f39620",
  rare: "#9d63d2",
  common: "#7cae5f",
};

/** Rarest first. A tier absent from a collection is dropped, not shown empty. */
export const TIER_ORDER = ["abyss", "talisman", "mythic", "legendary", "rare", "common"] as const;

export interface TierGroup<T> {
  tier: string;
  items: T[];
}

/**
 * Split a collection into rarity groups, rarest first, each sorted by name.
 * Tiers nobody owns are omitted. Anything carrying an unknown tier (a future
 * one, or a special) is appended in a final group rather than vanishing —
 * an inventory picker that silently drops something you own is worse than
 * one with an odd heading.
 */
export function groupByTier<T extends { tier: string; name: string }>(items: T[]): TierGroup<T>[] {
  const byName = (a: T, b: T): number => a.name.localeCompare(b.name);
  const known = new Set<string>(TIER_ORDER);
  const groups: TierGroup<T>[] = TIER_ORDER.map((tier) => ({
    tier,
    items: items.filter((e) => e.tier === tier).sort(byName),
  })).filter((g) => g.items.length > 0);

  const rest = items.filter((e) => !known.has(e.tier)).sort(byName);
  if (rest.length) groups.push({ tier: "other", items: rest });
  return groups;
}
