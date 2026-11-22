// THE HOUSE'S THREE VOICES (Josh, Sep 2026: "The goblins and sterling need to
// have more interaction. i would like to add a command like for the goblins
// like sterling as well as add more commands to sterlings list… lets add a
// complete dialague expansion for the dr ada as well").
//
// Run:  npm run build && node scripts/checks/test_three_voices.mjs
//
// The whole feature is a claim about WHO SPEAKS AND WHEN, so it is driven
// rather than trusted. What it pins:
//
//   · THREE BOT ROWS — sterling, goblins, voss — each isBot, each refused a
//     login, each seeded idempotently BY NAME across a real restart.
//   · THE CHAIN: one message hook, three handlers, first owner wins. A
//     /goblins command is answered by the GOBLINS (not Sterling), an /ada
//     command by VOSS, and an ordinary message by nobody. That last one
//     matters: a chain that answers everything is a chain that has broken.
//   · Every command in all three help lists actually answers, because a help
//     text that lists a command nobody implemented is worse than no help.
//   · An unknown subcommand gets a reply, not silence — the failure mode of a
//     command layer is a user typing into a void.
//   · THE THREE-WAY: Voss files a field notice, Sterling answers it AS A REPLY
//     (replyToId + the hydrated preview), and the goblins may barge in under
//     HIS reply. It is the only thread all three are in.
//   · The notice is stamped and gap-limited, and the admin lever is admin-only.
//   · /ada grant reads the REAL budget, so the dialogue can't drift from the
//     money path it is describing.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { GOBLINS_USERNAME } = require(path.join(ROOT, "dist", "goblins.js"));
const { VOSS_USERNAME, BACKROOMS_LEVELS, RETRIEVAL_PCT } = require(path.join(ROOT, "dist", "voss.js"));

const PORT = 8516;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "voices-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const ENV = {
  PORT: String(PORT),
  DATA_DIR,
  ADMIN_PASSWORD: ADMIN_PW,
  ALLOW_REGISTRATION: "true",
  REQUIRE_INVITE: "false",
  LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  // The bots answer after a beat in production; the harness can't wait it out
  // at every assert, so the beat is dialled down rather than removed (removing
  // it would stop testing the async path at all).
  STERLING_REPLY_MS: "40",
  GOBLIN_REPLY_MS: "40",
  VOSS_REPLY_MS: "40",
  VOSS_SCOLD_MS: "120",
  VOSS_BARGE_MS: "220",
};
let srv = null;
let bootLog = "";
const boot = () => {
  srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
    env: { ...process.env, ...ENV },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};

const run = async () => {
  boot();
  ok(await waitUp(), "server up");

  const { Store } = await import("file://" + path.join(ROOT, "dist", "db", "store.js").replace(/\\/g, "/"));
  const st = new Store(path.join(DATA_DIR, "solace.db"));

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const A = await register("surveyor", "Sturdy!Passw0rd#9");
  ok(!!A.token, "a member registered");

  const channels = (await api("GET", "/api/channels", { token: A.token })).body.channels;
  const general = channels.find((c) => c.name === "general");
  ok(!!general, "#general found");

  const BOTS = {
    sterling: st.getUserByUsername("sterling"),
    goblins: st.getUserByUsername(GOBLINS_USERNAME),
    voss: st.getUserByUsername(VOSS_USERNAME),
  };

  // ---- THREE BOT ROWS ----------------------------------------------------
  ok(!!BOTS.sterling && !!BOTS.goblins && !!BOTS.voss, "all three bot rows exist");
  ok(BOTS.voss.isBot === 1 || BOTS.voss.isBot === true, "Dr. Voss is flagged a bot");
  ok(BOTS.voss.displayName === "Dr. Ada Voss", "…wearing her own name");
  ok(!!BOTS.voss.bio, "…with a bio on her profile");
  const vossLogin = await api("POST", "/api/login", { body: { username: VOSS_USERNAME, password: "anything at all" } });
  ok(vossLogin.status >= 400 && !vossLogin.body?.token, "…and she can never log in");

  // ---- THE CHAIN ---------------------------------------------------------
  const since = { id: 0 };
  const post = async (body, token = A.token) => {
    let r = await api("POST", `/api/channels/${general.id}/messages`, { token, body: { body } });
    // POST_BURST is 20 per 10s per account. Walking three help lists is far
    // past that, so back off and retry rather than raising the ceiling for a
    // test — the 429 is the flood armor working, and this harness should not
    // be the reason somebody later decides it is too strict.
    for (let i = 0; i < 12 && r.status === 429; i++) {
      await sleep(1100);
      r = await api("POST", `/api/channels/${general.id}/messages`, { token, body: { body } });
    }
    if (r.status !== 200) console.error(`    (post refused ${r.status} for "${body}")`);
    since.id = r.body?.message?.id ?? since.id;
    await sleep(260);
    return r;
  };
  const recent = async (limit = 12) => {
    const r = await api("GET", `/api/channels/${general.id}/messages?limit=${limit}`, { token: A.token });
    return r.body?.messages ?? [];
  };
  /** The newest message authored by `who`, or null. */
  const lastFrom = async (who) => {
    const msgs = await recent(20);
    const mine = msgs.filter((m) => m.userId === BOTS[who].id);
    return mine.length ? mine[mine.length - 1] : null;
  };

  // An ordinary message is nobody's command. A chain that answers everything
  // is a chain that has broken.
  const beforeCount = (await recent(40)).length;
  await post("just talking in here, nothing to see");
  const afterCount = (await recent(40)).length;
  ok(afterCount === beforeCount + 1, "an ordinary message is answered by nobody");

  // THE HELP LIST IS THE TEST FIXTURE, not a copy of it (Sep 2026). These
  // used to be three hardcoded arrays that had to be edited by hand every
  // time a command was added or renamed — which is exactly the drift the
  // assert exists to catch, since a stale array silently stops covering the
  // new command. Now the harness ASKS each bot for its own help, parses the
  // bullets out of the reply, and drives what it finds: rename a command and
  // forget to implement it and this goes red on its own.
  const commandsInHelp = async (slug, who) => {
    await post(`/${slug} help`);
    const m = await lastFrom(who);
    if (!m?.body) return [];
    return m.body
      .split("\n")
      .map((l) => l.match(/^[•·]\s+([a-z]+)/i))
      .filter(Boolean)
      .map((mm) => mm[1].toLowerCase());
  };
  /** Drive every command a bot's own help list advertises. */
  const driveHelp = async (slug, who) => {
    const cmds = ["help", ...(await commandsInHelp(slug, who))];
    let answered = 0;
    for (const c of cmds) {
      await post(`/${slug} ${c}`);
      const m = await lastFrom(who);
      if (m && m.body && m.body.length > 20) answered++;
      else console.error(`    (no ${who} answer for "${c}")`);
    }
    ok(cmds.length >= 8, `/${slug} help advertises a real list (${cmds.length - 1} commands)`);
    ok(answered === cmds.length, `every command /${slug} help advertises actually answers (${answered}/${cmds.length})`);
  };

  // ---- /goblins ----------------------------------------------------------
  await driveHelp("goblins", "goblins");

  await post("/goblins");
  ok((await lastFrom("goblins")) !== null, "a bare /goblins greets");
  await post("/goblins fhqwhgads");
  const gDefault = await lastFrom("goblins");
  ok(gDefault && /help/i.test(gDefault.body), "an unknown /goblins subcommand points at help rather than going silent");

  // The goblins answer their own command — NOT Sterling. The chain's whole job.
  const sterlingBefore = (await recent(40)).filter((m) => m.userId === BOTS.sterling.id).length;
  await post("/goblins rates");
  const sterlingAfter = (await recent(40)).filter((m) => m.userId === BOTS.sterling.id).length;
  ok(sterlingAfter === sterlingBefore, "…and Sterling does not answer a command addressed to them");

  // ---- /ada --------------------------------------------------------------
  await driveHelp("ada", "voss");

  await post("/voss levels");
  const alias = await lastFrom("voss");
  ok(alias && alias.body.includes(String(BACKROOMS_LEVELS)), "/voss is an alias for /ada, and the descent names all ten levels");

  // THE DESCENT IS ONE DOOR PER LEVEL (Josh, Sep 2026: "it was always one door
  // from the begining"). The old draft had her describing a DIAL that chose a
  // destination, which is a different game — so the answer is pinned to the
  // rule rather than merely to the count, and the retired word is pinned as an
  // alias so an old habit still lands somewhere.
  ok(alias && /door/i.test(alias.body), "…and says the way down is a door");
  ok(alias && !/\btun(e|ed|ing)\b/i.test(alias.body), "…and never offers to tune anybody anywhere");
  await post("/ada bands");
  const oldWord = await lastFrom("voss");
  ok(oldWord && /door/i.test(oldWord.body), "the retired word 'bands' still reaches the descent");

  // THE DIALOGUE CANNOT DRIFT FROM THE MONEY PATH it describes.
  st.db.prepare("UPDATE async_grant SET silver = 12345 WHERE id = 1").run();
  await post("/ada grant");
  const grantLine = await lastFrom("voss");
  ok(grantLine && grantLine.body.includes("12,345"), "/ada grant quotes the REAL acquisition account, not a number in a string");

  // ---- /sterling ---------------------------------------------------------
  // His whole list now, not just the commands one round happened to add.
  await driveHelp("sterling", "sterling");

  await post("/sterling help");
  const help = await lastFrom("sterling");
  ok(help && /\/goblins/.test(help.body) && /\/ada/.test(help.body),
     "…and his help points at the other two voices, so they are discoverable");

  // THE WAY IN IS DISCOVERABLE (Josh, Sep 2026: "give each NPC a help option
  // to understand how to use them"). Three surfaces, and a bare command is the
  // one somebody actually types first.
  for (const [slug, who] of [["sterling", "sterling"], ["goblins", "goblins"], ["ada", "voss"]]) {
    await post(`/${slug}`);
    const greet = await lastFrom(who);
    ok(greet && new RegExp(`/${slug} help`, "i").test(greet.body),
       `a bare /${slug} points at its own help`);
  }
  for (const [who, slug] of [["sterling", "sterling"], ["goblins", "goblins"], ["voss", "ada"]]) {
    ok(new RegExp(`/${slug} help`, "i").test(st.getUserByUsername(BOTS[who].username).bio ?? ""),
       `…and ${who}'s profile bio says so too`);
  }

  // THE HOUSE READS SAFE. An admin asking for the gauge is told it, rather
  // than shown a number the reaper will never use on them.
  await post("/sterling reaper", admin);
  const houseGauge = await lastFrom("sterling");
  ok(houseGauge && /can't die/i.test(houseGauge.body), "the house is never shown a reaper gauge");

  // ---- THE THREE-WAY -----------------------------------------------------
  const newestId = async () => {
    const msgs = await recent(5);
    return msgs.length ? msgs[msgs.length - 1].id : 0;
  };
  const before = await newestId();
  const notice = await api("POST", "/api/admin/voss/notice", { token: admin });
  ok(notice.status === 200 && /FIELD NOTICE/.test(notice.body.body ?? ""), "Voss files a field notice on the admin's lever");
  await sleep(900);
  const thread = await recent(40);
  const noticeMsg = thread.find((m) => m.id === notice.body.id);
  ok(!!noticeMsg && noticeMsg.userId === BOTS.voss.id, "…authored by Dr. Voss");
  const answer = thread.find((m) => m.userId === BOTS.sterling.id && m.replyTo?.id === notice.body.id);
  ok(!!answer, "…and Sterling answers it AS A REPLY");
  ok(answer && answer.replyTo?.author?.id === BOTS.voss.id && (answer.replyTo?.excerpt ?? "").length > 0,
     "…with the reply preview hydrated (author + excerpt), like the message route does it");
  ok((await newestId()) > before, "the thread grew");

  const memberNotice = await api("POST", "/api/admin/voss/notice", { token: A.token });
  ok(memberNotice.status === 403, "a member cannot make her file a notice");
  ok(Number(st.kvGet("voss_notice_at") ?? 0) > 0, "the notice is stamped, so the gap can be enforced");
  const auditRow = st.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'voss.notice'").get().n;
  ok(auditRow >= 1, "…and the lever is audited, like every house voice that speaks to the whole server");

  // The goblins barge in some of the time. Fire several notices and prove the
  // path exists at all rather than pinning a coin flip.
  let barged = 0;
  for (let i = 0; i < 8 && !barged; i++) {
    const r = await api("POST", "/api/admin/voss/notice", { token: admin });
    await sleep(600);
    const t = await recent(40);
    const his = t.find((m) => m.userId === BOTS.sterling.id && m.replyTo?.id === r.body.id);
    if (his && t.some((m) => m.userId === BOTS.goblins.id && m.replyTo?.id === his.id)) barged++;
  }
  ok(barged > 0, "the goblins barge in under Sterling's reply — all three voices in one thread");

  st.close();

  // ---- THE SEED IS IDEMPOTENT ACROSS A RESTART ---------------------------
  // Name-keyed, not count-keyed (the notice board's lesson): a second boot
  // must not stack a second Dr. Voss.
  stop();
  await sleep(700);
  boot();
  ok(await waitUp(), "server restarted");
  const st2 = new Store(path.join(DATA_DIR, "solace.db"));
  const vossRows = st2.db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = ?").get(VOSS_USERNAME).n;
  ok(vossRows === 1, "a restart does not stack a second Dr. Voss — the seed is name-keyed");
  const botCount = st2.db.prepare("SELECT COUNT(*) AS n FROM users WHERE isBot = 1").get().n;
  // Seven bot rows: the three voices and the four casino regulars, whose rows
  // stay (hidden, migration 119) so their old messages keep a name.
  ok(botCount === 7, "…and the house still has exactly seven bot rows (the three voices and the four hidden regulars)");
  st2.close();

  console.log("");
  if (bad) {
    console.log(bootLog.split("\n").slice(-14).join("\n"));
    console.log(`${n - bad} passed, ${bad} FAILED`);
    process.exit(1);
  }
  console.log(`${n}/${n} three-voices asserts passed`);
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
