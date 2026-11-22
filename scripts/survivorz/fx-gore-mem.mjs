// SURVIVORZ EFFECTS — the gore chunks' textures at 512², to give graphics memory back
// (docs/survivorz/EFFECTS.md, "Memory"). The chunks of meat, bone, brain and scalp are 5-15 cm
// on screen and were baked at 1024²: four times what they show. This re-encodes only the KTX2
// copies the game loads, from the 1024² PNGs, which stay the masters (gore-build.py makes them;
// rerun THIS after a gore rebuild, which writes 1024² KTX2s again). The stump caps stay 512².
//
//   node scripts/survivorz/fx-gore-mem.mjs [--size 512]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const GORE = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "gore");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const args = process.argv.slice(2);
const SIZE = Number(args[args.indexOf("--size") + 1]) || 512;

const man = JSON.parse(fs.readFileSync(path.join(GORE, "gore.json"), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gore-mem-"));
let before = 0, after = 0;
for (const [sid, set] of Object.entries(man.sets)) {
  if (!sid.startsWith("gib") && !["bone", "brain", "meat", "scalp"].includes(sid)) continue;
  const maps = [["normal", set.normal, false], ["color", set.fresh.color, true], ["roughness", set.fresh.roughness, false], ["dried color", set.dried.color, true], ["dried roughness", set.dried.roughness, false]];
  for (const [what, f, srgb] of maps) {
    if (!f?.png || !f?.ktx2) continue;
    const png = path.join(GORE, f.png), k2 = path.join(GORE, f.ktx2);
    before += fs.statSync(k2).size;
    const small = path.join(tmp, path.basename(png));
    await sharp(png).resize(SIZE, SIZE, { kernel: "lanczos3" }).png().toFile(small);
    fs.rmSync(k2);
    execFileSync(KTX, ["create", "--format", srgb ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM", "--assign-tf", srgb ? "srgb" : "linear", "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", small, k2], { stdio: ["ignore", "ignore", "inherit"] });
    after += fs.statSync(k2).size;
    console.log(`${sid} ${what}: ${SIZE}²`);
  }
  set.ktx2Size = SIZE;
}
// the manifest says what the KTX2s are now (the PNGs keep their own size)
fs.writeFileSync(path.join(GORE, "gore.json"), JSON.stringify(man, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`files ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
