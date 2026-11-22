// THE MAP EDITOR's TOOLS harness (Josh, Sep 2026: "lets do them all … make
// sure everything is intuitive for building"). Pure data, no server:
//   the CLIPBOARD  src/backrooms/clip.ts — a boxed piece of a room turned and
//                  flipped agrees with the generator's own turned and
//                  mirrored room (walls, stairs, doors, props, markers), is
//                  transparent where it isn't floor, grows the room it's
//                  pasted into, and "clear what's on it" leaves the floor;
//   the GAME LAYER src/backrooms/marks.ts — creature spawners and relic /
//                  drive spots checked by the same checker the editor shows,
//                  turning with their room, copied into the map, never
//                  touching its fingerprint;
//   PROP CHANCE    a prop in "half the copies" is in about half of them, the
//                  same half on every build;
//   SIGNS          the drawn props: in the catalogue, their words checked
//                  and written to the library file.
// Build first (npm run build).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const D = (m) => require(path.join(ROOT, "dist", "backrooms", `${m}.js`));
const clip = D("clip");
const marks = D("marks");
const kit = D("kit");
const tiles = D("tiles");
const { lintLobbyTile, parseLobbyTile, LOBBY_DIALECT } = D("lobby-tiles");
const { lintPoolTile } = D("pools-tiles");
const { planLobbySector, LOBBY_LIBRARY } = D("worldgen-lobby");
const { planPoolsSector, POOL_LIBRARY, SECTOR_P, SECTOR_P_FINGERPRINT } = D("worldgen-pools");
const { SECTOR_A, sectorFingerprint } = D("worldgen");

let n = 0;
let bad = 0;
const ok = (cond, name) => {
  n++;
  if (!cond) {
    bad++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
};
const copy = (o) => JSON.parse(JSON.stringify(o));

// ---- a room with everything in it --------------------------------------------------
// 6×4, a thin wall, a stair, a raised corner, a room split with an inner door,
// two doorways, a prop, a turned prop, markers
const ROOM = {
  id: "clip-probe",
  kind: "classic",
  set: "any",
  role: "block",
  type: "classic",
  map: ["......", "......", "......", "......"],
  height: ["....11", "....11", "......", "......"],
  stair: ["......", "....^.", "......", "......"],
  rooms: ["111222", "111222", "111222", "111222"],
  walls: ["......", ".-....", ".|....", "......"],
  inner: [[2, 2, "E", 1]],
  doors: [[0, 1, "W", 1], [4, 3, "S", 2]],
  props: [{ p: "sign-note", x: 1.3, y: 0.6, r: 30, z: 1.2, text: "the key is behind you" }, { p: "sign-plate", v: 2, x: 4.5, y: 2.5, r: 90 }],
  marks: [{ k: "entity", x: 1.5, y: 2.5, roam: 8 }, { k: "relic", x: 5.5, y: 3.5 }],
};

console.log("-- the clipboard: a whole room turned agrees with the generator's turn");
const cells = (t) => ({
  cell: [...t.cell].join(""),
  hgt: [...t.hgt].join(","),
  stair: [...t.stair].join(","),
  // rooms by partition, not by number (numbering follows the scan order)
  room: (() => {
    const seen = new Map();
    return [...t.room].map((r) => (r === 255 ? "-" : (seen.has(r) ? seen.get(r) : (seen.set(r, seen.size), seen.size - 1)))).join(",");
  })(),
  wallN: [...t.wallN].join(""),
  wallW: [...t.wallW].join(""),
  sockets: t.sockets.map((s) => `${s.x},${s.y},${s.side},${s.w}`).sort().join(";"),
  inner: t.inner.map((d) => `${d.x},${d.y},${d.side}`).sort().join(";"),
  props: t.props.map((p) => `${p.p}@${p.x.toFixed(2)},${p.y.toFixed(2)},${Math.round(p.r)},${p.z}`).sort().join(";"),
  marks: t.marks.map((m) => `${m.k}@${m.x.toFixed(2)},${m.y.toFixed(2)}`).sort().join(";"),
});
const base = parseLobbyTile(copy(ROOM));
{
  // Level 0 wants 10-cell modules and slot doorways; nothing ELSE may be wrong
  const e = lintLobbyTile(copy(ROOM)).errors.filter((m) => !/10-cell|slot/.test(m));
  ok(e.length === 0, `the probe room passes the checker but for Level 0's module sizes (${e.join("; ")})`);
}
const asRoom = (c) => {
  const t = { ...copy(ROOM), map: Array.from({ length: c.h }, () => " ".repeat(c.w)), height: undefined, stair: undefined, rooms: undefined, walls: undefined, furn: undefined, doors: [], inner: undefined, face: undefined, props: undefined, marks: undefined };
  clip.stampClip(t, c, 0, 0);
  return t;
};
const whole = clip.cutClip(copy(ROOM), 0, 0, 5, 3);
let turned = whole;
for (let k = 1; k <= 3; k++) {
  turned = clip.turnClip(turned);
  const mine = cells(parseLobbyTile(asRoom(turned)));
  const theirs = cells(tiles.transformTile(base, k, false));
  const diff = Object.keys(mine).filter((key) => mine[key] !== theirs[key]);
  ok(!diff.length, `turned ${k * 90}°: floor, heights, stairs, rooms, thin walls, doors, inner doors, props and markers all where the generator puts them${diff.length ? ` (differ: ${diff.join(", ")})` : ""}`);
}
ok(JSON.stringify(clip.turnClip(turned)) === JSON.stringify(clip.turnClip(clip.turnClip(clip.turnClip(clip.turnClip(whole))))) && cells(parseLobbyTile(asRoom(clip.turnClip(turned)))).wallN === cells(base).wallN, "four turns come back to where they started");
const flipped = clip.flipClip(whole);
{
  const mine = cells(parseLobbyTile(asRoom(flipped)));
  const theirs = cells(tiles.transformTile(base, 0, true));
  const diff = Object.keys(mine).filter((key) => mine[key] !== theirs[key]);
  ok(!diff.length, `flipped: everything where the generator's mirror puts it${diff.length ? ` (differ: ${diff.join(", ")})` : ""}`);
}
ok(JSON.stringify(cells(parseLobbyTile(asRoom(clip.flipClip(flipped))))) === JSON.stringify(cells(base)), "two flips come back to where they started");

console.log("-- the clipboard: pasting and clearing");
{
  // an L-shaped piece pasted over a room leaves the rest of its rectangle alone
  const L = { ...copy(ROOM), map: ["##.", "#  ", "#  "], height: undefined, stair: undefined, rooms: undefined, walls: undefined, doors: [], inner: undefined, props: undefined, marks: undefined };
  const c = clip.cutClip(L, 0, 0, 2, 2);
  const target = copy(ROOM);
  clip.stampClip(target, c, 1, 0);
  ok(target.map[1][2] === "." && target.map[2][2] === "." && target.map[0][2] === "#", "cells of the piece that aren't floor are see-through: the room under them stays");
  ok(!target.props.some((p) => p.p === "sign-note"), "what the paste lands on is replaced (the note under the piece is gone)");
  // pasting past the room's edge grows the room, never crops the piece
  const grow = copy(ROOM);
  clip.stampClip(grow, clip.cutClip(copy(ROOM), 0, 0, 1, 1), 5, 3);
  ok(grow.map[0].length === 7 && grow.map.length === 5 && grow.map[4].slice(5) === "..", "a piece pasted past the edge grows the room to fit");
  const left = copy(ROOM);
  clip.stampClip(left, clip.cutClip(copy(ROOM), 0, 0, 1, 1), -1, 0);
  ok(left.map[0].length === 7 && left.doors.some((d) => d[0] === 5 && d[1] === 3), "a piece pasted past the LEFT edge moves the room over, doors and all");
  // clear what's on it: furniture, stairs, walls, props and markers go; the floor stays
  const cl = copy(ROOM);
  clip.clearBox(cl, 0, 0, 5, 3, false);
  ok(cl.map.every((r) => r === "......") && cl.height[0] === "....11", "clearing what's on it leaves the floor and its heights");
  ok(cl.stair.every((r) => r === "......") && cl.walls.every((r) => r === "......") && !cl.props && !cl.marks, "…and takes the stairs, thin walls, props and markers");
  ok(cl.doors.length === 2, "…and keeps the doorways (they are part of the floor's edge)");
  const all = copy(ROOM);
  clip.clearBox(all, 0, 0, 1, 3, true);
  ok(all.map.every((r) => r.startsWith("  ")) && !all.doors.some((d) => d[0] === 0), "removing the floor too takes the cells out of the room, doorways included");
  // lift and drop by one cell: the move leaves the floor, carries the rest
  const mv = copy(ROOM);
  const piece = clip.cutClip(mv, 0, 0, 2, 3);
  clip.clearBox(mv, 0, 0, 2, 3, false);
  clip.stampClip(mv, piece, 1, 0);
  ok(mv.map[0][0] === "." && mv.props.some((p) => p.p === "sign-note" && Math.abs(p.x - 2.3) < 1e-9), "moving a piece one cell carries its props with it and leaves floor behind");
}

console.log("-- the game layer");
ok(marks.MARKS.length === 4 && marks.MARKS.every((m) => m.name && m.help && m.levels.length), "four markers, each named and explained");
ok(marks.markProblems({ k: "gator", x: 1, y: 1 }, 0).some((m) => /can't go on this level/.test(m)), "an alligator can't be placed on Level 0");
ok(marks.markProblems({ k: "entity", x: 1, y: 1, speed: 400 }, 2).some((m) => /speed/.test(m)), "a setting out of range is refused by name");
ok(marks.markProblems({ k: "ghost", x: 1, y: 1 }, 0)[0].includes("no game marker"), "an unknown marker is refused");
ok(marks.markProblems({ k: "entity", x: 1, y: 1, n: 3, speed: 160, sight: 22, roam: 30, chance: 50 }, 2).length === 0, "the Entity may go on Pipe Dreams, with every setting in range");
{
  const off = { ...copy(ROOM), marks: [{ k: "entity", x: 9.5, y: 1.5 }] };
  ok(lintLobbyTile(off).errors.some((e) => /open floor/.test(e)), "a marker off the room's floor is refused");
  const pool = copy(POOL_LIBRARY.find((t) => t.map.length < 30 && t.height && t.height.some((r) => /[a-l]/.test(r))));
  const dry = (() => {
    for (let y = 0; y < pool.map.length; y++) for (let x = 0; x < pool.map[y].length; x++) if (pool.map[y][x] !== " " && pool.map[y][x] !== "#" && !/[b-l]/.test((pool.height?.[y] ?? "")[x] ?? ".")) return [x, y];
  })();
  const deep = (() => {
    for (let y = 0; y < pool.map.length; y++) for (let x = 0; x < pool.map[y].length; x++) if (/[c-l]/.test((pool.height?.[y] ?? "")[x] ?? ".") && pool.map[y][x] !== "#") return [x, y];
  })();
  ok(!!dry && lintPoolTile({ ...pool, marks: [{ k: "gator", x: dry[0] + 0.5, y: dry[1] + 0.5 }] }).errors.some((e) => /deep water/.test(e)), "an alligator on dry floor is refused: put it in deep water");
  ok(!!deep && !lintPoolTile({ ...pool, marks: [{ k: "gator", x: deep[0] + 0.5, y: deep[1] + 0.5 }] }).errors.some((e) => /alligator/.test(e)), `an alligator in deep water is fine (${pool.id})`);
}
{
  const vs = tiles.tileVariants(base);
  ok(vs.every((v) => v.marks.length === 2 && v.marks.every((m) => m.x > 0 && m.y > 0 && m.x < v.w && m.y < v.h)), "markers turn and mirror with the room, in all its placements, never leaving it");
}
{
  // the generator copies markers into the map, and the map keeps its fingerprint
  const lib = copy(LOBBY_LIBRARY);
  const t = lib.find((q) => q.role === "block" && q.map.length >= 8);
  const spot = (() => {
    for (let y = 1; y < t.map.length; y++) for (let x = 1; x < t.map[y].length; x++) if (t.map[y][x] === ".") return [x + 0.5, y + 0.5];
  })();
  t.marks = [{ k: "entity", x: spot[0], y: spot[1], n: 2, speed: 130 }, { k: "drive", x: spot[0], y: spot[1] }];
  const was = planLobbySector(SECTOR_A.seed, SECTOR_A.size);
  const now = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib);
  const copies = now.insts.filter((i) => i.tileId === t.id).length;
  ok(copies > 0 && (now.sector.marks ?? []).filter((m) => m.k === "entity").length === copies, `every copy of the room carries its spawner (${copies} copies)`);
  ok((now.sector.marks ?? []).every((m) => m.k !== "entity" || (m.n === 2 && m.speed === 130)), "…with its settings");
  ok(sectorFingerprint(now.sector) === sectorFingerprint(was.sector), "placing markers never changes the map's fingerprint (a publish keeps the map)");
  // chance: in about that share of copies, and the same ones every time
  t.marks = [{ k: "relic", x: spot[0], y: spot[1], chance: 50 }];
  const a = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib).sector.marks ?? [];
  const b = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib).sector.marks ?? [];
  ok(JSON.stringify(a) === JSON.stringify(b), "a marker's chance rolls the same copies on every build");
}
{
  let hits = 0;
  for (let i = 0; i < 4000; i++) if (marks.copyRoll(20261002, i, 3) < 0.5) hits++;
  ok(hits > 1850 && hits < 2150, `the per-copy roll is fair (${hits} of 4000 under a half)`);
}

console.log("-- prop chance");
ok(kit.kitProblems({ p: "oil-drum", x: 1, y: 1, c: 0 }).some((m) => /chance/.test(m)) && kit.kitProblems({ p: "oil-drum", x: 1, y: 1, c: 50 }).length === 0, "a prop's chance is 1–100%");
{
  const lib = copy(POOL_LIBRARY);
  const was = planPoolsSector(SECTOR_P.seed, SECTOR_P.size, lib);
  // the room with the most copies gets three props in "half the copies"
  const counts = new Map();
  for (const i of was.insts) counts.set(i.tileId, (counts.get(i.tileId) ?? 0) + 1);
  const busiest = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const t = lib.find((q) => q.id === busiest);
  const open = [];
  for (let y = 0; y < t.map.length; y++) for (let x = 0; x < t.map[y].length; x++) if (t.map[y][x] !== " " && t.map[y][x] !== "#") open.push([x + 0.5, y + 0.5]);
  const before = was.sector.kit?.length ?? 0;
  t.props = [...(t.props ?? []), ...open.slice(0, 3).map(([x, y]) => ({ p: "sign-note", x, y, c: 50 }))];
  const inRoom = counts.get(busiest) * 3;
  was.sector.kit = Array.from({ length: before + inRoom });
  const now = planPoolsSector(SECTOR_P.seed, SECTOR_P.size, lib);
  const kept = (now.sector.kit?.length ?? 0) - ((was.sector.kit?.length ?? 0) - inRoom);
  ok(kept > inRoom * 0.2 && kept < inRoom * 0.8, `props in "half the copies" of ${t.id}: ${kept} of ${inRoom} placed`);
  ok(sectorFingerprint(now.sector) === SECTOR_P_FINGERPRINT, "…and the Poolrooms keep their fingerprint");
  ok(JSON.stringify(planPoolsSector(SECTOR_P.seed, SECTOR_P.size, lib).sector.kit) === JSON.stringify(now.sector.kit), "…the same props, every build");
  ok(!(now.sector.kit ?? []).some((q) => "c" in q), "the map's props don't carry the chance (it was spent choosing them)");
}

console.log("-- signs");
ok(kit.KIT_SIGNS.length >= 4 && kit.KIT_SIGNS.every((p) => p.builtin === "sign" && kit.KIT.get(p.id) === p), "the signs are in the catalogue the editor offers");
ok(kit.KIT_SIGNS.every((p) => p.variants.every((v) => kit.isSignFile(v.file))) && !kit.KIT_PROPS.some((p) => p.variants.some((v) => kit.isSignFile(v.file))), "a sign's style is never a model file, and no model is mistaken for a sign");
ok(kit.kitProblems({ p: "sign-paint", x: 1, y: 1, text: "x".repeat(kit.SIGN_MAX + 1) }).some((m) => /words/.test(m)), `a sign holds at most ${kit.SIGN_MAX} characters`);
{
  const file = tiles.formatLibrary([copy(ROOM)]);
  ok(file.includes('"text":"the key is behind you"') && file.includes('"marks": ['), "the library file writes a sign's words and the room's markers, one per line");
  const back = JSON.parse(file).tiles[0];
  ok(JSON.stringify(back.marks) === JSON.stringify(ROOM.marks) && back.props[0].text === ROOM.props[0].text, "…and reads them back as they were");
  const lib = copy(LOBBY_LIBRARY);
  const t = lib.find((q) => q.role === "block");
  t.props = [...(t.props ?? []), { p: "sign-plate", x: 1.5, y: 1.5, text: "EXIT" }];
  const s = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib).sector;
  ok((s.kit ?? []).some((q) => q.p === "sign-plate" && q.text === "EXIT"), "a sign's words reach the map the generator builds");
}

// ---- THE HELD CEILING (Josh, Oct 2026: "Fix the height tool it just the
// ceiling when i only want to drop the floor") — ceiling.ts
console.log("-- the held ceiling");
{
  const { LID_NONE, ceilingWithLid, LID_HEADROOM } = D("ceiling");
  const { libraryChanges } = D("designs");
  const over = (f) => f + 3;
  ok(ceilingWithLid(over, -1.5, null) === 1.5 && ceilingWithLid(over, -1.5, 0) === 3, "a dropped floor that holds its ceiling keeps the room's ceiling (3m over the old floor, not 3m over the pit)");
  ok(ceilingWithLid(over, 2, 0) === 2 + LID_HEADROOM, "…and a raised one pushes it up only as far as headroom asks");
  const lib = JSON.parse(JSON.stringify(LOBBY_LIBRARY));
  const wash = lib.find((t) => t.id === "the-washroom");
  // hold the basin's ceiling where the floor was (the floor-only Heights tool)
  wash.ceiling = wash.height.map((r) => [...r].map((c) => (c === "a" ? "0" : ".")).join(""));
  const pt = parseLobbyTile(wash);
  const held = [...pt.lid].filter((v) => v !== LID_NONE);
  ok(held.length === 36 && held.every((v) => v === 0), `the room's ceiling layer reads as a held ceiling on exactly the basin's cells (${held.length})`);
  let lidOk = true;
  const pairs = (t) => [...t.hgt].map((h, i) => `${h}/${t.lid[i]}`).sort().join(",");
  for (const mir of [false, true]) for (let rot = 0; rot < 4; rot++) if (pairs(tiles.transformTile(pt, rot, mir)) !== pairs(pt)) lidOk = false;
  ok(lidOk, "in all eight placements every held ceiling stays on its own floor cell");
  ok(tiles.formatLibrary([wash]).includes('"ceiling": [') && JSON.stringify(JSON.parse(tiles.formatLibrary([wash])).tiles[0].ceiling) === JSON.stringify(wash.ceiling), "the library writes the ceiling layer like the others, and reads it back");
  // the clipboard carries it
  const c = clip.cutClip(wash, 6, 6, 13, 13);
  ok(c.ceiling.join("").replace(/\./g, "").length === 36, "a clip lifts the held ceiling with its floor");
  const tc = clip.turnClip(c);
  const fc = clip.flipClip(c);
  const tied = (q) => q.height.every((r, y) => [...r].every((h, x) => (h === "a") === (q.ceiling[y][x] === "0")));
  ok(tied(tc) && tied(fc), "…and a turned or flipped clip keeps it on the same cells as the dropped floor");
  const rc = { ...c, props: [{ p: "wood-crate", x: 1.5, y: 1.5, rx: 15, rz: 25 }] };
  ok(clip.flipClip(rc).props[0].rz === -25 && clip.flipClip(rc).props[0].rx === 15 && clip.turnClip(rc).props[0].rz === 25, "a flipped clip flips a prop's lean and keeps its tip; a turned one keeps both");
  // the map: stamped, not hashed, a repaint
  const plain = planLobbySector(SECTOR_A.seed, SECTOR_A.size);
  const heldMap = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib);
  const stamped = heldMap.sector.lid ? [...heldMap.sector.lid].filter((v) => v !== LID_NONE).length : 0;
  ok(!plain.sector.lid && stamped > 0 && stamped % 36 === 0, `the generator stamps the held ceiling into the map on every copy of the room (${stamped} cells)`);
  ok(sectorFingerprint(heldMap.sector) === sectorFingerprint(plain.sector), "holding a ceiling leaves the map's fingerprint alone — the level keeps its fog and its runs");
  const ch = libraryChanges(LOBBY_LIBRARY, lib);
  ok(ch.looksChanged.includes("the-washroom") && !ch.reshaped.includes("the-washroom"), "the publish screen reads it as a repaint, not a redrawn room");
}

// ---- SCENERY (Josh, Oct 2026: "i get the open cells cannot be walked to …
// even though i dont want them to be reachable"): floor no door reaches is
// drawn and never entered — a warning, not a wall to stop on
console.log("-- scenery");
{
  const { validateSector } = D("worldgen");
  const { buildMap } = D("designs");
  const lib = JSON.parse(JSON.stringify(LOBBY_LIBRARY));
  const wash = lib.find((t) => t.id === "the-washroom");
  // sink the basin to a ledge nobody climbs out of
  wash.height = wash.height.map((r) => r.replace(/a/g, "c"));
  const L = lintLobbyTile(wash);
  ok(!L.errors.length && L.warnings.some((w) => /scenery/.test(w)), `floor no door reaches is a warning, not an error (${L.errors[0] ?? L.warnings.find((w) => /scenery/.test(w))})`);
  ok([...L.tile.scenery].filter(Boolean).length === 36, "…and exactly those cells are marked scenery");
  let scOk = true;
  const pairs = (t) => [...t.hgt].map((h, i) => `${h}/${t.scenery[i]}`).sort().join(",");
  for (const mir of [false, true]) for (let rot = 0; rot < 4; rot++) if (pairs(tiles.transformTile(L.tile, rot, mir)) !== pairs(L.tile)) scOk = false;
  ok(scOk, "in all eight placements the scenery stays on its own cells");
  const plan = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib);
  const bg = [...plan.sector.background].filter(Boolean).length;
  ok(bg > 0 && bg % 36 === 0 && plan.lostCells === 0, `the generator makes it background on every copy and seals nothing (${bg} cells, ${plan.lostCells} sealed)`);
  const r = validateSector(plan.sector);
  ok(r.reachablePct === 100 && r.strandedCells === 0, `nobody can fall into it and be stranded (reach ${r.reachablePct}%, stranded ${r.strandedCells})`);
  const built = buildMap(0, lib, SECTOR_A.seed);
  ok(built.problems.length === 0, `the level builds with no problems to stop a test play or a publish (${built.problems.join("; ") || "none"})`);
  ok(lintLobbyTile(JSON.parse(JSON.stringify(LOBBY_LIBRARY)).find((t) => t.id === "the-washroom")).tile.scenery.every((v) => !v), "a room every door reaches has no scenery");
}

// ---- STAIRS THAT LOOK LIKE STAIRS (Josh, Oct 2026: "color, scale, resize and
// texture stairs so they look more natural") — stairs.ts
console.log("-- stairs");
{
  const { stairProblems, StairTable } = D("stairs");
  const { libraryChanges } = D("designs");
  const { planPipesSector, SECTOR_D } = D("worldgen-pipes");
  ok(stairProblems({ tex: "carpet", col: "#aa8844", steps: 4, width: 70, rail: true }).length === 0, "a stair dressing with a surface, a colour, its steps, a width and rails passes");
  ok(stairProblems({ tex: "nope" }).length === 1 && stairProblems({ col: "red" }).length === 1 && stairProblems({ steps: 9 }).length === 1 && stairProblems({ width: 20 }).length === 1, "an unknown surface, a bad colour, too many steps or too narrow a flight is refused by name");
  const tbl = new StairTable();
  ok(tbl.styleOf(undefined) === 0 && tbl.styleOf({}) === 0 && tbl.styleOf({ steps: 4, rail: true }) === 1 && tbl.styleOf({ rail: true, steps: 4 }) === 1 && tbl.styleOf({ width: 60 }) === 2, "the same dressing is numbered once on a map, and none is 0");
  // a Level 0 room given a stair and a dressing
  const lib = JSON.parse(JSON.stringify(LOBBY_LIBRARY));
  const wash = lib.find((t) => t.id === "the-washroom");
  // a flight down into the basin: the cell north of it, climbing north
  wash.stair = wash.height.map((r, y) => [...r].map((c, x) => (y === 7 && x === 9 ? "^" : ".")).join(""));
  wash.stairs = { tex: "carpet-green", steps: 4, width: 80, rail: true };
  const L = lintLobbyTile(wash);
  ok(!L.errors.length, `a room with a dressed stair passes the checker${L.errors[0] ? " — " + L.errors[0] : ""}`);
  ok(lintLobbyTile({ ...wash, stairs: { steps: 0 } }).errors.some((e) => /steps a cell/.test(e)), "…and refuses a bad dressing");
  const fmt = tiles.formatLibrary([wash]);
  ok(fmt.includes('"stairs": {"tex":"carpet-green","steps":4,"width":80,"rail":true}') && tiles.formatLibrary(JSON.parse(fmt).tiles) === fmt, "the library writes the room's stair dressing and reads it back");
  const plan = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib);
  const stairs = plan.sector.stair ? [...plan.sector.stair].map((v, i) => [v, i]).filter(([v]) => v >= 0) : [];
  const dressed = stairs.filter(([, i]) => plan.sector.stairStyle?.[i] > 0);
  ok(stairs.length > 0 && dressed.length === stairs.length && plan.sector.stairSpecs?.[0]?.tex === "carpet-green", `the generator stamps every copy's stair with its dressing (${stairs.length} cells)`);
  ok(sectorFingerprint(plan.sector) === sectorFingerprint(planLobbySector(SECTOR_A.seed, SECTOR_A.size, (() => { const l = JSON.parse(JSON.stringify(lib)); delete l.find((t) => t.id === "the-washroom").stairs; return l; })()).sector), "a stair's dressing leaves the map's fingerprint alone");
  const ch = libraryChanges(lib, lib.map((t) => (t.id === "the-washroom" ? { ...t, stairs: { ...t.stairs, col: "#336699" } } : t)));
  ok(ch.looksChanged.includes("the-washroom") && !ch.reshaped.includes("the-washroom"), "redressing a room's stairs reads as a repaint on the publish screen");
  const d3 = planPipesSector(SECTOR_D.seed, SECTOR_D.size).sector;
  ok(d3.stair && [...d3.stair].some((v) => v >= 0), "Pipe Dreams' stair rooms reach the map as stair cells too (they get real steps)");
}

// ---- THE COST METER (src/backrooms/cost.ts) --------------------------------------
// Josh, Oct 2026: "props and triangles per area, so a room heavy enough to
// stutter the game shows up while you're building it".
console.log("-- the cost meter");
{
  const cost = D("cost");
  const { planPipesSector, SECTOR_D } = D("worldgen-pipes");
  const COSTS = require(path.join(ROOT, "src", "backrooms", "props-cost.json")).files;
  const files = kit.KIT_PROPS.flatMap((p) => p.variants.map((v) => v.file));
  const missing = files.filter((f) => !COSTS[f]);
  ok(!missing.length, `every model in the prop kit has a cost (${files.length} files${missing.length ? `, missing ${missing.slice(0, 3).join(", ")}` : ""})`);
  const p0 = kit.KIT_PROPS.find((p) => p.variants.length > 1);
  ok(JSON.stringify(cost.propCost(p0.id, 2)) === JSON.stringify(COSTS[p0.variants[1].file]), "a prop's cost is its own variant's model");
  const sign = kit.KIT_SIGNS[0];
  ok(cost.propCost(sign.id)[0] === 1 && cost.propCost("no-such-prop")[0] === 0, "a drawn sign costs one draw call; an unknown prop costs nothing");
  const one = COSTS[p0.variants[1].file];
  const two = cost.costOf([{ p: p0.id, v: 2 }, { p: p0.id, v: 2 }]);
  ok(two.props === 2 && two.calls === one[0] * 2 && two.tris === one[1] * 2, "a room's cost is its props added up");
  ok(cost.costLoad({ props: 1, calls: cost.COST_BUDGET.calls, tris: 0 }) === 1 && cost.costLoad({ props: 1, calls: 0, tris: cost.COST_BUDGET.tris * 2 }) === 2, "the load is the fuller of draw calls and triangles against the budget");
  const sq = cost.squareCosts([[p0.id, 2, 1.5, 1.5, 0], [p0.id, 2, 17.5, 1.5, 0], [p0.id, 2, 16.1, 0.2, 0]], 40);
  ok(sq.n === 3 && sq.costs[0].props === 1 && sq.costs[1].props === 2 && sq.costs[3].props === 0, "props are added up in 16-cell squares, each in the square it stands in");
  // THE BUDGET'S EVIDENCE: the busiest patch each repo map carries today
  const kitOf = (s) => (s.kit ?? []).map((k) => [k.p, k.v, k.x, k.y]);
  const s0 = planLobbySector(SECTOR_A.seed, SECTOR_A.size, LOBBY_LIBRARY).sector;
  const s2 = planPipesSector(SECTOR_D.seed, SECTOR_D.size).sector;
  const l0 = cost.costLoad(cost.levelPatchMax(kitOf(s0), s0.size));
  const l2 = cost.costLoad(cost.levelPatchMax(kitOf(s2), s2.size));
  console.log(`   (busiest patch today: Level 0 ${Math.round(l0 * 100)}%, Pipe Dreams ${Math.round(l2 * 100)}% of the budget)`);
  ok(l0 > 0.5 && l2 > 0.5 && Math.max(l0, l2) <= 1.0001 && Math.max(l0, l2) >= 0.95, "the budget IS the busiest patch the maps players walk already carry");
  const sq0 = Math.max(...cost.squareCosts(kitOf(s0), s0.size).costs.map(cost.costLoad));
  ok(sq0 <= l0 + 1e-9, "a square on the grid never reads heavier than the busiest patch (the overlay and the note agree)");
  // a room's meter is a patch too: a placed room can't read lighter than the
  // map patch it lands in (the room's own busiest patch bounds what it adds)
  const boardroom = LOBBY_LIBRARY.find((t) => t.id === "the-boardroom");
  const br = cost.costLoad(cost.heaviestPatch(boardroom.props, 20, 10));
  ok(br > 0.5 && br <= l0 + 1e-9, `a room on the map reads no heavier than the busiest patch it sits in (the boardroom ${Math.round(br * 100)}%)`);
  // rooms in the library heavier than anything players walk today (reported,
  // not refused: it's the designer's call, and the meter says so in the editor)
  const heavy = LOBBY_LIBRARY.filter((t) => t.props?.length)
    .map((t) => [t.id, cost.costLoad(cost.heaviestPatch(t.props, Math.max(...t.map.map((r) => r.length)), t.map.length))])
    .filter(([, v]) => v > 1);
  if (heavy.length) console.log(`   (over the budget if the generator places them: ${heavy.map(([id, v]) => `${id} ${Math.round(v * 100)}%`).join(", ")})`);
}
{
  // (Oct 2026 review) the 3D pick names the room's own prop, not the drawn one
  console.log("-- a skipped prop leaves the 3D pick pointing at the right prop");
  const t = { ...copy(ROOM), props: [{ p: "wood-crate", x: 99.5, y: 99.5 }, { p: "wood-crate", x: 1.5, y: 1.5 }] };
  const L = lintLobbyTile(t);
  ok(L.tile.props.length === 1 && JSON.stringify(L.tile.propSrc) === "[1]", `the drawn prop carries its index in the room's list (${JSON.stringify(L.tile.propSrc)})`);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
