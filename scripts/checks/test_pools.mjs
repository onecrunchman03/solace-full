// THE POOLROOMS harness — the frozen Level 1 sector P6, A FLOODED BATHHOUSE
// BUILT FROM HAND-MADE ROOMS (Josh, 2026-09-29: "use all those references to
// completely from scratch redesign the pools map" — rivers out, three zones,
// 288², the boats kept as canal boats in the lap pools). The library is
// src/backrooms/pools-rooms.json, edited in the Admin Panel's map editor;
// pools-tiles.ts is the Poolrooms' dialect of the room format.
//
// It holds four things to account: the LIBRARY (every room passes the checker
// the editor shows, the file is in the editor's layout, turning a room never
// changes what's in it, every doorway dry), the ZONES (The Landing near the
// middle, every zone's rooms in their zone, the named halls), the WATER (one
// table, water only where the floor is below it, the waterline climb rule, no
// swimmer trapped, the alligators' waters, the lap lanes the boats sit on),
// and the MAP rules every level keeps (connected, one door with a dry apron,
// nothing the door can't reach).
//
// Build first (npm run build); consumes dist/backrooms/*.js. Pure data.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (p) => path.join(ROOT, "dist", "backrooms", p);
const { planPoolsSector, generatePoolsSector, validatePoolsSector, sectorFingerprint, loadPoolLibrary, swimTraps, waterBodies, zoneAt, POOL_LIBRARY, SECTOR_P, SECTOR_P_FINGERPRINT, SECTOR_P5_RETIRED, SECTOR_P3_RETIRED, WATER_TABLE, SWIM_DEPTH_STEPS, DECO } = require(dist("worldgen-pools.js"));
const { formatLibrary, tileVariants } = require(dist("tiles.js"));
const { POOL_DOOR_NAMES, GATOR_MIN_CELLS, ZONE_RADII, wetFloor } = require(dist("pools-vocab.js"));
const { WATER_NONE } = require(dist("worldgen.js"));

let n = 0;
let bad = 0;
const ok = (cond, name) => {
  n++;
  if (!cond) {
    bad++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
};

const plan = planPoolsSector(SECTOR_P.seed, SECTOR_P.size);
const s = plan.sector;
const r = validatePoolsSector(s);
const size = s.size;
const lib = loadPoolLibrary(POOL_LIBRARY, true);
const byId = new Map(lib.map((e) => [e.def.id, e]));
const insts = plan.insts;

// ---- the frozen world
ok(SECTOR_P.id === "P6" && SECTOR_P.size === 288, "sector is P6 288²");
ok(sectorFingerprint(s) === SECTOR_P_FINGERPRINT, "fingerprint matches the frozen P6");
ok(sectorFingerprint(generatePoolsSector(SECTOR_P.seed, SECTOR_P.size)) === SECTOR_P_FINGERPRINT, "generation is deterministic");
ok(SECTOR_P5_RETIRED.id === "P5" && SECTOR_P_FINGERPRINT !== SECTOR_P5_RETIRED.fingerprint && SECTOR_P_FINGERPRINT !== SECTOR_P3_RETIRED.fingerprint, "a new sector id and a new map — P5's fog, paint and bodies are left behind");

// ---- THE LIBRARY: every room passes the checker the editor shows
{
  const broken = lib.filter((e) => e.lint.errors.length).map((e) => `${e.def.id}: ${e.lint.errors[0]}`);
  ok(broken.length === 0, `every room in the library passes the checker (${broken.slice(0, 3).join(" | ") || `${lib.length} rooms`})`);
  const ids = lib.map((e) => e.def.id);
  ok(new Set(ids).size === ids.length, "every room has its own id");
  ok(lib.length >= 30, `a library big enough not to repeat itself (${lib.length} rooms)`);
  const roles = new Set(lib.map((e) => e.def.role));
  ok(["door", "hall", "corridor", "room"].every((q) => roles.has(q)) && !["river", "confluence", "source"].some((q) => roles.has(q)), `every role is drawn, and no river piece (${[...roles].join(", ")})`);
  const sets = new Set(lib.map((e) => e.def.set));
  ok(["baths", "arcades", "deep", "any"].every((q) => sets.has(q)), `every zone has rooms drawn for it (${[...sets].join(", ")})`);
  let wetDoor = 0;
  for (const e of lib) for (const so of e.base.sockets) if (so.prof.some(wetFloor)) wetDoor++;
  ok(wetDoor === 0, "every doorway stands on dry floor — each room's water is its own");
  const raw = readFileSync(path.join(ROOT, "src", "backrooms", "pools-rooms.json"), "utf8").split("\r\n").join("\n");
  ok(formatLibrary(JSON.parse(raw).tiles) === raw, "the library file is in the editor's layout (a save round-trips it byte for byte)");
  let drift = 0;
  for (const e of lib) {
    if (!e.variants.length) continue;
    const count = (t) => [Array.from(t.cell).filter((c) => c === 1).length, Array.from(t.cell).filter((c) => c === 2).length, Array.from(t.deco).filter((c) => c).length, t.sockets.length, t.pieces.length, Array.from(t.hgt).reduce((a, b) => a + b, 0)].join();
    const want = count(e.base);
    for (const v of tileVariants(e.base)) if (count(v) !== want) drift++;
  }
  ok(drift === 0, "every turned or mirrored copy of a room holds exactly what the drawing holds — water included");
}

// ---- BUILT FROM THE LIBRARY
{
  ok(insts.every((i) => byId.has(i.tileId)), `every piece of the level is a room from the library (${insts.length} pieces)`);
  let stray = 0;
  for (let i = 0; i < size * size; i++) if (!s.solid[i] && !plan.space[i]) stray++;
  ok(stray === 0, "no open floor that no room owns");
  const over = lib.filter((e) => e.def.max !== undefined && insts.filter((q) => q.tileId === e.def.id).length > e.def.max);
  ok(over.length === 0, `no room is built more often than its cap (${over.map((e) => e.def.id).join(" ") || "all within"})`);
  const under = lib.filter((e) => (e.def.min ?? 0) > insts.filter((q) => q.tileId === e.def.id).length);
  ok(under.length === 0 && plan.unmet.length === 0, `every room with a minimum has it (${under.map((e) => e.def.id).join(" ") || "all met"})`);
  // halls and rooms — what a player reads as a place (passages are the glue)
  const rooms = insts.filter((q) => q.role === "hall" || q.role === "room");
  const most = Math.max(...[...new Set(rooms.map((q) => q.tileId))].map((id) => rooms.filter((q) => q.tileId === id).length));
  ok(most <= 14, `no single room dominates the level (the most-built is built ${most} times)`);
}

// ---- THE ZONES: the Sunlit Baths, the Arcades, the Deep, out from The Landing
{
  const d = s.doors[0];
  ok(Math.hypot(d.x - size / 2, d.y - size / 2) < size * 0.1, `The Landing stands near the middle of the map (${d.x},${d.y})`);
  let wrong = 0;
  const per = { baths: 0, arcades: 0, deep: 0 };
  for (const q of insts) {
    const set = plan.tiles[q.id].def.set;
    const z = zoneAt(q.x + q.w / 2, q.y + q.h / 2, plan.landing, size);
    if (set !== "any" && set !== z) wrong++;
    if (q.role === "hall" || q.role === "room") per[z]++;
  }
  ok(wrong === 0, "every room drawn for a zone stands in it (passages and small rooms drawn for anywhere, anywhere)");
  ok(per.baths >= 6 && per.arcades >= 10 && per.deep >= 10, `every zone is built (${per.baths} halls and rooms in the sunlit baths, ${per.arcades} in the arcades, ${per.deep} in the deep)`);
  const zoneOf = (name) => {
    const l = s.landmarks.find((q) => q.name === name);
    return l ? zoneAt(l.x + l.w / 2, l.y + l.h / 2, plan.landing, size) : null;
  };
  for (const [name, z] of [["The Lido", "baths"], ["The Spiral", "baths"], ["The Arcade", "arcades"], ["The Column Sea", "arcades"], ["The Long Lanes", "arcades"], ["The Cistern", "deep"], ["The Undercroft", "deep"], ["The Last Pool", "deep"]]) ok(zoneOf(name) === z, `${name} stands in the ${z === "baths" ? "sunlit baths" : z}`);
  ok(ZONE_RADII.baths < ZONE_RADII.arcades, "the zones are rings, baths inside arcades inside the deep");
}

// ---- THE WATER: one table, derived, no traps
{
  let tableOK = true;
  let effOK = true;
  for (let i = 0; i < size * size; i++) {
    if (s.water[i] !== WATER_NONE && s.water[i] !== WATER_TABLE) tableOK = false;
    if (s.solid[i]) continue;
    const wet = s.floor[i] < WATER_TABLE;
    if ((s.water[i] !== WATER_NONE) !== wet) tableOK = false;
    if (s.eff[i] !== (wet ? WATER_TABLE : s.floor[i])) effOK = false;
  }
  ok(tableOK, "one water table: every wet cell's surface is the same line, and a cell is wet exactly when its floor is under it");
  ok(effOK, "the effective floor is the waterline wherever there's water (the climb rule the server and client share)");
  ok(r.spillEdges === 0 && r.waterOverSolid === 0, "no water spills past a dry floor below the line, none stands over rock");
  ok(r.wetPct > 30 && r.wetPct < 65, `the Poolrooms are wet (${r.wetPct.toFixed(1)}% of the open floor)`);
  ok(r.swimPct > 15, `and deep in places (${r.swimPct.toFixed(1)}% swim-deep)`);
  ok(swimTraps(s) === 0, "every deep body of water has a way to climb out");
  const bodies = waterBodies(s);
  const gators = bodies.filter((b) => b.gator);
  ok(gators.length >= 8, `waters big and deep enough for an alligator: ${gators.length}`);
  ok(gators.every((b) => zoneAt(b.x, b.y, plan.landing, size) !== "baths"), "no alligator water in the sunlit baths");
  ok(bodies[0].cells < 3 * GATOR_MIN_CELLS, `no one body of water swallows the level (the largest is ${bodies[0].cells} cells)`);
  // THE LAP LANES: long, narrow, swim-deep water with no alligator — where the
  // boats tie up (service.ts dockBoats)
  const lanes = insts.filter((q) => q.tileId === "the-long-lanes" || q.tileId === "lap-pool");
  ok(lanes.length >= 2, `lap lanes for the boats (${lanes.length})`);
}

// ---- THE MAP RULES every level keeps
{
  ok(r.reachablePct === 100 && plan.lostCells === 0, `everything is reachable from the doors, and nothing had to be sealed (${r.walkableCells} cells)`);
  ok(r.isolatedDoors === 0 && r.doorReach.every((v) => v === r.doorReach[0]), "no door is sealed off: every door reaches every other");
  ok(s.doors.length === 1 && s.doors[0].name === "The Landing" && POOL_DOOR_NAMES.length === 1, `ONE DOOR (Josh: "only one door per level for entering"): ${s.doors.map((d) => d.name).join(", ")}`);
  // The Landing stands AGAINST ITS WALL (Josh, Sep 2026: "an actual door
  // against the wall"): solid right behind it, and dry, clear floor three
  // cells out from the wall and three either side.
  let wetApron = 0;
  let backed = 0;
  for (const d of s.doors) {
    const BACK = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([bx, by]) => s.solid[(d.y + by) * size + d.x + bx]);
    if (BACK) backed++;
    for (let y = d.y - 3; y <= d.y + 3; y++) for (let x = d.x - 3; x <= d.x + 3; x++) {
      if (BACK && (x - d.x) * BACK[0] + (y - d.y) * BACK[1] > 0) continue;
      if (s.solid[y * size + x] || s.water[y * size + x] !== WATER_NONE) wetApron++;
    }
  }
  ok(backed === s.doors.length, "The Landing stands against its wall (solid right behind the door)");
  ok(wetApron === 0, "…with dry, clear floor three cells out from the wall");
  const names = s.landmarks.map((l) => l.name);
  for (const want of ["The Lido", "The Spiral", "The Arcade", "The Column Sea", "The Long Lanes", "The Cistern", "The Undercroft", "The Last Pool"]) ok(names.includes(want), `landmark: ${want}`);
  const kinds = r.decoByKind;
  ok(["arch", "portal", "pillar", "skylight", "porthole", "bridge", "cubby", "ladder", "window", "spiralcore"].every((k) => (kinds[k] ?? 0) > 0), `the level is dressed (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  // a WINDOW hangs on stone: solid straight behind it on its side
  let loose = 0;
  for (let i = 0; i < size * size; i++) {
    if (s.deco[i] >> 4 !== DECO.window) continue;
    const v = s.deco[i] & 15;
    const bx = (i % size) + [0, 1, 0, -1][v];
    const by = Math.floor(i / size) + [-1, 0, 1, 0][v];
    if (!s.solid[by * size + bx]) loose++;
  }
  ok(loose === 0, `every window has a wall behind it (${kinds.window ?? 0} windows)`);
  let pillarOK = true;
  let bridgeOK = true;
  for (let i = 0; i < size * size; i++) {
    const k = s.deco[i] >> 4;
    if ((k === DECO.pillar || k === DECO.spiralcore) && !s.solid[i]) pillarOK = false;
    if (k === DECO.bridge && s.floor[i] < 1) bridgeOK = false;
  }
  ok(pillarOK && bridgeOK, "pillars stand on their own solid blocks; bridge decks stand above the water");
  // AN ARCH BETWEEN TWO DRUMS ISN'T DRAWN (Nov 2026 polish round): the Arcades'
  // arches sit in one-cell gaps between 4m round pillars, where an arch's legs
  // and half its shell were buried in the curving drums. The client draws the
  // colonnade instead (the deco stays — it is in the fingerprint).
  const drumCell = (x, y) => {
    if (!s.solid[y * size + x]) return false;
    for (const [ax, ay] of [[x, y], [x - 1, y], [x, y - 1], [x - 1, y - 1]]) {
      const k = s.deco[ay * size + ax] >> 4;
      if (k === DECO.pillar || k === DECO.spiralcore) return true;
    }
    return false;
  };
  let between = 0;
  for (let i = 0; i < size * size; i++) {
    if (s.deco[i] >> 4 !== DECO.arch || s.solid[i]) continue;
    const x = i % size, y = Math.floor(i / size);
    const spanX = (s.deco[i] & 15) !== 1;
    if (spanX ? drumCell(x - 1, y) && drumCell(x + 1, y) : drumCell(x, y - 1) && drumCell(x, y + 1)) between++;
  }
  const wsrc = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  ok(between > 0 && /return world\.solidAt\(fx, fy\) && pillarCellAt\(fx, fy\);\s*\};\s*if \(drum\(-1\) && drum\(1\)\) break;/.test(wsrc), `an arch between two drums (${between} on ${SECTOR_P.id}) is left out, the drums read as a colonnade`);
}

// ---- the generator is sound on other seeds too
{
  const seeds = [11, 22, 33];
  const res = seeds.map((sd) => {
    const p = planPoolsSector(sd, SECTOR_P.size);
    const v = validatePoolsSector(p.sector);
    return { sd, ok: v.reachablePct === 100 && p.lostCells === 0 && p.unmet.length === 0 && swimTraps(p.sector) === 0 && v.isolatedDoors === 0 && waterBodies(p.sector).filter((b) => b.gator).length >= 6 };
  });
  ok(res.every((q) => q.ok), `three other seeds each build a whole, connected Poolrooms (${res.map((q) => `${q.sd}:${q.ok ? "ok" : "BAD"}`).join(" ")})`);
}



// ---- THE LOOK PICKER on this level (surfaces.ts): a repainted room keeps the
// map's fingerprint, and its look lands on that room's cells only
{
  const { lookKey } = require(path.join(ROOT, "dist", "backrooms", "surfaces.js"));
  // the Poolrooms wear only the pool tile, so a repaint here is the room's light
  const look = { bright: 60, lights: 50, flicker: 15, sound: "drip" };
  const inst = plan.insts.find((q) => plan.tiles[q.id].def.role === "hall" && !plan.tiles[q.id].def.look);
  const id = plan.tiles[inst.id].def.id;
  const lib = JSON.parse(JSON.stringify(POOL_LIBRARY));
  lib.find((t) => t.id === id).look = look;
  const painted = planPoolsSector(SECTOR_P.seed, SECTOR_P.size, lib);
  const code = painted.sector.styles.findIndex((q) => lookKey(q) === lookKey(look)) + 1;
  const on = painted.sector.look.filter((v) => v === code).length;
  // every other room keeps the style it had
  let moved = 0;
  const styleKey = (sec, i) => (sec.look[i] ? lookKey(sec.styles[sec.look[i] - 1]) : "");
  for (let i = 0; i < size * size; i++) if (painted.sector.look[i] !== code && styleKey(painted.sector, i) !== styleKey(plan.sector, i)) moved++;
  ok(sectorFingerprint(painted.sector) === SECTOR_P_FINGERPRINT, `repainting "${id}" leaves the Poolrooms' fingerprint alone — a look never resets the level`);
  ok(on > 0 && moved === 0, `…its look lands on that room's cells (${on}) and every other room keeps its own`);
  // THE ZONE LOOKS: the sunlit baths bright, the deep dim and dripping
  const deepStyle = plan.sector.styles.find((q) => q.sound === "drip");
  const sunStyle = plan.sector.styles.find((q) => (q.bright ?? 100) > 100);
  ok(!!deepStyle && (deepStyle.bright ?? 100) < 100 && !!sunStyle, "the deep is dim and dripping, the sunlit baths bright");
  // THE TILE AND NOTHING ELSE (Josh, Oct 2026: "I do not want marble or stone
  // in the pools. I just want the tile")
  const { levelSurfaces } = require(path.join(ROOT, "dist", "backrooms", "surfaces.js"));
  const { lintPoolTile } = require(path.join(ROOT, "dist", "backrooms", "pools-tiles.js"));
  const offTile = plan.sector.styles.filter((q) => (q.wall && q.wall !== "pool-tile") || (q.floor && q.floor !== "pool-tile-floor") || (q.ceil && q.ceil !== "pool-tile-ceiling"));
  ok(offTile.length === 0, `no room in the Poolrooms wears anything but the pool tile${offTile.length ? " (" + offTile.map((q) => lookKey(q)).join("; ") + ")" : ""}`);
  const room = POOL_LIBRARY.find((t) => t.id === id);
  const foreign = [{ wall: "grey-marble-wall" }, { floor: "grey-marble-floor" }, { floor: "cream-marble-floor" }, { wall: "wood-panels" }, { floor: "concrete-floor" }, { ceil: "concrete-ceiling" }, { wall: "paper-chevron" }];
  ok(foreign.every((lk) => lintPoolTile({ ...room, look: lk }).errors.some((e) => /the Poolrooms wear only the pool tile/.test(e))) && lintPoolTile({ ...room, look }).errors.length === 0, "the Poolrooms checker refuses marble, stone, wood or paper by name, and takes a light-only repaint");
  ok(["wall", "floor", "ceil"].every((k) => levelSurfaces(k, 1).length === 1 && levelSurfaces(k, 1)[0].id.startsWith("pool-tile")), "the Poolrooms look picker offers only the pool tile");
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
