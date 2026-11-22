// THE BACKROOMS SCREENSHOT RIG — look at a level in the real client.
//
//   node scripts/backrooms/shoot.mjs --level 0 --port 8700 --out C:\tmp\shots\L0
//   node scripts/backrooms/shoot.mjs --level 7 --port 8702 --out ...\L7 --shots spots.json
//
// Boots a throwaway Solace server on --port with a FRESH data dir, serves a
// built client on --port+1 (proxying the backend's prefixes, sockets
// included), opens it in headless Chromium as the admin, walks into the level
// through the hub, takes off in the flycam and flies to each spot, then writes
//   <out>/<label>-<n>.png   one per view
//   <out>/report.json       spots, positions, console errors, failed requests,
//                           frame timing, the GL renderer
//   <out>/index.html        a contact sheet
// Several can run at once on different levels: every port and directory comes
// from the arguments (the builds are shared and lock-guarded).
//
// Options:
//   --level N          0-9 (required)
//   --port P           backend port; the client server takes P+1 (required)
//   --out DIR          output directory (required; created)
//   --shots FILE       JSON array of {label, x, y, z?, yaw, pitch} — cells and
//                      radians, z the eye in metres (omitted: eye height over
//                      the floor, under the ceiling). Default is --auto.
//   --auto             pick spots: the door, every objective, creature, relic
//                      site and lore drive, and one room of each room type
//   --yaws N           views per room spot (default 4)
//   --max-spots N      cap the auto list (default 80)
//   --only KINDS       auto spots of these kinds only, comma-separated:
//                      door,room,objective,monster,relic,drive
//   --hud              keep the game's HUD in the shots (default: canvas only)
//   --labels           keep the operator's through-wall tags (default: hidden)
//   --swiftshader      render in software (default: the real GPU, falling back
//                      to SwiftShader by itself when no hardware GL comes up)
//   --gfx PRESET       the game's graphics preset (default high)
//   --torch            carry a lit flashlight (default: suit only, hands empty)
//   --no-land          shoot creatures from the air (default: land beside each
//                      one for a few seconds, in god mode, so it streams/moves)
//   --no-build         never rebuild dist/ or the client bundle
//   --timeout S        whole-run cap in seconds (default 900)
//   --keep-data        leave the temp data dir behind
//
// yaw: 0 faces north (-y in cells), +π/2 faces west (-x). pitch: + looks up.
//
// The client is built ONCE into the OS temp dir as a production bundle with
// import.meta.env.DEV forced on — the game's script hooks (__brFly, __brGoto,
// __brDbg …) live behind that flag. Public assets are served straight from
// client/public, so nothing big is copied.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLIENT = path.join(ROOT, "client");
const require = createRequire(path.join(ROOT, "package.json"));
const t0 = Date.now();

// ---------------------------------------------------------------- args ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const LEVEL = Number(opt("level", NaN));
const PORT = Number(opt("port", NaN));
const OUT = opt("out", "");
if (!(LEVEL >= 0 && LEVEL <= 9) || !Number.isInteger(LEVEL) || !(PORT > 0) || !OUT) {
  console.error("usage: node scripts/backrooms/shoot.mjs --level N --port P --out DIR [--shots file.json | --auto]");
  process.exit(2);
}
const CPORT = PORT + 1;
const SHOTS_FILE = opt("shots", "");
const YAWS = Math.max(1, Number(opt("yaws", 4)));
const MAX_SPOTS = Math.max(1, Number(opt("max-spots", 80)));
const HUD = flag("hud");
const LABELS = flag("labels");
const SOFT = flag("swiftshader");
const GFX = opt("gfx", "high");
const TORCH = flag("torch");
const LAND = !flag("no-land");
const ONLY = opt("only", "").split(",").map((k) => k.trim()).filter(Boolean);
const NO_BUILD = flag("no-build");
const TIMEOUT_S = Number(opt("timeout", 900));
const KEEP_DATA = flag("keep-data");
const W = 1280, H = 720;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(`[shoot L${LEVEL} ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The report is written on every way out, including a timeout or a crash.
const report = {
  level: LEVEL, port: PORT, startedAt: new Date().toISOString(), ok: false, error: null,
  phases: {}, gl: null, sector: null, spots: [], shots: [], console: [], pageErrors: [],
  failedRequests: [], badResponses: [], frameTiming: [], operator: null,
};
const phase = (name) => { report.phases[name] = +((Date.now() - t0) / 1000).toFixed(1); log(name); };

// ---------------------------------------------------- cleanup on any exit ----
let server = null, staticSrv = null, browser = null, dataDir = null;
const tokenRef = { v: "" };
let cleaned = false;
const cleanup = async () => {
  if (cleaned) return;
  cleaned = true;
  try { await browser?.close(); } catch {}
  try { staticSrv?.close(); staticSrv?.closeAllConnections?.(); } catch {}
  if (server && server.exitCode === null) {
    // our own child only — never a blanket kill
    try { server.kill(); } catch {}
    await Promise.race([new Promise((r) => server.once("exit", r)), sleep(4000)]);
  }
  if (dataDir && !KEEP_DATA) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {} }
};
const EXPECTED = [
  [/^\/desktop\//, "the hub probing for the boxed installer — absent on every dev box"],
  [/^\/sfx\/br-[a-z-]+\.ogg$/, "gearsfx.ts tries the file first and falls back to a synth by design"],
  [/^\/api\/backrooms\/voice-token/, "voice is off in the rig (no LiveKit)"],
  [/^\/api\/npc\//, "the NPC brain is off in the rig"],
];
const annotate = (list) => { for (const f of list) { const e = EXPECTED.find(([re]) => re.test(f.url)); if (e) f.expected = e[1]; } };
const writeReport = () => {
  annotate(report.failedRequests);
  annotate(report.badResponses);
  report.durationS = +((Date.now() - t0) / 1000).toFixed(1);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  writeSheet();
};
process.on("exit", () => { if (server && server.exitCode === null) try { server.kill(); } catch {} });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { report.error = `killed (${sig})`; writeReport(); await cleanup(); process.exit(130); });
const overall = setTimeout(async () => {
  report.error = report.error ?? `overall timeout after ${TIMEOUT_S}s (last phase: ${Object.keys(report.phases).pop()})`;
  log("TIMEOUT —", report.error);
  writeReport();
  await cleanup();
  process.exit(3);
}, TIMEOUT_S * 1000);

// ------------------------------------------------------------- builds ----
// One build folder PER CHECKOUT: agents fixing levels side by side in their
// own worktrees each shoot their own client, never each other's.
const SHARED = path.join(os.tmpdir(), "solace-shoot", (await import("node:crypto")).createHash("sha1").update(ROOT.toLowerCase()).digest("hex").slice(0, 10));
const CLIENT_OUT = path.join(SHARED, "client");
fs.mkdirSync(SHARED, { recursive: true });

const newest = (dir, skip = () => false) => {
  let m = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (skip(p)) continue;
      if (e.isDirectory()) walk(p);
      else m = Math.max(m, fs.statSync(p).mtimeMs);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return m;
};
const withLock = async (name, fn) => {
  const lock = path.join(SHARED, `${name}.lock`);
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10 * 60_000) fs.rmSync(lock, { recursive: true, force: true }); } catch {}
      await sleep(1000);
    }
  }
  try { return await fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
};

async function ensureServerBuild() {
  const distT = fs.existsSync(path.join(ROOT, "dist", "index.js")) ? fs.statSync(path.join(ROOT, "dist", "index.js")).mtimeMs : 0;
  if (NO_BUILD) { if (!distT) throw new Error("dist/index.js missing and --no-build given"); return; }
  await withLock("server-build", async () => {
    const d = fs.existsSync(path.join(ROOT, "dist", "index.js")) ? fs.statSync(path.join(ROOT, "dist", "index.js")).mtimeMs : 0;
    const src = newest(path.join(ROOT, "src"), (p) => p.endsWith(".json") && false);
    if (d && d >= src) return;
    log("dist/ is older than src/ — npm run build");
    const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc")], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) {
      const msg = (r.stdout + r.stderr).split("\n").slice(0, 8).join("\n");
      if (!d) throw new Error(`server build failed:\n${msg}`);
      log(`server build failed — using the existing dist/ (\n${msg})`);
      report.serverBuildWarning = msg;
    }
  });
}

async function ensureClientBuild() {
  const stamp = path.join(CLIENT_OUT, ".stamp");
  const srcT = Math.max(newest(path.join(CLIENT, "src")), fs.statSync(path.join(CLIENT, "index.html")).mtimeMs, fs.statSync(path.join(CLIENT, "vite.config.ts")).mtimeMs);
  const fresh = () => fs.existsSync(stamp) && Number(fs.readFileSync(stamp, "utf8")) >= srcT;
  if (fresh()) return;
  if (NO_BUILD && fs.existsSync(path.join(CLIENT_OUT, "index.html"))) return;
  await withLock("client-build", async () => {
    if (fresh()) return;
    log("building the client bundle (production, DEV hooks on) — about a minute");
    const tmpOut = path.join(SHARED, `client-${process.pid}`);
    const vite = require.resolve("vite", { paths: [CLIENT] });
    const code = `
      const { build } = await import(${JSON.stringify("file:///" + vite.replace(/\\/g, "/"))});
      await build({
        root: ${JSON.stringify(CLIENT)},
        configFile: ${JSON.stringify(path.join(CLIENT, "vite.config.ts"))},
        logLevel: "warn",
        define: { "import.meta.env.DEV": "true" },
        build: { outDir: ${JSON.stringify(tmpOut)}, emptyOutDir: true, copyPublicDir: false, sourcemap: false },
      });`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: CLIENT, encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`client build failed:\n${(r.stdout + r.stderr).slice(-3000)}`);
    // the hooks must actually be in the bundle, or every shot will time out
    const js = fs.readdirSync(path.join(tmpOut, "assets")).filter((f) => f.endsWith(".js"));
    if (!js.some((f) => fs.readFileSync(path.join(tmpOut, "assets", f), "utf8").includes("__brGoto"))) {
      throw new Error("client bundle has no __brGoto — the DEV define did not take");
    }
    fs.rmSync(CLIENT_OUT, { recursive: true, force: true });
    fs.renameSync(tmpOut, CLIENT_OUT);
    fs.writeFileSync(stamp, String(srcT));
  });
}

// ------------------------------------------------------------- server ----
async function bootServer() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `solace-shoot-L${LEVEL}-`));
  const ADMIN_PW = "Shoot-Rig!2026xQ";
  const env = {
    ...process.env,
    ENV_FILE: path.join(dataDir, "no.env"), // never the repo's .env (LiveKit, the brain…)
    PORT: String(PORT), HOST: "127.0.0.1", DATA_DIR: dataDir,
    ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "false", REQUIRE_INVITE: "false",
    BACKROOMS_DIRECTOR: "0", LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "", ROLLO_LIVE: "", SEASONS: "",
  };
  const logFile = fs.createWriteStream(path.join(OUT, "server.log"));
  server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.pipe(logFile);
  server.stderr.pipe(logFile);
  let exited = null;
  server.once("exit", (c) => { exited = c; });
  for (let i = 0; i < 240; i++) {
    if (exited !== null) throw new Error(`server exited (${exited}) during boot — see server.log`);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/auth-config`);
      if (r.ok) break;
    } catch {}
    await sleep(250);
    if (i === 239) throw new Error("server did not answer within 60s — see server.log");
  }
  // a suit and a torch in the admin's locker — the loadout needs a suit
  const db = new DatabaseSync(path.join(dataDir, "solace.db"));
  db.exec("PRAGMA busy_timeout = 5000");
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  const ins = db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, ?, 0, ?, ?)");
  ins.run(admin.id, "suit", "yellow", Date.now());
  ins.run(admin.id, "flashlight", null, Date.now());
  db.close();
  // log in, and clear the recovery-secret gate through the API
  const api = async (p, body, token) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p} → ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const login = await api("/api/login", { username: "admin", password: ADMIN_PW });
  if (!login.token) throw new Error(`login gave no token: ${JSON.stringify(login)}`);
  await api("/api/me/secret", { currentPassword: ADMIN_PW, secret: "Rig Secret Phrase 77!" }, login.token);
  return login.token;
}

// ----------------------------------------------- static + proxy server ----
const PROXY = ["/api", "/ws", "/emoji", "/avatars", "/pageicons", "/attachments", "/banners", "/sounds", "/music", "/satvoice", "/health", "/legal-none"];
const isProxied = (u) => PROXY.some((p) => u === p || u.startsWith(p + "/") || u.startsWith(p + "?") || (p === "/ws" && /^\/ws(-[a-z]+)?(\/|\?|$)/.test(u)));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".wasm": "application/wasm", ".fbx": "application/octet-stream", ".ktx2": "image/ktx2", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon", ".hdr": "application/octet-stream", ".exr": "application/octet-stream" };
function startStatic() {
  const roots = [CLIENT_OUT, path.join(CLIENT, "public")];
  const srv = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (isProxied(url)) {
      const p = http.request({ host: "127.0.0.1", port: PORT, path: url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      p.on("error", () => { try { res.writeHead(502); res.end(); } catch {} });
      req.pipe(p);
      return;
    }
    let rel = decodeURIComponent(url.split("?")[0]);
    if (rel.endsWith("/")) rel += "index.html";
    for (const r of roots) {
      const f = path.join(r, rel);
      if (!f.startsWith(r)) break;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
        fs.createReadStream(f).pipe(res);
        return;
      }
    }
    // an asset path that isn't there is a real 404 (that's what the report
    // hunts for); anything else is the SPA
    if (/\.[a-z0-9]{2,5}$/i.test(rel)) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": "text/html" });
    fs.createReadStream(path.join(CLIENT_OUT, "index.html")).pipe(res);
  });
  srv.on("upgrade", (req, sock, head) => {
    const up = net.connect(PORT, "127.0.0.1", () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      up.write(raw + "\r\n");
      if (head?.length) up.write(head);
      up.pipe(sock);
      sock.pipe(up);
    });
    up.on("error", () => sock.destroy());
    sock.on("error", () => up.destroy());
  });
  return new Promise((res, rej) => { srv.once("error", rej); srv.listen(CPORT, "127.0.0.1", () => res(srv)); });
}

// ---------------------------------------------------- the map, in Node ----
// The level's frozen sector, built from the repo the same way the server
// builds it (a fresh DB has no published version, so this IS the map played).
function loadSector() {
  const D = require(path.join(ROOT, "dist", "backrooms", "designs.js"));
  const r = D.repoDesign(LEVEL);
  return { ...D.buildMap(LEVEL, r.tiles, r.seed).sector, sectorId: r.sectorId };
}
const STEP = 0.5, EYE = 1.65, WATER_NONE = -128;
function mapTools(s) {
  const N = s.size;
  const I = (x, y) => y * N + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const open = (x, y) => inb(x, y) && !s.solid[I(x, y)] && !s.background[I(x, y)];
  const surf = (x, y) => {
    const f = s.floor[I(x, y)];
    const w = s.water ? s.water[I(x, y)] : WATER_NONE;
    return Math.max(f, w === WATER_NONE ? -1e9 : w) * STEP;
  };
  const edgeBlocked = (ax, ay, bx, by) => {
    if (bx === ax + 1) return !!s.wallW[I(bx, by)];
    if (bx === ax - 1) return !!s.wallW[I(ax, ay)];
    if (by === ay + 1) return !!s.wallN[I(bx, by)];
    if (by === ay - 1) return !!s.wallN[I(ax, ay)];
    return false;
  };
  /** Clear sight from a to b across the grid (thin walls, solid cells). The
   *  target's own cell may be entered across a wall — doors live in walls. */
  const los = (ax, ay, bx, by) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05);
    let cx = Math.floor(ax), cy = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
      const nx = Math.floor(x), ny = Math.floor(y);
      if (nx === cx && ny === cy) continue;
      if (nx === tx && ny === ty) return true;
      if (!open(nx, ny)) return false;
      if (nx !== cx && ny !== cy) {
        const a = edgeBlocked(cx, cy, nx, cy) || edgeBlocked(nx, cy, nx, ny);
        const b = edgeBlocked(cx, cy, cx, ny) || edgeBlocked(cx, ny, nx, ny);
        if (a && b) return false;
      } else if (edgeBlocked(cx, cy, nx, ny)) return false;
      cx = nx; cy = ny;
    }
    return true;
  };
  const wet = (x, y) => !!s.water && s.water[I(x, y)] !== WATER_NONE && s.water[I(x, y)] > s.floor[I(x, y)];
  return { N, I, inb, open, surf, los, edgeBlocked, wet };
}
const yawTo = (fx, fy, tx, ty) => Math.atan2(-(tx - fx), -(ty - fy));
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "spot";

/** A camera spot that can SEE (tx, ty): a few cells off, open floor, clear sight. */
function viewOf(M, tx, ty, targetUp = 1.0, preferDry = false) {
  for (const dryOnly of preferDry ? [true, false] : [false]) for (const r of [3, 2.3, 4.2, 1.6, 5.5, 7]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
      const cx = Math.floor(x), cy = Math.floor(y);
      if (!M.open(cx, cy) || (dryOnly && M.wet(cx, cy))) continue;
      if (!M.los(x, y, tx, ty)) continue;
      const tcx = Math.min(M.N - 1, Math.max(0, Math.floor(tx))), tcy = Math.min(M.N - 1, Math.max(0, Math.floor(ty)));
      const eye = M.surf(cx, cy) + EYE;
      const tz = M.surf(tcx, tcy) + targetUp;
      const dist = Math.hypot(tx - x, ty - y) * 2; // cells are 2 m
      return { x: cx + 0.5, y: cy + 0.5, base: M.surf(cx, cy), wet: M.wet(cx, cy), yaw: yawTo(cx + 0.5, cy + 0.5, tx, ty), pitch: Math.atan2(tz - eye, dist) };
    }
  }
  return null;
}

function autoSpots(s, op) {
  const M = mapTools(s);
  const spots = [];
  const add = (label, kind, v, target) => { if (v) spots.push({ label, kind, ...v, target }); else report.spots.push({ label, kind, skipped: "no open spot with a clear view", target }); };
  // THE DOOR(S): from inside looking back at it, and from it looking in
  const IN = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] };
  for (const d of s.doors) {
    const [ix, iy] = IN[d.edge] ?? [0, 1];
    const dx = d.x + 0.5, dy = d.y + 0.5;
    let back = null;
    for (const r of [3.5, 2.5, 4.5, 1.5]) {
      const x = dx + ix * r, y = dy + iy * r;
      if (M.open(Math.floor(x), Math.floor(y))) { back = { x, y, base: M.surf(Math.floor(x), Math.floor(y)), yaw: yawTo(x, y, dx - ix * 0.5, dy - iy * 0.5), pitch: -0.05 }; break; }
    }
    add(`door-${slug(d.name)}`, "door", back ?? viewOf(M, dx, dy, 1.0), { x: dx, y: dy, name: d.name });
    if (M.open(d.x, d.y)) add(`door-${slug(d.name)}-in`, "door", { x: dx + ix * 0.3, y: dy + iy * 0.3, base: M.surf(d.x, d.y), yaw: yawTo(dx, dy, dx + ix, dy + iy), pitch: -0.08 }, { x: dx, y: dy });
  }
  // THE HUNT, as the operator view names it
  if (op) {
    op.objectives.forEach((o, i) => add(`obj-${slug(o.kind)}-${i}`, "objective", viewOf(M, o.x, o.y, 1.0), { x: o.x, y: o.y, kind: o.kind, label: o.label, state: o.state }));
    op.relics.forEach((r, i) => add(`relic-${i}-${slug(r.name)}`, "relic", viewOf(M, r.x, r.y, 1.15), { x: r.x, y: r.y, name: r.name, i }));
    op.drives.forEach((d) => add(`drive-${slug(d.id)}`, "drive", viewOf(M, d.x, d.y, 0.3), { x: d.x, y: d.y, id: d.id }));
    op.monsters.forEach((c) => add(`monster-${slug(c.kind)}-${c.id}`, "monster", viewOf(M, c.x, c.y, 1.0, true), { x: c.x, y: c.y, kind: c.kind, id: c.id, mode: c.mode }));
  }
  // ONE ROOM OF EACH TYPE: the largest connected patch of a district type,
  // at its most open cell (furthest from any wall), several ways round.
  const reach = (() => {
    try {
      const { distanceMap } = require(path.join(ROOT, "dist", "backrooms", "worldgen.js"));
      return distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    } catch { return null; }
  })();
  const byType = new Map();
  for (const d of s.districts) byType.set(d.id, d.type);
  const seen = new Uint8Array(M.N * M.N);
  const best = new Map(); // type -> cells[]
  for (let y = 0; y < M.N; y++) for (let x = 0; x < M.N; x++) {
    const i = M.I(x, y);
    if (seen[i] || !M.open(x, y) || (reach && reach[i] < 0)) continue;
    const id = s.district[i];
    const cells = [];
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const c = q.pop();
      cells.push(c);
      const cx = c % M.N, cy = (c / M.N) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (!M.open(nx, ny)) continue;
        const j = M.I(nx, ny);
        if (seen[j] || s.district[j] !== id || (reach && reach[j] < 0) || M.edgeBlocked(cx, cy, nx, ny)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    const type = byType.get(id) ?? `d${id}`;
    if (!best.has(type) || best.get(type).length < cells.length) best.set(type, cells);
  }
  for (const [type, cells] of best) {
    if (cells.length < 4) continue;
    const set = new Set(cells);
    const dist = new Map();
    const q = [];
    for (const c of cells) {
      const cx = c % M.N, cy = (c / M.N) | 0;
      const edge = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].some(([nx, ny]) => !M.inb(nx, ny) || !set.has(M.I(nx, ny)) || M.edgeBlocked(cx, cy, nx, ny));
      if (edge) { dist.set(c, 0); q.push(c); }
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const cx = c % M.N, cy = (c / M.N) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (!M.inb(nx, ny)) continue;
        const j = M.I(nx, ny);
        if (!set.has(j) || dist.has(j)) continue;
        dist.set(j, dist.get(c) + 1);
        q.push(j);
      }
    }
    let pick = cells[0], pd = -1;
    for (const c of cells) if ((dist.get(c) ?? 0) > pd) { pd = dist.get(c) ?? 0; pick = c; }
    const x = (pick % M.N) + 0.5, y = ((pick / M.N) | 0) + 0.5;
    const views = [];
    for (let k = 0; k < YAWS; k++) views.push({ yaw: (k / YAWS) * Math.PI * 2, pitch: -0.12 });
    spots.push({ label: `room-${slug(type)}`, kind: "room", x, y, base: M.surf(Math.floor(x), Math.floor(y)), views, target: { type, cells: cells.length, openness: pd } });
  }
  // rooms first after the doors: a --max-spots cap should keep the look of the level
  const ORDER = { door: 0, room: 1, objective: 2, monster: 3, relic: 4, drive: 5 };
  spots.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
  return spots;
}

// ------------------------------------------------------- contact sheet ----
function writeSheet() {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const tiles = report.shots.map((s) => `<figure class="${s.file ? "" : "miss"}">${s.file ? `<a href="${esc(s.file)}"><img loading="lazy" src="${esc(s.file)}"></a>` : `<div class="none">${esc(s.error ?? "no shot")}</div>`}<figcaption><b>${esc(s.label)}</b> · ${esc(s.kind)} · (${s.x?.toFixed?.(1)}, ${s.y?.toFixed?.(1)}) z ${s.z?.toFixed?.(1)} yaw ${s.yaw?.toFixed?.(2)}${s.note ? ` · <i>${esc(s.note)}</i>` : ""}</figcaption></figure>`).join("\n");
  const errs = [...report.pageErrors, ...report.console.filter((c) => c.type === "error")].slice(0, 60).map((e) => `<li>${esc(e.count ? `×${e.count} ` : "")}${esc(e.text ?? e.message)}</li>`).join("");
  const fails = [...report.failedRequests, ...report.badResponses].slice(0, 80).map((f) => `<li>${esc(f.status ?? f.failure ?? "")} ${esc(f.url)}${f.count > 1 ? ` ×${f.count}` : ""}</li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Level ${LEVEL} shots</title><style>
body{background:#16171a;color:#ddd;font:13px system-ui;margin:16px}h1{font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px}
figure{margin:0;background:#222;border-radius:6px;overflow:hidden}figure img{width:100%;display:block}
figcaption{padding:6px 8px;color:#bbb}.none{padding:40px;color:#e88}.miss{outline:1px solid #a33}
.k{color:#999}ul{max-height:240px;overflow:auto;background:#1d1e22;padding:8px 24px}</style>
<h1>Level ${LEVEL} — ${esc(report.sector?.id ?? "")} · ${report.shots.filter((s) => s.file).length} shots · ${report.durationS ?? "?"}s ${report.ok ? "" : "· <span style=color:#e88>" + esc(report.error ?? "incomplete") + "</span>"}</h1>
<p class="k">GL: ${esc(report.gl?.renderer ?? "?")} · frame: ${esc(report.frameTiming.map((f) => `${f.where} avg ${f.avgMs}ms p95 ${f.p95Ms}ms`).join(" | "))}</p>
<details><summary>${report.pageErrors.length + report.console.filter((c) => c.type === "error").length} console errors</summary><ul>${errs}</ul></details>
<details><summary>${report.failedRequests.length + report.badResponses.length} failed requests</summary><ul>${fails}</ul></details>
<div class="grid">${tiles}</div>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}

// ---------------------------------------------------------------- run ----
const findPlaywright = () => {
  try { return require("playwright-core"); } catch {}
  const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, "node_modules", "playwright-core");
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error("playwright-core not found");
};
const findChrome = () => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error("no Playwright Chromium under %LOCALAPPDATA%/ms-playwright");
};

async function main() {
  await ensureServerBuild();
  await ensureClientBuild();
  phase("builds ready");
  const token = await bootServer();
  tokenRef.v = token;
  phase("server up");
  staticSrv = await startStatic();
  phase("client server up");

  const sector = loadSector();
  report.sector = { id: sector.sectorId, size: sector.size, doors: sector.doors, districts: sector.districts.map((d) => d.type) };

  const { chromium } = findPlaywright();
  const ARGS_GPU = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"];
  const ARGS_SOFT = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"];
  const glOf = async (b) => {
    const p = await b.newPage();
    const g = await p.evaluate(() => {
      const c = document.createElement("canvas");
      const g = c.getContext("webgl2") || c.getContext("webgl");
      if (!g) return { renderer: "NO WEBGL" };
      const d = g.getExtension("WEBGL_debug_renderer_info");
      return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : "" };
    });
    await p.close();
    return g;
  };
  browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: SOFT ? ARGS_SOFT : ARGS_GPU });
  report.gl = await glOf(browser);
  if (!SOFT && /NO WEBGL|SwiftShader|Basic Render|llvmpipe/i.test(report.gl.renderer)) {
    log(`no hardware GL (${report.gl.renderer}) — SwiftShader instead`);
    await browser.close();
    browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ARGS_SOFT });
    report.gl = await glOf(browser);
  }
  report.gl.software = /SwiftShader|Basic Render|llvmpipe/i.test(report.gl.renderer);
  log("GL:", report.gl.renderer);
  if (report.gl.renderer === "NO WEBGL") throw new Error("headless Chromium has no WebGL at all");
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([tok, gfx]) => {
    try {
      localStorage.setItem("solace_token", tok);
      const k = "solace_br_settings";
      const cur = JSON.parse(localStorage.getItem(k) || "{}");
      localStorage.setItem(k, JSON.stringify({ ...cur, gfxPreset: gfx }));
    } catch {}
  }, [token, GFX]);
  const page = await ctx.newPage();

  // ---- what goes wrong, recorded
  const cons = new Map();
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const text = m.text().slice(0, 600);
    const k = m.type() + text;
    const e = cons.get(k);
    if (e) e.count++;
    else { const v = { type: m.type(), text, count: 1, at: +((Date.now() - t0) / 1000).toFixed(1), url: m.location()?.url }; cons.set(k, v); report.console.push(v); }
  });
  page.on("pageerror", (e) => report.pageErrors.push({ message: String(e.message).slice(0, 600), stack: String(e.stack ?? "").slice(0, 1200) }));
  let inflight = 0, lastNet = Date.now();
  const failMap = new Map();
  const noteFail = (list, rec) => {
    const k = (rec.status ?? rec.failure) + rec.url;
    const e = failMap.get(k);
    if (e) e.count++;
    else { rec.count = 1; failMap.set(k, rec); list.push(rec); }
  };
  page.on("request", () => { inflight++; lastNet = Date.now(); });
  page.on("requestfinished", () => { inflight = Math.max(0, inflight - 1); lastNet = Date.now(); });
  page.on("requestfailed", (r) => {
    inflight = Math.max(0, inflight - 1); lastNet = Date.now();
    noteFail(report.failedRequests, { url: r.url().replace(`http://127.0.0.1:${CPORT}`, ""), failure: r.failure()?.errorText ?? "failed", type: r.resourceType() });
  });
  page.on("response", (r) => {
    if (r.status() >= 400) noteFail(report.badResponses, { url: r.url().replace(`http://127.0.0.1:${CPORT}`, ""), status: r.status(), type: r.request().resourceType() });
  });
  // ---- the game socket: the welcome and the operator's view
  let welcome = null, op = null, opAt = 0, gameErr = null;
  const wire = []; // {t, type} of every JSON frame the game socket received
  const wireSince = (ms) => [...new Set(wire.filter((w) => w.t >= Date.now() - ms).map((w) => w.type))];
  page.on("websocket", (ws) => {
    if (!/\/ws-game/.test(ws.url())) return;
    ws.on("framereceived", (f) => {
      if (typeof f.payload !== "string" || f.payload[0] !== "{") return;
      try {
        const m = JSON.parse(f.payload);
        if (m.type === "welcome") { welcome = m; report.phases["welcome frame"] = +((Date.now() - t0) / 1000).toFixed(1); }
        else if (m.type === "op") { op = m.view; opAt = Date.now(); }
        else if (!welcome && (m.type === "error" || m.type === "denied" || m.error)) gameErr = gameErr ?? m;
        if (m.type && m.type !== "op") { wire.push({ t: Date.now(), type: m.type }); if (wire.length > 4000) wire.splice(0, 2000); }
      } catch {}
    });
  });
  const netIdle = async (quietMs = 600, capMs = 15000) => {
    const end = Date.now() + capMs;
    while (Date.now() < end) {
      if (inflight === 0 && Date.now() - lastNet >= quietMs) return true;
      await sleep(100);
    }
    return false;
  };
  const waitFor = async (what, fn, capMs, step = 200) => {
    const end = Date.now() + capMs;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(step);
    }
  };

  // ---- in through the hub
  await page.goto(`http://127.0.0.1:${CPORT}/`, { waitUntil: "domcontentloaded" });
  await waitFor("the app shell (rail)", () => page.locator("button.item", { hasText: "Backrooms" }).count(), 60000, 300);
  await page.locator("button.item", { hasText: "Backrooms" }).first().click();
  await waitFor("the level rail", () => page.locator("button.lvl").count(), 30000, 300);
  await page.locator("button.lvl").nth(LEVEL).click();
  await waitFor(`level ${LEVEL} selected`, () => page.locator("button.lvl").nth(LEVEL).evaluate((b) => b.classList.contains("on")), 15000);
  await waitFor("a door's enter button", () => page.locator("button.enter", { hasText: "enter" }).count(), 20000, 300);
  await page.locator("button.enter", { hasText: "enter" }).first().click();
  phase("loadout open");
  // the loadout: the suit and the torch
  await waitFor("the loadout picker", () => page.locator(".pickrow").count(), 15000);
  // the rig's locker holds a suit and a torch: the suit always, the torch on --torch
  await waitFor("the locker items", () => page.locator("button.pickcard2").count(), 15000);
  const picks = page.locator("button.pickcard2");
  for (let i = 0; i < (await picks.count()); i++) {
    const b = picks.nth(i);
    const isSuit = /suit/i.test((await b.locator(".pname").textContent().catch(() => "")) ?? "");
    const want = isSuit || TORCH;
    const on = await b.evaluate((el) => el.classList.contains("on"));
    if (want !== on) await b.click();
  }
  const go = page.locator(".pickrow button.vbtn", { hasText: /enter with/ });
  await waitFor("the enter button enabled", async () => (await go.count()) && !(await go.first().isDisabled()), 10000);
  await go.first().click();
  phase("entering");
  await waitFor("the game to load and the welcome to arrive", async () => {
    if (gameErr) throw new Error(`the game refused: ${JSON.stringify(gameErr)}`);
    const errText = (await page.locator(".gameload").count()) ? await page.locator(".gameload").first().textContent({ timeout: 500 }).catch(() => null) : null;
    if (errText && /failed/i.test(errText)) throw new Error(`game bundle: ${errText.trim()}`);
    return welcome && (await page.evaluate(() => typeof window.__brGoto === "function" && typeof window.__brDbg === "function" && window.__brDbg().entered));
  }, 120000, 400);
  if (welcome.level !== LEVEL) throw new Error(`entered level ${welcome.level}, wanted ${LEVEL}`);
  if (welcome.size !== sector.size) report.sectorMismatch = `the server plays a ${welcome.size}² map, the repo builds ${sector.size}²`;
  phase("in the level");
  // god mode for the creature shots (the admin lands beside each one)
  await fetch(`http://127.0.0.1:${PORT}/api/admin/backrooms/immortal`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tokenRef.v}` }, body: JSON.stringify({ on: true }) }).catch(() => {});
  // clean shots: only the canvas is drawn (the HUD, prompts and menus hidden)
  if (!HUD) await page.addStyleTag({ content: "body *{visibility:hidden !important} canvas{visibility:visible !important}" });
  await page.evaluate((on) => window.__brTorch?.(on), TORCH);
  await page.evaluate(() => window.__brFly(true));
  await waitFor("the operator view (the server took the flight)", () => op && Date.now() - opAt < 3000, 20000);
  report.operator = { monsters: op.monsters, relics: op.relics, drives: op.drives, objectives: op.objectives, bodies: op.bodies };
  phase("flying");

  // ---- the spots
  let spots;
  if (SHOTS_FILE) {
    const list = JSON.parse(fs.readFileSync(SHOTS_FILE, "utf8"));
    spots = list.map((s, i) => ({ label: slug(s.label ?? `shot-${i}`), kind: "manual", x: s.x, y: s.y, z: s.z, views: [{ yaw: s.yaw ?? 0, pitch: s.pitch ?? 0 }] }));
  } else {
    spots = autoSpots(sector, op);
    if (ONLY.length) spots = spots.filter((sp) => ONLY.includes(sp.kind));
  }
  if (spots.length > MAX_SPOTS) { report.truncatedSpots = spots.length - MAX_SPOTS; spots = spots.slice(0, MAX_SPOTS); }
  log(`${spots.length} spots`);

  const status = () => page.evaluate(() => window.__brGoto.status());
  const frameSample = async (where) => {
    const t = await page.evaluate(() => new Promise((res) => {
      const d = [];
      let last = performance.now();
      const f = (now) => { d.push(now - last); last = now; if (d.length < 90 && d.reduce((a, b) => a + b, 0) < 3000) requestAnimationFrame(f); else res(d); };
      requestAnimationFrame(f);
    }));
    t.shift();
    const s = [...t].sort((a, b) => a - b);
    const dbg = await page.evaluate(() => { const d = window.__brDbg(); return { calls: d.calls, tris: d.tris }; });
    const rec = { where, avgMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1), p50Ms: +s[s.length >> 1].toFixed(1), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(1), maxMs: +s[s.length - 1].toFixed(1), ...dbg };
    report.frameTiming.push(rec);
    log(`frames @ ${where}: avg ${rec.avgMs}ms p95 ${rec.p95Ms}ms, ${rec.calls} calls`);
  };

  let shotN = 0;
  for (const sp of spots) {
    if (sp.kind === "monster" && op) {
      // a creature has moved since the list was made — aim at where it is now
      const m = op.monsters.find((c) => c.kind === sp.target.kind && c.id === sp.target.id);
      if (m) { const v = viewOf(mapTools(sector), m.x, m.y, 1.0, true); if (v) Object.assign(sp, v, { target: { ...sp.target, x: m.x, y: m.y, mode: m.mode } }); }
    }
    const views = sp.views ?? [{ yaw: sp.yaw, pitch: sp.pitch }];
    const rec = { label: sp.label, kind: sp.kind, x: sp.x, y: sp.y, target: sp.target, views: [] };
    report.spots.push(rec);
    const tSpot = Date.now();
    try {
      await page.evaluate(([x, y, yaw, pitch]) => window.__brGoto(x, y, undefined, yaw, pitch), [sp.x, sp.y, views[0].yaw, views[0].pitch]);
      let st;
      try {
        st = await waitFor("chunks", async () => { const s = await status(); return s.have >= s.want && s.known ? s : null; }, 25000, 150);
      } catch {
        st = await status();
        rec.note = `chunks ${st.have}/${st.want}${st.known ? "" : ", cell unknown"} after 25s`;
      }
      // the eye: the given z, or eye height over the floor (or the water's
      // surface), kept under the ceiling the client now knows
      const base = sp.base ?? st.ground ?? 0;
      let z = sp.z ?? base + EYE;
      if (sp.z === undefined && st.ceil != null && st.ceil > base + 0.6) z = Math.min(z, st.ceil - 0.25);
      rec.z = z;
      rec.ground = st.ground;
      rec.ceil = st.ceil;
      const arrived = Date.now();
      let landed = false;
      for (let vi = 0; vi < views.length; vi++) {
        const v = views[vi];
        await page.evaluate(([x, y, z, yaw, pitch]) => window.__brGoto(x, y, z, yaw, pitch), [sp.x, sp.y, z, v.yaw, v.pitch]);
        const idle = await netIdle(vi === 0 ? 700 : 300, vi === 0 ? 20000 : 6000);
        // relics, drives, keys and doors ride a 2.5 s proximity stream keyed
        // off where the server thinks you are — give it one full beat
        if (vi === 0 && ["relic", "drive", "objective"].includes(sp.kind)) await sleep(Math.max(0, 2800 - (Date.now() - arrived)));
        if (vi === 0 && sp.kind === "monster" && LAND && sp.wet) rec.note = [rec.note, "over water — shot from the air"].filter(Boolean).join("; ");
        if (vi === 0 && sp.kind === "monster" && LAND && !sp.wet) {
          // creatures stream (and some only move) for someone WALKING the
          // level: land beside it for a few seconds — god mode is on — then
          // look at where it actually is now
          await page.evaluate(() => window.__brFly(false));
          await sleep(700);
          landed = !(await status()).fly;
          if (landed) {
            const kind = sp.target.kind;
            const t = Date.now();
            while (Date.now() - t < 5000 && !wire.some((w) => w.t >= t && w.type === kind)) await sleep(150);
            const m = op?.monsters.find((c) => c.kind === kind && c.id === sp.target.id);
            const me = await status();
            if (m) {
              const dist = Math.hypot(m.x - me.x, m.y - me.y) * 2;
              await page.evaluate(([y, p]) => window.__brLook(y, p), [yawTo(me.x, me.y, m.x, m.y), Math.atan2(0.15, Math.max(dist, 1))]);
              rec.target = { ...rec.target, nowX: m.x, nowY: m.y, nowMode: m.mode, distM: +dist.toFixed(1) };
            }
            await sleep(300);
          } else rec.note = [rec.note, "landing refused — shot from the air"].filter(Boolean).join("; ");
        }
        // two frames for anything the network just handed over to be drawn
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
        if (!LABELS) await page.evaluate(() => window.__brGoto.labels(false));
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
        const file = `${sp.label}-${vi}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        const after = await status();
        const shot = {
          label: sp.label, kind: sp.kind, file, x: after.x, y: after.y, z: after.fly ? after.alt : (after.ground ?? 0) + EYE, yaw: after.yaw, pitch: after.pitch,
          landed: landed || undefined, calls: after.calls, wire: wireSince(3000).filter((t) => !["pos", "chunk", "chunks"].includes(t)),
          note: [rec.note, idle ? "" : "network still busy"].filter(Boolean).join("; ") || undefined,
        };
        report.shots.push(shot);
        rec.views.push({ file, yaw: v.yaw, pitch: v.pitch });
        shotN++;
      }
      if (landed) {
        const t = Date.now();
        await page.evaluate(() => window.__brFly(true));
        await waitFor("the flight back", () => opAt > t, 10000).catch(() => { rec.note = [rec.note, "took off, no operator frame after"].filter(Boolean).join("; "); });
      }
      if (report.frameTiming.length === 0 && sp.kind === "room") await frameSample(sp.label);
    } catch (e) {
      rec.error = String(e.message ?? e);
      report.shots.push({ label: sp.label, kind: sp.kind, x: sp.x, y: sp.y, error: rec.error });
      log(`spot ${sp.label} failed: ${rec.error}`);
      if (/Target closed|has been closed|crashed/i.test(rec.error)) throw e;
    }
    rec.seconds = +((Date.now() - tSpot) / 1000).toFixed(1);
    log(`${sp.label}: ${rec.views.length} view(s) in ${rec.seconds}s${rec.note ? ` (${rec.note})` : ""}`);
  }
  if (report.frameTiming.length < 2) await frameSample("last spot");
  report.ok = true;
  phase(`done — ${shotN} shots`);
}

try {
  await main();
} catch (e) {
  report.error = String(e.stack ?? e).slice(0, 2000);
  log("FAILED —", String(e.message ?? e));
}
clearTimeout(overall);
writeReport();
await cleanup();
log(`report → ${path.join(OUT, "report.json")}`);
process.exit(report.ok ? 0 : 1);
