// SURVIVORZ: re-runs the bake's animation steps on bodies already baked — for a change to the clips or the
// recipes that every body must carry (realism round 14: the shoulders, the torch jogs, the standing glance).
// The same commands as creator/bake.mjs STEPS from "shoulders" on, for the seven made by hand too (bake.mjs
// refuses them), WITHOUT the grabs-and-bites step (an hour a body, and nothing in the survivor's own clips it
// reads changes). Stages only: sending a body to the server is a separate step.
//   node scripts/survivorz/rebake.mjs <body> [<body> ...]   |   --all
//   (the page server on 8791 must be running: node scripts/serve-root.mjs 8791)
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bodies from "./bodies.cjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const ids = args.includes("--all") ? bodies.survivorIds() : args.filter((a) => !a.startsWith("--"));
const S = (f) => path.join(ROOT, "scripts", "survivorz", f);
const run = (id, f, ...a) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [S(f), ...a], { cwd: ROOT, encoding: "utf8", env: { ...process.env, EXCHANGE_PROVIDER: "off" }, maxBuffer: 1 << 28 });
  const tail = ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n").slice(-3).join(" | ");
  console.log(`[${new Date().toISOString()}] ${id} ${f} ${a.slice(1).join(" ")} → ${r.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s  ${tail.slice(0, 300)}`);
  return r.status === 0;
};
// (the five build groups side by side, as the bake runs them)
const runAsync = (id, f, ...a) => new Promise((res) => {
  const t0 = Date.now(); let out = "";
  const p = spawn(process.execPath, [S(f), ...a], { cwd: ROOT, env: { ...process.env, EXCHANGE_PROVIDER: "off" } });
  p.stdout.on("data", (d) => { out = (out + d).slice(-2000); }); p.stderr.on("data", (d) => { out = (out + d).slice(-2000); });
  p.on("close", (code) => { console.log(`[${new Date().toISOString()}] ${id} ${f} ${a.slice(1).join(" ")} → ${code} in ${((Date.now() - t0) / 1000).toFixed(0)}s  ${out.trim().split("\n").slice(-2).join(" | ").slice(0, 300)}`); res(code === 0); });
});
for (const id of ids) {
  const creator = !bodies.BUILT_IN[id];
  const steps = [
    ["anim-shoulders.mjs", id], ["pack.mjs", id],
    ["anim-natural.cjs", id],
    ["anim-build.cjs", id, "--clean"], ["pack.mjs", id],
    ["anim-build.cjs", id, "--gun-cal"],
    ["PARALLEL", ...["*", "gr:", "gs:", "gp:", "hd:"].map((g) => ["anim-build.cjs", id, g])],
    ["pack.mjs", id],
    ["anim-clip.cjs", id], ["anim-law-recorded.cjs", id], ["pack.mjs", id],
    ["anim-ground.cjs", id], ["anim-ground-fix.mjs", id], ["pack.mjs", id], ["anim-floor-fix.mjs", id], ["pack.mjs", id],
    ["anim-clip.cjs", id], ["anim-contact.cjs", id],
    ...(fs.existsSync(S("anim-spare.mjs")) ? [["anim-spare.mjs", id]] : []),
    ["anim-law-show.mjs", "--only", id],
    ...(creator ? [["loop-speeds.mjs", id, "--out", path.join(bodies.STAGE, "creator", id, "loopspeed.json")]] : []),
  ];
  // (the pack and holster fits are NOT re-measured here: a re-bake changes clips, and the fits ship in the page's
  // kit-fit.json or sit on the server's shelf. After a change to a loop, run kit-fit.mjs and kit-stow.mjs by name.)
  let ok = true;
  for (const [f, ...a] of steps) {
    if (f === "PARALLEL") { if (!(await Promise.all(a.map((c) => runAsync(id, ...c)))).every(Boolean)) { ok = false; break; } continue; }
    if (!run(id, f, ...a)) { ok = false; if (f !== "anim-law-show.mjs") break; }
  }
  console.log(`[${new Date().toISOString()}] ${id}: ${ok ? "DONE" : "STOPPED"}`);
}
