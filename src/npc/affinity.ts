// THE AFFINITY METER (Josh, Oct 2026, migration 107): how well each of the
// three knows a player. Josh: "an affinity meter with the npcs and the users.
// this is increased through interaction, doing objectives, selling things,
// winning big, etc." — decided with him:
//   · one meter per (player, character), 0..100, four tiers;
//   · TRUSTED (the top tier) is what unlocks a character's confidences —
//     Sterling's real opinion of the Foundry, the goblins' "special offer",
//     Dr. Voss's research. It replaced the notes + days + messages rule;
//   · every source has a DAILY CAP, so nobody chats their way to the top;
//   · the GOBLINS' meter falls 10 a missed day (THE TURN — they love you
//     until you're late); nothing else ever takes points away, except
//   · a slow fade: after 14 days with no gain, 1 a day, never below the
//     floor of the tier you reached;
//   · dialogue and the Trusted unlocks ONLY — no silver, no discounts. The
//     Wheel stays the only faucet.
// The house doesn't play: admins and bots have no meter.
//
// Pure rules at the top (no imports beyond types), the keeper below.

import type { Store } from "../db/store";
import type { Bus } from "../bus";
import type { User } from "../types";
import { config } from "../config";

export type AffinityNpc = "sterling" | "goblins" | "voss";
export const AFFINITY_NPCS: AffinityNpc[] = ["sterling", "goblins", "voss"];
/** Rollo (the casino-floor test NPC) has no meter. */
export const isAffinityNpc = (n: string): n is AffinityNpc => (AFFINITY_NPCS as string[]).includes(n);

export const AFFINITY_MAX = 100;
export const TIERS = [
  { min: 0, name: "Stranger" },
  { min: 20, name: "Acquainted" },
  { min: 45, name: "Regular" },
  { min: 75, name: "Trusted" },
] as const;
export const TRUSTED_TIER = 3;
export const IDLE_DAYS = 14;
export const MISSED_DAY_PENALTY = 10;
/** A table win this size or bigger is "winning big" (store.maxStat hook). */
export const BIG_WIN = 5_000;

/** What earns what, and how much of it a day. */
export const SOURCES: Record<AffinityNpc, Record<string, { points: number; cap: number; label: string }>> = {
  sterling: {
    chat: { points: 1, cap: 3, label: "talking with him" },
    sell: { points: 1, cap: 3, label: "selling emoji at the Trader" },
    buy: { points: 1, cap: 2, label: "buying at his counters" },
    wheel: { points: 3, cap: 6, label: "a legendary or mythic on the Wheel" },
    bigwin: { points: 2, cap: 4, label: "winning big at a table" },
    lottery: { points: 5, cap: 5, label: "winning the lottery" },
    mourn: { points: 1, cap: 1, label: "honouring the dead" },
  },
  voss: {
    chat: { points: 1, cap: 3, label: "talking with her" },
    sell: { points: 2, cap: 6, label: "bringing her findings" },
    buy: { points: 1, cap: 2, label: "buying kit" },
    relic: { points: 3, cap: 9, label: "logging a new relic" },
    drive: { points: 4, cap: 8, label: "reading a data drive" },
    door: { points: 8, cap: 16, label: "opening the way down" },
    alive: { points: 1, cap: 2, label: "coming back alive" },
  },
  goblins: {
    chat: { points: 1, cap: 3, label: "talking business" },
    borrow: { points: 3, cap: 3, label: "taking a loan" },
    pay: { points: 2, cap: 4, label: "making a payment" },
    clear: { points: 8, cap: 8, label: "clearing a loan" },
    shelf: { points: 2, cap: 4, label: "buying off the repo shelf" },
    bail: { points: 3, cap: 6, label: "paying someone's bail" },
  },
};

export function tierOf(points: number): number {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (points >= TIERS[i].min) t = i;
  return t;
}

/** The fade, applied lazily wherever the meter is read: after IDLE_DAYS with
 *  no gain, one point a day — never below the floor of the tier reached. */
export function decayed(points: number, lastGainAt: number, now: number): number {
  const idle = Math.floor((now - lastGainAt) / 86_400_000) - IDLE_DAYS;
  if (idle <= 0) return points;
  return Math.max(TIERS[tierOf(points)].min, points - idle);
}

/** The UTC day a cap is counted against. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface AffinityView {
  npc: AffinityNpc;
  points: number;
  tier: number;
  tierName: string;
  /** Points to the next tier, or null at the top. */
  next: number | null;
}

export function view(npc: AffinityNpc, points: number): AffinityView {
  const tier = tierOf(points);
  return { npc, points, tier, tierName: TIERS[tier].name, next: tier + 1 < TIERS.length ? TIERS[tier + 1].min - points : null };
}

/** The house doesn't play. */
export function hasMeter(u: Pick<User, "isAdmin" | "isBot"> | null | undefined): boolean {
  return !!u && !u.isAdmin && !u.isBot;
}

// ---------------------------------------------------------------------------
// THE KEEPER — the only writer of the meter.

export class AffinityKeeper {
  private prunedDay = "";
  constructor(private store: Store, private bus: Bus) {}

  /** One player's meter with one character, fade applied. */
  points(userId: number, npc: AffinityNpc, now = Date.now()): number {
    const r = this.store.npcAffinityRow(userId, npc);
    return r ? decayed(r.points, r.lastGainAt, now) : 0;
  }

  tier(userId: number, npc: AffinityNpc, now = Date.now()): number {
    return tierOf(this.points(userId, npc, now));
  }

  all(userId: number, now = Date.now()): AffinityView[] {
    return AFFINITY_NPCS.map((npc) => view(npc, this.points(userId, npc, now)));
  }

  /** Award a source, inside its daily cap. Returns the points granted. */
  award(userId: number, npc: AffinityNpc, source: string, now = Date.now()): number {
    // (archived with the house's AI, config.npcHouseAi: the meter only ever changed how the model spoke and what it
    // confided, so with the model gone it stops where it stands — kept, not earned, not lost)
    if (!config.npcHouseAi) return 0;
    const rule = SOURCES[npc][source];
    if (!rule) return 0;
    // Yesterday's caps are history: prune them once a day, on the first award.
    const today = dayKey(now);
    if (today !== this.prunedDay) {
      this.prunedDay = today;
      this.store.npcAffinityPruneDays(dayKey(now - 86_400_000));
    }
    const u = this.store.getUserById(userId);
    if (!hasMeter(u) || u!.disabled || u!.deletedAt != null) return 0;
    const granted = this.store.npcAffinityDayClaim(userId, npc, source, dayKey(now), rule.points, rule.cap);
    if (granted <= 0) return 0;
    const before = this.points(userId, npc, now);
    const after = Math.min(AFFINITY_MAX, before + granted);
    this.store.npcAffinityWrite(userId, npc, after, now);
    if (tierOf(after) > tierOf(before)) this.bus.emit("npc.affinity", { userId, npc, tier: tierOf(after), tierName: TIERS[tierOf(after)].name, up: true });
    return after - before;
  }

  /** The goblins' turn: a missed day costs MISSED_DAY_PENALTY. */
  penalize(userId: number, npc: AffinityNpc, by: number, now = Date.now()): void {
    if (!config.npcHouseAi) return;
    const u = this.store.getUserById(userId);
    if (!hasMeter(u) || by <= 0) return;
    const before = this.points(userId, npc, now);
    if (before <= 0) return;
    // The fade's clock is about GAINS, so a penalty keeps the old stamp — and
    // comes off the RAW stored points (Oct 2026 review): writing the faded
    // value back under the old stamp let the fade be counted a second time.
    const r = this.store.npcAffinityRow(userId, npc);
    const stamp = r?.lastGainAt ?? now;
    const raw = Math.max(0, (r?.points ?? 0) - by);
    this.store.npcAffinityWrite(userId, npc, raw, stamp);
    const after = decayed(raw, stamp, now);
    if (tierOf(after) < tierOf(before)) this.bus.emit("npc.affinity", { userId, npc, tier: tierOf(after), tierName: TIERS[tierOf(after)].name, up: false });
  }

  /** The admin lever (testing): set a meter outright. */
  set(userId: number, npc: AffinityNpc, points: number, now = Date.now()): void {
    this.store.npcAffinityWrite(userId, npc, Math.max(0, Math.min(AFFINITY_MAX, Math.round(points))), now);
  }
}

/** Every successful request that earns affinity, by route — the router's
 *  after-hook (http.ts) looks the route up here. Only a 2xx counts, and the
 *  route already enforced everything a purchase or a payment has to be. */
export const ROUTE_SOURCES: Record<string, [AffinityNpc, string]> = {
  "POST /api/shop/sell": ["sterling", "sell"],
  "POST /api/shop/buy": ["sterling", "buy"],
  "POST /api/shop/buy-spins": ["sterling", "buy"],
  "POST /api/shop/talisman": ["sterling", "buy"],
  "POST /api/shop/talisman-silver": ["sterling", "buy"],
  "POST /api/shop/mythic": ["sterling", "buy"],
  "POST /api/emporium/buy": ["sterling", "buy"],
  "POST /api/graveyard/:userId/tribute": ["sterling", "mourn"],
  "POST /api/backrooms/sellitem": ["voss", "sell"],
  "POST /api/backrooms/buy": ["voss", "buy"],
  "POST /api/backrooms/kit": ["voss", "buy"],
  "POST /api/lender/borrow": ["goblins", "borrow"],
  "POST /api/lender/pay": ["goblins", "pay"],
  "POST /api/lender/pay/:userId": ["goblins", "pay"],
  "POST /api/lender/bail/:userId": ["goblins", "bail"],
  "POST /api/lender/pot/:userId": ["goblins", "bail"],
  "POST /api/lender/shelf/:id/buy": ["goblins", "shelf"],
};
