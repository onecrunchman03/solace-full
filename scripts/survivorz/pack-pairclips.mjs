// SURVIVORZ: THE ZOMBIES' HALVES OF A NEW BODY'S PAIRED MOVES, packed small (Nov 4 2026 — Josh: grabs,
// bites and rescues for the bodies the character creator bakes).
//
// A grab or a bite is two clips baked together: the survivor's half lives on the survivor's body, the
// zombie's half (zd-<move>-<survivor>) on the ZOMBIE's — anim-build.cjs --zpair writes it into the
// zombie's out/. The seven hand-made survivors' halves were packed into every zombie's glb long ago; a
// creator body's would mean re-sending all nineteen 20 MB zombies to the server. So instead each zombie
// gets a SKELETON-ONLY glb holding just this survivor's halves — no mesh, no texture, a few hundred KB —
// and the show (client actors.ts) adds its clips to that zombie's own. The tracks name the zombie's
// nodes (three's sanitized names, as pack.mjs writes them), so they play on the zombie unchanged.
//
//   node scripts/survivorz/pack-pairclips.mjs <survivor body>
//   → assets/downloads/survivorz/creator/<body>/pairclips/<zombie>.glb
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, resample, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const X = process.argv[2];
if (!X || !/^[a-z0-9-]{2,32}$/.test(X)) throw new Error("usage: pack-pairclips.mjs <survivor body>");
/** the zombie halves the show plays (client show/stance.ts PAIR_CLIP): the struggle chains' links and the two bites */
// (the move, then the survivor's id: matched whole, so a body called soldier never takes swat-soldier's halves)
const HALF = /^zd-(fz-(?:front-struggle-(?:start-idle|start|free)|back-struggle-(?:start|idle|free))|bite-(?:forearm|shoulder))-([a-z0-9-]+)$/;
const halfFor = (name) => { const m = name.match(HALF); return m && m[2] === X ? m[1] : null; };

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const san = (n) => n.replace(/\s/g, "_").replace(/[\[\]\.:\/]/g, "");
const OUT = path.join(STAGE, "creator", X, "pairclips");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const zombies = fs.readdirSync(path.join(STAGE, "game")).filter((f) => /^zombie-.*\.glb$/.test(f)).map((f) => f.slice(0, -4)).sort();
let total = 0;
for (const z of zombies) {
  const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${z}.json`), "utf8"));
  const dir = path.join(STAGE, "out", job.out ?? z);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && halfFor(f.slice(0, -5)));
  if (!files.length) { console.log(`${z}: no halves baked for ${X}`); continue; }
  const doc = await io.read(path.join(ROOT, job.target.replace(/^\//, "")));
  const root = doc.getRoot();
  // the skeleton only: every mesh, skin, material and texture goes (the nodes keep their names and rest pose)
  for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const a of root.listAnimations()) a.dispose();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const nodes = new Map(root.listNodes().map((n) => [san(n.getName()), n]));
  let clips = 0;
  const missing = new Set();
  for (const f of files.sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
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
    }
    const extras = {};
    if (j.travel) extras.travel = j.travel;
    if (j.built?.place) extras.place = j.built.place;
    if (Object.keys(extras).length) anim.setExtras(extras);
    clips++;
  }
  await doc.transform(resample(), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = path.join(OUT, `${z}.glb`);
  await io.write(out, doc);
  total += clips;
  console.log(`${z}: ${clips} halves for ${X} → ${(fs.statSync(out).size / 1024).toFixed(0)} KB${missing.size ? `; NO NODE FOR: ${[...missing].join(", ")}` : ""}`);
}
if (!total) { console.error(`no zombie halves found for ${X}: run anim-build.cjs --zpair "" ${X} first`); process.exit(1); }
