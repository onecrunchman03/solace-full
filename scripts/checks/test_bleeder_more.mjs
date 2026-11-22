// THE BLEEDER, the rest of its rules — what test_bleeder doesn't pin, found
// by the Oct 2026 law 2 audit (BACKROOMS.md → "THE BLEEDER, BUILT"):
//   · it SEARCHES at 2.6 cells/s — just under a sprint — until it sees you
//   · after a kill it FEEDS: it stands over the body 3s, then hunts on
//   · ADMIN J SUMMONS it round the nearest corner, light or not — and a
//     FLYING admin is not prey, so it goes straight back into the wiring
//   · driven off by the beam it stays in the wiring its REAL rest (35s — the
//     game's own number, not test_bleeder's dial), then comes back
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

process.env.BACKROOMS_BLEEDER_EMERGE_MIN_MS = "400";
process.env.BACKROOMS_BLEEDER_EMERGE_MAX_MS = "500";
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

const DB = path.join(ROOT, "data", "bleeder-more-harness.db");
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
  // ---- 1. THE SEARCH, THE KILL, THE FEED ------------------------------------------
  console.log("-- it searches just under a sprint, kills, and feeds");
  // the mark stands out of its sight at first, round a corner, so it has to SEARCH
  const p = put(mk(stage.spot.x, stage.spot.y));
  // a second body in the same dark, well away — what it hunts on to after feeding
  let second = null;
  for (let y = 2; y < SIZE - 2 && !second; y++) for (let x = 2; x < SIZE - 2 && !second; x++) {
    if (!walkable(x, y) || wet(x, y) || sec.section[idx(x, y)] !== stage.K) continue;
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 12 || los(p.x, p.y, x + 0.5, y + 0.5)) continue;
    second = { x: x + 0.5, y: y + 0.5 };
  }
  cut(stage.K);
  const out = await waitFor((b) => !!b, 8000);
  ok(!!out, "(staging) the section goes dark and it comes out");
  const victim = p.userId;
  const killed = await waitFor(() => !br.sessions.has(victim), 30000);
  ok(!!killed, "(staging) it finds and kills the mark");
  // its search pace, off its own reported positions while hunting, not burning
  const hunt = trail.filter((t) => t.mode === "hunt" && !t.burn);
  const steps = [];
  for (let i = 1; i < hunt.length; i++) {
    const dt = hunt[i].at - hunt[i - 1].at;
    if (dt < 60 || dt > 160) continue;
    steps.push(Math.hypot(hunt[i].x - hunt[i - 1].x, hunt[i].y - hunt[i - 1].y) / (dt / 1000));
  }
  steps.sort((a, b) => a - b);
  const fastest = steps.length ? steps[Math.floor(steps.length * 0.95)] : 0;
  ok(steps.length >= 5 && fastest <= 2.6 * 1.1 && fastest < 2.85, `searching, it moves at ~2.6 — under a sprint (${steps.length} steps, 95th percentile ${fastest.toFixed(2)} cells/s)`);
  // THE FEED
  const fedAt = await waitFor((b) => b && b.mode === "feed", 1000);
  ok(!!fedAt, "after the kill it feeds");
  let still = true;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    await sleep(100);
    const b = bl();
    if (b && b.mode === "feed" && fedAt && Math.hypot(b.x - fedAt.x, b.y - fedAt.y) > 0.1) still = false;
  }
  ok(still, "…standing over the body");
  if (second) put(mk(second.x, second.y));
  const onward = await waitFor((b) => b && b.mode !== "feed", 3000);
  const fedFor = onward ? (Date.now() - t0) / 1000 : 0;
  ok(!!onward && fedFor >= 2.5 && fedFor <= 4.5, `…for about three seconds, then it hunts on (${onward ? fedFor.toFixed(1) + "s" : "still feeding"})`);
  await clearAll();

  // ---- 2. THE SUMMON --------------------------------------------------------------
  console.log("-- admin J summons it round the nearest corner, light or not");
  // stand somewhere LIT (another section, never cut)
  const litSection = stage.border.L;
  const lit = put(mk(stage.border.c.x, stage.border.c.y));
  await sleep(300);
  ok(powered()(litSection), "(staging) the summoner stands in a powered section");
  const r1 = br.summonBleeder(lit.userId);
  const s1 = await waitFor((b) => !!b, 1000);
  ok(r1 && !!s1, "the summon brings it out even in the light");
  ok(!!s1 && !los(lit.x, lit.y, s1.x, s1.y) && Math.hypot(s1.x - lit.x, s1.y - lit.y) <= 19, `…round a corner, near (${s1 ? Math.hypot(s1.x - lit.x, s1.y - lit.y).toFixed(1) + " cells, out of sight" : "not out"})`);
  await clearAll();
  await waitFor((b) => b === null, 5000);
  // a flying admin is not prey
  const flyer = put(mk(stage.border.c.x, stage.border.c.y));
  flyer.fly = true;
  const r2 = br.summonBleeder(flyer.userId);
  let goneBack = r2 === false;
  for (let i = 0; i < 40 && !goneBack; i++) { await sleep(100); goneBack = bl() === null; }
  ok(goneBack, "summoned by a flying admin, it goes straight back into the wiring");
  await clearAll();

  // ---- 3. THE REAL REST --------------------------------------------------------------
  console.log("-- driven off, it rests in the wiring its real 35 seconds");
  // the cut from section 1 has run out by now; cut it again with a lineman
  // standing in the dark, torch in hand
  await sleep(26000);
  const man = put(mk(stage.spot.x, stage.spot.y));
  br.setImmortal(man.userId, true);
  man.equip = "flashlight!";
  cut(stage.K);
  let beam = false;
  const aim = setInterval(() => {
    const b = bl();
    if (!b) return;
    if (beam) faceAt(man, b.x, b.y);
    else faceAt(man, man.x * 2 - b.x, man.y * 2 - b.y);
  }, 50);
  // (the flying admin's summon sent it into its rest a moment ago, so it may
  // be up to 35s before it comes — keep the section dark while waiting)
  let seen = null;
  for (const until = Date.now() + 60000; Date.now() < until && !seen; ) {
    if (powered()(stage.K)) { try { cut(stage.K); } catch {} }
    seen = await waitFor((b) => b && (b.mode === "scream" || b.mode === "chase") && Math.hypot(b.x - man.x, b.y - man.y) <= 15 && los(man.x, man.y, b.x, b.y), 2000);
  }
  ok(!!seen, "(staging) it comes for the lineman in the dark");
  beam = true;
  // Watch for the RETREAT EVENT, not the mode: a retreating Bleeder vanishes
  // the moment nobody can see it, and that check runs in the same tick that
  // starts the retreat — so when its first step out breaks the line, the
  // mode is "retreat" for zero time and a 50ms poll never sees it. The event
  // fires either way (it failed two runs in three on the mode, Oct 2026).
  const sinceBeam = events.length;
  let fled = false;
  for (const until = Date.now() + 3000; Date.now() < until && !fled; ) {
    fled = events.slice(sinceBeam).some((e) => e.type === "retreat");
    if (!fled) await sleep(50);
  }
  ok(!!fled, "a held beam drives it off");
  beam = false;
  const goneAt0 = await waitFor((b) => b === null, 8000);
  const goneAt = Date.now();
  ok(!!goneAt0, "…back into the wiring");
  // re-cut the section so the dark outlasts the rest (the cutoff's own window
  // is 25s here; the rest is 35)
  let backAt = 0;
  while (Date.now() - goneAt < 50000 && !backAt) {
    await sleep(200);
    if (powered()(stage.K)) { try { cut(stage.K); } catch {} }
    if (bl()) backAt = Date.now();
  }
  const rested = backAt ? (backAt - goneAt) / 1000 : 0;
  ok(backAt > 0 && rested >= 33, `it stays there its real rest, though the lineman stands in the dark (${backAt ? rested.toFixed(1) + "s" : "never came back"} — the rest is 35s)`);
  ok(backAt > 0 && rested <= 45, "…and then it comes back");
  clearInterval(aim);

  console.log(`\n${n - bad}/${n} asserts passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
