// PULL A PUBLISHED MAP INTO GIT — the map editor's last step, as one command.
//
//   node scripts/pull-map.mjs            every level
//   node scripts/pull-map.mjs 0          just Level 0 (0 · 1 · 2)
//   node scripts/pull-map.mjs --check    say what would change, write nothing
//   node scripts/pull-map.mjs --no-test  skip the build + the level's harness
//   node scripts/pull-map.mjs --local data/solace.db   read a local database
//                                          instead (a dev server's publishes)
//
// Josh publishes from Admin Panel → Map editor; the DATABASE copy is what
// plays, and the repo file (src/backrooms/*-rooms.json) is the fallback the
// harnesses hold to the level's rules. Before this script the two were
// reconciled by hand — fetch the export, write the file, fix the sector
// constants, run the harness. Now:
//
//   1. read the newest published version of each level straight out of the
//      production database (ssh + sqlite3, read-only);
//   2. write the library in the repo file's own layout (formatLibrary), so
//      the diff is the rooms that changed and nothing else;
//   3. if the MAP changed (its fingerprint isn't the repo's), move the repo's
//      sector constant onto the published one — id, seed, fingerprint — so a
//      fallback boot plays the same world under the same id;
//   4. build, and run that level's harness.
//
// The server's sudo password comes from R220_SUDO_PW in the environment and
// is never written anywhere. Host: R220_HOST (default you@YOUR_SERVER_IP).

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.R220_HOST || "you@YOUR_SERVER_IP";
const DB = process.env.R220_DB || "/opt/solace/data/solace.db";

const LEVELS = {
  0: { name: "Level 0", file: "src/backrooms/lobby-rooms.json", src: "src/backrooms/worldgen.ts", konst: "SECTOR_A", test: "scripts/checks/test_lobby.mjs" },
  1: { name: "the Poolrooms", file: "src/backrooms/pools-rooms.json", src: "src/backrooms/worldgen-pools.ts", konst: "SECTOR_P", test: "scripts/checks/test_pools.mjs" },
  2: { name: "Pipe Dreams", file: "src/backrooms/pipes-rooms.json", src: "src/backrooms/worldgen-pipes.ts", konst: "SECTOR_D", test: "scripts/checks/test_pipes.mjs" },
};

const args = process.argv.slice(2);
const check = args.includes("--check");
const noTest = args.includes("--no-test");
const picked = args.filter((a, i) => /^[012]$/.test(a) && args[i - 1] !== "--local").map(Number);
const levels = picked.length ? picked : [0, 1, 2];

// ---- 1. the newest published row per level, from production
const sql =
  "SELECT m.level, m.version, m.sectorId, m.seed, m.fingerprint, m.tiles FROM map_versions m " +
  "WHERE m.version = (SELECT MAX(version) FROM map_versions WHERE level = m.level) ORDER BY m.level";
const localAt = args.indexOf("--local");
const localDb = localAt >= 0 ? args[localAt + 1] : null;
const pw = process.env.R220_SUDO_PW;
if (!localDb && !pw) {
  console.error("Set R220_SUDO_PW (the server's sudo password) — it is read from the environment and never stored.");
  process.exit(2);
}
let raw;
if (localDb) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.resolve(localDb), { readOnly: true });
  raw = JSON.stringify(db.prepare(sql).all());
  db.close();
} else try {
  raw = execFileSync("ssh", ["-o", "BatchMode=yes", HOST, `sudo -S -p '' sqlite3 -json ${DB} "${sql}"`], {
    input: pw + "\n",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  console.error(`Couldn't read the production database: ${e.message}`);
  process.exit(1);
}
const rows = raw.trim() ? JSON.parse(raw) : [];

// ---- 2 + 3. write what changed
const require = createRequire(import.meta.url);
const { formatLibrary } = require(path.join(ROOT, "dist/backrooms/tiles.js"));
const touched = [];
for (const level of levels) {
  const L = LEVELS[level];
  const row = rows.find((r) => r.level === level);
  if (!row) {
    console.log(`${L.name}: nothing published yet — the repo map is live.`);
    continue;
  }
  const tiles = JSON.parse(row.tiles);
  const file = formatLibrary(tiles);
  const filePath = path.join(ROOT, L.file);
  const fileChanged = readFileSync(filePath, "utf8") !== file;

  const srcPath = path.join(ROOT, L.src);
  let src = readFileSync(srcPath, "utf8");
  const defRe = new RegExp(`(export const ${L.konst} = Object\\.freeze\\(\\{ id: ")([^"]+)(", seed: )(\\d+)`);
  const fpRe = new RegExp(`(export const ${L.konst}_FINGERPRINT = ")([^"]+)(")`);
  const def = src.match(defRe);
  const fp = src.match(fpRe);
  if (!def || !fp) {
    console.error(`${L.name}: couldn't find ${L.konst} in ${L.src} — update it by hand.`);
    process.exit(1);
  }
  const mapChanged = fp[2] !== row.fingerprint;
  const idChanged = def[2] !== row.sectorId || Number(def[4]) !== row.seed;

  if (!fileChanged && !mapChanged && !idChanged) {
    console.log(`${L.name}: the repo already matches published v${row.version} (${row.sectorId}).`);
    continue;
  }
  console.log(`${L.name}: published v${row.version} (${row.sectorId}, seed ${row.seed}, ${tiles.length} rooms)`);
  if (fileChanged) console.log(`  · ${L.file} — the rooms change`);
  if (mapChanged || idChanged)
    console.log(`  · ${L.konst}: ${def[2]} seed ${def[4]} → ${row.sectorId} seed ${row.seed}${mapChanged ? ", new fingerprint (the map itself changed)" : ""}`);
  else console.log(`  · props only — the map and its fingerprint are unchanged`);
  if (check) continue;
  if (fileChanged) writeFileSync(filePath, file);
  if (mapChanged || idChanged) {
    src = src.replace(defRe, `$1${row.sectorId}$3${row.seed}`).replace(fpRe, `$1${row.fingerprint}$3`);
    writeFileSync(srcPath, src);
  }
  touched.push(level);
}

if (check || !touched.length) process.exit(0);

// ---- 4. build and hold the repo copy to the level's rules
if (noTest) {
  console.log("\nWritten. Build and run the level harnesses before committing.");
  process.exit(0);
}
const run = (cmd, a) => spawnSync(cmd, a, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }).status === 0;
console.log("\nBuilding…");
if (!run("npm", ["run", "build"])) process.exit(1);
let bad = 0;
for (const level of touched) {
  console.log(`\nChecking ${LEVELS[level].name}…`);
  if (!run("node", [LEVELS[level].test])) bad++;
}
console.log(
  bad
    ? "\nA harness failed. If it pins the old sector by name, update that line; otherwise the published map broke a level rule the editor doesn't check."
    : "\nDone. Commit the changed files.",
);
process.exit(bad ? 1 : 0);
