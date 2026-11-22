import { json, type Router } from "../http";
import { CATALOG, getItem, EQUIP_SLOTS, dailyStock, inStockToday, DEAL_PCT, type EquipSlot } from "../emporium";
import { toPublicUser } from "../types";

/** Effective price: admin override ?? default, minus the daily-deal cut,
 *  minus Sterling's flash sale when one is running on this item's kind
 *  (discounts stack multiplicatively — a deal item in a sale department is
 *  a genuine steal, which is very Sterling). */
function priceOf(
  item: { id: string; kind: string; price: number },
  overrides: Record<string, number>,
  dealId: string | null,
  sale: { kind: string; pct: number } | null,
): number {
  let p = overrides[item.id] ?? item.price;
  // Integer arithmetic: p * (1 - 0.3) is 244.99999999999997 for 350, and the
  // floor of that undercharged a coin (Oct 2026 review; shieldPrice's lesson).
  if (item.id === dealId) p = Math.floor((p * (100 - DEAL_PCT)) / 100);
  if (sale && item.kind === sale.kind) p = Math.floor((p * (100 - sale.pct)) / 100);
  return Math.max(1, p);
}

/** The active flash sale, if Sterling has one running. */
function activeSale(store: { sterlingActiveSpecial: () => { kind: string; data: Record<string, unknown> } | null }): { kind: string; pct: number } | null {
  const sp = store.sterlingActiveSpecial();
  if (!sp || sp.kind !== "flashsale") return null;
  const kind = String(sp.data.itemKind ?? "");
  const pct = Number(sp.data.pct ?? 0);
  return kind && pct > 0 ? { kind, pct } : null;
}

/**
 * Sterling's Emporium: cosmetic items bought with silver (burned — a pure
 * sink). Ownership is permanent; equipped cosmetics are public and broadcast
 * like profile edits so rosters/avatars update live. Prices are catalog
 * defaults unless an admin overrides them at runtime.
 */
export function registerEmporiumRoutes(router: Router): void {
  // The shelf: today's stock + everything you own. Admins get the FULL
  // catalog (validation view) with stock flags; users never see tomorrow's
  // shelf — mystery is the point of a rotating shop.
  router.get("/api/emporium", "user", ({ res, user, store }) => {
    const overrides = store.itemPriceOverrides();
    const owned = new Set(store.userItems(user.id));
    const stock = dailyStock();
    const sale = activeSale(store);
    // VIP rows live behind the rope (routes/vip.ts) — never listed here,
    // even for admins; the Room is the validation view for those.
    const visible = (user.isAdmin
      ? CATALOG
      : CATALOG.filter((i) => inStockToday(i, stock) || owned.has(i.id))).filter((i) => !i.vip);
    json(res, 200, {
      items: visible.map((i) => ({
        id: i.id,
        kind: i.kind,
        name: i.name,
        blurb: i.blurb,
        price: priceOf(i, overrides, stock.dealId, sale),
        basePrice: overrides[i.id] ?? i.price,
        owned: owned.has(i.id),
        inStock: inStockToday(i, stock),
        deal: i.id === stock.dealId,
        fresh: stock.freshIds.has(i.id),
      })),
      cosmetics: user.cosmetics,
      coins: store.getCoins(user.id),
      restockAt: stock.restockAt,
      dealPct: DEAL_PCT,
    });
  });

  // Buy an item (permanent; silver burned). Out-of-stock buys are refused —
  // the rotation is real, not cosmetic. Admins bypass (validation).
  router.post("/api/emporium/buy", "user", ({ res, body, user, store }) => {
    const item = getItem(String(body?.itemId ?? ""));
    if (!item) return json(res, 404, { error: "no_item" });
    if (item.vip) return json(res, 403, { error: "vip_room" }); // the Room's counter, not this one
    // Award-only items are earned, never sold — not even through the admin's
    // stock bypass, which bought The Pandoran for 1 silver (Oct 2026 review).
    if (item.award) return json(res, 403, { error: "award_only" });
    const stock = dailyStock();
    if (!user.isAdmin && !inStockToday(item, stock)) {
      return json(res, 400, { error: "not_in_stock" });
    }
    const price = priceOf(item, store.itemPriceOverrides(), stock.dealId, activeSale(store));
    // A deal or flash sale that ended while the page was open: ask, don't
    // silently charge more (Oct 2026; the talisman counter's rule).
    const expect = Number(body?.expect);
    if (Number.isFinite(expect) && price > expect) return json(res, 409, { error: "price_changed", price });
    const r = store.buyItem(user.id, item.id, price);
    if (!r.ok) {
      return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
    }
    json(res, 200, { ok: true, itemId: item.id, coins: r.coins });
  });

  // Equip / unequip a cosmetic slot (itemId null = bare).
  router.post("/api/emporium/equip", "user", ({ res, body, user, store, bus }) => {
    const slot = String(body?.slot ?? "") as EquipSlot;
    if (!EQUIP_SLOTS.includes(slot)) return json(res, 400, { error: "bad_slot" });

    let itemId: string | null = null;
    if (body?.itemId != null) {
      const item = getItem(String(body.itemId));
      if (!item) return json(res, 404, { error: "no_item" });
      if (item.kind !== slot) return json(res, 400, { error: "wrong_slot" });
      if (!store.ownsItem(user.id, item.id)) return json(res, 403, { error: "not_owned" });
      itemId = item.id;
    }
    const updated = store.setCosmetic(user.id, slot, itemId);
    if (!updated) return json(res, 404, { error: "user_not_found" });
    // Cosmetics are public — everyone's roster/avatars update live.
    bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { cosmetics: updated.cosmetics });
  });

  // Admin: override an item's price (null restores the catalog default).
  router.post("/api/admin/emporium/price", "admin", ({ res, body, store }) => {
    const item = getItem(String(body?.itemId ?? ""));
    if (!item) return json(res, 404, { error: "no_item" });
    if (body?.price === null) {
      store.setItemPrice(item.id, null);
      return json(res, 200, { ok: true, itemId: item.id, price: item.price });
    }
    const price = Number(body?.price);
    if (!Number.isInteger(price) || price < 1 || price > 1_000_000) {
      return json(res, 400, { error: "bad_price" });
    }
    store.setItemPrice(item.id, price);
    json(res, 200, { ok: true, itemId: item.id, price });
  });
}
