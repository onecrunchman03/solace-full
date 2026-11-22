// Build the self-contained satellite daemon executable (Node SEA).
//
// The Solace Satellite desktop app ships this as its sidecar: a copy of the
// BUILD machine's node.exe (Node 24 — node:sqlite stable, no flags) with the
// bundled daemon injected, so hosts install NOTHING but the app. Steps:
//   1. esbuild dist/satellite/main.js → one CJS file (ws bundled; its
//      optional native accelerators externalized — pure-JS paths are fine)
//   2. node --experimental-sea-config → the SEA blob
//   3. copy node.exe → the output, postject the blob in
//
// Output: satellite-app/src-tauri/binaries/satellited-<target-triple>.exe
// (the name shape Tauri's externalBin demands).
//
//   node scripts/build-satellite-exe.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "scripts", ".satellite-sea");
const TRIPLE = "x86_64-pc-windows-msvc";
const OUT_DIR = path.join(ROOT, "satellite-app", "src-tauri", "binaries");
const OUT = path.join(OUT_DIR, `satellited-${TRIPLE}.exe`);

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const entry = path.join(ROOT, "dist", "satellite", "main.js");
if (!fs.existsSync(entry)) {
  console.error("dist/satellite/main.js missing — run `npm run build` first.");
  process.exit(1);
}

console.log("[1/3] bundling the daemon…");
const bundle = path.join(SCRATCH, "satellited.cjs");
execFileSync("npx", [
  "esbuild", entry, "--bundle", "--platform=node", "--format=cjs",
  "--external:bufferutil", "--external:utf-8-validate",
  `--outfile=${bundle}`,
], { cwd: ROOT, stdio: "inherit", shell: true });

console.log("[2/3] building the SEA blob…");
const seaConfig = path.join(SCRATCH, "sea-config.json");
const blob = path.join(SCRATCH, "satellited.blob");
fs.writeFileSync(seaConfig, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
}));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

console.log("[3/3] injecting into a copy of node.exe…");
fs.copyFileSync(process.execPath, OUT);
// Strip node.exe's Authenticode signature BEFORE injection: postject leaves
// the old certificate table pointing at bytes that no longer exist, which
// signtool later refuses as a malformed PE (0x800700C1) — that broke the
// app bundle's CN=Solace signing pass. No signtool on the box = skip; the
// sidecar then simply can't be re-signed (postject's old "signature seems
// corrupted" warning returns).
try {
  const kits = "C:/Program Files (x86)/Windows Kits/10/bin";
  const signtool = fs.readdirSync(kits)
    .filter((d) => /^10\./.test(d))
    .sort()
    .reverse()
    .map((d) => path.join(kits, d, "x64", "signtool.exe"))
    .find((p) => fs.existsSync(p));
  if (signtool) {
    execFileSync(signtool, ["remove", "/s", OUT], { stdio: "inherit" });
    console.log("stripped node.exe's stale signature (re-signable now)");
  }
} catch { /* best effort */ }
execFileSync("npx", [
  "postject", OUT, "NODE_SEA_BLOB", blob,
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
], { cwd: ROOT, stdio: "inherit", shell: true });

const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`done: ${OUT} (${mb} MB)`);
