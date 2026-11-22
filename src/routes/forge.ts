import { json, type Router } from "../http";
import { MELT_YIELD, UPGRADE_COST, NEXT_TIER, MAX_MELT_BATCH, MYTHIC_TOLL, TOLLS, meltYieldOf, upgradeCostOf, nextTierOf, tollOf } from "../forge";
import { canBuyTrophies } from "../lender";

/** THE FORGE (Josh, Sep 2026) — melt emoji into essence, spend essence to
 *  raise an emoji a tier. Rules and numbers in src/forge.ts. */
export function registerForgeRoutes(router: Router): void {
  router.get("/api/forge", "user", ({ res, user, store }) => {
    json(res, 200, {
      essence: store.getEssence(user.id),
      meltYield: MELT_YIELD,
      upgradeCost: UPGRADE_COST,
      nextTier: NEXT_TIER,
      mythicToll: MYTHIC_TOLL,
      tolls: TOLLS,
      coins: store.getCoins(user.id),
    });
  });

  // MELT: owned emoji → essence. Atomic, all-or-nothing.
  router.post("/api/forge/melt", "user", ({ res, body, user, store }) => {
    const raw = (body as { codes?: unknown })?.codes;
    if (!Array.isArray(raw) || raw.length === 0) return json(res, 400, { error: "bad_items" });
    const codes = raw.filter((c): c is string => typeof c === "string");
    if (codes.length === 0 || codes.length > MAX_MELT_BATCH) return json(res, 400, { error: "bad_items" });
    const r = store.meltEmoji(user.id, codes, meltYieldOf);
    if (!r.ok) return json(res, 400, { error: r.error ?? "melt_failed" });
    store.bumpStat(user.id, "emoji_melted", new Set(codes).size);
    json(res, 200, { essence: r.essence, gained: r.gained });
  });

  // UPGRADE: one owned emoji + essence → a random unowned emoji one tier up.
  router.post("/api/forge/upgrade", "user", ({ res, body, user, store }) => {
    const code = String((body as { code?: unknown })?.code ?? "");
    if (!code) return json(res, 400, { error: "bad_code" });
    const e = store.getEmoji(code);
    if (!e) return json(res, 400, { error: "unknown_emoji" });
    const to = nextTierOf(e.tier);
    if (!to) return json(res, 400, { error: "top_tier" });
    // THE HOUSE DOESN'T FORGE TROPHIES FOR MEN WHO OWE MONEY — the mythic
    // step is a mythic source, so it closes on a live loan exactly like
    // Sterling's counter does.
    if (to === "mythic" && !canBuyTrophies(!!store.loanOf(user.id))) return json(res, 403, { error: "in_debt" });
    const r = store.forgeUpgrade(user.id, code, upgradeCostOf(e.tier), to, tollOf(e.tier));
    if (!r.ok) {
      const status = r.error === "insufficient_essence" || r.error === "insufficient_silver" ? 402 : r.error === "tier_complete" ? 409 : 400;
      return json(res, status, { error: r.error ?? "upgrade_failed", essence: r.essence, coins: r.coins });
    }
    store.bumpStat(user.id, "emoji_forged", 1);
    if (to === "mythic") store.bumpStat(user.id, "mythics_forged", 1);
    json(res, 200, { essence: r.essence, coins: r.coins, emoji: r.emoji, consumed: r.consumed, cost: upgradeCostOf(e.tier), toll: tollOf(e.tier) });
  });
}
