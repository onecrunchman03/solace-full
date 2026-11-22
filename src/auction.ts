import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { guardedTick } from "./health";

/**
 * Auction house economics (Phase 13e). A public English auction: a seller lists
 * one emoji (escrowed out of their inventory) and bidders compete in silver.
 *
 * Full escrow: the emoji is held on the auction, and each bid's silver is held
 * too (refunded the instant you're outbid). At close the emoji goes to the high
 * bidder and 95% of the winning bid goes to the seller — the other **5% seeds
 * the nightly lottery pot** (migration 43; formerly burned). Coins only move
 * player→player here, never minted, so the Wheel stays the sole faucet.
 */

/** Fraction of a winning bid raked at settlement — seeds the nightly
 *  lottery pot (migration 43) rather than burning. */
export const HOUSE_CUT = 0.05;
/** Each new bid must clear the current bid by at least this fraction (min 1). */
export const BID_STEP = 0.05;

export const MIN_START = 1;
export const MAX_START = 1_000_000;
/** Listing durations offered to sellers, in hours (up to 7 days —
 *  Josh, Aug 2026). Long listings still settle via the normal sweep. */
export const ALLOWED_HOURS = [1, 6, 24, 72, 168] as const;
/** A bid in the final minute pushes the end out by a minute (anti-snipe). */
export const ANTI_SNIPE_MS = 60_000;
/** How many recent bids to surface in an auction DTO. */
export const BID_HISTORY = 8;

const SWEEP_MS = 20_000;

/** The smallest silver a next bid may be: the start price if no bids yet, else
 *  the current bid plus a 5% step. */
export function minNextBid(startPrice: number, currentBid: number | null): number {
  if (currentBid == null) return startPrice;
  return currentBid + Math.max(1, Math.floor(currentBid * BID_STEP));
}

/** Split a winning bid into the seller's take and the house cut (which
 *  seeds the nightly lottery pot). */
export function splitBid(amount: number): { toSeller: number; burned: number } {
  const burned = Math.floor(amount * HOUSE_CUT);
  return { toSeller: amount - burned, burned };
}

/**
 * Close every auction whose timer has elapsed, broadcasting each result. Runs on
 * an interval and can be called lazily before a listing read. Safe to call often —
 * `closeAuction` is idempotent, so nothing double-settles.
 */
export function sweepAuctions(store: Store, bus: Bus): number {
  const due = store.dueAuctionIds(Date.now());
  let closed = 0;
  for (const id of due) {
    // One lot that throws must not block every lot after it, or the listing
    // route that sweeps before answering (Oct 2026 review).
    let r: ReturnType<Store["closeAuction"]>;
    try {
      r = store.closeAuction(id);
    } catch (e) {
      store.recordError("server", `auction ${id} would not settle: ${(e as Error).message}`, (e as Error).stack ?? "");
      console.error(`[auction] lot ${id} would not settle:`, (e as Error).message);
      continue;
    }
    if (r.ok) {
      const auction = store.buildAuctionDTO(id);
      if (auction) bus.emit("auction.close", { auction });
      closed++;
    }
  }
  return closed;
}

/** Start the periodic auction sweep; returns a stop function. */
export function startAuctionSweep(store: Store, bus: Bus): () => void {
  const timer = setInterval(() => {
    guardedTick(store, "auction sweep", SWEEP_MS, () => sweepAuctions(store, bus));
  }, SWEEP_MS);
  return () => clearInterval(timer);
}
