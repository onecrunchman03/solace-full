// Craps client state. One public table: full state rides every `craps.state`
// broadcast. The no-spoiler rule applies — the throw broadcast carries the
// dice (and the post-roll table) immediately, but the UI keeps showing the
// PRE-roll felt while the dice tumble, revealing the result + resyncing the
// wallet only when the animation lands.

import { api, type CrapsState } from "./api";
import { wallet } from "./wallet.svelte";
import { session } from "./session.svelte";

/** Did I have chips on this state's felt? Only involved clients refetch the
 *  wallet after a roll — with a roll every ~20s, every-client refetches were
 *  a full-population GET stampede for pure spectators. */
function myBetIn(s: CrapsState | null): boolean {
  return !!s?.bets?.some((b) => b.user?.id === session.user?.id);
}
let involvedThisRoll = false;

export const craps = $state<{
  state: CrapsState | null;
  loaded: boolean;
  /** True once the current throw's animation has landed (result showable). */
  revealed: boolean;
  /** Frozen pre-roll display (point + my felt) while the dice tumble. */
  frozen: { point: number | null; phase: "comeout" | "point" } | null;
}>({ state: null, loaded: false, revealed: true, frozen: null });

let revealTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadCraps(): Promise<void> {
  try {
    const r = await api.crapsStatus();
    applyState(r.state);
    wallet.coins = r.coins;
    craps.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** Place a bet. The response balance is post-debit only, safe to show. */
export async function placeCrapsBet(kind: string, num: number | null, amount: number): Promise<void> {
  const r = await api.crapsBet(kind, num, amount);
  applyState(r.state);
  wallet.coins = r.coins;
}

/** Take a bet down (full refund; the pass line is locked once a point is on). */
export async function takeDownCrapsBet(kind: string, num: number | null): Promise<void> {
  const r = await api.crapsTakeDown(kind, num);
  applyState(r.state);
  wallet.coins = r.coins;
}

/** Throw the dice (shooter only; the table also auto-rolls on a clock). */
export async function rollCraps(): Promise<void> {
  const r = await api.crapsRoll();
  applyState(r.state);
}

export function handleCrapsEvent(state: CrapsState): void {
  applyState(state);
}

function applyState(state: CrapsState): void {
  const prev = craps.state;
  craps.state = state;

  if (state.phase === "rolling") {
    if (prev?.phase !== "rolling") {
      // Freeze the pre-roll picture: the broadcast already carries the
      // POST-roll point/bets, but the table shouldn't give it away until the
      // dice stop moving.
      const prevPoint = state.outcome?.prevPoint ?? prev?.point ?? null;
      craps.frozen = { point: prevPoint, phase: prevPoint !== null ? "point" : "comeout" };
      // Pre-roll bets live on `prev`; resolved bets are already gone from the
      // post-roll broadcast — check both sides of the throw.
      involvedThisRoll = myBetIn(prev) || myBetIn(state);
      craps.revealed = false;
      if (revealTimer) clearTimeout(revealTimer);
      const wait = Math.max(0, (state.rollEndsAt ?? Date.now()) - Date.now());
      revealTimer = setTimeout(() => {
        craps.revealed = true;
        craps.frozen = null;
        if (involvedThisRoll) void api.crapsStatus().then((r) => (wallet.coins = r.coins)).catch(() => {});
      }, wait);
    }
  } else {
    // Any settled/idle/betting state: if our animation timer hasn't fired
    // (lag, hidden tab), reveal now — the roll is public anyway.
    if (!craps.revealed) {
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = null;
      craps.revealed = true;
      craps.frozen = null;
      if (involvedThisRoll) void api.crapsStatus().then((r) => (wallet.coins = r.coins)).catch(() => {});
    }
  }
}

export function resetCraps(): void {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
  craps.state = null;
  craps.loaded = false;
  craps.revealed = true;
  craps.frozen = null;
}
