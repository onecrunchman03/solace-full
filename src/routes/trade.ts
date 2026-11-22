import { json, makeRateLimiter, type Router } from "../http";
import { isBound } from "../abyss";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { canMoveValue } from "../lender";

const MAX_ITEMS = 12;
const MAX_NOTE = 200;
/** Open offers one member may have out at once, and how fast they may file
 *  them (review round 2): every pending offer costs its RECIPIENT ~30
 *  queries per /api/trades read plus a socket frame, and blocking the sender
 *  never cleared a backlog. One open offer per pair, ten out in total. */
export const MAX_OPEN_OFFERS = 10;
export const TRADE_CREATE_BURST = 20;
export const TRADE_CREATE_WINDOW_MS = 10 * 60_000;

/** Sanitize a list of emoji codes: strings only, real catalog codes, de-duped. */
function cleanCodes(store: Store, raw: unknown): string[] | null {
  // Length first: the catalog lookup below runs per element.
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS * 2) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") return null;
    if (seen.has(v)) continue; // skip duplicates
    const e = store.getEmoji(v);
    if (!e) return null; // unknown emoji code
    if (isBound(e.tier)) return null; // the Stone of the Abyss never trades
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Rebuild a trade's DTO and push it to both parties over the socket. */
function emitTrade(
  bus: Bus,
  store: Store,
  event: "trade.new" | "trade.update",
  id: number,
  parties: { fromUser: number; toUser: number },
): void {
  const trade = store.buildTradeDTO(id);
  if (trade) bus.emit(event, { userIds: [parties.fromUser, parties.toUser], trade });
}

/** Register direct-trade (barter) routes. Delivery is recipient-scoped. */
export function registerTradeRoutes(router: Router): void {
  const rateLimit = makeRateLimiter();
  // My pending trades: offers I received + offers I sent.
  router.get("/api/trades", "user", ({ res, user, store }) => {
    json(res, 200, store.listTradesFor(user.id));
  });

  // Create a barter offer.
  router.post("/api/trades", "user", ({ res, body, user, store, bus }) => {
    const toUser = Number(body?.toUser);
    if (!Number.isInteger(toUser)) return json(res, 400, { error: "bad_user" });
    if (toUser === user.id) return json(res, 400, { error: "self_trade" });
    if (store.isBlockedEither(user.id, toUser)) return json(res, 403, { error: "blocked" });
    // FROZEN (lender stage 4): a debtor deep enough down the goblins' ladder
    // may still gamble — they want you chasing it — but nothing of value
    // leaves their hands. This is also what closes the laundering route the
    // whole feature would otherwise have: borrow a fortune, gift it to a
    // friend, default, and let the cell take an empty account.
    if (!canMoveValue(store.loanStage(user.id))) return json(res, 403, { error: "in_arrears" });
    const target = store.getUserById(toUser);
    // A deleted account reads as nonexistent; a bot or a banned account can
    // never accept, so an offer to one only sat open (Oct 2026 review).
    if (!target || target.deletedAt) return json(res, 404, { error: "user_not_found" });
    if (target.disabled || target.locked || target.isBot) return json(res, 400, { error: "user_unavailable" });
    if (!rateLimit(`trade:${user.id}`, TRADE_CREATE_BURST, TRADE_CREATE_WINDOW_MS)) {
      return json(res, 429, { error: "rate_limited" });
    }
    if (store.hasPendingTradeBetween(user.id, toUser)) return json(res, 409, { error: "offer_pending" });
    if (store.countOutgoingTrades(user.id) >= MAX_OPEN_OFFERS) {
      return json(res, 409, { error: "too_many_offers", max: MAX_OPEN_OFFERS });
    }

    const offered = cleanCodes(store, body?.offered);
    const requested = cleanCodes(store, body?.requested);
    if (!offered || !requested) return json(res, 400, { error: "bad_items" });
    if (offered.length < 1 || offered.length > MAX_ITEMS || requested.length > MAX_ITEMS) {
      return json(res, 400, { error: "bad_items" });
    }
    if (offered.some((c) => requested.includes(c))) return json(res, 400, { error: "overlap" });

    // Ownership rules — mirror settlement so bad offers fail fast.
    if (!offered.every((c) => store.ownsEmoji(user.id, c))) return json(res, 400, { error: "not_owned" });
    if (!requested.every((c) => store.ownsEmoji(toUser, c))) return json(res, 400, { error: "they_lack" });
    if (offered.some((c) => store.ownsEmoji(toUser, c))) return json(res, 400, { error: "they_have_offer" });
    if (requested.some((c) => store.ownsEmoji(user.id, c))) return json(res, 400, { error: "you_have_request" });

    const note = body?.note != null ? String(body.note).trim().slice(0, MAX_NOTE) || null : null;
    const id = store.createTrade(user.id, toUser, offered, requested, note);
    emitTrade(bus, store, "trade.new", id, { fromUser: user.id, toUser });
    json(res, 200, { trade: store.buildTradeDTO(id) });
  });

  // Accept — recipient only; settles atomically (or voids if no longer valid).
  router.post("/api/trades/:id/accept", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    const p = store.tradeParties(id);
    if (!p) return json(res, 404, { error: "no_trade" });
    if (p.toUser !== user.id) return json(res, 403, { error: "forbidden" });
    if (p.status !== "pending") return json(res, 409, { error: "not_pending" });
    // FROZEN (lender stage 4): filing a new trade was gated, but ACCEPTING one
    // that requests your emoji moves value out of your hands just the same —
    // a friend could offer junk, request the debtor's valuables, and drain the
    // account the goblins are about to seize. Pure inbound gifts (nothing
    // requested) still land: a frozen debtor may be helped, just not emptied.
    if (p.requests > 0 && !canMoveValue(store.loanStage(user.id)))
      return json(res, 403, { error: "in_arrears" });

    const result = store.acceptTrade(id);
    emitTrade(bus, store, "trade.update", id, p);
    if (!result.ok) return json(res, 409, { error: result.error, trade: store.buildTradeDTO(id) });
    // Ledger/achievement telemetry — a settled swap counts for both parties.
    store.bumpStat(p.fromUser, "trades_done");
    store.bumpStat(p.toUser, "trades_done");
    json(res, 200, { trade: store.buildTradeDTO(id) });
  });

  // Decline — recipient only.
  router.post("/api/trades/:id/decline", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    const p = store.tradeParties(id);
    if (!p) return json(res, 404, { error: "no_trade" });
    if (p.toUser !== user.id) return json(res, 403, { error: "forbidden" });
    if (!store.resolveTrade(id, "declined")) return json(res, 409, { error: "not_pending" });
    emitTrade(bus, store, "trade.update", id, p);
    json(res, 200, { trade: store.buildTradeDTO(id) });
  });

  // Cancel — sender only.
  router.post("/api/trades/:id/cancel", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    const p = store.tradeParties(id);
    if (!p) return json(res, 404, { error: "no_trade" });
    if (p.fromUser !== user.id) return json(res, 403, { error: "forbidden" });
    if (!store.resolveTrade(id, "cancelled")) return json(res, 409, { error: "not_pending" });
    emitTrade(bus, store, "trade.update", id, p);
    json(res, 200, { trade: store.buildTradeDTO(id) });
  });
}
