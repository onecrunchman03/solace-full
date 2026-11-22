import { json, type Router } from "../http";
import { CATALOG, getItem } from "../emporium";
import { VIP_MAX, VIP_PERK_RANK, VIP_RANK_NAMES, VIP_TIERS, effectiveVipRank, relicNeed, suitColorOfItem, vipRankOf } from "../vip";

/** THE VIP ROOM (Josh, Sep 2026) — the side shop behind the rope. Rules in
 *  src/vip.ts; the rows are Emporium items flagged `vip`, bought through the
 *  Emporium's own money path (burned silver, permanent, never tradeable). */
export function registerVipRoutes(router: Router): void {
  // The door. Everyone may look: outsiders see the rope and the four bars,
  // which is half the point of a members-only room.
  router.get("/api/vip", "user", ({ res, user, store }) => {
    const rank = effectiveVipRank(user);
    const progress = store.vipProgress(user.id);
    const owned = new Set(store.userItems(user.id));
    const overrides = store.itemPriceOverrides();
    // The wardrobe: a VIP suit you own is always in the locker.
    store.ensureVipSuits(user.id, [...owned].map(suitColorOfItem).filter((c): c is string => !!c));
    json(res, 200, {
      rank,
      max: VIP_MAX,
      names: VIP_RANK_NAMES,
      tiers: VIP_TIERS,
      /** What the collection says right now (the stamp is a high-water mark,
       *  so this can read lower than `rank` after a sale). */
      live: vipRankOf(progress),
      progress,
      /** Relics each rung needs (index = rank; the top rung is "all"). */
      relicNeed: [0, 1, 2, 3, 4].map((r) => relicNeed(r, progress.find((p) => p.tier === "relic")?.total ?? 0)),
      items: CATALOG.filter((i) => i.vip).map((i) => ({
        id: i.id,
        kind: i.kind,
        name: i.name,
        blurb: i.blurb,
        tier: i.vip,
        price: overrides[i.id] ?? i.price,
        owned: owned.has(i.id),
        locked: (i.vip ?? 0) > rank,
      })),
      cosmetics: user.cosmetics,
      coins: store.getCoins(user.id),
      // THE PERKS ride the rank (Tier 4): what they are, and where the
      // once-a-life consolidation stands for this member.
      perks: {
        rank: VIP_PERK_RANK,
        active: rank >= VIP_PERK_RANK,
        consolidation: {
          used: store.vipConsolidationUsed(user.id, user.generation),
          hasLoan: !!store.loanOf(user.id),
          // …and only a debt IN TROUBLE (a missed day) is the house's to settle.
          eligible: (store.loanOf(user.id)?.missed ?? 0) >= 1,
        },
      },
    });
  });

  // THE HOUSE PAYS: once a life, the house settles a Tier-4 member's goblin
  // debt into the vault. Rank-gated BEFORE anything else.
  router.post("/api/vip/consolidate", "user", ({ res, user, store, bus }) => {
    if (effectiveVipRank(user) < VIP_PERK_RANK) return json(res, 403, { error: "vip_locked", tier: VIP_PERK_RANK });
    const r = store.vipConsolidate(user.id);
    if (!r.ok) return json(res, r.error === "no_loan" ? 404 : 409, { error: r.error });
    // (no loans_repaid credit — the house cleared it, not the member)
    bus.emit("lender.change", {});
    bus.emit("lender.notice", {
      userId: user.id,
      kind: "gift",
      title: "THE HOUSE PAID THE GOBLINS",
      body: r.fromWallet > 0
        ? `You put in ${r.fromWallet.toLocaleString()}; Sterling covered the other ${r.paid.toLocaleString()} off the Foundry's books. Once a life. Don't make him regret it.`
        : `Sterling settled your account — ${r.paid.toLocaleString()} silver, off the Foundry's books. Once a life. Don't make him regret it.`,
    });
    json(res, 200, { ok: true, paid: r.paid, fromWallet: r.fromWallet, released: r.released, coins: store.getCoins(user.id) });
  });

  // The counter. Rank-gated BEFORE the wallet; otherwise the Emporium's buy.
  router.post("/api/vip/buy", "user", ({ res, body, user, store }) => {
    const item = getItem(String((body as { itemId?: unknown })?.itemId ?? ""));
    if (!item || !item.vip) return json(res, 404, { error: "no_item" });
    if (item.vip > effectiveVipRank(user)) return json(res, 403, { error: "vip_locked", tier: item.vip });
    const price = store.itemPriceOverrides()[item.id] ?? item.price;
    const r = store.buyItem(user.id, item.id, price);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
    const color = suitColorOfItem(item.id);
    if (color) store.ensureVipSuits(user.id, [color]);
    store.bumpStat(user.id, "vip_bought", 1);
    json(res, 200, { ok: true, itemId: item.id, coins: r.coins });
  });
}
