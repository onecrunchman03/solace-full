// SURVIVORZ, GLENRIDGE HALL: what a packed zone weighs, and where.   node scripts/survivorz/glenridge/zone-weigh.mjs glen-ground
import path from "node:path"; import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core"; import { ALL_EXTENSIONS } from "@gltf-transform/extensions"; import { MeshoptDecoder } from "meshoptimizer";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."); const zone = process.argv[2] ?? "glen-ground";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(path.join(ROOT, "assets", "downloads", "survivorz", "rooms", zone, zone + ".glb")); const root = doc.getRoot();
const mb = (n) => (n / 1e6).toFixed(1);
const tex = root.listTextures().map((t) => ({ name: t.getName() || t.getURI() || "?", bytes: t.getImage()?.byteLength ?? 0, size: t.getSize()?.join("x") ?? "?" })).sort((a, b) => b.bytes - a.bytes);
console.log(`${zone}: ${tex.length} textures, ${mb(tex.reduce((s, t) => s + t.bytes, 0))} MB`);
const bySize = {}; for (const t of tex) { bySize[t.size] ??= { n: 0, bytes: 0 }; bySize[t.size].n++; bySize[t.size].bytes += t.bytes; }
for (const [k, v] of Object.entries(bySize).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6)) console.log(`  ${k}: ${v.n} textures, ${mb(v.bytes)} MB`);
console.log("  heaviest:", tex.slice(0, 8).map((t) => `${t.name} ${mb(t.bytes)}`).join(" · "));
const uses = new Map(); let nodes = 0;
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; nodes++; uses.set(m, (uses.get(m) ?? 0) + 1); }
const meshes = [...uses].map(([m, n]) => { let tris = 0, prims = 0; for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3; } return { name: m.getName(), n, tris, prims }; }).sort((a, b) => b.tris * b.n - a.tris * a.n);
console.log(`  ${nodes} mesh nodes of ${meshes.length} meshes; drawn ${Math.round(meshes.reduce((s, m) => s + m.tris * m.n, 0) / 1000)}k triangles in ${meshes.reduce((s, m) => s + m.prims * m.n, 0)} draws`);
for (const m of meshes.slice(0, 12)) console.log(`    ${m.name}: ${Math.round(m.tris / 1000)}k x ${m.n} (${m.prims} parts)`);
