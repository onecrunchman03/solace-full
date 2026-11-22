// SOLACE SURVIVORZ — A BODY HAS WEIGHT (src/survivorz/sim/world.ts WEIGHT, weigh; docs/survivorz/RUBRIC.md C2 + C3).
//
// Run:  npm run build && node scripts/checks/test_survivorz_weight.mjs
//
// The Nov 12 2026 review: on the wire a survivor on their feet turned at up to 1,800°/s (twenty places in the job
// code set a heading outright) and went from a sprint to standing in one step. What is SENT is now held to what a
// body can do. This drives the rule directly on a real world's floor, then plays two whole shows on game code
// alone and reads every survivor every step:
//   · a heading asked for is turned to at TURN_STAND rad/s on the spot (TURN_MOVE moving), never jumped to;
//   · told to stand from a run, the body carries on, slower each step, and stops in about v²/2·DEC;
//   · told to go back the way it came, it slows first and sets off the new way from near rest;
//   · a carry never ends on a blocked cell, and a step the route walked is left where the route put it;
//   · over three shows: turns and speed changes at the 99th percentile inside the limits, and almost nothing past them;
//   · nobody on a blocked cell or in a shut doorway, ever.
// (scripts/survivorz/review/move-probe.mjs is the same reading with every hard turn and stop filed under its cause.)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { SimWorld, WEIGHT } = require(path.join(ROOT, "dist/survivorz/sim/world.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error(`  ✗ ${n}. ${name}`); } else console.log(`  ✓ ${n}. ${name}`); };
const STEP = 100, SEC = STEP / 1000;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log("THE RULE, on a real floor");
{
  const w = new SimWorld({ seed: 7, start: 1_800_000_000_000, stepMs: STEP });
  const nav = w.nav;
  // a survivor and a straight line of open floor from where they stand (the longest of 16 directions)
  let s = null, dir = null, best = 0;
  for (const c of w.survivors) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
    let len = 0;
    for (; len < 8; len += 0.2) { const cell = nav.cellAt(c.floor, c.x + ux * (len + 0.2), c.z + uz * (len + 0.2)); if (cell < 0 || !w.canStand(c, cell)) break; }
    if (len > best) { best = len; s = c; dir = [ux, uz]; }
  }
  ok(!!s && best >= 3, `a survivor with ${best.toFixed(1)} m of open floor ahead to try it on`);
  const weigh = (x0, z0, h0, c0, r0, pushed = false) => w.weigh(s, x0, z0, h0, c0, r0, true, pushed, STEP);
  const park = () => { for (const o of w.survivors) if (o !== s) { o.x += 1000; } };   // (nobody near: the space guard is tried on its own)
  const unpark = () => { for (const o of w.survivors) if (o !== s) { o.x -= 1000; } };
  park();
  // ---- the heading ----
  s.gvx = 0; s.gvz = 0; s.hGoal = undefined;
  const hStart = s.h;
  let steps = 0, worst = 0, h0 = s.h;
  s.h = hStart + Math.PI;                         // the job code: face the other way, now
  for (; steps < 40; steps++) {
    weigh(s.x, s.z, h0, s.cell, s.room);
    worst = Math.max(worst, Math.abs(wrap(s.h - h0)));
    if (Math.abs(wrap(s.h - (hStart + Math.PI))) < 1e-6) { steps++; break; }
    h0 = s.h;                                     // (the job code doesn't touch it again: the body keeps turning)
  }
  ok(worst <= WEIGHT.TURN_STAND * SEC + 1e-9, `a heading asked for is never jumped to: at most ${(worst * 180 / Math.PI / SEC).toFixed(0)}°/s a step (the limit: ${(WEIGHT.TURN_STAND * 180 / Math.PI).toFixed(0)})`);
  ok(Math.abs(steps * SEC - Math.PI / WEIGHT.TURN_STAND) <= 0.15, `…and it is reached: half a turn in ${(steps * SEC).toFixed(1)} s`);
  // ---- told to stand, from a run ----
  const V = 3.0, x1 = s.x, z1 = s.z;
  s.gvx = dir[0] * V; s.gvz = dir[1] * V; s.hGoal = undefined;
  let moved = [], px = s.x, pz = s.z;
  for (let i = 0; i < 20; i++) {
    const x0 = s.x, z0 = s.z;
    weigh(x0, z0, s.h, s.cell, s.room);          // the job code moved it nowhere: "stand"
    moved.push(Math.hypot(s.x - x0, s.z - z0) / SEC);
    if (moved[moved.length - 1] === 0) break;
  }
  const carry = Math.hypot(s.x - x1, s.z - z1);
  ok(moved[0] > 0 && moved[0] <= V - WEIGHT.DEC * SEC + 1e-6 && moved.every((v, i) => i === 0 || v <= moved[i - 1] + 1e-9), `told to stand at ${V} m/s, the body carries on and slows (${moved.map((v) => v.toFixed(1)).join(" → ")} m/s)`);
  ok(Math.abs(moved.length * SEC - V / WEIGHT.DEC) <= 0.11 && carry > 0.2 && carry < (V * V) / (2 * WEIGHT.DEC) + 0.05, `…to a stop in ${(moved.length * SEC).toFixed(1)} s and ${carry.toFixed(2)} m (v²/2·DEC is ${((V * V) / (2 * WEIGHT.DEC)).toFixed(2)})`);
  ok(nav.walk[nav.cellAt(s.floor, s.x, s.z)] === 1, "…on open floor");
  // ---- told to go back the way it came ----
  s.gvx = dir[0] * 2.8; s.gvz = dir[1] * 2.8;
  let fwd = 0, turnedAt = -1;
  for (let i = 0; i < 12; i++) {
    const x0 = s.x, z0 = s.z, c0 = s.cell, r0 = s.room;
    w.stepTo(s, s.x - dir[0] * 0.02, s.z - dir[1] * 0.02);      // the job code: 0.2 m/s the other way
    weigh(x0, z0, s.h, c0, r0);
    const along = (s.x - x0) * dir[0] + (s.z - z0) * dir[1];
    if (along > 0) fwd++; else if (turnedAt < 0) { turnedAt = i; break; }
  }
  ok(fwd >= 2 && turnedAt === fwd, `told to go back the way it came at a jog, it slows for ${fwd} steps and then goes (never reversed at speed)`);
  // ---- a wall ----
  // walk it to the end of its open line, then carry it at the wall
  const ex = s.x, ez = s.z;
  let reach = 0;
  for (; reach < 12; reach += 0.2) { if (!w.stepTo(s, s.x + dir[0] * 0.2, s.z + dir[1] * 0.2)) break; }
  s.gvx = dir[0] * 4; s.gvz = dir[1] * 4;
  for (let i = 0; i < 6; i++) weigh(s.x, s.z, s.h, s.cell, s.room);
  const cellNow = nav.cellAt(s.floor, s.x, s.z);
  ok(cellNow >= 0 && nav.walk[cellNow] === 1 && w.canStand(s, cellNow), "a carry stops against a wall: never onto a blocked cell");
  // ---- a route's own step is left alone ----
  w.stepTo(s, ex, ez);
  s.gvx = 0; s.gvz = 0;
  {
    const x0 = s.x, z0 = s.z, c0 = s.cell, r0 = s.room;
    w.stepTo(s, s.x - dir[0] * 0.28, s.z - dir[1] * 0.28);      // 2.8 m/s from standing: more than ACC allows…
    const jx = s.x, jz = s.z;
    s.walkT = w.t;                                              // …but it was the route's walk that put it there
    weigh(x0, z0, s.h, c0, r0);
    ok(Math.hypot(s.x - jx, s.z - jz) < 1e-9, "where the route's own walk put the body is where it stays (the walk keeps the pace itself)");
    s.walkT = -1;
    w.stepTo(s, x0, z0);
    const y0 = s.x, w0 = s.z, d0 = s.cell, e0 = s.room;
    s.gvx = 0; s.gvz = 0;
    w.stepTo(s, s.x - dir[0] * 0.28, s.z - dir[1] * 0.28);      // the same jump, by the job code itself
    weigh(y0, w0, s.h, d0, e0);
    const got = Math.hypot(s.x - y0, s.z - w0) / SEC;
    ok(got <= WEIGHT.ACC * SEC + 1e-6 && got > 0, `a jump from standing by anything else is a start: ${got.toFixed(2)} m/s in the first step (ACC allows ${(WEIGHT.ACC * SEC).toFixed(2)})`);
  }
  unpark();
  ok(WEIGHT.TURN_MOVE * 180 / Math.PI <= 240 && WEIGHT.TURN_STAND * 180 / Math.PI <= 300 && WEIGHT.ACC <= 8 && WEIGHT.DEC <= 8 && WEIGHT.ACC >= 4, `the limits are a body's (${(WEIGHT.TURN_MOVE * 180 / Math.PI).toFixed(0)}°/s moving, ${(WEIGHT.TURN_STAND * 180 / Math.PI).toFixed(0)}°/s on the spot, +${WEIGHT.ACC} / −${WEIGHT.DEC} m/s²)`);
}

console.log("THREE SHOWS, every survivor, every step");
{
  const PLACED = new Set(["down", "dead", "sleep", "sit", "grabbed", "revive"]);
  const turnsMove = [], turnsStand = [], accels = [], fight = [];
  let steps = 0, hardTurn = 0, hardAcc = 0, blocked = 0, inDoor = 0;
  for (const seed of [3, 11, 20]) {
    const w = new SimWorld({ seed, start: 1_800_000_000_000, stepMs: STEP });
    const start = w.t, prev = new Map();
    while (!w.overAt && w.t - start < 12 * 60_000) {
      w.tick(STEP);
      for (const s of w.survivors) {
        if (s.alive && !s.link && !s.onBed) {
          const k = w.nav.cellAt(s.floor, s.x, s.z);
          if (k < 0 || !w.nav.walk[k]) blocked++;
          else if (w.nav.door[k] >= 0 && !w.doorOpenIdx(w.nav.door[k])) inDoor++;
        }
        const p = prev.get(s.who);
        const up = s.alive && !s.link && !s.onBed && s.mode !== "down" && !PLACED.has(s.pose) && s.grabbedBy.length === 0;
        const shoved = s.shovedAt === w.t;   // (one of the dead pushed it this step: a blow, like a grab)
        const cur = { x: s.x, z: s.z, h: s.h, up, floor: s.floor, v: 0, shoved, calm: s.mode === "job" };
        if (p && p.up && up && p.floor === s.floor) {
          const v = Math.hypot(s.x - p.x, s.z - p.z) / SEC;
          cur.v = v;
          if (v < 12) {
            steps++;
            const turn = (Math.abs(wrap(s.h - p.h)) * 180 / Math.PI) / SEC;
            if (v > 0.25 || p.v > 0.25) turnsMove.push(turn); else if (turn > 0) turnsStand.push(turn);
            if (turn > 300) hardTurn++;
            // (calm: at their own business — a fight's lunges, blows and bodies in the way are read apart)
            if ((p.v > 0.25 || v > 0.25) && !shoved && !p.shoved) { const a = Math.abs(v - p.v) / SEC; if (cur.calm && p.calm) { accels.push(a); if (a > 8.5) hardAcc++; } else fight.push(a); }
          }
        }
        prev.set(s.who, cur);
      }
    }
  }
  ok(steps > 15_000, `${steps} steps on their feet read`);
  ok(pct(turnsMove, 0.99) <= 240, `moving, the 99th percentile turn is ${Math.round(pct(turnsMove, 0.99))}°/s (the line: 240; it was 401)`);
  ok(pct(turnsStand, 0.99) <= 300, `on the spot, ${Math.round(pct(turnsStand, 0.99))}°/s (the line: 300; it was 455)`);
  ok(hardTurn <= 6, `turns past 300°/s: ${hardTurn} (the probe counted 5,494 in six shows before)`);
  ok(pct(accels, 0.99) <= 8.05, `at their own business, the 99th percentile change of speed is ${pct(accels, 0.99).toFixed(1)} m/s² (the line: 8)`);
  ok(pct(fight, 0.99) <= 16, `in a fight — fighting, backing off, fleeing — ${pct(fight, 0.99).toFixed(1)} m/s² (the line: 16; it was 50)`);
  ok(hardAcc <= accels.length * 0.012, `calm changes past 8.5 m/s² — a wall, a body in the way: ${hardAcc} of ${accels.length} moving steps (${(100 * hardAcc / accels.length).toFixed(2)}%)`);
  ok(blocked === 0 && inDoor === 0, `nobody on a blocked cell (${blocked}) or left in a shut doorway (${inDoor})`);
}

// NOBODY STUCK (Nov 12 2026 — the review's C7). A body left at the edge of its cell beside a doorway (a carry does
// that) had its route's first point dropped and walked into the door's jamb: "stuck" every 4 s for minutes. Guards
// were sent to stand outside the blast door, and rooms known to be locked stayed on the menu: "no route".
console.log("NOBODY STUCK: four shows' jobs");
{
  const fails = {};
  let guardsOut = 0, guards = 0, wedged = 0, inside = 0, upright = 0;
  const PLACED2 = new Set(["down", "dead", "sleep", "sit", "grabbed", "revive"]);
  // (seed 7 is the show the wedge was found in: Dale against hall-n's south wall, 40 failed rests in 3 minutes)
  for (const seed of [7, 3, 11, 20]) {
    const w = new SimWorld({ seed, start: 1_800_000_000_000, stepMs: STEP });
    const start = w.t, still = new Map();
    while (!w.overAt && w.t - start < 10 * 60_000) {
      w.tick(STEP);
      for (const s of w.survivors) {
        const j = s.job;
        if (j?.kind === "guard" && j.cell >= 0) { guards++; const r = w.nav.room[j.cell]; if (r < 0 || w.nav.rooms[r].kind === "exit") guardsOut++; }
        // (wedged: on the way to a job, counting "stuck" steps without getting anywhere)
        if (j && (j.stuck ?? 0) >= 15 && still.get(s.who) !== j) { still.set(s.who, j); wedged++; }
      }
      // NOBODY INSIDE ANYBODY (the review's C6): two of the living on their feet, a hand's width apart or less
      const up = w.survivors.filter((s) => s.alive && !s.link && !s.onBed && s.mode !== "down" && !PLACED2.has(s.pose) && s.grabbedBy.length === 0);
      upright += up.length;
      for (let a = 0; a < up.length; a++) for (let b = a + 1; b < up.length; b++) if (up[a].floor === up[b].floor && Math.hypot(up[a].x - up[b].x, up[a].z - up[b].z) < 0.25) inside++;
    }
    for (const [k, v] of Object.entries(w.stats.jobFails)) fails[k] = (fails[k] ?? 0) + v;
  }
  const of = (re) => Object.entries(fails).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
  const worst = Object.entries(fails).filter(([k]) => /stuck|no route/.test(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(", ") || "none";
  ok(of(/:stuck$/) <= 2, `jobs failed "stuck" in four shows: ${of(/:stuck$/)} (${worst}; seed 7 alone had 40 before)`);
  ok(of(/:no route/) <= 2, `jobs failed "no route" in four shows: ${of(/:no route/)} (guards and sweeps of locked rooms were 7 a show)`);
  ok(wedged <= 2, `a survivor counting "stuck" steps on the way to a job: ${wedged} times`);
  // (a body stalled on its way used to walk THROUGH whoever was there for two seconds; it squeezes past sideways now.
  // The same four shows read 34 before)
  // (the same budget, three steps a show, over TWELVE shows rather than four: one barge past a friend in a
  // two-metre hall is twenty steps, and four shows read whichever seed had one. THE CODE REVIEW (E-6, Nov 14 2026)
  // caught what this change first hid: the build it was made for read 142 steps over seeds 1 to 48 against the
  // old build's 30, because a revive cut short by a grab left the pair never kept apart again (survivor.ts act:
  // `reviving`). THE RE-GRADE caught it again: at 36 the budget hid 33 steps, nearly all a sweeper squeezing through
  // their own escort, who was not told to make way because a body walked INTO somebody is pushed back every step
  // and never reads as stopped (survivor.ts escortStep). These twelve read 2 then, and the budget was 10.
  // TWELVE SHOWS WAS A COIN (the second re-grade, the same night): the count is lumpy, one barge is fourteen steps,
  // and the next build read 16 on these twelve while 60 shows read the same on both (38 against 40: about two
  // steps in three shows). FORTY-EIGHT SHOWS now, seeds 1 to 48, and a budget of 70: a sound build reads about
  // 30, and the two faults this count has caught read 142 and about 130 over the same 48.)
  for (let seed = 1; seed <= 48; seed++) {
    if ([7, 3, 11, 20].includes(seed)) continue;   // (read above)
    const w = new SimWorld({ seed, start: 1_800_000_000_000, stepMs: STEP });
    const start = w.t;
    while (!w.overAt && w.t - start < 10 * 60_000) {
      w.tick(STEP);
      const up = w.survivors.filter((s) => s.alive && !s.link && !s.onBed && s.mode !== "down" && !PLACED2.has(s.pose) && s.grabbedBy.length === 0);
      upright += up.length;
      for (let a = 0; a < up.length; a++) for (let b = a + 1; b < up.length; b++) if (up[a].floor === up[b].floor && Math.hypot(up[a].x - up[b].x, up[a].z - up[b].z) < 0.25) inside++;
    }
  }
  ok(inside <= 70, `two of the living standing inside each other (under 0.25 m): ${inside} steps in 48 shows of ${Math.round(upright / 600)} survivor-minutes (budget 70)`);
  ok(guardsOut === 0, `a guard's place is never outside the blast door (${guards} guard-steps read, ${guardsOut} outside)`);
}

// A BED THAT JUST FAILED THEM IS NOT GONE STRAIGHT BACK TO (the code review, Nov 14 2026: the bed was the one spot
// on the menu with no "not again yet", and a body wedged on its way to one asked for it again every four seconds).
{
  const { jobMenu } = require(path.join(ROOT, "dist/survivorz/sim/survivor.js"));
  const w = new SimWorld({ map: "bunker", seed: 7, start: Date.UTC(2026, 10, 2, 22, 0, 0) });
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const s = w.survivors[0];
  const beds = () => { s.job = null; s.retryAt = 0; s.hp = s.hpMax * 0.3; return jobMenu(w, s).menu.filter((x) => x.job.kind === "rest" && x.job.target).map((x) => x.job.target); };
  const first = beds();
  if (first.length) s.failedSpots.set(first[0], w.t);
  const after = beds();
  for (let t = 0; t < 91_000; t += 1000) w.tick(1000);
  const later = beds();
  ok(first.length === 1 && after.length === 0 && later.length === 1, `hurt, a bed is on the menu (${first[0] ?? "none"}); it is not for a minute and a half after it failed them (${after.length} offered), and is again after (${later[0] ?? "none"})`);
}

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
