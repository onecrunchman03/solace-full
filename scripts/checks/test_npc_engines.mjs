// THE HOUSE'S BRAINS — TWO ENGINES (Oct 2026), over a real server and TWO
// fake models standing in for slopbot's 3080 ("steady") and Josh's
// workstation 3090 Ti ("big").
//
// Run:  npm run build && node scripts/checks/test_npc_engines.mjs
//
// Josh chose "option A": the 3090 Ti does the talking when it's there, and it
// comes and goes — the PC sleeps, reboots, and steps aside for a heavy game.
// What this pins:
//   · CONVERSATION goes to the big engine, at the big window (num_ctx 8192);
//     COUNTER TALK goes to the steady one, at its window (4096).
//   · THE BIG ENGINE DISAPPEARS: the next DM is answered by steady at once —
//     no wait, no scripted "busy" — and the log says so.
//   · IT COMES BACK: the health check finds it, and conversation returns to it.
//   · REACHABLE BUT STILL LOADING: conversation goes to whatever is loaded
//     (steady) rather than waiting out a cold load, and the big one is warmed.
//   · STEADY GONE: background work falls over to the big engine.
//   · A LONG PROMPT is re-fitted to the window of whichever engine answers.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8539;
const STEADY_PORT = 8542;
const BIG_PORT = 8543;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "npc-engines-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- two fake engines ---------------------------------------------------------
const reqs = [];
const engine = (name, model) => {
  const state = { loaded: true, server: null };
  const handler = (req, res) => {
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", async () => {
      const send = (o) => { try { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); } catch {} };
      if (req.url === "/api/ps") return send({ models: state.loaded ? [{ name: model, model }] : [] });
      const body = JSON.parse(raw || "{}");
      const msgs = body.messages ?? [];
      const system = msgs.find((m) => m.role === "system")?.content ?? "";
      const chars = msgs.reduce((s, m) => s + m.content.length, 0);
      const kind = body.format?.properties?.lines ? "bubble" : body.format ? "gate" : body.options?.num_predict === 1 ? "warm" : "reply";
      reqs.push({ at: Date.now(), engine: name, kind, numCtx: body.options?.num_ctx, model: body.model, chars, system });
      if (kind === "warm") {
        await new Promise((r) => setTimeout(r, 1500));
        state.loaded = true;
      }
      if (kind === "gate") return send({ message: { content: '{"kind":"chat","other":"none"}' } });
      if (kind === "bubble") return send({ message: { content: JSON.stringify({ lines: ["Welcome.", "Fine night.", "Mind the step."] }) } });
      send({ message: { content: `From ${name}.` } });
    });
  };
  state.start = () => new Promise((r) => { state.server = createServer(handler); state.server.listen(name === "big" ? BIG_PORT : STEADY_PORT, "127.0.0.1", r); });
  state.stop = () => new Promise((r) => { state.server.closeAllConnections?.(); state.server.close(() => r()); });
  return state;
};
const steady = engine("steady", "fake-steady:12b");
const big = engine("big", "fake-big:26b");
await steady.start();
await big.start();
const since = (t, f = () => true) => reqs.filter((r) => r.at >= t && f(r));

// ---- the server ------------------------------------------------------------------
const ADMIN_PW = "Harness!Admin9xy";
let log = "";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    NPC_HOUSE_AI: "1", NPC_BRAIN_URL: `http://127.0.0.1:${STEADY_PORT}`, NPC_BRAIN_MODEL: "fake-steady:12b",
    NPC_BRAIN_BIG_URL: `http://127.0.0.1:${BIG_PORT}`, NPC_BRAIN_BIG_MODEL: "fake-big:26b", NPC_BRAIN_BIG_CTX: "8192",
    NPC_HEALTH_MS: "700", NPC_ASK_PER_MIN: "1000", NPC_ASK_PER_HOUR: "100000", NPC_MEMORY_IDLE_MS: "600000",
    NPC_LINES_PER_MIN: "1000", NPC_BUBBLE_FRESH_MS: "1",
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
const askDm = async (token, conv, botId, body) => {
  const t0 = Date.now();
  const sent = (await api("POST", `/api/dm/${conv}/messages`, { token, body: { body } })).body?.message;
  for (let i = 0; i < 80; i++) {
    await sleep(50);
    const msgs = (await api("GET", `/api/dm/${conv}/messages`, { token })).body?.messages ?? [];
    const r = msgs.find((m) => m.senderId === botId && m.id > (sent?.id ?? 0));
    if (r) return { reply: r, ms: Date.now() - t0 };
  }
  return { reply: null, ms: Date.now() - t0 };
};
const waitLog = async (re, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (re.test(log)) return true; await sleep(50); }
  return false;
};

for (let i = 0; i < 160; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(250); }
console.log("THE HOUSE'S BRAINS — two engines");
ok(await waitLog(/big engine ONLINE/) && await waitLog(/steady engine ONLINE/), "both engines report ONLINE");

const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
const reg = await api("POST", "/api/register", {
  body: { username: "mara", password: "Sturdy!Passw0rd#9", displayName: "Mara", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
});
const M = { token: reg.body?.token, id: reg.body?.user?.id };
const STERLING = ((await api("GET", "/api/users", { token: M.token })).body?.users ?? []).find((u) => u.username === "sterling")?.id;
const conv = (await api("POST", "/api/dm", { token: M.token, body: { userId: STERLING } })).body?.conversation?.id;

// ---- who does what -----------------------------------------------------------------
let t = Date.now();
let r = await askDm(M.token, conv, STERLING, "hello there");
const talk = since(t, (q) => q.kind === "reply" || q.kind === "gate");
ok(r.reply?.body === "From big.", "a conversation is answered by the BIG engine");
ok(talk.length >= 2 && talk.every((q) => q.engine === "big" && q.numCtx === 8192 && q.model === "fake-big:26b"), "…every call of it (gate and reply) at the big window, 8192");
t = Date.now();
await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "sterling", venue: "shop" } });
const bub = since(t, (q) => q.kind === "bubble");
ok(bub.length === 1 && bub[0].engine === "steady" && bub[0].numCtx === 4096, "counter talk goes to the STEADY engine, at 4096");
const st = (await api("GET", "/api/admin/npc-brain", { token: admin })).body;
ok(st?.engines?.length === 2 && st.engines.every((e) => e.loaded), "the admin status lists both engines, loaded");

// ---- the big engine disappears ------------------------------------------------------
await big.stop();
r = await askDm(M.token, conv, STERLING, "still there?");
ok(r.reply?.body === "From steady.", "the big engine gone: the very next DM is answered by STEADY");
ok(r.ms < 2500, `…without waiting it out (${r.ms}ms)`);
ok(/big engine unreachable/.test(log), "…and the log says the big engine went away");

// ---- it comes back ---------------------------------------------------------------------
const onlines = () => (log.match(/big engine ONLINE/g) ?? []).length;
const before = onlines();
big.loaded = false;
await big.start();
let back = false;
for (let i = 0; i < 120 && !back; i++) { back = onlines() > before; await sleep(50); }
ok(back, "it comes back: found, warmed and ONLINE again");
ok(reqs.some((q) => q.engine === "big" && q.kind === "warm"), "…it was warmed (one token) before being trusted");
r = await askDm(M.token, conv, STERLING, "welcome back");
ok(r.reply?.body === "From big.", "…and conversation returns to it");

// ---- reachable but still loading ---------------------------------------------------------
big.loaded = false;
// Wait for the health check to start warming it (1.5s of "loading" follows).
const warms = () => reqs.filter((q) => q.engine === "big" && q.kind === "warm").length;
const w0 = warms();
for (let i = 0; i < 60 && warms() === w0; i++) await sleep(25);
r = await askDm(M.token, conv, STERLING, "while it loads");
ok(warms() > w0 && r.reply?.body === "From steady.", "a big engine still loading: conversation goes to whatever IS loaded, not into the wait");

// ---- steady gone: background falls to big ----------------------------------------------------
big.loaded = true;
await sleep(900);
await steady.stop();
t = Date.now();
r = await api("POST", "/api/npc/lines", { token: M.token, body: { npc: "goblins", venue: "kiosk" } });
const bub2 = since(t, (q) => q.kind === "bubble");
ok(r.status === 200 && bub2.length === 1 && bub2[0].engine === "big" && bub2[0].numCtx === 8192, "steady gone: counter talk falls over to the BIG engine");

// ---- a long prompt is re-fitted to whichever engine answers ---------------------------------
await steady.start();
await sleep(900);
await big.stop();
const longText = "y".repeat(780);
for (let i = 0; i < 9; i++) await askDm(M.token, conv, STERLING, `${longText} ${i}`);
t = Date.now();
r = await askDm(M.token, conv, STERLING, "short one at the end");
const last = since(t, (q) => q.kind === "reply").pop();
ok(!!last && last.engine === "steady" && last.chars <= (4096 - 260 - 150) * 3, `a long conversation answered by steady is fitted to its 4096 window (${last?.chars} chars)`);

srv.kill("SIGINT");
await steady.stop();
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
