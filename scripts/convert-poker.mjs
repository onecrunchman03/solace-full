// THE 7-SEAT POKER TABLE → a game-ready asset (Josh's model, Aug 2026).
//
// assets/casino/poker_table.glb is a Sketchfab OBJ conversion: 3.0MB, with
// 1.9MB of 4K-ish PBR maps (base + metallicRoughness + normal) on a Lambert
// floor that samples only colour, TANGENT data those maps needed, and the
// table AUTHORED LYING ON ITS SIDE (the 4.34m oval runs along +Y with no
// corrective node rotation — rendered raw it stands on edge like a coin).
//
// Cuts: baseColour only at 512² (it's a 3m table seen from standing height),
// drop TANGENT, uint16 indices, and a −90° X rotation stamped on the root so
// the oval lies flat. Geometry otherwise untouched (21.7k tris is fine).
//
//   node scripts/convert-poker.mjs   → client/public/assets/casino/poker7.glb
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets", "casino", "poker_table.glb");
const OUT_DIR = path.join(ROOT, "client", "public", "assets", "casino");
const OUT = path.join(OUT_DIR, "poker7.glb");
const TEX_EDGE = 512;

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

// ---- material: colour only, and LAY THE TABLE FLAT --------------------------
const m0 = json.materials[0];
const baseImg = json.textures[m0.pbrMetallicRoughness.baseColorTexture.index].source;
const materials = [{
  name: m0.name,
  doubleSided: true,
  pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.7, baseColorTexture: { index: 0 } },
}];
const nodes = json.nodes.map((n) => ({ ...n }));
// −90° about X on the scene root: y-long → z-long, standing → lying
const rootIdx = json.scenes[json.scene ?? 0].nodes[0];
nodes[rootIdx].rotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

// ---- re-encode the base texture ---------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const tmpIn = path.join(OUT_DIR, ".poker-in.png");
const tmpOut = path.join(OUT_DIR, ".poker-out.jpg");
fs.writeFileSync(tmpIn, viewBytes(json.images[baseImg].bufferView));
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmpIn,
  "-vf", `scale=${TEX_EDGE}:${TEX_EDGE}:flags=lanczos`, "-q:v", "3", tmpOut]);
const texBytes = fs.readFileSync(tmpOut);
fs.rmSync(tmpIn); fs.rmSync(tmpOut);

// ---- rebuild the binary chunk around what survived ---------------------------
const meshes = structuredClone(json.meshes);
for (const m of meshes) for (const p of m.primitives) delete p.attributes.TANGENT;
const bytesPer = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const compsPer = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
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
const pushView = (bytes) => {
  while (offset % 4 !== 0) { chunks.push(Buffer.alloc(1)); offset++; }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
  chunks.push(bytes);
  offset += bytes.length;
  return bufferViews.length - 1;
};
for (const a of accessors) {
  const old = json.bufferViews[a.bufferView];
  const start = (old.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const comp = bytesPer[a.componentType];
  const nComp = compsPer[a.type];
  if (old.byteStride && old.byteStride !== comp * nComp) throw new Error("strided accessor");
  let bytes = bin.subarray(start, start + a.count * comp * nComp);
  if (a.componentType === 5125 && (a.max?.[0] ?? Infinity) < 65536) {
    const src = new Uint32Array(bytes.buffer, bytes.byteOffset, a.count);
    const dst = new Uint16Array(a.count);
    for (let i = 0; i < a.count; i++) dst[i] = src[i];
    bytes = Buffer.from(dst.buffer);
    a.componentType = 5123;
  }
  a.bufferView = pushView(bytes);
  delete a.byteOffset;
}
const texView = pushView(texBytes);

const outJson = {
  asset: json.asset,
  scene: json.scene ?? 0,
  scenes: json.scenes,
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  images: [{ mimeType: "image/jpeg", bufferView: texView }],
  samplers: json.samplers ?? [{}],
  textures: [{ sampler: 0, source: 0 }],
  buffers: [{ byteLength: offset }],
};
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
console.log(`poker7.glb  ${(buf.length / 1048576).toFixed(2)}MB → ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB (tex ${TEX_EDGE}², tangents dropped, laid flat)`);
