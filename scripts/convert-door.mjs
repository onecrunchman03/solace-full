// ROOM DOOR → a game-ready asset.
//
// Josh's source (assets/doors/room_door_animation.glb) is a Sketchfab FBX
// export and cannot be used as-is:
//
//  · Its materials are KHR_materials_pbrSpecularGlossiness, an extension
//    three.js REMOVED from GLTFLoader. Loaded raw, the door renders as
//    untextured white — while still downloading every byte of its textures.
//  · It is 5.23MB, and 4.78MB of that is two 2048² textures. One of them (a
//    3.85MB PNG) is the spec-gloss map, which is exactly the thing we are
//    converting away from, so it is pure dead weight.
//  · It ships a 4×4 backdrop plane, a wall slab and a hemi light — scenery
//    from the turntable render that would appear as junk geometry in ours.
//
// So: convert to metallic-roughness, drop the gloss map, downscale the
// diffuse, prune the scenery, and rebuild the binary chunk around only what
// is still referenced. Run it with `node scripts/convert-door.mjs`; the
// output is committed, so this only needs re-running if the source changes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets", "doors", "room_door_animation.glb");
const OUT_DIR = path.join(ROOT, "client", "public", "assets", "doors");
const OUT = path.join(OUT_DIR, "door.glb");
const TEX_EDGE = 1024;
/** Scenery from the render turntable — never wanted in the game world. */
const DROP_NODES = new Set(["Plane", "Plane_004", "Hemi"]);

// ---- read ------------------------------------------------------------------
const buf = fs.readFileSync(SRC);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const bin = Buffer.from(buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + buf.readUInt32LE(20 + jsonLen)));
const viewBytes = (i) => {
  const bv = json.bufferViews[i];
  return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
};

// ---- 1. prune the scenery nodes -------------------------------------------
const keepNode = new Array(json.nodes.length).fill(true);
const killTree = (i) => {
  keepNode[i] = false;
  for (const c of json.nodes[i].children ?? []) killTree(c);
};
json.nodes.forEach((n, i) => { if (DROP_NODES.has(n.name)) killTree(i); });
const nodeMap = new Map();
const nodes = [];
json.nodes.forEach((n, i) => { if (keepNode[i]) { nodeMap.set(i, nodes.length); nodes.push({ ...n }); } });
for (const n of nodes) {
  if (n.children) {
    n.children = n.children.filter((c) => keepNode[c]).map((c) => nodeMap.get(c));
    if (!n.children.length) delete n.children;
  }
}
const scenes = json.scenes.map((s) => ({ ...s, nodes: s.nodes.filter((i) => keepNode[i]).map((i) => nodeMap.get(i)) }));

// ---- 2. keep only meshes those nodes still use ----------------------------
const meshMap = new Map();
const meshes = [];
for (const n of nodes) {
  if (n.mesh === undefined) continue;
  if (!meshMap.has(n.mesh)) { meshMap.set(n.mesh, meshes.length); meshes.push(structuredClone(json.meshes[n.mesh])); }
  n.mesh = meshMap.get(n.mesh);
}

// ---- 3. animation: drop channels aimed at pruned nodes --------------------
const animations = [];
for (const a of json.animations ?? []) {
  const channels = [];
  const samplerMap = new Map();
  const samplers = [];
  for (const ch of a.channels) {
    if (!keepNode[ch.target.node]) continue;
    if (!samplerMap.has(ch.sampler)) { samplerMap.set(ch.sampler, samplers.length); samplers.push({ ...a.samplers[ch.sampler] }); }
    channels.push({ sampler: samplerMap.get(ch.sampler), target: { node: nodeMap.get(ch.target.node), path: ch.target.path } });
  }
  if (channels.length) animations.push({ ...a, channels, samplers });
}

// ---- 4. spec/gloss → metallic-roughness ------------------------------------
// baseColour is the diffuse map (image 0). The 3.85MB spec-gloss map is
// dropped entirely: roughness becomes a scalar from glossinessFactor, which
// is all this door needs in a scene lit by one flashlight and vertex colour.
const KEEP_IMAGE = 0;
const materials = json.materials.map((m) => {
  const sg = m.extensions?.KHR_materials_pbrSpecularGlossiness ?? {};
  const out = { name: m.name, doubleSided: m.doubleSided };
  out.pbrMetallicRoughness = {
    baseColorFactor: sg.diffuseFactor ?? [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: Math.max(0.08, 1 - (sg.glossinessFactor ?? 0.5)),
  };
  if (sg.diffuseTexture && json.textures[sg.diffuseTexture.index].source === KEEP_IMAGE) {
    out.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  }
  return out;
});

// ---- 5. re-encode the diffuse texture --------------------------------------
const tmpIn = path.join(OUT_DIR, ".tex-in.jpg");
const tmpOut = path.join(OUT_DIR, ".tex-out.jpg");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(tmpIn, viewBytes(json.images[KEEP_IMAGE].bufferView));
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", tmpIn, "-vf", `scale=${TEX_EDGE}:${TEX_EDGE}:flags=lanczos`, "-q:v", "4", tmpOut]);
const texBytes = fs.readFileSync(tmpOut);
fs.rmSync(tmpIn); fs.rmSync(tmpOut);

// ---- 6. rebuild the binary chunk around what survived ----------------------
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
for (const a of animations) for (const s of a.samplers) { s.input = useAcc(s.input); s.output = useAcc(s.output); }

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
for (const a of accessors) {
  const old = json.bufferViews[a.bufferView];
  const start = (old.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const comp = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const len = a.count * comp * nComp; // tightly packed; strided views are re-packed below
  if (old.byteStride && old.byteStride !== comp * nComp) throw new Error("strided accessor — not handled");
  a.bufferView = pushView(bin.subarray(start, start + len));
  delete a.byteOffset;
}
const texView = pushView(texBytes);

const outJson = {
  asset: json.asset,
  scene: json.scene ?? 0,
  scenes,
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  animations,
  images: [{ mimeType: "image/jpeg", bufferView: texView }],
  samplers: json.samplers,
  textures: [{ sampler: 0, source: 0 }],
  buffers: [{ byteLength: offset }],
};

// ---- 7. write the GLB ------------------------------------------------------
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
  `door.glb  ${(buf.length / 1048576).toFixed(2)}MB → ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB\n` +
  `  nodes ${json.nodes.length}→${nodes.length}  meshes ${json.meshes.length}→${meshes.length}  ` +
  `${Math.round(tris)} triangles  texture ${TEX_EDGE}² (${(texBytes.length / 1024).toFixed(0)}KB)\n` +
  `  animation channels ${json.animations[0].channels.length}→${animations[0]?.channels.length ?? 0}`,
);
