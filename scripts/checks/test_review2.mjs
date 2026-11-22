// THE SEP-2026 REVIEW ROUND, PART TWO — cost-amplification caps, over a real
// server plus two in-process store checks. Every cap here corresponds to a
// path where one member (or, for the attachment relay, one anonymous address)
// could make the house do unbounded work: fan-out frames, per-row query
// storms, unbounded table growth. Each assert proves the cap fires AND that
// ordinary use stays under it.
//
// Run: node scripts/checks/test_review2.mjs        (needs `npm run build`)

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { MAX_DISPLAY_NAME } = require(path.join(ROOT, "dist", "types.js"));
const { MAX_CHANNELS_PER_PAGE, CHANNEL_CREATE_BURST, MAX_ALLOW_LIST } = require(path.join(ROOT, "dist", "routes", "channels.js"));
const { MAX_OPEN_OFFERS } = require(path.join(ROOT, "dist", "routes", "trade.js"));
const { MAX_SOCKETS_PER_USER, STATE_FRAME_BURST } = require(path.join(ROOT, "dist", "realtime.js"));
const { FLOOR_STATE_BURST } = require(path.join(ROOT, "dist", "casino", "floor.js"));
const { RELAYS_PER_IP_WINDOW } = require(path.join(ROOT, "dist", "federation", "files.js"));
const { MAX_INFLIGHT_PER_SATELLITE, satelliteInflight } = require(path.join(ROOT, "dist", "federation", "link.js"));

const PORT = 8500;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "review2-harness");
const DB = path.join(DATA, "solace.db");
const DB2 = path.join(ROOT, "data", "review2-store.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
for (const f of [DB2, DB2 + "-wal", DB2 + "-shm"]) rmSync(f, { force: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch { /* gone */ } };

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, headers: res.headers };
};
let regSeq = 0;
const register = async (username, extra = {}) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `vault marmalade lantern quartz ${regSeq} 47`, acceptTerms: true, ...extra },
    headers: { "x-forwarded-for": `10.78.${Math.floor(regSeq / 200)}.${10 + (regSeq % 200)}` },
  });
  return r;
};
const socket = (pathName, token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${pathName}?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = { ws, frames, closeCode: null, binaryFrames: 0, send: (m) => ws.send(JSON.stringify(m)), count: (t) => frames.filter((f) => f.type === t).length };
    ws.on("message", (m, isBinary) => { c.binaryFrames += isBinary ? 1 : 0; try { frames.push(JSON.parse(String(m))); } catch { /* junk */ } });
    ws.on("close", (code) => { c.closeCode = code; });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + "/health")).ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" }, headers: { "x-forwarded-for": "10.78.9.9" } })).body;
  if (!admin?.token) throw new Error("admin login failed: " + JSON.stringify(admin));
  const A = admin.token;

  console.log("\n-- the display name cap at sign-up --");
  const longName = "x".repeat(MAX_DISPLAY_NAME + 1);
  const tooLong = await register("r2_toolong", { displayName: longName });
  ok(tooLong.status === 400 && tooLong.body?.error === "bad_display_name", `a ${MAX_DISPLAY_NAME + 1}-char display name is refused at sign-up (400 bad_display_name)`);
  const alpha = (await register("r2_alpha", { displayName: "x".repeat(MAX_DISPLAY_NAME) })).body;
  ok(!!alpha?.token && alpha.user.displayName.length === MAX_DISPLAY_NAME, `exactly ${MAX_DISPLAY_NAME} is accepted`);
  const beta = (await register("r2_beta")).body;
  ok(!!beta?.token, "a second member registers");
  const T = alpha.token, B = beta.token;

  console.log("\n-- profile edits are budgeted --");
  let meOk = 0, me429 = 0;
  for (let i = 0; i < 12; i++) {
    const r = await api("PATCH", "/api/me", { token: T, body: { displayName: `Alpha ${i}` } });
    if (r.status === 200) meOk++; else if (r.status === 429) me429++;
  }
  ok(meOk === 10 && me429 === 2, `ten profile edits a minute pass, the eleventh is 429 (${meOk} ok / ${me429} refused)`);

  console.log("\n-- channel creation: per-member pace + per-page ceiling --");
  let chOk = 0, ch429 = 0; let firstChannel = null;
  for (let i = 0; i < CHANNEL_CREATE_BURST + 2; i++) {
    const r = await api("POST", "/api/channels", { token: T, body: { name: `alpha-room-${i}` } });
    if (r.status === 200) { chOk++; firstChannel ??= r.body.channel; } else if (r.status === 429) ch429++;
  }
  ok(chOk === CHANNEL_CREATE_BURST && ch429 === 2, `a member creates ${CHANNEL_CREATE_BURST} channels then is paced (429) — ${chOk} ok / ${ch429} refused`);
  const db = new DatabaseSync(DB);
  const inGeneral = () => Number(db.prepare("SELECT COUNT(*) AS n FROM channels WHERE pageId = 1").get().n);
  let adminOk = 0, full = null;
  while (adminOk < MAX_CHANNELS_PER_PAGE + 5) {
    const r = await api("POST", "/api/channels", { token: A, body: { name: `house-room-${adminOk}` } });
    if (r.status === 200) adminOk++;
    else { full = r; break; }
  }
  ok(full?.status === 409 && full.body?.error === "page_full", "the admin is not paced but the page fills: 409 page_full");
  ok(inGeneral() === MAX_CHANNELS_PER_PAGE, `…at exactly ${MAX_CHANNELS_PER_PAGE} channels in the page (${inGeneral()})`);
  const listed = await api("GET", "/api/channels", { token: T });
  ok(listed.status === 200 && listed.body.channels.length === MAX_CHANNELS_PER_PAGE, "a full page still lists for everyone");

  console.log("\n-- the allow-list checks its length before it looks anything up --");
  const hugeList = await api("PATCH", `/api/channels/${firstChannel.id}/allow`, { token: T, body: { userIds: Array.from({ length: MAX_ALLOW_LIST + 1 }, (_, i) => i + 1) } });
  ok(hugeList.status === 400 && hugeList.body?.error === "bad_allow_list", `${MAX_ALLOW_LIST + 1} ids is refused outright (400)`);
  const smallList = await api("PATCH", `/api/channels/${firstChannel.id}/allow`, { token: T, body: { userIds: [beta.user.id] } });
  ok(smallList.status === 200, "a real allow-list still lands");

  console.log("\n-- open trade offers are capped: one per pair, ten out --");
  const codes = db.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT ?").all(MAX_OPEN_OFFERS + 3).map((r) => r.code);
  const store2 = new Store(DB); // a second connection on the live DB (WAL) — the grant path the Wheel uses
  for (const c of codes) store2.addEmoji(alpha.user.id, c);
  const targets = [];
  for (let i = 0; i < MAX_OPEN_OFFERS + 1; i++) targets.push((await register(`r2_target_${i}`)).body);
  ok(targets.every((t) => t?.token), `${targets.length} trade targets registered`);
  let offersOk = 0, tooMany = null;
  for (let i = 0; i < targets.length; i++) {
    const r = await api("POST", "/api/trades", { token: T, body: { toUser: targets[i].user.id, offered: [codes[i]], requested: [] } });
    if (r.status === 200) offersOk++; else { tooMany = r; break; }
  }
  ok(offersOk === MAX_OPEN_OFFERS && tooMany?.status === 409 && tooMany.body?.error === "too_many_offers", `${MAX_OPEN_OFFERS} open offers, the next is 409 too_many_offers`);
  const dup = await api("POST", "/api/trades", { token: T, body: { toUser: targets[0].user.id, offered: [codes[MAX_OPEN_OFFERS + 1]], requested: [] } });
  ok(dup.status === 409 && dup.body?.error === "offer_pending", "a second offer to someone you already have one out to is 409 offer_pending");
  const cancelId = (await api("GET", "/api/trades", { token: T })).body.outgoing[0].id;
  await api("POST", `/api/trades/${cancelId}/cancel`, { token: T });
  const again = await api("POST", "/api/trades", { token: T, body: { toUser: targets[MAX_OPEN_OFFERS].user.id, offered: [codes[MAX_OPEN_OFFERS + 1]], requested: [] } });
  ok(again.status === 200, "cancelling one frees a slot");
  const fat = await api("POST", "/api/trades", { token: B, body: { toUser: alpha.user.id, offered: Array.from({ length: 5000 }, (_, i) => "nope" + i), requested: [] } });
  ok(fat.status === 400 && fat.body?.error === "bad_items", "a 5,000-code offer is refused before any catalog lookup (400)");

  console.log("\n-- search is a typing-speed budget --");
  let sOk = 0, s429 = 0;
  for (let i = 0; i < 32; i++) {
    const r = await api("GET", "/api/search?q=hello", { token: T });
    if (r.status === 200) sOk++; else if (r.status === 429) s429++;
  }
  ok(sOk === 30 && s429 === 2, `thirty searches a minute, then 429 (${sOk}/${s429})`);

  console.log("\n-- the page door is a door, not a metronome --");
  const page = (await api("POST", "/api/pages", { token: A, body: { name: "Review Lounge", joinPolicy: "open" } })).body?.page;
  ok(!!page?.id, "the admin raises an open page");
  let doorOk = 0, door429 = 0;
  for (let i = 0; i < 13; i++) {
    const r = await api("POST", `/api/pages/${page.id}/${i % 2 === 0 ? "join" : "leave"}`, { token: T });
    if (r.status === 200) doorOk++; else if (r.status === 429) door429++;
  }
  ok(doorOk === 12 && door429 === 1, `twelve passes through the door a minute, the thirteenth is 429 (${doorOk}/${door429})`);

  console.log("\n-- sockets per account --");
  const bSock = await socket("/ws", B);
  const socks = [];
  for (let i = 0; i < MAX_SOCKETS_PER_USER + 1; i++) socks.push(await socket("/ws", T));
  await sleep(300);
  ok(socks[0].closeCode === 4008, `the ${MAX_SOCKETS_PER_USER + 1}th socket evicts the OLDEST (close 4008)`);
  ok(socks.slice(1).every((s) => s.ws.readyState === WebSocket.OPEN), "…and every newer socket stays open");
  ok(!bSock.frames.some((f) => f.type === "presence" && f.event === "offline" && f.userId === alpha.user.id), "the eviction never reads as the member going offline");

  console.log("\n-- state frames are budgeted --");
  bSock.frames.length = 0;
  const live = socks[1];
  for (let i = 0; i < STATE_FRAME_BURST + 20; i++) live.send({ type: "status", status: i % 2 ? "away" : "busy" });
  await sleep(600);
  const statusFrames = bSock.frames.filter((f) => f.type === "status" && f.userId === alpha.user.id).length;
  ok(bSock.binaryFrames === 0 && bSock.frames.length > 0, "every app-socket frame arrives as a TEXT frame (a Buffer send must not autodetect as binary — browsers would get a Blob)");
  ok(statusFrames === STATE_FRAME_BURST, `${STATE_FRAME_BURST + 20} alternating status flips reach the room as exactly ${STATE_FRAME_BURST} (${statusFrames})`);

  console.log("\n-- the casino floor's state frames are budgeted too --");
  const bFloor = await socket("/ws-casino", B);
  bFloor.send({ type: "enter" });
  const aFloor = await socket("/ws-casino", T);
  aFloor.send({ type: "enter" });
  await sleep(300);
  bFloor.frames.length = 0;
  for (let i = 0; i < FLOOR_STATE_BURST + 20; i++) aFloor.send({ type: "em", id: i % 2 ? "hiphop" : "snake" });
  await sleep(600);
  const emFrames = bFloor.count("em");
  ok(emFrames === FLOOR_STATE_BURST - 1, `the enter plus ${FLOOR_STATE_BURST - 1} emotes fill the window; the rest are dropped (${emFrames} seen)`);
  ok(aFloor.ws.readyState === WebSocket.OPEN, "…without dropping the socket");

  console.log("\n-- the public attachment relay is capped per address --");
  db.prepare("INSERT INTO attachments (ownerId, scope, messageId, file, name, kind, mime, bytes, createdAt, satelliteId) VALUES (?, 'channel', NULL, ?, 'r.png', 'image', 'image/png', 1, ?, 1)")
    .run(alpha.user.id, "remote-relay-probe.png", Date.now());
  let relay503 = 0, relay429 = 0;
  for (let i = 0; i < RELAYS_PER_IP_WINDOW + 2; i++) {
    const r = await fetch(BASE + "/attachments/remote-relay-probe.png", { headers: { "x-forwarded-for": "203.0.113.7" } });
    if (r.status === 503) relay503++; else if (r.status === 429) relay429++;
  }
  ok(relay503 === RELAYS_PER_IP_WINDOW && relay429 === 2, `${RELAYS_PER_IP_WINDOW} relay attempts from one address (an offline host: 503), then 429 (${relay503}/${relay429})`);
  const other = await fetch(BASE + "/attachments/remote-relay-probe.png", { headers: { "x-forwarded-for": "203.0.113.8" } });
  ok(other.status === 503, "another address still gets through");
  ok(satelliteInflight(1) === 0 && MAX_INFLIGHT_PER_SATELLITE > 0, "nothing is left in flight on the satellite's ledger");

  for (const s of [...socks, bSock, aFloor, bFloor]) { try { s.ws.close(); } catch { /* gone */ } }
  db.close(); store2.close?.();

  console.log("\n-- in-process: spray marks are a canvas, not a log --");
  const st = new Store(DB2);
  for (let i = 0; i < Store.MARKS_PER_FACE + 50; i++) st.brAddMark("A3", { cellX: 10, cellY: 10, face: "N", u: 0.5, v: 0.5, color: "black", userId: 1 });
  ok(st.brMarksInRect("A3", 10, 10, 11, 11).length === Store.MARKS_PER_FACE, `${Store.MARKS_PER_FACE + 50} dots on one wall face keep the newest ${Store.MARKS_PER_FACE}`);
  for (let f = 0; f < 11; f++) for (let i = 0; i < Store.MARKS_PER_FACE; i++) st.brAddMark("A3", { cellX: 20 + f, cellY: 20, face: "S", u: 0.1, v: 0.1, color: "red", userId: 1 });
  ok(st.brMarksInRect("A3", 20, 20, 36, 36).length === Store.MARKS_PER_CHUNK, `a chunk read ships at most ${Store.MARKS_PER_CHUNK} marks`);

  console.log("\n-- in-process: migration 88 truncates display names already over the cap --");
  const raw = new DatabaseSync(DB2);
  const uid = st.createUser({ username: "r2_old", displayName: "short", passwordHash: "x" }).id;
  raw.prepare("UPDATE users SET displayName = ? WHERE id = ?").run("y".repeat(70), uid);
  raw.prepare("DELETE FROM _migrations WHERE id = 88").run();
  ok(raw.prepare("SELECT length(displayName) AS l FROM users WHERE id = ?").get(uid).l === 70, "a 70-char name planted under the old rules");
  raw.close(); st.close?.();
  const st2 = new Store(DB2);
  ok(st2.getUserById(uid).displayName.length === MAX_DISPLAY_NAME, `…is ${MAX_DISPLAY_NAME} after the migration re-runs`);
  ok(st2.createUser({ username: "r2_new", displayName: "z".repeat(90), passwordHash: "x" }).displayName.length === MAX_DISPLAY_NAME, "the store clamps a new row regardless of the route");
  st2.close?.();

  console.log("\n-- in-process: the housekeeping half (part three) --");
  const st3 = new Store(DB2);
  const ua = st3.createUser({ username: "r3_a", displayName: "A", passwordHash: "x" }).id;
  const ub = st3.createUser({ username: "r3_b", displayName: "B", passwordHash: "x" }).id;
  const ch = st3.createChannel({ name: "busy-room", topic: null, createdBy: ub, parentId: null, kind: "text", pageId: 1 });
  for (let i = 0; i < Store.UNREAD_CAP + 50; i++) st3.createMessage({ channelId: ch.id, userId: ub, body: `m${i}` });
  ok(st3.channelUnreads(ua)[ch.id] === Store.UNREAD_CAP, `${Store.UNREAD_CAP + 50} unread messages count as ${Store.UNREAD_CAP} (the badge's 99+ cap, not a whole-channel count)`);
  const t0 = Date.now() - 1;
  for (let i = 0; i < 5; i++) st3.recordError("server", "same route, same message", null, "/api/x");
  ok(st3.errorSurge(t0) === 5, "five hits on ONE error signature count as five toward the surge alert (rows would say one)");
  const raw3 = new DatabaseSync(DB2);
  st3.createSession(ua, "old-token-aaaa");
  st3.createSession(ua, "fresh-token-bbbb");
  raw3.prepare("UPDATE sessions SET lastSeenAt = ?, createdAt = ? WHERE token = ?").run(Date.now() - 40 * 86_400_000, Date.now() - 40 * 86_400_000, "old-token-aaaa");
  st3.audit(null, "ancient"); raw3.prepare("UPDATE audit SET at = ? WHERE action = 'ancient'").run(Date.now() - 400 * 86_400_000);
  st3.audit(null, "recent");
  const pruned = st3.pruneByAge(30 * 86_400_000, 365 * 86_400_000);
  ok(pruned.sessions === 1 && pruned.audit === 1, `age pruning takes the 40-day-idle session and the 400-day audit row (${pruned.sessions}/${pruned.audit})`);
  ok(!!raw3.prepare("SELECT 1 FROM sessions WHERE token = 'fresh-token-bbbb'").get() && !!raw3.prepare("SELECT 1 FROM audit WHERE action = 'recent'").get(), "…and leaves the live session and the recent audit row");
  ok(st3.db.prepare("PRAGMA busy_timeout").get().timeout === 5000, "the connection waits 5s on a busy database instead of throwing at once");
  raw3.close(); st3.close?.();

  stop();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); stop(); process.exit(1); });
