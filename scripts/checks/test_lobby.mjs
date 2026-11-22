// LEVEL 0 harness — the frozen Level 0 sector (A5), THE LOBBY BUILT FROM
// HAND-MADE ROOMS (Josh, 2026-09-27: "All three levels now", "only one door
// per level"). The library is src/backrooms/lobby-rooms.json; lobby-tiles.ts is
// Level 0's dialect; worldgen-lobby.ts packs the rooms into a lattice wall to
// wall, the way the classic backrooms is.
//
// It holds the LIBRARY (every room passes the checker the editor shows, the
// file in the editor's layout, turning a room never changes what's in it —
// thin walls included), the LATTICE (every piece a library room, the whole map
// packed, the districts real), ONE DOOR (The Entrance on the map's edge, room to
// arrive in front of it), the MAP RULES (everything reachable, nothing
// stranded, every shaft a real shaft), and THE LORE (THE DOOR deep, the key in a
// landmark, all twenty drives placed, the furniture in).
//
// It replaces A3's audit (test_mapaudit, which never reached the repo).
//
// A5 (Sep 2026) replaced A4: Josh — "The level 0 is way to massive lets
// condense it down a 3rd its size please with more variations in its rooms
// type and look." So it also holds THE CONDENSE (about a third of A4's floor)
// and THE LOOKS (every room type on the map, every one dressed by the client).
// Build first (npm run build); consumes dist/backrooms/*.js. Pure data.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const dist = (p) => path.join(ROOT, "dist", "backrooms", p);
const { planLobbySector, generateLobbySector, loadLobbyLibrary, LOBBY_LIBRARY } = require(dist("worldgen-lobby.js"));
const { SECTOR_A, SECTOR_A_FINGERPRINT, SECTOR_A3_RETIRED, SECTOR_A4_RETIRED, SECTOR_A5_RETIRED, sectorFingerprint, validateSector, distanceMap, PIT_LETHAL } = require(dist("worldgen.js"));
const { formatLibrary, tileVariants } = require(dist("tiles.js"));
const { LOBBY_TYPES, MODULE, LOBBY_PIT, LOBBY_DOOR_NAME, LOBBY_CEILINGS } = require(dist("lobby-vocab.js"));
const { doorSite, keySite, driveSites, DRIVES } = require(dist("lore.js"));
const { propsInChunk } = require(dist("props.js"));

let n = 0;
let bad = 0;
const ok = (cond, name) => {
  n++;
  if (!cond) {
    bad++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
};

const plan = planLobbySector(SECTOR_A.seed, SECTOR_A.size);
const s = plan.sector;
const r = validateSector(s);
const size = s.size;
const lib = loadLobbyLibrary(LOBBY_LIBRARY, true);
const byId = new Map(lib.map((e) => [e.def.id, e]));
const insts = plan.insts;

// ---- the frozen world
ok(SECTOR_A.id === "A6" && SECTOR_A.size === 182, "sector is A6 182²");
ok(sectorFingerprint(s) === SECTOR_A_FINGERPRINT, "fingerprint matches the frozen A6");
ok(sectorFingerprint(generateLobbySector(SECTOR_A.seed, SECTOR_A.size)) === SECTOR_A_FINGERPRINT, "generation is deterministic");
ok(SECTOR_A5_RETIRED.id === "A5" && SECTOR_A5_RETIRED.fingerprint !== SECTOR_A_FINGERPRINT && SECTOR_A4_RETIRED.fingerprint !== SECTOR_A_FINGERPRINT && SECTOR_A3_RETIRED.fingerprint !== SECTOR_A_FINGERPRINT, "a new sector id and a new map — A5's fog, paint and bodies are left behind");
ok(LOBBY_PIT === PIT_LETHAL, `a shaft means the same depth to the rooms and the game (${LOBBY_PIT})`);

// ---- THE LIBRARY
{
  const broken = lib.filter((e) => e.lint.errors.length).map((e) => `${e.def.id}: ${e.lint.errors[0]}`);
  ok(broken.length === 0, `every room in the library passes the checker (${broken.slice(0, 3).join(" | ") || `${lib.length} rooms`})`);
  const ids = lib.map((e) => e.def.id);
  ok(new Set(ids).size === ids.length, "every room has its own id");
  ok(lib.length >= 40, `a library big enough not to repeat itself (${lib.length} rooms)`);
  const roles = new Set(lib.map((e) => e.def.role));
  ok(["start", "landmark", "block"].every((q) => roles.has(q)), `every role is drawn (${[...roles].join(", ")})`);
  const drawn = new Set(lib.map((e) => e.def.type));
  ok(LOBBY_TYPES.every((t) => drawn.has(t)), `every Level 0 room type has rooms (${[...drawn].join(", ")})`);
  ok(lib.every((e) => e.base.w % MODULE === 0 && e.base.h % MODULE === 0), `every room is whole ${MODULE}-cell modules`);
  const raw = readFileSync(path.join(ROOT, "src", "backrooms", "lobby-rooms.json"), "utf8").split("\r\n").join("\n");
  ok(formatLibrary(JSON.parse(raw).tiles) === raw, "the library file is in the editor's layout (a save round-trips it byte for byte)");
  let drift = 0;
  for (const e of lib) {
    if (!e.variants.length) continue;
    const count = (t) => [Array.from(t.cell).filter((c) => c === 1).length, Array.from(t.cell).filter((c) => c === 2).length, t.sockets.length, t.pieces.length, Array.from(t.hgt).reduce((a, b) => a + b, 0), Array.from(t.wallN).reduce((a, b) => a + b, 0) + Array.from(t.wallW).reduce((a, b) => a + b, 0)].join();
    const want = count(e.base);
    for (const v of tileVariants(e.base)) if (count(v) !== want) drift++;
  }
  ok(drift === 0, "every turned or mirrored copy of a room holds exactly what the drawing holds — its drywall included");
}

// ---- THE LATTICE
{
  ok(insts.every((i) => byId.has(i.tileId)), `every piece of the level is a room from the library (${insts.length} rooms)`);
  const G = Math.floor((size - 2) / MODULE);
  const covered = insts.reduce((a, i) => a + i.mw * i.mh, 0);
  ok(covered === G * G, `the whole map is packed, wall to wall (${covered} of ${G * G} modules)`);
  let stray = 0;
  for (let i = 0; i < size * size; i++) if (!s.solid[i] && !plan.space[i]) stray++;
  ok(stray === 0, "no open floor that no room owns");
  ok(r.walkableCells > 0.85 * (G * MODULE) ** 2, `the classic backrooms: almost all floor (${r.walkableCells} walkable of ${(G * MODULE) ** 2})`);
  const types = new Set(insts.map((i) => i.type));
  ok(LOBBY_TYPES.every((t) => types.has(t)), `every one of the ${LOBBY_TYPES.length} room types is on the map (${LOBBY_TYPES.filter((t) => !types.has(t)).join(", ") || "all"})`);
  // THE YELLOW ROOMS (Josh: "keep most of the map the same color pallet with
  // a couple of room with different variance"): the palette-breaking types
  // are a handful of single rooms, never a district
  const ACCENT = ["restrooms", "panelled", "storage"];
  const accentRooms = insts.filter((i) => ACCENT.includes(i.type));
  const accentModules = accentRooms.reduce((a, i) => a + i.mw * i.mh, 0);
  ok(accentRooms.length >= 3 && accentRooms.length <= 6 && accentModules <= G * G * 0.05, `a couple of rooms break the palette, no more (${accentRooms.map((i) => i.name ?? i.type).join(", ")}: ${accentModules} of ${G * G} modules)`);
  // THE TRIM: about three quarters of A5's walkable floor (43,769 cells)
  ok(r.walkableCells < 43769 * 0.8 && r.walkableCells > 43769 * 0.7, `a quarter smaller than A5 (${r.walkableCells} walkable cells against 43,769)`);
  // THE LOOKS: every type is dressed by the client (world.ts LOBBY_LOOK) and
  // has a ceiling height (lobby-vocab.ts) — a type missing from either would
  // fall back to the classic look or a 3m ceiling without a word.
  const worldSrc = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const lookBlock = worldSrc.slice(worldSrc.indexOf("export const LOBBY_LOOK"), worldSrc.indexOf("};", worldSrc.indexOf("export const LOBBY_LOOK")));
  const undressed = LOBBY_TYPES.filter((t) => !lookBlock.includes(`\n  ${t}: {`));
  ok(undressed.length === 0, `every room type has its own look on the client (${undressed.join(", ") || "all dressed"})`);
  ok(LOBBY_TYPES.every((t) => LOBBY_CEILINGS[t] > 0), "every room type has a ceiling height");
  const over = lib.filter((e) => e.def.max !== undefined && insts.filter((q) => q.tileId === e.def.id).length > e.def.max);
  ok(over.length === 0, `no room is built more often than its cap (${over.map((e) => e.def.id).join(" ") || "all within"})`);
  ok(plan.unmet.length === 0, `every room with a minimum has it (${plan.unmet.join(" ") || "all met"})`);
  ok(plan.opened > plan.tree * 1.5, `a place of junctions, not one long maze: ${plan.opened} doorways opened, ${plan.tree} needed to connect it`);
  // thin walls reach the map: the warrens really are a maze
  let walls = 0;
  for (let i = 0; i < size * size; i++) walls += s.wallN[i] + s.wallW[i];
  ok(walls > size * size * 0.22, `drywall everywhere (${walls} wall edges)`);
}

// ---- ONE DOOR: The Entrance, on the map's edge
{
  const d = s.doors[0];
  ok(s.doors.length === 1 && d.name === LOBBY_DOOR_NAME, `ONE DOOR (Josh: "only one door per level for entering"): ${s.doors.map((q) => q.name).join(", ")}`);
  const beyond = d.edge === "N" ? [d.x, d.y - 1] : d.edge === "S" ? [d.x, d.y + 1] : d.edge === "W" ? [d.x - 1, d.y] : [d.x + 1, d.y];
  const onEdge = beyond[0] < 0 || beyond[1] < 0 || beyond[0] >= size || beyond[1] >= size || (s.solid[beyond[1] * size + beyond[0]] && (beyond[0] === 0 || beyond[1] === 0 || beyond[0] === size - 1 || beyond[1] === size - 1));
  ok(onEdge, `its wall is the map's outer wall (${d.edge} at ${d.x},${d.y})`);
  const inX = d.edge === "E" ? -1 : d.edge === "W" ? 1 : 0;
  const inY = d.edge === "N" ? 1 : d.edge === "S" ? -1 : 0;
  const clear = [0, 1, 2].every((k) => !s.solid[(d.y + inY * k) * size + d.x + inX * k] && s.floor[(d.y + inY * k) * size + d.x + inX * k] === 0);
  ok(clear, "you arrive two cells in, on clear floor");
}

// ---- THE MAP RULES
{
  ok(r.reachablePct === 100 && plan.lostCells === 0, `everything is reachable from The Entrance, and nothing had to be sealed (${r.walkableCells} cells)`);
  ok(r.strandedCells === 0, "nowhere you can fall into and never walk out of");
  ok(r.shallowPits === 0, "every shaft is a real shaft (nine steps and deeper)");
  let shafts = 0;
  for (let i = 0; i < size * size; i++) if (!s.solid[i] && s.floor[i] <= -PIT_LETHAL) shafts++;
  ok(shafts >= 12, `lethal shafts exist (${shafts} cells)`);
  const names = s.landmarks.map((l) => l.name);
  for (const want of ["The Red Door", "Pillar Garden", "The Long Table", "The Basin", "Static Row", "The Switchback", "The Hollow", "Court of Columns", "The Washroom", "The Boardroom"]) ok(names.includes(want), `landmark: ${want}`);
}

// ---- THE LORE
{
  const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const door = doorSite(s, d0);
  const depth = d0[Math.floor(door.y) * size + Math.floor(door.x)];
  ok(depth >= 250, `THE DOOR to Level 1 is deep: ${depth} cells from The Entrance`);
  const key = keySite(s, door);
  ok(!!key.landmark, `THE KEY waits in a landmark (${key.landmark})`);
  const drives = driveSites(s, DRIVES);
  ok(drives.length === 20, `all twenty lore drives find a place (${drives.length})`);
  ok(drives.every((q) => Math.hypot(q.x - s.doors[0].x, q.y - s.doors[0].y) >= 28), "none of them on the doorstep");
  let furniture = 0;
  for (let cy = 0; cy < Math.ceil(size / 16); cy++) for (let cx = 0; cx < Math.ceil(size / 16); cx++) furniture += propsInChunk(s, cx * 16, cy * 16, 16, 16).length;
  ok(furniture >= 28, `the game furnishes it by district (${furniture} pieces — about one per thousand walkable cells)`);
}

// ---- the generator is sound on other seeds too
{
  const res = [11, 22, 33].map((sd) => {
    const p = planLobbySector(sd, SECTOR_A.size);
    const v = validateSector(p.sector);
    return { sd, ok: v.reachablePct === 100 && v.strandedCells === 0 && v.shallowPits === 0 && p.lostCells === 0 && p.unmet.length === 0 && p.sector.doors.length === 1 && driveSites(p.sector, DRIVES).length === 20 };
  });
  ok(res.every((q) => q.ok), `three other seeds each build a whole Level 0 (${res.map((q) => `${q.sd}:${q.ok ? "ok" : "BAD"}`).join(" ")})`);
}

// ---- THE LOOK PICKER (surfaces.ts): a room may wear other walls, floor and
// ceiling than its type's, and that is DRESSING — never in the fingerprint
{
  const { SURFACES, StyleTable, lookKey, lookProblems, setCustomSurfaces, LEVEL0_SURFACES, levelSurfaces } = require(dist("surfaces.js"));
  const { lintLobbyTile } = require(dist("lobby-tiles.js"));
  const { lintPoolTile } = require(dist("pools-tiles.js"));
  const kinds = ["wall", "floor", "ceil"];
  const ids = kinds.flatMap((k) => SURFACES[k].map((q) => q.id));
  ok(new Set(ids).size === ids.length, `every surface id is unique (${ids.length})`);
  const photos = kinds.flatMap((k) => SURFACES[k].filter((q) => q.file));
  const missing = photos.flatMap((q) => [`${q.file}-color.jpg`, ...(q.normal ? [`${q.file}-normal.jpg`] : [])]).filter((fn) => {
    try { readFileSync(path.join(ROOT, "client/public/assets/br/tex", fn)); return false; } catch { return true; }
  });
  ok(missing.length === 0 && photos.every((q) => q.sizeM > 0), `every photographed surface has its files and a size (${photos.length} photographed${missing.length ? `; missing ${missing.join(", ")}` : ""})`);
  // the client's LOBBY_LOOK numbers are indexes into the catalogue
  const worldSrc = readFileSync(path.join(ROOT, "client/src/backrooms/world.ts"), "utf8");
  const rows = [...worldSrc.slice(worldSrc.indexOf("export const LOBBY_LOOK"), worldSrc.indexOf("const LOOK_DEFAULT")).matchAll(/wall: (\d+), floor: (\d+), ceil: (\d+)/g)];
  ok(rows.length === LOBBY_TYPES.length && rows.every((r) => +r[1] < SURFACES.wall.length && +r[2] < SURFACES.floor.length && +r[3] < SURFACES.ceil.length), `every room type's look names a real surface (${rows.length} types)`);
  // LEVEL 0 WEARS THE BACKROOMS ONLY (Josh, Sep 30 2026: "level 0 should only
  // have backrooms texturing not pools or stuff from pipe dream")
  const offLevel = rows.map((r) => [r[0], SURFACES.wall[+r[1]].id, SURFACES.floor[+r[2]].id, SURFACES.ceil[+r[3]].id]).filter(([, w, fl, c]) => !LEVEL0_SURFACES.wall.includes(w) || !LEVEL0_SURFACES.floor.includes(fl) || !LEVEL0_SURFACES.ceil.includes(c));
  ok(offLevel.length === 0, `every room type wears only the backrooms' own surfaces — no pool tile, no Pipe Dreams concrete${offLevel.length ? ` (${offLevel.map((q) => q.slice(1).join("/")).join("; ")})` : ""}`);
  ok(levelSurfaces("wall", 0).every((q) => LEVEL0_SURFACES.wall.includes(q.id)) && !levelSurfaces("wall", 0).some((q) => q.id === "pool-tile") && levelSurfaces("wall", 2).length === SURFACES.wall.length, "the Level 0 look picker offers only its own surfaces; Pipe Dreams offers every one");
  const lk = { wall: "wood-panels", floor: "carpet-green" };
  const st = new StyleTable();
  const first = st.styleOf(lk);
  ok(st.styleOf(undefined) === 0 && st.styleOf({}) === 0 && first === 1 && st.styleOf({ floor: "carpet-green", wall: "wood-panels" }) === 1 && st.styles.length === 1 && lookKey(st.styles[0]) === lookKey(lk), "a room style is numbered once however many rooms wear it, and no style is 0");
  ok(lookProblems({ lights: 150 }).length === 1 && lookProblems({ bright: 5 }).length === 1 && lookProblems({ sound: "kazoo" }).length === 1 && lookProblems({ lights: 50, flicker: 20, bright: 75, sound: "drip" }).length === 0, "a room's lights, brightness and sound are checked, and good ones pass");
  setCustomSurfaces([{ id: "c1", kind: "wall", name: "Red brick", url: "/api/br-surface/x.jpg", sizeM: 2 }]);
  ok(lookProblems({ wall: "c1" }).length === 0 && lookProblems({ floor: "c1" }).length === 1, "an uploaded texture is a surface of its own kind and no other");
  setCustomSurfaces([]);
  ok(lookProblems({ wall: "no-such-wall" }).length === 1 && lookProblems({ floor: "wood-panels" }).length === 1 && lookProblems(lk).length === 0, "a surface that doesn't exist, or of the wrong kind, is refused by name");
  // a library with one room repainted
  const lib = JSON.parse(JSON.stringify(LOBBY_LIBRARY));
  const room = lib.find((t) => t.id === "the-washroom");
  room.look = lk;
  ok(lintLobbyTile(room).errors.length === 0, "a Level 0 room with a look passes the checker");
  const foreign = [{ wall: "pool-tile" }, { floor: "concrete-floor" }, { ceil: "concrete-ceiling" }, { wall: "grey-marble-wall" }, { floor: "metal-walkway" }, { wall: "wall-tile" }];
  ok(foreign.every((look) => lintLobbyTile({ ...room, look }).errors.some((e) => /belongs to another level/.test(e))), "the Level 0 checker refuses a pool, marble, tile or Pipe Dreams surface by name");
  const shapeOn = (tex) => lintLobbyTile({ ...room, props: [...(room.props ?? []), { p: "shape-cube", x: 2.5, y: 2.5, sy: 0.2, tex }] }).errors.some((e) => /belongs to another level/.test(e));
  ok(shapeOn("pool-tile") && shapeOn("concrete-floor") && !shapeOn("paper-dots") && !shapeOn("carpet-green"), "…and so does a SHAPE wearing one (a shape in the yellow wallpaper is fine)");
  ok(lintPoolTile({ ...JSON.parse(JSON.stringify(lib.find((t) => t.id === "classic-1x1"))), look: { wall: "pool-tile" } }).errors.every((e) => !/belongs to another level/.test(e)), "the other levels' checkers keep every surface");
  setCustomSurfaces([{ id: "c1", kind: "wall", name: "Red brick", url: "/api/br-surface/x.jpg", sizeM: 2 }]);
  ok(lintLobbyTile({ ...room, look: { wall: "c1" } }).errors.length === 0, "a texture Josh uploads himself may go on Level 0");
  setCustomSurfaces([]);
  ok(lintPoolTile({ ...JSON.parse(JSON.stringify(lib.find((t) => t.id === "classic-1x1"))), look: { wall: "no-such-wall" } }).errors.some((e) => /isn't a wall surface/.test(e)), "every level's checker refuses a surface that doesn't exist");
  const painted = planLobbySector(SECTOR_A.seed, SECTOR_A.size, lib);
  ok(sectorFingerprint(painted.sector) === SECTOR_A_FINGERPRINT, "repainting a room leaves the map's fingerprint alone — a look never resets the level");
  const code = painted.sector.styles.findIndex((q) => lookKey(q) === lookKey(lk)) + 1;
  const inst = painted.insts.find((q) => painted.tiles[q.id].def.id === "the-washroom");
  const t = painted.tiles[inst.id];
  const own = t.dia.types.indexOf(t.def.type);
  let onOwn = 0, offOwn = 0, stray = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = y * t.w + x;
    if (!t.cell[i]) continue;
    const v = painted.sector.look[(inst.y + y) * SECTOR_A.size + inst.x + x];
    if (t.zone[i] === own) onOwn += v === code ? 1 : 0; else offOwn += v ? 1 : 0;
  }
  for (let i = 0; i < painted.sector.look.length; i++) if (painted.sector.look[i] && painted.sector.look[i] !== code) stray++;
  const total = painted.sector.look.reduce((a, v) => a + (v ? 1 : 0), 0);
  ok(onOwn > 0 && offOwn === 0 && stray === 0 && total === onOwn, `the look lands on that room's own floor and nowhere else (${onOwn} cells)`);
  ok(plan.sector.look.every((v) => v === 0), "the repo map wears only its types' looks");
}
// TWO ROOMS, TWO FACES; A DEAD LAMP STILL HANGS (Nov 2026 polish round). A thin
// wall between two room looks was one box in one room's paper; it is two skins
// now, each in its own room's wall. And a lamp that's off is drawn dark rather
// than left out, so an unlit room's ceiling is a field of dead troffers.
{
  const src = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  // how many thin-wall edges on the frozen map separate two looks
  const s = plan.sector;
  const size = SECTOR_A.size;
  const lookSrc = src.slice(src.indexOf("export const LOBBY_LOOK"), src.indexOf("const LOOK_DEFAULT"));
  const LOOK_TABLE = Object.fromEntries([...lookSrc.matchAll(/(\w+): \{ wall: (\d+)/g)].map((m) => [m[1], { wall: Number(m[2]) }]));
  const wallOf = (i) => LOOK_TABLE[s.districts[s.district[i]]?.type]?.wall;
  let twoLook = 0;
  for (let y = 1; y < size; y++) for (let x = 1; x < size; x++) {
    const i = y * size + x;
    if (s.solid[i]) continue;
    if (s.wallN[i] && !s.solid[i - size] && wallOf(i) !== wallOf(i - size)) twoLook++;
    if (s.wallW[i] && !s.solid[i - 1] && wallOf(i) !== wallOf(i - 1)) twoLook++;
  }
  ok(twoLook > 0 && /const thinWall = [\s\S]{0,900}?pushBox\(boxGeo\(horiz \? CELL : r2\(half\), r2\(h\), horiz \? r2\(half\) : CELL\), m, wallBucket\(other\)\);/.test(src) && /thinWall\(true, wx \+ CELL \/ 2, base \+ h \/ 2, wz, h, sgx, sgy - 1\);/.test(src) && /thinWall\(false, wx, base \+ h \/ 2, wz \+ CELL \/ 2, h, sgx - 1, sgy\);/.test(src), `a wall between two looks (${twoLook} edges on ${SECTOR_A.id}) wears each room's wall on its own side`);
  ok(/const deadLamp = carpet && !lobbyLampOn\(/.test(src) && /if \(!deadLamp\) lightSpots\.push\(spot\);/.test(src) && /if \(\(office \|\| carpet\) && spot\.dead\)/.test(src), "a Level 0 lamp that's off is drawn as a dead troffer and lights nothing");
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
