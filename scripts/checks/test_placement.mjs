// THE PLACEMENT LAW, proven on every level (Josh, Oct 2026: "make sure that
// all new hard drives, relics are positioned correctly across the map and not
// underneath the map. i found a relic in the pipe dreams map that was under the
// floor. just keep this as a law for all maps. i dont want progression messed
// up because i incorrectly spawned hard drive, relic, or objective" — and the
// same day, "also validate that all monsters are placed correctly").
//
// In-process, over EVERY level the map editor knows (EDITABLE_LEVELS — a new
// level is covered the day it is added):
//   · THE SHIPPED MAPS, as the real service serves them: every relic lying
//     out, every lore drive, every key, fuse, door and hatch passes
//     src/backrooms/placement.ts — open, not scenery, not a shaft, not swum
//     for, not under furniture or a solid prop, not a stair, and REACHABLE on
//     foot from the level's door. Doors and hatches sit in a wall or a floor,
//     so they need a reachable cell at or beside them.
//   · THE MONSTERS: every Entity, spawned Entity, the Stalker, the Shy Guy and
//     every alligator starts somewhere it can walk out of — never in a wall,
//     on scenery or down a shaft — and every alligator in deep water.
//   · THE EDITOR's GAME LAYER: no relic or drive spot, and no spawner, on any
//     shipped map breaks the law (markProblems — the same check the publish
//     screen runs).
//   · THE PICKERS on other seeds too: every level rebuilt on two more seeds,
//     its drives, key, fuses and 2,000 random relic draws all lawful — so the
//     law holds for the next map, not just this one.
//   · THE CLIENT HALF: the game draws pickups ON the floor under them and
//     keeps them there (pinToGround) — a source sweep finds no pickup drawn at
//     a fixed height, which is exactly how the Pipe Dreams relic ended up
//     under the floor.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));

const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { distanceMap } = require(dist("backrooms/worldgen.js"));
const { whyUnplaceable, whyNoCreature, markProblems, pickRelicCell, UNPLACEABLE_SAYS } = require(dist("backrooms/placement.js"));
const { driveSites, keySite, doorSite, fuseSites, LEVEL_DRIVES } = require(dist("backrooms/lore.js"));
const { EDITABLE_LEVELS, LEVEL_NAMES, repoDesign, buildMap } = require(dist("backrooms/designs.js"));

const DB = path.join(ROOT, "data", "placement-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const cell = (p) => [Math.floor(p.x), Math.floor(p.y)];
const where = (p) => `(${Math.floor(p.x)},${Math.floor(p.y)})`;

/** Every point that breaks the objective law, with why. */
const unlawful = (s, pts) =>
  pts.map((p) => ({ p, why: whyUnplaceable(s, ...cell(p)) })).filter((r) => r.why).map((r) => `${r.p.name ?? r.p.id ?? "?"} ${where(r.p)} is ${UNPLACEABLE_SAYS[r.why]}`);
/** A door or hatch lives in a wall or a floor: a reachable cell at or beside it. */
const reachAt = (s, reach, p) => {
  const [x, y] = cell(p);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = x + dx, cy = y + dy;
    if (cx >= 0 && cy >= 0 && cx < s.size && cy < s.size && reach[cy * s.size + cx] >= 0) return true;
  }
  return false;
};
const listOk = (s, label, pts) => {
  const errs = unlawful(s, pts);
  ok(errs.length === 0, `${label}: ${pts.length} placed, every one lawful${errs.length ? " — " + errs.slice(0, 4).join("; ") : ""}`);
};
const monstersOk = (s, label, list, kind) => {
  const errs = list
    .map((c) => ({ c, why: whyNoCreature(s, ...cell(c), kind) }))
    .filter((r) => r.why)
    .map((r) => `${where(r.c)} ${r.why === "dry" ? "on dry floor" : UNPLACEABLE_SAYS[r.why]}`);
  ok(errs.length === 0, `${label}: ${list.length} standing, every one somewhere it can walk out of${errs.length ? " — " + errs.slice(0, 4).join("; ") : ""}`);
};
/** A seeded integer source in [0, n), standing in for crypto's randomInt. */
const seeded = (seed) => {
  let a = seed >>> 0;
  return (k) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * k);
  };
};
const relicDraws = (s, label, minFromDoor, draws = 2000) => {
  const rnd = seeded(s.seed ^ 0xabc);
  let found = 0;
  const errs = [];
  for (let i = 0; i < draws; i++) {
    const c = pickRelicCell(s, [], minFromDoor, rnd);
    if (!c) continue;
    found++;
    const why = whyUnplaceable(s, c[0], c[1]);
    if (why) errs.push(`(${c[0]},${c[1]}) ${UNPLACEABLE_SAYS[why]}`);
  }
  ok(errs.length === 0 && found >= draws * 0.95, `${label}: ${found}/${draws} random relic draws found a cell, every one lawful${errs.length ? " — " + errs.slice(0, 3).join("; ") : ""}`);
};

// ---- THE SHIPPED MAPS, as the service serves them ----------------------------------------
const store = new Store(DB);
const br = createBackrooms(store);
const dbg = br.debugState();
const secs = { 0: br.sector, 1: br.sectorP, 2: br.sectorD, 3: br.enabledS ? br.sectorS : null, 4: br.enabledO ? br.sectorO : null, 5: br.enabledH ? br.sectorH : null, 6: br.enabledL ? br.sectorL : null, 7: br.enabledT ? br.sectorT : null, 8: br.enabledC ? br.sectorC : null, 9: br.enabledU ? br.sectorU : null };
const RELIC_MIN = { 0: 60, 1: 60, 2: 50, 3: 40, 4: 40, 5: 40, 6: 40, 7: 40, 8: 40, 9: 40 };

for (const lvl of EDITABLE_LEVELS) {
  const s = secs[lvl];
  console.log(`-- Level ${lvl}, ${LEVEL_NAMES[lvl]} (as served)`);
  if (!s) {
    ok(false, `the service serves Level ${lvl}`);
    continue;
  }
  const reach = distanceMap(s, s.doors.map((d) => ({ x: Math.floor(d.x), y: Math.floor(d.y) })));
  const relics = lvl === 0 ? dbg.relics : lvl === 1 ? dbg.relicsP : lvl === 2 ? dbg.relicsD : br.operatorView(lvl).relics;
  listOk(s, "relics lying out", relics);
  relicDraws(s, "relics to come", RELIC_MIN[lvl]);
  // law 1: every level has its own drives, and every one finds lawful ground
  const drives = driveSites(s, LEVEL_DRIVES[lvl]);
  ok(drives.length === LEVEL_DRIVES[lvl].length && drives.length >= 20, `all ${LEVEL_DRIVES[lvl].length} of the level's lore drives placed (${drives.length})`);
  listOk(s, "lore drives", drives);
  const mp = markProblems(s);
  ok(mp.length === 0, `the map's relic and drive spots and spawners all lawful${mp.length ? " — " + mp.slice(0, 4).join("; ") : ""}`);

  if (lvl === 0) {
    listOk(s, "THE KEY", [{ ...dbg.key, name: "the key" }]);
    ok(reachAt(s, reach, dbg.door), `THE DOOR ${where(dbg.door)} has a reachable cell at or beside it`);
    monstersOk(s, "the Entities", dbg.entities, "walker");
    if (dbg.stalker) monstersOk(s, "the Stalker", [dbg.stalker], "walker");
  } else if (lvl === 1) {
    listOk(s, "the Poolrooms' key", [{ ...dbg.keyP, name: "the key" }]);
    ok(reachAt(s, reach, dbg.hatch), `the drain hatch ${where(dbg.hatch)} has a reachable cell at or beside it`);
    monstersOk(s, "the alligators", dbg.gators, "gator");
    if (dbg.shy) monstersOk(s, "the Shy Guy", [dbg.shy], "walker");
  } else if (lvl === 2) {
    listOk(s, "the fuses", dbg.fuses.map((f, i) => ({ ...f, name: `fuse ${i + 1}` })));
  } else if (lvl === 3) {
    // the levers stand on their own walled cells: the floor in front of each
    // must be lawful (that is where a hand reaches from)
    const st = br.stationState();
    listOk(s, "the breakers, cutoffs and the shutter", [...st.breakers, ...st.cutoffs, ...(st.shutter ? [st.shutter] : [])].map((o, i) => ({ x: o.x, y: o.y, name: "lever " + i })));
  } else if (lvl === 4) {
    // THE KEYCARD lies on its own floor; the stairwell door's cell is where
    // the reader is reached from
    const of = br.officeState();
    listOk(s, "the keycard and the stairwell door", [...(of.keycard ? [{ ...of.keycard, name: "the keycard" }] : []), ...(of.stairdoor ? [{ x: of.stairdoor.x, y: of.stairdoor.y, name: "the stairwell door" }] : [])]);
    ok(!!of.keycard && !!of.stairdoor, "the keycard and the stairwell door are both on the map");
  } else if (lvl === 5) {
    // THE GUEST REGISTER on its table, every suite's key hook (any one of them
    // may be the one the register names), the rusty door, and every lift
    const ht = br.hotelState();
    const hooks = (s.hotel?.suites ?? []).map((q, i) => ({ x: q.x + 0.5, y: q.y + 0.5, name: `suite ${q.number}'s hook` }));
    listOk(s, "the register, the key hooks, the rusty door and the lifts", [
      ...(ht?.register ? [{ ...ht.register, name: "the register" }] : []),
      ...hooks,
      ...(ht?.rustydoor ? [{ x: ht.rustydoor.x, y: ht.rustydoor.y, name: "the rusty door" }] : []),
      ...(ht?.lifts ?? []).map((l, i) => ({ x: l.x, y: l.y, name: `lift ${i + 1}` })),
    ]);
    monstersOk(s, "the Deathmoths on their nests", br.operatorView(5).monsters.filter((m) => m.kind === "moths"), "walker");
    ok(!!ht?.register && !!ht?.rustydoor && hooks.length >= 10 && (ht?.lifts.length ?? 0) >= 2, `the register, the rusty door, ${hooks.length} key hooks and ${ht?.lifts.length ?? 0} lifts are all on the map`);
  } else if (lvl === 6) {
    // THE HANDWHEEL where it lies, every spot it might have lain on, every
    // battery spot, and the sea hatch
    const lt = br.lightsState();
    const L = s.lights;
    const wheel = br.keyPos(6);
    listOk(s, "the Handwheel, its spots, the battery spots and the sea hatch", [
      ...(wheel ? [{ ...wheel, name: "the Handwheel" }] : []),
      ...(L?.wheelSpots ?? []).map((p, i) => ({ x: p.x + 0.5, y: p.y + 0.5, name: `wheel spot ${i + 1}` })),
      ...(L?.batterySpots ?? []).map((p, i) => ({ x: p.x + 0.5, y: p.y + 0.5, name: `battery spot ${i + 1}` })),
      ...(lt?.hatch ? [{ x: lt.hatch.x, y: lt.hatch.y, name: "the sea hatch" }] : []),
    ]);
    ok(!!wheel && !!lt?.hatch && (L?.batterySpots.length ?? 0) >= 10, `the Handwheel, the sea hatch and ${L?.batterySpots.length ?? 0} battery spots are all on the map`);
  } else if (lvl === 7) {
    // THE DIVING HELMET where it lies and every spot it might have lain on
    const O = s.ocean;
    const helmet = br.keyPos(7);
    listOk(s, "the Diving Helmet and its spots", [
      ...(helmet ? [{ ...helmet, name: "the Diving Helmet" }] : []),
      ...(O?.helmetSpots ?? []).map((p, i) => ({ x: p.x + 0.5, y: p.y + 0.5, name: `helmet spot ${i + 1}` })),
    ]);
    // THE ONE DOCUMENTED EXCEPTION TO THE LAW: the subway stair is MEANT to be
    // at the bottom of deep water — the dive is the level. So it must fail
    // the law for that reason and no other: open, in the plaza, reachable.
    const sub = br.oceanState()?.subway;
    const why = sub ? whyUnplaceable(s, Math.floor(sub.x), Math.floor(sub.y)) : "outside";
    const reachSub = sub ? reach[Math.floor(sub.y) * s.size + Math.floor(sub.x)] : -1;
    ok(!!sub && why === "deep_water" && reachSub > 0, `the subway stair ${sub ? where(sub) : "(none)"} is under deep water and nothing else stands in the way (${why}, ${reachSub} steps from the hatch)`);
    ok(!!helmet && (O?.helmetSpots.length ?? 0) >= 6, `the Diving Helmet and ${O?.helmetSpots.length ?? 0} helmet spots are all on the map`);
    monstersOk(s, "the thing below", br.operatorView(7).monsters.filter((m) => m.kind === "deep"), "walker");
  } else if (lvl === 8) {
    // THE CLIMBING ROPE where it lies, every spot it might have lain on, and
    // the Chimney's foot
    const C = s.cave;
    const rope = br.keyPos(8);
    const ch = br.caveState()?.chimney;
    listOk(s, "the Climbing Rope, its spots and the Chimney", [
      ...(rope ? [{ ...rope, name: "the Climbing Rope" }] : []),
      ...(C?.ropeSpots ?? []).map((p, i) => ({ x: p.x + 0.5, y: p.y + 0.5, name: `rope spot ${i + 1}` })),
      ...(ch ? [{ x: ch.x, y: ch.y, name: "the Chimney" }] : []),
    ]);
    ok(!!rope && !!ch && (C?.ropeSpots.length ?? 0) >= 6, `the Climbing Rope, the Chimney and ${C?.ropeSpots.length ?? 0} rope spots are all on the map`);
    // THE BURROWER surfaces only in its own ground (the passages and the
    // crawlspaces): every cell of that ground it could surface on is lawful
    // creature ground
    const { caveBurrow } = require(dist("backrooms/worldgen-cave.js"));
    let ground = 0;
    const bad = [];
    for (let i = 0; i < s.size * s.size; i++) {
      const x = i % s.size, y = (i / s.size) | 0;
      if (!caveBurrow(s, x, y)) continue;
      ground++;
      const why = whyNoCreature(s, x, y);
      if (why) bad.push(`(${x},${y}) ${why}`);
    }
    ok(ground > 600 && bad.length === 0, `the Burrower's ground: ${ground} cells, every one lawful to surface on${bad.length ? " — " + bad.slice(0, 3).join("; ") : ""}`);
  } else if (lvl === 9) {
    // THE HOUSE KEY where it lies, every spot it might have lain on, and
    // Number 9's front door
    const U = s.suburb;
    const key = br.keyPos(9);
    const fd = br.suburbState()?.frontDoor;
    listOk(s, "the House Key, its spots and the front door", [
      ...(key ? [{ ...key, name: "the House Key" }] : []),
      ...(U?.keySpots ?? []).map((p, i) => ({ x: p.x + 0.5, y: p.y + 0.5, name: `key spot ${i + 1}` })),
      ...(fd ? [{ x: fd.x, y: fd.y, name: "the front door" }] : []),
    ]);
    ok(!!key && !!fd && (U?.keySpots.length ?? 0) >= 8, `the House Key, the front door and ${U?.keySpots.length ?? 0} key spots are all on the map`);
    // THE NEIGHBORHOOD WATCH arrives only on the dark outdoors, and only where
    // a creature may stand: plenty of that ground is lawful to arrive on
    const { suburbLitMap, suburbSafe } = require(dist("backrooms/worldgen-suburb.js"));
    const lit = suburbLitMap(s);
    let ground = 0, lawful = 0;
    for (let i = 0; i < s.size * s.size; i++) {
      const x = i % s.size, y = (i / s.size) | 0;
      if (s.solid[i] || s.section[i] !== 1 || lit[i] || suburbSafe(s, x, y) || reach[i] < 0) continue;
      ground++;
      if (!whyNoCreature(s, x, y)) lawful++;
    }
    ok(lawful > 3000 && lawful >= ground * 0.8, `the Watch's ground: ${ground} dark outdoor cells, ${lawful} lawful to arrive on`);
  }
  monstersOk(s, "Entities from the editor's spawners", dbg.spawned.filter((e) => e.level === lvl), "walker");
}

// ---- LAW 1's words: Dr. Voss on every drive -------------------------------------------
{
  console.log("-- every drive: a description and Dr. Voss's note");
  const all = LEVEL_DRIVES.flat();
  const ids = new Set(all.map((d) => d.id));
  ok(ids.size === all.length, `drive ids never repeat across the levels (${all.length} drives)`);
  LEVEL_DRIVES.forEach((set, lvl) => {
    const missing = set.filter((d) => !d.desc?.trim() || !d.ada?.trim() || !d.body?.trim()).map((d) => d.id);
    ok(set.length >= 20 && missing.length === 0, `Level ${lvl}: ${set.length} drives, each with its text, a description and a Voss note${missing.length ? " — missing: " + missing.join(", ") : ""}`);
  });
}

// ---- THE PICKERS, on seeds that aren't shipped -------------------------------------------
for (const lvl of EDITABLE_LEVELS) {
  const { tiles, seed } = repoDesign(lvl);
  for (const alt of [seed + 101, seed + 202]) {
    console.log(`-- Level ${lvl}, ${LEVEL_NAMES[lvl]}, rebuilt on seed ${alt}`);
    let s;
    try {
      s = buildMap(lvl, tiles, alt).sector;
    } catch (e) {
      ok(false, `the level builds (${e.message})`);
      continue;
    }
    const d0 = distanceMap(s, s.doors.map((d) => ({ x: Math.floor(d.x), y: Math.floor(d.y) })));
    const door = doorSite(s, d0);
    ok(d0[Math.floor(door.y) * s.size + Math.floor(door.x)] >= 0, `the way on ${where(door)} is reachable`);
    // the Station has no key and no fuses: its own levers are its objectives;
    // the office's keycard and stairwell door are drawn into its rooms
    const officeSite = (kind) => {
      for (let i = 0; i < s.size * s.size; i++) if (s.deco && s.deco[i] >> 4 === kind) return { x: (i % s.size) + 0.5, y: Math.floor(i / s.size) + 0.5 };
      return null;
    };
    const objectives = lvl === 9 ? [{ ...officeSite(3), name: "front door" }, { ...officeSite(4), name: "a key spot" }] : lvl === 6 ? [{ ...officeSite(3), name: "sea hatch" }, { ...officeSite(4), name: "a wheel spot" }, { ...officeSite(5), name: "a battery spot" }] : lvl === 5 ? [{ ...officeSite(5), name: "register" }, { ...officeSite(3), name: "rusty door" }, { ...officeSite(4), name: "a key hook" }, { ...officeSite(6), name: "a lift" }] : lvl === 4 ? [{ ...officeSite(4), name: "keycard" }, { ...officeSite(3), name: "stairwell door" }] : lvl === 3 ? [] : [{ ...keySite(s, door), name: "key" }, ...fuseSites(s, d0).map((f, i) => ({ ...f, name: `fuse ${i + 1}` }))];
    objectives.push(...driveSites(s, LEVEL_DRIVES[lvl]));
    listOk(s, "keys, fuses and drives", objectives);
    relicDraws(s, "relics", RELIC_MIN[lvl], 1000);
  }
}

// ---- THE CLIENT HALF ----------------------------------------------------------------------
console.log("-- the game draws every pickup on its floor");
const game = readFileSync(path.join(ROOT, "client/src/backrooms/BackroomsGame.svelte"), "utf8");
const fixed = [...game.matchAll(/\.position\.set\(\s*[\w.]+\s*\*\s*CELL\s*,\s*-?\d+(?:\.\d+)?\s*,/g)].map((m) => m[0]);
ok(fixed.length === 0, `nothing on the map is drawn at a fixed height (${fixed.length} found${fixed.length ? ": " + fixed.slice(0, 3).join(" | ") : ""})`);
for (const [what, re] of [
  ["relics", /pinToGround\(sp, x, y, 1\.15\)/],
  ["relic labels", /pinToGround\(label, r\.x, r\.y,/],
  ["lore drives", /pinToGround\(mesh, x, y, 0\.06\)/],
  ["dropped items", /pinToGround\(sprite, d\.x, d\.y,/],
  ["fuses", /pinToGround\(g, x, y, 0\.45\)/],
  ["the drain hatch", /pinToGround\(g, x, y, 0\)/],
  ["bodies", /pinToGround\(a\.group, x, y,/],
]) ok(re.test(game), `${what} are pinned to the floor under them`);
ok(/tickGroundPins\(\);/.test(game), "…and re-pinned every frame, so a pickup that arrives before its floor has streamed lands on it when it does");

console.log(`\n${n - bad}/${n} asserts passed`);
store.db.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
