// SURVIVORZ: lays Mixamo's "laying" clips on the floor. They are authored on an invisible
// bed (the hips stay at standing height, ~0.9 m of air under the body), so every clip that
// never comes within 15 cm of the floor AND is a lying clip has its hips track lowered until
// its lowest bone sits LIE_CLEAR above the floor. A bed or a cot raises the body in the game.
// Reads anim/<body>/ground.json (anim-ground.cjs), rewrites out/<body>/<clip>.json, and the
// body is then repacked with pack.mjs.
//   node scripts/survivorz/anim-ground-fix.mjs <body>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2];
const LIE_CLEAR = 0.08;      // the spine lies about this far above the floor when a body is on its back
const LYING = /laying/;
const ground = JSON.parse(fs.readFileSync(path.join(STAGE, "anim", body, "ground.json"), "utf8"));
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
let fixed = 0;
for (const [clip, g] of Object.entries(ground)) {
  if (g.low <= 0.15 || !LYING.test(clip)) continue;
  const f = path.join(STAGE, "out", job.out, `${clip}.json`);
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const tr = j.tracks.find((t) => t.name === `${g.hips}.position` || t.name.endsWith(".position"));
  if (!tr) { console.log(`  ${clip}: no hips track`); continue; }
  if (j.grounded) { console.log(`  ${clip}: already lowered ${j.grounded} m`); continue; }
  const drop = (g.low - LIE_CLEAR) / g.unit;
  for (let i = 1; i < tr.values.length; i += 3) tr.values[i] -= drop;
  j.grounded = +(g.low - LIE_CLEAR).toFixed(3);
  fs.writeFileSync(f, JSON.stringify(j));
  fixed++;
  console.log(`  ${clip}: lowered ${j.grounded} m`);
}
console.log(`${body}: ${fixed} lying clips laid on the floor`);
