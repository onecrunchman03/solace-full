// SURVIVORZ EFFECTS — the engine's rules, checked (docs/survivorz/EFFECTS.md §2).
// In-process on the SHIPPED engine (client/src/survivorz/fx, bundled by esbuild
// with three), no browser and no GPU: the rules are about counts, order and
// determinism, which don't need either.
//
//   node scripts/survivorz/fx-check.mjs
//
// Not in scripts/checks yet: Survivorz is uncommitted until Josh says otherwise.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fxcheck-"));
const out = path.join(tmp, "fx.mjs");
await esbuild.build({
  stdin: {
    contents: `export * from "./client/src/survivorz/fx/index.ts"; export * as THREE from "three";`,
    resolveDir: ROOT, loader: "ts",
  },
  nodePaths: [path.join(ROOT, "client", "node_modules")],
  outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "error",
});
const M = await import(pathToFileURL(out).href);
const { THREE, FxSystem, BUDGET, POOL, effects, mulberry32, GUN_FX, Cuttable, BLOOD, spinAlong } = M;

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${what}`);
};

// a stand-in renderer: the engine only asks it to compile and upload, never to draw here
const renderer = { initTexture() {}, async compileAsync() {} };
const sheets = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "flipbooks", "flipbooks.json"), "utf8"));
const blank = () => {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  t.image = { width: 2048, height: 2048, data: new Uint8Array(4) };
  return t;
};
async function make(sheetIds) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 100);
  camera.position.set(0, 1.6, 4);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const fx = new FxSystem({
    scene, camera, renderer, sheets: sheetIds, spriteTexture: blank(),
    load: { texture: async () => blank(), json: async () => sheets },
  });
  await fx.load();
  return { fx, scene, camera };
}
const lightCount = (scene) => {
  let n = 0;
  scene.traverse((o) => { if (o.isLight) n++; });
  return n;
};
const buffers = (fx) => [...fx.layers.values()].map((l) => Array.from(l.mesh.geometry.getAttribute("iPos").array.slice(0, l.live * 3)).map((x) => x.toFixed(5)).join(",")).join("|");

console.log("-- the budget");
{
  // the show's own set: every sheet but a stand-in whose better version is there
  const { fx } = await make(undefined);
  const total = [...fx.layers.values()].reduce((n, l) => n + l.capacity, 0);
  ok(total <= BUDGET.particles, `every layer's capacity together (${total}, ${fx.layers.size - 1} sheets) is inside ${BUDGET.particles}`);
  const spr = fx.layer("sprites");
  let took = 0;
  for (let i = 0; i < spr.capacity + 50; i++) if (spr.spawn({ pos: new THREE.Vector3(), life: 5, size: [0.1, 0.1] })) took++;
  ok(took === spr.capacity, `a full layer drops the newest card: ${took} taken of ${spr.capacity + 50} asked`);
  fx.update(1 / 30);
  ok(spr.live === spr.capacity, `and draws exactly its capacity (${spr.live})`);
  let threw = false;
  try {
    const big = Object.keys(sheets);
    // more sheets than the cap allows must be refused at load, not discovered in a firefight
    const many = Array.from({ length: Math.ceil((BUDGET.particles - BUDGET.sprites) / BUDGET.perSheet) + 1 }, (_, i) => big[i % big.length]);
    await make(many);
  } catch {
    threw = true;
  }
  ok(threw, "loading more sheets than the particle cap allows is refused at load");
}

console.log("-- one appearance, every observer (the seed decides everything)");
{
  const a = await make(["explosion-hd", "explosion-dust", "smoke-wisp-a"]);
  const b = await make(["explosion-hd", "explosion-dust", "smoke-wisp-a"]);
  const c = await make(["explosion-hd", "explosion-dust", "smoke-wisp-a"]);
  for (const { fx } of [a, b, c]) fx.surfaces.length = 0;
  a.fx.play(effects.explosion, { pos: new THREE.Vector3(0, 0, 0), floorY: 0 }, 77);
  b.fx.play(effects.explosion, { pos: new THREE.Vector3(0, 0, 0), floorY: 0 }, 77);
  c.fx.play(effects.explosion, { pos: new THREE.Vector3(0, 0, 0), floorY: 0 }, 78);
  for (let i = 0; i < 20; i++) for (const { fx } of [a, b, c]) fx.update(1 / 30);
  ok(buffers(a.fx) === buffers(b.fx) && buffers(a.fx).length > 0, "the same event and seed make the identical blast, card for card");
  ok(buffers(a.fx) !== buffers(c.fx), "a different seed makes a different one");
  const sa = a.fx.shakeOffset(new THREE.Vector3(1, 1.6, 3)), sb = b.fx.shakeOffset(new THREE.Vector3(1, 1.6, 3));
  ok(sa.equals(sb) && sa.length() > 0, "and shakes every observer's camera the same way");
}

console.log("-- the shake (no slow motion, a small shake on blasts only)");
{
  const { fx } = await make([]);
  fx.shake(new THREE.Vector3(0, 0, 0), 0.06, 16, 0.7, 5);
  fx.update(0.05);
  const near = fx.shakeOffset(new THREE.Vector3(0, 1.6, 2)).length();
  const far = fx.shakeOffset(new THREE.Vector3(0, 1.6, 15)).length();
  const out = fx.shakeOffset(new THREE.Vector3(0, 1.6, 30)).length();
  ok(near > far && far >= 0 && out === 0, `falls off with distance: ${near.toFixed(3)} m close, ${far.toFixed(3)} far, 0 past its radius`);
  ok(near <= 0.06 * 1.6, `stays small (${near.toFixed(3)} m at its strongest)`);
  for (let i = 0; i < 30; i++) fx.update(1 / 30);
  ok(fx.shakeOffset(new THREE.Vector3(0, 1.6, 2)).length() === 0, "and stops when it's done");
}

console.log("-- the lights never change in number");
{
  const { fx, scene } = await make(["explosion-hd", "flame-a", "smoke-wisp-a"]);
  const before = lightCount(scene);
  ok(before === POOL.length, `the pool's ${POOL.length} lights are in the scene from load`);
  for (let i = 0; i < 12; i++) fx.play(effects.sparks, { pos: new THREE.Vector3(i, 1, 0), normal: new THREE.Vector3(0, 0, 1) }, i);
  fx.play(effects.explosion, { pos: new THREE.Vector3(0, 0, 0) }, 3);
  const fires = [1, 2, 3].map((s) => fx.emit(effects.fire({ pos: new THREE.Vector3(s, 0, 0), duration: 2 }), s));
  let max = 0;
  for (let i = 0; i < 90; i++) {
    fx.update(1 / 30);
    max = Math.max(max, lightCount(scene));
  }
  ok(max === before, `twelve sparks, a blast and three fires later: still ${max} lights`);
  ok(fx.lights.busy <= POOL.length, `busy lights never more than the pool (${fx.lights.busy})`);
  for (let i = 0; i < 120; i++) fx.update(1 / 30);
  ok(fx.lights.busy === 0, "and every light is handed back once the fires are out");
  void fires;
}

console.log("-- a fire is never robbed of its light by a flash");
{
  const { fx } = await make(["flame-a", "smoke-wisp-a"]);
  const a = fx.holdLight("fire"), b = fx.holdLight("fire");
  ok(a && b, "two fires each hold a light");
  // a third fire takes the spare; a fourth gets none rather than stealing
  const c = fx.holdLight("fire"), d = fx.holdLight("fire");
  ok(c && !d, "a third takes the spare, a fourth goes without");
  for (let i = 0; i < 5; i++) fx.flash("muzzle", new THREE.Vector3(), 3, 0.2, 0xffffff);
  a.set(new THREE.Vector3(), 4);
  const held = fx.lights.group.children.filter((l) => l.intensity === 4).length;
  ok(held === 1, "after a burst of muzzle flashes the first fire still owns its light");
}

console.log("-- decals: fixed slots, oldest out");
{
  const { fx } = await make([]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4, 16, 8), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2, -3);
  wall.updateMatrixWorld();
  const set = fx.addDecalSet("test", { map: blank(), cols: 2, rows: 2 }, 10);
  const verts0 = set.mesh.geometry.getAttribute("position").count;
  const slots = [];
  for (let i = 0; i < 14; i++) slots.push(fx.decal("test", { target: wall, pos: new THREE.Vector3(-3 + i * 0.4, 2, -3), normal: new THREE.Vector3(0, 0, 1), size: 0.3, cell: i % 4 }));
  ok(slots.every((s) => s >= 0), "every mark lands on the wall");
  ok(set.live === 10, `ten slots hold ten marks after fourteen were laid (${set.live})`);
  ok(slots[10] === 0 && slots[13] === 3, "the eleventh mark took the oldest slot");
  ok(set.mesh.geometry.getAttribute("position").count === verts0, "and the buffer never grew");
  ok(fx.decal("test", { target: wall, pos: new THREE.Vector3(0, 2, 5), normal: new THREE.Vector3(0, 0, 1), size: 0.3, cell: 0 }) === -1, "a mark that would land nowhere is refused, not drawn in the air");
  const short = fx.addDecalSet("short", { map: blank(), cols: 1, rows: 1 }, 4);
  fx.decal("short", { target: wall, pos: new THREE.Vector3(0, 2, -3), normal: new THREE.Vector3(0, 0, 1), size: 0.3, cell: 0, life: 1, fade: 0.5 });
  for (let i = 0; i < 40; i++) fx.update(1 / 30);
  ok(short.live === 0, "a mark with a life fades and frees its slot");
}

console.log("-- warm-up leaves the scene as it found it");
{
  const { fx } = await make(["flame-a"]);
  const vis = () => [...fx.layers.values()].map((l) => l.mesh.visible).join();
  const before = vis();
  let sawVisible = false;
  fx.opts.renderer.compileAsync = async () => {
    sawVisible = [...fx.layers.values()].every((l) => l.mesh.visible);
  };
  await fx.warm();
  ok(sawVisible, "every layer is shown to the compiler");
  ok(vis() === before, "and hidden again afterwards");
}

console.log("-- the guns (F1)");
{
  // the muzzle points are copies of guns.json (the animation work owns it): a moved muzzle
  // must turn this red, not leave the flash hanging in the air
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "props", "guns", "guns.json"), "utf8"));
  for (const id of Object.keys(GUN_FX)) {
    ok(gj[id] && gj[id].muzzle.every((v, i) => Math.abs(v - GUN_FX[id].muzzle[i]) < 1e-6), `${id}: the flash sits on guns.json's muzzle (${gj[id]?.muzzle})`);
  }
  ok(Object.keys(gj).every((id) => GUN_FX[id]), "every gun in guns.json has a shot");
  const gunAt = (x) => new THREE.Matrix4().compose(new THREE.Vector3(x, 1.25, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
  const sheetsGun = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c", "smoke-candle", "fireball-a", "fireball-b"];
  const a = await make(sheetsGun), b = await make(sheetsGun), c = await make(sheetsGun);
  for (const { fx } of [a, b, c]) {
    fx.surfaces.length = 0;
    for (let i = 0; i < 8; i++) fx.play(effects.gunShot, { gun: "hk416", matrix: gunAt(0), floorY: 0 }, (fx === c.fx ? 500 : 400) + i);
  }
  for (let i = 0; i < 60; i++) for (const { fx } of [a, b, c]) fx.update(1 / 30);
  ok(a.fx.casings.snapshot() === b.fx.casings.snapshot() && a.fx.casings.live === 8, "the same shots and seeds leave the same brass in the same places (8 cases)");
  ok(buffers(a.fx) === buffers(b.fx), "and the same smoke, card for card");
  ok(a.fx.casings.snapshot() !== c.fx.casings.snapshot(), "different seeds scatter it differently");
  for (let i = 0; i < 90; i++) a.fx.update(1 / 30);
  const ys = a.fx.casings.snapshot().split("|").map((r) => Number(r.split(":")[1].split(",")[1]));
  ok(ys.every((y) => y >= 0.004 && y < 0.03), `every case comes to rest ON the floor, none under it (heights ${Math.min(...ys).toFixed(4)}–${Math.max(...ys).toFixed(4)} m)`);
  // the pump gun's shell comes out on the pump, not the shot
  const d = await make(sheetsGun);
  d.fx.play(effects.gunShot, { gun: "shotgun", matrix: gunAt(0), floorY: 0 }, 1);
  d.fx.update(1 / 30);
  ok(d.fx.casings.live === 0, "a shotgun shot throws no shell");
  d.fx.play(effects.ejectCasing, { gun: "shotgun", matrix: gunAt(0), floorY: 0 }, 2);
  d.fx.update(1 / 30);
  ok(d.fx.casings.live === 1, "its pump does");
  // fixed slots: a long fight never grows the brass
  const e = await make([]);
  const mesh = e.fx.casings.meshes.get("rifle");
  const before = mesh.instanceMatrix.array.length;
  for (let i = 0; i < 300; i++) e.fx.play(effects.ejectCasing, { gun: "hk416", matrix: gunAt(0), floorY: 0 }, i);
  e.fx.update(1 / 30);
  ok(e.fx.casings.live === e.fx.casings.perKind && mesh.instanceMatrix.array.length === before, `300 cases leave ${e.fx.casings.live} on the floor (the slots), the buffer never grows`);
  // the light count stays put through a burst
  const n0 = lightCount(e.scene);
  for (let i = 0; i < 30; i++) e.fx.play(effects.muzzleFlash, { gun: "hk416", matrix: gunAt(i * 0.1) }, i);
  let maxL = 0;
  for (let i = 0; i < 20; i++) { e.fx.update(1 / 30); maxL = Math.max(maxL, lightCount(e.scene)); }
  ok(maxL === n0, `a thirty-round burst keeps the scene at ${n0} lights`);
}

console.log("-- a round on each surface");
{
  const { fx } = await make(["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4, 16, 8), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2, -3);
  wall.updateMatrixWorld();
  fx.surfaces.length = 0;
  fx.surfaces.push(wall);
  const holes = fx.addDecalSet("holes", { map: blank(), cols: 2, rows: 2 }, 50, 48);
  fx.addDecalSet("blood", { map: blank(), cols: 2, rows: 2 }, 50);
  const kinds = ["concrete", "metal", "wood", "glass", "flesh"];
  const made = {};
  for (const [i, surface] of kinds.entries()) {
    const before = [...fx.layers.values()].reduce((n, l) => n + l.live, 0), marks = holes.live;
    fx.play(effects.bulletImpact, { surface, pos: new THREE.Vector3(-2 + i, 1.5, -3), normal: new THREE.Vector3(0, 0, 1), dir: new THREE.Vector3(0, 0, -1), floorY: 0 }, 70 + i);
    fx.update(1 / 30);
    made[surface] = { cards: [...fx.layers.values()].reduce((n, l) => n + l.live, 0) - before, hole: holes.live - marks };
  }
  ok(kinds.every((k) => made[k].cards > 0), `every surface throws something back (${kinds.map((k) => `${k} ${made[k].cards}`).join(", ")})`);
  ok(["concrete", "metal", "wood", "glass"].every((k) => made[k].hole === 1), "concrete, metal, wood and glass each take one hole");
  ok(made.flesh.hole === 0, "a body never takes a bullet hole (the wounds are the body work's)");
}

console.log("-- the baked bullet holes");
{
  const { holeCell } = M;
  const sharp = require(path.join(ROOT, "node_modules", "sharp"));
  const dir = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "holes");
  const man = JSON.parse(fs.readFileSync(path.join(dir, "holes.json"), "utf8"));
  const { data, info } = await sharp(path.join(dir, man.color.png)).raw().toBuffer({ resolveWithObject: true });
  const cw = info.width / man.cols, chh = info.height / man.rows;
  const report = [];
  let clear = true, marked = true, darkMiddle = true;
  for (let r = 0; r < man.rows; r++) for (let c = 0; c < man.cols; c++) {
    let border = 0, inside = 0;
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const a = data[((r * chh + y) * info.width + c * cw + x) * 4 + 3];
      const e = Math.min(x, y, cw - 1 - x, chh - 1 - y) / cw;
      if (e < 0.04) border = Math.max(border, a);
      else if (a > 128) inside++;
    }
    if (border > 0) clear = false;
    if (inside < cw * chh * 0.005) marked = false;
    // the middle of a concrete, steel or wood hole is dark: it goes into the wall
    if (c < 3) {
      const o = ((r * chh + chh / 2) * info.width + c * cw + cw / 2) * 4;
      if (data[o] + data[o + 1] + data[o + 2] > 120 || data[o + 3] < 200) darkMiddle = false;
    }
    report.push(`${man.kinds[c]}${r}: ${(inside / (cw * chh) * 100).toFixed(1)}%`);
  }
  ok(clear, "every baked hole fades to nothing before its cell's edge, so a projected hole never shows its square");
  ok(marked, `and every cell has its hole in it (${report.join(", ")})`);
  ok(darkMiddle, "a hole in concrete, steel or wood is dark at its middle, where it goes in");
  const fake = { holes: { variants: 2 } };
  const r = mulberry32(3);
  const got = {};
  for (const kind of ["concrete", "metal", "wood", "glass"]) {
    got[kind] = new Set(Array.from({ length: 40 }, () => holeCell(fake, kind, r)));
  }
  ok(["concrete", "metal", "wood", "glass"].every((k, i) => [...got[k]].every((c) => c % 4 === i) && got[k].size === 2), "each surface takes its own kind of hole, and both of its variants turn up");
  ok([...got.glass].every((c) => holeCell({ holes: null }, "glass", () => 0.99) === 3), "without the baked holes, F1's code-drawn cell is used");
}

console.log("-- dismemberment (on a synthetic arm, the zombies' bone names)");
{
  // an arm along +x: shoulder joint at 0, elbow at 0.3, wrist at 0.55, skinned by distance
  const makeArm = () => {
    const geo = new THREE.CylinderGeometry(0.05, 0.04, 0.6, 12, 24).rotateZ(-Math.PI / 2).translate(0.3, 0, 0);
    const pos = geo.getAttribute("position");
    const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      si[i * 4] = x < 0.3 ? 1 : x < 0.55 ? 2 : 3;
      sw[i * 4] = 1;
    }
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    const root = new THREE.Bone(); root.name = "spine_03.x";
    const arm = new THREE.Bone(); arm.name = "arm_stretch.l";
    const fore = new THREE.Bone(); fore.name = "forearm_stretch.l"; fore.position.x = 0.3;
    const hand = new THREE.Bone(); hand.name = "hand.l"; hand.position.x = 0.25;
    root.add(arm); arm.add(fore); fore.add(hand);
    const mat = new THREE.MeshStandardMaterial({ name: "ZP_Test_BODY" });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    const group = new THREE.Group();
    group.add(root, mesh);
    group.position.set(0, 1.4, 0);
    group.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([root, arm, fore, hand]), mesh.matrixWorld);
    return { group, mesh, bones: { root, arm, fore, hand } };
  };
  // (a group with the mesh in it, as the real gore kit's caps are: a mesh-only stand-in hid a
  // restart losing every limb's cap)
  const capMesh = () => new THREE.Group().add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 8), new THREE.MeshBasicMaterial()));
  const kit = { bytes: 0, caps: new Map(["upperarm", "forearm", "neck", "thigh", "shin"].flatMap((c) => [[`${c}:stump`, capMesh()], [`${c}:piece`, capMesh()]])), gibs: new Map([["meat-a", capMesh()]]) };
  const setup = async () => {
    const { fx, scene } = await make([]);
    fx.surfaces.length = 0;
    const a = makeArm();
    scene.add(a.group);
    a.group.updateMatrixWorld(true);
    return { fx, a, cut: new Cuttable(fx, kit, a.group) };
  };
  const one = await setup();
  const d = one.a.mesh.geometry.getAttribute("aCutA");
  const pos = one.a.mesh.geometry.getAttribute("position");
  let right = 0, wrong = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), du = d.getComponent(i, 1);
    if (x > 0.16 && du > 0) right++;
    else if (x < 0.14 && du > 0) wrong++;
  }
  ok(right > 0 && wrong === 0, `the upper-arm cut lies halfway to the elbow: ${right} vertices past it, none short of it`);
  ok(one.a.mesh.material.customProgramCacheKey() === "fx-cut-look-v2", "the zombie's materials are its own cuttable copies, on one shared program (the cut and its look together)");
  {
    const u = one.a.mesh.material.userData.cut;
    const all = [...u.uCutA.value.toArray(), ...u.uCutB.value.toArray(), u.uCutC.value];
    ok(all.every((x) => x === 0), `a zombie starts whole: every cut switched off (${all.join(",")}) — a bare Vector4 is (0,0,0,1), which cut off every zombie's left hand and left foot`);
  }
  ok(one.cut.sever({ site: "upperarm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 11), "the arm comes off at the upper arm");
  ok(one.a.mesh.material.userData.cut.uCutA.value.y === 1, "and the body now drops everything past that cut");
  ok(!one.cut.canCut("forearm.l") && !one.cut.sever({ site: "forearm.l", dir: new THREE.Vector3(0, 0, 1) }, 12), "the forearm went with it: it can't be cut again");
  ok(!one.cut.sever({ site: "upperarm.l", dir: new THREE.Vector3(0, 0, 1) }, 13), "nor can the same cut be made twice");
  ok(one.a.bones.arm.children.some((c) => c.name === "fx-stump:upperarm.l"), "the stump rides the upper-arm bone");
  ok(one.fx.rigid.live >= 2, `the piece and its meat are loose (${one.fx.rigid.live} pieces)`);
  // THE ZOMBIES' LOOK (zlook.ts): drawn in the cut's own patch from a few numbers a zombie
  {
    const two = await setup(), three = await setup(), other = await setup();
    const va = two.cut.look.variety(77, "outside"), vb = three.cut.look.variety(77, "outside");
    const lookOf = (c) => [c.look.u.uZLook.value.toArray(), c.look.u.uZShift.value.toArray(), c.look.u.uZCloth.value.toArray()].flat().map((x) => x.toFixed(5)).join(",");
    ok(lookOf(two.cut) === lookOf(three.cut) && va.scale === vb.scale, "a zombie copy's look (skin, clothes, grime, old blood) and size come from its seed: every observer sees the same copy");
    other.cut.look.variety(78, "experiment");
    ok(lookOf(other.cut) !== lookOf(two.cut) && other.cut.look.u.uZLook.value.x === 1 && two.cut.look.u.uZLook.value.x === 0, "another seed is another copy; an experiment carries the G-Strain, an outside zombie doesn't");
    ok(Math.abs(va.scale - 1) <= 0.05, `and stands within 5% of the model's size (${va.scale.toFixed(3)})`);
    // a wound where it was hit, on the body's own rest-pose position
    const slot = two.cut.look.wound("bullet", new THREE.Vector3(0.45, 1.46, 0), 5);
    const w = two.cut.look.u.uZW.value[slot];
    ok(slot === 0 && Math.abs(w.x - 0.45) < 0.05 && Math.abs(w.y - 1.45) < 0.06 && w.w > 0.04, `a bullet lands where it hit, on the forearm, in the body's own frame (${w.toArray().map((x) => x.toFixed(3)).join(", ")})`);
    for (let i = 0; i < 12; i++) two.cut.look.wound("blunt", new THREE.Vector3(0.1 + i * 0.03, 1.46, 0), 10 + i);
    ok(two.cut.look.wounds === 12 && two.cut.look.u.uZWB.value[0].w === 1, "twelve wounds at a time; the thirteenth takes the oldest's place");
    // a piece cut off keeps its wounds and colour: it shares the body's numbers, and knows where
    // on the body each of its vertices was
    two.cut.sever({ site: "forearm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 21);
    let piece = null;
    two.fx.rigid.group.traverse((o) => { if (!piece && o.isMesh && o.parent?.name?.startsWith("fx-piece")) piece = o; });
    ok(!!piece && !!piece.geometry.getAttribute("aZBind") && piece.material.customProgramCacheKey() === "fx-cut-look-v2", "a severed piece wears the same look, knowing where on the body each of its vertices was");
  }
  // the same cut and seed, twice: the same arm lands in the same place
  const two = await setup(), three = await setup();
  two.cut.sever({ site: "upperarm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 11);
  three.cut.sever({ site: "upperarm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 99);
  for (let i = 0; i < 150; i++) for (const x of [one, two, three]) x.fx.update(1 / 30);
  ok(one.fx.rigid.snapshot() === two.fx.rigid.snapshot(), "the same cut and seed: the same arm in the same place on every screen");
  ok(one.fx.rigid.snapshot() !== three.fx.rigid.snapshot(), "a different seed throws it differently");
  const ys = one.fx.rigid.snapshot().split("|").map((r) => Number(r.split(":")[0].split(",")[1]));
  ok(ys.every((y) => y > 0 && y < 0.3), `everything comes to rest on the floor, none under it (centres ${Math.min(...ys).toFixed(3)}–${Math.max(...ys).toFixed(3)} m)`);
  // the piece holds exactly the severed part
  const piece = one.fx.rigid.group.children.find((c) => c.name === "fx-piece:upperarm.l");
  const pg = piece?.children[0]?.geometry;
  const pd = pg?.getAttribute("aCutA");
  let bad = 0;
  if (pg) for (let t = 0; t < pg.index.count / 3; t++) if ([0, 1, 2].every((k) => pd.getComponent(pg.index.getX(t * 3 + k), 1) <= 0)) bad++;
  ok(pg && pg.index.count > 0 && bad === 0, `the piece is lifted from the cut outward: ${pg ? pg.index.count / 3 : 0} triangles, none wholly on the body's side`);
  ok(piece?.children[0]?.material.userData.cut.uCutA.value.y === -1, "and draws only the far side of the cut");
  // LIMBS AND MEAT LAST (Josh: severed limbs persist the show), and outlive the renderer
  {
    const { FxLedger } = M;
    const keepFx = async () => {
      const { fx, scene } = await make([]);
      fx.surfaces.length = 0;
      fx.gore = kit;
      fx.roomAt = () => "morgue";
      return { fx, scene };
    };
    const first = await keepFx();
    const arm = makeArm();
    first.scene.add(arm.group);
    arm.group.updateMatrixWorld(true);
    const cut = new Cuttable(first.fx, kit, arm.group);
    cut.ref = { id: "zombie-17", model: "arm" };
    cut.look.variety(4242, "experiment");
    cut.look.wound("slash", new THREE.Vector3(0.5, 1.4, 0.05), 31, new THREE.Vector3(1, 0, 0));
    const rows = [];
    const led = new FxLedger(first.fx, { origin: () => new THREE.Vector3(10, 0, 10), model: () => makeArm().group });
    led.onRow = (r) => rows.push(r);
    cut.sever({ site: "forearm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 41);
    for (let i = 0; i < 30 * 12; i++) first.fx.update(1 / 30);
    const limbRows = rows.filter((r) => r.k === "l"), gibRows = rows.filter((r) => r.k === "g");
    ok(first.fx.rigid.live === 0 && first.fx.rigid.heldCount("morgue") === 1 && limbRows.length === 1 && gibRows.length >= 1,
      `a severed limb lies where it came to rest and stays (held as it is: it wears its zombie's look), its meat merged with the room's; each written down once (${limbRows.length} limb, ${gibRows.length} chunks)`);
    for (let i = 0; i < 30 * 300; i++) first.fx.update(1 / 30);
    ok(first.fx.rigid.heldCount() === 1 && first.fx.rigid.kept.tris("morgue") > 0, "five minutes on, still there: nothing sinks away");
    ok(JSON.stringify(limbRows[0]).length < 20000, `a limb's row carries its shape as it was at the cut, compressed (${Math.round(JSON.stringify(limbRows[0]).length / 1024)} KB)`);
    // a fresh renderer: the rows, and a fresh copy of the model to cut it from
    const second = await keepFx();
    const back = new FxLedger(second.fx, { origin: () => new THREE.Vector3(10, 0, 10), model: () => makeArm().group });
    const res = await back.restore(rows);
    const world = (fx) => {
      const out = [];
      fx.rigid.keptGroup.updateMatrixWorld(true);
      fx.rigid.keptGroup.traverse((o) => {
        if (!o.isMesh || o.userData.fxCap) return;
        const P = o.geometry.getAttribute("position");
        const v = new THREE.Vector3();
        for (let k = 0; k < P.count; k++) out.push(v.fromBufferAttribute(P, k).applyMatrix4(o.matrixWorld).clone());
      });
      return out;
    };
    const wa = world(first.fx), wb = world(second.fx);
    let worst = 0;
    for (const p of wb) worst = Math.max(worst, Math.min(...wa.map((q) => p.distanceTo(q))));
    ok(res.limbs === 1 && res.gibs === gibRows.length && wa.length === wb.length && worst < 0.002,
      `a restart cuts the limb again from a fresh copy and lays it where it lay (${wb.length}/${wa.length} vertices, the furthest ${(worst * 1000).toFixed(2)} mm off), its meat merged back (${res.gibs} chunks)`);
    let capOn = false;
    second.fx.rigid.keptGroup.traverse((o) => { if (o.userData.fxCap) capOn = true; });
    ok(capOn && JSON.stringify(limbRows[0].look) === JSON.stringify(cut.look.state) && limbRows[0].look.look[0] === 1,
      "wearing the same look (the G-Strain, its wounds included), and its cap on the cut face");
    ok(second.fx.stats().particles === 0 && second.fx.stats().emitters === 0, "quietly: no blood thrown, nothing bleeding");
  }
  // A ZOMBIE AS THE WORLD KEEPS IT: its look and its cuts, back on a fresh copy, quietly
  {
    const z = await setup();
    z.cut.look.variety(5150, "experiment");
    z.cut.look.wound("slash", new THREE.Vector3(0.5, 1.4, 0.05), 32, new THREE.Vector3(1, 0, 0));
    z.cut.sever({ site: "forearm.l", dir: new THREE.Vector3(0, 0, 1), force: 0.6, floorY: 0 }, 51);
    const st = JSON.parse(JSON.stringify(z.cut.state));
    ok(st.cuts.length === 1 && st.cuts[0].cap && st.cuts[0].m.length === 16 && JSON.stringify(st).length < 4000,
      `a zombie's state is its look and each cut with its stump's place on the bone (${JSON.stringify(st).length} bytes)`);
    const y = await setup();
    y.cut.restore(st);
    const stumpOf = (g) => { let f = null; g.traverse((o) => { if (o.name === "fx-stump:forearm.l") f = o; }); return f; };
    const sa = stumpOf(z.a.group), sb = stumpOf(y.a.group);
    sa?.updateMatrixWorld(true); sb?.updateMatrixWorld(true);
    const pa = sa ? new THREE.Vector3().setFromMatrixPosition(sa.matrixWorld) : null, pb = sb ? new THREE.Vector3().setFromMatrixPosition(sb.matrixWorld) : null;
    ok(!!pa && !!pb && pa.distanceTo(pb) < 1e-4 && sb.parent === y.a.mesh.skeleton.bones[sa.parent ? z.a.mesh.skeleton.bones.indexOf(sa.parent) : -1],
      `a restart puts the stump back on the same bone, in the same place (${pa && pb ? (pa.distanceTo(pb) * 1000).toFixed(3) : "?"} mm)`);
    const modes = (c) => c.uniforms.map((u) => JSON.stringify(u));
    ok([...y.cut.cut].join() === [...z.cut.cut].join() && modes(y.cut).join() === modes(z.cut).join() && !y.cut.canCut("forearm.l"),
      "the forearm gone from the body as it was (the same cut in every material), and it can't be cut twice");
    ok(JSON.stringify(y.cut.look.state) === JSON.stringify(z.cut.look.state), "wearing the same look: the G-Strain, its blood, the slash");
    ok(y.fx.stats().particles === 0 && y.fx.stats().emitters === 0 && y.fx.rigid.live === 0, "quietly: no blood thrown, no stump bleeding, no arm flying off again");
    y.cut.restore(st);
    let stumps = 0;
    y.a.group.traverse((o) => { if (o.name === "fx-stump:forearm.l") stumps++; });
    ok(stumps === 1 && JSON.stringify(y.cut.state) === JSON.stringify(st), "restored twice, still one stump: the state round-trips");
  }
}

console.log("-- blood (F2)");
{
  const room = async () => {
    const { fx } = await make([]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 20, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4, 20, 8).translate(0, 2, -4), new THREE.MeshBasicMaterial());
    for (const m of [floor, wall]) m.updateMatrixWorld();
    fx.surfaces.length = 0;
    fx.surfaces.push(floor, wall);
    fx.addDecalSet("blood", { map: blank(), cols: 4, rows: 4 }, 200, 48, { wet: true });
    fx.addDecalSet("pools", { map: blank(), spreadMap: blank(), cols: 4, rows: 4 }, 40, 160, { wet: true });
    fx.blood = {
      splat: { burst: [0, 1, 2], spray: [3, 4, 5, 6, 7], drop: [8, 9, 10, 11] }, pools: { pool: [0, 1, 2], smear: [8, 9], footprints: [13], handprints: [15], handsmear: [14] },
      feet: [{ cell: 13, rect: [0.36, 0.09, 0.52, 0.33], side: "l" }, { cell: 13, rect: [0.52, 0.17, 0.7, 0.41], side: "r" }],
      hands: [{ cell: 15, rect: [0.06, 0.24, 0.46, 0.71], side: "l" }], bytes: 0,
    };
    return { fx, floor, wall };
  };
  const snap = (fx) => [...fx.decalSets.values()].map((d) => Array.from(d.mesh.geometry.getAttribute("position").array).filter((x, i) => i % 97 === 0).map((x) => x.toFixed(4)).join()).join("|")
    + [...fx.layers.values()].map((l) => l.live).join();
  const hit = async (seed, kind) => {
    const { fx } = await room();
    fx.play(effects.bloodHit, { pos: new THREE.Vector3(0, 1.4, -2.5), dir: new THREE.Vector3(0.2, 0, -1), floorY: 0, amount: 0.8, kind }, seed);
    for (let i = 0; i < 60; i++) fx.update(1 / 30);
    return fx;
  };
  const a = await hit(5), b = await hit(5);
  ok(snap(a) === snap(b), "the same hit with the same seed lands the same blood in the same places");
  ok(a.decalSets.get("blood").live > 1, `a hit near a wall leaves spatter on it and drops on the floor (${a.decalSets.get("blood").live} marks)`);
  ok(BLOOD.zombie.drop[0] < BLOOD.human.drop[0] / 2 && BLOOD.zombie.thick > BLOOD.human.thick && BLOOD.zombie.reach < BLOOD.human.reach, "zombie blood is darker, thicker and doesn't fly as far");
  // the spray's direction: a decal's +x (or +y) turned along the surface toward where it was going
  const rng = mulberry32(3);
  let worst = 1;
  for (let i = 0; i < 200; i++) {
    const n = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const along = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const t = along.clone().addScaledVector(n, -along.dot(n)).normalize();
    for (const axis of ["x", "y"]) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spinAlong(n, along, axis)));
      worst = Math.min(worst, new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, 0).applyQuaternion(q).dot(t));
    }
  }
  ok(worst > 0.9999, `a spray's tail and a print's toe point the way it was going, on any surface (worst ${worst.toFixed(6)})`);
  // a cut-out print's UVs stay inside its rect, in either texture layout
  for (const topDown of [false, true]) {
    const { fx, floor } = await room();
    const set = fx.addDecalSet("uvtest", { map: blank(), cols: 2, rows: 2, topDown }, 2);
    const slot = fx.decal("uvtest", { target: floor, pos: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 1, 0), size: 0.4, cell: 3, rect: [0.25, 0.5, 0.75, 1] });
    const uv = set.mesh.geometry.getAttribute("uv");
    const per = set.trisPerSlot * 3;
    let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
    for (let v = slot * per; v < slot * per + per; v++) {
      if (set.mesh.geometry.getAttribute("color").getW(v) === 0) continue;
      u0 = Math.min(u0, uv.getX(v)); u1 = Math.max(u1, uv.getX(v)); v0 = Math.min(v0, uv.getY(v)); v1 = Math.max(v1, uv.getY(v));
    }
    const want = topDown ? [0.625, 0.875, 0.75, 1] : [0.625, 0.875, 0, 0.25];
    const close = [u0, u1, v0, v1].every((x, i) => Math.abs(x - want[i]) < 0.01);
    ok(close, `${topDown ? "a compressed (top-down)" : "a PNG"} atlas: one print's UVs cover its rect and nothing else (${[u0, u1, v0, v1].map((x) => x.toFixed(3))})`);
  }
  {
    const { fx } = await room();
    fx.play(effects.bloodPool, { pos: new THREE.Vector3(0.3, 0, 0.2), size: 1.2, grow: 8 }, 9);
    const pools = fx.decalSets.get("pools");
    const life = pools.mesh.geometry.getAttribute("aLife");
    ok(pools.live === 1 && life && life.getW(0) > 8 * 0.99, `a pool is laid once and spreads on the GPU over its own time (${life?.getW(0)} s), never re-laid`);
    ok(life.getY(0) > 0 && life.getX(0) === fx.now, "and it carries when it was laid and how long it takes to dry");
  }
  {
    const { fx } = await room();
    fx.play(effects.bloodTrail, { from: new THREE.Vector3(-2, 0, 1), to: new THREE.Vector3(2, 0, 1), width: 0.5 }, 11);
    const pools = fx.decalSets.get("pools");
    const pos = pools.mesh.geometry.getAttribute("position");
    let minX = 9, maxX = -9, maxZ = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) !== 0 || pos.getX(i) !== 0) { minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i)); maxZ = Math.max(maxZ, Math.abs(pos.getZ(i) - 1)); }
    ok(pools.live >= 6 && minX < -1.8 && maxX > 1.8 && maxZ < 0.5, `a drag trail runs the length of the drag and no wider than the body (${pools.live} smears, x ${minX.toFixed(2)}..${maxX.toFixed(2)}, ±${maxZ.toFixed(2)})`);
  }
  {
    const { fx } = await room();
    fx.play(effects.bloodyFootprint, { pos: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 0, 0), foot: "l", length: 0.3 }, 12);
    const pos = fx.decalSets.get("pools").mesh.geometry.getAttribute("position");
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) !== 0 || pos.getZ(i) !== 0) { x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i)); }
    ok(x1 - x0 > 1.2 * (z1 - z0) && Math.abs(x1 - x0 - 0.3) < 0.02, `a footprint is a foot long and lies along the way the foot points (${(x1 - x0).toFixed(3)} x ${(z1 - z0).toFixed(3)} m)`);
  }
  {
    const { fx } = await room();
    let alive = true;
    fx.emit(effects.woundDrips({ from: () => (alive ? new THREE.Vector3(0, 1, 0) : null), secs: 30, rate: 5, floorY: 0 }), 13);
    for (let i = 0; i < 30; i++) fx.update(1 / 30);
    const dripping = fx.stats().emitters;
    alive = false;
    fx.update(1 / 30);
    ok(dripping === 1 && fx.stats().emitters === 0, "a wound drips while it is there and stops the moment it is gone");
  }
  {
    const { fx } = await room();
    const set = fx.decalSets.get("blood");
    fx.play(effects.bloodHit, { pos: new THREE.Vector3(0, 1.4, -2.5), dir: new THREE.Vector3(0, 0, -1), amount: 1 }, 14);
    set.clear();
    fx.decal("blood", { target: fx.surfaces[1], pos: new THREE.Vector3(0, 1.5, -4), normal: new THREE.Vector3(0, 0, 1), size: 0.3, cell: 0 });
    const pos = set.mesh.geometry.getAttribute("position");
    ok(pos.updateRanges.some((r) => r.start === 0 && r.count === pos.array.length), "clearing a set uploads the whole buffer even when a mark goes down straight after (it did not: old marks stayed on screen)");
  }
}

console.log("-- blood running down walls; a big mark keeps its middle");
{
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bloodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood", "blood.json"), "utf8"));
  const runsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood", "runs.json"), "utf8"));
  const scene = new THREE.Scene();
  const fx = new FxSystem({ scene, camera: new THREE.PerspectiveCamera(), renderer, sheets: ["smoke-wisp-a"], spriteTexture: blank(),
    load: { texture: async () => blank(), json: async (p) => (p.includes("runs") ? runsJson : p.includes("blood/") ? bloodJson : sheets) } });
  await fx.load();
  await fx.loadBlood();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3, 24, 12));
  wall.position.set(0, 1.5, -1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 24, 24));
  floor.rotation.x = -Math.PI / 2;
  scene.add(wall, floor);
  scene.updateMatrixWorld(true);
  fx.surfaces.push(wall, floor);
  const runs = fx.decalSets.get("runs");
  ok(!!runs && fx.blood.runs.length === 4, "the runs load as their own wet decal set, four of them");
  // heavy hits a short way from the wall, survivor and zombie
  const centres = (set) => {
    const P = set.geo.getAttribute("position").array, out = [];
    for (let i = 0; i < set.capacity; i++) {
      let lo = Infinity, hi = -Infinity, any = false;
      for (let v = 0; v < set.trisPerSlot * 3; v++) {
        const k = (i * set.trisPerSlot * 3 + v) * 3;
        if (P[k] === 0 && P[k + 1] === 0 && P[k + 2] === 0) continue;
        any = true; lo = Math.min(lo, P[k + 1]); hi = Math.max(hi, P[k + 1]);
      }
      if (any) out.push({ lo, hi });
    }
    return out;
  };
  let made = 0;
  for (let i = 0; i < 12 && made < 3; i++) {
    const before = runs.live;
    fx.play(effects.bloodHit, { pos: V(-1.5 + i * 0.25, 1.5, -0.6), dir: V(0, 0, -1), floorY: 0, amount: 1, kind: i % 2 ? "zombie" : "human" }, 900 + i);
    if (runs.live > before) made++;
  }
  const spans = centres(runs);
  ok(made > 0 && spans.every((s) => s.hi <= 1.5 + 0.12 && s.lo < 1.2), `heavy blood near a wall runs down it from where it hit (${spans.map((s) => `${s.hi.toFixed(2)}→${s.lo.toFixed(2)} m`).join(", ")})`);
  const floorRuns = runs.live;
  for (let i = 0; i < 10; i++) fx.play(effects.bloodHit, { pos: V(0, 0.6, 1), dir: V(0, -1, 0.1), floorY: 0, amount: 1 }, 950 + i);
  ok(runs.live === floorRuns, "but never on a floor: blood doesn't run across one");
  // a zombie's thick blood runs slower: its grow time is longer
  const L = runs.geo.getAttribute("aLife").array;
  const grows = { human: [], zombie: [] };
  for (let i = 0; i < runs.capacity; i++) {
    const g = L[(i * runs.trisPerSlot * 3) * 4 + 3];
    if (g > 0) (g > 9 ? grows.zombie : grows.human).push(g);
  }
  ok(grows.human.length + grows.zombie.length === made && made > 0, `each run crawls down over seconds rather than appearing whole (${[...grows.human, ...grows.zombie].map((g) => g.toFixed(1) + " s").join(", ")})`);
  // a mark bigger than its slot: the triangles it keeps are its middle ones
  const small = fx.addDecalSet("test-small", { map: blank(), cols: 1, rows: 1 }, 4, 24);
  small.add({ target: floor, pos: V(0.3, 0, 0.2), normal: V(0, 1, 0), size: 2, cell: 0, depth: 0.3 }, 0);
  const P = small.geo.getAttribute("position").array;
  let far = 0;
  for (let v = 0; v < 24 * 3; v++) far = Math.max(far, Math.hypot(P[v * 3] - 0.3, P[v * 3 + 2] - 0.2));
  ok(small.truncated === 1 && far < 0.75, `a mark too big for its slot keeps its middle and drops its rim (kept everything within ${far.toFixed(2)} m of a 1 m-radius mark's centre)`);

  // NOTHING LASTING IS LOST: a four-slot set, marks laid on two rooms' walls; the ones pushed
  // out of a live slot go to their room's kept layer, drying clock and all
  {
    const wallA = new THREE.Mesh(new THREE.PlaneGeometry(4, 3, 8, 6)); wallA.position.set(0, 1.5, -1); wallA.userData.room = "a";
    const wallB = new THREE.Mesh(new THREE.PlaneGeometry(4, 3, 8, 6)); wallB.position.set(0, 1.5, -3); wallB.userData.room = "b";
    scene.add(wallA, wallB);
    scene.updateMatrixWorld(true);
    fx.roomOf = (o) => o.userData.room ?? "";
    const keep = fx.addDecalSet("test-keep", { map: blank(), cols: 1, rows: 1 }, 4, 8, { wet: true });
    for (let i = 0; i < 10; i++) keep.add({ target: i % 2 ? wallB : wallA, pos: V(-1.5 + i * 0.3, 1.5, i % 2 ? -3 : -1), normal: V(0, 0, 1), size: 0.2, cell: 0, dry: 100 }, i);
    ok(keep.live + keep.keptCount() === 10 && keep.keptCount("a") === 3 && keep.keptCount("b") === 3, `every lasting mark is still there, live or kept with its own room (${keep.live} live, ${keep.keptCount("a")} kept in a, ${keep.keptCount("b")} in b)`);
    const chunkA = keep.keptRoot.children.find((c) => c.name.endsWith(":a"));
    const KL = chunkA.geometry.getAttribute("aLife").array;
    ok(KL[0] === 0 && KL[1] === 100, "a kept mark keeps its drying clock: it was laid wet and goes on drying where it's kept");
    ok(chunkA.geometry.boundingSphere && chunkA.geometry.boundingSphere.center.z < -0.9 && chunkA.geometry.boundingSphere.radius < 1.5, "its room's kept marks are bounded where they are (culled with the room, not pinned to the origin)");
    ok(keep.removeOn(wallA) >= 3 && keep.keptCount("a") === 0 && keep.keptCount("b") === 3, "a wall that breaks takes its kept marks with it, and only its own");
    fx.roomOf = () => "";
  }
}

console.log("-- melee blood: a scratch, a blade, a blunt blow, a stomp, the cast-off");
{
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bloodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood", "blood.json"), "utf8"));
  const room = async () => {
    const scene = new THREE.Scene();
    const fx = new FxSystem({ scene, camera: new THREE.PerspectiveCamera(), renderer, sheets: ["smoke-wisp-a"], spriteTexture: blank(),
      load: { texture: async () => blank(), json: async (p) => (p.includes("runs") ? { cols: 2, rows: 2, normal: { png: "x" }, spread: { png: "x" } } : p.includes("blood/") ? bloodJson : sheets) } });
    await fx.load();
    await fx.loadBlood();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3, 24, 12));
    wall.position.set(0, 1.5, -1);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 24, 24));
    floor.rotation.x = -Math.PI / 2;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 24, 24));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 2.6;
    scene.add(wall, floor, ceiling);
    scene.updateMatrixWorld(true);
    fx.surfaces.push(wall, floor, ceiling);
    return { fx, wall, floor, ceiling };
  };
  // where each live mark sits, and on what (a mark's verts lie on its target's plane)
  const marks = (fx, set = "blood") => {
    const d = fx.decalSets.get(set), P = d.geo.getAttribute("position").array, out = [];
    for (let i = 0; i < d.capacity; i++) {
      let n = 0, x = 0, y = 0, z = 0;
      for (let v = 0; v < d.trisPerSlot * 3; v++) {
        const k = (i * d.trisPerSlot * 3 + v) * 3;
        if (P[k] === 0 && P[k + 1] === 0 && P[k + 2] === 0) continue;
        x += P[k]; y += P[k + 1]; z += P[k + 2]; n++;
      }
      if (n) out.push(V(x / n, y / n, z / n));
    }
    return out;
  };
  const onWall = (m) => Math.abs(m.z + 1) < 0.02, onCeil = (m) => Math.abs(m.y - 2.6) < 0.02, onFloor = (m) => Math.abs(m.y) < 0.02;
  // the cast-off: a backswing 0.7 m from the wall
  const castRun = async (seed) => {
    const { fx } = await room();
    fx.play(effects.castOff, { from: V(0, 1.5, -0.3), along: V(0.3, 0.35, -1), arc: 0.5, amount: 0.8, floorY: 0 }, seed);
    const atZero = marks(fx).filter(onWall).length;
    for (let i = 0; i < 45; i++) fx.update(1 / 30);
    return { fx, atZero, wall: marks(fx).filter(onWall) };
  };
  const c1 = await castRun(61), c2 = await castRun(61);
  ok(c1.atZero === 0 && c1.wall.length >= 5, `a cast-off lays a line of streaks across the wall, each when its drop gets there, not at the swing (${c1.atZero} at once, ${c1.wall.length} after 1.5 s)`);
  {
    // they lie along a line: the spread across it is small next to the spread along it
    const pts = c1.wall.map((m) => [m.x, m.y]);
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
    ok(Math.sqrt(l2 / Math.max(l1, 1e-9)) < 0.35, `and they lie in a line, as a swing throws them (across it ${(Math.sqrt(l2 / Math.max(l1, 1e-9)) * 100).toFixed(0)}% of along it)`);
  }
  ok(c1.wall.map((m) => m.toArray().map((x) => x.toFixed(4))).join() === c2.wall.map((m) => m.toArray().map((x) => x.toFixed(4))).join(), "the same swing and seed: the same streaks on every screen");
  {
    const { fx } = await room();
    fx.play(effects.castOff, { from: V(0, 1.9, 0.5), along: V(0, 1, 0.2), arc: 0.4, amount: 0.8, floorY: 0 }, 62);
    for (let i = 0; i < 45; i++) fx.update(1 / 30);
    ok(marks(fx).filter(onCeil).length >= 3, `a swing up throws it onto the ceiling (${marks(fx).filter(onCeil).length} streaks)`);
  }
  {
    const { fx } = await room();
    const at = V(0, 0.03, 1);
    fx.play(effects.meleeHit, { pos: at, dir: V(0, -1, 0), weapon: "stomp", amount: 0.9, floorY: 0, kind: "zombie" }, 63);
    for (let i = 0; i < 60; i++) fx.update(1 / 30);
    const fl = marks(fx).filter(onFloor);
    const quad = new Set(fl.filter((m) => m.distanceTo(at) > 0.15).map((m) => (m.x > at.x ? 1 : 0) + (m.z > at.z ? 2 : 0)));
    ok(quad.size >= 3 && fx.decalSets.get("pools").live >= 1, `a stomp throws blood out along the floor all round the boot (${quad.size} of 4 sides) and leaves a pool under it`);
  }
  {
    const { fx } = await room();
    fx.play(effects.meleeHit, { pos: V(0, 1.4, 0), dir: V(0, 0, -1), swing: V(1, 0, 0), weapon: "sharp", amount: 0.8, floorY: 0 }, 64);
    for (let i = 0; i < 60; i++) fx.update(1 / 30);
    const fl2 = marks(fx).filter(onFloor);
    ok(fl2.filter((m) => m.x > 0.25).length > 2 * Math.max(1, fl2.filter((m) => m.x < -0.25).length), `a blade throws its blood on the way it was swinging (${fl2.filter((m) => m.x > 0.25).length} drops ahead of it, ${fl2.filter((m) => m.x < -0.25).length} behind)`);
  }
  {
    // a body dragged: the smear laid the way it went, nothing while it's still, thinning out
    const { fx } = await room();
    const pos = V(-2, 0.05, 1);
    let held = true;
    fx.emit(effects.dragSmear({ from: () => (held ? pos : null), width: 0.4, amount: 1 }), 66);
    for (let i = 0; i < 20; i++) fx.update(1 / 30);
    const still = fx.decalSets.get("pools").live;
    for (let i = 0; i < 90; i++) { pos.x += 4 / 90; fx.update(1 / 30); }
    const laid = marks(fx, "pools").filter(onFloor);
    held = false;
    fx.update(1 / 30);
    ok(still === 0 && laid.length >= 8 && laid.every((m) => Math.abs(m.z - 1) < 0.15 && m.x > -2.1 && m.x < 2.1) && fx.stats().emitters === 0,
      `a body dragged four metres leaves one smear along the way it went (${laid.length} long marks overlapping), nothing while it lay still, and stops when it's let go`);
  }
  {
    const { BodyLook } = M;
    const geo = new THREE.CylinderGeometry(0.15, 0.15, 1.7, 48, 40, true).translate(0, 0.85, 0);
    const n = geo.getAttribute("position").count;
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    const sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) sw[i * 4] = 1;
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) })), root = new THREE.Group();
    root.add(bone, mesh); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([bone]), mesh.matrixWorld);
    const look = new BodyLook(root, new Uint8Array(512 * 512).fill(255));
    look.wound("scratch", V(0, 1.2, 0.15), 65);
    // the open wound (channel 3 at full) in the region round the hit: three separate rakes
    let open = 0;
    for (let i = 0; i < 512 * 512; i++) if (look.data[i * 4 + 3] >= 200) open++;
    ok(open > 20, `a zombie's scratch opens on a survivor where it raked them (${open} texels of open wound)`);
  }
}

console.log("-- fire and explosives (F3)");
{
  const firesheets = ["flame-a", "flame-b", "flame-hollow", "flame-small", "smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c", "explosion-hd", "gas-burst", "dust-impact", "dust-ring"].filter((s) => sheets[s]);
  const room = async () => {
    const { fx, scene } = await make(firesheets);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12, 24, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4, 24, 8).translate(0, 2, -3), new THREE.MeshBasicMaterial());
    for (const m of [floor, wall]) m.updateMatrixWorld();
    fx.surfaces.length = 0;
    fx.surfaces.push(floor, wall);
    fx.addDecalSet("scorch", { map: blank(), cols: 2, rows: 2 }, 48, 96);
    fx.scorch = { blast: [0, 1], fuel: [2, 3] };
    return { fx, scene, floor, wall };
  };
  ok(["gas-burst", "dust-impact", "dust-ring"].every((s) => sheets[s]), "the three JangaFX renders are baked into sheets (gas-burst, dust-impact, dust-ring)");
  const run = async (seed) => {
    const { fx } = await room();
    fx.emit(effects.molotov({ pos: new THREE.Vector3(0, 0.03, 0), dir: new THREE.Vector3(0, 0, -1), floorY: 0, ceilingY: 3.5, radius: 1.2, burn: 6 }), seed);
    const peaks = { particles: 0, held: 0 };
    let snapAt2 = "";
    for (let i = 0; i < 30 * 11; i++) {
      fx.update(1 / 30);
      const st = fx.stats();
      peaks.particles = Math.max(peaks.particles, st.particles);
      peaks.held = Math.max(peaks.held, st.lights);
      if (i === 60) snapAt2 = [...fx.layers.values()].map((l) => l.live).join() + fx.decalSets.get("scorch").live;
    }
    return { fx, peaks, snapAt2 };
  };
  const a = await run(31), b = await run(31);
  ok(a.snapAt2 === b.snapAt2, "the same molotov with the same seed burns the same way");
  ok(a.fx.decalSets.get("scorch").live >= 1, `a molotov leaves a scorch in the shape of its spill (${a.fx.decalSets.get("scorch").live} marks, the satellites too)`);
  ok(a.peaks.held >= 1 && a.fx.stats().lights === 0 && a.fx.stats().emitters === 0, "it holds a fire light while it burns and gives it back when it's out");
  ok(a.peaks.particles < BUDGET.particles / 2, `at its height a molotov uses under half the particle cap (${a.peaks.particles})`);
  {
    const { fx, scene } = await room();
    const lights0 = lightCount(scene);
    fx.play(effects.pipeBomb, { pos: new THREE.Vector3(0, 0.05, -1.2), floorY: 0, ceilingY: 3.5, radius: 3 }, 41);
    fx.update(1 / 30);
    const sc = fx.decalSets.get("scorch").live;
    ok(sc >= 2, `a pipe bomb scorches the floor and the wall it was close to (${sc} marks)`);
    ok(fx.shakeOffset(new THREE.Vector3(0, 1.6, 2)).length() > 0, "and shakes a camera near it");
    ok(lightCount(scene) === lights0, "without adding a light to the scene");
    let falling = 0;
    for (let i = 0; i < 45; i++) { fx.update(1 / 30); falling = Math.max(falling, fx.layer("sprites").live); }
    const { fx: fx2 } = await room();
    fx2.play(effects.pipeBomb, { pos: new THREE.Vector3(0, 0.05, -1.2), floorY: 0, radius: 3 }, 41);
    let falling2 = 0;
    for (let i = 0; i < 46; i++) { fx2.update(1 / 30); falling2 = Math.max(falling2, fx2.layer("sprites").live); }
    ok(falling > falling2 + 25, `dust falls from the ceiling only when there is one (${falling} sprites with, ${falling2} without)`);
  }
  {
    const { fx, scene } = await room();
    const body = new THREE.Group();
    const bone = new THREE.Bone();
    bone.position.y = 1.2;
    body.add(bone);
    scene.add(body);
    body.updateMatrixWorld(true);
    const mine = new THREE.MeshStandardMaterial({ color: 0x806050 }), shared = new THREE.MeshStandardMaterial({ color: 0x806050 });
    fx.emit(effects.catchFire({ target: body, secs: 3, char: [mine] }), 51);
    for (let i = 0; i < 75; i++) fx.update(1 / 30);
    ok(mine.color.r < 0.6 * new THREE.Color(0x806050).r && shared.color.getHex() === 0x806050, "a burning body chars its own materials, and only those");
    ok(fx.layer("flame-a").live + fx.layer("flame-b").live + (fx.has("flame-small") ? fx.layer("flame-small").live : 0) > 0, "flames come off the body where its bones are");
    scene.remove(body);
    fx.update(1 / 30);
    ok(fx.stats().emitters === 0 && fx.stats().lights === 0, "and the fire goes out the moment the body is gone, its light handed back");
  }
}

console.log("-- the ledger: what lasts outlives the renderer");
{
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const { FxLedger } = M;
  const bloodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood", "blood.json"), "utf8"));
  // the same room each time (as the set rebuilds it), its surfaces named
  const room = async () => {
    const scene = new THREE.Scene();
    const fx = new FxSystem({ scene, camera: new THREE.PerspectiveCamera(), renderer, sheets: ["smoke-wisp-a"], spriteTexture: blank(),
      load: { texture: async () => blank(), json: async (p) => (p.includes("runs") ? { cols: 2, rows: 2, normal: { png: "x" }, spread: { png: "x" } } : p.includes("blood/") ? bloodJson : sheets) } });
    await fx.load();
    await fx.loadBlood();
    fx.addDecalSet("scorch", { map: blank(), cols: 2, rows: 2 }, 48, 96);
    fx.scorch = { blast: [0, 1], fuel: [2, 3] };
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4, 20, 8)); wall.position.set(50, 2, 20); wall.userData.fxId = "lab.wall-n"; wall.userData.room = "lab";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 20, 20)); floor.rotation.x = -Math.PI / 2; floor.position.set(50, 0, 25); floor.userData.fxId = "lab.floor"; floor.userData.room = "lab";
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1, 2, 4, 8)); pane.position.set(53, 1.2, 20.05); pane.userData.fxId = "lab.door-glass"; pane.userData.room = "lab";
    scene.add(wall, floor, pane);
    scene.updateMatrixWorld(true);
    fx.surfaces.push(wall, floor, pane);
    fx.roomOf = (o) => o.userData.room ?? "";
    return { fx, scene, wall, floor, pane };
  };
  const anchor = V(45, 0, 15);
  const opts = { origin: () => anchor };
  // the first renderer: a fight, written down as it happens
  const a = await room();
  const rows = [];
  const led = new FxLedger(a.fx, opts);
  led.onRow = (r) => rows.push(r);
  for (let i = 0; i < 60; i++) a.fx.play(effects.bloodHit, { pos: V(46 + (i % 12) * 0.7, 1.1 + (i % 3) * 0.3, 21.5), dir: V(0.1, 0.05, -1), floorY: 0, amount: 0.9, kind: i % 2 ? "zombie" : "human" }, 3000 + i);
  for (let i = 0; i < 400; i++) a.fx.update(1 / 30);
  a.fx.play(effects.bloodPool, { pos: V(48, 0, 24), size: 1.2, grow: 3 }, 3100);
  a.fx.play(effects.meleeHit, { pos: V(53, 1.3, 20.4), dir: V(0, 0, -1), swing: V(1, 0, 0), weapon: "sharp", amount: 1, floorY: 0 }, 3101);
  a.fx.play(effects.pipeBomb, { pos: V(51, 0.05, 22), floorY: 0, radius: 3 }, 3102);
  for (let i = 0; i < 300; i++) a.fx.update(1 / 30);
  // the glass door gets marked, then breaks: its marks go with it
  for (let i = 0; i < 4; i++) a.fx.play(effects.bloodHit, { pos: V(53 + i * 0.1, 1.4, 20.6), dir: V(0, 0, -1), floorY: 0, amount: 0.7 }, 3200 + i);
  for (let i = 0; i < 60; i++) a.fx.update(1 / 30);
  const glassBefore = rows.filter((r) => r.k === "m" && r.on === "lab.door-glass").length;
  a.fx.onGone(a.pane, a.fx.now);
  for (const d of a.fx.decalSets.values()) d.removeOn(a.pane);
  // what the first renderer shows: every mark's vertices, live and kept, by set
  const shows = (fx) => {
    const out = {};
    for (const d of fx.decalSets.values()) {
      const pts = [];
      const take = (g, n) => { const P = g.getAttribute("position").array; for (let v = 0; v < n; v++) if (P[v * 3] || P[v * 3 + 1] || P[v * 3 + 2]) pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); };
      take(d.geo, d.capacity * d.trisPerSlot * 3);
      for (const c of d.keptRoot.children) take(c.geometry, c.geometry.drawRange.count);
      out[d.name] = pts;
    }
    return out;
  };
  const before = shows(a.fx);
  // a fresh renderer: the same room, rebuilt, the rows handed back
  const b = await room();
  const back = new FxLedger(b.fx, opts);
  const res = await back.restore(rows);
  const after = shows(b.fx);
  const marks = rows.filter((r) => r.k === "m").length;
  ok(marks > 50 && rows.every((r) => r.k !== "m" || r.on.startsWith("lab.")), `every lasting mark is written down as it's laid (${marks} rows: blood, a pool, a blade's spray, a blast's scorch)`);
  const bytes = JSON.stringify(rows).length;
  ok(bytes / marks < 260, `in a small row each, positions from the room's anchor (${Math.round(bytes / marks)} bytes a mark)`);
  ok(res.missing === 0 && res.gone === glassBefore && glassBefore > 0, `a restart lays them all down again, except the ones on the glass that broke after them (${res.laid} laid, ${res.gone} gone with the glass)`);
  // every vertex of the restored room within 2 mm of one in the first (a row keeps positions
  // to a tenth of a millimetre, so the clipped decal shifts by that much at most)
  let worst = 0;
  for (const k of Object.keys(before)) {
    const grid = new Map();
    const key = (p) => p.map((x) => Math.floor(x / 0.01)).join(",");
    for (const p of before[k]) { const kk = key(p); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(p); }
    for (const p of after[k]) {
      let best = Infinity;
      const [cx, cy, cz] = p.map((x) => Math.floor(x / 0.01));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const q of grid.get([cx + dx, cy + dy, cz + dz].join(",")) ?? []) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
      worst = Math.max(worst, best);
    }
  }
  const counts = Object.keys(before).every((k) => before[k].length === after[k].length);
  ok(counts && worst < 0.002, `and the room looks as it did, mark for mark: ${Object.entries(before).map(([k, v]) => `${k} ${v.length}/${after[k].length} vertices`).join(", ")}, the furthest ${(worst * 1000).toFixed(2)} mm from where it was`);
  // (the counts can differ by the marks that were on the glass: on the first renderer they took
  // live slots until it broke, pushing a few older marks into the kept layer a little sooner)
  const tally = (fx) => [...fx.decalSets.values()].reduce((n, d) => [n[0] + d.live, n[1] + d.keptCount()], [0, 0]);
  const [liveA, keptA] = tally(a.fx), [liveB, keptB] = tally(b.fx);
  ok(keptA > 0 && keptB > 0 && liveA + keptA === liveB + keptB, `the older ones kept with their room on both sides (${liveA}+${keptA} and ${liveB}+${keptB} live+kept)`);
  // still drying where they were: a mark laid 40 s before the restart is 40 s into its drying
  const L = b.fx.decalSets.get("pools").geo.getAttribute("aLife").array;
  let born = -1;
  for (let v = 0; v < L.length; v += 4) if (L[v + 1] > 0) { born = L[v]; break; }
  ok(born >= 0 && Math.abs(born - (400 / 30)) < 0.1, `a restored mark keeps the time it was laid, so it's exactly as dry as it was (laid at ${born.toFixed(2)} s)`);
}

console.log("-- fire that spreads, and fire in a doorway");
{
  const firesheets = ["flame-a", "flame-b", "flame-hollow", "smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((s) => sheets[s]);
  const room = async () => {
    const { fx, scene } = await make(firesheets);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12, 24, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4, 24, 8).translate(0, 2, -3), new THREE.MeshBasicMaterial());
    for (const m of [floor, wall]) m.updateMatrixWorld();
    fx.surfaces.length = 0;
    fx.surfaces.push(floor, wall);
    fx.addDecalSet("scorch", { map: blank(), cols: 2, rows: 2 }, 48, 96);
    fx.scorch = { blast: [0, 1], fuel: [2, 3] };
    return { fx, scene };
  };
  // every live flame card, wherever it is
  const flamesAt = (fx) => {
    const out = [];
    for (const name of ["flame-a", "flame-b", "flame-hollow"]) {
      if (!fx.has(name)) continue;
      for (const q of fx.layer(name).parts) if (q.on && q.delay <= 0) out.push(q.p.clone());
    }
    return out;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  {
    // a run of fuel 2.4 m long at 2.4 m/s: nothing burns past the front, and it gets there in a second
    const { fx } = await room();
    fx.emit(effects.fireSpread({ from: V(0, 0, 0), to: V(2.4, 0, 0), speed: 2.4, width: 0.35, burn: 6, patch: true, floorY: 0 }), 71);
    let ahead = 0, reached = Infinity;
    for (let i = 1; i <= 60; i++) {
      fx.update(1 / 30);
      const front = Math.min(2.4, (i / 30) * 2.4);
      for (const f of flamesAt(fx)) {
        // (while it's still running: at the end a patch catches, which spreads past it on purpose)
        if (front < 2.4 && f.x > front + 0.45) ahead++;
        if (f.x > 2.1 && reached === Infinity) reached = i / 30;
      }
    }
    ok(ahead === 0 && reached >= 0.8 && reached <= 1.2, `fire runs along spilled fuel behind its front, never ahead of it, reaching the end in a second (${reached.toFixed(2)} s; ${ahead} flames ahead of the front)`);
    ok(fx.stats().emitters >= 2, `and a patch catches where it ends (${fx.stats().emitters} fires burning)`);
    for (let i = 0; i < 30 * 12; i++) fx.update(1 / 30);
    ok(fx.stats().emitters === 0 && fx.stats().lights === 0 && fx.decalSets.get("scorch").live >= 6, `everything burns out, its light handed back, the run blackened end to end (${fx.decalSets.get("scorch").live} scorch marks)`);
  }
  {
    const run = async (seed) => {
      const { fx } = await room();
      fx.emit(effects.fireSpread({ from: V(0, 0, 0), to: V(2, 0, 1), burn: 4, floorY: 0 }), seed);
      for (let i = 0; i < 45; i++) fx.update(1 / 30);
      return flamesAt(fx).map((p) => p.toArray().map((x) => x.toFixed(4)).join(",")).sort().join("|");
    };
    ok((await run(72)) === (await run(72)) && (await run(72)) !== (await run(73)), "the same spread and seed burns the same way on every screen; another seed doesn't");
  }
  {
    // a doorway 0.9 m wide in the wall at z = -3: the fire stays in it, jamb to jamb, and is tall
    const { fx, scene } = await room();
    let lights0 = 0; scene.traverse((o) => { if (o.isLight) lights0++; });
    fx.emit(effects.doorwayFire({ pos: V(0, 0, -3), along: V(1, 0, 0), normal: V(0, 0, 1), width: 0.9, height: 2.1, burn: 6, floorY: 0, ceilingY: 3.5 }), 74);
    let outside = 0, seen = 0, held = 0, top = 0;
    for (let i = 0; i < 30 * 5; i++) {
      fx.update(1 / 30);
      held = Math.max(held, fx.stats().lights);
      for (const f of flamesAt(fx)) { seen++; if (Math.abs(f.x) > 0.6 || Math.abs(f.z + 3) > 0.4) outside++; top = Math.max(top, f.y); }
    }
    ok(seen > 200 && outside === 0, `a doorway fire burns in the doorway, jamb to jamb, and nowhere else (${seen} flame frames, ${outside} outside it)`);
    ok(top > 0.9, `and stands tall enough that nobody steps through it (flames to ${top.toFixed(2)} m)`);
    ok(held === 1, "it holds a fire light while it burns");
    for (let i = 0; i < 30 * 8; i++) fx.update(1 / 30);
    let lights1 = 0; scene.traverse((o) => { if (o.isLight) lights1++; });
    const marks = fx.decalSets.get("scorch").live;
    ok(fx.stats().lights === 0 && fx.stats().emitters === 0 && lights1 === lights0 && marks >= 2, `it goes out, gives its light back (the scene's light count never changed), and leaves the floor across the doorway and the wall over it blackened (${marks} marks)`);
  }
}

console.log("-- the facility (F4)");
{
  const { Fixtures, flicker, strike, BANK_GAP } = M;
  // the curves are pure: the same time and seed give the same light, whoever asks
  const same = ["steady", "buzz", "failing", "dying"].every((st) => Array.from({ length: 200 }, (_, i) => flicker(st, i * 0.037, 9)).join() === Array.from({ length: 200 }, (_, i) => flicker(st, i * 0.037, 9)).join());
  const bounded = ["steady", "buzz", "failing", "dying"].every((st) => Array.from({ length: 2000 }, (_, i) => flicker(st, i * 0.013, 5)).every((x) => x >= 0 && x <= 1));
  ok(same && bounded, "every flicker is a pure function of time and seed, between dark and full");
  ok(strike(-0.1, 3) === 0 && strike(0.03, 3) > 0.5 && strike(0.12, 3) === 0 && strike(3, 3) === 1, "a tube strikes: a flash, dark, stutters, then fully on");
  const dyingMean = Array.from({ length: 3000 }, (_, i) => flicker("dying", i * 0.01, 2)).reduce((a, b) => a + b, 0) / 3000;
  const failingMean = Array.from({ length: 3000 }, (_, i) => flicker("failing", i * 0.01, 2)).reduce((a, b) => a + b, 0) / 3000;
  ok(dyingMean < 0.4 && failingMean > 0.65, `a dying tube is mostly dark (${dyingMean.toFixed(2)}), a failing one mostly on (${failingMean.toFixed(2)})`);
  // the power coming back bank by bank, and a late joiner seeing the same room
  const mkRoom = () => {
    const f = new Fixtures();
    const lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffffff, 5);
      lights.push(l);
      f.add({ id: `p${i}`, zone: "lobby", bank: i % 3, light: l, style: "steady" });
    }
    return { f, lights };
  };
  const a = mkRoom();
  a.f.setPower("lobby", false, 0, 1);
  a.f.update(1);
  const dark = a.lights.every((l) => l.intensity === 0);
  a.f.setPower("lobby", true, 2, 77);
  // when each bank's first tube gets its power (its first flash), and when the room is all on
  const firstLit = [0, 1, 2].map((bank) => {
    for (let t = 2; t < 8; t += 0.005) { a.f.update(t); if (a.f.level(`p${bank}`) > 0) return t; }
    return Infinity;
  });
  a.f.update(2 + 3 * BANK_GAP + 2);
  const allOn = a.lights.every((l) => l.intensity === 5);
  ok(dark && firstLit[1] - firstLit[0] > BANK_GAP * 0.6 && firstLit[2] - firstLit[1] > BANK_GAP * 0.6 && allOn,
    `the power cut darkens the room, and it comes back bank by bank (${firstLit.map((x) => x.toFixed(2)).join(", ")} s), all of it on within ${3 * BANK_GAP + 2} s`);
  const b = mkRoom(), c = mkRoom();
  b.f.setPower("lobby", true, 2, 77);
  c.f.setPower("lobby", true, 2, 77);
  for (let t = 2; t < 3.3; t += 1 / 30) b.f.update(t);
  b.f.update(3.3);
  c.f.update(3.3);
  ok(b.lights.map((l) => l.intensity).join() === c.lights.map((l) => l.intensity).join(), "someone joining mid-restart sees exactly the room everyone else does");
  // EMERGENCY LIGHTS and THE DIP (the director's brownout)
  {
    const mk = () => {
      const f = new Fixtures();
      const main = new THREE.PointLight(0xffffff, 5), emer = new THREE.PointLight(0xffffff, 3);
      f.add({ id: "panel", zone: "lab", light: main, style: "steady" });
      f.add({ id: "emer", zone: "lab", light: emer, emergency: true });
      return { f, main, emer };
    };
    const r = mk();
    r.f.update(1);
    const offWithPower = r.emer.intensity === 0 && r.main.intensity === 5;
    r.f.setPower("lab", false, 2, 9);
    r.f.update(2.2);
    const notYet = r.emer.intensity === 0;
    r.f.update(3.5);
    const onAfter = r.emer.intensity > 2.5 && r.main.intensity === 0;
    r.f.setPower("lab", true, 5, 10);
    r.f.update(8);
    ok(offWithPower && notYet && onAfter && r.emer.intensity === 0 && r.main.intensity === 5, "an emergency light is dark while its zone has power, clunks on a moment after the power goes, and goes dark when it's back");
    const nf = new Fixtures(), lone = new THREE.PointLight(0xffffff, 3);
    nf.add({ id: "e", zone: "far", light: lone, emergency: true });
    nf.setPower("far", false, -1e6, 0);
    nf.update(10);
    ok(lone.intensity > 2.5, "a zone the generator isn't feeding (the snapshot, no event) has its emergency lights on");
    const d = mk();
    d.f.setDip("lab", 1, 1.6, 33);
    const during = [], after = [];
    for (let t = 1.1; t < 2.6; t += 0.01) { d.f.update(t); during.push(d.main.intensity / 5); if (d.emer.intensity > 0) during.push(-1); }
    d.f.update(3.2);
    const mean = during.filter((x) => x >= 0).reduce((a, b) => a + b, 0) / during.filter((x) => x >= 0).length;
    ok(mean < 0.5 && !during.includes(-1) && d.main.intensity === 5, `a power dip sags the zone's lights (to ${Math.round(mean * 100)}% on average) and gives them back; the power never goes, so the emergency lights stay dark`);
    const e = mk(), f2 = mk();
    e.f.setDip("lab", 1, 1.6, 33); f2.f.setDip("lab", 1, 1.6, 33);
    for (let t = 1; t < 2; t += 1 / 30) e.f.update(t);
    e.f.update(1.9); f2.f.update(1.9);
    ok(e.main.intensity === f2.main.intensity, "and a late joiner sees the dip exactly where everyone else does");
  }
  {
    const { fx, scene } = await make([]);
    const lamp = new THREE.PointLight(0xff2010, 9);
    scene.add(lamp);
    const n0 = lightCount(scene);
    const beam = fx.beams.add({ pos: new THREE.Vector3(0, 3, 0), dir: new THREE.Vector3(1, 0, 0), length: 6, angle: 0.18 });
    fx.fixtures.add({ id: "beacon", light: lamp, beam, beacon: { rpm: 60 } });
    fx.fixtures.setLockdown(true, fx.now);
    const dirs = [];
    for (let i = 0; i < 30; i++) { fx.update(1 / 30); dirs.push(beam.spec.dir.x.toFixed(3)); }
    ok(new Set(dirs).size > 10 && lightCount(scene) === n0 && lamp.intensity > 0, "a lockdown beacon turns and lights the room without adding a light");
    fx.clear();
    ok(lamp.intensity === 9, "and clearing hands the room its fixtures back as they were");
  }
  {
    const { fx } = await make([]);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).translate(0, 0, -3), new THREE.MeshBasicMaterial());
    wall.updateMatrixWorld();
    fx.surfaces.push(wall);
    for (let i = 0; i < 20; i++) fx.beams.add({ pos: new THREE.Vector3(i * 0.2 - 2, 3, 0), dir: new THREE.Vector3(0, -1, 0), length: 3, angle: 0.4 });
    const torch = fx.beams.add({ pos: new THREE.Vector3(0, 1.5, 0), dir: new THREE.Vector3(0, 0, -1), length: 8, angle: 0.2, fit: true });
    fx.update(1 / 30);
    const m = new THREE.Matrix4(), s = new THREE.Vector3();
    fx.beams.mesh.getMatrixAt(20, m);
    s.setFromMatrixScale(m);
    let refused = 0;
    for (let i = 0; i < 20; i++) if (!fx.beams.add({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0), length: 1, angle: 0.3 })) refused++;
    ok(fx.stats().draws === 1 && fx.beams.mesh.count === 21, `twenty-one beams are one draw (${fx.stats().draws})`);
    ok(Math.abs(s.y - 3.15) < 0.02 && torch, `a flashlight's beam ends at the wall it meets (${s.y.toFixed(2)} m of its 8)`);
    ok(refused === 9, `the beam pool is fixed: past its 32, a beam is refused, not made (${refused} refused)`);
  }
  // each piece of the room breathing, run for two minutes: it holds a steady share
  for (const [name, mk] of [
    ["steam", () => effects.steam({ pos: new THREE.Vector3(0, 2, 0), dir: new THREE.Vector3(1, 0, 0), force: 1.2, bursts: true })],
    ["drips", () => effects.drips({ from: new THREE.Vector3(0, 3, 0), floorY: 0, rate: 2, puddle: true })],
    ["wire", () => effects.sparkingWire({ pos: new THREE.Vector3(0, 2.5, 0), floorY: 0, rate: 2 })],
    ["fog", () => effects.fog({ min: new THREE.Vector3(-4, 0, -6), max: new THREE.Vector3(4, 2, 2), density: 1 })],
    ["tank", () => effects.tankBubbles({ base: new THREE.Vector3(0, 0, 0), radius: 0.5, height: 2, rate: 10 })],
  ]) {
    const { fx } = await make(["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"]);
    const h = fx.emit(mk(), 7);
    let peak = 0, late = 0;
    for (let i = 0; i < 30 * 120; i++) {
      fx.update(1 / 30);
      const n = fx.stats().particles;
      peak = Math.max(peak, n);
      if (i > 30 * 100) late = Math.max(late, n);
    }
    h.stop();
    for (let i = 0; i < 30 * 30; i++) fx.update(1 / 30);
    ok(peak < 400 && late <= peak && fx.stats().emitters === 0 && fx.stats().particles === 0, `${name}: two minutes at under 400 cards (peak ${peak}), and stopped means stopped`);
  }
  {
    const { fx } = await make([]);
    fx.emit(effects.drips({ from: new THREE.Vector3(0, 3, 0), floorY: 0, rate: 3, puddle: true }), 3);
    let flat = 0;
    for (let i = 0; i < 90; i++) {
      fx.update(1 / 30);
      const l = fx.layer("sprites"), S = l.mesh.geometry.getAttribute("iSizeRot");
      for (let k = 0; k < l.live; k++) if (S.getW(k) < 0) flat++;
    }
    ok(flat > 0, "a ripple lies flat on the water, not facing the camera");
  }
}

console.log("-- the survivors (F5)");
{
  const { BodyLook } = M;
  // a body stand-in: a skinned cylinder 1.7 m tall, its atlas wrapped round it, its seam at u = 0 / 1
  const makeBody = () => {
    // (open-ended: a cylinder's caps share its atlas with its side, which no real scan does)
    const geo = new THREE.CylinderGeometry(0.15, 0.15, 1.7, 48, 40, true).translate(0, 0.85, 0);
    const pos = geo.getAttribute("position");
    const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) sw[i * 4] = 1;
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }));
    const root = new THREE.Group();
    root.add(bone, mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]), mesh.matrixWorld);
    return { root, mesh };
  };
  const skin = new Uint8Array(512 * 512).fill(255);
  const b1 = makeBody(), look = new BodyLook(b1.root, skin);
  // a round at the front of the chest, on the seam's side (the cylinder's +z, u = 0.25)
  const hitAt = (look, v) => look.wound("bullet", v, 77);
  const vAtSeam = hitAt(look, new THREE.Vector3(0, 1.3, 0.15)); // +z: where a three.js cylinder's atlas wraps (u = 0 / 1)
  const D = look.data;
  let left = 0, right = 0, far = 0, wound = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    if (D[i + 1] > 20) { if (x < 40) left++; else if (x > 472) right++; else far++; }
    if (D[i + 3] >= 128) wound++;
  }
  ok(vAtSeam >= 0 && wound > 0, `a round leaves an open wound where it hits (${wound} texels)`);
  ok(left > 0 && right > 0, `a wound on a seam of the atlas paints BOTH sides of it (${left} and ${right} texels): it is measured on the body, not the atlas`);
  ok(far === 0, "and nothing away from it");
  const b2 = makeBody(), again = new BodyLook(b2.root, skin);
  hitAt(again, new THREE.Vector3(0, 1.3, 0.15));
  ok(Buffer.from(again.data).equals(Buffer.from(look.data)), "the same wound from the same seed paints the same texels, on every observer's copy");
  const b3 = makeBody(), bite = new BodyLook(b3.root, skin);
  bite.wound("bite", new THREE.Vector3(0.15, 0.9, 0), 12);
  let fresh0 = 0;
  for (let i = 0; i < 512 * 512; i++) fresh0 += bite.data[i * 4 + 1];
  for (let i = 0; i < 30 * 200; i++) bite.update(1 / 30);
  let fresh1 = 0, dried = 0;
  for (let i = 0; i < 512 * 512; i++) { fresh1 += bite.data[i * 4 + 1]; dried += bite.data[i * 4]; }
  ok(fresh0 > 0 && fresh1 < fresh0 * 0.15 && dried > fresh0 * 0.8, `fresh blood dries into dried blood over a few minutes (${Math.round((fresh1 / fresh0) * 100)}% still fresh after 200 s)`);
  // ROLLO: a hazmat suit over a hidden body. The look goes on the suit (the biggest DRAWN
  // body, never the "*body_proxy*" inside it, which the game doesn't draw), the mouth
  // behind the respirator bleeds nothing; the eyes come from the body inside (none here)
  {
    const suited = makeBody(), inner = makeBody(), gloves = makeBody();
    inner.mesh.name = "rollo_body_proxy";
    // (the proxy is the first mesh found and has the most vertices: neither may pick it)
    inner.mesh.geometry = new THREE.CylinderGeometry(0.14, 0.14, 1.7, 96, 80, true).translate(0, 0.85, 0);
    const pos2 = inner.mesh.geometry.getAttribute("position");
    inner.mesh.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(pos2.count * 4), 4));
    inner.mesh.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(pos2.count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
    gloves.mesh.name = "rollo_gloves";
    gloves.mesh.geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8, 2, true);
    gloves.mesh.geometry.setAttribute("skinIndex", suited.mesh.geometry.getAttribute("skinIndex").clone());
    suited.mesh.name = "rollo_suit";
    const rolloRoot = new THREE.Group();
    rolloRoot.add(inner.root, suited.root, gloves.root);
    rolloRoot.updateMatrixWorld(true);
    const rl = new BodyLook(rolloRoot, new Uint8Array(512 * 512));
    ok(rl.mesh === suited.mesh && rl.suited, "Rollo's look goes on his suit, not the hidden body inside it or his gloves, and he reads as suited");
    rl.set({ grime: 0.5, turned: 1 });
    rl.wound("bullet", new THREE.Vector3(0, 1.2, 0.15), 95);
    let marked = 0;
    for (let i = 0; i < 512 * 512; i++) if (rl.data[i * 4 + 3] >= 128) marked++;
    ok(marked > 0 && rl.state.grime === 0.5, `grime and wounds still land on the suit (${marked} texels)`);
    ok(rl.u.uEyeL.value.w === 0 && rl.u.uEyeR.value.w === 0 && rl.coughedBlood(96, 0.8) === false,
      "with no eyes found in the body inside, none are guessed onto his mask; and a cough leaves no blood on the respirator");
    ok(!look.suited, "and an ordinary survivor isn't suited");
    // HIS EYES: where his face is PAINTED (the skin mask names the atlas spots); failing that,
    // the hidden body's eyes carried straight out onto the visor — and that must not carry
    // where he stands into the answer (it put them 4 m off on the bench)
    const at = (lk) => { const b = lk.bind, e = lk.u.uEyeL.value; return new THREE.Vector3(e.x / b.inv + b.cx, e.y / b.inv + b.minY, e.z / b.inv + b.cz); };
    {
      const p2 = makeBody(), skin2 = new Uint8Array(512 * 512);
      p2.root.children[0].name = "head"; // (the eyes are found on a head)
      skin2.eyes = [[0.25, 0.2], [0.29, 0.2]];
      const pl = new BodyLook(p2.root, skin2);
      pl.set({ turned: 1 });
      const e = at(pl), r = Math.hypot(e.x, e.z - 0);
      ok(pl.u.uEyeL.value.w > 0 && Math.abs(r - 0.15) < 0.004 && !pl.u.uEyeL.value.equals(pl.u.uEyeR.value),
        `painted eyes are read off the body where the mask says (on the surface: ${(r * 100).toFixed(1)} cm from the axis of a 15 cm body)`);
    }
    {
      // a suit (a cylinder) over a body with two eyeballs, the whole thing stood at (5, 0, -3)
      const eyeL = new THREE.Bone(), eyeR = new THREE.Bone(), hip = new THREE.Bone(), head = new THREE.Bone();
      eyeL.name = "eye_l"; eyeR.name = "eye_r"; hip.name = "hips"; head.name = "head";
      head.position.set(0, 1.55, 0);
      hip.add(head); head.add(eyeL, eyeR);
      const sk = () => new THREE.Skeleton([hip, head, eyeL, eyeR]);
      const ball = (x) => new THREE.SphereGeometry(0.012, 8, 6).translate(x, 1.6, 0.09);
      const balls = [ball(0.032), ball(-0.032)];
      const pg = new THREE.BufferGeometry();
      const pp = [], pi = [], pw = [];
      balls.forEach((g, k) => { const P = g.toNonIndexed().getAttribute("position"); for (let v = 0; v < P.count; v++) { pp.push(P.getX(v), P.getY(v), P.getZ(v)); pi.push(k + 2, 0, 0, 0); pw.push(1, 0, 0, 0); } });
      pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
      pg.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(pi, 4));
      pg.setAttribute("skinWeight", new THREE.Float32BufferAttribute(pw, 4));
      const sg = new THREE.CylinderGeometry(0.15, 0.15, 1.7, 48, 40, true).translate(0, 0.85, 0);
      const sp = sg.getAttribute("position");
      sg.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(sp.count * 4), 4));
      sg.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(sp.count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
      const mat = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
      const proxyM = new THREE.SkinnedMesh(pg, mat.clone()), suitM = new THREE.SkinnedMesh(sg, mat);
      proxyM.name = "x_body_proxy"; suitM.name = "x_suit";
      const holder = new THREE.Group();
      holder.add(hip, proxyM, suitM);
      holder.position.set(5, 0, -3);
      holder.updateMatrixWorld(true);
      const skel = sk();
      proxyM.bind(skel, proxyM.matrixWorld);
      suitM.bind(skel, suitM.matrixWorld);
      const sl = new BodyLook(holder, new Uint8Array(512 * 512).fill(255));
      sl.set({ turned: 1 });
      const e = at(sl);
      ok(sl.suited && sl.u.uEyeL.value.w > 0 && Math.abs(e.y - 1.6) < 0.02 && Math.abs(Math.hypot(e.x, e.z) - 0.15) < 0.004,
        `with nothing painted, the hidden body's eyes are carried straight out onto the suit (${(e.y).toFixed(3)} m up, ${(Math.hypot(e.x, e.z) * 100).toFixed(1)} cm out), wherever he stands`);
    }
  }
  bite.clean();
  let left2 = 0, skinKept = 0;
  for (let i = 0; i < 512 * 512; i++) { left2 += bite.data[i * 4] + bite.data[i * 4 + 1] + bite.data[i * 4 + 3]; skinKept += bite.data[i * 4 + 2] === 255 ? 1 : 0; }
  ok(left2 === 0 && skinKept === 512 * 512, "a clean start (a newcomer) takes the blood and wounds away and keeps the skin mask");
  bite.set({ grime: 0.4, sweat: 2, infection: -1 });
  ok(bite.state.grime === 0.4 && bite.state.sweat === 1 && bite.state.infection === 0, "grime, sweat and infection are held between 0 and 1");
  // the baked skin masks: every survivor has one, a sane share of the atlas
  const shares = ["carla", "claudia", "eric", "manuel", "nathan", "sophia"].map((n) => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "survivors", `${n}-skin.json`), "utf8"));
    const d = Buffer.from(j.data, "base64");
    return d.reduce((a, v) => a + v / 255, 0) / d.length;
  });
  ok(shares.every((s) => s > 0.05 && s < 0.3), `every survivor's skin mask covers a sane share of their atlas (${shares.map((s) => Math.round(s * 100) + "%").join(" ")})`);
  // THE TURN: a stand-in survivor on the survivors' own rig (UE names, eye bones), one
  // material named like a scan. Its head is tilted and turned and the body stands somewhere
  // else, because a tilted head is exactly what put an eye on the brow, and three's
  // "attached" bind mode is exactly what made the first inversion wrong.
  {
    const rig = () => {
      const parts = [];
      const add = (geo, bone) => { const n = geo.getAttribute("position").count; parts.push({ geo, bone, n }); };
      add(new THREE.CylinderGeometry(0.16, 0.13, 1.45, 24, 8).translate(0, 0.725, 0), 0); // body: hip
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 24, 6).translate(0, 1.5, 0), 1); // neck
      add(new THREE.SphereGeometry(0.1, 32, 24).translate(0, 1.66, 0), 2); // head
      add(new THREE.SphereGeometry(0.012, 16, 12).translate(0.032, 1.64, 0.084), 3); // eye_l (the character's left: +x when facing +z)
      add(new THREE.SphereGeometry(0.012, 16, 12).translate(-0.032, 1.64, 0.084), 4); // eye_r
      const geos = parts.map((x) => x.geo.index ? x.geo.toNonIndexed() : x.geo);
      let total = 0; for (const g of geos) total += g.getAttribute("position").count;
      const P = new Float32Array(total * 3), UV = new Float32Array(total * 2), SI = new Uint16Array(total * 4), SW = new Float32Array(total * 4);
      let o = 0;
      geos.forEach((g, k) => {
        const pp = g.getAttribute("position"), uu = g.getAttribute("uv");
        for (let i = 0; i < pp.count; i++, o++) {
          P.set([pp.getX(i), pp.getY(i), pp.getZ(i)], o * 3);
          // (each part its own tile of the atlas: shared, a texel meant one part only)
          UV.set([(k % 3 + uu.getX(i)) / 3, (Math.floor(k / 3) + uu.getY(i)) / 2], o * 2);
          SI[o * 4] = parts[k].bone; SW[o * 4] = 1;
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(UV, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(SI, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(SW, 4));
      geo.computeVertexNormals();
      const hip = new THREE.Bone(); hip.name = "hip";
      const neck = new THREE.Bone(); neck.name = "neck"; neck.position.y = 1.42;
      const head = new THREE.Bone(); head.name = "head"; head.position.y = 0.16;
      const el = new THREE.Bone(); el.name = "eye_l"; el.position.set(0.032, 0.06, 0.084);
      const er = new THREE.Bone(); er.name = "eye_r"; er.position.set(-0.032, 0.06, 0.084);
      // (arm bones carry no skin here; they're what marks this as the survivors' rig)
      const ua = new THREE.Bone(); ua.name = "upperarm_l"; ua.position.set(0.18, 0, 0);
      const la = new THREE.Bone(); la.name = "lowerarm_l"; la.position.set(0.28, 0, 0);
      ua.add(la);
      hip.add(neck); neck.add(head, ua); head.add(el, er);
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ name: "rp_test_rigged_001_mat", map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }));
      const root = new THREE.Group();
      root.add(hip, mesh);
      root.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton([hip, neck, head, el, er, ua, la]), mesh.matrixWorld);
      // now stand it somewhere else, turned, its head down and to one side
      root.position.set(3, 0, -2);
      root.rotation.y = 0.7;
      head.rotation.set(0.35, 0.4, 0.12);
      root.updateMatrixWorld(true);
      return { root, mesh, head };
    };
    const t = rig(), tl = new BodyLook(t.root, skin);
    tl.set({ turned: 0.5 });
    const b = tl.bind;
    const want = (x) => new THREE.Vector3(x * b.inv - 0 * b.cx, (1.64 - b.minY) * b.inv, (0.096 - b.cz) * b.inv).setX((x - b.cx) * b.inv);
    const eL = tl.u.uEyeL.value, eR = tl.u.uEyeR.value;
    const got = [new THREE.Vector3(eL.x, eL.y, eL.z), new THREE.Vector3(eR.x, eR.y, eR.z)];
    const wants = [want(0.032), want(-0.032)];
    const err = Math.max(...got.map((g) => Math.min(...wants.map((w) => g.distanceTo(w))))) / b.inv; // back to metres
    ok(err < 0.004 && got[0].distanceTo(got[1]) / b.inv > 0.055, `a turned survivor's eyes cloud on the eyeballs themselves, found from the rig's eye bones with the head tilted and the body moved (worst ${(err * 1000).toFixed(1)} mm off the cornea)`);
    tl.set({ turned: 3 });
    ok(tl.state.turned === 1, "the turn is held between 0 and 1");
    ok(t.mesh.material.customProgramCacheKey() === "fx-body-v11", "a survivor's look is one program for every survivor (fx-body-v11)");
    // made cuttable (a turned survivor's limbs come off): the survivors' rig is measured from
    // its bones, the neck sized off the one-material scan, and the survivor's look is kept
    const kit2 = { bytes: 0, caps: new Map(["upperarm", "forearm", "neck", "thigh", "shin"].flatMap((c) => [[`${c}:stump`, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 8))], [`${c}:piece`, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 8))]])), gibs: new Map([["meat-a", new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02))]]) };
    const { fx: fx2, scene: sc2 } = await make([]);
    sc2.add(t.root);
    let prevRan = 0;
    const orig = t.mesh.material.onBeforeCompile;
    t.mesh.material.onBeforeCompile = function (sh, r) { prevRan++; return orig.call(this, sh, r); };
    const tc = new Cuttable(fx2, kit2, t.root);
    const neckSite = tc.model.sites.neck;
    ok(!!neckSite && neckSite.rx > 0.04 && neckSite.rx < 0.09 && neckSite.rz > 0.04 && neckSite.rz < 0.09, `the survivors' neck cut is sized off their skin, not left at nothing (${neckSite ? (neckSite.rx * 100).toFixed(1) + " x " + (neckSite.rz * 100).toFixed(1) + " cm" : "no site"}) — reading only body/head/skin materials gave a one-material scan's neck a cap of radius 0`);
    const cm = t.mesh.material;
    ok(cm.customProgramCacheKey() === "fx-body-v11+fx-cut-look-v2", `a survivor made cuttable keeps their look in the same program (${cm.customProgramCacheKey()})`);
    const sh = { uniforms: {}, vertexShader: "void main() {\n#include <begin_vertex>\n}", fragmentShader: "void main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n}" };
    try { cm.onBeforeCompile(sh, {}); } catch {}
    ok(prevRan === 1 && "uLook" in sh.uniforms && "uCutA" in sh.uniforms, "and compiling it runs the survivor's own patch first, then the cut's (clone() alone would have dropped the grey)");
    // THE COUGH (the last stage of infection): blood at the lips; into a covering fist, the
    // fist takes it and only a little gets out
    {
      const { handAtMouth } = M;
      const u = rig(), ul = new BodyLook(u.root, skin);
      const fresh = () => { let n = 0; for (let i = 0; i < 512 * 512; i++) if (ul.data[i * 4 + 1] > 40) n++; return n; };
      const coughed = ul.coughedBlood(81, 0.7);
      ok(coughed && fresh() > 0, `a cough bringing up blood leaves it at the lips (${fresh()} texels)`);
      // a hand with a middle finger: the knuckles, not the wrist, within reach of the mouth
      const hand = new THREE.Bone(); hand.name = "hand_r";
      const mid = new THREE.Bone(); mid.name = "middle_01_r"; mid.position.set(0, 0, 0.08);
      hand.add(mid);
      const holder = new THREE.Group(); holder.add(hand); holder.position.set(0, 1.6, 0.05);
      const scene2 = new THREE.Group(); scene2.add(holder); scene2.updateMatrixWorld(true);
      const mouth = new THREE.Vector3(0, 1.6, 0.16);
      const k = handAtMouth(scene2, mouth);
      ok(!!k && Math.abs(k.z - 0.13) < 1e-6, `a fist at the mouth is found by its knuckles, not its wrist (${k ? k.z.toFixed(3) : "none"} m out)`);
      ok(handAtMouth(scene2, new THREE.Vector3(0, 1.0, 0.5)) === null, "and a hand nowhere near the mouth isn't covering it");
      const sprayFrom = async (covered) => {
        const { fx } = await make([]);
        const at = new THREE.Vector3(0, 1.6, 0);
        fx.play(effects.coughBlood, { pos: at, dir: new THREE.Vector3(0, 0, 1), amount: 0.8, floorY: 0, hand: covered ? new THREE.Vector3(0, 1.58, 0.08) : null }, 82);
        let far = 0, n = 0;
        for (let i = 0; i < 40; i++) {
          fx.update(1 / 30);
          for (const q of fx.layer("sprites").parts) if (q.on && q.delay <= 0) { n++; if (q.p.z > 0.35) far++; }
        }
        return { far, n };
      };
      const open = await sprayFrom(false), shut = await sprayFrom(true);
      ok(open.far > 10 && shut.far === 0 && shut.n > 0, `uncovered, a cough throws blood out in front (${open.far} drop-frames past 35 cm); into a fist, nothing gets that far (${shut.far}) but a little mist and a drop off the hand`);
      // BANDAGES and BURNS: patches in the rest pose, six at a time
      const b = rig(), bl = new BodyLook(b.root, skin);
      ok(bl.bandage() === -1, "a bandage needs a wound to go on");
      bl.wound("cut", new THREE.Vector3(3 + 0.1, 1.1, -2), 83);
      const slot = bl.bandage();
      ok(slot >= 0 && bl.patches[slot][0] === 1 && bl.u.uPatch.value[slot].w > 0, "a bandage goes on the newest wound");
      bl.seep(slot, 0.6, 0.4);
      ok(bl.patches[slot][1] === 0.6 && bl.patches[slot][2] === 0.4, "blood seeps through it, fresh or dried");
      ok(bl.bandage() === slot, "a fresh dressing on the same wound replaces the old one, not a second on top");
      const burnSlot = bl.burn(b.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.15)), 0.1, "head");
      ok(burnSlot >= 0 && burnSlot !== slot && bl.patches[burnSlot][0] === 2, "a burn is its own patch, on the bone it's on");
      for (let k = 0; k < 9; k++) bl.burn(new THREE.Vector3(3 + (k % 3) * 0.05, 0.4 + k * 0.1, -2), 0.08);
      ok(bl.patches.length === 6 && bl.patches.every((x) => x[0] > 0), "six patches at a time; past that the oldest slot is reused");
      bl.unpatch(slot);
      bl.clean();
      ok(bl.patches.every((x) => x[0] === 0) && bl.bandage() === -1, "a clean start takes every bandage and burn off, and forgets the wounds");
      ok(bl.ops.length === 1 && bl.ops[0].o === "clean", "and its log starts again from the clean: nothing before it is kept");
    }
    // WOUNDS LAST (Josh: wounds persist the show): everything done to a survivor is written
    // down as it happens, and a restart does it all again on a fresh copy
    {
      const a = rig(), al = new BodyLook(a.root, skin);
      let tt = 1000;
      al.time = () => tt;
      const told = [];
      al.onOp = (op) => told.push(op);
      const run = (secs) => { for (let i = 0; i < secs * 30; i++) { al.update(1 / 30); tt += 1 / 30; } };
      al.set({ grime: 0.4, infection: 0.3 });
      al.wound("bite", new THREE.Vector3(3 + 0.1, 1.1, -2), 90);
      run(20);
      const bs = al.bandage();
      al.seep(bs, 0.2, 1);
      run(5);
      al.seep(bs, 0.5, 0.7);
      al.wound("bullet", new THREE.Vector3(3 - 0.1, 1.3, -2), 91);
      al.coughedBlood(92, 0.7);
      for (let k = 0; k < 3; k++) { al.bleed(0.12); run(4); }
      al.burn(a.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.15)), 0.1, "head");
      for (let k = 1; k <= 10; k++) { al.set({ sweat: k / 10, turned: k / 40 }); run(0.5); }
      run(40);
      const kept = JSON.parse(JSON.stringify(al.ops));
      ok(told.length > al.ops.length && al.ops.filter((o) => o.o === "set").length <= 3,
        `each thing done to a body is written down as it happens (${told.length} told), a look changing every frame and a bandage seeping more kept as their newest (${al.ops.length} ops)`);
      ok(JSON.stringify(kept).length < 4000, `small: ${JSON.stringify(kept).length} bytes for two wounds, a cough, a bandage, a burn and the bleeding`);
      // a fresh renderer: the same survivor, standing somewhere else with the head turned
      const b = rig();
      b.root.position.set(-6, 0, 9);
      b.root.rotation.y = -1.9;
      b.head.rotation.set(-0.3, -0.5, 0.2);
      b.root.updateMatrixWorld(true);
      const bl2 = new BodyLook(b.root, skin);
      let toldB = 0;
      bl2.onOp = () => toldB++;
      bl2.replay(kept, tt);
      let worst = 0, off = 0, total = 0;
      for (let i = 0; i < 512 * 512 * 4; i++) {
        if (i % 4 === 2) continue; // (the skin mask: the same on both)
        const d = Math.abs(al.data[i] - bl2.data[i]);
        if (al.data[i] || bl2.data[i]) total++;
        if (d > worst) worst = d;
        if (d > 6) off++;
      }
      ok(total > 0 && off === 0 && worst <= 2,
        `a restart paints the same body again from the log, wherever it stands now: ${total} marked texel-channels, ${off} more than a shade off, the worst ${worst}/255`);
      const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-6);
      const vec = (v) => [v.x, v.y, v.z, v.w];
      ok(bl2.patches.every((p, i) => same(p, al.patches[i])) && bl2.u.uPatch.value.every((p, i) => same(vec(p), vec(al.u.uPatch.value[i]))),
        "the bandage in its place, seeping as much as it was, and the burn on the head");
      ok(same(vec(bl2.u.uLook.value), vec(al.u.uLook.value)) && same(vec(bl2.u.uBite.value), vec(al.u.uBite.value)) && same(vec(bl2.u.uEyeL.value), vec(al.u.uEyeL.value)),
        "the same grime, sweat, infection and turn, the bite where it was, and the eyes on the eyeballs");
      ok(toldB === 0 && bl2.ops.length === al.ops.length, "and nothing written down twice: a replay tells nobody, but keeps the log for the next restart");
      let fresh = 0;
      for (let i = 0; i < 512 * 512; i++) fresh += bl2.data[i * 4 + 1];
      const late = rig(), ll = new BodyLook(late.root, skin);
      ll.replay(kept, tt + 3600);
      let freshLate = 0;
      for (let i = 0; i < 512 * 512; i++) freshLate += ll.data[i * 4 + 1];
      ok(fresh > 0 && freshLate === 0, "brought back an hour later, the blood has dried in the meantime");
    }
  }
  // breath: only in the cold, faster out of breath
  const puffs = async (cold, effort) => {
    const { fx, scene } = await make(["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"]);
    const head = new THREE.Object3D();
    head.position.set(0, 1.6, 0);
    scene.add(head);
    fx.emit(effects.breath({ head, cold, effort }), 5);
    let made = 0, last = 0;
    for (let i = 0; i < 30 * 20; i++) {
      fx.update(1 / 30);
      const n = [...fx.layers.values()].reduce((a, l) => a + l.live, 0);
      if (n > last) made += n - last;
      last = n;
    }
    return made;
  };
  // the mouth is found on the face itself: a head (a ball, 11 cm) on a neck, the head bone at
  // the base of the skull — the lips are just above the chin, in front of the face
  {
    const { findMouth } = M;
    const root = new THREE.Group();
    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.58, -0.03);
    root.add(headBone);
    for (const geo of [new THREE.SphereGeometry(0.11, 48, 48).translate(0, 1.62, 0.02), new THREE.CylinderGeometry(0.05, 0.055, 0.25, 24).translate(0, 1.42, -0.01)]) {
      const pos = geo.getAttribute("position");
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(pos.count * 4), 4));
      const sw = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) sw[i * 4] = 1;
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
      const bone = new THREE.Bone();
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
      root.add(bone, mesh);
      root.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton([bone]), mesh.matrixWorld);
    }
    const m = headBone.localToWorld(findMouth(root, headBone));
    const chin = 1.62 - 0.11;
    ok(m.y > chin + 0.025 && m.y < chin + 0.065 && m.z > 0.02 + 0.07 && m.z < 0.02 + 0.13, `breath comes from the mouth on the face itself, just above the chin and in front of the lips (at ${m.y.toFixed(3)} m, ${(m.y - chin).toFixed(3)} above the chin, ${m.z.toFixed(3)} forward), not from a fixed offset off the head bone`);
  }
  const warm = await puffs(0, 0), rest = await puffs(1, 0), run = await puffs(1, 1);
  ok(warm === 0 && rest > 0 && run > rest * 1.6, `breath shows only in the cold, and comes faster out of breath (${rest} puffs at rest, ${run} after a run, ${warm} where it's warm)`);
}

console.log("-- things breaking (F6)");
{
  const { voronoi, jag, barricade, rattle, settleRattles, playDoorEvent } = M;
  const woodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "breaking", "wood.json"), "utf8"));
  const makeBreak = async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 100);
    const fx = new FxSystem({
      scene, camera, renderer, sheets: ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"], spriteTexture: blank(),
      load: { texture: async () => blank(), json: async (p) => (p.includes("wood") ? woodJson : sheets) },
    });
    await fx.load();
    await fx.loadBreaking();
    return { fx, scene };
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // the bench's door: 0.9 x 2.1, facing +z, blows from behind (side -1), so debris goes +z
  const DOOR = { at: V(0, 1.05, 0), normal: V(0, 0, 1), size: [0.9, 2.1] };
  const step = (fx, secs, dt = 1 / 30) => { for (let i = 0; i < Math.round(secs / dt); i++) fx.update(dt); };
  const polyArea = (p) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

  // the fracture covers the door, every bit of it once
  const rng = mulberry32(5);
  const rect = [-0.45, -1.05, 0.45, 1.05];
  const seeds = Array.from({ length: 11 }, () => [(rng() - 0.5) * 0.9, (rng() - 0.5) * 2.1]);
  const cells = voronoi(rect, seeds, 3.2);
  const sum = cells.reduce((a, c) => a + polyArea(c), 0);
  ok(cells.length === 11 && Math.abs(sum - 0.9 * 2.1) < 0.002, `a door splits into pieces that cover it exactly (${cells.length} pieces, ${sum.toFixed(4)} of ${(0.9 * 2.1).toFixed(4)} m²)`);
  const jagged = cells.map((c) => jag(c, rect, mulberry32(9), 0.035, 0.035, "y"));
  const jsum = jagged.reduce((a, c) => a + polyArea(c), 0);
  ok(Math.abs(jsum - sum) / sum < 0.05, `their torn edges change the area by under 5% (${((Math.abs(jsum - sum) / sum) * 100).toFixed(1)}%), and the door's own edges stay straight`);

  // the planks: the same door nails them in the same places for everyone, on its side, apart
  const { fx: fxa } = await makeBreak();
  const g1 = barricade(fxa.breaking, { ...DOOR, side: 1 }, 3, 4242), g2 = barricade(fxa.breaking, { ...DOOR, side: 1 }, 3, 4242);
  const pose = (g) => g.children.map((c) => [...c.position.toArray(), ...c.quaternion.toArray()].map((x) => x.toFixed(5)).join(",")).join("|");
  ok(g1.children.length === 3 && pose(g1) === pose(g2), "a barricade's three planks lie the same for every observer (from the door's seed)");
  ok(g1.children.every((c) => c.position.z > 0.02), "and they sit on the barricaded side of the door, on its face");
  const ys = g1.children.map((c) => c.position.y).sort((a, b) => a - b);
  ok(ys[1] - ys[0] > 0.3 && ys[2] - ys[1] > 0.3, `spaced up the door so no two cross (${ys.map((y) => y.toFixed(2)).join(", ")} m)`);

  // a plank giving way: one draw, the same on every screen, never through the floor
  const runPlank = async (mode, which, seed) => {
    const { fx, scene } = await makeBreak();
    const g = barricade(fx.breaking, { ...DOOR, side: 1 }, 3, 4242);
    scene.add(g);
    g.updateMatrixWorld(true);
    const plank = g.children[which];
    fx.play(effects.plankBreak, { plank, push: V(0, 0, 1), floorY: 0, mode }, seed);
    let lowest = Infinity, snap = "";
    for (let i = 0; i < 30 * 8; i++) {
      fx.update(1 / 30);
      for (const d of fx.breaks.batches) lowest = Math.min(lowest, d.lowest());
      // (taken while it's still falling: once every piece is at rest it's kept with the room)
      if (i === 30) snap = fx.breaks.batches.map((d) => d.snapshot()).join("/");
    }
    return { fx, plank, lowest, snap };
  };
  const a = await runPlank("snap", 2, 77), b = await runPlank("snap", 2, 77);
  ok(!a.plank.visible && a.fx.breaks.draws === 1, `a snapped plank leaves its place and becomes one draw (${a.fx.breaks.draws}) for both halves and every sliver`);
  ok(a.snap === b.snap && a.snap.length > 0, "and breaks the same way on every screen, from the event's seed");
  const torn = await runPlank("tear", 1, 78);
  ok(torn.lowest > -0.012, `a plank torn off at one end swings down and stops on the floor, never through it (lowest point ${torn.lowest.toFixed(3)} m)`);
  ok([a, torn].every((r) => r.lowest > -0.012), "nothing that breaks off a barricade ever goes through the floor");

  // a door bursting: out the far side, the leaf gone, everything ends lying flat on the floor
  const { fx: fxb, scene: sb } = await makeBreak();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.044));
  leaf.position.copy(DOOR.at);
  sb.add(leaf);
  const lights0 = lightCount(sb);
  playDoorEvent(fxb, { event: "door.broken", seed: 91, at: DOOR.at.toArray(), normal: DOOR.normal.toArray(), size: DOOR.size, material: "wood", side: -1, lastHp: 60 }, { leaf, floorY: 0 });
  const burst = fxb.breaks.batches[0];
  step(fxb, 1.2);
  const flown = burst.poses().filter((q) => q.phase !== "wait");
  const meanZ = flown.reduce((s, q) => s + q.pos.z, 0) / flown.length;
  ok(!leaf.visible && fxb.breaks.draws === 1 && burst.poses().length >= 12, `a burst door is gone from its frame and is ${burst.poses().length} pieces (panels and slivers) in one draw`);
  ok(meanZ > 0.3, `the pieces go out the far side, away from whatever broke it (on average ${meanZ.toFixed(2)} m)`);
  step(fxb, 12);
  const end = burst.poses().filter((q) => q.phase !== "gone");
  const standing = end.filter((q) => Math.abs(V(0, 0, 1).applyQuaternion(q.quat).y) < 0.55);
  ok(standing.length === 0, `once it settles, no piece is left standing on its edge (${standing.length} of ${end.length})`);
  ok(end.every((q) => q.rest) && burst.lowest() > -0.012, "every piece lies at rest on the floor, none of it under it");
  ok(lightCount(sb) === lights0, "breaking things adds no light to the room");

  // a glass door: its cracks go with the pane; it goes through; teeth stay in the frame
  const { fx: fxg, scene: sg } = await makeBreak();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.92, 0.008, 4, 8, 1));
  pane.position.copy(DOOR.at);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3, 8, 6));
  wall.position.set(0, 1.5, -0.3);
  sg.add(pane, wall);
  sg.updateMatrixWorld(true);
  fxg.addDecalSet("holes", { map: blank(), cols: 2, rows: 2 }, 16, 48);
  fxg.decal("holes", { target: pane, pos: V(0.1, 1.3, 0.004), normal: V(0, 0, 1), size: 0.3, cell: 3, depth: 0.1 });
  fxg.decal("holes", { target: wall, pos: V(1.2, 1.3, -0.3), normal: V(0, 0, 1), size: 0.1, cell: 0, depth: 0.1 });
  const before = fxg.decalSets.get("holes").live;
  playDoorEvent(fxg, { event: "door.broken", seed: 92, at: DOOR.at.toArray(), normal: DOOR.normal.toArray(), size: DOOR.size, material: "glass", side: -1, lastHp: 60 }, { pane, floorY: 0 });
  ok(before === 2 && fxg.decalSets.get("holes").live === 1 && !pane.visible, "when a pane breaks its cracks go with it, and the marks on the wall beside it stay");
  const glass = fxg.breaks.batches[0];
  step(fxg, 2);
  const shards = glass.poses();
  const through = shards.filter((q) => q.pos.z > 0.05).length;
  const teeth = shards.filter((q) => q.phase === "wait").length;
  ok(shards.length >= 25 && through / shards.length > 0.6, `the pane breaks into ${shards.length} shards and most of them (${Math.round((through / shards.length) * 100)}%) go through to the far side`);
  ok(teeth > 0, `and some stay stuck in the frame as teeth (${teeth})`);
  {
    // A LAB DOOR: glass only in a round window on each leaf (the anchors mark them round). The
    // blow lands on a window and only that one breaks, cut to its circle, in its own plane
    const { fx: fxw, scene: sw } = await makeBreak();
    const at = V(0, 1.25, -4.6);
    const win = (x) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.41)); m.position.set(x, 1.6, -4.6 - 0.066); m.userData.fxRound = true; return m; };
    const wins = [win(-0.5), win(0.5)];
    sw.add(...wins);
    sw.updateMatrixWorld(true);
    playDoorEvent(fxw, { event: "door.broken", seed: 94, at: at.toArray(), normal: [0, 0, 1], size: [2.4, 2.5], material: "glass", side: -1, lastHp: 50 }, { panes: wins, floorY: 0 });
    const broke = wins.filter((w) => !w.visible);
    const b = fxw.breaks.batches[0];
    const start = b ? b.poses() : [];
    const c = broke[0]?.position;
    const worst = c ? Math.max(...start.map((q) => Math.hypot(q.pos.x - c.x, q.pos.y - c.y))) : Infinity;
    const plane = c ? Math.max(...start.map((q) => Math.abs(q.pos.z - c.z))) : Infinity;
    ok(broke.length === 1 && start.length >= 6 && worst < 0.205 && plane < 0.01,
      `a lab door's blow breaks one of its two windows and only it: ${start.length} shards, every one inside its 20.5 cm circle (the furthest ${(worst * 100).toFixed(1)} cm out) and in its plane`);
  }

  // a blow on a barricade that takes it below a whole plank breaks the outer planks, and only them
  const { fx: fxp, scene: sp } = await makeBreak();
  const gp = barricade(fxp.breaking, { ...DOOR, side: 1 }, 3, 4242);
  sp.add(gp);
  sp.updateMatrixWorld(true);
  const pl = [...gp.children];
  playDoorEvent(fxp, { event: "door.hit", seed: 93, at: DOOR.at.toArray(), normal: DOOR.normal.toArray(), size: DOOR.size, material: "wood", side: -1 }, { planks: pl, planksLeft: 1, floorY: 0 });
  ok(pl[0].visible && !pl[1].visible && !pl[2].visible && fxp.breaks.draws === 2, "a blow that leaves one plank breaks the two outer ones and leaves the first nailed on");
  {
    // a REINFORCED barricade: the same planks in the same places, iron-strapped and bolted
    const plain = barricade(fxp.breaking, { ...DOOR, side: 1 }, 3, 4242), iron = barricade(fxp.breaking, { ...DOOR, side: 1, reinforced: true }, 3, 4242);
    const pose = (g) => g.children.map((c) => c.position.toArray().concat(c.quaternion.toArray()).map((x) => x.toFixed(5)).join(",")).join("|");
    const verts = (g) => g.children.reduce((a, c) => a + c.geometry.getAttribute("position").count, 0);
    const nails = (g) => g.children.reduce((a, c) => a + c.userData.plank.nails.length, 0);
    ok(pose(plain) === pose(iron) && pose(plain) === pose(gp), "a reinforced barricade's planks lie exactly where an ordinary one's do (and an ordinary one lays out as it always did)");
    ok(verts(iron) > verts(plain) && nails(iron) >= nails(plain) + 3 * 6 && iron.children.every((c) => c.userData.reinforced), `and each carries iron straps and more nails, in its own mesh (${verts(plain)} → ${verts(iron)} vertices, ${nails(plain)} → ${nails(iron)} nails)`);
    // the show re-nails a door when the server reinforces it, the same number of planks
    const { ShowFx } = M;
    const show = new ShowFx(fxp, 0);
    show.registerDoor("store", { leaf: new THREE.Object3D(), at: DOOR.at.toArray(), normal: DOOR.normal.toArray(), size: DOOR.size, material: "wood", floorY: 0 }, { planks: 2 });
    const before = [];
    sp.traverse((o) => { if (o.name === "barricade") before.push(o); });
    show.apply("store", { planks: 2, reinforced: true });
    let strapped = 0, planksNow = 0;
    sp.traverse((o) => { if (o.name.startsWith("plank-") && o.parent?.name === "barricade" && !before.includes(o.parent)) { planksNow++; if (o.userData.reinforced) strapped++; } });
    ok(planksNow === 2 && strapped === 2 && show.planksOn("store") === 2, "reinforcing a door re-nails the same planks with their straps on");
    show.forgetDoor("store");
  }

  // shaking: with the blow first, and back exactly where it hung
  const { fx: fxr } = await makeBreak();
  const holder = new THREE.Group();
  holder.position.set(3, 0, 1);
  holder.rotation.y = 0.7;
  const thing = new THREE.Object3D();
  thing.position.set(0.2, 1, 0);
  holder.add(thing);
  holder.updateMatrixWorld(true);
  const home = thing.position.clone(), homeQ = thing.quaternion.clone();
  const push = V(0, 0, 1);
  rattle(fxr, thing, push, 0.01, 0.005, 0.5, 5);
  fxr.update(1 / 60);
  thing.updateMatrixWorld(true);
  const moved = thing.getWorldPosition(V(0, 0, 0)).sub(holder.localToWorld(home.clone()));
  ok(moved.dot(push) > 0, "a door struck from behind first moves away from the blow");
  step(fxr, 0.2);
  rattle(fxr, thing, push, 0.01, 0.005, 0.5, 6);
  step(fxr, 0.7);
  ok(thing.position.equals(home) && thing.quaternion.equals(homeQ), "and once it stops shaking it hangs exactly where it did, even after a second blow mid-shake");
  rattle(fxr, thing, push, 0.01, 0.005, 0.5, 7);
  step(fxr, 0.1);
  settleRattles();
  ok(thing.position.equals(home), "clearing the show puts anything still shaking back in place");

  // the pieces STAY (Josh, Oct 23: wreckage lasts the show): at rest, kept with the room
  step(fxb, 320, 0.25);
  ok(fxb.breaks.batches.length === 0 && fxb.breaks.kept.tris() > 0 && fxb.breaks.draws === fxb.breaks.kept.draws && fxb.breaks.kept.draws <= 2,
    `a broken door's pieces stay where they came to rest, kept with the room (${fxb.breaks.kept.tris()} triangles, ${fxb.breaks.kept.draws} draw), nothing left moving`);
}

console.log("-- the show's events to the effects (F7: the bridge)");
{
  const { ShowFx } = M;
  const woodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "breaking", "wood.json"), "utf8"));
  const makeShow = async (serverNow) => {
    const scene = new THREE.Scene();
    const fx = new FxSystem({ scene, camera: new THREE.PerspectiveCamera(), renderer, sheets: ["smoke-wisp-a"], spriteTexture: blank(), load: { texture: async () => blank(), json: async (p) => (p.includes("wood") ? woodJson : sheets) } });
    await fx.load();
    await fx.loadBreaking();
    return { fx, scene, show: new ShowFx(fx, serverNow) };
  };
  const door = () => ({ leaf: new THREE.Object3D(), at: [55, 1.05, 32], normal: [0, 0, 1], size: [0.9, 2.1], material: "wood", holdSide: -1, floorY: 0 });
  const a = await makeShow(0), b = await makeShow(0);
  a.show.registerDoor("reception-decon", door(), { planks: 2 });
  b.show.registerDoor("reception-decon", door(), { planks: 2 });
  const pose = (s) => { const out = []; s.traverse((o) => { if (o.name.startsWith("plank")) out.push(o.position.toArray().map((x) => x.toFixed(4)).join(",")); }); return out.join("|"); };
  ok(a.show.planksOn("reception-decon") === 2 && pose(a.scene) === pose(b.scene) && pose(a.scene).length > 0, "a late joiner's door has the planks the server says, nailed in the same places as everyone else's");
  const d2 = door();
  a.show.registerDoor("gone", d2, { broken: true, planks: 2 });
  ok(!d2.leaf.visible && a.show.planksOn("gone") === 0, "and a door already broken is joined broken: no leaf, no planks");
  // the power came back two seconds before somebody joined: they see the banks where a live
  // viewer sees them, not the return starting over
  const live = await makeShow(10_000), late = await makeShow(12_000);
  for (const s of [live, late]) s.fx.fixtures.add({ id: "p", zone: "lobby", bank: 2, light: new THREE.PointLight(), style: "steady" });
  live.show.event({ event: "zone.powered", seed: 5, t: 10_000, zone: "lobby", on: true });
  live.fx.update(2);
  late.show.event({ event: "zone.powered", seed: 5, t: 10_000, zone: "lobby", on: true });
  late.fx.update(1e-6);
  ok(Math.abs(live.fx.fixtures.level("p") - late.fx.fixtures.level("p")) < 1e-3, `a power return already under way is at the same place on a late joiner's screen (${live.fx.fixtures.level("p").toFixed(3)} and ${late.fx.fixtures.level("p").toFixed(3)})`);
}

console.log("-- flashlights: the lens across a dark room, a battery that dies; a lit molotov");
{
  const { battery } = M;
  const mean = (c) => { let a = 0; for (let i = 0; i < 2000; i++) a += battery(c, i * 0.013, 7).level; return a / 2000; };
  const levels = [1, 0.5, 0.25, 0.15, 0.08, 0.02, 0].map(mean);
  ok(levels.every((x, i) => i === 0 || x <= levels[i - 1] + 1e-9) && levels[0] === 1 && levels[1] === 1 && levels[6] === 0,
    `a battery burns full down to 30%, then fainter the emptier it gets, and dark when flat (${levels.map((x) => x.toFixed(2)).join(" ")})`);
  ok(battery(0.2, 3.1, 7).warm > 0 && battery(0.6, 3.1, 7).warm === 0, "and its light warms toward amber as it goes");
  ok(Array.from({ length: 300 }, (_, i) => battery(0.06, i * 0.021, 9).level).join() === Array.from({ length: 300 }, (_, i) => battery(0.06, i * 0.021, 9).level).join(), "the sputter is a pure function of charge, time and seed: everyone sees the same one");
  {
    const { fx, scene } = await make([]);
    const cam = fx.opts.camera;
    cam.position.set(0, 1.6, 5); cam.updateMatrixWorld();
    const lamp = new THREE.SpotLight(0xffffff, 20);
    scene.add(lamp);
    const n0 = lightCount(scene);
    let dir = new THREE.Vector3(1, 0, 0);
    fx.torches.add({ id: "a", light: lamp, charge: 1, lens: () => ({ pos: new THREE.Vector3(0, 1.5, -5), dir }) });
    fx.update(1 / 30);
    const side = fx.torches.mesh.geometry.getAttribute("iGlow").getW(0);
    dir = new THREE.Vector3(0, 0.01, 1);
    fx.update(1 / 30);
    const facing = fx.torches.mesh.geometry.getAttribute("iGlow").getW(0);
    // (the flare was 1.5 m, thirty times the lens, until Nov 9 2026 — Josh: "why is this zombies head so shiny": a
    // torch down the lens blanked the frame. It glares at 0.3 m at most now, and this check still wanted ten times)
    ok(fx.torches.mesh.count === 1 && facing > side * 4 && facing <= 0.31 && lightCount(scene) === n0 && fx.stats().draws >= 1,
      `a torch shows its lens (one draw for all of them), flaring when it points at the camera (${side.toFixed(2)} m from the side, ${facing.toFixed(2)} m in your face — never a disc that blanks the frame), without adding a light`);
    fx.torches.set("a", { charge: 0 });
    fx.update(1 / 30);
    ok(lamp.intensity === 0 && fx.torches.mesh.count === 0, "flat, its light and its lens go dark");
    fx.clear();
    ok(lamp.intensity === 20, "and clearing hands its light back as it was");
  }
  {
    // the rag: it follows the bottle, its flames left behind where it's been, and it ends with it
    const { fx, scene } = await make(["flame-a", "flame-b", "smoke-wisp-a"].filter((x) => sheets[x]));
    const at = new THREE.Vector3(0, 1.2, 0);
    let gone = false;
    fx.emit(effects.litRag({ from: () => (gone ? null : at) }), 91);
    for (let i = 0; i < 30; i++) fx.update(1 / 30);
    const held = fx.stats().lights;
    // thrown along +x at 8 m/s: the fire trails close behind the bottle, an unbroken streak.
    // (Launched backward at the bottle's own speed, the first cut strung the flames out
    // metres behind it in dots.) Ahead means past where the bottle is by more than the few
    // centimetres a fresh flame drifts within one frame.
    let ahead = 0, behind = 0, lag = 0;
    for (let i = 0; i < 15; i++) {
      at.x += 8 / 30;
      fx.update(1 / 30);
      for (const name of ["flame-a", "flame-b"]) if (fx.has(name)) for (const q of fx.layer(name).parts) if (q.on && q.delay <= 0) { if (q.p.x > at.x + 0.12) ahead++; else { behind++; lag += at.x - q.p.x; } }
    }
    gone = true;
    fx.update(1 / 30);
    ok(held === 1 && behind > 20 && ahead === 0 && lag / behind < 0.8, `a lit rag lights the hand that holds it, and thrown, its fire streams close behind the bottle (on average ${(lag / Math.max(1, behind)).toFixed(2)} m back, ${ahead} flames ahead of it)`);
    ok(fx.stats().emitters === 0 && fx.stats().lights === 0, "when the bottle's gone the rag's done, its light handed back");
  }
}

console.log("-- the sink");
{
  const { fx } = await make([]);
  let flow = 0;
  fx.emit(effects.tapRunning({ spout: new THREE.Vector3(0, 1.15, 0), basinY: 0.84, flow: () => flow }), 95);
  const live = () => fx.layer("sprites").live;
  for (let i = 0; i < 30; i++) fx.update(1 / 30);
  const off = live();
  flow = 1;
  fx.update(1 / 30);
  const first = live();
  let peak = 0, below = 0;
  for (let i = 0; i < 60; i++) {
    fx.update(1 / 30);
    peak = Math.max(peak, live());
    for (const q of fx.layer("sprites").parts) if (q.on && q.delay <= 0 && q.p.y < 0.84 - 0.01) below++;
  }
  flow = 0;
  for (let i = 0; i < 60; i++) fx.update(1 / 30);
  ok(off === 0 && first < peak / 3 && peak > 40 && peak < 400 && below === 0 && live() === 0,
    `a tap runs only while it's open, opening over a moment rather than at once (${first} drops in its first frame, ${peak} at full), never below the basin, and stops when it's shut`);
}

console.log("-- the director's tools through the show bridge");
{
  const { ShowFx } = M;
  const { fx, scene } = await make(["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c", "dust-impact"].filter((x) => sheets[x]));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
  floor.updateMatrixWorld();
  fx.surfaces.length = 0; fx.surfaces.push(floor);
  const show = new ShowFx(fx, 0);
  const panel = new THREE.PointLight(0xffffff, 5);
  scene.add(panel);
  const n0 = lightCount(scene);
  fx.fixtures.add({ id: "panel", zone: "lab", light: panel });
  show.event({ event: "zone.dip", seed: 1, t: Math.round(fx.now * 1000), zone: "lab", dur: 1.5 });
  for (let i = 0; i < 20; i++) fx.update(1 / 30);
  const dipped = panel.intensity < 5;
  for (let i = 0; i < 60; i++) fx.update(1 / 30);
  ok(dipped && panel.intensity === 5, "zone.dip: the zone's lights sag and come back");
  show.event({ event: "pipe.burst", seed: 2, t: Math.round(fx.now * 1000), at: [0, 2.4, 0], normal: [1, 0, 0], floorY: 0 });
  for (let i = 0; i < 15; i++) fx.update(1 / 30);
  const steamy = ["smoke-wisp-a", "smoke-wisp-b", "smoke-wisp-c"].filter((x) => fx.has(x)).reduce((a, x) => a + fx.layer(x).live, 0);
  ok(fx.stats().emitters >= 1 && steamy > 10, `pipe.burst: a split pipe venting (${steamy} puffs of steam in half a second)`);
  fx.clear(); // (measured on its own: the pipe's spray dies away over the same second)
  fx.update(1 / 30);
  const before = fx.layer("sprites").live;
  show.event({ event: "thing.fell", seed: 3, t: Math.round(fx.now * 1000), at: [2, 0, 1], from: 3.5, scale: 0.8 });
  // (the trickle staggers in and the grit waits for the fall: watch the whole second)
  let most = 0;
  for (let i = 0; i < 36; i++) { fx.update(1 / 30); most = Math.max(most, fx.layer("sprites").live); }
  ok(most > before + 20, `thing.fell: dust and grit off the ceiling, and off the floor where it lands (${most - before} at once)`);
  {
    const e0 = fx.stats().emitters;
    show.event({ event: "fire.spread", seed: 5, t: Math.round(fx.now * 1000), from: [0, 0, 0], to: [2, 0, 0] });
    show.registerDoor("lab-door", { leaf: new THREE.Object3D(), at: [5, 1.05, 0], normal: [1, 0, 0], size: [0.9, 2.1], material: "wood", floorY: 0 }, {});
    show.event({ event: "fire.door", seed: 6, t: Math.round(fx.now * 1000), door: "lab-door" });
    ok(fx.stats().emitters === e0 + 2, "fire.spread and fire.door start their fires (a run along the fuel; a doorway burning, from the door's own placement)");
  }
  show.event({ event: "vault.shut", seed: 4, t: Math.round(fx.now * 1000), at: [0, 1.5, -3], normal: [0, 0, 1], size: [3, 3] });
  fx.update(1 / 30);
  ok(fx.shakeOffset(new THREE.Vector3(0, 1.6, 1)).length() > 0 && lightCount(scene) === n0, "vault.shut: the seals hiss, the frame sheds its dust, the camera feels it, and no light was added for any of it");
  fx.clear();
}

console.log("-- the ledger: wreckage outlives the renderer");
{
  const { ShowFx, FxLedger } = M;
  const woodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "breaking", "wood.json"), "utf8"));
  const makeShow = async () => {
    const scene = new THREE.Scene();
    const fx = new FxSystem({ scene, camera: new THREE.PerspectiveCamera(), renderer, sheets: ["smoke-wisp-a"], spriteTexture: blank(), load: { texture: async () => blank(), json: async (p) => (p.includes("wood") ? woodJson : sheets) } });
    await fx.load();
    await fx.loadBreaking();
    fx.roomAt = () => "reception";
    return { fx, scene, show: new ShowFx(fx, 0) };
  };
  const door = () => ({ leaf: new THREE.Object3D(), at: [55, 1.05, 32], normal: [0, 0, 1], size: [0.9, 2.1], material: "wood", holdSide: -1, floorY: 0 });
  const anchorAt = new THREE.Vector3(40, 0, 20);
  // the first renderer: a barricade beaten down plank by plank, then the door bursts
  const a = await makeShow();
  const rows = [];
  const led = new FxLedger(a.fx, { origin: () => anchorAt });
  led.onRow = (r) => rows.push(r);
  a.show.registerDoor("reception-decon", door(), { planks: 3 });
  let t = 0;
  const run = (secs) => { for (let i = 0; i < secs * 30; i++) a.fx.update(1 / 30); };
  for (let k = 0; k < 3; k++) {
    a.show.event({ event: "door.hit", seed: 500 + k, t: t++, door: "reception-decon", side: 1, material: "wood" }, { planks: 2 - k });
    run(1.2);
  }
  a.show.event({ event: "door.broken", seed: 510, t: t++, door: "reception-decon", side: 1, material: "wood", lastHp: 70 }, { broken: true });
  run(25);
  const wrecks = rows.filter((r) => r.k === "w");
  const keptA = a.fx.breaks.kept.tris("reception");
  ok(wrecks.length === 4 && a.fx.breaks.batches.length === 0 && keptA > 0, `every break's wreckage is written down once it's at rest: three planks and the door (${wrecks.length} rows, ${keptA} triangles kept)`);
  ok(JSON.stringify(wrecks).length / wrecks.length < 8000, `as the event that made it and where each piece lay (${Math.round(JSON.stringify(wrecks).length / wrecks.length)} bytes a break)`);
  // a fresh renderer: the door as the world registers it now (broken, no planks), the rows back
  const b = await makeShow();
  b.show.registerDoor("reception-decon", door(), { broken: true, planks: 0 });
  const back = new FxLedger(b.fx, { origin: () => anchorAt });
  const again = [];
  back.onRow = (r) => again.push(r);
  const res = await back.restore(rows, b.show);
  b.show.apply("reception-decon", { broken: true, planks: 0 });
  const verts = (fx) => {
    const out = [];
    fx.breaks.kept.group.traverse((m) => {
      if (!m.isMesh) return;
      const P = m.geometry.getAttribute("position").array;
      for (let v = 0; v < m.geometry.drawRange.count; v++) if (P[v * 3] || P[v * 3 + 1] || P[v * 3 + 2]) out.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    });
    return out;
  };
  const va = verts(a.fx), vb = verts(b.fx);
  const grid = new Map();
  const key = (p) => p.map((x) => Math.floor(x / 0.01)).join(",");
  for (const p of va) { const kk = key(p); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(p); }
  let worst = 0;
  for (const p of vb) {
    let best = Infinity;
    const c = p.map((x) => Math.floor(x / 0.01));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const q of grid.get([c[0] + dx, c[1] + dy, c[2] + dz].join(",")) ?? []) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    worst = Math.max(worst, best);
  }
  ok(res.wrecks === 4 && va.length === vb.length && worst < 0.002, `a restart makes the same wreckage again where it lay: ${res.wrecks} breaks, ${vb.length}/${va.length} vertices, the furthest ${(worst * 1000).toFixed(2)} mm from where it was`);
  ok(b.fx.stats().particles === 0 && b.fx.stats().emitters === 0 && b.fx.stats().lights === 0 && b.fx.breaks.batches.length === 0 && again.length === 0,
    "and quietly: no dust, splinters or light from a break an hour old, nothing left moving, and nothing written down twice");
  ok(b.show.planksOn("reception-decon") === 0, "and the door is as the world says it is now (broken, no planks)");
}

console.log("-- the worst moment on a loop: nothing grows (F7, the soak before the stress test)");
{
  const { ShowFx } = M;
  const woodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "breaking", "wood.json"), "utf8"));
  const bloodJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood", "blood.json"), "utf8"));
  const scorchJson = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "downloads", "survivorz", "fx", "scorch", "scorch.json"), "utf8"));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 100);
  camera.position.set(52, 2.2, 21);
  camera.lookAt(56, 1, 31);
  camera.updateMatrixWorld();
  const fx = new FxSystem({
    scene, camera, renderer, spriteTexture: blank(),
    load: {
      texture: async () => blank(),
      json: async (p) => (p.includes("wood") ? woodJson : p.includes("blood/") ? bloodJson : p.includes("scorch") ? scorchJson : sheets),
    },
  });
  await fx.load();
  await fx.loadBlood();
  await fx.loadScorch();
  await fx.loadBreaking();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Reception: its floor, the south wall with the decon door, a pipe
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 12, 30, 12));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(55, 0, 26);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 4, 30, 4));
  wall.rotation.y = Math.PI;
  wall.position.set(55, 2, 32);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.044));
  leaf.position.set(55, 1.05, 32);
  scene.add(floor, wall, leaf);
  scene.updateMatrixWorld(true);
  fx.surfaces.push(floor, wall);
  const lights = Array.from({ length: 6 }, (_, i) => {
    const l = new THREE.PointLight(0xffffff, 7, 10, 2);
    l.position.set(46 + (i % 3) * 9, 3.75, i < 3 ? 23.5 : 28.5);
    scene.add(l);
    return l;
  });
  for (const [i, l] of lights.entries()) {
    const beam = fx.beams.add({ pos: l.position.clone().setY(3.93), dir: V(0, -1, 0), length: 3.9, angle: 0.5, color: 0xffffff, intensity: 0.7, floorY: 0 });
    fx.fixtures.add({ id: `rec-${i}`, zone: "lobby", bank: i % 3, light: l, beam, style: "buzz" });
    fx.emit(effects.beamDust({ beam, count: 22 }), 1900 + i);
  }
  fx.emit(effects.steam({ pos: V(40.5, 3.35, 27.5), dir: V(1, -0.3, 0.2), force: 1, bursts: true }), 1950);
  const show = new ShowFx(fx, 0);
  const lightsAtStart = lightCount(scene);

  // what geometry is in the world, and what was freed
  const disposed = new Set();
  const origDispose = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { disposed.add(this.uuid); return origDispose.call(this); };
  const seen = new Set();
  const look = () => {
    const live = new Set();
    let objects = 0;
    // (a room's kept marks are counted on their own: they're meant to build up)
    scene.traverse((o) => { if (!o.name.startsWith("fx-decals-kept") && !o.name.startsWith("fx-kept")) objects++; if (o.geometry) { live.add(o.geometry.uuid); seen.add(o.geometry.uuid); } });
    return { live, objects };
  };
  const gun = (id, from, to) => {
    const dir = to.clone().sub(from).normalize();
    const m = new THREE.Matrix4().compose(from, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.asin(dir.y), Math.atan2(dir.x, dir.z), 0, "YXZ")), new THREE.Vector3(1, 1, 1));
    return { m, dir };
  };

  const DT = 1 / 20, CYCLE = 16;
  let seed = 1, worst = { particles: 0, decals: 0, debris: 0, rigid: 0, emitters: 0 };
  const perCycle = [];
  for (let c = 0; c < 40; c++) {
    const at = (s) => Math.round(s / DT);
    const plan = new Map();
    const on = (s, f) => { const k = at(s); plan.set(k, [...(plan.get(k) ?? []), f]); };
    show.registerDoor("reception-decon", { leaf, at: [55, 1.05, 32], normal: [0, 0, 1], size: [0.9, 2.1], material: "wood", holdSide: -1, floorY: 0 }, { planks: 0 });
    leaf.visible = true;
    for (let k = 1; k <= 3; k++) on(0.2 * k, () => show.event({ event: "door.barricade", seed: seed++, t: 0, door: "reception-decon" }, { planks: k }));
    for (let k = 0; k < 4; k++) on(1 + k * 0.6, () => show.event({ event: "door.hit", seed: seed++, t: 0, door: "reception-decon", side: 1, material: "wood" }, { planks: Math.max(0, 2 - k) }));
    on(3.6, () => show.event({ event: "door.broken", seed: seed++, t: 0, door: "reception-decon", side: 1, material: "wood", lastHp: 70 }, { broken: true }));
    for (let k = 0; k < 14; k++) on(4 + k * 0.11, () => {
      const { m, dir } = gun(k % 4 === 3 ? "shotgun" : "hk416", V(52.6, 1.4, 26.4), V(55.5 + Math.sin(k) * 0.4, 1.1, 32));
      fx.play(effects.gunShot, { gun: k % 4 === 3 ? "shotgun" : "hk416", matrix: m, floorY: 0 }, seed++);
      const h = fx.hit(V(52.6, 1.4, 26.4), dir, 30);
      if (h) fx.play(effects.bulletImpact, { surface: "concrete", pos: h.point, normal: h.normal, dir, floorY: 0 }, seed++);
    });
    for (let k = 0; k < 6; k++) on(4.2 + k * 0.3, () => fx.play(effects.bloodHit, { pos: V(56.3, 1.2 + (k % 3) * 0.15, 30.3), dir: V(0, 0.05, 1), floorY: 0, amount: 0.8, kind: "zombie" }, seed++));
    on(5.2, () => fx.emit(effects.molotov({ pos: V(55.6, 0.03, 30.6), dir: V(0, 0, 1), floorY: 0, ceilingY: 4, radius: 1.4, burn: 7 }), seed++));
    on(6, () => fx.play(effects.bloodPool, { pos: V(56.8, 0, 29.6), size: 1.3, grow: 6, kind: "zombie" }, seed++));
    on(6.4, () => fx.play(effects.pipeBomb, { pos: V(60, 0.05, 30.4), floorY: 0, ceilingY: 4, radius: 3 }, seed++));
    on(6.9, () => show.event({ event: "zone.powered", seed: seed++, t: Math.round(fx.now * 1000), zone: "lobby", on: false }));
    on(9.5, () => show.event({ event: "zone.powered", seed: seed++, t: Math.round(fx.now * 1000), zone: "lobby", on: true }));
    for (let f = 0; f < at(CYCLE); f++) {
      for (const g of plan.get(f) ?? []) g();
      fx.update(DT);
      const st = fx.stats();
      worst = {
        particles: Math.max(worst.particles, st.particles), decals: Math.max(worst.decals, ...[...fx.decalSets.values()].map((d) => d.live / d.capacity)),
        debris: Math.max(worst.debris, fx.breaks.batches.length), rigid: Math.max(worst.rigid, fx.rigid.live), emitters: Math.max(worst.emitters, st.emitters),
      };
      if (f % 40 === 0) look();
    }
    const l = look();
    // (in stats()'s own unit: decimal megabytes)
    const keptMB = ([...fx.decalSets.values()].reduce((a, d) => a + d.keptBytes(), 0) + fx.breaks.kept.gpuBytes() + fx.rigid.kept.gpuBytes()) / 1e6;
    const kept = [...fx.decalSets.values()].reduce((a, d) => a + d.keptCount(), 0);
    perCycle.push({ objects: l.objects, emitters: fx.stats().emitters, gpuMB: fx.stats().gpuMB - keptMB, keptMB, kept });
  }
  show.forgetDoor("reception-decon");
  fx.clear();
  const end = look();
  THREE.BufferGeometry.prototype.dispose = origDispose;
  const leaked = [...seen].filter((u) => !disposed.has(u) && !end.live.has(u));
  const early = perCycle[9], late = perCycle[39];
  ok(worst.particles <= BUDGET.particles && worst.decals <= 1 && worst.debris <= 8, `forty runs of the worst moment (eleven minutes) stay inside every cap (peak ${worst.particles} particles, decal sets ${Math.round(worst.decals * 100)}% full at most, ${worst.debris} debris draws)`);
  ok(late.objects <= early.objects + 2 && late.emitters === early.emitters, `nothing builds up from one run to the next but the marks that last: ${early.objects} → ${late.objects} objects in the room, ${early.emitters} → ${late.emitters} running emitters`);
  // (stats() rounds to 0.1 MB, so two readings can differ by one step with nothing changed)
  ok(late.gpuMB <= early.gpuMB + 0.15, `nor does the effects' memory (no change from the tenth run to the fortieth: ${(late.gpuMB - early.gpuMB).toFixed(1)} MB)`);
  // THE MARKS THAT LAST are kept (Josh: they persist all show), and cost what's in them
  // (they only ever grew until the rooms were given a budget — fx/budget.ts: a show runs for weeks, and a room
  // fought in for days filled without end. A room keeps its newest marks up to the budget and the oldest go: the
  // count climbs, then holds. This check still wanted it to climb for ever.)
  if (process.env.FX_SERIES) console.log("kept series:", perCycle.map((x) => x.kept).join(" "));
  const peak = Math.max(...perCycle.map((x) => x.kept));
  const outs = perCycle.filter((x, i) => i > 0 && x.kept < perCycle[i - 1].kept).length;
  ok(late.kept > perCycle[9].kept && perCycle[9].kept > 0 && outs >= 1 && peak <= 3000 && late.keptMB < 40,
    `every lasting mark pushed out of a live slot, and every door’s wreckage once it’s at rest, is kept with its room up to the room’s budget, oldest out: ${perCycle[9].kept} marks after ten runs of the worst moment, ${late.kept} after forty, never more than ${peak} (the oldest went ${outs} time${outs === 1 ? "" : "s"}), ${late.keptMB.toFixed(1)} MB with the doors’ wreckage`);
  ok(leaked.length === 0, `every bit of geometry that left the room was freed (${seen.size} seen, ${leaked.length} leaked)`);
  ok(lightCount(scene) === lightsAtStart, "and the room's light count never changed");
}

console.log("-- the real props: every anchor names something in its model");
{
  const { PROP_ANCHORS, tapOf } = M;
  const dirP = path.join(ROOT, "assets", "downloads", "survivorz", "props");
  if (!fs.existsSync(dirP)) console.log("   (skipped: the packed props aren't on this machine)");
  else {
    const gltfJson = (id) => { const b = fs.readFileSync(path.join(dirP, `${id}.glb`)); const len = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + len).toString()); };
    const sizes = JSON.parse(fs.readFileSync(path.join(dirP, "props.json"), "utf8"));
    const sizeOf = (id) => (Array.isArray(sizes) ? sizes.find((x) => x.id === id) : sizes[id] ?? sizes.props?.find?.((x) => x.id === id))?.size;
    let missing = [], outside = [];
    for (const [id, a] of Object.entries(PROP_ANCHORS)) {
      if (!fs.existsSync(path.join(dirP, `${id}.glb`))) { missing.push(`${id}.glb`); continue; }
      const j = gltfJson(id);
      const names = new Set([...(j.nodes ?? []).map((n) => n.name), ...(j.meshes ?? []).map((m) => m.name)]);
      // (three names a mesh's node after its glTF node; a multi-primitive mesh's parts get _1, _2)
      for (const n of [...(a.panes ?? []), ...(a.leaves ?? [])]) if (!names.has(n) && !names.has(n.replace(/_\d+$/, ""))) missing.push(`${id}:${n}`);
      const sz = sizeOf(id);
      const pts = [...(a.taps ?? []).flatMap((t) => [t.spout, [t.spout[0], t.basinY, t.spout[2]]]), ...(a.rag ? [a.rag] : [])];
      if (sz) for (const q of pts) if (Math.abs(q[0]) > sz[0] / 2 + 0.01 || q[1] < -0.01 || q[1] > sz[1] + 0.01 || Math.abs(q[2]) > sz[2] / 2 + 0.01) outside.push(`${id}:${q}`);
    }
    ok(missing.length === 0, `every pane and leaf the anchors name is in its model${missing.length ? ": missing " + missing.join(", ") : ""}`);
    ok(outside.length === 0, `every tap, bowl and rag point lies inside its prop's packed size${outside.length ? ": outside " + outside.join(", ") : ""}`);
    const g = new THREE.Group();
    g.position.set(2, 0, -1); g.rotation.y = Math.PI; g.updateMatrixWorld(true);
    const w = tapOf(g, PROP_ANCHORS["sink-steel"].taps[1]);
    ok(Math.abs(w.spout.x - 1.48) < 1e-6 && Math.abs(w.spout.z + 0.923) < 1e-6 && w.basinY === 0.497 && w.spout.y === 0.849,
      "a tap's mouth and bowl follow the sink wherever it stands and however it's turned");
  }
}

console.log("-- determinism of the rng itself");
{
  const r1 = mulberry32(9), r2 = mulberry32(9);
  ok(Array.from({ length: 50 }, r1).join() === Array.from({ length: 50 }, r2).join(), "the same seed gives the same draws");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
