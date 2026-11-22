// THE ESCAPE ROOM THRESHOLD — the pass + ante-room money path (E1, Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_escape_shop.mjs
//
// A real server on a throwaway port. Money-path treatment:
//   · THE STAKE: one owned RARE burns for the pass — the emoji row is GONE
//     (global holdings down exactly one, nobody credited), the pass row is
//     active, and every refusal (bad code, unowned, wrong tier, already
//     passed) is proven FREE — the emoji named in a refused stake stays owned.
//   · THE COUNTER: pass-gated (403 without), every price burns exactly 100
//     with no other wallet moving, broke buys 402 and grant nothing, and the
//     BAG-FULL refusal happens BEFORE the wallet is touched (the jukebox
//     rule) — a full bag costs zero to discover. Stacks share a slot.
//   · THE LOCKER: round-trips, guards both ways, and a full locker or a full
//     bag refuses without moving anything.
//   · THE ASYMMETRY: death destroys the bag and ends the pass; the locker
//     SURVIVES — asserted in-process against the built store, since death
//     itself ships with the complex in E2.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8498;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "escape-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
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
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return { token: r.body?.token ?? null, id: r.body?.user?.id ?? null };
};

const DB_PATH = path.join(DATA_DIR, "solace.db");
/** Second connection, the CLAUDE.md way: assert on DB state, and do the
 *  test-fixture grants no route exists for. */
const db = () => new DatabaseSync(DB_PATH);

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const a = await register("keyseeker", pw);
  const b = await register("bystander", pw);
  ok(!!a.token && !!b.token, "two members registered");

  const esc = async (token) => (await api("GET", "/api/escape", { token })).body;
  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });

  // ---- the threshold reads ------------------------------------------------
  const anon = await api("GET", "/api/escape", {});
  ok(anon.status === 401, "the threshold is a member surface (anon 401)");
  const t0 = await esc(a.token);
  ok(t0.pass === false, "a fresh account holds no pass");
  ok(t0.stakeTier === "rare", "the door quotes the stake tier");
  ok(
    Object.values(t0.tools).every((t) => t.price === 100) && Object.keys(t0.tools).length === 3,
    "three tools, 100 silver each",
  );
  ok(t0.invSlots === 5 && t0.lockerSlots === 25, "the bag is 5 slots, the locker 25");

  // ---- fixture: hand keyseeker two rares + one common ---------------------
  const d0 = db();
  const rares = d0.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 3").all().map((r) => r.code);
  const common = d0.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 1").get().code;
  const grant = d0.prepare("INSERT INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)");
  grant.run(a.id, rares[0], Date.now());
  grant.run(a.id, rares[1], Date.now());
  grant.run(a.id, common, Date.now());
  const holdingsBefore = d0.prepare("SELECT COUNT(*) AS c FROM user_emoji").get().c;
  d0.close();

  // ---- the stake and its refusals -----------------------------------------
  const stake = (token, code) => api("POST", "/api/escape/stake", { token, body: { code } });
  ok((await stake(a.token, "")).status === 400, "an empty stake is 400");
  ok((await stake(a.token, rares[2])).status === 404, "a rare you don't own is 404");
  const wrongTier = await stake(a.token, common);
  ok(wrongTier.status === 400 && wrongTier.body?.error === "wrong_tier", "a common is refused: wrong tier");
  {
    const d = db();
    ok(
      d.prepare("SELECT COUNT(*) AS c FROM user_emoji").get().c === holdingsBefore,
      "every refusal was FREE — global holdings untouched",
    );
    d.close();
  }

  const staked = await stake(a.token, rares[0]);
  ok(staked.status === 200 && staked.body?.pass === true, "one owned rare buys THE PASS");
  {
    const d = db();
    ok(
      !d.prepare("SELECT 1 FROM user_emoji WHERE userId = ? AND code = ?").get(a.id, rares[0]),
      "the staked emoji is GONE from the collection",
    );
    ok(
      d.prepare("SELECT COUNT(*) AS c FROM user_emoji").get().c === holdingsBefore - 1,
      "…and global holdings are down EXACTLY one — burned, not moved",
    );
    const row = d.prepare("SELECT endedAt, code FROM er_passes WHERE userId = ?").get(a.id);
    ok(row && row.endedAt === null && row.code === rares[0], "the pass row is active and remembers its price");
    d.close();
  }
  const again = await stake(a.token, rares[1]);
  ok(again.status === 409 && again.body?.error === "already_passed", "a second stake is refused 409");
  {
    const d = db();
    ok(
      !!d.prepare("SELECT 1 FROM user_emoji WHERE userId = ? AND code = ?").get(a.id, rares[1]),
      "…and the refused stake's emoji is STILL OWNED",
    );
    d.close();
  }

  // ---- Sterling's counter -------------------------------------------------
  const buy = (token, item) => api("POST", "/api/escape/buy", { token, body: { item } });
  ok((await buy(b.token, "flashlight")).status === 403, "no pass, no counter (403)");
  ok((await buy(a.token, "grenade")).status === 400, "an unknown tool is 400");
  const broke = await buy(a.token, "flashlight");
  ok(broke.status === 402, "a tool you can't afford is 402");
  ok(((await esc(a.token)).inv ?? []).length === 0, "…and nothing was granted");

  await mint(a.id, 350);
  const b1 = await buy(a.token, "flashlight");
  ok(b1.status === 200 && b1.body.coins === 250, "flashlight: 100 burned, 250 left");
  const b2 = await buy(a.token, "walkie");
  ok(b2.status === 200 && b2.body.coins === 150, "walkie: 100 burned, 150 left");
  const b3 = await buy(a.token, "almond");
  ok(b3.status === 200 && b3.body.coins === 50, "almond water: 100 burned, 50 left");
  const b4 = await buy(a.token, "almond");
  ok(b4.status === 402, "the fourth pour is beyond the purse (402)");
  {
    const t = await esc(a.token);
    ok(t.coins === 50, "…and the refusal moved nothing");
    ok(
      t.inv.length === 3 && t.inv.find((i) => i.item === "almond")?.qty === 1,
      "the bag holds exactly what was paid for",
    );
    const tb = await esc(b.token);
    ok(tb.coins === 0, "the bystander's wallet never moved — the prices BURN");
  }

  // ---- the locker (while the bag has room) --------------------------------
  const lstore = (token, item, qty) => api("POST", "/api/escape/locker/store", { token, body: { item, qty } });
  const ltake = (token, item, qty) => api("POST", "/api/escape/locker/take", { token, body: { item, qty } });
  ok((await lstore(b.token, "flashlight", 1)).status === 403, "the locker is pass-gated too");
  ok((await lstore(a.token, "flashlight", 2)).status === 400, "storing more than you carry is refused");
  ok((await lstore(a.token, "flashlight", 0)).status === 400, "zero is not a quantity");
  const s1 = await lstore(a.token, "flashlight", 1);
  ok(s1.status === 200, "the flashlight goes into the locker");
  ok(
    s1.body.inv.every((i) => i.item !== "flashlight") && s1.body.locker.find((i) => i.item === "flashlight")?.qty === 1,
    "…bag down, locker up",
  );
  ok((await ltake(a.token, "flashlight", 2)).status === 400, "taking more than is stored is refused");
  const k1 = await ltake(a.token, "flashlight", 1);
  ok(k1.status === 200 && k1.body.inv.find((i) => i.item === "flashlight")?.qty === 1, "…and it comes back");

  // ---- the bag-full refusal is FREE (before the wallet) -------------------
  // Park the flashlight, fill the bag to 5 DISTINCT kinds, then ask Sterling
  // for a kind you're NOT carrying: the refusal must not touch the wallet.
  await lstore(a.token, "flashlight", 1); // bag: walkie, almond (2 kinds)
  {
    const d = db();
    const junk = d.prepare("INSERT INTO er_inventory (userId, item, qty) VALUES (?, ?, 1)");
    junk.run(a.id, "junk1");
    junk.run(a.id, "junk2");
    junk.run(a.id, "junk3");
    d.close();
  }
  await mint(a.id, 100); // 150 in the purse, bag now 5/5 distinct, no flashlight carried
  const full = await buy(a.token, "flashlight");
  ok(full.status === 400 && full.body?.error === "bag_full", "a 6th distinct kind is refused: bag full");
  ok((await esc(a.token)).coins === 150, "…and the refusal happened BEFORE the wallet — free");
  const stackBuy = await buy(a.token, "almond");
  ok(stackBuy.status === 200 && stackBuy.body.coins === 50, "a STACK still fits a full bag (almond ×2)");
  ok(
    (await esc(a.token)).inv.find((i) => i.item === "almond")?.qty === 2,
    "…sharing its slot",
  );
  // …and the locker refuses to hand a new kind to a full bag, keeping it.
  const back = await ltake(a.token, "flashlight", 1);
  ok(back.status === 400 && back.body?.error === "bag_full", "a full bag refuses the locker's offer");
  {
    const t = await esc(a.token);
    ok(t.locker.find((i) => i.item === "flashlight")?.qty === 1, "…and the locker still holds it");
  }

  // ---- the death asymmetry (in-process; the complex ships in E2) ----------
  stop();
  await sleep(600);
  {
    const { Store } = await import(
      "file://" + path.join(ROOT, "dist", "db", "store.js").replace(/\\/g, "/")
    );
    const s = new Store(DB_PATH);
    s.erDeath(a.id, "test_monster");
    ok(s.erInventory(a.id).length === 0, "death destroys everything carried");
    ok(s.erLocker(a.id).length === 1, "…but the LOCKER SURVIVES — that asymmetry is its purpose");
    ok(s.erPass(a.id) === undefined, "…and the pass is gone");
    const r2 = s.erStakePass(a.id, rares[1], "rare");
    ok(r2.ok === true, "a new rare buys a NEW pass — the door works again after death");
    s.close();
  }
};

run()
  .catch((e) => { console.error(e); console.error(bootLog.slice(-800)); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} escape threshold asserts passed`);
    process.exit(bad ? 1 : 0);
  });
