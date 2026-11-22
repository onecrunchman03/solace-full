// THE BURROWER — the Cave System's creature (Level 8), in-process against the
// real tick, one assert per agreed behaviour (BACKROOMS.md → "LEVEL 8 — THE
// CAVE SYSTEM → THE CREATURE", Josh's call 2026-10-15: "3. A"):
//
//   · none on an empty level; it surfaces when somebody comes down — far off
//     and out of every line, in its own ground; one more per five bodies;
//   · IT LIVES ONLY IN THE NARROW PASSAGES AND THE CRAWLSPACES: every place it
//     is ever reported stands in that ground, never an open cavern;
//   · IT HEARS: crawling through a crawlspace is heard; a walk in a passage
//     at 5 cells and not at 8; a creep (crouched) in a passage not at 4; a
//     sprint far; a voice far; standing still, nothing — and AT THE CLIENT'S
//     REAL CADENCE (a move every ~104-117 ms, late and bunched, on a fake
//     clock) a walk is never heard as a sprint nor a creep as a walk;
//   · a body OUT IN THE OPEN makes no noise it follows, however loud;
//   · hunting it is FASTER THAN A CRAWL in a crawlspace and FASTER THAN A
//     WALK (slower than a sprint) in a passage;
//   · reaching somebody it has just heard: death, "the burrower";
//   · STILL AND SILENT LOSES IT: reaching somebody who has gone quiet, it
//     lingers BESIDE them (never inside them), forgets them and leaves — and
//     they live;
//   · GETTING OUT INTO THE OPEN IS SAFETY: it comes to the edge and no further;
//   · never after a flyer; the admin's J sends it, only into its ground;
//   · and the client half (a source sweep): the clicking is played from its
//     frames, a crawlspace is crouch-only, the rope can't be sprinted with.
//
// CLOCKED, like the other creature harnesses: rerun it ALONE before believing
// a failure.
process.env.BACKROOMS_DIRECTOR = "0";
process.env.BACKROOMS_BURROW_LOSE_MS = "4000";

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
const { caveBurrow, caveCrawl } = require(dist("backrooms/worldgen-cave.js"));
const { LEVEL8_FLAG, CAVE_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "burrower-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledC) { console.error("the Cave System did not boot"); process.exit(1); }
br.startEntity(() => {});
store.brSetFlag(LEVEL8_FLAG, null, "harness");
store.brSetFlag(CAVE_OPEN_FLAG, null, "harness");
const sec = br.sectorC;
const SIZE = sec.size;
const idx = (x, y) => y * SIZE + x;
const D = br.debugBurrowers().dials;

// ---- the service's own wall rule, mirrored (a line of sight)
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
  if (Math.abs(sec.floor[idx(ax, ay)] - sec.floor[idx(bx, by)]) > 1) return false;
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
const burrow = (x, y) => caveBurrow(sec, Math.floor(x), Math.floor(y));
const crawl = (x, y) => caveCrawl(sec, Math.floor(x), Math.floor(y));

// ---- every position a Burrower ever reports, and its kills
const seen = [];
const kills = [];
const bites = [];
br.onBurrower((ev) => {
  if (ev.type === "pos") seen.push({ ...ev, at: Date.now() });
  else if (ev.type === "kill") kills.push({ ...ev, at: Date.now() });
  else if (ev.type === "bite") bites.push({ ...ev, at: Date.now() });
});
const B = () => br.debugBurrowers().burrowers[0];
const dbCause = async (uid) => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ? ORDER BY id DESC").get(uid);
  db.close();
  return row?.cause;
};

// ---- staging: a straight run of the Burrower's ground, the creature at one
// end and a body `d` cells along it, in line
const fromDoor = distanceMap(sec, sec.doors.map((d) => ({ x: d.x, y: d.y })));
const reach = (x, y) => fromDoor[idx(x, y)] >= 0;
const ground = [];
for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) if (walkable(x, y) && reach(x, y) && burrow(x, y)) ground.push({ x, y });
let at = 0;
/** A creature cell and a body cell `d` (± 0.35) apart, both in its ground,
 *  in line or not, the body's cell a crawlspace or a passage as asked. */
const stage = (d, { line = true, kind = "passage" } = {}) => {
  for (let k = 0; k < ground.length; k++) {
    const c = ground[(at + k * 53) % ground.length];
    const r = Math.ceil(d + 1);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!walkable(x, y) || !reach(x, y) || !burrow(x, y)) continue;
        if ((kind === "crawl") !== crawl(x, y)) continue;
        if (Math.abs(Math.hypot(dx, dy) - d) > 0.35) continue;
        if (los(c.x + 0.5, c.y + 0.5, x + 0.5, y + 0.5) !== line) continue;
        at += 11;
        return { c: { x: c.x + 0.5, y: c.y + 0.5 }, p: { x: x + 0.5, y: y + 0.5 } };
      }
  }
  return null;
};
/** A body standing in the OPEN (not its ground) right beside its ground, and a
 *  creature cell in its ground `d` off, in line with the edge cell. */
const stageEdge = (d) => {
  for (let k = 0; k < ground.length; k++) {
    const e = ground[(at + k * 29) % ground.length];
    for (const [ox, oy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = e.x + ox, y = e.y + oy;
      if (!walkable(x, y) || burrow(x, y) || !stepAllowed(e.x, e.y, x, y) || !reach(x, y)) continue;
      const st = (() => {
        const r = Math.ceil(d + 1);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const cx = e.x + dx, cy = e.y + dy;
            if (!walkable(cx, cy) || !burrow(cx, cy) || Math.abs(Math.hypot(dx, dy) - d) > 0.35) continue;
            if (!los(cx + 0.5, cy + 0.5, e.x + 0.5, e.y + 0.5)) continue;
            return { x: cx + 0.5, y: cy + 0.5 };
          }
        return null;
      })();
      if (!st) continue;
      at += 13;
      return { c: st, edge: { x: e.x + 0.5, y: e.y + 0.5 }, open: { x: x + 0.5, y: y + 0.5 } };
    }
  }
  return null;
};

const mkUser = (u, admin = false) => store.createUser({ username: u, displayName: u, passwordHash: "x", ...(admin ? { isAdmin: true } : {}) });
const enterC = (u) => {
  store.brForceAddItem(u.id, "suit", "yellow");
  const r = br.enter(u.id, u.username, 0, store.brLockerItems(u.id).map((i) => i.id), 8);
  if (r.error) throw new Error(`${u.username}: ${r.error}`);
  return r;
};
const stairSpot = { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 };
const place = (s, p) => { s.x = p.x; s.y = p.y; s.lastMoveAt = Date.now(); };
const park = (p) => br.debugParkBurrower(p.x, p.y);
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
const gait = async (s, speed, ms, pose = 0) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { step(s, speed, pose); await sleep(100); }
};
const hunting = () => B()?.mode === "hunt";
const waitFor = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const tick = () => sleep(250);
const calm = async (s) => { place(s, stairSpot); br.debugParkBurrower(B().x, B().y); await tick(); };

ok(ground.length > 600, `${ground.length} cells of passage and crawlspace to stage in`);

// ---- ARRIVAL ----------------------------------------------------------------------------
console.log("-- it surfaces when somebody comes down");
ok(br.debugBurrowers().burrowers.length === 0, "an empty Cave System has no Burrower in it");
const scout = mkUser("scout");
const ss = enterC(scout);
await waitFor(() => br.debugBurrowers().burrowers.length === 1, 1500);
const a0 = B();
ok(!!a0 && Math.hypot(a0.x - ss.x, a0.y - ss.y) >= 14 && !los(a0.x, a0.y, ss.x, ss.y), `it surfaces far off and out of sight (${a0 ? Math.hypot(a0.x - ss.x, a0.y - ss.y).toFixed(0) : "-"} cells, no line)`);
ok(!!a0 && burrow(a0.x, a0.y), "…in its own ground, a passage or a crawlspace");
ok(br.operatorView(8).monsters.some((m) => m.kind === "burrower"), "the operator sees it on the map");

// ---- WHAT IT HEARS --------------------------------------------------------------------------
console.log("-- what it hears");
let st = stage(4, { kind: "crawl" });
ok(!!st, "a crawlspace to stage in");
park(st.c); place(ss, st.p);
await gait(ss, 0.95, 300, 1);
await tick();
ok(hunting(), "crawling through a crawlspace, four cells off, is heard");
await calm(ss);
st = stage(5);
park(st.c); place(ss, st.p);
await gait(ss, 1.6, 300);
await tick();
ok(hunting(), "a walk in a passage at five cells is heard");
await calm(ss);
st = stage(8);
park(st.c); place(ss, st.p);
await gait(ss, 1.6, 900);
ok(!hunting(), "a walk at eight cells is not");
st = stage(4);
park(st.c); place(ss, st.p);
await gait(ss, 0.9, 1200, 1);
ok(!hunting(), "a creep (crouched) in a passage, four cells off, is not heard");
st = stage(9);
park(st.c); place(ss, st.p);
// (long enough to fill the server's half-second gait window — Nov 2026)
await gait(ss, 2.85, 700);
await tick();
ok(hunting(), "a sprint at nine cells is heard");
await calm(ss);
st = stage(8);
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 8);
await tick();
ok(hunting(), "a voice at eight cells is heard");
await calm(ss);
st = stage(3);
park(st.c); place(ss, st.p);
await sleep(1500);
ok(!hunting(), "standing still and silent three cells off, nothing");

// ---- THE CLIENT'S REAL CADENCE (Nov 2026 polish round) ----------------------------------
// The client sends a move only once 100 ms have passed since the last (every
// ~117 ms at 60 Hz, ~104 ms at 144 Hz), delivered late and bunched; speed off
// ONE frame heard a walk as a sprint and a creep as a walk. On a FAKE clock,
// frame by frame, so none of this is load-sensitive.
console.log("-- the client's real cadence");
let cseed = 20261101;
const crand = () => ((cseed = (cseed * 1103515245 + 12345) % 2147483648) / 2147483648);
/** The frames a client at `hz` sends over `ms`: the motion time each carries
 *  and when it arrives — 20 + U(0, jitter) ms late, in order, and with
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
const label = ([hz, j, s2]) => `${hz} Hz ±${j} ms${s2 ? " +stalls" : ""}`;
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
{
  const walkHeard = [], creepHeard = [], sprintMs = [], walkNear = [];
  // (parked again after every drive: a noise heard on the fake clock is
  // stamped in its future, and would keep it hunting long after)
  const run = (d, speed, pose, ms, c) => {
    const s2 = stage(d);
    if (!s2) return -2;
    park(s2.c); place(ss, s2.p);
    const r = drive(ss, speed, pose, cadence(c[0], c[1], ms, c[2]), hunting);
    br.debugParkBurrower(B().x, B().y);
    return r;
  };
  for (const c of CADENCES) {
    if (run(8, 2.05, 0, 20_000, c) !== -1) walkHeard.push(label(c));
    if (run(4, 1.025, 1, 20_000, c) !== -1) creepHeard.push(label(c));
    sprintMs.push(run(8, 2.85, 0, 3_000, c));
    walkNear.push(run(5, 2.05, 0, 3_000, c));
  }
  place(ss, stairSpot);
  ok(!walkHeard.length, `twenty seconds of walking a passage eight cells off, at every cadence: never heard as a sprint${walkHeard.length ? " (heard at " + walkHeard.join(", ") + ")" : ""}`);
  ok(!creepHeard.length, `twenty seconds of creeping (crouched) four cells off: never heard as a walk${creepHeard.length ? " (heard at " + creepHeard.join(", ") + ")" : ""}`);
  ok(sprintMs.every((m) => m >= 0 && m <= 800), `a sprint from a standstill eight cells off is heard within the first ${Math.max(...sprintMs)} ms at every cadence (${sprintMs.join(", ")})`);
  ok(walkNear.every((m) => m >= 0 && m <= 800), `…and a real walk at five cells still is (${walkNear.join(", ")} ms)`);
}

// ---- THE OPEN MAKES NO NOISE IT FOLLOWS ----------------------------------------------------
console.log("-- out in the open");
let se = stageEdge(4);
ok(!!se, "a passage that opens into the open, to stage at");
park(se.c); place(ss, se.open);
await gait(ss, 2.85, 900);
ok(!hunting(), "a sprint OUT IN THE OPEN, right beside its ground, draws nothing");

// ---- HOW FAST IT HUNTS --------------------------------------------------------------------
console.log("-- how fast it hunts");
const speedOver = (from, to) => {
  const ps = seen.filter((p) => p.at >= from && p.at <= to && p.mode === "hunt");
  if (ps.length < 3) return 0;
  let d = 0;
  for (let i = 1; i < ps.length; i++) d += Math.hypot(ps[i].x - ps[i - 1].x, ps[i].y - ps[i - 1].y);
  return d / ((ps[ps.length - 1].at - ps[0].at) / 1000);
};
st = stage(8.5);
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 8);
let t0 = Date.now();
await sleep(1800);
const vPassage = speedOver(t0 + 300, Date.now());
ok(vPassage > 2.05 && vPassage < 2.85, `hunting down a passage it goes ${vPassage.toFixed(2)} cells/s — faster than a walk (2.05), slower than a sprint (2.85)`);
await calm(ss);
st = stage(7, { kind: "crawl" });
park(st.c); place(ss, st.p);
br.entityHears(ss.x, ss.y, 6, 8);
t0 = Date.now();
await sleep(1500);
const crawlSeen = seen.filter((p) => p.at >= t0 + 300 && crawl(p.x, p.y));
const vCrawl = speedOver(t0 + 300, Date.now());
ok(crawlSeen.length >= 3 && vCrawl > 1.03 && vCrawl < D.passage, `in a crawlspace it goes ${vCrawl.toFixed(2)} cells/s — faster than a crawl (1.03)`);
await calm(ss);

// ---- STILL AND SILENT ---------------------------------------------------------------------
console.log("-- still and silent");
// (one footstep heard, from THIS body, seven cells off: far enough that it has
// gone quiet — BURROW_QUIET — before it can reach them. It was a 200 ms walk
// at "6 ± 0.35" cells, which a walk carries only up to 6: a staging coin-flip,
// and so close a run that the quiet and the arrival raced. Nov 2026.)
st = stage(7);
park(st.c); place(ss, st.p);
br.burrowerHears(ss.x, ss.y, 9, ss.userId);
await waitFor(() => !!B() && (B().mode === "linger" || Math.hypot(B().x - ss.x, B().y - ss.y) < 0.6), 6000);
const reached = !!B() && Math.hypot(B().x - ss.x, B().y - ss.y) < 1.4;
// it stops BESIDE them, a body's width off, never on them (Nov 2026 polish
// round: it walked to where the noise was — the body — and lay down in it)
let nearestQuiet = Infinity;
for (let i = 0; i < 10; i++) { if (B()) nearestQuiet = Math.min(nearestQuiet, Math.hypot(B().x - ss.x, B().y - ss.y)); await sleep(50); }
ok(reached && !ss.lostAt, `it reached the body — gone quiet after one step — and did not take it (${B()?.mode})`);
ok(nearestQuiet >= 0.85 && nearestQuiet <= 1.4, `…it lingers beside them, never inside them (${nearestQuiet.toFixed(2)} cells off; its bite reach is 0.75)`);
await waitFor(() => B()?.mode === "roam" && Math.hypot(B().x - ss.x, B().y - ss.y) > 2, 9000);
ok(!ss.lostAt && B()?.mode === "roam" && Math.hypot(B().x - ss.x, B().y - ss.y) > 2, "…it lingered, forgot them and went off; they live");

// ---- THE TOUCH --------------------------------------------------------------------------------
console.log("-- the touch");
const victim = mkUser("victim");
const vs = enterC(victim);
st = stage(4);
park(st.c); place(vs, st.p);
const k0 = kills.length;
const b0 = bites.length;
let walking = true;
let hpAfterBite = null;
const walker = (async () => { while (walking && !vs.lostAt) { step(vs, 1.6); await sleep(100); } })();
await waitFor(() => bites.length > b0 || kills.length > k0 || !br.sessions.get(victim.id), 6000);
if (bites.length > b0 && br.sessions.get(victim.id)) hpAfterBite = br.sessions.get(victim.id).hp;
await waitFor(() => kills.length > k0 || !br.sessions.get(victim.id), 6000);
walking = false;
await walker;
const firstBite = bites.slice(b0).find((e) => e.userId === victim.id);
const theKill = kills.slice(k0).find((e) => e.userId === victim.id);
ok(!!firstBite && hpAfterBite !== null && hpAfterBite > 0 && hpAfterBite < 100, `THE FIRST BITE HURTS: walking on in its passage while it comes, it bites — and they're still standing (${hpAfterBite} hp)`);
ok(!!theKill, "…keep walking where it can hear you and the next bite kills");
ok(!!firstBite && !!theKill && theKill.at - firstBite.at >= 1200, `…a breath between the two — it pulls back after a bite (${firstBite && theKill ? theKill.at - firstBite.at : "-"}ms)`);
ok((await dbCause(victim.id)) === "the burrower", "…the death is written as \"the burrower\"");

// ---- THE OPEN IS SAFETY ----------------------------------------------------------------------
console.log("-- getting out into the open");
const runner = mkUser("runner");
const rs = enterC(runner);
se = stageEdge(5);
park(se.c); place(rs, se.edge);
await gait(rs, 1.6, 200);
await tick();
ok(hunting(), "heard at the mouth of its passage, it comes");
place(rs, se.open);
let w2 = true;
const keep = (async () => { while (w2) { step(rs, 1.6); await sleep(100); } })();
await sleep(4000);
w2 = false;
await keep;
const nearest = Math.min(...seen.filter((p) => p.at > Date.now() - 4000).map((p) => Math.hypot(p.x - se.open.x, p.y - se.open.y)));
ok(!rs.lostAt && br.sessions.get(runner.id), `stepped out into the open and kept walking there: alive (it came within ${nearest.toFixed(1)} cells)`);
ok(seen.every((p) => burrow(p.x, p.y)), `in ${seen.length} reported positions it never once stood outside its ground`);

// ---- COUNT, FLYERS, THE ADMIN -----------------------------------------------------------------
console.log("-- how many, flyers, the admin");
const more = [];
for (let k = 0; k < 5; k++) more.push(enterC(mkUser(`caver${k}`)));
await waitFor(() => br.debugBurrowers().burrowers.length === 2, 2000);
ok(br.debugBurrowers().burrowers.length === 2, "with six bodies down here, two of them");
for (const q of more) br.forfeit(q.userId);
br.forfeit(runner.id);
const admin = mkUser("operator", true);
const as = enterC(admin);
place(ss, stairSpot);
as.fly = true;
st = stage(5);
park(st.c); place(as, st.p);
await gait(as, 2.85, 600);
ok(!hunting(), "a flyer sprinting in its passage is never heard");
as.fly = false;
place(as, stairSpot);
ok(br.summonBurrower(admin.id) === false, "the admin's J outside its ground does nothing");
st = stage(4);
place(as, st.p);
ok(br.summonBurrower(admin.id) === true && hunting(), "…and in a passage sends it at the admin");
br.forfeit(admin.id);
br.forfeit(scout.id);
await waitFor(() => br.debugBurrowers().burrowers.length === 0, 1500);
ok(br.debugBurrowers().burrowers.length === 0, "the level emptied: back into the rock");

// ---- THE CLIENT HALF (a source sweep) ----------------------------------------------------------
console.log("-- the client half");
const game = readFileSync(path.join(ROOT, "client", "src", "backrooms", "BackroomsGame.svelte"), "utf8");
const ctl = readFileSync(path.join(ROOT, "client", "src", "backrooms", "controller.ts"), "utf8");
ok(/updateCaveLoop\("click", b && !hunting/.test(game) && /updateCaveLoop\("click-fast", b && hunting/.test(game), "the clicking is played from its frames — slow while it roams, fast while it hunts");
ok(/mods\.tall && world\.lowAt\?\.\(toX, toY\)/.test(ctl) && /world\.lowAt\(Math\.floor\(player\.x\)/.test(game), "a crawlspace can't be walked into standing, and inside it you stay crouched");
ok(/const ropeBound = level === 8 && hasKey/.test(game) && /allowSprint = !winded && !crouching && !ropeBound/.test(game), "the Climbing Rope is too heavy to run with");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
