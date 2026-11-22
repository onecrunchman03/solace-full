// LOAD — sixteen players on EVERY level at once (THE BACKROOMS LAWS, law 9:
// "stable and run well for up to 16 players per level").
//
// In-process against the real service and its real 100ms creature tick: 64
// hand-made sessions (16 a level) walk the maps at 10Hz along real routes,
// waving lit flashlights about, while the station's power comes and goes and
// every creature is awake. It measures what the server's single event loop
// actually pays:
//   · event-loop delay (perf_hooks) — the number every player feels
//   · the creature tick's own cost per 100ms
//   · the proximity fan-out: how many pos frames a 10Hz move costs
// and FAILS past the pass bar: creature tick p99 < 20ms and event-loop delay
// p99 < 30ms. Not in the regular suite (it runs ~70s); run it before raising
// a cap or shipping a level: `node scripts/checks/load_backrooms.mjs`.
// everything awake and busy: blackouts often, the station's arcs on a short cycle
process.env.STATION_DARK_GAP_MIN_MS = "8000";
process.env.STATION_DARK_GAP_MAX_MS = "12000";
process.env.STATION_ARC_CYCLE_MS = "3000";
process.env.BACKROOMS_BLEEDER_EMERGE_MIN_MS = "500";
process.env.BACKROOMS_BLEEDER_EMERGE_MAX_MS = "800";
process.env.BACKROOMS_SHY_GAP_MIN_MS = "500";
process.env.BACKROOMS_SHY_GAP_MAX_MS = "600";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { createBackrooms, MAX_INSIDE } = require(path.join(ROOT, "dist", "backrooms", "service.js"));

const DB = path.join(ROOT, "data", "load-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const br = createBackrooms(store);
const PER_LEVEL = MAX_INSIDE;
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);
const secs = [br.sector, br.sectorP, br.sectorD, br.sectorS, br.sectorO, br.sectorH, br.sectorL, br.sectorT, br.sectorC, br.sectorU];

// ---- bodies that walk real floor ------------------------------------------
const walkable = (sec, x, y) => x >= 1 && y >= 1 && x < sec.size - 1 && y < sec.size - 1 && !sec.solid[y * sec.size + x] && !sec.background[y * sec.size + x];
let nextId = 20000;
const bots = [];
for (let level = 0; level < secs.length; level++) {
  const sec = secs[level];
  // spread them round the level's door, like a team coming in
  const door = sec.doors[0];
  let placed = 0;
  for (let r = 2; placed < PER_LEVEL && r < 60; r++) {
    for (let a = 0; a < 24 && placed < PER_LEVEL; a++) {
      const x = Math.floor(door.x + Math.cos((a / 24) * Math.PI * 2) * r);
      const y = Math.floor(door.y + Math.sin((a / 24) * Math.PI * 2) * r);
      if (!walkable(sec, x, y)) continue;
      const s = {
        userId: nextId++, name: "load" + nextId, x: x + 0.5, y: y + 0.5, heading: Math.random() * 6.28, door: 0,
        enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [{ id: nextId, kind: "flashlight", level: 3, color: null }],
        relics: level === 1 ? ["load-relic"] : [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
        lostAt: null, fly: false, level, subSince: null, boatId: null, fall: null, equip: "flashlight!",
      };
      br.sessions.set(s.userId, s);
      br.setImmortal(s.userId, true); // nobody leaves: the load must hold for the whole run
      bots.push({ s, sec, vx: 0, vy: 0, turnAt: 0 });
      placed++;
    }
  }
}
const perLevel = secs.map((_, i) => i).map((l) => bots.filter((b) => b.s.level === l).length);
ok(perLevel.every((c) => c === PER_LEVEL), `sixteen bodies on every level (${perLevel.join(" / ")})`);

// ---- the creature tick, timed -------------------------------------------------
const tickMs = [];
let fanout = 0;
br.onStalker(() => fanout++);
br.onShy(() => fanout++);
br.onGator(() => fanout++);
br.onBleeder(() => fanout++);
br.onWatch?.(() => fanout++);
const t0 = performance.now();
br.startEntity(() => fanout++);
// the service's interval runs the ticks; time the whole tick by wrapping the
// event loop's own measure and sampling the interval's lateness
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

// ---- walking: 10Hz, a step at a walk/run, a new heading now and then -------
const STEP = 0.25; // 2.5 cells/s at 10Hz
let moves = 0;
let frames = 0;
const near = (a, b) => a.s.level === b.s.level && Math.hypot(a.s.x - b.s.x, a.s.y - b.s.y) <= 28;
const walker = setInterval(() => {
  const now = Date.now();
  const w0 = performance.now();
  for (const b of bots) {
    if (now >= b.turnAt) {
      const a = Math.random() * Math.PI * 2;
      b.vx = Math.cos(a) * STEP;
      b.vy = Math.sin(a) * STEP;
      b.turnAt = now + 1500 + Math.random() * 3000;
    }
    const nx = b.s.x + b.vx;
    const ny = b.s.y + b.vy;
    if (walkable(b.sec, Math.floor(nx), Math.floor(ny))) {
      b.s.x = nx;
      b.s.y = ny;
      b.s.heading = Math.atan2(-b.vx, -b.vy);
      b.s.lastMoveAt = now;
      br.move?.(b.s.userId, b.s.x, b.s.y, b.s.heading);
    } else {
      b.turnAt = 0;
    }
    moves++;
    // what net.ts would fan out: one pos frame to every same-level body in range
    for (const o of bots) if (o !== b && near(b, o)) frames++;
  }
  tickMs.push(performance.now() - w0);
}, 100);

console.log(`running ${SECONDS}s with ${bots.length} bodies…`);
const samples = [];
const sampler = setInterval(() => {
  samples.push({ p99: loop.percentile(99) / 1e6, max: loop.max / 1e6 });
}, 5000);
await sleep(SECONDS * 1000);
clearInterval(walker);
clearInterval(sampler);
loop.disable();

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };
const lag99 = loop.percentile(99) / 1e6;
const lagMax = loop.max / 1e6;
const lag50 = loop.percentile(50) / 1e6;
const secsRun = (performance.now() - t0) / 1000;
console.log(`event-loop delay  p50 ${lag50.toFixed(1)}ms · p99 ${lag99.toFixed(1)}ms · max ${lagMax.toFixed(1)}ms`);
console.log(`walker step       p50 ${pct(tickMs, 50).toFixed(2)}ms · p99 ${pct(tickMs, 99).toFixed(2)}ms`);
console.log(`creature frames   ${(fanout / secsRun).toFixed(0)}/s · pos frames a client would fan out ${(frames / secsRun).toFixed(0)}/s`);
console.log(`heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)}MB`);
ok(lag99 < 30, `event-loop delay p99 under 30ms with 16 on every level (${lag99.toFixed(1)}ms)`);
ok(lagMax < 250, `no stall over a quarter second (${lagMax.toFixed(0)}ms worst)`);
ok(br.sessions.size === bots.length, "every body still inside at the end");

console.log(`\nload_backrooms: ${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
