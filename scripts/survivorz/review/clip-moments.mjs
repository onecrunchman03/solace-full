// SURVIVORZ REVIEW — WHEN EACH ACTION CLIP MAKES ITS CONTACT (RUBRIC.md D8: a sound lands with what you see).
//
//   node scripts/survivorz/review/clip-moments.mjs [survivorBody=eric] [zombieBody=zombie-m01]
//
// The show starts an action's clip and its sound on the same event. This plays each one-shot clip headless on a
// body and prints the moments a sound belongs to: the fastest instant of the striking hand (a swing's whoosh, a
// blow's contact), when the hips first reach the floor (a fall's thud), when a hand first reaches out (a box, a
// door), beside what the sim allows (a weapon's wind-up before its hit event) and what the cue table plays when.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBody, boneLike, THREE, STAGE, ROOT } from "../lib-loadbody.mjs";

const [sBody = "eric", zBody = "zombie-m01"] = process.argv.slice(2);
const SURV = [
  "hd-crowbar-ual2-sword-regular-a", "hd-crowbar-ual2-sword-regular-b", "hd-crowbar-mx-standing-melee-attack-downward", "hd-pipe-ual2-sword-regular-a",
  "hd-knife-mx-stabbing", "hd-axe-ual2-treechopping-loop", "ual1-punch-jab", "ual1-punch-cross", "mx-stomp",
  "mx-falling-down", "ual1-death01", "mx-pro-rifle-pack--death-from-the-front", "mx-pro-rifle-pack--death-from-the-back",
  "ual2-chest-open", "bd-can", "mx-door-opening", "gp-ual1-pistol-reload", "gr-mx-reloading", "bd-shotgun-load", "ual1-hit-chest", "mx-push",
];
const ZED = ["mx-zombie-attack", "mx-zombie-attack-1", "mx-zombie-death", "mx-zombie-dying", "mx-zombie-reaction-hit"];

async function measure(body, clips) {
  const gltf = await loadBody(path.join(STAGE, "game", `${body}.glb`), (n) => clips.includes(n));
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  const pick = (...names) => { for (const n of names) { const b = boneLike(root, n); if (b) return b; } return null; };
  const hands = [pick("hand_r", "hand.r"), pick("hand_l", "hand.l")], hip = pick("hip", "pelvis", "root.x", "hips"), feet = [pick("foot_r", "foot.r"), pick("foot_l", "foot.l")];
  const out = [];
  for (const name of clips) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) { out.push({ name, missing: true }); continue; }
    const a = mixer.clipAction(clip); a.reset().play();
    const N = Math.max(40, Math.round(clip.duration * 60)), dt = clip.duration / N;
    const P = { h0: [], h1: [], hip: [], f0: [], f1: [] };
    for (let i = 0; i <= N; i++) {
      a.time = Math.min(clip.duration - 1e-4, i * dt); mixer.update(0); root.updateMatrixWorld(true);
      const w = (b) => (b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());
      P.h0.push(w(hands[0])); P.h1.push(w(hands[1])); P.hip.push(w(hip)); P.f0.push(w(feet[0])); P.f1.push(w(feet[1]));
    }
    a.stop(); mixer.uncacheAction(clip);
    // the hands' speed relative to the hips (the body's own travel left out)
    const rel = (Q, i) => Q[i].clone().sub(P.hip[i]);
    const speed = (Q) => Q.map((_, i) => (i ? rel(Q, i).distanceTo(rel(Q, i - 1)) / dt : 0));
    const v0 = speed(P.h0), v1 = speed(P.h1);
    const peak = (v) => { let m = 0, at = 0; v.forEach((x, i) => { if (x > m) { m = x; at = i; } }); return { v: m, t: at * dt }; };
    const p0 = peak(v0), p1 = peak(v1);
    const hand = p0.v >= p1.v ? p0 : p1;
    // the hips: where they start, their lowest, and when they first come within 12% of the drop of it
    const hy = P.hip.map((p) => p.y), top = hy[0], low = Math.min(...hy), drop = top - low;
    const floorI = drop > 0.25 ? hy.findIndex((y) => y <= low + drop * 0.12) : -1;
    // a foot coming down hard (a stomp): the lowest point after the highest lift
    const fy = P.f0.map((p, i) => Math.min(p.y, P.f1[i].y));
    out.push({ name, dur: clip.duration, handPeakT: hand.t, handPeakV: hand.v, hipDrop: drop, floorT: floorI >= 0 ? floorI * dt : null, footLow: Math.min(...fy) });
  }
  return out;
}
const { MELEE } = await import(pathToFileURL(path.join(ROOT, "dist", "survivorz", "sim", "tables.js")).href).catch(() => ({ MELEE: null }));
const f = (x) => (x == null ? "  -  " : x.toFixed(2).padStart(5));
for (const [body, clips] of [[sBody, SURV], [zBody, ZED]]) {
  console.log(`\n${body}`);
  console.log("clip".padEnd(48) + " length  hand fastest (m/s)   hips reach floor  hips drop");
  for (const r of await measure(body, clips)) console.log(r.missing ? `${r.name.padEnd(48)} (not on this body)` : `${r.name.padEnd(48)} ${f(r.dur)}s  ${f(r.handPeakT)}s (${r.handPeakV.toFixed(1).padStart(4)})        ${f(r.floorT)}s          ${f(r.hipDrop)}m`);
}
if (MELEE) { console.log("\nthe sim: a hit event comes this long after its swing event"); for (const [k, m] of Object.entries(MELEE)) console.log(`  ${k.padEnd(8)} ${m.windup} ms${m.heavy ? " (heavy)" : ""}`); }
