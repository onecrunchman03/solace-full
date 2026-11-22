// SURVIVORZ: THE LAW, read for every clip the show can play (Oct 31 2026). The bake measured every clip on
// every survivor body (anim-clip.cjs → anim/<body>/clip.json: how deep any arm, hand or leg goes inside the
// body's own torso, at 12 moments); this reads that measure back for exactly the clips the show keeps
// (client/src/survivorz/show/stance.ts keepClip — the pose table, the events' clips, the pairs' survivor
// halves) and fails any past the line (3 cm, Rollo's suit 6) that the game would still pick on that body
// (LAW_FAILS lists the measured few it never picks). A HIP FOLD is contact, not a clip (SURVIVORZ.md §10).
// The pairs' halves against EACH OTHER are the finisher table's (docs/survivorz/finisher-fit.json): a pair
// not in it never plays (show/pairs.ts reads pairs.json, made from it).
//   node scripts/survivorz/anim-law-show.mjs [--only carla,eric]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { ROOT, STAGE } from "./lib-loadbody.mjs";

const S = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "stance.ts")).href);
const only = (() => { const i = process.argv.indexOf("--only"); return i >= 0 ? process.argv[i + 1].split(",") : null; })();
// (every survivor body, the creator's too: bodies.cjs)
const SURVIVORS = (await import(pathToFileURL(path.join(ROOT, "scripts", "survivorz", "bodies.cjs")).href)).default.survivorIds().filter((b) => !only || only.includes(b));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

let fails = 0, measured = 0, unmeasured = 0;
for (const body of SURVIVORS) {
  const doc = await io.read(path.join(STAGE, "game", `${body}.glb`));
  // the clips the show keeps on this body (what a load would keep: actors.ts body())
  // (the pack's own fz- halves aren't in the self-measure: anim-clip.cjs skips them — the table judges them)
  const kept = doc.getRoot().listAnimations().map((a) => a.getName()).filter((n) => S.keepClip(n) && !/^(fz|zd)-/.test(n));
  const law = JSON.parse(fs.readFileSync(path.join(STAGE, "anim", body, "clip.json"), "utf8"));
  // A CREATOR BODY'S PAIR HALVES play only where its pairs file offers them (creator/<body>/pairs.json, from
  // pair-sweep.cjs, which leaves out a half that goes through its own body): one it doesn't offer never plays,
  // so it isn't judged here (Nov 5 2026 — Renner's pull-off on zombie-m09, one vertex 5 cm in, failed his bake)
  const pf = path.join(STAGE, "creator", body, "pairs.json");
  const offered = fs.existsSync(pf) ? (() => {
    const p = JSON.parse(fs.readFileSync(pf, "utf8")), on = new Set();
    for (const z of Object.keys(p.pull?.[body] ?? {})) on.add(`zv-pull-off-${z}`);
    for (const by of Object.values(p.bites ?? {})) for (const part of Object.keys(by[body] ?? {})) on.add(`bd-bitten-${part}`);
    return on;
  })() : null;
  const plays = (n) => !offered || !/^(zv-pull-off-|bd-bitten-(forearm|shoulder)$)/.test(n) || offered.has(n);
  const line = 0.03 + (body === "rollo" ? 0.03 : 0);
  let past = 0, n = 0, none = 0;
  for (const name of kept) {
    const r = law[name];
    if (!r) { none++; continue; }
    n++;
    const fold = /upperleg_twist|thigh_(twist|stretch)/.test(r.bone ?? "");
    if (r.frames > 0 && r.depth > line && !fold && S.lawful(body, name) && plays(name)) { past++; console.log(`  PAST ${body} ${name}: ${(r.depth * 100).toFixed(1)} cm (${r.bone ?? r.limb}, ${r.frames}/${r.of} moments)`); }
  }
  // (the zombie pack's own clips on a survivor body — the turn's rise — are measured too: same file)
  console.log(`${body}: ${n} clips measured, ${past} past the line${none ? `, ${none} without a measure` : ""}`);
  fails += past; measured += n; unmeasured += none;
}
console.log(fails ? `${fails} PAST THE LINE` : `all ${measured} within the line${unmeasured ? ` (${unmeasured} unmeasured: the pack's fz- halves, judged by the finisher table)` : ""}`);
process.exit(fails ? 1 : 0);
