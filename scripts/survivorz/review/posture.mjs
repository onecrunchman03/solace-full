// SURVIVORZ REVIEW — HOW UPRIGHT A BODY MOVES (Nov 17 2026 — Josh: "when survivors are moving they are hunched over").
//
//   node scripts/survivorz/review/posture.mjs [body ...] [--zombies] [--json out.json]
//
// Plays every walk, jog, run and crouch clip the show uses (stance.ts READY_LOOPS / CALM_LOOPS), headless, on each
// body, and reads the posture in the body's own frame every 1/30 s:
//   trunk  the lean of hips → neck from vertical, forward positive (degrees)
//   neck   the lean of neck → head from vertical, forward positive (degrees)
//   head   how far the head is ahead of the hips (cm)
// Each against the SAME body standing at rest (ual1-idle-loop), so a body built with a forward head reads as itself,
// not as hunched. Prints the mean over the loop and the worst moment. A clip that means to lean (crouching, injured)
// is marked so a reader doesn't mistake it for a fault.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBody, boneLike, THREE, STAGE, ROOT } from "../lib-loadbody.mjs";

const bodiesLib = (await import(pathToFileURL(path.join(ROOT, "scripts", "survivorz", "bodies.cjs")).href)).default;
const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const ZOMBIES = argv.includes("--zombies");
const named = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--json");

const GP = "gp-mx-pistol-handgun-locomotion-pack--pistol-", GR = "gr-mx-pro-rifle-pack--", GS = "gs-mx-pro-rifle-pack--", INJ = "mx-male-injured-pack--injured-";
// [clip, what it is, whether a lean is meant]
const SURVIVOR_CLIPS = [
  ["ual1-idle-loop", "standing (the reference)", false],
  ["ual1-walk-loop", "walk", false],
  ["mx-jogging", "jog", false],
  ["mx-slow-run", "run (slow)", false],
  ["ual1-jog-fwd-loop", "run (old)", false],
  ["ual1-sprint-loop", "sprint", false],
  ["bd-flashlight-walk", "walk, torch", false],
  ["bd-flashlight-jog", "jog, torch", false],
  ["bd-flashlight-slow-run", "run, torch", false],
  ["bd-flashlight-run", "sprint, torch", false],
  [`${GP}walk`, "walk, pistol", false],
  [`${GP}run`, "run, pistol", false],
  [`${GR}walk-forward`, "walk, rifle", false],
  [`${GR}run-forward`, "run, rifle", false],
  [`${GR}sprint-forward`, "sprint, rifle", false],
  [`${GS}walk-forward`, "walk, shotgun", false],
  [`${GS}run-forward`, "run, shotgun", false],
  [`${GS}sprint-forward`, "sprint, shotgun", false],
  [`${INJ}walk`, "walk, injured", true],
  [`${INJ}run`, "run, injured", true],
  ["ual1-crouch-fwd-loop", "crouch walk", true],
  [`${GR}walk-crouching-forward`, "crouch walk, rifle", true],
];

function pickBone(root, names) { for (const n of names) { const b = boneLike(root, n); if (b) return b; } return null; }

async function measure(body, clips) {
  const want = new Set(clips.map((c) => c[0]));
  const gltf = await loadBody(path.join(STAGE, "game", `${body}.glb`), (n) => want.has(n));
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  const B = {
    hip: pickBone(root, ["hip", "pelvis", "root.x", "hips"]),
    neck: pickBone(root, ["neck", "neck.x", "neck_01"]),
    head: pickBone(root, ["head", "head.x"]),
    ua_l: pickBone(root, ["upperarm_l", "arm_stretch.l", "upperarm.l"]),
    ua_r: pickBone(root, ["upperarm_r", "arm_stretch.r", "upperarm.r"]),
  };
  if (Object.values(B).some((b) => !b)) return { body, error: "bones not found: " + Object.entries(B).filter(([, b]) => !b).map(([k]) => k).join(",") };
  const W = (b) => b.getWorldPosition(new THREE.Vector3()), UP = new THREE.Vector3(0, 1, 0);
  const out = {};
  for (const [name, label, leanMeant] of clips) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) { out[name] = { label, missing: true }; continue; }
    const a = mixer.clipAction(clip); a.reset().play();
    const N = Math.max(30, Math.round(clip.duration * 30)), rows = [];
    for (let i = 0; i < N; i++) {
      a.time = (clip.duration * i) / N; mixer.update(0); root.updateMatrixWorld(true);
      const hip = W(B.hip), neck = W(B.neck), head = W(B.head);
      const right = W(B.ua_r).sub(W(B.ua_l)).setY(0).normalize(), fwd = new THREE.Vector3().crossVectors(UP, right);
      const lean = (from, to) => { const d = to.clone().sub(from); return (Math.atan2(d.dot(fwd), d.y) * 180) / Math.PI; };
      rows.push({ trunk: lean(hip, neck), neck: lean(neck, head), head: head.clone().sub(hip).dot(fwd) * 100 });
    }
    a.stop(); mixer.uncacheAction(clip);
    const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length, max = (k) => Math.max(...rows.map((r) => r[k]));
    out[name] = { label, leanMeant, trunk: mean("trunk"), trunkMax: max("trunk"), neck: mean("neck"), head: mean("head"), headMax: max("head") };
  }
  return { body, clips: out };
}

const bodies = named.length ? named : ZOMBIES ? bodiesLib.zombieIds() : bodiesLib.survivorIds();
const results = [];
for (const body of bodies) {
  const r = await measure(body, SURVIVOR_CLIPS);
  results.push(r);
  if (r.error) { console.log(body, r.error); continue; }
  const ref = r.clips["ual1-idle-loop"];
  if (!ref || ref.missing) { console.log(body, "no standing idle to compare with"); continue; }
  console.log(`\n${body}  standing: trunk ${ref.trunk.toFixed(1)}°  neck ${ref.neck.toFixed(1)}°  head ${ref.head.toFixed(1)} cm ahead of the hips`);
  console.log(`  ${"clip".padEnd(22)} ${"trunk +°".padStart(9)} ${"worst".padStart(6)} ${"neck +°".padStart(8)} ${"head +cm".padStart(9)} ${"worst".padStart(6)}`);
  for (const [name] of SURVIVOR_CLIPS.slice(1)) {
    const c = r.clips[name];
    if (c.missing) { console.log(`  ${c.label.padEnd(22)} (not on this body)`); continue; }
    const f = (v) => (v >= 0 ? "+" : "") + v.toFixed(1);
    console.log(`  ${c.label.padEnd(22)} ${f(c.trunk - ref.trunk).padStart(9)} ${f(c.trunkMax - ref.trunk).padStart(6)} ${f(c.neck - ref.neck).padStart(8)} ${f(c.head - ref.head).padStart(9)} ${f(c.headMax - ref.head).padStart(6)}${c.leanMeant ? "   (meant to lean)" : ""}`);
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
