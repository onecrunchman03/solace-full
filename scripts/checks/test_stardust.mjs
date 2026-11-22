// STAR DUST — the canister under Sterling's counter (Josh, Aug 2026).
//
// Three things worth pinning, in the order they can hurt:
//
//  1. THE MONEY. 2,000 silver, BURNED. The price is the server's, a refusal
//     costs nothing, and the total supply drops by exactly the price — nobody's
//     wallet grows because somebody huffed a can.
//  2. THE PROGRAMME. A ten-minute window that every hit resets, a per-hit neon
//     step, a helium ratio per hit, the over-half smoke rule, and a thirty-
//     second doom clock that only ever escalates. stardust.ts imports nothing
//     precisely so all of it asserts without a browser or a GPU.
//  3. THE WIRE. Hits relay and PERSIST (a newcomer meets the smoke), garbage is
//     clamped, the canister is a legal hold id, and the puff lands the same
//     seeded body on every screen — a body already down can't detonate again.
//
// Deliberately NOT here: anything about the account. A puff is the gun's death.
// The one assert about that checks the graves table never moves.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";
import {
  STARDUST_MS, MAX_HITS, DOOM_MS, CANISTER_HUFFS, HUFF_DOUBLE_AT,
  gasPhase, gasDoom, gasPitch, huffHits, gasSmoke,
} from "../../client/src/casino/stardust.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8492;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "stardust-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
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
  return r.body?.token ?? null;
};

const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (type) => [...frames].reverse().find((f) => f.type === type),
      async waitFor(type, ms = 2500) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(type);
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
      clear: () => frames.splice(0),
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

// ---- 2. THE PROGRAMME (pure, no server needed) --------------------------------
{
  ok(STARDUST_MS === 300_000, "a hit acts for five minutes (Josh's retune from ten)");
  ok(MAX_HITS === 3 && CANISTER_HUFFS === 3, "three hits to the line, three huffs to a can");
  ok(DOOM_MS === 30_000, "the third hit buys thirty seconds");

  // The window: fresh hit = full effect, and it EXPIRES at exactly five minutes.
  ok(!gasPhase(1, 0).expired && gasPhase(1, STARDUST_MS).expired, "the window drains at five minutes exactly");
  ok(gasPhase(1, STARDUST_MS).hits === 0 && gasPhase(1, STARDUST_MS).bar === 0, "…and expired means sober: no hits, no bar");
  ok(gasPhase(0, 0).expired, "zero hits is sober whatever the clock says");

  // The bar: hits/3, draining linearly — the meter always says how long is left.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(gasPhase(1, 0).bar, 1 / 3) && near(gasPhase(2, 0).bar, 2 / 3), "a fresh hit fills a third of the bar per hit");
  ok(near(gasPhase(2, STARDUST_MS / 2).bar, 1 / 3), "…and half the window drains half the fill");
  {
    let last = Infinity, slips = 0;
    for (let ms = 0; ms < STARDUST_MS; ms += 2000) {
      const b = gasPhase(2, ms).bar;
      if (b > last + 1e-9) slips++;
      last = b;
    }
    ok(slips === 0, "the bar only ever drains between hits (300 samples)");
  }

  // The neon: a step per hit, monotone in hits, steady in time.
  ok(gasPhase(1, 0).glow > 0 && gasPhase(2, 0).glow > gasPhase(1, 0).glow && gasPhase(3, 0).glow > gasPhase(2, 0).glow,
    "every hit is more neon than the last");
  ok(near(gasPhase(2, 1000).glow, gasPhase(2, STARDUST_MS - 1000).glow), "…and the neon holds until the window drains");

  // The smoke: over half a can leaks, a doomed body leaks hard.
  ok(gasPhase(1, 0).smoke === 0, "one hit: no smoke yet");
  ok(gasPhase(2, 0).smoke === 1, "two hits (over half the bar): the small stream");
  ok(gasPhase(3, 0).smoke === 2, "three hits: the full leak");

  // THE BAR'S INTERACTION (Josh, Aug 2026): drink moves the smoke a stage
  // early, and a hammered huff counts double. Both pure, both here.
  ok(gasSmoke(0, true) === 0 && gasSmoke(1, false) === 0, "sober table unchanged: no smoke below two hits");
  ok(gasSmoke(1, true) === 1 && gasSmoke(2, true) === 2 && gasSmoke(3, true) === 2,
    "a drinking body leaks a whole stage early (1→stream, 2→full leak)");
  ok(gasPhase(1, 0, true).smoke === 1 && gasPhase(1, 0).smoke === 0,
    "gasPhase carries the drink flag — and the two-arg call is unchanged");
  ok(huffHits(0) === 1 && huffHits(HUFF_DOUBLE_AT) === 1, "a sober-to-drunk huff is one hit (75 inclusive)");
  ok(huffHits(HUFF_DOUBLE_AT + 1) === 2 && huffHits(100) === 2, "a hammered huff counts TWICE — never mix drink with gas");

  // The helium: a step per hit, inside the worklet's rails, silent at zero.
  ok(gasPitch(0) === 1, "sober voices keep their own pitch");
  ok(gasPitch(1) > 1.15 && gasPitch(2) > gasPitch(1) && gasPitch(3) > gasPitch(2),
    `more and more high pitched (${gasPitch(1).toFixed(2)} → ${gasPitch(2).toFixed(2)} → ${gasPitch(3).toFixed(2)})`);
  ok(gasPitch(3) <= 1.9, "…and never past the shifter's rail");

  // The doom: shake climbs monotonically to the pop at thirty seconds.
  ok(gasDoom(0).shake === 0 && !gasDoom(0).done, "the doom starts as a tremble");
  {
    let last = -1, slips = 0;
    for (let ms = 0; ms <= DOOM_MS; ms += 250) {
      const d = gasDoom(ms);
      if (d.shake < last - 1e-9) slips++;
      last = d.shake;
    }
    ok(slips === 0, "…shakes more and more violently, never less (121 samples)");
  }
  ok(gasDoom(DOOM_MS * 0.5).shake < 0.5, "…back-loaded: half the clock is under half the shake");
  ok(!gasDoom(DOOM_MS - 1).done && gasDoom(DOOM_MS).done, "…and detonates at thirty seconds exactly");
}

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(DATA_DIR, "solace.db");
  const db = () => new DatabaseSync(dbPath, { readOnly: true });
  const totalCoins = () => {
    const d = db();
    const t = d.prepare("SELECT COALESCE(SUM(coins),0) AS t FROM users").get().t;
    d.close();
    return t;
  };
  const graves = () => {
    const d = db();
    const t = d.prepare("SELECT COUNT(*) AS t FROM users WHERE disabled = 1").get().t;
    d.close();
    return t;
  };

  const pw = "Sturdy!Passw0rd#9";
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const admin = adminLogin.body?.token;
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  ok(admin && alice && bob, "admin + two accounts");

  const idOf = async (token) => (await api("GET", "/api/me", { token })).body.user.id;
  const aliceId = await idOf(alice);
  const bobId = await idOf(bob);

  // ---- 1. THE MONEY -----------------------------------------------------------
  const shop = await api("GET", "/api/shop", { token: alice });
  const PRICE = shop.body.stardustPrice;
  ok(PRICE === 2000, `the counter advertises ${PRICE} silver`);

  const broke = await api("POST", "/api/shop/stardust", { token: alice });
  ok(broke.status === 402, "no silver, no canister (402)");
  const beforeRefusal = totalCoins();
  await api("POST", "/api/shop/stardust", { token: alice });
  ok(totalCoins() === beforeRefusal, "…and a refusal costs nothing at all");

  await api("POST", "/api/admin/coins", { token: admin, body: { userId: aliceId, amount: PRICE + 60 } });
  const before = totalCoins();
  const buy = await api("POST", "/api/shop/stardust", { token: alice });
  ok(buy.status === 200, "with silver in hand, Sterling sells the can");
  ok(buy.body.coins === 60, `the buyer is down exactly ${PRICE} (${buy.body.coins} left)`);
  ok(totalCoins() === before - PRICE, "…and the world's silver is down the same — BURNED, not paid to anyone");

  const haggle = await api("POST", "/api/shop/stardust", { token: alice, body: { price: 1 } });
  ok(haggle.status === 402, "nobody talks Sterling down (the body is ignored; 60 silver is not 2,000)");

  const anon = await fetch(BASE + "/api/shop/stardust", { method: "POST" });
  ok(anon.status === 401, "a stranger can't buy one (401)");

  // ---- 3. THE WIRE ------------------------------------------------------------
  const A = await floorClient(alice);
  const B = await floorClient(bob);
  A.send({ type: "enter", suit: "yellow" });
  B.send({ type: "enter", suit: "yellow" });
  await A.waitFor("welcome");
  await B.waitFor("welcome");
  await sleep(150);

  // The canister is a legal thing to hold — and only real things are.
  A.clear();
  B.send({ type: "hold", id: "stardust" });
  const heldFrame = await A.waitFor("hold");
  ok(heldFrame?.hold === "stardust" && heldFrame?.id === bobId, "the canister rides the hold wire");
  A.clear();
  B.send({ type: "hold", id: "jetfuel" });
  await sleep(200);
  ok(!A.last("hold"), "…an invented substance does not");

  A.clear();
  B.send({ type: "stardust", hits: 1 });
  const h1 = await A.waitFor("stardust");
  ok(h1?.hits === 1 && h1?.id === bobId, "a hit reaches the room");

  A.clear();
  B.send({ type: "stardust", hits: 1 });
  await sleep(200);
  ok(!A.last("stardust"), "…but a no-change frame stays off the wire");

  A.clear();
  B.send({ type: "stardust", hits: 99 });
  const clamped = await A.waitFor("stardust");
  ok(clamped?.hits === 3, "a garbage count is CLAMPED, never believed (99 → 3)");

  // PERSISTED: a newcomer meets the helium and the smoke, like the bottle.
  B.send({ type: "stardust", hits: 2 });
  await sleep(150);
  const C = await floorClient(await register("carol", pw));
  C.send({ type: "enter", suit: "yellow" });
  const welcome = await C.waitFor("welcome");
  const seen = welcome?.peers?.find((p) => p.id === bobId);
  ok(seen?.sd === 2, `a newcomer finds the hits already riding (sd=${seen?.sd})`);
  ok(seen?.hold === "stardust", "…and the canister still in the hand");

  // THE PUFF. The server stamps the consequences; every screen gets the seed.
  A.clear();
  C.clear();
  B.send({ type: "puff" });
  const powA = await A.waitFor("pow");
  const powC = await C.waitFor("pow");
  ok(powA?.id === bobId, "the room watches them detonate");
  ok(!!powA?.seed && powA.seed === powC?.seed, "…the SAME body on every screen (one seed)");
  ok(typeof powA?.x === "number" && typeof powA?.y === "number", "…where they were standing");

  A.clear();
  B.send({ type: "puff" });
  await sleep(250);
  ok(!A.last("pow"), "a body already on the carpet cannot detonate again");

  // The puff clears the drug: a fresh arrival sees a corpse, not a hazard.
  const D = await floorClient(await register("dave", pw));
  D.send({ type: "enter", suit: "yellow" });
  const w2 = await D.waitFor("welcome");
  const bobNow = w2?.peers?.find((p) => p.id === bobId);
  ok(bobNow?.sd === 0, "…and the hits are cleared with it");
  ok(bobNow?.p === 3, "…the body is down");

  // ---- the account is untouched -------------------------------------------
  ok(graves() === 0, "nobody died: a puff is the gun's death, not the Wheel's");
  const bobShop = await api("GET", "/api/shop", { token: bob });
  ok(bobShop.status === 200, "…and the detonated can still use their account");

  for (const c of [A, B, C, D]) c.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} star dust asserts passed`);
    process.exit(bad ? 1 : 0);
  });
