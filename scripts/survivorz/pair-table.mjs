// SOLACE SURVIVORZ — THE PAIRS THE SHOW PLAYS (Oct 31 2026): client/src/survivorz/show/pairs.json.
//
// The finisher table (docs/survivorz/finisher-fit.json, scripts/survivorz/finisher-table.mjs) says which of
// the finisher pack's struggles and which bites MEASURED within the law's line for each zombie and each
// survivor; the bake (out/<body>/*.json, gitignored) recorded where the two bodies of each bite and each
// rescue stand. The show needs both, small: per zombie, per survivor, the two struggle chains it may play
// (grab → held → broken free — the chain is only offered whole) and which survivor clip each link is
// ("fz" the pack's, "zv" the fitted one); the bites it may play and where the survivor stands for each
// (x, z, yaw in the zombie's frame); and per survivor, per zombie, where the zombie stands for the
// pull-off (x, z, yaw in the rescuer's frame).
//   node scripts/survivorz/pair-table.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "out");
const fit = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "survivorz", "finisher-fit.json"), "utf8"));
const CHAINS = {
  front: ["fz-front-struggle-start", "fz-front-struggle-start-idle", "fz-front-struggle-free"],
  back: ["fz-back-struggle-start", "fz-back-struggle-idle", "fz-back-struggle-free"],
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const placeOf = (body, id) => {
  const f = path.join(OUT, body, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  const p = JSON.parse(fs.readFileSync(f, "utf8")).built?.place;
  return p ? [r3(p.x), r3(p.z), r3(p.yaw)] : null;
};

const chains = {}, bites = {}, pull = {};
let nChains = 0, nBites = 0, nPull = 0, missing = 0;
for (const [z, bySurvivor] of Object.entries(fit.pairs)) {
  for (const [s, clips] of Object.entries(bySurvivor)) {
    for (const [k, links] of Object.entries(CHAINS)) {
      if (!links.every((c) => clips[c])) continue;
      ((chains[z] ??= {})[s] ??= {})[k] = links.map((c) => clips[c]).join("");
      nChains++;
    }
  }
}
for (const [z, bySurvivor] of Object.entries(fit.bites ?? {})) {
  for (const [s, parts] of Object.entries(bySurvivor)) {
    for (const part of parts) {
      if (part === "leg") continue;   // (the leg bite is the ankle grab's, on the floor — not a standing hold)
      const at = placeOf(z, `zd-bite-${part}-${s}`);
      if (!at) { missing++; continue; }
      ((bites[z] ??= {})[s] ??= {})[part] = at;
      nBites++;
    }
  }
}
for (const s of ["carla", "claudia", "eric", "manuel", "nathan", "rollo", "sophia"]) {
  for (const z of Object.keys(fit.pairs)) {
    const at = placeOf(s, `zv-pull-off-${z}`);
    if (!at) { missing++; continue; }
    (pull[s] ??= {})[z] = at;
    nPull++;
  }
}
const file = path.join(ROOT, "client", "src", "survivorz", "show", "pairs.json");
fs.writeFileSync(file, JSON.stringify({ note: "scripts/survivorz/pair-table.mjs — the struggle chains, bites and pull-offs the show may play, and where each pair stands", chains, bites, pull }) + "\n");
console.log(`${nChains} chains, ${nBites} bites, ${nPull} pull-offs (${missing} placements missing) -> ${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
