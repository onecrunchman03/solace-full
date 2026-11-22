// THE TEMP — Level 4's creature, driven in-process against the REAL tick.
//
// BACKROOMS.md → "LEVEL 4 — THE ABANDONED OFFICE → THE CREATURE" (Josh, Oct
// 12 2026: "I like your idea on the creature"). THE SHIP GATE asks for one
// assert per agreed behaviour; each block below names its line:
//   · it is always somewhere in the office while somebody is there, and it
//     arrives out of everyone's sight
//   · WATCHED, IT IS STONE: a held beam on it in view — not one step
//   · lit by a working troffer and in view (no beam) — still stone
//   · a thing you can't see isn't watched: facing it in the dark, it moves
//   · outside the cone (looking 60° off), it moves; inside (30° off), stone
//   · UNWATCHED, it is faster than a sprint
//   · THE BLINK: watched under a troffer, it moves ONLY inside the dips
//   · a held beam keeps it lit THROUGH a dip
//   · touch is death, written as "the temp"
//   · it stands over the body a while, then is gone — and somewhere else
//   · it never sets foot in the Lift Lobby (and so can't reach you there)
//   · it never follows a flyer
//   · FAIRNESS (law 11): a solo player walking backwards with a torch held on
//     it can cross the map to the stairwell door
//
// The service is built with a throwaway DB; sessions are hand-made and put
// straight into br.sessions; the clocks are dialled through the env the
// service reads at construction. The speed (3.4) and the cone are NOT dialled
// — they are the behaviour under test.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

// frequent dips, so the blink can be watched in a few seconds
process.env.BACKROOMS_TEMP_DIP_MIN_MS = "1800";
process.env.BACKROOMS_TEMP_DIP_MAX_MS = "2200";
process.env.BACKROOMS_TEMP_STAND_MS = "1500";
process.env.BACKROOMS_TEMP_GONE_MS = "1500";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, distanceMap } = require(dist("backrooms/worldgen.js"));
const { officeLitCells } = require(dist("backrooms/worldgen-office.js"));
const { OFFICE_SAFE_TYPES } = require(dist("backrooms/office-vocab.js"));

const DB = path.join(ROOT, "data", "temp-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledO) { console.error("the office did not boot"); process.exit(1); }
const sec = br.sectorO;
const SIZE = sec.size;
const LIT = officeLitCells(sec);

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
const inLobby = (x, y) => OFFICE_SAFE_TYPES.includes(typeAt(x, y));
const litAt = (x, y) => !!LIT[idx(Math.floor(x), Math.floor(y))];
const zoneAt = (x, y) => sec.section[idx(Math.floor(x), Math.floor(y))];

// ---- sessions ---------------------------------------------------------------
let nextId = 700;
const mk = (x, y) => ({
  userId: nextId++, name: "clerk" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 4, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
/** Face a point (the service's facingOf: fx = -sin h, fy = -cos h). */
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };
/** Face a point turned by `deg` degrees. */
const faceOff = (s, x, y, deg) => { faceAt(s, x, y); s.heading += (deg * Math.PI) / 180; };
const tp = () => br.debugState().temp;
const clearAll = async () => { br.sessions.clear(); await sleep(350); };

const blinks = [];
const trail = [];
br.onTemp((ev) => {
  const at = Date.now();
  if (ev.type === "blink") blinks.push({ zone: ev.zone, at, until: at + ev.ms });
  if (ev.type === "pos") trail.push({ x: ev.x, y: ev.y, at });
});
br.startEntity(() => {});

const waitFor = async (pred, ms = 6000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const t = tp();
    if (pred(t)) return t ?? true;
    await sleep(50);
  }
  return null;
};
/** How far it travelled over `ms`, summing the steps it reported. */
const travelled = async (ms) => {
  const from = trail.length;
  await sleep(ms);
  let d = 0;
  for (let i = Math.max(1, from); i < trail.length; i++) d += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
  return d;
};

// A roomy, dull spot for the first body: open floor, not the lobby.
const spots = [];
for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) {
  if (!walkable(x, y) || inLobby(x, y)) continue;
  let open = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (walkable(x + dx, y + dy)) open++;
  if (open >= 45) spots.push({ x: x + 0.5, y: y + 0.5 });
}
/** A spot within reach of the Temp with a clear line to it (and, if asked,
 *  standing in light or not). */
const watchSpot = (t, minD = 4, maxD = 12) => {
  for (let d = minD; d <= maxD; d++) {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.floor(t.x + Math.cos(a) * d) + 0.5;
      const y = Math.floor(t.y + Math.sin(a) * d) + 0.5;
      if (!walkable(Math.floor(x), Math.floor(y)) || inLobby(x, y)) continue;
      if (!los(x, y, t.x, t.y)) continue;
      return { x, y };
    }
  }
  return null;
};
/** Bring it out, until it stands somewhere `want` likes (lit / dark …) with a
 *  watch spot. Returns { t, w } or null. */
const stage = async (want, tries = 30) => {
  for (let i = 0; i < tries; i++) {
    await clearAll();
    const p = put(mk(spots[(i * 37) % spots.length].x, spots[(i * 37) % spots.length].y));
    faceOff(p, p.x + 1, p.y, 180);
    const t = await waitFor((q) => !!q, 3000);
    if (!t) continue;
    // freeze it at once, from wherever it can be seen
    const w = watchSpot(t);
    if (!w) continue;
    p.x = w.x;
    p.y = w.y;
    faceAt(p, t.x, t.y);
    p.equip = "flashlight!";
    await sleep(250);
    const t2 = tp();
    if (!t2 || !want(t2)) continue;
    return { p, t: t2 };
  }
  return null;
};

const run = async () => {
  // ---- it is always somewhere, and it arrives unseen -----------------------
  {
    await clearAll();
    await sleep(600);
    ok(tp() === null, "nobody in the office: no Temp");
    const p = put(mk(spots[0].x, spots[0].y));
    const t = await waitFor((q) => !!q, 4000);
    ok(!!t, "somebody walks in: it is somewhere in the office");
    ok(!!t && !los(p.x, p.y, t.x, t.y), "…and it arrived out of their sight");
    ok(!!t && !inLobby(t.x, t.y) && walkable(Math.floor(t.x), Math.floor(t.y)), "…on floor it can walk out of, never in the Lift Lobby");
  }

  // ---- WATCHED, IT IS STONE (a held beam) -----------------------------------
  {
    const s = await stage(() => true);
    ok(!!s, "staged in view with a held beam");
    if (s) {
      const d = await travelled(2500);
      ok(d < 0.05, `watched in a held beam it does not move one step (${d.toFixed(2)} cells in 2.5s)`);
    }
  }

  // ---- lit by a troffer and in view, no beam: still stone, between dips ----
  {
    const s = await stage((t) => litAt(t.x, t.y));
    ok(!!s, "staged under a working troffer");
    if (s) {
      s.p.equip = "";
      // between dips: measure a window that holds no dip of its zone
      const z = zoneAt(s.t.x, s.t.y);
      const from = trail.length;
      const t0 = Date.now();
      await sleep(4500);
      const t1 = Date.now();
      const dips = blinks.filter((b) => b.zone === z && b.at >= t0 - 150 && b.at <= t1);
      let outside = 0, inside = 0;
      for (let i = Math.max(1, from); i < trail.length; i++) {
        const step = Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
        if (step < 0.001) continue;
        const inDip = dips.some((b) => trail[i].at >= b.at - 60 && trail[i].at <= b.until + 160);
        if (inDip) inside += step;
        else outside += step;
      }
      ok(outside < 0.05, `lit and in view, it stays put between dips (${outside.toFixed(2)} cells moved outside them)`);
      // ---- THE BLINK: in a dip it is not lit, so not watched, so it moves
      ok(dips.length >= 1 && inside > 0.2, `THE BLINK: in a dip it moves (${inside.toFixed(2)} cells across ${dips.length} dip${dips.length === 1 ? "" : "s"})`);
      ok(dips.length >= 1 && inside <= dips.length * 2.0, `…about a cell and a half a dip, never a run (${(inside / Math.max(1, dips.length)).toFixed(2)} a dip)`);
    }
  }

  // ---- a held beam keeps it lit THROUGH a dip -------------------------------
  {
    const s = await stage((t) => litAt(t.x, t.y));
    if (s) {
      s.p.equip = "flashlight!";
      const z = zoneAt(s.t.x, s.t.y);
      const t0 = Date.now();
      const d = await travelled(4500);
      const dips = blinks.filter((b) => b.zone === z && b.at >= t0).length;
      ok(dips >= 1 && d < 0.05, `a held beam keeps it lit through ${dips} dip${dips === 1 ? "" : "s"} (${d.toFixed(2)} cells moved)`);
    } else ok(false, "staged under a troffer for the beam-through-a-dip test");
  }

  // ---- a thing you can't see isn't watched ----------------------------------
  {
    const s = await stage((t) => !litAt(t.x, t.y));
    ok(!!s, "staged in a dark patch");
    if (s) {
      s.p.equip = "";
      faceAt(s.p, s.t.x, s.t.y);
      br.setImmortal(s.p.userId, true);
      const d = await travelled(1500);
      ok(d > 1.0, `facing it in the dark, no beam: it moves (${d.toFixed(2)} cells in 1.5s)`);
      br.setImmortal(s.p.userId, false);
    }
  }

  // ---- the cone (lit by a troffer, no beam: the beam's own cone is narrower)
  {
    const s = await stage((t) => litAt(t.x, t.y));
    if (s) {
      s.p.equip = "";
      br.setImmortal(s.p.userId, true);
      faceOff(s.p, s.t.x, s.t.y, 30);
      const z = zoneAt(s.t.x, s.t.y);
      const t0 = Date.now();
      const from = trail.length;
      await sleep(1500);
      let moved = 0;
      const dips = blinks.filter((b) => b.zone === z && b.at >= t0 - 150);
      for (let i = Math.max(1, from); i < trail.length; i++) {
        if (dips.some((b) => trail[i].at >= b.at - 60 && trail[i].at <= b.until + 160)) continue;
        moved += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
      }
      ok(moved < 0.05, `lit, 30° off your facing (inside the 45° cone): stone (${moved.toFixed(2)} cells)`);
      faceOff(s.p, s.t.x, s.t.y, 60);
      const d60 = await travelled(1500);
      ok(d60 > 1.0, `lit, 60° off your facing (outside the cone): it moves (${d60.toFixed(2)} cells in 1.5s)`);
      br.setImmortal(s.p.userId, false);
    } else ok(false, "staged under a troffer for the cone test");
  }

  // ---- UNWATCHED, faster than a sprint --------------------------------------
  {
    const s = await stage(() => true);
    if (s) {
      br.setImmortal(s.p.userId, true);
      // walk the watcher well away so it has room to run, back turned
      const fromT = distanceMap(sec, [{ x: Math.floor(s.t.x), y: Math.floor(s.t.y) }]);
      const far = spots.find((q) => fromT[idx(Math.floor(q.x), Math.floor(q.y))] > 30);
      if (far) { s.p.x = far.x; s.p.y = far.y; }
      faceOff(s.p, s.t.x, s.t.y, 180);
      s.p.equip = "";
      await sleep(300);
      const d = await travelled(2000);
      const speed = d / 2;
      ok(speed > 2.85, `unwatched it closes faster than a sprint (${speed.toFixed(2)} cells/s against a sprint's 2.85)`);
      br.setImmortal(s.p.userId, false);
    } else ok(false, "staged for the speed test");
  }

  // ---- touch is death -------------------------------------------------------
  {
    const s = await stage(() => true);
    if (s) {
      s.p.equip = "";
      faceOff(s.p, s.t.x, s.t.y, 180);
      const victim = s.p.userId;
      let died = false;
      for (let i = 0; i < 120 && !died; i++) {
        await sleep(100);
        died = !br.sessions.has(victim);
      }
      ok(died, "back turned, no beam: it reaches you, and touch is death");
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(DB);
      const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(victim);
      ok(row?.cause === "the temp", `the death is written as the temp's (${row?.cause})`);
      const st = tp();
      ok(!!st?.standing, "…and it stands over the body");
      // the witness stays, so the level is not empty
      const w = put(mk(spots[5].x, spots[5].y));
      faceOff(w, st?.x ?? 0, st?.y ?? 0, 180);
      const goneAt = await waitFor((q) => q === null, 4000);
      ok(goneAt !== null, "…a while, then it is gone");
      const back = await waitFor((q) => !!q && !q.standing, 5000);
      ok(!!back && !!st && Math.hypot(back.x - st.x, back.y - st.y) > 3, "…and somewhere else when next seen");
    } else ok(false, "staged for the kill");
  }

  // ---- touch is death for a BYSTANDER too (Nov 2026) ------------------------
  // It closes on one body; another standing where it walks dies at its touch,
  // not only the one it was after.
  {
    await clearAll();
    const s = await stage(() => true);
    if (s) {
      br.setImmortal(s.p.userId, true);
      s.p.equip = "";
      faceOff(s.p, s.t.x, s.t.y, 180);
      await sleep(400);
      const t = tp();
      const b = t ? put(mk(t.x + 0.3, t.y)) : null;
      if (b && t) {
        b.equip = "";
        faceOff(b, t.x, t.y, 180);
      }
      let died = false;
      for (let i = 0; i < 40 && b && !died; i++) {
        await sleep(100);
        died = !br.sessions.has(b.userId);
      }
      ok(died, "a bystander it walks into dies at its touch, not only the body it was after");
      br.setImmortal(s.p.userId, false);
    } else ok(false, "staged for the bystander");
  }

  // ---- never into the Lift Lobby ---------------------------------------------
  {
    await clearAll();
    const lobby = sec.landmarks.find((l) => l.name === "The Lift Lobby");
    const p = put(mk(lobby.x + lobby.w / 2, lobby.y + lobby.h / 2));
    faceOff(p, p.x + 1, p.y, 180);
    trail.length = 0;
    await sleep(6000);
    const intoLobby = trail.some((q) => inLobby(q.x, q.y));
    ok(br.sessions.has(p.userId) && !intoLobby, `standing in the Lift Lobby, back turned, nothing: it never sets foot in it (${trail.length} positions seen)`);
  }

  // ---- never follows a flyer ------------------------------------------------
  {
    await clearAll();
    const f = put(mk(spots[9].x, spots[9].y));
    f.fly = true;
    await sleep(2000);
    ok(tp() === null, "only a flying admin in the office: it is nowhere — it does not follow a flyer");
  }

  // ---- FAIRNESS (law 11): walking backwards with a torch held on it ---------
  {
    const runs = [];
    for (let k = 0; k < 3; k++) {
      await clearAll();
      const door = sec.doors[0];
      const of = br.officeState();
      const target = { x: of.stairdoor.x, y: of.stairdoor.y };
      // the route: the walk-distance field from the stairwell door, followed down
      const field = distanceMap(sec, [{ x: Math.floor(target.x), y: Math.floor(target.y) }]);
      const runner = put(mk(door.x + 0.5, door.y + 0.5));
      runner.equip = "flashlight!";
      // the route: cell centres down the field, one open edge at a time
      const route = [];
      for (let cx = door.x, cy = door.y, guard = 0; guard < 5000; guard++) {
        route.push({ x: cx + 0.5, y: cy + 0.5 });
        const v = field[idx(cx, cy)];
        if (v <= 0) break;
        let nx = -1, ny = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (field[idx(cx + dx, cy + dy)] === v - 1 && edgeOpen(cx, cy, cx + dx, cy + dy)) { nx = cx + dx; ny = cy + dy; break; }
        }
        if (nx < 0) break;
        cx = nx; cy = ny;
      }
      let reached = false, died = false, wp = 0;
      const WALK = 1.6; // cells/s — walking backwards, never running
      for (let tick = 0; tick < 3000 && !reached && !died; tick++) {
        await sleep(100);
        if (!br.sessions.has(runner.userId)) { died = true; break; }
        const t = tp();
        if (t) faceAt(runner, t.x, t.y);
        let budget = WALK * 0.1;
        while (budget > 0 && wp < route.length) {
          const q = route[wp];
          const dx = q.x - runner.x, dy = q.y - runner.y, dd = Math.hypot(dx, dy);
          if (dd <= budget) { runner.x = q.x; runner.y = q.y; budget -= dd; wp++; continue; }
          runner.x += (dx / dd) * budget;
          runner.y += (dy / dd) * budget;
          budget = 0;
        }
        if (Math.hypot(runner.x - target.x, runner.y - target.y) < 1.5 || wp >= route.length) reached = Math.hypot(runner.x - target.x, runner.y - target.y) < 1.5;
        if (wp >= route.length) break;
      }
      { const tt = tp(); console.log(`    run ${k}: ${reached ? "made it" : died ? "caught" : "stuck"} at ${runner.x.toFixed(1)},${runner.y.toFixed(1)} field ${field[idx(Math.floor(runner.x), Math.floor(runner.y))]} temp ${tt ? tt.x.toFixed(1) + "," + tt.y.toFixed(1) : "none"}`); }
      runs.push(reached ? "made it" : died ? "caught" : "stuck");
    }
    const made = runs.filter((r) => r === "made it").length;
    ok(made >= 2, `FAIRNESS: a solo player walking backwards with a torch held on it crosses the map to the stairwell door (${runs.join(", ")})`);
  }

  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
