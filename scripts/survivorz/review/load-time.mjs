// SURVIVORZ REVIEW — HOW LONG FROM PRESSING WATCH TO A PICTURE (RUBRIC.md H5: inside 10 s, cold and warm).
//
//   npm run build && (cd client && npm run build) && node scripts/survivorz/review/load-time.mjs [--warm 3] [--cold 1] [--headed]
//
// Boots a throwaway server (port 8606, its own data dir, no model), starts a show and PAUSES it twenty seconds in
// (every load then draws the same bodies), serves the built page beside it (port 8607) and opens it in a real
// browser on this machine's graphics card (Playwright's Chromium). It presses Watch and times the loading box
// away: once with nothing kept (cold), then with every file already on this machine (warm). The page's own load
// log (show/scene.ts loadLog) says which step took the time.
//
// Reached by 127.0.0.1, never "localhost": on Windows that name costs 0.2 s a connection (IPv6 tried first),
// which read as a 40 s load here.
// Not one of run-tools.mjs's: it needs the graphics card, and Chromium installed (npx playwright install chromium).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const WARM = Number(arg("--warm", 3)), COLD = Number(arg("--cold", 1)), LIMIT_S = Number(arg("--limit", 10));
const API = 8606, WEB = 8607, PW = "Review!Admin9xy";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sz-load-"));
if (!fs.existsSync(path.join(ROOT, "client", "dist", "index.html"))) { console.error("build the page first: cd client && npm run build"); process.exit(2); }

const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { cwd: ROOT,
  env: { ...process.env, PORT: String(API), DATA_DIR, ADMIN_PASSWORD: PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", LIVEKIT_URL: "", LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "", SURVIVORZ_COUNTDOWN_MS: "0", SURVIVORZ_STREAM_TOKEN: "", NPC_AGENT_SECRET: "" }, stdio: "ignore" });
let browser = null, web = null;
const done = async (code) => { try { await browser?.close(); } catch {} try { await web?.close(); } catch {} try { srv.kill("SIGINT"); } catch {} await sleep(300); try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {} process.exit(code); };
process.on("SIGINT", () => void done(1));

const BASE = `http://127.0.0.1:${API}`;
let up = false;
for (let i = 0; i < 240 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
if (!up) { console.error("the server never came up"); await done(1); }
const api = async (method, url, token, body) => { const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const admin = (await api("POST", "/api/login", null, { username: "admin", password: PW })).body?.token;
await sleep(1500);
const st = await api("POST", "/api/admin/survivorz/show", admin, { op: "start", seed: 8 });
if (st.status !== 200) { console.error("the show didn't start:", st.status, JSON.stringify(st.body)); await done(1); }
await sleep(20_000);
await api("POST", "/api/admin/survivorz/show", admin, { op: "pause" });

// the built page, with the server behind it
const creq = createRequire(path.join(ROOT, "client", "package.json"));
const vite = await import(pathToFileURL(creq.resolve("vite")).href).then((m) => (m.preview ? m : m.default));
const proxy = {};
for (const p of ["/api", "/emoji", "/avatars", "/pageicons", "/attachments", "/banners", "/sounds", "/music"]) proxy[p] = BASE;
for (const p of ["/ws", "/ws-survivorz"]) proxy[p] = { target: `ws://127.0.0.1:${API}`, ws: true };
web = await vite.preview({ root: path.join(ROOT, "client"), configFile: false, logLevel: "silent", preview: { port: WEB, strictPort: true, host: "127.0.0.1", proxy } });

const { chromium } = createRequire(path.join(ROOT, "package.json"))("playwright-core");
browser = await chromium.launch({ headless: !argv.includes("--headed"), args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio", "--force-device-scale-factor=1",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const O = `http://127.0.0.1:${WEB}`;
await page.goto(O + "/");
const gpu = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl?.getExtension("WEBGL_debug_renderer_info"); return gl && e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : "no WebGL"; });
console.log("graphics:", gpu);
await page.evaluate(async (pw) => { const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: pw }) }); const j = await r.json(); if (j.token) localStorage.setItem("solace_token", j.token); }, PW);

async function watch(cold) {
  if (cold) {
    await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
    const cdp = await ctx.newCDPSession(page); await cdp.send("Network.clearBrowserCache"); await cdp.detach();
  }
  await page.reload();
  await page.waitForTimeout(1500);
  // (a new server's admin is asked for a recovery secret once)
  const pw = page.locator('input[type="password"]');
  if (await pw.count()) { await pw.first().fill(PW); await page.getByPlaceholder("A few memorable words").fill("tin kettle on the orange windowsill 77"); await page.getByText("Save & continue").click(); await page.waitForTimeout(1200); }
  await page.getByText(/^Survivorz$/).first().click();
  await page.waitForTimeout(800);
  const t0 = Date.now();
  await page.getByText(/^Watch/).first().click();
  let ready = false;
  while (!ready && Date.now() - t0 < 180_000) { await page.waitForTimeout(100); ready = await page.evaluate(() => !!document.querySelector("canvas") && !document.querySelector(".loading")); }
  const s = (Date.now() - t0) / 1000;
  const log = await page.evaluate(() => globalThis.__szLoad ?? []);
  return { s, ready, log };
}
const show = (r) => { let prev = 0; for (const [t, w] of r.log) { if (t - prev >= 300) console.log(`     ${(t / 1000).toFixed(1).padStart(5)} s  +${((t - prev) / 1000).toFixed(1)}  ${w}`); prev = t; } };

const runs = { cold: [], warm: [] };
for (let i = 0; i < COLD; i++) { const r = await watch(true); runs.cold.push(r.s); console.log(`cold: ${r.ready ? r.s.toFixed(1) + " s" : "no picture in 3 min"}`); if (i === 0) show(r); }
for (let i = 0; i < WARM; i++) { const r = await watch(false); runs.warm.push(r.s); console.log(`warm: ${r.ready ? r.s.toFixed(1) + " s" : "no picture in 3 min"}`); if (i === 0) show(r); }
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const cold = med(runs.cold), warm = med(runs.warm);
const okay = (cold === null || cold <= LIMIT_S) && (warm === null || warm <= LIMIT_S);
console.log(`\nLOAD: cold ${cold === null ? "—" : cold.toFixed(1) + " s"} · warm ${warm === null ? "—" : warm.toFixed(1) + " s"} (the rule: ${LIMIT_S} s, on this machine with the server beside it)`);
console.log(okay ? "pass" : "FAIL: over the rule");
await done(okay ? 0 : 1);
