// THE ALLIGATORS harness — the Poolrooms' pool guardians, driven in-process.
//
// Like test_shyguy.mjs this drives the REAL service: a throwaway DB,
// hand-built sessions injected into br.sessions, the actual 100ms tick.
// No env dials needed — gators have no spawn lifecycle to shrink.
//
// What it pins down, in Josh's words:
//   · "an alligator for every large body of water" — a fixed, deterministic
//     population, each standing in its own water at boot
//   · "it will not chase or target a player unless the player is in the
//     water and in line of sight" — deck-standers, boat riders, walled-off
//     swimmers and far swimmers are all ignored
//   · "the attack only lands if the mouth of the alligator touches the
//     player" — a body pinned at its TAIL takes nothing
//   · "1 bite every 1.5 seconds ... three bites to fully kill"
//   · and the cage rule that makes the whole design work: it NEVER leaves
//     its own body of water, so dry tile is absolute safety.
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
const { WATER_NONE } = require(dist("backrooms/worldgen.js"));

const DB = path.join(ROOT, "data", "gator-harness.db");
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

// THE CAGE, watched for the whole run: every sample of every gator must be a
// wet cell of the region it started in. One violation anywhere fails it.
const home = new Map();
for (const g of gators()) home.set(g.id, regionAt(Math.floor(g.x), Math.floor(g.y)));
let cageViolations = 0;
const watchCage = setInterval(() => {
  for (const g of gators()) {
    const r = regionAt(Math.floor(g.x), Math.floor(g.y));
    if (r === -1 || r !== home.get(g.id)) cageViolations++;
  }
}, 150);

const run = async () => {
  // ---- 1. The population -----------------------------------------------
  const pop = gators();
  console.log(`population: ${pop.length} gators`);
  // one per big body, counted from the map itself (worldgen-pools waterBodies —
  // the same flood, the same 800-cell / waist-deep bar) rather than a number
  // that has to be rewritten every time the Poolrooms are redesigned
  const want = waterBodies(br.sectorP).filter((b) => b.gator).length;
  ok(pop.length === want && want >= 8, `one per large body: ${want} on the frozen map (got ${pop.length})`);
  ok(pop.every((g) => depth(Math.floor(g.x), Math.floor(g.y)) >= 2), "each stands in real water at boot (waist+)");
  ok(pop.every((g) => g.mode === "idle"), "all docile at boot");
  const homes = new Set(pop.map((g) => regionAt(Math.floor(g.x), Math.floor(g.y))));
  ok(homes.size === pop.length && !homes.has(-1), "each guards its OWN body of water");

  // Stage on the gator with the most open deep water around its spawn.
  let stageG = null, stageScore = -1;
  for (const g of pop) {
    const gx = Math.floor(g.x), gy = Math.floor(g.y);
    let open = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (deepAt(gx + dx, gy + dy) && regionAt(gx + dx, gy + dy) === regionAt(gx, gy)) open++;
    }
    if (open > stageScore) { stageScore = open; stageG = g; }
  }
  const G = stageG.id;
  const gnow = () => gators().find((g) => g.id === G);
  const spawn = { x: stageG.x, y: stageG.y };
  console.log(`stage gator #${G} at ${spawn.x.toFixed(1)},${spawn.y.toFixed(1)} (${stageScore} open deep cells)`);
  // A spot in its water with a clear line to it, a few cells off.
  const waterSpotNear = (want, from = spawn) => {
    let best = null, bestErr = Infinity;
    for (let r = 2; r <= 18; r++) {
      for (let a = 0; a < 48; a++) {
        const cx = Math.floor(from.x + Math.cos((a / 48) * Math.PI * 2) * r);
        const cy = Math.floor(from.y + Math.sin((a / 48) * Math.PI * 2) * r);
        if (regionAt(cx, cy) !== home.get(G)) continue;
        if (!los(cx + 0.5, cy + 0.5, from.x, from.y)) continue;
        const err = Math.abs(Math.hypot(cx + 0.5 - from.x, cy + 0.5 - from.y) - want);
        if (err < bestErr) { bestErr = err; best = { x: cx + 0.5, y: cy + 0.5 }; }
      }
    }
    return best;
  };
  // A DRY spot with a clear line to the gator (the deck beside its pool).
  const drySpotNear = (from) => {
    for (let r = 2; r <= 22; r++) {
      for (let a = 0; a < 64; a++) {
        const cx = Math.floor(from.x + Math.cos((a / 64) * Math.PI * 2) * r);
        const cy = Math.floor(from.y + Math.sin((a / 64) * Math.PI * 2) * r);
        if (!walkable(cx, cy) || depth(cx, cy) > 0) continue;
        if (!los(cx + 0.5, cy + 0.5, from.x, from.y)) continue;
        return { x: cx + 0.5, y: cy + 0.5 };
      }
    }
    return null;
  };

  // ---- 2. What does NOT provoke it ---------------------------------------
  {
    const deck = drySpotNear(spawn);
    ok(deck !== null, "found a dry deck spot in view of it");
    if (deck) {
      const watcher = put(mkSession(deck.x, deck.y));
      await sleep(2000);
      ok(gnow().mode === "idle", "a body on the DECK, in plain view: ignored");
      ok(watcher.hp === 100, "…and untouched");
      br.sessions.clear(); // no despawn wait needed — gators are fixtures
    }
    const wspot = waterSpotNear(6);
    const rider = put(mkSession(wspot.x, wspot.y));
    rider.boatId = 1; // in a hull, not in the water
    await sleep(2000);
    ok(gnow().mode === "idle", "a body in a BOAT on its water: ignored");
    br.sessions.clear();

    // In its water but walled off — no line of sight, no interest. Staged on
    // WHICHEVER gator's water has a cell out of its sight: the stage gator can
    // sit in a round basin that is all in view (P4's Confluence), while a reach
    // of river has cells round its bend.
    let hidden = null;
    outer: for (const g of [gators().find((q) => q.id === G), ...gators().filter((q) => q.id !== G)]) {
      const from = { x: g.x, y: g.y };
      const reg = regionAt(Math.floor(g.x), Math.floor(g.y));
      for (let r = 4; r <= 40; r++) {
        for (let a = 0; a < 64; a++) {
          const cx = Math.floor(from.x + Math.cos((a / 64) * Math.PI * 2) * r);
          const cy = Math.floor(from.y + Math.sin((a / 64) * Math.PI * 2) * r);
          if (regionAt(cx, cy) !== reg) continue;
          if (los(cx + 0.5, cy + 0.5, from.x, from.y)) continue;
          hidden = { x: cx + 0.5, y: cy + 0.5, id: g.id };
          break outer;
        }
      }
    }
    if (hidden) {
      put(mkSession(hidden.x, hidden.y));
      await sleep(1500);
      ok(gators().find((q) => q.id === hidden.id).mode === "idle", "in its water but WALLED OFF (no line of sight): ignored");
      br.sessions.clear();
    } else {
      console.log("  (no walled-off wet cell in any gator's water — LOS-gate case not stageable here)");
    }
  }

  // ---- 3. Idle it cruises, and never beaches ------------------------------
  {
    const deck = drySpotNear(spawn);
    put(mkSession(deck.x, deck.y)); // an audience within wake range
    const a = gnow();
    await sleep(6000);
    const b = gnow();
    const moved = Math.hypot(b.x - a.x, b.y - a.y);
    ok(moved > 0.4, `idle, it cruises its pool (moved ${moved.toFixed(1)} cells over 6s)`);
    ok(gatorEvents.some((e) => e.type === "pos" && e.id === G), "its position rides the wire");
    br.sessions.clear();
  }

  // ---- 4. A swimmer in its water, in view: THE CHASE ----------------------
  {
    const cur = gnow();
    const wspot = waterSpotNear(8, cur);
    const prey = put(mkSession(wspot.x, wspot.y));
    let chased = false;
    for (let i = 0; i < 30 && !chased; i++) {
      await sleep(100);
      const g = gnow();
      if (g.mode === "chase" && g.targetId === prey.userId) chased = true;
    }
    ok(chased, "in the water + line of sight: it comes");

    // It CLOSES, and faster than any swimmer could.
    const d0 = (() => { const g = gnow(); return Math.hypot(g.x - prey.x, g.y - prey.y); })();
    await sleep(1000);
    const d1 = (() => { const g = gnow(); return Math.hypot(g.x - prey.x, g.y - prey.y); })();
    ok(d1 < d0 - 0.8 || d1 < 1.2, `it closes hard (${d0.toFixed(1)} → ${d1.toFixed(1)} cells in 1s)`);

    // THE MOUTH RULE, negative half: behind it, beyond the jaws, nothing
    // lands. The prey is re-pinned 2.0 cells behind its centre every 60ms.
    //
    // WHY 2.0 AND NOT "touching the tail" (learned from a 21/26 sweep run,
    // then a reliable repro at 1.2): the brain turns ~55% of its heading
    // error per 100ms tick AND advances while doing it, so a body pinned at
    // the tail tip is an UNSTABLE pose — two or three server ticks between
    // re-pins (a GC pause, a dev server compiling) and the jaws legitimately
    // swing onto the prey. That is the game being RIGHT, not the rule
    // failing. At 2.0 the geometry needs ≥3 unpinned ticks (≥300ms of stall)
    // to bite, which the stall detector below catches — so a bled run
    // without a detected stall is a real violation, and a stalled one
    // retries. The POSITIVE half of the rule (a bite only ever lands with
    // the mouth ON the body) is asserted exactly, per bite, further down.
    let pinBled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const hp0 = prey.hp;
      let stalled = false;
      let last = Date.now();
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const g = gnow();
        const tx = g.x - Math.sin(g.h) * 2.0;
        const ty = g.y - Math.cos(g.h) * 2.0;
        // Only pin onto real water of its region — near an edge, stay put.
        if (regionAt(Math.floor(tx), Math.floor(ty)) === home.get(G)) { prey.x = tx; prey.y = ty; }
        await sleep(60);
        const now = Date.now();
        if (now - last > 220) stalled = true;
        last = now;
      }
      pinBled = prey.hp !== hp0;
      if (!pinBled || !stalled) break;
      console.log("  (pin loop stalled and bled — retrying the tail pin)");
      prey.hp = 100; // reset for a clean retry
    }
    ok(!pinBled, `held behind it, beyond the jaws: 3s and not a scratch (hp ${prey.hp})`);
    prey.hp = 100; // whatever the pin cost, the kill test starts from full

    // Now hold still and take it: three bites, 1.5s apart, and the third kills.
    // Track the LAST LIVING position: the ragdoll throw (Aug 2026) slides the
    // corpse along the death roll inside killPlayer, so `prey.x` after death
    // is the REST spot, not where the jaws actually closed.
    const bitesBefore = gatorEvents.filter((e) => e.type === "bite").length;
    const hurtsBefore = hurtEvents.length;
    let dead = false;
    const liveAt = { x: prey.x, y: prey.y };
    const t0 = Date.now();
    for (let i = 0; i < 120 && !dead; i++) {
      await sleep(100);
      if (br.sessions.has(prey.userId)) {
        liveAt.x = prey.x;
        liveAt.y = prey.y;
      } else dead = true;
    }
    ok(dead, `it kills a held prey (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    const myHurts = hurtEvents.slice(hurtsBefore).filter((e) => e.userId === prey.userId);
    const hps = myHurts.map((e) => e.hp);
    ok(myHurts.length === 3, `THREE bites to kill (got ${myHurts.length}: ${hps.join(",")})`);
    ok(hps[0] === 66 && hps[1] === 32 && hps[2] === 0, `34 a bite: 100→66→32→dead (got ${hps.join("→")})`);
    const gaps = myHurts.slice(1).map((e, i) => e.at - myHurts[i].at);
    ok(gaps.every((g) => g >= 1_350), `1 bite / 1.5s (gaps ${gaps.map((g) => (g / 1000).toFixed(2)).join("s, ")}s)`);
    ok(myHurts.slice(0, 2).every((e) => e.cause === "gator") && myHurts[2]?.cause === "an alligator",
      "bites are labeled, and the kill is 'an alligator'");
    const biteFrames = gatorEvents.filter((e) => e.type === "bite").slice(bitesBefore);
    ok(biteFrames.length === 3, `every bite munches on the wire (${biteFrames.length} bite frames)`);
    // THE MOUTH RULE, positive half, exact: a bite frame carries the MOUTH's
    // position at the moment damage was applied, and the prey stood still —
    // so every landed bite must sit within bite radius of the body.
    const reach = biteFrames.map((b) => Math.hypot(b.x - liveAt.x, b.y - liveAt.y));
    ok(reach.every((r) => r <= 0.61), `every bite landed mouth-on-body (${reach.map((r) => r.toFixed(2)).join(", ")} cells)`);
    // And the throw itself: the corpse's rest spot slid along the death roll,
    // never further than the roll's power, still inside the gator's water.
    const slid = Math.hypot(prey.x - liveAt.x, prey.y - liveAt.y);
    ok(slid <= 0.95, `the death roll dragged the body a short way, not a launch (${slid.toFixed(2)} cells)`);
    const deaths = store.brRecentDeaths?.(20) ?? [];
    ok(deaths.some((d) => d.cause === "an alligator"), "the death is logged as its own");
    ok(gnow().mode === "idle", "fed, it goes back to its slow circuit");
    br.sessions.clear();
    await sleep(200);
  }

  // ---- 5. OUT OF THE WATER IS OUT OF THE GAME ------------------------------
  {
    const cur = gnow();
    const wspot = waterSpotNear(7, cur);
    const runner = put(mkSession(wspot.x, wspot.y));
    let chased = false;
    for (let i = 0; i < 30 && !chased; i++) {
      await sleep(100);
      if (gnow().mode === "chase") chased = true;
    }
    ok(chased, "second victim provokes it the same way");
    // Step onto the deck mid-chase.
    const deck = drySpotNear({ x: runner.x, y: runner.y }) ?? drySpotNear(cur);
    runner.x = deck.x; runner.y = deck.y;
    let brokeOff = false;
    for (let i = 0; i < 20 && !brokeOff; i++) {
      await sleep(100);
      if (gnow().mode === "idle") brokeOff = true;
    }
    ok(brokeOff, "feet on dry tile: it breaks off at once");
    const hpOnDeck = runner.hp;
    await sleep(2500);
    ok(runner.hp === hpOnDeck && br.sessions.has(runner.userId), "and can never follow you onto the deck");
    br.sessions.clear();
  }


  // NEVER INSIDE A WALL, all run (Oct 2026 — the Grabber's harness caught a
  // corner-cutting route walking it through solid cells; this one would not
  // have). Every reported position on open floor, and no step between two
  // frames through a wall (a gap over 300ms is a new appearance, not a step).
  {
    const byId = new Map();
    for (const p of gatorEvents.filter((e) => e.type === "pos")) { const a = byId.get(p.id) ?? []; a.push(p); byId.set(p.id, a); }
    let inWall = 0, through = 0, steps = 0, first = "";
    for (const a of byId.values()) {
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        steps++;
        if (!walkable(Math.floor(p.x), Math.floor(p.y))) { inWall++; first ||= `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }
        if (i && p.at - a[i - 1].at <= 300 && !los(a[i - 1].x, a[i - 1].y, p.x, p.y)) { through++; first ||= `${a[i - 1].x.toFixed(2)},${a[i - 1].y.toFixed(2)} -> ${p.x.toFixed(2)},${p.y.toFixed(2)}`; }
      }
    }
    ok(steps > 50 && inWall === 0 && through === 0, `the alligators never go inside a wall or through one, all run (${steps} positions; ${inWall} in a wall, ${through} through one${first ? `; first at ${first}` : ""})`);
  }
  clearInterval(watchCage);
  ok(cageViolations === 0, `THE CAGE held: sampled all run, never a fin out of its own water (${cageViolations} violations)`);

  await clearAll();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
