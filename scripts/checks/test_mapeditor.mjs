// THE MAP EDITOR, SERVED — Admin Panel → Map editor over a real server
// (Josh, Sep 2026: "I would the editor to be available in the admin panel so
// I can design and redesigns maps"). What this proves, end to end:
//   · it is the ADMIN's alone (anonymous 401, a member 403, every route);
//   · a DRAFT saves and reads back and changes nothing anybody walks;
//   · a library is checked for SHAPE on the way in, and the level for its
//     RULES before it can go live — a broken room is refused by name, a
//     library the generator cannot use at all is refused, and nothing is
//     written by any refusal;
//   · a PROPS-ONLY publish (the same floor, walls and doors) goes live with
//     people inside and KEEPS the sector id — fog, paint and bodies stay —
//     and the changed chunk is re-sent to the player already down there; the
//     build says so beforehand (keepsMap + the change list);
//   · a publish that changes the MAP is refused while somebody is connected
//     down there, and once they're gone it goes live IN PLACE: a new version
//     row, a fresh sector id (fresh fog), the frozen run voided, audited,
//     and the published room's props streaming in the chunks a new visitor
//     gets;
//   · a restart boots the published map, and a published map whose build no
//     longer matches its recorded fingerprint is REFUSED (the repo map plays
//     instead) — the same protection the frozen repo maps have always had;
//   · an old version reopens as the draft, and the export reads back as the
//     repo file's own layout (how a design gets into git).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { SECTOR_D, SECTOR_D_FINGERPRINT } = require(path.join(ROOT, "dist", "backrooms", "worldgen-pipes.js"));
const { SECTOR_P, SECTOR_P_FINGERPRINT } = require(path.join(ROOT, "dist", "backrooms", "worldgen-pools.js"));
const { SECTOR_A, SECTOR_A_FINGERPRINT } = require(path.join(ROOT, "dist", "backrooms", "worldgen.js"));
const { SECTOR_S, SECTOR_S_FINGERPRINT } = require(path.join(ROOT, "dist", "backrooms", "worldgen-station.js"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "pipes-tiles.js"));
const PORT = 8518;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "mapeditor-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN_PW = "Harness!Admin9xy";

let srv = null;
let log = "";
async function boot() {
  log = "";
  srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", (d) => { log += d; });
  srv.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) return; } catch {}
    await sleep(250);
  }
}
async function halt() {
  if (!srv) return;
  const dead = new Promise((r) => srv.once("exit", r));
  try { srv.kill("SIGINT"); } catch {}
  await Promise.race([dead, sleep(4000)]);
  srv = null;
}
process.on("exit", () => { try { srv?.kill("SIGINT"); } catch {} });

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
      ws,
      send: (m) => ws.send(JSON.stringify(m)),
      async waitFor(pred, ms = 5000) {
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

const run = async () => {
  await boot();
  ok(/Sector D3 verified/.test(log), "a fresh server plays the repo's frozen map, D3");
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const member = (await api("POST", "/api/register", { body: { username: "drafter", password: "Sturdy!Passw0rd#9", displayName: "drafter", secret: "vault marmalade lantern quartz 47", acceptTerms: true } })).body?.token;
  ok(admin && member, "an admin and a member");
  const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(adminId, Date.now());
  const suit = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(adminId).id;
  const count = (sql, ...a) => Number(db.prepare(sql).get(...a).n);

  // ---- who may
  console.log("-- who may");
  ok((await api("GET", "/api/admin/maps/2")).status === 401, "anonymous: 401");
  const routes = [["GET", "/api/admin/maps/2"], ["POST", "/api/admin/maps/2/draft"], ["DELETE", "/api/admin/maps/2/draft"], ["POST", "/api/admin/maps/2/build"], ["POST", "/api/admin/maps/2/publish"], ["POST", "/api/admin/maps/2/revert"], ["GET", "/api/admin/maps/2/export"]];
  const memberCodes = await Promise.all(routes.map(([m, u]) => api(m, u, { token: member, body: m === "GET" ? undefined : {} }).then((r) => r.status)));
  ok(memberCodes.every((c) => c === 403), `a member is refused every route (${memberCodes.join(",")})`);
  ok((await api("GET", "/api/admin/maps/10", { token: admin })).body?.error === "not_editable", "a level that doesn't exist is refused plainly");

  // ---- opening
  console.log("-- opening");
  const g0 = (await api("GET", "/api/admin/maps/2", { token: admin })).body;
  const repo = JSON.parse(readFileSync(path.join(ROOT, "src", "backrooms", "pipes-rooms.json"), "utf8")).tiles;
  ok(g0?.live?.version === 0 && g0.live.sectorId === "D3" && g0.live.playing === "D3", "the editor opens on the original map (version 0, D3)");
  ok(g0?.draft === null && g0.versions.length === 0 && g0.tiles.length === repo.length && g0.seed === SECTOR_D.seed, "…with no draft, no history, and the repo's rooms and seed");

  // THE POOLROOMS open too (Sep 2026, rebuilt from rooms): the repo library
  // builds, through the editor, exactly the frozen Poolrooms — one door, no problems
  const p0 = (await api("GET", "/api/admin/maps/1", { token: admin })).body;
  ok(p0?.name === "The Poolrooms" && p0.live.sectorId === SECTOR_P.id && p0.live.playing === SECTOR_P.id && p0.seed === SECTOR_P.seed, `the Poolrooms open in the editor on the original map (${SECTOR_P.id})`);
  const pb = await api("POST", "/api/admin/maps/1/build", { token: admin, body: { tiles: p0.tiles, seed: p0.seed } });
  ok(pb.status === 200 && pb.body.fingerprint === SECTOR_P_FINGERPRINT && pb.body.problems.length === 0 && pb.body.level === 1 && pb.body.doors.length === 1, `…and its library builds the frozen Poolrooms with no problems and one door (${pb.status}, ${pb.body?.problems?.join("; ") || "clean"})`);

  // LEVEL 0 opens too (Sep 2026, rebuilt from rooms): the repo library
  // builds exactly the frozen Level 0 — one door (The Entrance), no problems
  const a0 = (await api("GET", "/api/admin/maps/0", { token: admin })).body;
  ok(a0?.live?.sectorId === SECTOR_A.id && a0.live.playing === SECTOR_A.id && a0.seed === SECTOR_A.seed, `Level 0 opens in the editor on the original map (${SECTOR_A.id})`);
  const ab = await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: a0.tiles, seed: a0.seed } });
  ok(ab.status === 200 && ab.body.fingerprint === SECTOR_A_FINGERPRINT && ab.body.problems.length === 0 && ab.body.level === 0 && ab.body.doors.length === 1, `…and its library builds the frozen Level 0 with no problems and one door (${ab.status}, ${ab.body?.problems?.join("; ") || "clean"})`);

  // THE STATION opens too (Oct 2026, the fourth level built from rooms): the
  // repo library builds exactly the frozen S1 — one door, the six breakers, no problems
  const s0 = (await api("GET", "/api/admin/maps/3", { token: admin })).body;
  ok(s0?.name === "The Electrical Station" && s0.live.sectorId === SECTOR_S.id && s0.live.playing === SECTOR_S.id && s0.seed === SECTOR_S.seed, `the Station opens in the editor on the original map (${SECTOR_S.id})`);
  const stb = await api("POST", "/api/admin/maps/3/build", { token: admin, body: { tiles: s0.tiles, seed: s0.seed } });
  ok(stb.status === 200 && stb.body.fingerprint === SECTOR_S_FINGERPRINT && stb.body.problems.length === 0 && stb.body.level === 3 && stb.body.doors.length === 1 && stb.body.stats?.breakers === 6, `…and its library builds the frozen Station with no problems, one door and six breakers (${stb.status}, ${stb.body?.problems?.join("; ") || "clean"})`);

  // ---- drafts
  console.log("-- drafts");
  ok((await api("POST", "/api/admin/maps/2/draft", { token: admin, body: { tiles: "nope" } })).body?.error === "bad_library", "a draft that isn't a list of rooms is refused");
  ok((await api("POST", "/api/admin/maps/2/draft", { token: admin, body: { tiles: [repo[0], repo[0]] } })).body?.detail?.includes("two rooms"), "two rooms with one id are refused by name");
  ok(count("SELECT COUNT(*) AS n FROM map_drafts") === 0, "…and no refusal wrote anything");
  const tiles = JSON.parse(JSON.stringify(repo));
  const drain = tiles.find((t) => t.role === "start");
  drain.props = [...(drain.props ?? []), { p: "shipping-container", v: 2, x: 7, y: 9.5, r: 90 }];
  const sv = await api("POST", "/api/admin/maps/2/draft", { token: admin, body: { tiles, seed: SECTOR_D.seed } });
  ok(sv.status === 200 && sv.body.rooms === tiles.length && sv.body.problems === 0, "a draft saves");
  const g1 = (await api("GET", "/api/admin/maps/2", { token: admin })).body;
  ok(g1.draft && g1.draft.savedBy && g1.tiles.find((t) => t.role === "start").props.some((q) => q.p === "shipping-container"), "…reads back as the draft, with who saved it");
  ok((await api("GET", "/api/backrooms/map?level=2", { token: admin })).body?.sector === "D3", "…and the live level still plays D3");

  // ---- building
  console.log("-- building");
  const broken = JSON.parse(JSON.stringify(tiles));
  broken.find((t) => t.id === "lockers").props = [{ p: "no-such-prop", x: 1, y: 1 }];
  const bb = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles: broken, seed: SECTOR_D.seed } });
  ok(bb.status === 422 && bb.body.rooms?.some((r) => r.id === "lockers"), "a library with a broken room won't build, and names the room");
  const noStart = tiles.filter((t) => t.role !== "start");
  const ns = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles: noStart, seed: SECTOR_D.seed } });
  ok(ns.status === 422 && ns.body.error === "generator_refused", "a library the generator can't use at all is refused");
  const built = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles: repo, seed: SECTOR_D.seed } });
  ok(built.status === 200 && built.body.size === 256 && built.body.insts.length > 100 && built.body.problems.length === 0, "the repo's library builds the whole level with no problems");
  ok(built.body.fingerprint === SECTOR_D_FINGERPRINT, "…and it is D3 exactly (the same fingerprint the boot check holds)");

  // ---- publishing
  console.log("-- publishing");
  const pubBroken = await api("POST", "/api/admin/maps/2/publish", { token: admin, body: { tiles: broken, seed: SECTOR_D.seed } });
  ok(pubBroken.status === 422 && count("SELECT COUNT(*) AS n FROM map_versions") === 0, "a broken room can't be published, and nothing is written");
  const ag = await client(admin);
  ag.send({ type: "enter", door: 0, loadout: [suit], level: 2 });
  ok(!!(await ag.waitFor((f) => f.type === "welcome")), "the admin walks into Pipe Dreams");

  // PROPS ONLY: the same floor, walls and doors — the level keeps its map
  const drainId = drain.id;
  const pre = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles, seed: SECTOR_D.seed } });
  ok(pre.status === 200 && pre.body.keepsMap === true && pre.body.seedChanged === false, "a draft that only adds a prop reads as keeping the map");
  ok(pre.body.changes?.propsAdded === 1 && pre.body.changes.propsRemoved === 0 && pre.body.changes.propsChanged.join() === drainId && !pre.body.changes.reshaped.length && !pre.body.changes.doorsMoved.length, "…and the change list names one prop placed, in the drain, with no room redrawn");
  ok(pre.body.inside === 1, "…and says somebody is down there");
  const kept = await api("POST", "/api/admin/maps/2/publish", { token: admin, body: { tiles, seed: SECTOR_D.seed, note: "a container by the drain" } });
  ok(kept.status === 200 && kept.body.kept === true && kept.body.version === 1 && kept.body.sectorId === "D3" && kept.body.voided === 0, `a props-only publish goes live with somebody inside, as version 1 KEEPING sector D3 (${kept.status} ${kept.body?.sectorId})`);
  const refreshed = await ag.waitFor((f) => f.type === "chunk" && f.refresh === true && (f.props ?? []).some((p) => p.kind === "kit:shipping-container--2"), 2500);
  ok(!!refreshed, "…and the player already down there is sent the changed chunk, new prop included");
  ok((await api("GET", "/api/backrooms/map?level=2", { token: admin })).body?.sector === "D3", "…and the level still plays D3 — same fog, paint and bodies");
  const row = db.prepare("SELECT * FROM map_versions WHERE level = 2 AND version = 1").get();
  ok(row?.sectorId === "D3" && JSON.parse(row.tiles).length === tiles.length && row.note === "a container by the drain" && row.publishedBy === adminId, "the version row records the rooms, the note and who published");
  ok(count("SELECT COUNT(*) AS n FROM map_drafts") === 0, "the draft is cleared — what was drafted is live");
  ok(count("SELECT COUNT(*) AS n FROM audit WHERE action = 'map_published' AND detail LIKE '%props, looks and markers only%'") === 1, "the publish is audited as dressing (props, looks and markers only)");
  const same = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles, seed: SECTOR_D.seed } });
  ok(same.body.changes?.propsAdded === 0 && same.body.changes.propsRemoved === 0, "building the live library again shows nothing changed");

  // A NEW MAP: another seed arranges the rooms differently — that resets
  const busy = await api("POST", "/api/admin/maps/2/publish", { token: admin, body: { tiles, seed: 8, note: "a new arrangement" } });
  ok(busy.status === 409 && busy.body.error === "players_inside" && busy.body.inside === 1, "a publish that changes the map itself waits while somebody is connected down there");
  ok(count("SELECT COUNT(*) AS n FROM map_versions") === 1, "…and nothing was written");
  ag.ws.close();
  await sleep(400);
  const nb = await api("POST", "/api/admin/maps/2/build", { token: admin, body: { tiles, seed: 8 } });
  ok(nb.status === 200 && nb.body.keepsMap === false && nb.body.seedChanged === true, "a new seed reads as a new map");
  const pub = await api("POST", "/api/admin/maps/2/publish", { token: admin, body: { tiles, seed: 8, note: "a new arrangement" } });
  ok(pub.status === 200 && pub.body.kept === false && pub.body.version === 2 && pub.body.sectorId === "D5", `once they're gone it goes live as version 2, a fresh sector D5 (${pub.status} ${pub.body?.sectorId})`);
  ok(pub.body.voided === 1, "…calling off the run left frozen by the dropped connection");
  ok(count("SELECT COUNT(*) AS n FROM audit WHERE action = 'map_published'") === 2, "the publish is audited");
  ok((await api("GET", "/api/backrooms/map?level=2", { token: admin })).body?.sector === "D5", "the level plays D5 now, in place, no restart");
  const ag2 = await client(admin);
  ag2.send({ type: "enter", door: 0, loadout: [suit], level: 2 });
  const w = await ag2.waitFor((f) => f.type === "welcome");
  const cx = Math.floor(w.you.x / 16);
  const cy = Math.floor(w.you.y / 16);
  const want = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) want.push({ cx: cx + dx, cy: cy + dy });
  ag2.send({ type: "chunks", want });
  await sleep(1200);
  const kitKinds = [];
  // every chunk frame the visitor got
  for (const q of want) {
    const ch = await ag2.waitFor((f) => f.type === "chunk" && f.cx === q.cx && f.cy === q.cy, 1500);
    for (const p of ch?.props ?? []) if (p.kind.startsWith("kit:")) kitKinds.push(p.kind);
  }
  ok(kitKinds.includes("kit:shipping-container--2"), "a new visitor's chunks carry the published room's new prop");
  ag2.ws.close();
  await sleep(300);

  // ---- history and export
  console.log("-- history");
  const g2 = (await api("GET", "/api/admin/maps/2", { token: admin })).body;
  ok(g2.live.version === 2 && g2.versions.length === 2 && g2.versions[0].rooms === tiles.length && g2.draft === null, "the editor reopens on version 2, with two entries in its history");
  const ex = (await api("GET", "/api/admin/maps/2/export", { token: admin })).body;
  ok(ex?.version === 2 && ex.seed === 8 && ex.file === formatLibrary(tiles), "the export is the library in the repo file's own layout");
  const rv = await api("POST", "/api/admin/maps/2/revert", { token: admin, body: { version: 0 } });
  const g3 = (await api("GET", "/api/admin/maps/2", { token: admin })).body;
  ok(rv.status === 200 && g3.draft && JSON.stringify(g3.tiles) === JSON.stringify(repo) && g3.live.version === 2, "the original map reopens as a draft, and version 2 stays live");
  ok((await api("POST", "/api/admin/maps/2/revert", { token: admin, body: { version: 42 } })).status === 404, "a version that doesn't exist is a 404");
  ok((await api("DELETE", "/api/admin/maps/2/draft", { token: admin })).body?.dropped === true && count("SELECT COUNT(*) AS n FROM map_drafts") === 0, "a draft can be thrown away");

  // ---- a repaint (the look picker): dressing, like props
  console.log("-- a repaint");
  const a0l = (await api("GET", "/api/admin/maps/0", { token: admin })).body;
  const lib0 = a0l.tiles;
  lib0.find((t) => t.id === "the-washroom").look = { wall: "wood-panels", floor: "carpet-green" };
  const rb = await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: lib0, seed: a0l.seed } });
  ok(rb.status === 200 && rb.body.keepsMap === true && rb.body.changes?.looksChanged.join() === "the-washroom" && !rb.body.changes.reshaped.length, "a room given new walls and ceiling reads as a repaint that keeps the map");
  const rp = await api("POST", "/api/admin/maps/0/publish", { token: admin, body: { tiles: lib0, seed: a0l.seed, note: "panelled washroom" } });
  ok(rp.status === 200 && rp.body.kept === true && rp.body.sectorId === SECTOR_A.id, `…and goes live keeping Level 0's sector (${rp.status} ${rp.body?.sectorId})`);

  // ---- THE GAME LAYER: a spawner and a drive spot go live with somebody inside
  console.log("-- the game layer");
  // the member walks in (the admin still has a Pipe Dreams run standing, and
  // any door resumes a standing run on its own level)
  const memberId = (await api("GET", "/api/me", { token: member })).body.user.id;
  db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)").run(memberId, Date.now());
  const msuit = db.prepare("SELECT id FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").get(memberId).id;
  const ag0 = await client(member);
  ag0.send({ type: "enter", door: 0, loadout: [msuit], level: 0 });
  const w0 = await ag0.waitFor((f) => f.type === "welcome");
  ok(!!w0, "a player walks into Level 0");
  const lib1 = JSON.parse(JSON.stringify(lib0));
  // the room the player is standing in (creature frames only reach players
  // within 28 cells): the build's own placement says which one it is
  const placed = (await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: lib0, seed: a0l.seed } })).body.insts;
  const here = placed.find((i) => w0.you.x >= i.x && w0.you.y >= i.y && w0.you.x < i.x + i.w && w0.you.y < i.y + i.h);
  const room0 = lib1.find((t) => t.id === here.tileId);
  const open0 = [];
  for (let y = 1; y < room0.map.length - 1; y++) for (let x = 1; x < room0.map[y].length - 1; x++) if (!" #".includes(room0.map[y][x]) && ((room0.furn?.[y] ?? "")[x] ?? ".") === ".") open0.push([x + 0.5, y + 0.5]);
  const copies = placed.filter((i) => i.tileId === room0.id).length;
  // the middle of the room is inside the frame range however the copy is turned
  const mid = [room0.map[0].length / 2, room0.map.length / 2];
  const centre = [...open0].sort((p, q) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) - Math.hypot(q[0] - mid[0], q[1] - mid[1]))[0];
  room0.marks = [
    { k: "entity", x: centre[0], y: centre[1], sight: 32, roam: 6 },
    { k: "drive", x: open0[open0.length - 1][0], y: open0[open0.length - 1][1] },
  ];
  const start0 = room0;
  const gb = await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: lib1, seed: a0l.seed } });
  ok(gb.status === 200 && gb.body.keepsMap === true && gb.body.changes?.marksChanged.join() === start0.id && !gb.body.changes.reshaped.length, `a spawner and a drive spot placed in the room the player arrives in (${room0.id}, ${copies} copies) read as keeping the map`);
  const gp = await api("POST", "/api/admin/maps/0/publish", { token: admin, body: { tiles: lib1, seed: a0l.seed, note: "something in the entrance" } });
  ok(gp.status === 200 && gp.body.kept === true && gp.body.sectorId === SECTOR_A.id, `…and goes live with somebody inside, keeping ${SECTOR_A.id} (${gp.status})`);
  ok(/Level 0: \d+ spawned entit/.test(log), "the server seats the spawned Entity from the map's markers");
  const ent = await ag0.waitFor((f) => f.type === "entity" && f.id >= 100, 6000);
  ok(!!ent, `…and it walks Level 0 in front of the player already down there (${ent ? `id ${ent.id}` : "no frame"})`);
  const dbg = (await api("GET", "/api/backrooms/map?level=0", { token: admin })).body?.debug;
  ok(dbg?.entities?.some((e) => e.id >= 100), "the operator's map shows it");
  const { planLobbySector } = require(path.join(ROOT, "dist", "backrooms", "worldgen-lobby.js"));
  const spots = (planLobbySector(a0l.seed, SECTOR_A.size, lib1).sector.marks ?? []).filter((m) => m.k === "drive");
  ok(spots.length > 0 && dbg?.drives?.some((d) => spots.some((m) => Math.floor(m.x) + 0.5 === d.x && Math.floor(m.y) + 0.5 === d.y)), `a lore drive now lies on a drive spot (${spots.length} spots on the map)`);
  ok(count("SELECT COUNT(*) AS n FROM audit WHERE action = 'map_published' AND detail LIKE '%markers only%' AND detail LIKE '%something in the entrance%'") === 1, "the publish is audited as dressing (props, looks and markers)");

  // ---- A TEXTURE OF JOSH'S OWN, lights and a sound: the room style
  console.log("-- your own texture, lights and sound");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
  const upload = async (q, body, tok = admin) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/admin/map-surfaces?${q}`, { method: "POST", headers: { authorization: `Bearer ${tok}` }, body });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  ok((await upload("kind=wall&name=Brick&sizeM=2", png, member)).status === 403, "a member can't add a texture");
  ok((await upload("kind=wall&name=Brick&sizeM=2", Buffer.from("not a picture at all"))).status === 415, "a file that isn't a picture is refused");
  ok((await upload("kind=roof&name=Brick&sizeM=2", png)).body?.error === "bad_kind" && (await upload("kind=wall&name=&sizeM=2", png)).body?.error === "name_required", "a texture needs a kind and a name");
  ok(count("SELECT COUNT(*) AS n FROM map_surfaces") === 0, "…and no refusal kept anything");
  const up = await upload("kind=wall&name=Red%20brick&sizeM=1.5", png);
  ok(up.status === 200 && up.body.id === "c1" && up.body.surfaces.some((q) => q.id === "c1" && q.kind === "wall" && q.sizeM === 1.5), `a picture becomes wall texture c1 (${up.status})`);
  const texFile = up.body.surfaces[0].url.split("/").pop();
  const served = await fetch(`http://127.0.0.1:${PORT}/api/br-surface/${texFile}`);
  ok(served.status === 200 && served.headers.get("content-type") === "image/png" && (await served.arrayBuffer()).byteLength === png.length, "its picture is served to anyone (the game's texture loader)");
  ok((await fetch(`http://127.0.0.1:${PORT}/api/br-surface/..%2Fsolace.db`)).status === 404, "…and nothing but its pictures");
  ok((await api("GET", "/api/admin/maps/0", { token: admin })).body?.surfaces?.some((q) => q.id === "c1"), "the editor opens knowing it");
  const lib2 = JSON.parse(JSON.stringify(lib1));
  lib2.find((t) => t.id === room0.id).look = { wall: "c1", lights: 0, bright: 50, sound: "drip" };
  const sb = await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: lib2, seed: a0l.seed } });
  ok(sb.status === 200 && sb.body.keepsMap === true && sb.body.changes?.looksChanged.join() === room0.id, "the room in its new texture, dark, with dripping water, reads as keeping the map");
  const sp = await api("POST", "/api/admin/maps/0/publish", { token: admin, body: { tiles: lib2, seed: a0l.seed } });
  ok(sp.status === 200 && sp.body.kept === true, "…and goes live with somebody inside");
  const restyled = await ag0.waitFor((f) => f.type === "chunk" && f.refresh === true && Object.values(f.styles ?? {}).some((q) => q.wall === "c1"), 4000);
  ok(!!restyled, "the player down there is sent the restyled chunk");
  const st2 = Object.values(restyled?.styles ?? {}).find((q) => q.wall === "c1");
  ok(st2?.lights === 0 && st2.bright === 50 && st2.sound === "drip", "…carrying the room's lights and sound");
  ok(restyled?.surfaces?.some((q) => q.id === "c1" && q.url.endsWith(texFile)), "…and the texture's picture, so the game can draw a wall it never shipped with");
  ok(restyled?.look?.some((v) => v && restyled.styles[v]?.wall === "c1"), "…on the cells that wear it");
  // ---- A HELD CEILING and A SHAPE (Oct 2026: the Heights tool's floor-only
  // mode and the drawn solids) are dressing too, and reach a player inside
  const lib3 = JSON.parse(JSON.stringify(lib2));
  const r3 = lib3.find((t) => t.id === room0.id);
  r3.ceiling = r3.map.map((row, y) => [...row].map((c, x) => (" #".includes(c) ? "." : (((r3.height ?? [])[y] ?? "")[x] ?? "0").replace(".", "0"))).join(""));
  r3.props = [...(r3.props ?? []), { p: "shape-pillar", x: open0[0][0], y: open0[0][1], sx: 0.6, sy: 2.8, sz: 0.6, tex: "paper-dots", col: "#c0a050", rz: 5, solid: false }];
  const hb = await api("POST", "/api/admin/maps/0/build", { token: admin, body: { tiles: lib3, seed: a0l.seed } });
  ok(hb.status === 200 && hb.body.keepsMap === true && hb.body.changes?.looksChanged.includes(room0.id) && !hb.body.changes.reshaped.length, `a held ceiling and a shape read as keeping the map (${hb.status}${hb.body?.problems ? " " + JSON.stringify(hb.body.problems).slice(0, 200) : ""})`);
  const hp = await api("POST", "/api/admin/maps/0/publish", { token: admin, body: { tiles: lib3, seed: a0l.seed } });
  ok(hp.status === 200 && hp.body.kept === true, "…and go live with somebody inside");
  const held = await ag0.waitFor((f) => f.type === "chunk" && f.refresh === true && (f.lid ?? []).some((v) => v !== -128) && (f.props ?? []).some((p) => p.kind === "kit:shape-pillar"), 4000);
  ok(!!held, "the player down there is sent the chunk carrying the held ceiling and the shape");
  const pil = held?.props.find((p) => p.kind === "kit:shape-pillar");
  ok(pil && pil.sx === 0.6 && pil.sy === 2.8 && pil.sz === 0.6 && pil.tex === "paper-dots" && pil.col === "#c0a050" && Math.abs(Math.abs(pil.roll) - (5 * Math.PI) / 180) < 1e-9, "…the shape with its size, surface, colour and lean (a mirrored copy leans the other way)");

  // ---- what players did: the heatmap, and comparing versions
  console.log("-- the heatmap and compare");
  db.prepare("INSERT INTO backrooms_deaths (userId, name, x, y, cause, at, level, sector) VALUES (?, 'drafter', 40.5, 41.5, 'the entity', ?, 0, ?)").run(adminId, Date.now(), SECTOR_A.id);
  db.prepare("INSERT INTO backrooms_deaths (userId, name, x, y, cause, at, level, sector) VALUES (?, 'drafter', 9.5, 9.5, 'a fall', ?, 1, 'P-elsewhere')").run(adminId, Date.now());
  const heat = await api("GET", "/api/admin/maps/0/heat", { token: admin });
  ok(heat.status === 200 && heat.body.sectorId === SECTOR_A.id && heat.body.deaths.some((d) => d.x === 40.5 && d.cause === "the entity") && !heat.body.deaths.some((d) => d.cause === "a fall"), "the heatmap shows the deaths on the map being played, and no other map's");
  ok(Buffer.from(heat.body.explored, "base64").length === SECTOR_A.size * SECTOR_A.size && Buffer.from(heat.body.explored, "base64").some((v) => v), "…and which cells somebody has charted (the player walked some)");
  ok((await api("GET", "/api/admin/maps/0/heat", { token: member })).status === 403, "…for the admin only");
  const cmp = await api("POST", "/api/admin/maps/0/compare", { token: admin, body: { version: 0, tiles: lib2, seed: a0l.seed } });
  ok(cmp.status === 200 && cmp.body.sameMap === true && cmp.body.before.fingerprint === cmp.body.after.fingerprint, "comparing the original map with the draft builds both, and knows the map itself is the same");
  ok(cmp.body.changes.looksChanged.includes(room0.id) && cmp.body.changes.marksChanged.includes(room0.id) && cmp.body.changes.looksChanged.includes("the-washroom"), "…and names what changed: the repaint, the new style and the markers");
  ok(typeof cmp.body.after.dist === "string" && Array.isArray(cmp.body.after.marks) && cmp.body.after.marks.some((q) => q[0] === "entity"), "the whole-level view carries the distance from the door and the markers");
  ok((await api("POST", "/api/admin/maps/0/compare", { token: admin, body: { version: 99, tiles: lib2, seed: a0l.seed } })).status === 404, "a version that doesn't exist is a 404");
  ag0.ws.close();
  await sleep(300);

  // ---- restarts
  console.log("-- restarts");
  db.close();
  await halt();
  await boot();
  ok(/Sector D5 verified \(256×256, seed 8, published v2\)/.test(log), "a restart boots the published map");
  ok(new RegExp(`Sector ${SECTOR_A.id} verified \\([^)]*published v\\d+\\)`).test(log), "…and Level 0 boots its published map too, uploaded texture and all (the textures load before the maps are checked)");
  const admin2 = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok((await api("GET", "/api/backrooms/map?level=2", { token: admin2 })).body?.sector === "D5", "…and serves it as D5");

  // ---- PLAY THE DRAFT: the level is the admin's alone, and nothing is kept
  console.log("-- test play");
  const p1 = (await api("GET", "/api/admin/maps/1", { token: admin2 })).body;
  const dbT = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const cnt = (sql, ...a) => Number(dbT.prepare(sql).get(...a).n);
  const relicsBefore = JSON.stringify((await api("GET", "/api/backrooms/map?level=1", { token: admin2 })).body?.debug?.relics);
  const suitsBefore = cnt("SELECT COUNT(*) AS n FROM backrooms_locker WHERE userId = ? AND kind = 'suit'", adminId);
  ok((await api("POST", "/api/admin/maps/1/playtest", { token: member, body: { tiles: p1.tiles, seed: p1.seed } })).status === 403, "a member can't test-play a level");
  const pt = await api("POST", "/api/admin/maps/1/playtest", { token: admin2, body: { tiles: p1.tiles, seed: p1.seed } });
  ok(pt.status === 200 && pt.body.sectorId === `${SECTOR_P.id}-test`, `the admin test-plays the Poolrooms' draft under a throwaway sector (${pt.body?.sectorId})`);
  ok((await api("GET", "/api/admin/maps/1", { token: admin2 })).body?.testing?.by === adminId, "the editor knows a test is running, and whose");
  ok((await api("POST", "/api/admin/maps/1/playtest", { token: admin2, body: { tiles: p1.tiles, seed: p1.seed } })).body?.error === "already_testing", "one test at a time");
  const mt = await client(member);
  mt.send({ type: "enter", door: 0, loadout: [msuit], level: 1 });
  ok((await mt.waitFor((f) => f.type === "denied"))?.error === "level_testing", "nobody else can walk in while it's tested");
  mt.ws.close();
  const at = await client(admin2);
  at.send({ type: "enter", door: 0, loadout: [suit], level: 1 });
  ok(!!(await at.waitFor((f) => f.type === "welcome")), "the admin walks into the draft (its door needn't be open — it's a test)");
  ok((await api("GET", "/api/backrooms/map?level=1", { token: admin2 })).body?.sector === `${SECTOR_P.id}-test`, "…and the level plays the draft");
  at.send({ type: "forfeit" });
  await sleep(600);
  ok(cnt("SELECT COUNT(*) AS n FROM backrooms_deaths WHERE sector = ?", `${SECTOR_P.id}-test`) === 0 && cnt("SELECT COUNT(*) AS n FROM backrooms_locker WHERE userId = ? AND kind = 'suit'", adminId) === suitsBefore, "dying in a test costs nothing: no death written, the suit still in the locker");
  await sleep(4000);
  ok((await api("GET", "/api/backrooms/map?level=1", { token: admin2 })).body?.sector === SECTOR_P.id && !(await api("GET", "/api/admin/maps/1", { token: admin2 })).body?.testing, `with nobody left in it the test ends by itself, and the level plays ${SECTOR_P.id} again`);
  ok(JSON.stringify((await api("GET", "/api/backrooms/map?level=1", { token: admin2 })).body?.debug?.relics) === relicsBefore, "…with its relics exactly where they were");
  ok(cnt("SELECT COUNT(*) AS n FROM audit WHERE action = 'map_playtest'") === 1, "a test play is audited");
  ok((await api("POST", "/api/admin/maps/1/playtest/end", { token: admin2 })).body?.error === "not_testing", "ending a test that isn't running says so");
  at.ws.close();
  dbT.close();
  await halt();
  const db2 = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  db2.prepare("UPDATE map_versions SET fingerprint = 'sha256:not-what-it-builds' WHERE level = 2").run();
  db2.close();
  await boot();
  ok(/builds differently than when it was published/.test(log) && /Sector D3 verified/.test(log), "a published map that no longer builds the same is refused, and the repo map plays");
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    await halt();
    await sleep(200);
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    console.log(`\n${n - bad}/${n} asserts passed`);
    process.exit(bad ? 1 : 0);
  });
