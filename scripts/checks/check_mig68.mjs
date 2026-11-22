// MIGRATION 68 — the Wake and the Inheritance, against a database rewound to
// the shape it had before.
//
//   npm run build && node scripts/checks/check_mig68.mjs
//
// One property here is load-bearing enough to deserve its own harness: EVERY
// GRAVE THAT ALREADY EXISTS MUST STAY SEALED. Those accounts died under the
// old rules, where killUser handed the will beneficiary the whole estate on
// the spot. If the migration gave them a 48-hour window, they could be raised
// or reborn — and the estate would be paid out a SECOND time, minting silver
// and duplicating emoji that are already in somebody else's inventory.
//
// The protection is that `graveSealsAt` has no backfill and defaults to NULL,
// which every code path reads as "sealed". That is easy to "fix" by mistake
// later, so it is asserted here rather than only described in a comment.


import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pass = 0;
const fails = [];
const ok = (c, label) => { if (c) { pass++; console.log("  + " + label); } else { fails.push(label); console.log("  x " + label); } };

const dir = mkdtempSync(path.join(tmpdir(), "mig68-"));
const file = path.join(dir, "solace.db");
const storeUrl = "file://" + path.resolve("dist/db/store.js").replace(/\\/g, "/");

let deadId, aliveId, heirId;

// ---- a database in the PRE-68 shape ------------------------------------------
{
  const { Store } = await import(storeUrl);
  const s = new Store(file);
  s.close();
  const db = new DatabaseSync(file);
  db.exec("ALTER TABLE users DROP COLUMN generation");
  db.exec("ALTER TABLE users DROP COLUMN graveSealsAt");
  db.exec("DROP TABLE lives");
  db.exec("DROP TABLE revivals");
  // Migration 76 ALTERs tables that 68 CREATES (lives.deathCause/eulogies),
  // so a 68 rewind must un-stamp 76 and strip its additions too — otherwise
  // the replay recreates `lives` in its 68 shape while 76 stays marked
  // applied, a mongrel schema no real database can reach.
  db.exec("ALTER TABLE users DROP COLUMN deathCause");
  db.exec("DROP TABLE grave_tributes");
  db.exec("DROP TABLE grave_eulogies");
  db.prepare("DELETE FROM _migrations WHERE id IN (68, 76)").run();

  const mk = (username, disabled, diedAt) =>
    db.prepare(
      `INSERT INTO users (username, displayName, passwordHash, isAdmin, disabled, locked, createdAt, coins, diedAt)
       VALUES (?, ?, 'x', 0, ?, 0, ?, 500, ?)`,
    ).run(username, username, disabled, Date.now() - 90 * 86_400_000, diedAt);

  mk("longgone", 1, Date.now() - 30 * 86_400_000); // died weeks ago, estate long spent
  mk("stillhere", 0, null);
  mk("theheir", 0, null);
  deadId = db.prepare("SELECT id FROM users WHERE username = 'longgone'").get().id;
  aliveId = db.prepare("SELECT id FROM users WHERE username = 'stillhere'").get().id;
  heirId = db.prepare("SELECT id FROM users WHERE username = 'theheir'").get().id;

  ok(
    !db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "graveSealsAt"),
    "the rewound database really is missing the new column",
  );
  db.close();
}

// ---- run the migration --------------------------------------------------------
{
  const { Store } = await import(storeUrl);
  const store = new Store(file);

  const dead = store.getUserById(deadId);
  const alive = store.getUserById(aliveId);

  ok(alive.generation === 1, "everybody alive starts at generation 1");
  ok(dead.generation === 1, "…and so does the account already in the ground");
  ok(alive.graveSealsAt === null, "a living account has no grave deadline");

  // THE PROPERTY THIS FILE EXISTS FOR.
  ok(dead.graveSealsAt === null, "AN EXISTING GRAVE GETS NO DEADLINE — it stays sealed");
  ok(!store.graveFresh(deadId), "…so it does not read as fresh");
  ok(!store.dueGraves().includes(deadId), "…is never picked up by the sweep");
  ok(store.sealGrave(deadId).sealed === false, "…cannot be sealed into a rebirth");
  ok(store.raiseFromGrave(deadId, aliveId, "silver").error === "grave_sealed",
    "…and cannot be raised, so no estate is ever paid twice");
  ok(store.getUserById(deadId).disabled === true, "the old grave is exactly as it was");
  ok(store.getCoins(aliveId) === 500, "…and the attempted rescue charged nobody");

  // A NEW death, after the migration, gets the full window.
  store.setLegacy(aliveId, { willBeneficiaryId: heirId });
  store.killUser(aliveId);
  const fresh = store.getUserById(aliveId);
  ok(fresh.graveSealsAt > Date.now(), "a death AFTER the migration opens a real window");
  ok(store.graveFresh(aliveId), "…and reads as fresh");
  ok(store.getCoins(aliveId) === 500, "…with the estate still in the dead player's hands");
  ok(store.getCoins(heirId) === 500, "…and nothing yet handed to the heir");

  // The new tables exist and are empty.
  ok(store.lives().length === 0, "no monuments until a grave actually seals");
  store.close?.();
}

rmSync(dir, { recursive: true, force: true });
console.log(`\nmigration 68: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL  " + f);
process.exit(fails.length ? 1 : 0);
