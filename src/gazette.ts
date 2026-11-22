// THE FOUNDRY GAZETTE — the house's morning paper (Josh, Oct 2026: "Captions +
// the Gazette").
//
// Every morning at GAZETTE_HOUR, house time, Sterling posts what happened in
// the house since the last edition: the Wheel's big wins and its dead, the
// tables' big nights, the auction block, and the graves that
// sealed. Written on the steady engine (the 3080 sits idle overnight), one
// ITEM at a time through `voiced()` — so every name and figure has to survive
// the rewrite, and the paper's layout is fixed, not left to a model.
//
// PUBLIC ONLY, by construction: every item comes from an event that was
// already broadcast to the whole house (the Wheel feed, the tables, the
// auction block, the lottery, the graveyard). Nobody's purse, no DM, no
// private page. The house (admins, bots) doesn't make the paper — it doesn't
// compete on the boards either.
//
// The day's log is kept in app_kv so a restart overnight doesn't lose the news.

import type { Bus } from "./bus";
import type { Store } from "./db/store";
import type { Router } from "./http";
import { json } from "./http";
import { guardedTick } from "./health";
import { HOUSE_TZ, houseClock } from "./househours";
import { voiced } from "./npc/voice";
import type { Channel } from "./types";

/** The paper goes out at this house hour (09:00 America/New_York). */
export const GAZETTE_HOUR = Number(process.env.GAZETTE_HOUR ?? 9);
/** A paper with fewer items than this isn't printed (a quiet day stays quiet). */
export const GAZETTE_MIN_ITEMS = 2;
const LOG_KEY = "gazette_log";
const DAY_KEY = "gazette_day";
const KEEP_MS = 26 * 3_600_000;
const MAX_LOG = 300;
/** What counts as news at the tables, in silver. */
export const BIG_TABLE_WIN = 1_000;
export const BIG_DERBY_WIN = 300;
export const BIG_AUCTION = 1_000;

export type Section = "wheel" | "tables" | "block" | "memoriam";
const SECTIONS: { id: Section; title: string; max: number }[] = [
  { id: "wheel", title: "THE WHEEL", max: 3 },
  { id: "tables", title: "AT THE TABLES", max: 4 },
  { id: "block", title: "ON THE BLOCK", max: 2 },
  { id: "memoriam", title: "IN MEMORIAM", max: 3 },
];

export interface GazetteItem {
  at: number;
  section: Section;
  /** The plain sentence (the brief the model restates). */
  brief: string;
  /** Names that must survive the rewrite. */
  must: string[];
  /** Ranking within a section: silver, or a tier score. */
  weight: number;
}

export interface Gazette {
  /** Print now if it's time (the minute tick calls this). Returns the paper, or null. */
  tick(now?: number): Promise<string | null>;
  /** Print regardless of the hour (the admin's lever). `force` prints even a thin paper. */
  printNow(force?: boolean, now?: number): Promise<string | null>;
  log(): GazetteItem[];
  stop(): void;
}

interface Sterlingish {
  general(): Channel | null;
  say(channelId: number, body: string): unknown;
}

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: HOUSE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const MASTHEAD_FMT = new Intl.DateTimeFormat("en-US", { timeZone: HOUSE_TZ, weekday: "long", month: "long", day: "numeric" });
export const houseDay = (at: number): string => DAY_FMT.format(new Date(at));
const silver = (n: number): string => Math.round(n).toLocaleString("en-US");

export function startGazette(store: Store, bus: Bus, sterling: Sterlingish, opts: { now?: () => number; autoTick?: boolean } = {}): Gazette {
  const clock = opts.now ?? Date.now;
  let items: GazetteItem[] = [];
  try {
    const raw = JSON.parse(store.kvGet(LOG_KEY) ?? "[]");
    if (Array.isArray(raw)) items = raw;
  } catch {
    items = [];
  }
  const save = (): void => store.kvSet(LOG_KEY, JSON.stringify(items));
  /** Somebody the paper may name: a living-or-dead member, not the house. */
  const member = (id: number): string | null => {
    const u = store.getUserById(id);
    if (!u || u.isAdmin || u.isBot || u.deletedAt) return null;
    return u.displayName || u.username;
  };
  const note = (item: Omit<GazetteItem, "at">): void => {
    const now = clock();
    items = items.filter((i) => now - i.at < KEEP_MS);
    items.push({ ...item, at: now });
    if (items.length > MAX_LOG) items = items.slice(-MAX_LOG);
    save();
  };

  // ---- the day's news, as it happens --------------------------------------------
  const TIER_WEIGHT: Record<string, number> = { mythic: 25, legendary: 10 };
  bus.on("wheel.spin", (e) => {
    const name = member(e.userId);
    if (!name) return;
    if (e.died) {
      note({ section: "memoriam", brief: `${name} met the death wedge on the Wheel.`, must: [name], weight: 50 });
    } else if (e.tier === "legendary" || e.tier === "mythic") {
      const what = e.emojiName ? `${e.emojiName}, a ${e.tier}` : `a ${e.tier}`;
      note({ section: "wheel", brief: `${name} won ${what} on the Wheel.`, must: [name], weight: TIER_WEIGHT[e.tier] });
    }
  });
  bus.on("lottery.won", (e) => {
    if (!e.winner) return;
    const name = member(e.winner.id);
    if (!name) return;
    note({ section: "tables", brief: `${name} won the Nightly Draw: ${silver(e.paid)} silver.`, must: [name], weight: e.paid });
  });
  let derbySeen = -1;
  bus.on("derby.state", ({ state }) => {
    if (state.phase !== "settled" || state.round === derbySeen) return;
    derbySeen = state.round;
    const winner = state.racers.find((r) => r.key === state.placings[0]);
    let best: { name: string; payout: number } | null = null;
    for (const w of state.winners) {
      const name = member(w.userId);
      if (name && w.payout >= BIG_DERBY_WIN && (!best || w.payout > best.payout)) best = { name, payout: w.payout };
    }
    if (best && winner) {
      note({ section: "tables", brief: `${best.name} cashed ${silver(best.payout)} silver when ${winner.name} won the Derby.`, must: [best.name, winner.name], weight: best.payout });
    }
  });
  let rouletteSeen = -1;
  bus.on("roulette.state", ({ state }) => {
    if (state.phase !== "settled" || state.round === rouletteSeen) return;
    rouletteSeen = state.round;
    for (const w of state.winners) {
      const name = member(w.user.id);
      // NET, not gross (Oct 2026 review): a 3,600 straight that hid 5,000 of
      // losing chips is a 1,400 loss, not a big win.
      const staked = (state.bets ?? []).filter((b) => b.user.id === w.user.id).reduce((n, b) => n + b.amount, 0);
      const net = w.total - staked;
      if (name && net >= BIG_TABLE_WIN) {
        note({ section: "tables", brief: `${name} took ${silver(net)} silver off the roulette wheel on ${state.pocket}.`, must: [name], weight: net });
      }
    }
  });
  bus.on("slots.pull", (e) => {
    if (e.reels.length !== 3 || e.reels.some((r) => r !== "crown")) return;
    const name = member(e.userId);
    // the crown pays 250 a base pull, scaled by the machine's stake
    const won = 250 * ((e.stake ?? 10) / 10);
    if (name) note({ section: "tables", brief: `${name} hit the crown jackpot on the slots for ${silver(won)} silver.`, must: [name], weight: won });
  });
  bus.on("auction.close", ({ auction }) => {
    if (auction.status !== "settled" || !auction.highBidder || (auction.currentBid ?? 0) < BIG_AUCTION) return;
    const buyer = member(auction.highBidder.id);
    const lot = auction.emoji?.name ?? (auction.relicSlug ? "a Backrooms relic" : null);
    if (!buyer || !lot) return;
    note({ section: "block", brief: `${buyer} bought ${lot} at auction for ${silver(auction.currentBid!)} silver.`, must: [buyer], weight: auction.currentBid! });
  });
  bus.on("grave.sealed", (e) => {
    if (!member(e.userId)) return;
    note({ section: "memoriam", brief: `Nobody came for ${e.name}, so the grave sealed; generation ${e.generation} stands up in their place.`, must: [e.name], weight: 40 });
  });

  // ---- printing -------------------------------------------------------------------
  let printing = false;
  const print = async (force: boolean, now: number): Promise<string | null> => {
    const channel = sterling.general();
    if (!channel || printing) return null;
    const fresh = items.filter((i) => now - i.at < KEEP_MS);
    if (!force && fresh.length < GAZETTE_MIN_ITEMS) return null;
    printing = true;
    try {
      const situation = "one item in your morning paper, The Foundry Gazette, posted for the whole house";
      const out: string[] = [];
      for (const s of SECTIONS) {
        const picked = fresh
          .filter((i) => i.section === s.id)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, s.max);
        if (!picked.length) continue;
        const lines = await Promise.all(picked.map((i) => voiced("sterling", i.brief, { situation, must: i.must })));
        out.push(s.title, "", lines.map((l) => `· ${l.replace(/\s*\n+\s*/g, " ").trim()}`).join("\n\n"));
      }
      if (!out.length) out.push("A quiet night in the house. Nothing to report but the hum of the machines.");
      const opener = await voiced("sterling", "Good morning. Here is what happened in the house since yesterday's paper.", {
        situation: "the opening line of your morning paper, The Foundry Gazette",
      });
      const paper = [`📰 THE FOUNDRY GAZETTE — ${MASTHEAD_FMT.format(new Date(now))}`, "", opener, "", ...out.flatMap((b, i) => (i ? ["", b] : [b]))]
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      sterling.say(channel.id, paper);
      store.kvSet(DAY_KEY, houseDay(now));
      // Printed news is spent: the next paper starts from here.
      items = items.filter((i) => i.at > now);
      save();
      return paper;
    } finally {
      printing = false;
    }
  };

  const tick = async (now = clock()): Promise<string | null> => {
    const h = houseClock(now);
    if (h < GAZETTE_HOUR || h >= GAZETTE_HOUR + 1) return null;
    if (store.kvGet(DAY_KEY) === houseDay(now)) return null;
    const paper = await print(false, now);
    // A quiet morning still counts as the morning's paper (skipped, not retried all hour).
    if (!paper) store.kvSet(DAY_KEY, houseDay(now));
    return paper;
  };

  const timer = opts.autoTick === false ? null : setInterval(() => guardedTick(store, "gazette", 60_000, () => void tick()), 60_000);
  return {
    tick,
    printNow: (force = true, now = clock()) => print(force, now),
    log: () => items.slice(),
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}

export function registerGazetteRoutes(router: Router, gazette: Gazette): void {
  // THE BOULEVARD'S SIGNBOARD (the casino redesign): tonight's biggest win at
  // the tables, from the paper's own log — public news only (the log never
  // holds anything that wasn't already broadcast), spent at the morning print.
  router.get("/api/casino/tonight", "user", ({ res }) => {
    let best: GazetteItem | null = null;
    for (const it of gazette.log()) if (it.section === "tables" && (!best || it.weight > best.weight)) best = it;
    json(res, 200, { biggest: best ? { name: best.must[0] ?? null, amount: Math.round(best.weight), brief: best.brief, at: best.at } : null });
  });
  // The admin's lever: print the paper now (for a look, or after a quiet
  // morning). Audited — it speaks to the whole house in Sterling's voice.
  router.post("/api/admin/gazette/print", "admin", async ({ res, user, store }) => {
    const paper = await gazette.printNow(true);
    if (!paper) return json(res, 409, { error: "no_channel_or_busy" });
    store.audit(user.id, "gazette.print");
    json(res, 200, { ok: true, paper });
  });
}
