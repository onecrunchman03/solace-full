// THE ELECTRICAL STATION's MAP — Level 3, sector S1, built from hand-drawn
// rooms (BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION"; the generator is
// src/backrooms/worldgen-station.ts). Part of the SHIP GATE (CLAUDE.md): a
// level doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows (the
//     station's dialect: 8-cell modules, filled, doorway slots, dry doorways,
//     one pressure door in the start room, one shutter in the goal room, one
//     breaker in each breaker room), the library file in the editor's layout.
//   · THE FROZEN MAP: S1 regenerates to its pinned fingerprint; ONE door, The
//     Pressure Door, on the map's rim; everything reachable, nothing sealed.
//   · THE POWER: six sections, every room wholly inside one; one breaker and
//     one cutoff per section; the shutter in The Lift Hall; every cutoff
//     reachable WITHOUT crossing water and every breaker without crossing
//     another section's water (its own may be the puzzle); every set piece on
//     a cell the PLACEMENT LAW allows; every room lit by at least one lamp.
//   · THE PLACEMENT LAW on the station: 2,000 random relic draws, all lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-station.js"));
const V = require(dist("station-vocab.js"));
const { lintStationTile } = require(dist("station-tiles.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.STATION_LIBRARY;
const errs = lib.flatMap((d) => lintStationTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") >= 1 && roles("breaker") >= 1, `a start room, a goal room and breaker rooms (${roles("start")} · ${roles("goal")} · ${roles("breaker")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "station-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");

// ---- THE FROZEN MAP ---------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateStationSector(plan.sector) });
function mapRules(label, { plan, s, r }) {
  const size = s.size;
  ok(r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.cuts} doorways cut through)`);
  ok(s.doors.length === 1 && s.doors[0].name === V.STATION_DOOR_NAME, `${label}: one door, ${V.STATION_DOOR_NAME}`);
  const d = s.doors[0];
  ok(d && (d.y === plan.insts[0].y && d.edge === "N" || d.x === plan.insts[0].x && d.edge === "W" || d.edge === "S" || d.edge === "E") && (d.x <= 3 || d.y <= 3 || d.x >= size - 4 || d.y >= size - 4), `${label}: the door stands on the map's rim`);
  ok(!plan.unmet.length && !plan.breakerless.length, `${label}: every room the library asks for, and a breaker room in every section`);
  ok(r.breakers === V.SECTIONS && r.cutoffs === V.SECTIONS && r.badSections === 0, `${label}: ${r.breakers} breakers and ${r.cutoffs} cutoffs, exactly one of each per section`);
  ok(r.shutter, `${label}: the lift shutter is on the map`);
  ok(r.wetCutoffs === 0, `${label}: every cutoff can be walked to without crossing water`);
  ok(r.wetBreakers === 0, `${label}: every breaker without crossing another section's water (${plan.drained} cells drained to make it so)`);
  ok(r.unlawful === 0, `${label}: every breaker, cutoff and the shutter on a cell the placement law allows`);
  // every room wholly in one section, every floor cell sectioned
  let split = 0;
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) set.add(s.section[y * size + x]);
    if (set.size !== 1) split++;
  }
  let unsectioned = 0;
  for (let k = 0; k < size * size; k++) if (!s.solid[k] && !(s.section[k] >= 1 && s.section[k] <= V.SECTIONS)) unsectioned++;
  ok(split === 0 && unsectioned === 0, `${label}: every room wholly inside one of the ${V.SECTIONS} sections, every floor cell on a circuit`);
  // every room lit
  let dark = 0;
  for (const i of plan.insts) {
    let lamps = 0;
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) if (V.sdecoKind(s.deco[y * size + x]) === V.SDECO.lamp) lamps++;
    if (!lamps) dark++;
  }
  ok(dark === 0, `${label}: every room has a lamp (${r.lamps} lamps — the fixture law: every light is a fixture)`);
  // deco: only the station's own kinds
  const known = new Set(Object.values(V.SDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.sdecoKind(s.deco[k]))) unknown++;
  ok(unknown === 0, `${label}: the deco is the station's own vocabulary (${r.arcPanels} arcing panels, ${r.puddleCells} water cells)`);
  // the shutter is in the lift hall
  const lift = s.landmarks.find((l) => l.name === "The Lift Hall");
  let shut = null;
  for (let k = 0; k < size * size; k++) if (V.sdecoKind(s.deco[k]) === V.SDECO.shutter) shut = { x: k % size, y: (k / size) | 0 };
  ok(!!lift && !!shut && shut.x >= lift.x && shut.x < lift.x + lift.w && shut.y >= lift.y && shut.y < lift.y + lift.h, `${label}: the shutter stands in The Lift Hall`);
}

console.log(`-- the frozen station, ${W.SECTOR_S.id} (seed ${W.SECTOR_S.seed}, ${W.SECTOR_S.size}²)`);
const frozen = report(W.planStationSector(W.SECTOR_S.seed, W.SECTOR_S.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_S_FINGERPRINT, "it regenerates to its pinned fingerprint");
mapRules("S1", frozen);
{
  // THE PLACEMENT LAW: relics, and the editor's spots
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
  ok(found >= 1900 && unlawful === 0, `S1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "S1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_S.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planStationSector(seed, W.SECTOR_S.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  const rep = report(plan);
  ok(rep.r.reachablePct === 100 && plan.lostCells === 0 && rep.r.badSections === 0 && rep.r.wetCutoffs === 0 && rep.r.wetBreakers === 0 && rep.r.unlawful === 0 && rep.r.shutter && !plan.unmet.length && !plan.breakerless.length,
    `reachable, six sections each with a breaker and a cutoff on dry routes, everything lawful (${plan.insts.length} rooms, ${plan.cuts} cuts, ${plan.drained} drained)`);
}

// THE STATION'S FLOOR AND CEILING (Nov 2026 polish round, REFERENCES.md Level
// 3): dark, wet concrete that catches the lamps — its sheen scaled by the baked
// light so a dead section's floor doesn't shine — and a bare concrete ceiling
// in place of rusted plates whose drip streaks ran one way across every room.
{
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const floor = /stationFloorMat = new THREE\.MeshStandardMaterial\(\{\s*map: tex\("\/assets\/br\/tex\/stained-concrete-floor-color\.jpg"[\s\S]{0,300}?roughness: 0\.38,[\s\S]{0,120}?\}\);\s*poolGloss\(stationFloorMat\);/.test(src)
    && /for \(const m of \[stationWaterLive, stationWaterDead, stationFloorMat\]\)/.test(src);
  const ceil = /stationCeilMat = new THREE\.MeshStandardMaterial\(\{\s*map: tex\("\/assets\/pipes\/tex\/concrete033-color\.jpg"/.test(src) && !/metalplates013/.test(src);
  ok(floor && ceil, "the floor is dark wet concrete reflecting the lamps only where they're lit, the ceiling bare concrete with no direction to it");
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
