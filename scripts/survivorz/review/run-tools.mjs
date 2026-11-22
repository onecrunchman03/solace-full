// SURVIVORZ REVIEW — every "tool" line of the rubric, run (docs/survivorz/RUBRIC.md).
//
//   npm run build && node scripts/survivorz/review/run-tools.mjs [--out dir] [--runs 100]
//
// Runs each script one after another (several bind fixed ports), keeps its whole output in <out>/<name>.txt and
// prints one line each: pass or fail, and its last line. Exit 1 if any failed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = path.resolve(arg("--out", path.join(ROOT, "data", "survivorz-review")));
fs.mkdirSync(OUT, { recursive: true });
const sz = (f, ...a) => [path.join("scripts", "survivorz", f), ...a];
const chk = (f) => [path.join("scripts", "checks", f)];
const TOOLS = [
  ["A1 bodies whole", sz("check-packed.mjs")],
  ["A2 clip choice", sz("anim-show-check.mjs")],
  ["A3 the law", sz("anim-law-show.mjs")],
  ["A4-A8 B2-B3 stored measures", sz("review/score-bodies.mjs", "--json", path.join(OUT, "bodies.json"))],
  ["D4 sound rules", sz("test-audio.mjs")],
  ["I1 effects", sz("fx-check.mjs")],
  ["F6 genes", sz("test-genes.mjs")],
  ["C1 C5 F1 F9 J4 the sim", sz("test-sim.mjs", "--quiet")],
  ["C2 C3 turns and stops", sz("review/move-probe.mjs")],
  ["F7 F8 simulated shows", sz("bunker-sim.mjs", "--runs", arg("--runs", "100"), "--json", path.join(OUT, "bunker-runs.json"))],
  ["G1 H1 H2 director", chk("test_survivorz_director.mjs")],
  ["E2 F1 talk", chk("test_survivorz_talk.mjs")],
  ["J1 resume", chk("test_survivorz_resume.mjs")],
  ["J2 the map", chk("test_bunker_map.mjs")],
  ["J3 the page", chk("test_survivorz_client.mjs")],
  ["broadcast", chk("test_survivorz_broadcast.mjs")],
  ["cast", chk("test_survivorz_cast.mjs")],
];
let bad = 0;
for (const [label, cmd] of TOOLS) {
  const t = Date.now();
  const r = spawnSync(process.execPath, cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 });
  const text = (r.stdout ?? "") + (r.stderr ?? "");
  fs.writeFileSync(path.join(OUT, path.basename(cmd[0]).replace(/\.\w+$/, "") + ".txt"), text);
  const last = text.trim().split("\n").pop()?.slice(0, 110) ?? "";
  if (r.status !== 0) bad++;
  console.log(`${r.status === 0 ? "ok  " : "FAIL"} ${label.padEnd(30)} ${String(Math.round((Date.now() - t) / 1000)).padStart(4)}s  ${last}`);
}
console.log(bad ? `${bad} failed — outputs in ${OUT}` : `all green — outputs in ${OUT}`);
process.exit(bad ? 1 : 0);
