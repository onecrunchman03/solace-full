// Auction house state. Listings, bids, and settlements arrive over the shared
// WebSocket and are broadcast to everyone (a public marketplace, unlike DMs/trades).

import { api, ApiError, type Auction } from "./api";
import { session } from "./session.svelte";
import { wallet, loadWallet } from "./wallet.svelte";
import { refreshOwned } from "./emoji.svelte";
import { nav } from "./nav.svelte";
import { playSfx } from "./sfx";

export const auction = $state<{ open: Auction[]; recent: Auction[]; loaded: boolean }>({
  open: [],
  recent: [],
  loaded: false,
});

export async function loadAuctions(): Promise<void> {
  try {
    const r = await api.auctions();
    auction.open = r.open;
    auction.recent = r.recent;
    auction.loaded = true;
  } catch {
    /* best-effort */
  }
}

export function resetAuctions(): void {
  auction.open = [];
  auction.recent = [];
  auction.loaded = false;
}

/** List one of my emoji for auction. Escrows it out of my inventory on success. */
export async function createAuction(
  code: string,
  startPrice: number,
  hours: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auction: a } = await api.createAuction(code, startPrice, hours);
    place(a);
    await refreshOwned(); // the emoji left my inventory into escrow
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** List a DUPLICATE RELIC for auction — the sanctioned relic→silver path (Voss
 *  pays only Research Credits). The locker row is the escrow, so the caller
 *  should reload its relic list on success. */
export async function createRelicAuction(
  relicItemId: number,
  startPrice: number,
  hours: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auction: a } = await api.createRelicAuction(relicItemId, startPrice, hours);
    place(a);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Bid silver on an auction. Coins are escrowed immediately (server-authoritative). */
export async function bidAuction(
  id: number,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auction: a, coins } = await api.bidAuction(id, amount);
    wallet.coins = coins;
    place(a);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Pull my own listing (only while open + bid-free). Returns the emoji to me. */
export async function cancelAuction(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auction: a } = await api.cancelAuction(id);
    place(a);
    await refreshOwned(); // the escrowed emoji came back
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

/** Dispatch an incoming `auction.*` socket frame (called from chat.svelte.ts). */
export function handleAuctionEvent(msg: any): void {
  const a: Auction | undefined = msg.auction;
  if (!a) return;
  const me = session.user?.id;
  const wasHigh = auction.open.find((x) => x.id === a.id)?.highBidder?.id === me;
  place(a);
  // Coins are private, so a bid/close never carries my new balance — resync it
  // whenever an event could have moved my silver or inventory.
  const involvesMe = me != null && (a.seller.id === me || a.highBidder?.id === me || wasHigh);
  // The hammer falls: heard by the parties wherever they are, and softly by
  // anyone browsing the Market when a lot closes.
  if (msg.type === "auction.close") {
    if (involvesMe) playSfx("gavel", 0.6);
    else if (nav.view === "market") playSfx("gavel", 0.35);
  }
  if (involvesMe) {
    void loadWallet();
    if (msg.type === "auction.close") void refreshOwned();
  }
}

// ---- internals ----

/** Idempotently file an auction: open ones sorted by soonest end, closed ones
 *  head the recent tail. */
function place(a: Auction): void {
  auction.open = auction.open.filter((x) => x.id !== a.id);
  auction.recent = auction.recent.filter((x) => x.id !== a.id);
  if (a.status === "open") {
    auction.open = [...auction.open, a].sort((x, y) => x.endsAt - y.endsAt);
  } else {
    auction.recent = [a, ...auction.recent].slice(0, 12);
  }
}
