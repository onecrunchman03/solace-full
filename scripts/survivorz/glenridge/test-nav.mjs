// SURVIVORZ, GLENRIDGE HALL: the simulation's own navigation (src/survivorz/sim/nav.ts), handed the mansion in place
// of the bunker, routes a body from inside the front door to every room. Run after `npm run build` and walkmap.py.
//   node scripts/survivorz/glenridge/test-nav.mjs
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url"; import fs from "node:fs";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { Nav, RES, alongStair } = require(path.join(ROOT, "dist", "survivorz", "sim", "nav.js"));
const { mapDef } = require(path.join(ROOT, "dist", "survivorz", "sim", "mapdef.js"));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "src", "survivorz", f), "utf8"));
const walk = J("glenridge-walk.json"), sight = J("glenridge-sight.json"), site = J("glenridge-site.json");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL", m); } };

ok(walk.res === RES, `the mansion's grid is the simulation's (${walk.res} cells a metre)`);
let nav = null;
try { nav = new Nav(mapDef("glenridge").nav); } catch (e) { console.log("  the navigation would not build:", e.message); }      // as the world builds it (sim/mapdef.ts)
ok(!!nav, "the navigation builds from the mansion's rooms, doors and stairs");
if (nav) {
  ok(nav.rooms.length === 77 && nav.rooms.filter((r) => r.outdoor).length === 8, `77 rooms: the house's 69 and eight yards (${nav.rooms.length}, ${nav.rooms.filter((r) => r.outdoor).length} out of doors)`);
  ok(nav.floors.length === 3 && nav.floorY(0) === 3.4 && nav.floorY(1) === 0 && nav.floorY(2) === -3, `three floors at the mansion's own heights (${[0, 1, 2].map((f) => nav.floorY(f)).join(", ")})`);
  const stairs = nav.portals.filter((p) => p.kind === "stairs");
  ok(stairs.length === 4, `four stairs join the floors (${stairs.length})`);
  const hearth = stairs.find((p) => p.door >= 0);
  ok(!!hearth && nav.doors[hearth.door].id === "hearth-stone" && nav.doors[hearth.door].kind === "grate" && stairs.filter((p) => p.door >= 0).length === 1, "the stair under the hearth, and only that one, is shut by its stone");
  const wins = nav.portals.filter((p) => p.kind === "window");
  ok(wins.length === 5 && wins.every((p) => nav.isWalk(p.ca) && nav.isWalk(p.cb) && !nav.rooms[nav.room[p.ca]].outdoor && nav.rooms[nav.room[p.cb]].outdoor && p.ms > 1000), `five broken windows, each climbed from the grounds into a room (${wins.length})`);
  // each stair carries its own line, upper end first, and takes as long as its length at a stair's pace
  const shaped = stairs.filter((p) => p.line && p.line.length >= 3 && p.line[0][1] > p.line[p.line.length - 1][1] && p.ms > 4000 && p.ms < 20000);
  ok(shaped.length === 4, `every stair has its line with its landings, upper end first (${stairs.map((p) => `${(p.ms / 1000).toFixed(1)} s`).join(", ")})`);
  const walked = nav.doors.filter((d) => d.kind !== "window" && d.kind !== "grate" && d.kind !== "vent").length;
  ok(nav.portals.filter((p) => p.kind === "door").length === walked && nav.doors.length === 107, `every door that is walked through has an opening a body can stand in (${walked} of ${nav.doors.length} doors)`);
  // a body on the main stair: starts where it stood, ends where it steps off, passes each landing corner, and never
  // goes back down on the way up
  const ms = stairs.find((p) => p.line && Math.abs(p.line[0][0] + 7) < 0.01);
  if (ms) {
    const lo = [-2.875, 0, 0.125], hi = [-6.875, 3.4, -0.375]; let okUp = true, lastY = -1, near = ms.line.map(() => 9);
    for (let i = 0; i <= 400; i++) {
      const [x, y, z] = alongStair(ms.line, lo, hi, i / 400);
      if (y < lastY - 1e-9) okUp = false; lastY = y;
      ms.line.forEach((p, k) => { near[k] = Math.min(near[k], Math.hypot(x - p[0], y - p[1], z - p[2])); });
    }
    const s0 = alongStair(ms.line, lo, hi, 0), s1 = alongStair(ms.line, lo, hi, 1), d0 = alongStair(ms.line, hi, lo, 0), d1 = alongStair(ms.line, hi, lo, 1);
    ok(okUp && Math.max(...near) < 0.05 && Math.hypot(s0[0] - lo[0], s0[2] - lo[2]) < 1e-6 && Math.hypot(s1[0] - hi[0], s1[2] - hi[2]) < 1e-6 && s1[1] === 3.4
      && Math.hypot(d0[0] - hi[0], d0[2] - hi[2]) < 1e-6 && Math.hypot(d1[0] - lo[0], d1[2] - lo[2]) < 1e-6 && d1[1] === 0,
      `a body climbs the main stair along its line, round both landing corners, and comes down the same way (furthest from a corner ${Math.max(...near).toFixed(3)} m)`);
  } else ok(false, "the main stair has its line");
  // every room has floor of its own, labelled as its own (the wings stand at 45 degrees: a rectangle would mislabel them)
  const cells = new Array(nav.rooms.length).fill(0);
  for (let k = 0; k < nav.total; k++) if (nav.walk[k] && nav.room[k] >= 0) cells[nav.room[k]]++;
  const empty = nav.rooms.filter((r, i) => cells[i] === 0).map((r) => r.id);
  ok(empty.length === 0, `every room has walkable floor of its own (none: ${empty.join(", ") || "-"})`);
  const kitchen = nav.roomIdx.get("kitchen"), pantry = nav.roomIdx.get("butlers-pantry");
  const kr = nav.rooms[kitchen].rect, pr = nav.rooms[pantry].rect;
  const overlap = kr.x < pr.x + pr.w && pr.x < kr.x + kr.w && kr.y < pr.y + pr.h && pr.y < kr.y + kr.h;
  ok(overlap && cells[kitchen] > 100 && cells[pantry] > 50, "two rooms of the angled wing whose bounding boxes overlap each keep their own floor");
  // room-hop distances: every room is some number of doors from the vestibule
  const v = nav.roomIdx.get("vestibule"); const far = nav.rooms.filter((r, i) => nav.hops[v * nav.rooms.length + i] < 0).map((r) => r.id);
  ok(far.length === 0, `every room is joined to the vestibule by doors and stairs (not: ${far.join(", ") || "-"})`);
  // a route, with every door open, from inside the front door to the middle of every room
  const from = nav.cellInRoom(v, nav.rooms[v].floor, 0.5, 0.5); let reached = 0, longest = 0, where = ""; const lost = [];
  nav.rooms.forEach((r, i) => {
    const to = nav.cellInRoom(i, r.floor, 0.5, 0.5); const p = to >= 0 ? nav.route(from, to, () => 1) : null;
    if (p && p.reached) { reached++; let d = 0; for (let k = 4; k < p.pts.length; k += 4) if (p.pts[k + 2] === p.pts[k - 2]) d += Math.hypot(p.pts[k] - p.pts[k - 4], p.pts[k + 1] - p.pts[k - 3]); if (d > longest) { longest = d; where = r.id; } }
    else lost.push(r.id);
  });
  ok(reached === nav.rooms.length, `a body is routed from the front door to every room (${reached} of ${nav.rooms.length}; not: ${lost.join(", ") || "-"})`);
  // every door by itself: with every other door shut, a body still gets from the room on one side to the room on the
  // other (a door that opens onto a chair, or whose far side reads as the near room, fails here)
  const dead = [];
  nav.doors.forEach((d, di) => {
    const ra = nav.roomIdx.get(d.a), rb = nav.roomIdx.get(d.b);
    const p = nav.route(nav.cellInRoom(ra, nav.rooms[ra].floor, 0.5, 0.5), nav.cellInRoom(rb, nav.rooms[rb].floor, 0.5, 0.5), (x) => (x === di ? 1 : 0));
    if (!p || !p.reached) dead.push(d.id);
  });
  ok(dead.length === 0, `every door can be walked through on its own (${nav.doors.length - dead.length} of ${nav.doors.length}; not: ${dead.join(", ") || "-"})`);
  // each room's own floor is in one piece (a body inside a room can cross it without leaving it)
  const seenK = new Uint8Array(nav.total); const pieces = new Map();
  for (let k0 = 0; k0 < nav.total; k0++) {
    if (!nav.walk[k0] || nav.room[k0] < 0 || seenK[k0]) continue;
    const r = nav.room[k0], F = nav.floors[nav.floorOfCell(k0)], st = [k0]; seenK[k0] = 1; let n = 0;
    while (st.length) {
      const k = st.pop(); n++; const l = k - F.base, j = Math.floor(l / F.w), i = l - j * F.w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= F.w || jj >= F.h) continue;
        const kk = F.base + jj * F.w + ii; if (nav.walk[kk] && nav.room[kk] === r && !seenK[kk]) { seenK[kk] = 1; st.push(kk); }
      }
    }
    (pieces.get(r) ?? pieces.set(r, []).get(r)).push(n);
  }
  const split = [...pieces].filter(([, p]) => p.length > 1).map(([r, p]) => `${nav.rooms[r].id} ${p.sort((x, y) => y - x).join("+")}`);
  ok(split.length === 0, `every room's floor is in one piece (in pieces: ${split.join(", ") || "-"})`);
  // doors matter: with the vestibule's doors shut, nothing beyond it is reached
  const vDoors = new Set(nav.doors.map((d, i) => (d.a === "vestibule" || d.b === "vestibule" ? i : -1)).filter((i) => i >= 0));
  const hall = nav.roomIdx.get("great-hall"); const shut = nav.route(from, nav.cellInRoom(hall, nav.rooms[hall].floor, 0.5, 0.5), (d) => (vDoors.has(d) ? 0 : 1));
  ok(!shut || !shut.reached, "with the vestibule's doors shut, the great hall is not reached");
  // sight: across the great hall, yes; from the great hall into the kitchen, no
  const c = (id) => nav.centre(nav.cellInRoom(nav.roomIdx.get(id), nav.rooms[nav.roomIdx.get(id)].floor, 0.5, 0.5));
  const a = nav.centre(nav.cellInRoom(hall, 1, 0.15, 0.5)), b = nav.centre(nav.cellInRoom(hall, 1, 0.85, 0.5)), kc = c("kitchen");
  ok(nav.sees(1, a[0], a[2], b[0], b[2], () => true), "one end of the great hall sees the other");
  ok(!nav.sees(1, a[0], a[2], kc[0], kc[2], () => true), "the great hall does not see into the kitchen");
  console.log(`  the longest walk on one floor from the front door: ${longest.toFixed(0)} m, to ${where}`);
}
console.log(`\n${fail ? "RED" : "GREEN"}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
