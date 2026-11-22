// Bone Pit state: public table state rides pit.state broadcasts; MY dice
// arrive only on my sockets via pit.dice (the server never broadcasts cups).

import { api, ApiError, type PitState, type PitGame } from "./api";
import { wallet, loadWallet } from "./wallet.svelte";
import { session } from "./session.svelte";
import { refreshOwned } from "./emoji.svelte";

export const pit = $state<{
  games: PitGame[];
  /** My cup for the game I'm playing (gameId → dice). */
  dice: number[];
  diceGameId: string | null;
  minStake: number;
  maxStake: number;
  loading: boolean;
  error: string;
}>({
  games: [],
  dice: [],
  diceGameId: null,
  minStake: 10,
  maxStake: 100_000,
  loading: true,
  error: "",
});

/** The table I'm seated at (any phase), if any. */
export function myGame(): PitGame | null {
  const me = session.user?.id;
  if (me == null) return null;
  return pit.games.find((g) => g.phase !== "done" && g.players.some((p) => p.user?.id === me))
    ?? pit.games.find((g) => g.players.some((p) => p.user?.id === me))
    ?? null;
}

export async function loadPit(): Promise<void> {
  try {
    const r = await api.pit();
    pit.games = r.state.games;
    pit.minStake = r.minStake;
    pit.maxStake = r.maxStake;
    wallet.coins = r.coins;
    if (r.myDice) {
      pit.dice = r.myDice.dice;
      pit.diceGameId = r.myDice.gameId;
    }
  } catch {
    /* view retries on next open */
  } finally {
    pit.loading = false;
  }
}

export function handlePitEvent(msg: { type: string; state?: PitState; gameId?: string; dice?: number[] }): void {
  if (msg.type === "pit.state" && msg.state) {
    // A game I was playing just FINISHED → my silver moved (pot or refund).
    // Coins never ride the broadcast, so resync the wallet (the Phase-22
    // stale-owned rule; before this, a Pit win was invisible app-wide until
    // some unrelated view happened to reload the wallet).
    const me = session.user?.id;
    if (me != null) {
      for (const g of msg.state.games) {
        if (g.phase !== "done") continue;
        const wasMyLiveGame = pit.games.some(
          (old) => old.id === g.id && old.phase !== "done" && old.players.some((p) => p.user?.id === me),
        );
        if (!wasMyLiveGame) continue;
        void loadWallet();
        // (The weekly mythic crown was retired in Aug 2026 — a Pit win is
        // silver only now, so there is no inventory change to resync.)
      }
    }
    pit.games = msg.state.games;
    // My cup is only valid while my game is still playing.
    if (pit.diceGameId && !msg.state.games.some((g) => g.id === pit.diceGameId && g.phase === "playing")) {
      pit.dice = [];
      pit.diceGameId = null;
    }
  } else if (msg.type === "pit.dice" && msg.gameId && msg.dice) {
    pit.dice = msg.dice;
    pit.diceGameId = msg.gameId;
  }
}

function fail(e: unknown): void {
  pit.error =
    e instanceof ApiError && e.code === "insufficient" ? "Not enough silver for that stake."
    : e instanceof ApiError && e.code === "already_seated" ? "You're already at a table."
    : e instanceof ApiError && e.code === "must_raise" ? "You have to raise — higher count, or same count and higher face."
    : e instanceof ApiError && e.code === "not_your_turn" ? "Not your turn."
    : e instanceof ApiError && e.code === "need_players" ? "You need at least one opponent."
    : "That didn't work.";
}

async function act(fn: () => Promise<object>): Promise<boolean> {
  pit.error = "";
  try {
    const r = (await fn()) as { coins?: number };
    if (typeof r.coins === "number") wallet.coins = r.coins;
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

export const createTable = (stake: number) => act(() => api.pitCreate(stake));
export const joinTable = (id: string) => act(() => api.pitJoin(id));
export const leaveTable = (id: string) => act(() => api.pitLeave(id));
export const startTable = (id: string) => act(() => api.pitStart(id));
export const placeBid = (id: string, count: number, face: number) => act(() => api.pitBid(id, count, face));
export const callLiar = (id: string) => act(() => api.pitLiar(id));

export function resetPit(): void {
  pit.games = [];
  pit.dice = [];
  pit.diceGameId = null;
  pit.loading = true;
  pit.error = "";
}
