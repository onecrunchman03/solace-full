// SURVIVORZ EFFECTS: bakes a frame sequence into one flipbook sheet the effects
// engine plays on a camera-facing card (docs/survivorz/EFFECTS.md §3).
//
//   node scripts/survivorz/fx-flipbook.mjs                 every sheet in SHEETS
//   node scripts/survivorz/fx-flipbook.mjs smoke-wisp-a    just that one
//   -> assets/downloads/survivorz/fx/flipbooks/<id>.png + flipbooks.json
//
// THE FORMAT IS PREMULTIPLIED COLOUR, whatever the source was. The Unity Labs
// frames come three ways (measured 2026-10-22): explosions are lit colour over
// a grey fill with coverage in alpha, smoke is grey with density in alpha, and
// flames are glowing colour on black with alpha ~ brightness. Premultiplying at
// bake time lets ONE blend (ONE, ONE_MINUS_SRC_ALPHA) draw all of them: smoke
// covers what's behind it, and a flame's card drives its alpha to zero at draw
// time to add light instead (the engine's `glow`). Straight alpha would also
// bleed the grey fill into every soft edge once the sheet is mip-mapped.
//
// Sources live outside the repo (Josh's downloads, D:\solace-ai\Special Effects);
// only the baked sheets are written into the gitignored fx/ tree.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const SRC = process.env.FX_SRC || "D:/solace-ai/Special Effects";
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "flipbooks");
// THE GPU COPY (Josh okayed the Khronos tools, 2026-10-22): each sheet is also written as
// KTX2 / UASTC with its mipmaps, which the browser transcodes to BC7 — one byte a pixel on
// the card instead of four. Unpacked (not installed) from the official v4.4.2 release.
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";

// id -> what it's made from. `frames` evenly spaced over the source's [from, to)
// (0..1 of its length); `cell` the size of one frame on the sheet; `fps` the
// rate it was simulated at once thinned (the engine plays it over the particle's
// life, or at this rate for looping cards). `glow`: the engine's default for
// how much of the card adds light instead of covering (0 smoke, 1 pure flame).
export const SHEETS = {
  "smoke-wisp-a": { zip: "WispySmoke03-sequence-tga.zip", frames: 64, cell: 256, glow: 0, note: "slow grey wisp: muzzle smoke, steam, a fire's smoke" },
  "smoke-wisp-b": { zip: "WispySmoke02-sequence-tga.zip", frames: 64, cell: 256, glow: 0, note: "second wisp, so two puffs never match" },
  "smoke-wisp-c": { zip: "WispySmoke03b-sequence-tga.zip", frames: 64, cell: 256, glow: 0, note: "third wisp" },
  "smoke-candle": { zip: "CandleSmoke01-sequence-tga.zip", frames: 64, cell: 256, glow: 0, note: "thin rising thread: a guttering fire, a hot pipe" },
  "flame-a": { zip: "Flame02-sequence-tga.zip", frames: 64, cell: 256, glow: 1, note: "a tongue of flame: burning floor, a body on fire" },
  "flame-b": { zip: "Flame03-sequence-tga.zip", frames: 64, cell: 256, glow: 1, note: "second flame" },
  "flame-hollow": { zip: "Flame03-hollow-sequence-tga.zip", frames: 64, cell: 256, glow: 1, note: "a flame with an open middle, for the edge of a burn" },
  "flame-small": { zip: "SmallFlame01-temperature-sequence-tga.zip", frames: 64, cell: 128, glow: 1, note: "small licks: embers, a burning scrap" },
  "fireball-a": { zip: "FireBall01-sequence-tga.zip", frames: 64, cell: 256, glow: 0.7, note: "a rolling ball of fire" },
  "fireball-b": { zip: "FireBall02-sequence-tga.zip", frames: 64, cell: 256, glow: 0.7, note: "second fireball" },
  "explosion-a": { zip: "Explosion01-sequence-tga.zip", frames: 64, cell: 256, glow: 0.25, note: "fire and black smoke" },
  "explosion-dust": { zip: "Explosion01-nofire-sequence-tga.zip", frames: 64, cell: 256, glow: 0, note: "the same blast as dust only" },
  "explosion-hd": { zip: "Explosion02HD-sequence-tga.zip", frames: 64, cell: 512, glow: 0.25, note: "the close-up blast" },
  // F3: rendered by us from the JangaFX simulations (fx-vdb.mjs), frames already 64
  "gas-burst": { dir: "renders/gas-burst", frames: 64, cell: 384, glow: 0.3, source: "JangaFX Gasoline Explosion 01 (CC0)", note: "the molotov catching: burning fuel rolling up into black smoke" },
  "dust-impact": { dir: "renders/dust-impact", frames: 64, cell: 320, glow: 0, source: "JangaFX Grenade Dust Impact (CC0)", note: "the pipe bomb's cloud: dust thrown up out of the floor" },
  "dust-ring": { dir: "renders/dust-ring", frames: 64, cell: 256, glow: 0, source: "JangaFX Dust Shockwave (CC0)", note: "the ring of dust a blast rolls out along the floor" },
};
const WORK = process.env.FX_WORK || "D:/solace-ai/fx-src";

const unzipFrames = (zip, dir) => {
  // -C: case-insensitive match, so .tga and .TGA both come out (two patterns fail the run
  // with status 11 when one of them matches nothing)
  execFileSync("unzip", ["-q", "-o", "-j", "-C", path.join(SRC, zip), "*.tga", "-d", dir], { stdio: ["ignore", "ignore", "inherit"] });
  return fs.readdirSync(dir).filter((f) => /\.tga$/i.test(f)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
};

function bake(id, s) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fxbook-"));
  try {
    // a zip of frames (Unity Labs), or a folder of frames we rendered (JangaFX, fx-vdb.mjs)
    const all = s.dir ? fs.readdirSync(path.join(WORK, s.dir)).filter((f) => /^frame_\d+\.png$/.test(f)).sort().map((f) => { fs.copyFileSync(path.join(WORK, s.dir, f), path.join(tmp, f)); return f; }) : unzipFrames(s.zip, tmp);
    if (all.length < s.frames) throw new Error(`${id}: ${all.length} frames, want ${s.frames}`);
    const from = s.from ?? 0, to = s.to ?? 1;
    const a = Math.floor(from * all.length), b = Math.max(a + s.frames, Math.floor(to * all.length));
    const pick = Array.from({ length: s.frames }, (_, i) => all[Math.min(b - 1, a + Math.round((i * (b - a - 1)) / (s.frames - 1)))]);
    const cols = Math.ceil(Math.sqrt(s.frames)), rows = Math.ceil(s.frames / cols);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(tmp, pick[0])]).toString().trim().split(",").map(Number);
    const [w, h] = probe;
    // PREMULTIPLY HERE, not in ffmpeg: its premultiply filter left the colour untouched
    // (measured: 311k pixels brighter than their own coverage after it ran, packed or
    // planar). Every frame is decoded to raw RGBA, multiplied, and handed back to ffmpeg
    // only to be scaled (premultiplied pixels scale correctly) and tiled.
    const raw = Buffer.alloc(w * h * 4 * pick.length);
    pick.forEach((f, i) => {
      const px = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(tmp, f), "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 });
      if (px.length !== w * h * 4) throw new Error(`${id}: ${f} is not ${w}x${h}`);
      for (let p = 0; p < px.length; p += 4) {
        const a = px[p + 3] / 255;
        px[p] = Math.round(px[p] * a); px[p + 1] = Math.round(px[p + 1] * a); px[p + 2] = Math.round(px[p + 2] * a);
      }
      px.copy(raw, i * w * h * 4);
    });
    // keep the source's aspect: the cell is `cell` wide (tall sources, like the flames, stay tall)
    const cw = s.cell, ch = Math.round((s.cell * h) / w / 2) * 2;
    fs.mkdirSync(OUT, { recursive: true });
    const png = path.join(OUT, `${id}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "-",
      "-vf", `scale=${cw}:${ch}:flags=area,tile=${cols}x${rows}:padding=0:margin=0`,
      "-frames:v", "1", png], { input: raw, maxBuffer: 1 << 26 });
    // PNG, NOT WEBP (measured 2026-10-22): lossless WebP rewrites the colour under fully
    // transparent pixels to compress better, and under premultiplied blending that garbage
    // ADDS light (purple blocks and red streaks round the early explosion frames). PNG keeps
    // them black. Disk size only — the GPU holds the same pixels either way.
    // the same pixels, compressed for the GPU. UASTC (not ETC1S): smoke's soft gradients band
    // badly under ETC1S. Quality 2 + RDO keeps the file small; zstd shrinks the download only.
    let ktx2 = null;
    if (fs.existsSync(KTX)) {
      const out = path.join(OUT, `${id}.ktx2`);
      execFileSync(KTX, ["create", "--format", "R8G8B8A8_SRGB", "--assign-tf", "srgb", "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", png, out], { stdio: ["ignore", "ignore", "inherit"] });
      ktx2 = { file: `${id}.ktx2`, bytes: fs.statSync(out).size };
    } else console.warn(`${id}: no KTX tool at ${KTX}; PNG only`);
    return { id, file: `${id}.png`, ktx2: ktx2?.file ?? null, cols, rows, frames: s.frames, cell: [cw, ch], width: cw * cols, height: ch * rows, aspect: ch / cw, glow: s.glow, source: s.source ?? s.zip, srcFrames: all.length, note: s.note, bytes: fs.statSync(png).size, ktx2Bytes: ktx2?.bytes ?? null };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const only = process.argv[2];
const metaFile = path.join(OUT, "flipbooks.json");
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
for (const [id, s] of Object.entries(SHEETS)) {
  if (only && id !== only) continue;
  const t = Date.now();
  meta[id] = bake(id, s);
  console.log(`${id}: ${meta[id].cols}x${meta[id].rows} of ${meta[id].cell.join("x")}, png ${(meta[id].bytes / 1024).toFixed(0)} KB, ktx2 ${meta[id].ktx2Bytes ? (meta[id].ktx2Bytes / 1024).toFixed(0) + " KB" : "none"} (${Date.now() - t} ms)`);
}
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
