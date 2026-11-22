// SOLACE SURVIVORZ — the survivors' genes (src/survivorz/genes.ts).
//
// Run:  npm run build && node scripts/survivorz/test-genes.mjs
//
// The decisions Josh made (2026-10-22) and the rules that keep them honest:
// fifteen genes, every survivor's starting genome as picked, drift that can never
// carry a person more than DRIFT_RANGE from who they are nor more than
// DRIFT_PER_DAY in a day, and every behaviour dial moving the RIGHT way with
// its gene (a braver person runs later, a more generous one shares more).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const G = require(path.join(ROOT, "dist/survivorz/genes.js"));
const { GENES, SURVIVORS, START, GENE_MEANS, EXPERIENCES, DRIFT_RANGE, DRIFT_PER_DAY, newGeneState, experience, driftRange } = G;

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

console.log("-- the set");
// (ten on 2026-10-22; courage, optimism, humour, composure and ruthlessness were added with the character files,
// Nov 5 2026 — this still said ten, and failed, until the Nov 12 review)
ok(GENES.length === 15 && new Set(GENES).size === 15, "fifteen genes, each once");
ok(GENES.every((g) => typeof GENE_MEANS[g] === "string" && GENE_MEANS[g].length > 10), "every gene says what it moves");
ok(SURVIVORS.length >= 6 && SURVIVORS.every((s) => START[s]), "the cast and the bench, each with a starting genome");
ok(SURVIVORS.every((s) => GENES.every((g) => Number.isInteger(START[s][g]) && START[s][g] >= 0 && START[s][g] <= 10)), "every starting gene is a whole number 0-10");
ok(SURVIVORS.every((s) => Object.keys(START[s]).length === GENES.length), "no survivor has a gene the set doesn't");
// Josh's picked draft, pinned so an edit is a decision, not a drift
const picked = {
  johanna: [9, 6, 8, 8, 6, 7, 6, 4, 2, 8], dale: [6, 7, 3, 5, 3, 3, 4, 5, 6, 3], ben: [3, 2, 6, 7, 7, 8, 5, 6, 8, 6],
  rick: [5, 6, 7, 9, 5, 7, 5, 9, 4, 9], sarah: [8, 7, 2, 3, 4, 9, 3, 6, 5, 2], rollo: [7, 3, 5, 4, 6, 6, 8, 3, 5, 4],
};
// (the first ten genes, as picked on 2026-10-22. A character is edited in the creator now, and that is a decision:
// a change from the picks is SAID here, not failed — the files are the truth, test_survivorz_cast holds them)
const moved = Object.keys(picked).filter((s) => START[s] && !picked[s].every((v, i) => START[s][GENES[i]] === v));
ok(Object.keys(picked).every((s) => START[s] && GENES.slice(0, 10).every((g) => Number.isInteger(START[s][g]))), "the six who walked in first each have a genome" + (moved.length ? ` (changed since the first picks: ${moved.join(", ")})` : " (the first ten genes as first picked)"));
ok(Object.values(EXPERIENCES).every((e) => Object.keys(e).every((g) => GENES.includes(g))), "every experience names real genes");

console.log("-- drift");
{
  const st = newGeneState("rick");
  const day = "2026-11-01";
  let total = 0;
  for (let i = 0; i < 50; i++) total += Object.values(experience(st, "betrayed", day)).reduce((a, b) => a + Math.abs(b), 0);
  ok(Math.abs(st.genome.trust - START.rick.trust) <= DRIFT_PER_DAY + 1e-9, `fifty betrayals in one day move trust at most ${DRIFT_PER_DAY}`);
  for (let d = 2; d < 30; d++) for (let i = 0; i < 10; i++) experience(st, "betrayed", `2026-11-${String(d).padStart(2, "0")}`);
  const [lo, hi] = driftRange("rick", "trust");
  ok(st.genome.trust === lo && lo === Math.max(0, START.rick.trust - DRIFT_RANGE), `a month of betrayals bottoms trust out at ${DRIFT_RANGE} under where Rick started, no further`);
  const s2 = newGeneState("rick");
  for (let d = 1; d < 30; d++) for (let i = 0; i < 10; i++) experience(s2, "nearDeath", `2026-11-${String(d).padStart(2, "0")}`);
  ok(s2.genome.selfPreservation === Math.min(10, START.rick.selfPreservation + DRIFT_RANGE), "a month of near deaths makes Rick more careful, by the cap and no more: he never becomes a coward");
  const s3 = newGeneState("johanna");
  for (let d = 1; d < 30; d++) for (let i = 0; i < 10; i++) experience(s3, "nearDeath", `2026-11-${String(d).padStart(2, "0")}`);
  ok(s3.genome.selfPreservation === 10, "nothing drifts past 10");
  const s4 = newGeneState("ben");
  const moved = experience(s4, "savedBySomeone", "2026-11-01");
  ok(moved.trust > 0 && moved.loyalty > 0 && s4.genome.trust > START.ben.trust, "being saved raises trust and loyalty, and the call says what moved");
  const s5 = newGeneState("dale");
  experience(s5, "stolenFrom", "2026-11-01");
  ok(s5.genome.generosity < START.dale.generosity && s5.genome.trust < START.dale.trust, "being stolen from makes you tighter and warier");
  const before = JSON.stringify(START);
  newGeneState("sarah"); experience(newGeneState("sarah"), "betrayed", "x");
  ok(JSON.stringify(START) === before, "drift never touches the starting genomes themselves");
}

console.log("-- what the genes set");
const at = (g, v) => ({ ...START.rick, [g]: v });
const rising = (fn, g, ...rest) => { for (let v = 0; v < 10; v++) if (!(fn(at(g, v + 1), ...rest) >= fn(at(g, v), ...rest))) return false; return true; };
const falling = (fn, g, ...rest) => { for (let v = 0; v < 10; v++) if (!(fn(at(g, v + 1), ...rest) <= fn(at(g, v), ...rest))) return false; return true; };
ok(rising(G.fleeHealth, "selfPreservation") && G.fleeHealth(at("selfPreservation", 10)) <= 0.6 && G.fleeHealth(at("selfPreservation", 0)) >= 0.05, "more self-preservation = they run at a higher health, between ~10% and ~55%");
ok(falling(G.fightOdds, "selfPreservation", 6), "…and take on fewer zombies before backing off");
ok(G.fightOdds(START.rick, 9) > G.fightOdds(START.rick, 3), "the same courage with a better combat stat takes on more (the stat is the body's)");
ok(falling(G.maxRange, "caution") && rising(G.sneakChance, "caution"), "more caution = they stay closer to safety and move more quietly");
ok(G.nightTravel(START.ben) && !G.nightTravel(START.dale), "Ben will travel at night on his own; Dale won't");
ok(rising(G.boxShare, "generosity"), "more generosity = more of what they find goes in the box");
ok(rising((g) => G.goBackChance(g, 0), "loyalty") && G.goBackChance(START.rick, 80) > G.goBackChance(START.rick, -80), "more loyalty = more likely to go back for someone; more so for a friend than a rival");
ok(rising(G.firstRegard, "trust") && falling(G.betrayalWeight, "trust"), "more trust = a warmer first impression and a betrayal that hits less hard");
ok(rising((g) => G.acceptPlan(g, 50), "trust") && falling((g) => G.acceptPlan(g, 50), "assertiveness"), "trust makes them follow a plan; assertiveness makes them push back");
ok(G.acceptPlan(START.rick, 90) > G.acceptPlan(START.rick, -90), "…and they follow a plan from someone they like more readily");
ok(rising(G.wantCompany, "sociability") && rising(G.clueWeight, "curiosity") && rising(G.proposeChance, "assertiveness"), "sociability wants company, curiosity chases clues, assertiveness speaks up");
ok(falling(G.rowAt, "temper") && falling(G.forgiveRate, "temper"), "more temper = a row comes sooner and fades slower");
ok(falling(G.stashChance, "honesty") && rising(G.ownUpChance, "honesty"), "more honesty = less hidden stashing, more owning up");
ok(G.stashChance(START.dale) > 0.35 && G.stashChance(START.rick) < 0.1, "Dale keeps things back (his painkillers); Rick almost never does");
ok(G.proposeChance(START.rick) > G.proposeChance(START.rollo) * 2, "Rick speaks up with a plan far more than Rollo (leadership is organic, but leans his way)");
ok(G.fleeHealth(START.johanna) > G.fleeHealth(START.ben), "Johanna's survival instinct runs earlier than Ben's");

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
