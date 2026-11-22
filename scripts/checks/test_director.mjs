// THE RULES DIRECTOR (Josh, Oct 2026; src/backrooms/director.ts).
//
// Run:  npm run build && node scripts/checks/test_director.mjs
//
// The decisions are pure and clocked by the caller, so most of this drives
// directorStep minute by minute with a fake clock and a seeded random:
// tension rising on a chase, a hunt, a wound, the dark and being alone, and
// falling when nothing happens; the phases (build → peak → relax → build);
// and the budgets — nothing while anyone is chased or in a brownout, nothing
// before the level has been quiet a while, at least a minute between events,
// the lure only on a very calm level and at most every five minutes, and a
// hastened brownout never sooner than its floor. Then the service: a real
// Level 0 with an injected player, the director's tick applying a flicker as
// a NON-black brownout, a quiet pushing the next brownout back, and the
// state the admin reads. THE ONE RULE is checked from both ends: no action
// the director takes is a black brownout or a hunt.
process.env.BACKROOMS_DIRECTOR = "0"; // the harness drives the ticks itself

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const dist = (p) => path.join(ROOT, "dist", p);
const { DIRECTOR, directorStep, newDirector } = require(dist("backrooms/director.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const T0 = 1_800_000_000_000;
const calm = (id = 1, hp = 100) => ({ id, hp, chased: false, hunted: false, alone: false });
const input = (now, players, extra = {}) => ({
  now, players, dark: false, brownout: false, nextBrownoutAt: now + 10 * 60_000, stalkerShadowing: true, ...extra,
});
/** Run the director for `secs` seconds with a fixed input shape. */
function run(st, from, secs, mk) {
  const acts = [];
  for (let s = 0; s < secs; s++) {
    const now = from + s * 1000;
    for (const a of directorStep(st, mk(now), rand)) acts.push({ ...a, at: now });
  }
  return acts;
}

console.log("THE RULES DIRECTOR — the decisions");
{
  const st = newDirector(T0);
  run(st, T0, 10, (now) => input(now, [{ ...calm(), chased: true }]));
  const chasedT = st.tension.get(1);
  ok(chasedT >= 70 && chasedT <= 90, `ten seconds of being chased raises tension to ~80 (${Math.round(chasedT)})`);
  ok(st.phase === "peak", "…and puts the level in a PEAK");
  const quietActs = run(st, T0 + 10_000, 60, (now) => input(now, [calm()]));
  ok(st.phase === "relax", "once the chase ends and tension falls, the level RELAXES");
  ok(quietActs.some((a) => a.kind === "quiet"), "…and the director calls a QUIET as it does");
  const q = quietActs.find((a) => a.kind === "quiet");
  ok(!!q && q.until - q.at === DIRECTOR.QUIET_MS, "…pushing the Stalker and the next brownout back a minute");
  const relaxActs = run(st, T0 + 70_000, 60, (now) => input(now, [calm()]));
  ok(st.phase === "relax", "…and the relax holds its full minute and a half");
  ok(!relaxActs.some((a) => a.kind !== "quiet"), "nothing new is spent while the level relaxes");
}
{
  const st = newDirector(T0);
  run(st, T0, 1, (now) => input(now, [{ ...calm(), hp: 100 }]));
  run(st, T0 + 1000, 1, (now) => input(now, [{ ...calm(), hp: 66 }]));
  ok(Math.round(st.tension.get(1)) === Math.round(34 * DIRECTOR.HURT_PER_HP), "a 34-point wound adds 34 × 0.8 tension");
  const t1 = st.tension.get(1);
  run(st, T0 + 2000, 10, (now) => input(now, [calm(1, 66)]));
  ok(Math.abs(st.tension.get(1) - (t1 - 10 * DIRECTOR.DECAY_PER_S)) < 0.01, "…and it decays 1.2 a second when nothing happens");
  const t2 = st.tension.get(1);
  run(st, T0 + 12_000, 10, (now) => input(now, [calm(1, 66)], { dark: true, brownout: true }));
  ok(st.tension.get(1) > t2, "the dark raises it");
}
{
  // BUILD: a calm level gets nothing until it has been quiet a while.
  const st = newDirector(T0);
  const early = run(st, T0, 80, (now) => input(now, [calm()]));
  ok(early.length === 0, "a calm level gets nothing in its first 80 quiet seconds");
  const later = run(st, T0 + 80_000, 30, (now) => input(now, [calm()]));
  ok(later.length === 1 && ["flicker", "mimic", "hasten"].includes(later[0].kind), `…then one event once it has been quiet ${DIRECTOR.QUIET_BEFORE_EVENT_MS / 1000}s (${later[0]?.kind})`);
  const gap = run(st, T0 + 110_000, 55, (now) => input(now, [calm()]));
  ok(gap.length === 0, "…and nothing more for at least a minute");
  const hour = run(st, T0 + 165_000, 3600, (now) => input(now, [calm()]));
  const gaps = hour.map((a, i) => (i ? a.at - hour[i - 1].at : Infinity));
  ok(hour.length > 5 && gaps.every((g) => g >= DIRECTOR.EVENT_GAP_MS), `an hour of calm: ${hour.length} events, never two inside a minute`);
  const lures = hour.filter((a) => a.kind === "lure");
  ok(lures.every((a, i) => i === 0 || a.at - lures[i - 1].at >= DIRECTOR.LURE_GAP_MS), `…the lure at most every five minutes (${lures.length})`);
  ok(hour.every((a) => a.kind !== "flicker" || (a.ms >= DIRECTOR.FLICKER_MIN_MS && a.ms <= DIRECTOR.FLICKER_MIN_MS + DIRECTOR.FLICKER_SPAN_MS)), "every flicker is 6-10 seconds");
}
{
  const st = newDirector(T0);
  const busy = run(st, T0, 400, (now) => input(now, [{ ...calm(), chased: now % 20_000 < 1000 }]));
  ok(!busy.some((a) => a.kind !== "quiet"), "a level where someone keeps getting chased gets no new events");
  const st2 = newDirector(T0);
  const dark = run(st2, T0, 400, (now) => input(now, [calm()], { brownout: true }));
  ok(dark.length === 0, "…and nothing is spent during a brownout");
  const st3 = newDirector(T0);
  const empty = run(st3, T0, 400, (now) => input(now, []));
  ok(empty.length === 0, "an empty level gets nothing");
}
{
  // The hasten floor and the lure's gate.
  const st = newDirector(T0);
  const acts = run(st, T0, 7200, (now) => input(now, [calm()], { nextBrownoutAt: now + 40_000 }));
  ok(!acts.some((a) => a.kind === "hasten"), "a brownout already under a minute away is never hastened");
  const st2 = newDirector(T0);
  const acts2 = run(st2, T0, 7200, (now) => input(now, [calm()], { nextBrownoutAt: T0 + 7200_000 }));
  ok(acts2.filter((a) => a.kind === "hasten").every((a) => a.to - a.at >= DIRECTOR.HASTEN_FLOOR_MS), "a hastened brownout is never sooner than 30 seconds out");
  const st3 = newDirector(T0);
  const tense = run(st3, T0, 7200, (now) => input(now, [{ ...calm(), alone: true }]));
  ok(!tense.some((a) => a.kind === "lure") || tense.filter((a) => a.kind === "lure").length <= 7200_000 / DIRECTOR.LURE_GAP_MS, "the lure stays rare even for a lone player");
  const st4 = newDirector(T0);
  const noStalker = run(st4, T0, 3600, (now) => input(now, [calm()], { stalkerShadowing: false }));
  ok(!noStalker.some((a) => a.kind === "mimic"), "no mimic when the Stalker isn't shadowing");
}

console.log("THE RULES DIRECTOR — in the service");
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const DB = path.join(ROOT, "data", "director-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f, { force: true }); } catch {} }
const store = new Store(DB);
const br = createBackrooms(store);
const s = { userId: 9001, name: "walker", x: 90.5, y: 90.5, heading: 0, door: 0, enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [], relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity, lostAt: null, fly: false, level: 0, subSince: null, boatId: null, fall: null, equip: undefined };
br.sessions.set(s.userId, s);
br.setImmortal(s.userId, true);
const fired = [];
br.onBrownout((ms, black) => fired.push({ ms, black }));
const now0 = Date.now();
let acts = [];
for (let i = 0; i < 600 && !acts.some((a) => a.kind === "flicker"); i++) acts = acts.concat(br.directorTick(now0 + i * 1000));
const state = br.directorState();
ok(state.tension.length === 1 && state.tension[0].id === 9001, "the director tracks the player on Level 0");
ok(state.log.length > 0, "…and keeps a log the admin can read");
const flick = fired.find((f) => !f.black);
ok(!acts.some((a) => a.kind === "flicker") || (!!flick && flick.ms >= 6000 && flick.ms <= 10000), "a flicker reaches the level as a NON-black brownout of 6-10 seconds");
ok(fired.every((f) => !f.black), "THE ONE RULE: nothing the director did was a black brownout");
ok(acts.every((a) => ["flicker", "mimic", "hasten", "lure", "quiet"].includes(a.kind)), "…and every action is on the menu");
br.sessions.delete(s.userId);
ok(br.directorTick(now0 + 700_000).length === 0, "an empty Level 0 gets nothing");

store.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f, { force: true }); } catch {} }
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
