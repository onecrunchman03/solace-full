// SOLACE SURVIVORZ — THE LOOPS' GROUND SPEEDS, MEASURED ON THE FLOOR (realism round 8, Nov 2026).
//
// A locomotion loop plays in place; the show speeds it to match the body (actors.ts measureSpeed: the loop's
// "natural" speed). An estimate read off the clip's bones was 4-9% high on the walk and up to 25% on the jog, and
// broke outright on the sprint on some bodies — the feet skated under every one. This finds it the honest way: each
// body in a running show (paused) is driven down a dead-straight line at a fixed speed with the loop forced, and a
// golden-section search finds the natural speed that leaves the ball of the planted foot stillest between planting
// and lifting. All bodies in the scene search at once. The result is client/src/survivorz/show/loopspeed.json,
// which the show reads before its estimate.
//
//   npm run build && (cd client && npm run build)
//   node scripts/survivorz/calib-loops.mjs [--port 8781] [--only <clip substring>]
//
// It needs SURVIVORZ_ASSETS (the gitignored asset tree) and Playwright's Chromium. Rerun it when a body is added or a
// locomotion clip is re-baked.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BPORT = Number(arg("--port", "8781")), PPORT = BPORT + 1;
const ONLY = arg("--only", "");
const OUT = path.join(ROOT, "client/src/survivorz/show/loopspeed.json");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GP = "gp-mx-pistol-handgun-locomotion-pack--pistol-", GR = "gr-mx-pro-rifle-pack--", GS = "gs-mx-pro-rifle-pack--";
/** [clip, the wire pose it plays under, the test speed (m/s), whose bodies] — any speed the loop is used at will
 *  do: a wrong natural speed slides the foot by the same amount per step at every speed */
const JOBS = [
  ["ual1-walk-loop", "walk", 1.3, "survivor"], ["ual1-jog-fwd-loop", "jog", 2.6, "survivor"], ["ual1-sprint-loop", "sprint", 4.5, "survivor"],
  ["mx-male-injured-pack--injured-walk", "walk", 0.9, "survivor"], ["mx-male-injured-pack--injured-run", "jog", 2.2, "survivor"],
  ["ual1-crouch-fwd-loop", "crouch-walk", 0.7, "survivor"], ["bd-flashlight-walk", "walk", 1.2, "survivor"], ["bd-flashlight-run", "jog", 2.6, "survivor"],
  [`${GP}walk`, "walk", 1.2, "survivor"], [`${GP}run`, "jog", 2.6, "survivor"],
  [`${GR}walk-forward`, "walk", 1.2, "survivor"], [`${GR}run-forward`, "jog", 2.6, "survivor"], [`${GR}sprint-forward`, "sprint", 4.5, "survivor"],
  [`${GS}walk-forward`, "walk", 1.2, "survivor"], [`${GS}run-forward`, "jog", 2.6, "survivor"],
  ["mx-zombie-walk", "z-wander", 0.6, "zombie"], ["mx-zombie-walking", "z-wander", 0.6, "zombie"], ["mx-zombie-walking-1", "z-wander", 0.6, "zombie"],
  ["ual2-zombie-walk-fwd-loop", "z-wander", 0.7, "zombie"], ["mx-zombie-running", "z-chase", 2.5, "zombie"],
].filter(([c]) => !ONLY || c.includes(ONLY));

const DATA = path.join(ROOT, "data", `calib-${BPORT}`);
fs.rmSync(DATA, { recursive: true, force: true });
const PW = "Calib!Admin9xyZ";
const env = { ...process.env, PORT: String(BPORT), DATA_DIR: DATA, ADMIN_PASSWORD: PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
  LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "", SURVIVORZ_COUNTDOWN_MS: "0" };
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] });
process.on("exit", () => { try { srv.kill(); } catch { /* gone */ } });
const B = `http://127.0.0.1:${BPORT}`;
for (let i = 0; i < 200; i++) { try { if ((await fetch(B + "/health")).ok) break; } catch { /* booting */ } await sleep(250); }
const api = async (m, u, t, b) => { const r = await fetch(B + u, { method: m, headers: { ...(t ? { authorization: "Bearer " + t } : {}), ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j }; };
const token = (await api("POST", "/api/login", null, { username: "admin", password: PW })).body?.token;

// the built client, served with the API and the sockets passed through
const DIST = path.join(ROOT, "client", "dist");
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wasm": "application/wasm", ".json": "application/json", ".ogg": "audio/ogg" };
const proxy = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (!u.pathname.startsWith("/api/")) {
    let f = path.join(DIST, decodeURIComponent(u.pathname));
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    return res.end(fs.readFileSync(f));
  }
  const up = http.request({ host: "127.0.0.1", port: BPORT, method: req.method, path: req.url, headers: req.headers }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  up.on("error", () => res.destroy());
  req.pipe(up);
});
proxy.on("upgrade", (req, sock, head) => {
  const up = net.connect(BPORT, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    up.write(head); up.pipe(sock); sock.pipe(up);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
await new Promise((r) => proxy.listen(PPORT, "127.0.0.1", r));

const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const CHROME = process.env.CHROMIUM ?? "C:/Users/you/AppData/Local/ms-playwright/chromium-1246/chrome-win64/chrome.exe";
const browser = await chromium.launch({ ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
for (const kind of ["survivor", "zombie"]) {
  const jobs = JOBS.filter((j) => j[3] === kind);
  if (!jobs.length) continue;
  // a show with every survivor body in it, and (for the dead) plenty of zombie bodies
  await api("POST", "/api/admin/survivorz/show", token, { op: "test", seed: 9, zombies: kind === "zombie" ? 40 : 0 });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((t) => localStorage.setItem("solace_token", t), token);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PPORT}/#survivorz-watch`);
  for (let i = 0; i < 600; i++) {
    const s = await page.evaluate(() => { const sh = window.__show; if (!sh) return null; const L = [...sh.actors.list.values()]; return { n: L.length, ready: L.filter((a) => a.ready).length }; }).catch(() => null);
    if (s && s.n > 0 && s.ready === s.n) break;
    await sleep(250);
  }
  await api("POST", "/api/admin/survivorz/show", token, { op: "pause" });
  await sleep(1500);
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "scripts/survivorz/calib-loops.page.js"), "utf8") });
  for (const [clip, pose, speed] of jobs) {
    const r = await page.evaluate(([c, p, v, k]) => window.__calibrate(c, p, v, k), [clip, pose, speed, kind]);
    // (kept only where the search found a real minimum: inside its range, with steps it could read — the dead drag
    // their feet, a step never ends, and their loops keep the estimate)
    results[clip] = Object.fromEntries(Object.entries(r).filter(([, x]) => x.slide < 9 && x.nat / x.est > 0.57 && x.nat / x.est < 1.23).map(([body, x]) => [body, x.nat]));
    if (!Object.keys(results[clip]).length) delete results[clip];
    console.log(clip.padEnd(48), Object.entries(r).map(([b, x]) => `${b} ${x.est}→${x.nat} (${(x.slide * 100).toFixed(0)} cm)`).join(" · "));
    fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + "\n");
  }
  await ctx.close();
}
await browser.close();
proxy.close(); srv.kill();
fs.rmSync(DATA, { recursive: true, force: true });
console.log("wrote", OUT);
process.exit(0);
