// SURVIVORZ: ROLLO'S AIR PACK, measured (Josh, Oct 28 2026: "Rollos backpack has a weird glitch where the
// back part seperates when he walks"). Loads a packed body the way the game does (three's GLTFLoader,
// meshopt decoded) and plays clips through three's own skinning. What it found: the suit is ONE surface cut
// into UV islands, and the pack's back face and plate were rigid islands while its sides and top belonged to
// the torso's islands, weighted vertex by vertex — so along the seams between them the pack split open,
// on every one of the 803 clips (up to 46 cm). rollo-build.py's fix is checked here. Per clip, worst frame:
//   CRACK     how far apart the vertices of one seam point get, on the pack (CRACKALL: the whole suit)
//   BODY      how far any vertex of the pack's whole body (back face, plate, sides, top) is off one rigid
//             move — it should ride as a block; a two-bone blend on a big twist leaves a few cm
//   POKE      how far the suit comes out THROUGH the pack's shell (a ray from a covered vertex straight back
//             that no longer meets the pack), in the pack's own frame
//   INTO      how deep the person inside (rollo_body_proxy) goes behind the pack's front face
//   SEAM      how far suit vertices within 1.5 cm of the pack at rest pull away from it
//   node scripts/survivorz/rollo-pack-check.mjs [glb] [--clips a,b,c] [--frames 24] [--all] [--json out.json] [--why]
//   (default: the locomotion loops; --all: every clip, prints the worst; --why: the vertex behind each worst)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TJS = path.join(ROOT, "client", "node_modules", "three");
const THREE = await import(pathToFileURL(path.join(TJS, "build", "three.module.js")).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(TJS, "examples", "jsm", "loaders", "GLTFLoader.js")).href);
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => a.endsWith(".glb") || a.endsWith(".gltf")) ?? path.join(ROOT, "assets", "downloads", "survivorz", "game", "rollo.glb");
const FRAMES = Number(opt("--frames", 24));

// (no textures in Node: strip them, and hand three a plain decoded GLB)
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(file);
for (const t of doc.getRoot().listTextures()) t.dispose();
for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|texture|ktx/i.test(e.extensionName)) e.dispose();
const glb = await io.writeBinary(doc);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "", res, rej));
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const meshes = []; scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
const suit = meshes.find((m) => /rollo_suit/.test(m.name));
const proxy = meshes.find((m) => /body_proxy/.test(m.name));
if (!suit || !proxy) throw new Error("no rollo_suit / body_proxy in " + file + ": " + meshes.map((m) => m.name).join(", "));
const CLIPS = flag("--all") ? gltf.animations.map((a) => a.name) : opt("--clips", "ual1-walk-loop,ual1-jog-fwd-loop,ual1-sprint-loop,ual1-crouch-fwd-loop,ual1-crouch-idle-loop,ual1-idle-loop").split(",");

// (SkinnedMesh.getVertexPosition already applies the bones: the skinned position, in the mesh's space)
const skinned = (m, i, out = new THREE.Vector3()) => m.getVertexPosition(i, out).applyMatrix4(m.matrixWorld);
const pose = (m, ids) => ids.map((i) => skinned(m, i));
// ---- the suit's loose parts (index connectivity)
const P = suit.geometry.attributes.position, idx = suit.geometry.index;
const par = Int32Array.from({ length: P.count }, (_, i) => i);
const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
for (let t = 0; t < idx.count; t += 3) for (const [a, b] of [[0, 1], [1, 2]]) { const x = f(idx.getX(t + a)), y = f(idx.getX(t + b)); if (x !== y) par[x] = y; }
const comps = new Map(); for (let i = 0; i < P.count; i++) { const r = f(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
const allIds = [...Array(P.count).keys()];
const rest = pose(suit, allIds);
const mid = rest.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(rest.length);
const sb = new THREE.Box3().setFromPoints(rest);
const floorY = sb.min.y;
// THE PACK: the rig faces +Z, so the back is -Z; parts standing well behind the suit's middle at chest height
const packIds = [];
for (const ids of comps.values()) {
  const c = ids.reduce((a, i) => a.add(rest[i]), new THREE.Vector3()).divideScalar(ids.length);
  if (c.z < -0.13 && c.y - floorY > 0.95 && c.y - floorY < 1.6 && ids.length >= 8) packIds.push(...ids);
}
const isPack = new Uint8Array(P.count); for (const i of packIds) isPack[i] = 1;
const packRest = packIds.map((i) => rest[i]);
const pbox = new THREE.Box3().setFromPoints(packRest);
// the pack's OUTER (back) and INNER (front) surface, per 2 cm cell in x/y, read only in cells well inside its
// outline (every neighbour covered too: at the rim a cell's "outer" is the rim's own curl)
const CELL = 0.02, cx = (q) => Math.floor(q.x / CELL), cy = (q) => Math.floor(q.y / CELL), key = (q) => `${cx(q)},${cy(q)}`;
const outer0 = new Map(), inner0 = new Map();
for (const q of packRest) { const k = key(q); outer0.set(k, Math.min(outer0.get(k) ?? 1e9, q.z)); inner0.set(k, Math.max(inner0.get(k) ?? -1e9, q.z)); }
const outer = new Map(), inner = new Map();
for (const [k, v] of outer0) {
  const [x, y] = k.split(",").map(Number); let all = true;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!outer0.has(`${x + dx},${y + dy}`)) all = false;
  if (all) { outer.set(k, v); inner.set(k, inner0.get(k)); }
}
// THE PACK'S WHOLE BODY: the loose parts are only its back face and plate (its sides, top and rim are the
// edge of the torso's islands). Everything standing well off the person's back inside the pack's outline is
// pack, and should move as one block with it (rollo-build.py's own rule, read off the proxy here)
const BACKY = new Map();   // the person's back (three: -Z is behind him) per 2 cm of height, |x| < 12 cm
const prox0 = pose(proxy, [...Array(proxy.geometry.attributes.position.count).keys()]);
for (const q of prox0) if (Math.abs(q.x) < 0.12) { const k = Math.round((q.y - floorY) / 0.02); BACKY.set(k, Math.min(BACKY.get(k) ?? 1e9, q.z)); }
const backAt = (y) => { const k = Math.round((y - floorY) / 0.02); return BACKY.get(k) ?? BACKY.get(k - 1) ?? BACKY.get(k + 1) ?? -0.12; };
const pyMin = pbox.min.y, pyMax = Math.max(...packIds.filter((i) => rest[i].z < -0.2).map((i) => rest[i].y));
const packBody = allIds.filter((i) => isPack[i] || (backAt(rest[i].y) - rest[i].z > 0.07 && Math.abs(rest[i].x) < 0.15 && rest[i].y > pyMin - 0.01 && rest[i].y < pyMax + 0.03));
// CRACKS: the suit is one surface cut into UV islands, each seam point two or three vertices on one spot;
// how far apart such a spot's vertices get is how wide the crack there opens
const spot = new Map(); allIds.forEach((i) => { const q = rest[i]; const k = `${Math.round(q.x / 2e-4)},${Math.round(q.y / 2e-4)},${Math.round(q.z / 2e-4)}`; if (!spot.has(k)) spot.set(k, []); spot.get(k).push(i); });
const spots = [...spot.values()].filter((v) => v.length > 1);
const inPackBox = (q) => q.x > pbox.min.x - 0.04 && q.x < pbox.max.x + 0.04 && q.y > pbox.min.y - 0.06 && q.y < pbox.max.y + 0.1 && q.z < -0.02;
const packSpots = spots.filter((v) => inPackBox(rest[v[0]]));
const spotIds = [...new Set(spots.flat())];
// the suit near the pack: everything not pack in a margin round its box (and the person inside the same)
const near = (q) => q.x > pbox.min.x - 0.05 && q.x < pbox.max.x + 0.05 && q.y > pbox.min.y - 0.08 && q.y < pbox.max.y + 0.05 && q.z < mid.z + 0.02;
const suitNear0 = allIds.filter((i) => !isPack[i] && near(rest[i]));
const PP = proxy.geometry.attributes.position.count;
const proxyRest = pose(proxy, [...Array(PP).keys()]);
const proxyNear = [...Array(PP).keys()].filter((i) => near(proxyRest[i]));
// the SEAM: suit vertices within 1.5 cm of a pack vertex at rest, paired with it
const seam = [];
for (const i of suitNear0) { let best = -1, bd = 0.015; for (let k = 0; k < packIds.length; k++) { const d = rest[i].distanceTo(packRest[k]); if (d < bd) { bd = d; best = k; } } if (best >= 0) seam.push([i, best, bd]); }
// the pack's weights (for the report)
const J = suit.geometry.attributes.skinIndex, W = suit.geometry.attributes.skinWeight, bones = suit.skeleton.bones;
const sigOf = (i) => { const s = []; for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (w > 0.001) s.push(`${bones[J.getComponent(i, k)].name}:${w.toFixed(2)}`); } return s.sort().join(" "); };
const packSigs = new Map(); for (const i of packIds) packSigs.set(sigOf(i), (packSigs.get(sigOf(i)) ?? 0) + 1);

// Horn: best rigid move of a onto b; returns {R, ca, cb, max}
function rigid(a, b) {
  const ca = new THREE.Vector3(), cb = new THREE.Vector3();
  a.forEach((p) => ca.add(p)); b.forEach((p) => cb.add(p)); ca.divideScalar(a.length); cb.divideScalar(b.length);
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i].x - ca.x, y = a[i].y - ca.y, z = a[i].z - ca.z, X = b[i].x - cb.x, Y = b[i].y - cb.y, Z = b[i].z - cb.z;
    Sxx += x * X; Sxy += x * Y; Sxz += x * Z; Syx += y * X; Syy += y * Y; Syz += y * Z; Szx += z * X; Szy += z * Y; Szz += z * Z;
  }
  const N = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz], [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const shift = [Sxx, Syy, Szz, Sxy, Sxz, Syx, Syz, Szx, Szy].reduce((s, v) => s + Math.abs(v), 1e-9) * 2;
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 300; it++) {
    const nq = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) { nq[r] = shift * q[r]; for (let c = 0; c < 4; c++) nq[r] += N[r][c] * q[c]; }
    const l = Math.hypot(...nq); q = nq.map((v) => v / l);
  }
  const R = new THREE.Quaternion(q[1], q[2], q[3], q[0]);
  let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, a[i].clone().sub(ca).applyQuaternion(R).add(cb).distanceTo(b[i]));
  return { R, Ri: R.clone().invert(), ca, cb, max };
}
const toPack = (fit, q) => q.clone().sub(fit.cb).applyQuaternion(fit.Ri).add(fit.ca);   // a point now → the pack's rest frame
// POKE by rays: a suit vertex the pack covers at rest (a ray from it straight back meets the pack) has come
// out through it when that ray meets nothing; how far is where the ray forward meets the pack's shell
const tri = []; for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (isPack[a] && isPack[b] && isPack[c]) for (const v of [a, b, c]) tri.push(rest[v].x, rest[v].y, rest[v].z); }
const packGeo = new THREE.BufferGeometry(); packGeo.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
const packMesh = new THREE.Mesh(packGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); packMesh.updateMatrixWorld(true);
const rc = new THREE.Raycaster(), BACK = new THREE.Vector3(0, 0, -1), FWD = new THREE.Vector3(0, 0, 1);
const hits = (q, d) => { rc.set(q, d); rc.far = 1; return rc.intersectObject(packMesh, false); };
let pokeWho = -1;
const suitNear = suitNear0.filter((i) => hits(rest[i], BACK).length > 0);   // (covered by the pack at rest)
function poke(points, ids) {
  let worst = 0; points.forEach((q, j) => { if (hits(q, BACK).length) return; const f = hits(q, FWD); if (!f.length) return; const d = f[f.length - 1].distance; if (d > worst) { worst = d; pokeWho = ids ? ids[j] : -1; } }); return worst;
}
function into(points) {   // deepest point of the person behind the pack's front face (in its footprint)
  let worst = 0; for (const q of points) { const n = inner.get(key(q)); if (n !== undefined && q.z < n) worst = Math.max(worst, n - q.z); } return worst;
}
console.log(`${path.relative(ROOT, file)}: pack ${packIds.length} verts, box x ${pbox.min.x.toFixed(2)}..${pbox.max.x.toFixed(2)} y(above floor) ${(pbox.min.y - floorY).toFixed(2)}..${(pbox.max.y - floorY).toFixed(2)} z ${pbox.min.z.toFixed(3)}..${pbox.max.z.toFixed(3)}; weights ${[...packSigs.entries()].map(([s, k]) => `${k}× ${s}`).join(" | ")}`);
console.log(`  pack body ${packBody.length} verts; seam spots ${spots.length} (${packSpots.length} on the pack)`);
console.log(`  suit near it ${suitNear.length} verts, seam pairs ${seam.length}, person near it ${proxyNear.length}; at rest: poke ${(poke(suitNear.map((i) => rest[i])) * 100).toFixed(1)} cm (inside ${outer.size} cells), person into pack ${(into(proxyNear.map((i) => proxyRest[i])) * 100).toFixed(1)} cm`);

const mixer = new THREE.AnimationMixer(scene);
const byName = new Map(gltf.animations.map((a) => [a.name, a]));
const report = {};
for (const name of CLIPS) {
  const clip = byName.get(name); if (!clip) { console.log(name, "— not in the file"); continue; }
  mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset().play();
  const w = { crack: [0, 0], crackAll: [0, 0], body: [0, 0], poke: [0, 0], into: [0, 0], seam: [0, 0] };
  const n = Math.max(2, Math.round(Math.min(FRAMES, clip.duration * 30)));
  for (let fr = 0; fr < n; fr++) {
    const t = clip.duration * fr / n; mixer.setTime(t); scene.updateMatrixWorld(true);
    const now = pose(suit, packIds), fit = rigid(packRest, now);
    const sMap = new Map(suitNear0.map((i) => [i, toPack(fit, skinned(suit, i))]));
    const sN = suitNear.map((i) => sMap.get(i));
    const pN = proxyNear.map((i) => toPack(fit, skinned(proxy, i)));
    let sm = 0, smi = null; for (const [i, k, d0] of seam) { const d = sMap.get(i).distanceTo(packRest[k]) - d0; if (d > sm) { sm = d; smi = i; } }
    if (flag("--why") && smi !== null && sm > 0.1) console.log(`   seam ${name} t ${t.toFixed(2)} ${(sm*100).toFixed(1)}cm vertex ${smi} rest (${rest[smi].toArray().map((v) => v.toFixed(3))}) ${sigOf(smi)}`);
    const bodyNow = pose(suit, packBody), bodyFit = rigid(packBody.map((i) => rest[i]), bodyNow);
    if (flag("--why") && bodyFit.max > 0.05) { const R0 = packBody.map((i) => rest[i]); let wi = -1, wd = 0; R0.forEach((q, j) => { const d = q.clone().sub(bodyFit.ca).applyQuaternion(bodyFit.R).add(bodyFit.cb).distanceTo(bodyNow[j]); if (d > wd) { wd = d; wi = packBody[j]; } }); console.log(`   body ${name} t ${t.toFixed(2)} ${(wd * 100).toFixed(1)} cm at ${wi} rest (${rest[wi].toArray().map((v) => v.toFixed(3))}) above floor ${(rest[wi].y - floorY).toFixed(3)} behind back ${(backAt(rest[wi].y) - rest[wi].z).toFixed(3)} pack? ${isPack[wi]} ${sigOf(wi)}`); }
    const spNow = new Map(spotIds.map((i) => [i, skinned(suit, i)]));
    const crack = (list) => { let m = 0; for (const v of list) for (let a = 1; a < v.length; a++) m = Math.max(m, spNow.get(v[0]).distanceTo(spNow.get(v[a]))); return m; };
    const vals = { crack: crack(packSpots), crackAll: crack(spots), body: bodyFit.max, poke: poke(sN, suitNear), into: into(pN), seam: sm };
    if (flag("--why") && vals.poke > 0.01) console.log(`   poke ${name} t ${t.toFixed(2)} ${(vals.poke * 100).toFixed(1)} cm by ${pokeWho} rest (${rest[pokeWho].toArray().map((v) => v.toFixed(3))}) ${sigOf(pokeWho)}`);
    for (const k in vals) if (vals[k] > w[k][0]) w[k] = [vals[k], t];
  }
  report[name] = Object.fromEntries(Object.entries(w).map(([k, [v, t]]) => [k, { cm: +(v * 100).toFixed(1), at: +t.toFixed(2) }]));
  if (!flag("--all") || flag("--verbose")) console.log(name.padEnd(46), Object.entries(report[name]).map(([k, v]) => `${k} ${v.cm.toFixed(1).padStart(5)} cm`).join("  "));
}
if (flag("--all")) {
  for (const k of ["crack", "crackAll", "body", "poke", "into", "seam"]) {
    const top = Object.entries(report).sort((a, b) => b[1][k].cm - a[1][k].cm);
    const over = (lim) => top.filter(([, r]) => r[k].cm > lim).length;
    console.log(`${k.toUpperCase().padEnd(5)} worst ${top.slice(0, 4).map(([c, r]) => `${c} ${r[k].cm}`).join(", ")} · clips over 1 cm ${over(1)} · over 3 cm ${over(3)} (of ${top.length})`);
  }
}
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(report, null, 1));
