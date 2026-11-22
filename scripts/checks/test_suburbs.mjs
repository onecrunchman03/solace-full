// THE SUBURBS' MAP — Level 9, sector U1, built from hand-drawn rooms
// (BACKROOMS.md → "LEVEL 9 — THE SUBURBS"; the generator is
// src/backrooms/worldgen-suburb.ts). Part of the SHIP GATE (CLAUDE.md): a level
// doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows, the
//     library file in the editor's layout, every room type drawn, each type in
//     a set it belongs to; the checker refuses what the level must never have.
//   · THE FROZEN MAP: U1 regenerates to its pinned fingerprint; ONE door, The
//     Manhole, on the map's rim; everything reachable, nothing sealed.
//   · THE STREETS: the roads one connected grid from the manhole; every street
//     piece on a street module; most houses turned with their front to a street.
//   · THE WAY OUT: Number 9's front door against its house's wall, deep from
//     the manhole, its one porch light lit; the House Key on one of the key
//     spots, indoors, well into the neighbourhood and a walk from Number 9;
//     every key spot indoors, lawful and walkable to.
//   · INDOORS AND OUT: every cell's section says what its type is (houses and
//     garages in, everything else out); the cul-de-sac the only safe ground.
//   · THE LIGHT: streetlights outdoors only, enough lit to see by, most of the
//     outdoors DARK (the Watch's ground), the pools never reaching indoors.
//   · THE PLACEMENT LAW on the Suburbs: 2,000 random relic draws, lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-suburb.js"));
const V = require(dist("suburb-vocab.js"));
const T = require(dist("suburb-tiles.js"));
const G = require(dist("worldgen.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.SUBURB_LIBRARY;
const errs = lib.flatMap((d) => T.lintSuburbTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") === 1, `one start and one goal (${roles("start")} · ${roles("goal")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "suburb-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
const drawnTypes = new Set(lib.map((d) => d.type));
for (const d of lib) for (const row of d.map) for (const ch of row) if (T.SUBURB_ZONES[ch]) drawnTypes.add(T.SUBURB_ZONES[ch]);
ok(drawnTypes.size === V.SUBURB_TYPES.length, `every one of the ${V.SUBURB_TYPES.length} room types is drawn in the library`);
ok(lib.every((d) => T.SUBURB_TYPE_SETS[d.type].includes(d.set)), "every room is in a set its type belongs to");
ok(lib.filter((d) => d.type === "house").every((d) => d.furn?.some((r) => r.includes("K"))), "every house draws at least one key spot");
{
  const ring = ["yyyyyyyy", "yyyyyyyy", "yy....yy", "yy....yy", "yy....yy", "yy....yy", "yyyyyyyy", "yyyyyyyy"];
  const base = { id: "t", kind: "yard", set: "lot", role: "block", type: "yard", map: Array(8).fill("yyyyyyyy"), doors: [[3, 0, "N", 2], [3, 7, "S", 2]] };
  const refused = (def, word) => T.lintSuburbTile(def).errors.some((e) => e.includes(word));
  ok(refused({ ...base, furn: ["........", "........", "...K....", "........", "........", "........", "........", "........"] }, "indoors"), "the checker refuses a key spot outdoors");
  ok(refused({ ...base, id: "t2", type: "house", kind: "house", map: ring, furn: ["........", "........", "...*....", "........", "........", "........", "........", "........"] }, "outdoors"), "the checker refuses a streetlight indoors");
  ok(refused({ ...base, id: "t3", map: ["yyyyyyyy", "yyyyyyyy", "yyrryyyy", "yyrryyyy", "yyyyyyyy", "yyyyyyyy", "yyyyyyyy", "yyyyyyyy"] }, "road"), "the checker refuses road on a lot");
  ok(refused({ ...base, id: "t4", set: "street", type: "road", kind: "straight", map: ["rrrrrrrr", "rrrrrrrr", "rrhhrrrr", "rrhhrrrr", "rrrrrrrr", "rrrrrrrr", "rrrrrrrr", "rrrrrrrr"], furn: ["........", "........", "........", "........", "........", "......*.", "........", "........"] }, "houses and garages"), "the checker refuses a house in the street");
  ok(refused({ ...base, id: "t5", furn: ["........", "........", "....P...", "........", "........", "........", "........", "........"] }, "only Number 9"), "the checker refuses a lit porch light anywhere but Number 9");
  ok(refused({ ...base, id: "t6", doors: [[2, 0, "N", 2], [3, 7, "S", 2]] }, "slot"), "the checker refuses a doorway off the slots");
}

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateSuburbSector(plan.sector) });
/** The connected pieces of the cells of these types (walkable adjacency). */
function pieces(s, types) {
  const size = s.size;
  const of = (x, y) => types.includes(W.suburbTypeAt(s, x, y));
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

function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const door = s.doors.length === 1 && s.doors[0].name === V.MANHOLE_NAME && (s.doors[0].x <= 3 || s.doors[0].y <= 3 || s.doors[0].x >= size - 4 || s.doors[0].y >= size - 4);
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const at = (p) => (p ? d0[p.y * size + p.x] : -1);
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  // the front door: on the porch, outdoors, its back against Number 9's wall
  const fd = plan.frontDoor;
  let fdOk = false;
  if (fd) {
    const bx = fd.x + [0, 1, 0, -1][fd.side], by = fd.y + [-1, 0, 1, 0][fd.side];
    const i = fd.y * size + fd.x, j = by * size + bx;
    const walled = s.solid[j] || (fd.side === 0 && s.wallN[i]) || (fd.side === 2 && s.wallN[j]) || (fd.side === 3 && s.wallW[i]) || (fd.side === 1 && s.wallW[j]);
    fdOk = W.suburbTypeAt(s, fd.x, fd.y) === "porch" && s.section[i] === V.ZONE_OUT && !!walled;
  }
  const fdFar = at(fd) >= maxD * 0.6;
  // the key
  const key = plan.key;
  const keySpot = !!key && plan.keySpots.some((p) => p.x === key.x && p.y === key.y);
  const keyIn = keySpot && W.suburbIndoor(s, key.x, key.y);
  const fromFd = fd ? W.distanceMap(s, [{ x: fd.x, y: fd.y }]) : null;
  const keyH = key && fromFd ? fromFd[key.y * size + key.x] : -1;
  const keyFar = at(key) >= maxD * 0.3 && keyH >= maxD * 0.3;
  const spotsOk = plan.keySpots.length >= V.KEY_SPOTS_MIN && plan.keySpots.every((p) => at(p) > 0 && W.suburbIndoor(s, p.x, p.y)) && r.unlawful === 0 && r.badKey === 0;
  // indoors and out
  let sectionWrong = 0, safeCells = 0, safeElsewhere = 0, outdoor = 0;
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const t = W.suburbTypeAt(s, x, y);
    if (!t) continue;
    const want = V.SUBURB_INDOOR_TYPES.includes(t) ? V.ZONE_IN : V.ZONE_OUT;
    if (s.section[i] !== want) sectionWrong++;
    if (want === V.ZONE_OUT) outdoor++;
    if (W.suburbSafe(s, x, y)) {
      safeCells++;
      if (t !== "manhole") safeElsewhere++;
    }
  }
  // the streets
  const roads = pieces(s, ["road", "manhole"]);
  const manholeIn = roads.length >= 1 && roads[0].includes(s.doors[0].y * size + s.doors[0].x);
  const roadOne = roads.length === 1 && manholeIn;
  const GM = Math.floor((size - 2) / V.MODULE);
  const streetInsts = plan.insts.filter((i) => i.set === "street");
  const onStreet = streetInsts.every((i) => plan.streetModule[i.my * GM + i.mx]);
  const streetFilled = plan.streetModule.every((st, k) => !st || plan.insts.some((i) => i.set === "street" && i.mx <= k % GM && k % GM < i.mx + i.mw && i.my <= ((k / GM) | 0) && ((k / GM) | 0) < i.my + i.mh));
  const houses = plan.insts.filter((i) => i.type === "house").length;
  // the light
  const lit = W.suburbLitMap(s);
  let litIndoor = 0, lampIndoor = 0, porchLit = 0;
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    if (lit[i] && s.section[i] !== V.ZONE_OUT) litIndoor++;
    const b = s.deco[i];
    if (V.udecoKind(b) !== V.UDECO.lamp) continue;
    if (W.suburbIndoor(s, x, y) && V.udecoVar(b) <= 2) lampIndoor++;
    if (V.udecoVar(b) === T.LAMP_PORCH) porchLit++;
  }
  const darkShare = 1 - r.litCells / outdoor;
  const known = new Set(Object.values(V.UDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.udecoKind(s.deco[k]))) unknown++;
  if (!full) {
    ok(reach && door && !plan.unmet.length && fdOk && fdFar && keyIn && keyFar && spotsOk && sectionWrong === 0 && safeElsewhere === 0 && roadOne && onStreet && streetFilled && litIndoor === 0 && lampIndoor === 0 && porchLit === 1 && r.litLamps >= 10 && darkShare >= 0.7 && unknown === 0,
      `reachable, one door, Number 9 deep (${at(fd)}/${maxD}), the key indoors and away (${at(key)}·${keyH}), ${plan.keySpots.length} key spots, the roads one grid, ${r.litLamps} lit lamps and ${(darkShare * 100).toFixed(0)}% of the outdoors dark (${plan.insts.length} rooms)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.opened} doorways opened)`);
  ok(door, `${label}: one door, ${V.MANHOLE_NAME}, on the map's rim`);
  ok(!plan.unmet.length, `${label}: every room the library asks for, every street module filled${plan.unmet.length ? " — " + plan.unmet.join(", ") : ""}`);
  ok(r.frontDoor && fdOk, `${label}: ${V.FRONT_DOOR_NAME} of ${V.HOME_NAME} on its porch, outdoors, its back against the house (${fd?.x},${fd?.y})`);
  ok(fdFar, `${label}: Number 9 deep from the manhole (${at(fd)} steps of ${maxD})`);
  ok(keyIn, `${label}: ${V.HOUSE_KEY_NAME} on one of the key spots, indoors (${key?.x},${key?.y})`);
  ok(keyFar, `${label}: the key well into the neighbourhood (${at(key)} from the manhole) and a walk from Number 9 (${keyH})`);
  ok(spotsOk, `${label}: ${plan.keySpots.length} key spots, all indoors, all lawful and walkable to`);
  ok(sectionWrong === 0, `${label}: every cell's section says what it is — houses and garages indoors, the rest out (${r.indoorCells} indoor cells)`);
  ok(safeCells > 0 && safeElsewhere === 0, `${label}: the manhole's cul-de-sac the only safe ground (${safeCells} cells)`);
  ok(roadOne, `${label}: the roads one connected grid, the manhole on it (${roads.length} piece${roads.length > 1 ? "s" : ""})`);
  ok(onStreet && streetFilled, `${label}: every street piece on a street module and every street module filled (${streetInsts.length} pieces)`);
  ok(houses >= 20 && plan.facing >= houses * 0.6, `${label}: ${houses} houses, ${plan.facing} lots turned with their front to a street`);
  ok(lampIndoor === 0 && litIndoor === 0, `${label}: every streetlight outdoors, and no pool of light reaches indoors`);
  ok(porchLit === 1, `${label}: one porch light lit on the whole street — Number 9's`);
  ok(r.litLamps >= 10 && darkShare >= 0.7, `${label}: ${r.litLamps} lit lamps (${r.litCells} lit cells) and ${(darkShare * 100).toFixed(0)}% of the outdoors dark — the Watch's ground`);
  ok(unknown === 0, `${label}: the deco is the Suburbs' own vocabulary`);
}

console.log(`-- the frozen level, ${W.SECTOR_U.id} (seed ${W.SECTOR_U.seed}, ${W.SECTOR_U.size}²)`);
const frozen = report(W.planSuburbSector(W.SECTOR_U.seed, W.SECTOR_U.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_U_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
ok(!!frozen.s.suburb && frozen.s.suburb.key?.x === frozen.plan.key?.x && frozen.s.suburb.keySpots.length === frozen.plan.keySpots.length && frozen.s.suburb.frontDoor?.x === frozen.plan.frontDoor?.x, "the plan's key, spots and front door ride on the sector for the server (outside the fingerprint)");
mapRules("U1", frozen);
// THE LOOK OF THE STREET (Nov 2026 polish round): Number 9's lot is porch-type
// from fence to fence, so it wears the lawn, not indoor decking; and a house's
// outer walls carry windows — drawn only, on a HOUSE (never a garage), so the
// map, the collision and the Watch's sight are untouched.
{
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const porchCells = frozen.s.district.reduce((a, d, i) => a + (frozen.s.districts[d]?.type === "porch" && !frozen.s.solid[i] ? 1 : 0), 0);
  ok(porchCells > 0 && /\bporch: \{ wall: "[\w-]+", floor: null,/.test(src), `Number 9's lot (${porchCells} porch cells) is lawn, not hardwood decking`);
  ok(/const subWindow = [\s\S]{0,400}?world\.typeAt\(e\.hx, e\.hy\) !== "house"\) return;/.test(src) && /subWindow\(horiz, cx, cz, e\);/.test(src), "a house's outer walls carry windows, a house's only, drawn into the wall's own mesh");
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
  ok(found >= 1900 && unlawful === 0, `U1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "U1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_U.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planSuburbSector(seed, W.SECTOR_U.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
