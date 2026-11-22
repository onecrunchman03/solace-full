// THE SEEDED RACE — one implementation, two screens.
//
// Run:  node scripts/checks/test_derby_race.mjs
//
// Josh, Aug 2026: "cast the same racing screen you see in the 2d version… that
// way if people are in the 2d emoji rumble or in the casino the race is
// synchronised and the same view."
//
// Synchronisation here is structural, not coincidental: the server broadcasts
// a seed and the finish order, and BOTH screens run the same pure functions
// over them (client/src/lib/derby-race.ts). This harness holds that up:
//   · the race is a pure function of its inputs — two "clients" building it
//     independently agree at every sampled instant, to the float
//   · a different seed is actually a different race (it isn't ignoring input)
//   · every curve is monotone and lands exactly on the line
//   · the finish times honour the broadcast placings, so the animation can
//     never contradict the payout
//   · and NEITHER screen keeps a private copy of the maths, which is the only
//     way the first assert stays true tomorrow

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildRace, distanceAt, mulberry32, shapeFor, smoothTable } = await import(
  "file://" + path.join(ROOT, "client/src/lib/derby-race.ts").replace(/\\/g, "/")
);

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

const KEYS = ["rocket", "snail", "frog", "nascar", "blob", "boulder"];
const PLACINGS = ["nascar", "rocket", "frog", "snail", "blob", "boulder"];
const RACE_MS = 11_000;

// ---- deterministic across "clients" ----------------------------------------
const a = buildRace(20260809, KEYS, PLACINGS, RACE_MS);
const b = buildRace(20260809, KEYS, PLACINGS, RACE_MS);
let drift = 0;
for (let s = 0; s <= 200; s++) {
  const u = s / 200;
  for (let i = 0; i < KEYS.length; i++) {
    drift = Math.max(drift, Math.abs(distanceAt(a.curves[i], u) - distanceAt(b.curves[i], u)));
  }
}
ok(drift === 0, `two clients run the identical race (max drift ${drift})`);
ok(
  [...a.finish.keys()].every((k) => a.finish.get(k) === b.finish.get(k)),
  "…and cross the line at the same instants",
);
ok(a.boulderFlop === b.boulderFlop, "…including whether the boulder falls over");

// ---- a different seed is a different race ----------------------------------
const c = buildRace(20260810, KEYS, PLACINGS, RACE_MS);
let diff = 0;
for (let s = 1; s < 200; s++) {
  const u = s / 200;
  for (let i = 0; i < KEYS.length; i++) {
    diff = Math.max(diff, Math.abs(distanceAt(a.curves[i], u) - distanceAt(c.curves[i], u)));
  }
}
ok(diff > 0.01, `a new seed runs a genuinely different race (max divergence ${diff.toFixed(3)})`);

// ---- the curves are honest --------------------------------------------------
let nonMono = 0, offLine = 0;
for (const curve of a.curves) {
  for (let i = 1; i < curve.length; i++) if (curve[i] < curve[i - 1] - 1e-12) nonMono++;
  if (Math.abs(distanceAt(curve, 1) - 1) > 1e-9) offLine++;
  if (distanceAt(curve, 0) !== 0) offLine++;
}
ok(nonMono === 0, `nobody ever runs backwards (${nonMono} reversals)`);
ok(offLine === 0, "every runner starts at the gate and ends exactly on the line");

// ---- the animation can't contradict the payout -----------------------------
const times = PLACINGS.map((k) => a.finish.get(k));
ok(times.every((t) => typeof t === "number"), "every placed runner has a finish time");
let outOfOrder = 0;
for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) outOfOrder++;
ok(outOfOrder === 0, `they cross in the broadcast order (${outOfOrder} inversions)`);
ok(
  Math.abs(times[0] - RACE_MS * 0.88) < 1,
  "the winner crosses at 88% of the clock — the rule both screens time their sound to",
);

// ---- the shapes are the cast's own ------------------------------------------
const rnd = mulberry32(7);
ok(shapeFor("rocket", rnd).some((v) => v > 2), "the rocket still burns and coasts");
ok(shapeFor("snail", mulberry32(7)).every((v) => v > 0.9 && v < 1.1), "the snail is still a metronome");
const tbl = smoothTable([3, 0.2, 3, 0.2, 3, 0.2, 3, 0.2]);
ok(tbl[0] === 0 && Math.abs(tbl[tbl.length - 1] - 1) < 1e-12, "a violent curve still normalises to the line");

// ---- ONE implementation ------------------------------------------------------
// The determinism above only means anything while both screens call the SAME
// code. A private copy in either file would drift the moment one is tuned.
//
// Aug 2026 — Josh: "the emoji racing jumobo tron is still not accectpable, i
// would like you to put the same screen someone would see in the 2d casino."
// Sharing the maths was not enough while the casino redrew its own board on a
// canvas: a replica of a Svelte view is still a replica. The jumbotron now
// MOUNTS the hub's racetrack component, and both screens run one race director
// (derby-run.ts) for the countdown, the hops, the boulder gag and the sounds.
// These asserts are what stops either of those quietly forking again.
const derbySvelte = readFileSync(path.join(ROOT, "client/src/components/Derby.svelte"), "utf8");
const course = readFileSync(path.join(ROOT, "client/src/components/DerbyCourse.svelte"), "utf8");
const jumbo = readFileSync(path.join(ROOT, "client/src/casino/jumbo.svelte.ts"), "utf8");
const world = readFileSync(path.join(ROOT, "client/src/casino/world.ts"), "utf8");
const run = readFileSync(path.join(ROOT, "client/src/lib/derby-run.ts"), "utf8");
ok(!/function\s+mulberry32/.test(derbySvelte), "the 2D paddock keeps no private copy of the maths");
ok(!/function\s+smoothTable/.test(derbySvelte), "…nor its own curve builder");
ok(/derby-run/.test(derbySvelte), "…it runs the shared race director");
ok(/DerbyCourse/.test(derbySvelte), "…and renders the shared racetrack");
ok(/DerbyCourse/.test(jumbo) && /mount\(DerbyCourse/.test(jumbo),
  "the casino's jumbotron MOUNTS that same racetrack, rather than drawing one");
ok(/derby-run/.test(jumbo), "…and runs it off the same director");
// The board is DOM. It is only allowed on screen where the 3D frame is
// actually transparent, or it draws through the stage wheel standing in front
// of it (Josh: "it shows over everything now"). Two things make that true and
// both are easy to undo by accident.
ok(/NoBlending/.test(jumbo) && /gl_FragColor=vec4\(0\.0\)/.test(jumbo),
  "the screen punches a transparent hole in the frame rather than compositing over it");
ok(/zIndex = "-1"/.test(jumbo), "…and the DOM layer sits UNDER the canvas");
const game = readFileSync(path.join(ROOT, "client/src/casino/CasinoGame.svelte"), "utf8");
ok(/alpha: true/.test(game), "…which needs the renderer's alpha buffer");
ok(!/buildJumboTex/.test(world), "the hall paints no race board of its own any more");
ok(!/requestAnimationFrame/.test(derbySvelte), "neither screen keeps a private race loop");
ok(/derby-race/.test(run), "the director builds its race from the shared curves");
ok(/countBeep|goBeep|raceCrowd|finishFanfare/.test(run),
  "…and owns the sound cues, so both screens hear the same race");

console.log("");
if (bad) {
  console.log(`${n - bad} passed, ${bad} FAILED`);
  process.exit(1);
}
console.log(`${n}/${n} derby-race asserts passed`);
