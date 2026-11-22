// HOLD'EM — the engine's money rules, in-process against a real Store, with
// the clocks dialled down and the deck stacked where a hand needs it.
//
// Run:  npm run build && node scripts/checks/test_holdem.mjs
//
// Written in the Oct 2026 whole-app review, which found four money faults in
// an engine no standing harness drove (the original lived in a scratchpad):
//   · a small blind who goes ALL-IN posting the blind froze the table: the
//     action went straight to an all-in seat, which can't act, and the
//     clock's auto-check was refused — nothing ever moved again
//   · a fold win RAKED THE WINNER'S UNCALLED BET, so winning a hand could
//     leave you down silver
//   · a player who DIED mid-hand had their committed chips refunded by the
//     death sweep AND paid to the winner as dead money — a mint
//   (the fourth — a prisoner's seat left standing — is the jailing hook in
//    index.ts, covered by stand-up on death below: both use leaveAll)
process.env.HOLDEM_TURN_MS = "400";
process.env.HOLDEM_STREET_MS = "20";
process.env.HOLDEM_SETTLE_MS = "60";
process.env.HOLDEM_START_MS = "40";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const DB = path.join(ROOT, "data", "holdem-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

const { Store } = require(dist("db/store.js"));
const poker = require(dist("poker-eval.js"));
const { createHoldem } = require(dist("holdem.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = new Store(DB);
const bus = { emit: () => {}, on: () => {} };
const holdem = createHoldem(store, bus);
const tables = holdem.tables; // private in TS, plain at runtime
const copper = tables.find((t) => t.def.id === 1);

let uid = 0;
const mk = (coins) => {
  const u = store.createUser({ username: `hold${++uid}`, displayName: `Hold ${uid}`, passwordHash: "x" });
  store.addCoins(u.id, coins);
  return store.getUserById(u.id);
};
const row = (id) => store.db.prepare("SELECT stack FROM holdem_stacks WHERE tableId = 1 AND userId = ?").get(id)?.stack ?? null;
const coins = (id) => store.getCoins(id);
const rake = () => store.db.prepare("SELECT COALESCE(SUM(amount),0) v FROM lottery_boosts").get().v;
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(15); } return fn(); };
const clearTable = () => { for (let i = 0; i < copper.seats.length; i++) { const s = copper.seats[i]; if (s) holdem.leaveAll(s.userId); } };

const run = async () => {
  // ---- 1. A SMALL BLIND ALL-IN ON THE POST ------------------------------------
  console.log("-- a blind that puts a player all-in doesn't freeze the table");
  {
    const a = mk(500), b = mk(500);
    holdem.sit(a, 1, 0, 80);
    holdem.sit(b, 1, 1, 80);
    // Before the first hand: leave A one chip, so posting the small blind
    // (heads-up: the button, seat 0) puts A all-in.
    copper.seats[0].stack = 1;
    const ok1 = await until(() => copper.handId >= 1);
    const firstHand = copper.handId;
    const moved = await until(() => copper.handId > firstHand || copper.phase === "settle" || copper.phase === "showdown", 5000);
    ok(ok1 && moved, `the hand plays out (handId ${copper.handId}, phase ${copper.phase}) — it used to wait on an all-in seat forever`);
    clearTable();
    await sleep(100);
  }

  // ---- 2. A FOLD WIN DOESN'T RAKE THE UNCALLED BET ------------------------------
  console.log("-- a fold win rakes only the contested pot");
  {
    const a = mk(500), b = mk(500);
    holdem.sit(a, 1, 0, 80);
    holdem.sit(b, 1, 1, 80);
    await until(() => copper.phase === "preflop");
    const seatOf = (u) => copper.seats.findIndex((s) => s?.userId === u.id);
    const turn = () => copper.seats[copper.current]?.userId;
    const act = (u, kind, amount = null) => holdem.action(u, 1, kind, amount);
    const who = (id) => (id === a.id ? a : b);
    // Preflop: whoever is to act calls / checks around to the flop.
    let guard = 0;
    while (copper.phase === "preflop" && guard++ < 6) {
      const u = who(turn());
      const s = copper.seats[seatOf(u)];
      act(u, s.bet < copper.currentBet ? "call" : "check");
    }
    await until(() => copper.phase === "flop");
    const rake0 = rake();
    const bettor = who(turn());
    const other = bettor.id === a.id ? b : a;
    const before = row(bettor.id);
    act(bettor, "raise", 50);
    act(other, "fold");
    await until(() => row(bettor.id) !== before);
    // The contested pot is the 4 both put in preflop: 5% of 4 floors to 0.
    ok(row(bettor.id) === before + 2 && rake() === rake0,
      `the winner of a 4-silver pot gains its other half, unraked (${before} → ${row(bettor.id)}, rake +${rake() - rake0}) — it used to rake his own uncalled 50`);
    clearTable();
    await sleep(100);
  }

  // ---- 3. A DEATH MID-HAND MINTS NOTHING ----------------------------------------
  console.log("-- a player who dies mid-hand: no chip paid twice");
  {
    const a = mk(500), b = mk(500);
    holdem.sit(a, 1, 0, 80);
    holdem.sit(b, 1, 1, 80);
    await until(() => copper.phase === "preflop");
    const turnUser = () => (copper.seats[copper.current]?.userId === a.id ? a : b);
    const raiser = turnUser();
    const victimOther = raiser.id === a.id ? b : a;
    holdem.action(raiser, 1, "raise", 40);
    const world = () => coins(a.id) + coins(b.id) + (row(a.id) ?? 0) + (row(b.id) ?? 0) + rake();
    const w0 = world();
    // The raiser dies at the Wheel: the sweep refunds his whole row (the 40
    // committed included), then the tables stand him up (gameExits).
    store.killUser(raiser.id);
    holdem.leaveAll(raiser.id);
    await until(() => copper.phase === "settle" || copper.phase === "waiting");
    await sleep(50);
    ok(world() === w0, `the world's silver is unchanged across the death (${w0} → ${world()}) — the committed 40 used to be refunded AND paid to the winner`);
    ok(row(victimOther.id) === 80, `…the survivor gets his own blind back, nothing more (${row(victimOther.id)})`);
  }

  // ---- 4. EVALUATOR SANITY (the wheel straight and a split) ----------------------
  console.log("-- the evaluator");
  {
    const c = (r, s) => ({ r, s });
    const wheel = poker.best7([c(14, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0), c(9, 1), c(12, 2)]);
    const sixHigh = poker.best7([c(2, 0), c(3, 1), c(4, 2), c(5, 3), c(6, 0), c(9, 1), c(12, 2)]);
    ok(poker.categoryName(wheel) === poker.categoryName(sixHigh) && sixHigh > wheel, "A-2-3-4-5 is a straight, and the lowest one");
  }

  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
