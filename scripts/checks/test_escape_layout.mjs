// THE ESCAPE ROOM MAP — layout invariants (E1; v2 island model, Aug 2026).
//
// Pure DATA checks over client/src/casino/escape/er-layout.ts, imported
// directly (Node strips the types), so this asserts the SHIPPED map:
//   · exactly the drawing's census — A11 B14 C10 D6 Z7 = 48 rooms, the
//     drawing's duplicate B13 healed to B14, never two of anything
//   · V2 GEOMETRY (Josh: "why does the map layout look different"): the
//     complex is ONE OPEN FLOOR with the room clusters standing in it as
//     islands — every room and den INSIDE the floor plate, no island
//     overlapping another, the drawn cluster structure held (C's facing
//     columns and pairs, B's two rows with the mid gap, D's facing rows,
//     A's three short rows, Z's facing columns)
//   · every room a standard 3×2 / 2×3 with its door ON OPEN FLOOR one step
//     outside, agreeing with its facing
//   · the floor+stub is one connected walk that reaches every door cell
//   · the ante-room hangs off the stub, both teleport doors where ESCAPE.md
//     says; rooms and dens never open into it
//   · the SERVER's own tables (escape-zone.ts: rooms, floor, stub, dens,
//     exit) mirror this file literal-for-literal — the license for that
//     deliberate duplication (a drifted floor paths the monster through
//     walls)

import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = await import(
  "file://" + path.join(ROOT, "client", "src", "casino", "escape", "er-layout.ts").replace(/\\/g, "/")
);

let pass = 0;
const fails = [];
const ok = (c, label) => { if (c) pass++; else fails.push(label); };

const { GRID, FLOOR, STUB, ROOMS, DENS, SPAWN_ROOM, DOOR_CASINO, DOOR_COMPLEX, BLOCKS } = L;

// ---- census -----------------------------------------------------------------
ok(ROOMS.length === 48, `48 rooms (${ROOMS.length})`);
const byLetter = {};
for (const r of ROOMS) byLetter[r.id[0]] = (byLetter[r.id[0]] ?? 0) + 1;
ok(byLetter.A === 11 && byLetter.B === 14 && byLetter.C === 10 && byLetter.D === 6 && byLetter.Z === 7,
  `census A11 B14 C10 D6 Z7 (${JSON.stringify(byLetter)})`);
ok(new Set(ROOMS.map((r) => r.id)).size === 48, "no duplicate room ids — the drawing's double B13 is healed");
ok(ROOMS.some((r) => r.id === "B14") && !ROOMS.some((r) => r.id === "B15"), "B14 exists, nothing beyond it");
ok(BLOCKS.length === 5 && new Set(ROOMS.map((r) => r.id[0])).size === 5, "five blocks, matching the roll table");
ok(DENS.length === 3, "three dens (Josh: the monster spawns from one at random)");

// ---- v2 geometry: islands in one floor --------------------------------------
const inBounds = (r) => r.x0 >= 0 && r.y0 >= 0 && r.x1 < GRID.w && r.y1 < GRID.h && r.x0 <= r.x1 && r.y0 <= r.y1;
ok([...ROOMS, ...DENS, FLOOR, STUB, SPAWN_ROOM].every(inBounds), "everything sits inside the grid");

const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
for (const r of [...ROOMS, ...DENS]) {
  if (!inside(r, FLOOR)) fails.push(`${r.id} is not inside the floor plate`);
  else pass++;
}
const overlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
const islands = [...ROOMS, ...DENS];
let clashes = 0;
for (let i = 0; i < islands.length; i++)
  for (let j = i + 1; j < islands.length; j++)
    if (overlap(islands[i], islands[j])) { clashes++; fails.push(`overlap ${islands[i].id}/${islands[j].id}`); }
ok(clashes === 0, "no island overlaps another");
ok(!overlap(SPAWN_ROOM, FLOOR), "the ante-room hangs OUTSIDE the floor plate");
ok(STUB.y0 === FLOOR.y1 + 1 && STUB.y1 === SPAWN_ROOM.y0 - 1, "the stub bridges floor to ante exactly");

// The drawn cluster structure, spot-pinned: C's facing columns, the B gap,
// D's shared door band, A's three rows, Z's facing pairs.
ok(L.roomById("C1").facing === "E" && L.roomById("C4").facing === "W", "C1/C4 face each other across floor");
ok(L.roomById("C7").facing === "S" && L.roomById("C9").facing === "N", "C7/C9 are a facing pair");
ok(L.roomById("B7").x1 + 1 < L.roomById("B9").x0, "the drawn gap between B7 and B9 exists");
ok(DENS.find((d) => d.id === "den-mid" && d.x0 > L.roomById("B7").x1 && d.x1 < L.roomById("B9").x0),
  "…and the mid den lives in it");
ok(L.roomById("D1").door.x === L.roomById("D4").door.x && L.roomById("D1").door.y === L.roomById("D4").door.y,
  "D1 and D4 share a floor band door cell (facing rows)");
ok(L.roomById("Z1").facing === "E" && L.roomById("Z4").facing === "W", "Z1/Z4 face each other");
ok(new Set(ROOMS.filter((r) => r.id[0] === "A").map((r) => r.y0)).size === 3, "A stands in three short rows, as drawn");

// ---- shapes + doors ---------------------------------------------------------
for (const r of ROOMS) {
  const w = r.x1 - r.x0 + 1, d = r.y1 - r.y0 + 1;
  const okShape = (r.facing === "N" || r.facing === "S") ? w === 3 && d === 2 : w === 2 && d === 3;
  if (!okShape) fails.push(`room ${r.id} is ${w}x${d} facing ${r.facing}`);
  else pass++;
}
const islandCells = new Set();
for (const r of islands)
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) islandCells.add(`${x},${y}`);
const openFloor = (x, y) =>
  ((x >= FLOOR.x0 && x <= FLOOR.x1 && y >= FLOOR.y0 && y <= FLOOR.y1) ||
    (x >= STUB.x0 && x <= STUB.x1 && y >= STUB.y0 && y <= STUB.y1)) &&
  !islandCells.has(`${x},${y}`);
for (const r of [...ROOMS, ...DENS]) {
  const d = r.door;
  const adj =
    (d.x >= r.x0 - 1 && d.x <= r.x1 + 1 && d.y >= r.y0 - 1 && d.y <= r.y1 + 1) &&
    !(d.x >= r.x0 && d.x <= r.x1 && d.y >= r.y0 && d.y <= r.y1);
  if (!openFloor(d.x, d.y)) fails.push(`${r.id} door is not on open floor`);
  else if (!adj) fails.push(`${r.id} door not adjacent to its room`);
  else pass++;
}
for (const r of ROOMS) {
  const d = r.door;
  const want =
    r.facing === "N" ? d.y === r.y0 - 1 :
    r.facing === "S" ? d.y === r.y1 + 1 :
    r.facing === "W" ? d.x === r.x0 - 1 : d.x === r.x1 + 1;
  if (!want) fails.push(`${r.id} faces ${r.facing} but its door disagrees`);
  else pass++;
}

// ---- one connected walk -----------------------------------------------------
const walkCells = new Set();
for (let y = FLOOR.y0; y <= FLOOR.y1; y++)
  for (let x = FLOOR.x0; x <= FLOOR.x1; x++)
    if (!islandCells.has(`${x},${y}`)) walkCells.add(`${x},${y}`);
for (let y = STUB.y0; y <= STUB.y1; y++)
  for (let x = STUB.x0; x <= STUB.x1; x++) walkCells.add(`${x},${y}`);
const seen = new Set();
const stack = [`${STUB.x0},${STUB.y0}`];
while (stack.length) {
  const k = stack.pop();
  if (seen.has(k) || !walkCells.has(k)) continue;
  seen.add(k);
  const [x, y] = k.split(",").map(Number);
  stack.push(`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`);
}
ok(seen.size === walkCells.size, `the open floor is one connected walk (${seen.size}/${walkCells.size})`);
ok([...ROOMS, ...DENS].every((r) => seen.has(`${r.door.x},${r.door.y}`)), "…that reaches every door cell");

// ---- the ante-room ----------------------------------------------------------
const inRect = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
ok(inRect(DOOR_CASINO, SPAWN_ROOM) && DOOR_CASINO.y === SPAWN_ROOM.y1, "the casino door is on the ante-room's south wall");
ok(inRect(DOOR_COMPLEX, SPAWN_ROOM) && DOOR_COMPLEX.y === SPAWN_ROOM.y0, "the complex door is on the ante-room's north wall");
ok(DOOR_COMPLEX.x >= STUB.x0 && DOOR_COMPLEX.x <= STUB.x1, "…aligned with the stub above it");
ok(![...ROOMS, ...DENS].some((r) => inRect(r.door, SPAWN_ROOM)), "no room or den opens into the ante-room");
const cells = L.walkableCells();
ok(cells.size > 800, `walkable substrate exists (${cells.size} cells)`);

// ---- THE SERVER'S COPY AGREES, LITERAL FOR LITERAL --------------------------
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path.join(ROOT, "src", "casino", "escape-zone.ts"), "utf8");
  const serverRooms = new Map();
  for (const m of src.matchAll(
    /\{ id: "([A-Z]\d+)", x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+), door: \{ x: (\d+), y: (\d+) \} \}/g,
  )) serverRooms.set(m[1], { x0: +m[2], y0: +m[3], x1: +m[4], y1: +m[5], dx: +m[6], dy: +m[7] });
  ok(serverRooms.size === ROOMS.length, `server room census matches (${serverRooms.size})`);
  let mismatches = 0;
  for (const r of ROOMS) {
    const s = serverRooms.get(r.id);
    if (!s || s.x0 !== r.x0 || s.y0 !== r.y0 || s.x1 !== r.x1 || s.y1 !== r.y1 ||
        s.dx !== r.door.x || s.dy !== r.door.y) mismatches++;
  }
  ok(mismatches === 0, `server rooms mirror the layout exactly (${mismatches} off)`);
  const floor = src.match(/ER_FLOOR = \{ x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+) \}/);
  ok(floor && +floor[1] === FLOOR.x0 && +floor[2] === FLOOR.y0 && +floor[3] === FLOOR.x1 && +floor[4] === FLOOR.y1,
    "the server's floor plate mirrors exactly");
  const stub = src.match(/ER_STUB = \{ x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+) \}/);
  ok(stub && +stub[1] === STUB.x0 && +stub[2] === STUB.y0 && +stub[3] === STUB.x1 && +stub[4] === STUB.y1,
    "the server's stub mirrors exactly");
  const srvDens = new Map(
    [...src.matchAll(/\{ id: "(den-[a-z]+)", x0: (\d+), y0: (\d+), x1: (\d+), y1: (\d+), door: \{ x: (\d+), y: (\d+) \} \}/g)]
      .map((m) => [m[1], { x0: +m[2], y0: +m[3], x1: +m[4], y1: +m[5], dx: +m[6], dy: +m[7] }]),
  );
  ok(srvDens.size === DENS.length, `server den census matches (${srvDens.size})`);
  let denOff = 0;
  for (const d of DENS) {
    const s = srvDens.get(d.id);
    if (!s || s.x0 !== d.x0 || s.y0 !== d.y0 || s.x1 !== d.x1 || s.y1 !== d.y1 ||
        s.dx !== d.door.x || s.dy !== d.door.y) denOff++;
  }
  ok(denOff === 0, "server dens mirror the layout exactly");
  const exit = src.match(/ER_EXIT = \{ x: ([\d.]+), y: ([\d.]+) \}/);
  ok(exit && +exit[1] >= STUB.x0 && +exit[1] <= STUB.x1 + 1 && Math.abs(+exit[2] - STUB.y0) <= 1,
    "the server's exit stands at the stub's mouth");
}

console.log(fails.length ? fails.map((f) => "  x " + f).join("\n") : "");
console.log(`${pass}/${pass + fails.length} escape layout asserts passed`);
process.exit(fails.length ? 1 : 0);
