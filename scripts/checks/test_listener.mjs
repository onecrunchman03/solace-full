// THE LISTENER — Lights Out's creature (Level 6), in-process against the real
// tick, one assert per agreed behaviour (BACKROOMS.md → "LEVEL 6 — LIGHTS OUT
// → THE CREATURE", Josh's call 2026-10-14: "2. A"):
//
//   · it arrives when somebody comes down — far away, out of every line;
//   · it is BLIND: a torch shone at it, near and in line, draws nothing;
//   · a CROUCH is silent; a WALK is heard at 3 cells and not at 5; a SPRINT
//     at 8; a VOICE (or a walkie) at 10 and not at 12; a dropped item at 6;
//     any step in the Wet End's water is a splash, heard at 6;
//   · AT THE CLIENT'S REAL CADENCE (a move every ~104-117 ms, delivered late
//     and bunched — on a fake clock), a walk is never heard as a sprint, a
//     crouch never as a walk, and a real sprint or walk still is;
//   · through a wall it hears at half;
//   · it searches at about 1.2 cells a second, lunges near 3 only over the
//     last few cells, wanders slower than a walk;
//   · THE FIRST TOUCH does no damage — and it stands still while it whispers;
//   · silent on dry floor through its listening, you live, and it wanders off;
//   · a walk during its listening brings the second touch: death, "the
//     listener"; so does standing in the water;
//   · a sprint away the moment it lets go gets you clear;
//   · the killing touch goes out as its own event, so screens near play it;
//   · never into the Stair, never after a flyer (its steps, its dropped kit,
//     its voice or its radio), never through a wall;
//   · two of them once eight bodies are down here; none on an empty level;
//   · the admin's J sends it at you.
//
// CLOCKED, like the other creature harnesses: rerun it ALONE before believing
// a failure.
process.env.BACKROOMS_DIRECTOR = "0";
process.env.BACKROOMS_LISTENER_PAUSE_MS = "800";
process.env.BACKROOMS_LISTENER_KNOW_MS = "1500";
process.env.BACKROOMS_LISTENER_SECOND_MS = "6000";
process.env.BACKROOMS_BATTERY_LOOSE = "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { distanceMap } = require(dist("backrooms/worldgen.js"));
const { lightsWet } = require(dist("backrooms/worldgen-lights.js"));
const { ZONE_DARK } = require(dist("backrooms/lights-vocab.js"));
const { LEVEL6_FLAG, LIGHTS_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "listener-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledL) { console.error("Lights Out did not boot"); process.exit(1); }
br.startEntity(() => {});
store.brSetFlag(LEVEL6_FLAG, null, "harness");
store.brSetFlag(LIGHTS_OPEN_FLAG, null, "harness");
const sec = br.sectorL;
const SIZE = sec.size;
const idx = (x, y) => y * SIZE + x;
const typeAt = (x, y) => sec.districts[sec.district[idx(Math.floor(x), Math.floor(y))]]?.type;

// ---- the service's own wall rule, mirrored (a line of sight)
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
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
  return (edgeOpen(ax, ay, ax + dx, ay) && edgeOpen(ax + dx, ay, bx, by)) || (edgeOpen(ax, ay, ax, ay + dy) && edgeOpen(ax, ay + dy, bx, by));
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

// ---- every position a Listener ever reports, and its touches
const seen = [];
const touches = [];
const gone = [];
const kills = [];
br.onListener((ev) => {
  if (ev.type === "pos") seen.push({ ...ev, at: Date.now() });
  else if (ev.type === "touch") touches.push({ ...ev, at: Date.now() });
  else if (ev.type === "gone") gone.push(ev);
  else if (ev.type === "kill") kills.push({ ...ev, at: Date.now() });
});
const L = () => br.debugListeners()[0];
const dbCause = async (uid) => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ? ORDER BY id DESC").get(uid);
  db.close();
  return row?.cause;
};

// ---- staging: a dry dark-zone cell for the Listener, and a spot `d` cells off
const fromDoor = distanceMap(sec, sec.doors.map((d) => ({ x: d.x, y: d.y })));
const reach = (x, y) => fromDoor[idx(x, y)] >= 0;
const dry = (x, y) => !lightsWet(sec, x, y);
const homes = [];
for (let y = 1; y < SIZE - 1; y++)
  for (let x = 1; x < SIZE - 1; x++)
    if (walkable(x, y) && reach(x, y) && dry(x, y) && typeAt(x, y) !== "stairfoot" && sec.section[idx(x, y)] === ZONE_DARK && fromDoor[idx(x, y)] > 30) homes.push({ x, y });
let homeAt = 0;
/** A Listener cell and a player spot `d` cells from it (± 0.35), in line or
 *  walled off from it, dry or in the water. */
const stage = (d, { line = true, wet = false, homesFrom = null } = {}) => {
  const pool = homesFrom ?? homes;
  for (let k = 0; k < pool.length; k++) {
    const c = pool[(homeAt + k * 37) % pool.length];
    const r = Math.ceil(d + 1);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!walkable(x, y) || !reach(x, y) || typeAt(x, y) === "stairfoot") continue;
        if (Math.abs(Math.hypot(dx, dy) - d) > 0.35) continue;
        if (wet !== !dry(x, y)) continue;
        if (los(c.x + 0.5, c.y + 0.5, x + 0.5, y + 0.5) !== line) continue;
        homeAt += 7;
        return { c: { x: c.x + 0.5, y: c.y + 0.5 }, p: { x: x + 0.5, y: y + 0.5 } };
      }
  }
  return null;
};

const mkUser = (u, admin = false) => store.createUser({ username: u, displayName: u, passwordHash: "x", ...(admin ? { isAdmin: true } : {}) });
const enterL = (u) => {
  store.brForceAddItem(u.id, "suit", "yellow");
  store.brForceAddItem(u.id, "flashlight", null);
  store.brForceAddItem(u.id, "battery", null);
  const r = br.enter(u.id, u.username, 0, store.brLockerItems(u.id).map((i) => i.id), 6);
  if (r.error) throw new Error(`${u.username}: ${r.error}`);
  return r;
};
const stairSpot = { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 };
const place = (s, p) => { s.x = p.x; s.y = p.y; s.lastMoveAt = Date.now(); };
const park = (p) => br.debugParkListener(p.x, p.y);
/** One frame of a gait inside the player's own cell: the service judges its
 *  speed from the distance and the time since the last frame. */
let wob = 1;
const step = (s, speed, pose = 0) => {
  s.pose = pose;
  s.lastMoveAt = Date.now() - 100;
  wob = -wob;
  const nx = Math.floor(s.x) + 0.5 + wob * speed * 0.05;
  br.move(s.userId, nx, s.y, 0);
};
// (at least four frames: the server reads a gait over the last half second of
// them, so two frames from a standstill are a shuffle, not a walk — Nov 2026)
const gait = async (s, speed, ms, pose = 0) => {
  const t0 = Date.now();
  for (let k = 0; k < 4 || Date.now() - t0 < ms; k++) { step(s, speed, pose); await sleep(100); }
};
const heard = (c) => { const l = L(); return !!l && (l.mode === "search" || l.mode === "lunge" || Math.hypot(l.x - c.x, l.y - c.y) > 0.3); };
const waitFor = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const tick = () => sleep(250);

ok(homes.length > 200, `${homes.length} dry cells in the corridors to stage from`);

// ---- ARRIVAL ----------------------------------------------------------------------------
console.log("-- it arrives when somebody comes down");
ok(br.debugListeners().length === 0, "an empty Lights Out has no Listener in it");
const scout = mkUser("scout");
const ss = enterL(scout);
await waitFor(() => br.debugListeners().length === 1, 1500);
const a0 = L();
ok(!!a0 && Math.hypot(a0.x - ss.x, a0.y - ss.y) >= 22 && !los(a0.x, a0.y, ss.x, ss.y), `it arrives far off and out of sight (${a0 ? Math.hypot(a0.x - ss.x, a0.y - ss.y).toFixed(0) : "-"} cells, no line)`);
ok(br.operatorView(6).monsters.some((m) => m.kind === "listener"), "the operator sees it on the map");

// ---- BLIND --------------------------------------------------------------------------------
console.log("-- blind");
let st = stage(2.5);
park(st.c); place(ss, st.p); ss.equip = "flashlight!"; ss.pose = 0;
await sleep(1500);
ok(!heard(st.c), "a lit torch shone at it from 2.5 cells, in line, draws nothing — it cannot see");
ss.equip = "flashlight";

// ---- WHAT IT HEARS --------------------------------------------------------------------------
console.log("-- what it hears");
st = stage(2);
park(st.c); place(ss, st.p);
await gait(ss, 0.8, 1200, 1);
ok(!heard(st.c), "a crouch, two cells off, is silent to it");
st = stage(5);
park(st.c); place(ss, st.p);
await gait(ss, 1.6, 900);
ok(!heard(st.c), "a walk five cells off is not heard");
st = stage(2.6);
park(st.c); place(ss, st.p);
await gait(ss, 1.6, 300);
await tick();
ok(heard(st.c), "a walk at 2.6 cells is heard");
place(ss, stairSpot);
st = stage(7);
park(st.c); place(ss, st.p);
await gait(ss, 2.85, 700);
await tick();
ok(heard(st.c) && L().mode === "search", "a sprint at seven cells is heard — and it comes looking, not lunging");
place(ss, stairSpot);
st = stage(9);
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 6);
await tick();
ok(heard(st.c), "a voice at nine cells is heard");
st = stage(12);
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 6);
await tick();
ok(!heard(st.c), "a voice at twelve cells is not");
st = stage(7, { line: false });
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 6);
await tick();
const wall7 = heard(st.c);
st = stage(4, { line: false });
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 6);
await tick();
ok(!wall7 && heard(st.c), "through a wall it hears at half: a voice at seven cells is lost, at four it is not");
place(ss, stairSpot);
st = stage(5);
park(st.c); place(ss, st.p);
const bat = ss.inventory.find((i) => i.kind === "battery");
const dr = br.dropItem(scout.id, bat.id, null);
await tick();
ok(!dr.error && heard(st.c), "a dropped battery at five cells is heard");
place(ss, stairSpot);
const wetSt = stage(5, { wet: true, homesFrom: homes.filter((h) => true) });
if (wetSt) {
  park(wetSt.c); place(ss, wetSt.p);
  await gait(ss, 0.7, 300);
  await tick();
  ok(heard(wetSt.c), "a slow step in the Wet End's water, five cells off, is a splash it hears");
} else ok(false, "a spot in the water to splash in");
place(ss, stairSpot);

// ---- THE CLIENT'S REAL CADENCE (Nov 2026 polish round) ----------------------------------
// The client sends a move only once 100 ms have passed since the last: every
// ~117 ms at 60 Hz, ~104 ms at 144 Hz, and the network delivers them late and
// bunched. Speed off ONE frame swung with that: a walk was heard as a sprint
// and a crouch as a walk. These run on a FAKE clock, frame by frame, so the
// timing is exact and none of it is load-sensitive.
console.log("-- the client's real cadence");
const G = require(dist("backrooms/gait.js"));
let cseed = 20261101;
const crand = () => ((cseed = (cseed * 1103515245 + 12345) % 2147483648) / 2147483648);
/** The frames a client at `hz` sends over `ms`: each with the motion time it
 *  carries and when it arrives — 20 + U(0, jitter) ms late, in order, and with
 *  `stalls` now and then held back 150-400 ms and delivered in a bunch. */
const cadence = (hz, jitter, ms, stalls = false) => {
  const out = [];
  const frame = 1000 / hz;
  let last = -1, prevArr = -Infinity, stallUntil = -1;
  for (let f = 1; f * frame < ms; f++) {
    const t = f * frame;
    if (last >= 0 && t - last <= 100) continue;
    const dt = last < 0 ? frame : t - last;
    last = t;
    if (stalls && crand() < 0.03) stallUntil = t + 150 + crand() * 250;
    const arr = Math.max(prevArr, stallUntil, t + 20 + crand() * jitter);
    out.push({ dt, arr });
    prevArr = arr;
  }
  return out;
};
const CADENCES = [[60, 30, false], [60, 60, false], [144, 30, false], [144, 60, false], [60, 60, true], [144, 60, true]];
const label = ([hz, j, st]) => `${hz} Hz ±${j} ms${st ? " +stalls" : ""}`;
// the read itself, two minutes of each
const readOver = (speed, c, windowMs = G.GAIT_HEAR_MS) => {
  const trail = [];
  let prev = null;
  const speeds = [];
  for (const f of cadence(c[0], c[1], 120_000, c[2])) {
    G.gaitPush(trail, f.arr, speed * f.dt / 1000, prev === null ? f.dt : f.arr - prev);
    prev = f.arr;
    if (f.arr > 1500) speeds.push(G.gaitSpeed(trail, windowMs));
  }
  return { min: Math.min(...speeds), max: Math.max(...speeds) };
};
{
  const walkMax = Math.max(...CADENCES.map((c) => readOver(2.05, c).max));
  const crouchMax = Math.max(...CADENCES.map((c) => readOver(1.025, c).max));
  const sprintMin = Math.min(...CADENCES.filter((c) => !c[2]).map((c) => readOver(2.85, c).min));
  ok(walkMax < G.GAIT_SPRINT_LINE, `a walk (2.05) never reads as a sprint at any cadence, stalls and all (worst ${walkMax.toFixed(2)}, the line ${G.GAIT_SPRINT_LINE})`);
  ok(crouchMax < G.GAIT_WALK_LINE, `a crouch (1.03) never reads as a walk (worst ${crouchMax.toFixed(2)}, the line ${G.GAIT_WALK_LINE})`);
  ok(sprintMin > G.GAIT_SPRINT_LINE, `a steady sprint (2.85) always reads as one (least ${sprintMin.toFixed(2)})`);
}
/** Walk a body in place at `speed` to a cadence's frames on a fake clock,
 *  through the real move(); `stop()` after a frame ends it. Returns the
 *  arrival time (ms after the first frame) it stopped at, or -1. */
const drive = (s, speed, pose, frames, stop) => {
  const realNow = Date.now;
  const t0 = realNow() + 1000;
  const cx = Math.floor(s.x) + 0.5;
  let off = 0, dir = 1, at = -1;
  try {
    for (const f of frames) {
      Date.now = () => t0 + f.arr;
      const d = (speed * f.dt) / 1000;
      if (Math.abs(off + dir * d) > 0.4) dir = -dir;
      off += dir * d;
      s.pose = pose;
      br.move(s.userId, cx + off, s.y, 0);
      if (stop()) { at = f.arr - frames[0].arr; break; }
    }
  } finally {
    Date.now = realNow;
    s.gait = [];
    s.lastMoveAt = realNow();
  }
  return at;
};
const heardNow = () => L().mode !== "wander";
{
  const walkHeard = [], crouchHeard = [], sprintMs = [], walkNear = [];
  for (const c of CADENCES) {
    st = stage(5);
    park(st.c); place(ss, st.p);
    if (drive(ss, 2.05, 0, cadence(c[0], c[1], 20_000, c[2]), heardNow) >= 0) walkHeard.push(label(c));
    st = stage(2);
    park(st.c); place(ss, st.p);
    if (drive(ss, 1.025, 1, cadence(c[0], c[1], 20_000, c[2]), heardNow) >= 0) crouchHeard.push(label(c));
    st = stage(5);
    park(st.c); place(ss, st.p);
    sprintMs.push(drive(ss, 2.85, 0, cadence(c[0], c[1], 3_000, c[2]), heardNow));
    st = stage(2.6);
    park(st.c); place(ss, st.p);
    walkNear.push(drive(ss, 2.05, 0, cadence(c[0], c[1], 3_000, c[2]), heardNow));
  }
  park(L());
  place(ss, stairSpot);
  ok(!walkHeard.length, `twenty seconds of walking five cells off, at every cadence: never heard as a sprint${walkHeard.length ? " (heard at " + walkHeard.join(", ") + ")" : ""}`);
  ok(!crouchHeard.length, `twenty seconds of crouch-walking two cells off: never heard${crouchHeard.length ? " (heard at " + crouchHeard.join(", ") + ")" : ""}`);
  ok(sprintMs.every((m) => m >= 0 && m <= 800), `a sprint from a standstill five cells off is heard within the first ${Math.max(...sprintMs)} ms at every cadence (${sprintMs.join(", ")})`);
  ok(walkNear.every((m) => m >= 0 && m <= 800), `…and a real walk at 2.6 cells still is (${walkNear.join(", ")} ms)`);
}

// ---- HOW IT MOVES ----------------------------------------------------------------------------
console.log("-- how it moves");
st = stage(9);
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 6);
place(ss, stairSpot);
seen.length = 0;
await sleep(2500);
const pts = seen.filter((p) => p.id === L().id);
let srch = 0;
for (let i = 1; i < pts.length; i++) srch = Math.max(srch, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / Math.max(0.05, (pts[i].at - pts[i - 1].at) / 1000));
ok(srch > 0.8 && srch < 1.45, `it searches at about 1.2 cells a second (fastest step ${srch.toFixed(2)}) — slower than a walk`);
st = stage(2.4);
park(st.c); place(ss, st.p);
seen.length = 0;
await gait(ss, 1.6, 200);
const lungeFrom = Date.now();
await waitFor(() => touches.some((t) => t.at >= lungeFrom), 2500);
const lp = seen.filter((p) => p.id === L().id && p.at >= lungeFrom && p.mode === "lunge");
let lmax = 0;
for (let i = 1; i < lp.length; i++) lmax = Math.max(lmax, Math.hypot(lp[i].x - lp[i - 1].x, lp[i].y - lp[i - 1].y) / Math.max(0.05, (lp[i].at - lp[i - 1].at) / 1000));
ok(lp.length > 0 && lmax > 2.4 && lmax < 3.4, `a noise within three cells and it LUNGES (${lmax.toFixed(2)} cells a second, a sprint is 2.85)`);

// ---- THE FIRST TOUCH ----------------------------------------------------------------------------
console.log("-- the first touch");
const t1 = touches.find((t) => t.userId === scout.id && t.at >= lungeFrom);
ok(!!t1 && br.sessions.has(scout.id) && ss.hp === 100, "the first touch does no damage — the cold hand, and you are still alive");
const stillAt = L();
await sleep(500);
const still2 = L();
ok(stillAt.mode === "still" && Math.hypot(still2.x - stillAt.x, still2.y - stillAt.y) < 0.05, "…and it stands still while it whispers");
await sleep(400); // into its listening
await sleep(1900); // through it, silent on dry floor
const after = L();
ok(after.mode === "wander", "silent on dry floor through its listening, it loses you and wanders off");
await sleep(4500); // past the second-touch window
ok(br.sessions.has(scout.id) && !touches.some((t) => t.userId === scout.id && t.at > t1.at), "…and no second touch comes");

console.log("-- the second touch");
const walker = mkUser("walker");
const ws = enterL(walker);
st = stage(2.4);
park(st.c); place(ws, st.p);
await gait(ws, 1.6, 200);
await waitFor(() => touches.some((t) => t.userId === walker.id), 2500);
await sleep(900); // the whisper ends
await gait(ws, 1.6, 1500);
await waitFor(() => !br.sessions.has(walker.id), 2500);
ok(!br.sessions.has(walker.id) && (await dbCause(walker.id)) === "the listener", "a walk during its listening brings the second touch — death, written as \"the listener\"");
// the killing touch is played on the creature too: the service names it and
// the wire carries it to the screens near and the victim's (Nov 2026 polish round)
const k1 = kills.find((k) => k.userId === walker.id);
const netKill = readFileSync(path.join(ROOT, "src", "backrooms", "net.ts"), "utf8");
ok(!!k1 && k1.id === L().id && /type: "listenerEv", id: ev\.id, ev: "kill"/.test(netKill), "…and the killing touch goes out as the Listener's own event, so every screen near plays it reaching out");

const wader = mkUser("wader");
const wds = enterL(wader);
const wst = stage(2.4, { wet: true });
if (wst) {
  park(wst.c); place(wds, wst.p);
  await gait(wds, 0.7, 200);
  await waitFor(() => touches.some((t) => t.userId === wader.id), 2500);
  await waitFor(() => !br.sessions.has(wader.id), 4000);
  ok(!br.sessions.has(wader.id) && (await dbCause(wader.id)) === "the listener", "touched in the water, standing still is not silent — the ripples bring the second touch");
} else ok(false, "a wet spot to be touched in");

const runner = mkUser("runner");
const rs = enterL(runner);
st = stage(2.4);
park(st.c); place(rs, st.p);
// walk until the touch, and not a frame after: the sprint below must start
// the moment it lets go, inside its whisper (Nov 2026)
for (let k = 0, t0 = Date.now(); Date.now() - t0 < 2500 && !touches.some((t) => t.userId === runner.id); k++) {
  if (k < 8) step(rs, 1.6);
  await sleep(k < 8 ? 100 : 25);
}
// it lets go: the runner is already four cells off, sprinting
// (a spot about four cells off, in line or round a corner, whichever the
// corridor where it caught them has — a single exact distance in line from one
// cell was a staging failure, not a creature one, Nov 2026)
const lcell = [{ x: Math.floor(L().x), y: Math.floor(L().y) }];
const away = [4.5, 4, 5, 3.6, 5.5].flatMap((d) => [stage(d, { homesFrom: lcell }), stage(d, { homesFrom: lcell, line: false })]).find(Boolean);
if (away) place(rs, away.p);
await gait(rs, 2.85, 600);
const far = [12, 11, 13, 10, 14].flatMap((d) => [stage(d, { homesFrom: lcell }), stage(d, { homesFrom: lcell, line: false })]).find(Boolean);
if (far) place(rs, far.p);
await sleep(6500);
ok(!!away && br.sessions.has(runner.id), "a sprint away the moment it lets go gets you clear");

// ---- WHERE IT NEVER GOES -------------------------------------------------------------------------
console.log("-- where it never goes");
const stairBody = mkUser("stairbody");
const sb = enterL(stairBody);
place(sb, stairSpot);
br.debugParkListener(L().x, L().y);
const stairLine = stage(2, { homesFrom: [] });
seen.length = 0;
br.summonListener; // (the admin lever is tested below)
// a noise from inside the Stair: it cannot go there
br.entityHears(sb.x, sb.y, 6, 6);
await sleep(1500);
ok(seen.every((p) => typeAt(p.x, p.y) !== "stairfoot") && br.sessions.has(stairBody.id), "a voice from the Stair: it never sets foot in it");
const ghost = mkUser("ghost", true);
const gs = enterL(ghost);
gs.fly = true;
st = stage(2);
park(st.c); place(gs, st.p);
await gait(gs, 2.85, 600);
await tick();
const flyQuiet = !heard(st.c);
place(gs, st.c);
await sleep(600);
ok(flyQuiet && !touches.some((t) => t.userId === ghost.id), "never after a flyer: a flying admin's sprint is silent to it, and standing on it, untouched");
// …nor what a flyer drops, says or keys over a radio (Nov 2026 polish round:
// the voice and the walkie still walked it off toward the operator's camera)
st = stage(3);
park(st.c); place(gs, st.p);
const gbat = gs.inventory.find((i) => i.kind === "battery");
const gdr = gbat ? br.dropItem(ghost.id, gbat.id, null) : { error: "no battery" };
await tick();
const netSrc = readFileSync(path.join(ROOT, "src", "backrooms", "net.ts"), "utf8");
const hearCalls = [...netSrc.matchAll(/^.*br\.entityHears\(.*$/gm)].map((m) => m[0]);
ok(!gdr.error && !heard(st.c) && hearCalls.length >= 2 && hearCalls.every((l) => /!\s*(me|s)\.fly/.test(l)), `…nor a flyer's dropped battery, voice or radio (${hearCalls.length} voice/radio calls, each skipping a flyer)`);
gs.fly = false;
place(gs, stairSpot);

// ---- WALLS, over everything seen ---------------------------------------------------------------
let bad2 = 0, solid = 0;
const all = seen.concat();
for (let i = 1; i < all.length; i++) {
  const a = all[i - 1], b = all[i];
  if (a.id !== b.id) continue;
  if (!walkable(Math.floor(b.x), Math.floor(b.y))) solid++;
  if (!stepAllowed(Math.floor(a.x), Math.floor(a.y), Math.floor(b.x), Math.floor(b.y)) && Math.hypot(a.x - b.x, a.y - b.y) < 1.5) bad2++;
}
ok(solid === 0 && bad2 === 0, `every step on walkable floor, never through a wall (${all.length} positions)`);

// ---- THE ADMIN'S J ----------------------------------------------------------------------------------
console.log("-- the admin's J");
place(gs, stage(1)?.p ?? gs);
ok(br.summonListener(ghost.id) === true && L().mode === "search", "summoned, it comes looking for the admin");
gs.fly = true;
ok(br.summonListener(ghost.id) === false, "…but never for a flyer");
gs.fly = false;

// ---- TWO AT EIGHT, NONE ON AN EMPTY LEVEL ----------------------------------------------------
console.log("-- how many");
const crowd = [];
for (let k = 0; k < 5; k++) { const u = mkUser(`crowd${k}`); crowd.push(u); const c = enterL(u); place(c, stairSpot); }
await waitFor(() => br.debugListeners().length === 2, 3000);
ok(br.debugListeners().length === 2, `with ${[...br.sessions.values()].filter((q) => q.level === 6).length} bodies down here, there are two of them`);
for (const q of [...br.sessions.values()]) if (q.level === 6) br.forfeit(q.userId);
await waitFor(() => br.debugListeners().length === 0, 1500);
ok(br.debugListeners().length === 0 && gone.length >= 2, "the level empty, they go back into the dark");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
