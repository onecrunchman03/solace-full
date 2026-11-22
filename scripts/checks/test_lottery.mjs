// THE NIGHTLY DRAW — one ticket each, and a night needs two players.
//
// Josh, Aug 2026: "change the lottery to one ticket buy per person only and
// only start the lottery if 2 or more people buy a ticket." Both rules move
// real silver, so this drives the store directly and checks the coins on
// every path — especially the VOID night, which is new: fewer than two
// players means nobody draws, the stake goes back, and the rake boost rolls
// on instead of burning.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { TICKET_PRICE, MAX_TICKETS_PER_DAY, MIN_PLAYERS } = require(path.join(ROOT, "dist", "lottery.js"));

const DB = path.join(ROOT, "data", "lottery-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
let seq = 0;
const mkUser = (coins) => {
  const u = store.createUser({
    username: `punter${++seq}`, passwordHash: "x", displayName: `Punter ${seq}`, isAdmin: false,
  });
  store.addCoins(u.id, coins);
  return u.id;
};
/** Everything the house is holding for a day, so conservation can be checked. */
const totalCoins = (ids) => ids.reduce((t, id) => t + store.getCoins(id), 0);

ok(MAX_TICKETS_PER_DAY === 1, `the cap is one ticket a night (${MAX_TICKETS_PER_DAY})`);
ok(MIN_PLAYERS === 2, `a draw needs ${MIN_PLAYERS} players`);

// ---- 1. ONE EACH ----------------------------------------------------------
{
  const a = mkUser(1000);
  const first = store.lotteryBuy(a, "2026-08-01", 1, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  ok(first.ok && first.mine === 1, "the first ticket sells");
  ok(store.getCoins(a) === 1000 - TICKET_PRICE, `and costs exactly ${TICKET_PRICE} (${store.getCoins(a)})`);
  const second = store.lotteryBuy(a, "2026-08-01", 1, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  ok(!second.ok && second.error === "ticket_cap", `a second is refused (${second.error})`);
  ok(store.getCoins(a) === 1000 - TICKET_PRICE, "and the refusal costs nothing");
  const bulk = store.lotteryBuy(mkUser(1000), "2026-08-01", 5, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  ok(!bulk.ok && bulk.error === "ticket_cap", "nor can anyone buy five at once");
}

// ---- 2. A VOID NIGHT: one player, nobody draws ----------------------------
{
  const day = "2026-08-02";
  const lonely = mkUser(500);
  store.lotteryBuy(lonely, day, 1, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  store.lotteryBoost(day, 300); // the floor's rakes landed here
  ok(store.getCoins(lonely) === 500 - TICKET_PRICE, "the lone punter paid for their ticket");

  const r = store.lotteryDraw(day, TICKET_PRICE, MIN_PLAYERS, "2026-08-03");
  ok(r === null, "one player is not a draw");
  ok(store.getCoins(lonely) === 500, `their stake came back in full (${store.getCoins(lonely)})`);
  ok(store.lotteryBoostFor(day) === 0, "the void night's boost is not left behind");
  ok(store.lotteryBoostFor("2026-08-03") === 300, `and it rolled to the next night (${store.lotteryBoostFor("2026-08-03")})`);

  // Idempotency: the sweep runs every 60s and on boot. It must not pay twice.
  const again = store.lotteryDraw(day, TICKET_PRICE, MIN_PLAYERS, "2026-08-03");
  ok(again === null, "a second sweep still draws nothing");
  ok(store.getCoins(lonely) === 500, `and does NOT refund twice (${store.getCoins(lonely)})`);
  ok(store.lotteryBoostFor("2026-08-03") === 300, "nor roll the boost twice");
  const last = store.lotteryLastDraw();
  ok(last && last.day === day && last.winnerId === null && last.paid === 0,
    "the void night is recorded with no winner and nothing paid");
}

// ---- 3. TWO PLAYERS: a real draw --------------------------------------------
{
  const day = "2026-08-04";
  const a = mkUser(500);
  const b = mkUser(500);
  store.lotteryBuy(a, day, 1, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  store.lotteryBuy(b, day, 1, TICKET_PRICE, MAX_TICKETS_PER_DAY);
  store.lotteryBoost(day, 150);
  const before = totalCoins([a, b]);
  const expectPot = 2 * TICKET_PRICE + 150;

  const r = store.lotteryDraw(day, TICKET_PRICE, MIN_PLAYERS, day);
  ok(r !== null, "two players make a draw");
  ok(r.pot === expectPot, `the pot is both stakes plus the boost (${r.pot} vs ${expectPot})`);
  ok(r.paid === Math.floor(expectPot * 0.9), `the winner takes 90% (${r.paid})`);
  ok(r.winnerId === a || r.winnerId === b, "and the winner is one of the two");
  ok(totalCoins([a, b]) === before + r.paid, "exactly the paid amount entered the players' wallets");
  ok(store.lotteryBoostFor(day) === 0, "the boost was consumed by the draw");

  // CONSERVATION over the whole night: everyone started with 500, the two
  // stakes and the boost went into the pot, 90% came back, the rest burned.
  const burned = expectPot - r.paid;
  ok(totalCoins([a, b]) === 1000 - 2 * TICKET_PRICE + r.paid,
    `wallets reconcile (${totalCoins([a, b])} = 1000 − stakes + payout)`);
  ok(burned === expectPot - r.paid && burned > 0, `and the house burned the remainder (${burned})`);

  const again = store.lotteryDraw(day, TICKET_PRICE, MIN_PLAYERS, day);
  ok(again === null, "a drawn night cannot be drawn again");
  ok(totalCoins([a, b]) === 1000 - 2 * TICKET_PRICE + r.paid, "…and pays nothing the second time");
}

// ---- 4. An empty night is untouched ---------------------------------------
{
  const r = store.lotteryDraw("2026-08-05", TICKET_PRICE, MIN_PLAYERS, "2026-08-06");
  ok(r === null, "a night nobody entered draws nothing");
  ok(store.lotteryLastDraw().day === "2026-08-04", "and is not even recorded — there was nothing to void");
}

console.log(`\n${n - bad}/${n} passed`);
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
