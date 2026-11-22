// THE HEAT — Level 5, the Terror Hotel's Boiler Room, in-process against the
// real service with its clock dialled up (BACKROOMS.md → "LEVEL 5 — TERROR
// HOTEL → THE HEAT"). One assert per agreed behaviour:
//
//   · in the Main Hall it never climbs;
//   · below stairs it does, and FASTER the further from the Boiler Room's
//     door you stand;
//   · back in the Main Hall it falls;
//   · at the top of the gauge it costs health, and kills — "the heat";
//   · an open furnace's mouth burns — "a furnace";
//   · ALMOND WATER cools you, below stairs;
//   · a player is told their OWN heat and nobody else's;
//   · a flyer (the admin's camera) is never heated.
//
// CLOCKED, like the creature harnesses: rerun it ALONE before believing a
// failure.
process.env.BACKROOMS_HEAT_TICK_MS = "100";
process.env.BACKROOMS_HEAT_RISE_MIN = "6";
process.env.BACKROOMS_HEAT_RISE_MAX = "36";
process.env.BACKROOMS_HEAT_COOL = "40";
process.env.BACKROOMS_DIRECTOR = "0";

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
const { ZONE_BOILER, HDECO, hdecoKind, hdecoVar } = require(dist("backrooms/hotel-vocab.js"));
const { LEVEL5_FLAG, HOTEL_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "hotel-heat-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledH) { console.error("the hotel did not boot"); process.exit(1); }
const sec = br.sectorH;
const SIZE = sec.size;
store.brSetFlag(LEVEL5_FLAG, null, "harness");
store.brSetFlag(HOTEL_OPEN_FLAG, null, "harness");

// ---- what the heard frames say
const heard = new Map();
br.onHeat((ev) => { const l = heard.get(ev.userId) ?? []; l.push(ev.heat); heard.set(ev.userId, l); });
const hurts = [];
br.onHurt((ev) => hurts.push(ev));

// ---- the geometry: the line, and how deep each boiler cell is from it
const idx = (x, y) => y * SIZE + x;
const below = (x, y) => sec.section[idx(x, y)] === ZONE_BOILER;
const seeds = [];
for (let y = 1; y < SIZE - 1; y++)
  for (let x = 1; x < SIZE - 1; x++) {
    const i = idx(x, y);
    if (!below(x, y) || sec.solid[i]) continue;
    if ([i - SIZE, i + SIZE, i - 1, i + 1].some((j) => !sec.solid[j] && sec.section[j] && sec.section[j] !== ZONE_BOILER)) seeds.push({ x, y });
  }
const depth = distanceMap(sec, seeds);
const fromDoor = distanceMap(sec, sec.doors.map((d) => ({ x: d.x, y: d.y })));
const furnaceMouth = new Set();
for (let i = 0; i < SIZE * SIZE; i++) {
  if (hdecoKind(sec.deco[i]) !== HDECO.furnace) continue;
  furnaceMouth.add(i);
  const o = hdecoVar(sec.deco[i]) & 3;
  const x = i % SIZE, y = Math.floor(i / SIZE);
  furnaceMouth.add(idx(x - [0, 1, 0, -1][o], y - [-1, 0, 1, 0][o]));
}
// a boiler cell near the line, one deep in, and a Main Hall cell — none at a furnace
let shallow = null, deep = null, hall = null;
let dmax = 0;
for (let i = 0; i < SIZE * SIZE; i++) if (below(i % SIZE, Math.floor(i / SIZE)) && depth[i] > dmax) dmax = depth[i];
for (let i = 0; i < SIZE * SIZE; i++) {
  const x = i % SIZE, y = Math.floor(i / SIZE);
  if (sec.solid[i] || furnaceMouth.has(i) || fromDoor[i] < 0) continue;
  if (below(x, y)) {
    if (!shallow && depth[i] >= 2 && depth[i] <= 4) shallow = { x: x + 0.5, y: y + 0.5 };
    if (!deep && depth[i] >= dmax * 0.9) deep = { x: x + 0.5, y: y + 0.5 };
  } else if (!hall && sec.section[i] && fromDoor[i] > 20) hall = { x: x + 0.5, y: y + 0.5 };
}
const mouthCell = [...furnaceMouth].find((i) => !sec.solid[i] && fromDoor[i] >= 0);
const mouth = mouthCell !== undefined ? { x: (mouthCell % SIZE) + 0.5, y: Math.floor(mouthCell / SIZE) + 0.5 } : null;
ok(!!shallow && !!deep && !!hall && !!mouth, `the hotel has a Main Hall, a shallow and a deep Boiler Room cell, and a furnace mouth (depth ${dmax})`);

// ---- the players
const mkUser = (u) => store.createUser({ username: u, displayName: u, passwordHash: "x" });
const enterHotel = (u) => {
  store.brForceAddItem(u.id, "suit", "yellow");
  const r = br.enter(u.id, u.username, 0, store.brLockerItems(u.id).map((i) => i.id), 5);
  if (r.error) throw new Error(`${u.username}: ${r.error}`);
  return r;
};
const place = (s, p) => { s.x = p.x; s.y = p.y; };

console.log("-- the Main Hall");
const a = mkUser("stoker");
const sa = enterHotel(a);
place(sa, hall);
await sleep(600);
ok((sa.heat ?? 0) === 0, `in the Main Hall the heat never climbs (${(sa.heat ?? 0).toFixed(1)})`);

console.log("-- below stairs");
const b = mkUser("fireman");
const sb = enterHotel(b);
place(sa, shallow);
place(sb, deep);
await sleep(1000);
const ha = sa.heat ?? 0, hb = sb.heat ?? 0;
ok(ha > 2, `below stairs it climbs (${ha.toFixed(1)} near the door)`);
ok(hb > ha * 1.8, `…and faster the further in (${hb.toFixed(1)} deep, against ${ha.toFixed(1)} near the door)`);
ok((heard.get(a.id) ?? []).length > 0 && (heard.get(b.id) ?? []).length > 0, "each player is told their own heat as it moves");
ok(Math.abs((heard.get(b.id) ?? [0]).at(-1) - Math.round(hb)) <= 2 && Math.abs((heard.get(a.id) ?? [0]).at(-1) - Math.round(ha)) <= 2, "…their own number, not anybody else's");

console.log("-- back upstairs");
place(sb, hall);
const before = sb.heat;
await sleep(800);
ok(sb.heat < before - 10, `in the Main Hall it falls (${before.toFixed(1)} → ${sb.heat.toFixed(1)})`);

console.log("-- the almond water");
store.brForceAddItem(a.id, "almondwater", null);
const water = store.brLockerItems(a.id).find((i) => i.kind === "almondwater");
sa.inventory.push(water);
place(sa, deep);
await sleep(1500);
const hot = sa.heat;
const drank = br.consumeItem(a.id, water.id);
ok(!drank.error && sa.heat <= hot - 40, `a swig of almond water cools you below stairs (${hot.toFixed(0)} → ${sa.heat.toFixed(0)})`);

console.log("-- the top of the gauge");
place(sa, deep);
const hp0 = sa.hp;
await sleep(3500);
ok(sa.heat >= 99.5 || !br.sessions.has(a.id), `left deep below stairs, the gauge tops out (${(sa.heat ?? 0).toFixed(0)})`);
ok(!br.sessions.has(a.id) || sa.hp < hp0, `…and at the top it costs health (${hp0} → ${br.sessions.has(a.id) ? sa.hp.toFixed(0) : "dead"})`);
for (let t = 0; t < 400 && br.sessions.has(a.id); t++) await sleep(100);
const heatDeath = hurts.find((h) => h.userId === a.id && h.dead);
ok(!br.sessions.has(a.id) && heatDeath?.cause === "the heat", `…and stayed there, it kills — "${heatDeath?.cause}"`);

console.log("-- a furnace");
const c = mkUser("tender");
const sc = enterHotel(c);
place(sc, mouth);
await sleep(600);
ok((sc.heat ?? 0) > 10 && sc.hp < 100, `at an open furnace's mouth the heat jumps and it burns (${(sc.heat ?? 0).toFixed(0)}, hp ${sc.hp.toFixed(0)})`);
for (let t = 0; t < 200 && br.sessions.has(c.id); t++) await sleep(100);
const burnDeath = hurts.find((h) => h.userId === c.id && h.dead);
ok(burnDeath?.cause === "a furnace", `…stand there and it kills — "${burnDeath?.cause}"`);

console.log("-- the flycam");
const d = mkUser("inspector");
const sd = enterHotel(d);
sd.fly = true;
place(sd, deep);
await sleep(800);
ok((sd.heat ?? 0) === 0, "a flyer is never heated");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
