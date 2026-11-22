// THE WAL CHECKPOINT RUNS OFF THE EVENT LOOP (src/db/checkpointer.ts, Oct 2026).
// SQLite's automatic checkpoint ran inside whichever commit crossed 1,000 WAL
// pages and held the server ~0.4s every five minutes on prod. This pins the
// replacement: the worker really checkpoints (the WAL's frames get copied
// back), the main connection's auto-checkpoint is off ONLY while a worker is
// running passes, and a dead worker hands the job straight back to SQLite —
// a WAL nobody checkpoints grows without limit.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, statSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { startCheckpointer, AUTO_CHECKPOINT_PAGES } = require(path.join(ROOT, "dist", "db", "checkpointer.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(25); } return pred(); };

const DB = path.join(ROOT, "data", "checkpointer-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
const store = new Store(DB);

console.log("-- a store on its own checkpoints the old way");
ok(store.autoCheckpoint() === AUTO_CHECKPOINT_PAGES, `auto-checkpoint at ${AUTO_CHECKPOINT_PAGES} pages without a worker (${store.autoCheckpoint()})`);

console.log("-- the worker takes the job");
const cp = startCheckpointer(store, DB, 200);
ok(await until(() => cp.stats.passes > 0), `the worker ran a pass (${cp.stats.passes})`);
ok(store.autoCheckpoint() === 0, `…and only then the main connection stopped checkpointing (${store.autoCheckpoint()})`);

// Fill the WAL well past the old threshold. With auto-checkpoint off, only
// the worker can bring it back.
store.transaction(() => {
  for (let i = 0; i < 9000; i++) store.kvSet(`cp-harness-${i}`, "x".repeat(600));
});
const walAfterWrite = statSync(DB + "-wal").size;
ok(walAfterWrite > 1000 * 4096, `the write left more than the old 1,000-page threshold in the WAL (${Math.round(walAfterWrite / 4096)} pages)`);
const before = cp.stats.passes;
ok(await until(() => cp.stats.passes > before + 1 && cp.stats.lastLog > 0 && cp.stats.lastDone === cp.stats.lastLog), `the worker copied every frame back (${cp.stats.lastDone} of ${cp.stats.lastLog})`);
ok(cp.stats.failures === 0, `no failed passes (${cp.stats.failures})`);

console.log("-- a worker that dies hands it straight back");
cp.kill(); // a crash, not stop(): the exit handler is what must react
ok(await until(() => store.autoCheckpoint() === AUTO_CHECKPOINT_PAGES), `a dead worker hands checkpointing back to SQLite (${store.autoCheckpoint()})`);
cp.stop();
const after = cp.stats.passes;
await sleep(600);
ok(cp.stats.passes === after, "and no pass runs once it is stopped");
ok(store.autoCheckpoint() === AUTO_CHECKPOINT_PAGES, "stopping leaves SQLite checkpointing");

console.log("-- a worker that cannot open the database never takes the job");
const broken = startCheckpointer(store, path.join(ROOT, "data", "no-such-dir", "nope", "x.db"), 200);
await sleep(1500);
ok(store.autoCheckpoint() === AUTO_CHECKPOINT_PAGES, `auto-checkpoint stays on when the worker fails (${store.autoCheckpoint()})`);
broken.stop();

store.close?.();
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
