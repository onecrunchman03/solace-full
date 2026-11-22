// SOLACE SURVIVORZ — THE INFECTION, run to its end (THE BUNKER, docs/survivorz/BUNKER.md 41, third round 16-17).
// A BITE — and only a bite — starts a ~40-minute clock (no cure: bitten = doomed):
//   0–10 min  incubation — nothing shows
//   10–20 min fever — sweating, the shiver, stamina capped at three quarters
//   20–32 min coughing fits — and THE COUGH IS NOISE: the dead hear it and it gives them away
//   32–40 min slow and confused — skills −3 (goals.ts skill()), they may wander
//   40 min    they collapse for about a minute and stand up as one of the dead, in their OWN body
// A BITE NOBODY SAW can be hidden: the honesty gene decides whether they own up; otherwise the others
// find out from the cough. The turned survivor's gear lies where they fell, as any death's does.
import { LIE } from "./lie";
import type { SimWorld, Survivor } from "./world";
import { note, witness } from "./knowledge";
import { NOISE_M, toughFx } from "./tables";
import { SUITED } from "../cast";

export const INFECTION = {
  incubateH: 10 / 60, feverH: 20 / 60, coughH: 32 / 60, turnH: 40 / 60,
  /** the collapse before they rise */
  collapseMs: 60_000,
  /** an antiviral pauses the clock this long */
  antiviralH: 12,
  /** a coughing fit every this often (ms), and how far it carries (m) */
  coughGap: [40_000, 90_000] as [number, number],
  coughNoiseM: 14,
  /** what the fever and the confusion do to a body */
  feverStamina: 0.75, confusedSpeed: 0.8,
  /** (the old show's antivirals: the bunker has none) */
  antivirals: {} as Record<string, number>,
} as const;

const H = 3_600_000;

/** The stage now: 0 not infected · 1 incubating · 2 fever · 3 coughing · 4 confused · 5 turning. */
export function stageOf(s: Survivor, t: number): number {
  if (!s.infected) return 0;
  if (s.turnAt) return 5;
  const h = ((t - s.infectedAt) / H) * toughFx(s.st, "toughInfection");
  return h < INFECTION.incubateH ? 1 : h < INFECTION.feverH ? 2 : h < INFECTION.coughH ? 3 : h < INFECTION.turnH ? 4 : 5;
}

/** Hours left before they turn (an antiviral has moved the clock on). */
export const hoursLeft = (s: Survivor, t: number): number => Math.max(0, (INFECTION.turnH - ((t - s.infectedAt) / H) * toughFx(s.st, "toughInfection")) / toughFx(s.st, "toughInfection"));

/** A bite has just started the clock: the honesty gene decides whether they own up to it (to whoever's
 *  near enough to hear), or keep it to themselves. A bite somebody SAW is known anyway. */
export function onInfected(w: SimWorld, s: Survivor, seen: boolean): void {
  if (seen) { reveal(w, s, "saw"); return; }
  // a mind deciding: whether (and when) to own up is theirs (talk/minds.ts decideBite, the job menu's "confess")
  if (w.hooks.aiDecides?.(w)) { note(s.know, w.t, "I got bitten. Nobody saw it happen"); return; }
  const owns = w.rng.chance(0.15 + s.gen.honesty * 0.08);
  if (owns) reveal(w, s, "told");
  else note(s.know, w.t, "I got bitten. Nobody saw. I'm not telling them");
}

/** The group knows (they saw it, were told, or heard the cough). The overlay may show it from now on. */
export function reveal(w: SimWorld, s: Survivor, how: "saw" | "told" | "cough"): void {
  if (s.infKnown) return;
  s.infKnown = true;
  w.ev("infection.known", { victim: s.id, how });
  witness(w, s.x, s.z, s.floor, 18, (o) => (o === s ? null : how === "cough" ? `${cap(s.who)} is coughing like the dead do — infected` : `${cap(s.who)} is infected`));
  if (how !== "saw") w.say(s.who, "confess", { how });
}

/** Every step, for the infected: the stage's effects, the cough, the collapse and the turn. */
export function infectionStep(w: SimWorld, s: Survivor): void {
  if (!s.infected || !s.alive) return;
  const t = w.t;
  const st = stageOf(s, t);
  if (st !== s.sick) {
    s.sick = st;
    if (st === 2) note(s.know, t, "I'm burning up — the fever's started");
    if (st === 3) { note(s.know, t, "I can't stop coughing"); s.nextCough = t + 20_000; }
    if (st === 4) note(s.know, t, "I can't think straight any more");
    if (st >= 2) w.ev("infection.stage", { victim: s.id, stage: st });
  }
  if (st === 2 && s.stamina > INFECTION.feverStamina) s.stamina = INFECTION.feverStamina;
  if (st === 3 || st === 4) {
    if (t >= s.nextCough && s.mode !== "down") {
      s.nextCough = t + w.rng.range(INFECTION.coughGap[0], INFECTION.coughGap[1]) * (st === 4 ? 0.6 : 1);
      w.ev("survivor.cough", { by: s.id, who: s.who, at: pos(s), ...(SUITED.has(s.who) ? { suited: true } : {}) });
      w.noise(s.x, s.z, s.floor, INFECTION.coughNoiseM, s.i, "cough");
      // the others hear what it is
      if (!s.infKnown && w.survivors.some((o) => o !== s && o.alive && o.mode !== "sleep" && o.floor === s.floor && Math.hypot(o.x - s.x, o.z - s.z) < 10)) reveal(w, s, "cough");
    }
  }
  if (st === 5 && !s.turnAt) collapse(w, s);
  if (s.turnAt && t >= s.turnAt) turn(w, s);
}

/** 24 hours: they go down, and a minute later they stand up. */
function collapse(w: SimWorld, s: Survivor): void {
  // mid-crawl (a vent, a ladder): out at the nearer end first, or they lie inside the wall for the
  // minute and stand up there (the Nov 1 2026 review — going down and dying already did this)
  w.endLinkHere(s);
  s.turnAt = w.t + INFECTION.collapseMs;
  // (out cold, flat on their back: the show sinks them into the lying loop — actors.ts limp)
  s.mode = "down"; s.pose = "down"; s.path = null; s.job = null; s.busyAct = ""; s.why = "turning"; s.lie = LIE.lying;
  s.h = w.layHeading(s, s.lie);
  s.downUntil = s.turnAt + 1;   // the bleed-out clock never runs out first
  w.ev("survivor.dying", { victim: s.id, at: pos(s), turning: true });
  witness(w, s.x, s.z, s.floor, 20, (o) => (o === s ? null : `${cap(s.who)} collapsed — they're turning`));
  if (!s.infKnown) reveal(w, s, "cough");
}

/** how long the one who turned takes to get up and scream (show/stance.ts RISE: 3.1 s up off the floor, 2.8 s
 *  of scream) — held still that long, so it isn't hunting while the screen still has it on the floor */
const TURN_RISE_MS = 6000;

/** The turn: the survivor dies (cause "turned", their gear where they fell) and one of the dead stands up
 *  where they lay, in their own body and clothes (the client draws it with the turned look). */
export function turn(w: SimWorld, s: Survivor): void {
  s.cause = "turned";
  s.turnAt = 0;
  w.dieSurvivor(s, "turned");
  // where the body actually lies (dieSurvivor takes anyone still on a link out at its nearer end)
  const cell = s.cell;
  s.turned = true;
  w.emitGone(s.id);
  const z = w.makeZombie("shambler", cell, s.body);
  z.turnedFrom = s.who;
  z.h = s.h;
  z.state = "idle"; z.why = "turned";
  // it gets up off the floor first (the screen plays the rise, ~6 s): it doesn't hunt lying down
  z.stagger = w.t + TURN_RISE_MS;
  w.emitSpawn(z);
  w.ev("survivor.turned", { victim: s.id, by: z.id, who: s.who, at: pos(s) });
  witness(w, s.x, s.z, s.floor, 30, (o) => `${cap(s.who)} turned. That thing has their face.`);
  for (const o of w.survivors) if (o.alive && Math.hypot(o.x - s.x, o.z - s.z) < 25) o.morale = Math.max(0, o.morale - 10);
}

/** An antiviral: the clock stands still 12 h (a survivor who knows they're infected takes one at the fever). */
export function takeAntiviral(w: SimWorld, s: Survivor): boolean {
  const i = s.pack.spare.indexOf("antiviral");
  if (i < 0 || !s.infected) return false;
  s.pack.spare.splice(i, 1);
  w.use("antiviral");
  // the clock stands still 12 h: taken early, it's 12 h of incubation more (stageOf reads a bite "in the
  // future" as not started yet — the dose is still in them)
  s.infectedAt += INFECTION.antiviralH * H;
  w.ev("inject", { by: s.id, at: pos(s), what: "antiviral" });
  note(s.know, w.t, "took an antiviral — it buys me time, nothing more");
  return true;
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const pos = (s: Survivor): [number, number, number] => [Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, Math.round(s.z * 100) / 100];
// (the cough's noise reads the same scale as the others; kept here so a retune sees both)
void NOISE_M;
