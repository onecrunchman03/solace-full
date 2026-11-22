// LEVEL 0's CREATURES — the three Entities and THE STALKER, driven in-process.
//
// The brains live inside createBackrooms' closure, so this drives the REAL
// service: a throwaway DB, hand-built sessions injected into br.sessions, and
// the actual 100ms tick loop. The Entities' beat is dialled down to harness
// time through the env dials the service reads at construction.
//
// What it pins down (Josh, Sep 30 2026):
//   · "lets have 3 entities, with the third wondering around the key, not
//     right on top on it but in the area with a couple pass through here and
//     there"
//   · "a quick validation check on level 0's creature AI … path finding,
//     animations, hunting" — nobody walks through a wall, nobody falls into a
//     shaft, nobody stands stuck on its beat, a chase closes on you
//   · the stalker: "it takes shining the flashlight for at least 2 seconds to
//     scare it away" and "follows the players too closely … keeps walking in
//     their line of sight then running away"
//   · "if player get the key and unlock the next level then the 3rd entity
//     should just wonder around the entire map"
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));

process.env.BACKROOMS_ENT_PICK_MIN_MS = "500";
process.env.BACKROOMS_ENT_PICK_SPAN_MS = "400";
process.env.BACKROOMS_KEEPER_PASS_MIN = "1"; // a pass every 1-3 picks, so 30s holds several
process.env.BACKROOMS_ENT_SWAP_MIN_MS = "600000"; // no cross-map trades mid-test
process.env.BACKROOMS_ENT_SWAP_MAX_MS = "600001";

// SEEDED: the harness's routes AND the creatures' own dice (the service rolls
// Math.random) come from one seed, printed, so a failure can be replayed with
// HSEED=<n>. Timing still varies a little run to run.
const HSEED = Number(process.env.HSEED ?? Math.floor(Math.random() * 1e6));
{
  let t = HSEED >>> 0;
  Math.random = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell } = require(dist("backrooms/worldgen.js"));
const { LEVEL1_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", `level0-creatures-harness-${HSEED}.db`);
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const sec = br.sector;
const SIZE = sec.size;

// ---- geometry (mirrors of the service's own rules) -------------------------
const idx = (x, y) => y * SIZE + x;
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const eff = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : (sec.eff ?? sec.floor)[idx(x, y)]);
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
  if (!heightPassable(eff(ax, ay), eff(bx, by))) return false;
  if (by === ay - 1) return !sec.wallN[idx(ax, ay)];
  if (by === ay + 1) return !sec.wallN[idx(bx, by)];
  if (bx === ax - 1) return !sec.wallW[idx(ax, ay)];
  if (bx === ax + 1) return !sec.wallW[idx(bx, by)];
  return ax === bx && ay === by;
};
const stepAllowed = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return true;
  if (Math.abs(dx) + Math.abs(dy) === 1) return edgeOpen(ax, ay, bx, by);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    return (edgeOpen(ax, ay, ax + dx, ay) && edgeOpen(ax + dx, ay, bx, by)) ||
      (edgeOpen(ax, ay, ax, ay + dy) && edgeOpen(ax, ay + dy, bx, by));
  }
  return false;
};
/** The service's sight ray, reimplemented so "seen" is measured here. */
const los = (x0, y0, x1, y1) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 0.15));
  let pcx = Math.floor(x0), pcy = Math.floor(y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor(x0 + (x1 - x0) * t);
    const cy = Math.floor(y0 + (y1 - y0) * t);
    if (cx !== pcx || cy !== pcy) {
      if (!stepAllowed(pcx, pcy, cx, cy)) return false;
      pcx = cx; pcy = cy;
    }
  }
  return true;
};
const pit = (x, y) => isPitCell(sec, Math.floor(x), Math.floor(y));
/** A walking route: BFS over legal steps (no shafts) from a to b. */
const route = (ax, ay, bx, by) => {
  const prev = new Map([[idx(ax, ay), -1]]);
  const q = [[ax, ay]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === bx && y === by) break;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = idx(nx, ny);
      if (prev.has(k) || !edgeOpen(x, y, nx, ny) || isPitCell(sec, nx, ny)) continue;
      prev.set(k, idx(x, y));
      q.push([nx, ny]);
    }
  }
  if (!prev.has(idx(bx, by))) return null;
  const out = [];
  for (let k = idx(bx, by); k !== -1; k = prev.get(k)) out.push([k % SIZE, Math.floor(k / SIZE)]);
  return out.reverse();
};

// ---- sessions ---------------------------------------------------------------
let nextId = 300;
const mkSession = (x, y) => ({
  userId: nextId++, name: "runner" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 0, subSince: null, boatId: null, fall: null, equip: undefined,
});
const put = (s) => { br.sessions.set(s.userId, s); br.setImmortal(s.userId, true); return s; };
/** The heading a client sends while looking at (x,y): YAW 0 FACES −Y, so the
 *  facing vector is (−sin h, −cos h). */
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };

const stalkerEvents = [];
br.onStalker((ev) => stalkerEvents.push({ ...ev, at: Date.now() }));
br.startEntity(() => {});
const dbg = () => br.debugState();

// Wall-clip + shaft watcher: every creature position, every tick, checked
// against the one before it.
const trail = new Map();
let clips = 0, clipNote = "", inPit = 0, pitNote = "";
const watch = setInterval(() => {
  const d = dbg();
  const bodies = [...d.entities.map((e) => ["ent" + e.id, e]), ...(d.stalker ? [["stalker", d.stalker]] : [])];
  for (const [k, p] of bodies) {
    const last = trail.get(k);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 3 && !los(last.x, last.y, p.x, p.y)) {
      clips++;
      clipNote ||= `${k} ${last.x.toFixed(1)},${last.y.toFixed(1)} → ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }
    if (pit(p.x, p.y)) { inPit++; pitNote ||= `${k} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`; }
    trail.set(k, { x: p.x, y: p.y });
  }
}, 100);

const key = dbg().key;
const door = sec.doors[0];
console.log(`seed ${HSEED} · Level 0 ${SIZE}² · the key at ${key.x},${key.y} · The Entrance at ${door.x},${door.y}`);

const run = async () => {
  // ---- 1. THREE ENTITIES, THE THIRD ON THE KEY ----------------------------
  // The runner stands at The Entrance, far from the key, so nothing in this
  // section is about them.
  let ex = Math.floor(door.x), ey = Math.floor(door.y);
  for (let r = 0; r < 6 && !walkable(ex, ey); r++) ey++;
  const watcher = put(mkSession(ex + 0.5, ey + 0.5));
  await sleep(600);
  const e0 = dbg().entities;
  ok(e0.length === 3, `three Entities on Level 0 (${e0.length})`);
  const keeperAt = () => dbg().entities.find((e) => e.id === 2);
  const k0 = keeperAt();
  const k0d = k0 ? Math.hypot(k0.x - key.x, k0.y - key.y) : Infinity;
  ok(k0 && k0d >= 4 && k0d <= 22, `the third starts on its beat round the key (${k0d.toFixed(1)} cells off)`);

  const kd = [];
  let passes = 0, inPass = false;
  // A pass is a real walk — ~16 cells in and out again at 1.15 cells/s, about
  // twenty seconds — so the window is a minute.
  // (at least a minute; up to two for the second pass)
  for (let i = 0; i < 1200 && (i < 600 || passes < 2); i++) {
    const k = keeperAt();
    const d = Math.hypot(k.x - key.x, k.y - key.y);
    kd.push(d);
    if (d < 3 && !inPass) { passes++; inPass = true; }
    if (d > 5) inPass = false;
    await sleep(100);
  }
  kd.sort((a, b) => a - b);
  const median = kd[Math.floor(kd.length / 2)];
  const onTop = kd.filter((d) => d < 3).length / kd.length;
  const onBeat = kd.filter((d) => d <= 26).length / kd.length;
  ok(onBeat >= 0.95, `it keeps to the key's ground (${(onBeat * 100).toFixed(0)}% of the watch within 26 cells)`);
  ok(median >= 4, `…not right on top of it (median ${median.toFixed(1)} cells off)`);
  // (a pass every 1-3 picks here, against 3-5 in the game — this bound is
  // for harness pace; in play it is near the key well under a tenth of the time)
  ok(onTop <= 0.35, `…only near the key in passing (${(onTop * 100).toFixed(0)}% of the time within 3 cells)`);
  ok(passes >= 2, `…and it passes through now and then (${passes} passes in ${(kd.length / 600).toFixed(1)} min at harness pace)`);

  // Not stuck: over 30s every Entity on patrol keeps moving.
  const moved = new Map();
  const startPos = new Map(dbg().entities.map((e) => [e.id, e]));
  let stuckWindows = 0, windows = 0;
  for (let w = 0; w < 6; w++) {
    const a = new Map(dbg().entities.map((e) => [e.id, e]));
    await sleep(2500);
    const b = dbg().entities;
    for (const e of b) {
      if (e.mode === "chase") continue;
      windows++;
      const p = a.get(e.id);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      moved.set(e.id, (moved.get(e.id) ?? 0) + d);
      if (d < 0.3) stuckWindows++;
    }
  }
  void startPos;
  ok(stuckWindows <= 2, `no Entity stands stuck on its beat (${stuckWindows} of ${windows} 2.5s windows without a step)`);

  // ---- 2. THE CHASE CLOSES ---------------------------------------------------
  // Put a runner in plain view of Entity 0, eight or so cells off, and stand
  // still: with a clear line it comes straight at you.
  let spot = null, ent0 = null;
  for (const cand of dbg().entities.filter((e) => e.id !== 2)) {
    ent0 = cand;
  for (let r = 11; r >= 5 && !spot; r--) {
    for (let a = 0; a < 48 && !spot; a++) {
      const cx = Math.floor(ent0.x + Math.cos((a / 48) * Math.PI * 2) * r);
      const cy = Math.floor(ent0.y + Math.sin((a / 48) * Math.PI * 2) * r);
      if (!walkable(cx, cy) || isPitCell(sec, cx, cy)) continue;
      if (los(cx + 0.5, cy + 0.5, ent0.x, ent0.y)) spot = [cx + 0.5, cy + 0.5];
    }
  }
    if (spot) break;
  }
  ok(!!spot, "found open ground in view of an Entity");
  if (spot) {
    const bait = put(mkSession(spot[0], spot[1]));
    const t0 = Date.now();
    // (it keeps walking its beat while the runner is placed, and may step out
    // of the line first — so the clock runs from when the chase STARTS)
    let closest = Infinity, caughtAt = 0, chased = false, chaseFrom = 0;
    while (Date.now() - t0 < 12000) {
      const e = dbg().entities.find((q) => q.id === ent0.id);
      if (e.mode === "chase" && !chased) { chased = true; chaseFrom = Date.now(); }
      const d = Math.hypot(e.x - bait.x, e.y - bait.y);
      if (d < closest) closest = d;
      if (d < 0.6 && !caughtAt) { caughtAt = Date.now() - (chaseFrom || t0); break; }
      await sleep(50);
    }
    ok(chased, "seen: it gives chase");
    ok(caughtAt > 0 && caughtAt < 6000, `it closes on a runner standing in view (caught ${(caughtAt / 1000).toFixed(1)}s into the chase, closest ${closest.toFixed(2)})`);
    br.sessions.delete(bait.userId);
  } else {
    ok(false, "seen: it gives chase");
    ok(false, "it closes on a runner standing in view");
  }
  br.sessions.delete(watcher.userId);
  await sleep(300);

  // ---- 3. THE STALKER, LIGHTS ON: behind you, out of sight ---------------
  // A runner walks the level for a minute — across rooms, through doors,
  // turning round to look behind them — and the harness counts every tick
  // the stalker stands in a clear line of sight within 34 cells.
  // THE DOOR opens: from here on the keeper has nothing to keep.
  store.brSetFlag(LEVEL1_FLAG, null, "harness");
  let keeperFar = 0;
  const walker = put(mkSession(ex + 0.5, ey + 0.5));
  const legs = [];
  {
    let cx = ex, cy = ey;
    for (let l = 0; l < 8; l++) {
      let r = null;
      for (let tries = 0; tries < 60 && !r; tries++) {
        const tx = 4 + Math.floor(Math.random() * (SIZE - 8));
        const ty = 4 + Math.floor(Math.random() * (SIZE - 8));
        if (!walkable(tx, ty) || Math.hypot(tx - cx, ty - cy) < 30) continue;
        r = route(cx, cy, tx, ty);
      }
      if (!r) break;
      legs.push(...r);
      [cx, cy] = r[r.length - 1];
    }
  }
  ok(legs.length > 200, `a walking route across the level (${legs.length} cells)`);
  let seen = 0, samples = 0, near = 0, near6 = 0, nearSeen = 0, following = 0, sumD = 0, dN = 0;
  const WALK = 1.6; // cells/s
  let pos = 0;
  const tEnd = Date.now() + 60_000;
  let lastLook = Date.now();
  while (Date.now() < tEnd && pos < legs.length - 1) {
    pos = Math.min(legs.length - 1, pos + WALK * 0.1);
    const i = Math.floor(pos);
    const f = pos - i;
    const [ax, ay] = legs[i];
    const [bx, by] = legs[Math.min(legs.length - 1, i + 1)];
    walker.x = ax + 0.5 + (bx - ax) * f;
    walker.y = ay + 0.5 + (by - ay) * f;
    // Face the way you walk, and every 4s look back over your shoulder.
    const lookBack = Date.now() - lastLook > 4000;
    if (lookBack) lastLook = Date.now();
    faceAt(walker, bx + 0.5, by + 0.5);
    if (Date.now() - lastLook < 900) walker.heading += Math.PI;
    await sleep(100);
    const kp = dbg().entities.find((e) => e.id === 2);
    if (kp) keeperFar = Math.max(keeperFar, Math.hypot(kp.x - key.x, kp.y - key.y));
    if (process.env.TRACE && kp && samples % 20 === 0) console.log(`   keeper ${kp.x.toFixed(1)},${kp.y.toFixed(1)} ${kp.mode} ${Math.hypot(kp.x - key.x, kp.y - key.y).toFixed(1)} from the key`);
    const st = dbg().stalker;
    if (!st) continue;
    samples++;
    const d = Math.hypot(st.x - walker.x, st.y - walker.y);
    if (d <= 34 && los(walker.x, walker.y, st.x, st.y)) seen++;
    if (d < 10) near++;
    if (d < 6) near6++;
    if (process.env.TRACE && d < 8) console.log(`   near t=${samples} walker ${walker.x.toFixed(1)},${walker.y.toFixed(1)} h=${walker.heading.toFixed(2)} stalker ${st.x.toFixed(1)},${st.y.toFixed(1)} ${st.mode} d=${d.toFixed(1)} los=${los(walker.x, walker.y, st.x, st.y)}`);
    if (d < 12 && los(walker.x, walker.y, st.x, st.y)) nearSeen++;
    if (d <= 45) following++;
    sumD += d; dN++;
  }
  const seenPct = (seen / Math.max(1, samples)) * 100;
  console.log(`    (stalker over ${samples} ticks: seen ${seen}, within 10 cells ${near}, mean distance ${(sumD / Math.max(1, dN)).toFixed(1)})`);
  ok(keeperFar >= 30, `the door open, the third leaves the key and roams the level (${keeperFar.toFixed(0)} cells from it at the furthest)`);
  ok(samples > 300, `the stalker came for the walker (${samples} ticks)`);
  ok(seenPct <= 4, `while the lights hold it is almost never in a line of sight (${seenPct.toFixed(1)}% of ticks — a glimpse, not a figure)`);
  // Hidden behind a wall it may be close when your route runs past its hiding
  // place (and that is fine — you never see it); what Josh reported was it
  // close AND in view. Most runs: never. The known edge (about 1 seeded run
  // in 20): a runner who walks straight into the dead end it is hiding in,
  // where the only way out is past them — so the bound is 3%, not 0.
  ok(nearSeen / Math.max(1, samples) <= 0.03 && near6 / Math.max(1, samples) <= 0.03, `it keeps its distance (${nearSeen} ticks close AND in view, ${near6} within 6 cells; ${near} within 10 behind walls or not)`);
  ok(following / Math.max(1, samples) >= 0.6, `…and it keeps following (${((following / Math.max(1, samples)) * 100).toFixed(0)}% of the walk within 45 cells)`);

  // ---- 4. THE BURN: a beam has to be HELD for two seconds -----------------
  // Staged in the most open ground on the level, so it comes at the runner
  // across a long clear line. The power goes out, it hunts, and the runner
  // points a lit flashlight straight at it every 50ms.
  let hall = null, hallScore = -1;
  for (let y = 4; y < SIZE - 4; y += 2) {
    for (let x = 4; x < SIZE - 4; x += 2) {
      if (!walkable(x, y) || isPitCell(sec, x, y)) continue;
      let c = 0;
      for (let k = 0; k < 16; k++) {
        const px = x + 0.5 + Math.cos((k / 16) * Math.PI * 2) * 14;
        const py = y + 0.5 + Math.sin((k / 16) * Math.PI * 2) * 14;
        if (walkable(Math.floor(px), Math.floor(py)) && los(x + 0.5, y + 0.5, px, py)) c++;
      }
      if (c > hallScore) { hallScore = c; hall = [x + 0.5, y + 0.5]; }
    }
  }
  ok(hallScore >= 8, `an open hall to stage it in (${hallScore}/16 directions clear for 14 cells)`);
  const lamp = walker;
  lamp.x = hall[0]; lamp.y = hall[1];
  lamp.equip = "flashlight!";
  br.triggerBrownout(180_000, true);
  let beamOn = false;
  const aim = setInterval(() => {
    const st = dbg().stalker;
    if (!st) return;
    if (beamOn) faceAt(lamp, st.x, st.y);
    else faceAt(lamp, lamp.x * 2 - st.x, lamp.y * 2 - st.y); // look the other way
  }, 50);
  const inBeam = () => {
    const st = dbg().stalker;
    return st && st.mode === "hunt" && Math.hypot(st.x - lamp.x, st.y - lamp.y) <= 15 && los(lamp.x, lamp.y, st.x, st.y);
  };
  let t0 = Date.now();
  // (it may be 130 cells off across the level — ~25s at its hunting pace)
  while (Date.now() - t0 < 50_000 && !inBeam()) await sleep(50);
  ok(inBeam(), "blackout: it hunts, into a flashlight's reach");
  // A sweep: on a second, off a second, on a second — never two held.
  stalkerEvents.length = 0;
  let sweptFled = false;
  for (const [on, ms] of [[true, 1000], [false, 1000], [true, 1000], [false, 600]]) {
    beamOn = on;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (dbg().stalker?.mode === "flee") sweptFled = true;
      await sleep(50);
    }
  }
  const burnedFrames = stalkerEvents.filter((e) => e.type === "pos" && e.burn).length;
  ok(burnedFrames >= 5, `a beam on it burns (the wire says so: ${burnedFrames} burning frames)`);
  ok(!sweptFled, "a beam swept across it — a second on, a second off — does not drive it off");

  // Now HOLD it. The sweep let it reach the runner (immortal here, so it
  // stands on them): the runner steps back across the hall, 12-15 cells, to a
  // spot with a clear line to it.
  {
    const st = dbg().stalker;
    let best = null;
    for (let r = 15; r >= 10 && !best; r--) {
      for (let k = 0; k < 64 && !best; k++) {
        const px = st.x + Math.cos((k / 64) * Math.PI * 2) * r;
        const py = st.y + Math.sin((k / 64) * Math.PI * 2) * r;
        if (!walkable(Math.floor(px), Math.floor(py)) || isPitCell(sec, Math.floor(px), Math.floor(py))) continue;
        if (los(px, py, st.x, st.y)) best = [Math.floor(px) + 0.5, Math.floor(py) + 0.5];
      }
    }
    ok(!!best, "the runner steps back across the hall, in its line");
    if (best) { lamp.x = best[0]; lamp.y = best[1]; }
  }
  beamOn = true;
  stalkerEvents.length = 0;
  let fled = false;
  t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    if (dbg().stalker?.mode === "flee") { fled = true; break; }
    await sleep(50);
  }
  // THE BURN IS BEAM TIME, not wall time: count the burning frames the wire
  // carried before it broke (one per 100ms tick).
  const burning = stalkerEvents.filter((e) => e.type === "pos" && e.burn);
  const burnS = burning.length / 10;
  ok(fled, `held on it, the beam drives it off (${((Date.now() - t0) / 1000).toFixed(1)}s after the beam went on)`);
  ok(burnS >= 1.8 && burnS <= 2.8, `…after about two seconds of burning (${burnS.toFixed(1)}s in the beam)`);
  let burnPath = 0;
  for (let i = 1; i < burning.length; i++) burnPath += Math.hypot(burning[i].x - burning[i - 1].x, burning[i].y - burning[i - 1].y);
  const burnSpeed = burning.length > 1 ? burnPath / ((burning.length - 1) / 10) : 99;
  ok(burnSpeed <= 2.2, `while it burns it staggers — ${burnSpeed.toFixed(2)} cells/s against its 5.7`);
  let da = 0, dq = 0;
  if (fled) {
    const p = dbg().stalker;
    da = Math.hypot(p.x - lamp.x, p.y - lamp.y);
    await sleep(1500);
    const q = dbg().stalker;
    dq = Math.hypot(q.x - lamp.x, q.y - lamp.y);
  }
  ok(fled && dq > da + 3, `…and it runs, away from the light (${da.toFixed(1)} → ${dq.toFixed(1)} cells)`);
  clearInterval(aim);

  // ---- 5. PATHING, ACROSS EVERYTHING ABOVE ---------------------------------
  ok(clips === 0, `no creature ever stepped through a wall (${clips} bad steps${clipNote ? ": " + clipNote : ""})`);
  ok(inPit === 0, `no creature ever entered a shaft (${inPit}${pitNote ? ": " + pitNote : ""})`);
};

run()
  .catch((e) => { bad++; console.error(e); })
  .finally(() => {
    clearInterval(watch);
    console.log(`\n${n - bad}/${n} asserts passed`);
    try { store.close?.(); } catch {}
    for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
    process.exit(bad ? 1 : 0);
  });
