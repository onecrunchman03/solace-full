// SURVIVORZ: packs a dressed room (room-build.py's export) the way pack-props.mjs packs a prop —
// KTX2 textures (UASTC + zstd, the same settings), meshopt geometry — but never moves, recentres
// or simplifies it: a room sits at its map coordinates, and its lightmap UVs must survive.
//
//   node scripts/survivorz/room-pack.mjs [room]          (default: vault-lobby)
//   in:  assets/downloads/survivorz/rooms/<room>/<room>-src.glb
//   out: assets/downloads/survivorz/rooms/<room>/<room>.glb
//
// Texture sizes, by what they are (a room is seen far closer than a prop, and far bigger):
//   the shell's colour maps 2048 (walls and floors fill the frame), its normal and roughness 1024,
//   the ceiling kit's every map 1024 (it hangs 3.4 m and more up).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { prune, dedup, meshopt, instance } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const room = process.argv[2] ?? "vault-lobby";
const DIR = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", room);
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "solace-room-"));

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(path.join(DIR, `${room}-src.glb`));
const root = doc.getRoot();

// which textures are colour (sRGB), and which belong to the shell
const srgb = new Set(), shell = new Set();
for (const mesh of root.listMeshes()) {
  const isShell = /^SHELL/.test(mesh.getName());
  for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial(); if (!m) continue;
    for (const t of [m.getBaseColorTexture(), m.getEmissiveTexture()]) if (t) srgb.add(t);
    if (isShell) for (const t of [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture()]) if (t) shell.add(t);
  }
}
let n = 0, bytesIn = 0;
for (const tex of root.listTextures()) {
  const img = tex.getImage(); if (!img) continue;
  bytesIn += img.byteLength;
  const color = srgb.has(tex);
  const cap = shell.has(tex) && color ? 2048 : 1024;
  const meta = await sharp(Buffer.from(img)).metadata();
  const side = Math.max(meta.width, meta.height);
  const k = Math.min(1, cap / side);
  const p2 = (v) => 2 ** Math.round(Math.log2(Math.max(4, v * k)));
  const png = path.join(TMP, `t${n}.png`), k2 = png.replace(/\.png$/, ".ktx2");
  await sharp(Buffer.from(img)).resize(p2(meta.width), p2(meta.height), { fit: "fill" }).ensureAlpha().png().toFile(png);
  execFileSync(KTX, ["create", "--format", color ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM", "--assign-tf", color ? "srgb" : "linear",
    "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", png, k2], { stdio: ["ignore", "ignore", "inherit"] });
  tex.setImage(new Uint8Array(fs.readFileSync(k2))).setMimeType("image/ktx2").setURI(`${room}-${n}.ktx2`);
  fs.rmSync(png); fs.rmSync(k2);
  n++;
}
if (n) doc.createExtension(KHRTextureBasisu).setRequired(true);
// meshopt with 14-bit texture coordinates: the lightmap's UVs address a 4096 map
// keepAttributes: the lightmap UV (TEXCOORD_1) is referenced by no material in the file (the game
// attaches the lightmap at load), and a plain prune deletes it as unused
// --instance (Glenridge's zones: one oak set out 420 times, eighteen of one shrub): a mesh used by several nodes is
// drawn as ONE instanced draw. NOT for the bunker: its FIXTURE_p<i> nodes share a mesh and the page finds them by name.
const INSTANCE = process.argv.includes("--instance");
await doc.transform(prune({ keepAttributes: true }), dedup(), ...(INSTANCE ? [instance({ min: 3 })] : []), meshopt({ encoder: MeshoptEncoder, level: "medium", quantizeTexcoord: 14 }));
const out = path.join(DIR, `${room}.glb`);
await io.write(out, doc);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${room}: ${n} textures, ${(bytesIn / 1e6).toFixed(0)} MB in -> ${(fs.statSync(out).size / 1e6).toFixed(1)} MB packed`);
