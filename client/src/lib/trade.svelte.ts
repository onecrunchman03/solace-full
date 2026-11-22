// Direct-trade (barter) state. Offers arrive over the shared WebSocket but are
// delivered only to the two parties (recipient-scoped, like DMs).

import { api, ApiError, type Trade } from "./api";
import { session } from "./session.svelte";
import { refreshOwned } from "./emoji.svelte";

export const trade = $state<{ incoming: Trade[]; outgoing: Trade[] }>({
  incoming: [],
  outgoing: [],
});

// Which user a compose flow should target (set from a profile's Trade button).
export const tradeUI = $state<{ composeWith: number | null }>({ composeWith: null });
export function startTradeWith(userId: number): void {
  tradeUI.composeWith = userId;
}

export async function loadTrades(): Promise<void> {
  try {
    const r = await api.trades();
    trade.incoming = r.incoming;
    trade.outgoing = r.outgoing;
  } catch {
    /* best-effort */
  }
}

export function resetTrades(): void {
  trade.incoming = [];
  trade.outgoing = [];
  tradeUI.composeWith = null;
}

export async function createTrade(
  toUser: number,
  offered: string[],
  requested: string[],
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { trade: t } = await api.createTrade(toUser, offered, requested, note);
    place(t); // the socket will also deliver it; place() de-dupes by id
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

export async function acceptTrade(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { trade: t } = await api.acceptTrade(id);
    place(t);
    await refreshOwned(); // I gained/lost emoji
    return { ok: true };
  } catch (e) {
    // On a 409 the server already voided it; the socket delivers the update.
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

export async function declineTrade(id: number): Promise<void> {
  try {
    const { trade: t } = await api.declineTrade(id);
    place(t);
  } catch {
    await loadTrades();
  }
}

export async function cancelTrade(id: number): Promise<void> {
  try {
    const { trade: t } = await api.cancelTrade(id);
    place(t);
  } catch {
    await loadTrades();
  }
}

/** Dispatch an incoming `trade.*` socket frame (called from chat.svelte.ts). */
export function handleTradeEvent(msg: any): void {
  const t: Trade | undefined = msg.trade;
  if (!t) return;
  place(t);
  if (msg.type === "trade.update" && t.status === "accepted") {
    const me = session.user?.id;
    if (me === t.fromUser.id || me === t.toUser.id) void refreshOwned();
  }
}

// ---- internals ----

/** Idempotently file a trade: drop it from both lists, re-add if still pending. */
function place(t: Trade): void {
  trade.incoming = trade.incoming.filter((x) => x.id !== t.id);
  trade.outgoing = trade.outgoing.filter((x) => x.id !== t.id);
  if (t.status === "pending") {
    if (t.toUser.id === session.user?.id) trade.incoming = [t, ...trade.incoming];
    else trade.outgoing = [t, ...trade.outgoing];
  }
}
