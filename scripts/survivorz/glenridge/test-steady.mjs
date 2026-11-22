// SURVIVORZ, GLENRIDGE HALL: NOBODY DITHERS, NOTHING STALLS (Nov 14 2026), in-process on game code alone.
//   node scripts/survivorz/glenridge/test-steady.mjs        (after `npm run build`)
// A soak of 40 shows found the faults this pins, each staged here on its own and then held over whole shows:
//   · one of the dead seen through glass (after nobody, or with no way to whoever it is after) is left alone;
//   · the same one with a clear way to walk at it is a threat;
//   · a feeding one with somebody standing by picks one of the two and stays with it;
//   · work a fright cut short is gone back to;
//   · the dead on a porch open to the grounds are not "in the house";
//   · over whole shows: nobody changes their mind a hundred times a minute, no show runs out the hour with people
//     standing, no ten minutes pass with the objectives untouched and hands free, and the windows get boarded.
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// (DIST=<dir>: another build of the server, to see these go red on the code before the fixes)
const dist = (p) => path.join(process.env.DIST ? path.resolve(process.env.DIST) : path.join(ROOT, "dist"), "survivorz", p);
const { SimWorld } = require(dist("sim/world.js"));
const { jobMenu, fighterInWay, canEscort } = require(dist("sim/survivor.js"));
const { GLEN } = require(dist("sim/scenarios/glenridge.js"));
const { lieOf } = require(dist("sim/lie.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL", m); } };
const T0 = 1_800_000_000_000;
const mk = (seed) => new SimWorld({ map: "glenridge", seed, start: T0 });
const line = (w) => (c) => w.nav.door[c] < 0 || w.doorOpenIdx(w.nav.door[c]);
/** a world with one survivor in it and none of the dead */
function alone(seed, shut = true) {
  const w = mk(seed);
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const s = w.survivors[0];
  for (const o of w.survivors) if (o !== s) o.escaped = true;
  w.fac.bolt(GLEN.front); w.sc.boltedAt = w.t;
  // (the house shut: with a window open, one of the dead outside has a way in and IS coming)
  if (shut) for (const id of GLEN.windows) w.fac.board(id);
  return { w, s };
}
/** a cell in room `a` and one in room `b` on floor 1 that see each other, with (`walk`) or without a straight walk between */
function pairOf(w, a, b, walk, dMin, dMax) {
  const nav = w.nav, ra = nav.roomIdx.get(a), rb = nav.roomIdx.get(b);
  for (let u = 0.1; u < 0.95; u += 0.1) for (let v = 0.1; v < 0.95; v += 0.1) {
    const ca = nav.cellInRoom(ra, 1, u, v); if (ca < 0 || !nav.isWalk(ca) || nav.room[ca] !== ra) continue;
    const [ax, , az] = nav.centre(ca);
    for (let u2 = 0.05; u2 < 1; u2 += 0.05) for (let v2 = 0.05; v2 < 1; v2 += 0.05) {
      const cb = nav.cellInRoom(rb, 1, u2, v2); if (cb < 0 || !nav.isWalk(cb) || nav.room[cb] !== rb || cb === ca) continue;
      const [bx, , bz] = nav.centre(cb), d = Math.hypot(bx - ax, bz - az);
      if (d < dMin || d > dMax || !nav.sees(1, ax, az, bx, bz, w.doorOpenIdx)) continue;
      if (nav.segLine(1, ax, az, bx, bz, line(w)) === walk) return [ca, cb, d];
    }
  }
  return null;
}
const run = (w, ms, each) => { for (let t = 0; t < ms && !w.obj.ending; t += 100) { w.tick(100); each?.(); } };

// ---- seen through glass ----------------------------------------------------------------------------------------
{
  const { w, s } = alone(21);
  const p = pairOf(w, "great-hall", "terrace", false, 5, 18);
  ok(!!p, "there is a place in the great hall that sees the terrace through its glass");
  if (p) {
    w.place(s, p[0]); s.job = null; s.hp = s.hpMax;
    const z = w.makeZombie("shambler", p[1]); z.state = "idle"; z.h = Math.atan2(s.x - z.x, s.z - z.z);
    let scared = 0, seen = 0, chased = 0, walled = 0;
    run(w, 6000, () => { if (s.mode !== "job") scared++; if (s.threats.length) seen++; if (z.state === "chase") { chased++; if (z.walled) walled++; } });
    ok(scared === 0 && seen === 0, `one of the dead ${p[2].toFixed(0)} m off on the terrace, seen through the glass, is left alone (not in the job mode for ${scared} ticks, a threat for ${seen})`);
    ok(s.alertUntil > w.t - 6000 || s.know.danger[w.nav.roomIdx.get("terrace")] > 0, "…but it is known about (the terrace is remembered as bad)");
    ok(chased > 0 && walled >= chased * 0.6, `it sees them, goes for them, and knows it has no way to them (after them for ${chased} steps, ${walled} of those knowing it is walled off)`);
  }
}
// ---- the same, with a way to walk at it ------------------------------------------------------------------------
{
  const { w, s } = alone(22);
  const p = pairOf(w, "great-hall", "great-hall", true, 5, 9);
  ok(!!p, "there is a clear line across the great hall");
  if (p) {
    w.place(s, p[0]); s.job = null;
    const z = w.makeZombie("shambler", p[1]); z.state = "idle"; z.nextThink = w.t + 60_000; z.h = Math.atan2(z.x - s.x, z.z - s.z);
    let seen = 0;
    run(w, 1500, () => { if (s.threats.includes(z.i)) seen++; });
    ok(seen > 0, "one standing across the room with nothing between is a threat");
  }
}
// ---- a feeding one, and somebody standing by --------------------------------------------------------------------
{
  const w = mk(23), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const [a, b] = w.survivors;
  for (const o of w.survivors) if (o !== a && o !== b) o.escaped = true;
  const p = pairOf(w, "great-hall", "great-hall", true, 2.4, 2.9);
  ok(!!p, "two places 2.4 to 2.9 m apart in the great hall");
  if (p) {
    w.place(a, p[1]); w.place(b, p[0]);
    a.hp = 0; a.mode = "down"; a.pose = "down"; a.job = null; a.downUntil = w.t + 10 * 60_000;
    const zc = nav.nearestWalk(nav.cellAt(1, a.x + 0.5, a.z));
    const z = w.makeZombie("shambler", zc); z.state = "feed"; z.target = a.i; z.feedUntil = w.t + 10 * 60_000;
    b.pack.bandage = 0; b.pack.medkit = 0;
    let changes = 0, last = "";
    run(w, 8000, () => { const k = z.state === "attack" ? "chase" : z.state; const key = k + ":" + z.target; if (key !== last) { changes++; last = key; } });
    ok(changes <= 3, `a feeding one with somebody on their feet beside it makes up its mind (${changes} changes of what it is doing in 8 s; it was three a second)`);
  }
}
// ---- work cut short is gone back to -----------------------------------------------------------------------------
{
  const { w, s } = alone(24, false);
  s.pack.spare.push("planks");
  const opt = jobMenu(w, s).menu.find((m) => m.job.kind === "task" && m.job.target === "board-dining-window");
  ok(!!opt, "with planks in hand the dining room's window is on the menu");
  if (opt) {
    const [x, , z] = w.nav.centre(opt.job.cell);
    const near = w.nav.nearestWalk(w.nav.cellAt(1, x + 2.5, z + 1.5), w.nav.room[opt.job.cell]);
    w.place(s, near >= 0 ? near : opt.job.cell);
    // (as a fright leaves them: arrived, the job still theirs, nothing in their hands)
    s.job = { ...opt.job, phase: 1 }; s.busyAct = ""; s.busyUntil = 0; s.mode = "job";
    run(w, 90_000);
    ok(!w.fac.doors.get("dining-window").open, "somebody whose hands were taken off a window goes back and boards it (they used to stand there until the job ran out)");
  }
}
// ---- a porch is not the house -----------------------------------------------------------------------------------
{
  const { w } = alone(25), nav = w.nav;
  const porch = nav.roomIdx.get("west-porch"), hall = nav.roomIdx.get("great-hall");
  const pc = nav.cellInRoom(porch, 1, 0.5, 0.5), hc = nav.cellInRoom(hall, 1, 0.5, 0.5);
  w.makeZombie("shambler", nav.nearestWalk(pc, porch));
  ok(w.snapshot().goals.inside === 0, "one of the dead on the west porch (open to the lawns) is not in the house");
  w.makeZombie("shambler", hc);
  ok(w.snapshot().goals.inside === 1, "one in the great hall is");
}

// ---- a wall away ------------------------------------------------------------------------------------------------
{
  const { w, s } = alone(26), nav = w.nav, hall = nav.roomIdx.get("great-hall");
  let pair = null;
  find: for (let u = 0.05; u < 1; u += 0.05) for (let v = 0.05; v < 1; v += 0.05) {
    const a = nav.cellInRoom(hall, 1, u, v); if (a < 0 || !nav.isWalk(a) || nav.room[a] !== hall) continue;
    const [ax, , az] = nav.centre(a);
    for (let k = 0; k < 16; k++) {
      const b = nav.cellAt(1, ax + Math.sin(k * Math.PI / 8) * 1.9, az + Math.cos(k * Math.PI / 8) * 1.9);
      if (b < 0 || !nav.isWalk(b) || nav.room[b] < 0 || nav.room[b] === hall) continue;
      const [bx, , bz] = nav.centre(b), d = Math.hypot(bx - ax, bz - az);
      if (d >= 1.5 && d <= 2.3 && !nav.sees(1, ax, az, bx, bz, w.doorOpenIdx)) { pair = [a, b, d]; break find; }
    }
  }
  ok(!!pair, "a place in the great hall with a wall between it and floor two metres off");
  if (pair) {
    w.place(s, pair[0]); s.job = null;
    const z = w.makeZombie("shambler", pair[1]); z.state = "idle"; z.nextThink = w.t + 600_000; z.heldQuiet = w.t + 600_000;
    let seen = 0;
    run(w, 3000, () => { if (s.threats.includes(z.i) || s.mode !== "job") seen++; });
    ok(seen === 0, `one of the dead ${pair[2].toFixed(1)} m off behind a wall is not backed away from (a threat or a fright for ${seen} steps; inside 2.5 m it used to be)`);
  }
}
// ---- driven off, and who comes -----------------------------------------------------------------------------------
{
  const { w, s } = alone(27), nav = w.nav, hall = nav.roomIdx.get("great-hall");
  const p = pairOf(w, "great-hall", "great-hall", true, 7, 11);
  ok(!!p, "a clear line of seven metres or more across the great hall");
  if (p) {
    w.place(s, p[0]); s.hp = 8;
    const z = w.makeZombie("shambler", p[1]); z.state = "idle"; z.nextThink = w.t + 600_000; z.heldQuiet = w.t + 600_000; z.h = Math.atan2(z.x - s.x, z.z - s.z);
    s.job = { kind: "run", cell: p[1], room: hall, since: w.t, phase: 0, until: w.t + 10 * 60_000 };
    let flips = 0, last = s.mode, gaveUpAt = 0;
    run(w, 60_000, () => {
      if (s.mode !== last) { flips++; last = s.mode; }
      if (!gaveUpAt && Object.keys(w.stats.jobFails).some((k) => k.endsWith(":driven off"))) gaveUpAt = w.t - T0;
      // (a body with no job picks one: keep the staging about this errand)
      if (gaveUpAt && s.job && s.job.kind !== "run") s.job = null;
    });
    // (inside a minute, not 45 s: the quiet they run to may be up the main stair, fourteen seconds each way. With
    // upstairs counted as out of doors nobody ran there, and this read 20 s: the grounds rule, Nov 14.)
    ok(gaveUpAt > 0 && gaveUpAt < 58_000, `badly hurt, with an errand that leads at one of the dead, they give the errand up (${gaveUpAt ? (gaveUpAt / 1000).toFixed(0) + " s in" : "never"}; they used to run and come back for ever)`);
    ok(flips <= 16, `and do not run and turn back every step meanwhile: ${flips} changes of mind in a minute (a runner keeps running three seconds; it was eighty a minute)`);
    ok(!!s.scaredOff && s.scaredOff.room === hall, "where the dead that did it stand is remembered");
    // somebody who can fight, elsewhere in the house, is offered it
    const b = w.survivors[1]; b.escaped = false; b.melee = "pipe"; w.place(b, nav.cellInRoom(nav.roomIdx.get("gallery"), 1, 0.5, 0.5)); b.job = null;
    ok(jobMenu(w, b).menu.some((m) => m.id === "clear:help" && m.job.room === hall), "and somebody who can fight is offered the clearing of it");
  }
}
// ---- the mansion's hand-offs -------------------------------------------------------------------------------------
{
  // two go with somebody, not four
  const w = mk(28), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  w.fac.bolt(GLEN.front); w.sc.boltedAt = w.t; for (const id of GLEN.windows) w.fac.board(id);
  const hall = nav.roomIdx.get("great-hall");
  w.survivors.forEach((x, i) => w.place(x, nav.cellInRoom(hall, 1, 0.3 + 0.08 * i, 0.5)));
  const lead = w.survivors[0];
  lead.job = { kind: "clear", room: hall, cell: lead.cell, since: w.t, phase: 0, until: w.t + 5 * 60_000 };
  const esc = (x) => { x.job = { kind: "escort", ally: lead.i, cell: lead.cell, since: w.t, phase: 0, until: w.t + 5 * 60_000 }; };
  const offered = (x) => jobMenu(w, x).menu.some((m) => m.kind === "escort" && m.job.ally === lead.i);
  for (const x of w.survivors.slice(1)) x.job = null;
  const keen = w.survivors.slice(3).find((x) => offered(x));
  ok(!!keen, "with nobody yet at their side, somebody would go along with the one sweeping the hall");
  if (keen) {
    esc(w.survivors[1]);
    const one = offered(keen);
    esc(w.survivors[2]);
    ok(one && !offered(keen), "one already with them, a second may go; two with them, a third is not offered it");
  }
}
{
  // the planks under somebody's arm count only on their way to a window
  const { w, s } = alone(29, false), b = w.survivors[1];
  for (const id of GLEN.windows.slice(1)) w.fac.board(id);
  const hall = w.nav.roomIdx.get("great-hall");
  w.place(s, w.nav.cellInRoom(hall, 1, 0.4, 0.5)); s.pack.spare.push("planks"); s.job = { kind: "talk", ally: b.i, cell: s.cell, since: w.t, phase: 0, until: w.t + 60_000 };
  b.escaped = false; w.place(b, w.nav.cellInRoom(hall, 1, 0.6, 0.5)); b.job = null;
  ok(jobMenu(w, b).menu.some((m) => m.job.target === "planks"), "one window open and its planks under the arm of somebody doing something else: another is offered the planks");
  s.job = { kind: "task", target: "board-" + GLEN.windows[0], cell: s.cell, since: w.t, phase: 0, until: w.t + 60_000 };
  ok(!jobMenu(w, b).menu.some((m) => m.job.target === "planks"), "...and not while the carrier is on their way to it");
  // a task they were just driven off is somebody else's for a while
  s.job = null; s.failedSpots.set("board-" + GLEN.windows[0], w.t);
  ok(!jobMenu(w, s).menu.some((m) => m.job.target === "board-" + GLEN.windows[0]), "a window they were just driven off is not offered back to them for ninety seconds");
  s.failedSpots.set("board-" + GLEN.windows[0], w.t - 91_000);
  ok(jobMenu(w, s).menu.some((m) => m.job.target === "board-" + GLEN.windows[0]), "...and is, after them");
}
{
  // shut in with the dead, the sweep is the thing to do; once the house is clear it is not
  const { w } = alone(31), nav = w.nav;
  const z = w.makeZombie("shambler", nav.cellInRoom(nav.roomIdx.get("library"), 1, 0.5, 0.5)); z.state = "idle"; z.nextThink = w.t + 600_000; z.heldQuiet = w.t + 600_000;
  run(w, 1500);
  const before = w.scn.secured(w);
  z.alive = false; z.gone = true; z.state = "dead";
  run(w, 2500);
  ok(before === true && w.sc.clearAt > 0 && w.scn.secured(w) === false, "the sweep's bonus stands while the dead are in the shut house and ends when it is clear");
  // the garage is not the house
  const gz = w.makeZombie("shambler", nav.cellInRoom(nav.roomIdx.get("garage"), 1, 0.5, 0.5)); gz.state = "idle"; gz.nextThink = w.t + 600_000; gz.heldQuiet = w.t + 600_000;
  ok(w.snapshot().goals.inside === 0, "one of the dead in the garage down the drive is not in the house");
}

// ---- the second round of the code review (Nov 14 2026) ----------------------------------------------------------
{
  // THE ONE BEHIND WAITS THEIR TURN: asked of the rule itself (staged in a room, the walk's own spacing hides it)
  const { w, s } = alone(31), nav = w.nav, hall = nav.roomIdx.get("great-hall");
  const b = w.survivors[1]; b.escaped = false;
  const c = nav.cellInRoom(hall, 1, 0.5, 0.5), [x, , z0] = nav.centre(c);
  const z = w.makeZombie("shambler", c); z.x = x; z.z = z0; z.target = -1;
  const put = (o, dx, dz, mode) => { o.x = x + dx; o.z = z0 + dz; o.floor = 1; o.mode = mode; };
  const asks = typeof fighterInWay === "function" ? [
    [() => { put(s, 0, 2.0, "fight"); put(b, 0, 1.2, "fight"); }, true, "a friend fighting 0.8 m ahead, on the line to it"],
    [() => { put(s, 0, 2.0, "fight"); put(b, 0.7, 1.2, "fight"); }, false, "the same friend 0.7 m off the line"],
    [() => { put(s, 0, 2.0, "fight"); put(b, 0, 2.8, "fight"); }, false, "a friend behind them"],
    [() => { put(s, 0, 2.0, "fight"); put(b, 0, 1.2, "job"); }, false, "a friend ahead who is not fighting"],
    [() => { put(s, 0, 3.4, "fight"); put(b, 0, 1.2, "fight"); }, false, "a fighting friend two metres ahead (room to come up)"],
  ].map(([stage, want, what]) => { stage(); return [fighterInWay(w, s, z) === want, what, want]; }) : [[false, "the rule is there to ask", true]];
  ok(asks.every(([good]) => good), `the second fighter waits for the first and for nothing else (${asks.filter(([good]) => !good).map(([, what]) => "wrong on: " + what).join("; ") || asks.length + " cases"})`);
}
{
  // MAKE WAY: a leader with somewhere to go and two escorts standing in front of them, in the narrow places
  const rows = [];
  // (several seeds: the same staging on other dice once put Dale 0.7 m to one side of his leader, where the rule
  // did not count him as in the way)
  for (const seed of [35, 36, 37, 38]) for (const [room, fl] of [["w-corridor", 1], ["e-corridor", 1], ["w-upper-corridor", 0], ["gallery", 1]]) {
    const w = mk(seed), nav = w.nav;
    for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
    w.fac.bolt(GLEN.front); w.sc.boltedAt = w.t; for (const id of GLEN.windows) w.fac.board(id);
    const r = nav.roomIdx.get(room), c = (u) => nav.cellInRoom(r, fl, u, 0.5);
    const [lead, e1, e2] = w.survivors;
    for (const o of w.survivors.slice(3)) o.escaped = true;
    const goal = c(0.9), [gx, , gz] = nav.centre(goal);
    w.place(lead, c(0.15)); w.place(e1, c(0.3)); w.place(e2, c(0.38));
    const errand = () => ({ kind: "run", cell: goal, room: r, since: w.t, phase: 0, until: w.t + 5 * 60_000 });
    const along = () => ({ kind: "escort", ally: lead.i, cell: lead.cell, since: w.t, phase: 0, until: w.t + 5 * 60_000 });
    lead.job = errand(); e1.job = along(); e2.job = along();
    let at = 0;
    for (let t = 0; t < 40_000 && !at; t += 100) {
      w.tick(100);
      if (lead.job?.kind !== "run") lead.job = errand();
      for (const e of [e1, e2]) if (e.job?.kind !== "escort") e.job = along();
      if (Math.hypot(lead.x - gx, lead.z - gz) < 1.0) at = t;
    }
    rows.push([room + "/" + seed, at, Object.entries(w.stats.jobFails).filter(([k]) => k === "run:stuck").reduce((n, [, v]) => n + v, 0)]);
  }
  ok(rows.every(([, at, stuck]) => at > 0 && at < 25_000 && stuck === 0), `two escorts standing in front of the one they are with let them by, in every narrow place on four sets of dice: ${rows.filter(([, at, stuck]) => !(at > 0 && at < 25_000 && stuck === 0)).map(([room, at, stuck]) => `${room} ${at ? (at / 1000).toFixed(0) + " s" : "NEVER"}${stuck ? ` (given up ${stuck}x)` : ""}`).join(", ") || `${rows.length} of ${rows.length}, the slowest ${(Math.max(...rows.map(([, at]) => at)) / 1000).toFixed(0)} s`} (in the east corridor's side passage they never did: found Nov 14)`);
}
{
  // SOMEBODY COMING WITH THEM IS COMPANY, whatever floor they are on
  const w = mk(29), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  w.fac.bolt(GLEN.front); w.sc.boltedAt = w.t; for (const id of GLEN.windows) w.fac.board(id);
  const [s, e] = w.survivors; for (const o of w.survivors.slice(2)) o.escaped = true;
  const hall = nav.roomIdx.get("great-hall"), up = nav.roomIdx.get("mr-glenn-bedroom");
  w.place(s, nav.cellInRoom(up, nav.rooms[up].floor, 0.5, 0.5)); w.place(e, nav.cellInRoom(hall, 1, 0.5, 0.5));
  s.job = null; e.job = null; s.retryAt = 0;
  s.know.ally.set(e.i, { room: hall, t: w.t, state: "ok" });
  const regroup = () => jobMenu(w, s).menu.some((m) => m.job.kind === "regroup");
  const before = regroup();
  e.job = { kind: "escort", ally: s.i, cell: s.cell, since: w.t, phase: 0, until: w.t + 5 * 60_000 };
  ok(before && !regroup(), "upstairs alone they would go back down for whoever they last saw; not when that one is on their way up to them (they went up and down the stair after their own escort)");
}
{
  // A FIGHTER GOING AT ONE THAT STANDS STILL walks to it (seed 238: Rick, a step past a doorway, was turned back to
  // the doorway's point by a new route twice a second and walked on the spot for seventy-five seconds)
  // (STAGED where it happened, not a whole show played: the show moves with every change to the rules, and the
  // re-grade found this passing without the fix. The opening between the east lawn and the forecourt; one of the
  // dead standing still four metres through it.)
  const w = mk(238), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const s = w.survivors.find((x) => x.who === "rick"); for (const o of w.survivors) if (o !== s) o.escaped = true;
  const from = nav.cellAt(1, 27.66, 26.95), at = nav.cellAt(1, 28.13, 23.13);
  ok(from >= 0 && at >= 0 && nav.door[from] >= 0 && nav.isWalk(at), "the opening between the east lawn and the forecourt is where it was");
  w.place(s, from); s.x = 27.66; s.z = 26.95; s.hp = s.hpMax; s.stamina = 1; s.job = null;
  const z = w.makeZombie("shambler", at); z.hp = 99999; z.hpMax = 99999;
  let fought = 0, nearest = 99;
  // (after them, so it is seen in the dark, and held where it stands)
  for (let t = 0; t < 15_000; t += 100) { z.state = "chase"; z.target = s.i; z.stagger = w.t + 5000; w.tick(100); if (s.mode === "fight") fought++; nearest = Math.min(nearest, Math.hypot(s.x - z.x, s.z - z.z)); }
  ok(fought > 20 && nearest < 1.6, `a fighter a step past a doorway walks to one of the dead that stands still (${nearest.toFixed(1)} m at the nearest in fifteen seconds, fighting for ${(fought / 10).toFixed(0)} s; a new route twice a second turned Rick back to the doorway's point and he walked on the spot for 75 s)`);
}

{
  // A FRIEND DOWN IN THE FRONT DOORWAY is got up by the one at the bolt, not waited on (the code review's B-10)
  const w = mk(33), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const [s, f] = w.survivors; for (const o of w.survivors.slice(2)) o.escaped = true;
  const di = nav.doorIdx.get(GLEN.front), sp = nav.spots["front-bolt"];
  let dc = -1; for (let c = 0; c < nav.walk.length && dc < 0; c++) if (nav.walk[c] && nav.door[c] === di) dc = c;
  const sc = nav.cellAt(sp.floor, sp.stand[0], sp.stand[2]);
  ok(dc >= 0 && sc >= 0, "the front door has a cell to lie in and the bolt a place to stand");
  w.place(s, sc); w.place(f, dc);
  w.down(f.id);
  const bolt = () => ({ kind: "task", target: "front-bolt", cell: sc, room: nav.room[sc], since: w.t, phase: 0, until: w.t + 6 * 60_000 });
  s.job = bolt(); f.hp = 1; f.downUntil = w.t + 10 * 60_000;
  // (THE CASE THE RULE IS FOR: somebody who would not have gone to the friend of their own accord, with the bolt at
  // its last inch. They are kept at the bolt until it is held there; the first cut of this staging let the ordinary
  // offer of a revive win in seven seconds and passed without the fix: the re-grade.)
  let held = 0, helped = 0;
  for (let t = 0; t < 40_000 && !helped; t += 100) {
    w.tick(100);
    const work = w.sc.work["front-bolt"] ?? 0;
    if (!held) { if (!(s.job?.kind === "task" && s.job.target === "front-bolt")) s.job = bolt(); if (work >= GLEN.boltMs * 0.97) held = t; }
    else if (s.job?.kind === "revive" && s.job.ally === f.i) helped = t;
    else if (t - held > 6000) break;
  }
  ok(held > 0 && f.mode === "down" && !w.fac.bolted.has(GLEN.front), `the bolt is held at its last inch by a friend down in the doorway (${held ? (held / 1000).toFixed(0) + " s in" : "never reached"})`);
  ok(helped > 0 && helped - held <= 3000, `...and the one at the bolt turns to them (${helped ? ((helped - held) / 1000).toFixed(1) + " s after" : "not in six seconds"}; they used to stand there until the friend died)`);
}

{
  // ONE OF THE DEAD ON THE FAR SIDE OF THE BOLTED FRONT DOOR is not "within a hand's reach" (seed 56: Johanna, 1.2 m
  // from one beating on the door, backed off from it for forty minutes with the fuel errand in her name)
  const { w, s } = alone(34), nav = w.nav;
  const di = nav.doorIdx.get(GLEN.front), vest = nav.roomIdx.get("vestibule"), fore = nav.roomIdx.get("forecourt");
  let pair = null;
  for (let a = 0; a < nav.walk.length && !pair; a++) {
    if (!nav.walk[a] || nav.room[a] !== vest || nav.door[a] >= 0) continue;
    const [ax, , az] = nav.centre(a);
    for (let b = 0; b < nav.walk.length && !pair; b++) {
      if (!nav.walk[b] || nav.room[b] !== fore || nav.door[b] >= 0) continue;
      const [bx, , bz] = nav.centre(b), d = Math.hypot(bx - ax, bz - az);
      if (d > 1.15 || d < 0.6) continue;
      let through = false;
      for (let i = 0; i <= 12; i++) { const c = nav.cellAt(1, ax + (bx - ax) * i / 12, az + (bz - az) * i / 12); if (c >= 0 && nav.door[c] === di) through = true; }
      if (through) pair = [a, b, d];
    }
  }
  ok(!!pair, "a place in the vestibule within a hand's reach of the forecourt, through the front door");
  if (pair) {
    w.place(s, pair[0]); s.hp = s.hpMax;
    const z = w.makeZombie("shambler", pair[1]); z.state = "idle"; z.nextThink = w.t + 600_000; z.heldQuiet = w.t + 600_000;
    s.job = { kind: "guard", ally: s.i, cell: s.cell, since: w.t, phase: 1, until: w.t + 60_000 };
    let scared = 0, threat = 0;
    run(w, 8000, () => { if (["backoff", "flee", "hide", "fight", "panic"].includes(s.mode)) scared++; if (s.threats.length) threat++; if (!s.job) s.job = { kind: "guard", ally: s.i, cell: s.cell, since: w.t, phase: 1, until: w.t + 60_000 }; });
    ok(w.fac.bolted.has(GLEN.front) && scared === 0 && threat === 0, `one of the dead ${pair[2].toFixed(1)} m off on the far side of the bolted front door is not a threat (a threat for ${threat} steps, out of the job mode for ${scared})`);
  }
}

{
  // TWO SHOWS THAT WENT WRONG in the soak of the second round, played whole. Seed 11: Sarah, hiding six metres from
  // the dead at their meal, was flushed out and hid again twice a second (124 changes of mind in a minute). Seed
  // 56: Johanna backed off for forty minutes from one beating on the far side of the bolted door, and the hour
  // ran out with five alive.
  const play = (seed) => {
    const w = mk(seed), mode = new Map(), flips = new Map(); let minute = 0, worst = 0;
    for (let t = 0; t < 60 * 60_000 && !w.obj.ending; t += 100) {
      w.tick(100);
      for (const x of w.survivors) { if (!x.alive || x.escaped) continue; if (mode.get(x.who) !== x.mode) { mode.set(x.who, x.mode); flips.set(x.who, (flips.get(x.who) ?? 0) + 1); } }
      const m = Math.floor(t / 60_000);
      if (m !== minute) { for (const n of flips.values()) worst = Math.max(worst, n); flips.clear(); minute = m; }
    }
    return { worst, end: w.obj.ending || "running", alive: w.survivors.filter((x) => x.alive && !x.turned).length };
  };
  const a = play(11), b = play(56);
  ok(a.worst < 80 && b.worst < 80, `nobody flickers in and out of hiding (seed 11's worst minute: ${a.worst} changes of mind; seed 56's: ${b.worst}; it was 124)`);
  ok(!(a.end === "timeout" && a.alive >= 3) && !(b.end === "timeout" && b.alive >= 3), `neither runs out the hour with people standing about (seed 11 ${a.end}, ${a.alive} alive; seed 56 ${b.end}, ${b.alive} alive; seed 56 was a timeout with five)`);
}
{
  // WHERE TO LOOK IS THE MAP'S TO SAY: hurt and with nothing for it, the bathroom cabinet is the place
  const { w, s } = alone(42), nav = w.nav;
  const bed = nav.roomIdx.get("mr-glenn-bedroom");
  w.place(s, nav.cellInRoom(bed, nav.rooms[bed].floor, 0.5, 0.5)); s.job = null; s.retryAt = 0;
  const best = () => { const m = jobMenu(w, s).menu.filter((x) => x.job.kind === "loot" && x.job.target && !x.job.target.startsWith("crest")).sort((x, y) => y.score - x.score); return m[0]?.job.target ?? ""; };
  s.hp = s.hpMax * 0.4; s.pack.bandage = 0; s.pack.medkit = 0;
  const hurt = [best(), best(), best()];
  ok(hurt.every((id) => /^bath-/.test(id)), `hurt, with no bandage, the first place they would look is a bathroom cabinet (${hurt[0]}; the mansion had no such word and they looked wherever was nearest)`);
}

{
  // THERE IS A CHAIN (the re-grade: with none at all the whole-show count below read 0 and passed)
  const w = mk(43), z = w.zombies.find((x) => x.leash);
  ok(!!z && z.leash[2] === GLEN.chainM && w.nav.rooms[z.room]?.id === "cellar-cell", "the one in the cell has a chain of the dial's length");
}
{
  // ITS REACH STAYS INSIDE THE BARS (Nov 14, late: the chain was 2.4 m in a cell with a metre and a half of floor,
  // its gate a pace from the foot of the basement stair. Whoever came down for planks walked into it, and it was
  // dead by minute three of every show with the cell's crest unguarded.)
  const w = mk(45), nav = w.nav, z = w.zombies.find((x) => x.leash), cell = nav.roomIdx.get("cellar-cell");
  for (const o of w.zombies) if (o !== z) { o.alive = false; o.gone = true; o.state = "dead"; }
  const s = w.survivors[0]; for (const o of w.survivors) if (o !== s) o.escaped = true;
  let near = -1, nd = Infinity;
  for (let c = 0; c < nav.walk.length; c++) {
    if (!nav.walk[c] || nav.door[c] >= 0 || nav.room[c] === cell || nav.room[c] < 0 || nav.floorOfCell(c) !== z.floor) continue;
    const [x, , zz] = nav.centre(c), d = Math.hypot(x - z.leash[0], zz - z.leash[1]);
    if (d < nd) { nd = d; near = c; }
  }
  ok(nd > GLEN.chainM + 1.0, `the nearest floor outside the cell is ${nd.toFixed(2)} m from the ring, past the chain and an arm (${(GLEN.chainM + 1).toFixed(2)} m)`);
  // somebody standing there, about something else: left alone, and leaves it alone
  const hp = s.hp; let threat = 0;
  s.job = null;
  for (let t = 0; t < 6000; t += 100) { w.place(s, near); s.nextThink = w.t + 60_000; s.retryAt = w.t + 60_000; w.tick(100); if (s.threats.includes(z.i)) threat++; }
  ok(threat === 0 && s.hp === hp && z.hp === z.hpMax, `six seconds at the nearest place outside the cell: it is no threat to them (${threat} steps of 60), nobody is hurt (${Math.round(hp - s.hp)} hp) and it is not touched (${Math.round(z.hpMax - z.hp)} hp)`);
  // ...and in plain sight of it, on the far side of the gate, it is left alone (the cell has nothing in it for anybody)
  let gate = -1, gd = Infinity;
  for (let c = 0; c < nav.walk.length; c++) {
    if (!nav.walk[c] || nav.floorOfCell(c) !== z.floor) continue;
    const [x, , zz] = nav.centre(c), d = Math.hypot(x - z.leash[0], zz - z.leash[1]);
    if (d > GLEN.chainM + 1.1 && d < gd && nav.segLine(z.floor, x, zz, z.x, z.z, line(w))) { gd = d; gate = c; }
  }
  let other = 0;
  s.job = null;
  for (let t = 0; t < 1000; t += 100) { w.place(s, gate); s.nextThink = w.t + 60_000; s.retryAt = w.t + 60_000; w.tick(100); if (s.threats.includes(z.i)) other++; }
  ok(gate >= 0 && other === 0, `in plain sight of it ${gd.toFixed(1)} m from the ring it is left alone (a threat for ${other} steps of 10)`);
  // nobody is sent to sweep its room
  s.job = null; s.retryAt = 0; s.know.swept[cell] = 0; s.know.danger[cell] = 1;
  const swept = jobMenu(w, s).menu.some((m) => m.job.kind === "clear" && m.job.room === cell);
  ok(!swept, "nobody is offered a sweep of the cell while the one in it is on its chain");
}

{
  // THE HOUSE IS ALL OF ITS FLOORS (found Nov 14): "in the house" was what joins the great hall by a DOOR, and the
  // floors are joined by stairs. The upper floor and the cellars were "the grounds": somebody in a bedroom was
  // offered "get inside the house, out of the rain", the dead upstairs did not count for "Clear the house", and
  // nobody ran upstairs for quiet.
  const { w, s } = alone(44), nav = w.nav;
  const out = (id) => !!w.scn.outside(w, nav.roomIdx.get(id));
  const indoors = ["great-hall", "mr-glenn-bedroom", "upper-gallery", "nursery", "furnace-room", "coal-store", "cellar-cell", "kitchen", "hidden-study"];
  const outdoors = ["west-lawn", "terrace", "forecourt", "dining-porch", "west-porch", "garage", "garage-court"];
  ok(indoors.every((id) => !out(id)) && outdoors.every(out), `every floor of the house is indoors, and the lawns, the open porches and the garage are not (wrong: ${[...indoors.filter(out), ...outdoors.filter((id) => !out(id))].join(", ") || "none"})`);
  const inside = (id) => { const r = nav.roomIdx.get(id); w.place(s, nav.cellInRoom(r, nav.rooms[r].floor, 0.5, 0.5)); s.job = null; s.retryAt = 0; return jobMenu(w, s).menu.some((m) => m.id === "run:inside"); };
  const up = inside("mr-glenn-bedroom"), down = inside("furnace-room"), lawn = inside("west-lawn");
  ok(!up && !down && lawn, `"get inside the house" is offered on the lawn (${lawn}) and not in a bedroom (${up}) or the furnace room (${down})`);
}

// ---- the mansion's rules the second re-grade found with no check of their own (section B, Nov 14) --------------------
{
  // THE CLOCK IS THE OBJECTIVE (Josh, Nov 17 2026): anybody alive when the show's time is up survived; nobody, wiped
  const stage = (seed) => {
    const w = mk(seed), nav = w.nav, hall = nav.roomIdx.get("great-hall");
    for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
    w.survivors.forEach((x, i) => { w.place(x, nav.cellInRoom(hall, 1, 0.3 + 0.07 * i, 0.5)); x.job = null; });
    w.showMs = (w.t - w.startedAt) + 5000;
    return w;
  };
  const one = stage(46);
  one.survivors[0].alive = false; one.survivors[0].mode = "dead";
  let rowDone = 0;
  for (let t = 0; t < 20_000 && !one.obj.ending; t += 100) one.tick(100);
  rowDone = one.scn.goals(one).rows.find((r) => r.id === "survive")?.done ?? 0;
  const lived = one.survivors.filter((x) => x.alive).map((x) => x.who).sort().join(",");
  ok(one.obj.ending === "survived" && one.obj.rescued.slice().sort().join(",") === lived && rowDone > 0, `the clock running out with five alive is SURVIVED, naming the five (${one.obj.ending || "still going"}: ${one.obj.rescued.join(", ")}; the row done ${rowDone > 0})`);
  const two = stage(47);
  for (const x of two.survivors) { x.alive = false; x.mode = "dead"; }
  for (let t = 0; t < 2000 && !two.obj.ending; t += 100) two.tick(100);
  ok(two.obj.ending === "wiped", `nobody alive is wiped, whatever the clock says (${two.obj.ending || "still going"})`);
  const goals = one.scn.goals(one);
  ok(!goals.rows.some((r) => /crest|secret|car/.test(r.id)) && goals.rows[0].id === "survive", `the rows are the clock and the house's defences, nothing of the crests, the secret or the car (${goals.rows.map((r) => r.id).join(", ")})`);
}
{
  // NOBODY IS SENT AFTER THE OLD OBJECTIVES: no chimneypiece, crest, journals, keys, fuel or car on any menu
  const { w, s } = alone(48, false), nav = w.nav;
  w.fac.doors.get(GLEN.front).locked = false; w.fac.bolted.delete(GLEN.front); w.sc.boltedAt = 0;
  const hall = nav.roomIdx.get("great-hall"); w.place(s, nav.cellInRoom(hall, 1, 0.5, 0.5));
  w.startedAt = w.t - 30 * 60_000;
  s.job = null; s.retryAt = 0;
  const old = jobMenu(w, s).menu.filter((m) => /^(look-chimney|set-crest|journals|fuel|fuel-car|car-in|car-keys|ledger|butler-key|crest-)/.test(m.job.target ?? "") || /^escort:(fuel|car)$/.test(m.id));
  ok(old.length === 0, `half an hour in, none of the old objectives is on the menu (${old.map((m) => m.id).join(", ") || "none"})`);
  // A LEAF ON HINGES ONLY: nobody "shuts" a window or puts the hearth stone back
  const actor = { kind: "survivor", id: s.id };
  const win = GLEN.windows[0], D = nav.doors[nav.doorIdx.get(win)];
  w.fac.doors.get(win).open = true; w.fac.doors.get(GLEN.stone).open = true;
  const r1 = w.fac.close(actor, win, D.a), r2 = w.fac.close(actor, GLEN.stone, "inglenook");
  ok(!r1.ok && r1.why === "nothing_to_close" && !r2.ok && r2.why === "nothing_to_close" && w.fac.doors.get(win).open && w.fac.doors.get(GLEN.stone).open, `a window and the hearth stone are not shut by a hand (${r1.why}, ${r2.why})`);
}
{
  // THE BOLT, A FRIEND DOWN IN THE DOORWAY, AND NOTHING TO GET THEM UP WITH: the one at the bolt is not given a
  // revive they cannot do (it was dropped the same step and given again, 18 changes of job in 17 s)
  const w = mk(33), nav = w.nav;
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const [s, f] = w.survivors; for (const o of w.survivors.slice(2)) o.escaped = true;
  const di = nav.doorIdx.get(GLEN.front), sp = nav.spots["front-bolt"];
  let dc = -1; for (let c = 0; c < nav.walk.length && dc < 0; c++) if (nav.walk[c] && nav.door[c] === di) dc = c;
  w.place(s, nav.cellAt(sp.floor, sp.stand[0], sp.stand[2])); w.place(f, dc);
  w.down(f.id); s.pack.bandage = 0; s.pack.medkit = 0;
  let changes = 0, last = "", revives = 0;
  for (let t = 0; t < 17_000; t += 100) {
    w.tick(100);
    const k = s.job ? s.job.kind + ":" + (s.job.target ?? s.job.ally ?? "") : "-";
    if (k !== last) { changes++; last = k; if (k.startsWith("revive")) revives++; }
  }
  ok(revives === 0 && changes <= 6, `with no bandage, the one at the bolt is not handed a revive over and over (${revives} times, ${changes} changes of job in 17 s; it was 5 and 18)`);
}

{
  // THE BOARDS GIVE WAY to one of the dead standing at the window, out of doors, and to nothing else
  const stage = (seed, where) => {
    const { w } = alone(seed), nav = w.nav, win = "dining-window", di = nav.doorIdx.get(win), c = nav.doorCentre[di], D = nav.doors[di];
    w.sc.boarded[win] = { at: w.t, by: "test" };
    const want = nav.roomIdx.get(where === "outside" ? D.b : "boys-bedroom-a");
    let cell = -1, bd = Infinity;
    for (let k = 0; k < nav.walk.length; k++) { if (!nav.walk[k] || nav.room[k] !== want || nav.door[k] >= 0) continue; const [x, , z] = nav.centre(k), d = Math.hypot(x - c[0], z - c[2]); if (d < bd) { bd = d; cell = k; } }
    const z = w.makeZombie("shambler", cell);
    for (let t = 0; t < GLEN.bangMs * 2 + 5000; t += 100) { z.state = "idle"; z.nextThink = w.t + 600_000; z.heldQuiet = w.t + 600_000; z.target = -1; w.tick(100); }
    return { planks: w.fac.doors.get(win).barricade, d: bd };
  };
  const out = stage(49, "outside"), above = stage(50, "above");
  ok(out.d < GLEN.bangReachM && out.planks < 3, `one of the dead standing ${out.d.toFixed(1)} m from a boarded window, out of doors, knocks its planks off (${out.planks} of 3 left after two turns)`);
  ok(above.d < GLEN.bangReachM && above.planks === 3, `one standing in the bedroom over it, ${above.d.toFixed(1)} m off on the plan, does not (${above.planks} of 3 left; it opened the window in two minutes)`);
}

// ---- the shared rules the second re-grade found (section A, Nov 14) ---------------------------------------------------
{
  // A GUARD STANDS BY SOMEBODY AT A MAP'S OWN WORK: the mansion offers it, and the guard's step let it go the step
  // it was taken, every step (2.3% of all the mansion's survivor time)
  const { w, s } = alone(52), nav = w.nav, b = w.survivors[1];
  b.escaped = false;
  const win = GLEN.windows[0], sp = nav.spots["board-" + win] ?? Object.values(nav.spots).find((x) => x.id === "board-" + win);
  const hall = nav.roomIdx.get("great-hall");
  w.place(s, nav.cellInRoom(hall, 1, 0.4, 0.5)); w.place(b, nav.cellInRoom(hall, 1, 0.55, 0.5));
  s.busyAct = "task"; s.busyUntil = w.t + 60_000; s.job = { kind: "task", target: "board-" + win, cell: s.cell, since: w.t, phase: 0, until: w.t + 120_000 };
  b.job = { kind: "guard", ally: s.i, cell: b.cell, since: w.t, phase: 0, until: w.t + 120_000 };
  b.busyAct = ""; b.busyUntil = 0;   // (a body is busy for its first two seconds in the world: it would not be stepped)
  b.nextThink = w.t + 60_000;        // (...and thinks again at once: this is about the step, not the menu)
  let kept = 0;
  for (let t = 0; t < 2000; t += 100) { s.busyAct = "task"; s.busyUntil = w.t + 60_000; w.tick(100); if (b.job?.kind === "guard") kept++; }
  ok(kept === 20, `a guard stands by somebody at a map's own work (kept for ${kept} of 20 steps; it was let go the step it was taken)`);
  // SOMEBODY TO GO WITH is on their feet and not themselves resting or following (the rule every escort is
  // offered by: survivor.ts canEscort)
  s.busyAct = ""; s.busyUntil = 0;
  s.job = { kind: "task", target: "board-" + win, cell: s.cell, since: w.t, phase: 0, until: w.t + 60_000 };
  const walking = canEscort(s);
  s.job = { kind: "rest", cell: s.cell, since: w.t, phase: 0, until: w.t + 60_000 };
  const resting = canEscort(s);
  ok(walking && !resting, `somebody about their work can be gone with (${walking}); somebody resting cannot (${resting}; it was offered and let go 600 times in a minute)`);
}
{
  // THE HANDS COME OFF WHEN SOMEBODY GOES DOWN
  const { w, s } = alone(53), o = w.survivors[1];
  s.busyAct = "revive"; s.busyUntil = w.t + 8000; s.reviving = o.i;
  w.down(s.id);
  ok(s.busyAct === "" && s.busyUntil === 0 && s.reviving === -1, `put down half-way through a kneel, the kneel is over (busy "${s.busyAct}", reviving ${s.reviving}; the friend used to stand up when the clock ran out, the kneeler on the floor)`);
}
{
  // ONE PAIR OF HANDS for a friend on the floor: the nearer one going to them has it
  const w = mk(54), nav = w.nav, hall = nav.roomIdx.get("great-hall");
  for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
  const [f, near, far] = w.survivors; for (const o of w.survivors.slice(3)) o.escaped = true;
  w.place(f, nav.cellInRoom(hall, 1, 0.5, 0.5)); w.place(near, nav.cellInRoom(hall, 1, 0.55, 0.55)); w.place(far, nav.cellInRoom(hall, 1, 0.2, 0.3));
  w.down(f.id);
  for (const x of [near, far]) { x.pack.bandage = 2; x.know.ally.set(f.i, { room: f.room, t: w.t, state: "down" }); x.helping = f.i; }
  near.job = { kind: "revive", ally: f.i, cell: f.cell, since: w.t, phase: 0, until: w.t + 90_000 };
  far.job = null; far.retryAt = 0;
  const offered = jobMenu(w, far).menu.some((m) => m.job.kind === "revive" && m.job.ally === f.i);
  near.job = null; near.retryAt = 0;
  const alone2 = jobMenu(w, far).menu.some((m) => m.job.kind === "revive" && m.job.ally === f.i);
  ok(!offered && alone2, `with somebody nearer already going to a friend on the floor, the further one is not sent too (offered ${offered}); with nobody going, they are (${alone2})`);
}
{
  // ONE OF THE DEAD A METRE OFF THROUGH A WALL DOES NOT TAKE HOLD (a metre on the plan was all that was asked)
  const { w, s } = alone(55), nav = w.nav;
  // (any two rooms of the ground floor: the great hall's own walls are too thick for it)
  let pair = null;
  find: for (let a = 0; a < nav.walk.length; a += 3) {
    if (!nav.walk[a] || nav.room[a] < 0 || nav.door[a] >= 0 || nav.floorOfCell(a) !== 1 || nav.rooms[nav.room[a]].outdoor) continue;
    const [ax, , az] = nav.centre(a);
    for (const r of [0.6, 0.8, 0.95]) for (let k = 0; k < 16; k++) {
      const b = nav.cellAt(1, ax + Math.sin(k * Math.PI / 8) * r, az + Math.cos(k * Math.PI / 8) * r);
      if (b < 0 || !nav.isWalk(b) || nav.room[b] < 0 || nav.room[b] === nav.room[a] || nav.door[b] >= 0) continue;
      const [bx, , bz] = nav.centre(b), d = Math.hypot(bx - ax, bz - az);
      if (d <= 0.98 && !nav.segLine(1, ax, az, bx, bz, line(w)) && !nav.sees(1, ax, az, bx, bz, w.doorOpenIdx)) { pair = [a, b, d]; break find; }
    }
  }
  ok(!!pair, "two rooms of the house with floor under a metre apart and a wall between");
  if (pair) {
    w.place(s, pair[0]); s.job = null;
    const z = w.makeZombie("shambler", pair[1]);
    let held = 0, hurt = s.hp;
    // (both held where they stand: it would walk round by a door, as it should)
    for (let t = 0; t < 6000; t += 100) { z.state = "chase"; z.target = s.i; z.nextThink = w.t + 60_000; z.path = null; w.place(z, pair[1]); w.place(s, pair[0]); w.tick(100); if (s.grabbedBy.length) held++; }
    ok(held === 0 && s.hp === hurt, `one of the dead ${pair[2].toFixed(2)} m off through a wall, after them for six seconds, does not take hold (held for ${held} steps, ${Math.round(hurt - s.hp)} hp lost)`);
  }
}
{
  // ONE COMING IN OVER A SILL IS SEEN AT THE PLACE IT WILL LAND
  const { w, s } = alone(56), nav = w.nav;
  const p = pairOf(w, "great-hall", "great-hall", true, 3, 5);
  ok(!!p, "two places in the great hall a few metres apart");
  if (p) {
    w.place(s, p[0]); s.job = null;
    const lawn = nav.roomIdx.get("west-lawn"), out = nav.cellInRoom(lawn, nav.rooms[lawn].floor, 0.5, 0.5);
    const z = w.makeZombie("shambler", out), [lx, ly, lz] = nav.centre(p[1]);
    z.state = "chase"; z.target = s.i; z.nextThink = w.t + 60_000;
    z.link = { portal: -1, t0: w.t, ms: 600_000, x0: z.x, z0: z.z, y0: z.y, x1: lx, z1: lz, y1: ly, f1: 1 };
    let seen = 0;
    for (let t = 0; t < 1000; t += 100) { w.tick(100); if (s.threats.includes(z.i)) seen++; }
    ok(seen > 0, `one of the dead on its way in, to land ${p[2].toFixed(1)} m off, is a threat before it lands (${seen} of 10 steps; it was nobody's until it stood on the floor)`);
  }
}
{
  // THE SWEEP COMES FIRST FOR A WHILE, NOT ALL NIGHT
  const { w } = alone(57), g = w.sc;
  for (const id of GLEN.windows) g.boarded[id] = { at: w.t, by: "test" };
  w.makeZombie("shambler", w.nav.cellInRoom(w.nav.roomIdx.get("nursery"), w.nav.rooms[w.nav.roomIdx.get("nursery")].floor, 0.5, 0.5));
  const first = w.scn.secured(w);
  for (const id of GLEN.windows) g.boarded[id].at = w.t - GLEN.sweepFirstMs - 1000;
  g.boltedAt = w.t - GLEN.sweepFirstMs - 1000;
  const later = w.scn.secured(w);
  ok(first && !later, `with the house shut and the dead still in it the sweep comes first (${first}), and no longer once ${GLEN.sweepFirstMs / 60_000} minutes have gone by (${later})`);
}

{
  // HOW NEAR IS A SLOPE (section A's re-grade): a step across the ten-metre line moved the threat by two fifths, and
  // four of the dead standing there had somebody in, out, in, every 900 ms
  const read = (dMin, dMax) => {
    const { w, s } = alone(58), p = pairOf(w, "great-hall", "great-hall", true, dMin, dMax);
    if (!p) return null;
    w.place(s, p[0]); s.job = null; s.nextThink = w.t + 60_000; s.retryAt = w.t + 60_000;
    const z = w.makeZombie("shambler", p[1]); z.state = "idle"; z.nextThink = w.t + 60_000;
    w.tick(100);
    return { d: p[2], threat: s.threat };
  };
  const a = read(9.2, 9.9), b = read(10.1, 10.8);
  ok(!!a && !!b && a.threat > 0 && b.threat > 0 && b.threat / a.threat > 0.85, `one of the dead at ${a?.d.toFixed(1)} m and at ${b?.d.toFixed(1)} m is nearly the same threat (${a?.threat.toFixed(2)} and ${b?.threat.toFixed(2)}; across the ten-metre line it fell by two fifths in a stride)`);
}
{
  // SOMEBODY BETWEEN TWO JOBS IS WAITED ON, a few seconds, by whoever is going with them (section A's re-grade)
  const { w, s } = alone(59), nav = w.nav, b = w.survivors[1], hall = nav.roomIdx.get("great-hall");
  b.escaped = false;
  w.place(s, nav.cellInRoom(hall, 1, 0.4, 0.5)); w.place(b, nav.cellInRoom(hall, 1, 0.55, 0.5));
  const hold = () => { b.job = null; b.busyAct = ""; b.busyUntil = 0; b.nextThink = w.t + 60_000; b.retryAt = w.t + 60_000; };
  s.busyAct = ""; s.busyUntil = 0; s.hungerH = 0; s.thirstH = 0;
  const j0 = s.job = { kind: "escort", ally: b.i, cell: b.cell, since: w.t, phase: 0, until: w.t + 120_000 };
  let at3 = false;
  for (let t = 0; t < 3000; t += 100) { hold(); s.nextThink = w.t + 60_000; s.rethink = false; w.tick(100); }
  at3 = s.job === j0;     // (the same going-with, not one let go and picked again)
  for (let t = 0; t < 7000; t += 100) { hold(); s.retryAt = w.t + 60_000; w.tick(100); }
  ok(at3 && s.job?.kind !== "escort", `the one they are going with has nothing in hand: still with them three seconds on (${at3}), and let go by ten (${s.job?.kind !== "escort"}; it was let go that step and picked again the next)`);
}

{
  // A REVIVER KEPT OFF THE PLACE (section A's re-grade, A-4): refused every step a metre short, they "walked" on
  // the spot until the friend bled out. Two seconds of it: kneel where they are if that is in reach, else let it go.
  const kept = (gap) => {
    const w = mk(60), nav = w.nav, hall = nav.roomIdx.get("great-hall");
    for (const z of w.zombies) { z.alive = false; z.gone = true; z.state = "dead"; }
    const [o, s] = w.survivors; for (const x of w.survivors.slice(2)) x.escaped = true;
    w.place(o, nav.cellInRoom(hall, 1, 0.5, 0.5)); w.down(o.id);
    // (where the reviver kneels: side-on to the chest, the CPR's hands 0.38 m ahead — survivor.ts kneelAt)
    const L = lieOf(o), nx = L.uz, nz = -L.ux, kx = L.cx + nx * 0.38, kz = L.cz + nz * 0.38;
    const at = nav.cellAt(1, kx + nx * gap, kz + nz * gap);
    w.place(s, at); s.x = kx + nx * gap; s.z = kz + nz * gap;
    s.pack.bandage = 2; s.busyAct = ""; s.busyUntil = 0; s.hungerH = 0; s.thirstH = 0;
    const real = w.stepTo.bind(w); w.stepTo = (b, x, z) => (b === s ? false : real(b, x, z));
    s.job = { kind: "revive", ally: o.i, cell: o.cell, since: w.t, phase: 0, until: w.t + 120_000 };
    for (let t = 0; t < 3500; t += 100) { s.nextThink = w.t + 60_000; s.retryAt = w.t + 60_000; w.tick(100); if (s.busyAct === "revive" || s.job?.kind !== "revive") break; }
    return { kneel: s.busyAct === "revive", gone: s.job?.kind !== "revive" };
  };
  const near = kept(0.6), far = kept(1.1);
  ok(near.kneel && far.gone && !far.kneel, `kept off the place: a hand from it they kneel where they are (${near.kneel}); a metre short they let it go (${far.gone}); it was a walk on the spot until the friend bled out`);
}

{
  // A FIGHTER WHOSE STEP IS REFUSED PLANS AGAIN (section A's re-grade): planning again only when the foe moved left
  // a fighter nudged off his line with a route whose next step was refused; four stood half a minute, weapons up
  const { w, s } = alone(61), p = pairOf(w, "great-hall", "great-hall", true, 4, 6);
  ok(!!p, "two places in the great hall four to six metres apart");
  if (p) {
    w.place(s, p[0]); s.job = null; s.busyAct = ""; s.busyUntil = 0; s.hungerH = 0; s.thirstH = 0;
    s.melee = "knife"; s.hp = s.hpMax; s.stamina = 1; s.skills.lv.melee = 8;
    const z = w.makeZombie("shambler", p[1]), zc = p[1];
    const real = w.stepTo.bind(w); w.stepTo = (b, x, zz) => (b === s ? false : real(b, x, zz));
    const plan = w.plan.bind(w); let plans = 0; w.plan = (b, ...r) => { if (b === s && s.mode === "fight") plans++; return plan(b, ...r); };
    let fighting = 0;
    for (let t = 0; t < 4000; t += 100) { z.state = "idle"; z.nextThink = w.t + 60_000; w.place(z, zc); w.tick(100); if (s.mode === "fight") fighting++; }
    ok(fighting > 20 && plans >= 3, `going for one of the dead with every step refused, they plan again (${plans} plans in 4 s, fighting for ${fighting} of 40 steps; it was one plan and a stand)`);
  }
}

// ---- whole shows ------------------------------------------------------------------------------------------------
{
  const N = 16, FIRST = 41;
  let worst = 0, worstAt = "", flipMin = 0, standing = 0, stalls = 0, lived = 0, boardedAll = 0, threw = 0; const ends = {};
  let deadEarly = 0;
  let chainedShows = 0, offChain = 0, porchSweeps = 0, sillGrabs = 0, survived = 0, stairGrabs = 0, runningNowhere = 0, armories = 0;
  for (let seed = FIRST; seed < FIRST + N; seed++) {
    const w = mk(seed), mode = new Map(), flips = new Map();
    let minute = 0, lastKey = "", lastAt = 0, all5 = false, was15 = false;
    const chained = w.zombies.find((z) => z.leash);
    if (chained) chainedShows++;
    let chainedAt5 = true;
    try {
      for (let t = 0; t < 60 * 60_000 && !w.obj.ending; t += 100) {
        w.tick(100);
        if (chained && chained.alive && Math.hypot(chained.x - chained.leash[0], chained.z - chained.leash[1]) > chained.leash[2] + 0.4) offChain++;
        if (t === 5 * 60_000 && chained && !chained.alive) { chainedAt5 = false; deadEarly++; }
        for (const z of w.zombies) if (z.alive && z.link && z.grabbing >= 0) sillGrabs++;
        for (const z of w.zombies) if (z.alive && z.grabbing >= 0 && w.bodies[z.grabbing]?.link) stairGrabs++;
        for (const s of w.survivors) if (s.alive && !s.escaped && s.mode === "job" && !s.job && !s.busyAct && !s.link && (s.gait === "jog" || s.gait === "sprint")) runningNowhere++;
        for (const s of w.survivors) { if (s.alive && !s.escaped && s.job?.kind === "clear" && s.job.room !== undefined && w.scn.outside(w, s.job.room)) porchSweeps++; }
        for (const s of w.survivors) { if (!s.alive || s.escaped) continue; if (mode.get(s.who) !== s.mode) { mode.set(s.who, s.mode); flips.set(s.who, (flips.get(s.who) ?? 0) + 1); } }
        const m = Math.floor(t / 60_000);
        if (m === minute) continue;
        for (const [who, n] of flips) { if (n >= 20) flipMin++; if (n > worst) { worst = n; worstAt = `seed ${seed} ${who} minute ${minute}`; } }
        flips.clear(); minute = m;
        const g = w.sc, up = w.survivors.filter((s) => s.alive && !s.escaped && s.mode !== "down").length;
        if (GLEN.windows.every((id) => !w.fac.doors.get(id).open)) all5 = true;
        if (m === 15 && up >= 3 && g.boltedAt) was15 = true;
        // (the objectives' rows only: counting every kill as progress, the old build passed this too)
        // (the house's defences: with the door bolted, the windows boarded and the house clear there is nothing more to
        // do but stay alive, so a stall is only counted while something is still open)
        const key = [g.boltedAt, Object.keys(g.boarded).length, g.clearAt, g.darkAt, g.lightAt].join("|");
        const open = !g.boltedAt || GLEN.windows.some((id) => w.fac.doors.get(id).open) || (g.darkAt && !g.lightAt);
        if (key !== lastKey || !open) { lastKey = key; lastAt = m; }
        if (m - lastAt === 10 && up >= 3) stalls++;
      }
    } catch (e) { threw++; console.log(`  seed ${seed} threw: ${(e.stack ?? e.message).split("\n").slice(0, 2).join(" | ")}`); }
    if (w.armoryOpenAt) armories++;
    const end = w.obj.ending || "running"; ends[end] = (ends[end] ?? 0) + 1;
    if (end === "running") standing++;
    if (was15) { lived++; if (all5) boardedAll++; }
    if (end === "survived") survived++;
  }
  ok(threw === 0, `${N} whole shows, none throws (${JSON.stringify(ends)})`);
  ok(worst < 80, `nobody changes what they are doing eighty times in a minute (the worst: ${worst}, ${worstAt}; the old build read 99 to 294 on four ranges of seeds)`);
  ok(flipMin <= N * 3, `a body changing its mind twenty times in a minute is a hard fight, not a habit: ${flipMin} survivor-minutes in ${N} shows (it was 16 a show)`);
  ok(standing === 0 && Object.keys(ends).every((e) => e === "survived" || e === "wiped"), `every show ends survived or wiped (${JSON.stringify(ends)})`);
  ok(survived > 0 && survived < N, `some shows are survived and some are not (${survived} of ${N})`);
  ok(deadEarly === 0, `the one in the cell is still on its chain five minutes in (dead by then in ${deadEarly} shows of ${N}; it was every show, to whoever came down for planks)`);
  ok(stairGrabs === 0, `nobody is held while on a stair (${stairGrabs} steps; they were put metres on when let go, 38 times in 80 shows)`);
  ok(runningNowhere <= N * 5, `nobody stands with no job, running on the spot (${runningNowhere} steps in ${N} shows; a job picked and let go every step left them so for up to a minute and a half)`);
  ok(armories === 0, `the mansion's vault is not "the armory" (${armories} shows)`);
  ok(stalls <= 2, `ten minutes with a defence still open, none of them moving, and three or more up: ${stalls} in ${N} shows`);
  ok(boardedAll >= Math.ceil(lived * 0.6), `where three are up at a quarter past with the door bolted, all five windows get boarded at some time (${boardedAll} of ${lived} shows; the old build managed it in 7 of 13 to 14 of 16)`);
  ok(chainedShows === N && offChain === 0, `the one in the cell is on a chain in every show (${chainedShows} of ${N}) and stays on it (${offChain} steps more than 0.4 m past it in ${N} shows; a lunge, a shove and the service stair each used to take it off: unchained it was out of the cell for good in every show)`);
  ok(porchSweeps === 0, `nobody is sent to sweep a porch or the grounds (${porchSweeps} steps of it)`);
  ok(sillGrabs === 0, `none of the dead holds anybody from half-way through a window or up a stair (${sillGrabs} steps)`);
}
console.log(`\n${fail ? "RED" : "GREEN"}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
