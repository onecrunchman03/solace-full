// SURVIVORZ: makes the guns from the pack Josh bought (Fab, "Rigged Gun Collection", Synapse
// Studio — assets/New Assets/New folder/source (1).zip) game-ready, and records where a hand
// holds each one. Josh, Oct 21 2026: "model only the guns from the pack i bought and also make
// sure they fit well [in] each model's hands, their hands are in the correct positions".
//
// Each gun comes out as assets/downloads/survivorz/props/guns/<id>.glb in ONE convention, so a
// hand can hold any of them the same way:
//   the ORIGIN is the middle of the shooting hand's fist on the grip,
//   +Z is out of the muzzle along the bore, +Y is up, sizes in real metres.
// and its HOLD (GUNS below, also written to guns.json) says, in that space: where the support
// hand's fist goes (the handguard / the pump), where the butt meets the shoulder, the muzzle, how
// far the grip leans back (the fist's thumb side runs up the grip), and for a pump gun the pump's
// stroke. The measurements were read off gun-bench.html's millimetre-grid side views of each
// model (FBX2glTF conversions of the pack's FBX files, muzzle +X, in their own units).
//   node scripts/survivorz/guns.mjs        (needs the converted glb/ and unpacked x-*/ folders)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { looseParts } from "./gun-parts.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(ROOT, "assets", "downloads", "survivorz", "originals", "gun-pack");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "props", "guns");

// in each model's own space (muzzle +X, up +Y): measured on the bench. `scale` takes it to real
// metres; `cut` drops loose parts; `split` moves some triangles into a second, movable piece.
export const GUNS = {
  shotgun: {
    src: "glb/shotgun.glb", name: "Tactical shotgun (pump)", scale: 1.0,     // 1.01 m: a real 18" pump gun
    // (the grip is the stock's WRIST, Oct 22 2026: a straight stock has no pistol grip, and the
    // point first read off the bench sat 4.5 cm in front of the wrist, under the trigger guard, in
    // the air. The hand closed round nothing — read off the gun's own solid, gunslice in the hand
    // checks: the wrist's front edge runs from 4.5 cm behind that point at its foot to just ahead
    // of it at the receiver, and the hand's bar sits a centimetre behind that edge)
    grip: [-0.287, -0.051], support: [0.138, 0.002], butt: [-0.562, -0.05], muzzle: [0.442, 0.039],
    gripLean: 38,              // the stock's wrist leans back this far from upright
    stroke: 0.09,              // how far the pump racks back
    // the sling: the one loose part that hangs below the stock (to y -0.29)
    cut: (p) => p.min[1] < -0.2,
    // the pump: the fore-end round the magazine tube, x 0.06..0.215, further from the tube's axis
    // (y 0.002, z 0) than the tube's own skin
    split: { name: "pump", test: (c) => c[0] > 0.06 && c[0] < 0.215 && c[1] < 0.024 && Math.hypot(c[1] - 0.002, c[2]) > 0.0135 },
    // the magazine tube was never modelled under the pump (the pump is a hollow sleeve), so a
    // racked pump showed empty air: the hidden length of tube, matched to the visible tube
    fill: { from: [0.03, 0.0045], to: [0.24, 0.0045], r: 0.0115, color: [0.035, 0.035, 0.038] },
    tex: { dir: "x-tactical-shotgun/textures", base: "DIFFUSE_SHOTGUN.jpg", normal: "NORMAL_SHOTGUN.jpg", rough: "ROUGHNESS_SHOTGUN.jpg", metal: "METALNESS_SHOTGUN.jpg" },
  },
  hk416: {
    src: "glb/hk416.glb", name: "HK416 carbine", scale: 1.95,               // 0.46 m as modelled; a real one is ~0.9
    grip: [-0.018, -0.021], support: [0.148, 0.033], butt: [-0.159, 0.014], muzzle: [0.299, 0.037],
    gripLean: 18,
    tex: { dir: "x-rifle_hk416_free/Rifle HK416 - Free", base: "T_Rifle-HK416_BaseColor.png", normal: "T_Rifle-HK416_NormalMap.png", unityMS: "T_Rifle-HK416_MetallicSmoothness.png" },
  },
  // the one gun NOT from the pack, by Josh's word (Oct 21 2026: "also get the free pistol as well"):
  // Poly Haven's Service Pistol (CC0, Mateusz Sadek), already a glTF in real metres with its own
  // PBR material. The file lays out a whole kit side by side — a second pistol with its slide
  // locked back, an empty magazine, a loose round — so only the first pistol's own parts are kept,
  // the loaded magazine put back up its grip
  pistol: {
    src: "../../free/polyhaven/service_pistol/service_pistol.gltf", name: "Service pistol", scale: 1.0,   // 0.22 m
    keep: ["service_pistol_pistol_a", "service_pistol_slide_a", "service_pistol_hammer_a", "service_pistol_trigger_a", "service_pistol_magazine_loaded"],
    place: { service_pistol_magazine_loaded: [0, 0, 0] },
    piece: { service_pistol_slide_a: "slide" },   // the slide, a piece of its own so it can kick back
    grip: [-0.004, -0.01], butt: [-0.046, 0.045], muzzle: [0.174, 0.062], support: [0.0, -0.01],
    gripLean: 16, stroke: 0.035,
    // the support hand cups the shooting hand (a two-handed pistol grip), not a handguard: its fist
    // in gun space (x = the gun's LEFT), fingers wrapping the front of the shooting fingers, palm in
    supportGrip: { at: [0.042, -0.022, 0.012], fingers: [-0.55, -0.55, -0.25], palm: [-0.85, 0.25, 0.1] },
    ownMaterial: true,
  },
};

// a model point (x along the bore, y up) into gun space: about the grip, scaled, +X turned to +Z
const toGun = (g, [x, y]) => [0, (y - g.grip[1]) * g.scale, (x - g.grip[0]) * g.scale].map((v) => +v.toFixed(4));

function textures(id, g, dir) {
  const T = path.join(PACK, g.tex.dir), tmp = path.join(dir, "tex"); fs.mkdirSync(tmp, { recursive: true });
  const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
  const out = {};
  // 2K is plenty for a gun across a room on a stream; the 8K source PNGs are 50 MB each
  ff(["-i", path.join(T, g.tex.base), "-vf", "scale=2048:-1", "-q:v", "3", path.join(tmp, `${id}-base.jpg`)]); out.base = `${id}-base.jpg`;
  ff(["-i", path.join(T, g.tex.normal), "-vf", "scale=2048:-1", path.join(tmp, `${id}-normal.png`)]); out.normal = `${id}-normal.png`;
  const mr = path.join(tmp, `${id}-mr.png`);
  if (g.tex.unityMS) {
    // Unity packs metallic in R and SMOOTHNESS in A; glTF wants roughness in G, metal in B
    ff(["-i", path.join(T, g.tex.unityMS), "-vf", "scale=2048:-1,format=rgba,geq=r='255':g='255-alpha(X,Y)':b='r(X,Y)':a='255',format=rgb24", mr]);
  } else {
    ff(["-i", path.join(T, g.tex.rough), "-i", path.join(T, g.tex.metal), "-i", path.join(T, g.tex.rough), "-filter_complex",
      "[0]scale=2048:-1,format=gray[a];[1]scale=2048:-1,format=gray[b];[2]scale=2048:-1,format=gray[c];[a][b][c]mergeplanes=0x001020:gbrp,format=rgb24", mr]);
  }
  out.mr = `${id}-mr.png`;
  return Object.fromEntries(Object.entries(out).map(([k, f]) => [k, path.join(tmp, f)]));
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });
const holds = {};
for (const [id, g] of Object.entries(GUNS)) {
  const doc = await io.read(path.join(PACK, g.src));
  const root = doc.getRoot(), buf = root.listBuffers()[0];
  for (const [n, t] of Object.entries(g.place ?? {})) root.listNodes().find((x) => x.getName() === n)?.setTranslation(t);
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  for (const n of meshNodes) if (g.keep && !g.keep.includes(n.getName())) { n.dispose(); }
  const kept = meshNodes.filter((n) => !g.keep || g.keep.includes(n.getName()));
  let mat;
  if (g.ownMaterial) {
    mat = root.listMaterials()[0].setName(id);
    // its 2K photo-scan maps are 8 MB of JPEG: 1K at an ordinary quality is plenty for a gun in a hand
    const tmp = path.join(OUT, "tex"); fs.mkdirSync(tmp, { recursive: true });
    for (const t of root.listTextures()) {
      const a = path.join(tmp, `${id}-in.jpg`), b = path.join(tmp, `${id}-${t.getName() || root.listTextures().indexOf(t)}.jpg`);
      fs.writeFileSync(a, t.getImage());
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a, "-vf", "scale=1024:-1", "-q:v", "4", b]);
      t.setImage(fs.readFileSync(b)).setMimeType("image/jpeg");
    }
  }
  else {
    const tex = textures(id, g, OUT);
    const img = (f, mime) => doc.createTexture(path.basename(f)).setImage(fs.readFileSync(f)).setMimeType(mime);
    mat = doc.createMaterial(id).setBaseColorTexture(img(tex.base, "image/jpeg")).setNormalTexture(img(tex.normal, "image/png"))
      .setMetallicRoughnessTexture(img(tex.mr, "image/png")).setMetallicFactor(1).setRoughnessFactor(1);
  }
  const gun = doc.createNode(id);
  const pieces = { body: { pos: [], nrm: [], uv: [] }, ...(g.split ? { [g.split.name]: { pos: [], nrm: [], uv: [] } } : {}),
    ...Object.fromEntries(Object.values(g.piece ?? {}).map((n) => [n, { pos: [], nrm: [], uv: [] }])) };
  // every mesh's triangles baked into gun space (node matrix, then about the grip, scaled, turned)
  const rot = (v) => [-v[2], v[1], v[0]];   // +X (muzzle) to +Z, about Y
  for (const node of kept) {
    const M = node.getWorldMatrix(), own = g.piece?.[node.getName()];
    const xf = (r, k, w) => [0, 1, 2].map((c) => M[c] * r[k] + M[4 + c] * r[k + 1] + M[8 + c] * r[k + 2] + w * M[12 + c]);
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute("POSITION").getArray(), N = prim.getAttribute("NORMAL")?.getArray(), U = prim.getAttribute("TEXCOORD_0")?.getArray(), I = prim.getIndices().getArray();
      const drop = new Set((g.cut ? looseParts(prim, M).filter(g.cut) : []).flatMap((p) => p.tris));
      for (let t = 0; t < I.length / 3; t++) {
        if (drop.has(t)) continue;
        const vs = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
        const world = vs.map((v) => xf(P, v * 3, 1));
        const c = [0, 1, 2].map((k) => (world[0][k] + world[1][k] + world[2][k]) / 3);
        const into = own ? pieces[own] : g.split && g.split.test(c) ? pieces[g.split.name] : pieces.body;
        for (const [j, v] of vs.entries()) {
          const w = world[j], p = rot([(w[0] - g.grip[0]) * g.scale, (w[1] - g.grip[1]) * g.scale, w[2] * g.scale]);
          into.pos.push(...p);
          const n = N ? xf(N, v * 3, 0) : [0, 1, 0], nl = Math.hypot(...n) || 1;
          into.nrm.push(...rot(n.map((x) => x / nl)));
          into.uv.push(U ? U[v * 2] : 0, U ? U[v * 2 + 1] : 0);
        }
      }
    }
    node.dispose();
  }
  // a plain cylinder for a part the model leaves out (the shotgun's tube under its pump)
  if (g.fill) {
    const { from: [x0, y0], to: [x1], r } = g.fill, d = pieces.body, N = 20, base = d.pos.length / 3;
    const ring = (x, k) => { const a = (k / N) * Math.PI * 2; return [x, y0 + r * Math.cos(a), r * Math.sin(a), Math.cos(a), Math.sin(a)]; };
    d.fill = { start: base };
    for (let k = 0; k < N; k++) for (const [ka, kb] of [[k, k + 1]]) {
      const A0 = ring(x0, ka), A1 = ring(x1, ka), B0 = ring(x0, kb), B1 = ring(x1, kb);
      for (const v of [A0, A1, B1, A0, B1, B0]) {
        d.pos.push(...rot([(v[0] - g.grip[0]) * g.scale, (v[1] - g.grip[1]) * g.scale, v[2] * g.scale]));
        d.nrm.push(...rot([0, v[3], v[4]])); d.uv.push(0.001, 0.001);
      }
    }
    d.fill.end = d.pos.length / 3;
  }
  for (const [name, d] of Object.entries(pieces)) {
    if (!d.pos.length) continue;
    const mesh = doc.createMesh(name);
    const prim = (a, b, m) => doc.createPrimitive().setMaterial(m)
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(d.pos.slice(a * 3, b * 3))).setBuffer(buf))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(d.nrm.slice(a * 3, b * 3))).setBuffer(buf))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(d.uv.slice(a * 2, b * 2))).setBuffer(buf));
    if (d.fill) {
      mesh.addPrimitive(prim(0, d.fill.start, mat));
      mesh.addPrimitive(prim(d.fill.start, d.fill.end, doc.createMaterial(`${id}-tube`).setBaseColorFactor([...g.fill.color, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.45)));
    } else mesh.addPrimitive(prim(0, d.pos.length / 3, mat));
    gun.addChild(doc.createNode(name).setMesh(mesh));
  }
  for (const s of root.listScenes()) { for (const c of s.listChildren()) s.removeChild(c); s.addChild(gun); }
  for (const m of root.listMaterials()) if (m !== mat && m.getName() !== `${id}-tube`) m.dispose();
  for (const t of root.listTextures()) if (!t.listParents().some((p) => p.propertyType === "Material")) t.dispose();
  for (const m of root.listMeshes()) if (!m.listParents().some((p) => p.propertyType === "Node")) m.dispose();
  // and the vertex data of everything left behind (the kit's second pistol, the spare magazine)
  for (const x of root.listAccessors()) if (!x.listParents().some((p) => p.propertyType !== "Root")) x.dispose();
  await io.write(path.join(OUT, `${id}.glb`), doc);
  holds[id] = {
    name: g.name, support: toGun(g, g.support), butt: toGun(g, g.butt), muzzle: toGun(g, g.muzzle),
    gripLean: g.gripLean, ...(g.stroke ? { stroke: g.stroke } : {}),
    ...(g.split ? { pump: g.split.name } : {}), ...(g.piece ? { slide: Object.values(g.piece)[0] } : {}),
    ...(g.supportGrip ? { supportGrip: g.supportGrip } : {}),
  };
  console.log(id, JSON.stringify(holds[id]), `${(fs.statSync(path.join(OUT, `${id}.glb`)).size / 1e6).toFixed(1)} MB`);
}
fs.writeFileSync(path.join(OUT, "guns.json"), JSON.stringify(holds, null, 1));
