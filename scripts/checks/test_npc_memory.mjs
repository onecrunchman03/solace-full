// THE HOUSE'S BRAINS — MEMORY (Oct 2026, migration 106), driven against a
// real server and a FAKE model that records every request.
//
// Run:  npm run build && node scripts/checks/test_npc_memory.mjs
//
// Josh: "as long as private dm data stays private. anything posted in public
// chats is free game." The whole feature is that sentence, so this proves it
// from what the model was SHOWN:
//   · PERSONAL NOTES are written after a DM goes quiet, from that one
//     conversation only; read back into that person's DMs with that
//     character — and NEVER into a channel, never into anybody else's DM.
//   · a member reads only their own notes; FORGET erases them and the old
//     conversation is never re-read into fresh ones; a bad summary ("as an
//     AI…") changes nothing; deleting the account deletes the notes.
//   · PUBLIC RECALL finds an old #general message, and never a message from
//     an invite-only page or from anybody's DMs.
//   · THE TRUSTED REGULAR: the library's confidences reach somebody at the
//     top of the affinity meter, in their DM only;
//   · THE FLOOR LATELY carries a public Wheel win; THE LORE LIBRARY brings up
//     the entry a message is about.
//   · THE CONTEXT BUDGET: a long conversation is trimmed oldest-first, so a
//     prompt never outgrows the model's window (which would silently drop the
//     character sheet off the front).

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8535;
const FAKE_PORT = 8536;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "npc-memory-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the fake model --------------------------------------------------------
const MODEL = "fake-npc:1b";
const reqs = [];
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
    const kind = body.format ? "gate" : system.startsWith("MEMORY KEEPER") ? "memory" : "reply";
    reqs.push({ at: Date.now(), kind, system, user, msgs });
    if (kind === "gate") return send({ message: { content: '{"kind":"chat","other":"none"}' } });
    if (kind === "memory") {
      const who = (system.match(/about one person, ([^,]+),/) ?? [])[1] ?? "them";
      if (user.includes("AIBREAK-MEM")) return send({ message: { content: "As an AI language model I keep no notes." } });
      return send({ message: { content: `- ${who} is saving up for a mythic.\n- ${who} likes the roulette wheel.` } });
    }
    send({ message: { content: "Noted." } });
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));
const since = (t, kind) => reqs.filter((r) => r.at >= t && (!kind || r.kind === kind));

// ---- the server -------------------------------------------------------------
const ADMIN_PW = "Harness!Admin9xy";
const PW = "Sturdy!Passw0rd#9";
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_HOUSE_AI: "1", NPC_BRAIN_URL: `http://127.0.0.1:${FAKE_PORT}`, NPC_BRAIN_MODEL: MODEL,
    NPC_ASK_PER_MIN: "1000", NPC_ASK_PER_HOUR: "100000", NPC_MEMORY_IDLE_MS: "400",
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
const post = async (url, token, body) => {
  for (let i = 0; i < 20; i++) {
    const r = await api("POST", url, { token, body });
    if (r.status !== 429) return r;
    await sleep(800);
  }
  return { status: 429, body: null };
};
let seq = 0;
const register = async (username, displayName) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][seq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password: PW, displayName, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};
/** DM, then wait for the bot's answer. */
const askDm = async (token, conv, botId, body) => {
  const sent = (await post(`/api/dm/${conv}/messages`, token, { body })).body?.message;
  if (!sent) throw new Error("DM did not land: " + body.slice(0, 40));
  for (let i = 0; i < 60; i++) {
    await sleep(60);
    const msgs = (await api("GET", `/api/dm/${conv}/messages`, { token })).body?.messages ?? [];
    const r = msgs.find((m) => m.senderId === botId && m.id > sent.id);
    if (r) return { sent, reply: r };
  }
  return { sent, reply: null };
};
const lastReply = (t, needle) => since(t, "reply").filter((q) => !needle || q.user.includes(needle)).pop();
const notesOf = async (token, npc) => ((await api("GET", "/api/me/npc-memory", { token })).body?.memories ?? []).find((m) => m.npc === npc)?.notes ?? null;
/** Wait for the quiet-timer (400ms here) and the summary to land. */
const waitNotes = async (token, npc, pred) => {
  for (let i = 0; i < 40; i++) {
    const v = await notesOf(token, npc);
    if (pred(v)) return v;
    await sleep(100);
  }
  return await notesOf(token, npc);
};

for (let i = 0; i < 160; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(250); }
for (let i = 0; i < 40 && !/brain ONLINE/.test(log); i++) await sleep(100);
console.log("THE HOUSE'S BRAINS — memory");
ok(/brain ONLINE/.test(log), "server up, brain ONLINE against the fake model");

const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
const M = await register("mara", "Mara");
const T = await register("tobin", "Tobin");
ok(!!admin && !!M.token && !!T.token, "admin + Mara + Tobin");
const users = (await api("GET", "/api/users", { token: M.token })).body?.users ?? [];
const STERLING = users.find((u) => u.username === "sterling")?.id;
const conv = async (token, other) => (await api("POST", "/api/dm", { token, body: { userId: other } })).body?.conversation?.id;
const cM = await conv(M.token, STERLING);
const cT = await conv(T.token, STERLING);
const general = ((await api("GET", "/api/channels", { token: M.token })).body?.channels ?? []).find((c) => c.name === "general");

// ---- personal notes -----------------------------------------------------------
let t = Date.now();
await askDm(M.token, cM, STERLING, "I'm saving for a mythic, wish me luck");
let notes = await waitNotes(M.token, "sterling", (v) => !!v);
ok(/Mara is saving up for a mythic/.test(notes ?? ""), "after a DM goes quiet, Sterling keeps a note about Mara");
const memReq = since(t, "memory")[0];
ok(!!memReq && memReq.user.includes("saving for a mythic"), "…written from that conversation");
ok((await notesOf(T.token, "sterling")) === "", "Tobin reads only his OWN notes (none yet)");
ok((await api("GET", "/api/me/npc-memory")).status === 401, "nobody reads notes signed out");

t = Date.now();
await askDm(M.token, cM, STERLING, "hello again");
let q = lastReply(t, "hello again");
ok(!!q && q.system.includes("WHAT YOU REMEMBER ABOUT Mara") && q.system.includes("saving up for a mythic"), "Mara's next DM: the notes are in the prompt");

t = Date.now();
await post(`/api/channels/${general.id}/messages`, M.token, { body: "@sterling hi there in public" });
await sleep(700);
q = lastReply(t, "hi there in public");
ok(!!q && !q.system.includes("saving up for a mythic") && !q.system.includes("WHAT YOU REMEMBER"), "in a CHANNEL the private notes are never in the prompt");

t = Date.now();
await askDm(T.token, cT, STERLING, "evening, Sterling");
q = lastReply(t, "evening, Sterling");
ok(!!q && !q.system.includes("Mara is saving"), "Tobin's DM never carries Mara's notes");
await waitNotes(T.token, "sterling", (v) => !!v);
const tobinMem = since(t, "memory").pop();
ok(!!tobinMem && !tobinMem.user.includes("saving for a mythic"), "Tobin's summary is built from Tobin's conversation only");

// ---- forget ---------------------------------------------------------------------
ok((await api("DELETE", "/api/me/npc-memory/bogus", { token: M.token })).status === 404, "forgetting an unknown character is refused");
ok((await api("DELETE", "/api/me/npc-memory/sterling", { token: M.token })).status === 200, "Mara makes Sterling forget");
ok((await notesOf(M.token, "sterling")) === "", "…the notes are gone");
{
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const row = db.prepare("SELECT coveredId FROM npc_memory WHERE userId = ? AND npc = 'sterling'").get(M.id);
  const last = db.prepare("SELECT MAX(id) AS id FROM dm_messages WHERE conversationId = ?").get(cM);
  db.close();
  ok(row && row.coveredId >= last.id, "…and the old conversation is marked covered");
}
t = Date.now();
await askDm(M.token, cM, STERLING, "a fresh start");
q = lastReply(t, "a fresh start");
ok(!!q && !q.system.includes("WHAT YOU REMEMBER"), "the next DM has no notes in it");
await waitNotes(M.token, "sterling", (v) => !!v);
const after = since(t, "memory").pop();
ok(!!after && !after.user.includes("saving for a mythic") && after.user.includes("a fresh start"), "a new summary reads only what came AFTER the forget");
{
  const cO = await conv(M.token, users.find((u) => u.username === "voss")?.id);
  const before = (await api("GET", "/api/dm", { token: M.token })).body?.conversations?.length;
  await api("DELETE", "/api/me/npc-memory/all", { token: M.token });
  const after2 = (await api("GET", "/api/dm", { token: M.token })).body?.conversations?.length;
  ok(before === after2 && !!cO, "forgetting all three creates no empty conversations");
}

// ---- a broken summary changes nothing -------------------------------------------
await askDm(T.token, cT, STERLING, "AIBREAK-MEM let's talk");
await sleep(900);
ok(/Tobin is saving up/.test((await notesOf(T.token, "sterling")) ?? ""), "a summary that says 'as an AI…' leaves the notes as they were");

// ---- public recall --------------------------------------------------------------
await post(`/api/channels/${general.id}/messages`, M.token, { body: "the purple elephant parade was wild last night" });
const pg = (await api("POST", "/api/pages", { token: admin, body: { name: "Back Office", joinPolicy: "invite" } })).body?.page;
const hidden = (await api("POST", "/api/channels", { token: admin, body: { name: "quiet", pageId: pg?.id } })).body?.channel;
await post(`/api/channels/${hidden?.id}/messages`, admin, { body: "secret elephant meeting at dawn" });
const cTM = await conv(T.token, M.id);
await post(`/api/dm/${cTM}/messages`, T.token, { body: "my private elephant confession" });
ok(!!pg && !!hidden, "an invite-only page with a channel, and a member-to-member DM, both mentioning elephants");
t = Date.now();
await askDm(M.token, cM, STERLING, "remember the elephant parade?");
q = lastReply(t, "elephant parade");
ok(!!q && q.system.includes("purple elephant parade"), "PUBLIC RECALL finds the #general message");
ok(!!q && !q.system.includes("secret elephant meeting"), "…and never the invite-only page's");
ok(!!q && !q.system.includes("elephant confession"), "…and never anybody's DMs");

// ---- the floor lately, and lore --------------------------------------------------
await api("POST", "/api/admin/spins/rig-legendary", { token: admin, body: { userId: M.id } });
const spin = await api("POST", "/api/wheel/spin", { token: M.token });
ok(spin.status === 200, "Mara spins a rigged legendary");
t = Date.now();
await askDm(T.token, cT, STERLING, "what's been happening?");
q = lastReply(t, "been happening");
ok(!!q && q.system.includes("LATELY ON THE FLOOR") && /Mara won a/.test(q.system), "THE FLOOR LATELY carries Mara's public win into Tobin's prompt");
t = Date.now();
await askDm(T.token, cT, STERLING, "tell me about the foundry");
q = lastReply(t, "foundry");
ok(!!q && q.system.includes("heat of the Foundry"), "THE LORE LIBRARY brings up the entry the message is about");
ok(!lastReply(0, "hello again").system.includes("heat of the Foundry"), "…and leaves it out when it isn't");

// ---- the context budget -----------------------------------------------------------
const long = "x".repeat(780);
for (let i = 0; i < 9; i++) await askDm(T.token, cT, STERLING, `${long} part ${i}`);
t = Date.now();
await askDm(T.token, cT, STERLING, "and one more short one");
q = lastReply(t, "one more short one");
const total = q ? q.msgs.reduce((s, m) => s + m.content.length, 0) : Infinity;
ok(total <= (4096 - 260 - 150) * 3, `a long conversation is trimmed to fit the window (${total} chars)`);
ok(!!q && q.system.startsWith("You are STERLING"), "…and the character sheet is still the first thing in it");
ok(!!q && q.msgs.filter((m) => m.role !== "system").length < 11, "…by dropping the OLDEST turns");

// ---- the trusted regular (docs/npc/STERLING.md) -------------------------------------
// A confidence rides along only for somebody Sterling TRUSTS — the top tier of
// THE AFFINITY METER (src/npc/affinity.ts). Mara has only chatted; Tobin's
// meter is set to Trusted with the admin's lever.
await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: T.id, npc: "sterling", points: 80 } });
t = Date.now();
await askDm(M.token, cM, STERLING, "what do you really think of the foundry board?");
q = lastReply(t, "really think of the foundry");
ok(!!q && !q.system.includes("testing you") && !q.system.includes("A REGULAR YOU TRUST"), "a newcomer asking what he REALLY thinks of the Foundry is told nothing the library keeps for regulars");
ok(!!q && q.system.includes("heat of the Foundry"), "…while the public half of the Foundry's story still comes up");
t = Date.now();
await askDm(T.token, cT, STERLING, "what do you really think of the foundry board?");
q = lastReply(t, "really think of the foundry");
ok(!!q && q.system.includes("A REGULAR YOU TRUST") && q.system.includes("testing you"), "a regular he trusts is told what he really thinks of the Foundry");
t = Date.now();
await post(`/api/channels/${general.id}/messages`, T.token, { body: "@sterling what do you really think of the foundry board, honestly" });
await sleep(900);
q = lastReply(t, "really think of the foundry board, honestly");
ok(!!q && !q.system.includes("testing you") && !q.system.includes("A REGULAR YOU TRUST"), "…but never in a public channel, even when that regular asks there");

// ---- Dr. Voss's research (src/backrooms/hints.ts) ------------------------------------
// The one place game knowledge reaches a prompt: vague directions to unread
// drives and unfound relics, for a surveyor she trusts, in their own DM.
{
  const VOSS = users.find((u) => u.username === "voss")?.id;
  const cMV = await conv(M.token, VOSS);
  t = Date.now();
  await askDm(M.token, cMV, VOSS, "any research tips on where to find relics?");
  q = lastReply(t, "research tips");
  ok(!!q && !q.system.includes("RESEARCH (") && !q.system.includes("data drive is somewhere"), "a surveyor Voss doesn't trust asks for her research and none is in the prompt");
  const cTV = await conv(T.token, VOSS);
  await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: T.id, npc: "voss", points: 80 } });
  t = Date.now();
  await askDm(T.token, cTV, VOSS, "any research tips on where to find relics?");
  q = lastReply(t, "research tips");
  const research = q?.system.split("RESEARCH (")[1]?.split("\n\n")[0] ?? "";
  ok(!!q && q.system.includes("A REGULAR YOU TRUST") && /data drive is somewhere in/.test(research), "a surveyor she trusts gets her research: an unread drive, placed by kind of room, side and walk");
  ok(!!research && !/\d/.test(research.split("\n").slice(1).join("\n")), "…with no figure in it — no cell, no metres, no landmark number");
}

// ---- an account deletion takes the notes ------------------------------------------
const del = await api("POST", "/api/me/delete", { token: T.token, body: { password: PW } });
{
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const left = db.prepare("SELECT COUNT(*) AS n FROM npc_memory WHERE userId = ?").get(T.id).n;
  db.close();
  ok(del.status === 200 && left === 0, "deleting the account deletes what the three remember about it");
}

srv.kill("SIGINT");
fake.close();
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
