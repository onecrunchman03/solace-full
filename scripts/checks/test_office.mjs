// THE ABANDONED OFFICE's MAP — Level 4, sector O1, built from hand-drawn rooms
// (BACKROOMS.md → "LEVEL 4 — THE ABANDONED OFFICE"; the generator is
// src/backrooms/worldgen-office.ts). Part of the SHIP GATE (CLAUDE.md): a level
// doesn't open until its map harness is green.
//
//   · THE LIBRARY: every room passes the checker the map editor shows (the
//     office's dialect: 8-cell modules, filled, doorway slots, one lift in the
//     start room, one stairwell door in the goal room, one keycard in the key
//     room), the library file in the editor's layout.
//   · THE FROZEN MAP: O1 regenerates to its pinned fingerprint; ONE door, The
//     Lift, on the map's rim; everything reachable, nothing sealed.
//   · THE WAY DOWN: the keycard in The Security Office, deep from the lift; the
//     stairwell door in The Stairwell, far from both; both on cells the
//     PLACEMENT LAW allows, and walkable to.
//   · THE LIGHT (the Temp's whole rule): every room inside one blink zone and
//     every zone used; every room has a troffer (the fixture law), most of the
//     building's are dead and the floor is lit in pools; the Lift Lobby lit
//     wall to wall (its safe room); windows only on the building's edge.
//   · THE PLACEMENT LAW on the office: 2,000 random relic draws, all lawful.
//   · THE GENERATOR, sound on six other seeds by the same rules.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (m) => path.join(ROOT, "dist", "backrooms", m);
const W = require(dist("worldgen-office.js"));
const V = require(dist("office-vocab.js"));
const { lintOfficeTile } = require(dist("office-tiles.js"));
const { formatLibrary } = require(dist("tiles.js"));
const { whyUnplaceable, pickRelicCell, markProblems } = require(dist("placement.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// ---- THE LIBRARY -------------------------------------------------------------------------
console.log("-- the room library");
const lib = W.OFFICE_LIBRARY;
const errs = lib.flatMap((d) => lintOfficeTile(d).errors.map((e) => `${d.id}: ${e}`));
ok(errs.length === 0, `all ${lib.length} rooms pass the editor's checker${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
ok(new Set(lib.map((d) => d.id)).size === lib.length, "every room id is unique");
const roles = (r) => lib.filter((d) => d.role === r).length;
ok(roles("start") === 1 && roles("goal") >= 1 && roles("key") >= 1, `a start room, a goal room and a key room (${roles("start")} · ${roles("goal")} · ${roles("key")})`);
const raw = readFileSync(path.join(ROOT, "src", "backrooms", "office-rooms.json"), "utf8").replace(/\r\n/g, "\n");
ok(raw === formatLibrary(lib), "the library file is in the map editor's own layout (a save round-trips it)");
ok(new Set(lib.map((d) => d.type)).size === V.OFFICE_TYPES.length, `every one of the ${V.OFFICE_TYPES.length} room types has a room in the library`);

// ---- THE MAP RULES -----------------------------------------------------------------------
const report = (plan) => ({ plan, s: plan.sector, r: W.validateOfficeSector(plan.sector) });
const within = (l, p) => !!l && p.x >= l.x && p.x < l.x + l.w && p.y >= l.y && p.y < l.y + l.h;
function mapRules(label, { plan, s, r }, full = true) {
  const size = s.size;
  const reach = r.reachablePct === 100 && plan.lostCells === 0 && r.strandedCells === 0 && r.isolatedDoors === 0;
  const door = s.doors.length === 1 && s.doors[0].name === V.OFFICE_DOOR_NAME && (s.doors[0].x <= 3 || s.doors[0].y <= 3 || s.doors[0].x >= size - 4 || s.doors[0].y >= size - 4);
  // the way down
  const d0 = W.distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  let maxD = 0;
  for (let i = 0; i < size * size; i++) if (d0[i] > maxD) maxD = d0[i];
  const sec = s.landmarks.find((l) => l.name === V.KEYCARD_ROOM_NAME);
  const stair = s.landmarks.find((l) => l.name === "The Stairwell");
  const kc = plan.keycard;
  const sd = plan.stairdoor;
  const kcD = kc ? d0[kc.y * size + kc.x] : -1;
  const sdD = sd ? d0[sd.y * size + sd.x] : -1;
  const deep = kcD >= maxD * 0.7;
  // the stairwell door is far from the keycard too (straight-line, a module's worth at least)
  const apart = kc && sd ? Math.hypot(kc.x - sd.x, kc.y - sd.y) >= size * 0.35 : false;
  // zones
  let split = 0;
  for (const i of plan.insts) {
    const set = new Set();
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) set.add(s.section[y * size + x]);
    if (set.size !== 1) split++;
  }
  let unzoned = 0;
  for (let k = 0; k < size * size; k++) if (!s.solid[k] && !(s.section[k] >= 1 && s.section[k] <= V.BLINK_ZONES)) unzoned++;
  // the light
  let darkRooms = 0;
  for (const i of plan.insts) {
    let lamps = 0;
    for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) if (V.odecoKind(s.deco[y * size + x]) === V.ODECO.lamp) lamps++;
    if (!lamps) darkRooms++;
  }
  const lit = W.officeLitCells(s);
  const lobby = s.landmarks.find((l) => l.name === "The Lift Lobby");
  let lobbyOpen = 0, lobbyLit = 0, lobbyDead = 0;
  if (lobby)
    for (let y = lobby.y; y < lobby.y + lobby.h; y++)
      for (let x = lobby.x; x < lobby.x + lobby.w; x++) {
        const i = y * size + x;
        if (V.odecoKind(s.deco[i]) === V.ODECO.lamp && V.odecoVar(s.deco[i]) !== 0) lobbyDead++;
        if (s.solid[i]) continue;
        lobbyOpen++;
        if (lit[i]) lobbyLit++;
      }
  // windows: each on the building's edge (nothing but solid, outside every room, to the rim)
  const inRoom = new Uint8Array(size * size);
  for (const i of plan.insts) for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) inRoom[y * size + x] = 1;
  let insideWindows = 0;
  for (let i = 0; i < size * size; i++) {
    if (V.odecoKind(s.deco[i]) !== V.ODECO.window) continue;
    const side = V.odecoVar(s.deco[i]);
    const dx = [0, 1, 0, -1][side], dy = [-1, 0, 1, 0][side];
    let x = (i % size) + dx, y = ((i / size) | 0) + dy, out = true;
    for (; x >= 0 && y >= 0 && x < size && y < size; x += dx, y += dy) {
      const j = y * size + x;
      if (!s.solid[j] || inRoom[j]) { out = false; break; }
    }
    if (!out) insideWindows++;
  }
  const known = new Set(Object.values(V.ODECO));
  let unknown = 0;
  for (let k = 0; k < size * size; k++) if (s.deco[k] && !known.has(V.odecoKind(s.deco[k]))) unknown++;
  if (!full) {
    ok(reach && door && !plan.unmet.length && r.keycard && r.stairdoor && r.unlawful === 0 && deep && split === 0 && unzoned === 0 && darkRooms === 0 && lobbyLit === lobbyOpen && insideWindows === 0 && unknown === 0,
      `reachable, one lift on the rim, the keycard deep (${kcD}/${maxD} steps) and the stairwell door far (${sdD} steps), lawful, zoned, every room with a troffer, the lobby lit (${plan.insts.length} rooms, ${plan.cuts} cuts)`);
    return;
  }
  ok(reach, `${label}: everything reachable, nothing sealed (${plan.insts.length} rooms, ${plan.cuts} doorways cut through)`);
  ok(door, `${label}: one door, ${V.OFFICE_DOOR_NAME}, on the map's rim`);
  ok(!plan.unmet.length, `${label}: every room the library asks for`);
  ok(r.keycard && within(sec, kc), `${label}: the keycard lies in ${V.KEYCARD_ROOM_NAME}`);
  ok(r.stairdoor && within(stair, sd), `${label}: ${V.STAIRDOOR_NAME} stands in The Stairwell`);
  ok(r.unlawful === 0 && kcD > 0 && sdD > 0, `${label}: the keycard and the stairwell door on cells the placement law allows, both walkable to from the lift`);
  ok(deep, `${label}: the keycard is deep — ${kcD} steps from the lift, of ${maxD} at most`);
  ok(apart && sdD >= maxD * 0.4, `${label}: the stairwell door is far from the lift (${sdD} steps) and from the keycard`);
  ok(split === 0 && unzoned === 0 && r.zones === V.BLINK_ZONES, `${label}: every room wholly inside one of the ${V.BLINK_ZONES} blink zones, every zone in use, every floor cell zoned`);
  ok(darkRooms === 0, `${label}: every room has a troffer (${r.lamps} — the fixture law: every light is a fixture)`);
  ok(r.deadLamps / r.lamps > 0.45 && r.litShare > 0.35 && r.litShare < 0.75, `${label}: most troffers dead (${r.deadLamps}/${r.lamps}), the floor lit in pools (${(r.litShare * 100).toFixed(0)}% lit)`);
  ok(!!lobby && lobbyOpen > 0 && lobbyLit === lobbyOpen && lobbyDead === 0, `${label}: The Lift Lobby lit wall to wall, every troffer working (its safe room)`);
  ok(r.windows >= 40 && insideWindows === 0, `${label}: ${r.windows} windows, every one on the building's edge`);
  ok(unknown === 0, `${label}: the deco is the office's own vocabulary`);
}

console.log(`-- the frozen office, ${W.SECTOR_O.id} (seed ${W.SECTOR_O.seed}, ${W.SECTOR_O.size}²)`);
const frozen = report(W.planOfficeSector(W.SECTOR_O.seed, W.SECTOR_O.size));
ok(W.sectorFingerprint(frozen.s) === W.SECTOR_O_FINGERPRINT, `it regenerates to its pinned fingerprint (${W.sectorFingerprint(frozen.s).slice(0, 20)}…)`);
mapRules("O1", frozen);
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
  ok(found >= 1900 && unlawful === 0, `O1: ${found}/2000 random relic draws found a cell, every one lawful`);
  ok(markProblems(frozen.s).length === 0, "O1: no relic or drive spot, no spawner, breaks the placement law");
}

// ---- THE GENERATOR, on other seeds ------------------------------------------------------
for (const k of [1, 2, 3, 4, 5, 6]) {
  const seed = W.SECTOR_O.seed + k * 104729;
  console.log(`-- the generator on seed ${seed}`);
  let plan = null;
  try {
    plan = W.planOfficeSector(seed, W.SECTOR_O.size);
  } catch (e) {
    ok(false, `seed ${seed} builds (${e.message})`);
    continue;
  }
  mapRules(`seed ${seed}`, report(plan), false);
}

// THE OFFICE's TROFFERS (Nov 2026 polish round): their frames were Level 0's
// olive-yellow panel texture, the one yellow thing in a grey office; they wear a
// grey-framed panel of their own (lit, flickering and powered-down alike), and a
// dead one takes the light that reaches it.
{
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  ok(/addInstanced\(panelGeo, pools \? poolSkylightMat : office \? officePanel\(\) : panelMat, panels\)/.test(src)
    && /\(office \? officePanel\(\) : panelMat\)\.clone\(\)/.test(src)
    && /officePanelMat\?\.color\.setHex\(PANEL_COLOR\)\.multiplyScalar\(panelScale\);/.test(src)
    && /addInstanced\(panelGeo, DEAD_PANEL_MAT, deadPanels, deadPanelCols\)/.test(src),
    "the office's troffers have grey frames of their own (lit, flickering and through a brownout), and a dead one takes the light that reaches it");
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
