// THE PROP KIT harness — every prop Josh owns, named and filed for the map
// editor (Josh, 2026-09-27: "track all props I have and place them in the
// editor so I can choose placement. All properly name and categorize them for
// easy searching"). Holds four things to account:
//   the CATALOGUE  src/backrooms/props-catalog.json (built by
//                  scripts/props/build.mjs) — every entry named, filed and
//                  searchable, every file it names actually on disk;
//   the MATHS      src/backrooms/kit.ts — footprints, turned boxes, yaw;
//   the ROOMS      props in a room design turn and mirror WITH the room, and
//                  the checker refuses a prop in a doorway or one that cuts a
//                  room in two;
//   the MAP        the generator copies a room's props into the sector and a
//                  chunk request hands them out.
// Build first (npm run build). Pure data: no server, no network.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const kit = require(path.join(ROOT, "dist", "backrooms", "kit.js"));
const { lintTile, parseTile, tileVariants, transformTile, formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "pipes-tiles.js"));
const { planPipesSector, SECTOR_D } = require(path.join(ROOT, "dist", "backrooms", "worldgen-pipes.js"));
const { kitInChunk } = require(path.join(ROOT, "dist", "backrooms", "props.js"));

let n = 0;
let bad = 0;
const ok = (cond, name) => {
  n++;
  if (!cond) {
    bad++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---- the catalogue ------------------------------------------------------------------
console.log("-- the catalogue");
const P = kit.KIT_PROPS;
const KITDIR = path.join(ROOT, "client", "public", "assets", "propkit");
ok(P.length >= 150, `the catalogue lists every prop (${P.length})`);
ok(new Set(P.map((p) => p.id)).size === P.length, "every id is unique");
ok(P.every((p) => /^[a-z0-9-]+$/.test(p.id)), "every id is lowercase letters, digits and dashes");
ok(P.every((p) => p.name && p.name.length <= 40 && p.name[0] === p.name[0].toUpperCase()), "every prop has a proper name");
ok(P.every((p) => Array.isArray(p.cat) && p.cat.length === 2 && p.cat.every((c) => c.length)), "every prop is filed under a section and a shelf");
const sections = new Set(P.map((p) => p.cat[0]));
ok(sections.size >= 6 && sections.size <= 12, `the sections are few enough to browse (${[...sections].join(", ")})`);
ok(P.every((p) => ["floor", "wall", "ceiling"].includes(p.mount)), "every prop mounts on the floor, a wall or the ceiling");
ok(P.every((p) => p.theme.length && p.levels.every((l) => l >= 0 && l <= 9)), "every prop carries its theme");
ok(P.filter((p) => p.levels.includes(0)).length && P.filter((p) => p.levels.includes(1)).length && P.filter((p) => p.levels.includes(2)).length, "each of the three levels has props of its own theme");
const files = P.flatMap((p) => p.variants.map((v) => v.file));
ok(new Set(files).size === files.length, `every variant has its own file (${files.length})`);
const missing = [];
const missingThumb = [];
const missingTex = new Set();
for (const f of files) {
  const g = path.join(KITDIR, `${f}.gltf`);
  if (!existsSync(g)) {
    missing.push(f);
    continue;
  }
  const j = JSON.parse(readFileSync(g, "utf8"));
  for (const b of j.buffers ?? []) if (b.uri && !existsSync(path.join(KITDIR, b.uri))) missing.push(`${f}:${b.uri}`);
  for (const im of j.images ?? []) if (im.uri && !existsSync(path.join(KITDIR, im.uri))) missingTex.add(im.uri);
  if (!existsSync(path.join(KITDIR, "thumbs", `${f}.webp`))) missingThumb.push(f);
}
ok(!missing.length, `every variant's model is on disk${missing.length ? " — missing " + missing.slice(0, 3).join(", ") : ""}`);
ok(!missingTex.size, `every texture a model points at is on disk${missingTex.size ? " — " + [...missingTex][0] : ""}`);
ok(!missingThumb.length, `every variant has a thumbnail for the browser${missingThumb.length ? " — missing " + missingThumb.slice(0, 3).join(", ") : ""}`);
const sizes = P.flatMap((p) => p.variants.map((v) => v.size));
ok(sizes.every((s) => s.length === 3 && s.every((x) => Number.isFinite(x) && x >= 0 && x < 25)), "every size is in metres and sane (under 25m)");
ok(P.filter((p) => p.solid).every((p) => p.variants.every((v) => v.size[1] > 0.05)), "nothing solid is paper-thin");
ok(P.find((p) => p.id === "oil-drum")?.variants.every((v) => near(v.size[1], 0.9, 0.01)), "an oil drum stands 0.9m (the build's real-height scaling)");
ok(P.find((p) => p.id === "playing-card")?.variants.length === 53, "the deck is one prop with 53 variants, not 53 props");
ok(P.find((p) => p.id === "playing-card")?.variants.every((v) => v.size[1] < 0.02), "a playing card lies flat");

// ---- the maths ------------------------------------------------------------------------
console.log("-- the maths");
const box = { p: "shipping-container", x: 10, y: 10 };
const sz = kit.kitVariant(box).size;
const e0 = kit.kitExtents(box);
const e90 = kit.kitExtents({ ...box, r: 90 });
ok(near(e0.rx, sz[0] / 4) && near(e0.ry, sz[2] / 4), "unturned, the box is its width by its depth (in cells)");
ok(near(e90.rx, e0.ry) && near(e90.ry, e0.rx), "a quarter turn swaps them");
const e45 = kit.kitExtents({ ...box, r: 45 });
ok(e45.rx > e0.ry && e45.ry > e0.ry, "a diagonal box is wider than either face");
ok(kit.kitCovers(box, 10 + e0.rx - 0.01, 10) && !kit.kitCovers(box, 10 + e0.rx + 0.01, 10), "the footprint's edge is where the extents say");
ok(kit.kitCovers({ ...box, r: 90 }, 10, 10 + e0.rx - 0.01) && !kit.kitCovers({ ...box, r: 90 }, 10 + e0.rx - 0.01, 10), "turned 90°, the long side runs north-south");
ok(kit.kitYaw(-90) === 270 && kit.kitYaw(450) === 90, "yaw normalises into 0-360");
ok(kit.kitBlocks({ p: "oil-drum", x: 0, y: 0 }), "a drum on the floor blocks");
ok(!kit.kitBlocks({ p: "oil-drum", x: 0, y: 0, z: 1 }), "…one up on a shelf does not");
ok(!kit.kitBlocks({ p: "persian-rug", x: 0, y: 0 }) && !kit.kitBlocks({ p: "wood-pallet", x: 0, y: 0 }), "a rug and a pallet are walked over");
ok(!kit.kitBlocks({ p: "fuse-box", x: 0, y: 0 }), "a wall fitting never blocks");
ok(kit.kitProblems({ p: "no-such-prop", x: 0, y: 0 }).length === 1, "an unknown prop is named as such");
ok(kit.kitProblems({ p: "oil-drum", v: 9, x: 0, y: 0 })[0]?.includes("4 variants"), "a variant that doesn't exist says how many do");

// ---- the rooms -------------------------------------------------------------------------
console.log("-- the rooms");
const room = {
  id: "kit-test",
  kind: "storage",
  set: "any",
  role: "room",
  type: "warehouse",
  map: ["......", "......", "......", "......"],
  doors: [[0, 1, "W", 2], [5, 1, "E", 2]],
  props: [
    { p: "oil-drum", v: 2, x: 1.5, y: 0.5, r: 30 },
    { p: "shipping-container", x: 3, y: 3.3 },
    { p: "wood-crate", x: 4.5, y: 0.5, r: 90, z: 0.5 },
  ],
};
const L = lintTile(room);
ok(!L.errors.length, `a dressed room passes the checker${L.errors.length ? " — " + L.errors[0] : ""}`);
ok(L.tile.props.length === 3 && L.tile.props.every((q) => q.v >= 1 && Number.isFinite(q.r) && Number.isFinite(q.z)), "every prop is carried with its variant, yaw and height filled in");
// every turn and mirror: the props must cover the same cells the tile's own
// cells went to, and face the way the room now faces
const base = parseTile(room);
const cellsOf = (t, pl) => {
  const out = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (kit.kitCovers(pl, x + 0.5, y + 0.5)) out.push(`${x},${y}`);
  return out.sort().join(" ");
};
let turnOk = true;
let yawOk = true;
for (const mir of [false, true]) {
  for (let rot = 0; rot < 4; rot++) {
    const t = transformTile(base, rot, mir);
    // map the base cells by the same transform the tile applies to cells
    const map = (x, y) => {
      let X = x;
      let Y = y;
      let w = base.w;
      let h = base.h;
      if (mir) X = w - 1 - X;
      for (let k = 0; k < rot; k++) {
        [X, Y] = [h - 1 - Y, X];
        [w, h] = [h, w];
      }
      return `${X},${Y}`;
    };
    base.props.forEach((pl, k) => {
      const want = cellsOf(base, pl).split(" ").filter(Boolean).map((c) => map(...c.split(",").map(Number))).sort().join(" ");
      if (cellsOf(t, t.props[k]) !== want) turnOk = false;
      // facing: the model's front (0,1) turned by r
      const f = (r) => [-Math.sin((r * Math.PI) / 180), Math.cos((r * Math.PI) / 180)];
      let [fx, fy] = f(pl.r);
      if (mir) fx = -fx;
      for (let q = 0; q < rot; q++) [fx, fy] = [-fy, fx];
      const [gx, gy] = f(t.props[k].r);
      if (!near(fx, gx, 1e-6) || !near(fy, gy, 1e-6)) yawOk = false;
      if (t.props[k].z !== pl.z || t.props[k].v !== pl.v) yawOk = false;
    });
  }
}
ok(turnOk, "in all eight placements a prop covers exactly the cells its spot turned into");
ok(yawOk, "…and faces the way the room now faces, at the same height, in the same variant");
// PROPS ARE DRESSING, including here (Sep 29 2026): two placements are the
// same room when their SHAPE is. Counting props made one off-centre prop in a
// symmetric room change how many placements it has — and with it every draw
// the generator makes after, so a props-only publish rebuilt the whole map.
{
  const bare = { ...base, props: [], marks: [] };
  ok(tileVariants(base).length === tileVariants(bare).length, "props never change how many placements a room has (a props-only publish keeps the map)");
}
const blockDoor = lintTile({ ...room, props: [{ p: "shipping-container", x: 0.5, y: 2, r: 90 }] });
ok(blockDoor.errors.some((e) => e.includes("blocks the door")), "a prop standing in a doorway is refused");
// THE DOORWAY STRIP (Nov 2026 polish round): the footprint, not the cell
// middles — a drum hugging the wall on the line between the two door cells
// covers neither middle, and stood in the opening unrefused
ok(lintTile({ ...room, props: [{ p: "oil-drum", x: 0.2, y: 2 }] }).errors.some((e) => e.includes("blocks the door")), "a prop reaching into a doorway is refused even when it covers no cell's middle");
ok(!lintTile({ ...room, props: [{ p: "oil-drum", x: 0.2, y: 0.85 }, { p: "oil-drum", x: 0.75, y: 2 }] }).errors.length, "…but one flush with the jamb, or a metre back from the opening, is fine");
{
  // a LATTICE level: the generator may open any module-side slot whose edge
  // cells are floor, declared or not — the checker keeps those clear too
  const { lintOfficeTile } = require(path.join(ROOT, "dist", "backrooms", "office-tiles.js"));
  const { lintHotelTile } = require(path.join(ROOT, "dist", "backrooms", "hotel-tiles.js"));
  const office = JSON.parse(readFileSync(path.join(ROOT, "src", "backrooms", "office-rooms.json"), "utf8")).tiles;
  const hotel = JSON.parse(readFileSync(path.join(ROOT, "src", "backrooms", "hotel-rooms.json"), "utf8")).tiles;
  const wc = office.find((t) => t.id === "washroom"); // no north door declared
  ok(!wc.doors.some((d) => d[2] === "N") && !lintOfficeTile(wc).errors.length, "the office washroom passes as it stands");
  ok(lintOfficeTile({ ...wc, props: [...wc.props, { p: "filing-cabinet", x: 4.2, y: 0.3 }] }).errors.some((e) => e.includes("slot")), "…a cabinet in its north slot is refused though no door is declared there (the generator may open one)");
  const suite = hotel.find((t) => t.role === "suite" && !t.doors.some((d) => d[2] === "N"));
  ok(suite && !lintHotelTile({ ...suite, props: [...suite.props, { p: "dresser-tall", x: 4, y: 0.3 }] }).errors.some((e) => e.includes("slot")), "…while a hotel suite, which keeps its one door, may furnish its slots");
}
const cut = lintTile({ ...room, map: ["......", "......"], doors: [[0, 0, "W", 2], [5, 0, "E", 2]], props: [{ p: "crate-stack", x: 3, y: 1 }] });
ok(cut.errors.some((e) => e.includes("cuts off") || e.includes("cut the door")), "a prop that splits a room in two is refused");
ok(!lintTile({ ...room, map: ["......", "......"], doors: [[0, 0, "W", 2], [5, 0, "E", 2]], props: [{ p: "persian-rug", x: 3, y: 1 }] }).errors.length, "…but a rug across the same corridor is fine");
ok(lintTile({ ...room, props: [{ p: "oil-drum", x: 9, y: 1 }] }).errors.some((e) => e.includes("outside the tile")), "a prop placed outside the room is refused");
ok(lintTile({ ...room, props: [{ p: "no-such-thing", x: 1, y: 1 }] }).errors.some((e) => e.includes("no prop called")), "an unknown prop id is refused by name");
const fmt = formatLibrary([room]);
ok(fmt.includes('"props": [\n        {"p":"oil-drum","v":2,"x":1.5,"y":0.5,"r":30},'), "the library writes one prop per line, defaults left out");
ok(formatLibrary(JSON.parse(fmt).tiles) === fmt, "…and reads back byte for byte");

// ---- the map ---------------------------------------------------------------------------
console.log("-- the map");
const lib = JSON.parse(readFileSync(path.join(ROOT, "src", "backrooms", "pipes-rooms.json"), "utf8")).tiles;
const libProps = lib.reduce((a, t) => a + (t.props?.length ?? 0), 0);
ok(lib.every((t) => (t.props ?? []).every((q) => kit.KIT.has(q.p))), "every prop the room library places is in the catalogue");
const plan = planPipesSector(SECTOR_D.seed, SECTOR_D.size);
const s = plan.sector;
ok(Array.isArray(s.kit), "the Pipe Dreams map carries a prop list");
if (libProps) ok(s.kit.length > 0, `the rooms' props reach the map (${s.kit.length} placed from ${libProps} in the designs)`);
ok(s.kit.every((q) => q.x >= 0 && q.y >= 0 && q.x < s.size && q.y < s.size), "every placed prop is inside the map");
// THE REAL MACHINES (pipes-models.ts) stand on their own machine's solid
// footprint on purpose; everything else must not stand on rock
const { pieceModels } = require(path.join(ROOT, "dist", "backrooms", "pipes-models.js"));
const machineKey = new Set(pieceModels(s.size, (x, y) => s.deco[y * s.size + x], (x, y) => x >= 0 && y >= 0 && x < s.size && y < s.size && !s.solid[y * s.size + x]).map((q) => `${q.p}@${q.x},${q.y}`));
ok(machineKey.size > 50 && s.kit.filter((q) => machineKey.has(`${q.p}@${q.x},${q.y}`)).length === machineKey.size, `the plant's machines, lockers, benches and racks are real models (${machineKey.size} of them)`);
ok(s.kit.every((q) => machineKey.has(`${q.p}@${q.x},${q.y}`) || !s.solid[Math.floor(q.y) * s.size + Math.floor(q.x)] || !kit.kitBlocks(q)), "no solid prop stands on solid rock (bar the machines on their own footprints)");
// (Nov 2026 polish round) the free pieces the kit has a cheap real model of —
// the table, the crates, the drums, the pallets, the cable drums — are kit
// props now, each on its own cell; the bench, desk and stall stay drawn
{
  const { modelled } = require(path.join(ROOT, "dist", "backrooms", "pipes-models.js"));
  const want = { 1: ["steel-frame-table"], 3: ["wood-crate"], 4: ["hazard-drum", "hazard-drum-torn"], 5: ["wood-pallet"], 6: ["cable-drum"] };
  const free = (t) => [...Array(s.size * s.size).keys()].filter((i) => s.deco[i] >> 4 === 15 && (s.deco[i] & 15) >> 1 === t);
  let missing = 0, counted = 0;
  for (const [t, kinds] of Object.entries(want)) {
    for (const i of free(Number(t))) {
      counted++;
      const x = i % s.size, y = Math.floor(i / s.size);
      if (!kinds.every((p) => s.kit.some((q) => q.p === p && Math.floor(q.x) === x && Math.floor(q.y) === y))) missing++;
    }
  }
  ok(counted > 100 && !missing, `every free table, crate, drum, pallet and cable drum is its kit model, on its own cell (${counted} pieces${missing ? `, ${missing} missing` : ""})`);
  ok([1, 3, 4, 5, 6].every((t) => modelled(15 * 16 + t * 2) && modelled(15 * 16 + t * 2 + 1)) && [0, 2, 7].every((t) => !modelled(15 * 16 + t * 2)), "the client skips drawing exactly those pieces (and still draws the bench, the desk and the stall)");
  const cost = require(path.join(ROOT, "dist", "backrooms", "cost.js"));
  const load = cost.costLoad(cost.levelPatchMax(s.kit.map((q) => [q.p, q.v, q.x, q.y]), s.size));
  ok(load <= 1.0001, `…and the plant's busiest patch stays inside the cost budget (${Math.round(load * 100)}%)`);
}
let streamed = 0;
const chunks = Math.ceil(s.size / 16);
for (let cy = 0; cy < chunks; cy++) for (let cx = 0; cx < chunks; cx++) streamed += kitInChunk(s, cx, cy, 16).length;
ok(streamed === s.kit.length, `every placed prop streams in exactly one chunk (${streamed})`);
const one = s.kit[0];
if (one) {
  const got = kitInChunk(s, Math.floor(one.x / 16), Math.floor(one.y / 16), 16).find((q) => q.x === one.x && q.y === one.y);
  ok(got && got.kind === `kit:${kit.kitVariant(one).file}` && near(got.rot, (-one.r * Math.PI) / 180) && got.z === one.z, "a chunk hands a prop over as its model file, its yaw in radians and its height");
}

// ---- TILT + SHAPES (Josh, Oct 2026: "xyz axis rotation for props" and
// "geometrical shape that I can place and texture, scale, resize")
console.log("-- tilt and shapes");
{
  const S = kit.KIT_SHAPES;
  ok(S.length === 8 && S.every((p) => p.builtin === "shape" && p.cat[0] === "Shapes" && kit.isShapeFile(p.variants[0].file) && kit.KIT.get(p.id) === p), `eight shapes in the kit, every one drawn by the game (${S.map((p) => p.id.replace("shape-", "")).join(", ")})`);
  ok(!P.some((p) => p.builtin === "shape" || kit.isShapeFile(p.variants[0].file)), "…and no model file wears a shape's name");
  const cube = { p: "shape-cube", x: 5, y: 5 };
  ok(kit.kitSize(cube).join() === "1,1,1" && kit.kitSize({ ...cube, sx: 4, sy: 2.5, sz: 1.5 }).join() === "4,2.5,1.5", "a shape is its variant's size until it is given its own");
  ok(near(kit.kitExtents({ ...cube, sx: 4, sz: 1 }).rx, 1) && near(kit.kitExtents({ ...cube, sx: 4, sz: 1, r: 90 }).ry, 1), "its footprint is its own size, turned");
  ok(kit.kitBlocks(cube) && !kit.kitBlocks({ ...cube, solid: false }) && !kit.kitBlocks({ ...cube, sy: 0.2 }), "a shape is solid unless it says otherwise (and too low to block is stepped over)");
  const bad = (pl) => kit.kitProblems(pl).length > 0;
  ok(!bad({ ...cube, sx: 3, tex: "paper-dots", col: "#aa3311", rx: 20, rz: -35 }), "a shape with a size, a surface, a colour and a tilt passes");
  ok(bad({ ...cube, sx: 0.01 }) && bad({ ...cube, sy: 31 }) && bad({ ...cube, tex: "no-such-surface" }) && bad({ ...cube, col: "red" }) && bad({ ...cube, rx: 200 }), "a size out of range, an unknown surface, a bad colour and a tilt past 180° are refused");
  ok(bad({ p: "oil-drum", x: 1, y: 1, sx: 2 }) && bad({ p: "oil-drum", x: 1, y: 1, tex: "paper-dots" }) && !bad({ p: "oil-drum", x: 1, y: 1, rx: 15, rz: 10 }), "only a shape takes a size or a surface; anything may tilt");
  // tilt through all eight placements: turning leaves it, a mirror flips the roll
  const tilted = { ...room, props: [{ p: "wood-crate", x: 2.5, y: 1.5, r: 30, rx: 20, rz: 35 }, { p: "shape-cylinder", x: 4.5, y: 2.5, sx: 0.8, sy: 2, sz: 0.8, tex: "concrete-wall", rz: -10 }] };
  const tb = parseTile(tilted);
  let tiltOk = true;
  for (const mir of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      const tt = transformTile(tb, rot, mir);
      tb.props.forEach((pl, k) => {
        const q = tt.props[k];
        if ((q.rx ?? 0) !== (pl.rx ?? 0) || (q.rz ?? 0) !== (mir ? -(pl.rz ?? 0) : (pl.rz ?? 0))) tiltOk = false;
        if (q.sx !== pl.sx || q.sy !== pl.sy || q.sz !== pl.sz || q.tex !== pl.tex) tiltOk = false;
      });
    }
  }
  ok(tiltOk, "in all eight placements a prop keeps its tip, its lean flips with a mirror, and a shape keeps its size and surface");
  const fm = formatLibrary([tilted]);
  ok(fm.includes('{"p":"wood-crate","x":2.5,"y":1.5,"r":30,"rx":20,"rz":35}') && fm.includes('"sx":0.8,"sy":2,"sz":0.8,"tex":"concrete-wall"'), "the library writes the tilt and a shape's size and surface on its line");
  ok(formatLibrary(JSON.parse(fm).tiles) === fm, "…and reads back byte for byte");
  ok(lintTile({ ...room, props: [{ p: "shape-cube", x: 0.5, y: 2, sx: 2, sy: 2, sz: 2 }] }).errors.some((e) => e.includes("blocks the door")), "a solid shape in a doorway is refused like any solid prop");
  ok(!lintTile({ ...room, props: [{ p: "shape-cube", x: 0.5, y: 2, sx: 2, sy: 2, sz: 2, solid: false }] }).errors.length, "…a walk-through one is not");
  // on the wire: the chunk carries the tilt in radians and the shape's look
  const fake = { size: 32, kit: [{ p: "shape-cube", v: 1, x: 5.5, y: 6.5, r: 90, z: 0.2, rx: 10, rz: -20, sx: 3, sy: 0.5, sz: 1, tex: "paper-dots", col: "#ff0000" }] };
  const w = kitInChunk(fake, 0, 0, 16)[0];
  ok(w && w.kind === "kit:shape-cube" && near(w.pitch, (10 * Math.PI) / 180) && near(w.roll, (-20 * Math.PI) / 180) && w.sx === 3 && w.sy === 0.5 && w.sz === 1 && w.tex === "paper-dots" && w.col === "#ff0000" && w.z === 0.2, "a chunk hands a shape over with its tilt, size, surface and colour");
  ok(near(w.rx, 0.25) && near(w.ry, 0.75), "…and the collision box of its real size, turned");
}

// ---- THE INTAKE (scripts/props/intake.mjs): doors that open, and who made them
{
  const opening = P.filter((p) => p.anim === "open");
  const clipless = opening.flatMap((p) => p.variants.filter((v) => {
    const j = JSON.parse(readFileSync(path.join(KITDIR, `${v.file}.gltf`), "utf8"));
    return !(j.animations ?? []).some((a) => a.name === "open");
  }).map((v) => v.file));
  ok(opening.length >= 2 && clipless.length === 0, `every door that opens carries its "open" clip in every colour (${opening.map((p) => p.id).join(", ")}${clipless.length ? ` — missing: ${clipless.join(" ")}` : ""})`);
  ok(opening.every((p) => !p.solid), "a door that swings is walk-through (it opens as you arrive; it never blocks)");
  const credits = existsSync(path.join(KITDIR, "CREDITS.txt")) ? readFileSync(path.join(KITDIR, "CREDITS.txt"), "utf8") : "";
  const uncredited = P.filter((p) => p.credit && !p.credit.split(" · ").every((c) => credits.includes(c))).map((p) => p.id);
  ok(P.some((p) => p.credit) && uncredited.length === 0, `every downloaded model's maker is in propkit/CREDITS.txt (${uncredited.join(", ") || "all credited"})`);
}

// ---- SKINNED MODELS + THE ROOM'S LIGHT (Nov 2026 polish round) ---------------
// A skinned kit model cloned plainly draws nowhere (its copies stay bound to the
// cached prototype's bones): the Hotel's 311 corridor doors were invisible. The
// game bakes the skin out of a model that never swings, and gives one that does
// its own skeleton per copy. And every copy wears the light of its own cell.
{
  const worldSrc = readFileSync(path.join(ROOT, "client", "src", "backrooms", "world.ts"), "utf8");
  const skinned = [];
  for (const p of P) for (const v of p.variants) {
    const f = path.join(KITDIR, `${v.file}.gltf`);
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, "utf8"));
    if ((j.skins ?? []).length) skinned.push({ file: v.file, opens: (j.animations ?? []).some((a) => a.name === "open") });
  }
  const bakes = /if \(open\) kitOpenClip\.set\(kind, open\);\s*else bakeKitSkins\(model\);/.test(worldSrc) && /function bakeKitSkins[\s\S]*?applyBoneTransform[\s\S]*?new THREE\.BufferAttribute\(outP, 3\)/.test(worldSrc);
  const ownBones = /model\.userData\.skinned \? cloneSkeleton\(model\) : model\.clone\(true\)/.test(worldSrc);
  ok(skinned.length > 0 && bakes && ownBones, `every skinned kit model draws: a still one's skin is baked to float positions, a swinging one gets its own bones (${skinned.map((s) => s.file + (s.opens ? "*" : "")).join(", ")})`);
  const loop = worldSrc.slice(worldSrc.indexOf("// FURNITURE: clones of the shared models"), worldSrc.indexOf("world.meshes.set(k, group);"));
  ok(/shadeProp\(inst, propShadeStep\(propLight\(pr\.x, pr\.y\)\)\)/.test(loop) && /lum\(0\.89, 0\.3, lightAt\(sx, sz, wn\.x, wn\.z\), sx, sz, wv\.y\)/.test(loop) && /function shadedMat[\s\S]*?cm\.onBeforeCompile = m\.onBeforeCompile;[\s\S]*?cm\.customProgramCacheKey = m\.customProgramCacheKey;/.test(worldSrc),
    "every kit copy, shape and sign takes the baked light of where it stands (darkened copies shared, never edited in place, keeping the original's shader so nothing compiles mid-game)");
  // law 9: a chunk draws each still kit model as ONE InstancedMesh per part,
  // its copies' light in the instance colour; the instanced program is warmed
  // when the model loads; the colliders stay the chunk's props (untouched).
  ok(/if \(instanceable\(pr\.kind, model\)\) \{[\s\S]{0,600}?continue;/.test(loop)
    && /new THREE\.InstancedMesh\(part\.geo, part\.mat, b\.mats\.length\)[\s\S]{0,400}?mesh\.setColorAt\(i, PROP_C\.setScalar\(b\.light\[i\]\)\)/.test(worldSrc)
    && /modelWarm\?\.\(model\);\s*warmInstanced\(kind, model\);/.test(worldSrc)
    && /return kind\.startsWith\("kit:"\) && !kitOpenClip\.has\(kind\) && !model\.userData\.skinned;/.test(worldSrc),
    "a still kit model is drawn as one instance batch per chunk (its light per copy), warmed as instances when it loads; a swinging or skinned one stays a copy");
}

// ---- DRESSING THAT SITS RIGHT, on every level (Nov 2026 polish round: the
// audit found paintings, mirrors, clocks and signs hung INSIDE thin walls, pipe
// runs turned across the corridors they were meant to run along, and a second
// monitor stacked on every Level 0 computer desk)
console.log("-- dressing on every level");
{
  const LIBS = ["lobby", "pools", "pipes", "station", "office", "hotel", "lights", "ocean", "cave", "suburb"];
  const T = 0.0725; // a thin wall stands 0.145 m thick, centred on the cell edge (0.0725 cells)
  const libs = Object.fromEntries(LIBS.map((n) => [n, JSON.parse(readFileSync(path.join(ROOT, "src", "backrooms", `${n}-rooms.json`), "utf8")).tiles]));
  // the edge on a side of a cell: "thin" (a room's edge, a walls-layer wall, or
  // a change of room label), "solid" (a # cell), or null (open)
  const edgeKind = (t, cx, cy, side) => {
    const H = t.map.length, W = Math.max(...t.map.map((r) => r.length));
    const ch = (x, y) => (t.map[y] ?? "")[x] ?? " ";
    const wl = (x, y) => (t.walls?.[y] ?? "")[x] ?? ".";
    const rm = (x, y) => { const c = (t.rooms?.[y] ?? "")[x] ?? "1"; return c === " " || c === "." ? "1" : c; };
    const [nx, ny] = side === "W" ? [cx - 1, cy] : side === "E" ? [cx + 1, cy] : side === "N" ? [cx, cy - 1] : [cx, cy + 1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || ch(nx, ny) === " ") return "thin";
    if (ch(nx, ny) === "#" || ch(cx, cy) === "#") return "solid";
    const thin = side === "W" ? "|+".includes(wl(cx, cy)) : side === "E" ? "|+".includes(wl(nx, ny)) : side === "N" ? "-+".includes(wl(cx, cy)) : "-+".includes(wl(nx, ny));
    return thin || rm(nx, ny) !== rm(cx, cy) ? "thin" : null;
  };
  const buried = [];
  for (const [lvl, tiles] of Object.entries(libs)) {
    for (const t of tiles) {
      for (const pl of t.props ?? []) {
        const def = kit.KIT.get(pl.p);
        if (!def || def.mount !== "wall") continue;
        const e = kit.kitExtents(pl);
        const cx = Math.floor(pl.x), cy = Math.floor(pl.y), fx = pl.x - cx, fy = pl.y - cy;
        const c = [];
        if (fx < 0.3) c.push(["W", fx, e.rx]);
        if (fx > 0.7) c.push(["E", 1 - fx, e.rx]);
        if (fy < 0.3) c.push(["N", fy, e.ry]);
        if (fy > 0.7) c.push(["S", 1 - fy, e.ry]);
        const walled = c.map(([s, d, h]) => [s, d, h, edgeKind(t, cx, cy, s)]).filter((q) => q[3]).sort((a, b) => a[1] - b[1]);
        if (walled[0]?.[3] === "thin" && walled[0][1] - walled[0][2] < T - 0.006) buried.push(`${lvl}/${t.id} ${pl.p}@${pl.x},${pl.y}`);
      }
    }
  }
  ok(!buried.length, `no wall prop on any level hangs inside a thin wall — each on the wall's face (${buried.length ? buried.slice(0, 4).join("; ") : "all clear"})`);
  const crossing = [];
  for (const [lvl, tiles] of Object.entries(libs)) {
    for (const t of tiles) {
      const H = t.map.length, W = Math.max(...t.map.map((r) => r.length));
      for (const pl of (t.props ?? []).filter((q) => q.p === "pipe-length")) {
        const { rx, ry } = kit.kitExtents(pl);
        const pts = [[pl.x - rx + 0.02, pl.y], [pl.x + rx - 0.02, pl.y], [pl.x, pl.y - ry + 0.02], [pl.x, pl.y + ry - 0.02]];
        if (pts.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || (t.map[Math.floor(y)] ?? "")[Math.floor(x)] === "#")) crossing.push(`${lvl}/${t.id}@${pl.x},${pl.y}`);
      }
    }
  }
  ok(!crossing.length, `every pipe run lies along its wall, none crossing into rock or out of its room (${crossing.length ? crossing.slice(0, 4).join("; ") : "all clear"})`);
  const doubled = libs.lobby.flatMap((t) => (t.props ?? []).filter((q) => q.p === "computer-monitor" && (t.props ?? []).some((d) => d.p === "computer-desk" && kit.kitCovers(d, q.x, q.y))).map(() => t.id));
  ok(!doubled.length, `no Level 0 computer desk carries a second monitor on top of its own (${doubled.length} found)`);
  const tvs = libs.suburb.flatMap((t) => (t.props ?? []).filter((q) => q.p === "score-tv").map(() => t.id));
  ok(!tvs.length, `no Suburbs house has the casino's score screen for a television (${tvs.length} found)`);
}

// ---- WALL PROPS ON EVERY SERVED MAP (Nov 2026 polish round): a design hangs
// its props for a thin wall, but a copy of a room can land against the map's
// solid rim instead (the face ON the edge, not 0.0725 cells in) or beside an
// opening (a slot the generator opened, a cave seam). The generators seat each
// wall prop on the face its copy really has (kitseat.ts); this checks the
// built maps with its own reading of the walls, not kitseat's.
console.log("-- wall props on every served map");
{
  const W0 = require(path.join(ROOT, "dist", "backrooms", "worldgen.js"));
  const gen = (f) => require(path.join(ROOT, "dist", "backrooms", `worldgen-${f}.js`));
  const plans = {
    lobby: () => gen("lobby").planLobbySector(W0.SECTOR_A.seed, W0.SECTOR_A.size),
    pools: () => gen("pools").planPoolsSector(),
    pipes: () => gen("pipes").planPipesSector(),
    station: () => gen("station").planStationSector(gen("station").SECTOR_S.seed, gen("station").SECTOR_S.size),
    office: () => gen("office").planOfficeSector(gen("office").SECTOR_O.seed, gen("office").SECTOR_O.size),
    hotel: () => gen("hotel").planHotelSector(gen("hotel").SECTOR_H.seed, gen("hotel").SECTOR_H.size),
    lights: () => gen("lights").planLightsSector(gen("lights").SECTOR_L.seed, gen("lights").SECTOR_L.size),
    ocean: () => gen("ocean").planOceanSector(gen("ocean").SECTOR_T.seed, gen("ocean").SECTOR_T.size),
    cave: () => gen("cave").planCaveSector(gen("cave").SECTOR_C.seed, gen("cave").SECTOR_C.size),
    suburb: () => gen("suburb").planSuburbSector(gen("suburb").SECTOR_U.seed, gen("suburb").SECTOR_U.size),
  };
  const T = 0.0725;
  const buried = [], floating = [], hanging = [];
  let total = 0;
  for (const [lvl, plan] of Object.entries(plans)) {
    const s = plan().sector;
    const N = s.size;
    const solid = (x, y) => x < 0 || y < 0 || x >= N || y >= N || !!s.solid[y * N + x] || !!s.background?.[y * N + x];
    for (const k of s.kit ?? []) {
      const def = kit.KIT.get(k.p);
      if (!def || def.mount !== "wall") continue;
      const cx = Math.floor(k.x), cy = Math.floor(k.y), fx = k.x - cx, fy = k.y - cy;
      if (solid(cx, cy)) continue; // hung on the outside of a solid block (a house number)
      total++;
      const e = kit.kitExtents(k);
      const near = [];
      if (fy < 0.3) near.push([fy, e.ry, s.wallN[cy * N + cx] ? T : solid(cx, cy - 1) ? 0 : null]);
      if (fy > 0.7) near.push([1 - fy, e.ry, cy + 1 < N && s.wallN[(cy + 1) * N + cx] ? T : solid(cx, cy + 1) ? 0 : null]);
      if (fx < 0.3) near.push([fx, e.rx, s.wallW[cy * N + cx] ? T : solid(cx - 1, cy) ? 0 : null]);
      if (fx > 0.7) near.push([1 - fx, e.rx, cx + 1 < N && s.wallW[cy * N + cx + 1] ? T : solid(cx + 1, cy) ? 0 : null]);
      const walled = near.filter((q) => q[2] !== null).sort((a, b) => a[0] - b[0]);
      const tag = `${lvl} ${k.p}@${k.x},${k.y}`;
      if (!walled.length) {
        // nothing behind it: only a sign on its own post, or a sign over a doorway
        const posted = (s.kit ?? []).some((q) => q.p === "shape-cylinder" && Math.abs(q.x - k.x) < 0.12 && Math.abs(q.y - k.y) < 0.12);
        if (!posted && k.p !== "exit-sign-box") hanging.push(tag);
        continue;
      }
      const [dist, half, face] = walled[0];
      const back = dist - half;
      if (back < face - 0.007) buried.push(tag);
      else if (back > face + 0.007) floating.push(tag);
    }
  }
  ok(total > 500 && !buried.length, `no wall prop on any served map sits inside its wall (${total} wall props${buried.length ? `; ${buried.slice(0, 3).join("; ")}` : ""})`);
  ok(!floating.length, `…and none floats off it — a copy against the solid rim hangs on the rim's face (${floating.length ? floating.slice(0, 3).join("; ") : "all clear"})`);
  ok(!hanging.length, `…and none hangs in an opening with no wall behind it, bar signs on posts and over doors (${hanging.length ? hanging.slice(0, 3).join("; ") : "all clear"})`);
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
