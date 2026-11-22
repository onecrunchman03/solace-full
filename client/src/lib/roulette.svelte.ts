// Roulette client state. The table is one public room: full state rides every
// `roulette.state` broadcast. The wallet-spoiler rule from Slots applies —
// the spin broadcast carries the pocket immediately, but the UI only reveals
// it (and resyncs the wallet) when the wheel animation lands, so the balance
// chip can never announce the result early.

import { api, type RouletteState } from "./api";
import { wallet } from "./wallet.svelte";
import { session } from "./session.svelte";

/** Did I have chips on this state's felt? (Coins never ride the broadcast,
 *  so only involved clients need the wallet refetch — every client fetching
 *  on every settle was a same-tick stampede for spectators.) */
function myBetIn(s: RouletteState | null): boolean {
  return !!s?.bets?.some((b) => b.user?.id === session.user?.id);
}
let involvedThisSpin = false;

export const roulette = $state<{
  state: RouletteState | null;
  loaded: boolean;
  /** True once the current spin's animation has landed (result showable). */
  revealed: boolean;
}>({ state: null, loaded: false, revealed: false });

let revealTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadRoulette(): Promise<void> {
  try {
    const r = await api.rouletteStatus();
    applyState(r.state);
    wallet.coins = r.coins;
    roulette.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** Place a bet. The response balance is post-debit only (no outcome inside),
 *  so it's safe to apply immediately. Throws ApiError on 400/402/409. */
export async function placeRouletteBet(kind: string, target: number | null, amount: number): Promise<void> {
  const r = await api.rouletteBet(kind, target, amount);
  applyState(r.state);
  wallet.coins = r.coins;
}

/** Take back all my bets this round (misclick escape — full refund). */
export async function clearRouletteBets(): Promise<void> {
  const r = await api.rouletteClear();
  applyState(r.state);
  wallet.coins = r.coins;
}

export function handleRouletteEvent(state: RouletteState): void {
  applyState(state);
}

function applyState(state: RouletteState): void {
  const prev = roulette.state;
  roulette.state = state;

  if (state.phase === "spinning") {
    // A new spin: hide the result until the wheel lands, then reveal + resync
    // the wallet (coins never ride the broadcast — fetch our own).
    if (prev?.phase !== "spinning") {
      involvedThisSpin = myBetIn(state) || myBetIn(prev);
      roulette.revealed = false;
      if (revealTimer) clearTimeout(revealTimer);
      const wait = Math.max(0, (state.endsAt ?? Date.now()) - Date.now());
      revealTimer = setTimeout(() => {
        roulette.revealed = true;
        if (involvedThisSpin) void api.rouletteStatus().then((r) => (wallet.coins = r.coins)).catch(() => {});
      }, wait);
    }
  } else if (state.phase === "settled") {
    // The server moved on; if our animation timer hasn't fired (lag, tab was
    // hidden), reveal now — the table result is public anyway.
    if (!roulette.revealed) {
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = null;
      roulette.revealed = true;
      if (involvedThisSpin) void api.rouletteStatus().then((r) => (wallet.coins = r.coins)).catch(() => {});
    }
  } else {
    roulette.revealed = false;
  }
}

export function resetRoulette(): void {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
  roulette.state = null;
  roulette.loaded = false;
  roulette.revealed = false;
}
