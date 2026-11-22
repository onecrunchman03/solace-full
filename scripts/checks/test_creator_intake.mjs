// THE CHARACTER CREATOR'S INTAKE, the parts that need no Blender (docs/survivorz/CREATOR.md):
//  1. THE BONE MAP (scripts/survivorz/creator/joints.json, what intake.py renames a dropped rig by)
//     agrees with the retarget page's own joint table (scripts/survivorz/retarget.html J) for every
//     Mixamo, Unreal and UE5 joint it maps, and every Renderpeople name it produces is one the
//     retarget page knows; the core and required lists name real joints.
//  2. THE BODY LIST (scripts/survivorz/bodies.cjs): the seven made by hand, in order, with their
//     targets on disk where the stage is present.
//  3. THE SNIFF (src/routes/survivorz-bodies.ts sniffModel): FBX binary and ASCII, GLB and zip by
//     their bytes; a renamed text file, an empty file and an OBJ are not models.
// The intake itself (Blender) is run by hand: a fake Mixamo rig in centimetres, turned and in a
// T-pose, comes out renamed, in metres, facing forward and in the show's A-pose (scratchpad
// fake-mixamo.py, Nov 3 2026).

process.env.EXCHANGE_PROVIDER = "off";
process.env.ALPACA_KEY_ID = "";
process.env.ALPACA_SECRET_KEY = "";

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

console.log("THE BONE MAP");
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "survivorz", "creator", "joints.json"), "utf8"));
const html = fs.readFileSync(path.join(ROOT, "scripts", "survivorz", "retarget.html"), "utf8");
const from = html.indexOf("const J = {"), to = html.indexOf("const FAM =", from);
ok(from > 0 && to > from, "the retarget page's joint table is found");
// eslint-disable-next-line no-new-func
const J = new Function(html.slice(from, to) + "\nreturn J;")();
const FAM = { mixamo: 0, ue: 1, rp: 2, ue5: 5 };
const rpNames = new Set(Object.values(J).map((row) => row[FAM.rp]));
for (const fam of ["mixamo", "ue", "ue5"]) {
  const mine = MAP.families[fam];
  let agree = 0, checked = 0;
  const off = [];
  for (const row of Object.values(J)) {
    const src = row[FAM[fam]], rp = row[FAM.rp];
    if (!src || !rp) continue;
    checked++;
    if (mine[src] === rp) agree++; else off.push(`${src}→${mine[src]} (page: ${rp})`);
  }
  ok(checked > 40 && agree === checked, `${fam}: all ${checked} of the page's joints map the same way${off.length ? " — " + off.slice(0, 4).join(", ") : ""}`);
}
const produced = new Set(Object.values(MAP.families).flatMap((t) => Object.values(t)));
const unknown = [...produced].filter((r) => !rpNames.has(r) && !/_end_|_end$|twist|^head_end$/.test(r));
ok(unknown.length === 0, `every Renderpeople name the map produces is a page joint (or an end/twist bone)${unknown.length ? ": " + unknown.join(", ") : ""}`);
ok(MAP.core.every((j) => rpNames.has(j)) && MAP.required.every((j) => rpNames.has(j)), "the core and required lists name real joints");
ok(MAP.core.every((j) => MAP.required.includes(j)), "every core joint is also required");
ok(MAP.families.mixamo.LeftHandIndex1 === "index_01_l" && MAP.families.mixamo.Hips === "hip" && MAP.families.ue.calf_r === "lowerleg_r", "spot checks: Mixamo's index and hips, Unreal's calf");

console.log("THE BODY LIST");
const bodies = require(path.join(ROOT, "scripts", "survivorz", "bodies.cjs"));
ok(JSON.stringify(Object.keys(bodies.BUILT_IN)) === JSON.stringify(["eric", "carla", "claudia", "manuel", "nathan", "sophia", "rollo"]), "the seven made by hand, in the order the scripts always used");
ok(bodies.survivorIds().slice(0, 7).join() === Object.keys(bodies.BUILT_IN).join(), "the list starts with them, the creator's after");
const stage = fs.existsSync(path.join(bodies.STAGE, "targets"));
ok(!stage || Object.values(bodies.BUILT_IN).every((b) => fs.existsSync(path.join(bodies.STAGE, "targets", b.target))), stage ? "every built-in target is on disk" : "(the stage isn't on this box; targets not checked)");
ok(Object.values(bodies.BUILT_IN).every((b) => b.shoulder > 1.2 && b.shoulder < 1.6), "every body carries a shoulder height");

console.log("THE SNIFF");
const { sniffModel } = await import(pathToFileURL(path.join(ROOT, "dist", "routes", "survivorz-bodies.js")).href);
const glb = Buffer.alloc(32); glb.writeUInt32LE(0x46546c67, 0);
ok(sniffModel(Buffer.concat([Buffer.from("Kaydara FBX Binary  \0", "latin1"), Buffer.alloc(30)])) === "fbx", "a binary FBX");
ok(sniffModel(Buffer.from("; FBX 7.4.0 project file\n", "latin1")) === "fbx", "an ASCII FBX");
ok(sniffModel(Buffer.from("﻿; FBX 7.4.0 project file\n", "utf8")) === "fbx", "an ASCII FBX with a BOM");
ok(sniffModel(glb) === "glb", "a GLB");
ok(sniffModel(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])) === "zip", "a zip");
ok(sniffModel(Buffer.from("this is not a model")) === null, "text is not a model");
ok(sniffModel(Buffer.alloc(0)) === null, "an empty file is not a model");
ok(sniffModel(Buffer.from("# OBJ\nv 0 0 0\n")) === null, "an OBJ is not taken (rigged models only)");

console.log(`\n${n - bad}/${n} creator-intake asserts passed`);
process.exit(bad ? 1 : 0);
