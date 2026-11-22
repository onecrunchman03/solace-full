// SURVIVORZ REVIEW — a show on the real model, recorded (docs/survivorz/RUBRIC.md: the "run" lines).
//
//   npm run build && node scripts/survivorz/review/record.mjs [minutes=25] [seed=424242] [--out dir]
//
// Boots a throwaway server (port 8605, its own data dir) pointed at the 26B on this PC, starts a show with no
// countdown and keeps every frame a watcher is sent, each stamped with `wall` (ms since connecting), in
// <out>/run.jsonl. Once a minute it saves the minds' own counters to <out>/status.json. Then:
//   node scripts/survivorz/review/score-run.mjs <out>/run.jsonl <out>/status.json
// It shares the model with anything else using it (the live show): don't run it during a broadcast.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WebSocket = createRequire(path.join(ROOT, "package.json"))("ws");
const argv = process.argv.slice(2);
const outAt = argv.indexOf("--out");
const OUT = path.resolve(outAt >= 0 ? argv[outAt + 1] : path.join(ROOT, "data", "survivorz-review"));
const [minArg, seedArg] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
const PORT = 8605, MIN = Number(minArg || 25), SEED = Number(seedArg || 424242);
const MODEL = process.env.REVIEW_MODEL_URL || "http://127.0.0.1:11434";
fs.mkdirSync(OUT, { recursive: true });
const DATA_DIR = path.join(OUT, "server-data");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
const PW = "Review!Admin9xy";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: MODEL,
    NPC_BRAIN_BIG_CTX: "16384", SURVIVORZ_COUNTDOWN_MS: "0", SURVIVORZ_STREAM_TOKEN: "", NPC_AGENT_SECRET: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
const logf = fs.createWriteStream(path.join(OUT, "server.log"));
srv.stdout.pipe(logf); srv.stderr.pipe(logf);
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
const BASE = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 240 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
if (!up) { console.error("the server never came up (see server.log)"); process.exit(1); }
const api = async (method, url, token, body) => {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const admin = (await api("POST", "/api/login", null, { username: "admin", password: PW })).body?.token;
await sleep(4000);   // the engine's first health check
const started = await api("POST", "/api/admin/survivorz/show", admin, { op: "start", seed: SEED });
if (started.status !== 200) { console.error("the show didn't start:", started.status, JSON.stringify(started.body)); process.exit(1); }
console.log(`recording ${MIN} min, seed ${SEED} → ${OUT}`);
const out = fs.createWriteStream(path.join(OUT, "run.jsonl"));
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(admin)}`);
const t0 = Date.now();
ws.on("message", (d) => {
  let f; try { f = JSON.parse(String(d)); } catch { return; }
  if (f.type === "ka") return;
  out.write(JSON.stringify({ wall: Date.now() - t0, ...f }) + "\n");
});
await new Promise((r) => ws.on("open", r));
const end = Date.now() + MIN * 60_000, statuses = [];
while (Date.now() < end) {
  await sleep(Math.min(60_000, Math.max(1000, end - Date.now())));
  statuses.push({ wall: Date.now() - t0, s: (await api("GET", "/api/admin/survivorz/talk", admin)).body });
  fs.writeFileSync(path.join(OUT, "status.json"), JSON.stringify(statuses, null, 1));
  if (!statuses.at(-1).s?.minds?.modelUp) console.log("  (the model isn't answering: this minute ran on code)");
}
ws.close(); out.end();
await api("POST", "/api/admin/survivorz/show", admin, { op: "stop" });
await sleep(500);
try { srv.kill("SIGINT"); } catch {}
console.log("done");
process.exit(0);
