// SURVIVORZ, GLENRIDGE HALL: reads a PACKED zone file (meshopt + quantization + instancing) without a browser and
// hands back its triangles in world space, a node and a primitive at a time. For scripts that measure the built
// house: door-fit.mjs (each door's real opening). First written by a reviewer's probe (Nov 13 2026).
//   eachPrim(zone, ({ node, mat, world, pos, idx }) => ...)   pos: Float64Array of local xyz; xf(world, x, y, z)
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { MeshoptDecoder } = await import(pathToFileURL(path.join(ROOT, "client", "node_modules", "three", "examples", "jsm", "libs", "meshopt_decoder.module.js")).href);
await MeshoptDecoder.ready;
const DIR = path.join(process.env.SURVIVORZ_ASSETS ?? path.join(ROOT, "assets", "downloads", "survivorz"), "rooms").split(path.sep).join("/");
const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
export function openGlb(zone) {
  const buf = fs.readFileSync(`${DIR}/${zone}/${zone}.glb`);
  const jlen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jlen).toString("utf8"));
  const binStart = 20 + jlen + 8;
  const bin = buf.subarray(binStart);
  const viewCache = new Map();
  function view(i) {
    if (viewCache.has(i)) return viewCache.get(i);
    const bv = j.bufferViews[i]; let out;
    const ext = bv.extensions?.EXT_meshopt_compression;
    if (ext) {
      const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
      out = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter ?? "NONE");
      out.stride = ext.byteStride;
    } else { out = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength); out.stride = bv.byteStride; }
    viewCache.set(i, out); return out;
  }
  function accessor(i) {
    const a = j.accessors[i], [T, sz] = CT[a.componentType], nc = NC[a.type];
    const v = view(a.bufferView), stride = v.stride || sz * nc, off = a.byteOffset ?? 0;
    const out = new Float64Array(a.count * nc);
    const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
    const k = a.normalized ? 1 / NORM[a.componentType] : 1;
    for (let e = 0; e < a.count; e++) for (let c = 0; c < nc; c++) {
      const p = off + e * stride + c * sz; let x;
      switch (a.componentType) { case 5120: x = dv.getInt8(p); break; case 5121: x = dv.getUint8(p); break; case 5122: x = dv.getInt16(p, true); break; case 5123: x = dv.getUint16(p, true); break; case 5125: x = dv.getUint32(p, true); break; default: x = dv.getFloat32(p, true); }
      out[e * nc + c] = a.normalized ? Math.max(-1, x * k) : x;
    }
    return { data: out, count: a.count, nc };
  }
  return { j, accessor };
}
export function trsMat(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
export function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
export const xf = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
/** every (node, primitive, instance): cb({zone, node, mat, world, pos(Float64Array), idx}) */
export function eachPrim(zone, cb, skip = () => false) {
  const { j, accessor } = openGlb(zone);
  const parent = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const local = (n) => n.matrix ?? trsMat(n.translation, n.rotation, n.scale);
  const world = (i) => { let m = local(j.nodes[i]); let p = parent.get(i); while (p !== undefined) { m = mul(local(j.nodes[p]), m); p = parent.get(p); } return m; };
  j.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const mesh = j.meshes[n.mesh], name = n.name ?? mesh.name;
    if (skip(name, mesh.name)) return;
    const W = world(i); let inst = [W];
    const gi = n.extensions?.EXT_mesh_gpu_instancing;
    if (gi) {
      const T = gi.attributes.TRANSLATION !== undefined ? accessor(gi.attributes.TRANSLATION) : null, R = gi.attributes.ROTATION !== undefined ? accessor(gi.attributes.ROTATION) : null, S = gi.attributes.SCALE !== undefined ? accessor(gi.attributes.SCALE) : null;
      const cnt = (T ?? R ?? S).count; inst = [];
      for (let k = 0; k < cnt; k++) inst.push(mul(W, trsMat(T ? [...T.data.subarray(k * 3, k * 3 + 3)] : undefined, R ? [...R.data.subarray(k * 4, k * 4 + 4)] : undefined, S ? [...S.data.subarray(k * 3, k * 3 + 3)] : undefined)));
    }
    for (const p of mesh.primitives) {
      const pos = accessor(p.attributes.POSITION).data, idx = p.indices !== undefined ? accessor(p.indices).data : null;
      const mat = j.materials[p.material]?.name ?? "?";
      for (const m of inst) cb({ zone, node: name, mat, world: m, pos, idx });
    }
  });
  return j;
}
