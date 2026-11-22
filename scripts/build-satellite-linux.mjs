// Build the Ubuntu satellite bundle (F8): satellited (Node SEA, linux-x64
// ELF) + livekit-server (linux amd64), packed as satellite-dist/
// satellite-linux-x64.tar.gz — what POST /api/satellite/app-linux streams
// to a host presenting a valid provisioning key (or an upgrade token).
//
// Cross-built FROM WINDOWS: the SEA blob is platform-independent (no code
// cache), postject's LIEF injector handles ELF from any OS, and the Node
// linux binary is downloaded from nodejs.org (pinned to THIS machine's own
// Node version so daemon behavior can't drift between platforms). Downloads
// cache in scripts/.satellite-sea-cache — delete it to force fresh pulls.
//
//   node scripts/build-satellite-linux.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "scripts", ".satellite-sea-linux");
const CACHE = path.join(ROOT, "scripts", ".satellite-sea-cache");
const OUT_DIR = path.join(ROOT, "satellite-dist");
const OUT = path.join(OUT_DIR, "satellite-linux-x64.tar.gz");

const NODE_VER = process.version; // e.g. v24.18.0 — same engine as Windows
const LIVEKIT_VER = "1.13.3";     // matches livekit/livekit-server.exe --version

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const entry = path.join(ROOT, "dist", "satellite", "main.js");
if (!fs.existsSync(entry)) {
  console.error("dist/satellite/main.js missing — run `npm run build` first.");
  process.exit(1);
}

async function download(url, dest) {
  if (fs.existsSync(dest)) { console.log(`  cached: ${path.basename(dest)}`); return; }
  console.log(`  fetching ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + ".part"));
  fs.renameSync(dest + ".part", dest);
}

console.log("[1/5] bundling the daemon…");
const bundle = path.join(SCRATCH, "satellited.cjs");
execFileSync("npx", [
  "esbuild", entry, "--bundle", "--platform=node", "--format=cjs",
  "--external:bufferutil", "--external:utf-8-validate",
  `--outfile=${bundle}`,
], { cwd: ROOT, stdio: "inherit", shell: true });

console.log("[2/5] building the SEA blob…");
const seaConfig = path.join(SCRATCH, "sea-config.json");
const blob = path.join(SCRATCH, "satellited.blob");
fs.writeFileSync(seaConfig, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
}));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

console.log("[3/5] fetching the Linux Node + livekit-server…");
const nodeTar = path.join(CACHE, `node-${NODE_VER}-linux-x64.tar.gz`);
const lkTar = path.join(CACHE, `livekit_${LIVEKIT_VER}_linux_amd64.tar.gz`);
await download(`https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.gz`, nodeTar);
await download(`https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VER}/livekit_${LIVEKIT_VER}_linux_amd64.tar.gz`, lkTar);

console.log("[4/5] injecting the blob into the Linux node ELF…");
const stage = path.join(SCRATCH, "stage");
fs.mkdirSync(stage, { recursive: true });
// bsdtar (Windows 10+'s tar.exe) extracts single members fine.
execFileSync("tar", ["-xzf", nodeTar, "-C", SCRATCH, `node-${NODE_VER}-linux-x64/bin/node`], { stdio: "inherit" });
const satellited = path.join(stage, "satellited");
fs.copyFileSync(path.join(SCRATCH, `node-${NODE_VER}-linux-x64`, "bin", "node"), satellited);
execFileSync("npx", [
  "postject", satellited, "NODE_SEA_BLOB", blob,
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
], { cwd: ROOT, stdio: "inherit", shell: true });

execFileSync("tar", ["-xzf", lkTar, "-C", stage, "livekit-server"], { stdio: "inherit" });

console.log("[5/5] packing the bundle…");
// Exec bits don't survive a Windows-side tar — the install script chmods.
execFileSync("tar", ["-czf", OUT, "-C", stage, "satellited", "livekit-server"], { stdio: "inherit" });

const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`done: ${OUT} (${mb} MB)`);
