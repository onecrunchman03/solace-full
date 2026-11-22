// THE RUNNER NEVER SNAPS BACK ON OPEN FLOOR (Oct 2026 — Josh: "i'll be
// running forward and suddenly i teleport back where i was like a desync").
//
// The server validates every move frame and answers a refused one with
// "correct", which drops the runner back where the server last accepted them.
// Two rules refused LEGAL running:
//   · the spam guard dropped any frame under 40ms after the last, and a
//     network hiccup delivers a client's 10Hz frames in a bunch — it kept the
//     OLDEST of the burst, so the next accepted frame had to cover the whole
//     gap at once (net.ts MOVE_BURST is a bucket now);
//   · the cell check refused any step crossing two cell lines on an axis,
//     however open the floor (service.ts moveAllowed walks the line now).
// This pins both, in-process and over the real /ws-game wire — and pins
// that walls, height and the per-message cap still refuse what they should.
// The Rules Director re-times Level 0 on its own clock; run-all turns it off
// so a creature harness pins the creature's OWN rules — a solo run must too.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));
const { heightPassable, isPitCell } = require(dist("backrooms/worldgen.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DB = path.join(ROOT, "data", "move-sync-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
const store = new Store(DB);
const br = createBackrooms(store);
const sec = br.sector;
const SIZE = sec.size;
const idx = (x, y) => y * SIZE + x;
const walkable = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !sec.solid[idx(x, y)] && !sec.background[idx(x, y)] && !isPitCell(sec, x, y);
const eff = (x, y) => (sec.eff ?? sec.floor)[idx(x, y)];
/** The step east from (x,y) to (x+1,y), by the service's rules. */
const eastOpen = (x, y) => walkable(x, y) && walkable(x + 1, y) && heightPassable(eff(x, y), eff(x + 1, y)) && !sec.wallW[idx(x + 1, y)];

// a straight run of open floor eastward, at least `len` cells
const findRun = (len) => {
  for (let y = 2; y < SIZE - 2; y++) {
    for (let x = 2; x < SIZE - len - 2; x++) {
      let k = 0;
      while (k < len && eastOpen(x + k, y)) k++;
      if (k >= len) return { x, y };
    }
  }
  return null;
};
// a wall east of an open cell, with open floor on its far side
const findWall = () => {
  for (let y = 2; y < SIZE - 2; y++) {
    for (let x = 2; x < SIZE - 4; x++) {
      if (walkable(x, y) && !eastOpen(x, y) && walkable(x + 2, y) && eastOpen(x + 1, y)) return { x, y };
    }
  }
  return null;
};
let nextId = 900;
const mk = (x, y) => ({
  userId: nextId++, name: "runner" + nextId, x, y, heading: 0, door: 0,
  enteredAt: Date.now(), lastMoveAt: Date.now() - 100, revealed: 0, inventory: [],
  relics: [], hasKey: false, hp: 100, cam: false, pose: 0, bestShot: Infinity,
  lostAt: null, fly: false, level: 0, subSince: null, boatId: null, fall: null, equip: undefined,
});

console.log("-- the rules, in-process");
const run = findRun(10);
ok(!!run, `(staging) a straight run of open floor (${run ? run.x + "," + run.y : "none"})`);
{
  const s = mk(run.x + 0.5, run.y + 0.5);
  br.sessions.set(s.userId, s);
  let corrected = 0;
  for (let i = 1; i <= 20; i++) {
    const r = br.move(s.userId, run.x + 0.5 + i * 0.285, run.y + 0.5, 0);
    if (r?.corrected) corrected++;
  }
  ok(corrected === 0, `a sprint at 10Hz down open floor: no refusals (${corrected})`);
  // after a hiccup the next frame covers several frames' worth at once
  s.x = run.x + 0.9;
  const r = br.move(s.userId, run.x + 2.2, run.y + 0.5, 0);
  ok(r && !r.corrected, `one 1.3-cell step down open floor, crossing two cell lines, is accepted (${r?.corrected ? "refused" : "ok"})`);
  s.x = run.x + 0.5;
  const far = br.move(s.userId, run.x + 2.4, run.y + 0.5, 0);
  ok(far?.corrected === true, "a step over the per-message cap is still refused, open floor or not");
  br.sessions.delete(s.userId);
}
{
  const w = findWall();
  ok(!!w, `(staging) a wall with floor beyond it (${w ? w.x + "," + w.y : "none"})`);
  const s = mk(w.x + 0.8, w.y + 0.5);
  br.sessions.set(s.userId, s);
  const r = br.move(s.userId, w.x + 2.1, w.y + 0.5, 0);
  ok(r?.corrected === true && s.x === w.x + 0.8, "a multi-cell step THROUGH a wall is refused, the body left where it stood");
  const r1 = br.move(s.userId, w.x + 1.1, w.y + 0.5, 0);
  ok(r1?.corrected === true, "…and so is the one-cell step into it (the old rule, unchanged)");
  br.sessions.delete(s.userId);
}
store.close?.();

// ---- over the real wire: a burst of delayed frames ------------------------------
console.log("-- over the wire: frames delivered in a bunch");
const PORT = 8547;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "move-sync-wire");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const srv = spawn(process.execPath, [dist("index.js")], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: "Harness!Admin9xy", ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
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
      async waitFor(pred, ms = 6000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = [...frames].reverse().find(pred);
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

for (let i = 0; i < 200; i++) {
  try { if ((await fetch(BASE + "/health")).ok) break; } catch {}
  await sleep(250);
}
const tok = (await api("POST", "/api/register", { body: { username: "burstrunner", password: "Sturdy!Passw0rd#9", displayName: "burst", secret: "vault marmalade lantern quartz 47", acceptTerms: true } })).body?.token;
const uid = (await api("GET", "/api/me", { token: tok })).body.user.id;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
const suit = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid).id;
const c = await client(tok);
c.send({ type: "enter", door: 0, loadout: [suit], level: 0 });
const w = await c.waitFor((f) => f.type === "welcome");
ok(!!w, "a runner on Level 0");
// walk to the start of an open run the long way round is not needed: find a
// straight open line from where the runner stands
const sx = w.you.x, sy = w.you.y;
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const stepOpen = (x, y, dx, dy) => {
  const bx = x + dx, by = y + dy;
  if (!walkable(bx, by) || !heightPassable(eff(x, y), eff(bx, by))) return false;
  if (dx === 1) return !sec.wallW[idx(bx, by)];
  if (dx === -1) return !sec.wallW[idx(x, y)];
  if (dy === 1) return !sec.wallN[idx(bx, by)];
  return !sec.wallN[idx(x, y)];
};
let dir = null;
for (const [dx, dy] of dirs) {
  let k = 0;
  let cx = Math.floor(sx), cy = Math.floor(sy);
  while (k < 4 && stepOpen(cx, cy, dx, dy)) { cx += dx; cy += dy; k++; }
  if (k >= 4) { dir = [dx, dy]; break; }
}
ok(!!dir, `(staging) open floor ahead of the arrival (${dir ? dir.join(",") : "none"})`);
const STEP = 0.285; // a 10Hz frame at a sprint
let px = sx, py = sy;
const frame = () => { px += dir[0] * STEP; py += dir[1] * STEP; c.send({ type: "move", x: px, y: py, h: 0, p: 0 }); };
c.frames.length = 0;
await sleep(150);
// a hiccup: six frames held up and delivered together
for (let i = 0; i < 6; i++) frame();
await sleep(120);
frame(); // and the client carries on at 10Hz
await sleep(120);
frame();
await sleep(600);
const corr = c.frames.filter((f) => f.type === "correct");
ok(corr.length === 0, `six frames delivered in a bunch, then the run carries on: no snap back (${corr.length} corrections${corr.length ? " — to " + corr.map((f) => f.x.toFixed(2) + "," + f.y.toFixed(2)).join(" ") : ""})`);
// a client SPAMMING (not a hiccup) still runs out of allowance: a hundred
// frames at once, then one far ahead of the last the server could take
c.frames.length = 0;
const base = { x: px, y: py };
for (let i = 0; i < 100; i++) c.send({ type: "move", x: base.x, y: base.y, h: i * 0.001, p: 0 });
await sleep(50);
c.send({ type: "move", x: base.x + dir[0] * 9, y: base.y + dir[1] * 9, h: 0, p: 0 });
await sleep(500);
ok(c.frames.some((f) => f.type === "correct"), "a hundred frames at once are throttled, and a jump after them is still refused");

c.ws.close();
console.log(`\n${n - bad}/${n} asserts passed`);
if (bad) console.log(log.split("\n").slice(-15).join("\n"));
process.exit(bad ? 1 : 0);
