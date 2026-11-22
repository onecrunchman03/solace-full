import { json, type Router } from "../http";
import { pocketDesk } from "../casino/pockets";
import {
  SELL_PRICES, SPIN_PRICE, MAX_BUY_SPINS, TALISMAN_PRICE, MYTHIC_PRICE, DRINK_PRICES,
  SLORP_PRICE, STARDUST_PRICE, EGO_PRICE, sellPriceOf, shieldPrice,
} from "../shop";
import { SHELF_PRICES, SHELF_SIZES, SHELF_TIERS, dailyShelf, restockAtFor, shelfPriceOf, utcDay } from "../shelf";
import type { Store } from "../db/store";
import { GUN_NAME, GUN_PRICE, CLIP_PRICE, CLIP_ROUNDS } from "../casino/items";
import { TALISMAN_CODE, reaperRetired } from "../wheel";
import { canBuyTrophies } from "../lender";
import { effectiveVipRank, vipDrinkPrice, vipDrugPrice } from "../vip";

const MAX_SELL_BATCH = 100;

/** What the death shield costs THIS caller right now, and why.
 *
 *  ONE resolver, read by the price board and by the till, because the whole
 *  failure mode of a discount is a tag that promises what the charge doesn't
 *  honour. Two things can cut the price — Sterling's personal courtesy (a 48h
 *  offer DMed to somebody whose gauge went red) and a house-wide shield sale —
 *  and `shieldPrice` takes the kindest rather than stacking them. */
export function shieldQuote(store: Store, userId: number) {
  const offer = store.shieldOffer(userId);
  const sp = store.sterlingActiveSpecial();
  const salePct = sp?.kind === "shieldsale" ? Number(sp.data.pct ?? 0) : 0;
  const price = shieldPrice(TALISMAN_PRICE, offer?.off ?? 0, salePct);
  return {
    talismanPrice: price,
    talismanBasePrice: TALISMAN_PRICE,
    // Which offer actually won, so the counter can name it in one line
    // instead of the client re-deriving the comparison and drifting.
    shieldOffer:
      price >= TALISMAN_PRICE
        ? null
        : {
            kind: (offer?.off ?? 0) >= salePct / 100 && offer ? ("courtesy" as const) : ("sale" as const),
            pct: Math.round((1 - price / TALISMAN_PRICE) * 100),
            until: (offer?.off ?? 0) >= salePct / 100 && offer ? offer.until : (sp?.endsAt ?? 0),
          },
  };
}

/** Register the Emoji Shop / Trader routes (sell emoji → silver, buy Wheel spins). */
export function registerShopRoutes(router: Router): void {
  // Shop state: your balance + the price board.
  router.get("/api/shop", "user", ({ res, user, store }) => {
    json(res, 200, {
      coins: store.getCoins(user.id),
      sellPrices: SELL_PRICES,
      spinPrice: SPIN_PRICE,
      ...shieldQuote(store, user.id),
      hasTalisman: store.ownsEmoji(user.id, TALISMAN_CODE),
      reaperRetired: reaperRetired(store),
      mythicPrice: MYTHIC_PRICE,
      // THE PERKS (Tier 4): the caller's own prices — free at the bar, the
      // counter at half — so the floor's price tags agree with the charge.
      drinkPrices: Object.fromEntries(Object.entries(DRINK_PRICES).map(([k, p]) => [k, vipDrinkPrice(effectiveVipRank(user), p)])),
      slorpPrice: vipDrugPrice(effectiveVipRank(user), SLORP_PRICE),
      stardustPrice: vipDrugPrice(effectiveVipRank(user), STARDUST_PRICE),
      egoPrice: vipDrugPrice(effectiveVipRank(user), EGO_PRICE),
      // What buying one FOR somebody costs (no member's discount on a treat).
      drugBase: { slorp: SLORP_PRICE, stardust: STARDUST_PRICE, ego: EGO_PRICE },
      vipPerks: effectiveVipRank(user) >= 4,
      gunName: GUN_NAME,
      gunPrice: GUN_PRICE,
      clipPrice: CLIP_PRICE,
      shelfPrices: SHELF_PRICES,
      essence: store.getEssence(user.id),
    });
  });

  // STERLING'S SHELVES: today's spread — one legendary on the top shelf,
  // three rares, six commons — the same for everyone, a pure function of
  // the UTC day (src/shelf.ts). Each listing sells once per person per day.
  const todaysShelf = (store: Store, now: number) =>
    dailyShelf(utcDay(now), (tier) => store.emojiInTier(tier).map((e) => e.code));
  router.get("/api/shop/stock", "user", ({ res, user, store }) => {
    const now = Date.now();
    const day = utcDay(now);
    const shelf = todaysShelf(store, now);
    const bought = new Set(store.shelfBought(user.id, day));
    const shelves = SHELF_TIERS.map((tier) => ({
      tier,
      price: SHELF_PRICES[tier],
      size: SHELF_SIZES[tier],
      items: shelf[tier].map((code) => ({ ...store.getEmoji(code)!, price: SHELF_PRICES[tier], bought: bought.has(code) })),
    }));
    json(res, 200, { day, restockAt: restockAtFor(day), prices: SHELF_PRICES, shelves });
  });

  // Buy off today's shelf. All-or-nothing; the silver BURNS — Sterling is
  // the house. Refused free when a code isn't on today's spread, is already
  // owned, or was already bought today.
  router.post("/api/shop/buy", "user", ({ res, body, user, store }) => {
    const raw = (body as { codes?: unknown })?.codes;
    if (!Array.isArray(raw) || raw.length === 0) return json(res, 400, { error: "bad_items" });
    const codes = raw.filter((c): c is string => typeof c === "string");
    if (codes.length === 0 || codes.length > MAX_SELL_BATCH) return json(res, 400, { error: "bad_items" });
    const now = Date.now();
    const shelf = todaysShelf(store, now);
    const onShelf = new Set(SHELF_TIERS.flatMap((t) => shelf[t]));
    const r = store.buyFromSterlingShelf(user.id, utcDay(now), codes, onShelf, shelfPriceOf);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 400, { error: r.error ?? "buy_failed", coins: r.coins });
    store.bumpStat(user.id, "shelf_bought", r.emoji.length);
    json(res, 200, { coins: r.coins, spent: r.spent, emoji: r.emoji });
  });

  // Sell one or more owned emoji to the Trader for silver (atomic).
  router.post("/api/shop/sell", "user", ({ res, body, user, store }) => {
    const raw = (body as { codes?: unknown })?.codes;
    if (!Array.isArray(raw) || raw.length === 0) return json(res, 400, { error: "bad_items" });
    const codes = raw.filter((c): c is string => typeof c === "string");
    if (codes.length === 0 || codes.length > MAX_SELL_BATCH)
      return json(res, 400, { error: "bad_items" });

    const r = store.sellEmojiToTrader(user.id, codes, sellPriceOf);
    if (!r.ok) return json(res, 400, { error: r.error ?? "sell_failed" });
    store.bumpStat(user.id, "emoji_sold", new Set(codes).size); // Ledger/achievement telemetry
    json(res, 200, { coins: r.coins, gained: r.gained });
  });

  // Buy extra Wheel-of-Fortune spins with silver (atomic).
  router.post("/api/shop/buy-spins", "user", ({ res, body, user, store }) => {
    const count = Math.floor(Number((body as { count?: unknown })?.count ?? 1));
    if (!Number.isInteger(count) || count < 1 || count > MAX_BUY_SPINS)
      return json(res, 400, { error: "bad_count" });

    const r = store.buyWheelSpins(user.id, count, SPIN_PRICE);
    if (!r.ok) return json(res, 400, { error: r.error ?? "buy_failed" });
    json(res, 200, { coins: r.coins, spins: r.spins, bought: count });
  });

  // The Wheelwright's dark bargain: sacrifice one owned MYTHIC to the house,
  // receive the death-shield talisman. No silver involved — a pure mythic
  // sink that finally gives the trophies a survival use.
  router.post("/api/shop/talisman", "user", ({ res, body, user, store }) => {
    // A retired reaper (Pandora's box) leaves nothing to shield against: the
    // talisman is a keepsake now, and both counters close.
    if (reaperRetired(store)) return json(res, 409, { error: "reaper_retired" });
    const code = String((body as { code?: unknown })?.code ?? "");
    if (!code) return json(res, 400, { error: "bad_code" });
    const r = store.buyTalismanWithMythic(user.id, code, TALISMAN_CODE);
    if (!r.ok) {
      return json(res, r.error === "already_shielded" ? 409 : 400, { error: r.error });
    }
    json(res, 200, { ok: true });
  });

  // …and the plain one, at Sterling's counter (Josh, Aug 2026): buy the shield
  // outright for silver. Burned, not paid — see TALISMAN_PRICE. The charge is
  // whatever `shieldQuote` just told the caller it would be, so a courtesy or
  // a live sale is honoured at the till rather than only on the tag; the
  // courtesy is spent by the purchase inside the same transaction as the debit.
  router.post("/api/shop/talisman-silver", "user", ({ res, body, user, store }) => {
    if (reaperRetired(store)) return json(res, 409, { error: "reaper_retired" });
    const { talismanPrice } = shieldQuote(store, user.id);
    // THE TAG IS HONOURED OR ASKED ABOUT (Josh, Oct 2026): a sale or a
    // courtesy that ran out while the counter was open used to charge full
    // price without a word. The page sends the price it showed; a higher one
    // is refused, free, with the new figure, so the buyer can say yes to it.
    const expect = Number((body as { expect?: unknown } | undefined)?.expect);
    if (Number.isFinite(expect) && talismanPrice > expect) return json(res, 409, { error: "price_changed", price: talismanPrice });
    const r = store.buyTalismanWithSilver(user.id, talismanPrice, TALISMAN_CODE);
    if (!r.ok) {
      const status = r.error === "already_shielded" ? 409 : r.error === "insufficient" ? 402 : 400;
      return json(res, status, { error: r.error, coins: r.coins });
    }
    json(res, 200, { ok: true, coins: r.coins, paid: talismanPrice });
  });

  // Sterling's top shelf: a random MYTHIC you don't own, for a season's worth
  // of silver. Burned, like the talisman — see MYTHIC_PRICE.
  router.post("/api/shop/mythic", "user", ({ res, user, store }) => {
    // THE HOUSE DOESN'T SELL TROPHIES TO MEN WHO OWE MONEY. Any live goblin
    // loan closes Sterling's top shelf. Rather than tainting individual coins
    // — which would mean tracking every silver piece in the world — one loan
    // closes one counter, and a million-silver window stops being ten mythics
    // on a Tuesday when the Bone Pit mints at most one a week.
    if (!canBuyTrophies(!!store.loanOf(user.id))) return json(res, 403, { error: "in_debt" });
    const r = store.buyRandomMythic(user.id, MYTHIC_PRICE);
    if (!r.ok) {
      const status = r.error === "insufficient" ? 402 : r.error === "owns_all_mythics" ? 409 : 400;
      return json(res, status, { error: r.error, coins: r.coins });
    }
    json(res, 200, { ok: true, coins: r.coins, emoji: r.emoji });
  });

  // A drink at Sterling's bar. The silver burns here; the BOTTLE is client
  // state on the floor (worth nothing, tradeable to no one — see
  // client/src/casino/drink.ts for why it gets no table).
  router.post("/api/shop/drink", "user", ({ res, body, user, store }) => {
    const id = String((body as { drink?: unknown })?.drink ?? "");
    // Own keys only: DRINK_PRICES["constructor"] is a function, which reached
    // spendCoins and answered 500 (Oct 2026 review).
    const base = Object.hasOwn(DRINK_PRICES, id) ? DRINK_PRICES[id] : 0;
    if (!base) return json(res, 400, { error: "no_such_drink" });
    const price = vipDrinkPrice(effectiveVipRank(user), base); // Tier 4 drinks free
    if (pocketDesk()?.room(user.id, id) === "full") return json(res, 409, { error: "hands_full" });
    const after = store.spendCoins(user.id, price);
    if (after === null) return json(res, 402, { error: "insufficient", coins: store.getCoins(user.id) });
    pocketDesk()?.credit(user.id, id); // on the floor, the bottle is in your pockets now
    json(res, 200, { ok: true, drink: id, coins: after });
  });

  // SLORP — under the counter. Same shape as a drink and for the same reason:
  // the silver burns HERE, over HTTP, and the trip itself is client state on
  // the floor. The price is the server's (`SLORP_PRICE`), never the client's,
  // so nobody talks Sterling down.
  router.post("/api/shop/slorp", "user", ({ res, user, store }) => {
    const after = store.spendCoins(user.id, vipDrugPrice(effectiveVipRank(user), SLORP_PRICE));
    if (after === null) return json(res, 402, { error: "insufficient", coins: store.getCoins(user.id) });
    json(res, 200, { ok: true, coins: after });
  });

  // STAR DUST — the canister next to the vial. Identical shape: the silver
  // burns HERE at the server's price; the three huffs, the helium voice and
  // the eventual detonation are all client state on the floor.
  router.post("/api/shop/stardust", "user", ({ res, user, store }) => {
    if (pocketDesk()?.room(user.id, "stardust") === "full") return json(res, 409, { error: "hands_full" });
    const after = store.spendCoins(user.id, vipDrugPrice(effectiveVipRank(user), STARDUST_PRICE));
    if (after === null) return json(res, 402, { error: "insufficient", coins: store.getCoins(user.id) });
    pocketDesk()?.credit(user.id, "stardust");
    json(res, 200, { ok: true, coins: after });
  });

  // EGO — a shot of the goop. Burned per shot at the server's price; the
  // swelling, the lens and the pop are all client state on the floor.
  router.post("/api/shop/ego", "user", ({ res, user, store }) => {
    if (pocketDesk()?.room(user.id, "ego") === "full") return json(res, 409, { error: "hands_full" });
    const after = store.spendCoins(user.id, vipDrugPrice(effectiveVipRank(user), EGO_PRICE));
    if (after === null) return json(res, 402, { error: "insufficient", coins: store.getCoins(user.id) });
    pocketDesk()?.credit(user.id, "ego");
    json(res, 200, { ok: true, coins: after });
  });

  // "Casino Gun - Kill everyone" (Josh, Aug 2026, listing name verbatim).
  // 150,000 silver, BURNED — Sterling keeps nothing, the world's supply
  // shrinks, and the Wheel stays the sole faucet with a firearm on the floor.
  // Ships loaded (9 rounds) with one spare clip; one gun per person, ever.
  router.post("/api/shop/gun", "user", ({ res, user, store }) => {
    // …and the gun is the other trophy on that shelf (see /api/shop/mythic).
    if (!canBuyTrophies(!!store.loanOf(user.id))) return json(res, 403, { error: "in_debt" });
    const r = store.buyCasinoGun(user.id, GUN_PRICE, CLIP_ROUNDS);
    if (!r.ok) {
      const status = r.error === "insufficient" ? 402 : r.error === "gun_owned" ? 409 : 400;
      return json(res, status, { error: r.error, coins: store.getCoins(user.id) });
    }
    json(res, 200, { ok: true, coins: r.coins });
  });

  // …and its spare magazines (9 rounds each). Burned like everything on this
  // counter, and refused to the unarmed so it can't become a pointless sink.
  router.post("/api/shop/gunclip", "user", ({ res, user, store }) => {
    const r = store.buyCasinoClip(user.id, CLIP_PRICE);
    if (!r.ok) {
      const status = r.error === "insufficient" ? 402 : r.error === "no_gun" ? 409 : 400;
      return json(res, status, { error: r.error, coins: store.getCoins(user.id) });
    }
    json(res, 200, { ok: true, coins: r.coins, clips: r.clips });
  });
}
