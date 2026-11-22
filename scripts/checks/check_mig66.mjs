// MIGRATION 66 — the deleted-account mark, against a database rewound to the
// shape it had before.
//
//   npm run build && node scripts/checks/check_mig66.mjs
//
// Two things can go wrong here and both are quiet. The BACKFILL has to find
// accounts that were scrubbed before the column existed (or Josh's three
// tombstones stay in every picker forever) — and it must not catch a LIVE
// member who merely calls themselves "deleted user", which would hide a real
// account from moderation. There is no name-shaped test that gets both right,
// which is exactly why the column exists.


import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pass = 0;
const fails = [];
const ok = (c, label) => { if (c) { pass++; console.log("  + " + label); } else { fails.push(label); console.log("  x " + label); } };

const dir = mkdtempSync(path.join(tmpdir(), "mig66-"));
const file = path.join(dir, "solace.db");

// ---- a database in the PRE-66 shape ------------------------------------------
{
  const { Store } = await import("file://" + path.resolve("dist/db/store.js").replace(/\\/g, "/"));
  const s = new Store(file);
  s.close();
  const db = new DatabaseSync(file);
  // rewind: drop the column and the migration row
  db.exec("ALTER TABLE users DROP COLUMN deletedAt");
  db.prepare("DELETE FROM _migrations WHERE id = 66").run();

  const mk = (username, displayName, locked, extra = {}) =>
    db.prepare(
      `INSERT INTO users (username, displayName, passwordHash, isAdmin, disabled, locked, createdAt, coins)
       VALUES (?, ?, 'x', 0, ?, ?, ?, 0)`,
    ).run(username, displayName, extra.disabled ?? 0, locked, Date.now());

  mk("deleted-4-abc123", "deleted user", 1);          // a real scrub
  mk("deleted-9-zzz999", "deleted user", 1);          // …and another
  mk("deleted-imposter", "deleted user", 0);          // NOT scrubbed: not sealed
  mk("realmember", "deleted user", 1);                // NOT scrubbed: real handle
  mk("banned_guy", "Banned Guy", 1);                  // sealed, but very much here
  mk("alive", "Alive Person", 0);
  db.close();
}

// ---- run the migration -------------------------------------------------------
const { Store } = await import(
  "file://" + path.resolve("dist/db/store.js").replace(/\\/g, "/") + "?v=2"
);
const store = new Store(file);

const db = new DatabaseSync(file);
const has = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'deletedAt'").get();
ok(has.n === 1, "the column exists after the migration");

const marked = db.prepare("SELECT username FROM users WHERE deletedAt IS NOT NULL ORDER BY username").all().map((r) => r.username);
ok(
  marked.length === 2 && marked[0] === "deleted-4-abc123" && marked[1] === "deleted-9-zzz999",
  `the backfill marks exactly the scrubbed rows (${marked.join(", ") || "none"})`,
);
ok(!marked.includes("deleted-imposter"), "…and not an unsealed account calling itself deleted");
ok(!marked.includes("realmember"), "…nor a sealed member with a real handle");
ok(!marked.includes("banned_guy"), "…nor a banned member");

// ---- the roster drops them ---------------------------------------------------
const roster = store.listUsers().map((u) => u.username);
ok(
  !roster.includes("deleted-4-abc123") && !roster.includes("deleted-9-zzz999"),
  "listUsers no longer returns the tombstones",
);
ok(
  roster.includes("alive") && roster.includes("banned_guy") &&
    roster.includes("deleted-imposter") && roster.includes("realmember"),
  "…while everyone else is still there — INCLUDING the account that only LOOKS deleted",
);
ok(store.listAllUsers().length === roster.length + 2, "listAllUsers still sees them (the ledger needs names)");

// ---- and a fresh scrub marks itself ------------------------------------------
const victim = db.prepare("SELECT id FROM users WHERE username = 'alive'").get();
const res = store.scrubUser(victim.id);
ok(res.ok, "scrubUser runs");
const row = db.prepare("SELECT deletedAt, username, locked FROM users WHERE id = ?").get(victim.id);
ok(typeof row.deletedAt === "number" && row.deletedAt > 0, "…and stamps deletedAt");
ok(row.locked === 1 && row.username.startsWith("deleted-"), "…on top of the usual scrub");
ok(!store.listUsers().some((u) => u.id === victim.id), "…so they leave the roster immediately");
ok(store.listAllUsers().some((u) => u.id === victim.id), "…but the row is still there for old messages");

db.close();
store.close();
rmSync(dir, { recursive: true, force: true });

console.log("");
if (fails.length) {
  console.log(`${fails.length} FAILED`);
  process.exit(1);
}
console.log(`${pass}/${pass} migration-66 asserts passed`);
