// SOLACE SURVIVORZ — THE BUNKER, SIMULATED (docs/survivorz/BUNKER.md, step 3: "~100 simulated runs before Josh
// sees the objectives step"). Runs whole one-hour shows headless on game code alone (no language model — the
// minds' menus fall back to code's own pick), and prints what happened in each and across them all.
//
//   npm run build && node scripts/survivorz/bunker-sim.mjs [--runs 100] [--seed 1] [--hours 1] [--verbose]
//   (--json <file> writes every run's numbers)
//
// What a run reports: how it ended (rescued · wiped · timeout) and when, when each objective step happened and
// who did it, the dead at the end, deaths and their causes, kills, the trickle, the combat profile.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { SimWorld } = require(path.join(ROOT, "dist/survivorz/sim/world.js"));
const { insideCount } = require(path.join(ROOT, "dist/survivorz/sim/goals.js"));

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("runs", 10)), SEED0 = Number(arg("seed", 1)), HOURS = Number(arg("hours", 1));
const VERBOSE = process.argv.includes("--verbose");
const JSON_OUT = arg("json", "");
const STEP = 100;

const mm = (ms) => { if (!ms) return "—"; const m = Math.round(ms / 60_000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const runs = [];
const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const seed = SEED0 + r;
  const w = new SimWorld({ seed, start: 1_800_000_000_000, stepMs: STEP });
  const start = w.startedAt;
  const deaths = [];
  w.onFrame((f) => { if (f.type === "ev" && f.event === "survivor.dead") deaths.push({ who: String(f.victim).slice(2), cause: f.cause, t: f.t - start }); });
  const limit = HOURS * 3_600_000;
  const began = Date.now();
  while (!w.overAt && w.t - start < limit) w.tick(60_000);
  const o = w.obj;
  const rel = (t) => (t ? t - start : 0);
  const res = {
    seed, ending: o.ending || "running", endedAt: rel(o.endedAt || w.t),
    sealed: rel(o.sealedAt), sealedBy: o.sealedBy, code: rel(o.codeAt), codeBy: o.codeBy, part: rel(o.partFoundAt), partBy: o.partBy,
    radioOpen: rel(o.radioOpenAt), fixed: rel(o.fixedAt), fixedBy: o.fixedBy, called: rel(o.calledAt), calledBy: o.calledBy, clear: rel(o.clearAt),
    armory: rel(w.armoryOpenAt), inside: insideCount(w), alive: w.survivors.filter((s) => s.alive).map((s) => s.who), deaths,
    kills: w.stats.zombiesKilled, arrived: w.stats.arrivals.dead, downs: w.stats.downs, revives: w.stats.revives, bites: w.stats.bites, shots: w.stats.shots,
    jobFails: w.stats.jobFails, jobFailAt: w.stats.jobFailAt ?? {}, knowLeaks: w.stats.knowLeaks, reachOver: w.stats.reach.over, reachOverBy: w.stats.reach.overBy ?? {}, wallMs: Date.now() - began,
    partSpot: o.partSpot, noteSpot: o.noteSpot,
  };
  runs.push(res);
  console.log(`run ${String(r + 1).padStart(3)} seed ${seed}: ${res.ending.padEnd(8)} at ${mm(res.endedAt)} · sealed ${mm(res.sealed)}${res.sealedBy ? " (" + res.sealedBy + ")" : ""} · code ${mm(res.code)} · part ${mm(res.part)} · fixed ${mm(res.fixed)} · called ${mm(res.called)} · clear ${mm(res.clear)} · armory ${mm(res.armory)} · inside ${res.inside} · alive ${res.alive.length} · kills ${res.kills} (+${res.arrived} came in) · ${res.wallMs} ms`);
  if (VERBOSE) {
    for (const d of deaths) console.log(`    dead: ${d.who} at ${mm(d.t)} — ${d.cause}`);
    const fails = Object.entries(res.jobFails).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`).join(", ");
    if (fails) console.log(`    job fails: ${fails}`);
  }
}
// ---- across the runs ----
const n = runs.length, pct = (k) => `${Math.round((k / n) * 100)}%`;
const by = (e) => runs.filter((r) => r.ending === e).length;
const med = (xs) => { const a = xs.filter((x) => x > 0).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const reached = (k) => runs.filter((r) => r[k] > 0).length;
console.log(`\n${n} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`ENDINGS: rescued ${by("rescued")} (${pct(by("rescued"))}) · wiped ${by("wiped")} (${pct(by("wiped"))}) · timeout ${by("timeout")} (${pct(by("timeout"))})${by("running") ? ` · still running ${by("running")}` : ""}`);
console.log(`STEPS (reached, median time): sealed ${reached("sealed")} ${mm(med(runs.map((r) => r.sealed)))} · armory ${reached("armory")} ${mm(med(runs.map((r) => r.armory)))} · code ${reached("code")} ${mm(med(runs.map((r) => r.code)))} · part ${reached("part")} ${mm(med(runs.map((r) => r.part)))} · radio room ${reached("radioOpen")} ${mm(med(runs.map((r) => r.radioOpen)))} · fixed ${reached("fixed")} ${mm(med(runs.map((r) => r.fixed)))} · called ${reached("called")} ${mm(med(runs.map((r) => r.called)))} · clear ${reached("clear")} ${mm(med(runs.map((r) => r.clear)))}`);
const rescuedAt = med(runs.filter((r) => r.ending === "rescued").map((r) => r.endedAt));
console.log(`RESCUE: median ${mm(rescuedAt)} · survivors at the end: ${(runs.reduce((a, r) => a + r.alive.length, 0) / n).toFixed(1)} of 6 on average`);
const causes = {};
for (const r of runs) for (const d of r.deaths) causes[d.cause] = (causes[d.cause] ?? 0) + 1;
console.log(`DEATHS: ${(runs.reduce((a, r) => a + r.deaths.length, 0) / n).toFixed(2)} a run · ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`COMBAT (a run): kills ${(runs.reduce((a, r) => a + r.kills, 0) / n).toFixed(1)} · came in ${(runs.reduce((a, r) => a + r.arrived, 0) / n).toFixed(1)} · downs ${(runs.reduce((a, r) => a + r.downs, 0) / n).toFixed(1)} · revives ${(runs.reduce((a, r) => a + r.revives, 0) / n).toFixed(1)} · bites ${(runs.reduce((a, r) => a + r.bites, 0) / n).toFixed(1)} · shots ${(runs.reduce((a, r) => a + r.shots, 0) / n).toFixed(0)}`);
const allFails = {};
for (const r of runs) for (const [k, v] of Object.entries(r.jobFails)) allFails[k] = (allFails[k] ?? 0) + v;
if (process.argv.includes("--where")) {
  const at = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.jobFailAt)) at[k] = (at[k] ?? 0) + v;
  console.log("JOB FAILS, WHERE (all runs):");
  for (const [k, v] of Object.entries(at).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
console.log(`JOB FAILS (a run): ${Object.entries(allFails).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(" · ")}`);
{ const by = {}; for (const r of runs) for (const [k, v] of Object.entries(r.reachOverBy)) by[k] = (by[k] ?? 0) + v; if (Object.keys(by).length) console.log(`OUT OF REACH, BY WHAT: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`); }
console.log(`CHECKS: knowledge leaks ${runs.reduce((a, r) => a + r.knowLeaks, 0)} · interactions out of reach ${runs.reduce((a, r) => a + r.reachOver, 0)}`);
if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(runs, null, 1)); console.log(`→ ${JSON_OUT}`); }
