// LIGHTS OUT's MAP — Level 6, sector L1, built from hand-drawn rooms
// (BACKROOMS.md → "LEVEL 6 — LIGHTS OUT"; the generator is
// src/backrooms/worldgen-lights.ts). Part of the SHIP GATE (CLAUDE.md): a level
// doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows (8-cell
//     modules, filled, doorway slots, one stair, one sea hatch, wheel and
//     battery spots only in dry rooms), the library file in the editor's
//     layout, every room type drawn.
//   · THE FROZEN MAP: L1 regenerates to its pinned fingerprint; ONE door, The
//     Stair, on the map's rim; everything reachable, nothing sealed.
//   · THE WAY DOWN (THE HANDWHEEL): the sea hatch in the Wet End, deep; the
//     Handwheel on one of the wheel spots, out of the water, far from the way
//     in AND from the hatch; enough wheel and battery spots — every one on a
//     cell the PLACEMENT LAW allows, and walkable to.
//   · THE ZONES: the Wet End the far band, every room wholly in one zone, the
//     flooded rooms exactly the Wet End's, and nothing to find in the water.
//   · THE DARK: every room hangs a fixture, and the deco is the level's own.
//   · THE PLACEMENT LAW on Lights Out: 2,000 random relic draws, all lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-lights.js"));
const V = require(dist("lights-vocab.js"));
const { lintLightsTile } = require(dist("lights-tiles.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.LIGHTS_LIBRARY;
const errs = lib.flatMap((d) => lintLightsTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") === 1, `one start and one goal (${roles("start")} · ${roles("goal")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "lights-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
ok(new Set(lib.map((d) => d.type)).size === V.LIGHTS_TYPES.length, `every one of the ${V.LIGHTS_TYPES.length} room types has a room in the library`);
ok(lib.every((d) => !(d.props ?? []).some((pl) => pl.p === "valve-wheel")), "no valve wheel as dressing — the Handwheel is the only wheel down here");

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateLightsSector(plan.sector) });
function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const door = s.doors.length === 1 && s.doors[0].name === V.LIGHTS_DOOR_NAME && (s.doors[0].x <= 3 || s.doors[0].y <= 3 || s.doors[0].x >= size - 4 || s.doors[0].y >= size - 4);
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const at = (p) => (p ? d0[p.y * size + p.x] : -1);
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  // the hatch: in the Wet End, deep
  const hatch = plan.hatch;
  const hatchWet = !!hatch && s.section[hatch.y * size + hatch.x] === V.ZONE_WET && W.lightsWet(s, hatch.x, hatch.y);
  const hatchDeep = at(hatch) >= maxD * 0.5;
  // the wheel: a dry spot, far from the way in and from the hatch
  const wheel = plan.wheel;
  const dh = hatch ? W.distanceMap(s, [{ x: hatch.x, y: hatch.y }]) : null;
  const wheelSpot = !!wheel && plan.wheelSpots.some((p) => p.x === wheel.x && p.y === wheel.y);
  const wheelDry = !!wheel && !W.lightsWet(s, wheel.x, wheel.y) && s.section[wheel.y * size + wheel.x] === V.ZONE_DARK;
  const wheelFarIn = at(wheel) >= maxD * 0.35;
  const wheelFarHatch = !!dh && dh[wheel.y * size + wheel.x] >= maxD * 0.25;
  const spotsReach = [...plan.wheelSpots, ...plan.batterySpots].every((p) => at(p) > 0);
  // the zones
  let split = 0;
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) set.add(s.section[y * size + x]);
    if (set.size !== 1) split++;
  }
  const wetRooms = plan.insts.filter((i) => i.zone === V.ZONE_WET);
  const wetSets = wetRooms.every((i) => lib.find((d) => d.id === i.tileId)?.set === "wet" && V.WET_TYPES.includes(i.type));
  const drySets = plan.insts.filter((i) => i.zone !== V.ZONE_WET).every((i) => lib.find((d) => d.id === i.tileId)?.set === "dark" && !V.WET_TYPES.includes(i.type));
  let wetOutside = 0;
  for (let i = 0; i < size * size; i++) if (W.lightsWet(s, i % size, (i / size) | 0) && s.section[i] !== V.ZONE_WET) wetOutside++;
  // the dark: every room hangs a fixture
  let noLamp = 0;
  for (const i of plan.insts) {
    let lamps = 0;
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) if (V.ldecoKind(s.deco[y * size + x]) === V.LDECO.lamp) lamps++;
    if (!lamps) noLamp++;
  }
  const known = new Set(Object.values(V.LDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.ldecoKind(s.deco[k]))) unknown++;
  if (!full) {
    ok(reach && door && !plan.unmet.length && hatchWet && hatchDeep && wheelSpot && wheelDry && wheelFarIn && wheelFarHatch && spotsReach && r.unlawful === 0 && r.wetSpots === 0 && split === 0 && wetSets && drySets && wetOutside === 0 && noLamp === 0 && unknown === 0,
      `reachable, one door, the hatch deep in the Wet End (${at(hatch)}/${maxD} steps), the Handwheel dry and far (${at(wheel)} from the way in), ${plan.wheelSpots.length} wheel spots, ${plan.batterySpots.length} battery spots (${plan.insts.length} rooms)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.cuts} doorways cut through)`);
  ok(door, `${label}: one door, ${V.LIGHTS_DOOR_NAME}, on the map's rim`);
  ok(!plan.unmet.length, `${label}: every room the library asks for`);
  ok(r.hatch && hatchWet && hatchDeep, `${label}: ${V.SEAHATCH_NAME} in the Wet End's water, deep (${at(hatch)} steps of ${maxD})`);
  ok(wheelSpot && wheelDry, `${label}: the Handwheel on one of the wheel spots, out of the water (${wheel?.x},${wheel?.y})`);
  ok(wheelFarIn && wheelFarHatch, `${label}: the Handwheel far from the way in (${at(wheel)} steps) AND from the hatch (${dh?.[wheel.y * size + wheel.x]}) — two searches, not one`);
  ok(plan.wheelSpots.length >= V.WHEEL_SPOTS_MIN && plan.batterySpots.length >= V.BATTERY_SPOTS_MIN, `${label}: ${plan.wheelSpots.length} wheel spots, ${plan.batterySpots.length} battery spots`);
  ok(r.unlawful === 0 && spotsReach && at(hatch) > 0, `${label}: the hatch and every wheel and battery spot on cells the placement law allows, all walkable to`);
  ok(split === 0 && wetSets && drySets && wetRooms.length >= 8, `${label}: every room wholly inside one zone — ${wetRooms.length} rooms in the Wet End, all flooded, the rest dry`);
  ok(wetOutside === 0 && r.wetSpots === 0 && r.wetCells > 400, `${label}: ${r.wetCells} cells under water, all in the Wet End, nothing to find in them`);
  ok(noLamp === 0, `${label}: every room hangs a fixture, dead (${r.lamps} — the fixture law)`);
  ok(unknown === 0, `${label}: the deco is Lights Out's own vocabulary`);
}

console.log(`-- the frozen level, ${W.SECTOR_L.id} (seed ${W.SECTOR_L.seed}, ${W.SECTOR_L.size}²)`);
const frozen = report(W.planLightsSector(W.SECTOR_L.seed, W.SECTOR_L.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_L_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
ok(!!frozen.s.lights && frozen.s.lights.wheel?.x === frozen.plan.wheel?.x && frozen.s.lights.wheelSpots.length === frozen.plan.wheelSpots.length, "the plan's wheel, spots and hatch ride on the sector for the server (outside the fingerprint)");
mapRules("L1", frozen);
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
  ok(found >= 1900 && unlawful === 0, `L1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "L1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_L.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planLightsSector(seed, W.SECTOR_L.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
