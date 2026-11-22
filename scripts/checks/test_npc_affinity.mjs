// THE AFFINITY METER (Josh, Oct 2026, migration 107; rules in
// src/npc/affinity.ts).
//
// Run:  npm run build && node scripts/checks/test_npc_affinity.mjs
//
// In-process against a real Store: the daily caps, the tiers and the frame a
// crossing sends, the goblins' missed-day penalty, the fade that never drops
// below the tier reached, the house having no meter, and a scrub taking the
// rows. Then over a real server: the router's after-hook awarding a
// successful purchase and NOT a refused one, the cap holding over HTTP, a
// member reading their own meter, the house reading none, and the admin's
// lever (audited, admin-only).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (p) => "file://" + path.join(ROOT, "dist", p).replace(/\\/g, "/");
// (the house's AI is archived by default since Nov 17 2026, config.npcHouseAi: this harness drives the archived code, so it switches it on)
process.env.NPC_HOUSE_AI ??= "1";
const { Store } = await import(dist("db/store.js"));
const A = await import(dist("npc/affinity.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

console.log("THE AFFINITY METER — in-process");
const tmp = mkdtempSync(path.join(tmpdir(), "affinity-"));
const store = new Store(path.join(tmp, "a.db"));
const frames = [];
const bus = { emit: (type, p) => frames.push({ type, ...p }) };
const keeper = new A.AffinityKeeper(store, bus);
const m = store.createUser({ username: "mara", displayName: "Mara", passwordHash: "x" });
const house = store.createUser({ username: "boss", displayName: "Boss", passwordHash: "x", isAdmin: true });
const t0 = Date.parse("2026-10-12T15:00:00Z");

// caps
let got = 0;
for (let i = 0; i < 6; i++) got += keeper.award(m.id, "sterling", "chat", t0 + i);
ok(got === 3 && keeper.points(m.id, "sterling", t0) === 3, "chatting is capped at 3 a day");
ok(keeper.award(m.id, "sterling", "chat", t0 + DAY) === 1, "…and the cap re-arms the next day");
ok(keeper.award(m.id, "sterling", "nonsense", t0) === 0, "an unknown source earns nothing");

// tiers and the frame a crossing sends
keeper.award(m.id, "voss", "door", t0);
keeper.award(m.id, "voss", "door", t0);
ok(keeper.award(m.id, "voss", "door", t0) === 0 && keeper.points(m.id, "voss", t0) === 16, "opening the way down caps at 16 a day");
keeper.award(m.id, "voss", "relic", t0);
ok(!frames.some((f) => f.npc === "voss"), "no frame while the tier holds");
keeper.award(m.id, "voss", "relic", t0);
const up = frames.find((f) => f.npc === "voss");
ok(keeper.points(m.id, "voss", t0) === 22 && up?.type === "npc.affinity" && up.tier === 1 && up.up === true && up.userId === m.id,
  "crossing into Acquainted sends that player a frame");
ok(A.tierOf(0) === 0 && A.tierOf(19) === 0 && A.tierOf(20) === 1 && A.tierOf(45) === 2 && A.tierOf(75) === A.TRUSTED_TIER && A.tierOf(100) === 3,
  "the tiers: Stranger 0, Acquainted 20, Regular 45, Trusted 75");

// the goblins' turn
keeper.set(m.id, "goblins", 50, t0);
frames.length = 0;
keeper.penalize(m.id, "goblins", A.MISSED_DAY_PENALTY, t0);
ok(keeper.points(m.id, "goblins", t0) === 40 && frames[0]?.up === false && frames[0]?.tier === 1, "a missed day costs the goblins' meter 10, and a fall in tier is told");
keeper.penalize(m.id, "goblins", 500, t0);
ok(keeper.points(m.id, "goblins", t0) === 0, "…never below zero");
keeper.set(m.id, "goblins", 60, t0 - 20 * DAY);
keeper.penalize(m.id, "goblins", A.MISSED_DAY_PENALTY, t0);
ok(keeper.points(m.id, "goblins", t0) === 45, "a missed day on a faded meter takes the penalty once, not the fade twice (54 → 45, not 38)");

// the fade
ok(A.decayed(50, t0 - 10 * DAY, t0) === 50, "no fade inside 14 idle days");
ok(A.decayed(60, t0 - 20 * DAY, t0) === 54, "after 14 idle days, a point a day");
ok(A.decayed(46, t0 - 60 * DAY, t0) === 45 && A.decayed(80, t0 - 400 * DAY, t0) === 75, "…never below the floor of the tier reached");
keeper.set(m.id, "sterling", 50, t0 - 30 * DAY);
ok(keeper.points(m.id, "sterling", t0) === 45, "the keeper reads the meter with the fade applied");

// the house has no meter
ok(keeper.award(house.id, "sterling", "chat", t0) === 0 && store.npcAffinityRow(house.id, "sterling") === null, "the house earns nothing and has no row");

// pruning yesterday's caps
{
  const db = new DatabaseSync(path.join(tmp, "a.db"), { readOnly: true });
  const before = db.prepare("SELECT COUNT(*) AS c FROM npc_affinity_day WHERE day < ?").get(A.dayKey(t0 + 5 * DAY - DAY)).c;
  db.close();
  keeper.award(m.id, "voss", "chat", t0 + 5 * DAY);
  const db2 = new DatabaseSync(path.join(tmp, "a.db"), { readOnly: true });
  const after = db2.prepare("SELECT COUNT(*) AS c FROM npc_affinity_day WHERE day < ?").get(A.dayKey(t0 + 5 * DAY - DAY)).c;
  db2.close();
  ok(before > 0 && after === 0, "old days' cap rows are pruned on a new day's first award");
}

// a scrub takes it all
store.scrubUser(m.id);
ok(store.npcAffinityRow(m.id, "voss") === null && store.npcAffinityRow(m.id, "goblins") === null, "deleting the account deletes its meters");
// ---- NESTED TRANSACTIONS (Oct 2026 review) --------------------------------
// The meter's daily-cap claim is its own transaction, and it fires from inside
// money operations that already hold one. transaction() was a bare BEGIN, so
// every one of those threw and rolled back: a relic bank at boot (the server
// never listened), a relic auction's settlement, an Exchange close past 5,000.
{
  const k = store.createUser({ username: "kestrel", displayName: "Kestrel", passwordHash: "x" });
  // wired as index.ts wires it, minus its try/catch, so nesting itself is tested
  store.affinityHook = (userId, npc, source) => { keeper.award(userId, npc, source); };
  const ping = () => store.getUserById(k.id)?.displayName;
  let threw = null;
  try {
    store.transaction(() => {
      store.transaction(() => store.updateProfile(k.id, { displayName: "Inner" }));
    });
  } catch (e) { threw = e.message; }
  ok(threw === null, `a transaction inside a transaction runs (${threw ?? "no error"})`);
  try {
    store.transaction(() => {
      try { store.transaction(() => { store.updateProfile(k.id, { displayName: "Doomed" }); throw new Error("inner"); }); } catch {}
    });
  } catch {}
  ok(ping() !== "Doomed", "…an inner failure the caller catches rolls back only its own writes");
  try { store.transaction(() => { store.transaction(() => store.updateProfile(k.id, { displayName: "Gone" })); throw new Error("outer"); }); } catch {}
  ok(ping() !== "Gone", "…and an outer failure rolls back the inner writes with it");

  const before = keeper.points(k.id, "voss", Date.now());
  store.prep("INSERT INTO backrooms_carried (userId, slug, n, level, at) VALUES (?, ?, 0, 0, ?)").run(k.id, "fresh-relic-for-test", Date.now());
  let bankErr = null, banked = 0;
  try { banked = store.brCarriedBankAll(); } catch (e) { bankErr = e.message; }
  ok(bankErr === null && banked === 1, `a carried NEW relic banks at boot with the meter wired (${bankErr ?? banked + " banked"})`);
  ok(keeper.points(k.id, "voss", Date.now()) > before, "…and Voss's meter earned it inside the same transaction");

  let bigErr = null;
  try { store.transaction(() => store.maxStat(k.id, "exchange_best", 6_000)); } catch (e) { bigErr = e.message; }
  ok(bigErr === null && keeper.points(k.id, "sterling", Date.now()) > 0, `a 5,000+ best inside a transaction (an Exchange close) earns instead of throwing (${bigErr ?? "ok"})`);
  store.affinityHook = null;
}
store.db?.close?.();

// ---------------------------------------------------------------------------
console.log("THE AFFINITY METER — over a real server");
const PORT = 8551;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "npc-affinity-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", NPC_BRAIN_URL: "", NPC_HOUSE_AI: "1",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
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
for (let i = 0; i < 160; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(250); }

const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
const reg = async (username) => (await api("POST", "/api/register", {
  body: { username, password: "Sturdy!Passw0rd#9", displayName: username, secret: "vault marmalade lantern quartz 47", acceptTerms: true },
})).body;
const R = await reg("ricky");
const P = await reg("poppy");
await api("POST", "/api/admin/coins", { token: admin, body: { userId: R.user.id, amount: 5_000 } });
const meter = async (token, npc) => (await api("GET", "/api/me/npc-affinity", { token })).body?.affinity?.find((a) => a.npc === npc);

const broke = await api("POST", "/api/shop/buy-spins", { token: P.token, body: { count: 1 } });
ok(broke.status >= 400 && (await meter(P.token, "sterling"))?.points === 0, "a refused purchase earns nothing");
for (let i = 0; i < 3; i++) await api("POST", "/api/shop/buy-spins", { token: R.token, body: { count: 1 } });
const st = await meter(R.token, "sterling");
ok(st?.points === 2 && st.tier === 0 && st.tierName === "Stranger", "three bought spins earn Sterling's \"buying\" cap of 2 (the router's after-hook)");
ok(Array.isArray(st?.earns) && st.earns.length >= 5 && st.next === 18, "a member reads their own meter: what earns it and how far to the next tier");
const h = (await api("GET", "/api/me/npc-affinity", { token: admin })).body;
ok(h?.house === true && h.affinity.length === 0, "the house reads no meter");
await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: 1, npc: "sterling", points: 60 } });
const h2 = (await api("GET", "/api/me/npc-affinity", { token: admin })).body;
ok(h2?.house === true && h2.affinity.length === 1 && h2.affinity[0].tierName === "Regular", "…unless the admin set one on themself with the lever, to hear a tier");

const refused = await api("POST", "/api/admin/npc-affinity", { token: R.token, body: { userId: R.user.id, npc: "voss", points: 99 } });
ok(refused.status === 403, "a member can't set a meter");
const set = await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: R.user.id, npc: "voss", points: 80 } });
const vv = await meter(R.token, "voss");
ok(set.status === 200 && vv?.tier === 3 && vv.tierName === "Trusted" && vv.next === null, "the admin's lever sets a meter outright (Trusted at 80)");
ok((await api("POST", "/api/admin/npc-affinity", { token: admin, body: { userId: R.user.id, npc: "nobody", points: 10 } })).status === 400, "…refusing a character that doesn't exist");
{
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const row = db.prepare("SELECT detail FROM audit WHERE action = 'npc.affinity' ORDER BY id DESC LIMIT 1").get();
  db.close();
  ok(!!row && row.detail.includes("voss 80"), "…and the lever is audited");
}

srv.kill("SIGINT");
try { rmSync(tmp, { recursive: true, force: true }); } catch {}

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
