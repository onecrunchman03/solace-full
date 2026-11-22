// THE SHY GUY harness — the Poolrooms' creature, driven in-process.
//
// The brain lives inside createBackrooms' closure, so this drives the REAL
// service: a throwaway DB, hand-built sessions injected into br.sessions, and
// the actual 100ms tick loop. Timings are shrunk through the env dials the
// service reads at construction.
//
// What it pins down, in Josh's words:
//   · it only comes when somebody is carrying a relic
//   · it arrives out of sight, "around a wall" — never watched to spawn
//   · eye contact is what sets it off, and a look has to be a real look
//   · water is the only escape, and it never sets foot in the deep
//   · after it takes the carrier, whoever is standing close is next
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
process.env.BACKROOMS_SHY_LURK_MIN_MS = "600000"; // it must not wander off mid-test
process.env.BACKROOMS_SHY_LURK_MAX_MS = "600001";
process.env.BACKROOMS_SHY_GAP_MIN_MS = "250";
process.env.BACKROOMS_SHY_GAP_MAX_MS = "251";

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { SWIM_DEPTH_STEPS } = require(dist("backrooms/worldgen-pools.js"));
const { WATER_NONE, heightPassable, FLOOR_STEP } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "shy-harness.db");
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
  // ---- 1. No relic, no creature ------------------------------------------
  const bare = put(mkSession(stage.x, stage.y));
  await sleep(1200);
  ok(shy() === null, "empty-handed: it never comes");

  // ---- 2. Treasure calls it ----------------------------------------------
  bare.relics = ["pool-relic"];
  const first = await waitForLurker();
  ok(first !== null, "carrying a relic: it appears");
  if (first) {
    const d = Math.hypot(first.x - bare.x, first.y - bare.y);
    ok(d >= 7 && d <= 20, `appears at arm's length, not on top of you (${d.toFixed(1)} cells)`);
    ok(first.mode === "lurk", "it arrives docile");
    ok(!deepAt(Math.floor(first.x), Math.floor(first.y)), "it never spawns in the deep");
  }

  // ---- 3. It is never watched to arrive ----------------------------------
  // Signature rule: the spawn search rejects any cell with a clear line to a
  // player, so it comes from around a corner. Run it repeatedly.
  let spawns = 0, seenArriving = 0;
  for (let i = 0; i < 10; i++) {
    events.length = 0;
    await clearAll();
    const s = put(mkSession(stage.x, stage.y, ["pool-relic"]));
    await sleep(1400);
    const firstPos = events.find((e) => e.type === "pos");
    if (!firstPos) continue;
    spawns++;
    if (los(s.x, s.y, firstPos.x, firstPos.y)) seenArriving++;
  }
  ok(spawns >= 6, `spawn cycles observed (${spawns}/10)`);
  ok(seenArriving === 0, `never spawns in view (${seenArriving} of ${spawns} were visible)`);

  // ---- 4. A look has to be a real look ------------------------------------
  await clearAll();
  const p = put(mkSession(stage.x, stage.y, ["pool-relic"]));
  let cur = await waitForLurker();
  ok(cur !== null, "staged a lurker for the eye-contact tests");
  if (cur) {
    // THE CONVENTION ITSELF. If the server ever reads heading as (sin, cos)
    // again, every look-cone in the game silently points out of the back of
    // the player's head — so pin it here rather than trust a comment.
    ok(Math.abs(faceAtYaw(p, cur) - clientYawLookingAt(p.x, p.y, cur.x, cur.y)) < 1e-9,
      "heading convention matches the renderer's forward vector");

    // Facing the other way: refused.
    faceAt(p, p.x - (cur.x - p.x), p.y - (cur.y - p.y));
    br.shyLook(p.userId);
    await sleep(150);
    ok(shy()?.mode === "lurk", "a look with your back to it does nothing");

    // A bystander with no relic: refused, even looking right at it.
    const empty = put(mkSession(p.x + 1, p.y, []));
    faceAt(empty, cur.x, cur.y);
    br.shyLook(empty.userId);
    await sleep(150);
    ok(shy()?.mode === "lurk", "it does not care who looks — only who carries");
    br.sessions.delete(empty.userId);

    // Someone who isn't even down here: refused.
    const upstairs = put(mkSession(p.x, p.y, ["pool-relic"], 0));
    br.shyLook(upstairs.userId);
    await sleep(150);
    ok(shy()?.mode === "lurk", "Level 0 cannot see into the Poolrooms");
    br.sessions.delete(upstairs.userId);

    // Now walk into view of it and look. (It spawned around a corner, which
    // is the whole rule — you have to come round the corner to see it.)
    // It PROWLS while docile, so a spot with a clear line can stop having one
    // between staging and looking. Keep trying, the way a player would.
    let staged = false, triggered = false;
    for (let attempt = 0; attempt < 8 && !triggered; attempt++) {
      cur = shy();
      // It may have given up on an unreachable mark and left; wait for the
      // next visit rather than calling that a failed trigger.
      if (!cur || cur.mode !== "lurk") cur = await waitForLurker(15000);
      if (!cur || cur.mode !== "lurk") continue;
      if (!standInViewOf(p, cur, 9)) { await sleep(300); continue; }
      staged = true;
      await sleep(120);
      cur = shy();
      if (!cur) break;
      faceAt(p, cur.x, cur.y);
      br.shyLook(p.userId);
      await sleep(180);
      triggered = shy()?.mode === "trigger";
    }
    ok(staged, "walked round the corner into view of it");
    ok(triggered, "eye contact: it covers its face and screams");
    // The panic is a real head start: it stands and screams before it runs.
    ok(shy()?.mode === "trigger", "it holds the panic instead of charging instantly");
    // Poll for the charge instead of sleeping past it. At twice a sprint it
    // covers 5.7 cells/s, so a fixed 1.1s wait spent most of its time with the
    // creature already on top of the bait and left nothing to sample.
    for (let i = 0; i < 40 && shy()?.mode === "trigger"; i++) await sleep(50);
    ok(shy()?.mode === "chase", "the panic passes and it comes");
  }

  // ---- 5. WATER IS A TAX, NOT A WALL --------------------------------------
  // Josh, Aug 2026: "he can walk in water thats fine but he is slower than
  // the player in water." So the thing to prove is no longer a refusal — it's
  // arithmetic. Measure its ACTUAL ground speed per depth band off the wire
  // and hold it under what a player can do at that same depth.
  //
  // The player's own scales (BackroomsGame.svelte): walk 2.05, sprint 2.85,
  // ×0.78 over 0.15m, ×0.55 over 0.6m, ×0.5 swimming (sprint still allowed).
  const PLAYER = {
    swim: { walk: 2.05 * 0.5, sprint: 2.85 * 0.5 },
    deepWade: { walk: 2.05 * 0.55, sprint: 2.85 * 0.55 },
    shallow: { walk: 2.05 * 0.78, sprint: 2.85 * 0.78 },
  };
  const bandOf = (x, y) => {
    const m = depth(Math.floor(x), Math.floor(y)) * FLOOR_STEP;
    if (m <= 0) return "dry";
    if (depth(Math.floor(x), Math.floor(y)) >= SWIM_DEPTH_STEPS) return "swim";
    if (m > 0.6) return "deepWade";
    if (m > 0.15) return "shallow";
    return "dry";
  };
  const travel = { dry: 0, shallow: 0, deepWade: 0, swim: 0 };
  const secs = { dry: 0, shallow: 0, deepWade: 0, swim: 0 };
  let chaseFrames = 0, sawWet = 0;
  /** Watch the chase, bailing when it gets close enough to kill. */
  const sample = async (frames, bailAt = 0) => {
    let prev = shy();
    for (let i = 0; i < frames; i++) {
      await sleep(100);
      const c = shy();
      if (!c) return false;
      if (c.mode === "chase") {
        chaseFrames++;
        const band = bandOf(c.x, c.y);
        if (band !== "dry") sawWet++;
        if (prev && prev.mode === "chase") {
          travel[band] += Math.hypot(c.x - prev.x, c.y - prev.y);
          secs[band] += 0.1;
        }
      }
      prev = c;
      if (bailAt && Math.hypot(c.x - p.x, c.y - p.y) < bailAt) return true;
    }
    return true;
  };
  ok(await sample(40, 4.5), "the chase is still running");
  ok(chaseFrames >= 2, `the chase actually ran (${chaseFrames} frames)`);

  // Into the deep. It should FOLLOW — and lose ground doing it. Pick water
  // 5–10 cells out: far enough that it has to wade in to reach us, close
  // enough that it doesn't just declare us escaped and leave.
  let dive = null, dvBest = -1;
  for (let r = 5; r <= 30 && dvBest < SWIM_DEPTH_STEPS; r++) {
    for (let a = 0; a < 64; a++) {
      const dx = Math.floor(p.x + Math.cos((a / 64) * Math.PI * 2) * r);
      const dy = Math.floor(p.y + Math.sin((a / 64) * Math.PI * 2) * r);
      if (depth(dx, dy) > dvBest) { dvBest = depth(dx, dy); dive = [dx, dy]; }
    }
  }
  // The look staging puts the player wherever the creature happened to be
  // lurking, which on P6 can be more than 30 cells from any deep water. The
  // stage was chosen WITH deep water in reach, so fall back to that: the
  // assert is about the map, and the jump rule below already allows a long dive.
  if (dvBest < SWIM_DEPTH_STEPS && stage.deep) { dive = stage.deep; dvBest = depth(dive[0], dive[1]); }
  ok(dive !== null && dvBest >= SWIM_DEPTH_STEPS,
    `there is deep water within wading reach (${dvBest} steps)`);
  // How far the dive itself moved us matters: this test TELEPORTS the player
  // to the water, and a jump of SHY_LOSE_GAP (16) cells or more is the ESCAPE
  // rule in its own right. Blaming water for a break-off that the distance
  // rule correctly caused would be testing the wrong thing.
  const preDive = shy();
  const jump = dive && preDive ? Math.hypot(dive[0] + 0.5 - preDive.x, dive[1] + 0.5 - preDive.y) : 0;
  if (dive) { p.x = dive[0] + 0.5; p.y = dive[1] + 0.5; }
  // THE RULE CHANGE: getting wet no longer saves you on its own. Water used
  // to end the chase on the spot; now it must keep coming. (Whether it has
  // physically reached the water yet depends on the geometry between you, so
  // the SPEED measurement happens in the waterside sweep below, where the
  // stages are chosen to guarantee wet ground.)
  await sample(25, 1.2);
  const afterDive = shy();
  ok(jump >= 16 || afterDive === null || afterDive.mode === "chase" || afterDive.mode === "trigger",
    `standing in deep water does not call it off (${afterDive ? afterDive.mode : "it caught someone"}` +
      `${jump >= 16 ? `, but the dive was a ${jump.toFixed(0)}-cell jump — that is the gap rule, not the water` : ""})`);

  // ---- 6. OPENING A GAP is what ends a chase now --------------------------
  // Water no longer stops it dead, so the escape has to come from distance —
  // which is precisely what being slower in water buys you.
  events.length = 0;
  // HOW FAR IS "far enough" NOW? Arithmetic, not a guess. It arms the give-up
  // clock at SHY_LOSE_GAP (16) and disarms under 8.8, and at twice a sprint it
  // closes 5.7 cells/s — 17.1 cells across the 3-second window. So a gap under
  // 8.8 + 17.1 = 25.9 cells is one it closes before the timer can ever run,
  // and it keeps coming, CORRECTLY. Staging at 24 was therefore asking it to
  // give up on a chase it was winning, and it rightly refused. 34 leaves real
  // margin. This is the doubled speed doing exactly what Josh asked for: on
  // dry land you cannot open a gap it can't shut, and water is the escape.
  const far = (() => {
    for (let r = 34; r <= 60; r++) {
      for (let a = 0; a < 48; a++) {
        const fx = Math.floor(p.x + Math.cos((a / 48) * Math.PI * 2) * r);
        const fy = Math.floor(p.y + Math.sin((a / 48) * Math.PI * 2) * r);
        if (walkable(fx, fy) && !deepAt(fx, fy)) return [fx, fy];
      }
    }
    return null;
  })();
  ok(far !== null, "found somewhere to get away to");
  if (far) { p.x = far[0] + 0.5; p.y = far[1] + 0.5; }
  let broke = false;
  for (let i = 0; i < 90; i++) {
    await sleep(100);
    const c = shy();
    if (!c) { broke = true; break; }
    if (c.mode !== "chase") { broke = true; break; }
  }
  ok(broke, "outrun it far enough and it gives up");

  let gone = false;
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    if (shy() === null) { gone = true; break; }
  }
  ok(gone, "it flees out of sight and despawns");

  // ---- 6b. A mark it cannot reach is one it gives up on -------------------
  // This level is flooded enough that a carrier is often on the far side of
  // water it refuses to cross. It must slope off, not stand frozen at range
  // like a statue (which is exactly what it did before the patience timer).
  // The invariant is generic, so test it generically: while it is in the
  // world it must never be MOTIONLESS for long. Whether it can reach you or
  // not, it prowls, or it repaths, or it gives up and goes — a creature
  // standing perfectly still at range for half a minute is the bug.
  await clearAll();
  const watched = put(mkSession(stage.x, stage.y, ["pool-relic"]));
  const lurker = await waitForLurker();
  ok(lurker !== null, "staged a lurker for the no-statues test");
  let still = 0, worstStill = 0, last = lurker, despawned = false;
  for (let i = 0; i < 140; i++) {
    await sleep(200);
    const c = shy();
    if (!c) { despawned = true; break; }
    // Keep our back to it: standing still under a gaze is now the CREEP and
    // is deliberate. So is waiting once it has crept close. The bug this
    // guards is being frozen AT RANGE with nobody looking — so only those
    // frames are measured.
    if (c) faceAt(watched, watched.x - (c.x - watched.x), watched.y - (c.y - watched.y));
    const atRange = c && Math.hypot(c.x - watched.x, c.y - watched.y) > 7;
    if (!atRange) { still = 0; last = c; continue; }
    if (last && Math.hypot(c.x - last.x, c.y - last.y) < 0.02) still += 200;
    else still = 0;
    worstStill = Math.max(worstStill, still);
    last = c;
  }
  ok(despawned || worstStill < 12_000,
    `never stands frozen at range (longest still stretch ${(worstStill / 1000).toFixed(1)}s${despawned ? ", then left" : ""})`);

  // ---- 6b2. THE CREEP: it closes while unwatched, freezes while watched ---
  {
    await clearAll();
    const seer = put(mkSession((dryStage ?? stage).x, (dryStage ?? stage).y, ["pool-relic"]));
    let c0 = await waitForLurker();
    ok(c0 !== null, "staged a lurker for the creep test");
    let crept = false;
    let lastCreep = "no visit";
    for (let attempt = 0; attempt < 3 && c0 && !crept; attempt++) {
      if (attempt) { c0 = await waitForLurker(12000); if (!c0) break; }
      // Back turned: it should come closer.
      // Track the CLOSEST it ever got, not where it happens to be at the end:
      // it may give up on an unreachable mark and leave mid-window (correct),
      // or despawn and reappear elsewhere, and neither is a failure to creep.
      const start = Math.hypot(c0.x - seer.x, c0.y - seer.y);
      let closest = start;
      // 15s, not 9s. The creep is DELIBERATELY slow (1.15 cells/s) and it
      // spawns up to 18 cells out, so a nine-second window could not cover
      // the distance once the route bent round anything — the test was
      // failing a creature that was creeping correctly, just not far enough
      // yet to have net-closed.
      for (let i = 0; i < 100; i++) {
        await sleep(150);
        const c = shy();
        if (!c) break;
        faceAt(seer, seer.x - (c.x - seer.x), seer.y - (c.y - seer.y)); // look away
        closest = Math.min(closest, Math.hypot(c.x - seer.x, c.y - seer.y));
      }
      if (closest < start - 0.5) crept = true;
      lastCreep = `${start.toFixed(1)} → ${closest.toFixed(1)}`;
      if (!crept) continue; // that spawn had no route; wait for the next visit

      // Now stare at it: it should stop dead.
      let moved = 0, watchedFrames = 0;
      let prev = shy();
      if (prev) faceAt(seer, prev.x, prev.y);
      for (let i = 0; i < 30; i++) {
        await sleep(150);
        const c = shy();
        if (!c || !prev) break;
        if (c.mode !== "lurk") break; // the stare triggered it — fine, that IS the mechanic
        // Only frames where it is genuinely visible count: the freeze is a
        // response to being LOOKED AT, and behind a wall it is free to move.
        const seen = los(seer.x, seer.y, c.x, c.y);
        if (seen && los(seer.x, seer.y, prev.x, prev.y)) {
          watchedFrames++;
          moved += Math.hypot(c.x - prev.x, c.y - prev.y);
        }
        faceAt(seer, c.x, c.y); // keep eyes on it
        prev = c;
      }
      ok(watchedFrames < 3 || moved < 1.2,
        `watched, it holds still (drifted ${moved.toFixed(2)} cells over ${watchedFrames} seen frames)`);
    }
    ok(crept, `unwatched, it closes the distance (${lastCreep})`);
  }

  // ---- 6b3. YOU CANNOT OUTRUN IT ON DRY LAND ------------------------------
  // Josh, Aug 2026: "when i looked at him he triggered a chase. however after
  // i ran away a bit he ran away." That was the PATHFINDER losing the chase,
  // not the player winning it — the old flood-fill search returned no route at
  // all for ~8% of repaths once a target had opened any distance, and four
  // seconds of that in a row tripped the give-up timer. Now that it also runs
  // at twice a sprint, fleeing across dry ground has to do the opposite of
  // shaking it. Water is the escape; legs are not.
  {
    await clearAll();
    const runner = put(mkSession((dryStage ?? stage).x, (dryStage ?? stage).y, ["pool-relic"]));
    let c = await waitForLurker();
    // A DRY CHASE MEANS DRY GROUND (Oct 2026). The look staging puts the
    // runner wherever the creature happens to lurk, and on P6 that is often
    // the water's edge: traced over ten runs, every "failure" here was a
    // creature that started in the shallows, took the quickest line to where
    // the runner stood — across a deep pool — and swam it at 0.8 cells/s while
    // the runner skirted the pool on dry floor and opened the gap. That is the
    // design (water is the escape), not a dry chase lost. So only a staging
    // with dry floor under both of them, between them, and down the runner's
    // line of escape counts.
    const dryAround = (x, y, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (depth(Math.floor(x) + dx, Math.floor(y) + dy) > 0) return false;
      return true;
    };
    const dryLine = (ax, ay, bx, by) => {
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 3);
      for (let i = 0; i <= steps; i++) if (depth(Math.floor(ax + ((bx - ax) * i) / steps), Math.floor(ay + ((by - ay) * i) / steps)) > 0) return false;
      return true;
    };
    let chasing = false;
    for (let a = 0; a < 16 && !chasing; a++) {
      if (!c || c.mode !== "lurk") { c = await waitForLurker(12000); continue; }
      if (!dryAround(c.x, c.y, 1)) { await sleep(400); c = shy(); continue; }
      const escape = (x, y) => {
        const d = Math.hypot(x - c.x, y - c.y) || 1;
        return dryLine(x, y, x + ((x - c.x) / d) * 14, y + ((y - c.y) / d) * 14);
      };
      if (!standInViewOf(runner, c, 9, (x, y) => dryAround(x, y, 1) && dryLine(c.x, c.y, x, y) && escape(x, y))) { await sleep(300); c = shy(); continue; }
      await sleep(120);
      c = shy();
      if (!c) break;
      faceAt(runner, c.x, c.y);
      br.shyLook(runner.userId);
      // Poll through the scream rather than oversleeping it — every extra
      // 100ms is another 0.57 cells of head start handed to the creature.
      for (let k = 0; k < 40 && shy()?.mode === "trigger"; k++) await sleep(50);
      chasing = shy()?.mode === "chase";
      c = shy();
    }
    ok(chasing, "staged a dry-land chase to run from");
    if (chasing) {
      const SPRINT_FRAME = 2.85 * 0.1; // a sprinting player, per 100ms frame
      const start = Math.hypot(shy().x - runner.x, shy().y - runner.y);
      const killedRunner = () => events.some((e) => e.type === "kill" && e.userId === runner.userId);
      let gap = start, frames = 0, broke = null, caught = false, runnerWet = 0, shyWet = 0;
      const trace = [];
      const rp0 = shy()?.repaths ?? 0, pp0 = shy()?.partials ?? 0;
      events.length = 0;
      for (let i = 0; i < 80; i++) {
        await sleep(100);
        const s = shy();
        if (!s) { broke = killedRunner() ? null : "it despawned"; caught = killedRunner(); break; }
        // Catching the runner ALSO ends in flee (nobody else standing near to
        // turn on), so ask why it stopped before calling it a break-off —
        // otherwise a clean kill scores as the creature giving up.
        if (s.mode === "flee" || s.mode === "leave") {
          if (killedRunner()) { caught = true; break; }
          broke = "it broke off";
          break;
        }
        gap = Math.hypot(s.x - runner.x, s.y - runner.y);
        if (depth(Math.floor(s.x), Math.floor(s.y)) > 0) shyWet++;
        trace.push(`${frames}: shy ${s.x.toFixed(1)},${s.y.toFixed(1)} d${depth(Math.floor(s.x), Math.floor(s.y))} path${s.pathLen}${s.noRouteSince ? " NOROUTE" : ""} · run ${runner.x.toFixed(1)},${runner.y.toFixed(1)} gap ${gap.toFixed(1)}`);
        if (gap < 0.8) { caught = true; break; }
        // Sprint straight away from it, PREFERRING dry ground — the point is
        // that legs alone are not the answer, so the runner must not be
        // quietly rescued by wading. (Rejecting every wet cell outright made
        // this vacuous: standInViewOf can leave the runner in ankle-deep
        // water, and then no direction at all was legal and it never ran.)
        const th0 = Math.atan2(runner.y - s.y, runner.x - s.x);
        let step = null;
        // THE RUNNER PAYS THE WATER TAX TOO. Without this the test sprinted
        // through shallow water at full dry pace while the creature was
        // correctly slowed to 1.45 — so the "runner" outran it 8.9 → 14.1
        // cells and the test called that a break-off. That is not a player
        // beating it on dry land, it is a test cheating in the water.
        const wade = depth(Math.floor(runner.x), Math.floor(runner.y)) * 0.5 > 0.15 ? 0.78 : 1;
        for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7, 2.4, -2.4]) {
          const nx = runner.x + Math.cos(th0 + turn) * SPRINT_FRAME * wade;
          const ny = runner.y + Math.sin(th0 + turn) * SPRINT_FRAME * wade;
          const cx = Math.floor(nx), cy = Math.floor(ny);
          if (!walkable(cx, cy) || deepAt(cx, cy)) continue;
          // AND THE WALL BETWEEN MUST BE OPEN. Checking only "is the cell
          // open" let the test runner walk through thin walls, which no real
          // client can do — it crossed a wall line the creature then had to
          // walk all the way around, and the gap went 8.4 → 34.7 cells. The
          // creature was obeying the map; the test was cheating.
          if (!stepAllowed(Math.floor(runner.x), Math.floor(runner.y), cx, cy)) continue;
          if (depth(cx, cy) === 0) { step = [nx, ny]; break; } // dry: take it
          if (!step) step = [nx, ny]; // shallow: keep as a fallback
        }
        if (!step) break; // cornered — running has nothing left to prove
        runner.x = step[0]; runner.y = step[1]; frames++;
        if (depth(Math.floor(runner.x), Math.floor(runner.y)) > 0) runnerWet++;
      }
      // A run that never happened proves nothing — the first version of this
      // test passed with frames = 0.
      ok(caught || frames >= 15, `the runner actually got to run (${frames} frames)`);
      ok(caught || broke === null,
        `sprinting away on dry land does not shake it (${caught ? "it ran the runner down" : broke ?? `held the chase ${frames} frames`})`);
      ok(caught || gap <= start + 0.5,
        `and it gains ground while you run (${start.toFixed(1)} → ${gap.toFixed(1)} cells over ${frames} frames; wet frames runner ${runnerWet}, creature ${shyWet})`);
      if (!(caught || gap <= start + 0.5)) console.error(`repaths ${(shy()?.repaths ?? 0) - rp0} partial ${(shy()?.partials ?? 0) - pp0}`);
      if (!(caught || gap <= start + 0.5)) console.error(trace.filter((_, i) => i % 4 === 0).join(String.fromCharCode(10)));
    }
  }

  // ---- 6c. NO GLITCHING OUT IN THE WATER ----------------------------------
  // Josh's other half: "make sure he doesnt glitch out in deep water." Now
  // that it swims, the failure modes moved — it can't clip a pool corner any
  // more, but it CAN teleport across one, stall in it, or end up standing on
  // a cell no body should occupy. These stages are picked for being awkward:
  // dry footing with a lot of deep water within a few metres.
  const wetStages = [];
  for (let y = 14; y < SIZE - 14 && wetStages.length < 8; y += 11) {
    for (let x = 14; x < SIZE - 14 && wetStages.length < 8; x += 11) {
      if (!walkable(x, y) || depth(x, y) > 0) continue;
      let near = 0, open = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (deepAt(x + dx, y + dy)) near++;
        else if (walkable(x + dx, y + dy)) open++;
      }
      if (near > 25 && open > 60) wetStages.push([x + 0.5, y + 0.5]);
    }
  }
  ok(wetStages.length >= 3, `found waterside ground to chase over (${wetStages.length} stages)`);
  let chasesRun = 0, wetFrames = 0, jumps = 0, offMap = 0, stalls = 0;
  for (const [sx, sy] of wetStages) {
    await clearAll();
    const bait = put(mkSession(sx, sy, ["pool-relic"]));
    let c = await waitForLurker(9000);
    let went = false;
    for (let a = 0; a < 5 && !went; a++) {
      if (!c || c.mode !== "lurk") { c = await waitForLurker(6000); continue; }
      if (!standInViewOf(bait, c, 10)) { await sleep(250); c = shy(); continue; }
      await sleep(120);
      c = shy();
      if (!c) break;
      faceAt(bait, c.x, c.y);
      br.shyLook(bait.userId);
      await sleep(200);
      went = shy() && shy().mode !== "lurk";
      c = shy();
    }
    if (!went) continue;
    chasesRun++;
    // THE BAIT CANNOT DIE HERE. At twice a sprint it now closes the staging
    // distance in well under a second, so it was sometimes killing the bait on
    // dry land before the wade below ever happened — the observation window
    // then had no creature in it and "0 wet frames" failed a creature that
    // swims perfectly well. Immortality makes the chase run as long as we want
    // to watch it, which is the only thing this section is measuring.
    br.setImmortal(bait.userId, true);
    // Wade out into the pool so the chase has to cross real water — a bait
    // standing on dry tile never tests any of this.
    let wet = null, wetBest = -1;
    for (let r = 4; r <= 9; r++) {
      for (let a = 0; a < 48; a++) {
        const wx = Math.floor(bait.x + Math.cos((a / 48) * Math.PI * 2) * r);
        const wy = Math.floor(bait.y + Math.sin((a / 48) * Math.PI * 2) * r);
        if (depth(wx, wy) > wetBest) { wetBest = depth(wx, wy); wet = [wx, wy]; }
      }
    }
    if (wet && wetBest >= SWIM_DEPTH_STEPS) { bait.x = wet[0] + 0.5; bait.y = wet[1] + 0.5; }
    let prev = shy(), stillFor = 0;
    for (let i = 0; i < 70; i++) {
      await sleep(100);
      const s = shy();
      if (!s) break;
      const cx = Math.floor(s.x), cy = Math.floor(s.y);
      if (deepAt(cx, cy)) wetFrames++;
      // A body must never be inside geometry. Judged WELL inside the cell:
      // a position sitting exactly on a boundary floors into whichever side
      // wins the last bit of float, which is arithmetic, not a glitch.
      const fx = s.x - cx, fy = s.y - cy;
      if (!walkable(cx, cy) && fx > 0.15 && fx < 0.85 && fy > 0.15 && fy < 0.85) offMap++;
      // SPEED, measured only across ticks that START AND END in the same
      // depth band — a step that crosses a shoreline belongs to neither, and
      // crediting it to the wetter end is what made this read fast.
      if (prev && s.mode === "chase" && prev.mode === "chase") {
        const b0 = bandOf(prev.x, prev.y), b1 = bandOf(s.x, s.y);
        if (b0 === b1) {
          travel[b1] += Math.hypot(s.x - prev.x, s.y - prev.y);
          secs[b1] += 0.1;
        }
      }
      if (prev) {
        // At its very fastest (5.7 cells/s dry) a 100ms tick is 0.57 cells,
        // and this sampler is not phase-locked to the engine's tick, so an
        // honest observation can span two of them. Anything past that margin
        // is a teleport, not a stride — which is what "glitching out" would
        // actually look like on the wire.
        const step = Math.hypot(s.x - prev.x, s.y - prev.y);
        if (step > 1.5) jumps++;
        // Stuck in the water: chasing, not close, and not moving.
        if (s.mode === "chase" && step < 0.005 && Math.hypot(s.x - bait.x, s.y - bait.y) > 1.5) stillFor += 100;
        else stillFor = 0;
        // Longer than the engine's own no-route patience (4s), or this flags
        // the deliberate pause before it gives up and leaves.
        if (stillFor >= 6000) { stalls++; stillFor = 0; }
      }
      prev = s;
      if (Math.hypot(s.x - bait.x, s.y - bait.y) < 0.7) break;
    }
    br.setImmortal(bait.userId, false);
  }
  ok(chasesRun >= 2, `ran chases over waterside ground (${chasesRun})`);
  ok(wetFrames > 0, `it actually gets in the water now (${wetFrames} wet frames)`);
  ok(jumps === 0, `no teleporting across water (${jumps} impossible steps)`);
  ok(offMap === 0, `never standing inside geometry (${offMap} bad cells)`);
  ok(stalls === 0, `never stalls mid-chase in the water (${stalls} stalls)`);

  // THE HEADLINE RULE, as arithmetic: slower than the player at every depth.
  let bandsJudged = 0;
  for (const band of ["shallow", "deepWade", "swim"]) {
    if (secs[band] < 0.5) continue;
    bandsJudged++;
    const measured = travel[band] / secs[band];
    ok(measured < PLAYER[band].walk,
      `slower than a WALKING player in ${band} water ` +
      `(${measured.toFixed(2)} < ${PLAYER[band].walk.toFixed(2)} cells/s, ${secs[band].toFixed(1)}s sampled)`);
  }
  ok(bandsJudged > 0, `measured its speed in real water (${bandsJudged} depth band(s))`);
  if (secs.dry > 0.5) {
    // Measured GROUND speed along a winding path, not the speed setting —
    // string-pulling round corners legitimately costs some of the 3.5. What
    // matters is that dry ground is still far and away its best surface.
    const dry = travel.dry / secs.dry;
    ok(dry > 2.2, `and it is fastest on dry tile (${dry.toFixed(2)} cells/s vs 0.8 swimming)`);
    ok(!secs.swim || dry > (travel.swim / secs.swim) * 2, "dry ground is at least twice its swimming pace");
  }

  // ---- 7. It kills, and then it is still angry ----------------------------
  await clearAll();
  events.length = 0;
  const doomed = put(mkSession(stage.x, stage.y, ["pool-relic"]));
  cur = await waitForLurker();
  ok(cur !== null, "staged a lurker for the kill test");
  if (cur) {
    // Carrier right beside it; a friend hanging back — close enough to be
    // inside the blooded radius, far enough not to die in the same instant
    // (which would empty the level and end the visit before we can look).
    ok(standInViewOf(doomed, cur, 2), "found standing room beside it");
    const friend = put(mkSession(doomed.x, doomed.y, []));
    const away = Math.atan2(doomed.y - cur.y, doomed.x - cur.x);
    for (let r = 7; r <= 9; r++) {
      const fx = Math.floor(doomed.x + Math.cos(away) * r);
      const fy = Math.floor(doomed.y + Math.sin(away) * r);
      if (walkable(fx, fy) && !deepAt(fx, fy)) { friend.x = fx + 0.5; friend.y = fy + 0.5; break; }
    }
    faceAt(doomed, cur.x, cur.y);
    br.shyLook(doomed.userId);
    let killed = false, blooded = false;
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      if (!killed && !br.sessions.has(doomed.userId)) killed = true;
      const st = shy();
      if (killed && st && st.targetId === friend.userId) { blooded = true; break; }
      if (killed && !br.sessions.has(friend.userId)) { blooded = true; break; }
    }
    ok(killed, "it catches the carrier");
    ok(events.some((e) => e.type === "kill" && e.userId === doomed.userId), "the kill goes on the wire");
    const deaths = store.brRecentDeaths?.(20) ?? [];
    ok(!deaths.length || deaths.some((d) => d.cause === "the shy guy"), "the death is logged as its own");
    ok(blooded, "BLOODED: whoever was standing close is next, relic or not");
  }


  // NEVER INSIDE A WALL, all run (Oct 2026 — the Grabber's harness caught a
  // corner-cutting route walking it through solid cells; this one would not
  // have). Every reported position on open floor, and no step between two
  // frames through a wall (a gap over 300ms is a new appearance, not a step).
  {
    const byId = new Map();
    for (const p of everyPos) { const a = byId.get(p.id) ?? []; a.push(p); byId.set(p.id, a); }
    let inWall = 0, through = 0, steps = 0, first = "";
    for (const a of byId.values()) {
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        steps++;
        if (!walkable(Math.floor(p.x), Math.floor(p.y))) { inWall++; first ||= `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }
        if (i && p.at - a[i - 1].at <= 300 && !los(a[i - 1].x, a[i - 1].y, p.x, p.y)) { through++; first ||= `${a[i - 1].x.toFixed(2)},${a[i - 1].y.toFixed(2)} -> ${p.x.toFixed(2)},${p.y.toFixed(2)}`; }
      }
    }
    ok(steps > 50 && inWall === 0 && through === 0, `it is never inside a wall or through one, all run (${steps} positions; ${inWall} in a wall, ${through} through one${first ? `; first at ${first}` : ""})`);
  }
  await clearAll();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
