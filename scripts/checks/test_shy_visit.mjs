// THE SHY GUY'S VISIT — how a visit ENDS and comes round again, the part
// test_shyguy dials out (it pins the lurk at ten minutes so the creature never
// wanders off mid-test). BACKROOMS.md → "THE SHY GUY":
//   · it lurks a while and, never looked at, drifts off on its own
//   · "run away … out of line of sight and despawn": it vanishes only once
//     nobody holds a line to it
//   · "it comes back after 70–170s" (dialled to 5s here) — to a carrier
//   · treasure is what calls it: nobody carrying, nothing comes back
// (Its one refusal, a lethal shaft, can't be staged: the shipped Poolrooms
// have none.)
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

// Dial the creature down to harness time BEFORE the service reads them.
// Long enough that the panic is a state you can actually OBSERVE. At 200ms
// the creature was often already charging by the time the assertion read it,
// which looked like a flaky trigger and was really a flaky stopwatch.
process.env.BACKROOMS_SHY_TRIGGER_MS = "900";
process.env.BACKROOMS_SHY_LURK_MIN_MS = "3000"; // a short visit: the point here is how it ends
process.env.BACKROOMS_SHY_LURK_MAX_MS = "3001";
process.env.BACKROOMS_SHY_GAP_MIN_MS = "5000";
process.env.BACKROOMS_SHY_GAP_MAX_MS = "5001";

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { SWIM_DEPTH_STEPS } = require(dist("backrooms/worldgen-pools.js"));
const { WATER_NONE, heightPassable, FLOOR_STEP } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "shy-visit-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
const sec = br.sectorP;
const SIZE = sec.size;

// ---- geometry helpers (mirrors of the service's own rules) ----------------
const idx = (x, y) => y * SIZE + x;
const walkable = (x, y) =>
  x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const eff = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : (sec.eff ?? sec.floor)[idx(x, y)]);
const depth = (x, y) => {
  if (!walkable(x, y)) return 0;
  const w = sec.water?.[idx(x, y)] ?? WATER_NONE;
  return w === WATER_NONE ? 0 : Math.max(0, w - sec.floor[idx(x, y)]);
};
const deepAt = (x, y) => depth(x, y) >= SWIM_DEPTH_STEPS;
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
/** The service's sight ray, reimplemented so "out of line of sight" is
 *  measured here rather than taken on trust. */
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

// A roomy dry stage to run the tests on: a dry cell with plenty of dry, open
// ground around it, and deep water somewhere in reach.
let stage = null;
for (let y = 20; y < SIZE - 20 && !stage; y += 3) {
  for (let x = 20; x < SIZE - 20; x += 3) {
    if (!walkable(x, y) || depth(x, y) > 0) continue;
    let open = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      if (walkable(x + dx, y + dy) && !deepAt(x + dx, y + dy)) open++;
    }
    if (open < 120) continue;
    let deep = null;
    for (let r = 4; r <= 26 && !deep; r++) {
      for (let a = 0; a < 32 && !deep; a++) {
        const px = Math.floor(x + Math.cos((a / 32) * Math.PI * 2) * r);
        const py = Math.floor(y + Math.sin((a / 32) * Math.PI * 2) * r);
        if (deepAt(px, py)) deep = [px, py];
      }
    }
    if (!deep) continue;
    stage = { x: x + 0.5, y: y + 0.5, deep };
    break;
  }
}
if (!stage) { console.error("no suitable stage cell found on sector P"); process.exit(1); }
let dryStage = null;
{
  let best = -1;
  for (let y = 20; y < SIZE - 20; y += 4) {
    for (let x = 20; x < SIZE - 20; x += 4) {
      if (!walkable(x, y) || depth(x, y) > 0) continue;
      let open = 0;
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        if (walkable(x + dx, y + dy) && depth(x + dx, y + dy) === 0) open++;
      }
      if (open > best) { best = open; dryStage = { x: x + 0.5, y: y + 0.5 }; }
    }
  }
}
console.log(`stage at ${stage.x},${stage.y} · deep water at ${stage.deep[0]},${stage.deep[1]}`);

// ---- sessions -------------------------------------------------------------
let nextId = 100;
const mkSession = (x, y, relics = [], level = 1) => ({
  userId: nextId++, name: "diver" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics, hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
const clearAll = async () => {
  br.sessions.clear();
  await sleep(400); // the tick notices the empty world and despawns
};
/** Point a session's heading at a world point, using the REAL client
 *  convention: the client sends its raw camera yaw and YAW 0 FACES −Y, so the
 *  facing vector is (−sin h, −cos h). Encoding this the other way round is
 *  what hid an inverted cone in the stalker's flashlight check for months. */
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };
/** The heading a client at (px,py) would actually send while looking at
 *  (tx,ty) — derived from the renderer's own forward vector, independently of
 *  faceAt, so the two have to agree. */
const faceAtYaw = (s, cur) => { faceAt(s, cur.x, cur.y); return s.heading; };
const clientYawLookingAt = (px, py, tx, ty) => {
  // controller.ts: forward = (sin(yaw)·−1, cos(yaw)·−1). Solve for yaw.
  const ux = tx - px, uy = ty - py;
  const n = Math.hypot(ux, uy) || 1;
  return Math.atan2(-ux / n, -uy / n);
};
/** Stand a session somewhere it can actually SEE the creature, roughly `want`
 *  cells off. Needed because the spawn rule guarantees it arrives unseen —
 *  every eye-contact test has to walk into view first, exactly like a player. */
const standInViewOf = (s, cur, want, accept = null) => {
  let best = null, bestErr = Infinity;
  for (let r = 1; r <= 16; r++) {
    for (let a = 0; a < 48; a++) {
      const cx = Math.floor(cur.x + Math.cos((a / 48) * Math.PI * 2) * r);
      const cy = Math.floor(cur.y + Math.sin((a / 48) * Math.PI * 2) * r);
      if (!walkable(cx, cy) || deepAt(cx, cy)) continue;
      if (accept && !accept(cx + 0.5, cy + 0.5)) continue;
      if (!los(cx + 0.5, cy + 0.5, cur.x, cur.y)) continue;
      const err = Math.abs(Math.hypot(cx + 0.5 - cur.x, cy + 0.5 - cur.y) - want);
      if (err < bestErr) { bestErr = err; best = [cx + 0.5, cy + 0.5]; }
    }
  }
  if (!best) return false;
  s.x = best[0]; s.y = best[1];
  faceAt(s, cur.x, cur.y);
  return true;
};

const events = [];
/** Every position it reports, all run (`events` is cleared between stages). */
const everyPos = [];
br.onShy((ev) => {
  events.push({ ...ev, at: Date.now() });
  if (ev.type === "pos") everyPos.push({ id: 0, x: ev.x, y: ev.y, at: Date.now() });
});
br.startEntity(() => {});
const shy = () => br.debugState().shy;
/** Wait for it to turn up AND be docile. Placement can legitimately fail (no
 *  unseen corner within reach) and back off for 8s, so this polls rather than
 *  guessing.
 *
 *  It insists on `lurk` because every caller wants a creature to stage
 *  against, and returning whatever happened to be live handed tests a
 *  creature already in `leave` — walking AWAY. That is what made the creep
 *  test read "29.6 → 29.6" and call it a failure to close: it was measuring a
 *  retreat, correctly executed. */
const waitForLurker = async (ms = 12000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = shy();
    if (s && s.mode === "lurk") return s;
    await sleep(100);
  }
  return null;
};


const run = async () => {
  const carrier = put(mkSession(stage.x, stage.y, ["pool-relic"]));
  // never look at it: a look would start a chase, and this is about the visit
  const away = setInterval(() => { const s = shy(); if (s) faceAt(carrier, carrier.x * 2 - s.x, carrier.y * 2 - s.y); }, 50);

  // ---- 1. It lurks, then drifts off on its own --------------------------------
  console.log("-- a visit: it lurks, drifts off, and vanishes out of sight");
  const first = await waitForLurker(20000);
  ok(!!first, "a carrier calls it");
  const arrived = Date.now();
  let leftAt = 0;
  while (Date.now() - arrived < 15000 && !leftAt) {
    await sleep(50);
    const s = shy();
    if (s && s.mode === "leave") leftAt = Date.now();
    if (!s) leftAt = -1;
  }
  const lurked = (leftAt - arrived) / 1000;
  ok(leftAt > 0 && lurked >= 2.5 && lurked <= 6, `never looked at, it lurks its while and drifts off unprovoked (${leftAt > 0 ? lurked.toFixed(1) + "s" : "no leave seen"})`);

  // ---- 2. It vanishes only when nobody can see it -----------------------------
  let last = shy(), prev = null, goneAt = 0;
  while (Date.now() - leftAt < 27000) {
    await sleep(50);
    const s = shy();
    if (!s) { goneAt = Date.now(); break; }
    if (last.x !== s.x || last.y !== s.y) { prev = last; last = s; }
  }
  ok(goneAt > 0, `it despawns (${goneAt ? ((goneAt - leftAt) / 1000).toFixed(1) + "s after it left" : "never"})`);
  // (it vanishes on the tick it steps out of view; the last sample is the step before)
  const carrierSees = (x, y) => los(carrier.x, carrier.y, x, y) && Math.hypot(carrier.x - x, carrier.y - y) <= 30;
  const outOfView = !carrierSees(last.x, last.y) || (prev && [0.5, 1, 1.5, 2].some((k) => !carrierSees(last.x + (last.x - prev.x) * k, last.y + (last.y - prev.y) * k)));
  ok(goneAt > 0 && outOfView, "…out of the carrier's line of sight — nobody watches it go");

  // ---- 3. It comes back -----------------------------------------------------------
  console.log("-- it comes back to a carrier");
  const again = await waitForLurker(25000);
  const gap = (Date.now() - goneAt) / 1000;
  ok(!!again && gap >= 4.5, `it comes back after its gap (${again ? gap.toFixed(1) + "s" : "never"} — the gap is dialled to 5s, 70–170s in play)`);
  ok(!!again && !los(carrier.x, carrier.y, again.x, again.y), "…arriving where nobody is looking, as ever");

  // ---- 3b. Watched, it does not vanish ------------------------------------------
  console.log("-- seen as it goes, it keeps going until the line breaks");
  {
    // a bystander (no relic — its look starts nothing) stands in view of it
    const by = put(mkSession(stage.x, stage.y, []));
    const cur = shy();
    const staged = cur && standInViewOf(by, cur, 7);
    let leftAt2 = 0, seenLeaving = 0, last2 = null, prev2 = null, gone = 0;
    const t0 = Date.now();
    while (staged && Date.now() - t0 < 45000) {
      await sleep(50);
      const q = shy();
      if (!q) { gone = Date.now(); break; }
      if (q.mode === "leave" && !leftAt2) leftAt2 = Date.now();
      if (leftAt2 && (los(by.x, by.y, q.x, q.y) && Math.hypot(by.x - q.x, by.y - q.y) <= 30)) seenLeaving++;
      if (!last2 || last2.x !== q.x || last2.y !== q.y) { prev2 = last2; last2 = q; }
    }
    // It vanishes on the tick it steps out of view, and the last sample here
    // is from just before that step — so judge the step it was taking: its
    // last position carried a little further along the way it was going.
    const seenAt = (x, y) => [by, carrier].some((w) => los(w.x, w.y, x, y) && Math.hypot(w.x - x, w.y - y) <= 30);
    const stepOut = last2 && prev2 && [0.5, 1, 1.5, 2].some((k) => !seenAt(last2.x + (last2.x - prev2.x) * k, last2.y + (last2.y - prev2.y) * k));
    const seenAtEnd = last2 && seenAt(last2.x, last2.y) && !stepOut;
    ok(!!staged && seenLeaving >= 2, `(staging) a bystander watched it start to go (${seenLeaving} ticks in view)`);
    ok(gone > 0 && (!seenAtEnd || gone - leftAt2 >= 24000), `…it vanished only once nobody held a line to it (${gone ? ((gone - leftAt2) / 1000).toFixed(1) + "s after it left" : "never"}; the hard cap is 25s)`);
    br.sessions.delete(by.userId);
    // and it comes round again for the next part
    await waitForLurker(25000);
  }

  // ---- 4. No treasure, no visit ----------------------------------------------------
  console.log("-- with nothing carried it loses interest, and stays gone");
  carrier.relics = [];
  let gone2 = false;
  for (let i = 0; i < 300 && !gone2; i++) { await sleep(100); gone2 = shy() === null; }
  ok(gone2, "the relic banked, it loses interest and goes");
  let back = false;
  for (let i = 0; i < 120 && !back; i++) { await sleep(100); back = shy() !== null; }
  ok(!back, "…and nothing comes back while nobody carries one (12s, over twice the gap)");
  clearInterval(away);

  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
