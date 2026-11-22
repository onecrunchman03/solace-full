// SOLACE SURVIVORZ — THE BUNKER'S OBJECTIVES (docs/survivorz/BUNKER.md) and the skills that speed them.
// Game code decides every step; the talk layer only voices what happened.
//
//   1. CLOSE THE BLAST DOOR — a hand-crank wheel beside it: alone ~60 s, two ~35 s (21). Interrupted, it keeps
//      its progress and anyone can carry on (fifth round 20). It grinds loudly and draws the dead (24). Shut, it
//      is sealed for good (23) and the trickle stops.
//   2. CLEAR THE BUNKER — every one of the dead inside put down. The audience sees the count; the survivors
//      don't (24, 25).
//   3. THE RADIO — the radio room opens with a code on a note (one of a few spots, picked each run); the set
//      needs a missing part (the workshop or the stores, picked each run) and a ~3-minute repair, faster with
//      Electronics (27, 28). Interrupted, it keeps its progress (fifth round 21); its static draws the dead (22).
//      Then the call.
//   RESCUE comes the moment the door is sealed AND the bunker is clear AND the call is made — an early call
//   means rescue lands on the last kill (follow-up 1). The show ends at rescue (30), when everyone is dead
//   (48), or at four hours with nobody coming (follow-up 2).
import type { SimWorld, Survivor } from "./world";
import type { Goals } from "./wire";
import { note, witness, seeSkill } from "./knowledge";
import { SKILL_START, SKILL_XP, SKILL_FX, NEEDS, MEDIC_AT } from "./tables";
import { SKILL_KEYS, SKILL_INFO, type SkillKey } from "../cast/rules";
import type { SurvivorId } from "./wire";

export type SkillId = SkillKey;
export type SkillSet = Record<SkillKey, number>;
export interface Skills { lv: SkillSet; xp: SkillSet }

const zeros = (): SkillSet => Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as SkillSet;
export const newSkills = (who: SurvivorId): Skills => ({ lv: { ...SKILL_START[who] }, xp: zeros() });

// ---- skills ----------------------------------------------------------------------------------------------
/** Every skill tops out at 10 (the stat + 3 ceiling went with the body stats, Nov 5 2026). */
export const SKILL_MAX = 10;

/** The level they work at right now: what they've learned (or, for a run saved before the skill existed, what
 *  the creator set), less tiredness and the infection's last stage on the skills that need a clear head. */
export function skill(s: Survivor, id: SkillId): number {
  let v = s.skills.lv[id] ?? s.st[id] ?? SKILL_INFO[id].base;
  if (SKILL_INFO[id].dulls) {
    if (s.tiredH > NEEDS.exhaustedAt) v -= 3;
    else if (s.tiredH > NEEDS.tiredAt) v -= 1;
    v -= sicknessPenalty(s);
  }
  return Math.max(0, v);
}

/** First aid 8 or more: the group's medic (keeps the medicine, goes back for the fallen). */
export const isMedic = (s: Survivor): boolean => skill(s, "firstAid") >= MEDIC_AT;

/** Quick learner: how fast they learn (1 at 5, never under half). */
export const learnFx = (s: Survivor): number => Math.max(0.5, 1 + SKILL_FX.learnPerQuick * (skill(s, "quickLearner") - 5));

/** A skill's factor on a knob: 1 - per × level (exactly 1 at level 0), never under 0.3. */
export const skillCut = (s: Survivor, id: SkillId, per: number): number => Math.max(0.3, 1 - per * skill(s, id));

/** Infection's toll on skills (the confused last stage). */
export function sicknessPenalty(s: Survivor): number { return s.infected && s.sick >= 4 ? 3 : 0; }

/** XP for doing the thing; each level costs more. */
export function gainXp(w: SimWorld, s: Survivor, id: SkillId, xp: number): void {
  if (!SKILL_INFO[id].learns) return;
  // (done well in front of the others, they remember who's handy at it — the AI's "from what they've seen")
  if (skill(s, id) >= 6) seeSkill(w, s, id);
  const sk = s.skills;
  sk.lv[id] ??= s.st[id] ?? SKILL_INFO[id].base; sk.xp[id] ??= 0;
  const cap = SKILL_MAX;
  if (sk.lv[id] >= cap) return;
  sk.xp[id] += xp * (s.threats.length ? 1.5 : 1) * learnFx(s);
  while (sk.lv[id] < cap && sk.xp[id] >= SKILL_XP.perLevel * (sk.lv[id] + 1)) {
    sk.xp[id] -= SKILL_XP.perLevel * (sk.lv[id] + 1);
    sk.lv[id]++;
    note(s.know, w.t, `got better at ${SKILL_INFO[id].label.toLowerCase()} (${sk.lv[id]})`);
    w.ev("skill.up", { by: s.id, skill: id, level: sk.lv[id] });
  }
}

// ---- the objectives' numbers --------------------------------------------------------------------------------
export const OBJ = {
  /** the crank: alone this long, two together this long (a third can't get a hand on the wheel) */
  crankAloneMs: 60_000, crankTwoMs: 35_000,
  /** the grind of the crank carries this far (m), every second it turns */
  crankNoiseM: 22,
  /** the radio's repair (base; Electronics shortens it) and its static (m, every few seconds) */
  repairMs: 180_000, staticNoiseM: 16,
  /** each Electronics level makes the repair this much faster */
  electronicsRate: 0.12,
  /** the call itself */
  callMs: 15_000,
  /** the show's clock: no rescue by this, the show ends (follow-up 2). ONE HOUR (Josh, Nov 3 2026, after 100 runs
   *  that finished in ~20 minutes: "shorter stream") — was four */
  showMs: 3_600_000,
} as const;

/** One run's objectives. Every field is plain data (save.ts keeps it). */
export interface Objectives {
  /** the crank's progress, 0..1 */
  crank: number;
  sealedAt: number; sealedBy: string;
  /** where THIS run hides the radio's part and the code's note (one of a few spots each) */
  partSpot: string; noteSpot: string;
  partFoundAt: number; partBy: string;
  codeAt: number; codeBy: string;
  radioOpenAt: number;
  /** the part fitted into the set (the first stroke of the repair) */
  partIn: boolean;
  /** the repair's work done (ms of a base repair) */
  repair: number;
  fixedAt: number; fixedBy: string;
  calledAt: number; calledBy: string;
  /** the first moment the bunker was clear with the door sealed (the count can rise again: a bite turns) */
  clearAt: number;
  /** who put down the last of them */
  clearBy?: string;
  /** the end: rescued · wiped · timeout (the bunker); survived · wiped (a map whose objective is the clock) */
  ending: "" | "rescued" | "wiped" | "timeout" | "escaped" | "survived";
  endedAt: number;
  rescued: string[];
}

export const newObjectives = (partSpot = "", noteSpot = ""): Objectives => ({
  crank: 0, sealedAt: 0, sealedBy: "", partSpot, noteSpot, partFoundAt: 0, partBy: "", codeAt: 0, codeBy: "", radioOpenAt: 0,
  partIn: false, repair: 0, fixedAt: 0, fixedBy: "", calledAt: 0, calledBy: "", clearAt: 0, ending: "", endedAt: 0, rescued: [],
});

/** THE ON-SCREEN COUNT (24): the dead inside the bunker — anywhere but the tunnel outside the blast door. */
export function insideCount(w: SimWorld): number {
  const tunnel = (w.map.arrivals ? w.nav.roomIdx.get(w.map.arrivals.room) : undefined) ?? -1;
  let n = 0;
  for (const z of w.zombies) if (z.alive && !z.gone && z.room !== tunnel) n++;
  return n;
}

/** The crank's speed with `n` hands on it (a fraction of the whole a millisecond). */
export const crankRate = (n: number): number => (n <= 0 ? 0 : n === 1 ? 1 / OBJ.crankAloneMs : 1 / OBJ.crankTwoMs);

/** The repair's speed for this survivor (ms of base work a millisecond). */
export const repairRate = (s: Survivor): number => 1 + OBJ.electronicsRate * skill(s, "electronics");

/** Once a second: the clear, the rescue and the ends. */
export function objectivesTick(w: SimWorld): void {
  const o = w.obj;
  if (o.ending) return;
  const living = w.survivors.filter((s) => s.alive);
  if (!living.length && w.survivors.length) return end(w, "wiped");
  const inside = insideCount(w);
  if (o.sealedAt && inside === 0 && !o.clearAt) {
    o.clearAt = w.t; o.clearBy = w.lastKillBy || "";
    w.ev("bunker.clear", { last: w.lastKillBy || undefined });
  }
  // the count can rise again after a clear (a bitten survivor turns inside): rescue needs it clear NOW
  if (o.sealedAt && inside === 0 && o.calledAt) return end(w, "rescued");
  if (w.t - w.startedAt >= w.showMs) return end(w, "timeout");
}

export function end(w: SimWorld, how: Objectives["ending"], out?: string[]): void {
  const o = w.obj;
  o.ending = how; o.endedAt = w.t;
  o.rescued = out ?? (how === "rescued" ? w.survivors.filter((s) => s.alive).map((s) => s.who) : []);
  w.overAt = w.t;
  w.ev("show.over", { ending: how, rescued: o.rescued, dead: w.survivors.filter((s) => !s.alive).map((s) => s.who) });
  if (how === "rescued") for (const s of w.survivors) if (s.alive) { note(s.know, w.t, "the soldiers came — we're getting out"); w.say(s.who, "rescued"); }
}

/** Somebody fitted the part, cranked the door shut, made the call: everyone near enough knows. */
export function announce(w: SimWorld, s: Survivor, what: string): void {
  witness(w, s.x, s.z, s.floor, 25, (o) => (o === s ? null : what));
}

/** The overlay's view of the objectives (the count is the audience's, never the survivors'). */
export function goalsWire(w: SimWorld): Goals {
  const o = w.obj;
  return {
    door: { crank: Math.round(o.crank * 100) / 100, ...(o.sealedAt ? { sealed: o.sealedAt, by: o.sealedBy } : {}) },
    inside: insideCount(w),
    radio: {
      ...(o.partFoundAt ? { part: true, partAt: o.partFoundAt, partBy: o.partBy } : {}), ...(o.codeAt ? { code: true, codeAt: o.codeAt, codeBy: o.codeBy } : {}),
      ...(o.radioOpenAt ? { open: true } : {}),
      repair: Math.round(Math.min(1, o.repair / OBJ.repairMs) * 100) / 100,
      ...(o.fixedAt ? { fixed: o.fixedAt, fixedBy: o.fixedBy } : {}), ...(o.calledAt ? { called: o.calledAt, by: o.calledBy } : {}),
    },
    ...(o.clearAt ? { clear: o.clearAt, ...(o.clearBy ? { clearBy: o.clearBy } : {}) } : {}),
    startedAt: w.startedAt,
    endsAt: w.startedAt + w.showMs,
    ...(o.ending ? { ending: o.ending, over: true, endedAt: o.endedAt, ...(o.rescued.length ? { rescued: o.rescued.slice() } : {}) } : {}),
  };
}
