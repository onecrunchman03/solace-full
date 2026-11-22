// Migration 65 against a database in the OLD shape.
//
// The reason this file exists: migration 65 splits `sessions.createdAt` (which
// the sliding renewal used to overwrite) into a fixed createdAt plus a sliding
// lastSeenAt, and lastSeenAt defaults to 0. If the backfill line were ever
// dropped, every session on the live server would read as "idle since 1970"
// and the entire friend group would be logged out by a deploy — silently, with
// no error anywhere. So the backfill gets its own test.
//
// It works by building a current database, reverting it to the pre-65 shape by
// hand (drop the table, drop the columns, forget the migration ran), and then
// re-opening it through Store so the real migration runs against real old data.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));

const DB = path.join(ROOT, "data", "mig65-harness.db");
const wipe = () => { for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} } };
wipe();

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

// 1. A current database with a user and two sessions in it.
const OLD_CREATED = Date.now() - 3 * 86_400_000; // signed in three days ago
{
  const store = new Store(DB);
  const u = store.createUser({ username: "veteran", passwordHash: "x", displayName: "Veteran", isAdmin: false });
  store.createSession(u.id, "tok-old-one", { ip: "203.0.113.5", ua: "Firefox", network: "203.0.113.0/24" });
  store.createSession(u.id, "tok-old-two");
}

// 2. Rewind it to the pre-65 shape: no ledger, no provenance columns, and a
//    createdAt that the OLD sliding renewal had been overwriting all along.
{
  const db = new DatabaseSync(DB);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DROP TABLE login_events;");
  for (const col of ["lastSeenAt", "ip", "ua", "network"]) {
    db.exec(`ALTER TABLE sessions DROP COLUMN ${col};`);
  }
  db.prepare("UPDATE sessions SET createdAt = ?").run(OLD_CREATED);
  db.exec("DELETE FROM _migrations WHERE id = 65;");
  const cols = db.prepare("PRAGMA table_info(sessions)").all().map((c) => c.name);
  ok(!cols.includes("lastSeenAt"), "staged: the sessions table is back to its pre-65 shape");
  db.close();
}

// 3. Boot the real Store over it — migration 65 runs for real, on old rows.
{
  const store = new Store(DB);
  const db = new DatabaseSync(DB);

  const cols = db.prepare("PRAGMA table_info(sessions)").all().map((c) => c.name);
  for (const col of ["lastSeenAt", "ip", "ua", "network"]) {
    ok(cols.includes(col), `sessions gained ${col}`);
  }
  ok(!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_events'").get(),
    "the login_events ledger was created");

  const rows = db.prepare("SELECT * FROM sessions ORDER BY token").all();
  ok(rows.length === 2, `both existing sessions survived the migration (${rows.length})`);

  // THE ONE THAT MATTERS. A zero here is everybody logged out on deploy day.
  ok(rows.every((r) => r.lastSeenAt === OLD_CREATED),
    `lastSeenAt was backfilled from createdAt, not left at 0 (${rows[0].lastSeenAt})`);
  ok(rows.every((r) => r.createdAt === OLD_CREATED), "createdAt is untouched");

  // And the practical consequence: a three-day-old session still resolves.
  const s = store.getSession("tok-old-one");
  ok(!!s, "an old token still resolves to its session");
  ok(s.lastSeenAt === OLD_CREATED, "…reading back through the Store with the backfilled clock");
  ok(Date.now() - s.lastSeenAt < 30 * 86_400_000,
    "…and is nowhere near the 30-day idle cutoff, so nobody is signed out by the deploy");

  // Provenance is null for pre-65 sessions, which must not break anything.
  ok(rows.every((r) => r.ip === null), "pre-existing sessions have null provenance, as expected");

  // The new path fills it in.
  const u = db.prepare("SELECT id FROM users WHERE username = 'veteran'").get();
  store.createSession(u.id, "tok-new", { ip: "198.51.100.9", ua: "Chrome", network: "198.51.100.0/24" });
  const fresh = store.getSession("tok-new");
  ok(fresh.ip === "198.51.100.9" && fresh.network === "198.51.100.0/24",
    "a session created after the migration records where it came from");
  ok(fresh.createdAt === fresh.lastSeenAt, "…and starts with the two clocks equal");

  // Touching slides lastSeenAt and leaves createdAt alone — the whole point.
  store.touchSession("tok-new");
  const touched = store.getSession("tok-new");
  ok(touched.createdAt === fresh.createdAt, "touchSession does NOT move createdAt any more");
  ok(touched.lastSeenAt >= fresh.lastSeenAt, "…it moves lastSeenAt");

  db.close();
}

console.log(`\n${n - bad}/${n} passed`);
wipe();
process.exit(bad ? 1 : 0);
