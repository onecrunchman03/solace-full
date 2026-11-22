// LAW 10 — PROXIMITY CHAT WORKS ON EVERY LEVEL. Over a real server, plus the
// client's mixing rule as pure arithmetic.
//
// THE BACKROOMS LAWS (CLAUDE.md), Josh 2026-10-09: "Proximity chat works on
// every level." Nothing local runs LiveKit, but nothing has to for most of
// it: the voice TOKEN is signed by this server with whatever key it is given
// (no call to the SFU), and the token is where the room lives — so who may
// speak, and in which room, is checkable here. So is the walkie, which is
// our own wire. And how a voice SOUNDS at a distance is client/src/backrooms/
// voicemix.ts, pure, imported straight into this file.
//
// What is pinned:
//  · THE DOOR: no token for a stranger, nor for a member outside the game;
//  · ONE ROOM PER LEVEL, all five: two runners on a level share a room, and
//    every level's room is its own (a voice on Level 0 never reaches Level 3);
//    the token is the runner's own identity, may publish and listen, and may
//    not send data;
//  · THE DEAD KEEP THEIR EARS: a spectator still gets the level's room, and
//    loses it when there is nobody left to watch;
//  · THE WALKIE: heard by the same channel on the same level, wherever they
//    stand; not on another level, not on another channel, not without a
//    radio; and "off" reaches every carrier, so a radio can't be left keyed;
//  · THE MIX: silent past the gate, the gate inside the position wire, walls
//    eating level and band, the air dulling a far voice, the ring growing
//    with distance and never past its cap.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { WebSocket } from "ws";
import { voiceMix, HARD_GATE_M, WALL_GAIN, WET_MAX } from "../../client/src/backrooms/voicemix.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8541;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "proximity-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the mix, first: pure, no server ------------------------------------------
console.log("-- how a voice sounds at a distance (voicemix.ts)");
{
  const src = readFileSync(path.join(ROOT, "client/src/backrooms/voicechat.ts"), "utf8");
  ok(/from "\.\/voicemix"/.test(src) && /voiceMix\(dist, info\.walls, hardGate, roomMix\)/.test(src) && !/Math\.pow\(0\.45, info\.walls\)/.test(src),
    "the game mixes every living voice through voicemix.ts (no second copy of the rule in voicechat.ts)");
  const net = readFileSync(path.join(ROOT, "src/backrooms/net.ts"), "utf8");
  const nearby = Number(net.match(/const NEARBY_CELLS = (\d+)/)?.[1]);
  ok(nearby * 2 > HARD_GATE_M, `the gate (${HARD_GATE_M}m) sits inside the position wire (${nearby} cells = ${nearby * 2}m) — no voice without a place to put it`);
  ok(voiceMix(HARD_GATE_M + 0.01, 0).silent && !voiceMix(HARD_GATE_M, 0).silent, "silent one step past the gate, heard at it");
  ok(voiceMix(Infinity, 0).silent && voiceMix(NaN, 0).silent, "no distance to speak of (unknown, infinite) is silence, never full volume");
  const near = voiceMix(1, 0);
  ok(near.dry === 1 && near.cutoff === 18000, "arm's length, open floor: full level, full band");
  let monoDry = true, monoCut = true;
  for (let w = 0; w < 5; w++) {
    const a = voiceMix(10, w), b = voiceMix(10, w + 1);
    if (!(b.dry < a.dry)) monoDry = false;
    if (!(b.cutoff <= a.cutoff)) monoCut = false;
  }
  ok(monoDry && Math.abs(voiceMix(10, 1).dry - WALL_GAIN) < 1e-9, `every wall eats level (×${WALL_GAIN} each, ~7dB)`);
  ok(monoCut && voiceMix(10, 1).cutoff <= 900, "…and dulls the band — one wall already reads as next door");
  let airMono = true;
  for (let d = 8; d < HARD_GATE_M; d += 2) if (voiceMix(d + 2, 0).cutoff > voiceMix(d, 0).cutoff) airMono = false;
  ok(airMono && voiceMix(8 + HARD_GATE_M / 4, 0).cutoff === 9000, "the air dulls a far voice: half the band every quarter of the gate past 8m");
  let wetMono = true, wetCap = true;
  for (let d = 0; d <= HARD_GATE_M; d += 1) {
    for (const room of [0, 0.5, 1]) {
      const m = voiceMix(d, 0, HARD_GATE_M, room);
      if (m.wet > WET_MAX + 1e-9) wetCap = false;
      if (d > 0 && m.wet < voiceMix(d - 1, 0, HARD_GATE_M, room).wet - 1e-9) wetMono = false;
    }
  }
  ok(wetMono && wetCap, `the room rings more the farther the voice, never past ${WET_MAX}`);
  ok(voiceMix(30, 0, HARD_GATE_M, 1).wet > voiceMix(30, 0, HARD_GATE_M, 0).wet, "a big hall rings more than a corridor at the same distance");
  ok(!voiceMix(65, 0, 70).silent && voiceMix(71, 0, 70).silent, "a world may set its own gate (the casino floor's 70m)");
}

const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    // signing credentials only — a token is minted locally, no SFU is called
    LIVEKIT_URL: "ws://127.0.0.1:1",
    LIVEKIT_API_KEY: "harnesskey",
    LIVEKIT_API_SECRET: "harness-secret-harness-secret-harness-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });

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
/** The token's claims — the room, the identity, the grants. */
const claims = (jwt) => {
  try { return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8")); } catch { return null; }
};

const run = async () => {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const reg = async (u) => (await api("POST", "/api/register", {
    body: { username: u, password: "Sturdy!Passw0rd#9", displayName: u, secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  const tA = await reg("talker");
  const tB = await reg("listener");
  const tC = await reg("downstairs");
  const tAdm = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(tA && tB && tC && tAdm, "three runners and the operator");
  const id = async (t) => (await api("GET", "/api/me", { token: t })).body.user.id;
  const [A, B, C, ADM] = [await id(tA), await id(tB), await id(tC), await id(tAdm)];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const give = (uid, kind, color = null) =>
    Number(db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, ?, 0, ?, ?)").run(uid, kind, color, Date.now()).lastInsertRowid);
  // the Poolrooms open to members, so a second level has living people on it
  db.prepare("INSERT OR IGNORE INTO backrooms_flags (flag, userId, name, at) VALUES ('level1_unlocked', NULL, 'harness', ?)").run(Date.now());
  const enter = async (t, uid, level = 0, extra = []) => {
    const c = await client(t);
    c.send({ type: "enter", door: 0, loadout: [give(uid, "suit", "yellow"), ...extra], level });
    const w = await c.waitFor("welcome", 6000);
    return { c, w };
  };
  const leave = async (c) => {
    c.send({ type: "forfeit" });
    await c.waitFor("dead", 3000);
    await sleep(300);
    c.ws.close();
    await sleep(300);
  };
  const tokenFor = async (t) => api("POST", "/api/backrooms/voice-token", { token: t });

  // ---- the door ------------------------------------------------------------------
  console.log("-- who may speak");
  ok((await api("POST", "/api/backrooms/voice-token")).status === 401, "a stranger: 401");
  const outside = await tokenFor(tA);
  ok(outside.status === 403 && outside.body?.error === "not_inside", "a member who isn't in the game: 403 not_inside (no listening in from the hub)");

  // ---- one room per level -----------------------------------------------------
  console.log("-- one room per level");
  const a = await enter(tA, A, 0, [give(A, "walkie")]);
  const b = await enter(tB, B, 0, [give(B, "walkie")]);
  ok(a.w && b.w, "two runners on Level 0");
  const ta = await tokenFor(tA), tb = await tokenFor(tB);
  const ca = claims(ta.body?.token), cb = claims(tb.body?.token);
  ok(ta.status === 200 && ca?.video?.room && ca.video.room === cb?.video?.room, `both get the same room (${ca?.video?.room})`);
  ok(ca?.video?.room === ta.body?.room && ta.body?.url === "ws://127.0.0.1:1", "the response names the room it signed and the voice server's address");
  ok(ca?.sub === String(A) && cb?.sub === String(B), "each token speaks as its own runner, nobody else");
  ok(ca?.video?.roomJoin === true && ca.video.canPublish === true && ca.video.canSubscribe === true, "…may join, speak and listen");
  ok(ca?.video?.canPublishData === false, "…and may not send data over the voice server (the game wire is ours)");

  const rooms = new Map([[0, ca?.video?.room]]);
  // the operator walks every level; a member walks the Poolrooms too
  const c1 = await enter(tC, C, 1, [give(C, "walkie")]);
  ok(!!c1.w && c1.w.level === 1, "a runner in the Poolrooms");
  const t1 = claims((await tokenFor(tC)).body?.token);
  rooms.set(1, t1?.video?.room);
  for (const lvl of [2, 3, 4]) {
    const adm = await enter(tAdm, ADM, lvl);
    ok(!!adm.w && adm.w.level === lvl, `the operator on Level ${lvl}`);
    rooms.set(lvl, claims((await tokenFor(tAdm)).body?.token)?.video?.room);
    await leave(adm.c);
  }
  const names = [...rooms.values()];
  ok(names.length === 5 && names.every((r) => typeof r === "string" && r.startsWith("backrooms_")) && new Set(names).size === 5,
    `every level its own room — ${names.join(" · ")}`);
  ok((await tokenFor(tAdm)).status === 403, "out of the game again: no room");

  // ---- the walkie ---------------------------------------------------------------
  console.log("-- the walkie");
  const adm0 = await enter(tAdm, ADM, 0, [give(ADM, "walkie")]);
  ok(!!adm0.w, "the operator on Level 0 with a radio on another channel");
  adm0.c.send({ type: "walkie-ch", ch: 2 });
  await sleep(200);
  b.c.clear(); c1.c.clear(); adm0.c.clear();
  a.c.send({ type: "walkie-tx", on: true });
  const heard = await b.c.waitFor((f) => f.type === "walkie" && f.id === A && f.on === true, 2000);
  ok(!!heard, "keyed: the same channel on the same level hears it, wherever they stand");
  await sleep(300);
  ok(!c1.c.last((f) => f.type === "walkie" && f.id === A && f.on), "…not a radio on another level (the levels are cut off from each other)");
  ok(!adm0.c.last((f) => f.type === "walkie" && f.id === A && f.on), "…not a radio on another channel");
  c1.c.clear();
  a.c.send({ type: "walkie-tx", on: false });
  ok(!!(await b.c.waitFor((f) => f.type === "walkie" && f.id === A && f.on === false, 2000)), "let go: the channel hears it stop");
  ok(!!(await c1.c.waitFor((f) => f.type === "walkie" && f.id === A && f.on === false, 2000)),
    "…and so does every carrier on the channel, any level — a radio can never be left keyed open");
  // a runner with no radio cannot key one
  b.c.clear();
  const noRadio = await reg("handsfree");
  const NR = await id(noRadio);
  const nr = await enter(noRadio, NR, 0);
  ok(!!nr.w, "a runner with no radio on Level 0");
  nr.c.send({ type: "walkie-tx", on: true });
  await sleep(500);
  ok(!b.c.last((f) => f.type === "walkie" && f.id === NR), "no radio, no transmission");

  // ---- the dead keep their ears ---------------------------------------------------
  console.log("-- the dead");
  b.c.clear();
  b.c.send({ type: "forfeit" });
  const sp = await b.c.waitFor((f) => f.type === "spectate" && !f.none, 4000);
  ok(!!sp, "a runner dies with others alive and watches");
  const tSpec = await tokenFor(tB);
  ok(tSpec.status === 200 && claims(tSpec.body?.token)?.video?.room === rooms.get(0),
    "…and still gets the level's room — a refresh while watching must not cost the dead their ears");
  await leave(a.c);
  await leave(nr.c);
  await leave(adm0.c);
  await sleep(800);
  const tGone = await tokenFor(tB);
  ok(tGone.status === 403, "nobody left alive on the level: the watch ends, and so does the room");
  try { b.c.ws.close(); } catch {}
  await leave(c1.c);

  db.close();
  console.log(`\ntest_proximity: ${n - bad}/${n} asserts passed`);
  if (bad) {
    console.log("--- server log (tail) ---\n" + log.split("\n").slice(-30).join("\n"));
    process.exitCode = 1;
  }
};

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { srv.kill("SIGINT"); } catch {} setTimeout(() => process.exit(), 300); });
