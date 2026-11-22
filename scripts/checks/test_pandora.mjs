// PANDORA'S BOX (Josh, Sep 2026 — PANDORA.md) over a real server on a
// throwaway port.
//
//  · THE RULES (pure): retired badges are excluded from "every achievement",
//    the Rusted Key's target is the FINISHED game (10 levels, 100 relics),
//    canOpen wants all three, a taken world choice is refused and hope is
//    always allowed.
//  · THE HOOKS: Tier 4 staged → the Prismatic Key, with the earner's
//    pandora.key frame and Sterling's note under the door; every earnable
//    badge granted → the Brass Key through the same pass; twenty relics →
//    NO Rusted Key (the admin lever hands one over, audited).
//  · THE BOX: an unheld key refused; a held key set (idempotent); the lid
//    refused with two keys, refused to the house, once per opener, a taken
//    world choice refused 409 free; a key revoked out of a READY box shuts
//    the lid again; the opening issues THE PANDORAN (item +
//    locker row, unsellable to Voss), announces in #general, broadcasts the
//    fanfare to a bystander; the ledger reads in order with the first
//    marked; THE STONE (the one repeatable choice) handed to every opener
//    who reaches for it; hope left in the box when the regime choices are
//    gone; a reset on a stone-taker takes the stone back.
//  · THE HOUSE: the admin reads no key even at Tier 4; the levers refuse
//    members and audit; reset clears the opening, the flag and the suit.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { PANDORA_KEYS, RUSTED_LEVELS, RUSTED_RELICS, PANDORA_CHOICES, keyEarned, canOpen, choiceAvailable, PANDORAN_ITEM, PANDORAN_COLOR } =
  require(path.join(ROOT, "dist", "pandora.js"));
const { STONE_CODE, STONE_CHOICE } = require(path.join(ROOT, "dist", "abyss.js"));
const { ACHIEVEMENTS, earnableAchievementIds } = require(path.join(ROOT, "dist", "achievements.js"));
const { PANDORAN_ITEM: _PANDORAN_ITEM } = require(path.join(ROOT, "dist", "pandora.js"));

const PORT = 8511;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "pandora-harness");
const DB = path.join(DATA, "solace.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    STERLING_REPLY_MS: "60",
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
  return { status: res.status, body: json };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `three keys one lid ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.83.0.${10 + regSeq}` },
  });
  return { token: r.body?.token, id: r.body?.user?.id };
};
const socket = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = { ws, frames, of: (t) => frames.filter((f) => f.type === t) };
    ws.on("message", (m) => { try { frames.push(JSON.parse(String(m))); } catch { /* junk */ } });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" } })).body?.token;
  ok(!!admin, "admin signed in");
  const A = await register("opener");
  const B = await register("bystander");
  const C = await register("second");
  ok(!!A.token && !!B.token && !!C.token, "three members registered");
  const st = new Store(DB);

  // ======================================================================
  // THE RULES (pure)
  // ======================================================================
  console.log("\n— the rules —");
  const retired = ACHIEVEMENTS.filter((a) => a.retired).map((a) => a.id).sort();
  ok(JSON.stringify(retired) === JSON.stringify(["contract-1", "crown-1", "crown-3", "liquidated-1", "trade-big", "trade-desk-1", "trade-desk-100"]), "the retired badges are the Pit crown's two and the closed Exchange's five — nothing else");
  const earnable = earnableAchievementIds();
  ok(earnable.length === ACHIEVEMENTS.length - 8 && !earnable.includes("crown-1") && !earnable.includes("trade-desk-1"), `${earnable.length} earnable badges, the retired and unique ones excluded`);
  ok(RUSTED_LEVELS === 10 && RUSTED_RELICS === 100, "the Rusted Key's target is the finished game: 10 levels, 100 relics");
  ok(JSON.stringify(PANDORA_KEYS) === JSON.stringify(["prismatic", "brass", "rusted"]), "three keys, in order");
  const F = (o) => ({ vipTier: 0, badgesTotal: 56, badgesEarned: 0, relics: 0, ...o });
  ok(keyEarned("prismatic", F({ vipTier: 4 })) && !keyEarned("prismatic", F({ vipTier: 3 })), "the Prismatic Key is Tier 4, not 3");
  ok(keyEarned("brass", F({ badgesEarned: 56 })) && !keyEarned("brass", F({ badgesEarned: 55 })) && !keyEarned("brass", F({ badgesTotal: 0 })),
    "the Brass Key is every earnable badge — and an empty catalog earns nothing");
  ok(!keyEarned("rusted", F({ relics: 100 })), "a hundred relics with two levels built is still no Rusted Key (the maps aren't finished)");
  ok(!keyEarned("rusted", F({ relics: 20 })), "…and twenty relics certainly isn't");
  ok(!canOpen(["prismatic", "brass"]) && canOpen(["rusted", "brass", "prismatic"]), "the lid wants all three, in any order");
  ok(choiceAvailable(null, ["destroy-goblins"]) && choiceAvailable("retire-reaper", ["destroy-goblins"]) && !choiceAvailable("destroy-goblins", ["destroy-goblins"]) && !choiceAvailable("nonsense", []),
    "hope is always allowed; a taken choice and an invented one are not");
  ok(PANDORA_CHOICES.length === 3 && PANDORA_CHOICES.filter((c) => c.once).length === 2 && PANDORA_CHOICES.find((c) => !c.once)?.id === STONE_CHOICE,
    "three choices: two once-ever, and the Stone for anyone who reaches it");
  // THE BRASS KEY MUST BE REACHABLE. A badge only one account in the server's
  // history can hold cannot be part of "every achievement", or the box is
  // shut for everyone else alive (Sep 2026 review: door-opener is stamped on
  // ONE backrooms_flags row, and the door refuses a second opening).
  const uniques = ACHIEVEMENTS.filter((a) => a.unique).map((a) => a.id);
  ok(uniques.includes("door-opener") && !earnable.includes("door-opener"),
    "the once-ever door badge is marked unique and excluded from the Brass Key");
  ok(ACHIEVEMENTS.filter((a) => !a.retired && !a.unique).every((a) => earnable.includes(a.id)),
    "…and every other living badge still counts toward the wall");

  // ======================================================================
  // THE HOOKS
  // ======================================================================
  console.log("\n— the hooks —");
  const wsA = await socket(A.token);
  const fresh = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(fresh.keys.length === 3 && fresh.keys.every((k) => !k.held && !k.inserted && !k.live) && fresh.canOpen === false && fresh.ledger.length === 0,
    "a fresh member holds nothing, nothing is set, the ledger is empty");
  ok(fresh.progress.levels.built === 3 && fresh.progress.levels.total === 10 && fresh.progress.relics.placed === 30 && fresh.progress.relics.total === 100,
    "honest progress: 3 of 10 levels built, 30 of 100 relics placed");
  // THE PRISMATIC KEY: Tier 4 staged on the row; the profile view runs the check.
  st.db.prepare("UPDATE users SET vipTier = 4 WHERE id = ?").run(A.id);
  await api("GET", `/api/users/${A.id}/profile`, { token: B.token });
  await sleep(400);
  let s1 = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(s1.keys.find((k) => k.key === "prismatic").held && !s1.keys.find((k) => k.key === "brass").held, "Tier 4 hands over the Prismatic Key and nothing else");
  ok(wsA.of("pandora.key").some((f) => f.key === "prismatic"), "…the earner's socket got the pandora.key frame");
  const note = wsA.of("dm.message").find((f) => /Prismatic Key/.test(f.message?.body ?? ""));
  ok(!!note && /Pandora's Box/.test(note.message.body), "…and Sterling's note says it's waiting at the box");
  // THE BRASS KEY: every earnable badge, granted straight into the table; the check runs off a profile view.
  for (const id of earnable.slice(0, -1)) st.db.prepare("INSERT OR IGNORE INTO user_achievements (userId, achId, earnedAt) VALUES (?, ?, ?)").run(A.id, id, Date.now());
  await api("GET", `/api/users/${A.id}/profile`, { token: B.token });
  await sleep(300);
  s1 = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(!s1.keys.find((k) => k.key === "brass").held && s1.progress.badges.earned === earnable.length - 1, "one badge short of the wall: no Brass Key");
  st.db.prepare("INSERT OR IGNORE INTO user_achievements (userId, achId, earnedAt) VALUES (?, ?, ?)").run(A.id, earnable[earnable.length - 1], Date.now());
  await api("GET", `/api/users/${A.id}/profile`, { token: B.token });
  await sleep(300);
  s1 = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(s1.keys.find((k) => k.key === "brass").held, "the last badge hands over the Brass Key");
  ok(wsA.of("dm.message").some((f) => /Brass Key/.test(f.message?.body ?? "")), "…with Sterling's note");
  // THE RUSTED KEY: every relic that EXISTS is not the finished game.
  const allRelics = require(path.join(ROOT, "dist", "backrooms", "relics.js")).ALL_RELICS.map((r) => r.slug);
  for (const r of allRelics) st.brUnlockRelic(A.id, r);
  await api("GET", `/api/users/${A.id}/profile`, { token: B.token });
  await sleep(300);
  s1 = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(!s1.keys.find((k) => k.key === "rusted").held && s1.progress.relics.owned === allRelics.length && allRelics.length === 30 && s1.progress.levels.perLevel.every((l) => l.owned === l.total),
    "all thirty relics that exist: all three built levels complete, still NO Rusted Key (7 levels to go)");

  // ======================================================================
  // THE HOUSE + THE LEVER
  // ======================================================================
  console.log("\n— the house and the lever —");
  const adm = (await api("GET", "/api/pandora", { token: admin })).body;
  ok(adm.progress.vipTier === 4 && adm.keys.every((k) => !k.held && !k.live) && adm.canOpen === false, "the admin reads Tier 4 and holds no key — the house doesn't compete");
  const adminId = st.db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
  ok((await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: adminId, key: "rusted" } })).status === 400, "the lever refuses to hand the house a key");
  ok((await api("POST", "/api/admin/pandora/key", { token: A.token, body: { userId: A.id, key: "rusted" } })).status === 403, "a member can't pull the lever");
  ok((await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: A.id, key: "skeleton" } })).status === 400, "an invented key is refused");
  const lever = await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: A.id, key: "rusted" } });
  ok(lever.status === 200 && lever.body.granted === true, "the admin hands over the Rusted Key for testing");
  ok((await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: A.id, key: "rusted" } })).body.granted === false, "…a second grant is a no-op");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'pandora.key_grant'").get().n === 2, "…both audited");
  await sleep(200);
  ok(wsA.of("dm.message").some((f) => /Rusted Key/.test(f.message?.body ?? "")), "…and Sterling's note came with the lever's key too");

  // ======================================================================
  // THE BOX
  // ======================================================================
  console.log("\n— the box —");
  ok((await api("POST", "/api/pandora/insert", { token: B.token, body: { key: "prismatic" } })).status === 403, "a key you don't hold can't be set");
  ok((await api("POST", "/api/pandora/insert", { token: A.token, body: { key: "master" } })).status === 400, "an invented key can't be set");
  const in1 = await api("POST", "/api/pandora/insert", { token: A.token, body: { key: "prismatic" } });
  ok(in1.status === 200 && JSON.stringify(in1.body.inserted) === JSON.stringify(["prismatic"]), "the Prismatic Key is set");
  ok((await api("POST", "/api/pandora/insert", { token: A.token, body: { key: "prismatic" } })).status === 200, "…setting it again is harmless");
  await api("POST", "/api/pandora/insert", { token: A.token, body: { key: "brass" } });
  const two = await api("POST", "/api/pandora/open", { token: A.token, body: { choice: "destroy-goblins" } });
  ok(two.status === 403 && two.body.error === "keys_missing" && st.db.prepare("SELECT COUNT(*) AS n FROM pandora_openings").get().n === 0,
    "two keys in: the lid won't move, nothing recorded");
  await api("POST", "/api/pandora/insert", { token: A.token, body: { key: "rusted" } });
  const ready = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(ready.keys.every((k) => k.inserted) && ready.canOpen === true, "three keys in: the box may be opened");
  ok((await api("POST", "/api/pandora/open", { token: A.token, body: { choice: "nonsense" } })).status === 400, "an invented choice is refused");
  ok((await api("POST", "/api/pandora/open", { token: admin, body: { choice: null } })).status === 403, "the house cannot open it");

  // THE OPENING — a bystander on the wire hears it.
  const wsB = await socket(B.token);
  const generalId = (await api("GET", "/api/channels", { token: B.token })).body.channels.find((c) => c.name === "general").id;
  const before = (await api("GET", `/api/channels/${generalId}/messages`, { token: B.token })).body.messages.length;
  const open1 = await api("POST", "/api/pandora/open", { token: A.token, body: { choice: "destroy-goblins" } });
  ok(open1.status === 200 && open1.body.choice === "destroy-goblins" && open1.body.suit === PANDORAN_ITEM, "THE OPENING: recorded with the choice, the suit named");
  await sleep(500);
  ok(wsB.of("pandora.opened").some((f) => f.name === "opener" && f.choice === "destroy-goblins" && f.first === true), "…the bystander's socket got the fanfare, marked THE FIRST");
  const after = (await api("GET", `/api/channels/${generalId}/messages`, { token: B.token })).body.messages;
  const grand = after.find((m) => /PANDORA'S BOX/.test(m.body) && /opener/.test(m.body));
  ok(after.length > before && !!grand && /Destroy the Goblins/.test(grand.body) && /first in the history/i.test(grand.body), "…and Sterling's grand announcement landed in #general naming the choice");
  ok(st.pandoraFlag("destroy-goblins")?.userId === A.id, "…the world flag is set to the opener");
  ok(st.ownsItem(A.id, PANDORAN_ITEM), "THE PANDORAN: the item is theirs");
  const meBr = (await api("GET", "/api/backrooms/me", { token: A.token })).body;
  const row = meBr.items.find((i) => i.kind === "suit" && i.color === PANDORAN_COLOR);
  ok(!!row, "…and the locker row is issued");
  const sell = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: row.id } });
  ok(sell.status === 400 && sell.body.error === "unsellable" && typeof meBr.coins === "number",
     "…unsellable to Voss (the silver faucet stays shut)");
  st.db.prepare("DELETE FROM backrooms_locker WHERE id = ?").run(row.id);
  const meBr2 = (await api("GET", "/api/backrooms/me", { token: A.token })).body;
  ok(meBr2.items.some((i) => i.kind === "suit" && i.color === PANDORAN_COLOR), "…a lost Pandoran is re-issued");
  ok((await api("POST", "/api/pandora/open", { token: A.token, body: { choice: "retire-reaper" } })).body.error === "already_opened", "once per opener: a second opening is refused");
  const mine = (await api("GET", "/api/pandora", { token: A.token })).body;
  ok(mine.opened?.choice === "destroy-goblins" && mine.canOpen === false && mine.suitOwned === true, "the page reads the opening back");
  ok(mine.choices.find((c) => c.id === "destroy-goblins").taken && mine.choices.find((c) => c.id === "destroy-goblins").takenBy.name === "opener", "…and the choice is engraved with the name that took it");

  // THE SECOND OPENER: a taken choice refused free; the rest available; then hope.
  console.log("\n— the second opener —");
  for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: C.id, key: k } });
  for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: C.token, body: { key: k } });
  const taken = await api("POST", "/api/pandora/open", { token: C.token, body: { choice: "destroy-goblins" } });
  ok(taken.status === 409 && taken.body.error === "choice_taken" && st.db.prepare("SELECT COUNT(*) AS n FROM pandora_openings").get().n === 1 && !st.ownsItem(C.id, PANDORAN_ITEM),
    "a taken world choice is refused 409 — nothing recorded, no suit");
  const open2 = await api("POST", "/api/pandora/open", { token: C.token, body: { choice: "retire-reaper" } });
  ok(open2.status === 200, "the second opener takes a choice still on the table");
  await sleep(400);
  ok(wsB.of("pandora.opened").some((f) => f.name === "second" && f.first === false), "…the fanfare says they weren't first");
  const led = (await api("GET", "/api/pandora", { token: B.token })).body.ledger;
  ok(led.length === 2 && led[0].user.displayName === "opener" && led[1].user.displayName === "second" && led[0].choice === "destroy-goblins" && led[1].choice === "retire-reaper",
    "the ledger reads in order, oldest first, for a member who holds nothing");
  // The Stone, then hope: reset the second opener, a fourth takes the Stone, a fifth takes it too, a sixth leaves hope.
  ok((await api("POST", "/api/admin/pandora/reset", { token: admin, body: { userId: C.id } })).body.cleared === true, "the admin clears a test opening");
  ok(!st.pandoraFlag("retire-reaper") && !st.ownsItem(C.id, PANDORAN_ITEM) && st.db.prepare("SELECT COUNT(*) AS n FROM backrooms_locker WHERE userId = ? AND color = ?").get(C.id, PANDORAN_COLOR).n === 0,
    "…the flag, the suit and the locker row are gone with it");
  await api("POST", "/api/pandora/open", { token: C.token, body: { choice: "retire-reaper" } });
  await api("POST", "/api/admin/pandora/reset", { token: admin, body: { userId: C.id } });
  const D = await register("fourth");
  for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: D.id, key: k } });
  for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: D.token, body: { key: k } });
  const stoneD = await api("POST", "/api/pandora/open", { token: D.token, body: { choice: STONE_CHOICE } });
  ok(stoneD.status === 200 && st.ownsEmoji(D.id, STONE_CODE) && !st.pandoraFlag(STONE_CHOICE), "THE STONE: the fourth reaches for it — it's in their inventory, and no world flag is stamped");
  await sleep(300);
  const msgsD = (await api("GET", `/api/channels/${generalId}/messages`, { token: B.token })).body.messages;
  ok(msgsD.some((m) => /fourth/.test(m.body) && /Stone of the Abyss/.test(m.body)), "…Sterling names the stone in #general");
  const E = await register("fifth");
  for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: E.id, key: k } });
  for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: E.token, body: { key: k } });
  await api("POST", "/api/pandora/open", { token: C.token, body: { choice: "retire-reaper" } });
  const stE = (await api("GET", "/api/pandora", { token: E.token })).body;
  ok(stE.choices.filter((c) => c.once).every((c) => c.taken) && stE.choices.find((c) => c.id === STONE_CHOICE).taken === false && stE.choices.find((c) => c.id === STONE_CHOICE).takers === 1,
    "both regime choices are taken now; the Stone reads one taker and is never 'taken'");
  ok((await api("POST", "/api/pandora/open", { token: E.token, body: { choice: "open-vault" } })).status === 400, "…the old third choice no longer exists");
  ok((await api("POST", "/api/pandora/open", { token: E.token, body: { choice: "retire-reaper" } })).status === 409, "…a taken one is refused");
  const stoneE = await api("POST", "/api/pandora/open", { token: E.token, body: { choice: STONE_CHOICE } });
  ok(stoneE.status === 200 && st.ownsEmoji(E.id, STONE_CODE) && st.ownsEmoji(D.id, STONE_CODE), "the fifth takes the Stone too — repeatable, two holders");
  const SX = await register("sixth");
  for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: SX.id, key: k } });
  for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: SX.token, body: { key: k } });
  const hope = await api("POST", "/api/pandora/open", { token: SX.token, body: { choice: null } });
  ok(hope.status === 200 && hope.body.choice === null && st.ownsItem(SX.id, PANDORAN_ITEM) && !st.ownsEmoji(SX.id, STONE_CODE), "they leave hope in the box — recorded, the Pandoran theirs, no stone");
  await sleep(300);
  const msgs = (await api("GET", `/api/channels/${generalId}/messages`, { token: B.token })).body.messages;
  ok(msgs.some((m) => /sixth/.test(m.body) && /left hope/i.test(m.body)), "…and Sterling says so in #general");
  ok((await api("POST", "/api/admin/pandora/reset", { token: admin, body: { userId: D.id } })).body.cleared === true && !st.ownsEmoji(D.id, STONE_CODE),
    "a reset on a stone-taker takes the stone back with the opening");
  // A KEY REVOKED OUT OF A READY BOX SHUTS THE LID. The grant/insert/revoke
  // path is tested below for one key; this is the one that matters — three in,
  // canOpen true, one taken back, and the opening refused with nothing written.
  const R = await register("ready");
  for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: R.id, key: k } });
  for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: R.token, body: { key: k } });
  ok((await api("GET", "/api/pandora", { token: R.token })).body.canOpen === true, "three keys set: the box is ready");
  await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: R.id, key: "rusted", revoke: true } });
  const shut = await api("POST", "/api/pandora/open", { token: R.token, body: { choice: STONE_CHOICE } });
  const openingsNow = st.db.prepare("SELECT COUNT(*) AS n FROM pandora_openings").get().n;
  ok(shut.status === 403 && shut.body.error === "keys_missing" && !st.ownsEmoji(R.id, STONE_CODE) && !st.ownsItem(R.id, PANDORAN_ITEM),
    "…a key taken back shuts it again: the lid is refused, no stone, no suit");
  ok((await api("GET", "/api/pandora", { token: R.token })).body.canOpen === false, "…and the page agrees the box is no longer ready");

  // A SCRUBBED OPENER LEAVES THE MONUMENT. The opening row stays (the choice
  // it spent is still spent) but a "deleted user" must not stand on the most
  // prestigious page in the game — the rule migrations 66 and 78 exist for.
  const beforeLedger = (await api("GET", "/api/pandora", { token: B.token })).body.ledger;
  const victim = beforeLedger[beforeLedger.length - 1];
  st.scrubUser(victim.user.id);
  const afterState = (await api("GET", "/api/pandora", { token: B.token })).body;
  ok(beforeLedger.length > 0 && afterState.ledger.length === beforeLedger.length - 1 &&
     !afterState.ledger.some((o) => o.user.id === victim.user.id),
    "a scrubbed opener leaves the public ledger");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM pandora_openings").get().n === openingsNow,
    "…but their opening row stays: the choice they spent is still spent");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM pandora_keys WHERE userId = ?").get(victim.user.id).n === 0 &&
     st.db.prepare("SELECT COUNT(*) AS n FROM abyss_portal WHERE userId = ?").get(victim.user.id).n === 0,
    "…and the scrub took their keys and their portal with their collection");
  // …and a profile view doesn't hand them back (Oct 2026 review): the badge
  // and VIP stamps survive a scrub, and the lazy check re-granted the keys.
  await api("GET", `/api/users/${victim.user.id}/profile`, { token: B.token });
  await sleep(300);
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM pandora_keys WHERE userId = ?").get(victim.user.id).n === 0,
    "…and viewing the deleted account's profile doesn't grant them again");

  // A revoked key comes out of the box with it.
  const rev = await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: B.id, key: "brass" } });
  await api("POST", "/api/pandora/insert", { token: B.token, body: { key: "brass" } });
  const rv = await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: B.id, key: "brass", revoke: true } });
  const stB = (await api("GET", "/api/pandora", { token: B.token })).body;
  ok(rev.status === 200 && rv.body.revoked === true && stB.keys.every((k) => !k.held && !k.inserted), "a revoked key comes out of the box with it");

  wsA.ws.close();
  wsB.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    process.exit(bad ? 1 : 0);
  });
