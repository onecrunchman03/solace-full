// Spectator side-bet state: live pool aggregates per game (broadcast) and
// settlement handling (resync my wallet if silver may have moved my way).

import { loadWallet } from "./wallet.svelte";

export const sidebets = $state<{
  /** `${kind}:${gameId}` → onUserId → pooled silver. */
  pools: Record<string, Record<number, number>>;
  /** Last settlement per game key (for the panel's result line). */
  settled: Record<string, { refunded: boolean; pool: number; rake: number }>;
}>({ pools: {}, settled: {} });

export function poolKey(kind: string, gameId: string): string {
  return `${kind}:${gameId}`;
}

// Games I actually bet on this session — the settle broadcast carries only
// pooled aggregates, so this is what decides whether MY wallet needs a
// refetch (every client fetching on every settle was spectator overhead).
const myBetKeys = new Set<string>();
export function markMySideBet(kind: string, gameId: string): void {
  myBetKeys.add(poolKey(kind, gameId));
}

export function handleSidebetEvent(msg: {
  type: string;
  kind?: string;
  gameId?: string;
  pools?: Record<number, number>;
  refunded?: boolean;
  pool?: number;
  rake?: number;
}): void {
  if (!msg.kind || !msg.gameId) return;
  const key = poolKey(msg.kind, msg.gameId);
  if (msg.type === "sidebet.change" && msg.pools) {
    sidebets.pools = { ...sidebets.pools, [key]: msg.pools };
  } else if (msg.type === "sidebet.settled") {
    sidebets.settled = {
      ...sidebets.settled,
      [key]: { refunded: msg.refunded ?? false, pool: msg.pool ?? 0, rake: msg.rake ?? 0 },
    };
    delete sidebets.pools[key];
    if (myBetKeys.delete(key)) {
      void loadWallet(); // my payout/refund may have landed
    }
  }
}

export function resetSidebets(): void {
  sidebets.pools = {};
  sidebets.settled = {};
  myBetKeys.clear();
}
