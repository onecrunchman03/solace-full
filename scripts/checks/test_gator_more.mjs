// THE ALLIGATORS, the rest of their rules — what test_gator (the bites, the
// cage, aggro, the deck and the boats) doesn't pin, found by the Oct 2026 law 2
// audit (BACKROOMS.md → "THE ALLIGATORS"):
//   · its SPEED by depth: twice a player's swim in the deep (2.85), and
//     anywhere your feet touch bottom ~8% UNDER your sprint (waist 1.45 against
//     1.57, ankle 2.05 against 2.22) — "they should be able to outrun the
//     alligator slightly"
//   · A POOL SLEEPS: nobody within 45 cells and it neither thinks nor moves
//   · THE MAP EDITOR's SPAWNERS: a marker puts its own alligators in a body of
//     water — that many, in that water — and a pool with one of yours gets no
//     resident besides; any body of water, big or small
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
const { SWIM_DEPTH_STEPS, waterBodies } = require(dist("backrooms/worldgen-pools.js"));
const { WATER_NONE, FLOOR_STEP } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "gator-more-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const sec = br.sectorP;
const SIZE = sec.size;

// ---- geometry (mirrors of the service's own rules) -------------------------
const idx = (x, y) => y * SIZE + x;
const wet = (x, y) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const i = idx(x, y);
  return (sec.water?.[i] ?? WATER_NONE) !== WATER_NONE && !sec.solid[i] && !sec.background?.[i];
};
const depth = (x, y) => {
  if (!wet(x, y)) return 0;
  const i = idx(x, y);
  return Math.max(0, sec.water[i] - sec.floor[i]);
};
const deepAt = (x, y) => depth(x, y) >= SWIM_DEPTH_STEPS;

// Independent flood fill of the wet regions — the harness's own map of which
// water belongs to which body, so "it never leaves its pool" is measured
// against OUR fill, not the service's.
const region = new Int32Array(SIZE * SIZE).fill(-1);
{
  let next = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!wet(x, y) || region[idx(x, y)] !== -1) continue;
      const q = [idx(x, y)];
      region[idx(x, y)] = next;
      while (q.length) {
        const c = q.pop();
        const cx = c % SIZE, cy = (c / SIZE) | 0;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (wet(nx, ny) && region[idx(nx, ny)] === -1) { region[idx(nx, ny)] = next; q.push(idx(nx, ny)); }
        }
      }
      next++;
    }
  }
}
const regionAt = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : region[idx(x, y)]);

// The service's sight ray, reimplemented (same as the shy harness).
const eff = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : (sec.eff ?? sec.floor)[idx(x, y)]);
const { heightPassable } = require(dist("backrooms/worldgen.js"));
const walkable = (x, y) =>
  x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background?.[idx(x, y)];
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

// ---- sessions ---------------------------------------------------------------
let nextId = 500;
const mkSession = (x, y, level = 1) => ({
  userId: nextId++, name: "swimmer" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
const clearAll = async () => { br.sessions.clear(); await sleep(300); };

// ---- wire + invariants -------------------------------------------------------
const gatorEvents = [];
const hurtEvents = [];
br.onGator((ev) => gatorEvents.push({ ...ev, at: Date.now() }));
br.onHurt((ev) => hurtEvents.push({ ...ev, at: Date.now() }));
br.startEntity(() => {});
const gators = () => br.debugState().gators;


const run = async () => {
  const pop0 = gators();
  ok(pop0.length > 0, `there are alligators (${pop0.length})`);

  // ---- 1. A POOL SLEEPS ------------------------------------------------------
  console.log("-- a pool sleeps when nobody is near");
  {
    const G = pop0[0];
    // a dry spot 60-90 cells from it AND more than 45 from every other gator
    // too (a waking neighbour is fine — it is G we watch)
    let far = null;
    for (let r = 60; r <= 90 && !far; r += 3) for (let a = 0; a < 48 && !far; a++) {
      const x = Math.floor(G.x + Math.cos((a / 48) * Math.PI * 2) * r), y = Math.floor(G.y + Math.sin((a / 48) * Math.PI * 2) * r);
      if (walkable(x, y) && !wet(x, y)) far = { x: x + 0.5, y: y + 0.5 };
    }
    if (!far) ok(false, "(staging) somewhere far from it");
    else {
      const s = put(mkSession(far.x, far.y));
      br.setImmortal(s.userId, true);
      await sleep(400);
      const a = gators().find((g) => g.id === G.id);
      gatorEvents.length = 0;
      await sleep(3000);
      const b = gators().find((g) => g.id === G.id);
      const frames = gatorEvents.filter((e) => e.type === "pos" && e.id === G.id).length;
      ok(a.x === b.x && a.y === b.y && frames === 0, `nobody within 45 cells: it neither moves nor transmits (${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} cells, ${frames} frames in 3s)`);
      // walk up onto the deck beside its pool: it wakes
      let near = null;
      for (let r = 6; r <= 20 && !near; r++) for (let k = 0; k < 48 && !near; k++) {
        const x = Math.floor(G.x + Math.cos((k / 48) * Math.PI * 2) * r), y = Math.floor(G.y + Math.sin((k / 48) * Math.PI * 2) * r);
        if (walkable(x, y) && !wet(x, y)) near = { x: x + 0.5, y: y + 0.5 };
      }
      s.x = near.x; s.y = near.y;
      gatorEvents.length = 0;
      let moved = 0;
      for (let i = 0; i < 80; i++) {
        await sleep(100);
        const c = gators().find((g) => g.id === G.id);
        moved = Math.max(moved, Math.hypot(c.x - b.x, c.y - b.y));
      }
      const frames2 = gatorEvents.filter((e) => e.type === "pos" && e.id === G.id).length;
      ok(frames2 > 20 && moved > 0.3, `somebody near: it wakes and cruises (${moved.toFixed(1)} cells, ${frames2} frames in 8s)`);
      await clearAll();
    }
  }

  // ---- 2. ITS SPEED BY DEPTH --------------------------------------------------
  console.log("-- its speed by depth: twice your swim in the deep, under your sprint where you can stand");
  {
    const band = (x, y) => {
      const d = depth(Math.floor(x), Math.floor(y));
      if (d >= SWIM_DEPTH_STEPS) return "deep";
      return d * FLOOR_STEP > 0.6 ? "waist" : "ankle";
    };
    const per = { deep: [], waist: [], ankle: [] };
    // chase an (immortal) swimmer round each gator's water: the bait stands at
    // a far cell of each band in turn, so the run crosses every band there is
    for (const [gi, G] of pop0.entries()) {
      const cells = { deep: [], waist: [], ankle: [] };
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (regionAt(x, y) === regionAt(Math.floor(G.x), Math.floor(G.y))) cells[band(x + 0.5, y + 0.5)].push([x, y]);
      for (const want of ["ankle", "waist", "deep"]) {
        // past the first five waters, only hunt for the band still unclocked
        if (gi >= 5 && (want !== "ankle" || per.ankle.length >= 5)) continue;
        const g0 = gators().find((g) => g.id === G.id);
        // (ankle-deep floor is rare on P6 — one guarded water has a shelf of
        // it — so there the bait tries several cells at a shorter range)
        const minD = want === "ankle" ? 3 : 8;
        const list = cells[want].filter(([x, y]) => Math.hypot(x - g0.x, y - g0.y) > minD && los(g0.x, g0.y, x + 0.5, y + 0.5));
        if (!list.length) continue;
        for (const [bx, by] of want === "ankle" ? [0.2, 0.5, 0.8].map((f) => list[Math.floor(list.length * f)]) : [list[Math.floor(list.length / 2)]]) {
        const bait = put(mkSession(bx + 0.5, by + 0.5));
        br.setImmortal(bait.userId, true);
        let last = gators().find((g) => g.id === G.id);
        for (let i = 0; i < 60; i++) {
          await sleep(100);
          const c = gators().find((g) => g.id === G.id);
          if (c.mode === "chase" && last.mode === "chase" && Math.hypot(c.x - bait.x, c.y - bait.y) > 1.6) {
            const v = Math.hypot(c.x - last.x, c.y - last.y) / 0.1;
            // a tick wholly in one band (both ends)
            if (band(c.x, c.y) === band(last.x, last.y)) per[band(c.x, c.y)].push(v);
          }
          last = c;
          if (Math.hypot(c.x - bait.x, c.y - bait.y) < 1.6) break;
        }
        br.sessions.delete(bait.userId);
        await sleep(1600); // let it lose interest
        }
      }
    }
    const max = (a) => (a.length ? Math.max(...a) : 0);
    const med = (a) => (a.length ? [...a].sort((p, q) => p - q)[a.length >> 1] : 0);
    console.log(`    samples deep ${per.deep.length} · waist ${per.waist.length} · ankle ${per.ankle.length}`);
    ok(per.deep.length >= 5 && med(per.deep) >= 2.85 * 0.9 && max(per.deep) <= 2.85 * 1.04, `in the deep it does 2.85, twice a sprint-swim (median ${med(per.deep).toFixed(2)}, fastest ${max(per.deep).toFixed(2)})`);
    ok(per.waist.length === 0 || max(per.waist) <= 1.45 * 1.04, `waist-deep it never beats 1.45 — under your 1.57 (fastest ${per.waist.length ? max(per.waist).toFixed(2) : "not sampled"})`);
    ok(per.ankle.length >= 3 && max(per.ankle) <= 2.05 * 1.04, `ankle-deep it never beats 2.05 — under your 2.22 (fastest ${per.ankle.length ? max(per.ankle).toFixed(2) : "not sampled"})`);
    ok(per.waist.length + per.ankle.length >= 5, `(staging) it was clocked in wading water (${per.waist.length + per.ankle.length} samples)`);
    await clearAll();
  }

  // ---- 3. THE MAP EDITOR'S SPAWNERS ---------------------------------------------
  console.log("-- a spawner puts its own in a body of water, and that water gets no resident");
  {
    // a big body that has a resident now
    const G = pop0[0];
    const R = G.region;
    // its deepest cell, by our own fill
    let best = null, bd = -1;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (regionAt(x, y) === regionAt(Math.floor(G.x), Math.floor(G.y)) && depth(x, y) > bd) { bd = depth(x, y); best = [x, y]; }
    // and a SMALL body nobody guards (any body of water takes a spawner)
    const guarded = new Set(pop0.map((g) => regionAt(Math.floor(g.x), Math.floor(g.y))));
    const sizes = new Map();
    for (let i = 0; i < SIZE * SIZE; i++) if (region[i] >= 0) sizes.set(region[i], (sizes.get(region[i]) ?? 0) + 1);
    const small = [...sizes.entries()].filter(([r, n]) => !guarded.has(r) && n >= 6).sort((a, b) => a[1] - b[1])[0];
    let smallAt = null;
    if (small) for (let i = 0; i < SIZE * SIZE && !smallAt; i++) if (region[i] === small[0]) smallAt = [i % SIZE, Math.floor(i / SIZE)];
    const marks = [{ k: "gator", x: best[0] + 0.5, y: best[1] + 0.5, n: 2 }];
    if (smallAt) marks.push({ k: "gator", x: smallAt[0] + 0.5, y: smallAt[1] + 0.5 });
    br.swapDressing(1, { ...sec, marks });
    await sleep(300);
    const pop1 = gators();
    const inBig = pop1.filter((g) => regionAt(Math.floor(g.x), Math.floor(g.y)) === regionAt(best[0], best[1]));
    ok(inBig.length === 2, `a spawner set to two puts two in its water — and the resident is gone (${inBig.length} there)`);
    ok(pop1.length === pop0.length + 1 + (smallAt ? 1 : 0), `every other big water keeps its one resident (${pop1.length} now, ${pop0.length} before)`);
    if (smallAt) ok(pop1.some((g) => regionAt(Math.floor(g.x), Math.floor(g.y)) === small[0]), `a spawner in a small pool (${small[1]} cells) puts one there too`);
    else ok(false, "(staging) a small unguarded pool to try");
    // it lives there: a few seconds of cruising, never out of that water
    const s = put(mkSession(best[0] + 0.5, best[1] + 0.5));
    br.setImmortal(s.userId, true);
    s.boatId = null;
    let strays = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      for (const g of gators().filter((q) => q.region === inBig[0]?.region)) if (regionAt(Math.floor(g.x), Math.floor(g.y)) !== regionAt(best[0], best[1])) strays++;
    }
    ok(strays === 0, `a spawner's alligators keep to its water (${strays} samples out)`);
    await clearAll();
    br.swapDressing(1, { ...sec, marks: [] });
  }

  // ---- THE BOATS SIT IN THE LAP LANES (Nov 2026) -------------------------------
  // P6's ankle water joins every pool into one body, so a lane has to be found
  // in the DEEP water: long and narrow (2.5 : 1 or more), smaller than an
  // alligator's water. The lane rule used to match nothing on P6 and the boats
  // went to any quay at all.
  {
    const deepBody = new Int32Array(SIZE * SIZE).fill(-1);
    const bodies = [];
    for (let i0 = 0; i0 < SIZE * SIZE; i0++) {
      if (deepBody[i0] !== -1 || !deepAt(i0 % SIZE, (i0 / SIZE) | 0)) continue;
      const q = [i0];
      deepBody[i0] = bodies.length;
      let x0 = SIZE, x1 = 0, y0 = SIZE, y1 = 0;
      for (let k = 0; k < q.length; k++) {
        const c = q[k], cx = c % SIZE, cy = (c / SIZE) | 0;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (deepAt(nx, ny) && deepBody[idx(nx, ny)] === -1) { deepBody[idx(nx, ny)] = bodies.length; q.push(idx(nx, ny)); }
        }
      }
      const long = Math.max(x1 - x0, y1 - y0) + 1, wide = Math.min(x1 - x0, y1 - y0) + 1;
      bodies.push({ cells: q.length, lane: wide >= 4 && long >= wide * 2.5 && q.length < 800 });
    }
    const boats = br.boats();
    const onLane = boats.filter((b) => bodies[deepBody[idx(Math.floor(b.x), Math.floor(b.y))]]?.lane);
    ok(boats.length === 4 && onLane.length === boats.length, `all four boats dock in a lap lane (${onLane.length} of ${boats.length}; ${bodies.filter((b) => b.lane).length} lanes on the map)`);
  }

  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
