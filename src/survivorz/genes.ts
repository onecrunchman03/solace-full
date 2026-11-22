// SOLACE SURVIVORZ — the survivors' genes (SURVIVORZ.md §7).
//
// Josh, 2026-10-22: the TEN-gene set (the design's seven with Altruism split
// into Generosity and Loyalty, plus Temper and Honesty), and genes that DRIFT
// with what happens to a survivor, inside a range set by who they are.
//
// THE LINE (unchanged from §7): genes change what a survivor CHOOSES, never
// what they CAN do. What they can do is their SKILLS (cast/rules.ts SKILL_INFO,
// the one list since Nov 5 2026); the genes are the person's. Five came with the
// skills round: Courage, Optimism, Humour, Composure, Ruthlessness. Everything here is pure, on a 0-10
// scale, and the behaviour code reads a gene only through the functions at the
// bottom, so a retune is one number in one place.

import { ALL_IDS, tableOf } from "./cast";
import { GENE_KEYS, GENE_BASE, genesOf } from "./cast/rules";

export const GENES = GENE_KEYS;
export type Gene = (typeof GENES)[number];
export type Genome = Record<Gene, number>;

/** A character's id (their file, src/survivorz/cast/<id>.json). */
export type SurvivorId = string;
/** everyone who can be in the show: the cast who walk in, and the bench (SURVIVORZ.md §6), in spawn order */
export const SURVIVORS: SurvivorId[] = ALL_IDS;

/** What each gene moves, in a sentence (the readouts and the death report). */
export const GENE_MEANS: Record<Gene, string> = {
  selfPreservation: "when they break off and run; how low they let their health go",
  caution: "how far from safety they go, how quietly, whether they travel at night",
  generosity: "how much of what they find goes in the shared box, and to whom",
  loyalty: "how much risk they take for someone else: going back, pulling a zombie off",
  trust: "how quickly they believe people and follow a plan; how hard a betrayal hits",
  sociability: "staying with the group versus going alone; how being alone wears on them",
  curiosity: "how hard they chase logs, terminals and secrets",
  assertiveness: "leading or following; arguing a plan or giving in",
  temper: "how fast friction turns into a row, and how slowly they forgive",
  honesty: "telling the truth, owning up, or hiding a stash (Dale's painkillers)",
  courage: "standing their ground versus hanging back: whether they go in first, go alone, or wait for company",
  optimism: "hope versus despair; how being hurt and losing people weighs on them",
  humour: "joking under pressure: lifting the room or grating on it",
  composure: "keeping calm versus panicking; how fast fear builds in them",
  ruthlessness: "willing to leave people behind, take what they need, and do the hard thing",
};

/** THE STARTING GENOMES (Josh picked the first six, 2026-10-22), 0-10 — each character's file (a gene left out is 5). */
export const START: Record<SurvivorId, Genome> = tableOf((c) => genesOf(c));

/** A gene, safely: a run saved before the gene existed has none for it (it reads as 5). */
export const gene = (g: Partial<Genome>, k: Gene): number => g[k] ?? GENE_BASE;

// ---- DRIFT ---------------------------------------------------------------------
// A gene moves a little with what happens, never further than DRIFT_RANGE
// from where the person started ("Rick never becomes a coward"), and never
// faster than DRIFT_PER_DAY in a day, so one bad night doesn't rewrite anyone.

export const DRIFT_RANGE = 2;
export const DRIFT_PER_DAY = 1;

/** The things that change a person, and by how much (per occurrence). */
export const EXPERIENCES = {
  nearDeath: { selfPreservation: +0.5, caution: +0.3 },
  bitten: { selfPreservation: +0.3, caution: +0.4, temper: +0.2 },
  savedBySomeone: { trust: +0.3, loyalty: +0.3 },
  savedSomeone: { loyalty: +0.2, assertiveness: +0.2 },
  abandoned: { trust: -0.6, loyalty: -0.3, temper: +0.3 },
  betrayed: { trust: -0.8, temper: +0.4, generosity: -0.3 },
  friendDied: { caution: +0.3, sociability: -0.2, temper: +0.2 },
  friendDiedSaving: { loyalty: +0.4, selfPreservation: -0.2 },
  stolenFrom: { generosity: -0.4, trust: -0.4, honesty: -0.2 },
  sharedWith: { generosity: +0.2, trust: +0.2 },
  caughtLying: { honesty: +0.3, assertiveness: -0.2 },
  ledAWin: { assertiveness: +0.3, selfPreservation: -0.1 },
  ledALoss: { assertiveness: -0.4, caution: +0.2 },
  aloneTooLong: { sociability: +0.3, caution: +0.2 },
  foundTheTruth: { curiosity: +0.3 },
  fight: { temper: +0.2, trust: -0.2 },
  madeUp: { temper: -0.3, trust: +0.2 },
} satisfies Record<string, Partial<Genome>>;
export type Experience = keyof typeof EXPERIENCES;

export interface GeneState {
  who: SurvivorId;
  genome: Genome;
  /** drift used today, per gene, and the day it's counted for */
  today: { day: string; used: Partial<Record<Gene, number>> };
}

export function newGeneState(who: SurvivorId): GeneState {
  return { who, genome: { ...START[who] }, today: { day: "", used: {} } };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** The range a gene may drift inside for this person. */
export function driftRange(who: SurvivorId, g: Gene): [number, number] {
  const s = START[who][g];
  return [clamp(s - DRIFT_RANGE, 0, 10), clamp(s + DRIFT_RANGE, 0, 10)];
}

/** Apply an experience. Returns what actually moved (after both caps). */
export function experience(st: GeneState, what: Experience, day: string): Partial<Genome> {
  if (st.today.day !== day) st.today = { day, used: {} };
  const moved: Partial<Genome> = {};
  for (const [g, delta] of Object.entries(EXPERIENCES[what]) as [Gene, number][]) {
    const used = st.today.used[g] ?? 0;
    const room = DRIFT_PER_DAY - Math.abs(used);
    if (room <= 0) continue;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), room);
    const [lo, hi] = driftRange(st.who, g);
    const before = st.genome[g];
    const after = round(clamp(before + step, lo, hi));
    if (after === before) continue;
    st.genome[g] = after;
    st.today.used[g] = round(used + Math.abs(after - before));
    moved[g] = round(after - before);
  }
  return moved;
}

// ---- WHAT A GENE SETS ------------------------------------------------------------
// The behaviour layers (reflexes, jobs, the group's day, talk) ask these, never
// the raw number. Each is a straight line between two ends, chosen so the
// middle of the scale is an ordinary person. Tuned later in the simulator.

const lerp = (a: number, b: number, g: number) => a + (b - a) * (clamp(g, 0, 10) / 10);

/** Health share (0-1) below which they break off and run. 10 → at 55%, 0 → at 10%. */
export const fleeHealth = (g: Genome) => lerp(0.1, 0.55, g.selfPreservation);

/** How many zombies they'll take on before backing off, given their combat stat. */
export const fightOdds = (g: Genome, combat: number) => Math.max(1, Math.round(lerp(1, 6, 10 - g.selfPreservation) * (combat / 6)));

/** How many rooms from the nearest safe room they'll wander. 10 → 3, 0 → 14. */
export const maxRange = (g: Genome) => Math.round(lerp(14, 3, g.caution));

/** Chance (0-1) they move quietly when they don't have to. */
export const sneakChance = (g: Genome) => lerp(0.1, 0.9, g.caution);

/** Whether they'll travel at night without being told to. */
export const nightTravel = (g: Genome) => g.caution < 4;

/** Share (0-1) of what they find that goes in the shared box. 10 → 95%, 0 → 20%. */
export const boxShare = (g: Genome) => lerp(0.2, 0.95, g.generosity);

/** Chance (0-1) they go back for someone in trouble, by how much they like them (-100..100). Ruthlessness takes
 *  a share off it (6% a point over 5; exactly as before at 5). */
export function goBackChance(g: Genome, regard: number): number {
  const base = lerp(0.05, 0.85, g.loyalty);
  const fondness = clamp((regard + 100) / 200, 0, 1);      // a stranger 0.5, a best friend 1
  const hard = clamp(1 - 0.06 * (gene(g, "ruthlessness") - 5), 0.6, 1.3);
  return clamp(base * (0.5 + fondness) * hard, 0, 1);
}

/** Composure: what the dead around them do to their nerve (×, 1 at 5; 10 → 0.7, 0 → 1.3). */
export const nerveFx = (g: Genome): number => clamp(1 - 0.06 * (gene(g, "composure") - 5), 0.6, 1.4);

/** Optimism: how much being hurt frightens them (×, 1 at 5; 10 → 0.75, 0 → 1.25). */
export const hopeFx = (g: Genome): number => clamp(1 - 0.05 * (gene(g, "optimism") - 5), 0.6, 1.4);

/** Where their regard for somebody new starts (-100..100). */
export const firstRegard = (g: Genome) => Math.round(lerp(-20, 30, g.trust));

/** How much a betrayal costs in regard, multiplied by this (low trust remembers longer). */
export const betrayalWeight = (g: Genome) => lerp(2, 0.8, g.trust);

/** Chance (0-1) they accept a plan from someone they think of at `regard`. */
export function acceptPlan(g: Genome, regard: number): number {
  const t = lerp(0.2, 0.9, g.trust);
  const said = clamp((regard + 100) / 200, 0, 1);
  const pushback = lerp(0, 0.35, g.assertiveness);
  return clamp(t * (0.4 + 0.6 * said) - pushback * 0.5, 0.02, 0.98);
}

/** The fewest people they want with them; below it morale falls. 10 → 3, 0 → 0. */
export const wantCompany = (g: Genome) => Math.round(lerp(0, 3, g.sociability));

/** Weight (0-1) on chasing logs and secrets when choosing the day's job. */
export const clueWeight = (g: Genome) => lerp(0.05, 0.8, g.curiosity);

/** Chance (0-1) they speak up with their own plan at the morning call. */
export const proposeChance = (g: Genome) => lerp(0.02, 0.8, g.assertiveness);

/** Friction (0-100) it takes before a disagreement turns into a row. 10 → 20, 0 → 90. */
export const rowAt = (g: Genome) => Math.round(lerp(90, 20, g.temper));

/** Friction that fades per day (forgiveness). 10 → 5, 0 → 30. */
export const forgiveRate = (g: Genome) => Math.round(lerp(30, 5, g.temper));

/** Chance (0-1) they keep something back in secret when they find it. */
export const stashChance = (g: Genome) => lerp(0.6, 0.0, g.honesty);

/** Chance (0-1) they own up when asked straight. */
export const ownUpChance = (g: Genome) => lerp(0.1, 0.95, g.honesty);
