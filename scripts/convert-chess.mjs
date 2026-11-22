// THE CHESS SET → a game-ready asset.
//
// Josh's source (assets/casino/chess_board_and_pieces.glb) is a Sketchfab FBX
// export: a properly assembled set, board and 32 pieces, already in METRES and
// already in the opening position. Measured before touching it:
//
//   board 0.569 m across (0.54 m of playing surface, 0.0675 m squares)
//   surface at y 0.02 · pieces stand ON it · king tops out at y 0.144
//   15,440 triangles across 35 meshes — one node per piece, so a future
//   phase could animate a real game onto this board without re-exporting
//
// What it cannot ship as: 5.00MB. Measured, the weight is in two places, and
// the second one is the surprise:
//
//   3.2MB — FIFTEEN 1024² PNGs, a full PBR set (baseColour + metallicRoughness
//           + normal) per material. This hall is painted-PSX: every prop is a
//           MeshLambert with a nearest-filtered colour map, so the normal and
//           metallic-roughness maps are not merely oversized, they are never
//           sampled. A piece is 4 cm wide on a table you stand over.
//   1.7MB — geometry, at 110 bytes per triangle, because the set was exported
//           with each of the 32 pieces as its own mesh. There are only FIFTEEN
//           distinct shapes: eight dark pawns are eight byte-identical copies.
//           TANGENT alone (459KB) is dead the moment the normal maps go.
//
// So, three cuts, none of which touch how it looks:
//   · colour maps only, at 256² (15 images → 5, 3.2MB → 21KB)
//   · deduplicate geometry by content hash — 35 meshes → 15, the 20 copies
//     become extra NODES pointing at a shared mesh, which is what they always
//     were. Per-piece nodes survive, so a future phase can still animate a real
//     game onto this board.
//   · drop TANGENT, and pack indices as uint16 where the primitive fits
//
// That lands at 544KB, and 96% of what remains is vertex data that cannot be
// welded: the export splits every vertex (13,257 verts for 7,124 triangles —
// only 4% share a position+normal+UV), so there is nothing left to merge. The
// next cut would be KHR_mesh_quantization, which needs a dequantization node
// per mesh reference; not worth it for a file Caddy serves once and caches
// immutable for a year.
//
// Run `node scripts/convert-chess.mjs`; the output is committed, so this only
// needs re-running if the source changes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets", "casino", "chess_board_and_pieces.glb");
const OUT_DIR = path.join(ROOT, "client", "public", "assets", "casino");
const OUT = path.join(OUT_DIR, "chess.glb");

/** Colour maps only, and small: the board is 0.57 m and its squares are 6.75 cm. */
const TEX_EDGE = 256;
const TEX_Q = 3; // ffmpeg mjpeg -q:v, 2=best 31=worst

// ---- read --------------------------------------------------------------------
const buf = fs.readFileSync(SRC);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB: " + SRC);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const binLen = buf.readUInt32LE(20 + jsonLen);
const bin = Buffer.from(buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen));
const viewBytes = (i) => {
  const bv = json.bufferViews[i];
  return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
};

// ---- 1. materials: colour map only ------------------------------------------
// Each surviving image is re-encoded once and referenced by one texture, so the
// mapping is material → its own image index in the new file.
fs.mkdirSync(OUT_DIR, { recursive: true });
const images = [];
const texBytes = [];
const materials = json.materials.map((m) => {
  const pbr = m.pbrMetallicRoughness ?? {};
  const out = {
    name: m.name,
    doubleSided: m.doubleSided,
    pbrMetallicRoughness: {
      baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      // Flat scalars: nothing in this hall reads a metallic-roughness map, and
      // the source's 0.45 metallic on the SQUARES made the board a mirror in a
      // room lit by eight point lights.
      metallicFactor: 0,
      roughnessFactor: 0.6,
    },
  };
  const src = pbr.baseColorTexture ? json.textures[pbr.baseColorTexture.index].source : null;
  if (src == null) return out;

  const tmpIn = path.join(OUT_DIR, `.chess-${src}-in.png`);
  const tmpOut = path.join(OUT_DIR, `.chess-${src}-out.jpg`);
  fs.writeFileSync(tmpIn, viewBytes(json.images[src].bufferView));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmpIn,
    "-vf", `scale=${TEX_EDGE}:${TEX_EDGE}:flags=lanczos`, "-q:v", String(TEX_Q), tmpOut]);
  texBytes.push(fs.readFileSync(tmpOut));
  fs.rmSync(tmpIn); fs.rmSync(tmpOut);

  out.pbrMetallicRoughness.baseColorTexture = { index: images.length };
  images.push(src);
  return out;
});

// ---- 2. deduplicate geometry -------------------------------------------------
// Hash each mesh over the actual bytes of every attribute it references (minus
// TANGENT, which is about to go), and keep the first mesh of each shape. Nodes
// are kept whole — nothing in this file is scenery — they just re-point.
const bytesPer = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const compsPer = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const accBytes = (i) => {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return bin.subarray(start, start + a.count * bytesPer[a.componentType] * compsPer[a.type]);
};
const DROP_ATTRS = new Set(["TANGENT"]);
const shapeOf = (m) => {
  const h = createHash("sha1");
  for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes).sort()) {
      if (DROP_ATTRS.has(k)) continue;
      h.update(k).update(accBytes(p.attributes[k]));
    }
    h.update(String(p.material));
    if (p.indices !== undefined) h.update(accBytes(p.indices));
  }
  return h.digest("hex");
};
const shapeToMesh = new Map();
const meshRemap = new Map();
const meshes = [];
json.meshes.forEach((m, i) => {
  const key = shapeOf(m);
  if (!shapeToMesh.has(key)) {
    shapeToMesh.set(key, meshes.length);
    const copy = structuredClone(m);
    for (const p of copy.primitives) for (const k of [...DROP_ATTRS]) delete p.attributes[k];
    meshes.push(copy);
  }
  meshRemap.set(i, shapeToMesh.get(key));
});
const nodes = json.nodes.map((n) => (n.mesh === undefined ? { ...n } : { ...n, mesh: meshRemap.get(n.mesh) }));

// ---- 3. rebuild the binary chunk around what survived ------------------------
const accMap = new Map();
const accessors = [];
const useAcc = (i) => {
  if (i === undefined) return undefined;
  if (!accMap.has(i)) { accMap.set(i, accessors.length); accessors.push({ ...json.accessors[i] }); }
  return accMap.get(i);
};
for (const m of meshes) {
  for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = useAcc(p.attributes[k]);
    if (p.indices !== undefined) p.indices = useAcc(p.indices);
  }
}

const chunks = [];
let offset = 0;
const bufferViews = [];
const pushView = (bytes, extra = {}) => {
  while (offset % 4 !== 0) { chunks.push(Buffer.alloc(1)); offset++; }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra });
  chunks.push(bytes);
  offset += bytes.length;
  return bufferViews.length - 1;
};
/** uint32 index buffers where every index fits in 16 bits — half the bytes for
 *  a set whose biggest primitive is 1,312 vertices. */
const narrowIndices = new Set(
  meshes.flatMap((m) => m.primitives.map((p) => p.indices)).filter((i) => i !== undefined),
);
for (const [ai, a] of accessors.entries()) {
  const old = json.bufferViews[a.bufferView];
  const start = (old.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const comp = bytesPer[a.componentType];
  const nComp = compsPer[a.type];
  const len = a.count * comp * nComp;
  if (old.byteStride && old.byteStride !== comp * nComp) throw new Error("strided accessor — not handled");
  let bytes = bin.subarray(start, start + len);
  if (narrowIndices.has(ai) && a.componentType === 5125 && (a.max?.[0] ?? Infinity) < 65536) {
    const src = new Uint32Array(bytes.buffer, bytes.byteOffset, a.count);
    const dst = new Uint16Array(a.count);
    for (let i = 0; i < a.count; i++) dst[i] = src[i];
    bytes = Buffer.from(dst.buffer);
    a.componentType = 5123;
  }
  a.bufferView = pushView(bytes);
  delete a.byteOffset;
}
const texViews = texBytes.map((b) => pushView(b));

const outJson = {
  asset: json.asset,
  scene: json.scene ?? 0,
  scenes: json.scenes,
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  images: texViews.map((v) => ({ mimeType: "image/jpeg", bufferView: v })),
  samplers: json.samplers ?? [{}],
  textures: texViews.map(() => ({ sampler: 0, source: 0 })).map((t, i) => ({ ...t, source: i })),
  buffers: [{ byteLength: offset }],
};

// ---- 3. write the GLB --------------------------------------------------------
const binChunk = Buffer.concat(chunks);
const jsonStr = Buffer.from(JSON.stringify(outJson), "utf8");
const jsonPad = Buffer.concat([jsonStr, Buffer.alloc((4 - (jsonStr.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([binChunk, Buffer.alloc((4 - (binChunk.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binPad.length, 8);
const jHead = Buffer.alloc(8);
jHead.writeUInt32LE(jsonPad.length, 0);
jHead.writeUInt32LE(0x4e4f534a, 4);
const bHead = Buffer.alloc(8);
bHead.writeUInt32LE(binPad.length, 0);
bHead.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([header, jHead, jsonPad, bHead, binPad]));

const tris = meshes.reduce(
  (t, m) => t + m.primitives.reduce((s, p) => s + (p.indices !== undefined ? accessors[p.indices].count / 3 : 0), 0),
  0,
);
console.log(
  `chess.glb  ${(buf.length / 1048576).toFixed(2)}MB → ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB\n` +
  `  images ${json.images.length}→${images.length} at ${TEX_EDGE}² ` +
  `(${(texBytes.reduce((s, b) => s + b.length, 0) / 1024).toFixed(0)}KB total)\n` +
  `  meshes ${json.meshes.length}→${meshes.length} shapes across ${nodes.length} nodes  ` +
  `${Math.round(tris)} unique triangles`,
);
