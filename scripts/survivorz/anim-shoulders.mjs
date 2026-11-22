// SURVIVORZ: THE SHOULDERS COME DOWN (realism round 14, Nov 2026 — Josh: "survivor shoulders are arched back
// especially when they run"). The Universal Animation Library's clips (ual1-, ual2-) were made on the UE
// mannequin, whose collarbones sit low inside a broad back and hardly move. The retarget copies each bone's
// DIRECTION, so on a scanned body — collarbone joints higher, closer to the neck — those same directions hike
// both shoulders up: measured in the chest's own frame (spine_03) on Eric, the upper arm's root sits 7.6-9.4 cm
// above the collarbone joint in every UAL clip and -3 to +3 cm in the Mixamo ones on the same body; 9-12 cm up
// in the pistol set. With the forward lean of a run it reads as a hunched back with the shoulders up round the
// ears — and the idle, the walk, the jog, the sprint, the flashlight run and every move built on them carry it.
//
// The fix, per body: R = the turn (in the chest's frame) from where the UAL clips hold the collarbone, on
// average, to where the Mixamo clips do; every UAL clip's collarbone turned by R, and the upper arm under it
// turned back by the same amount at each moment, so the arm still points exactly where the clip had it — the
// shoulder comes down a few centimetres, the elbows and hands follow it down, nothing swings. A clip's own
// shoulder motion (a shrug, a reach) is kept: R is one turn for the whole family, not a flattening.
//
// Run after the retarget and before the pack (bake.mjs "shoulders"); each clip is marked, so it runs once.
//   node scripts/survivorz/anim-shoulders.mjs <body> [--dry]     then: pack, and the steps after it
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2];
const dry = process.argv.includes("--dry");
if (!body) throw new Error("usage: anim-shoulders.mjs <body> [--dry]");
if (/^zombie-/.test(body)) { console.log(`${body}: a zombie (its hunch is the point) — nothing to do`); process.exit(0); }
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const OUT = path.join(STAGE, "out", job.out);

// ---- the upper arm's place under the collarbone, from the body's own rest (the target the clips were baked onto)
function gltfNodes(file) {
  const f = path.join(ROOT, file.replace(/^\//, ""));
  if (/\.glb$/i.test(f)) {
    const b = fs.readFileSync(f), len = b.readUInt32LE(12);
    return JSON.parse(b.subarray(20, 20 + len).toString("utf8")).nodes;
  }
  return JSON.parse(fs.readFileSync(f, "utf8")).nodes;
}
const nodes = gltfNodes(job.target);
// (a Renderpeople ANIMATED target prefixes every bone: rp_<who>_animated_00N_<take>_upperarm_l)
const node = (n) => nodes.find((x) => x.name === n) ?? nodes.find((x) => x.name?.endsWith("_" + n) && /^rp_/.test(x.name));
const tip = {};
for (const s of ["l", "r"]) {
  const t = node(`upperarm_${s}`)?.translation;
  if (!t) throw new Error(`${body}: no upperarm_${s} in ${job.target}`);
  const n = Math.hypot(...t);
  tip[s] = t.map((v) => v / n);
}

// ---- quaternions [x, y, z, w]
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n); };
const rot = (q, v) => { const r = qmul(qmul(q, [...v, 0]), qinv(q)); return [r[0], r[1], r[2]]; };
function fromTo(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b; d = Math.abs(d);
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s);
}
const keyAt = (tr, i) => [tr.values[i * 4], tr.values[i * 4 + 1], tr.values[i * 4 + 2], tr.values[i * 4 + 3]];
function sample(tr, t) {
  const T = tr.times;
  if (t <= T[0]) return keyAt(tr, 0);
  if (t >= T[T.length - 1]) return keyAt(tr, T.length - 1);
  let i = 1; while (T[i] < t) i++;
  return slerp(keyAt(tr, i - 1), keyAt(tr, i), (t - T[i - 1]) / (T[i] - T[i - 1]));
}
// (a Renderpeople body's tracks carry its rig prefix too: rp_<who>_animated_00N_<take>_shoulder_l.quaternion)
const track = (j, bone) => j.tracks.find((t) => t.name === `${bone}.quaternion`)
  ?? j.tracks.find((t) => /^rp_/.test(t.name) && t.name.endsWith(`_${bone}.quaternion`));

// ---- where each family holds the collarbone, on average (the upper arm's root, in the chest's frame)
const SKIP = /zombie|^(fz|zd|zv|hw|fza)-/;
const UAL = /^ual[12]-/;
const clips = fs.readdirSync(OUT).filter((f) => f.endsWith(".json") && !SKIP.test(f)).map((f) => f.slice(0, -5));
const read = (n) => JSON.parse(fs.readFileSync(path.join(OUT, `${n}.json`), "utf8"));
function meanTip(names, s) {
  const acc = [0, 0, 0]; let k = 0;
  for (const n of names) {
    const tr = track(read(n), `shoulder_${s}`); if (!tr) continue;
    for (let i = 0; i < tr.times.length; i++) { const v = rot(keyAt(tr, i), tip[s]); acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]; k++; }
  }
  if (!k) return null;
  const n = Math.hypot(...acc); return acc.map((v) => v / n);
}
const mx = clips.filter((n) => /^mx-/.test(n));
const todo = clips.filter((n) => UAL.test(n)).filter((n) => !read(n).shoulders);
if (!todo.length) { console.log(`${body}: the UAL shoulders are down already`); process.exit(0); }
if (mx.length < 10) throw new Error(`${body}: only ${mx.length} Mixamo clips to measure the shoulders against`);
const R = {};
for (const s of ["l", "r"]) {
  const want = meanTip(mx, s), have = meanTip(todo, s);
  R[s] = fromTo(have, want);
  const deg = (2 * Math.acos(Math.min(1, Math.abs(R[s][3]))) * 180) / Math.PI;
  console.log(`${body} shoulder_${s}: UAL ${have.map((v) => v.toFixed(2))} → Mixamo ${want.map((v) => v.toFixed(2))} (${deg.toFixed(1)}°)`);
}

// ---- turn the collarbone, hand the turn back to the upper arm so the arm points where it did
let fixed = 0;
for (const n of todo) {
  const j = read(n);
  for (const s of ["l", "r"]) {
    const sh = track(j, `shoulder_${s}`), ua = track(j, `upperarm_${s}`);
    if (!sh || !ua) continue;
    const before = JSON.parse(JSON.stringify(sh));
    for (let i = 0; i < sh.times.length; i++) {
      const q = qnorm(qmul(R[s], keyAt(sh, i)));
      for (let c = 0; c < 4; c++) sh.values[i * 4 + c] = +q[c].toFixed(5);
    }
    for (let i = 0; i < ua.times.length; i++) {
      const t = ua.times[i], q0 = sample(before, t), q1 = sample(sh, t);
      const q = qnorm(qmul(qmul(qinv(q1), q0), keyAt(ua, i)));
      for (let c = 0; c < 4; c++) ua.values[i * 4 + c] = +q[c].toFixed(5);
    }
  }
  j.shoulders = 1;
  if (!dry) fs.writeFileSync(path.join(OUT, `${n}.json`), JSON.stringify(j));
  fixed++;
}
console.log(`${body}: ${fixed} UAL clips with the shoulders brought down${dry ? " (dry run, nothing written)" : ""}`);
