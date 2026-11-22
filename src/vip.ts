// THE VIP ROOM (Josh, Sep 2026) — the side shop behind Sterling's counter,
// reserved for people who have finished a collection. Pure rules, no
// imports (mortality.ts's shape); the money path is the Emporium's own
// (user_items, burned silver) and the rank lives on users.vipTier.
//
//   Tier 1 — every common            (565)
//   Tier 2 — every rare as well      (506)
//   Tier 3 — every legendary as well (72)
//   Tier 4 — every mythic as well    (20)
//
// RANK IS A HIGH-WATER MARK. The moment you hold the whole tier you are
// stamped, and selling or melting a common afterwards does not demote you —
// live recomputation would kick a player out of the Room for using the Forge.
// Each tier requires every tier below it (a rare completionist with a hole in
// the commons is still Tier 0). ADMINS ARE TIER 4 FROM BOOT (Josh: "give the
// admin account access to all of these from the start so i can test").
//
// VIP items are Emporium catalog rows carrying `vip: <tier>` — never on the
// rotating shelf, never tradeable, visible only in the Room, buyable only at
// your rank or below. They cost silver because Josh said "purchase", but the
// collection is the real gate; the prices are a formality that reads premium.

export const VIP_TIERS = ["common", "rare", "legendary", "mythic"] as const;
export type VipTier = (typeof VIP_TIERS)[number];
export const VIP_MAX = VIP_TIERS.length;

/** The rank names — the ladder Sterling addresses you by. Index = rank. */
export const VIP_RANK_NAMES = ["", "Collector", "Connoisseur", "Magnate", "The Complete"] as const;

export interface VipProgress {
  /** The four emoji tiers, plus "relic" — the Backrooms' relics unlocked. */
  tier: VipTier | "relic";
  owned: number;
  total: number;
}

/** THE RELICS JOIN THE LADDER (Josh, Sep 2026: "make gathering relics to
 *  the backrooms a part of the tier progression"). Relics unlocked, by
 *  rank: Tier 1 needs 2, Tier 2 needs 8, Tier 3 needs 14, Tier 4 needs
 *  EVERY relic the two maps hold (20 today — `relicNeed` reads the total
 *  off the progress row, so a third map's relics raise the top rung with
 *  it). Index = rank. */
export const VIP_RELIC_NEED = [0, 2, 8, 14, Infinity] as const;
export function relicNeed(rank: number, total: number): number {
  const n = VIP_RELIC_NEED[Math.max(0, Math.min(VIP_MAX, rank))];
  return n === Infinity ? total : Math.min(n, total);
}

/** The highest rank the collection supports: the longest run of complete
 *  emoji tiers from the bottom, each rung also needing its relics. Order
 *  follows VIP_TIERS. Without a relic row, no relics are held. */
export function vipRankOf(progress: readonly { tier: string; owned: number; total: number }[]): number {
  const relics = progress.find((x) => x.tier === "relic") ?? { owned: 0, total: 0 };
  let rank = 0;
  for (const t of VIP_TIERS) {
    const p = progress.find((x) => x.tier === t);
    if (!p || p.total === 0 || p.owned < p.total) break;
    if (relics.total === 0 || relics.owned < relicNeed(rank + 1, relics.total)) break;
    rank++;
  }
  return rank;
}

/** The rank an account holds for the Room's doors: admins own every shelf. */
export function effectiveVipRank(u: { isAdmin: boolean; vipTier: number }): number {
  return u.isAdmin ? VIP_MAX : Math.max(0, Math.min(VIP_MAX, u.vipTier | 0));
}

// ---- THE PERKS THAT RIDE THE RANK (Josh: "the perks come automatically") --
// Tier 4 only. Free drinks at the bar, the three things under the counter
// at half price, and THE HOUSE PAYS the goblins once a generation. None of
// it opens a faucet: the drinks and drugs are burns that burn less, and the
// consolidation is a ledgered house mint INTO the vault (see
// Store.vipConsolidate) — the economy audit carries it as `houseMints`.
export const VIP_PERK_RANK = 4;
export function vipDrinkPrice(rank: number, base: number): number {
  return rank >= VIP_PERK_RANK ? 0 : base;
}
export function vipDrugPrice(rank: number, base: number): number {
  return rank >= VIP_PERK_RANK ? Math.floor(base / 2) : base;
}

/** The suit colorway a VIP suit item wears — the id's last segment, so a
 *  `suit-vip1-copper` row means the "copper" hazmat everywhere a suit exists.
 *  The client's suitcolor.ts carries the same ids. */
export function suitColorOfItem(itemId: string): string | null {
  // THE PANDORAN (PANDORA.md) is issued the same way — an item that wears a
  // locker row — so every wardrobe read and the Voss refusal cover it too.
  if (itemId === "suit-pandoran") return "pandoran";
  const m = /^suit-vip\d-([a-z]+)$/.exec(itemId);
  return m ? m[1] : null;
}

/** Item ids sort into the Room's shelves by this: the digit after "vip". */
export function vipTierOfItem(itemId: string): number {
  const m = /-vip(\d)-/.exec(itemId);
  return m ? Number(m[1]) : 0;
}
