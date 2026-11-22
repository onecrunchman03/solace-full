// THE CAMERA, ON EVERY CREATURE — Backrooms law 5 ("all player … items,
// equipment … must be uniform across every map"), driven in-process against
// the REAL tick.
//
// The camera used to pay only for the Entity: the Stalker, the Shy Guy, the
// alligators, the Bleeder and the Grabber earned nothing on tape, and the
// sampler never checked which way the camera pointed. Now one rule
// (service.ts `filmed`) takes the shot for every creature. For each one:
//   · a camera RAISED and POINTED at it, with a clear line, takes a shot
//   · the same camera pointed AWAY takes none
// and the honest-footage rule:
//   · an alligator only counts from ITS water — from the dry tile, where it
//     can never reach you, the shot is worth nothing
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";
process.env.BACKROOMS_GRABBER = "1";

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

const DB = path.join(ROOT, "data", "footage-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const SECS = { 0: () => br.sector, 1: () => br.sectorP, 2: () => br.sectorD, 3: () => br.sectorS };

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
  const wet = (x, y) => (sec.water?.[idx(x, y)] ?? WATER_NONE) !== WATER_NONE;
  return { SIZE, walkable, los, wet };
};

let nextId = 1200;
const mk = (level, x, y) => ({
  userId: nextId++, name: "camera" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); br.setImmortal(s.userId, true); return s; };
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };
const clearAll = async () => { br.sessions.clear(); await sleep(250); };
const dbg = () => br.debugState();

br.startEntity(() => {});

/** A filming spot 3-7 cells from a creature with a clear line to it. */
const spotNear = (level, at, pick = () => true) => {
  const sec = SECS[level]();
  const g = geo(sec);
  for (let r = 3; r <= 7; r++) {
    for (let a = 0; a < 24; a++) {
      const x = Math.floor(at.x + Math.cos((a / 24) * Math.PI * 2) * r);
      const y = Math.floor(at.y + Math.sin((a / 24) * Math.PI * 2) * r);
      if (!g.walkable(x, y) || isPitCell(sec, x, y) || !pick(g, x, y)) continue;
      if (g.los(x + 0.5, y + 0.5, at.x, at.y)) return { x: x + 0.5, y: y + 0.5 };
    }
  }
  return null;
};

/** Film a creature: pointed at it → a shot; pointed away → none. */
/** Film a creature: pointed at it → a shot; pointed away → none. Up to
 *  three stagings for the shot: a creature can slip out of a line the moment
 *  it is watched (the Stalker is BUILT to), which is staging, not the rule. */
const filmBoth = async (name, level, where) => {
  let shot = Infinity;
  let cam = null;
  for (let attempt = 0; attempt < 3 && shot === Infinity; attempt++) {
    if (cam) br.sessions.delete(cam.userId);
    let at = null;
    let spot = null;
    for (let t = 0; t < 20 && !spot; t++) {
      at = where();
      if (at) spot = spotNear(level, at, (g, x, y) => !g.wet(x, y));
      if (!spot) await sleep(300);
    }
    if (!at || !spot) continue;
    cam = put(mk(level, spot.x, spot.y));
    cam.cam = true;
    for (let t = 0; t < 6; t++) { const p = where() ?? at; faceAt(cam, p.x, p.y); await sleep(100); }
    shot = cam.bestShot;
  }
  if (!cam) { ok(false, `(staging) somewhere to film ${name} from`); return; }
  ok(shot !== Infinity, `${name}: a camera pointed at it takes a shot (${shot === Infinity ? "none" : shot.toFixed(1) + " cells"})`);
  cam.bestShot = Infinity;
  for (let t = 0; t < 6; t++) { const p = where(); if (p) { faceAt(cam, p.x, p.y); cam.heading += Math.PI; } await sleep(100); }
  ok(cam.bestShot === Infinity, `${name}: the same camera pointed AWAY takes none`);
  br.sessions.delete(cam.userId);
};

const run = async () => {
  // ---- Level 0: the Entity and the Stalker ---------------------------------
  console.log("-- Level 0");
  const anchor0 = put(mk(0, br.sector.doors[0].x + 0.5, br.sector.doors[0].y + 0.5));
  for (let t = 0; t < 40 && !dbg().entities.length; t++) await sleep(100);
  await filmBoth("the Entity", 0, () => dbg().entities[0] ?? null);
  for (let t = 0; t < 120 && !dbg().stalker; t++) await sleep(100);
  await filmBoth("the Stalker", 0, () => dbg().stalker);
  br.sessions.delete(anchor0.userId);
  await clearAll();

  // ---- the Poolrooms: the Shy Guy and an alligator -------------------------
  console.log("-- the Poolrooms");
  {
    const lead = put(mk(1, br.sectorP.doors[0].x + 0.5, br.sectorP.doors[0].y + 0.5));
    const summoned = br.summonShy(lead.userId);
    ok(summoned, "(staging) the Shy Guy summoned");
    await sleep(300);
    await filmBoth("the Shy Guy", 1, () => dbg().shy);
    await clearAll();
  }
  {
    const sec = br.sectorP;
    const g = geo(sec);
    const gator = dbg().gators[0];
    ok(!!gator, "(staging) an alligator in the water");
    if (gator) {
      // from the DRY tile: in sight, pointed at it, and worth nothing
      const dry = spotNear(1, gator, (gg, x, y) => !gg.wet(x, y));
      if (dry) {
        const cam = put(mk(1, dry.x, dry.y));
        cam.cam = true;
        for (let t = 0; t < 6; t++) { const p = dbg().gators.find((q) => q.id === gator.id) ?? gator; faceAt(cam, p.x, p.y); await sleep(100); }
        ok(cam.bestShot === Infinity, "an alligator filmed from the DRY tile — where it can't reach you — is worth nothing");
        br.sessions.delete(cam.userId);
      } else console.log("    (no dry tile in sight of this alligator)");
      // from ITS water, on foot: a shot
      const wetSpot = (() => {
        for (let r = 2; r <= 6; r++) for (let a = 0; a < 24; a++) {
          const x = Math.floor(gator.x + Math.cos((a / 24) * Math.PI * 2) * r);
          const y = Math.floor(gator.y + Math.sin((a / 24) * Math.PI * 2) * r);
          if (g.walkable(x, y) && g.wet(x, y) && g.los(x + 0.5, y + 0.5, gator.x, gator.y)) return { x: x + 0.5, y: y + 0.5 };
        }
        return null;
      })();
      ok(!!wetSpot, "(staging) its own water in sight of it");
      if (wetSpot) {
        const cam = put(mk(1, wetSpot.x, wetSpot.y));
        cam.cam = true;
        for (let t = 0; t < 6; t++) { const p = dbg().gators.find((q) => q.id === gator.id) ?? gator; faceAt(cam, p.x, p.y); await sleep(100); }
        ok(cam.bestShot !== Infinity, `…filmed from IN its water, where it can bite: a shot (${cam.bestShot === Infinity ? "none" : cam.bestShot.toFixed(1) + " cells"})`);
        br.sessions.delete(cam.userId);
      }
    }
    await clearAll();
  }

  // ---- Pipe Dreams: the Grabber ---------------------------------------------
  console.log("-- Pipe Dreams");
  {
    // somewhere open, out of the lit rooms, to call it to
    const sec = br.sectorD;
    const g = geo(sec);
    let lead = null;
    for (let y = 20; y < sec.size - 20 && !lead; y += 7) for (let x = 20; x < sec.size - 20 && !lead; x += 7) {
      if (!g.walkable(x, y)) continue;
      const s = put(mk(2, x + 0.5, y + 0.5));
      if (br.summonGrabber(s.userId)) lead = s;
      else br.sessions.delete(s.userId);
    }
    ok(!!lead, "(staging) the Grabber summoned");
    if (lead) {
      await sleep(200);
      await filmBoth("the Grabber", 2, () => dbg().grabber);
    }
    await clearAll();
  }

  // ---- the Station: the Bleeder ----------------------------------------------
  console.log("-- the Electrical Station");
  {
    const sec = br.sectorS;
    const g = geo(sec);
    let lead = null;
    for (let y = 8; y < sec.size - 8 && !lead; y += 5) for (let x = 8; x < sec.size - 8 && !lead; x += 5) {
      if (!g.walkable(x, y)) continue;
      const s = put(mk(3, x + 0.5, y + 0.5));
      if (br.summonBleeder(s.userId)) lead = s;
      else br.sessions.delete(s.userId);
    }
    ok(!!lead, "(staging) the Bleeder summoned");
    if (lead) {
      await sleep(200);
      await filmBoth("the Bleeder", 3, () => dbg().bleeder);
    }
    await clearAll();
  }

  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
