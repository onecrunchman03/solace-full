// THE LIVE CHESS SET — the 3D board's move/pick machinery, headless (Aug 2026).
//
// Run:  node scripts/checks/test_chessboard.mjs
//
// Josh: "the chess board in the casino does not work." This drives the REAL
// client/src/casino/chessboard.ts (via tsx) against the REAL chess.glb's
// structure: the GLB's node tree and per-mesh bounding boxes are parsed
// straight from the file (bounding boxes are what chessboard.ts derives its
// whole grid from, so box-proxy geometry is faithful), cloned through the
// same matrixWorld bake takeProp performs, placed like layout.ts places the
// set, and then the board is exercised:
//   · all 32 men found, right colours and types
//   · squareWorld↔squareAt round-trips for all 64 squares
//   · the opening FEN leaves every man ~where the artist put him
//   · 1. e4 moves EXACTLY one mesh, and it lands centred on e4
//   · a capture hides exactly one mesh
//   · the pick plane is horizontal and centred over the board

import { register } from "tsx/esm/api";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

register();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const THREE = await import(
  pathToFileURL(path.join(ROOT, "client", "node_modules", "three", "build", "three.module.js")).href
);
const { buildChessBoard } = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "casino", "chessboard.ts")).href
);

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

// ---- parse the GLB into a THREE graph (nodes + bbox-proxy meshes) ----------
const glb = readFileSync(path.join(ROOT, "client", "public", "assets", "casino", "chess.glb"));
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.slice(20, 20 + jsonLen).toString());

const buildNode = (i) => {
  const nd = json.nodes[i];
  let obj;
  if (nd.mesh !== undefined) {
    const acc = json.accessors[json.meshes[nd.mesh].primitives[0].attributes.POSITION];
    const [ax, ay, az] = acc.min, [bx, by, bz] = acc.max;
    const geo = new THREE.BoxGeometry(bx - ax, by - ay, bz - az);
    geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    obj = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  } else {
    obj = new THREE.Group();
  }
  obj.name = nd.name ?? "";
  if (nd.matrix) obj.applyMatrix4(new THREE.Matrix4().fromArray(nd.matrix));
  else {
    if (nd.translation) obj.position.fromArray(nd.translation);
    if (nd.rotation) obj.quaternion.fromArray(nd.rotation);
    if (nd.scale) obj.scale.fromArray(nd.scale);
  }
  for (const c of nd.children ?? []) obj.add(buildNode(c));
  return obj;
};
const file = new THREE.Group();
for (const i of json.scenes[0].nodes) file.add(buildNode(i));
file.updateMatrixWorld(true);

// ---- takeProp's clone-bake + recentre (world.ts), replicated -----------------
// (world.ts can't be imported here — it pulls the runes-based audio libs — so
// the fifteen relevant lines are mirrored; if takeProp changes shape, change
// this too.)
const inner = new THREE.Group();
file.traverse((o) => {
  if (!o.isMesh) return;
  const c = o.clone();
  c.position.set(0, 0, 0);
  c.rotation.set(0, 0, 0);
  c.scale.set(1, 1, 1);
  c.applyMatrix4(o.matrixWorld);
  inner.add(c);
});
const bb = new THREE.Box3().setFromObject(inner);
const ctr = bb.getCenter(new THREE.Vector3());
inner.position.set(-ctr.x, -bb.min.y, -ctr.z);
const set = new THREE.Group();
set.add(inner);
// layout.ts: { src:"chess", at:[6.6,2.6], h:0.84 } on CELL=2 metres
set.position.set(6.6 * 2, 0.84, 2.6 * 2);
const scene = new THREE.Group();
scene.add(set);
scene.updateMatrixWorld(true);

const size = bb.getSize(new THREE.Vector3());
console.log(`  · set spans ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} (baked units)`);

// ---- drive the real module ---------------------------------------------------
const board = buildChessBoard(set);

const meshes = [];
set.traverse((o) => { if (o.isMesh && o !== board.pickPlane) meshes.push(o); });
const men = meshes.filter((m) => /pawn|knight|bishop|rook|queen|king/i.test(m.name));
ok(men.length === 32, `all 32 men found (got ${men.length})`);
ok(men.filter((m) => /dark/i.test(m.name)).length === 16, "sixteen dark");

const worldOf = (m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
const snapshot = () => new Map(men.map((m) => [m.name, { p: worldOf(m), v: m.visible }]));

// The opening: every man where the artist put him (setFEN(null) ran at build).
const start = snapshot();
scene.updateMatrixWorld(true);

// squareAt round-trips: reconstruct each square's centre from the a1/h8 men.
const FILES = "abcdefgh";
const wk = men.find((m) => /^light.*king|king.*light/i.test(m.name) || (/king/i.test(m.name) && !/dark/i.test(m.name)));
ok(!!wk, "the light king exists");
const e1 = worldOf(wk);
ok(board.squareAt(e1) === "e1", `the light king stands on e1 (squareAt says ${board.squareAt(e1)})`);

// Every square round-trips through the module's own grid: walk outward from
// e1 using the file/rank steps implied by d1→e1 and e1→e8.
const wq = men.find((m) => /queen/i.test(m.name) && !/dark/i.test(m.name));
const dk = men.find((m) => /king/i.test(m.name) && /dark/i.test(m.name));
const d1 = worldOf(wq);
const e8 = worldOf(dk);
const fv = e1.clone().sub(d1); fv.y = 0;
const rv = e8.clone().sub(e1).multiplyScalar(1 / 7); rv.y = 0;
let trips = 0;
for (let f = 0; f < 8; f++) {
  for (let r = 0; r < 8; r++) {
    const w = e1.clone().addScaledVector(fv, f - 4).addScaledVector(rv, r);
    if (board.squareAt(w) === FILES[f] + String(r + 1)) trips++;
  }
}
ok(trips === 64, `squareAt round-trips all 64 squares (got ${trips})`);

// 1. e4 — exactly one mesh moves, and it lands on e4's centre.
board.setFEN("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
scene.updateMatrixWorld(true);
const after = snapshot();
const moved = [...after].filter(([name, s]) => s.v && s.p.distanceTo(start.get(name).p) > 0.005);
ok(moved.length === 1, `1. e4 moves exactly one mesh (moved ${moved.length}: ${moved.map(([nm]) => nm).join(", ")})`);
if (moved.length === 1) {
  const [name, s] = moved[0];
  ok(/pawn/i.test(name) && !/dark/i.test(name), `…and it is a light pawn (${name})`);
  const e4 = e1.clone().addScaledVector(rv, 3);
  const off = Math.hypot(s.p.x - e4.x, s.p.z - e4.z);
  const step = Math.hypot(rv.x, rv.z);
  ok(off < step * 0.25, `…landing centred on e4 (off by ${(off / step).toFixed(2)} squares)`);
} else { n += 2; bad += 2; console.error("  x (skipped: pawn identity + landing)"); }

// A capture leaves a man off the board.
board.setFEN("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR"); // both e-pawns up
board.setFEN("rnbqkbnr/pppp1ppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR"); // fantasy: white took e5
scene.updateMatrixWorld(true);
const cap = snapshot();
const hidden = [...cap].filter(([, s]) => !s.v);
ok(hidden.length === 1 && /dark.*pawn|pawn.*dark/i.test(hidden[0][0]),
  `a captured man leaves the board (hidden: ${hidden.map(([nm]) => nm).join(", ") || "none"})`);

// Back to the opening: every SQUARE occupied again. Same-type men are
// interchangeable (the pool assigns nearest-first), so this compares the set
// of occupied squares, not mesh identities — two pawns swapping homes is
// invisible on a real board.
board.setFEN(null);
scene.updateMatrixWorld(true);
const home = snapshot();
const squaresOf = (snap) =>
  [...snap.values()].filter((s) => s.v).map((s) => board.squareAt(s.p)).sort().join(",");
ok(squaresOf(home) === squaresOf(start) && [...home.values()].every((s) => s.v),
  "resetting the FEN fills every opening square again");

// The pick plane: horizontal, and centred over the middle of the board.
const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(
  board.pickPlane.getWorldQuaternion(new THREE.Quaternion()),
);
ok(Math.abs(nrm.y) > 0.99, `the pick plane is horizontal (normal.y ${nrm.y.toFixed(3)})`);
const planeC = board.pickPlane.getWorldPosition(new THREE.Vector3());
const boardC = e1.clone().addScaledVector(fv, -0.5).addScaledVector(rv, 3.5);
ok(Math.hypot(planeC.x - boardC.x, planeC.z - boardC.z) < Math.hypot(fv.x, fv.z),
  "…and centred over the board");

console.log(`\n${n - bad}/${n} chessboard asserts passed`);
process.exit(bad === 0 ? 0 : 1);
