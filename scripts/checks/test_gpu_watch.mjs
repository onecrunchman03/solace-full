// THE WORKSTATION GPU WATCHER (Josh, Nov 1 2026): src/survivorz/gpurule.ts judged directly, then
// src/survivorz/gpuwatch.ts over a real server on port 8597:
//  1. THE RULE: a healthy card is ok; dwm crept past 3 GB says restart; a nearly full card says
//     restart when dwm is the cause and names the biggest users when it isn't; the in-between watches.
//  2. THE DOOR: 404 without a stream token configured; the watcher's post needs the token (401 for
//     none, a wrong one or an ordinary session), and a malformed sample is refused 400.
//  3. THE CHECK: absent until a watcher has reported; green on a healthy sample, RED on a restart
//     verdict (Sterling's alert path), RED once the watcher goes quiet past the stale window, and
//     gone again after the watcher says goodbye.

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { gpuVerdict, DWM_RESTART_MB, FREE_FULL_MB } = await import(pathToFileURL(path.join(ROOT, "dist", "survivorz", "gpurule.js")).href);

console.log("THE RULE");
const T = 24564;
const s = (used, procs) => ({ usedMb: used, totalMb: T, procs });
{
  const v = gpuVerdict(s(19000, [{ name: "llama-server", mb: 17000 }, { name: "dwm", mb: 850 }]));
  ok(v.level === "ok" && !v.alarm, "the model and a fresh desktop: ok");
  const r = gpuVerdict(s(20000, [{ name: "llama-server", mb: 15000 }, { name: "dwm", mb: DWM_RESTART_MB + 500 }]));
  ok(r.level === "restart" && r.alarm && /restart the PC/.test(r.detail) && /dwm/.test(r.detail), "dwm past 3 GB: restart, and it says dwm is why");
  const f = gpuVerdict(s(T - FREE_FULL_MB + 200, [{ name: "llama-server", mb: 17000 }, { name: "msedge", mb: 5000 }, { name: "dwm", mb: 900 }]));
  ok(f.level === "full" && f.alarm && /llama-server/.test(f.detail) && /msedge/.test(f.detail), "nearly full with a small dwm: full, naming the biggest users");
  const fd = gpuVerdict(s(T - 500, [{ name: "llama-server", mb: 17000 }, { name: "dwm", mb: 2200 }]));
  ok(fd.level === "restart" && fd.alarm, "nearly full with a grown dwm: restart");
  const w = gpuVerdict(s(22300, [{ name: "llama-server", mb: 17000 }, { name: "msedge", mb: 4000 }, { name: "dwm", mb: 900 }]));
  ok(w.level === "watch" && !w.alarm, "the stream running beside the model (2.2 GB free): watching, not an alarm");
  const dw = gpuVerdict(s(19000, [{ name: "DWM", mb: 2000 }]));
  ok(dw.level === "watch", "dwm named in any case, and 2 GB of it is worth watching");
}

const PORT = 8597;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "gpu-watch-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const TOKEN = "gpu-watch-harness-token-0123456789ab";
const ADMIN_PW = "Harness!Admin9xy";
const STALE = 2500;
const boot = async (extra = {}) => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    SURVIVORZ_STREAM_TOKEN: "", SURVIVORZ_GPU_STALE_MS: String(STALE), ...extra,
  };
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, stdio: ["ignore", "ignore", "ignore"] });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  return { srv, up };
};
const stop = async (srv) => { const gone = new Promise((r) => srv.once("exit", r)); srv.kill("SIGINT"); await Promise.race([gone, sleep(5000)]); };
const api = async (method, url, token, body) => {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const login = async () => (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;
const check = async (admin) => (await api("GET", "/api/admin/health", admin)).body?.checks?.find((c) => c.name === "Workstation GPU memory");
const healthy = { usedMb: 19000, totalMb: T, procs: [{ name: "llama-server", mb: 17000 }, { name: "dwm", mb: 850 }] };

console.log("THE DOOR");
let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
ok(up, "the server boots without a stream token");
ok((await api("POST", "/api/survivorz/gpu", TOKEN, healthy)).status === 404, "404 when the stream token isn't configured");
await stop(srv);

({ srv, up } = await boot({ SURVIVORZ_STREAM_TOKEN: TOKEN }));
ok(up, "the server boots with the stream token");
const admin = await login();
ok(!(await check(admin)), "no GPU check before a watcher has reported");
ok((await api("POST", "/api/survivorz/gpu", null, healthy)).status === 401, "no token: 401");
ok((await api("POST", "/api/survivorz/gpu", "wrong-token-wrong-token-wrong", healthy)).status === 401, "a wrong token: 401");
ok((await api("POST", "/api/survivorz/gpu", admin, healthy)).status === 401, "an ordinary session (the admin's): 401");
ok((await api("POST", "/api/survivorz/gpu", TOKEN, { usedMb: 99999, totalMb: 100 })).status === 400, "a malformed sample: 400");

console.log("THE CHECK");
const r1 = await api("POST", "/api/survivorz/gpu", TOKEN, healthy);
ok(r1.status === 200 && r1.body?.verdict?.level === "ok", "a healthy sample answers ok");
let c = await check(admin);
ok(c?.ok === true, "the check is green on a healthy card");
const r2 = await api("POST", "/api/survivorz/gpu", TOKEN, { usedMb: 22000, totalMb: T, procs: [{ name: "llama-server", mb: 15000 }, { name: "dwm", mb: 5200 }] });
ok(r2.body?.verdict?.level === "restart", "a crept dwm answers restart");
c = await check(admin);
ok(c?.ok === false && /restart the PC/.test(c.detail), "the check goes RED and says to restart");
const view = await api("GET", "/api/admin/survivorz/gpu", admin);
ok(view.status === 200 && view.body?.report?.procs?.[0]?.name === "llama-server" && view.body.watching === true, "the admin's view carries the last report");
await api("POST", "/api/survivorz/gpu", TOKEN, healthy);
await sleep(STALE + 600);
c = await check(admin);
ok(c?.ok === false && /last report/.test(c.detail), "a watcher gone quiet past the window: RED");
ok((await api("POST", "/api/survivorz/gpu", TOKEN, { stopping: true })).status === 200, "the watcher's goodbye is accepted");
ok(!(await check(admin)), "after the goodbye the check is gone");
await stop(srv);

try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n${n - bad}/${n} gpu-watch asserts passed`);
process.exit(bad ? 1 : 0);
