// SOLACE SURVIVORZ — A FOOTSTEP IS A FOOT COMING DOWN (client/src/survivorz/show/footfall.ts).
//
// Run:  node scripts/checks/test_survivorz_footfall.mjs
//
// Josh, Nov 12 2026: "for every foot touching the floor, it should make a sound. I kept seeing desynced sounds
// with people walking." The show's footsteps come from footfall.ts: each foot's height, frame by frame, says
// when it lands. This plays the REAL walk, jog, sprint, crouch and armed loops on real bodies (and the dead's
// own walks on two of the dead), headless, at 60 frames a second, and holds the detector to:
//   · one sound for every time a foot is lifted and put down — never one missing, never one extra;
//   · as the foot comes back to its floor (within two frames of the true moment, four at the worst, read off the whole
//     series afterwards);
//   · the same at 30 frames a second and at a jittery frame rate;
//   · a foot that has just been somewhere odd (a kneel: the ball 6 cm under where a walk plants it) is heard
//     again within a second and a half — the old creeping floor missed a foot's landings for two;
//   · a body standing still makes no steps.
// It needs the gitignored bodies (assets/downloads/survivorz/game); without them it says so and passes nothing.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBody, boneLike, THREE, STAGE, ROOT } from "../survivorz/lib-loadbody.mjs";

const F = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "footfall.ts")).href);
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const SURV_LOOPS = ["ual1-walk-loop", "ual1-jog-fwd-loop", "mx-jogging", "mx-slow-run", "ual1-sprint-loop", "mx-male-injured-pack--injured-walk", "mx-male-injured-pack--injured-run",
  "ual1-crouch-fwd-loop", "bd-flashlight-walk", "gp-mx-pistol-handgun-locomotion-pack--pistol-walk", "gp-mx-pistol-handgun-locomotion-pack--pistol-run",
  "gr-mx-pro-rifle-pack--walk-forward", "gr-mx-pro-rifle-pack--run-forward", "gr-mx-pro-rifle-pack--sprint-forward"];
const ZED_LOOPS = ["mx-zombie-walk", "mx-zombie-walking", "mx-zombie-walking-1", "ual2-zombie-walk-fwd-loop", "mx-zombie-running"];
const BODIES = [["eric", SURV_LOOPS, F.FOOT_SURVIVOR], ["sophia", SURV_LOOPS, F.FOOT_SURVIVOR], ["rollo", SURV_LOOPS, F.FOOT_SURVIVOR], ["swat-soldier", SURV_LOOPS, F.FOOT_SURVIVOR],
  ["zombie-m01", ZED_LOOPS, F.FOOT_ZOMBIE], ["zombie-f01", ZED_LOOPS, F.FOOT_ZOMBIE]];
if (!fs.existsSync(path.join(STAGE, "game", "eric.glb"))) { console.log("the bodies aren't on this machine (assets/downloads/survivorz/game): nothing to play"); process.exit(0); }

/** each foot's ball and ankle height through the clip, sampled at the times given: [foot][0 ball | 1 ankle][i] */
function series(gltf, name, times) {
  const root = gltf.scene, clip = gltf.animations.find((a) => a.name === name);
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(root);
  const ankles = ["l", "r"].map((k) => boneLike(root, `foot_${k}`) ?? boneLike(root, `foot.${k}`));
  const balls = ["l", "r"].map((k, i) => boneLike(root, `ball_${k}`) ?? boneLike(root, `toes_01.${k}`) ?? ankles[i]);
  if (!balls[0] || !balls[1] || !ankles[0] || !ankles[1]) return null;
  const a = mixer.clipAction(clip); a.reset().play();
  const v = new THREE.Vector3(), out = [[[], []], [[], []]];
  for (const t of times) {
    a.time = t % clip.duration; mixer.update(0); root.updateMatrixWorld(true);
    for (const k of [0, 1]) { out[k][0].push(balls[k].getWorldPosition(v).y); out[k][1].push(ankles[k].getWorldPosition(v).y); }
  }
  a.stop(); mixer.uncacheAction(clip);
  return { h: out, dur: clip.duration };
}
// THE TRUTH, with hindsight the detector doesn't have: each part's floor at a moment is the lowest it is within
// three quarters of a second EITHER side of it; the foot is as far off the ground as its nearer part; a landing is
// that coming back under `down` after being over `up`.
function truth([ball, ankle], times, d) {
  const out = [];
  let air = false, lo = 0, hi = 0;
  for (let i = 0; i < ball.length; i++) {
    while (times[i] - times[lo] > F.FOOT_WINDOW_S / 2) lo++;
    while (hi + 1 < ball.length && times[hi + 1] - times[i] <= F.FOOT_WINDOW_S / 2) hi++;
    let fb = Infinity, fa = Infinity;
    for (let j = lo; j <= hi; j++) { if (ball[j] < fb) fb = ball[j]; if (ankle[j] < fa) fa = ankle[j]; }
    const h = Math.min(ball[i] - fb, ankle[i] === ball[i] ? Infinity : ankle[i] - fa);
    if (h > d.up) air = true;
    else if (air && h < d.down) { air = false; out.push(times[i]); }
  }
  return out;
}
function detect([ball, ankle], times, d) {
  const f = F.newFoot(), out = [];
  for (let i = 0; i < ball.length; i++) if (F.footStep(f, ball[i], ankle[i], i ? times[i] - times[i - 1] : 1 / 60, d)) out.push(times[i]);
  return out;
}
const clock = (fps, secs, jitter = 0) => { const out = []; let t = 0, s = 1; while (t < secs) { out.push(t); s = (s * 16807) % 2147483647; t += (1 / fps) * (1 + jitter * ((s / 2147483647) * 2 - 1)); } return out; };

let clips = 0, lands = 0, heard = 0, extra = 0, missed = 0, late = 0, silent = [];
let c30 = 0, m30 = 0, cj = 0, mj = 0, kneelOk = 0, kneelN = 0;
for (const [body, loops, dials] of BODIES) {
  const file = path.join(STAGE, "game", `${body}.glb`);
  if (!fs.existsSync(file)) continue;
  const gltf = await loadBody(file, (name) => loops.includes(name));
  for (const name of loops) {
    const dur = gltf.animations.find((a) => a.name === name)?.duration;
    if (!dur) continue;
    const secs = dur * 6;
    const T = clock(60, secs), S = series(gltf, name, T);
    if (!S) continue;
    clips++;
    let any = 0;
    for (const k of [0, 1]) {
      // (the first WINDOW of a foot's life has no history to stand on: counted from the third second)
      const from = Math.max(F.FOOT_WINDOW_S, dur) + 0.5;
      const want = truth(S.h[k], T, dials).filter((t) => t > from), got = detect(S.h[k], T, dials).filter((t) => t > from);
      any += want.length;
      lands += want.length; heard += got.length;
      for (const t of want) { const near = got.reduce((m, g) => Math.min(m, Math.abs(g - t)), 9); if (near > 4.5 / 60) { missed++; if (process.env.FOOT_DEBUG) console.log("   MISS", body, name, k, "dur", dur.toFixed(2), "at", t.toFixed(2), "nearest", near.toFixed(3), "lift", (Math.max(...S.h[k][0]) - Math.min(...S.h[k][0])).toFixed(3)); } }
      for (const g of got) { const near = want.reduce((m, t) => Math.min(m, Math.abs(g - t)), 9); if (near > 4.5 / 60) extra++; else if (near > 2.5 / 60) late++; }
      // 30 frames a second, and a ragged clock
      for (const [fps, jit, tally] of [[30, 0, "a"], [60, 0.45, "b"]]) {
        const T2 = clock(fps, secs, jit), S2 = series(gltf, name, T2);
        const w2 = truth(S2.h[k], T2, dials).filter((t) => t > from).length, g2 = detect(S2.h[k], T2, dials).filter((t) => t > from).length;
        if (tally === "a") { c30 += w2; m30 += Math.abs(w2 - g2); } else { cj += w2; mj += Math.abs(w2 - g2); }
      }
      // out of a kneel: a second with the ball 6 cm lower, then the walk
      const kneelT = clock(60, 1), all = [0, 1].map((p) => [...kneelT.map(() => Math.min(...S.h[k][p]) - 0.06), ...S.h[k][p]]), allT = [...kneelT, ...T.map((t) => t + 1)];
      const after = 1 + F.FOOT_WINDOW_S + 0.05;
      const w3 = truth(S.h[k], T, dials).map((t) => t + 1).filter((t) => t > after).length, g3 = detect(all, allT, dials).filter((t) => t > after).length;
      kneelN += w3; kneelOk += Math.min(w3, g3);
    }
    if (!any) silent.push(`${body} ${name}`);
  }
}
ok(clips >= 40, `the real loops play on real bodies (${clips} body × loop pairs)`);
// (hindsight and the detector read the floor a hair apart on a stride or two in four hundred: under 1%)
ok(lands > 400 && missed <= lands * 0.01, `every time a foot comes down there is a sound (${lands} landings, ${missed} without one)`);
ok(extra <= heard * 0.01, `and never a sound with no foot coming down (${heard} sounds, ${extra} stray)`);
ok(late <= heard * 0.02, `within two frames of it landing (${late} later than that, none past four)`);
ok(c30 > 200 && m30 <= c30 * 0.015, `the same at 30 frames a second (${c30} landings, ${m30} off)`);
ok(cj > 400 && mj <= Math.ceil(cj * 0.01), `and on a ragged frame clock (${cj} landings, ${mj} off)`);
ok(kneelN > 300 && kneelOk >= kneelN * 0.99, `a foot back from a kneel is heard again inside ${F.FOOT_WINDOW_S} s (${kneelOk} of ${kneelN} landings after it)`);
ok(silent.length === 0, "no walk or run is silent: every loop lifts its feet enough to be heard" + (silent.length ? " — silent: " + silent.join("; ") : ""));
{
  const f = F.newFoot(); let steps = 0;
  for (let i = 0; i < 600; i++) if (F.footStep(f, 0.02 + Math.sin(i / 7) * 0.008, 0.1 + Math.sin(i / 9) * 0.01, 1 / 60)) steps++;
  ok(steps === 0, "a body shifting its weight on the spot makes no footsteps");
  const g = F.newFoot(); let s2 = 0;
  for (let i = 0; i < 40; i++) { if (F.footStep(g, i % 4 < 2 ? 0.09 : 0.0, i % 4 < 2 ? 0.2 : 0.1, 1 / 60)) s2++; }
  ok(s2 <= Math.ceil(40 / 60 / F.FOOT_MIN_GAP_S) + 1, `one foot can't land twice inside ${F.FOOT_MIN_GAP_S} s (${s2} in two thirds of a second of flutter)`);
  ok(!F.footStep(F.newFoot(), NaN, 0.1, 1 / 60) && !F.footStep(F.newFoot(), 0.1, 0.2, 0), "a missing bone or a frozen frame is no footstep");
  // heel first: the ball still 5 cm up, the heel down — that is the landing
  const h = F.newFoot(); let at = -1;
  const heelFirst = (i) => (i < 30 ? [0.01, 0.09] : i < 50 ? [0.12, 0.16] : i < 80 ? [0.05, 0.095] : [0.01, 0.09]);
  for (let i = 0; i < 110; i++) { const [b, a] = heelFirst(i); if (F.footStep(h, b, a, 1 / 60) && at < 0) at = i; }
  ok(at >= 50 && at <= 52, `a heel that lands with the toes still up is the footstep (frame ${at}; the toes come down at 80)`);
}
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
