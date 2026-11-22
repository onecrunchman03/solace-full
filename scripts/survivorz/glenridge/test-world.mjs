// SURVIVORZ, GLENRIDGE HALL: the simulation's world (src/survivorz/sim/world.ts) is handed the mansion as its map
// (sim/mapdef.ts) in place of the bunker: it constructs, the cast stand in the house, it steps, it says which map it
// is on, and a save made on it comes back on it and is refused by a world on the bunker. Run after `npm run build`.
//   node scripts/survivorz/glenridge/test-world.mjs
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dist = (p) => path.join(ROOT, "dist", "survivorz", p);
const { SimWorld } = require(dist("sim/world.js"));
const { mapDef } = require(dist("sim/mapdef.js"));
const { encodeGraph, decodeGraph } = require(dist("sim/save.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL", m); } };

const OPTS = { map: "glenridge", seed: 7, start: 1_800_000_000_000, zombies: 0 };      // (none of the map's own dead: the scenario still places the one in the cell)
const def = mapDef("glenridge");
ok(def.id === "glenridge" && def.site.id === "glenridge-v1" && mapDef("bunker").id === "bunker" && mapDef(undefined).id === "bunker" && mapDef("nowhere").id === "bunker",
  "the registry knows the mansion and the bunker, and anything else is the bunker");

let w = null;
try { w = new SimWorld(OPTS); } catch (e) { console.log("  the world would not build:", e.stack ?? e.message); }
ok(!!w, "a world is made on the mansion");
if (w) {
  ok(w.map === def && w.nav.rooms.length === def.site.rooms.length && w.nav.rooms.length === 77, `it is on the mansion's 77 rooms (${w.nav.rooms.length})`);
  ok(w.survivors.length >= 1 && w.survivors.length <= def.startRooms.length, `the default cast is in it, one a start room at most (${w.survivors.length} of ${def.startRooms.length} rooms)`);
  ok(w.zombies.length === 1 && w.nav.rooms[w.zombies[0].room].id === "cellar-cell", `no dead at the start but the one in the cell (${w.zombies.length})`);

  // every survivor on a walkable cell of one of the map's start rooms, on the ground floor (floor 1), at its height (0)
  const starts = new Set(def.startRooms), rooms = new Set(), badly = [];
  for (const s of w.survivors) {
    const R = s.room >= 0 ? w.nav.rooms[s.room] : null;
    const fine = s.cell >= 0 && w.nav.isWalk(s.cell) && R && starts.has(R.id) && s.startRoom === R.id && s.floor === 1 && w.nav.floorOfCell(s.cell) === 1 && s.y === w.nav.yAt(s.cell) && s.y === -0.5;      // (the grounds lie half a metre below the door sills)
    if (!fine) badly.push(`${s.who} in ${R?.id ?? "no room"} floor ${s.floor} y ${s.y}`);
    if (R) rooms.add(R.id);
  }
  ok(badly.length === 0, `every survivor stands on walkable floor of a start room, on floor 1 at the grounds' own height (not: ${badly.join("; ") || "-"})`);
  ok([...rooms].every((id) => w.nav.rooms[w.nav.roomIdx.get(id)].outdoor), `they start out of doors, at the gate and along the drive (${[...rooms].join(", ")})`);

  // the snapshot says which map it is, and lists the mansion's doors
  const snap = w.snapshot();
  ok(snap.map === "glenridge", `the snapshot says the map (${snap.map})`);
  ok(snap.doors.length === 107 && snap.doors.length === def.site.doors.length, `it lists 107 doors (${snap.doors.length})`);
  ok(Object.keys(snap.power).includes("glenridge") && snap.bodies.length === w.survivors.length + w.zombies.length, "it carries the house's zone and every body");
  ok(new SimWorld({ seed: 7, start: OPTS.start }).snapshot().map === "bunker", "a world made with no map says the bunker");

  // two sim-minutes, every frame watched
  let frames = 0, threw = null; const nan = [];
  w.onFrame((f) => {
    frames++;
    if (f.type === "tick") for (const b of f.bodies ?? []) if (b.pos && !b.pos.every(Number.isFinite)) nan.push(b.id);
  });
  try { for (let t = 0; t < 120_000; t += 100) w.tick(100); } catch (e) { threw = e; console.log("  stepping threw:", e.stack ?? e.message); }
  ok(!threw, "it steps two sim-minutes without throwing");
  ok(frames >= 1200 && nan.length === 0, `a frame every step and no body anywhere it can't be (${frames} frames)`);
  const off = w.survivors.filter((s) => s.alive && (s.cell < 0 || !w.nav.isWalk(s.cell) || s.room < 0)).map((s) => s.who);
  ok(off.length === 0, `after two minutes everyone is still on the house's floor (not: ${off.join(", ") || "-"})`);

  // SAVE AND RESUME: a save made on the mansion comes back on a fresh world on the mansion, and both then take the same steps
  let round = false, same = false, mapId = "";
  try {
    const text = encodeGraph(w.saveState());
    mapId = String(decodeGraph(text).mapId);
    const w2 = new SimWorld(OPTS);
    w2.loadState(decodeGraph(text));
    round = w2.t === w.t && w2.survivors.length === w.survivors.length && encodeGraph(w2.saveState()) === text;
    const a = [], b = []; w.onFrame((f) => a.push(JSON.stringify(f))); w2.onFrame((f) => b.push(JSON.stringify(f)));
    for (let t = 0; t < 30_000; t += 100) { w.tick(100); w2.tick(100); }
    same = a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
  } catch (e) { console.log("  the save would not round-trip:", e.stack ?? e.message); }
  ok(mapId === "glenridge-v1", `the save names the mansion (${mapId})`);
  ok(round, "a save made on the mansion loads into a fresh world on the mansion, and saves again the same");
  ok(same, "the two then take the same steps, frame for frame");

  // ...and is refused by a world on the bunker (and the bunker's by the mansion)
  const refused = (make, save) => { try { make().loadState(decodeGraph(encodeGraph(save))); return ""; } catch (e) { return String(e.message); } };
  const r1 = refused(() => new SimWorld({ seed: 7, start: OPTS.start }), w.saveState());
  ok(/from another map/.test(r1), `a mansion save is refused by a world on the bunker (${r1 || "it loaded"})`);
  const r2 = refused(() => new SimWorld(OPTS), new SimWorld({ seed: 7, start: OPTS.start }).saveState());
  ok(/from another map/.test(r2), `a bunker save is refused by a world on the mansion (${r2 || "it loaded"})`);
}

console.log(fail ? `RED ${fail} of ${pass + fail}` : `GREEN ${pass}`);
process.exit(fail ? 1 : 0);
