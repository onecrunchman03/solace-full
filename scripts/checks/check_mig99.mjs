// MIGRATION 99 — SILVER REPLACES RESEARCH CREDIT, against a DB rewound to the
// pre-99 shape. The conversion has to be boring in exactly three ways, and
// each of them is a way it could have gone very wrong on prod:
//
//   1. AT PAR. Every ratio inside the backrooms survives and nobody's balance
//      moves, so there is no stealth rebalance and no multiplier to defend.
//   2. PAID OUT OF THE GRANT, not minted. The seed is the ONE mint (the
//      goblin vault's precedent); the conversion itself is conservation-
//      neutral, so the drift check sees a single explainable step.
//   3. THE HOUSE'S RC DOES NOT CONVERT. `POST /api/admin/backrooms/rc` was a
//      playtest lever and prod's admin row held 993,430 of it against a TOTAL
//      money supply of 80,318 — converting it would have minted twelve times
//      every coin in the world. Bots are excluded for the reason they are
//      excluded from every ranking; scrubbed accounts because their holdings
//      were burned on purpose.

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pass = 0;
const fails = [];
const ok = (c, label) => { if (c) { pass++; console.log("  + " + label); } else { fails.push(label); console.log("  x " + label); } };

const dir = mkdtempSync(path.join(tmpdir(), "mig99-"));
const file = path.join(dir, "solace.db");
const { Store } = await import("file://" + path.resolve("dist/db/store.js").replace(/\\/g, "/"));
const { GRANT_SEED } = await import("file://" + path.resolve("dist/backrooms/grant.js").replace(/\\/g, "/"));

{
  const s = new Store(file);
  s.close();
  const db = new DatabaseSync(file);
  // Rewind: drop the migration row AND the state it created, so the rerun is
  // against a genuinely pre-99 database rather than a half-migrated one.
  db.prepare("DELETE FROM _migrations WHERE id = 99").run();
  db.exec("DROP TABLE IF EXISTS async_grant");
  const now = Date.now();
  const mk = (username, coins, opts = {}) =>
    Number(db.prepare(
      `INSERT INTO users (username, displayName, passwordHash, isAdmin, isBot, disabled, locked, createdAt, coins, deletedAt)
       VALUES (?, ?, 'x', ?, ?, ?, 0, ?, ?, ?)`,
    ).run(username, username, opts.admin ? 1 : 0, opts.bot ? 1 : 0, opts.disabled ? 1 : 0, now, coins, opts.deletedAt ?? null).lastInsertRowid);
  const rc = (id, n) =>
    db.prepare("INSERT INTO backrooms_players (userId, rc, lockerSlots) VALUES (?, ?, 20)").run(id, n);

  const surveyor = mk("surveyor", 1000); rc(surveyor, 920);
  const broke = mk("broke", 0); rc(broke, 740);
  // A DEAD-BUT-REVIVABLE account keeps its money (only a scrub is forever).
  const dead = mk("dead", 50, { disabled: true }); rc(dead, 1450);
  // The house: the test-lever hoard that must never become silver.
  const admin = mk("admin", 500, { admin: true }); rc(admin, 993430);
  const bot = mk("sterling", 0, { bot: true }); rc(bot, 5000);
  const scrubbed = mk("deleted-9-abc", 0, { deletedAt: now }); rc(scrubbed, 300);
  const noRow = mk("newcomer", 77); // never opened a locker at all
  db.close();

  const s2 = new Store(file); // migration 99 runs here
  const coins = (id) => s2.db.prepare("SELECT coins FROM users WHERE id = ?").get(id).coins;
  const rcOf = (id) => (s2.db.prepare("SELECT rc FROM backrooms_players WHERE userId = ?").get(id) ?? { rc: null }).rc;
  const grant = () => s2.db.prepare("SELECT silver, paid, recovered FROM async_grant WHERE id = 1").get();

  ok(!!s2.db.prepare("SELECT 1 FROM _migrations WHERE id = 99").get(), "migration 99 applied on the rewound DB");
  ok(grant() && grant().silver === GRANT_SEED - (920 + 740 + 1450), "the grant is seeded at GRANT_SEED and the conversion is PAID OUT OF IT");
  ok(grant().paid === 920 + 740 + 1450, "…and the payout is recorded as `paid`, so the ledger explains the difference");

  ok(coins(surveyor) === 1000 + 920, "an active surveyor's RC lands in their purse AT PAR");
  ok(coins(broke) === 0 + 740, "…so does a broke one's");
  ok(coins(dead) === 50 + 1450, "a dead-but-revivable account keeps its money (only a scrub is forever)");
  ok(coins(noRow) === 77, "an account that never opened a locker is untouched");

  ok(coins(admin) === 500, "THE HOUSE'S 993,430 RC DOES NOT CONVERT — the test lever is not money");
  ok(coins(bot) === 0, "a bot's RC does not convert either");
  ok(coins(scrubbed) === 0, "a scrubbed account gets nothing back — its holdings were burned on purpose");

  ok(rcOf(surveyor) === 0 && rcOf(admin) === 0 && rcOf(bot) === 0 && rcOf(scrubbed) === 0,
     "every rc column is zeroed, so no future reader mistakes a stale balance for money somebody has");

  // THE ONLY MINT IS THE SEED. Everything else is a transfer, which is what
  // lets the drift check show one explainable step across this migration.
  const walletsAfter = s2.db.prepare("SELECT COALESCE(SUM(coins),0) v FROM users").get().v;
  const walletsBefore = 1000 + 0 + 50 + 500 + 0 + 0 + 77;
  ok(walletsAfter + grant().silver - GRANT_SEED === walletsBefore,
     "CONSERVATION: wallets + grant - seed is exactly what the wallets held before (the seed is the one mint)");

  // IDEMPOTENCY: rewind only the migration row and run it again. Nobody is
  // paid twice, because the rc columns are now zero.
  const before = walletsAfter;
  s2.db.prepare("DELETE FROM _migrations WHERE id = 99").run();
  s2.db.exec("DROP TABLE IF EXISTS async_grant");
  s2.close();
  const s3 = new Store(file);
  const after = s3.db.prepare("SELECT COALESCE(SUM(coins),0) v FROM users").get().v;
  ok(after === before, "a second run converts nothing — the rc columns are already zero");
  ok(s3.db.prepare("SELECT silver FROM async_grant WHERE id = 1").get().silver === GRANT_SEED,
     "…and the fresh grant is back at its full seed, having paid nobody");

  // The daily snapshot must carry the term the totals carry, or every payout
  // reads as an unexplained burn forever (the migration-75 vault lesson).
  const cols = s3.db.prepare("PRAGMA table_info(economy_snapshots)").all().map((c) => c.name);
  ok(cols.includes("grant"), "migration 99: economy_snapshots carries the grant column for the drift check");
  const t = s3.economyTotals();
  ok(typeof t.grant === "number" && t.grant === GRANT_SEED, "economyTotals() carries the grant term");
  s3.close();
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log("FAIL: " + f); process.exit(1); }
