// CASINO ASSET PIPELINE — raw purchases in assets/casino/ → game-ready files
// in client/public/assets/casino/. Run: node scripts/export-casino.mjs
// Requires Blender (D:\blender\blender.exe or CASINO_BLENDER env) + ffmpeg.
//
// What it produces:
//   props.glb            all 120 PSX casino props, meter units, NO textures —
//                        the runtime assigns materials from the shared atlases
//                        (atlas-1.webp / atlas-2.webp), so the two big images
//                        ship exactly once.
//   bar/<piece>.glb      bar-pack pieces (textures embedded — tiny dithered PNGs)
//   kiosk.glb            the SOUL KIOSK ticket machine, texture → WebP@1024
//   tex/*.webp           wall tiles + wood from the bar pack
// Manifests (measured dims/locations per object) land in
// assets/casino/manifests/ for layout work — never guess sizes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets", "casino");
const OUT = path.join(ROOT, "client", "public", "assets", "casino");
const MANI = path.join(SRC, "manifests");
const BLENDER = process.env.CASINO_BLENDER ?? "D:\\blender\\blender.exe";
const PY = path.join(ROOT, "scripts", "casino_blender.py");
const BAR = path.join(SRC, "bar", "Bar_Env_Assets", "Blender");

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "bar"), { recursive: true });
fs.mkdirSync(path.join(OUT, "tex"), { recursive: true });
fs.mkdirSync(MANI, { recursive: true });

const run = (args) =>
  execFileSync(BLENDER, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

// ---- 1. the PSX props pack (FBX → GLB, no images) ---------------------------
{
  const out = path.join(OUT, "props.glb");
  const log = run(["-b", "--python", PY, "--", "fbx",
    path.join(SRC, "props", "casino-props.fbx"), out, path.join(MANI, "props.json")]);
  console.log(log.split("\n").filter((l) => l.includes("[casino]")).join("\n"));
}

// ---- 2. bar pack pieces (.blend → GLB, images embedded) ---------------------
const BAR_PIECES = [
  "SM_Modular_Bar/SM_Modular_Bar.blend",
  "SM_Bar_Stool/SM_Bar_Stool.blend",
  "SM_Bar_Sink/SM_Modular_Bar.blend",
  "SM_Furniture_High/SM_Furniture_High.blend",
  "SM_Furniture_Low/SM_Furniture_Low.blend",
  "SM_Bottle/SM_Bottle.blend",
  "SM_Glasses/Starter_Scene.blend",
  // SM_Chessboard is RETIRED (Aug 2026): a 1m slab with 6cm blocks for men,
  // superseded by Josh's real set — scripts/convert-chess.mjs → chess.glb.
  // Still in the bar pack if it's ever wanted back.
  "SM_Round_Table/Starter_Scene.blend",
  "SM_Square_Table/Starter_Scene.blend",
  "SM_Chair/SM_Chair.blend",
  "M_Barrel/SM_Barrel.blend",
  "SM_Cash_Register/SM_Cash_Register.blend",
  "SM_Props/SM_Props.blend",
];
for (const rel of BAR_PIECES) {
  const stem = rel.split("/")[0].replace(/^SM_|^M_/, "").toLowerCase();
  const out = path.join(OUT, "bar", `${stem}.glb`);
  try {
    const log = run(["-b", path.join(BAR, rel.replace(/\//g, path.sep)),
      "--python", PY, "--", "blend", out, path.join(MANI, `bar-${stem}.json`)]);
    console.log(log.split("\n").filter((l) => l.includes("[casino]")).join("\n"));
  } catch (e) {
    console.error(`  ${rel}: FAILED — ${String(e.message).split("\n")[0]}`);
  }
}

// ---- 3. the SOUL KIOSK (already GLB — re-encode its 663KB PNG to WebP) ------
// three's GLTFLoader hands the blob to the browser by mimeType, and every
// browser we serve decodes WebP — so a plain mimeType swap works without the
// EXT_texture_webp ceremony. Our client is the only consumer of these files.
function reencodeGlb(inFile, outFile, maxPx, quality) {
  const buf = fs.readFileSync(inFile);
  const jsonLen = buf.readUInt32LE(12);
  const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const bin = buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen);
  const tmp = fs.mkdtempSync(path.join(SRC, "tmp-"));
  const replaced = new Map();
  for (const [i, im] of (g.images ?? []).entries()) {
    if (im.bufferView == null) continue;
    const bv = g.bufferViews[im.bufferView];
    const src = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const inp = path.join(tmp, `i${i}.png`);
    const outp = path.join(tmp, `o${i}.webp`);
    fs.writeFileSync(inp, src);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", inp,
      "-vf", `scale='min(${maxPx},iw)':-2:flags=neighbor`,
      "-c:v", "libwebp", "-quality", String(quality), outp]);
    const enc = fs.readFileSync(outp);
    if (enc.length < bv.byteLength) {
      replaced.set(im.bufferView, enc);
      im.mimeType = "image/webp";
    }
  }
  const pieces = [];
  let cursor = 0;
  for (const bv of g.bufferViews) {
    const data = replaced.get(g.bufferViews.indexOf(bv)) ??
      bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const padTo = (cursor + 3) & ~3;
    if (padTo > cursor) { pieces.push(Buffer.alloc(padTo - cursor)); cursor = padTo; }
    bv.byteOffset = cursor;
    bv.byteLength = data.length;
    bv.buffer = 0;
    pieces.push(data);
    cursor += data.length;
  }
  const newBin = Buffer.concat(pieces);
  g.buffers = [{ byteLength: newBin.length }];
  const pad = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
  const j = pad(Buffer.from(JSON.stringify(g), "utf8"), 0x20);
  const nb = pad(newBin, 0);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + j.length + 8 + nb.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(j.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(nb.length, 0); cb.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(outFile, Buffer.concat([head, cj, j, cb, nb]));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[casino] ${path.basename(outFile)}: ${(buf.length / 1024) | 0}KB -> ${(fs.statSync(outFile).size / 1024) | 0}KB`);
}
reencodeGlb(path.join(SRC, "ticket machine.glb"), path.join(OUT, "kiosk.glb"), 1024, "85");

// ---- 4. the two prop atlases + bar wall/wood tiles → WebP -------------------
// quality 92 keeps the PSX dither crisp; the atlases must not be downscaled
// (dither art breaks under resampling — scale flag only ever guards upsize).
function toWebp(src, dst, quality = 92) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src,
    "-c:v", "libwebp", "-quality", String(quality), dst]);
  console.log(`[casino] ${path.basename(dst)}: ${(fs.statSync(src).size / 1024) | 0}KB -> ${(fs.statSync(dst).size / 1024) | 0}KB`);
}
toWebp(path.join(SRC, "props", "atlas-1.png"), path.join(OUT, "atlas-1.webp"));
toWebp(path.join(SRC, "props", "atlas-2.png"), path.join(OUT, "atlas-2.webp"));
// The wall/wood tiles are 2–56KB palettized PNGs: WebP came out BIGGER, and
// wood_256px.png carries a corrupt EXIF that ffmpeg's strict decoder refuses
// (browsers decode it fine). Raw copies, keeping .png.
for (const [src, dst] of [
  ["SM_Walls/M_Walls_01_Dither.png", "walls-1.png"],
  ["SM_Walls/M_Walls_02_Dither.png", "walls-2.png"],
  ["SM_Walls/M_Walls_03_Dither.png", "walls-3.png"],
  ["wood_256px.png", "wood.png"],
]) {
  fs.copyFileSync(path.join(BAR, src.replace(/\//g, path.sep)), path.join(OUT, "tex", dst));
  console.log(`[casino] tex/${dst}: copied`);
}

// ---- 5. Josh's carpet footsteps → the stride sample -------------------------
execFileSync("ffmpeg", ["-y", "-loglevel", "error",
  "-i", path.join(ROOT, "assets", "Sounds", "Walk on Carpet Sound Effect.wav"),
  "-af", "loudnorm=I=-18,silenceremove=start_periods=1:start_threshold=-45dB",
  "-c:a", "libvorbis", "-q:a", "4", path.join(OUT, "steps.ogg")]);
console.log(`[casino] steps.ogg: ${(fs.statSync(path.join(OUT, "steps.ogg")).size / 1024) | 0}KB`);

console.log("[casino] done ->", OUT);
