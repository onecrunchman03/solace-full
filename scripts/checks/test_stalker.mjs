// THE STALKER — Level 0's shadow, the behaviours the Oct 2026 law 2 audit
// found with no assert (BACKROOMS.md → "THE STALKER" and "LEVEL 0's
// CREATURES, VALIDATED"). What test_level0_creatures already pins — never
// seen while the lights hold, the 16-26 cell band, the two-second burn — is
// not repeated. This is:
//   · THE VOICE: in the lights it throws a snatch of SOMEBODY ELSE's voice
//     from the dark (a mimic), and not on every breath — 20-45s apart
//   · burned off in a blackout it RUNS, then COMES BACK: it retries the hunt
//   · THE KILL: in the dark, touch is death, written as "the stalker"
//   · after a kill it MELTS back into the dark and does not hunt again at once
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

process.env.BACKROOMS_ENT_SWAP_MIN_MS = "600000";
process.env.BACKROOMS_ENT_SWAP_MAX_MS = "600001";

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "stalker-harness.db");
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
let nextId = 700;
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


const stalkerEvents = [];
br.onStalker((ev) => stalkerEvents.push({ ...ev, at: Date.now() }));
br.startEntity(() => {});
const st = () => br.debugState().stalker;
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };

/** The most open ground on the level: a hall to stage the dark in. */
let hall = null, hallScore = -1;
for (let y = 4; y < SIZE - 4; y += 2) {
  for (let x = 4; x < SIZE - 4; x += 2) {
    if (!open(x, y)) continue;
    let c = 0;
    for (let k = 0; k < 16; k++) {
      const px = x + 0.5 + Math.cos((k / 16) * Math.PI * 2) * 12;
      const py = y + 0.5 + Math.sin((k / 16) * Math.PI * 2) * 12;
      if (open(Math.floor(px), Math.floor(py)) && los(x + 0.5, y + 0.5, px, py)) c++;
    }
    if (c > hallScore) { hallScore = c; hall = { x: x + 0.5, y: y + 0.5 }; }
  }
}

const run = async () => {
  // ---- 1. THE VOICE ----------------------------------------------------------
  console.log("-- in the lights it throws somebody else's voice");
  const a = put(mk(hall.x, hall.y));
  const bSpot = ringSpot(hall.x, hall.y, 2, 4, (x, y) => los(x, y, hall.x, hall.y));
  const b = put(mk(bSpot.x, bSpot.y));
  const mimics = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 75_000 && mimics.length < 2) {
    await sleep(100);
    for (const ev of stalkerEvents.splice(0)) if (ev.type === "mimic") mimics.push({ ...ev, mark: st()?.targetId });
  }
  ok(mimics.length >= 1, `it throws a voice from the dark (${mimics.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  ok(mimics.length >= 1 && mimics.every((m) => (m.of === a.userId || m.of === b.userId) && m.of !== m.mark), "…always somebody ELSE's — never the voice of the one it is following");
  ok(mimics.length < 2 || mimics[1].at - mimics[0].at >= 20_000, `…and not on every breath (${mimics.length >= 2 ? ((mimics[1].at - mimics[0].at) / 1000).toFixed(0) + "s apart" : "one in the window"})`);
  ok(mimics.every((m) => Math.hypot(m.x - hall.x, m.y - hall.y) <= 32), "…from somewhere near (within 30 cells of its mark)");
  drop(b);

  // ---- 2. BURNED OFF, IT COMES BACK ----------------------------------------------
  console.log("-- burned off in the dark, it runs, then comes back");
  br.triggerBrownout(90_000, true);
  a.equip = "flashlight!";
  let beamOn = false;
  const aim = setInterval(() => {
    const s = st();
    if (!s) return;
    if (beamOn) faceAt(a, s.x, s.y);
    else faceAt(a, a.x * 2 - s.x, a.y * 2 - s.y);
  }, 50);
  const inReach = () => { const s = st(); return s && s.mode === "hunt" && Math.hypot(s.x - a.x, s.y - a.y) <= 14 && los(a.x, a.y, s.x, s.y); };
  let t = Date.now();
  while (Date.now() - t < 40_000 && !inReach()) await sleep(50);
  ok(inReach(), "the power out, it hunts into a flashlight's reach");
  beamOn = true;
  t = Date.now();
  while (Date.now() - t < 4_000 && st()?.mode !== "flee") await sleep(50);
  ok(st()?.mode === "flee", "a beam held on it drives it off");
  beamOn = false;
  a.equip = undefined;
  t = Date.now();
  let back = false, gotAway = 0;
  while (Date.now() - t < 30_000 && !back) {
    await sleep(100);
    const s = st();
    if (s) gotAway = Math.max(gotAway, Math.hypot(s.x - a.x, s.y - a.y));
    back = s?.mode === "hunt";
  }
  ok(gotAway >= 8, `it runs (${gotAway.toFixed(1)} cells away at the furthest)`);
  ok(back, `…and comes back: the dark still holds, so it hunts again (${((Date.now() - t) / 1000).toFixed(0)}s after it fled)`);

  // ---- 3. THE KILL, AND THE MELT ---------------------------------------------------
  console.log("-- in the dark, touch is death");
  clearInterval(aim);
  drop(a);
  // Stage the kill near the Stalker and well away from Level 0's three
  // Entities, so the death we're watching is ITS (an Entity wandering into the
  // fixed hall got there first in about one run in four — Oct 2026 review).
  const farFromEnts = (x, y) => ents().every((e) => Math.hypot(e.x - x, e.y - y) >= 35);
  const s0 = st();
  const vSpot = (s0 && ringSpot(s0.x, s0.y, 6, 12, (x, y) => farFromEnts(x, y) && ringSpot(x, y, 2, 4, (wx, wy) => los(wx, wy, x, y)))) ?? hall;
  const wSpot = ringSpot(vSpot.x, vSpot.y, 2, 4, (x, y) => los(x, y, vSpot.x, vSpot.y)) ?? bSpot;
  const victim = put(mk(vSpot.x, vSpot.y), false);
  const witness = put(mk(wSpot.x, wSpot.y));
  // A FRESH dark for the kill: step 2's 90s blackout could run out mid-wait,
  // and the Stalker drops back to shadowing (Oct 2026 review).
  br.triggerBrownout(60_000, true);
  stalkerEvents.length = 0;
  await sleep(400);
  // The witness is immortal and often nearer: it must mark the one it can take.
  ok(st()?.targetId === victim.userId, "it marks the body it can take, not a nearer immortal (the admin's god mode)");
  t = Date.now();
  while (Date.now() - t < 40_000 && br.sessions.has(victim.userId)) await sleep(100);
  ok(!br.sessions.has(victim.userId), "it reaches you in the dark, and touch is death");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(victim.userId);
  db.close();
  ok(row?.cause === "the stalker", `…written as the Stalker's (${row?.cause})`);
  const kill = stalkerEvents.find((e) => e.type === "kill");
  await sleep(150);
  const after = st();
  ok(!!kill && after && after.mode !== "hunt", `after the kill it melts back into the dark (${after?.mode})`);
  // the witness stands in the same dark, in reach: it does not hunt again at once
  let huntedAgain = false;
  for (let i = 0; i < 150 && !huntedAgain; i++) { await sleep(100); huntedAgain = st()?.mode === "hunt"; }
  ok(!huntedAgain, "…and does not hunt again at once (15s, the next body standing right there)");
  drop(witness);

  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
