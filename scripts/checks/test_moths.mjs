// THE DEATHMOTHS — Level 5's creature, in-process against the real tick, one
// assert per agreed behaviour (BACKROOMS.md → "LEVEL 5 — TERROR HOTEL → THE
// CREATURE", Josh's call 2026-10-13):
//
//   · a swarm SLEEPS on its nest — a body in the dark beside it wakes nothing;
//   · a LIT TORCH near the nest, in line, wakes it;
//   · it goes for the light — the torch-bearer, never the dark body nearer it;
//   · it flies faster than a walk and slower than a sprint;
//   · around you it bites: about ten seconds in a swarm kills ("the deathmoths");
//   · it LOSES you with your torch off a few seconds, and goes home to sleep;
//   · …and with no line to you a few seconds;
//   · THE BEVERLY ROOM: a swarm that follows you in circles the chandelier,
//     forgets you, and goes home after a while;
//   · never into the Service Stair, never after a flyer;
//   · never through a wall, never on solid stone;
//   · an empty hotel puts every swarm back to sleep on its nest.
//
// CLOCKED, like the other creature harnesses: rerun it ALONE before believing
// a failure.
process.env.BACKROOMS_MOTH_FORGET_MS = "1500";
process.env.BACKROOMS_MOTH_CIRCLE_MS = "2500";
process.env.BACKROOMS_DIRECTOR = "0";
process.env.BACKROOMS_HEAT_RISE_MIN = "0";
process.env.BACKROOMS_HEAT_RISE_MAX = "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { distanceMap } = require(dist("backrooms/worldgen.js"));
const { HDECO, hdecoKind } = require(dist("backrooms/hotel-vocab.js"));
const { LEVEL5_FLAG, HOTEL_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "moths-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledH) { console.error("the hotel did not boot"); process.exit(1); }
br.startEntity(() => {});
store.brSetFlag(LEVEL5_FLAG, null, "harness");
store.brSetFlag(HOTEL_OPEN_FLAG, null, "harness");
const sec = br.sectorH;
const SIZE = sec.size;
const idx = (x, y) => y * SIZE + x;
const typeAt = (x, y) => sec.districts[sec.district[idx(Math.floor(x), Math.floor(y))]]?.type;

// ---- the service's own wall rule, mirrored (a line of sight)
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
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
  return (edgeOpen(ax, ay, ax + dx, ay) && edgeOpen(ax + dx, ay, bx, by)) || (edgeOpen(ax, ay, ax, ay + dy) && edgeOpen(ax, ay + dy, bx, by));
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

// ---- every position a swarm ever reports
const seen = [];
br.onMoths((ev) => { if (ev.type === "pos") seen.push(ev); });
const hurts = [];
br.onHurt((ev) => hurts.push({ ...ev, at: Date.now() }));
const swarms = () => br.operatorView(5).monsters.filter((m) => m.kind === "moths");
const swarm = (id) => swarms().find((m) => m.id === id);

// ---- the nests, and a lawful spot in line with each, 4-7 cells off
const fromDoor = distanceMap(sec, sec.doors.map((d) => ({ x: d.x, y: d.y })));
const nests = swarms().map((w) => ({ id: w.id, x: w.x, y: w.y }));
const spotNear = (nest, lo = 4, hi = 7) => {
  for (let r = lo; r <= hi; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(nest.x) + dx, y = Math.floor(nest.y) + dy;
        if (!walkable(x, y) || fromDoor[idx(x, y)] < 0) continue;
        if (typeAt(x, y) === "landing" || typeAt(x, y) === "beverly") continue;
        if (los(x + 0.5, y + 0.5, nest.x, nest.y)) return { x: x + 0.5, y: y + 0.5 };
      }
  return null;
};
const usable = nests.map((nst) => ({ nst, at: spotNear(nst) })).filter((u) => u.at);
ok(nests.length >= 3 && usable.length >= 2, `${nests.length} nests in the hotel, ${usable.length} with a spot in line of them`);

const mkUser = (u) => store.createUser({ username: u, displayName: u, passwordHash: "x" });
const enterHotel = (u) => {
  store.brForceAddItem(u.id, "suit", "yellow");
  store.brForceAddItem(u.id, "flashlight", null);
  const r = br.enter(u.id, u.username, 0, store.brLockerItems(u.id).map((i) => i.id), 5);
  if (r.error) throw new Error(`${u.username}: ${r.error}`);
  return r;
};
const place = (s, p) => { s.x = p.x; s.y = p.y; };
const lit = (s, on) => { s.equip = on ? "flashlight!" : "flashlight"; };
const parkAll = () => { for (const q of br.sessions.values()) if (q.level === 5) { place(q, { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 }); lit(q, false); } };
const waitFor = async (pred, ms, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(step); } return pred(); };

const [A, B] = usable;
const nestA = A.nst;

console.log("-- asleep in the dark");
const dark = mkUser("bellhop");
const sd = enterHotel(dark);
lit(sd, false);
place(sd, A.at);
await sleep(1200);
ok(swarm(nestA.id).mode === "asleep", "a body in the dark beside a nest wakes nothing");

console.log("-- a lit torch");
const lamp = mkUser("lamplighter");
const sl = enterHotel(lamp);
// mortal for this part: an immortal is never bitten (the bite is a hurt frame)
// the dark one stands nearer the nest than the lamp
place(sd, A.at);
const farther = spotNear(nestA, 5, 9) ?? A.at;
place(sl, farther);
lit(sl, true);
ok(await waitFor(() => swarm(nestA.id).mode === "hunting", 1500), "a lit torch near the nest, in line, wakes it");
await waitFor(() => hurts.some((h) => h.userId === lamp.id && h.cause === "moths"), 5000);
const bitDark = hurts.some((h) => h.userId === dark.id && h.cause === "moths");
const atLamp = Math.hypot(swarm(nestA.id).x - sl.x, swarm(nestA.id).y - sl.y);
ok(!bitDark && atLamp < 2, `it goes for the light — on the torch-bearer (${atLamp.toFixed(1)} cells), the dark body untouched`);
ok(hurts.some((h) => h.userId === lamp.id && h.cause === "moths"), "…and bites while it surrounds them");

console.log("-- the torch goes out");
lit(sl, false);
ok(await waitFor(() => swarm(nestA.id).mode === "returning" || swarm(nestA.id).mode === "asleep", 3000), "with the torch off a few seconds it loses you");
ok(await waitFor(() => swarm(nestA.id).mode === "asleep", 20000), "…and goes home to its nest and sleeps");
const back = swarm(nestA.id);
ok(Math.hypot(back.x - nestA.x, back.y - nestA.y) < 0.7, "…on the nest it left");

console.log("-- its speed");
parkAll();
const runner = mkUser("porter");
const sr = enterHotel(runner);
br.setImmortal(runner.id, true);
// wake it from close, then step away so it has to fly
place(sr, A.at);
lit(sr, true);
await waitFor(() => swarm(nestA.id).mode === "hunting", 1500);
let best = 0;
for (let k = 0; k < 12; k++) {
  const far = spotNear(nestA, 9, 14);
  if (!far) break;
  const w0 = swarm(nestA.id);
  place(sr, far);
  await sleep(500);
  const w1 = swarm(nestA.id);
  const v = Math.hypot(w1.x - w0.x, w1.y - w0.y) / 0.5;
  if (Math.hypot(w1.x - sr.x, w1.y - sr.y) > 1.5) best = Math.max(best, v);
  place(sr, A.at);
  await sleep(400);
}
ok(best > 1.6 && best < 2.85, `it flies faster than a walk (1.6) and slower than a sprint (2.85): ${best.toFixed(2)} cells/s`);

console.log("-- out of sight");
place(sr, A.at);
lit(sr, true);
await waitFor(() => swarm(nestA.id).mode === "hunting", 2000);
// far away, torch still lit, no line from the swarm
let hidden = null;
for (let i = 0; i < SIZE * SIZE && !hidden; i++) {
  const x = i % SIZE, y = Math.floor(i / SIZE);
  if (!walkable(x, y) || fromDoor[i] < 0 || typeAt(x, y) === "landing" || typeAt(x, y) === "beverly") continue;
  const d = Math.hypot(x - nestA.x, y - nestA.y);
  if (d > 30 && d < 60 && !los(x + 0.5, y + 0.5, nestA.x, nestA.y)) hidden = { x: x + 0.5, y: y + 0.5 };
}
place(sr, hidden);
ok(await waitFor(() => swarm(nestA.id).mode !== "hunting", 3500), "with no line to you for a few seconds, it loses you — lit torch or not");
await waitFor(() => swarm(nestA.id).mode === "asleep", 25000);

console.log("-- the Service Stair");
parkAll();
const guest = mkUser("guest");
const sg = enterHotel(guest);
place(sg, { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 });
lit(sg, true);
br.summonMoths(guest.id);
await sleep(1500);
const intoStair = seen.some((p) => typeAt(p.x, p.y) === "landing");
ok(!intoStair && swarms().every((w) => w.mode !== "hunting" || !br.sessions.get(guest.id)), "nothing on the Service Stair is ever hunted, and no swarm sets a wing in it");

console.log("-- a flyer");
const flyer = mkUser("inspector");
const sf = enterHotel(flyer);
sf.fly = true;
lit(sf, true);
place(sf, B.at);
await sleep(1500);
ok(swarm(B.nst.id).mode === "asleep", "a flyer's torch wakes nothing");
sf.fly = false;
lit(sf, false);
place(sf, { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 });

console.log("-- the Beverly Room");
// the nest nearest the ballroom by walking, and the walk from it
const bevCells = [];
for (let i = 0; i < SIZE * SIZE; i++) if (!sec.solid[i] && typeAt(i % SIZE, Math.floor(i / SIZE)) === "beverly") bevCells.push({ x: i % SIZE, y: Math.floor(i / SIZE) });
const toBev = distanceMap(sec, bevCells);
const nearBev = usable.reduce((a, b) => (toBev[idx(Math.floor(a.at.x), Math.floor(a.at.y))] <= toBev[idx(Math.floor(b.at.x), Math.floor(b.at.y))] ? a : b));
await waitFor(() => swarm(nearBev.nst.id).mode === "asleep", 25000);
const dancer = mkUser("dancer");
const sx = enterHotel(dancer);
br.setImmortal(dancer.id, true);
place(sx, nearBev.at);
lit(sx, true);
await waitFor(() => swarm(nearBev.nst.id).mode === "hunting", 2000);
// lead it there, a step at a time, the swarm on our heels and the torch lit
let led = 0;
for (let t = 0; t < 1200 && swarm(nearBev.nst.id).mode === "hunting"; t++) {
  const cx = Math.floor(sx.x), cy = Math.floor(sx.y);
  const w = swarm(nearBev.nst.id);
  if (Math.hypot(w.x - sx.x, w.y - sx.y) < 2.5 && toBev[idx(cx, cy)] > -1) {
    // one step downhill toward the ballroom (and into it)
    let nx = cx, ny = cy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (!stepAllowed(cx, cy, x, y)) continue;
      if (toBev[idx(x, y)] >= 0 && toBev[idx(x, y)] < toBev[idx(nx, ny)]) { nx = x; ny = y; }
    }
    if (toBev[idx(cx, cy)] === 0) {
      // inside: walk on toward its middle
      const mid = bevCells[Math.floor(bevCells.length / 2)];
      nx = cx + Math.sign(mid.x - cx);
      ny = cy;
      if (!walkable(nx, ny)) { nx = cx; ny = cy + Math.sign(mid.y - cy); }
    }
    sx.x = nx + 0.5;
    sx.y = ny + 0.5;
    led++;
  }
  await sleep(100);
}
ok(swarm(nearBev.nst.id).mode === "circling", `led into the Beverly Room (${led} steps), the swarm goes to the chandelier`);
const hpThere = sx.hp;
const bitesBefore = hurts.filter((h) => h.userId === dancer.id).length;
await sleep(1500);
ok(hurts.filter((h) => h.userId === dancer.id).length === bitesBefore, "…and forgets the torch right there in the room with it");
ok(await waitFor(() => swarm(nearBev.nst.id).mode === "returning" || swarm(nearBev.nst.id).mode === "asleep", 5000), "…then tires of it and goes home");
lit(sx, false);
place(sx, { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 });

console.log("-- the kill");
const victim = mkUser("waiter");
const sv = enterHotel(victim);
await waitFor(() => swarm(nestA.id).mode === "asleep", 25000);
place(sv, A.at);
lit(sv, true);
await waitFor(() => hurts.some((h) => h.userId === victim.id), 8000);
const firstBite = hurts.find((h) => h.userId === victim.id)?.at ?? Date.now();
await waitFor(() => !br.sessions.has(victim.id), 20000, 100);
const death = hurts.find((h) => h.userId === victim.id && h.dead);
const took = ((death?.at ?? Date.now()) - firstBite) / 1000;
ok(death?.cause === "the deathmoths" && took > 7 && took < 14, `about ten seconds in a swarm kills — ${took.toFixed(1)}s, "${death?.cause}"`);

console.log("-- walls");
const bad1 = seen.filter((p) => sec.solid[idx(Math.floor(p.x), Math.floor(p.y))]);
ok(seen.length > 50 && bad1.length === 0, `never on solid stone (${seen.length} positions, ${bad1.length} in a wall)`);
let jumps = 0;
const byId = new Map();
for (const p of seen) {
  const prev = byId.get(p.id);
  if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) {
    const pc = [Math.floor(prev.x), Math.floor(prev.y)], cc = [Math.floor(p.x), Math.floor(p.y)];
    if ((pc[0] !== cc[0] || pc[1] !== cc[1]) && !los(prev.x, prev.y, p.x, p.y)) jumps++;
  }
  byId.set(p.id, p);
}
ok(jumps === 0, `never through a wall between two ticks (${jumps})`);

console.log("-- an empty hotel");
for (const q of [...br.sessions.values()]) if (q.level === 5) br.forfeit(q.userId);
await sleep(600);
ok(swarms().every((w) => w.mode === "asleep") && swarms().every((w) => nests.some((nst) => nst.id === w.id && Math.hypot(w.x - nst.x, w.y - nst.y) < 0.01)), "with nobody in the hotel, every swarm is back asleep on its own nest");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
