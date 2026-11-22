// SURVIVORZ: STAND UP STRAIGHT (Nov 17 2026 — Josh: "when survivors are moving they are hunched over").
//
// Measured on all 19 bodies (review/posture.mjs), against the same body standing: the walk is upright, but the
// jog's head hangs 15° further forward than its chest, the slow run leans 13° with the head down another 10°,
// the sprint is bent 29° over for its whole loop (a real sprinter leans that far for the first two strides and
// runs at 10-15°), and the armed walks bow the head 17-19° to the gun. It is the same on every body: it is in the
// recordings, not the bodies.
//
// The fix, per clip: the clip's MEAN excess over a cap is taken off at every moment as one constant turn — the
// trunk turned back about the body's own left-right axis (shared up spine_01/02/03), then the head lifted on the
// neck — so the stride's own rise and fall is kept, nothing is flattened. The hips and legs are untouched (the feet
// land where they did), the arms ride the chest as they always did. Caps are against the body's own standing pose
// (ual1-idle-loop): a body built with its head forward reads as itself, not as hunched.
//
// The trunk is left alone on a gun clip: the gun hangs off the hands, and turning the chest would turn the barrel.
// Only its head comes up. Crouching and injured clips are not listed: their lean is the point.
//
// Run after the build, before the pack (bake.mjs "posture"). It works from where the clip is now, so a second run
// finds nothing to do.
//   node scripts/survivorz/anim-posture.mjs <body> [--dry]     then: pack, anim-clip, and the checks
import fs from "node:fs";
import path from "node:path";
import { loadBody, boneLike, THREE, STAGE } from "./lib-loadbody.mjs";

const body = process.argv[2];
const dry = process.argv.includes("--dry");
if (!body) throw new Error("usage: anim-posture.mjs <body> [--dry]");
if (/^zombie-/.test(body)) { console.log(`${body}: a zombie (its hunch is the point) — nothing to do`); process.exit(0); }
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const OUT = path.join(STAGE, "out", job.out);

const GP = "gp-mx-pistol-handgun-locomotion-pack--pistol-", GR = "gr-mx-pro-rifle-pack--", GS = "gs-mx-pro-rifle-pack--";
// clip → [trunk cap, head cap] in degrees past standing; null trunk = leave the trunk (a gun clip)
export const POSTURE = {
  "mx-jogging": [8, 4], "bd-flashlight-jog": [8, 4],
  "mx-slow-run": [9, 4], "bd-flashlight-slow-run": [9, 4],
  "ual1-jog-fwd-loop": [10, 4], "bd-flashlight-run": [10, 4],
  "ual1-sprint-loop": [15, 4],
  [`${GP}walk`]: [null, 4], [`${GP}run`]: [null, 4],
  [`${GR}walk-forward`]: [null, 4], [`${GR}run-forward`]: [null, 4], [`${GR}sprint-forward`]: [null, 4],
  [`${GS}walk-forward`]: [null, 4], [`${GS}run-forward`]: [null, 4], [`${GS}sprint-forward`]: [null, 4],
};
const TRUNK_SHARE = { spine_01: 0.25, spine_02: 0.35, spine_03: 0.4 }, HEAD_SHARE = { neck: 1 };

const gltf = await loadBody(path.join(STAGE, "game", `${body}.glb`), () => false);
const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
const pick = (n) => boneLike(root, n);
const B = { hip: pick("hip"), spine_01: pick("spine_01"), spine_02: pick("spine_02"), spine_03: pick("spine_03"), neck: pick("neck"), head: pick("head"), ua_l: pick("upperarm_l"), ua_r: pick("upperarm_r") };
const lost = Object.entries(B).filter(([, b]) => !b).map(([k]) => k);
if (lost.length) throw new Error(`${body}: no ${lost.join(", ")}`);
const UP = new THREE.Vector3(0, 1, 0), W = (b) => b.getWorldPosition(new THREE.Vector3());
const read = (n) => JSON.parse(fs.readFileSync(path.join(OUT, `${n}.json`), "utf8"));

/** the body's own frame this moment: right (left→right, level) and forward */
function frame() {
  const right = W(B.ua_r).sub(W(B.ua_l)).setY(0).normalize();
  return { right, fwd: new THREE.Vector3().crossVectors(UP, right) };
}
const leanOf = (from, to, fwd) => { const d = to.clone().sub(from); return (Math.atan2(d.dot(fwd), d.y) * 180) / Math.PI; };
function measureNow() {
  const { right, fwd } = frame();
  return { right, trunk: leanOf(W(B.hip), W(B.neck), fwd), neck: leanOf(W(B.neck), W(B.head), fwd) };
}

/** play a clip (its out/ JSON) and call fn at each of the given times */
function each(j, times, fn) {
  const clip = THREE.AnimationClip.parse(j), a = mixer.clipAction(clip);
  a.reset().play();
  for (let i = 0; i < times.length; i++) { a.time = Math.min(times[i], clip.duration - 1e-5); mixer.update(0); root.updateMatrixWorld(true); fn(i, times[i]); }
  a.stop(); mixer.uncacheAction(clip); mixer.uncacheClip(clip);
}
const trackOf = (j, bone) => j.tracks.find((t) => t.name === `${bone.name}.quaternion`);

// ---- standing: the reference
const idle = read("ual1-idle-loop");
let stand = { trunk: 0, neck: 0 }, n0 = 0;
each(idle, Array.from({ length: 30 }, (_, i) => (idle.duration * i) / 30), () => { const m = measureNow(); stand.trunk += m.trunk; stand.neck += m.neck; n0++; });
stand = { trunk: stand.trunk / n0, neck: stand.neck / n0 };

// THE PLAYER DOESN'T RE-APPLY A TRACK THAT DOESN'T CHANGE (found on the sprint, whose spine_01 holds one value the
// whole loop): a turn left on a bone carried into the next moment and piled up, 3.4° a frame. So every turn made to
// measure or to write is undone before the next moment is posed.
const EDIT = ["spine_01", "spine_02", "spine_03", "neck"];
/** turn the trunk back by a and the head up by b (degrees) on the pose as it stands; returns an undo */
function turn(a, b) {
  const saved = EDIT.map((k) => B[k].quaternion.clone());
  const { right } = measureNow();
  const R = new THREE.Quaternion(), pw = new THREE.Quaternion(), bw = new THREE.Quaternion();
  for (const k of EDIT) {
    const deg = k in TRUNK_SHARE ? a * TRUNK_SHARE[k] : b * (HEAD_SHARE[k] ?? 0);
    if (!deg) continue;
    R.setFromAxisAngle(right, (deg * Math.PI) / 180);   // (+ about "right" turns up toward the back)
    B[k].getWorldQuaternion(bw); B[k].parent.getWorldQuaternion(pw);
    B[k].quaternion.copy(pw.clone().invert().multiply(R.clone().multiply(bw)));
    B[k].updateMatrixWorld(true);
  }
  return () => { EDIT.forEach((k, i) => B[k].quaternion.copy(saved[i])); root.updateMatrixWorld(true); };
}
/** the clip's mean trunk and head lean (past standing) at the probe moments, with a and b applied */
function meanWith(j, probe, a, b) {
  let tr = 0, rel = 0;
  each(j, probe, () => { const undo = turn(a, b); const m = measureNow(); tr += m.trunk - stand.trunk; rel += (m.neck - stand.neck) - (m.trunk - stand.trunk); undo(); });
  return { tr: tr / probe.length, rel: rel / probe.length };
}

let changed = 0;
for (const [name, [trunkCap, headCap]] of Object.entries(POSTURE)) {
  const f = path.join(OUT, `${name}.json`);
  if (!fs.existsSync(f)) { console.log(`  ${name}: not on this body`); continue; }
  const j = read(name);
  // the clip's own lean, on average over the loop
  const probe = Array.from({ length: 30 }, (_, i) => (j.duration * i) / 30);
  const m0 = meanWith(j, probe, 0, 0);
  // THE TRUNK: the hips-to-neck line answers about half a turn of the spine (the turns are made at the spine's own
  // joints, above the hips), so the turn that brings it to the cap is FOUND, not assumed
  let a = 0;
  if (trunkCap != null && m0.tr - trunkCap > 0.5) {
    let lo = 0, hi = 4 * (m0.tr - trunkCap);
    for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (meanWith(j, probe, mid, 0).tr > trunkCap) lo = mid; else hi = mid; }
    a = (lo + hi) / 2;
  }
  // THE HEAD: after the trunk's turn, lifted on the neck to the cap — or, if the trunk's turn tipped it back past
  // level, brought forward to level (the neck's own turn moves the neck-to-head line one for one)
  const ma = a ? meanWith(j, probe, a, 0) : m0;
  const b = ma.rel > headCap ? ma.rel - headCap : ma.rel < -2 ? ma.rel : 0;
  if (a < 0.5 && Math.abs(b) < 0.5) { console.log(`  ${name}: trunk +${m0.tr.toFixed(1)}°, head +${m0.rel.toFixed(1)}° — upright enough`); continue; }
  // every key of every bone we turn: the clip's own times on those tracks
  const bones = EDIT.filter((k) => (k in TRUNK_SHARE ? a >= 0.5 : Math.abs(b) >= 0.5));
  const tracks = Object.fromEntries(bones.map((k) => [k, trackOf(j, B[k])]));
  const missing = bones.filter((k) => !tracks[k]);
  if (missing.length) { console.log(`  ${name}: no track for ${missing.join(", ")} — skipped`); continue; }
  const times = [...new Set(bones.flatMap((k) => Array.from(tracks[k].times)))].sort((x, y) => x - y);
  const newLocal = Object.fromEntries(bones.map((k) => [k, new Map()]));
  each(j, times, (i, t) => {
    const undo = turn(a >= 0.5 ? a : 0, Math.abs(b) >= 0.5 ? b : 0);
    for (const k of bones) newLocal[k].set(t, B[k].quaternion.clone());
    undo();
  });
  for (const k of bones) {
    const trk = tracks[k];
    for (let i = 0; i < trk.times.length; i++) {
      const q = newLocal[k].get(trk.times[i]);
      trk.values[i * 4] = +q.x.toFixed(6); trk.values[i * 4 + 1] = +q.y.toFixed(6); trk.values[i * 4 + 2] = +q.z.toFixed(6); trk.values[i * 4 + 3] = +q.w.toFixed(6);
    }
  }
  const after = meanWith(j, probe, 0, 0);
  j.posture = { trunkBack: +a.toFixed(1), headUp: +b.toFixed(1), at: new Date().toISOString().slice(0, 10) };
  if (!dry) fs.writeFileSync(f + ".tmp", JSON.stringify(j)), fs.renameSync(f + ".tmp", f);
  changed++;
  console.log(`  ${name}: trunk +${m0.tr.toFixed(1)}° → +${after.tr.toFixed(1)}°, head +${m0.rel.toFixed(1)}° → +${after.rel.toFixed(1)}° (spine back ${a.toFixed(1)}°, neck up ${b.toFixed(1)}°)`);
}
console.log(`${body}: ${changed} clips stood up${dry ? " (dry run, nothing written)" : ""} — standing trunk ${stand.trunk.toFixed(1)}°, neck ${stand.neck.toFixed(1)}°`);
