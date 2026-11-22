// THE TERROR HOTEL's MAP — Level 5, sector H1, built from hand-drawn rooms
// (BACKROOMS.md → "LEVEL 5 — TERROR HOTEL"; the generator is
// src/backrooms/worldgen-hotel.ts). Part of the SHIP GATE (CLAUDE.md): a level
// doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows (the
//     hotel's dialect: 8-cell modules, filled, doorway slots, one service
//     stair, one rusty door, one register, one key spot in every suite, a
//     suite with ONE door), the library file in the editor's layout.
//   · THE FROZEN MAP: H1 regenerates to its pinned fingerprint; ONE door, The
//     Service Stair, on the map's rim; everything reachable, nothing sealed.
//   · THE WAY DOWN (THE GUEST REGISTER): the register in The Beverly Room, in
//     the middle of the Main Hall; every suite numbered, no two alike, no
//     suite wearing a scenery door's number; the suite it names among them;
//     the rusty door in the Boiler Room, deep, far from its door — every one
//     on a cell the PLACEMENT LAW allows, and walkable to.
//   · THE ZONES: the Boiler Room the far band, every room wholly in one zone,
//     and the two meeting at ONE doorway; the furnaces all below stairs.
//   · THE LIFTS: in lift halls, enough of them to travel by.
//   · THE LIGHT: every room but the dark ones (where the moths nest) has a
//     fixture; the hall mostly lit, below stairs mostly dark; the way in and
//     the Beverly Room lit with nothing dead.
//   · THE PLACEMENT LAW on the hotel: 2,000 random relic draws, all lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-hotel.js"));
const V = require(dist("hotel-vocab.js"));
const { lintHotelTile } = require(dist("hotel-tiles.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.HOTEL_LIBRARY;
const errs = lib.flatMap((d) => lintHotelTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") >= 1 && roles("hub") === 1 && roles("gate") >= 1 && roles("suite") >= 1,
  `a start, a goal, the hub, a gate and suites (${roles("start")} · ${roles("goal")} · ${roles("hub")} · ${roles("gate")} · ${roles("suite")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "hotel-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
ok(new Set(lib.map((d) => d.type)).size === V.HOTEL_TYPES.length, `every one of the ${V.HOTEL_TYPES.length} room types has a room in the library`);
const sceneryNums = W.sceneryNumbers(lib);
let placards = 0;
for (const d of lib) for (const pl of d.props ?? []) if (pl.p === "sign-plate" && /^\d+$/.test(String(pl.text ?? ""))) placards++;
ok(sceneryNums.length >= 12 && sceneryNums.length === placards, `every corridor door carries its own number (${placards} placards, ${sceneryNums.length} numbers)`);
const minSuites = lib.filter((d) => d.role === "suite").reduce((a, d) => a + (d.min ?? 0), 0);
ok(minSuites >= V.SUITES_MIN, `the library asks for at least ${V.SUITES_MIN} suites (${minSuites})`);

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateHotelSector(plan.sector) });
const within = (l, p) => !!l && p.x >= l.x && p.x < l.x + l.w && p.y >= l.y && p.y < l.y + l.h;
const DARK = new Set(["linen-room", "coal-store", "suite-dark"]);
function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const door = s.doors.length === 1 && s.doors[0].name === V.HOTEL_DOOR_NAME && (s.doors[0].x <= 3 || s.doors[0].y <= 3 || s.doors[0].x >= size - 4 || s.doors[0].y >= size - 4);
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const at = (p) => (p ? d0[p.y * size + p.x] : -1);
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  // the register: in the Beverly Room, the Beverly Room nearer the middle of the hall than the edges
  const bev = s.landmarks.find((l) => l.name === V.BEVERLY_NAME);
  const regIn = within(bev, plan.register ?? { x: -1, y: -1 });
  const bevMid = bev ? Math.hypot(bev.x + bev.w / 2 - size / 2, bev.y + bev.h / 2 - size / 2) <= size * 0.3 : false;
  // the suites: numbered, unique, never a scenery number, every key spot in its own suite room
  const nums = plan.suites.map((q) => q.number);
  const uniqueNums = new Set(nums).size === nums.length && nums.every((x) => x >= 100 && x < 500 && !sceneryNums.includes(x));
  const suiteRooms = plan.insts.filter((i) => i.role === "suite");
  const keysInSuites = suiteRooms.every((i) => plan.suites.filter((q) => q.inst === i.id && within(i, q)).length === 1) && plan.suites.length === suiteRooms.length;
  const target = plan.suites[plan.target];
  const suitesReach = plan.suites.every((q) => at(q) > 0);
  // the rusty door: below stairs, deep, far from the Boiler Room's door
  const gate = plan.insts.find((i) => i.role === "gate");
  const rd = plan.rustydoor;
  const rdBelow = !!rd && W.hotelBelow(s, rd.x, rd.y);
  const rdFar = !!rd && !!gate && Math.hypot(rd.x - (gate.x + gate.w / 2), rd.y - (gate.y + gate.h / 2)) >= size * 0.3;
  const rdDeep = at(rd) >= maxD * 0.7;
  // the zones
  let split = 0;
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) set.add(s.section[y * size + x]);
    if (set.size !== 1) split++;
  }
  const boilerRooms = plan.insts.filter((i) => i.zone === V.ZONE_BOILER);
  const boilerSets = boilerRooms.every((i) => lib.find((d) => d.id === i.tileId)?.set === "boiler");
  const hallSets = plan.insts.filter((i) => i.zone !== V.ZONE_BOILER).every((i) => lib.find((d) => d.id === i.tileId)?.set === "hall");
  // the furnaces and lifts
  const furnBelow = plan.furnaces.every((f) => W.hotelBelow(s, f.x, f.y));
  const liftHalls = plan.insts.filter((i) => i.type === "lifthall");
  const liftsInHalls = plan.lifts.every((l) => liftHalls.some((h) => within(h, l)));
  // the light
  let darkRooms = 0, stairDead = 0, bevDead = 0;
  for (const i of plan.insts) {
    let lamps = 0, dead = 0;
    for (let y = i.y; y < i.y + i.h; y++)
      for (let x = i.x; x < i.x + i.w; x++) {
        const b = s.deco[y * size + x];
        const k = V.hdecoKind(b);
        if (k !== V.HDECO.lamp && k !== V.HDECO.sconce) continue;
        lamps++;
        const st = k === V.HDECO.lamp ? V.hdecoVar(b) : V.sconceState(V.hdecoVar(b));
        if (st !== 0) dead++;
      }
    if (!lamps && !DARK.has(i.tileId)) darkRooms++;
    if (i.role === "start") stairDead += dead;
    if (i.role === "hub") bevDead += dead;
  }
  let hallL = 0, hallDead = 0, belowL = 0, belowDead = 0;
  for (let k = 0; k < size * size; k++) {
    const b = s.deco[k];
    const kind = V.hdecoKind(b);
    if (kind !== V.HDECO.lamp && kind !== V.HDECO.sconce) continue;
    const st = kind === V.HDECO.lamp ? V.hdecoVar(b) : V.sconceState(V.hdecoVar(b));
    if (s.section[k] === V.ZONE_BOILER) { belowL++; if (st === 1) belowDead++; }
    else { hallL++; if (st === 1) hallDead++; }
  }
  const known = new Set(Object.values(V.HDECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.hdecoKind(s.deco[k]))) unknown++;
  if (!full) {
    ok(reach && door && !plan.unmet.length && regIn && uniqueNums && keysInSuites && !!target && suitesReach && rdBelow && rdFar && r.unlawful === 0 && split === 0 && boilerSets && hallSets && r.crossings === 2 && furnBelow && liftsInHalls && plan.lifts.length >= 4 && darkRooms === 0 && stairDead + bevDead === 0 && unknown === 0,
      `reachable, one door, the register in the Beverly Room naming one of ${plan.suites.length} suites, the rusty door deep below stairs (${at(rd)}/${maxD} steps), one doorway between the zones, ${plan.lifts.length} lift doors (${plan.insts.length} rooms, ${plan.cuts} cuts)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.cuts} doorways cut through)`);
  ok(door, `${label}: one door, ${V.HOTEL_DOOR_NAME}, on the map's rim`);
  ok(!plan.unmet.length, `${label}: every room the library asks for`);
  ok(r.register && regIn && bevMid, `${label}: the guest register lies in ${V.BEVERLY_NAME}, near the middle of the hotel`);
  ok(plan.suites.length >= V.SUITES_MIN && plan.suites.length <= V.SUITES_MAX && keysInSuites, `${label}: ${plan.suites.length} suites (${V.SUITES_MIN}-${V.SUITES_MAX}), each with exactly one Boiler Key spot`);
  ok(uniqueNums, `${label}: every suite numbered, no two alike, none wearing a corridor door's number (${nums.join(", ")})`);
  ok(!!target && Number.isInteger(target.number), `${label}: the register names a real suite — No. ${target?.number}`);
  ok(rdBelow && rdFar && rdDeep, `${label}: ${V.RUSTYDOOR_NAME} below stairs, far from its door, deep (${at(rd)} steps of ${maxD})`);
  ok(r.unlawful === 0 && at(plan.register) > 0 && suitesReach && at(rd) > 0, `${label}: the register, every key spot, every lift and the rusty door on cells the placement law allows, all walkable to`);
  ok(split === 0 && boilerSets && hallSets && boilerRooms.length > 10, `${label}: every room wholly inside one zone — ${boilerRooms.length} rooms below stairs, the rest in the Main Hall`);
  ok(r.crossings === 2, `${label}: the Main Hall and the Boiler Room meet at ONE doorway (${r.crossings / 2})`);
  ok(furnBelow && r.furnaces >= 8, `${label}: ${r.furnaces} furnaces, every one below stairs`);
  ok(liftsInHalls && plan.lifts.length >= 4 && liftHalls.length >= 2, `${label}: ${plan.lifts.length} lift doors in ${liftHalls.length} lift halls`);
  ok(r.nests >= 3, `${label}: ${r.nests} moth nests`);
  ok(darkRooms === 0, `${label}: every room has a fixture but the dark ones the moths nest in (${r.lamps} — the fixture law)`);
  ok(hallDead / hallL < 0.3 && belowDead / belowL > 0.35, `${label}: the hall mostly lit (${hallDead}/${hallL} dead), below stairs mostly dark (${belowDead}/${belowL} dead)`);
  ok(stairDead === 0 && bevDead === 0, `${label}: ${V.HOTEL_DOOR_NAME} and ${V.BEVERLY_NAME} lit, nothing dead`);
  ok(unknown === 0, `${label}: the deco is the hotel's own vocabulary`);
}

console.log(`-- the frozen hotel, ${W.SECTOR_H.id} (seed ${W.SECTOR_H.seed}, ${W.SECTOR_H.size}²)`);
const frozen = report(W.planHotelSector(W.SECTOR_H.seed, W.SECTOR_H.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_H_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
mapRules("H1", frozen);
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
  ok(found >= 1900 && unlawful === 0, `H1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "H1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_H.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planHotelSector(seed, W.SECTOR_H.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
