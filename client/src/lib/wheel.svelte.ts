// Reactive state + actions for the Emoji Wheel. The server decides the outcome
// (POST /api/wheel/spin) and returns the slot it landed on; we spin the disc to
// rest on that slot, then reveal the result.

import { uniqById } from "./uniq";
import { api, ApiError, type Emoji, type SpinResult, type WheelFeedItem, type EmojiLite, type TierLeader, type DeathRow, type WheelFaceSlot } from "./api";
import { refreshOwned } from "./emoji.svelte";
import { holdAchievementToasts, releaseAchievementToasts } from "./achievements.svelte";

const SLOT_COUNT = 32; // must match src/wheel.ts WHEEL_SLOTS.length
const STEP = 360 / SLOT_COUNT;
const FULL_SPINS = 5; // whole turns before settling, for drama
/** Spin duration. The disc's CSS transition-duration is set inline from this
 *  constant (WheelView), so the reveal timing can never desync from the visual. */
export const SPIN_MS = 5200;

export const wheel = $state<{
  spins: { bucket: number; bonus: number; total: number };
  nextReset: number;
  /** The wheel's FACE as the server drew it: 32 wedges, each showing a prize
   *  you could really win, and after a spin the landed wedge showing what you
   *  actually got. Never rolled client-side — that desynced the wheel from the
   *  award (the rabbit bug). */
  face: (string | null)[];
  tierCounts: Record<string, number>;
  hasTalisman: boolean;
  /** THE REAPER'S PATIENCE, as the server last reported it. Drives the gauge
   *  under the wheel — the whole point of the Sep 2026 rework is that the
   *  danger is visible before it lands. */
  reaper: { bare: number; grace: number; graceLeft: number; rate: number; shielded: boolean; immune: boolean; retired?: boolean };
  inventory: Emoji[];
  owned: number;
  feed: WheelFeedItem[];
  catalog: Record<string, EmojiLite[]>;
  tierLeaders: Record<string, TierLeader[]>;
  deaths: DeathRow[];
  loading: boolean;
  spinning: boolean;
  rotation: number;
  reveal: SpinResult | null;
  /** The emoji actually won, pinned to the slot the wheel rests on (so the wheel
   *  shows what you got). Null for non-emoji outcomes, which keep their slot art. */
  awarded: { slot: number; file: string } | null;
  dead: boolean;
  /** When the fatal spin resolved (epoch ms) — drives the Terminated lifespan. */
  diedAt: number;
  error: string | null;
}>({
  spins: { bucket: 0, bonus: 0, total: 0 },
  nextReset: 0,
  face: [],
  tierCounts: {},
  hasTalisman: false,
  reaper: { bare: 0, grace: 55, graceLeft: 55, rate: 0, shielded: false, immune: false },
  inventory: [],
  owned: 0,
  feed: [],
  catalog: {},
  tierLeaders: {},
  deaths: [],
  loading: true,
  spinning: false,
  rotation: 0,
  reveal: null,
  awarded: null,
  dead: false,
  diedAt: 0,
  error: null,
});

/**
 * THE WINDOW ROLLS OVER BY ITSELF (Josh, Aug 2026: "when the count down on the
 * stage for next time for free spins got to zero its doesnt reset or give me
 * free spins i have to ctrl shift r the app").
 *
 * Spins refill on a fixed 2-hour UTC boundary, but nothing ever asked the
 * server again once the clock ran out — `nextReset` simply went stale, so the
 * countdown sat at zero and your spins stayed at zero until something else
 * happened to reload. It is a TIMER, not a poll: one refetch scheduled for the
 * boundary, rescheduled from whatever the server then says the next one is.
 *
 * The jitter matters. Every client in the house shares this deadline, so a
 * refetch exactly on it is the whole membership hitting /api/wheel in the same
 * tick — the same thundering-herd the leaderboards already scatter.
 */
let resetTimer: ReturnType<typeof setTimeout> | null = null;
let wakeWatch = false;
function scheduleSpinRefill(): void {
  // A backstop for the laptop that was shut for three hours: browsers throttle
  // background timers and a suspended machine may drop one entirely, so a tab
  // coming back into view checks the deadline itself.
  if (!wakeWatch && typeof document !== "undefined") {
    wakeWatch = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (wheel.nextReset && Date.now() >= wheel.nextReset) void loadWheelStatus();
    });
  }
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
  if (!wheel.nextReset) return;
  const wait = wheel.nextReset - Date.now() + 500 + Math.random() * 2500;
  resetTimer = setTimeout(() => {
    resetTimer = null;
    // loadWheelStatus reschedules from the fresh nextReset, so this walks
    // itself forward window after window for as long as the tab is open.
    void loadWheelStatus();
  }, Math.max(1000, wait));
}

/** Refresh just the wheel status (spins, counts, talisman) — one light call.
 *  Used to reconcile after a spin, where the inventory is already updated
 *  locally and refetching the whole collection would be wasted traffic. */
export async function loadWheelStatus(): Promise<void> {
  try {
    const status = await api.wheel();
    wheel.spins = status.spins;
    wheel.nextReset = status.nextReset;
    wheel.face = (status.face ?? []).map((f) => f?.file ?? null);
    wheel.tierCounts = status.tierCounts;
    wheel.hasTalisman = status.hasTalisman;
    if (status.reaper) wheel.reaper = status.reaper;
    wheel.owned = status.owned;
    scheduleSpinRefill();
  } catch {
    // NOT a death signal: a plain expired/kicked session also 401s here, and
    // the old `401 → dead` heuristic played the Terminated cinematic for
    // very-much-alive users. `dead` is set ONLY by an actual death spin.
  }
}

/** Load wheel status + the current collection (view mount / full refresh). */
export async function loadWheel(): Promise<void> {
  try {
    const [status, inv] = await Promise.all([api.wheel(), api.inventory()]);
    wheel.dead = false; // a successful authenticated load means we're alive
    wheel.spins = status.spins;
    wheel.nextReset = status.nextReset;
    wheel.face = (status.face ?? []).map((f) => f?.file ?? null);
    wheel.tierCounts = status.tierCounts;
    wheel.hasTalisman = status.hasTalisman;
    if (status.reaper) wheel.reaper = status.reaper;
    wheel.owned = status.owned;
    wheel.inventory = inv.emoji;
    scheduleSpinRefill();
  } catch {
    // See loadWheelStatus — a 401 here is a dead SESSION, not a dead USER.
  } finally {
    wheel.loading = false;
  }
}

/** Load the live feed backlog + the leaderboard and graveyard. */
export async function loadBoards(): Promise<void> {
  try {
    const [f, l, d] = await Promise.all([api.feed(), api.leaderboardTiers(), api.deaths()]);
    // Belt and braces on the other side of the same crash: both of these feed
    // a keyed {#each}, and a keyed list that throws takes the whole view down.
    wheel.feed = uniqById(f.feed);
    wheel.tierLeaders = l.tiers;
    wheel.deaths = uniqById(d.deaths);
  } catch {
    // boards are best-effort
  }
}

/** Load the full catalog (all unlockables) once. */
export async function loadCatalog(): Promise<void> {
  try {
    wheel.catalog = (await api.catalog()).catalog;
  } catch {
    // best-effort
  }
}

/** Events that arrived while the disc was still turning — see below. */
let heldEvents: WheelFeedItem[] = [];

function applyWheelEvent(item: WheelFeedItem): void {
  // THE each_key_duplicate CRASH IN PROD'S ERROR TABLE, found Sep 2026 — 7
  // hits between Aug 6 and Sep 19, and it survived the round that added
  // lib/uniq.ts (which only covered FETCHED pages, on the theory that
  // "nothing in the app's own writers repeats one"). This writer does.
  //
  // The race: an event that arrives mid-spin is HELD (no spoilers while the
  // disc is turning) while an earlier event's scheduled loadBoards() is free
  // to land inside that same 5.2s window — and the server's feed buffer
  // already contains the held event, because broadcasting it and storing it
  // are the same moment. So the refresh assigns it into wheel.feed, the disc
  // stops, flushWheelEvents() prepends it a second time, and `{#each
  // wheel.feed as f (f.id)}` throws.
  //
  // Dropping the duplicate rather than deduping the list afterwards is
  // deliberate: the copy already in the feed came from the server and is the
  // authoritative one.
  if (wheel.feed.some((f) => f.id === item.id)) return;
  wheel.feed = [item, ...wheel.feed].slice(0, 40);
  if (wheel.dead) return;
  setTimeout(() => {
    if (!wheel.dead) void loadBoards();
  }, 500 + Math.random() * 2000);
}

/** A live wheel event arrived over the socket (someone won/died). Notable
 *  events shift the visible boards, so refresh them — with a small random
 *  delay so a hundred connected clients don't all refetch in the same tick.
 *  Skipped once we're dead: the Terminated flow is tearing the session down
 *  and a scheduled refetch would just 401.
 *
 *  NO SPOILERS WHILE THE WHEEL IS TURNING (Josh, Aug 2026: "the wheel
 *  leadership updates what you get before the wheel stops spinning"). The
 *  server resolves a spin the moment you ask it to and broadcasts the result
 *  at once — a full SPIN_MS (5.2s) before your disc comes to rest. So both
 *  the live feed AND the leaderboard refresh were announcing your own prize
 *  while you watched the wheel still deciding it. Anything that lands mid-spin
 *  is held and flushed at the reveal, which is the same rule Slots, Roulette,
 *  the Derby and Craps already play by. */
export function receiveWheelEvent(item: WheelFeedItem): void {
  if (wheel.spinning) {
    heldEvents.push(item);
    return;
  }
  applyWheelEvent(item);
}

/** The disc has stopped and the reveal is up — let the world back in. Applied
 *  oldest-first so the feed's newest-first order comes out right. */
export function flushWheelEvents(): void {
  const queued = heldEvents;
  heldEvents = [];
  for (const item of queued) applyWheelEvent(item);
}

/** Rotation (degrees) that rests slot `k`'s centre under the top pointer. */
function targetRotation(current: number, slot: number): number {
  const settle = (((-(slot + 0.5) * STEP) % 360) + 360) % 360;
  const delta = ((settle - (current % 360)) + 360) % 360;
  return current + FULL_SPINS * 360 + delta;
}

export async function doSpin(): Promise<void> {
  if (wheel.spinning || wheel.dead || wheel.spins.total <= 0) return;
  wheel.error = null;
  wheel.reveal = null;
  wheel.spinning = true;
  // Badge toasts wait for the disc too — the spin-count achievements land
  // ~4s after the server resolves, while the wheel is still turning.
  holdAchievementToasts();
  let res: { result: SpinResult; slotIndex: number; spinsLeft: number; face?: (WheelFaceSlot | null)[] };
  try {
    res = await api.spin();
  } catch (err) {
    wheel.spinning = false;
    // The spin never happened, so nothing is being spoiled — release anything
    // the world announced while the request was in flight.
    flushWheelEvents();
    releaseAchievementToasts();
    wheel.error = err instanceof ApiError ? err.code : "spin_failed";
    return;
  }
  // Pin the actually-awarded emoji to the slot the wheel will rest on, so the
  // wheel shows what you won rather than its generic per-slot sample. Non-emoji
  // outcomes (blank/talisman/death) keep their fixed slot art, which already matches.
  //
  // PAINTING THE DISC MUST NEVER STRAND `spinning`. The spin is already SPENT
  // by the time we get here — the server resolved it — so a throw while
  // dressing the wheel has to fall through to the settle, not abandon it. A
  // stranded `spinning` is not a cosmetic bug: it is a shared store, so it
  // takes the casino floor's wheel down with the 2D one (both gate on it) and
  // neither comes back without a reload.
  try {
    wheel.awarded =
      res.result.type === "emoji" && res.result.emoji
        ? { slot: res.slotIndex, file: res.result.emoji.file }
        : null;
    // The server drew this spin's wedges and pinned the award onto the one it
    // landed on — take it whole. Rolling wedges client-side is what let the disc
    // rest on a rabbit and pay out something else.
    wheel.face = (res.face ?? []).map((f) => f?.file ?? null);
    wheel.rotation = targetRotation(wheel.rotation, res.slotIndex);
  } catch (err) {
    console.error("[wheel] could not paint the spin", err);
  }
  window.setTimeout(() => {
    wheel.spinning = false;
    if (res.result.type === "death") {
      wheel.diedAt = Date.now();
      wheel.dead = true;
      heldEvents = []; // the Terminated flow is tearing down; nothing to flush
      releaseAchievementToasts(true); // no badge cards over the cinematic
      return; // the Terminated cinematic takes over — no reveal modal
    }
    // THE PRIZE IS PUBLISHED FIRST. Both views wait on `reveal` to close the
    // spin out, so it must not sit behind best-effort work that can throw —
    // the feed flush and the badge queue are announcements, not the result.
    wheel.reveal = res.result;
    // The disc has stopped: whatever the world announced mid-spin can be
    // shown now, including your own win.
    flushWheelEvents();
    releaseAchievementToasts();
    // Reflect the outcome locally (instant), then reconcile the status with one
    // light call — the old full reload was 5 requests per spin, which adds up
    // fast with a room full of spinners.
    wheel.spins = { ...wheel.spins, total: res.spinsLeft };
    if (res.result.type === "emoji" && res.result.emoji) {
      wheel.inventory = [res.result.emoji, ...wheel.inventory];
      wheel.owned += 1;
      const tier = res.result.emoji.tier;
      wheel.tierCounts = { ...wheel.tierCounts, [tier]: (wheel.tierCounts[tier] ?? 0) + 1 };
    } else if (res.result.type === "talisman" && !res.result.alreadyHad) {
      wheel.hasTalisman = true;
    } else if (res.result.type === "death_survived" && !res.result.immune) {
      wheel.hasTalisman = false; // the shield shattered
    }
    // Talisman gains/losses change the INVENTORY (the collection grid derives
    // from it), not just status flags — those rare outcomes take the full
    // reload; everything else reconciles with the light status call.
    if (res.result.type === "talisman" || res.result.type === "death_survived") {
      void loadWheel();
    } else {
      void loadWheelStatus();
    }
    // Any outcome that granted an emoji must also refresh the app-wide owned
    // list (chat picker, reactions, shop, stakes) — it's a separate store from
    // wheel.inventory, and without this the new emoji only appeared after a
    // full page reload.
    if (res.result.type === "emoji" || res.result.type === "talisman") {
      void refreshOwned();
    }
    // Notable outcomes come back to everyone (me included) as a wheel.event,
    // which schedules a boards refresh. Common wins stay off the feed, so
    // refresh the boards directly for those — they still move the tier board.
    if (res.result.type === "emoji" && res.result.tier === "common") {
      void loadBoards();
    }
  }, SPIN_MS);
}

export function dismissReveal(): void {
  wheel.reveal = null;
}

/** Logout hygiene: the next login on this machine must not flash the previous
 *  account's collection/spins — or a stale `dead` flag's Terminated screen.
 *  (The catalog stays: it's server-global, not user data.) */
export function resetWheel(): void {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
  wheel.spins = { bucket: 0, bonus: 0, total: 0 };
  wheel.nextReset = 0;
  wheel.face = [];
  wheel.tierCounts = {};
  wheel.hasTalisman = false;
  wheel.inventory = [];
  wheel.owned = 0;
  wheel.feed = [];
  wheel.tierLeaders = {};
  wheel.deaths = [];
  wheel.loading = true;
  wheel.spinning = false;
  heldEvents = [];
  releaseAchievementToasts(true); // logout: the next account must not see them
  wheel.rotation = 0;
  wheel.reveal = null;
  wheel.awarded = null;
  wheel.dead = false;
  wheel.diedAt = 0;
  wheel.error = null;
}
