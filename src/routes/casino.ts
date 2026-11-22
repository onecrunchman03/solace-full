// THE FLOOR's HTTP routes: the proximity-voice room grant, and the casino
// item drawer (the gun + the 50-slot locker, migration 69). The voice route
// mirrors the backrooms voice-token route exactly — env-gated, and 403 unless
// the caller is actually ON the floor (the /ws-casino roster is the authority).
import { AccessToken } from "livekit-server-sdk";
import { config } from "../config";
import { json, makeRateLimiter, type Router } from "../http";
import type { CasinoFloor } from "../casino/floor";
import { LOCKER_SLOTS } from "../casino/items";
import { DRINK_PRICES, SLORP_PRICE, STARDUST_PRICE, EGO_PRICE } from "../shop";

/** What one player may buy another at Sterling's counter, at the counter's
 *  own base price (no member's discount: a Tier-4 member's free drinks are
 *  for drinking, not for handing out by the tray). */
export function treatPrice(item: string): number {
  // Own keys only: "constructor" is on every object (Oct 2026 review).
  if (Object.hasOwn(DRINK_PRICES, item)) return DRINK_PRICES[item];
  if (item === "slorp") return SLORP_PRICE;
  if (item === "stardust") return STARDUST_PRICE;
  if (item === "ego") return EGO_PRICE;
  return 0;
}

const voiceEnabled = (): boolean =>
  !!(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);

export function registerCasinoRoutes(router: Router, floor: CasinoFloor): void {
  const rateLimit = makeRateLimiter();

  // BUYING SOMEBODY A ROUND (Oct 2026): a drink or a drug from Sterling's
  // counter, put straight into another player's pockets. Both of you must
  // be on the floor; every refusal comes before the
  // wallet, and the silver comes back if it can't be delivered after all.
  router.post("/api/casino/treat", "user", ({ res, body, user, store }) => {
    const item = String(body?.item ?? "");
    const to = Number(body?.to);
    const price = treatPrice(item);
    if (!price) return json(res, 400, { error: "no_such_item" });
    if (!Number.isInteger(to)) return json(res, 400, { error: "bad_user" });
    if (to === user.id) return json(res, 400, { error: "self_treat" });
    if (!floor.present(user.id)) return json(res, 403, { error: "not_on_floor" });
    if (!floor.present(to)) return json(res, 409, { error: "not_here" });
    if (store.isBlockedEither(user.id, to)) return json(res, 403, { error: "blocked" });
    if (!floor.canDeliver(to, item)) return json(res, 409, { error: "hands_full" });
    if (!rateLimit(`treat:${user.id}`, 12, 60_000)) return json(res, 429, { error: "rate_limited" });
    const after = store.spendCoins(user.id, price);
    if (after === null) return json(res, 402, { error: "insufficient", coins: store.getCoins(user.id) });
    const from = { id: user.id, name: user.displayName || user.username };
    if (!floor.deliver(to, item, from.name)) {
      store.addCoins(user.id, price);
      return json(res, 409, { error: "hands_full", coins: store.getCoins(user.id) });
    }
    json(res, 200, { ok: true, coins: after, item, price });
  });

  router.post("/api/casino/voice-token", "user", async ({ res, user }) => {
    // floor first, config second — so "you're not inside" is answerable (and
    // testable) even on a box with no LiveKit creds
    if (!floor.has(user.id)) return json(res, 403, { error: "not_on_floor" });
    if (!voiceEnabled()) return json(res, 503, { error: "voice_disabled" });
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: String(user.id),
      name: user.displayName,
      ttl: "1h",
    });
    at.addGrant({
      room: "casino_floor",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    json(res, 200, { token: await at.toJwt(), url: config.livekitUrl, room: "casino_floor" });
  });

  // What you're carrying and what's in your locker. Self-scoped — casino items
  // are private the way coins are, so nothing here ever describes another user.
  router.get("/api/casino/items", "user", ({ res, user, store }) => {
    json(res, 200, {
      inv: store.casinoInv(user.id),
      locker: store.casinoLocker(user.id),
      slots: LOCKER_SLOTS,
    });
  });

  // Put a carried item into the locker. Pass `slot` to pick the pigeonhole
  // (the UI's organizing click — empty, or the same stackable item, only);
  // omit it and the server assigns (clips merge into their existing stack).
  // The gun always moves whole, load and all.
  router.post("/api/casino/locker/store", "user", ({ res, body, user, store }) => {
    const item = String((body as { item?: unknown })?.item ?? "");
    const qty = Math.floor(Number((body as { qty?: unknown })?.qty ?? 1));
    const rawSlot = (body as { slot?: unknown })?.slot;
    const slot = rawSlot === undefined || rawSlot === null ? undefined : Math.floor(Number(rawSlot));
    if (item !== "gun" && item !== "clip") return json(res, 400, { error: "bad_item" });
    const r = store.casinoStoreItem(user.id, item, item === "gun" ? 1 : qty, LOCKER_SLOTS, slot);
    if (!r.ok) {
      const status = r.error === "locker_full" || r.error === "slot_taken" ? 409 : 400;
      return json(res, status, { error: r.error });
    }
    json(res, 200, { ok: true, slot: r.slot, inv: store.casinoInv(user.id), locker: store.casinoLocker(user.id) });
  });

  // Rearrange the locker: move a slot's contents to another slot, swapping if
  // the destination is occupied. Nothing enters or leaves.
  router.post("/api/casino/locker/move", "user", ({ res, body, user, store }) => {
    const from = Math.floor(Number((body as { from?: unknown })?.from ?? -1));
    const to = Math.floor(Number((body as { to?: unknown })?.to ?? -1));
    if (![from, to].every((s) => Number.isInteger(s) && s >= 0 && s < LOCKER_SLOTS))
      return json(res, 400, { error: "bad_slot" });
    const r = store.casinoMoveSlot(user.id, from, to);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true, inv: store.casinoInv(user.id), locker: store.casinoLocker(user.id) });
  });

  // Take a slot's contents back into your hands.
  router.post("/api/casino/locker/take", "user", ({ res, body, user, store }) => {
    const slot = Math.floor(Number((body as { slot?: unknown })?.slot ?? -1));
    if (!Number.isInteger(slot) || slot < 0 || slot >= LOCKER_SLOTS) return json(res, 400, { error: "bad_slot" });
    const r = store.casinoTakeItem(user.id, slot);
    if (!r.ok) return json(res, 400, { error: r.error });
    json(res, 200, { ok: true, item: r.item, qty: r.qty, inv: store.casinoInv(user.id), locker: store.casinoLocker(user.id) });
  });
}
