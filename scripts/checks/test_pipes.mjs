// PIPE DREAMS harness — the frozen Level 2 sector (D3), BUILT FROM HAND-MADE
// ROOMS (Josh, 2026-09-27: "is there a map generator software out that is
// best in class that you can mimic" → "yeah lets go with your reccomendation").
// The model is DunGen's: a library of drawn rooms (src/backrooms/pipes-rooms.json,
// edited in the Admin Panel's map editor) arranged socket to socket.
// This holds three things to account: the LIBRARY (every room passes the
// checker the editor shows), the PLAN (a route from the drain to the door
// down three decks, with the set pieces on it, loops, nothing dangling), and
// the MAP rules every level here keeps (connected, nothing lethal, rooms
// closed but for their doors, the client drawing what the server placed).
// Build first (npm run build); consumes dist/backrooms/*.js.
// Pure data: no server, no network.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const {
  planPipesSector,
  generatePipesSector,
  validatePipesSector,
  sectorFingerprint,
  distanceMap,
  loadLibrary,
  PIPE_LIBRARY,
  SECTIONS,
  MAX_TO_SAFE,
  SECTOR_D,
  SECTOR_D_FINGERPRINT,
  PDECO,
  BAND,
  PIT_SINK,
  MACHINES,
  TANKS,
  SAFE_TYPES,
} = require(path.join(ROOT, "dist", "backrooms", "worldgen-pipes.js"));
const { formatLibrary, tileVariants } = require(path.join(ROOT, "dist", "backrooms", "pipes-tiles.js"));
const { SECTOR_A4_RETIRED, PIT_LETHAL } = require(path.join(ROOT, "dist", "backrooms", "worldgen.js"));

let n = 0;
let bad = 0;
const ok = (cond, name) => {
  n++;
  if (!cond) {
    bad++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
};

const plan = planPipesSector(SECTOR_D.seed, SECTOR_D.size);
const s = plan.sector;
const r = validatePipesSector(s);
const size = s.size;
const kind = (i) => s.deco[i] >> 4;
const typeAt = (i) => s.districts[s.district[i]].type;
const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
const edgeOpen = (i, side) => {
  const x = i % size;
  const y = (i / size) | 0;
  if (side === 0) return y > 0 && !s.wallN[i];
  if (side === 2) return y < size - 1 && !s.wallN[i + size];
  if (side === 3) return x > 0 && !s.wallW[i];
  return x < size - 1 && !s.wallW[i + 1];
};
const step = (i, side) => i + [-size, 1, size, -1][side];
const lib = loadLibrary(PIPE_LIBRARY, true);
const byId = new Map(lib.map((e) => [e.def.id, e]));
const insts = plan.insts;
const route = plan.mainPath.map((id) => insts[id]);

// ---- the frozen world
ok(SECTOR_D.id === "D3" && SECTOR_D.size === 256, "sector is D3 256²");
ok(sectorFingerprint(s) === SECTOR_D_FINGERPRINT, "fingerprint matches the frozen D3");
ok(sectorFingerprint(generatePipesSector(SECTOR_D.seed, SECTOR_D.size)) === SECTOR_D_FINGERPRINT, "generation is deterministic");
// Designed at half of Level 0 as it stood then (A4, 362²); Level 0 was
// condensed to 212² afterwards (A5) and Pipe Dreams was left as built.
const ratio = (size * size) / (SECTOR_A4_RETIRED.size * SECTOR_A4_RETIRED.size);
ok(ratio > 0.47 && ratio < 0.53, `half of A4 Level 0's area, as designed (${(ratio * 100).toFixed(1)}%)`);

// ---- THE LIBRARY: every room passes the checker the editor shows
{
  const broken = lib.filter((e) => e.lint.errors.length).map((e) => `${e.def.id}: ${e.lint.errors[0]}`);
  ok(broken.length === 0, `every room in the library passes the checker (${broken.slice(0, 3).join(" | ") || `${lib.length} rooms`})`);
  const ids = lib.map((e) => e.def.id);
  ok(new Set(ids).size === ids.length, "every room has its own id");
  ok(lib.length >= 60, `a library big enough not to repeat itself (${lib.length} rooms)`);
  ok(lib.some((e) => e.def.role === "start") && lib.some((e) => e.def.role === "goal"), "the library has the drain (start) and the valve gallery (goal)");
  const roles = new Set(lib.map((e) => e.def.role));
  ok(["gallery", "stair", "hall", "corridor", "room", "cap"].every((q) => roles.has(q)), `every role is drawn (${[...roles].join(", ")})`);
  // line endings aside: a Windows checkout may hand the file back as CRLF
  const raw = readFileSync(path.join(ROOT, "src", "backrooms", "pipes-rooms.json"), "utf8").split("\r\n").join("\n");
  ok(formatLibrary(JSON.parse(raw).tiles) === raw, "the library file is in the editor's layout (a save round-trips it byte for byte)");
  // turning and mirroring a room changes where things are, never what's there
  let drift = 0;
  for (const e of lib) {
    if (!e.variants.length) continue;
    const count = (t) => [Array.from(t.cell).filter((c) => c === 1).length, Array.from(t.cell).filter((c) => c === 2).length, Array.from(t.deco).filter((c) => c).length, t.sockets.length, t.pieces.length].join();
    const want = count(e.base);
    for (const v of tileVariants(e.base)) if (count(v) !== want) drift++;
  }
  ok(drift === 0, "every turned or mirrored copy of a room holds exactly what the drawing holds");
}

// ---- BUILT FROM THE LIBRARY: every piece is a drawn room, nothing else
{
  ok(insts.every((i) => byId.has(i.tileId)), `every piece of the level is a room from the library (${insts.length} pieces)`);
  let stray = 0;
  for (let i = 0; i < size * size; i++) if (!s.solid[i] && !plan.space[i]) stray++;
  ok(stray === 0, "no open floor that no room owns");
  const over = lib.filter((e) => e.def.max !== undefined && insts.filter((q) => q.tileId === e.def.id).length > e.def.max && !e.safe);
  ok(over.length === 0, `no room is built more often than its cap (${over.map((e) => e.def.id).join(" ") || "all within"})`);
  const under = lib.filter((e) => (e.def.min ?? 0) > insts.filter((q) => q.tileId === e.def.id).length);
  ok(under.length === 0, `every room with a minimum has it (${under.map((e) => e.def.id).join(" ") || "all met"})`);
  const most = Math.max(...[...new Set(insts.map((q) => q.tileId))].map((id) => insts.filter((q) => q.tileId === id).length));
  ok(most <= 30, `no single room dominates the level (the most-built is built ${most} times)`);
}

// ---- THE ROUTE: the drain to the door, the stretches in order, the descent
{
  ok(route[0]?.role === "start" && route.at(-1)?.role === "goal", `the route runs from the drain to the valve gallery (${route.length} pieces)`);
  const secIdx = route.map((q) => SECTIONS.indexOf(q.section));
  ok(secIdx.every((v, k) => k === 0 || v >= secIdx[k - 1]), "the route walks the stretches in order: intake → staff → plant → machinery → vault");
  const halls = lib.filter((e) => e.def.role === "hall" && (e.def.min ?? 0) > 0);
  const missing = halls.filter((e) => route.filter((q) => q.tileId === e.def.id).length < (e.def.min ?? 0));
  ok(missing.length === 0, `every set piece the plant needs stands ON the route — nobody reaches the door without walking through them (${halls.map((e) => e.def.id).join(", ")})`);
  const zs = route.map((q) => q.z);
  ok(zs.every((z, k) => k === 0 || z <= zs[k - 1]), "the route only ever goes DOWN");
  ok(route[0].z === 2 * BAND && route.at(-1).z === 0, "THE DESCENT: the drain on the top deck, the pressure door on the bottom one");
  ok(r.decks.join() === [0, BAND, 2 * BAND].join(), `three decks, 3m apart (${r.decks.join(", ")})`);
  const stairs = route.filter((q) => q.role === "stair");
  ok(stairs.length >= 2, `the route takes a stairwell down between the stretches (${stairs.length})`);
  ok(r.exitDistance >= 300, `the door is a long walk from the drain (${r.exitDistance} cells)`);
}

// ---- A NETWORK, NOT A CORRIDOR: loops, cross-streets, nothing dangling
{
  ok(plan.crossStreets >= 2, `cross-streets join the route's passes (${plan.crossStreets})`);
  ok(plan.loops >= 5, `the level loops back on itself (${plan.loops} loops)`);
  const fingers = insts.filter((q) => !q.main && ["gallery", "corridor", "stair"].includes(q.role) && q.joined.filter((j) => j >= 0).length < 2);
  ok(fingers.length === 0, `no gallery, corridor or stair leads nowhere — the prune took every finger back (${fingers.map((q) => q.tileId).slice(0, 4).join(" ") || "none"})`);
  const roomsOffRooms = insts.filter((q) => q.role === "room" && q.joined.some((j) => j >= 0 && insts[j].role === "room"));
  ok(roomsOffRooms.length === 0, "a room is entered from circulation, never through another room");
}

// ---- DESIGNED, NOT RESCUED: connected by construction
ok(plan.lostCells === 0, `nothing had to be sealed for want of a way in (${plan.lostCells} cells)`);
ok(r.reachablePct === 100 && r.strandedCells === 0, `100% reachable, nothing stranded (${r.reachablePct.toFixed(2)}%)`);
ok(s.doors.length === 1 && s.doors[0].name === "The Drain", "one entrance: The Drain");
ok(kind(s.doors[0].y * size + s.doors[0].x) === PDECO.hatch, "the drain hatch hangs over the entrance");
{
  const seeds = [1, 2, 3, 20260930, 8, 13];
  const sound = seeds.filter((sd) => {
    try {
      const p = planPipesSector(sd, 256);
      const q = validatePipesSector(p.sector);
      return p.lostCells === 0 && q.reachablePct === 100 && q.unrailedLedges === 0 && q.lethalDrops === 0 && q.decoByKind.exitdoor === 1;
    } catch {
      return false;
    }
  });
  ok(sound.length === seeds.length, `the generator builds a sound level from every other seed tried (${sound.length}/${seeds.length})`);
}

// ---- stairs
{
  const seen = new Uint8Array(size * size);
  let runs = 0;
  let broken = 0;
  for (let i = 0; i < size * size; i++) {
    if (seen[i] || kind(i) !== PDECO.stairs) continue;
    runs++;
    const comp = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const c = st.pop();
      comp.push(c);
      for (let sd = 0; sd < 4; sd++) {
        if (!edgeOpen(c, sd)) continue;
        const nn = step(c, sd);
        if (!seen[nn] && kind(nn) === PDECO.stairs && Math.abs(s.floor[nn] - s.floor[c]) <= 1) {
          seen[nn] = 1;
          st.push(nn);
        }
      }
    }
    const hs = comp.map((c) => s.floor[c]);
    const lands = (h) => comp.filter((c) => s.floor[c] === h).some((c) => [0, 1, 2, 3].some((sd) => {
      if (!edgeOpen(c, sd)) return false;
      const nn = step(c, sd);
      return !s.solid[nn] && kind(nn) !== PDECO.stairs && Math.abs(s.floor[nn] - s.floor[c]) <= 1;
    }));
    if (!lands(Math.min(...hs)) || !lands(Math.max(...hs))) broken++;
  }
  ok(runs >= 6 && broken === 0, `every stair lands at the top and the bottom (${runs} stairs)`);
}

// ---- nothing kills you that wasn't designed to
ok(r.pitCells === 0 && s.floor.every((f) => f > -PIT_LETHAL), "no lethal shafts anywhere");
ok(r.lethalDrops === 0, "no open edge drops far enough to kill");
ok(r.unrailedLedges === 0, "every drop outside an engine hall is walled");
ok(r.maxDrop <= PIT_SINK, `the deepest drop is an engine hall's catwalk (${r.maxDrop} steps)`);
{
  let offDeck = 0;
  const legal = new Set([0, BAND, 2 * BAND, -PIT_SINK, BAND - PIT_SINK, 2 * BAND - PIT_SINK]);
  for (let i = 0; i < size * size; i++) if (!s.solid[i] && kind(i) !== PDECO.stairs && !legal.has(s.floor[i])) offDeck++;
  ok(offDeck === 0, `off the stairs, every floor is a deck or an engine-hall pit (${offDeck} odd cells)`);
}

// ---- ROOMS ARE ROOMS: closed, open only where a door is
const doorEdges = new Set();
for (const rm of plan.rooms) {
  for (const d of rm.doors) {
    for (let k = 0; k < d.width; k++) {
      const x = d.x + (d.side === 0 || d.side === 2 ? k : 0);
      const y = d.y + (d.side === 1 || d.side === 3 ? k : 0);
      doorEdges.add(`${y * size + x}:${d.side}`);
    }
  }
}
{
  let leaks = 0;
  let unlevel = 0;
  for (let i = 0; i < size * size; i++) {
    const a = plan.space[i];
    if (!a || s.solid[i]) continue;
    for (let sd = 0; sd < 4; sd++) {
      if (!edgeOpen(i, sd)) continue;
      const j = step(i, sd);
      if (s.solid[j] || !plan.space[j] || plan.space[j] === a) continue;
      if (!doorEdges.has(`${i}:${sd}`) && !doorEdges.has(`${j}:${(sd + 2) % 4}`)) leaks++;
      else if (Math.abs(s.floor[i] - s.floor[j]) > 1) unlevel++;
    }
  }
  ok(leaks === 0, `every room is closed but for its doors — no accidental openings (${leaks})`);
  ok(unlevel === 0, "every doorway is level (the floors either side agree)");
  ok(plan.rooms.every((rm) => rm.doors.length), "every room has a door");
}
{
  // the doorway, and the step either side of it — counted only where that
  // step is in one of the two rooms the door joins (a tunnel one cell wide
  // has nothing behind its side door but the next room's wall)
  const blocked = new Set();
  for (const e of doorEdges) {
    const [i, sd] = e.split(":").map(Number);
    const out = step(i, sd);
    const mine = new Set([plan.space[i], plan.space[out]]);
    for (const c of [i, out, step(i, (sd + 2) % 4), step(out, sd)]) if (mine.has(plan.space[c])) blocked.add(c);
  }
  let inDoor = 0;
  for (const i of blocked) {
    const k = kind(i);
    if (k === PDECO.wallA || k === PDECO.wallB || k === PDECO.free || k === PDECO.machine || k === PDECO.tank || k === PDECO.rack) inDoor++;
  }
  ok(inDoor === 0, `no furniture or machine stands in a doorway (${inDoor})`);
}
{
  let floating = 0;
  for (let i = 0; i < size * size; i++) {
    const k = kind(i);
    if (k !== PDECO.wallA && k !== PDECO.wallB) continue;
    const sd = s.deco[i] & 3;
    if (edgeOpen(i, sd) && !s.solid[step(i, sd)]) floating++;
  }
  ok(floating === 0, `every locker, bench, console and shelf backs onto a wall (${floating} floating)`);
}
{
  let broken = 0;
  let onOpen = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const k = kind(i);
    if (k === PDECO.machine || k === PDECO.tank) {
      const fp = (k === PDECO.machine ? MACHINES : TANKS)[s.deco[i] & 15];
      for (let cy = y; cy < y + fp.h; cy++) for (let cx = x; cx < x + fp.w; cx++) if (!s.solid[cy * size + cx]) broken++;
    } else if (k === PDECO.rack) {
      if (!s.solid[i]) broken++;
    } else if (k && s.solid[i]) onOpen++;
  }
  ok(broken === 0, "every machine, tank and rack footprint is whole");
  ok(onOpen === 0, "no floor piece is buried in solid");
}
{
  // The client draws what the server placed: the tables agree.
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "pipes-props.ts"), "utf8");
  const table = (name) => {
    const m = src.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
    return m ? [...m[1].matchAll(/name:\s*"(\w+)",\s*w:\s*(\d+),\s*h:\s*(\d+)/g)].map((q) => `${q[1]}:${q[2]}x${q[3]}`).join() : "";
  };
  ok(table("PIPE_MACHINES") === MACHINES.map((q) => `${q.name}:${q.w}x${q.h}`).join(), "the client's machine footprints match the server's");
  ok(table("PIPE_TANKS") === TANKS.map((q) => `${q.name}:${q.w}x${q.h}`).join(), "the client's tank footprints match the server's");
  const ceil = src.match(/PIPE_CEILINGS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
  const types = [...new Set(s.districts.map((d) => d.type))];
  const missing = types.filter((t) => !new RegExp(`\\b${t}:\\s*[\\d.]+,`).test(ceil));
  ok(missing.length === 0, `every room type has a ceiling height on the client (${missing.join(" ") || "all"})`);
  ok(/\.\.\.PIPE_CEILINGS/.test(readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8")), "the game's height table takes Level 2's from pipes-props");
  const safeClient = src.match(/PIPE_SAFE_TYPES[^=]*=\s*new Set\(\[([^\]]*)\]/)?.[1].replace(/[\s"]/g, "");
  ok(safeClient === [...SAFE_TYPES].join(), "the client lights the same safe rooms the server names");
  // THE RUNS NEVER END HOLLOW (Nov 2026 polish round): every pipe segment is
  // capped, a run is one room type (its pipes are its first cell's) and only
  // carries on into the next chunk as the same type, and a run that climbs into
  // a corridor's ceiling does it a cell short of the doorway.
  const flat = src.replace(/\r\n/g, "\n");
  ok(/new THREE\.CylinderGeometry\(r, r, len, RADIAL, Math\.max\(1, segs\), false\)/.test(flat) && !/CylinderGeometry\([^)]*, true\)/.test(flat), "every pipe and conduit segment is capped (no hollow end at a corner or a seam)");
  ok(/t !== type\)\);/.test(flat) && /w\.typeAt\(nx, ny\) === w\.typeAt\(gx, gy\)/.test(flat) && /if \(open0 && s1 - s0 >= 3\) s0\+\+;/.test(flat), "a run is one room type, carries on across a chunk seam only as the same run, and turns up a cell short of a doorway");
}

// ---- EACH ROOM IS WHAT IT SAYS: the signature pieces
{
  const inRoom = (rm, pred) => {
    for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) {
      const i = y * size + x;
      if (plan.space[i] === rm.id && pred(s.deco[i])) return true;
    }
    return false;
  };
  const wallA = (t) => (c) => c >> 4 === PDECO.wallA && ((c & 15) >> 2) === t;
  const wallB = (t) => (c) => c >> 4 === PDECO.wallB && ((c & 15) >> 2) === t;
  const free = (t) => (c) => c >> 4 === PDECO.free && ((c & 15) >> 1) === t;
  const machine = (name) => (c) => c >> 4 === PDECO.machine && MACHINES[c & 15].name === name;
  const tank = (name) => (c) => c >> 4 === PDECO.tank && TANKS[c & 15].name === name;
  const sig = {
    lockers: wallA(0),
    breakroom: free(1),
    control: wallA(3),
    office: free(2),
    pumproom: machine("pump"),
    transformer: machine("transformer"),
    records: wallB(0),
    toilets: free(7),
    showers: free(7),
    boilerhouse: tank("boiler"),
    warehouse: (c) => c >> 4 === PDECO.rack,
    machineshop: machine("lathe"),
    valvegallery: machine("pump"),
    enginehall: (c) => machine("pump")(c) || machine("turbine")(c),
  };
  const misses = plan.rooms.filter((rm) => sig[rm.kind] && !inRoom(rm, sig[rm.kind])).map((rm) => `${rm.kind}#${rm.id}`);
  ok(misses.length === 0, `every room carries its signature — lockers in locker rooms, tables in break rooms, consoles in control rooms… (${misses.slice(0, 8).join(" ") || "all"})`);
}

// ---- safe rooms, lamps, vents, locked doors
ok(r.safeRooms >= 15, `lit rooms spread through the level (${r.safeRooms})`);
ok(r.maxToSafe <= MAX_TO_SAFE, `nowhere is further than ${MAX_TO_SAFE} steps from a lit room (${r.maxToSafe} at worst)`);
{
  const drain = plan.rooms.find((rm) => rm.kind === "drain");
  ok(!!drain && drain.safe && drain.w * drain.h >= 150, `the drain chamber is big and lit (${drain?.w}×${drain?.h})`);
}
let safeUnreached = 0;
for (let i = 0; i < size * size; i++) if (SAFE_TYPES.has(typeAt(i)) && !s.solid[i] && dist[i] < 0) safeUnreached++;
ok(safeUnreached === 0, "every lit room can be walked into");
{
  let near = 0;
  let inSafe = 0;
  let offWall = 0;
  for (let i = 0; i < size * size; i++) {
    if (kind(i) !== PDECO.vent) continue;
    const x = i % size;
    const y = (i / size) | 0;
    if (Math.hypot(x - s.doors[0].x, y - s.doors[0].y) <= 12) near++;
    if (SAFE_TYPES.has(typeAt(i))) inSafe++;
    const sd = s.deco[i] & 15;
    const nn = step(i, sd);
    if (edgeOpen(i, sd) && !s.solid[nn] && s.floor[nn] - s.floor[i] < 2) offWall++;
  }
  ok(r.vents >= 60 && near === 0 && inSafe === 0, `steam vents where the heat is (${r.vents}), none at the drain or in a lit room`);
  ok(offWall === 0, "every steam vent is mounted on a wall, a machine or the face under a catwalk");
}
ok(r.lamps > 300 && r.deadLamps / r.lamps > 0.15, `lamps, whole stretches of them dead (${r.deadLamps}/${r.lamps})`);
{
  const goal = insts.find((q) => q.role === "goal");
  let dead = 0;
  for (let y = goal.y; y < goal.y + goal.h; y++) for (let x = goal.x; x < goal.x + goal.w; x++) {
    const c = s.deco[y * size + x];
    if (c >> 4 === PDECO.lamp && (c & 15) !== 0) dead++;
  }
  ok(dead === 0, "every lamp in the valve gallery works — the door is never found in the dark");
}
{
  let badLocked = 0;
  for (let i = 0; i < size * size; i++) {
    if (kind(i) !== PDECO.lockeddoor) continue;
    const sd = s.deco[i] & 15;
    if (edgeOpen(i, sd) && !s.solid[step(i, sd)]) badLocked++;
    if (!s.solid[step(i, sd)] || dist[i] < 0) badLocked++;
  }
  ok(r.lockedDoors >= 10 && badLocked === 0, `prop locked doors on spare doorways, rock behind them, reachable in front (${r.lockedDoors})`);
}

// ---- the pressure door
{
  ok(r.decoByKind.exitdoor === 1 && r.decoByKind.panel === 1, "one pressure door, one fuse panel");
  for (const k of [PDECO.exitdoor, PDECO.panel]) {
    let at = -1;
    for (let i = 0; i < size * size; i++) if (kind(i) === k) at = i;
    const sd = s.deco[at] & 15;
    ok(at >= 0 && dist[at] >= 0 && s.solid[step(at, sd)] && s.solid[step(step(at, sd), sd)] && s.floor[at] === 0, `the ${k === PDECO.exitdoor ? "pressure door" : "fuse panel"} is reachable, on the bottom deck, set in solid concrete`);
  }
}

// ---- the edges of the world, the names, the development switch
let ringOpen = 0;
for (let k = 0; k < size; k++) for (const i of [k, (size - 1) * size + k, k * size, k * size + size - 1]) if (!s.solid[i]) ringOpen++;
ok(ringOpen === 0, "the outer ring is rock");
ok(s.districts.length < 256, `districts fit the district byte (${s.districts.length})`);
{
  const names = s.landmarks.map((l) => l.name);
  ok(["The Drain", "The Valve Gallery", "The Turbine Hall"].every((nm) => names.includes(nm)) && names.some((nm) => nm.startsWith("Pump Station")), `the set pieces are named on the map (${names.length})`);
}
{
  const svc = readFileSync(path.join(ROOT, "src", "backrooms", "service.ts"), "utf8");
  ok(/PIPES_UNFROZEN === "1"/.test(svc), "an unfrozen map opens only behind the PIPES_UNFROZEN development switch");
  const deploy = readdirSync(path.join(ROOT, "deploy")).filter((f) => !f.startsWith(".")).map((f) => {
    try {
      return readFileSync(path.join(ROOT, "deploy", f), "utf8");
    } catch {
      return "";
    }
  });
  ok(!deploy.some((t) => t.includes("PIPES_UNFROZEN")), "nothing in deploy/ sets it — production only ever opens the frozen map");
}


// ---- THE LOOK PICKER on this level (surfaces.ts): a repainted room keeps the
// map's fingerprint, and its look lands on that room's cells only
{
  const { lookKey } = require(path.join(ROOT, "dist", "backrooms", "surfaces.js"));
  const look = { wall: "wood-panels", floor: "carpet-green", ceil: "concrete-ceiling" };
  const id = plan.insts.find((q) => q.role !== "start").tileId;
  const lib = JSON.parse(JSON.stringify(PIPE_LIBRARY));
  lib.find((t) => t.id === id).look = look;
  const painted = planPipesSector(SECTOR_D.seed, SECTOR_D.size, lib);
  const code = painted.sector.styles.findIndex((q) => lookKey(q) === lookKey(look)) + 1;
  const on = painted.sector.look.filter((v) => v === code).length;
  const stray = painted.sector.look.filter((v) => v && v !== code).length;
  ok(sectorFingerprint(painted.sector) === SECTOR_D_FINGERPRINT, `repainting "${id}" leaves Pipe Dreams' fingerprint alone — a look never resets the level`);
  ok(on > 0 && stray === 0 && plan.sector.look.every((v) => v === 0), `…its look lands on that room's cells (${on}) and the repo map wears none`);
}

console.log(`\n${n - bad}/${n} asserts passed`);
if (bad) process.exit(1);
