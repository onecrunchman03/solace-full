// THE MAP EDITOR'S ENTITIES — the spawned Entity (marks.ts "entity") on every
// level, driven in-process against the REAL tick.
//
// Backrooms law 2 ("creatures of each maps must have appropiate path finding,
// behaviour … validated against their designed purpose"). BACKROOMS.md →
// "THE GAME LAYER": a spawner Entity wanders its own ground within `roam` of
// its spawner, sees at its spawner's `sight`, moves at its `speed`, and is
// the Entity in every other way — the same touch and the same death. What it
// had NOT inherited was Level 0's hardening, and it did not know the other
// levels' rules. One block per level, one assert per rule:
//   · seated on lawful floor — and a marker dropped on a shaft, the deep end
//     or a safe room is seated OFF it
//   · it wanders, keeps to its own ground, and never crosses a wall, steps
//     into a shaft, wades into the deep end or walks into a safe room
//   · in sight it chases, and touch is death ("the entity")
//   · somebody swimming in the deep end (Poolrooms) or standing in a lit safe
//     room (Pipe Dreams) is out of its reach — it does not chase them
//   · a noise it reaches is SPENT — it does not stand on the spot
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
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell, WATER_NONE } = require(dist("backrooms/worldgen.js"));
const { SAFE_TYPES } = require(dist("backrooms/pipes-vocab.js"));
const { SWIM_DEPTH_STEPS } = require(dist("backrooms/pools-vocab.js"));

const DB = path.join(ROOT, "data", "spawned-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const SECS = { 0: () => br.sector, 1: () => br.sectorP, 2: () => br.sectorD };

// ---- geometry (mirrors of the service's own rules) -------------------------
const geo = (sec) => {
  const SIZE = sec.size;
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
  return { SIZE, idx, walkable, edgeOpen, los };
};
const deepAt = (sec, x, y) => {
  const i = y * sec.size + x;
  const w = sec.water?.[i] ?? WATER_NONE;
  return w !== WATER_NONE && w - sec.floor[i] >= SWIM_DEPTH_STEPS;
};
const safeAt = (sec, x, y) => SAFE_TYPES.has(sec.districts[sec.district[y * sec.size + x]]?.type);
/** What a spawned Entity must never stand on, per level. */
const shunned = (level, sec, x, y) =>
  isPitCell(sec, x, y) || (level === 1 && deepAt(sec, x, y)) || (level === 2 && safeAt(sec, x, y));

// ---- sessions ---------------------------------------------------------------
let nextId = 900;
const mk = (level, x, y) => ({
  userId: nextId++, name: "walker" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
const clearAll = async () => { br.sessions.clear(); await sleep(250); };
const mine = (level) => br.debugState().spawned.filter((e) => e.level === level);

const frames = [];
br.startEntity((ev) => { if (ev.type === "pos" && ev.id >= 100) frames.push({ ...ev, at: Date.now() }); });

/** A stage on a level: an open, lawful cell with a lot of lawful floor in view. */
const findStage = (level, sec, g) => {
  let best = null, bestOpen = -1;
  for (let y = 4; y < g.SIZE - 4; y += 2) for (let x = 4; x < g.SIZE - 4; x += 2) {
    if (!g.walkable(x, y) || shunned(level, sec, x, y)) continue;
    let open = 0;
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      if (g.walkable(x + dx, y + dy) && !shunned(level, sec, x + dx, y + dy) && g.los(x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5)) open++;
    }
    if (open > bestOpen) { bestOpen = open; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  return best;
};
/** A shunned cell on the level (to drop a marker on), or null. */
const findShunnedCell = (level, sec, g) => {
  for (let y = 4; y < g.SIZE - 4; y++) for (let x = 4; x < g.SIZE - 4; x++) {
    if (!shunned(level, sec, x, y) || !g.walkable(x, y)) continue;
    // with lawful floor somewhere close by to be seated on
    for (let r = 1; r <= 4; r++) if (g.walkable(x + r, y) && !shunned(level, sec, x + r, y)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
};
const plant = (level, marks) => {
  const sec = SECS[level]();
  br.swapDressing(level, { ...sec, marks });
};

const LEVEL_NAME = ["Level 0", "the Poolrooms", "Pipe Dreams"];
const SHUN_NAME = ["a shaft", "the deep end", "a lit safe room"];

const runLevel = async (level) => {
  console.log(`-- ${LEVEL_NAME[level]}`);
  const sec = SECS[level]();
  const g = geo(sec);
  const stage = findStage(level, sec, g);
  if (!stage) { ok(false, `(staging) an open stage on ${LEVEL_NAME[level]}`); return; }

  // ---- the seat ----------------------------------------------------------
  const bad = findShunnedCell(level, sec, g);
  plant(level, [
    { k: "entity", x: stage.x, y: stage.y, roam: 10, sight: 12, speed: 200 },
    ...(bad ? [{ k: "entity", x: bad.x, y: bad.y, roam: 6, sight: 1, speed: 100 }] : []),
  ]);
  const seated = mine(level);
  ok(seated.length >= 1 && seated.every((e) => g.walkable(Math.floor(e.x), Math.floor(e.y)) && !shunned(level, sec, Math.floor(e.x), Math.floor(e.y))),
    `every spawned Entity seated on lawful floor (${seated.length})`);
  if (bad) {
    const second = seated[1];
    ok(!!second && !shunned(level, sec, Math.floor(second.x), Math.floor(second.y)),
      `a marker dropped on ${SHUN_NAME[level]} is seated off it`);
  } else console.log(`    (no ${SHUN_NAME[level]} on this map to drop a marker on)`);
  // keep just the stage Entity for the rest
  plant(level, [{ k: "entity", x: stage.x, y: stage.y, roam: 10, sight: 12, speed: 200 }]);
  const ent = () => mine(level)[0];
  if (!ent()) { ok(false, "(staging) the stage Entity seated"); return; }

  // ---- the wander --------------------------------------------------------
  // a body far enough off to wake it but never be seen (out of sight range)
  let watcher = null;
  for (let r = 20; r <= 40 && !watcher; r += 2) {
    for (let a = 0; a < 16 && !watcher; a++) {
      const x = Math.floor(stage.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.floor(stage.y + Math.sin((a / 16) * Math.PI * 2) * r);
      if (g.walkable(x, y) && !shunned(level, sec, x, y)) watcher = { x: x + 0.5, y: y + 0.5 };
    }
  }
  frames.length = 0;
  const w = put(mk(level, watcher.x, watcher.y));
  await sleep(14000);
  const mineF = frames.filter((f) => f.level === level && f.id === ent().id);
  let crossed = 0, onShun = 0, offFloor = 0, far = 0, moved = 0;
  for (let i = 0; i < mineF.length; i++) {
    const f = mineF[i];
    const cx = Math.floor(f.x), cy = Math.floor(f.y);
    if (!g.walkable(cx, cy)) offFloor++;
    if (shunned(level, sec, cx, cy)) onShun++;
    if (Math.hypot(f.x - stage.x, f.y - stage.y) > 10 + 5) far++;
    if (i) {
      const p = mineF[i - 1];
      moved += Math.hypot(f.x - p.x, f.y - p.y);
      if (!g.los(p.x, p.y, f.x, f.y)) crossed++;
    }
  }
  ok(mineF.length > 50 && moved > 4, `it wanders (${mineF.length} steps, ${moved.toFixed(1)} cells walked)`);
  ok(offFloor === 0 && crossed === 0, `never through a wall or off the floor (${crossed} wall crossings, ${offFloor} off-floor)`);
  ok(onShun === 0, `never a foot in ${SHUN_NAME[level]}${level === 0 ? "" : " or a shaft"}`);
  ok(far === 0, "it keeps to its own ground (within its roam)");
  ok(mineF.every((f) => f.mode === "wander"), "a body out of its sight is never chased");
  br.sessions.delete(w.userId);

  // ---- the spent noise ---------------------------------------------------
  {
    const e = ent();
    let spot = null;
    for (let r = 4; r <= 8 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
      const x = Math.floor(e.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.floor(e.y + Math.sin((a / 16) * Math.PI * 2) * r);
      if (g.walkable(x, y) && !shunned(level, sec, x, y) && g.los(e.x, e.y, x + 0.5, y + 0.5)) spot = { x: x + 0.5, y: y + 0.5 };
    }
    put(mk(level, watcher.x, watcher.y));
    if (spot) {
      br.entityHears(spot.x, spot.y, 30, level);
      let reached = 0;
      for (let t = 0; t < 60 && !reached; t++) {
        await sleep(100);
        const q = ent();
        if (Math.hypot(q.x - spot.x, q.y - spot.y) < 1.5) reached = Date.now();
      }
      ok(!!reached, "a noise draws it to the spot");
      if (reached) {
        const at = { ...ent() };
        await sleep(6000);
        const q = ent();
        ok(Math.hypot(q.x - at.x, q.y - at.y) > 1.2, "…and a noise it has reached is SPENT — it moves on, not standing there");
      }
    } else ok(false, "(staging) a noise spot in view");
    await clearAll();
  }

  // ---- out of reach (the level's own rule) -------------------------------
  if (level !== 0) {
    // STAGED, not searched for near the stage: a refuge cell and a lawful
    // post 3-8 cells off it with a clear line in, anywhere on the map. A rule
    // with no assert is not shipped behaviour, so this one is never skipped.
    let pair = null;
    for (let y = 3; y < g.SIZE - 3 && !pair; y++) for (let x = 3; x < g.SIZE - 3 && !pair; x++) {
      if (!g.walkable(x, y) || (level === 1 ? !deepAt(sec, x, y) : !safeAt(sec, x, y))) continue;
      for (let r = 3; r <= 8 && !pair; r++) for (let a = 0; a < 16 && !pair; a++) {
        const px = Math.floor(x + 0.5 + Math.cos((a / 16) * Math.PI * 2) * r);
        const py = Math.floor(y + 0.5 + Math.sin((a / 16) * Math.PI * 2) * r);
        if (!g.walkable(px, py) || shunned(level, sec, px, py) || isPitCell(sec, px, py)) continue;
        if (g.los(px + 0.5, py + 0.5, x + 0.5, y + 0.5)) pair = { refuge: { x: x + 0.5, y: y + 0.5 }, post: { x: px + 0.5, y: py + 0.5 } };
      }
    }
    ok(!!pair, `(staging) ${SHUN_NAME[level]} with lawful floor in sight of it`);
    if (pair) {
      plant(level, [{ k: "entity", x: pair.post.x, y: pair.post.y, roam: 3, sight: 14, speed: 100 }]);
      const s = put(mk(level, pair.refuge.x, pair.refuge.y));
      let chased = false;
      for (let t = 0; t < 40; t++) { await sleep(100); if (ent()?.mode === "chase") chased = true; }
      ok(!chased && br.sessions.has(s.userId), `somebody in ${SHUN_NAME[level]} in plain sight is out of its reach — no chase`);
      // and the moment they step out onto open floor, they are prey again
      const out = { ...pair.post };
      let stepOut = null;
      for (let r = 1; r <= 3 && !stepOut; r++) for (let a = 0; a < 16 && !stepOut; a++) {
        const x = Math.floor(out.x + Math.cos((a / 16) * Math.PI * 2) * r);
        const y = Math.floor(out.y + Math.sin((a / 16) * Math.PI * 2) * r);
        if (g.walkable(x, y) && !shunned(level, sec, x, y) && !(level === 1 && (sec.water?.[g.idx(x, y)] ?? WATER_NONE) !== WATER_NONE) && g.los(ent().x, ent().y, x + 0.5, y + 0.5)) stepOut = { x: x + 0.5, y: y + 0.5 };
      }
      if (stepOut) {
        s.x = stepOut.x;
        s.y = stepOut.y;
        let after = false;
        for (let t = 0; t < 30 && !after; t++) { await sleep(100); if (ent()?.mode === "chase" || !br.sessions.has(s.userId)) after = true; }
        ok(after, "…and the moment they step out onto open floor, they are prey again");
      }
    }
    await clearAll();
  }

  // ---- out of sight it SEARCHES (law 2 audit): it goes where it last saw you
  // and gives up there — it used to path to your LIVE position for ten
  // seconds after losing sight, pursuit by telepathy.
  plant(level, [{ k: "entity", x: stage.x, y: stage.y, roam: 10, sight: 14, speed: 100 }]);
  {
    const e = ent();
    let spot = null;
    for (let r = 6; r <= 9 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
      const x = Math.floor(e.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.floor(e.y + Math.sin((a / 16) * Math.PI * 2) * r);
      if (g.walkable(x, y) && !shunned(level, sec, x, y) && !(level === 1 && (sec.water?.[g.idx(x, y)] ?? WATER_NONE) !== WATER_NONE) && g.los(e.x, e.y, x + 0.5, y + 0.5)) spot = { x: x + 0.5, y: y + 0.5 };
    }
    const v = spot ? put(mk(level, spot.x, spot.y)) : null;
    let chasing = false;
    for (let t = 0; v && t < 30 && !chasing; t++) { await sleep(100); chasing = ent()?.mode === "chase"; }
    // whisk the quarry somewhere it cannot be seen, well away
    let hide = null;
    if (chasing) {
      const at = ent();
      for (let r = 16; r <= 30 && !hide; r++) for (let a = 0; a < 24 && !hide; a++) {
        const x = Math.floor(spot.x + Math.cos((a / 24) * Math.PI * 2) * r);
        const y = Math.floor(spot.y + Math.sin((a / 24) * Math.PI * 2) * r);
        if (g.walkable(x, y) && !shunned(level, sec, x, y) && !g.los(at.x, at.y, x + 0.5, y + 0.5) && !g.los(spot.x, spot.y, x + 0.5, y + 0.5)) hide = { x: x + 0.5, y: y + 0.5 };
      }
    }
    if (!v || !chasing || !hide) ok(false, `(staging) a chase, then somewhere out of sight to vanish to (${!!v} ${chasing} ${!!hide})`);
    else {
      v.x = hide.x;
      v.y = hide.y;
      let gaveUp = false, closest = Infinity, nearOld = Infinity;
      for (let t = 0; t < 90 && !gaveUp; t++) {
        await sleep(100);
        const q = ent();
        if (!q) break;
        closest = Math.min(closest, Math.hypot(q.x - hide.x, q.y - hide.y));
        nearOld = Math.min(nearOld, Math.hypot(q.x - spot.x, q.y - spot.y));
        if (q.mode !== "chase" && !g.los(q.x, q.y, v.x, v.y)) gaveUp = true;
      }
      ok(nearOld < 2.5, `out of sight, it goes to where it last saw you (got within ${nearOld.toFixed(1)} cells of it)`);
      ok(gaveUp, "…and, finding nobody there, it gives up the chase");
      ok(closest > 8, `it never homes in on where you went instead (closest ${closest.toFixed(1)} cells)`);
      br.sessions.delete(v.userId);
    }
  }
  await clearAll();

  // ---- the chase and the touch --------------------------------------------
  plant(level, [{ k: "entity", x: stage.x, y: stage.y, roam: 10, sight: 14, speed: 100 }]);
  {
    const e = ent();
    let spot = null;
    for (let r = 5; r <= 9 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) {
      const x = Math.floor(e.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.floor(e.y + Math.sin((a / 16) * Math.PI * 2) * r);
      if (g.walkable(x, y) && !shunned(level, sec, x, y) && !(level === 1 && (sec.water?.[g.idx(x, y)] ?? WATER_NONE) !== WATER_NONE) && g.los(e.x, e.y, x + 0.5, y + 0.5)) spot = { x: x + 0.5, y: y + 0.5 };
    }
    if (!spot) { ok(false, "(staging) a victim in plain sight"); return; }
    const v = put(mk(level, spot.x, spot.y));
    let sawChase = false;
    for (let t = 0; t < 120 && br.sessions.has(v.userId); t++) {
      await sleep(100);
      if (ent()?.mode === "chase") sawChase = true;
    }
    ok(sawChase, "in sight it chases");
    ok(!br.sessions.has(v.userId), "…and touch is death");
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB);
    const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(v.userId);
    db.close();
    ok(row?.cause === "the entity", `the death is written as the Entity's (${row?.cause})`);
  }
  await clearAll();
  plant(level, []);
};

const run = async () => {
  for (const level of [0, 1, 2]) await runLevel(level);
  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
