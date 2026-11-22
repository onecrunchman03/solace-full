// THE SPENDING — chips and free pulls leaving the world (E3b, Aug 2026).
//
// Run:  npm run build && node scripts/checks/test_escape_spend.mjs
//
// The mint's counterpart: every path a chip or a free pull can LEAVE by, and
// every path that must never become a converter. In-process against the built
// store (these are store-seam rules; the routes above them are thin):
//   · the chips-first split: chips cover what they can, silver the rest, one
//     txn, refused whole when the silver half is short
//   · the CONVERTER RULE, three ways: an unplayed blackjack refund returns
//     the chips AS CHIPS; a boot-time crash refund does too (both games);
//     and a DEAD player's escrow sweep does too — even a corpse's refund is
//     not an exchange window
//   · settlements pay SILVER (roulette win on a chips-paid bet) — the
//     intended, lossy conversion through the house edge
//   · slots: a FREE PULL is consumed before any charge (loss and win alike),
//     pays real silver on a win, tithes nothing to the lottery, and runs out
//     honestly; then chips carry the cost, then silver
//   · exact conservation across every scenario: silver + chips + escrow is
//     what it should be to the coin

import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = path.join(ROOT, "data", "escape-spend-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

const { Store } = await import("file://" + path.join(ROOT, "dist", "db", "store.js").replace(/\\/g, "/"));
const slots = await import("file://" + path.join(ROOT, "dist", "slots.js").replace(/\\/g, "/"));

const DB = path.join(DATA_DIR, "solace.db");
const s = new Store(DB);
const mk = (name) => s.createUser({ username: name, displayName: name, passwordHash: "x".repeat(60) });
const u = mk("spender");
const raw = () => {
  const d = new DatabaseSync(DB);
  const r = d.prepare("SELECT coins, chips, freePulls FROM users WHERE id = ?").get(u.id);
  const bj = d.prepare("SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(chips),0) c FROM blackjack_bets WHERE userId = ?").get(u.id);
  const ro = d.prepare("SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(chips),0) c FROM roulette_bets WHERE userId = ?").get(u.id);
  d.close();
  return { ...r, bjEsc: bj.a, bjChips: bj.c, roEsc: ro.a, roChips: ro.c };
};

// ---- the split ---------------------------------------------------------------
s.addCoins(u.id, 100);
s.addChips(u.id, 40);
{
  const split = s.spendCoinsChipsFirst(u.id, 60);
  ok(split && split.chips === 40 && split.silver === 20, "60 owed: 40 chips + 20 silver");
  const b = raw();
  ok(b.chips === 0 && b.coins === 80, "…and both balances moved exactly");
  const short = s.spendCoinsChipsFirst(u.id, 200);
  ok(short === null, "a short split is refused whole");
  ok(raw().coins === 80 && raw().chips === 0, "…and refused free");
}

// ---- blackjack: refund returns chips AS chips --------------------------------
{
  s.addChips(u.id, 25);
  const betId = s.bjPlaceBet(u.id, 40, 0); // 25 chips + 15 silver
  ok(betId !== null, "a mixed bet escrows");
  const b1 = raw();
  ok(b1.bjEsc === 40 && b1.bjChips === 25, "…with its chips split recorded on the row");
  ok(b1.coins === 65 && b1.chips === 0, "…and the wallet down the right halves");
  s.bjRefundBet(betId, u.id, 40);
  const b2 = raw();
  ok(b2.chips === 25 && b2.coins === 80, "an unplayed refund returns CHIPS AS CHIPS — not a converter");
  ok(b2.bjEsc === 0, "…and clears the escrow");
}

// ---- blackjack: a WIN pays silver (the intended lossy path) ------------------
{
  const betId = s.bjPlaceBet(u.id, 25, 0); // all 25 chips
  const b1 = raw();
  ok(b1.chips === 0 && b1.bjChips === 25, "an all-chips bet escrows its split");
  s.bjSettleBet(betId, u.id, 50); // stake back + winnings, as the engine pays a win
  const b2 = raw();
  ok(b2.coins === 80 + 50 && b2.chips === 0, "a WON hand pays SILVER — conversion only through the edge");
  ok(b2.bjEsc === 0, "…and the row is gone");
}

// ---- boot-time crash refunds return the split --------------------------------
{
  s.addChips(u.id, 30);
  s.bjPlaceBet(u.id, 20, 0);       // 20 chips
  s.rouletteBet(u.id, "red", null, 30); // 10 chips + 20 silver
  const before = raw();
  ok(before.bjChips === 20 && before.roChips === 10, "two crash-orphans stand, splits recorded");
  const bjN = s.bjRefundOpenBets();
  const roN = s.rouletteRefundOpenBets();
  ok(bjN === 1 && roN === 1, "boot refunds both");
  const after = raw();
  ok(after.chips === 30 && after.coins === before.coins + 20,
    "…each returning chips as chips, silver as silver");
}

// ---- a roulette TAKE-BACK honours the split (Oct 2026 review) ------------------
{
  const t = mk("takeback");
  s.addCoins(t.id, 40);
  s.addChips(t.id, 25);
  const bet = s.rouletteBet(t.id, "red", null, 50); // 25 chips + 25 silver
  s.rouletteRefund([bet.id], t.id);
  const d = new DatabaseSync(DB);
  const r = d.prepare("SELECT coins, chips FROM users WHERE id = ?").get(t.id);
  d.close();
  ok(r.chips === 25 && r.coins === 40, `taking a roulette bet back returns chips AS CHIPS — never a converter (${r.chips} chips, ${r.coins} silver)`);
}

// ---- the dead player's sweep honours the split -------------------------------
{
  const v = mk("victim");
  s.addCoins(v.id, 50);
  s.addChips(v.id, 35);
  s.bjPlaceBet(v.id, 45, 0); // 35 chips + 10 silver
  s.killUser(v.id);
  const d = new DatabaseSync(DB);
  const r = d.prepare("SELECT coins, chips FROM users WHERE id = ?").get(v.id);
  const esc = d.prepare("SELECT COUNT(*) c FROM blackjack_bets WHERE userId = ?").get(v.id).c;
  d.close();
  ok(esc === 0, "death sweeps the escrow row");
  ok(r.chips === 35 && r.coins === 50, "…returning the corpse's chips AS CHIPS, silver as silver");
}

// ---- slots: free pulls, then chips, then silver ------------------------------
{
  const p = mk("puller");
  s.addCoins(p.id, 1000);
  s.erOpenChest(p.id, { kind: "pulls", amount: 3 }, 10);
  s.erOpenChest(p.id, { kind: "chips", amount: 25 }, 10);
  const user = { id: p.id };
  const start = (() => {
    const d = new DatabaseSync(DB);
    const r = d.prepare("SELECT coins, chips, freePulls FROM users WHERE id = ?").get(p.id);
    d.close();
    return r;
  })();
  ok(start.freePulls === 3 && start.chips === 25, "granted 3 free pulls + 25 chips");
  let paidFree = 0, paidChips = 0, paidCoins = 0, paidOut = 0;
  for (let i = 0; i < 12; i++) {
    const out = slots.pull(s, user);
    ok(out.ok === true, `pull ${i + 1} accepted`);
    if (out.paidWith === "free") paidFree++;
    else if (out.paidWith === "chips") paidChips++;
    else paidCoins++;
    if (out.result?.type === "win") paidOut += out.result.payout;
  }
  ok(paidFree === 3, "exactly the three free pulls were free");
  ok(paidChips >= 2 && paidChips <= 3, `chips carried ${paidChips} pulls (25 chips at cost 10 = 2 full + 1 split)`);
  const end = (() => {
    const d = new DatabaseSync(DB);
    const r = d.prepare("SELECT coins, chips, freePulls FROM users WHERE id = ?").get(p.id);
    d.close();
    return r;
  })();
  ok(end.freePulls === 0 && end.chips === 0, "both balances ran out honestly");
  // Conservation: silver spent = (12 - 3 paid pulls' cost) - chips' share, plus winnings back.
  const spentSilver = (12 - 3) * 10 - 25;
  ok(end.coins === 1000 - spentSilver + paidOut,
    `exact conservation: 1000 - ${spentSilver} + ${paidOut} winnings = ${end.coins}`);
}

// ---- the mint ledger + tripwire accounting -----------------------------------
{
  const day = new Date().toISOString().slice(0, 10);
  const m = s.erMintDay(day);
  ok(m.opens === 2 && m.pulls === 3 && m.chips === 25, "the mint ledger recorded both grants in-txn");
  const loot = await import("file://" + path.join(ROOT, "dist", "casino", "escape-loot.js").replace(/\\/g, "/"));
  ok(loot.mintSilverEq(m) === Math.round(25 * 0.95 + 3 * 8.71), "silver-eq accounting matches the doc's rates");
  ok(loot.ER_MINT_TRIPWIRE === 25_000, "the tripwire stands at 25k");
}

s.close();
console.log(`\n${n - bad}/${n} escape spend asserts passed`);
process.exit(bad ? 1 : 0);
