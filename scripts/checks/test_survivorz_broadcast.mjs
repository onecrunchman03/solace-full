// SOLACE SURVIVORZ — THE BROADCAST (src/survivorz/broadcast.ts + routes/survivorz-show.ts), over a
// real server and a real /ws-survivorz socket on port 8572:
//  1. OFF BY DEFAULT: the show isn't running at boot; the admin's watch socket is told "offair".
//  2. ONLY THE ADMIN: a member is refused the levers (403) and, while the show is off air, the
//     watch socket too — however it's asked.
//  3. START: the admin's press runs the world; a socket already watching gets the snapshot, then
//     ticks at no more than 10 Hz carrying the six survivors' bodies; the press is audited.
//  4. A NEWCOMER joins mid-show with a full snapshot first.
//  5. ON AIR: a member may now watch (and load the show's assets, refused off air), and gets the snapshot; OFF AIR closes the member (4003)
//     while the admin keeps watching; a member asking /api/survivorz/onair is told the truth.
//  6. NOTHING A WATCHER SENDS IS READ: garbage frames change nothing and don't drop the socket.
//  7. PAUSE stops the ticks, RESUME starts them; STOP tells every watcher "offair".
//  8. IT STAYS ON: a restart with the show running resumes it (a fresh world for now).

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
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

const PORT = 8572;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "survivorz-broadcast-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const boot = async (extra = {}) => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    // a real show's five-minute countdown off (the countdown has its own section below); the AI-drop hold after 1 s
    SURVIVORZ_COUNTDOWN_MS: "0", SURVIVORZ_HOLD_AFTER_MS: "1000",
    ...extra,
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
const lever = (token, op, extra = {}) => api("POST", "/api/admin/survivorz/show", token, { op, ...extra });

/** Open a watch socket; collect frames. Resolves once open, or with {refused} if the door shut. */
const watch = (token) => new Promise((resolve) => {
  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(token)}`);
  const w = { ws, frames, closed: null, refused: null, binary: 0 };
  ws.on("message", (d, isBinary) => { if (isBinary) w.binary++; try { frames.push({ at: Date.now(), f: JSON.parse(String(d)) }); } catch {} });
  ws.on("close", (code) => { w.closed = code; });
  ws.on("unexpected-response", (_req, res) => { w.refused = res.statusCode; resolve(w); });
  ws.on("error", () => { if (w.refused === null) { w.refused = -1; resolve(w); } });
  ws.on("open", () => resolve(w));
});
const framesOf = (w, type, since = 0) => w.frames.filter((x) => x.f.type === type && x.at >= since);

let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
ok(up, "the server boots");
const admin = (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;
const reg = await api("POST", "/api/register", null, { username: "zfan", password: "Sturdy!Passw0rd#9", displayName: "Fan", secret: "vault marmalade lantern quartz 47", acceptTerms: true });
const member = reg.body?.token;
ok(!!admin && !!member, "an admin and a member are signed in");

console.log("OFF BY DEFAULT");
let aw;
{
  const s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s && s.running === false && s.onAir === false, "the show is not running at boot");
  aw = await watch(admin);
  await sleep(300);
  ok(aw.refused === null && framesOf(aw, "offair").length === 1, "the admin's watch socket opens and is told the show is off air");
}

console.log("ONLY THE ADMIN");
{
  const r = await lever(member, "start");
  const s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(r.status === 403 && s.running === false, "a member is refused the start lever and nothing starts");
  ok((await api("GET", "/api/admin/survivorz/show", member)).status === 403, "a member is refused the show's status");
  const mw = await watch(member);
  ok(mw.refused === 403, "a member's watch socket is refused while the show is off air");
  ok((await api("GET", "/api/survivorz/assets", member)).status === 403, "a member is refused the show's assets while it's off air (licences: never public)");
  ok((await api("GET", "/api/survivorz/assets", admin)).status === 200, "…while the admin always has them");
  const anon = await watch("garbage");
  ok(anon.refused === 401, "a socket with no session is refused 401");
  ok((await lever(admin, "nonsense")).status === 400, "an unknown lever is refused 400");
}

console.log("START");
let seed;
{
  const t0 = Date.now();
  const r = await lever(admin, "start", { seed: 4242 });
  seed = r.body?.seed;
  ok(r.status === 200 && r.body?.running === true && seed === 4242, "the admin starts the show on the seed asked for");
  ok(r.body?.test === false && r.body?.runNo === 1 && r.body?.lastRunNo === 1, "a real show is numbered: run #1");
  await sleep(2200);
  const snaps = framesOf(aw, "snap", t0);
  ok(snaps.length === 1, "the watching admin gets one snapshot when the world starts");
  const snap = snaps[0]?.f;
  const survivors = snap?.bodies?.filter((b) => b.kind === "survivor") ?? [];
  ok(survivors.length === 6 && survivors.some((b) => b.who === "rollo"), "the snapshot carries the six survivors, Rollo among them");
  ok((snap?.bodies?.filter((b) => b.kind === "zombie").length ?? 0) >= 18, "…and the dead (THE BUNKER: 20 at the start)");
  ok(Array.isArray(snap?.doors) && snap.doors.length >= 25 && typeof snap.power === "object" && !!snap.goals?.door, "…and every door, the power and the objectives");
  ok(snap?.supplies && Number.isFinite(snap.supplies.foodDays) && Number.isFinite(snap.supplies.ammo), "…and the group's linked storage for the overlay (food days, water, meds, ammo)");
  const ticks = framesOf(aw, "tick", t0);
  const spanS = (ticks.at(-1)?.at - ticks[0]?.at) / 1000;
  ok(ticks.length >= 2, `ticks are flowing (${ticks.length} in ~2s)`);
  ok(ticks.length / Math.max(1, spanS) <= 12, "…at no more than ~10 Hz");
  ok(ticks.every((x) => Array.isArray(x.f.b)) && ticks.some((x) => x.f.b.length > 0), "…each carrying the bodies that moved");
  ok(aw.binary === 0 && aw.frames.length > 10, "every frame goes out as TEXT (a binary frame reaches a browser as a Blob, which the client drops)");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const row = db.prepare("SELECT action, detail FROM audit WHERE action = 'survivorz.start'").get();
  db.close();
  ok(row?.detail === "seed 4242", "the press is audited with its seed");
}

console.log("THE BODY LEVERS");
{
  const body = (token, b) => api("POST", "/api/admin/survivorz/body", token, b);
  ok((await body(member, { op: "infect", id: "s:dale" })).status === 403, "a member is refused the body levers");
  ok((await body(admin, { op: "explode", id: "s:dale" })).status === 400 && (await body(admin, { op: "kill", id: "../x" })).status === 400, "a bad lever or a bad id is refused 400");
  const r = await body(admin, { op: "infect", id: "s:dale", hours: 23.97 });
  ok(r.status === 200, "the admin infects a survivor at the end of the clock (a turn on demand)");
  // (staging: the run is live with the dead in it, so Dale may already be down; a first revive stands him up either way)
  await body(admin, { op: "revive", id: "s:dale" });
  // (the dead are live in this run and may put him down again between two calls: a few tries)
  let refused = false;
  for (let k = 0; k < 4 && !refused; k++) refused = (await body(admin, { op: "revive", id: "s:dale" })).status === 409;
  ok(refused, "a lever that can't apply is refused 409 (reviving somebody standing)");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const row = db.prepare("SELECT detail FROM audit WHERE action = 'survivorz.body.infect'").get();
  db.close();
  ok(row?.detail === "s:dale at 23.97 h", "the lever is audited");
}

console.log("A NEWCOMER");
{
  const late = await watch(admin);
  await sleep(500);
  ok(late.frames[0]?.f.type === "snap", "a socket opened mid-show gets a full snapshot first");
  ok(framesOf(late, "tick").length >= 1, "…then the ticks");
  late.ws.close();
}

console.log("ON AIR");
{
  const onair0 = (await api("GET", "/api/survivorz/onair", member)).body;
  ok(onair0?.onAir === false, "a member is told the show is not on air");
  ok((await lever(admin, "onair")).body?.onAir === true, "the admin puts the show on air");
  ok((await api("GET", "/api/survivorz/onair", member)).body?.onAir === true, "…and a member is told it is");
  const mw = await watch(member);
  await sleep(500);
  ok(mw.refused === null && mw.frames[0]?.f.type === "snap", "a member may now watch, and gets the snapshot");
  ok((await api("GET", "/api/survivorz/assets", member)).status === 200, "…and may load the show's assets to draw it");
  const st = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(st.members === 1 && st.watchers === 2, "the status counts the member and the admin watching");

  console.log("NOTHING A WATCHER SENDS IS READ");
  mw.ws.send(JSON.stringify({ type: "op", op: "stop" }));
  mw.ws.send("not json at all");
  await sleep(400);
  const st2 = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(st2.running === true && mw.closed === null, "garbage from a watcher changes nothing and doesn't drop it");

  ok((await lever(admin, "offair")).body?.onAir === false, "the admin takes the show off air");
  await sleep(400);
  ok(mw.closed === 4003, "…which closes the member's socket with 4003");
  ok(aw.closed === null, "…while the admin keeps watching");
  ok((await api("GET", "/api/survivorz/assets", member)).status === 403, "…and the member loses the assets again");
}

console.log("THE DAILY SUMMARY (Josh, Nov 1 2026)");
{
  ok((await api("POST", "/api/admin/survivorz/daily", member)).status === 403, "a member can't send the daily summary");
  const r = await api("POST", "/api/admin/survivorz/daily", admin);
  ok(r.status === 200 && /^SURVIVORZ — THE DAILY SUMMARY/.test(r.body?.text ?? "") && /Day 1/.test(r.body.text) && /Alive: /.test(r.body.text), "the admin's lever sends it now: the day, who's alive, and the rest");
  const convs = (await api("GET", "/api/dm", admin)).body;
  const list = Array.isArray(convs) ? convs : convs?.conversations ?? [];
  ok(list.some((c) => /SURVIVORZ — THE DAILY SUMMARY/.test(c.lastMessage?.body ?? c.last?.body ?? "")), "…and it lands in the admin's DMs from Sterling");
}

console.log("PAUSE · RESUME · STOP");
{
  await lever(admin, "pause");
  await sleep(300);
  const t0 = Date.now();
  await sleep(1200);
  ok(framesOf(aw, "tick", t0).length === 0, "paused: no ticks");
  await lever(admin, "resume");
  const t1 = Date.now();
  await sleep(1200);
  ok(framesOf(aw, "tick", t1).length >= 5, "resumed: the ticks come back");
  const t2 = Date.now();
  ok((await lever(admin, "stop")).body?.running === false, "the admin stops the show");
  await sleep(400);
  ok(framesOf(aw, "offair", t2).length === 1, "…and every watcher is told it's off air");
  const t3 = Date.now();
  await sleep(800);
  ok(framesOf(aw, "tick", t3).length === 0, "…and nothing more comes");
}

console.log("THE RUN'S LEVERS (BUNKER.md 40-43)");
{
  const r0 = await lever(admin, "start");
  const n0 = r0.body?.lastRunNo ?? 0;
  ok(n0 >= 2 && r0.body?.runNo === n0, `a fresh real show takes the next number (#${n0})`);
  ok((await lever(admin, "speed", { speed: 4 })).body?.error === "not_test" && (await lever(admin, "jump", { minutes: 5 })).body?.error === "not_test", "a real show can't be sped up or jumped (409 not_test)");
  await lever(admin, "stop");
  let r = await lever(admin, "test", { seed: 77 });
  ok(r.body?.running === true && r.body?.test === true && r.body?.runNo === null && r.body?.lastRunNo === n0, "a test run starts unnumbered; the counter stays put");
  ok((await lever(admin, "onair")).status === 409, "a test run can't go on air (409)");
  // THE ADMIN WATCHES A TEST RUN (Josh, Nov 3 2026: "I would like to watch the test runs"): the Survivorz page offers
  // it to the admin alone; a member is told nothing is on, and their socket stays shut
  const ao = (await api("GET", "/api/survivorz/onair", admin)).body, mo = (await api("GET", "/api/survivorz/onair", member)).body;
  ok(ao?.onAir === false && ao.adminView === true && ao.test === true && typeof ao.map === "string", "the Survivorz page offers the admin the test run (not on air, theirs to watch, with the map)");
  ok(mo?.onAir === false && mo.adminView === false && mo.test === false && mo.map === null && mo.watching === 0, "…while a member is told nothing's on (no test, no map, no count)");
  const tw = await watch(admin), tm = await watch(member);
  await sleep(700);
  ok(tw.refused === null && tw.frames[0]?.f.type === "snap" && framesOf(tw, "tick").length >= 1, "the admin's own watch socket gets the test run, snapshot then ticks");
  ok(tm.refused === 403, "a member's watch socket is refused during a test run");
  tw.ws.close();
  ok(r.body?.setup?.seed === 77 && r.body.setup.starts.length === 6 && !!r.body.setup.partSpot && !!r.body.setup.noteSpot && r.body.setup.zombies >= 18, "the status carries the run setup: seed, six starts, the part and note spots, the dead");
  ok((await lever(admin, "speed", { speed: 9 })).status === 400 && (await lever(admin, "speed", { speed: 8 })).body?.speed === 8, "speed takes 1-8 on a test run");
  const z0 = r.body.setup.zombies;
  ok((await api("POST", "/api/admin/survivorz/spawn", member, { n: 2 })).status === 403, "a member is refused the spawn lever");
  ok((await api("POST", "/api/admin/survivorz/spawn", admin, { n: 99 })).status === 400 && (await api("POST", "/api/admin/survivorz/spawn", admin, { n: 1, room: "../x" })).status === 400, "a bad spawn is refused 400");
  const sp = await api("POST", "/api/admin/survivorz/spawn", admin, { n: 2 });
  const z1 = (await api("GET", "/api/admin/survivorz/show", admin)).body?.setup?.zombies;
  ok(sp.status === 200 && sp.body?.made >= 1 && z1 === z0 + sp.body.made, `the admin spawns zombies (${sp.body?.made} made, ${z0} → ${z1})`);
  const t0 = (await api("GET", "/api/admin/survivorz/show", admin)).body.t;
  r = await lever(admin, "jump", { minutes: 5 });
  ok(r.status === 200 && !!r.body?.jumping, "a jump starts");
  ok((await lever(admin, "jump", { minutes: 5 })).body?.error === "busy", "…and a second one waits (409 busy)");
  let st = r.body;
  for (let i = 0; i < 80 && st?.jumping; i++) { await sleep(250); st = (await api("GET", "/api/admin/survivorz/show", admin)).body; }
  ok(!st.jumping && st.t - t0 >= 5 * 60_000 - 1000, `the jump lands five minutes on (${Math.round((st.t - t0) / 1000)} s)`);
  ok((await lever(admin, "jump", { objective: "nope" })).status === 400, "a jump to no objective is refused 400");
  const before = st.setup;
  r = await lever(admin, "reset", { same: true });
  ok(r.body?.seed === 77 && r.body?.test === true && JSON.stringify(r.body.setup.starts) === JSON.stringify(before.starts) && r.body.setup.partSpot === before.partSpot, "restart with the same start: the same seed, starts and hiding places, still a test");
  r = await lever(admin, "reset");
  ok(r.body?.seed !== 77 && r.body?.test === true, "restart with a new start: a new seed");
  // THE CONTROL ROOM's test-run levers (stage 2): the dead at the start, heal / give / move / nudge, the dials, clear
  await lever(admin, "stop");
  ok((await lever(admin, "test", { zombies: 99 })).body?.error === "bad_zombies", "the dead at the start past 60 is refused 400");
  r = await lever(admin, "test", { zombies: 5 });
  ok(r.body?.setup?.zombies === 5 && r.body?.dials?.startZombies === 5, "a test run starts with the dead asked for (5)");
  const who = `s:${r.body.setup.starts[0].who}`;
  const act = (b, u = admin) => api("POST", "/api/admin/survivorz/act", u, b);
  ok((await act({ op: "heal", id: who }, member)).status === 403, "a member is refused the control room's levers");
  ok((await act({ op: "give", id: who, item: "rocket" })).status === 400 && (await act({ op: "move", id: who, room: "../x" })).status === 400 && (await act({ op: "nudge", id: who, kind: "goal", text: "x" })).status === 400, "bad lever input is refused 400");
  const acts = [{ op: "heal", id: who }, { op: "give", id: who, item: "medkit" }, { op: "move", id: who, room: "mess" }, { op: "nudge", id: who, kind: "goal", text: "Find the radio part first" }, { op: "length", minutes: 30 }, { op: "trickle", rate: 2 }];
  const res = [];
  for (const b of acts) res.push((await act(b)).status);
  ok(res.every((s) => s === 200), `heal, give, move, nudge, length and trickle all take (${res.join(" ")})`);
  st = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(st.dials?.showMin === 30 && st.dials?.trickle === 2, "the dials read back (30 min, 2x)");
  const cl = await act({ op: "clear" });
  ok(cl.status === 200 && cl.body?.n >= 1, `put them all down (${cl.body?.n})`);
  ok((await api("POST", "/api/admin/survivorz/nohold", member, { on: true })).status === 403 && (await api("POST", "/api/admin/survivorz/nohold", admin, { on: true })).body?.noHold === true, "the hold switch: refused a member, the admin's sticks");
  ok((await api("POST", "/api/admin/survivorz/nohold", admin, { on: false })).body?.noHold === false, "…and goes back off");
  await lever(admin, "stop");
  // STAGE 3: the run setup's picks, the run history, the lineup and its presets
  const su = (await api("GET", "/api/admin/survivorz/setup", admin)).body;
  const ch = su?.choices;
  ok(ch?.starts?.length >= 2 && ch.part.length >= 1 && ch.note.length >= 1, "the setup names the start rooms and the hiding places");
  const c2 = su.characters.slice(0, 2).map((c) => c.id);
  ok((await lever(admin, "test", { cast: c2, starts: { [c2[0]]: ch.starts[0].id, [c2[1]]: ch.starts[0].id } })).body?.error === "bad_starts", "two survivors picked into one room are refused 400");
  ok((await lever(admin, "test", { cast: c2, partSpot: "nowhere" })).body?.error === "bad_spot", "a made-up hiding place is refused 400");
  const part = ch.part[ch.part.length - 1].id, note = ch.note[ch.note.length - 1].id;
  r = await lever(admin, "test", { cast: c2, starts: { [c2[0]]: ch.starts[1].id }, partSpot: part, noteSpot: note });
  ok(r.body?.setup?.starts?.find((x) => x.who === c2[0])?.room === ch.starts[1].id && r.body.setup.partSpot === part && r.body.setup.noteSpot === note, "the picks take: the start room, the part's and the code's spots");
  r = await lever(admin, "reset", { same: true });
  ok(r.body?.setup?.starts?.find((x) => x.who === c2[0])?.room === ch.starts[1].id && r.body.setup.partSpot === part, "a restart keeps the picks");
  let hist = (await api("GET", "/api/admin/survivorz/history", admin)).body?.runs ?? [];
  ok(hist[0]?.why === "restarted" && hist[0].test === true && hist[0].survivors.length === 2, "the restarted run is in the history");
  await lever(admin, "stop");
  const n1 = hist.length;
  hist = (await api("GET", "/api/admin/survivorz/history", admin)).body?.runs ?? [];
  ok(hist.length === n1 + 1 && hist[0].why === "stopped", "the stopped run is in the history");
  ok((await api("GET", "/api/admin/survivorz/history", member)).status === 403, "a member is refused the history");
  const ids3 = su.characters.map((c) => c.id);
  ok((await api("POST", "/api/admin/survivorz/lineup", admin, { starters: ["nobody"], bench: [], maxGroup: 2 })).status === 400 && (await api("POST", "/api/admin/survivorz/lineup", admin, { starters: ids3.slice(0, 3), bench: [], maxGroup: 2 })).status === 400, "a bad lineup is refused 400");
  const lu = await api("POST", "/api/admin/survivorz/lineup", admin, { starters: ids3.slice(0, 1), bench: ids3.slice(1, 4), maxGroup: 3 });
  ok(lu.status === 200 && JSON.stringify(lu.body.cast) === JSON.stringify(ids3.slice(0, 3)), "the bench fills the empty seats in order");
  ok((await api("POST", "/api/admin/survivorz/lineup", member, { starters: ids3.slice(0, 1), bench: [], maxGroup: 1 })).status === 403, "a member is refused the lineup");
  await api("POST", "/api/admin/survivorz/lineup/preset", admin, { op: "save", name: "Harness", lineup: lu.body.lineup });
  await api("POST", "/api/admin/survivorz/lineup", admin, { starters: ids3.slice(0, 2), bench: [], maxGroup: 2 });
  const used = await api("POST", "/api/admin/survivorz/lineup/preset", admin, { op: "use", name: "Harness" });
  ok(used.status === 200 && used.body.lineup.maxGroup === 3 && used.body.lineup.starters.length === 1, "a saved preset is used");
  const del = await api("POST", "/api/admin/survivorz/lineup/preset", admin, { op: "delete", name: "Harness" });
  ok(del.status === 200 && !del.body.presets.some((p) => p.name === "Harness"), "a preset is deleted");
  r = await lever(admin, "start");
  ok((await act({ op: "heal", id: who })).body?.error === "not_test", "a real show refuses the control room's levers (409 not_test)");
  ok(r.body?.runNo === n0 + 1 && r.body?.test === false, "the next real show is the next number (test runs aren't counted)");
}

console.log("TECHNICAL DIFFICULTIES (the AI drops mid-show: the show holds)");
{
  // no engine configured (dev, every harness): the show never holds, whatever the switch says
  const w0 = await watch(admin);
  await sleep(2200);
  ok((await api("GET", "/api/admin/survivorz/show", admin)).body?.held === false && framesOf(w0, "tick").length > 0, "with no AI engine configured at all, the show runs on code and never holds");
  w0.ws.close();
  // an engine configured but unreachable (the restart resumes the running show), the survivors' AI switched on
  await stop(srv);
  ({ srv, up } = await boot({ NPC_BRAIN_URL: "http://127.0.0.1:9" }));
  const w = await watch(admin);
  await sleep(400);
  await api("POST", "/api/admin/survivorz/talk", admin, { on: true });
  let st = null;
  for (let i = 0; i < 20; i++) { await sleep(250); st = (await api("GET", "/api/admin/survivorz/show", admin)).body; if (st?.held) break; }
  ok(st?.held === true && framesOf(w, "hold").some((x) => x.f.on === true), "the show holds, and every watcher is told (the Technical difficulties card)");
  const tA = Date.now(), simA = st.t;
  await sleep(1000);
  const st2 = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(framesOf(w, "tick", tA + 100).length === 0 && st2.t === simA, "…and its clock stops");
  await api("POST", "/api/admin/survivorz/talk", admin, { on: false });
  await sleep(1600);
  ok((await api("GET", "/api/admin/survivorz/show", admin)).body?.held === false && framesOf(w, "hold").some((x) => x.f.on === false), "the switch off (or the engine back): the show carries on");
  // a run that's over never holds (Nov 3 2026: the hold card sat over a finished run's end card)
  for (const s of (await api("GET", "/api/admin/survivorz/show", admin)).body?.setup?.starts ?? []) await api("POST", "/api/admin/survivorz/body", admin, { op: "kill", id: `s:${s.who}` });
  const isOver = () => framesOf(w, "tick").some((x) => x.f.goals?.over) || framesOf(w, "snap").some((x) => x.f.goals?.over);
  for (let i = 0; i < 40 && !isOver(); i++) await sleep(250);
  const tOver = Date.now();
  await api("POST", "/api/admin/survivorz/talk", admin, { on: true });
  await sleep(2200);
  ok(isOver() && (await api("GET", "/api/admin/survivorz/show", admin)).body?.held === false && !framesOf(w, "hold", tOver).some((x) => x.f.on === true), "a run that's over doesn't hold when the AI drops (its end card stays up)");
  await api("POST", "/api/admin/survivorz/talk", admin, { on: false });
  w.ws.close();
  await stop(srv);
  ({ srv, up } = await boot());
}

console.log("IT STAYS ON");
{
  await lever(admin, "start");
  await lever(admin, "resume");   // (the run before may have been left paused: a start no longer un-pauses one already going)
  await lever(admin, "go");
  await stop(srv);
  ({ srv, up } = await boot());
  ok(up, "the server comes back");
  const s = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(s?.running === true, "a show that was running before the restart is running after it");
  const w = await watch(admin);
  // (a show a second old: everybody is still getting their bearings — 1.5 to 4 s — so the first tick that carries
  // anything can be seconds off. A fixed 800 ms failed four runs in four on Nov 13 2026; wait for it instead.)
  for (let i = 0; i < 40 && framesOf(w, "tick").length < 1; i++) await sleep(200);
  ok(w.frames[0]?.f.type === "snap" && framesOf(w, "tick").length >= 1, "…and a watcher gets it from the start");
  w.ws.close();
}

console.log("THE COUNTDOWN (BUNKER.md 37: five minutes on a card before a real show)");
{
  await lever(admin, "stop");
  await stop(srv);
  ({ srv, up } = await boot({ SURVIVORZ_COUNTDOWN_MS: "60000" }));
  const w = await watch(admin);
  const r = await lever(admin, "start");
  ok(r.body?.countdown > 50_000, "a real show starts on its countdown");
  await sleep(1200);
  const cd = framesOf(w, "countdown");
  ok(cd.length >= 1 && cd[0].f.ms > 50_000 && framesOf(w, "tick").length === 0, "the watcher is told, and the clock doesn't run meanwhile");
  const tG = Date.now();
  ok((await lever(admin, "go")).body?.countdown === 0, "Go now ends it");
  await sleep(2500);
  ok(framesOf(w, "countdown", tG).some((x) => x.f.ms === 0) && framesOf(w, "tick", tG).length >= 1, "…the watcher is told, and the ticks start");
  await lever(admin, "stop");
  // THE COUNTDOWN, CHOSEN (Josh, Nov 3 2026: "let me set the wait time for the stream to start"): the Start card's
  // none / 1 / 2 / 5 / 10 / 15 minutes, checked by the server, audited, and kept for a restart of the same show
  const su = (await api("GET", "/api/admin/survivorz/setup", admin)).body;
  ok(JSON.stringify(su?.choices?.countdown) === "[0,1,2,5,10,15]" && su.countdownDefault === 1, "the setup offers the countdown choices and the server's default (1 min in this boot)");
  ok((await lever(admin, "start", { countdown: 3 })).body?.error === "bad_countdown" && (await lever(admin, "start", { countdown: "soon" })).status === 400 && (await lever(admin, "start", { countdown: -1 })).status === 400
    && (await api("GET", "/api/admin/survivorz/show", admin)).body?.running === false, "a countdown off the list is refused 400 and nothing starts");
  const c2 = await lever(admin, "start", { countdown: 2 });
  ok(c2.body?.countdown > 110_000 && c2.body.countdown <= 120_000, `a chosen countdown takes effect over the default (2 min asked, ${Math.round((c2.body?.countdown ?? 0) / 1000)} s left)`);
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  const arow = db.prepare("SELECT detail FROM audit WHERE action = 'survivorz.start' ORDER BY rowid DESC LIMIT 1").get();
  db.close();
  ok(arow?.detail === "countdown 2 min", `the chosen countdown is audited ("${arow?.detail}")`);
  ok((await lever(admin, "reset")).body?.countdown > 110_000, "…and a restart of that show waits as long again");
  await lever(admin, "stop");
  ok((await lever(admin, "start", { countdown: 0 })).body?.countdown === 0, "a countdown of none starts the clock at once");
  await lever(admin, "stop");
  const t = await lever(admin, "test", { countdown: 10 });
  ok(t.body?.countdown === 0, "a test run has no countdown (whatever is asked)");

  // THE REVIEW ROUND (Nov 12 2026): the levers refuse what they can't do, instead of doing something else
  const again = await lever(admin, "start");
  ok(again.status === 409 && again.body?.error === "already_running", "starting while a run is going is refused 409 (it used to answer 200, audit a start and unpause)");
  ok((await lever(admin, "wait", { minutes: 1 })).body?.error === "no_countdown", "a test run has no countdown to add to");
  const sv = await lever(admin, "save");
  ok(sv.status === 200 && sv.body?.saved?.at > 0 && sv.body.saved.bytes > 100, "Save now writes the running world");
  const dg = (await api("GET", "/api/admin/survivorz/show", admin)).body?.diag;
  ok(dg && dg.tickBudgetMs === 100 && dg.admins >= 1 && dg.maxWatchers === 60 && dg.beganAt > 0 && typeof dg.tickAvgMs === "number" && typeof dg.lateTicks === "number",
    "the status carries the diagnostics (the tick's budget and average, late ticks, who's watching)");
  await lever(admin, "stop");
  for (const op of ["reset", "pause", "resume", "save"]) {
    const r = await lever(admin, op);
    ok(r.status === 409 && r.body?.error === "not_running", `${op} with nothing running is refused 409`);
  }
  ok((await api("GET", "/api/admin/survivorz/show", admin)).body?.running === false, "…and none of them started a show (a restart with nothing running used to start a numbered one)");
  // the countdown: a minute added, never past half an hour, refused off its range
  const cw = await lever(admin, "start", { countdown: 1 });
  const w1 = await lever(admin, "wait", { minutes: 2 });
  ok(w1.status === 200 && w1.body.countdown > cw.body.countdown + 100_000, `minutes can be added to a countdown (${Math.round(cw.body.countdown / 1000)} s -> ${Math.round(w1.body.countdown / 1000)} s)`);
  ok((await lever(admin, "wait", { minutes: 0 })).body?.error === "bad_wait" && (await lever(admin, "wait", { minutes: 99 })).status === 400, "a wait off 1-15 minutes is refused");
  for (let i = 0; i < 3; i++) await lever(admin, "wait", { minutes: 15 });
  ok((await api("GET", "/api/admin/survivorz/show", admin)).body?.countdown <= 30 * 60_000, "…and a countdown never reaches past half an hour");
  // a restart in the middle of the countdown keeps counting (it used to drop it: the show started unannounced on a deploy)
  await stop(srv);
  ({ srv, up } = await boot());
  const rc = (await api("GET", "/api/admin/survivorz/show", admin)).body;
  ok(up && rc?.running === true && rc.countdown > 60_000, `a restart mid-countdown keeps the countdown (${Math.round((rc?.countdown ?? 0) / 1000)} s left)`);
  await lever(admin, "stop");
  // THE RUN HISTORY: one row a run
  const hs = (await api("GET", "/api/admin/survivorz/history", admin)).body?.runs ?? [];
  ok(hs.length > 0 && new Set(hs.map((h) => h.run)).size === hs.length, `the run history holds one row a run (${hs.length})`);
  // THE LINEUP reads gently: somebody no longer in the show leaves it, the rest stays
  {
    const cur = (await api("GET", "/api/admin/survivorz/lineup", admin)).body;
    const ids = [...cur.lineup.starters, ...cur.lineup.bench];
    const db2 = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db2.prepare("INSERT INTO app_kv (key, value) VALUES ('survivorz_lineup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify({ starters: ["nobody-here", ids[0]], bench: ids.slice(1, 3), maxGroup: 2 }));
    db2.close();
    const got = (await api("GET", "/api/admin/survivorz/lineup", admin)).body?.lineup;
    ok(got && JSON.stringify(got.starters) === JSON.stringify([ids[0]]) && got.maxGroup === 2 && !got.bench.includes("nobody-here") && got.bench.length === Math.min(2, ids.length - 1),
      "a saved lineup naming somebody who left keeps everyone else (it used to fall back to the default whole)");
    await api("POST", "/api/admin/survivorz/lineup", admin, cur.lineup);
  }
  w.ws.close();
}

// A SCREEN THAT HAS STOPPED READING IS LET GO (the code review's C-13), on a server told to keep at most 300 KB
// waiting for any one socket
{
  console.log("A SCREEN THAT STOPS READING");
  aw.ws.close();
  await stop(srv);
  ({ srv, up } = await boot({ SURVIVORZ_MAX_BUFFERED: "300000" }));
  aw = await watch(admin);
  await lever(admin, "stop");
  const t1 = await lever(admin, "test", { map: "bunker" });
  await sleep(400);
  const frozen = await watch(admin);
  await sleep(300);
  const before = frozen.frames.length;
  frozen.ws._socket.pause();                       // the tab is frozen: nothing is read off the line
  // (a new world a few times a second: each is a whole snapshot to every screen)
  let resets = 0;
  for (let i = 0; i < 80 && frozen.closed === null && frozen.ws.readyState === 1; i++) { await lever(admin, "reset"); resets++; await sleep(100); }
  frozen.ws._socket.resume();
  await sleep(600);
  const reading = framesOf(aw, "snap").length;
  ok(up && t1.status === 200 && before > 0 && frozen.closed !== null, `a watch socket that stops reading is hung up on once more than the limit is waiting for it (closed ${frozen.closed} after ${resets} snapshots)`);
  ok(aw.closed === null && reading >= resets, `...and one that keeps reading is not (${reading} snapshots taken)`);
  const again = await watch(admin);
  await sleep(300);
  ok(again.refused === null && framesOf(again, "snap").length === 1, "the page comes back on a new socket and is sent the world");
  again.ws.close();
  await lever(admin, "stop");
}

aw.ws.close();
await stop(srv);
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\n${n - bad}/${n} passed`);
if (bad) { console.log(log.split("\n").slice(-30).join("\n")); process.exit(1); }
