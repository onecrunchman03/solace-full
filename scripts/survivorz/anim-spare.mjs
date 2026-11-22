// SURVIVORZ: A BODY GIVES UP A CLIP IT CAN DO WITHOUT (Nov 9 2026). Run in the creator bake's final checks,
// after anim-clip.cjs has measured every clip and before anim-law-show.mjs judges them: any clip on
// stance.ts SPARE_CLIPS that goes past the law's line on THIS body is moved out of the body's clips
// (out/<body>/_spare/, kept for a later look) and the body packed again, so the show never has it there and
// picks its stand-in instead. Four of Josh's eleven models failed on exactly this on Nov 9 — bulky chest rigs
// can't fold their arms, and a thumb went 4–6 cm into the body on one laid-up cough — and losing a whole
// character to an optional idle is the wrong trade. A clip NOT on the list is left alone, and still fails.
//   node scripts/survivorz/anim-spare.mjs <body>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT, STAGE } from "./lib-loadbody.mjs";

const body = process.argv[2];
if (!body) throw new Error("usage: anim-spare.mjs <body>");
const S = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "stance.ts")).href);
const law = JSON.parse(fs.readFileSync(path.join(STAGE, "anim", body, "clip.json"), "utf8"));
// (the same line and fold rule anim-law-show.mjs judges by)
const line = 0.03 + (body === "rollo" ? 0.03 : 0);
const past = S.SPARE_CLIPS.filter((name) => {
  const r = law[name];
  return r && r.frames > 0 && r.depth > line && !/upperleg_twist|thigh_(twist|stretch)/.test(r.bone ?? "");
});
if (!past.length) { console.log(`${body}: every spare clip within the line`); process.exit(0); }

const outDir = path.join(STAGE, "out", body), spare = path.join(outDir, "_spare");
fs.mkdirSync(spare, { recursive: true });
let moved = 0;
for (const f of fs.readdirSync(outDir).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
  if (!past.includes(j.name)) continue;
  fs.renameSync(path.join(outDir, f), path.join(spare, f));
  const r = law[j.name];
  console.log(`  ${body} gives up ${j.name}: ${(r.depth * 100).toFixed(1)} cm (${r.bone ?? r.limb}, ${r.frames}/${r.of} moments) — the show uses its stand-in`);
  moved++;
}
if (moved) execFileSync(process.execPath, [path.join(ROOT, "scripts", "survivorz", "pack.mjs"), body], { stdio: "inherit" });
console.log(`${body}: ${moved} spare clip${moved === 1 ? "" : "s"} taken out`);
