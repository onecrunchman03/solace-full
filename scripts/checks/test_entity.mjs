// THE ENTITY — Level 0's relic-bound hunters, one assert per agreed
// behaviour (BACKROOMS.md → B3's "THE ENTITY", "TWO ENTITIES", and
// "LEVEL 0's CREATURES, VALIDATED"), driven in-process against the real
// service and its 100ms tick.
//
// What test_level0_creatures and test_spawned already pin is not repeated
// here (the keeper's beat, nobody stuck, a chase closing, the editor's
// spawners). This is the rest, which the Oct 2026 law 2 audit found with no
// assert at all:
//   · it ORBITS its relic post, circling back through it
//   · the two relic Entities SWAP posts on a schedule ("the cross-map treks")
//   · it WANDERS slowly and CHASES slower than a sprint ("player is 20% faster")
//   · it HEARS footsteps: running ~10m (5 cells), walking ~5m, crouching
//     silent — and voices (entityHears)
//   · touch is death, written as "the entity"
//   · a kill SATES it: it stands over the body a while, deaf and blind to the
//     next one — then goes back to work
//   · out of sight it SEARCHES the spot it last saw you, never your live
//     position (the Oct 2026 fix)
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

// Harness pace: picks every 0.5-0.9s, and the first SWAP due ~25s after boot
// (the orbit is watched before it; the swap is waited for after).
process.env.BACKROOMS_ENT_PICK_MIN_MS = "500";
process.env.BACKROOMS_ENT_PICK_SPAN_MS = "400";
// The SWAP is checked in a child run of this same file (--swap) on a 20s
// clock; the main run never swaps, so the orbit is watched on a fixed post.
const SWAP_CHILD = process.argv.includes("--swap");
process.env.BACKROOMS_ENT_SWAP_MIN_MS = SWAP_CHILD ? "20000" : "600000";
process.env.BACKROOMS_ENT_SWAP_MAX_MS = SWAP_CHILD ? "21000" : "600001";

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "entity-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const sec = br.sector;
const SIZE = sec.size;

// ---- geometry (the service's own rules, mirrored) ---------------------------
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
    const cx = Math.floor(x0 + (x1 - x0) * t);
    const cy = Math.floor(y0 + (y1 - y0) * t);
    if (cx !== pcx || cy !== pcy) {
      if (!stepAllowed(pcx, pcy, cx, cy)) return false;
      pcx = cx; pcy = cy;
    }
  }
  return true;
};
const open = (x, y) => walkable(x, y) && !isPitCell(sec, x, y);

// ---- sessions ----------------------------------------------------------------
let nextId = 500;
const mk = (x, y) => ({
  userId: nextId++, name: "walker" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 0, subSince: null, boatId: null, fall: null, equip: undefined,
});
const put = (s, immortal = true) => { br.sessions.set(s.userId, s); br.setImmortal(s.userId, immortal); return s; };
const drop = (s) => br.sessions.delete(s.userId);
const ents = () => br.debugState().entities;
const ent = (id) => ents().find((e) => e.id === id);

/** A cell `r0..r1` cells from (x,y) that passes `want`, or null. */
const ringSpot = (x, y, r0, r1, want) => {
  for (let r = r0; r <= r1; r++) {
    for (let a = 0; a < 48; a++) {
      const cx = Math.floor(x + Math.cos((a / 48) * Math.PI * 2) * r);
      const cy = Math.floor(y + Math.sin((a / 48) * Math.PI * 2) * r);
      if (open(cx, cy) && want(cx + 0.5, cy + 0.5)) return { x: cx + 0.5, y: cy + 0.5 };
    }
  }
  return null;
};

br.startEntity(() => {});
const door = sec.doors[0];
let ex = Math.floor(door.x), ey = Math.floor(door.y);
for (let r = 0; r < 6 && !walkable(ex, ey); r++) ey++;

/** A clear line WIDE enough for a body: every cell on it and beside it open,
 *  and the thin-wall line clear — where the charge is a straight charge. */
const wideClear = (x0, y0, x1, y1) => {
  if (!los(x0, y0, x1, y1)) return false;
  for (let t = 0; t <= 40; t++) {
    const px = x0 + (x1 - x0) * (t / 40), py = y0 + (y1 - y0) * (t / 40);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!open(Math.floor(px) + dx, Math.floor(py) + dy)) return false;
  }
  return true;
};

const swapChild = async () => {
  const w = put(mk(ex + 0.5, ey + 0.5));
  w.fly = true;
  await sleep(800);
  const key = (e) => (e.home ? `${e.home.x},${e.home.y}` : "");
  const before = new Map(ents().filter((e) => e.id !== 2).map((e) => [e.id, key(e)]));
  let swapped = false;
  for (let i = 0; i < 300 && !swapped; i++) {
    await sleep(100);
    const now = new Map(ents().filter((e) => e.id !== 2).map((e) => [e.id, key(e)]));
    const [a, b] = [...before.keys()];
    swapped = !!before.get(a) && before.get(a) !== before.get(b) && now.get(a) === before.get(b) && now.get(b) === before.get(a);
  }
  console.log("SWAP " + JSON.stringify({ swapped }));
  process.exit(0);
};

const run = async () => {
  if (SWAP_CHILD) return swapChild();
  // Somebody has to be on the level or the world holds its breath. The
  // watcher stands at The Entrance, flying — the creatures can't see, hear
  // or touch a flyer, so it wakes the level without being part of it.
  const watcher = put(mk(ex + 0.5, ey + 0.5));
  watcher.fly = true;
  await sleep(800);

  // ---- 1. THE ORBIT --------------------------------------------------------
  console.log("-- it orbits its relic post");
  {
    const relicEnts = ents().filter((e) => e.id !== 2);
    ok(relicEnts.length === 2 && relicEnts.every((e) => e.home), `the two relic Entities each have a post (${relicEnts.map((e) => (e.home ? "post" : "none")).join(", ")})`);
    // They start wherever the first placement put them and TREK to their
    // posts first (the 16-cell rule); the orbit is watched once both arrive.
    // The trek is an amble (~1.15 cells/s) from wherever placement left them,
    // and the walking route through packed Level 0 rooms can be twice the
    // straight line — no fixed clock fits every seed (three minutes timed out
    // mid-trek, Oct 2026). So it waits as long as the trek is MOVING: it gives
    // up only when the furthest Entity has gained nothing for 30 seconds,
    // which a stuck one still fails fast.
    const furthest = () => Math.max(...ents().filter((q) => q.id !== 2 && q.home).map((e) => Math.hypot(e.x - e.home.x, e.y - e.home.y)));
    const far = furthest();
    let arrived = false, best = far, bestAt = Date.now();
    while (!arrived && Date.now() - bestAt < 30_000) {
      const d = furthest();
      arrived = d <= 16;
      if (d < best - 1) { best = d; bestAt = Date.now(); }
      if (!arrived) await sleep(100);
    }
    ok(arrived, `they trek to their posts (${far.toFixed(0)} cells at the furthest)`);
    // The orbit is watched once each has actually REACHED its relic — the 16
    // cells above is "on its ground", and a late arriver could spend most of
    // a 40s window still walking in.
    const reached = new Set();
    for (const until = Date.now() + 60_000; Date.now() < until && reached.size < 2; ) {
      for (const e of ents().filter((q) => q.id !== 2 && q.home)) if (Math.hypot(e.x - e.home.x, e.y - e.home.y) < 2.5) reached.add(e.id);
      if (reached.size < 2) await sleep(100);
    }
    let within = 0, samples = 0;
    const through = new Set();
    for (let i = 0; i < 400; i++) {
      for (const e of ents().filter((q) => q.id !== 2 && q.home)) {
        const d = Math.hypot(e.x - e.home.x, e.y - e.home.y);
        samples++;
        if (d <= 20) within++;
        if (d < 2.5) through.add(e.id);
      }
      await sleep(100);
    }
    ok(within / Math.max(1, samples) >= 0.9, `it keeps to the ground round its post (${((within / Math.max(1, samples)) * 100).toFixed(0)}% of 40s within 20 cells)`);
    ok(through.size === 2, `…always circling back through the relic itself (${through.size} of 2 passed within 2.5 cells in 40s)`);
  }

  // ---- 2. THE SWAP (a child run on a 20s clock) -------------------------------
  console.log("-- the relic Entities trade posts on a schedule");
  {
    const { execFileSync } = await import("node:child_process");
    let out = "";
    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--swap"], { encoding: "utf8", timeout: 90_000 }); } catch (e) { out = String(e.stdout ?? ""); }
    const m = /SWAP (\{.*\})/.exec(out);
    ok(!!m && JSON.parse(m[1]).swapped, "they swap posts — each takes the other's relic (the cross-map trek)");
  }

  // ---- 3. SPEED ------------------------------------------------------------------
  console.log("-- it wanders slowly, and chases slower than a sprint");
  {
    // wandering: the fastest second of a patrol
    let fastest = 0;
    let prev = new Map(ents().map((e) => [e.id, e]));
    for (let i = 0; i < 6; i++) {
      await sleep(1000);
      for (const e of ents()) {
        const p = prev.get(e.id);
        if (p && e.mode === "wander" && p.mode === "wander") fastest = Math.max(fastest, Math.hypot(e.x - p.x, e.y - p.y));
      }
      prev = new Map(ents().map((e) => [e.id, e]));
    }
    ok(fastest > 0.5 && fastest <= 1.15 * 1.2, `on its beat it ambles (fastest second ${fastest.toFixed(2)} cells — the wander pace is 1.15)`);

    // chasing: a runner in plain view, the charge timed while the line is clear
    // (a clear 9-13 cell line may not exist where it stands; it walks on, so
    // try again from where it gets to — Oct 2026)
    let e = ent(0);
    let spot = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      e = ent(0);
      if (e.mode === "wander" && !e.resting) spot = ringSpot(e.x, e.y, 9, 13, (x, y) => wideClear(e.x, e.y, x, y));
      if (!spot) await sleep(500);
    }
    if (!spot) ok(false, "(staging) a runner in plain view of it");
    else {
      const bait = put(mk(spot.x, spot.y));
      const speeds = [];
      let last = null;
      for (let i = 0; i < 120; i++) {
        await sleep(100);
        const q = ent(0);
        if (q.mode === "chase" && last && last.mode === "chase" && Math.hypot(q.x - bait.x, q.y - bait.y) > 1.5) speeds.push(Math.hypot(q.x - last.x, q.y - last.y) / 0.1);
        last = q;
        if (Math.hypot(q.x - bait.x, q.y - bait.y) < 1.5) break;
      }
      speeds.sort((a, b) => a - b);
      const med = speeds[speeds.length >> 1] ?? 0;
      ok(speeds.length >= 4, `(staging) the charge was timed (${speeds.length} samples)`);
      ok(med >= 2.375 * 0.85 && med < 2.85, `it charges at ${med.toFixed(2)} cells/s — under a sprint (2.85), the player is 20% faster`);
      drop(bait);
    }
  }
  await sleep(500);

  // ---- 4. HEARING -------------------------------------------------------------
  console.log("-- it hears footsteps and voices");
  {
    // a body BEHIND A WALL from it (seen would be a chase, not a noise)
    const step = async (id, cells, ms) => {
      const e = ent(id);
      const hidden = ringSpot(e.x, e.y, Math.max(1, Math.floor(cells)), Math.ceil(cells) + 0.5, (x, y) => !los(x, y, e.x, e.y) && Math.abs(Math.hypot(x - e.x, y - e.y) - cells) < 0.9);
      if (!hidden) return null;
      // find a legal neighbour to step to, so the move is a real one
      const s = put(mk(hidden.x, hidden.y));
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const nb = dirs.find(([dx, dy]) => stepAllowed(Math.floor(s.x), Math.floor(s.y), Math.floor(s.x) + dx, Math.floor(s.y) + dy));
      if (!nb) { drop(s); return null; }
      s.lastMoveAt = Date.now() - ms; // the step took `ms`: speed = 0.3 cells / ms
      br.move(s.userId, s.x + nb[0] * 0.3, s.y + nb[1] * 0.3, 0);
      const heard = ent(id).heard;
      drop(s);
      return heard;
    };
    // A footstep is only heard by a PATROLLING Entity (service.ts: `e.mode ===
    // "patrol"`, which debugState reports as "wander"), so each probe also
    // waits for it to be on its beat — a probe
    // landing while it treks to its post or searches read as "not heard" for
    // reasons that have nothing to do with hearing (Oct 2026).
    const quiet = async (id) => {
      for (let i = 0; i < 80 && (ent(id).heard || ent(id).mode !== "wander" || ent(id).resting); i++) await sleep(250);
      return !ent(id).heard;
    };
    const id = 1;
    // Each probe waits for the last noise to be spent and the Entity to be on
    // its beat, then needs a cell out of its sight at the probe's distance —
    // which an open hall may not have. It keeps walking, so a probe that
    // can't be staged waits half a second and tries again from wherever it
    // has got to (a null used to read as a hearing failure, Oct 2026).
    const probe = async (cells, ms) => {
      for (let tries = 0; tries < 40; tries++) {
        await quiet(id);
        const r = await step(id, cells, ms);
        if (r !== null) return r;
        await sleep(500);
      }
      return null;
    };
    const run4 = await probe(4, 100); // 3 cells/s: a run
    ok(run4 === true, `a RUN behind a wall 4 cells off is heard (running carries ~10m) (${run4})`);
    const walk4 = await probe(4, 160); // 1.9 cells/s: a walk
    ok(walk4 === false, `a WALK 4 cells off is not (walking carries ~5m) (${walk4})`);
    const walk2 = await probe(2, 160);
    ok(walk2 === true, `…but a walk 2 cells off is (${walk2})`);
    const creep = await probe(1.5, 400); // 0.75 cells/s: a crouch
    ok(creep === false, `a crouch, even 1.5 cells off, is silent to it (${creep})`);
    await quiet(id);
    const e = ent(id);
    // The voice is placed ON OPEN FLOOR it can walk straight to, 3-4 cells
    // off: a fixed "3 cells east" could be the far side of a wall, and the
    // walk then stops short for reasons that aren't about hearing (Oct 2026).
    const at = ringSpot(e.x, e.y, 3, 4, (x, y) => wideClear(e.x, e.y, x, y)) ?? { x: e.x + 3, y: e.y };
    br.entityHears(at.x, at.y, 6, 0);
    ok(ent(id).heard === true, "a voice in range draws it (entityHears)");
    // and it goes there
    let closest = Infinity;
    for (let i = 0; i < 40; i++) { await sleep(100); closest = Math.min(closest, Math.hypot(ent(id).x - at.x, ent(id).y - at.y)); }
    ok(closest < 2.6, `…and it walks to the sound (${closest.toFixed(1)} cells at the closest)`);
  }

  // ---- 5. THE KILL, AND THE REST AFTER ----------------------------------------
  console.log("-- touch is death; a kill sates it");
  {
    const e = ent(0);
    const spot = ringSpot(e.x, e.y, 5, 9, (x, y) => los(x, y, e.x, e.y));
    if (!spot) ok(false, "(staging) a victim in plain view");
    else {
      const victim = put(mk(spot.x, spot.y), false);
      for (let i = 0; i < 120 && br.sessions.has(victim.userId); i++) await sleep(100);
      ok(!br.sessions.has(victim.userId), "touch is death");
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(DB);
      const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(victim.userId);
      db.close();
      ok(row?.cause === "the entity", `…written as the Entity's (${row?.cause})`);
      const k = ent(0);
      ok(k.resting, "a kill sates it");
      // a second body in plain view while it rests: it does not look up
      const next = ringSpot(k.x, k.y, 4, 8, (x, y) => los(x, y, k.x, k.y));
      const second = next ? put(mk(next.x, next.y)) : null;
      let drift = 0, chased = false;
      for (let i = 0; i < 120; i++) {
        await sleep(100);
        const q = ent(0);
        drift = Math.max(drift, Math.hypot(q.x - k.x, q.y - k.y));
        if (q.mode === "chase") chased = true;
      }
      ok(drift < 1, `it stands over the body (${drift.toFixed(2)} cells moved in 12s)`);
      ok(second && !chased, "…blind to the next one standing in plain view");
      if (second) drop(second);
      // the rest is 18-30s: by 32s it is back at work
      let back = false;
      for (let i = 0; i < 220 && !back; i++) { await sleep(100); back = !ent(0).resting; }
      ok(back, "…and then it goes back to work");
    }
  }

  // ---- 6. OUT OF SIGHT IT SEARCHES -----------------------------------------
  console.log("-- out of sight it goes where it last saw you, not where you are");
  {
    // Staged from wherever it has wandered to: a spot in plain view 6-9
    // cells off, a chase, and a hiding place out of both sight lines. A tight
    // corner may offer none of that, so it retries as the Entity walks on
    // (it failed "false false false" from one bad corner, Oct 2026).
    let spot = null, v = null, chasing = false, at = null, hide = null;
    for (let tries = 0; tries < 30 && !hide; tries++) {
      if (v) { drop(v); v = null; await sleep(1500); }
      const e = ent(1);
      if (e.mode !== "wander" || e.resting) { await sleep(500); continue; }
      spot = ringSpot(e.x, e.y, 6, 9, (x, y) => los(x, y, e.x, e.y));
      if (!spot) { await sleep(500); continue; }
      v = put(mk(spot.x, spot.y));
      chasing = false;
      for (let t = 0; t < 30 && !chasing; t++) { await sleep(100); chasing = ent(1).mode === "chase"; }
      if (!chasing) continue;
      at = ent(1);
      hide = ringSpot(spot.x, spot.y, 16, 30, (x, y) => !los(at.x, at.y, x, y) && !los(spot.x, spot.y, x, y));
    }
    if (!v || !chasing || !hide) ok(false, `(staging) a chase, then somewhere out of sight to vanish to (${!!v} ${chasing} ${!!hide})`);
    else {
      v.x = hide.x;
      v.y = hide.y;
      let gaveUp = false, closest = Infinity, nearOld = Infinity;
      for (let t = 0; t < 120 && !gaveUp; t++) {
        await sleep(100);
        const q = ent(1);
        closest = Math.min(closest, Math.hypot(q.x - hide.x, q.y - hide.y));
        nearOld = Math.min(nearOld, Math.hypot(q.x - spot.x, q.y - spot.y));
        if (q.mode !== "chase" && !los(q.x, q.y, v.x, v.y)) gaveUp = true;
      }
      ok(nearOld < 2.5, `it goes to where it last saw you (within ${nearOld.toFixed(1)} cells of it)`);
      ok(gaveUp, "…finds nobody, and gives up the chase");
      ok(closest > 8, `it never homes in on where you went (closest ${closest.toFixed(1)} cells)`);
      drop(v);
    }
  }

  drop(watcher);
  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
