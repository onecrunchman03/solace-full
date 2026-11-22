// THE CAVE SYSTEM's MAP — Level 8, sector C2, built from hand-drawn rooms
// (BACKROOMS.md → "LEVEL 8 — THE CAVE SYSTEM"; the generator is
// src/backrooms/worldgen-cave.ts). Part of the SHIP GATE (CLAUDE.md): a level
// doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows, the
//     library file in the editor's layout, every room type drawn, each type in
//     its own zone.
//   · THE FROZEN MAP: C2 regenerates to its pinned fingerprint; ONE door, The
//     Subway Stair, on the map's rim; everything reachable, nothing sealed.
//   · THE THREE ZONES: the Station, the Caverns, the Deep, in bands out from
//     the way in; every room wholly in one; the Burrower's passages and
//     crawlspaces in the Deep and nowhere else.
//   · THE LINES: the subway track one unbroken run across the Station, the
//     river one across the Caverns, each from one side of the map to the other.
//   · THE CLIMB: the Chimney at the far end of the Deep; the Climbing Rope on
//     one of the rope spots, in the Caverns, dry, deep from the way in; every
//     spot lawful and walkable to; and THE GAUNTLET — no way to the Chimney
//     that doesn't go through the Burrower's ground, and open hollows in the
//     Deep to get out into.
//   · THE DROPS: chasms that kill (none shallow enough to trap), none in the
//     Station; ledges you can go off and walk back round to.
//   · THE CRAWLSPACES: lower than a standing body, flat; passages standable.
//   · THE LIGHTS: the Station's dead fixtures and the survey team's lamps in
//     every Station and Caverns room; none lit in the Burrower's ground.
//   · THE PLACEMENT LAW on the Cave System: 2,000 random relic draws, lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-cave.js"));
const V = require(dist("cave-vocab.js"));
const T = require(dist("cave-tiles.js"));
const G = require(dist("worldgen.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.CAVE_LIBRARY;
const errs = lib.flatMap((d) => T.lintCaveTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") === 1, `one start and one goal (${roles("start")} · ${roles("goal")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "cave-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
// a type is drawn when a room IS it or paints cells of it (the platforms
// live inside the line's station rooms, Oct 16 2026)
const drawnTypes = new Set(lib.map((d) => d.type));
for (const d of lib) for (const row of d.map) for (const ch of row) if (T.CAVE_ZONES[ch]) drawnTypes.add(T.CAVE_ZONES[ch]);
ok(drawnTypes.size === V.CAVE_TYPES.length, `every one of the ${V.CAVE_TYPES.length} room types is drawn in the library`);
ok(lib.every((d) => T.CAVE_TYPE_SETS[d.type].includes(d.set)), "every room is in a zone its type belongs to");
ok(V.CAVE_CEILINGS.crawl < V.STAND_CLEAR && V.CAVE_CEILINGS.passage >= V.STAND_CLEAR && V.CAVE_TYPES.filter((t) => V.CAVE_CEILINGS[t] < V.STAND_CLEAR).every((t) => V.CRAWL_TYPES.includes(t)),
  `a crawlspace's ceiling (${V.CAVE_CEILINGS.crawl}m) is lower than a standing body (${V.STAND_CLEAR}m) and it's the only one; a passage (${V.CAVE_CEILINGS.passage}m) you can stand in`);
{
  // the linter refuses what the level must never have
  const base = { id: "t", kind: "cavern", set: "caverns", role: "block", type: "cavern", map: Array(8).fill("........"), doors: [[3, 0, "N", 2], [3, 7, "S", 2]] };
  const refused = (def, word) => T.lintCaveTile(def).errors.some((e) => e.includes(word));
  ok(refused({ ...base, map: ["........", "........", "...ss...", "...ss...", "........", "........", "........", "........"] }, "Deep only"), "the checker refuses the Burrower's ground outside the Deep");
  ok(refused({ ...base, id: "t2", set: "deep", furn: ["........", "...R....", "........", "........", "........", "........", "........", "........"], type: "grotto", kind: "grotto" }, "Caverns"), "the checker refuses a rope spot outside the Caverns");
  ok(refused({ ...base, id: "t3", set: "station", type: "platform", kind: "platform", height: ["00000000", "00000000", "00jj0000", "00jj0000", "00000000", "00000000", "00000000", "00000000"] }, "drop that kills"), "the checker refuses a killing drop in the Station");
}

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateCaveSector(plan.sector) });
/** BFS over walkable cells (the climb rule both ways), refusing `block`. */
function reachFrom(s, sx, sy, block) {
  const size = s.size;
  const seen = new Uint8Array(size * size);
  const q = [sy * size + sx];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % size, y = (i / size) | 0;
    for (const [nx, ny] of G.neighbors(s, x, y)) {
      const j = ny * size + nx;
      if (seen[j] || block(nx, ny)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}
/** The connected pieces of the cells of these types (walkable adjacency). */
function pieces(s, types) {
  const size = s.size;
  const of = (x, y) => types.includes(W.caveTypeAt(s, x, y));
  const seen = new Uint8Array(size * size);
  const out = [];
  for (let i = 0; i < size * size; i++) {
    const x0 = i % size, y0 = (i / size) | 0;
    if (seen[i] || !of(x0, y0)) continue;
    const cells = [i];
    seen[i] = 1;
    for (let h = 0; h < cells.length; h++) {
      const c = cells[h];
      for (const [nx, ny] of G.neighbors(s, c % size, (c / size) | 0)) {
        const j = ny * size + nx;
        if (seen[j] || !of(nx, ny)) continue;
        seen[j] = 1;
        cells.push(j);
      }
    }
    out.push(cells);
  }
  return out.sort((a, b) => b.length - a.length);
}
const span = (s, cells) => {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (const c of cells) {
    const x = c % s.size, y = (c / s.size) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return Math.max(x1 - x0, y1 - y0);
};

function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const door = s.doors.length === 1 && s.doors[0].name === V.CAVE_DOOR_NAME && (s.doors[0].x <= 3 || s.doors[0].y <= 3 || s.doors[0].x >= size - 4 || s.doors[0].y >= size - 4);
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const at = (p) => (p ? d0[p.y * size + p.x] : -1);
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  const zoneAt = (p) => s.section[p.y * size + p.x];
  // the chimney: in the Deep, far
  const ch = plan.chimney;
  const chimneyOk = !!ch && zoneAt(ch) === V.ZONE_DEEP && at(ch) >= maxD * 0.6;
  // the rope: a dry Caverns spot, deep from the way in
  const rope = plan.rope;
  const ropeSpot = !!rope && plan.ropeSpots.some((p) => p.x === rope.x && p.y === rope.y);
  const ropeOk = ropeSpot && zoneAt(rope) === V.ZONE_CAVERNS && !W.caveWet(s, rope.x, rope.y);
  const ropeFar = at(rope) >= maxD * 0.3;
  const spotsReach = plan.ropeSpots.every((p) => at(p) > 0 && zoneAt(p) === V.ZONE_CAVERNS);
  // the zones
  let split = 0, misplaced = 0;
  const setOf = { [V.ZONE_STATION]: "station", [V.ZONE_CAVERNS]: "caverns", [V.ZONE_DEEP]: "deep" };
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) set.add(s.section[y * size + x]);
    if (set.size !== 1) split++;
    if (lib.find((d) => d.id === i.tileId)?.set !== setOf[i.zone]) misplaced++;
  }
  let burrowOut = 0;
  for (let i = 0; i < size * size; i++) if (W.caveBurrow(s, i % size, (i / size) | 0) && s.section[i] !== V.ZONE_DEEP) burrowOut++;
  // the lines
  const track = pieces(s, ["trackbed"]);
  const river = pieces(s, ["caveriver"]);
  const trackSpan = track.length ? span(s, track[0]) : 0;
  const riverSpan = river.length ? span(s, river[0]) : 0;
  const riverOne = river.length === 1;
  // the gauntlet: the Chimney can't be reached without the Burrower's ground,
  // and its ground has open hollows to get out into
  const avoid = ch ? reachFrom(s, s.doors[0].x, s.doors[0].y, (x, y) => W.caveBurrow(s, x, y))[ch.y * size + ch.x] : 1;
  const hollows = plan.insts.filter((i) => i.type === "grotto").length;
  // the drops
  let stationPit = 0;
  for (let i = 0; i < size * size; i++) if (G.isPitCell(s, i % size, (i / size) | 0) && s.section[i] === V.ZONE_STATION) stationPit++;
  // the lights
  let noLamp = 0, litBurrow = 0;
  for (const i of plan.insts) {
    let lamps = 0;
    for (let y = i.y; y < i.y + i.h; y++)
      for (let x = i.x; x < i.x + i.w; x++) {
        const b = s.deco[y * size + x];
        if (V.cdecoKind(b) !== V.CDECO.lamp) continue;
        lamps++;
        if (V.cdecoVar(b) === 0 && W.caveBurrow(s, x, y)) litBurrow++;
      }
    if (!lamps && i.zone !== V.ZONE_DEEP) noLamp++;
  }
  let crawlBumpy = 0;
  for (let i = 0; i < size * size; i++) if (W.caveCrawl(s, i % size, (i / size) | 0) && s.floor[i] !== 0) crawlBumpy++;
  // THE STATION'S PLAN (Oct 16 2026): every Station room on its own rows and
  // near enough the stair; the line one straight row; the station proper —
  // platforms, the dead train in the middle — centred on the stair
  const GM = Math.floor((size - 2) / V.MODULE);
  const stair = plan.insts.find((i) => i.role === "start");
  const edge = stair.my === 0 ? 0 : stair.my + stair.mh === GM ? 2 : stair.mx === 0 ? 3 : 1;
  const depthOf = (mx, my) => (edge === 0 ? my : edge === 2 ? GM - 1 - my : edge === 3 ? mx : GM - 1 - mx);
  const alongOf = (mx, my) => (edge === 0 || edge === 2 ? mx : my);
  const stairAlong = alongOf(stair.mx, stair.my);
  let offRow = 0, tooFar = 0;
  for (const i of plan.insts.filter((x) => x.zone === V.ZONE_STATION)) {
    const def = lib.find((d) => d.id === i.tileId);
    const rows = W.stationRows(def);
    const reachM = W.stationReach(def);
    for (let my = i.my; my < i.my + i.mh; my++)
      for (let mx = i.mx; mx < i.mx + i.mw; mx++) {
        if (!rows.includes(depthOf(mx, my))) offRow++;
        if (Math.abs(alongOf(mx, my) - stairAlong) > reachM) tooFar++;
      }
  }
  const line = plan.insts.filter((i) => i.type === "trackbed");
  const lineStraight = line.length === GM && line.every((i) => depthOf(i.mx, i.my) === W.LINE_ROW) && new Set(line.map((i) => alongOf(i.mx, i.my))).size === GM;
  const kindOf = (i) => lib.find((d) => d.id === i.tileId)?.kind;
  const stationAt = line.filter((i) => kindOf(i) === "station" || kindOf(i) === "station-train").map((i) => alongOf(i.mx, i.my) - stairAlong);
  const trainAt = line.filter((i) => kindOf(i) === "station-train").map((i) => alongOf(i.mx, i.my) - stairAlong);
  const wantStation = [];
  for (let k = -W.STATION_HALF; k <= W.STATION_HALF; k++) if (stairAlong + k >= 0 && stairAlong + k < GM) wantStation.push(k);
  const stationCentred = stationAt.length === wantStation.length && wantStation.every((k) => stationAt.includes(k)) && trainAt.every((k) => Math.abs(k) <= W.TRAIN_HALF) && trainAt.length >= 1;
  const known = new Set(Object.values(V.CDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.cdecoKind(s.deco[k]))) unknown++;
  if (!full) {
    ok(reach && door && !plan.unmet.length && chimneyOk && ropeOk && ropeFar && spotsReach && r.unlawful === 0 && r.badRope === 0 && split === 0 && misplaced === 0 && burrowOut === 0 && trackSpan >= size - 20 && riverOne && riverSpan >= size - 20 && !avoid && hollows >= 2 && r.shallowPits === 0 && stationPit === 0 && noLamp === 0 && litBurrow === 0 && crawlBumpy === 0 && unknown === 0 && offRow === 0 && tooFar === 0 && lineStraight && stationCentred,
      `the Station in its rows, reachable, one door, the Chimney deep (${at(ch)}/${maxD}), the rope dry in the Caverns (${at(rope)}), the lines across (${trackSpan}, ${riverSpan}), the gauntlet, ${plan.ropeSpots.length} rope spots (${plan.insts.length} rooms)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.cuts} doorways cut through)`);
  ok(door, `${label}: one door, ${V.CAVE_DOOR_NAME}, on the map's rim`);
  ok(!plan.unmet.length, `${label}: every room the library asks for, and both lines laid`);
  ok(r.chimney && chimneyOk, `${label}: ${V.CHIMNEY_NAME} in the Deep, at its far end (${at(ch)} steps of ${maxD})`);
  ok(ropeOk, `${label}: the Climbing Rope on one of the rope spots, in the Caverns, out of the water (${rope?.x},${rope?.y})`);
  ok(ropeFar, `${label}: the rope deep into the Caverns (${at(rope)} steps from the way in)`);
  ok(plan.ropeSpots.length >= V.ROPE_SPOTS_MIN && spotsReach && r.unlawful === 0 && r.badRope === 0, `${label}: ${plan.ropeSpots.length} rope spots, all in the Caverns, all lawful and walkable to`);
  ok(split === 0 && misplaced === 0, `${label}: every room wholly inside one zone, the zone its library entry says`);
  ok(burrowOut === 0 && r.burrowCells > 600 && r.crawlCells > 100, `${label}: the Burrower's ground — ${r.burrowCells} cells of passage, ${r.crawlCells} of crawlspace — all in the Deep`);
  ok(trackSpan >= size - 20, `${label}: the subway track one unbroken run across the Station (${trackSpan} cells end to end, ${track[0]?.length ?? 0} cells)`);
  ok(riverOne && riverSpan >= size - 20, `${label}: the river one unbroken water across the Caverns (${riverSpan} cells end to end, in ${river.length} piece${river.length > 1 ? "s" : ""})`);
  ok(!avoid, `${label}: THE GAUNTLET — no way to the Chimney that doesn't go through the Burrower's passages`);
  ok(hollows >= 2, `${label}: ${hollows} open hollows in the Deep to get out into`);
  ok(r.pitCount >= 1 && r.shallowPits === 0 && stationPit === 0, `${label}: ${r.pitCount} chasms that kill, none shallow enough to trap, none in the Station`);
  ok(r.fallEdges > 0, `${label}: ledges you can go off and not climb (${r.fallEdges} drop edges), every one with a walk back round (nothing stranded)`);
  ok(crawlBumpy === 0, `${label}: every crawlspace flat`);
  ok(noLamp === 0 && litBurrow === 0, `${label}: every Station and Caverns room hangs a fixture (${r.lamps}); none lit in the Burrower's ground`);
  ok(unknown === 0, `${label}: the deco is the Cave System's own vocabulary`);
  ok(offRow === 0 && tooFar === 0, `${label}: THE STATION IN ROWS — the halls by the stair, the passages down, the line, the far side; every Station room on its own row and near enough the stair (${offRow} off-row, ${tooFar} too far)`);
  ok(lineStraight, `${label}: the line one straight row of ${GM} rooms, edge to edge`);
  ok(stationCentred, `${label}: the station's platforms either side of the stair (${stationAt.join(",")}), the dead train at the middle ones (${trainAt.join(",")})`);
}

console.log(`-- the frozen level, ${W.SECTOR_C.id} (seed ${W.SECTOR_C.seed}, ${W.SECTOR_C.size}²)`);
const frozen = report(W.planCaveSector(W.SECTOR_C.seed, W.SECTOR_C.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_C_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
ok(!!frozen.s.cave && frozen.s.cave.rope?.x === frozen.plan.rope?.x && frozen.s.cave.ropeSpots.length === frozen.plan.ropeSpots.length, "the plan's rope, spots and chimney ride on the sector for the server (outside the fingerprint)");
mapRules("C2", frozen);
// ROCK THAT BELONGS TO NO ROOM IS ROCK (Nov 2026 polish round): the rim and the
// fill between rooms carry district 0 — The Subway Stair — and section 0, and the
// client drew them in its cream tile wherever a cavern or the Deep looked at them.
{
  const s = frozen.s;
  const size = s.size;
  let unclaimed = 0, facing = 0;
  for (let i = 0; i < size * size; i++) {
    if (!s.solid[i] || s.section[i]) continue;
    unclaimed++;
    const x = i % size, y = (i / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (!s.solid[j] && (s.section[j] === V.ZONE_CAVERNS || s.section[j] === V.ZONE_DEEP)) { facing++; break; }
    }
  }
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const rule = /if \(data\.solid\[ci\] && !\(data\.section\?\.\[ci\] \?\? 0\)\)[\s\S]{0,700}?nearStation \? CAVE_UNCLAIMED_STATION : CAVE_LOOK\.cavern/.test(src);
  const rock = /\bcavern: \{ wall: "cave-rock"/.test(src);
  ok(unclaimed > 0 && facing > 0 && rule && rock, `rock that belongs to no room (${unclaimed} cells, ${facing} facing the Caverns or the Deep) is drawn as rock, not The Subway Stair's tile`);
}
{
  let seed = 7;
  const rnd = (k) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % k;
  };
  let found = 0, unlawful = 0;
  for (let i = 0; i < 2000; i++) {
    const c = pickRelicCell(frozen.s, [], 40, rnd);
    if (!c) continue;
    found++;
    if (whyUnplaceable(frozen.s, c[0], c[1])) unlawful++;
  }
  ok(found >= 1900 && unlawful === 0, `C2: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "C2: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_C.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planCaveSector(seed, W.SECTOR_C.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
