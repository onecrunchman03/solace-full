// SOLACE SURVIVORZ — THE STREAM TOKEN + THE RIG'S SERVER HALF (src/survivorz/streamtoken.ts,
// src/survivorz/stream.ts), over a real server on port 8593:
//  1. OFF WITHOUT THE ENV: no SURVIVORZ_STREAM_TOKEN = every stream door 404s and the would-be token
//     opens nothing (401 on the show's doors and its socket).
//  2. THE STREAM TOKEN OPENS THE SHOW'S READ-ONLY DOORS, EVEN OFF AIR: the watch socket (told "offair",
//     then the snapshot when the show starts), the asset index and files, effects, sounds, a voice
//     clip — while a member is still refused off air. No token or a wrong one: 401.
//  3. …AND NOTHING ELSE: a long list of ordinary, admin and socket routes all answer it 401.
//  4. NEVER A MEMBER: the stream seat isn't counted, isn't capped, and isn't closed by OFF AIR.
//  5. THE HEARTBEAT: token-only; the health check "Survivorz stream" green on a fresh beat, RED when
//     it goes stale or the rig reports a problem, quiet after a clean stop — and a run still expected
//     after a server restart goes red once the grace passes.
//  6. THE STANDBY CARD: the admin's lever (a member and the token refused), audited, read back by the
//     stream page and in the heartbeat's answer; and the "no stream expected" lever quiets the check.
//  7. THE GO-LIVE SWITCH + THE RUN'S PICKS: a standing-by rig told whether a stream is wanted, the
//     admin's switch (a member refused), the run's setup (maps, characters, never a draft), a bad map or
//     cast refused, a streamed start on a chosen cast turning the stream on and Stop turning it off.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { WebSocket } = require(path.join(ROOT, "node_modules", "ws"));
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8593;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "survivorz-stream-harness");
const FIX = path.join(DATA_DIR, "fixture-assets");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
// a tiny stand-in asset tree, so the doors have something to serve
for (const d of ["game", "fx/blood", "sound/final/game/step-concrete"]) mkdirSync(path.join(FIX, d), { recursive: true });
writeFileSync(path.join(FIX, "game", "rick.glb"), Buffer.from("glTF-fixture"));
writeFileSync(path.join(FIX, "fx", "blood", "splat.json"), "{}");
writeFileSync(path.join(FIX, "sound/final/game/step-concrete", "a.ogg"), Buffer.from("OggS-fixture"));
writeFileSync(path.join(FIX, "sound/final", "manifest.json"), JSON.stringify({ sounds: {} }));

const TOKEN = "stream-harness-token-0123456789abcdef";
const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const boot = async (extra = {}) => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    SURVIVORZ_ASSETS: FIX, SURVIVORZ_STREAM_TOKEN: "", ...extra,
  };
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => { log += d; });
  srv.stderr.on("data", (d) => { log += d; });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  return { srv, up };
};
const stop = async (srv) => {
  const gone = new Promise((r) => srv.once("exit", r));
  srv.kill("SIGINT");
  await Promise.race([gone, sleep(5000)]);
};
const api = async (method, url, token, body) => {
  const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const watch = (token, p = "/ws-survivorz") => new Promise((resolve) => {
  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}${p}?token=${encodeURIComponent(token)}`);
  const w = { ws, frames, closed: null, refused: null };
  ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws.on("close", (code) => { w.closed = code; });
  ws.on("unexpected-response", (_req, res) => { w.refused = res.statusCode; resolve(w); });
  ws.on("error", () => { if (w.refused === null) { w.refused = -1; resolve(w); } });
  ws.on("open", () => resolve(w));
});
const health = async (admin) => (await api("GET", "/api/admin/health", admin)).body?.checks?.find((c) => c.name === "Survivorz stream");
const login = async () => (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;

console.log("OFF WITHOUT THE ENV");
let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
ok(up, "the server boots without SURVIVORZ_STREAM_TOKEN");
let admin = await login();
{
  ok((await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { fps: 60 })).status === 404, "the heartbeat door is 404 when the token isn't configured");
  ok((await api("GET", "/api/survivorz/stream/state", admin)).status === 404, "the stream page's state is 404 too");
  ok((await api("GET", "/api/survivorz/assets", TOKEN)).status === 401, "the would-be token is refused the show's assets (401)");
  ok((await watch(TOKEN)).refused === 401, "…and the watch socket (401)");
  ok(!(await health(admin)), "no 'Survivorz stream' health check on a box without a stream rig");
}
await stop(srv);

console.log("THE STREAM TOKEN OPENS THE SHOW'S READ-ONLY DOORS, EVEN OFF AIR");
({ srv, up } = await boot({ SURVIVORZ_STREAM_TOKEN: TOKEN, SURVIVORZ_STREAM_STALE_MS: "1500", SURVIVORZ_STREAM_GRACE_MS: "1200" }));
ok(up, "the server boots with SURVIVORZ_STREAM_TOKEN set");
admin = await login();
const reg = await api("POST", "/api/register", null, { username: "zfan", password: "Sturdy!Passw0rd#9", displayName: "Fan", secret: "vault marmalade lantern quartz 47", acceptTerms: true });
const member = reg.body?.token;
ok(!!admin && !!member, "an admin and a member are signed in");
let sw;
{
  const s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s?.running === false && s?.onAir === false, "the show is stopped and off air");
  sw = await watch(TOKEN);
  await sleep(300);
  ok(sw.refused === null && sw.frames.some((f) => f.type === "offair"), "the stream token opens the watch socket off air (told 'offair')");
  ok((await watch("")).refused === 401, "no token: the watch socket is refused 401");
  ok((await watch(TOKEN + "x")).refused === 401, "a wrong token: refused 401");
  ok((await watch(TOKEN.slice(0, -1))).refused === 401, "a token one character short: refused 401");
  const idx = await api("GET", "/api/survivorz/assets", TOKEN);
  ok(idx.status === 200 && idx.body?.bodies?.some((b) => b.id === "rick"), "the asset index answers the stream token off air");
  const file = await fetch(BASE + "/api/survivorz/asset/body/rick.glb", { headers: { authorization: "Bearer " + TOKEN } });
  ok(file.status === 200 && (await file.text()) === "glTF-fixture", "an asset file streams to it");
  ok((await fetch(BASE + "/api/survivorz/fx/blood/splat.json", { headers: { authorization: "Bearer " + TOKEN } })).status === 200, "an effects file streams to it");
  ok((await fetch(BASE + "/api/survivorz/sound/step-concrete/a.ogg", { headers: { authorization: "Bearer " + TOKEN } })).status === 200, "a sound streams to it");
  ok((await api("GET", "/api/survivorz/voice/123", TOKEN)).status === 404, "the voice door lets it through (404: no such clip, not 401/403)");
  ok((await api("GET", "/api/survivorz/assets", TOKEN + "x")).status === 401, "a wrong token is refused the assets (401)");
  ok((await api("GET", "/api/survivorz/assets", null)).status === 401, "no token is refused the assets (401)");
  ok((await api("GET", "/api/survivorz/voice/123", TOKEN + "x")).status === 401, "a wrong token is refused the voice door (401)");
  ok((await api("GET", "/api/survivorz/assets", member)).status === 403, "a member is still refused the assets off air (403)");
  ok((await api("GET", "/api/survivorz/voice/123", member)).status === 403, "…and the voice door (403)");
}

console.log("…AND NOTHING ELSE");
{
  const routes = [
    ["GET", "/api/me"], ["GET", "/api/channels"], ["GET", "/api/users"], ["GET", "/api/dm"], ["GET", "/api/wheel"], ["POST", "/api/wheel/spin"],
    ["GET", "/api/shop"], ["GET", "/api/survivorz/onair"], ["GET", "/api/admin/survivorz/show"], ["POST", "/api/admin/survivorz/show", { op: "start" }],
    ["POST", "/api/admin/survivorz/body", { op: "kill", id: "s:rick" }], ["GET", "/api/admin/survivorz/talk"], ["GET", "/api/admin/survivorz/stream"],
    ["POST", "/api/admin/survivorz/stream/standby", { on: true }], ["POST", "/api/admin/survivorz/stream/expected", { on: false }],
    ["POST", "/api/admin/survivorz/spawn", { n: 1 }], ["GET", "/api/admin/health"], ["POST", "/api/logout"], ["PATCH", "/api/me/prefs", { theme: "chill" }],
  ];
  const got = [];
  for (const [m, u, b] of routes) got.push([u, (await api(m, u, TOKEN, b)).status]);
  const leaks = got.filter(([, s]) => s !== 401);
  ok(leaks.length === 0, `${routes.length} ordinary, admin and survivorz-admin routes all answer the token 401${leaks.length ? ` — LEAKS: ${JSON.stringify(leaks)}` : ""}`);
  const sockets = [];
  for (const p of ["/ws", "/ws-casino", "/ws-game", "/ws-escape"]) sockets.push([p, (await watch(TOKEN, p)).refused]);
  ok(sockets.every(([, r]) => r === 401), `the app, casino, backrooms and escape sockets refuse it 401 (${JSON.stringify(sockets)})`);
  const s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s?.running === false, "nothing the token tried started the show");
}

console.log("NEVER A MEMBER");
{
  let s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s?.watchers === 1 && s?.members === 0, "the stream seat is a watcher but not a member");
  await api("POST", "/api/admin/survivorz/show", admin, { op: "start", seed: 99 });
  await sleep(1500);
  ok(sw.frames.some((f) => f.type === "snap"), "the stream seat gets the snapshot when the show starts — still off air");
  await api("POST", "/api/admin/survivorz/show", admin, { op: "onair" });
  await api("POST", "/api/admin/survivorz/show", admin, { op: "offair" });
  await sleep(400);
  ok(sw.closed === null, "taking the show off air doesn't close the stream seat");
  s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s?.members === 0, "…and it never counts toward the members' cap");
}

console.log("THE HEARTBEAT");
{
  ok((await health(admin))?.ok === true && /no stream run expected/.test((await health(admin)).detail), "before any beat: the check is green, no run expected");
  ok((await api("POST", "/api/survivorz/stream/heartbeat", null, { fps: 60 })).status === 401, "a beat with no token: 401");
  ok((await api("POST", "/api/survivorz/stream/heartbeat", member, { fps: 60 })).status === 401, "a beat with a member's session: 401");
  ok((await api("POST", "/api/survivorz/stream/heartbeat", TOKEN + "x", { fps: 60 })).status === 401, "a beat with a wrong token: 401");
  const r = await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { fps: 60, lastFrameAt: Date.now(), rtmp: "up", recording: "up", ffmpeg: true, session: 1, restarts: 0, rtmpSince: Date.now(), heapMB: 900, problem: null, junk: "x".repeat(5000) });
  ok(r.status === 200 && r.body?.standby?.on === false, "a beat with the token is taken, and answered with the standby card");
  let h = await health(admin);
  ok(h?.ok === true && /60 fps/.test(h.detail) && /RTMP up/.test(h.detail), "a fresh beat: the check is green and says what the rig said");
  await sleep(2000);
  h = await health(admin);
  ok(h?.ok === false && /last check-in/.test(h.detail), "a beat past the stale window: RED");
  await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { fps: 60, rtmp: "down", recording: "up", problem: "the YouTube leg has been down 3 min" });
  h = await health(admin);
  ok(h?.ok === false && /YouTube leg has been down/.test(h.detail), "a fresh beat that reports a problem: RED, with the rig's words");
  const view = (await api("GET", "/api/admin/survivorz/stream", admin)).body;
  ok(view?.configured === true && view?.expected === true && view?.beat?.rtmp === "down" && view?.beat?.problem, "the admin's view carries the last beat");
  ok(!("junk" in (view?.beat ?? {})), "unknown fields in a beat are dropped");
}

console.log("A RUN STILL EXPECTED AFTER A RESTART");
{
  await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { fps: 60 });
  sw.ws.close();
  await stop(srv);
  ({ srv, up } = await boot({ SURVIVORZ_STREAM_TOKEN: TOKEN, SURVIVORZ_STREAM_STALE_MS: "1500", SURVIVORZ_STREAM_GRACE_MS: "1200" }));
  admin = await login();
  let h = await health(admin);
  ok(up && h?.ok === true && /waiting/.test(h.detail), "right after a restart: green, waiting for the rig (a run is still expected)");
  await sleep(1500);
  h = await health(admin);
  ok(h?.ok === false && /hasn't checked in since this boot/.test(h.detail), "past the grace with no beat: RED");
  await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { stopping: true });
  h = await health(admin);
  ok(h?.ok === true && /no stream run expected/.test(h.detail), "a clean stop: nothing expected, the check is quiet");
}

console.log("THE STANDBY CARD");
{
  const member2 = (await api("POST", "/api/login", null, { username: "zfan", password: "Sturdy!Passw0rd#9" })).body?.token;
  ok((await api("POST", "/api/admin/survivorz/stream/standby", member2, { on: true })).status === 403, "a member is refused the standby lever (403)");
  ok((await api("POST", "/api/admin/survivorz/stream/standby", admin, { on: "yes" })).status === 400, "a malformed lever is refused 400");
  const r = await api("POST", "/api/admin/survivorz/stream/standby", admin, { on: true, text: "Back in five — the dead are taking a break." });
  ok(r.status === 200 && r.body?.standby?.on === true, "the admin puts the card up");
  const st = await api("GET", "/api/survivorz/stream/state", TOKEN);
  ok(st.status === 200 && st.body?.standby?.on === true && /dead are taking a break/.test(st.body.standby.text), "the stream page reads the card with its token");
  ok((await api("GET", "/api/survivorz/stream/state", member2)).status === 403, "a member is refused the stream page's state (403)");
  ok((await api("GET", "/api/survivorz/stream/state", TOKEN + "x")).status === 401, "a wrong token is refused it (401)");
  const hb = await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { fps: 60 });
  ok(hb.body?.standby?.on === true, "the heartbeat's answer carries the card (the rig pushes it to the page)");
  await api("POST", "/api/admin/survivorz/stream/standby", admin, { on: false });
  ok((await api("GET", "/api/survivorz/stream/state", TOKEN)).body?.standby?.on === false, "the admin takes it down");
  // (the re-grade: anything but true or false used to read as OFF, and switched a wanted stream off)
  const odd = [await api("POST", "/api/admin/survivorz/stream/expected", admin, { on: "true" }), await api("POST", "/api/admin/survivorz/stream/expected", admin, { on: 1 }), await api("POST", "/api/admin/survivorz/stream/expected", admin, { text: "x" })];
  ok(odd.every((x) => x.status === 400), `the 'expected' switch takes true or false and nothing else (${odd.map((x) => x.status).join(" ")})`);
  await api("POST", "/api/admin/survivorz/stream/expected", admin, { on: false });
  const h = await health(admin);
  ok(h?.ok === true && /no stream run expected/.test(h.detail), "'no stream is expected' quiets the check");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const acts = db.prepare("SELECT action FROM audit WHERE action LIKE 'survivorz.stream.%' ORDER BY id").all().map((x) => x.action);
  db.close();
  ok(acts.includes("survivorz.stream.standby_on") && acts.includes("survivorz.stream.standby_off") && acts.includes("survivorz.stream.not_expected"), `every lever is audited (${acts.join(", ")})`);
}

console.log("THE GO-LIVE SWITCH + THE RUN'S PICKS");
{
  const member2 = (await api("POST", "/api/login", null, { username: "zfan", password: "Sturdy!Passw0rd#9" })).body?.token;
  ok((await api("POST", "/api/admin/survivorz/stream/want", member2, { on: true })).status === 403, "a member is refused the go-live switch (403)");
  ok((await api("POST", "/api/admin/survivorz/stream/want", admin, { on: 1 })).status === 400, "a malformed switch is refused 400");
  let hb = await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { idle: true, rtmp: "off", recording: "off" });
  ok(hb.status === 200 && hb.body?.want === false, "a standing-by rig is told: no stream wanted");
  const view = (await api("GET", "/api/admin/survivorz/stream", admin)).body;
  ok(view?.expected === false && view?.beat?.idle === true, "a standing-by beat is not a run (nothing expected)");
  ok(/standing by/.test((await health(admin))?.detail ?? ""), "the check reads 'standing by'");
  ok((await api("POST", "/api/admin/survivorz/stream/want", admin, { on: true })).body?.want === true, "the admin asks for a stream");
  hb = await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { idle: true });
  ok(hb.body?.want === true, "the rig's next beat is told to go live");
  await api("POST", "/api/admin/survivorz/stream/want", admin, { on: false });
  ok((await api("POST", "/api/survivorz/stream/heartbeat", TOKEN, { idle: true })).body?.want === false, "…and to stand by again when the admin stops it");

  const setup = await api("GET", "/api/admin/survivorz/setup", admin);
  ok(setup.status === 200 && setup.body?.maps?.some((m) => m.id === "bunker") && setup.body?.characters?.length > 1 && setup.body?.stream === true,
    `the run's setup: the maps, ${setup.body?.characters?.length ?? 0} characters, and the stream rig present`);
  ok(!setup.body?.characters?.some((c) => c.status === "draft"), "no draft character is offered");
  ok((await api("GET", "/api/admin/survivorz/setup", member2)).status === 403, "a member is refused the setup (403)");
  await api("POST", "/api/admin/survivorz/show", admin, { op: "stop" });
  ok((await api("POST", "/api/admin/survivorz/show", admin, { op: "start", map: "halcyon" })).body?.error === "bad_map", "a map that isn't on the list is refused");
  ok((await api("POST", "/api/admin/survivorz/show", admin, { op: "start", cast: ["nobody"] })).body?.error === "bad_cast", "a cast with somebody unknown is refused");
  ok((await api("POST", "/api/admin/survivorz/show", admin, { op: "start", cast: [] })).body?.error === "bad_cast", "an empty cast is refused");
  const two = setup.body.characters.slice(0, 2).map((c) => c.id);
  const st = await api("POST", "/api/admin/survivorz/show", admin, { op: "start", map: "bunker", cast: [...two].reverse(), stream: true });
  ok(st.status === 200 && st.body?.running === true && st.body?.map === "bunker" && st.body?.cast?.join() === two.join(),
    `a streamed start on the bunker with two survivors runs them, in spawn order (${st.body?.cast?.join(", ")})`);
  ok(st.body?.setup?.starts?.length === 2, `…and only those two are placed (${st.body?.setup?.starts?.map((x) => x.who).join(", ")})`);
  ok((await api("GET", "/api/admin/survivorz/stream", admin)).body?.want === true, "…and it turns the stream on");
  await api("POST", "/api/admin/survivorz/show", admin, { op: "stop" });
  ok((await api("GET", "/api/admin/survivorz/stream", admin)).body?.want === false, "stopping the run stops the stream");
  // (the code review's C-4: "stop" pressed with nothing running used to switch a hand-set stream off)
  await api("POST", "/api/admin/survivorz/stream/want", admin, { on: true });
  await api("POST", "/api/admin/survivorz/show", admin, { op: "stop" });
  ok((await api("GET", "/api/admin/survivorz/stream", admin)).body?.want === true, "a stop with nothing running leaves a stream switched on by hand alone");
  await api("POST", "/api/admin/survivorz/show", admin, { op: "test", map: "bunker" });
  await api("POST", "/api/admin/survivorz/show", admin, { op: "stop" });
  ok((await api("GET", "/api/admin/survivorz/stream", admin)).body?.want === true, "...and so does stopping a test run");
  await api("POST", "/api/admin/survivorz/stream/want", admin, { on: false });
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const rows = db.prepare("SELECT action, detail FROM audit WHERE action IN ('survivorz.start', 'survivorz.stream.go_live') ORDER BY id").all();
  db.close();
  ok(rows.some((r) => r.action === "survivorz.start" && /bunker/.test(r.detail ?? "") && /streamed/.test(r.detail ?? "")) && rows.some((r) => r.action === "survivorz.stream.go_live"),
    "the start (with its map, cast and 'streamed') and the switch are audited");
}

await stop(srv);
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n${n - bad}/${n} passed`);
if (bad) { console.log(log.slice(-3000)); process.exit(1); }
