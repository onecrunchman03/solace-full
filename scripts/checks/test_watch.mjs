// THE NEIGHBORHOOD WATCH — the Suburbs' creature (Level 9), in-process against
// the real tick, one assert per agreed behaviour (BACKROOMS.md → "LEVEL 9 —
// THE SUBURBS → THE CREATURE", Josh's pick 2026-10-30: "Go with your picks",
// 2A):
//
//   · none on an empty level; it arrives when somebody comes up — far off and
//     out of every line, in its own ground; one more past six bodies;
//   · ITS GROUND IS THE DARK OUTDOORS: every place it is ever reported is
//     outdoors, out of every pool of light and out of the manhole's cul-de-sac;
//   · IT SEES: a body outdoors in its line within sixteen cells and it hunts;
//     not past sixteen, not through a wall, not a body indoors, not a body in
//     the cul-de-sac;
//   · hunting it is FASTER THAN A WALK and SLOWER THAN A SPRINT;
//   · touch, outdoors in the dark: death, "the neighborhood watch";
//   · THE LIGHT IS SAFETY: a body in a pool is seen but out of reach — it
//     stands at the edge, never steps in, gives up and leaves them be;
//   · A HOUSE HIDES YOU: go in while it hunts you and it walks to the doorway,
//     KNOCKS, and only then reaches in — inside its reach at the open doorway
//     you are taken; deeper in you live and it gives up; step back out into
//     the dark and it has you;
//   · out of its sight a while it looks where it last saw you and gives up;
//   · never after a flyer; the admin's J sends it, only in the dark outdoors;
//     the streets emptied, it goes.
//
// CLOCKED, like the other creature harnesses: rerun it ALONE before believing
// a failure.
process.env.BACKROOMS_DIRECTOR = "0";
process.env.BACKROOMS_WATCH_LOSE_MS = "3000";
process.env.BACKROOMS_WATCH_EDGE_MS = "3000";
process.env.BACKROOMS_WATCH_DOOR_MS = "3500";
process.env.BACKROOMS_WATCH_KNOCK_MS = "1500";
process.env.BACKROOMS_WATCH_SPARE_MS = "6000";

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
const { suburbIndoor, suburbSafe, suburbLitMap } = require(dist("backrooms/worldgen-suburb.js"));
const { ZONE_OUT } = require(dist("backrooms/suburb-vocab.js"));
const { SUBURBS_OPEN_FLAG } = require(dist("backrooms/lore.js"));

const DB = path.join(ROOT, "data", "watch-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const br = createBackrooms(store);
if (!br.enabledU) { console.error("the Suburbs did not boot"); process.exit(1); }
br.startEntity(() => {});
store.brSetFlag(SUBURBS_OPEN_FLAG, null, "harness");
const sec = br.sectorU;
const SIZE = sec.size;
const idx = (x, y) => y * SIZE + x;
const D = br.debugWatch().dials;
const LIT = suburbLitMap(sec);

// ---- the service's own wall rule, mirrored (a line of sight)
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)];
const edgeOpen = (ax, ay, bx, by) => {
  if (!walkable(bx, by)) return false;
  if (Math.abs(sec.floor[idx(ax, ay)] - sec.floor[idx(bx, by)]) > 1) return false;
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
const out = (x, y) => sec.section[idx(Math.floor(x), Math.floor(y))] === ZONE_OUT;
const lit = (x, y) => LIT[idx(Math.floor(x), Math.floor(y))] === 1;
const safe = (x, y) => suburbSafe(sec, Math.floor(x), Math.floor(y));
const inside = (x, y) => suburbIndoor(sec, Math.floor(x), Math.floor(y));
/** Its ground: outdoors, in the dark, not the cul-de-sac. */
const dark = (x, y) => out(x, y) && !lit(x, y) && !safe(x, y);

// ---- every position the Watch ever reports, its knocks and its kills
const seen = [];
const kills = [];
const knocks = [];
br.onWatch((ev) => {
  if (ev.type === "pos") seen.push({ ...ev, at: Date.now() });
  else if (ev.type === "kill") kills.push({ ...ev, at: Date.now() });
  else if (ev.type === "knock") knocks.push({ ...ev, at: Date.now() });
});
const Wt = () => br.debugWatch().watchers[0];
const dbCause = async (uid) => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT cause FROM backrooms_deaths WHERE userId = ? ORDER BY id DESC").get(uid);
  db.close();
  return row?.cause;
};

// ---- staging
const fromDoor = distanceMap(sec, sec.doors.map((d) => ({ x: d.x, y: d.y })));
const reach = (x, y) => fromDoor[idx(x, y)] >= 0;
const ground = [];
for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) if (walkable(x, y) && reach(x, y) && dark(x, y)) ground.push({ x, y });
const kinds = {
  dark: (x, y) => dark(x + 0.5, y + 0.5),
  lit: (x, y) => out(x + 0.5, y + 0.5) && lit(x + 0.5, y + 0.5) && !safe(x + 0.5, y + 0.5),
  indoor: (x, y) => inside(x + 0.5, y + 0.5),
  safe: (x, y) => safe(x + 0.5, y + 0.5),
};
let at = 0;
/** A Watch cell in its ground and a body cell `d` (± 0.35) off, in line or
 *  not, the body's cell of the kind asked. */
const stage = (d, { line = true, kind = "dark", from = ground } = {}) => {
  for (let k = 0; k < from.length; k++) {
    const c = from[(at + k * 53) % from.length];
    const r = Math.ceil(d + 1);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!walkable(x, y) || !reach(x, y) || !kinds[kind](x, y)) continue;
        if (Math.abs(Math.hypot(dx, dy) - d) > 0.35) continue;
        if (los(c.x + 0.5, c.y + 0.5, x + 0.5, y + 0.5) !== line) continue;
        at += 11;
        return { c: { x: c.x + 0.5, y: c.y + 0.5 }, p: { x: x + 0.5, y: y + 0.5 } };
      }
  }
  return null;
};
/** A house doorway: the dark outdoor cell at it, the indoor cell just inside
 *  it, an indoor cell deep in (out of reach of every doorway) and a Watch cell
 *  in its ground `d` off, in line with the doorway. */
const doorways = [];
for (const g of ground)
  for (const [ox, oy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const x = g.x + ox, y = g.y + oy;
    if (walkable(x, y) && inside(x + 0.5, y + 0.5) && stepAllowed(g.x, g.y, x, y)) doorways.push({ o: g, i: { x, y } });
  }
const isDoorCell = (x, y) => doorways.some((dw) => dw.o.x === x && dw.o.y === y);
const stageDoor = (d) => {
  for (let k = 0; k < doorways.length; k++) {
    const dw = doorways[(at + k * 17) % doorways.length];
    // deep: indoors, far (in steps and in a straight line) from every doorway
    let deep = null;
    for (let r = 3; r <= 7 && !deep; r++)
      for (let dy = -r; dy <= r && !deep; dy++)
        for (let dx = -r; dx <= r && !deep; dx++) {
          const x = dw.i.x + dx, y = dw.i.y + dy;
          if (!walkable(x, y) || !inside(x + 0.5, y + 0.5) || !reach(x, y)) continue;
          let near = false;
          for (let qy = y - 4; qy <= y + 4 && !near; qy++) for (let qx = x - 4; qx <= x + 4 && !near; qx++) if (isDoorCell(qx, qy) && Math.hypot(qx - x, qy - y) < 3.2) near = true;
          if (!near) deep = { x: x + 0.5, y: y + 0.5 };
        }
    if (!deep) continue;
    const r = Math.ceil(d + 1);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const cx = dw.o.x + dx, cy = dw.o.y + dy;
        if (!walkable(cx, cy) || !dark(cx + 0.5, cy + 0.5) || Math.abs(Math.hypot(dx, dy) - d) > 0.35) continue;
        if (!los(cx + 0.5, cy + 0.5, dw.o.x + 0.5, dw.o.y + 0.5)) continue;
        at += 7;
        return { c: { x: cx + 0.5, y: cy + 0.5 }, o: { x: dw.o.x + 0.5, y: dw.o.y + 0.5 }, i: { x: dw.i.x + 0.5, y: dw.i.y + 0.5 }, deep };
      }
  }
  return null;
};

const mkUser = (u, admin = false) => store.createUser({ username: u, displayName: u, passwordHash: "x", ...(admin ? { isAdmin: true } : {}) });
const enterU = (u) => {
  store.brForceAddItem(u.id, "suit", "yellow");
  const r = br.enter(u.id, u.username, 0, store.brLockerItems(u.id).map((i) => i.id), 9);
  if (r.error) throw new Error(`${u.username}: ${r.error}`);
  return r;
};
const manhole = { x: sec.doors[0].x + 0.5, y: sec.doors[0].y + 0.5 };
const place = (s, p) => { s.x = p.x; s.y = p.y; s.lastMoveAt = Date.now(); };
const park = (p) => br.debugParkWatch(p.x, p.y);
const mode = () => Wt()?.mode;
const hunting = () => mode() === "hunt";
const waitFor = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const tick = () => sleep(250);
const calm = async (s) => { place(s, manhole); br.debugParkWatch(Wt().x, Wt().y); await tick(); };
const alive = (u) => !!br.sessions.get(u.id) && !br.sessions.get(u.id).lostAt;

ok(ground.length > 3000, `${ground.length} cells of dark outdoors to stage in, ${doorways.length} house doorways`);
ok(D.hunt > 2.05 && D.hunt < 2.85 && D.sight === 16, `its dials: hunts at ${D.hunt} cells/s, sees ${D.sight} cells`);

// ---- ARRIVAL ----------------------------------------------------------------------------
console.log("-- it arrives when somebody comes up");
ok(br.debugWatch().watchers.length === 0, "an empty street has no Watch on it");
const scout = mkUser("scout");
const ss = enterU(scout);
await waitFor(() => br.debugWatch().watchers.length === 1, 1500);
const a0 = Wt();
ok(!!a0 && Math.hypot(a0.x - ss.x, a0.y - ss.y) >= 18 && !los(a0.x, a0.y, ss.x, ss.y), `it arrives far off and out of sight (${a0 ? Math.hypot(a0.x - ss.x, a0.y - ss.y).toFixed(0) : "-"} cells, no line)`);
ok(!!a0 && dark(a0.x, a0.y), "…in its own ground: outdoors, in the dark");
ok(br.operatorView(9).monsters.some((m) => m.kind === "watch"), "the operator sees it on the map");

// ---- WHAT IT SEES ---------------------------------------------------------------------------
console.log("-- what it sees");
let st = stage(10);
park(st.c); place(ss, st.p);
await tick(); await tick();
ok(hunting() && Wt().targetId === scout.id, "a body standing still outdoors in the dark, ten cells off in its line: it hunts");
await calm(ss);
st = stage(20);
park(st.c); place(ss, st.p);
await sleep(900);
ok(!hunting(), "the same at twenty cells: not seen");
st = stage(6, { line: false });
park(st.c); place(ss, st.p);
await sleep(900);
ok(!hunting(), "six cells off with a wall between: not seen");
st = stage(4, { kind: "indoor", line: false }) ?? stage(4, { kind: "indoor", line: true });
park(st.c); place(ss, st.p);
await sleep(900);
ok(!hunting(), "a body indoors four cells off: not seen");
const safeCells = [];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (walkable(x, y) && safe(x + 0.5, y + 0.5)) safeCells.push({ x, y });
let sc = null;
for (const s0 of safeCells) {
  for (const g of ground) {
    const d = Math.hypot(g.x - s0.x, g.y - s0.y);
    if (d < 4 || d > 12 || !los(g.x + 0.5, g.y + 0.5, s0.x + 0.5, s0.y + 0.5)) continue;
    sc = { c: { x: g.x + 0.5, y: g.y + 0.5 }, p: { x: s0.x + 0.5, y: s0.y + 0.5 } };
    break;
  }
  if (sc) break;
}
ok(!!sc, "a dark street in line with the manhole's cul-de-sac");
if (sc) {
  park(sc.c); place(ss, sc.p);
  await sleep(900);
  ok(!hunting(), "a body in the manhole's cul-de-sac, in plain sight: never hunted");
}

// ---- THE TOUCH, AND HOW FAST ---------------------------------------------------------------
console.log("-- the hunt and the touch");
await calm(ss);
const victim = mkUser("victim");
const vs = enterU(victim);
st = stage(14);
park(st.c); place(vs, st.p);
const k0 = kills.length;
const t0 = Date.now();
await waitFor(() => kills.length > k0 || !alive(victim), 9000);
const hunted = seen.filter((p) => p.at >= t0 + 400 && p.mode === "hunt");
let vHunt = 0;
if (hunted.length >= 3) {
  let d = 0;
  for (let i = 1; i < hunted.length; i++) d += Math.hypot(hunted[i].x - hunted[i - 1].x, hunted[i].y - hunted[i - 1].y);
  vHunt = d / ((hunted[hunted.length - 1].at - hunted[0].at) / 1000);
}
ok(vHunt > 2.05 && vHunt < 2.85, `hunting down the street it goes ${vHunt.toFixed(2)} cells/s — faster than a walk (2.05), slower than a sprint (2.85)`);
ok(kills.slice(k0).some((e) => e.userId === victim.id), "it reached the body standing in the dark: taken");
ok((await dbCause(victim.id)) === "the neighborhood watch", "…the death is written as \"the neighborhood watch\"");

// ---- THE LIGHT IS SAFETY --------------------------------------------------------------------
console.log("-- the light");
const lamper = mkUser("lamper");
const ls = enterU(lamper);
await calm(ss);
st = stage(6, { kind: "lit" });
ok(!!st, "a pool of light with a dark street running up to it");
park(st.c); place(ls, st.p);
await tick(); await tick();
const sawEdge = await waitFor(() => mode() === "edge", 3000);
ok(sawEdge, "a body standing in a pool of light is seen — it comes to the light's edge");
const e0 = Date.now();
await waitFor(() => mode() === "patrol", D.edgeMs + 3000);
const atEdge = seen.filter((p) => p.at >= e0 - 2000);
ok(alive(lamper) && atEdge.every((p) => !lit(p.x, p.y)), `it stood at the edge and never stepped in (${atEdge.length} positions, none lit); they live`);
ok(mode() === "patrol" && Date.now() - e0 >= D.edgeMs - 1500, `…then gave up and walked off (${((Date.now() - e0) / 1000).toFixed(1)}s at the edge)`);
// spared: step straight out into the dark beside it, in its line
const darkNear = (() => {
  const w = Wt();
  for (const g of ground) {
    const d = Math.hypot(g.x + 0.5 - w.x, g.y + 0.5 - w.y);
    if (d >= 3 && d <= 6 && los(w.x, w.y, g.x + 0.5, g.y + 0.5)) return { x: g.x + 0.5, y: g.y + 0.5 };
  }
  return null;
})();
if (darkNear) place(ls, darkNear);
await sleep(1200);
ok(!!darkNear && !hunting() && alive(lamper), "…and leaves them be a while after, even stepping out into the dark in front of it");
br.forfeit(lamper.id);

// ---- A HOUSE HIDES YOU ---------------------------------------------------------------------
console.log("-- a house");
ok(doorways.length > 200, `${doorways.length} doorways into houses and garages`);
const knockSince = (t) => knocks.filter((k) => k.at >= t);
// (a) just inside the open door: it knocks, then reaches in
const reacher = mkUser("reacher");
const rs = enterU(reacher);
await calm(ss);
let sd = stageDoor(6);
ok(!!sd, "a house doorway with a dark street in front of it and room deep inside");
park(sd.c); place(rs, sd.o);
await tick(); await tick();
ok(hunting() && Wt().targetId === reacher.id, "hunted at its front door");
place(rs, sd.i);
let kt = Date.now();
await waitFor(() => mode() === "door", 1500);
ok(mode() === "door", "stepping inside, it comes to the doorway");
const kk0 = kills.length;
await waitFor(() => kills.length > kk0 || !alive(reacher), 8000);
const knock1 = knockSince(kt)[0];
const kill1 = kills.slice(kk0).find((e) => e.userId === reacher.id);
ok(!!knock1 && !!kill1 && kill1.at > knock1.at, "it KNOCKS before it reaches in");
// …at THIS house's door: the doorway it knocks at opens onto the indoor floor
// the body is standing on, never the house next door's (Nov 2026 — it used to
// take the nearest doorway in a straight line, through walls)
{
  const hx = Math.floor(sd.i.x), hy = Math.floor(sd.i.y); // staged spots are cell centres
  const house = new Set([`${hx},${hy}`]);
  const q = [[hx, hy]];
  for (let k = 0; k < q.length && k < 1500; k++) {
    const [x, y] = q[k];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (house.has(`${nx},${ny}`) || !walkable(nx, ny) || !inside(nx + 0.5, ny + 0.5) || !stepAllowed(x, y, nx, ny)) continue;
      house.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  const kx = knock1 ? Math.floor(knock1.x) : -1;
  const ky = knock1 ? Math.floor(knock1.y) : -1;
  // the doors of THIS house: outdoor cells with an open edge onto its floor
  const doors = doorways.filter((dw) => house.has(`${dw.i.x},${dw.i.y}`)).map((dw) => dw.o);
  const near = knock1 ? Math.min(...doors.map((o) => Math.hypot(o.x + 0.5 - knock1.x, o.y + 0.5 - knock1.y))) : Infinity;
  ok(near <= 0.75, `…at the door of the house the body is in (knocked at ${kx},${ky}; ${near.toFixed(2)} from its nearest door of ${doors.length}; house ${house.size} cells)`);
}
ok(!!knock1 && !!kill1 && kill1.at - knock1.at >= D.knockMs - 300, `…and it is a while before it does (${knock1 && kill1 ? kill1.at - knock1.at : "-"}ms of knocking)`);
ok(!!kill1, "just inside the open door, within its reach: taken");
// (b) step back out while it knocks
const stepper = mkUser("stepper");
const ps = enterU(stepper);
await calm(ss);
sd = stageDoor(6);
park(sd.c); place(ps, sd.o);
await tick(); await tick();
place(ps, sd.deep);
kt = Date.now();
await waitFor(() => knockSince(kt).length > 0, 6000);
ok(knockSince(kt).length > 0 && alive(stepper), "deep inside: it walks to the door and knocks");
const kk1 = kills.length;
place(ps, sd.o);
await waitFor(() => kills.length > kk1 || !alive(stepper), 3000);
ok(kills.slice(kk1).some((e) => e.userId === stepper.id), "…step back out into the dark and it has you");
// (c) stay deep inside: it gives up
const hider = mkUser("hider");
const hs = enterU(hider);
await calm(ss);
sd = stageDoor(6);
park(sd.c); place(hs, sd.o);
await tick(); await tick();
place(hs, sd.deep);
kt = Date.now();
await waitFor(() => knockSince(kt).length > 0, 6000);
await waitFor(() => mode() === "patrol", D.knockMs + D.doorMs + 4000);
ok(alive(hider) && mode() === "patrol" && knockSince(kt).length >= 1, `deep inside and staying put: it knocked (${knockSince(kt).length}×), waited, gave up — they live`);
ok(seen.every((p) => dark(p.x, p.y)), `in ${seen.length} reported positions it never once stood indoors, in the light or in the cul-de-sac`);
br.forfeit(hider.id);

// ---- OUT OF SIGHT ---------------------------------------------------------------------------
console.log("-- out of sight");
const ghost = mkUser("ghost");
const gs = enterU(ghost);
await calm(ss);
st = stage(8);
park(st.c); place(gs, st.p);
await tick(); await tick();
ok(hunting(), "seen in the dark, it comes");
// away round a corner, far, out of every line
const away = ground.find((g) => Math.hypot(g.x + 0.5 - st.p.x, g.y + 0.5 - st.p.y) > 30 && !los(g.x + 0.5, g.y + 0.5, Wt().x, Wt().y));
place(gs, { x: away.x + 0.5, y: away.y + 0.5 });
const g0 = Date.now();
await waitFor(() => mode() === "patrol", 12000);
const closest = Math.min(...seen.filter((p) => p.at >= g0).map((p) => Math.hypot(p.x - gs.x, p.y - gs.y)));
ok(mode() === "patrol" && alive(ghost) && closest > 10, `out of its sight it looked where it last saw them and gave up (${((Date.now() - g0) / 1000).toFixed(1)}s, never nearer than ${closest.toFixed(0)} cells)`);
br.forfeit(ghost.id);

// ---- COUNT, FLYERS, THE ADMIN ---------------------------------------------------------------
console.log("-- how many, flyers, the admin");
place(ss, manhole);
const more = [];
for (let k = 0; k < 6; k++) more.push(enterU(mkUser(`walker${k}`)));
for (const q of more) place(q, manhole);
await waitFor(() => br.debugWatch().watchers.length === 2, 2000);
ok(br.debugWatch().watchers.length === 2, "with seven bodies up here, two of them");
for (const q of more) br.forfeit(q.userId);
await waitFor(() => br.debugWatch().watchers.length === 1, 2000);
ok(br.debugWatch().watchers.length === 1, "…back to one when they go");
const admin = mkUser("operator", true);
const as = enterU(admin);
place(ss, manhole);
place(as, manhole);
await tick();
as.fly = true;
st = stage(6);
park(st.c); place(as, st.p);
await sleep(900);
ok(!hunting(), "a flyer in the dark in its line is never hunted");
as.fly = false;
const litSpot = stage(5, { kind: "lit" });
place(as, litSpot.p);
ok(br.summonWatch(admin.id) === false, "the admin's J in a pool of light does nothing");
st = stage(6);
place(as, st.p);
ok(br.summonWatch(admin.id) === true && hunting() && Wt().targetId === admin.id, "…and in the dark sends it at the admin");
br.forfeit(admin.id);
br.forfeit(scout.id);
await waitFor(() => br.debugWatch().watchers.length === 0, 1500);
ok(br.debugWatch().watchers.length === 0, "the streets emptied: it goes");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
