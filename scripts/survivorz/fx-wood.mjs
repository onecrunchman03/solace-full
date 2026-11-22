// SURVIVORZ EFFECTS — bakes the wood for things breaking (docs/survivorz/EFFECTS.md, step F6).
//
//   node scripts/survivorz/fx-wood.mjs
//   -> assets/downloads/survivorz/fx/breaking/wood-{color,normal}.{png,ktx2} + wood.json
//
// ONE atlas for every piece of wood that breaks, so a burst door, its splinters and the
// planks off it are a single draw: the left half is bare wood (ambientCG Wood049, CC0 —
// planks, and the torn inside of a door), the right half painted wood (PaintedWood009C,
// CC0 — a door's face). 1024×512 colour, 512×256 normal, compressed to KTX2 like the
// scorch marks.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const SRC = path.join(ROOT, "assets", "downloads", "survivorz", "free", "ambientcg");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "breaking");
const TMP = path.join(OUT, ".src");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
fs.mkdirSync(TMP, { recursive: true });

const unzip = (zip, name) => {
  const out = path.join(TMP, name);
  if (!fs.existsSync(out)) execFileSync(process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "tar", ["-xf", path.join(SRC, zip), "-C", TMP, name]);
  return out;
};

const W = 1024, H = 512;
const half = async (file, w, h) => sharp(file).resize(w, h, { fit: "cover", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();

async function atlas(kind, w, h) {
  const bare = await half(unzip("Wood049_2K-JPG.zip", `Wood049_2K-JPG_${kind}.jpg`), w / 2, h);
  const paint = await half(unzip("PaintedWood009C_2K-JPG.zip", `PaintedWood009C_2K-JPG_${kind}.jpg`), w / 2, h);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    bare.copy(out, y * w * 3, y * (w / 2) * 3, (y + 1) * (w / 2) * 3);
    paint.copy(out, y * w * 3 + (w / 2) * 3, y * (w / 2) * 3, (y + 1) * (w / 2) * 3);
  }
  return out;
}

const color = await atlas("Color", W, H);
// (no grading here: the pieces carry a vertex colour — darker for old plank faces, paler
// and warmer for freshly torn wood — so one bake serves both)
const normal = await atlas("NormalGL", W / 2, H / 2);
const cpng = path.join(OUT, "wood-color.png"), npng = path.join(OUT, "wood-normal.png");
await sharp(color, { raw: { width: W, height: H, channels: 3 } }).png().toFile(cpng);
await sharp(normal, { raw: { width: W / 2, height: H / 2, channels: 3 } }).png().toFile(npng);

const files = {};
for (const [name, p, fmt, tf] of [["color", cpng, "R8G8B8_SRGB", "srgb"], ["normal", npng, "R8G8B8_UNORM", "linear"]]) {
  const k2 = p.replace(".png", ".ktx2");
  execFileSync(KTX, ["create", "--format", fmt, "--assign-tf", tf, "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", p, k2], { stdio: ["ignore", "ignore", "inherit"] });
  files[name] = { png: path.basename(p), ktx2: path.basename(k2) };
}
fs.writeFileSync(path.join(OUT, "wood.json"), JSON.stringify({
  made: new Date().toISOString(), width: W, height: H, ...files,
  halves: { bare: [0, 0, 0.5, 1], painted: [0.5, 0, 1, 1] },
  metres: 1.2,
  contract: "left half bare wood, right half painted wood, grain running along u; one half covers `metres` of wood across; colour sRGB, normal linear (OpenGL, +y up)",
  credits: "Wood049 and PaintedWood009C from ambientCG.com, CC0",
}, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(22), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), "KB");
