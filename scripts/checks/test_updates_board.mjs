// THE NOTICE BOARD — "Solace Updates" (Josh, Sep 2026).
//
// Run:  npm run build && node scripts/checks/test_updates_board.mjs
//
// Josh: "create a text channel in solace general that no can post in except
// admin called 'Solace Updates' … just post a simple generalized chat via
// sterling in that text channel."
//
// The whole feature is a PERMISSION CLAIM — "nobody can post in it except
// admin" — so it gets driven against a real server rather than trusted. What
// this pins down:
//   · the board is seeded on Solace General, locked, owned by the house
//   · a member CANNOT post in it (403), and nothing lands when they try
//   · a moderator can't either — this is admin-and-Sterling only
//   · an admin CAN post directly
//   · Sterling posts through the admin lever, authored by the BOT, and the
//     lock never stands in his way (he writes through the store)
//   · the lever is admin-only, refuses an empty or oversized brief, and is
//     audited
//   · everyone can READ it — a notice board nobody can see is a diary
//   · the seed is IDEMPOTENT: a second boot against the same DB must not
//     stack a second board (it is name-keyed, not count-keyed, because it has
//     to appear on servers that already have channels)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8513;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "updates-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const ENV = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR,
  ADMIN_PASSWORD: ADMIN_PW,
  ALLOW_REGISTRATION: "true",
  REQUIRE_INVITE: "false",
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
};
let srv = null;
let bootLog = "";
const boot = () => {
  srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => { bootLog += d; });
  srv.stderr.on("data", (d) => { bootLog += d; });
};
const stop = () => { try { srv?.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const waitUp = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
};

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", {
    body: { username, password, displayName: username, secret, acceptTerms: true },
  });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};

const run = async () => {
  boot();
  ok(await waitUp(), "server booted");

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const m = await register("boardreader", pw);
  const mod = await register("boardmod", pw);
  ok(!!m.token && !!mod.token, "a member and a mod-to-be registered");
  await api("POST", `/api/admin/users/${mod.id}/role`, { token: admin, body: { role: "moderator" } });

  // ---- the board exists, on the right page, locked ------------------------
  const chans = async (token) => (await api("GET", "/api/channels", { token })).body?.channels ?? [];
  const board = (await chans(admin)).find((c) => c.name === "Solace Updates");
  ok(!!board, "the board was seeded as 'Solace Updates'");
  ok(board?.pageId === 1, "…on Solace General");
  ok(board?.locked === 1 || board?.locked === true, "…and it is LOCKED");
  ok((board?.kind ?? "text") === "text", "…a text channel, not voice");
  ok(!!board?.topic, "…with a topic explaining what it is");

  // ---- EVERYONE CAN READ IT ----------------------------------------------
  // A notice board nobody can see is a diary. The lock is about POSTING.
  const asMember = (await chans(m.token)).find((c) => c.name === "Solace Updates");
  ok(!!asMember, "an ordinary member SEES the board in their channel list");
  const readable = await api("GET", `/api/channels/${board.id}/messages`, { token: m.token });
  ok(readable.status === 200, "…and can read it");

  // ---- NOBODY POSTS BUT THE HOUSE ----------------------------------------
  const post = (token, body) =>
    api("POST", `/api/channels/${board.id}/messages`, { token, body: { body } });
  const count = async () =>
    ((await api("GET", `/api/channels/${board.id}/messages`, { token: admin })).body?.messages ?? []).length;

  const before = await count();
  const memberTry = await post(m.token, "can I post here?");
  ok(memberTry.status === 403, "a member posting to the board is refused 403");
  ok((await count()) === before, "…and NOTHING landed");
  const modTry = await post(mod.token, "mod here, posting");
  ok(modTry.status === 403, "a MODERATOR is refused too — this is admin-only");
  ok((await count()) === before, "…and nothing landed for them either");
  ok((await post(null, "anon")).status === 401, "…and an anonymous caller gets 401");

  const adminTry = await post(admin, "house test");
  ok(adminTry.status === 200, "an admin CAN post to the board directly");
  ok((await count()) === before + 1, "…and it landed");

  // ---- STERLING'S LEVER ---------------------------------------------------
  const brief = (token, body) => api("POST", "/api/admin/sterling/update", { token, body: { body } });
  ok((await brief(m.token, "hi")).status === 403, "the lever refuses an ordinary member");
  ok((await brief(mod.token, "hi")).status === 403, "…and a moderator");
  ok((await brief(null, "hi")).status === 401, "…and anonymous");
  ok((await brief(admin, "   ")).status === 400, "…and an empty brief");
  ok((await brief(admin, "x".repeat(4001))).status === 400, "…and one too long to be a brief");
  ok((await count()) === before + 1, "none of those refusals posted anything");

  // Plain text with line breaks — chat has no markdown, and the body renders
  // pre-wrap, so this is the shape a real brief takes.
  const posted = await brief(admin, "THE HOUSE POSTS\n\n· A test notice.");
  ok(posted.status === 200, "the admin can post a brief through Sterling");
  ok(posted.body?.channelId === board.id, "…onto the board, not #general");

  const msgs = (await api("GET", `/api/channels/${board.id}/messages`, { token: admin })).body?.messages ?? [];
  const last = msgs[msgs.length - 1];
  ok(last?.body?.includes("THE HOUSE POSTS"), "…carrying the text it was given");
  ok(last?.body?.includes("\n"), "…with its line breaks intact (briefs are plain text, not markdown)");
  ok(last?.author?.isBot === true, "…AUTHORED BY THE BOT, not by the admin who pulled the lever");
  ok(last?.author?.username === "sterling", "…and that bot is Sterling");

  // The lock is real and Sterling is not exempt from it as a MEMBER — he is
  // exempt because he writes through the store. Prove the lock still stands
  // after he has posted (a lever that quietly unlocked the room would pass
  // every assert above).
  const stillLocked = (await chans(admin)).find((c) => c.id === board.id);
  ok(stillLocked?.locked === 1 || stillLocked?.locked === true, "the board is still locked after a brief");
  ok((await post(m.token, "now?")).status === 403, "…and the member is still refused");

  // ---- AUDITED ------------------------------------------------------------
  const audit = (await api("GET", "/api/admin/audit", { token: admin })).body?.audit ?? [];
  ok(audit.some((r) => r.action === "sterling.update"), "the brief is in the audit trail");

  // ---- THE SEED IS IDEMPOTENT --------------------------------------------
  // It is name-keyed, not count-keyed (unlike seedGeneral), because it has to
  // appear on servers that already have channels. A second boot must not
  // stack a second board.
  stop();
  await sleep(900);
  bootLog = "";
  boot();
  ok(await waitUp(), "server rebooted against the same DB");
  const admin2 = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const boards = (await chans(admin2)).filter((c) => c.name === "Solace Updates");
  ok(boards.length === 1, "a second boot did NOT stack a second board");
  ok(boards[0].id === board.id, "…it is the same channel");
  const kept = (await api("GET", `/api/channels/${board.id}/messages`, { token: admin2 })).body?.messages ?? [];
  ok(kept.length === before + 2, "…and the notices already posted survived the restart");

  console.log("");
  if (bad) {
    console.log(bootLog.split("\n").slice(-12).join("\n"));
    console.log(`${n - bad} passed, ${bad} FAILED`);
    process.exit(1);
  }
  console.log(`${n}/${n} notice-board asserts passed`);
};

run()
  .catch((e) => {
    console.error(e);
    console.log(bootLog.split("\n").slice(-15).join("\n"));
    process.exit(1);
  })
  .finally(() => {
    stop();
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
