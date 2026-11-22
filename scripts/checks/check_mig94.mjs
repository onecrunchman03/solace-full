// MIGRATION 94 — the tier-lookalike retirement, against a DB rewound to the
// pre-94 shape: twelve Emporium items that read as gold / silver / copper /
// rainbow (the VIP Room's metals) vanish, every owner is refunded at the
// FROZEN default price, anything equipped from the set is unequipped, and
// nothing else on the row is touched.

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pass = 0;
const fails = [];
const ok = (c, label) => { if (c) { pass++; console.log("  + " + label); } else { fails.push(label); console.log("  x " + label); } };

const dir = mkdtempSync(path.join(tmpdir(), "mig94-"));
const file = path.join(dir, "solace.db");
const { Store } = await import("file://" + path.resolve("dist/db/store.js").replace(/\\/g, "/"));

{
  const s = new Store(file);
  s.close();
  const db = new DatabaseSync(file);
  db.prepare("DELETE FROM _migrations WHERE id = 94").run(); // rewind
  const now = Date.now();
  const mk = (username, coins, cosmetics) =>
    Number(db.prepare(
      `INSERT INTO users (username, displayName, passwordHash, isAdmin, disabled, locked, createdAt, coins, cosmetics)
       VALUES (?, ?, 'x', 0, 0, 0, ?, ?, ?)`,
    ).run(username, username, now, coins, JSON.stringify(cosmetics)).lastInsertRowid);
  // a collector of the whole gold set, wearing it
  const gilded = mk("gilded", 100, { border: "border-gilded", flair: "flair-gilded", dice: "dice-gold", cardback: "cardback-gilded", title: "title-heir" });
  for (const id of ["border-gilded", "flair-gilded", "dice-gold", "cardback-gilded"])
    db.prepare("INSERT INTO user_items (userId, itemId, at) VALUES (?, ?, ?)").run(gilded, id, now);
  // a prism fan with one retired and one surviving item, wearing the survivor
  const prism = mk("prism", 0, { border: "border-halo", flair: "flair-prism" });
  for (const id of ["flair-prism", "border-halo"])
    db.prepare("INSERT INTO user_items (userId, itemId, at) VALUES (?, ?, ?)").run(prism, id, now);
  // a bystander who owns nothing retired
  const bystander = mk("bystander", 50, { flair: "flair-blood" });
  db.prepare("INSERT INTO user_items (userId, itemId, at) VALUES (?, ?, ?)").run(bystander, "flair-blood", now);
  // an admin price override on a retired item
  db.prepare("INSERT INTO item_prices (itemId, price) VALUES (?, ?)").run("dice-silver", 999);
  // a Room member whose VIP prism items share the "prism" substring, wearing
  // them, with the upload-mirror keys set — none of it is the migration's
  const vip = mk("complete", 10, { border: "border-vip4-prism", flair: "flair-vip4-prism", enterSound: "abc.ogg", board: ["x.ogg"] });
  for (const id of ["border-vip4-prism", "flair-vip4-prism"])
    db.prepare("INSERT INTO user_items (userId, itemId, at) VALUES (?, ?, ?)").run(vip, id, now);
  db.close();

  const s2 = new Store(file); // migration 94 runs here
  const row = (id) => s2.db.prepare("SELECT coins, cosmetics FROM users WHERE id = ?").get(id);
  const items = (id) => s2.db.prepare("SELECT itemId FROM user_items WHERE userId = ? ORDER BY itemId").all(id).map((r) => r.itemId);
  ok(!!s2.db.prepare("SELECT 1 FROM _migrations WHERE id = 94").get(), "migration 94 applied on the rewound DB");
  ok(row(gilded).coins === 100 + 450 + 600 + 500 + 450, "the gold collector is refunded every retired item at its frozen default price (450+600+500+450)");
  ok(items(gilded).length === 0, "…and owns none of them any more");
  const cg = JSON.parse(row(gilded).cosmetics);
  ok(!cg.border && !cg.flair && !cg.dice && !cg.cardback && cg.title === "title-heir", "…the four retired slots are unequipped and the surviving title stays on");
  ok(row(prism).coins === 700 && items(prism).join() === "border-halo", "the prism fan: 700 back, the retired flair gone, the surviving halo kept");
  const cp = JSON.parse(row(prism).cosmetics);
  ok(!cp.flair && cp.border === "border-halo", "…flair unequipped, the halo still worn");
  ok(row(bystander).coins === 50 && items(bystander).join() === "flair-blood" && JSON.parse(row(bystander).cosmetics).flair === "flair-blood", "a bystander with nothing retired is untouched");
  ok(!s2.db.prepare("SELECT 1 FROM item_prices WHERE itemId = 'dice-silver'").get(), "the admin price override on a retired item is dropped");
  const cv = JSON.parse(row(vip).cosmetics);
  ok(row(vip).coins === 10 && items(vip).join() === "border-vip4-prism,flair-vip4-prism" && cv.border === "border-vip4-prism" && cv.flair === "flair-vip4-prism",
    "the Room's prism items survive (the LIKE prefilter matches them; the exact-id gate spares them)");
  ok(cv.enterSound === "abc.ogg" && Array.isArray(cv.board), "…and the upload-mirror keys are untouched");
  // IDEMPOTENCY: rewind the row and run it again — nobody is refunded twice.
  s2.db.prepare("DELETE FROM _migrations WHERE id = 94").run();
  s2.close();
  const s3 = new Store(file);
  const row3 = (id) => s3.db.prepare("SELECT coins FROM users WHERE id = ?").get(id);
  ok(row3(gilded).coins === 100 + 450 + 600 + 500 + 450 && row3(prism).coins === 700, "a second run refunds nothing (the rows were already gone)");
  s3.close();
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
