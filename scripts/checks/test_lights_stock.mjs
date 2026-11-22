// LIGHTS OUT's STOCK (Nov 2026 validation run): the spare batteries a run
// down there lives on.
//   · a map swap (and so a Test play, which is one) starts the level STOCKED —
//     the spares were laid before the swap cleared its loose items and swept
//     straight back up, so a new map waited four minutes for its first;
//   · a Test play is stocked too, and a battery a tester picks up is carried
//     for the run under a stand-in id — it never becomes a real locker row,
//     and it can still be used.
process.env.BACKROOMS_DIRECTOR ??= "0";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(dist("db/store.js"));
const { createBackrooms } = require(dist("backrooms/service.js"));

const DB = path.join(ROOT, "data", "lights-stock-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const br = createBackrooms(store);
const spares = () => br.activeDrops().filter((d) => d.lvl === 6 && d.kind === "battery");
const mkUser = (u, admin = false) => store.createUser({ username: u, displayName: u, passwordHash: "x", ...(admin ? { isAdmin: true } : {}) });

const boot = spares().length;
ok(boot > 0, `the level boots stocked (${boot} spares)`);

// a plain map swap: the clear takes the old spares, and the new map is stocked
br.swapMap(6, br.sectorL, br.sectorIdOf(6));
const afterSwap = spares().length;
ok(afterSwap === boot, `a map swap starts stocked, not empty (${afterSwap} spares after, ${boot} before)`);

const tester = mkUser("tester", true);
const t = br.beginTest(6, br.sectorL, tester.id);
ok(!("error" in t), `a Test play of Lights Out begins (${t.error ?? t.sectorId})`);
const stock = spares();
ok(stock.length > 0, `…stocked with spare batteries (${stock.length})`);
store.brForceAddItem(tester.id, "suit", "yellow");
store.brForceAddItem(tester.id, "flashlight", null);
const r = br.enter(tester.id, tester.username, 0, store.brLockerItems(tester.id).map((i) => i.id), 6);
ok(!r.error, `the tester walks in (${r.error ?? "in"})`);
const ts = br.sessions.get(tester.id);
const bat = stock[0];
if (ts && bat) {
  ts.x = bat.x;
  ts.y = bat.y;
  const rows = store.brLockerItems(tester.id).length;
  const got = br.takeDrop(tester.id, bat.id);
  ok(!("error" in got) && got.item.kind === "battery", `the tester picks one up (${got.error ?? got.item.kind})`);
  ok(store.brLockerItems(tester.id).length === rows, `…and it never becomes a real locker row (${store.brLockerItems(tester.id).length} rows, ${rows} before)`);
  const used = "error" in got ? { error: "none" } : br.consumeItem(tester.id, got.item.id);
  ok(!("error" in used), `…and it can still be used on the run (${used.error ?? "used"})`);
} else ok(false, "(staging) a tester inside and a battery to take");
br.forfeit(tester.id);
const end = br.endTest(6);
ok(!("error" in end), "the test ends and the live map plays again");

console.log(`\n${n - bad}/${n} asserts passed`);
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
