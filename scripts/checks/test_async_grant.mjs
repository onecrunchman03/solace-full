// THE ASYNC GRANT — the backrooms' silver money path (Josh, Sep 2026).
//
// Run:  npm run build && node scripts/checks/test_async_grant.mjs
//
// Research Credit was a CLOSED currency, and that closure was doing real work:
// it is why footage could pay 400 for a walk in the dark without anyone
// checking the arithmetic. Pointing those payouts at `users.coins` would have
// made the backrooms a second faucet, uncapped by the Wheel — the one
// invariant the whole economy rests on. So silver reaches Threshold-4 through
// a FUNDED POOL: turn-ins draw from Async's budget, purchases return to it,
// and the conserved constant gains one term the way the goblin vault did.
//
// This is a money path, so it gets what money paths get here: every guard from
// both sides, exact conservation, and proof the new door cannot become a
// faucet. What it pins:
//
//   · the counter quotes SILVER, and Async's remaining budget is on the wire
//   · buying gear debits the wallet and CREDITS THE GRANT, to the coin
//   · turning a finding in draws from the grant and pays the wallet, to the coin
//   · CONSERVATION across all of it: wallets + grant never moves
//   · a budget that can't cover a valuation buys NOTHING — all or nothing, the
//     finding stays whole in the locker, and the refusal is free
//   · VOSS DOES NOT BUY EQUIPMENT, which is the exploit this round closed:
//     the Standard Kit cost ONE RARE EMOJI and handed over 500 of gear,
//     repeatably, and gear used to buy back at half — so a rare worth 200 at
//     Sterling's counter converted to 250 of house money, forever, limited
//     only by locker slots you could free by selling. Both halves are shut:
//     no resale, and the kit is once per surveyor.
//   · discard is free, final, and moves no money
//   · the emoji counter is GONE (at 50/150 she was a strictly worse Trader
//     than Sterling the instant the two currencies became one)
//   · the house's take splits three ways and both shares are redistributions

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8514;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "grant-harness");
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

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const { Store } = await import("file://" + path.join(ROOT, "dist", "db", "store.js").replace(/\\/g, "/"));
  const { GRANT_SEED, GRANT_TITHE, grantState, grantCovers } =
    await import("file://" + path.join(ROOT, "dist", "backrooms", "grant.js").replace(/\\/g, "/"));
  const { HOUSE_TITHE } = await import("file://" + path.join(ROOT, "dist", "lottery.js").replace(/\\/g, "/"));
  const { RELIC_PRICE, FOOTAGE_PRICE } =
    await import("file://" + path.join(ROOT, "dist", "backrooms", "gear.js").replace(/\\/g, "/"));
  const st = new Store(path.join(DATA_DIR, "solace.db"));

  const grant = () => st.db.prepare("SELECT silver FROM async_grant WHERE id = 1").get().silver;
  const wallets = () => st.db.prepare("SELECT COALESCE(SUM(coins),0) v FROM users").get().v;
  // The conserved pair this whole file exists to defend.
  const world = () => wallets() + grant();
  const locker = (id) => st.db.prepare("SELECT id, kind, color FROM backrooms_locker WHERE userId = ? ORDER BY id").all(id);
  const putItem = (id, kind, color = null) =>
    Number(st.db.prepare("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, ?, 0, ?, ?)")
      .run(id, kind, color, Date.now()).lastInsertRowid);

  const pw = "Sturdy!Passw0rd#9";
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const A = await register("surveyor", pw);
  const B = await register("bystander", pw);
  ok(!!A.token && !!B.token, "two surveyors registered");
  const mint = (id, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId: id, amount } });
  const me = async (token) => (await api("GET", "/api/backrooms/me", { token })).body;

  // ---- the counter speaks silver -----------------------------------------
  await mint(A.id, 10_000);
  const m0 = await me(A.token);
  ok(m0.coins === 10_000, "the counter reports the ORDINARY purse, not a private balance");
  ok(m0.rc === undefined, "…and there is no `rc` on the wire any more");
  // migration 117 moved the closed Exchange's untouched 500,000 float into the grant
  ok(m0.grant.silver === GRANT_SEED + 500_000 && m0.grant.seed === GRANT_SEED, "Async's budget is public: its seed plus the closed Exchange's float");
  ok(m0.grant.state === "funded", "…and reads as funded");
  ok(m0.prices.relic === RELIC_PRICE && m0.prices.footage.close === FOOTAGE_PRICE.close,
     "the price board quotes what Async pays for findings");
  ok(m0.prices.sell === undefined, "…and no longer quotes an emoji counter");

  // The emoji till is gone: at 50/150 it was strictly worse than Sterling's
  // 200/2,500 the moment the two currencies became one.
  const oldSell = await api("POST", "/api/backrooms/sell", { token: A.token, body: { codes: ["x"] } });
  ok(oldSell.status === 404, "POST /api/backrooms/sell is gone (404) — Voss buys findings, not emoji");

  // ---- BUYING returns silver to the budget it came from -------------------
  const w1 = world();
  const g1 = grant();
  const buyLight = await api("POST", "/api/backrooms/buy", { token: A.token, body: { kind: "flashlight" } });
  ok(buyLight.status === 200 && buyLight.body.coins === 10_000 - 50, "a flashlight costs 50 SILVER off the ordinary purse");
  ok(grant() === g1 + 50, "…and the 50 goes INTO Async's budget, not into a burn");
  ok(world() === w1, "CONSERVATION: wallets + grant is unmoved by a purchase");

  const broke = await api("POST", "/api/backrooms/buy", { token: B.token, body: { kind: "camera" } });
  ok(broke.status === 402 && broke.body.error === "insufficient", "a surveyor who can't pay is refused 402");
  ok(world() === w1 && grant() === g1 + 50, "…and the refusal moves nothing at all");

  // ---- TURNING A FINDING IN draws from the budget --------------------------
  const relicId = putItem(A.id, "relic", "the-anchor");
  const w2 = world(), g2 = grant(), c2 = (await me(A.token)).coins;
  const turn = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: relicId } });
  ok(turn.status === 200 && turn.body.gained === RELIC_PRICE, `a relic duplicate turns in for ${RELIC_PRICE} silver`);
  ok(turn.body.coins === c2 + RELIC_PRICE, "…paid into the ordinary purse");
  ok(grant() === g2 - RELIC_PRICE, "…drawn OUT of Async's budget");
  ok(world() === w2, "CONSERVATION: wallets + grant is unmoved by a turn-in");
  ok(!locker(A.id).some((i) => i.id === relicId), "…and the finding is hers now");

  const tapeId = putItem(A.id, "tape", "close");
  const g3 = grant();
  const tape = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: tapeId } });
  ok(tape.status === 200 && tape.body.gained === FOOTAGE_PRICE.close, "close-range footage pays the close rate");
  ok(grant() === g3 - FOOTAGE_PRICE.close, "…out of the same budget");

  // ---- VOSS DOES NOT BUY EQUIPMENT (the exploit this round closed) --------
  const lightRow = locker(A.id).find((i) => i.kind === "flashlight");
  const w4 = world();
  const resell = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: lightRow.id } });
  ok(resell.status === 400 && resell.body.error === "unsellable", "equipment cannot be sold back — she is not a pawnbroker");
  ok(world() === w4 && locker(A.id).some((i) => i.id === lightRow.id), "…and the refusal is free, with the item still in the locker");

  // THE WHOLE LOOP, end to end: the Standard Kit costs one rare emoji and
  // hands over a suit + can + light. Under the old rules those bought back at
  // half — 250 of house money per rare, repeatable forever. Prove it yields
  // nothing now, from BOTH directions.
  const rare = st.db.prepare("SELECT code FROM emoji WHERE tier = 'rare' LIMIT 1").get().code;
  st.addEmoji(A.id, rare);
  const wKit = world();
  const kit = await api("POST", "/api/backrooms/kit", { token: A.token, body: { code: rare } });
  ok(kit.status === 200, "the Standard Kit trades one rare emoji for suit + can + light");
  ok(world() === wKit, "…and moves no silver at all (it is an emoji BURN, not a purchase)");
  const kitSuit = locker(A.id).find((i) => i.kind === "suit");
  const sellKit = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: kitSuit.id } });
  ok(sellKit.status === 400 && sellKit.body.error === "unsellable", "THE FAUCET IS SHUT: the kit's suit cannot be converted to silver");
  ok(world() === wKit, "…and trying it moves nothing");

  // The other half of the loop: the kit was repeatable up to locker space.
  const rare2 = st.db.prepare("SELECT code FROM emoji WHERE tier = 'rare' AND code != ? LIMIT 1").get(rare).code;
  st.addEmoji(A.id, rare2);
  const again = await api("POST", "/api/backrooms/kit", { token: A.token, body: { code: rare2 } });
  ok(again.status === 400 && again.body.error === "have_suit", "a second Standard Kit is refused — it is a STARTER kit, one per surveyor");
  ok(st.ownsEmoji(A.id, rare2), "…and the refusal does not burn the emoji");

  // ---- DISCARD: free, final, moves nothing --------------------------------
  const wD = world();
  const canRow = locker(A.id).find((i) => i.kind === "spraycan");
  const toss = await api("POST", "/api/backrooms/discard", { token: A.token, body: { itemId: canRow.id } });
  ok(toss.status === 200, "unwanted equipment can be discarded");
  ok(!locker(A.id).some((i) => i.id === canRow.id), "…the row is gone");
  ok(world() === wD, "…and it returns nothing: no silver moves in either direction");
  const tossAgain = await api("POST", "/api/backrooms/discard", { token: A.token, body: { itemId: canRow.id } });
  ok(tossAgain.status === 404, "discarding it twice is a clean 404");

  // ---- FUNDING REVIEW PENDING: all or nothing ----------------------------
  // Drain the budget to just under a relic's valuation. A part-payment would
  // read as a bug and leave a half-sold relic; the refusal leaves it whole.
  st.db.prepare("UPDATE async_grant SET silver = ? WHERE id = 1").run(RELIC_PRICE - 1);
  const mLow = await me(A.token);
  ok(mLow.grant.state === "low" || mLow.grant.state === "funded", "a thin budget still reports a state");
  ok(!grantCovers(RELIC_PRICE - 1, RELIC_PRICE), "the pure rule refuses a valuation it cannot cover in full");
  const relic2 = putItem(A.id, "relic", "the-anchor");
  const wShort = world(), cShort = (await me(A.token)).coins;
  const short = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: relic2 } });
  ok(short.status === 409 && short.body.error === "grant_dry", "a budget one silver short buys NOTHING (409)");
  ok((await me(A.token)).coins === cShort, "…the surveyor is paid nothing");
  ok(locker(A.id).some((i) => i.id === relic2), "…and keeps the whole relic, to bank or to auction");
  ok(world() === wShort, "…and the refusal is free");

  st.db.prepare("UPDATE async_grant SET silver = 0 WHERE id = 1").run();
  ok(grantState(0) === "dry", "an empty budget reads DRY");
  const dryMe = await me(A.token);
  ok(dryMe.grant.state === "dry", "…and says so on the wire, BEFORE anyone walks back with a relic");
  const dry = await api("POST", "/api/backrooms/sellitem", { token: A.token, body: { itemId: relic2 } });
  ok(dry.status === 409 && dry.body.error === "grant_dry", "…and buys nothing");

  // Buying still works with a dry budget — the money flows the other way.
  const wDry = world();
  const buyDry = await api("POST", "/api/backrooms/buy", { token: A.token, body: { kind: "spraycan" } });
  ok(buyDry.status === 200 && grant() === 50, "a purchase still works on a dry budget, and refills it");
  ok(world() === wDry, "…conservation holds there too");

  // ---- THE ADMIN LEVER ----------------------------------------------------
  const bump = await api("POST", "/api/admin/backrooms/grant", { token: admin, body: { amount: 100_000 } });
  ok(bump.status === 200 && grant() === 100_050, "Foundry's disbursement tops the budget up");
  const clawTooFar = await api("POST", "/api/admin/backrooms/grant", { token: admin, body: { amount: -999_999 } });
  ok(clawTooFar.status === 400 && grant() === 100_050, "a claw-back below zero is refused, and moves nothing");
  // AND A LEGAL CLAW-BACK ACTUALLY MOVES IT. This assert did not exist, and
  // the guard above was hiding its absence: the route called grantCollect,
  // which refuses anything <= 0, so every negative adjustment answered 200
  // and changed nothing. A tested guard is not a tested feature.
  const rec = st.db.prepare("SELECT paid, recovered FROM async_grant WHERE id = 1").get();
  const claw = await api("POST", "/api/admin/backrooms/grant", { token: admin, body: { amount: -50_000 } });
  ok(claw.status === 200 && grant() === 50_050, "a legal claw-back actually takes the silver back out");
  ok(claw.body?.grant === 50_050, "…and the answer reports the balance it really left");
  const rec2 = st.db.prepare("SELECT paid, recovered FROM async_grant WHERE id = 1").get();
  ok(rec2.paid === rec.paid && rec2.recovered === rec.recovered,
     "…without touching paid/recovered — those are the counter's flow, not Foundry's");
  const back = await api("POST", "/api/admin/backrooms/grant", { token: admin, body: { amount: 50_000 } });
  ok(back.status === 200 && grant() === 100_050, "…and a disbursement puts it back");
  const zero = await api("POST", "/api/admin/backrooms/grant", { token: admin, body: { amount: 0 } });
  ok(zero.status === 400, "a zero adjustment is refused");
  const member = await api("POST", "/api/admin/backrooms/grant", { token: A.token, body: { amount: 10 } });
  ok(member.status === 403 && grant() === 100_050, "a member cannot move Async's budget");
  const audited = st.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'async_grant_adjust'").get().n;
  ok(audited >= 1, "…and every adjustment is audited, like every other lever that moves money");
  const oldLever = await api("POST", "/api/admin/backrooms/rc", { token: admin, body: { username: "surveyor", amount: 100 } });
  ok(oldLever.status === 404, "the old per-user RC mint is gone — with one currency, that is just the coin mint");

  // ---- THE HOUSE'S TAKE, split three ways --------------------------------
  // Both shares are REDISTRIBUTIONS: silver that would have burned stays in
  // the world, somewhere a player can win it back. The games must still be
  // hard sinks, so the two tithes have to leave the majority burning.
  ok(HOUSE_TITHE + GRANT_TITHE < 0.5, `the two tithes (${HOUSE_TITHE} + ${GRANT_TITHE}) leave the house edge a real sink`);
  const gBefore = grant();
  const potBefore = st.db.prepare("SELECT COALESCE(SUM(amount),0) v FROM lottery_boosts").get().v;
  st.houseEdgeTake("2026-09-21", 1000);
  ok(grant() === gBefore + Math.floor(1000 * GRANT_TITHE), "a 1,000 house win sends GRANT_TITHE to Async");
  ok(st.db.prepare("SELECT COALESCE(SUM(amount),0) v FROM lottery_boosts").get().v === potBefore + Math.floor(1000 * HOUSE_TITHE),
     "…and HOUSE_TITHE to the nightly pot");
  const gNeg = grant();
  st.houseEdgeTake("2026-09-21", -500);
  ok(grant() === gNeg, "a LOSING day gives Async nothing (the house does not fund it out of a loss)");
  // THE SPLIT IS OF WHAT THE HOUSE HAS ACTUALLY WON (Oct 2026 review): it
  // took 35% of every losing round and gave nothing back on winning ones, so
  // an even-money roulette bettor fed the pot ~18% of the stake against a
  // 2.7% edge. A loss now has to be won back before anything is split.
  const potOf = () => st.db.prepare("SELECT COALESCE(SUM(amount),0) v FROM lottery_boosts").get().v;
  const gRun = grant(), pRun = potOf();
  st.houseEdgeTake("2026-09-21", 300); // still 200 short of the 500 the house lost
  ok(grant() === gRun && potOf() === pRun, "…and a win that only claws back part of a loss funds nothing");
  st.houseEdgeTake("2026-09-21", 700); // now 500 ahead
  ok(grant() === gRun + Math.floor(500 * GRANT_TITHE) && potOf() === pRun + Math.floor(500 * HOUSE_TITHE),
     "…the split comes from what the house is actually ahead (500 of the 700)");
  // A long run of even-money spins: the tithe must stay well under what the house really took.
  {
    const gA = grant(), pA = potOf();
    // A HIGH-WATER MARK: each new peak of the house's cumulative net is split
    // once. Without clawing silver back out of the pot nothing can do better,
    // so the bound is the PEAK, and the comparison is the old per-round tithe.
    let houseNet = 0, peak = 0, oldWay = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 4000; i++) {
      const win = rnd() < 18 / 37; // red on a single-zero wheel
      const net = win ? -100 : 100;
      houseNet += net;
      peak = Math.max(peak, houseNet);
      if (net > 0) oldWay += Math.floor(net * HOUSE_TITHE) + Math.floor(net * GRANT_TITHE);
      st.houseEdgeTake("2026-09-22", net, "sim");
    }
    const tithed = grant() - gA + (potOf() - pA);
    ok(tithed <= Math.ceil(peak * (HOUSE_TITHE + GRANT_TITHE)) + 2,
       `…over 4,000 even-money spins the tithe (${tithed}) never exceeds the shares of the house's PEAK net (${peak})`);
    ok(tithed * 10 < oldWay,
       `…a small fraction of what the per-round tithe took (${oldWay}) — that was the mint`);
  }

  // ---- one last sweep: nothing anywhere minted silver --------------------
  const totals = st.economyTotals();
  ok(typeof totals.grant === "number" && totals.grant === grant(), "economyTotals() reports the live budget");
  st.close();

  console.log("");
  if (bad) {
    console.log(bootLog.split("\n").slice(-12).join("\n"));
    console.log(`${n - bad} passed, ${bad} FAILED`);
    process.exit(1);
  }
  console.log(`${n}/${n} Async grant asserts passed`);
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
