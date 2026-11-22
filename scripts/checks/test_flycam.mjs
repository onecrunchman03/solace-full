// THE ADMIN FLYCAM, ON EVERY LEVEL — over a real server and the real
// /ws-game wire (Josh, Oct 2026: "make sure as the admin i am able to fly in
// every map and see all monster, relics, objectives, and hard drives").
//
// BACKROOMS.md described a 28-assert test_flycam.mjs for months; it was never
// on disk. This is it, widened to every level:
//   · THE WAY IN: the admin walks into every level before its door is open
//     (the Poolrooms used to refuse him — Pipe Dreams never did), while a
//     member is still refused.
//   · TAKE-OFF on every level, and the OPERATOR VIEW streamed to the flyer
//     once a second ("op"): every monster, relic, lore drive and objective
//     on that level — the same view the operator's map now draws — agreeing
//     with the map route item for item, each objective where the level's
//     rules put it (L0 key + THE DOOR, L1 Landing + key + drain hatch +
//     alligators, L2 three fuses + the fuse box + the pressure door).
//   · A MEMBER gets none of it: no op frame, no operator view on the map, and
//     a forged fly frame refused.
//   · LANDING is refused over a wall by the SERVER too, and allowed on floor.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8521;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "flycam-harness");
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

const LEVELS = [
  { level: 0, name: "Level 0, the Lobby", kinds: ["key", "door"], monsters: ["entity"], drives: true },
  { level: 1, name: "Level 1, the Poolrooms", kinds: ["landing", "key", "hatch"], monsters: ["gator"], drives: true },
  { level: 2, name: "Level 2, Pipe Dreams", kinds: ["fuse", "fusebox", "door"], monsters: [], drives: true },
  { level: 3, name: "Level 3, the Electrical Station", kinds: ["breaker", "cutoff", "shutter", "landing"], monsters: [], drives: true },
  { level: 4, name: "Level 4, the Abandoned Office", kinds: ["lift", "keycard", "stairdoor"], monsters: [], drives: true },
  { level: 5, name: "Level 5, the Terror Hotel", kinds: ["stair", "register", "boilerkey", "rustydoor", "lift"], monsters: ["moths"], drives: true },
  // the Listener comes only for somebody walking down there — a flyer alone
  // never brings it (test_listener proves it on the map once somebody is);
  // no relics until Josh's pictures
  { level: 6, name: "Level 6, Lights Out", kinds: ["stair", "handwheel", "seahatch"], monsters: [], drives: true },
  // the thing below is always on the operator's map: asleep in the Drop, or
  // under whoever it has noticed
  { level: 7, name: "Level 7, Thalassophobia", kinds: ["stair", "helmet", "subway"], monsters: ["deep"], drives: true },
  // the Burrowers surface only for somebody walking down there — a flyer
  // alone never brings them (test_burrower puts them on the map)
  { level: 8, name: "Level 8, the Cave System", kinds: ["stair", "rope", "chimney"], monsters: [], drives: true },
  // the Watch walks only for somebody on foot — a flyer alone never brings it
  // (test_watch puts it on the map)
  { level: 9, name: "Level 9, the Suburbs", kinds: ["stair", "housekey", "frontdoor"], monsters: [], drives: true },
];

const run = async () => {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const member = (await api("POST", "/api/register", {
    body: { username: "glider", password: "Sturdy!Passw0rd#9", displayName: "glider", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  })).body?.token;
  ok(admin && member, "an admin and a member");
  const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;
  const memberId = (await api("GET", "/api/me", { token: member })).body.user.id;
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  for (const uid of [adminId, memberId]) {
    db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(uid, Date.now());
  }
  const suitOf = (uid) => db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(uid).id;

  // ---- a member: refused the locked levels, never sent the operator's view
  console.log("-- a member");
  for (const [lvl, err] of [[1, "pools_locked"], [2, "pipes_locked"], [3, "station_locked"], [4, "office_locked"], [5, "hotel_locked"], [6, "lights_locked"], [7, "ocean_locked"], [8, "cave_locked"], [9, "suburbs_locked"]]) {
    const mg = await client("/ws-game", member);
    mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: lvl });
    const d = await mg.waitFor("denied");
    ok(d?.error === err, `refused Level ${lvl} while its door is shut (${d?.error})`);
    mg.ws.close();
  }
  const mg = await client("/ws-game", member);
  mg.send({ type: "enter", door: 0, loadout: [suitOf(memberId)], level: 0 });
  const mw = await mg.waitFor("welcome");
  ok(mw?.level === 0, "walks into Level 0");
  mg.send({ type: "fly", on: true });
  const mf = await mg.waitFor("fly");
  ok(mf?.ok === false, `a forged fly frame is refused (${mf?.error})`);
  await sleep(2600);
  ok(!mg.frames.some((f) => f.type === "op"), "…and no operator view ever reaches a member's socket");
  const mmap = await api("GET", "/api/backrooms/map?level=0", { token: member });
  ok(mmap.status === 200 && !("operator" in (mmap.body ?? {})) && !("debug" in (mmap.body ?? {})), "the member's map carries no operator view");
  mg.ws.close();

  // ---- the admin, every level
  for (const L of LEVELS) {
    console.log(`-- ${L.name}`);
    const ag = await client("/ws-game", admin);
    ag.send({ type: "enter", door: 0, loadout: [suitOf(adminId)], level: L.level });
    const w = await ag.waitFor("welcome", 6000);
    ok(w?.level === L.level, `the admin walks in${L.level ? " before its door is open" : ""}`);
    if (!w) { ag.ws.close(); continue; }

    ag.send({ type: "fly", on: true });
    const f = await ag.waitFor("fly");
    ok(f?.ok !== false && f?.on === true, "…and takes off");
    const op = await ag.waitFor("op", 3500);
    ok(!!op?.view && op.view.level === L.level, "the operator view streams to the flyer, for this level");
    await sleep(1200); // creatures place on their first tick; take the freshest view
    const v = ag.last("op")?.view ?? op?.view;
    const map = await api("GET", `/api/backrooms/map?level=${L.level}`, { token: admin });
    const mv = map.body?.operator;
    ok(!!mv, "the operator's map carries the same view");
    if (!v || !mv) { ag.ws.close(); continue; }

    if (L.relics === false) ok(v.relics.length === 0 && mv.relics.length === 0, "no relics on this level yet, and none invented");
    else ok(v.relics.length === mv.relics.length && v.relics.length >= 1, `every relic lying out (${v.relics.length})`);
    if (L.drives) ok(v.drives.length >= 1 && v.drives.length === mv.drives.length, `every lore drive still out there (${v.drives.length})`);
    else ok(v.drives.length === 0, "no lore drives on this level, and none invented");
    const kinds = new Set(v.objectives.map((o) => o.kind));
    ok(L.kinds.every((k) => kinds.has(k)), `the objectives: ${v.objectives.map((o) => `${o.label} (${o.state})`).join(" · ")}`);
    if (L.level === 2) ok(v.objectives.filter((o) => o.kind === "fuse").length === 10, "…all ten fuses (any three fill the box)");
    if (L.level === 3) ok(v.objectives.filter((o) => o.kind === "breaker").length === 6 && v.objectives.filter((o) => o.kind === "cutoff").length === 6, "…all six breakers and six cutoffs");
    const mk = new Set(v.monsters.map((m) => m.kind));
    ok(L.monsters.every((k) => mk.has(k)), `the monsters: ${v.monsters.length ? [...mk].map((k) => `${k} ×${v.monsters.filter((m) => m.kind === k).length}`).join(", ") : "none on this level"}`);
    const size = w.size;
    const inside = [...v.monsters, ...v.relics, ...v.drives, ...v.objectives].every((p) => p.x >= 0 && p.y >= 0 && p.x < size && p.y < size);
    ok(inside, "…every one of them on the map");

    // LANDING: refused over a wall by the server, allowed on floor
    if (L.level === 0) {
      const solidAt = w.you;
      ag.send({ type: "move", x: 0.5, y: 0.5, h: 0, p: 0 }); // the map's corner is outer wall
      await sleep(200);
      ag.clear();
      ag.send({ type: "fly", on: false });
      const bl = await ag.waitFor("fly");
      ok(bl?.ok === false && bl?.error === "bad_landing", `landing on the outer wall is refused by the server (${bl?.error})`);
      ag.send({ type: "move", x: solidAt.x, y: solidAt.y, h: 0, p: 0 });
      await sleep(200);
      ag.clear();
      ag.send({ type: "fly", on: false });
      const gl = await ag.waitFor("fly");
      ok(gl?.ok !== false && gl?.on === false, "…and allowed back on the floor");
      ag.send({ type: "fly", on: true });
      await ag.waitFor((fr) => fr.type === "fly" && fr.on === true);
    }

    // home: fly to the level's own door and leave properly, so the next
    // level's enter starts a new run instead of resuming this one
    const door = w.doors[0];
    ag.send({ type: "move", x: door.x + 0.5, y: door.y + 0.5, h: 0, p: 0 });
    await sleep(250);
    ag.clear();
    ag.send({ type: "exit" });
    ok(!!(await ag.waitFor("debrief", 5000)), "…and leaves by the level's door");
    ag.ws.close();
    await sleep(150);
  }

  // ---- the CLIENT honours a refusal (source sweep) ------------------------
  // The server refusing a fly toggle used to be ignored: the client flew on
  // while the server kept the body on foot. Its reply is handled now, and a
  // refusal puts the camera back through the SAME function the key uses.
  console.log("-- the client hears a refusal");
  const { readFileSync } = await import("node:fs");
  const gn = readFileSync(path.join(ROOT, "client", "src", "backrooms", "gamenet.ts"), "utf8");
  const bg = readFileSync(path.join(ROOT, "client", "src", "backrooms", "BackroomsGame.svelte"), "utf8");
  ok(/case "fly":\s*\n\s*handlers\.onFly\?\.\(/.test(gn), "the client's wire hands the server's fly answer to the game");
  ok(/onFly: \(ok, on, error\) => \{[\s\S]{0,300}applyFly\(!ctl\.fly\.on\)/.test(bg), "…and a refusal puts the camera back the way it was");
  ok((bg.match(/applyFly\(on\);\s*\n\s*net\?\.setFly\(on\)/g) ?? []).length === 1, "…through the same applyFly the F key uses");
  // LAW 5: every level leaves the same way — E at a way out (Level 0 used to
  // leave on a TOUCH of its red wall while the others needed E)
  ok(/for \(const ed of exitDoors\) \{\s*if \(atExitDoor\(ed\)\)/.test(bg), "every level's way out answers E through one atExitDoor test");
  ok((bg.match(/net[!?]\.exit\(\)/g) ?? []).length === 2, "…and nothing else sends exit (the E chain and the Landing's button)");

  console.log(`\n${n - bad}/${n} asserts passed`);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    setTimeout(() => {
      try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
      process.exit(bad ? 1 : 0);
    }, 300);
  });
