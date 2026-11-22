// SOLACE SURVIVORZ — THE DAILY SUMMARY (Josh, Nov 1 2026: "thats fine with a daily summary").
// Sterling's red-flag DMs cover the moments something breaks; this is the once-a-day read of the show for
// the month: what happened in the story, and whether everything that carries it to YouTube is healthy.
// Plain text (chat has no markdown), one line per item, never voiced — an instrument says exactly what
// it was built to say.
import type { HealthCheck } from "../health";
import { HOUSE_TZ, houseClock } from "../househours";
import type { SimWorld } from "./sim/world";

/** the hour of house time (America/New_York) it goes out */
export const DAILY_HOUR = 9;

export interface DailyCounts { voiced: number; silent: number; late: number; said: number; dropped: number }

export interface DailyInput {
  sim: SimWorld | null;
  running: boolean;
  paused: boolean;
  checks: HealthCheck[];
  /** cumulative counters now, and at the last summary (null the first time) */
  counts: DailyCounts;
  since: DailyCounts | null;
}

const DAY = 86_400_000;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** the checks that carry the show (health.ts names) */
const SHOW_CHECK = /survivorz|gpu|ai engine|voices|backup|disk|memory/i;

export function dailySummary(i: DailyInput): string {
  const lines: string[] = ["SURVIVORZ — THE DAILY SUMMARY"];
  const s = i.sim;
  if (!i.running || !s) {
    lines.push("", "The show isn't running.");
  } else {
    const day = Math.floor((s.t - s.startedAt) / DAY) + 1;
    lines.push("", `Day ${day}${i.paused ? " (paused)" : ""}.`);
    const alive = s.survivors.filter((x) => x.alive);
    const hidden = alive.filter((x) => x.hidden);
    lines.push(`Alive: ${alive.length ? alive.filter((x) => !x.hidden).map((x) => cap(x.who)).join(", ") || "nobody in the group" : "nobody"}${hidden.length ? ` (and ${hidden.map((x) => cap(x.who)).join(", ")}, still hiding)` : ""}.`);
    const lately = s.survivors.filter((x) => !x.alive && !x.escaped && x.deadAt > s.t - DAY);
    lines.push(lately.length ? `Died in the last day: ${lately.map((x) => `${cap(x.who)} (${x.cause || "unknown"})`).join(", ")}.` : "Nobody died in the last day.");
    const out = s.survivors.filter((x) => x.escaped);
    if (out.length) lines.push(`Escaped: ${out.map((x) => cap(x.who)).join(", ")}.`);
    const ends = (["truth", "cure", "escape"] as const).filter((k) => s.endings[k] !== undefined);
    lines.push(ends.length ? `Endings reached: ${ends.map((k) => `${k} (day ${Math.floor((s.endings[k]! - s.startedAt) / DAY) + 1})`).join(", ")}.` : "No ending reached yet.");
    if (s.overAt) lines.push("The show is over: nobody is left in the facility.");
  }
  const d = (k: keyof DailyCounts) => i.counts[k] - (i.since?.[k] ?? 0);
  lines.push("", `Since the last summary: ${d("said")} lines spoken (${d("dropped")} dropped), ${d("voiced")} voiced, ${d("silent")} went out without a voice, ${d("late")} voices arrived too late.`);
  const show = i.checks.filter((c) => SHOW_CHECK.test(c.name));
  const red = i.checks.filter((c) => !c.ok);
  lines.push("", red.length ? `Needs a look: ${red.map((c) => `${c.name} — ${c.detail}`).join("; ")}.` : "Health: everything green.");
  if (show.length) lines.push(...show.map((c) => `${c.ok ? "OK" : "RED"} · ${c.name}: ${c.detail}`));
  return lines.join("\n");
}

const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: HOUSE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** the house's calendar date (YYYY-MM-DD) */
export function houseDate(at: number = Date.now()): string { return DATE.format(new Date(at)); }

/** Does the clock send one now? A REAL show's only: a test run or a walk left going at nine sent every admin
 *  "Day 1. Alive: Rick." and spent the day's one summary (the re-grade). The admin's lever sends one whatever. */
export function dailyWanted(st: { running: boolean; test: boolean }, lastSent: string | null, at: number = Date.now()): boolean {
  return st.running && !st.test && dailyDue(lastSent, at);
}

/** Due now? Past DAILY_HOUR house time and not yet sent on this house date. */
export function dailyDue(lastSent: string | null, at: number = Date.now()): boolean {
  return houseClock(at) >= DAILY_HOUR && lastSent !== houseDate(at);
}
