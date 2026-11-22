// SURVIVORZ, GLENRIDGE HALL: play whole shows on the mansion on game code alone (no AI) and say what happened.
//   node scripts/survivorz/glenridge/run-show.mjs [seeds=5] [minutes=60] [--events]
// Run after `npm run build`. One line a seed: when each objective was done, how it ended, who died; then what the
// jobs failed at. A tool for tuning the scenario's dials (src/survivorz/sim/scenarios/glenridge.ts).
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { SimWorld } = require(path.join(ROOT, "dist", "survivorz", "sim", "world.js"));
const SEEDS = Number(process.argv[2] ?? 5), MIN = Number(process.argv[3] ?? 60), EVENTS = process.argv.includes("--events");
const mm = (t, t0) => (t ? ((t - t0) / 60000).toFixed(1) : "  - ");
const fails = {}; const ends = {}; let threw = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const t0 = 1_800_000_000_000; let w;
  try { w = new SimWorld({ map: "glenridge", seed, start: t0 }); } catch (e) { console.log(`seed ${seed}: would not build: ${e.stack ?? e.message}`); threw++; continue; }
  const log = [];
  w.onFrame((f) => { if (EVENTS && f.type === "ev" && !/^(step|door\.|box\.|zombie\.(idle|moan)|survivor\.(pain|breath)|item\.|hammer|eat|drink|skill)/.test(f.event)) log.push(`${mm(w.t, t0).padStart(5)} ${f.event}${f.by ? " " + f.by : ""}${f.crest ? " " + f.crest : ""}`); });
  let err = null;
  try { for (let t = 0; t < MIN * 60_000 && !w.obj.ending; t += 100) w.tick(100); } catch (e) { err = e; }
  const g = w.sc, o = w.obj;
  const boarded = Object.keys(g.boarded).length;
  const dead = w.survivors.filter((s) => !s.alive).length, zdead = w.zombies.filter((z) => !z.alive).length;
  console.log(`seed ${String(seed).padStart(2)}: bolt ${mm(g.boltedAt, t0)}  boards ${boarded}/5  clear ${mm(g.clearAt, t0)}  dark ${mm(g.darkAt, t0)} light ${mm(g.lightAt, t0)}  | ${o.ending || "running"} at ${mm(o.endedAt || w.t, t0)}  dead ${dead}/${w.survivors.length}  killed ${zdead}/${w.zombies.length}${err ? "  THREW: " + (err.stack ?? err.message).split("\n").slice(0, 3).join(" | ") : ""}`);
  if (err) threw++;
  if (EVENTS) console.log(log.map((l) => "    " + l).join("\n"));
  ends[o.ending || "running"] = (ends[o.ending || "running"] ?? 0) + 1;
  for (const [k, n] of Object.entries(w.stats.jobFailAt ?? {})) fails[k] = (fails[k] ?? 0) + n;
}
console.log("endings:", JSON.stringify(ends), threw ? `  THREW in ${threw}` : "");
console.log("job fails, most first:"); for (const [k, n] of Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(n).padStart(4)}  ${k}`);
