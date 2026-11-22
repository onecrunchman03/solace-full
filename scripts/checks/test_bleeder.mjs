// THE BLEEDER — Level 3's creature, driven in-process against the REAL tick.
//
// BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION" (Josh, Oct 2026: "Pale white,
// tall, large teeth, blood soaked, extremely fast, kill on contact. Hates the
// flashlight and will run away after 1 second of being shined on"). THE SHIP
// GATE asks for one assert per agreed behaviour; each block below names its
// line:
//   · it lives in the dark: never out while every section has power, out a
//     breath after one goes dark, and never seen arriving
//   · it never sets foot in a lit section
//   · it screams when it sees you, standing still — the warning
//   · it is extremely fast: it outruns a sprint
//   · touch is death
//   · a sweep of the beam does nothing
//   · a beam HELD for a second sends it off screaming — and spotted at the
//     scream, holding the beam always wins (the fairness rule)
//   · under the beam it staggers
//   · driven off, it stays in the wiring a while, then comes back
//   · the power coming back drives it out
//
// The service is built with a throwaway DB; sessions are hand-made and put
// straight into br.sessions; the clocks are dialled through the env the
// service reads at construction. The one second of the burn is NOT dialled —
// it is the behaviour under test.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

process.env.BACKROOMS_BLEEDER_EMERGE_MIN_MS = "400";
process.env.BACKROOMS_BLEEDER_EMERGE_MAX_MS = "500";
process.env.BACKROOMS_BLEEDER_REST_MS = "2500";
// A LONG scream here: the sweep has to happen while it stands at range (an
// immortal stand-in it has reached is a body it would already have killed,
// and no beam reaches a thing standing on your feet). The fairness test does
// not lean on it — its lineman lights it only once it starts to RUN.
process.env.BACKROOMS_BLEEDER_SCREAM_MS = "4500";
process.env.STATION_CUTOFF_MS = "25000";
// no rolling blackouts and no arcs in the way of the measurements
process.env.STATION_DARK_GAP_MIN_MS = "1000000000";
process.env.STATION_DARK_GAP_MAX_MS = "1000000001";
process.env.STATION_ARC_CYCLE_MS = "1000000000";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable } = require(dist("backrooms/worldgen.js"));
const { SDECO, sdecoKind } = require(dist("backrooms/station-vocab.js"));

const DB = path.join(ROOT, "data", "bleeder-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledS) { console.error("the station did not boot"); process.exit(1); }
const sec = br.sectorS;
const SIZE = sec.size;

// ---- geometry (mirrors of the service's own rules) -------------------------
const idx = (x, y) => y * SIZE + x;
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const eff = (x, y) => (sec.eff ?? sec.floor)[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
  if (!heightPassable(eff(ax, ay), eff(bx, by))) return false;
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
    const cx = Math.floor(x0 + (x1 - x0) * t), cy = Math.floor(y0 + (y1 - y0) * t);
    if (cx !== pcx || cy !== pcy) {
      if (!stepAllowed(pcx, pcy, cx, cy)) return false;
      pcx = cx; pcy = cy;
    }
  }
  return true;
};
const sectionAt = (x, y) => sec.section[idx(Math.floor(x), Math.floor(y))];
const wet = (x, y) => sdecoKind(sec.deco?.[idx(x, y)] ?? 0) === SDECO.puddle;
const powered = () => {
  const p = br.stationState().power;
  return (s) => !!p.find((q) => q.section === s)?.powered;
};

// ---- sessions ---------------------------------------------------------------
let nextId = 500;
const mk = (x, y) => ({
  userId: nextId++, name: "lineman" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now(), revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 3, subSince: null, boatId: null, fall: null,
});
const put = (s) => { br.sessions.set(s.userId, s); return s; };
const faceAt = (s, x, y) => { s.heading = Math.atan2(-(x - s.x), -(y - s.y)); };
const bl = () => br.debugState().bleeder;
const clearAll = async () => { br.sessions.clear(); await sleep(350); };

/** Pull a section's cutoff the way a player does: walk up to it. */
const cut = (section) => {
  const c = br.stationState().cutoffs.find((q) => q.section === section);
  const man = put(mk(c.x, c.y));
  const r = br.pullCutoff(man.userId, section);
  br.sessions.delete(man.userId);
  if ("error" in r) throw new Error("cutoff refused: " + r.error);
};

// THE STAGE: a section, a roomy dry spot in it, and a lit section next door
// across an open edge (for "it never enters the light").
let stage = null;
for (const c of br.stationState().cutoffs) {
  const K = c.section;
  // a dry spot in K with plenty of open dry floor round it
  let best = null, bestOpen = -1;
  for (let y = 2; y < SIZE - 2; y++) for (let x = 2; x < SIZE - 2; x++) {
    if (!walkable(x, y) || wet(x, y) || sec.section[idx(x, y)] !== K) continue;
    let open = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (walkable(x + dx, y + dy) && !wet(x + dx, y + dy) && sec.section[idx(x + dx, y + dy)] === K) open++;
    }
    if (open > bestOpen) { bestOpen = open; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  // an open border: A in K, B (and the cell beyond, C) in another section
  let border = null;
  for (let y = 2; y < SIZE - 2 && !border; y++) for (let x = 2; x < SIZE - 2 && !border; x++) {
    if (!walkable(x, y) || sec.section[idx(x, y)] !== K || wet(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = x + dx, by = y + dy, cx = x + 2 * dx, cy = y + 2 * dy;
      if (!edgeOpen(x, y, bx, by) || !edgeOpen(bx, by, cx, cy)) continue;
      const L = sec.section[idx(bx, by)];
      if (L === K || L === 0 || sec.section[idx(cx, cy)] !== L || wet(bx, by) || wet(cx, cy)) continue;
      border = { a: { x: x + 0.5, y: y + 0.5 }, c: { x: cx + 0.5, y: cy + 0.5 }, L };
      break;
    }
  }
  if (best && border && bestOpen > 60) { stage = { K, spot: best, border }; break; }
}
if (!stage) { console.error("no stage found on S1"); process.exit(1); }
console.log(`stage: section ${stage.K}, spot ${stage.spot.x},${stage.spot.y}; border into section ${stage.border.L}`);

const events = [];
/** Every position it reports, with whether that cell had power at the time. */
const trail = [];
/** Every position it reports, all run (never cleared). */
const everyPos = [];
br.onBleeder((ev) => {
  const at = Date.now();
  events.push({ ...ev, at });
  if (ev.type === "pos") {
    const lit = powered()(sectionAt(ev.x, ev.y));
    trail.push({ x: ev.x, y: ev.y, mode: ev.mode, burn: !!ev.burn, lit, at });
    everyPos.push({ id: 0, x: ev.x, y: ev.y, at });
  }
});
br.startEntity(() => {});

/** Wait for it to be out (any mode in `modes`), or null. */
const waitFor = async (pred, ms = 6000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const b = bl();
    if (pred(b)) return b ?? true;
    await sleep(50);
  }
  return null;
};

const run = async () => {
  // ---- it lives in the dark ----------------------------------------------
  const p = put(mk(stage.spot.x, stage.spot.y));
  await sleep(1500);
  ok(bl() === null, "every section powered: it never comes out");

  cut(stage.K);
  await sleep(150);
  ok(bl() === null, "the dark comes first — it does not arrive with the lights going out");
  const out = await waitFor((b) => !!b, 4000);
  ok(!!out, "a section goes dark with somebody in it: it comes out");
  if (out) {
    const first = events.find((e) => e.type === "pos");
    ok(first && !los(p.x, p.y, first.x, first.y), "it is never seen arriving (out of the wiring round a corner)");
    ok(first && !powered()(sectionAt(first.x, first.y)), "it arrives in the dark section");
  }

  // ---- the scream, then the charge, then touch ---------------------------
  // Stand still in the open with no light. It has to see you, scream (and
  // stand for it), then come — faster than a sprint — and touch is death.
  events.length = 0;
  trail.length = 0;
  const screamed = await waitFor((b) => b && b.mode === "scream", 20000);
  ok(!!screamed, "it sees you: it screams first");
  if (!screamed) console.log("    (wire:", events.map((e) => e.type + (e.mode ? ":" + e.mode : "")).filter((x, i, a) => x !== a[i - 1]).join(" "), "| lit steps:", trail.filter((t) => t.lit).length, ")");
  let screamStill = true;
  if (screamed) {
    const at = { x: screamed.x, y: screamed.y };
    for (let i = 0; i < 4; i++) {
      await sleep(100);
      const b = bl();
      if (b && b.mode === "scream" && Math.hypot(b.x - at.x, b.y - at.y) > 0.05) screamStill = false;
    }
  }
  ok(screamStill, "it stands still for the scream (the warning)");
  ok(events.some((e) => e.type === "scream" && e.targetId === p.userId), "the scream is told to the wire, named for its target");
  const victim = p.userId;
  const killed = await waitFor(() => !br.sessions.has(victim), 10000);
  ok(!!killed, "touch is death: it reaches a body that does not fight back");
  ok(events.some((e) => e.type === "kill" && e.userId === victim), "the kill is told to the wire");
  // its speed in the charge, from its own reported positions (not burning)
  const chase = trail.filter((t) => t.mode === "chase" && !t.burn);
  let dist = 0, time = 0;
  for (let i = 1; i < chase.length; i++) {
    const dt = chase[i].at - chase[i - 1].at;
    if (dt > 250) continue;
    dist += Math.hypot(chase[i].x - chase[i - 1].x, chase[i].y - chase[i - 1].y);
    time += dt;
  }
  const speed = time ? dist / (time / 1000) : 0;
  ok(speed > 2.85 * 1.3, `extremely fast: it outruns a sprint (${speed.toFixed(2)} cells/s against 2.85)`);
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB);
    const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ?").get(victim);
    ok(row?.cause === "the bleeder", `the death is written as the bleeder's (${row?.cause})`);
    db.close();
  }

  // ---- a sweep does nothing ----------------------------------------------
  // An immortal lineman with a lit torch, swinging it across the thing and
  // away again, never holding it a full second.
  // Staging, not behaviour: a scream is a moment, so a run that missed it
  // (it came round a corner already close, and the scream window passed
  // between two polls) is set up again rather than failed.
  let sw = null;
  let came = null;
  for (let attempt = 0; attempt < 3 && !came; attempt++) {
    await clearAll();
    cut(stage.K);
    sw = put(mk(stage.spot.x, stage.spot.y));
    br.setImmortal(sw.userId, true);
    // the torch comes on only once it is coming (a stray beam on arrival
    // would drive it off before there is anything to sweep)
    came = await waitFor((b) => b && b.mode === "scream", 20000);
  }
  ok(!!came, "staged it screaming at range for the sweep");
  sw.equip = "flashlight!";
  let retreatedOnSweep = false;
  for (let i = 0; i < 8; i++) {
    const b = bl();
    if (!b) break;
    if (b.mode === "retreat") retreatedOnSweep = true;
    if (i % 2 === 0) faceAt(sw, b.x, b.y);
    else faceAt(sw, sw.x - (b.x - sw.x), sw.y - (b.y - sw.y)); // away
    await sleep(i % 2 === 0 ? 350 : 400);
    if (bl()?.mode === "retreat") retreatedOnSweep = true;
  }
  ok(!retreatedOnSweep, "a sweep of the beam does nothing");

  // ---- a held second sends it off; under the beam it staggers --------------
  await sleep(450); // whatever the sweep left on it cools off first
  trail.length = 0;
  events.length = 0;
  const heldFrom = Date.now();
  let fled = null;
  // Watch for the retreat CRY, not the mode: its first fleeing stride often
  // takes it round a corner out of sight, and out of sight it is gone the
  // same tick — the mode can come and go between two polls.
  while (Date.now() - heldFrom < 3500) {
    const cry = events.find((e) => e.type === "retreat");
    if (cry) { fled = cry.at - heldFrom; break; }
    const b = bl();
    if (!b) break;
    faceAt(sw, b.x, b.y);
    await sleep(40);
  }
  ok(fled !== null && fled >= 900 && fled <= 1700, `a beam held for a second sends it running (${fled}ms)`);
  ok(events.some((e) => e.type === "retreat"), "it shrieks as it goes (the retreat cry on the wire)");
  const burning = trail.filter((t) => t.burn && t.mode !== "retreat");
  let maxStep = 0;
  for (let i = 1; i < burning.length; i++) {
    if (burning[i].at - burning[i - 1].at > 150) continue;
    maxStep = Math.max(maxStep, Math.hypot(burning[i].x - burning[i - 1].x, burning[i].y - burning[i - 1].y));
  }
  ok(burning.length > 3 && maxStep < 2.85 * 0.1, `under the beam it staggers — slower than a walk (${(maxStep * 10).toFixed(2)} cells/s at most)`);
  const gone = await waitFor((b) => b === null, 8000);
  ok(!!gone, "driven off, it goes back into the wiring");
  await sleep(1200);
  ok(bl() === null, "and it stays there a while, though the section is still dark");
  cut(stage.K);
  const back = await waitFor((b) => !!b, 6000);
  ok(!!back, "then it comes back");

  // ---- fairness: the held beam wins against the charge ---------------------
  // A MORTAL lineman this time, who wastes the whole scream and only turns
  // the light on it the moment it starts to RUN — and then holds it.
  let wins = 0, tries = 0;
  for (let round = 0; round < 3; round++) {
    await clearAll();
    cut(stage.K);
    const f = put(mk(stage.spot.x, stage.spot.y));
    const s = await waitFor((b) => b && b.mode === "chase", 20000);
    if (!s) continue;
    tries++;
    f.equip = "flashlight!";
    const t0 = Date.now();
    let outcome = "";
    while (Date.now() - t0 < 4000) {
      if (!br.sessions.has(f.userId)) { outcome = "dead"; break; }
      const b = bl();
      if (!b || b.mode === "retreat") { outcome = "won"; break; }
      faceAt(f, b.x, b.y);
      await sleep(40);
    }
    if (outcome === "won") wins++;
  }
  ok(tries >= 2 && wins === tries, `even lit only once it starts to run, a held beam always wins (${wins} of ${tries})`);

  // ---- it never sets foot in the light ------------------------------------
  // Lure it to the border, then step across into a lit section and stand.
  await clearAll();
  cut(stage.K);
  const lure = put(mk(stage.border.a.x, stage.border.a.y));
  br.setImmortal(lure.userId, true);
  await waitFor((b) => b && (b.mode === "scream" || b.mode === "chase"), 20000);
  trail.length = 0;
  events.length = 0;
  lure.x = stage.border.c.x;
  lure.y = stage.border.c.y;
  br.setImmortal(lure.userId, false);
  await sleep(3500);
  const screams = events.filter((e) => e.type === "scream").length;
  ok(screams <= 1, `seeing someone it cannot reach, it does not scream over and over (${screams} screams in 3.5s)`);
  ok(br.sessions.has(lure.userId), "a body standing in a lit section is out of its reach");
  const intoLight = trail.filter((t) => t.lit && t.mode !== "retreat");
  ok(trail.length > 0 && intoLight.length === 0, `it never sets foot in a powered section (${intoLight.length} lit steps of ${trail.length})`);

  // ---- the power coming back drives it out ---------------------------------
  await clearAll();
  cut(stage.K);
  const w = put(mk(stage.spot.x, stage.spot.y));
  br.setImmortal(w.userId, true);
  const up = await waitFor((b) => !!b, 6000);
  ok(!!up, "staged it out for the power test");
  // the cutoff (25s here) runs out on its own
  const relit = await waitFor(() => powered()(stage.K), 30000);
  ok(!!relit, "the section's power comes back by itself");
  trail.length = 0;
  const left = await waitFor((b) => b === null || b.mode === "retreat", 1500);
  ok(!!left, "the light comes back: it withdraws at once");
  // ...and it MOVES: a retreat that stands running in place in the light was
  // the Oct 2026 audit's worst find
  await sleep(1200);
  const flight = trail.filter((t) => t.mode === "retreat");
  let moved = 0;
  for (let i = 1; i < flight.length; i++) moved += Math.hypot(flight[i].x - flight[i - 1].x, flight[i].y - flight[i - 1].y);
  ok(bl() === null || moved > 1.5, `it does not freeze in the light — it runs (${moved.toFixed(1)} cells, or gone)`);
  const vanished = await waitFor((b) => b === null, 8000);
  ok(!!vanished, "and is gone back into the wiring");

  // ---- touch is death for a BYSTANDER too (Nov 2026) ------------------------
  // Charging one body, it kills another it runs into in the dark — not only
  // the one it screamed at.
  {
    await clearAll();
    cut(stage.K);
    const m2 = put(mk(stage.spot.x, stage.spot.y));
    br.setImmortal(m2.userId, true);
    const charging = await waitFor((b) => !!b && b.mode === "chase", 30000);
    let died = false;
    if (charging) {
      // in its path: a short step from it, towards the body it is charging
      const b = bl();
      const g = Math.hypot(m2.x - b.x, m2.y - b.y) || 1;
      const step = Math.min(0.8, g / 2);
      const by = put(mk(b.x + ((m2.x - b.x) / g) * step, b.y + ((m2.y - b.y) / g) * step));
      for (let i = 0; i < 40 && !died; i++) {
        await sleep(50);
        died = !br.sessions.has(by.userId);
      }
    }
    ok(!!charging && died, "charging one body, a bystander it runs into in the dark dies at its touch too");
    br.setImmortal(m2.userId, false);
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
  console.log(`\ntest_bleeder: ${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
