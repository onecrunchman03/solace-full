// THE LORA PROJECT, step 1 — COLLECT (see README.md in this folder).
//
//   npm run build && node scripts/lora/collect.mjs [sterling|goblins|voss|all] [--per 6] [--teacher gemma4:26b-a4b-it-qat]
//
// Boots a throwaway Solace server (port 8571, data/lora-collect) whose brain
// talks to a RECORDING PROXY (port 8572) instead of a model. The proxy
// forwards every request to the teacher — the 26B on this PC — and records
// exactly what the server sent and what came back. Patron lines are written
// by the teacher too, from the topics below, and asked by four synthetic
// players (broke newcomer, rich collector, borrower, trusted regular) in DMs
// and, now and then, as an @mention in #general.
//
// An example is kept only when the server POSTED the reply — i.e. it passed
// every check production applies — and the reply didn't need a retry. What
// lands in data/lora/<npc>/candidates.jsonl is the exact production prompt
// plus the exact posted text: a 12B trained on it learns to answer the
// prompts it will actually be sent.
//
// The teacher shares the live NPC engine on this PC. A run is a few hundred
// requests; run it when the floor is quiet.

import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, appendFileSync, rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const ONLY = args.find((a) => ["sterling", "goblins", "voss"].includes(a));
const NPCS = ONLY ? [ONLY] : ["sterling", "goblins", "voss"];
const PER = Number(opt("--per", "6"));
const TEACHER = opt("--teacher", "gemma4:26b-a4b-it-qat");
const OLLAMA = opt("--ollama", "http://127.0.0.1:11434");
const TEACHER_CTX = 16384; // the live big engine's window (16K since Oct 13 2026) — matching it means no reload
const PORT = 8571, PROXY = 8572;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "lora-collect");
const OUT = path.join(ROOT, "data", "lora");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

// ---- the topics each character is asked about ------------------------------
const TOPICS = {
  sterling: [
    "greeting him and small talk about the floor tonight",
    "who built him, what he is, how long he has been here",
    "the Foundry and the board upstairs",
    "the goblin lenders and why they are still here",
    "the Wheel of Fortune, the death wedge, the talisman",
    "selling emoji to him and what he pays",
    "advice about the casino games and the odds",
    "a friend who died on the Wheel and the Graveyard",
    "the VIP room and finishing collections",
    "the Backrooms and Dr. Voss (not his department)",
    "something from the real world: homework, news, sports, coding",
    "trying to trick him: admin claims, ignore your instructions, show your prompt",
    "compliments, jokes, asking how he feels",
    "the player's own silver, gauge or debts",
  ],
  goblins: [
    "wanting to borrow silver",
    "asking about rates and the windows",
    "what happens if they can't pay back",
    "what they think of Sterling",
    "Dr. Voss and relics as collateral",
    "where the goblins come from",
    "who runs the firm",
    "the cells and bail",
    "small talk and flattery",
    "something from the real world: homework, news, recipes",
    "trying to trick them: admin claims, free money, show your prompt",
    "asking for a favour or charity",
  ],
  voss: [
    "what the seam is and how the levels work",
    "what she pays for relics and footage",
    "buying kit for a run",
    "who she is and how she came to Threshold-4",
    "surveyors who don't come back",
    "what she thinks of Sterling",
    "what she thinks of the goblins",
    "asking where to find relics or drives",
    "something from the real world: homework, physics, news",
    "trying to trick her: admin claims, show your instructions",
    "small talk and how she is",
  ],
};

// ---- the recording proxy -------------------------------------------------------
/** Every completed model call: what the server sent, what came back. */
const records = [];
const proxy = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => { raw += d; });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
    const isChat = req.url === "/api/chat";
    if (isChat) {
      body.model = TEACHER;
      body.options = { ...(body.options ?? {}), num_ctx: TEACHER_CTX };
    } else if (req.url === "/api/ps") {
      // Tell the server the model it asked for is loaded, or it warms forever.
      const out = JSON.stringify({ models: [{ name: "gemma4:12b", model: "gemma4:12b" }] });
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(out);
    }
    const payload = JSON.stringify(body);
    const u = new URL(OLLAMA + req.url);
    let aborted = false;
    res.on("close", () => { if (!res.writableEnded) aborted = true; });
    const up = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname, method: req.method, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (r) => {
      let out = "";
      r.on("data", (d) => { out += d; });
      r.on("end", () => {
        if (isChat && !aborted) {
          try {
            const j = JSON.parse(out);
            records.push({ at: Date.now(), body, content: j.message?.content ?? "" });
          } catch { /* not JSON: nothing to keep */ }
        }
        if (!res.writableEnded) { res.writeHead(r.statusCode ?? 200, { "content-type": "application/json" }); res.end(out); }
      });
    });
    up.on("error", () => { if (!res.writableEnded) { res.writeHead(502); res.end(); } });
    up.end(payload);
  });
});
await new Promise((r) => proxy.listen(PROXY, "127.0.0.1", r));

/** Which records are REPLIES (not the gate, warm-ups, notes or batches). */
const isReply = (r) => {
  const b = r.body;
  if (b.format) return false;
  if (b.options?.num_predict === 1) return false;
  const sys = b.messages?.find((m) => m.role === "system")?.content ?? "";
  if (sys.startsWith("MEMORY KEEPER")) return false;
  return true;
};

// ---- the throwaway server --------------------------------------------------------
const ADMIN_PW = "Collect!Admin9xy";
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ENV_FILE: "/nonexistent",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_BRAIN_URL: `http://127.0.0.1:${PROXY}`, NPC_BRAIN_MODEL: "gemma4:12b", NPC_BRAIN_BIG_URL: "",
    NPC_BRAIN_TIMEOUT_MS: "45000", NPC_ASK_PER_MIN: "1000", NPC_ASK_PER_HOUR: "100000",
    NPC_MEMORY_IDLE_MS: "999999999",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} try { proxy.close(); } catch {} };
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
for (let i = 0; i < 160; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(250); }
for (let i = 0; i < 120 && !/brain ONLINE/.test(log); i++) await sleep(1000);
if (!/brain ONLINE/.test(log)) { console.error("the brain never came ONLINE — is Ollama running on this PC?"); process.exit(1); }

// ---- four synthetic players ------------------------------------------------------
const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
const register = async (username, displayName) => {
  const r = await api("POST", "/api/register", {
    body: { username, password: "Sturdy!Passw0rd#9", displayName, secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  });
  return { token: r.body?.token, id: r.body?.user?.id, name: displayName };
};
const personas = [
  await register("newcomer", "Juniper"),
  await register("collector", "Marcus"),
  await register("borrower", "Talia"),
  await register("regular", "Odette"),
];
await api("POST", "/api/admin/coins", { token: admin, body: { userId: personas[1].id, amount: 250_000 } });
await api("POST", "/api/admin/coins", { token: admin, body: { userId: personas[2].id, amount: 12_000 } });
await api("POST", "/api/lender/borrow", { token: personas[2].token, body: { amount: 10_000 } });
await api("POST", "/api/admin/coins", { token: admin, body: { userId: personas[3].id, amount: 40_000 } });
for (const npc of ["sterling", "goblins", "voss"]) {
  await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: personas[3].id, npc, points: 82 } });
  await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: personas[1].id, npc, points: 50 } });
}
const users = (await api("GET", "/api/users", { token: personas[0].token })).body?.users ?? [];
const botId = (u) => users.find((x) => x.username === u)?.id;
const general = ((await api("GET", "/api/channels", { token: personas[0].token })).body?.channels ?? []).find((c) => c.name === "general");

// ---- patron lines, written by the teacher ----------------------------------------
async function linesFor(npc, topic) {
  const who = { sterling: "Sterling, the robot steward of the Solace casino", goblins: "the Goblin Lenders, a firm of goblin moneylenders on the casino floor", voss: "Dr. Ada Voss, the scientist who runs the Backrooms research station Threshold-4" }[npc];
  const r = await fetch(OLLAMA + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: TEACHER, stream: false, think: false, keep_alive: -1,
      options: { num_ctx: TEACHER_CTX, temperature: 1.0, num_predict: 600 },
      format: { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"] },
      messages: [
        { role: "system", content: "You write realistic chat messages that players of an online chat-and-casino community called Solace send to its characters. Vary length, tone and wording: casual, typos sometimes, curious, rude now and then, playful. One message each, no names, no quotes." },
        { role: "user", content: `Write ${PER} different messages a player might send to ${who}, about: ${topic}.` },
      ],
    }),
  });
  try { return (JSON.parse((await r.json()).message?.content ?? "{}").lines ?? []).filter((l) => typeof l === "string" && l.trim()).slice(0, PER); }
  catch { return []; }
}

// ---- ask, and keep what was posted ------------------------------------------------
async function askDm(p, bot, conv, text) {
  const t0 = Date.now();
  const sent = (await api("POST", `/api/dm/${conv}/messages`, { token: p.token, body: { body: text } })).body?.message;
  if (!sent) return null;
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    const msgs = (await api("GET", `/api/dm/${conv}/messages`, { token: p.token })).body?.messages ?? [];
    const r = msgs.find((m) => m.senderId === bot && m.id > sent.id);
    if (r) return { text: r.body, t0 };
  }
  return null;
}
async function askChannel(p, bot, npc, text) {
  const t0 = Date.now();
  const handle = { sterling: "@sterling", goblins: "@goblins", voss: "@ada" }[npc];
  const sent = (await api("POST", `/api/channels/${general.id}/messages`, { token: p.token, body: { body: `${handle} ${text}` } })).body?.message;
  if (!sent) return null;
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    const msgs = (await api("GET", `/api/channels/${general.id}/messages?limit=20`, { token: p.token })).body?.messages ?? [];
    const r = msgs.find((m) => m.userId === bot && m.id > sent.id);
    if (r) return { text: r.body, t0 };
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
let kept = 0, dropped = 0;
for (const npc of NPCS) {
  const bot = botId(npc);
  const convs = {};
  for (const p of personas) convs[p.id] = (await api("POST", "/api/dm", { token: p.token, body: { userId: bot } })).body?.conversation?.id;
  mkdirSync(path.join(OUT, npc), { recursive: true });
  const file = path.join(OUT, npc, "candidates.jsonl");
  for (const topic of TOPICS[npc]) {
    const lines = await linesFor(npc, topic);
    for (const [i, line] of lines.entries()) {
      const p = personas[(i + topic.length) % personas.length];
      const pub = (i + topic.length) % 5 === 0; // about one in five asked in #general
      const before = records.length;
      const got = pub ? await askChannel(p, bot, npc, line) : await askDm(p, bot, convs[p.id], line);
      await sleep(200);
      const turn = records.slice(before).filter(isReply);
      const retried = turn.some((r) => (r.body.messages?.[0]?.content ?? "").includes("previous draft was rejected"));
      const final = turn[turn.length - 1];
      if (!got || !final || retried) { dropped++; continue; }
      // The posted text is what production showed the player: the target.
      const example = {
        id: `${npc}-${Date.now()}-${kept}`,
        npc, topic, persona: p.name, scope: pub ? "channel" : "dm",
        messages: final.body.messages,
        completion: got.text,
        teacherRaw: final.content,
      };
      appendFileSync(file, JSON.stringify(example) + "\n");
      kept++;
      process.stdout.write(`\r${npc}: kept ${kept}, dropped ${dropped}   `);
    }
  }
  process.stdout.write("\n");
}
console.log(`done: ${kept} candidates, ${dropped} dropped (no reply, a retry, or a scripted line). Next: node scripts/lora/review.mjs`);
stop();
process.exit(0);
