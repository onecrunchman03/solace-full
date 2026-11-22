// THE GHOST'S VOICE, AGAINST A REAL SFU (law 12 — Josh, Oct 2026: "whatever
// you recommend. just make sure it works").
//
// test_spectate pins the wire's half of the dead's voice — who watches whom,
// the budget, who is told a ghost speaks. This pins the half that used to live
// only in an honest client: whether a dead player can be HEARD. It boots a
// private LiveKit server on its own ports, a Solace server pointed at it, puts
// three runners on Level 0 over the real /ws-game wire, joins each to the real
// voice room from a headless Chromium with a fake microphone, and then reads
// what LiveKit itself says — who may publish, which tracks exist, who received
// what — through a death, a granted talk, a talk running out, a key let go,
// and a client that tries to talk anyway.
//
// NOT IN THE SUITE (run-all skips it): it needs livekit/livekit-server.exe and
// a Playwright Chromium on this box. Run it before touching ghostvoice.ts, the
// spectate wire's talk, or the voice-token routes.
//   node scripts/checks/livekit_ghost.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8543;
const BASE = `http://127.0.0.1:${PORT}`;
const LK_PORT = 7990;
const LK_KEY = "ghostkey";
const LK_SECRET = "ghost-harness-secret-0123456789abcdef";
const DATA_DIR = path.join(ROOT, "data", "livekit-ghost-harness");
try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
fs.mkdirSync(DATA_DIR, { recursive: true });

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, every = 100) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await sleep(every);
  }
};

// ---- what this box needs ------------------------------------------------------
const LK_BIN = path.join(ROOT, "livekit", os.platform() === "win32" ? "livekit-server.exe" : "livekit-server");
const UMD = path.join(ROOT, "client", "node_modules", "livekit-client", "dist", "livekit-client.umd.js");
const findPlaywright = () => {
  try { return require("playwright-core"); } catch {}
  const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, "node_modules", "playwright-core");
    if (fs.existsSync(p)) return require(p);
  }
  return null;
};
const findChrome = () => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined; // let Playwright find its own
};
const pw = findPlaywright();
if (!fs.existsSync(LK_BIN) || !fs.existsSync(UMD) || !pw) {
  console.error(`missing: ${!fs.existsSync(LK_BIN) ? "livekit-server " : ""}${!fs.existsSync(UMD) ? "livekit-client build " : ""}${!pw ? "playwright-core" : ""}`);
  process.exit(2);
}

// ---- a private LiveKit -----------------------------------------------------------
const lkConf = path.join(DATA_DIR, "livekit.yaml");
fs.writeFileSync(lkConf, `port: ${LK_PORT}
bind_addresses: ["127.0.0.1"]
rtc:
  tcp_port: ${LK_PORT + 1}
  port_range_start: 51200
  port_range_end: 51300
  use_external_ip: false
  node_ip: 127.0.0.1
keys:
  ${LK_KEY}: ${LK_SECRET}
logging:
  level: warn
`);
let lkLog = "";
const lk = spawn(LK_BIN, ["--config", lkConf], { stdio: ["ignore", "pipe", "pipe"] });
lk.stdout.on("data", (d) => { lkLog += d; });
lk.stderr.on("data", (d) => { lkLog += d; });

// ---- the Solace server, pointed at it --------------------------------------------
const ADMIN_PW = "Harness!Admin9xy";
const TALK_MS = 3000;
const REFILL_MS = 12000;
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: `ws://127.0.0.1:${LK_PORT}`,
    LIVEKIT_API_URL: "",
    LIVEKIT_API_KEY: LK_KEY,
    LIVEKIT_API_SECRET: LK_SECRET,
    BACKROOMS_SPEC_TALK_MS: String(TALK_MS),
    BACKROOMS_SPEC_REFILL_MS: String(REFILL_MS),
    BACKROOMS_GHOST_RECHECK_MS: "1500",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
let browser = null;
const cleanup = () => {
  try { srv.kill("SIGINT"); } catch {}
  try { lk.kill(); } catch {}
};
process.on("exit", cleanup);

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};
const client = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-game?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws, frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (pred) => [...frames].reverse().find(typeof pred === "string" ? (f) => f.type === pred : pred),
      async waitFor(pred, ms = 4000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(pred);
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
      clear: () => frames.splice(0),
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

// ---- a voice client in a real browser --------------------------------------------
const voiceClient = async (label) => {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log(`    [${label}] ${e.message}`));
  await page.goto(BASE + "/health");
  await page.addScriptTag({ path: UMD });
  await page.evaluate(() => {
    const LK = window.LivekitClient;
    window.join = async (url, token, publish) => {
      const room = new LK.Room();
      await room.connect(url, token);
      window.room = room;
      if (publish) await room.localParticipant.setMicrophoneEnabled(true);
      return true;
    };
    window.tryTalk = async () => {
      try {
        await window.room.localParticipant.setMicrophoneEnabled(true);
        return "ok";
      } catch (e) {
        return "err:" + (e?.message ?? e);
      }
    };
    window.hush = async () => {
      try { await window.room.localParticipant.setMicrophoneEnabled(false); } catch {}
    };
    window.only = (ids) => window.room.localParticipant.setTrackSubscriptionPermissions(false, ids.map((id) => ({ participantIdentity: String(id), allowAll: true })));
    /** Do I hold a SUBSCRIBED, unmuted audio track from this participant? */
    window.hearing = (id) => {
      const p = window.room?.remoteParticipants.get(String(id));
      if (!p) return false;
      return [...p.trackPublications.values()].some((t) => t.kind === "audio" && t.isSubscribed && !t.isMuted && !!t.track);
    };
    window.leave = async () => { try { await window.room?.disconnect(); } catch {} };
  });
  return {
    page,
    join: (g, publish) => page.evaluate(([u, t, p]) => window.join(u, t, p), [g.url, g.token, publish]),
    tryTalk: () => page.evaluate(() => window.tryTalk()),
    hush: () => page.evaluate(() => window.hush()),
    only: (ids) => page.evaluate((x) => window.only(x), ids),
    hearing: (id) => page.evaluate((x) => window.hearing(x), id),
    leave: () => page.evaluate(() => window.leave()),
  };
};

const run = async () => {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const lkUp = await until(async () => { try { return (await fetch(`http://127.0.0.1:${LK_PORT}/`)).ok; } catch { return false; } }, 15000, 250);
  ok(!!lkUp, "a private LiveKit is up on its own ports");
  const { RoomServiceClient } = require(path.join(ROOT, "node_modules", "livekit-server-sdk"));
  const rs = new RoomServiceClient(`http://127.0.0.1:${LK_PORT}`, LK_KEY, LK_SECRET);
  /** What LiveKit itself says about one participant in a room. */
  const lkSays = async (room, uid) => {
    try {
      const p = (await rs.listParticipants(room)).find((q) => q.identity === String(uid));
      if (!p) return null;
      return {
        canPublish: !!p.permission?.canPublish,
        audio: (p.tracks ?? []).filter((t) => t.type === 0 || String(t.type).toUpperCase() === "AUDIO").filter((t) => !t.muted).length,
      };
    } catch {
      return null;
    }
  };

  browser = await pw.chromium.launch({
    executablePath: findChrome(),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });

  const reg = async (u) => (await api("POST", "/api/register", {
    body: { username: u, password: "Sturdy!Passw0rd#9", displayName: u, secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  const tA = await reg("ghostvoice");
  const tB = await reg("watchedone");
  const tC = await reg("otherliving");
  const tD = await reg("secondghost");
  ok(tA && tB && tC && tD, "four runners");
  const id = async (t) => (await api("GET", "/api/me", { token: t })).body.user.id;
  const [A, B, C, D] = [await id(tA), await id(tB), await id(tC), await id(tD)];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const suitOf = (uid) => {
    let r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    if (!r) {
      db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
      r = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid);
    }
    return r.id;
  };
  const enter = async (t, uid) => {
    const c = await client(t);
    c.send({ type: "enter", door: 0, loadout: [suitOf(uid)], level: 0 });
    const w = await c.waitFor("welcome", 6000);
    return { c, w };
  };
  const a = await enter(tA, A);
  const b = await enter(tB, B);
  const cc = await enter(tC, C);
  const d = await enter(tD, D);
  ok(a.w && b.w && cc.w && d.w, "four runners on Level 0");

  // ---- the living talk ----------------------------------------------------------
  console.log("-- the living talk");
  const gA = (await api("POST", "/api/backrooms/voice-token", { token: tA })).body;
  const gB = (await api("POST", "/api/backrooms/voice-token", { token: tB })).body;
  const gC = (await api("POST", "/api/backrooms/voice-token", { token: tC })).body;
  const gD = (await api("POST", "/api/backrooms/voice-token", { token: tD })).body;
  ok(gA?.token && gA.room === gB?.room && !gA.listenOnly, `a living runner's seat in the level's room may publish (${gA?.room})`);
  const vA = await voiceClient("A"), vB = await voiceClient("B"), vC = await voiceClient("C"), vD = await voiceClient("D");
  await vA.join(gA, true);
  await vB.join(gB, true);
  await vC.join(gC, true);
  await vD.join(gD, true);
  const room = gA.room;
  ok(!!(await until(() => vB.hearing(A), 8000)) && !!(await until(() => vC.hearing(A), 4000)), "a living runner is heard by the others (a real audio track, received)");
  const a0 = await lkSays(room, A);
  ok(a0?.canPublish === true && a0.audio >= 1, `LiveKit: the living may publish, and do (${JSON.stringify(a0)})`);

  // ---- a death ---------------------------------------------------------------------
  console.log("-- a death: the dead listen");
  a.c.clear();
  a.c.send({ type: "forfeit" });
  const sp = await a.c.waitFor((f) => f.type === "spectate" && !f.none, 4000);
  ok(!!sp, "dying with others alive: watching");
  if (sp && sp.target !== B) {
    a.c.send({ type: "spec-cycle", dir: 1 });
    await a.c.waitFor((f) => f.type === "spectate" && f.target === B, 3000);
  }
  ok(a.c.last("spectate")?.target === B, "…watching B");
  const a1 = await until(async () => { const s = await lkSays(room, A); return s && !s.canPublish && s.audio === 0 ? s : null; }, 6000);
  ok(!!a1, `LiveKit: the moment they die their right to publish is gone and their mic is taken down (${JSON.stringify(a1 ?? (await lkSays(room, A)))})`);
  ok(!(await until(() => vB.hearing(A), 1500)), "…the living hear nothing from them");
  // the dead keep their ears: they still hear the one they watch
  ok(!!(await until(() => vA.hearing(B), 4000)), "…but the dead still hear the one they watch");
  // a client that tries to talk anyway
  const cheat = await vA.tryTalk();
  await sleep(1500);
  const a2 = await lkSays(room, A);
  ok(a2 && !a2.canPublish && a2.audio === 0 && !(await vB.hearing(A)), `a dead client that opens its mic anyway gets nowhere (${cheat}; LiveKit ${JSON.stringify(a2)})`);
  await vA.hush();
  // a refresh hands the dead a listen-only seat
  const gA2 = (await api("POST", "/api/backrooms/voice-token", { token: tA })).body;
  ok(gA2?.listenOnly === true, "a spectator's fresh token is a listen-only seat");

  // ---- the dead's own room ---------------------------------------------------------
  console.log("-- the dead's own room");
  ok((await api("POST", "/api/backrooms/ghost-voice-token", { token: tB })).status === 403, "the living are refused the dead's room");
  d.c.send({ type: "forfeit" });
  const spD = await d.c.waitFor((f) => f.type === "spectate" && !f.none, 4000);
  if (spD && spD.target !== B) {
    d.c.send({ type: "spec-cycle", dir: 1 });
    await d.c.waitFor((f) => f.type === "spectate" && f.target === B, 3000);
  }
  const ghA = (await api("POST", "/api/backrooms/ghost-voice-token", { token: tA })).body;
  const ghD = (await api("POST", "/api/backrooms/ghost-voice-token", { token: tD })).body;
  ok(ghA?.token && ghA.room === ghD?.room && ghA.room !== room, `the dead get their own room on the level (${ghA?.room})`);
  const xA = await voiceClient("A-ghosts"), xD = await voiceClient("D-ghosts");
  await xA.join(ghA, true);
  await xD.join(ghD, true);
  ok(!!(await until(() => xD.hearing(A), 8000)) && !!(await until(() => xA.hearing(D), 4000)), "two of the dead hear each other freely there — no key, no budget");
  const g0 = await lkSays(ghA.room, A);
  ok(g0?.canPublish === true && g0.audio >= 1, `LiveKit: in their own room the dead publish (${JSON.stringify(g0)})`);
  const aTalk0 = a.c.last("spectate")?.talkLeftMs;
  await sleep(1000);
  ok(a.c.last("spectate")?.talkLeftMs === aTalk0 || (a.c.last("spectate")?.talkLeftMs ?? 0) >= aTalk0, "…and talking there spends nothing");

  // ---- the ghost key ----------------------------------------------------------------
  console.log("-- the ghost key: granted, then run out");
  b.c.clear();
  a.c.clear();
  a.c.send({ type: "ghost-ptt", on: true });
  const granted = await a.c.waitFor((f) => f.type === "spectate" && f.talking === true, 3000);
  ok(!!granted, "the key down: the server grants the talk");
  const a3 = await until(async () => { const s = await lkSays(room, A); return s?.canPublish ? s : null; }, 3000);
  ok(!!a3, `LiveKit: the dead may publish in the level room for the talk (${JSON.stringify(a3)})`);
  ok(!!(await b.c.waitFor((f) => f.type === "ghost" && f.id === A && f.on, 2000)), "…and the one watched is told a ghost speaks");
  // the ghost's client lets only its target subscribe, then opens its mic
  await vA.only([B]);
  const talk = await vA.tryTalk();
  ok(talk === "ok" && !!(await until(() => vB.hearing(A), 6000)), `the one watched hears the ghost (${talk})`);
  ok(!(await until(() => vC.hearing(A), 2000)), "another living runner does not");
  // the budget runs out on its own
  const out = await until(async () => { const s = await lkSays(room, A); return s && !s.canPublish && s.audio === 0 ? s : null; }, TALK_MS + 4000);
  ok(!!out, `the budget spent, LiveKit takes the right and the track back by itself (${JSON.stringify(out ?? (await lkSays(room, A)))})`);
  ok(!!(await a.c.waitFor((f) => f.type === "spectate" && f.talking === false && f.talkLeftMs === 0, 2000)), "…and the ghost is told it has no voice left");
  ok(!!(await b.c.waitFor((f) => f.type === "ghost" && f.id === A && !f.on, 2000)), "…and the one watched is told it stopped");
  // still holding the key, still trying
  const after = await vA.tryTalk();
  await sleep(1500);
  const a4 = await lkSays(room, A);
  ok(a4 && !a4.canPublish && a4.audio === 0 && !(await vB.hearing(A)), `a spent ghost that keeps trying gets nowhere (${after}; LiveKit ${JSON.stringify(a4)})`);
  a.c.send({ type: "ghost-ptt", on: false });
  await vA.hush();
  a.c.send({ type: "ghost-ptt", on: true });
  await sleep(800);
  ok(!(await lkSays(room, A))?.canPublish && !a.c.last("spectate")?.talking, "the key again with nothing left: no grant");
  a.c.send({ type: "ghost-ptt", on: false });

  // ---- a key let go ----------------------------------------------------------------
  console.log("-- a key let go");
  // D still has a full budget
  d.c.clear();
  d.c.send({ type: "ghost-ptt", on: true });
  ok(!!(await d.c.waitFor((f) => f.type === "spectate" && f.talking === true, 3000)), "another ghost's key: granted");
  ok(!!(await until(async () => (await lkSays(room, D))?.canPublish, 3000)), "…LiveKit lets them publish");
  await sleep(700);
  d.c.send({ type: "ghost-ptt", on: false });
  const rel = await until(async () => { const s = await lkSays(room, D); return s && !s.canPublish ? s : null; }, 3000);
  ok(!!rel, `the key let go: the right goes back at once (${JSON.stringify(rel ?? (await lkSays(room, D)))})`);
  const left = (await d.c.waitFor((f) => f.type === "spectate" && f.talking === false, 2000))?.talkLeftMs ?? 0;
  ok(left > TALK_MS - 2000 && left < TALK_MS, `…and only what was used is spent (${left}ms of ${TALK_MS} left)`);
  // a key down and up before the grant lands leaves nothing open
  d.c.send({ type: "ghost-ptt", on: true });
  d.c.send({ type: "ghost-ptt", on: false });
  await sleep(1200);
  ok(!(await lkSays(room, D))?.canPublish, "a key tapped faster than the grant leaves nothing open");

  // ---- the refill --------------------------------------------------------------------
  console.log("-- the refill");
  const refilled = await a.c.waitFor((f) => f.type === "spectate" && f.talkLeftMs === TALK_MS, REFILL_MS + 3000);
  ok(!!refilled, "the clock refills the ghost's voice");
  a.c.clear();
  a.c.send({ type: "ghost-ptt", on: true });
  ok(!!(await a.c.waitFor((f) => f.type === "spectate" && f.talking === true, 3000)) && !!(await until(async () => (await lkSays(room, A))?.canPublish, 3000)), "…and the key works again");
  a.c.send({ type: "ghost-ptt", on: false });
  await sleep(800);

  // ---- the old token ------------------------------------------------------------
  console.log("-- the token handed out while alive");
  // an edited client reconnects with the publishing token it had before it died
  const vA2 = await voiceClient("A-old-token");
  await vA2.join(gA, true);
  const cut = await until(async () => { const s = await lkSays(room, A); return s && !s.canPublish && s.audio === 0 ? s : null; }, 5000, 150);
  ok(!!cut, `a dead client back with its old living token is cut off within seconds (${JSON.stringify(cut ?? (await lkSays(room, A)))})`);
  ok(!(await until(() => vB.hearing(A), 1500)), "…and the living hear nothing from it");
  await vA2.leave().catch(() => {});

  for (const v of [vA, vB, vC, vD, xA, xD]) await v.leave().catch(() => {});
  await browser.close();
  console.log(`\n${n - bad}/${n} asserts passed`);
  if (bad) console.log("---- server log tail ----\n" + log.split("\n").slice(-30).join("\n") + "\n---- livekit ----\n" + lkLog.split("\n").slice(-20).join("\n"));
  cleanup();
  process.exit(bad ? 1 : 0);
};
run().catch(async (e) => {
  console.error(e);
  console.log("---- server log tail ----\n" + log.split("\n").slice(-30).join("\n") + "\n---- livekit ----\n" + lkLog.split("\n").slice(-20).join("\n"));
  try { await browser?.close(); } catch {}
  cleanup();
  process.exit(1);
});
