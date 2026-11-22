// Reactive state + actions for Casino Chess Duel. The server owns the rules,
// the clocks, and the stakes; this store mirrors the broadcast state and
// sends intents. Boards are public — spectating is part of the floor.

import { api, ApiError, type ChessState, type ChessStakeSpec } from "./api";
import { session } from "./session.svelte";
import { refreshOwned } from "./emoji.svelte";
import { wallet, loadWallet } from "./wallet.svelte";

export const chessduel = $state<{
  challenges: ChessState["challenges"];
  games: ChessState["games"];
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** Which board is open on screen (id) — null shows the lobby. */
  watching: string | null;
}>({
  challenges: [],
  games: [],
  loading: true,
  busy: false,
  error: null,
  watching: null,
});

export async function loadChess(): Promise<void> {
  try {
    const s = await api.chess();
    chessduel.challenges = s.challenges;
    chessduel.games = s.games;
  } catch {
    // best-effort; the next broadcast will catch us up
  } finally {
    chessduel.loading = false;
  }
}

/** A chess.state broadcast arrived over the socket. */
export function handleChessEvent(msg: { type: string; state: ChessState }): void {
  if (msg.type !== "chess.state") return;
  const before = myStakeFingerprint();
  chessduel.challenges = msg.state.challenges;
  chessduel.games = msg.state.games;
  // If a game of mine just settled (or my challenge vanished), my inventory
  // and/or silver changed server-side — refresh both.
  if (myStakeFingerprint() !== before) {
    void refreshOwned();
    void loadWallet();
  }
}

function myStakeFingerprint(): string {
  const me = session.user?.id;
  if (me == null) return "";
  const c = chessduel.challenges.filter((x) => x.challenger.id === me).map((x) => x.id);
  const g = chessduel.games
    .filter((x) => x.status === "active" && (x.white.id === me || x.black.id === me))
    .map((x) => x.id);
  return [...c, ...g].sort().join("|");
}

/** The active game I'm playing in, if any. */
export function myGame(): ChessState["games"][number] | null {
  const me = session.user?.id;
  if (me == null) return null;
  return (
    chessduel.games.find(
      (g) => g.status === "active" && (g.white.id === me || g.black.id === me),
    ) ?? null
  );
}

export function myChallenge(): ChessState["challenges"][number] | null {
  const me = session.user?.id;
  if (me == null) return null;
  return chessduel.challenges.find((c) => c.challenger.id === me) ?? null;
}

async function run(fn: () => Promise<unknown>): Promise<boolean> {
  if (chessduel.busy) return false;
  chessduel.busy = true;
  chessduel.error = null;
  try {
    await fn();
    return true;
  } catch (err) {
    chessduel.error = err instanceof ApiError ? err.code : "chess_failed";
    return false;
  } finally {
    chessduel.busy = false;
  }
}

export async function postChallenge(stake: ChessStakeSpec, minutes: number): Promise<boolean> {
  const ok = await run(async () => {
    const r = await api.chessChallenge(stake, minutes);
    wallet.coins = r.coins;
  });
  if (ok) void refreshOwned(); // an emoji stake left the inventory
  return ok;
}

export async function cancelChallenge(): Promise<boolean> {
  const ok = await run(async () => {
    const r = await api.chessCancelChallenge();
    wallet.coins = r.coins;
  });
  if (ok) void refreshOwned(); // the stake came home
  return ok;
}

export async function acceptChallenge(challengeId: string, stake: ChessStakeSpec): Promise<boolean> {
  const ok = await run(async () => {
    const r = await api.chessAccept(challengeId, stake);
    chessduel.watching = r.gameId;
    wallet.coins = r.coins;
  });
  if (ok) void refreshOwned();
  return ok;
}

export async function sendMove(gameId: string, from: string, to: string, promotion?: string): Promise<boolean> {
  return run(() => api.chessMove(gameId, from, to, promotion));
}

export async function resignGame(gameId: string): Promise<boolean> {
  return run(() => api.chessResign(gameId));
}

export function resetChess(): void {
  chessduel.challenges = [];
  chessduel.games = [];
  chessduel.loading = true;
  chessduel.busy = false;
  chessduel.error = null;
  chessduel.watching = null;
}
