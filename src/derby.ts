// The Emoji Derby — the casino floor's spectator sport. Six emoji racers,
// pari-mutuel betting with a PODIUM: the pool (after the 5% rake that seeds
// the nightly lottery) pays out across 1st/2nd/3rd — 70/20/10, renormalized
// across the places that actually have backers. No house exposure —
// coin-neutral PvP with a rake, like the Auction.
//
// Rounds are roulette-shaped: the first ticket opens a betting window, then
// the race runs. The winner is drawn server-side WEIGHTED BY FORM (the form
// stars are public, so betting is informed), settled at race start
// (crash-safe), and broadcast with a SEED — every client renders the same
// deterministic race animation and reveals the result only when the runners
// cross the line (the slots no-spoiler rule).
//
// Money safety: derby_bets escrow rows (migration 41), one-txn settle with
// pro-rata split, a refund LESS THE RAKE when nobody backed the podium (v2 —
// see derbySettle), boot refund.

import { randomInt, randomUUID } from "node:crypto";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import type { DerbyStateDTO } from "./types";

export const MIN_BET = 5;
export const MAX_PER_RACER = 500;
const HISTORY = 10;
/** Full results kept for the form guide (app_kv, so a restart keeps them). */
const RESULTS = 20;
const RESULTS_KEY = "derby_results";

const BETTING_MS = Number(process.env.DERBY_BET_MS ?? 45_000);
export const RACE_MS = Number(process.env.DERBY_RACE_MS ?? 14_000);
const SETTLE_MS = Number(process.env.DERBY_SETTLE_MS ?? 9_000);

// The fixed cast (Josh's design): six bespoke runners, each with a signature
// movement style the client animates. Form re-rolls every race — the cast is
// permanent, their condition isn't.
const CAST = [
  { key: "rocket", name: "Major Tom", desc: "Strapped to a rocket. Brakes were extra." },
  { key: "snail", name: "Escargo", desc: "A gentleman and his snail. The slime is load-bearing." },
  { key: "frog", name: "Ribbit-9000", desc: "Hydraulic legs, zero fear. Hops the entire way." },
  { key: "nascar", name: "The Sponsor", desc: "Goes fast, turns left. Covered in decals." },
  { key: "blob", name: "Gerald", desc: "A blob. It rolls. Nobody knows what it wants." },
  { key: "boulder", name: "Old Reliable", desc: "Geology in motion — saves everything for the finish." },
] as const;

interface Racer {
  key: string;
  name: string;
  desc: string;
  /** Public form, 1–5 stars — the win-chance weight everyone can see. */
  form: number;
}

type Phase = DerbyStateDTO["phase"];

export class Derby {
  private phase: Phase = "idle";
  private round = 1;
  private raceId = "";
  private racers: Racer[] = [];
  private endsAt: number | null = null;
  private winner: string | null = null;
  /** Full finish order (form-weighted draw, no replacement) — the client
   *  animates the race to land exactly this podium. */
  private placings: string[] = [];
  private seed = 0;
  private winnersDto: { userId: number; payout: number; place: number }[] = [];
  /** Pools frozen at the gun — settle deletes the escrow rows the live
   *  query reads, but the odds board must keep showing the race's pools. */
  private poolsSnapshot: Record<string, number> = {};
  private history: { name: string; key: string }[] = [];
  private results: { round: number; at: number; placings: string[] }[] = [];
  /** Career wins, read once and kept here (state() runs on every bet). */
  private careerWins: Record<string, number>;
  private startedAt: number | null = null;
  private refunded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: Store,
    private bus: Bus,
  ) {
    // The paddock always shows the next field — bettors need to see the
    // runners (and their form) before the first ticket opens the window.
    this.newField();
    this.careerWins = store.derbyCareerWins();
    try {
      const raw = JSON.parse(store.kvGet(RESULTS_KEY) ?? "[]");
      if (Array.isArray(raw)) this.results = raw.slice(0, RESULTS);
    } catch {
      this.results = [];
    }
    // The history strip reads the same results, so it survives a restart too.
    this.history = this.results.slice(0, HISTORY).map((r) => {
      const c = CAST.find((x) => x.key === r.placings[0]);
      return { name: c?.name ?? r.placings[0], key: r.placings[0] };
    });
  }

  state(): DerbyStateDTO {
    return {
      phase: this.phase,
      round: this.round,
      endsAt: this.endsAt,
      racers: this.racers.map((r) => ({ ...r })),
      pools:
        this.phase === "racing" || this.phase === "settled"
          ? { ...this.poolsSnapshot }
          : this.raceId
            ? this.store.derbyPools(this.raceId)
            : {},
      winner: this.winner,
      placings: [...this.placings],
      seed: this.seed,
      winners: this.winnersDto,
      history: [...this.history],
      careerWins: { ...this.careerWins },
      startedAt: this.startedAt,
      raceMs: RACE_MS,
      serverNow: Date.now(),
      refunded: this.refunded,
      results: this.results.map((r) => ({ ...r, placings: [...r.placings] })),
    };
  }

  private broadcast(): void {
    this.bus.emit("derby.state", { state: this.state() });
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  /** Roll fresh form for the fixed cast — a new race, same old legends. */
  private newField(): void {
    this.racers = CAST.map((c) => ({ ...c, form: 1 + randomInt(5) }));
    this.raceId = randomUUID();
  }

  placeBet(
    userId: number,
    racer: string,
    amount: number,
  ): { coins: number } | { error: "closed" | "bad_racer" | "bad_amount" | "over_cap" | "already_bet" | "insufficient" } {
    if (this.phase === "racing" || this.phase === "settled") return { error: "closed" };
    if (!this.racers.some((r) => r.key === racer)) return { error: "bad_racer" };
    if (!Number.isInteger(amount) || amount < MIN_BET) return { error: "bad_amount" };
    if (amount > MAX_PER_RACER) return { error: "over_cap" };
    // ONE ticket per race (Josh's rule): pick one runner, once — no
    // spreading across the field, no topping up.
    if (Object.keys(this.store.derbyMyBets(this.raceId, userId)).length > 0) return { error: "already_bet" };

    const left = this.store.derbyBet(this.raceId, userId, racer, amount);
    if (left === null) return { error: "insufficient" };
    this.store.bumpStat(userId, "gambled", amount);
    if (this.phase === "idle") {
      this.phase = "betting";
      this.endsAt = Date.now() + BETTING_MS;
      this.schedule(BETTING_MS, () => this.race());
    }
    this.broadcast();
    return { coins: left };
  }

  myBets(userId: number): Record<string, number> {
    return this.raceId ? this.store.derbyMyBets(this.raceId, userId) : {};
  }

  /** Tear up your ticket while the window's open — full refund, and you're
   *  free to back a different runner. */
  cancelBet(userId: number): { coins: number; refunded: number } | { error: "closed" | "no_bet" } {
    if (this.phase !== "betting" && this.phase !== "idle") return { error: "closed" };
    const refunded = this.store.derbyCancelBet(this.raceId, userId);
    if (refunded === 0) return { error: "no_bet" };
    // Last ticket torn up → disarm the empty window (the roulette pattern)
    // rather than counting a pointless 45s down to an empty gun. race()
    // guards on phase, so the already-scheduled timer no-ops regardless.
    if (this.phase === "betting" && Object.keys(this.store.derbyPools(this.raceId)).length === 0) {
      // Same field: a lone bettor cancelling must not be a free re-roll of
      // everybody's form (the v2 review found it could be spammed).
      this.resetToIdle(true);
    } else {
      this.broadcast();
    }
    return { coins: this.store.getCoins(userId), refunded };
  }

  /** The gates open: draw the FULL finish order (form-weighted, without
   *  replacement), settle the podium NOW, and let every client run the same
   *  seeded race to the known placings. */
  private race(): void {
    if (this.phase !== "betting") return;
    const pools = this.store.derbyPools(this.raceId);
    if (Object.keys(pools).length === 0) {
      this.resetToIdle();
      return;
    }
    this.poolsSnapshot = pools;
    const remaining = [...this.racers];
    const placings: string[] = [];
    while (remaining.length > 0) {
      const totalForm = remaining.reduce((n, r) => n + r.form, 0);
      let roll = randomInt(totalForm);
      let idx = 0;
      for (let i = 0; i < remaining.length; i++) {
        if ((roll -= remaining[i].form) < 0) {
          idx = i;
          break;
        }
      }
      placings.push(remaining[idx].key);
      remaining.splice(idx, 1);
    }
    this.placings = placings;
    this.winner = placings[0];
    this.seed = randomInt(2 ** 31);
    this.phase = "racing";
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + RACE_MS;

    const settled = this.store.derbySettle(this.raceId, placings);
    this.refunded = !!settled?.refunded;
    this.winnersDto = settled?.refunded ? [] : (settled?.payouts ?? []);
    for (const p of settled?.payouts ?? []) {
      this.store.maxStat(p.userId, "derby_best", p.payout);
    }

    this.broadcast();
    this.schedule(RACE_MS, () => this.settledPhase());
  }

  private settledPhase(): void {
    this.phase = "settled";
    this.endsAt = Date.now() + SETTLE_MS;
    const w = this.racers.find((r) => r.key === this.winner);
    if (w) {
      // Career lore lands AFTER the race: counted at the gun, the racer card
      // gave the winner away mid-race (v2 review).
      this.store.derbyRecordWin(w.key);
      this.careerWins[w.key] = (this.careerWins[w.key] ?? 0) + 1;
      this.history.unshift({ name: w.name, key: w.key });
      if (this.history.length > HISTORY) this.history.length = HISTORY;
      this.results.unshift({ round: this.round, at: Date.now(), placings: [...this.placings] });
      if (this.results.length > RESULTS) this.results.length = RESULTS;
      this.store.kvSet(RESULTS_KEY, JSON.stringify(this.results));
    }
    this.broadcast();
    this.schedule(SETTLE_MS, () => this.resetToIdle());
  }

  private resetToIdle(keepField = false): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = "idle";
    this.round++;
    this.endsAt = null;
    this.startedAt = null;
    this.refunded = false;
    this.winner = null;
    this.placings = [];
    this.seed = 0;
    this.winnersDto = [];
    if (!keepField) this.newField(); // fresh runners for the next race, visible immediately
    this.broadcast();
  }
}

export function createDerby(store: Store, bus: Bus): Derby {
  const refunded = store.derbyRefundOpen();
  if (refunded > 0) console.log(`[derby] refunded ${refunded} escrowed stake(s) from a previous run`);
  return new Derby(store, bus);
}
