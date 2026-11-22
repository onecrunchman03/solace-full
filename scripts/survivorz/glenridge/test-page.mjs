// SURVIVORZ, GLENRIDGE HALL: THE SHOW PAGE'S OWN ARITHMETIC, without a browser or a graphics card. The page's code
// is bundled (esbuild) and run in Node: what it works out from the map before anything is drawn.
//   · THE RAIN'S ROOF (show/storm.ts roofMask): the picture of the house from above holds how high each room goes,
//     so the rain stops at each room's own ceiling. It was one flat lid at 7.4 m (the code review's D-8): no rain for
//     metres over the single-storey rooms, and rain inside the top of the Great Hall.
//   · WHERE THE CAMERA IS (show/site.ts roomUnder): hung in the air of a tall room or over a stair it is in the
//     room below it, not "out of doors" (the lightning lit the furniture at full there).
//   node scripts/survivorz/glenridge/test-page.mjs        (from the repo root; needs no build)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TMP = path.join(ROOT, "data", "glenridge-page-harness");
fs.mkdirSync(TMP, { recursive: true });
const entry = path.join(TMP, "entry.ts");
fs.writeFileSync(entry, `
export { Storm } from ${JSON.stringify(path.join(ROOT, "client/src/survivorz/show/storm.ts"))};
export { ROOMS, roomAt, roomUnder, roomInfo, useMap } from ${JSON.stringify(path.join(ROOT, "client/src/survivorz/show/site.ts"))};
export * as SITE from ${JSON.stringify(path.join(ROOT, "client/src/survivorz/show/site.ts"))};
`);
const out = path.join(TMP, "page.mjs");
// (the app's sound engine is the browser's: the storm's two calls into it are not what is under test)
const stubSfx = { name: "stub-sfx", setup(b) { b.onResolve({ filter: /lib\/sfx$/ }, () => ({ path: "sfx", namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const sfxContext = () => null; export const sfxOut = () => null;", loader: "js" })); } };
await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent", nodePaths: [path.join(ROOT, "client", "node_modules")], loader: { ".json": "json" }, plugins: [stubSfx] });
const M = await import(pathToFileURL(out).href + "?" + Date.now());

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  + " + m); } else { fail++; console.log("  x " + m); } };

ok(M.useMap("glenridge") === true && M.SITE.MAP_ID === "glenridge", "the page's map is Glenridge Hall");
const ROOMS = M.SITE.ROOMS, room = (id) => ROOMS.find((r) => r.id === id);
const mid = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

// ---- the rain's roof ----------------------------------------------------------------------------------------------
const mask = M.Storm.roofMask(ROOMS, M.SITE.coversOf()), px = mask.tex.image.data, W = mask.tex.image.width, H = mask.tex.image.height;
const [bx, bz, bw, bh] = [mask.box.x, mask.box.y, mask.box.z, mask.box.w];
/** how high the rain is stopped over a point (m); 0 = it falls to the ground */
const roofAt = (x, z) => {
  const i = Math.floor(((x - bx) / bw) * W), j = Math.floor(((z - bz) / bh) * H);
  return i < 0 || j < 0 || i >= W || j >= H ? 0 : px[(j * W + i) * 4] * 0.05;
};
const hall = room("great-hall"), [hx, hz] = mid(hall);
ok(roofAt(hx, hz) >= hall.fy + 10 - 0.05, `no rain inside the Great Hall up to its ceiling (stopped below ${roofAt(hx, hz).toFixed(2)} m; the ceiling is at ${(hall.fy + 10).toFixed(2)}; the old lid was 7.4)`);
const low = ["garage", "vestibule", "breakfast-room"].map(room).filter(Boolean);
const lows = low.map((r) => { const [x, z] = mid(r); return [r.id, roofAt(x, z)]; });
ok(low.length === 3 && lows.every(([, h]) => h > 2.5 && h < 5.5), `over a single-storey room the rain falls down to its own roof (${lows.map(([id, h]) => `${id} ${h.toFixed(1)} m`).join(", ")}; the old lid held it off to 7.4)`);
const lawn = ROOMS.filter((r) => r.outdoor);
let wet = 0, dry = 0;
for (const r of lawn) for (let k = 0; k < 40; k++) {
  const x = r.x0 + ((k * 0.618) % 1) * (r.x1 - r.x0), z = r.z0 + ((k * 0.381) % 1) * (r.z1 - r.z0);
  const at = M.roomAt(x, r.fy + 1, z);
  if (!at || !at.outdoor) continue;
  if (roofAt(x, z) === 0) wet++; else dry++;
}
ok(wet > 100 && dry / (wet + dry) < 0.03, `out of doors it rains (${wet} of ${wet + dry} points on the lawns and the drive are open to the sky)`);
let indoors = 0, covered = 0;
for (const r of ROOMS) {
  if (r.outdoor || r.fy <= -1) continue;
  for (let k = 0; k < 12; k++) {
    const x = r.x0 + (0.15 + ((k * 0.618) % 0.7)) * (r.x1 - r.x0), z = r.z0 + (0.15 + ((k * 0.381) % 0.7)) * (r.z1 - r.z0);
    if (M.roomAt(x, r.fy + 1, z)?.id !== r.id) continue;
    indoors++; if (roofAt(x, z) >= r.fy + 2.4) covered++;
  }
}
ok(indoors > 300 && covered / indoors > 0.99, `indoors it does not: ${covered} of ${indoors} points in the rooms above ground are under a roof higher than a head`);

// ---- where the camera is -----------------------------------------------------------------------------------------
ok(M.roomAt(hx, 5, hz) === null && M.roomUnder(hx, 5, hz)?.id === "great-hall", "a camera five metres up in the Great Hall's air is in the Great Hall (it read as between rooms, which the storm took for out of doors)");
ok(M.roomUnder(hx, 1, hz)?.id === "great-hall" && M.roomUnder(hx, 14, hz) === null, "...on its floor it is in it, and above its roof it is in no room");
const fc = room("forecourt"), [fx, fz] = mid(fc);
ok(M.roomUnder(fx, fc.fy + 1.7, fz)?.outdoor === true && M.roomUnder(fx, fc.fy + 6, fz)?.outdoor === true, "over the forecourt it is out of doors, at head height and from a crane");
let stair = 0, lost = 0;
for (const r of ROOMS) {
  if (r.outdoor || !/stair/.test(r.id)) continue;
  const [x, z] = mid(r);
  for (const dy of [0.5, 2, 3.5]) { stair++; const u = M.roomUnder(x, r.fy + dy, z); if (!u || u.outdoor) lost++; }
}
ok(stair >= 6 && lost === 0, `climbing a stair the camera is never "out of doors" (${stair} heights up ${stair / 3} stairs)`);

// ---- the re-grade (Nov 14): a roof that is no room's, above a roof, one meaning of open air -------------------------
let pcWet = 0, pcN = 0;
for (let x = -3.9; x <= 3.9; x += 0.3) for (let z = 3.9; z <= 9.9; z += 0.3) { pcN++; if (roofAt(x, z) < 2.9) pcWet++; }
ok(pcN > 300 && pcWet === 0, `no rain falls through the porte-cochere's roof (${pcN - pcWet} of ${pcN} points under it are roofed at about 3 m; none was)`);
ok(M.roomUnder(0, 1.6, 7)?.outdoor === true, "...and under it is still out of doors, for the ear and the lightning (it is open at the sides)");
let over = 0, overN = 0;
for (const r of ROOMS) {
  if (r.outdoor || r.floor !== 0) continue;                      // (the upper floor's rooms)
  const [x, z] = mid(r);
  if (M.roomAt(x, r.fy + 1, z)?.id !== r.id) continue;
  overN++; if (M.roomUnder(x, r.y1 + 3, z) !== null) over++;
}
ok(overN >= 8 && over === 0, `a camera above the roof of an upper room is in no room (${overN} upper rooms tried, ${over} still read as inside)`);
const rulesSrc = fs.readFileSync(path.join(ROOT, "client/src/survivorz/audio/rules.ts"), "utf8").match(/const OPEN_AIR = (\/[^;]+\/);/)?.[1];
ok(!!rulesSrc && rulesSrc === String(M.SITE.OPEN_AIR), `the sound and the picture mean the same rooms by open air (${rulesSrc} and ${String(M.SITE.OPEN_AIR)})`);
const porch = ROOMS.find((r) => /porch/.test(r.id) && !r.outdoor);
ok(!!porch && M.SITE.underTheSky(porch) === true && M.SITE.underTheSky(hall) === false && roofAt(...mid(porch)) > 2, "from a porch the rain is seen as it is heard, and it does not fall in the porch");

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${fail ? "RED" : "GREEN"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
