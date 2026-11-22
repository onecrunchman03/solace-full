// THALASSOPHOBIA's MAP — Level 7, sector T1, a drowned city built from
// hand-drawn blocks (BACKROOMS.md → "LEVEL 7 — THALASSOPHOBIA"; the generator
// is src/backrooms/worldgen-ocean.ts). Part of the SHIP GATE (CLAUDE.md): a
// level doesn't open until its map harness is green.
//
//   · THE LIBRARY: every block passes the checker the map editor shows (10-cell
//     modules, filled, water doorways, one hatch, one subway stair, helmet
//     spots only on dry floor), the library file in the editor's layout, every
//     type drawn.
//   · THE FROZEN MAP: T1 regenerates to its pinned fingerprint; ONE door, The
//     Hatch, in the tower; everything reachable, nothing sealed — every roof
//     climbable from a swim.
//   · THE DIVE: the subway stair at the bottom of the sunken plaza, far from
//     the way in, and too deep for one breath (the helmet is the key); the
//     Diving Helmet on a dry spot far from the tower AND from the plaza.
//   · THE SEA: one water surface, every open cell below it in the water, no
//     lethal pit anywhere however deep; the Drop the rim, the city inside,
//     every block wholly in one zone.
//   · THE TOWER: walled, with doorways out, and lit.
//   · THE PLACEMENT LAW on Thalassophobia: 2,000 random relic draws, lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-ocean.js"));
const V = require(dist("ocean-vocab.js"));
const G = require(dist("worldgen.js"));
const { lintOceanTile } = require(dist("ocean-tiles.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the block library");
const lib = W.OCEAN_LIBRARY;
const errs = lib.flatMap((d) => lintOceanTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} blocks pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every block id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") === 1, `one start and one goal (${roles("start")} · ${roles("goal")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "ocean-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
{
  const drawn = new Set();
  for (const d of lib) {
    const t = lintOceanTile(d).tile;
    for (let i = 0; i < t.w * t.h; i++) if (t.cell[i] === 1) drawn.add(t.dia.types[t.zone[i]]);
  }
  ok(V.OCEAN_TYPES.every((ty) => drawn.has(ty)), `every one of the ${V.OCEAN_TYPES.length} types is drawn somewhere in the library`);
}

// the dive's arithmetic: a diver goes down at ~1m/s; ten seconds of breath
// and then the water drains 10 health a second (service.ts, DROWN_*) — so on
// one breath you have about 20 seconds before the deep keeps you
const DIVE_MPS = 1.0;
const ONE_BREATH_S = V.BREATH_MS / 1000 + 100 / 10;
const HELMET_S = V.HELMET_BREATH_MS / 1000 + 100 / 10;

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateOceanSector(plan.sector) });
function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const at = (p) => (p ? d0[p.y * size + p.x] : -1);
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  const door = s.doors.length === 1 && s.doors[0].name === V.OCEAN_DOOR_NAME && s.section[s.doors[0].y * size + s.doors[0].x] === V.ZONE_TOWER;
  // the dive
  const sub = plan.subway;
  const subI = sub ? sub.y * size + sub.x : -1;
  const subPlaza = !!sub && W.oceanTypeAt(s, sub.x, sub.y) === "seaplaza" && s.floor[subI] === V.PLAZA_FLOOR && W.oceanWet(s, sub.x, sub.y);
  const subDeep = at(sub) >= maxD * 0.5;
  const depthM = sub ? (V.WATER_LEVEL - s.floor[subI]) * 0.5 : 0;
  const oneBreathFails = depthM / DIVE_MPS > ONE_BREATH_S; // can't even get there
  const helmetDoes = (2 * depthM) / DIVE_MPS < HELMET_S; // there and back on the helmet
  // the helmet
  const hel = plan.helmet;
  const dsub = sub ? W.distanceMap(s, [{ x: sub.x, y: sub.y }]) : null;
  const helSpot = !!hel && plan.helmetSpots.some((p) => p.x === hel.x && p.y === hel.y);
  const helDry = !!hel && !W.oceanWet(s, hel.x, hel.y) && s.section[hel.y * size + hel.x] === V.ZONE_CITY;
  const helFarIn = at(hel) >= maxD * 0.35;
  const helFarSub = !!dsub && dsub[hel.y * size + hel.x] >= maxD * 0.25;
  const spotsReach = plan.helmetSpots.every((p) => at(p) > 0);
  // the sea
  let waterOff = 0, effOff = 0, dryUnder = 0, pits = 0;
  for (let i = 0; i < size * size; i++) {
    if (s.solid[i]) continue;
    const wet = s.water[i] !== G.WATER_NONE;
    if (wet && s.water[i] !== V.WATER_LEVEL) waterOff++;
    if (wet && s.eff[i] !== V.WATER_LEVEL) effOff++;
    if (!wet && s.floor[i] < V.WATER_LEVEL) dryUnder++;
    if (G.isPitCell(s, i % size, (i / size) | 0)) pits++;
  }
  // the zones
  let split = 0, dropWrong = 0, cityWrong = 0;
  const lid = (i) => lib.find((d) => d.id === i.tileId);
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) if (s.section[y * size + x] !== V.ZONE_TOWER) set.add(s.section[y * size + x]);
    if (set.size > 1) split++;
    const ring = Math.min(i.mx, i.my, 16 - i.mx - i.mw, 16 - i.my - i.mh);
    if (ring < V.DROP_RING && lid(i)?.set !== "drop") dropWrong++;
    if (ring >= V.DROP_RING && lid(i)?.set !== "city") cityWrong++;
  }
  // the Drop's water is the deep; the city's no shallower than a street
  let dropShallow = 0;
  for (let i = 0; i < size * size; i++) {
    if (s.solid[i] || s.water[i] === G.WATER_NONE) continue;
    const type = W.oceanTypeAt(s, i % size, (i / size) | 0);
    if (s.section[i] === V.ZONE_DROP && type === "seadrop" && s.floor[i] !== V.DROP_FLOOR) dropShallow++;
  }
  // the tower: walled, doorways out, lit
  const tower = plan.insts.find((i) => i.role === "start");
  let tWalls = 0, tGaps = 0, tLamps = 0;
  if (tower) {
    for (let y = tower.y; y < tower.y + tower.h; y++)
      for (let x = tower.x; x < tower.x + tower.w; x++) {
        const i = y * size + x;
        if (V.tdecoKind(s.deco[i]) === V.TDECO.lamp) tLamps++;
        if (s.section[i] !== V.ZONE_TOWER) continue;
        for (const [nx, ny, wall] of [[x, y - 1, s.wallN[i]], [x - 1, y, s.wallW[i]], [x, y + 1, s.wallN[i + size]], [x + 1, y, s.wallW[i + 1]]]) {
          const j = ny * size + nx;
          if (s.solid[j] || s.section[j] === V.ZONE_TOWER) continue;
          if (wall) tWalls++;
          else tGaps++;
        }
      }
  }
  // buildings rising into the fog in the city
  const fogTowers = plan.insts.filter((i) => i.tileId === "skyscraper").length;
  const known = new Set(Object.values(V.TDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.tdecoKind(s.deco[k]))) unknown++;
  const all = reach && door && !plan.unmet.length && r.subway && subPlaza && subDeep && oneBreathFails && helmetDoes && helSpot && helDry && helFarIn && helFarSub && spotsReach && r.unlawful === 0 && waterOff + effOff + dryUnder + pits === 0 && split + dropWrong + cityWrong + dropShallow === 0 && tWalls > 0 && tGaps > 0 && tLamps > 0 && unknown === 0;
  if (!full) {
    ok(all, `reachable, one door in the tower, the subway ${depthM}m down and far (${at(sub)}/${maxD}), the helmet dry and far (${at(hel)} from the way in), ${plan.helmetSpots.length} helmet spots, one sea, no pits (${plan.insts.length} blocks)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed — every roof climbable from a swim (${plan.insts.length} blocks)`);
  ok(door, `${label}: one door, ${V.OCEAN_DOOR_NAME}, inside the tower`);
  ok(!plan.unmet.length, `${label}: every block the library asks for`);
  ok(r.subway && subPlaza && subDeep, `${label}: ${V.SUBWAY_NAME} at the bottom of the sunken plaza, ${depthM}m down, far from the way in (${at(sub)} steps of ${maxD})`);
  ok(oneBreathFails, `${label}: one breath can't reach it — ${depthM}m at ${DIVE_MPS}m/s is ${depthM / DIVE_MPS}s, past the ~${ONE_BREATH_S}s a breath and the drowning give you`);
  ok(helmetDoes, `${label}: the helmet can — there and back is ${(2 * depthM) / DIVE_MPS}s, inside the helmet's ~${HELMET_S}s`);
  ok(helSpot && helDry, `${label}: the Diving Helmet on one of the helmet spots, on dry roof in the city (${hel?.x},${hel?.y})`);
  ok(helFarIn && helFarSub, `${label}: the helmet far from the way in (${at(hel)} steps) AND from the plaza (${dsub?.[hel.y * size + hel.x]}) — two searches, not one`);
  ok(plan.helmetSpots.length >= V.HELMET_SPOTS_MIN && r.unlawful === 0 && spotsReach, `${label}: ${plan.helmetSpots.length} helmet spots, every one lawful and walkable to`);
  ok(waterOff === 0 && effOff === 0 && dryUnder === 0, `${label}: one sea — ${r.wetCells} cells in the water, every one at the surface level and floated at it`);
  ok(pits === 0 && s.floor.some((f) => f <= V.PLAZA_FLOOR), `${label}: no lethal pit anywhere, though the floor goes down to ${Math.min(...s.floor)} steps — under water nothing is a shaft`);
  ok(split === 0 && dropWrong === 0 && cityWrong === 0, `${label}: the Drop the outer ${V.DROP_RING} rings, the city inside, every block wholly in one zone`);
  ok(dropShallow === 0 && r.dropCells > 5000, `${label}: the Drop's water is the deep (${V.DROP_FLOOR} steps), ${r.dropCells} cells of it`);
  ok(tWalls > 0 && tGaps >= 2 && tLamps > 0, `${label}: the tower walled (${tWalls} edges), with doorways out (${tGaps}), and lit (${tLamps} fixtures)`);
  ok(fogTowers >= 4, `${label}: ${fogTowers} buildings rising into the fog`);
  ok(unknown === 0, `${label}: the deco is Thalassophobia's own vocabulary`);
}

console.log(`-- the frozen level, ${W.SECTOR_T.id} (seed ${W.SECTOR_T.seed}, ${W.SECTOR_T.size}²)`);
const frozen = report(W.planOceanSector(W.SECTOR_T.seed, W.SECTOR_T.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_T_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
ok(!!frozen.s.ocean && frozen.s.ocean.helmet?.x === frozen.plan.helmet?.x && frozen.s.ocean.helmetSpots.length === frozen.plan.helmetSpots.length && frozen.s.ocean.subway?.x === frozen.plan.subway?.x, "the plan's helmet, spots and subway ride on the sector for the server (outside the fingerprint)");
mapRules("T1", frozen);
// THE SEA GETS DARKER GOING DOWN (Nov 2026 polish round): the client's baked
// light fades with depth under the surface (y = 0), so the sunken square's floor
// reads near-black (the references' ~20/255), not lit like a roof; the tower's
// lid is lifted against the near-black hemisphere ground.
{
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const curve = /if \(ocean\) return \(OCEAN_BASE_LIT \+ 0\.4 \* e\) \* b \* \(py !== undefined && py < 0 \? Math\.max\(0\.05, Math\.max\(0, 1 \+ py \/ 27\) \*\* 2\) : 1\);/.test(src);
  const fade = (py) => (py < 0 ? Math.max(0.05, Math.max(0, 1 + py / 27) ** 2) : 1);
  const s = frozen.s;
  let deepest = 0;
  for (let i = 0; i < s.size * s.size; i++) if (s.districts[s.district[i]]?.type === "seaplaza" && !s.solid[i]) deepest = Math.min(deepest, s.floor[i] * G.FLOOR_STEP);
  const lid = /const l = lum\(0\.9, 0\.32, lightAt\(sx, sz\), sx, sz\) \* \(ocean \? OCEAN_CEIL_LIFT : 1\);/.test(src);
  ok(curve && lid && deepest < -15 && fade(deepest) <= 0.1 && fade(-3) >= 0.7, `the light fades going down: the square's floor (${deepest}m) takes ${(fade(deepest) * 100).toFixed(0)}% of the surface's, a street 3m down ${(fade(-3) * 100).toFixed(0)}%; the tower's lid is lifted`);
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
  ok(found >= 1900 && unlawful === 0, `T1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "T1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_T.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planOceanSector(seed, W.SECTOR_T.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
