// THE GRABBER — Pipe Dreams' creature, driven in-process against the REAL tick.
//
// BACKROOMS.md → "THE GRABBER" (Josh, Sep 2026): "a monster that will sneak
// up on you and grab you turning you around and killing you … you hear
// footsteps and monstrous breathing … but when the player turns around and
// shines it with flashlight it screeches and runs away. the creature does not
// always harass the player it will be random and the player will not hear the
// creature until its close." THE SHIP GATE asks for one assert per agreed
// behaviour; each block below names its line:
//   · it does not always harass you: it VISITS, on a clock, not at once
//   · it sneaks up: it arrives BEHIND you, out of every sight line
//   · it walks, it does not run: slower than a sprint (you can't outrun it
//     forever, but you can turn and face it)
//   · it grabs you: held still (moves refused), then killed — "the grabber"
//   · light in its face: a beam held a quarter-second, it screeches and runs
//   · a sweep of the beam is not enough
//   · in its arms your own torch is too late — a TEAMMATE's light saves you
//   · it never sets foot in a lit safe room; reach one and it gives up
//   · and the placement law: every step on walkable floor, never in a pit
//
// The "silent until close" half is the CLIENT's (it plays nothing past 8
// cells) and is swept from the source at the end.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

process.env.BACKROOMS_GRABBER = "1";
process.env.BACKROOMS_GRABBER_GAP_MIN_MS = "900";
process.env.BACKROOMS_GRABBER_GAP_MAX_MS = "1000";
process.env.BACKROOMS_GRABBER_SAFE_GIVEUP_MS = "2500";
process.env.BACKROOMS_GRABBER_VISIT_MS = "60000";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell } = require(dist("backrooms/worldgen.js"));
const { SAFE_TYPES } = require(dist("backrooms/pipes-vocab.js"));

const DB = path.join(ROOT, "data", "grabber-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledD) { console.error("Pipe Dreams did not boot"); process.exit(1); }
const sec = br.sectorD;
const SIZE = sec.size;

// ---- geometry (mirrors of the service's own rules) -------------------------
const idx = (x, y) => y * SIZE + x;
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const eff = (x, y) => (sec.eff ?? sec.floor)[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
  if (!heightPassable(eff(ax, ay), eff(bx, by))) return false;
  if (by === ay - 1) return !sec.wallN[idx(ax, ay)];
  if (by === ay + 1) return !sec.wallN[idx(bx, by)];
  if (bx === ax - 1) return !sec.wallW[idx(ax, ay)];
  if (bx === ax + 1) return !sec.wallW[idx(bx, by)];
  return false;
};
const stepAllowed = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return true;
  if (Math.abs(dx) + Math.abs(dy) === 1) return edgeOpen(ax, ay, bx, by);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    return (edgeOpen(ax, ay, ax + dx, ay) && edgeOpen(ax + dx, ay, bx, by)) || (edgeOpen(ax, ay, ax, ay + dy) && edgeOpen(ax, ay + dy, bx, by));
  }
  return false;
};
const los = (x0, y0, x1, y1) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 0.15));
  let pcx = Math.floor(x0), pcy = Math.floor(y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor(x0 + (x1 - x0) * t), cy = Math.floor(y0 + (y1 - y0) * t);
    if (cx !== pcx || cy !== pcy) {
      if (!stepAllowed(pcx, pcy, cx, cy)) return false;
      pcx = cx; pcy = cy;
    }
  }
  return true;
};
const typeAt = (x, y) => sec.districts[sec.district[idx(Math.floor(x), Math.floor(y))]]?.type;
const safeAt = (x, y) => SAFE_TYPES.has(typeAt(x, y));
const SEC_SOLID = (t) => `${sec.solid[idx(Math.floor(t.x), Math.floor(t.y))]}/${sec.background[idx(Math.floor(t.x), Math.floor(t.y))]}`;

// ---- sessions ---------------------------------------------------------------
let nextId = 700;
const mk = (x, y, heading = 0) => ({
  userId: nextId++, name: "fitter" + nextId, x, y, heading, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 2, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
/** Turn a body to face a point (facing = (-sin h, -cos h), the service's). */
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };
const facing = (s) => ({ fx: -Math.sin(s.heading), fy: -Math.cos(s.heading) });
const gr = () => br.debugState().grabber;
const clearAll = async () => { br.sessions.clear(); await sleep(350); };

// THE STAGE: an open spot in an ordinary (unlit) room with floor all round,
// and the doorway into a safe room (a cell outside it, the cell inside).
let spot = null, bestOpen = -1;
for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) {
  if (!walkable(x, y) || safeAt(x, y) || isPitCell(sec, x, y)) continue;
  let open = 0;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    if (walkable(x + dx, y + dy) && !safeAt(x + dx, y + dy) && los(x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5)) open++;
  }
  if (open > bestOpen) { bestOpen = open; spot = { x: x + 0.5, y: y + 0.5 }; }
}
let door = null;
for (let y = 3; y < SIZE - 3 && !door; y++) for (let x = 3; x < SIZE - 3 && !door; x++) {
  if (!walkable(x, y) || safeAt(x, y)) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ix = x + dx, iy = y + dy, jx = x + 2 * dx, jy = y + 2 * dy;
    if (!edgeOpen(x, y, ix, iy) || !edgeOpen(ix, iy, jx, jy)) continue;
    if (!safeAt(ix, iy) || !safeAt(jx, jy)) continue;
    door = { out: { x: x + 0.5, y: y + 0.5 }, inside: { x: jx + 0.5, y: jy + 0.5 }, type: typeAt(ix, iy) };
    break;
  }
}
if (!spot || !door) { console.error("no stage found on Pipe Dreams", !!spot, !!door); process.exit(1); }
console.log(`stage: open spot ${spot.x},${spot.y} (${bestOpen} cells in view); a ${door.type} at ${door.inside.x},${door.inside.y}`);

const events = [];
const trail = [];
br.onGrabber((ev) => {
  const at = Date.now();
  events.push({ ...ev, at });
  if (ev.type === "pos") trail.push({ x: ev.x, y: ev.y, mode: ev.mode, at });
});
br.startEntity(() => {});

const waitFor = async (pred, ms = 6000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const g = gr();
    const r = pred(g);
    if (r) return g ?? true;
    await sleep(25);
  }
  return null;
};
const dbCause = async (uid) => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(uid);
  db.close();
  return row?.cause;
};

const run = async () => {
  // ---- it visits on a clock -----------------------------------------------
  console.log("-- the visit");
  const p = put(mk(spot.x, spot.y, 0));
  await sleep(450);
  ok(gr() === null, "it does not come at once — it visits, on its own clock");
  const came = await waitFor((g) => !!g, 4000);
  ok(!!came && came.targetId === p.userId, "…and when the clock runs out, it comes for you");
  const first = events.find((e) => e.type === "pos");
  if (first) {
    const d = Math.hypot(first.x - p.x, first.y - p.y);
    const { fx, fy } = facing(p);
    const dot = ((first.x - p.x) * fx + (first.y - p.y) * fy) / d;
    ok(!los(p.x, p.y, first.x, first.y), "it is never seen arriving (out of every sight line)");
    ok(dot < 0, `it arrives BEHIND you (facing · it = ${dot.toFixed(2)})`);
    ok(d >= 9 && d <= 21, `…some way off (${d.toFixed(1)} cells)`);
  }

  // ---- it walks; then it grabs -------------------------------------------
  console.log("-- the grab");
  const grabbed = await waitFor((g) => g && g.mode === "grab", 20000);
  ok(!!grabbed, "a body that never turns round: it reaches arm's length and takes hold");
  const stalk = trail.filter((t) => t.mode === "stalk");
  let dist = 0, time = 0;
  for (let i = 1; i < stalk.length; i++) {
    const dt = stalk[i].at - stalk[i - 1].at;
    if (dt > 250) continue;
    dist += Math.hypot(stalk[i].x - stalk[i - 1].x, stalk[i].y - stalk[i - 1].y);
    time += dt;
  }
  const speed = time ? dist / (time / 1000) : 0;
  ok(speed > 1.9 && speed < 2.85, `it walks, it does not run: slower than a sprint (${speed.toFixed(2)} cells/s against 2.85)`);
  ok(events.some((e) => e.type === "grab" && e.targetId === p.userId), "the grab is told to the wire, named for its victim");
  if (grabbed) {
    const at = { x: p.x, y: p.y };
    const r = br.move(p.userId, p.x + 0.8, p.y, p.heading);
    ok(r?.corrected === true && Math.hypot(p.x - at.x, p.y - at.y) < 0.01, "in its arms you cannot walk away (the move is refused)");
  }
  const dead = await waitFor(() => !br.sessions.has(p.userId), 4000);
  ok(!!dead, "…and then it kills");
  ok(events.some((e) => e.type === "kill" && e.userId === p.userId), "the kill is told to the wire");
  ok((await dbCause(p.userId)) === "the grabber", "the death is written as the grabber's");
  const offFloor = trail.filter((t) => !walkable(Math.floor(t.x), Math.floor(t.y)) || isPitCell(sec, Math.floor(t.x), Math.floor(t.y)));
  ok(trail.length > 10 && offFloor.length === 0, `every step on walkable floor, never in a pit (${trail.length} steps${offFloor.length ? `; off at ${offFloor.slice(0, 3).map((t) => `${t.x.toFixed(2)},${t.y.toFixed(2)} ${t.mode} solid=${SEC_SOLID(t)}`).join(" · ")}` : ""})`);

  // ---- the light ----------------------------------------------------------
  console.log("-- the light");
  await clearAll();
  events.length = 0;
  trail.length = 0;
  const f = put(mk(spot.x, spot.y, 0));
  f.equip = "flashlight!";
  // face AWAY until it is in view, in range, and a few cells off
  const inView = await waitFor((g) => g && g.mode === "stalk" && Math.hypot(g.x - f.x, g.y - f.y) <= 7 && Math.hypot(g.x - f.x, g.y - f.y) >= 3 && los(f.x, f.y, g.x, g.y), 20000);
  ok(!!inView, "(staging) it walks up behind a fitter with a lit torch");
  if (inView) {
    // A SWEEP: one tick of beam, then away
    const g0 = gr();
    const away = f.heading;
    faceAt(f, g0.x, g0.y);
    await sleep(110);
    f.heading = away; // and on past it
    await sleep(350);
    ok(!events.some((e) => e.type === "screech"), "a sweep of the beam across it is not enough");
    // HOLD IT
    const g1 = gr();
    const t0 = Date.now();
    if (g1) faceAt(f, g1.x, g1.y);
    let screechAt = 0;
    while (Date.now() - t0 < 1500) {
      const g = gr();
      if (g && g.mode !== "flee") faceAt(f, g.x, g.y);
      const s = events.find((e) => e.type === "screech");
      if (s) { screechAt = s.at; break; }
      await sleep(20);
    }
    const lag = screechAt - t0;
    ok(screechAt > 0 && lag >= 180 && lag <= 700, `a beam HELD on it — it screeches (after ${lag}ms)`);
    ok(gr()?.mode === "flee" || gr() === null, "…and runs");
    const gone = await waitFor((g) => g === null, 8000);
    ok(!!gone && br.sessions.has(f.userId), "it leaves, and the fitter is alive");
    ok(trail.filter((t) => t.mode === "flee").length > 0, "it ran (flee steps on the wire)");
  }

  // ---- a teammate's light ------------------------------------------------
  console.log("-- in its arms");
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    await clearAll();
    events.length = 0;
    const v = put(mk(spot.x, spot.y, 0));
    v.equip = "flashlight!";
    // the mate stands a step to one side, facing the same way, torch on
    const mate = put(mk(spot.x, spot.y, 0));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (edgeOpen(Math.floor(spot.x), Math.floor(spot.y), Math.floor(spot.x) + dx, Math.floor(spot.y) + dy)) { mate.x = spot.x + dx; mate.y = spot.y + dy; break; }
    }
    mate.equip = "flashlight!";
    if (!br.summonGrabber(v.userId)) continue;
    // both keep looking the other way (away from wherever it is)
    const g = await waitFor((q) => q && q.mode === "grab", 20000);
    if (!g || g.targetId !== v.userId) continue;
    // the victim is turned to face it, torch lit — too late
    faceAt(v, g.x, g.y);
    await sleep(450);
    const held = gr();
    ok(held?.mode === "grab", "in its arms, your own torch is too late (it keeps hold)");
    // the mate turns and lights it
    if (held) faceAt(mate, held.x, held.y);
    const fled = await waitFor((q) => !q || q.mode === "flee", 1000);
    ok(!!fled && events.some((e) => e.type === "screech"), "a teammate's light breaks the hold");
    await sleep(Number(process.env.BACKROOMS_GRABBER_HOLD_MS ?? 1500));
    ok(br.sessions.has(v.userId), "…and the one it had is alive");
    const bx = v.x;
    const r = br.move(v.userId, v.x + 0.3, v.y, v.heading);
    ok(r && Math.abs(r.x - bx) > 0.2, "…and can walk again");
    saved = true;
  }
  if (!saved) ok(false, "(staging) a grab with a teammate at hand");

  // ---- the safe rooms -----------------------------------------------------
  console.log("-- the safe rooms");
  await clearAll();
  events.length = 0;
  trail.length = 0;
  const sheltered = put(mk(door.inside.x, door.inside.y, 0));
  await sleep(2500);
  ok(gr() === null, `nobody in a lit room is visited (${door.type})`);
  await clearAll();
  events.length = 0;
  trail.length = 0;
  const runner = put(mk(door.out.x, door.out.y, 0));
  const summoned = br.summonGrabber(runner.userId);
  ok(summoned, "(staging) summoned at a fitter just outside a lit room");
  await waitFor((g) => !!g, 1500);
  runner.x = door.inside.x; // they make the light
  runner.y = door.inside.y;
  const gaveUp = await waitFor((g) => g === null, 6000);
  ok(!!gaveUp && br.sessions.has(runner.userId), "they reach the light: it waits outside a while, then gives up");
  ok(trail.every((t) => !safeAt(t.x, t.y)), `it never set foot in the lit room (${trail.length} steps)`);
  void sheltered;

  // ---- the client half: silent until close ------------------------------
  console.log("-- the client");
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "BackroomsGame.svelte"), "utf8");
  ok(/GRABBER_HEAR_CELLS\s*=\s*8\b/.test(src), "the client plays nothing of it past 8 cells (GRABBER_HEAR_CELLS = 8)");

  await clearAll();
  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
