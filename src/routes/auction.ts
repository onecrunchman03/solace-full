import { json, type Router } from "../http";
import { isBound } from "../abyss";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { sweepAuctions, ALLOWED_HOURS, MIN_START, MAX_START } from "../auction";
import { canMoveValue } from "../lender";

const HOUR_MS = 60 * 60 * 1000;

/** Map a store error code to an HTTP status. */
function statusFor(error: string | undefined): number {
  switch (error) {
    case "no_auction":
    case "unknown_emoji":
    case "not_a_relic":
      return 404;
    case "forbidden":
      return 403;
    case "insufficient":
      return 402;
    case "not_open":
    case "ended":
    case "has_bids":
      return 409;
    default:
      return 400; // bad_amount, too_low, self_bid, already_owned, not_owned, bad_input
  }
}

/** Register the Auction house routes (a public silver marketplace). */
export function registerAuctionRoutes(router: Router): void {
  // List open auctions (+ a short tail of recently closed). Lazily settles any
  // whose timer already elapsed before answering, so the list is never stale.
  router.get("/api/auctions", "user", ({ res, store, bus }) => {
    sweepAuctions(store, bus);
    json(res, 200, store.listAuctions());
  });

  // List a lot for auction: one of your emoji (`code`), or a DUPLICATE RELIC
  // from your backrooms locker (`relicItemId`) — the only path from a relic to
  // silver, and it's player→player.
  router.post("/api/auctions", "user", ({ res, body, user, store, bus }) => {
    // FROZEN (lender stage 4) — the same rule as Direct Trade: a debtor in
    // deep arrears can't move value out of their hands, by sale or otherwise.
    if (!canMoveValue(store.loanStage(user.id))) return json(res, 403, { error: "in_arrears" });
    const code = typeof body?.code === "string" ? body.code : null;
    const relicItemId = Number.isInteger(body?.relicItemId) ? Number(body?.relicItemId) : null;
    const startPrice = Number(body?.startPrice);
    const hours = Number(body?.hours);
    if (code && relicItemId != null) return json(res, 400, { error: "one_lot_only" });
    if (!code && relicItemId == null) return json(res, 400, { error: "bad_lot" });
    if (code && !store.getEmoji(code)) return json(res, 400, { error: "bad_emoji" });
    if (code && isBound(store.getEmoji(code)?.tier)) return json(res, 400, { error: "bound" }); // the Stone never lists
    if (!Number.isInteger(startPrice) || startPrice < MIN_START || startPrice > MAX_START) {
      return json(res, 400, { error: "bad_price" });
    }
    if (!(ALLOWED_HOURS as readonly number[]).includes(hours)) return json(res, 400, { error: "bad_duration" });

    const endsAt = Date.now() + hours * HOUR_MS;
    const r =
      relicItemId != null
        ? store.createRelicAuction(user.id, relicItemId, startPrice, endsAt)
        : store.createAuction(user.id, code!, startPrice, endsAt);
    if (!r.ok || r.id == null) return json(res, statusFor(r.error), { error: r.error ?? "list_failed" });
    const auction = store.buildAuctionDTO(r.id);
    if (auction) bus.emit("auction.new", { auction });
    json(res, 200, { auction });
  });

  // Place a bid (silver). Escrowed immediately; refunds the previous high bidder.
  router.post("/api/auctions/:id/bid", "user", ({ res, params, body, user, store, bus }) => {
    // FROZEN (lender stage 4): a winning bid pays the seller at settle — the
    // borrow-then-overbid-a-friend's-junk route is the same laundering the
    // listing gate closes. It would also park purse silver in bid escrow,
    // out of the goblins' garnishment reach.
    if (!canMoveValue(store.loanStage(user.id))) return json(res, 403, { error: "in_arrears" });
    // …and, like the wallet, NOBODY WHO OWES THE GOBLINS (Oct 2026 review): a
    // fresh borrower could bid the loan on a friend's common and hand them 95%
    // of it — the borrow-then-default route the wallet's send refuses.
    if (store.loanOf(user.id)) return json(res, 403, { error: "owes_goblins" });
    const id = Number(params.id);
    const amount = Number(body?.amount);
    const r = store.placeBid(id, user.id, amount);
    const auction = store.buildAuctionDTO(id);
    if (!r.ok) return json(res, statusFor(r.error), { error: r.error ?? "bid_failed", auction });
    if (auction) bus.emit("auction.bid", { auction });
    json(res, 200, { auction, coins: store.getCoins(user.id) });
  });

  // Cancel your own listing — only while it's open and has no bids.
  router.post("/api/auctions/:id/cancel", "user", ({ res, params, user, store, bus }) => {
    const id = Number(params.id);
    const r = store.cancelAuction(id, user.id);
    if (!r.ok) return json(res, statusFor(r.error), { error: r.error ?? "cancel_failed" });
    const auction = store.buildAuctionDTO(id);
    if (auction) bus.emit("auction.close", { auction });
    json(res, 200, { auction });
  });
}
