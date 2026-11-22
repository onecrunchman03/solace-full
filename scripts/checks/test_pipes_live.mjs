// PIPE DREAMS, SERVED — Level 2 over the real /ws-game wire on a real server.
//
// Josh, Sep 2026: "always let the admin playtest the map with the ability to
// fly around like in the other levels". So the level is shut to everyone
// until its door opens — EXCEPT the admin, who can walk (and fly) it from day
// one. What this proves: the frozen D3 boots verified; a member is refused
// and the admin let in; the welcome describes a 256² world with its one door;
// chunks stream Level 2's own geometry and deco (and never another level's);
// the flycam works down here; the operator's map and the status desk carry
// Level 2; the drain is the only way out; and the roster reads the level.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { generatePipesSector, SECTOR_D, PDECO } = require(path.join(ROOT, "dist", "backrooms", "worldgen-pipes.js"));
const PORT = 8517;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "pipes-live-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
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

const client = (pathName, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${pathName}?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
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

const run = async () => {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  ok(/Sector D3 verified \(256×256, seed 20260928\)/.test(log), "the frozen D3 boots verified");

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const member = (await api("POST", "/api/register", {
    body: { username: "piper", password: "Sturdy!Passw0rd#9", displayName: "piper", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  ok(admin && member, "an admin and a member");
  const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;
  const memberId = (await api("GET", "/api/me", { token: member })).body.user.id;

  // Both get a suit (the one faked seam — buying gear is another harness's job).
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  for (const uid of [adminId, memberId]) {
    db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
  }
  const suitOf = (uid) => db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid).id;

  // ---- the door is shut to everyone but the operator
  const st0 = await api("GET", "/api/backrooms/status", { token: member });
  ok(st0.body?.level2Open === false, "Pipe Dreams reads closed on the status desk");
  ok(st0.body?.pipesDoors?.length === 1 && st0.body.pipesDoors[0].name === "The Drain", "…which lists its one entrance, The Drain");
  const mg = await client("/ws-game", member);
  mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: 2 });
  const denied = await mg.waitFor("denied");
  ok(denied?.error === "pipes_locked", `a member is refused (${denied?.error})`);
  mg.ws.close();

  const watcher = await client("/ws", member);
  await watcher.waitFor("ready");
  watcher.clear();
  const ag = await client("/ws-game", admin);
  ag.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 2 });
  const w = await ag.waitFor("welcome");
  ok(w?.level === 2, "the admin is let in: a level-2 welcome");
  const sector = generatePipesSector(SECTOR_D.seed, SECTOR_D.size);
  ok(w?.size === 256 && w?.doors?.length === 1 && w.doors[0].name === "The Drain", "the welcome describes a 256² world with one door");
  ok(Math.abs(w?.you?.x - (sector.doors[0].x + 0.5)) < 0.01 && Math.abs(w?.you?.y - (sector.doors[0].y + 0.5)) < 0.01, "you arrive at the drain");
  ok(w?.districts?.some((d) => d.type === "pipegallery") && w.districts.some((d) => d.type === "enginehall"), "the district list is Pipe Dreams'");
  const zone = await watcher.waitFor((f) => f.type === "zone.state" && f.zone === "backrooms");
  ok(zone?.detail === "pipes", `the roster reads the level (detail=${zone?.detail})`);

  // ---- chunks are Level 2's own
  const cx = Math.floor(sector.doors[0].x / 16);
  const cy = Math.floor(sector.doors[0].y / 16);
  ag.send({ type: "chunks", want: [{ cx, cy }] });
  const ch = await ag.waitFor((f) => f.type === "chunk" && f.cx === cx && f.cy === cy);
  ok(ch?.level === 2, "the chunk is stamped level 2");
  let same = !!ch;
  if (ch) {
    for (let y = 0; y < 16 && same; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (cy * 16 + y) * 256 + cx * 16 + x;
        const j = y * 16 + x;
        if (ch.solid[j] !== sector.solid[i] || ch.floor[j] !== sector.floor[i] || ch.wallN[j] !== sector.wallN[i] || ch.deco[j] !== sector.deco[i]) { same = false; break; }
      }
    }
  }
  ok(same, "…and matches D3 cell for cell, deco included");
  ok(ch?.deco?.some((c) => c >> 4 === PDECO.hatch), "the drain hatch is in the arrival chunk");
  ok(!ch?.water, "no water rides a Pipe Dreams chunk");

  // ---- the flycam
  ag.send({ type: "fly", on: true });
  const fly = await ag.waitFor((f) => f.type === "fly");
  ok(fly && fly.ok !== false, "the admin can take off (flycam) down here");
  let doorCell = 0;
  for (let i = 0; i < sector.deco.length; i++) if (sector.deco[i] >> 4 === PDECO.exitdoor) doorCell = i;
  const fcx = Math.floor((doorCell % 256) / 16);
  const fcy = Math.floor(Math.floor(doorCell / 256) / 16);
  ag.send({ type: "move", x: (doorCell % 256) + 0.5, y: Math.floor(doorCell / 256) + 0.5, h: 0, p: 0 });
  await sleep(200);
  ag.send({ type: "chunks", want: [{ cx: fcx, cy: fcy }] });
  const farCh = await ag.waitFor((f) => f.type === "chunk" && f.cx === fcx && f.cy === fcy);
  ok(!!farCh && farCh.deco.some((c) => c >> 4 === PDECO.exitdoor), "flown across the map, the pressure door's chunk streams");

  // ---- THE STAIRS stream with their chunk (Oct 2026: real steps are drawn
  // from the chunk's stair directions — stairs.ts)
  {
    const sc = sector.stair ? sector.stair.findIndex((v) => v >= 0) : -1;
    ok(sc >= 0, `D3 carries its stair cells on the map (${sector.stair ? [...sector.stair].filter((v) => v >= 0).length : 0})`);
    if (sc >= 0) {
      const scx = Math.floor((sc % 256) / 16);
      const scy = Math.floor(Math.floor(sc / 256) / 16);
      ag.send({ type: "move", x: (sc % 256) + 0.5, y: Math.floor(sc / 256) + 0.5, h: 0, p: 0 });
      await sleep(200);
      ag.send({ type: "chunks", want: [{ cx: scx, cy: scy }] });
      const stCh = await ag.waitFor((f) => f.type === "chunk" && f.cx === scx && f.cy === scy);
      let same = !!stCh?.stair;
      for (let y = 0; y < 16 && same; y++) for (let x = 0; x < 16; x++) {
        const gx = scx * 16 + x, gy = scy * 16 + y;
        if ((stCh.stair[y * 16 + x] ?? -1) !== (gx < 256 && gy < 256 ? sector.stair[gy * 256 + gx] : -1)) same = false;
      }
      ok(same, "…and a chunk holding a stair carries every stair's direction, matching the map cell for cell");
    } else ok(false, "…and a chunk holding a stair carries every stair's direction");
  }

  // ---- the operator's map + the drain is the only way out
  const map = await api("GET", "/api/backrooms/map?level=2", { token: admin });
  ok(map.status === 200 && map.body?.level === 2 && map.body?.sector === "D3" && map.body?.size === 256, "the operator's map serves Level 2");
  ok(map.body?.landmarks?.some((l) => l.name === "The Valve Gallery") && map.body?.debug && map.body.doors?.[0]?.name === "The Drain", "…the whole plan, with the operator overlay and the drain as the level's door");
  ok(map.body?.debug?.door === null, "…and no onward door drawn where there isn't one (the drain is the level's own door, not THE DOOR)");
  ag.send({ type: "exit" });
  const refused = await ag.waitFor("exitDenied");
  ok(refused?.error === "not_at_door", "you can't leave from the far end of the level");
  ag.send({ type: "fly", on: false });
  await sleep(100);
  ag.send({ type: "fly", on: true });
  await sleep(100);
  ag.send({ type: "move", x: sector.doors[0].x + 0.5, y: sector.doors[0].y + 0.5, h: 0, p: 0 });
  await sleep(200);
  ag.clear();
  ag.send({ type: "exit" });
  const debrief = await ag.waitFor("debrief");
  ok(!!debrief, "at the drain, the exit takes you home");

  // ---- a run left standing (Josh, Sep 2026: "I cannot access the pool rooms
  // it just takes me to the backrooms"). Leaving without an exit freezes the
  // run and any door resumes it on ITS level — the hub must say so.
  const st1 = await api("GET", "/api/backrooms/status", { token: admin });
  ok(st1.body?.myRun === null, "after the exit, no run is waiting");
  ag.ws.close();
  await sleep(150);
  const ag2 = await client("/ws-game", admin);
  ag2.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 2 });
  await ag2.waitFor("welcome");
  ag2.ws.close(); // walked away without an exit
  await sleep(300);
  const st2 = await api("GET", "/api/backrooms/status", { token: admin });
  ok(st2.body?.myRun?.level === 2 && st2.body.myRun.waiting === true && st2.body.myRun.lostInMs > 0, `the hub is told the run is still waiting, and for how long (${JSON.stringify(st2.body?.myRun)})`);
  const st3 = await api("GET", "/api/backrooms/status", { token: member });
  ok(st3.body?.myRun === null, "…and nobody else is told about it");
  const ag3 = await client("/ws-game", admin);
  ag3.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: 0 });
  const back = await ag3.waitFor("welcome");
  ok(back?.level === 2, "any door picks the waiting run back up where it stands");
  ag3.send({ type: "forfeit" });
  await sleep(200);
  ag3.ws.close();

  // ---- the other levels are untouched
  const l0 = await api("GET", "/api/backrooms/map?level=0", { token: admin });
  ok(l0.body?.level === 0 && l0.body?.size === 182, "Level 0's map is still Level 0");
  const l1 = await api("GET", "/api/backrooms/map?level=1", { token: admin });
  ok(l1.body?.level === 1 && l1.body?.size === 288, "Level 1's map is still the Poolrooms");

  db.close();
  watcher.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    console.log(`\n${n - bad}/${n} asserts passed`);
    process.exit(bad ? 1 : 0);
  });
