// Hold'em client state. The lobby is a public room (full sanitized state on
// every `holdem.state` broadcast); MY hole cards arrive on recipient-scoped
// `holdem.cards` frames only — the server never puts a live hand on the
// public wire. Refresh recovery: GET /api/holdem returns `mine`.

import { api, ApiError, type HoldemLobby, type HoldemMine, type HoldemSeat, type HoldemTable } from "./api";
import { wallet } from "./wallet.svelte";

export const holdem = $state<{
  lobby: HoldemLobby | null;
  mine: HoldemMine | null;
  loaded: boolean;
}>({ lobby: null, mine: null, loaded: false });

export async function loadHoldem(): Promise<void> {
  try {
    const r = await api.holdemStatus();
    holdem.lobby = r.lobby;
    holdem.mine = r.mine;
    wallet.coins = r.coins;
    holdem.loaded = true;
  } catch {
    /* best-effort */
  }
}

export async function sitHoldem(tableId: number, seat: number, buyIn: number): Promise<void> {
  const r = await api.holdemSit(tableId, seat, buyIn);
  holdem.lobby = r.lobby;
  wallet.coins = r.coins;
}

export async function leaveHoldem(tableId: number): Promise<void> {
  const r = await api.holdemLeave(tableId);
  holdem.lobby = r.lobby;
  holdem.mine = null;
  wallet.coins = r.coins;
}

export async function actHoldem(tableId: number, action: string, amount: number | null = null): Promise<void> {
  const r = await api.holdemAction(tableId, action, amount);
  holdem.lobby = r.lobby;
}

export function handleHoldemState(lobby: HoldemLobby): void {
  holdem.lobby = lobby;
  // A fresh hand id invalidates stale hole cards from the last hand.
  if (holdem.mine) {
    const t = lobby.tables.find((x) => x.id === holdem.mine!.tableId);
    if (!t || (t.handId !== holdem.mine.handId && t.phase !== "waiting")) {
      if (t && t.handId > holdem.mine.handId) holdem.mine = null;
    }
  }
}

export function handleHoldemCards(payload: HoldemMine): void {
  holdem.mine = payload;
}

export function resetHoldem(): void {
  holdem.lobby = null;
  holdem.mine = null;
  holdem.loaded = false;
}

// ---- Shared rules for both tables (the 2D hub and the casino floor's strip) --

export const LIVE_PHASES = ["preflop", "flop", "turn", "river"] as const;

/** A hand is being played and this seat is still in it (not folded). */
export function inLiveHand(t: HoldemTable | null, s: HoldemSeat | null): boolean {
  return !!t && !!s && !s.folded && (LIVE_PHASES as readonly string[]).includes(t.phase);
}

/** The raise box's legal range for the acting seat. `can` is the SERVER's own
 *  rule (a short all-in never reopens action; there must be chips beyond the
 *  current bet), so neither client offers a raise the engine would refuse. */
export function raiseBounds(t: HoldemTable, s: HoldemSeat): { allInTo: number; minTo: number; can: boolean } {
  const allInTo = s.stack + s.bet;
  const minTo = Math.min(t.minRaiseTo, allInTo);
  const can = !!s.canRaise && allInTo > t.currentBet;
  return { allInTo, minTo, can };
}

/** A typed raise, made legal: floored, never below the minimum, never above
 *  everything you have. A blank or junk box reads as the minimum. */
export function clampRaise(v: unknown, minTo: number, allInTo: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return minTo;
  return Math.max(minTo, Math.min(allInTo, n));
}

/** The pot-sized raise: call first, then raise by what the pot then holds.
 *  `t.pot` already counts this street's bets, so raise-TO = the current bet
 *  plus the pot plus your call. */
export function potRaiseTo(t: HoldemTable, s: HoldemSeat): number {
  const { allInTo, minTo } = raiseBounds(t, s);
  const toCall = Math.max(0, Math.min(t.currentBet - s.bet, s.stack));
  return clampRaise(t.currentBet + t.pot + toCall, minTo, allInTo);
}

/** What went wrong, in words — one mapping for both tables. */
export function holdemErrorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "";
  switch (code) {
    case "insufficient": return "Not enough silver for that buy-in.";
    case "seat_taken": return "Someone beat you to the chair.";
    case "already_seated": return "You're already at a table.";
    case "bad_buyin": return "Buy-in outside the table's range.";
    case "bad_seat": return "That chair doesn't exist.";
    case "not_your_turn": return "Not your turn.";
    case "bad_amount": return "Illegal raise size.";
    case "bad_action": return "You can't do that right now.";
    case "not_seated": return "You're not at that table.";
    case "no_table": return "That table is gone.";
    case "rate_limited": return "Slow down a moment.";
    default: return "Couldn't do that.";
  }
}
