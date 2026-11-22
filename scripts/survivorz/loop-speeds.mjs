// SOLACE SURVIVORZ — THE LOOPS' GROUND SPEEDS, MEASURED HEADLESS (realism round 10, Nov 2026).
//
// The show plays a locomotion loop in place and speeds it to match the body (actors.ts measureSpeed: the loop's
// "natural" ground speed). calib-loops.mjs finds that number in a running show, in a browser, for the bodies in
// the cast — which a body fresh out of the character creator's bake never is. This finds the same number in plain
// Node (lib-loadbody.mjs, the bake's own loader): the body is driven down a straight line at a fixed speed with the
// loop forced, and a golden-section search finds the natural speed that leaves the ball of the planted foot
// stillest between planting and lifting — calib-loops.mjs's measure, without the show around it.
//
//   node scripts/survivorz/loop-speeds.mjs <body> [<body> …] [--dir <game dir>] [--out <file>] [--check]
//
// --out writes { clip: { body: speed } } (merged into an existing file); --check compares against
// client/src/survivorz/show/loopspeed.json (the browser's numbers) and prints how far off each is.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { THREE, ROOT, STAGE, loadBody, boneLike } from "./lib-loadbody.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flags = new Set(["--dir", "--out"]);
const bodies = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]));
const DIR = opt("--dir", path.join(STAGE, "game"));
const OUT = opt("--out", "");
const CHECK = args.includes("--check");

const GP = "gp-mx-pistol-handgun-locomotion-pack--pistol-", GR = "gr-mx-pro-rifle-pack--", GS = "gs-mx-pro-rifle-pack--";
/** [clip, the test speed (m/s), whose bodies] — calib-loops.mjs's list */
export const JOBS = [
  ["ual1-walk-loop", 1.3, "survivor"], ["ual1-jog-fwd-loop", 2.6, "survivor"], ["mx-jogging", 2.6, "survivor"], ["mx-slow-run", 3.2, "survivor"], ["ual1-sprint-loop", 4.5, "survivor"],
  ["mx-male-injured-pack--injured-walk", 0.9, "survivor"], ["mx-male-injured-pack--injured-run", 2.2, "survivor"],
  ["ual1-crouch-fwd-loop", 0.7, "survivor"], ["bd-flashlight-walk", 1.2, "survivor"], ["bd-flashlight-run", 2.6, "survivor"], ["bd-flashlight-jog", 2.4, "survivor"], ["bd-flashlight-slow-run", 3.2, "survivor"],
  [`${GP}walk`, 1.2, "survivor"], [`${GP}run`, 2.6, "survivor"],
  [`${GR}walk-forward`, 1.2, "survivor"], [`${GR}run-forward`, 2.6, "survivor"], [`${GR}sprint-forward`, 4.5, "survivor"],
  [`${GS}walk-forward`, 1.2, "survivor"], [`${GS}run-forward`, 2.6, "survivor"],
];

const HZ = 120, WARM_S = 1.0, RUN_S = 5.0;

/** the median slide of the planted ball per step, driving `body` at `v` m/s with `clip` at natural speed `nat` */
function trial(g, clip, v, nat) {
  const scene = g.scene;
  const root = new THREE.Group(); root.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = v / nat; a.play();
  const balls = ["l", "r"].map((k) => boneLike(scene, `ball_${k}`) ?? boneLike(scene, `toes_01.${k}`) ?? boneLike(scene, `foot_${k}`));
  const st = balls.map(() => ({ lo: 1, on: null }));
  const steps = [];
  const p = new THREE.Vector3(), dt = 1 / HZ;
  for (let i = 0; i < (WARM_S + RUN_S) * HZ; i++) {
    const t = i * dt;
    root.position.set(0, 0, v * t);
    mixer.update(i === 0 ? 0 : dt);
    root.updateMatrixWorld(true);
    if (t < WARM_S) continue;
    balls.forEach((b, k) => {
      if (!b) return;
      b.getWorldPosition(p);
      const s = st[k], y = p.y;
      s.lo = Math.min(s.lo + 0.001 * (60 / HZ), y);
      const down = y < s.lo + 0.012;
      if (down && !s.on) s.on = { x: p.x, z: p.z, t };
      else if (!down && s.on) { if (t - s.on.t > 0.08) steps.push(Math.hypot(p.x - s.on.x, p.z - s.on.z)); s.on = null; }
    });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(scene); root.remove(scene);
  steps.sort((x, y) => x - y);
  return steps.length >= 3 ? steps[steps.length >> 1] : 9;
}

/** the ball's own in-place speed while planted: where the search starts (actors.ts measureSpeed's reading) */
function guess(g, clip) {
  const scene = g.scene, mixer = new THREE.AnimationMixer(scene), a = mixer.clipAction(clip);
  a.reset().play();
  const balls = ["l", "r"].map((k) => boneLike(scene, `ball_${k}`) ?? boneLike(scene, `toes_01.${k}`) ?? boneLike(scene, `foot_${k}`)).filter(Boolean);
  const N = 160, dt = clip.duration / N, Q = balls.map(() => []);
  for (let i = 0; i <= N; i++) { a.time = i * dt; mixer.update(0); scene.updateMatrixWorld(true); balls.forEach((b, k) => Q[k].push(b.getWorldPosition(new THREE.Vector3()))); }
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  const vs = [];
  Q.forEach((q) => { const lo = Math.min(...q.map((x) => x.y)); for (let i = 1; i <= N; i++) if (q[i].y < lo + 0.015 && q[i - 1].y < lo + 0.015) vs.push(Math.hypot(q[i].x - q[i - 1].x, q[i].z - q[i - 1].z) / dt); });
  vs.sort((x, y) => x - y);
  return vs.length >= 6 ? vs[vs.length >> 1] : NaN;
}

/** one body's natural speeds, { clip: speed } (only where the search found a real minimum) */
export async function bodySpeeds(file) {
  const g = await loadBody(file, (n) => JOBS.some(([c]) => c === n));
  const out = {};
  for (const [name, v] of JOBS) {
    const clip = g.animations.find((c) => c.name === name);
    if (!clip) continue;
    const est = guess(g, clip);
    if (!Number.isFinite(est) || est < 0.15) continue;
    const gr = (Math.sqrt(5) - 1) / 2;
    let lo = est * 0.55, hi = est * 1.25;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = trial(g, clip, v, c), fd = trial(g, clip, v, d);
    for (let it = 0; it < 12; it++) {
      if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = trial(g, clip, v, c); }
      else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = trial(g, clip, v, d); }
    }
    const nat = (lo + hi) / 2, slide = Math.min(fc, fd);
    // (kept only where it found a real minimum inside its range, with steps it could read — calib-loops' rule)
    if (slide < 0.09 && nat / est > 0.57 && nat / est < 1.23) out[name] = +nat.toFixed(3);
  }
  return out;
}

// (only when run, not when imported: an importer's own arguments are not bodies)
const MAIN = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (MAIN && bodies.length) {
  const all = OUT && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const known = CHECK ? JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/survivorz/show/loopspeed.json"), "utf8")) : {};
  const errs = [];
  for (const b of bodies) {
    const sp = await bodySpeeds(path.join(DIR, `${b}.glb`));
    for (const [clip, v] of Object.entries(sp)) {
      (all[clip] ??= {})[b] = v;
      const k = known[clip]?.[b];
      if (CHECK && k) errs.push([b, clip, v, k, (v / k - 1) * 100]);
    }
    console.log(b, JSON.stringify(sp));
  }
  if (CHECK) {
    for (const [b, c, v, k, e] of errs) console.log(`  ${b.padEnd(8)} ${c.padEnd(52)} node ${v.toFixed(3)} browser ${k.toFixed(3)} ${e >= 0 ? "+" : ""}${e.toFixed(1)}%`);
    const abs = errs.map((x) => Math.abs(x[4])).sort((x, y) => x - y);
    console.log(`checked ${abs.length}: median ${abs[abs.length >> 1]?.toFixed(1)}%, worst ${abs[abs.length - 1]?.toFixed(1)}%`);
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(all, null, 1) + "\n");
}
