// Emoji Derby client state. Public room like roulette; the race broadcast
// carries the winner + a seed from the gun, and every client renders the
// same deterministic race — the wallet-spoiler rule holds: results (and the
// wallet) only land when the runners cross the line.

import { api, type DerbyState } from "./api";
import { wallet } from "./wallet.svelte";
import { noteServerClock, raceRevealAt, serverTime } from "./derby-run";

export const derby = $state<{
  state: DerbyState | null;
  mine: Record<string, number>;
  loaded: boolean;
  /** True once this race's animation has crossed the line. */
  revealed: boolean;
}>({ state: null, mine: {}, loaded: false, revealed: false });

let revealTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadDerby(): Promise<void> {
  try {
    const r = await api.derbyStatus();
    applyState(r.state);
    derby.mine = r.mine;
    wallet.coins = r.coins;
    derby.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** Back a runner. The response balance is post-debit only — safe to apply. */
export async function placeDerbyBet(racer: string, amount: number): Promise<void> {
  const r = await api.derbyBet(racer, amount);
  applyState(r.state);
  derby.mine = r.mine;
  wallet.coins = r.coins;
}

/** Tear up my ticket while the window's open — full refund. */
export async function cancelDerbyBet(): Promise<void> {
  const r = await api.derbyCancel();
  applyState(r.state);
  derby.mine = r.mine;
  wallet.coins = r.coins;
}

export function handleDerbyEvent(state: DerbyState): void {
  applyState(state);
}

function applyState(state: DerbyState): void {
  const prev = derby.state;
  noteServerClock(state.serverNow);
  derby.state = state;
  // Only ticket-holders need the wallet refetch at the line — `mine` holds
  // my tickets locally until the next idle, so it's a reliable involvement
  // signal even though the server's escrow rows are gone by now.
  const involved = () => Object.keys(derby.mine).length > 0;
  // DERBY v2: the result shows when the LAST runner is home on the shared
  // race clock — not when this browser's clock says the server's phase is up
  // (a slow clock revealed the winner before their lane crossed), and not
  // while 4th to 6th are still running (it stripped their dust mid-stride).
  // The same moment for the race that's just started and for one this screen
  // joined late or found already settled.
  const raceKey = (s: DerbyState | null) => (s ? `${s.round}:${s.seed}` : "");
  if ((state.phase === "racing" || state.phase === "settled") && state.seed) {
    if (raceKey(prev) !== raceKey(state) || (prev?.phase !== "racing" && prev?.phase !== "settled")) {
      derby.revealed = false;
      if (revealTimer) clearTimeout(revealTimer);
      const wait = Math.max(0, raceRevealAt(state) - serverTime());
      revealTimer = setTimeout(() => {
        revealTimer = null;
        derby.revealed = true;
        if (involved()) void api.derbyStatus().then((r) => (wallet.coins = r.coins)).catch(() => {});
      }, wait);
    }
  } else {
    derby.revealed = false;
    if (state.phase === "idle") derby.mine = {};
  }
}

export function resetDerby(): void {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
  derby.state = null;
  derby.mine = {};
  derby.loaded = false;
  derby.revealed = false;
}
