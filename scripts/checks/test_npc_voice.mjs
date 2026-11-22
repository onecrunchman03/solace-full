// THE HOUSE'S BRAINS — EVERYTHING ELSE THEY SAY (Oct 2026), over a real
// server and a FAKE model whose behaviour the harness switches on demand.
//
// Run:  npm run build && node scripts/checks/test_npc_voice.mjs
//
// Josh: "lets just get rid of the static dialogue of before and run
// everything now with the AI model." The scripted line became the BRIEF the
// model says in its own words; this pins the contract:
//   · COUNTER TALK (/api/npc/lines): a batch written for the asker, carrying
//     their own facts and the venue; cached, refreshed, validated line by
//     line (an invented figure or — at the goblins' kiosk for a paid-up
//     customer — the cells are dropped); bad venue/npc refused; 503 when the
//     brains are off, so the client uses its scripted pool.
//   · REACTIONS (/api/npc/voice): the scripted line comes back voiced, or
//     UNCHANGED when the model drops a figure, invents one, or is off.
//   · THE FLOOR (#general): Sterling's commentary voiced with the player's
//     name kept, and the brief posted as written when the rewrite loses a
//     figure; a special keeps its @everyone ping in front.
//   · THE GOBLINS: a letter voiced, with THE SMALL PRINT re-attached verbatim
//     and never handed to the model; a letter that names the cells under THE
//     MASK falls back to the script; the barker and Sterling's scold voiced.
//   · DR. VOSS: the field notice voiced, Sterling answering it as a reply.
//   · COMMANDS: a bare /sterling is a conversation that still points at
//     /sterling help; /sterling pot is still the exact card.
//   · INSTRUMENTS STAY EXACT: a report's DM to the admin is never sent to
//     the model.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8537;
const FAKE_PORT = 8538;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "npc-voice-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the fake model ----------------------------------------------------------
const MODEL = "fake-npc:1b";
const reqs = [];
let mode = "voice"; // voice | drop | invent | cells
const fake = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => { raw += d; });
  req.on("end", () => {
    const send = (o) => { try { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); } catch {} };
    if (req.url === "/api/ps") return send({ models: [{ name: MODEL, model: MODEL }] });
    const body = JSON.parse(raw || "{}");
    const msgs = body.messages ?? [];
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const user = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const isBubble = !!body.format?.properties?.lines;
    const isGate = !!body.format && !isBubble;
    const isRewrite = system.includes("YOUR TASK: the message below is what you mean to say");
    const isReact = / JUST DID: /.test(system);
    const kind = isBubble ? "bubble" : isGate ? "gate" : isRewrite ? "rewrite" : isReact ? "react" : system.startsWith("MEMORY KEEPER") ? "memory" : "reply";
    reqs.push({ at: Date.now(), kind, system, user });
    if (isGate) return send({ message: { content: '{"kind":"chat","other":"none"}' } });
    if (isBubble) {
      const lines = ["Welcome back, friend.", "The floor is busy tonight.", "That will be 999,999 silver.", "Mind the step.", "The cells are lovely this time of year.", "Another fine evening."];
      return send({ message: { content: JSON.stringify({ lines }) } });
    }
    if (isReact) {
      if (mode === "invent") return send({ message: { content: "That will be 777,777, thank you." } });
      return send({ message: { content: "REACTED, warmly." } });
    }
    if (isRewrite) {
      let out = "VOICED: " + user;
      if (mode === "drop") out = "VOICED: " + user.replace(/\d[\d,]*/g, "some");
      if (mode === "invent") out = "VOICED: " + user + " Also 777,777.";
      if (mode === "cells") out = "VOICED: " + user + " Or it's the cells.";
      return send({ message: { content: out } });
    }
    send({ message: { content: "Noted." } });
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));
const since = (t, kind) => reqs.filter((r) => r.at >= t && (!kind || r.kind === kind));

// ---- the server ------------------------------------------------------------------
const ADMIN_PW = "Harness!Admin9xy";
const PW = "Sturdy!Passw0rd#9";
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_HOUSE_AI: "1", NPC_BRAIN_URL: `http://127.0.0.1:${FAKE_PORT}`, NPC_BRAIN_MODEL: MODEL,
    NPC_ASK_PER_MIN: "1000", NPC_ASK_PER_HOUR: "100000", NPC_MEMORY_IDLE_MS: "600000",
    NPC_BUBBLE_FRESH_MS: "1000", NPC_VOICE_PER_MIN: "1000", NPC_LINES_PER_MIN: "1000",
    STERLING_COMMENT_MS: "0", STERLING_REPLY_MS: "50",
    GOBLIN_SCOLD_MS: "300", GOBLIN_RETORT_MS: "300", VOSS_SCOLD_MS: "300", VOSS_BARGE_MS: "300",
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
let seq = 0;
const register = async (username, displayName) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][seq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password: PW, displayName, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};
/** The newest message in a channel by one author, after an id. */
const waitPost = async (token, chId, authorId, afterId, pred = () => true, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const msgs = (await api("GET", `/api/channels/${chId}/messages`, { token })).body?.messages ?? [];
    const m = msgs.filter((x) => x.userId === authorId && x.id > afterId && pred(x)).pop();
    if (m) return m;
    await sleep(80);
  }
  return null;
};
const lastId = async (token, chId) => {
  const msgs = (await api("GET", `/api/channels/${chId}/messages`, { token })).body?.messages ?? [];
  return msgs.length ? msgs[msgs.length - 1].id : 0;
};

for (let i = 0; i < 160; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(250); }
for (let i = 0; i < 40 && !/brain ONLINE/.test(log); i++) await sleep(100);
console.log("THE HOUSE'S BRAINS — everything else they say");
ok(/brain ONLINE/.test(log), "server up, brain ONLINE against the fake model");

const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
const M = await register("mara", "Mara");
await api("POST", "/api/admin/coins", { token: admin, body: { userId: M.id, amount: 424242 } });
const users = (await api("GET", "/api/users", { token: M.token })).body?.users ?? [];
const idOf = (u) => users.find((x) => x.username === u)?.id;
const STERLING = idOf("sterling"), GOBLINS = idOf("goblins"), VOSS = idOf("voss");
const general = ((await api("GET", "/api/channels", { token: M.token })).body?.channels ?? []).find((c) => c.name === "general");
ok(!!admin && !!M.token && !!general, "admin, Mara, #general");

// ---- COUNTER TALK ----------------------------------------------------------------
let t = Date.now();
let r = await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "shop" } });
ok(r.status === 200 && Array.isArray(r.body?.lines) && r.body.lines.length >= 4, "counter talk: a batch of lines for Sterling's shop");
ok(!r.body.lines.some((l) => /999/.test(l)), "…a line with an invented figure is dropped from the batch");
const bReq = since(t, "bubble")[0];
ok(!!bReq && bReq.system.includes("424,242") && bReq.system.includes("Trader's counter"), "…written with Mara's own facts and the venue");
t = Date.now();
await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "shop" } });
ok(since(t, "bubble").length === 0, "…cached: asking again doesn't call the model");
await sleep(1100);
t = Date.now();
await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "shop", fresh: true } });
ok(since(t, "bubble").length === 1, "…a fresh batch once the refresh window has passed");
r = await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "goblins", venue: "kiosk" } });
ok(r.status === 200 && !r.body.lines.some((l) => /cells/i.test(l)), "the goblins' kiosk never names the cells to a paid-up customer");
ok((await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "nowhere" } })).status === 400, "an unknown venue is refused");
ok((await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "nobody", venue: "shop" } })).status === 400, "an unknown character is refused");
ok((await api("POST", "/api/npc/lines", { body: { npc: "sterling", venue: "shop" } })).status === 401, "counter talk needs a session");
r = await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "voss", venue: "debrief" } });
ok(r.status === 200, "Dr. Voss's debrief desk is a venue too");

// ---- REACTIONS ---------------------------------------------------------------------
// Written from WHAT HAPPENED; the scripted quip is the example and the floor.
const REACT = "Cha-ching. 200 silver, honestly earned — by me.";
const EVENT = "sold you 1 emoji, and you paid them 200 silver";
mode = "voice";
t = Date.now();
r = await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: REACT, event: EVENT } });
ok(r.body?.line === "REACTED, warmly.", "a reaction is written by the model from what happened");
const rq = since(t, "react")[0];
ok(!!rq && rq.system.includes(EVENT) && rq.system.includes(REACT), "…told the event, with the quip only as the example");
mode = "invent";
r = await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: REACT, event: EVENT } });
ok(r.body?.line === REACT, "…and a reaction that invents a figure falls back to the quip");
mode = "voice";
t = Date.now();
r = await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: REACT } });
ok(r.body?.line === REACT && since(t).length === 0, "with no event, the quip is said as written — never paraphrased blind");
for (const npc of ["rollo", "duke", "tasha", "chase"]) {
  const rr = await api("POST", "/api/npc/voice", { token: M.token, body: { npc, venue: "floor", line: "hi", event: "anything" } });
  const rl = await api("POST", "/api/npc/lines", { token: M.token, body: { npc, venue: "floor" } });
  ok(rr.status === 400 && rl.status === 400, `the counter routes refuse the unfiltered regular ${npc} (no gate there)`);
}
ok((await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: "x".repeat(301), event: EVENT } })).status === 400, "an over-long line is refused");
ok((await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: REACT, event: "y".repeat(301) } })).status === 400, "…and an over-long event");

// ---- THE FLOOR -------------------------------------------------------------------------
/** A rigged spin lands the legendary SLOT, which pays a legendary only half
 *  the time (LEGENDARY_HIT_RATE) — the other half is a rare he doesn't
 *  comment on. Spin until his comment arrives. */
const legendaryComment = async (afterId) => {
  for (let i = 0; i < 8; i++) {
    await api("POST", "/api/admin/spins/reset", { token: admin, body: { userId: M.id } });
    await api("POST", "/api/admin/spins/rig-legendary", { token: admin, body: { userId: M.id } });
    await api("POST", "/api/wheel/spin", { token: M.token });
    const got = await waitPost(M.token, general.id, STERLING, afterId, () => true, 1500);
    if (got) return got;
  }
  return null;
};
let after = await lastId(M.token, general.id);
t = Date.now();
let post = await legendaryComment(after);
ok(!!post && post.body.startsWith("VOICED: ") && post.body.includes("Mara"), "Sterling's comment on a legendary win is voiced, with Mara's name kept");
ok(since(t, "rewrite").some((q) => q.system.includes("winning a legendary emoji")), "…the model was told what happened");
// The win line carries no figures, so an INVENTED one is what fails it.
mode = "invent";
after = post?.id ?? after;
post = await legendaryComment(after);
ok(!!post && !post.body.startsWith("VOICED: ") && post.body.includes("Mara"), "…and when a rewrite fails its checks, the scripted comment is posted instead");
mode = "voice";
after = await lastId(M.token, general.id);
r = await api("POST", "/api/admin/special", { token: admin, body: { kind: "potsweet" } });
post = await waitPost(admin, general.id, STERLING, after, (m) => m.body.includes("VOICED"));
ok(r.status === 200 && !!post && post.body.startsWith("@everyone") && post.body.includes("VOICED: "), "a special is voiced and keeps its @everyone ping in front");

// ---- THE GOBLINS -------------------------------------------------------------------------
const T = await register("tobin", "Tobin");
await api("POST", "/api/admin/coins", { token: admin, body: { userId: T.id, amount: 50000 } });
t = Date.now();
r = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: T.id, force: true } });
const letter = r.body?.letter ?? "";
ok(r.status === 200 && letter.startsWith("VOICED: ") && letter.includes("Tobin"), "a goblin letter is voiced, with the name kept");
const small = letter.split("\n\n").pop();
const lReq = since(t, "rewrite").pop();
ok(!!small && !small.startsWith("VOICED") && !!lReq && !lReq.user.includes(small), "…THE SMALL PRINT is re-attached verbatim and never handed to the model");
ok(!!lReq && lReq.system.includes("TONE — THE MASK"), "…written under THE MASK");
const U = await register("wren", "Wren");
await api("POST", "/api/admin/coins", { token: admin, body: { userId: U.id, amount: 50000 } });
mode = "cells";
r = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: U.id, force: true } });
ok(r.status === 200 && !(r.body?.letter ?? "").startsWith("VOICED"), "a letter that names the cells under THE MASK falls back to the script");
mode = "voice";
after = await lastId(M.token, general.id);
r = await api("POST", "/api/admin/goblins/bark", { token: admin });
const bark = await waitPost(M.token, general.id, GOBLINS, after);
ok(r.status === 200 && !!bark && bark.body.startsWith("VOICED: "), "the barker's pitch is voiced");
const scold = await waitPost(M.token, general.id, STERLING, after, (m) => m.replyToId === bark?.id);
ok(!!scold && scold.body.startsWith("VOICED: "), "…and Sterling's scold, as a reply under it");

// The barker thread (scold, retort) is still being written for a moment;
// a notice filed into that would rightly fall back to its script.
await sleep(1200);
// ---- DR. VOSS -------------------------------------------------------------------------------
after = await lastId(M.token, general.id);
r = await api("POST", "/api/admin/voss/notice", { token: admin });
const notice = await waitPost(M.token, general.id, VOSS, after);
ok(r.status === 200 && !!notice && notice.body.startsWith("VOICED: FIELD NOTICE"), "Dr. Voss's field notice is voiced");
const answer = await waitPost(M.token, general.id, STERLING, after, (m) => m.replyToId === notice?.id);
ok(!!answer && answer.body.startsWith("VOICED: "), "…and Sterling answers it as a reply, voiced");

// ---- COMMANDS ----------------------------------------------------------------------------------
after = await lastId(M.token, general.id);
t = Date.now();
await api("POST", `/api/channels/${general.id}/messages`, { token: M.token, body: { body: "/sterling" } });
post = await waitPost(M.token, general.id, STERLING, after);
ok(!!post && post.body.startsWith("Noted.") && post.body.includes("/sterling help"), "a bare /sterling is a conversation that still points at /sterling help");
after = post?.id ?? after;
await sleep(200);
await api("POST", `/api/channels/${general.id}/messages`, { token: M.token, body: { body: "/sterling pot" } });
post = await waitPost(M.token, general.id, STERLING, after);
ok(!!post && /LOTTERY/.test(post.body) && !post.body.includes("VOICED"), "/sterling pot is still the exact card");

// ---- INSTRUMENTS STAY EXACT -----------------------------------------------------------------
t = Date.now();
r = await api("POST", "/api/report", { token: M.token, body: { kind: "user", refId: T.id, reason: "harness report" } });
await sleep(500);
ok(r.status === 200 && !since(t, "rewrite").some((q) => q.user.includes("REPORT")), "a report's DM to the admin is never sent to the model");
{
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const dm = db.prepare("SELECT body FROM dm_messages WHERE senderId = ? AND body LIKE '%REPORT #%' ORDER BY id DESC LIMIT 1").get(STERLING);
  db.close();
  ok(!!dm && dm.body.startsWith("🚩 REPORT #"), "…it arrives exactly as written");
}

// ---- OFF -------------------------------------------------------------------------------------------
await api("POST", "/api/admin/npc-brain", { token: admin, body: { on: false } });
ok((await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "bar" } })).status === 503, "switched off, counter talk answers 503 (the client uses its script)");
r = await api("POST", "/api/npc/voice", { token: M.token, body: { npc: "sterling", venue: "shop", line: REACT, event: EVENT } });
ok(r.body?.line === REACT, "…and a reaction comes back as written");

srv.kill("SIGINT");
fake.close();
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
