// SURVIVORZ, GLENRIDGE HALL: THE SHOW'S RULES (src/survivorz/sim/scenarios/glenridge.ts; GLENRIDGE.md, "Josh's
// design"), in-process on game code alone. Run after `npm run build`.
//   node scripts/survivorz/glenridge/test-show.mjs
// The start (out in the rain, the door open, five windows broken, the dead round the house and in it); the doors'
// rules (a bolted door, a boarded window, the hearth stone); the lights; a save mid-show; and whole shows: every one
// ends survived or wiped, none throws, and the hour is neither a stroll nor a slaughter. THE OBJECTIVE IS THE CLOCK
// (Josh, Nov 17 2026): survive until the show's time is up.
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dist = (p) => path.join(ROOT, "dist", "survivorz", p);
const { SimWorld } = require(dist("sim/world.js"));
const { encodeGraph, decodeGraph } = require(dist("sim/save.js"));
const { GLEN } = require(dist("sim/scenarios/glenridge.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL", m); } };
const T0 = 1_800_000_000_000;
const mk = (seed, extra = {}) => new SimWorld({ map: "glenridge", seed, start: T0, ...extra });
const run = (w, ms) => { for (let t = 0; t < ms && !w.obj.ending; t += 100) w.tick(100); };
const out = (w, room) => room >= 0 && !!w.nav.rooms[room].outdoor;

// ---- the start ----------------------------------------------------------------------------------------------------
{
  const w = mk(11), nav = w.nav;
  ok(w.survivors.length === 6 && w.survivors.every((s) => out(w, s.room)), `six start out of doors (${w.survivors.map((s) => nav.rooms[s.room].id).join(", ")})`);
  const far = w.survivors.every((s) => w.zombies.every((z) => Math.hypot(z.x - s.x, z.z - s.z) >= 12));
  ok(far, "none of the dead within 12 m of anybody at the start");
  const outside = w.zombies.filter((z) => out(w, z.room)).length, inside = w.zombies.length - outside;
  ok(w.zombies.length === 25 && outside >= 12 && inside >= 9, `the dead are round the house and in it (${outside} in the grounds, ${inside} inside)`);
  const cell = w.zombies.find((z) => nav.rooms[z.room].id === "cellar-cell");
  ok(!!cell && cell.hp > 150, `the one in the cell is stronger than the rest (${cell?.hp} hp)`);
  ok(w.fac.doors.get(GLEN.front).open && !w.fac.bolted.has(GLEN.front), "the front door stands open");
  ok(GLEN.windows.every((id) => w.fac.doors.get(id)?.open), "five windows are broken");
  ok(!w.fac.doors.get(GLEN.stone).open, "the hearth stone is shut");
  ok(w.map.lockedDoors.length >= 8 && w.map.lockedDoors.every((id) => { const d = w.fac.doors.get(id); return d && d.locked && !d.open; }), `the house's other outside doors are locked (${w.map.lockedDoors.length})`);
  const s = w.survivors[0], hidden = GLEN.hidden.map((id) => nav.roomIdx.get(id));
  ok(hidden.every((r) => (s.know.room[r] & 1) === 0) && (s.know.room[nav.roomIdx.get("great-hall")] & 1) === 1, "nobody knows of the rooms under the hearth");
  ok(w.isDark(s) && w.scn.dark(w, nav.roomIdx.get("forecourt")) && !w.scn.dark(w, nav.roomIdx.get("great-hall")), "it is night out of doors and the lamps are lit inside");
  const g = w.snapshot().goals;
  ok(Array.isArray(g.rows) && g.rows.length === 4 && g.rows[0].id === "survive" && g.rows.every((r) => r.label && r.done === 0) && g.insideLabel && g.endsAt - g.startedAt === w.showMs, `the overlay gets the clock first, then the house's three defences, and when the show ends (${g.rows?.map((r) => r.id).join(", ")})`);

  // ---- the doors' rules ----
  const z = w.zombies.find((x) => out(w, x.room)), zg = w.zombieGate(z), sg = w.survivorGate(s);
  const di = (id) => nav.doorIdx.get(id);
  ok(zg(di("dining-window")) === 1 && sg(di("dining-window")) === 0, "the dead climb through a broken window; the living never do");
  w.fac.board("dining-window");
  ok(zg(di("dining-window")) === 0 && !w.fac.doors.get("dining-window").open, "boarded, nothing comes through it");
  ok(zg(di(GLEN.front)) === 1, "the dead walk in at the open front door");
  w.fac.bolt(GLEN.front);
  for (let i = 0; i < 60; i++) w.fac.hit(z.actor, GLEN.front, "forecourt", 10);
  ok(zg(di(GLEN.front)) === 0 && !w.fac.doors.get(GLEN.front).open && w.fac.canPass(s.actor, GLEN.front).ok, "bolted, it is a WALL to the dead (not something to beat on all night: nothing ever breaks it), and the living can still draw the bolt");
  w.fac.open(s.actor, GLEN.front, "vestibule");
  ok(!w.fac.bolted.has(GLEN.front) && zg(di(GLEN.front)) === 1, "opened again, it is no longer bolted");
  ok(zg(di("garden-door")) !== 1 && !w.fac.canPass(s.actor, "garden-door").ok, "a locked outside door passes nobody");
}

// ---- a save mid-show comes back the same show --------------------------------------------------------------------
{
  // (a seed whose show is still going at eight minutes: seed 5 is wiped at seven, and a show that ends has no frames to compare)
  const a = mk(6); run(a, 6 * 60_000);
  let same = false, err = "";
  try {
    const b = mk(999); b.loadState(decodeGraph(encodeGraph(a.saveState())));
    const fa = [], fb = [];
    a.onFrame((f) => fa.push(JSON.stringify(f))); b.onFrame((f) => fb.push(JSON.stringify(f)));
    run(a, 2 * 60_000); run(b, 2 * 60_000);
    same = fa.length === fb.length && fa.length > 1000 && fa.every((x, i) => x === fb[i]) && JSON.stringify(a.sc) === JSON.stringify(b.sc) && [...a.fac.bolted].join() === [...b.fac.bolted].join();
  } catch (e) { err = e.stack ?? e.message; }
  ok(same, `a save six minutes in, loaded into a fresh world, plays the same two minutes frame for frame, bolt and boards included${err ? " (" + err.split("\n")[0] + ")" : ""}`);
}

// ---- whole shows ---------------------------------------------------------------------------------------------------
{
  const N = 14; const ends = {}; let threw = 0, bolted = 0, lived5 = 0, dark = 0, deaths = 0, timedRight = 0; const wipes = [];
  for (let seed = 1; seed <= N; seed++) {
    const w = mk(seed);
    try { run(w, 61 * 60_000); } catch (e) { threw++; console.log(`  seed ${seed} threw: ${(e.stack ?? e.message).split("\n").slice(0, 2).join(" | ")}`); continue; }
    const g = w.sc, o = w.obj;
    ends[o.ending || "running"] = (ends[o.ending || "running"] ?? 0) + 1;
    deaths += w.survivors.filter((s) => !s.alive).length;
    if (o.ending === "wiped") wipes.push((o.endedAt - T0) / 60000);
    // (survived exactly when the clock ran out, and with the ones still alive named)
    if (o.ending === "survived" && Math.abs(o.endedAt - (w.startedAt + w.showMs)) <= 1000 && o.rescued.length === w.survivors.filter((x) => x.alive && !x.turned).length && o.rescued.length > 0) timedRight++;
    const alive5 = o.ending !== "wiped" || o.endedAt - T0 > 5 * 60_000;
    if (alive5) { lived5++; if (g.boltedAt) bolted++; }
    if (g.darkAt && (g.darkAt <= g.darkDue + 1000) ) dark++;
  }
  ok(threw === 0, `${N} whole shows, none throws`);
  ok(Object.keys(ends).every((k) => ["survived", "wiped"].includes(k)) && Object.values(ends).reduce((a, b) => a + b, 0) === N, `every show ends survived or wiped: ${JSON.stringify(ends)}`);
  ok(timedRight === (ends.survived ?? 0), `a survived show ends on the clock and names everybody alive (${timedRight} of ${ends.survived ?? 0})`);
  ok(bolted >= lived5 - 1, `where anybody lives five minutes, the front door gets bolted (${bolted} of ${lived5})`);
  // (WHAT FOURTEEN SHOWS CAN TELL: a stroll or a slaughter, nothing finer. How hard the hour is, is argued on 160 shows
  // a setting (soak.mjs; the numbers are in GLENRIDGE.md), not here.)
  const got = ends.survived ?? 0;
  ok(got >= 3 && got <= 13, `the hour is neither a stroll nor a slaughter: ${got} of ${N} survive (3 to 13; the dials are in GLEN and are argued on the 160-show soak)`);
  ok(deaths / N >= 0.5 && deaths / N <= 5.5, `people die: ${(deaths / N).toFixed(1)} of six a show on average`);
  ok(dark >= Math.ceil(N / 2), `the lights go out when they are due: ${dark} of ${N} shows reached it`);
  wipes.sort((a, b) => a - b);
  console.log(`  survived ${got} of ${N}; wipes at ${wipes.map((x) => x.toFixed(0)).join(", ")} min; lights went out in ${dark} shows`);
}
console.log(`\n${fail ? "RED" : "GREEN"}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
