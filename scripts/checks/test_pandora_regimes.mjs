// PANDORA'S WORLD CHOICES, IN FORCE (PANDORA.md → "The world choices"), over a
// real server on a throwaway port. test_pandora.mjs proves the box records a
// choice; this proves the two regime choices then change Solace.
//
//  · DESTROY THE GOBLINS: every open debt WASHED inside the opening (the loan
//    rows gone, each one filed as "washed"), every prisoner out with their
//    bail pot refunded, every introductory offer void, and nothing minted —
//    wallets + escrows + vault + grant + float the same before and after.
//    The debtor is told. Foundry Lending lends at 3/4/5/6% a day, a missed
//    day never jails anybody (the ladder stops at REPOSSESSION) and the rate
//    never steps past 12%. The goblins write no letters, bark nothing, answer
//    /goblins with a dark kiosk. Their six badges leave the Brass Key's count.
//    Sterling is openly pleased.
//  · RETIRE THE REAPER: a rigged death wedge on a bare member blinks — no
//    tombstone — and a shielded member keeps the amulet. The gauge reads
//    retired and safe. Both talisman counters close 409, Sterling's shield
//    courtesy and the shield sale are refused.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { PANDORA_KEYS } = require(path.join(ROOT, "dist", "pandora.js"));
const { earnableAchievementIds, GOBLIN_BADGES } = require(path.join(ROOT, "dist", "achievements.js"));
const { FOUNDRY_RATES, FOUNDRY_RATE_CAP, stageFor } = require(path.join(ROOT, "dist", "lender.js"));
const { TALISMAN_CODE } = require(path.join(ROOT, "dist", "wheel.js"));

const PORT = 8596;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "pandora-regimes-harness");
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
    STERLING_REPLY_MS: "60", GOBLIN_REPLY_MS: "60",
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
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `two regimes one lid ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.84.0.${10 + regSeq}` },
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
  const st = new Store(DB);
  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });
  const openBox = async (who, choice) => {
    for (const k of PANDORA_KEYS) await api("POST", "/api/admin/pandora/key", { token: admin, body: { userId: who.id, key: k } });
    for (const k of PANDORA_KEYS) await api("POST", "/api/pandora/insert", { token: who.token, body: { key: k } });
    return api("POST", "/api/pandora/open", { token: who.token, body: { choice } });
  };
  const world = () => {
    const t = st.economyTotals();
    return t.totalCoins + t.escrow + t.potPending + t.vault + t.grant;
  };

  // ======================================================================
  // DESTROY THE GOBLINS
  // ======================================================================
  console.log("\n— the goblins, before —");
  const D = await register("debtor");
  const P = await register("prisoner");
  const F = await register("friend");
  const X = await register("prospect");
  const O = await register("opener");
  for (const u of [D, P, F, X]) await mint(u.id, 5_000);
  ok(st.takeLoan(D.id, 1_000).ok && st.takeLoan(P.id, 1_000).ok, "two members borrow the 1,000 window from the goblins");
  ok(st.loanOf(D.id).rate === 0.15, "…at the goblins' 15% a day");
  const now = Date.now();
  st.db.prepare("UPDATE users SET disabled = 1, jailedAt = ?, jailSealsAt = ? WHERE id = ?").run(now, now + 48 * 3_600_000, P.id);
  st.db.prepare("UPDATE loans SET missed = 5 WHERE userId = ?").run(P.id);
  const chip = st.chipIn(F.id, P.id, 300);
  ok(chip.ok && st.getCoins(F.id) === 4_700, "one is in the cells, a friend has 300 in the bail pot");
  st.setGoblinOffer(X.id, 0.07, now + 3_600_000);
  ok(!!st.goblinOffer(X.id), "a prospect holds a letter's introductory offer");
  const before = world();
  const wsD = await socket(D.token);

  console.log("\n— the opening —");
  const open = await openBox(O, "destroy-goblins");
  ok(open.status === 200 && st.foundryLending(), "the box opens on Destroy the Goblins — Foundry Lending is in force");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM loans").get().n === 0, "THE WASH: every loan row is gone");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM loan_events WHERE kind = 'washed'").get().n === 2, "…each one filed as washed in its owner's file");
  const pAfter = st.getUserById(P.id);
  ok(!pAfter.disabled && pAfter.jailedAt == null, "every cell is opened: the prisoner walks");
  ok(st.getCoins(F.id) === 5_000 && st.db.prepare("SELECT COUNT(*) AS n FROM bail_pot").get().n === 0, "…and the friend's 300 came home from the pot");
  ok(!st.goblinOffer(X.id), "the letter's offer is void");
  ok(world() === before, "nothing minted: wallets + escrows + vault + grant + float unchanged across the wash");
  await sleep(500);
  ok(wsD.of("lender.notice").some((f) => f.title === "THE GOBLINS ARE GONE"), "the debtor is told their debt is washed");
  const general = (await api("GET", "/api/channels", { token: D.token })).body.channels.find((c) => c.name === "general").id;
  const msgs = (await api("GET", `/api/channels/${general}/messages`, { token: D.token })).body.messages;
  ok(msgs.some((m) => /withdrawing all of them/.test(m.body)), "Sterling is openly pleased in #general");

  console.log("\n— Foundry Lending —");
  const kiosk = (await api("GET", "/api/lender", { token: D.token })).body;
  ok(kiosk.regime === "foundry" && kiosk.tiers.map((t) => t.rate).join() === "0.03,0.04,0.05,0.06", "the kiosk reads Foundry Lending at 3 / 4 / 5 / 6% a day");
  ok(kiosk.offer === null, "…and carries no goblin offer");
  const borrow = await api("POST", "/api/lender/borrow", { token: D.token, body: { amount: 1_000 } });
  ok(borrow.status === 200 && st.loanOf(D.id).rate === FOUNDRY_RATES[1_000], "a fresh loan signs at the Foundry's 3%");
  // Four missed days with an empty purse and nothing to seize: the goblins
  // would have jailed them; the Foundry stops at REPOSSESSION.
  st.db.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(D.id);
  st.db.prepare("DELETE FROM user_emoji WHERE userId = ?").run(D.id);
  const day = (k) => new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
  st.db.prepare("UPDATE loans SET missed = 2, lastDay = ? WHERE userId = ?").run(day(3), D.id);
  const visits = st.collectDebts();
  const v = visits.find((r) => r.userId === D.id);
  const dAfter = st.getUserById(D.id);
  ok(v && v.missedDays === 3 && !v.jailed && v.stage === 3 && !dAfter.disabled && dAfter.jailedAt == null,
    "five missed days: stage REPOSSESSION, never the cells");
  ok(st.loanStage(D.id) === 3 && st.loanOf(D.id).rate <= FOUNDRY_RATE_CAP, "…the stage reads 3 and the rate stays under the Foundry's cap");
  ok(stageFor(9, 3) === 3 && stageFor(9) === 5, "the ladder's top is a parameter: 3 for the Foundry, 5 for the goblins");

  console.log("\n— the goblins, gone —");
  const letter = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: X.id, force: true } });
  ok(letter.status === 409 && letter.body.error === "goblins_gone", "no letters: the admin's lever is refused goblins_gone");
  const bark = await api("POST", "/api/admin/goblins/bark", { token: admin });
  ok(bark.status !== 200, "no barker");
  await api("POST", `/api/channels/${general}/messages`, { token: X.token, body: { body: "/goblins rates" } });
  await sleep(500);
  const after = (await api("GET", `/api/channels/${general}/messages`, { token: X.token })).body.messages;
  ok(after.some((m) => /kiosk is dark/.test(m.body)), "/goblins finds a dark kiosk");
  const earnNow = earnableAchievementIds(true);
  ok(earnNow.length === earnableAchievementIds().length - 6 && [...GOBLIN_BADGES].every((id) => !earnNow.includes(id)),
    "their six badges leave the Brass Key's count");

  // ======================================================================
  // RETIRE THE REAPER
  // ======================================================================
  console.log("\n— the reaper —");
  const R = await register("reaperopener");
  const bare = await register("bare");
  const shielded = await register("shielded");
  const open2 = await openBox(R, "retire-reaper");
  ok(open2.status === 200 && !!st.pandoraFlag("retire-reaper"), "the box opens on Retire the Reaper");
  await api("POST", "/api/admin/spins/rig-death", { token: admin, body: { userId: bare.id } });
  const spin = await api("POST", "/api/wheel/spin", { token: bare.token });
  ok(spin.status === 200 && spin.body.result?.type === "blank" && spin.body.result?.reaperMissed === true, "a rigged death wedge on a bare member blinks");
  ok(!st.getUserById(bare.id).disabled && st.getUserById(bare.id).diedAt == null, "…nobody is tombstoned");
  ok((await api("POST", "/api/admin/talisman", { token: admin, body: { userId: shielded.id } })).status === 200, "a member is handed a talisman");
  await api("POST", "/api/admin/spins/rig-death", { token: admin, body: { userId: shielded.id } });
  const spin2 = await api("POST", "/api/wheel/spin", { token: shielded.token });
  ok(spin2.body.result?.reaperMissed === true && st.ownsEmoji(shielded.id, TALISMAN_CODE), "…the wedge blinks at them too and the amulet is never spent");
  const gauge = (await api("GET", "/api/wheel", { token: bare.token })).body.reaper;
  ok(gauge.retired === true && gauge.rate === 0, "the gauge reads retired, rate 0");
  await mint(bare.id, 100_000);
  const counter = await api("POST", "/api/shop/talisman-silver", { token: bare.token });
  ok(counter.status === 409 && counter.body.error === "reaper_retired" && st.getCoins(bare.id) >= 100_000, "Sterling's shield counter is closed, free");
  ok((await api("POST", "/api/shop/talisman", { token: bare.token, body: { code: "whatever" } })).body.error === "reaper_retired", "…and so is the mythic-for-talisman trade");
  ok((await api("GET", "/api/shop", { token: bare.token })).body.reaperRetired === true, "the shop says so");
  st.db.prepare("UPDATE users SET bareSpins = 200 WHERE id = ?").run(bare.id);
  const courtesy = await api("POST", "/api/admin/sterling/shield", { token: admin, body: { userId: bare.id, force: true } });
  ok(courtesy.status === 409 && courtesy.body.error === "reaper_retired", "no shield courtesy, however red the old gauge");
  const sale = await api("POST", "/api/admin/special", { token: admin, body: { kind: "shieldsale" } });
  ok(sale.status === 409 && sale.body.error === "reaper_retired", "no shield sale");

  wsD.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    process.exit(bad ? 1 : 0);
  });
