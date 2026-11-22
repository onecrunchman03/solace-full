// SOLACE SURVIVORZ — THE DEAD LIE FLAT (Josh, Nov 14 2026: "when survivors die they need to be laying flat not
// leaning up on from floor"). Every clip a survivor can end a death in, played to its last frame on every survivor
// body, headless: how far the head is over the hips. Lying flat it is at most 0.15 m; propped on the
// hands (the fall a downed survivor is held in) 0.24 m or more. PROPPED_LEAN_M (show/actors.ts) is the line between:
// the show lays down any dead survivor over it. This holds every end pose under the line and the held fall over it.
//
// Run:  node scripts/survivorz/review/lie-flat.mjs [--all]     (exit 1 if an end pose isn't flat, or the held fall reads flat)
import fs from "node:fs";
import path from "node:path";
import { loadBody, boneLike, THREE, STAGE } from "../lib-loadbody.mjs";

const PROPPED_LEAN_M = 0.2;   // (client/src/survivorz/show/actors.ts)
/** what a dead survivor is left in (show/stance.ts + actors.ts): the lying loop's first frame, and the three deaths */
const END = ["mx-laying-breathless", "ual1-death01", "mx-pro-rifle-pack--death-from-the-front", "mx-pro-rifle-pack--death-from-the-back"];
/** for comparison: the fall a downed survivor is held in */
const OTHER = ["mx-falling-down"];
const all = process.argv.includes("--all");
const dir = path.join(STAGE, "game");
if (!fs.existsSync(dir)) { console.log("the bodies aren't on this machine"); process.exit(0); }
const bodies = fs.readdirSync(dir).filter((f) => f.endsWith(".glb") && !f.startsWith("zombie-")).map((f) => f.slice(0, -4));
const want = new Set([...END, ...OTHER]);
let bad = 0;
const rows = [];
for (const body of bodies) {
  const gltf = await loadBody(path.join(dir, `${body}.glb`), (n) => want.has(n));
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  const B = (...n) => { for (const k of n) { const b = boneLike(root, k); if (b) return b; } };
  const head = B("head", "head.x", "Head"), chest = B("spine_03", "spine_03.x", "spine_02", "Spine2"), hips = B("hip", "hips", "pelvis", "root.x", "Hips");
  if (!head || !hips) { console.log(body, "no head or hips bone"); continue; }
  const v = new THREE.Vector3();
  for (const name of [...END, ...OTHER]) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) { rows.push([body, name, "—", "—", "—", ""]); continue; }
    const a = mixer.clipAction(clip); a.reset().play();
    // (the lying loop is held at its first frame; a death at its last)
    a.time = name === "mx-laying-breathless" ? 0 : clip.duration - 1e-3; mixer.update(0); root.updateMatrixWorld(true);
    const h = head.getWorldPosition(v).y, c = chest ? chest.getWorldPosition(v).y : NaN, p = hips.getWorldPosition(v).y;
    a.stop(); mixer.uncacheAction(clip);
    const flat = h - p < PROPPED_LEAN_M, end = END.includes(name);
    // (a body with no head bone the loader can find reads 0: not measured)
    const skip = Math.abs(h) < 0.005;
    if (!skip && (end ? !flat : flat)) bad++;
    rows.push([body, name, h.toFixed(2), c.toFixed(2), p.toFixed(2), skip ? "(no head bone)" : end ? (flat ? "" : "NOT FLAT") : flat ? "THE FALL READS FLAT" : "(propped)"]);
  }
}
for (const r of rows) if (all || r[5]) console.log(r[0].padEnd(20), r[1].padEnd(42), "head", r[2], "chest", r[3], "hips", r[4], r[5]);
console.log(`${bodies.length} bodies, ${END.length} end poses and the held fall: ${bad} on the wrong side of ${PROPPED_LEAN_M} m`);
process.exit(bad ? 1 : 0);
