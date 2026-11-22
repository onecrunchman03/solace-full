// SOLACE SURVIVORZ — THE BUNKER'S MAP (docs/survivorz/BUNKER.md, step 2: "the map built and walkable").
//
// Run:  npm run build && node scripts/survivorz/greybox.mjs --map bunker && node scripts/checks/test_bunker_map.mjs
//
// Civil Defence Shelter 14 (src/survivorz/bunker-map.ts) and its walk map (src/survivorz/bunker-walk.json,
// written by greybox.mjs). It pins what Josh decided about the place and that a body can get everywhere:
//   · 20-25 named rooms on one floor; the core rooms he listed are all there; every room has a way in;
//     no two rooms overlap; every door sits on a wall its two rooms share (layoutProblems);
//   · one blast door, out to the tunnel; the armory and the radio room are the only locked rooms;
//   · the objective spots exist: the crank in the vestibule, the keycard in the security office, the
//     radio set in the radio room, part spots in the workshop and the stores, note spots in three rooms;
//   · starts: never the entrance, the armory or the radio room, and enough rooms for six apart;
//   · THE WALK MAP: one connected floor — every room's floor reachable from the vestibule through the
//     doors (shut leaves don't count; doors are state), every doorway passable, the walk map current.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { BUNKER } = require(path.join(ROOT, "dist/survivorz/bunker-map.js"));
const { layoutProblems, doorPlacement } = require(path.join(ROOT, "dist/survivorz/facility.js"));
const WALK = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/bunker-walk.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log("  FAIL " + what); } };

// ---- the place --------------------------------------------------------------------------------------------
const rooms = BUNKER.rooms, byId = new Map(rooms.map((r) => [r.id, r]));
const named = rooms.filter((r) => !r.id.startsWith("pass-"));
ok(named.length >= 20 && named.length <= 25, `20-25 rooms (${named.length})`);
ok(rooms.every((r) => r.floor === 0), "one floor");
for (const id of ["tunnel", "vestibule", "decon", "barracks", "mess", "kitchen", "stores", "infirmary", "armory", "security", "radio", "generator", "workshop", "common"])
  ok(byId.has(id), `core room ${id}`);
const probs = layoutProblems(BUNKER);
ok(probs.length === 0, `layout problems: ${probs.join("; ")}`);
const touched = new Set(BUNKER.doors.flatMap((d) => [d.a, d.b]));
ok(rooms.every((r) => touched.has(r.id)), `every room has a way in (${rooms.filter((r) => !touched.has(r.id)).map((r) => r.id)})`);
ok(new Set(BUNKER.doors.map((d) => d.id)).size === BUNKER.doors.length, "door ids unique");
const vault = BUNKER.doors.filter((d) => d.kind === "vault");
ok(vault.length === 1 && [vault[0].a, vault[0].b].includes("tunnel") && byId.get("tunnel").kind === "exit", "one blast door, out to the tunnel");
// the armory's keycard door and the radio room's keypad (step 3: the keypad is its own door kind)
const locked = BUNKER.doors.filter((d) => d.kind === "keycard" || d.kind === "keypad").flatMap((d) => [d.a, d.b]).filter((id) => !id.startsWith("hall"));
ok(locked.sort().join() === "armory,radio", `only the armory and the radio room locked (${locked})`);
ok(rooms.filter((r) => r.zone === "entrance").every((r) => r.id === "equipment" || !r.start), "nobody wakes in the entrance");
ok(!byId.get("armory").start && !byId.get("radio").start, "nobody wakes in the armory or the radio room");
ok(rooms.filter((r) => r.start).length >= 6, "at least six rooms to wake in apart");

// ---- the spots ------------------------------------------------------------------------------------------------
const spotsIn = (kind) => rooms.filter((r) => r.spots.some((s) => s.kind === kind)).map((r) => r.id);
ok(spotsIn("crank").join() === "vestibule", "the crank wheel is in the vestibule, by the door");
ok(spotsIn("keycard").join() === "security", "the keycard is in the security office");
ok(spotsIn("radio").join() === "radio", "the radio set is in the radio room");
ok(spotsIn("part").sort().join() === "stores,workshop", "radio part spots: workshop and stores");
ok(spotsIn("note").length >= 3 && spotsIn("note").includes("security"), `note spots in three rooms (${spotsIn("note")})`);
ok(spotsIn("armory").join() === "armory", "the guns are in the armory");

// ---- the walk map -------------------------------------------------------------------------------------------
ok(WALK.map === BUNKER.id, "the walk map is this map's");
const f = WALK.floors.find((x) => x.floor === 0);
ok(!!f && WALK.floors.length === 1, "one floor of walk map");
const g = new Uint8Array(f.w * f.h);
f.rows.forEach((row, j) => { let i = 0; for (const m of row.matchAll(/(\d+)([.#])/g)) { const n = +m[1]; if (m[2] === ".") g.fill(1, j * f.w + i, j * f.w + i + n); i += n; } });
const cell = (x, z) => [Math.floor((x - f.origin[0]) * WALK.res), Math.floor((z - f.origin[1]) * WALK.res)];
const open = (i, j) => i >= 0 && j >= 0 && i < f.w && j < f.h && g[j * f.w + i] === 1;
// flood from the vestibule's middle
const v = byId.get("vestibule").rect;
const [si, sj] = cell(v.x + v.w / 2, v.y + v.h / 2 - 1);
ok(open(si, sj), "the vestibule's middle is walkable");
const seen = new Uint8Array(f.w * f.h), stack = [[si, sj]];
seen[sj * f.w + si] = 1;
while (stack.length) {
  const [i, j] = stack.pop();
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = i + di, b = j + dj;
    if (open(a, b) && !seen[b * f.w + a]) { seen[b * f.w + a] = 1; stack.push([a, b]); }
  }
}
let openCells = 0, reached = 0;
for (let k = 0; k < g.length; k++) if (g[k]) { openCells++; if (seen[k]) reached++; }
ok(reached === openCells, `every walkable cell reachable from the vestibule (${reached} of ${openCells})`);
for (const r of rooms) {
  const { x, y, w, h } = r.rect;
  let any = 0;
  for (let j = Math.floor((y - f.origin[1]) * WALK.res); j < Math.ceil((y + h - f.origin[1]) * WALK.res); j++)
    for (let i = Math.floor((x - f.origin[0]) * WALK.res); i < Math.ceil((x + w - f.origin[0]) * WALK.res); i++) if (open(i, j) && seen[j * f.w + i]) any++;
  ok(any / WALK.res / WALK.res > 0.5 * w * h * 0.5, `${r.id}: its floor is walkable and reached (${(any / WALK.res / WALK.res).toFixed(0)} of ${w * h} m²)`);
}
for (const d of BUNKER.doors) {
  const pl = doorPlacement(BUNKER, d.id);
  const [i, j] = cell(pl.centre[0], pl.centre[2]);
  const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => open(i + a, j + b) && seen[(j + b) * f.w + i + a]);
  ok(near, `door ${d.id}: a body passes through it`);
}

// ---- ON THE THING ITSELF (Josh, Nov 4 2026: "they have to be right next to something to interact with") --------
// Every spot the sim walks a survivor to stands ON its prop in the dressed room (scripts/survivorz/sim-walk.mjs
// HOSTS: the crank on the valve wheel, the radio set on the console…), its stand cell within arm's reach of it;
// and a real run never touches anything from further off.
{
  const SIMWALK = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/sim/walk.json"), "utf8"));
  const SET = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/survivorz/room/bunker.json"), "utf8"));
  const REACH = 0.9;
  let far = [];
  for (const [id, sp] of Object.entries(SIMWALK.spots)) {
    const d = Math.hypot(sp.at[0] - sp.stand[0], sp.at[2] - sp.stand[2]);
    if (d > REACH) far.push(`${id} ${d.toFixed(2)} m`);
  }
  ok(!far.length, `every spot's stand is within ${REACH} m of what it touches${far.length ? ": " + far.join(", ") : ""}`);
  const wheel = SET.props.find((p) => p.id === "valve-wheel");
  const crank = SIMWALK.spots.crank;
  ok(!!wheel && !!crank && Math.hypot(crank.at[0] - wheel.at[0], crank.at[2] - wheel.at[2]) < 0.6, `the crank is the valve wheel the set draws (${wheel && crank ? Math.hypot(crank.at[0] - wheel.at[0], crank.at[2] - wheel.at[2]).toFixed(2) : "?"} m apart)`);
  const consoleProp = SET.props.find((p) => p.id === "control-console" && p.room === "radio");
  const radio = SIMWALK.spots["radio-set"];
  ok(!!consoleProp && !!radio && Math.hypot(radio.at[0] - consoleProp.at[0], radio.at[2] - consoleProp.at[2]) < 1.2, "the radio set is the console the set draws");
  const { SimWorld } = require(path.join(ROOT, "dist/survivorz/sim/world.js"));
  const worst = {};
  for (const seed of [1, 2, 3]) {
    const w = new SimWorld({ seed, start: Date.UTC(2026, 10, 2, 22) });
    for (let i = 0; i < 25 * 600 && !w.overAt; i++) w.tick(100);
    for (const [k, v] of Object.entries(w.stats.reach.byWhat)) worst[k] = Math.max(worst[k] ?? 0, v);
  }
  // (a bed is lain ON, measured to its middle: a body lies along it, not reaching for it)
  const LIMIT = { pull: 1.2, bed: 1.4 };
  const over = Object.entries(worst).filter(([k, v]) => v > (LIMIT[k] ?? 1.0));
  ok(Object.keys(worst).length > 0 && !over.length, `three 25-minute runs: nothing touched from further than arm's reach (${Object.entries(worst).map(([k, v]) => `${k} ${v}`).join(", ")})`);
}

console.log(`\ntest_bunker_map: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
