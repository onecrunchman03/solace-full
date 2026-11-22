// GOBLIN LENDERS — the goblin bank (Josh, Aug 2026; rules in
// src/lender.ts, money path in store.ts, migration 72).
//
// Pinned here, in the order it can hurt:
//
//  1. THE LENDER CANNOT MINT. This is the whole reason the design is allowed
//     to exist: the Wheel is Solace's only faucet, and a bank that conjures a
//     million silver would be a bigger one. The goblins are interstellar and
//     arrived with VAULT_SEED — so across EVERY operation below,
//     `SUM(users.coins) + goblin_vault.silver` is constant to the coin.
//     Borrowing moves it one way, every payment moves it back, and a default
//     writes silver OFF rather than forgiving it into somebody's wallet.
//  2. THE CREDIT LADDER. Goblins only lend against what they can seize, which
//     is what stops a fresh account borrowing a fortune and walking away —
//     the exploit that would otherwise make this a coin printer.
//  3. THE PUNISHMENT LADDER, one step per missed day: marked, garnished,
//     repossessed, frozen, jailed. Each step proven to actually happen.
//  4. THE CELL. A jailed session reaches NO ordinary route, bail costs MORE
//     than the debt (or jail is a discount debt-settlement service), bail
//     frees the body and NOT the debt, and a sealed cell runs the ordinary
//     Inheritance with the goblins paid off the top.
//
// Deliberately not faked: the clock. Interest is charged per UTC day and the
// harness moves `loans.lastDay` backwards to make days pass, which exercises
// the real `daysBetween` path rather than a test-only shortcut.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";
import {
  VAULT_SEED, TIERS, RATES, CREDIT_MULTIPLE, GARNISH_SHARE, SEIZE_SHARE,
  BAIL_FEE_SHARE, LATE_FEE_SHARE, RATE_STEP, RATE_CAP, MAX_CATCHUP_DAYS,
  bailPrice, creditLimit, daysBetween, garnishOf, interestFor, jailIsFresh,
  maxTierFor, minWorth, MIN_WORTH_COMMONS, missPenalty, quote, repoOrder, seizeValue, stageFor, tierAllowed,
  canMoveValue, canBuyTrophies, dayKey,
  SHELF_MULTIPLE, MAX_PLEA, shelfPrice, cleanPlea, potRemaining, collectorsNotice, countsAsBail,
} from "../../src/lender.ts";
import { SELL_PRICES } from "../../src/shop.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8488;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "lender-harness");
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
    // The goblins call round every 300ms here instead of every minute. Safe
    // BECAUSE the visit is idempotent per UTC day (see LENDER_SWEEP_MS): a
    // faster clock changes nothing but how long this file takes to run.
    LENDER_SWEEP_MS: "300",
    // …and graves seal on the same quickened clock, for the death-in-debt
    // section below. Same reasoning: sealing is keyed to a deadline COLUMN,
    // so checking for it more often changes nothing but the wall clock.
    GRAVE_SWEEP_MS: "300",
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

// ---- 1 + 2 + 3: THE PURE RULES (no server needed) ----------------------------
{
  ok(VAULT_SEED === 5_000_000, "the goblins arrived with five million and no way to make more");
  ok(TIERS.length === 4 && TIERS[0] === 1_000 && TIERS[3] === 1_000_000, "four windows: 1k / 10k / 100k / 1M");
  ok(RATES[1_000] < RATES[1_000_000], "the bigger the loan the worse the rate — these are predatory");
  ok(RATES[1_000_000] === 0.30, "…and the top window is 30% a day, which is a countdown, not a loan");

  // Interest: simple, floored, never negative.
  ok(interestFor(1_000, 0.15) === 150 && interestFor(1_000_000, 0.30) === 300_000, "interest is simple and exact");
  ok(interestFor(0, 0.3) === 0 && interestFor(-5, 0.3) === 0, "…and never invents a debt out of nothing");
  ok(interestFor(999, 0.15) === 149, "…floored, so no fraction of a coin is ever conjured");

  // A missed payment: interest capitalises, a fee lands, the rate steps, capped.
  {
    const p = missPenalty(1_000, 0.15);
    ok(p.interest === 150 && p.fee === Math.floor(150 * LATE_FEE_SHARE), "a missed payment adds its interest and a late fee");
    ok(p.principal === 1_000 + 150 + p.fee, "…capitalised onto the principal, exactly once");
    ok(Math.abs(p.rate - (0.15 + RATE_STEP)) < 1e-9, "…and the rate steps up a point");
    let r = 0.15;
    for (let i = 0; i < 200; i++) r = missPenalty(1_000, r).rate;
    ok(r <= RATE_CAP + 1e-9, `…but never past the cap (${RATE_CAP})`);
  }

  // The credit ladder — the anti-exploit.
  ok(creditLimit(0, 0) === 0 && maxTierFor(0, 0) === null, "an account with nothing gets NOTHING, not even the small window");
  ok(maxTierFor(400, 0) === 1_000, "334 silver of worth opens the 1,000 window (3x)");
  ok(maxTierFor(0, 400) === 1_000, "…and a collection counts exactly as purse does");
  ok(maxTierFor(3_400, 0) === 10_000 && maxTierFor(34_000, 0) === 100_000, "the ladder climbs with what they could take");
  ok(maxTierFor(333_400, 0) === 1_000_000, "…and only a fortune opens the million");
  ok(creditLimit(1_000, 500) === 4_500, `the limit is ${CREDIT_MULTIPLE}x purse+collection`);
  ok(!tierAllowed(500, 999_999, 0), "a number that isn't one of the four windows is refused outright");
  ok(!tierAllowed(1_000_000, 400, 0), "…and a pauper cannot reach the top window");
  // THE DOOR (Sep 2026 review). The ladder is denominated in fixed silver while
  // the collection is valued at the Trader's table, so a price raise quietly
  // moved the smallest window from ~34 commons of worth to seven. The floor is
  // pinned in COMMONS so it can never drift again.
  const DOOR = minWorth(SELL_PRICES.common);
  ok(DOOR === MIN_WORTH_COMMONS * SELL_PRICES.common && DOOR === 1_750,
    `the door is ${MIN_WORTH_COMMONS} commons at the Trader's table (${DOOR} silver today)`);
  ok(maxTierFor(400, 0, DOOR) === null && maxTierFor(1_700, 0, DOOR) === null,
    "…so 3x-the-window alone no longer opens it: a near-worthless account is refused");
  ok(maxTierFor(DOOR, 0, DOOR) === 1_000 && maxTierFor(0, DOOR, DOOR) === 1_000,
    "…at the door exactly, the small window opens, from purse or collection alike");
  ok(maxTierFor(333_400, 0, DOOR) === 1_000_000, "…and the door never blocks a fortune");
  ok(!tierAllowed(1_000, 1_000, 0, DOOR) && tierAllowed(1_000, 2_000, 0, DOOR),
    "…the door binds tierAllowed too, not just the ladder read");
  ok(maxTierFor(400, 0) === 1_000, "…and a floor of 0 is still the pure rule (the harness's own calls)");

  // The punishment ladder.
  ok(stageFor(0) === 0 && stageFor(1) === 1 && stageFor(5) === 5 && stageFor(99) === 5, "one step per missed day, capped at jail");
  ok(garnishOf(1_000) === 250 && garnishOf(0) === 0, `garnish is ${GARNISH_SHARE * 100}% of the purse`);
  ok(seizeValue(100) === 50 && seizeValue(10) === 5, `seizure pays ${SEIZE_SHARE * 100}% of the Trader's price — they're taking it, not buying it`);
  {
    const owned = [
      { code: "leg", tier: "legendary", price: 100 },
      { code: "com", tier: "common", price: 10 },
      { code: "myth", tier: "mythic", price: 0 },
      { code: "rar", tier: "rare", price: 30 },
    ];
    const order = repoOrder(owned).map((e) => e.code);
    ok(order.join(",") === "com,rar,leg", "repossession works bottom-up: commons first, mythics untouchable");
  }
  ok(canMoveValue(3) && !canMoveValue(4), "the freeze bites at stage 4 — no trades, no auctions, nothing leaves your hands");
  ok(canBuyTrophies(false) && !canBuyTrophies(true), "the house doesn't sell trophies to men who owe money");

  // Bail must exceed the debt, always — the exploit that decides the design.
  ok(bailPrice(1_000) === 1_500 && bailPrice(0) === 0, `bail is the debt plus ${BAIL_FEE_SHARE * 100}%`);
  {
    let cheaper = 0;
    for (let d = 1; d <= 2_000_000; d += 9_973) if (bailPrice(d) <= d) cheaper++;
    ok(cheaper === 0, "…and is NEVER cheaper than simply paying (201 debts) — else jail is a discount settlement");
  }
  ok(!jailIsFresh(null, Date.now()) && jailIsFresh(Date.now() + 1000, Date.now()), "a null seal reads as sealed, like a grave");

  // The clock.
  ok(daysBetween("2026-08-01", "2026-08-02") === 1 && daysBetween("2026-08-02", "2026-08-01") === 0, "days only ever move forward");
  ok(daysBetween("2026-08-01", "2026-09-01") === MAX_CATCHUP_DAYS,
    `a server that was off for a month charges at most ${MAX_CATCHUP_DAYS} days — nobody comes back to a jailed server`);
  ok(dayKey(Date.UTC(2026, 7, 15, 23, 59)) === "2026-08-15", "the day key is UTC, like every other cadence here");

  const q = quote(1_000, 0.15, 2);
  ok(q.interest === 150 && q.payoff === 1_150 && q.stage === 2 && q.bail === bailPrice(1_150), "the kiosk quote agrees with all of it");

  // ROUND TWO (Sep 2026): the shelf, the plea, the pot, the notice.
  ok(SHELF_MULTIPLE === 5 && shelfPrice(10) === 50 && shelfPrice(30) === 150 && shelfPrice(100) === 500,
    "the shelf sells at 5x the Trader's price — 50 / 150 / 500 — never a cheaper road to a collection than the Wheel");
  ok(shelfPrice(0) === 0 && shelfPrice(-5) === 0, "…and an unsellable tier prices at nothing (it never reaches the shelf anyway)");
  ok(cleanPlea("  bring\n 15k  \t please ") === "bring 15k please", "a plea is one line: control characters and runs of space collapse");
  ok(cleanPlea("x".repeat(500))?.length === MAX_PLEA, `…clamped to ${MAX_PLEA}`);
  ok(cleanPlea("   ") === null && cleanPlea(42) === null && cleanPlea(undefined) === null, "…and nothing, or not-a-string, clears it");
  ok(potRemaining(1_500, 400) === 1_100 && potRemaining(1_500, 1_500) === 0 && potRemaining(1_500, 9_999) === 0,
    "the pot's remainder never goes negative");
  ok(!countsAsBail(1, 18_000) && !countsAsBail(1_799, 18_000) && countsAsBail(1_800, 18_000) && countsAsBail(18_000, 18_000),
    "a pot chip counts as 'a bail paid' only from a tenth of the price — one silver dripped into pots is not a bondsman");
  ok(!countsAsBail(5, 0), "…and nothing counts against a zero price");
  {
    const n = collectorsNotice({ took: 150, seized: [], missedDays: 0, stage: 0, jailed: false });
    ok(n.title === "THE COLLECTORS CALLED" && n.body.includes("150 silver taken"), "a serviced day reads as silver taken");
    const m = collectorsNotice({ took: 0, seized: ["a", "b", "c"], missedDays: 1, stage: 3, jailed: false });
    ok(m.body.includes("3 emoji repossessed") && m.body.includes("REPOSSESSION"), "a missed day names what went and where you stand");
    const j = collectorsNotice({ took: 0, seized: [], missedDays: 1, stage: 5, jailed: true });
    ok(j.title === "THE GOBLINS HAVE YOU" && j.body.includes("custody"), "…and a jailing says so in the title");
    // THE NOTICE TURNS WITH THE LADDER (Josh, Sep 2026). This is the one line
    // of the goblins a debtor reads without opening anything — it is the push
    // notification's heading — so the walk from "a word" to "done asking" has
    // to be legible there and not only in the DMs.
    const titles = [0, 1, 2, 3, 4, 5].map((s) => collectorsNotice({ took: 0, seized: [], missedDays: s, stage: s, jailed: s === 5 }).title);
    ok(new Set(titles).size === 6, "every rung of the ladder has its own heading");
    ok(titles[1] !== titles[0] && /DONE ASKING/.test(titles[4]),
      "…and it hardens all the way down, so the phone alone tells you where you stand");
    // The FACTS still lead the body: a push shows only its opening, and what
    // a debtor needs from a push is the number, not the performance.
    const g = collectorsNotice({ took: 2_400, seized: [], missedDays: 2, stage: 2, jailed: false });
    ok(g.body.startsWith("2,400 silver taken"), "the receipt comes first in the body — the push excerpt must carry the number");
    ok(g.body.length > "2,400 silver taken · payment missed — you are GARNISHED.".length,
      "…with a line of them underneath it, which is where the tone lives");
  }
}

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(DATA_DIR, "solace.db");
  // Every connection WAITS for a lock rather than failing at once: the server
  // is live under these writes and its own sweeps commit when they like, so
  // a bare connection died "database is locked" once on a busy box (Oct 2026).
  const db = (ro = true) => {
    const d = ro ? new DatabaseSync(dbPath, { readOnly: true }) : new DatabaseSync(dbPath);
    d.exec("PRAGMA busy_timeout = 5000;");
    return d;
  };
  const q1 = (sql, ...a) => { const d = db(); const r = d.prepare(sql).get(...a); d.close(); return r; };
  const wallets = () => q1("SELECT COALESCE(SUM(coins),0) AS t FROM users").t;
  const vault = () => q1("SELECT silver FROM goblin_vault WHERE id = 1").silver;
  /**
   * THE INVARIANT: nothing this bank does may change the world's silver.
   *
   * The admin mint (`/api/admin/coins`) is the one legitimate exception in the
   * whole app — it is the house's own lever — so the harness accounts for it
   * explicitly rather than re-baselining and hoping. Every conservation assert
   * below compares against `worldStart + minted`, which means a single coin
   * created by the LENDER anywhere would fail every one of them.
   */
  const world = () => wallets() + vault();
  let minted = 0;
  const mint = async (userId, amount) => {
    minted += amount;
    return api("POST", "/api/admin/coins", { token: admin, body: { userId, amount } });
  };
  const loanRow = (id) => q1("SELECT * FROM loans WHERE userId = ?", id) ?? null;
  /** Make days pass by ageing the loan, then let the sweep call round. */
  const ageDays = (id, days) => {
    const d = db(false);
    const day = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    d.prepare("UPDATE loans SET lastDay = ? WHERE userId = ?").run(day, id);
    d.close();
  };
  const waitCollect = async (id, pred, ms = 12_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const l = loanRow(id);
      const u = q1("SELECT jailedAt, disabled, coins FROM users WHERE id = ?", id);
      if (pred(l, u)) return { l, u };
      await sleep(80);
    }
    return { l: loanRow(id), u: q1("SELECT jailedAt, disabled, coins FROM users WHERE id = ?", id) };
  };

  const pw = "Sturdy!Passw0rd#9";
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const admin = adminLogin.body?.token;
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  ok(admin && alice && bob, "admin + two accounts");
  const idOf = async (t) => (await api("GET", "/api/me", { token: t })).body.user.id;
  const aliceId = await idOf(alice);
  const bobId = await idOf(bob);

  ok(vault() === VAULT_SEED, `the vault booted with its seed (${VAULT_SEED.toLocaleString()})`);
  const worldStart = world();

  // ---- THE CREDIT LADDER, over the wire --------------------------------------
  const broke = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000 } });
  ok(broke.status === 403 && broke.body.error === "over_limit", "a penniless newcomer is refused even the small window");
  ok(world() === worldStart + minted, "…and a refusal moves not one coin");

  // THE DOOR (Sep 2026 review): worth below `minWorth` opens nothing at all,
  // whatever 3x says — the guard that stops a day-old alt borrowing.
  await mint(aliceId, 400);
  const underDoor = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000 } });
  ok(underDoor.status === 403 && underDoor.body.error === "over_limit" && world() === worldStart + minted,
    "400 silver is over 3x the small window but under the door — refused, and free");
  await mint(aliceId, 1_600); // 2,000 total: over the door, nowhere near a fortune
  const tooBig = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000_000 } });
  ok(tooBig.status === 403, "2,000 silver of worth does not open the million-silver window");
  const odd = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 5_000 } });
  ok(odd.status === 403 || odd.status === 400, "and there is no slider — only the four windows");

  // ---- BORROWING MOVES SILVER, IT DOES NOT MAKE IT ---------------------------
  const beforeVault = vault();
  const took = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000 } });
  ok(took.status === 200 && took.body.coins === 3_000, `the loan lands in the purse (${took.body.coins})`);
  ok(vault() === beforeVault - 1_000, "…out of the goblins' vault, to the coin");
  ok(world() === worldStart + minted, "THE WORLD'S SILVER IS UNCHANGED — the lender cannot mint");
  ok(took.body.loan.rate === RATES[1_000] && took.body.loan.interest === 150, "the terms are the server's");

  // THE AUDIT SEES THE GOBLINS (migration 75). economyTotals used to sum
  // wallets + escrow + pot only, so this very loan read as a 1,000-silver
  // mint in the drift check. With the vault term the audited constant holds
  // across a live loan.
  {
    const eco = await api("GET", "/api/admin/economy", { token: admin });
    ok(eco.status === 200 && eco.body.now.vault === vault(), "the economy audit carries the goblin vault");
    const audited = eco.body.now.totalCoins + eco.body.now.escrow + eco.body.now.potPending + eco.body.now.vault;
    ok(audited === worldStart + minted, "…and its four-term total is constant across an open loan (no phantom mint in the drift check)");
  }

  const again = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000 } });
  ok(again.status === 409 && again.body.error === "loan_open", "one loan at a time");

  // ---- REPAYMENT PUTS IT BACK ------------------------------------------------
  // INTEREST IS DUE ONCE A DAY, NOT ONCE A PAYMENT. She borrowed today, so no
  // day has passed and nothing has accrued: every coin she pays now goes
  // against the principal. (The first cut recomputed interest on every
  // payment, so paying twice in an afternoon was charged two days of it.)
  const pay1 = await api("POST", "/api/lender/pay", { token: alice, body: { amount: 150 } });
  ok(pay1.status === 200 && pay1.body.loan.principal === 850,
    `a payment on the day you borrow is pure principal (${pay1.body.loan?.principal})`);
  ok(world() === worldStart + minted, "…and the world's silver is STILL unchanged");
  const payAll = await api("POST", "/api/lender/pay", { token: alice, body: { amount: 999_999 } });
  ok(payAll.status === 200 && payAll.body.cleared === true, "paying it off clears the loan");
  ok(loanRow(aliceId) === null, "…the row is gone");
  ok(vault() === VAULT_SEED, "…and borrowing + repaying inside one day costs the borrower NOTHING");
  ok(world() === worldStart + minted, "…with the world's total STILL constant");

  const nothing = await api("POST", "/api/lender/pay", { token: alice, body: { amount: 100 } });
  ok(nothing.status === 404, "paying a loan you don't have is refused");
  const anon = await fetch(BASE + "/api/lender/borrow", { method: "POST" });
  ok(anon.status === 401, "a stranger can't borrow (401)");

  // ---- THE LADDER, one missed day at a time ----------------------------------
  // Bob gets real money so he can reach a real window, then stops paying.
  await mint(bobId, 40_000);
  const bobLoan = await api("POST", "/api/lender/borrow", { token: bob, body: { amount: 10_000 } });
  ok(bobLoan.status === 200, "bob takes the 10,000 window");
  const worldBob = world();

  // Day one missed: he must not be able to pay it, so empty the purse first.
  {
    const d = db(false);
    d.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(bobId);
    d.close();
  }
  const emptied = world();
  ageDays(bobId, 1);
  const s1 = await waitCollect(bobId, (l) => l && l.missed >= 1);
  ok(s1.l?.missed === 1, "miss a day and you are MARKED (stage 1)");
  ok(s1.l.principal > 10_000, `…the interest and a late fee capitalise (${s1.l.principal})`);
  ok(s1.l.rate > RATES[10_000], "…and the rate steps up");
  ok(world() === emptied, "…and still nothing is minted, even by a penalty");

  // Stage 2: garnishment takes a quarter of whatever is in the purse.
  {
    const d = db(false);
    d.prepare("UPDATE users SET coins = 1000 WHERE id = ?").run(bobId);
    d.close();
  }
  const beforeGarnish = world();
  ageDays(bobId, 1);
  const s2 = await waitCollect(bobId, (l, u) => l && l.missed >= 2 && u.coins < 1000);
  ok(s2.l?.missed === 2, "miss another and they start GARNISHING (stage 2)");
  ok(s2.u.coins === 750, `…a quarter of the purse goes with them (${s2.u.coins} left of 1000)`);
  ok(world() === beforeGarnish, "…moved, not destroyed: the world's silver holds");

  // Stage 3: repossession — they start taking emoji.
  {
    const d = db(false);
    d.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(bobId);
    const codes = d.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 6").all();
    for (const c of codes) d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(bobId, c.code, Date.now());
    d.close();
  }
  const ownedBefore = q1("SELECT COUNT(*) AS c FROM user_emoji WHERE userId = ?", bobId).c;
  ok(ownedBefore === 6, "bob has a small collection to lose");
  ageDays(bobId, 1);
  const s3 = await waitCollect(bobId, (l) => l && l.missed >= 3);
  const ownedAfter = q1("SELECT COUNT(*) AS c FROM user_emoji WHERE userId = ?", bobId).c;
  ok(s3.l?.missed === 3, "miss a third and REPOSSESSION starts (stage 3)");
  ok(ownedAfter < ownedBefore, `…and the collection starts going (${ownedBefore} → ${ownedAfter})`);

  // Oct 2026 review: two doors the freeze didn't cover. A gift offer FILED
  // before the freeze stayed acceptable after it, and a borrower in good
  // standing could bid the loan on a friend's lot (95% of it to the friend).
  let preFiled = null, keptCode = null;
  {
    const d = db(false);
    const spare = d.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 1 OFFSET 20").get();
    // a MYTHIC: repossession never takes one, so a void can only be the freeze
    keptCode = d.prepare("SELECT code FROM emoji WHERE tier = 'mythic' LIMIT 1").get().code;
    d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(aliceId, spare.code, Date.now());
    d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(bobId, keptCode, Date.now());
    d.close();
    const lot = await api("POST", "/api/auctions", { token: alice, body: { code: spare.code, startPrice: 10, hours: 1 } });
    const bid = await api("POST", `/api/auctions/${lot.body.auction.id}/bid`, { token: bob, body: { amount: 50 } });
    ok(bid.status === 403 && bid.body.error === "owes_goblins", `a borrower can't bid the loan away on a friend's lot, frozen or not (${bid.status} ${bid.body.error})`);
    await api("POST", `/api/auctions/${lot.body.auction.id}/cancel`, { token: alice });
    preFiled = keptCode ? await api("POST", "/api/trades", { token: bob, body: { toUser: aliceId, offered: [keptCode], requested: [] } }) : null;
  }

  // Stage 4: frozen — value can no longer leave their hands.
  ageDays(bobId, 1);
  const s4 = await waitCollect(bobId, (l) => l && l.missed >= 4);
  ok(s4.l?.missed === 4, "miss a fourth and they FREEZE you (stage 4)");
  const tradeTry = await api("POST", "/api/trades", { token: bob, body: { toUser: aliceId, offered: ["x"], requested: [] } });
  ok(tradeTry.status === 403 && tradeTry.body.error === "in_arrears", "…a frozen debtor cannot open a trade");
  const auctionTry = await api("POST", "/api/auctions", { token: bob, body: { code: "x", startPrice: 10, hours: 1 } });
  ok(auctionTry.status === 403 && auctionTry.body.error === "in_arrears", "…nor list an auction — the laundering route is shut");
  if (preFiled?.status === 200) {
    const late = await api("POST", `/api/trades/${preFiled.body.trade.id}/accept`, { token: alice });
    const stillHis = q1("SELECT 1 AS o FROM user_emoji WHERE userId = ? AND code = ?", bobId, keptCode)?.o === 1;
    ok(late.status === 409 && late.body.error === "trade_invalid" && stillHis,
      `…and a gift he filed BEFORE the freeze can't be accepted after it (${late.status} ${late.body.error})`);
  } else {
    ok(false, `…the pre-freeze gift offer couldn't be staged (${preFiled?.status} ${preFiled?.body?.error ?? "bob owns no emoji"})`);
  }

  // THE OTHER TWO DOORS (Aug 2026): filing was gated but ACCEPTING a trade
  // that requests your emoji, or BIDDING silver into a friend's auction, moved
  // value out of frozen hands just the same. Give alice two spare emoji and
  // bob one to covet, then walk both routes.
  {
    const d = db(false);
    const spare = d.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 3 OFFSET 10").all();
    d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(aliceId, spare[0].code, Date.now());
    d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(aliceId, spare[1].code, Date.now());
    d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(bobId, spare[2].code, Date.now());
    d.close();
    const [aGift, aLot, bKeeps] = [spare[0].code, spare[1].code, spare[2].code];

    // A clean friend may still FILE an offer at a frozen debtor…
    const drain = await api("POST", "/api/trades", { token: alice, body: { toUser: bobId, offered: [aGift], requested: [bKeeps] } });
    ok(drain.status === 200, "a clean friend can still file an offer at a frozen debtor");
    // …but the debtor cannot ACCEPT one that takes anything from them.
    const drainAccept = await api("POST", `/api/trades/${drain.body.trade.id}/accept`, { token: bob });
    ok(drainAccept.status === 403 && drainAccept.body.error === "in_arrears",
      "…who cannot ACCEPT it — the offered-junk-request-the-goods drain is shut");
    ok(q1("SELECT 1 AS o FROM user_emoji WHERE userId = ? AND code = ?", bobId, bKeeps)?.o === 1,
      "…and the coveted emoji never left their hands");
    await api("POST", `/api/trades/${drain.body.trade.id}/cancel`, { token: alice });

    // A pure inbound gift still lands — frozen means emptied of nothing NEW,
    // not beyond help.
    const gift = await api("POST", "/api/trades", { token: alice, body: { toUser: bobId, offered: [aGift], requested: [] } });
    const giftAccept = await api("POST", `/api/trades/${gift.body.trade.id}/accept`, { token: bob });
    ok(giftAccept.status === 200 && q1("SELECT 1 AS o FROM user_emoji WHERE userId = ? AND code = ?", bobId, aGift)?.o === 1,
      "a pure gift (nothing requested) still reaches a frozen debtor");

    // And the auction floor: bidding pays the seller at settle, so it's the
    // same drain with a gavel. Refused before any wallet or escrow is touched.
    const lot = await api("POST", "/api/auctions", { token: alice, body: { code: aLot, startPrice: 10, hours: 1 } });
    ok(lot.status === 200, "the clean friend lists a lot");
    const bidTry = await api("POST", `/api/auctions/${lot.body.auction.id}/bid`, { token: bob, body: { amount: 50 } });
    ok(bidTry.status === 403 && bidTry.body.error === "in_arrears", "…a frozen debtor cannot bid on it");
  }

  // Stage 5: jail.
  ageDays(bobId, 1);
  const s5 = await waitCollect(bobId, (_l, u) => !!u.jailedAt);
  ok(!!s5.u.jailedAt, "miss a fifth and the goblins take you (stage 5 — JAIL)");
  ok(s5.u.disabled === 1, "…the account is disabled, like a corpse");
  ok(q1("SELECT diedAt FROM users WHERE id = ?", bobId).diedAt === null,
    "…but diedAt stays NULL: a prisoner is NOT a corpse, so the Wake's cheaper self-revive is out of reach");

  // ---- THE CELL --------------------------------------------------------------
  const jailedLogin = await api("POST", "/api/login", { body: { username: "bob", password: pw } });
  ok(jailedLogin.status === 200 && jailedLogin.body.jail === true, "a prisoner can still log in — to a cell");
  const jailToken = jailedLogin.body.token;
  const cell = await api("GET", "/api/cell", { token: jailToken });
  ok(cell.status === 200 && cell.body.debt > 0, `the cell screen shows the debt (${cell.body.debt})`);
  ok(cell.body.bail === bailPrice(cell.body.debt), "…and what bail would cost");
  const sneak = await api("GET", "/api/shop", { token: jailToken });
  ok(sneak.status === 401, "a jailed session reaches NO ordinary route");
  const sneakWake = await api("GET", "/api/wake", { token: jailToken });
  ok(sneakWake.status === 401, "…and not the WAKE either — the two doors never overlap");
  const freeMan = await api("GET", "/api/cell", { token: alice });
  ok(freeMan.status === 401, "…while a free player can't reach the cell at all");

  // ---- BAIL ------------------------------------------------------------------
  const bailCost = cell.body.bail;
  await mint(aliceId, bailCost + 500);
  const worldBeforeBail = world();
  const poorBail = await api("POST", "/api/lender/bail/" + bobId, { token: bob });
  ok(poorBail.status === 401, "a prisoner cannot bail themselves out (no session for it)");
  const bailed = await api("POST", "/api/lender/bail/" + bobId, { token: alice });
  ok(bailed.status === 200 && bailed.body.price === bailCost, `alice springs him for ${bailCost}`);
  ok(world() === worldBeforeBail, "…and the bail MOVES to the goblins: nothing minted, nothing burned");
  ok(q1("SELECT jailedAt, disabled FROM users WHERE id = ?", bobId).jailedAt === null, "he's out");
  ok(!!loanRow(bobId), "…AND STILL IN DEBT — bail frees the body, not the debt");
  ok(loanRow(bobId).missed === 1, "…reset to MARKED, so he isn't jailed again the same night");
  const backIn = await api("GET", "/api/shop", { token: bob });
  ok(backIn.status === 200, "his old session works again");

  // ---- THE TROPHY GATE -------------------------------------------------------
  await mint(bobId, 200_000);
  const trophy = await api("POST", "/api/shop/mythic", { token: bob });
  ok(trophy.status === 403 && trophy.body.error === "in_debt", "Sterling won't sell a mythic to a man who owes goblins money");
  const gun = await api("POST", "/api/shop/gun", { token: bob });
  ok(gun.status === 403 && gun.body.error === "in_debt", "…nor the gun");

  // ---- THE SEALED CELL -------------------------------------------------------
  // Jail carol, run her window out, and prove the Inheritance runs with the
  // goblins paid off the top.
  const carol = await register("carol", pw);
  const carolId = await idOf(carol);
  await mint(carolId, 4_000);
  await api("POST", "/api/lender/borrow", { token: carol, body: { amount: 10_000 } });
  {
    const d = db(false);
    d.prepare("UPDATE users SET coins = 5000 WHERE id = ?").run(carolId);
    const codes = d.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 8").all();
    for (const c of codes) d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(carolId, c.code, Date.now());
    // Straight to the cell, with its window already expired.
    const now = Date.now();
    d.prepare("UPDATE users SET disabled = 1, jailedAt = ?, jailSealsAt = ? WHERE id = ?").run(now - 1000, now - 1, carolId);
    // …with 3,000 parked in escrow (Oct 2026 review): a cell seal never swept
    // escrow, so a loan parked in a position escaped the goblins and the
    // Inheritance alike. world() counts wallets + vault, so the escrow is
    // added to the baseline below.
    d.prepare("INSERT INTO roulette_bets (userId, kind, target, amount, at) VALUES (?, 'red', NULL, 3000, ?)").run(carolId, now);
    d.close();
  }
  const genBefore = q1("SELECT generation FROM users WHERE id = ?", carolId).generation;
  const worldBeforeSeal = world() + 3000;
  const sealed = await waitCollect(carolId, () => q1("SELECT jailedAt FROM users WHERE id = ?", carolId).jailedAt === null);
  const after = q1("SELECT generation, coins, disabled, jailedAt FROM users WHERE id = ?", carolId);
  ok(after.jailedAt === null, "an unbailed cell seals when its window runs out");
  ok(after.generation === genBefore + 1, "…and the ordinary Inheritance runs: the account stands up a generation older");
  ok(after.disabled === 0, "…alive again, exactly as a sealed grave leaves you");
  ok(loanRow(carolId) === null, "…the debt dies with the life");
  ok(q1("SELECT COUNT(*) AS c FROM roulette_bets WHERE userId = ?", carolId).c === 0, "…and her parked escrow came home to pay the goblins first");
  ok(world() === worldBeforeSeal, "…and even a DEFAULT mints nothing: the shortfall is written off, never forgiven into a wallet");
  ok(vault() > VAULT_SEED, `…the goblins recovered what they could (vault ${vault().toLocaleString()})`);
  ok(q1("SELECT COUNT(*) AS c FROM lives WHERE userId = ?", carolId).c === 1, "…and the life is carved into the Graveyard's monuments");
  ok(q1("SELECT deathCause AS c FROM lives WHERE userId = ?", carolId).c === "goblins",
    "…with the CAUSE on the stone: the goblins collected (migration 76)");

  // ---- DYING IN DEBT -----------------------------------------------------------
  // The OTHER way a life ends. A sealing cell always paid the goblins off the
  // top; an ordinary grave did not, so the loan row outlived the life and the
  // same account stood back up as the next generation still owing — on the 25%
  // purse and five emoji the Inheritance leaves it, which the goblins' next
  // visit walks straight back up the ladder to a cell. The two endings settle
  // creditors the same way now (store.settleGoblinDebt).
  let daveTok = null, daveId = 0; // hoisted: round two reuses the reborn dave
  {
    const dave = await register("dave", pw);
    daveTok = dave;
    daveId = await idOf(dave);
    await mint(daveId, 4_000);
    await api("POST", "/api/lender/borrow", { token: dave, body: { amount: 10_000 } });
    ok(!!loanRow(daveId), "dave owes the goblins ten thousand");
    const d = db(false);
    d.prepare("UPDATE users SET coins = 6000 WHERE id = ?").run(daveId);
    const codes = d.prepare("SELECT code FROM emoji WHERE tier = 'common' LIMIT 8").all();
    for (const c of codes) {
      d.prepare("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)").run(daveId, c.code, Date.now());
    }
    // Killed by the Wheel, not the goblins: a real grave, its 48 hours spent.
    const now = Date.now();
    d.prepare("UPDATE users SET disabled = 1, diedAt = ?, graveSealsAt = ? WHERE id = ?").run(now - 1000, now - 1, daveId);
    d.close();
    const vaultBefore = vault();
    const worldBeforeGrave = world();
    const t0 = Date.now();
    while (Date.now() - t0 < 12_000 && q1("SELECT graveSealsAt FROM users WHERE id = ?", daveId).graveSealsAt !== null) {
      await sleep(80);
    }
    const dv = q1("SELECT generation, coins, disabled FROM users WHERE id = ?", daveId);
    ok(q1("SELECT graveSealsAt FROM users WHERE id = ?", daveId).graveSealsAt === null, "the grave seals when its window runs out");
    ok(loanRow(daveId) === null, "…and the debt does NOT outlive the life it was lent to");
    ok(vault() > vaultBefore, `…the goblins were paid off the top of the estate (vault +${vault() - vaultBefore})`);
    ok(dv.disabled === 0 && dv.generation >= 1, "…the next generation stands up, owing nobody");
    ok(world() === worldBeforeGrave, `…and settling a dead man's debt mints nothing: it MOVES to the vault or is written off (${world() - worldBeforeGrave})`);
  }

  // =========================================================================
  // ROUND TWO (Josh, Sep 2026): the shelf, settling for a friend, the bail
  // pot (the TENTH escrow), the plea, and the public mark.
  //
  // From here the conserved sum grows a term: wallets + vault + THE POT. A
  // chip toward somebody's bail leaves a wallet and sits in bail_pot until it
  // pays the goblins or goes home — so `worldE` is what must hold constant.
  // =========================================================================
  await mint(aliceId, 60_000); // she paid a bail above; round two needs a wallet
  const potSum = () => q1("SELECT COALESCE(SUM(amount),0) AS t FROM bail_pot").t;
  const worldE = () => wallets() + vault() + potSum();
  const owns = (id, code) => q1("SELECT 1 AS o FROM user_emoji WHERE userId = ? AND code = ?", id, code)?.o === 1;
  const hasBadge = (id, ach) => q1("SELECT 1 AS o FROM user_achievements WHERE userId = ? AND achId = ?", id, ach)?.o === 1;
  const statOf = (id, key) => q1("SELECT value FROM user_stats WHERE userId = ? AND key = ?", id, key)?.value ?? 0;

  // ---- THE REPO SHELF ----------------------------------------------------------
  {
    // Bob's stage-3 repossession, carol's sealing and dave's sealing all seized
    // emoji above. NONE of it was destroyed: it is on the shelf.
    const stock = q1("SELECT COUNT(*) AS c FROM goblin_stock").c;
    ok(stock > 0, `repossessed emoji go on the shelf, not into the void (${stock} on it)`);
    const orphan = q1(
      "SELECT COUNT(*) AS c FROM goblin_stock s JOIN user_emoji ue ON ue.userId = s.fromUserId AND ue.code = s.code",
    ).c;
    ok(orphan === 0, "…and nothing on the shelf is still in the hands it was taken from");
    const bad = q1(
      `SELECT COUNT(*) AS c FROM goblin_stock s JOIN emoji e ON e.code = s.code
        WHERE s.price <> ${SHELF_MULTIPLE} * (CASE e.tier WHEN 'common' THEN ${SELL_PRICES.common} WHEN 'rare' THEN ${SELL_PRICES.rare} WHEN 'legendary' THEN ${SELL_PRICES.legendary} ELSE 0 END)`,
    ).c;
    ok(bad === 0, "…every item priced at exactly 5x the Trader's price for its tier");

    const kiosk = await api("GET", "/api/lender", { token: alice });
    ok(kiosk.status === 200 && kiosk.body.shelf.length === Math.min(stock, 60), "the kiosk shows the shelf");
    ok(kiosk.body.shelf.every((s) => s.from && typeof s.from.displayName === "string" && !("coins" in s.from)),
      "…each item naming who it was taken from, as a PublicUser (no wallet on the wire)");
    ok(typeof kiosk.body.books?.lent === "number" && kiosk.body.books.lent >= 10_000, "…and the goblins' lifetime books ride along");

    // Alice buys something she doesn't own.
    const item = kiosk.body.shelf.find((s) => !owns(aliceId, s.code));
    ok(!!item, "there is something on the shelf alice doesn't own");
    const vBefore = vault(), wBefore = worldE(), aBefore = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    const buy = await api("POST", `/api/lender/shelf/${item.id}/buy`, { token: alice });
    ok(buy.status === 200 && buy.body.code === item.code && buy.body.price === item.price, `alice buys ${item.code} for ${item.price}`);
    ok(q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === aBefore - item.price, "…her wallet is down exactly the price");
    ok(vault() === vBefore + item.price, "…and the silver went INTO THE VAULT — the shelf refills the bank");
    ok(worldE() === wBefore, "…nothing minted, nothing burned");
    ok(owns(aliceId, item.code), "…the emoji is hers now");
    ok(q1("SELECT COUNT(*) AS c FROM goblin_stock WHERE id = ?", item.id).c === 0, "…and off the shelf");
    const again = await api("POST", `/api/lender/shelf/${item.id}/buy`, { token: alice });
    ok(again.status === 404 && again.body.error === "not_on_shelf", "buying it twice: sold, somebody was quicker");

    // A code she already owns: refused before the wallet.
    {
      const d = db(false);
      d.prepare("INSERT INTO goblin_stock (code, fromUserId, seizedAt, price) VALUES (?, ?, ?, ?)").run(item.code, bobId, Date.now(), 50);
      d.close();
      const dupId = q1("SELECT id FROM goblin_stock WHERE code = ? ORDER BY id DESC", item.code).id;
      const w = worldE();
      const dup = await api("POST", `/api/lender/shelf/${dupId}/buy`, { token: alice });
      ok(dup.status === 409 && dup.body.error === "already_owned", "a code you already own is refused — ownership is binary");
      ok(worldE() === w && q1("SELECT COUNT(*) AS c FROM goblin_stock WHERE id = ?", dupId).c === 1, "…free, and the item stays on the shelf");
      const d2 = db(false);
      d2.prepare("DELETE FROM goblin_stock WHERE id = ?").run(dupId);
      d2.close();
    }

    // BOUGHT BACK: bob recovers one of his own, and gets the secret badge for it.
    const mine = q1("SELECT id, code, price FROM goblin_stock WHERE fromUserId = ? ORDER BY id LIMIT 1", bobId);
    ok(!!mine && !owns(bobId, mine.code), "bob's own repossessed emoji is on the shelf and not in his hands");
    const back = await api("POST", `/api/lender/shelf/${mine.id}/buy`, { token: bob });
    ok(back.status === 200 && back.body.wasYours === true, "bob buys it back at ten times what it was credited against his debt");
    await sleep(300);
    ok(hasBadge(bobId, "bought-back"), "…and earns BOUGHT BACK (secret) for the humiliation");
    const anonBuy = await fetch(BASE + `/api/lender/shelf/1/buy`, { method: "POST" });
    ok(anonBuy.status === 401, "a stranger can't buy off the shelf");
  }

  // ---- SETTLE FOR A FRIEND -----------------------------------------------------
  {
    // Bob is out on bail, MARKED, still owing. Alice pays toward it.
    const before = loanRow(bobId);
    ok(!!before && before.missed === 1, "bob is marked and still in debt");
    const aBefore = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    const bBefore = q1("SELECT coins FROM users WHERE id = ?", bobId).coins;
    const w = worldE();
    const gift = await api("POST", `/api/lender/pay/${bobId}`, { token: alice, body: { amount: 1_000 } });
    ok(gift.status === 200 && gift.body.cleared === false, "alice pays 1,000 against bob's loan");
    ok(q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === aBefore - 1_000, "…from HER wallet");
    ok(q1("SELECT coins FROM users WHERE id = ?", bobId).coins === bBefore, "…bob's wallet untouched");
    ok(loanRow(bobId).principal === before.principal - 1_000, "…and bob's principal is down exactly that (today's interest was already stamped by the bail)");
    ok(worldE() === w, "…moved to the vault, nothing minted");
    ok(q1("SELECT note FROM loan_events WHERE userId = ? AND kind = 'gift' ORDER BY id DESC", bobId)?.note === String(aliceId),
      "…and bob's file records who paid");
    const selfGift = await api("POST", `/api/lender/pay/${aliceId}`, { token: alice, body: { amount: 10 } });
    ok(selfGift.status === 400 && selfGift.body.error === "self_gift", "paying yourself is called paying — refused");
    const noLoan = await api("POST", `/api/lender/pay/${carolId}`, { token: alice, body: { amount: 10 } });
    ok(noLoan.status === 404 && noLoan.body.error === "no_loan", "a friend with no loan has nothing to settle");
    const garbage = await api("POST", `/api/lender/pay/${bobId}`, { token: alice, body: { amount: "lots" } });
    ok(garbage.status === 400, "garbage amounts refused");

    // Oct 2026 review. THE SERVICE KEY pays tonight's interest: it used to go
    // on the principal (the visit had stamped today), leave the mark on, and
    // thin the purse the visit would draw from. And NOBODY WHO OWES THE
    // GOBLINS pays somebody else's debt — the wallet's rule.
    const aLoan = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 1_000 } });
    ok(aLoan.status === 200, "alice takes a small loan of her own");
    const lr = loanRow(aliceId);
    const tonight = Math.floor(lr.principal * lr.rate);
    const v0 = vault(), w0 = worldE();
    const svc = await api("POST", "/api/lender/pay", { token: alice, body: { amount: tonight, service: true } });
    const lr2 = loanRow(aliceId);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    ok(svc.status === 200 && lr2.principal === lr.principal && lr2.missed === 0 && lr2.lastDay === tomorrow,
      `SERVICE pays tonight's interest: principal untouched, current, and tonight's visit will pass (${lr2.principal}, ${lr2.lastDay})`);
    ok(vault() === v0 + tonight && worldE() === w0, "…the interest went to the vault, nothing minted");
    const plain = await api("POST", "/api/lender/pay", { token: alice, body: { amount: tonight } });
    ok(plain.status === 200 && loanRow(aliceId).principal === lr.principal - tonight, "…while an ordinary payment is still pure principal");
    const owesToo = await api("POST", `/api/lender/pay/${aliceId}`, { token: bob, body: { amount: 10 } });
    ok(owesToo.status === 403 && owesToo.body.error === "owes_goblins", `a borrower can't pay somebody else's debt (${owesToo.status} ${owesToo.body.error})`);
    const clearA = await api("POST", "/api/lender/pay", { token: alice, body: { amount: 999_999 } });
    ok(clearA.status === 200 && clearA.body.cleared === true, "…and alice clears her own");
  }

  // ---- THE BAIL POT ------------------------------------------------------------
  const jailNow = (id, freshMs = 48 * 3_600_000) => {
    const d = db(false);
    const now = Date.now();
    d.prepare("UPDATE users SET disabled = 1, jailedAt = ?, jailSealsAt = ?, cellPlea = NULL WHERE id = ?").run(now, now + freshMs, id);
    d.close();
  };
  let erinId = 0, frankId = 0; // hoisted: the mark section reads them
  {
    const erin = await register("erin", pw);
    erinId = await idOf(erin);
    await mint(erinId, 4_000);
    await api("POST", "/api/lender/borrow", { token: erin, body: { amount: 10_000 } });
    {
      const d = db(false);
      d.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(erinId);
      d.close();
    }
    jailNow(erinId);
    const cells = (await api("GET", "/api/lender", { token: alice })).body.prisoners;
    const cell = cells.find((p) => p.userId === erinId);
    ok(!!cell && cell.pot === 0 && cell.bail === bailPrice(cell.debt), "erin is in the cells with an empty pot");
    const price = cell.bail;

    // The cell has its own prices: a friend cannot pay the debt down from outside.
    const sneak = await api("POST", `/api/lender/pay/${erinId}`, { token: alice, body: { amount: 1_000 } });
    ok(sneak.status === 409 && sneak.body.error === "in_custody",
      "a jailed debtor's loan can't be paid from outside — that would open the cell for 1.0x instead of bail's 1.5x");

    // Chip one: escrowed, not paid.
    const aliceBails0 = statOf(aliceId, "bails_paid");
    await mint(daveId, 40_000); // dave carries the bail below; minted before the baseline
    const w0 = worldE(), v0 = vault(), a0 = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    const chip1 = await api("POST", `/api/lender/pot/${erinId}`, { token: alice, body: { amount: 1_000 } });
    ok(chip1.status === 200 && chip1.body.released === false && chip1.body.pot === 1_000, "alice chips 1,000 into erin's pot");
    ok(q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === a0 - 1_000, "…out of her wallet");
    ok(potSum() === 1_000 && vault() === v0, "…into ESCROW — the goblins have not been paid a coin yet");
    ok(worldE() === w0, "…and the three-term world holds");
    {
      const eco = await api("GET", "/api/admin/economy", { token: admin });
      const potRow = eco.body.now.escrows?.find((e) => e.name === "bail pot");
      ok(potRow && potRow.total === 1_000, "the economy audit counts the pot as an escrow (the tenth)");
    }
    const kiosk2 = (await api("GET", "/api/lender", { token: bob })).body.prisoners.find((p) => p.userId === erinId);
    ok(kiosk2.pot === 1_000 && kiosk2.contributors.length === 1 && kiosk2.contributors[0].userId === aliceId,
      "the kiosk shows the pot and who chipped");
    const selfChip = await api("POST", `/api/lender/pot/${erinId}`, { token: erin });
    ok(selfChip.status === 401, "a prisoner has no wallet to chip with (no session for it)");
    const ownPot = await api("POST", `/api/lender/pot/${aliceId}`, { token: alice, body: { amount: 5 } });
    ok(ownPot.status === 400 && ownPot.body.error === "self_bail", "…and nobody chips into their own pot (the route's own guard)");

    // NOBODY WHO OWES THE GOBLINS PAYS INTO A POT (Oct 2026 review — the
    // wallet's rule): bob, out on bail and still owing, is refused a chip.
    const owing = await api("POST", `/api/lender/pot/${erinId}`, { token: bob, body: { amount: 100 } });
    ok(owing.status === 403 && owing.body.error === "owes_goblins", `a debtor can't chip borrowed silver into somebody's bail (${owing.status} ${owing.body.error})`);
    // Dave — reborn a generation on, owing nobody — carries the rest (minted
    // his silver before the block's baseline, above).
    // Chip two OVERSHOOTS: clamped to the remainder, the pot clears, the door opens.
    const remaining = price - 1_000;
    const b0 = q1("SELECT coins FROM users WHERE id = ?", daveId).coins;
    const chip2 = await api("POST", `/api/lender/pot/${erinId}`, { token: daveTok, body: { amount: remaining + 5_000 } });
    ok(chip2.status === 200 && chip2.body.released === true && chip2.body.took === remaining,
      `dave chips more than needed: exactly ${remaining} taken, the pot clears`);
    ok(q1("SELECT coins FROM users WHERE id = ?", daveId).coins === b0 - remaining, "…his wallet down only the remainder");
    ok(vault() === v0 + price, "…the WHOLE pot moves to the vault in one go");
    ok(potSum() === 0, "…and the escrow rows are gone");
    ok(worldE() === w0, "…world constant across the fill");
    const freed = q1("SELECT jailedAt, disabled FROM users WHERE id = ?", erinId);
    ok(freed.jailedAt === null && freed.disabled === 0, "erin walks");
    ok(loanRow(erinId)?.missed === 1, "…still owing, reset to MARKED, exactly like a single-payer bail");
    await sleep(300);
    // alice chipped 1,000 of 18,000 — under a tenth — so the Bondsmen board
    // does NOT credit her; dave covered the rest and is. (A 1-silver dripper
    // farming the gold badge was a review finding.)
    ok(statOf(aliceId, "bails_paid") === aliceBails0, "…a chip under a tenth of the price is not 'a bail paid'");
    ok(statOf(daveId, "bails_paid") >= 1, "…the contributor who carried it is credited on the boards");
    ok(hasBadge(erinId, "walked-out"), "…and erin earns WALKED OUT (secret)");

    // REFUND PATH ONE: a single payer beats the pot to the door.
    jailNow(erinId);
    const w1 = worldE();
    const a1 = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    await api("POST", `/api/lender/pot/${erinId}`, { token: alice, body: { amount: 500 } });
    ok(potSum() === 500, "alice has 500 in the pot");
    const solo = await api("POST", `/api/lender/bail/${erinId}`, { token: daveTok });
    ok(solo.status === 200, "dave pays the whole bail himself");
    ok(potSum() === 0 && q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === a1, "…and alice's 500 comes straight home");
    ok(worldE() === w1, "…world constant across a refund");

    // REFUND PATH TWO: the cell seals with a half-full pot.
    jailNow(erinId, 2_500);
    const a2 = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    const w2 = worldE();
    await api("POST", `/api/lender/pot/${erinId}`, { token: alice, body: { amount: 700 } });
    ok(potSum() === 700, "alice has 700 in a pot with a cell about to seal");
    const t0 = Date.now();
    while (Date.now() - t0 < 12_000 && q1("SELECT jailedAt FROM users WHERE id = ?", erinId).jailedAt !== null) await sleep(80);
    ok(q1("SELECT jailedAt FROM users WHERE id = ?", erinId).jailedAt === null, "the cell sealed");
    ok(potSum() === 0 && q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === a2,
      "…and the pot went home BEFORE the estate was touched — the goblins were paid from the estate, never the pot");
    ok(worldE() === w2, "…world constant across a sealing with a pot outstanding");

    // REFUND PATH THREE: a CONTRIBUTOR is scrubbed — their chip comes back before the burn.
    // (The register limiter is 5/hour/IP — dave, reborn a generation older,
    // plays frank; carol plays gus.)
    const frank = daveTok;
    frankId = daveId;
    await mint(frankId, 4_000);
    await api("POST", "/api/lender/borrow", { token: frank, body: { amount: 10_000 } });
    jailNow(frankId);
    const gus = carol;
    const gusId = carolId;
    await mint(gusId, 1_000);
    await api("POST", `/api/lender/pot/${frankId}`, { token: gus, body: { amount: 300 } });
    ok(potSum() === 300, "gus has 300 in frank's pot");
    const scrub = await api("POST", `/api/admin/users/${gusId}/delete`, { token: admin });
    ok(scrub.status === 200, "…and then gus is scrubbed");
    ok(potSum() === 0, "…his chip left the pot with him (the dead-escrow sweep covers bail_pot)");
    ok((await api("GET", "/api/lender", { token: alice })).body.prisoners.find((p) => p.userId === frankId)?.pot === 0,
      "…frank's pot reads empty again");

    // ---- THE PLEA ----------------------------------------------------------
    const frankJail = await api("POST", "/api/login", { body: { username: "dave", password: pw } });
    ok(frankJail.body?.jail === true, "frank (dave) logs into his cell");
    const jt = frankJail.body.token;
    const plea = await api("POST", "/api/cell/plea", { token: jt, body: { text: "  bring\n 15k,  I'll pay you BACK  " } });
    ok(plea.status === 200 && plea.body.plea === "bring 15k, I'll pay you BACK", "a prisoner scratches one line on the card");
    const cellView = await api("GET", "/api/cell", { token: jt });
    ok(cellView.body.plea === "bring 15k, I'll pay you BACK" && cellView.body.pot === 0 && Array.isArray(cellView.body.contributors),
      "…the cell screen shows it, with the pot");
    const seen = (await api("GET", "/api/lender", { token: alice })).body.prisoners.find((p) => p.userId === frankId);
    ok(seen?.plea === "bring 15k, I'll pay you BACK", "…and the kiosk shows it on his card");
    const long = await api("POST", "/api/cell/plea", { token: jt, body: { text: "y".repeat(400) } });
    ok(long.body.plea.length === MAX_PLEA, `…clamped to ${MAX_PLEA}`);
    const cleared = await api("POST", "/api/cell/plea", { token: jt, body: { text: "   " } });
    ok(cleared.body.plea === null, "…and blank clears it");
    const living = await api("POST", "/api/cell/plea", { token: alice, body: { text: "hi" } });
    ok(living.status === 401, "a free player can't write on a cell card");
    await api("POST", "/api/cell/plea", { token: jt, body: { text: "still here" } });
    const bailF = await api("POST", `/api/lender/bail/${frankId}`, { token: alice });
    ok(bailF.status === 200 && q1("SELECT cellPlea FROM users WHERE id = ?", frankId).cellPlea === null,
      "a release wipes the plea off the card");
  }

  // ---- THE MARK, over the real wire --------------------------------------------
  {
    // bob (MARKED), erin (reborn — no loan), frank (out on bail — MARKED).
    const sock = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(alice)}`);
      const frames = [];
      ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
      ws.on("open", () => resolve({ ws, frames }));
      ws.on("error", reject);
    });
    const waitFor = async (type, ms = 3000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const f = [...sock.frames].reverse().find((x) => x.type === type);
        if (f) return f;
        await sleep(25);
      }
      return null;
    };
    const ready = await waitFor("ready");
    ok(Array.isArray(ready?.debtors), "the ready frame carries the debtor list");
    const stageOf = (list, id) => list.find((d) => d.userId === id)?.stage ?? 0;
    ok(stageOf(ready.debtors, bobId) === 1 && stageOf(ready.debtors, frankId) === 1, "…bob and frank read MARKED (stage 1)");
    ok(stageOf(ready.debtors, erinId) === 0 && stageOf(ready.debtors, aliceId) === 0, "…and nobody current or reborn is listed");
    // A change moves the list: bob clears his loan.
    sock.frames.splice(0);
    const clear = await api("POST", "/api/lender/pay", { token: bob, body: { amount: 9_999_999 } });
    ok(clear.status === 200 && clear.body.cleared === true, "bob clears his loan");
    const change = await waitFor("lender.change");
    ok(!!change && stageOf(change.debtors, bobId) === 0 && stageOf(change.debtors, frankId) === 1,
      "…and every socket hears the mark come off him — frank's stays");
    // A jailing puts somebody on at stage 5.
    sock.frames.splice(0);
    jailNow(frankId);
    // The sweep doesn't know about a DB-injected cell; the next kiosk action
    // that emits lender.change carries it. Chip a coin in.
    await api("POST", `/api/lender/pot/${frankId}`, { token: alice, body: { amount: 1 } });
    const jailedFrame = await waitFor("lender.change");
    ok(!!jailedFrame && stageOf(jailedFrame.debtors, frankId) === 5, "a prisoner reads stage 5 — IN THE CELLS");
    sock.ws.close();
  }

  // ---- A SCRUBBED PRISONER STOPS BEING A CUSTOMER (review finding) -------------
  // frank (dave) is in the cell with alice's 1 silver in the pot. The first cut
  // of scrubUser left the loan row and the jail marks behind: a "deleted user"
  // sat in the cells forever, chip-able, and the nightly visit walked deleted
  // debtors into ghost cells.
  {
    await api("POST", `/api/lender/pot/${frankId}`, { token: alice, body: { amount: 199 } });
    ok(potSum() === 200, "alice has 200 in the doomed prisoner's pot");
    {
      const d = db(false);
      d.prepare("UPDATE users SET coins = 1000 WHERE id = ?").run(frankId);
      d.close();
    }
    const a0 = q1("SELECT coins FROM users WHERE id = ?", aliceId).coins;
    const v0 = vault();
    const debt0 = (() => { const l = loanRow(frankId); return l.principal + interestFor(l.principal, l.rate); })();
    const scrub = await api("POST", `/api/admin/users/${frankId}/delete`, { token: admin });
    ok(scrub.status === 200, "the admin scrubs the prisoner");
    ok(potSum() === 0 && q1("SELECT coins FROM users WHERE id = ?", aliceId).coins === a0 + 200,
      "…alice's 200 came home before the burn");
    ok(loanRow(frankId) === null, "…the loan row is gone — a deleted account owes nobody");
    ok(vault() === v0 + Math.min(1000, debt0), `…after the goblins took the cash off the top (vault +${vault() - v0})`);
    const u = q1("SELECT jailedAt, jailSealsAt, cellPlea, deletedAt FROM users WHERE id = ?", frankId);
    ok(u.jailedAt === null && u.jailSealsAt === null && u.cellPlea === null && u.deletedAt !== null,
      "…the cell marks and the plea are cleared with the account");
    const kiosk = (await api("GET", "/api/lender", { token: alice })).body;
    ok(!kiosk.prisoners.some((p) => p.userId === frankId) && !kiosk.marked.some((m) => m.userId === frankId),
      "…and no ghost in the cells or among the marked");
    const chipGhost = await api("POST", `/api/lender/pot/${frankId}`, { token: alice, body: { amount: 5 } });
    ok(chipGhost.status === 404 && chipGhost.body.error === "not_jailed", "…nobody can chip silver at a deleted user");
    const sock = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(alice)}`);
      const frames = [];
      ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
      ws.on("open", () => resolve({ ws, frames }));
      ws.on("error", reject);
    });
    const t0 = Date.now();
    let ready = null;
    while (Date.now() - t0 < 3000 && !(ready = sock.frames.find((f) => f.type === "ready"))) await sleep(25);
    ok(!!ready && !ready.debtors.some((d) => d.userId === frankId), "…and the mark is off every roster");
    sock.ws.close();
  }

  // ---- THE VAULT IS FINITE ---------------------------------------------------
  {
    const d = db(false);
    d.prepare("UPDATE goblin_vault SET silver = 500 WHERE id = 1").run();
    d.close();
    await mint(aliceId, 500_000);
    const dry = await api("POST", "/api/lender/borrow", { token: alice, body: { amount: 100_000 } });
    ok(dry.status === 503 && dry.body.error === "vault_dry",
      "lend the bank dry and it simply says no — a run on the vault is a legal state, not a crash");
  }

};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} lender asserts passed`);
    process.exit(bad ? 1 : 0);
  });
