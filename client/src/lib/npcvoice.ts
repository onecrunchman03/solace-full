// THE HOUSE'S BRAINS, on the client (Josh, Oct 2026: "lets just get rid of
// the static dialogue of before and run everything now with the AI model").
//
// Every surface where Sterling, the goblins or Dr. Voss talks to you — the
// Trader's counter, the 3D bar, the escape ante-room,
// Threshold-4, the goblins' kiosk — gets its lines from here:
//
//   · takeIdle(npc, venue)  — the next line of counter talk, written by the
//     model for YOU (server: POST /api/npc/lines). Synchronous on purpose:
//     the 3D hall asks for a line inside its frame loop. It returns null
//     while a batch is on its way, and the caller falls back to its scripted
//     pool for that one line.
//   · primeIdle(npc, venue) — the same, but waits (briefly) for the first
//     batch: an opening greeting is worth a moment's pause.
//   · voiceReact(npc, venue, scripted, event) — a reaction to something you
//     just did: the model writes it from WHAT HAPPENED ("sold you 3 emoji for
//     600 silver"), with the scripted quip as the example of tone.
//
// THE SCRIPTED POOLS STAY, as the floor: no model, a slow one, a refusal —
// the old line is said instead, and nothing ever goes silent.

import { api } from "./api";

export type NpcId = "sterling" | "goblins" | "voss";

interface Pool {
  lines: string[];
  next: number;
  loading: Promise<void> | null;
}

const pools = new Map<string, Pool>();
const dead = new Set<string>();
/** After the server says "no model" (503), don't ask again for a while. */
let offUntil = 0;
const OFF_MS = 5 * 60_000;

const keyOf = (npc: NpcId, venue: string) => `${npc}:${venue}`;

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function load(npc: NpcId, venue: string, fresh: boolean): Promise<void> {
  const key = keyOf(npc, venue);
  const pool = pools.get(key) ?? { lines: [], next: 0, loading: null };
  pools.set(key, pool);
  if (pool.loading) return pool.loading;
  if (Date.now() < offUntil || dead.has(key)) return Promise.resolve();
  pool.loading = api
    .npcLines(npc, venue, fresh)
    .then(({ lines }) => {
      if (lines.length) {
        pool.lines = lines;
        pool.next = 0;
      }
    })
    .catch((e: { status?: number }) => {
      if (e?.status === 503) offUntil = Date.now() + OFF_MS;
      // ARCHIVED (Nov 17 2026, server config.npcHouseAi): the house has no AI any more — never ask again this session
      if (e?.status === 410) offUntil = Infinity;
      // A venue the server doesn't know: never ask for it again this session.
      if (e?.status === 400) dead.add(key);
    })
    .finally(() => {
      pool.loading = null;
    });
  return pool.loading;
}

/** The next line of counter talk, or null (use the scripted pool). Once a
 *  batch has all been said, a fresh one is asked for while it repeats. */
export function takeIdle(npc: NpcId, venue: string): string | null {
  const pool = pools.get(keyOf(npc, venue));
  if (!pool || !pool.lines.length) {
    void load(npc, venue, false);
    return null;
  }
  const line = pool.lines[pool.next % pool.lines.length];
  pool.next++;
  if (pool.next === pool.lines.length) void load(npc, venue, true);
  return line;
}

/** Wait (up to `ms`) for the first batch, then take a line from it. */
export async function primeIdle(npc: NpcId, venue: string, ms = 6_000): Promise<string | null> {
  if (Date.now() < offUntil) return null;
  const pool = pools.get(keyOf(npc, venue));
  if (!pool?.lines.length) await timeout(load(npc, venue, false), ms);
  return takeIdle(npc, venue);
}

/** A reaction, written by the model from WHAT HAPPENED (`event`, said from
 *  the counter's side: "sold you 3 emoji for 600 silver") with the scripted
 *  line as the example of tone — or the scripted line itself. No event, no
 *  request: a quip is never paraphrased blind (a model that didn't know the
 *  joke turned "bring it back unmelted" into "bring it back melted"). */
export async function voiceReact(npc: NpcId, venue: string, scripted: string, event?: string, ms = 7_000): Promise<string> {
  if (!event || Date.now() < offUntil || !scripted.trim() || scripted.length > 300 || event.length > 300) return scripted;
  try {
    const r = await timeout(api.npcVoice(npc, venue, scripted, event), ms);
    return r?.line?.trim() || scripted;
  } catch (e) {
    if ((e as { status?: number })?.status === 410) offUntil = Infinity;
    return scripted;
  }
}

/** Throw one venue's batch away — the person's situation changed (the
 *  goblins' kiosk after a missed day), so the next line must be fresh. */
export function dropIdle(npc: NpcId, venue: string): void {
  pools.delete(keyOf(npc, venue));
}

/** Sign-out: another account must never see the last one's lines. */
export function resetNpcVoice(): void {
  pools.clear();
  dead.clear();
  offUntil = 0;
}
