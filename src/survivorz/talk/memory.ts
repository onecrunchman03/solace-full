// SOLACE SURVIVORZ — WHAT EACH SURVIVOR REMEMBERS (SURVIVORZ.md §5: notes on each other person, a
// short diary before the main sleep).
//
// The regulars' memory shapes, cut down: short NOTES on each other person (rewritten by the model
// from what they heard and what happened, at most a few hundred characters each), a DIARY written
// at the main sleep, and three rings that feed every prompt — the lines they HEARD, what HAPPENED
// to them, and the CHOICES they made (the pick and the few words of why; the death reports point
// at these). How they feel about each other starts from the bibles' day-one table.
//
// It belongs to ONE WORLD: kept in app_kv under the world's identity (seed + first clock), so a
// reset — a new world — starts everybody fresh, and a restart of the same world would pick it up.
import { SURVIVORS, type SurvivorId } from "../genes";
import { START_REGARD } from "./sheets";

export interface Mind {
  /** notes on each other person */
  notes: Partial<Record<SurvivorId, string>>;
  /** how they feel about each other person, -100..100 (day one from the bibles) */
  regard: Partial<Record<SurvivorId, number>>;
  /** the last lines they heard (and said) */
  heard: { t: number; by: SurvivorId; text: string }[];
  /** what happened to them, in words */
  events: { t: number; what: string }[];
  /** the choices they made from a menu */
  choices: { t: number; label: string; why: string }[];
  /** the diary, newest last */
  diary: { t: number; day: number; text: string }[];
  /** when they last wrote one */
  diaryAt: number;
  /** THEIR GOAL, in their own words — set by the model, never by code (Nov 2026) */
  /** `screen`: read twice and found fit for the broadcast (the cast card shows it) */
  goal: { text: string; why: string; at: number; screen?: boolean } | null;
}

export const HEARD_KEPT = 14;
export const EVENTS_KEPT = 24;
export const CHOICES_KEPT = 12;
export const DIARY_KEPT = 10;
export const NOTE_CHARS = 280;

export function freshMind(who: SurvivorId): Mind {
  return { notes: {}, regard: { ...START_REGARD[who] }, heard: [], events: [], choices: [], diary: [], diaryAt: 0, goal: null };
}

export type Minds = Record<SurvivorId, Mind>;

export function freshMinds(): Minds {
  return Object.fromEntries(SURVIVORS.map((s) => [s, freshMind(s)])) as Minds;
}

const ring = <T>(a: T[], x: T, n: number): void => { a.push(x); if (a.length > n) a.splice(0, a.length - n); };
export const remember = {
  heard: (m: Mind, t: number, by: SurvivorId, text: string) => ring(m.heard, { t, by, text }, HEARD_KEPT),
  event: (m: Mind, t: number, what: string) => ring(m.events, { t, what }, EVENTS_KEPT),
  choice: (m: Mind, t: number, label: string, why: string) => ring(m.choices, { t, label, why }, CHOICES_KEPT),
  diary: (m: Mind, t: number, day: number, text: string) => { ring(m.diary, { t, day, text }, DIARY_KEPT); m.diaryAt = t; },
  goal: (m: Mind, t: number, text: string, why: string) => { m.goal = { text, why, at: t }; },
};

export interface KV { kvGet(k: string): string | null; kvSet(k: string, v: string): void }
export const KV_MINDS = "survivorz_minds";

export function loadMinds(kv: KV | null | undefined, id: string): Minds {
  if (!kv) return freshMinds();
  try {
    const raw = kv.kvGet(KV_MINDS);
    if (!raw) return freshMinds();
    const j = JSON.parse(raw) as { id?: string; minds?: Minds };
    if (j.id !== id || !j.minds) return freshMinds();
    const out = freshMinds();
    for (const s of SURVIVORS) if (j.minds[s]) out[s] = { ...out[s], ...j.minds[s] };
    return out;
  } catch {
    return freshMinds();
  }
}

export function saveMinds(kv: KV | null | undefined, id: string, minds: Minds): void {
  if (!kv) return;
  try { kv.kvSet(KV_MINDS, JSON.stringify({ id, minds })); } catch { /* a full disk loses a memory, never the show */ }
}
