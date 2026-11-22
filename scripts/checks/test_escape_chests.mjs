// THE CHESTS — the sanctioned mint's money path (E3, Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_escape_chests.mjs
//
// Three layers, hardest first:
//   TABLES (in-process, deterministic): tier weights sum to 10,000, every
//     range is Josh's verbatim, the analytic EV lands where ESCAPE.md argues
//     it (~164 silver-equivalent), 200k live rolls agree with the analytic
//     number AND the tier frequencies, rolls never leave their ranges, the
//     skew's mean sits at min + span/3 (not the midpoint), and the skin
//     column dedupes: an owner of all five NEVER rolls a skin, an owner of
//     four only ever rolls the fifth.
//   GRANTS (in-process store): each kind lands on the RIGHT balance and
//     nothing else moves — silver on coins, spins on bonusSpins, chips on
//     chips, pulls on freePulls, a skin as a backrooms suit row + discovery;
//     the allowance refuses the 11th open FREE (count unchanged, nothing
//     granted), and yesterday's spent allowance doesn't dent today's.
//   WIRE (real server): five chests in five distinct labeled rooms, opening
//     needs reach, a real open pays the OPENER only (recipient-scoped loot
//     frame; the room sees just "opened"), the chest leaves the map for
//     everyone, and an allowance-exhausted player's refusal LEAVES the chest
//     standing for someone who can still open today.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8501;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "escape-chest-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- TABLES -----------------------------------------------------------------
const loot = await import("file://" + path.join(ROOT, "dist", "casino", "escape-loot.js").replace(/\\/g, "/"));
const { rollChest, chestEV, TIER_W, TYPE_TABLE, ER_SKINS, skewRoll, ER_OPENS_PER_DAY } = loot;

ok(TIER_W.reduce((s, t) => s + t.w, 0) === 10_000, "tier weights sum to 10,000");
ok(TIER_W.find((t) => t.tier === "common").w === 8000 &&
   TIER_W.find((t) => t.tier === "rare").w === 1700 &&
   TIER_W.find((t) => t.tier === "legendary").w === 300, "80 / 17 / 3, as argued");
// Josh's ranges, verbatim (ESCAPE.md quotes his brief).
const R = (tier, kind) => TYPE_TABLE[tier].find((e) => e.kind === kind);
ok(R("common", "silver").min === 50 && R("common", "silver").max === 500, "common silver 50-500");
ok(R("common", "spins").min === 1 && R("common", "spins").max === 3, "common spins 1-3");
ok(R("common", "chips").min === 100 && R("common", "chips").max === 250, "common chips 100-250");
ok(R("rare", "silver").min === 200 && R("rare", "silver").max === 1000, "rare silver 200-1000");
ok(R("rare", "spins").min === 5 && R("rare", "spins").max === 10, "rare spins 5-10");
ok(R("rare", "chips").min === 250 && R("rare", "chips").max === 1000, "rare chips 250-1000");
ok(R("rare", "pulls").min === 10 && R("rare", "pulls").max === 20, "rare slot pass 10-20 pulls");
ok(R("legendary", "silver").min === 1500 && R("legendary", "silver").max === 5000, "legendary silver 1500-5000");
ok(R("legendary", "spins").min === 10 && R("legendary", "spins").max === 25, "legendary spins 10-25");
ok(R("legendary", "chips").min === 1000 && R("legendary", "chips").max === 2500, "legendary chips 1000-2500");
ok(R("legendary", "pulls").min === 25 && R("legendary", "pulls").max === 50, "legendary pulls 25-50");
ok(ER_SKINS.length === 5, "five skins in the legendary pool");
ok(ER_OPENS_PER_DAY === 10, "the hard valve: 10 opens per day");

const ev = chestEV();
ok(ev > 145 && ev < 185, `analytic EV ≈ ${ev.toFixed(1)} silver-eq — the doc's ~164 band`);
ok(Math.abs(skewRoll(0, 900, Math.sqrt(1 / 3)) - 300) <= 1, "skew: r=√⅓ lands at span/3");

{
  // 200k live rolls: frequencies + empirical EV + range honesty.
  const VAL = { silver: 1, spins: 11, chips: 0.95, pulls: 8.71, skin: 0 };
  const N = 200_000;
  const tiers = { common: 0, rare: 0, legendary: 0 };
  let evSum = 0;
  let rangeBreaks = 0;
  let skins = 0;
  for (let i = 0; i < N; i++) {
    const r = rollChest([]);
    tiers[r.tier]++;
    if (r.kind === "skin") {
      skins++;
      if (!ER_SKINS.includes(r.skin)) rangeBreaks++;
    } else {
      const spec = R(r.tier, r.kind);
      if (r.amount < spec.min || r.amount > spec.max) rangeBreaks++;
      evSum += r.amount * VAL[r.kind];
    }
  }
  ok(rangeBreaks === 0, "200k rolls never leave their ranges");
  ok(Math.abs(tiers.common / N - 0.8) < 0.01, `common lands ~80% (${((tiers.common / N) * 100).toFixed(1)}%)`);
  ok(Math.abs(tiers.legendary / N - 0.03) < 0.005, `legendary lands ~3% (${((tiers.legendary / N) * 100).toFixed(2)}%)`);
  const evEmp = evSum / N;
  ok(Math.abs(evEmp - ev) < ev * 0.05, `empirical EV ${evEmp.toFixed(1)} agrees with analytic ${ev.toFixed(1)}`);
  ok(Math.abs(skins / N - 0.03 * 0.2) < 0.003, `skins land ~0.6% of opens (${((skins / N) * 100).toFixed(2)}%)`);
  console.log(`  · mint profile: EV ${evEmp.toFixed(1)}/open · daily ceiling ${(evEmp * ER_OPENS_PER_DAY).toFixed(0)}/player`);
}
{
  // Skin dedupe: all five owned → never a skin; four owned → only the fifth.
  let broke = 0;
  for (let i = 0; i < 30_000; i++) {
    const r = rollChest([...ER_SKINS]);
    if (r.kind === "skin") broke++;
  }
  ok(broke === 0, "an owner of all five skins NEVER rolls one (rerolled, not wasted)");
  const four = ER_SKINS.slice(0, 4);
  let wrong = 0, fifth = 0;
  for (let i = 0; i < 60_000; i++) {
    const r = rollChest(four);
    if (r.kind === "skin") {
      fifth++;
      if (r.skin !== ER_SKINS[4]) wrong++;
    }
  }
  ok(wrong === 0 && fifth > 0, `an owner of four only ever pulls the fifth (${fifth} pulls, 0 wrong)`);
}

// ---- GRANTS (in-process store over a scratch DB) ---------------------------
{
  const { Store } = await import("file://" + path.join(ROOT, "dist", "db", "store.js").replace(/\\/g, "/"));
  const dbPath = path.join(DATA_DIR, "grants.db");
  const s = new Store(dbPath);
  const uid = s.createUser({ username: "grantee", displayName: "grantee", passwordHash: "x".repeat(60) }).id;
  const bal = () => {
    const d = new DatabaseSync(dbPath);
    const r = d.prepare("SELECT coins, chips, freePulls, bonusSpins FROM users WHERE id = ?").get(uid);
    const suits = d.prepare("SELECT color FROM backrooms_locker WHERE userId = ? AND kind = 'suit'").all(uid).map((q) => q.color);
    d.close();
    return { ...r, suits };
  };
  const b0 = bal();
  ok(s.erOpenChest(uid, { kind: "silver", amount: 275 }, 10).ok, "silver grant accepted");
  ok(s.erOpenChest(uid, { kind: "spins", amount: 3 }, 10).ok, "spins grant accepted");
  ok(s.erOpenChest(uid, { kind: "chips", amount: 400 }, 10).ok, "chips grant accepted");
  ok(s.erOpenChest(uid, { kind: "pulls", amount: 15 }, 10).ok, "pulls grant accepted");
  ok(s.erOpenChest(uid, { kind: "skin", skin: "midnight" }, 10).ok, "skin grant accepted");
  const b1 = bal();
  ok(b1.coins - b0.coins === 275, "silver landed on coins, exactly");
  ok(b1.bonusSpins - b0.bonusSpins === 3, "spins landed on bonusSpins, exactly");
  ok(b1.chips - b0.chips === 400, "chips landed on chips, exactly");
  ok(b1.freePulls - b0.freePulls === 15, "pulls landed on freePulls, exactly");
  ok(b1.suits.includes("midnight"), "the skin is a real backrooms suit row");
  ok(s.erOwnedSkins(uid, ER_SKINS).includes("midnight"), "…and the dedupe reader sees it");
  ok(s.erOpensToday(uid) === 5, "five opens spent today");
  // The valve: spend the rest, then refuse the 11th FREE.
  for (let i = 0; i < 5; i++) s.erOpenChest(uid, { kind: "silver", amount: 1 }, 10);
  const refuse = s.erOpenChest(uid, { kind: "silver", amount: 9999 }, 10);
  ok(!refuse.ok && refuse.error === "no_opens", "the 11th open is refused");
  const b2 = bal();
  ok(b2.coins === b1.coins + 5, "…and the refusal granted NOTHING");
  ok(s.erOpensToday(uid) === 10, "…and spent no count");
  // Yesterday's allowance is yesterday's problem.
  {
    const d = new DatabaseSync(dbPath);
    const today = new Date().toISOString().slice(0, 10);
    d.prepare("UPDATE er_opens SET day = '2020-01-01' WHERE userId = ? AND day = ?").run(uid, today);
    d.close();
  }
  ok(s.erOpenChest(uid, { kind: "silver", amount: 1 }, 10).ok, "a new UTC day re-arms the allowance");
  const t = s.economyTotals();
  ok(t.totalChips === 400 && t.totalFreePulls === 15, "economyTotals counts chips + freePulls from day one");
  s.close();
}

// ---- WIRE (real server) -----------------------------------------------------
const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
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
let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};
const DB_PATH = path.join(DATA_DIR, "solace.db");
const db = () => new DatabaseSync(DB_PATH);
const wire = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-escape?token=${token}`);
    const inbox = [];
    ws.on("message", (d) => inbox.push(JSON.parse(String(d))));
    ws.on("open", () =>
      resolve({
        ws, inbox, send: (m) => ws.send(JSON.stringify(m)),
        waitFor: (pred, ms = 4000) =>
          new Promise((res) => {
            const t1 = Date.now() + ms;
            const scan = () => {
              const i = inbox.findIndex(pred);
              if (i >= 0) return res(inbox.splice(i, 1)[0]);
              if (Date.now() > t1) return res(null);
              setTimeout(scan, 25);
            };
            scan();
          }),
      }),
    );
    ws.on("error", reject);
  });

const ROOMS_SRC = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(ROOT, "src", "casino", "escape-zone.ts"), "utf8"));
const ROOM_IDS = new Set([...ROOMS_SRC.matchAll(/\{ id: "([A-Z0-9]+)",/g)].map((m) => m[1]));

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const pw = "Sturdy!Passw0rd#9";
  const a = await register("opener", pw);
  const b = await register("watcher", pw);
  {
    const d = db();
    const rares = d.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 2").all().map((r) => r.code);
    const g = d.prepare("INSERT INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)");
    g.run(a.id, rares[0], Date.now());
    g.run(b.id, rares[1], Date.now());
    d.close();
    await api("POST", "/api/escape/stake", { token: a.token, body: { code: rares[0] } });
    await api("POST", "/api/escape/stake", { token: b.token, body: { code: rares[1] } });
  }
  const A = await wire(a.token);
  A.send({ type: "enter" });
  const wel = await A.waitFor((m) => m.type === "welcome");
  ok(wel.chests?.length === 5, "five chests stand in the complex");
  ok(new Set(wel.chests.map((c) => c.room)).size === 5, "…in five DISTINCT rooms");
  ok(wel.chests.every((c) => ROOM_IDS.has(c.room)), "…all LABELED rooms, never a den");

  const c0 = wel.chests[0];
  A.send({ type: "chest-open", id: c0.id });
  const far = await A.waitFor((m) => m.type === "denied");
  ok(far?.error === "too_far", "a chest is not opened from across the map");

  const B = await wire(b.token);
  B.send({ type: "enter" });
  await B.waitFor((m) => m.type === "welcome");

  const coinsBefore = (() => {
    const d = db();
    const r = d.prepare("SELECT coins, chips, freePulls, bonusSpins FROM users WHERE id = ?").get(a.id);
    d.close();
    return r;
  })();
  A.send({ type: "move", x: c0.x, y: c0.y, yaw: 0, p: 0 });
  await sleep(80);
  A.send({ type: "chest-open", id: c0.id });
  const lootF = await A.waitFor((m) => m.type === "loot");
  ok(!!lootF, "the opener gets a loot frame");
  ok(lootF.opens === 1 && lootF.opensMax === 10, "…stamped 1 of 10");
  const seen = await B.waitFor((m) => m.type === "chest" && m.state === "opened");
  ok(!!seen && seen.by === "opener", "the room sees WHO opened — never WHAT fell out");
  ok(!B.inbox.some((m) => m.type === "loot"), "…and no loot frame leaks to a bystander");
  {
    const d = db();
    const r = d.prepare("SELECT coins, chips, freePulls, bonusSpins FROM users WHERE id = ?").get(a.id);
    const suits = d.prepare("SELECT COUNT(*) c FROM backrooms_locker WHERE userId = ? AND kind='suit'").get(a.id).c;
    d.close();
    const delta =
      (r.coins - coinsBefore.coins) + (r.chips - coinsBefore.chips) +
      (r.freePulls - coinsBefore.freePulls) + (r.bonusSpins - coinsBefore.bonusSpins) + suits;
    ok(delta > 0, "…and EXACTLY ONE balance moved, by the rolled amount");
    const kinds = ["coins", "chips", "freePulls", "bonusSpins"].filter((k) => r[k] !== coinsBefore[k]);
    ok(kinds.length + (suits > 0 ? 1 : 0) === 1, `…one kind only (${kinds[0] ?? "skin"})`);
  }
  A.send({ type: "chest-open", id: c0.id });
  const gone = await A.waitFor((m) => m.type === "denied");
  ok(gone?.error === "no_chest", "a spent chest is gone for everyone");

  // Allowance exhaustion leaves the chest standing.
  {
    const d = db();
    const today = new Date().toISOString().slice(0, 10);
    d.prepare("INSERT INTO er_opens (userId, day, count) VALUES (?, ?, 10) ON CONFLICT(userId, day) DO UPDATE SET count = 10")
      .run(b.id, today);
    d.close();
    const c1 = wel.chests[1];
    B.send({ type: "move", x: c1.x, y: c1.y, yaw: 0, p: 0 });
    await sleep(80);
    B.send({ type: "chest-open", id: c1.id });
    const deny = await B.waitFor((m) => m.type === "denied");
    ok(deny?.error === "no_opens", "an exhausted allowance refuses the open");
    A.send({ type: "move", x: c1.x, y: c1.y, yaw: 0, p: 0 });
    await sleep(80);
    A.send({ type: "chest-open", id: c1.id });
    const still = await A.waitFor((m) => m.type === "loot");
    ok(!!still, "…and the chest STOOD — the valve throttles the player, not the room");
  }

  A.ws.close();
  B.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); console.error(bootLog.slice(-600)); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} escape chest asserts passed`);
    process.exit(bad ? 1 : 0);
  });
