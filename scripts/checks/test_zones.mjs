// WHERE IN THE HOUSE (Josh, Aug 2026: "add to status of users what they are
// doing" — the casino floor, the backrooms + level, the escape complex).
//
// The shape under test: each game socket emits `zone.presence` on the bus as
// bodies enter and leave; realtime.ts keeps the merged per-(user, zone)
// picture, DEDUPES no-change reports, broadcasts `zone.state` deltas to every
// app socket, and snapshots the whole map into the `ready` frame so a fresh
// tab knows who's where without waiting for anybody to move.
//
// Driven over the REAL wire on a real server: an app socket watches while a
// second account walks onto the casino floor (/ws-casino), leaves, and then
// no-clips into the backrooms (/ws-game) — the one seam faked is a suit row
// in the locker table, because entry legitimately requires a suit and buying
// one is another harness's business.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8489;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "zones-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return r.body?.token ?? null;
};

/** A watcher/driver on any of the server's sockets. */
const client = (pathName, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${pathName}?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (pred) => [...frames].reverse().find(typeof pred === "string" ? (f) => f.type === pred : pred),
      async waitFor(pred, ms = 3000) {
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

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  ok(alice && bob, "two accounts");
  const aliceId = (await api("GET", "/api/me", { token: alice })).body.user.id;

  // Bob watches from the app socket.
  const watcher = await client("/ws", bob);
  const ready1 = await watcher.waitFor("ready");
  ok(Array.isArray(ready1?.zones) && ready1.zones.length === 0, "a quiet house: the ready snapshot carries no zones");

  // ---- THE CASINO FLOOR -------------------------------------------------------
  const floor = await client("/ws-casino", alice);
  floor.send({ type: "enter", suit: "yellow" });
  const zOn = await watcher.waitFor((f) => f.type === "zone.state" && f.zone === "casino");
  ok(zOn?.userId === aliceId && zOn?.on === true, "walking onto the floor reaches every app socket");

  // A fresh tab learns it from the snapshot, not from luck.
  const late = await client("/ws", bob);
  const ready2 = await late.waitFor("ready");
  ok(ready2?.zones?.some((z) => z.userId === aliceId && z.zone === "casino"),
    "a fresh tab's ready frame already says who is where");
  late.ws.close();

  // A re-enter (same tab or a replacement) must not re-announce.
  watcher.clear();
  floor.send({ type: "enter", suit: "yellow" });
  await sleep(300);
  ok(!watcher.last("zone.state"), "a no-change report stays off the wire (dedupe)");

  floor.send({ type: "leave" });
  const zOff = await watcher.waitFor((f) => f.type === "zone.state" && f.zone === "casino" && f.on === false);
  ok(zOff?.userId === aliceId, "leaving the floor clears the line");

  // ---- THE BACKROOMS ----------------------------------------------------------
  // Entry legitimately requires a suit; the harness plants one locker row
  // (the one faked seam — buying gear is another harness's business).
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)")
    .run(aliceId, Date.now());
  const suitId = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ?").get(aliceId).id;
  db.close();

  watcher.clear();
  const game = await client("/ws-game", alice);
  game.send({ type: "enter", door: 0, loadout: [suitId], level: 0 });
  const welcome = await game.waitFor("welcome");
  ok(welcome?.level === 0, "the body is inside (level 0 welcome)");
  const zBr = await watcher.waitFor((f) => f.type === "zone.state" && f.zone === "backrooms");
  ok(zBr?.userId === aliceId && zBr?.on === true, "no-clipping in reaches the roster wire");
  ok(zBr?.detail === "level0", `…with the level on it (detail=${zBr?.detail})`);

  // The socket dying ends the LINE even though the session freezes — the
  // roster tracks the live player, not the saved body.
  watcher.clear();
  game.ws.close();
  const zBrOff = await watcher.waitFor((f) => f.type === "zone.state" && f.zone === "backrooms" && f.on === false);
  ok(zBrOff?.userId === aliceId, "a dead game socket clears the line (the frozen body doesn't haunt the roster)");

  watcher.ws.close();
  floor.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} zone asserts passed`);
    process.exit(bad ? 1 : 0);
  });
