// SHRINK A GLB by re-encoding its textures. No Blender, no toolchain.
//
// Measured on Josh's held-item models, the weight is almost entirely IMAGES:
//   camera        39.7MB — 91% textures (3 images), 52k verts
//   flashlight    18.9MB — 95% textures (4 images), 11k verts
//   walkietalkie  16.9MB — 97% textures (4 images),  9k verts
//   bottle         7.1MB —  4% textures, 116k verts  <- geometry, not us
// These are 4K PBR sets on props held at arm's length, where 512px is already
// more than the screen can show. So: extract each image, re-encode it with
// ffmpeg at a sane size, and rebuild the container.
//
// JPEG/PNG only — WebP in a glTF needs the EXT_texture_webp extension, and a
// file that needs an extension to open is not a saving.
//
//   node scripts/shrink-glb.mjs <in.glb> <out.glb> [maxPx] [quality]
//
// Rebuilding the buffer is the fiddly part: every bufferView after a resized
// image shifts, so all offsets are recomputed and re-aligned to 4 bytes.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [inFile, outFile, maxPxArg, qArg] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error("usage: node scripts/shrink-glb.mjs <in.glb> <out.glb> [maxPx=512] [q=4]");
  process.exit(1);
}
const MAX_PX = Number(maxPxArg ?? 512);
const Q = Number(qArg ?? 4); // ffmpeg mjpeg -q:v, 2=best 31=worst

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(file) {
  const b = readFileSync(file);
  if (b.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a GLB: " + file);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const type = b.readUInt32LE(off + 4);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString("utf8"));
    else if (type === CHUNK_BIN) bin = Buffer.from(data);
    off += 8 + len;
  }
  if (!json) throw new Error("no JSON chunk");
  return { json, bin: bin ?? Buffer.alloc(0) };
}

function writeGlb(file, json, bin) {
  const pad = (buf, fill) => {
    const r = buf.length % 4;
    return r ? Buffer.concat([buf, Buffer.alloc(4 - r, fill)]) : buf;
  };
  const j = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const b = pad(bin, 0x00);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(GLB_MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const cj = Buffer.alloc(8);
  cj.writeUInt32LE(j.length, 0);
  cj.writeUInt32LE(CHUNK_JSON, 4);
  const cb = Buffer.alloc(8);
  cb.writeUInt32LE(b.length, 0);
  cb.writeUInt32LE(CHUNK_BIN, 4);
  writeFileSync(file, Buffer.concat([head, cj, j, cb, b]));
}

const { json: g, bin } = readGlb(inFile);
const before = readFileSync(inFile).length;
const tmp = mkdtempSync(path.join(tmpdir(), "glbshrink-"));

// 0. WHICH IMAGES CARRY TRANSPARENCY. JPEG has no alpha channel, so a colour
//    map feeding a BLEND/MASK material must stay PNG or the glass it paints
//    turns into a solid panel. (Found on the casino jukebox, whose dome and
//    title strips are one BLEND material — everything else there is opaque.)
const needsAlpha = new Set();
for (const m of g.materials ?? []) {
  const mode = m.alphaMode ?? "OPAQUE";
  if (mode !== "BLEND" && mode !== "MASK") continue;
  const t = m.pbrMetallicRoughness?.baseColorTexture?.index;
  if (t != null && g.textures?.[t]?.source != null) needsAlpha.add(g.textures[t].source);
}

// 1. Re-encode every image that has a bufferView.
const replaced = new Map(); // bufferView index -> new Buffer
let shrunk = 0;
for (const [i, im] of (g.images ?? []).entries()) {
  if (im.bufferView == null) continue;
  const bv = g.bufferViews[im.bufferView];
  const src = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const ext = (im.mimeType ?? "image/png").includes("png") ? "png" : "jpg";
  const alpha = needsAlpha.has(i);
  const inp = path.join(tmp, `i${i}.${ext}`);
  const outp = path.join(tmp, `o${i}.${alpha ? "png" : "jpg"}`);
  writeFileSync(inp, src);
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", inp,
        // Only ever scale DOWN, and keep aspect: -2 keeps it even for the encoder.
       "-vf", `scale='min(${MAX_PX},iw)':-2:flags=lanczos`,
       ...(alpha ? ["-pix_fmt", "rgba", "-compression_level", "9"] : ["-q:v", String(Q)]), outp],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (e) {
    console.error(`  image ${i}: ffmpeg failed, kept original — ${e.message.split("\n")[0]}`);
    continue;
  }
  const out = readFileSync(outp);
  if (out.length >= bv.byteLength) {
    console.log(`  image ${i}: re-encode was no smaller, kept original`);
    continue;
  }
  replaced.set(im.bufferView, out);
  im.mimeType = alpha ? "image/png" : "image/jpeg";
  shrunk++;
  console.log(
    `  image ${i}: ${(bv.byteLength / 1e6).toFixed(2)}MB -> ${(out.length / 1e6).toFixed(2)}MB` +
      (alpha ? " (PNG — keeps its alpha)" : ""),
  );
}

// 2. Rebuild the binary chunk. Every view is copied in order into a fresh
//    buffer, 4-byte aligned, and its offset rewritten — a resized image shifts
//    everything after it, so offsets cannot be patched in place.
const pieces = [];
let cursor = 0;
for (const bv of g.bufferViews) {
  const data = replaced.get(g.bufferViews.indexOf(bv)) ??
    bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const padTo = (cursor + 3) & ~3;
  if (padTo > cursor) {
    pieces.push(Buffer.alloc(padTo - cursor));
    cursor = padTo;
  }
  bv.byteOffset = cursor;
  bv.byteLength = data.length;
  pieces.push(data);
  cursor += data.length;
}
const newBin = Buffer.concat(pieces);
g.buffers = [{ byteLength: newBin.length }];
for (const bv of g.bufferViews) bv.buffer = 0;

writeGlb(outFile, g, newBin);
rmSync(tmp, { recursive: true, force: true });
const after = readFileSync(outFile).length;
console.log(
  `${path.basename(inFile)}: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB ` +
    `(${(100 - (100 * after) / before).toFixed(0)}% smaller, ${shrunk} textures re-encoded)`,
);
