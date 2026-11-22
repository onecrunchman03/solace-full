// Graveyard state: the graves + live respects arriving over the shared socket.

import { api, type Grave, type Monument } from "./api";

export const graveyard = $state<{
  graves: Grave[];
  /** Lives that ran out their wake and sealed — permanent monuments. */
  lives: Monument[];
  raisePrice: number;
  candlePrice: number;
  flowersPrice: number;
  maxEulogy: number;
  /** The Necrology — the morbid ledger at the gate (aggregates only). */
  necrology: Record<string, number>;
  /** serverNow − Date.now() at load: tribute decay states derive from the
   *  SERVER's clock, so a wrong browser clock can't wilt fresh flowers. */
  clockSkew: number;
  loading: boolean;
}>({
  graves: [],
  lives: [],
  raisePrice: 10_000,
  candlePrice: 25,
  flowersPrice: 100,
  maxEulogy: 200,
  necrology: {},
  clockSkew: 0,
  loading: true,
});

export async function loadGraveyard(): Promise<void> {
  try {
    const r = await api.graveyard();
    graveyard.graves = r.graves;
    graveyard.lives = r.lives ?? [];
    graveyard.raisePrice = r.raisePrice ?? graveyard.raisePrice;
    graveyard.candlePrice = r.candlePrice ?? graveyard.candlePrice;
    graveyard.flowersPrice = r.flowersPrice ?? graveyard.flowersPrice;
    graveyard.maxEulogy = r.maxEulogy ?? graveyard.maxEulogy;
    graveyard.necrology = r.necrology ?? {};
    if (typeof r.now === "number") graveyard.clockSkew = r.now - Date.now();
  } catch {
    // best-effort — a failed load must not become an unhandled rejection
    // (the client error reporter would file it as a crash)
  } finally {
    graveyard.loading = false;
  }
}

/** Apply one respect toggle (mine locally, or anyone's via broadcast). */
export function applyGraveRespect(deadUserId: number, userId: number, code: string, added: boolean): void {
  const g = graveyard.graves.find((x) => x.user.id === deadUserId);
  if (!g) return;
  let entry = g.respects.find((r) => r.code === code);
  if (added) {
    if (!entry) {
      entry = { code, userIds: [] };
      g.respects.push(entry);
    }
    if (!entry.userIds.includes(userId)) entry.userIds.push(userId);
  } else if (entry) {
    entry.userIds = entry.userIds.filter((id) => id !== userId);
    g.respects = g.respects.filter((r) => r.userIds.length > 0);
  }
  graveyard.graves = [...graveyard.graves];
}

/** A grave.respect or grave.tribute frame arrived over the socket. */
export function handleGraveEvent(msg: {
  type: string;
  deadUserId: number;
  userId?: number;
  code?: string;
  added?: boolean;
  byUserId?: number;
  kind?: string;
  at?: number;
}): void {
  if (msg.type === "grave.respect") {
    applyGraveRespect(msg.deadUserId, msg.userId!, msg.code!, msg.added!);
    return;
  }
  if (msg.type === "grave.tribute") {
    const g = graveyard.graves.find((x) => x.user.id === msg.deadUserId);
    if (!g || msg.byUserId == null || !msg.kind || msg.at == null) return;
    g.tributes = [...g.tributes, { kind: msg.kind, byUserId: msg.byUserId, at: msg.at }];
    graveyard.graves = [...graveyard.graves];
  }
}

export function resetGraveyard(): void {
  graveyard.graves = [];
  graveyard.lives = [];
  graveyard.loading = true;
}

/** Somebody came back out of a fresh grave, or a grave sealed into a rebirth.
 *  Either way the ground has changed — reload rather than trying to patch it,
 *  since a sealing moves a grave into the monuments and rewrites a wallet. */
export function handleGraveLifecycle(msg: { type: string }): void {
  if (msg.type !== "grave.raised" && msg.type !== "grave.sealed") return;
  void loadGraveyard();
}
