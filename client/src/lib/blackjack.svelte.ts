// Blackjack client state. The server owns the whole game; this module holds
// the last-broadcast lobby snapshots, tracks which table I'm seated at, and
// resyncs the shared wallet after any round I had money in.

import { api, ApiError, type BjLobby } from "./api";
import { session } from "./session.svelte";
import { loadWallet, wallet } from "./wallet.svelte";

export const bj = $state<{
  lobbies: BjLobby[];
  loading: boolean;
  error: string | null;
  /** Which lobby the player currently has open on screen (null = picker). */
  viewing: number | null;
}>({
  lobbies: [],
  loading: true,
  error: null,
  viewing: null,
});

export async function loadBlackjack(): Promise<void> {
  try {
    bj.lobbies = (await api.blackjack()).lobbies;
  } catch {
    /* view shows a retry state */
  } finally {
    bj.loading = false;
  }
}

/** The lobby I'm seated at, if any (across all tables). */
export function myLobbyIndex(): number | null {
  const me = session.user?.id;
  if (me == null) return null;
  for (const l of bj.lobbies) {
    if (l.seats.some((s) => s && s.user.id === me)) return l.index;
  }
  return null;
}

export function mySeat(l: BjLobby | undefined) {
  const me = session.user?.id;
  if (!l || me == null) return null;
  return l.seats.find((s) => s && s.user.id === me) ?? null;
}

const ERRORS: Record<string, string> = {
  insufficient: "Not enough silver.",
  table_full: "That table is full.",
  seated_elsewhere: "You're already seated at another table.",
  already_bet: "Your bet is already down.",
  round_in_progress: "Wait for the next round to bet.",
  not_your_turn: "It isn't your turn.",
  cant_double: "You can only double on your first two cards.",
  bad_bet: "That bet is outside the table limits.",
};

function fail(e: unknown): void {
  bj.error = e instanceof ApiError ? (ERRORS[e.code] ?? "That didn't work.") : "That didn't work.";
  setTimeout(() => (bj.error = null), 3000);
}

export async function joinTable(lobby: number): Promise<void> {
  try {
    await api.bjJoin(lobby);
    bj.viewing = lobby;
  } catch (e) {
    fail(e);
  }
}

export async function leaveTable(lobby: number): Promise<void> {
  try {
    await api.bjLeave(lobby);
    void loadWallet(); // a refunded bet lands back in the wallet
  } catch (e) {
    fail(e);
  }
}

// Bets/actions set the balance from the server response — the same contract
// the shop/auction endpoints use — so the wallet can never drift from a
// guessed optimistic debit.
export async function placeBet(lobby: number, amount: number): Promise<void> {
  try {
    const r = await api.bjBet(lobby, amount);
    wallet.coins = r.coins;
  } catch (e) {
    fail(e);
  }
}

let acting = false; // a double-tapped Hit on a phone used to be two hits (Sep 2026 review)
export async function act(lobby: number, move: "hit" | "stand" | "double" | "split"): Promise<void> {
  if (acting) return;
  acting = true;
  try {
    const r = await api.bjAction(lobby, move);
    wallet.coins = r.coins;
  } catch (e) {
    fail(e);
  } finally {
    acting = false;
  }
}

/** A bj.state frame arrived over the shared socket. */
export function handleBjEvent(msg: { type: string; lobby: BjLobby }): void {
  if (msg.type !== "bj.state") return;
  const idx = bj.lobbies.findIndex((l) => l.index === msg.lobby.index);
  const prev = idx >= 0 ? bj.lobbies[idx] : null;
  if (idx >= 0) {
    bj.lobbies[idx] = msg.lobby;
    bj.lobbies = [...bj.lobbies];
  } else {
    bj.lobbies = [...bj.lobbies, msg.lobby].sort((a, b) => a.index - b.index);
  }
  // My round just settled → my balance changed server-side; resync the wallet.
  const me = session.user?.id;
  if (
    me != null &&
    msg.lobby.phase === "settle" &&
    prev?.phase !== "settle" &&
    msg.lobby.seats.some((s) => s && s.user.id === me && s.bet > 0)
  ) {
    void loadWallet();
  }
}

export function resetBlackjack(): void {
  bj.lobbies = [];
  bj.loading = true;
  bj.error = null;
  bj.viewing = null;
}
