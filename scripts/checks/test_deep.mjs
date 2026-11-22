// THE THING BELOW — Thalassophobia's creature (Level 7), in-process against
// the real tick, one assert per agreed behaviour (BACKROOMS.md → "LEVEL 7 —
// THALASSOPHOBIA → THE CREATURE", Josh's call 2026-10-14: "2. A"):
//
//   · something enormous in deep water; it is never seen whole — what you see
//     is the water noticing you, per swimmer;
//   · it notices a swimmer who STAYS in deep water: the Drop (its home)
//     fastest, the sunken plaza slowly, the streets never on their own;
//   · SPLASHING (swimming fast) calls it, even in a street — and AT THE
//     CLIENT'S REAL CADENCE (a move every ~104-117 ms, delivered late) a quiet
//     swim is never taken for one: the plaza and the Drop rise on time, a
//     street never fills, a real sprint in the water still splashes;
//   · it warns three times, in order — the shadow, the circling, the rise —
//     and the swimmer is told each one (net.ts also shows it to anyone near);
//   · still in the water when it rises: dead, "the thing below";
//   · OUT of the water when it rises: it sinks away with nothing, and the
//     swimmer's exposure falls back;
//   · ROOFS ARE SAFE: on dry floor nothing grows and everything falls;
//   · only the swimmer it rose on dies; a flyer is never noticed; leaving the
//     level forgets you;
//   · the operator sees it, under whoever it has noticed or asleep in the Drop;
//   · the admin's J lets it rise on you, only in the water;
//   · AND THE REAL DIALS (read from a child with none set): the Drop strikes in
//     ~25 s; the plaza is slow enough for one quiet helmet dive (48 s) and not
//     for a loiter; a dive done splashing doesn't make it.
//
// CLOCKED, like the other creature harnesses: rerun it ALONE before believing
// a failure.
process.env.BACKROOMS_DIRECTOR = "0";
process.env.BACKROOMS_DEEP_DROP = "0.5";
process.env.BACKROOMS_DEEP_PLAZA = "0.12";
process.env.BACKROOMS_DEEP_SPLASH = "0.45";
process.env.BACKROOMS_DEEP_RISE_MS = "1200";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { distanceMap } = require(dist("backrooms/worldgen.js"));
const { oceanWet, oceanTypeAt } = require(dist("backrooms/worldgen-ocean.js"));
const OV = require(dist("backrooms/ocean-vocab.js"));
const { LEVEL7_FLAG, OCEAN_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "deep-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledT) { console.error("Thalassophobia did not boot"); process.exit(1); }
store.brSetFlag(LEVEL7_FLAG, null, "harness");
store.brSetFlag(OCEAN_OPEN_FLAG, null, "harness");

const T = br.sectorT;
const reach = distanceMap(T, T.doors.map((d) => ({ x: d.x, y: d.y })));
const find = (want) => {
  for (let i = 0; i < T.size * T.size; i++) {
    const x = i % T.size, y = (i / T.size) | 0;
    if (reach[i] > 0 && want(i, x, y)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
};
const dropAt = find((i, x, y) => oceanTypeAt(T, x, y) === "seadrop" && x > 4 && y > 4);
const plazaAt = find((i, x, y) => oceanTypeAt(T, x, y) === "seaplaza");
/** A street with a straight run of four open cells east of it (to swim fast along). */
const streetAt = find((i, x, y) => [0, 1, 2, 3].every((k) => oceanTypeAt(T, x + k, y) === "seacanal" && T.section[i + k] === OV.ZONE_CITY && !T.solid[i + k] && (k === 0 || !T.wallW[i + k])));
const roofAt = find((i, x, y) => !oceanWet(T, x, y) && oceanTypeAt(T, x, y) === "searoof");
ok(!!dropAt && !!plazaAt && !!streetAt && !!roofAt, "the Drop, the plaza, a street and a roof are all on the map");

const events = [];
const deaths = [];
br.onDeep((ev) => events.push({ ...ev, at: Date.now() }));
br.onHurt((ev) => { if (ev.dead) deaths.push(ev); });

let users = 0;
const swimmer = (p) => {
  const u = store.createUser({ username: `sw${++users}`, displayName: `sw${users}`, passwordHash: "x" });
  const suit = store.brForceAddItem(u.id, "suit", "yellow");
  const s = br.enter(u.id, u.username, 0, [suit], 7);
  if (s.error) throw new Error(s.error);
  s.x = p.x;
  s.y = p.y;
  return { u, s };
};
const watch = (uid) => br.debugDeep().swimmers.find((w) => w.userId === uid);
const stagesOf = (uid) => events.filter((e) => e.userId === uid && e.type === "stage").map((e) => e.stage);
/** Hold a body still at p for ms, re-pinning it (nothing else moves it). */
const hold = async (s, p, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    s.x = p.x;
    s.y = p.y;
    await sleep(50);
  }
};
/** Swim fast up and down a straight run from p (3 cells a second). */
const thrash = async (s, p, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = ((Date.now() - t0) / 1000) * 3;
    const leg = t % 6;
    s.x = p.x + (leg < 3 ? leg : 6 - leg);
    s.y = p.y;
    await sleep(30);
  }
};

// ---- WHERE IT NOTICES YOU --------------------------------------------------------------
console.log("-- the Drop, its home: noticed, circled, risen on, taken");
{
  const { u, s } = swimmer(dropAt);
  const near = swimmer(roofAt);
  await hold(s, dropAt, 1_150);
  ok((watch(u.id)?.stage ?? 0) >= 1 && stagesOf(u.id)[0] === 1, "staying in the Drop, the shadow passes under it first (stage 1)");
  // a second swimmer comes in near it for a second, then climbs out
  near.s.x = dropAt.x + 4;
  near.s.y = dropAt.y;
  await hold(s, dropAt, 800);
  near.s.x = roofAt.x;
  near.s.y = roofAt.y;
  await hold(s, dropAt, 2_000);
  const st = stagesOf(u.id);
  ok(st.slice(0, 3).join(",") === "1,2,3", `then it circles, then it rises — the three warnings, in order (${st.join(",")})`);
  const d = deaths.find((x) => x.userId === u.id);
  ok(!!d && d.cause === "the thing below" && !br.sessions.has(u.id), "still in the water when it rises: dead, \"the thing below\"");
  ok(events.some((e) => e.type === "strike" && e.userId === u.id), "…and the strike goes out on its wire");
  ok(!deaths.some((x) => x.userId === near.u.id) && br.sessions.has(near.u.id), "only the swimmer it rose on dies — the one watching nearby lives");
  br.forfeit(near.u.id);
}

console.log("-- out of the water in time");
{
  const { u, s } = swimmer(dropAt);
  while ((watch(u.id)?.stage ?? 0) < 3) await hold(s, dropAt, 60);
  const risingAt = Date.now();
  await hold(s, roofAt, 1_800);
  ok(br.sessions.has(u.id) && !deaths.some((x) => x.userId === u.id), `climbed onto a roof inside the rise (${Date.now() - risingAt} ms), it has nothing to take`);
  const w = watch(u.id);
  ok(events.some((e) => e.type === "calm" && e.userId === u.id && e.at >= risingAt) && w && w.stage < 3 && !w.risingUntil, "…it sinks away, and the swimmer is told so");
  ok(w && w.exposure <= br.debugDeep().dials.missed + 0.05, `…and the exposure falls back (${w?.exposure.toFixed(2)})`);
  await hold(s, roofAt, 1_500);
  ok((watch(u.id)?.exposure ?? 1) < w.exposure, "ROOFS ARE SAFE: on dry floor it keeps falling");
  br.forfeit(u.id);
}

console.log("-- the plaza, the streets and splashing");
{
  const a = swimmer(plazaAt);
  const b = swimmer(dropAt);
  await Promise.all([hold(a.s, plazaAt, 1_000), hold(b.s, dropAt, 1_000)]);
  const ea = watch(a.u.id)?.exposure ?? 0;
  const eb = watch(b.u.id)?.exposure ?? 0;
  ok(ea > 0 && ea < eb / 2, `the plaza is deep enough to be noticed, slowly — ${ea.toFixed(2)} a second against the Drop's ${eb.toFixed(2)}`);
  br.forfeit(b.u.id);
  br.forfeit(a.u.id);
  const c = swimmer(streetAt);
  await hold(c.s, streetAt, 1_500);
  ok((watch(c.u.id)?.exposure ?? 0) === 0 && !stagesOf(c.u.id).length, "a quiet swim in a street: never noticed on its own");
  await thrash(c.s, streetAt, 2_200);
  ok((watch(c.u.id)?.stage ?? 0) >= 1, `SPLASHING calls it, even in a street (stage ${watch(c.u.id)?.stage})`);
  br.forfeit(c.u.id);
}

// ---- AT THE CLIENT'S REAL CADENCE (Nov 2026 polish round) -------------------------------
// The client sends a move only once 100 ms have passed since the last: every
// ~117 ms at 60 Hz, ~104 ms at 144 Hz, delivered late. One 250 ms tick holds
// two or three of them, so a quiet 1.03 swim read 1.25-1.4 on the ticks that
// caught three and was taken for splashing: the plaza rose in ~41 s at 144 Hz
// against the designed 80, the Drop's 25 in ~19. Swum here through the real
// move() on the real clock (this harness's dials are ten times the game's).
console.log("-- at the client's real cadence");
{
  let cseed = 20261101;
  const crand = () => ((cseed = (cseed * 1103515245 + 12345) % 2147483648) / 2147483648);
  /** A client at `hz`'s frames: the motion time each carries and when it
   *  arrives, 20 + U(0, jitter) ms late, in order. */
  const cadence = (hz, jitter, ms) => {
    const out = [];
    const frame = 1000 / hz;
    let last = -1, prevArr = -Infinity;
    for (let f = 1; f * frame < ms; f++) {
      const t = f * frame;
      if (last >= 0 && t - last <= 100) continue;
      const dt = last < 0 ? frame : t - last;
      last = t;
      const arr = Math.max(prevArr, t + 20 + crand() * jitter);
      out.push({ dt, arr });
      prevArr = arr;
    }
    return out;
  };
  /** Swim in place at `speed` to the cadence; ms from the start until `stop()`, or -1. */
  const swim = async (s, speed, hz, jitter, ms, stop) => {
    const t0 = Date.now();
    const cx = Math.floor(s.x) + 0.5;
    let off = 0, dir = 1;
    for (const f of cadence(hz, jitter, ms)) {
      const wait = t0 + f.arr - Date.now();
      if (wait > 0) await sleep(wait);
      const d = (speed * f.dt) / 1000;
      if (Math.abs(off + dir * d) > 0.4) dir = -dir;
      off += dir * d;
      br.move(s.userId, cx + off, s.y, 0);
      if (stop()) return Date.now() - t0;
    }
    return -1;
  };
  const dial = br.debugDeep().dials;
  const risen = (uid) => () => (watch(uid)?.stage ?? 0) >= 3;
  const res = [];
  for (const [hz, j] of [[60, 60], [144, 60]]) {
    const a = swimmer(plazaAt);
    const plazaMs = await swim(a.s, 1.025, hz, j, 15_000, risen(a.u.id));
    br.forfeit(a.u.id);
    const b = swimmer(dropAt);
    const dropMs = await swim(b.s, 1.025, hz, j, 6_000, risen(b.u.id));
    br.forfeit(b.u.id);
    const c = swimmer(plazaAt);
    const sprintMs = await swim(c.s, 1.425, hz, j, 6_000, risen(c.u.id));
    br.forfeit(c.u.id);
    const d = swimmer(streetAt);
    await swim(d.s, 1.025, hz, j, 3_000, () => false);
    const streetE = watch(d.u.id)?.exposure ?? 0;
    br.forfeit(d.u.id);
    res.push({ hz, plazaMs, dropMs, sprintMs, streetE });
  }
  const plazaS = 1000 / dial.plaza, dropS = 1000 / dial.drop, splashS = 1000 / (dial.plaza + dial.splash);
  // never EARLY (the fault rose on them early), and late by no more than the
  // tick that first sees them plus the tick that sees the line crossed
  const within = (ms, want) => ms >= want * 0.95 && ms <= want + 700;
  ok(res.every((r) => within(r.plazaMs, plazaS)),`a quiet swim (1.03) in the plaza rises on time at 60 and 144 Hz — ${res.map((r) => (r.plazaMs / 1000).toFixed(1)).join(" and ")} s against the designed ${(plazaS / 1000).toFixed(1)}`);
  ok(res.every((r) => within(r.dropMs, dropS)),`…and in the Drop — ${res.map((r) => (r.dropMs / 1000).toFixed(1)).join(" and ")} s against ${(dropS / 1000).toFixed(1)}`);
  ok(res.every((r) => r.sprintMs > 0 && r.sprintMs < (splashS + plazaS) / 2), `a real sprint in the water (1.43) still splashes — the plaza in ${res.map((r) => (r.sprintMs / 1000).toFixed(1)).join(" and ")} s (splashing ${(splashS / 1000).toFixed(1)})`);
  ok(res.every((r) => r.streetE === 0), `a quiet swim in a street at the real cadence never fills (${res.map((r) => r.streetE.toFixed(2)).join(", ")})`);
}

console.log("-- the rest of the rules");
{
  const f = swimmer(dropAt);
  f.s.fly = true;
  await hold(f.s, dropAt, 1_200);
  ok((watch(f.u.id)?.exposure ?? 0) === 0 && !stagesOf(f.u.id).length, "a flyer over the Drop is never noticed");
  f.s.fly = false;
  const ov0 = br.operatorView(7).monsters.filter((m) => m.kind === "deep");
  ok(ov0.length === 1 && ov0[0].mode === "asleep", "with nobody noticed, the operator sees it asleep in the Drop");
  await hold(f.s, dropAt, 900);
  const ov1 = br.operatorView(7).monsters.find((m) => m.kind === "deep");
  ok(!!ov1 && ov1.mode !== "asleep" && Math.hypot(ov1.x - f.s.x, ov1.y - f.s.y) < 1, `…and once it has noticed somebody, under them (${ov1?.mode})`);
  f.s.x = T.doors[0].x + 0.5;
  f.s.y = T.doors[0].y + 0.5;
  br.exit(f.u.id);
  await sleep(400);
  ok(!watch(f.u.id), "leaving the level, it forgets you");
  const j = swimmer(roofAt);
  ok(br.summonDeep(j.u.id) === false, "the admin's J does nothing on a roof");
  j.s.x = streetAt.x;
  j.s.y = streetAt.y;
  ok(br.summonDeep(j.u.id) === true && (watch(j.u.id)?.stage ?? 0) === 2, "…and in the water it starts it circling you");
  br.forfeit(j.u.id);
}

// ---- THE REAL DIALS ---------------------------------------------------------------------
console.log("-- the real dials");
{
  const env = { ...process.env };
  for (const k of ["BACKROOMS_DEEP_DROP", "BACKROOMS_DEEP_PLAZA", "BACKROOMS_DEEP_SPLASH", "BACKROOMS_DEEP_RISE_MS"]) delete env[k];
  const db2 = path.join(ROOT, "data", "deep-harness-dials.db");
  const out = execFileSync(process.execPath, ["-e", `
    const { Store } = require(${JSON.stringify(dist("db/store.js"))});
    const { createBackrooms } = require(${JSON.stringify(dist("backrooms/service.js"))});
    const br = createBackrooms(new Store(${JSON.stringify(db2)}));
    process.stdout.write("DIALS" + JSON.stringify(br.debugDeep().dials));
    process.exit(0);
  `], { env, encoding: "utf8" });
  for (const f of [db2, db2 + "-wal", db2 + "-shm"]) { try { rmSync(f); } catch {} }
  const D = JSON.parse(out.slice(out.indexOf("DIALS") + 5));
  const dropS = 1 / D.drop;
  const plazaS = 1 / D.plaza;
  const dive = 2 * ((OV.WATER_LEVEL - OV.PLAZA_FLOOR) * 0.5) / 1.0; // 48 s at 1 m/s
  ok(dropS >= 20 && dropS <= 30, `the Drop rises on you in ${dropS.toFixed(0)} s of staying in it`);
  ok(plazaS > dive + 10 && plazaS < 2 * dive, `the plaza in ${plazaS.toFixed(0)} s: one quiet ${dive} s helmet dive makes it with room to swim in and out, a second loiter doesn't`);
  ok(1 / (D.plaza + D.splash) < dive, `a dive done splashing doesn't (${(1 / (D.plaza + D.splash)).toFixed(0)} s)`);
  ok(D.riseMs >= 2_000 && D.riseMs <= 3_500, `the rise gives you ${D.riseMs / 1000} s to get out — a roof within a few strokes`);
  // the player's own speeds (client controller.ts: WALK 2.05, SPRINT 2.85;
  // swimming scales by 0.5, wading by 0.55): a swim and a wade are quiet, a
  // sprint in the water is a splash
  const C = { swim: 2.05 * 0.5, swimSprint: 2.85 * 0.5, wade: 2.05 * 0.55, wadeSprint: 2.85 * 0.55 };
  ok(C.swim < D.splashSpeed && C.wade < D.splashSpeed && C.swimSprint > D.splashSpeed && C.wadeSprint > D.splashSpeed, `a swim (${C.swim.toFixed(2)}) and a wade (${C.wade.toFixed(2)}) are quiet; sprinting in the water (${C.swimSprint.toFixed(2)}, ${C.wadeSprint.toFixed(2)}) splashes — the line is ${D.splashSpeed}`);
}

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
