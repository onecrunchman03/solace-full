// SURVIVORZ: packs one body and every clip baked for it into ONE game-ready GLB
// — the mesh, its skeleton, and each clip as a glTF animation, resampled and
// meshopt-compressed (the client already decodes meshopt for the prop kit).
// The clip's `travel` path rides in the animation's extras, so a one-shot
// (a fall, a stagger) can still slide the body in the game.
//
//   node scripts/survivorz/pack.mjs <body>        e.g. eric, zombie-m01
//   → assets/downloads/survivorz/game/<body>.glb  (gitignored; licensed assets)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, resample, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2];
if (!body) throw new Error("usage: pack.mjs <body>");
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const src = path.join(ROOT, job.target.replace(/^\//, ""));

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const buffer = root.listBuffers()[0] ?? doc.createBuffer();
// three's GLTFLoader names nodes through PropertyBinding.sanitizeNodeName
// (whitespace → _, and . : / [ ] dropped), and the baked tracks carry THAT
// name — so look a track's node up by its sanitized form
const san = (n) => n.replace(/\s/g, "_").replace(/[\[\]\.:\/]/g, "");
const nodes = new Map();
for (const n of root.listNodes()) nodes.set(san(n.getName()), n);
// a body's own sample animation (the Renderpeople animated ones carry one) goes
for (const a of root.listAnimations()) a.dispose();

const outDir = path.join(STAGE, "out", body);
let clips = 0, tracks = 0, missing = new Set();
const NEXT = process.env.NEXT_OUT ? path.join(process.env.NEXT_OUT, body) : null;
const files = new Map(fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).map((f) => [f, path.join(outDir, f)]));
if (NEXT && fs.existsSync(NEXT)) for (const f of fs.readdirSync(NEXT).filter((f) => f.endsWith(".json"))) files.set(f, path.join(NEXT, f));
for (const f of [...files.keys()].sort()) {
  const j = JSON.parse(fs.readFileSync(files.get(f), "utf8"));
  const anim = doc.createAnimation(j.name);
  for (const t of j.tracks) {
    const dot = t.name.lastIndexOf(".");
    const node = nodes.get(t.name.slice(0, dot));
    if (!node) { missing.add(t.name.slice(0, dot)); continue; }
    const pathName = { quaternion: "rotation", position: "translation", scale: "scale" }[t.name.slice(dot + 1)];
    const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(t.times)).setBuffer(buffer);
    const output = doc.createAccessor().setType(pathName === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(t.values)).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
    tracks++;
  }
  if (j.travel) anim.setExtras({ travel: j.travel });
  clips++;
}
await doc.transform(resample(), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
fs.mkdirSync(path.join(STAGE, "game-next"), { recursive: true });
const out = path.join(STAGE, "game-next", `${body}.glb`);
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
console.log(`${body}: ${clips} clips, ${tracks} tracks → ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1048576).toFixed(1)} MB` +
  (missing.size ? `; NO NODE FOR: ${[...missing].join(", ")}` : ""));
